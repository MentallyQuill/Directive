import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking
} from './state-delta-gateway.mjs';
import { createRuntimeLedgerViewAsync } from './runtime-ledger-view.mjs';
import { hashStableJson } from './architecture-redesign-contracts.mjs';
import {
  compactOpenWorldReducerBundleRef,
  validateOpenWorldReducerBundle
} from '../directors/open-world-event-reducers.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

const MECHANICS_DOMAINS = Object.freeze([
  'campaign', 'crew', 'ship', 'mission', 'worldState', 'timeLedger', 'storyArcLedger',
  'questLedger', 'dynamicQuestCatalog', 'knowledgeLedger', 'threadLedger',
  'eventLedger', 'attentionState', 'pressureLedger',
  'relationships', 'commandCulture', 'commandBearing', 'commandCompetence', 'values',
  'directives', 'campaignTracks', 'campaignAssets', 'turnLedger', 'commandLog',
  'captainState'
]);

const MECHANICS_CHECKPOINT_STATE_ROOTS = Object.freeze([
  'activeCampaignPackage',
  'attentionState',
  'campaign',
  'campaignAssets',
  'campaignChatBinding',
  'campaignTracks',
  'canon',
  'captainState',
  'commandBearing',
  'commandCompetence',
  'commandCulture',
  'commandLog',
  'continuity',
  'crew',
  'directives',
  'dynamicQuestCatalog',
  'eventLedger',
  'flags',
  'knowledgeLedger',
  'mission',
  'player',
  'pressureLedger',
  'questLedger',
  'relationships',
  'runtimeResume',
  'sceneReconciliation',
  'settings',
  'ship',
  'storyArcLedger',
  'threadLedger',
  'timeLedger',
  'turnLedger',
  'ui',
  'values',
  'worldState'
]);

function compact(value) {
  return String(value || '').trim();
}

function mechanicsCheckpointCampaignState(campaignState = {}) {
  const source = campaignState && typeof campaignState === 'object' ? campaignState : {};
  const snapshot = {};
  for (const key of MECHANICS_CHECKPOINT_STATE_ROOTS) {
    if (source[key] !== undefined) snapshot[key] = cloneJson(source[key]);
  }
  return snapshot;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values = []) {
  return [...new Set(asArray(values).map((value) => String(value || '').trim()).filter(Boolean))];
}

const CORE_MECHANICS_CHECKPOINT_ID_MAX_LENGTH = 72;
const CORE_MECHANICS_CHECKPOINT_HASH_LENGTH = 12;

function safeCheckpointId(value, fallback) {
  const raw = String(value || fallback || 'core-mechanics-checkpoint').trim();
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  const checkpointId = safe || String(fallback || 'core-mechanics-checkpoint');
  if (checkpointId.length <= CORE_MECHANICS_CHECKPOINT_ID_MAX_LENGTH) return checkpointId;
  const suffix = hashStableJson({ checkpointId }).slice(0, CORE_MECHANICS_CHECKPOINT_HASH_LENGTH);
  const prefixLength = Math.max(
    1,
    CORE_MECHANICS_CHECKPOINT_ID_MAX_LENGTH - CORE_MECHANICS_CHECKPOINT_HASH_LENGTH - 1
  );
  const prefix = checkpointId.slice(0, prefixLength).replace(/[-._]+$/g, '') || 'core-mechanics';
  return `${prefix}-${suffix}`;
}

async function findIngressById(campaignState, ingressId, { coreTurnStore = null } = {}) {
  const id = compact(ingressId);
  if (!id) return null;
  return ((await createRuntimeLedgerViewAsync(campaignState || {}, { coreTurnStore })).ingressLedger || [])
    .find((entry) => entry?.id === id) || null;
}

function lastCommittedTurnProjectionFields({
  transactionId = null,
  turnId = null,
  outcomeId = null,
  status = 'mirrored'
} = {}) {
  const txn = compact(transactionId);
  const turn = compact(turnId);
  const outcome = compact(outcomeId);
  const cleanStatus = compact(status) || 'mirrored';
  return {
    authority: 'compatibilityProjection',
    projectionSource: txn ? 'coreStoreV2' : 'turnLedger',
    compatibilityMirror: {
      kind: 'directive.lastCommittedTurnCompatibilityMirror.v1',
      status: cleanStatus,
      outcomeId: outcome || null,
      turnId: turn || null,
      transactionId: txn || null,
      source: 'turnCommitCoordinator'
    },
    coreProjection: {
      kind: 'directive.coreLastCommittedTurnProjectionRef.v1',
      outcomeId: outcome || null,
      turnId: turn || null,
      transactionId: txn || null,
      status: cleanStatus
    }
  };
}

function mechanicsDomainOperations(before = {}, after = {}, { excludedDomains = [], turnPacket = {}, outcomeId = null } = {}) {
  const operations = [];
  const excluded = new Set(excludedDomains);
  const sourceOutcomeId = outcomeId || turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || null;
  for (const domain of MECHANICS_DOMAINS) {
    if (excluded.has(domain)) continue;
    const beforeHash = hashStableJson(before?.[domain] ?? null);
    const afterHash = hashStableJson(after?.[domain] ?? null);
    if (beforeHash === afterHash) continue;
    operations.push({
      domain,
      op: 'domainCommitted',
      path: domain,
      summary: `Committed ${domain} mechanics.`,
      sourceKind: 'directive.compatibilityMechanicsDomainFallback.v1',
      sourceOutcomeId,
      sourceHash: hashStableJson({
        domain,
        sourceOutcomeId,
        beforeHash,
        afterHash
      }),
      beforeHash,
      valueHash: afterHash
    });
  }
  return operations;
}

function meaningfulDelta(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

const EXPLICIT_STATE_DELTA_DOMAINS = Object.freeze(['mission', 'commandCulture', 'pressureLedger', 'commandBearing']);

function explicitStateDeltaDomainOperations(turnPacket = {}, before = {}, after = {}, { excludedDomains = [] } = {}) {
  const stateDelta = turnPacket?.stateDelta || {};
  const excluded = new Set(excludedDomains);
  const operations = [];
  for (const domain of EXPLICIT_STATE_DELTA_DOMAINS) {
    if (excluded.has(domain)) continue;
    if (!meaningfulDelta(stateDelta[domain])) continue;
    const beforeHash = hashStableJson(before?.[domain] ?? null);
    const afterHash = hashStableJson(after?.[domain] ?? null);
    if (beforeHash === afterHash) continue;
    operations.push({
      domain,
      op: 'stateDeltaCommitted',
      path: `stateDelta.${domain}`,
      summary: `Committed ${domain} mechanics from explicit turn packet state delta.`,
      sourceKind: 'directive.turnPacketStateDelta.v1',
      sourceOutcomeId: turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || null,
      sourceHash: hashStableJson(stateDelta[domain]),
      valueHash: afterHash
    });
  }
  return operations;
}

function explicitCompetencePacketOperation(turnPacket = {}, before = {}, after = {}, { excludedDomains = [] } = {}) {
  const excluded = new Set(excludedDomains);
  if (excluded.has('commandCompetence')) return null;
  const competencePacket = turnPacket?.competencePacket || null;
  if (!meaningfulDelta(competencePacket)) return null;
  const beforeHash = hashStableJson(before?.commandCompetence ?? null);
  const afterHash = hashStableJson(after?.commandCompetence ?? null);
  if (beforeHash === afterHash) return null;
  return {
    domain: 'commandCompetence',
    op: 'competencePacketCommitted',
    path: 'competencePacket',
    summary: 'Committed commandCompetence mechanics from explicit competence packet.',
    sourceKind: competencePacket?.kind || 'directive.competencePacket',
    sourceOutcomeId: competencePacket?.sourceOutcomeId || turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || null,
    sourceHash: hashStableJson(competencePacket),
    valueHash: afterHash
  };
}

function explicitPacketAppendOperations(turnPacket = {}, before = {}, after = {}, { excludedDomains = [] } = {}) {
  const excluded = new Set(excludedDomains);
  const operations = [];
  const outcomeId = turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || null;
  const turnId = turnPacket?.turnId || turnPacket?.id || null;

  const commandLogPacket = turnPacket?.commandLogPacket || null;
  if (!excluded.has('commandLog') && meaningfulDelta(commandLogPacket)) {
    const beforeHash = hashStableJson(before?.commandLog ?? null);
    const afterHash = hashStableJson(after?.commandLog ?? null);
    if (beforeHash !== afterHash) {
      operations.push({
        domain: 'commandLog',
        op: 'commandLogPacketCommitted',
        path: 'commandLogPacket',
        summary: 'Committed commandLog mechanics from explicit command log packet.',
        sourceKind: commandLogPacket?.kind || 'directive.commandLogPacket',
        sourceOutcomeId: commandLogPacket?.sourceOutcomeId || outcomeId,
        sourceHash: hashStableJson(commandLogPacket),
        valueHash: afterHash
      });
    }
  }

  if (!excluded.has('turnLedger') && (turnId || outcomeId)) {
    const beforeHash = hashStableJson(before?.turnLedger ?? null);
    const afterHash = hashStableJson(after?.turnLedger ?? null);
    if (beforeHash !== afterHash) {
      operations.push({
        domain: 'turnLedger',
        op: 'turnLedgerEntryCommitted',
        path: 'turnPacket',
        targetId: outcomeId,
        summary: 'Committed turnLedger mechanics from explicit turn packet.',
        sourceKind: 'directive.turnLedgerEntryPacket.v1',
        sourceOutcomeId: outcomeId,
        sourceTurnId: turnId,
        sourceHash: hashStableJson({
          turnId,
          outcomePacket: turnPacket?.outcomePacket || null,
          stateDelta: turnPacket?.stateDelta || null,
          competencePacket: turnPacket?.competencePacket || null,
          provenance: turnPacket?.provenance || null,
          narratorSourceOutcomeId: turnPacket?.narratorPacket?.sourceOutcomeId || null,
          commandLogSourceOutcomeId: commandLogPacket?.sourceOutcomeId || null
        }),
        valueHash: afterHash
      });
    }
  }

  return operations;
}

function explicitWorldStateSubDeltaOperations(turnPacket = {}, before = {}, after = {}) {
  const stateDelta = turnPacket?.stateDelta || {};
  const outcomeId = turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || null;
  const operations = [];
  const specs = [
    {
      deltaKey: 'actors',
      worldStateKey: 'actors',
      op: 'actorPosturesCommitted',
      path: 'stateDelta.actors',
      sourceKind: 'directive.turnPacketStateDelta.actors.v1'
    },
    {
      deltaKey: 'fronts',
      worldStateKey: 'fronts',
      op: 'frontRecordsCommitted',
      path: 'stateDelta.fronts',
      sourceKind: 'directive.turnPacketStateDelta.fronts.v1'
    },
    {
      deltaKey: 'clocks',
      worldStateKey: 'clocks',
      op: 'clockDeltasCommitted',
      path: 'stateDelta.clocks',
      sourceKind: 'directive.turnPacketStateDelta.clocks.v1'
    }
  ];

  for (const spec of specs) {
    const source = stateDelta?.[spec.deltaKey];
    if (!meaningfulDelta(source)) continue;
    const beforeHash = hashStableJson(before?.worldState?.[spec.worldStateKey] ?? null);
    const afterHash = hashStableJson(after?.worldState?.[spec.worldStateKey] ?? null);
    if (beforeHash === afterHash) continue;
    const sourceArray = Array.isArray(source) ? source : null;
    const sourceRecords = sourceArray
      || source?.upsertPostures
      || source?.upsertRecords
      || [];
    operations.push({
      domain: 'worldState',
      op: spec.op,
      path: spec.path,
      summary: `Committed worldState ${spec.worldStateKey} mechanics from explicit turn packet delta.`,
      sourceKind: spec.sourceKind,
      sourceOutcomeId: outcomeId,
      sourceHash: hashStableJson(source),
      operationCount: Array.isArray(sourceRecords) ? sourceRecords.length : undefined,
      changedRoots: ['worldState'],
      valueHash: afterHash
    });
  }

  return operations;
}

function explicitTerminalStateOperations(turnPacket = {}, before = {}, after = {}, { excludedDomains = [] } = {}) {
  const excluded = new Set(excludedDomains);
  const terminalState = turnPacket?.stateDelta?.terminalState || null;
  if (!meaningfulDelta(terminalState)) return [];
  const outcomeId = turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || null;
  const specs = [
    {
      domain: 'ship',
      deltaKey: 'shipPatch',
      op: 'shipTerminalStateCommitted',
      path: 'stateDelta.terminalState.shipPatch',
      sourceKind: 'directive.turnPacketStateDelta.terminalState.ship.v1'
    },
    {
      domain: 'player',
      deltaKey: 'playerPatch',
      op: 'playerTerminalStateCommitted',
      path: 'stateDelta.terminalState.playerPatch',
      sourceKind: 'directive.turnPacketStateDelta.terminalState.player.v1'
    },
    {
      domain: 'flags',
      deltaKey: 'flagsSet',
      op: 'flagsTerminalStateCommitted',
      path: 'stateDelta.terminalState.flagsSet',
      sourceKind: 'directive.turnPacketStateDelta.terminalState.flags.v1'
    }
  ];
  const operations = [];
  for (const spec of specs) {
    if (excluded.has(spec.domain)) continue;
    const source = terminalState?.[spec.deltaKey];
    if (!meaningfulDelta(source)) continue;
    const beforeHash = hashStableJson(before?.[spec.domain] ?? null);
    const afterHash = hashStableJson(after?.[spec.domain] ?? null);
    if (beforeHash === afterHash) continue;
    const sourceRecords = Array.isArray(source) ? source : [source];
    operations.push({
      domain: spec.domain,
      op: spec.op,
      path: spec.path,
      summary: `Committed ${spec.domain} terminal-state mechanics from explicit turn packet delta.`,
      sourceKind: spec.sourceKind,
      sourceOutcomeId: outcomeId,
      sourceHash: hashStableJson(source),
      operationCount: sourceRecords.length,
      valueHash: afterHash
    });
  }
  return operations;
}

function explicitRelationshipOperations(turnPacket = {}, before = {}, after = {}, { excludedDomains = [] } = {}) {
  const excluded = new Set(excludedDomains);
  if (excluded.has('relationships')) return [];
  const relationshipDelta = turnPacket?.stateDelta?.relationships || null;
  const outcomeId = turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id || null;
  const operations = [];

  if (meaningfulDelta(relationshipDelta)) {
    const beforeDirectHash = hashStableJson({
      descriptiveLog: before?.relationships?.descriptiveLog || [],
      perceptionLedger: before?.relationships?.perceptionLedger || [],
      rawValuesHidden: before?.relationships?.rawValuesHidden ?? null
    });
    const afterDirectHash = hashStableJson({
      descriptiveLog: after?.relationships?.descriptiveLog || [],
      perceptionLedger: after?.relationships?.perceptionLedger || [],
      rawValuesHidden: after?.relationships?.rawValuesHidden ?? null
    });
    if (beforeDirectHash !== afterDirectHash) {
      const deltaRecords = [
        ...asArray(relationshipDelta.descriptiveChanges),
        ...asArray(relationshipDelta.perceptionRecordsAdd),
        ...asArray(relationshipDelta.playerPerceptionsAdd)
      ];
      operations.push({
        domain: 'relationships',
        op: 'relationshipStateDeltaCommitted',
        path: 'stateDelta.relationships',
        summary: 'Committed relationships mechanics from explicit turn packet state delta.',
        sourceKind: 'directive.turnPacketStateDelta.relationships.v1',
        sourceOutcomeId: outcomeId,
        sourceHash: hashStableJson(relationshipDelta),
        operationCount: deltaRecords.length,
        valueHash: afterDirectHash
      });
    }
  }

  const beforeMemoryHash = hashStableJson(before?.relationships?.memoryLedger || []);
  const afterMemoryHash = hashStableJson(after?.relationships?.memoryLedger || []);
  if (beforeMemoryHash !== afterMemoryHash) {
    const crewIds = asArray(relationshipDelta?.affectedCrewIds).length
      ? asArray(relationshipDelta.affectedCrewIds)
      : asArray(turnPacket?.sceneSnapshot?.presentCharacters).filter((id) => id !== 'player-commander');
    operations.push({
      domain: 'relationships',
      op: 'relationshipMemoryDerivedCommitted',
      path: 'relationshipMemoryFromTurn',
      summary: 'Committed derived relationship memory from turn outcome and scoped crew ids.',
      sourceKind: 'directive.relationshipMemoryFromTurn.v1',
      sourceOutcomeId: outcomeId,
      sourceHash: hashStableJson({
        outcomeId,
        turnId: turnPacket?.turnId || turnPacket?.id || null,
        outcomeSummary: turnPacket?.outcomePacket?.summary || null,
        relationshipDelta,
        crewIds
      }),
      operationCount: crewIds.length,
      valueHash: afterMemoryHash
    });
  }

  return operations;
}

function openWorldReducerOperation(turnPacket, outcomeId) {
  const reducerBundle = turnPacket?.stateDelta?.openWorld?.reducerBundle;
  if (reducerBundle?.kind !== 'directive.openWorldReducerBundle.v1') return null;
  const reducerRef = compactOpenWorldReducerBundleRef(reducerBundle, { outcomeId });
  return {
    domain: 'openWorld',
    op: 'reducerBundleCommitted',
    path: 'stateDelta.openWorld.reducerBundle',
    targetId: reducerRef.sourceOutcomeId || outcomeId,
    summary: 'Committed open-world reducer bundle source.',
    sourceKind: reducerRef.sourceKind,
    sourceHash: reducerRef.sourceHash,
    sourceOutcomeId: reducerRef.sourceOutcomeId,
    sourceEventIds: reducerRef.sourceEventIds,
    sourceAnchorRangeHash: reducerRef.sourceAnchorRangeHash,
    operationCount: reducerRef.operationCount,
    changedRoots: reducerRef.changedRoots,
    factHash: reducerRef.factHash,
    valueHash: reducerRef.operationHash
  };
}

function validateOpenWorldReducerSource(turnPacket) {
  const reducerBundle = turnPacket?.stateDelta?.openWorld?.reducerBundle;
  if (!reducerBundle) return null;
  return validateOpenWorldReducerBundle(reducerBundle);
}

async function commitCoreMechanics({
  coreTurnStore,
  transactionId,
  beforeCampaignState,
  campaignState,
  turnPacket,
  outcomeId
} = {}) {
  if (typeof coreTurnStore?.commitMechanics !== 'function') {
    return { status: 'skipped', reason: 'core-store-unavailable' };
  }
  const id = compact(transactionId);
  if (!id) return { status: 'skipped', reason: 'missing-core-transaction-id' };
  if (typeof coreTurnStore?.advanceTurn !== 'function') {
    return { status: 'skipped', reason: 'core-store-route-unavailable' };
  }
  let baseMechanicsRevision = null;
  try {
    if (typeof coreTurnStore?.getTransaction === 'function') {
      const transaction = await coreTurnStore.getTransaction(id);
      if (Number.isFinite(Number(transaction?.revisions?.mechanics))) {
        baseMechanicsRevision = Number(transaction.revisions.mechanics);
      }
    }
    if (Number.isFinite(baseMechanicsRevision) && typeof coreTurnStore?.getRevisions === 'function') {
      const revisions = await coreTurnStore.getRevisions();
      const currentMechanicsRevision = Number(revisions?.mechanics);
      if (Number.isFinite(currentMechanicsRevision) && currentMechanicsRevision !== baseMechanicsRevision) {
        const error = new Error(`Stale CORE mechanics base revision for "${id}"`);
        error.code = 'DIRECTIVE_CORE_STALE_MECHANICS_REVISION';
        error.details = { expected: currentMechanicsRevision, actual: baseMechanicsRevision };
        throw error;
      }
    }
    const reducerOperation = openWorldReducerOperation(turnPacket, outcomeId);
    const reducerRoots = reducerOperation?.changedRoots || [];
    const explicitOperations = explicitStateDeltaDomainOperations(turnPacket, beforeCampaignState, campaignState, {
      excludedDomains: reducerRoots
    });
    const competenceOperation = explicitCompetencePacketOperation(turnPacket, beforeCampaignState, campaignState, {
      excludedDomains: reducerRoots
    });
    if (competenceOperation) explicitOperations.push(competenceOperation);
    explicitOperations.push(...explicitPacketAppendOperations(turnPacket, beforeCampaignState, campaignState, {
      excludedDomains: reducerRoots
    }));
    explicitOperations.push(...explicitWorldStateSubDeltaOperations(turnPacket, beforeCampaignState, campaignState));
    explicitOperations.push(...explicitTerminalStateOperations(turnPacket, beforeCampaignState, campaignState, {
      excludedDomains: reducerRoots
    }));
    explicitOperations.push(...explicitRelationshipOperations(turnPacket, beforeCampaignState, campaignState, {
      excludedDomains: reducerRoots
    }));
    const explicitRoots = explicitOperations.map((operation) => operation.domain);
    const operations = mechanicsDomainOperations(beforeCampaignState, campaignState, {
      excludedDomains: [...reducerRoots, ...explicitRoots],
      turnPacket,
      outcomeId
    });
    operations.push(...explicitOperations);
    if (reducerOperation) operations.push(reducerOperation);
    const bundle = {
      batchId: `mechanics:${outcomeId}`,
      idempotencyKey: `mechanics:${id}:${outcomeId}`,
      turnId: turnPacket?.turnId || turnPacket?.id || null,
      outcomeId,
      summary: 'Committed deterministic Directive mechanics.',
      baseMechanicsRevision: baseMechanicsRevision ?? undefined,
      checkpointBefore: {
        checkpointId: safeCheckpointId(`core-mechanics-${outcomeId}`, `core-mechanics-${id}`),
        sourceKind: 'coreStoreV2.checkpoint',
        checkpointProducer: 'turnCommitCoordinator.beforeCampaignState',
        campaignState: mechanicsCheckpointCampaignState(beforeCampaignState)
      },
      snapshotBeforeRetained: true,
      operations,
      committedRoots: uniqueStrings(operations.map((operation) => operation.domain)),
      promptDirtyDomains: [],
      phaseAfter: 'mechanicsPending'
    };
    await coreTurnStore.advanceTurn(id, {
      phase: 'routePending',
      route: 'directivePosted',
      reason: 'directive-mechanics-commit-bridge',
      idempotencyKey: `route-pending:${id}`
    });
    const turn = await coreTurnStore.commitMechanics(id, bundle);
    return {
      status: 'committed',
      transactionId: id,
      turnId: turn?.turnId || bundle.turnId || null,
      outcomeId: turn?.outcomeId || outcomeId,
      operationCount: operations.length,
      operationHash: turn?.operationHash || hashStableJson(bundle),
      coreCheckpointRef: turn?.coreCheckpointRef ? cloneJson(turn.coreCheckpointRef) : null
    };
  } catch (error) {
    return {
      status: 'error',
      transactionId: id,
      code: error?.code || 'DIRECTIVE_CORE_MECHANICS_COMMIT_FAILED',
      message: error?.message || String(error)
    };
  }
}

async function recordCoreOutcomeReplacement({
  coreTurnStore,
  transactionId,
  outcomeReplacement,
  turnPacket,
  outcomeId
} = {}) {
  if (!outcomeReplacement || typeof coreTurnStore?.recordOutcomeReplacement !== 'function') return null;
  const id = compact(outcomeReplacement.transactionId);
  if (!id) {
    const error = new Error('CORE outcome replacement recording requires an explicit replacement transaction id.');
    error.code = 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_TRANSACTION_REQUIRED';
    error.details = { transactionId: compact(transactionId) || null };
    throw error;
  }
  const replacementRef = {
    ...cloneJson(outcomeReplacement),
    transactionId: id,
    replacementOutcomeId: compact(outcomeReplacement.replacementOutcomeId) || outcomeId,
    replacementTurnId: compact(outcomeReplacement.replacementTurnId) || turnPacket?.turnId || turnPacket?.id || null
  };
  return coreTurnStore.recordOutcomeReplacement(id, replacementRef);
}

function compactError(error) {
  return {
    name: error?.name || 'Error',
    code: error?.code || null,
    message: error?.message || String(error)
  };
}

async function markCoreOutcomeReplacementPersistFailureRecovery({
  coreTurnStore,
  coreMechanics,
  coreOutcomeReplacement,
  outcomeReplacement,
  outcomeId,
  error
} = {}) {
  if (!coreOutcomeReplacement || typeof coreTurnStore?.markRecoveryRequired !== 'function') return null;
  const transactionId = compact(coreOutcomeReplacement.transactionId)
    || compact(outcomeReplacement?.transactionId)
    || compact(coreMechanics?.transactionId);
  if (!transactionId) return null;
  const replacementOutcomeId = compact(outcomeReplacement?.replacementOutcomeId)
    || compact(coreOutcomeReplacement.replacementOutcomeId)
    || outcomeId;
  const replacedOutcomeId = compact(outcomeReplacement?.replacedOutcomeId)
    || compact(coreOutcomeReplacement.replacedOutcomeId)
    || null;
  return coreTurnStore.markRecoveryRequired(transactionId, {
    id: `recovery:outcome-replacement-persist:${transactionId}`,
    status: 'required',
    reason: 'outcome-replacement-active-save-persist-failed',
    phaseAfter: 'recoveryRequired',
    dependentOutcomeId: replacementOutcomeId || outcomeId,
    idempotencyKey: `outcome-replacement-active-save-persist-failed:${outcomeReplacement?.idempotencyKey || transactionId}:${replacementOutcomeId || outcomeId}`,
    repairDecision: {
      kind: 'directive.repairOutcomeReplacementPersistFailure.v1',
      action: 'reviewOutcomeReplacementPersistFailure',
      transactionId,
      replacedOutcomeId,
      replacementOutcomeId,
      replacementTransactionId: compact(outcomeReplacement?.replacementTransactionId) || transactionId,
      replacedTransactionId: compact(outcomeReplacement?.replacedTransactionId) || null,
      normalTurnAllowed: false,
      activeSavePersistError: compactError(error)
    },
    allowedActions: [
      'reviewOutcomeReplacementPersistFailure',
      'retryActiveSavePersistence',
      'discardRerunCandidate'
    ]
  });
}

function annotateCoreMechanicsLedgerEntry(state, outcomeId, coreMechanics = null) {
  const transactionId = compact(coreMechanics?.transactionId);
  if (!state || !outcomeId || !transactionId) return state;
  const entry = (state.turnLedger?.entries || []).find((item) => item?.outcomeId === outcomeId);
  if (entry) {
    entry.coreTransactionId = transactionId;
    entry.coreTurnId = coreMechanics.turnId || null;
    entry.coreOperationHash = coreMechanics.operationHash || null;
    if (coreMechanics.coreCheckpointRef) {
      entry.coreCheckpointRef = cloneJson(coreMechanics.coreCheckpointRef);
      entry.snapshotBeforeRetained = true;
    }
  }
  if (state.runtimeTracking?.lastCommittedTurn?.outcomeId === outcomeId) {
    state.runtimeTracking.lastCommittedTurn = {
      ...state.runtimeTracking.lastCommittedTurn,
      coreTransactionId: transactionId,
      coreTurnId: coreMechanics.turnId || null,
      coreOperationHash: coreMechanics.operationHash || null,
      ...lastCommittedTurnProjectionFields({
        transactionId,
        turnId: coreMechanics.turnId || state.runtimeTracking.lastCommittedTurn.turnId,
        outcomeId,
        status: 'coreMechanicsCommitted'
      })
    };
  }
  return state;
}

export function createTurnCommitCoordinator({ persist, coreTurnStore = null, now = null } = {}) {
  if (typeof persist !== 'function') {
    throw new Error('TurnCommitCoordinator requires persist(campaignState, summary).');
  }

  async function checkpointMechanics({
    beforeCampaignState,
    campaignState,
    turnPacket,
    ingressId = null,
    outcomeReplacement = null
  } = {}) {
    const before = initializeCampaignRuntimeTracking(beforeCampaignState || campaignState);
    const after = initializeCampaignRuntimeTracking(campaignState);
    const outcomeId = turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id;
    if (!outcomeId) throw new Error('Committed turn packet is missing outcome id.');
    validateOpenWorldReducerSource(turnPacket);
    const committedAt = timestamp(now);
    const ingress = await findIngressById(after, ingressId, { coreTurnStore });
    const mechanicsTransactionId = compact(outcomeReplacement?.transactionId) || ingress?.coreTransactionId || null;
    const turnId = turnPacket?.turnId || turnPacket?.id || null;
    after.runtimeTracking.lastCommittedTurn = {
      turnId,
      outcomeId,
      resultBand: turnPacket?.outcomePacket?.resultBand || turnPacket?.finalOutcome?.resultBand || null,
      continuityProjection: cloneJson(turnPacket?.provenance?.continuityProjection || null),
      narrationStatus: 'pending',
      responseStatus: 'pending',
      committedAt,
      coreTransactionId: mechanicsTransactionId || null,
      ...lastCommittedTurnProjectionFields({
        transactionId: mechanicsTransactionId,
        turnId,
        outcomeId,
        status: 'mechanicsPending'
      })
    };
    const tracked = commitTrackedCampaignState({
      campaignState: before,
      nextCampaignState: after,
      delta: {
        source: 'missionDirector',
        reason: `Deterministic mechanics committed for ${outcomeId}.`,
        summary: 'Mechanics checkpoint committed for the latest campaign turn.',
        domains: MECHANICS_DOMAINS,
        ingressId,
        turnId: turnPacket?.turnId || turnPacket?.id || null,
        outcomeId,
        stable: true
      },
      now
    });
    const coreMechanics = await commitCoreMechanics({
      coreTurnStore,
      transactionId: mechanicsTransactionId,
      beforeCampaignState: before,
      campaignState: tracked,
      turnPacket,
      outcomeId
    });
    if (coreMechanics.status === 'error') {
      const error = new Error(coreMechanics.message || 'CORE mechanics commit failed.');
      error.code = coreMechanics.code || 'DIRECTIVE_CORE_MECHANICS_COMMIT_FAILED';
      error.details = coreMechanics;
      throw error;
    }
    annotateCoreMechanicsLedgerEntry(tracked, outcomeId, coreMechanics);
    if (outcomeReplacement && coreMechanics.status !== 'committed') {
      const error = new Error('CORE outcome replacement recording requires a committed CORE mechanics checkpoint.');
      error.code = 'DIRECTIVE_CORE_OUTCOME_REPLACEMENT_MECHANICS_REQUIRED';
      error.details = { coreMechanics };
      throw error;
    }
    const coreOutcomeReplacement = await recordCoreOutcomeReplacement({
      coreTurnStore,
      transactionId: coreMechanics.transactionId || ingress?.coreTransactionId || null,
      outcomeReplacement,
      turnPacket,
      outcomeId
    });
    let save;
    try {
      save = await persist(tracked, 'Committed mechanics checkpoint for the latest campaign turn.');
    } catch (error) {
      if (outcomeReplacement) {
        try {
          await markCoreOutcomeReplacementPersistFailureRecovery({
            coreTurnStore,
            coreMechanics,
            coreOutcomeReplacement,
            outcomeReplacement,
            outcomeId,
            error
          });
        } catch (recoveryError) {
          error.coreOutcomeReplacementRecoveryError = compactError(recoveryError);
        }
        throw error;
      }
      return {
        campaignState: tracked,
        save: null,
        outcomeId,
        coreMechanics,
        coreOutcomeReplacement,
        persistStatus: 'failedAfterCoreMechanics',
        persistError: compactError(error)
      };
    }
    return {
      campaignState: tracked,
      save: cloneJson(save),
      outcomeId,
      coreMechanics,
      coreOutcomeReplacement,
      persistStatus: 'stored',
      persistError: null
    };
  }

  async function markNarration({
    campaignState,
    outcomeId,
    status,
    error = null,
    directiveGenerationStartedAt = null
  } = {}) {
    const next = initializeCampaignRuntimeTracking(campaignState);
    if (next.runtimeTracking.lastCommittedTurn?.outcomeId === outcomeId) {
      const startedAt = directiveGenerationStartedAt
        || next.runtimeTracking.lastCommittedTurn.directiveGenerationStartedAt
        || null;
      next.runtimeTracking.lastCommittedTurn = {
        ...next.runtimeTracking.lastCommittedTurn,
        narrationStatus: status,
        narrationError: error ? cloneJson(error) : null,
        directiveGenerationStartedAt: startedAt,
        narrationUpdatedAt: timestamp(now),
        ...lastCommittedTurnProjectionFields({
          transactionId: next.runtimeTracking.lastCommittedTurn.coreTransactionId,
          turnId: next.runtimeTracking.lastCommittedTurn.turnId,
          outcomeId,
          status: `narration:${status}`
        })
      };
    }
    try {
      const save = await persist(next, `Narration ${status === 'complete' ? 'completed' : status} for the latest committed turn.`);
      return { campaignState: next, save: cloneJson(save), persistStatus: 'stored', persistError: null };
    } catch (persistError) {
      return {
        campaignState: next,
        save: null,
        persistStatus: 'failedAfterNarration',
        persistError: compactError(persistError)
      };
    }
  }

  async function markResponse({ campaignState, outcomeId, status, hostMessageId = null, error = null } = {}) {
    const next = initializeCampaignRuntimeTracking(campaignState);
    if (next.runtimeTracking.lastCommittedTurn?.outcomeId === outcomeId) {
      next.runtimeTracking.lastCommittedTurn = {
        ...next.runtimeTracking.lastCommittedTurn,
        responseStatus: status,
        hostMessageId,
        responseError: error ? cloneJson(error) : null,
        responseUpdatedAt: timestamp(now),
        ...lastCommittedTurnProjectionFields({
          transactionId: next.runtimeTracking.lastCommittedTurn.coreTransactionId,
          turnId: next.runtimeTracking.lastCommittedTurn.turnId,
          outcomeId,
          status: `response:${status}`
        })
      };
    }
    try {
      const save = await persist(next, `Campaign response ${status} for the latest committed turn.`);
      return { campaignState: next, save: cloneJson(save), persistStatus: 'stored', persistError: null };
    } catch (persistError) {
      return {
        campaignState: next,
        save: null,
        persistStatus: 'failedAfterResponse',
        persistError: compactError(persistError)
      };
    }
  }

  return { checkpointMechanics, markNarration, markResponse };
}
