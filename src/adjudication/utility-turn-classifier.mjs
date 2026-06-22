import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';

export const UTILITY_TURN_CLASSIFICATIONS = Object.freeze([
  'sceneColor',
  'routineCommand',
  'consequentialCommand',
  'counselRequest',
  'clarificationNeeded',
  'riskConfirmationNeeded',
  'directorResponseNeeded',
  'noDirectiveAction'
]);

export const UTILITY_RESPONSE_STRATEGIES = Object.freeze([
  'injectAndContinue',
  'directivePosted',
  'pause'
]);

const WORKER_KEYS = Object.freeze([
  'missionDirector',
  'relationship',
  'crew',
  'ship',
  'commandBearing',
  'sideMission',
  'continuity',
  'promptUpdate',
  'narrator'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function includesAny(text, phrases = []) {
  const normalized = compact(text).toLowerCase();
  return phrases.some((phrase) => normalized.includes(String(phrase).toLowerCase()));
}

function hasCommandShape(text) {
  const normalized = compact(text);
  return /^(?:i\s+)?(?:order|direct|instruct|tell|ask|have|send|route|assign|authorize|approve|deny|hold|open|close|raise|lower|set|begin|start|continue|stop|abort|investigate|scan|hail|contact|report|prepare|preserve|transfer|evacuate|deploy|establish|coordinate|proceed|engage|fire|arrest|detain|board|pursue|withdraw|change|alter|divert|intercept|reroute)\b/i.test(normalized)
    || /\b(?:make it so|carry it out|you have your orders)\b/i.test(normalized);
}

function defaultWorkerPlan(overrides = {}) {
  return Object.fromEntries(WORKER_KEYS.map((key) => [key, overrides[key] === true]));
}

function result({
  classification,
  confidence,
  reasons,
  workerPlan,
  responseStrategy,
  source = 'deterministic',
  diagnostics = null
}) {
  return {
    kind: 'directive.utilityTurnClassification',
    classification,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0)),
    reasons: Array.isArray(reasons) ? reasons.map(compact).filter(Boolean) : [compact(reasons)].filter(Boolean),
    workerPlan: defaultWorkerPlan(workerPlan),
    responseStrategy,
    source,
    diagnostics: cloneJson(diagnostics)
  };
}

function deterministicClassification(text, context = {}) {
  const normalized = compact(text);
  const lower = normalized.toLowerCase();
  if (!normalized) {
    return result({
      classification: 'noDirectiveAction',
      confidence: 1,
      reasons: ['The message contains no actionable text.'],
      workerPlan: {},
      responseStrategy: 'injectAndContinue'
    });
  }

  if (includesAny(lower, [
    'what do you recommend',
    'recommendation',
    'what are our options',
    'give me options',
    'your assessment',
    'your read',
    'advise me',
    'counsel',
    'what would you do',
    'protocol here',
    'what does starfleet procedure'
  ]) || (/\?$/.test(normalized) && includesAny(lower, ['should we', 'can we', 'could we', 'what if', 'how would']))) {
    return result({
      classification: 'counselRequest',
      confidence: 0.94,
      reasons: ['The player explicitly requests options, advice, protocol, or a specialist assessment.'],
      workerPlan: {
        missionDirector: true,
        relationship: includesAny(lower, ['crew', 'captain', 'officer', 'relationship', 'trust']),
        crew: includesAny(lower, ['medical', 'crew', 'casualt', 'injur', 'stress']),
        ship: includesAny(lower, ['ship', 'engineering', 'system', 'damage', 'warp', 'impulse']),
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
    });
  }

  if (includesAny(lower, [
    'self-destruct',
    'fire phasers',
    'fire torped',
    'open fire',
    'ramming speed',
    'vent the',
    'eject the core',
    'override safety',
    'disable life support',
    'execute them',
    'kill them',
    'abandon ship',
    'enter the anomaly',
    'cross the neutral zone',
    'violate orders',
    'ignore the captain',
    'arrest the captain'
  ])) {
    return result({
      classification: 'riskConfirmationNeeded',
      confidence: 0.98,
      reasons: ['The declared action carries serious foreseeable safety, authority, or mission risk.'],
      workerPlan: {
        missionDirector: true,
        crew: true,
        ship: true,
        commandBearing: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'pause'
    });
  }

  if (/^(?:i\s+)?(?:do it|proceed|continue|go ahead|make it happen|handle it|take care of it|that one|the first option|the second option)\.?$/i.test(normalized)) {
    return result({
      classification: 'clarificationNeeded',
      confidence: context?.activeDecisionPointCount > 1 ? 0.96 : 0.72,
      reasons: ['The message expresses intent but does not identify a sufficiently stable target or method.'],
      workerPlan: {
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'pause'
    });
  }

  if (includesAny(lower, [
    'log the distress call',
    'log this',
    'preserve telemetry',
    'preserve the telemetry',
    'route it to',
    'keep the captain informed',
    'notify the captain',
    'standard readiness',
    'normal readiness',
    'maintain readiness',
    'record the order',
    'put it in the log',
    'acknowledge the signal',
    'monitor the channel',
    'continue monitoring',
    'run a routine scan',
    'routine diagnostic',
    'standard diagnostic',
    'send the report',
    'schedule the briefing'
  ])) {
    return result({
      classification: 'routineCommand',
      confidence: 0.93,
      reasons: ['The action is authorized, reversible, low-cost professional procedure.'],
      workerPlan: {
        continuity: true,
        promptUpdate: true
      },
      responseStrategy: 'injectAndContinue'
    });
  }

  const consequentialSignals = includesAny(lower, [
    'change course',
    'alter course',
    'divert',
    'pursue',
    'withdraw',
    'board',
    'evacuate',
    'transfer the',
    'authorize',
    'deny',
    'detain',
    'arrest',
    'relieve',
    'reassign',
    'promote',
    'discipline',
    'make contact',
    'hail them',
    'negotiate',
    'offer terms',
    'reject the',
    'accept the',
    'commit the ship',
    'launch',
    'deploy',
    'raise shields',
    'red alert',
    'yellow alert',
    'repair priority',
    'use the evidence',
    'release the logs',
    'classify the',
    'open an investigation',
    'assign an away team',
    'take command',
    'countermand',
    'override',
    'risk the ship',
    'risk the crew',
    'we will stay',
    'we will leave',
    'I decide',
    'my decision'
  ]);

  if (hasCommandShape(normalized) && consequentialSignals) {
    return result({
      classification: 'consequentialCommand',
      confidence: 0.9,
      reasons: ['The command can materially change mission posture, authority, relationships, resources, crew safety, or ship condition.'],
      workerPlan: {
        missionDirector: true,
        relationship: includesAny(lower, ['captain', 'officer', 'crew', 'trust', 'support', 'relieve', 'discipline', 'promise']),
        crew: includesAny(lower, ['crew', 'medical', 'casualt', 'injur', 'away team', 'evacuat', 'transfer']),
        ship: includesAny(lower, ['ship', 'course', 'warp', 'impulse', 'shield', 'weapon', 'damage', 'repair', 'system']),
        commandBearing: true,
        sideMission: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
    });
  }

  if (hasCommandShape(normalized)) {
    return result({
      classification: 'routineCommand',
      confidence: 0.66,
      reasons: ['The message has a command form but no clear high-consequence signal.'],
      workerPlan: {
        continuity: true,
        promptUpdate: true
      },
      responseStrategy: 'injectAndContinue'
    });
  }

  if (includesAny(lower, [
    'suddenly',
    'alarm sounds',
    'the console flashes',
    'incoming transmission',
    'interrupts',
    'chapter ends',
    'time passes'
  ]) && context?.allowPlayerNarrativeControl === true) {
    return result({
      classification: 'directorResponseNeeded',
      confidence: 0.76,
      reasons: ['The post introduces a scene beat that should be reconciled with authoritative campaign state.'],
      workerPlan: {
        missionDirector: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
    });
  }

  if (normalized.length < 220 && (
    /^['"*_(]/.test(normalized)
    || includesAny(lower, ['smiles', 'nods', 'sighs', 'looks at', 'leans back', 'takes a breath', 'folds their arms', 'raises an eyebrow'])
    || /^(?:i\s+)?(?:smile|nod|sigh|wait|listen|watch|look|sit|stand|turn)\b/i.test(normalized)
  )) {
    return result({
      classification: 'sceneColor',
      confidence: 0.86,
      reasons: ['The post primarily supplies roleplay color without an evident material state change.'],
      workerPlan: {
        continuity: true,
        promptUpdate: true
      },
      responseStrategy: 'injectAndContinue'
    });
  }

  return result({
    classification: 'noDirectiveAction',
    confidence: 0.58,
    reasons: ['No stable consequential or procedural signal was detected.'],
    workerPlan: {
      continuity: normalized.length > 80,
      promptUpdate: normalized.length > 80
    },
    responseStrategy: 'injectAndContinue'
  });
}

function normalizeWorkerPlan(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  return defaultWorkerPlan(Object.fromEntries(WORKER_KEYS.map((key) => [key, input[key] === true])));
}

function normalizeProviderClassification(value, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  const classification = UTILITY_TURN_CLASSIFICATIONS.includes(value.classification)
    ? value.classification
    : fallback.classification;
  const responseStrategy = UTILITY_RESPONSE_STRATEGIES.includes(value.responseStrategy)
    ? value.responseStrategy
    : fallback.responseStrategy;
  return result({
    classification,
    confidence: Number.isFinite(Number(value.confidence)) ? Number(value.confidence) : fallback.confidence,
    reasons: Array.isArray(value.reasons) ? value.reasons : (value.reason ? [value.reason] : fallback.reasons),
    workerPlan: normalizeWorkerPlan(value.workerPlan || fallback.workerPlan),
    responseStrategy,
    source: 'utility-provider'
  });
}

function providerPrompt({ text, context }) {
  const system = [
    'You are Directive Utility, a low-latency classifier for a chat-native command campaign.',
    'Classify the player post without adjudicating outcomes or exposing hidden state.',
    `classification must be one of: ${UTILITY_TURN_CLASSIFICATIONS.join(', ')}.`,
    `responseStrategy must be one of: ${UTILITY_RESPONSE_STRATEGIES.join(', ')}.`,
    `workerPlan keys: ${WORKER_KEYS.join(', ')}.`,
    'Return one compact JSON object only.'
  ].join('\n');
  const user = JSON.stringify({
    playerText: text,
    playerSafeContext: context || {}
  });
  return {
    prompt: `${system}\n\n${user}`,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    parameters: {
      max_tokens: 700,
      temperature: 0.1
    }
  };
}

export async function classifyChatTurn({
  text,
  context = {},
  generationRouter = null,
  providerThreshold = 0.72
} = {}) {
  const deterministic = deterministicClassification(text, context);
  if (!generationRouter?.generate || deterministic.confidence >= providerThreshold) {
    return deterministic;
  }

  const generated = await generationRouter.generate('utilityTurnClassifier', providerPrompt({ text, context }));
  const responseText = generated?.response?.text
    || generated?.response?.content
    || generated?.response?.raw?.text
    || '';
  if (!generated?.ok || !responseText) {
    return {
      ...deterministic,
      diagnostics: {
        providerAttempted: true,
        providerOk: false,
        error: cloneJson(generated?.error || null)
      }
    };
  }
  const parsed = parseStructuredJsonText(responseText);
  if (!parsed.ok) {
    return {
      ...deterministic,
      diagnostics: {
        providerAttempted: true,
        providerOk: false,
        parse: cloneJson(parsed.diagnostic || parsed.error)
      }
    };
  }
  return {
    ...normalizeProviderClassification(parsed.value, deterministic),
    diagnostics: {
      providerAttempted: true,
      providerOk: true,
      roleId: generated.roleId,
      latencyMs: generated.diagnostics?.latencyMs || null,
      providerId: generated.diagnostics?.providerId || generated.response?.providerId || null
    }
  };
}

export const __utilityTurnClassifierTestHooks = Object.freeze({
  deterministicClassification,
  normalizeProviderClassification,
  providerPrompt,
  hasCommandShape
});
