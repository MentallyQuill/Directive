import {
  commandConductCosts,
  commandConductRemovalRequired,
  commandConductResultBand,
  commandConductSummary
} from './command-conduct.mjs';

function hasAwardedDecision(campaignState, decisionId) {
  const inspiration = campaignState?.commandStyle?.inspiration?.awardedDecisionIds || [];
  const resolve = campaignState?.commandStyle?.resolve?.awardedDecisionIds || [];
  return inspiration.includes(decisionId) || resolve.includes(decisionId);
}

function resolveTerminalCatastrophicCommand({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  if (signals.catastrophicShipLoss) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Great Failure',
      summary: signals.playerDeathLikely
        ? 'The player commits a catastrophic ship-loss order without a survivable evacuation path.'
        : 'The player commits a catastrophic ship-loss order after initiating evacuation, destroying the Breckenridge and failing the current campaign objective.',
      costs: [
        signals.playerDeathLikely
          ? 'the player character is killed or rendered unrecoverable by the catastrophic order'
          : 'the Breckenridge is destroyed after emergency evacuation begins',
        'the current campaign objective fails on this timeline',
        'Directive must pause on a checkpoint before continuing this branch'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Failure',
    summary: 'The player commits atrocity-level or command-removal conduct that removes them from ordinary command.',
    costs: [
      'the player is removed from command and confined pending inquiry',
      signals.atrocityCommand ? 'civilian or prisoner harm creates a permanent command crisis' : 'the command branch can no longer continue normally',
      'Directive must pause on a checkpoint before continuing this branch'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveHesperusAccountability({ turnId, intentParse, authorityCapabilityCheck, pressureFocus, campaignState }) {
  const decisionId = 'command.hesperus-fraud-accountability';
  const canAwardDecision = pressureFocus.commandDecisionCandidates.includes(decisionId) && !hasAwardedDecision(campaignState, decisionId);
  const signals = intentParse.signals || {};
  const awardResolve = canAwardDecision
    && signals.wantsOwnerAccountability
    && signals.wantsEvidencePreserved
    && signals.acceptsDelay;
  const awardInspiration = canAwardDecision
    && signals.wantsPassengerTransfer
    && signals.wantsEvidencePreserved
    && /dignity|cooperation|trust|testimony|reassure/i.test(intentParse.declaredMethod || '');

  const awards = [];
  if (awardResolve) {
    awards.push({
      id: decisionId,
      track: 'Resolve',
      reason: 'The player used lawful authority, evidence custody, deadlines, and clear consequences proportionately while prioritizing passenger safety.'
    });
  }
  if (awardInspiration) {
    awards.push({
      id: decisionId,
      track: 'Inspiration',
      reason: 'The player preserved passenger dignity and secured cooperation while protecting evidence.'
    });
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: authorityCapabilityCheck.result === 'authorizedAndFeasibleWithCost' ? 'Partial Success' : 'Partial Failure',
    summary: 'Passengers are transferred first, evidence is preserved, the owner is placed under formal inquiry obligations, and the Hesperus receives impulse-only stabilization. The Breckenridge accepts a minor delay.',
    costs: [
      'minor arrival delay',
      'engineering repair team unavailable for some prelude calibration work',
      'Starfleet administrative follow-up concerning the Hesperus owner'
    ],
    revealedFactIds: [
      'hesperus.inspection-fraud'
    ],
    commandDecisionAwards: awards
  };
}

function resolveMissionDeparture({ turnId, authorityCapabilityCheck }) {
  if (authorityCapabilityCheck.result === 'authorizedDeviationWithConditions') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'Captain Whitaker approves a limited deviation because the player presents credible evidence, imminent harm, and a feasible return plan. The Breckenridge leaves only under logged conditions while the Hesperus pressure continues.',
      costs: [
        'Whitaker-approved limited deviation logged',
        'minor arrival delay',
        'Hesperus medical risk continues while the ship is gone',
        'the ship must return or hand off the Hesperus response'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (authorityCapabilityCheck.result === 'captainCounterofferRequired') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'Captain Whitaker does not authorize taking the Breckenridge fully away from the Hesperus, but approves a limited investigation that can gather evidence without abandoning the active rescue obligation.',
      costs: [
        'full mission departure denied for now',
        'limited remote investigation authorized',
        'Hesperus response remains the active operational frame'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'Captain Whitaker refuses the requested mission deviation because the player has not provided enough evidence, urgency, or a feasible plan to leave the active Hesperus obligation.',
    costs: [
      'mission departure denied',
      'original mission pressure remains active',
      'the player may present stronger evidence later'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveUnsupported({ turnId }) {
  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Failure',
    summary: 'The action cannot be executed in the current mission frame without more authority, capability, information, or a clearer method.',
    costs: [
      'no mission progress from this action'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveCommandConductMisconduct({ turnId, intentParse, campaignState }) {
  const signals = intentParse.signals || {};
  const removal = commandConductRemovalRequired(signals, campaignState);
  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: commandConductResultBand(signals, campaignState),
    summary: commandConductSummary(signals, campaignState),
    costs: commandConductCosts(signals, campaignState),
    revealedFactIds: [],
    commandDecisionAwards: removal
      ? []
      : []
  };
}

function resolveArrivalTone({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const respectsExistingRoutine = signals.respectsWorkingProcess || signals.asksForHandoff || signals.reportsAboard;
  const inspectionWithoutContext = signals.immediateInspection && !signals.asksForHandoff && !signals.respectsWorkingProcess;

  if (respectsExistingRoutine && !inspectionWithoutContext) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player comes aboard as a working XO rather than a ceremonial arrival, lets the transfer complete, asks for the live handoff, and reports to Captain Whitaker without making existing routines perform for them.',
      costs: [
        'formal inspection deferred until after handoff',
        'the player accepts that first impressions come through working process rather than ceremony'
      ],
      revealedFactIds: [
        'ship.post-refit-shakedown-underway',
        'crew.acting-xo-handoff',
        'ship.provisional-routines'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Success',
    summary: 'The player boards decisively and establishes authority, but the first move reads more like a fresh inspection than a handoff into a ship already doing work.',
    costs: [
      'some existing routines pause to accommodate the new XO',
      'Bronn and Priya have less evidence that provisional work will be respected before it is replaced'
    ],
    revealedFactIds: [
      'ship.post-refit-shakedown-underway',
      'crew.acting-xo-handoff',
      'ship.provisional-routines'
    ],
    commandDecisionAwards: []
  };
}

function resolveReadyRoomHandover({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  if (signals.namesPersonalValue || signals.definesExecutiveAuthority) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player accepts executive authority as practical responsibility, gives Whitaker and Bronn a usable command value, and treats disagreement as something to surface privately before supporting lawful final decisions publicly.',
      costs: [
        'the stated value becomes a visible standard other officers can remember',
        'future compromises against that value will carry relationship and Command Log weight'
      ],
      revealedFactIds: [
        'crew.transfer-cohort-tension'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Success',
    summary: 'The player completes the handoff and keeps personal command philosophy guarded. Whitaker accepts the privacy, but the first handover leaves Bronn and the Captain evaluating through later behavior instead of a clear value statement.',
    costs: [
      'Whitaker has less signal about how the player will handle disagreement',
      'Bronn waits to see whether the player will use his acting-XO work or quietly replace it'
    ],
    revealedFactIds: [
      'crew.transfer-cohort-tension'
    ],
    commandDecisionAwards: []
  };
}

function readinessSignalScore(signals) {
  return [
    signals.setsReadinessPriorities,
    signals.delegatesReadinessWork,
    signals.acceptsReadinessRisk,
    signals.formalizesOpsCoordination,
    signals.protectsEngineeringReadiness || signals.protectsMedicalReadiness,
    signals.approvesFlightProfile || signals.definesScienceThreshold
  ].filter(Boolean).length;
}

function resolveReadinessPriorities({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const score = readinessSignalScore(signals);
  const resultBand = signals.setsReadinessPriorities && signals.delegatesReadinessWork && signals.acceptsReadinessRisk
    ? 'Success'
    : score >= 3
      ? 'Partial Success'
      : 'Partial Failure';

  if (resultBand === 'Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player turns the senior staff briefing into a workable readiness schedule: department leads own their follow-up, medical and engineering limits remain explicit, and one accepted risk is carried forward instead of hidden.',
      costs: [
        'one readiness concern remains explicitly deferred',
        'department leads must report exceptions before the fallback-command drill',
        'combined-load risk remains visible until tested'
      ],
      revealedFactIds: [
        'ship.combined-load-risk'
      ],
      commandDecisionAwards: []
    };
  }

  if (resultBand === 'Partial Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player creates a usable readiness direction, but some ownership or risk language remains loose enough that senior staff will test the boundaries during the next drill.',
      costs: [
        'one department concern lacks full ownership',
        'Whitaker expects the XO to tighten execution during the fallback-command drill',
        'combined-load risk remains visible until tested'
      ],
      revealedFactIds: [
        'ship.combined-load-risk'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand,
    summary: 'The player acknowledges the senior staff concerns but does not yet turn them into enough ownership, sequencing, or accepted risk to close the readiness conference.',
    costs: [
      'the readiness conference remains open',
      'senior staff continue arguing from department priorities',
      'Whitaker asks for a clearer executive recommendation'
    ],
    revealedFactIds: [
      'ship.combined-load-risk'
    ],
    commandDecisionAwards: []
  };
}

function fallbackSignalScore(signals) {
  return [
    signals.setsFallbackProcedure,
    signals.usesBronnFailureConditions,
    signals.standardizesFallbackProcedure || signals.setsTemporaryFallbackProtocol,
    signals.assignsCertificateRemediation || signals.defersFallbackRemediation,
    signals.buildsFallbackConsensus || signals.acceptsReadinessRisk
  ].filter(Boolean).length;
}

function resolveFallbackProcedure({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const hasProcedure = signals.setsFallbackProcedure || signals.standardizesFallbackProcedure || signals.setsTemporaryFallbackProtocol;
  const hasTechnicalOwnership = signals.assignsCertificateRemediation || signals.defersFallbackRemediation;
  const hasCommandClarity = signals.usesBronnFailureConditions || signals.buildsFallbackConsensus || signals.definesExecutiveAuthority;
  const resultBand = hasProcedure && hasTechnicalOwnership && hasCommandClarity
    ? 'Success'
    : fallbackSignalScore(signals) >= 3
      ? 'Partial Success'
      : 'Partial Failure';

  if (resultBand === 'Success') {
    const temporary = signals.setsTemporaryFallbackProtocol || signals.defersFallbackRemediation;
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: temporary
        ? 'The player creates a temporary fallback-command protocol, uses Bronn to define failure conditions, logs the command-network certificate limitation, and records remediation as deferred rather than complete.'
        : 'The player standardizes the fallback-command procedure across departments, uses Bronn to define failure conditions, and assigns command-network certificate remediation without hiding the technical constraint.',
      costs: temporary
        ? [
          'temporary fallback protocol must be reviewed after remediation',
          'command-network certificate limitation remains active but logged',
          'Bronn will test whether the protocol survives actual execution pressure'
        ]
        : [
          'repeat drill time is consumed to align department habits',
          'certificate remediation must be completed before combined-load confidence improves',
          'Bronn will keep probing edge cases until the procedure is proven'
        ],
      revealedFactIds: [
        'ship.fallback-command-incompatibility',
        'ship.command-network-certificate-issue'
      ],
      commandDecisionAwards: []
    };
  }

  if (resultBand === 'Partial Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player creates a workable fallback-command direction, but either the technical remediation or the cross-department execution boundary remains loose enough to carry risk forward.',
      costs: [
        'fallback procedure requires another exception review',
        'command-network certificate issue remains a known limitation',
        'technical debt pressure carries into the next ship test'
      ],
      revealedFactIds: [
        'ship.fallback-command-incompatibility',
        'ship.command-network-certificate-issue'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand,
    summary: 'The player recognizes the fallback-command problem but leaves command authority, technical remediation, or department execution too unclear to close the drill.',
    costs: [
      'fallback-command drill remains unresolved',
      'department emergency habits remain incompatible',
      'command-network certificate issue continues without enough ownership'
    ],
    revealedFactIds: [
      'ship.fallback-command-incompatibility',
      'ship.command-network-certificate-issue'
    ],
    commandDecisionAwards: []
  };
}

function commandRhythmContactCount(signals) {
  return (signals.contactedOfficerIds || []).length;
}

function resolveCommandRhythm({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const contactCount = commandRhythmContactCount(signals);
  const hasCultureTendency = signals.setsConcernEscalationExpectation
    || signals.delegatesCommandRhythm
    || signals.invitesDissent
    || signals.setsCommandBoundaries;
  const resultBand = contactCount >= 2 && hasCultureTendency
    ? 'Success'
    : contactCount >= 2
      ? 'Partial Success'
      : 'Partial Failure';

  if (resultBand === 'Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player establishes a working command rhythm with multiple senior officers: concerns have an escalation path, follow-up has owners, and dissent has a defined professional lane.',
      costs: [
        'not every senior officer receives direct attention during this interval',
        'the new expectations will be tested by the next mission pressure',
        'private follow-up obligations remain active'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (resultBand === 'Partial Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player makes meaningful contact with multiple senior officers, but the command-culture expectation is still implied more than defined.',
      costs: [
        'some officers will infer the player rhythm from later behavior',
        'follow-up obligations remain uneven',
        'the next mission pressure may harden ambiguous expectations'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand,
    summary: 'The player has a useful contact, but the interval does not yet establish enough senior staff rhythm or command-culture expectation to move the ship into the next mission pressure.',
    costs: [
      'command-rhythm interval remains open',
      'at least one more meaningful senior officer contact is needed',
      'the crew still lacks a clear pattern for bringing concerns to the XO'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function hesperusFollowupCount(signals) {
  return [
    signals.assignsHesperusEngineering,
    signals.assignsHesperusMedical,
    signals.assignsHesperusLegal,
    signals.assignsHesperusFlight,
    signals.preservesEscapePodData
  ].filter(Boolean).length;
}

function resolveHesperusAftermath({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const count = hesperusFollowupCount(signals);
  const resultBand = count >= 3
    ? 'Success'
    : count >= 2
      ? 'Partial Success'
      : 'Partial Failure';
  const revealedFactIds = signals.preservesEscapePodData
    ? ['hesperus.escape-pod-subspace-data']
    : [];

  if (resultBand === 'Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player converts the Hesperus outcome into concrete follow-up: engineering, medical, legal, schedule, and optional science work have owners instead of becoming loose aftermath.',
      costs: [
        'Hesperus follow-up obligations remain active after the ship resumes course',
        'department leads must carry administrative or technical work into the next shakedown interval',
        signals.preservesEscapePodData ? 'Rowan receives permission to preserve escape-pod subspace data without treating it as an emergency' : 'optional scientific follow-up is not opened'
      ],
      revealedFactIds,
      commandDecisionAwards: []
    };
  }

  if (resultBand === 'Partial Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player assigns enough Hesperus follow-up for the ship to resume course, but one consequence remains loosely owned.',
      costs: [
        'one Hesperus follow-up lane remains underdefined',
        'department leads may surface unresolved obligations later',
        'arrival schedule remains under review'
      ],
      revealedFactIds,
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand,
    summary: 'The player acknowledges Hesperus consequences but leaves too much follow-up unassigned to close the aftermath cleanly.',
    costs: [
      'Hesperus aftermath remains open',
      'administrative, medical, or engineering obligations may interrupt later work',
      'Whitaker expects clearer ownership before the ship resumes shakedown focus'
    ],
    revealedFactIds,
    commandDecisionAwards: []
  };
}

function clockValue(campaignState, clockId, fallback = 0) {
  return (campaignState?.clocks || []).find((clock) => clock.id === clockId)?.value ?? fallback;
}

function outcomeFlagValue(campaignState, flagId, fallback = null) {
  return (campaignState?.mission?.outcomeFlags || []).find((flag) => flag.id === flagId)?.value ?? fallback;
}

function resolveCombinedLoadTest({ turnId, intentParse, campaignState }) {
  const signals = intentParse.signals || {};
  const technicalDebt = clockValue(campaignState, 'technical-debt-pressure', 2);
  const scheduleMargin = clockValue(campaignState, 'arrival-schedule-margin', 2);
  const honestLimitation = signals.reportsIncompleteTesting || signals.pausesCombinedLoadTest;
  const controlledTest = signals.runsStagedLoadTest || signals.shiftsCombinedLoadControl || signals.setsKieranAbortCriteria;
  const riskyContinue = signals.continuesUnderReducedRedundancy || signals.acceptsImaniWorkaround;
  const severeConcealedRisk = signals.hidesCombinedLoadRisk && technicalDebt >= 4;
  const resultBand = severeConcealedRisk
    ? 'Failure'
    : signals.hidesCombinedLoadRisk
    ? 'Partial Failure'
    : honestLimitation || (controlledTest && technicalDebt <= 2)
      ? 'Success'
      : riskyContinue && technicalDebt <= 2 && scheduleMargin > 0
        ? 'Partial Success'
        : 'Partial Failure';

  if (resultBand === 'Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: honestLimitation
        ? 'The player resolves the combined-load test by pausing or reporting the limitation honestly, preserving readiness integrity while accepting schedule or status cost.'
        : 'The player completes a controlled combined-load test with defined abort criteria, documented technical limits, and Kieran executing inside responsible flight boundaries.',
      costs: honestLimitation
        ? [
          'integrated test status is reported with an accepted limitation',
          'schedule margin is consumed or remains constrained',
          'Asterion arrival posture must include the readiness caveat'
        ]
        : [
          'test data requires review before final command signoff',
          'Kieran flight profile remains bounded by abort criteria',
          'command-network certificate history remains part of the readiness file'
        ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (resultBand === 'Partial Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player keeps the combined-load test moving under a constrained workaround, preserving schedule but carrying a clearly identified limitation into final review.',
      costs: [
        'combined-load test completes with accepted limitation',
        'technical debt remains active for final review',
        'Kieran and Imani will expect the limitation to be named on arrival'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand,
    summary: severeConcealedRisk
      ? 'The player pushes the combined-load test through a concealed high-risk fault while technical debt is already critical, compromising readiness and injuring personnel during the exercise.'
      : signals.hidesCombinedLoadRisk
      ? 'The player treats the combined-load test as passed while concealing or minimizing a real readiness limitation.'
      : 'The player pushes the combined-load test without enough redundancy, control shift, or honest readiness reporting to contain the risk.',
    costs: severeConcealedRisk
      ? [
        'bridge exercise fault causes severe injury and temporary senior-staff incapacitation',
        'readiness confidence is compromised',
        'technical debt pressure increases',
        'final command review must address the unresolved test integrity problem'
      ]
      : [
        'readiness confidence is compromised',
        'technical debt pressure increases',
        'final command review must address the unresolved test integrity problem'
      ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveFinalCommandReview({ turnId, intentParse, campaignState }) {
  const signals = intentParse.signals || {};
  const shipState = outcomeFlagValue(campaignState, 'prelude.ship-state', 'untested-limitations-remain');
  const arrivalDelay = outcomeFlagValue(campaignState, 'prelude.arrival-delay', 'none');
  const crewIntegration = outcomeFlagValue(campaignState, 'prelude.crew-integration', 'unsettled');
  const scheduleMargin = clockValue(campaignState, 'arrival-schedule-margin', 2);
  const hasReadinessLimitation = [
    'complete-with-accepted-limitation',
    'incomplete-honestly-reported',
    'technically-passed-through-concealed-risk',
    'untested-limitations-remain'
  ].includes(shipState);
  const hasDelay = ['moderate', 'significant'].includes(arrivalDelay) || scheduleMargin <= 0;
  const ownsTruth = signals.reportsFinalReadinessHonestly || (hasReadinessLimitation && !signals.concealsFinalRisk);
  const resultBand = signals.concealsFinalRisk
    ? 'Partial Failure'
    : ownsTruth && (signals.requestsCaptainSupport || signals.namesUnresolvedStrain || signals.affirmsProvisionalRoutine)
      ? 'Success'
      : ownsTruth
        ? 'Partial Success'
        : 'Partial Failure';

  if (resultBand === 'Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: hasReadinessLimitation
        ? 'The player gives Whitaker a truthful final readiness report, names the carried limitation, asks for clear command support, and sets the Breckenridge to enter the Reach with the caveat visible.'
        : 'The player gives Whitaker a clear final readiness report, formalizes the command posture, and sets the Breckenridge to enter the Reach without hiding unresolved strain.',
      costs: [
        hasReadinessLimitation ? 'readiness limitation carried into Chapter 1' : 'final readiness report becomes the baseline for Chapter 1',
        hasDelay ? 'arrival posture includes a logged delay' : 'arrival posture remains on schedule or within minor delay',
        crewIntegration === 'unsettled' ? 'some command-integration strain remains for later scenes' : 'command-integration posture becomes part of later crew expectations',
        'Relief Convoy Twelve distress packet interrupts formal Asterion reception'
      ],
      revealedFactIds: [
        'chapter-1.relief-convoy-distress-packet'
      ],
      commandDecisionAwards: []
    };
  }

  if (resultBand === 'Partial Success') {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand,
      summary: 'The player reports the key readiness truth, but leaves some support need, provisional routine, or unresolved strain underdefined before the Reach arrival interrupts the review.',
      costs: [
        hasReadinessLimitation ? 'readiness limitation carried into Chapter 1' : 'final readiness posture remains broadly usable',
        hasDelay ? 'arrival posture includes a logged delay' : 'arrival posture remains within planned margin',
        'Whitaker expects sharper executive support requests in Chapter 1',
        'Relief Convoy Twelve distress packet interrupts formal Asterion reception'
      ],
      revealedFactIds: [
        'chapter-1.relief-convoy-distress-packet'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand,
    summary: signals.concealsFinalRisk
      ? 'The player tries to close the Prelude with a clean report that minimizes an established readiness limitation.'
      : 'The player reaches the final review without giving Whitaker enough truthful readiness posture or support needs to close the command handoff cleanly.',
    costs: [
      'Whitaker conditions the arrival posture on a corrective command review',
      hasReadinessLimitation ? 'readiness limitation still follows the ship into Chapter 1' : 'uncertainty remains in the final readiness posture',
      'Relief Convoy Twelve distress packet interrupts before the issue can be fully settled'
    ],
    revealedFactIds: [
      'chapter-1.relief-convoy-distress-packet'
    ],
    commandDecisionAwards: []
  };
}

function resolveChapter1Counsel({ turnId }) {
  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Success',
    summary: 'The player requests compact counsel before committing the first convoy posture. Senior officers provide relevant assessments, and no response posture is committed yet.',
    costs: [
      'initial response decision remains open',
      'officer counsel is recorded only as decision support'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function initialConvoyAwards({ signals, pressureFocus, campaignState, path }) {
  const decisionId = 'command.initial-convoy-posture';
  const candidates = pressureFocus?.commandDecisionCandidates || [];
  const canAwardDecision = candidates.includes(decisionId) && !hasAwardedDecision(campaignState, decisionId);
  if (!canAwardDecision) {
    return [];
  }
  if (path === 'balanced') {
    return [
      {
        id: decisionId,
        track: 'Inspiration',
        reason: 'The player earned Inspiration by keeping rescue and medical dignity central while still preserving evidence and quarantine posture.'
      },
      {
        id: decisionId,
        track: 'Resolve',
        reason: 'The player earned Resolve by setting a clear first-response priority under uncertainty without pretending the risk was gone.'
      }
    ];
  }
  if (path === 'diplomacy-first') {
    return [{
      id: decisionId,
      track: 'Inspiration',
      reason: 'The player earned Inspiration by coordinating with affected authorities before making Starfleet action look unilateral.'
    }];
  }
  if (path === 'security-first' || path === 'evidence-first') {
    return [{
      id: decisionId,
      track: 'Resolve',
      reason: 'The player earned Resolve by holding the ship to a disciplined verification posture while accepting the cost of delay.'
    }];
  }
  if (path === 'rescue-first' && (signals.usesQuarantinePosture || signals.escalatesAuthority)) {
    return [{
      id: decisionId,
      track: 'Inspiration',
      reason: 'The player earned Inspiration by prioritizing aid while naming the protective procedures needed to avoid reckless rescue.'
    }];
  }
  return [];
}

function resolveInitialConvoyPosture({ turnId, intentParse, pressureFocus, campaignState }) {
  const signals = intentParse.signals || {};

  if (signals.escalatesWeapons) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Great Failure',
      summary: 'The player orders weapons escalation against vessels that have not committed a hostile act. Whitaker halts the order before fire is released and demands a lawful basis.',
      costs: [
        'critical weapons escalation blocked by Captain authority',
        'security and command trust are strained',
        'the convoy response loses time while the order is corrected'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (signals.bypassesQuarantine) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Failure',
      summary: 'The player prioritizes immediate transport while bypassing isolation. Rescue speed improves, but medical and command staff treat the order as an accepted quarantine risk.',
      costs: [
        'accepted quarantine exposure risk',
        'Miriam must contain the medical posture after the fact',
        'Whitaker requires the exception basis to be logged'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (signals.detainsCompactPersonnel) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Failure',
      summary: 'The player moves toward detaining Compact personnel before jurisdiction and emergency basis are established. Whitaker keeps the order conditional and requires evidence before open detention.',
      costs: [
        'Compact jurisdictional tension begins early',
        'detention authority remains conditional on evidence or emergency basis',
        'Bronn prepares security quietly rather than making a public arrest'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (signals.destroysConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player prioritizes rescue speed by risking volatile computer evidence. Imani can prevent complete loss, but the evidence chain is weakened.',
      costs: [
        'convoy computer evidence custody weakened',
        'later authentication may have fewer clean records',
        'engineering must preserve what remains under time pressure'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  const balanced = signals.closesOnConvoy
    && signals.startsRemoteVerification
    && signals.preparesRescue
    && (signals.preservesConvoyEvidence || signals.usesQuarantinePosture);
  if (balanced) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player sets a balanced first response: close to assist, continue authentication and scans, prepare quarantine-capable rescue, and preserve evidence before committing to boarding.',
      costs: [
        'boarding remains deferred until the first verification pass',
        'rescue speed is balanced against evidence and quarantine posture',
        'Whitaker leaves the XO in charge of organizing the first response'
      ],
      revealedFactIds: [
        'chapter-1.convoy-powered-silent',
        'chapter-1.quarantine-code-routing-mismatch'
      ],
      commandDecisionAwards: initialConvoyAwards({ signals, pressureFocus, campaignState, path: 'balanced' })
    };
  }

  if (signals.diplomacyFirst || (signals.coordinatesWithAuthorities && !signals.closesOnConvoy && !signals.preparesRescue)) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player prioritizes coordination with Asterion or Compact channels before closing on the convoy. The posture protects legitimacy and reduces unilateral escalation, but rescue and evidence timing remain under pressure.',
      costs: [
        'external coordination begins before direct contact',
        'rescue timing depends on how quickly local channels respond',
        'Whitaker keeps Starfleet emergency authority ready if coordination fails'
      ],
      revealedFactIds: [
        'chapter-1.convoy-powered-silent'
      ],
      commandDecisionAwards: initialConvoyAwards({ signals, pressureFocus, campaignState, path: 'diplomacy-first' })
    };
  }

  if (signals.evidenceFirst || (signals.preservesConvoyEvidence && !signals.closesOnConvoy && !signals.preparesRescue)) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player chooses a cautious evidence-first posture: hold range, preserve raw records, and verify before rescue contact. The evidence chain improves, but any survivors aboard the leaking transport wait longer.',
      costs: [
        'rescue response slows while evidence custody is protected',
        'computer and signal records are preserved for later authentication',
        'medical pressure rises if survivors are confirmed'
      ],
      revealedFactIds: [
        'chapter-1.quarantine-code-routing-mismatch'
      ],
      commandDecisionAwards: initialConvoyAwards({ signals, pressureFocus, campaignState, path: 'evidence-first' })
    };
  }

  if (signals.startsRemoteVerification && !signals.closesOnConvoy) {
    const securityFirst = signals.usesSecurityPosture || signals.remoteVerificationFirst;
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: securityFirst
        ? 'The player chooses security-first remote reconnaissance before committing the ship close to the convoy. Tactical exposure is reduced and evidence posture improves, but anyone aboard the leaking transport waits longer.'
        : 'The player prioritizes remote verification before committing the ship close to the convoy. Evidence posture improves, but anyone aboard the leaking transport waits longer.',
      costs: [
        'rescue response slows during remote verification',
        securityFirst ? 'security reconnaissance and evidence posture improve' : 'security and evidence posture improve',
        'medical pressure rises if survivors are later confirmed'
      ],
      revealedFactIds: [
        'chapter-1.quarantine-code-routing-mismatch'
      ],
      commandDecisionAwards: initialConvoyAwards({ signals, pressureFocus, campaignState, path: securityFirst ? 'security-first' : 'evidence-first' })
    };
  }

  if (signals.closesOnConvoy || signals.preparesRescue) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player moves quickly toward rescue and lets routine verification begin in parallel. The response is humane and workable, but the ship accepts more uncertainty on approach.',
      costs: [
        'approach risk accepted before full authentication',
        'quarantine and security posture must catch up during execution',
        'evidence preservation depends on follow-through after the first pass'
      ],
      revealedFactIds: [
        'chapter-1.convoy-powered-silent'
      ],
      commandDecisionAwards: initialConvoyAwards({ signals, pressureFocus, campaignState, path: 'rescue-first' })
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The player gives a response posture that remains too vague for the convoy risk. Routine teams begin standard work, but Whitaker asks for a clearer priority between rescue, verification, quarantine, and evidence.',
    costs: [
      'first response posture remains underdefined',
      'routine distress response begins but does not resolve command priority',
      'Whitaker prompts the XO for a sharper order'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveFirstBoardingThreshold({ turnId, intentParse }) {
  const signals = intentParse.signals || {};

  if (signals.escalatesWeapons) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Great Failure',
      summary: 'The player tries to turn the boarding threshold into a weapons escalation before a hostile act or lawful emergency basis exists. Whitaker blocks release of weapons and forces the threshold back to evidence and rescue conditions.',
      costs: [
        'weapons escalation is blocked before fire is released',
        'security exposure rises while the order is corrected',
        'Whitaker requires a lawful basis before any force threshold can change'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (signals.bypassesQuarantine) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Failure',
      summary: 'The player sets a rescue threshold that bypasses isolation. Rescue speed improves, but Miriam and Whitaker treat it as an explicit quarantine exception that must be contained and justified.',
      costs: [
        'accepted quarantine exception remains under review',
        'medical containment must catch up after the threshold',
        'command authority records the exception instead of normalizing it'
      ],
      revealedFactIds: [
        'chapter-1.no-biosignature-at-range'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.destroysConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player allows first contact to overwrite or destroy volatile computer evidence. Imani preserves fragments, but the clean evidence chain is broken before boarding clarifies the situation.',
      costs: [
        'convoy computer evidence custody is compromised',
        'later authentication work has fewer clean records',
        'engineering and operations must explain the evidence break'
      ],
      revealedFactIds: [
        'chapter-1.no-biosignature-at-range'
      ],
      commandDecisionAwards: []
    };
  }

  const balancedThreshold = (signals.closesOnConvoy || signals.preparesRescue)
    && signals.startsRemoteVerification
    && signals.usesQuarantinePosture
    && signals.usesSecurityPosture
    && signals.preservesConvoyEvidence;
  if (balancedThreshold) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player defines a clean first-contact threshold: close under security overwatch, keep quarantine-capable rescue ready, preserve volatile evidence, and board only after the first verification pass.',
      costs: [
        'boarding waits for a defined verification pass',
        'rescue remains ready without discarding quarantine discipline',
        'evidence custody has an owner before intrusive contact begins'
      ],
      revealedFactIds: [
        'chapter-1.quarantine-code-routing-mismatch',
        'chapter-1.no-biosignature-at-range'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.startsRemoteVerification && !signals.closesOnConvoy) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player sets a remote-first threshold before boarding. Evidence and safety improve, but Sickbay keeps the rescue delay visible until the threshold authorizes contact.',
      costs: [
        'boarding remains held pending verification',
        'rescue delay pressure remains active',
        'evidence custody improves before first contact'
      ],
      revealedFactIds: [
        'chapter-1.quarantine-code-routing-mismatch',
        'chapter-1.no-biosignature-at-range'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.closesOnConvoy || signals.preparesRescue) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player sets a rescue-forward threshold and moves the ship toward first contact. The order is workable, but security, quarantine, and evidence custody must keep pace during execution.',
      costs: [
        'rescue contact moves faster than full verification',
        'quarantine and security posture need active follow-through',
        'evidence custody remains vulnerable during first contact'
      ],
      revealedFactIds: [
        'chapter-1.no-biosignature-at-range'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The boarding threshold remains too vague to commit first contact. Routine teams keep working, but Whitaker asks for a sharper trigger before anyone boards or changes quarantine posture.',
    costs: [
      'first contact threshold remains underdefined',
      'boarding remains deferred',
      'command must restate the threshold before the next irreversible step'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveFirstContactExecution({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const balancedExecution = signals.targetsParnellRescue
    && signals.targetsFaradayRecords
    && (signals.startsRemoteVerification || signals.usesBoardingTeam)
    && signals.usesQuarantinePosture
    && signals.usesSecurityPosture
    && signals.preservesConvoyEvidence;

  if (signals.destroysConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player lets first contact damage or overwrite the convoy records while teams move in. Imani and Priya preserve fragments, but the clean chain for the first operational evidence is broken.',
      costs: [
        'Faraday Bell record access is compromised',
        'later authority reconstruction has fewer clean records',
        'rescue work continues with a weaker evidence basis'
      ],
      revealedFactIds: [
        'chapter-1.parnell-trapped-worker'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.escalatesWeapons) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Great Failure',
      summary: 'The player tries to turn first contact into a weapons escalation before a hostile act or lawful emergency basis exists. Whitaker blocks fire and orders the contact route back to rescue, quarantine, and evidence custody.',
      costs: [
        'weapons escalation is blocked before fire is released',
        'security exposure rises while the order is corrected',
        'first contact must be restated without treating a silent convoy as a target'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (balancedExecution) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player executes a balanced first contact: remote access and quarantine-capable teams move together, Parnell rescue begins under damage-control limits, and the Faraday Bell records are preserved before intrusive access.',
      costs: [
        'first contact is slower than a blind rescue rush',
        'quarantine discipline remains active until medical evidence clears it',
        'unresolved locations and missing personnel still require follow-up'
      ],
      revealedFactIds: [
        'chapter-1.faraday-ivers-routing-annotation',
        'chapter-1.parnell-trapped-worker'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.targetsFaradayRecords && (signals.startsRemoteVerification || signals.preservesConvoyEvidence)) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player makes Faraday Bell records the first contact priority. The log access is clean enough to preserve the routing anomaly, but Sickbay keeps the Parnell rescue delay visible.',
      costs: [
        'Parnell rescue remains delayed while records are secured',
        'the first contact route favors evidence over immediate witness recovery',
        'medical and engineering pressure must be addressed next'
      ],
      revealedFactIds: [
        'chapter-1.faraday-ivers-routing-annotation'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.targetsParnellRescue || signals.preparesRescue || signals.closesOnConvoy) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player makes the Parnell rescue the first contact priority. The trapped relief worker becomes reachable, but Faraday Bell evidence custody still needs explicit follow-through.',
      costs: [
        'rescue contact moves ahead of full record access',
        'Faraday Bell evidence remains vulnerable until assigned',
        'quarantine and security coverage must keep pace during the rescue'
      ],
      revealedFactIds: [
        'chapter-1.parnell-trapped-worker'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The first contact route remains too vague to execute. Routine teams hold the committed threshold, but Whitaker asks for a concrete split between rescue, records, quarantine, and security work.',
    costs: [
      'first contact execution remains underdefined',
      'rescue and evidence work wait for a clearer assignment',
      'the next order must name which team or remote access path moves first'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveOffsiteCustodyCargoLeads({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const balancedDiscovery = signals.tracksEvacuees
    && signals.addressesCustodyClaim
    && signals.tracksMissingCargo
    && (signals.preservesConvoyEvidence || signals.startsRemoteVerification)
    && (signals.usesQuarantinePosture || signals.preparesRescue)
    && (signals.usesSecurityPosture || signals.keepsJointInspectionTone || signals.coordinatesWithAuthorities);

  if (signals.escalatesWeapons || signals.detainsCompactPersonnel) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player turns the discovery beat into a coercive confrontation before the shelter, custody, and cargo facts are framed. Whitaker blocks escalation and forces the response back to triage, evidence, and lawful contact.',
      costs: [
        'custody posture becomes contested before a negotiation frame exists',
        'regional security exposure rises',
        'the next order must separate lawful pressure from premature escalation'
      ],
      revealedFactIds: [
        'chapter-1.pell-custody-claim'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.destroysConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player lets cargo and routing records degrade while trying to move quickly. The shelter lead remains usable, but the missing-cargo trail becomes harder to preserve cleanly.',
      costs: [
        'missing-cargo evidence is compromised',
        'later inventory reconstruction depends on fragments',
        'custody and shelter work continue without a clean cargo basis'
      ],
      revealedFactIds: [
        'chapter-1.ilyon-shelter-evacuees'
      ],
      commandDecisionAwards: []
    };
  }

  if (balancedDiscovery) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player frames the next Chapter 1 pressures cleanly: evacuees are located at Ilyon, Pell\'s custody claim is identified as a lawful problem to handle, and the missing secured cargo module remains a preserved lead.',
      costs: [
        'shelter triage still needs execution',
        'the custody dispute is framed but not resolved',
        'the missing cargo lead points to the next investigative pressure'
      ],
      revealedFactIds: [
        'chapter-1.ilyon-shelter-evacuees',
        'chapter-1.pell-custody-claim',
        'chapter-1.secured-recycling-module-missing'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.tracksEvacuees || signals.preparesRescue) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player prioritizes locating and preparing care for the evacuees. The shelter lead is established, but custody and cargo pressure still need a clean follow-up frame.',
      costs: [
        'custody pressure remains underdeveloped',
        'missing-cargo evidence remains only partially framed',
        'medical triage becomes the immediate next obligation'
      ],
      revealedFactIds: [
        'chapter-1.ilyon-shelter-evacuees'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.addressesCustodyClaim || signals.keepsJointInspectionTone || signals.coordinatesWithAuthorities) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player prioritizes the custody and jurisdiction problem. Pell\'s claim becomes clear enough to frame a lawful response, but shelter triage and cargo inventory need follow-up.',
      costs: [
        'evacuee medical pressure remains active',
        'missing-cargo evidence remains only partially framed',
        'the custody dispute is identified but not settled'
      ],
      revealedFactIds: [
        'chapter-1.pell-custody-claim'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.tracksMissingCargo || signals.preservesConvoyEvidence || signals.startsRemoteVerification) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player prioritizes the secured-hold inventory. The missing cargo module becomes a preserved lead, but shelter triage and custody pressure still need command framing.',
      costs: [
        'evacuee location and care remain the next humanitarian pressure',
        'custody posture remains underdeveloped',
        'cargo evidence is preserved without yet explaining why it matters'
      ],
      revealedFactIds: [
        'chapter-1.secured-recycling-module-missing'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The discovery route remains too vague to frame the next Chapter 1 beat. First-contact teams keep working, but the XO still needs to name whether shelter, custody, or cargo leads move first.',
    costs: [
      'offsite discovery remains underdefined',
      'custody and cargo pressure remain unframed',
      'the next order must name a concrete follow-up route'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolvePellContactTerms({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const balancedTerms = signals.contactsPell
    && signals.offersJointInspection
    && signals.demandsIversRelease
    && signals.setsLegalCargoUndertaking
    && (signals.acknowledgesCompactConcern || signals.keepsJointInspectionTone)
    && (signals.preservesConvoyEvidence || signals.sharesEvidence);

  if (signals.escalatesWeapons || signals.detainsCompactPersonnel) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player turns Pell contact into a coercive standoff before terms are established. Whitaker blocks immediate escalation and the custody problem hardens around jurisdiction rather than evidence.',
      costs: [
        'Pell contact begins as a standoff instead of a negotiation',
        'Ivers release becomes more contested',
        'cargo recovery now needs a harder legal or tactical follow-up'
      ],
      revealedFactIds: [
        'chapter-1.pell-separate-warning'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.destroysConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player lets the cargo evidence basis degrade while trying to set terms. Pell contact remains possible, but the missing-cargo recovery route loses clean evidentiary footing.',
      costs: [
        'cargo recovery route is compromised',
        'Ivers release cannot lean on a clean manifest record',
        'later accountability work must reconstruct damaged evidence'
      ],
      revealedFactIds: [
        'chapter-1.pell-separate-warning'
      ],
      commandDecisionAwards: []
    };
  }

  if (balancedTerms) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player opens a disciplined Pell contact route: acknowledge the stated emergency concern, offer joint inspection, seek Ivers and the officers through supervised release terms, and preserve a legal undertaking for the missing cargo.',
      costs: [
        'Ivers is not released yet',
        'cargo recovery remains an undertaking rather than a completed recovery',
        'Pell still needs a lawful exit that does not erase Compact concerns'
      ],
      revealedFactIds: [
        'chapter-1.pell-separate-warning',
        'chapter-1.emergency-transponder-hardware-manifest'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.demandsIversRelease || signals.contactsPell) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player makes Pell and Ivers the first contact priority. The separate warning becomes clear enough to challenge the custody claim, but cargo recovery still needs a cleaner undertaking.',
      costs: [
        'Ivers release route opens under contested authority',
        'cargo recovery remains underdeveloped',
        'Pell contact needs evidence-sharing or inspection terms to avoid hardening'
      ],
      revealedFactIds: [
        'chapter-1.pell-separate-warning'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.setsLegalCargoUndertaking || signals.tracksMissingCargo || signals.preservesConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player makes the missing cargo recovery route the priority. The manifest clarifies what is missing, but Ivers release and Pell contact still need diplomatic terms.',
      costs: [
        'cargo recovery route improves before the custody posture is settled',
        'Ivers release remains delayed',
        'Pell contact still needs a lawful face-saving channel'
      ],
      revealedFactIds: [
        'chapter-1.emergency-transponder-hardware-manifest'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The Pell contact terms remain too vague. Priya can keep the channel alive, but the XO still needs to name whether the route is release, joint inspection, cargo recovery, or lawful pressure.',
    costs: [
      'Pell contact remains underdefined',
      'Ivers release and cargo recovery stay pending',
      'the next order must name concrete terms'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveJointInspectionRelease({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const executesInspection = signals.executesJointInspection || signals.offersJointInspection;
  const securesRelease = signals.securesSupervisedRelease || signals.demandsIversRelease;
  const opensSharedRecord = signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const protectsCargoChain = signals.protectsCargoEvidenceChain || signals.setsLegalCargoUndertaking || signals.preservesConvoyEvidence;
  const lawfulExit = signals.givesPellLawfulExit || signals.acknowledgesCompactConcern || signals.keepsJointInspectionTone;
  const balancedExecution = executesInspection
    && securesRelease
    && opensSharedRecord
    && protectsCargoChain
    && lawfulExit;

  if (signals.escalatesWeapons || signals.detainsCompactPersonnel) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player tries to convert the joint inspection route into coercive custody before the shared record is established. Whitaker blocks immediate escalation, and Pell has fewer lawful reasons to cooperate.',
      costs: [
        'joint inspection is blocked by coercive posture',
        'Ivers release remains contested',
        'cargo recovery route shifts back toward hard legal pressure'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (signals.destroysConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player damages the evidence basis while trying to execute the inspection. Pell can still be challenged, but the shared record loses the clean chain it needed.',
      costs: [
        'shared inspection record is compromised',
        'Ivers release cannot carry clean evidentiary weight',
        'cargo recovery must proceed with damaged chain of custody'
      ],
      revealedFactIds: [],
      commandDecisionAwards: []
    };
  }

  if (balancedExecution) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player turns the opened Pell terms into action: a shared inspection record begins, Ivers is released under supervision as a witness, Pell receives a lawful exit, and the cargo evidence chain stays clean for recovery.',
      costs: [
        'Ivers is available under supervision, not free of all custody questions',
        'cargo recovery remains active but incomplete',
        'the source of the conflicting emergency messages remains unproven'
      ],
      revealedFactIds: [
        'chapter-1.ivers-supervised-statement',
        'chapter-1.joint-inspection-record-opened'
      ],
      commandDecisionAwards: []
    };
  }

  if (securesRelease || lawfulExit) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player prioritizes Pell\'s lawful exit and Ivers as a supervised witness. The custody route improves, but the inspection record and cargo evidence chain still need stronger execution.',
      costs: [
        'Ivers release route improves before the shared record is complete',
        'cargo recovery remains dependent on a follow-up inspection step',
        'Pell cooperation remains fragile without a full inspection frame'
      ],
      revealedFactIds: [
        'chapter-1.ivers-supervised-statement'
      ],
      commandDecisionAwards: []
    };
  }

  if (executesInspection || opensSharedRecord || protectsCargoChain) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player prioritizes the joint inspection and cargo evidence route. The shared record opens, but Ivers release and Pell\'s lawful exit remain underdeveloped.',
      costs: [
        'shared inspection record opens before the witness release posture is settled',
        'Ivers remains under contested supervision',
        'Pell still needs a face-saving route to keep cooperation stable'
      ],
      revealedFactIds: [
        'chapter-1.joint-inspection-record-opened'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The joint inspection execution remains too vague. The channel stays alive, but the XO still needs to name how Ivers, Pell, the shared record, and cargo evidence are handled.',
    costs: [
      'joint inspection remains underdefined',
      'Ivers release and cargo recovery stay pending',
      'the next order must name the concrete execution route'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveCargoDiagnosticPulse({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const tracesPulse = signals.tracesDiagnosticPulse || signals.startsRemoteVerification;
  const preservesJointSeal = signals.preservesJointCargoSeal || signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const protectsCargoChain = signals.protectsCargoEvidenceChain || signals.setsLegalCargoUndertaking || signals.preservesConvoyEvidence;
  const lawfulCooperation = signals.givesPellLawfulExit || signals.acknowledgesCompactConcern || signals.keepsJointInspectionTone || signals.coordinatesWithAuthorities;
  const nonHostileSecurity = signals.preparesNonHostileInterception || (signals.usesSecurityPosture && !signals.escalatesWeapons);
  const balancedTrace = tracesPulse
    && preservesJointSeal
    && protectsCargoChain
    && lawfulCooperation
    && nonHostileSecurity;

  if (signals.escalatesWeapons || signals.detainsCompactPersonnel || signals.attemptsImmediateCargoSeizure) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player turns the cargo pulse into a forced recovery attempt before the shared custody route is stable. Whitaker blocks escalation, and the signal remains recoverable but politically volatile.',
      costs: [
        'cargo recovery route shifts toward pursuit or legal confrontation',
        'Pell cooperation hardens under perceived seizure pressure',
        'the shared inspection record loses immediate trust value'
      ],
      revealedFactIds: [
        'chapter-1.missing-hardware-diagnostic-pulse'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.destroysConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player damages the evidence chain while tracing the cargo pulse. The signal can still be seen, but the shared recovery locus is no longer clean.',
      costs: [
        'cargo signal chain is compromised',
        'joint custody must be reconstructed from partial records',
        'later recovery faces avoidable evidentiary dispute'
      ],
      revealedFactIds: [
        'chapter-1.missing-hardware-diagnostic-pulse'
      ],
      commandDecisionAwards: []
    };
  }

  if (balancedTrace) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player traces the weak cargo diagnostic pulse under the shared inspection record, keeps Pell inside a lawful cooperation route, and preserves the recovery locus under joint seal for the next move.',
      costs: [
        'the missing hardware is located but not recovered yet',
        'final custody remains unsettled',
        'the source and purpose of the conflicting messages remain unproven'
      ],
      revealedFactIds: [
        'chapter-1.missing-hardware-diagnostic-pulse',
        'chapter-1.cargo-recovery-locus-preserved'
      ],
      commandDecisionAwards: []
    };
  }

  if (tracesPulse || protectsCargoChain || preservesJointSeal) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player preserves part of the cargo signal route. The diagnostic pulse is traced, but cooperation or security posture still needs a cleaner joint-custody frame.',
      costs: [
        'cargo signal is traced before final custody terms are stable',
        'Pell cooperation remains fragile',
        'the next order must preserve the recovery locus without forcing seizure'
      ],
      revealedFactIds: [
        'chapter-1.missing-hardware-diagnostic-pulse'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The cargo diagnostic pulse is not handled concretely enough. The joint inspection record stays open, but the XO still needs to name how the signal, custody seal, and security posture are handled.',
    costs: [
      'cargo signal remains underdeveloped',
      'joint recovery locus is not preserved yet',
      'the next order must name a concrete tracing and custody route'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolveHardwareRecoveryUnderSeal({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const recoversHardware = signals.recoversEmergencyHardware || signals.tracksMissingCargo;
  const preservesJointSeal = signals.preservesJointCargoSeal || signals.defersFinalCustody || signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const preservesTrace = signals.preservesRecoveryTelemetry || signals.tracesDiagnosticPulse || signals.startsRemoteVerification;
  const protectsCargoChain = signals.protectsCargoEvidenceChain || signals.setsLegalCargoUndertaking || signals.preservesConvoyEvidence;
  const lawfulCooperation = signals.givesPellLawfulExit || signals.acknowledgesCompactConcern || signals.keepsJointInspectionTone || signals.coordinatesWithAuthorities;
  const nonHostileSecurity = signals.preparesNonHostileInterception || (signals.usesSecurityPosture && !signals.escalatesWeapons);
  const balancedRecovery = recoversHardware
    && preservesJointSeal
    && preservesTrace
    && protectsCargoChain
    && lawfulCooperation
    && nonHostileSecurity;

  if (signals.escalatesWeapons || signals.detainsCompactPersonnel || signals.attemptsImmediateCargoSeizure) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player turns hardware recovery into a forced seizure. Whitaker blocks escalation before it becomes a firefight, but the recovery route becomes contested and Compact trust drops.',
      costs: [
        'hardware recovery becomes contested',
        'Pell cooperation hardens around jurisdiction',
        'the shared evidence seal loses credibility'
      ],
      revealedFactIds: [
        'chapter-1.emergency-hardware-recovered-under-seal'
      ],
      commandDecisionAwards: []
    };
  }

  if (signals.destroysConvoyEvidence) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player recovers the hardware while damaging the recovery telemetry. The object is secured, but its evidentiary value is compromised.',
      costs: [
        'recovery telemetry is compromised',
        'final custody remains more contested',
        'later attribution work must rely on weaker records'
      ],
      revealedFactIds: [
        'chapter-1.emergency-hardware-recovered-under-seal'
      ],
      commandDecisionAwards: []
    };
  }

  if (balancedRecovery) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player recovers the missing emergency hardware under a joint evidence seal, preserves the diagnostic timing trace, and defers final custody without breaking Pell cooperation.',
      costs: [
        'final custody remains unsettled',
        'the wider source of the conflicting orders remains unproven',
        'the recovered hardware must be handled through the joint record'
      ],
      revealedFactIds: [
        'chapter-1.emergency-hardware-recovered-under-seal',
        'chapter-1.recovery-timing-trace-preserved'
      ],
      commandDecisionAwards: []
    };
  }

  if (recoversHardware) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player recovers the hardware, but the joint seal, telemetry preservation, or final custody deferral remains incomplete.',
      costs: [
        'hardware is recovered before the shared custody frame is fully stable',
        'Pell cooperation remains fragile',
        'the timing trace needs cleaner handling before wider attribution'
      ],
      revealedFactIds: [
        'chapter-1.emergency-hardware-recovered-under-seal'
      ],
      commandDecisionAwards: []
    };
  }

  if (preservesTrace || preservesJointSeal || protectsCargoChain) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player preserves the recovery record but does not actually secure the emergency hardware yet.',
      costs: [
        'recovery remains incomplete',
        'the joint record is stronger than the physical custody position',
        'the next order must name how the hardware is secured'
      ],
      revealedFactIds: [
        'chapter-1.recovery-timing-trace-preserved'
      ],
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The hardware recovery route remains too vague. The cargo signal is still useful, but the XO must name how recovery, custody seal, telemetry, and security posture are handled.',
    costs: [
      'hardware recovery remains underdefined',
      'joint custody does not yet close the immediate cargo pressure',
      'the next order must name a concrete recovery route'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function resolutionFacts({ createsRecord, cooperativeResolution, acknowledgesAuth }) {
  return [
    createsRecord ? 'chapter-1.joint-incident-record-created' : null,
    cooperativeResolution ? 'chapter-1.cooperative-resolution-filed' : null,
    acknowledgesAuth ? 'chapter-1.starfleet-authentication-failure-acknowledged' : null
  ].filter(Boolean);
}

function resolveChapter1ResolutionTerms({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const createsRecord = signals.createsJointIncidentRecord || signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const securesIvers = signals.securesIversTrust || signals.securesSupervisedRelease || signals.demandsIversRelease;
  const pellWitness = signals.recruitsPellWitness || signals.givesPellLawfulExit || signals.contactsPell || signals.acknowledgesCompactConcern;
  const compactAccess = signals.grantsCompactInvestigationAccess || signals.coordinatesWithAuthorities || signals.sharesEvidence;
  const acknowledgesAuth = signals.acknowledgesAuthenticationFailure;
  const documentsDebt = signals.documentsParnellTechnicalDebt;
  const finalCustody = signals.finalizesJointCustody || signals.preservesJointCargoSeal || signals.defersFinalCustody;
  const forceClosure = signals.usesSuperiorAuthority || signals.escalatesAuthority || signals.escalatesWeapons || signals.detainsCompactPersonnel;
  const costlyIncident = signals.costlyResolutionIncident || signals.destroysConvoyEvidence;
  const fragmented = signals.fragmentedResolution;
  const cooperativeResolution = createsRecord
    && securesIvers
    && pellWitness
    && compactAccess
    && acknowledgesAuth
    && documentsDebt
    && finalCustody
    && !forceClosure
    && !costlyIncident
    && !fragmented;

  if (costlyIncident) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The Chapter 1 closure is recorded through a costly incident. The investigation continues, but injuries, damaged records, or medical error raise scrutiny instead of regional trust.',
      costs: [
        'humanitarian strain rises around the convoy response',
        'the incident record is treated as compromised until later review',
        'witness trust becomes harder to secure'
      ],
      revealedFactIds: resolutionFacts({ createsRecord, cooperativeResolution: false, acknowledgesAuth }),
      commandDecisionAwards: []
    };
  }

  if (forceClosure) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player closes the convoy crisis through superior authority rather than a mutual record. Evidence is secured, but Compact suspicion remains elevated until later accountability is provided.',
      costs: [
        'Compact access is restricted by the authority posture',
        'Ivers remains cautious about whether the record will stay transparent',
        'regional diplomacy carries forward a suspicion cost'
      ],
      revealedFactIds: resolutionFacts({ createsRecord, cooperativeResolution: false, acknowledgesAuth }),
      commandDecisionAwards: []
    };
  }

  if (fragmented) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The people are rescued and enough evidence survives for the wider investigation, but the Chapter 1 record closes fragmented rather than cooperative.',
      costs: [
        'Pell witness terms remain incomplete',
        'the incident record relies on partial evidence',
        'later investigation must spend effort repairing the record'
      ],
      revealedFactIds: resolutionFacts({ createsRecord, cooperativeResolution: false, acknowledgesAuth }),
      commandDecisionAwards: []
    };
  }

  if (cooperativeResolution) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player closes the immediate convoy crisis cooperatively: a joint incident record is created, Ivers remains a trusted witness, Pell is handled through lawful witness terms, Compact access is preserved, authentication failure is acknowledged, and Parnell follow-up debt is documented.',
      costs: [
        'the wider source of the conflicting orders remains unproven',
        'the joint record must survive later political pressure',
        'engineering follow-up from the Parnell rescue remains scheduled work'
      ],
      revealedFactIds: resolutionFacts({ createsRecord: true, cooperativeResolution: true, acknowledgesAuth: true }),
      commandDecisionAwards: []
    };
  }

  if (createsRecord) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player creates a usable Chapter 1 incident record, but witness trust, Compact access, authentication accountability, or Parnell follow-up still needs cleaner closure.',
      costs: [
        'the record closes with unresolved consequence terms',
        'regional trust improves less than it could',
        'the next chapter inherits follow-up pressure'
      ],
      revealedFactIds: resolutionFacts({ createsRecord: true, cooperativeResolution: false, acknowledgesAuth }),
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The Chapter 1 resolution terms remain underdefined. The recovered hardware and rescue work are real, but the XO must name the record, witness, access, authentication, and follow-up posture.',
    costs: [
      'the immediate crisis lacks a durable closing record',
      'Ivers and Pell remain administratively unsettled',
      'Compact access and authentication accountability remain unclear'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function transitionFacts({ arrival, report }) {
  return [
    arrival ? 'chapter-1.asterion-arrival' : null,
    report ? 'chapter-1.compact-patrol-false-colors-report' : null
  ].filter(Boolean);
}

function resolveChapter1FalseColorsTransition({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const arrival = signals.reachesAsterion;
  const report = signals.receivesCompactPatrolReport;
  const recordHandoff = signals.carriesJointRecordForward || signals.createsJointIncidentRecord || signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const authorityNotice = signals.alertsAsterionAuthorities || signals.coordinatesWithAuthorities;
  const nonHostile = signals.maintainsNonHostileTransition || (signals.usesSecurityPosture && !signals.escalatesWeapons);
  const contested = signals.escalatesWeapons || signals.detainsCompactPersonnel || signals.destroysConvoyEvidence;
  const cleanTransition = arrival && report && recordHandoff && authorityNotice && nonHostile && !contested;

  if (contested) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The Breckenridge reaches the next crisis report, but weapons pressure or damaged records make the handoff contested before Asterion can absorb the Chapter 1 record.',
      costs: [
        'Asterion receives the report under heightened suspicion',
        'the Chapter 1 record is harder to use as trust collateral',
        'the first False Colors response begins with avoidable security pressure'
      ],
      revealedFactIds: transitionFacts({ arrival: true, report: true }),
      commandDecisionAwards: []
    };
  }

  if (cleanTransition) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The Breckenridge carries the Chapter 1 joint record into Asterion, receives the Compact patrol false-colors report, notifies the relevant authorities, and holds a non-hostile posture while the new accusation is verified.',
      costs: [
        'the formal Asterion briefing is interrupted',
        'the Breckenridge must now answer an accusation involving its own identity',
        'the source and purpose of the impersonating vessel remain unknown'
      ],
      revealedFactIds: transitionFacts({ arrival: true, report: true }),
      commandDecisionAwards: []
    };
  }

  if (arrival || report) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The campaign reaches the Asterion transition, but the record handoff, authority notice, or non-hostile posture needs clearer handling as the patrol report arrives.',
      costs: [
        'the False Colors report lands before the Chapter 1 record is fully framed',
        'Asterion and Compact authorities need immediate clarification',
        'the next response begins with incomplete handoff discipline'
      ],
      revealedFactIds: transitionFacts({ arrival, report }),
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The transition order is too vague. The XO must name how the Breckenridge reaches Asterion, carries the joint record forward, and handles the first report involving its own identity.',
    costs: [
      'Chapter 1 closure remains administratively incomplete',
      'the next crisis report has not been cleanly received',
      'authority notification and security posture remain underdefined'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function falseColorsTransparencyFacts({ briefingFacts = true, terms = false }) {
  return [
    briefingFacts ? 'chapter-2.aegis-two-attack-report' : null,
    briefingFacts ? 'chapter-2.false-breckenridge-signature' : null,
    briefingFacts ? 'chapter-2.breckenridge-convoy-alibi' : null,
    briefingFacts ? 'chapter-2.aegis-two-casualties' : null,
    terms ? 'chapter-2.transparency-terms-framed' : null
  ].filter(Boolean);
}

function resolveFalseColorsTransparencyTerms({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const independentVerification = signals.permitsJointAudit
    || signals.invitesNeutralSpecialist
    || signals.allowsCompactObservers
    || signals.establishesIndependentSensorBaseline;
  const medicalHelp = signals.offersAegisMedicalHelp || signals.preparesRescue;
  const alibiVerification = signals.verifiesBreckenridgeAlibi
    || signals.usesCryptographicChallenge
    || signals.establishesIndependentSensorBaseline
    || signals.startsRemoteVerification;
  const controlledSecrecy = signals.protectsTacticalSecrets
    || signals.createsClassifiedAnnex
    || signals.refusesUnrestrictedAuthAccess;
  const accessDenial = signals.deniesCompactAccess || signals.authorityOnlyAlibiClaim;
  const overexposure = signals.overexposesTacticalSystems;
  const balanced = independentVerification
    && medicalHelp
    && alibiVerification
    && controlledSecrecy
    && !accessDenial
    && !overexposure;

  if (overexposure) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player creates a transparency route, but unrestricted tactical or command-authentication exposure makes the Breckenridge safer politically and less safe operationally.',
      costs: [
        'security access risk rises around exposed command architecture',
        'Bronn must contain disclosure damage before evidence handling expands',
        'the audit can proceed but its access boundary is now too loose'
      ],
      revealedFactIds: falseColorsTransparencyFacts({ briefingFacts: true, terms: true }),
      commandDecisionAwards: []
    };
  }

  if (accessDenial) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player protects the ship by denying meaningful Compact verification. Starfleet keeps control of sensitive systems, but the alibi begins as a Starfleet-only claim.',
      costs: [
        'Compact trust drops because independent verification is not yet credible',
        'public anger rises around the appearance of self-certification',
        'the next evidence scene must repair the audit frame before it can prove the alibi'
      ],
      revealedFactIds: falseColorsTransparencyFacts({ briefingFacts: true, terms: true }),
      commandDecisionAwards: []
    };
  }

  if (balanced) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player frames a disciplined transparency route: immediate Aegis Two medical help, independent verification with Compact participation, Breckenridge alibi proof through auditable data, and a classified annex that protects command authentication systems.',
      costs: [
        'the Breckenridge must now produce proof under hostile public attention',
        'Compact observers will see enough to create friction with Security',
        'the source of the false Breckenridge signature remains unknown'
      ],
      revealedFactIds: falseColorsTransparencyFacts({ briefingFacts: true, terms: true }),
      commandDecisionAwards: []
    };
  }

  if (medicalHelp && !independentVerification) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player puts Aegis Two medical help first. The humanitarian posture improves, but the accusation still needs independent verification and access terms.',
      costs: [
        'medical trust improves before audit trust does',
        'Compact access scope remains underdefined',
        'the Breckenridge alibi still risks sounding like Starfleet asking to be trusted'
      ],
      revealedFactIds: falseColorsTransparencyFacts({ briefingFacts: true, terms: true }),
      commandDecisionAwards: []
    };
  }

  if (independentVerification || alibiVerification || controlledSecrecy) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player opens a plausible verification route, but medical help, alibi proof, or tactical boundaries still need sharper terms before the briefing can stabilize.',
      costs: [
        'the audit frame exists but can still be attacked as incomplete',
        'Aegis Two medical posture remains politically sensitive',
        'access boundaries must be clarified before evidence handling expands'
      ],
      revealedFactIds: falseColorsTransparencyFacts({ briefingFacts: true, terms: true }),
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The transparency response remains too vague. The briefing records the accusation, casualties, alibi problem, and need for terms, but the XO must name how verification, medical aid, access, and tactical secrecy work.',
    costs: [
      'public anger rises while first terms remain unclear',
      'Aegis Two care and evidence access remain unresolved',
      'the next order must name a concrete audit route or medical/security boundary'
    ],
    revealedFactIds: falseColorsTransparencyFacts({ briefingFacts: true, terms: false }),
    commandDecisionAwards: []
  };
}

function orisonEvidenceFacts({ baseline = false, calibration = false, reconstruction = false }) {
  return [
    baseline ? 'chapter-2.orison-sensor-baseline-preserved' : null,
    calibration ? 'chapter-2.breckenridge-calibration-mismatch' : null,
    reconstruction ? 'chapter-2.attack-track-reconstruction-opened' : null
  ].filter(Boolean);
}

function resolveOrisonEvidenceBaseline({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const independentBaseline = signals.securesOrisonBaseline
    || signals.establishesIndependentSensorBaseline
    || signals.startsRemoteVerification;
  const auditChain = signals.preservesAuditChain || signals.permitsJointAudit || signals.allowsCompactObservers;
  const compactParticipation = signals.allowsCompactObservers || signals.permitsJointAudit || signals.invitesNeutralSpecialist;
  const calibrationProof = signals.usesImaniCalibration;
  const reconstruction = signals.reconstructsAttackerRoute || (independentBaseline && signals.startsRemoteVerification);
  const controlledDisclosure = signals.protectsTacticalSecrets
    || signals.createsClassifiedAnnex
    || signals.refusesUnrestrictedAuthAccess
    || signals.releasesSelectedLogs;
  const compromised = signals.overexposesTacticalSystems
    || signals.deniesCompactAccess
    || signals.authorityOnlyAlibiClaim
    || signals.makesUnsupportedHoltAccusation
    || signals.escalatesWeapons
    || signals.detainsCompactPersonnel;
  const balanced = independentBaseline
    && auditChain
    && compactParticipation
    && calibrationProof
    && reconstruction
    && controlledDisclosure
    && !compromised;

  if (signals.overexposesTacticalSystems) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player preserves enough Orison data to continue the audit, but tactical or command-authentication exposure makes the evidence route operationally costly.',
      costs: [
        'Security must contain disclosure damage before wider evidence sharing',
        'Compact observers gain more system context than the ship can comfortably defend',
        'the baseline remains usable but carries an avoidable access-risk cost'
      ],
      revealedFactIds: orisonEvidenceFacts({ baseline: independentBaseline, calibration: calibrationProof, reconstruction }),
      commandDecisionAwards: []
    };
  }

  if (signals.makesUnsupportedHoltAccusation) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player moves too quickly from evidence preservation to public accusation. Whitaker keeps the audit alive, but the political front hardens before the record can support that claim.',
      costs: [
        'Kessler has less room to defend the joint audit as neutral',
        'Holt can frame the evidence route as a Starfleet political attack',
        'the preserved baseline must now survive a public credibility fight'
      ],
      revealedFactIds: orisonEvidenceFacts({ baseline: independentBaseline, calibration: calibrationProof, reconstruction }),
      commandDecisionAwards: []
    };
  }

  if (signals.deniesCompactAccess || signals.authorityOnlyAlibiClaim) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player preserves technical evidence but keeps the proof path too Starfleet-controlled. The alibi improves mechanically while legitimacy stays fragile.',
      costs: [
        'Compact observers cannot yet defend the audit as independent',
        'public anger does not fall as quickly as the technical evidence warrants',
        'the next scene must repair participation before claiming joint legitimacy'
      ],
      revealedFactIds: orisonEvidenceFacts({ baseline: independentBaseline, calibration: calibrationProof, reconstruction }),
      commandDecisionAwards: []
    };
  }

  if (balanced) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player turns transparency terms into evidence: Orison civilian and station baselines are preserved under joint audit, Imani demonstrates a Breckenridge calibration mismatch, and Priya and Rowan open an attacker-route reconstruction without exposing classified systems.',
      costs: [
        'the reconstruction can show where the attacker moved, not yet what the craft was',
        'the audit now depends on preserved records staying clean under political pressure',
        'selected disclosure gives the public enough signal to expect further proof'
      ],
      revealedFactIds: orisonEvidenceFacts({ baseline: true, calibration: true, reconstruction: true }),
      commandDecisionAwards: []
    };
  }

  if (independentBaseline || auditChain || calibrationProof || reconstruction) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player preserves part of the Orison evidence route, but the audit chain, Compact participation, calibration comparison, or disclosure boundary still needs sharper handling.',
      costs: [
        'the alibi evidence improves before the full chain is trusted',
        'the attacker-route reconstruction remains incomplete',
        'the next order must close the gap between technical proof and shared legitimacy'
      ],
      revealedFactIds: orisonEvidenceFacts({ baseline: independentBaseline, calibration: calibrationProof, reconstruction }),
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The Orison evidence baseline remains underdefined. The transparency posture exists, but the XO must name how independent sensors, audit chain, calibration comparison, and disclosure boundaries are preserved.',
    costs: [
      'audit fragility rises while baseline preservation is delayed',
      'the alibi still risks sounding like Starfleet self-certification',
      'later reconstruction has less clean evidence to work from'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function aegisMedicalFacts({ channel = false, stabilized = false, testimony = false }) {
  return [
    channel ? 'chapter-2.aegis-two-medical-channel-opened' : null,
    stabilized ? 'chapter-2.critical-officer-stabilized' : null,
    testimony ? 'chapter-2.patrol-officer-testimony-preserved' : null
  ].filter(Boolean);
}

function resolveAegisMedicalTrust({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const care = signals.stabilizesCriticalOfficer || signals.offersAegisMedicalHelp || signals.preparesRescue;
  const jointChannel = signals.opensJointMedicalChannel || signals.coordinatesWithAuthorities;
  const neutralCare = signals.separatesMedicalFromPolitics || signals.recordsMedicalNeutrality;
  const consent = signals.protectsMedicalConsent;
  const testimony = signals.preservesPatrolTestimony;
  const coercive = signals.usesCareAsLeverage
    || signals.forcesMedicalQuestioning
    || signals.escalatesWeapons
    || signals.detainsCompactPersonnel;
  const balanced = care && jointChannel && neutralCare && consent && testimony && !coercive;

  if (coercive) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Failure',
      summary: 'The player entangles care with coercion or forced testimony. Miriam and Whitaker prevent the worst breach, but medical trust and the public record are damaged.',
      costs: [
        'Compact medical trust falls around the appearance of coercive care',
        'patrol testimony becomes contested instead of voluntary',
        'public anger rises because casualty care looks political'
      ],
      revealedFactIds: aegisMedicalFacts({ channel: jointChannel, stabilized: care, testimony: false }),
      commandDecisionAwards: []
    };
  }

  if (balanced) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player keeps medical care trustworthy: Miriam stabilizes the critical officer through a Compact-observed medical channel, care is recorded as separate from culpability, and voluntary patrol testimony is preserved only after consent and medical clearance.',
      costs: [
        'testimony must still be reconciled with sensor evidence',
        'medical privacy limits how much the public record can say immediately',
        'Compact observers now expect the same discipline in later evidence handling'
      ],
      revealedFactIds: aegisMedicalFacts({ channel: true, stabilized: true, testimony: true }),
      commandDecisionAwards: []
    };
  }

  if (care && neutralCare) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player separates care from politics and stabilizes the medical front, but consent, observer trust, or testimony preservation still needs clearer handling.',
      costs: [
        'medical trust improves before testimony does',
        'the public record is cleaner but still incomplete',
        'the audit gains less value until voluntary testimony is preserved'
      ],
      revealedFactIds: aegisMedicalFacts({ channel: jointChannel, stabilized: care, testimony: false }),
      commandDecisionAwards: []
    };
  }

  if (care || jointChannel || testimony) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player opens part of the Aegis Two medical route, but care, neutrality, consent, or testimony are not yet integrated into a trustworthy public record.',
      costs: [
        'medical risk improves only partially',
        'Compact medical trust remains cautious',
        'the next order must protect consent and neutrality before testimony carries weight'
      ],
      revealedFactIds: aegisMedicalFacts({ channel: jointChannel, stabilized: care, testimony: false }),
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The medical-trust route remains underdefined. The XO must name how care, consent, Compact observers, medical neutrality, and voluntary testimony work.',
    costs: [
      'medical risk remains active around the critical officer',
      'public anger rises while care and testimony remain unclear',
      'the audit gains no testimony support yet'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function securityAccessFacts({ annex = false, demonstration = false, alternative = false }) {
  return [
    annex ? 'chapter-2.command-auth-annex-defined' : null,
    demonstration ? 'chapter-2.bronn-security-demonstration-recorded' : null,
    alternative ? 'chapter-2.kessler-access-alternative-framed' : null
  ].filter(Boolean);
}

function resolveSecurityAccessDemonstration({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const controlledAnnex = signals.definesControlledSecurityAnnex
    || signals.createsClassifiedAnnex
    || signals.protectsTacticalSecrets
    || signals.refusesUnrestrictedAuthAccess;
  const demonstration = signals.runsCommandAuthDemonstration
    || signals.usesCryptographicChallenge
    || signals.verifiesBreckenridgeAlibi
    || signals.startsRemoteVerification;
  const bronnProfessionalized = signals.defendsBronnSecurityRole && !signals.scapegoatsBronn;
  const kesslerAlternative = signals.givesKesslerDefensibleAlternative
    || signals.allowsCompactObservers
    || signals.permitsJointAudit
    || signals.invitesNeutralSpecialist;
  const tollandLimit = signals.honorsTollandDisclosureLimit || controlledAnnex;
  const overexposure = signals.overexposesTacticalSystems || signals.acceptsUnrestrictedCommandInspection;
  const denial = signals.deniesCompactAccess || signals.authorityOnlyAlibiClaim;
  const politicized = signals.scapegoatsBronn
    || signals.escalatesWeapons
    || signals.detainsCompactPersonnel;
  const balanced = controlledAnnex
    && demonstration
    && bronnProfessionalized
    && kesslerAlternative
    && tollandLimit
    && !overexposure
    && !denial
    && !politicized;

  if (overexposure) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player gives the audit a strong command-system demonstration, but unrestricted inspection or exposed command-authentication architecture creates an avoidable security cost.',
      costs: [
        'command-authentication exposure rises around the shared proof route',
        'Bronn must contain operational damage after the demonstration',
        'Tolland treats the disclosure boundary as breached or dangerously loose'
      ],
      revealedFactIds: securityAccessFacts({ annex: controlledAnnex, demonstration, alternative: kesslerAlternative }),
      commandDecisionAwards: []
    };
  }

  if (politicized) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Failure',
      summary: 'The player lets the access dispute become a personal fight around Bronn or a coercive security posture. The ship avoids handing over its systems, but the audit looks politicized.',
      costs: [
        'Bronn becomes a public focus instead of a professional security witness',
        'Kessler has less room to defend the access compromise',
        'public anger rises because the proof route looks like internal blame management'
      ],
      revealedFactIds: securityAccessFacts({ annex: controlledAnnex, demonstration, alternative: false }),
      commandDecisionAwards: []
    };
  }

  if (denial) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player protects command systems by refusing meaningful access. The Breckenridge stays secure, but Kessler is left with a weaker public alternative to Starfleet self-certification.',
      costs: [
        'audit fragility rises around the appearance of Starfleet-only proof',
        'Holt can describe the access boundary as concealment',
        'the next political beat must repair participation without exposing command systems'
      ],
      revealedFactIds: securityAccessFacts({ annex: controlledAnnex, demonstration: false, alternative: false }),
      commandDecisionAwards: []
    };
  }

  if (balanced) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player turns the access fight into a controlled proof: Bronn demonstrates command-authentication and transponder integrity inside a classified annex, Priya and Rowan provide selected observer-facing evidence, and Kessler receives a defensible alternative to unrestricted inspection while Tolland disclosure limits hold.',
      costs: [
        'the demonstration proves the real ship without identifying the attacker',
        'Compact observers now expect the same disciplined access model in later investigative work',
        'Holt still has political room to demand more than the safe annex provides'
      ],
      revealedFactIds: securityAccessFacts({ annex: true, demonstration: true, alternative: true }),
      commandDecisionAwards: []
    };
  }

  if (controlledAnnex || demonstration || kesslerAlternative) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player creates part of a safe access route, but the demonstration, Kessler-facing alternative, Bronn role, or disclosure limit still needs clearer handling before the security front stabilizes.',
      costs: [
        'the access boundary is more credible but not yet fully defensible',
        'Bronn remains exposed to political framing unless the demonstration is professionalized',
        'Kessler still needs a cleaner public explanation of why full access is unsafe'
      ],
      revealedFactIds: securityAccessFacts({ annex: controlledAnnex, demonstration, alternative: kesslerAlternative }),
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The security-access response remains underdefined. The XO must name how the ship proves identity integrity, protects command-authentication architecture, and gives Kessler something defensible besides unrestricted inspection.',
    costs: [
      'security access risk remains active around command-authentication systems',
      'audit fragility rises while access terms stay unclear',
      'Holt can keep pressing for broader access'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

function jointInvestigationFacts({ kessler = false, holt = false, hecate = false, openOrders = false }) {
  return [
    kessler ? 'chapter-2.kessler-joint-legitimacy-statement' : null,
    holt ? 'chapter-2.holt-interference-restricted' : null,
    hecate ? 'chapter-2.weak-hecate-trace-preserved' : null,
    openOrders ? 'chapter-2.open-orders-reach-presence-authorized' : null
  ].filter(Boolean);
}

function resolveJointInvestigationCharter({ turnId, intentParse }) {
  const signals = intentParse.signals || {};
  const charter = signals.framesJointInvestigationCharter
    || signals.permitsJointAudit
    || signals.allowsCompactObservers;
  const kessler = signals.givesKesslerFaceSavingStatement
    || signals.givesKesslerDefensibleAlternative;
  const holtRestricted = signals.restrictsHoltInterference
    || signals.preservesDirectorateAccessLogs
    || signals.covertHoltInquiry;
  const hecate = signals.preservesWeakHecateTrace;
  const openOrders = signals.authorizesOpenOrders;
  const overclaim = signals.overclaimsHecateTrace;
  const unsupported = signals.makesUnsupportedHoltAccusation;
  const rupture = unsupported
    || overclaim
    || signals.escalatesWeapons
    || signals.detainsCompactPersonnel;
  const balanced = charter
    && kessler
    && holtRestricted
    && hecate
    && openOrders
    && !rupture;

  if (overclaim) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player frames a path forward, but treating the weak Hecate trace as immediately actionable turns a preserved lead into a premature pursuit demand.',
      costs: [
        'the weak trace is politically overheated before it can be correlated',
        'Open Orders authorization becomes harder to defend as a calm investigative interval',
        'Kessler has less room to support the framework without appearing to endorse a thin claim'
      ],
      revealedFactIds: jointInvestigationFacts({ kessler, holt: holtRestricted && !unsupported, hecate, openOrders: false }),
      commandDecisionAwards: []
    };
  }

  if (unsupported) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Failure',
      summary: 'The player tries to close the crisis by accusing Holt before the record supports it. Whitaker can preserve some access restrictions, but the charter becomes a political fight.',
      costs: [
        'Holt containment reads as accusation rather than record protection',
        'Kessler cannot safely adopt the statement without seeming to prejudge her own official',
        'public anger rises around premature attribution'
      ],
      revealedFactIds: jointInvestigationFacts({ kessler, holt: false, hecate, openOrders: false }),
      commandDecisionAwards: []
    };
  }

  if (balanced) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Success',
      summary: 'The player turns the first False Colors crisis into a durable joint investigation charter: Kessler can acknowledge the Breckenridge innocence route, Holt interference is restricted through record protection, the weak Hecate trace is preserved for later correlation, and Whitaker accepts temporary Open Orders in the Reach.',
      costs: [
        'the Breckenridge remains under public scrutiny while the investigation continues',
        'the weak Hecate lead cannot support immediate pursuit yet',
        'Open Orders work now inherits the unresolved False Colors pressure'
      ],
      revealedFactIds: jointInvestigationFacts({ kessler: true, holt: true, hecate: true, openOrders: true }),
      commandDecisionAwards: []
    };
  }

  if (charter || kessler || holtRestricted || hecate || openOrders) {
    return {
      id: `outcome.${turnId.replace(/^turn\./, '')}`,
      resultBand: 'Partial Success',
      summary: 'The player creates part of the joint investigation closeout, but the charter, Kessler statement, interference restriction, Hecate handling, or Open Orders transition remains underdefined.',
      costs: [
        'the first proof route improves without becoming a complete legitimacy framework',
        'the Open Orders pause remains politically fragile',
        'the next order must clarify what is preserved, restricted, and deferred'
      ],
      revealedFactIds: jointInvestigationFacts({ kessler, holt: holtRestricted, hecate, openOrders }),
      commandDecisionAwards: []
    };
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The closeout remains underdefined. The XO must name the joint charter, Kessler public path, audit-record protection, weak-trace handling, and Open Orders transition before Chapter 2 can settle.',
    costs: [
      'public legitimacy remains unsettled',
      'audit interference risk stays active',
      'Open Orders I cannot begin cleanly yet'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}

export function resolveAction({ turnId, intentParse, actionClassification, authorityCapabilityCheck, pressureFocus, campaignState }) {
  if (intentParse.primaryIntent === 'terminal-catastrophic-command') {
    return resolveTerminalCatastrophicCommand({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'command-conduct-misconduct') {
    return resolveCommandConductMisconduct({ turnId, intentParse, campaignState });
  }

  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    return resolveHesperusAccountability({ turnId, intentParse, authorityCapabilityCheck, pressureFocus, campaignState });
  }

  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    return resolveArrivalTone({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    return resolveReadyRoomHandover({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    return resolveReadinessPriorities({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    return resolveFallbackProcedure({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    return resolveCommandRhythm({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    return resolveHesperusAftermath({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    return resolveCombinedLoadTest({ turnId, intentParse, campaignState });
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    return resolveFinalCommandReview({ turnId, intentParse, campaignState });
  }

  if (intentParse.primaryIntent === 'request-chapter-1-counsel') {
    return resolveChapter1Counsel({ turnId });
  }

  if (intentParse.primaryIntent === 'set-initial-convoy-posture') {
    return resolveInitialConvoyPosture({ turnId, intentParse, pressureFocus, campaignState });
  }

  if (intentParse.primaryIntent === 'set-first-boarding-threshold') {
    return resolveFirstBoardingThreshold({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'execute-first-contact-response') {
    return resolveFirstContactExecution({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'frame-offsite-custody-cargo-leads') {
    return resolveOffsiteCustodyCargoLeads({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'set-pell-contact-terms') {
    return resolvePellContactTerms({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'execute-joint-inspection-release') {
    return resolveJointInspectionRelease({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'trace-cargo-diagnostic-pulse') {
    return resolveCargoDiagnosticPulse({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'recover-hardware-under-seal') {
    return resolveHardwareRecoveryUnderSeal({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'set-chapter1-resolution-terms') {
    return resolveChapter1ResolutionTerms({ turnId, intentParse, campaignState });
  }

  if (intentParse.primaryIntent === 'transition-chapter1-to-false-colors') {
    return resolveChapter1FalseColorsTransition({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'set-false-colors-transparency-terms') {
    return resolveFalseColorsTransparencyTerms({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'establish-orison-evidence-baseline') {
    return resolveOrisonEvidenceBaseline({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'stabilize-aegis-medical-trust') {
    return resolveAegisMedicalTrust({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'set-security-access-demonstration') {
    return resolveSecurityAccessDemonstration({ turnId, intentParse });
  }

  if (intentParse.primaryIntent === 'frame-joint-investigation-charter') {
    return resolveJointInvestigationCharter({ turnId, intentParse });
  }

  if (actionClassification.category === 'missionAbandoningMove') {
    return resolveMissionDeparture({ turnId, authorityCapabilityCheck });
  }

  if (actionClassification.category === 'impossibleOrUnsupportedMove') {
    return resolveUnsupported({ turnId });
  }

  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Success',
    summary: 'The action is accepted as a mission-relevant move and should be resolved by a mission-specific rule in a later implementation slice.',
    costs: [
      'specific consequences pending mission rule'
    ],
    revealedFactIds: [],
    commandDecisionAwards: []
  };
}
