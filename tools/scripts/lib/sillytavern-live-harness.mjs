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
    liveLog: path.join(root, 'live-log.jsonl'),
    turns: path.join(root, 'turns.jsonl'),
    snapshots: path.join(root, 'snapshots'),
    transcript: path.join(root, 'transcript'),
    readableTranscript: path.join(root, 'transcript', 'readable-chat.md'),
    sourceChatTranscript: path.join(root, 'transcript', 'source-chat.jsonl'),
    transcriptIndex: path.join(root, 'transcript', 'index.json'),
    transcriptExcerpts: path.join(root, 'transcript', 'excerpts.md'),
    screenshots: path.join(root, 'screenshots'),
    playwright: path.join(root, 'playwright'),
    promptInspection: path.join(root, 'prompt-inspection'),
    storage: path.join(root, 'storage'),
    campaignMatrix: path.join(root, 'campaign-matrix'),
    objectiveAssignments: path.join(root, 'objective-assignments'),
    factChecks: path.join(root, 'fact-checks'),
    factCanaryIndex: path.join(root, 'fact-checks', 'canary-index.json'),
    sceneHandshake: path.join(root, 'scene-handshake'),
    timekeeping: path.join(root, 'timekeeping'),
    endConditions: path.join(root, 'end-conditions'),
    parallelUsers: path.join(root, 'parallel-users'),
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
    paths.campaignMatrix,
    paths.objectiveAssignments,
    paths.factChecks,
    paths.sceneHandshake,
    paths.timekeeping,
    paths.endConditions,
    paths.parallelUsers,
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

export async function verifyPlaywrightBrowserEnvironment({
  headless = true,
  slowMo = 0,
  timeoutMs = 30000,
  artifactPaths = null,
  captureArtifacts = false,
  viewports = PLAYWRIGHT_VIEWPORTS
} = {}) {
  const launched = await launchPlaywrightBrowser({ headless, slowMo, timeoutMs });
  if (!launched.ok) {
    return {
      ok: false,
      driver: 'playwright',
      stage: 'launch',
      error: launched.error || launched
    };
  }

  const { browser } = launched;
  let context = null;
  let tracing = false;
  const consoleMessages = [];
  const pageErrors = [];
  const artifacts = {};
  try {
    context = await browser.newContext({ viewport: viewports.desktop });
    if (captureArtifacts && artifactPaths?.playwright) {
      ensureDirectory(artifactPaths.playwright);
      await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
      tracing = true;
    }

    const page = await context.newPage();
    page.on('console', (message) => {
      consoleMessages.push({
        type: message.type(),
        text: compact(message.text(), 240)
      });
    });
    page.on('pageerror', (error) => {
      pageErrors.push(errorSummary(error));
    });

    await page.setContent(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Directive Playwright Fixture</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #101418; color: #f4f0e8; }
      main { min-height: 100vh; display: grid; place-items: center; }
      section { border: 1px solid #50616f; padding: 24px; border-radius: 8px; background: #20272d; }
      button { font: inherit; padding: 8px 12px; border-radius: 6px; border: 1px solid #ddb96a; background: #ddb96a; color: #17120a; }
      output { display: inline-block; min-width: 2ch; margin-left: 12px; }
    </style>
  </head>
  <body>
    <main>
      <section aria-label="Directive Playwright readiness fixture">
        <button type="button" aria-label="Increment turn">Turn</button>
        <output data-result aria-live="polite">0</output>
      </section>
    </main>
    <script>
      const output = document.querySelector('[data-result]');
      document.querySelector('button').addEventListener('click', () => {
        output.textContent = String(Number(output.textContent || 0) + 1);
      });
    </script>
  </body>
</html>`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    await page.getByRole('button', { name: 'Increment turn' }).click({ timeout: timeoutMs });
    const resultText = await page.locator('[data-result]').textContent({ timeout: timeoutMs });
    if (resultText !== '1') {
      throw new Error(`Playwright fixture click did not update output; got ${resultText}.`);
    }

    const viewportResults = {};
    for (const [id, viewport] of Object.entries(viewports)) {
      await page.setViewportSize(viewport);
      const metrics = await page.evaluate(() => {
        const section = document.querySelector('section')?.getBoundingClientRect();
        const button = document.querySelector('button')?.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          section: section ? {
            x: Math.round(section.x),
            y: Math.round(section.y),
            width: Math.round(section.width),
            height: Math.round(section.height)
          } : null,
          button: button ? {
            x: Math.round(button.x),
            y: Math.round(button.y),
            width: Math.round(button.width),
            height: Math.round(button.height)
          } : null
        };
      });
      viewportResults[id] = { viewport, metrics };
      if (captureArtifacts && artifactPaths?.screenshots) {
        ensureDirectory(artifactPaths.screenshots);
        const screenshotPath = path.join(artifactPaths.screenshots, `playwright-fixture-${id}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        viewportResults[id].screenshot = {
          path: screenshotPath,
          bytes: fs.statSync(screenshotPath).size
        };
      }
    }

    if (tracing && artifactPaths?.playwright) {
      const tracePath = path.join(artifactPaths.playwright, 'playwright-fixture-trace.zip');
      await context.tracing.stop({ path: tracePath });
      tracing = false;
      artifacts.trace = {
        path: tracePath,
        bytes: fs.statSync(tracePath).size
      };
    }

    await context.close();
    context = null;
    await browser.close();
    return {
      ok: pageErrors.length === 0,
      driver: 'playwright',
      stage: 'verified',
      interaction: { resultText },
      viewports: viewportResults,
      artifacts,
      consoleMessages,
      pageErrors
    };
  } catch (error) {
    if (tracing && context) {
      await context.tracing.stop().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    await browser.close().catch(() => {});
    return {
      ok: false,
      driver: 'playwright',
      stage: 'verify',
      error: errorSummary(error),
      consoleMessages,
      pageErrors,
      artifacts
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
  method = 'GET',
  headers = requestHeadersFromEnv(),
  body = undefined,
  timeoutMs = 15000
} = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('baseUrl is required');
  const target = `${base}${String(requestPath || '').startsWith('/') ? requestPath : `/${requestPath}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, { method, headers, body, signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      setCookie: getSetCookieHeaders(response.headers),
      text,
      url: target
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getSetCookieHeaders(headers) {
  if (typeof headers?.getSetCookie === 'function') return headers.getSetCookie();
  const value = headers?.get?.('set-cookie');
  if (!value) return [];
  return value.split(/,(?=\s*[^;,\s]+=)/g).map((entry) => entry.trim()).filter(Boolean);
}

function applySetCookies(cookieJar, setCookieHeaders = []) {
  for (const entry of setCookieHeaders) {
    const [pair] = String(entry || '').split(';');
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (!name) continue;
    cookieJar.set(name, value);
  }
}

function cookieHeader(cookieJar) {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function fetchTextWithCookies({ baseUrl, requestPath, method = 'GET', headers = {}, body, timeoutMs, cookieJar }) {
  const cookie = cookieHeader(cookieJar);
  const result = await fetchText({
    baseUrl,
    requestPath,
    method,
    headers: cookie ? { ...headers, Cookie: cookie } : headers,
    body,
    timeoutMs
  });
  applySetCookies(cookieJar, result.setCookie);
  return result;
}

export async function authenticateSillyTavernUser({
  baseUrl,
  handle,
  password = '',
  timeoutMs = 15000
} = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('baseUrl is required');
  if (!handle) throw new Error('SillyTavern user handle is required');

  const cookieJar = new Map();
  const csrf = await fetchTextWithCookies({
    baseUrl: base,
    requestPath: '/csrf-token',
    timeoutMs,
    cookieJar
  });
  let token = null;
  try {
    token = JSON.parse(csrf.text)?.token || null;
  } catch {
    token = null;
  }
  if (!csrf.ok || !token) {
    return {
      ok: false,
      handle,
      csrfStatus: csrf.status,
      loginStatus: null,
      headers: {},
      error: 'Could not obtain SillyTavern CSRF token.'
    };
  }

  const login = await fetchTextWithCookies({
    baseUrl: base,
    requestPath: '/api/users/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token
    },
    body: JSON.stringify({ handle, password: password || '' }),
    timeoutMs,
    cookieJar
  });
  const cookie = cookieHeader(cookieJar);
  return {
    ok: login.ok,
    handle,
    csrfStatus: csrf.status,
    loginStatus: login.status,
    csrfToken: token,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      'X-CSRF-Token': token
    },
    error: login.ok ? null : compact(login.text || `HTTP ${login.status}`, 240)
  };
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
  headers = requestHeadersFromEnv(),
  timeoutMs = 15000
} = {}) {
  const normalizedExtensionPath = normalizeExtensionPath(extensionPath);
  const manifestResult = await fetchJson({
    baseUrl,
    requestPath: `${normalizedExtensionPath}/manifest.json`,
    headers,
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
      const served = await fetchText({ baseUrl, requestPath: servedPath, headers, timeoutMs });
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
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await page.evaluate(async () => {
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
      });
      if (result) return result;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await page.waitForTimeout(Math.min(250, Math.max(0, timeoutMs - (Date.now() - started))));
  }
  const error = new Error(`Timed out waiting for SillyTavern to become idle after ${timeoutMs}ms.`);
  error.details = {
    timeoutMs,
    lastError: lastError ? {
      name: lastError.name || 'Error',
      message: lastError.message || String(lastError)
    } : null
  };
  throw error;
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
  const summary = {
    name: error?.name || 'Error',
    message: redactSecrets(error?.message || String(error)),
    stack: error?.stack ? redactSecrets(error.stack).split('\n').slice(0, 6).join('\n') : null
  };
  if (error?.details) summary.details = error.details;
  return summary;
}

export function tempArtifactRoot(prefix = 'directive-live-soak-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
