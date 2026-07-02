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

function projectionKey(row = {}, key) {
  if (Array.isArray(key)) {
    const parts = key.map((item) => compact(row?.[item]));
    return parts.some(Boolean) ? parts.join('|') : '';
  }
  return compact(row?.[key]);
}

function rowMatchesByAnyKey(a = {}, b = {}, keys = []) {
  return keys.some((key) => {
    const left = projectionKey(a, key);
    const right = projectionKey(b, key);
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

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

export function readRuntimeCoreProjections(campaignState = {}, { coreTurnStore = null } = {}) {
  if (typeof coreTurnStore?.readProjections === 'function') {
    const projections = coreTurnStore.readProjections() || {};
    if (isPromiseLike(projections)) return {};
    if (isObjectRecord(projections)) return projections;
  }
  const projections = campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections;
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
  legacyFallback = true
} = {}) {
  const runtimeTracking = campaignState?.runtimeTracking || {};
  const projections = readRuntimeCoreProjections(campaignState, { coreTurnStore });
  return createRuntimeLedgerViewFromProjections(campaignState, projections, { legacyFallback });
}

export function createRuntimeLedgerViewFromProjections(campaignState = {}, projections = {}, {
  legacyFallback = true
} = {}) {
  const runtimeTracking = campaignState?.runtimeTracking || {};
  const authoritative = projections?.runtimeAuthority === 'coreStoreV2';
  const coreIngress = arrayRows(projections.ingressLedger);
  const coreResponse = arrayRows(projections.responseLedger);
  const coreRecovery = arrayRows(projections.recoveryJournal);
  const legacyIngress = legacyFallback ? arrayRows(runtimeTracking.ingressLedger) : [];
  const legacyResponse = legacyFallback ? arrayRows(runtimeTracking.responseLedger) : [];
  const legacyRecovery = legacyFallback ? arrayRows(runtimeTracking.recoveryJournal) : [];
  const recoveryJournal = coreRecovery.length
    ? cloneJson(coreRecovery)
    : (authoritative ? [] : cloneJson(legacyRecovery));
  return {
    kind: 'directive.runtimeLedgerView.v1',
    coreProjectionAvailable: Boolean(coreIngress.length || coreResponse.length || coreRecovery.length),
    authoritative,
    ingressLedger: mergeCoreFirst(coreIngress, legacyIngress, [
      'id',
      'ingressId',
      'hostMessageId',
      'transactionId',
      'coreTransactionId',
      'sourceFrameId'
    ], { authoritative }),
    responseLedger: mergeCoreFirst(coreResponse, legacyResponse, [
      'id',
      'responseId',
      'hostMessageId',
      'transactionId',
      'coreTransactionId',
      ['turnId', 'outcomeId', 'responseKind']
    ], { authoritative }),
    recoveryJournal
  };
}

export async function createRuntimeLedgerViewAsync(campaignState = {}, {
  coreTurnStore = null,
  legacyFallback = true
} = {}) {
  const projections = await readRuntimeCoreProjectionsAsync(campaignState, { coreTurnStore });
  return createRuntimeLedgerViewFromProjections(campaignState, projections, { legacyFallback });
}

export function findLedgerIngress(campaignState = {}, matcher = {}, options = {}) {
  const view = createRuntimeLedgerView(campaignState, options);
  const id = compact(matcher.id || matcher.ingressId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  return view.ingressLedger.find((entry) => (
    (id && compact(entry.id || entry.ingressId) === id)
    || (hostMessageId && compact(entry.hostMessageId) === hostMessageId)
    || (transactionId && compact(entry.transactionId || entry.coreTransactionId) === transactionId)
  )) || null;
}

export async function findLedgerIngressAsync(campaignState = {}, matcher = {}, options = {}) {
  const view = await createRuntimeLedgerViewAsync(campaignState, options);
  const id = compact(matcher.id || matcher.ingressId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  return view.ingressLedger.find((entry) => (
    (id && compact(entry.id || entry.ingressId) === id)
    || (hostMessageId && compact(entry.hostMessageId) === hostMessageId)
    || (transactionId && compact(entry.transactionId || entry.coreTransactionId) === transactionId)
  )) || null;
}

export function findLedgerResponse(campaignState = {}, matcher = {}, options = {}) {
  const view = createRuntimeLedgerView(campaignState, options);
  const id = compact(matcher.id || matcher.responseId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  return view.responseLedger.find((entry) => (
    (id && compact(entry.id || entry.responseId) === id)
    || (hostMessageId && compact(entry.hostMessageId) === hostMessageId)
    || (transactionId && compact(entry.transactionId || entry.coreTransactionId || entry.coreRelease?.transactionId) === transactionId)
  )) || null;
}

export async function findLedgerResponseAsync(campaignState = {}, matcher = {}, options = {}) {
  const view = await createRuntimeLedgerViewAsync(campaignState, options);
  const id = compact(matcher.id || matcher.responseId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  return view.responseLedger.find((entry) => (
    (id && compact(entry.id || entry.responseId) === id)
    || (hostMessageId && compact(entry.hostMessageId) === hostMessageId)
    || (transactionId && compact(entry.transactionId || entry.coreTransactionId || entry.coreRelease?.transactionId) === transactionId)
  )) || null;
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
