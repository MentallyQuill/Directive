/**
 * Independent Utility and Reasoning provider lanes.
 *
 * Directive owns the schemas, storage, role mapping, and request client.
 * Third-party design references are documented in THIRD_PARTY_NOTICES.md.
 */
import { createGenerationRoleRegistry } from '../generation/generation-roles.mjs';

const PROVIDER_TYPES = Object.freeze(['st', 'profile', 'openai_compatible']);
const PROVIDER_KINDS = Object.freeze(['utility', 'reasoning']);

const DEFAULT_PROVIDER = Object.freeze({
  provider: 'st',
  profileId: '',
  baseUrl: '',
  model: '',
  apiKeySet: false,
  temperature: 0.2,
  topP: 0.95,
  maxTokens: 8192
});

export const DEFAULT_DIRECTIVE_PROVIDER_SETTINGS = Object.freeze({
  utility: Object.freeze({
    ...DEFAULT_PROVIDER,
    temperature: 0.1,
    maxTokens: 8192
  }),
  reasoning: Object.freeze({
    ...DEFAULT_PROVIDER,
    temperature: 0.7,
    maxTokens: 8192
  })
});

const DEFAULT_GENERATION_ROLE_REGISTRY = createGenerationRoleRegistry();
const DEFAULT_ROLE_PROVIDER_KINDS = Object.freeze(Object.fromEntries(
  DEFAULT_GENERATION_ROLE_REGISTRY.list().map((role) => [role.id, role.providerKind])
));

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeProviderType(value) {
  const provider = String(value || 'st').trim().toLowerCase();
  return PROVIDER_TYPES.includes(provider) ? provider : 'st';
}

function normalizeProviderKind(value, fallback = 'utility') {
  const kind = String(value || fallback).trim().toLowerCase();
  return PROVIDER_KINDS.includes(kind) ? kind : fallback;
}

function roleProviderKindsFromSettings(settings = {}) {
  const source = isObject(settings) ? settings : {};
  return isObject(source.roleProviderKinds) ? source.roleProviderKinds : {};
}

function normalizeRoleProviderKinds(value = {}) {
  const source = isObject(value) ? value : {};
  const normalized = {};
  for (const role of DEFAULT_GENERATION_ROLE_REGISTRY.list()) {
    if (!Object.prototype.hasOwnProperty.call(source, role.id)) continue;
    normalized[role.id] = normalizeProviderKind(source[role.id], role.providerKind);
  }
  return normalized;
}

export function providerKindForRole(roleId, settings = null) {
  const role = DEFAULT_GENERATION_ROLE_REGISTRY.get(roleId);
  const overrides = roleProviderKindsFromSettings(settings);
  return Object.prototype.hasOwnProperty.call(overrides, role.id)
    ? normalizeProviderKind(overrides[role.id], role.providerKind)
    : role.providerKind;
}

export function listProviderRoleRouting(settings = null) {
  const overrides = normalizeRoleProviderKinds(roleProviderKindsFromSettings(settings));
  return DEFAULT_GENERATION_ROLE_REGISTRY.list().map((role) => ({
    roleId: role.id,
    label: role.label,
    defaultProviderKind: role.providerKind,
    providerKind: overrides[role.id] || role.providerKind,
    overridden: Boolean(overrides[role.id] && overrides[role.id] !== role.providerKind),
    blocking: role.blocking === true,
    output: role.output,
    structuredOutput: role.structuredOutput === true,
    mayProposeState: role.mayProposeState === true,
    mayInjectPrompt: role.mayInjectPrompt === true,
    mayRunDuringMainGeneration: role.mayRunDuringMainGeneration === true,
    fallback: role.fallback || null
  }));
}

export function normalizeDirectiveProviderSettings(settings = {}) {
  const source = isObject(settings) ? settings : {};
  const normalized = {};
  for (const kind of PROVIDER_KINDS) {
    const defaults = DEFAULT_DIRECTIVE_PROVIDER_SETTINGS[kind];
    const value = isObject(source[kind]) ? source[kind] : {};
    normalized[kind] = {
      provider: normalizeProviderType(value.provider ?? defaults.provider),
      profileId: String(value.profileId ?? defaults.profileId).trim(),
      baseUrl: String(value.baseUrl ?? defaults.baseUrl).trim(),
      model: String(value.model ?? defaults.model).trim(),
      apiKeySet: value.apiKeySet === true,
      temperature: finiteNumber(value.temperature, defaults.temperature, { min: 0, max: 2 }),
      topP: finiteNumber(value.topP, defaults.topP, { min: 0, max: 1 }),
      maxTokens: Math.round(finiteNumber(value.maxTokens, defaults.maxTokens, { min: 64, max: 131072 }))
    };
  }
  normalized.roleProviderKinds = normalizeRoleProviderKinds(source.roleProviderKinds);
  return normalized;
}

export function validateDirectiveProviderSettings(settings, kind = null) {
  const normalized = normalizeDirectiveProviderSettings(settings);
  const kinds = kind ? [String(kind)] : PROVIDER_KINDS;
  const diagnostics = [];
  for (const providerKind of kinds) {
    if (!PROVIDER_KINDS.includes(providerKind)) {
      throw new Error(`Unknown Directive provider kind "${providerKind}"`);
    }
    const config = normalized[providerKind];
    if (config.provider === 'profile' && !config.profileId) {
      diagnostics.push({ kind: providerKind, severity: 'error', code: 'profile-required', message: `${providerKind} connection profile is not selected.` });
    }
    if (config.provider === 'openai_compatible') {
      if (!config.baseUrl) diagnostics.push({ kind: providerKind, severity: 'error', code: 'base-url-required', message: `${providerKind} OpenAI-compatible base URL is required.` });
      if (!config.model) diagnostics.push({ kind: providerKind, severity: 'error', code: 'model-required', message: `${providerKind} OpenAI-compatible model is required.` });
    }
  }
  return {
    ok: diagnostics.every((entry) => entry.severity !== 'error'),
    settings: normalized,
    diagnostics
  };
}

function resolveExtensionSettings(context) {
  if (isObject(context?.extensionSettings)) return context.extensionSettings;
  if (isObject(context?.extension_settings)) return context.extension_settings;
  if (isObject(globalThis.extension_settings)) return globalThis.extension_settings;
  return null;
}

function sessionStorageKey(kind) {
  return `directive.provider-key.${kind}.v1`;
}

export function createDirectiveProviderSecretStore({ sessionStorage = globalThis.sessionStorage } = {}) {
  const memory = new Map();
  return {
    get(kind) {
      const id = String(kind || '');
      if (memory.has(id)) return memory.get(id);
      try {
        return sessionStorage?.getItem?.(sessionStorageKey(id)) || '';
      } catch {
        return '';
      }
    },
    set(kind, value) {
      const id = String(kind || '');
      const secret = String(value || '');
      if (secret) memory.set(id, secret);
      else memory.delete(id);
      try {
        if (secret) sessionStorage?.setItem?.(sessionStorageKey(id), secret);
        else sessionStorage?.removeItem?.(sessionStorageKey(id));
      } catch {
        // Session-only in-memory storage remains available.
      }
      return Boolean(secret);
    },
    clear(kind) {
      return this.set(kind, '');
    }
  };
}

export function createSillyTavernProviderSettingsStore({
  context,
  extensionKey = 'directive',
  secretStore = createDirectiveProviderSecretStore()
} = {}) {
  const root = resolveExtensionSettings(context) || {};
  if (!isObject(root[extensionKey])) root[extensionKey] = {};
  const extensionState = root[extensionKey];
  if (!isObject(extensionState.providers)) {
    extensionState.providers = normalizeDirectiveProviderSettings({});
  } else {
    extensionState.providers = normalizeDirectiveProviderSettings(extensionState.providers);
  }

  function saveDebounced() {
    const save = context?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
    if (typeof save === 'function') save();
  }

  return {
    getAll() {
      const providers = normalizeDirectiveProviderSettings(extensionState.providers);
      for (const kind of PROVIDER_KINDS) {
        providers[kind].apiKeySet = Boolean(secretStore.get(kind));
      }
      return cloneJson(providers);
    },
    getRoleProviderKinds() {
      return cloneJson(this.getAll().roleProviderKinds || {});
    },
    getRoleProviderKind(roleId) {
      return providerKindForRole(roleId, this.getAll());
    },
    listRoleRouting() {
      return listProviderRoleRouting(this.getAll());
    },
    get(kind) {
      const id = String(kind || '');
      if (!PROVIDER_KINDS.includes(id)) throw new Error(`Unknown Directive provider kind "${id}"`);
      return this.getAll()[id];
    },
    update(kind, patch = {}) {
      const id = String(kind || '');
      if (!PROVIDER_KINDS.includes(id)) throw new Error(`Unknown Directive provider kind "${id}"`);
      const next = normalizeDirectiveProviderSettings({
        ...extensionState.providers,
        [id]: {
          ...extensionState.providers[id],
          ...(isObject(patch) ? patch : {})
        }
      });
      extensionState.providers = next;
      if (Object.prototype.hasOwnProperty.call(patch, 'apiKey')) {
        secretStore.set(id, patch.apiKey);
        extensionState.providers[id].apiKeySet = Boolean(secretStore.get(id));
      }
      saveDebounced();
      return this.get(id);
    },
    updateRoleProviderKind(roleId, providerKind) {
      const role = DEFAULT_GENERATION_ROLE_REGISTRY.get(roleId);
      const kind = normalizeProviderKind(providerKind, role.providerKind);
      const current = normalizeDirectiveProviderSettings(extensionState.providers);
      const nextRoleProviderKinds = { ...(current.roleProviderKinds || {}) };
      if (kind === role.providerKind) delete nextRoleProviderKinds[role.id];
      else nextRoleProviderKinds[role.id] = kind;
      extensionState.providers = {
        ...current,
        roleProviderKinds: nextRoleProviderKinds
      };
      saveDebounced();
      return listProviderRoleRouting(extensionState.providers).find((entry) => entry.roleId === role.id);
    },
    resetRoleProviderKind(roleId) {
      const role = DEFAULT_GENERATION_ROLE_REGISTRY.get(roleId);
      const current = normalizeDirectiveProviderSettings(extensionState.providers);
      const next = { ...(current.roleProviderKinds || {}) };
      delete next[role.id];
      extensionState.providers = {
        ...current,
        roleProviderKinds: next
      };
      saveDebounced();
      return listProviderRoleRouting(extensionState.providers).find((entry) => entry.roleId === role.id);
    },
    getApiKey(kind) {
      return secretStore.get(String(kind || ''));
    },
    clearApiKey(kind) {
      secretStore.clear(String(kind || ''));
      const id = String(kind || '');
      if (extensionState.providers[id]) extensionState.providers[id].apiKeySet = false;
      saveDebounced();
    },
    validate(kind = null) {
      return validateDirectiveProviderSettings(this.getAll(), kind);
    }
  };
}

export const DIRECTIVE_PROVIDER_TYPES = PROVIDER_TYPES;
export const DIRECTIVE_PROVIDER_KINDS = PROVIDER_KINDS;
export const DEFAULT_DIRECTIVE_ROLE_PROVIDER_KINDS = DEFAULT_ROLE_PROVIDER_KINDS;
