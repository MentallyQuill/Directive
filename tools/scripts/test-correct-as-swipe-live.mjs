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
  writeJsonFile
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || DEFAULT_SILLYTAVERN_BASE_URL);
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const HEADLESS = process.env.DIRECTIVE_CORRECT_AS_SWIPE_HEADLESS !== '0';
const TIMEOUT_MS = Number.parseInt(process.env.DIRECTIVE_CORRECT_AS_SWIPE_TIMEOUT_MS || '90000', 10);
const REQUIRE_SERVED_SYNC = process.env.DIRECTIVE_CORRECT_AS_SWIPE_REQUIRE_SERVED_SYNC !== '0';
const SILLYTAVERN_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const RESUME_SAVE_ID = String(process.env.DIRECTIVE_CORRECT_AS_SWIPE_RESUME_SAVE_ID || process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const ARTIFACT_ROOT = process.env.DIRECTIVE_CORRECT_AS_SWIPE_ARTIFACT_DIR
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_CORRECT_AS_SWIPE_ARTIFACT_DIR)
  : path.resolve(process.cwd(), 'artifacts/live-smoke/correct-as-swipe', createRunId());

const SERVED_EXTENSION_FILES = Object.freeze([
  'src/runtime/correct-as-swipe.mjs',
  'src/runtime/source-reconciliation-engine.mjs',
  'src/runtime/source-review-worker.mjs',
  'src/runtime/message-reconciler.mjs',
  'src/runtime/runtime-app.mjs',
  'src/runtime/runtime-shell.js',
  'src/extension/runtime-mount.js',
  'src/hosts/sillytavern/chat-adapter.mjs',
  'src/hosts/sillytavern/mission-components-capture.js',
  'styles/directive.css'
]);

function usage() {
  return `
Usage:
  node tools/scripts/test-correct-as-swipe-live.mjs

Environment:
  SILLYTAVERN_BASE_URL=http://127.0.0.1:8000
  DIRECTIVE_SILLYTAVERN_USER=directive-soak-a
  DIRECTIVE_SOAK_ST_PASSWORD or DIRECTIVE_SOAK_ST_PASSWORD_<USER>=<password>
  DIRECTIVE_CORRECT_AS_SWIPE_REQUIRE_SERVED_SYNC=1|0 default 1
  DIRECTIVE_CORRECT_AS_SWIPE_RESUME_SAVE_ID=<optional-save-id>
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

function compactText(value = '', maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function candidateSelectionText(messageText = '') {
  const normalized = compactText(messageText, 1200);
  const sentences = normalized.match(/[^.!?]+[.!?]/g) || [];
  const sentence = sentences
    .map((entry) => compactText(entry, 180))
    .find((entry) => entry.length >= 24 && entry.length <= 180);
  if (sentence) return sentence;
  return compactText(normalized.slice(0, 160), 160);
}

function proposedCandidateText(messageText = '') {
  const normalized = compactText(messageText, 1800);
  const suffix = ' Correct-as-Swipe live proof candidate.';
  if (normalized.includes(suffix.trim())) return normalized;
  return `${normalized}${suffix}`;
}

function selectCandidate(messages = []) {
  return messages.find((message) => (
    message.directiveOwned === true
    && message.role === 'assistant'
    && message.hostMessageId
    && message.text
    && message.text.length >= 40
  )) || null;
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
  const page = await context.newPage();
  return { context, page };
}

async function waitForDirective(page) {
  await page.waitForFunction(() => {
    return Boolean(
      globalThis.Directive?.bridge?.runAction
      || globalThis.Directive?.actions?.run
      || document.getElementById('directive-extensions-menu-button')
    );
  }, null, { timeout: TIMEOUT_MS });

  const openedWith = await page.evaluate(async () => {
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') {
      await globalThis.Directive.bridge.runAction('runtime.open');
      return 'Directive.bridge.runAction';
    }
    if (typeof globalThis.Directive?.actions?.run === 'function') {
      await globalThis.Directive.actions.run('runtime.open');
      return 'Directive.actions.run';
    }
    const button = document.getElementById('directive-extensions-menu-button')
      || Array.from(document.querySelectorAll('button, a, [role="button"]')).find((element) => {
        const text = `${element.textContent || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('aria-label') || ''}`;
        return /\bDirective\b/i.test(text);
      });
    button?.click();
    return button ? 'Directive menu button' : '';
  });
  assert(openedWith, 'Directive bridge or menu button was not available in the live SillyTavern page.');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    return Boolean(panel && panel.hidden !== true && panel.querySelector('[data-directive-runtime-body="true"]'));
  }, null, { timeout: TIMEOUT_MS });
  return openedWith;
}

async function openBoundCampaignChat(page) {
  return page.evaluate(async ({ extensionPath, resumeSaveId }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const currentChatId = () => {
      const context = globalThis.SillyTavern?.getContext?.() || {};
      return String(
        context.chatId
        || context.chat_id
        || context.currentChatId
        || (typeof context.getCurrentChatId === 'function' ? context.getCurrentChatId() : '')
        || ''
      ).trim();
    };
    const beforeChatId = currentChatId();
    const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.openCampaignChat || !app?.getCurrentView) {
      return { ok: false, reason: 'runtime-app-unavailable', beforeChatId, afterChatId: currentChatId() };
    }
    const openResult = await app.openCampaignChat(resumeSaveId ? { saveId: resumeSaveId } : {});
    await new Promise((resolve) => setTimeout(resolve, 500));
    const view = await app.getCurrentView({ tabId: 'mission' }).catch(() => null);
    return {
      ok: openResult?.ok !== false && Boolean(currentChatId()),
      reason: openResult?.reason || null,
      beforeChatId,
      afterChatId: currentChatId(),
      resumeSaveId: resumeSaveId || null,
      binding: clone(openResult?.binding || view?.chatNative?.binding || null),
      campaign: clone({
        id: view?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || null
      })
    };
  }, { extensionPath: EXTENSION_PATH, resumeSaveId: RESUME_SAVE_ID });
}

async function readCorrectAsSwipeSnapshot(page) {
  return page.evaluate(async ({ extensionPath }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compact = (value, max = 4000) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
    };
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    const messageId = (message, index) => String(message?.extra?.message_id ?? message?.id ?? index);
    const directiveMetadata = (message) => message?.extra?.directive || message?.metadata?.directive || null;
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chatId = String(
      context.chatId
      || context.chat_id
      || context.currentChatId
      || (typeof context.getCurrentChatId === 'function' ? context.getCurrentChatId() : '')
      || ''
    ).trim();
    let view = null;
    try {
      const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
      const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      view = bridge.runtimeApp?.getCurrentView
        ? await bridge.runtimeApp.getCurrentView({ tabId: 'mission' })
        : null;
    } catch {}
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const messages = chat.map((message, index) => {
      const metadata = directiveMetadata(message);
      const hostMessageId = messageId(message, index);
      return {
        index,
        hostMessageId,
        chatId,
        role: message?.is_user === true || message?.role === 'user'
          ? 'user'
          : (message?.is_system === true || message?.role === 'system' ? 'system' : 'assistant'),
        directiveOwned: Boolean(metadata),
        responseKind: metadata?.responseKind || null,
        swipeId: Number.isInteger(message?.swipe_id) ? message.swipe_id : null,
        swipeCount: Array.isArray(message?.swipes) ? message.swipes.length : null,
        text: compact(messageText(message)),
        name: compact(message?.name || message?.extra?.displayName || '', 120)
      };
    }).filter((message) => message.hostMessageId && message.text);
    const actionIds = (globalThis.Directive?.bridge?.listActions?.() || globalThis.Directive?.actions?.list?.() || [])
      .map((action) => action.id || action);
    return {
      chatId,
      actionIds,
      messageCount: messages.length,
      messages: messages.slice(-80),
      campaign: clone({
        id: view?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || null
      })
    };
  }, { extensionPath: EXTENSION_PATH });
}

async function runCorrectAsSwipeUi(page, candidate) {
  return page.evaluate(async ({ candidate: item, timeoutMs }) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const waitFor = async (predicate, label) => {
      const started = Date.now();
      let last = null;
      while (Date.now() - started < timeoutMs) {
        try {
          last = await predicate();
          if (last) return last;
        } catch (error) {
          last = error?.message || String(error);
        }
        await sleep(150);
      }
      throw new Error(`Timed out waiting for ${label}: ${compact(JSON.stringify(last))}`);
    };
    const escape = globalThis.CSS?.escape || ((value) => String(value).replace(/"/g, '\\"'));
    const message = document.querySelector(`#chat .mes[mesid="${escape(item.hostMessageId)}"]`);
    if (!message) throw new Error(`Could not find live DOM message ${item.hostMessageId}.`);
    const textRoot = message.querySelector('.mes_text') || message;
    const beforeVisibleText = compact(textRoot.innerText || textRoot.textContent || '');
    const walker = document.createTreeWalker(textRoot, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let match = null;
    while (node) {
      const index = String(node.textContent || '').indexOf(item.selectedText);
      if (index >= 0) {
        match = { node, index };
        break;
      }
      node = walker.nextNode();
    }
    if (!match) throw new Error(`Selected text was not found in live DOM message ${item.hostMessageId}.`);
    const range = document.createRange();
    range.setStart(match.node, match.index);
    range.setEnd(match.node, match.index + item.selectedText.length);
    const selection = globalThis.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    const correctButton = await waitFor(() => {
      const button = document.querySelector('.directive-correct-as-swipe-button');
      return button && button.hidden !== true && getComputedStyle(button).display !== 'none' ? button : null;
    }, 'visible Correct-as-Swipe button');
    const defineButton = document.querySelector('.directive-define-selection-button:not(.directive-correct-as-swipe-button)');
    const componentButton = document.querySelector('.directive-mission-component-capture-button');
    const buttonInfo = {
      correctTitle: correctButton.getAttribute('title') || correctButton.getAttribute('aria-label') || '',
      defineVisible: Boolean(defineButton && defineButton.hidden !== true && getComputedStyle(defineButton).display !== 'none'),
      componentVisible: Boolean(componentButton && componentButton.hidden !== true && getComputedStyle(componentButton).display !== 'none')
    };
    correctButton.click();
    const popover = await waitFor(() => {
      const panel = document.querySelector('.directive-correct-as-swipe-popover');
      if (!panel || panel.hidden === true || getComputedStyle(panel).display === 'none') return null;
      return panel.querySelector('[data-correct-as-swipe-field="proposedText"]') ? panel : null;
    }, 'Correct-as-Swipe popover');
    const textarea = popover.querySelector('[data-correct-as-swipe-field="proposedText"]');
    const seededText = textarea.value;
    textarea.value = item.proposedText;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const proposeButton = Array.from(popover.querySelectorAll('button')).find((button) => /Correct as Swipe/i.test(button.textContent || button.getAttribute('aria-label') || ''));
    if (!proposeButton) throw new Error('Correct-as-Swipe propose button was not found.');
    proposeButton.click();
    const saved = await waitFor(() => {
      const panel = document.querySelector('.directive-correct-as-swipe-popover');
      const text = compact(panel?.innerText || panel?.textContent || '');
      return /Candidate Swipe Added/i.test(text) ? { panel, text } : null;
    }, 'Correct-as-Swipe saved state');
    const afterVisibleText = compact(textRoot.innerText || textRoot.textContent || '');
    return {
      ok: true,
      buttonInfo,
      seededText: compact(seededText, 700),
      beforeVisibleText: compact(beforeVisibleText, 700),
      afterVisibleText: compact(afterVisibleText, 700),
      visibleTextUnchanged: beforeVisibleText === afterVisibleText,
      savedText: compact(saved.text, 500)
    };
  }, { candidate, timeoutMs: TIMEOUT_MS });
}

async function inspectCorrectAsSwipeState(page, candidate) {
  return page.evaluate(async ({ extensionPath, candidate: item }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const view = bridge.runtimeApp?.getCurrentView
      ? await bridge.runtimeApp.getCurrentView({ tabId: 'mission' })
      : null;
    const responses = Array.isArray(view?.campaignState?.runtimeTracking?.responseLedger)
      ? view.campaignState.runtimeTracking.responseLedger
      : [];
    const response = responses.find((entry) => String(entry?.hostMessageId || '') === String(item.hostMessageId));
    const cases = Array.isArray(response?.correctAsSwipe?.cases) ? response.correctAsSwipe.cases : [];
    const latestCase = cases[cases.length - 1] || null;
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const message = chat[Number(item.hostMessageId)] || chat.find((entry, index) => String(entry?.extra?.message_id ?? entry?.id ?? index) === String(item.hostMessageId)) || null;
    const selectedSwipeIndex = Number.isInteger(message?.swipe_id) ? message.swipe_id : null;
    const swipes = Array.isArray(message?.swipes) ? message.swipes : [];
    const candidateSwipeIndex = Number.isInteger(latestCase?.candidateSwipe?.swipeIndex)
      ? latestCase.candidateSwipe.swipeIndex
      : -1;
    const rawStateJson = JSON.stringify({
      responseCorrectAsSwipe: response?.correctAsSwipe || null,
      correctionCase: latestCase,
      coreDiagnostic: latestCase?.coreDiagnostic || null
    });
    return {
      responseFound: Boolean(response),
      caseFound: Boolean(latestCase),
      correctionCase: clone(latestCase),
      candidateSwipeIndex,
      selectedSwipeIndex,
      swipeCount: swipes.length,
      selectedUnchanged: candidateSwipeIndex >= 0 && candidateSwipeIndex < swipes.length && selectedSwipeIndex !== candidateSwipeIndex,
      rawSelectedTextPersisted: rawStateJson.includes(item.selectedText),
      rawProposedTextPersisted: rawStateJson.includes(item.proposedText)
    };
  }, { extensionPath: EXTENSION_PATH, candidate });
}

async function exerciseAcceptanceBridge(page, candidate, state) {
  return page.evaluate(async ({ extensionPath, candidate: item, candidateSwipeIndex }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const mod = await import(`${extensionPath}/src/hosts/sillytavern/runtime-bridge.mjs`);
    const bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
    const app = bridge.runtimeApp || null;
    if (!app?.handleHostMessageSelectedSwipeChanged) {
      return { ok: false, skipped: true, reason: 'runtime-app-selected-swipe-handler-unavailable' };
    }
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chat = Array.isArray(context.chat) ? context.chat : [];
    const message = chat[Number(item.hostMessageId)] || chat.find((entry, index) => String(entry?.extra?.message_id ?? entry?.id ?? index) === String(item.hostMessageId)) || null;
    if (!message || !Array.isArray(message.swipes) || !message.swipes[candidateSwipeIndex]) {
      return { ok: false, skipped: true, reason: 'candidate-swipe-not-found' };
    }
    const previousSwipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : null;
    message.swipe_id = candidateSwipeIndex;
    message.mes = message.swipes[candidateSwipeIndex];
    const result = await app.handleHostMessageSelectedSwipeChanged({
      hostMessageId: item.hostMessageId,
      message,
      selectedSwipe: {
        selectedSwipeIndex: candidateSwipeIndex,
        swipeIndex: candidateSwipeIndex,
        selectedAssistantVariantHash: item.candidateTextHash,
        text: message.swipes[candidateSwipeIndex]
      }
    });
    return {
      ok: result?.ok !== false,
      previousSwipeId,
      candidateSwipeIndex,
      result: clone(result)
    };
  }, {
    extensionPath: EXTENSION_PATH,
    candidate: {
      ...candidate,
      candidateTextHash: state.correctionCase?.candidate?.textHash || null
    },
    candidateSwipeIndex: state.candidateSwipeIndex
  });
}

if (args.has('--help') || args.has('-h')) {
  console.log(usage().trim());
  process.exit(0);
}

assert(SILLYTAVERN_USER, 'Correct-as-Swipe live smoke requires DIRECTIVE_SILLYTAVERN_USER or DIRECTIVE_SOAK_ST_USER. Use a directive-soak-* user, never default-user.');
assert.notEqual(SILLYTAVERN_USER, 'default-user', 'Correct-as-Swipe live smoke must not run against ST default-user. Use a directive-soak-* user.');
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
  writeJsonFile(path.join(ARTIFACT_ROOT, 'correct-as-swipe-live-report.json'), {
    kind: 'directive.correctAsSwipe.liveSmoke.v1',
    ok: false,
    stage: 'served-extension-preflight',
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    user: SILLYTAVERN_USER || null,
    servedExtension: {
      ok: servedExtension.ok,
      mismatchCount: servedExtension.mismatchCount,
      servedFailureCount: servedExtension.servedFailureCount,
      compared: servedExtension.compared.map((entry) => ({
        relativePath: entry.relativePath,
        status: entry.status,
        servedOk: entry.servedOk,
        matches: entry.matches,
        error: entry.error
      }))
    }
  });
  assert.equal(servedExtension.ok, true, `Served Directive extension does not match this checkout. Sync the installed extension before live Correct-as-Swipe testing. Mismatches: ${servedExtension.mismatchCount}, served failures: ${servedExtension.servedFailureCount}`);
}

const playwright = await loadPlaywright();
assert.equal(playwright.ok, true, playwright.error?.message || 'Playwright is not importable.');

const browser = await playwright.chromium.launch({ headless: HEADLESS, timeout: TIMEOUT_MS });
let context = null;
let report = null;
try {
  const pageContext = await createAuthenticatedPage(browser);
  context = pageContext.context;
  const page = pageContext.page;
  page.setDefaultTimeout(TIMEOUT_MS);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT_MS }).catch(() => {});
  const openedWith = await waitForDirective(page);
  const openCampaignChat = await openBoundCampaignChat(page);
  const snapshot = await readCorrectAsSwipeSnapshot(page);
  assert(snapshot.actionIds.includes('correctAsSwipe.propose'), 'Live runtime action registry did not expose correctAsSwipe.propose.');
  assert(snapshot.chatId, 'Live SillyTavern did not expose a current chat id.');
  const candidateMessage = selectCandidate(snapshot.messages);
  assert(candidateMessage, 'No recorded Directive assistant response was found for live Correct-as-Swipe. Open Ashes on a soak user and produce at least one Directive assistant reply.');

  const candidate = {
    selectedText: candidateSelectionText(candidateMessage.text),
    proposedText: proposedCandidateText(candidateMessage.text),
    hostMessageId: candidateMessage.hostMessageId,
    chatId: candidateMessage.chatId,
    message: {
      hostMessageId: candidateMessage.hostMessageId,
      id: candidateMessage.hostMessageId,
      role: 'assistant',
      text: candidateMessage.text,
      name: candidateMessage.name || ''
    }
  };

  const ui = await runCorrectAsSwipeUi(page, candidate);
  assert.equal(ui.ok, true);
  assert.match(ui.buttonInfo.correctTitle, /Correct as Swipe/i);
  assert.equal(ui.visibleTextUnchanged, true, 'Correct-as-Swipe candidate append must not mutate the selected visible assistant swipe.');

  const state = await inspectCorrectAsSwipeState(page, candidate);
  assert.equal(state.responseFound, true, 'Correct-as-Swipe must attach to a recorded Directive response.');
  assert.equal(state.caseFound, true, 'Correct-as-Swipe must record a compact correction case.');
  assert(state.candidateSwipeIndex >= 0, 'Correct-as-Swipe candidate text was not appended as a host swipe.');
  assert.equal(state.selectedUnchanged, true, 'Correct-as-Swipe candidate swipe must remain unselected after append.');
  assert.equal(state.rawSelectedTextPersisted, false, 'Correction state must not persist raw selected text.');
  assert.equal(state.rawProposedTextPersisted, false, 'Correction state must not persist raw proposed candidate text.');
  assert.equal(state.correctionCase?.status, 'candidateAppended');
  assert.equal(state.correctionCase?.candidateSwipe?.selected, false);

  const acceptance = await exerciseAcceptanceBridge(page, candidate, state);
  assert.equal(acceptance.ok, true, `Correct-as-Swipe selected-swipe bridge failed: ${acceptance.reason || acceptance.result?.reason || 'unknown'}`);
  assert.equal(acceptance.result?.action, 'correctAsSwipeCandidateAccepted');

  report = {
    kind: 'directive.correctAsSwipe.liveSmoke.v1',
    ok: true,
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    openedWith,
    openCampaignChat,
    user: SILLYTAVERN_USER || null,
    servedExtension: {
      ok: servedExtension.ok,
      mismatchCount: servedExtension.mismatchCount,
      servedFailureCount: servedExtension.servedFailureCount
    },
    chat: {
      chatId: snapshot.chatId,
      messageCount: snapshot.messageCount,
      campaign: snapshot.campaign
    },
    candidate: {
      hostMessageId: candidate.hostMessageId,
      selectedText: candidate.selectedText,
      proposedTextLength: candidate.proposedText.length
    },
    ui,
    state: {
      candidateSwipeIndex: state.candidateSwipeIndex,
      selectedSwipeIndex: state.selectedSwipeIndex,
      swipeCount: state.swipeCount,
      correctionCaseStatus: state.correctionCase?.status || null,
      correctionCaseId: state.correctionCase?.id || null,
      rawSelectedTextPersisted: state.rawSelectedTextPersisted,
      rawProposedTextPersisted: state.rawProposedTextPersisted
    },
    acceptance: {
      proofMode: 'runtime-selected-swipe-event-bridge',
      action: acceptance.result?.action || null,
      candidateSwipeIndex: acceptance.candidateSwipeIndex
    }
  };
  writeJsonFile(path.join(ARTIFACT_ROOT, 'correct-as-swipe-live-report.json'), report);
  console.log(JSON.stringify({
    ok: true,
    artifact: path.join(ARTIFACT_ROOT, 'correct-as-swipe-live-report.json'),
    chat: report.chat,
    candidate: report.candidate,
    state: report.state,
    acceptance: report.acceptance
  }, null, 2));
} catch (error) {
  report = {
    kind: 'directive.correctAsSwipe.liveSmoke.v1',
    ok: false,
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    user: SILLYTAVERN_USER || null,
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
  writeJsonFile(path.join(ARTIFACT_ROOT, 'correct-as-swipe-live-report.json'), report);
  throw error;
} finally {
  await context?.close?.().catch(() => {});
  await browser.close().catch(() => {});
}
