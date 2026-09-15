import {
  assertV1CampaignState,
  V1_MUTABLE_STATE_DOMAINS,
  V1_STATE_CUSTODY_RECENT_COMMIT_LIMIT
} from './v1-campaign-state.mjs';

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const MAX_OPERATIONS = 16;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// Application evidence is JSON data, never a service or a live caller object.
// Reject unsupported data instead of invoking getters/toJSON or erasing evidence.
function frozenApplicationData(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const array = Array.isArray(value);
  if (!value || typeof value !== 'object'
    || !(array ? Object.getPrototypeOf(value) === Array.prototype
      : [Object.prototype, null].includes(Object.getPrototypeOf(value))) || ancestors.has(value)) {
    throw gatewayError('DIRECTIVE_V1_STATE_APPLICATION_DATA_INVALID', 'State application evidence must contain only JSON data.');
  }
  ancestors.add(value);
  const copy = array ? [] : {};
  const keys = Reflect.ownKeys(value);
  if (array && keys.length !== value.length + 1) {
    throw gatewayError('DIRECTIVE_V1_STATE_APPLICATION_DATA_INVALID', 'State application arrays must be contiguous.');
  }
  let index = 0;
  for (const key of keys) {
    if (array && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
      || (array && key !== String(index++))) {
      throw gatewayError('DIRECTIVE_V1_STATE_APPLICATION_DATA_INVALID', 'State application evidence contains an unsupported property.');
    }
    Object.defineProperty(copy, key, { value: frozenApplicationData(descriptor.value, ancestors), enumerable: true });
  }
  ancestors.delete(value);
  return Object.freeze(copy);
}

function createApplicationContext(before, after, descriptor, options, id, domains) {
  const data = { id, baseRevision: before.stateCustody.revision, domains };
  for (const key of ['source', 'reason', 'metadata', 'persist']) {
    const property = Object.getOwnPropertyDescriptor(descriptor, key);
    if (!property) continue;
    if (!Object.hasOwn(property, 'value')) {
      throw gatewayError('DIRECTIVE_V1_STATE_APPLICATION_DATA_INVALID', 'State application descriptor contains an accessor.');
    }
    if (property.value !== undefined) data[key] = property.value;
  }
  return frozenApplicationData({ kind: 'directive.stateApplicationContext.v1', version: 1,
    proposalId: id, domains, before, after, descriptor: data,
    acceptedPairSourcePrecondition: options?.acceptedPairSourcePrecondition ?? null });
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compact(value) {
  return String(value ?? '').trim();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of stableJson(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function gatewayError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function normalizeDomains(domains) {
  const values = [...new Set((Array.isArray(domains) ? domains : []).map(compact).filter(Boolean))];
  if (!values.length) {
    throw gatewayError('DIRECTIVE_V1_STATE_DOMAINS_REQUIRED', 'A V1 state proposal must declare its mutable domains.');
  }
  for (const domain of values) {
    if (!V1_MUTABLE_STATE_DOMAINS.includes(domain)) {
      throw gatewayError(
        'DIRECTIVE_V1_STATE_DOMAIN_FORBIDDEN',
        `Directive V1 does not permit mutation of "${domain}".`,
        { domain, allowedDomains: V1_MUTABLE_STATE_DOMAINS }
      );
    }
  }
  return values;
}

function normalizePath(path) {
  const parts = Array.isArray(path) ? path : String(path || '').split('.');
  const normalized = parts.map(compact).filter(Boolean);
  if (!normalized.length || normalized.some((part) => FORBIDDEN_KEYS.has(part))) {
    throw gatewayError('DIRECTIVE_V1_STATE_PATH_FORBIDDEN', 'The V1 state operation path is invalid.');
  }
  return normalized;
}

function deepMerge(base, patch) {
  if (!isObject(patch)) return cloneJson(patch);
  const next = isObject(base) ? cloneJson(base) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw gatewayError('DIRECTIVE_V1_STATE_PATH_FORBIDDEN', `The V1 state patch key "${key}" is forbidden.`);
    }
    if (value === undefined) continue;
    next[key] = isObject(value) && isObject(next[key])
      ? deepMerge(next[key], value)
      : cloneJson(value);
  }
  return next;
}

function setPath(target, path, value) {
  const parts = normalizePath(path);
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    if (!isObject(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = cloneJson(value);
}

function changedRoots(before, after) {
  const roots = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...roots].filter((root) => stableJson(before?.[root]) !== stableJson(after?.[root]));
}

function ensureAuthorizedChanges(before, after, domains) {
  const authorized = new Set(domains.map((domain) => domain === 'playerPortrait' ? 'player' : domain));
  const changed = changedRoots(before, after).filter((root) => root !== 'stateCustody');
  if (changed.includes('player') && domains.includes('playerPortrait')) {
    const beforeIdentity = cloneJson(before.player);
    const afterIdentity = cloneJson(after.player);
    delete beforeIdentity.portrait;
    delete afterIdentity.portrait;
    if (stableJson(beforeIdentity) !== stableJson(afterIdentity)) {
      throw gatewayError(
        'DIRECTIVE_V1_STATE_PATH_FORBIDDEN',
        'The playerPortrait domain may mutate only player.portrait.'
      );
    }
  }
  const forbidden = changed.filter((root) => !authorized.has(root));
  if (forbidden.length) {
    throw gatewayError(
      'DIRECTIVE_V1_STATE_UNDECLARED_MUTATION',
      `The V1 proposal changed undeclared root "${forbidden[0]}".`,
      { changedRoots: changed, domains }
    );
  }
  return changed;
}

function proposalId(proposal, domains) {
  const explicit = compact(proposal?.id || proposal?.metadata?.proposalId);
  if (explicit) return explicit.slice(0, 180);
  return `v1-state.${stableHash({
    baseRevision: proposal?.baseRevision,
    domains,
    patch: proposal?.patch,
    operations: proposal?.operations,
    source: proposal?.source
  })}`;
}

function withCustodyCommit(state, id) {
  const next = cloneJson(state);
  const current = next.stateCustody;
  next.stateCustody = {
    ...current,
    revision: current.revision + 1,
    recentCommitIds: [...current.recentCommitIds, id]
      .slice(-V1_STATE_CUSTODY_RECENT_COMMIT_LIMIT)
  };
  return next;
}

function alreadyCommitted(state, id) {
  return state.stateCustody.recentCommitIds.includes(id);
}

function assertRevision(state, baseRevision) {
  if (baseRevision === null || baseRevision === undefined) return;
  const requested = Number(baseRevision);
  const current = state.stateCustody.revision;
  if (!Number.isInteger(requested) || requested !== current) {
    throw gatewayError(
      'DIRECTIVE_V1_STATE_REVISION_CONFLICT',
      `V1 state revision ${requested} is stale; current revision is ${current}.`,
      { requestedRevision: requested, currentRevision: current }
    );
  }
}

function applyOperations(state, operations, domains) {
  if (!Array.isArray(operations) || !operations.length || operations.length > MAX_OPERATIONS) {
    throw gatewayError(
      'DIRECTIVE_V1_STATE_OPERATION_LIMIT',
      `A V1 state proposal must contain 1 through ${MAX_OPERATIONS} operations.`
    );
  }
  const allowed = new Set(domains);
  const next = cloneJson(state);
  for (const operation of operations) {
    if (operation?.op !== 'set') {
      throw gatewayError('DIRECTIVE_V1_STATE_OPERATION_FORBIDDEN', 'Directive V1 state operations support only exact set operations.');
    }
    const path = normalizePath(operation.path);
    if (!allowed.has(path[0]) && !(allowed.has('playerPortrait') && path[0] === 'player')) {
      throw gatewayError(
        'DIRECTIVE_V1_STATE_DOMAIN_FORBIDDEN',
        `The V1 operation is not authorized to mutate "${path[0]}".`
      );
    }
    setPath(next, path, operation.value);
  }
  return next;
}

function applyPatch(state, patch, domains) {
  if (!isObject(patch)) {
    throw gatewayError('DIRECTIVE_V1_STATE_PATCH_REQUIRED', 'A V1 state patch must be an object.');
  }
  const allowed = new Set(domains);
  for (const root of Object.keys(patch)) {
    if (!allowed.has(root)) {
      throw gatewayError(
        'DIRECTIVE_V1_STATE_DOMAIN_FORBIDDEN',
        `The V1 patch is not authorized to mutate "${root}".`
      );
    }
  }
  return deepMerge(state, patch);
}

export function createStateDeltaGateway({
  getState,
  setState,
  persist = null,
  beforeCommit = null,
} = {}) {
  if (typeof getState !== 'function') throw new TypeError('getState must be a function');
  if (typeof setState !== 'function') throw new TypeError('setState must be a function');
  if (beforeCommit !== null && typeof beforeCommit !== 'function') {
    throw new TypeError('beforeCommit must be a function');
  }

  function currentState() {
    const state = getState();
    assertV1CampaignState(state);
    return state;
  }

  async function persistCommit(before, after, descriptor, options = {}, id, domains) {
    if (beforeCommit) {
      const result = beforeCommit({ before, after, descriptor, options });
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).catch(() => {});
        throw gatewayError(
          'DIRECTIVE_V1_STATE_PRECONDITION_ASYNC',
          'A V1 state precondition must complete synchronously.'
        );
      }
    }
    const applicationContext = createApplicationContext(before, after, descriptor, options, id, domains);
    setState(after);
    if (typeof persist !== 'function' || descriptor?.persist === false) return;
    try {
      await persist(after, descriptor, { ...options, applicationContext });
      if (stableJson(getState()) !== stableJson(after)) {
        throw gatewayError('DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT',
          'V1 state persistence completed after state ownership changed.');
      }
    } catch (cause) {
      if (cause?.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_UNCERTAIN') throw cause;
      const current = getState();
      if (stableJson(current) === stableJson(after)) {
        setState(before);
        throw gatewayError(
          'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED',
          'V1 state persistence failed; the in-memory commit was rolled back.',
          { cause: cause?.message || String(cause) }
        );
      }
      throw gatewayError(
        'DIRECTIVE_V1_STATE_PERSISTENCE_CONFLICT',
        'V1 state persistence failed after a newer state commit; rollback was refused.',
        { cause: cause?.message || String(cause) }
      );
    }
  }

  async function applyProposal(proposal = {}, options = {}) {
    const before = cloneJson(currentState());
    const domains = normalizeDomains(proposal.domains);
    const id = proposalId(proposal, domains);
    if (alreadyCommitted(before, id)) {
      return {
        campaignState: before,
        noChange: true,
        reasonCode: 'already-committed',
        domains: []
      };
    }
    assertRevision(before, proposal.baseRevision);
    const candidate = Array.isArray(proposal.operations)
      ? applyOperations(before, proposal.operations, domains)
      : applyPatch(before, proposal.patch, domains);
    const changed = ensureAuthorizedChanges(before, candidate, domains);
    if (!changed.length) {
      return { campaignState: before, noChange: true, reasonCode: 'no-change', domains: [] };
    }
    const after = withCustodyCommit(candidate, id);
    assertV1CampaignState(after);
    await persistCommit(before, after, proposal, options, id, domains);
    return {
      campaignState: cloneJson(after),
      noChange: false,
      reasonCode: null,
      domains: changed
    };
  }

  async function commit(nextCampaignState, delta = {}, options = {}) {
    const before = cloneJson(currentState());
    const domains = normalizeDomains(delta.domains);
    const id = proposalId(delta, domains);
    if (alreadyCommitted(before, id)) return before;
    assertRevision(before, delta.baseRevision);
    const candidate = cloneJson(nextCampaignState);
    assertV1CampaignState(candidate);
    const changed = ensureAuthorizedChanges(before, candidate, domains);
    if (!changed.length) return before;
    const after = withCustodyCommit(candidate, id);
    assertV1CampaignState(after);
    await persistCommit(before, after, { ...delta, persist: options.persist ?? delta.persist }, options, id, domains);
    return cloneJson(after);
  }

  return {
    commit,
    applyProposal,
    revision: () => currentState().stateCustody.revision
  };
}

export const __stateDeltaGatewayTestHooks = Object.freeze({
  normalizePath,
  deepMerge,
  changedRoots,
  stableHash
});
