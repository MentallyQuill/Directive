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

function commandMomentFlagValue(awards) {
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
      momentId: award.id,
      summary: award.track === 'Resolve'
        ? 'The player earned Resolve by placing the Hesperus owner under formal inquiry while accepting responsibility for the delay.'
        : 'The player earned Inspiration by protecting vulnerable passengers while preserving evidence through cooperation.'
    })),
    awardedMomentIdsAdd: awards.map((award) => award.id)
  };
}

export function buildStateDelta({ graphIndex, campaignState, outcomePacket, intentParse }) {
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
        awardedMomentIdsAdd: []
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
        { id: 'prelude.command-moment-hesperus-fraud', value: commandMomentFlagValue(outcomePacket.commandMomentAwards) },
        { id: 'prelude.priya', value: 'delegation-boundaries-clear' },
        { id: 'prelude.bronn', value: 'failure-conditions-used-well' },
        { id: 'prelude.miriam', value: 'human-cost-named' },
        { id: 'prelude.imani', value: 'technical-debt-owned' }
      ]
    },
    clocks: [
      clockDelta(graphIndex, campaignState, 'arrival-schedule-margin', arrivalSchedule - 1, 'The Breckinridge accepts a minor delay.'),
      clockDelta(graphIndex, campaignState, 'hesperus-medical-risk', 0, 'Medically vulnerable passengers are transferred first.'),
      clockDelta(graphIndex, campaignState, 'technical-debt-pressure', technicalDebt, 'The repair is limited and logged instead of normalized.')
    ],
    commandStyle: buildCommandStyleDelta(outcomePacket.commandMomentAwards || []),
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
