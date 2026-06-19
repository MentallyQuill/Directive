import { classifyAction } from '../adjudication/action-classifier.mjs';
import { checkAuthorityAndCapability } from '../adjudication/capability-validator.mjs';
import { parseIntent } from '../adjudication/intent-parser.mjs';
import { resolveAction } from '../adjudication/action-resolver.mjs';
import { validateDirectorTurn } from '../adjudication/state-delta-validator.mjs';
import { indexMissionGraph, unique } from './graph-lookup.mjs';
import { selectPressureFocus } from './pacing.mjs';
import { evaluatePhaseAdvance } from './phase-advancement.mjs';
import { buildStateDelta } from './state-delta.mjs';
import {
  applySimulationModePolicyToOutcome,
  simulationModeNarratorConstraints
} from '../simulation/simulation-mode-policy.mjs';
import { runDirectorRetrieval } from '../retrieval/packet-builder.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
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

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'crew.transfer-cohort-tension',
        'ship.provisional-routines',
        'ship.combined-load-risk',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        'technical-debt-pressure',
        'arrival-schedule-margin',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player sets senior staff readiness priorities by deciding what receives time, who owns follow-up, and which risk remains explicit for the next drill.'
    };
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.fallback-command-incompatibility',
        'ship.command-network-certificate-issue',
        'ship.provisional-routines',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player turns the fallback-command drill into an executable command-continuity policy while deciding how to handle the command-network certificate limitation.'
    };
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.provisional-routines',
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
      responseSummary: 'The player uses routine senior staff contact to define how concerns, dissent, and follow-up should move through the XO.'
    };
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'hesperus.inspection-fraud',
        intentParse.signals?.preservesEscapePodData ? 'hesperus.escape-pod-subspace-data' : null,
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'arrival-schedule-margin',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player assigns persistent Hesperus follow-up obligations so the rescue has consequences without becoming a new conspiracy thread.'
    };
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.command-network-certificate-issue',
        'ship.combined-load-risk',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'arrival-schedule-margin',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player resolves the combined-load test by balancing technical debt, schedule margin, Kieran flight profile, and honest readiness reporting.'
    };
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.command-network-certificate-issue',
        'ship.combined-load-risk',
        'chapter-1.relief-convoy-distress-packet',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'arrival-schedule-margin',
        'crew-integration-strain',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player completes the final command review by setting the arrival posture and carrying committed Prelude consequences toward Chapter 1.'
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

function buildNarratorPacket({ graphIndex, retrievalRun, sceneSnapshot, outcomePacket, intentParse }) {
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

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    constraints.push(
      'Narrate the senior staff conference as disciplined prioritization, not a full consensus scene.',
      'Let one or two officers speak from department constraints; do not give every officer equal debate time.',
      'Show that an accepted risk remains tracked rather than magically solved.'
    );
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    constraints.push(
      'Narrate the fallback-command drill as a procedural stress test, not a combat emergency.',
      'Show Bronn testing failure conditions without making him a rival for command.',
      'Keep the command-network certificate issue technical and contained unless state later escalates it.'
    );
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    constraints.push(
      'Narrate focused operational contact, not a social montage or biography tour.',
      'Show only the officers directly relevant to the player action.',
      'End with a sense that the next mission pressure can interrupt routine.'
    );
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    constraints.push(
      'Narrate aftermath work as operational continuity, not a new crisis.',
      'Do not imply the Hesperus failure is connected to Pale Lantern or sabotage.',
      'Only mention escape-pod subspace data if it is in allowed facts.'
    );
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    constraints.push(
      'Narrate the combined-load fault as ordinary technical causality, not sabotage.',
      'Show whether command owns the limitation; do not make a clean pass if the outcome records a limitation.',
      'Keep Kieran flight-profile execution bounded by the committed result.'
    );
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    constraints.push(
      'Narrate Whitaker as testing the XO readiness posture, not handing out a score.',
      'Summarize only committed Prelude consequences; do not invent hidden main-campaign answers.',
      'Reveal the Relief Convoy Twelve distress packet as a transition pressure, not as solved information.'
    );
  }

  return {
    sourceOutcomeId: outcomePacket.id,
    allowedFactIds: visibleFactIds,
    allowedCardIds: retrievalRun?.packets?.narrator?.cardIds || [],
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

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player set senior staff readiness priorities for the remaining transit.',
        'The player named department ownership for follow-up work.',
        'The player carried at least one readiness risk forward explicitly instead of hiding it.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The fallback-command drill exposed incompatible emergency habits.',
        'The command-network certificate issue was identified as a real technical limitation.',
        'The player set a command-continuity policy and assigned or deferred remediation with explicit ownership.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player used transit time to establish command rhythm with senior staff.',
        'The player created expectations for how concerns, dissent, and follow-up should reach the XO.',
        'The routine command pattern will be tested by the next mission pressure.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player assigned Hesperus aftermath follow-up work.',
        'The Hesperus consequences remain ordinary rescue, repair, medical, and administrative obligations.',
        'The ship can resume the Prelude shakedown path with those obligations recorded.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player resolved the combined-load test readiness question.',
        'The decision recorded how technical debt, schedule margin, and Kieran flight-profile risk were handled.',
        'The final command review must account for the committed test status.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player completed the final command review with Captain Whitaker.',
        'The review summarized committed Prelude readiness, delay, relationship, and command-culture consequences.',
        'The Breckinridge received the Relief Convoy Twelve distress packet before formal Asterion reception.'
      ],
      visibleConsequences: outcomePacket.costs || []
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
  const baseOutcomePacket = resolveAction({
    turnId: input.turnId,
    intentParse,
    actionClassification,
    authorityCapabilityCheck,
    pressureFocus,
    campaignState
  });
  const outcomePacket = applySimulationModePolicyToOutcome({
    outcomePacket: baseOutcomePacket,
    campaignState,
    sceneSnapshot,
    intentParse
  });
  const retrievalRun = runDirectorRetrieval({
    crewDataset,
    missionGraph: graph,
    sceneSnapshot,
    campaignState,
    intentParse,
    turnId: input.turnId,
    outcomeId: outcomePacket.id
  });
  const phaseAdvance = evaluatePhaseAdvance({ graph, sceneSnapshot, intentParse, outcomePacket });
  const stateDelta = buildStateDelta({ graphIndex, campaignState, outcomePacket, intentParse, authorityCapabilityCheck, phaseAdvance });
  const narratorPacket = buildNarratorPacket({ graphIndex, retrievalRun, sceneSnapshot, outcomePacket, intentParse });
  narratorPacket.constraints = unique([
    ...(narratorPacket.constraints || []),
    ...simulationModeNarratorConstraints({ campaignState, sceneSnapshot })
  ]);
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
