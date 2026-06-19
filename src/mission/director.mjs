import { classifyAction } from '../adjudication/action-classifier.mjs';
import { checkAuthorityAndCapability } from '../adjudication/capability-validator.mjs';
import { parseIntent } from '../adjudication/intent-parser.mjs';
import { resolveAction } from '../adjudication/action-resolver.mjs';
import { validateDirectorTurn } from '../adjudication/state-delta-validator.mjs';
import { indexMissionGraph, unique } from './graph-lookup.mjs';
import { selectPressureFocus } from './pacing.mjs';
import { evaluatePhaseAdvance } from './phase-advancement.mjs';
import { buildStateDelta } from './state-delta.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function narratorCardsForTurn({ crewDataset, sceneSnapshot, intentParse }) {
  const wanted = [];
  if (sceneSnapshot?.activePhaseId === 'shuttle-rendezvous' && intentParse.primaryIntent === 'establish-arrival-tone') {
    wanted.push(
      'crew.whitaker.profile.commanding-officer',
      'crew.priya.profile.operations-coordinator',
      'crew.bronn.profile.tactical-security'
    );
  }
  if (sceneSnapshot?.activePhaseId === 'ready-room-handover' && intentParse.primaryIntent === 'complete-ready-room-handover') {
    wanted.push(
      'crew.whitaker.profile.commanding-officer',
      'crew.whitaker.voice.command-pressure',
      'crew.bronn.profile.tactical-security',
      'crew.bronn.voice.failure-conditions'
    );
  }
  if (sceneSnapshot?.activePhaseId === 'hesperus-diversion' && intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    wanted.push(
      'crew.priya.voice.dependencies-access',
      'crew.bronn.voice.failure-conditions',
      'crew.miriam.voice.human-cost',
      'crew.imani.voice.technical-debt'
    );
  }

  const cardById = new Map((crewDataset?.cards || []).map((card) => [card.id, card]));
  return wanted.filter((cardId) => {
    const card = cardById.get(cardId);
    return card?.audiences?.includes('narrator') && card?.payload?.narratorSafe === true;
  });
}

function buildDirectorResponse({ pressureFocus, intentParse }) {
  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.post-refit-shakedown-underway',
        'crew.acting-xo-handoff',
        'ship.provisional-routines',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player establishes first command tone while boarding a working ship, with consequences for whether provisional routines feel respected or replaced.'
    };
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'crew.acting-xo-handoff',
        'crew.transfer-cohort-tension',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player completes the Captain and acting-XO handoff while giving or withholding command-value signal that will shape later interpretation.'
    };
  }

  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'hesperus.no-hostile-actor',
        'hesperus.passenger-risk',
        'hesperus.inspection-fraud',
        'hesperus.plasma-injector-failing',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'arrival-schedule-margin',
        'hesperus-medical-risk',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player uses credible authority and accepts a logged delay while separating passenger safety from owner accountability. This supports a Resolve award without making the passengers carry the full cost.'
    };
  }

  return {
    usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
    usedFactIds: pressureFocus.usedFactIds,
    usedClockIds: pressureFocus.usedClockIds,
    usedPressureIds: pressureFocus.selectedPressureIds,
    primaryPressureIds: pressureFocus.primaryPressureIds,
    secondaryPressureIds: pressureFocus.secondaryPressureIds,
    commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
    focusBudget: pressureFocus.focusBudget,
    responseSummary: 'The Director selected currently ready mission structure and pressure for adjudication.'
  };
}

function buildNarratorPacket({ graphIndex, crewDataset, sceneSnapshot, outcomePacket, intentParse }) {
  const visibleFactIds = unique([
    ...(sceneSnapshot?.knownFactIds || []),
    ...(outcomePacket.revealedFactIds || [])
  ]).filter((factId) => graphIndex.facts.get(factId)?.visibility !== 'directorOnly');

  const constraints = [
    'Do not reveal hidden campaign conspiracy information.',
    'Do not expose raw relationship values or hidden clock values.'
  ];

  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    constraints.push(
      'Narrate the Breckinridge as a working ship already underway, not a ceremonial reception.',
      'Show first impressions through routine, handoff, and professional attention rather than hidden scores.'
    );
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    constraints.push(
      'Keep Whitaker measured and concise; do not make her solve the XO role for the player.',
      'Treat any stated value as future-facing continuity, not a morality score.'
    );
  }

  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    constraints.push(
      'Narrate the outcome as success with cost, not total victory.',
      'Show that the Hesperus issue is ordinary fraud and maintenance pressure, not sabotage.'
    );
  }

  return {
    sourceOutcomeId: outcomePacket.id,
    allowedFactIds: visibleFactIds,
    allowedCardIds: narratorCardsForTurn({ crewDataset, sceneSnapshot, intentParse }),
    constraints,
    rawHiddenValuesExposed: false,
    directorOnlyDataIncluded: false
  };
}

function buildCommandLogPacket({ outcomePacket, intentParse }) {
  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player boarded the Breckinridge during a working transfer rather than a ceremonial reception.',
        'The player established an initial command tone around existing routines and the acting-XO handoff.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player completed the private command handoff with Captain Whitaker and Bronn.',
        'The exchange established initial expectations for executive authority and personal command values.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    const commandProgressionConsequences = (outcomePacket.commandDecisionAwards || []).length > 0
      ? ['Resolve progression earned.']
      : ['No additional command progression earned.'];
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player transferred vulnerable passengers first.',
        'The player preserved the falsified inspection record.',
        'The player imposed formal inquiry obligations on the Hesperus owner.',
        'The Breckinridge accepted a minor delay and limited the repair to impulse-safe stabilization.'
      ],
      visibleConsequences: [
        ...commandProgressionConsequences,
        'Minor arrival delay accepted.',
        'Hesperus passengers protected.',
        'Inspection fraud preserved for formal follow-up.'
      ]
    };
  }

  return {
    sourceOutcomeId: outcomePacket.id,
    summaryInputs: [outcomePacket.summary],
    visibleConsequences: outcomePacket.costs || []
  };
}

export function runMissionDirectorTurn(input) {
  const graph = cloneJson(input.graph);
  const projection = cloneJson(input.projection);
  const crewDataset = cloneJson(input.crewDataset || {});
  const sceneSnapshot = cloneJson(input.sceneSnapshot);
  const campaignState = cloneJson(input.campaignState || projection.initialState || {});
  const graphIndex = indexMissionGraph(graph);

  const intentParse = parseIntent(sceneSnapshot);
  const actionClassification = classifyAction({ graphIndex, sceneSnapshot, intentParse });
  const authorityCapabilityCheck = checkAuthorityAndCapability({ actionClassification, intentParse, sceneSnapshot, campaignState });
  const pressureFocus = selectPressureFocus({ graph, graphIndex, sceneSnapshot, intentParse, campaignState });
  const directorResponse = buildDirectorResponse({ pressureFocus, intentParse });
  const outcomePacket = resolveAction({
    turnId: input.turnId,
    intentParse,
    actionClassification,
    authorityCapabilityCheck,
    pressureFocus,
    campaignState
  });
  const phaseAdvance = evaluatePhaseAdvance({ graph, sceneSnapshot, intentParse, outcomePacket });
  const stateDelta = buildStateDelta({ graphIndex, campaignState, outcomePacket, intentParse, authorityCapabilityCheck, phaseAdvance });
  const narratorPacket = buildNarratorPacket({ graphIndex, crewDataset, sceneSnapshot, outcomePacket, intentParse });
  const commandLogPacket = buildCommandLogPacket({ outcomePacket, intentParse });

  const turnPacket = {
    contractVersion: 1,
    turnId: input.turnId,
    graphPath: input.graphPath,
    projectionPath: input.projectionPath,
    sceneSnapshot,
    intentParse,
    actionClassification,
    authorityCapabilityCheck,
    directorResponse,
    outcomePacket,
    stateDelta,
    narratorPacket,
    commandLogPacket
  };

  const validation = validateDirectorTurn({ graphIndex, turnPacket });
  if (!validation.ok) {
    throw new Error(`Generated Mission Director turn failed validation:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
  }

  return turnPacket;
}
