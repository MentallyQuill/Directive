function hasAwardedMoment(campaignState, momentId) {
  const inspiration = campaignState?.commandStyle?.inspiration?.awardedMomentIds || [];
  const resolve = campaignState?.commandStyle?.resolve?.awardedMomentIds || [];
  return inspiration.includes(momentId) || resolve.includes(momentId);
}

function resolveHesperusAccountability({ turnId, intentParse, authorityCapabilityCheck, pressureFocus, campaignState }) {
  const momentId = 'command.hesperus-fraud-accountability';
  const canAwardMoment = pressureFocus.commandMomentCandidates.includes(momentId) && !hasAwardedMoment(campaignState, momentId);
  const signals = intentParse.signals || {};
  const awardResolve = canAwardMoment
    && signals.wantsOwnerAccountability
    && signals.wantsEvidencePreserved
    && signals.acceptsDelay;
  const awardInspiration = canAwardMoment
    && signals.wantsPassengerTransfer
    && signals.wantsEvidencePreserved
    && /dignity|cooperation|trust|testimony|reassure/i.test(intentParse.declaredMethod || '');

  const awards = [];
  if (awardResolve) {
    awards.push({
      id: momentId,
      track: 'Resolve',
      reason: 'The player used lawful authority, evidence custody, deadlines, and clear consequences proportionately while prioritizing passenger safety.'
    });
  }
  if (awardInspiration) {
    awards.push({
      id: momentId,
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
    commandMomentAwards: awards
  };
}

function resolveMissionDeparture({ turnId }) {
  return {
    id: `outcome.${turnId.replace(/^turn\./, '')}`,
    resultBand: 'Partial Failure',
    summary: 'The requested mission deviation requires Captain Whitaker to make or approve a command decision before the ship can leave the operational frame.',
    costs: [
      'Captain approval required',
      'original mission pressure continues during deliberation'
    ],
    revealedFactIds: [],
    commandMomentAwards: []
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
    commandMomentAwards: []
  };
}

export function resolveAction({ turnId, intentParse, actionClassification, authorityCapabilityCheck, pressureFocus, campaignState }) {
  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    return resolveHesperusAccountability({ turnId, intentParse, authorityCapabilityCheck, pressureFocus, campaignState });
  }

  if (actionClassification.category === 'missionAbandoningMove') {
    return resolveMissionDeparture({ turnId });
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
    commandMomentAwards: []
  };
}
