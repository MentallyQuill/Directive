import fs from 'node:fs';
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
  sha256Text,
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const HELP = args.has('--help') || args.has('-h');
const LIVE = args.has('--live') || process.env.DIRECTIVE_MESSAGE_EDIT_LIVE === '1';
const WRITE_ARTIFACTS = args.has('--write-artifacts') || process.env.DIRECTIVE_MESSAGE_EDIT_WRITE === '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const RUN_ID = process.env.DIRECTIVE_MESSAGE_EDIT_RUN_ID || createRunId();
const ARTIFACT_ROOT = process.env.DIRECTIVE_SOAK_ARTIFACT_DIR || DEFAULT_SOAK_ARTIFACT_ROOT;
const LIVE_LOG_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH || '').trim();
const SILLYTAVERN_USER = String(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '').trim();
const RESUME_SAVE_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const RESUME_CHAT_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID || '').trim();
const TARGET_MESID = String(process.env.DIRECTIVE_MESSAGE_EDIT_TARGET_MESID || '').trim();
const SEGMENT = String(process.env.DIRECTIVE_MESSAGE_EDIT_SEGMENT || 'message-edit').trim() || 'message-edit';
const REPLACEMENT_TEXT = replacementText();

function usage() {
  return `Directive SillyTavern live message edit runner

Required live usage:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  $env:DIRECTIVE_SILLYTAVERN_USER='directive-soak-b'
  $env:DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID='save-...'
  $env:DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID='Directive - ...'
  $env:DIRECTIVE_MESSAGE_EDIT_TARGET_MESID='42'
  $env:DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_TEXT='replacement player-visible message'
  node tools\\scripts\\run-sillytavern-message-edit-live.mjs --live --write-artifacts
`;
}

function replacementText() {
  const filePath = String(process.env.DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_FILE || '').trim();
  if (filePath) return fs.readFileSync(path.resolve(process.cwd(), filePath), 'utf8').trim();
  return String(process.env.DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_TEXT || '').trim();
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

async function openDirectivePanel(page) {
  await page.waitForFunction(() => {
    if (typeof globalThis.Directive?.bridge?.showRuntime === 'function') return true;
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') return true;
    if (typeof globalThis.Directive?.actions?.run === 'function') return true;
    return Boolean(document.getElementById('directive-extensions-menu-button'));
  }, null, { timeout: 30000 });
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
  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    return Boolean(panel && panel.hidden !== true);
  }, null, { timeout: 30000 }).catch(() => null);
  return openedWith;
}

async function dismissDirectivePresetDialog(page) {
  return page.evaluate(async ({ modulePath }) => {
    const mod = await import(modulePath).catch(() => null);
    const bridge = mod?.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    let runtimeDismissed = false;
    try {
      if (app?.dismissDirectivePresetStartupReminder) {
        await app.dismissDirectivePresetStartupReminder();
        runtimeDismissed = true;
      }
    } catch {
      runtimeDismissed = false;
    }
    const overlay = document.getElementById('directive-preset-update-dialog');
    const domRemoved = Boolean(overlay);
    overlay?.remove();
    return { runtimeDismissed, domRemoved };
  }, { modulePath: bridgeModulePath() });
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
      if (!app?.openCampaignChat) return { ok: false, reason: 'Directive runtime app does not expose openCampaignChat.' };
      const openResult = resumeSaveId ? await app.openCampaignChat({ saveId: resumeSaveId }) : await app.openCampaignChat();
      if (openResult?.ok === false && resumeSaveId && app.loadGame) {
        await app.loadGame({ saveId: resumeSaveId }).catch(() => null);
      }
      const view = app.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
      const currentContext = context();
      const currentChatId = host?.chat?.getCurrentChatId?.() || currentContext?.chatId || currentContext?.chat_id || null;
      const binding = view?.chatNative?.binding || null;
      const runtimeLoaded = resumeSaveId
        ? view?.campaignState?.campaignChatBinding?.saveId === resumeSaveId
        : true;
      return {
        ok: openResult?.ok !== false || runtimeLoaded,
        runtimeOnly: openResult?.ok === false && runtimeLoaded,
        openResult: clone(openResult),
        currentChatId,
        expectedChatId: expectedChatId || null,
        expectedChatMatches: expectedChatId
          ? [currentChatId, binding?.chatId].map((value) => String(value || '')).includes(expectedChatId)
          : null,
        binding: clone(binding)
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

async function runtimeSnapshot(page, targetMesid = TARGET_MESID) {
  return page.evaluate(async ({ modulePath, targetMesid }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const count = (value) => Array.isArray(value) ? value.length : 0;
    const text = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const mod = await import(modulePath);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    const view = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const index = Number(targetMesid);
    const message = Number.isInteger(index) ? chat[index] : null;
    const tracking = view?.campaignState?.runtimeTracking || {};
    const ingress = (tracking.ingressLedger || []).find((entry) => String(entry.hostMessageId) === String(targetMesid)) || null;
    const response = (tracking.responseLedger || []).find((entry) => String(entry.hostMessageId) === String(targetMesid)) || null;
    const reconciliation = tracking.sceneReconciliation || {};
    return {
      currentChatId: host?.chat?.getCurrentChatId?.() || context?.chatId || context?.chat_id || null,
      chatLength: chat.length,
      targetMesid,
      targetMessage: message ? {
        name: message.name || '',
        isUser: message.is_user === true,
        isSystem: message.is_system === true,
        text: String(message.mes || ''),
        textPreview: text(message.mes).slice(0, 240),
        textHash: message.mes ? String(message.mes).length : 0
      } : null,
      ingress: ingress ? {
        id: ingress.id || null,
        hostMessageId: ingress.hostMessageId || null,
        status: ingress.status || null,
        outcomeId: ingress.outcomeId || null,
        turnId: ingress.turnId || null,
        textHash: ingress.textHash || null,
        recoveryId: ingress.recoveryId || null,
        editedAt: ingress.editedAt || null,
        deletedAt: ingress.deletedAt || null
      } : null,
      response: response ? {
        id: response.id || null,
        hostMessageId: response.hostMessageId || null,
        status: response.status || null,
        responseKind: response.responseKind || null,
        strategy: response.strategy || null,
        ingressId: response.ingressId || null,
        outcomeId: response.outcomeId || null,
        turnId: response.turnId || null,
        recoveryId: response.recoveryId || null,
        editedAt: response.editedAt || null,
        deletedAt: response.deletedAt || null,
        invalidatedAt: response.invalidatedAt || null,
        replacementTextSet: Boolean(response.replacementText)
      } : null,
      promptContextRevision: view?.chatNative?.binding?.promptContextRevision || view?.campaignState?.campaignChatBinding?.promptContextRevision || null,
      recoveryCount: count(tracking.recoveryJournal),
      recentRecoveryJournal: clone((tracking.recoveryJournal || []).slice(-6)),
      sceneReconciliation: {
        runsCount: count(reconciliation.runs),
        lastResult: clone(reconciliation.lastResult || null)
      }
    };
  }, { modulePath: bridgeModulePath(), targetMesid });
}

async function clickEditAndSave(page) {
  const row = page.locator(`#chat .mes[mesid="${cssAttrValue(TARGET_MESID)}"]`).first();
  await row.waitFor({ state: 'attached', timeout: 10000 });
  await row.evaluate((element) => element.scrollIntoView?.({ block: 'start', inline: 'nearest' }));
  await page.waitForTimeout(150);
  await row.hover({ timeout: 5000 }).catch(() => {});
  const editButton = row.locator('.mes_edit').first();
  const editBox = await editButton.boundingBox().catch(() => null);
  await editButton.click({ timeout: 8000 });
  const textarea = page.locator('#curEditTextarea').first();
  await textarea.waitFor({ state: 'visible', timeout: 10000 });
  const originalText = await textarea.inputValue();
  await textarea.fill(REPLACEMENT_TEXT);
  const doneButton = row.locator('.mes_edit_done').first();
  const doneBox = await doneButton.boundingBox().catch(() => null);
  await doneButton.click({ timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector('#curEditTextarea'), null, { timeout: 10000 }).catch(() => {});
  return {
    targetMesid: TARGET_MESID,
    originalTextPreview: compact(originalText, 260),
    originalTextHash: sha256Text(originalText).slice(0, 16),
    replacementTextPreview: compact(REPLACEMENT_TEXT, 260),
    replacementTextHash: sha256Text(REPLACEMENT_TEXT).slice(0, 16),
    editButtonBox: editBox,
    doneButtonBox: doneBox
  };
}

async function waitForDirectiveRecovery(page, before) {
  const beforeRecoveryCount = Number(before?.recoveryCount || 0);
  const beforeIngressStatus = before?.ingress?.status || null;
  const beforeResponseStatus = before?.response?.status || null;
  const beforeText = before?.targetMessage?.text || '';
  const deadline = Date.now() + 60000;
  let latest = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const snapshot = await runtimeSnapshot(page).catch(() => null);
    if (!snapshot) continue;
    latest = snapshot;
    const textChanged = snapshot.targetMessage?.text && snapshot.targetMessage.text !== beforeText;
    const recoveryChanged = Number(snapshot.recoveryCount || 0) > beforeRecoveryCount;
    const ingressChanged = snapshot.ingress?.status && snapshot.ingress.status !== beforeIngressStatus;
    const responseChanged = snapshot.response?.status && snapshot.response.status !== beforeResponseStatus;
    if (textChanged && (recoveryChanged || ingressChanged || responseChanged)) return { ok: true, snapshot };
  }
  return { ok: false, timedOut: true, snapshot: latest };
}

async function liveReport(paths = null) {
  if (!BASE_URL) return { status: 'skipped', reason: 'SILLYTAVERN_BASE_URL is required.' };
  if (!LIVE) return { status: 'skipped', reason: 'Pass --live to edit a live SillyTavern message.' };
  if (!TARGET_MESID) return { status: 'fail', failures: ['DIRECTIVE_MESSAGE_EDIT_TARGET_MESID is required.'] };
  if (!REPLACEMENT_TEXT) return { status: 'fail', failures: ['DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_TEXT or DIRECTIVE_MESSAGE_EDIT_REPLACEMENT_FILE is required.'] };
  const browserResult = await launchPlaywrightBrowser({ headless: HEADLESS });
  if (!browserResult.ok) return { status: 'fail', failures: [browserResult.error?.message || 'Playwright browser launch failed.'], browser: browserResult };
  const auth = SILLYTAVERN_USER
    ? await authenticateSillyTavernUser({ baseUrl: BASE_URL, handle: SILLYTAVERN_USER, password: sillyTavernPassword() })
    : null;
  if (SILLYTAVERN_USER && !auth?.ok) {
    await browserResult.browser.close();
    return { status: 'fail', failures: [auth?.error || `SillyTavern login failed for ${SILLYTAVERN_USER}.`], auth };
  }
  const context = await browserResult.browser.newContext({ baseURL: BASE_URL, viewport: PLAYWRIGHT_VIEWPORTS.desktop });
  if (auth?.headers?.Cookie) await context.addCookies(cookieHeaderToBrowserCookies(auth.headers.Cookie, BASE_URL));
  let tracing = false;
  try {
    if (paths?.playwright) {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      tracing = true;
    }
    const page = await context.newPage();
    await page.goto(SILLYTAVERN_USER ? '/' : BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const openedDirectiveWith = await openDirectivePanel(page);
    const presetDialog = await dismissDirectivePresetDialog(page);
    const openCampaign = await openCampaignChat(page);
    if (RESUME_CHAT_ID && openCampaign.expectedChatMatches !== true) {
      const error = new Error(`Opened chat did not match expected chat id. Actual: ${openCampaign.currentChatId || 'unknown'}`);
      error.details = { openCampaign };
      throw error;
    }
    await page.waitForFunction(({ targetMesid }) => {
      const rows = document.querySelectorAll('#chat .mes[mesid]').length;
      if (!rows) return false;
      if (!targetMesid) return true;
      return Boolean(document.querySelector(`#chat .mes[mesid="${CSS.escape(String(targetMesid))}"]`));
    }, { targetMesid: TARGET_MESID }, { timeout: 20000 });
    const before = await runtimeSnapshot(page);
    const edit = await clickEditAndSave(page);
    if (paths?.screenshots) await page.screenshot({ path: path.join(paths.screenshots, 'message-edited.png'), fullPage: false }).catch(() => null);
    const waited = await waitForDirectiveRecovery(page, before);
    const after = waited.snapshot || await runtimeSnapshot(page);
    const status = waited.ok ? 'pass' : 'warning';
    return {
      schemaVersion: 1,
      kind: 'directive.sillytavernMessageEdit.live',
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      status,
      baseUrl: BASE_URL,
      sillyTavernUser: SILLYTAVERN_USER || null,
      resumeSaveId: RESUME_SAVE_ID || null,
      expectedChatId: RESUME_CHAT_ID || null,
      openedDirectiveWith,
      presetDialog,
      openCampaign,
      edit,
      waited,
      before: {
        ...before,
        targetMessage: before.targetMessage ? { ...before.targetMessage, text: undefined } : null
      },
      after: {
        ...after,
        targetMessage: after.targetMessage ? { ...after.targetMessage, text: undefined } : null
      },
      deltas: {
        recovery: Number(after.recoveryCount || 0) - Number(before.recoveryCount || 0),
        promptContextRevision: Number(after.promptContextRevision || 0) - Number(before.promptContextRevision || 0)
      }
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      kind: 'directive.sillytavernMessageEdit.live',
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      status: 'fail',
      failures: [error?.message || String(error)],
      errorDetails: error?.details || null,
      baseUrl: BASE_URL,
      sillyTavernUser: SILLYTAVERN_USER || null,
      resumeSaveId: RESUME_SAVE_ID || null,
      expectedChatId: RESUME_CHAT_ID || null
    };
  } finally {
    if (tracing && paths?.playwright) await context.tracing.stop({ path: path.join(paths.playwright, 'trace.zip') }).catch(() => null);
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
    type: 'message-edit-live',
    status: 'in_progress',
    worker: SILLYTAVERN_USER || null,
    segment: SEGMENT,
    summary: `Editing live SillyTavern message ${TARGET_MESID} through native host controls.`,
    saveId: RESUME_SAVE_ID || null,
    chatId: RESUME_CHAT_ID || null,
    targetMesid: TARGET_MESID,
    replacementTextHash: REPLACEMENT_TEXT ? sha256Text(REPLACEMENT_TEXT).slice(0, 16) : null
  });
  const report = await liveReport(paths);
  if (paths) writeJsonFile(paths.report, report);
  logLive({
    type: 'message-edit-live',
    status: report.status,
    worker: SILLYTAVERN_USER || null,
    segment: SEGMENT,
    summary: report.status === 'pass'
      ? 'Native SillyTavern message edit completed and Directive recorded a recovery/reconciliation state change for the edited message.'
      : `Native SillyTavern message edit completed with status ${report.status}.`,
    saveId: RESUME_SAVE_ID || null,
    chatId: report.after?.currentChatId || RESUME_CHAT_ID || null,
    targetMesid: TARGET_MESID,
    originalTextHash: report.edit?.originalTextHash || null,
    replacementTextHash: report.edit?.replacementTextHash || null,
    beforeIngress: report.before?.ingress || null,
    afterIngress: report.after?.ingress || null,
    beforeResponse: report.before?.response || null,
    afterResponse: report.after?.response || null,
    deltas: report.deltas || null,
    artifact: paths?.report || null
  });
  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    runId: RUN_ID,
    targetMesid: TARGET_MESID,
    beforeIngress: report.before?.ingress || null,
    afterIngress: report.after?.ingress || null,
    beforeResponse: report.before?.response || null,
    afterResponse: report.after?.response || null,
    deltas: report.deltas || null,
    report: paths?.report || null
  }, null, 2));
  if (report.status === 'fail') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
