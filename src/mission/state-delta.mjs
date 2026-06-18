import { clampClockValue, getClockValue } from './graph-lookup.mjs';

function clockDelta(graphIndex, campaignState, id, to, reason) {
  const graphClock = graphIndex.clocks.get(id);
  const from = getClockValue(campaignState, id, graphClock?.initial || 0);
  return {
    id,
    from,
    to: clampClockValue(graphIndex, id, to),
    reason
  };
}

function commandDecisionFlagValue(awards) {
  const tracks = new Set((awards || []).map((award) => award.track));
  if (tracks.has('Inspiration') && tracks.has('Resolve')) {
    return 'inspiration-and-resolve-awarded';
  }
  if (tracks.has('Inspiration')) {
    return 'inspiration-awarded';
  }
  if (tracks.has('Resolve')) {
    return 'resolve-awarded';
  }
  return 'handled-without-progression';
}

function buildCommandStyleDelta(awards) {
  return {
    earnedRecordsAdd: awards.map((award) => ({
      track: award.track,
      decisionId: award.id,
      summary: award.track === 'Resolve'
        ? 'The player earned Resolve by placing the Hesperus owner under formal inquiry while accepting responsibility for the delay.'
        : 'The player earned Inspiration by protecting vulnerable passengers while preserving evidence through cooperation.'
    })),
    awardedDecisionIdsAdd: awards.map((award) => award.id)
  };
}

function phaseAdvanceDelta(phaseAdvance) {
  if (!phaseAdvance) {
    return {};
  }
  return {
    activePhaseIdSet: phaseAdvance.to,
    phaseSet: phaseAdvance.to,
    availableDecisionPointIdsSet: phaseAdvance.availableDecisionPointIds || [],
    phaseAdvance
  };
}

export function buildStateDelta({ graphIndex, campaignState, outcomePacket, intentParse, authorityCapabilityCheck, phaseAdvance }) {
  if (intentParse.primaryIntent === 'leave-mission-area' && authorityCapabilityCheck?.result === 'authorizedDeviationWithConditions') {
    const arrivalSchedule = getClockValue(campaignState, 'arrival-schedule-margin', 2);
    const hesperusMedical = getClockValue(campaignState, 'hesperus-medical-risk', 1);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.arrival-delay', value: 'minor' }
        ]
      },
      clocks: [
        clockDelta(graphIndex, campaignState, 'arrival-schedule-margin', arrivalSchedule - 1, 'The approved deviation consumes schedule margin.'),
        clockDelta(graphIndex, campaignState, 'hesperus-medical-risk', hesperusMedical + 1, 'The Hesperus pressure continues while the Breckinridge leaves under conditions.')
      ],
      commandStyle: {
        earnedRecordsAdd: [],
        awardedDecisionIdsAdd: []
      },
      relationships: {
        descriptiveChanges: [
          'Whitaker treats the deviation as justified only because the player provides evidence, urgency, and a return plan.'
        ],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent !== 'resolve-hesperus-with-accountability') {
    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: []
      },
      clocks: [],
      commandStyle: {
        earnedRecordsAdd: [],
        awardedDecisionIdsAdd: []
      },
      relationships: {
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  const arrivalSchedule = getClockValue(campaignState, 'arrival-schedule-margin', 2);
  const hesperusMedical = getClockValue(campaignState, 'hesperus-medical-risk', 1);
  const technicalDebt = getClockValue(campaignState, 'technical-debt-pressure', 2);

  return {
    outcomeId: outcomePacket.id,
    mission: {
      knownFactIdsAdd: outcomePacket.revealedFactIds || [],
      outcomeFlagsSet: [
        { id: 'prelude.hesperus-resolution', value: 'passengers-transferred' },
        { id: 'prelude.arrival-delay', value: 'minor' },
        { id: 'prelude.command-decision-hesperus-fraud', value: commandDecisionFlagValue(outcomePacket.commandDecisionAwards) },
        { id: 'prelude.priya', value: 'delegation-boundaries-clear' },
        { id: 'prelude.bronn', value: 'failure-conditions-used-well' },
        { id: 'prelude.miriam', value: 'human-cost-named' },
        { id: 'prelude.imani', value: 'technical-debt-owned' }
      ],
      ...phaseAdvanceDelta(phaseAdvance)
    },
    clocks: [
      clockDelta(graphIndex, campaignState, 'arrival-schedule-margin', arrivalSchedule - 1, 'The Breckinridge accepts a minor delay.'),
      clockDelta(graphIndex, campaignState, 'hesperus-medical-risk', 0, 'Medically vulnerable passengers are transferred first.'),
      clockDelta(graphIndex, campaignState, 'technical-debt-pressure', technicalDebt, 'The repair is limited and logged instead of normalized.')
    ],
    commandStyle: buildCommandStyleDelta(outcomePacket.commandDecisionAwards || []),
    relationships: {
      descriptiveChanges: [
        'Priya gains confidence that informal and formal channels will not be blurred without record.',
        'Bronn treats the containment posture as useful rather than performative.',
        'Miriam sees passenger risk named before administrative convenience.',
        'Imani sees technical limits recorded rather than softened.'
      ],
      rawValuesHidden: true
    },
    turnLedger: {
      appendOutcomeId: outcomePacket.id,
      swipeRerollForbidden: true
    }
  };
}
