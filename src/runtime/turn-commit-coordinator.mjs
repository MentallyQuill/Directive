import {
  commitTrackedCampaignState,
  initializeCampaignRuntimeTracking
} from './state-delta-gateway.mjs';
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

function compact(value) {
  return String(value || '').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values = []) {
  return [...new Set(asArray(values).map((value) => String(value || '').trim()).filter(Boolean))];
}

function findIngressById(campaignState, ingressId) {
  const id = compact(ingressId);
  if (!id) return null;
  return (campaignState?.runtimeTracking?.ingressLedger || []).find((entry) => entry?.id === id) || null;
}

function mechanicsDomainOperations(before = {}, after = {}, { excludedDomains = [] } = {}) {
  const operations = [];
  const excluded = new Set(excludedDomains);
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
      beforeHash,
      valueHash: afterHash
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
    const operations = mechanicsDomainOperations(beforeCampaignState, campaignState, {
      excludedDomains: reducerRoots
    });
    if (reducerOperation) operations.push(reducerOperation);
    const bundle = {
      batchId: `mechanics:${outcomeId}`,
      idempotencyKey: `mechanics:${id}:${outcomeId}`,
      turnId: turnPacket?.turnId || turnPacket?.id || null,
      outcomeId,
      summary: 'Committed deterministic Directive mechanics.',
      baseMechanicsRevision: baseMechanicsRevision ?? undefined,
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
      operationHash: turn?.operationHash || hashStableJson(bundle)
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

export function createTurnCommitCoordinator({ persist, coreTurnStore = null, now = null } = {}) {
  if (typeof persist !== 'function') {
    throw new Error('TurnCommitCoordinator requires persist(campaignState, summary).');
  }

  async function checkpointMechanics({
    beforeCampaignState,
    campaignState,
    turnPacket,
    ingressId = null
  } = {}) {
    const before = initializeCampaignRuntimeTracking(beforeCampaignState || campaignState);
    const after = initializeCampaignRuntimeTracking(campaignState);
    const outcomeId = turnPacket?.outcomePacket?.id || turnPacket?.finalOutcome?.id;
    if (!outcomeId) throw new Error('Committed turn packet is missing outcome id.');
    validateOpenWorldReducerSource(turnPacket);
    const committedAt = timestamp(now);
    after.runtimeTracking.lastCommittedTurn = {
      turnId: turnPacket?.turnId || turnPacket?.id || null,
      outcomeId,
      resultBand: turnPacket?.outcomePacket?.resultBand || turnPacket?.finalOutcome?.resultBand || null,
      continuityProjection: cloneJson(turnPacket?.provenance?.continuityProjection || null),
      narrationStatus: 'pending',
      responseStatus: 'pending',
      committedAt
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
    const ingress = findIngressById(tracked, ingressId);
    const coreMechanics = await commitCoreMechanics({
      coreTurnStore,
      transactionId: ingress?.coreTransactionId || null,
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
    const save = await persist(tracked, 'Committed mechanics checkpoint for the latest campaign turn.');
    return { campaignState: tracked, save: cloneJson(save), outcomeId, coreMechanics };
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
        narrationUpdatedAt: timestamp(now)
      };
    }
    const save = await persist(next, `Narration ${status === 'complete' ? 'completed' : status} for the latest committed turn.`);
    return { campaignState: next, save: cloneJson(save) };
  }

  async function markResponse({ campaignState, outcomeId, status, hostMessageId = null, error = null } = {}) {
    const next = initializeCampaignRuntimeTracking(campaignState);
    if (next.runtimeTracking.lastCommittedTurn?.outcomeId === outcomeId) {
      next.runtimeTracking.lastCommittedTurn = {
        ...next.runtimeTracking.lastCommittedTurn,
        responseStatus: status,
        hostMessageId,
        responseError: error ? cloneJson(error) : null,
        responseUpdatedAt: timestamp(now)
      };
    }
    const save = await persist(next, `Campaign response ${status} for the latest committed turn.`);
    return { campaignState: next, save: cloneJson(save) };
  }

  return { checkpointMechanics, markNarration, markResponse };
}
