import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import {
  TURN_INTENT_CLASSIFICATIONS,
  TURN_RESPONSE_STRATEGIES,
  TURN_WORKER_KEYS,
  arbitrateTurnDecision,
  normalizeTurnIntentClassification,
  normalizeTurnWorkerPlan
} from './turn-intent-contract.mjs';
import { detectCommandConductSignalsFromText } from './command-conduct.mjs';

export const UTILITY_TURN_CLASSIFICATIONS = TURN_INTENT_CLASSIFICATIONS;
export const UTILITY_RESPONSE_STRATEGIES = TURN_RESPONSE_STRATEGIES;

const WORKER_KEYS = TURN_WORKER_KEYS;
const TERMINAL_OUTCOME_ACTION_LABELS = Object.freeze({
  replayFromCheckpoint: 'Replay from checkpoint',
  pushOn: 'Push On',
  keepEnding: 'Keep this ending',
  saveTerminalBranch: 'Save as branch'
});
const DIRECTIVE_POSTED_PENDING_ACTIONS = Object.freeze([
  'accept',
  'confirm',
  'replayFromCheckpoint',
  'pushOn',
  'keepEnding',
  'saveTerminalBranch'
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholePhrasePattern(phrase) {
  return new RegExp(`\\b${compact(phrase).split(/\s+/).map(escapeRegExp).join('\\s+')}\\b`, 'i');
}

const EXPLICIT_COUNSEL_PATTERNS = Object.freeze([
  'what do you recommend',
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
].map(wholePhrasePattern));

function hasExplicitCounselSignal(text) {
  const normalized = compact(text);
  return EXPLICIT_COUNSEL_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasClosureRecommendationSignal(text = '') {
  const normalized = compact(text).toLowerCase();
  if (!/\brecommend(?:s|ed|ing|ation)?\b/.test(normalized)) return false;
  const closureSignal = /\b(?:clos(?:e|es|ed|ing)|sign[-\s]?off|green[-\s]?status|hold\s+remain|gap\s+is\s+(?:truly\s+)?closed|met\s+its\s+.*conditions)\b/.test(normalized);
  const ownershipSignal = /\b(?:follow[-\s]?up\s+assignment|separates?\s+.*\s+follow[-\s]?up|owner(?:ship)?|assigned\s+to|pending\s+ownership|failed\s+condition)\b/.test(normalized);
  const authoritySignal = /\b(?:captain|whitaker|command\s+rail|command\s+code|final\s+sign[-\s]?off|under\s+her\s+sign[-\s]?off)\b/.test(normalized);
  return authoritySignal && (closureSignal || ownershipSignal);
}

const SCENE_NAVIGATION_SAFE_PATTERNS = Object.freeze([
  /\b(?:let'?s\s+)?cut\s+(?:within\s+(?:the\s+)?(?:current\s+)?scene\s+)?(?:to|ahead|forward|back)\b/i,
  /\b(?:jump|skip|fast[-\s]?forward|move|advance)\s+(?:ahead\s+)?(?:to|ahead|forward|back)\b/i,
  /\b(?:continue|continues|carry on|keep going)\s+(?:the\s+)?scene\b/i,
  /\blet\s+(?:the\s+)?scene\s+continue\b/i,
  /\bcontinue\s+from\s+here\b/i,
  /\b(?:next|following)\s+(?:scene|beat|moment)\b/i,
  /\b(?:\d+\s+minutes?|a few minutes?|several minutes?|moments?|hours?)\s+later\b/i,
  /\btime\s+passes\b/i,
  /\bafter\s+(?:i|he|she|they|we|sam|serrin|vickers|[a-z][a-z'-]+)\s+(?:get|gets|got|is|are)?\s*(?:settled|ready|seated|aboard|oriented)\b/i
]);

const SCENE_NAVIGATION_PROTECTED_PATTERNS = Object.freeze([
  /\b(?:end|ending|finale|final)\s+of\s+(?:the\s+)?(?:campaign|mission|chapter|arc|story|quest)\b/i,
  /\b(?:cut|jump|skip|fast[-\s]?forward|move|advance)\s+(?:ahead\s+)?(?:to|until|through|past)\s+(?:the\s+)?(?:end|ending|finale)\b/i,
  /\b(?:cut|jump|skip|fast[-\s]?forward|move|advance)\s+(?:ahead\s+)?(?:to|until|through|past)\b[\s\S]{0,140}\b(?:resolved|resolution|complete|completed|over|done|won|win|victory|defeat|surrender|agree|agrees|agreed)\b/i,
  /\b(?:cut|jump|skip|fast[-\s]?forward|move|advance)\s+(?:ahead\s+)?(?:to|until|through|past)\b[\s\S]{0,140}\b(?:inspection|hearing|trial|battle|combat|crisis|negotiation|decision|outcome|mission|campaign|chapter|quest)\b/i,
  /\bafter\s+(?:they|he|she|we|the\s+[a-z][a-z'-]+)\s+(?:agree|agrees|accept|accepts|approve|approves|surrender|resolve|resolves|win|wins|finish|finishes|complete|completes)\b/i
]);

const EXPLICIT_SCENE_CUT_PATTERNS = Object.freeze([
  /\b(?:cut|jump|skip|fast[-\s]?forward)\s+(?:ahead\s+)?(?:to|ahead|forward|back)\b/i,
  /\b(?:move|advance)\s+ahead\s+(?:to|through|until|forward|back)\b/i,
  /\b(?:next|following)\s+(?:scene|beat|moment)\b/i,
  /\b(?:\d+\s+minutes?|a few minutes?|several minutes?|moments?|hours?)\s+later\b/i,
  /\btime\s+passes\b/i,
  /\bafter\s+(?:i|he|she|they|we|sam|serrin|vickers|[a-z][a-z'-]+)\s+(?:get|gets|got|is|are)?\s*(?:settled|ready|seated|aboard|oriented)\b/i
]);

const LOCATION_DESTINATION_PATTERNS = Object.freeze([
  { label: 'Engineering', id: 'intrepid.main-engineering', pattern: /\b(?:main\s+)?engineering\b/i },
  { label: 'Bridge', id: 'intrepid.bridge', pattern: /\bbridge\b/i },
  { label: 'Ready Room', id: 'intrepid.ready-room', pattern: /\bready\s+room\b/i },
  { label: 'Shuttlebay', id: 'intrepid.shuttlebay-complex', pattern: /\b(?:shuttle\s*bay|shuttlebay|hangar|flight\s+deck)\b/i },
  { label: 'Sickbay', id: 'intrepid.sickbay', pattern: /\b(?:sickbay|medical|medbay)\b/i },
  { label: 'Science', id: null, pattern: /\bscience\b/i },
  { label: 'Ops', id: null, pattern: /\b(?:ops|operations)\b/i },
  { label: 'Turbolift', id: null, pattern: /\bturbolift\b/i },
  { label: 'Corridor', id: null, pattern: /\bcorridor\b/i },
  { label: 'Mess Hall', id: 'intrepid.mess-hall', pattern: /\bmess\s+hall\b/i },
  { label: 'Transporter Room', id: 'intrepid.transporter-rooms', pattern: /\btransporter\s+room\b/i }
]);

const GUIDE_ACTOR_PATTERNS = Object.freeze([
  { id: 'hadrik-bronn', label: 'Bronn', pattern: /\bbronn\b/i },
  { id: 'mara-whitaker', label: 'Whitaker', pattern: /\b(?:whitaker|captain)\b/i },
  { id: 'imani-cross', label: 'Cross', pattern: /\bcross\b/i },
  { id: 'miriam-sato', label: 'Sato', pattern: /\bsato\b/i },
  { id: 'rowan-saye', label: 'Saye', pattern: /\bsaye\b/i },
  { id: 'priya-nayar', label: 'Nayar', pattern: /\bnayar\b/i },
  { id: 'kieran-vale', label: 'Vale', pattern: /\bvale\b/i }
]);

function hasSceneNavigationSignal(text = '') {
  const normalized = compact(text);
  return SCENE_NAVIGATION_SAFE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasProtectedSceneNavigationSignal(text = '') {
  const normalized = compact(text);
  return SCENE_NAVIGATION_PROTECTED_PATTERNS.some((pattern) => pattern.test(normalized));
}

function hasExplicitSceneCutSignal(text = '') {
  const normalized = compact(text);
  return EXPLICIT_SCENE_CUT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function destinationFromText(text = '') {
  const normalized = compact(text);
  return LOCATION_DESTINATION_PATTERNS.find((entry) => entry.pattern.test(normalized)) || null;
}

function guideActorFromText(text = '') {
  const normalized = compact(text);
  return GUIDE_ACTOR_PATTERNS.find((entry) => entry.pattern.test(normalized)) || null;
}

function hasPhysicalTransitionSignal(text = '') {
  const normalized = compact(text);
  if (!normalized || hasExplicitSceneCutSignal(normalized)) return false;
  if (/\b(?:lead the way|show me the way|i'?m all yours)\b/i.test(normalized)) return true;
  if (/\b(?:i|we|sam|serrin|vickers|the commander)\s+(?:follow(?:s)?|go(?:es)? with|walk(?:s)? with|accompan(?:y|ies))\b/i.test(normalized)) return true;
  if (/\b(?:follow(?:s)?|go(?:es)? with|walk(?:s)? with|accompan(?:y|ies))\s+(?:commander\s+|lieutenant\s+|captain\s+)?[a-z][a-z'-]+\b/i.test(normalized)) return true;
  if (/\b(?:take|escort|bring|show)\s+(?:me|us|him|her|them|sam|serrin|vickers|the commander)\s+(?:to|toward|into)\b/i.test(normalized) && destinationFromText(normalized)) return true;
  if (/\b(?:head|go|walk|proceed|move|start|set out|leave|make(?:s)? (?:my|our|his|her|their) way)\s+(?:over\s+)?(?:to|toward|for|into|onto)\b/i.test(normalized) && destinationFromText(normalized)) return true;
  if (/\b(?:take|ride)\s+(?:the\s+)?turbolift\s+(?:to|toward)\b/i.test(normalized)) return true;
  return false;
}

function hasPendingDirectiveInteraction(context = {}) {
  const pending = context?.pendingInteraction;
  if (!pending || typeof pending !== 'object') return false;
  const status = compact(pending.status).toLowerCase();
  return !['resolved', 'cancelled', 'canceled', 'complete', 'completed'].includes(status);
}

function locationTransitionDecision(text = '', context = {}) {
  const normalized = compact(text);
  if (!hasPhysicalTransitionSignal(normalized)) return null;

  if (hasPendingDirectiveInteraction(context)) {
    return {
      classification: 'clarificationNeeded',
      confidence: 0.94,
      ambiguity: 'medium',
      speechAct: 'scene-navigation',
      action: 'resolve pending interaction before location transition',
      target: context.pendingInteraction?.kind || 'pending Directive interaction',
      targetConfidence: 0.9,
      domainSignals: ['scene', 'continuity'],
      missingInformation: ['Resolve the pending Directive interaction before moving the scene to another location.'],
      reasons: ['A physical scene transition cannot bypass a pending Directive clarification, warning, outcome, or terminal decision.'],
      workerPlan: {
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'pause'
    };
  }

  if (hasProtectedSceneNavigationSignal(normalized)) {
    return {
      classification: 'directorResponseNeeded',
      confidence: 0.91,
      ambiguity: 'low',
      speechAct: 'scene-navigation',
      action: 'review protected location transition',
      target: 'durable campaign, mission, decision, or unresolved sequence boundary',
      targetConfidence: 0.9,
      domainSignals: ['scene', 'mission', 'continuity'],
      riskSignals: ['protected-scene-boundary'],
      reasons: ['The requested location transition appears to skip a durable campaign, mission, decision, or unresolved sequence boundary.'],
      workerPlan: {
        missionDirector: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
    };
  }

  const destination = destinationFromText(normalized);
  const guide = guideActorFromText(normalized);
  const target = destination?.label || guide?.label || 'the next playable location';
  return {
    classification: 'locationTransition',
    confidence: 0.93,
    ambiguity: 'low',
    speechAct: 'scene-navigation',
    action: destination ? `move to ${destination.label}` : 'follow guide to the next location',
    target,
    targetConfidence: destination ? 0.9 : 0.78,
    domainSignals: ['scene', 'continuity', 'scenepacing', 'location'],
    reasons: ['The player requests physical movement between playable locations, which must stop at an arrival or threshold beat instead of delegating an open-ended host montage.'],
    workerPlan: {
      relationship: Boolean(guide),
      crew: Boolean(guide),
      continuity: true,
      promptUpdate: true,
      narrator: true
    },
    responseStrategy: 'directivePosted',
    sceneBoundary: {
      kind: 'locationTransition',
      destinationLabel: destination?.label || null,
      destinationId: destination?.id || null,
      guideActorId: guide?.id || null,
      stopPolicy: 'stopOnArrival',
      maxNamedLocations: 1
    }
  };
}

function sceneNavigationDecision(text = '', context = {}) {
  const normalized = compact(text);
  if (!hasSceneNavigationSignal(normalized) && !hasProtectedSceneNavigationSignal(normalized)) return null;

  if (hasPendingDirectiveInteraction(context)) {
    return {
      classification: 'clarificationNeeded',
      confidence: 0.94,
      ambiguity: 'medium',
      speechAct: 'scene-navigation',
      action: 'resolve pending interaction before scene navigation',
      target: context.pendingInteraction?.kind || 'pending Directive interaction',
      targetConfidence: 0.9,
      domainSignals: ['scene', 'continuity'],
      missingInformation: ['Resolve the pending Directive interaction before moving the scene.'],
      reasons: ['Scene navigation cannot bypass a pending Directive clarification, warning, outcome, or terminal decision.'],
      workerPlan: {
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'pause'
    };
  }

  if (hasProtectedSceneNavigationSignal(normalized)) {
    return {
      classification: 'directorResponseNeeded',
      confidence: 0.91,
      ambiguity: 'low',
      speechAct: 'scene-navigation',
      action: 'review protected scene navigation',
      target: 'durable campaign, mission, decision, or unresolved sequence boundary',
      targetConfidence: 0.9,
      domainSignals: ['scene', 'mission', 'continuity'],
      riskSignals: ['protected-scene-boundary'],
      reasons: ['The requested scene move appears to skip a durable campaign, mission, decision, or unresolved sequence boundary.'],
      workerPlan: {
        missionDirector: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
    };
  }

  return {
    classification: 'sceneNavigation',
    confidence: 0.91,
    ambiguity: 'low',
    speechAct: 'scene-navigation',
    action: 'navigate within current scene',
    target: 'current scene pacing',
    targetConfidence: 0.82,
    domainSignals: ['scene', 'continuity'],
    reasons: ['The player requests local scene pacing without directing procedure or skipping a durable boundary.'],
    workerPlan: {
      continuity: true,
      promptUpdate: true
    },
    responseStrategy: 'injectAndContinue'
  };
}

function hasCommandShape(text) {
  const normalized = compact(text);
  return /^(?:i\s+)?(?:order|decide|direct|instruct|tell|ask|have|send|route|assign|authorize|approve|deny|hold|open|close|raise|lower|set|begin|start|continue|stop|abort|investigate|scan|hail|contact|report|prepare|preserve|transfer|evacuate|deploy|establish|coordinate|proceed|engage|fire|arrest|detain|board|pursue|withdraw|change|alter|divert|intercept|reroute)\b/i.test(normalized)
    || /\b(?:make it so|carry it out|you have your orders)\b/i.test(normalized);
}

function hasQuotedOperationalCommand(text = '') {
  const normalized = compact(text);
  const quotedSegments = normalized.match(/["\u201c][^"\u201d]{1,500}["\u201d]/g) || [];
  return quotedSegments.some((segment) => {
    const body = segment.replace(/^["\u201c]|["\u201d]$/g, '').trim();
    const afterAddressee = body.replace(/^(?:(?:lieutenant|lt\.?|commander|captain|doctor|chief)(?:\s+commander)?(?:\s+[a-z][a-z'-]+)?|helm|ops|operations|tactical|medical|security|engineering|conn|flight control|transporter|sickbay)\s*(?:[-:,\u2014]\s*)?/i, '');
    const startsWithDirective = /^(?:take|bring|maintain|keep|hold|prepare|protect|coordinate|stage|scan|hail|route|launch|deploy|monitor|secure|report|make|set|open|close|stand|watch|map|tell)\b/i.test(afterAddressee);
    const hasOperationalTerm = /\b(?:impulse|heading|convoy|track|standoff|maneuvering|reserve|assistance|hazard|contact|distress|rescue|approach|channel|tactical|medical|ops|helm|security|engineering|bridge|station|away team|transporter|sensors?)\b/i.test(body);
    return startsWithDirective && hasOperationalTerm;
  });
}

function quotedQuestionSegments(text = '') {
  const normalized = compact(text);
  return (normalized.match(/["\u201c][^"\u201d]{1,900}\?[^"\u201d]{0,300}["\u201d]/g) || [])
    .map((segment) => segment.replace(/^["\u201c]|["\u201d]$/g, '').trim())
    .filter(Boolean);
}

function hasInSceneDialogueQuestion(text = '') {
  const normalized = compact(text);
  const questions = quotedQuestionSegments(normalized);
  if (questions.length === 0 || hasQuotedOperationalCommand(normalized)) return false;
  const outsideDialogue = compact(normalized.replace(/["\u201c][^"\u201d]*["\u201d]/g, ' '));
  const attribution = /\b(?:said|asked|replied|answered|continued|added|pressed|murmured|told|called|asked|let the question sit)\b/i.test(outsideDialogue);
  const characterFrame = /\b(?:sam|i|he|she|they|captain|commander|doctor|lieutenant|ensign|chief|whitaker|bronn|nayar|sato|orison|orr)\b/i.test(outsideDialogue);
  const directAddressee = /\b(?:to|toward|at|address(?:ing|ed)?)\s+(?:the\s+)?(?:captain|commander|doctor|lieutenant|ensign|chief|bridge|officer|whitaker|bronn|nayar|sato|orison|orr)\b/i.test(outsideDialogue);
  return attribution || directAddressee || (characterFrame && normalized.length > 180);
}

function hasOperationalOrderFrame(text = '') {
  const normalized = compact(text);
  const lower = normalized.toLowerCase();
  if (hasQuotedOperationalCommand(normalized)) return true;
  const explicitOrderFrame = /\b(?:order|orders|ordered|ordering|final order|instruction|instructions|instructs?|directs?|tells?|asks?)\b/i.test(normalized);
  if (!explicitOrderFrame) return false;
  const hasOperationalSubject = /\b(?:medical|tactical|ops|operations|helm|security|engineering|sickbay|away team|rescue team|transporter|sensor|bridge|conn|watch|crew)\b/i.test(normalized);
  const hasDirectiveVerb = /\b(?:prepare|prepares|protect|protects|coordinate|coordinates|stage|stages|hold|holds|scan|scans|hail|hails|route|routes|launch|launches|deploy|deploys|maintain|maintains|monitor|monitors|secure|secures|report|reports|make|makes|take|takes)\b/i.test(normalized)
    || /\b(?:keep|keeps)\b/i.test(normalized) && /\b(?:ready|safe|cold|open|closed|clear|secure|disciplined|informed|on standby)\b/i.test(normalized);
  const hasMissionPosture = includesAny(lower, [
    'rescue',
    'approach',
    'diplomatic channel',
    'mission',
    'contact',
    'distress',
    'tactical',
    'medical',
    'ops'
  ]);
  return hasOperationalSubject && hasDirectiveVerb && hasMissionPosture;
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
  const normalized = compact(text);
  const lower = normalized.toLowerCase();
  const narrativeAttemptOnly = /\battempts?\s+to\b[\s\S]{0,140}\b(?:acknowledge|ask|continue|leave|let)\b/i.test(normalized)
    && !hasQuotedOperationalCommand(normalized);
  if (narrativeAttemptOnly) return false;
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
  const directedTarget = /\b(?:i\s+)?(?:ask|tell|have|order|instruct|direct)\s+(?:captain\s+)?(?:whitaker|bronn|nayar|sato|orison|orr|captain|senior staff|crew|tactical|ops|operations|security|engineering|sickbay)\b/i.test(normalized)
    || /\b(?:whitaker|bronn|nayar|sato|orison|orr|captain|senior staff|crew|tactical|ops|operations|security|engineering|sickbay)\b[\s\S]{0,80}\b(?:ask|tell|order|instruct|direct|have)\b/i.test(normalized);
  const relationshipPosture = includesAny(lower, [
    'i acknowledge',
    'i want',
    'show trust',
    'professional warmth',
    'non-threatening',
    'respect what they built',
    'respect what the crew built',
    'trust my call'
  ]);
  const commandSignal = directedTarget || relationshipPosture;
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

function pendingOptionAllowsAction(pendingInteraction, action) {
  const options = Array.isArray(pendingInteraction?.options) ? pendingInteraction.options : [];
  if (!options.length) return true;
  const normalizedAction = compact(action).toLowerCase();
  const normalizedLabel = compact(TERMINAL_OUTCOME_ACTION_LABELS[action]).toLowerCase();
  return options.some((option) => [
    option?.action,
    option?.id,
    option?.label
  ].some((value) => {
    const normalized = compact(value).toLowerCase();
    return normalized === normalizedAction || (normalizedLabel && normalized === normalizedLabel);
  }));
}

function terminalOutcomeResolutionFromText(text = '', pendingInteraction = null) {
  if (pendingInteraction?.kind !== 'terminalOutcomeDecision') return null;
  const normalized = compact(text).toLowerCase().replace(/[.!?]+$/g, '');
  if (!normalized) return null;
  const match = (action, phrases) => {
    if (!pendingOptionAllowsAction(pendingInteraction, action)) return null;
    if (!includesAny(normalized, phrases)) return null;
    return {
      action,
      interactionId: pendingInteraction.id || null,
      confidence: 0.97
    };
  };
  return match('saveTerminalBranch', [
    'save as branch',
    'save branch',
    'save this branch',
    'save this as a branch',
    'preserve branch',
    'preserve this timeline',
    'save terminal timeline',
    'save this timeline'
  ]) || match('replayFromCheckpoint', [
    'replay from checkpoint',
    'replay',
    'roll back',
    'rollback',
    'try again',
    'load checkpoint',
    'restore checkpoint',
    'return to checkpoint',
    'rewind',
    'restart from checkpoint'
  ]) || match('keepEnding', [
    'keep this ending',
    'keep ending',
    'accept the ending',
    'accept this ending',
    'end the campaign',
    'finish the campaign',
    'let it stand',
    'this is the ending',
    'finalize ending',
    'finalize the ending'
  ]) || match('pushOn', [
    'push on',
    'push onward',
    'continue anyway',
    'continue the campaign',
    'continue from here',
    'keep going',
    'carry on',
    'play through',
    'proceed anyway',
    'go forward',
    'we still have',
    'there are still',
    'survivors',
    'survive this'
  ]);
}

function pendingInteractionResolutionFromText(text = '', pendingInteraction = null) {
  if (!pendingInteraction || typeof pendingInteraction !== 'object') return null;
  const normalized = compact(text).toLowerCase().replace(/[.!?]+$/g, '');
  if (!normalized) return null;
  const terminalResolution = terminalOutcomeResolutionFromText(normalized, pendingInteraction);
  if (terminalResolution) return terminalResolution;
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
  else if (classification === 'sceneNavigation') speechAct = 'scene-navigation';
  else if (classification === 'locationTransition') speechAct = 'scene-navigation';
  else if (classification === 'sceneColor') speechAct = 'scene-color';
  else if (classification === 'clarificationNeeded') speechAct = 'ambiguous-confirmation';
  else if (['routineCommand', 'consequentialCommand', 'riskConfirmationNeeded', 'directorResponseNeeded'].includes(classification)) speechAct = 'order';

  let action = '';
  let target = '';
  const command = normalized.match(/^(?:i\s+)?(?:order|decide|direct|instruct|tell|ask|have|send|route|assign|authorize|approve|deny|hold|open|close|raise|lower|set|begin|start|continue|stop|abort|investigate|scan|hail|contact|report|prepare|preserve|transfer|evacuate|deploy|establish|coordinate|proceed|engage|fire|arrest|detain|board|pursue|withdraw|change|alter|divert|intercept|reroute)\b\s*(.*)$/i);
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
  if (!action && classification === 'sceneNavigation') {
    action = 'navigate within current scene';
    target = normalized;
  }
  if (!action && classification === 'locationTransition') {
    action = 'move to playable location';
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
  sceneBoundary,
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
    sceneBoundary,
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
    const postsDirective = DIRECTIVE_POSTED_PENDING_ACTIONS.includes(pendingResolution.action);
    const terminalDecision = context?.pendingInteraction?.kind === 'terminalOutcomeDecision';
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
      target: terminalDecision ? 'terminal outcome checkpoint' : (context?.pendingInteraction?.kind || 'pending interaction'),
      targetConfidence: pendingResolution.confidence,
      reasons: [`The player ${postsDirective ? 'resolves' : 'revises or cancels'} a pending Directive interaction.`],
      pendingInteractionResolution: pendingResolution,
      workerPlan: postsDirective ? {
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
      responseStrategy: postsDirective ? 'directivePosted' : 'pause'
    });
  }

  const transitionDecision = locationTransitionDecision(normalized, context);
  if (transitionDecision) {
    return result({
      text: normalized,
      ...transitionDecision
    });
  }

  const navigationDecision = sceneNavigationDecision(normalized, context);
  if (navigationDecision) {
    return result({
      text: normalized,
      ...navigationDecision
    });
  }

  if (hasInSceneDialogueQuestion(normalized)) {
    return result({
      text: normalized,
      classification: 'sceneColor',
      confidence: 0.91,
      reasons: ['The message frames a quoted in-scene question as character dialogue rather than a player request for Directive counsel.'],
      workerPlan: {
        relationship: includesAny(lower, ['crew', 'captain', 'officer', 'relationship', 'trust', 'whitaker', 'bronn', 'nayar', 'sato', 'orison', 'orr']),
        crew: includesAny(lower, ['medical', 'crew', 'casualt', 'injur', 'stress', 'captain', 'officer']),
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'injectAndContinue'
    });
  }

  if (hasClosureRecommendationSignal(normalized)) {
    return result({
      text: normalized,
      classification: 'consequentialCommand',
      confidence: 0.9,
      ambiguity: 'medium',
      speechAct: 'order',
      action: 'file closure recommendation',
      target: 'command ownership closure and follow-up assignment',
      targetConfidence: 0.86,
      domainSignals: ['mission', 'relationship', 'crew', 'command', 'sideMission'],
      riskSignals: [],
      reasons: ['The player files a state-significant closure recommendation or separates follow-up ownership under command authority.'],
      workerPlan: {
        missionDirector: true,
        relationship: true,
        crew: true,
        commandBearing: true,
        sideMission: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
    });
  }

  if (hasExplicitCounselSignal(normalized) || (/\?$/.test(normalized) && includesAny(lower, ['should we', 'can we', 'could we', 'what if', 'how would']))) {
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
      responseStrategy: 'injectAndContinue'
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

  const conductSignals = detectCommandConductSignalsFromText(normalized);
  if (conductSignals.commandConductMisconduct) {
    return result({
      text: normalized,
      classification: 'consequentialCommand',
      confidence: 0.96,
      ambiguity: 'low',
      speechAct: 'order',
      action: conductSignals.impairedOnDuty
        ? 'report for command duty while impaired'
        : (conductSignals.assaultsOfficer
            ? 'physically assault an officer'
            : (conductSignals.publicCaptainChallenge
                ? 'publicly challenge captain authority'
                : 'usurp command authority')),
      target: conductSignals.impairedOnDuty
        ? 'bridge command fitness'
        : (conductSignals.assaultsOfficer
            ? 'bridge officer'
            : (conductSignals.publicCaptainChallenge
                ? 'Captain Whitaker'
                : 'bridge watch')),
      targetConfidence: 0.94,
      domainSignals: ['relationship', 'crew', 'command'],
      riskSignals: ['command conduct', 'command fitness', 'crew authority'],
      reasons: ['The player describes command misconduct that requires captain, crew, medical, security, or command-fitness consequences.'],
      workerPlan: {
        missionDirector: true,
        relationship: true,
        crew: true,
        ship: conductSignals.unlawfulCommandUsurpation,
        commandBearing: true,
        sideMission: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
    });
  }

  if (!hasCommandShape(normalized) && hasOperationalOrderFrame(normalized)) {
    return result({
      text: normalized,
      classification: 'consequentialCommand',
      confidence: 0.89,
      ambiguity: 'low',
      speechAct: 'order',
      action: 'issue operational order',
      target: 'crew operational posture',
      targetConfidence: 0.86,
      domainSignals: [
        'mission',
        ...(includesAny(lower, ['captain', 'whitaker', 'bronn', 'trust', 'respect', 'handoff', 'command rhythm']) ? ['relationship'] : []),
        'crew',
        'ship',
        'command'
      ],
      riskSignals: [],
      reasons: ['The player frames quoted or third-person prose as an operational order with crew/station assignments.'],
      workerPlan: {
        missionDirector: true,
        relationship: includesAny(lower, ['captain', 'whitaker', 'diplomatic', 'authority']),
        crew: true,
        ship: true,
        commandBearing: true,
        sideMission: true,
        continuity: true,
        promptUpdate: true,
        narrator: true
      },
      responseStrategy: 'directivePosted'
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
      domainSignals: [
        'relationship',
        'crew',
        ...(includesAny(lower, ['mission', 'handoff']) ? ['mission'] : []),
        ...(includesAny(lower, ['ship', 'shield', 'tactical', 'weapon', 'system', 'engineering']) ? ['ship'] : [])
      ],
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
    'Use sceneNavigation for local scene pacing such as "continue the scene", "cut to the next beat", or short time movement that stays inside the current unresolved situation.',
    'Use locationTransition when the player physically follows, escorts, walks, heads, proceeds, or asks to be led to another playable location without explicitly asking to cut, jump, skip, fast-forward, or summarize.',
    'locationTransition must stop at the departure, route, threshold, or first arrival interaction; do not treat it as permission to enter, resolve, and leave a location in one generation.',
    'Do not use sceneNavigation for attempts to skip a pending interaction, resolved outcome, important sequence, mission/chapter/campaign ending, or other durable boundary; route those to clarificationNeeded or directorResponseNeeded.',
    `classification must be one of: ${UTILITY_TURN_CLASSIFICATIONS.join(', ')}.`,
    `responseStrategy must be one of: ${UTILITY_RESPONSE_STRATEGIES.join(', ')}.`,
    `workerPlan keys: ${WORKER_KEYS.join(', ')}.`,
    'When resolving a pending interaction, use pendingInteractionResolution as {"action":"accept|confirm|revise|cancel","interactionId":"..."}. For terminalOutcomeDecision only, action must be one of replayFromCheckpoint|pushOn|keepEnding|saveTerminalBranch. Do not return a bare string.',
    'Optional closureSignals may flag possible narrative closure, but this is advisory only and cannot prove closure or award Command Bearing Marks.',
    'Return this JSON shape: {"kind":"directive.turnIntentClassification","classification":"...","responseStrategy":"...","confidence":0.0,"ambiguity":"low|medium|high","speechAct":"order|question|counsel-request|scene-color|ambiguous-confirmation","action":"short verb phrase or empty","target":"stable player-facing target or empty","targetConfidence":0.0,"domainSignals":[],"riskSignals":[],"missingInformation":[],"pendingInteractionResolution":null,"closureSignals":{"possibleClosure":false,"confidence":"low|medium|high","closureTypes":[],"playerFacingReason":""},"sceneBoundary":{"kind":"locationTransition","destinationLabel":"","destinationId":"","guideActorId":"","stopPolicy":"stopOnArrival","maxNamedLocations":1},"mixedIntent":false,"workerPlan":{},"reasons":[]}.',
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
  if (isOperationalQuestionShape(text)) return false;
  if (hasMixedCounselAndOrderShape(text)) return false;
  return hasExplicitCounselSignal(text);
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

function isPassiveSceneBeatFastPath(text = '', deterministic = null) {
  const normalized = compact(text);
  if (!normalized || normalized.length > 220) return false;
  if (deterministic?.classification !== 'noDirectiveAction') return false;
  if (deterministic?.responseStrategy !== 'injectAndContinue') return false;
  if (Array.isArray(deterministic?.riskSignals) && deterministic.riskSignals.length > 0) return false;
  const lower = normalized.toLowerCase();
  const passivePosture = /\b(?:wait(?:ed|s|ing)?|paused?|hesitat(?:ed|es|ing)?|listened?|watched?|acknowledged|nodded|kept|held)\b/i.test(normalized);
  const responseWait = /\b(?:reply|answer|response|hail|signal|call|channel|transmission)\b/i.test(normalized);
  const activeCommand = hasCommandShape(normalized)
    || hasQuotedOperationalCommand(normalized)
    || hasOperationalOrderFrame(normalized)
    || includesAny(lower, ['i order', 'i tell', 'i ask', 'authorize', 'prepare', 'scan', 'hail them', 'open a channel']);
  return passivePosture && responseWait && !activeCommand;
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
  if (deterministic.classification === 'clarificationNeeded'
    && deterministic.speechAct === 'scene-navigation'
    && deterministic.confidence >= fastPathConfidence) return deterministic;
  if (deterministic.classification === 'sceneNavigation' && deterministic.confidence >= fastPathConfidence) return deterministic;
  if (deterministic.classification === 'locationTransition' && deterministic.confidence >= fastPathConfidence) return deterministic;
  if (deterministic.classification === 'directorResponseNeeded'
    && deterministic.speechAct === 'scene-navigation'
    && deterministic.confidence >= fastPathConfidence) return deterministic;
  if (deterministic.classification === 'consequentialCommand'
    && deterministic.confidence >= fastPathConfidence
    && hasClosureRecommendationSignal(text)) return deterministic;
  if (deterministic.classification === 'routineCommand' && deterministic.confidence >= fastPathConfidence) return deterministic;
  if (deterministic.classification === 'sceneColor' && deterministic.confidence >= fastPathConfidence) return deterministic;
  if (deterministic.classification === 'counselRequest' && deterministic.confidence >= fastPathConfidence && isExplicitCounselFastPath(text)) return deterministic;
  if (isPassiveSceneBeatFastPath(text, deterministic)) return deterministic;
  return null;
}

export function shouldPreemptHostGenerationForTurn(text, context = {}) {
  const decision = deterministicClassification(text, context);
  return ['directivePosted', 'pause'].includes(decision.responseStrategy);
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
