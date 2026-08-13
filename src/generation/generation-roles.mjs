export const GENERATION_ROLE_IDS = Object.freeze([
  'acceptedPairMissionEvidence',
  'episodeEvaluator',
  'peopleDossierAuthor',
  'characterCreatorSectionDraft'
]);

export const GENERATION_PROVIDER_KINDS = Object.freeze(['utility', 'reasoning']);

const DEFAULT_ROLE_DEFINITIONS = Object.freeze({
  acceptedPairMissionEvidence: Object.freeze({
    id: 'acceptedPairMissionEvidence',
    label: 'Mission evidence and story time',
    providerKind: 'utility',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 120000,
    structuredOutput: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'fail-closed'
  }),
  episodeEvaluator: Object.freeze({
    id: 'episodeEvaluator',
    label: 'Bounded story analysis',
    providerKind: 'reasoning',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 10000,
    structuredOutput: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'fail-closed'
  }),
  peopleDossierAuthor: Object.freeze({
    id: 'peopleDossierAuthor',
    label: 'People public dossiers',
    providerKind: 'reasoning',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 30000,
    structuredOutput: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'fail-closed'
  }),
  characterCreatorSectionDraft: Object.freeze({
    id: 'characterCreatorSectionDraft',
    label: 'Character draft',
    providerKind: 'reasoning',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'local-fallback'
  })
});

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function required(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} must be a non-empty string`);
  return text;
}

export function getDefaultGenerationRoleDefinitions() {
  return clone(DEFAULT_ROLE_DEFINITIONS);
}

export function normalizeGenerationRoleDefinition(definition = {}) {
  const id = required(definition.id, 'generation role id');
  if (!GENERATION_ROLE_IDS.includes(id)) throw new Error(`Unknown generation role "${id}"`);
  const defaults = DEFAULT_ROLE_DEFINITIONS[id];
  const providerKind = required(definition.providerKind ?? defaults.providerKind, `generation role ${id} providerKind`);
  if (!GENERATION_PROVIDER_KINDS.includes(providerKind)) {
    throw new Error(`generation role ${id} providerKind must be utility or reasoning`);
  }
  return {
    ...clone(defaults),
    ...clone(definition),
    id,
    label: required(definition.label || defaults.label, `generation role ${id} label`),
    providerKind,
    timeoutMs: Math.max(1, Number(definition.timeoutMs ?? defaults.timeoutMs))
  };
}

export function createGenerationRoleRegistry(overrides = {}) {
  for (const roleId of Object.keys(overrides || {})) {
    if (!GENERATION_ROLE_IDS.includes(roleId)) throw new Error(`Unknown generation role override "${roleId}"`);
  }
  const roles = new Map(GENERATION_ROLE_IDS.map((roleId) => [
    roleId,
    normalizeGenerationRoleDefinition({
      ...DEFAULT_ROLE_DEFINITIONS[roleId],
      ...(overrides[roleId] || {})
    })
  ]));
  return Object.freeze({
    get(roleId) {
      const id = required(roleId, 'roleId');
      if (!roles.has(id)) throw new Error(`Unknown generation role "${id}"`);
      return clone(roles.get(id));
    },
    list() {
      return [...roles.values()].map(clone);
    },
    has(roleId) {
      return roles.has(roleId);
    }
  });
}
