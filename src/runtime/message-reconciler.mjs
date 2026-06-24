import {
  recordRecoveryEvent,
  restoreTrackedCampaignRevision,
  updateDirectiveResponse,
  updateTurnIngress
} from './state-delta-gateway.mjs';

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

function preOutcomeRevision(campaignState, ingress) {
  const history = campaignState?.runtimeTracking?.history || [];
  const matching = [...history].reverse().find((entry) => (
    (ingress?.outcomeId && entry.outcomeId === ingress.outcomeId)
    || (ingress?.id && entry.ingressId === ingress.id)
  ));
  return matching ? Number(matching.revision) : null;
}

export function createMessageReconciler({
  getCampaignState,
  setCampaignState,
  persist = null,
  syncPrompt = null,
  now = null
} = {}) {
  if (typeof getCampaignState !== 'function') throw new Error('getCampaignState must be a function');
  if (typeof setCampaignState !== 'function') throw new Error('setCampaignState must be a function');

  async function save(summary) {
    if (typeof persist === 'function') await persist(getCampaignState(), summary);
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
          turnId: response.turnId || null
        }
      });
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
        preOutcomeRevision: revision
      }
    });

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
  preOutcomeRevision
});
