import { classifyAction } from '../adjudication/action-classifier.mjs';
import { checkAuthorityAndCapability } from '../adjudication/capability-validator.mjs';
import { parseIntent } from '../adjudication/intent-parser.mjs';
import { resolveAction } from '../adjudication/action-resolver.mjs';
import { validateDirectorTurn } from '../adjudication/state-delta-validator.mjs';
import { indexMissionGraph, unique } from './graph-lookup.mjs';
import { selectPressureFocus } from './pacing.mjs';
import { buildStateDelta } from './state-delta.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function narratorCardsForTurn({ crewDataset, sceneSnapshot, intentParse }) {
  const wanted = [];
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
      commandMomentCandidates: pressureFocus.commandMomentCandidates,
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
    commandMomentCandidates: pressureFocus.commandMomentCandidates,
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
  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player transferred vulnerable passengers first.',
        'The player preserved the falsified inspection record.',
        'The player imposed formal inquiry obligations on the Hesperus owner.',
        'The Breckinridge accepted a minor delay and limited the repair to impulse-safe stabilization.'
      ],
      visibleConsequences: [
        'Resolve progression earned.',
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
  const stateDelta = buildStateDelta({ graphIndex, campaignState, outcomePacket, intentParse });
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
