import assert from 'node:assert/strict';

import {
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SILLYTAVERN_BASE_URL,
  authenticateSillyTavernUser,
  errorSummary,
  launchPlaywrightBrowser,
  normalizeBaseUrl,
  normalizeExtensionPath
} from './lib/sillytavern-live-harness.mjs';

const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || DEFAULT_SILLYTAVERN_BASE_URL);
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const SILLYTAVERN_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const BROWSER_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SAVE_AS_BROWSER_TIMEOUT_MS, 30000);
const PACKAGE_ID = String(
  process.env.DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID
  || 'directive:campaign-package:breckenridge-ashes-of-peace'
).trim();
const PLAYER_NAME = String(process.env.DIRECTIVE_SILLYTAVERN_PLAYER_NAME || 'Save Branch Smoke').trim() || 'Save Branch Smoke';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUserHandle(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function envPasswordKey(handle) {
  const suffix = String(handle || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return suffix ? `DIRECTIVE_SOAK_ST_PASSWORD_${suffix}` : null;
}

function configuredUserPassword(handle) {
  const key = envPasswordKey(handle);
  return process.env.DIRECTIVE_SILLYTAVERN_PASSWORD
    || process.env.DIRECTIVE_SOAK_ST_PASSWORD
    || (key ? process.env[key] : '')
    || '';
}

function cookieHeaderToPlaywrightCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator <= 0) return null;
      return {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        url: BASE_URL
      };
    })
    .filter(Boolean);
}

function bridgeModulePath() {
  return `${EXTENSION_PATH}/src/hosts/sillytavern/runtime-bridge.mjs`;
}

function compact(value, maxLength = 1200) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function assertLive(condition, message, details = null) {
  if (condition) return;
  const error = new Error(details ? `${message}: ${compact(details, 1000)}` : message);
  if (details) error.details = details;
  throw error;
}

async function createAuthenticatedPage(browser) {
  if (!SILLYTAVERN_USER) {
    return {
      page: await browser.newPage(),
      context: null,
      auth: null
    };
  }

  const auth = await authenticateSillyTavernUser({
    baseUrl: BASE_URL,
    handle: SILLYTAVERN_USER,
    password: configuredUserPassword(SILLYTAVERN_USER),
    timeoutMs: BROWSER_TIMEOUT_MS
  });
  assertLive(auth.ok, `Could not authenticate SillyTavern user ${SILLYTAVERN_USER}.`, auth);

  const cookies = cookieHeaderToPlaywrightCookies(auth.headers?.Cookie || auth.headers?.cookie || '');
  assertLive(cookies.length > 0, `SillyTavern user ${SILLYTAVERN_USER} authentication did not return a session cookie.`, auth);

  const context = await browser.newContext();
  await context.addCookies(cookies);
  return {
    page: await context.newPage(),
    context,
    auth
  };
}

async function verifyBrowserUserSession(page) {
  if (!SILLYTAVERN_USER) return null;
  const session = await page.evaluate(async () => {
    const response = await fetch('/api/users/me');
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      json,
      text
    };
  });
  assertLive(
    session.ok && session.json?.handle === SILLYTAVERN_USER,
    `Browser session is not authenticated as ${SILLYTAVERN_USER}.`,
    session
  );
  return {
    handle: session.json.handle,
    name: session.json.name || null
  };
}

async function waitForRuntimeBridge(page) {
  const started = Date.now();
  let lastStatus = null;
  while (Date.now() - started < BROWSER_TIMEOUT_MS) {
    lastStatus = await page.evaluate(async (modulePath) => {
      const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
      try {
        const mod = await import(modulePath);
        const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
        const host = bridge.host || null;
        const app = bridge.runtimeApp || null;
        return {
          ok: Boolean(app && host?.chat),
          enabled: bridge.enabled !== false,
          hasRuntimeApp: Boolean(app),
          hasHost: Boolean(host),
          chatCapabilities: clone(host?.capabilities?.chat || null),
          hasCloneMethod: typeof host?.chat?.cloneCurrentChatForSaveBranch === 'function',
          hasSaveAsMethod: typeof app?.saveCurrentGameAs === 'function'
        };
      } catch (error) {
        return {
          ok: false,
          error: error?.message || String(error)
        };
      }
    }, bridgeModulePath());
    if (lastStatus?.ok && lastStatus.hasCloneMethod && lastStatus.hasSaveAsMethod) return lastStatus;
    await page.waitForTimeout(250);
  }
  throw new Error(`Directive runtime bridge was not ready for Save Game As smoke. Last status: ${compact(lastStatus)}`);
}

async function createLiveCampaign(page) {
  return page.evaluate(async ({
    modulePath,
    packageIdOverride,
    playerName
  }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    if (!app || !host?.chat) {
      return {
        skipped: true,
        reason: 'The served Directive runtime app or SillyTavern chat adapter was not available.'
      };
    }

    const initialView = await app.getCurrentView({ tabId: 'campaign' });
    const availablePackages = Array.isArray(initialView?.campaign?.packages)
      ? initialView.campaign.packages
      : [];
    const packageRecord = packageIdOverride
      ? availablePackages.find((entry) => (
        [
          entry?.packageId,
          entry?.id,
          entry?.manifestId,
          entry?.manifest?.id,
          entry?.slug,
          entry?.manifest?.slug
        ].map((value) => String(value || '').trim()).includes(packageIdOverride)
      ))
      : null;
    if (packageIdOverride && !packageRecord) {
      return {
        skipped: true,
        reason: `Directive did not expose requested campaign package "${packageIdOverride}" for live campaign creation.`,
        availablePackageIds: availablePackages.map((entry) => entry?.packageId || entry?.id || entry?.manifestId || entry?.manifest?.id).filter(Boolean)
      };
    }

    const packageId = packageRecord?.packageId
      || packageRecord?.id
      || packageRecord?.manifestId
      || packageRecord?.manifest?.id
      || initialView?.activePackageId
      || initialView?.campaign?.activePackageId
      || availablePackages.find?.((entry) => entry?.actions?.startNewCampaign)?.packageId
      || availablePackages.find?.((entry) => entry?.actions?.startNewCampaign)?.id
      || availablePackages[0]?.packageId
      || availablePackages[0]?.id
      || null;
    if (!packageId) {
      return {
        skipped: true,
        reason: 'Directive did not expose an active bundled campaign package for live campaign creation.'
      };
    }

    const creatorDraft = await app.startCreatorDraft({ packageId });
    const creatorView = creatorDraft?.creator || creatorDraft;
    const creatorOptions = creatorView?.options || {};
    const creatorDossier = creatorView?.dossier || {};
    const shipName = creatorView?.ship?.name
      || packageRecord?.ship?.name
      || packageRecord?.shipName
      || 'the assigned starship';
    const optionId = (source, preferred = []) => {
      const entries = Array.isArray(source) ? source : (Array.isArray(source?.options) ? source.options : []);
      const entryId = (entry) => typeof entry === 'string'
        ? entry
        : String(entry?.id || '');
      const preferredMatch = preferred
        .map((id) => entries.find((entry) => entryId(entry) === id))
        .find(Boolean);
      return entryId(preferredMatch) || entryId(entries.find((entry) => entryId(entry))) || '';
    };
    const traitId = (categoryId, preferred = []) => {
      const categories = Array.isArray(creatorOptions.traitCategories)
        ? creatorOptions.traitCategories
        : [];
      const category = categories.find((entry) => entry?.id === categoryId)
        || categories.find((entry) => String(entry?.id || '').toLowerCase().includes(categoryId))
        || null;
      return optionId(category?.options || [], preferred);
    };
    const selectedCreatorIds = {
      speciesId: optionId(creatorOptions.allowedSpecies, ['human']),
      ageBandId: optionId(creatorOptions.ageBands, ['mid-career', 'typical-command-age', 'established-command-track']),
      careerBackgroundId: optionId(creatorOptions.careerBackgrounds, ['tactical-security', 'security-escort', 'line-officer-generalist']),
      formativeExperienceId: optionId(creatorOptions.formativeExperiences, ['dominion-war-fleet-service', 'dominion-war-convoy', 'frontier-autonomy']),
      assignmentReasonId: optionId(creatorOptions.assignmentReasons, ['experienced-outsider-transfer', 'command-succession', 'frontier-command']),
      traits: {
        insight: traitId('insight', ['perceptive', 'analytical', 'observant']),
        connection: traitId('connection', ['candid', 'steady', 'empathetic']),
        execution: traitId('execution', ['decisive', 'measured', 'bold'])
      },
      flawId: optionId(creatorOptions.flaws, ['impatient', 'overextends', 'guarded'])
    };
    const missingCreatorIds = Object.entries({
      speciesId: selectedCreatorIds.speciesId,
      ageBandId: selectedCreatorIds.ageBandId,
      careerBackgroundId: selectedCreatorIds.careerBackgroundId,
      formativeExperienceId: selectedCreatorIds.formativeExperienceId,
      assignmentReasonId: selectedCreatorIds.assignmentReasonId,
      insightTrait: selectedCreatorIds.traits.insight,
      connectionTrait: selectedCreatorIds.traits.connection,
      executionTrait: selectedCreatorIds.traits.execution,
      flawId: selectedCreatorIds.flawId
    }).filter(([, value]) => !value).map(([key]) => key);
    if (missingCreatorIds.length > 0) {
      return {
        skipped: true,
        reason: `Selected campaign package "${packageId}" did not expose required creator option ids: ${missingCreatorIds.join(', ')}.`,
        packageId,
        creatorOptionKeys: Object.keys(creatorOptions)
      };
    }

    const dossierDetailLevel = optionId(creatorDossier.detailLevels, [
      creatorDossier.defaultDetailLevel,
      'Standard',
      'standard',
      'concise'
    ]) || creatorDossier.defaultDetailLevel || 'Standard';
    await app.saveCreatorDraft({
      reason: 'liveSaveGameAsBranchSmoke',
      patch: {
        activeStep: 'review',
        input: {
          identity: {
            name: playerName,
            pronounsOrAddress: 'they/them',
            speciesId: selectedCreatorIds.speciesId,
            ageBandId: selectedCreatorIds.ageBandId,
            appearance: 'A composed Starfleet commander with a direct command style.'
          },
          service: {
            careerBackgroundId: selectedCreatorIds.careerBackgroundId,
            formativeExperienceId: selectedCreatorIds.formativeExperienceId,
            assignmentReasonId: selectedCreatorIds.assignmentReasonId
          },
          personality: {
            traits: selectedCreatorIds.traits,
            flawId: selectedCreatorIds.flawId
          },
          dossier: {
            detailLevel: dossierDetailLevel,
            briefBiography: `${playerName} is a Starfleet commander assigned aboard ${shipName}.`,
            publicReputation: `${playerName} is known for steady judgment and clean operational handoffs.`
          },
          settings: {
            simulationMode: 'Command'
          }
        }
      }
    });

    const startedView = await app.acceptCreatorDraftAndStartCampaign({ simulationMode: 'Command' });
    const openResult = await app.openCampaignChat();
    const view = await app.getCurrentView({ tabId: 'mission' });
    return {
      skipped: false,
      packageId,
      openCampaignChat: clone(openResult),
      campaign: clone({
        id: view?.campaignState?.campaign?.id || startedView?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || startedView?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || startedView?.campaignState?.campaign?.status || null
      }),
      binding: clone(view?.chatNative?.binding || null),
      activation: clone(view?.chatNative?.activation || null)
    };
  }, {
    modulePath: bridgeModulePath(),
    packageIdOverride: PACKAGE_ID,
    playerName: PLAYER_NAME
  });
}

async function runSaveAsBranchProof(page) {
  const marker = `DIRECTIVE_SAVE_AS_BRANCH_SMOKE_${Date.now()}`;
  return page.evaluate(async ({ modulePath, marker }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    const currentChatId = (context, host) => (
      host?.chat?.getCurrentChatId?.()
      || context?.chatId
      || context?.chat_id
      || null
    );
    const readBinding = async (app, host, context) => {
      const view = app?.getCurrentView
        ? await app.getCurrentView({ tabId: 'mission' })
        : null;
      return {
        view: clone(view),
        binding: clone(view?.campaignState?.campaignChatBinding || view?.chatNative?.binding || null),
        hostBinding: clone(host?.chat?.getBindingMetadata?.() || context?.chatMetadata?.directiveCampaignBinding || null),
        chatId: currentChatId(context, host),
        chatLength: Array.isArray(context?.chat) ? context.chat.length : null,
        markerPresent: Array.isArray(context?.chat) ? context.chat.some((message) => messageText(message).includes(marker)) : false
      };
    };

    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    const context = globalThis.SillyTavern?.getContext?.() || null;
    if (!app || !host?.chat || !context) {
      return {
        ok: false,
        reason: 'runtime-or-context-unavailable',
        hasApp: Boolean(app),
        hasHostChat: Boolean(host?.chat),
        hasContext: Boolean(context)
      };
    }
    if (typeof host.chat.cloneCurrentChatForSaveBranch !== 'function') {
      return {
        ok: false,
        reason: 'cloneCurrentChatForSaveBranch-unavailable',
        chatCapabilities: clone(host.capabilities?.chat || null)
      };
    }

    const sourceBefore = await readBinding(app, host, context);
    if (!sourceBefore.binding?.saveId || !sourceBefore.binding?.chatId) {
      return {
        ok: false,
        reason: 'source-binding-incomplete',
        sourceBefore
      };
    }

    context.chat.push({
      name: context.name1 || 'Save Branch Smoke',
      is_user: true,
      is_system: false,
      send_date: new Date().toISOString(),
      mes: `Save Game As live branch marker: ${marker}`,
      extra: {
        directiveSaveGameAsSmoke: {
          marker,
          insertedAt: new Date().toISOString()
        }
      }
    });
    if (typeof context.addOneMessage === 'function') {
      try {
        await context.addOneMessage(context.chat.at(-1), { scroll: false });
      } catch {
        await context.addOneMessage(context.chat.at(-1));
      }
    } else if (typeof globalThis.addOneMessage === 'function') {
      await globalThis.addOneMessage(context.chat.at(-1));
    }
    const saveChat = context.saveChat || context.saveChatConditional || globalThis.saveChat;
    if (typeof saveChat === 'function') await saveChat.call(context);

    const sourceAfterMarker = await readBinding(app, host, context);
    const sourceSave = await app.saveCurrentGame({ summary: 'Save Game As live smoke source checkpoint.' });
    const branchName = `Save Game As Branch Smoke ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const saveAsResult = await app.saveCurrentGameAs({ name: branchName });
    const branchAfterSaveAs = await readBinding(app, host, context);
    const exportedBranch = app.exportActiveSave ? await app.exportActiveSave() : null;

    const sourceSaveId = sourceBefore.binding.saveId;
    const sourceChatId = sourceBefore.binding.chatId;
    const branchSaveId = saveAsResult?.save?.id
      || saveAsResult?.branchSave?.id
      || branchAfterSaveAs.binding?.saveId
      || null;
    const branchChatId = saveAsResult?.branchChat?.chatId
      || branchAfterSaveAs.binding?.chatId
      || null;

    let reloadedSource = null;
    if (sourceSaveId) {
      const sourceLoadView = await app.loadGame({ saveId: sourceSaveId });
      const sourceOpenResult = await app.openCampaignChat({ saveId: sourceSaveId });
      reloadedSource = {
        load: clone(sourceLoadView),
        open: clone(sourceOpenResult),
        state: await readBinding(app, host, context)
      };
    }

    let reloadedBranch = null;
    if (branchSaveId) {
      const branchLoadView = await app.loadGame({ saveId: branchSaveId });
      const branchOpenResult = await app.openCampaignChat({ saveId: branchSaveId });
      reloadedBranch = {
        load: clone(branchLoadView),
        open: clone(branchOpenResult),
        state: await readBinding(app, host, context)
      };
    }

    return {
      ok: true,
      marker,
      branchName,
      source: {
        saveId: sourceSaveId,
        chatId: sourceChatId,
        before: sourceBefore,
        afterMarker: sourceAfterMarker,
        save: clone(sourceSave)
      },
      saveAs: {
        ok: saveAsResult?.ok === true,
        saveId: branchSaveId,
        chatId: branchChatId,
        branchChat: clone(saveAsResult?.branchChat || null),
        resultKeys: saveAsResult && typeof saveAsResult === 'object' ? Object.keys(saveAsResult) : []
      },
      branch: {
        afterSaveAs: branchAfterSaveAs,
        exported: clone(exportedBranch || null)
      },
      reloadedSource,
      reloadedBranch
    };
  }, {
    modulePath: bridgeModulePath(),
    marker
  });
}

function assertSaveAsProof(proof) {
  const exportedBranchState = proof.branch?.exported?.campaignState
    || proof.branch?.exported?.saveRecord?.payload?.campaignState
    || proof.branch?.exported?.save?.payload?.campaignState
    || null;
  assertLive(proof?.ok === true, proof?.reason || 'Save Game As live proof failed.', proof);
  assertLive(proof.source?.saveId, 'Source save id was not captured.', proof);
  assertLive(proof.source?.chatId, 'Source chat id was not captured.', proof);
  assertLive(proof.source?.afterMarker?.markerPresent === true, 'Source chat did not contain the marker before branching.', proof.source);
  assertLive(proof.saveAs?.ok === true, 'saveCurrentGameAs did not report success.', proof.saveAs);
  assertLive(proof.saveAs?.saveId && proof.saveAs.saveId !== proof.source.saveId, 'Save Game As did not create a distinct save id.', proof.saveAs);
  assertLive(proof.saveAs?.chatId && proof.saveAs.chatId !== proof.source.chatId, 'Save Game As did not create a distinct chat id.', proof.saveAs);
  assertLive(proof.saveAs?.branchChat?.sourceChatId === proof.source.chatId, 'Save Game As did not report the source chat id.', proof.saveAs);
  assertLive(proof.saveAs?.branchChat?.chatId === proof.saveAs.chatId, 'Save Game As branch chat result does not match the active branch chat id.', proof.saveAs);
  assertLive(proof.branch?.afterSaveAs?.binding?.saveId === proof.saveAs.saveId, 'Active campaign binding did not retarget to the branch save after Save Game As.', proof.branch);
  assertLive(proof.branch?.afterSaveAs?.binding?.chatId === proof.saveAs.chatId, 'Active campaign binding did not retarget to the cloned chat after Save Game As.', proof.branch);
  assertLive(proof.branch?.afterSaveAs?.hostBinding?.saveId === proof.saveAs.saveId, 'Active SillyTavern chat metadata did not store the branch save id.', proof.branch);
  assertLive(proof.branch?.afterSaveAs?.hostBinding?.chatId === proof.saveAs.chatId, 'Active SillyTavern chat metadata did not store the branch chat id.', proof.branch);
  assertLive(proof.branch?.afterSaveAs?.markerPresent === true, 'Cloned branch chat did not preserve the source chat marker.', proof.branch);
  assertLive(
    exportedBranchState?.campaignChatBinding?.saveId === proof.saveAs.saveId
    && exportedBranchState?.campaignChatBinding?.chatId === proof.saveAs.chatId,
    'Exported branch save payload does not point at the cloned chat.',
    {
      exportedSaveId: proof.branch?.exported?.saveId || null,
      exportedStateBinding: exportedBranchState?.campaignChatBinding || null,
      expectedSaveId: proof.saveAs.saveId,
      expectedChatId: proof.saveAs.chatId
    }
  );
  assertLive(proof.reloadedSource?.state?.binding?.saveId === proof.source.saveId, 'Loading the source save did not restore the source save binding.', proof.reloadedSource);
  assertLive(proof.reloadedSource?.state?.binding?.chatId === proof.source.chatId, 'Loading the source save did not restore the source chat.', proof.reloadedSource);
  assertLive(proof.reloadedSource?.state?.markerPresent === true, 'Reloaded source chat lost the marker.', proof.reloadedSource);
  assertLive(proof.reloadedBranch?.state?.binding?.saveId === proof.saveAs.saveId, 'Loading the branch save did not restore the branch save binding.', proof.reloadedBranch);
  assertLive(proof.reloadedBranch?.state?.binding?.chatId === proof.saveAs.chatId, 'Loading the branch save did not restore the cloned branch chat.', proof.reloadedBranch);
  assertLive(proof.reloadedBranch?.state?.markerPresent === true, 'Reloaded branch chat lost the cloned marker.', proof.reloadedBranch);
}

async function main() {
  assert.ok(BASE_URL, 'SILLYTAVERN_BASE_URL or ST_BASE_URL is required.');
  const launched = await launchPlaywrightBrowser({
    headless: HEADLESS,
    timeoutMs: BROWSER_TIMEOUT_MS
  });
  assertLive(launched.ok, 'Playwright Chromium could not be launched.', launched.error || launched);

  const browser = launched.browser;
  let context = null;
  try {
    const authPage = await createAuthenticatedPage(browser);
    const page = authPage.page;
    context = authPage.context;
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const browserUser = await verifyBrowserUserSession(page);
    const bridge = await waitForRuntimeBridge(page);
    const created = await createLiveCampaign(page);
    assertLive(!created.skipped, created.reason || 'Live campaign creation was skipped.', created);
    assertLive(created.binding?.saveId, 'Created campaign did not bind a Directive save.', created);
    assertLive(created.binding?.chatId, 'Created campaign did not bind a SillyTavern chat.', created);

    const proof = await runSaveAsBranchProof(page);
    assertSaveAsProof(proof);

    const report = {
      ok: true,
      baseUrl: BASE_URL,
      user: SILLYTAVERN_USER || null,
      browserUser,
      extensionPath: EXTENSION_PATH,
      bridge,
      campaign: created.campaign,
      source: {
        saveId: proof.source.saveId,
        chatId: proof.source.chatId,
        chatLength: proof.source.afterMarker.chatLength
      },
      branch: {
        saveId: proof.saveAs.saveId,
        chatId: proof.saveAs.chatId,
        sourceChatId: proof.saveAs.branchChat.sourceChatId,
        messageCount: proof.saveAs.branchChat.messageCount,
        reloadedSourceChatId: proof.reloadedSource.state.chatId,
        reloadedBranchChatId: proof.reloadedBranch.state.chatId
      }
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    baseUrl: BASE_URL,
    user: SILLYTAVERN_USER || null,
    extensionPath: EXTENSION_PATH,
    error: errorSummary(error)
  }, null, 2));
  process.exit(1);
}
