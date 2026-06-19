import { clampClockValue, getClockValue } from './graph-lookup.mjs';

function clockDelta(graphIndex, campaignState, id, to, reason) {
  const graphClock = graphIndex.clocks.get(id);
  const from = getClockValue(campaignState, id, graphClock?.initial || 0);
  return {
    id,
    from,
    to: clampClockValue(graphIndex, id, to),
    reason
  };
}

function commandDecisionFlagValue(awards) {
  const tracks = new Set((awards || []).map((award) => award.track));
  if (tracks.has('Inspiration') && tracks.has('Resolve')) {
    return 'inspiration-and-resolve-awarded';
  }
  if (tracks.has('Inspiration')) {
    return 'inspiration-awarded';
  }
  if (tracks.has('Resolve')) {
    return 'resolve-awarded';
  }
  return 'handled-without-progression';
}

function buildCommandStyleDelta(awards) {
  return {
    earnedRecordsAdd: awards.map((award) => ({
      track: award.track,
      decisionId: award.id,
      summary: award.track === 'Resolve'
        ? 'The player earned Resolve by placing the Hesperus owner under formal inquiry while accepting responsibility for the delay.'
        : 'The player earned Inspiration by protecting vulnerable passengers while preserving evidence through cooperation.'
    })),
    awardedDecisionIdsAdd: awards.map((award) => award.id)
  };
}

function phaseAdvanceDelta(phaseAdvance) {
  if (!phaseAdvance) {
    return {};
  }
  return {
    activePhaseIdSet: phaseAdvance.to,
    phaseSet: phaseAdvance.to,
    availableDecisionPointIdsSet: phaseAdvance.availableDecisionPointIds || [],
    phaseAdvance
  };
}

function emptyCommandStyleDelta() {
  return {
    earnedRecordsAdd: [],
    awardedDecisionIdsAdd: []
  };
}

function arrivalCrewIntegrationValue(intentParse) {
  const signals = intentParse.signals || {};
  if (signals.immediateInspection && !signals.asksForHandoff && !signals.respectsWorkingProcess) {
    return 'blank-slate-command';
  }
  if (signals.respectsWorkingProcess || signals.asksForHandoff || signals.reportsAboard) {
    return 'deliberately-blended';
  }
  return 'unsettled';
}

function handoverWhitakerValue(intentParse) {
  const signals = intentParse.signals || {};
  if (signals.namesPersonalValue || signals.definesExecutiveAuthority) {
    return 'delegation-confidence-improved';
  }
  return 'evaluating';
}

function handoverBronnValue(intentParse) {
  const signals = intentParse.signals || {};
  if (signals.namesPersonalValue || signals.definesExecutiveAuthority || signals.asksForHandoff) {
    return 'acting-service-respected';
  }
  return 'debate-not-closed';
}

function readinessFlagValue(signals, flagId) {
  if (flagId === 'prelude.kieran') {
    if (signals.approvesFlightProfile && signals.acceptsReadinessRisk) {
      return 'flight-profile-responsibly-approved';
    }
    if (signals.approvesFlightProfile) {
      return 'boldness-mentored';
    }
    return 'unsettled';
  }
  if (flagId === 'prelude.priya') {
    if (signals.formalizesOpsCoordination || signals.delegatesReadinessWork) {
      return 'coordination-formalized';
    }
    return 'approval-bottlenecked';
  }
  if (flagId === 'prelude.rowan') {
    if (signals.definesScienceThreshold) {
      return 'investigation-threshold-defined';
    }
    return 'unsettled';
  }
  if (flagId === 'prelude.miriam') {
    if (signals.protectsMedicalReadiness) {
      return 'medical-restrictions-respected';
    }
    return 'unsettled';
  }
  if (flagId === 'prelude.imani') {
    if (signals.protectsEngineeringReadiness) {
      return 'documentation-and-repair-time-protected';
    }
    return 'unsettled';
  }
  if (flagId === 'prelude.ship-state') {
    if (signals.protectsEngineeringReadiness && signals.acceptsReadinessRisk) {
      return 'incomplete-honestly-reported';
    }
    return 'untested-limitations-remain';
  }
  return 'unsettled';
}

function readinessRelationshipChanges(signals) {
  const changes = [];
  if (signals.formalizesOpsCoordination || signals.delegatesReadinessWork) {
    changes.push('Priya notes that readiness work has named ownership instead of informal approval bottlenecks.');
  }
  if (signals.approvesFlightProfile) {
    changes.push('Kieran reads the flight-readiness priority as permission to prove boldness inside defined limits.');
  }
  if (signals.definesScienceThreshold) {
    changes.push('Rowan hears a usable threshold for when inconvenient findings should interrupt the schedule.');
  }
  if (signals.protectsMedicalReadiness) {
    changes.push('Miriam sees medical restrictions treated as operational facts rather than comfort preferences.');
  }
  if (signals.protectsEngineeringReadiness) {
    changes.push('Imani sees documentation and repair time protected before the combined-load risk is tested.');
  }
  if (changes.length === 0) {
    changes.push('The senior staff leave the conference still waiting for clearer executive ownership.');
  }
  return changes;
}

function fallbackFlagValue(signals, flagId) {
  if (flagId === 'prelude.crew-integration') {
    if (signals.buildsFallbackConsensus || signals.standardizesFallbackProcedure) {
      return 'deliberately-blended';
    }
    if (signals.setsTemporaryFallbackProtocol && signals.defersFallbackRemediation) {
      return 'unsettled';
    }
    return 'temporary-divisions-hardened';
  }
  if (flagId === 'prelude.bronn') {
    if (signals.usesBronnFailureConditions || signals.standardizesFallbackProcedure) {
      return 'failure-conditions-used-well';
    }
    return 'debate-not-closed';
  }
  if (flagId === 'prelude.priya') {
    if (signals.assignsCertificateRemediation || signals.buildsFallbackConsensus) {
      return 'delegation-boundaries-clear';
    }
    return 'approval-bottlenecked';
  }
  if (flagId === 'prelude.imani') {
    if (signals.defersFallbackRemediation || signals.setsTemporaryFallbackProtocol) {
      return 'temporary-workarounds-normalized';
    }
    if (signals.assignsCertificateRemediation) {
      return 'technical-debt-owned';
    }
    return 'unsettled';
  }
  if (flagId === 'prelude.ship-state') {
    if (signals.setsTemporaryFallbackProtocol || signals.defersFallbackRemediation) {
      return 'complete-with-accepted-limitation';
    }
    if (signals.assignsCertificateRemediation && (signals.standardizesFallbackProcedure || signals.buildsFallbackConsensus)) {
      return 'incomplete-honestly-reported';
    }
    return 'untested-limitations-remain';
  }
  return 'unsettled';
}

function fallbackRelationshipChanges(signals) {
  const changes = [];
  if (signals.usesBronnFailureConditions || signals.standardizesFallbackProcedure) {
    changes.push('Bronn sees the fallback-command drill used to define real failure conditions rather than to perform control.');
  }
  if (signals.assignsCertificateRemediation || signals.buildsFallbackConsensus) {
    changes.push('Priya sees the command-network certificate exception routed into accountable ownership.');
  }
  if (signals.defersFallbackRemediation || signals.setsTemporaryFallbackProtocol) {
    changes.push('Imani records the temporary workaround as accepted technical debt rather than a completed repair.');
  } else if (signals.assignsCertificateRemediation) {
    changes.push('Imani sees technical remediation assigned before the workaround can become invisible routine.');
  }
  if (changes.length === 0) {
    changes.push('The fallback-command drill exposes real command-survivability risk without enough settled ownership.');
  }
  return changes;
}

function contactedOfficerIds(signals) {
  return signals.contactedOfficerIds || [
    signals.contactsKieran ? 'kieran-vale' : null,
    signals.contactsPriya ? 'priya-nayar' : null,
    signals.contactsBronn ? 'hadrik-bronn' : null,
    signals.contactsRowan ? 'rowan-saye' : null,
    signals.contactsMiriam ? 'miriam-sato' : null,
    signals.contactsImani ? 'imani-cross' : null
  ].filter(Boolean);
}

function commandCultureTendency(signals) {
  if (signals.invitesDissent && signals.setsCommandBoundaries) {
    return 'bounded-dissent';
  }
  if (signals.delegatesCommandRhythm) {
    return 'delegated-follow-through';
  }
  if (signals.setsConcernEscalationExpectation) {
    return 'explicit-escalation-thresholds';
  }
  if (signals.setsCommandBoundaries) {
    return 'clear-operational-boundaries';
  }
  return 'emerging-rhythm';
}

function commandRhythmRelationshipChanges(signals) {
  const changes = [];
  if (signals.contactsPriya) {
    changes.push('Priya sees a clearer channel for bringing coordination concerns to the XO before they become invisible obligations.');
  }
  if (signals.contactsBronn) {
    changes.push('Bronn sees dissent and failure conditions given a defined lane before command closes debate.');
  }
  if (signals.contactsKieran) {
    changes.push('Kieran receives responsibility tied to standards rather than permission to improvise without review.');
  }
  if (signals.contactsRowan) {
    changes.push('Rowan hears that inconvenient evidence should be escalated through thresholds rather than suppressed for schedule comfort.');
  }
  if (signals.contactsMiriam) {
    changes.push('Miriam sees medical concerns treated as operational inputs before a crisis forces the issue.');
  }
  if (signals.contactsImani) {
    changes.push('Imani sees technical follow-up tied to command rhythm rather than isolated engineering preference.');
  }
  if (changes.length === 0) {
    changes.push('The command rhythm interval remains too vague for senior staff to change professional behavior yet.');
  }
  return changes;
}

function hesperusFollowupRecords(outcomePacket, signals) {
  return [
    signals.assignsHesperusEngineering ? {
      id: `${outcomePacket.id}.engineering`,
      domain: 'engineering',
      ownerCrewId: 'imani-cross',
      summary: 'Document Hesperus emergency repairs and protect inspection time for the injector limitations.',
      status: 'open',
      sourceOutcomeId: outcomePacket.id
    } : null,
    signals.assignsHesperusMedical ? {
      id: `${outcomePacket.id}.medical`,
      domain: 'medical',
      ownerCrewId: 'miriam-sato',
      summary: 'Follow displaced passenger medical needs and any Breckinridge crew fatigue consequences.',
      status: 'open',
      sourceOutcomeId: outcomePacket.id
    } : null,
    signals.assignsHesperusLegal ? {
      id: `${outcomePacket.id}.legal-admin`,
      domain: 'legal-admin',
      ownerCrewId: 'priya-nayar',
      summary: 'Route inspection-fraud evidence and owner inquiry obligations through accountable channels.',
      status: 'open',
      sourceOutcomeId: outcomePacket.id
    } : null,
    signals.assignsHesperusFlight ? {
      id: `${outcomePacket.id}.flight`,
      domain: 'flight-planning',
      ownerCrewId: 'kieran-vale',
      summary: 'Recalculate arrival plan and schedule margin after the Hesperus delay.',
      status: 'open',
      sourceOutcomeId: outcomePacket.id
    } : null,
    signals.preservesEscapePodData ? {
      id: `${outcomePacket.id}.science`,
      domain: 'science',
      ownerCrewId: 'rowan-saye',
      summary: 'Preserve escape-pod subspace data as optional scientific follow-up, not an emergency.',
      status: 'open',
      sourceOutcomeId: outcomePacket.id
    } : null
  ].filter(Boolean);
}

function hesperusAftermathFlags(signals) {
  const flags = [];
  if (signals.assignsHesperusEngineering) {
    flags.push({ id: 'prelude.imani', value: 'technical-debt-owned' });
  }
  if (signals.assignsHesperusMedical) {
    flags.push({ id: 'prelude.miriam', value: 'human-cost-named' });
  }
  if (signals.assignsHesperusLegal) {
    flags.push({ id: 'prelude.priya', value: 'delegation-boundaries-clear' });
  }
  if (signals.assignsHesperusFlight) {
    flags.push({ id: 'prelude.kieran', value: 'flight-profile-responsibly-approved' });
  }
  if (signals.preservesEscapePodData) {
    flags.push({ id: 'prelude.rowan', value: 'investigation-threshold-defined' });
  }
  return flags;
}

function hesperusAftermathAffectedCrew(signals) {
  return [
    signals.assignsHesperusEngineering ? 'imani-cross' : null,
    signals.assignsHesperusMedical ? 'miriam-sato' : null,
    signals.assignsHesperusLegal ? 'priya-nayar' : null,
    signals.assignsHesperusFlight ? 'kieran-vale' : null,
    signals.preservesEscapePodData ? 'rowan-saye' : null
  ].filter(Boolean);
}

function hesperusAftermathRelationshipChanges(signals) {
  const changes = [];
  if (signals.assignsHesperusEngineering) {
    changes.push('Imani sees the Hesperus repair limits documented instead of absorbed into invisible engineering debt.');
  }
  if (signals.assignsHesperusMedical) {
    changes.push('Miriam sees displaced passenger and crew fatigue consequences remain visible after the emergency.');
  }
  if (signals.assignsHesperusLegal) {
    changes.push('Priya sees the inspection-fraud obligations routed through accountable administration.');
  }
  if (signals.assignsHesperusFlight) {
    changes.push('Kieran receives ownership of the arrival-plan adjustment instead of inheriting an unexplained delay.');
  }
  if (signals.preservesEscapePodData) {
    changes.push('Rowan receives permission to preserve unusual data without inflating it into an emergency.');
  }
  if (changes.length === 0) {
    changes.push('Hesperus aftermath obligations remain too loose to change senior staff expectations yet.');
  }
  return changes;
}

function combinedLoadShipState(signals, outcomePacket) {
  if (signals.hidesCombinedLoadRisk) {
    return 'technically-passed-through-concealed-risk';
  }
  if (signals.reportsIncompleteTesting || signals.pausesCombinedLoadTest) {
    return 'incomplete-honestly-reported';
  }
  if (outcomePacket.resultBand === 'Success') {
    return 'integrated-test-complete';
  }
  if (outcomePacket.resultBand === 'Partial Success') {
    return 'complete-with-accepted-limitation';
  }
  return 'untested-limitations-remain';
}

function combinedLoadRelationshipChanges(signals, outcomePacket) {
  const changes = [];
  if (signals.setsKieranAbortCriteria) {
    changes.push('Kieran sees the flight profile approved through abort criteria rather than indulgence.');
  } else if (signals.continuesUnderReducedRedundancy) {
    changes.push('Kieran sees the flight profile tied to schedule pressure more than development standards.');
  }
  if (signals.reportsIncompleteTesting || signals.pausesCombinedLoadTest || signals.runsStagedLoadTest) {
    changes.push('Imani sees the combined-load limitation treated as readiness truth rather than engineering embarrassment.');
  } else if (signals.acceptsImaniWorkaround) {
    changes.push('Imani sees the temporary workaround accepted as debt that still needs final review.');
  }
  if (signals.hidesCombinedLoadRisk) {
    changes.push('Priya registers that the readiness record is being made harder to defend later.');
  } else {
    changes.push('Priya can route the readiness status through accountable reporting.');
  }
  return changes;
}

function outcomeFlagValue(campaignState, flagId, fallback = null) {
  return (campaignState?.mission?.outcomeFlags || []).find((flag) => flag.id === flagId)?.value ?? fallback;
}

function finalReviewEndState(campaignState) {
  const shipState = outcomeFlagValue(campaignState, 'prelude.ship-state', 'untested-limitations-remain');
  const arrivalDelay = outcomeFlagValue(campaignState, 'prelude.arrival-delay', 'none');
  if (['complete-with-accepted-limitation', 'incomplete-honestly-reported'].includes(shipState)) {
    return 'arrival-with-limitation';
  }
  if (['moderate', 'significant'].includes(arrivalDelay)) {
    return 'arrival-delayed';
  }
  return 'arrival-on-schedule';
}

function finalReviewWhitakerValue(signals) {
  if (signals.concealsFinalRisk) {
    return 'risk-concealed';
  }
  if (signals.reportsFinalReadinessHonestly || signals.namesUnresolvedStrain) {
    return 'uncertainty-reported-honestly';
  }
  if (signals.requestsCaptainSupport) {
    return 'delegation-confidence-improved';
  }
  return 'evaluating';
}

function finalReviewCrewIntegrationValue(campaignState, signals) {
  const current = outcomeFlagValue(campaignState, 'prelude.crew-integration', 'unsettled');
  if (signals.addressesCrewBeforeArrival || signals.affirmsProvisionalRoutine || signals.closesActingXoService) {
    return current === 'temporary-divisions-hardened' ? 'unsettled' : 'deliberately-blended';
  }
  return current;
}

function finalReviewRelationshipChanges(campaignState, signals, endState) {
  const changes = [];
  if (signals.concealsFinalRisk) {
    changes.push('Whitaker records that the final readiness report tried to smooth over an established limitation.');
  } else if (signals.reportsFinalReadinessHonestly || signals.namesUnresolvedStrain) {
    changes.push('Whitaker sees the XO report uncertainty and support needs without making the Captain discover them later.');
  } else {
    changes.push('Whitaker accepts the transition but still has limited signal about how the XO will report uncomfortable readiness truth.');
  }
  if (signals.requestsCaptainSupport) {
    changes.push('Whitaker and the XO have a clearer expectation for private disagreement and public command support.');
  }
  if (signals.closesActingXoService) {
    changes.push('Bronn sees his acting-XO service formally closed instead of quietly overwritten.');
  }
  if (signals.addressesCrewBeforeArrival) {
    changes.push('Senior staff receive arrival posture through command communication rather than rumor.');
  }
  if (endState === 'arrival-with-limitation') {
    changes.push('The crew enters the Reach knowing the ship carries a readiness caveat rather than a concealed defect.');
  }
  return changes;
}

export function buildStateDelta({ graphIndex, campaignState, outcomePacket, intentParse, authorityCapabilityCheck, phaseAdvance }) {
  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    const crewStrain = getClockValue(campaignState, 'crew-integration-strain', 2);
    const integrationValue = arrivalCrewIntegrationValue(intentParse);
    const strainTarget = integrationValue === 'deliberately-blended' ? crewStrain - 1 : crewStrain + 1;

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.crew-integration', value: integrationValue }
        ],
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'crew-integration-strain',
          strainTarget,
          integrationValue === 'deliberately-blended'
            ? 'The player treats the transfer as a working handoff and reduces initial cohort strain.'
            : 'The player asserts authority before existing routines have been understood.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        descriptiveChanges: integrationValue === 'deliberately-blended'
          ? [
            'Priya notes that the player did not turn the transfer into theater.',
            'Bronn treats the first handoff as professional rather than possessive.'
          ]
          : [
            'Priya and Bronn register that the new XO may replace routines before learning why they exist.'
          ],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    const crewStrain = getClockValue(campaignState, 'crew-integration-strain', 2);
    const whitakerValue = handoverWhitakerValue(intentParse);
    const bronnValue = handoverBronnValue(intentParse);
    const strainTarget = whitakerValue === 'delegation-confidence-improved' && bronnValue === 'acting-service-respected'
      ? crewStrain - 1
      : crewStrain;

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.whitaker', value: whitakerValue },
          { id: 'prelude.bronn', value: bronnValue }
        ],
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'crew-integration-strain',
          strainTarget,
          strainTarget < crewStrain
            ? 'The command handoff gives Whitaker and Bronn usable signal and lowers integration strain.'
            : 'The handoff is complete but leaves command culture to be proven later.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        descriptiveChanges: whitakerValue === 'delegation-confidence-improved'
          ? [
            'Whitaker gains a clearer sense of how the player will use delegated authority.',
            'Bronn sees his acting-XO service acknowledged as material to the ship rather than erased by the transfer.'
          ]
          : [
            'Whitaker accepts the player keeping command philosophy guarded, but waits for behavior to establish trust.',
            'Bronn withholds judgment until the player shows whether the handoff means continuity or replacement.'
          ],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'leave-mission-area' && authorityCapabilityCheck?.result === 'authorizedDeviationWithConditions') {
    const arrivalSchedule = getClockValue(campaignState, 'arrival-schedule-margin', 2);
    const hesperusMedical = getClockValue(campaignState, 'hesperus-medical-risk', 1);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.arrival-delay', value: 'minor' }
        ]
      },
      clocks: [
        clockDelta(graphIndex, campaignState, 'arrival-schedule-margin', arrivalSchedule - 1, 'The approved deviation consumes schedule margin.'),
        clockDelta(graphIndex, campaignState, 'hesperus-medical-risk', hesperusMedical + 1, 'The Hesperus pressure continues while the Breckinridge leaves under conditions.')
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        descriptiveChanges: [
          'Whitaker treats the deviation as justified only because the player provides evidence, urgency, and a return plan.'
        ],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    const signals = intentParse.signals || {};
    const crewStrain = getClockValue(campaignState, 'crew-integration-strain', 2);
    const technicalDebt = getClockValue(campaignState, 'technical-debt-pressure', 2);
    const strainTarget = outcomePacket.resultBand === 'Success'
      ? crewStrain - 1
      : outcomePacket.resultBand === 'Partial Failure'
        ? crewStrain + 1
        : crewStrain;
    const technicalDebtTarget = signals.protectsEngineeringReadiness
      ? technicalDebt
      : technicalDebt + 1;

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.kieran', value: readinessFlagValue(signals, 'prelude.kieran') },
          { id: 'prelude.priya', value: readinessFlagValue(signals, 'prelude.priya') },
          { id: 'prelude.rowan', value: readinessFlagValue(signals, 'prelude.rowan') },
          { id: 'prelude.miriam', value: readinessFlagValue(signals, 'prelude.miriam') },
          { id: 'prelude.imani', value: readinessFlagValue(signals, 'prelude.imani') },
          { id: 'prelude.ship-state', value: readinessFlagValue(signals, 'prelude.ship-state') }
        ],
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'crew-integration-strain',
          strainTarget,
          strainTarget < crewStrain
            ? 'The readiness conference creates enough ownership to lower cohort strain.'
            : strainTarget > crewStrain
              ? 'The readiness conference leaves ownership loose and increases integration strain.'
              : 'The readiness conference preserves current integration strain while work continues.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'technical-debt-pressure',
          technicalDebtTarget,
          signals.protectsEngineeringReadiness
            ? 'Engineering documentation and repair limits remain visible instead of being normalized.'
            : 'Technical debt pressure rises because readiness priorities do not fully protect engineering follow-up.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        descriptiveChanges: readinessRelationshipChanges(signals),
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    const signals = intentParse.signals || {};
    const crewStrain = getClockValue(campaignState, 'crew-integration-strain', 2);
    const technicalDebt = getClockValue(campaignState, 'technical-debt-pressure', 2);
    const success = outcomePacket.resultBand === 'Success';
    const partialFailure = outcomePacket.resultBand === 'Partial Failure';
    const strainTarget = success && (signals.standardizesFallbackProcedure || signals.buildsFallbackConsensus)
      ? crewStrain - 1
      : partialFailure
        ? crewStrain + 1
        : crewStrain;
    const technicalDebtTarget = signals.defersFallbackRemediation || signals.setsTemporaryFallbackProtocol
        ? technicalDebt + 1
        : signals.assignsCertificateRemediation
          ? technicalDebt - 1
          : technicalDebt;

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.crew-integration', value: fallbackFlagValue(signals, 'prelude.crew-integration') },
          { id: 'prelude.bronn', value: fallbackFlagValue(signals, 'prelude.bronn') },
          { id: 'prelude.priya', value: fallbackFlagValue(signals, 'prelude.priya') },
          { id: 'prelude.imani', value: fallbackFlagValue(signals, 'prelude.imani') },
          { id: 'prelude.ship-state', value: fallbackFlagValue(signals, 'prelude.ship-state') }
        ],
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'crew-integration-strain',
          strainTarget,
          strainTarget < crewStrain
            ? 'A standardized fallback-command drill lowers cohort strain by aligning emergency habits.'
            : strainTarget > crewStrain
              ? 'Unresolved fallback authority increases cohort strain.'
              : 'The fallback-command drill preserves current integration strain while technical follow-up remains active.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'technical-debt-pressure',
          technicalDebtTarget,
          technicalDebtTarget < technicalDebt
            ? 'Command-network certificate remediation is assigned and lowers technical debt pressure.'
            : technicalDebtTarget > technicalDebt
              ? 'A temporary fallback protocol carries the certificate limitation forward as technical debt.'
              : 'The certificate limitation remains visible but does not worsen during the drill.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        descriptiveChanges: fallbackRelationshipChanges(signals),
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    const signals = intentParse.signals || {};
    const crewStrain = getClockValue(campaignState, 'crew-integration-strain', 2);
    const success = outcomePacket.resultBand === 'Success';
    const partialFailure = outcomePacket.resultBand === 'Partial Failure';
    const strainTarget = success
      ? crewStrain - 1
      : partialFailure
        ? crewStrain + 1
        : crewStrain;
    const contacts = contactedOfficerIds(signals);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.crew-integration', value: success ? 'deliberately-blended' : 'unsettled' }
        ],
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'crew-integration-strain',
          strainTarget,
          strainTarget < crewStrain
            ? 'Focused command-rhythm contacts lower integration strain.'
            : strainTarget > crewStrain
              ? 'Insufficient command rhythm increases cohort uncertainty.'
              : 'Command rhythm remains stable but still needs proof under pressure.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      commandCulture: {
        tendenciesAdd: [
          {
            outcomeId: outcomePacket.id,
            tendency: commandCultureTendency(signals),
            contactedOfficerIds: contacts,
            summary: `The player established ${commandCultureTendency(signals)} through focused contact with ${contacts.length} senior officer${contacts.length === 1 ? '' : 's'}.`
          }
        ]
      },
      relationships: {
        affectedCrewIds: contacts,
        descriptiveChanges: commandRhythmRelationshipChanges(signals),
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    const signals = intentParse.signals || {};
    const arrivalSchedule = getClockValue(campaignState, 'arrival-schedule-margin', 2);
    const technicalDebt = getClockValue(campaignState, 'technical-debt-pressure', 2);
    const followups = hesperusFollowupRecords(outcomePacket, signals);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: hesperusAftermathFlags(signals),
        followUpsAdd: followups,
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'arrival-schedule-margin',
          arrivalSchedule,
          signals.assignsHesperusFlight
            ? 'Flight planning recalculates the Hesperus delay without changing the current margin.'
            : 'Arrival schedule margin remains under review after Hesperus.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'technical-debt-pressure',
          signals.assignsHesperusEngineering ? technicalDebt : technicalDebt + 1,
          signals.assignsHesperusEngineering
            ? 'Hesperus repair limits are documented instead of hidden.'
            : 'Technical debt pressure rises because Hesperus repair follow-up is not clearly owned.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        affectedCrewIds: hesperusAftermathAffectedCrew(signals),
        descriptiveChanges: hesperusAftermathRelationshipChanges(signals),
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    const signals = intentParse.signals || {};
    const arrivalSchedule = getClockValue(campaignState, 'arrival-schedule-margin', 2);
    const technicalDebt = getClockValue(campaignState, 'technical-debt-pressure', 2);
    const scheduleTarget = signals.pausesCombinedLoadTest
      ? arrivalSchedule - 1
      : arrivalSchedule;
    const technicalDebtTarget = signals.hidesCombinedLoadRisk || (signals.continuesUnderReducedRedundancy && !signals.reportsIncompleteTesting)
      ? technicalDebt + 1
      : signals.pausesCombinedLoadTest || signals.runsStagedLoadTest
        ? technicalDebt - 1
        : technicalDebt;

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.kieran', value: signals.setsKieranAbortCriteria ? 'flight-profile-responsibly-approved' : signals.continuesUnderReducedRedundancy ? 'performance-indulged' : 'unsettled' },
          { id: 'prelude.imani', value: signals.hidesCombinedLoadRisk ? 'temporary-workarounds-normalized' : 'technical-debt-owned' },
          { id: 'prelude.ship-state', value: combinedLoadShipState(signals, outcomePacket) },
          { id: 'prelude.arrival-delay', value: signals.pausesCombinedLoadTest ? 'moderate' : 'minor' }
        ],
        ...phaseAdvanceDelta(phaseAdvance)
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'arrival-schedule-margin',
          scheduleTarget,
          signals.pausesCombinedLoadTest
            ? 'Pausing the combined-load test consumes schedule margin.'
            : 'Combined-load test handling preserves the current arrival margin.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'technical-debt-pressure',
          technicalDebtTarget,
          technicalDebtTarget < technicalDebt
            ? 'Controlled testing lowers technical debt pressure.'
            : technicalDebtTarget > technicalDebt
              ? 'Combined-load handling carries additional technical debt forward.'
              : 'Technical debt remains visible for final review.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        affectedCrewIds: ['kieran-vale', 'imani-cross', 'priya-nayar'],
        descriptiveChanges: combinedLoadRelationshipChanges(signals, outcomePacket),
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    const signals = intentParse.signals || {};
    const crewStrain = getClockValue(campaignState, 'crew-integration-strain', 2);
    const endState = finalReviewEndState(campaignState);
    const crewIntegrationValue = finalReviewCrewIntegrationValue(campaignState, signals);
    const crewStrainTarget = signals.addressesCrewBeforeArrival || signals.affirmsProvisionalRoutine || signals.closesActingXoService
      ? crewStrain - 1
      : crewStrain;

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'prelude.whitaker', value: finalReviewWhitakerValue(signals) },
          { id: 'prelude.crew-integration', value: crewIntegrationValue }
        ],
        endStateSet: endState,
        arrivalPostureSet: endState,
        completedMissionIdSet: 'prelude-a-ship-underway',
        nextMissionIdSet: 'chapter-1-the-empty-convoy',
        transitionStatusSet: 'chapter-1-queued',
        ...phaseAdvanceDelta(phaseAdvance)
      },
      mainCampaign: {
        completedChaptersAdd: ['prelude-a-ship-underway'],
        availableChaptersAdd: ['chapter-1-the-empty-convoy'],
        lockedChaptersRemove: ['chapter-1-the-empty-convoy'],
        chapterCursorSet: 'chapter-1-the-empty-convoy'
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'crew-integration-strain',
          crewStrainTarget,
          crewStrainTarget < crewStrain
            ? 'Final review and arrival communication reduce unresolved command-integration strain.'
            : 'Final review preserves the existing command-integration strain for Chapter 1.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        affectedCrewIds: signals.closesActingXoService ? ['mara-whitaker', 'hadrik-bronn'] : ['mara-whitaker'],
        descriptiveChanges: finalReviewRelationshipChanges(campaignState, signals, endState),
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent !== 'resolve-hesperus-with-accountability') {
    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: []
      },
      clocks: [],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  const arrivalSchedule = getClockValue(campaignState, 'arrival-schedule-margin', 2);
  const hesperusMedical = getClockValue(campaignState, 'hesperus-medical-risk', 1);
  const technicalDebt = getClockValue(campaignState, 'technical-debt-pressure', 2);

  return {
    outcomeId: outcomePacket.id,
    mission: {
      knownFactIdsAdd: outcomePacket.revealedFactIds || [],
      outcomeFlagsSet: [
        { id: 'prelude.hesperus-resolution', value: 'passengers-transferred' },
        { id: 'prelude.arrival-delay', value: 'minor' },
        { id: 'prelude.command-decision-hesperus-fraud', value: commandDecisionFlagValue(outcomePacket.commandDecisionAwards) },
        { id: 'prelude.priya', value: 'delegation-boundaries-clear' },
        { id: 'prelude.bronn', value: 'failure-conditions-used-well' },
        { id: 'prelude.miriam', value: 'human-cost-named' },
        { id: 'prelude.imani', value: 'technical-debt-owned' }
      ],
      ...phaseAdvanceDelta(phaseAdvance)
    },
    clocks: [
      clockDelta(graphIndex, campaignState, 'arrival-schedule-margin', arrivalSchedule - 1, 'The Breckinridge accepts a minor delay.'),
      clockDelta(graphIndex, campaignState, 'hesperus-medical-risk', 0, 'Medically vulnerable passengers are transferred first.'),
      clockDelta(graphIndex, campaignState, 'technical-debt-pressure', technicalDebt, 'The repair is limited and logged instead of normalized.')
    ],
    commandStyle: buildCommandStyleDelta(outcomePacket.commandDecisionAwards || []),
    relationships: {
      descriptiveChanges: [
        'Priya gains confidence that informal and formal channels will not be blurred without record.',
        'Bronn treats the containment posture as useful rather than performative.',
        'Miriam sees passenger risk named before administrative convenience.',
        'Imani sees technical limits recorded rather than softened.'
      ],
      rawValuesHidden: true
    },
    turnLedger: {
      appendOutcomeId: outcomePacket.id,
      swipeRerollForbidden: true
    }
  };
}
