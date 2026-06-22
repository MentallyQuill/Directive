export const GENERATION_ROLE_IDS = Object.freeze([
  'narration',
  'campaignIntro',
  'campaignConclusion',
  'missionDirectorAdvisor',
  'utilityTurnClassifier',
  'questActionInterpreter',
  'questArchitect',
  'sceneDeltaExtractor',
  'sceneReconciliationExtractor',
  'relationshipEvaluator',
  'commandBearingEvaluator',
  'promptContextBuilder',
  'continuityTracker',
  'crewDirector',
  'shipDirector',
  'commandLogSummarizer',
  'recapSummarizer',
  'directiveAssist',
  'characterCreatorSectionDraft',
  'utilityJson'
]);

export const GENERATION_PROVIDER_KINDS = Object.freeze([
  'utility',
  'reasoning'
]);

const DEFAULT_ROLE_DEFINITIONS = Object.freeze({
  narration: {
    id: 'narration',
    label: 'Narration',
    providerKind: 'reasoning',
    blocking: true,
    output: 'prose',
    timeoutMs: 60000,
    structuredOutput: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'fail-retryable'
  },

  campaignIntro: {
    id: 'campaignIntro',
    label: 'Campaign Intro',
    providerKind: 'reasoning',
    blocking: true,
    output: 'prose',
    timeoutMs: 60000,
    structuredOutput: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'local-fallback'
  },
  campaignConclusion: {
    id: 'campaignConclusion',
    label: 'Campaign Conclusion',
    providerKind: 'reasoning',
    blocking: true,
    output: 'prose',
    timeoutMs: 60000,
    structuredOutput: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'local-fallback'
  },
  utilityTurnClassifier: {
    id: 'utilityTurnClassifier',
    label: 'Utility Turn Classifier',
    providerKind: 'utility',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 12000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility'
    },
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'deterministic'
  },
  questActionInterpreter: {
    id: 'questActionInterpreter',
    label: 'Quest Action Interpreter',
    providerKind: 'utility',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 12000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility-reasoning'
    },
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'deterministic'
  },
  questArchitect: {
    id: 'questArchitect',
    label: 'Quest Architect',
    providerKind: 'reasoning',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'balanced',
      latency: 'medium',
      capability: 'reasoning-writing'
    },
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'deterministic'
  },
  sceneDeltaExtractor: {
    id: 'sceneDeltaExtractor',
    label: 'Scene Delta Extractor',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 20000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility-reasoning'
    },
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'deterministic'
  },
  sceneReconciliationExtractor: {
    id: 'sceneReconciliationExtractor',
    label: 'Scene Reconciliation Extractor',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 30000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'medium',
      capability: 'utility-reasoning'
    },
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'deterministic'
  },
  relationshipEvaluator: {
    id: 'relationshipEvaluator',
    label: 'Relationship Evaluator',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility-reasoning'
    },
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'journal-only'
  },
  commandBearingEvaluator: {
    id: 'commandBearingEvaluator',
    label: 'Command Bearing Evaluator',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility-reasoning'
    },
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'journal-only'
  },
  promptContextBuilder: {
    id: 'promptContextBuilder',
    label: 'Prompt Context Builder',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 15000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility'
    },
    mayProposeState: false,
    mayInjectPrompt: true,
    mayRunDuringMainGeneration: true,
    fallback: 'deterministic'
  },
  missionDirectorAdvisor: {
    id: 'missionDirectorAdvisor',
    label: 'Mission Director Advisor',
    providerKind: 'reasoning',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 15000,
    structuredOutput: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'skip'
  },
  continuityTracker: {
    id: 'continuityTracker',
    label: 'Continuity Tracker',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'journal-only'
  },
  crewDirector: {
    id: 'crewDirector',
    label: 'Crew Director',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility-reasoning'
    },
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'journal-only'
  },
  shipDirector: {
    id: 'shipDirector',
    label: 'Ship Director',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility-reasoning'
    },
    mayProposeState: true,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'journal-only'
  },
  commandLogSummarizer: {
    id: 'commandLogSummarizer',
    label: 'Command Log Summarizer',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 8000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility'
    },
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: true,
    fallback: 'skip'
  },
  recapSummarizer: {
    id: 'recapSummarizer',
    label: 'Recap Summarizer',
    providerKind: 'utility',
    blocking: false,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'defer'
  },
  directiveAssist: {
    id: 'directiveAssist',
    label: 'Directive Assist',
    providerKind: 'utility',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'low',
      latency: 'fast',
      capability: 'utility-writing'
    },
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'fail-retryable'
  },
  characterCreatorSectionDraft: {
    id: 'characterCreatorSectionDraft',
    label: 'Character Creator Section Draft',
    providerKind: 'reasoning',
    blocking: true,
    output: 'structured-json',
    timeoutMs: 45000,
    structuredOutput: true,
    modelPreferences: {
      cost: 'balanced',
      latency: 'medium',
      capability: 'reasoning-writing'
    },
    mayProposeState: false,
    mayInjectPrompt: false,
    mayRunDuringMainGeneration: false,
    fallback: 'local-fallback'
  },
  utilityJson: {
    id: 'utilityJson',
    label: 'Utility JSON',
    providerKind: 'utility',
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

function normalizeProviderKind(value, label) {
  const providerKind = requireNonEmptyString(value, label);
  if (!GENERATION_PROVIDER_KINDS.includes(providerKind)) {
    throw new Error(`${label} must be one of: ${GENERATION_PROVIDER_KINDS.join(', ')}`);
  }
  return providerKind;
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
    providerKind: normalizeProviderKind(definition.providerKind ?? defaults.providerKind, `generation role ${id} providerKind`),
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
