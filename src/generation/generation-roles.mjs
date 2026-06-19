export const GENERATION_ROLE_IDS = Object.freeze([
  'narration',
  'missionDirectorAdvisor',
  'continuityTracker',
  'crewDirector',
  'shipDirector',
  'commandLogSummarizer',
  'recapSummarizer',
  'utilityJson'
]);

const DEFAULT_ROLE_DEFINITIONS = Object.freeze({
  narration: {
    id: 'narration',
    label: 'Narration',
    blocking: true,
    output: 'prose',
    timeoutMs: 60000,
    structuredOutput: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'fail-retryable'
  },
  missionDirectorAdvisor: {
    id: 'missionDirectorAdvisor',
    label: 'Mission Director Advisor',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 15000,
    structuredOutput: true,
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'skip'
  },
  continuityTracker: {
    id: 'continuityTracker',
    label: 'Continuity Tracker',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 30000,
    structuredOutput: true,
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'journal-only'
  },
  crewDirector: {
    id: 'crewDirector',
    label: 'Crew Director',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 30000,
    structuredOutput: true,
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'journal-only'
  },
  shipDirector: {
    id: 'shipDirector',
    label: 'Ship Director',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 30000,
    structuredOutput: true,
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'journal-only'
  },
  commandLogSummarizer: {
    id: 'commandLogSummarizer',
    label: 'Command Log Summarizer',
    blocking: false,
    output: 'prose-or-json',
    timeoutMs: 20000,
    structuredOutput: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'skip'
  },
  recapSummarizer: {
    id: 'recapSummarizer',
    label: 'Recap Summarizer',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'defer'
  },
  utilityJson: {
    id: 'utilityJson',
    label: 'Utility JSON',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 30000,
    structuredOutput: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'fail-retryable'
  }
});

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

export function getDefaultGenerationRoleDefinitions() {
  return cloneJson(DEFAULT_ROLE_DEFINITIONS);
}

export function normalizeGenerationRoleDefinition(definition = {}) {
  if (!isObject(definition)) {
    throw new Error('generation role definition must be an object');
  }
  const id = requireNonEmptyString(definition.id, 'generation role id');
  if (!GENERATION_ROLE_IDS.includes(id)) {
    throw new Error(`Unknown generation role "${id}"`);
  }
  const defaults = DEFAULT_ROLE_DEFINITIONS[id];
  return {
    ...cloneJson(defaults),
    ...cloneJson(definition),
    id,
    label: requireNonEmptyString(definition.label || defaults.label, `generation role ${id} label`),
    timeoutMs: Math.max(1, Number(definition.timeoutMs ?? defaults.timeoutMs ?? 30000))
  };
}

export function createGenerationRoleRegistry(overrides = {}) {
  for (const roleId of Object.keys(overrides || {})) {
    if (!GENERATION_ROLE_IDS.includes(roleId)) {
      throw new Error(`Unknown generation role override "${roleId}"`);
    }
  }
  const roles = new Map();
  for (const roleId of GENERATION_ROLE_IDS) {
    roles.set(roleId, normalizeGenerationRoleDefinition({
      ...DEFAULT_ROLE_DEFINITIONS[roleId],
      ...(overrides[roleId] || {})
    }));
  }
  return {
    get(roleId) {
      const id = requireNonEmptyString(roleId, 'roleId');
      const role = roles.get(id);
      if (!role) {
        throw new Error(`Unknown generation role "${id}"`);
      }
      return cloneJson(role);
    },
    list() {
      return [...roles.values()].map(cloneJson);
    },
    has(roleId) {
      return roles.has(roleId);
    }
  };
}
