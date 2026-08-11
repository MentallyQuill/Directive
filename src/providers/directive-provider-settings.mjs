/**
 * Independent Utility and Reasoning lanes using SillyTavern-native connections.
 */
import { createGenerationRoleRegistry } from '../generation/generation-roles.mjs';

const PROVIDER_TYPES = Object.freeze(['st', 'profile']);
const PROVIDER_KINDS = Object.freeze(['utility', 'reasoning']);
const PRESET_MODES = new Set(['isolated', 'full-profile']);
const INSTRUCT_MODES = new Set(['auto', 'on', 'off']);
const SAMPLER_MODES = new Set(['profile', 'directive']);
const STRUCTURED_OUTPUT_MODES = new Set(['auto', 'native-schema', 'prompt-json']);
const CERTIFICATION_STATUSES = new Set(['not-run', 'passed', 'failed']);

const DEFAULT_PROVIDER = Object.freeze({
  provider: 'st',
  profileId: '',
  presetMode: 'isolated',
  instructMode: 'auto',
  samplerMode: 'profile',
  structuredOutputMode: 'auto',
  temperature: 0.1,
  topP: 0.95,
  maxTokens: 8192,
  certification: Object.freeze({ status: 'not-run' })
});

export const DEFAULT_DIRECTIVE_PROVIDER_SETTINGS = Object.freeze({
  utility: Object.freeze({ ...DEFAULT_PROVIDER }),
  reasoning: Object.freeze({ ...DEFAULT_PROVIDER, temperature: 0.4 })
});

const DEFAULT_GENERATION_ROLE_REGISTRY = createGenerationRoleRegistry();

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

function enumOr(value, allowed, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function normalizeProviderType(value) {
  const provider = String(value || 'st').trim().toLowerCase();
  return PROVIDER_TYPES.includes(provider) ? provider : 'st';
}

function normalizeCertification(value) {
  if (!isObject(value)) return { status: 'not-run' };
  const status = enumOr(value.status, CERTIFICATION_STATUSES, 'not-run');
  if (status === 'not-run') return { status };
  return {
    status,
    ...(String(value.configHash || '').trim() ? { configHash: String(value.configHash).trim() } : {}),
    ...(String(value.structuredOutput || '').trim() ? { structuredOutput: String(value.structuredOutput).trim() } : {}),
    ...(String(value.testedAt || '').trim() ? { testedAt: String(value.testedAt).trim() } : {})
  };
}

export function providerKindForRole(roleId) {
  return DEFAULT_GENERATION_ROLE_REGISTRY.get(roleId).providerKind;
}

export function normalizeDirectiveProviderSettings(settings = {}) {
  const source = isObject(settings) ? settings : {};
  const normalized = {};
  for (const kind of PROVIDER_KINDS) {
    const defaults = DEFAULT_DIRECTIVE_PROVIDER_SETTINGS[kind];
    const value = isObject(source[kind]) ? source[kind] : {};
    const rawProvider = String(value.provider ?? defaults.provider).trim().toLowerCase();
    const provider = normalizeProviderType(rawProvider);
    normalized[kind] = {
      provider,
      profileId: PROVIDER_TYPES.includes(rawProvider)
        ? String(value.profileId ?? defaults.profileId).trim()
        : '',
      presetMode: enumOr(value.presetMode, PRESET_MODES, defaults.presetMode),
      instructMode: enumOr(value.instructMode, INSTRUCT_MODES, defaults.instructMode),
      samplerMode: enumOr(value.samplerMode, SAMPLER_MODES, defaults.samplerMode),
      structuredOutputMode: enumOr(value.structuredOutputMode, STRUCTURED_OUTPUT_MODES, defaults.structuredOutputMode),
      temperature: finiteNumber(value.temperature, defaults.temperature, { min: 0, max: 2 }),
      topP: finiteNumber(value.topP, defaults.topP, { min: 0, max: 1 }),
      maxTokens: Math.round(finiteNumber(value.maxTokens, defaults.maxTokens, { min: 64, max: 131072 })),
      certification: normalizeCertification(value.certification)
    };
  }
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
      diagnostics.push({
        kind: providerKind,
        severity: 'error',
        code: 'profile-required',
        message: `${providerKind} connection profile is not selected.`
      });
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

export function createSillyTavernProviderSettingsStore({ context, extensionKey = 'directive' } = {}) {
  const root = resolveExtensionSettings(context) || {};
  if (!isObject(root[extensionKey])) root[extensionKey] = {};
  const extensionState = root[extensionKey];
  extensionState.providers = normalizeDirectiveProviderSettings(extensionState.providers);

  function saveDebounced() {
    const save = context?.saveSettingsDebounced || globalThis.saveSettingsDebounced;
    if (typeof save === 'function') save();
  }

  return {
    getAll() {
      return cloneJson(normalizeDirectiveProviderSettings(extensionState.providers));
    },
    getRoleProviderKind(roleId) {
      return providerKindForRole(roleId);
    },
    get(kind) {
      const id = String(kind || '');
      if (!PROVIDER_KINDS.includes(id)) throw new Error(`Unknown Directive provider kind "${id}"`);
      return this.getAll()[id];
    },
    update(kind, patch = {}) {
      const id = String(kind || '');
      if (!PROVIDER_KINDS.includes(id)) throw new Error(`Unknown Directive provider kind "${id}"`);
      const sourcePatch = isObject(patch) ? patch : {};
      const configurationChanged = Object.keys(sourcePatch).some((key) => key !== 'certification');
      const nextValue = {
        ...extensionState.providers[id],
        ...sourcePatch,
        ...(configurationChanged ? { certification: { status: 'not-run' } } : {})
      };
      extensionState.providers = normalizeDirectiveProviderSettings({
        ...extensionState.providers,
        [id]: nextValue
      });
      saveDebounced();
      return this.get(id);
    },
    validate(kind = null) {
      return validateDirectiveProviderSettings(this.getAll(), kind);
    }
  };
}

export const DIRECTIVE_PROVIDER_TYPES = PROVIDER_TYPES;
export const DIRECTIVE_PROVIDER_KINDS = PROVIDER_KINDS;
