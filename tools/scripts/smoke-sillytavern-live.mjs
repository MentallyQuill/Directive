import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import {
  DIRECTIVE_LOGICAL_STORAGE_KEYS,
  toSillyTavernUserFilesPath
} from '../../src/storage/logical-storage-paths.mjs';

const args = new Set(process.argv.slice(2));
const BASE_URL = (process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '').replace(/\/+$/, '');
const EXTENSION_PATH = normalizePath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || '/scripts/extensions/third-party/Directive');
const RUN_BROWSER = process.env.DIRECTIVE_SILLYTAVERN_BROWSER === '1';
const RUN_STORAGE = process.env.DIRECTIVE_SILLYTAVERN_STORAGE === '1';
const RUN_BROWSER_SAVE_FLOW = process.env.DIRECTIVE_SILLYTAVERN_SAVE_FLOW === '1';
const RUN_LIVE_GENERATION = process.env.DIRECTIVE_SILLYTAVERN_GENERATION === '1'
  || process.env.DIRECTIVE_LIVE_GENERATION === '1';
const RUN_TEARDOWN = process.env.DIRECTIVE_SILLYTAVERN_TEARDOWN === '1';
const RUN_SCREENSHOTS = process.env.DIRECTIVE_SILLYTAVERN_SCREENSHOTS === '1';
const STRICT = process.env.DIRECTIVE_SILLYTAVERN_STRICT === '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const BROWSER_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SILLYTAVERN_BROWSER_TIMEOUT_MS, 15000);
const GENERATION_TIMEOUT_MS = positiveInteger(process.env.DIRECTIVE_SILLYTAVERN_GENERATION_TIMEOUT_MS, 90000);
const SCREENSHOT_BASE_DIR = process.env.DIRECTIVE_SILLYTAVERN_SCREENSHOT_DIR
  || path.join(os.tmpdir(), 'directive-sillytavern-smoke-screenshots');
const SCREENSHOT_RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const HELP = args.has('--help') || args.has('-h');
const DRY_RUN = args.has('--dry-run') || args.has('--checklist');

const REQUIRED_ROUTES = Object.freeze([
  'Starships',
  'Mission',
  'Crew',
  'Ship',
  'Log',
  'Settings'
]);

const ROUTE_IDS = Object.freeze({
  Starships: 'starships',
  Mission: 'mission',
  Crew: 'crew',
  Ship: 'ship',
  Log: 'log',
  Settings: 'settings'
});

const SAFE_PLAYER_ACTION = 'Live smoke: acknowledge the handoff, ask the senior staff for status, and keep the transfer work orderly while reporting no hidden assumptions.';
const SAVE_INDEX_USER_FILES_PATH = toSillyTavernUserFilesPath(DIRECTIVE_LOGICAL_STORAGE_KEYS.saveIndex);
let bootstrappedRequestAuth = null;
let requestAuthBootstrapAttempted = false;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePath(value = '') {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function usage() {
  return `SillyTavern live smoke scaffold

Default safe modes:
  node tools\\scripts\\smoke-sillytavern-live.mjs --dry-run
  node tools\\scripts\\smoke-sillytavern-live.mjs

Live host:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  node tools\\scripts\\smoke-sillytavern-live.mjs

Optional checks:
  DIRECTIVE_SILLYTAVERN_BROWSER=1   check the live browser shell with Playwright or Edge/Chrome CDP
  DIRECTIVE_SILLYTAVERN_STORAGE=1   write, verify, read, and delete one smoke-owned JSON file
  DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1 click Save Game, Save As, and reselect the new branch
  DIRECTIVE_SILLYTAVERN_GENERATION=1 or DIRECTIVE_LIVE_GENERATION=1
                                      allow Accept Outcome to run narration/provider calls
  DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1 capture desktop and phone-width route screenshots
  DIRECTIVE_SILLYTAVERN_TEARDOWN=1   invoke the served disable lifecycle and verify cleanup
  DIRECTIVE_SILLYTAVERN_STRICT=1    fail instead of reporting optional-check skips

Optional host config:
  DIRECTIVE_SILLYTAVERN_EXTENSION_PATH=/scripts/extensions/third-party/Directive
  DIRECTIVE_SILLYTAVERN_SCREENSHOT_DIR='C:\\tmp\\directive-sillytavern-smoke'
  SILLYTAVERN_COOKIE='name=value'
  SILLYTAVERN_REQUEST_TOKEN='<csrf token>'
  SILLYTAVERN_AUTH_HEADER='Bearer ...'
`;
}

function checklist() {
  return {
    intendedCoverage: [
      'served Directive manifest and extension source assets',
      'extensions-menu registration for Directive',
      'extensions settings dropdown with Open Runtime control',
      'global Directive bridge registration',
      'left command-spine runtime shell rendering',
      'single drawer header action cluster and bottom-left resize handle',
      'Starships, Mission, Crew, Ship, Log, and Settings route tabs',
      'optional active-campaign Mission preview, discard, commit, Save Game, Save As, and branch reselect browser flow',
      'optional desktop and phone-width screenshots for every Directive route',
      'phone-width direct bottom navigation fallback',
      'optional SillyTavern /api/files upload, verify, read, and delete for one smoke-owned file',
      'opt-in provider routing through a live Accept Outcome narration commit',
      'teardown/disable cleanup once a live host exposes a repeatable automation surface'
    ],
    noGenerationByDefault: true,
    storageWriteRequires: 'DIRECTIVE_SILLYTAVERN_STORAGE=1',
    browserRequires: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 and either local Playwright or installed Edge/Chrome CDP support',
    saveFlowRequires: 'DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1, an active campaign, and readable SillyTavern storage for branch reselect proof',
    generationRequires: 'DIRECTIVE_SILLYTAVERN_GENERATION=1 or DIRECTIVE_LIVE_GENERATION=1',
    screenshotsRequire: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 and DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1',
    teardownRequires: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 and DIRECTIVE_SILLYTAVERN_TEARDOWN=1',
    liveHostRequires: 'SILLYTAVERN_BASE_URL or ST_BASE_URL'
  };
}

function compact(value, maxLength = 700) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const redacted = redactSecrets(text);
  return redacted.length <= maxLength ? redacted : `${redacted.slice(0, maxLength)}...`;
}

class NonJsonResponseError extends Error {
  constructor({ method, path, status, contentType, raw }) {
    const type = contentType || 'unknown content type';
    super(`${method} ${path} returned non-JSON response (${status}, ${type}). Excerpt: ${compact(raw, 180)}`);
    this.name = 'NonJsonResponseError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.contentType = contentType || '';
    this.excerpt = compact(raw, 180);
  }
}

class HttpResponseError extends Error {
  constructor({ method, path, status, contentType, raw }) {
    const type = contentType || 'unknown content type';
    super(`${method} ${path} failed with ${status} (${type}): ${compact(raw)}`);
    this.name = 'HttpResponseError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.contentType = contentType || '';
    this.excerpt = compact(raw, 180);
  }
}

class OptionalCheckSkipError extends Error {
  constructor(result) {
    super(result?.reason || 'Optional check skipped.');
    this.name = 'OptionalCheckSkipError';
    this.result = result;
  }
}

function assertContains(text, needle, label) {
  if (!String(text || '').includes(needle)) {
    throw new Error(`${label} is missing "${needle}". Served ${String(text || '').length} bytes. Excerpt: ${compact(text, 260)}`);
  }
}

function redactSecrets(value) {
  let text = String(value);
  for (const secret of [
    process.env.SILLYTAVERN_COOKIE,
    process.env.SILLYTAVERN_REQUEST_TOKEN,
    process.env.SILLYTAVERN_AUTH_HEADER,
    bootstrappedRequestAuth?.cookie,
    bootstrappedRequestAuth?.csrfToken
  ].filter(Boolean)) {
    text = text.split(secret).join('[redacted]');
  }
  return text;
}

function errorSummary(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecrets(error.message)
    };
  }
  return {
    name: typeof error,
    message: compact(error)
  };
}

function isStorageEndpointUnavailableStatus(status) {
  return [0, 401, 403, 404, 405].includes(Number(status));
}

function formatOptionalSkip(result) {
  const parts = [result?.reason || 'Optional check skipped.'];
  if (result?.endpoint) {
    parts.push(`${result.endpoint} returned ${result.status ?? 'unknown'} (${result.contentType || 'unknown content type'}).`);
  }
  if (result?.excerpt) {
    parts.push(`Excerpt: ${result.excerpt}`);
  }
  return parts.join(' ');
}

function maybeReturnOptionalSkip(result) {
  if (STRICT) {
    throw new Error(formatOptionalSkip(result));
  }
  return result;
}

function splitSetCookieHeader(value = '') {
  return String(value || '')
    .split(/,(?=\s*[^=;,\s]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function setCookieHeaders(headers) {
  if (typeof headers?.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const rawHeaders = typeof headers?.raw === 'function' ? headers.raw() : null;
  if (Array.isArray(rawHeaders?.['set-cookie'])) {
    return rawHeaders['set-cookie'];
  }
  const combined = headers?.get?.('set-cookie') || '';
  return splitSetCookieHeader(combined);
}

function cookiePair(setCookieValue = '') {
  return String(setCookieValue || '').split(';')[0].trim();
}

function mergeCookieHeader(...cookieHeaders) {
  const pairsByName = new Map();
  for (const header of cookieHeaders.filter(Boolean)) {
    for (const pair of String(header).split(';').map((item) => item.trim()).filter(Boolean)) {
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      pairsByName.set(pair.slice(0, separator), pair);
    }
  }
  return [...pairsByName.values()].join('; ');
}

function parseMaybeJson(raw = '') {
  if (!String(raw || '').trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function csrfTokenFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  return String(
    payload.token
    || payload.csrfToken
    || payload.csrf
    || payload.requestToken
    || payload._csrf
    || ''
  ).trim();
}

async function ensureRequestAuth() {
  const completeEnvAuth = Boolean(
    process.env.SILLYTAVERN_AUTH_HEADER
    || (process.env.SILLYTAVERN_COOKIE && process.env.SILLYTAVERN_REQUEST_TOKEN)
  );
  if (requestAuthBootstrapAttempted || completeEnvAuth) {
    return bootstrappedRequestAuth;
  }
  requestAuthBootstrapAttempted = true;
  if (!BASE_URL) {
    return null;
  }
  try {
    const headers = {
      accept: 'application/json, */*'
    };
    if (process.env.SILLYTAVERN_COOKIE) {
      headers.cookie = process.env.SILLYTAVERN_COOKIE;
    }
    const response = await fetch(`${BASE_URL}/csrf-token`, {
      method: 'GET',
      headers
    });
    const raw = await response.text();
    const payload = parseMaybeJson(raw);
    const csrfToken = csrfTokenFromPayload(payload);
    const cookie = mergeCookieHeader(...setCookieHeaders(response.headers).map(cookiePair));
    if (response.ok && (csrfToken || cookie)) {
      bootstrappedRequestAuth = {
        csrfToken,
        cookie,
        source: '/csrf-token'
      };
    }
  } catch {
    bootstrappedRequestAuth = null;
  }
  return bootstrappedRequestAuth;
}

function requestHeaders({ json = false } = {}) {
  const headers = {
    accept: json ? 'application/json, */*' : 'text/plain, application/javascript, text/css, application/json, */*'
  };
  if (json) {
    headers['content-type'] = 'application/json';
  }
  if (process.env.SILLYTAVERN_COOKIE) {
    headers.cookie = mergeCookieHeader(process.env.SILLYTAVERN_COOKIE, bootstrappedRequestAuth?.cookie);
  } else if (bootstrappedRequestAuth?.cookie) {
    headers.cookie = bootstrappedRequestAuth.cookie;
  }
  if (process.env.SILLYTAVERN_AUTH_HEADER) {
    headers.authorization = process.env.SILLYTAVERN_AUTH_HEADER;
  }
  if (process.env.SILLYTAVERN_REQUEST_TOKEN) {
    headers['x-csrf-token'] = process.env.SILLYTAVERN_REQUEST_TOKEN;
  } else if (bootstrappedRequestAuth?.csrfToken) {
    headers['x-csrf-token'] = bootstrappedRequestAuth.csrfToken;
  }
  return headers;
}

async function http(path, {
  method = 'GET',
  body,
  text = false,
  allowFailure = false
} = {}) {
  assert.ok(BASE_URL, 'SILLYTAVERN_BASE_URL is required for live HTTP checks.');
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: requestHeaders({ json: body !== undefined }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const raw = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let payload = null;
  if (!response.ok && !allowFailure) {
    throw new HttpResponseError({
      method,
      path,
      status: response.status,
      contentType,
      raw
    });
  }
  if (text) {
    payload = raw;
  } else if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new NonJsonResponseError({
        method,
        path,
        status: response.status,
        contentType,
        raw
      });
    }
  }
  return {
    response,
    payload,
    raw,
    status: response.status,
    contentType
  };
}

async function verifyStaticExtension() {
  const manifest = (await http(`${EXTENSION_PATH}/manifest.json`)).payload;
  assert.equal(manifest.display_name, 'Directive');
  assert.equal(manifest.key, 'directive');
  assert.equal(manifest.js, 'src/extension/index.js');
  assert.equal(manifest.css, 'styles/directive.css');

  const entry = (await http(`${EXTENSION_PATH}/${manifest.js}`, { text: true })).payload;
  if (!/bootstrapDirectiveExtension|configureRuntimeActions/.test(entry)) {
    throw new Error(`Directive entry script does not look current. Served ${entry.length} bytes. Excerpt: ${compact(entry, 260)}`);
  }

  const css = (await http(`${EXTENSION_PATH}/${manifest.css}`, { text: true })).payload;
  if (!/directive-runtime-panel|directive-command-spine-shell|directive-command-drawer/.test(css)) {
    throw new Error(`Directive CSS does not include runtime shell styles. Served ${css.length} bytes. Excerpt: ${compact(css, 260)}`);
  }
  assertContains(css, 'directive-extension-dropdown-title', 'Directive CSS');
  assertContains(css, 'directive-runtime-window-actions', 'Directive CSS');

  const sillyTavernBootstrap = (await http(`${EXTENSION_PATH}/src/hosts/sillytavern/bootstrap.js`, { text: true })).payload;
  assertContains(sillyTavernBootstrap, 'installExtensionsMenuDropdown', 'Directive SillyTavern bootstrap source');

  const settingsPanel = (await http(`${EXTENSION_PATH}/src/extension/settings-panel.js`, { text: true })).payload;
  assertContains(settingsPanel, 'DIRECTIVE_OPEN_RUNTIME_BUTTON_ID', 'Directive settings panel source');
  assertContains(settingsPanel, 'Open Runtime', 'Directive settings panel source');

  const runtimeShell = (await http(`${EXTENSION_PATH}/src/runtime/runtime-shell.js`, { text: true })).payload;
  assertContains(runtimeShell, 'createDirectiveCommandSpineShell', 'Directive runtime shell source');

  const commandSpineShell = (await http(`${EXTENSION_PATH}/src/ui/directive-command-spine-shell.js`, { text: true })).payload;
  assertContains(commandSpineShell, "panel.dataset.directiveShell = 'command-spine'", 'Directive command spine source');
  assertContains(commandSpineShell, 'directive-command-drawer-resize-handle', 'Directive command spine source');
  assertContains(commandSpineShell, "dataset.directiveShellActions = 'drawer-header'", 'Directive command spine source');

  const shellLayout = (await http(`${EXTENSION_PATH}/src/ui/directive-shell-layout.mjs`, { text: true })).payload;
  assertContains(shellLayout, 'viewport.width * 0.47', 'Directive shell layout source');
  assertContains(shellLayout, 'DIRECTIVE_SHELL_LAYOUT_STORAGE_KEY', 'Directive shell layout source');

  return {
    manifest: {
      displayName: manifest.display_name,
      key: manifest.key,
      version: manifest.version,
      js: manifest.js,
      css: manifest.css
    },
    entryBytes: entry.length,
    cssBytes: css.length,
    sillyTavernBootstrapBytes: sillyTavernBootstrap.length,
    settingsPanelBytes: settingsPanel.length,
    extensionDropdownSource: true,
    runtimeShellBytes: runtimeShell.length,
    commandSpineShellBytes: commandSpineShell.length,
    shellLayoutBytes: shellLayout.length,
    commandSpineSource: true
  };
}

async function runStorageSmoke() {
  if (!RUN_STORAGE) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_STORAGE=1 not set'
    };
  }

  const fileName = `directive-sillytavern-live-smoke-${Date.now()}.v1.json`;
  const body = {
    kind: 'directive.sillyTavernLiveSmoke',
    createdAt: new Date().toISOString(),
    destructive: false
  };
  const encoded = Buffer.from(`${JSON.stringify(body, null, 2)}\n`, 'utf8').toString('base64');
  let storedPath = '';

  try {
    try {
      const authBootstrap = await ensureRequestAuth();
      const upload = (await http('/api/files/upload', {
        method: 'POST',
        body: {
          name: fileName,
          data: encoded
        }
      })).payload;
      storedPath = String(upload?.path || '');
      assert.equal(storedPath, `/user/files/${fileName}`);

      const verified = (await http('/api/files/verify', {
        method: 'POST',
        body: {
          urls: [storedPath]
        }
      })).payload;
      assert.equal(verified?.[storedPath], true);

      const readBackResult = await http(storedPath, { text: true });
      let readBackPayload;
      try {
        readBackPayload = JSON.parse(readBackResult.payload);
      } catch {
        throw new NonJsonResponseError({
          method: 'GET',
          path: storedPath,
          status: readBackResult.status,
          contentType: readBackResult.contentType,
          raw: readBackResult.payload
        });
      }
      assert.equal(readBackPayload.kind, body.kind);

      return {
        skipped: false,
        path: storedPath,
        verified: true,
        readBack: true,
        authBootstrap: authBootstrap?.source || 'env-or-not-required'
      };
    } finally {
      if (storedPath) {
        await http('/api/files/delete', {
          method: 'POST',
          body: {
            path: storedPath
          },
          text: true,
          allowFailure: false
        });
      }
    }
  } catch (error) {
    if (error instanceof NonJsonResponseError) {
      const result = {
        skipped: true,
        reason: 'SillyTavern file API returned a non-JSON response; storage smoke was not proven and no smoke-owned cleanup path was available.',
        endpoint: `${error.method} ${error.path}`,
        status: error.status,
        contentType: error.contentType || 'unknown',
        excerpt: error.excerpt
      };
      if (STRICT) {
        throw new Error(`${result.reason} ${result.endpoint} returned ${result.status} (${result.contentType}). Excerpt: ${result.excerpt}`);
      }
      return result;
    }
    if (error instanceof HttpResponseError && isStorageEndpointUnavailableStatus(error.status)) {
      return maybeReturnOptionalSkip({
        skipped: true,
        reason: 'SillyTavern file API endpoint was missing or forbidden; storage smoke was not proven and no smoke-owned cleanup path was available.',
        endpoint: `${error.method} ${error.path}`,
        status: error.status,
        contentType: error.contentType || 'unknown',
        excerpt: error.excerpt
      });
    }
    throw error;
  }
}

function browserSkip(reason) {
  if (STRICT) {
    throw new Error(reason);
  }
  return {
    skipped: true,
    reason
  };
}

function isPlaywrightDependencyError(error) {
  const message = String(error?.message || error || '');
  return /Cannot find package 'playwright'|Executable doesn't exist|playwright install|Host system is missing dependencies|browserType\.launch/i.test(message);
}

function assertBrowser(condition, message, details = null) {
  if (!condition) {
    throw new Error(details ? `${message}: ${compact(details, 420)}` : message);
  }
}

async function browserStep(label, operation) {
  try {
    return await operation();
  } catch (error) {
    throw new Error(`Browser smoke failed during ${label}: ${error?.message || error}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function cdpBrowserCandidates() {
  return [
    process.env.DIRECTIVE_SILLYTAVERN_BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ].filter(Boolean);
}

async function reserveLocalPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForCdpEndpoint(port, timeoutMs) {
  const started = Date.now();
  const versionUrl = `http://127.0.0.1:${port}/json/version`;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(versionUrl);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Browser process is still starting.
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for Chromium CDP endpoint on ${versionUrl}.`);
}

class CdpConnection {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.webSocketUrl);
      this.socket = socket;
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', (event) => {
        reject(new Error(event?.message || `Failed to connect to ${this.webSocketUrl}.`));
      }, { once: true });
      socket.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });
      socket.addEventListener('close', () => {
        this.rejectPending('CDP socket closed.');
      });
      socket.addEventListener('error', () => {
        this.rejectPending('CDP socket error.');
      });
    });
  }

  rejectPending(message) {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message.id || !this.pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = this.pending.get(message.id);
    clearTimeout(this.pending.get(message.id).timer);
    this.pending.delete(message.id);
    if (message.error) {
      reject(new Error(`${message.error.message || 'CDP command failed'} (${message.error.code || 'unknown code'})`));
      return;
    }
    resolve(message.result || {});
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('CDP socket is not open.');
    }
    const id = this.nextId++;
    const payload = JSON.stringify({
      id,
      method,
      params
    });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for CDP command ${method}.`));
      }, BROWSER_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(payload);
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Best effort.
    }
  }
}

function serializeCdpArgument(value) {
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  return JSON.stringify(value);
}

function cdpFunctionExpression(pageFunction, args) {
  const source = typeof pageFunction === 'function'
    ? pageFunction.toString()
    : `() => (${String(pageFunction)})`;
  return `(() => {
    const __directiveSmokeFn = ${source};
    return __directiveSmokeFn(${args.map(serializeCdpArgument).join(', ')});
  })()`;
}

class CdpLocator {
  constructor(page, definition) {
    this.page = page;
    this.definition = {
      selector: definition.selector,
      filterText: definition.filterText || '',
      role: definition.role || '',
      name: definition.name || '',
      exact: Boolean(definition.exact),
      firstOnly: Boolean(definition.firstOnly)
    };
  }

  first() {
    return new CdpLocator(this.page, {
      ...this.definition,
      firstOnly: true
    });
  }

  filter({ hasText } = {}) {
    return new CdpLocator(this.page, {
      ...this.definition,
      filterText: String(hasText || '')
    });
  }

  getByRole(role, options = {}) {
    return new CdpLocator(this.page, {
      selector: this.definition.selector,
      filterText: this.definition.filterText,
      role,
      name: String(options.name || ''),
      exact: Boolean(options.exact)
    });
  }

  async count() {
    return this.page.evaluate((definition) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const roots = Array.from(document.querySelectorAll(definition.selector || 'body'))
        .filter((element) => !definition.filterText || normalize(element.textContent).includes(definition.filterText));
      let elements = roots;
      if (definition.role === 'button') {
        elements = roots.flatMap((root) => Array.from(root.querySelectorAll('button, [role="button"]')))
          .filter((element) => {
            const text = normalize(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
            return definition.exact ? text === definition.name : text.includes(definition.name);
          });
      }
      return definition.firstOnly ? Math.min(elements.length, 1) : elements.length;
    }, this.definition);
  }

  async waitFor({ timeout = BROWSER_TIMEOUT_MS } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await this.count() > 0) {
        return;
      }
      await sleep(100);
    }
    throw new Error(`Locator "${this.definition.selector}" did not appear before timeout.`);
  }

  async click({ timeout = BROWSER_TIMEOUT_MS } = {}) {
    await this.waitFor({ timeout });
    const clicked = await this.page.evaluate((definition) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const roots = Array.from(document.querySelectorAll(definition.selector || 'body'))
        .filter((element) => !definition.filterText || normalize(element.textContent).includes(definition.filterText));
      let elements = roots;
      if (definition.role === 'button') {
        elements = roots.flatMap((root) => Array.from(root.querySelectorAll('button, [role="button"]')))
          .filter((element) => {
            const text = normalize(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
            return definition.exact ? text === definition.name : text.includes(definition.name);
          });
      }
      const element = elements[0];
      if (!element) return false;
      element.scrollIntoView?.({ block: 'center', inline: 'center' });
      element.click();
      return true;
    }, this.definition);
    assertBrowser(clicked, `Locator "${this.definition.selector}" could not be clicked.`, this.definition);
  }

  async fill(value) {
    const filled = await this.page.evaluate((definition, nextValue) => {
      const element = Array.from(document.querySelectorAll(definition.selector || 'input, textarea'))[0];
      if (!element) return false;
      element.focus?.();
      element.value = nextValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, this.definition, String(value || ''));
    assertBrowser(filled, `Locator "${this.definition.selector}" could not be filled.`, this.definition);
  }

  async evaluateAll(pageFunction) {
    return this.page.evaluate((definition, functionSource) => {
      const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
      const roots = Array.from(document.querySelectorAll(definition.selector || 'body'))
        .filter((element) => !definition.filterText || normalize(element.textContent).includes(definition.filterText));
      let elements = roots;
      if (definition.role === 'button') {
        elements = roots.flatMap((root) => Array.from(root.querySelectorAll('button, [role="button"]')))
          .filter((element) => {
            const text = normalize(element.textContent || element.getAttribute('aria-label') || element.getAttribute('title') || '');
            return definition.exact ? text === definition.name : text.includes(definition.name);
          });
      }
      const mapper = new Function(`return (${functionSource});`)();
      return mapper(elements);
    }, this.definition, pageFunction.toString());
  }
}

class CdpPage {
  constructor(connection) {
    this.connection = connection;
  }

  async initialize() {
    await this.connection.send('Runtime.enable');
    await this.connection.send('Page.enable');
  }

  async goto(url) {
    await this.connection.send('Page.navigate', { url });
    await this.waitForFunction(() => ['interactive', 'complete'].includes(document.readyState), null, {
      timeout: BROWSER_TIMEOUT_MS
    });
  }

  async waitForLoadState() {
    await sleep(500);
  }

  async setViewportSize({ width, height }) {
    await this.connection.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 560,
      screenWidth: width,
      screenHeight: height
    });
    await this.connection.send('Emulation.setVisibleSize', {
      width,
      height
    }).catch(() => {});
  }

  async screenshot({ path: filePath } = {}) {
    const result = await this.connection.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false
    });
    const bytes = Buffer.from(result.data || '', 'base64');
    if (filePath) {
      fs.writeFileSync(filePath, bytes);
    }
    return bytes;
  }

  async evaluate(pageFunction, ...args) {
    const expression = cdpFunctionExpression(pageFunction, args);
    const result = await this.connection.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(details.exception?.description || details.text || 'CDP evaluation failed.');
    }
    return result.result?.value;
  }

  async waitForFunction(pageFunction, arg = null, options = {}) {
    const timeout = positiveInteger(options?.timeout, BROWSER_TIMEOUT_MS);
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const result = await this.evaluate(pageFunction, arg);
      if (result) {
        return result;
      }
      await sleep(100);
    }
    throw new Error('Timed out waiting for browser function.');
  }

  locator(selector) {
    return new CdpLocator(this, { selector });
  }
}

class CdpBrowser {
  constructor({
    executablePath,
    process,
    tempUserDataDir,
    connection
  }) {
    this.executablePath = executablePath;
    this.process = process;
    this.tempUserDataDir = tempUserDataDir;
    this.connection = connection;
  }

  async newPage() {
    const page = new CdpPage(this.connection);
    await page.initialize();
    return page;
  }

  async close() {
    try {
      await this.connection.send('Browser.close');
    } catch {
      // Browser may already be closing.
    }
    this.connection.close();
    try {
      this.process.kill();
    } catch {
      // Best effort.
    }
    try {
      fs.rmSync(this.tempUserDataDir, {
        recursive: true,
        force: true
      });
    } catch {
      // Best effort.
    }
  }
}

async function launchCdpBrowser() {
  if (typeof WebSocket !== 'function') {
    throw new Error('Node WebSocket support is not available for CDP fallback.');
  }
  const executablePaths = cdpBrowserCandidates().filter((candidate) => fs.existsSync(candidate));
  if (executablePaths.length === 0) {
    throw new Error('No Edge or Chrome executable was found. Set DIRECTIVE_SILLYTAVERN_BROWSER_PATH to use CDP fallback.');
  }

  const failures = [];
  for (const executablePath of executablePaths) {
    try {
      return await launchCdpBrowserExecutable(executablePath);
    } catch (error) {
      failures.push(`${executablePath}: ${error?.message || error}`);
    }
  }

  throw new Error(`No installed Chromium CDP endpoint could be opened. ${failures.join(' | ')}`);
}

async function launchCdpBrowserExecutable(executablePath) {
  const port = await reserveLocalPort();
  const tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'directive-smoke-cdp-'));
  const args = [
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempUserDataDir}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-gpu',
    '--window-size=1280,900'
  ];
  if (HEADLESS) {
    args.push('--headless=new');
  }

  const browserProcess = spawn(executablePath, args, {
    stdio: 'ignore',
    windowsHide: true
  });
  browserProcess.unref?.();

  try {
    await waitForCdpEndpoint(port, BROWSER_TIMEOUT_MS);
    const newPageResponse = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, {
      method: 'PUT'
    });
    if (!newPageResponse.ok) {
      throw new Error(`CDP /json/new failed with ${newPageResponse.status}.`);
    }
    const target = await newPageResponse.json();
    const connection = new CdpConnection(target.webSocketDebuggerUrl);
    await connection.connect();
    return new CdpBrowser({
      executablePath,
      process: browserProcess,
      tempUserDataDir,
      connection
    });
  } catch (error) {
    try {
      browserProcess.kill();
    } catch {
      // Best effort.
    }
    try {
      fs.rmSync(tempUserDataDir, {
        recursive: true,
        force: true
      });
    } catch {
      // Best effort.
    }
    throw error;
  }
}

async function openDirectivePanel(page) {
  await page.waitForFunction(() => {
    if (typeof globalThis.Directive?.bridge?.showRuntime === 'function') return true;
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') return true;
    if (typeof globalThis.Directive?.actions?.run === 'function') return true;
    if (document.getElementById('directive-extensions-menu-button')) return true;
    return Array.from(document.querySelectorAll('button, a, div, [role="button"]')).some((element) => {
      const text = `${element.textContent || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('aria-label') || ''}`;
      return /\bDirective\b/i.test(text);
    });
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

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
    const menuButton = document.getElementById('directive-extensions-menu-button')
      || Array.from(document.querySelectorAll('button, a, div, [role="button"]')).find((element) => {
        const text = `${element.textContent || ''} ${element.getAttribute('title') || ''} ${element.getAttribute('aria-label') || ''}`;
        return /\bDirective\b/i.test(text);
      });
    menuButton?.click();
    return menuButton ? 'extensions-menu' : '';
  });

  assertBrowser(openedWith, 'Directive bridge or menu launcher was not found on the live SillyTavern page.');
  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    return Boolean(
      panel
      && panel.hidden !== true
      && (panel.dataset.directiveShell === 'command-spine' || panel.classList.contains('directive-command-spine-shell'))
      && panel.querySelector('[data-directive-runtime-body="true"]')
    );
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });
  return openedWith;
}

async function verifyExtensionControls(page) {
  await page.waitForFunction(() => {
    return Boolean(
      document.getElementById('directive_settings')
      && document.getElementById('directive_open_runtime')
    );
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

  const snapshot = await page.evaluate(() => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    let resetLayoutRegistered = false;
    try {
      resetLayoutRegistered = Boolean(globalThis.Directive?.actions?.has?.('runtime.resetLayout'));
      if (!resetLayoutRegistered && typeof globalThis.Directive?.bridge?.listActions === 'function') {
        resetLayoutRegistered = globalThis.Directive.bridge.listActions().some((action) => action?.id === 'runtime.resetLayout');
      }
    } catch {
      resetLayoutRegistered = false;
    }

    const root = document.getElementById('directive_settings');
    const title = root?.querySelector('.directive-extension-dropdown-title');
    const openButton = document.getElementById('directive_open_runtime');
    const resetButton = document.getElementById('directive_reset_window');
    return {
      root: Boolean(root),
      parentId: root?.parentElement?.id || '',
      inlineDrawer: Boolean(root?.querySelector('.inline-drawer')),
      title: normalize(title?.textContent),
      titleIcon: title?.querySelector('.directive-extensions-menu-icon')?.className || '',
      description: normalize(root?.querySelector('.directive-extension-description')?.textContent),
      openRuntime: Boolean(openButton),
      openRuntimeText: normalize(openButton?.textContent),
      openRuntimeTitle: openButton?.getAttribute('title') || '',
      resetWindow: Boolean(resetButton),
      resetWindowText: normalize(resetButton?.textContent),
      resetLayoutRegistered
    };
  });

  assertBrowser(snapshot.root, 'Directive settings dropdown was not mounted.', snapshot);
  assertBrowser(['extensions_settings2', 'extensions_settings'].includes(snapshot.parentId), 'Directive settings dropdown mounted outside the SillyTavern extensions settings container.', snapshot);
  assertBrowser(snapshot.inlineDrawer, 'Directive settings dropdown is not using SillyTavern inline-drawer markup.', snapshot);
  assertBrowser(snapshot.title === 'Directive', 'Directive settings dropdown title was wrong.', snapshot);
  assertBrowser(/\bfa-compass\b/.test(snapshot.titleIcon), 'Directive settings dropdown did not include the compass icon.', snapshot);
  assertBrowser(/\bmission\b/i.test(snapshot.description) && /\bsettings\b/i.test(snapshot.description), 'Directive settings dropdown description did not describe the runtime scope.', snapshot);
  assertBrowser(snapshot.openRuntime, 'Directive settings dropdown did not expose Open Runtime.', snapshot);
  assertBrowser(snapshot.openRuntimeText === 'Open Runtime', 'Directive Open Runtime label was wrong.', snapshot);
  assertBrowser(snapshot.openRuntimeTitle === 'Open the Directive runtime.', 'Directive Open Runtime title was wrong.', snapshot);
  assertBrowser(snapshot.resetWindow === snapshot.resetLayoutRegistered, 'Directive Reset Window visibility did not match reset-layout availability.', snapshot);
  if (snapshot.resetWindow) {
    assertBrowser(snapshot.resetWindowText === 'Reset Window', 'Directive Reset Window label was wrong.', snapshot);
  }

  await page.evaluate(() => {
    document.getElementById('directive_open_runtime')?.click();
  });
  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    return Boolean(
      panel
      && panel.hidden !== true
      && panel.getAttribute('aria-hidden') !== 'true'
      && getComputedStyle(panel).display !== 'none'
    );
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

  return {
    ...snapshot,
    openedFromDropdown: true
  };
}

async function installBrowserErrorCapture(page) {
  await page.evaluate(() => {
    if (globalThis.__directiveSmokeErrorCaptureInstalled) return true;
    globalThis.__directiveSmokeErrorCaptureInstalled = true;
    globalThis.__directiveSmokeErrors = [];
    const compactError = (value) => {
      if (value?.stack) return String(value.stack);
      if (value?.message) return String(value.message);
      try {
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const record = (kind, value) => {
      globalThis.__directiveSmokeErrors.push({
        kind,
        message: compactError(value),
        at: new Date().toISOString()
      });
      if (globalThis.__directiveSmokeErrors.length > 12) {
        globalThis.__directiveSmokeErrors.splice(0, globalThis.__directiveSmokeErrors.length - 12);
      }
    };
    globalThis.addEventListener?.('error', (event) => {
      record('error', event?.error || event?.message || 'window error');
    });
    globalThis.addEventListener?.('unhandledrejection', (event) => {
      record('unhandledrejection', event?.reason || 'unhandled rejection');
    });
    const originalConsoleError = globalThis.console?.error;
    if (typeof originalConsoleError === 'function') {
      globalThis.console.error = (...args) => {
        record('console.error', args.map(compactError).join(' '));
        return originalConsoleError.apply(globalThis.console, args);
      };
    }
    return true;
  });
}

async function panelSnapshot(page) {
  return page.evaluate((requiredRoutes) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const body = panel?.querySelector('[data-directive-runtime-body="true"]') || null;
    const routeButtons = Array.from(panel?.querySelectorAll('.directive-spine-route') || []);
    const routeLabel = (button) => normalize(
      button?.querySelector('.directive-spine-route-label')?.textContent
      || button?.dataset.mobileLabel
      || button?.getAttribute('aria-label')
      || button?.textContent
    );
    const bodyButtons = Array.from(body?.querySelectorAll('button') || []).map((button) => normalize(button.textContent)).filter(Boolean);
    const routeLabels = routeButtons.map(routeLabel).filter(Boolean);
    const routeIds = routeButtons.map((button) => button.dataset.routeId || button.dataset.tab || '').filter(Boolean);
    const selected = routeButtons.find((button) => button.getAttribute('aria-selected') === 'true');
    const bodyText = normalize(body?.textContent || '');
    const drawer = panel?.querySelector('.directive-command-drawer') || null;
    const resizeHandle = drawer?.querySelector('[data-directive-drawer-resize-handle="true"]') || null;
    const providerContext = (() => {
      try {
        const ctx = globalThis.SillyTavern?.getContext?.();
        const supportedGenerationMethods = ['generateRaw', 'generate', 'generateText'].filter((method) => (
          typeof ctx?.[method] === 'function'
        ));
        const unsupportedGenerationHints = ['generateQuietPrompt', 'connectionManagerRequestService'].filter((method) => (
          Boolean(ctx?.[method])
        ));
        return {
          available: Boolean(ctx),
          generationSurface: supportedGenerationMethods.length > 0,
          supportedGenerationMethods,
          unsupportedGenerationHints
        };
      } catch {
        return {
          available: false,
          generationSurface: false,
          supportedGenerationMethods: [],
          unsupportedGenerationHints: []
        };
      }
    })();
    return {
      browserErrors: Array.isArray(globalThis.__directiveSmokeErrors)
        ? globalThis.__directiveSmokeErrors.slice(-8)
        : [],
      bridge: Boolean(globalThis.Directive?.bridge?.showRuntime),
      actions: Array.isArray(globalThis.Directive?.bridge?.listActions?.())
        ? globalThis.Directive.bridge.listActions().map((action) => action.id)
        : [],
      panel: Boolean(panel),
      hidden: panel?.hidden === true,
      commandSpine: panel?.dataset.directiveShell === 'command-spine' || panel?.classList.contains('directive-command-spine-shell'),
      drawer: Boolean(drawer),
      drawerOpen: panel?.dataset.drawerOpen === 'true' && drawer?.hidden !== true,
      drawerHeader: Boolean(panel?.querySelector('[data-directive-shell-actions="drawer-header"]')),
      resizeHandle: Boolean(resizeHandle),
      fullscreenControl: Boolean(panel?.querySelector('[data-shell-action="fullscreen"]')),
      collapseControl: Boolean(panel?.querySelector('[data-shell-action="collapse"]')),
      routeLabels,
      routeIds,
      selectedRouteId: selected?.dataset.routeId || selected?.dataset.tab || null,
      shellTitle: normalize(panel?.querySelector('[data-directive-current-route-title="true"] .directive-shell-title-label')?.textContent || ''),
      routeContext: normalize(panel?.querySelector('[data-directive-current-route="true"]')?.textContent || ''),
      missingRoutes: requiredRoutes.filter((label) => !routeLabels.includes(label)),
      headings: Array.from(body?.querySelectorAll('h2,h3,h4') || []).map((heading) => normalize(heading.textContent)).filter(Boolean).slice(0, 16),
      bodyText,
      bodyButtons,
      stateSafetyControls: {
        section: Boolean(body?.querySelector('.directive-settings-state-safety-card'))
          || /State Safety|Safety & State|Campaign State Controls/i.test(bodyText),
        verify: bodyButtons.includes('Verify Active Save'),
        settle: bodyButtons.includes('Settle Active State'),
        export: bodyButtons.includes('Export Active Save'),
        clean: bodyButtons.includes('Clean Missing Records')
      },
      hasActiveCampaign: !/No active campaign\./i.test(bodyText)
        && bodyButtons.includes('Preview Outcome')
        && bodyButtons.includes('Save Game')
        && bodyButtons.includes('Save As')
        && Boolean(body?.querySelector('[data-input-path="turn.playerInput"]')),
      noActiveCampaign: /No active campaign\./i.test(bodyText),
      hasTurnInput: Boolean(body?.querySelector('[data-input-path="turn.playerInput"]')),
      hasSaveAsInput: Boolean(body?.querySelector('[data-input-path="saveAs.name"]')),
      saveAsValue: body?.querySelector('[data-input-path="saveAs.name"]')?.value || '',
      hasPendingPreview: /Provisional Outcome|Replacement Outcome|Procedure Check/i.test(bodyText),
      hasLastOutcome: /Last Outcome/i.test(bodyText),
      hasNarrationRecovery: /Narration Recovery/i.test(bodyText),
      providerContext
    };
  }, REQUIRED_ROUTES);
}

async function navigateDirectiveRoute(page, label) {
  const tabId = ROUTE_IDS[label];
  assertBrowser(tabId, `No route id is configured for "${label}".`);
  const usedBridge = await page.evaluate(async (routeId) => {
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') {
      await globalThis.Directive.bridge.runAction('runtime.setTab', { tabId: routeId });
      return true;
    }
    if (typeof globalThis.Directive?.actions?.run === 'function') {
      await globalThis.Directive.actions.run('runtime.setTab', { tabId: routeId });
      return true;
    }
    return false;
  }, tabId);

  if (!usedBridge) {
    const selector = `#directive-runtime-panel [data-route-id="${tabId}"], [data-directive-shell="command-spine"] [data-route-id="${tabId}"]`;
    await page.locator(selector).first().click({ timeout: BROWSER_TIMEOUT_MS });
  }

  await page.waitForFunction(({ routeId, routeLabel }) => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const selected = panel?.querySelector(`[data-route-id="${routeId}"]`);
    const body = panel?.querySelector('[data-directive-runtime-body="true"]');
    return Boolean(
      selected
      && selected.getAttribute('aria-selected') === 'true'
      && body
      && String(body.textContent || '').includes(routeLabel)
    );
  }, {
    routeId: tabId,
    routeLabel: label
  }, {
    timeout: BROWSER_TIMEOUT_MS
  });

  return {
    label,
    routeId: tabId,
    usedBridge
  };
}

async function verifyBrowserRoutes(page) {
  const coverage = [];
  for (const label of REQUIRED_ROUTES) {
    const navigation = await navigateDirectiveRoute(page, label);
    const snapshot = await panelSnapshot(page);
    assertBrowser(snapshot.selectedRouteId === navigation.routeId, `Route "${label}" did not become selected.`, snapshot);
    assertBrowser(snapshot.headings.includes(label), `Route "${label}" did not render its panel heading.`, snapshot);
    assertBrowser(snapshot.shellTitle === label, `Route "${label}" did not update the shell title label.`, snapshot);
    assertBrowser(snapshot.routeContext === label, `Route "${label}" did not update the shell context label.`, snapshot);
    if (label === 'Settings') {
      assertBrowser(snapshot.stateSafetyControls.section, 'Settings did not render State Safety controls.', snapshot);
      assertBrowser(snapshot.stateSafetyControls.verify, 'Settings did not render Verify Active Save.', snapshot);
      assertBrowser(snapshot.stateSafetyControls.settle, 'Settings did not render Settle Active State.', snapshot);
      assertBrowser(snapshot.stateSafetyControls.export, 'Settings did not render Export Active Save.', snapshot);
      assertBrowser(snapshot.stateSafetyControls.clean, 'Settings did not render Clean Missing Records.', snapshot);
    }
    coverage.push({
      label,
      routeId: navigation.routeId,
      usedBridge: navigation.usedBridge
    });
  }
  return coverage;
}

async function bodyButtonLabels(page) {
  return page.locator('#directive-runtime-panel [data-directive-runtime-body="true"] button').evaluateAll((buttons) => (
    buttons.map((button) => String(button.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
  ));
}

async function clickBodyButton(page, label) {
  const body = page.locator('#directive-runtime-panel [data-directive-runtime-body="true"]').first();
  const button = body.getByRole('button', { name: label, exact: true });
  const count = await button.count();
  if (count === 0) {
    const labels = await bodyButtonLabels(page);
    throw new Error(`Button "${label}" was not found in the Directive panel body. Visible buttons: ${labels.join(', ') || 'none'}`);
  }
  await button.first().click({ timeout: BROWSER_TIMEOUT_MS });
}

async function clickCommitButton(page) {
  const labels = await bodyButtonLabels(page);
  const label = labels.find((candidate) => ['Accept Outcome', 'Accept Replacement', 'Confirm Risk'].includes(candidate))
    || labels.find((candidate) => /^Inspiration\b|^Resolve\b/i.test(candidate));
  assertBrowser(label, 'No commit button was available after preview.', { labels });
  await clickBodyButton(page, label);
  return label;
}

async function waitForBodyButtonEnabled(page, label) {
  await page.waitForFunction((buttonLabel) => {
    const panel = document.querySelector('#directive-runtime-panel');
    const body = panel?.querySelector('[data-directive-runtime-body="true"]');
    return Array.from(body?.querySelectorAll('button') || []).some((button) => (
      String(button.textContent || '').replace(/\s+/g, ' ').trim() === buttonLabel
      && button.disabled !== true
    ));
  }, label, {
    timeout: BROWSER_TIMEOUT_MS
  });
}

async function readBrowserStorageJson(page, userFilesPath, label, { unavailableIsSkip = false } = {}) {
  const result = await page.evaluate(async (path) => {
    try {
      const headers = (() => {
        try {
          return globalThis.SillyTavern?.getContext?.()?.getRequestHeaders?.() || {};
        } catch {
          return {};
        }
      })();
      const response = await fetch(path, {
        method: 'GET',
        headers
      });
      const raw = await response.text();
      let payload = null;
      let parseError = '';
      if (raw) {
        try {
          payload = JSON.parse(raw);
        } catch (error) {
          parseError = error?.message || String(error);
        }
      }
      return {
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get('content-type') || '',
        payload,
        parseError,
        excerpt: raw.slice(0, 220)
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: '',
        payload: null,
        parseError: '',
        excerpt: error?.message || String(error)
      };
    }
  }, userFilesPath);

  const endpoint = `GET ${userFilesPath}`;
  if (!result.ok) {
    const skip = {
      skipped: true,
      reason: `${label} was not readable through SillyTavern storage; branch load/reselect was not proven.`,
      endpoint,
      status: result.status,
      contentType: result.contentType || 'unknown',
      excerpt: compact(result.excerpt || '', 180)
    };
    if (unavailableIsSkip && isStorageEndpointUnavailableStatus(result.status)) {
      throw new OptionalCheckSkipError(maybeReturnOptionalSkip(skip));
    }
    throw new Error(formatOptionalSkip(skip));
  }

  if (result.parseError) {
    const skip = {
      skipped: true,
      reason: `${label} returned a non-JSON response through SillyTavern storage; branch load/reselect was not proven.`,
      endpoint,
      status: result.status,
      contentType: result.contentType || 'unknown',
      excerpt: compact(result.excerpt || '', 180)
    };
    if (unavailableIsSkip) {
      throw new OptionalCheckSkipError(maybeReturnOptionalSkip(skip));
    }
    throw new Error(formatOptionalSkip(skip));
  }

  return result.payload;
}

function indexedSaveEntries(saveIndex) {
  return Object.values(saveIndex?.saves || {}).filter((entry) => entry && typeof entry === 'object');
}

function findSaveEntryByName(saveIndex, saveName) {
  const matches = indexedSaveEntries(saveIndex)
    .filter((entry) => entry.name === saveName)
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  if (matches.length === 0) {
    throw new Error(`Save As branch "${saveName}" was not present in the SillyTavern save index. Indexed save count: ${indexedSaveEntries(saveIndex).length}.`);
  }
  return matches[0];
}

function userFilesPathForIndexedEntry(entry) {
  const path = String(entry?.path || '');
  if (!path) {
    throw new Error(`Save index entry "${entry?.id || 'unknown'}" does not include a payload path.`);
  }
  return path.startsWith('/user/files/') ? path : toSillyTavernUserFilesPath(path);
}

function assertActiveSaveIndex(saveIndex, saveId, label) {
  assert.equal(saveIndex?.activeSaveId, saveId, `${label} activeSaveId`);
  const currentIds = indexedSaveEntries(saveIndex).filter((entry) => entry.current === true).map((entry) => entry.id);
  assert.deepEqual(currentIds, [saveId], `${label} current save marker`);
}

function campaignIdentitySummary(saveRecord) {
  const campaignState = saveRecord?.payload?.campaignState || {};
  const turnEntries = campaignState?.turnLedger?.entries;
  return {
    campaignId: campaignState?.campaign?.id || saveRecord?.metadata?.campaignId || null,
    campaignTitle: campaignState?.campaign?.title || saveRecord?.metadata?.campaignTitle || null,
    packageId: campaignState?.activeStarshipPackage?.packageId || saveRecord?.metadata?.packageId || null,
    playerName: campaignState?.player?.name || saveRecord?.metadata?.playerName || null,
    shipName: campaignState?.ship?.name || campaignState?.starship?.name || saveRecord?.metadata?.shipName || null,
    missionId: campaignState?.mission?.activeMissionId || campaignState?.mission?.id || null,
    missionGraphId: campaignState?.mission?.activeMissionGraphId || null,
    stardate: campaignState?.campaign?.currentStardate || null,
    turnCount: Array.isArray(turnEntries) ? turnEntries.length : null
  };
}

async function assertMissionBodyShowsCampaign(page, summary) {
  const visible = await page.evaluate((expected) => {
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"]');
    const text = normalize(body?.textContent || '');
    const checks = ['playerName', 'shipName', 'campaignTitle'].filter((key) => expected?.[key]);
    return {
      checks,
      missing: checks.filter((key) => !text.includes(expected[key])),
      excerpt: text.slice(0, 400)
    };
  }, summary);
  assertBrowser(visible.missing.length === 0, 'Mission body did not show the loaded branch campaign identity.', visible);
}

async function clickStarshipsSaveLoad(page, saveName) {
  await navigateDirectiveRoute(page, 'Starships');
  const row = page.locator('#directive-runtime-panel [data-directive-runtime-body="true"] .directive-record-row').filter({
    hasText: saveName
  }).first();
  await row.waitFor({ timeout: BROWSER_TIMEOUT_MS });
  const loadButton = row.getByRole('button', {
    name: 'Load',
    exact: true
  });
  await loadButton.click({ timeout: BROWSER_TIMEOUT_MS });
  await page.waitForFunction((missionRouteId) => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const selected = panel?.querySelector(`[data-route-id="${missionRouteId}"]`);
    const body = panel?.querySelector('[data-directive-runtime-body="true"]');
    const bodyText = String(body?.textContent || '');
    return Boolean(
      selected
      && selected.getAttribute('aria-selected') === 'true'
      && body
      && /Preview Outcome/i.test(bodyText)
      && /Save Game/i.test(bodyText)
    );
  }, ROUTE_IDS.Mission, {
    timeout: BROWSER_TIMEOUT_MS
  });
}

async function verifySaveAsBranchReselect(page, saveAsName) {
  try {
    const saveIndexAfterSaveAs = await readBrowserStorageJson(
      page,
      SAVE_INDEX_USER_FILES_PATH,
      'Directive save index',
      { unavailableIsSkip: true }
    );
    const branchEntry = findSaveEntryByName(saveIndexAfterSaveAs, saveAsName);
    assertActiveSaveIndex(saveIndexAfterSaveAs, branchEntry.id, 'Save As branch');

    const payloadPath = userFilesPathForIndexedEntry(branchEntry);
    const branchRecordBeforeLoad = await readBrowserStorageJson(page, payloadPath, 'Save As branch payload');
    assert.equal(branchRecordBeforeLoad?.kind, 'directive.campaignSave', 'Save As branch payload kind');
    assert.equal(branchRecordBeforeLoad?.id, branchEntry.id, 'Save As branch payload id');
    assert.equal(branchRecordBeforeLoad?.name, saveAsName, 'Save As branch payload name');
    const beforeSummary = campaignIdentitySummary(branchRecordBeforeLoad);

    await clickStarshipsSaveLoad(page, saveAsName);
    const missionSnapshot = await panelSnapshot(page);
    assertBrowser(missionSnapshot.selectedRouteId === ROUTE_IDS.Mission, 'Branch load did not return to Mission.', missionSnapshot);
    assertBrowser(missionSnapshot.hasActiveCampaign, 'Branch load did not render an active Mission campaign.', missionSnapshot);
    await assertMissionBodyShowsCampaign(page, beforeSummary);

    const saveIndexAfterLoad = await readBrowserStorageJson(page, SAVE_INDEX_USER_FILES_PATH, 'Directive save index after branch load');
    assertActiveSaveIndex(saveIndexAfterLoad, branchEntry.id, 'Loaded Save As branch');

    const branchRecordAfterLoad = await readBrowserStorageJson(page, payloadPath, 'Save As branch payload after load');
    assert.deepEqual(
      campaignIdentitySummary(branchRecordAfterLoad),
      beforeSummary,
      'Loading the Save As branch changed its campaign identity payload.'
    );

    return {
      skipped: false,
      saveIndexPath: SAVE_INDEX_USER_FILES_PATH,
      saveId: branchEntry.id,
      saveNamePrefix: 'Directive Live Smoke',
      payloadPath,
      loadedFrom: 'Starships saves row',
      activeAfterLoad: true,
      campaign: beforeSummary
    };
  } catch (error) {
    if (error instanceof OptionalCheckSkipError) {
      return error.result;
    }
    throw error;
  }
}

async function runMissionBrowserFlow(page) {
  await navigateDirectiveRoute(page, 'Mission');
  const initial = await panelSnapshot(page);
  if (!initial.hasActiveCampaign) {
    return {
      skipped: true,
      reason: initial.noActiveCampaign
        ? 'Mission route reports no active campaign; load or start a campaign to exercise preview/commit/save/save-as.'
        : 'Mission route does not expose the active-campaign controls required for preview/save smoke.',
      controls: {
        buttons: initial.bodyButtons,
        hasTurnInput: initial.hasTurnInput,
        hasSaveAsInput: initial.hasSaveAsInput
      }
    };
  }

  for (const label of ['Preview Outcome', 'Save Game', 'Save As']) {
    assertBrowser(initial.bodyButtons.includes(label), `Active Mission panel is missing "${label}".`, initial);
  }
  assertBrowser(initial.hasTurnInput, 'Active Mission panel is missing the player action input.', initial);
  assertBrowser(initial.hasSaveAsInput, 'Active Mission panel is missing the Save As Name input.', initial);

  await page.locator('#directive-runtime-panel [data-input-path="turn.playerInput"]').first().fill(SAFE_PLAYER_ACTION);
  await clickBodyButton(page, 'Preview Outcome');
  await page.waitForFunction(() => {
    const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"]');
    return /Provisional Outcome|Replacement Outcome|Procedure Check/i.test(String(body?.textContent || ''));
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });
  const preview = await panelSnapshot(page);
  assertBrowser(preview.hasPendingPreview, 'Mission preview did not render a provisional outcome.', preview);

  let commit;
  if (RUN_LIVE_GENERATION) {
    assertBrowser(
      initial.providerContext.generationSurface,
      'DIRECTIVE_SILLYTAVERN_GENERATION=1 was set, but the live SillyTavern context did not expose a generation method supported by Directive.',
      initial.providerContext
    );
    const clicked = await clickCommitButton(page);
    await page.waitForFunction(() => {
      const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"]');
      const text = String(body?.textContent || '');
      return /Last Outcome|Narration Recovery/i.test(text) && !/Provisional Outcome|Replacement Outcome|Procedure Check/i.test(text);
    }, null, {
      timeout: GENERATION_TIMEOUT_MS
    });
    const committed = await panelSnapshot(page);
    commit = {
      skipped: false,
      clicked,
      providerGeneration: {
        attempted: true,
        proven: committed.hasLastOutcome && !committed.hasNarrationRecovery,
        providerSurface: initial.providerContext,
        narrationRecovery: committed.hasNarrationRecovery
      },
      lastOutcome: committed.hasLastOutcome,
      narrationRecovery: committed.hasNarrationRecovery
    };
    if (STRICT && !commit.providerGeneration.proven) {
      throw new Error('Live provider generation was attempted, but Directive rendered Narration Recovery instead of a successful narrated outcome.');
    }
  } else {
    await clickBodyButton(page, 'Discard Preview');
    await page.waitForFunction(() => {
      const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"]');
      return !/Provisional Outcome|Replacement Outcome|Procedure Check/i.test(String(body?.textContent || ''));
    }, null, {
      timeout: BROWSER_TIMEOUT_MS
    });
    commit = {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_GENERATION=1 or DIRECTIVE_LIVE_GENERATION=1 not set; preview was discarded to avoid provider spend.',
      providerGeneration: {
        attempted: false,
        proven: false,
        providerSurface: initial.providerContext
      }
    };
  }

  let saveFlow;
  if (RUN_BROWSER_SAVE_FLOW) {
    await clickBodyButton(page, 'Save Game');
    await waitForBodyButtonEnabled(page, 'Save Game');

    const saveAsName = `Directive Live Smoke ${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await page.locator('#directive-runtime-panel [data-input-path="saveAs.name"]').first().fill(saveAsName);
    await clickBodyButton(page, 'Save As');
    await waitForBodyButtonEnabled(page, 'Save As');
    await page.waitForFunction((expectedName) => {
      const input = document.querySelector('#directive-runtime-panel [data-input-path="saveAs.name"]');
      return String(input?.value || '').includes(expectedName);
    }, saveAsName, {
      timeout: BROWSER_TIMEOUT_MS
    });
    const saved = await panelSnapshot(page);
    const branchLoad = await verifySaveAsBranchReselect(page, saveAsName);
    saveFlow = {
      skipped: false,
      saveGame: true,
      saveAs: true,
      saveAsNamePrefix: 'Directive Live Smoke',
      routeStillMission: saved.selectedRouteId === ROUTE_IDS.Mission,
      branchLoad
    };
  } else {
    saveFlow = {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1 not set; save buttons were verified but not clicked.'
    };
  }

  return {
    skipped: false,
    preview: {
      rendered: true,
      discarded: !RUN_LIVE_GENERATION
    },
    commit,
    saveFlow
  };
}

function screenshotViewports() {
  return [
    {
      id: 'desktop',
      width: 1280,
      height: 900
    },
    {
      id: 'phone',
      width: 390,
      height: 844
    }
  ];
}

function slugPart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'route';
}

function screenshotRunDirectory() {
  return path.resolve(SCREENSHOT_BASE_DIR, SCREENSHOT_RUN_ID);
}

async function setBrowserViewport(page, viewport) {
  if (typeof page.setViewportSize === 'function') {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height
    });
  }
  await sleep(250);
}

async function capturePageScreenshot(page, filePath) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  }));
  await sleep(150);
  const bytes = await page.screenshot({
    path: filePath,
    fullPage: false
  });
  if (Buffer.isBuffer(bytes)) {
    return bytes.length;
  }
  return fs.statSync(filePath).size;
}

async function directiveLayoutSnapshot(page) {
  return page.evaluate(() => {
    const normalizeRect = (rect) => ({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left)
    });
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const spine = panel?.querySelector('.directive-command-spine') || null;
    const drawer = panel?.querySelector('.directive-command-drawer') || null;
    const header = drawer?.querySelector('.directive-command-drawer-header') || null;
    const body = drawer?.querySelector('[data-directive-runtime-body="true"]') || null;
    const mobileBottomBar = drawer?.querySelector('.directive-mobile-bottom-bar') || null;
    const resizeHandle = drawer?.querySelector('[data-directive-drawer-resize-handle="true"]') || null;
    const isVisible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const desktopRouteButtons = Array.from(panel?.querySelectorAll('.directive-spine-route') || []).filter(isVisible);
    const mobileRouteButtons = Array.from(panel?.querySelectorAll('.directive-mobile-bottom-tab') || []).filter(isVisible);
    const routeButtons = mobileRouteButtons.length > 0 ? mobileRouteButtons : desktopRouteButtons;
    const selected = routeButtons.find((button) => button.getAttribute('aria-selected') === 'true')
      || routeButtons.find((button) => button.getAttribute('aria-current') === 'page');
    const routeRects = routeButtons.map((button) => ({
      routeId: button.dataset.routeId || button.dataset.mobileRouteId || button.dataset.tab || '',
      text: normalize(
        button.querySelector('.directive-spine-route-label, .directive-mobile-bottom-label')?.textContent
        || button.getAttribute('aria-label')
        || button.textContent
      ),
      rect: normalizeRect(button.getBoundingClientRect()),
      disabled: button.disabled === true,
      ariaSelected: button.getAttribute('aria-selected') === 'true'
    }));
    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      panel: Boolean(panel),
      commandSpine: panel?.dataset.directiveShell === 'command-spine' || panel?.classList.contains('directive-command-spine-shell'),
      hidden: panel?.hidden === true,
      drawerOpen: panel?.dataset.drawerOpen === 'true' && isVisible(drawer),
      fullscreen: panel?.dataset.fullscreen === 'true',
      spineMode: panel?.dataset.spineMode || '',
      drawerDensity: panel?.dataset.drawerDensity || '',
      panelRect: panel ? normalizeRect(panel.getBoundingClientRect()) : null,
      spineRect: spine ? normalizeRect(spine.getBoundingClientRect()) : null,
      drawerRect: drawer ? normalizeRect(drawer.getBoundingClientRect()) : null,
      headerRect: header ? normalizeRect(header.getBoundingClientRect()) : null,
      bodyRect: body ? normalizeRect(body.getBoundingClientRect()) : null,
      mobileBottomBarRect: mobileBottomBar ? normalizeRect(mobileBottomBar.getBoundingClientRect()) : null,
      mobileBottomBarVisible: isVisible(mobileBottomBar),
      resizeHandleRect: resizeHandle ? normalizeRect(resizeHandle.getBoundingClientRect()) : null,
      resizeHandleVisible: isVisible(resizeHandle),
      drawerActionsVisible: isVisible(panel?.querySelector('[data-directive-shell-actions="drawer-header"]')),
      routeRects,
      selectedRouteId: selected?.dataset.routeId || selected?.dataset.mobileRouteId || selected?.dataset.tab || null,
      bodyTextLength: normalize(body?.textContent || '').length
    };
  });
}

function assertDirectiveLayout(layout, {
  routeId,
  viewportId
}) {
  assertBrowser(layout.panel, `${viewportId} screenshot layout missing Directive panel.`, layout);
  assertBrowser(layout.commandSpine, `${viewportId} screenshot layout is not using the command-spine shell.`, layout);
  assertBrowser(layout.hidden !== true, `${viewportId} screenshot layout panel is hidden.`, layout);
  assertBrowser(layout.drawerOpen, `${viewportId} screenshot layout drawer is not open.`, layout);
  assertBrowser(layout.bodyTextLength > 10, `${viewportId} screenshot layout body appears blank.`, layout);
  assertBrowser(layout.selectedRouteId === routeId, `${viewportId} screenshot layout selected the wrong route.`, layout);
  assertBrowser(layout.routeRects.length === REQUIRED_ROUTES.length, `${viewportId} screenshot layout route count mismatch.`, layout);

  const viewport = layout.viewport || {};
  const spine = layout.spineRect || {};
  const drawer = layout.drawerRect || {};
  const header = layout.headerRect || {};
  const body = layout.bodyRect || {};
  const mobileBottomBar = layout.mobileBottomBarRect || {};
  const resizeHandle = layout.resizeHandleRect || {};

  assertBrowser(drawer.width > 280, `${viewportId} screenshot layout drawer is too narrow.`, layout);
  assertBrowser(drawer.height > 360, `${viewportId} screenshot layout drawer is too short.`, layout);
  assertBrowser(drawer.left >= -1 && drawer.top >= -1, `${viewportId} screenshot layout drawer starts outside the viewport.`, layout);
  assertBrowser(drawer.right <= viewport.width + 1, `${viewportId} screenshot layout drawer overflows the viewport horizontally.`, layout);
  assertBrowser(drawer.bottom <= viewport.height + 1, `${viewportId} screenshot layout drawer overflows the viewport vertically.`, layout);
  assertBrowser(body.height > 120, `${viewportId} screenshot layout body is collapsed.`, layout);
  assertBrowser(header.height > 36, `${viewportId} screenshot layout drawer header is collapsed.`, layout);
  assertBrowser(body.top >= header.bottom - 2, `${viewportId} screenshot layout body overlaps the drawer header.`, layout);

  if (layout.mobileBottomBarVisible) {
    assertBrowser(drawer.width >= viewport.width - 2, `${viewportId} phone drawer does not fill the viewport width.`, layout);
    assertBrowser(drawer.height >= viewport.height - 2, `${viewportId} phone drawer does not fill the viewport height.`, layout);
    assertBrowser(mobileBottomBar.height > 40, `${viewportId} screenshot layout bottom navigation is collapsed.`, layout);
    assertBrowser(body.bottom <= mobileBottomBar.top + 2, `${viewportId} screenshot layout body overlaps the bottom navigation.`, layout);
    assertBrowser(!layout.resizeHandleVisible, `${viewportId} phone layout should hide the drawer resize handle.`, layout);
  } else {
    assertBrowser(spine.width >= 60 && spine.width <= 220, `${viewportId} screenshot layout command spine width is invalid.`, layout);
    assertBrowser(spine.height > 360, `${viewportId} screenshot layout command spine is too short.`, layout);
    assertBrowser(spine.left >= -1 && spine.left <= 40, `${viewportId} screenshot layout command spine is not left anchored.`, layout);
    assertBrowser(spine.right <= drawer.left + 2, `${viewportId} screenshot layout drawer overlaps the command spine.`, layout);
    assertBrowser(layout.drawerActionsVisible, `${viewportId} screenshot layout drawer actions are not visible.`, layout);
    assertBrowser(layout.resizeHandleVisible, `${viewportId} screenshot layout resize handle is not visible.`, layout);
    assertBrowser(Math.abs(resizeHandle.left - drawer.left) <= 4, `${viewportId} resize handle is not on the drawer's left edge.`, layout);
    assertBrowser(Math.abs(resizeHandle.bottom - drawer.bottom) <= 4, `${viewportId} resize handle is not on the drawer's bottom edge.`, layout);
  }

  for (const route of layout.routeRects) {
    assertBrowser(route.rect.width >= 32, `${viewportId} screenshot layout route "${route.text}" is too narrow.`, layout);
    assertBrowser(route.rect.height >= 24, `${viewportId} screenshot layout route "${route.text}" is too short.`, layout);
    if (layout.mobileBottomBarVisible) {
      assertBrowser(route.rect.top >= mobileBottomBar.top - 1 && route.rect.bottom <= mobileBottomBar.bottom + 1, `${viewportId} screenshot layout route "${route.text}" escapes the bottom navigation.`, layout);
    } else {
      assertBrowser(route.rect.left >= spine.left - 1 && route.rect.right <= spine.right + 3, `${viewportId} screenshot layout route "${route.text}" escapes the command spine.`, layout);
      assertBrowser(route.rect.top >= spine.top - 1 && route.rect.bottom <= spine.bottom + 1, `${viewportId} screenshot layout route "${route.text}" escapes the command spine vertically.`, layout);
    }
  }
}

async function runScreenshotSmoke(page) {
  if (!RUN_SCREENSHOTS) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1 not set'
    };
  }

  const outputDir = screenshotRunDirectory();
  fs.mkdirSync(outputDir, {
    recursive: true
  });
  const captures = [];
  for (const viewport of screenshotViewports()) {
    await setBrowserViewport(page, viewport);
    await openDirectivePanel(page);
    for (const label of REQUIRED_ROUTES) {
      const navigation = await navigateDirectiveRoute(page, label);
      const layout = await directiveLayoutSnapshot(page);
      assertDirectiveLayout(layout, {
        routeId: navigation.routeId,
        viewportId: viewport.id
      });
      const fileName = `${viewport.id}-${slugPart(label)}.png`;
      const filePath = path.join(outputDir, fileName);
      const bytes = await capturePageScreenshot(page, filePath);
      assertBrowser(bytes > 2500, `${viewport.id} screenshot for "${label}" was too small to prove a rendered UI.`, {
        filePath,
        bytes
      });
      captures.push({
        viewport: viewport.id,
        route: label,
        routeId: navigation.routeId,
        width: viewport.width,
        height: viewport.height,
        filePath,
        bytes,
        layout: {
          panel: layout.panelRect,
          spine: layout.spineRect,
          drawer: layout.drawerRect,
          body: layout.bodyRect,
          routeCount: layout.routeRects.length,
          selectedRouteId: layout.selectedRouteId
        }
      });
    }
  }
  return {
    skipped: false,
    outputDir,
    captures
  };
}

async function mobileShellInteractionSnapshot(page) {
  return page.evaluate(() => {
    const normalizeRect = (rect) => ({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left)
    });
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const bottomBar = panel?.querySelector('.directive-mobile-bottom-bar') || null;
    const activeRoute = panel?.querySelector('.directive-mobile-bottom-tab-active') || null;
    const body = panel?.querySelector('[data-directive-runtime-body="true"]') || null;
    const hidden = !panel
      || panel.hidden === true
      || panel.getAttribute('aria-hidden') === 'true'
      || getComputedStyle(panel).display === 'none';
    return {
      panel: Boolean(panel),
      hidden,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      bodyText: normalize(body?.textContent || '').slice(0, 180),
      bottomBarVisible: Boolean(bottomBar && bottomBar.getBoundingClientRect().height > 0 && getComputedStyle(bottomBar).display !== 'none'),
      bottomBarRect: bottomBar ? normalizeRect(bottomBar.getBoundingClientRect()) : null,
      activeRouteId: activeRoute?.dataset.mobileRouteId || null,
      activeRouteLabel: normalize(activeRoute?.textContent || ''),
      activeRouteAriaCurrent: activeRoute?.getAttribute('aria-current') || '',
      activeRouteAriaSelected: activeRoute?.getAttribute('aria-selected') || '',
      tabHistoryBackVisible: Boolean(panel?.querySelector('[data-mobile-shell-action="back"], [data-shell-action="back"]'))
    };
  });
}

async function runMobileShellInteractionSmoke(page) {
  const phone = screenshotViewports().find((viewport) => viewport.id === 'phone') || screenshotViewports()[1];
  await setBrowserViewport(page, phone);
  await openDirectivePanel(page);

  await navigateDirectiveRoute(page, 'Starships');
  await navigateDirectiveRoute(page, 'Mission');
  const mission = await mobileShellInteractionSnapshot(page);
  assertBrowser(mission.viewport.width <= 560, 'Mobile shell interaction smoke did not enter a phone-width viewport.', mission);
  assertBrowser(mission.bottomBarVisible, 'Phone-width shell did not expose bottom route navigation.', mission);
  assertBrowser(mission.activeRouteId === ROUTE_IDS.Mission, 'Phone-width bottom navigation did not mark Mission active.', mission);
  assertBrowser(/\bMission\b/.test(mission.activeRouteLabel), 'Phone-width active route did not keep its route label.', mission);
  assertBrowser(!mission.tabHistoryBackVisible, 'Phone-width shell should not expose tab-history Back navigation.', mission);

  await navigateDirectiveRoute(page, 'Starships');
  await page.waitForFunction((routeId) => {
    const active = document.querySelector('#directive-runtime-panel .directive-mobile-bottom-tab-active');
    const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"]');
    return active?.dataset.mobileRouteId === routeId
      && active.getAttribute('aria-selected') === 'true'
      && String(body?.textContent || '').includes('Starships');
  }, ROUTE_IDS.Starships, {
    timeout: BROWSER_TIMEOUT_MS
  });
  const afterDirectStarships = await mobileShellInteractionSnapshot(page);
  assertBrowser(afterDirectStarships.activeRouteId === ROUTE_IDS.Starships, 'Phone-width bottom navigation did not switch directly to Starships.', afterDirectStarships);

  await navigateDirectiveRoute(page, 'Mission');
  const afterMissionReturn = await mobileShellInteractionSnapshot(page);
  assertBrowser(afterMissionReturn.activeRouteId === ROUTE_IDS.Mission, 'Phone-width bottom navigation did not return to Mission.', afterMissionReturn);

  return {
    skipped: false,
    viewport: {
      width: phone.width,
      height: phone.height
    },
    bottomNavigation: true,
    activeRouteKeepsLabel: true,
    tabHistoryBackVisible: false,
    directNavigation: {
      from: ROUTE_IDS.Mission,
      to: afterDirectStarships.activeRouteId
    },
    returnedRoute: afterMissionReturn.activeRouteId
  };
}

async function runTeardownCleanupSmoke(page) {
  if (!RUN_TEARDOWN) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_TEARDOWN=1 not set'
    };
  }

  const invoked = await page.evaluate(async (extensionPath) => {
    const cleanupState = () => {
      const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
      const style = panel ? getComputedStyle(panel) : null;
      return {
        bridge: Boolean(globalThis.Directive?.bridge),
        actions: Boolean(globalThis.Directive?.actions),
        panelPresent: Boolean(panel),
        panelHidden: !panel
          || panel.hidden === true
          || panel.getAttribute('aria-hidden') === 'true'
          || style?.display === 'none'
      };
    };

    const result = {
      before: cleanupState(),
      invokedWith: '',
      eventName: '',
      eventMethod: '',
      moduleError: '',
      eventError: ''
    };

    try {
      const lifecycle = await import(`${extensionPath}/src/hosts/sillytavern/lifecycle.js`);
      if (typeof lifecycle.directiveOnDisable === 'function') {
        await lifecycle.directiveOnDisable();
        result.invokedWith = 'served lifecycle directiveOnDisable';
      }
    } catch (error) {
      result.moduleError = error?.message || String(error);
    }

    if (!result.invokedWith) {
      try {
        const ctx = globalThis.SillyTavern?.getContext?.() || null;
        const source = ctx?.eventSource || ctx?.eventBus || globalThis.eventBus || null;
        const eventTypes = ctx?.event_types || {};
        const eventNames = [
          eventTypes.EXTENSION_DISABLED,
          eventTypes.EXTENSION_DISABLE,
          'EXTENSION_DISABLED',
          'EXTENSION_DISABLE'
        ].filter(Boolean);
        const uniqueEventNames = Array.from(new Set(eventNames));
        const eventMethod = ['emit', 'trigger'].find((method) => typeof source?.[method] === 'function');
        if (eventMethod && uniqueEventNames.length > 0) {
          source[eventMethod](uniqueEventNames[0]);
          result.invokedWith = `host event ${eventMethod}`;
          result.eventMethod = eventMethod;
          result.eventName = uniqueEventNames[0];
        }
      } catch (error) {
        result.eventError = error?.message || String(error);
      }
    }

    return result;
  }, EXTENSION_PATH);

  if (!invoked.invokedWith) {
    return maybeReturnOptionalSkip({
      skipped: true,
      reason: 'No repeatable disable lifecycle or host-event automation surface was available in the live browser.',
      moduleError: invoked.moduleError,
      eventError: invoked.eventError
    });
  }

  await page.waitForFunction(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const style = panel ? getComputedStyle(panel) : null;
    const panelHidden = !panel
      || panel.hidden === true
      || panel.getAttribute('aria-hidden') === 'true'
      || style?.display === 'none';
    const bridgeRemoved = !globalThis.Directive?.bridge && !globalThis.Directive?.actions;
    return panelHidden && bridgeRemoved;
  }, null, {
    timeout: BROWSER_TIMEOUT_MS
  });

  const after = await page.evaluate(() => {
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="command-spine"]');
    const style = panel ? getComputedStyle(panel) : null;
    return {
      bridgeRemoved: !globalThis.Directive?.bridge && !globalThis.Directive?.actions,
      panelPresent: Boolean(panel),
      panelHidden: !panel
        || panel.hidden === true
        || panel.getAttribute('aria-hidden') === 'true'
        || style?.display === 'none'
    };
  });

  assertBrowser(after.bridgeRemoved, 'Directive global bridge remained after disable cleanup.', after);
  assertBrowser(after.panelHidden, 'Directive runtime panel remained visible after disable cleanup.', after);

  return {
    skipped: false,
    invokedWith: invoked.invokedWith,
    eventName: invoked.eventName || null,
    eventMethod: invoked.eventMethod || null,
    bridgeRemoved: after.bridgeRemoved,
    panelHidden: after.panelHidden
  };
}

async function runBrowserSmoke() {
  if (!RUN_BROWSER) {
    return {
      skipped: true,
      reason: 'DIRECTIVE_SILLYTAVERN_BROWSER=1 not set'
    };
  }

  let chromium;
  let browserDriver = 'playwright';
  let playwrightError = null;
  try {
    ({ chromium } = await import('playwright'));
  } catch (error) {
    playwrightError = error;
  }

  let browser;
  if (chromium) {
    try {
      browser = await chromium.launch({ headless: HEADLESS });
    } catch (error) {
      if (!isPlaywrightDependencyError(error)) {
        throw error;
      }
      playwrightError = error;
    }
  }

  if (!browser) {
    try {
      browser = await launchCdpBrowser();
      browserDriver = 'chromium-cdp';
    } catch (error) {
      return browserSkip(`Browser automation is not available. Playwright: ${playwrightError?.message || 'not attempted'}; CDP fallback: ${error?.message || error}`);
    }
  }

  try {
    const page = await browser.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await installBrowserErrorCapture(page);

    const extensionControls = await browserStep('extension settings dropdown', () => verifyExtensionControls(page));
    const openedWith = await browserStep('open Directive panel', () => openDirectivePanel(page));
    const shell = await browserStep('shell contract', async () => {
      const snapshot = await panelSnapshot(page);
      assertBrowser(snapshot.panel, 'Directive runtime panel was not present.', snapshot);
      assertBrowser(snapshot.hidden !== true, 'Directive runtime panel was hidden after opening.', snapshot);
      assertBrowser(snapshot.commandSpine, 'Directive runtime panel was not using the command-spine shell.', snapshot);
      assertBrowser(snapshot.drawer, 'Directive runtime panel did not create the single command drawer.', snapshot);
      assertBrowser(snapshot.drawerHeader, 'Directive runtime panel did not expose the drawer-header action cluster.', snapshot);
      assertBrowser(snapshot.resizeHandle, 'Directive runtime panel did not expose the bottom-left resize handle.', snapshot);
      assertBrowser(snapshot.fullscreenControl && snapshot.collapseControl, 'Directive drawer header did not expose expand and collapse controls.', snapshot);
      assertBrowser(snapshot.missingRoutes.length === 0, 'Directive command-spine routes were missing.', snapshot);
      return snapshot;
    });
    const routeCoverage = await browserStep('route coverage', () => verifyBrowserRoutes(page));
    const screenshots = await browserStep('route screenshots', () => runScreenshotSmoke(page));
    const mobileShellInteractions = await browserStep('mobile shell interactions', () => runMobileShellInteractionSmoke(page));
    await setBrowserViewport(page, screenshotViewports()[0]);
    await openDirectivePanel(page);
    const missionFlow = await browserStep('active campaign Mission flow', () => runMissionBrowserFlow(page));
    const teardownCleanup = await browserStep('teardown cleanup', () => runTeardownCleanupSmoke(page));

    return {
      skipped: false,
      openedWith,
      bridge: shell.bridge,
      actions: shell.actions,
      extensionControls,
      commandSpine: shell.commandSpine,
      drawer: shell.drawer,
      drawerHeader: shell.drawerHeader,
      resizeHandle: shell.resizeHandle,
      browserDriver,
      routes: shell.routeLabels,
      routeCoverage,
      providerContext: shell.providerContext,
      generationEnabled: RUN_LIVE_GENERATION,
      saveFlowEnabled: RUN_BROWSER_SAVE_FLOW,
      screenshotsEnabled: RUN_SCREENSHOTS,
      screenshots,
      mobileShellInteractions,
      teardownEnabled: RUN_TEARDOWN,
      missionFlow,
      teardownCleanup
    };
  } finally {
    await browser.close();
  }
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }

  if (DRY_RUN || !BASE_URL) {
    console.log(JSON.stringify({
      ok: true,
      skipped: !BASE_URL,
      reason: BASE_URL ? 'dry-run requested' : 'SILLYTAVERN_BASE_URL is not set',
      checklist: checklist()
    }, null, 2));
    return;
  }

  const staticExtension = await verifyStaticExtension();
  const storage = await runStorageSmoke();
  const browser = await runBrowserSmoke();

  console.log(JSON.stringify({
    ok: true,
    baseUrl: BASE_URL,
    extensionPath: EXTENSION_PATH,
    staticExtension,
    storage,
    browser,
    liveGeneration: RUN_LIVE_GENERATION
  }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    baseUrl: BASE_URL || null,
    extensionPath: EXTENSION_PATH,
    error: errorSummary(error)
  }, null, 2));
  process.exit(1);
}
