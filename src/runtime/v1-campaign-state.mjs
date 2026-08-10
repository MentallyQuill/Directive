import {
  V1_RUNTIME_ARCHITECTURE_CONTRACT_VERSION,
  V1_RUNTIME_ARCHITECTURE_KIND,
  V1_SEMANTIC_AUTHORITY
} from './v1-semantic-authority.mjs';

export const V1_STATE_CUSTODY_KIND = 'directive.stateCustody.v1';
export const V1_STATE_CUSTODY_RECENT_COMMIT_LIMIT = 64;

export const V1_CAMPAIGN_STATE_ROOTS = Object.freeze([
  'campaign',
  'activeCampaignPackage',
  'player',
  'crew',
  'ship',
  'mission',
  'storySettlement',
  'commandBearing',
  'values',
  'turnLedger',
  'ui',
  'settings',
  'captainState',
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
  'turnLedger',
  'campaignChatBinding',
  'settings'
]);

const REQUIRED_ROOTS = Object.freeze([
  'campaign',
  'activeCampaignPackage',
  'player',
  'crew',
  'ship',
  'mission',
  'commandBearing',
  'values',
  'turnLedger',
  'ui',
  'settings',
  'captainState',
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
