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

function emptyCommandStyleDelta() {
  return {
    earnedRecordsAdd: [],
    awardedDecisionIdsAdd: []
  };
}

function arrivalCrewIntegrationValue(intentParse) {
  const signals = intentParse.signals || {};
  if (signals.immediateInspection && !signals.asksForHandoff && !signals.respectsWorkingProcess) {
    return 'blank-slate-command';
  }
  if (signals.respectsWorkingProcess || signals.asksForHandoff || signals.reportsAboard) {
    return 'deliberately-blended';
  }
  return 'unsettled';
}

function handoverWhitakerValue(intentParse) {
  const signals = intentParse.signals || {};
  if (signals.namesPersonalValue || signals.definesExecutiveAuthority) {
    return 'delegation-confidence-improved';
  }
  return 'evaluating';
}

function handoverBronnValue(intentParse) {
  const signals = intentParse.signals || {};
  if (signals.namesPersonalValue || signals.definesExecutiveAuthority || signals.asksForHandoff) {
    return 'acting-service-respected';
  }
  return 'debate-not-closed';
}

export function buildStateDelta({ graphIndex, campaignState, outcomePacket, intentParse, authorityCapabilityCheck, phaseAdvance }) {
  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    const crewStrain = getClockValue(campaignState, 'crew-integration-strain', 2);
    const integrationValue = arrivalCrewIntegrationValue(intentParse);
    const strainTarget = integrationValue === 'deliberately-blended' ? crewStrain - 1 : crewStrain + 1;

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.crew-integration', value: integrationValue }
        ],
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'crew-integration-strain',
          strainTarget,
          integrationValue === 'deliberately-blended'
            ? 'The player treats the transfer as a working handoff and reduces initial cohort strain.'
            : 'The player asserts authority before existing routines have been understood.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        descriptiveChanges: integrationValue === 'deliberately-blended'
          ? [
            'Priya notes that the player did not turn the transfer into theater.',
            'Bronn treats the first handoff as professional rather than possessive.'
          ]
          : [
            'Priya and Bronn register that the new XO may replace routines before learning why they exist.'
          ],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    const crewStrain = getClockValue(campaignState, 'crew-integration-strain', 2);
    const whitakerValue = handoverWhitakerValue(intentParse);
    const bronnValue = handoverBronnValue(intentParse);
    const strainTarget = whitakerValue === 'delegation-confidence-improved' && bronnValue === 'acting-service-respected'
      ? crewStrain - 1
      : crewStrain;

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.whitaker', value: whitakerValue },
          { id: 'prelude.bronn', value: bronnValue }
        ],
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'crew-integration-strain',
          strainTarget,
          strainTarget < crewStrain
            ? 'The command handoff gives Whitaker and Bronn usable signal and lowers integration strain.'
            : 'The handoff is complete but leaves command culture to be proven later.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        descriptiveChanges: whitakerValue === 'delegation-confidence-improved'
          ? [
            'Whitaker gains a clearer sense of how the player will use delegated authority.',
            'Bronn sees his acting-XO service acknowledged as material to the ship rather than erased by the transfer.'
          ]
          : [
            'Whitaker accepts the player keeping command philosophy guarded, but waits for behavior to establish trust.',
            'Bronn withholds judgment until the player shows whether the handoff means continuity or replacement.'
          ],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

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
      commandStyle: emptyCommandStyleDelta(),
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
      commandStyle: emptyCommandStyleDelta(),
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
