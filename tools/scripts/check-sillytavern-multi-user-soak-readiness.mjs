import { pathToFileURL } from 'node:url';

import {
  DEFAULT_SOAK_ARTIFACT_ROOT,
  appendJsonLine,
  compact,
  createArtifactPaths,
  createRunId,
  ensureArtifactTree,
  errorSummary,
  loadPlaywright,
  normalizeBaseUrl,
  sha256Text,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';

const args = new Set(process.argv.slice(2));
const HELP = args.has('--help') || args.has('-h');
const LIVE = args.has('--live') || process.env.DIRECTIVE_PARALLEL_SOAK_USERS_LIVE === '1';
const WRITE_ARTIFACTS = args.has('--write-artifacts')
  || process.env.DIRECTIVE_PARALLEL_SOAK_USERS_WRITE === '1'
  || (LIVE && process.env.DIRECTIVE_SOAK_WRITE_ARTIFACTS === '1');
const RUN_ID = process.env.DIRECTIVE_SOAK_RUN_ID || createRunId();
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const ARTIFACT_ROOT = process.env.DIRECTIVE_SOAK_ARTIFACT_DIR || DEFAULT_SOAK_ARTIFACT_ROOT;
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const TIMEOUT_MS = positiveTimeout(process.env.DIRECTIVE_PLAYWRIGHT_TIMEOUT_MS, 45000);
const USERS = parseUsers(process.env.DIRECTIVE_SOAK_ST_USERS || process.env.DIRECTIVE_PARALLEL_SOAK_USERS || '');

function usage() {
  return `Directive SillyTavern multi-user soak readiness

Dry run:
  node tools\\scripts\\check-sillytavern-multi-user-soak-readiness.mjs

Live isolation proof:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  $env:DIRECTIVE_SOAK_ST_USERS='directive-soak-a,directive-soak-b'
  node tools\\scripts\\check-sillytavern-multi-user-soak-readiness.mjs --live --write-artifacts

Credential options:
  DIRECTIVE_SOAK_ST_USERS='[{"handle":"directive-soak-a","password":"secret"},{"handle":"directive-soak-b","password":"secret"}]'
  DIRECTIVE_SOAK_ST_USERS='directive-soak-a,directive-soak-b' with DIRECTIVE_SOAK_ST_PASSWORD shared by both users
  DIRECTIVE_SOAK_ST_PASSWORD_DIRECTIVE_SOAK_A and DIRECTIVE_SOAK_ST_PASSWORD_DIRECTIVE_SOAK_B for per-user passwords

The live probe opens one Playwright browser context per ST user, logs in when a
login screen is present, writes a unique Directive /user/files probe for each
user, verifies each user can see only its own probe, deletes the probes, and
writes report artifacts. It does not create campaigns or make model calls.
`;
}

function positiveTimeout(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeId(value, fallback = 'user') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 72) || fallback;
}

function envPasswordKey(handle) {
  const suffix = String(handle || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return suffix ? `DIRECTIVE_SOAK_ST_PASSWORD_${suffix}` : null;
}

function parseUsers(raw) {
  const value = String(raw || '').trim();
  if (!value) {
    return [
      userRecord('directive-soak-a', null, true),
      userRecord('directive-soak-b', null, true)
    ];
  }

  if (value.startsWith('[')) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('DIRECTIVE_SOAK_ST_USERS JSON must be an array.');
    return parsed.map((entry, index) => {
      if (typeof entry === 'string') return userRecord(entry, null, false, index);
      return userRecord(entry?.handle || entry?.username || entry?.user, entry?.password || null, false, index);
    });
  }

  return value.split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const colon = entry.indexOf(':');
      if (colon > 0) {
        return userRecord(entry.slice(0, colon), entry.slice(colon + 1), false, index);
      }
      return userRecord(entry, null, false, index);
    });
}

function userRecord(handle, password = null, placeholder = false, index = 0) {
  const normalizedHandle = normalizeId(handle, `directive-soak-${index + 1}`);
  const key = envPasswordKey(normalizedHandle);
  return {
    handle: normalizedHandle,
    displayHandle: String(handle || normalizedHandle).trim() || normalizedHandle,
    password: password || process.env[key] || process.env.DIRECTIVE_SOAK_ST_PASSWORD || null,
    passwordEnv: password ? null : key,
    placeholder
  };
}

function redactUser(user) {
  return {
    handle: user.handle,
    displayHandle: user.displayHandle,
    passwordConfigured: Boolean(user.password),
    passwordEnv: user.passwordEnv,
    placeholder: user.placeholder === true
  };
}

function check(id, status, summary, details = null) {
  return { id, status, summary, details };
}

function statusFromChecks(checks) {
  if (checks.some((entry) => entry.status === 'fail')) return 'fail';
  if (checks.some((entry) => entry.status === 'warning')) return 'warning';
  if (checks.some((entry) => entry.status === 'pass')) return 'pass';
  return 'not-run';
}

function probeFileName({ runId, handle }) {
  const run = normalizeId(runId.toLowerCase(), 'run').slice(0, 48);
  const user = normalizeId(handle, 'user');
  return `directive-soak-user-isolation-${user}-${run}.v1.json`;
}

function probePayload({ runId, user, fileName }) {
  const payload = {
    kind: 'directive.parallelSoakUserProbe',
    schemaVersion: 1,
    runId,
    userHandle: user.handle,
    fileName,
    createdAt: new Date().toISOString(),
    nonce: sha256Text(`${runId}:${user.handle}:${fileName}`).slice(0, 32)
  };
  return {
    value: payload,
    text: JSON.stringify(payload)
  };
}

function summaryMarkdown(report) {
  const lines = [
    '# Directive SillyTavern Multi-User Soak Readiness',
    '',
    `Run: ${report.runId}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    `Base URL: ${report.baseUrl || 'not configured'}`,
    '',
    '## Users',
    ''
  ];
  for (const user of report.users) {
    lines.push(`- ${user.handle}: passwordConfigured=${user.passwordConfigured}, placeholder=${user.placeholder}`);
  }
  lines.push('', '## Checks', '');
  for (const entry of report.checks) {
    lines.push(`- ${entry.status}: ${entry.id} - ${entry.summary}`);
  }
  if (report.liveResults?.length) {
    lines.push('', '## Live Results', '');
    for (const result of report.liveResults) {
      lines.push(`- ${result.handle}: ${result.status} - ownVisible=${result.ownVisible}, othersVisible=${result.otherVisibleCount}`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function buildDryRunReport({ artifacts }) {
  const playwright = await loadPlaywright();
  const checks = [
    check(
      'user-count',
      USERS.length >= 2 ? 'pass' : 'fail',
      USERS.length >= 2
        ? 'At least two SillyTavern users are configured for parallel readiness.'
        : 'Configure at least two SillyTavern users with DIRECTIVE_SOAK_ST_USERS.',
      { count: USERS.length, users: USERS.map(redactUser) }
    ),
    check(
      'placeholder-users',
      USERS.some((entry) => entry.placeholder) ? 'warning' : 'pass',
      USERS.some((entry) => entry.placeholder)
        ? 'Using placeholder soak user handles; set DIRECTIVE_SOAK_ST_USERS before live execution.'
        : 'Explicit soak user handles are configured.'
    ),
    check(
      'base-url',
      BASE_URL ? 'pass' : LIVE ? 'fail' : 'skipped',
      BASE_URL
        ? 'SillyTavern base URL is configured.'
        : LIVE
          ? 'SILLYTAVERN_BASE_URL is required for live multi-user readiness.'
          : 'No SillyTavern base URL configured; live checks are skipped.'
    ),
    check(
      'playwright-import',
      playwright.ok ? 'pass' : LIVE ? 'fail' : 'warning',
      playwright.ok
        ? 'Playwright imports successfully.'
        : LIVE
          ? 'Playwright is required for live multi-user readiness.'
          : 'Playwright is not importable; live readiness will require it.',
      playwright.ok ? null : playwright.error
    )
  ];

  return {
    schemaVersion: 1,
    kind: 'directive.parallelSoakUsers.report',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    mode: LIVE ? 'live' : 'dry-run',
    status: statusFromChecks(checks),
    baseUrl: BASE_URL || null,
    users: USERS.map(redactUser),
    artifacts,
    checks,
    liveResults: []
  };
}

async function detectReady(page) {
  return page.evaluate(() => {
    const context = globalThis.SillyTavern?.getContext?.() || null;
    const bodyText = document.body?.innerText || '';
    return {
      href: location.href,
      title: document.title || '',
      contextReady: typeof context?.getRequestHeaders === 'function',
      hasPasswordInput: Boolean(document.querySelector('input[type="password"]')),
      textInputCount: document.querySelectorAll('input[type="text"], input:not([type]), input[type="search"]').length,
      buttonText: Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
        .map((entry) => entry.innerText || entry.value || entry.getAttribute('aria-label') || '')
        .filter(Boolean)
        .slice(0, 20),
      bodyPreview: bodyText.replace(/\s+/g, ' ').trim().slice(0, 500)
    };
  });
}

async function firstVisibleLocator(locators) {
  for (const locator of locators) {
    try {
      if (await locator.count() > 0 && await locator.first().isVisible({ timeout: 1000 })) {
        return locator.first();
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function literalRegex(value) {
  return new RegExp(`^${String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

async function loginSillyTavernUser(page, user) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS }).catch(() => {});

  let ready = await detectReady(page);
  if (ready.contextReady) {
    return { ok: true, loginAttempted: false, ready };
  }

  const accountTarget = await firstVisibleLocator([
    page.getByRole('button', { name: literalRegex(user.displayHandle) }),
    page.getByRole('button', { name: literalRegex(user.handle) }),
    page.getByText(literalRegex(user.displayHandle)),
    page.getByText(literalRegex(user.handle))
  ]);
  if (accountTarget) {
    await accountTarget.click({ timeout: TIMEOUT_MS });
  }

  const userInput = await firstVisibleLocator([
    page.locator('input[name="username"]'),
    page.locator('input[name="user"]'),
    page.locator('input[name="handle"]'),
    page.locator('input[autocomplete="username"]'),
    page.locator('input[type="text"]'),
    page.locator('input:not([type])')
  ]);
  if (userInput) {
    await userInput.fill(user.displayHandle, { timeout: TIMEOUT_MS });
  }

  const passwordInput = await firstVisibleLocator([page.locator('input[type="password"]')]);
  if (passwordInput && user.password) {
    await passwordInput.fill(user.password, { timeout: TIMEOUT_MS });
  }

  const submit = await firstVisibleLocator([
    page.getByRole('button', { name: /log in|login|sign in|continue|enter|unlock/i }),
    page.locator('button[type="submit"]'),
    page.locator('input[type="submit"]')
  ]);
  if (submit) {
    await submit.click({ timeout: TIMEOUT_MS });
  } else if (passwordInput || userInput) {
    await page.keyboard.press('Enter');
  }

  await page.waitForFunction(() => {
    const context = globalThis.SillyTavern?.getContext?.() || null;
    return typeof context?.getRequestHeaders === 'function';
  }, null, { timeout: TIMEOUT_MS }).catch(() => {});

  ready = await detectReady(page);
  return {
    ok: ready.contextReady,
    loginAttempted: true,
    ready,
    accountTargetClicked: Boolean(accountTarget),
    userInputFilled: Boolean(userInput),
    passwordInputFilled: Boolean(passwordInput && user.password),
    submitClicked: Boolean(submit)
  };
}

async function pageFileOperation(page, operation, payload) {
  return page.evaluate(async ({ operation: op, payload: data }) => {
    const headersFromContext = () => globalThis.SillyTavern?.getContext?.()?.getRequestHeaders?.() || {};
    const jsonHeaders = () => ({ ...headersFromContext(), 'Content-Type': 'application/json' });
    const parse = async (response) => {
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
        text,
        json
      };
    };
    if (op === 'upload') {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: data.fileName,
          data: btoa(data.text)
        })
      });
      return parse(response);
    }
    if (op === 'verify') {
      const response = await fetch('/api/files/verify', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ urls: data.paths })
      });
      return parse(response);
    }
    if (op === 'read') {
      const response = await fetch(data.path, {
        method: 'GET',
        headers: headersFromContext()
      });
      return parse(response);
    }
    if (op === 'delete') {
      const response = await fetch('/api/files/delete', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ path: data.path })
      });
      return parse(response);
    }
    throw new Error(`Unknown operation ${op}`);
  }, { operation, payload });
}

async function runLiveProbe(report) {
  const playwright = await loadPlaywright();
  if (!playwright.ok) throw new Error(playwright.error?.message || 'Playwright is not available.');

  const browser = await playwright.chromium.launch({ headless: HEADLESS, timeout: TIMEOUT_MS });
  const sessions = [];
  const runRecord = (value) => {
    if (WRITE_ARTIFACTS) appendJsonLine(report.artifacts.liveLog, value);
  };

  try {
    for (const [index, user] of USERS.entries()) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      const consoleMessages = [];
      const pageErrors = [];
      page.on('console', (message) => {
        consoleMessages.push({ type: message.type(), text: compact(message.text(), 220) });
      });
      page.on('pageerror', (error) => {
        pageErrors.push(errorSummary(error));
      });
      const fileName = probeFileName({ runId: RUN_ID, handle: user.handle });
      const path = `/user/files/${fileName}`;
      const payload = probePayload({ runId: RUN_ID, user, fileName });
      runRecord({
        kind: 'parallel-user-login-start',
        timestamp: new Date().toISOString(),
        runId: RUN_ID,
        userHandle: user.handle,
        status: 'running'
      });
      const login = await loginSillyTavernUser(page, user);
      sessions.push({
        index,
        user,
        context,
        page,
        fileName,
        path,
        payload,
        login,
        consoleMessages,
        pageErrors
      });
      runRecord({
        kind: 'parallel-user-login-end',
        timestamp: new Date().toISOString(),
        runId: RUN_ID,
        userHandle: user.handle,
        status: login.ok ? 'pass' : 'fail',
        details: { loginAttempted: login.loginAttempted, ready: login.ready }
      });
    }

    const loginFailures = sessions.filter((session) => !session.login.ok);
    if (loginFailures.length > 0) {
      return sessions.map((session) => resultFromSession(session, {
        status: session.login.ok ? 'skipped' : 'fail',
        reason: session.login.ok ? 'another-user-login-failed' : 'login-or-context-not-ready'
      }));
    }

    for (const session of sessions) {
      runRecord({
        kind: 'parallel-user-storage-write-start',
        timestamp: new Date().toISOString(),
        runId: RUN_ID,
        userHandle: session.user.handle,
        status: 'running',
        path: session.path
      });
      session.upload = await pageFileOperation(session.page, 'upload', {
        fileName: session.fileName,
        text: session.payload.text
      });
      runRecord({
        kind: 'parallel-user-storage-write-end',
        timestamp: new Date().toISOString(),
        runId: RUN_ID,
        userHandle: session.user.handle,
        status: session.upload.ok ? 'pass' : 'fail',
        path: session.path,
        httpStatus: session.upload.status
      });
    }

    const allPaths = sessions.map((session) => session.path);
    for (const session of sessions) {
      session.verify = await pageFileOperation(session.page, 'verify', { paths: allPaths });
      session.readOwn = await pageFileOperation(session.page, 'read', { path: session.path });
      const visible = session.verify.json || {};
      session.ownVisible = visible[session.path] === true;
      session.visibleOtherPaths = allPaths.filter((path) => path !== session.path && visible[path] === true);
      runRecord({
        kind: 'parallel-user-storage-isolation',
        timestamp: new Date().toISOString(),
        runId: RUN_ID,
        userHandle: session.user.handle,
        status: session.ownVisible && session.visibleOtherPaths.length === 0 ? 'pass' : 'fail',
        ownPath: session.path,
        ownVisible: session.ownVisible,
        visibleOtherPathCount: session.visibleOtherPaths.length
      });
    }

    for (const session of sessions) {
      session.deleteOwn = await pageFileOperation(session.page, 'delete', { path: session.path }).catch((error) => ({
        ok: false,
        status: 0,
        error: errorSummary(error)
      }));
    }

    return sessions.map((session) => resultFromSession(session));
  } finally {
    for (const session of sessions) {
      await session.context.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }
}

function resultFromSession(session, override = {}) {
  const ownHash = session.readOwn?.text ? sha256Text(session.readOwn.text) : null;
  const payloadHash = session.payload?.text ? sha256Text(session.payload.text) : null;
  const uploadOk = session.upload?.ok === true;
  const verifyOk = session.verify?.ok === true;
  const readOk = session.readOwn?.ok === true;
  const isolationOk = session.ownVisible === true && (session.visibleOtherPaths || []).length === 0;
  const deleteOk = session.deleteOwn?.ok === true;
  const ok = uploadOk && verifyOk && readOk && isolationOk;
  return {
    handle: session.user.handle,
    status: override.status || (ok ? 'pass' : 'fail'),
    reason: override.reason || null,
    path: session.path,
    login: {
      ok: session.login?.ok === true,
      loginAttempted: session.login?.loginAttempted === true,
      ready: session.login?.ready || null
    },
    uploadOk,
    verifyOk,
    readOk,
    deleteOk,
    ownVisible: session.ownVisible === true,
    otherVisibleCount: (session.visibleOtherPaths || []).length,
    visibleOtherPathHashes: (session.visibleOtherPaths || []).map((path) => sha256Text(path).slice(0, 12)),
    payloadHash,
    readHash: ownHash,
    payloadRoundTrip: Boolean(ownHash && payloadHash && ownHash === payloadHash),
    http: {
      upload: session.upload?.status || null,
      verify: session.verify?.status || null,
      read: session.readOwn?.status || null,
      delete: session.deleteOwn?.status || null
    },
    browser: {
      consoleMessageCount: session.consoleMessages?.length || 0,
      pageErrorCount: session.pageErrors?.length || 0
    }
  };
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }

  const artifacts = createArtifactPaths({ rootDir: ARTIFACT_ROOT, runId: RUN_ID });
  const report = await buildDryRunReport({ artifacts });
  if (WRITE_ARTIFACTS) {
    ensureArtifactTree(artifacts);
    appendJsonLine(artifacts.liveLog, {
      kind: 'parallel-user-preflight-start',
      timestamp: report.generatedAt,
      runId: report.runId,
      mode: report.mode,
      userCount: USERS.length,
      baseUrl: BASE_URL || null
    });
  }

  if (LIVE && report.status !== 'fail') {
    try {
      report.liveResults = await runLiveProbe(report);
      const failures = report.liveResults.filter((entry) => entry.status === 'fail');
      report.checks.push(check(
        'live-user-storage-isolation',
        failures.length === 0 ? 'pass' : 'fail',
        failures.length === 0
          ? 'Each configured SillyTavern user saw only its own Directive /user/files probe.'
          : 'At least one SillyTavern user saw missing own storage or another user storage probe.',
        { resultCount: report.liveResults.length, failureHandles: failures.map((entry) => entry.handle) }
      ));
    } catch (error) {
      report.checks.push(check(
        'live-user-storage-isolation',
        'fail',
        'Live multi-user storage isolation probe failed.',
        errorSummary(error)
      ));
    }
    report.status = statusFromChecks(report.checks);
  }

  if (WRITE_ARTIFACTS) {
    writeJsonFile(artifacts.report, report);
    writeTextFile(artifacts.summary, summaryMarkdown(report));
    appendJsonLine(artifacts.liveLog, {
      kind: 'parallel-user-preflight-end',
      timestamp: new Date().toISOString(),
      runId: report.runId,
      status: report.status
    });
  }

  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    runId: report.runId,
    mode: report.mode,
    writeArtifacts: WRITE_ARTIFACTS,
    artifactRoot: WRITE_ARTIFACTS ? artifacts.root : null,
    users: report.users,
    checks: report.checks.map((entry) => ({
      id: entry.id,
      status: entry.status,
      summary: compact(entry.summary, 160)
    })),
    liveResults: report.liveResults.map((entry) => ({
      handle: entry.handle,
      status: entry.status,
      ownVisible: entry.ownVisible,
      otherVisibleCount: entry.otherVisibleCount,
      payloadRoundTrip: entry.payloadRoundTrip
    }))
  }, null, 2));

  if (report.status === 'fail') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(errorSummary(error));
    process.exit(1);
  });
}
