import path from 'node:path';
import {
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SOAK_ARTIFACT_ROOT,
  PLAYWRIGHT_VIEWPORTS,
  appendJsonLine,
  authenticateSillyTavernUser,
  compact,
  createArtifactPaths,
  createRunId,
  ensureArtifactTree,
  launchPlaywrightBrowser,
  normalizeBaseUrl,
  normalizeExtensionPath,
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const HELP = args.has('--help') || args.has('-h');
const LIVE = args.has('--live') || process.env.DIRECTIVE_MESSAGE_ACTION_LIVE === '1';
const WRITE_ARTIFACTS = args.has('--write-artifacts') || process.env.DIRECTIVE_MESSAGE_ACTION_WRITE === '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const RUN_ID = process.env.DIRECTIVE_MESSAGE_ACTION_RUN_ID || createRunId();
const ARTIFACT_ROOT = process.env.DIRECTIVE_SOAK_ARTIFACT_DIR || DEFAULT_SOAK_ARTIFACT_ROOT;
const LIVE_LOG_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH || '').trim();
const SILLYTAVERN_USER = String(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '').trim();
const RESUME_SAVE_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const RESUME_CHAT_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID || '').trim();
const TARGET_MESID = String(process.env.DIRECTIVE_MESSAGE_ACTION_TARGET_MESID || '').trim();
const ACTION = String(process.env.DIRECTIVE_MESSAGE_ACTION_ID || 'reconcileMessage').trim();
const ACTIONS = Object.freeze({
  reconcileMessage: Object.freeze({
    menuAction: 'reconcileMessage',
    runtimeAction: 'reconciliation.reconcileMessage',
    label: 'Reconcile This Message'
  }),
  reconcileFromHere: Object.freeze({
    menuAction: 'reconcileFromHere',
    runtimeAction: 'reconciliation.reconcileFromHere',
    label: 'Reconcile From Here'
  })
});

function usage() {
  return `Directive SillyTavern live message-action runner

Required live usage:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  $env:DIRECTIVE_SILLYTAVERN_USER='directive-soak-b'
  $env:DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID='save-...'
  $env:DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID='Directive - ...'
  $env:DIRECTIVE_MESSAGE_ACTION_ID='reconcileMessage'
  node tools\\scripts\\run-sillytavern-message-action-live.mjs --live --write-artifacts

Supported DIRECTIVE_MESSAGE_ACTION_ID values:
  ${Object.keys(ACTIONS).join(', ')}
`;
}

function sillyTavernPassword() {
  return process.env.DIRECTIVE_SILLYTAVERN_PASSWORD
    ?? process.env.DIRECTIVE_SOAK_ST_PASSWORD
    ?? process.env.SILLYTAVERN_PASSWORD
    ?? '';
}

function cookieHeaderToBrowserCookies(cookieHeader, baseUrl) {
  const parsed = new URL(baseUrl);
  return String(cookieHeader || '')
    .split(/;\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      return {
        name: eq >= 0 ? part.slice(0, eq) : part,
        value: eq >= 0 ? part.slice(eq + 1) : '',
        domain: parsed.hostname,
        path: '/',
        secure: parsed.protocol === 'https:',
        httpOnly: true,
        sameSite: 'Lax'
      };
    });
}

function bridgeModulePath() {
  return `${EXTENSION_PATH}/src/hosts/sillytavern/runtime-bridge.mjs`;
}

function cssAttrValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function logLive(entry) {
  if (!LIVE_LOG_PATH) return null;
  return appendJsonLine(path.resolve(process.cwd(), LIVE_LOG_PATH), {
    ts: new Date().toISOString(),
    ...entry
  });
}

async function openCampaignChat(page) {
  return page.evaluate(async ({ modulePath, resumeSaveId, expectedChatId }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const context = () => globalThis.SillyTavern?.getContext?.() || {};
    try {
      const mod = await import(modulePath);
      const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      const app = bridge.runtimeApp || null;
      const host = bridge.host || null;
      if (!app?.openCampaignChat) {
        return { ok: false, reason: 'Directive runtime app does not expose openCampaignChat.' };
      }
      const openResult = resumeSaveId
        ? await app.openCampaignChat({ saveId: resumeSaveId })
        : await app.openCampaignChat();
      const view = app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
      const currentContext = context();
      const currentChatId = host?.chat?.getCurrentChatId?.() || currentContext?.chatId || currentContext?.chat_id || null;
      const binding = view?.chatNative?.binding || null;
      return {
        ok: openResult?.ok !== false,
        currentChatId,
        expectedChatId: expectedChatId || null,
        expectedChatMatches: expectedChatId
          ? [currentChatId, binding?.chatId].map((value) => String(value || '')).includes(expectedChatId)
          : null,
        binding: clone(binding),
        activationStatus: view?.chatNative?.activation?.status || null
      };
    } catch (error) {
      return { ok: false, reason: error?.message || String(error) };
    }
  }, {
    modulePath: bridgeModulePath(),
    resumeSaveId: RESUME_SAVE_ID,
    expectedChatId: RESUME_CHAT_ID
  });
}

async function runtimeSnapshot(page) {
  return page.evaluate(async ({ modulePath }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const count = (value) => Array.isArray(value) ? value.length : 0;
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    const view = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const tracking = view?.campaignState?.runtimeTracking || {};
    const reconciliation = view?.campaignState?.sceneReconciliation || {};
    const coreProjection = view?.campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections
      || view?.directiveRuntimeEvidence?.coreStoreReadProjections
      || {};
    const coreRecoveryJournal = Array.isArray(coreProjection.recoveryJournal) ? coreProjection.recoveryJournal : [];
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const primaryModelCalls = Array.isArray(view?.chatNative?.modelCalls) ? view.chatNative.modelCalls : [];
    const legacyModelCallTelemetry = Array.isArray(view?.chatNative?.legacyModelCallTelemetry)
      ? view.chatNative.legacyModelCallTelemetry
      : (Array.isArray(tracking.modelCallJournal) ? tracking.modelCallJournal : []);
    return {
      currentChatId: host?.chat?.getCurrentChatId?.() || context?.chatId || context?.chat_id || null,
      chatLength: chat.length,
      campaignId: view?.campaignState?.campaign?.id || null,
      saveId: view?.chatNative?.binding?.saveId || null,
      turnLedgerCount: count(view?.campaignState?.turnLedger?.entries || view?.campaignState?.turnLedger),
      commandLogCount: count(view?.campaignState?.commandLog?.entries || view?.campaignState?.commandLog),
      recoveryCount: count(coreRecoveryJournal),
      legacyRecoveryCount: count(tracking.recoveryJournal),
      coreRecoveryCount: count(coreRecoveryJournal),
      latestCoreRecovery: clone(coreRecoveryJournal.at(-1) || null),
      recentCoreRecoveryJournal: clone(coreRecoveryJournal.slice(-5)),
      pendingInteractionCount: count(view?.chatNative?.pendingInteractions?.filter?.((entry) => entry?.status !== 'resolved') || []),
      modelCallCount: primaryModelCalls.length,
      legacyModelCallCount: legacyModelCallTelemetry.length,
      sceneReconciliation: {
        runsCount: count(reconciliation.runs),
        appliedCount: count(reconciliation.applied),
        pendingCount: count(reconciliation.pending),
        rejectedCount: count(reconciliation.rejected),
        invalidationCount: count(reconciliation.invalidations),
        cacheCount: count(reconciliation.chunkCache),
        lastRunId: reconciliation.lastRunId || null,
        lastResult: clone(reconciliation.lastResult || null)
      },
      recentRecoveryJournal: clone(coreRecoveryJournal.slice(-5)),
      recentMessages: chat.slice(-5).map((message, index) => ({
        relativeIndex: index - Math.min(5, chat.length),
        name: message?.name || '',
        isUser: message?.is_user === true,
        directiveOwned: message?.extra?.directive?.owned === true || Boolean(message?.extra?.directive?.responseKind),
        textPreview: String(message?.mes || '').replace(/\s+/g, ' ').trim().slice(0, 180)
      }))
    };
  }, { modulePath: bridgeModulePath() });
}

async function waitForReconciliationResult(page, before, action) {
  const beforeRuns = Number(before?.sceneReconciliation?.runsCount || 0);
  const beforeLastRunId = before?.sceneReconciliation?.lastRunId || null;
  const deadline = Date.now() + 120000;
  let lastSnapshot = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const snapshot = await runtimeSnapshot(page).catch(() => null);
    const reconciliation = snapshot?.sceneReconciliation || null;
    const last = reconciliation?.lastResult || null;
    if (reconciliation) lastSnapshot = reconciliation;
    if (!last || last.status === 'running') continue;
    const changed = Number(reconciliation.runsCount || 0) > beforeRuns
      || (reconciliation.lastRunId && reconciliation.lastRunId !== beforeLastRunId);
    if (!changed && last.action !== action.menuAction) continue;
    return {
      runsCount: reconciliation.runsCount,
      lastRunId: reconciliation.lastRunId || null,
      lastResult: last,
      snapshot
    };
  }
  return lastSnapshot ? {
    timedOut: true,
    runsCount: lastSnapshot.runsCount,
    lastRunId: lastSnapshot.lastRunId || null,
    lastResult: lastSnapshot.lastResult || null
  } : null;
}

async function rowGeometry(row) {
  return row.evaluate((element) => {
    const rectFor = (node) => {
      if (!node?.getBoundingClientRect) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        opacity: style.opacity
      };
    };
    const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const directiveButton = element.querySelector('.directive-message-actions-button');
    const hostHint = element.querySelector('.extraMesButtonsHint, [title="Message Actions"]');
    const menu = directiveButton?.dataset?.directiveMessageActionsMenuId
      ? document.getElementById(directiveButton.dataset.directiveMessageActionsMenuId)
      : null;
    return {
      mesid: element.getAttribute('mesid'),
      textPreview: text(element.querySelector('.mes_text')?.textContent || element.textContent).slice(0, 220),
      rowRect: rectFor(element),
      hostHintRect: rectFor(hostHint),
      directiveButtonRect: rectFor(directiveButton),
      directiveMenuRect: rectFor(menu),
      directiveMenuHidden: menu ? menu.hidden === true : null
    };
  });
}

async function clickMessageAction(page, action) {
  const selector = TARGET_MESID
    ? `#chat .mes[mesid="${cssAttrValue(TARGET_MESID)}"]`
    : '#chat .mes[mesid]';
  const rows = page.locator(selector);
  const rowCount = await rows.count();
  if (!rowCount) throw new Error(`No message row matched ${selector}.`);
  const row = TARGET_MESID ? rows.first() : rows.nth(rowCount - 1);
  await row.evaluate((element) => element.scrollIntoView?.({ block: 'start', inline: 'nearest' }));
  await page.waitForTimeout(150);
  await row.hover({ timeout: 5000 }).catch(() => {});

  const hostHint = row.locator('.extraMesButtonsHint, [title="Message Actions"]').first();
  await hostHint.click({ timeout: 8000 });
  await page.waitForTimeout(200);
  const overflowGeometry = await rowGeometry(row);

  const launcher = row.locator('.directive-message-actions-button').first();
  await launcher.click({ timeout: 8000 });
  await page.waitForTimeout(200);
  const menu = page.locator(`.directive-message-actions-menu[data-directive-message-id="${cssAttrValue(overflowGeometry.mesid || TARGET_MESID)}"]`).first();
  await menu.waitFor({ state: 'visible', timeout: 8000 });
  const item = menu.locator(`[data-directive-message-action="${action.menuAction}"]`).first();
  const itemText = await item.textContent({ timeout: 8000 }).catch(() => '');
  const itemBox = await item.boundingBox().catch(() => null);
  await item.click({ timeout: 8000 });
  return {
    targetSelector: selector,
    targetMesid: overflowGeometry.mesid || TARGET_MESID || null,
    overflowGeometry,
    menuItem: {
      action: action.menuAction,
      label: compact(itemText, 120),
      box: itemBox
    }
  };
}

async function liveReport(paths = null) {
  if (!BASE_URL) {
    return { status: 'skipped', reason: 'SILLYTAVERN_BASE_URL is required.' };
  }
  if (!LIVE) {
    return { status: 'skipped', reason: 'Pass --live to run a live SillyTavern message action.' };
  }
  const action = ACTIONS[ACTION];
  if (!action) {
    return { status: 'fail', failures: [`Unsupported DIRECTIVE_MESSAGE_ACTION_ID "${ACTION}".`] };
  }
  const browserResult = await launchPlaywrightBrowser({ headless: HEADLESS });
  if (!browserResult.ok) {
    return { status: 'fail', failures: [browserResult.error?.message || 'Playwright browser launch failed.'], browser: browserResult };
  }
  const auth = SILLYTAVERN_USER
    ? await authenticateSillyTavernUser({ baseUrl: BASE_URL, handle: SILLYTAVERN_USER, password: sillyTavernPassword() })
    : null;
  if (SILLYTAVERN_USER && !auth?.ok) {
    await browserResult.browser.close();
    return { status: 'fail', failures: [auth?.error || `SillyTavern login failed for ${SILLYTAVERN_USER}.`], auth };
  }

  const context = await browserResult.browser.newContext({ baseURL: BASE_URL, viewport: PLAYWRIGHT_VIEWPORTS.desktop });
  if (auth?.headers?.Cookie) {
    await context.addCookies(cookieHeaderToBrowserCookies(auth.headers.Cookie, BASE_URL));
  }
  let tracing = false;
  try {
    if (paths?.playwright) {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      tracing = true;
    }
    const page = await context.newPage();
    await page.goto(SILLYTAVERN_USER ? '/' : BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const openCampaign = await openCampaignChat(page);
    if (RESUME_CHAT_ID && openCampaign.expectedChatMatches !== true) {
      throw new Error(`Opened chat did not match expected chat id. Actual: ${openCampaign.currentChatId || 'unknown'}`);
    }
    await page.waitForFunction(() => document.querySelectorAll('#chat .mes[mesid]').length > 2, null, { timeout: 15000 }).catch(() => {});

    const before = await runtimeSnapshot(page);
    const click = await clickMessageAction(page, action);
    if (paths?.screenshots) {
      await page.screenshot({ path: path.join(paths.screenshots, 'message-action-clicked.png'), fullPage: false }).catch(() => null);
    }
    const waited = await waitForReconciliationResult(page, before, action);
    const after = await runtimeSnapshot(page);
    const finalLastResult = waited?.lastResult || after.sceneReconciliation.lastResult || null;
    const status = finalLastResult?.status && finalLastResult.status !== 'running' && !waited?.timedOut
      ? 'pass'
      : 'warning';
    return {
      schemaVersion: 1,
      kind: 'directive.sillytavernMessageAction.live',
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      status,
      baseUrl: BASE_URL,
      sillyTavernUser: SILLYTAVERN_USER || null,
      resumeSaveId: RESUME_SAVE_ID || null,
      expectedChatId: RESUME_CHAT_ID || null,
      action,
      openCampaign,
      click,
      waited,
      before,
      after,
      deltas: {
        runs: after.sceneReconciliation.runsCount - before.sceneReconciliation.runsCount,
        applied: after.sceneReconciliation.appliedCount - before.sceneReconciliation.appliedCount,
        pending: after.sceneReconciliation.pendingCount - before.sceneReconciliation.pendingCount,
        rejected: after.sceneReconciliation.rejectedCount - before.sceneReconciliation.rejectedCount,
        modelCalls: after.modelCallCount - before.modelCallCount,
        legacyRecovery: after.legacyRecoveryCount - before.legacyRecoveryCount,
        coreRecovery: after.coreRecoveryCount - before.coreRecoveryCount
      }
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      kind: 'directive.sillytavernMessageAction.live',
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      status: 'fail',
      failures: [error?.message || String(error)],
      baseUrl: BASE_URL,
      sillyTavernUser: SILLYTAVERN_USER || null,
      resumeSaveId: RESUME_SAVE_ID || null,
      expectedChatId: RESUME_CHAT_ID || null,
      action
    };
  } finally {
    if (tracing && paths?.playwright) {
      await context.tracing.stop({ path: path.join(paths.playwright, 'trace.zip') }).catch(() => null);
    }
    await context.close().catch(() => {});
    await browserResult.browser.close().catch(() => {});
  }
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }
  const paths = WRITE_ARTIFACTS ? createArtifactPaths({ rootDir: ARTIFACT_ROOT, runId: RUN_ID }) : null;
  if (paths) ensureArtifactTree(paths);
  logLive({
    type: 'message-action-live',
    status: 'in_progress',
    worker: SILLYTAVERN_USER || null,
    segment: `${ACTION}-message-action`,
    summary: `Running live Playwright ${ACTION} message action against ${RESUME_SAVE_ID || 'current save'}.`,
    saveId: RESUME_SAVE_ID || null,
    chatId: RESUME_CHAT_ID || null,
    targetMesid: TARGET_MESID || null
  });
  const report = await liveReport(paths);
  if (paths) writeJsonFile(paths.report, report);
  logLive({
    type: 'message-action-live',
    status: report.status,
    worker: SILLYTAVERN_USER || null,
    segment: `${ACTION}-message-action`,
    summary: report.status === 'pass'
      ? `Live Playwright ${ACTION} message action completed through SillyTavern overflow and Directive message-action menu.`
      : `Live Playwright ${ACTION} message action finished with status ${report.status}.`,
    saveId: RESUME_SAVE_ID || null,
    chatId: report.after?.currentChatId || RESUME_CHAT_ID || null,
    targetMesid: report.click?.targetMesid || TARGET_MESID || null,
    deltas: report.deltas || null,
      lastResult: report.waited?.lastResult || report.after?.sceneReconciliation?.lastResult || null,
    artifact: paths?.report || null
  });
  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    runId: RUN_ID,
    action: ACTION,
    targetMesid: report.click?.targetMesid || TARGET_MESID || null,
    deltas: report.deltas || null,
    lastResult: report.waited?.lastResult || report.after?.sceneReconciliation?.lastResult || null,
    report: paths?.report || null
  }, null, 2));
  if (report.status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
