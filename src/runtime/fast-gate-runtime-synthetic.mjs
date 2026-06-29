import {
  createTurnLatencyMetrics,
  createTurnSourceFrameContract,
  hashStableJson
} from './architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function textHashForEvent(hostEvent = {}) {
  return hostEvent.textHash || hashStableJson({
    text: hostEvent.text || hostEvent.messageText || ''
  });
}

function selectedVariantHash(hostEvent = {}) {
  if (hostEvent.selectedAssistantVariantHash) return hostEvent.selectedAssistantVariantHash;
  if (hostEvent.acceptedAssistantVariantHash) return hostEvent.acceptedAssistantVariantHash;
  if (hostEvent.acceptedAssistantVariant === undefined && hostEvent.selectedAssistantVariant === undefined) return null;
  return hashStableJson({
    acceptedAssistantVariant: hostEvent.acceptedAssistantVariant ?? hostEvent.selectedAssistantVariant
  });
}

function unknownExternalPromptEnvironment({ observedAt = null } = {}) {
  return {
    kind: 'directive.externalPromptEnvironment.v1',
    schemaVersion: 1,
    host: 'unknown',
    status: 'unknown',
    observedAt,
    worldInfo: {},
    memoryBooks: {},
    summaryception: {},
    vectFox: {},
    knownExternalPromptKeys: [],
    unknownSignals: ['external-context-not-inspected-fast-gate'],
    redactions: [],
    hash: '0'.repeat(64),
    byteLength: 0
  };
}

function isRecoveryEvent(hostEvent = {}) {
  return Boolean(
    hostEvent.deleted
    || hostEvent.isDeleted
    || hostEvent.staleSource
    || hostEvent.recoveryRequired
    || hostEvent.visibility?.sourceMutation
  );
}

function routePhase(route) {
  if (route === 'hostContinue') return 'hostContinueReleased';
  if (route === 'directiveCommit') return 'mechanicsPending';
  if (route === 'directivePause') return 'visibleResponsePosted';
  if (route === 'recoveryReview') return 'recoveryRequired';
  return 'routePending';
}

function pushWriteBudget(storageWrites = [], generationStartedAt = null) {
  if (!Array.isArray(storageWrites)) {
    return {
      beforeGenerationStartCount: 0,
      beforeGenerationStartBytes: 0,
      fullSaveRewriteCount: 0
    };
  }
  const writesBeforeGeneration = storageWrites.filter((write) => {
    if (!generationStartedAt || !write.writtenAt) return true;
    return String(write.writtenAt) <= String(generationStartedAt);
  });
  return {
    beforeGenerationStartCount: writesBeforeGeneration.length,
    beforeGenerationStartBytes: writesBeforeGeneration.reduce((sum, write) => sum + Math.max(0, Number(write.bytes || 0)), 0),
    fullSaveRewriteCount: storageWrites.filter((write) => /saves\/.*\.v1\.json$/i.test(String(write.path || write))).length
  };
}

export function createSyntheticFastGateRuntime({
  coreStore,
  clock = () => new Date().toISOString(),
  deterministicRoute = () => ({ route: 'hostContinue', reason: 'deterministic-host-continue' }),
  observeExternalPromptEnvironment = async () => null,
  releaseHostGeneration = async () => ({ ok: true }),
  scheduleBackgroundEffects = () => null,
  storageWrites = []
} = {}) {
  if (!coreStore?.beginTurn || !coreStore?.advanceTurn) {
    throw new Error('createSyntheticFastGateRuntime requires a CORE Store instance');
  }

  async function buildFrame(hostEvent = {}, observedAt) {
    const externalPromptEnvironment = await observeExternalPromptEnvironment(hostEvent);
    return createTurnSourceFrameContract({
      id: asString(hostEvent.frameId, `frame:${hostEvent.chatId}:${hostEvent.hostMessageId}`),
      campaignId: asString(hostEvent.campaignId),
      saveId: asString(hostEvent.saveId),
      chatId: asString(hostEvent.chatId),
      hostMessageId: asString(hostEvent.hostMessageId),
      textHash: textHashForEvent(hostEvent),
      selectedAssistantVariantHash: selectedVariantHash(hostEvent),
      sourceRevision: Number.isFinite(Number(hostEvent.sourceRevision)) ? Number(hostEvent.sourceRevision) : null,
      externalPromptEnvironment: externalPromptEnvironment || unknownExternalPromptEnvironment({ observedAt }),
      createdAt: observedAt
    });
  }

  return {
    async handleHostEvent(hostEvent = {}) {
      const playerSubmittedAt = hostEvent.playerSubmittedAt || clock();
      const turnObservedAt = clock();
      const sourceFrame = await buildFrame(hostEvent, turnObservedAt);
      const transactionId = asString(hostEvent.transactionId, `txn:${sourceFrame.id}`);
      const transaction = await coreStore.beginTurn(sourceFrame, {
        transactionId,
        ingressId: hostEvent.ingressId || `ingress:${transactionId}`,
        idempotencyKey: hostEvent.beginIdempotencyKey || `begin:${transactionId}`
      });

      if (isRecoveryEvent(hostEvent)) {
        const recovery = await coreStore.markRecoveryRequired(transaction.id, {
          id: hostEvent.recoveryCaseId || `recovery:${transaction.id}`,
          reason: hostEvent.recoveryReason || 'source-mutation-before-fast-gate',
          idempotencyKey: hostEvent.recoveryIdempotencyKey || `recovery:${transaction.id}`,
          sourceMutation: cloneJson(hostEvent.visibility || { sourceMutation: true }),
          allowedActions: ['review', 'branch', 'retry']
        });
        return {
          route: 'recoveryReview',
          transactionId: transaction.id,
          sourceFrame,
          recovery,
          released: false,
          backgroundScheduled: false,
          latency: createTurnLatencyMetrics({
            playerSubmittedAt,
            turnObservedAt,
            routeDecidedAt: clock()
          }),
          storageWrites: pushWriteBudget(storageWrites)
        };
      }

      await coreStore.advanceTurn(transaction.id, {
        phase: 'routePending',
        route: null,
        reason: 'fast-gate-source-observed',
        idempotencyKey: hostEvent.routePendingIdempotencyKey || `route-pending:${transaction.id}`,
        timing: { playerSubmittedAt, turnObservedAt }
      });

      const routeDecision = await deterministicRoute({
        hostEvent: cloneJson(hostEvent),
        sourceFrame: cloneJson(sourceFrame),
        transaction: cloneJson(transaction)
      });
      const route = routeDecision?.route || 'hostContinue';
      const routeDecidedAt = clock();
      const targetPhase = routePhase(route);
      const releasePhasePatch = {
        phase: targetPhase,
        route,
        reason: routeDecision?.reason || 'fast-gate-route',
        idempotencyKey: hostEvent.routeIdempotencyKey || `route:${transaction.id}:${route}`,
        directivePromptRevisionUsed: hostEvent.directivePromptRevisionUsed ?? null,
        timing: {
          playerSubmittedAt,
          turnObservedAt,
          routeDecidedAt,
          externalPromptMayIncludeHostMaterial: true,
          directivePromptRevisionUsed: hostEvent.directivePromptRevisionUsed ?? null
        }
      };
      let releasedAt = null;
      let releaseResult = null;
      if (route === 'hostContinue') {
        releasedAt = clock();
        releasePhasePatch.timing.hostGenerationReleasedAt = releasedAt;
      }
      await coreStore.advanceTurn(transaction.id, releasePhasePatch);
      if (route === 'hostContinue') {
        releaseResult = await releaseHostGeneration({
          transactionId: transaction.id,
          sourceFrame: cloneJson(sourceFrame),
          route,
          releasedAt
        });
      }
      const backgroundScheduled = Boolean(scheduleBackgroundEffects({
        transactionId: transaction.id,
        sourceFrame: cloneJson(sourceFrame),
        route,
        afterGenerationStart: route === 'hostContinue'
      }));
      const latency = createTurnLatencyMetrics({
        playerSubmittedAt,
        turnObservedAt,
        routeDecidedAt,
        hostGenerationReleasedAt: releasedAt
      });
      return {
        route,
        transactionId: transaction.id,
        sourceFrame,
        released: route === 'hostContinue',
        releasedAt,
        releaseResult,
        backgroundScheduled,
        latency,
        storageWrites: pushWriteBudget(storageWrites, releasedAt)
      };
    },

    async recordHostVisibleResponse(transactionId, responseRef = {}) {
      return coreStore.recordVisibleResponse(transactionId, {
        ...responseRef,
        idempotencyKey: responseRef.idempotencyKey || `host-response:${transactionId}:${responseRef.hostMessageId || 'unknown'}`,
        responseKind: responseRef.responseKind || 'hostContinue',
        generationStartedAt: responseRef.generationStartedAt || responseRef.postedAt || clock()
      });
    }
  };
}
