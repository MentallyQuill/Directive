import {
  V1_RUNTIME_ARCHITECTURE_CONTRACT_VERSION,
  V1_RUNTIME_ARCHITECTURE_KIND,
  V1_SEMANTIC_AUTHORITY
} from './v1-semantic-authority.mjs';
import { validateV1CommandBearing } from '../command/v1-command-bearing.mjs';
import { MISSION_STATE_KIND } from '../mission/v1/mission-state.mjs';
import {
  MISSION_JOURNEY_CONTRACT_VERSION,
  MISSION_JOURNEY_KIND
} from '../mission/v1/mission-journey.mjs';
import {
  STORY_SETTLEMENT_KIND,
  validateStorySettlement
} from '../story/story-settlement-contracts.mjs';

export const V1_STATE_CUSTODY_KIND = 'directive.stateCustody.v1';
export const V1_STATE_CUSTODY_RECENT_COMMIT_LIMIT = 64;

export const V1_CAMPAIGN_STATE_ROOTS = Object.freeze([
  'campaign',
  'activeCampaignPackage',
  'player',
  'ship',
  'mission',
  'storySettlement',
  'commandBearing',
  'settings',
  'worldState',
  'timeLedger',
  'campaignChatBinding',
  'stateCustody'
]);

export const V1_MUTABLE_STATE_DOMAINS = Object.freeze([
  'campaign',
  'mission',
  'storySettlement',
  'commandBearing',
  'worldState',
  'timeLedger',
  'campaignChatBinding'
]);

const REQUIRED_ROOTS = Object.freeze([
  'campaign',
  'activeCampaignPackage',
  'player',
  'ship',
  'mission',
  'storySettlement',
  'commandBearing',
  'settings',
  'worldState',
  'timeLedger',
  'stateCustody'
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value ?? '').trim();
}

function stateError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

export function createV1StateCustody() {
  return {
    kind: V1_STATE_CUSTODY_KIND,
    version: 1,
    revision: 0,
    recentCommitIds: []
  };
}

export function validateV1StateCustody(value) {
  return isObject(value)
    && value.kind === V1_STATE_CUSTODY_KIND
    && value.version === 1
    && Number.isInteger(value.revision)
    && value.revision >= 0
    && Array.isArray(value.recentCommitIds)
    && value.recentCommitIds.length <= V1_STATE_CUSTODY_RECENT_COMMIT_LIMIT
    && value.recentCommitIds.every((id) => Boolean(compact(id)));
}

export function assertV1CampaignState(state) {
  if (!isObject(state)) {
    throw stateError('DIRECTIVE_V1_STATE_REQUIRED', 'Directive requires an exact V1 campaign state object.');
  }
  const allowed = new Set(V1_CAMPAIGN_STATE_ROOTS);
  const forbidden = Object.keys(state).filter((root) => !allowed.has(root));
  if (forbidden.length) {
    throw stateError(
      'DIRECTIVE_V1_STATE_FORBIDDEN_ROOT',
      `Directive V1 does not accept campaign state root "${forbidden[0]}".`,
      { forbiddenRoots: forbidden }
    );
  }
  const missing = REQUIRED_ROOTS.filter((root) => !Object.hasOwn(state, root));
  if (missing.length) {
    throw stateError(
      'DIRECTIVE_V1_STATE_REQUIRED_ROOT_MISSING',
      `Directive V1 campaign state is missing "${missing[0]}".`,
      { missingRoots: missing }
    );
  }
  const stamp = state.campaign?.runtimeArchitecture;
  if (!isObject(stamp)
    || stamp.kind !== V1_RUNTIME_ARCHITECTURE_KIND
    || stamp.contractVersion !== V1_RUNTIME_ARCHITECTURE_CONTRACT_VERSION
    || stamp.semanticAuthority !== V1_SEMANTIC_AUTHORITY
    || stamp.createdForNewSave !== true
    || !compact(stamp.packageId)
    || !compact(stamp.packageVersion)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_ARCHITECTURE_REQUIRED',
      'Directive V1 rejects campaign state without its exact V1 architecture stamp.'
    );
  }
  if (compact(state.activeCampaignPackage?.packageId) !== compact(stamp.packageId)
    || compact(state.activeCampaignPackage?.packageVersion) !== compact(stamp.packageVersion)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_PACKAGE_MISMATCH',
      'Directive V1 campaign state package binding does not match its architecture stamp.'
    );
  }
  if (!validateV1StateCustody(state.stateCustody)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_CUSTODY_REQUIRED',
      'Directive V1 campaign state requires exact directive.stateCustody.v1 metadata.'
    );
  }
  const mission = state.mission;
  const missionKeys = Object.keys(mission || {});
  const allowedMissionKeys = new Set(['activeMissionId', 'v1', 'v1Journey', 'v1History', 'v1Conclusion']);
  const missionBranchId = compact(mission?.v1?.branchId);
  const missionInvalid = !isObject(mission)
    || missionKeys.some((key) => !allowedMissionKeys.has(key))
    || !compact(mission.activeMissionId)
    || !isObject(mission.v1)
    || mission.v1.kind !== MISSION_STATE_KIND
    || mission.v1.schemaVersion !== 1
    || !compact(mission.v1.definitionId)
    || !compact(mission.v1.definitionVersion)
    || mission.v1.packageBinding?.packageId !== state.activeCampaignPackage.packageId
    || mission.v1.packageBinding?.packageVersion !== state.activeCampaignPackage.packageVersion
    || compact(mission.v1.packageBinding?.sourceId) !== compact(mission.activeMissionId)
    || !missionBranchId
    || !isObject(mission.v1Journey)
    || mission.v1Journey.kind !== MISSION_JOURNEY_KIND
    || mission.v1Journey.contractVersion !== MISSION_JOURNEY_CONTRACT_VERSION
    || compact(mission.v1Journey.branchId) !== missionBranchId
    || !Number.isInteger(mission.v1Journey.revision)
    || mission.v1Journey.revision < 0
    || !compact(mission.v1Journey.activeRunId)
    || !Array.isArray(mission.v1History);
  if (missionInvalid) {
    throw stateError(
      'DIRECTIVE_V1_STATE_MISSION_INVALID',
      'Directive V1 campaign state requires exact mission state and journey authority.'
    );
  }
  const storyValidation = validateStorySettlement(state.storySettlement);
  if (state.storySettlement?.kind !== STORY_SETTLEMENT_KIND
    || !storyValidation.ok
    || compact(state.storySettlement.branchId) !== missionBranchId) {
    throw stateError(
      'DIRECTIVE_V1_STATE_STORY_SETTLEMENT_INVALID',
      'Directive V1 campaign state requires exact story settlement authority.',
      { errors: storyValidation.errors }
    );
  }
  const boundSaveId = compact(state.campaignChatBinding?.saveId);
  if (boundSaveId && boundSaveId !== missionBranchId) {
    throw stateError(
      'DIRECTIVE_V1_STATE_BRANCH_MISMATCH',
      'Directive V1 campaign, mission, and story branches must match.'
    );
  }
  const commandBearing = validateV1CommandBearing(state.commandBearing);
  if (!commandBearing.ok) {
    throw stateError(
      'DIRECTIVE_V1_STATE_COMMAND_BEARING_INVALID',
      `Directive V1 campaign state contains invalid Command Bearing: ${commandBearing.errors.join('; ')}`,
      { errors: commandBearing.errors }
    );
  }
  const settingKeys = Object.keys(state.settings || {});
  if (settingKeys.length !== 2
    || !settingKeys.includes('simulationMode')
    || !settingKeys.includes('allowedSimulationModes')
    || !Array.isArray(state.settings.allowedSimulationModes)
    || !state.settings.allowedSimulationModes.includes(state.settings.simulationMode)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_SETTINGS_INVALID',
      'Directive V1 campaign settings must contain only its selected and allowed simulation modes.'
    );
  }
  return state;
}

export function isV1CampaignState(state) {
  try {
    assertV1CampaignState(state);
    return true;
  } catch {
    return false;
  }
}
