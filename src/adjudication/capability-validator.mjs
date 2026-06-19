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
    const departureStrength = intentParse.signals?.departureStrength || 'weak';
    if (departureStrength === 'compelling') {
      return {
        authority: {
          result: 'captainApprovedWithConditions',
          basis: [
            'The player is the Breckinridge XO and presents a credible, time-sensitive Starfleet reason.',
            'Captain Whitaker retains command authority and can approve a limited deviation when evidence, urgency, and a feasible return plan are present.'
          ]
        },
        capability: {
          result: 'feasibleWithCommandApproval',
          basis: [
            'The ship can leave the current operational frame under Captain approval.',
            'A limited plan can preserve some Hesperus support while the Breckinridge investigates the urgent threat.'
          ]
        },
        constraints: [
          'The deviation must be logged as Whitaker-approved.',
          'The original Hesperus pressure continues while the ship is gone.',
          'The ship must return or hand off the Hesperus response once the urgent threat is contained.'
        ],
        result: 'authorizedDeviationWithConditions'
      };
    }
    if (departureStrength === 'partial') {
      return {
        authority: {
          result: 'captainCounteroffersLimitedDeviation',
          basis: [
            'The player identifies a plausible concern, but not enough to justify taking the Breckinridge fully away from the Hesperus.',
            'Captain Whitaker can authorize a limited alternative while preserving the active rescue obligation.'
          ]
        },
        capability: {
          result: 'limitedAlternativeAvailable',
          basis: [
            'The ship can deploy remote sensors, a buoy, a probe, or a delegated follow-up without abandoning the current scene.',
            'The Hesperus response can continue under the existing command frame.'
          ]
        },
        constraints: [
          'The Breckinridge does not leave the operational frame yet.',
          'A limited investigation may create later evidence.',
          'The player may return with stronger grounds for a full deviation.'
        ],
        result: 'captainCounterofferRequired'
      };
    }
    return {
      authority: {
        result: 'captainRefusesInsufficientCause',
        basis: [
          'The player is the Breckinridge XO, not unilateral strategic authority for abandoning current orders.',
          'Captain Whitaker may approve a deviation if the player presents credible evidence, urgency, and a feasible plan.',
          'The current request does not yet provide enough cause to leave the Hesperus pressure behind.'
        ]
      },
      capability: {
        result: 'physicallyPossibleButDenied',
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
      result: 'deviationDenied'
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

  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    return {
      authority: {
        result: 'availableWithinMissionFrame',
        basis: [
          'The player is the newly assigned permanent XO.',
          'Boarding, reporting, and initial handoff behavior are within the XO role.'
        ]
      },
      capability: {
        result: 'feasible',
        basis: [
          'The Breckinridge is already at the transfer waypoint.',
          'Priya, Bronn, and Whitaker can absorb a working handoff without stopping ship operations.'
        ]
      },
      constraints: [
        'The ship is not holding a ceremonial reception.',
        'Existing provisional routines should be respected or deliberately changed with a clear command reason.'
      ],
      result: 'authorizedAndFeasible'
    };
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is taking over executive authority from the acting XO.',
          'Whitaker retains final command authority and can define delegation boundaries.'
        ]
      },
      capability: {
        result: 'feasible',
        basis: [
          'Whitaker and Bronn are available for the handover.',
          'The player can state command values, ask for boundaries, or defer personal disclosure without blocking mission progress.'
        ]
      },
      constraints: [
        'A stated value creates future expectations.',
        'A deferred value preserves privacy but leaves Whitaker and Bronn with less signal.'
      ],
      result: 'authorizedAndFeasible'
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
