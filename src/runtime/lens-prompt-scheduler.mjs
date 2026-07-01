import {
  createExternalPromptEnvironmentRef,
  hashStableJson,
  isDirectivePromptKey,
  normalizeExternalPromptEnvironment,
  redactExternalDiagnostic
} from './architecture-redesign-contracts.mjs';

export const PROMPT_DIRTY_DOMAIN_ALIASES = Object.freeze({
  threadLedger: 'missionQuestThread',
  questLedger: 'missionQuestThread',
  mission: 'missionQuestThread',
  missionThread: 'missionQuestThread',
  narrativeThread: 'missionQuestThread',
  commandBearing: 'command',
  commandCulture: 'command',
  commandCompetence: 'command',
  commandLog: 'command',
  relationships: 'crewShipRelationship',
  relationship: 'crewShipRelationship',
  crew: 'crewShipRelationship',
  ship: 'crewShipRelationship',
  factIndex: 'continuity',
  sceneHandshake: 'continuity',
  sceneReconciliation: 'continuity',
  sourceFrame: 'sourceBinding',
  sourceSettlement: 'sourceBinding',
  terminalCheckpoint: 'terminalRecovery'
});

const PROMPT_DIRTY_DOMAINS = new Set([
  'identity',
  'sceneTime',
  'missionQuestThread',
  'crewShipRelationship',
  'command',
  'continuity',
  'sourceBinding',
  'terminalRecovery'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compactObject(value = {}) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function asString(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    const text = asString(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function acceptedSidecarBatchCacheInput({
  cacheInputs = {},
  promptFrame = {}
} = {}) {
  const projection = promptFrame?.coreAcceptedBatchProjection
    || promptFrame?.acceptedSidecarBatchProjection
    || cacheInputs?.coreAcceptedBatchProjection
    || cacheInputs?.acceptedSidecarBatchProjection
    || null;
  const background = projection?.background && typeof projection.background === 'object'
    ? projection.background
    : {};
  const acceptedBatchHash = asString(
    cacheInputs?.acceptedSidecarBatchHash
    || cacheInputs?.acceptedBatchHash
    || promptFrame?.acceptedSidecarBatchHash
    || promptFrame?.acceptedBatchHash
    || projection?.acceptedBatchHash
  );
  if (!acceptedBatchHash) return null;
  return compactObject({
    acceptedBatchHash,
    transactionId: asString(projection?.transactionId || promptFrame?.acceptedBatchTransactionId || cacheInputs?.acceptedBatchTransactionId),
    batchId: asString(projection?.batchId || promptFrame?.acceptedBatchId || cacheInputs?.acceptedBatchId),
    backgroundBatchId: asString(background.backgroundBatchId || background.batchId || projection?.backgroundBatchId),
    workerCount: Number.isFinite(Number(projection?.workerCount)) ? Number(projection.workerCount) : undefined,
    operationCount: Number.isFinite(Number(projection?.operationCount)) ? Number(projection.operationCount) : undefined
  });
}

function commandBearingReviewCacheInput({
  cacheInputs = {},
  promptFrame = {}
} = {}) {
  const projection = promptFrame?.coreCommandBearingReviewProjection
    || cacheInputs?.coreCommandBearingReviewProjection
    || promptFrame?.commandBearingReviewProjection
    || cacheInputs?.commandBearingReviewProjection
    || null;
  const reviewHash = asString(
    cacheInputs?.commandBearingReviewHash
    || promptFrame?.commandBearingReviewHash
    || projection?.reviewHash
  );
  if (!reviewHash) return null;
  const closures = Array.isArray(projection?.closures) ? projection.closures : [];
  return compactObject({
    reviewHash,
    transactionId: asString(projection?.transactionId || promptFrame?.commandBearingReviewTransactionId || cacheInputs?.commandBearingReviewTransactionId),
    batchId: asString(projection?.batchId || promptFrame?.commandBearingReviewBatchId || cacheInputs?.commandBearingReviewBatchId),
    sourceFrameId: asString(projection?.sourceFrameId || projection?.sourceFrameRef?.id || promptFrame?.sourceFrameId || cacheInputs?.sourceFrameId),
    closureCount: closures.length || undefined,
    closureIds: closures.length ? uniqueStrings(closures.map((entry) => entry?.closureId), 20, 160) : undefined
  });
}

function normalizePromptCacheInputs({
  cacheInputs = {},
  campaignContext = {},
  promptFrame = {}
} = {}) {
  const recallRevisions = {
    ...(promptFrame?.recallRevisions || {}),
    ...(campaignContext?.recallRevisions || {}),
    ...(cacheInputs?.recallRevisions || {})
  };
  return compactObject({
    recallIndexRevision: asString(
      cacheInputs?.recallIndexRevision
      || campaignContext?.recallIndexRevision
      || promptFrame?.recallIndexRevision
      || recallRevisions.recallIndexRevision
    ),
    sceneSealRevision: asString(
      cacheInputs?.sceneSealRevision
      || campaignContext?.sceneSealRevision
      || promptFrame?.sceneSealRevision
      || recallRevisions.sceneSealRevision
    ),
    pressureArcDigestRevision: asString(
      cacheInputs?.pressureArcDigestRevision
      || campaignContext?.pressureArcDigestRevision
      || promptFrame?.pressureArcDigestRevision
      || recallRevisions.pressureArcDigestRevision
    ),
    acceptedSidecarBatch: acceptedSidecarBatchCacheInput({ cacheInputs, promptFrame }),
    commandBearingReview: commandBearingReviewCacheInput({ cacheInputs, promptFrame })
  });
}

export function normalizePromptDirtyDomains(values = []) {
  return uniqueStrings(
    uniqueStrings(values)
      .map((domain) => PROMPT_DIRTY_DOMAIN_ALIASES[domain] || domain)
      .filter((domain) => PROMPT_DIRTY_DOMAINS.has(domain))
  );
}

function directivePromptBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).map((block, index) => {
    const id = asString(block.id, `block-${index + 1}`);
    const promptKey = isDirectivePromptKey(block.promptKey)
      ? block.promptKey
      : `directive.lens.${id.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
    return {
      ...cloneJson(block),
      id,
      promptKey
    };
  });
}

function buildPromptCacheKey({
  lane = 'visible',
  binding = {},
  campaignContext = {},
  dirtyDomains = [],
  promptFrame = {},
  externalPromptEnvironmentRef = null,
  cacheInputs = {}
} = {}) {
  return hashStableJson({
    lane,
    audience: campaignContext.audience || 'player-safe',
    campaignId: binding.campaignId || campaignContext.campaignId || null,
    saveId: binding.saveId || campaignContext.saveId || null,
    branchId: binding.branchId || campaignContext.branchId || 'main',
    chatId: binding.chatId || campaignContext.chatId || null,
    mechanicsRevision: campaignContext.mechanicsRevision ?? null,
    domainVersionVector: campaignContext.domainVersionVector || null,
    cpmSourceHash: campaignContext.cpmSourceHash || null,
    policyHash: campaignContext.policyHash || null,
    staticPromptKeyVersion: campaignContext.staticPromptKeyVersion || null,
    packageVersion: campaignContext.packageVersion || null,
    crewDatasetHash: campaignContext.crewDatasetHash || null,
    shipDatasetHash: campaignContext.shipDatasetHash || null,
    projectionHash: campaignContext.projectionHash || null,
    turnSourceHash: promptFrame.turnSourceHash || promptFrame.sourceHash || null,
    sourceFrameId: promptFrame.sourceFrameId || null,
    sourceToken: promptFrame.sourceToken || null,
    dirtyDomains,
    recallIndexRevision: cacheInputs.recallIndexRevision || null,
    sceneSealRevision: cacheInputs.sceneSealRevision || null,
    pressureArcDigestRevision: cacheInputs.pressureArcDigestRevision || null,
    acceptedSidecarBatchHash: cacheInputs.acceptedSidecarBatch?.acceptedBatchHash || null,
    acceptedSidecarBackgroundBatchId: cacheInputs.acceptedSidecarBatch?.backgroundBatchId || null,
    commandBearingReviewHash: cacheInputs.commandBearingReview?.reviewHash || null,
    commandBearingReviewBatchId: cacheInputs.commandBearingReview?.batchId || null,
    externalPromptEnvironmentHash: externalPromptEnvironmentRef?.hash || null
  });
}

function defaultPromptPacketBuilder({
  revision,
  dirtyDomains = [],
  cacheKey
} = {}) {
  const blocks = directivePromptBlocks([{
    id: 'lens-runtime-context',
    promptKey: 'directive.lens.runtime-context',
    title: 'Directive LENS Runtime Context',
    text: `Dirty domains: ${dirtyDomains.join(', ') || 'none'}`,
    placement: 'inPrompt',
    depth: 0,
    role: 'system',
    hash: hashStableJson({ revision, dirtyDomains, cacheKey })
  }]);
  return {
    kind: 'directive.playerSafePromptContext',
    revision,
    cacheKey,
    hash: hashStableJson({
      revision,
      dirtyDomains,
      blocks: blocks.map((block) => ({ id: block.id, promptKey: block.promptKey, hash: block.hash }))
    }),
    blocks
  };
}

function redactedDiagnostic(payload = {}) {
  const redactions = [];
  const redactedPayload = redactExternalDiagnostic(payload, redactions);
  return { redactedPayload, redactions };
}

export function createLensPromptScheduler({
  coreStore = null,
  clock = () => new Date().toISOString(),
  buildDirectivePromptPacket = defaultPromptPacketBuilder,
  installPromptPacket = async () => ({ ok: true }),
  clearPromptPacket = async () => ({ ok: true }),
  observeExternalPromptEnvironment = async () => null
} = {}) {
  const dirtyByLane = new Map();
  const handled = new Set();
  const installedByLane = new Map();
  const suspendedByLane = new Map();
  const externalEnvironmentRefs = new Map();
  let directiveOwnedRevision = 0;

  function pendingDirty(lane) {
    return new Set(dirtyByLane.get(lane) || []);
  }

  function setPendingDirty(lane, domains) {
    const normalized = normalizePromptDirtyDomains([...pendingDirty(lane), ...domains]);
    if (normalized.length) dirtyByLane.set(lane, normalized);
    else dirtyByLane.delete(lane);
    return normalized;
  }

  async function appendPromptDiagnostic(transactionId, payload = {}) {
    if (!transactionId || typeof coreStore?.appendDiagnostics !== 'function') return null;
    const { redactedPayload } = redactedDiagnostic({
      type: 'promptSchedule',
      ...payload
    });
    return coreStore.appendDiagnostics(transactionId, redactedPayload);
  }

  async function observeExternalEnvironment({ transactionId = null, environment = null, input = null } = {}) {
    const observedAt = clock();
    const raw = environment || await observeExternalPromptEnvironment(input || {});
    const normalized = normalizeExternalPromptEnvironment(raw
      ? { observedAt, ...raw }
      : {
        host: 'unknown',
        status: 'unknown',
        observedAt,
        unknownSignals: ['external-prompt-environment-unavailable']
      });
    const ref = createExternalPromptEnvironmentRef(normalized);
    externalEnvironmentRefs.set(ref.hash, ref);
    await appendPromptDiagnostic(transactionId, {
      status: 'externalEnvironmentObserved',
      severity: 'info',
      observedAt,
      externalPromptEnvironmentRef: ref,
      knownExternalPromptKeys: ref.knownExternalPromptKeys,
      rawPromptBody: raw?.rawPromptBody,
      vectorPayload: raw?.vectFox?.vectorPayload,
      apiKey: raw?.apiKey || raw?.vectFox?.qdrant_api_key
    });
    return { environment: normalized, ref };
  }

  function markDirty({
    lane = 'visible',
    dirtyDomains = [],
    source = 'core',
    idempotencyKey = null
  } = {}) {
    const key = idempotencyKey ? `lens-dirty:${idempotencyKey}` : null;
    if (key && handled.has(key)) {
      return {
        lane,
        source,
        accepted: false,
        replayed: true,
        dirtyDomains: [...pendingDirty(lane)]
      };
    }
    if (key) handled.add(key);
    const acceptedDomains = normalizePromptDirtyDomains(dirtyDomains);
    const pending = setPendingDirty(lane, acceptedDomains);
    return {
      lane,
      source,
      accepted: acceptedDomains.length > 0,
      dirtyDomains: pending
    };
  }

  async function recordDiagnosticOnly({ transactionId = null, payload = {} } = {}) {
    const diagnostic = await appendPromptDiagnostic(transactionId, {
      status: 'diagnosticOnly',
      severity: 'info',
      observedAt: clock(),
      dirtyPrompt: false,
      payload
    });
    return {
      status: 'diagnosticOnly',
      dirtyPrompt: false,
      diagnostic
    };
  }

  async function flush({
    transactionId = null,
    lane = 'visible',
    binding = {},
    campaignContext = {},
    promptFrame = {},
    externalPromptEnvironment = null,
    externalPromptEnvironmentRef = null,
    cacheInputs = {},
    reason = 'lens-flush',
    hostGenerationReleasedAt = null,
    installMethod = null,
    buildDirectivePromptPacket: buildDirectivePromptPacketOverride = null,
    beforeInstallPrompt = null,
    forceRebuild = false,
    idempotencyKey = null
  } = {}) {
    const key = idempotencyKey ? `lens-flush:${idempotencyKey}` : null;
    if (key && handled.has(key)) {
      return {
        status: installedByLane.has(lane) ? 'reused' : 'skipped',
        replayed: true,
        lane,
        installed: cloneJson(installedByLane.get(lane) || null)
      };
    }
    const dirtyDomains = [...pendingDirty(lane)];
    if (!dirtyDomains.length) {
      if (key) handled.add(key);
      const installed = installedByLane.get(lane) || null;
      await appendPromptDiagnostic(transactionId, {
        status: 'skippedClean',
        severity: 'info',
        observedAt: clock(),
        lane,
        reason,
        dirtyPrompt: false
      });
      return {
        status: installed ? 'reused' : 'skipped',
        rebuilt: false,
        lane,
        dirtyPrompt: false,
        installed: cloneJson(installed)
      };
    }

    let observed = null;
    let resolvedExternalPromptEnvironmentRef = externalPromptEnvironmentRef ? cloneJson(externalPromptEnvironmentRef) : null;
    if (externalPromptEnvironment || !resolvedExternalPromptEnvironmentRef) {
      observed = await observeExternalEnvironment({
        transactionId,
        environment: externalPromptEnvironment,
        input: {
          binding,
          campaignContext,
          promptFrame,
          lane
        }
      });
      resolvedExternalPromptEnvironmentRef = observed.ref;
    } else {
      externalEnvironmentRefs.set(resolvedExternalPromptEnvironmentRef.hash, resolvedExternalPromptEnvironmentRef);
    }

    const promptCacheInputs = normalizePromptCacheInputs({
      cacheInputs,
      campaignContext,
      promptFrame
    });
    const cacheKey = buildPromptCacheKey({
      lane,
      binding,
      campaignContext,
      promptFrame,
      dirtyDomains,
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
      cacheInputs: promptCacheInputs
    });
    const prior = installedByLane.get(lane) || null;
    const suspended = suspendedByLane.get(lane) || null;
    if (!forceRebuild && prior?.cacheKey === cacheKey && !suspended) {
      dirtyByLane.delete(lane);
      if (key) handled.add(key);
      return {
        status: 'reused',
        rebuilt: false,
        installed: cloneJson(prior),
        lane,
        dirtyPrompt: false,
        dirtyDomains,
        cacheKey,
        directiveOwnedRevision: prior.directiveOwnedRevision || prior.revision || directiveOwnedRevision,
        externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef
      };
    }

    const revision = directiveOwnedRevision + 1;
    const packetBuilder = typeof buildDirectivePromptPacketOverride === 'function'
      ? buildDirectivePromptPacketOverride
      : buildDirectivePromptPacket;
    const packet = await packetBuilder({
      revision,
      dirtyDomains,
      campaignContext,
      promptFrame,
      binding,
      cacheKey,
      cacheInputs: promptCacheInputs,
      recallIndexRevision: promptCacheInputs.recallIndexRevision || null,
      sceneSealRevision: promptCacheInputs.sceneSealRevision || null,
      pressureArcDigestRevision: promptCacheInputs.pressureArcDigestRevision || null,
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef
    });
    packet.blocks = directivePromptBlocks(packet.blocks || []);
    const method = asString(installMethod) || (prior ? 'rebuild' : 'install');
    if (typeof beforeInstallPrompt === 'function') {
      const guardResult = await beforeInstallPrompt({
        method,
        lane,
        binding: cloneJson(binding),
        cacheKey,
        cacheInputs: promptCacheInputs,
        reason,
        dirtyDomains,
        promptFrame: cloneJson(promptFrame),
        campaignContext: cloneJson(campaignContext),
        externalPromptEnvironmentRef: cloneJson(resolvedExternalPromptEnvironmentRef),
        packetRef: compactObject({
          kind: packet.kind || null,
          revision,
          cacheKey,
          hash: packet.hash || hashStableJson(packet),
          blockCount: packet.blocks.length,
          promptKeys: packet.blocks.map((block) => block.promptKey)
        })
      });
      const installAllowed = guardResult === undefined
        || guardResult === null
        || guardResult === true
        || (typeof guardResult === 'object' && guardResult.ok !== false && guardResult.allow !== false && guardResult.stale !== true);
      if (!installAllowed) {
        const diagnostic = await appendPromptDiagnostic(transactionId, {
          status: 'installSkippedStale',
          severity: 'warning',
          observedAt: clock(),
          lane,
          reason,
          dirtyPrompt: true,
          dirtyDomains,
          cacheKey,
          cacheInputs: promptCacheInputs,
          directivePromptRevision: revision,
          externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
          guard: compactObject({
            status: typeof guardResult === 'object' ? asString(guardResult.status, 'rejected') : 'rejected',
            reason: typeof guardResult === 'object' ? asString(guardResult.reason) : null,
            code: typeof guardResult === 'object' ? asString(guardResult.code) : null
          })
        });
        return {
          status: 'installSkippedStale',
          rebuilt: false,
          built: true,
          lane,
          dirtyPrompt: true,
          dirtyDomains,
          cacheKey,
          cacheInputs: promptCacheInputs,
          externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
          diagnostic
        };
      }
    }
    const installResult = await installPromptPacket({
      method,
      lane,
      packet,
      binding,
      cacheKey,
      cacheInputs: promptCacheInputs,
      reason
    });
    if (installResult?.ok === false) {
      throw new Error(installResult?.error?.message || 'LENS prompt installation failed.');
    }
    directiveOwnedRevision = revision;
    const installedAt = clock();
    const promptHash = packet.hash || hashStableJson(packet);
    const appliesTo = hostGenerationReleasedAt ? 'nextGeneration' : 'currentOrNextDirectiveGeneration';
    const installed = compactObject({
      lane,
      revision: directiveOwnedRevision,
      directiveOwnedRevision,
      cacheKey,
      promptHash,
      packetHash: promptHash,
      blockCount: packet.blocks.length,
      promptKeys: packet.blocks.map((block) => block.promptKey),
      installedAt,
      appliesTo,
      cacheInputs: promptCacheInputs,
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
      installResult
    });
    installedByLane.set(lane, installed);
    suspendedByLane.delete(lane);
    dirtyByLane.delete(lane);
    if (key) handled.add(key);
    const diagnostic = await appendPromptDiagnostic(transactionId, {
      status: 'installed',
      severity: 'info',
      observedAt: installed.installedAt,
      lane,
      reason,
      dirtyPrompt: true,
      dirtyDomains,
      directivePromptRevision: directiveOwnedRevision,
      cacheKey,
      cacheInputs: promptCacheInputs,
      promptHash: installed.promptHash,
      promptKeys: installed.promptKeys,
      cacheRecord: installed,
      directiveOwnedPromptKeys: installed.promptKeys.filter(isDirectivePromptKey),
      externalPromptKeysObserved: resolvedExternalPromptEnvironmentRef?.knownExternalPromptKeys || [],
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
      resumedFromSuspension: Boolean(suspended),
      suspension: suspended ? {
        reason: suspended.reason,
        suspendedAt: suspended.suspendedAt
      } : null,
      rawPromptBody: packet.rawPromptBody,
      rawResponse: packet.rawResponse
    });
    return {
      status: 'installed',
      rebuilt: true,
      lane,
      dirtyPrompt: true,
      dirtyDomains,
      directiveOwnedRevision,
      packetHash: installed.promptHash,
      cacheKey,
      cacheInputs: promptCacheInputs,
      appliesTo,
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
      packet,
      installed,
      observedExternalEnvironment: observed ? cloneJson(observed.ref) : null,
      diagnostic
    };
  }

  async function clearDirectivePrompt({ transactionId = null, lane = 'visible', reason = 'lens-clear', allLanes = false } = {}) {
    const clearAll = allLanes === true || lane === 'all';
    const targetLane = clearAll ? 'all' : lane;
    const result = await clearPromptPacket({ lane: targetLane, reason });
    if (result?.ok === false) {
      await appendPromptDiagnostic(transactionId, {
        status: 'clearDirectivePromptFailed',
        severity: 'warning',
        observedAt: clock(),
        lane: targetLane,
        reason,
        dirtyPrompt: false,
        error: result.error || result.reason || result.status || 'clear-failed'
      });
      return {
        status: 'failed',
        lane: targetLane,
        result
      };
    }
    if (clearAll) {
      installedByLane.clear();
      suspendedByLane.clear();
    } else {
      installedByLane.delete(lane);
      suspendedByLane.delete(lane);
    }
    await appendPromptDiagnostic(transactionId, {
      status: 'clearedDirectivePrompt',
      severity: 'info',
      observedAt: clock(),
      lane: targetLane,
      reason,
      dirtyPrompt: false
    });
    return {
      status: 'cleared',
      lane: targetLane,
      result
    };
  }

  async function suspendDirectivePrompt({
    transactionId = null,
    lane = 'visible',
    reason = 'lens-suspend',
    allLanes = false,
    binding = null,
    activeChatId = null,
    boundChatId = null,
    source = null
  } = {}) {
    const suspendAll = allLanes === true || lane === 'all';
    const targetLane = suspendAll ? 'all' : lane;
    const result = await clearPromptPacket({ lane: targetLane, reason, preservePacket: true });
    if (result?.ok === false) {
      await appendPromptDiagnostic(transactionId, {
        status: 'suspendDirectivePromptFailed',
        severity: 'warning',
        observedAt: clock(),
        lane: targetLane,
        reason,
        source,
        binding: binding ? {
          campaignId: binding.campaignId || null,
          saveId: binding.saveId || null,
          chatId: binding.chatId || null
        } : null,
        activeChatId,
        boundChatId,
        preservePacket: true,
        dirtyPrompt: false,
        error: result.error || result.reason || result.status || 'suspend-failed'
      });
      return {
        status: 'failed',
        lane: targetLane,
        result
      };
    }

    const suspendedAt = clock();
    const lanes = suspendAll ? [...installedByLane.keys()] : [lane];
    for (const installedLane of lanes) {
      if (!installedByLane.has(installedLane)) continue;
      suspendedByLane.set(installedLane, {
        lane: installedLane,
        reason,
        suspendedAt,
        preservePacket: true,
        source,
        activeChatId,
        boundChatId: boundChatId || binding?.chatId || null
      });
    }
    await appendPromptDiagnostic(transactionId, {
      status: 'suspendedDirectivePrompt',
      severity: 'info',
      observedAt: suspendedAt,
      lane: targetLane,
      reason,
      source,
      binding: binding ? {
        campaignId: binding.campaignId || null,
        saveId: binding.saveId || null,
        chatId: binding.chatId || null
      } : null,
      activeChatId,
      boundChatId: boundChatId || binding?.chatId || null,
      preservePacket: true,
      dirtyPrompt: false,
      suspendedLanes: lanes.filter((installedLane) => installedByLane.has(installedLane))
    });
    return {
      status: 'suspended',
      lane: targetLane,
      suspendedLanes: lanes.filter((installedLane) => installedByLane.has(installedLane)),
      preservePacket: true,
      source,
      activeChatId,
      boundChatId: boundChatId || binding?.chatId || null,
      result
    };
  }

  function inspect() {
    return {
      kind: 'directive.lensPromptSchedulerSnapshot.v1',
      directiveOwnedRevision,
      dirtyByLane: Object.fromEntries([...dirtyByLane.entries()].map(([lane, domains]) => [lane, [...domains]])),
      pendingDirtyDomains: Object.fromEntries([...dirtyByLane.entries()].map(([lane, domains]) => [lane, [...domains]])),
      installedByLane: Object.fromEntries([...installedByLane.entries()].map(([lane, installed]) => [lane, cloneJson(installed)])),
      installed: Object.fromEntries([...installedByLane.entries()].map(([lane, installed]) => [lane, cloneJson(installed)])),
      suspendedByLane: Object.fromEntries([...suspendedByLane.entries()].map(([lane, suspended]) => [lane, cloneJson(suspended)])),
      suspended: Object.fromEntries([...suspendedByLane.entries()].map(([lane, suspended]) => [lane, cloneJson(suspended)])),
      externalEnvironmentRefs: [...externalEnvironmentRefs.values()].map(cloneJson)
    };
  }

  return {
    markDirty,
    enqueueDirty: markDirty,
    observeExternalEnvironment,
    flush,
    flushVisible: (options = {}) => flush({ ...options, lane: options.lane || 'visible' }),
    flushBackground: (options = {}) => flush({ ...options, lane: options.lane || 'background' }),
    recordDiagnosticOnly,
    clearDirectivePrompt,
    suspendDirectivePrompt,
    inspect
  };
}
