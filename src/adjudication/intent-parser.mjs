function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function parseIntent(sceneSnapshot) {
  const rawInput = String(sceneSnapshot?.playerInput || '');
  const input = rawInput.toLowerCase();
  const activePhaseId = sceneSnapshot?.activePhaseId || sceneSnapshot?.phaseId || '';

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
  const reportsAboard = includesAny(input, ['report', 'reporting', 'aboard', 'ready room', 'captain', 'whitaker']);
  const respectsWorkingProcess = includesAny(input, ['let the transfer complete', 'allow the transfer', 'do not interrupt', 'without interrupting', 'working process', 'working routine', 'no ceremony', 'no disruption', 'finish docking', 'maintain routine']);
  const asksForHandoff = includesAny(input, ['handoff', 'bronn', 'acting xo', 'status', 'brief', 'standing orders', 'current routine', 'watch bill']);
  const immediateInspection = includesAny(input, ['inspect', 'inspection', 'tour', 'walk the deck', 'surprise inspection', 'review every station']);
  const namesPersonalValue = includesAny(input, ['value', 'principle', 'no life is expendable', 'crew deserves the truth', 'mission comes first', 'truth', 'life is expendable', 'loyalty', 'loyal']);
  const defersPersonalValue = includesAny(input, ['defer', 'later', 'not yet', 'no personal value', 'keep it private']);
  const definesExecutiveAuthority = includesAny(input, ['executive authority', 'authority', 'recommendation', 'disagree privately', 'support publicly', 'delegate', 'responsibility']);
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
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
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
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'shuttle-rendezvous' && rawInput.trim()) {
    return {
      summary: 'Establish the new XO arrival tone while boarding a working ship.',
      primaryIntent: 'establish-arrival-tone',
      targetIds: ['mara-whitaker', 'priya-nayar', 'hadrik-bronn'],
      declaredMethod: [
        reportsAboard ? 'formal report aboard' : null,
        respectsWorkingProcess ? 'respect working transfer routines' : null,
        asksForHandoff ? 'ask for operational handoff' : null,
        immediateInspection ? 'immediate inspection posture' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'The player is arriving as permanent XO while the Breckinridge remains under working shakedown routines.',
        'Small choices during boarding shape whether existing routines feel respected or overridden.'
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
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
        departureStrength,
        impossibleOrUnsupported
      }
    };
  }

  if (activePhaseId === 'ready-room-handover' && rawInput.trim()) {
    return {
      summary: 'Complete the ready-room command handover and establish an initial command value.',
      primaryIntent: 'complete-ready-room-handover',
      targetIds: ['mara-whitaker', 'hadrik-bronn'],
      declaredMethod: [
        namesPersonalValue ? 'states a personal command value' : null,
        defersPersonalValue ? 'defers a personal value' : null,
        definesExecutiveAuthority ? 'defines executive authority' : null,
        asksForHandoff ? 'asks for clean handoff details' : null
      ].filter(Boolean).join(', ') || rawInput.trim(),
      assumptions: [
        'Whitaker retains final command authority while testing whether the XO can make recommendations and own routine execution.',
        'Bronn wants a competent handoff rather than a symbolic replacement scene.'
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
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
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
        reportsAboard,
        respectsWorkingProcess,
        asksForHandoff,
        immediateInspection,
        namesPersonalValue,
        defersPersonalValue,
        definesExecutiveAuthority,
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
      reportsAboard,
      respectsWorkingProcess,
      asksForHandoff,
      immediateInspection,
      namesPersonalValue,
      defersPersonalValue,
      definesExecutiveAuthority,
      departureStrength,
      impossibleOrUnsupported
    }
  };
}
