function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function isObjectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isPromiseLike(value) {
  return value && typeof value.then === 'function';
}

function arrayRows(value) {
  return Array.isArray(value) ? value : [];
}

function findLatest(rows = [], predicate = () => false) {
  const entries = arrayRows(rows);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (predicate(entries[index])) return entries[index];
  }
  return null;
}

function projectionKey(row = {}, key) {
  if (isObjectRecord(key) && Array.isArray(key.anyOf)) {
    return key.anyOf.map((item) => compact(row?.[item])).filter(Boolean);
  }
  if (Array.isArray(key)) {
    const parts = key.map((item) => compact(row?.[item]));
    return parts.every(Boolean) ? parts.join('|') : '';
  }
  return compact(row?.[key]);
}

function rowMatchesByAnyKey(a = {}, b = {}, keys = []) {
  return keys.some((key) => {
    const left = projectionKey(a, key);
    const right = projectionKey(b, key);
    if (Array.isArray(left) || Array.isArray(right)) {
      const leftValues = Array.isArray(left) ? left : [left];
      const rightValues = Array.isArray(right) ? right : [right];
      return leftValues.some((leftValue) => leftValue && rightValues.includes(leftValue));
    }
    return left && right && left === right;
  });
}

function mergeCoreFirst(coreRows = [], legacyRows = [], keys = [], { authoritative = false } = {}) {
  const core = arrayRows(coreRows);
  if (authoritative) return cloneJson(core);
  const legacy = arrayRows(legacyRows);
  const merged = core.map((row) => {
    const matchingLegacy = legacy.find((legacyRow) => rowMatchesByAnyKey(row, legacyRow, keys));
    return compactObject({
      ...(matchingLegacy ? cloneJson(matchingLegacy) : {}),
      ...cloneJson(row)
    });
  });
  for (const legacyRow of legacy) {
    if (core.some((row) => rowMatchesByAnyKey(row, legacyRow, keys))) continue;
    merged.push(cloneJson(legacyRow));
  }
  return merged;
}

function isTaggedCompatibilityProjection(row = {}) {
  const authority = compact(row.authority);
  if (!authority) return false;
  if (authority === 'compatibilityProjectionUnavailable') return false;
  return Boolean(row.compatibilityMirror || compact(row.projectionSource) === 'coreStoreV2');
}

function legacyProjectionFallbackRows(rows = [], { coreProjectionAvailable = false } = {}) {
  const legacy = arrayRows(rows);
  if (!coreProjectionAvailable) return legacy;
  return legacy.filter((row) => isTaggedCompatibilityProjection(row));
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function readRuntimeCoreProjections(campaignState = {}, { coreTurnStore = null } = {}) {
  if (typeof coreTurnStore?.readProjections === 'function') {
    const projections = coreTurnStore.readProjections() || {};
    if (isPromiseLike(projections)) return {};
    if (isObjectRecord(projections)) return projections;
  }
  const projections = campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections
    || campaignState?.runtimeTracking?.directiveRuntimeEvidence?.coreStoreReadProjections;
  return isObjectRecord(projections) ? projections : {};
}

export async function readRuntimeCoreProjectionsAsync(campaignState = {}, { coreTurnStore = null } = {}) {
  if (typeof coreTurnStore?.readProjections === 'function') {
    const projections = await coreTurnStore.readProjections();
    if (isObjectRecord(projections)) return projections;
  }
  return readRuntimeCoreProjections(campaignState);
}

export function createRuntimeLedgerView(campaignState = {}, {
  coreTurnStore = null,
  legacyFallback = true,
  runtimeOverlay = false
} = {}) {
  const runtimeTracking = campaignState?.runtimeTracking || {};
  const projections = readRuntimeCoreProjections(campaignState, { coreTurnStore });
  return createRuntimeLedgerViewFromProjections(campaignState, projections, { legacyFallback, runtimeOverlay });
}

export function createRuntimeLedgerViewFromProjections(campaignState = {}, projections = {}, {
  legacyFallback = true,
  runtimeOverlay = false
} = {}) {
  const runtimeTracking = campaignState?.runtimeTracking || {};
  const authoritative = projections?.runtimeAuthority === 'coreStoreV2';
  const coreIngress = arrayRows(projections.ingressLedger);
  const coreResponse = arrayRows(projections.responseLedger);
  const coreRecovery = arrayRows(projections.recoveryJournal);
  const coreProjectionAvailable = Boolean(coreIngress.length || coreResponse.length || coreRecovery.length);
  const legacyIngress = legacyFallback
    ? legacyProjectionFallbackRows(runtimeTracking.ingressLedger, { coreProjectionAvailable })
    : [];
  const legacyResponse = legacyFallback
    ? legacyProjectionFallbackRows(runtimeTracking.responseLedger, { coreProjectionAvailable })
    : [];
  const allowRuntimeOverlay = authoritative && runtimeOverlay === true;
  return {
    kind: 'directive.runtimeLedgerView.v1',
    coreProjectionAvailable,
    authoritative,
    ingressLedger: mergeCoreFirst(coreIngress, legacyIngress, [
      'id',
      'ingressId',
      { anyOf: ['transactionId', 'coreTransactionId'] },
      'sourceFrameId'
    ], { authoritative: authoritative && !allowRuntimeOverlay }),
    responseLedger: mergeCoreFirst(coreResponse, legacyResponse, [
      'id',
      'responseId',
      { anyOf: ['transactionId', 'coreTransactionId'] },
      ['turnId', 'outcomeId', 'responseKind']
    ], { authoritative: authoritative && !allowRuntimeOverlay }),
    recoveryJournal: cloneJson(coreRecovery)
  };
}

export async function createRuntimeLedgerViewAsync(campaignState = {}, {
  coreTurnStore = null,
  legacyFallback = true,
  runtimeOverlay = false
} = {}) {
  const projections = await readRuntimeCoreProjectionsAsync(campaignState, { coreTurnStore });
  return createRuntimeLedgerViewFromProjections(campaignState, projections, { legacyFallback, runtimeOverlay });
}

export function findLedgerIngress(campaignState = {}, matcher = {}, options = {}) {
  const view = createRuntimeLedgerView(campaignState, options);
  const id = compact(matcher.id || matcher.ingressId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  if (id) return view.ingressLedger.find((entry) => compact(entry.id || entry.ingressId) === id) || null;
  if (transactionId) return view.ingressLedger.find((entry) => compact(entry.transactionId || entry.coreTransactionId) === transactionId) || null;
  if (hostMessageId) return findLatest(view.ingressLedger, (entry) => compact(entry.hostMessageId) === hostMessageId);
  return null;
}

export async function findLedgerIngressAsync(campaignState = {}, matcher = {}, options = {}) {
  const view = await createRuntimeLedgerViewAsync(campaignState, options);
  const id = compact(matcher.id || matcher.ingressId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  if (id) return view.ingressLedger.find((entry) => compact(entry.id || entry.ingressId) === id) || null;
  if (transactionId) return view.ingressLedger.find((entry) => compact(entry.transactionId || entry.coreTransactionId) === transactionId) || null;
  if (hostMessageId) return findLatest(view.ingressLedger, (entry) => compact(entry.hostMessageId) === hostMessageId);
  return null;
}

export function findLedgerResponse(campaignState = {}, matcher = {}, options = {}) {
  const view = createRuntimeLedgerView(campaignState, options);
  const id = compact(matcher.id || matcher.responseId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  if (id) return view.responseLedger.find((entry) => compact(entry.id || entry.responseId) === id) || null;
  if (transactionId) {
    return view.responseLedger.find((entry) => (
      compact(entry.transactionId || entry.coreTransactionId || entry.coreRelease?.transactionId) === transactionId
    )) || null;
  }
  if (hostMessageId) return findLatest(view.responseLedger, (entry) => compact(entry.hostMessageId) === hostMessageId);
  return null;
}

export async function findLedgerResponseAsync(campaignState = {}, matcher = {}, options = {}) {
  const view = await createRuntimeLedgerViewAsync(campaignState, options);
  const id = compact(matcher.id || matcher.responseId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  if (id) return view.responseLedger.find((entry) => compact(entry.id || entry.responseId) === id) || null;
  if (transactionId) {
    return view.responseLedger.find((entry) => (
      compact(entry.transactionId || entry.coreTransactionId || entry.coreRelease?.transactionId) === transactionId
    )) || null;
  }
  if (hostMessageId) return findLatest(view.responseLedger, (entry) => compact(entry.hostMessageId) === hostMessageId);
  return null;
}

export function findLedgerRecovery(campaignState = {}, matcher = {}, options = {}) {
  const view = createRuntimeLedgerView(campaignState, options);
  const id = compact(matcher.id || matcher.recoveryId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  return view.recoveryJournal.find((entry) => (
    (id && compact(entry.id || entry.recoveryId || entry.recoveryCaseId) === id)
    || (transactionId && compact(entry.transactionId || entry.coreTransactionId) === transactionId)
  )) || null;
}

export async function findLedgerRecoveryAsync(campaignState = {}, matcher = {}, options = {}) {
  const view = await createRuntimeLedgerViewAsync(campaignState, options);
  const id = compact(matcher.id || matcher.recoveryId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  return view.recoveryJournal.find((entry) => (
    (id && compact(entry.id || entry.recoveryId || entry.recoveryCaseId) === id)
    || (transactionId && compact(entry.transactionId || entry.coreTransactionId) === transactionId)
  )) || null;
}
