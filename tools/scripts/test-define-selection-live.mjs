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
const HEADLESS = process.env.DIRECTIVE_DEFINE_SELECTION_HEADLESS !== '0';
const TIMEOUT_MS = Number.parseInt(process.env.DIRECTIVE_DEFINE_SELECTION_TIMEOUT_MS || '90000', 10);
const MAX_EXAMPLES = Number.parseInt(process.env.DIRECTIVE_DEFINE_SELECTION_LIVE_MAX_EXAMPLES || '4', 10);
const MIN_EXAMPLES = Number.parseInt(process.env.DIRECTIVE_DEFINE_SELECTION_LIVE_MIN_EXAMPLES || '3', 10);
const USE_PROVIDER = process.env.DIRECTIVE_DEFINE_SELECTION_LIVE_PROVIDER !== '0';
const REQUIRE_PROVIDER = process.env.DIRECTIVE_DEFINE_SELECTION_REQUIRE_PROVIDER === '1';
const REQUIRE_SERVED_SYNC = process.env.DIRECTIVE_DEFINE_SELECTION_REQUIRE_SERVED_SYNC !== '0';
const SILLYTAVERN_USER = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || process.env.DIRECTIVE_SOAK_ST_USER || '');
const RESUME_SAVE_ID = String(process.env.DIRECTIVE_DEFINE_SELECTION_RESUME_SAVE_ID || process.env.DIRECTIVE_SILLYTAVERN_RESUME_SAVE_ID || '').trim();
const ARTIFACT_ROOT = process.env.DIRECTIVE_DEFINE_SELECTION_ARTIFACT_DIR
  ? path.resolve(process.cwd(), process.env.DIRECTIVE_DEFINE_SELECTION_ARTIFACT_DIR)
  : path.resolve(process.cwd(), 'artifacts/live-smoke/define-selection', createRunId());

const SERVED_EXTENSION_FILES = Object.freeze([
  'src/runtime/define-selection.mjs',
  'src/runtime/runtime-app.mjs',
  'src/runtime/runtime-shell.js',
  'src/extension/runtime-mount.js',
  'src/generation/generation-roles.mjs',
  'src/generation/model-call-authority-matrix.mjs',
  'src/hosts/sillytavern/mission-components-capture.js',
  'src/ui/settings-panel.js',
  'styles/directive.css'
]);

const CANDIDATE_SPECS = Object.freeze([
  {
    expected: 'character',
    label: 'Character / rank',
    patterns: [
      /\b(?:Captain|Commander|Lieutenant|Ensign|Admiral|Chief|Doctor)\s+[A-Z][A-Za-z'.-]+\b/,
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\s+(?:said|asked|warned|replied|reported)\b/
    ]
  },
  {
    expected: 'shipSystemTechnicalTerm',
    label: 'Ship system / technical detail',
    patterns: [
      /\b(?:coolant seal|port nacelle|nacelle|junction\s+\d+-[A-Z]|LCARS|EPS|sensor array|warp core|deflector|transporter|shields?|phasers?|plasma)\b/i
    ]
  },
  {
    expected: 'missionQuestThread',
    label: 'Mission / objective detail',
    patterns: [
      /\b(?:mission|objective|orders?|assignment|handoff|inspection|certification|departure readiness|open thread)\b/i
    ]
  },
  {
    expected: 'procedureRuleLaw',
    label: 'Procedure / protocol',
    patterns: [
      /\b(?:protocol|procedure|regulation|standing order|chain of command|authorization|quarantine|inspection|certification)\b/i
    ]
  },
  {
    expected: 'claimRumorUnverified',
    label: 'Claim / report',
    patterns: [
      /\b(?:claims?|claimed|reported|alleged|according to|rumou?r|suspects?|believes?)\b[^.!?]{0,90}/i
    ]
  },
  {
    expected: 'threatHazardRisk',
    label: 'Threat / hazard',
    patterns: [
      /\b(?:risk|hazard|danger|radiation|breach|failure|threat|exposure|unsafe)\b[^.!?]{0,90}/i
    ]
  },
  {
    expected: 'resourceConstraint',
    label: 'Resource / deadline',
    patterns: [
      /\b(?:only|limited|capacity|shortage|\d+\s+(?:minutes?|hours?|days?)|deadline|before departure)\b[^.!?]{0,90}/i
    ]
  },
  {
    expected: 'toneSubtext',
    label: 'Tone / subtext',
    patterns: [
      /\b(?:with respect|looked away|pause|silence|quietly|flatly|one way to describe it)\b[^.!?]{0,90}/i
    ]
  },
  {
    expected: 'locationPlace',
    label: 'Location / place',
    patterns: [
      /\b(?:Ready Room|Bridge|Sickbay|Shuttlebay|Deck\s+\d+|corridor|station|colony|sector)\b/i
    ]
  },
  {
    expected: 'acronymJargonProperNoun',
    label: 'Acronym / jargon',
    patterns: [
      /\b[A-Z]{2,}(?:-[A-Z0-9]+)?\b/
    ]
  }
]);

function usage() {
  return `
Usage:
  node tools/scripts/test-define-selection-live.mjs

Environment:
  SILLYTAVERN_BASE_URL=http://127.0.0.1:8000
  DIRECTIVE_SILLYTAVERN_USER=<optional-account-mode-user>
  DIRECTIVE_SOAK_ST_PASSWORD or DIRECTIVE_SOAK_ST_PASSWORD_<USER>=<password>
  DIRECTIVE_DEFINE_SELECTION_LIVE_PROVIDER=1|0   default 1
  DIRECTIVE_DEFINE_SELECTION_REQUIRE_SERVED_SYNC=1|0 default 1
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

function messageRole(message = {}) {
  if (message.role) return message.role;
  if (message.isUser) return 'user';
  if (message.isSystem) return 'system';
  return 'assistant';
}

function selectCandidates(messages = []) {
  const selected = [];
  const used = new Set();
  for (const spec of CANDIDATE_SPECS) {
    let found = null;
    for (const message of messages) {
      if (message.isSystem || !message.text || used.has(message.hostMessageId)) continue;
      for (const pattern of spec.patterns) {
        const match = message.text.match(pattern);
        const text = compactText(match?.[0] || '', 180);
        if (text && text.length >= 2) {
          found = {
            label: spec.label,
            expected: spec.expected,
            selectedText: text,
            hostMessageId: message.hostMessageId,
            chatId: message.chatId,
            message: {
              hostMessageId: message.hostMessageId,
              id: message.hostMessageId,
              role: messageRole(message),
              isUser: message.isUser === true,
              isSystem: message.isSystem === true,
              text: message.text,
              name: message.name || ''
            }
          };
          break;
        }
      }
      if (found) break;
    }
    if (!found) continue;
    selected.push(found);
    used.add(found.hostMessageId);
    if (selected.length >= MAX_EXAMPLES) break;
  }
  return selected;
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
      return {
        ok: false,
        reason: 'runtime-app-unavailable',
        beforeChatId,
        afterChatId: currentChatId()
      };
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
  }, {
    extensionPath: EXTENSION_PATH,
    resumeSaveId: RESUME_SAVE_ID
  });
}

async function readLiveChatSnapshot(page) {
  return page.evaluate(() => {
    const compact = (value, max = 4000) => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
    };
    const context = globalThis.SillyTavern?.getContext?.() || {};
    const chatId = String(
      context.chatId
      || context.chat_id
      || context.currentChatId
      || (typeof context.getCurrentChatId === 'function' ? context.getCurrentChatId() : '')
      || ''
    ).trim();
    const domMessages = Array.from(document.querySelectorAll('#chat .mes[mesid]')).map((element) => {
      const hostMessageId = String(element.getAttribute('mesid') || element.dataset.messageId || element.dataset.mesid || '').trim();
      const textElement = element.querySelector('.mes_text') || element;
      const text = compact(textElement.innerText || textElement.textContent || '');
      return {
        hostMessageId,
        chatId,
        text,
        isUser: element.classList.contains('user_mes') || element.getAttribute('is_user') === 'true' || element.dataset.isUser === 'true',
        isSystem: element.classList.contains('system_mes') || element.getAttribute('is_system') === 'true' || element.dataset.isSystem === 'true',
        name: compact(element.querySelector('.name_text')?.textContent || element.querySelector('.ch_name')?.textContent || '', 120)
      };
    }).filter((message) => message.hostMessageId && message.text);
    const actionIds = (globalThis.Directive?.bridge?.listActions?.() || globalThis.Directive?.actions?.list?.() || [])
      .map((action) => action.id || action);
    return {
      chatId,
      actionIds,
      messageCount: domMessages.length,
      messages: domMessages.slice(-80)
    };
  });
}

async function runDefineAction(page, candidate) {
  return page.evaluate(async ({ candidate: item, useProvider }) => {
    const runAction = globalThis.Directive?.bridge?.runAction || globalThis.Directive?.actions?.run;
    if (typeof runAction !== 'function') throw new Error('Directive runtime action bridge is unavailable.');
    const payload = {
      selection: {
        selectedText: item.selectedText,
        chatId: item.chatId,
        host: 'sillytavern',
        hostMessageId: item.hostMessageId,
        messageText: item.message.text,
        message: item.message
      }
    };
    if (useProvider === false) payload.useProvider = false;
    return JSON.parse(JSON.stringify(await runAction('defineSelection.lookup', payload)));
  }, {
    candidate,
    useProvider: USE_PROVIDER
  });
}

async function verifyDefinePopover(page, candidate) {
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
    const defineButton = await waitFor(() => {
      const button = document.querySelector('.directive-define-selection-button');
      return button && button.hidden !== true && getComputedStyle(button).display !== 'none' ? button : null;
    }, 'visible Define Selection button');
    const componentButton = document.querySelector('.directive-mission-component-capture-button');
    const buttonInfo = {
      defineTitle: defineButton.getAttribute('title') || defineButton.getAttribute('aria-label') || '',
      defineText: compact(defineButton.textContent),
      componentTitle: componentButton?.getAttribute('title') || componentButton?.getAttribute('aria-label') || '',
      componentVisible: Boolean(componentButton && componentButton.hidden !== true && getComputedStyle(componentButton).display !== 'none')
    };
    defineButton.click();
    const popover = await waitFor(() => {
      const panel = document.querySelector('.directive-define-selection-popover');
      if (!panel || panel.hidden === true || getComputedStyle(panel).display === 'none') return null;
      const text = compact(panel.innerText || panel.textContent || '');
      return /Define/i.test(text) && /Close/i.test(text) ? panel : null;
    }, 'Define Selection popover');
    const popoverText = compact(popover.innerText || popover.textContent || '');
    const closeButtonCount = Array.from(popover.querySelectorAll('button')).filter((button) => /close|x/i.test(compact(button.textContent) || button.getAttribute('aria-label') || '')).length;
    return {
      ok: true,
      buttonInfo,
      popoverText,
      containsSaveComponent: /Save Component/i.test(popoverText),
      containsAddComponent: /Add Component to Mission/i.test(popoverText),
      closeButtonCount,
      sectionCount: popover.querySelectorAll('.directive-define-selection-section').length,
      relatedChipCount: popover.querySelectorAll('.directive-define-selection-related span').length
    };
  }, {
    candidate,
    timeoutMs: TIMEOUT_MS
  });
}

if (args.has('--help') || args.has('-h')) {
  console.log(usage().trim());
  process.exit(0);
}

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
  writeJsonFile(path.join(ARTIFACT_ROOT, 'define-selection-live-report.json'), {
    kind: 'directive.defineSelection.liveSmoke.v1',
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
  assert.equal(servedExtension.ok, true, `Served Directive extension does not match this checkout. Sync the installed extension before live Define testing. Mismatches: ${servedExtension.mismatchCount}, served failures: ${servedExtension.servedFailureCount}`);
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
  const snapshot = await readLiveChatSnapshot(page);
  assert(snapshot.actionIds.includes('defineSelection.lookup'), 'Live runtime action registry did not expose defineSelection.lookup.');
  assert(snapshot.chatId, 'Live SillyTavern did not expose a current chat id.');
  assert(snapshot.messageCount > 0, 'Live SillyTavern chat did not expose selectable chat messages.');
  const candidates = selectCandidates(snapshot.messages).slice(0, MAX_EXAMPLES);
  assert(
    candidates.length >= MIN_EXAMPLES,
    `Only found ${candidates.length} Define category candidates in the active chat; need ${MIN_EXAMPLES}. Open a richer Directive campaign scene or lower DIRECTIVE_DEFINE_SELECTION_LIVE_MIN_EXAMPLES.`
  );

  const results = [];
  for (const candidate of candidates) {
    const result = await runDefineAction(page, candidate);
    assert.equal(result.ok, true, `Define action failed for ${candidate.label}: ${result.summary || result.reason || 'unknown error'}`);
    assert(result.definition?.primaryType, `Define action omitted primaryType for ${candidate.label}.`);
    assert(result.definition?.shortAnswer, `Define action omitted shortAnswer for ${candidate.label}.`);
    if (USE_PROVIDER) {
      assert.equal(result.diagnostics?.providerUsed, true, `Define action did not attempt the Utility provider for ${candidate.label}.`);
    }
    if (REQUIRE_PROVIDER) {
      assert.equal(result.diagnostics?.providerOutputRejected, false, `Utility output was rejected for ${candidate.label}.`);
      assert.notEqual(result.definition?.source, 'deterministic-fallback', `Define fell back deterministically for ${candidate.label}.`);
    }
    results.push({
      label: candidate.label,
      expected: candidate.expected,
      selectedText: candidate.selectedText,
      hostMessageId: candidate.hostMessageId,
      primaryType: result.definition.primaryType,
      primaryTypeLabel: result.definition.primaryTypeLabel,
      confidence: result.definition.confidence,
      providerUsed: result.diagnostics?.providerUsed === true,
      providerOutputRejected: result.diagnostics?.providerOutputRejected === true,
      source: result.definition.source || null,
      subject: result.definition.subject || null,
      warnings: result.definition.warnings || []
    });
  }

  const popover = await verifyDefinePopover(page, candidates[0]);
  assert.equal(popover.ok, true);
  assert.equal(popover.containsSaveComponent, false, 'Define popover must not expose Save Component.');
  assert.equal(popover.containsAddComponent, false, 'Define popover must not expose Add Component to Mission.');
  assert.match(popover.buttonInfo.defineTitle, /Define Selection/);
  assert.equal(popover.buttonInfo.componentVisible, true, 'Adjacent Component button should remain a separate affordance beside Define.');
  assert.match(popover.buttonInfo.componentTitle, /Add Component to Mission/);
  assert(popover.sectionCount >= 1, 'Define popover should render organized sections.');
  assert(popover.closeButtonCount >= 1, 'Define popover should provide a close control.');

  report = {
    kind: 'directive.defineSelection.liveSmoke.v1',
    ok: true,
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    openedWith,
    openCampaignChat,
    user: SILLYTAVERN_USER || null,
    useProvider: USE_PROVIDER,
    requireProvider: REQUIRE_PROVIDER,
    servedExtension: {
      ok: servedExtension.ok,
      mismatchCount: servedExtension.mismatchCount,
      servedFailureCount: servedExtension.servedFailureCount
    },
    chat: {
      chatId: snapshot.chatId,
      messageCount: snapshot.messageCount
    },
    results,
    popover: {
      buttonInfo: popover.buttonInfo,
      containsSaveComponent: popover.containsSaveComponent,
      containsAddComponent: popover.containsAddComponent,
      closeButtonCount: popover.closeButtonCount,
      sectionCount: popover.sectionCount,
      relatedChipCount: popover.relatedChipCount,
      preview: compactText(popover.popoverText, 700)
    }
  };
  writeJsonFile(path.join(ARTIFACT_ROOT, 'define-selection-live-report.json'), report);
  console.log(JSON.stringify({
    ok: true,
    artifact: path.join(ARTIFACT_ROOT, 'define-selection-live-report.json'),
    examples: results.map((entry) => ({
      label: entry.label,
      selectedText: entry.selectedText,
      primaryType: entry.primaryType,
      providerUsed: entry.providerUsed,
      providerOutputRejected: entry.providerOutputRejected
    })),
    popover: report.popover
  }, null, 2));
} catch (error) {
  report = {
    kind: 'directive.defineSelection.liveSmoke.v1',
    ok: false,
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    user: SILLYTAVERN_USER || null,
    useProvider: USE_PROVIDER,
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
  writeJsonFile(path.join(ARTIFACT_ROOT, 'define-selection-live-report.json'), report);
  throw error;
} finally {
  await context?.close?.().catch(() => {});
  await browser.close().catch(() => {});
}
