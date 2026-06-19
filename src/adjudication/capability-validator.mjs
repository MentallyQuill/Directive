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

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    return {
      authority: {
        result: 'availableWithCaptainOversight',
        basis: [
          'The player is the Breckinridge XO and can set working priorities for the remaining transit.',
          'Whitaker retains final authority but expects the XO to turn senior-staff concerns into executable ownership.'
        ]
      },
      capability: {
        result: 'feasibleWithTradeoffs',
        basis: [
          'Priya can coordinate schedule and routing boundaries.',
          'Kieran, Rowan, Miriam, and Imani can own department-specific readiness work when the XO gives clear priorities.',
          'The remaining transit does not allow every concern to receive full time before arrival.'
        ]
      },
      constraints: [
        'At least one readiness concern must be accepted, deferred, combined, or delegated with a named owner.',
        'Medical and engineering limits cannot be made safe by optimism.',
        'A coherent readiness stance is needed before the fallback-command drill.'
      ],
      result: 'authorizedAndFeasibleWithTradeoffs'
    };
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    return {
      authority: {
        result: 'availableWithCaptainOversight',
        basis: [
          'The player is the Breckinridge XO and can define drill execution, fallback authority, and follow-up ownership.',
          'Whitaker retains final command authority, but the fallback-command drill is an XO integration responsibility.'
        ]
      },
      capability: {
        result: 'feasibleWithTechnicalConstraint',
        basis: [
          'Bronn can identify security failure conditions and incompatible emergency habits.',
          'Priya can route certificate-chain exceptions into accountable process.',
          'Imani can assess whether the certificate issue needs immediate remediation or a logged temporary workaround.'
        ]
      },
      constraints: [
        'Fallback authority must be clear enough to execute under bridge loss or compromised communications.',
        'The command-network certificate issue cannot be treated as solved until remediation is assigned or the limitation is logged.',
        'A repeated drill consumes time, while a temporary protocol carries technical debt forward.'
      ],
      result: 'authorizedAndFeasibleWithTechnicalConstraint'
    };
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    return {
      authority: {
        result: 'availableWithinMissionFrame',
        basis: [
          'The player is the Breckinridge XO and can set routine expectations for how senior officers bring concerns, follow-up, and dissent.',
          'Command rhythm scenes are routine executive work, not a request for extraordinary authority.'
        ]
      },
      capability: {
        result: 'feasibleWithSocialCost',
        basis: [
          'Senior staff are available during the transit interval for focused operational contact.',
          'Meaningful rhythm requires concrete follow-up or expectations rather than generalized rapport.',
          'The player can contact two or more officers before the next mission pressure surfaces.'
        ]
      },
      constraints: [
        'This interval should not become a biography tour or equal-time briefing.',
        'Relationship changes derive from the actual expectations and follow-up created.',
        'The next mission pressure may arrive before every officer receives direct attention.'
      ],
      result: 'authorizedAndFeasibleWithSocialCost'
    };
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    return {
      authority: {
        result: 'availableWithinMissionFrame',
        basis: [
          'The player is the Breckinridge XO and can assign follow-up work created by the Hesperus response.',
          'The aftermath is administrative and operational continuity, not a new request for extraordinary authority.'
        ]
      },
      capability: {
        result: 'feasibleWithFollowupObligations',
        basis: [
          'Engineering can document emergency repair limits.',
          'Medical can follow passengers or fatigue consequences.',
          'Operations can route legal and administrative obligations.',
          'Flight and science can preserve schedule and optional data follow-up when named.'
        ]
      },
      constraints: [
        'Follow-up work consumes attention even if it does not stop the ship.',
        'The escape-pod subspace data should not become known unless science follow-up is assigned.',
        'The Hesperus aftermath must not imply a Pale Lantern connection.'
      ],
      result: 'authorizedAndFeasibleWithFollowupObligations'
    };
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    return {
      authority: {
        result: 'availableWithCaptainOversight',
        basis: [
          'The player is the Breckinridge XO and can recommend whether the shakedown test continues, pauses, shifts control, or reports incomplete readiness.',
          'Whitaker retains final authority, but the test is a direct measure of the XO readiness posture.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Imani can define the technical risk and any temporary workaround.',
          'Kieran can execute or stand down the flight profile under defined abort criteria.',
          'Priya can preserve the readiness report and schedule consequences.'
        ]
      },
      constraints: [
        'The command-network certificate issue and combined-load risk are ordinary technical problems, not sabotage.',
        'Continuing under reduced redundancy may preserve schedule but carries technical debt.',
        'Pausing or reporting incomplete readiness is valid if command owns the schedule and reporting cost.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can make the final executive readiness recommendation.',
          'Whitaker retains final command authority and can accept, challenge, or condition the recommendation.'
        ]
      },
      capability: {
        result: 'feasibleFromCommittedPreludeState',
        basis: [
          'The final review can summarize committed Prelude flags, clocks, relationship memory, and readiness consequences.',
          'Priya can route arrival posture and any readiness caveat into the Asterion approach.',
          'Whitaker can set the transition into the first Chapter 1 frame once the review is complete.'
        ]
      },
      constraints: [
        'The report must match committed state rather than erasing prior costs.',
        'A limitation, delay, or unresolved strain can be carried forward without blocking the campaign.',
        'The Chapter 1 distress packet may be revealed as transition pressure, but hidden campaign conspiracy information remains blocked.'
      ],
      result: 'authorizedAndFeasibleForPreludeCompletion'
    };
  }

  if (intentParse.primaryIntent === 'request-chapter-1-counsel') {
    return {
      authority: {
        result: 'availableWithinMissionFrame',
        basis: [
          'The player is the Breckinridge XO and can request compact professional counsel from senior officers.',
          'Asking for counsel does not surrender command authority or make the Captain decide by default.'
        ]
      },
      capability: {
        result: 'feasible',
        basis: [
          'Priya, Bronn, Rowan, Miriam, and Imani have relevant professional lanes for the convoy opening.',
          'The advice can remain compact and character-specific without committing a response posture.'
        ]
      },
      constraints: [
        'Counsel must not reveal director-only facts.',
        'Reports should inform the decision without labeling one option as correct.'
      ],
      result: 'authorizedAndFeasible'
    };
  }

  if (intentParse.primaryIntent === 'set-initial-convoy-posture') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can organize the first response to Relief Convoy Twelve.',
          'Captain Whitaker retains final authority for weapons escalation, detention, or major legal deviation.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Operations can log, preserve, and authenticate the distress packet.',
          'Science and tactical can support remote verification before boarding.',
          'Medical and engineering can prepare rescue and quarantine posture while uncertainty remains.'
        ]
      },
      constraints: [
        'No boarding, weapons escalation, or quarantine bypass should be assumed unless the player orders it.',
        'Rescue speed, evidence preservation, quarantine posture, and security posture create real tradeoffs.',
        'Major escalation may require Whitaker authorization or an emergency basis.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
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
