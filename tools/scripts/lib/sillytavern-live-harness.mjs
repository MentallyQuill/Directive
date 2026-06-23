import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SILLYTAVERN_BASE_URL = 'http://127.0.0.1:8000';
export const DEFAULT_DIRECTIVE_EXTENSION_PATH = '/scripts/extensions/third-party/Directive';
export const DEFAULT_SOAK_ARTIFACT_ROOT = 'artifacts/live-soak/sillytavern-campaign';

export const PLAYWRIGHT_VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 1000 }),
  phone: Object.freeze({ width: 390, height: 845 })
});

export const PLAYWRIGHT_SELECTOR_GUIDANCE = Object.freeze({
  prefer: [
    'role and accessible name',
    'stable title or aria-label',
    'Directive data-* attributes',
    'SillyTavern host-shaped message rows using .mes[mesid]',
    'text only when labels are stable user-facing copy'
  ],
  fallback: [
    'record locator, bounding box, computed visibility, scroll position, and overlay diagnostics before coordinate clicks',
    'mark direct runtime-handler calls as fallback evidence, not full browser proof',
    'do not use raw DOM text replacement as edit/delete proof'
  ]
});

export function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

export function normalizeExtensionPath(value = DEFAULT_DIRECTIVE_EXTENSION_PATH) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_DIRECTIVE_EXTENSION_PATH;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function createRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export function compact(value, maxLength = 700) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function redactSecrets(value, extraSecrets = []) {
  let text = String(value ?? '');
  const secrets = [
    process.env.SILLYTAVERN_COOKIE,
    process.env.SILLYTAVERN_REQUEST_TOKEN,
    process.env.SILLYTAVERN_AUTH_HEADER,
    process.env.LUMIVERSE_PASSWORD,
    ...extraSecrets
  ].filter(Boolean);
  for (const secret of secrets) {
    text = text.split(String(secret)).join('[redacted]');
  }
  return text;
}

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

export function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

export function writeJsonFile(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return filePath;
}

export function appendJsonLine(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
  return filePath;
}

export function writeTextFile(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, String(value), 'utf8');
  return filePath;
}

export function createArtifactPaths({
  rootDir = DEFAULT_SOAK_ARTIFACT_ROOT,
  runId = createRunId()
} = {}) {
  const root = path.resolve(rootDir, runId);
  return {
    root,
    report: path.join(root, 'report.json'),
    summary: path.join(root, 'summary.md'),
    turns: path.join(root, 'turns.jsonl'),
    snapshots: path.join(root, 'snapshots'),
    transcript: path.join(root, 'transcript'),
    screenshots: path.join(root, 'screenshots'),
    playwright: path.join(root, 'playwright'),
    promptInspection: path.join(root, 'prompt-inspection'),
    storage: path.join(root, 'storage'),
    discovery: path.join(root, 'discovery')
  };
}

export function ensureArtifactTree(paths) {
  for (const directory of [
    paths.root,
    paths.snapshots,
    paths.transcript,
    paths.screenshots,
    paths.playwright,
    paths.promptInspection,
    paths.storage,
    paths.discovery
  ]) {
    ensureDirectory(directory);
  }
  return paths;
}

export async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    return {
      ok: true,
      chromium: mod.chromium,
      firefox: mod.firefox,
      webkit: mod.webkit,
      version: mod.version || null
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        name: error?.name || 'Error',
        message: error?.message || String(error)
      }
    };
  }
}

export async function launchPlaywrightBrowser({
  headless = true,
  slowMo = 0,
  timeoutMs = 30000
} = {}) {
  const loaded = await loadPlaywright();
  if (!loaded.ok) return loaded;
  try {
    const browser = await loaded.chromium.launch({ headless, slowMo, timeout: timeoutMs });
    return { ok: true, browser, driver: 'playwright' };
  } catch (error) {
    return {
      ok: false,
      driver: 'playwright',
      error: {
        name: error?.name || 'Error',
        message: error?.message || String(error)
      }
    };
  }
}

export function requestHeadersFromEnv() {
  const headers = {};
  if (process.env.SILLYTAVERN_COOKIE) headers.Cookie = process.env.SILLYTAVERN_COOKIE;
  if (process.env.SILLYTAVERN_REQUEST_TOKEN) headers['X-CSRF-Token'] = process.env.SILLYTAVERN_REQUEST_TOKEN;
  if (process.env.SILLYTAVERN_AUTH_HEADER) headers.Authorization = process.env.SILLYTAVERN_AUTH_HEADER;
  return headers;
}

export async function fetchText({
  baseUrl,
  requestPath,
  headers = requestHeadersFromEnv(),
  timeoutMs = 15000
} = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('baseUrl is required');
  const target = `${base}${String(requestPath || '').startsWith('/') ? requestPath : `/${requestPath}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, { headers, signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      text,
      url: target
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(options = {}) {
  const result = await fetchText(options);
  let json = null;
  try {
    json = JSON.parse(result.text);
  } catch (error) {
    return {
      ...result,
      ok: false,
      parseError: error?.message || String(error)
    };
  }
  return { ...result, json };
}

export async function compareServedExtension({
  baseUrl,
  extensionPath = DEFAULT_DIRECTIVE_EXTENSION_PATH,
  localRoot = process.cwd(),
  files = [],
  timeoutMs = 15000
} = {}) {
  const normalizedExtensionPath = normalizeExtensionPath(extensionPath);
  const manifestResult = await fetchJson({
    baseUrl,
    requestPath: `${normalizedExtensionPath}/manifest.json`,
    timeoutMs
  });
  const manifestFiles = [];
  if (manifestResult.ok && manifestResult.json) {
    if (manifestResult.json.js) manifestFiles.push(String(manifestResult.json.js));
    if (manifestResult.json.css) manifestFiles.push(String(manifestResult.json.css));
  }
  const candidates = [...new Set([
    'manifest.json',
    ...manifestFiles,
    'src/hosts/sillytavern/bootstrap.js',
    'src/hosts/sillytavern/runtime-bridge.mjs',
    'src/runtime/runtime-app.mjs',
    ...files
  ])];

  const compared = [];
  for (const relative of candidates) {
    const localPath = path.resolve(localRoot, relative);
    const servedPath = `${normalizedExtensionPath}/${relative.replace(/\\/g, '/')}`;
    const record = {
      relativePath: relative,
      servedPath,
      localExists: fs.existsSync(localPath),
      servedOk: false,
      localSha256: null,
      servedSha256: null,
      matches: null,
      status: null,
      error: null
    };
    if (record.localExists) record.localSha256 = fileSha256(localPath);
    try {
      const served = await fetchText({ baseUrl, requestPath: servedPath, timeoutMs });
      record.status = served.status;
      record.servedOk = served.ok;
      if (served.ok) {
        record.servedSha256 = sha256Text(served.text);
        record.matches = record.localSha256 ? record.localSha256 === record.servedSha256 : null;
      } else {
        record.error = `HTTP ${served.status}`;
      }
    } catch (error) {
      record.error = error?.message || String(error);
    }
    compared.push(record);
  }

  const mismatches = compared.filter((entry) => entry.matches === false);
  const missingLocal = compared.filter((entry) => !entry.localExists);
  const servedFailures = compared.filter((entry) => !entry.servedOk);
  return {
    ok: manifestResult.ok && mismatches.length === 0 && servedFailures.length === 0,
    baseUrl: normalizeBaseUrl(baseUrl),
    extensionPath: normalizedExtensionPath,
    manifest: {
      ok: manifestResult.ok,
      status: manifestResult.status,
      localSha256: fs.existsSync(path.resolve(localRoot, 'manifest.json'))
        ? fileSha256(path.resolve(localRoot, 'manifest.json'))
        : null,
      servedSha256: manifestResult.text ? sha256Text(manifestResult.text) : null
    },
    compared,
    mismatchCount: mismatches.length,
    missingLocalCount: missingLocal.length,
    servedFailureCount: servedFailures.length
  };
}

export async function directiveRuntimeSnapshot(page, {
  extensionPath = DEFAULT_DIRECTIVE_EXTENSION_PATH
} = {}) {
  const modulePath = `${normalizeExtensionPath(extensionPath)}/src/hosts/sillytavern/runtime-bridge.mjs`;
  return page.evaluate(async ({ modulePath: bridgeModulePath }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const compactText = (value, max = 180) => {
      const normalized = String(value || '').replace(/\s+/g, ' ').trim();
      return normalized.length <= max ? normalized : `${normalized.slice(0, max)}...`;
    };
    const messageText = (message) => {
      const value = message?.mes ?? message?.content ?? message?.text ?? '';
      if (typeof value === 'string') return value;
      if (Array.isArray(value)) return value.map((part) => part?.text || '').filter(Boolean).join('\n');
      return String(value || '');
    };
    const directiveMetadata = (message) => message?.extra?.directive || message?.metadata?.directive || null;
    const context = globalThis.SillyTavern?.getContext?.() || null;
    let bridge = {};
    let view = null;
    try {
      const mod = await import(bridgeModulePath);
      bridge = mod.getSillyTavernDirectiveRuntimeBridge?.() || {};
      view = bridge.runtimeApp?.getCurrentView
        ? await bridge.runtimeApp.getCurrentView({ tabId: 'mission' })
        : null;
    } catch (error) {
      return {
        bridgeAvailable: false,
        error: error?.message || String(error),
        currentChatId: context?.chatId || context?.chat_id || null,
        chatLength: Array.isArray(context?.chat) ? context.chat.length : null
      };
    }
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const messages = chat.map((message, index) => {
      const metadata = directiveMetadata(message);
      return {
        index,
        hostMessageId: String(message?.extra?.message_id ?? message?.id ?? index),
        isUser: message?.is_user === true || message?.role === 'user',
        isSystem: message?.is_system === true || message?.role === 'system',
        directiveOwned: Boolean(metadata),
        responseKind: metadata?.responseKind || null,
        textPreview: compactText(messageText(message))
      };
    });
    const tracking = view?.chatNative?.tracking || {};
    return {
      bridgeAvailable: Boolean(bridge.runtimeApp),
      hostAvailable: Boolean(bridge.host),
      currentChatId: bridge.host?.chat?.getCurrentChatId?.() || context?.chatId || context?.chat_id || null,
      chatLength: chat.length,
      userMessageCount: messages.filter((message) => message.isUser).length,
      directiveMessageCount: messages.filter((message) => message.directiveOwned).length,
      recentMessages: messages.slice(-12),
      binding: clone(view?.chatNative?.binding || null),
      activation: clone(view?.chatNative?.activation || null),
      tracking: clone(tracking),
      pendingInteractionCount: (view?.chatNative?.pendingInteractions || []).filter((entry) => entry?.status !== 'resolved').length,
      modelCallCount: view?.chatNative?.modelCalls?.length || view?.campaignState?.runtimeTracking?.modelCallJournal?.length || 0,
      modelCallRoles: (view?.chatNative?.modelCalls || view?.campaignState?.runtimeTracking?.modelCallJournal || []).map((entry) => entry.roleId).filter(Boolean),
      sidecarCount: view?.campaignState?.runtimeTracking?.sidecarJournal?.length || 0,
      recoveryCount: view?.campaignState?.runtimeTracking?.recoveryJournal?.length || 0,
      sceneReconciliation: clone(view?.campaignState?.runtimeTracking?.sceneReconciliation || null),
      commandLogCount: view?.campaignState?.commandLog?.entries?.length || 0,
      turnLedgerCount: view?.campaignState?.turnLedger?.entries?.length || 0,
      promptInspection: clone(view?.promptInspection || null),
      campaign: {
        id: view?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || null
      }
    };
  }, { modulePath });
}

export async function waitForSillyTavernIdle(page, {
  timeoutMs = 120000
} = {}) {
  return page.waitForFunction(async () => {
    try {
      const st = await import('/script.js');
      const ready = st.is_send_press !== true
        && (typeof st.isGenerating !== 'function' || st.isGenerating() !== true);
      if (!ready) return null;
      return {
        ready: true,
        isSendPress: st.is_send_press === true,
        isGenerating: typeof st.isGenerating === 'function' ? st.isGenerating() === true : null
      };
    } catch {
      return { ready: true, reason: 'script-module-unavailable' };
    }
  }, null, { timeout: timeoutMs });
}

export async function sendSillyTavernChatMessage(page, text, {
  timeoutMs = 120000
} = {}) {
  await waitForSillyTavernIdle(page, { timeoutMs });
  const result = await page.evaluate((messageText) => {
    const textarea = document.querySelector('#send_textarea');
    const sendButton = document.querySelector('#send_but');
    if (!textarea || !sendButton) {
      return {
        sent: false,
        reason: 'SillyTavern send textarea or send button was not present.',
        hasTextarea: Boolean(textarea),
        hasSendButton: Boolean(sendButton)
      };
    }
    textarea.focus?.();
    textarea.value = String(messageText || '');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    sendButton.click();
    return { sent: true };
  }, text);
  if (!result.sent) throw new Error(result.reason || 'SillyTavern chat message was not sent.');
  await waitForSillyTavernIdle(page, { timeoutMs });
  return result;
}

export function errorSummary(error) {
  return {
    name: error?.name || 'Error',
    message: redactSecrets(error?.message || String(error)),
    stack: error?.stack ? redactSecrets(error.stack).split('\n').slice(0, 6).join('\n') : null
  };
}

export function tempArtifactRoot(prefix = 'directive-live-soak-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
