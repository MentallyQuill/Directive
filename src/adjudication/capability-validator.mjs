export function checkAuthorityAndCapability({ actionClassification, intentParse }) {
  if (actionClassification.category === 'impossibleOrUnsupportedMove') {
    return {
      authority: {
        result: 'insufficient',
        basis: ['The requested action is not currently supported by the mission frame.']
      },
      capability: {
        result: 'unavailable',
        basis: ['No valid execution path exists in the current scene state.']
      },
      constraints: ['The player needs a clearer actionable method or a supported target.'],
      result: 'unsupported'
    };
  }

  if (actionClassification.category === 'missionAbandoningMove') {
    return {
      authority: {
        result: 'requiresCaptainDecision',
        basis: [
          'The player is the Breckinridge XO, not unilateral strategic authority for abandoning current orders.',
          'Captain Whitaker may approve a deviation if the player presents credible evidence, urgency, and a feasible plan.'
        ]
      },
      capability: {
        result: 'physicallyPossibleWithCommandApproval',
        basis: [
          'The ship can leave if the Captain orders or authorizes it.',
          'The original mission pressure will continue moving while the ship is gone.'
        ]
      },
      constraints: [
        'Starfleet orders and Captain intent must be addressed.',
        'The original mission clock may advance.',
        'The player must accept the cost of delay or abandonment.'
      ],
      result: 'captainDecisionRequired'
    };
  }

  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    return {
      authority: {
        result: 'sufficientWithCaptainOversight',
        basis: [
          'Player is the Breckinridge XO.',
          "Whitaker requested the player's recommendation.",
          'Passenger safety and inspection fraud create lawful emergency grounds for limited orders.'
        ]
      },
      capability: {
        result: 'partialSuccessAvailable',
        basis: [
          'Miriam can identify and prioritize medically vulnerable passengers.',
          'Imani can stabilize the injector for impulse travel only.',
          'Priya can preserve the inspection record and start formal routing.',
          'Bronn can secure the vessel without treating passengers as detainees.'
        ]
      },
      constraints: [
        'The Hesperus cannot be certified for warp service.',
        'The Breckinridge accepts a minor arrival delay.',
        'Formal inquiry must happen after immediate passenger safety is handled.'
      ],
      result: 'authorizedAndFeasibleWithCost'
    };
  }

  return {
    authority: {
      result: 'availableWithinMissionFrame',
      basis: ['The player is acting as XO inside the active mission phase.']
    },
    capability: {
      result: 'feasibleWithUnknownCost',
      basis: ['The action engages the mission frame but needs more specific adjudication rules.']
    },
    constraints: ['Resolve with conservative costs until a mission-specific rule is implemented.'],
    result: 'authorizedButNeedsSpecificResolution'
  };
}
