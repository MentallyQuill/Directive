import assert from 'node:assert/strict';

import {
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SILLYTAVERN_BASE_URL,
  authenticateSillyTavernUser,
  compareServedExtension,
  launchPlaywrightBrowser,
  normalizeBaseUrl,
  normalizeExtensionPath,
  sendSillyTavernChatMessage
} from './lib/sillytavern-live-harness.mjs';

const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || DEFAULT_SILLYTAVERN_BASE_URL);
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const SILLYTAVERN_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const BROWSER_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SCENE_HANDSHAKE_BROWSER_TIMEOUT_MS, 30000);
const SETTLEMENT_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SCENE_HANDSHAKE_SETTLEMENT_TIMEOUT_MS, 240000);
const PACKAGE_ID = String(
  process.env.DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID
  || 'directive:campaign-package:breckenridge-ashes-of-peace'
).trim();
const PLAYER_NAME = String(process.env.DIRECTIVE_SILLYTAVERN_PLAYER_NAME || 'Sam Vickers').trim() || 'Sam Vickers';

const WHITAKER_BRIEFING = [
  'Whitaker considered the question for a moment, then gave a small shake of her head.',
  '"Nothing that is going to bite us in the next twelve hours. We are ten days out from the Reach at current speed. That is your window."',
  '"Three things I would put in front of you, in whatever order you choose. First, Commander Cross has been wrestling with that command-network handoff issue since the yard certified us. Get down to Engineering and let her walk you through it."',
  '"Second, meet Bronn. Today, if you can manage it without it looking like I am marching you down there. He is on alpha shift. Use your judgment on how to approach it."',
  '"Third, walk the ship. Talk to the department heads, get a feel for what the refit broke that the yard did not catch. Sato in Medical had her surgical bay pulled apart and reinstalled twice. Saye in Science has been quiet about his sensor array calibration. Find out which."'
].join('\n\n');

const SAM_ACCEPTANCE = 'Understood, Captain. I will start with Commander Cross in Engineering, meet Bronn on alpha shift, and walk the ship to check with Sato, Saye, and the department heads before we reach the Reach.';

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

function compact(value, max = 1000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3))}...`;
}

function assertLive(condition, message, details = null) {
  if (condition) return;
  const error = new Error(details ? `${message}: ${compact(details, 800)}` : message);
  if (details) error.details = details;
  throw error;
}

async function waitForCondition(page, condition, {
  timeoutMs = BROWSER_TIMEOUT_MS,
  pollingMs = 500,
  label = 'browser condition'
} = {}) {
  const started = Date.now();
  let lastValue = null;
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      lastValue = await condition();
      lastError = null;
      if (lastValue) return lastValue;
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(Math.min(pollingMs, Math.max(0, timeoutMs - (Date.now() - started))));
  }
  const error = new Error(`Timed out waiting for ${label} after ${timeoutMs}ms.`);
  error.details = {
    timeoutMs,
    lastValue,
    lastError: lastError ? {
      name: lastError.name || 'Error',
      message: lastError.message || String(lastError)
    } : null
  };
  throw error;
}

async function createAuthenticatedPage(browser) {
  if (!SILLYTAVERN_USER) {
    return {
      page: await browser.newPage(),
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
  return session.json;
}

async function openDirectivePanel(page) {
  await page.waitForFunction(() => {
    if (typeof globalThis.Directive?.bridge?.showRuntime === 'function') return true;
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') return true;
    if (typeof globalThis.Directive?.actions?.run === 'function') return true;
    return Boolean(document.getElementById('directive-extensions-menu-button'));
  }, null, { timeout: BROWSER_TIMEOUT_MS });

  const openedWith = await page.evaluate(async () => {
    if (typeof globalThis.Directive?.bridge?.showRuntime === 'function') {
      await globalThis.Directive.bridge.showRuntime();
      return 'Directive.bridge.showRuntime';
    }
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') {
      await globalThis.Directive.bridge.runAction('runtime.open');
      return 'Directive.bridge.runAction(runtime.open)';
    }
    if (typeof globalThis.Directive?.actions?.run === 'function') {
      await globalThis.Directive.actions.run('runtime.open');
      return 'Directive.actions.run(runtime.open)';
    }
    const button = document.getElementById('directive-extensions-menu-button');
    button?.click();
    return button ? 'extensions-menu' : '';
  });
  assertLive(openedWith, 'Directive bridge or menu launcher was not found.');

  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    return Boolean(
      panel
      && panel.hidden !== true
      && panel.querySelector('[data-directive-runtime-body="true"]')
    );
  }, null, { timeout: BROWSER_TIMEOUT_MS });
  return openedWith;
}

async function navigateDirectiveRoute(page, routeId) {
  await page.evaluate(async (nextRouteId) => {
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') {
      await globalThis.Directive.bridge.runAction('runtime.setTab', { tabId: nextRouteId });
      return;
    }
    if (typeof globalThis.Directive?.actions?.run === 'function') {
      await globalThis.Directive.actions.run('runtime.setTab', { tabId: nextRouteId });
      return;
    }
    const button = document.querySelector(`[data-route-id="${nextRouteId}"]`);
    button?.click();
  }, routeId);
  await page.waitForFunction((nextRouteId) => {
    const selected = document.querySelector(`[data-route-id="${nextRouteId}"][aria-pressed="true"], [data-route-id="${nextRouteId}"].is-selected, [data-route-id="${nextRouteId}"][data-selected="true"]`);
    const body = document.querySelector('[data-directive-runtime-body="true"]');
    return Boolean(selected || body?.textContent?.includes(routeIdToLabel(nextRouteId)));

    function routeIdToLabel(value) {
      if (value === 'mission') return 'Mission';
      if (value === 'campaign') return 'Campaign';
      return String(value || '');
    }
  }, routeId, { timeout: BROWSER_TIMEOUT_MS });
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

    const providerTests = {
      utility: await app.testProvider({ kind: 'utility' })
    };

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
      reason: 'liveSceneHandshakeSmoke',
      patch: {
        activeStep: 'review',
        input: {
          identity: {
            name: playerName,
            pronounsOrAddress: 'he/him',
            speciesId: selectedCreatorIds.speciesId,
            ageBandId: selectedCreatorIds.ageBandId,
            appearance: 'A composed Starfleet commander with a careful, direct command style.'
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
            briefBiography: `${playerName} is a Starfleet commander assigned as executive officer aboard ${shipName}.`,
            publicReputation: `${playerName} is known for clear operational judgment and steady follow-through.`
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
      providerTests: clone(providerTests),
      openCampaignChat: clone(openResult),
      campaign: clone({
        id: view?.campaignState?.campaign?.id || startedView?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || startedView?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || startedView?.campaignState?.campaign?.status || null
      }),
      binding: clone(view?.chatNative?.binding || null),
      promptContextRevision: view?.campaignState?.campaignChatBinding?.promptContextRevision || null
    };
  }, {
    modulePath: bridgeModulePath(),
    packageIdOverride: PACKAGE_ID,
    playerName: PLAYER_NAME
  });
}

async function insertHostAssistantFixture(page) {
  return page.evaluate(async (text) => {
    const context = globalThis.SillyTavern?.getContext?.() || null;
    if (!context) return { ok: false, reason: 'sillytavern-context-unavailable' };
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const sendDate = new Date().toISOString();
    const message = {
      name: context.name2 || context.characterName || 'Directive - Ashes of Peace',
      is_user: false,
      is_system: false,
      send_date: sendDate,
      mes: text,
      swipes: [text],
      swipe_id: 0,
      swipe_info: [{
        send_date: sendDate,
        gen_started: null,
        gen_finished: sendDate,
        extra: {
          directiveSceneHandshakeSmoke: {
            fixture: true,
            insertedAt: sendDate
          }
        }
      }],
      extra: {
        directiveSceneHandshakeSmoke: {
          fixture: true,
          insertedAt: sendDate
        }
      }
    };
    chat.push(message);
    const index = chat.length - 1;
    const add = context.addOneMessage || globalThis.addOneMessage;
    if (typeof add === 'function') {
      try {
        await add.call(context, message, { scroll: true });
      } catch {
        await add.call(context, message);
      }
    }
    const save = context.saveChat || context.saveChatConditional || globalThis.saveChat;
    if (typeof save === 'function') await save.call(context);
    return {
      ok: true,
      hostMessageId: String(index),
      index,
      chatLength: chat.length
    };
  }, WHITAKER_BRIEFING);
}

async function readSceneHandshakeSnapshot(page) {
  return page.evaluate(async (modulePath) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compactText = (value, max = 180) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : `${text.slice(0, max)}...`;
    };
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const view = app?.getCurrentView
      ? await app.getCurrentView({ tabId: 'mission' })
      : null;
    const state = view?.campaignState || {};
    const sceneHandshake = state.runtimeTracking?.sceneHandshake || {};
    const commandLogRoot = state.commandLog;
    const commandLogEntries = Array.isArray(commandLogRoot?.entries)
      ? commandLogRoot.entries
      : (Array.isArray(commandLogRoot) ? commandLogRoot : []);
    const modelCalls = (view?.chatNative?.modelCalls || []).map((entry) => ({
      roleId: entry.roleId || null,
      status: entry.status || null,
      ok: entry.ok === true,
      providerKind: entry.providerKind || null,
      providerId: entry.providerId || null,
      model: entry.model || null,
      errorCode: entry.errorCode || null,
      latencyMs: entry.latencyMs ?? null,
      structuredOutput: entry.structuredOutput === true,
      mayProposeState: entry.mayProposeState === true,
      metadata: clone(entry.metadata || null)
    }));
    const context = globalThis.SillyTavern?.getContext?.() || null;
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    return {
      campaign: clone({
        id: state.campaign?.id || null,
        title: state.campaign?.title || null,
        status: state.campaign?.status || null
      }),
      binding: clone(view?.chatNative?.binding || null),
      promptContextRevision: state.campaignChatBinding?.promptContextRevision || null,
      runtimeRevision: state.runtimeTracking?.revision || null,
      mechanicsRevision: state.runtimeTracking?.mechanicsRevision || null,
      sceneHandshake: {
        settledCount: Array.isArray(sceneHandshake.settled) ? sceneHandshake.settled.length : 0,
        pendingInternalReviewCount: Array.isArray(sceneHandshake.pendingInternalReview) ? sceneHandshake.pendingInternalReview.length : 0,
        deferredCount: Array.isArray(sceneHandshake.deferred) ? sceneHandshake.deferred.length : 0,
        rejectedCount: Array.isArray(sceneHandshake.rejected) ? sceneHandshake.rejected.length : 0,
        operatorRecoveryCount: Array.isArray(sceneHandshake.operatorRecovery) ? sceneHandshake.operatorRecovery.length : 0,
        lastResult: clone(sceneHandshake.lastResult || null)
      },
      openAssignments: (state.mission?.openAssignments || []).map((entry) => ({
        id: entry?.id || null,
        title: entry?.title || null,
        summary: entry?.summary || null,
        status: entry?.status || null,
        source: entry?.source || null,
        provenance: clone(entry?.provenance || null)
      })),
      formalObjectives: (state.mission?.formalObjectives || []).map((entry) => (
        typeof entry === 'string'
          ? entry
          : (entry?.title || entry?.summary || '')
      )),
      commandLogCount: commandLogEntries.length,
      recentCommandLog: commandLogEntries.slice(-6).map((entry) => ({
        id: entry?.id || null,
        type: entry?.type || null,
        sourceOutcomeId: entry?.sourceOutcomeId || null,
        summaryInputs: Array.isArray(entry?.summaryInputs) ? entry.summaryInputs.slice(0, 4) : [],
        visibleConsequences: Array.isArray(entry?.visibleConsequences) ? entry.visibleConsequences.slice(0, 4) : [],
        source: entry?.source || null
      })),
      technicalDebt: (state.ship?.technicalDebt || []).map((entry) => ({
        id: entry?.id || null,
        kind: entry?.kind || null,
        label: entry?.label || entry?.title || null,
        detail: entry?.detail || entry?.summary || null,
        status: entry?.status || null,
        source: entry?.source || null
      })),
      threadRecords: (state.threadLedger?.records || []).map((entry) => ({
        id: entry?.id || null,
        title: entry?.title || null,
        summary: entry?.summary || entry?.playerSummary || null,
        source: entry?.source || null
      })),
      modelCallCount: modelCalls.length,
      modelCalls: modelCalls.slice(-12),
      sceneHandshakeModelCalls: modelCalls.filter((entry) => entry.roleId === 'sceneHandshakeSettler'),
      recentMessages: chat.slice(-8).map((message, index) => ({
        relativeIndex: index,
        isUser: message?.is_user === true || message?.role === 'user',
        isSystem: message?.is_system === true || message?.role === 'system',
        directiveOwned: Boolean(message?.extra?.directive || message?.metadata?.directive),
        textPreview: compactText(messageText(message))
      }))
    };
  }, bridgeModulePath());
}

async function exportActiveSaveSnapshot(page) {
  return page.evaluate(async (modulePath) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.exportActiveSave) {
      return {
        ok: false,
        reason: 'exportActiveSave-unavailable'
      };
    }
    const result = await app.exportActiveSave();
    const saveRecord = result?.saveRecord || result?.save || null;
    const state = result?.campaignState
      || result?.state
      || result?.payload?.campaignState
      || result?.export?.campaignState
      || saveRecord?.payload?.campaignState
      || saveRecord?.campaignState
      || null;
    return {
      ok: result?.ok !== false,
      saveId: result?.saveId || result?.save?.id || state?.campaignChatBinding?.saveId || null,
      revision: result?.revision ?? state?.runtimeTracking?.revision ?? null,
      saveRecordId: saveRecord?.id || null,
      metadata: clone(saveRecord?.metadata || null),
      campaignState: clone(state),
      rawKeys: result && typeof result === 'object' ? Object.keys(result) : []
    };
  }, bridgeModulePath());
}

async function reopenActiveSave(page, saveId) {
  return page.evaluate(async ({ modulePath, saveId: id }) => {
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.loadGame || !id) {
      return {
        ok: false,
        reason: app?.loadGame ? 'saveId-missing' : 'loadGame-unavailable'
      };
    }
    const view = await app.loadGame({ saveId: id });
    await app.openCampaignChat({ saveId: id }).catch(() => null);
    return {
      ok: true,
      campaignId: view?.campaignState?.campaign?.id || null,
      saveId: view?.campaignState?.campaignChatBinding?.saveId || id,
      promptContextRevision: view?.campaignState?.campaignChatBinding?.promptContextRevision || null
    };
  }, {
    modulePath: bridgeModulePath(),
    saveId
  });
}

async function saveActiveGameAsBranch(page) {
  return page.evaluate(async ({ modulePath, name }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.saveCurrentGameAs) {
      return {
        ok: false,
        reason: 'saveCurrentGameAs-unavailable'
      };
    }
    const beforeView = app.getCurrentView
      ? await app.getCurrentView({ tabId: 'mission' })
      : null;
    const result = await app.saveCurrentGameAs({ name });
    const view = result?.view || (app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null);
    const state = view?.campaignState || {};
    const sceneHandshake = state.runtimeTracking?.sceneHandshake || {};
    return {
      ok: result?.ok === true,
      blocked: result?.blocked === true,
      previousSaveId: beforeView?.campaignState?.campaignChatBinding?.saveId || null,
      saveId: result?.save?.id || state.campaignChatBinding?.saveId || null,
      branchSaveId: result?.branchSave?.id || null,
      binding: clone(state.campaignChatBinding || null),
      settledCount: Array.isArray(sceneHandshake.settled) ? sceneHandshake.settled.length : 0,
      assignmentCount: Array.isArray(state.mission?.openAssignments) ? state.mission.openAssignments.length : 0,
      promptContextRevision: state.campaignChatBinding?.promptContextRevision || null,
      saveGuard: clone(result?.saveGuard || null)
    };
  }, {
    modulePath: bridgeModulePath(),
    name: `Scene Handshake Branch ${Date.now()}`
  });
}

async function reobserveAcceptingPlayerMessage(page, hostMessageId) {
  return page.evaluate(async ({ modulePath, hostMessageId: id }) => {
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    const message = host?.chat?.getMessage?.(id);
    if (!app?.observeHostPlayerMessage || !message) {
      return {
        ok: false,
        reason: !message ? 'message-not-found' : 'observeHostPlayerMessage-unavailable'
      };
    }
    const result = await app.observeHostPlayerMessage({
      ...message,
      chatId: host.chat?.getCurrentChatId?.() || message.chatId || null
    });
    return {
      ok: true,
      result
    };
  }, {
    modulePath: bridgeModulePath(),
    hostMessageId
  });
}

async function observePlayerMessageFromWrongChat(page, hostMessageId) {
  return page.evaluate(async ({ modulePath, hostMessageId: id }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    const message = host?.chat?.getMessage?.(id);
    if (!app?.observeHostPlayerMessage || !message) {
      return {
        ok: false,
        reason: !message ? 'message-not-found' : 'observeHostPlayerMessage-unavailable'
      };
    }
    const result = await app.observeHostPlayerMessage({
      ...message,
      chatId: `wrong-chat-${Date.now()}`
    });
    return {
      ok: true,
      result: clone(result)
    };
  }, {
    modulePath: bridgeModulePath(),
    hostMessageId
  });
}

async function invalidateSourceByEdit(page, hostMessageId) {
  return page.evaluate(async ({ modulePath, hostMessageId: id }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.handleHostMessageEdited) {
      return {
        ok: false,
        reason: 'handleHostMessageEdited-unavailable'
      };
    }
    const result = await app.handleHostMessageEdited({
      hostMessageId: id,
      text: 'Edited source text for Scene Handshake invalidation smoke.'
    });
    return {
      ok: result?.ok !== false,
      result: clone(result)
    };
  }, {
    modulePath: bridgeModulePath(),
    hostMessageId
  });
}

async function readMissionDomSnapshot(page) {
  await openDirectivePanel(page);
  await navigateDirectiveRoute(page, 'mission');
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    const body = document.querySelector('[data-directive-runtime-body="true"]');
    const text = String(body?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      hasBody: Boolean(body),
      textPreview: text.slice(0, 1800),
      hasCurrentOrders: /Current\s*Orders/i.test(text),
      hasObjectObject: /\[object Object\]|\bObject Object\b/.test(text),
      mentionsCross: /\bCross\b|\bcommand-network\b/i.test(text),
      mentionsBronn: /\bBronn\b/i.test(text),
      mentionsWalkShip: /\bwalk the ship\b|\bdepartment heads\b/i.test(text)
    };
  });
}

async function readCrewDomSnapshot(page) {
  await openDirectivePanel(page);
  await navigateDirectiveRoute(page, 'crew');
  await page.waitForTimeout(500);
  return page.evaluate(async () => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const body = document.querySelector('[data-directive-runtime-body="true"]');
    const bodyText = () => normalize(body?.textContent || '');
    const clickSubtab = async (tabId) => {
      const button = body?.querySelector(`[data-directive-crew-subtab="${tabId}"]`);
      button?.click();
      await nextFrame();
      await nextFrame();
      return Boolean(button);
    };
    const selectRosterRow = async (pattern) => {
      const rows = Array.from(body?.querySelectorAll('.directive-crew-roster-row') || []);
      const row = rows.find((entry) => pattern.test(normalize(entry.textContent)));
      row?.click();
      await nextFrame();
      await nextFrame();
      return Boolean(row);
    };

    const characterText = bodyText();
    const rosterTabFound = await clickSubtab('crew');
    const rosterText = bodyText();
    const rosterRows = Array.from(body?.querySelectorAll('.directive-crew-roster-row') || []);

    const selectedCross = await selectRosterRow(/Cross|Imani/i);
    const crossText = bodyText();
    const selectedBronn = await selectRosterRow(/Bronn|Hadrik/i);
    const bronnText = bodyText();
    const selectedSato = await selectRosterRow(/Sato|Miriam/i);
    const satoText = bodyText();
    const selectedSaye = await selectRosterRow(/Saye|Rowan/i);
    const sayeText = bodyText();
    const allText = normalize([characterText, rosterText, crossText, bronnText, satoText, sayeText].join(' '));

    return {
      hasBody: Boolean(body),
      hasObjectObject: /\[object Object\]|\bObject Object\b/.test(allText),
      characterTextPreview: characterText.slice(0, 1200),
      characterTabPopulated: /Player Character|Commander|Executive Officer|Command Bearing/i.test(characterText),
      rosterTabFound,
      rosterRowCount: rosterRows.length,
      rosterTextPreview: rosterText.slice(0, 1600),
      rosterMentionsCross: /Cross|Imani/i.test(rosterText),
      rosterMentionsBronn: /Bronn|Hadrik/i.test(rosterText),
      rosterMentionsSato: /Sato|Miriam/i.test(rosterText),
      rosterMentionsSaye: /Saye|Rowan/i.test(rosterText),
      selectedCross,
      selectedBronn,
      selectedSato,
      selectedSaye,
      crossTextPreview: crossText.slice(0, 1600),
      bronnTextPreview: bronnText.slice(0, 1600),
      satoTextPreview: satoText.slice(0, 1200),
      sayeTextPreview: sayeText.slice(0, 1200),
      crossMentionsAssignment: /\bcommand-network\b|\bhandoff\b|\bwalkthrough\b|\bEngineering\b/i.test(crossText),
      bronnMentionsAssignment: /\balpha shift\b|\bmeet Bronn\b|\bapproach\b|\bhandoff\b/i.test(bronnText),
      satoMentionsAssignment: /\bsurgical bay\b|\bMedical\b|\bpulled apart\b|\bwalk the ship\b/i.test(satoText),
      sayeMentionsAssignment: /\bsensor array\b|\bcalibration\b|\bScience\b|\bwalk the ship\b/i.test(sayeText),
      anyCrewMentionsAssignment: /\bcommand-network\b|\bBronn\b|\balpha shift\b|\bsurgical bay\b|\bsensor array\b|\bwalk the ship\b|\bdepartment heads\b/i.test(allText)
    };
  });
}

function containsAny(records, patterns) {
  const text = records.map((entry) => JSON.stringify(entry)).join('\n');
  return patterns.some((pattern) => pattern.test(text));
}

async function main() {
  assert.ok(BASE_URL, 'SILLYTAVERN_BASE_URL or ST_BASE_URL is required.');
  const launched = await launchPlaywrightBrowser({
    headless: HEADLESS,
    timeoutMs: BROWSER_TIMEOUT_MS
  });
  assertLive(launched.ok, 'Playwright Chromium could not be launched.', launched.error || launched);
  const browser = launched.browser;

  try {
    const authPage = await createAuthenticatedPage(browser);
    const page = authPage.page;
    const served = await compareServedExtension({
      baseUrl: BASE_URL,
      extensionPath: EXTENSION_PATH,
      headers: authPage.auth?.headers || {},
      files: [
        'src/runtime/scene-handshake-settler.mjs',
        'src/runtime/message-reconciler.mjs',
        'src/runtime/chat-turn-orchestrator.mjs',
        'src/ui/mission-panel.js'
      ],
      timeoutMs: BROWSER_TIMEOUT_MS
    });
    assertLive(served.ok, 'Served SillyTavern extension copy does not match the workspace files needed for Scene Handshake.', served);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await verifyBrowserUserSession(page);
    await openDirectivePanel(page);

    const created = await createLiveCampaign(page);
    assertLive(!created.skipped, created.reason || 'Live campaign creation was skipped.', created);
    assertLive(created.providerTests?.utility?.ok === true, 'Utility provider precheck failed.', created.providerTests);

    const before = await readSceneHandshakeSnapshot(page);
    const inserted = await insertHostAssistantFixture(page);
    assertLive(inserted.ok, 'Could not insert host-native assistant briefing fixture.', inserted);

    await sendSillyTavernChatMessage(page, SAM_ACCEPTANCE, {
      timeoutMs: SETTLEMENT_TIMEOUT_MS
    });

    const after = await waitForCondition(page, async () => {
      const snapshot = await readSceneHandshakeSnapshot(page);
      const last = snapshot.sceneHandshake.lastResult || {};
      if (
        snapshot.sceneHandshake.settledCount > before.sceneHandshake.settledCount
        && last.status === 'settled'
      ) {
        return snapshot;
      }
      return null;
    }, {
      timeoutMs: SETTLEMENT_TIMEOUT_MS,
      pollingMs: 1000,
      label: 'Scene Handshake settlement'
    });

    const last = after.sceneHandshake.lastResult || {};
    assertLive(last.disposition === 'autoCommit', 'Scene Handshake did not auto-commit the accepted briefing.', { before, after });
    assertLive(last.operationCount >= 4, 'Scene Handshake committed too few operations for the three-objective briefing.', { before, after });
    assertLive(
      Array.isArray(last.committedRoots)
      && ['mission', 'commandLog', 'ship', 'threadLedger'].every((root) => last.committedRoots.includes(root)),
      'Scene Handshake ledger did not record the expected committed roots.',
      last
    );
    assertLive(last.parseStatus === 'ok', 'Scene Handshake ledger did not record parse success.', last);
    assertLive(
      after.sceneHandshakeModelCalls.some((entry) => (entry.ok === true || entry.status === 'ok') && entry.providerKind === 'utility'),
      'sceneHandshakeSettler did not record a successful Utility model call.',
      after.sceneHandshakeModelCalls
    );
    const latestSceneHandshakeCall = after.sceneHandshakeModelCalls.at(-1) || {};
    assertLive(
      latestSceneHandshakeCall.metadata?.promptBudget?.maxPreviousAssistantChars > 0
      && Array.isArray(latestSceneHandshakeCall.metadata?.optionalSlicesIncluded)
      && latestSceneHandshakeCall.metadata?.sourceTextHashes?.range,
      'sceneHandshakeSettler diagnostics did not include sanitized prompt budget/source metadata.',
      latestSceneHandshakeCall
    );
    assertLive(
      after.promptContextRevision > before.promptContextRevision,
      'Prompt context revision did not advance after settlement.',
      { beforeRevision: before.promptContextRevision, afterRevision: after.promptContextRevision }
    );
    assertLive(
      after.openAssignments.length >= 3
      && containsAny(after.openAssignments, [/Cross/i, /command-network/i])
      && containsAny(after.openAssignments, [/Bronn/i])
      && containsAny(after.openAssignments, [/walk the ship/i, /department heads/i]),
      'Scene Handshake did not create the expected open assignments.',
      after.openAssignments
    );
    assertLive(
      after.commandLogCount > before.commandLogCount
      && containsAny(after.recentCommandLog, [/Whitaker/i, /three/i, /Cross/i, /Bronn/i]),
      'Scene Handshake did not create a source-backed Command Log entry.',
      after.recentCommandLog
    );
    assertLive(
      containsAny(after.technicalDebt, [/command-network/i]),
      'Scene Handshake did not record the explicit command-network readiness issue.',
      after.technicalDebt
    );
    assertLive(
      after.threadRecords.length >= 2
      && containsAny(after.threadRecords, [/Bronn/i])
      && containsAny(after.threadRecords, [/Cross/i, /command-network/i]),
      'Scene Handshake did not emit expected thread signals.',
      after.threadRecords
    );

    const exported = await exportActiveSaveSnapshot(page);
    assertLive(exported.ok && exported.campaignState, 'Active save export did not expose persisted campaign state.', exported);
    const exportedHandshake = exported.campaignState.runtimeTracking?.sceneHandshake || {};
    assertLive(
      Array.isArray(exportedHandshake.settled)
      && exportedHandshake.settled.some((entry) => entry.id === last.id && entry.status === 'settled'),
      'Persisted save export did not include the settled Scene Handshake record.',
      exportedHandshake
    );
    assertLive(
      (exported.campaignState.mission?.openAssignments || []).some((entry) => /Cross|command-network/i.test(`${entry.title || ''} ${entry.summary || ''}`)),
      'Persisted save export did not include handshake-created open assignments.',
      exported.campaignState.mission?.openAssignments || []
    );

    const acceptingPlayerId = last.currentPlayerHostMessageId || '2';
    const beforeDuplicate = {
      assignmentCount: after.openAssignments.length,
      commandLogCount: after.commandLogCount,
      settledCount: after.sceneHandshake.settledCount,
      modelCallCount: after.modelCallCount
    };
    const duplicateObserve = await reobserveAcceptingPlayerMessage(page, acceptingPlayerId);
    assertLive(duplicateObserve.ok, 'Could not reobserve accepting player message for duplicate/idempotency proof.', duplicateObserve);
    const duplicateAfter = await readSceneHandshakeSnapshot(page);
    assertLive(
      duplicateAfter.openAssignments.length === beforeDuplicate.assignmentCount
      && duplicateAfter.commandLogCount === beforeDuplicate.commandLogCount
      && duplicateAfter.sceneHandshake.settledCount === beforeDuplicate.settledCount,
      'Duplicate reobserve changed Scene Handshake material state.',
      { beforeDuplicate, duplicateAfter }
    );

    const reopened = await reopenActiveSave(page, exported.saveId || after.binding?.saveId);
    assertLive(reopened.ok, 'Could not reload the active save for persisted-state proof.', reopened);
    const reopenedSnapshot = await readSceneHandshakeSnapshot(page);
    assertLive(
      reopenedSnapshot.sceneHandshake.settledCount >= after.sceneHandshake.settledCount
      && containsAny(reopenedSnapshot.openAssignments, [/Cross/i, /Bronn/i, /walk the ship/i]),
      'Reloaded save did not preserve Scene Handshake state.',
      reopenedSnapshot
    );

    const branched = await saveActiveGameAsBranch(page);
    assertLive(branched.ok, 'Save Game As branch creation failed after Scene Handshake settlement.', branched);
    assertLive(
      branched.saveId && branched.previousSaveId && branched.saveId !== branched.previousSaveId,
      'Save Game As did not move the active campaign chat to a distinct save branch.',
      branched
    );
    assertLive(
      branched.settledCount >= after.sceneHandshake.settledCount
      && branched.assignmentCount >= after.openAssignments.length,
      'Save Game As branch did not preserve settled Scene Handshake state.',
      branched
    );

    const branchExport = await exportActiveSaveSnapshot(page);
    assertLive(
      branchExport.ok
      && branchExport.saveId === branched.saveId
      && branchExport.campaignState?.campaignChatBinding?.saveId === branched.saveId,
      'Branch save export did not point at the active Save Game As branch.',
      { branched, branchExport }
    );

    const wrongChatObserve = await observePlayerMessageFromWrongChat(page, acceptingPlayerId);
    assertLive(wrongChatObserve.ok, 'Could not exercise wrong-chat observe path.', wrongChatObserve);
    assertLive(
      wrongChatObserve.result?.handled === false
      && ['inactive-or-unbound', 'inactive-unbound-or-owned'].includes(wrongChatObserve.result?.reason),
      'Wrong-chat observe was not isolated from the bound campaign chat.',
      wrongChatObserve
    );
    const wrongChatAfter = await readSceneHandshakeSnapshot(page);
    assertLive(
      wrongChatAfter.sceneHandshake.settledCount === branched.settledCount
      && wrongChatAfter.openAssignments.length === branched.assignmentCount,
      'Wrong-chat observe changed Scene Handshake state.',
      { before: branched, after: wrongChatAfter }
    );

    const missionDom = await readMissionDomSnapshot(page);
    assertLive(missionDom.hasBody, 'Mission drawer body was not rendered.', missionDom);
    assertLive(missionDom.hasCurrentOrders, 'Mission drawer did not render Current Orders.', missionDom);
    assertLive(!missionDom.hasObjectObject, 'Mission drawer rendered Object Object for structured records.', missionDom);
    assertLive(
      missionDom.mentionsCross && missionDom.mentionsBronn && missionDom.mentionsWalkShip,
      'Mission drawer did not surface the accepted briefing assignments.',
      missionDom
    );
    const crewDom = await readCrewDomSnapshot(page);
    assertLive(crewDom.hasBody, 'Crew drawer body was not rendered.', crewDom);
    assertLive(crewDom.characterTabPopulated, 'Crew Character tab did not render populated player-character context.', crewDom);
    assertLive(crewDom.rosterTabFound, 'Crew Roster subtab was not available.', crewDom);
    assertLive(crewDom.rosterRowCount >= 4, 'Crew Roster did not render enough campaign crew rows for assignment projection.', crewDom);
    assertLive(!crewDom.hasObjectObject, 'Crew drawer rendered Object Object for structured records.', crewDom);
    assertLive(
      crewDom.rosterMentionsCross && crewDom.rosterMentionsBronn && crewDom.rosterMentionsSato && crewDom.rosterMentionsSaye,
      'Crew Roster did not include the officers named by the accepted briefing.',
      crewDom
    );
    assertLive(
      crewDom.selectedCross && crewDom.crossMentionsAssignment,
      'Crew detail for Commander Cross did not surface the accepted command-network assignment context.',
      crewDom
    );
    assertLive(
      crewDom.selectedBronn && crewDom.bronnMentionsAssignment,
      'Crew detail for Bronn did not surface the accepted alpha-shift meeting assignment context.',
      crewDom
    );
    assertLive(
      (crewDom.selectedSato && crewDom.satoMentionsAssignment)
      || (crewDom.selectedSaye && crewDom.sayeMentionsAssignment)
      || crewDom.anyCrewMentionsAssignment,
      'Crew surfaces did not surface the accepted ship-walk department-head assignment context.',
      crewDom
    );

    const sourceEdit = await invalidateSourceByEdit(page, inserted.hostMessageId);
    assertLive(
      sourceEdit.ok
      && sourceEdit.result?.handled === true
      && sourceEdit.result?.action === 'sceneHandshakeInvalidated',
      'Editing a Scene Handshake source did not invalidate anchored settlement state.',
      sourceEdit
    );
    const editedSnapshot = await readSceneHandshakeSnapshot(page);
    assertLive(
      editedSnapshot.sceneHandshake.lastResult?.status === 'invalidated'
      && editedSnapshot.openAssignments.some((entry) => entry.status === 'source-stale'),
      'Edited source did not mark Scene Handshake records and derived assignments stale.',
      editedSnapshot
    );

    const result = {
      ok: true,
      campaign: after.campaign,
      binding: after.binding,
      fixtureHostMessageId: inserted.hostMessageId,
      settledCount: after.sceneHandshake.settledCount,
      lastResult: after.sceneHandshake.lastResult,
      promptContextRevision: {
        before: before.promptContextRevision,
        after: after.promptContextRevision
      },
      assignmentTitles: after.openAssignments.map((entry) => entry.title),
      commandLogCount: after.commandLogCount,
      technicalDebt: after.technicalDebt.map((entry) => entry.label || entry.detail).filter(Boolean),
      threadTitles: after.threadRecords.map((entry) => entry.title).filter(Boolean),
      crewProjection: {
        rosterRowCount: crewDom.rosterRowCount,
        crossMentionsAssignment: crewDom.crossMentionsAssignment,
        bronnMentionsAssignment: crewDom.bronnMentionsAssignment,
        satoMentionsAssignment: crewDom.satoMentionsAssignment,
        sayeMentionsAssignment: crewDom.sayeMentionsAssignment
      },
      sceneHandshakeModelCalls: after.sceneHandshakeModelCalls.slice(-4),
      servedExtensionCompared: served.compared.map((entry) => entry.relativePath),
      exportedSave: {
        saveId: exported.saveId,
        revision: exported.revision,
        settledCount: exportedHandshake.settled?.length || 0
      },
      duplicateReobserve: {
        ok: duplicateObserve.ok,
        assignmentCount: duplicateAfter.openAssignments.length,
        commandLogCount: duplicateAfter.commandLogCount,
        settledCount: duplicateAfter.sceneHandshake.settledCount
      },
      reopenedSave: {
        ok: reopened.ok,
        saveId: reopened.saveId,
        settledCount: reopenedSnapshot.sceneHandshake.settledCount
      },
      saveGameAsBranch: {
        ok: branched.ok,
        previousSaveId: branched.previousSaveId,
        saveId: branched.saveId,
        settledCount: branched.settledCount,
        assignmentCount: branched.assignmentCount
      },
      wrongChatObserve: {
        ok: wrongChatObserve.ok,
        handled: wrongChatObserve.result?.handled,
        reason: wrongChatObserve.result?.reason
      },
      sourceEditInvalidation: {
        ok: sourceEdit.ok,
        action: sourceEdit.result?.action,
        invalidatedCount: sourceEdit.result?.sceneHandshake?.invalidatedCount || null,
        lastStatus: editedSnapshot.sceneHandshake.lastResult?.status || null
      },
      missionDom: {
        hasCurrentOrders: missionDom.hasCurrentOrders,
        hasObjectObject: missionDom.hasObjectObject,
        mentionsCross: missionDom.mentionsCross,
        mentionsBronn: missionDom.mentionsBronn,
        mentionsWalkShip: missionDom.mentionsWalkShip
      }
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  if (error?.details) console.error(JSON.stringify(error.details, null, 2));
  process.exitCode = 1;
});
