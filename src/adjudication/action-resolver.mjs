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

export function resolveAction({ turnId, intentParse, actionClassification, authorityCapabilityCheck, pressureFocus, campaignState }) {
  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    return resolveHesperusAccountability({ turnId, intentParse, authorityCapabilityCheck, pressureFocus, campaignState });
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
