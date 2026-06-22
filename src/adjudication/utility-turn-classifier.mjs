import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import {
  TURN_INTENT_CLASSIFICATIONS,
  TURN_RESPONSE_STRATEGIES,
  TURN_WORKER_KEYS,
  arbitrateTurnDecision,
  normalizeTurnIntentClassification,
  normalizeTurnWorkerPlan
} from './turn-intent-contract.mjs';

export const UTILITY_TURN_CLASSIFICATIONS = TURN_INTENT_CLASSIFICATIONS;
export const UTILITY_RESPONSE_STRATEGIES = TURN_RESPONSE_STRATEGIES;

const WORKER_KEYS = TURN_WORKER_KEYS;

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

function listDomainSignals(lower = '') {
  const domains = [];
  if (includesAny(lower, ['mission', 'objective', 'phase', 'orders', 'freighter', 'convoy', 'contact', 'negotiate', 'terms'])) domains.push('mission');
  if (includesAny(lower, ['captain', 'officer', 'relationship', 'trust', 'respect', 'support', 'command rhythm', 'countermand', 'relieve', 'discipline', 'whitaker', 'bronn'])) domains.push('relationship');
  if (includesAny(lower, ['medical', 'crew', 'security', 'casualt', 'injur', 'away team', 'boarding team', 'doctor'])) domains.push('crew');
  if (includesAny(lower, ['ship', 'helm', 'engineering', 'system', 'warp', 'impulse', 'shield', 'phaser', 'torped', 'sensor', 'life support', 'core'])) domains.push('ship');
  if (includesAny(lower, ['audit', 'follow-up', 'follow up', 'side work', 'schedule', 'hardware'])) domains.push('sideMission');
  if (hasCommandShape(lower)) domains.push('command');
  return [...new Set(domains)];
}

function hasCrewRelationshipCommandSignal(text = '') {
  const lower = compact(text).toLowerCase();
  const targetSignal = includesAny(lower, [
    'bronn',
    'whitaker',
    'captain',
    'senior staff',
    'crew',
    'command rhythm',
    'handoff',
    'tactical posture'
  ]);
  const commandSignal = includesAny(lower, [
    'tell ',
    'ask ',
    'have ',
    'i acknowledge',
    'i want',
    'keep ',
    'show trust',
    'professional warmth',
    'non-threatening',
    'respect what they built',
    'respect what the crew built',
    'trust my call'
  ]);
  return targetSignal && commandSignal;
}

function listRiskSignals(lower = '') {
  const risks = [];
  if (includesAny(lower, ['self-destruct', 'override safety', 'disable life support', 'eject the core', 'vent the', 'kill them', 'execute them'])) risks.push('crew-safety-risk');
  if (includesAny(lower, ['fire phasers', 'fire torped', 'open fire', 'ramming speed', 'weapon'])) risks.push('weapons-risk');
  if (includesAny(lower, ['cross the neutral zone', 'violate orders', 'countermand', 'arrest the captain', 'ignore the captain'])) risks.push('authority-risk');
  if (includesAny(lower, ['enter the anomaly', 'risk the ship', 'risk the crew', 'abandon ship'])) risks.push('ship-safety-risk');
  return [...new Set(risks)];
}

function pendingInteractionResolutionFromText(text = '', pendingInteraction = null) {
  if (!pendingInteraction || typeof pendingInteraction !== 'object') return null;
  const normalized = compact(text).toLowerCase().replace(/[.!?]+$/g, '');
  if (!normalized) return null;
  if (['revise', 'revise the order', 'change the order', 'change it', 'hold', 'hold that', 'stand down'].includes(normalized)) {
    return {
      action: 'revise',
      interactionId: pendingInteraction.id || null,
      confidence: 0.94
    };
  }
  if (['cancel', 'dismiss', 'never mind', 'nevermind', 'drop it'].includes(normalized)) {
    return {
      action: 'cancel',
      interactionId: pendingInteraction.id || null,
      confidence: 0.94
    };
  }
  if (pendingInteraction.kind === 'clarificationNeeded') return null;
  if ([
    'confirm',
    'confirm the order',
    'accept',
    'accept the outcome',
    'approve',
    'approve it',
    'proceed',
    'go ahead',
    'do it',
    'make it so',
    'carry it out'
  ].includes(normalized)) {
    return {
      action: pendingInteraction.kind === 'riskConfirmationNeeded' ? 'confirm' : 'accept',
      interactionId: pendingInteraction.id || null,
      confidence: 0.96
    };
  }
  return null;
}

function inferIntentSlots(text = '', classification = 'noDirectiveAction') {
  const normalized = compact(text);
  const lower = normalized.toLowerCase();
  let speechAct = '';
  if (classification === 'counselRequest') speechAct = 'counsel-request';
  else if (classification === 'sceneColor') speechAct = 'scene-color';
  else if (classification === 'clarificationNeeded') speechAct = 'ambiguous-confirmation';
  else if (['routineCommand', 'consequentialCommand', 'riskConfirmationNeeded', 'directorResponseNeeded'].includes(classification)) speechAct = 'order';

  let action = '';
  let target = '';
  const command = normalized.match(/^(?:i\s+)?(?:order|direct|instruct|tell|ask|have|send|route|assign|authorize|approve|deny|hold|open|close|raise|lower|set|begin|start|continue|stop|abort|investigate|scan|hail|contact|report|prepare|preserve|transfer|evacuate|deploy|establish|coordinate|proceed|engage|fire|arrest|detain|board|pursue|withdraw|change|alter|divert|intercept|reroute)\b\s*(.*)$/i);
  if (command) {
    action = command[0].split(/\s+/).slice(0, 2).join(' ');
    target = compact(command[1]);
  } else if (includesAny(lower, ['make it so', 'carry it out', 'you have your orders'])) {
    action = 'confirm';
    target = 'previously stated order';
  }
  if (!action && classification === 'riskConfirmationNeeded') {
    action = 'execute high-risk order';
    target = normalized;
  }
  if (!action && classification === 'routineCommand') {
    action = 'perform routine procedure';
    target = normalized;
  }
  if (!action && classification === 'consequentialCommand') {
    action = 'issue consequential command';
    target = normalized;
  }
  return {
    speechAct,
    action,
    target,
    targetConfidence: target ? 0.72 : 0,
    domainSignals: listDomainSignals(lower),
    riskSignals: listRiskSignals(lower)
  };
}

function hasSceneColorSignal(normalized, lower = compact(normalized).toLowerCase()) {
  const text = compact(normalized);
  const startsWithDialogueQuote = /^["']/.test(text);
  const dialogueLooksOperational = startsWithDialogueQuote && /\b(?:secure|start|scan|hail|prepare|shadow|divert|take|open|offer|authorize|board|send|route|raise|lower|keep weapons|countermand\w*|overrul\w*|fire|launch|deploy|move|hold)\b/i.test(text);
  return compact(normalized).length < 220 && (
    (/^[*_(]/.test(text) || (startsWithDialogueQuote && !dialogueLooksOperational))
    || includesAny(lower, ['smiles', 'nods', 'sighs', 'looks at', 'leans back', 'takes a breath', 'take a breath', 'folds their arms', 'fold my arms', 'raises an eyebrow', 'raise an eyebrow', 'glance toward', 'study the tactical', 'keeps her expression', 'keeps his expression', 'keeps their expression'])
    || /^(?:i\s+)?(?:smile|nod|sigh|wait|listen|watch|look|glance|sit|stand|turn)\b/i.test(text)
  );
}

function result({
  text = '',
  classification,
  confidence,
  reasons,
  workerPlan,
  responseStrategy,
  ambiguity,
  speechAct,
  action,
  target,
  targetConfidence,
  domainSignals,
  riskSignals,
  missingInformation,
  pendingInteractionResolution,
  mixedIntent,
  source = 'deterministic',
  diagnostics = null
}) {
  const inferred = inferIntentSlots(text, classification);
  const normalized = normalizeTurnIntentClassification({
    kind: 'directive.utilityTurnClassification',
    classification,
    confidence,
    ambiguity,
    speechAct: speechAct || inferred.speechAct,
    action: action || inferred.action,
    target: target || inferred.target,
    targetConfidence: targetConfidence ?? inferred.targetConfidence,
    domainSignals: domainSignals || inferred.domainSignals,
    riskSignals: riskSignals || inferred.riskSignals,
    missingInformation,
    pendingInteractionResolution,
    mixedIntent,
    reasons: Array.isArray(reasons) ? reasons.map(compact).filter(Boolean) : [compact(reasons)].filter(Boolean),
    workerPlan: defaultWorkerPlan(workerPlan),
    responseStrategy,
    source
  });
  return {
    ...normalized,
    kind: 'directive.utilityTurnClassification',
    diagnostics: cloneJson(diagnostics)
  };
}

function deterministicClassification(text, context = {}) {
  const normalized = compact(text);
  const lower = normalized.toLowerCase();
  if (!normalized) {
    return result({
      text: normalized,
      classification: 'noDirectiveAction',
      confidence: 1,
      reasons: ['The message contains no actionable text.'],
      workerPlan: {},
      responseStrategy: 'injectAndContinue'
    });
  }

  const pendingResolution = pendingInteractionResolutionFromText(normalized, context?.pendingInteraction || null);
  if (pendingResolution) {
    const confirms = ['confirm', 'accept'].includes(pendingResolution.action);
    const classification = context?.pendingInteraction?.kind === 'riskConfirmationNeeded'
      ? 'riskConfirmationNeeded'
      : 'directorResponseNeeded';
    return result({
      text: normalized,
      classification,
      confidence: pendingResolution.confidence,
      ambiguity: 'low',
      speechAct: 'pending-interaction-resolution',
      action: pendingResolution.action,
      target: context?.pendingInteraction?.kind || 'pending interaction',
      targetConfidence: pendingResolution.confidence,
      reasons: [`The player ${confirms ? 'accepts' : 'revises or cancels'} a pending Directive interaction.`],
      pendingInteractionResolution: pendingResolution,
      workerPlan: confirms ? {
        missionDirector: true,
        relationship: true,
        crew: true,
        ship: true,
        commandBearing: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      } : {
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: confirms ? 'directivePosted' : 'pause'
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
    'what does starfleet procedure',
    'starfleet procedure',
    'procedure here',
    'protocol suggest'
  ]) || (/\?$/.test(normalized) && includesAny(lower, ['should we', 'can we', 'could we', 'what if', 'how would']))) {
    return result({
      text: normalized,
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
      text: normalized,
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
      text: normalized,
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
      text: normalized,
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

  if (hasSceneColorSignal(normalized, lower)) {
    return result({
      text: normalized,
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

  if (hasCrewRelationshipCommandSignal(normalized)) {
    return result({
      text: normalized,
      classification: 'consequentialCommand',
      confidence: 0.82,
      reasons: ['The player directs or frames crew/officer behavior in a way that can affect command rhythm, trust, or relationship state.'],
      workerPlan: {
        missionDirector: true,
        relationship: true,
        crew: true,
        ship: includesAny(lower, ['ship', 'shield', 'tactical', 'weapon', 'system', 'engineering']),
        commandBearing: true,
        sideMission: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
    });
  }

  if (hasCommandShape(normalized) && consequentialSignals) {
    return result({
      text: normalized,
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
      text: normalized,
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
      text: normalized,
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

  if (hasSceneColorSignal(normalized, lower)) {
    return result({
      text: normalized,
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
    text: normalized,
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
  return normalizeTurnWorkerPlan(value);
}

function normalizeProviderClassification(value, fallback) {
  return normalizeTurnIntentClassification({
    ...(value && typeof value === 'object' ? value : {}),
    source: 'utility-provider'
  }, fallback);
}

function providerPrompt({ text, context }) {
  const system = [
    'You are Directive Utility, a low-latency classifier for a chat-native command campaign.',
    'Classify the player post without adjudicating outcomes or exposing hidden state.',
    'Interpret language, speech act, ambiguity, action/target slots, risk signals, and worker routing.',
    'Do not decide success, reveal hidden truth, invent campaign facts, mutate state, or write narration.',
    `classification must be one of: ${UTILITY_TURN_CLASSIFICATIONS.join(', ')}.`,
    `responseStrategy must be one of: ${UTILITY_RESPONSE_STRATEGIES.join(', ')}.`,
    `workerPlan keys: ${WORKER_KEYS.join(', ')}.`,
    'Return this JSON shape: {"kind":"directive.turnIntentClassification","classification":"...","responseStrategy":"...","confidence":0.0,"ambiguity":"low|medium|high","speechAct":"order|question|counsel-request|scene-color|ambiguous-confirmation","action":"short verb phrase or empty","target":"stable player-facing target or empty","targetConfidence":0.0,"domainSignals":[],"riskSignals":[],"missingInformation":[],"pendingInteractionResolution":null,"mixedIntent":false,"workerPlan":{},"reasons":[]}.',
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

function isOperationalQuestionShape(text) {
  const normalized = compact(text).toLowerCase();
  return /\?$/.test(compact(text)) && includesAny(normalized, [
    'hail',
    'offer terms',
    'authorize',
    'send',
    'prepare',
    'raise shields',
    'divert power',
    'launch',
    'deploy',
    'open fire',
    'board',
    'pursue',
    'withdraw',
    'change course',
    'alter course'
  ]);
}

function isExplicitCounselFastPath(text) {
  const normalized = compact(text).toLowerCase();
  if (isOperationalQuestionShape(text)) return false;
  if (hasMixedCounselAndOrderShape(text)) return false;
  return includesAny(normalized, [
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
    'what does starfleet procedure',
    'starfleet procedure',
    'procedure here',
    'protocol suggest'
  ]);
}

function isVagueConfirmation(text) {
  return /^(?:i\s+)?(?:do it|proceed|continue|go ahead|make it happen|handle it|take care of it|that one|the first option|the second option)\.?$/i.test(compact(text));
}

function hasMixedCounselAndOrderShape(text) {
  const normalized = compact(text).toLowerCase();
  return includesAny(normalized, [
    'what he thinks',
    'opinion, but',
    'read and',
    'check with',
    'ask the doctor',
    'tell me if',
    'captain\'s counsel',
    'get options',
    'ask bronn',
    'recommendation, but'
  ]) && includesAny(normalized, [
    'then',
    'but',
    'while',
    'authorize',
    'prepare',
    'secure',
    'send',
    'raise shields',
    'move'
  ]);
}

function hasRelationshipSensitiveShape(text) {
  const normalized = compact(text).toLowerCase();
  return includesAny(normalized, [
    'whitaker',
    'captain',
    'countermand',
    'taking responsibility',
    'senior staff',
    'promise',
    'discipline',
    'relieve',
    'trust my call',
    'backing her diagnosis',
    'my decision'
  ]);
}

function deterministicFastPathClassification(text, context = {}, deterministic, { providerThreshold = 0.72 } = {}) {
  const fastPathConfidence = Math.max(0.85, Number(providerThreshold) || 0);
  const normalized = compact(text);
  if (!normalized) return deterministic;
  if (deterministic.pendingInteractionResolution?.action) return deterministic;
  if (deterministic.classification === 'riskConfirmationNeeded') return deterministic;
  if (deterministic.classification === 'clarificationNeeded' && isVagueConfirmation(text)) return deterministic;
  if (deterministic.classification === 'routineCommand' && deterministic.confidence >= fastPathConfidence) return deterministic;
  if (deterministic.classification === 'sceneColor' && deterministic.confidence >= fastPathConfidence) return deterministic;
  if (deterministic.classification === 'counselRequest' && deterministic.confidence >= fastPathConfidence && isExplicitCounselFastPath(text)) return deterministic;
  return null;
}

function finalizeTurnDecision(rawDecision, {
  fallback,
  diagnostics = {},
  providerAttempted = false,
  deterministicFastPath = false
} = {}) {
  return arbitrateTurnDecision(rawDecision, {
    fallback,
    diagnostics,
    providerAttempted,
    deterministicFastPath
  });
}

export async function classifyChatTurn({
  text,
  context = {},
  generationRouter = null,
  providerThreshold = 0.72
} = {}) {
  const deterministic = deterministicClassification(text, context);
  if (!generationRouter?.generate) {
    return finalizeTurnDecision(deterministic, {
      fallback: deterministic,
      diagnostics: {
        providerAttempted: false,
        providerSkippedReason: 'no-generation-router'
      }
    });
  }

  const fastPath = deterministicFastPathClassification(text, context, deterministic, { providerThreshold });
  if (fastPath) {
    return finalizeTurnDecision(fastPath, {
      fallback: deterministic,
      diagnostics: {
        providerAttempted: false,
        providerSkippedReason: 'deterministic-fast-path'
      },
      deterministicFastPath: true
    });
  }

  const generated = await generationRouter.generate('utilityTurnClassifier', providerPrompt({ text, context }));
  const responseText = generated?.response?.text
    || generated?.response?.content
    || generated?.response?.raw?.text
    || '';
  if (!generated?.ok || !responseText) {
    return finalizeTurnDecision(deterministic, {
      fallback: deterministic,
      diagnostics: {
        providerAttempted: true,
        providerOk: false,
        error: cloneJson(generated?.error || null)
      },
      providerAttempted: true
    });
  }
  const parsed = parseStructuredJsonText(responseText);
  if (!parsed.ok) {
    return finalizeTurnDecision(deterministic, {
      fallback: deterministic,
      diagnostics: {
        providerAttempted: true,
        providerOk: false,
        parse: cloneJson(parsed.diagnostic || parsed.error)
      },
      providerAttempted: true
    });
  }
  return finalizeTurnDecision(normalizeProviderClassification(parsed.value, deterministic), {
    fallback: deterministic,
    diagnostics: {
      providerAttempted: true,
      providerOk: true,
      roleId: generated.roleId,
      latencyMs: generated.diagnostics?.latencyMs || null,
      providerId: generated.diagnostics?.providerId || generated.response?.providerId || null
    },
    providerAttempted: true
  });
}

export const __utilityTurnClassifierTestHooks = Object.freeze({
  deterministicClassification,
  deterministicFastPathClassification,
  normalizeProviderClassification,
  finalizeTurnDecision,
  providerPrompt,
  hasCommandShape
});
