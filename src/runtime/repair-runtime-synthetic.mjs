import {
  hashStableJson,
  normalizeHostMessageVisibility
} from './architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function textHashFromMessage(message = {}) {
  if (message.textHash) return message.textHash;
  const text = message.mes ?? message.text ?? message.messageText;
  if (text === undefined) return null;
  return hashStableJson({ text: String(text) });
}

function mutationKind(value) {
  return asString(value, 'unknown-mutation');
}

function isEditKind(kind) {
  return /edited|edit|swipe/i.test(String(kind || ''));
}

function isDeleteKind(kind) {
  return /deleted|delete|removed|remove/i.test(String(kind || ''));
}

function uniqueStrings(items = []) {
  return [...new Set(items.map((item) => asString(item)).filter(Boolean))];
}

function buildSourceMutation({
  mutation = {},
  normalizedVisibility = {},
  sourceMutation,
  sourceMutationReasons = []
}) {
  return compact({
    kind: 'directive.repairSourceMutation.v1',
    mutationId: asString(mutation.mutationId),
    mutationKind: mutationKind(mutation.mutationKind),
    hostMessageId: asString(mutation.hostMessageId || mutation.message?.id || mutation.message?.mesid),
    role: asString(mutation.role),
    oldTextHash: mutation.oldTextHash || null,
    newTextHash: mutation.newTextHash || textHashFromMessage(mutation.message) || null,
    sourceMutation: Boolean(sourceMutation),
    sourceMutationReasons: uniqueStrings(sourceMutationReasons),
    visibilityMutationReasons: uniqueStrings(normalizedVisibility.visibilityMutationReasons || []),
    sourceRowExists: normalizedVisibility.sourceRowExists !== false,
    summarizedBySummaryception: Boolean(normalizedVisibility.summarizedBySummaryception),
    hiddenByHost: Boolean(normalizedVisibility.hiddenByHost),
    hiddenByExternal: Boolean(normalizedVisibility.hiddenByExternal),
    ghostedBySummaryception: Boolean(normalizedVisibility.ghostedBySummaryception),
    promptExcludedByVectFox: Boolean(normalizedVisibility.promptExcludedByVectFox),
    hiddenByMemoryBooks: Boolean(normalizedVisibility.hiddenByMemoryBooks),
    unhiddenByMemoryBooks: Boolean(normalizedVisibility.unhiddenByMemoryBooks)
  });
}

function hasDependentState(mutation = {}) {
  const dependent = mutation.dependent || {};
  const latest = mutation.latestBoundary || {};
  return Boolean(
    dependent.outcomeId
    || dependent.responseId
    || dependent.assistantHostMessageId
    || mutation.dependentOutcomeId
    || mutation.dependentResponseId
    || latest.hasDependentAssistant
    || latest.hasCommittedOutcome
  );
}

function isLatestRestartable(mutation = {}) {
  const latest = mutation.latestBoundary || {};
  return Boolean(latest.isLatestActionablePlayerRow || latest.isLatestPlayerRow || latest.latestPlayerRow);
}

function defaultAllowedActions(mutation = {}) {
  if (mutation.allowedActions?.length) return [...mutation.allowedActions];
  return ['rollback-outcome', 'replace-dependent-response', 'branch', 'review'];
}

export function createSyntheticRepairRuntime({
  coreStore,
  clock = () => new Date().toISOString(),
  cancelBackgroundWork = () => null,
  restartSameTransaction = () => null,
  classifyTurn = () => null
} = {}) {
  if (!coreStore?.markRecoveryRequired) {
    throw new Error('createSyntheticRepairRuntime requires a CORE Store instance');
  }

  const handledMutations = new Map();

  async function handleHostMutation(mutation = {}) {
    const idempotencyKey = mutation.idempotencyKey || mutation.mutationId || `repair:${mutation.transactionId || 'unknown'}:${mutationKind(mutation.mutationKind)}`;
    if (handledMutations.has(idempotencyKey)) return cloneJson(handledMutations.get(idempotencyKey));

    const observedAt = mutation.observedAt || clock();
    const kind = mutationKind(mutation.mutationKind);
    const normalizedVisibility = normalizeHostMessageVisibility(mutation.message || {}, {
      index: mutation.index,
      chatMetadata: mutation.chatMetadata,
      visibilityMap: mutation.visibilityMap
    });
    const editSourceMutation = isEditKind(kind) && Boolean(
      mutation.sourceMutation
      || mutation.oldTextHash
      || mutation.newTextHash
      || (mutation.oldTextHash && mutation.newTextHash && mutation.oldTextHash !== mutation.newTextHash)
    );
    const deleteSourceMutation = isDeleteKind(kind) || normalizedVisibility.sourceMutation;
    const sourceMutation = Boolean(mutation.sourceMutation || editSourceMutation || deleteSourceMutation);
    const sourceMutationReasons = uniqueStrings([
      ...(normalizedVisibility.sourceMutationReasons || []),
      editSourceMutation ? kind : null,
      deleteSourceMutation && !normalizedVisibility.sourceMutationReasons?.length ? kind : null
    ]);
    const sourceMutationBundle = buildSourceMutation({
      mutation,
      normalizedVisibility,
      sourceMutation,
      sourceMutationReasons
    });
    const dependent = mutation.dependent || {};

    if (!sourceMutation && normalizedVisibility.visibilityMutationOnly) {
      const result = {
        action: 'visibilityOnlySourceRow',
        normalTurnAllowed: false,
        recoveryRequired: false,
        sourceRowExists: normalizedVisibility.sourceRowExists !== false,
        observedAt,
        visibility: cloneJson(normalizedVisibility)
      };
      handledMutations.set(idempotencyKey, result);
      return cloneJson(result);
    }

    if (!sourceMutation) {
      const result = {
        action: 'sourceRowContinues',
        normalTurnAllowed: false,
        recoveryRequired: false,
        sourceRowExists: normalizedVisibility.sourceRowExists !== false,
        observedAt,
        visibility: cloneJson(normalizedVisibility)
      };
      handledMutations.set(idempotencyKey, result);
      return cloneJson(result);
    }

    if (isLatestRestartable(mutation) && !hasDependentState(mutation)) {
      const cancelResult = await cancelBackgroundWork({
        transactionId: mutation.transactionId || null,
        sourceToken: mutation.sourceToken || null,
        mutationId: mutation.mutationId || null,
        reason: 'latest-source-mutated-before-dependent-response',
        observedAt
      });
      const restartResult = await restartSameTransaction({
        transactionId: mutation.transactionId || null,
        sourceToken: mutation.sourceToken || null,
        mutationId: mutation.mutationId || null,
        sourceMutation: cloneJson(sourceMutationBundle),
        observedAt
      });
      const result = {
        action: 'restartSameTransaction',
        normalTurnAllowed: false,
        recoveryRequired: false,
        canceled: Boolean(cancelResult),
        restarted: Boolean(restartResult),
        observedAt,
        sourceMutation: cloneJson(sourceMutationBundle)
      };
      handledMutations.set(idempotencyKey, result);
      return cloneJson(result);
    }

    const cancelResult = await cancelBackgroundWork({
      transactionId: mutation.transactionId || null,
      sourceToken: mutation.sourceToken || null,
      mutationId: mutation.mutationId || null,
      reason: 'dependent-source-mutated',
      observedAt
    });
    const recovery = await coreStore.markRecoveryRequired(mutation.transactionId, {
      id: mutation.recoveryCaseId || `recovery:${mutation.transactionId}:${mutation.mutationId || kind}`,
      reason: mutation.reason || 'dependent-source-mutated',
      status: 'required',
      idempotencyKey,
      sourceMutation: sourceMutationBundle,
      dependentOutcomeId: dependent.outcomeId || mutation.dependentOutcomeId || null,
      dependentResponseId: dependent.responseId || mutation.dependentResponseId || null,
      allowedActions: defaultAllowedActions(mutation)
    });
    const result = {
      action: 'recoveryReview',
      normalTurnAllowed: false,
      recoveryRequired: true,
      canceled: Boolean(cancelResult),
      recovery,
      observedAt,
      sourceMutation: cloneJson(sourceMutationBundle)
    };
    handledMutations.set(idempotencyKey, result);
    return cloneJson(result);
  }

  return {
    handleHostMutation,
    classifyTurn
  };
}
