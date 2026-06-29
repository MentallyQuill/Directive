import {
  createTurnLatencyMetrics,
  hashStableJson
} from './architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function writeBudget(storageWrites = [], generationStartedAt = null) {
  const writes = Array.isArray(storageWrites) ? storageWrites : [];
  const beforeGeneration = writes.filter((write) => {
    if (!generationStartedAt || !write.writtenAt) return true;
    return String(write.writtenAt) <= String(generationStartedAt);
  });
  return {
    beforeGenerationStartCount: beforeGeneration.length,
    beforeGenerationStartBytes: beforeGeneration.reduce((sum, write) => sum + Math.max(0, Number(write.bytes || 0)), 0),
    fullSaveRewriteCount: writes.filter((write) => /saves\/.*\.v1\.json$/i.test(String(write.path || write))).length
  };
}

function responseTextHash(result = {}, fallback = {}) {
  return result.textHash || fallback.textHash || (
    result.text === undefined && result.rawResponse === undefined
      ? null
      : hashStableJson({ text: result.text || result.rawResponse || '' })
  );
}

export function createSyntheticMechanicsNarrationRuntime({
  coreStore,
  clock = () => new Date().toISOString(),
  startNarrationGeneration = async () => ({ textHash: null }),
  scheduleBackgroundEffects = () => null,
  storageWrites = []
} = {}) {
  if (!coreStore?.commitMechanics || !coreStore?.advanceTurn || !coreStore?.recordVisibleResponse) {
    throw new Error('createSyntheticMechanicsNarrationRuntime requires a CORE Store instance');
  }

  async function startDirectiveNarration(transactionId, {
    playerSubmittedAt = null,
    operationBundle = {},
    responseRef = {},
    providerRequest = {},
    backgroundEffects = {}
  } = {}) {
    const mechanics = await coreStore.commitMechanics(transactionId, {
      ...operationBundle,
      phaseAfter: operationBundle.phaseAfter || 'mechanicsPending'
    });
    const directiveGenerationStartedAt = clock();
    await coreStore.advanceTurn(transactionId, {
      phase: 'narrationStarted',
      route: 'directiveCommit',
      reason: 'mechanics-committed-start-narration',
      idempotencyKey: providerRequest.narrationStartedIdempotencyKey || `narration-started:${transactionId}:${mechanics.outcomeId || mechanics.turnId}`,
      timing: {
        playerSubmittedAt,
        directiveGenerationStartedAt,
        outcomeId: mechanics.outcomeId || null
      }
    });

    const backgroundScheduled = Boolean(scheduleBackgroundEffects({
      transactionId,
      mechanics: cloneJson(mechanics),
      sourceToken: providerRequest.sourceToken || null,
      afterGenerationStart: true,
      ...backgroundEffects
    }));

    try {
      const providerResult = await startNarrationGeneration({
        transactionId,
        mechanics: cloneJson(mechanics),
        request: cloneJson(providerRequest),
        startedAt: directiveGenerationStartedAt
      });
      const visibleResponsePostedAt = clock();
      const response = await coreStore.recordVisibleResponse(transactionId, {
        idempotencyKey: responseRef.idempotencyKey || `directive-response:${transactionId}:${mechanics.outcomeId || mechanics.turnId}`,
        responseId: responseRef.responseId || `response:${transactionId}`,
        hostMessageId: responseRef.hostMessageId || null,
        outcomeId: mechanics.outcomeId || responseRef.outcomeId || null,
        responseKind: responseRef.responseKind || 'directiveNarration',
        generationStartedAt: directiveGenerationStartedAt,
        postedAt: visibleResponsePostedAt,
        textHash: responseTextHash(providerResult, responseRef),
        rawResponse: providerResult.rawResponse
      });
      const latency = createTurnLatencyMetrics({
        playerSubmittedAt,
        directiveGenerationStartedAt,
        visibleResponsePostedAt
      });
      return compact({
        status: 'posted',
        transactionId,
        mechanics,
        response,
        directiveGenerationStartedAt,
        visibleResponsePostedAt,
        latency,
        backgroundScheduled,
        storageWrites: writeBudget(storageWrites, directiveGenerationStartedAt)
      });
    } catch (error) {
      const recovery = await coreStore.markRecoveryRequired(transactionId, {
        id: providerRequest.recoveryCaseId || `response-retry:${transactionId}`,
        reason: 'narration-provider-failed',
        idempotencyKey: providerRequest.recoveryIdempotencyKey || `response-retry:${transactionId}`,
        dependentOutcomeId: mechanics.outcomeId || null,
        sourceMutation: {
          sourceMutation: false,
          reason: 'provider-failure-after-mechanics'
        },
        allowedActions: ['retry-response', 'branch', 'review'],
        error: {
          name: error?.name || 'Error',
          message: error?.message || String(error)
        }
      });
      const latency = createTurnLatencyMetrics({
        playerSubmittedAt,
        directiveGenerationStartedAt
      });
      return {
        status: 'responseRetryRequired',
        transactionId,
        mechanics,
        recovery,
        directiveGenerationStartedAt,
        latency,
        backgroundScheduled,
        storageWrites: writeBudget(storageWrites, directiveGenerationStartedAt)
      };
    }
  }

  async function retryDirectiveNarrationResponse(transactionId, {
    outcomeId = null,
    responseId = null,
    hostMessageId = null,
    idempotencyKey = null,
    providerResult = {},
    generationStartedAt = null,
    postedAt = null
  } = {}) {
    const startedAt = generationStartedAt || clock();
    const visiblePostedAt = postedAt || clock();
    return coreStore.recordVisibleResponse(transactionId, {
      idempotencyKey: idempotencyKey || `directive-response:${transactionId}:${outcomeId || responseId || 'retry'}`,
      responseId: responseId || `response:${transactionId}`,
      hostMessageId,
      outcomeId,
      responseKind: 'directiveNarration',
      generationStartedAt: startedAt,
      postedAt: visiblePostedAt,
      textHash: responseTextHash(providerResult),
      rawResponse: providerResult.rawResponse
    });
  }

  return {
    startDirectiveNarration,
    retryDirectiveNarrationResponse
  };
}
