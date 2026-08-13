import { rebuildV1CommandBearingForLineage } from '../command/v1-command-bearing.mjs';
import { eligibleMissionCommandBearingAwards } from '../mission/v1/mission-reducer.mjs';
import { initialMissionRunId, successorMissionRunId } from '../mission/v1/mission-journey.mjs';
import { createStateDeltaGateway } from './state-delta-gateway.mjs';
import { createV1StateSpine } from './v1-state-spine.mjs';
import { stableHash24 } from './v1-stable-hash.mjs';
import { normalizeNativeBranchMessage } from './native-branch-lineage.mjs';
import { invalidateV1AcceptedPairTimeByHostMessages } from './v1-accepted-pair-time.mjs';
import { assertV1CampaignState } from './v1-campaign-state.mjs';
import { buildV1RuntimePlayerProjection, resolveActiveV1MissionDefinition } from './v1-mission-runtime.mjs';
import { validateMissionStateAuthority } from '../mission/v1/mission-state-authority.mjs';
import { validateStorySettlement } from '../story/story-settlement-contracts.mjs';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function compact(value) {
  return String(value ?? '').trim();
}

function reconstructionError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = clone(details);
  return error;
}

function sameLineageMessage(left, right) {
  return left.hostMessageId === right.hostMessageId
    && left.role === right.role
    && left.selectedSwipeId === right.selectedSwipeId
    && left.textHash === right.textHash;
}

function rebindExactCustody(value, replacements, key = null) {
  if (Array.isArray(value)) return value.map((entry) => rebindExactCustody(entry, replacements));
  if (!value || typeof value !== 'object') {
    if (new Set(['branchId', 'saveId', 'chatId']).has(key) && replacements.has(value)) return replacements.get(value);
    return value;
  }
  return Object.fromEntries(Object.entries(value).map(([childKey, entry]) => [
    childKey,
    rebindExactCustody(entry, replacements, childKey)
  ]));
}

function replaceExactValues(value, replacements) {
  if (Array.isArray(value)) return value.map((entry) => replaceExactValues(entry, replacements));
  if (!value || typeof value !== 'object') return replacements.has(value) ? replacements.get(value) : value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceExactValues(entry, replacements)]));
}

function rebindMissionEvidenceKeys(campaignState, sourceBranchId, targetBranchId) {
  const runs = [
    ...(campaignState.mission?.v1History || []).map((archive) => archive.state),
    campaignState.mission?.v1
  ].filter(Boolean);
  for (const state of runs) {
    const replacements = new Map();
    for (const entry of state.evidenceLog || []) {
      const priorEvidenceKey = entry.evidenceKey;
      const parts = String(entry.evidenceKey || '').split('|');
      if (parts[0] === sourceBranchId) {
        parts[0] = targetBranchId;
        entry.evidenceKey = parts.join('|');
        replacements.set(priorEvidenceKey, entry.evidenceKey);
      }
    }
    state.clocks = replaceExactValues(state.clocks, replacements);
    state.acceptedEvidenceKeys = (state.evidenceLog || []).map((entry) => entry.evidenceKey);
  }
  return campaignState;
}

function definitionMap(runtimeAssets = {}) {
  return new Map((runtimeAssets.missionDefinitions || []).map((entry) => [entry.id, entry]));
}

function rebindMissionRunLineage(campaignState, targetSaveId, runtimeAssets) {
  const definitions = definitionMap(runtimeAssets);
  const replacements = new Map();
  let priorRunId = null;
  let previousArchive = null;
  for (const archive of campaignState.mission.v1History || []) {
    const definition = definitions.get(archive.definitionId);
    if (!definition) throw reconstructionError('DIRECTIVE_BRANCH_DEFINITION_MISSING', `Mission definition ${archive.definitionId} is unavailable.`);
    const nextRunId = priorRunId
      ? successorMissionRunId({
        branchId: targetSaveId,
        sourceRunId: priorRunId,
        transitionId: previousArchive?.state?.transitionReceipt?.transitionId,
        sourceMissionRevision: previousArchive?.state?.revision,
        targetDefinition: definition
      })
      : initialMissionRunId({ branchId: targetSaveId, definition });
    replacements.set(archive.runId, nextRunId);
    archive.runId = nextRunId;
    priorRunId = nextRunId;
    previousArchive = archive;
  }
  const currentDefinition = definitions.get(campaignState.mission.v1.definitionId);
  if (!currentDefinition) throw reconstructionError('DIRECTIVE_BRANCH_DEFINITION_MISSING', `Mission definition ${campaignState.mission.v1.definitionId} is unavailable.`);
  previousArchive = campaignState.mission.v1History?.at(-1) || null;
  const nextActiveRunId = priorRunId
    ? successorMissionRunId({
      branchId: targetSaveId,
      sourceRunId: priorRunId,
      transitionId: previousArchive?.state?.transitionReceipt?.transitionId,
      sourceMissionRevision: previousArchive?.state?.revision,
      targetDefinition: currentDefinition
    })
    : initialMissionRunId({ branchId: targetSaveId, definition: currentDefinition });
  replacements.set(campaignState.mission.v1Journey.activeRunId, nextActiveRunId);
  campaignState.mission.v1Journey.activeRunId = nextActiveRunId;
  return replaceExactValues(campaignState, replacements);
}

function eligibleObjectiveIds(campaignState, runtimeAssets) {
  const definitions = definitionMap(runtimeAssets);
  const missionStates = [
    ...(campaignState.mission.v1History || []).map((archive) => ({ definitionId: archive.definitionId, state: archive.state })),
    { definitionId: campaignState.mission.v1.definitionId, state: campaignState.mission.v1 }
  ];
  return missionStates.flatMap(({ definitionId, state }) => {
    const definition = definitions.get(definitionId);
    return definition ? eligibleMissionCommandBearingAwards(definition, state).map((award) => award.sourceObjectiveId) : [];
  });
}

function sourceMatchesDiscarded(sourceMessageId, discardedIds) {
  const source = compact(sourceMessageId);
  if (!source) return false;
  for (const id of discardedIds) {
    if (source === id || source.startsWith(`time-boundary:${stableHash24(id)}:`)) return true;
  }
  return false;
}

function discardedContributionIds(campaignState, discardedIds) {
  const runs = [
    ...(campaignState.mission.v1History || []).map((archive, index) => ({ index, state: archive.state })),
    { index: (campaignState.mission.v1History || []).length, state: campaignState.mission.v1 }
  ];
  const runMatches = runs.map((run) => ({
    ...run,
    ids: (run.state?.evidenceLog || [])
      .filter((entry) => sourceMatchesDiscarded(entry?.sourceRef?.messageId, discardedIds))
      .map((entry) => entry.sourceContributionId)
      .filter(Boolean)
  }));
  const earliest = runMatches.find((run) => run.ids.length > 0) || null;
  const missionIds = new Set(earliest?.ids || []);
  const allMissionIds = new Set(runs.flatMap((run) => (run.state?.evidenceLog || []).map((entry) => entry.sourceContributionId)).filter(Boolean));
  const storyIds = [];
  for (const episode of campaignState.storySettlement?.episodes || []) {
    for (const contribution of episode.contributions || []) {
      if (sourceMatchesDiscarded(contribution?.messageId, discardedIds) && contribution?.id && !allMissionIds.has(contribution.id)) {
        storyIds.push(contribution.id);
      }
    }
  }
  for (const receipt of campaignState.storySettlement?.receipts || []) {
    for (const [index, messageId] of (receipt.sourceMessageIds || []).entries()) {
      const contributionId = receipt.sourceContributionIds?.[index];
      if (sourceMatchesDiscarded(messageId, discardedIds) && contributionId && !allMissionIds.has(contributionId)) storyIds.push(contributionId);
    }
  }
  return [...new Set([...missionIds, ...storyIds])];
}

export function rebindV1CampaignStateCustody({
  campaignState,
  targetSaveId,
  targetChatBinding,
  runtimeAssets = {}
} = {}) {
  assertV1CampaignState(campaignState);
  const saveId = compact(targetSaveId);
  if (!saveId || targetChatBinding?.saveId !== saveId) {
    throw reconstructionError('DIRECTIVE_BRANCH_TARGET_INVALID', 'State rebinding requires one exact target save binding.');
  }
  const parentBinding = campaignState.campaignChatBinding || {};
  let next = rebindExactCustody(clone(campaignState), new Map([
    [parentBinding.saveId, saveId],
    [parentBinding.chatId, targetChatBinding.chatId]
  ]));
  next = rebindMissionEvidenceKeys(next, parentBinding.saveId, saveId);
  next.campaignChatBinding = clone(targetChatBinding);
  next = rebindMissionRunLineage(next, saveId, runtimeAssets);
  assertV1CampaignState(next);
  const projection = buildV1RuntimePlayerProjection({ campaignState: next, runtimeAssets });
  if (!projection.ok) {
    const activeDefinition = definitionMap(runtimeAssets).get(next.mission.v1.definitionId) || {};
    throw reconstructionError('DIRECTIVE_BRANCH_PROJECTION_INVALID', 'The rebound timeline projection is invalid.', {
      projection,
      missionValidation: validateMissionStateAuthority({ definition: activeDefinition, state: next.mission.v1 }),
      storyValidation: validateStorySettlement(next.storySettlement)
    });
  }
  return { campaignState: clone(next), projection };
}

export async function reconstructV1BranchState({
  parentState,
  parentMessages = [],
  childMessages = [],
  lineageHash = null,
  targetSaveId,
  targetChatBinding,
  runtimeAssets = {},
  now = () => new Date().toISOString()
} = {}) {
  assertV1CampaignState(parentState);
  const saveId = compact(targetSaveId);
  if (!saveId || targetChatBinding?.saveId !== saveId) {
    throw reconstructionError('DIRECTIVE_BRANCH_TARGET_INVALID', 'Branch reconstruction requires one exact target save binding.');
  }
  const normalizedParent = parentMessages.map(normalizeNativeBranchMessage);
  const normalizedChild = childMessages.map(normalizeNativeBranchMessage);
  if (normalizedChild.length > normalizedParent.length) {
    throw reconstructionError('DIRECTIVE_BRANCH_LINEAGE_INVALID', 'The child transcript is longer than its parent.');
  }
  for (let index = 0; index < normalizedChild.length; index += 1) {
    if (!sameLineageMessage(normalizedParent[index], normalizedChild[index])) {
      throw reconstructionError('DIRECTIVE_BRANCH_LINEAGE_INVALID', 'The child transcript is not an exact retained parent prefix.', { index });
    }
  }

  let campaignState = clone(parentState);
  const gateway = createStateDeltaGateway({
    getState: () => campaignState,
    setState: (next) => { campaignState = clone(next); }
  });
  const discardedHostMessageIds = normalizedParent.slice(normalizedChild.length).map((message) => message.hostMessageId).filter(Boolean);
  const discardedIds = new Set(discardedHostMessageIds);
  const contributionIds = discardedContributionIds(campaignState, discardedIds);
  if (contributionIds.length > 0) {
    const resolved = resolveActiveV1MissionDefinition({ campaignState, runtimeAssets });
    if (!resolved.ok) throw reconstructionError('DIRECTIVE_BRANCH_MISSION_REBUILD_FAILED', 'Mission authority could not be resolved.', resolved);
    const spine = createV1StateSpine({ getState: () => campaignState, stateDeltaGateway: gateway, resolveSourceRef: () => null, now });
    try {
      await spine.invalidateSources({
        definition: resolved.definition,
        missionDefinitions: runtimeAssets.missionDefinitions || [],
        branchId: campaignState.campaignChatBinding.saveId,
        contributionIds,
        gatewayBaseRevision: gateway.revision(),
        reason: 'native-branch-discarded'
      });
    } catch (error) {
      throw reconstructionError('DIRECTIVE_BRANCH_MISSION_REBUILD_FAILED', 'Mission authority could not be reconstructed.', { message: error?.message, code: error?.code });
    }
  }
  const time = await invalidateV1AcceptedPairTimeByHostMessages({
    campaignState,
    hostMessageIds: discardedHostMessageIds,
    packageData: runtimeAssets.packageData,
    stateDeltaGateway: gateway,
    now,
    eventType: 'native-branch-discarded'
  });
  if (!time.ok) throw reconstructionError('DIRECTIVE_BRANCH_TIME_REBUILD_FAILED', 'Time authority could not be reconstructed.', time);

  campaignState.commandBearing = rebuildV1CommandBearingForLineage(campaignState.commandBearing, {
    retainedMessages: normalizedChild,
    completedObjectiveIds: eligibleObjectiveIds(campaignState, runtimeAssets),
    now
  });
  const rebound = rebindV1CampaignStateCustody({ campaignState, targetSaveId: saveId, targetChatBinding, runtimeAssets });
  campaignState = rebound.campaignState;
  const projection = rebound.projection;
  return {
    campaignState: clone(campaignState),
    discardedHostMessageIds,
    retainedSourceCount: normalizedChild.length,
    lineageHash: compact(lineageHash) || null,
    modelCallCount: 0,
    projection
  };
}
