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
        missionDeparture
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
        missionDeparture
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
      missionDeparture
    }
  };
}
