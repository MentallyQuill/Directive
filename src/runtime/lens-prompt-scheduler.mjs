import {
  createExternalPromptEnvironmentRef,
  hashStableJson,
  isDirectivePromptKey,
  normalizeExternalPromptEnvironment,
  redactExternalDiagnostic,
  summarizeExternalPromptEnvironmentTargets
} from './architecture-redesign-contracts.mjs';
import {
  createLensPromptBudgetTrace,
  LENS_PROMPT_BUDGET_LANES
} from './lens-prompt-budget-trace.mjs';
import {
  createLensPromptRevisionRecord
} from './lens-prompt-revision-record.mjs';

export const PROMPT_DIRTY_DOMAIN_ALIASES = Object.freeze({
  threadLedger: 'missionQuestThread',
  questLedger: 'missionQuestThread',
  mission: 'missionQuestThread',
  missionThread: 'missionQuestThread',
  narrativeThread: 'missionQuestThread',
  commandAuthority: 'command',
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

const PROMPT_BUDGET_DEFAULTS = Object.freeze({
  stableRules: { budgetTokens: 1200, reservedFloor: 800 },
  protectedContinuity: { budgetTokens: 2400, reservedFloor: 700 },
  activeScene: { budgetTokens: 900, reservedFloor: 400 },
  activeCast: { budgetTokens: 700, reservedFloor: 250 },
  missionPressure: { budgetTokens: 650, reservedFloor: 180 },
  recentTranscript: { budgetTokens: 1100, reservedFloor: 350 },
  recall: { budgetTokens: 900, reservedFloor: 0 },
  volatileTurn: { budgetTokens: 500, reservedFloor: 100 },
  externalEnvironment: { budgetTokens: 0, reservedFloor: 0 }
});

export const REQUIRED_HOST_CONTINUE_PROMPT_KEYS = Object.freeze([
  'directive.contract',
  'directive.campaign.player-character',
  'directive.campaign.command-authority',
  'directive.campaign.turn-yield'
]);

export function missingRequiredPromptKeys(promptKeys = [], requiredPromptKeys = REQUIRED_HOST_CONTINUE_PROMPT_KEYS) {
  const present = new Set(uniqueStrings(promptKeys));
  return uniqueStrings(requiredPromptKeys).filter((key) => !present.has(key));
}

export function requiredPromptKeysPresent(promptKeys = [], requiredPromptKeys = REQUIRED_HOST_CONTINUE_PROMPT_KEYS) {
  return missingRequiredPromptKeys(promptKeys, requiredPromptKeys).length === 0;
}

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

function asRevision(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function maxRevision(values = []) {
  return Math.max(0, ...values.map(asRevision));
}

function revisionSeedForFlush({
  binding = {},
  campaignContext = {},
  promptFrame = {},
  cacheInputs = {},
  installed = null
} = {}) {
  return maxRevision([
    binding?.promptContextRevision,
    binding?.directiveOwnedRevision,
    binding?.promptRevision,
    campaignContext?.promptContextRevision,
    campaignContext?.directiveOwnedRevision,
    campaignContext?.domainVersionVector?.prompt,
    campaignContext?.domainVersionVector?.promptContextRevision,
    promptFrame?.promptContextRevision,
    cacheInputs?.promptContextRevision,
    cacheInputs?.directiveOwnedRevision,
    cacheInputs?.promptCache?.directiveOwnedRevision,
    cacheInputs?.promptCacheEvidence?.directiveOwnedRevision,
    installed?.directiveOwnedRevision,
    installed?.revision
  ]);
}

function externalPromptInspectionBundle(raw = null, observedAt = null) {
  if (!raw || typeof raw !== 'object') return null;
  const sourceRef = raw.externalPromptEnvironmentRef || raw.ref || null;
  if (!sourceRef?.hash) return null;
  const knownExternalPromptKeys = uniqueStrings([
    ...(Array.isArray(sourceRef.knownExternalPromptKeys) ? sourceRef.knownExternalPromptKeys : []),
    ...(Array.isArray(raw.knownExternalPromptKeys) ? raw.knownExternalPromptKeys : [])
  ]);
  const ref = compactObject({
    ...cloneJson(sourceRef),
    kind: sourceRef.kind || 'directive.externalPromptEnvironmentRef.v1',
    schemaVersion: sourceRef.schemaVersion || 1,
    hash: sourceRef.hash,
    status: sourceRef.status || raw.status || 'observed',
    observedAt: sourceRef.observedAt || raw.observedAt || observedAt || null,
    knownExternalPromptKeys
  });
  const environment = normalizeExternalPromptEnvironment({
    host: raw.host || 'sillytavern',
    userHandle: raw.userHandle || raw.user,
    chatId: raw.chatId,
    saveId: raw.saveId,
    campaignId: raw.campaignId,
    observedAt: ref.observedAt || observedAt,
    status: ref.status || 'observed',
    promptKeys: knownExternalPromptKeys,
    unknownSignals: raw.unavailableSignals || raw.unknownSignals,
    diagnosticSource: raw.diagnosticSource || 'prompt-adapter-inspection',
    mergeSource: raw.mergeSource || 'prompt-adapter-inspection'
  });
  const targets = raw.externalPromptEnvironmentTargets || raw.externalTargets || summarizeExternalPromptEnvironmentTargets(environment);
  return {
    environment,
    ref,
    targets: cloneJson(targets)
  };
}

function compactBudgetRef(value = {}) {
  return compactObject({
    id: asString(value.id || value.refId || value.sourceFrameId || value.hash),
    kind: asString(value.kind || value.refKind),
    authority: asString(value.authority, 'directive'),
    hash: asString(value.hash || value.textHash || value.metadataHash),
    estimatedTokens: Math.max(0, Math.trunc(Number(value.estimatedTokens) || 0)),
    sourceFrameId: asString(value.sourceFrameId),
    knowledgeScope: compactKnowledgeScope(value.knowledgeScope),
    omissionReason: asString(value.omissionReason)
  });
}

function compactKnowledgeScope(value = {}) {
  if (!value || typeof value !== 'object') return undefined;
  const out = compactObject({
    knownBy: uniqueStrings(value.knownBy),
    witnessedBy: uniqueStrings(value.witnessedBy),
    subjectIds: uniqueStrings(value.subjectIds),
    disclosureState: asString(value.disclosureState),
    disclosureSourceFrameId: asString(value.disclosureSourceFrameId)
  });
  return Object.keys(out).length ? out : undefined;
}

function normalizePromptBudgetLaneOverrides(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const laneId of LENS_PROMPT_BUDGET_LANES) {
    const entry = source[laneId];
    if (!entry || typeof entry !== 'object') continue;
    out[laneId] = compactObject({
      budgetTokens: Number.isFinite(Number(entry.budgetTokens)) ? Math.max(0, Math.trunc(Number(entry.budgetTokens))) : undefined,
      reservedFloor: Number.isFinite(Number(entry.reservedFloor)) ? Math.max(0, Math.trunc(Number(entry.reservedFloor))) : undefined,
      overflowPolicy: ['omit-overflow', 'fail-closed', 'diagnostic-only'].includes(entry.overflowPolicy) ? entry.overflowPolicy : undefined,
      authority: asString(entry.authority),
      diagnosticOnly: entry.diagnosticOnly === true ? true : undefined
    });
  }
  return out;
}

function promptBudgetLaneOverrideFor(laneId, {
  campaignContext = {},
  cacheInputs = {}
} = {}) {
  const fromCache = normalizePromptBudgetLaneOverrides(cacheInputs?.promptBudgetLaneOverrides);
  const fromCampaign = normalizePromptBudgetLaneOverrides(
    campaignContext?.promptBudgetLaneOverrides
    || campaignContext?.lensPromptBudgetLanes
    || campaignContext?.contextPolicy?.lensPromptBudgetLanes
  );
  return compactObject({
    ...(fromCampaign[laneId] || {}),
    ...(fromCache[laneId] || {})
  });
}

function createBudgetLane(id, refs = [], extra = {}) {
  const defaults = PROMPT_BUDGET_DEFAULTS[id] || {};
  return compactObject({
    id,
    budgetTokens: Math.max(0, Math.trunc(Number(extra.budgetTokens ?? defaults.budgetTokens ?? 0))),
    reservedFloor: Math.max(0, Math.trunc(Number(extra.reservedFloor ?? defaults.reservedFloor ?? 0))),
    authority: asString(extra.authority, id === 'externalEnvironment' ? 'diagnostic' : 'directive'),
    refs: refs.map(compactBudgetRef).filter((ref) => ref.id || ref.hash),
    omittedRefs: (Array.isArray(extra.omittedRefs) ? extra.omittedRefs : []).map(compactBudgetRef).filter((ref) => ref.id || ref.hash),
    omissionReasons: uniqueStrings(extra.omissionReasons),
    diagnosticOnly: extra.diagnosticOnly === true || id === 'externalEnvironment',
    overflowPolicy: asString(extra.overflowPolicy)
  });
}

function sourceFrameBudgetId(promptFrame = {}) {
  return asString(
    promptFrame.sourceFrameId
    || promptFrame.sourceFrameRef?.id
    || promptFrame.frameId
    || promptFrame.sourceToken
  );
}

function sourceFrameBudgetHash(promptFrame = {}) {
  return asString(
    promptFrame.turnSourceHash
    || promptFrame.sourceHash
    || promptFrame.textHash
    || promptFrame.sourceFrameRef?.textHash
    || promptFrame.sourceFrameRef?.hash
  );
}

function packetStructureHash(packet = {}) {
  const blocks = Array.isArray(packet.blocks) ? packet.blocks : [];
  return hashStableJson(blocks.map((block) => ({
    id: asString(block.id),
    promptKey: isDirectivePromptKey(block.promptKey) ? block.promptKey : null,
    hash: asString(block.hash)
  })));
}

function estimatePromptBlockTokens(block = {}) {
  const explicit = Number(block.estimatedTokens ?? block.tokenEstimate ?? block.tokens);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.trunc(explicit);
  const text = String(block.text || block.content || block.body || '');
  return text ? Math.max(1, Math.ceil(text.length / 4)) : 0;
}

function promptBlockBudgetLane(block = {}) {
  const explicit = asString(block.lensPromptBudgetLane || block.promptBudgetLane || block.budgetLane);
  if (explicit && LENS_PROMPT_BUDGET_LANES.includes(explicit)) return explicit;
  const key = asString(block.promptKey || block.key || block.id, '');
  if (/^directive\.scene\.active$/i.test(key) || /^immediate-scene$/i.test(key)) return 'activeScene';
  if (/^directive\.campaign\.command-authority$/i.test(key)) return 'activeScene';
  if (/^(relevant-crew|directive\.crew|directive\.active-cast)/i.test(key)) return 'activeCast';
  if (/^(foreground-quest|active-pressures|engaged-threads|nearby-opportunities|main-arc-orientation|directive\.mission|directive\.command)/i.test(key)) return 'missionPressure';
  if (/^(command-log-continuity|directive\.recap\.committed|directive\.context\.revolving)/i.test(key)) return 'recentTranscript';
  if (/^(directive\.continuity\.|relevant-facts|location-context|ship-status)/i.test(key)) return 'protectedContinuity';
  if (/^directive\.contract$/i.test(key) || /^directive-contract$/i.test(key)) return 'stableRules';
  if (/^directive\.lens\./i.test(key)) return 'stableRules';
  return null;
}

function promptBlockBudgetRef(block = {}) {
  const id = asString(block.id || block.promptKey || block.key || block.hash);
  const hash = asString(block.hash || block.contentHash || block.textHash);
  if (!id && !hash) return null;
  return compactObject({
    id,
    kind: asString(block.budgetRefKind || block.kind, 'directive.promptBlockRef.v1'),
    authority: asString(block.authority, 'directive'),
    hash,
    estimatedTokens: estimatePromptBlockTokens(block),
    sourceFrameId: asString(block.sourceFrameId || block.sourceFrameRef?.id)
  });
}

function promptBlockBudgetRefs(block = {}) {
  const refs = [];
  const nested = Array.isArray(block.promptBudgetRefs)
    ? block.promptBudgetRefs
    : (Array.isArray(block.lensPromptBudgetRefs) ? block.lensPromptBudgetRefs : []);
  for (const value of nested) {
    const laneId = asString(value?.lensPromptBudgetLane || value?.promptBudgetLane || value?.budgetLane);
    if (!LENS_PROMPT_BUDGET_LANES.includes(laneId)) continue;
    const ref = compactBudgetRef(value);
    if (ref.id || ref.hash) refs.push({ laneId, ref });
  }
  return refs;
}

function promptBudgetLanesFromPacket({
  packet = {},
  dirtyDomains = [],
  promptFrame = {},
  cacheInputs = {},
  campaignContext = {},
  externalPromptEnvironmentRef = null,
  externalPromptEnvironmentTargets = null
} = {}) {
  const provided = packet.lensPromptBudgetLanes || packet.promptBudgetLanes;
  if (Array.isArray(provided) && provided.length) {
    return provided;
  }
  const dirtySet = new Set(dirtyDomains);
  const sourceFrameId = sourceFrameBudgetId(promptFrame);
  const sourceHash = sourceFrameBudgetHash(promptFrame);
  const lanes = new Map(LENS_PROMPT_BUDGET_LANES.map((id) => [id, []]));
  for (const block of Array.isArray(packet.blocks) ? packet.blocks : []) {
    const laneId = promptBlockBudgetLane(block);
    const ref = promptBlockBudgetRef(block);
    if (laneId && ref) lanes.get(laneId)?.push(ref);
    for (const nestedRef of promptBlockBudgetRefs(block)) {
      lanes.get(nestedRef.laneId)?.push(nestedRef.ref);
    }
  }

  if (!lanes.get('stableRules')?.length) lanes.get('stableRules')?.push({
    id: 'directive-prompt-packet-structure',
    kind: 'directive.promptPacketStructureRef.v1',
    authority: 'directive',
    hash: packetStructureHash(packet),
    estimatedTokens: Math.max(80, (Array.isArray(packet.blocks) ? packet.blocks.length : 1) * 60)
  });
  if ((dirtySet.has('continuity') || campaignContext.projectionHash || campaignContext.cpmSourceHash) && !lanes.get('protectedContinuity')?.length) {
    lanes.get('protectedContinuity')?.push({
      id: 'directive-continuity-projection',
      kind: 'directive.continuityProjectionRef.v1',
      authority: 'directive',
      hash: campaignContext.projectionHash || campaignContext.cpmSourceHash || packet.continuityProjection?.hash || null,
      estimatedTokens: 220
    });
  }
  if (dirtySet.has('sceneTime') || cacheInputs.sceneSealRevision) {
    lanes.get('activeScene')?.push({
      id: 'directive-active-scene',
      kind: 'directive.sceneStateRef.v1',
      authority: 'directive',
      hash: cacheInputs.sceneSealRevision || campaignContext.sceneRevision || null,
      estimatedTokens: 180
    });
  }
  if (dirtySet.has('crewShipRelationship') || campaignContext.crewDatasetHash || campaignContext.shipDatasetHash) {
    lanes.get('activeCast')?.push({
      id: 'directive-active-cast',
      kind: 'directive.activeCastRef.v1',
      authority: 'directive',
      hash: hashStableJson({
        crewDatasetHash: campaignContext.crewDatasetHash || null,
        shipDatasetHash: campaignContext.shipDatasetHash || null
      }),
      estimatedTokens: 160
    });
  }
  if (dirtySet.has('missionQuestThread') || dirtySet.has('command') || cacheInputs.pressureArcDigestRevision) {
    lanes.get('missionPressure')?.push({
      id: 'directive-mission-pressure',
      kind: 'directive.missionPressureRef.v1',
      authority: 'directive',
      hash: cacheInputs.pressureArcDigestRevision || campaignContext.domainVersionVector?.missionQuestThread || null,
      estimatedTokens: 160
    });
  }
  if (sourceFrameId || sourceHash) {
    lanes.get('recentTranscript')?.push({
      id: sourceFrameId || 'current-source-frame',
      kind: 'directive.sourceFrameRef.v1',
      authority: 'committed',
      hash: sourceHash,
      sourceFrameId,
      estimatedTokens: 180
    });
  }
  for (const ref of Array.isArray(packet.recallRefs) ? packet.recallRefs : []) {
    lanes.get('recall')?.push({
      ...ref,
      kind: ref.kind || 'directive.recallResultRef.v1',
      authority: ref.authority || 'directive',
      estimatedTokens: ref.estimatedTokens ?? 120
    });
  }
  if (cacheInputs.recallIndexRevision) {
    lanes.get('recall')?.push({
      id: 'directive-recall-index',
      kind: 'directive.recallIndexRevisionRef.v1',
      authority: 'directive',
      hash: cacheInputs.recallIndexRevision,
      estimatedTokens: 120
    });
  }
  const omittedRecallRefs = Array.isArray(packet.omittedRecallRefs)
    ? packet.omittedRecallRefs
    : (Array.isArray(packet.recallOmittedRefs) ? packet.recallOmittedRefs : []);
  if (promptFrame.sourceToken || promptFrame.turnSourceHash || promptFrame.currentRoute) {
    lanes.get('volatileTurn')?.push({
      id: 'directive-volatile-turn',
      kind: 'directive.volatileTurnRef.v1',
      authority: 'directive',
      hash: hashStableJson({
        sourceToken: promptFrame.sourceToken || null,
        turnSourceHash: promptFrame.turnSourceHash || null,
        currentRoute: promptFrame.currentRoute || null
      }),
      sourceFrameId,
      estimatedTokens: 90
    });
  }
  if (externalPromptEnvironmentRef?.hash) {
    lanes.get('externalEnvironment')?.push({
      id: externalPromptEnvironmentRef.hash,
      kind: externalPromptEnvironmentRef.kind || 'directive.externalPromptEnvironmentRef.v1',
      authority: 'diagnostic',
      hash: externalPromptEnvironmentRef.hash,
      estimatedTokens: 0
    });
  }

  return LENS_PROMPT_BUDGET_LANES.map((id) => createBudgetLane(
    id,
    lanes.get(id) || [],
    {
      ...promptBudgetLaneOverrideFor(id, { campaignContext, cacheInputs }),
      omittedRefs: id === 'recall' ? omittedRecallRefs : undefined
    }
  ));
}

function createPromptBudgetTraceForPacket({
  packet = {},
  revision = null,
  cacheKey = null,
  dirtyDomains = [],
  promptFrame = {},
  cacheInputs = {},
  campaignContext = {},
  externalPromptEnvironmentRef = null,
  externalPromptEnvironmentTargets = null
} = {}) {
  return createLensPromptBudgetTrace({
    packetId: packet.id || packet.packetId || cacheKey,
    promptRevision: revision,
    cacheKey,
    lanes: promptBudgetLanesFromPacket({
      packet,
      dirtyDomains,
      promptFrame,
      cacheInputs,
      campaignContext,
      externalPromptEnvironmentRef
    }),
    cacheInputs: {
      mechanicsRevision: campaignContext.mechanicsRevision ?? null,
      promptDomainVector: campaignContext.domainVersionVector || null,
      recallIndexRevision: cacheInputs.recallIndexRevision || null,
      sceneSealRevision: cacheInputs.sceneSealRevision || null,
      pressureArcDigestRevision: cacheInputs.pressureArcDigestRevision || null,
      packageRevision: campaignContext.packageRevision || campaignContext.packageVersion || cacheInputs.packageRevision || null,
      promptBudgetLaneOverrides: campaignContext.promptBudgetLaneOverrides || cacheInputs.promptBudgetLaneOverrides || null,
      externalPromptEnvironmentRef,
      externalPromptEnvironmentTargets
    }
  });
}

function promptBudgetTraceRef(trace = null) {
  if (!trace || typeof trace !== 'object') return null;
  return compactObject({
    kind: 'directive.lensPromptBudgetTraceRef.v1',
    traceKind: trace.kind || null,
    hash: trace.hash || null,
    byteLength: trace.byteLength || null,
    laneCount: Array.isArray(trace.lanes) ? trace.lanes.length : undefined,
    promptRevision: trace.promptRevision ?? null,
    cacheKey: trace.cacheKey || null
  });
}

function refMatchKeys(ref = {}) {
  return [
    ref.id,
    ref.hash,
    ref.sourceFrameId
  ].map((value) => asString(value)).filter(Boolean);
}

function blockMatchKeys(block = {}) {
  return [
    block.id,
    block.promptKey,
    block.key,
    block.hash,
    block.contentHash,
    block.sourceFrameId,
    block.sourceFrameRef?.id
  ].map((value) => asString(value)).filter(Boolean);
}

function stripBuildOnlyBlockBudgetFields(block = {}) {
  const {
    promptBudgetRefs: _promptBudgetRefs,
    lensPromptBudgetRefs: _lensPromptBudgetRefs,
    rawPromptBody: _rawPromptBody,
    rawResponse: _rawResponse,
    ...safeBlock
  } = block;
  return safeBlock;
}

function refreshPromptPacketAfterBudget(packet = {}, enforcement = {}) {
  const {
    promptBudgetLanes: _promptBudgetLanes,
    lensPromptBudgetLanes: _lensPromptBudgetLanes,
    rawPromptBody: _rawPromptBody,
    rawResponse: _rawResponse,
    recallRefs,
    omittedRecallRefs,
    recallOmittedRefs,
    ...safePacket
  } = packet;
  const blocks = Array.isArray(packet.blocks) ? packet.blocks : [];
  const text = blocks.map((block) => String(block.text || block.content || '').trim()).filter(Boolean).join('\n\n');
  const hash = hashStableJson({
    revision: packet.revision ?? null,
    cacheKey: packet.cacheKey || null,
    blocks: blocks.map((block) => ({
      id: block.id || null,
      promptKey: block.promptKey || null,
      hash: block.hash || block.contentHash || null
    }))
  });
  return compactObject({
    ...safePacket,
    text: text || packet.text,
    hash,
    contentHash: hash,
    recallRefs: Array.isArray(recallRefs)
      ? recallRefs.map(compactBudgetRef).filter((ref) => ref.id || ref.hash)
      : undefined,
    omittedRecallRefs: Array.isArray(omittedRecallRefs || recallOmittedRefs)
      ? (omittedRecallRefs || recallOmittedRefs).map(compactBudgetRef).filter((ref) => ref.id || ref.hash)
      : undefined,
    lensPromptBudgetEnforcement: enforcement
  });
}

function applyPromptBudgetTraceToPacket(packet = {}, trace = null) {
  const blocks = Array.isArray(packet.blocks) ? packet.blocks : [];
  const lanes = Array.isArray(trace?.lanes) ? trace.lanes : [];
  const omittedKeys = new Set();
  const blockingLanes = [];
  for (const lane of lanes) {
    if (lane?.blocking === true) blockingLanes.push(lane.id);
    for (const ref of Array.isArray(lane?.omittedRefs) ? lane.omittedRefs : []) {
      for (const key of refMatchKeys(ref)) omittedKeys.add(key);
    }
  }
  const includedBlocks = [];
  const omittedBlocks = [];
  for (const block of blocks) {
    const keys = blockMatchKeys(block);
    if (keys.some((key) => omittedKeys.has(key))) {
      omittedBlocks.push(compactObject({
        id: block.id || null,
        promptKey: block.promptKey || null,
        hash: block.hash || block.contentHash || null,
        lane: promptBlockBudgetLane(block),
        omissionReason: 'budget-exceeded'
      }));
      continue;
    }
    includedBlocks.push(stripBuildOnlyBlockBudgetFields(block));
  }
  const enforcement = compactObject({
    kind: 'directive.lensPromptBudgetEnforcement.v1',
    schemaVersion: 1,
    status: blockingLanes.length ? 'blocked' : (omittedBlocks.length ? 'filtered' : 'pass'),
    originalBlockCount: blocks.length,
    includedBlockCount: includedBlocks.length,
    omittedBlockCount: omittedBlocks.length,
    omittedBlocks,
    blockingLanes
  });
  return {
    packet: refreshPromptPacketAfterBudget({ ...packet, blocks: includedBlocks }, enforcement),
    enforcement
  };
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
    promptBudgetLaneOverridesHash: hashStableJson(normalizePromptBudgetLaneOverrides(
      campaignContext.promptBudgetLaneOverrides || cacheInputs.promptBudgetLaneOverrides || {}
    )),
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

function promptBudgetTraceDiagnosticSummary(trace = null) {
  if (!trace || typeof trace !== 'object') return null;
  const lanes = Array.isArray(trace.lanes) ? trace.lanes : [];
  return compactObject({
    kind: trace.kind || 'directive.lensPromptBudgetTrace.v1',
    schemaVersion: trace.schemaVersion ?? null,
    hash: trace.hash || null,
    byteLength: trace.byteLength || null,
    promptRevision: trace.promptRevision ?? null,
    cacheKey: trace.cacheKey || null,
    laneCount: lanes.length,
    blockingLaneIds: lanes.filter((lane) => lane?.blocking === true).map((lane) => lane.id).filter(Boolean),
    overflowLaneIds: lanes.filter((lane) => lane?.budgetExceeded === true).map((lane) => lane.id).filter(Boolean),
    diagnosticOnlyLaneIds: lanes.filter((lane) => lane?.diagnosticOnly === true).map((lane) => lane.id).filter(Boolean),
    lanes: lanes.map((lane) => compactObject({
      id: lane.id || null,
      status: lane.status || null,
      includedRefCount: Array.isArray(lane.includedRefs) ? lane.includedRefs.length : 0,
      omittedRefCount: Array.isArray(lane.omittedRefs) ? lane.omittedRefs.length : 0,
      overBudgetRefCount: Array.isArray(lane.overBudgetRefs) ? lane.overBudgetRefs.length : 0,
      omissionReasons: uniqueStrings(lane.omissionReasons),
      diagnosticOnly: lane.diagnosticOnly === true ? true : undefined,
      overflowPolicy: lane.overflowPolicy || null,
      budgetExceeded: lane.budgetExceeded === true ? true : undefined,
      blocking: lane.blocking === true ? true : undefined
    }))
  });
}

function compactTargetStatus(value = null, nestedStatusKeys = []) {
  if (!value || typeof value !== 'object') return undefined;
  const nested = {};
  for (const key of nestedStatusKeys) {
    const item = value[key];
    if (!item || typeof item !== 'object') continue;
    nested[key] = compactObject({
      status: asString(item.status),
      hash: asString(item.hash || item.entryHash || item.settingsHash || item.injectionHash)
    });
  }
  return compactObject({
    status: asString(value.status) || undefined,
    active: value.active === true ? true : undefined,
    enabled: value.enabled === true ? true : undefined,
    installed: value.installed === true ? true : undefined,
    directiveAuthority: value.directiveAuthority === true ? true : value.directiveAuthority === false ? false : undefined,
    richEvidence: value.richEvidence === true ? true : undefined,
    richEvidenceMissing: value.richEvidenceMissing === true ? true : undefined,
    promptKeyCount: Number.isFinite(Number(value.promptKeyCount)) ? Math.max(0, Math.trunc(Number(value.promptKeyCount))) : undefined,
    promptKeyHash: asString(value.promptKeyHash || value.promptKeyPrefixHash) || undefined,
    activeNameCount: Number.isFinite(Number(value.activeNameCount)) ? Math.max(0, Math.trunc(Number(value.activeNameCount))) : undefined,
    entryCount: Number.isFinite(Number(value.entryCount)) ? Math.max(0, Math.trunc(Number(value.entryCount))) : undefined,
    layerCount: Number.isFinite(Number(value.layerCount)) ? Math.max(0, Math.trunc(Number(value.layerCount))) : undefined,
    ghostedCount: Number.isFinite(Number(value.ghostedCount)) ? Math.max(0, Math.trunc(Number(value.ghostedCount))) : undefined,
    backendType: asString(value.backendType) || undefined,
    disabledPresent: value.disabledPresent === true ? true : undefined,
    ...nested
  });
}

function compactExternalTargetsForDiagnostic(targets = null) {
  if (!targets || typeof targets !== 'object') return undefined;
  return compactObject({
    stLorebooks: compactTargetStatus(targets.stLorebooks),
    memoryBooks: compactTargetStatus(targets.memoryBooks, ['rangeDiagnostics']),
    summaryception: compactTargetStatus(targets.summaryception, ['staleness']),
    vectFox: compactTargetStatus(targets.vectFox, ['backendDiagnostics']),
    unknownExternalContext: compactTargetStatus(targets.unknownExternalContext)
  });
}

function compactPromptDiagnosticPayload(payload = {}) {
  const {
    rawPromptBody: _rawPromptBody,
    rawResponse: _rawResponse,
    vectorPayload: _vectorPayload,
    apiKey: _apiKey,
    cacheRecord: _cacheRecord,
    externalPromptEnvironmentTargets,
    promptKeys,
    directiveOwnedPromptKeys,
    promptBudgetTrace,
    promptBudgetTraceRef: existingPromptBudgetTraceRef,
    ...rest
  } = payload;
  const compactExternalTargets = compactExternalTargetsForDiagnostic(externalPromptEnvironmentTargets);
  const safePromptKeys = uniqueStrings(promptKeys);
  const safeDirectivePromptKeys = uniqueStrings(directiveOwnedPromptKeys);
  const promptKeyEvidence = compactObject({
    promptKeyCount: safePromptKeys.length || undefined,
    promptKeyHash: safePromptKeys.length ? hashStableJson(safePromptKeys) : undefined,
    directiveOwnedPromptKeyCount: safeDirectivePromptKeys.length || undefined,
    directiveOwnedPromptKeyHash: safeDirectivePromptKeys.length ? hashStableJson(safeDirectivePromptKeys) : undefined
  });
  if (!promptBudgetTrace) {
    return compactObject({
      ...rest,
      ...promptKeyEvidence,
      externalPromptEnvironmentTargets: compactExternalTargets
    });
  }
  return compactObject({
    ...rest,
    ...promptKeyEvidence,
    externalPromptEnvironmentTargets: compactExternalTargets,
    promptBudgetTraceRef: existingPromptBudgetTraceRef || promptBudgetTraceRef(promptBudgetTrace),
    promptBudgetTraceSummary: promptBudgetTraceDiagnosticSummary(promptBudgetTrace)
  });
}

function redactedDiagnostic(payload = {}) {
  const redactions = [];
  const redactedPayload = redactExternalDiagnostic(compactPromptDiagnosticPayload(payload), redactions);
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
  let activePromptDiagnosticBatch = null;

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
    if (
      !transactionId
      || (
        typeof coreStore?.appendDiagnostics !== 'function'
        && typeof coreStore?.appendDiagnosticsBatch !== 'function'
      )
    ) return null;
    const { redactedPayload } = redactedDiagnostic({
      type: 'promptSchedule',
      ...payload
    });
    if (Array.isArray(activePromptDiagnosticBatch)) {
      activePromptDiagnosticBatch.push({ transactionId, diagnostic: redactedPayload });
      return cloneJson(redactedPayload);
    }
    return coreStore.appendDiagnostics(transactionId, redactedPayload);
  }

  async function flushPromptDiagnostics(batch = []) {
    const diagnosticsByTransaction = new Map();
    for (const entry of batch || []) {
      if (!entry?.transactionId || !entry?.diagnostic) continue;
      const diagnostics = diagnosticsByTransaction.get(entry.transactionId) || [];
      diagnostics.push(cloneJson(entry.diagnostic));
      diagnosticsByTransaction.set(entry.transactionId, diagnostics);
    }
    for (const [transactionId, diagnostics] of diagnosticsByTransaction.entries()) {
      if (typeof coreStore?.appendDiagnosticsBatch === 'function') {
        await coreStore.appendDiagnosticsBatch(transactionId, diagnostics);
      } else if (typeof coreStore?.appendDiagnostics === 'function') {
        for (const diagnostic of diagnostics) {
          await coreStore.appendDiagnostics(transactionId, diagnostic);
        }
      }
    }
  }

  async function observeExternalEnvironment({ transactionId = null, environment = null, input = null } = {}) {
    const observedAt = clock();
    const raw = environment || await observeExternalPromptEnvironment(input || {});
    const inspection = externalPromptInspectionBundle(raw, observedAt);
    const normalized = inspection?.environment || normalizeExternalPromptEnvironment(raw
      ? { observedAt, ...raw }
      : {
        host: 'unknown',
        status: 'unknown',
        observedAt,
        unknownSignals: ['external-prompt-environment-unavailable']
      });
    const ref = inspection?.ref || createExternalPromptEnvironmentRef(normalized);
    const targets = inspection?.targets || summarizeExternalPromptEnvironmentTargets(normalized);
    externalEnvironmentRefs.set(ref.hash, ref);
    return { environment: normalized, ref, targets };
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
    const priorPromptDiagnosticBatch = activePromptDiagnosticBatch;
    const promptDiagnosticBatch = [];
    activePromptDiagnosticBatch = promptDiagnosticBatch;
    try {
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

    const resolvedExternalPromptEnvironmentTargets = observed?.targets
      || (externalPromptEnvironment ? summarizeExternalPromptEnvironmentTargets(externalPromptEnvironment) : null)
      || resolvedExternalPromptEnvironmentRef?.externalPromptEnvironmentTargets
      || null;
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
    directiveOwnedRevision = Math.max(
      directiveOwnedRevision,
      revisionSeedForFlush({
        binding,
        campaignContext,
        promptFrame,
        cacheInputs: promptCacheInputs,
        installed: prior
      })
    );
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
    let packet = await packetBuilder({
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
    const promptBudgetTrace = createPromptBudgetTraceForPacket({
      packet,
      revision,
      cacheKey,
      dirtyDomains,
      promptFrame,
      cacheInputs: promptCacheInputs,
      campaignContext,
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
      externalPromptEnvironmentTargets: resolvedExternalPromptEnvironmentTargets
    });
    const budgetApplication = applyPromptBudgetTraceToPacket(packet, promptBudgetTrace);
    packet = budgetApplication.packet;
    packet.lensPromptBudgetTrace = promptBudgetTrace;
    packet.lensPromptBudgetTraceRef = promptBudgetTraceRef(promptBudgetTrace);
    if (budgetApplication.enforcement.status === 'blocked') {
      const diagnostic = await appendPromptDiagnostic(transactionId, {
        status: 'promptBudgetBlocked',
        severity: 'warning',
        observedAt: clock(),
        lane,
        reason,
        dirtyPrompt: true,
        dirtyDomains,
        cacheKey,
        cacheInputs: promptCacheInputs,
        promptBudgetTrace,
        promptBudgetTraceRef: promptBudgetTraceRef(promptBudgetTrace),
        promptBudgetEnforcement: budgetApplication.enforcement,
        directivePromptRevision: revision,
        externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
        externalPromptEnvironmentTargets: resolvedExternalPromptEnvironmentTargets
      });
      return {
        status: 'promptBudgetBlocked',
        rebuilt: false,
        built: true,
        lane,
        dirtyPrompt: true,
        dirtyDomains,
        cacheKey,
        cacheInputs: promptCacheInputs,
        externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
        promptBudgetTrace,
        promptBudgetTraceRef: promptBudgetTraceRef(promptBudgetTrace),
        promptBudgetEnforcement: budgetApplication.enforcement,
        packet,
        diagnostic
      };
    }
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
          promptBudgetTrace,
          promptBudgetTraceRef: promptBudgetTraceRef(promptBudgetTrace),
          promptBudgetEnforcement: budgetApplication.enforcement,
          directivePromptRevision: revision,
          externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
          externalPromptEnvironmentTargets: resolvedExternalPromptEnvironmentTargets,
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
    const installedPromptKeys = packet.blocks.map((block) => block.promptKey).filter(Boolean);
    const missingRequired = missingRequiredPromptKeys(installedPromptKeys);
    const appliesTo = hostGenerationReleasedAt ? 'nextGeneration' : 'currentOrNextDirectiveGeneration';
    const installed = compactObject({
      lane,
      revision: directiveOwnedRevision,
      directiveOwnedRevision,
      cacheKey,
      promptHash,
      packetHash: promptHash,
      blockCount: packet.blocks.length,
      promptKeys: installedPromptKeys,
      requiredPromptKeys: REQUIRED_HOST_CONTINUE_PROMPT_KEYS,
      requiredPromptKeysPresent: missingRequired.length === 0,
      missingRequiredPromptKeys: missingRequired.length ? missingRequired : undefined,
      installedAt,
      appliesTo,
      cacheInputs: promptCacheInputs,
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
      promptBudgetTraceRef: promptBudgetTraceRef(promptBudgetTrace),
      promptBudgetEnforcement: budgetApplication.enforcement,
      installResult
    });
    const lensPromptRevisionRecord = createLensPromptRevisionRecord({
      packet,
      installed,
      status: 'active',
      lane,
      installedAt,
      cacheKey,
      dirtyDomains,
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
      promptBudgetTraceRef: promptBudgetTraceRef(promptBudgetTrace),
      promptBudgetEnforcement: budgetApplication.enforcement,
      cacheInputs: promptCacheInputs
    });
    installed.lensPromptRevisionRecord = lensPromptRevisionRecord;
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
      promptBudgetTrace,
      promptBudgetTraceRef: promptBudgetTraceRef(promptBudgetTrace),
      promptBudgetEnforcement: budgetApplication.enforcement,
      promptHash: installed.promptHash,
      promptKeys: installed.promptKeys,
      requiredPromptKeys: installed.requiredPromptKeys,
      requiredPromptKeysPresent: installed.requiredPromptKeysPresent,
      missingRequiredPromptKeys: installed.missingRequiredPromptKeys,
      cacheRecord: installed,
      directiveOwnedPromptKeys: installed.promptKeys.filter(isDirectivePromptKey),
      externalPromptKeysObserved: resolvedExternalPromptEnvironmentRef?.knownExternalPromptKeys || [],
      externalPromptEnvironmentRef: resolvedExternalPromptEnvironmentRef,
      externalPromptEnvironmentTargets: resolvedExternalPromptEnvironmentTargets,
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
      promptBudgetTrace,
      promptBudgetTraceRef: promptBudgetTraceRef(promptBudgetTrace),
      promptBudgetEnforcement: budgetApplication.enforcement,
      lensPromptRevisionRecord,
      packet,
      installed,
      observedExternalEnvironment: observed ? cloneJson(observed.ref) : null,
      diagnostic
    };
    } finally {
      activePromptDiagnosticBatch = priorPromptDiagnosticBatch;
      await flushPromptDiagnostics(promptDiagnosticBatch);
    }
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
