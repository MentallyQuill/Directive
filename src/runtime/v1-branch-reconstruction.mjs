import { rebuildV1CommandBearingForLineage } from '../command/v1-command-bearing.mjs';
import { eligibleMissionCommandBearingAwards } from '../mission/v1/mission-reducer.mjs';
import { initialMissionRunId, successorMissionRunId } from '../mission/v1/mission-journey.mjs';
import { createStateDeltaGateway } from './state-delta-gateway.mjs';
import { normalizeNativeBranchMessage } from './native-branch-lineage.mjs';
import { invalidateV1AcceptedPairTimeByHostMessage } from './v1-accepted-pair-time.mjs';
import { assertV1CampaignState } from './v1-campaign-state.mjs';
import { buildV1RuntimePlayerProjection, createV1MissionRuntime } from './v1-mission-runtime.mjs';

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

function definitionMap(runtimeAssets = {}) {
  return new Map((runtimeAssets.missionDefinitions || []).map((entry) => [entry.id, entry]));
}

function rebindMissionRunLineage(campaignState, targetSaveId, runtimeAssets) {
  const definitions = definitionMap(runtimeAssets);
  const replacements = new Map();
  let priorRunId = null;
  for (const archive of campaignState.mission.v1History || []) {
    const definition = definitions.get(archive.definitionId);
    if (!definition) throw reconstructionError('DIRECTIVE_BRANCH_DEFINITION_MISSING', `Mission definition ${archive.definitionId} is unavailable.`);
    const nextRunId = priorRunId
      ? successorMissionRunId({
        branchId: targetSaveId,
        sourceRunId: priorRunId,
        transitionId: archive.state?.transitionReceipt?.transitionId,
        sourceMissionRevision: archive.state?.revision,
        targetDefinition: definition
      })
      : initialMissionRunId({ branchId: targetSaveId, definition });
    replacements.set(archive.runId, nextRunId);
    archive.runId = nextRunId;
    priorRunId = nextRunId;
  }
  const currentDefinition = definitions.get(campaignState.mission.v1.definitionId);
  if (!currentDefinition) throw reconstructionError('DIRECTIVE_BRANCH_DEFINITION_MISSING', `Mission definition ${campaignState.mission.v1.definitionId} is unavailable.`);
  const previousArchive = campaignState.mission.v1History?.at(-1) || null;
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
  const missionRuntime = createV1MissionRuntime({
    getState: () => campaignState,
    stateDeltaGateway: gateway,
    interpretAcceptedPair: async () => { throw reconstructionError('DIRECTIVE_BRANCH_MODEL_CALL_FORBIDDEN', 'Branch reconstruction cannot interpret messages.'); },
    evaluateEpisode: async () => { throw reconstructionError('DIRECTIVE_BRANCH_MODEL_CALL_FORBIDDEN', 'Branch reconstruction cannot evaluate episodes.'); },
    now
  });
  const discardedHostMessageIds = normalizedParent.slice(normalizedChild.length).map((message) => message.hostMessageId).filter(Boolean);
  for (const hostMessageId of discardedHostMessageIds) {
    const mission = await missionRuntime.invalidateSourceMutation({ runtimeAssets, hostMessageId, eventType: 'native-branch-discarded' });
    if (!mission.ok) throw reconstructionError('DIRECTIVE_BRANCH_MISSION_REBUILD_FAILED', 'Mission authority could not be reconstructed.', mission);
    const time = await invalidateV1AcceptedPairTimeByHostMessage({
      campaignState,
      hostMessageId,
      packageData: runtimeAssets.packageData,
      stateDeltaGateway: gateway,
      now,
      eventType: 'native-branch-discarded'
    });
    if (!time.ok) throw reconstructionError('DIRECTIVE_BRANCH_TIME_REBUILD_FAILED', 'Time authority could not be reconstructed.', time);
  }

  campaignState.commandBearing = rebuildV1CommandBearingForLineage(campaignState.commandBearing, {
    retainedMessages: normalizedChild,
    completedObjectiveIds: eligibleObjectiveIds(campaignState, runtimeAssets),
    now
  });
  const parentBinding = parentState.campaignChatBinding || {};
  campaignState = rebindExactCustody(campaignState, new Map([
    [parentBinding.saveId, saveId],
    [parentBinding.chatId, targetChatBinding.chatId]
  ]));
  campaignState.campaignChatBinding = clone(targetChatBinding);
  campaignState = rebindMissionRunLineage(campaignState, saveId, runtimeAssets);
  assertV1CampaignState(campaignState);
  const projection = buildV1RuntimePlayerProjection({ campaignState, runtimeAssets });
  if (!projection.ok) {
    throw reconstructionError('DIRECTIVE_BRANCH_PROJECTION_INVALID', 'The reconstructed branch projection is invalid.', projection);
  }
  return {
    campaignState: clone(campaignState),
    discardedHostMessageIds,
    retainedSourceCount: normalizedChild.length,
    lineageHash: compact(lineageHash) || null,
    modelCallCount: 0,
    projection
  };
}
