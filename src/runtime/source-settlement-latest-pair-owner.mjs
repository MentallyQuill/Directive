import { createSourceSettlementService } from './source-settlement-service.mjs';
import { getDefaultGenerationRoleDefinitions } from '../generation/generation-roles.mjs';
import {
  SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID,
  latestPairSourceSettlementMetadata
} from './source-settlement-latest-pair-contract.mjs';

const LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS = getDefaultGenerationRoleDefinitions()[SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID]?.timeoutMs || 45000;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(now) {
  return typeof now === 'function' ? now() : (now || new Date().toISOString());
}

function operationRoot(operation = {}) {
  const path = String(operation?.path || operation?.pointer || '').trim().replace(/^\/+/, '');
  const pathRoot = path.split(/[./]/)[0] || null;
  if (pathRoot) return pathRoot;
  return String(operation?.domain || operation?.root || operation?.targetRoot || '').trim() || null;
}

function isMechanicsRoot(root = '') {
  return root && !['runtimeTracking', 'sceneHandshake'].includes(root);
}

function sourceSettlementFrameFor(snapshot = {}, sourceFrame = null, {
  selectedAssistantVariantLedgerRecord = () => null
} = {}) {
  if (sourceFrame && typeof sourceFrame === 'object') return cloneJson(sourceFrame);
  const selected = selectedAssistantVariantLedgerRecord(snapshot.source?.previousAssistant?.selectedVariant);
  const selectedHash = selected?.selectedTextHash || snapshot.source?.previousAssistant?.textHash || null;
  return {
    id: `scene-handshake-frame:${snapshot.source?.sourceRangeHash || 'latest-pair'}`,
    campaignId: snapshot.envelope?.campaignId || null,
    saveId: snapshot.envelope?.saveId || null,
    chatId: snapshot.envelope?.chatId || null,
    sourceKind: 'sceneHandshakeLatestPair',
    selectedAssistantVariantHash: selectedHash,
    sourceIntegrity: selected?.sourceIntegrity || 'clean',
    previousAssistant: {
      hostMessageId: snapshot.source?.previousAssistant?.hostMessageId || null,
      chatId: snapshot.envelope?.chatId || null,
      role: 'assistant',
      textHash: selectedHash,
      selectedAssistantVariantHash: selectedHash
    },
    currentPlayer: {
      hostMessageId: snapshot.source?.currentPlayer?.hostMessageId || null,
      chatId: snapshot.envelope?.chatId || null,
      role: 'player',
      textHash: snapshot.source?.currentPlayer?.textHash || null
    }
  };
}

function sourceSettlementProviderSource(snapshot = {}, sourceFrame = {}, {
  selectedAssistantVariantLedgerRecord = () => null
} = {}) {
  const selected = selectedAssistantVariantLedgerRecord(snapshot.source?.previousAssistant?.selectedVariant);
  const selectedHash = selected?.selectedTextHash || snapshot.source?.previousAssistant?.textHash || null;
  return {
    sourceFrameId: sourceFrame.id || null,
    previousAssistant: {
      hostMessageId: snapshot.source?.previousAssistant?.hostMessageId || null,
      chatId: snapshot.envelope?.chatId || null,
      role: 'assistant',
      textHash: selectedHash,
      selectedAssistantVariantHash: selectedHash,
      selectedAssistantVariant: selected
    },
    currentPlayer: {
      hostMessageId: snapshot.source?.currentPlayer?.hostMessageId || null,
      chatId: snapshot.envelope?.chatId || null,
      role: 'player',
      textHash: snapshot.source?.currentPlayer?.textHash || null
    },
    selectedAssistantVariantHash: selectedHash,
    rangeHash: snapshot.source?.sourceRangeHash || null
  };
}

export async function settleLatestPairSceneHandshakeSource({
  campaignState,
  snapshot,
  idempotencyKey,
  settlementId,
  stateDeltaGateway,
  runLatestPairSettlementProvider,
  validateLatestPairSettlementBeforeApply = null,
  latestPairSourceFrame = null,
  packageData = null,
  generationRouter = null,
  coreStore = null,
  ingressId = null,
  now = null,
  selectedAssistantVariantLedgerRecord = () => null,
  createSceneHandshakeLedgerRecord = null,
  sceneHandshakeResultOperations = null,
  commitAcceptedSceneTimeAdvance = null
} = {}) {
  if (typeof runLatestPairSettlementProvider !== 'function') return null;
  if (typeof createSceneHandshakeLedgerRecord !== 'function') {
    throw new Error('Latest-pair Scene Handshake source settlement requires createSceneHandshakeLedgerRecord().');
  }
  if (typeof sceneHandshakeResultOperations !== 'function') {
    throw new Error('Latest-pair Scene Handshake source settlement requires sceneHandshakeResultOperations().');
  }
  const adapter = { selectedAssistantVariantLedgerRecord };
  const sourceFrame = sourceSettlementFrameFor(snapshot, latestPairSourceFrame, adapter);
  const source = sourceSettlementProviderSource(snapshot, sourceFrame, adapter);
  const expected = {
    campaignId: snapshot.envelope.campaignId || null,
    saveId: snapshot.envelope.saveId || null,
    chatId: snapshot.envelope.chatId || null,
    selectedAssistantVariantHash: source.selectedAssistantVariantHash || null
  };
  let applied = null;
  let record = null;
  let providerSettlement = null;
  let appliedOperationRoots = [];
  const sourceSettlementOptions = {
    coreStore,
    clock: () => timestamp(now),
    runLatestPairProvider: runLatestPairSettlementProvider,
    providerTimeoutMs: LATEST_PAIR_SOURCE_SETTLEMENT_TIMEOUT_MS,
    validateBeforeApply: typeof validateLatestPairSettlementBeforeApply === 'function'
      ? validateLatestPairSettlementBeforeApply
      : async () => ({ ok: true })
  };
  if (typeof stateDeltaGateway?.applyOperations === 'function') {
    sourceSettlementOptions.applySettlement = async ({ operations = [], providerResult = null }) => {
      if (!operations.length) return { ok: true, applied: false };
      providerSettlement = providerResult?.settlement || null;
      const expectedApplied = {
        revision: null,
        mechanicsRevision: null
      };
      record = createSceneHandshakeLedgerRecord({
        settlementId,
        idempotencyKey,
        disposition: providerSettlement?.disposition || 'autoCommit',
        status: 'settled',
        reasons: ['source-settlement-latest-pair-accepted'],
        snapshot,
        settlement: providerSettlement,
        operations,
        generation: providerResult?.generation || null,
        parse: providerResult?.parse || null,
        applied: expectedApplied,
        modelRoleId: SOURCE_SETTLEMENT_LATEST_PAIR_ROLE_ID,
        metadata: latestPairSourceSettlementMetadata(),
        recordedAt: timestamp(now)
      });
      const proposalOperations = [
        ...operations,
        ...sceneHandshakeResultOperations(record)
      ];
      appliedOperationRoots = [
        ...new Set(proposalOperations.map(operationRoot).filter(Boolean))
      ];
      applied = await stateDeltaGateway.applyOperations({
        id: `${settlementId}:sourceSettlement`,
        source: 'sourceSettlement',
        reason: 'SRE latest-pair settlement committed accepted assistant/player source operations.',
        summary: 'SRE latest-pair settlement committed accepted assistant/player source operations.',
        ingressId,
        operations: proposalOperations,
        domains: [...new Set(proposalOperations.map(operationRoot).filter(Boolean))],
        metadata: {
          settlementId,
          idempotencyKey,
          ...latestPairSourceSettlementMetadata(),
          sourceAnchorRange: snapshot.source.sourceRangeHash,
          selectedAssistantVariant: selectedAssistantVariantLedgerRecord(snapshot.source.previousAssistant.selectedVariant),
          evidenceMessageIds: [
            snapshot.source.previousAssistant.hostMessageId,
            snapshot.source.currentPlayer.hostMessageId
          ].filter(Boolean)
        }
      }, {
        allowedRoots: ['mission', 'commandLog', 'ship', 'threadLedger', 'commandAuthority', 'runtimeTracking', 'sceneHandshake']
      });
      return { ok: true, applied: true };
    };
  }
  const sourceSettlement = createSourceSettlementService(sourceSettlementOptions);
  const decision = await sourceSettlement.settleLatestPair({
    transactionId: `scene-handshake:${settlementId}`,
    settlementId,
    idempotencyKey: `sre:scene-handshake:${idempotencyKey}`,
    sourceFrame,
    snapshot,
    campaignState,
    source,
    expected,
    previousAssistant: source.previousAssistant,
    currentPlayer: source.currentPlayer,
    observedAt: timestamp(now)
  });
  if (decision.status !== 'accepted' || decision.applied !== true || !applied) {
    return {
      attempted: true,
      ok: decision.status === 'noChange',
      disposition: decision.status || 'sourceSettlementStopped',
      promptDirty: false,
      sourceSettlement: decision,
      committedRoots: [],
      operationCount: 0,
      campaignState,
      reason: decision.reasons?.[0] || decision.status || 'source-settlement-stopped'
    };
  }
  const appliedRecord = {
    ...record,
    appliedRevision: applied.revision || null,
    appliedMechanicsRevision: applied.mechanicsRevision || null
  };
  const timeAdvance = (providerSettlement?.disposition || 'autoCommit') === 'autoCommit'
    && typeof commitAcceptedSceneTimeAdvance === 'function'
    ? await commitAcceptedSceneTimeAdvance({
        campaignState: applied.campaignState,
        snapshot,
        settlement: providerSettlement || { acceptedPreviousResponse: true },
        stateDeltaGateway,
        packageData,
        generationRouter,
        ingressId,
        settlementId,
        now
      })
    : { campaignState: applied.campaignState, promptDirty: false, proposal: null, boundary: null };
  const committedRoots = [
    ...new Set([
      ...(Array.isArray(applied?.domains) ? applied.domains : []),
      ...appliedOperationRoots,
      ...(timeAdvance.boundary ? ['worldState', 'timeLedger', 'eventLedger'] : [])
    ].filter(Boolean))
  ];
  const promptDirtyDomains = committedRoots.filter(isMechanicsRoot);
  return {
    attempted: true,
    ok: true,
    disposition: 'autoCommit',
    promptDirty: promptDirtyDomains.length > 0 || timeAdvance.promptDirty,
    promptDirtyDomains,
    sourceSettlement: decision,
    record: appliedRecord,
    settlement: cloneJson(providerSettlement),
    committedRoots,
    operationCount: decision.operations?.length || 0,
    campaignState: timeAdvance.campaignState,
    applied,
    timeAdvance: cloneJson(timeAdvance.proposal || null),
    timeBoundary: cloneJson(timeAdvance.boundary?.event || null)
  };
}
