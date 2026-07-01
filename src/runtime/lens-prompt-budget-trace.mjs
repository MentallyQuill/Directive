import {
  hashStableJson,
  stableJsonByteLength
} from './architecture-redesign-contracts.mjs';

export const LENS_PROMPT_BUDGET_TRACE_KIND = 'directive.lensPromptBudgetTrace.v1';

export const LENS_PROMPT_BUDGET_LANES = Object.freeze([
  'stableRules',
  'protectedContinuity',
  'activeScene',
  'activeCast',
  'missionPressure',
  'recentTranscript',
  'recall',
  'volatileTurn',
  'externalEnvironment'
]);

const LANE_SET = new Set(LENS_PROMPT_BUDGET_LANES);
const RAW_KEY_PATTERN = /(?:text|body|prompt|provider|raw|transcript|summaryception|memoryBook|vectorPayload|embedding|secret|api[_-]?key|password|token|qdrant)/i;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function safeRef(value = null) {
  if (!value || typeof value !== 'object') return null;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (RAW_KEY_PATTERN.test(key)) continue;
    if (item === undefined) continue;
    if (Array.isArray(item)) out[key] = uniqueStrings(item);
    else if (item && typeof item === 'object') out[key] = safeRef(item) || undefined;
    else out[key] = item;
  }
  return compactObject(out);
}

function normalizeBudgetRef(value = {}) {
  const safe = safeRef(value) || {};
  return compactObject({
    id: asString(safe.id || safe.refId || safe.sourceFrameId || safe.hash),
    kind: asString(safe.kind || safe.refKind),
    authority: asString(safe.authority),
    hash: asString(safe.hash || safe.textHash || safe.metadataHash),
    estimatedTokens: Math.max(0, Math.trunc(asNumber(value.estimatedTokens ?? safe.estimatedTokens, 0))),
    sourceFrameId: asString(safe.sourceFrameId || safe.sourceFrameRef?.id),
    omissionReason: asString(safe.omissionReason)
  });
}

function normalizeLaneInput(lane = {}) {
  const id = asString(lane.id);
  if (!LANE_SET.has(id)) {
    throw new Error(`Unknown LENS prompt budget lane: ${id || '<missing>'}`);
  }
  return {
    id,
    budgetTokens: Math.max(0, Math.trunc(asNumber(lane.budgetTokens, 0))),
    reservedFloor: Math.max(0, Math.trunc(asNumber(lane.reservedFloor, 0))),
    authority: asString(lane.authority, id === 'externalEnvironment' ? 'diagnostic' : 'directive'),
    refs: (Array.isArray(lane.refs) ? lane.refs : []).map(normalizeBudgetRef).filter((ref) => ref.id || ref.hash),
    omittedRefs: (Array.isArray(lane.omittedRefs) ? lane.omittedRefs : []).map(normalizeBudgetRef).filter((ref) => ref.id || ref.hash),
    omissionReasons: uniqueStrings(lane.omissionReasons),
    diagnosticOnly: lane.diagnosticOnly === true || id === 'externalEnvironment'
  };
}

export function promptBudgetLaneIds() {
  return [...LENS_PROMPT_BUDGET_LANES];
}

export function createLensPromptBudgetTrace({
  packetId = null,
  promptRevision = null,
  cacheKey = null,
  lanes = [],
  cacheInputs = {}
} = {}) {
  const normalizedLanes = [];
  for (const laneInput of lanes) {
    const lane = normalizeLaneInput(laneInput);
    const includedRefs = [];
    const omittedRefs = [...lane.omittedRefs];
    const omissionReasons = new Set(lane.omissionReasons);
    let usedTokens = 0;
    for (const ref of lane.refs) {
      const nextTokens = usedTokens + Math.max(0, Number(ref.estimatedTokens) || 0);
      if (!lane.diagnosticOnly && lane.budgetTokens > 0 && nextTokens > lane.budgetTokens) {
        omittedRefs.push({
          ...ref,
          omissionReason: 'budget-exceeded'
        });
        omissionReasons.add('budget-exceeded');
        continue;
      }
      includedRefs.push(ref);
      usedTokens = nextTokens;
    }
    normalizedLanes.push({
      id: lane.id,
      budgetTokens: lane.budgetTokens,
      estimatedTokens: usedTokens,
      reservedFloor: lane.reservedFloor,
      includedRefs,
      omittedRefs,
      omissionReasons: [...omissionReasons],
      authority: lane.authority,
      diagnosticOnly: lane.diagnosticOnly
    });
  }
  const trace = {
    kind: LENS_PROMPT_BUDGET_TRACE_KIND,
    schemaVersion: 1,
    packetId: asString(packetId),
    promptRevision: promptRevision === null || promptRevision === undefined ? null : Number(promptRevision),
    cacheKey: asString(cacheKey),
    lanes: normalizedLanes,
    cacheInputs: compactObject({
      mechanicsRevision: cacheInputs.mechanicsRevision ?? null,
      promptDomainVector: cacheInputs.promptDomainVector ? cloneJson(cacheInputs.promptDomainVector) : null,
      recallIndexRevision: asString(cacheInputs.recallIndexRevision),
      sceneSealRevision: asString(cacheInputs.sceneSealRevision),
      pressureArcDigestRevision: asString(cacheInputs.pressureArcDigestRevision),
      packageRevision: asString(cacheInputs.packageRevision),
      externalPromptEnvironmentRef: safeRef(cacheInputs.externalPromptEnvironmentRef)
    })
  };
  trace.hash = hashStableJson(trace);
  trace.byteLength = stableJsonByteLength(trace);
  return trace;
}
