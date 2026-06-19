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

  if (intentParse.primaryIntent === 'set-first-boarding-threshold') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can set the first boarding, rescue, and evidence-custody threshold.',
          'Captain Whitaker retains final authority for weapons use, detention, or major legal deviation.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Medical can maintain quarantine-capable rescue readiness.',
          'Security can stage a non-escalatory boarding posture.',
          'Operations, Science, and Engineering can preserve signal, sensor, and computer evidence through first contact.'
        ]
      },
      constraints: [
        'The threshold should name what must be true before boarding or rescue contact changes risk posture.',
        'Bypassing quarantine, destroying evidence, or using weapons should remain costly unless a clear emergency basis is present.',
        'Director-only concealed-actor and hidden-signal facts must not be revealed from this authority check.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'execute-first-contact-response') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can direct the first operational contact route after the boarding threshold.',
          'Captain Whitaker retains final authority for weapons use, detention, or major legal deviation.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Operations and Engineering can preserve and access the Faraday Bell records without assuming command access.',
          'Medical and Engineering can start Parnell rescue work under quarantine-capable isolation.',
          'Security and Science can cover first contact with remote verification and non-escalatory overwatch.'
        ]
      },
      constraints: [
        'First contact can reveal player-safe records and rescue facts, but not concealed actors or hidden signal sources by default.',
        'Bypassing quarantine, destroying evidence, or using weapons should remain costly unless a clear emergency basis is present.',
        'Later off-ship, custody, cargo, and concealed-vessel discoveries require future supported beats.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'frame-offsite-custody-cargo-leads') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can direct follow-up from first contact into shelter, custody, and cargo-lead work.',
          'Captain Whitaker retains final authority for weapons use, detention, or major legal confrontation.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Operations and Science can connect first-contact records, shelter telemetry, and routing evidence.',
          'Medical can frame shelter triage while maintaining quarantine discipline.',
          'Security, Operations, and Engineering can frame a custody response and preserve a missing-cargo lead without resolving it immediately.'
        ]
      },
      constraints: [
        'This beat can reveal player-facing shelter, custody, and missing-cargo facts, but it should not explain the unrevealed causal chain behind the false orders.',
        'Escalating against local personnel, bypassing medical controls, or compromising records should remain costly unless a clear emergency basis is present.',
        'Negotiation outcome, cargo recovery, and deeper signal-source truth require later supported beats.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'set-pell-contact-terms') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can set first contact terms for Pell, Ivers, and the missing cargo.',
          'Captain Whitaker retains final authority for weapons use, detention, or a major jurisdictional confrontation.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Priya can open a lawful channel and share player-facing evidence without conceding the custody claim.',
          'Bronn can define a credible safety perimeter without forcing a firefight.',
          'Engineering and Operations can preserve a cargo recovery undertaking while the negotiation remains unresolved.'
        ]
      },
      constraints: [
        'This beat can reveal Pell warning and cargo-manifest facts, but it should not resolve release, cargo recovery, or the deeper false-order source.',
        'Threats, detention, or weapons pressure should make the contact posture more costly unless a lawful emergency basis is explicit.',
        'Persuasion or command progression requires concrete terms and accepted tradeoffs, not tone alone.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'execute-joint-inspection-release') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can execute the agreed joint inspection and supervised witness release terms.',
          'Captain Whitaker retains final authority for force, detention, or any public jurisdictional concession.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Priya can formalize the shared record and give Pell a lawful exit through Compact channels.',
          'Bronn can supervise Ivers release and keep the perimeter credible without treating the Compact cutter as hostile by default.',
          'Engineering, Operations, and Science can protect the cargo evidence chain while recovery remains incomplete.'
        ]
      },
      constraints: [
        'This beat can reveal Ivers supervised-statement and shared-record facts, but it should not complete cargo recovery or identify the deeper false-order source.',
        'Threats, detention, weapons pressure, or damaged records should harden the custody dispute and weaken the inspection route.',
        'A successful route requires concrete inspection execution, witness release, shared record, lawful exit, and cargo evidence custody.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'trace-cargo-diagnostic-pulse') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can direct non-hostile signal tracing and recovery preparation under the open joint inspection record.',
          'Captain Whitaker retains final authority for force, seizure, or any final custody arrangement.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Science and Engineering can trace a weak diagnostic pulse against the manifest without declaring final attribution.',
          'Priya can keep the signal trace inside the shared inspection record and Pell lawful-exit channel.',
          'Security can hold a defensive perimeter without converting the cargo lead into a weapons incident.'
        ]
      },
      constraints: [
        'This beat can reveal cargo-signal and recovery-locus facts, but it should not complete hardware recovery or reveal the later use of the hardware.',
        'Immediate seizure, weapons pressure, or damaged records should compromise the shared recovery route.',
        'A successful route requires signal tracing, joint custody, evidence chain protection, and non-hostile security posture.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'recover-hardware-under-seal') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can direct recovery of the missing emergency hardware under the active joint inspection record.',
          'Captain Whitaker retains final authority for force, public attribution, or final custody disposition.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Engineering and Science can recover the hardware while preserving diagnostic telemetry.',
          'Priya can keep the evidence seal and final custody question inside a lawful shared process.',
          'Security can hold a defensive perimeter without converting recovery into a seizure.'
        ]
      },
      constraints: [
        'This beat can reveal recovery-under-seal and timing-trace facts, but it should not reveal later hardware use or the final false-order source.',
        'Immediate seizure, weapons pressure, or damaged telemetry should make the recovery contested or compromised.',
        'A successful route requires recovery, joint seal, telemetry preservation, lawful cooperation, and non-hostile security posture.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'set-chapter1-resolution-terms') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can recommend the Chapter 1 resolution record, witness terms, and follow-up obligations.',
          'Captain Whitaker retains final authority for public attribution, force posture, and any final diplomatic concession.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Priya can turn the joint inspection route into an incident record with lawful Compact access terms.',
          'Ivers, Pell, Rowan, Miriam, and Imani can provide witness, evidence, authentication, rescue, and engineering follow-up inputs.',
          'Security can keep the closure from becoming a coercive jurisdictional incident.'
        ]
      },
      constraints: [
        'This beat can reveal player-facing resolution, access, and authentication-accountability facts, but it should not reveal the final false-order source.',
        'Authority-only closure, denied Compact access, or undocumented technical debt should prevent a cooperative resolution.',
        'A successful cooperative route requires a joint record, Ivers trust, Pell witness terms, Compact access, authentication accountability, and documented rescue follow-up.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'transition-chapter1-to-false-colors') {
    return {
      authority: {
        result: 'availableWithinMissionFrame',
        basis: [
          'The player can direct how the Breckinridge carries the Chapter 1 record into Asterion Station and responds to the first false-colors report.',
          'Captain Whitaker retains final authority for any pursuit, public accusation, or weapons posture.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Priya can brief Asterion and preserve the joint record handoff.',
          'Rowan can begin comparing the patrol report against ship telemetry without declaring attribution.',
          'Bronn can hold a non-hostile defensive posture while the accusation is verified.'
        ]
      },
      constraints: [
        'This beat can reveal Asterion arrival and the Compact patrol report, but it should not reveal who staged the impersonation or why.',
        'Weapons escalation or immediate pursuit should make the transition contested rather than clean.',
        'A successful transition requires arrival, record handoff, report receipt, authority notification, and non-hostile posture.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'set-false-colors-transparency-terms') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can recommend first transparency, medical, audit, and access terms during the Asterion briefing.',
          'Captain Whitaker retains final authority for classified disclosures, public culpability statements, or any force posture.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Priya and Rowan can build an independent audit chain around logs, telemetry, challenge codes, and sensor baselines.',
          'Miriam can offer Aegis Two medical help without making care conditional on political concessions.',
          'Bronn can define a controlled access boundary that verifies identity claims without surrendering command authentication architecture.'
        ]
      },
      constraints: [
        'This beat can reveal player-facing attack, signature, alibi, casualty, and transparency-terms facts, but it should not reveal who staged the impersonation or how the attacking craft was built.',
        'Starfleet-only proof, denied access, or unrestricted command-authentication disclosure should prevent a clean transparency posture.',
        'A successful route requires independent verification, medical help, alibi proof, and a controlled tactical secrecy boundary.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'establish-orison-evidence-baseline') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can direct how the agreed transparency terms become an independent evidence baseline.',
          'Captain Whitaker retains final authority for public accusations, classified disclosures, and legal escalation against Compact officials.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Priya can preserve Orison traffic records and audit chain with Compact observer participation.',
          'Rowan can reconstruct the attacker route from preserved civilian and station sensor baselines while keeping conclusions probabilistic.',
          'Imani can compare post-refit calibration data against the recorded warp-field artifact without exposing command authentication architecture.'
        ]
      },
      constraints: [
        'This beat can reveal player-facing Orison baseline, Breckinridge calibration mismatch, and attacker-route reconstruction facts, but it should not identify the attacking craft, control route, hidden faction, or local insider source.',
        'Unsupported public accusation, Starfleet-only proof, overexposed tactical systems, or failure to preserve independent baselines should compromise the evidence route.',
        'A successful route requires independent baseline preservation, audit chain, calibration comparison, route reconstruction, and controlled disclosure boundaries.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'stabilize-aegis-medical-trust') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can direct how Starfleet medical aid is offered under the Chapter 2 transparency framework.',
          'Captain Whitaker and Doctor Sato retain final authority over medical ethics, public culpability statements, and any attempt to compel testimony.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Miriam can stabilize Aegis Two casualties while respecting patient consent and medical privacy.',
          'Priya can record medical neutrality and coordinate Compact observers so care is trustworthy without becoming a concession.',
          'Rowan and Priya can preserve voluntary patrol testimony for the audit once the patient is medically cleared.'
        ]
      },
      constraints: [
        'This beat can reveal player-facing medical-channel, critical-officer stabilization, and voluntary patrol-testimony facts, but it should not reveal the attacking craft, hidden source, or later control-route evidence.',
        'Care used as leverage, forced questioning, or treatment conditioned on cooperation should damage medical trust and public legitimacy.',
        'A successful route requires care, medical neutrality, Compact-observable trust, patient consent, and voluntary testimony preservation.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'set-security-access-demonstration') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can recommend the access boundary and demonstration method for the Chapter 2 command-system dispute.',
          'Captain Whitaker and Rear Admiral Tolland retain final authority over classified disclosure, command-authentication architecture, and any public culpability statement.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Bronn can demonstrate tactical-security and command-authentication integrity through controlled challenge-response evidence without exposing the full architecture.',
          'Priya and Rowan can prepare selected observer-facing proof, logs, and technical summaries that support Kessler without giving Holt unrestricted access.',
          'Whitaker can enforce the disclosure boundary if the player offers a credible alternative rather than a flat refusal.'
        ]
      },
      constraints: [
        'This beat can reveal player-facing command-authentication annex, security demonstration, and access-alternative facts, but it should not identify the attacking craft, hidden source, control route, or local insider source.',
        'Unrestricted command-system inspection, Starfleet-only denial, or scapegoating Bronn should compromise the security-access front.',
        'A successful route requires a controlled annex, a real demonstration, Bronn professionalized rather than blamed, Kessler given a defensible alternative, and Tolland disclosure limits honored.'
      ],
      result: 'authorizedAndFeasibleWithOperationalRisk'
    };
  }

  if (intentParse.primaryIntent === 'frame-joint-investigation-charter') {
    return {
      authority: {
        result: 'availableWithCaptainFinalAuthority',
        basis: [
          'The player is the Breckinridge XO and can recommend the joint investigation frame, audit protections, and Open Orders posture for the Chapter 2 closeout.',
          'Captain Whitaker and Director Kessler retain final authority over public legitimacy statements, legal access restrictions, and regional mission availability.'
        ]
      },
      capability: {
        result: 'feasibleWithOperationalRisk',
        basis: [
          'Priya and Rowan can preserve the audit record and weak Hecate lead for later correlation without claiming final attribution.',
          'Kessler can support a public framework if the statement gives her a defensible path rather than a humiliating retreat.',
          'Whitaker can accept a temporary Open Orders presence in the Reach if the first crisis is contained without overpursuit.'
        ]
      },
      constraints: [
        'This beat can reveal player-facing joint-charter, Kessler legitimacy, Holt interference-restriction, weak Hecate lead, and Open Orders transition facts.',
        'The weak Hecate trace must not be treated as final attribution or grounds for immediate pursuit.',
        'Unsupported public accusation against Holt, coercive escalation, or failure to give Kessler a defensible statement should compromise the closeout.'
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
