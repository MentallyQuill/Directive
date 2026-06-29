const EXTERNAL_CONTEXT_KIND = 'directive.externalPromptEnvironment.v1';
const TURN_SOURCE_FRAME_KIND = 'directive.turnSourceFrame.v1';

const SECRET_KEY_PATTERN = /(?:api[_-]?key|secret|token|password|credential|authorization|qdrant[_-]?api[_-]?key)/i;
const RAW_PAYLOAD_KEY_PATTERN = /(?:rawPrompt|promptBody|promptText|rawPromptBody|promptSnapshot|responseSnapshot|rawResponse|rawVector|vectorPayload|embedding|embeddings|rawText|rawContent|rawSummary|rawPlayerText|rawCheckpointText|messageText|textPreview|promptContent|checkpointText|narrationRawText)/i;
const ARCHITECTURE_SOURCE_TOKEN_KEY_PATTERN = /^(?:sourceToken|turnSourceToken)$/i;
const ARCHITECTURE_SOURCE_TOKEN_VALUE_PATTERN = /^(?:turnSourceFrame|ingress):[A-Za-z0-9_.:-]+$/;

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function asBoolean(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function asNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function asTimestampMs(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && !value.trim()) return fallback;
  const number = asNumber(value);
  if (Number.isFinite(number)) return number;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asInteger(value, fallback = 0) {
  const number = asNumber(value, fallback);
  return Math.max(0, Math.trunc(number));
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = asString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function compactObject(value) {
  const out = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (item === undefined) continue;
    out[key] = item;
  }
  return out;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function sortedJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedJsonValue(value[key])])
  );
}

export function stableJsonStringify(value) {
  return JSON.stringify(sortedJsonValue(value));
}

function utf8Bytes(value) {
  const text = String(value ?? '');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8');
  const encoded = unescape(encodeURIComponent(text));
  const bytes = new Uint8Array(encoded.length);
  for (let index = 0; index < encoded.length; index += 1) {
    bytes[index] = encoded.charCodeAt(index);
  }
  return bytes;
}

function rightRotate(value, bits) {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(value) {
  const bytes = utf8Bytes(value);
  const bitLengthHigh = Math.floor(bytes.length / 0x20000000);
  const bitLengthLow = (bytes.length << 3) >>> 0;
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6);
  const words = new Uint32Array(paddedLength >> 2);
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] |= bytes[index] << (24 - ((index % 4) * 8));
  }
  words[bytes.length >> 2] |= 0x80 << (24 - ((bytes.length % 4) * 8));
  words[words.length - 2] = bitLengthHigh;
  words[words.length - 1] = bitLengthLow;

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ]);
  const constants = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < words.length; offset += 16) {
    for (let index = 0; index < 16; index += 1) schedule[index] = words[offset + index];
    for (let index = 16; index < 64; index += 1) {
      const s0 = rightRotate(schedule[index - 15], 7) ^ rightRotate(schedule[index - 15], 18) ^ (schedule[index - 15] >>> 3);
      const s1 = rightRotate(schedule[index - 2], 17) ^ rightRotate(schedule[index - 2], 19) ^ (schedule[index - 2] >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + constants[index] + schedule[index]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, '0')).join('');
}

export function stableJsonByteLength(value) {
  return utf8Bytes(stableJsonStringify(value)).length;
}

export function hashStableJson(value) {
  return sha256Hex(stableJsonStringify(value));
}

export function isDirectivePromptKey(key) {
  return /^directive\./.test(String(key || ''));
}

export function isExternalPromptKey(key) {
  const text = asString(key);
  return Boolean(text && !isDirectivePromptKey(text));
}

function isArchitectureSourceToken(key, value) {
  if (!ARCHITECTURE_SOURCE_TOKEN_KEY_PATTERN.test(String(key || ''))) return false;
  if (value === null || value === undefined) return true;
  const text = asString(value);
  return Boolean(text && ARCHITECTURE_SOURCE_TOKEN_VALUE_PATTERN.test(text));
}

export function redactExternalDiagnostic(value, redactions = []) {
  if (Array.isArray(value)) {
    return value.map((item) => redactExternalDiagnostic(item, redactions));
  }
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) && !isArchitectureSourceToken(key, item)) {
      out[key] = '[redacted-secret]';
      redactions.push({ key, reason: 'secret' });
      continue;
    }
    if (RAW_PAYLOAD_KEY_PATTERN.test(key)) {
      out[key] = '[redacted-raw-payload]';
      redactions.push({ key, reason: 'raw-payload' });
      continue;
    }
    out[key] = redactExternalDiagnostic(item, redactions);
  }
  return out;
}

function normalizeWorldInfo(input = {}) {
  return compactObject({
    installed: asBoolean(input.installed, true),
    enabled: asBoolean(input.enabled, false),
    active: asBoolean(input.active, asBoolean(input.enabled, false)),
    activeNames: uniqueStrings(input.activeNames || input.names || input.worldNames),
    chatBoundName: asString(input.chatBoundName || input.chatBound || input.chatMetadataWorldInfo),
    settingsHash: asString(input.settingsHash),
    depth: asNumber(input.depth),
    budgetPercent: asNumber(input.budgetPercent ?? input.budget),
    recursive: input.recursive === undefined ? undefined : asBoolean(input.recursive),
    promptPositions: uniqueStrings(input.promptPositions || input.positions)
  });
}

function normalizeMemoryBooks(input = {}) {
  const riskyModes = compactObject({
    autoSummary: asBoolean(input.riskyModes?.autoSummary ?? input.autoSummary, false),
    autoCreate: asBoolean(input.riskyModes?.autoCreate ?? input.autoCreate, false),
    autoHideUnhide: asBoolean(input.riskyModes?.autoHideUnhide ?? input.autoHideUnhide, false),
    sidePrompts: asBoolean(input.riskyModes?.sidePrompts ?? input.sidePrompts, false),
    atDepthUserOrAssistant: asBoolean(input.riskyModes?.atDepthUserOrAssistant ?? input.atDepthUserOrAssistant, false)
  });
  const rangeInput = input.rangeDiagnostics || input.rangeStatus || {};
  const rangeDiagnostics = compactObject({
    status: asString(rangeInput.status || input.rangeStatus, 'unknown'),
    entryRangeCount: asInteger(rangeInput.entryRangeCount ?? input.entryRangeCount, 0),
    chatRangeCount: asInteger(rangeInput.chatRangeCount ?? input.chatRangeCount, 0),
    validRangeCount: asInteger(rangeInput.validRangeCount ?? input.validRangeCount, 0),
    invertedRangeCount: asInteger(rangeInput.invertedRangeCount ?? input.invertedRangeCount, 0),
    outOfBoundsRangeCount: asInteger(rangeInput.outOfBoundsRangeCount ?? input.outOfBoundsRangeCount, 0),
    staleRangeCount: asInteger(rangeInput.staleRangeCount ?? input.staleRangeCount, 0),
    rangeHash: asString(rangeInput.rangeHash || input.rangeHash)
  });
  return compactObject({
    installed: asBoolean(input.installed, false),
    enabled: asBoolean(input.enabled, false),
    activeBookName: asString(input.activeBookName || input.activeBook || input.chatBoundName),
    stMemoryBookEntryCount: asInteger(input.stMemoryBookEntryCount ?? input.entryCount, 0),
    stMemoryBookEntryHash: asString(input.stMemoryBookEntryHash || input.entryHash),
    rangeDiagnostics,
    riskyModes
  });
}

function normalizeSummaryception(input = {}) {
  const stalenessInput = input.staleness || input.visibilityDiagnostics || {};
  const staleness = compactObject({
    status: asString(stalenessInput.status || input.stalenessStatus, 'unknown'),
    chatLength: asInteger(stalenessInput.chatLength ?? input.chatLength, 0),
    summarizedRangeBeyondChat: asBoolean(stalenessInput.summarizedRangeBeyondChat ?? input.summarizedRangeBeyondChat, false),
    staleAfterMutation: asBoolean(stalenessInput.staleAfterMutation ?? input.staleAfterMutation, false),
    ghostedSystemVisibleCount: asInteger(stalenessInput.ghostedSystemVisibleCount ?? input.ghostedSystemVisibleCount, 0),
    summarizedOnlyCount: asInteger(stalenessInput.summarizedOnlyCount ?? input.summarizedOnlyCount, 0)
  });
  return compactObject({
    installed: asBoolean(input.installed, false),
    enabled: asBoolean(input.enabled, false),
    promptKey: asString(input.promptKey, 'summaryception'),
    promptKeyActive: asBoolean(input.promptKeyActive, false),
    summarizedUpTo: asNumber(input.summarizedUpTo, -1),
    layerCount: asInteger(input.layerCount, 0),
    ghostedCount: asInteger(input.ghostedCount, 0),
    staleness,
    injectionHash: asString(input.injectionHash),
    externalModelCalls: asBoolean(input.externalModelCalls, false)
  });
}

function normalizeVectFox(input = {}) {
  const backendInput = input.backendDiagnostics || {};
  const backendDiagnostics = compactObject({
    status: asString(backendInput.status || input.backendStatus, input.disabledPresent ? 'disabled' : input.backendType || input.vectorBackend || input.backend ? 'configured' : 'unknown'),
    backendType: asString(backendInput.backendType || input.backendType || input.vectorBackend || input.backend),
    unavailable: asBoolean(backendInput.unavailable ?? input.backendUnavailable, false),
    externalTimingObserved: asBoolean(backendInput.externalTimingObserved ?? input.externalTimingObserved, false),
    interceptorLatencyMs: asNumber(backendInput.interceptorLatencyMs ?? input.interceptorLatencyMs),
    retrievalLatencyMs: asNumber(backendInput.retrievalLatencyMs ?? input.retrievalLatencyMs),
    timingHash: asString(backendInput.timingHash || input.timingHash)
  });
  return compactObject({
    installed: asBoolean(input.installed, false),
    enabled: asBoolean(input.enabled, false),
    disabledPresent: asBoolean(input.disabledPresent, false),
    promptKeys: uniqueStrings(input.promptKeys),
    position: asNumber(input.position),
    depth: asNumber(input.depth),
    backendType: asString(input.backendType || input.vectorBackend || input.backend),
    semanticWorldInfoEnabled: asBoolean(input.semanticWorldInfoEnabled, false),
    summarizerInjectionEnabled: asBoolean(input.summarizerInjectionEnabled, false),
    ghostingEnabled: asBoolean(input.ghostingEnabled, false),
    generationInterceptorActive: asBoolean(input.generationInterceptorActive, false),
    backendDiagnostics,
    settingsHash: asString(input.settingsHash)
  });
}

function isKnownExternalContextPromptKey(key) {
  const text = String(key || '').trim();
  return /^summaryception$/i.test(text)
    || /^3_vectfox/i.test(text)
    || /^worldInfoBefore$/i.test(text)
    || /^worldInfoAfter$/i.test(text)
    || /^customDepthWI_/i.test(text)
    || /^customWIOutlet_/i.test(text)
    || /author.?note/i.test(text)
    || /^2_floating_prompt$/i.test(text)
    || /example/i.test(text);
}

function normalizeUnknownExternalContext(input = {}) {
  const promptKeys = uniqueStrings(input.promptKeys || input.keys).filter(isExternalPromptKey);
  const promptKeyPrefixes = uniqueStrings(input.promptKeyPrefixes || promptKeys.map((key) => {
    const text = String(key || '').trim();
    const match = text.match(/^(@?[A-Za-z0-9_-]+)/);
    return match ? match[1] : 'unknown';
  }));
  const promptKeyHash = asString(input.promptKeyHash)
    || (promptKeys.length ? hashStableJson(promptKeys) : null);
  const promptKeyPrefixHash = asString(input.promptKeyPrefixHash)
    || (promptKeyPrefixes.length ? hashStableJson(promptKeyPrefixes) : null);
  const visibilityMarkerCount = asInteger(input.visibilityMarkerCount, 0);
  const status = asString(
    input.status,
    promptKeys.length || visibilityMarkerCount > 0 ? 'observed' : 'none'
  );
  return compactObject({
    status,
    promptKeyCount: asInteger(input.promptKeyCount ?? promptKeys.length, promptKeys.length),
    promptKeyPrefixes,
    promptKeyHash,
    promptKeyPrefixHash,
    visibilityMarkerCount,
    redactionReason: asString(input.redactionReason, promptKeys.length ? 'prompt-key-hash-only' : null)
  });
}

function diagnosticStatusFor(target, value = {}) {
  if (target === 'stLorebooks') {
    if (value.active) return 'active';
    if (value.enabled) return 'enabled';
    if (value.installed) return 'installed';
    return 'unknown';
  }
  if (target === 'memoryBooks') {
    if (value.rangeDiagnostics?.status) return value.rangeDiagnostics.status;
    if (value.enabled) return 'enabled';
    if (value.installed) return 'installed';
    return 'unknown';
  }
  if (target === 'summaryception') {
    if (value.staleness?.status) return value.staleness.status;
    if (value.promptKeyActive) return 'prompt-key-active';
    if (value.enabled) return 'enabled';
    if (value.installed) return 'installed';
    return 'unknown';
  }
  if (target === 'vectFox') {
    if (value.backendDiagnostics?.status) return value.backendDiagnostics.status;
    if (value.enabled) return 'enabled';
    if (value.disabledPresent) return 'disabled';
    if (value.installed) return 'installed';
    return 'unknown';
  }
  if (target === 'unknownExternalContext') {
    return asString(value.status, value.promptKeyCount > 0 ? 'observed' : 'none');
  }
  return 'unknown';
}

function diagnosticLayerFor(target) {
  if (target === 'vectFox') return 'modelVisibleGenerationEnvironment';
  if (target === 'unknownExternalContext') return 'hostFinalPromptComposition';
  return 'hostFinalPromptComposition';
}

function diagnosticEvidenceFor(target, value = {}) {
  if (target === 'stLorebooks') {
    return {
      active: value.active === true,
      enabled: value.enabled === true,
      activeNameCount: Array.isArray(value.activeNames) ? value.activeNames.length : 0,
      chatBound: Boolean(value.chatBoundName),
      settingsHash: value.settingsHash || null,
      promptPositions: value.promptPositions || []
    };
  }
  if (target === 'memoryBooks') {
    return {
      enabled: value.enabled === true,
      entryCount: value.stMemoryBookEntryCount || 0,
      entryHash: value.stMemoryBookEntryHash || null,
      rangeDiagnostics: value.rangeDiagnostics || {},
      riskyModes: value.riskyModes || {}
    };
  }
  if (target === 'summaryception') {
    return {
      enabled: value.enabled === true,
      promptKeyActive: value.promptKeyActive === true,
      layerCount: value.layerCount || 0,
      ghostedCount: value.ghostedCount || 0,
      staleness: value.staleness || {},
      injectionHash: value.injectionHash || null,
      externalModelCalls: value.externalModelCalls === true
    };
  }
  if (target === 'vectFox') {
    return {
      enabled: value.enabled === true,
      disabledPresent: value.disabledPresent === true,
      promptKeyCount: Array.isArray(value.promptKeys) ? value.promptKeys.length : 0,
      backendType: value.backendType || null,
      semanticWorldInfoEnabled: value.semanticWorldInfoEnabled === true,
      summarizerInjectionEnabled: value.summarizerInjectionEnabled === true,
      ghostingEnabled: value.ghostingEnabled === true,
      generationInterceptorActive: value.generationInterceptorActive === true,
      backendDiagnostics: value.backendDiagnostics || {},
      settingsHash: value.settingsHash || null
    };
  }
  if (target === 'unknownExternalContext') {
    return {
      status: value.status || 'none',
      promptKeyCount: value.promptKeyCount || 0,
      promptKeyPrefixHash: value.promptKeyPrefixHash || null,
      promptKeyHash: value.promptKeyHash || null,
      visibilityMarkerCount: value.visibilityMarkerCount || 0,
      redactionReason: value.redactionReason || null
    };
  }
  return {};
}

function buildExternalPromptDiagnostics({
  worldInfo = {},
  memoryBooks = {},
  summaryception = {},
  vectFox = {},
  unknownExternalContext = {},
  source = 'sillytavern-observer',
  mergeSource = 'single-observation'
} = {}) {
  return [
    ['stLorebooks', worldInfo],
    ['memoryBooks', memoryBooks],
    ['summaryception', summaryception],
    ['vectFox', vectFox],
    ['unknownExternalContext', unknownExternalContext]
  ].map(([target, value]) => {
    const evidence = diagnosticEvidenceFor(target, value);
    return {
      kind: 'directive.externalPromptEnvironmentDiagnostic.v1',
      schemaVersion: 1,
      layer: diagnosticLayerFor(target),
      target,
      status: diagnosticStatusFor(target, value),
      source,
      mergeSource,
      evidenceHash: hashStableJson(evidence),
      authority: {
        directiveAuthority: false,
        role: 'diagnostics-provenance-only'
      },
      rawContentCaptured: false
    };
  });
}

export function normalizeExternalPromptEnvironment(input = {}) {
  const redactions = [];
  const sanitized = redactExternalDiagnostic(input, redactions);
  const promptKeys = uniqueStrings(sanitized.promptKeys || sanitized.hostPromptKeys);
  const worldInfo = normalizeWorldInfo(sanitized.worldInfo || sanitized.stWorldInfo || {});
  const memoryBooks = normalizeMemoryBooks(sanitized.memoryBooks || sanitized.stMemoryBooks || {});
  const summaryception = normalizeSummaryception(sanitized.summaryception || {});
  const vectFox = normalizeVectFox(sanitized.vectFox || sanitized.vectfox || {});
  const knownExternalPromptKeys = uniqueStrings([
    ...promptKeys.filter(isExternalPromptKey),
    summaryception.promptKeyActive ? summaryception.promptKey : null,
    ...vectFox.promptKeys
  ]).filter(isExternalPromptKey);
  const unknownPromptKeys = knownExternalPromptKeys.filter((key) => !isKnownExternalContextPromptKey(key));
  const unknownExternalContext = normalizeUnknownExternalContext({
    promptKeys: unknownPromptKeys,
    ...(sanitized.unknownExternalContext || {})
  });
  const diagnostics = buildExternalPromptDiagnostics({
    worldInfo,
    memoryBooks,
    summaryception,
    vectFox,
    unknownExternalContext,
    source: asString(sanitized.diagnosticSource || sanitized.source, 'sillytavern-observer'),
    mergeSource: asString(sanitized.mergeSource, 'single-observation')
  });

  const environment = compactObject({
    kind: EXTERNAL_CONTEXT_KIND,
    schemaVersion: 1,
    host: asString(sanitized.host, 'unknown'),
    userHandle: asString(sanitized.userHandle || sanitized.user),
    chatId: asString(sanitized.chatId),
    saveId: asString(sanitized.saveId),
    campaignId: asString(sanitized.campaignId),
    observedAt: asString(sanitized.observedAt),
    status: asString(sanitized.status, 'observed'),
    worldInfo,
    memoryBooks,
    summaryception,
    vectFox,
    unknownExternalContext,
    diagnostics,
    knownExternalPromptKeys,
    unknownSignals: uniqueStrings(sanitized.unknownSignals || sanitized.unavailableSignals),
    redactions
  });
  environment.hash = hashStableJson({
    ...environment,
    hash: undefined,
    byteLength: undefined,
    observedAt: undefined
  });
  environment.byteLength = stableJsonByteLength(environment);
  return environment;
}

export function collectExternalPromptKeys(environment = {}) {
  return uniqueStrings([
    ...(environment.knownExternalPromptKeys || []),
    ...(environment.summaryception?.promptKeyActive ? [environment.summaryception.promptKey] : []),
    ...(environment.vectFox?.promptKeys || [])
  ]).filter(isExternalPromptKey);
}

export function createExternalPromptEnvironmentRef(environment = {}) {
  const normalized = environment.kind === EXTERNAL_CONTEXT_KIND
    ? environment
    : normalizeExternalPromptEnvironment(environment);
  return {
    kind: 'directive.externalPromptEnvironmentRef.v1',
    schemaVersion: 1,
    hash: normalized.hash,
    byteLength: normalized.byteLength,
    status: normalized.status,
    observedAt: normalized.observedAt || null,
    knownExternalPromptKeys: collectExternalPromptKeys(normalized)
  };
}

function numericIndexSet(values = []) {
  const set = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 0) set.add(number);
  }
  return set;
}

function indexIn(values, index) {
  return Number.isInteger(index) && numericIndexSet(values).has(index);
}

function indexList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0);
}

function firstInteger(values = []) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 0) return number;
  }
  return null;
}

function normalizeIndexRange(value) {
  if (Array.isArray(value)) {
    const start = firstInteger([value[0]]);
    const end = firstInteger([value[1]]);
    if (start === null || end === null) return null;
    return { start: Math.min(start, end), end: Math.max(start, end) };
  }
  if (!value || typeof value !== 'object') return null;
  const start = firstInteger([
    value.start,
    value.startIndex,
    value.from,
    value.first,
    value.min
  ]);
  const end = firstInteger([
    value.end,
    value.endIndex,
    value.to,
    value.last,
    value.max
  ]);
  if (start === null || end === null) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function indexRanges(value) {
  const source = Array.isArray(value) ? value : [];
  const ranges = [];
  for (const item of source) {
    const range = normalizeIndexRange(item);
    if (range) ranges.push(range);
  }
  return ranges;
}

function indexInRanges(ranges = [], index = null) {
  if (!Number.isInteger(index)) return false;
  return ranges.some((range) => index >= range.start && index <= range.end);
}

function metadataVisibility(input = {}) {
  const metadata = input.chatMetadata || input.chat_metadata || {};
  const visibilityMap = input.visibilityMap || metadata.directiveVisibility || metadata.visibilityMap || {};
  const summaryception = metadata.summaryception || {};
  const memoryBooks = metadata.memoryBooks || metadata.stMemoryBooks || metadata.STMemoryBooks || {};
  const vectFox = metadata.vectFox || metadata.vectfox || metadata.VectFox || {};
  return {
    summaryceptionGhostedIndices: [
      ...indexList(summaryception.ghostedIndices),
      ...indexList(visibilityMap.summaryceptionGhostedIndices)
    ],
    summaryceptionSummarizedUpTo: asNumber(summaryception.summarizedUpTo, -1),
    summaryceptionSummarizedRanges: [
      ...indexRanges(summaryception.summarizedRanges),
      ...indexRanges(summaryception.summaryRanges),
      ...indexRanges(visibilityMap.summaryceptionSummarizedRanges),
      ...indexRanges(visibilityMap.summaryceptionSummaryRanges)
    ],
    memoryBooksHiddenIndices: [
      ...indexList(memoryBooks.hiddenIndices),
      ...indexList(memoryBooks.autoHiddenIndices),
      ...indexList(visibilityMap.memoryBooksHiddenIndices)
    ],
    memoryBooksUnhiddenIndices: [
      ...indexList(memoryBooks.unhiddenIndices),
      ...indexList(memoryBooks.autoUnhiddenIndices),
      ...indexList(visibilityMap.memoryBooksUnhiddenIndices)
    ],
    vectFoxGhostedIndices: [
      ...indexList(vectFox.ghostedIndices),
      ...indexList(vectFox.eventbaseGhostedIndices),
      ...indexList(vectFox.promptExcludedIndices),
      ...indexList(visibilityMap.vectFoxGhostedIndices),
      ...indexList(visibilityMap.vectFoxPromptExcludedIndices)
    ],
    nativeHiddenIndices: [
      ...indexList(visibilityMap.nativeHiddenIndices),
      ...indexList(visibilityMap.hostHiddenIndices)
    ],
    deletedIndices: [
      ...indexList(visibilityMap.deletedIndices),
      ...indexList(visibilityMap.sourceDeletedIndices)
    ]
  };
}

export function normalizeHostMessageVisibility(message = {}, input = {}) {
  const extra = message.extra || {};
  const index = Number.isInteger(input.index) ? input.index : asNumber(input.index);
  const visibility = metadataVisibility(input);
  const summaryceptionGhostedByMetadata = indexIn(visibility.summaryceptionGhostedIndices, index);
  const summaryceptionSummarizedByUpTo = Number.isInteger(index)
    && Number.isFinite(visibility.summaryceptionSummarizedUpTo)
    && visibility.summaryceptionSummarizedUpTo >= 0
    && index <= visibility.summaryceptionSummarizedUpTo;
  const summaryceptionSummarizedByRange = indexInRanges(visibility.summaryceptionSummarizedRanges, index);
  const summaryceptionSummarized = summaryceptionSummarizedByUpTo || summaryceptionSummarizedByRange;
  const summaryceptionGhosted = Boolean(extra.sc_ghosted || extra.summaryception?.ghosted || summaryceptionGhostedByMetadata);
  const vectFoxPromptGhosted = Boolean(
    extra.vectfox_prompt_ghosted
    || extra.vectfoxGhosted
    || extra.vectfox?.promptGhosted
    || extra.vectfox?.promptExcluded
    || extra.eventbase_ghosted
    || indexIn(visibility.vectFoxGhostedIndices, index)
  );
  const memoryBooksUnhidden = Boolean(extra.stmb_unhidden || extra.memoryBooks?.unhidden || indexIn(visibility.memoryBooksUnhiddenIndices, index));
  const memoryBooksHiddenRaw = Boolean(extra.stmb_hidden || extra.memoryBooks?.hidden || indexIn(visibility.memoryBooksHiddenIndices, index));
  const memoryBooksHidden = memoryBooksHiddenRaw && !memoryBooksUnhidden;
  const memoryBooksVisibilityMutation = memoryBooksHidden || memoryBooksUnhidden;
  const hiddenByHostMetadata = indexIn(visibility.nativeHiddenIndices, index);
  const hiddenByHost = Boolean(message.is_hidden || message.hidden || hiddenByHostMetadata);
  const hiddenByExternal = summaryceptionGhosted || vectFoxPromptGhosted || memoryBooksHidden;
  const sourceMutation = Boolean(message.deleted || message.is_deleted || extra.directive?.deleted || indexIn(visibility.deletedIndices, index));
  const hiddenReasons = uniqueStrings([
    hiddenByHost ? 'host-hidden' : null,
    summaryceptionGhosted ? 'summaryception-ghosted' : null,
    vectFoxPromptGhosted ? 'vectfox-prompt-ghosted' : null,
    memoryBooksHidden ? 'memory-books-hidden' : null
  ]);
  const sourceMutationReasons = uniqueStrings([
    message.deleted || message.is_deleted ? 'host-delete' : null,
    extra.directive?.deleted ? 'directive-delete' : null,
    indexIn(visibility.deletedIndices, index) ? 'metadata-delete' : null
  ]);
  const visibilityMutationReasons = uniqueStrings([
    ...hiddenReasons,
    memoryBooksUnhidden ? 'memory-books-unhidden' : null
  ]);
  const visibilityMutation = hiddenByHost || hiddenByExternal || memoryBooksVisibilityMutation;
  return {
    kind: 'directive.hostMessageVisibility.v1',
    sourceRowExists: true,
    hiddenByHost,
    hiddenByExternal,
    ghostedBySummaryception: summaryceptionGhosted,
    ghostedBySummaryceptionMetadata: summaryceptionGhostedByMetadata,
    summarizedBySummaryception: summaryceptionSummarized,
    summarizedBySummaryceptionUpTo: summaryceptionSummarizedByUpTo,
    summarizedBySummaryceptionRange: summaryceptionSummarizedByRange,
    summaryceptionSummarizedUpTo: visibility.summaryceptionSummarizedUpTo,
    summaryceptionSummarizedRanges: visibility.summaryceptionSummarizedRanges,
    ghostedByVectFox: vectFoxPromptGhosted,
    promptExcludedByVectFox: vectFoxPromptGhosted,
    hiddenByHostMetadata,
    hiddenByMemoryBooks: memoryBooksHidden,
    hiddenByMemoryBooksBeforeUnhide: memoryBooksHiddenRaw,
    unhiddenByMemoryBooks: memoryBooksUnhidden,
    memoryBooksVisibilityMutation,
    visibilityMutationOnly: visibilityMutation && !sourceMutation,
    sourceMutation,
    hiddenReasons,
    visibilityMutationReasons,
    sourceMutationReasons
  };
}

export function createTurnLatencyMetrics(input = {}) {
  const playerSubmittedAt = asTimestampMs(input.playerSubmittedAt);
  const hostGenerationReleasedAt = asTimestampMs(input.hostGenerationReleasedAt);
  const directiveGenerationStartedAt = asTimestampMs(input.directiveGenerationStartedAt);
  const visibleResponsePostedAt = asTimestampMs(input.visibleResponsePostedAt);
  const generationStarts = [hostGenerationReleasedAt, directiveGenerationStartedAt]
    .filter((value) => Number.isFinite(value));
  const generationStartedAt = generationStarts.length ? Math.min(...generationStarts) : null;
  const generationStartLatencyMs = Number.isFinite(playerSubmittedAt) && Number.isFinite(generationStartedAt)
    ? Math.max(0, generationStartedAt - playerSubmittedAt)
    : null;
  const providerCompletionLatencyMs = Number.isFinite(visibleResponsePostedAt) && Number.isFinite(directiveGenerationStartedAt)
    ? Math.max(0, visibleResponsePostedAt - directiveGenerationStartedAt)
    : null;
  return {
    kind: 'directive.turnLatencyMetrics.v1',
    playerSubmittedAt,
    turnObservedAt: asTimestampMs(input.turnObservedAt),
    routeDecidedAt: asTimestampMs(input.routeDecidedAt),
    hostGenerationReleasedAt,
    directiveGenerationStartedAt,
    visibleResponsePostedAt,
    backgroundSettledAt: asTimestampMs(input.backgroundSettledAt),
    generationStartedAt,
    generationStartLatencyMs,
    providerCompletionLatencyMs,
    architectureWithin60s: generationStartLatencyMs === null ? null : generationStartLatencyMs <= 60000
  };
}

export function createStorageWriteCounters() {
  return {
    kind: 'directive.storageWriteCounters.v1',
    fullSaveRewriteCount: 0,
    segmentWriteCount: 0,
    headWriteCount: 0,
    manifestWriteCount: 0,
    diagnosticsWriteCount: 0,
    bytesWritten: 0,
    writesBeforeGenerationStart: 0
  };
}

export function recordStorageWrite(counters, write = {}) {
  const target = counters || createStorageWriteCounters();
  const logicalKey = asString(write.logicalKey || write.key || write.path, '');
  const payload = write.payload;
  const fullSavePayload = Boolean(payload?.payload?.campaignState || payload?.campaignState);
  const inferredFullSave = /^saves\/.+\.v\d+\.json$/i.test(logicalKey) && fullSavePayload;
  const type = inferredFullSave ? 'fullSave' : asString(write.type, 'segment');
  const bytes = asInteger(write.bytes, 0);
  if (type === 'fullSave') target.fullSaveRewriteCount += 1;
  else if (type === 'head') target.headWriteCount += 1;
  else if (type === 'manifest') target.manifestWriteCount += 1;
  else if (type === 'diagnostics') target.diagnosticsWriteCount += 1;
  else target.segmentWriteCount += 1;
  target.bytesWritten += bytes;
  if (write.beforeGenerationStart === true) target.writesBeforeGenerationStart += 1;
  return target;
}

export function createTurnSourceFrameContract(input = {}) {
  const externalPromptEnvironmentRef = input.externalPromptEnvironmentRef
    || (input.externalPromptEnvironment ? createExternalPromptEnvironmentRef(input.externalPromptEnvironment) : null);
  return compactObject({
    kind: TURN_SOURCE_FRAME_KIND,
    schemaVersion: 1,
    id: asString(input.id),
    campaignId: asString(input.campaignId),
    saveId: asString(input.saveId),
    chatId: asString(input.chatId),
    hostMessageId: asString(input.hostMessageId),
    textHash: asString(input.textHash),
    selectedAssistantVariantHash: asString(input.selectedAssistantVariantHash),
    sourceRevision: asNumber(input.sourceRevision),
    externalPromptEnvironmentRef,
    visibility: input.visibility && typeof input.visibility === 'object' ? compactObject(cloneJson(input.visibility)) : undefined,
    createdAt: asString(input.createdAt)
  });
}

export function createTurnSourceFrameRef(sourceFrame = {}) {
  if (!sourceFrame || typeof sourceFrame !== 'object') return null;
  const ref = compactObject({
    kind: 'directive.turnSourceFrameRef.v1',
    schemaVersion: 1,
    id: asString(sourceFrame.id || sourceFrame.sourceFrameId),
    campaignId: asString(sourceFrame.campaignId),
    saveId: asString(sourceFrame.saveId),
    chatId: asString(sourceFrame.chatId),
    hostMessageId: asString(sourceFrame.hostMessageId),
    textHash: asString(sourceFrame.textHash),
    selectedAssistantVariantHash: asString(sourceFrame.selectedAssistantVariantHash),
    externalPromptEnvironmentRef: sourceFrame.externalPromptEnvironmentRef
      ? cloneJson(sourceFrame.externalPromptEnvironmentRef)
      : undefined,
    sourceRevision: asNumber(sourceFrame.sourceRevision),
    dedupeKey: asString(sourceFrame.dedupeKey || sourceFrame.id || sourceFrame.sourceFrameId || sourceFrame.hostMessageId),
    visibility: sourceFrame.visibility && typeof sourceFrame.visibility === 'object'
      ? compactObject(cloneJson(sourceFrame.visibility))
      : undefined
  });
  return ref.id || ref.hostMessageId || ref.textHash ? ref : null;
}

export const ARCHITECTURE_REDESIGN_CONTRACTS = Object.freeze({
  EXTERNAL_CONTEXT_KIND,
  TURN_SOURCE_FRAME_KIND
});
