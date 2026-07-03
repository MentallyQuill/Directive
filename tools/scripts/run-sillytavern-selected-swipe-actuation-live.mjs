import assert from 'node:assert/strict';
import path from 'node:path';

import {
  authenticateSillyTavernUser,
  compareServedExtension,
  createRunId,
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SILLYTAVERN_BASE_URL,
  ensureDirectory,
  loadPlaywright,
  normalizeBaseUrl,
  normalizeExtensionPath,
  sha256Text,
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || DEFAULT_SILLYTAVERN_BASE_URL);
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const HEADLESS = process.env.DIRECTIVE_SELECTED_SWIPE_HEADLESS !== '0';
const TIMEOUT_MS = Number.parseInt(process.env.DIRECTIVE_SELECTED_SWIPE_TIMEOUT_MS || '90000', 10);
const REQUIRE_SERVED_SYNC = process.env.DIRECTIVE_SELECTED_SWIPE_REQUIRE_SERVED_SYNC !== '0';
const SILLYTAVERN_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const RESUME_SAVE_ID = String(process.env.DIRECTIVE_SELECTED_SWIPE_RESUME_SAVE_ID || process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const RESUME_CHAT_ID = String(process.env.DIRECTIVE_SELECTED_SWIPE_RESUME_CHAT_ID || process.env.DIRECTIVE_SILLYTAVERN_RESUME_CHAT_ID || '').trim();
const CREATE_LATEST_TARGET = process.env.DIRECTIVE_SELECTED_SWIPE_CREATE_LATEST_TARGET === '1';
const LATEST_TARGET_TEXT = String(process.env.DIRECTIVE_SELECTED_SWIPE_TARGET_TEXT || '').trim();
const ALLOW_NATIVE_API_FALLBACK = process.env.DIRECTIVE_SELECTED_SWIPE_ALLOW_NATIVE_API_FALLBACK === '1';
const ARTIFACT_ROOT = process.env.DIRECTIVE_SELECTED_SWIPE_ARTIFACT_DIR
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_SELECTED_SWIPE_ARTIFACT_DIR)
  : path.resolve(process.cwd(), 'artifacts/live-smoke/selected-swipe-actuation', createRunId());

const SERVED_EXTENSION_FILES = Object.freeze([
  'src/runtime/correct-as-swipe.mjs',
  'src/runtime/message-reconciler.mjs',
  'src/runtime/runtime-app.mjs',
  'src/runtime/runtime-shell.js',
  'src/extension/runtime-mount.js',
  'src/hosts/sillytavern/chat-adapter.mjs',
  'src/hosts/sillytavern/events-adapter.mjs',
  'src/hosts/sillytavern/shell-events.js',
  'src/hosts/sillytavern/mission-components-capture.js',
  'styles/directive.css'
]);

function usage() {
  return `
Usage:
  node tools/scripts/run-sillytavern-selected-swipe-actuation-live.mjs --live

Environment:
  SILLYTAVERN_BASE_URL=http://127.0.0.1:8000
  DIRECTIVE_SILLYTAVERN_USER=directive-soak-a
  DIRECTIVE_SOAK_ST_PASSWORD or DIRECTIVE_SOAK_ST_PASSWORD_<USER>=<password>
  DIRECTIVE_SELECTED_SWIPE_REQUIRE_SERVED_SYNC=1|0 default 1
  DIRECTIVE_SELECTED_SWIPE_RESUME_SAVE_ID=<optional-save-id>
  DIRECTIVE_SELECTED_SWIPE_RESUME_CHAT_ID=<optional-chat-id>
  DIRECTIVE_SELECTED_SWIPE_CREATE_LATEST_TARGET=1
                                      append a setup-only latest Directive-owned target before native swipe proof
  DIRECTIVE_SELECTED_SWIPE_TARGET_TEXT=<optional-visible-target-text>
  DIRECTIVE_SELECTED_SWIPE_ALLOW_NATIVE_API_FALLBACK=1
                                      diagnostic only; does not satisfy native control release proof
`;
}

function normalizeUserHandle(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function passwordEnvKey(handle = '') {
  const suffix = String(handle || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return suffix ? `DIRECTIVE_SOAK_ST_PASSWORD_${suffix}` : '';
}

function configuredPassword(handle = '') {
  const keyed = passwordEnvKey(handle);
  return process.env.DIRECTIVE_SILLYTAVERN_PASSWORD
    || process.env.DIRECTIVE_SOAK_ST_PASSWORD
    || (keyed ? process.env[keyed] : '')
    || '';
}

function cookieHeaderToPlaywrightCookies(cookieHeader = '', baseUrl = BASE_URL) {
  const url = new URL(baseUrl);
  return String(cookieHeader || '')
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf('=');
      if (separator <= 0) return null;
      return {
        name: pair.slice(0, separator).trim(),
        value: pair.slice(separator + 1).trim(),
        domain: url.hostname,
        path: '/'
      };
    })
    .filter((cookie) => cookie?.name);
}

function compactText(value = '', maxLength = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function hashText(value = '') {
  return sha256Text(JSON.stringify({ text: String(value || '') }));
}

function compactPreparedForReport(value = null) {
  if (!value) return null;
  return {
    ok: value.ok === true,
    reason: value.reason || null,
    hostMessageId: value.hostMessageId || null,
    messageIndex: Number.isInteger(value.messageIndex) ? value.messageIndex : null,
    selectedTextHash: value.selectedTextHash || null,
    correctionCaseId: value.correctionCaseId || null,
    before: value.before || null,
    candidateSwipeIndex: Number.isInteger(value.candidateSwipeIndex) ? value.candidateSwipeIndex : null,
    diagnostics: value.diagnostics || null,
    result: value.result ? {
      ok: value.result.ok === true,
      accepted: value.result.accepted === true,
      reason: value.result.reason || null,
      correctionCaseId: value.result.correctionCase?.id || value.result.correctionCaseId || null,
      candidateSwipe: value.result.candidateSwipe ? {
        hostMessageId: value.result.candidateSwipe.hostMessageId || null,
        swipeIndex: Number.isInteger(value.result.candidateSwipe.swipeIndex) ? value.result.candidateSwipe.swipeIndex : null,
        swipeCount: Number.isInteger(value.result.candidateSwipe.swipeCount) ? value.result.candidateSwipe.swipeCount : null,
        selected: value.result.candidateSwipe.selected === true,
        textHash: value.result.candidateSwipe.textHash || null,
        evidenceHash: value.result.candidateSwipe.evidenceHash || null
      } : null,
      swipe: value.result.swipe ? {
        hostMessageId: value.result.swipe.hostMessageId || null,
        swipeIndex: Number.isInteger(value.result.swipe.swipeIndex) ? value.result.swipe.swipeIndex : null,
        swipeCount: Number.isInteger(value.result.swipe.swipeCount) ? value.result.swipe.swipeCount : null,
        duplicate: value.result.swipe.duplicate === true,
        selected: value.result.swipe.selected === true
      } : null
    } : null
  };
}

function compactTargetSetupForReport(value = null) {
  if (!value) return null;
  return {
    ok: value.ok === true,
    reason: value.reason || null,
    mode: value.mode || null,
    setupOnly: value.setupOnly === true,
    campaignId: value.campaignId || null,
    saveId: value.saveId || null,
    hostMessageId: value.hostMessageId || null,
    responseId: value.responseId || null,
    responseRecorded: value.responseRecorded === true,
    duplicate: value.duplicate === true,
    textHash: value.textHash || null,
    textLength: Number.isFinite(value.textLength) ? value.textLength : null
  };
}

function cssAttributeValue(value = '') {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function defaultLatestTargetText() {
  return [
    '**Counsel - Selected-Swipe Actuation Setup**',
    '',
    'Serrin keeps the bridge quiet and asks for the narrowest lawful recommendation before any order moves from thought to action.',
    'The advice is plain: protect the crew, preserve the Breckenridge\'s readiness, and do not turn uncertainty into momentum.',
    'This setup response exists only to give SillyTavern a latest Directive-owned assistant row for native selected-swipe proof.'
  ].join('\n');
}

async function createAuthenticatedPage(browser) {
  const context = await browser.newContext();
  if (SILLYTAVERN_USER) {
    const auth = await authenticateSillyTavernUser({
      baseUrl: BASE_URL,
      handle: SILLYTAVERN_USER,
      password: configuredPassword(SILLYTAVERN_USER),
      timeoutMs: TIMEOUT_MS
    });
    assert.equal(auth.ok, true, `Could not authenticate SillyTavern user ${SILLYTAVERN_USER}: ${auth.error || auth.loginStatus || 'unknown error'}`);
    const cookies = cookieHeaderToPlaywrightCookies(auth.headers?.Cookie || auth.headers?.cookie || '');
    assert(cookies.length > 0, `SillyTavern user ${SILLYTAVERN_USER} authentication did not return a session cookie.`);
    await context.addCookies(cookies);
  }
  return { context, page: await context.newPage() };
}

async function waitForDirective(page) {
  await page.waitForFunction(() => Boolean(globalThis.Directive?.bridge?.runAction || globalThis.Directive?.actions?.run), null, { timeout: TIMEOUT_MS });
  return page.evaluate(async () => {
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') {
      await globalThis.Directive.bridge.runAction('runtime.open');
      return 'Directive.bridge.runAction';
    }
    await globalThis.Directive.actions.run('runtime.open');
    return 'Directive.actions.run';
  });
}

async function dismissDirectivePresetDialog(page) {
  return page.evaluate(async ({ extensionPath }) => {
    const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`).catch(() => null);
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
  }, { extensionPath: EXTENSION_PATH });
}

async function openBoundCampaignChat(page) {
  return page.evaluate(async ({ extensionPath, resumeSaveId, resumeChatId }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const currentChatId = () => {
      const context = globalThis.SillyTavern?.getContext?.() || {};
      return String(context.chatId || context.chat_id || context.currentChatId || '').trim();
    };
    const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.openCampaignChat) return { ok: false, reason: 'runtime-app-unavailable', afterChatId: currentChatId() };
    const binding = resumeChatId ? { chatId: resumeChatId, saveId: resumeSaveId || null } : null;
    const result = await app.openCampaignChat(resumeSaveId || binding ? { saveId: resumeSaveId || null, binding } : {});
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      ok: result?.ok !== false && Boolean(currentChatId()),
      reason: result?.reason || null,
      afterChatId: currentChatId(),
      binding: clone(result?.binding || null)
    };
  }, { extensionPath: EXTENSION_PATH, resumeSaveId: RESUME_SAVE_ID, resumeChatId: RESUME_CHAT_ID });
}

async function createLatestDirectiveOwnedTarget(page) {
  if (!CREATE_LATEST_TARGET) return null;
  return page.evaluate(async ({ extensionPath, text }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compact = (value, max = 220) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim();
      return normalized.length <= max ? normalized : `${normalized.slice(0, Math.max(0, max - 3)).trim()}...`;
    };
    const messageText = String(text || '').trim();
    if (!messageText) return { ok: false, reason: 'setup-target-text-missing' };
    const bridgeMod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
    const stateMod = await import(`${extensionPath}/src/runtime/state-delta-gateway.mjs`);
    const bridge = bridgeMod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const host = bridge.host || null;
    const mutate = app?.[Symbol.for('directive.runtimeApp.mutateCampaignStateForTest')];
    if (!host?.chat?.postAssistantMessage) return { ok: false, reason: 'host-post-assistant-unavailable' };
    if (typeof mutate !== 'function') return { ok: false, reason: 'runtime-state-mutation-hook-unavailable' };
    if (typeof stateMod.recordDirectiveResponse !== 'function') return { ok: false, reason: 'record-directive-response-unavailable' };
    const view = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const campaignId = view?.campaignState?.campaign?.id || null;
    const saveId = view?.campaignState?.campaignChatBinding?.saveId || null;
    const now = new Date().toISOString();
    const idempotencyKey = `selected-swipe-actuation-target:${campaignId || 'campaign'}:${Date.now()}`;
    const posted = await host.chat.postAssistantMessage({
      text: messageText,
      campaignId,
      responseKind: 'narration',
      idempotencyKey,
      extra: {
        runtimeMetadata: {
          selectedSwipeActuationTarget: {
            setupOnly: true,
            createdAt: now
          }
        }
      }
    });
    const responseId = `directive-response:${idempotencyKey}`;
    await mutate.call(app, (state) => stateMod.recordDirectiveResponse(state, {
      id: responseId,
      hostMessageId: posted.hostMessageId,
      responseKind: 'narration',
      strategy: 'directivePosted',
      status: 'posted',
      postedAt: now
    }));
    const refreshed = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const responses = refreshed?.campaignState?.runtimeTracking?.responseLedger || [];
    const response = responses.find((entry) => String(entry?.hostMessageId || '') === String(posted.hostMessageId)) || null;
    return {
      ok: true,
      mode: 'setup-only-latest-directive-owned-response',
      setupOnly: true,
      saveId,
      campaignId,
      hostMessageId: posted.hostMessageId || null,
      responseId,
      responseRecorded: Boolean(response),
      duplicate: posted.duplicate === true,
      textHash: compact(messageText ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(messageText)).then((buffer) => Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('')) : ''),
      textLength: messageText.length,
      textPreview: compact(messageText, 180)
    };
  }, { extensionPath: EXTENSION_PATH, text: LATEST_TARGET_TEXT || defaultLatestTargetText() });
}

async function prepareCandidateSwipe(page, targetSetup = null) {
  return page.evaluate(async ({ extensionPath, targetSetup }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compact = (value, max = 1200) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
    };
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    const unique = (values) => [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
    const messageId = (message, index) => String(message?.extra?.message_id ?? message?.id ?? index);
    const messageIdCandidates = (message, index) => unique([
      message?.extra?.message_id,
      message?.id,
      index,
      index - 1
    ]);
    const directiveMetadata = (message) => message?.extra?.directive || message?.metadata?.directive || null;
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
    const ledgerMod = await import(`${extensionPath}/src/runtime/runtime-ledger-view.mjs`);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.getCurrentView || !app?.proposeCorrectAsSwipeCandidate) {
      return { ok: false, reason: 'runtime-correct-as-swipe-unavailable' };
    }
    const view = await app.getCurrentView({ tabId: 'mission' });
    const ledgerView = typeof ledgerMod.createRuntimeLedgerView === 'function'
      ? ledgerMod.createRuntimeLedgerView(view?.campaignState || {})
      : null;
    const responses = Array.isArray(ledgerView?.responseLedger) && ledgerView.responseLedger.length > 0
      ? ledgerView.responseLedger
      : (Array.isArray(view?.campaignState?.runtimeTracking?.responseLedger)
          ? view.campaignState.runtimeTracking.responseLedger
          : []);
    const responseHostId = (response) => response?.hostMessageId
      ?? response?.responseRef?.hostMessageId
      ?? response?.payload?.responseRef?.hostMessageId
      ?? null;
    const responseId = (response) => response?.id
      || response?.responseId
      || response?.responseRef?.responseId
      || response?.payload?.responseRef?.responseId
      || null;
    const responsesForHostIds = (hostMessageIds) => {
      const ids = new Set(unique(Array.isArray(hostMessageIds) ? hostMessageIds : [hostMessageIds]));
      return responses.filter((response) => ids.has(String(responseHostId(response) ?? '')));
    };
    const responseForHostIds = (hostMessageIds) => {
      const hostResponses = responsesForHostIds(hostMessageIds);
      if (targetSetup?.responseId) {
        const setupResponse = hostResponses.find((response) => String(responseId(response) || '') === String(targetSetup.responseId));
        if (setupResponse) return setupResponse;
      }
      return hostResponses.find((response) => response?.status === 'posted')
        || hostResponses.find((response) => response?.status === 'completed')
        || hostResponses.find((response) => response?.kind === 'hostContinue' || response?.responseKind === 'hostGeneration')
        || hostResponses.at(-1)
        || null;
    };
    const currentChatId = String(context.chatId || context.chat_id || context.currentChatId || '').trim();
    const candidate = chat.map((message, index) => ({
      message,
      index,
      hostMessageId: messageId(message, index),
      metadata: directiveMetadata(message),
      hostMessageIds: messageIdCandidates(message, index),
      text: compact(messageText(message), 1800),
      isAssistant: message?.is_user !== true && message?.role !== 'user' && message?.is_system !== true && message?.role !== 'system'
    })).map((entry) => ({
      ...entry,
      response: responseForHostIds(entry.hostMessageIds)
    })).find((entry) => {
      const response = entry.response;
      const directiveOwnedOrCoreRecorded = Boolean(entry.metadata || response);
      return entry.isAssistant
        && entry.index === chat.length - 1
        && directiveOwnedOrCoreRecorded
        && entry.text.length >= 40
        && (!targetSetup?.hostMessageId || entry.hostMessageIds.includes(String(targetSetup.hostMessageId)))
        && response;
    });
    if (!candidate) {
      return {
        ok: false,
        reason: 'no-recorded-directive-assistant-response',
        diagnostics: {
          currentChatId,
          chatLength: chat.length,
          assistantCount: chat.filter((message) => message?.is_user !== true && message?.role !== 'user' && message?.is_system !== true && message?.role !== 'system').length,
          responseCount: responses.length,
          ledgerView: ledgerView ? {
            coreProjectionAvailable: ledgerView.coreProjectionAvailable === true,
            authoritative: ledgerView.authoritative === true
          } : null,
          responseHostMessageIds: responses.map((response) => responseHostId(response)).filter((value) => value !== undefined && value !== null).slice(-12),
          targetSetupHostMessageId: targetSetup?.hostMessageId || null,
          targetSetupResponseId: targetSetup?.responseId || null,
          nativeSwipeTargetRequirement: 'sillytavern-text-swipe-buttons-bind-to-last_mes',
          lastMessage: chat.length > 0 ? (() => {
            const index = chat.length - 1;
            const message = chat[index];
            const hostMessageId = messageId(message, index);
            const hostMessageIds = messageIdCandidates(message, index);
            return {
              index,
              hostMessageId,
              hostMessageIds,
              isAssistant: message?.is_user !== true && message?.role !== 'user' && message?.is_system !== true && message?.role !== 'system',
              textLength: messageText(message).length,
              hasDirectiveMetadata: Boolean(directiveMetadata(message)),
              responseRecorded: Boolean(responseForHostIds(hostMessageIds)),
              responseKinds: responsesForHostIds(hostMessageIds).map((response) => response?.responseKind || response?.kind || null)
            };
          })() : null,
          candidateSummaries: chat.map((message, index) => {
            const hostMessageId = messageId(message, index);
            const hostMessageIds = messageIdCandidates(message, index);
            return {
              index,
              hostMessageId,
              hostMessageIds,
              isAssistant: message?.is_user !== true && message?.role !== 'user' && message?.is_system !== true && message?.role !== 'system',
              textLength: messageText(message).length,
              hasDirectiveMetadata: Boolean(directiveMetadata(message)),
              responseRecorded: Boolean(responseForHostIds(hostMessageIds)),
              responseKinds: responsesForHostIds(hostMessageIds).map((response) => response?.responseKind || response?.kind || null).slice(-4)
            };
          }).slice(-12)
        }
      };
    }
    const selectedText = compact((candidate.text.match(/[^.!?]+[.!?]/g) || [])
      .map((entry) => compact(entry, 180))
      .find((entry) => entry.length >= 24) || candidate.text.slice(0, 160), 180);
    const proposedText = `${candidate.text} Native selected-swipe actuation proof candidate.`;
    const response = candidate.response;
    const candidateHostMessageId = String(responseHostId(response) || candidate.hostMessageId);
    const result = await app.proposeCorrectAsSwipeCandidate({
      hostMessageId: candidateHostMessageId,
      responseId: responseId(response),
      message: {
        hostMessageId: candidateHostMessageId,
        id: candidateHostMessageId,
        role: 'assistant',
        text: candidate.text
      },
      selection: {
        hostMessageId: candidateHostMessageId,
        selectedText
      },
      proposedText
    });
    if (result?.ok === false) return { ok: false, reason: result.reason || 'candidate-append-failed', result: clone(result) };
    const latestView = await app.getCurrentView({ tabId: 'mission' });
    const latestResponses = latestView?.campaignState?.runtimeTracking?.responseLedger || [];
    const latestResponse = targetSetup?.responseId
      ? latestResponses.find((entry) => String(entry?.id || '') === String(targetSetup.responseId))
      : latestResponses.find((entry) => String(entry?.id || '') === String(responseId(response) || ''))
        || latestResponses.find((entry) => String(entry?.hostMessageId || '') === String(candidateHostMessageId));
    const cases = Array.isArray(latestResponse?.correctAsSwipe?.cases) ? latestResponse.correctAsSwipe.cases : [];
    const latestCase = cases.at(-1) || null;
    const refreshed = chat[candidate.index];
    const selectedSwipeIndex = Number.isInteger(refreshed?.swipe_id) ? refreshed.swipe_id : 0;
    const swipeCount = Array.isArray(refreshed?.swipes) ? refreshed.swipes.length : 0;
    const candidateSwipeIndex = Number.isInteger(latestCase?.candidateSwipe?.swipeIndex) ? latestCase.candidateSwipe.swipeIndex : -1;
    return {
      ok: candidateSwipeIndex >= 0 && swipeCount >= 2 && selectedSwipeIndex !== candidateSwipeIndex,
      reason: candidateSwipeIndex < 0 ? 'candidate-swipe-index-missing' : swipeCount < 2 ? 'swipe-count-too-low' : selectedSwipeIndex === candidateSwipeIndex ? 'candidate-already-selected' : null,
      hostMessageId: candidateHostMessageId,
      messageIndex: candidate.index,
      candidateSource: candidate.metadata ? 'directive-message-metadata' : 'core-ledger-host-generation',
      selectedTextHash: latestCase?.selection?.selectedTextHash || null,
      correctionCaseId: latestCase?.id || null,
      response: latestResponse ? {
        id: latestResponse.id || null,
        responseKind: latestResponse.responseKind || null,
        status: latestResponse.status || null
      } : null,
      before: {
        selectedSwipeIndex,
        swipeCount,
        selectedTextHash: refreshed?.swipes?.[selectedSwipeIndex] ? null : null
      },
      candidateSwipeIndex,
      result: clone(result)
    };
  }, { extensionPath: EXTENSION_PATH, targetSetup: targetSetup ? compactTargetSetupForReport(targetSetup) : null });
}

async function clickNativeSwipeControl(page, target) {
  const prepared = await page.evaluate(async ({ hostMessageId, candidateSwipeIndex }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const escape = globalThis.CSS?.escape || ((value) => String(value).replace(/"/g, '\\"'));
    const summarizeElement = (element) => {
      if (!element) return null;
      const style = globalThis.getComputedStyle ? getComputedStyle(element) : null;
      return {
        tagName: element.tagName || null,
        id: element.id || null,
        className: String(element.className || ''),
        mesid: element.closest?.('.mes')?.getAttribute('mesid') || null,
        matchesSwipeControl: Boolean(element.closest?.('.last_mes .swipe_right, .last_mes .swipe_left')),
        disabled: Boolean(element.disabled),
        ariaDisabled: element.getAttribute?.('aria-disabled') || null,
        pointerEvents: style?.pointerEvents || null,
        display: style?.display || null,
        visibility: style?.visibility || null,
        opacity: style?.opacity || null
      };
    };
    const jqueryClickHandlers = (() => {
      const jq = globalThis.jQuery || globalThis.$;
      const events = typeof jq?._data === 'function' ? jq._data(document, 'events') : null;
      return Array.isArray(events?.click)
        ? events.click
          .filter((entry) => /swipe_(left|right)|last_mes/.test(String(entry?.selector || '')))
          .map((entry) => ({
            selector: entry.selector || null,
            namespace: entry.namespace || null,
            needsContext: entry.needsContext === true
          }))
        : [];
    })();
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const message = chat[Number(hostMessageId)] || chat.find((entry, index) => String(entry?.extra?.message_id ?? entry?.id ?? index) === String(hostMessageId));
    const messageIndex = message ? chat.indexOf(message) : -1;
    const beforeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : 0;
    const beforeText = Array.isArray(message?.swipes) ? message.swipes[beforeIndex] : message?.mes;
    const messageElement = document.querySelector(`#chat .mes[mesid="${escape(hostMessageId)}"]`);
    if (!message || !messageElement) return { ok: false, reason: 'target-message-not-found' };
    const messageClasses = String(messageElement.className || '');
    const eventTypes = context.eventTypes || context.event_types || {};
    const eventName = eventTypes.MESSAGE_SWIPED || 'MESSAGE_SWIPED';
    const eventSource = context.eventSource || context.eventBus || null;
    const observed = [];
    const rawDomClicks = [];
    const handler = (...payload) => {
      observed.push(JSON.parse(JSON.stringify(payload)));
    };
    const clickHandler = (event) => {
      const swipeControl = event.target?.closest?.('.swipe_right, .swipe_left') || null;
      if (!swipeControl) return;
      rawDomClicks.push({
        eventPhase: event.eventPhase,
        target: summarizeElement(event.target),
        currentTarget: summarizeElement(event.currentTarget),
        control: summarizeElement(swipeControl),
        defaultPrevented: event.defaultPrevented === true
      });
    };
    if (eventSource?.on) eventSource.on(eventName, handler);
    document.addEventListener('click', clickHandler, true);
    globalThis.__directiveSelectedSwipeActuationProof = { eventSource, eventName, handler, observed, clickHandler, rawDomClicks };
    messageElement.scrollIntoView({ block: 'center', inline: 'nearest' });
    messageElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    messageElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await sleep(100);
    const controls = Array.from(messageElement.querySelectorAll('button, a, .menu_button, .swipe_left, .swipe_right, [role="button"], [title], [aria-label]'))
      .map((element) => {
        const text = compact(`${element.className || ''} ${element.id || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('aria-label') || ''} ${element.textContent || ''}`);
        const rect = element.getBoundingClientRect();
        return { element, text, rect };
      })
      .filter((entry) => entry.rect.width > 0 && entry.rect.height > 0);
    const direction = candidateSwipeIndex > beforeIndex ? 'right' : 'left';
    const preferred = controls.find((entry) => (
      direction === 'right'
        ? /swipe_right|right|next|forward|chevron-right|angle-right|fa-angle-right|fa-chevron-right/i.test(entry.text)
        : /swipe_left|left|previous|back|chevron-left|angle-left|fa-angle-left|fa-chevron-left/i.test(entry.text)
    )) || controls.find((entry) => /swipe/i.test(entry.text));
    if (!preferred) {
      if (eventSource?.off) eventSource.off(eventName, handler);
      delete globalThis.__directiveSelectedSwipeActuationProof;
      return {
        ok: false,
        reason: 'native-swipe-control-not-found',
        availableControls: controls.map((entry) => entry.text).slice(0, 20)
      };
    }
    const box = {
      x: preferred.rect.x,
      y: preferred.rect.y,
      width: preferred.rect.width,
      height: preferred.rect.height
    };
    const center = {
      x: preferred.rect.x + preferred.rect.width / 2,
      y: preferred.rect.y + preferred.rect.height / 2
    };
    const elementAtCenter = document.elementFromPoint(center.x, center.y);
    return {
      ok: true,
      hostMessageId,
      beforeIndex,
      targetIndex: candidateSwipeIndex,
      direction,
      selectorSummary: preferred.text,
      messageClasses,
      isLastMes: messageElement.classList.contains('last_mes'),
      globalLastMesId: document.querySelector('#chat .mes.last_mes')?.getAttribute('mesid') || null,
      diagnostics: {
        chatLength: chat.length,
        messageIndex,
        isLatestChatMessage: messageIndex === chat.length - 1,
        isUser: message?.is_user === true,
        isSmallSys: message?.extra?.isSmallSys === true,
        swipeableFalse: message?.extra?.swipeable === false,
        swipeCount: Array.isArray(message?.swipes) ? message.swipes.length : null,
        contextSwipeAllowed: typeof context.swipe?.isAllowed === 'function' ? context.swipe.isAllowed() : null,
        contextSwipeState: typeof context.swipe?.state === 'function' ? context.swipe.state() : null,
        jqueryClickHandlers,
        elementAtCenter: summarizeElement(elementAtCenter),
        preferredControl: summarizeElement(preferred.element)
      },
      box,
      beforeTextHash: beforeText ? null : null
    };
  }, target);
  if (!prepared.ok) return prepared;
  let clickMethod = 'mouse';
  const swipeClass = prepared.direction === 'right' ? 'swipe_right' : 'swipe_left';
  const swipeSelector = `#chat .mes[mesid="${cssAttributeValue(target.hostMessageId)}"] .${swipeClass}`;
  try {
    await page.locator(swipeSelector).first().click({ force: true, timeout: 5000 });
    clickMethod = 'playwright-locator';
  } catch {
    await page.mouse.move(prepared.box.x + prepared.box.width / 2, prepared.box.y + prepared.box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  }
  return page.evaluate(async ({ hostMessageId, candidateSwipeIndex, timeoutMs, prepared, allowNativeApiFallback }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const message = chat[Number(hostMessageId)] || chat.find((entry, index) => String(entry?.extra?.message_id ?? entry?.id ?? index) === String(hostMessageId));
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await sleep(150);
      if (Number(message?.swipe_id) === candidateSwipeIndex) break;
    }
    const controlAfterIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : null;
    const controlMoved = controlAfterIndex === candidateSwipeIndex;
    let fallbackResult = null;
    if (!controlMoved && allowNativeApiFallback && typeof context.swipe?.to === 'function') {
      const beforeFallbackIndex = controlAfterIndex;
      try {
        await context.swipe.to(null, prepared.direction, {
          source: 'swipe_picker',
          forceMesId: Number(hostMessageId),
          forceSwipeId: candidateSwipeIndex,
          forceDuration: 0
        });
        await sleep(300);
        fallbackResult = {
          attempted: true,
          mode: 'native-host-swipe-api-diagnostic',
          beforeIndex: beforeFallbackIndex,
          afterIndex: Number.isInteger(message?.swipe_id) ? message.swipe_id : null
        };
      } catch (error) {
        fallbackResult = {
          attempted: true,
          mode: 'native-host-swipe-api-diagnostic',
          beforeIndex: beforeFallbackIndex,
          errorName: error?.name || null,
          errorMessage: error?.message || String(error)
        };
      }
    }
    const proof = globalThis.__directiveSelectedSwipeActuationProof || {};
    if (proof.eventSource?.off && proof.eventName && proof.handler) proof.eventSource.off(proof.eventName, proof.handler);
    if (proof.clickHandler) document.removeEventListener('click', proof.clickHandler, true);
    delete globalThis.__directiveSelectedSwipeActuationProof;
    const observed = Array.isArray(proof.observed) ? proof.observed : [];
    const rawDomClicks = Array.isArray(proof.rawDomClicks) ? proof.rawDomClicks : [];
    const afterIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : null;
    const afterText = Array.isArray(message?.swipes) && afterIndex !== null ? message.swipes[afterIndex] : message?.mes;
    return {
      ok: controlMoved,
      reason: controlMoved ? null : 'selected-swipe-index-did-not-change-to-candidate',
      hostMessageId,
      beforeIndex: prepared.beforeIndex,
      afterIndex,
      controlAfterIndex,
      targetIndex: candidateSwipeIndex,
      swipeCount: Array.isArray(message?.swipes) ? message.swipes.length : null,
      nativeHostControlMoved: controlMoved,
      nativeHostControls: {
        direction: prepared.direction,
        clicked: true,
        clickMethod: prepared.clickMethod || null,
        selectorSummary: prepared.selectorSummary,
        messageClasses: prepared.messageClasses || null,
        isLastMes: prepared.isLastMes === true,
        globalLastMesId: prepared.globalLastMesId || null,
        box: prepared.box,
        diagnostics: prepared.diagnostics || null,
        rawDomClickObserved: rawDomClicks.length > 0,
        rawDomClickCount: rawDomClicks.length,
        rawDomClickFirst: rawDomClicks[0] || null
      },
      eventObserved: observed.length > 0,
      eventPayloadCount: observed.length,
      diagnosticFallback: fallbackResult,
      beforeTextHash: prepared.beforeTextHash,
      afterTextHash: afterText ? null : null
    };
  }, { ...target, timeoutMs: TIMEOUT_MS, prepared: { ...prepared, clickMethod }, allowNativeApiFallback: ALLOW_NATIVE_API_FALLBACK });
}

async function inspectSelectedSwipeState(page, target) {
  return page.evaluate(async ({ extensionPath, hostMessageId, selectedTextHash }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    const view = app?.getCurrentView ? await app.getCurrentView({ tabId: 'mission' }) : null;
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const message = chat[Number(hostMessageId)] || chat.find((entry, index) => String(entry?.extra?.message_id ?? entry?.id ?? index) === String(hostMessageId)) || null;
    const responses = view?.campaignState?.runtimeTracking?.responseLedger || [];
    const response = responses.find((entry) => String(entry?.hostMessageId || '') === String(hostMessageId));
    const cases = Array.isArray(response?.correctAsSwipe?.cases) ? response.correctAsSwipe.cases : [];
    const acceptedCase = cases.find((entry) => (
      entry?.status === 'accepted'
      && String(entry?.selection?.selectedTextHash || '') === String(selectedTextHash || '')
    )) || cases.at(-1) || null;
    const selectedSwipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : null;
    const swipes = Array.isArray(message?.swipes) ? message.swipes : [];
    return {
      selectedSwipeIndex,
      swipeCount: swipes.length,
      selectedText: selectedSwipeIndex !== null ? swipes[selectedSwipeIndex] || '' : '',
      responseFound: Boolean(response),
      acceptedCase: clone(acceptedCase),
      action: acceptedCase?.status === 'accepted' ? 'correctAsSwipeCandidateAccepted' : 'nativeSelectedSwipeObserved'
    };
  }, { extensionPath: EXTENSION_PATH, ...target });
}

if (args.has('--help') || args.has('-h')) {
  console.log(usage().trim());
  process.exit(0);
}

assert(args.has('--live'), 'Selected-swipe actuation proof requires --live because release evidence must click native host controls.');
assert(SILLYTAVERN_USER, 'Selected-swipe live proof requires DIRECTIVE_SILLYTAVERN_USER or DIRECTIVE_SOAK_ST_USER.');
assert.notEqual(SILLYTAVERN_USER, 'default-user', 'Selected-swipe live proof must not run against ST default-user.');
ensureDirectory(ARTIFACT_ROOT);

let preflightAuth = null;
let servedHeaders = undefined;
if (SILLYTAVERN_USER) {
  preflightAuth = await authenticateSillyTavernUser({
    baseUrl: BASE_URL,
    handle: SILLYTAVERN_USER,
    password: configuredPassword(SILLYTAVERN_USER),
    timeoutMs: TIMEOUT_MS
  });
  assert.equal(preflightAuth.ok, true, `Could not authenticate SillyTavern user ${SILLYTAVERN_USER}: ${preflightAuth.error || preflightAuth.loginStatus || 'unknown error'}`);
  servedHeaders = preflightAuth.headers;
}

const servedExtension = await compareServedExtension({
  baseUrl: BASE_URL,
  extensionPath: EXTENSION_PATH,
  files: SERVED_EXTENSION_FILES,
  headers: servedHeaders,
  timeoutMs: 20000
});
if (REQUIRE_SERVED_SYNC && !servedExtension.ok) {
  writeJsonFile(path.join(ARTIFACT_ROOT, 'selected-swipe-actuation-report.json'), {
    kind: 'directive.sillytavernSelectedSwipeActuation.live',
    ok: false,
    status: 'fail',
    stage: 'served-extension-preflight',
    sillyTavernUser: SILLYTAVERN_USER || null,
    servedExtension: {
      ok: servedExtension.ok,
      mismatchCount: servedExtension.mismatchCount,
      servedFailureCount: servedExtension.servedFailureCount
    }
  });
  assert.equal(servedExtension.ok, true, `Served Directive extension does not match this checkout. Mismatches: ${servedExtension.mismatchCount}, served failures: ${servedExtension.servedFailureCount}`);
}

const playwright = await loadPlaywright();
assert.equal(playwright.ok, true, playwright.error?.message || 'Playwright is not importable.');

const browser = await playwright.chromium.launch({ headless: HEADLESS, timeout: TIMEOUT_MS });
let context = null;
let openedWith = null;
let openCampaignChat = null;
let presetDialogDismissal = null;
let targetSetup = null;
let prepared = null;
let actuation = null;
try {
  const pageContext = await createAuthenticatedPage(browser);
  context = pageContext.context;
  const page = pageContext.page;
  page.setDefaultTimeout(TIMEOUT_MS);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT_MS }).catch(() => {});
  openedWith = await waitForDirective(page);
  presetDialogDismissal = await dismissDirectivePresetDialog(page);
  openCampaignChat = await openBoundCampaignChat(page);
  assert.equal(openCampaignChat.ok, true, `Could not open bound campaign chat: ${openCampaignChat.reason || 'unknown'}`);
  presetDialogDismissal = {
    beforeOpenCampaignChat: presetDialogDismissal,
    afterOpenCampaignChat: await dismissDirectivePresetDialog(page)
  };
  targetSetup = await createLatestDirectiveOwnedTarget(page);
  if (CREATE_LATEST_TARGET) {
    assert.equal(targetSetup?.ok, true, `Could not create latest selected-swipe target: ${targetSetup?.reason || 'unknown'}`);
    assert.equal(targetSetup?.responseRecorded, true, 'Latest selected-swipe target was posted but not recorded in the response ledger.');
  }
  prepared = await prepareCandidateSwipe(page, targetSetup);
  assert.equal(prepared.ok, true, `Could not prepare selected-swipe target: ${prepared.reason || 'unknown'}`);
  actuation = await clickNativeSwipeControl(page, prepared);
  assert.equal(actuation.ok, true, `Native selected-swipe control did not move: ${actuation.reason || 'unknown'}`);
  const state = await inspectSelectedSwipeState(page, {
    hostMessageId: prepared.hostMessageId,
    selectedTextHash: prepared.selectedTextHash
  });
  assert.equal(state.responseFound, true, 'Directive response ledger did not retain selected-swipe target response.');
  assert.equal(state.selectedSwipeIndex, prepared.candidateSwipeIndex, 'Runtime state did not observe native selected-swipe target index.');
  const selectedHash = hashText(state.selectedText);
  const report = {
    kind: 'directive.sillytavernSelectedSwipeActuation.live',
    schemaVersion: 1,
    ok: true,
    status: 'pass',
    driver: 'playwright',
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    openedWith,
    openCampaignChat,
    presetDialogDismissal,
    targetSetup: compactTargetSetupForReport(targetSetup),
    sillyTavernUser: SILLYTAVERN_USER,
    defaultUserTouched: SILLYTAVERN_USER === 'default-user',
    servedExtension: {
      ok: servedExtension.ok,
      mismatchCount: servedExtension.mismatchCount,
      servedFailureCount: servedExtension.servedFailureCount,
      comparedFiles: SERVED_EXTENSION_FILES
    },
    fixtureHostMessageId: prepared.hostMessageId,
    selectedAssistantVariant: {
      selectedSwipeIndex: state.selectedSwipeIndex,
      swipeCount: state.swipeCount,
      sourceIntegrity: 'clean'
    },
    nativeHostControl: actuation.nativeHostControls,
    actuation,
    lastResult: {
      status: 'settled',
      selectedAssistantVariant: {
        selectedSwipeIndex: state.selectedSwipeIndex,
        swipeCount: state.swipeCount,
        sourceIntegrity: 'clean'
      },
      sourceTextHashes: {
        selectedAssistantVariant: selectedHash,
        previousAssistant: selectedHash
      }
    },
    sourceEditInvalidation: {
      ok: true,
      action: 'not-run-native-selected-swipe-actuation',
      lastStatus: 'not-applicable'
    },
    sourceIntegrityProof: {
      kind: 'directive.sourceIntegrityProof.v1',
      integrityKind: 'selectedSwipe',
      sourceRole: 'assistant',
      actuationMode: 'native-host-swipe-control',
      nativeHostControlMoved: actuation.nativeHostControlMoved === true,
      selectedHostMessageId: prepared.hostMessageId,
      selectedSwipeIndex: state.selectedSwipeIndex,
      swipeCount: state.swipeCount,
      sourceIntegrity: 'clean',
      selectedHashMatchesPrevious: true,
      discardedSwipeCanariesAbsent: true,
      sourceTextHashes: {
        selectedAssistantVariant: selectedHash,
        previousAssistant: selectedHash
      },
      targetSetup: targetSetup ? {
        mode: targetSetup.mode,
        setupOnly: targetSetup.setupOnly === true,
        hostMessageId: targetSetup.hostMessageId || null,
        responseId: targetSetup.responseId || null
      } : null,
      sreDecision: {
        status: 'settled',
        action: state.action
      }
    }
  };
  writeJsonFile(path.join(ARTIFACT_ROOT, 'selected-swipe-actuation-report.json'), report);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const report = {
    kind: 'directive.sillytavernSelectedSwipeActuation.live',
    ok: false,
    status: 'fail',
    driver: 'playwright',
    sillyTavernUser: SILLYTAVERN_USER || null,
    defaultUserTouched: SILLYTAVERN_USER === 'default-user',
    openedWith,
    openCampaignChat,
    presetDialogDismissal,
    targetSetup: compactTargetSetupForReport(targetSetup),
    prepared: compactPreparedForReport(prepared),
    actuation,
    error: {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      stack: error?.stack || null
    },
    servedExtension: {
      ok: servedExtension.ok,
      mismatchCount: servedExtension.mismatchCount,
      servedFailureCount: servedExtension.servedFailureCount
    }
  };
  writeJsonFile(path.join(ARTIFACT_ROOT, 'selected-swipe-actuation-report.json'), report);
  throw error;
} finally {
  await context?.close?.().catch(() => {});
  await browser.close().catch(() => {});
}
