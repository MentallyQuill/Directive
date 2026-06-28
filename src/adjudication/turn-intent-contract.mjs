export const TURN_INTENT_CLASSIFICATIONS = Object.freeze([
  'sceneColor',
  'sceneNavigation',
  'locationTransition',
  'routineCommand',
  'consequentialCommand',
  'counselRequest',
  'clarificationNeeded',
  'riskConfirmationNeeded',
  'directorResponseNeeded',
  'noDirectiveAction'
]);

export const TURN_RESPONSE_STRATEGIES = Object.freeze([
  'injectAndContinue',
  'directivePosted',
  'pause'
]);

export const TURN_WORKER_KEYS = Object.freeze([
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

export const TURN_AMBIGUITY_LEVELS = Object.freeze([
  'low',
  'medium',
  'high'
]);

export const TURN_CLOSURE_SIGNAL_CONFIDENCE = Object.freeze([
  'low',
  'medium',
  'high'
]);

export const TURN_CLOSURE_SIGNAL_TYPES = Object.freeze([
  'quest',
  'storyArc',
  'milestone',
  'thread',
  'chapter',
  'commandCrucible',
  'scene'
]);

const HIDDEN_STATE_LEAK_PATTERNS = Object.freeze([
  /\bdirector[-\s]?only\b/i,
  /\bhidden\s+(?:truth|state|score|fact|note|value)\b/i,
  /\bunrevealed\s+(?:truth|fact|state|score|note)\b/i,
  /\bprivate\s+(?:director|gm|story)\s+note\b/i,
  /\bbehind\s+the\s+(?:screen|curtain)\b/i,
  /\bsecret\s+(?:score|truth|fact|value|note)\b/i
]);

const DIRECTIVE_POSTED_PENDING_ACTIONS = Object.freeze([
  'accept',
  'confirm',
  'replayfromcheckpoint',
  'pushon',
  'keepending',
  'saveterminalbranch'
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function compactText(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function clampConfidence(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Math.max(0, Math.min(1, Number(fallback) || 0));
  return Math.max(0, Math.min(1, number));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function uniqueStrings(value, { lower = false } = {}) {
  const seen = new Set();
  const output = [];
  for (const item of asArray(value)) {
    const text = compactText(typeof item === 'string' ? item : item?.id || item?.label || item?.summary || item?.value);
    if (!text) continue;
    const normalized = lower ? text.toLowerCase() : text;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function normalizeEnum(value, allowed, fallback) {
  const text = compactText(value);
  return allowed.includes(text) ? text : fallback;
}

function inferAmbiguity(confidence, fallback = 'medium') {
  const score = clampConfidence(confidence, 0);
  if (score >= 0.85) return 'low';
  if (score >= 0.65) return 'medium';
  return normalizeEnum(fallback, TURN_AMBIGUITY_LEVELS, 'high');
}

export function defaultTurnWorkerPlan(overrides = {}) {
  const input = isObject(overrides) ? overrides : {};
  return Object.fromEntries(TURN_WORKER_KEYS.map((key) => [key, input[key] === true]));
}

export function normalizeTurnWorkerPlan(value = {}) {
  return defaultTurnWorkerPlan(isObject(value) ? value : {});
}

export function responseStrategyForClassification(classification) {
  if (classification === 'locationTransition') return 'directivePosted';
  if (['sceneColor', 'sceneNavigation', 'routineCommand', 'counselRequest', 'noDirectiveAction'].includes(classification)) return 'injectAndContinue';
  if (['clarificationNeeded', 'riskConfirmationNeeded'].includes(classification)) return 'pause';
  return 'directivePosted';
}

function normalizePendingInteractionResolution(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const text = compactText(value);
    if (!text) return null;
    if (/^interaction[:\w.-]+/i.test(text)) {
      return { action: 'accept', interactionId: text, confidence: 0 };
    }
    return { action: text, interactionId: '', confidence: 0 };
  }
  if (!isObject(value)) return null;
  return {
    action: compactText(value.action || value.intent || value.resolution),
    interactionId: compactText(value.interactionId || value.id),
    confidence: clampConfidence(value.confidence, 0)
  };
}

function normalizeClosureSignals(value = {}) {
  if (!isObject(value)) {
    return {
      possibleClosure: false,
      confidence: 'low',
      closureTypes: [],
      playerFacingReason: ''
    };
  }
  return {
    possibleClosure: value.possibleClosure === true,
    confidence: normalizeEnum(value.confidence, TURN_CLOSURE_SIGNAL_CONFIDENCE, 'low'),
    closureTypes: uniqueStrings(value.closureTypes || value.types, { lower: false })
      .filter((type) => TURN_CLOSURE_SIGNAL_TYPES.includes(type)),
    playerFacingReason: compactText(value.playerFacingReason || value.reason)
  };
}

function normalizeSceneBoundary(value = null, fallback = null) {
  const source = isObject(value) ? value : (isObject(fallback) ? fallback : null);
  if (!source) return null;
  const kind = compactText(source.kind || source.type || source.boundaryKind);
  const destinationLabel = compactText(source.destinationLabel || source.destination || source.location || source.target);
  const destinationId = compactText(source.destinationId || source.locationId);
  const guideActorId = compactText(source.guideActorId || source.guideId || source.actorId);
  const stopPolicy = compactText(source.stopPolicy || 'stopOnArrival') || 'stopOnArrival';
  const maxNamedLocations = Number.isFinite(Number(source.maxNamedLocations))
    ? Math.max(1, Math.min(3, Math.trunc(Number(source.maxNamedLocations))))
    : 1;
  if (!kind && !destinationLabel && !destinationId && !guideActorId) return null;
  return {
    kind: kind || 'locationTransition',
    destinationLabel: destinationLabel || null,
    destinationId: destinationId || null,
    guideActorId: guideActorId || null,
    stopPolicy,
    maxNamedLocations
  };
}

export function normalizeTurnIntentClassification(value = {}, fallback = {}) {
  const input = isObject(value) ? value : {};
  const fallbackInput = isObject(fallback) ? fallback : {};
  const fallbackSlots = isObject(fallbackInput.slots) ? fallbackInput.slots : {};
  const inputSlots = isObject(input.slots) ? input.slots : {};
  const classification = normalizeEnum(
    input.classification,
    TURN_INTENT_CLASSIFICATIONS,
    normalizeEnum(fallbackInput.classification, TURN_INTENT_CLASSIFICATIONS, 'noDirectiveAction')
  );
  const confidence = clampConfidence(input.confidence, fallbackInput.confidence ?? 0);
  const responseStrategy = normalizeEnum(
    input.responseStrategy,
    TURN_RESPONSE_STRATEGIES,
    responseStrategyForClassification(classification)
  );
  const action = compactText(input.action || inputSlots.action || fallbackInput.action || fallbackSlots.action);
  const target = compactText(input.target || inputSlots.target || fallbackInput.target || fallbackSlots.target);
  const sceneBoundary = normalizeSceneBoundary(
    input.sceneBoundary || inputSlots.sceneBoundary,
    fallbackInput.sceneBoundary || fallbackSlots.sceneBoundary
  );
  const domains = uniqueStrings(
    input.domainSignals
      || input.domains
      || inputSlots.domains
      || inputSlots.domainSignals
      || fallbackInput.domainSignals
      || fallbackSlots.domains,
    { lower: true }
  );
  return {
    kind: 'directive.turnIntentClassification',
    classification,
    confidence,
    ambiguity: normalizeEnum(
      input.ambiguity,
      TURN_AMBIGUITY_LEVELS,
      normalizeEnum(fallbackInput.ambiguity, TURN_AMBIGUITY_LEVELS, inferAmbiguity(confidence))
    ),
    speechAct: compactText(input.speechAct || inputSlots.speechAct || fallbackInput.speechAct || fallbackSlots.speechAct),
    action,
    target,
    targetConfidence: clampConfidence(input.targetConfidence ?? inputSlots.targetConfidence, fallbackInput.targetConfidence ?? fallbackSlots.targetConfidence ?? (target ? confidence : 0)),
    domainSignals: domains,
    riskSignals: uniqueStrings(input.riskSignals || inputSlots.riskSignals || fallbackInput.riskSignals || fallbackSlots.riskSignals, { lower: true }),
    missingInformation: uniqueStrings(input.missingInformation || inputSlots.missingInformation || fallbackInput.missingInformation || fallbackSlots.missingInformation),
    pendingInteractionResolution: normalizePendingInteractionResolution(input.pendingInteractionResolution || fallbackInput.pendingInteractionResolution),
    closureSignals: normalizeClosureSignals(input.closureSignals || fallbackInput.closureSignals),
    sceneBoundary,
    mixedIntent: input.mixedIntent === true || fallbackInput.mixedIntent === true,
    reasons: uniqueStrings(input.reasons || input.reason || fallbackInput.reasons || fallbackInput.reason),
    workerPlan: normalizeTurnWorkerPlan(input.workerPlan || fallbackInput.workerPlan),
    responseStrategy,
    source: compactText(input.source || fallbackInput.source || 'deterministic'),
    slots: {
      speechAct: compactText(input.speechAct || inputSlots.speechAct || fallbackInput.speechAct || fallbackSlots.speechAct),
      action,
      target,
      sceneBoundary: cloneJson(sceneBoundary),
      domains
    }
  };
}

function allDecisionText(decision) {
  return [
    decision.speechAct,
    decision.action,
    decision.target,
    ...(decision.domainSignals || []),
    ...(decision.riskSignals || []),
    ...(decision.missingInformation || []),
    decision.closureSignals?.playerFacingReason,
    ...(decision.closureSignals?.closureTypes || []),
    ...(decision.reasons || [])
  ].map(compactText).filter(Boolean).join(' ');
}

export function hasHiddenStateLeak(decision) {
  const text = allDecisionText(decision);
  return HIDDEN_STATE_LEAK_PATTERNS.some((pattern) => pattern.test(text));
}

function hasDomain(decision, patterns = []) {
  const haystack = [
    decision.action,
    decision.target,
    ...(decision.domainSignals || []),
    ...(decision.riskSignals || []),
    ...(decision.reasons || [])
  ].join(' ').toLowerCase();
  return patterns.some((pattern) => pattern.test(haystack));
}

function shouldClarify(decision) {
  if (decision.classification === 'clarificationNeeded') return { clarify: true, reason: 'classification-requested-clarification' };
  if (!['consequentialCommand', 'directorResponseNeeded'].includes(decision.classification)) {
    return { clarify: false, reason: null };
  }
  if (decision.ambiguity === 'high') return { clarify: true, reason: 'high-ambiguity' };
  if (decision.confidence < 0.65) return { clarify: true, reason: 'low-confidence' };
  if (decision.mixedIntent && (!decision.action || !decision.target)) {
    return { clarify: true, reason: 'mixed-intent-without-stable-command' };
  }
  if (decision.missingInformation.length > 0) {
    return { clarify: true, reason: 'missing-information' };
  }
  if (decision.classification === 'consequentialCommand' && (!decision.action || !decision.target || decision.targetConfidence < 0.5)) {
    return { clarify: true, reason: 'unstable-action-target-slots' };
  }
  return { clarify: false, reason: null };
}

function riskUpgradeClassification(decision) {
  if (decision.riskSignals.length === 0) return null;
  if (decision.classification === 'routineCommand') return 'consequentialCommand';
  if (['sceneColor', 'sceneNavigation', 'locationTransition', 'noDirectiveAction'].includes(decision.classification)) return 'consequentialCommand';
  return null;
}

function responseStrategyForDecision(decision) {
  const pendingAction = compactText(decision.pendingInteractionResolution?.action).toLowerCase();
  if (DIRECTIVE_POSTED_PENDING_ACTIONS.includes(pendingAction)) return 'directivePosted';
  if (['revise', 'cancel', 'dismiss'].includes(pendingAction)) return 'pause';
  if (decision.classification === 'routineCommand' && decision.responseStrategy === 'directivePosted') return 'directivePosted';
  return responseStrategyForClassification(decision.classification);
}

function validateWorkerPlan(decision) {
  const plan = normalizeTurnWorkerPlan(decision.workerPlan);
  const classification = decision.classification;
  if (classification === 'routineCommand') {
    plan.continuity = true;
    plan.promptUpdate = true;
  }
  if (['sceneNavigation', 'locationTransition'].includes(classification)) {
    plan.continuity = true;
    plan.promptUpdate = true;
  }
  if (classification === 'locationTransition') {
    plan.narrator = true;
    plan.relationship = true;
  }
  if (classification === 'counselRequest') {
    plan.missionDirector = true;
    plan.continuity = true;
    plan.promptUpdate = true;
    plan.narrator = true;
  }
  if (['consequentialCommand', 'directorResponseNeeded'].includes(classification)) {
    plan.missionDirector = true;
    plan.commandBearing = true;
    plan.sideMission = true;
    plan.continuity = true;
    plan.promptUpdate = true;
    plan.narrator = true;
  }
  if (classification === 'riskConfirmationNeeded') {
    plan.missionDirector = true;
    plan.crew = true;
    plan.ship = true;
    plan.commandBearing = true;
    plan.continuity = true;
    plan.promptUpdate = true;
    plan.narrator = true;
  }
  if (classification === 'clarificationNeeded') {
    plan.continuity = true;
    plan.promptUpdate = true;
    plan.narrator = true;
  }
  if (hasDomain(decision, [/\brelationship\b/, /\btrust\b/, /\bcaptain\b/, /\bofficer\b/, /\bwhitaker\b/, /\bcountermand\b/, /\bdiscipline\b/, /\brelieve\b/])) {
    plan.relationship = true;
  }
  if (hasDomain(decision, [/\bcrew\b/, /\bmedical\b/, /\bsecurity\b/, /\bcasualt/, /\binjur/, /\baway team\b/, /\bboarding team\b/])) {
    plan.crew = true;
  }
  if (classification !== 'locationTransition' && hasDomain(decision, [/\bship\b/, /\bhelm\b/, /\bengineering\b/, /\bsystem\b/, /\bwarp\b/, /\bimpulse\b/, /\bshield\b/, /\bphaser\b/, /\btorped/, /\bsensor\b/, /\blife support\b/])) {
    plan.ship = true;
  }
  if (hasDomain(decision, [/\bcommand\b/, /\bauthority\b/, /\border\b/, /\bcountermand\b/, /\boverride\b/, /\bdiscipline\b/, /\brelieve\b/])) {
    plan.commandBearing = true;
  }
  if (hasDomain(decision, [/\bside mission\b/, /\bside work\b/, /\baudit\b/, /\bfollow[-\s]?up\b/, /\bschedule\b/])) {
    plan.sideMission = true;
  }
  return plan;
}

function workerPlanChanges(before, after) {
  const changes = [];
  for (const key of TURN_WORKER_KEYS) {
    if (before[key] !== after[key]) {
      changes.push({ key, from: before[key], to: after[key] });
    }
  }
  return changes;
}

function protectAgainstDeterministicRisk(decision, fallback) {
  if (fallback.classification === 'riskConfirmationNeeded' && fallback.confidence >= 0.9 && decision.classification !== 'riskConfirmationNeeded') {
    return normalizeTurnIntentClassification({
      ...fallback,
      source: fallback.source || 'deterministic-risk-protection'
    }, fallback);
  }
  if (
    fallback.classification === 'consequentialCommand'
    && fallback.confidence >= 0.88
    && ['sceneColor', 'sceneNavigation', 'locationTransition', 'routineCommand', 'noDirectiveAction'].includes(decision.classification)
  ) {
    return normalizeTurnIntentClassification({
      ...fallback,
      source: fallback.source || 'deterministic-command-protection'
    }, fallback);
  }
  if (
    fallback.classification === 'consequentialCommand'
    && fallback.confidence >= 0.9
    && decision.classification === 'clarificationNeeded'
    && hasDomain(fallback, [
      /\bcommand conduct\b/,
      /\bcommand fitness\b/,
      /\bbridge command fitness\b/,
      /\bcrew authority\b/,
      /\bpublicly challenge captain\b/,
      /\bphysically assault an officer\b/,
      /\breport for command duty while impaired\b/,
      /\busurp command authority\b/
    ])
  ) {
    return normalizeTurnIntentClassification({
      ...fallback,
      source: fallback.source || 'deterministic-command-conduct-protection'
    }, fallback);
  }
  return decision;
}

export function arbitrateTurnDecision(rawDecision = {}, {
  fallback = {},
  diagnostics = {},
  providerAttempted = false,
  deterministicFastPath = false
} = {}) {
  const fallbackDecision = normalizeTurnIntentClassification(fallback);
  let decision = normalizeTurnIntentClassification(rawDecision, fallbackDecision);
  const changes = [];
  let providerRejected = false;
  let rejectionReason = null;

  if (hasHiddenStateLeak(decision)) {
    providerRejected = providerAttempted === true;
    rejectionReason = 'hidden-state-leak';
    decision = fallbackDecision;
    changes.push('provider-output-rejected-hidden-state');
  }

  const protectedDecision = protectAgainstDeterministicRisk(decision, fallbackDecision);
  if (protectedDecision !== decision) {
    decision = protectedDecision;
    providerRejected = providerAttempted === true;
    rejectionReason = 'deterministic-risk-conflict';
    changes.push('deterministic-risk-protection');
  }

  const riskUpgrade = riskUpgradeClassification(decision);
  if (riskUpgrade) {
    decision = normalizeTurnIntentClassification({
      ...decision,
      classification: riskUpgrade,
      responseStrategy: responseStrategyForClassification(riskUpgrade),
      reasons: [...decision.reasons, 'Risk signals require consequential routing.']
    }, fallbackDecision);
    changes.push(`risk-upgrade:${riskUpgrade}`);
  }

  const clarification = shouldClarify(decision);
  if (clarification.clarify && decision.classification !== 'riskConfirmationNeeded') {
    decision = normalizeTurnIntentClassification({
      ...decision,
      classification: 'clarificationNeeded',
      responseStrategy: 'pause',
      reasons: [...decision.reasons, `Clarification required: ${clarification.reason}.`]
    }, fallbackDecision);
    changes.push(`clarification:${clarification.reason}`);
  }

  const workerPlanBeforeValidation = normalizeTurnWorkerPlan(decision.workerPlan);
  const workerPlanAfterValidation = validateWorkerPlan(decision);
  const workerChanges = workerPlanChanges(workerPlanBeforeValidation, workerPlanAfterValidation);
  if (workerChanges.length > 0) changes.push('worker-plan-validated');

  const finalStrategy = responseStrategyForDecision(decision);
  if (decision.responseStrategy !== finalStrategy) {
    changes.push(`response-strategy:${decision.responseStrategy}->${finalStrategy}`);
  }

  const finalDecision = normalizeTurnIntentClassification({
    ...decision,
    kind: 'directive.validatedTurnDecision',
    responseStrategy: finalStrategy,
    workerPlan: workerPlanAfterValidation
  }, fallbackDecision);
  return {
    ...finalDecision,
    kind: 'directive.validatedTurnDecision',
    diagnostics: {
      ...cloneJson(diagnostics || {}),
      providerAttempted: providerAttempted === true,
      providerRejected,
      deterministicFastPath: deterministicFastPath === true,
      arbitration: {
        status: providerRejected ? 'rejected' : (changes.length > 0 ? 'changed' : 'accepted'),
        rejectionReason,
        changes,
        clarificationReason: clarification.clarify ? clarification.reason : null,
        rawClassification: rawDecision?.classification || null,
        fallbackClassification: fallbackDecision.classification,
        workerPlanBeforeValidation,
        workerPlanAfterValidation,
        workerPlanChanges: workerChanges
      }
    }
  };
}
