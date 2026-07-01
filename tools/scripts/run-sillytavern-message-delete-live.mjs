import path from 'node:path';
import {
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SOAK_ARTIFACT_ROOT,
  PLAYWRIGHT_VIEWPORTS,
  appendJsonLine,
  authenticateSillyTavernUser,
  compareServedExtension,
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
const LIVE = args.has('--live') || process.env.DIRECTIVE_MESSAGE_DELETE_LIVE === '1';
const WRITE_ARTIFACTS = args.has('--write-artifacts') || process.env.DIRECTIVE_MESSAGE_DELETE_WRITE === '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const RUN_ID = process.env.DIRECTIVE_MESSAGE_DELETE_RUN_ID || createRunId();
const ARTIFACT_ROOT = process.env.DIRECTIVE_SOAK_ARTIFACT_DIR || DEFAULT_SOAK_ARTIFACT_ROOT;
const LIVE_LOG_PATH = String(process.env.DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH || '').trim();
const SILLYTAVERN_USER = String(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '').trim();
const RESUME_SAVE_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const RESUME_CHAT_ID = String(process.env.DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID || '').trim();
const TARGET_MESID = String(process.env.DIRECTIVE_MESSAGE_DELETE_TARGET_MESID || '').trim();
const SEGMENT = String(process.env.DIRECTIVE_MESSAGE_DELETE_SEGMENT || 'message-delete').trim() || 'message-delete';

function usage() {
  return `Directive SillyTavern live message delete runner

Required live usage:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  $env:DIRECTIVE_SILLYTAVERN_USER='directive-soak-b'
  $env:DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID='save-...'
  $env:DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID='Directive - ...'
  $env:DIRECTIVE_MESSAGE_DELETE_TARGET_MESID='43'
  node tools\\scripts\\run-sillytavern-message-delete-live.mjs --live --write-artifacts
`;
}

function sillyTavernPassword() {
  return process.env.DIRECTIVE_SILLYTAVERN_PASSWORD
    ?? process.env.DIRECTIVE_SOAK_ST_PASSWORD
    ?? process.env.SILLYTAVERN_PASSWORD
    ?? '';
}

function isNonHumanSillyTavernUser(value) {
  const user = String(value || '').trim().toLowerCase();
  return Boolean(user && user !== 'default-user');
}

function summarizeServedExtension(served = null) {
  if (!served) return null;
  return {
    ok: served.ok === true,
    mismatchCount: Number(served.mismatchCount || 0),
    servedFailureCount: Number(served.servedFailureCount || 0),
    comparedFiles: Array.isArray(served.compared)
      ? served.compared.map((entry) => entry.relativePath).filter(Boolean)
      : []
  };
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
      if (!app?.openCampaignChat) return { ok: false, reason: 'Directive runtime app does not expose openCampaignChat.' };
      const openResult = resumeSaveId ? await app.openCampaignChat({ saveId: resumeSaveId }) : await app.openCampaignChat();
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
    const hashText = (value) => {
      const text = String(value || '');
      let hash = 2166136261;
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const compactDecision = (value = null) => value && typeof value === 'object' ? ({
      kind: value.kind || null,
      action: value.action || null,
      eventType: value.eventType || null,
      sourceKind: value.sourceKind || null,
      normalTurnAllowed: value.normalTurnAllowed === true,
      recoveryRequired: value.recoveryRequired === true,
      recoveryStatus: value.recoveryStatus || value.legacyProjection?.recoveryJournalStatus || null,
      transactionId: value.transactionId || null,
      recoveryCaseId: value.recoveryCaseId || null,
      legacyProjection: value.legacyProjection ? {
        sourceProjectionStatus: value.legacyProjection.sourceProjectionStatus || null,
        responseProjectionStatus: value.legacyProjection.responseProjectionStatus || null,
        recoveryJournalStatus: value.legacyProjection.recoveryJournalStatus || null,
        returnedAction: value.legacyProjection.returnedAction || null,
        shouldRestoreRevision: value.legacyProjection.shouldRestoreRevision === true
      } : null
    }) : null;
    const compactSourceMutation = (value = null) => value && typeof value === 'object' ? ({
      kind: value.kind || null,
      sourceKind: value.sourceKind || null,
      eventType: value.eventType || null,
      hostMessageId: value.hostMessageId || null,
      ingressId: value.ingressId || null,
      responseId: value.responseId || null,
      outcomeId: value.outcomeId || null,
      sourceFrameId: value.sourceFrameId || null,
      replacementTextHash: value.replacementTextHash || null,
      replacementTextPresent: value.replacementTextPresent === true,
      preOutcomeRevision: Number.isFinite(Number(value.preOutcomeRevision)) ? Number(value.preOutcomeRevision) : null,
      autoRollback: value.autoRollback === true,
      priorStatus: value.priorStatus || null
    }) : null;
    const compactCoreRecovery = (value = null) => value && typeof value === 'object' ? ({
      status: value.status || null,
      transactionId: value.transactionId || null,
      recoveryCaseId: value.recoveryCaseId || value.id || null,
      phase: value.phase || null,
      reason: value.reason || null,
      sourceMutation: compactSourceMutation(value.sourceMutation || value.decision?.sourceMutation || null),
      decision: compactDecision(value.decision || value.repairDecision || null)
    }) : null;
    const compactRecoveryEntry = (entry = null) => {
      if (!entry || typeof entry !== 'object') return null;
      const details = entry.details || {};
      const coreRecovery = compactCoreRecovery(details.coreRecovery || entry.coreRecovery || null);
      return {
        id: entry.id || null,
        type: entry.type || null,
        status: entry.status || null,
        hostMessageId: entry.hostMessageId || null,
        ingressId: entry.ingressId || details.ingressId || null,
        outcomeId: entry.outcomeId || details.outcomeId || null,
        responseId: details.responseId || null,
        responseKind: details.responseKind || null,
        turnId: details.turnId || null,
        recordedAt: entry.recordedAt || null,
        coreRecovery,
        repairDecision: compactDecision(details.repairDecision || coreRecovery?.decision || entry.repairDecision || null),
        rollbackActuation: details.rollbackActuation ? {
          kind: details.rollbackActuation.kind || null,
          authorized: details.rollbackActuation.authorized === true,
          action: details.rollbackActuation.action || null,
          eventType: details.rollbackActuation.eventType || null,
          sourceKind: details.rollbackActuation.sourceKind || null,
          recoveryStatus: details.rollbackActuation.recoveryStatus || null,
          restoreRevision: Number.isFinite(Number(details.rollbackActuation.restoreRevision))
            ? Number(details.rollbackActuation.restoreRevision)
            : null
        } : null
      };
    };
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
    const recoveryJournal = Array.isArray(tracking.recoveryJournal) ? tracking.recoveryJournal : [];
    const latestRecovery = [...recoveryJournal].reverse().find((entry) => String(entry?.hostMessageId || '') === String(targetMesid)) || null;
    const messageText = String(message?.mes || '');
    return {
      currentChatId: host?.chat?.getCurrentChatId?.() || context?.chatId || context?.chat_id || null,
      chatLength: chat.length,
      targetMesid,
      targetMessage: message ? {
        name: message.name || '',
        isUser: message.is_user === true,
        isSystem: message.is_system === true,
        textHash: hashText(messageText),
        textLength: messageText.length
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
      recoveryCount: count(recoveryJournal),
      latestRecovery: compactRecoveryEntry(latestRecovery),
      recentRecoveryJournal: recoveryJournal.slice(-6).map(compactRecoveryEntry).filter(Boolean),
      sceneReconciliation: {
        runsCount: count(reconciliation.runs),
        lastResult: clone(reconciliation.lastResult || null)
      }
    };
  }, { modulePath: bridgeModulePath(), targetMesid });
}

async function clickVisibleConfirmation(page) {
  const selectors = [
    '#dialogue_popup_ok',
    '#dialogue_popup .popup-button-ok',
    '#dialogue_popup .menu_button:has-text("Delete")',
    '#dialogue_popup .menu_button:has-text("Yes")',
    '.dialogue_popup .popup-button-ok',
    '.dialogue_popup .menu_button:has-text("Delete")',
    '.dialogue_popup .menu_button:has-text("Yes")',
    '.swal2-confirm',
    'button:has-text("Delete")',
    'button:has-text("Yes")',
    '.popup-button-ok',
    '.menu_button:has-text("Delete")',
    '.menu_button:has-text("Yes")',
    '.menu_button:has-text("OK")'
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible({ timeout: 500 }).catch(() => false)) {
      const text = await locator.textContent().catch(() => '');
      const box = await locator.boundingBox().catch(() => null);
      await locator.click({ timeout: 5000 });
      return {
        clicked: true,
        selector,
        labelHash: sha256Text(text || '').slice(0, 16),
        labelLength: String(text || '').length,
        box
      };
    }
  }
  return { clicked: false };
}

async function clickDeleteAndConfirm(page, before) {
  const row = page.locator(`#chat .mes[mesid="${cssAttrValue(TARGET_MESID)}"]`).first();
  await row.waitFor({ state: 'attached', timeout: 10000 });
  await row.evaluate((element) => element.scrollIntoView?.({ block: 'start', inline: 'nearest' }));
  await page.waitForTimeout(150);
  await row.hover({ timeout: 5000 }).catch(() => {});

  const originalText = before?.targetMessage?.text || await row.locator('.mes_text').first().textContent().catch(() => '');
  const editButton = row.locator('.mes_edit').first();
  const editButtonBox = await editButton.boundingBox().catch(() => null);
  await editButton.click({ timeout: 8000 });
  await row.locator('.mes_edit_buttons').first().waitFor({ state: 'visible', timeout: 10000 });

  const deleteButton = row.locator('.mes_edit_delete').first();
  const deleteButtonBox = await deleteButton.boundingBox().catch(() => null);
  const dialog = { seen: false, type: null, message: null };
  page.once('dialog', async (nativeDialog) => {
    dialog.seen = true;
    dialog.type = nativeDialog.type();
    dialog.message = nativeDialog.message();
    await nativeDialog.accept().catch(() => {});
  });
  await deleteButton.click({ timeout: 8000 });
  await page.waitForTimeout(250);
  const confirmation = await clickVisibleConfirmation(page);
  await page.waitForFunction(({ targetMesid, beforeChatLength, beforeText }) => {
    const row = document.querySelector(`#chat .mes[mesid="${String(targetMesid).replace(/"/g, '\\"')}"]`);
    const rows = document.querySelectorAll('#chat .mes[mesid]');
    const rowText = row?.querySelector?.('.mes_text')?.textContent || '';
    return rows.length < beforeChatLength || !row || rowText !== beforeText;
  }, {
    targetMesid: TARGET_MESID,
    beforeChatLength: Number(before?.chatLength || 0),
    beforeText: originalText
  }, { timeout: 15000 }).catch(() => {});
  return {
    targetMesid: TARGET_MESID,
    originalTextHash: sha256Text(originalText).slice(0, 16),
    originalTextLength: originalText.length,
    editButtonBox,
    deleteButtonBox,
    confirmation,
    nativeDialog: dialog
  };
}

async function waitForDirectiveRecovery(page, before) {
  const beforeRecoveryCount = Number(before?.recoveryCount || 0);
  const beforeIngressStatus = before?.ingress?.status || null;
  const beforeIngressDeletedAt = before?.ingress?.deletedAt || null;
  const beforeResponseStatus = before?.response?.status || null;
  const beforeResponseDeletedAt = before?.response?.deletedAt || null;
  const beforeTextHash = before?.targetMessage?.textHash || '';
  const deadline = Date.now() + 60000;
  let latest = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1000);
    const snapshot = await runtimeSnapshot(page).catch(() => null);
    if (!snapshot) continue;
    latest = snapshot;
    const messageRemoved = !snapshot.targetMessage || (beforeTextHash && snapshot.targetMessage?.textHash !== beforeTextHash);
    const recoveryChanged = Number(snapshot.recoveryCount || 0) > beforeRecoveryCount;
    const ingressChanged = (snapshot.ingress?.status && snapshot.ingress.status !== beforeIngressStatus)
      || (snapshot.ingress?.deletedAt && snapshot.ingress.deletedAt !== beforeIngressDeletedAt);
    const responseChanged = (snapshot.response?.status && snapshot.response.status !== beforeResponseStatus)
      || (snapshot.response?.deletedAt && snapshot.response.deletedAt !== beforeResponseDeletedAt);
    const targetWasTracked = Boolean(before?.ingress || before?.response);
    const targetTrackingChanged = Boolean(ingressChanged || responseChanged);
    if (messageRemoved && (targetTrackingChanged || (!targetWasTracked && recoveryChanged))) return { ok: true, snapshot };
  }
  return { ok: false, timedOut: true, snapshot: latest };
}

function compactProofDecision(after = {}, trackedKind = 'ingress') {
  const latest = after?.latestRecovery || null;
  return latest?.repairDecision
    || latest?.coreRecovery?.decision
    || after?.[trackedKind]?.repairDecision
    || after?.[trackedKind]?.coreRecovery?.decision
    || null;
}

function compactProofRecovery(after = {}, trackedKind = 'ingress') {
  return after?.latestRecovery?.coreRecovery
    || after?.[trackedKind]?.coreRecovery
    || null;
}

function trackingChangedForProof(before = {}, after = {}, trackedKind = 'ingress') {
  const a = before?.[trackedKind] || null;
  const b = after?.[trackedKind] || null;
  if (!a && !b) return false;
  return a?.status !== b?.status
    || a?.editedAt !== b?.editedAt
    || a?.deletedAt !== b?.deletedAt
    || a?.invalidatedAt !== b?.invalidatedAt
    || a?.recoveryId !== b?.recoveryId
    || a?.replacementTextSet !== b?.replacementTextSet;
}

function sourceMutationProof({ mutationKind, before = {}, after = {}, control = {} } = {}) {
  const trackedKind = before?.ingress ? 'ingress' : 'response';
  const sourceRole = trackedKind === 'ingress' ? 'source' : 'assistant';
  const coreRecovery = compactProofRecovery(after, trackedKind);
  const repairDecision = compactProofDecision(after, trackedKind);
  return {
    kind: 'directive.sourceMutationProof.v1',
    mutationKind,
    sourceRole,
    trackedKind,
    targetHostMessageId: String(before?.targetMesid || after?.targetMesid || control?.targetMesid || ''),
    nativeHostControlMoved: Boolean(control?.editButtonBox && control?.deleteButtonBox && (control?.confirmation?.clicked === true || control?.nativeDialog?.seen === true)),
    nativeHostControls: {
      editButton: Boolean(control?.editButtonBox),
      deleteButton: Boolean(control?.deleteButtonBox),
      confirmation: control?.confirmation?.clicked === true,
      nativeDialog: control?.nativeDialog?.seen === true
    },
    textHashes: {
      original: control?.originalTextHash || null
    },
    messageRemoved: !after?.targetMessage || after?.targetMessage?.textHash !== before?.targetMessage?.textHash,
    chatLengthDelta: Number(after?.chatLength || 0) - Number(before?.chatLength || 0),
    trackingChanged: Boolean(trackingChangedForProof(before, after, trackedKind)),
    recoveryDelta: Number(after?.recoveryCount || 0) - Number(before?.recoveryCount || 0),
    promptContextRevisionDelta: Number(after?.promptContextRevision || 0) - Number(before?.promptContextRevision || 0),
    beforeStatus: before?.[trackedKind]?.status || null,
    afterStatus: after?.[trackedKind]?.status || null,
    coreRecovery,
    repairDecision
  };
}

async function liveReport(paths = null) {
  if (!BASE_URL) return { status: 'skipped', reason: 'SILLYTAVERN_BASE_URL is required.' };
  if (!LIVE) return { status: 'skipped', reason: 'Pass --live to delete a live SillyTavern message.' };
  if (!isNonHumanSillyTavernUser(SILLYTAVERN_USER)) {
    return { status: 'fail', failures: ['DIRECTIVE_SILLYTAVERN_USER must be set to a non-human soak user; default-user is reserved for human testing.'] };
  }
  if (!TARGET_MESID) return { status: 'fail', failures: ['DIRECTIVE_MESSAGE_DELETE_TARGET_MESID is required.'] };
  const browserResult = await launchPlaywrightBrowser({ headless: HEADLESS });
  if (!browserResult.ok) return { status: 'fail', failures: [browserResult.error?.message || 'Playwright browser launch failed.'], browser: browserResult };
  const auth = await authenticateSillyTavernUser({ baseUrl: BASE_URL, handle: SILLYTAVERN_USER, password: sillyTavernPassword() });
  if (!auth?.ok) {
    await browserResult.browser.close();
    return { status: 'fail', failures: [auth?.error || `SillyTavern login failed for ${SILLYTAVERN_USER}.`], auth };
  }
  const served = await compareServedExtension({
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    localRoot: process.cwd(),
    headers: auth?.headers || {},
    timeoutMs: 20000
  });
  if (paths?.hostExtensions) writeJsonFile(path.join(paths.hostExtensions, 'served-extension-compare.json'), served);
  if (served.ok !== true) {
    await browserResult.browser.close();
    return {
      status: 'fail',
      failures: ['Served Directive extension is not synced with the current checkout.'],
      baseUrl: BASE_URL,
      sillyTavernUser: SILLYTAVERN_USER || null,
      servedExtension: summarizeServedExtension(served)
    };
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
    const openCampaign = await openCampaignChat(page);
    if (RESUME_CHAT_ID && openCampaign.expectedChatMatches !== true) {
      throw new Error(`Opened chat did not match expected chat id. Actual: ${openCampaign.currentChatId || 'unknown'}`);
    }
    const before = await runtimeSnapshot(page);
    const deletion = await clickDeleteAndConfirm(page, before);
    if (paths?.screenshots) await page.screenshot({ path: path.join(paths.screenshots, 'message-deleted.png'), fullPage: false }).catch(() => null);
    const waited = await waitForDirectiveRecovery(page, before);
    const after = waited.snapshot || await runtimeSnapshot(page);
    const status = waited.ok ? 'pass' : 'warning';
    const proof = sourceMutationProof({
      mutationKind: 'delete',
      before,
      after,
      control: deletion
    });
    return {
      schemaVersion: 1,
      kind: 'directive.sillytavernMessageDelete.live',
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      status,
      baseUrl: BASE_URL,
      sillyTavernUser: SILLYTAVERN_USER || null,
      servedExtension: summarizeServedExtension(served),
      resumeSaveId: RESUME_SAVE_ID || null,
      expectedChatId: RESUME_CHAT_ID || null,
      openCampaign,
      deletion,
      sourceMutationProof: proof,
      waited,
      before: {
        ...before,
        targetMessage: before.targetMessage ? { ...before.targetMessage, text: undefined, textPreview: undefined } : null
      },
      after: {
        ...after,
        targetMessage: after.targetMessage ? { ...after.targetMessage, text: undefined, textPreview: undefined } : null
      },
      deltas: {
        chatLength: Number(after.chatLength || 0) - Number(before.chatLength || 0),
        recovery: Number(after.recoveryCount || 0) - Number(before.recoveryCount || 0),
        promptContextRevision: Number(after.promptContextRevision || 0) - Number(before.promptContextRevision || 0)
      }
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      kind: 'directive.sillytavernMessageDelete.live',
      runId: RUN_ID,
      generatedAt: new Date().toISOString(),
      status: 'fail',
      failures: [error?.message || String(error)],
      baseUrl: BASE_URL,
      sillyTavernUser: SILLYTAVERN_USER || null,
      servedExtension: summarizeServedExtension(served),
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
    type: 'message-delete-live',
    status: 'in_progress',
    worker: SILLYTAVERN_USER || null,
    segment: SEGMENT,
    summary: `Deleting live SillyTavern message ${TARGET_MESID} through native host controls.`,
    saveId: RESUME_SAVE_ID || null,
    chatId: RESUME_CHAT_ID || null,
    targetMesid: TARGET_MESID
  });
  const report = await liveReport(paths);
  if (paths) writeJsonFile(paths.report, report);
  logLive({
    type: 'message-delete-live',
    status: report.status,
    worker: SILLYTAVERN_USER || null,
    segment: SEGMENT,
    summary: report.status === 'pass'
      ? 'Native SillyTavern message delete completed and Directive recorded a recovery/reconciliation state change for the deleted message.'
      : `Native SillyTavern message delete completed with status ${report.status}.`,
    saveId: RESUME_SAVE_ID || null,
    chatId: report.after?.currentChatId || RESUME_CHAT_ID || null,
    targetMesid: TARGET_MESID,
    originalTextHash: report.deletion?.originalTextHash || null,
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
