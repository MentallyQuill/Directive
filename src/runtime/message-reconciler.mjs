import {
  recordRecoveryEvent,
  restoreTrackedCampaignRevision,
  updateDirectiveResponse,
  updateTurnIngress
} from './state-delta-gateway.mjs';
import { markMissionComponentsSourceStatus } from './mission-components.mjs';
import { hashStableJson } from './architecture-redesign-contracts.mjs';

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

function findIngressById(campaignState, ingressId) {
  const id = compact(ingressId);
  return (campaignState?.runtimeTracking?.ingressLedger || []).find((entry) => entry.id === id) || null;
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

function replacementTextHash(replacementText = null) {
  const text = compact(replacementText);
  return text ? hashStableJson({ text }) : null;
}

function allowedCoreRecoveryActions({ recoveryStatus, sourceKind, autoRollback = false } = {}) {
  if (autoRollback || recoveryStatus === 'rollbackPending') {
    return ['rollbackToPreOutcomeRevision', 'reviewSourceMutation'];
  }
  if (sourceKind === 'directiveResponse') {
    return recoveryStatus === 'invalidated'
      ? ['discardStaleResponse']
      : ['reviewResponseMutation', 'retryResponse'];
  }
  return recoveryStatus === 'invalidated'
    ? ['discardStaleIngress', 'reobserveSource']
    : ['reviewSourceMutation', 'rerunFromSource', 'branchFromPriorRevision'];
}

export function createMessageReconciler({
  getCampaignState,
  setCampaignState,
  coreTurnStore = null,
  persist = null,
  syncPrompt = null,
  now = null
} = {}) {
  if (typeof getCampaignState !== 'function') throw new Error('getCampaignState must be a function');
  if (typeof setCampaignState !== 'function') throw new Error('setCampaignState must be a function');

  async function save(summary) {
    if (typeof persist === 'function') await persist(getCampaignState(), summary);
  }

  async function markCoreSourceMutationRecovery({
    state,
    eventType,
    eventTime,
    hostMessageId,
    replacementText = null,
    ingress = null,
    response = null,
    recoveryStatus = null,
    preOutcomeRevision: revision = null,
    autoRollback = false
  } = {}) {
    if (typeof coreTurnStore?.markRecoveryRequired !== 'function') return null;
    const sourceIngress = ingress || findIngressById(state, response?.ingressId);
    const transactionId = compact(sourceIngress?.coreTransactionId || response?.coreTransactionId);
    if (!transactionId) return null;
    const sourceKind = response ? 'directiveResponse' : 'playerIngress';
    const recoveryId = `recovery:source-mutation:${transactionId}:${eventType}`;
    try {
      const recoveryCase = await coreTurnStore.markRecoveryRequired(transactionId, {
        id: recoveryId,
        reason: eventType,
        status: 'required',
        sourceMutation: {
          kind: 'directive.sourceMutation.v1',
          sourceKind,
          eventType,
          hostMessageId: compact(hostMessageId) || null,
          ingressId: sourceIngress?.id || response?.ingressId || null,
          responseId: response?.id || null,
          outcomeId: sourceIngress?.outcomeId || response?.outcomeId || null,
          sourceFrameId: sourceIngress?.sourceFrameId || response?.sourceFrameId || null,
          replacementTextHash: replacementTextHash(replacementText),
          replacementTextPresent: Boolean(compact(replacementText)),
          preOutcomeRevision: Number.isFinite(Number(revision)) ? Number(revision) : null,
          autoRollback: autoRollback === true,
          observedAt: eventTime
        },
        dependentOutcomeId: sourceIngress?.outcomeId || response?.outcomeId || null,
        dependentResponseId: response?.id || null,
        allowedActions: allowedCoreRecoveryActions({ recoveryStatus, sourceKind, autoRollback }),
        idempotencyKey: `core-source-mutation:${transactionId}:${eventType}`
      });
      return {
        status: 'recorded',
        transactionId,
        recoveryCaseId: recoveryCase?.id || recoveryId,
        phase: recoveryCase?.phase || 'recoveryRequired',
        reason: recoveryCase?.reason || eventType
      };
    } catch (error) {
      if (error?.code === 'DIRECTIVE_CORE_RECOVERY_ALREADY_REQUIRED') {
        return {
          status: 'alreadyRequired',
          transactionId,
          code: error.code
        };
      }
      throw error;
    }
  }

  async function reconcile({
    type,
    hostMessageId,
    replacementText = null,
    autoRollback = false
  } = {}) {
    const state = getCampaignState();
    const ingress = findIngress(state, hostMessageId);
    const response = ingress ? null : findResponse(state, hostMessageId);
    if (!ingress && !response) {
      const eventType = type === 'deleted' ? 'sceneHandshakeSourceDeleted' : 'sceneHandshakeSourceEdited';
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
      const eventType = type === 'deleted' ? 'directiveResponseDeleted' : 'directiveResponseEdited';
      const eventTime = timestamp(now);
      const revision = preOutcomeRevision(state, {
        id: response.ingressId,
        outcomeId: response.outcomeId
      });
      const hasCommittedOutcome = Boolean(response.outcomeId);
      const recoveryStatus = hasCommittedOutcome ? 'reviewRequired' : 'invalidated';
      const coreRecovery = await markCoreSourceMutationRecovery({
        state,
        eventType,
        eventTime,
        hostMessageId,
        replacementText,
        response,
        recoveryStatus,
        preOutcomeRevision: revision,
        autoRollback
      });
      let next = updateDirectiveResponse(state, response.id, {
        status: hasCommittedOutcome ? 'recoveryRequired' : 'invalidated',
        invalidatedAt: eventTime,
        invalidationType: eventType,
        replacementText: compact(replacementText) || null,
        editedAt: eventType === 'directiveResponseEdited' ? eventTime : response.editedAt || null,
        deletedAt: eventType === 'directiveResponseDeleted' ? eventTime : response.deletedAt || null
      });
      next = recordRecoveryEvent(next, {
        type: eventType,
        status: recoveryStatus,
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
        action: hasCommittedOutcome ? 'reviewRequired' : 'invalidated',
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
    const eventType = type === 'deleted' ? 'playerMessageDeleted' : 'playerMessageEdited';
    const eventTime = timestamp(now);
    const revision = preOutcomeRevision(state, ingress);
    const hasCommittedOutcome = Boolean(ingress.outcomeId);
    const recoveryStatus = autoRollback && revision !== null
      ? 'rollbackPending'
      : hasCommittedOutcome
        ? 'reviewRequired'
        : 'invalidated';
    const coreRecovery = await markCoreSourceMutationRecovery({
      state,
      eventType,
      eventTime,
      hostMessageId,
      replacementText,
      ingress,
      recoveryStatus,
      preOutcomeRevision: revision,
      autoRollback
    });
    let next = updateTurnIngress(state, ingress.id, {
      status: hasCommittedOutcome ? 'recoveryRequired' : 'invalidated',
      invalidatedAt: eventTime,
      invalidationType: eventType,
      replacementText: compact(replacementText) || null,
      editedAt: eventType === 'playerMessageEdited' ? eventTime : ingress.editedAt || null,
      deletedAt: eventType === 'playerMessageDeleted' ? eventTime : ingress.deletedAt || null
    });
    next = recordRecoveryEvent(next, {
      type: eventType,
      status: recoveryStatus,
      hostMessageId,
      ingressId: ingress.id,
      outcomeId: ingress.outcomeId,
      recordedAt: eventTime,
      details: {
        replacementText: compact(replacementText) || null,
        preOutcomeRevision: revision,
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

    let action = hasCommittedOutcome ? 'reviewRequired' : 'invalidated';
    if (autoRollback && revision !== null) {
      next = restoreTrackedCampaignRevision(next, revision, {
        now,
        reason: `${eventType} rolled the campaign back before outcome ${ingress.outcomeId}.`
      });
      action = 'rolledBack';
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
  return {
    reconcileEdited,
    reconcileDeleted,
    handleEdit(campaignState, payload = {}) {
      if (campaignState && typeof setCampaignState === 'function') setCampaignState(campaignState);
      return reconcileEdited({
        hostMessageId: payload.hostMessageId || payload.messageId || payload.message_id || payload.id || payload.index,
        replacementText: payload.text || payload.mes || payload.content || payload.message?.mes || payload.message?.content || null,
        autoRollback: payload.autoRollback === true
      });
    },
    handleDelete(campaignState, payload = {}) {
      if (campaignState && typeof setCampaignState === 'function') setCampaignState(campaignState);
      return reconcileDeleted({
        hostMessageId: payload.hostMessageId || payload.messageId || payload.message_id || payload.id || payload.index,
        autoRollback: payload.autoRollback === true
      });
    }
  };
}

export const __messageReconcilerTestHooks = Object.freeze({
  findIngress,
  preOutcomeRevision,
  invalidateSceneHandshakeSources,
  markMissionComponentSources
});
