function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function parseIntent(sceneSnapshot) {
  const rawInput = String(sceneSnapshot?.playerInput || '');
  const input = rawInput.toLowerCase();

  const wantsPassengerTransfer = includesAny(input, ['passenger', 'passengers', 'medical', 'medically vulnerable', 'evacuate', 'transfer']);
  const wantsEvidencePreserved = includesAny(input, ['inspection', 'falsified', 'fraud', 'evidence', 'record', 'records']);
  const wantsOwnerAccountability = includesAny(input, ['owner', 'formal inquiry', 'inquiry', 'accountability', 'accountable', 'obligation']);
  const limitsRepair = includesAny(input, ['impulse', 'stabilization', 'stabilize', 'warp restart', 'limited repair']);
  const acceptsDelay = includesAny(input, ['delay', 'log', 'logged', 'accepting', 'accept responsibility']);
  const missionDeparture = includesAny(input, ['leave the mission area', 'depart the mission area', 'set course away', 'abandon', 'fly out']);
  const impossibleOrUnsupported = includesAny(input, ['without authorization', 'without access', 'no access', 'classified asset', 'override starfleet command', 'order q', 'teleport the ship', 'time travel']);
  const hasCredibleEvidence = includesAny(input, ['evidence', 'sensor', 'verified', 'distress', 'signal', 'proof', 'coordinates']);
  const hasImminentHarm = includesAny(input, ['imminent', 'immediate', 'minutes', 'lives at risk', 'warp core breach', 'attack underway']);
  const hasFeasiblePlan = includesAny(input, ['return', 'leave a team', 'delegate', 'probe', 'buoy', 'relay', 'limited deviation', 'set a time limit']);
  const asksForLimitedAlternative = includesAny(input, ['probe', 'buoy', 'relay', 'sensor sweep', 'remote scan', 'dispatch a shuttle', 'limited alternative']);
  const departureStrength = missionDeparture && hasCredibleEvidence && hasImminentHarm && hasFeasiblePlan
    ? 'compelling'
    : missionDeparture && (hasCredibleEvidence || hasImminentHarm || asksForLimitedAlternative)
      ? 'partial'
      : missionDeparture
        ? 'weak'
        : 'none';

  if (impossibleOrUnsupported) {
    return {
      summary: 'Attempt an action that lacks the required authority, access, or physical support in the current scene.',
      primaryIntent: 'unsupported-command',
      targetIds: [],
      declaredMethod: rawInput.trim() || 'unsupported command',
      assumptions: [
        'The player needs lawful authority, access, capability, or evidence before this action can work.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (wantsPassengerTransfer && wantsEvidencePreserved && wantsOwnerAccountability) {
    return {
      summary: 'Prioritize passenger transfer, preserve inspection-fraud evidence, impose formal accountability on the owner, and stabilize the Hesperus only for impulse travel.',
      primaryIntent: 'resolve-hesperus-with-accountability',
      targetIds: ['ss-hesperus', 'hesperus-owner', 'hesperus-passengers'],
      declaredMethod: [
        wantsOwnerAccountability ? 'lawful authority' : null,
        wantsEvidencePreserved ? 'evidence preservation' : null,
        wantsPassengerTransfer ? 'medical evacuation' : null,
        limitsRepair ? 'limited engineering support' : null,
        acceptsDelay ? 'logged command responsibility' : null
      ].filter(Boolean).join(', '),
      assumptions: [
        "The player is acting as XO under Whitaker's command intent.",
        "The Hesperus owner is within the scope of Starfleet safety and inspection authority for the immediate emergency.",
        'Engineering can stabilize impulse travel but cannot certify warp restart.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (missionDeparture) {
    return {
      summary: 'Attempt to leave or redirect away from the active mission frame.',
      primaryIntent: 'leave-mission-area',
      targetIds: [],
      declaredMethod: rawInput.trim() || 'unspecified mission departure',
      assumptions: [
        'Leaving the active mission frame may require Captain approval and a credible Starfleet reason.'
      ],
      signals: {
        wantsPassengerTransfer,
        wantsEvidencePreserved,
        wantsOwnerAccountability,
        limitsRepair,
        acceptsDelay,
        missionDeparture,
        hasCredibleEvidence,
        hasImminentHarm,
        hasFeasiblePlan,
        asksForLimitedAlternative,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  return {
    summary: rawInput.trim() || 'No player action supplied.',
    primaryIntent: rawInput.trim() ? 'general-mission-action' : 'no-action',
    targetIds: [],
    declaredMethod: rawInput.trim() || 'unspecified',
    assumptions: [],
    signals: {
      wantsPassengerTransfer,
      wantsEvidencePreserved,
      wantsOwnerAccountability,
      limitsRepair,
      acceptsDelay,
      missionDeparture,
      hasCredibleEvidence,
      hasImminentHarm,
      hasFeasiblePlan,
      asksForLimitedAlternative,
      departureStrength,
      impossibleOrUnsupported
    }
  };
}
