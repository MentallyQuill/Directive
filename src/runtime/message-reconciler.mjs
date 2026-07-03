import {
  updateDirectiveResponse,
  updateTurnIngress
} from './state-delta-gateway.mjs';
import { createRepairCommandBoundary } from './repair-command-boundary.mjs';
import { acceptCorrectAsSwipeSelection } from './correct-as-swipe.mjs';
import {
  findLedgerIngress,
  findLedgerIngressAsync,
  findLedgerResponseAsync,
  findLedgerResponse
} from './runtime-ledger-view.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function findIngress(campaignState, hostMessageId, options = {}) {
  const id = compact(hostMessageId);
  return findLedgerIngress(campaignState, { hostMessageId: id }, options);
}

function findResponse(campaignState, hostMessageId, options = {}) {
  const id = compact(hostMessageId);
  return findLedgerResponse(campaignState, { hostMessageId: id }, options);
}

function sceneHandshakeCollections(campaignState = {}) {
  const ledger = campaignState?.runtimeTracking?.sceneHandshake || {};
  return [
    ['settled', Array.isArray(ledger.settled) ? ledger.settled : []],
    ['pendingInternalReview', Array.isArray(ledger.pendingInternalReview) ? ledger.pendingInternalReview : []],
    ['deferred', Array.isArray(ledger.deferred) ? ledger.deferred : []],
    ['operatorRecovery', Array.isArray(ledger.operatorRecovery) ? ledger.operatorRecovery : []],
    ['rejected', Array.isArray(ledger.rejected) ? ledger.rejected : []]
  ];
}

function invalidateDerivedSceneHandshakeRecords(campaignState = {}, settlementIds = [], patch = {}) {
  const ids = new Set(settlementIds.map(compact).filter(Boolean));
  if (!ids.size) return campaignState;
  const next = cloneJson(campaignState);
  const mark = (entry = {}, status = null) => {
    const sourceSettlementId = compact(entry.sourceSettlementId || entry.settlementId || entry.source?.id || '');
    if (!ids.has(sourceSettlementId)) return entry;
    return {
      ...entry,
      ...(status ? { status } : {}),
      sourceStale: true,
      invalidatedAt: patch.invalidatedAt,
      invalidationType: patch.invalidationType,
      sourceInvalidation: {
        hostMessageId: patch.hostMessageId,
        eventType: patch.invalidationType
      }
    };
  };

  next.mission = next.mission || {};
  next.mission.openAssignments = Array.isArray(next.mission.openAssignments)
    ? next.mission.openAssignments.map((entry) => mark(entry, 'source-stale'))
    : next.mission.openAssignments;

  next.commandLog = next.commandLog || {};
  next.commandLog.entries = Array.isArray(next.commandLog.entries)
    ? next.commandLog.entries.map((entry) => mark(entry))
    : next.commandLog.entries;

  next.ship = next.ship || {};
  next.ship.technicalDebt = Array.isArray(next.ship.technicalDebt)
    ? next.ship.technicalDebt.map((entry) => mark(entry, entry.status || null))
    : next.ship.technicalDebt;

  next.threadLedger = next.threadLedger || {};
  next.threadLedger.records = Array.isArray(next.threadLedger.records)
    ? next.threadLedger.records.map((entry) => {
      const sourceSettlementId = compact(entry.sourceSettlementId || entry.settlementId || entry.source?.id || '');
      const evidenceSettlement = Array.isArray(entry.supportingEvidence)
        && entry.supportingEvidence.some((evidence) => ids.has(compact(evidence?.source?.id || evidence?.sourceSettlementId || '')));
      if (!ids.has(sourceSettlementId) && !evidenceSettlement) return entry;
      return {
        ...entry,
        sourceStale: true,
        metadata: {
          ...(entry.metadata || {}),
          stale: true,
          staleReason: 'scene-handshake-source-invalidated'
        },
        invalidatedAt: patch.invalidatedAt,
        invalidationType: patch.invalidationType,
        sourceInvalidation: {
          hostMessageId: patch.hostMessageId,
          eventType: patch.invalidationType
        }
      };
    })
    : next.threadLedger.records;

  return next;
}

function repairDependentInvalidationProjection(coreRecovery = {}) {
  return coreRecovery?.decision?.dependentInvalidation
    || coreRecovery?.dependentInvalidation
    || coreRecovery?.decision?.legacyProjection?.dependentInvalidation
    || coreRecovery?.legacyProjection?.dependentInvalidation
    || null;
}

function coreRecoveryRecorded(coreRecovery = null) {
  return coreRecovery?.status === 'recorded'
    || coreRecovery?.coreRecovery?.status === 'recorded'
    || coreRecovery?.recoveryCase?.status === 'recorded'
    || Boolean(coreRecovery?.recoveryCaseId || coreRecovery?.id);
}

function normalizeIdList(value = []) {
  return [...new Set((Array.isArray(value) ? value : [value]).map(compact).filter(Boolean))];
}

function sourceKindForRepairFallback({ ingress = null, response = null } = {}) {
  if (response) return 'directiveResponse';
  if (ingress) return 'playerIngress';
  return 'untrackedHostMessage';
}

function sourceMutationTransactionId({ ingress = null, response = null } = {}) {
  return compact(
    ingress?.coreTransactionId
    || response?.coreTransactionId
    || response?.coreRelease?.transactionId
    || response?.coreCompletion?.transactionId
    || response?.hostContinuation?.coreTransactionId
  ) || null;
}

function repairUnavailableSourceMutationDecision(options = {}) {
  const sourceKind = sourceKindForRepairFallback(options);
  const transactionId = sourceMutationTransactionId(options);
  return {
    status: 'notRecorded',
    reason: 'repair-source-mutation-unavailable',
    transactionId,
    decision: {
      kind: 'directive.repairDecision.v1',
      eventType: options.eventType || null,
      sourceKind,
      transactionId,
      sourceMutation: true,
      hasDependent: Boolean(options.ingress?.outcomeId || options.response?.outcomeId || options.response?.id),
      uncommitted: false,
      action: 'repairSourceMutationUnavailable',
      normalTurnAllowed: false,
      legacyProjection: {
        kind: 'directive.repairLegacyProjection.v1',
        sourceProjectionStatus: 'recoveryRequired',
        responseProjectionStatus: 'recoveryRequired',
        recoveryJournalStatus: 'reviewRequired',
        returnedAction: 'reviewRequired',
        shouldRestoreRevision: false,
        restoreRevision: null
      }
    }
  };
}

function applySceneHandshakeProjection(campaignState = {}, projection = null, {
  hostMessageId,
  eventType,
  eventTime
} = {}) {
  const settlementIds = normalizeIdList(projection?.sceneHandshake?.settlementIds);
  if (!settlementIds.length) return { campaignState, invalidatedCount: 0, settlementIds: [] };
  const idSet = new Set(settlementIds);
  const next = cloneJson(campaignState);
  const tracking = next.runtimeTracking || {};
  tracking.sceneHandshake = tracking.sceneHandshake || {};
  const appliedIds = new Set();
  for (const [key, records] of sceneHandshakeCollections(next)) {
    tracking.sceneHandshake[key] = records.map((record) => {
      const id = compact(record.id);
      if (!idSet.has(id)) return record;
      appliedIds.add(id);
      return {
        ...record,
        status: 'invalidated',
        sourceStale: true,
        invalidatedAt: eventTime,
        invalidationType: eventType,
        previousStatus: record.status || null
      };
    });
  }
  if (tracking.sceneHandshake.lastResult && idSet.has(compact(tracking.sceneHandshake.lastResult.id))) {
    appliedIds.add(compact(tracking.sceneHandshake.lastResult.id));
    tracking.sceneHandshake.lastResult = {
      ...tracking.sceneHandshake.lastResult,
      status: 'invalidated',
      sourceStale: true,
      invalidatedAt: eventTime,
      invalidationType: eventType,
      previousStatus: tracking.sceneHandshake.lastResult.status || null
    };
  }
  next.runtimeTracking = tracking;
  const appliedSettlementIds = settlementIds.filter((id) => appliedIds.has(id));
  if (!appliedSettlementIds.length) return { campaignState, invalidatedCount: 0, settlementIds: [] };
  const invalidated = invalidateDerivedSceneHandshakeRecords(next, appliedSettlementIds, {
    hostMessageId: compact(hostMessageId),
    invalidatedAt: eventTime,
    invalidationType: eventType
  });
  return {
    campaignState: invalidated,
    invalidatedCount: appliedSettlementIds.length,
    settlementIds: appliedSettlementIds
  };
}

function applyMissionComponentProjection(campaignState = {}, projection = null, {
  hostMessageId,
  eventType,
  eventTime
} = {}) {
  const componentIds = normalizeIdList(projection?.missionComponents?.componentIds);
  if (!componentIds.length) return { campaignState, markedCount: 0, componentIds: [] };
  const idSet = new Set(componentIds);
  const sourceStatus = compact(projection?.missionComponents?.sourceStatus)
    || (/deleted/i.test(String(eventType || '')) ? 'deleted' : 'stale');
  const records = campaignState?.knowledgeLedger?.components?.records;
  if (!Array.isArray(records)) return { campaignState, markedCount: 0, componentIds: [] };
  const next = cloneJson(campaignState);
  let markedCount = 0;
  const markedIds = [];
  next.knowledgeLedger = next.knowledgeLedger || {};
  next.knowledgeLedger.components = next.knowledgeLedger.components || {};
  next.knowledgeLedger.components.records = records.map((record) => {
    const id = compact(record.id);
    if (!idSet.has(id)) return record;
    if (record.source?.sourceStatus === 'deleted' && sourceStatus !== 'deleted') return record;
    if (record.source?.sourceStatus === sourceStatus) return record;
    markedCount += 1;
    markedIds.push(id);
    return {
      ...record,
      source: {
        ...(record.source || {}),
        sourceStatus
      },
      lifecycle: {
        ...(record.lifecycle || {}),
        updatedAt: eventTime
      }
    };
  });
  if (!markedCount) return { campaignState, markedCount: 0, componentIds: [] };
  return {
    campaignState: next,
    markedCount,
    componentIds: markedIds,
    sourceStatus
  };
}

function applyRepairDependentInvalidation(campaignState = {}, coreRecovery = {}, {
  hostMessageId,
  eventType,
  eventTime
} = {}) {
  const projection = repairDependentInvalidationProjection(coreRecovery);
  const sceneHandshake = applySceneHandshakeProjection(campaignState, projection, {
    hostMessageId,
    eventType,
    eventTime
  });
  const missionComponents = applyMissionComponentProjection(sceneHandshake.campaignState, projection, {
    hostMessageId,
    eventType,
    eventTime
  });
  return {
    campaignState: missionComponents.campaignState,
    sceneHandshake,
    missionComponents
  };
}

function preOutcomeRevision(campaignState, ingress) {
  const history = campaignState?.runtimeTracking?.history || [];
  const matching = [...history].reverse().find((entry) => (
    (ingress?.outcomeId && entry.outcomeId === ingress.outcomeId)
    || (ingress?.id && entry.ingressId === ingress.id)
  ));
  return matching ? Number(matching.revision) : null;
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function compactCheckpointRef(ref = null) {
  if (!isObject(ref)) return null;
  const checkpointId = compact(ref.checkpointId || ref.id);
  if (!checkpointId) return null;
  return {
    kind: compact(ref.kind) || 'directive.coreMechanicsCheckpointRef.v1',
    campaignId: compact(ref.campaignId) || null,
    saveId: compact(ref.saveId) || null,
    checkpointId,
    layout: compact(ref.layout) || 'core',
    sourceKind: compact(ref.sourceKind) || null,
    sourceRevision: Number.isFinite(Number(ref.sourceRevision)) ? Number(ref.sourceRevision) : null,
    logicalKey: compact(ref.logicalKey) || null,
    hash: compact(ref.hash) || null
  };
}

function coreCheckpointRefFromEntry(entry = null) {
  return compactCheckpointRef(
    entry?.coreCheckpointRef
      || entry?.checkpointRef
      || entry?.v2CheckpointRef
      || null
  );
}

function sourceMutationCoreCheckpointRef(campaignState = {}, ingress = null) {
  const direct = coreCheckpointRefFromEntry(ingress);
  if (direct) return direct;
  const turnEntries = Array.isArray(campaignState?.turnLedger?.entries)
    ? campaignState.turnLedger.entries
    : [];
  const ledgerEntry = [...turnEntries].reverse().find((entry) => (
    (ingress?.outcomeId && entry?.outcomeId === ingress.outcomeId)
    || (ingress?.id && entry?.ingressId === ingress.id)
    || (ingress?.coreTransactionId && (
      entry?.coreTransactionId === ingress.coreTransactionId
      || entry?.transactionId === ingress.coreTransactionId
    ))
  ));
  const ledgerRef = coreCheckpointRefFromEntry(ledgerEntry);
  if (ledgerRef) return ledgerRef;
  const history = Array.isArray(campaignState?.runtimeTracking?.history)
    ? campaignState.runtimeTracking.history
    : [];
  const historyEntry = [...history].reverse().find((entry) => (
    (ingress?.outcomeId && entry?.outcomeId === ingress.outcomeId)
    || (ingress?.id && entry?.ingressId === ingress.id)
  ));
  return coreCheckpointRefFromEntry(historyEntry);
}

function sourceMutationEventType(type, { response = null, ingress = null } = {}) {
  if (type === 'deleted') {
    if (response) return 'directiveResponseDeleted';
    if (ingress) return 'playerMessageDeleted';
    return 'sceneHandshakeSourceDeleted';
  }
  if (type === 'selectedSwipeChanged') {
    if (response) return 'directiveResponseSelectedSwipeChanged';
    if (ingress) return 'playerMessageSelectedSwipeChanged';
    return 'sceneHandshakeSourceSelectedSwipeChanged';
  }
  if (response) return 'directiveResponseEdited';
  if (ingress) return 'playerMessageEdited';
  return 'sceneHandshakeSourceEdited';
}

export function createMessageReconciler({
  getCampaignState,
  setCampaignState,
  coreTurnStore = null,
  repairRuntime = null,
  persist = null,
  syncPrompt = null,
  loadCoreCheckpointState = null,
  now = null
} = {}) {
  if (typeof getCampaignState !== 'function') throw new Error('getCampaignState must be a function');
  if (typeof setCampaignState !== 'function') throw new Error('setCampaignState must be a function');

  async function save(summary) {
    if (typeof persist === 'function') await persist(getCampaignState(), summary);
  }

  const repair = repairRuntime || createRepairCommandBoundary({ coreTurnStore, now });

  async function recordRepairSourceMutationRecovery(options = {}) {
    try {
      const handleSourceMutation = repair.handleSourceMutation || repair.recordSourceMutationRecovery;
      if (typeof handleSourceMutation !== 'function') {
        return repairUnavailableSourceMutationDecision(options);
      }
      return await handleSourceMutation.call(repair, options);
    } catch (error) {
      error.details = {
        ...(error.details || {}),
        eventType: options.eventType
      };
      throw error;
    }
  }

  async function recordRepairVisibilityMutation(options = {}) {
    const handleVisibilityMutation = repair.handleVisibilityMutation || repair.recordVisibilityMutation;
    if (typeof handleVisibilityMutation !== 'function') {
      return {
        status: 'notRecorded',
        reason: 'repair-visibility-unavailable',
        decision: {
          kind: 'directive.repairVisibilityDecision.v1',
          eventType: options.eventType || 'hostMessageVisibilityChanged',
          sourceKind: options.response ? 'directiveResponse' : 'playerIngress',
          action: 'visibilityObserverUnavailable',
          normalTurnAllowed: false,
          recoveryRequired: false
        }
      };
    }
    try {
      return await handleVisibilityMutation.call(repair, options);
    } catch (error) {
      error.details = {
        ...(error.details || {}),
        eventType: options.eventType
      };
      throw error;
    }
  }

  async function recordRepairRollbackActuation(options = {}) {
    const handleRollback = repair.recordRollbackActuation || repair.recordRollbackExecution;
    if (typeof handleRollback !== 'function') {
      return {
        status: 'notRecorded',
        reason: 'repair-rollback-record-unavailable',
        transactionId: options.coreRecovery?.transactionId || options.rollbackActuation?.transactionId || null
      };
    }
    try {
      return await handleRollback.call(repair, options);
    } catch (error) {
      error.details = {
        ...(error.details || {}),
        eventType: options.eventType
      };
      throw error;
    }
  }

  async function executeRepairRollbackActuation(options = {}) {
    const executeRollback = repair.executeRollbackActuation || repair.executeRollbackExecution;
    if (typeof executeRollback === 'function') {
      try {
        return await executeRollback.call(repair, options);
      } catch (error) {
        error.details = {
          ...(error.details || {}),
          eventType: options.eventType
        };
        throw error;
      }
    }
    return recordRepairRollbackActuation(options);
  }

  async function loadSourceMutationCheckpointState(options = {}) {
    if (typeof loadCoreCheckpointState !== 'function' || !options.coreCheckpointRef) return null;
    try {
      const loaded = await loadCoreCheckpointState(options);
      if (!isObject(loaded)) return null;
      return loaded.campaignState
        || loaded.snapshot
        || loaded.state
        || loaded.checkpoint?.campaignState
        || loaded.checkpoint?.snapshot
        || loaded.checkpoint?.state
        || loaded;
    } catch {
      return null;
    }
  }

  function legacyProjectionFromRepair(coreRecovery = {}, {
    sourceKind,
    hasCommittedOutcome = false,
    autoRollback = false,
    revision = null
  } = {}) {
    const projection = coreRecovery?.decision?.legacyProjection;
    if (projection && typeof projection === 'object') return projection;
    const hasRevision = revision !== null && revision !== undefined && revision !== '' && Number.isFinite(Number(revision));
    const rollback = sourceKind !== 'directiveResponse' && autoRollback === true && hasRevision;
    const invalidated = !hasCommittedOutcome;
    return {
      kind: 'directive.repairLegacyProjection.v1',
      sourceProjectionStatus: invalidated ? 'invalidated' : 'recoveryRequired',
      responseProjectionStatus: invalidated ? 'invalidated' : 'recoveryRequired',
      recoveryJournalStatus: rollback ? 'rollbackPending' : (invalidated ? 'invalidated' : 'reviewRequired'),
      returnedAction: rollback ? 'rolledBack' : (invalidated ? 'invalidated' : 'reviewRequired'),
      shouldRestoreRevision: rollback,
      restoreRevision: rollback ? Number(revision) : null
    };
  }

  function rollbackActuationFromRepair(coreRecovery = {}, {
    legacyProjection = null,
    eventType = null,
    eventTime = null
  } = {}) {
    const authorizeRollback = repair.authorizeRollback || repair.evaluateRollbackActuation;
    if (typeof authorizeRollback === 'function') {
      return authorizeRollback.call(repair, {
        coreRecovery,
        legacyProjection,
        eventType,
        eventTime
      });
    }
    const restoreRevision = legacyProjection?.restoreRevision;
    const authorized = (
      legacyProjection?.shouldRestoreRevision === true
      && restoreRevision !== null
      && restoreRevision !== undefined
      && Number.isFinite(Number(restoreRevision))
    );
    return {
      kind: 'directive.repairRollbackActuationDecision.v1',
      authorized,
      action: authorized ? 'restorePreOutcomeRevision' : 'blockRollbackActuation',
      reason: authorized ? 'legacy-projection-rollback-fallback' : 'repair-rollback-not-authorized',
      eventType,
      sourceKind: 'playerIngress',
      restoreRevision: authorized ? Number(restoreRevision) : null,
      observedAt: eventTime || null
    };
  }

  async function reconcile({
    type,
    hostMessageId,
    replacementText = null,
    message = null,
    index = null,
    chatMetadata = null,
    visibilityMap = null,
    autoRollback = false,
    selectedSwipe = null
  } = {}) {
    const state = getCampaignState();
    const ingress = await findLedgerIngressAsync(state, { hostMessageId }, { coreTurnStore });
    const response = ingress ? null : await findLedgerResponseAsync(state, { hostMessageId }, { coreTurnStore });
    if (!ingress && !response) {
      const eventType = sourceMutationEventType(type);
      const eventTime = timestamp(now);
      const coreRecovery = await recordRepairSourceMutationRecovery({
        state,
        campaignState: state,
        eventType,
        eventTime,
        hostMessageId,
        replacementText,
        preOutcomeRevision: null,
        autoRollback,
        message,
        index,
        chatMetadata,
        visibilityMap,
        selectedSwipe
      });
      const dependentInvalidation = applyRepairDependentInvalidation(state, coreRecovery, {
        hostMessageId,
        eventType,
        eventTime
      });
      if (
        dependentInvalidation.sceneHandshake.invalidatedCount > 0
        || dependentInvalidation.missionComponents.markedCount > 0
      ) {
        let next = dependentInvalidation.campaignState;
        setCampaignState(next);
        await save(`Message recovery: ${eventType}.`);
        if (typeof syncPrompt === 'function') {
          const synchronized = await syncPrompt(next);
          const synchronizedState = synchronized?.campaignState || synchronized;
          if (synchronizedState && typeof synchronizedState === 'object') {
            next = cloneJson(synchronizedState);
            setCampaignState(next);
            await save(`Prompt context synchronized after ${eventType} recovery.`);
          }
        }
        return {
          ok: true,
          matched: true,
          action: dependentInvalidation.sceneHandshake.invalidatedCount > 0 ? 'sceneHandshakeInvalidated' : 'missionComponentSourceInvalidated',
          sceneHandshake: dependentInvalidation.sceneHandshake.invalidatedCount > 0 ? {
            invalidatedCount: dependentInvalidation.sceneHandshake.invalidatedCount,
            settlementIds: cloneJson(dependentInvalidation.sceneHandshake.settlementIds)
          } : null,
          missionComponents: dependentInvalidation.missionComponents.markedCount > 0 ? {
            markedCount: dependentInvalidation.missionComponents.markedCount,
            componentIds: cloneJson(dependentInvalidation.missionComponents.componentIds),
            sourceStatus: dependentInvalidation.missionComponents.sourceStatus || null
          } : null,
          campaignState: cloneJson(next)
        };
      }
      return {
        ok: true,
        matched: false,
        action: 'ignored'
      };
    }
    if (response) {
      const eventType = sourceMutationEventType(type, { response });
      const eventTime = timestamp(now);
      if (eventType === 'directiveResponseSelectedSwipeChanged') {
        const acceptedCorrection = await acceptCorrectAsSwipeSelection({
          campaignState: state,
          response,
          selectedSwipe,
          message,
          now: () => eventTime,
          updateResponse: (latest, responseUpdateId, correctionCase) => {
            const currentResponse = findResponse(latest, responseUpdateId) || response;
            const currentCorrectAsSwipe = currentResponse?.correctAsSwipe && typeof currentResponse.correctAsSwipe === 'object'
              ? currentResponse.correctAsSwipe
              : {};
            const cases = Array.isArray(currentCorrectAsSwipe.cases) ? currentCorrectAsSwipe.cases : [];
            return updateDirectiveResponse(latest, responseUpdateId, {
              correctAsSwipe: {
                ...currentCorrectAsSwipe,
                cases: [
                  ...cases.filter((entry) => entry?.id !== correctionCase.id),
                  correctionCase
                ],
                selectedCaseId: correctionCase.id,
                lastAcceptedCaseId: correctionCase.id,
                lastCaseId: correctionCase.id,
                lastCandidateSwipe: cloneJson(correctionCase.candidateSwipe || null)
              }
            });
          },
          persist: async (next, summary) => {
            setCampaignState(next);
            await save(summary);
          }
        });
        if (acceptedCorrection.matched === true) {
          return {
            ok: true,
            matched: true,
            action: acceptedCorrection.action,
            response: cloneJson(response),
            correctionCase: cloneJson(acceptedCorrection.correctionCase),
            selectedSwipeIndex: acceptedCorrection.selectedSwipeIndex,
            campaignState: cloneJson(getCampaignState())
          };
        }
      }
      const revision = preOutcomeRevision(state, {
        id: response.ingressId,
        outcomeId: response.outcomeId
      });
      const coreRecovery = await recordRepairSourceMutationRecovery({
        state,
        campaignState: state,
        eventType,
        eventTime,
        hostMessageId,
        replacementText,
        response,
        preOutcomeRevision: revision,
        autoRollback,
        message,
        index,
        chatMetadata,
        visibilityMap,
        selectedSwipe
      });
      const legacyProjection = legacyProjectionFromRepair(coreRecovery, {
        sourceKind: 'directiveResponse',
        hasCommittedOutcome: Boolean(response.outcomeId),
        autoRollback,
        revision
      });
      if (!coreRecoveryRecorded(coreRecovery)) {
        return {
          ok: false,
          matched: true,
          action: 'coreRecoveryRequired',
          reason: 'source-mutation-core-recovery-required',
          response: cloneJson(response),
          coreRecovery: cloneJson(coreRecovery || null),
          campaignState: cloneJson(state)
        };
      }
      let next = updateDirectiveResponse(state, response.id, {
        status: legacyProjection.responseProjectionStatus || legacyProjection.sourceProjectionStatus || 'recoveryRequired',
        invalidatedAt: eventTime,
        invalidationType: eventType,
        replacementText: compact(replacementText) || null,
        editedAt: eventType === 'directiveResponseEdited' ? eventTime : response.editedAt || null,
        deletedAt: eventType === 'directiveResponseDeleted' ? eventTime : response.deletedAt || null,
        selectedSwipeChangedAt: eventType === 'directiveResponseSelectedSwipeChanged'
          ? eventTime
          : response.selectedSwipeChangedAt || null
      });
      const dependentInvalidation = applyRepairDependentInvalidation(next, coreRecovery, {
        hostMessageId,
        eventType,
        eventTime
      });
      next = dependentInvalidation.campaignState;
      setCampaignState(next);
      await save(`Message recovery: ${eventType}.`);
      if (typeof syncPrompt === 'function') {
        const synchronized = await syncPrompt(next);
        const synchronizedState = synchronized?.campaignState || synchronized;
        if (synchronizedState && typeof synchronizedState === 'object') {
          next = cloneJson(synchronizedState);
          setCampaignState(next);
          await save(`Prompt context synchronized after ${eventType} recovery.`);
        }
      }
      return {
        ok: true,
        matched: true,
        action: legacyProjection.returnedAction || 'reviewRequired',
        response: cloneJson(response),
        preOutcomeRevision: revision,
        sceneHandshake: dependentInvalidation.sceneHandshake.invalidatedCount > 0 ? {
          invalidatedCount: dependentInvalidation.sceneHandshake.invalidatedCount,
          settlementIds: cloneJson(dependentInvalidation.sceneHandshake.settlementIds)
        } : null,
        missionComponents: dependentInvalidation.missionComponents.markedCount > 0 ? {
          markedCount: dependentInvalidation.missionComponents.markedCount,
          componentIds: cloneJson(dependentInvalidation.missionComponents.componentIds),
          sourceStatus: dependentInvalidation.missionComponents.sourceStatus || null
        } : null,
        campaignState: cloneJson(next)
      };
    }
    const eventType = sourceMutationEventType(type, { ingress });
    const eventTime = timestamp(now);
    const revision = preOutcomeRevision(state, ingress);
    const coreRecovery = await recordRepairSourceMutationRecovery({
      state,
      campaignState: state,
      eventType,
      eventTime,
      hostMessageId,
      replacementText,
      ingress,
      preOutcomeRevision: revision,
      autoRollback,
      message,
      index,
      chatMetadata,
      visibilityMap,
      selectedSwipe
    });
    const legacyProjection = legacyProjectionFromRepair(coreRecovery, {
      sourceKind: 'playerIngress',
      hasCommittedOutcome: Boolean(ingress.outcomeId),
      autoRollback,
      revision
    });
    if (!coreRecoveryRecorded(coreRecovery)) {
      return {
        ok: false,
        matched: true,
        action: 'coreRecoveryRequired',
        reason: 'source-mutation-core-recovery-required',
        ingress: cloneJson(ingress),
        coreRecovery: cloneJson(coreRecovery || null),
        campaignState: cloneJson(state)
      };
    }
    const rollbackActuation = (autoRollback === true || legacyProjection.shouldRestoreRevision === true)
      ? rollbackActuationFromRepair(coreRecovery, {
        legacyProjection,
        eventType,
        eventTime
      })
      : null;
    let rollbackExecution = null;
    if (rollbackActuation?.authorized === true && Number.isFinite(Number(rollbackActuation.restoreRevision))) {
      const coreCheckpointRef = sourceMutationCoreCheckpointRef(state, ingress);
      const coreCheckpointRestoreState = await loadSourceMutationCheckpointState({
        state,
        campaignState: state,
        ingress: cloneJson(ingress),
        outcomeId: ingress.outcomeId || null,
        transactionId: ingress.coreTransactionId || coreRecovery?.transactionId || rollbackActuation.transactionId || null,
        restoreRevision: rollbackActuation.restoreRevision,
        coreRecovery,
        rollbackActuation,
        legacyProjection,
        eventType,
        eventTime,
        coreCheckpointRef
      });
      rollbackExecution = await executeRepairRollbackActuation({
        coreRecovery,
        rollbackActuation,
        legacyProjection,
        eventType,
        eventTime,
        coreCheckpointRef,
        coreCheckpointRestoreState,
        campaignState: state,
        reason: `${eventType} rolled the campaign back before outcome ${ingress.outcomeId}.`
      });
      if (rollbackExecution?.status !== 'applied' || !rollbackExecution.campaignState) {
        return {
          ok: true,
          matched: true,
          action: 'rollbackBlocked',
          ingress: cloneJson(ingress),
          preOutcomeRevision: revision,
          campaignState: cloneJson(state)
        };
      }
    }
    let next = updateTurnIngress(rollbackExecution?.campaignState || state, ingress.id, {
      status: legacyProjection.sourceProjectionStatus || 'recoveryRequired',
      invalidatedAt: eventTime,
      invalidationType: eventType,
      replacementText: compact(replacementText) || null,
      editedAt: eventType === 'playerMessageEdited' ? eventTime : ingress.editedAt || null,
      deletedAt: eventType === 'playerMessageDeleted' ? eventTime : ingress.deletedAt || null,
      selectedSwipeChangedAt: eventType === 'playerMessageSelectedSwipeChanged'
        ? eventTime
        : ingress.selectedSwipeChangedAt || null
    });
    const dependentInvalidation = applyRepairDependentInvalidation(next, coreRecovery, {
      hostMessageId,
      eventType,
      eventTime
    });
    next = dependentInvalidation.campaignState;

    let action = legacyProjection.returnedAction || 'reviewRequired';
    if (rollbackExecution?.status === 'applied') {
      action = legacyProjection.returnedAction || 'rolledBack';
    } else if (legacyProjection.shouldRestoreRevision === true) {
      action = 'rollbackBlocked';
    }
    setCampaignState(next);
    await save(`Message recovery: ${eventType}.`);
    if (typeof syncPrompt === 'function') {
      const synchronized = await syncPrompt(next);
      const synchronizedState = synchronized?.campaignState || synchronized;
      if (synchronizedState && typeof synchronizedState === 'object') {
        next = cloneJson(synchronizedState);
        setCampaignState(next);
        await save(`Prompt context synchronized after ${eventType} recovery.`);
      }
    }
    return {
      ok: true,
      matched: true,
      action,
      ingress: cloneJson(ingress),
      preOutcomeRevision: revision,
      sceneHandshake: dependentInvalidation.sceneHandshake.invalidatedCount > 0 ? {
        invalidatedCount: dependentInvalidation.sceneHandshake.invalidatedCount,
        settlementIds: cloneJson(dependentInvalidation.sceneHandshake.settlementIds)
      } : null,
      missionComponents: dependentInvalidation.missionComponents.markedCount > 0 ? {
        markedCount: dependentInvalidation.missionComponents.markedCount,
        componentIds: cloneJson(dependentInvalidation.missionComponents.componentIds),
        sourceStatus: dependentInvalidation.missionComponents.sourceStatus || null
      } : null,
      campaignState: cloneJson(next)
    };
  }

  const reconcileEdited = (options = {}) => reconcile({ ...options, type: 'edited' });
  const reconcileDeleted = (options = {}) => reconcile({ ...options, type: 'deleted' });
  const reconcileSelectedSwipeChanged = (options = {}) => reconcile({ ...options, type: 'selectedSwipeChanged' });
  async function reconcileVisibilityChanged({
    hostMessageId,
    message = null,
    index = null,
    chatMetadata = null,
    visibilityMap = null
  } = {}) {
    const state = getCampaignState();
    const ingress = await findLedgerIngressAsync(state, { hostMessageId }, { coreTurnStore });
    const response = ingress ? null : await findLedgerResponseAsync(state, { hostMessageId }, { coreTurnStore });
    if (!ingress && !response) {
      return {
        ok: true,
        matched: false,
        action: 'ignored'
      };
    }
    const eventType = 'hostMessageVisibilityChanged';
    const eventTime = timestamp(now);
    const coreVisibility = await recordRepairVisibilityMutation({
      state,
      eventType,
      eventTime,
      hostMessageId,
      ingress,
      response,
      message,
      index,
      chatMetadata,
      visibilityMap
    });
    if (coreVisibility?.decision?.action === 'sourceMutationDetected') {
      return reconcileDeleted({
        hostMessageId,
        message,
        index,
        chatMetadata,
        visibilityMap
      });
    }
    if (coreVisibility?.decision?.action !== 'visibilityOnlySourceRow') {
      return {
        ok: true,
        matched: false,
        action: coreVisibility?.decision?.action || 'sourceRowContinues',
        sourceRowExists: true,
        visibility: cloneJson(coreVisibility?.visibility || null)
      };
    }
    return {
      ok: true,
      matched: true,
      action: 'visibilityOnlySourceRow',
      sourceKind: response ? 'directiveResponse' : 'playerIngress',
      ingress: ingress ? cloneJson(ingress) : null,
      response: response ? cloneJson(response) : null,
      coreVisibility: cloneJson(coreVisibility),
      visibility: cloneJson(coreVisibility.visibility || null),
      campaignState: cloneJson(getCampaignState())
    };
  }
  return {
    reconcileEdited,
    reconcileDeleted,
    reconcileSelectedSwipeChanged,
    reconcileVisibilityChanged,
    handleEdit(campaignState, payload = {}) {
      if (campaignState && typeof setCampaignState === 'function') setCampaignState(campaignState);
      return reconcileEdited({
        hostMessageId: payload.hostMessageId || payload.messageId || payload.message_id || payload.id || payload.index,
        replacementText: payload.text || payload.mes || payload.content || payload.message?.mes || payload.message?.content || null,
        message: payload.message || payload,
        index: payload.index || payload.message?.index || null,
        chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
        visibilityMap: payload.visibilityMap || null,
        autoRollback: payload.autoRollback === true
      });
    },
    handleDelete(campaignState, payload = {}) {
      if (campaignState && typeof setCampaignState === 'function') setCampaignState(campaignState);
      return reconcileDeleted({
        hostMessageId: payload.hostMessageId || payload.messageId || payload.message_id || payload.id || payload.index,
        message: payload.message || payload,
        index: payload.index || payload.message?.index || null,
        chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
        visibilityMap: payload.visibilityMap || null,
        autoRollback: payload.autoRollback === true
      });
    },
    handleVisibilityChange(campaignState, payload = {}) {
      if (campaignState && typeof setCampaignState === 'function') setCampaignState(campaignState);
      return reconcileVisibilityChanged({
        hostMessageId: payload.hostMessageId || payload.messageId || payload.message_id || payload.id || payload.index,
        message: payload.message || payload,
        index: payload.index || payload.message?.index || null,
        chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
        visibilityMap: payload.visibilityMap || null
      });
    },
    handleSelectedSwipeChange(campaignState, payload = {}) {
      if (campaignState && typeof setCampaignState === 'function') setCampaignState(campaignState);
      return reconcileSelectedSwipeChanged({
        hostMessageId: payload.hostMessageId || payload.messageId || payload.message_id || payload.id || payload.index,
        selectedSwipe: payload.selectedSwipe || payload,
        message: payload.message || payload,
        index: payload.index || payload.message?.index || null,
        chatMetadata: payload.chatMetadata || payload.chat_metadata || null,
        visibilityMap: payload.visibilityMap || null
      });
    }
  };
}

export const __messageReconcilerTestHooks = Object.freeze({
  findIngress,
  preOutcomeRevision,
  sourceMutationEventType,
  applyRepairDependentInvalidation
});
