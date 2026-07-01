import {
  recordRecoveryEvent,
  updateDirectiveResponse,
  updateTurnIngress
} from './state-delta-gateway.mjs';
import { markMissionComponentsSourceStatus } from './mission-components.mjs';
import { createRepairCommandBoundary } from './repair-command-boundary.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim();
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function findIngress(campaignState, hostMessageId) {
  const id = compact(hostMessageId);
  return (campaignState?.runtimeTracking?.ingressLedger || []).find((entry) => entry.hostMessageId === id) || null;
}

function findResponse(campaignState, hostMessageId) {
  const id = compact(hostMessageId);
  return (campaignState?.runtimeTracking?.responseLedger || []).find((entry) => entry.hostMessageId === id) || null;
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

function sceneHandshakeRecordMatchesMessage(record = {}, hostMessageId = '') {
  const id = compact(hostMessageId);
  if (!id) return false;
  return record.previousAssistantHostMessageId === id
    || record.currentPlayerHostMessageId === id
    || (Array.isArray(record.sourceMessageIds) && record.sourceMessageIds.includes(id))
    || (Array.isArray(record.sourceAnchorRange?.sourceMessageIds) && record.sourceAnchorRange.sourceMessageIds.includes(id));
}

function sceneHandshakeRecordAlreadyInactive(record = {}) {
  return Boolean(
    record.invalidatedAt
    || record.sourceStale === true
    || ['invalidated', 'source-stale', 'superseded'].includes(String(record.status || '').toLowerCase())
  );
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
        eventType: patch.invalidationType,
        replacementText: patch.replacementText || null
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
          eventType: patch.invalidationType,
          replacementText: patch.replacementText || null
        }
      };
    })
    : next.threadLedger.records;

  return next;
}

function invalidateSceneHandshakeSources(campaignState = {}, {
  hostMessageId,
  eventType,
  eventTime,
  replacementText = null
} = {}) {
  const id = compact(hostMessageId);
  if (!id) return { campaignState, invalidatedCount: 0, settlementIds: [] };
  const next = cloneJson(campaignState);
  const patch = {
    hostMessageId: id,
    invalidatedAt: eventTime,
    invalidationType: eventType,
    replacementText: compact(replacementText) || null
  };
  const settlementIds = [];
  const tracking = next.runtimeTracking || {};
  tracking.sceneHandshake = tracking.sceneHandshake || {};
  for (const [key, records] of sceneHandshakeCollections(next)) {
    tracking.sceneHandshake[key] = records.map((record) => {
      if (!sceneHandshakeRecordMatchesMessage(record, id) || sceneHandshakeRecordAlreadyInactive(record)) return record;
      settlementIds.push(record.id);
      return {
        ...record,
        status: 'invalidated',
        sourceStale: true,
        invalidatedAt: eventTime,
        invalidationType: eventType,
        replacementText: patch.replacementText,
        previousStatus: record.status || null
      };
    });
  }
  if (
    tracking.sceneHandshake.lastResult
    && sceneHandshakeRecordMatchesMessage(tracking.sceneHandshake.lastResult, id)
    && !sceneHandshakeRecordAlreadyInactive(tracking.sceneHandshake.lastResult)
  ) {
    settlementIds.push(tracking.sceneHandshake.lastResult.id);
    tracking.sceneHandshake.lastResult = {
      ...tracking.sceneHandshake.lastResult,
      status: 'invalidated',
      sourceStale: true,
      invalidatedAt: eventTime,
      invalidationType: eventType,
      replacementText: patch.replacementText,
      previousStatus: tracking.sceneHandshake.lastResult.status || null
    };
  }
  next.runtimeTracking = tracking;
  const uniqueSettlementIds = [...new Set(settlementIds.map(compact).filter(Boolean))];
  if (!uniqueSettlementIds.length) {
    return { campaignState, invalidatedCount: 0, settlementIds: [] };
  }
  let invalidated = invalidateDerivedSceneHandshakeRecords(next, uniqueSettlementIds, patch);
  invalidated = recordRecoveryEvent(invalidated, {
    type: 'sceneHandshakeSourceInvalidated',
    status: 'reviewRequired',
    hostMessageId: id,
    recordedAt: eventTime,
    details: {
      eventType,
      replacementText: patch.replacementText,
      settlementIds: uniqueSettlementIds,
      invalidatedSettlementCount: uniqueSettlementIds.length
    }
  });
  return {
    campaignState: invalidated,
    invalidatedCount: uniqueSettlementIds.length,
    settlementIds: uniqueSettlementIds
  };
}

function markMissionComponentSources(campaignState = {}, {
  hostMessageId,
  eventType,
  eventTime
} = {}) {
  const id = compact(hostMessageId);
  if (!id) return { campaignState, markedCount: 0 };
  const sourceStatus = /deleted/i.test(String(eventType || '')) ? 'deleted' : 'stale';
  const marked = markMissionComponentsSourceStatus(campaignState, id, {
    sourceStatus,
    now: eventTime
  });
  if (!marked.markedCount) return marked;
  return {
    campaignState: recordRecoveryEvent(marked.campaignState, {
      type: sourceStatus === 'deleted' ? 'missionComponentSourceDeleted' : 'missionComponentSourceEdited',
      status: 'reviewRequired',
      hostMessageId: id,
      recordedAt: eventTime,
      details: {
        sourceStatus,
        markedCount: marked.markedCount
      }
    }),
    markedCount: marked.markedCount
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
    const ingress = findIngress(state, hostMessageId);
    const response = ingress ? null : findResponse(state, hostMessageId);
    if (!ingress && !response) {
      const eventType = sourceMutationEventType(type);
      const eventTime = timestamp(now);
      const invalidated = invalidateSceneHandshakeSources(state, {
        hostMessageId,
        eventType,
        eventTime,
        replacementText
      });
      const markedComponents = markMissionComponentSources(invalidated.campaignState, {
        hostMessageId,
        eventType,
        eventTime
      });
      if (invalidated.invalidatedCount > 0 || markedComponents.markedCount > 0) {
        let next = markedComponents.campaignState;
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
          action: invalidated.invalidatedCount > 0 ? 'sceneHandshakeInvalidated' : 'missionComponentSourceInvalidated',
          sceneHandshake: invalidated.invalidatedCount > 0 ? {
            invalidatedCount: invalidated.invalidatedCount,
            settlementIds: cloneJson(invalidated.settlementIds)
          } : null,
          missionComponents: markedComponents.markedCount > 0 ? {
            markedCount: markedComponents.markedCount
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
      const revision = preOutcomeRevision(state, {
        id: response.ingressId,
        outcomeId: response.outcomeId
      });
      const coreRecovery = await recordRepairSourceMutationRecovery({
        state,
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
      next = recordRecoveryEvent(next, {
        type: eventType,
        status: legacyProjection.recoveryJournalStatus || 'reviewRequired',
        hostMessageId,
        ingressId: response.ingressId || null,
        outcomeId: response.outcomeId || null,
        recordedAt: eventTime,
        details: {
          replacementText: compact(replacementText) || null,
          preOutcomeRevision: revision,
          responseId: response.id,
          responseKind: response.responseKind || null,
          turnId: response.turnId || null,
          coreRecovery
        }
      });
      const invalidated = invalidateSceneHandshakeSources(next, {
        hostMessageId,
        eventType,
        eventTime,
        replacementText
      });
      const markedComponents = markMissionComponentSources(invalidated.campaignState, {
        hostMessageId,
        eventType,
        eventTime
      });
      next = markedComponents.campaignState;
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
        sceneHandshake: invalidated.invalidatedCount > 0 ? {
          invalidatedCount: invalidated.invalidatedCount,
          settlementIds: cloneJson(invalidated.settlementIds)
        } : null,
        missionComponents: markedComponents.markedCount > 0 ? {
          markedCount: markedComponents.markedCount
        } : null,
        campaignState: cloneJson(next)
      };
    }
    const eventType = sourceMutationEventType(type, { ingress });
    const eventTime = timestamp(now);
    const revision = preOutcomeRevision(state, ingress);
    const coreRecovery = await recordRepairSourceMutationRecovery({
      state,
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
    const rollbackActuation = (autoRollback === true || legacyProjection.shouldRestoreRevision === true)
      ? rollbackActuationFromRepair(coreRecovery, {
        legacyProjection,
        eventType,
        eventTime
      })
      : null;
    let rollbackExecution = null;
    if (rollbackActuation?.authorized === true && Number.isFinite(Number(rollbackActuation.restoreRevision))) {
      rollbackExecution = await executeRepairRollbackActuation({
        coreRecovery,
        rollbackActuation,
        legacyProjection,
        eventType,
        eventTime,
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
    next = recordRecoveryEvent(next, {
      type: eventType,
      status: legacyProjection.recoveryJournalStatus || 'reviewRequired',
      hostMessageId,
      ingressId: ingress.id,
      outcomeId: ingress.outcomeId,
      recordedAt: eventTime,
      details: {
        replacementText: compact(replacementText) || null,
        preOutcomeRevision: revision,
        coreRecovery,
        rollbackActuation: rollbackActuation ? cloneJson(rollbackActuation) : null
      }
    });
    const invalidated = invalidateSceneHandshakeSources(next, {
      hostMessageId,
      eventType,
      eventTime,
      replacementText
    });
    const markedComponents = markMissionComponentSources(invalidated.campaignState, {
      hostMessageId,
      eventType,
      eventTime
    });
    next = markedComponents.campaignState;

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
      sceneHandshake: invalidated.invalidatedCount > 0 ? {
        invalidatedCount: invalidated.invalidatedCount,
        settlementIds: cloneJson(invalidated.settlementIds)
      } : null,
      missionComponents: markedComponents.markedCount > 0 ? {
        markedCount: markedComponents.markedCount
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
    const ingress = findIngress(state, hostMessageId);
    const response = ingress ? null : findResponse(state, hostMessageId);
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
  invalidateSceneHandshakeSources,
  markMissionComponentSources
});
