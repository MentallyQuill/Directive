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
import {
  DIRECTIVE_STORAGE_IMAGE_EXTENSIONS,
  validateDirectiveUserFilesPath
} from '../storage/directive-storage-filenames.mjs';

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
  'playerPortrait',
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

function requiredText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function onlyKeys(value, allowed) {
  return isObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

const CAMPAIGN_KEYS = new Set([
  'id', 'title', 'status', 'createdAt', 'startedAt', 'characterCreatorDraftId',
  'packageTitle', 'openingStardate', 'currentStardate', 'openingMinuteOfDay',
  'runtimeArchitecture'
]);
const ACTIVE_PACKAGE_KEYS = new Set(['packageId', 'packageVersion']);

function validateV1Campaign(campaign) {
  return onlyKeys(campaign, CAMPAIGN_KEYS)
    && ['id', 'title', 'createdAt', 'startedAt', 'packageTitle'].every((key) => requiredText(campaign[key]))
    && ['activating', 'active', 'concluded'].includes(campaign.status)
    && (campaign.characterCreatorDraftId === null || requiredText(campaign.characterCreatorDraftId))
    && Number.isFinite(campaign.openingStardate)
    && Number.isFinite(campaign.currentStardate)
    && Number.isInteger(campaign.openingMinuteOfDay)
    && campaign.openingMinuteOfDay >= 0
    && campaign.openingMinuteOfDay < 1440;
}

const PLAYER_KEYS = new Set([
  'id', 'creationStatus', 'name', 'pronounsOrAddress', 'rank', 'billet', 'role', 'roleMode',
  'shipId', 'shipName', 'species', 'ageBand', 'appearance', 'firstImpression', 'service',
  'personality', 'dossier', 'personalValues', 'creatorAcceptedAt', 'adjudicationProfile', 'portrait'
]);

function validPlayerPortrait(portrait) {
  if (portrait === null || portrait === undefined) return true;
  return portrait.kind === 'directive.playerPortrait'
    && isObject(portrait.asset)
    && validateDirectiveUserFilesPath(portrait.asset.path, {
      allowedExtensions: DIRECTIVE_STORAGE_IMAGE_EXTENSIONS
    }).ok;
}

function validateV1Player(player) {
  return onlyKeys(player, PLAYER_KEYS)
    && player.creationStatus === 'complete'
    && ['id', 'name', 'pronounsOrAddress', 'rank', 'billet', 'role', 'roleMode', 'shipId', 'shipName', 'appearance', 'creatorAcceptedAt']
      .every((key) => requiredText(player[key]))
    && isObject(player.species)
    && requiredText(player.species.id)
    && requiredText(player.species.label)
    && isObject(player.ageBand)
    && requiredText(player.ageBand.id)
    && requiredText(player.ageBand.label)
    && typeof player.firstImpression === 'string'
    && isObject(player.service)
    && isObject(player.personality)
    && isObject(player.dossier)
    && Array.isArray(player.personalValues)
    && isObject(player.adjudicationProfile)
    && validPlayerPortrait(player.portrait);
}

const SHIP_KEYS = new Set(['id', 'name', 'class', 'registry', 'operationalOverview']);
const SHIP_OVERVIEW_KEYS = new Set(['kind', 'status', 'summary', 'materialLimitations', 'history']);

function validateV1Ship(ship) {
  const overview = ship?.operationalOverview;
  return onlyKeys(ship, SHIP_KEYS)
    && ['id', 'name', 'class', 'registry'].every((key) => requiredText(ship[key]))
    && onlyKeys(overview, SHIP_OVERVIEW_KEYS)
    && overview.kind === 'directive.shipOperationalOverview.v1'
    && requiredText(overview.status)
    && typeof overview.summary === 'string'
    && Array.isArray(overview.materialLimitations)
    && Array.isArray(overview.history);
}

const WORLD_KEYS = new Set([
  'kind', 'version', 'regionId', 'currentLocationId', 'currentStardate',
  'openingMinuteOfDay', 'elapsedSeconds', 'elapsedMinutes', 'visitedLocationIds'
]);

function nullableText(value) {
  return value === null || requiredText(value);
}

function validateV1WorldState(world) {
  return onlyKeys(world, WORLD_KEYS)
    && world.kind === 'directive.worldState.v1'
    && world.version === 1
    && nullableText(world.regionId)
    && nullableText(world.currentLocationId)
    && Number.isFinite(world.currentStardate)
    && Number.isInteger(world.openingMinuteOfDay)
    && world.openingMinuteOfDay >= 0
    && world.openingMinuteOfDay < 1440
    && Number.isInteger(world.elapsedMinutes)
    && world.elapsedMinutes >= 0
    && (!Object.hasOwn(world, 'elapsedSeconds')
      || (Number.isInteger(world.elapsedSeconds)
        && world.elapsedSeconds >= 0
        && Math.floor(world.elapsedSeconds / 60) === world.elapsedMinutes))
    && Array.isArray(world.visitedLocationIds)
    && world.visitedLocationIds.every(requiredText);
}

const TIME_LEDGER_KEYS = new Set([
  'kind', 'version', 'openingMinuteOfDay', 'elapsedSeconds', 'elapsedMinutes', 'stardate',
  'shipClock', 'entries', 'decisions', 'prunedElapsedSeconds', 'lastBoundary', 'updatedAt'
]);

const TIME_DECISION_KEYS = new Set([
  'id', 'kind', 'decision', 'elapsedSeconds', 'reason', 'confidence', 'source',
  'boundaryId', 'sourceAnchorRange', 'evidenceMessageIds', 'committedAt'
]);

function validTimeBoundary(boundary) {
  const legacyMinutes = !Object.hasOwn(boundary || {}, 'elapsedSeconds')
    && Number.isInteger(boundary?.elapsedMinutes)
    && boundary.elapsedMinutes >= 0;
  const secondsBoundary = Number.isInteger(boundary?.elapsedSeconds)
    && boundary.elapsedSeconds >= 0
    && Number.isFinite(boundary.elapsedMinutes)
    && boundary.elapsedMinutes >= 0
    && Math.abs(boundary.elapsedMinutes - (boundary.elapsedSeconds / 60)) < Number.EPSILON;
  return isObject(boundary)
    && boundary.kind === 'directive.timeBoundary.v1'
    && requiredText(boundary.id)
    && (legacyMinutes || secondsBoundary);
}

function validTimeDecision(decision) {
  return isObject(decision)
    && onlyKeys(decision, TIME_DECISION_KEYS)
    && decision.kind === 'directive.timeDecision.v1'
    && requiredText(decision.id)
    && ['advance', 'unchanged', 'indeterminate'].includes(decision.decision)
    && Number.isInteger(decision.elapsedSeconds)
    && decision.elapsedSeconds >= 0
    && (decision.decision === 'advance' ? decision.elapsedSeconds > 0 : decision.elapsedSeconds === 0)
    && requiredText(decision.reason)
    && (decision.confidence === null
      || (Number.isFinite(decision.confidence) && decision.confidence >= 0 && decision.confidence <= 1))
    && requiredText(decision.source)
    && (decision.boundaryId === null || requiredText(decision.boundaryId))
    && isObject(decision.sourceAnchorRange)
    && Array.isArray(decision.evidenceMessageIds)
    && requiredText(decision.committedAt);
}

function validateV1TimeLedger(ledger) {
  return onlyKeys(ledger, TIME_LEDGER_KEYS)
    && ledger.kind === 'directive.timeLedger.v1'
    && ledger.version === 1
    && Number.isInteger(ledger.openingMinuteOfDay)
    && ledger.openingMinuteOfDay >= 0
    && ledger.openingMinuteOfDay < 1440
    && Number.isInteger(ledger.elapsedMinutes)
    && ledger.elapsedMinutes >= 0
    && (!Object.hasOwn(ledger, 'elapsedSeconds')
      || (Number.isInteger(ledger.elapsedSeconds)
        && ledger.elapsedSeconds >= 0
        && Math.floor(ledger.elapsedSeconds / 60) === ledger.elapsedMinutes))
    && (!Object.hasOwn(ledger, 'prunedElapsedSeconds')
      || (Number.isInteger(ledger.prunedElapsedSeconds) && ledger.prunedElapsedSeconds >= 0))
    && Number.isFinite(ledger.stardate)
    && isObject(ledger.shipClock)
    && Number.isInteger(ledger.shipClock.minuteOfDay)
    && ledger.shipClock.minuteOfDay >= 0
    && ledger.shipClock.minuteOfDay < 1440
    && (!Object.hasOwn(ledger.shipClock, 'secondOfDay')
      || (Number.isInteger(ledger.shipClock.secondOfDay)
        && ledger.shipClock.secondOfDay >= 0
        && ledger.shipClock.secondOfDay < 86400
        && Math.floor(ledger.shipClock.secondOfDay / 60) === ledger.shipClock.minuteOfDay))
    && requiredText(ledger.shipClock.display)
    && Array.isArray(ledger.entries)
    && ledger.entries.every(validTimeBoundary)
    && (!Object.hasOwn(ledger, 'decisions')
      || (Array.isArray(ledger.decisions) && ledger.decisions.every(validTimeDecision)))
    && (!Object.hasOwn(ledger, 'lastBoundary')
      || ledger.lastBoundary === null
      || validTimeBoundary(ledger.lastBoundary))
    && requiredText(ledger.updatedAt);
}

function validateCampaignChatBinding(binding, campaignState, missionBranchId) {
  if (binding === null || binding === undefined) return true;
  return isObject(binding)
    && binding.kind === 'directive.campaignChatBinding.v1'
    && binding.version === 1
    && requiredText(binding.campaignId)
    && binding.campaignId === campaignState?.campaign?.id
    && requiredText(binding.saveId)
    && binding.saveId === missionBranchId
    && (binding.chatId === null || requiredText(binding.chatId))
    && ['bound', 'unbound'].includes(binding.status)
    && (binding.status !== 'bound' || requiredText(binding.chatId));
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
  if (!validateV1Campaign(state.campaign)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_CAMPAIGN_INVALID',
      'Directive V1 campaign state requires exact campaign identity and chronology.'
    );
  }
  const stamp = state.campaign?.runtimeArchitecture;
  if (!isObject(stamp)
    || stamp.kind !== V1_RUNTIME_ARCHITECTURE_KIND
    || stamp.contractVersion !== V1_RUNTIME_ARCHITECTURE_CONTRACT_VERSION
    || stamp.semanticAuthority !== V1_SEMANTIC_AUTHORITY
    || stamp.createdForNewSave !== true
    || !requiredText(stamp.packageId)
    || !requiredText(stamp.packageVersion)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_ARCHITECTURE_REQUIRED',
      'Directive V1 rejects campaign state without its exact V1 architecture stamp.'
    );
  }
  if (!onlyKeys(state.activeCampaignPackage, ACTIVE_PACKAGE_KEYS)
    || !requiredText(state.activeCampaignPackage.packageId)
    || !requiredText(state.activeCampaignPackage.packageVersion)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_PACKAGE_INVALID',
      'Directive V1 campaign state requires one exact active package binding.'
    );
  }
  if (compact(state.activeCampaignPackage?.packageId) !== compact(stamp.packageId)
    || compact(state.activeCampaignPackage?.packageVersion) !== compact(stamp.packageVersion)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_PACKAGE_MISMATCH',
      'Directive V1 campaign state package binding does not match its architecture stamp.'
    );
  }
  if (!validateV1Player(state.player)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_PLAYER_INVALID',
      'Directive V1 campaign state requires one exact accepted player record.'
    );
  }
  if (!validateV1Ship(state.ship)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_SHIP_INVALID',
      'Directive V1 campaign state requires one exact immutable ship record.'
    );
  }
  if (!validateV1WorldState(state.worldState)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_WORLD_INVALID',
      'Directive V1 campaign state requires exact world-state custody.'
    );
  }
  if (!validateV1TimeLedger(state.timeLedger)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_TIME_INVALID',
      'Directive V1 campaign state requires exact accepted-time custody.'
    );
  }
  const hasWorldSeconds = Object.hasOwn(state.worldState, 'elapsedSeconds');
  const hasLedgerSeconds = Object.hasOwn(state.timeLedger, 'elapsedSeconds');
  const elapsedSeconds = hasLedgerSeconds
    ? state.timeLedger.elapsedSeconds
    : state.timeLedger.elapsedMinutes * 60;
  const expectedShipSecond = ((state.timeLedger.openingMinuteOfDay * 60) + elapsedSeconds) % 86400;
  const expectedShipMinute = Math.floor(expectedShipSecond / 60);
  const timeMismatch = !Number.isFinite(state.campaign?.currentStardate)
    || !Number.isInteger(state.campaign?.openingMinuteOfDay)
    || state.campaign.openingMinuteOfDay !== state.worldState.openingMinuteOfDay
    || state.campaign.openingMinuteOfDay !== state.timeLedger.openingMinuteOfDay
    || state.worldState.elapsedMinutes !== state.timeLedger.elapsedMinutes
    || hasWorldSeconds !== hasLedgerSeconds
    || (hasWorldSeconds && state.worldState.elapsedSeconds !== state.timeLedger.elapsedSeconds)
    || state.campaign.currentStardate !== state.worldState.currentStardate
    || state.campaign.currentStardate !== state.timeLedger.stardate
    || state.timeLedger.shipClock.minuteOfDay !== expectedShipMinute
    || (hasLedgerSeconds && state.timeLedger.shipClock.secondOfDay !== expectedShipSecond);
  if (timeMismatch) {
    throw stateError(
      'DIRECTIVE_V1_STATE_TIME_MISMATCH',
      'Directive V1 campaign, world, and accepted-time custody must agree.'
    );
  }
  if (compact(state.player.shipId) !== compact(state.ship?.id)
    || compact(state.player.shipName) !== compact(state.ship?.name)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_PLAYER_SHIP_MISMATCH',
      'Directive V1 player and ship identity must remain bound to the same vessel.'
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
  if (!validateCampaignChatBinding(state.campaignChatBinding, state, missionBranchId)) {
    throw stateError(
      'DIRECTIVE_V1_STATE_CHAT_BINDING_INVALID',
      'Directive V1 campaign state contains an invalid campaign-chat binding.'
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
