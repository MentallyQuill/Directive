import {
  createExternalPromptEnvironmentRef,
  hashStableJson,
  isDirectivePromptKey,
  normalizeExternalPromptEnvironment,
  redactExternalDiagnostic
} from './architecture-redesign-contracts.mjs';

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

function compact(value = {}) {
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

function normalizeDirtyDomains(values = []) {
  return uniqueStrings(values).filter((domain) => PROMPT_DIRTY_DOMAINS.has(domain));
}

function acceptedSidecarBatchCacheInput(promptFrame = {}) {
  const projection = promptFrame?.coreAcceptedBatchProjection
    || promptFrame?.acceptedSidecarBatchProjection
    || null;
  const background = projection?.background && typeof projection.background === 'object'
    ? projection.background
    : {};
  const acceptedBatchHash = asString(
    promptFrame?.acceptedSidecarBatchHash
    || promptFrame?.acceptedBatchHash
    || projection?.acceptedBatchHash
  );
  if (!acceptedBatchHash) return null;
  return compact({
    acceptedBatchHash,
    transactionId: asString(projection?.transactionId || promptFrame?.acceptedBatchTransactionId),
    batchId: asString(projection?.batchId || promptFrame?.acceptedBatchId),
    backgroundBatchId: asString(background.backgroundBatchId || background.batchId || projection?.backgroundBatchId)
  });
}

function commandBearingReviewCacheInput(promptFrame = {}) {
  const projection = promptFrame?.coreCommandBearingReviewProjection
    || promptFrame?.commandBearingReviewProjection
    || null;
  const reviewHash = asString(promptFrame?.commandBearingReviewHash || projection?.reviewHash);
  if (!reviewHash) return null;
  const closures = Array.isArray(projection?.closures) ? projection.closures : [];
  return compact({
    reviewHash,
    transactionId: asString(projection?.transactionId || promptFrame?.commandBearingReviewTransactionId),
    batchId: asString(projection?.batchId || promptFrame?.commandBearingReviewBatchId),
    sourceFrameId: asString(projection?.sourceFrameId || projection?.sourceFrameRef?.id || promptFrame?.sourceFrameId),
    closureCount: closures.length || undefined,
    closureIds: closures.length ? uniqueStrings(closures.map((entry) => entry?.closureId)) : undefined
  });
}

function directivePromptBlocks(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).map((block, index) => {
    const id = asString(block.id, `block-${index + 1}`);
    const promptKey = isDirectivePromptKey(block.promptKey)
      ? block.promptKey
      : `directive.campaign.${id.replace(/[^a-zA-Z0-9_.-]/g, '-')}`;
    return {
      ...cloneJson(block),
      id,
      promptKey
    };
  });
}

function buildPromptCacheKey({
  binding = {},
  campaignContext = {},
  dirtyDomains = [],
  promptFrame = {},
  externalPromptEnvironmentRef = null
} = {}) {
  return hashStableJson({
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
    turnSourceHash: promptFrame.turnSourceHash || null,
    sourceToken: promptFrame.sourceToken || null,
    acceptedSidecarBatch: acceptedSidecarBatchCacheInput(promptFrame),
    commandBearingReview: commandBearingReviewCacheInput(promptFrame),
    dirtyDomains,
    externalPromptEnvironmentHash: externalPromptEnvironmentRef?.hash || null
  });
}

function defaultPromptPacketBuilder({
  revision,
  dirtyDomains = [],
  campaignContext = {},
  promptFrame = {},
  cacheKey
} = {}) {
  const blocks = directivePromptBlocks([{
    id: 'lens-synthetic-context',
    promptKey: 'directive.lens.synthetic-context',
    title: 'Directive LENS Synthetic Context',
    text: `Dirty domains: ${dirtyDomains.join(', ') || 'none'}`,
    placement: 'inPrompt',
    depth: 0,
    role: 'system',
    hash: hashStableJson({ dirtyDomains, cacheKey })
  }]);
  return {
    kind: 'directive.playerSafePromptContext',
    revision,
    hash: hashStableJson({
      revision,
      dirtyDomains,
      campaignContext,
      promptFrame,
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

export function createSyntheticLensPromptScheduler({
  coreStore,
  clock = () => new Date().toISOString(),
  buildDirectivePromptPacket = defaultPromptPacketBuilder,
  installPromptPacket = async () => ({ ok: true }),
  observeExternalPromptEnvironment = async () => null
} = {}) {
  if (!coreStore?.appendDiagnostics) {
    throw new Error('createSyntheticLensPromptScheduler requires a CORE Store instance');
  }

  const dirtyByLane = new Map();
  const handled = new Set();
  const externalEnvironments = new Map();
  const installedByLane = new Map();
  let directiveOwnedRevision = 0;

  function pendingDirty(lane) {
    return new Set(dirtyByLane.get(lane) || []);
  }

  function setPendingDirty(lane, domains) {
    const normalized = normalizeDirtyDomains([...pendingDirty(lane), ...domains]);
    if (normalized.length) dirtyByLane.set(lane, normalized);
    else dirtyByLane.delete(lane);
    return normalized;
  }

  async function appendPromptDiagnostic(transactionId, payload = {}) {
    return coreStore.appendDiagnostics(transactionId, {
      type: 'promptSchedule',
      ...payload
    });
  }

  async function observeExternalEnvironment({ transactionId, environment = null, input = null } = {}) {
    const observedAt = clock();
    const raw = environment || await observeExternalPromptEnvironment(input || {});
    const normalized = raw ? normalizeExternalPromptEnvironment({
      observedAt,
      ...raw
    }) : normalizeExternalPromptEnvironment({
      host: 'unknown',
      observedAt,
      status: 'unknown',
      unknownSignals: ['external-prompt-environment-unavailable']
    });
    externalEnvironments.set(normalized.hash, normalized);
    const ref = createExternalPromptEnvironmentRef(normalized);
    if (transactionId) {
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
    }
    return { environment: normalized, ref };
  }

  function enqueueDirty({
    lane = 'visible',
    dirtyDomains = [],
    source = 'core',
    idempotencyKey = null
  } = {}) {
    const key = idempotencyKey ? `dirty:${idempotencyKey}` : null;
    if (key && handled.has(key)) {
      return {
        lane,
        accepted: false,
        replayed: true,
        dirtyDomains: [...pendingDirty(lane)]
      };
    }
    if (key) handled.add(key);
    const accepted = normalizeDirtyDomains(dirtyDomains);
    const pending = setPendingDirty(lane, accepted);
    return {
      lane,
      source,
      accepted: accepted.length > 0,
      dirtyDomains: pending
    };
  }

  async function recordDiagnosticOnly({ transactionId, payload = {} } = {}) {
    const observedAt = clock();
    const diagnostic = await appendPromptDiagnostic(transactionId, {
      status: 'diagnosticOnly',
      severity: 'info',
      observedAt,
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
    transactionId,
    lane = 'visible',
    binding = {},
    campaignContext = {},
    promptFrame = {},
    externalPromptEnvironment = null,
    reason = 'lens-flush',
    hostGenerationReleasedAt = null,
    beforeInstallPrompt = null,
    idempotencyKey = null
  } = {}) {
    const key = idempotencyKey ? `flush:${idempotencyKey}` : null;
    if (key && handled.has(key)) {
      const installed = installedByLane.get(lane) || null;
      return {
        status: installed ? 'reused' : 'skipped',
        replayed: true,
        lane,
        installed: cloneJson(installed)
      };
    }

    const dirtyDomains = [...pendingDirty(lane)];
    if (!dirtyDomains.length) {
      if (key) handled.add(key);
      const installed = installedByLane.get(lane) || null;
      return {
        status: installed ? 'reused' : 'skipped',
        rebuilt: false,
        installed: Boolean(installed),
        lane,
        dirtyDomains: []
      };
    }

    const observed = await observeExternalEnvironment({
      transactionId,
      environment: externalPromptEnvironment,
      input: { binding, campaignContext, promptFrame, lane }
    });
    const cacheKey = buildPromptCacheKey({
      binding,
      campaignContext,
      dirtyDomains,
      promptFrame,
      externalPromptEnvironmentRef: observed.ref
    });
    const prior = installedByLane.get(lane) || null;
    if (prior?.cacheKey === cacheKey) {
      dirtyByLane.delete(lane);
      if (key) handled.add(key);
      return {
        status: 'reused',
        rebuilt: false,
        installed: true,
        lane,
        dirtyDomains,
        cacheKey,
        directiveOwnedRevision: prior.directiveOwnedRevision,
        externalPromptEnvironmentRef: observed.ref
      };
    }

    const revision = directiveOwnedRevision + 1;
    const built = await buildDirectivePromptPacket({
      revision,
      dirtyDomains,
      binding: cloneJson(binding),
      campaignContext: cloneJson(campaignContext),
      promptFrame: cloneJson(promptFrame),
      externalPromptEnvironmentRef: cloneJson(observed.ref),
      cacheKey
    });
    const packet = {
      kind: built.kind || 'directive.playerSafePromptContext',
      revision,
      hash: built.hash || hashStableJson({
        revision,
        dirtyDomains,
        blocks: built.blocks || []
      }),
      blocks: directivePromptBlocks(built.blocks || []),
      continuityProjection: built.continuityProjection ? cloneJson(built.continuityProjection) : undefined
    };
    const method = prior ? 'rebuild' : 'install';
    if (typeof beforeInstallPrompt === 'function') {
      const guardResult = await beforeInstallPrompt({
        method,
        lane,
        binding: cloneJson(binding),
        cacheKey,
        reason,
        dirtyDomains,
        promptFrame: cloneJson(promptFrame),
        campaignContext: cloneJson(campaignContext),
        externalPromptEnvironmentRef: cloneJson(observed.ref),
        packetRef: compact({
          kind: packet.kind,
          revision,
          cacheKey,
          hash: packet.hash,
          blockCount: packet.blocks.length,
          promptKeys: packet.blocks.map((block) => block.promptKey)
        })
      });
      const installAllowed = guardResult === undefined
        || guardResult === null
        || guardResult === true
        || (typeof guardResult === 'object' && guardResult.ok !== false && guardResult.allow !== false && guardResult.stale !== true);
      if (!installAllowed) {
        const { redactedPayload } = redactedDiagnostic({
          status: 'installSkippedStale',
          severity: 'warning',
          lane,
          reason,
          dirtyPrompt: true,
          dirtyDomains,
          cacheKey,
          directivePromptRevision: revision,
          externalPromptEnvironmentRef: observed.ref,
          guard: compact({
            status: typeof guardResult === 'object' ? asString(guardResult.status, 'rejected') : 'rejected',
            reason: typeof guardResult === 'object' ? asString(guardResult.reason) : null,
            code: typeof guardResult === 'object' ? asString(guardResult.code) : null
          })
        });
        const diagnostic = await appendPromptDiagnostic(transactionId, redactedPayload);
        return {
          status: 'installSkippedStale',
          rebuilt: false,
          built: true,
          lane,
          dirtyPrompt: true,
          dirtyDomains,
          cacheKey,
          externalPromptEnvironmentRef: observed.ref,
          diagnostic
        };
      }
    }
    const installResult = await installPromptPacket({
      method,
      binding,
      packet,
      lane,
      reason
    });
    if (installResult?.ok === false) {
      throw new Error(installResult?.error?.message || 'LENS prompt installation failed.');
    }
    directiveOwnedRevision = revision;
    dirtyByLane.delete(lane);
    const appliesTo = hostGenerationReleasedAt ? 'nextGeneration' : 'currentOrNextDirectiveGeneration';
    const cacheRecord = {
      lane,
      cacheKey,
      directiveOwnedRevision,
      packetHash: packet.hash,
      blockCount: packet.blocks.length,
      dirtyDomains,
      externalPromptEnvironmentRef: observed.ref,
      installedAt: clock(),
      appliesTo,
      finalHostPromptMayIncludeExternal: true
    };
    installedByLane.set(lane, cacheRecord);
    if (key) handled.add(key);
    const { redactedPayload } = redactedDiagnostic({
      status: 'installed',
      severity: 'info',
      lane,
      reason,
      cacheRecord,
      directiveOwnedPromptKeys: packet.blocks.map((block) => block.promptKey).filter(isDirectivePromptKey),
      externalPromptKeysObserved: observed.ref.knownExternalPromptKeys,
      rawPromptBody: built.rawPromptBody,
      rawResponse: built.rawResponse
    });
    const diagnostic = await appendPromptDiagnostic(transactionId, redactedPayload);
    return {
      status: 'installed',
      rebuilt: true,
      installed: true,
      lane,
      directiveOwnedRevision,
      packetHash: packet.hash,
      cacheKey,
      dirtyDomains,
      appliesTo,
      externalPromptEnvironmentRef: observed.ref,
      diagnostic
    };
  }

  function inspect() {
    return {
      kind: 'directive.lensSyntheticPromptScheduler.v1',
      directiveOwnedRevision,
      pendingDirtyDomains: Object.fromEntries([...dirtyByLane.entries()].map(([lane, domains]) => [lane, [...domains]])),
      installed: Object.fromEntries([...installedByLane.entries()].map(([lane, value]) => [lane, cloneJson(value)])),
      externalEnvironmentHashes: [...externalEnvironments.keys()]
    };
  }

  return {
    enqueueDirty,
    recordDiagnosticOnly,
    observeExternalEnvironment,
    flush,
    inspect
  };
}
