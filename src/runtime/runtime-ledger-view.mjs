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

function hasRuntimeProjectionEvidence(projections = {}) {
  return isObjectRecord(projections) && (
    ['ingressLedger', 'responses', 'responseLedger', 'recoveryJournal', 'lifecycleJournal']
      .some((key) => Array.isArray(projections[key]) && projections[key].length > 0)
    || isObjectRecord(projections.terminalDecisionLedger)
  );
}

function responseProjectionRows(projections = {}) {
  const rows = Array.isArray(projections.responses) ? projections.responses : projections.responseLedger;
  return arrayRows(rows);
}

function withResponseLedgerAlias(projections = {}) {
  if (!isObjectRecord(projections)) return {};
  const responseRows = responseProjectionRows(projections);
  if (!responseRows.length || Array.isArray(projections.responseLedger)) return projections;
  return {
    ...projections,
    responseLedger: cloneJson(responseRows)
  };
}

function findLatest(rows = [], predicate = () => false) {
  const entries = arrayRows(rows);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (predicate(entries[index])) return entries[index];
  }
  return null;
}

function findUnique(rows = [], predicate = () => false) {
  const entries = arrayRows(rows);
  let match = null;
  for (const entry of entries) {
    if (!predicate(entry)) continue;
    if (match) return null;
    match = entry;
  }
  return match;
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

function mergeCoreFirst(coreRows = [], legacyRows = [], keys = [], {
  authoritative = false,
  includeLegacyOnly = true
} = {}) {
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
  if (includeLegacyOnly) {
    for (const legacyRow of legacy) {
      if (core.some((row) => rowMatchesByAnyKey(row, legacyRow, keys))) continue;
      merged.push(cloneJson(legacyRow));
    }
  }
  return merged;
}

function isHotResponseRetryProjection(row = {}) {
  const statuses = [
    row.status,
    row.coreProjection?.status,
    row.responseRetry?.status
  ].map((status) => compact(status)).filter(Boolean);
  return Boolean(
    (row.responseRetry && statuses.some((status) => ['coreClosureFailed', 'posted', 'complete'].includes(status)))
    || statuses.some((status) => [
      'coreRecoveryDiagnosticProjected',
      'coreRecoveryProjected',
      'recoveryRequired',
      'unavailable',
      'failed'
    ].includes(status))
  );
}

function findBestResponseProjectionMatch(storeRow = {}, stateRows = [], keys = []) {
  const state = arrayRows(stateRows);
  const storeIds = [
    compact(storeRow.id),
    compact(storeRow.responseId),
    compact(storeRow.coreProjection?.responseId)
  ].filter(Boolean);
  return [...state].reverse().find((stateRow) => [
    compact(stateRow.id),
    compact(stateRow.responseId),
    compact(stateRow.coreProjection?.responseId)
  ].some((id) => id && storeIds.includes(id)))
    || [...state].reverse().find((stateRow) => rowMatchesByAnyKey(storeRow, stateRow, keys))
    || null;
}

function mergeResponseProjectionRows(storeRows = [], stateRows = [], keys = [], {
  includeStateOnly = true
} = {}) {
  const store = arrayRows(storeRows);
  const state = arrayRows(stateRows);
  const merged = store.map((storeRow) => {
    const matchingState = findBestResponseProjectionMatch(storeRow, state, keys);
    const stateWins = matchingState && isHotResponseRetryProjection(matchingState);
    return compactObject(stateWins
      ? { ...cloneJson(storeRow), ...cloneJson(matchingState) }
      : { ...(matchingState ? cloneJson(matchingState) : {}), ...cloneJson(storeRow) });
  });
  if (includeStateOnly) {
    for (const stateRow of state) {
      if (store.some((storeRow) => rowMatchesByAnyKey(storeRow, stateRow, keys))) continue;
      merged.push(cloneJson(stateRow));
    }
  }
  return merged;
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function mergeRuntimeProjectionEnvelopes(storeProjections = {}, stateProjections = {}, {
  allowStateAugment = true,
  stateRowsRequireStoreMatch = false
} = {}) {
  const hasStore = isObjectRecord(storeProjections);
  const hasState = isObjectRecord(stateProjections);
  if (!hasStore) return hasState ? stateProjections : {};
  if (!allowStateAugment) return withResponseLedgerAlias(storeProjections);
  if (!hasState || !hasRuntimeProjectionEvidence(stateProjections)) return withResponseLedgerAlias(storeProjections);
  if (!hasRuntimeProjectionEvidence(storeProjections)) {
    return stateRowsRequireStoreMatch ? withResponseLedgerAlias(storeProjections) : withResponseLedgerAlias(stateProjections);
  }
  return withResponseLedgerAlias({
    ...cloneJson(stateProjections),
    ...cloneJson(storeProjections),
    ingressLedger: mergeCoreFirst(arrayRows(storeProjections.ingressLedger), arrayRows(stateProjections.ingressLedger), [
      'id',
      'ingressId',
      { anyOf: ['transactionId', 'coreTransactionId'] },
      'sourceFrameId'
    ], { includeLegacyOnly: !stateRowsRequireStoreMatch }),
    responses: mergeResponseProjectionRows(responseProjectionRows(storeProjections), responseProjectionRows(stateProjections), [
      'id',
      'responseId',
      { anyOf: ['transactionId', 'coreTransactionId'] },
      ['turnId', 'outcomeId', 'responseKind']
    ], { includeStateOnly: !stateRowsRequireStoreMatch }),
    recoveryJournal: mergeCoreFirst(arrayRows(storeProjections.recoveryJournal), arrayRows(stateProjections.recoveryJournal), [
      'id',
      'recoveryId',
      'recoveryCaseId',
      { anyOf: ['transactionId', 'coreTransactionId'] }
    ], { includeLegacyOnly: !stateRowsRequireStoreMatch }),
    lifecycleJournal: mergeCoreFirst(arrayRows(storeProjections.lifecycleJournal), arrayRows(stateProjections.lifecycleJournal), [
      'id',
      'lifecycleId',
      { anyOf: ['transactionId', 'coreTransactionId'] },
      ['type', 'recordedAt']
    ], { includeLegacyOnly: !stateRowsRequireStoreMatch }),
    terminalDecisionLedger: isObjectRecord(storeProjections.terminalDecisionLedger)
      ? cloneJson(storeProjections.terminalDecisionLedger)
      : cloneJson(stateProjections.terminalDecisionLedger || {}),
    responseLedgerRevision: Math.max(
      Number(stateProjections.responseLedgerRevision) || 0,
      Number(storeProjections.responseLedgerRevision) || 0
    )
  });
}

export function readRuntimeCoreProjections(campaignState = {}, { coreTurnStore = null } = {}) {
  const stateProjections = campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections;
  if (typeof coreTurnStore?.readProjections === 'function') {
    const projections = coreTurnStore.readProjections() || {};
    if (isPromiseLike(projections)) return {};
    if (isObjectRecord(projections)) {
      return withResponseLedgerAlias(mergeRuntimeProjectionEnvelopes(projections, stateProjections, {
        stateRowsRequireStoreMatch: true
      }));
    }
    return {};
  }
  return withResponseLedgerAlias(isObjectRecord(stateProjections) ? stateProjections : {});
}

export async function readRuntimeCoreProjectionsAsync(campaignState = {}, { coreTurnStore = null } = {}) {
  const stateProjections = campaignState?.directiveRuntimeEvidence?.coreStoreReadProjections;
  if (typeof coreTurnStore?.readProjections === 'function') {
    const projections = await coreTurnStore.readProjections();
    if (isObjectRecord(projections)) {
      return withResponseLedgerAlias(mergeRuntimeProjectionEnvelopes(projections, stateProjections, {
        stateRowsRequireStoreMatch: true
      }));
    }
    return {};
  }
  return readRuntimeCoreProjections(campaignState);
}

export function createRuntimeLedgerView(campaignState = {}, {
  coreTurnStore = null
} = {}) {
  const projections = readRuntimeCoreProjections(campaignState, { coreTurnStore });
  return createRuntimeLedgerViewFromProjections(campaignState, projections);
}

export function createRuntimeLedgerViewFromProjections(campaignState = {}, projections = {}) {
  void campaignState;
  const authoritative = projections?.runtimeAuthority === 'coreStoreV2';
  const coreIngress = arrayRows(projections.ingressLedger);
  const coreResponse = responseProjectionRows(projections);
  const coreRecovery = arrayRows(projections.recoveryJournal);
  const coreLifecycle = arrayRows(projections.lifecycleJournal);
  const coreProjectionAvailable = Boolean(coreIngress.length || coreResponse.length || coreRecovery.length || coreLifecycle.length);
  return {
    kind: 'directive.runtimeLedgerView.v1',
    coreProjectionAvailable,
    authoritative,
    ingressLedger: mergeCoreFirst(coreIngress, [], [
      'id',
      'ingressId',
      { anyOf: ['transactionId', 'coreTransactionId'] },
      'sourceFrameId'
    ], { authoritative }),
    responseLedger: mergeCoreFirst(coreResponse, [], [
      'id',
      'responseId',
      { anyOf: ['transactionId', 'coreTransactionId'] },
      ['turnId', 'outcomeId', 'responseKind']
    ], { authoritative }),
    recoveryJournal: cloneJson(coreRecovery),
    lifecycleJournal: cloneJson(coreLifecycle)
  };
}

export async function createRuntimeLedgerViewAsync(campaignState = {}, {
  coreTurnStore = null
} = {}) {
  const projections = await readRuntimeCoreProjectionsAsync(campaignState, { coreTurnStore });
  return createRuntimeLedgerViewFromProjections(campaignState, projections);
}

export function findLedgerIngress(campaignState = {}, matcher = {}, options = {}) {
  const view = createRuntimeLedgerView(campaignState, options);
  const id = compact(matcher.id || matcher.ingressId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  if (id) return view.ingressLedger.find((entry) => compact(entry.id || entry.ingressId) === id) || null;
  if (transactionId) return view.ingressLedger.find((entry) => compact(entry.transactionId || entry.coreTransactionId) === transactionId) || null;
  if (hostMessageId) return findUnique(view.ingressLedger, (entry) => compact(entry.hostMessageId) === hostMessageId);
  return null;
}

export async function findLedgerIngressAsync(campaignState = {}, matcher = {}, options = {}) {
  const view = await createRuntimeLedgerViewAsync(campaignState, options);
  const id = compact(matcher.id || matcher.ingressId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  if (id) return view.ingressLedger.find((entry) => compact(entry.id || entry.ingressId) === id) || null;
  if (transactionId) return view.ingressLedger.find((entry) => compact(entry.transactionId || entry.coreTransactionId) === transactionId) || null;
  if (hostMessageId) return findUnique(view.ingressLedger, (entry) => compact(entry.hostMessageId) === hostMessageId);
  return null;
}

export function findLedgerResponse(campaignState = {}, matcher = {}, options = {}) {
  const view = createRuntimeLedgerView(campaignState, options);
  const id = compact(matcher.id || matcher.responseId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  if (id) return findLatest(view.responseLedger, (entry) => compact(entry.id || entry.responseId) === id) || null;
  if (transactionId) {
    return findLatest(view.responseLedger, (entry) => (
      compact(entry.transactionId || entry.coreTransactionId || entry.coreRelease?.transactionId) === transactionId
    )) || null;
  }
  if (hostMessageId) return findUnique(view.responseLedger, (entry) => compact(entry.hostMessageId) === hostMessageId);
  return null;
}

export async function findLedgerResponseAsync(campaignState = {}, matcher = {}, options = {}) {
  const view = await createRuntimeLedgerViewAsync(campaignState, options);
  const id = compact(matcher.id || matcher.responseId);
  const hostMessageId = compact(matcher.hostMessageId);
  const transactionId = compact(matcher.transactionId || matcher.coreTransactionId);
  if (id) return findLatest(view.responseLedger, (entry) => compact(entry.id || entry.responseId) === id) || null;
  if (transactionId) {
    return findLatest(view.responseLedger, (entry) => (
      compact(entry.transactionId || entry.coreTransactionId || entry.coreRelease?.transactionId) === transactionId
    )) || null;
  }
  if (hostMessageId) return findUnique(view.responseLedger, (entry) => compact(entry.hostMessageId) === hostMessageId);
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
