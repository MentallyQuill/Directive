import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  normalizeExternalPromptEnvironment,
  stableJsonStringify
} from '../../../src/runtime/architecture-redesign-contracts.mjs';

export const DEFAULT_SILLYTAVERN_BASE_URL = 'http://127.0.0.1:8000';
export const DEFAULT_DIRECTIVE_EXTENSION_PATH = '/scripts/extensions/third-party/Directive';
export const DEFAULT_SOAK_ARTIFACT_ROOT = 'artifacts/live-soak/sillytavern-campaign';
export const DEFAULT_SILLYTAVERN_DATA_ROOT = process.platform === 'win32'
  ? 'F:\\SillyTavern\\SillyTavern\\data'
  : '';

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

function readJsonFileIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
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

function normalizeSoakHandle(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function walkFiles(directoryPath, predicate = () => true, files = []) {
  if (!directoryPath || !fs.existsSync(directoryPath)) return files;
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const filePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) walkFiles(filePath, predicate, files);
    else if (predicate(filePath, entry)) files.push(filePath);
  }
  return files;
}

function firstJsonLine(filePath) {
  const handle = fs.openSync(filePath, 'r');
  try {
    const chunks = [];
    const buffer = Buffer.alloc(4096);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)) > 0) {
      const text = buffer.slice(0, bytesRead).toString('utf8');
      const newline = text.search(/\r?\n/);
      if (newline >= 0) {
        chunks.push(text.slice(0, newline));
        break;
      }
      chunks.push(text);
      if (chunks.join('').length > 1024 * 1024) break;
    }
    return chunks.join('');
  } finally {
    fs.closeSync(handle);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(asArray(values).map((value) => String(value || '').trim()).filter(Boolean))];
}

function objectHash(value) {
  return sha256Text(stableJsonStringify(value || {}));
}

function truthy(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function diagnosticStatus(value = {}) {
  return String(value?.status || '').trim().toLowerCase();
}

function hasUsefulDiagnosticStatus(value = {}) {
  const status = diagnosticStatus(value);
  return Boolean(status && status !== 'unknown' && status !== 'missing');
}

function hasRichDiagnosticStatus(value = {}, {
  allowUnavailable = false
} = {}) {
  const status = diagnosticStatus(value);
  if (!status || ['unknown', 'missing'].includes(status)) return false;
  if (!allowUnavailable && status === 'unavailable') return false;
  return true;
}

function selectBestDiagnostic(...values) {
  const diagnostics = values.filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  return diagnostics.find(hasUsefulDiagnosticStatus) || diagnostics[0] || null;
}

function targetStatus({ diskInstalled = false, diskEnabled = false, diskDisabled = false, browserConfirmed = false, browserUnavailable = false } = {}) {
  if (browserConfirmed) return 'browser-confirmed';
  if (diskDisabled) return 'disabled';
  if (diskInstalled && !diskEnabled) return 'disabled';
  if (diskInstalled || diskEnabled) return 'disk-confirmed';
  return browserUnavailable ? 'unavailable' : 'not-installed';
}

function targetPassStatus(status) {
  return ['browser-confirmed', 'disabled', 'not-installed'].includes(status);
}

const EXTERNAL_CONTEXT_FIXTURE_TARGET_IDS = Object.freeze([
  'stLorebooks',
  'memoryBooks',
  'summaryception',
  'vectFox'
]);

function countValue(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function boundedInteger(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

function targetPromptKeys(target = {}) {
  return Array.isArray(target.promptKeys) ? target.promptKeys : [];
}

function environmentPromptKeys(environment = {}) {
  return Array.isArray(environment.knownExternalPromptKeys) ? environment.knownExternalPromptKeys : [];
}

function fixtureTargetEvidence(targetId, target = {}, environment = {}) {
  if ((target.status || 'unknown') !== 'browser-confirmed') return [];
  const evidence = [];
  const promptKeys = unique([...targetPromptKeys(target), ...environmentPromptKeys(environment)]);
  const chatCounts = target.chatMetadataCounts || {};
  const markerCounts = target.messageMarkerCounts || {};
  const browserSignals = target.browserSignals || {};
  const worldInfo = environment.worldInfo || {};
  const memoryBooks = environment.memoryBooks || {};
  const summaryception = environment.summaryception || {};
  const vectFox = environment.vectFox || {};
  if (targetId === 'stLorebooks') {
    const active = worldInfo.active === true
      || countValue(chatCounts.chatBoundWorld) > 0
      || Boolean(worldInfo.chatBoundName)
      || Boolean(worldInfo.activeNames?.length);
    const sourceSeen = browserSignals.chatMetadataSeen === true
      || browserSignals.promptKeySeen === true
      || browserSignals.globalSignatureSeen === true
      || promptKeys.some((key) => /^worldinfo/i.test(key))
      || Boolean(worldInfo.chatBoundName)
      || Boolean(worldInfo.settingsHash);
    if (!active || !sourceSeen) return [];
    if (countValue(chatCounts.chatBoundWorld) > 0 || Boolean(worldInfo.chatBoundName)) evidence.push('chat-bound-world');
    if (Boolean(worldInfo.activeNames?.length) || worldInfo.active === true) evidence.push('active-world-info');
    if (browserSignals.globalSignatureSeen === true) evidence.push('world-info-global-signature');
    if (Boolean(worldInfo.settingsHash)) evidence.push('world-info-settings');
    if (browserSignals.promptKeySeen === true || promptKeys.some((key) => /^worldinfo/i.test(key))) evidence.push('world-info-prompt-key');
  } else if (targetId === 'memoryBooks') {
    const active = memoryBooks.enabled === true
      || target.diskSignals?.enabled === true
      || countValue(memoryBooks.stMemoryBookEntryCount) > 0;
    const entrySeen = countValue(memoryBooks.stMemoryBookEntryCount) > 0
      || countValue(chatCounts.chatBoundWorld) > 0;
    const metadataSeen = Boolean(memoryBooks.activeBookName)
      || Boolean(memoryBooks.stMemoryBookEntryHash)
      || hasRichDiagnosticStatus(memoryBooks.rangeDiagnostics);
    const markerOrPrompt = countValue(markerCounts.memoryBooksHidden) > 0
      || browserSignals.messageMarkerSeen === true
      || browserSignals.promptKeySeen === true
      || promptKeys.some((key) => /memory/i.test(key))
      || metadataSeen;
    const rangeStatus = memoryBooks.rangeDiagnostics?.status || null;
    const rangeDiagnosticSeen = Boolean(rangeStatus && !['unknown', 'missing'].includes(rangeStatus));
    if (!active || !entrySeen || !markerOrPrompt || !rangeDiagnosticSeen) return [];
    if (countValue(memoryBooks.stMemoryBookEntryCount) > 0) evidence.push('memory-book-entry');
    if (countValue(chatCounts.chatBoundWorld) > 0) evidence.push('memory-book-chat-bound-world');
    if (Boolean(memoryBooks.activeBookName) || Boolean(memoryBooks.stMemoryBookEntryHash)) evidence.push('memory-book-metadata');
    if (countValue(markerCounts.memoryBooksHidden) > 0 || browserSignals.messageMarkerSeen === true) evidence.push('memory-book-visibility-marker');
    if (browserSignals.promptKeySeen === true || promptKeys.some((key) => /memory/i.test(key))) evidence.push('memory-book-prompt-key');
    evidence.push(`memory-book-range-${rangeStatus}`);
  } else if (targetId === 'summaryception') {
    const active = summaryception.enabled === true || target.diskSignals?.enabled === true;
    const promptSeen = browserSignals.promptKeySeen === true || promptKeys.includes('summaryception') || summaryception.promptKeyActive === true;
    const summaryState = countValue(summaryception.layerCount) > 0
      || countValue(summaryception.ghostedCount) > 0
      || countValue(chatCounts.layerCount) > 0
      || countValue(chatCounts.ghostedCount) > 0
      || countValue(markerCounts.summaryceptionGhosted) > 0
      || browserSignals.messageMarkerSeen === true;
    const stalenessStatus = summaryception.staleness?.status || null;
    const stalenessSeen = hasRichDiagnosticStatus(summaryception.staleness);
    if (!active || !promptSeen || !summaryState || !stalenessSeen) return [];
    if (countValue(summaryception.layerCount) > 0 || countValue(chatCounts.layerCount) > 0) evidence.push('summaryception-layer');
    if (countValue(summaryception.ghostedCount) > 0 || countValue(chatCounts.ghostedCount) > 0 || countValue(markerCounts.summaryceptionGhosted) > 0 || browserSignals.messageMarkerSeen === true) evidence.push('summaryception-ghosted-row');
    if (promptSeen) evidence.push('summaryception-prompt-key');
    evidence.push(`summaryception-staleness-${stalenessStatus}`);
  } else if (targetId === 'vectFox') {
    const active = vectFox.enabled === true || target.diskSignals?.enabled === true;
    const promptOrMarker = browserSignals.promptKeySeen === true
      || promptKeys.some((key) => /^3_vectfox/i.test(key))
      || countValue(markerCounts.vectFoxGhosted) > 0
      || browserSignals.messageMarkerSeen === true;
    const settingsOrHook = Boolean(vectFox.backendType)
      || vectFox.generationInterceptorActive === true
      || vectFox.summarizerInjectionEnabled === true
      || vectFox.semanticWorldInfoEnabled === true
      || Boolean(vectFox.settingsHash)
      || Boolean(target.diskSignals?.settingsHash)
      || browserSignals.settingsSeen === true
      || browserSignals.globalSignatureSeen === true;
    const backendStatus = vectFox.backendDiagnostics?.status || null;
    const backendDiagnosticSeen = hasRichDiagnosticStatus(vectFox.backendDiagnostics);
    if (!active || !promptOrMarker || !settingsOrHook || !backendDiagnosticSeen) return [];
    if (browserSignals.promptKeySeen === true || promptKeys.some((key) => /^3_vectfox/i.test(key))) evidence.push('vectfox-prompt-key');
    if (countValue(markerCounts.vectFoxGhosted) > 0 || browserSignals.messageMarkerSeen === true) evidence.push('vectfox-ghosted-row');
    if (settingsOrHook) evidence.push('vectfox-settings-or-hook');
    evidence.push(`vectfox-backend-${backendStatus}`);
  }
  return [...new Set(evidence)];
}

function fixtureTargetLevel(target = {}, evidence = []) {
  const status = target.status || 'unknown';
  if (evidence.length > 0) return 'rich-active';
  if (status === 'browser-confirmed') return 'browser-observed';
  if (status === 'disk-confirmed' || status === 'settings-only') return 'disk-only';
  if (status === 'disabled' || status === 'not-installed') return 'inactive';
  if (status === 'unavailable') return 'unavailable';
  return 'unknown';
}

export function summarizeExternalContextFixtureDepth(probeOrSummary = {}) {
  const users = Array.isArray(probeOrSummary)
    ? probeOrSummary
    : Array.isArray(probeOrSummary?.users)
      ? probeOrSummary.users
      : [];
  const userSummaries = users.map((user) => {
    const targets = Object.fromEntries(EXTERNAL_CONTEXT_FIXTURE_TARGET_IDS.map((targetId) => {
      const target = user.targets?.[targetId] || {};
      const evidence = fixtureTargetEvidence(targetId, target, user.externalPromptEnvironment || {});
      const level = fixtureTargetLevel(target, evidence);
      return [targetId, {
        status: target.status || 'unknown',
        level,
        rich: evidence.length > 0,
        evidence
      }];
    }));
    const richTargets = Object.entries(targets)
      .filter(([, target]) => target.rich)
      .map(([targetId]) => targetId);
    return {
      handle: user.handle || null,
      status: user.status || 'unknown',
      richTargets,
      missingTargets: EXTERNAL_CONTEXT_FIXTURE_TARGET_IDS.filter((targetId) => !targets[targetId].rich),
      fullFixtureDepth: richTargets.length === EXTERNAL_CONTEXT_FIXTURE_TARGET_IDS.length,
      targets
    };
  });
  const targetCoverage = Object.fromEntries(EXTERNAL_CONTEXT_FIXTURE_TARGET_IDS.map((targetId) => {
    const handles = userSummaries
      .filter((user) => user.targets[targetId]?.rich)
      .map((user) => user.handle)
      .filter(Boolean);
    return [targetId, {
      richUserCount: handles.length,
      handles: handles.slice(0, 20)
    }];
  }));
  const fullFixtureUserHandles = userSummaries
    .filter((user) => user.fullFixtureDepth)
    .map((user) => user.handle)
    .filter(Boolean);
  const missingTargets = EXTERNAL_CONTEXT_FIXTURE_TARGET_IDS
    .filter((targetId) => !targetCoverage[targetId]?.richUserCount);
  const anyEvidence = Object.values(targetCoverage).some((entry) => entry.richUserCount > 0);
  const status = fullFixtureUserHandles.length > 0
    ? 'pass'
    : anyEvidence
      ? 'warning'
      : 'missing';
  return {
    kind: 'directive.sillytavern.externalContextFixtureDepth.v1',
    schemaVersion: 1,
    status,
    requiredTargets: [...EXTERNAL_CONTEXT_FIXTURE_TARGET_IDS],
    fullFixtureUserHandles,
    missingTargets,
    targetCoverage,
    users: userSummaries
  };
}

export function externalContextFixtureDepthCheckStatus({
  live = false,
  skipReadiness = false,
  turnLimit = '',
  fixtureDepth = null,
  probeRequired = false,
  fullCertificationRequired = false
} = {}) {
  if (!live && !probeRequired && !fullCertificationRequired) return 'skipped';
  if (skipReadiness) return 'warning';
  if (!fixtureDepth) return live || fullCertificationRequired ? 'fail' : 'warning';
  if (fixtureDepth.status === 'pass') return 'pass';
  if (fullCertificationRequired) return 'fail';
  return 'warning';
}

function promptKeySeen(promptKeys = [], candidates = []) {
  const keys = new Set(unique(promptKeys).map((key) => key.toLowerCase()));
  return candidates.some((candidate) => keys.has(String(candidate).toLowerCase()));
}

function rangeDiagnosticsFromSignals({
  browser = {},
  diskEnvironment = null,
  worlds = null,
  chats = null
} = {}) {
  const browserDiagnostics = browser.memoryBooks?.rangeDiagnostics || null;
  const diskDiagnostics = diskEnvironment?.memoryBooks?.rangeDiagnostics || null;
  const worldDiagnostics = worlds?.stMemoryBookRangeDiagnostics || null;
  const chatDiagnostics = chats?.stMemoryBookRangeDiagnostics || null;
  const entryRangeCount = Number(worldDiagnostics?.entryRangeCount || 0);
  const chatRangeCount = Number(chatDiagnostics?.chatRangeCount || 0);
  const invertedRangeCount = Number(worldDiagnostics?.invertedRangeCount || 0) + Number(chatDiagnostics?.invertedRangeCount || 0);
  const outOfBoundsRangeCount = Number(worldDiagnostics?.outOfBoundsRangeCount || 0) + Number(chatDiagnostics?.outOfBoundsRangeCount || 0);
  const staleRangeCount = Number(worldDiagnostics?.staleRangeCount || 0) + Number(chatDiagnostics?.staleRangeCount || 0);
  const validRangeCount = Number(worldDiagnostics?.validRangeCount || 0) + Number(chatDiagnostics?.validRangeCount || 0);
  const rangeHashParts = [worldDiagnostics?.rangeHash, chatDiagnostics?.rangeHash].filter(Boolean);
  const totalRangeCount = entryRangeCount + chatRangeCount;
  const derivedDiagnostics = {
    status: totalRangeCount
      ? invertedRangeCount > 0 ? 'inverted' : staleRangeCount > 0 || outOfBoundsRangeCount > 0 ? 'stale' : 'valid'
      : 'unknown',
    entryRangeCount,
    chatRangeCount,
    validRangeCount,
    invertedRangeCount,
    outOfBoundsRangeCount,
    staleRangeCount,
    rangeHash: rangeHashParts.length ? objectHash(rangeHashParts) : null
  };
  return selectBestDiagnostic(browserDiagnostics, diskDiagnostics, derivedDiagnostics) || derivedDiagnostics;
}

function summaryceptionStalenessFromSignals({
  browser = {},
  diskEnvironment = null,
  chats = null,
  chatMetadata = {},
  messageMarkers = {},
  chatLength = 0
} = {}) {
  const browserStaleness = browser.summaryception?.staleness || null;
  const diskStaleness = diskEnvironment?.summaryception?.staleness || null;
  const summarizedUpTo = Number(chatMetadata.summaryception?.summarizedUpTo ?? chats?.summaryceptionSummarizedUpTo ?? -1);
  const effectiveChatLength = boundedInteger(chatLength, 0) || boundedInteger(chats?.maxChatLength, 0) || 0;
  const ghostedSystemVisibleCount = Number(messageMarkers.summaryceptionGhostedSystemVisible || chats?.summaryceptionGhostedSystemVisibleCount || 0);
  const ghostedCount = Math.max(
    Number(chatMetadata.summaryception?.ghostedCount || 0),
    Number(messageMarkers.summaryceptionGhosted || 0),
    Number(chats?.summaryceptionGhostedCount || 0)
  );
  const layerCount = Math.max(
    Number(chatMetadata.summaryception?.layerCount || 0),
    Number(chats?.summaryceptionLayerCount || 0)
  );
  const summarizedRangeBeyondChat = summarizedUpTo >= effectiveChatLength && effectiveChatLength > 0;
  const browserOrChatObserved = Boolean(browser.summaryception?.settingsSeen
    || browser.summaryception?.globalSignatureSeen
    || chatMetadata.summaryception
    || messageMarkers.summaryceptionGhosted);
  const derivedStaleness = {
    status: summarizedRangeBeyondChat
      ? 'stale'
      : ghostedSystemVisibleCount > 0
        ? 'ghosted-system-visible'
        : summarizedUpTo >= 0 || layerCount > 0 || ghostedCount > 0
          ? 'observed'
          : 'unknown',
    chatLength: effectiveChatLength,
    summarizedRangeBeyondChat,
    staleAfterMutation: false,
    ghostedSystemVisibleCount,
    summarizedOnlyCount: 0
  };
  return selectBestDiagnostic(
    browserStaleness,
    browserOrChatObserved ? derivedStaleness : null,
    diskStaleness,
    derivedStaleness
  ) || derivedStaleness;
}

function vectFoxBackendDiagnosticsFromSignals({
  browser = {},
  diskEnvironment = null,
  vectfox = null,
  messageMarkers = {},
  disabledPresent = false
} = {}) {
  const browserDiagnostics = browser.vectFox?.backendDiagnostics || null;
  const diskDiagnostics = diskEnvironment?.vectFox?.backendDiagnostics || null;
  const browserBackendType = browser.vectFox?.backendType || null;
  const fallbackBackendType = vectfox?.vector_backend || vectfox?.backendType || diskEnvironment?.vectFox?.backendType || null;
  const unavailable = browser.vectFox?.backendUnavailable === true || vectfox?.backendUnavailable === true || vectfox?.qdrantUnavailable === true;
  const browserObserved = Boolean(browser.vectFox?.settingsSeen
    || browser.vectFox?.globalSignatureSeen
    || browser.vectFox?.enabled === true
    || browser.vectFox?.disabledPresent === true
    || browser.vectFox?.backendType
    || browser.vectFox?.generationInterceptorActive === true
    || messageMarkers.vectFoxGhosted > 0);
  const backendType = browserObserved ? browserBackendType : fallbackBackendType;
  const disabled = browserObserved
    ? browser.vectFox?.disabledPresent === true || browser.vectFox?.enabled === false
    : disabledPresent === true || diskEnvironment?.vectFox?.disabledPresent === true || vectfox?.enabled === false;
  const externalBackend = /qdrant|cloud|remote/i.test(String(backendType || ''));
  const localBackend = /local|fixture/i.test(String(backendType || ''));
  const externalTimingObserved = Boolean(browser.vectFox?.externalTimingObserved || vectfox?.timing?.observed || vectfox?.lastRetrievalLatencyMs || vectfox?.lastInterceptorLatencyMs);
  const derivedDiagnostics = {
    status: disabled
      ? 'disabled'
      : unavailable
        ? 'unavailable'
        : externalBackend
          ? 'external-backend-configured'
          : localBackend
            ? 'local-backend-configured'
            : backendType
              ? 'configured'
              : browser.vectFox?.settingsSeen || browser.vectFox?.globalSignatureSeen || messageMarkers.vectFoxGhosted > 0
                ? 'observed'
                : 'unknown',
    backendType,
    unavailable,
    externalTimingObserved,
    interceptorLatencyMs: boundedInteger(browser.vectFox?.interceptorLatencyMs ?? vectfox?.lastInterceptorLatencyMs),
    retrievalLatencyMs: boundedInteger(browser.vectFox?.retrievalLatencyMs ?? vectfox?.lastRetrievalLatencyMs),
    timingHash: externalTimingObserved
      ? objectHash({
        interceptorLatencyMs: boundedInteger(browser.vectFox?.interceptorLatencyMs ?? vectfox?.lastInterceptorLatencyMs),
        retrievalLatencyMs: boundedInteger(browser.vectFox?.retrievalLatencyMs ?? vectfox?.lastRetrievalLatencyMs)
      })
      : null
  };
  return selectBestDiagnostic(
    browserDiagnostics,
    browserObserved || vectfox ? derivedDiagnostics : null,
    diskDiagnostics,
    derivedDiagnostics
  ) || derivedDiagnostics;
}

function countMessageMarkers(markers = {}, keys = []) {
  return keys.reduce((sum, key) => sum + Math.max(0, Number(markers?.[key] || 0)), 0);
}

function sanitizeUrl(value = null) {
  const text = String(value || '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return text.split(/[?#]/)[0].slice(0, 200) || null;
  }
}

function sanitizePromptKeys(value = []) {
  return unique(value)
    .filter((key) => /^[a-z0-9_.:-]{1,80}$/i.test(key))
    .slice(0, 100);
}

function sanitizeSignalList(value = []) {
  return unique(value)
    .map((signal) => signal.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80))
    .filter(Boolean)
    .slice(0, 50);
}

function resolveSillyTavernDataRoot(dataRoot = '') {
  const candidates = [
    dataRoot,
    process.env.DIRECTIVE_SILLYTAVERN_DATA_ROOT,
    process.env.SILLYTAVERN_DATA_ROOT,
    process.env.ST_DATA_ROOT,
    DEFAULT_SILLYTAVERN_DATA_ROOT
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

export function inspectSillyTavernAuthorNoteCleanliness({
  users = [],
  dataRoot = '',
  required = false,
  scanChats = true,
  sampleLimit = 5
} = {}) {
  const resolvedDataRoot = resolveSillyTavernDataRoot(dataRoot);
  const handles = (users || [])
    .map((entry) => normalizeSoakHandle(typeof entry === 'string' ? entry : entry?.handle || entry?.displayHandle || entry?.user || entry?.username || ''))
    .filter(Boolean);
  if (!resolvedDataRoot) {
    return {
      status: required ? 'fail' : 'warning',
      summary: required
        ? 'SillyTavern data root is required for Author\'s Note cleanliness preflight but could not be resolved.'
        : 'SillyTavern data root could not be resolved; Author\'s Note cleanliness was not verified.',
      dataRoot: null,
      checkedUserCount: 0,
      contaminatedUserCount: 0,
      missingUserCount: handles.length,
      users: handles.map((handle) => ({ handle, status: required ? 'fail' : 'warning', reason: 'data-root-unresolved' }))
    };
  }

  const reports = handles.map((handle) => {
    const userRoot = path.join(resolvedDataRoot, handle);
    const settingsPath = path.join(userRoot, 'settings.json');
    const settings = readJsonFileIfExists(settingsPath);
    const noteDefault = String(settings?.extension_settings?.note?.default || '');
    const chatRoot = path.join(userRoot, 'chats');
    const chatFiles = scanChats
      ? walkFiles(chatRoot, (filePath) => filePath.endsWith('.jsonl'))
      : [];
    const contaminatedChats = [];
    for (const filePath of chatFiles) {
      let prompt = '';
      try {
        const first = JSON.parse(firstJsonLine(filePath) || '{}');
        prompt = String(first?.chat_metadata?.note_prompt || '');
      } catch {
        prompt = '';
      }
      if (prompt.trim()) {
        contaminatedChats.push({
          path: filePath,
          relativePath: path.relative(userRoot, filePath).replace(/\\/g, '/'),
          notePromptLength: prompt.length,
          notePromptHash: sha256Text(prompt)
        });
      }
    }
    const contaminated = Boolean(noteDefault.trim()) || contaminatedChats.length > 0;
    return {
      handle,
      status: !fs.existsSync(userRoot) ? (required ? 'fail' : 'warning') : contaminated ? 'fail' : 'pass',
      userRoot,
      settingsPath,
      settingsFound: Boolean(settings),
      noteDefaultLength: noteDefault.length,
      noteDefaultHash: noteDefault ? sha256Text(noteDefault) : null,
      chatCount: chatFiles.length,
      contaminatedChatCount: contaminatedChats.length,
      samples: contaminatedChats.slice(0, sampleLimit)
    };
  });

  const contaminated = reports.filter((entry) => entry.noteDefaultLength > 0 || entry.contaminatedChatCount > 0);
  const missing = reports.filter((entry) => !fs.existsSync(entry.userRoot));
  const status = contaminated.length || (required && missing.length) ? 'fail' : missing.length ? 'warning' : 'pass';
  return {
    status,
    summary: status === 'pass'
      ? 'Configured SillyTavern soak users have no default Author\'s Note and no active chat note_prompt metadata.'
      : contaminated.length
        ? 'One or more configured SillyTavern soak users still has Author\'s Note contamination in settings or active chats.'
        : 'One or more configured SillyTavern soak users could not be inspected for Author\'s Note cleanliness.',
    dataRoot: resolvedDataRoot,
    checkedUserCount: reports.length,
    contaminatedUserCount: contaminated.length,
    missingUserCount: missing.length,
    users: reports
  };
}

function extensionInstalled(userRoot, extensionName) {
  return fs.existsSync(path.join(userRoot, 'extensions', extensionName));
}

function disabledExtensions(settings = {}) {
  return new Set([
    ...asArray(settings.extensions?.disabledExtensions),
    ...asArray(settings.disabledExtensions),
    ...asArray(settings.extension_settings?.disabledExtensions)
  ].map((value) => String(value || '').toLowerCase()));
}

function scanUserWorldInfo(userRoot) {
  const worldsRoot = path.join(userRoot, 'worlds');
  const worldFiles = walkFiles(worldsRoot, (filePath) => filePath.endsWith('.json'));
  let stMemoryBookEntryCount = 0;
  const stMemoryBookEntryRefs = [];
  const stMemoryBookRangeRefs = [];
  for (const filePath of worldFiles) {
    const data = readJsonFileIfExists(filePath);
    const entries = data?.entries && typeof data.entries === 'object' ? data.entries : {};
    for (const [uid, entry] of Object.entries(entries)) {
      if (entry?.stmemorybooks === true || entry?.extensions?.stmemorybooks === true) {
        const start = boundedInteger(entry.STMB_start ?? entry.extensions?.STMB_start);
        const end = boundedInteger(entry.STMB_end ?? entry.extensions?.STMB_end);
        const hasRange = start !== null || end !== null;
        const inverted = start !== null && end !== null && start > end;
        stMemoryBookEntryCount += 1;
        stMemoryBookEntryRefs.push({
          world: path.basename(filePath, '.json'),
          uid: String(uid),
          titleHash: sha256Text(entry.comment || entry.title || entry.key?.[0] || uid)
        });
        if (hasRange) {
          stMemoryBookRangeRefs.push({
            source: 'world-entry',
            world: path.basename(filePath, '.json'),
            uid: String(uid),
            start: start ?? null,
            end: end ?? null,
            inverted
          });
        }
      }
    }
  }
  const invertedRangeCount = stMemoryBookRangeRefs.filter((entry) => entry.inverted).length;
  const rangeDiagnostics = {
    status: stMemoryBookRangeRefs.length
      ? invertedRangeCount > 0 ? 'inverted' : 'valid'
      : stMemoryBookEntryCount > 0 ? 'missing' : 'unknown',
    entryRangeCount: stMemoryBookRangeRefs.length,
    chatRangeCount: 0,
    validRangeCount: Math.max(0, stMemoryBookRangeRefs.length - invertedRangeCount),
    invertedRangeCount,
    outOfBoundsRangeCount: 0,
    staleRangeCount: 0,
    rangeHash: stMemoryBookRangeRefs.length ? objectHash(stMemoryBookRangeRefs) : null
  };
  return {
    worldFileCount: worldFiles.length,
    stMemoryBookEntryCount,
    stMemoryBookEntryHash: stMemoryBookEntryRefs.length ? objectHash(stMemoryBookEntryRefs) : null,
    stMemoryBookRangeDiagnostics: rangeDiagnostics
  };
}

function scanUserChatMetadata(userRoot) {
  const chatFiles = walkFiles(path.join(userRoot, 'chats'), (filePath) => filePath.endsWith('.jsonl'));
  const chatBoundWorlds = [];
  let summaryceptionGhostedCount = 0;
  let summaryceptionGhostedSystemVisibleCount = 0;
  let summaryceptionLayerCount = 0;
  let summaryceptionSummarizedUpTo = -1;
  let maxChatLength = 0;
  const stMemoryBookRangeRefs = [];
  for (const filePath of chatFiles) {
    const lines = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim())
      : [];
    maxChatLength = Math.max(maxChatLength, lines.length);
    let first = null;
    try {
      first = JSON.parse(lines[0] || firstJsonLine(filePath) || '{}');
    } catch {
      first = null;
    }
    const metadata = first?.chat_metadata || first?.metadata || {};
    if (metadata.world_info) chatBoundWorlds.push(metadata.world_info);
    const stMemoryBooks = metadata.STMemoryBooks || {};
    const sceneStart = boundedInteger(stMemoryBooks.sceneStart);
    const sceneEnd = boundedInteger(stMemoryBooks.sceneEnd);
    if (sceneStart !== null || sceneEnd !== null) {
      stMemoryBookRangeRefs.push({
        source: 'chat-metadata',
        chatHash: sha256Text(path.relative(userRoot, filePath).replace(/\\/g, '/')),
        start: sceneStart ?? null,
        end: sceneEnd ?? null,
        inverted: sceneStart !== null && sceneEnd !== null && sceneStart > sceneEnd,
        outOfBounds: Math.max(sceneStart ?? 0, sceneEnd ?? 0) >= lines.length
      });
    }
    const summaryception = metadata.summaryception;
    if (summaryception && typeof summaryception === 'object') {
      summaryceptionGhostedCount += asArray(summaryception.ghostedIndices).length;
      summaryceptionLayerCount = Math.max(summaryceptionLayerCount, asArray(summaryception.layers).length);
      summaryceptionSummarizedUpTo = Math.max(summaryceptionSummarizedUpTo, Number(summaryception.summarizedUpTo ?? -1) || -1);
    }
    for (const line of lines.slice(1)) {
      let row = null;
      try {
        row = JSON.parse(line);
      } catch {
        row = null;
      }
      if (!row || row.extra?.sc_ghosted !== true) continue;
      summaryceptionGhostedCount += 1;
      if ((row.is_system === true || row.role === 'system') && row.is_hidden !== true) {
        summaryceptionGhostedSystemVisibleCount += 1;
      }
    }
  }
  const invertedRangeCount = stMemoryBookRangeRefs.filter((entry) => entry.inverted).length;
  const outOfBoundsRangeCount = stMemoryBookRangeRefs.filter((entry) => entry.outOfBounds).length;
  const stMemoryBookRangeDiagnostics = {
    status: stMemoryBookRangeRefs.length
      ? invertedRangeCount > 0 ? 'inverted' : outOfBoundsRangeCount > 0 ? 'stale' : 'valid'
      : 'unknown',
    entryRangeCount: 0,
    chatRangeCount: stMemoryBookRangeRefs.length,
    validRangeCount: Math.max(0, stMemoryBookRangeRefs.length - invertedRangeCount - outOfBoundsRangeCount),
    invertedRangeCount,
    outOfBoundsRangeCount,
    staleRangeCount: outOfBoundsRangeCount,
    rangeHash: stMemoryBookRangeRefs.length ? objectHash(stMemoryBookRangeRefs) : null
  };
  const summarizedRangeBeyondChat = summaryceptionSummarizedUpTo >= maxChatLength && maxChatLength > 0;
  const summaryceptionStaleness = {
    status: summarizedRangeBeyondChat
      ? 'stale'
      : summaryceptionGhostedSystemVisibleCount > 0
        ? 'ghosted-system-visible'
        : summaryceptionSummarizedUpTo >= 0 || summaryceptionLayerCount > 0 || summaryceptionGhostedCount > 0
          ? 'observed'
          : 'unknown',
    chatLength: maxChatLength,
    summarizedRangeBeyondChat,
    staleAfterMutation: false,
    ghostedSystemVisibleCount: summaryceptionGhostedSystemVisibleCount,
    summarizedOnlyCount: 0
  };
  return {
    chatFileCount: chatFiles.length,
    chatBoundWorlds: unique(chatBoundWorlds),
    summaryceptionGhostedCount,
    summaryceptionGhostedSystemVisibleCount,
    summaryceptionLayerCount,
    summaryceptionSummarizedUpTo,
    maxChatLength,
    stMemoryBookRangeDiagnostics,
    summaryceptionStaleness
  };
}

export function inspectSillyTavernExternalContextCompatibility({
  users = [],
  dataRoot = '',
  required = false
} = {}) {
  const resolvedDataRoot = resolveSillyTavernDataRoot(dataRoot);
  const handles = (users || [])
    .map((entry) => normalizeSoakHandle(typeof entry === 'string' ? entry : entry?.handle || entry?.displayHandle || entry?.user || entry?.username || ''))
    .filter(Boolean);
  if (!resolvedDataRoot) {
    return {
      status: required ? 'fail' : 'warning',
      summary: required
        ? 'SillyTavern data root is required for external context compatibility preflight but could not be resolved.'
        : 'SillyTavern data root could not be resolved; external context compatibility was not verified.',
      dataRoot: null,
      checkedUserCount: 0,
      users: handles.map((handle) => ({ handle, status: required ? 'fail' : 'warning', reason: 'data-root-unresolved' }))
    };
  }

  const reports = handles.map((handle) => {
    const userRoot = path.join(resolvedDataRoot, handle);
    const settingsPath = path.join(userRoot, 'settings.json');
    const settings = readJsonFileIfExists(settingsPath) || {};
    const extensionSettings = settings.extension_settings || {};
    const disabled = disabledExtensions(settings);
    const worlds = fs.existsSync(userRoot)
      ? scanUserWorldInfo(userRoot)
      : {
        worldFileCount: 0,
        stMemoryBookEntryCount: 0,
        stMemoryBookEntryHash: null,
        stMemoryBookRangeDiagnostics: { status: 'unknown', entryRangeCount: 0, chatRangeCount: 0, validRangeCount: 0, invertedRangeCount: 0, outOfBoundsRangeCount: 0, staleRangeCount: 0, rangeHash: null }
      };
    const chats = fs.existsSync(userRoot)
      ? scanUserChatMetadata(userRoot)
      : {
        chatFileCount: 0,
        chatBoundWorlds: [],
        summaryceptionGhostedCount: 0,
        summaryceptionGhostedSystemVisibleCount: 0,
        summaryceptionLayerCount: 0,
        summaryceptionSummarizedUpTo: -1,
        maxChatLength: 0,
        stMemoryBookRangeDiagnostics: { status: 'unknown', entryRangeCount: 0, chatRangeCount: 0, validRangeCount: 0, invertedRangeCount: 0, outOfBoundsRangeCount: 0, staleRangeCount: 0, rangeHash: null },
        summaryceptionStaleness: { status: 'unknown', chatLength: 0, summarizedRangeBeyondChat: false, staleAfterMutation: false, ghostedSystemVisibleCount: 0, summarizedOnlyCount: 0 }
      };
    const worldInfoSettings = settings.world_info_settings || {};
    const worldInfoSelect = worldInfoSettings.world_info?.globalSelect || worldInfoSettings.world_info?.global_select || [];
    const stmbSettings = extensionSettings.STMemoryBooks?.moduleSettings || {};
    const summaryception = extensionSettings.summaryception || {};
    const vectfox = extensionSettings.vectfox || {};
    const vectFoxDisabled = disabled.has('third-party/vectfox') || disabled.has('vectfox');
    const environment = normalizeExternalPromptEnvironment({
      host: 'sillytavern',
      userHandle: handle,
      status: fs.existsSync(userRoot) ? 'observed' : 'unavailable',
      observedAt: new Date().toISOString(),
      promptKeys: [
        summaryception.enabled ? 'summaryception' : null,
        vectfox.enabled ? '3_vectfox' : null,
        vectfox.summarizer_injection_enabled ? '3_vectfox_summarizer' : null
      ].filter(Boolean),
      worldInfo: {
        installed: true,
        enabled: worlds.worldFileCount > 0 || unique(worldInfoSelect).length > 0 || chats.chatBoundWorlds.length > 0,
        active: unique(worldInfoSelect).length > 0 || chats.chatBoundWorlds.length > 0,
        activeNames: unique(worldInfoSelect),
        chatBoundName: chats.chatBoundWorlds[0] || null,
        settingsHash: objectHash(worldInfoSettings),
        depth: worldInfoSettings.world_info_depth,
        budgetPercent: worldInfoSettings.world_info_budget,
        recursive: worldInfoSettings.world_info_recursive,
        promptPositions: ['before', 'after', 'atDepth']
      },
      memoryBooks: {
        installed: extensionInstalled(userRoot, 'SillyTavern-MemoryBooks') || Boolean(extensionSettings.STMemoryBooks),
        enabled: Boolean(extensionSettings.STMemoryBooks),
        activeBookName: chats.chatBoundWorlds[0] || null,
        entryCount: worlds.stMemoryBookEntryCount,
        entryHash: worlds.stMemoryBookEntryHash,
        rangeDiagnostics: rangeDiagnosticsFromSignals({ worlds, chats }),
        riskyModes: {
          autoSummary: stmbSettings.autoSummaryEnabled === true || stmbSettings.autoSummary?.enabled === true,
          autoCreate: stmbSettings.autoCreateEnabled === true,
          autoHideUnhide: stmbSettings.unhideBeforeMemory === true || stmbSettings.autoHideMode,
          sidePrompts: stmbSettings.sidePromptsEnabled === true || stmbSettings.sidePrompts?.enabled === true,
          atDepthUserOrAssistant: stmbSettings.summaryEntrySettings?.position === 4
        }
      },
      summaryception: {
        installed: extensionInstalled(userRoot, 'Extension-Summaryception') || Boolean(extensionSettings.summaryception),
        enabled: summaryception.enabled === true,
        promptKeyActive: summaryception.enabled === true,
        summarizedUpTo: chats.summaryceptionSummarizedUpTo,
        layerCount: chats.summaryceptionLayerCount,
        ghostedCount: chats.summaryceptionGhostedCount,
        staleness: chats.summaryceptionStaleness || summaryceptionStalenessFromSignals({ chats }),
        injectionHash: summaryception.injectionTemplate ? sha256Text(summaryception.injectionTemplate) : null,
        externalModelCalls: Boolean(summaryception.connectionSource && summaryception.connectionSource !== 'profile')
      },
      vectFox: {
        installed: extensionInstalled(userRoot, 'VectFox') || Boolean(extensionSettings.vectfox),
        enabled: Boolean(vectfox.enabled) && !vectFoxDisabled,
        disabledPresent: Boolean(extensionSettings.vectfox) && vectFoxDisabled,
        promptKeys: ['3_vectfox', '3_vectfox_eventbase', '3_vectfox_summarizer'].filter((key) => key === '3_vectfox' || vectfox.summarizer_injection_enabled),
        position: vectfox.position,
        depth: vectfox.depth,
        backendType: vectfox.vector_backend,
        semanticWorldInfoEnabled: vectfox.enabled_world_info === true,
        summarizerInjectionEnabled: vectfox.summarizer_injection_enabled === true,
        ghostingEnabled: vectfox.eventbase_ghost_enabled === true,
        generationInterceptorActive: Boolean(extensionSettings.vectfox),
        backendDiagnostics: vectFoxBackendDiagnosticsFromSignals({ vectfox, disabledPresent: vectFoxDisabled }),
        settingsHash: objectHash(vectfox),
        qdrant_api_key: vectfox.qdrant_api_key,
        vectorPayload: vectfox.collections
      },
      unknownSignals: fs.existsSync(userRoot) ? [] : ['user-root-missing']
    });
    return {
      handle,
      status: fs.existsSync(userRoot) ? 'pass' : required ? 'fail' : 'warning',
      userRoot,
      settingsFound: Boolean(readJsonFileIfExists(settingsPath)),
      worldFileCount: worlds.worldFileCount,
      chatFileCount: chats.chatFileCount,
      externalPromptEnvironment: environment
    };
  });
  const status = reports.some((entry) => entry.status === 'fail') ? 'fail' : reports.some((entry) => entry.status === 'warning') ? 'warning' : 'pass';
  return {
    status,
    summary: status === 'pass'
      ? 'Configured SillyTavern soak users have redacted external context-extension compatibility snapshots.'
      : 'One or more configured SillyTavern soak users could not be inspected for external context compatibility.',
    dataRoot: resolvedDataRoot,
    checkedUserCount: reports.length,
    users: reports
  };
}

export function buildExternalContextBrowserProbe({
  runId = createRunId(),
  capturedAt = new Date().toISOString(),
  baseUrl = null,
  required = false,
  users = [],
  diskCompatibility = null,
  browserSnapshots = []
} = {}) {
  const diskByHandle = new Map((diskCompatibility?.users || [])
    .map((entry) => [normalizeSoakHandle(entry.handle), entry])
    .filter(([handle]) => Boolean(handle)));
  const snapshotByHandle = new Map((browserSnapshots || [])
    .map((entry) => [normalizeSoakHandle(entry.handle), entry])
    .filter(([handle]) => Boolean(handle)));
  const handles = unique([
    ...(users || []).map((entry) => typeof entry === 'string' ? entry : entry?.handle || entry?.displayHandle),
    ...(diskCompatibility?.users || []).map((entry) => entry.handle),
    ...(browserSnapshots || []).map((entry) => entry.handle)
  ].map(normalizeSoakHandle).filter(Boolean));

  const userReports = handles.map((handle) => {
    const disk = diskByHandle.get(handle) || null;
    const browser = snapshotByHandle.get(handle) || {};
    const browserPromptKeys = sanitizePromptKeys(browser.hostPromptRegistry?.promptKeys || browser.promptKeys || []);
    const chatMetadata = browser.chatMetadata || {};
    const messageMarkers = browser.messageMarkerCounts || {};
    const diskEnvironment = disk?.externalPromptEnvironment || null;
    const unavailableSignals = sanitizeSignalList([
      ...(browser.unavailableSignals || []),
      ...(browser.contextReady === false ? ['browser-context-unavailable'] : []),
      ...(browser.hostPromptRegistry?.available === false ? ['prompt-registry-unavailable'] : [])
    ]);
    const browserRangeDiagnostics = rangeDiagnosticsFromSignals({ browser });
    const combinedRangeDiagnostics = rangeDiagnosticsFromSignals({ browser, diskEnvironment });
    const browserSummaryceptionStaleness = summaryceptionStalenessFromSignals({
      browser,
      chatMetadata,
      messageMarkers,
      chatLength: browser.chatLength
    });
    const combinedSummaryceptionStaleness = summaryceptionStalenessFromSignals({
      browser,
      diskEnvironment,
      chatMetadata,
      messageMarkers,
      chatLength: browser.chatLength
    });
    const browserVectFoxBackendDiagnostics = vectFoxBackendDiagnosticsFromSignals({
      browser,
      messageMarkers
    });
    const combinedVectFoxBackendDiagnostics = vectFoxBackendDiagnosticsFromSignals({
      browser,
      diskEnvironment,
      messageMarkers
    });
    const browserEnvironment = normalizeExternalPromptEnvironment({
      host: 'sillytavern',
      userHandle: handle,
      status: browser.contextReady ? 'observed' : 'unavailable',
      observedAt: capturedAt,
      promptKeys: browserPromptKeys,
      worldInfo: {
        installed: truthy(browser.worldInfo?.installed) || truthy(browser.worldInfo?.settingsSeen) || truthy(browser.worldInfo?.globalSignatureSeen),
        enabled: truthy(browser.worldInfo?.enabled) || Boolean(browser.worldInfo?.activeNames?.length),
        active: truthy(browser.worldInfo?.active) || Boolean(chatMetadata.worldInfo),
        activeNames: browser.worldInfo?.activeNames || [],
        chatBoundName: chatMetadata.worldInfo || null,
        settingsHash: browser.worldInfo?.settingsHash || null,
        depth: browser.worldInfo?.depth,
        budgetPercent: browser.worldInfo?.budgetPercent,
        recursive: browser.worldInfo?.recursive,
        promptPositions: browser.worldInfo?.promptPositions || []
      },
      memoryBooks: {
        installed: truthy(browser.memoryBooks?.installed) || truthy(browser.memoryBooks?.settingsSeen) || truthy(browser.memoryBooks?.globalSignatureSeen),
        enabled: truthy(browser.memoryBooks?.enabled),
        activeBookName: browser.memoryBooks?.activeBookName || null,
        entryCount: browser.memoryBooks?.entryCount,
        entryHash: browser.memoryBooks?.entryHash || null,
        rangeDiagnostics: browserRangeDiagnostics,
        riskyModes: {
          autoSummary: truthy(browser.memoryBooks?.riskyModes?.autoSummary),
          autoCreate: truthy(browser.memoryBooks?.riskyModes?.autoCreate),
          autoHideUnhide: truthy(browser.memoryBooks?.riskyModes?.autoHideUnhide),
          sidePrompts: truthy(browser.memoryBooks?.riskyModes?.sidePrompts),
          atDepthUserOrAssistant: truthy(browser.memoryBooks?.riskyModes?.atDepthUserOrAssistant)
        }
      },
      summaryception: {
        installed: truthy(browser.summaryception?.installed) || truthy(browser.summaryception?.settingsSeen) || truthy(browser.summaryception?.globalSignatureSeen),
        enabled: truthy(browser.summaryception?.enabled),
        promptKeyActive: promptKeySeen(browserPromptKeys, ['summaryception']),
        summarizedUpTo: chatMetadata.summaryception?.summarizedUpTo,
        layerCount: chatMetadata.summaryception?.layerCount,
        ghostedCount: Math.max(Number(chatMetadata.summaryception?.ghostedCount || 0), Number(messageMarkers.summaryceptionGhosted || 0)),
        staleness: browserSummaryceptionStaleness,
        injectionHash: browser.summaryception?.injectionHash || null,
        externalModelCalls: truthy(browser.summaryception?.externalModelCalls)
      },
      vectFox: {
        installed: truthy(browser.vectFox?.installed) || truthy(browser.vectFox?.settingsSeen) || truthy(browser.vectFox?.globalSignatureSeen),
        enabled: truthy(browser.vectFox?.enabled),
        disabledPresent: truthy(browser.vectFox?.disabledPresent),
        promptKeys: sanitizePromptKeys([...(browser.vectFox?.promptKeys || []), ...browserPromptKeys.filter((key) => /^3_vectfox/i.test(key))]),
        position: browser.vectFox?.position,
        depth: browser.vectFox?.depth,
        backendType: browser.vectFox?.backendType || null,
        semanticWorldInfoEnabled: truthy(browser.vectFox?.semanticWorldInfoEnabled),
        summarizerInjectionEnabled: truthy(browser.vectFox?.summarizerInjectionEnabled),
        ghostingEnabled: truthy(browser.vectFox?.ghostingEnabled),
        generationInterceptorActive: truthy(browser.vectFox?.generationInterceptorActive),
        backendDiagnostics: browserVectFoxBackendDiagnostics,
        settingsHash: browser.vectFox?.settingsHash || null,
        qdrant_api_key: browser.vectFox?.qdrant_api_key,
        vectorPayload: browser.vectFox?.vectorPayload
      },
      unknownSignals: unavailableSignals
    });
    const externalPromptEnvironment = normalizeExternalPromptEnvironment({
      host: 'sillytavern',
      userHandle: handle,
      status: browser.contextReady || diskEnvironment ? 'observed' : 'unavailable',
      observedAt: capturedAt,
      promptKeys: browserPromptKeys,
      worldInfo: {
        installed: diskEnvironment?.worldInfo?.installed !== false,
        enabled: truthy(browser.worldInfo?.enabled) || Boolean(browser.worldInfo?.activeNames?.length) || Boolean(diskEnvironment?.worldInfo?.enabled),
        active: truthy(browser.worldInfo?.active) || Boolean(chatMetadata.worldInfo) || Boolean(diskEnvironment?.worldInfo?.active),
        activeNames: browser.worldInfo?.activeNames || diskEnvironment?.worldInfo?.activeNames || [],
        chatBoundName: chatMetadata.worldInfo || diskEnvironment?.worldInfo?.chatBoundName || null,
        settingsHash: browser.worldInfo?.settingsHash || diskEnvironment?.worldInfo?.settingsHash || null,
        depth: browser.worldInfo?.depth ?? diskEnvironment?.worldInfo?.depth,
        budgetPercent: browser.worldInfo?.budgetPercent ?? diskEnvironment?.worldInfo?.budgetPercent,
        recursive: browser.worldInfo?.recursive ?? diskEnvironment?.worldInfo?.recursive,
        promptPositions: browser.worldInfo?.promptPositions || diskEnvironment?.worldInfo?.promptPositions || []
      },
      memoryBooks: {
        installed: truthy(browser.memoryBooks?.installed) || Boolean(diskEnvironment?.memoryBooks?.installed),
        enabled: truthy(browser.memoryBooks?.enabled) || Boolean(diskEnvironment?.memoryBooks?.enabled),
        activeBookName: browser.memoryBooks?.activeBookName || diskEnvironment?.memoryBooks?.activeBookName || null,
        entryCount: browser.memoryBooks?.entryCount ?? diskEnvironment?.memoryBooks?.stMemoryBookEntryCount,
        entryHash: browser.memoryBooks?.entryHash || diskEnvironment?.memoryBooks?.stMemoryBookEntryHash || null,
        rangeDiagnostics: combinedRangeDiagnostics,
        riskyModes: {
          autoSummary: truthy(browser.memoryBooks?.riskyModes?.autoSummary) || Boolean(diskEnvironment?.memoryBooks?.riskyModes?.autoSummary),
          autoCreate: truthy(browser.memoryBooks?.riskyModes?.autoCreate) || Boolean(diskEnvironment?.memoryBooks?.riskyModes?.autoCreate),
          autoHideUnhide: truthy(browser.memoryBooks?.riskyModes?.autoHideUnhide) || Boolean(diskEnvironment?.memoryBooks?.riskyModes?.autoHideUnhide),
          sidePrompts: truthy(browser.memoryBooks?.riskyModes?.sidePrompts) || Boolean(diskEnvironment?.memoryBooks?.riskyModes?.sidePrompts),
          atDepthUserOrAssistant: truthy(browser.memoryBooks?.riskyModes?.atDepthUserOrAssistant) || Boolean(diskEnvironment?.memoryBooks?.riskyModes?.atDepthUserOrAssistant)
        }
      },
      summaryception: {
        installed: truthy(browser.summaryception?.installed) || Boolean(diskEnvironment?.summaryception?.installed),
        enabled: truthy(browser.summaryception?.enabled) || Boolean(diskEnvironment?.summaryception?.enabled),
        promptKeyActive: promptKeySeen(browserPromptKeys, ['summaryception']) || Boolean(diskEnvironment?.summaryception?.promptKeyActive),
        summarizedUpTo: chatMetadata.summaryception?.summarizedUpTo ?? diskEnvironment?.summaryception?.summarizedUpTo,
        layerCount: chatMetadata.summaryception?.layerCount ?? diskEnvironment?.summaryception?.layerCount,
        ghostedCount: Math.max(Number(chatMetadata.summaryception?.ghostedCount || 0), Number(messageMarkers.summaryceptionGhosted || 0), Number(diskEnvironment?.summaryception?.ghostedCount || 0)),
        staleness: combinedSummaryceptionStaleness,
        injectionHash: browser.summaryception?.injectionHash || diskEnvironment?.summaryception?.injectionHash || null,
        externalModelCalls: truthy(browser.summaryception?.externalModelCalls) || Boolean(diskEnvironment?.summaryception?.externalModelCalls)
      },
      vectFox: {
        installed: truthy(browser.vectFox?.installed) || Boolean(diskEnvironment?.vectFox?.installed),
        enabled: truthy(browser.vectFox?.enabled) || Boolean(diskEnvironment?.vectFox?.enabled),
        disabledPresent: truthy(browser.vectFox?.disabledPresent) || Boolean(diskEnvironment?.vectFox?.disabledPresent),
        promptKeys: sanitizePromptKeys([...(browser.vectFox?.promptKeys || []), ...(diskEnvironment?.vectFox?.promptKeys || []), ...browserPromptKeys.filter((key) => /^3_vectfox/i.test(key))]),
        position: browser.vectFox?.position ?? diskEnvironment?.vectFox?.position,
        depth: browser.vectFox?.depth ?? diskEnvironment?.vectFox?.depth,
        backendType: browser.vectFox?.backendType || diskEnvironment?.vectFox?.backendType || null,
        semanticWorldInfoEnabled: truthy(browser.vectFox?.semanticWorldInfoEnabled) || Boolean(diskEnvironment?.vectFox?.semanticWorldInfoEnabled),
        summarizerInjectionEnabled: truthy(browser.vectFox?.summarizerInjectionEnabled) || Boolean(diskEnvironment?.vectFox?.summarizerInjectionEnabled),
        ghostingEnabled: truthy(browser.vectFox?.ghostingEnabled) || Boolean(diskEnvironment?.vectFox?.ghostingEnabled),
        generationInterceptorActive: truthy(browser.vectFox?.generationInterceptorActive) || Boolean(diskEnvironment?.vectFox?.generationInterceptorActive),
        backendDiagnostics: combinedVectFoxBackendDiagnostics,
        settingsHash: browser.vectFox?.settingsHash || diskEnvironment?.vectFox?.settingsHash || null,
        qdrant_api_key: browser.vectFox?.qdrant_api_key,
        vectorPayload: browser.vectFox?.vectorPayload
      },
      unknownSignals: unavailableSignals
    });

    const targets = {
      stLorebooks: {
        status: targetStatus({
          diskInstalled: Boolean(diskEnvironment?.worldInfo?.installed),
          diskEnabled: Boolean(diskEnvironment?.worldInfo?.enabled || diskEnvironment?.worldInfo?.active),
          browserConfirmed: Boolean(browser.worldInfo?.settingsSeen || browser.worldInfo?.globalSignatureSeen || chatMetadata.worldInfo || browser.worldInfo?.activeNames?.length),
          browserUnavailable: unavailableSignals.length > 0
        }),
        diskSignals: {
          installed: Boolean(diskEnvironment?.worldInfo?.installed),
          enabled: Boolean(diskEnvironment?.worldInfo?.enabled || diskEnvironment?.worldInfo?.active),
          settingsHash: diskEnvironment?.worldInfo?.settingsHash || null
        },
        browserSignals: {
          settingsSeen: Boolean(browser.worldInfo?.settingsSeen),
          globalSignatureSeen: Boolean(browser.worldInfo?.globalSignatureSeen),
          promptKeySeen: promptKeySeen(browserPromptKeys, ['worldInfoBefore', 'worldInfoAfter']),
          chatMetadataSeen: Boolean(chatMetadata.worldInfo),
          messageMarkerSeen: false
        },
        promptKeys: browserPromptKeys.filter((key) => /^worldinfo/i.test(key)),
        chatMetadataCounts: { chatBoundWorld: chatMetadata.worldInfo ? 1 : 0 },
        messageMarkerCounts: {},
        unavailableReasons: unavailableSignals
      },
      memoryBooks: {
        status: targetStatus({
          diskInstalled: Boolean(diskEnvironment?.memoryBooks?.installed),
          diskEnabled: Boolean(diskEnvironment?.memoryBooks?.enabled),
          browserConfirmed: Boolean(browser.memoryBooks?.settingsSeen || browser.memoryBooks?.globalSignatureSeen || messageMarkers.memoryBooksHidden > 0),
          browserUnavailable: unavailableSignals.length > 0
        }),
        diskSignals: {
          installed: Boolean(diskEnvironment?.memoryBooks?.installed),
          enabled: Boolean(diskEnvironment?.memoryBooks?.enabled),
          settingsHash: diskEnvironment?.memoryBooks?.stMemoryBookEntryHash || null
        },
        browserSignals: {
          settingsSeen: Boolean(browser.memoryBooks?.settingsSeen),
          globalSignatureSeen: Boolean(browser.memoryBooks?.globalSignatureSeen),
          promptKeySeen: promptKeySeen(browserPromptKeys, ['st_memory_books', 'memorybooks']),
          chatMetadataSeen: Boolean(chatMetadata.worldInfo),
          messageMarkerSeen: Number(messageMarkers.memoryBooksHidden || 0) > 0
        },
        promptKeys: browserPromptKeys.filter((key) => /memory/i.test(key)),
        chatMetadataCounts: { chatBoundWorld: chatMetadata.worldInfo ? 1 : 0 },
        messageMarkerCounts: { memoryBooksHidden: Number(messageMarkers.memoryBooksHidden || 0) },
        unavailableReasons: unavailableSignals
      },
      summaryception: {
        status: targetStatus({
          diskInstalled: Boolean(diskEnvironment?.summaryception?.installed),
          diskEnabled: Boolean(diskEnvironment?.summaryception?.enabled),
          browserConfirmed: Boolean(browser.summaryception?.settingsSeen || browser.summaryception?.globalSignatureSeen || promptKeySeen(browserPromptKeys, ['summaryception']) || chatMetadata.summaryception || messageMarkers.summaryceptionGhosted > 0),
          browserUnavailable: unavailableSignals.length > 0
        }),
        diskSignals: {
          installed: Boolean(diskEnvironment?.summaryception?.installed),
          enabled: Boolean(diskEnvironment?.summaryception?.enabled),
          settingsHash: diskEnvironment?.summaryception?.injectionHash || null
        },
        browserSignals: {
          settingsSeen: Boolean(browser.summaryception?.settingsSeen),
          globalSignatureSeen: Boolean(browser.summaryception?.globalSignatureSeen),
          promptKeySeen: promptKeySeen(browserPromptKeys, ['summaryception']),
          chatMetadataSeen: Boolean(chatMetadata.summaryception),
          messageMarkerSeen: Number(messageMarkers.summaryceptionGhosted || 0) > 0
        },
        promptKeys: browserPromptKeys.filter((key) => key === 'summaryception'),
        chatMetadataCounts: {
          ghostedCount: Number(chatMetadata.summaryception?.ghostedCount || 0),
          layerCount: Number(chatMetadata.summaryception?.layerCount || 0)
        },
        messageMarkerCounts: { summaryceptionGhosted: Number(messageMarkers.summaryceptionGhosted || 0) },
        unavailableReasons: unavailableSignals
      },
      vectFox: {
        status: targetStatus({
          diskInstalled: Boolean(diskEnvironment?.vectFox?.installed),
          diskEnabled: Boolean(diskEnvironment?.vectFox?.enabled),
          diskDisabled: Boolean(diskEnvironment?.vectFox?.disabledPresent || browser.vectFox?.disabledPresent),
          browserConfirmed: Boolean(browser.vectFox?.settingsSeen || browser.vectFox?.globalSignatureSeen || promptKeySeen(browserPromptKeys, ['3_vectfox', '3_vectfox_eventbase', '3_vectfox_summarizer']) || messageMarkers.vectFoxGhosted > 0),
          browserUnavailable: unavailableSignals.length > 0
        }),
        diskSignals: {
          installed: Boolean(diskEnvironment?.vectFox?.installed),
          enabled: Boolean(diskEnvironment?.vectFox?.enabled),
          disabledPresent: Boolean(diskEnvironment?.vectFox?.disabledPresent),
          settingsHash: diskEnvironment?.vectFox?.settingsHash || null
        },
        browserSignals: {
          settingsSeen: Boolean(browser.vectFox?.settingsSeen),
          globalSignatureSeen: Boolean(browser.vectFox?.globalSignatureSeen),
          promptKeySeen: promptKeySeen(browserPromptKeys, ['3_vectfox', '3_vectfox_eventbase', '3_vectfox_summarizer']),
          chatMetadataSeen: Boolean(chatMetadata.vectFox),
          messageMarkerSeen: Number(messageMarkers.vectFoxGhosted || 0) > 0
        },
        promptKeys: browserPromptKeys.filter((key) => /^3_vectfox/i.test(key)),
        chatMetadataCounts: {},
        messageMarkerCounts: { vectFoxGhosted: Number(messageMarkers.vectFoxGhosted || 0) },
        unavailableReasons: unavailableSignals
      }
    };
    const targetStatuses = Object.values(targets).map((target) => target.status);
    const unresolved = targetStatuses.some((entry) => ['disk-confirmed', 'unavailable', 'indeterminate'].includes(entry));
    const status = targetStatuses.every(targetPassStatus)
      ? 'pass'
      : unresolved
        ? (required ? 'fail' : 'warning')
        : 'fail';
    return {
      handle,
      resolvedBrowserUserHandle: browser.resolvedBrowserUserHandle || browser.browserUserHandle || null,
      href: sanitizeUrl(browser.href),
      contextReady: browser.contextReady === true,
      currentChatId: browser.currentChatId || null,
      chatLength: Number(browser.chatLength || 0),
      diskEnvironmentHash: diskEnvironment?.hash || null,
      browserEnvironmentHash: browserEnvironment.hash,
      combinedEnvironmentHash: externalPromptEnvironment.hash,
      externalPromptEnvironment,
      hostPromptRegistry: {
        available: browser.hostPromptRegistry?.available === true,
        promptKeys: browserPromptKeys,
        keyCount: browserPromptKeys.length
      },
      targets,
      unavailableSignals,
      redactions: externalPromptEnvironment.redactions || [],
      status
    };
  });
  const status = userReports.some((entry) => entry.status === 'fail')
    ? 'fail'
    : userReports.some((entry) => entry.status === 'warning')
      ? 'warning'
      : 'pass';
  const fixtureDepth = summarizeExternalContextFixtureDepth({ users: userReports });
  return {
    kind: 'directive.sillytavern.externalContextProbe.v1',
    schemaVersion: 1,
    runId,
    capturedAt,
    mode: 'live-browser-preflight',
    baseUrl: sanitizeUrl(baseUrl),
    required,
    status,
    fixtureDepth,
    users: userReports
  };
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
    hostExtensions: path.join(root, 'host-extensions'),
    externalContextSummary: path.join(root, 'host-extensions', 'external-context-summary.json'),
    storage: path.join(root, 'storage'),
    campaignMatrix: path.join(root, 'campaign-matrix'),
    objectiveAssignments: path.join(root, 'objective-assignments'),
    factChecks: path.join(root, 'fact-checks'),
    factCanaryIndex: path.join(root, 'fact-checks', 'canary-index.json'),
    continuityProjectionMatrix: path.join(root, 'continuity-projection-matrix'),
    qualityReview: path.join(root, 'quality-review'),
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
    paths.hostExtensions,
    paths.storage,
    paths.campaignMatrix,
    paths.objectiveAssignments,
    paths.factChecks,
    paths.continuityProjectionMatrix,
    paths.qualityReview,
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
    'src/runtime/chat-turn-orchestrator.mjs',
    'src/runtime/runtime-ledger-view.mjs',
    'src/runtime/message-reconciler.mjs',
    'src/runtime/repair-runtime.mjs',
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
  const ledgerModulePath = `${normalizeExtensionPath(extensionPath)}/src/runtime/runtime-ledger-view.mjs`;
  return page.evaluate(async ({ modulePath: bridgeModulePath, ledgerModulePath: runtimeLedgerViewModulePath }) => {
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
    let ledgerTools = null;
    try {
      const mod = await import(bridgeModulePath);
      try {
        ledgerTools = await import(runtimeLedgerViewModulePath);
      } catch {
        ledgerTools = null;
      }
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
    const runtimeTracking = view?.campaignState?.runtimeTracking || {};
    const runtimeLedgerView = typeof ledgerTools?.createRuntimeLedgerView === 'function'
      ? ledgerTools.createRuntimeLedgerView(view?.campaignState || {}, { runtimeOverlay: true })
      : null;
    const runtimeCoreProjections = typeof ledgerTools?.readRuntimeCoreProjections === 'function'
      ? ledgerTools.readRuntimeCoreProjections(view?.campaignState || {})
      : {};
    const coreProjection = view?.campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections
      || view?.directiveRuntimeEvidence?.coreStoreReadProjections
      || {};
    const coreRecoveryJournal = Array.isArray(coreProjection.recoveryJournal) ? coreProjection.recoveryJournal : [];
    const runtimeLedgerProofAvailable = runtimeLedgerView?.authoritative === true
      && runtimeLedgerView?.coreProjectionAvailable === true;
    const recoveryJournal = runtimeLedgerProofAvailable && Array.isArray(runtimeLedgerView?.recoveryJournal)
      ? runtimeLedgerView.recoveryJournal
      : coreRecoveryJournal;
    const coreSidecars = [
      ...(Array.isArray(runtimeCoreProjections?.sidecarDiagnostics) ? runtimeCoreProjections.sidecarDiagnostics : []),
      ...(Array.isArray(runtimeCoreProjections?.backgroundBatches) ? runtimeCoreProjections.backgroundBatches : [])
    ];
    const legacyRecoveryCount = Array.isArray(runtimeTracking.recoveryJournal) ? runtimeTracking.recoveryJournal.length : 0;
    const legacySidecarCount = Array.isArray(runtimeTracking.sidecarJournal) ? runtimeTracking.sidecarJournal.length : 0;
    const primaryModelCalls = Array.isArray(view?.chatNative?.modelCalls) ? view.chatNative.modelCalls : [];
    const legacyModelCallTelemetry = Array.isArray(view?.chatNative?.legacyModelCallTelemetry)
      ? view.chatNative.legacyModelCallTelemetry
      : (Array.isArray(runtimeTracking.modelCallJournal) ? runtimeTracking.modelCallJournal : []);
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
      modelCallCount: primaryModelCalls.length,
      modelCallRoles: primaryModelCalls.map((entry) => entry.roleId).filter(Boolean),
      legacyModelCallCount: legacyModelCallTelemetry.length,
      legacyModelCallRoles: legacyModelCallTelemetry.map((entry) => entry.roleId).filter(Boolean),
      sidecarCount: coreSidecars.length,
      legacySidecarCount,
      recoveryCount: recoveryJournal.length,
      legacyRecoveryCount,
      coreRecoveryCount: coreRecoveryJournal.length,
      latestCoreRecovery: clone(coreRecoveryJournal.at(-1) || null),
      recentCoreRecoveryJournal: clone(coreRecoveryJournal.slice(-5)),
      runtimeLedgerView: runtimeLedgerView ? {
        coreProjectionAvailable: runtimeLedgerView.coreProjectionAvailable === true,
        authoritative: runtimeLedgerView.authoritative === true,
        ingressCount: Array.isArray(runtimeLedgerView.ingressLedger) ? runtimeLedgerView.ingressLedger.length : 0,
        responseCount: Array.isArray(runtimeLedgerView.responseLedger) ? runtimeLedgerView.responseLedger.length : 0,
        recoveryCount: Array.isArray(runtimeLedgerView.recoveryJournal) ? runtimeLedgerView.recoveryJournal.length : 0
      } : null,
      sceneReconciliation: clone(view?.campaignState?.sceneReconciliation || null),
      commandLogCount: view?.campaignState?.commandLog?.entries?.length || 0,
      turnLedgerCount: view?.campaignState?.turnLedger?.entries?.length || 0,
      promptInspection: clone(view?.promptInspection || null),
      campaign: {
        id: view?.campaignState?.campaign?.id || null,
        title: view?.campaignState?.campaign?.title || null,
        status: view?.campaignState?.campaign?.status || null
      }
    };
  }, { modulePath, ledgerModulePath });
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
