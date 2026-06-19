function hasAwardedDecision(campaignState, decisionId) {
  const inspiration = campaignState?.commandStyle?.inspiration?.awardedDecisionIds || [];
  const resolve = campaignState?.commandStyle?.resolve?.awardedDecisionIds || [];
  return inspiration.includes(decisionId) || resolve.includes(decisionId);
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
    summary: 'Passengers are transferred first, evidence is preserved, the owner is placed under formal inquiry obligations, and the Hesperus receives impulse-only stabilization. The Breckinridge accepts a minor delay.',
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
      summary: 'Captain Whitaker approves a limited deviation because the player presents credible evidence, imminent harm, and a feasible return plan. The Breckinridge leaves only under logged conditions while the Hesperus pressure continues.',
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
      summary: 'Captain Whitaker does not authorize taking the Breckinridge fully away from the Hesperus, but approves a limited investigation that can gather evidence without abandoning the active rescue obligation.',
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
        ? 'The player gives Whitaker a truthful final readiness report, names the carried limitation, asks for clear command support, and sets the Breckinridge to enter the Reach with the caveat visible.'
        : 'The player gives Whitaker a clear final readiness report, formalizes the command posture, and sets the Breckinridge to enter the Reach without hiding unresolved strain.',
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

export function resolveAction({ turnId, intentParse, actionClassification, authorityCapabilityCheck, pressureFocus, campaignState }) {
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
