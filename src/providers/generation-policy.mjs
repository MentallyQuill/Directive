const PRESET_MODES = new Set(['isolated', 'full-profile']);
const INSTRUCT_MODES = new Set(['auto', 'on', 'off']);
const SAMPLER_MODES = new Set(['profile', 'directive']);
const STRUCTURED_OUTPUT_MODES = new Set(['auto', 'native-schema', 'prompt-json']);

function enumOr(value, allowed, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function canonicalConfig({ kind, provider = {}, identity = '', completionMode = 'unknown' } = {}) {
  return {
    kind: String(kind || ''),
    provider: String(provider.provider || 'st'),
    profileId: String(provider.profileId || ''),
    identity: String(identity || ''),
    completionMode: String(completionMode || 'unknown'),
    presetMode: enumOr(provider.presetMode, PRESET_MODES, 'isolated'),
    instructMode: enumOr(provider.instructMode, INSTRUCT_MODES, 'auto'),
    samplerMode: enumOr(provider.samplerMode, SAMPLER_MODES, 'profile'),
    structuredOutputMode: enumOr(provider.structuredOutputMode, STRUCTURED_OUTPUT_MODES, 'auto'),
    temperature: Number(provider.temperature),
    topP: Number(provider.topP),
    maxTokens: Number(provider.maxTokens)
  };
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function directiveProviderConfigFingerprint(input = {}) {
  return `directive-provider-v1:${fnv1a(JSON.stringify(canonicalConfig(input)))}`;
}

export function resolveDirectiveGenerationPolicy({
  provider = {},
  completionMode = 'unknown',
  certifiedNativeSchema = false
} = {}) {
  const presetMode = enumOr(provider.presetMode, PRESET_MODES, 'isolated');
  const instructMode = enumOr(provider.instructMode, INSTRUCT_MODES, 'auto');
  const samplerMode = enumOr(provider.samplerMode, SAMPLER_MODES, 'profile');
  const structuredOutputMode = enumOr(provider.structuredOutputMode, STRUCTURED_OUTPUT_MODES, 'auto');
  return Object.freeze({
    includePreset: presetMode === 'full-profile',
    includeInstruct: instructMode === 'on'
      || (instructMode === 'auto' && completionMode === 'text'),
    samplerMode,
    samplerOverrides: samplerMode === 'directive'
      ? Object.freeze({ temperature: Number(provider.temperature), top_p: Number(provider.topP) })
      : null,
    structuredOutputMethod: structuredOutputMode === 'auto'
      ? (certifiedNativeSchema ? 'native-schema' : 'prompt-json')
      : structuredOutputMode
  });
}

export const DIRECTIVE_PRESET_MODES = Object.freeze([...PRESET_MODES]);
export const DIRECTIVE_INSTRUCT_MODES = Object.freeze([...INSTRUCT_MODES]);
export const DIRECTIVE_SAMPLER_MODES = Object.freeze([...SAMPLER_MODES]);
export const DIRECTIVE_STRUCTURED_OUTPUT_MODES = Object.freeze([...STRUCTURED_OUTPUT_MODES]);
