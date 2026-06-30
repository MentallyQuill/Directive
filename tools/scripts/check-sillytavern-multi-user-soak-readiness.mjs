import { pathToFileURL } from 'node:url';

import {
  DEFAULT_SILLYTAVERN_DATA_ROOT,
  DEFAULT_SOAK_ARTIFACT_ROOT,
  appendJsonLine,
  buildExternalContextBrowserProbe,
  compact,
  createArtifactPaths,
  createRunId,
  ensureArtifactTree,
  errorSummary,
  externalContextFixtureDepthCheckStatus,
  inspectSillyTavernExternalContextCompatibility,
  inspectSillyTavernAuthorNoteCleanliness,
  loadPlaywright,
  normalizeBaseUrl,
  sha256Text,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';
import {
  EXTERNAL_CONTEXT_FIXTURE_CHAT_FILE,
  EXTERNAL_CONTEXT_FIXTURE_CHAT_FOLDER,
  EXTERNAL_CONTEXT_FIXTURE_WORLD,
  buildExternalContextFixtureBrowserSnapshot,
  prepareSillyTavernExternalContextFixture
} from './prepare-sillytavern-external-context-fixture.mjs';

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
const EXTERNAL_CONTEXT_FIXTURE_PREVIEW = args.has('--external-context-fixture')
  || process.env.DIRECTIVE_SOAK_EXTERNAL_CONTEXT_FIXTURE_PREVIEW === '1'
  || process.env.DIRECTIVE_SOAK_EXTERNAL_CONTEXT_FIXTURE_BROWSER_SNAPSHOT === '1';
const ACTIVATE_EXTERNAL_CONTEXT_FIXTURE = args.has('--activate-external-context-fixture')
  || process.env.DIRECTIVE_SOAK_ACTIVATE_EXTERNAL_CONTEXT_FIXTURE === '1';
const PREPARE_EXTERNAL_CONTEXT_FIXTURES = args.has('--prepare-external-context-fixtures')
  || args.has('--prepare-external-context-fixture')
  || process.env.DIRECTIVE_SOAK_PREPARE_EXTERNAL_CONTEXT_FIXTURES === '1'
  || process.env.DIRECTIVE_SOAK_PREPARE_EXTERNAL_CONTEXT_FIXTURE === '1';
const EXTERNAL_CONTEXT_COMPAT = LIVE || EXTERNAL_CONTEXT_FIXTURE_PREVIEW || process.env.DIRECTIVE_SOAK_EXTERNAL_CONTEXT_COMPAT === '1';
const DATA_ROOT = process.env.DIRECTIVE_SILLYTAVERN_DATA_ROOT
  || process.env.SILLYTAVERN_DATA_ROOT
  || process.env.ST_DATA_ROOT
  || DEFAULT_SILLYTAVERN_DATA_ROOT;
const REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH = process.env.DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH === '1'
  || process.env.DIRECTIVE_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH === '1';
const ALLOW_PLACEHOLDER_SOAK_USERS = process.env.DIRECTIVE_ALLOW_PLACEHOLDER_SOAK_USERS === '1';
const DEFAULT_SOAK_USER_HANDLES = Object.freeze([
  'directive-soak-a',
  'directive-soak-b',
  'directive-soak-c',
  'directive-soak-d',
  'directive-soak-e'
]);
const MIN_PARALLEL_SOAK_USERS = DEFAULT_SOAK_USER_HANDLES.length;
const USERS = parseUsers(process.env.DIRECTIVE_SOAK_ST_USERS || process.env.DIRECTIVE_PARALLEL_SOAK_USERS || '');
const RESERVED_HUMAN_ONLY_USERS = new Set(['default-user']);

function usage() {
  return `Directive SillyTavern multi-user soak readiness

Dry run:
  node tools\\scripts\\check-sillytavern-multi-user-soak-readiness.mjs

Live isolation proof:
  $env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
  $env:DIRECTIVE_SOAK_ST_USERS='directive-soak-a,directive-soak-b,directive-soak-c,directive-soak-d,directive-soak-e'
  node tools\\scripts\\check-sillytavern-multi-user-soak-readiness.mjs --live --write-artifacts

Credential options:
  DIRECTIVE_SOAK_ST_USERS='[{"handle":"directive-soak-a","password":"secret"},{"handle":"directive-soak-b","password":"secret"},{"handle":"directive-soak-c","password":"secret"},{"handle":"directive-soak-d","password":"secret"},{"handle":"directive-soak-e","password":"secret"}]'
  DIRECTIVE_SOAK_ST_USERS='directive-soak-a,directive-soak-b,directive-soak-c,directive-soak-d,directive-soak-e' with DIRECTIVE_SOAK_ST_PASSWORD shared by all users
  DIRECTIVE_SOAK_ST_PASSWORD_DIRECTIVE_SOAK_A through DIRECTIVE_SOAK_ST_PASSWORD_DIRECTIVE_SOAK_E for per-user passwords
  DIRECTIVE_ALLOW_PLACEHOLDER_SOAK_USERS=1 permits placeholder handles in live mode only for explicit operator-confirmed local profiles

The live probe opens one Playwright browser context per ST user, logs in when a
login screen is present, writes a unique Directive /user/files probe for each
user, verifies each user can see only its own probe, deletes the probes, and
writes report artifacts. It does not create campaigns or make model calls.
The SillyTavern default-user account is reserved for human testing and must not
be included in automated soak user configuration.

Offline rich external-context fixture preflight:
  node tools\\scripts\\check-sillytavern-multi-user-soak-readiness.mjs --external-context-fixture --write-artifacts

Live rich external-context fixture certification:
  node tools\\scripts\\check-sillytavern-multi-user-soak-readiness.mjs --live --prepare-external-context-fixtures --activate-external-context-fixture --write-artifacts
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
    return DEFAULT_SOAK_USER_HANDLES.map((handle) => userRecord(handle, null, true));
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

function externalContextFixtureDepthCheck(externalContextProbe, { preBrowser = false } = {}) {
  const fixtureDepth = externalContextProbe?.fixtureDepth || null;
  const fullCertificationRequired = REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH && !preBrowser;
  const status = externalContextFixtureDepthCheckStatus({
    live: LIVE,
    fixtureDepth,
    probeRequired: EXTERNAL_CONTEXT_COMPAT,
    fullCertificationRequired
  });
  return check(
    'host-extension-fixture-depth',
    status,
    status === 'pass'
      ? 'At least one non-human soak user has rich active fixture evidence for every external-context target.'
      : status === 'skipped'
        ? 'External context fixture-depth proof is skipped when external compatibility is not required.'
        : fullCertificationRequired
          ? 'Required rich active external-context fixture evidence is missing or incomplete.'
          : 'External context observability exists, but rich active fixture evidence is incomplete or shallow.',
    fixtureDepth
      ? {
          status: fixtureDepth.status,
          requiredTargets: fixtureDepth.requiredTargets,
          fullFixtureUserHandles: fixtureDepth.fullFixtureUserHandles,
          missingTargets: fixtureDepth.missingTargets,
          targetCoverage: fixtureDepth.targetCoverage,
          fullCertificationRequired,
          preBrowser
        }
      : {
          fullCertificationRequired,
          preBrowser
        }
  );
}

function upsertCheck(checks, entry) {
  const index = checks.findIndex((item) => item.id === entry.id);
  if (index >= 0) checks[index] = entry;
  else checks.push(entry);
}

function reservedUsers(users) {
  return users.filter((entry) => RESERVED_HUMAN_ONLY_USERS.has(entry.handle));
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

function externalContextFixturePreviewSnapshots(users = []) {
  if (!EXTERNAL_CONTEXT_FIXTURE_PREVIEW) return [];
  const snapshots = [];
  for (const user of users) {
    try {
      snapshots.push(buildExternalContextFixtureBrowserSnapshot({ userHandle: user.handle }));
    } catch {
      // The reserved-user and user-count checks report invalid handles. The
      // preview path should not hide those failures by throwing first.
    }
  }
  return snapshots;
}

function prepareExternalContextFixtures(users = []) {
  if (!PREPARE_EXTERNAL_CONTEXT_FIXTURES) {
    return {
      status: 'skipped',
      requested: false,
      dataRoot: DATA_ROOT,
      results: [],
      failures: []
    };
  }
  const results = [];
  const failures = [];
  for (const user of users) {
    try {
      const result = prepareSillyTavernExternalContextFixture({
        dataRoot: DATA_ROOT,
        userHandle: user.handle,
        write: true,
        validate: true
      });
      const compactResult = {
        userHandle: result.userHandle || user.handle,
        status: result.status || 'unknown',
        validationStatus: result.validation?.status || null,
        fixtureDepthStatus: result.validation?.fixtureDepth?.status || null,
        fullFixtureUserHandles: result.validation?.fixtureDepth?.fullFixtureUserHandles || [],
        missingTargets: result.validation?.fixtureDepth?.missingTargets || []
      };
      results.push(compactResult);
      if (compactResult.status !== 'pass' || compactResult.validationStatus !== 'pass') failures.push(compactResult);
    } catch (error) {
      const failure = {
        userHandle: user.handle,
        status: 'fail',
        error: errorSummary(error)
      };
      results.push(failure);
      failures.push(failure);
    }
  }
  return {
    status: failures.length ? 'fail' : 'pass',
    requested: true,
    dataRoot: DATA_ROOT,
    resultCount: results.length,
    results,
    failures
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
  const reserved = reservedUsers(USERS);
  const hasPlaceholderUsers = USERS.some((entry) => entry.placeholder);
  const placeholderUserStatus = hasPlaceholderUsers
    ? LIVE && !ALLOW_PLACEHOLDER_SOAK_USERS ? 'fail' : 'warning'
    : 'pass';
  const externalContextFixturePreparation = prepareExternalContextFixtures(USERS);
  const authorNoteCleanliness = inspectSillyTavernAuthorNoteCleanliness({ users: USERS, required: LIVE });
  const hostExtensionCompatibility = inspectSillyTavernExternalContextCompatibility({
    users: USERS,
    required: EXTERNAL_CONTEXT_COMPAT
  });
  const generatedAt = new Date().toISOString();
  const externalContextProbe = buildExternalContextBrowserProbe({
    runId: RUN_ID,
    capturedAt: generatedAt,
    baseUrl: BASE_URL || null,
    required: false,
    users: USERS,
    diskCompatibility: hostExtensionCompatibility,
    browserSnapshots: externalContextFixturePreviewSnapshots(USERS)
  });
  const checks = [
    check(
      'user-count',
      USERS.length >= MIN_PARALLEL_SOAK_USERS ? 'pass' : 'fail',
      USERS.length >= MIN_PARALLEL_SOAK_USERS
        ? 'Five SillyTavern users are configured for full parallel readiness.'
        : 'Configure five SillyTavern users with DIRECTIVE_SOAK_ST_USERS for the full parallel soak.',
      { count: USERS.length, minimum: MIN_PARALLEL_SOAK_USERS, users: USERS.map(redactUser) }
    ),
    check(
      'placeholder-users',
      placeholderUserStatus,
      hasPlaceholderUsers
        ? LIVE && !ALLOW_PLACEHOLDER_SOAK_USERS
          ? 'Live execution requires explicit DIRECTIVE_SOAK_ST_USERS or DIRECTIVE_ALLOW_PLACEHOLDER_SOAK_USERS=1.'
          : 'Using placeholder soak user handles; set DIRECTIVE_SOAK_ST_USERS before live execution.'
        : 'Explicit soak user handles are configured.',
      hasPlaceholderUsers ? { allowPlaceholderSoakUsers: ALLOW_PLACEHOLDER_SOAK_USERS } : null
    ),
    check(
      'reserved-human-user',
      reserved.length === 0 ? 'pass' : 'fail',
      reserved.length === 0
        ? 'No human-only SillyTavern account is assigned to automated soak work.'
        : 'Remove human-only SillyTavern accounts from automated soak user configuration.',
      reserved.length === 0 ? null : { reservedHandles: reserved.map((entry) => entry.handle) }
    ),
    check(
      'author-note-cleanliness',
      authorNoteCleanliness.status,
      authorNoteCleanliness.summary,
      authorNoteCleanliness
    ),
    check(
      'host-extension-compatibility',
      hostExtensionCompatibility.status,
      hostExtensionCompatibility.summary,
      hostExtensionCompatibility
    ),
    check(
      'host-extension-fixture-preparation',
      externalContextFixturePreparation.requested ? externalContextFixturePreparation.status : 'skipped',
      externalContextFixturePreparation.requested
        ? externalContextFixturePreparation.status === 'pass'
          ? 'Prepared rich external-context fixtures for configured non-human soak users.'
          : 'One or more configured soak users could not receive a rich external-context fixture.'
        : 'External-context fixture preparation was not requested.',
      externalContextFixturePreparation
    ),
    externalContextFixtureDepthCheck(externalContextProbe, { preBrowser: LIVE }),
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
    generatedAt,
    mode: LIVE ? 'live' : 'dry-run',
    status: statusFromChecks(checks),
    baseUrl: BASE_URL || null,
    users: USERS.map(redactUser),
    artifacts,
    externalContextFixturePreparation,
    hostExtensionCompatibility,
    externalContextProbe,
    checks,
    liveResults: []
  };
}

async function detectReady(page) {
  return page.evaluate(async () => {
    let context = null;
    let headers = null;
    let contextError = null;
    let userHandle = null;
    let userStatus = null;
    try {
      context = globalThis.SillyTavern?.getContext?.() || null;
      headers = context?.getRequestHeaders?.() || null;
      const response = await fetch('/api/users/me', { headers: headers || {} });
      userStatus = response.status;
      if (response.ok) {
        const user = await response.json();
        userHandle = typeof user?.handle === 'string' ? user.handle : null;
      }
    } catch (error) {
      contextError = String(error?.message || error);
    }
    const bodyText = document.body?.innerText || '';
    const bodyPreview = bodyText.replace(/\s+/g, ' ').trim().slice(0, 500);
    const initializing = /^Initializing/.test(bodyPreview);
    return {
      href: location.href,
      title: document.title || '',
      contextReady: Boolean(userHandle),
      contextError,
      userHandle,
      userStatus,
      initializing,
      readyState: document.readyState,
      hasPasswordInput: Boolean(document.querySelector('input[type="password"]')),
      textInputCount: document.querySelectorAll('input[type="text"], input:not([type]), input[type="search"]').length,
      buttonText: Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
        .map((entry) => entry.innerText || entry.value || entry.getAttribute('aria-label') || '')
        .filter(Boolean)
        .slice(0, 20),
      bodyPreview
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

async function waitForReadyUser(page, user, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let ready = await detectReady(page);
  while (!(ready.contextReady && ready.userHandle === user.handle) && Date.now() < deadline) {
    await page.waitForTimeout(500);
    ready = await detectReady(page);
  }
  return ready;
}

async function loginViaApi(page, user) {
  return page.evaluate(async ({ handle, password }) => {
    const tokenResponse = await fetch('/csrf-token', { cache: 'no-store' });
    const tokenData = await tokenResponse.json();
    const response = await fetch('/api/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': tokenData.token
      },
      body: JSON.stringify({ handle, password: password || '' })
    });
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
  }, { handle: user.handle, password: user.password || '' });
}

async function loginSillyTavernUser(page, user) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS }).catch(() => {});

  let ready = await waitForReadyUser(page, user, 1500);
  if (ready.contextReady && ready.userHandle === user.handle) {
    return { ok: true, loginAttempted: false, ready };
  }

  const apiLogin = await loginViaApi(page, user);
  if (apiLogin.ok) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForLoadState('domcontentloaded', { timeout: TIMEOUT_MS }).catch(() => {});
  }

  ready = await waitForReadyUser(page, user);
  return {
    ok: ready.contextReady && ready.userHandle === user.handle,
    loginAttempted: true,
    ready,
    apiLogin
  };
}

async function captureExternalContextBrowserSnapshot(page, user) {
  return page.evaluate(({ handle }) => {
    const countKeys = (value) => value && typeof value === 'object' ? Object.keys(value).length : 0;
    const promptKeysFrom = (value) => {
      if (!value || typeof value !== 'object') return [];
      if (Array.isArray(value)) {
        return value
          .map((entry) => typeof entry === 'string' ? entry : entry?.identifier || entry?.id || entry?.name)
          .filter(Boolean);
      }
      return Object.keys(value);
    };
    const markerCounts = (chat) => {
      const counts = {
        summaryceptionGhosted: 0,
        memoryBooksHidden: 0,
        vectFoxGhosted: 0,
        nativeHidden: 0
      };
      for (const message of Array.isArray(chat) ? chat : []) {
        const extra = message?.extra || {};
        if (extra.sc_ghosted || extra.summaryception?.ghosted) counts.summaryceptionGhosted += 1;
        if (extra.stmb_hidden || extra.memoryBooks?.hidden) counts.memoryBooksHidden += 1;
        if (extra.vectfox_prompt_ghosted || extra.vectfoxGhosted || extra.vectfox?.promptGhosted || extra.eventbase_ghosted) counts.vectFoxGhosted += 1;
        if (message?.is_hidden || message?.hidden) counts.nativeHidden += 1;
      }
      return counts;
    };

    let context = null;
    let contextError = null;
    try {
      context = globalThis.SillyTavern?.getContext?.() || null;
    } catch (error) {
      contextError = String(error?.message || error);
    }
    const extensionSettings = context?.extensionSettings
      || context?.extension_settings
      || globalThis.extension_settings
      || {};
    const chatMetadata = context?.chatMetadata || context?.chat_metadata || {};
    const chat = Array.isArray(context?.chat) ? context.chat : [];
    const promptRegistry = context?.extensionPrompts
      || context?.extension_prompts
      || globalThis.extensionPrompts
      || globalThis.extension_prompts
      || null;
    const promptKeys = promptKeysFrom(promptRegistry);
    const worldInfoSettings = context?.worldInfoSettings
      || context?.world_info_settings
      || globalThis.world_info_settings
      || {};
    const worldInfoActiveNames = [
      ...(Array.isArray(worldInfoSettings?.world_info?.globalSelect) ? worldInfoSettings.world_info.globalSelect : []),
      ...(Array.isArray(worldInfoSettings?.globalSelect) ? worldInfoSettings.globalSelect : [])
    ];
    const memoryBooksSettings = extensionSettings.STMemoryBooks
      || extensionSettings.stMemoryBooks
      || extensionSettings.memoryBooks
      || {};
    const summaryceptionSettings = extensionSettings.summaryception || {};
    const vectFoxSettings = extensionSettings.vectfox || extensionSettings.VectFox || {};
    const summaryceptionMetadata = chatMetadata.summaryception || {};
    const summaryceptionLayerCount = Array.isArray(summaryceptionMetadata.layers)
      ? summaryceptionMetadata.layers.length
      : Number(summaryceptionMetadata.layerCount || 0);
    const summaryceptionGhostedCount = Array.isArray(summaryceptionMetadata.ghostedIndices)
      ? summaryceptionMetadata.ghostedIndices.length
      : Number(summaryceptionMetadata.ghostedCount || 0);

    return {
      handle,
      resolvedBrowserUserHandle: handle,
      href: location.href,
      contextReady: Boolean(context),
      contextError,
      currentChatId: context?.chatId || context?.chat_id || context?.chat?.id || null,
      chatLength: chat.length,
      hostPromptRegistry: {
        available: Boolean(promptRegistry),
        promptKeys,
        sourceKeyCount: countKeys(promptRegistry)
      },
      worldInfo: {
        settingsSeen: countKeys(worldInfoSettings) > 0,
        globalSignatureSeen: Boolean(globalThis.world_names || globalThis.world_info),
        enabled: worldInfoActiveNames.length > 0 || Boolean(chatMetadata.world_info),
        activeNames: worldInfoActiveNames.slice(0, 20)
      },
      memoryBooks: {
        settingsSeen: countKeys(memoryBooksSettings) > 0,
        globalSignatureSeen: Boolean(globalThis.STMemoryBooks || globalThis.SillyTavernMemoryBooks),
        installed: countKeys(memoryBooksSettings) > 0,
        enabled: memoryBooksSettings.enabled === true || memoryBooksSettings.moduleSettings?.enabled === true,
        activeBookName: chatMetadata.world_info || null,
        entryCount: Number(memoryBooksSettings.entryCount || 0),
        riskyModes: {
          autoSummary: memoryBooksSettings.moduleSettings?.autoSummaryEnabled === true || memoryBooksSettings.autoSummaryEnabled === true,
          autoCreate: memoryBooksSettings.moduleSettings?.autoCreateEnabled === true || memoryBooksSettings.autoCreateEnabled === true,
          autoHideUnhide: memoryBooksSettings.moduleSettings?.unhideBeforeMemory === true || Boolean(memoryBooksSettings.moduleSettings?.autoHideMode),
          sidePrompts: memoryBooksSettings.moduleSettings?.sidePromptsEnabled === true || memoryBooksSettings.sidePromptsEnabled === true,
          atDepthUserOrAssistant: memoryBooksSettings.moduleSettings?.summaryEntrySettings?.position === 4
        }
      },
      summaryception: {
        settingsSeen: countKeys(summaryceptionSettings) > 0,
        globalSignatureSeen: Boolean(globalThis.Summaryception || globalThis.summaryception),
        installed: countKeys(summaryceptionSettings) > 0,
        enabled: summaryceptionSettings.enabled === true
      },
      vectFox: {
        settingsSeen: countKeys(vectFoxSettings) > 0,
        globalSignatureSeen: Boolean(globalThis.VectFox || globalThis.vectFox || globalThis.vectfox),
        installed: countKeys(vectFoxSettings) > 0,
        enabled: vectFoxSettings.enabled === true,
        disabledPresent: vectFoxSettings.enabled === false,
        promptKeys: promptKeys.filter((key) => /^3_vectfox/i.test(String(key || ''))),
        backendType: vectFoxSettings.vector_backend || null,
        semanticWorldInfoEnabled: vectFoxSettings.enabled_world_info === true,
        summarizerInjectionEnabled: vectFoxSettings.summarizer_injection_enabled === true,
        ghostingEnabled: vectFoxSettings.eventbase_ghost_enabled === true,
        generationInterceptorActive: countKeys(vectFoxSettings) > 0
      },
      chatMetadata: {
        worldInfo: chatMetadata.world_info || null,
        summaryception: {
          summarizedUpTo: summaryceptionMetadata.summarizedUpTo,
          layerCount: summaryceptionLayerCount,
          ghostedCount: summaryceptionGhostedCount
        }
      },
      messageMarkerCounts: markerCounts(chat),
      unavailableSignals: [
        ...(context ? [] : ['sillytavern-context-unavailable']),
        ...(promptRegistry ? [] : ['prompt-registry-unavailable'])
      ]
    };
  }, { handle: user.handle });
}

function userDiskCompatibility(hostExtensionCompatibility, user) {
  const handle = normalizeId(user?.handle || user?.displayHandle || '');
  return (hostExtensionCompatibility?.users || [])
    .find((entry) => normalizeId(entry?.handle || '') === handle) || null;
}

function externalContextProbeForSnapshot({ user, diskCompatibility, snapshot }) {
  return buildExternalContextBrowserProbe({
    runId: RUN_ID,
    capturedAt: new Date().toISOString(),
    baseUrl: BASE_URL || null,
    required: EXTERNAL_CONTEXT_COMPAT,
    users: [user],
    diskCompatibility: { users: diskCompatibility ? [diskCompatibility] : [] },
    browserSnapshots: [snapshot]
  })?.users?.[0] || null;
}

function fixtureChatId() {
  return EXTERNAL_CONTEXT_FIXTURE_CHAT_FILE.replace(/\.jsonl$/i, '');
}

function diskHasExternalContextFixture(diskCompatibility = null) {
  const environment = diskCompatibility?.externalPromptEnvironment || {};
  return environment.worldInfo?.chatBoundName === EXTERNAL_CONTEXT_FIXTURE_WORLD
    || (environment.worldInfo?.activeNames || []).includes(EXTERNAL_CONTEXT_FIXTURE_WORLD)
    || Number(environment.memoryBooks?.entryCount || environment.memoryBooks?.stMemoryBookEntryCount || 0) > 0
    || Number(environment.summaryception?.ghostedCount || 0) > 0
    || Boolean(environment.vectFox?.enabled);
}

async function activateExternalContextFixtureChat(page, user, diskCompatibility) {
  if (!ACTIVATE_EXTERNAL_CONTEXT_FIXTURE) {
    return { ok: false, skipped: true, reason: 'activation-not-requested' };
  }
  if (!diskHasExternalContextFixture(diskCompatibility)) {
    return { ok: false, skipped: true, reason: 'fixture-not-prepared-for-user' };
  }
  return page.evaluate(async ({
    handle,
    characterFolder,
    chatFile,
    chatId,
    worldName
  }) => {
    const clone = (value) => value === undefined ? null : JSON.parse(JSON.stringify(value));
    const normalize = (value) => String(value || '')
      .replace(/\.png$/i, '')
      .replace(/\.jsonl$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const markerCounts = (chat) => {
      const counts = { summaryceptionGhosted: 0, memoryBooksHidden: 0, vectFoxGhosted: 0 };
      for (const message of Array.isArray(chat) ? chat : []) {
        const extra = message?.extra || {};
        if (extra.sc_ghosted || extra.summaryception?.ghosted) counts.summaryceptionGhosted += 1;
        if (extra.stmb_hidden || extra.memoryBooks?.hidden) counts.memoryBooksHidden += 1;
        if (extra.vectfox_prompt_ghosted || extra.vectfoxGhosted || extra.vectfox?.promptGhosted || extra.eventbase_ghosted) counts.vectFoxGhosted += 1;
      }
      return counts;
    };
    const snapshot = () => {
      const context = globalThis.SillyTavern?.getContext?.() || {};
      const characters = Array.isArray(context.characters)
        ? context.characters
        : (Array.isArray(globalThis.characters) ? globalThis.characters : []);
      const selectedCharacterId = context.characterId
        ?? context.character_id
        ?? context.this_chid
        ?? context.selectedCharacterId
        ?? globalThis.this_chid
        ?? null;
      const selectedCharacter = selectedCharacterId !== null && selectedCharacterId !== undefined
        ? characters[Number(selectedCharacterId)]
        : null;
      const chatMetadata = context.chatMetadata || context.chat_metadata || globalThis.chat_metadata || {};
      const chat = Array.isArray(context.chat) ? context.chat : (Array.isArray(globalThis.chat) ? globalThis.chat : []);
      return {
        handle,
        selectedCharacterId: selectedCharacterId === null || selectedCharacterId === undefined ? null : String(selectedCharacterId),
        selectedCharacterName: selectedCharacter?.name || selectedCharacter?.data?.name || null,
        selectedCharacterAvatar: selectedCharacter?.avatar || selectedCharacter?.filename || selectedCharacter?.avatar_url || null,
        currentChatId: context.chatId
          || context.chat_id
          || context.currentChatId
          || context.current_chat_id
          || selectedCharacter?.chat
          || null,
        chatLength: chat.length,
        chatMetadata: {
          worldInfo: chatMetadata.world_info || null,
          hasSTMemoryBooks: Boolean(chatMetadata.STMemoryBooks),
          hasSummaryception: Boolean(chatMetadata.summaryception),
          hasVectFox: Boolean(chatMetadata.vectFox || chatMetadata.vectfox)
        },
        messageMarkerCounts: markerCounts(chat)
      };
    };

    try {
      const script = await import('/script.js').catch(() => null);
      const context = globalThis.SillyTavern?.getContext?.() || {};
      const characters = Array.isArray(context.characters)
        ? context.characters
        : (Array.isArray(globalThis.characters) ? globalThis.characters : []);
      const targetCharacterIndex = characters.findIndex((entry) => [
        entry?.avatar,
        entry?.filename,
        entry?.avatar_url,
        entry?.name,
        entry?.data?.name
      ].some((value) => normalize(value) === normalize(characterFolder)));
      if (targetCharacterIndex < 0) {
        return {
          ok: false,
          reason: 'fixture-character-not-found',
          characterFolder,
          availableMatches: characters
            .map((entry, index) => ({
              index,
              name: entry?.name || entry?.data?.name || '',
              avatar: entry?.avatar || entry?.filename || entry?.avatar_url || ''
            }))
            .filter((entry) => /Directive|Ashes/i.test(`${entry.name} ${entry.avatar}`))
            .slice(0, 20),
          before: snapshot()
        };
      }

      const currentSelectedId = context.characterId
        ?? context.character_id
        ?? context.this_chid
        ?? context.selectedCharacterId
        ?? globalThis.this_chid
        ?? null;
      if (String(currentSelectedId ?? '') !== String(targetCharacterIndex)) {
        const selectCharacter = context.selectCharacterById
          || globalThis.selectCharacterById
          || script?.selectCharacterById;
        if (typeof selectCharacter !== 'function') {
          return {
            ok: false,
            reason: 'selectCharacterById-unavailable',
            targetCharacterIndex,
            before: snapshot()
          };
        }
        await selectCharacter.call(context, targetCharacterIndex, { switchMenu: false });
      }

      const refreshedContext = globalThis.SillyTavern?.getContext?.() || context;
      const openCharacterChat = refreshedContext.openCharacterChat
        || globalThis.openCharacterChat
        || script?.openCharacterChat;
      if (typeof openCharacterChat !== 'function') {
        return {
          ok: false,
          reason: 'openCharacterChat-unavailable',
          targetCharacterIndex,
          before: snapshot()
        };
      }

      await openCharacterChat.call(refreshedContext, chatId);
      let after = snapshot();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const markerTotal = Number(after.messageMarkerCounts.summaryceptionGhosted || 0)
          + Number(after.messageMarkerCounts.memoryBooksHidden || 0)
          + Number(after.messageMarkerCounts.vectFoxGhosted || 0);
        const metadataLoaded = after.chatMetadata.worldInfo === worldName
          && after.chatMetadata.hasSummaryception === true
          && markerTotal > 0;
        const chatMatches = normalize(after.currentChatId) === normalize(chatId)
          || normalize(after.currentChatId) === normalize(chatFile);
        if (metadataLoaded && chatMatches && Number(after.chatLength || 0) >= 4) {
          return {
            ok: true,
            skipped: false,
            method: 'script.openCharacterChat',
            targetCharacterIndex,
            chatId,
            after
          };
        }
        await sleep(250);
        after = snapshot();
      }
      return {
        ok: false,
        skipped: false,
        reason: 'fixture-chat-load-timeout',
        targetCharacterIndex,
        chatId,
        after
      };
    } catch (error) {
      return {
        ok: false,
        skipped: false,
        reason: 'fixture-activation-error',
        error: { name: error?.name || 'Error', message: error?.message || String(error) },
        after: snapshot()
      };
    }
  }, {
    handle: user.handle,
    characterFolder: EXTERNAL_CONTEXT_FIXTURE_CHAT_FOLDER,
    chatFile: EXTERNAL_CONTEXT_FIXTURE_CHAT_FILE,
    chatId: fixtureChatId(),
    worldName: EXTERNAL_CONTEXT_FIXTURE_WORLD
  });
}

async function waitForExternalContextBrowserSnapshot(page, user, diskCompatibility) {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastSnapshot = null;
  let lastProbe = null;

  do {
    lastSnapshot = await captureExternalContextBrowserSnapshot(page, user);
    lastProbe = externalContextProbeForSnapshot({ user, diskCompatibility, snapshot: lastSnapshot });
    if (!EXTERNAL_CONTEXT_COMPAT || lastProbe?.status === 'pass') {
      return {
        ...lastSnapshot,
        readinessProbeStatus: lastProbe?.status || null,
        readinessTargetStatuses: lastProbe?.targets
          ? Object.fromEntries(Object.entries(lastProbe.targets).map(([key, value]) => [key, value.status]))
          : null
      };
    }
    await page.waitForTimeout(750);
  } while (Date.now() < deadline);

  return {
    ...(lastSnapshot || {
      handle: user.handle,
      contextReady: false,
      hostPromptRegistry: { available: false, promptKeys: [] },
      unavailableSignals: ['browser-external-context-capture-timeout']
    }),
    readinessProbeStatus: lastProbe?.status || null,
    readinessTargetStatuses: lastProbe?.targets
      ? Object.fromEntries(Object.entries(lastProbe.targets).map(([key, value]) => [key, value.status]))
      : null
  };
}

async function pageFileOperation(page, operation, payload) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await page.evaluate(async ({ operation: op, payload: data }) => {
        const csrfHeaders = async () => {
          const response = await fetch('/csrf-token', { cache: 'no-store' });
          const json = await response.json();
          return {
            'Content-Type': 'application/json',
            'X-CSRF-Token': json.token
          };
        };
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
            headers: await csrfHeaders(),
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
            headers: await csrfHeaders(),
            body: JSON.stringify({ urls: data.paths })
          });
          return parse(response);
        }
        if (op === 'read') {
          const response = await fetch(data.path, {
            method: 'GET'
          });
          return parse(response);
        }
        if (op === 'delete') {
          const response = await fetch('/api/files/delete', {
            method: 'POST',
            headers: await csrfHeaders(),
            body: JSON.stringify({ path: data.path })
          });
          return parse(response);
        }
        throw new Error(`Unknown operation ${op}`);
      }, { operation, payload });
    } catch (error) {
      const message = String(error?.message || error);
      const navigationRace = /Execution context was destroyed|navigation|Target page, context or browser has been closed/i.test(message);
      if (!navigationRace || attempt === 4) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  throw new Error(`Unable to complete ${operation} after retries.`);
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
      const diskCompatibility = userDiskCompatibility(report.hostExtensionCompatibility, session.user);
      session.externalContextFixtureActivation = await activateExternalContextFixtureChat(
        session.page,
        session.user,
        diskCompatibility
      ).catch((error) => ({
        ok: false,
        skipped: false,
        reason: 'fixture-activation-threw',
        error: errorSummary(error)
      }));
      runRecord({
        kind: 'external-context-fixture-activation',
        timestamp: new Date().toISOString(),
        runId: RUN_ID,
        userHandle: session.user.handle,
        status: session.externalContextFixtureActivation?.ok
          ? 'pass'
          : session.externalContextFixtureActivation?.skipped
            ? 'skipped'
            : 'warning',
        reason: session.externalContextFixtureActivation?.reason || null,
        currentChatId: session.externalContextFixtureActivation?.after?.currentChatId || null,
        chatLength: session.externalContextFixtureActivation?.after?.chatLength || null,
        chatMetadata: session.externalContextFixtureActivation?.after?.chatMetadata || null,
        messageMarkerCounts: session.externalContextFixtureActivation?.after?.messageMarkerCounts || null
      });
      session.externalContextBrowser = await waitForExternalContextBrowserSnapshot(
        session.page,
        session.user,
        diskCompatibility
      ).catch((error) => ({
        handle: session.user.handle,
        contextReady: false,
        hostPromptRegistry: { available: false, promptKeys: [] },
        unavailableSignals: ['browser-external-context-capture-failed'],
        error: errorSummary(error)
      }));
      runRecord({
        kind: 'host-extension-browser-context',
        timestamp: new Date().toISOString(),
        runId: RUN_ID,
        userHandle: session.user.handle,
        status: session.externalContextBrowser.contextReady ? 'observed' : 'unavailable',
        readinessProbeStatus: session.externalContextBrowser.readinessProbeStatus || null,
        readinessTargetStatuses: session.externalContextBrowser.readinessTargetStatuses || null,
        promptKeyCount: session.externalContextBrowser.hostPromptRegistry?.promptKeys?.length || 0,
        unavailableSignals: session.externalContextBrowser.unavailableSignals || []
      });
    }

    report.externalContextProbe = buildExternalContextBrowserProbe({
      runId: RUN_ID,
      capturedAt: new Date().toISOString(),
      baseUrl: BASE_URL || null,
      required: EXTERNAL_CONTEXT_COMPAT,
      users: USERS,
      diskCompatibility: report.hostExtensionCompatibility,
      browserSnapshots: sessions.map((session) => session.externalContextBrowser)
    });
    if (WRITE_ARTIFACTS) {
      writeJsonFile(`${report.artifacts.hostExtensions}/external-context-probe.json`, report.externalContextProbe);
      for (const userProbe of report.externalContextProbe.users || []) {
        writeJsonFile(`${report.artifacts.hostExtensions}/external-context-probe.${userProbe.handle}.json`, userProbe);
      }
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
  const ok = uploadOk && verifyOk && readOk && isolationOk && deleteOk;
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
    },
    externalContextFixtureActivation: session.externalContextFixtureActivation
      ? {
          ok: session.externalContextFixtureActivation.ok === true,
          skipped: session.externalContextFixtureActivation.skipped === true,
          reason: session.externalContextFixtureActivation.reason || null,
          currentChatId: session.externalContextFixtureActivation.after?.currentChatId || null,
          chatLength: session.externalContextFixtureActivation.after?.chatLength || null
        }
      : null
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
    writeJsonFile(`${artifacts.hostExtensions}/compatibility.json`, report.hostExtensionCompatibility);
    writeJsonFile(`${artifacts.hostExtensions}/external-context-probe.json`, report.externalContextProbe);
    appendJsonLine(artifacts.liveLog, {
      kind: 'parallel-user-preflight-start',
      timestamp: report.generatedAt,
      runId: report.runId,
      mode: report.mode,
      userCount: USERS.length,
      baseUrl: BASE_URL || null
    });
    appendJsonLine(artifacts.liveLog, {
      kind: 'host-extension-compatibility',
      timestamp: report.generatedAt,
      runId: report.runId,
      status: report.hostExtensionCompatibility.status,
      checkedUserCount: report.hostExtensionCompatibility.checkedUserCount
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
      report.checks.push(check(
        'live-host-extension-browser-context',
        report.externalContextProbe?.status || 'fail',
        report.externalContextProbe?.status === 'pass'
          ? 'Live browser/runtime external context probe observed, disabled, or ruled out known context-extension targets for each soak user.'
          : 'Live browser/runtime external context probe found unresolved external context-extension visibility.',
        report.externalContextProbe
          ? {
              userCount: report.externalContextProbe.users.length,
              userStatuses: report.externalContextProbe.users.map((entry) => ({
                handle: entry.handle,
                status: entry.status,
                targets: Object.fromEntries(Object.entries(entry.targets || {}).map(([key, target]) => [key, target.status]))
              }))
            }
          : null
      ));
      upsertCheck(report.checks, externalContextFixtureDepthCheck(report.externalContextProbe));
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
    writeJsonFile(`${artifacts.hostExtensions}/external-context-probe.json`, report.externalContextProbe);
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
      payloadRoundTrip: entry.payloadRoundTrip,
      fixtureActivated: entry.externalContextFixtureActivation?.ok === true
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
