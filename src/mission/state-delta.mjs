import { buildPressureLedgerDeltaForTurn } from '../pressures/pressure-seeding.mjs';
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
      summary: award.summary || award.reason || `The player earned ${award.track} through a consequential command decision.`
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

function chapter1OpeningMissionActivation() {
  return {
    activeMissionIdSet: 'chapter-1-the-empty-convoy',
    activeMissionGraphIdSet: 'breckenridge.ashes-of-peace.chapter-1-the-empty-convoy',
    activeMissionGraphPathSet: 'packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json',
    activePhaseIdSet: 'initial-reception',
    phaseSet: 'initial-reception',
    availableDecisionPointIdsSet: ['decision.initial-convoy-posture'],
    transitionStatusSet: 'chapter-1-active',
    phaseAdvance: null,
    graphTransition: {
      from: 'final-command-review',
      to: 'initial-reception',
      reason: 'The final Prelude review hands off into the first playable Chapter 1 response frame.',
      availableDecisionPointIds: ['decision.initial-convoy-posture']
    }
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
      summary: 'Follow displaced passenger medical needs and any Breckenridge crew fatigue consequences.',
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

function chapter1ConvoyEvidenceValue(signals) {
  if (signals.destroysConvoyEvidence) {
    return 'destroyed';
  }
  if (signals.preservesConvoyEvidence || signals.startsRemoteVerification) {
    return 'clean-chain-started';
  }
  if (signals.bypassesQuarantine || signals.closesOnConvoy || signals.preparesRescue) {
    return 'volatile';
  }
  return 'pending';
}

function chapter1RescueUrgencyValue(signals) {
  if ((signals.startsRemoteVerification || signals.coordinatesWithAuthorities || signals.preservesConvoyEvidence) && !signals.closesOnConvoy) {
    return 'delayed-by-verification';
  }
  if (signals.bypassesQuarantine || signals.rescueFirst || ((signals.closesOnConvoy || signals.preparesRescue) && !signals.startsRemoteVerification)) {
    return 'accelerated-with-risk';
  }
  if (signals.closesOnConvoy && signals.startsRemoteVerification && signals.preparesRescue) {
    return 'stabilized-initially';
  }
  return 'unclear';
}

function chapter1QuarantineConfidenceValue(signals) {
  if (signals.bypassesQuarantine) {
    return 'exception-logged';
  }
  if (signals.usesQuarantinePosture) {
    return 'procedure-active';
  }
  if (signals.detainsCompactPersonnel || signals.escalatesWeapons) {
    return 'contested';
  }
  return 'unresolved';
}

function chapter1CompactPostureValue(signals) {
  if (signals.coordinatesWithAuthorities) {
    return 'coordinating';
  }
  if (signals.detainsCompactPersonnel) {
    return 'jurisdiction-contested';
  }
  if (signals.usesSecurityPosture || signals.startsRemoteVerification) {
    return 'security-watch';
  }
  return 'not-yet-engaged';
}

function chapter1MissingModuleLeadValue(signals) {
  if (signals.destroysConvoyEvidence || signals.bypassesQuarantine || signals.escalatesWeapons) {
    return 'lead-weakened';
  }
  if (signals.preservesConvoyEvidence || signals.startsRemoteVerification) {
    return 'lead-preserved';
  }
  if (signals.coordinatesWithAuthorities || signals.preparesRescue || signals.closesOnConvoy) {
    return 'lead-delayed';
  }
  return 'unformed';
}

function chapter1ThresholdState(signals) {
  return {
    convoyEvidence: chapter1ConvoyEvidenceValue(signals),
    rescueUrgency: chapter1RescueUrgencyValue(signals),
    quarantinePosture: signals.bypassesQuarantine ? 'bypassed' : signals.usesQuarantinePosture ? 'active' : 'pending',
    quarantineConfidence: chapter1QuarantineConfidenceValue(signals),
    compactPosture: chapter1CompactPostureValue(signals),
    evidenceCustody: signals.destroysConvoyEvidence ? 'compromised' : signals.preservesConvoyEvidence || signals.startsRemoteVerification ? 'preserved-initially' : 'volatile',
    missingModuleLead: chapter1MissingModuleLeadValue(signals)
  };
}

function sourceStateFields(outcomePacket, intentParse, phaseId = null) {
  return {
    sourceOutcomeId: outcomePacket.id,
    sourceIntent: intentParse.primaryIntent,
    sourceMissionId: 'chapter-1-the-empty-convoy',
    sourcePhaseId: phaseId,
    lastUpdatedByOutcomeId: outcomePacket.id,
    history: [{
      type: 'updated-by-turn',
      sourceOutcomeId: outcomePacket.id,
      intent: intentParse.primaryIntent
    }]
  };
}

function rescueFrontStatus(rescueUrgency) {
  if (rescueUrgency === 'stabilized-initially') return 'stabilized';
  if (rescueUrgency === 'delayed-by-verification') return 'delayed';
  if (rescueUrgency === 'accelerated-with-risk') return 'accelerated-risk';
  return 'unsettled';
}

function medicalFrontStatus(thresholdState) {
  if (thresholdState.quarantinePosture === 'bypassed') return 'exception-logged';
  if (thresholdState.quarantineConfidence === 'procedure-active') return 'controlled';
  if (thresholdState.quarantineConfidence === 'contested') return 'contested';
  return 'unresolved';
}

function securityFrontStatus(signals) {
  if (signals.escalatesWeapons || signals.detainsCompactPersonnel) return 'escalation-blocked';
  if (signals.bypassesQuarantine || (signals.closesOnConvoy && !signals.usesSecurityPosture)) return 'exposed';
  if (signals.usesSecurityPosture || signals.startsRemoteVerification) return 'contained';
  return 'watching';
}

function evidenceFrontStatus(thresholdState) {
  if (['compromised', 'destroyed'].includes(thresholdState.convoyEvidence) || thresholdState.evidenceCustody === 'compromised') return 'compromised';
  if (thresholdState.evidenceCustody === 'preserved-initially' || thresholdState.convoyEvidence === 'clean-chain-started') return 'preserved';
  return 'volatile';
}

function diplomaticFrontStatus(thresholdState) {
  if (thresholdState.compactPosture === 'coordinating') return 'coordinating';
  if (thresholdState.compactPosture === 'jurisdiction-contested') return 'contested';
  if (thresholdState.compactPosture === 'security-watch') return 'watching';
  return 'not-yet-engaged';
}

function hiddenActorPosture(thresholdState) {
  if (thresholdState.missingModuleLead === 'lead-preserved') return 'concealed-options-narrowing';
  if (thresholdState.missingModuleLead === 'lead-weakened') return 'concealed-leverage-improving';
  if (thresholdState.missingModuleLead === 'lead-delayed') return 'concealed-window-open';
  return 'unformed';
}

function breckenridgeActorPosture(signals, thresholdState) {
  if (signals.escalatesWeapons) return 'escalation-blocked-by-command';
  if (thresholdState.quarantinePosture === 'bypassed') return 'rescue-risk-accepted';
  if (signals.usesSecurityPosture && signals.startsRemoteVerification && thresholdState.evidenceCustody === 'preserved-initially') return 'controlled-contact';
  if (signals.startsRemoteVerification && !signals.closesOnConvoy) return 'remote-verification-hold';
  if (signals.closesOnConvoy || signals.preparesRescue) return 'rescue-contact-prepared';
  return 'threshold-unsettled';
}

function convoyActorPosture(thresholdState) {
  if (thresholdState.rescueUrgency === 'stabilized-initially') return 'contact-window-stabilized';
  if (thresholdState.rescueUrgency === 'delayed-by-verification') return 'waiting-under-verification';
  if (thresholdState.rescueUrgency === 'accelerated-with-risk') return 'contact-accelerated';
  return 'silent-unknown';
}

function chapter1FrontDelta({ outcomePacket, intentParse, signals, thresholdState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'convoy-approach');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.rescue',
        title: 'Rescue Front',
        status: rescueFrontStatus(thresholdState.rescueUrgency),
        visibility: 'hidden',
        playerSummary: 'Relief Convoy Twelve rescue timing now follows the committed first-contact threshold.',
        pressureIds: ['pressure.convoy-rescue-window', 'pressure.obligation.convoy-rescue-delay'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['rescue', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.medical-quarantine',
        title: 'Medical Quarantine Front',
        status: medicalFrontStatus(thresholdState),
        visibility: 'hidden',
        playerSummary: 'Medical risk is governed by the committed quarantine and rescue-contact posture.',
        pressureIds: ['pressure.obligation.quarantine-exception-review'],
        linkedClockIds: ['chapter-1.rescue-window', 'chapter-1.security-exposure'],
        tags: ['medical', 'quarantine', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: securityFrontStatus(signals),
        visibility: 'hidden',
        playerSummary: 'Security exposure reflects whether first contact is covered by verification and overwatch.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: evidenceFrontStatus(thresholdState),
        visibility: 'hidden',
        playerSummary: 'Convoy evidence custody now has a committed posture for the next contact.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: diplomaticFrontStatus(thresholdState),
        visibility: 'hidden',
        playerSummary: 'Regional observers will read the convoy response through the committed coordination posture.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1ActorDelta({ outcomePacket, intentParse, signals, thresholdState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'convoy-approach');
  return {
    upsertPostures: [
      {
        actorId: 'relief-convoy-twelve',
        posture: convoyActorPosture(thresholdState),
        visibility: 'hidden',
        playerSummary: 'Relief Convoy Twelve remains powered and silent while contact timing follows the committed threshold.',
        pressureIds: ['pressure.convoy-rescue-window'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: breckenridgeActorPosture(signals, thresholdState),
        visibility: 'hidden',
        playerSummary: 'The Breckenridge command posture now has a committed first-contact threshold.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: hiddenActorPosture(thresholdState),
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture changes according to evidence, contact, and security pressure.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1ExecutionRouteValue(signals) {
  if (signals.destroysConvoyEvidence) return 'evidence-compromised';
  if (
    signals.targetsParnellRescue
    && signals.targetsFaradayRecords
    && (signals.startsRemoteVerification || signals.usesBoardingTeam)
    && signals.usesQuarantinePosture
    && signals.usesSecurityPosture
    && signals.preservesConvoyEvidence
  ) {
    return 'balanced-contact';
  }
  if (signals.targetsFaradayRecords && (signals.startsRemoteVerification || signals.preservesConvoyEvidence)) {
    return 'remote-records-first';
  }
  if (signals.targetsParnellRescue || signals.preparesRescue || signals.closesOnConvoy) {
    return 'rescue-contact-first';
  }
  if (signals.usesBoardingTeam && signals.usesQuarantinePosture) {
    return 'quarantine-boarding';
  }
  return 'stalled';
}

function chapter1ParnellRescueValue(signals, outcomePacket) {
  if (outcomePacket.resultBand === 'Failure' || outcomePacket.resultBand === 'Great Failure') {
    return signals.targetsParnellRescue ? 'compromised' : 'delayed';
  }
  if (signals.bypassesQuarantine) return 'risk-accepted';
  if (signals.targetsParnellRescue || signals.preparesRescue || signals.closesOnConvoy) return 'stabilized';
  return 'delayed';
}

function chapter1FaradayEvidenceAccessValue(signals) {
  if (signals.destroysConvoyEvidence) return 'compromised';
  if (signals.targetsFaradayRecords && signals.preservesConvoyEvidence) return 'preserved-log-access';
  if (signals.targetsFaradayRecords || signals.startsRemoteVerification) return 'remote-only-fragments';
  return 'not-yet-accessed';
}

function chapter1ExecutionState(signals, outcomePacket) {
  const firstContactRoute = chapter1ExecutionRouteValue(signals);
  const parnellRescue = chapter1ParnellRescueValue(signals, outcomePacket);
  const faradayEvidenceAccess = chapter1FaradayEvidenceAccessValue(signals);
  return {
    firstContactRoute,
    parnellRescue,
    faradayEvidenceAccess,
    rescueUrgency: parnellRescue === 'stabilized'
      ? 'stabilized-initially'
      : parnellRescue === 'risk-accepted'
        ? 'accelerated-with-risk'
        : 'delayed-by-verification',
    convoyEvidence: faradayEvidenceAccess === 'compromised'
      ? 'compromised'
      : ['preserved-log-access', 'remote-only-fragments'].includes(faradayEvidenceAccess)
        ? 'clean-chain-started'
        : 'volatile',
    evidenceCustody: faradayEvidenceAccess === 'compromised'
      ? 'compromised'
      : ['preserved-log-access', 'remote-only-fragments'].includes(faradayEvidenceAccess)
        ? 'preserved-initially'
        : 'volatile'
  };
}

function executionRescueFrontStatus(executionState) {
  if (executionState.parnellRescue === 'stabilized') return 'active-rescue-stabilized';
  if (executionState.parnellRescue === 'risk-accepted') return 'active-rescue-risk';
  if (executionState.parnellRescue === 'compromised') return 'rescue-compromised';
  return 'delayed';
}

function executionEvidenceFrontStatus(executionState) {
  if (executionState.faradayEvidenceAccess === 'preserved-log-access') return 'faraday-log-preserved';
  if (executionState.faradayEvidenceAccess === 'remote-only-fragments') return 'remote-fragments-preserved';
  if (executionState.faradayEvidenceAccess === 'compromised') return 'compromised';
  return 'volatile';
}

function executionSecurityFrontStatus(signals) {
  if (signals.escalatesWeapons || signals.detainsCompactPersonnel) return 'escalation-blocked';
  if (signals.bypassesQuarantine || ((signals.usesBoardingTeam || signals.closesOnConvoy) && !signals.usesSecurityPosture)) return 'exposed';
  if (signals.usesSecurityPosture || signals.startsRemoteVerification) return 'contained';
  return 'watching';
}

function executionBreckenridgeActorPosture(signals, executionState) {
  if (signals.escalatesWeapons) return 'escalation-blocked-by-command';
  if (executionState.firstContactRoute === 'balanced-contact') return 'multi-team-contact-controlled';
  if (executionState.firstContactRoute === 'remote-records-first') return 'records-first-contact';
  if (executionState.firstContactRoute === 'rescue-contact-first') return 'rescue-first-contact';
  if (executionState.firstContactRoute === 'evidence-compromised') return 'contact-with-evidence-break';
  return 'contact-route-unsettled';
}

function executionHiddenActorPosture(executionState) {
  if (executionState.faradayEvidenceAccess === 'preserved-log-access' && executionState.parnellRescue === 'stabilized') return 'concealed-pressure-rising';
  if (executionState.faradayEvidenceAccess === 'compromised') return 'concealed-leverage-improving';
  if (executionState.firstContactRoute === 'remote-records-first') return 'concealed-window-narrowing';
  return 'concealed-window-open';
}

function chapter1ExecutionFrontDelta({ outcomePacket, intentParse, signals, executionState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'first-committed-response');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.rescue',
        title: 'Rescue Front',
        status: executionRescueFrontStatus(executionState),
        visibility: 'hidden',
        playerSummary: 'First contact has started turning the convoy rescue pressure into assigned rescue work.',
        pressureIds: ['pressure.convoy-rescue-window', 'pressure.obligation.convoy-rescue-delay'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['rescue', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.medical-quarantine',
        title: 'Medical Quarantine Front',
        status: signals.bypassesQuarantine ? 'exception-logged' : signals.usesQuarantinePosture ? 'controlled' : 'unresolved',
        visibility: 'hidden',
        playerSummary: 'Medical risk remains tied to how first contact handles isolation and triage.',
        pressureIds: ['pressure.obligation.quarantine-exception-review'],
        linkedClockIds: ['chapter-1.rescue-window', 'chapter-1.security-exposure'],
        tags: ['medical', 'quarantine', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: executionSecurityFrontStatus(signals),
        visibility: 'hidden',
        playerSummary: 'Security exposure reflects whether first contact is covered by remote verification and overwatch.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: executionEvidenceFrontStatus(executionState),
        visibility: 'hidden',
        playerSummary: 'The first contact route has a concrete evidence-access result for Faraday Bell records.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: signals.coordinatesWithAuthorities ? 'coordinating' : 'watching',
        visibility: 'hidden',
        playerSummary: 'Regional observers still read first contact through the visible coordination posture.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1ExecutionActorDelta({ outcomePacket, intentParse, signals, executionState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'first-committed-response');
  return {
    upsertPostures: [
      {
        actorId: 'relief-convoy-twelve',
        posture: executionState.parnellRescue === 'stabilized' ? 'first-contact-rescue-active' : 'first-contact-waiting',
        visibility: 'hidden',
        playerSummary: 'Relief Convoy Twelve is no longer only a silent formation; first contact has begun creating rescue and evidence state.',
        pressureIds: ['pressure.convoy-rescue-window'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: executionBreckenridgeActorPosture(signals, executionState),
        visibility: 'hidden',
        playerSummary: 'The Breckenridge has moved from a threshold posture into an assigned first contact route.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: executionHiddenActorPosture(executionState),
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture changes as first contact narrows or widens evidence and rescue pressure.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1DiscoveryState(signals, outcomePacket) {
  const failed = outcomePacket.resultBand === 'Failure' || outcomePacket.resultBand === 'Great Failure';
  const evacueeLocation = signals.tracksEvacuees || signals.preparesRescue
    ? failed ? 'partial-signal' : 'shelter-located'
    : 'unconfirmed';
  const custodyDispute = signals.escalatesWeapons || signals.detainsCompactPersonnel
    ? 'escalated'
    : signals.addressesCustodyClaim || signals.keepsJointInspectionTone || signals.coordinatesWithAuthorities
      ? signals.keepsJointInspectionTone || signals.coordinatesWithAuthorities ? 'framed-for-negotiation' : 'authority-contested'
      : 'not-yet-engaged';
  const missingCargoLead = signals.destroysConvoyEvidence
    ? 'compromised'
    : signals.tracksMissingCargo && (signals.preservesConvoyEvidence || signals.startsRemoteVerification)
      ? 'secured-hold-confirmed'
      : signals.tracksMissingCargo || signals.preservesConvoyEvidence || signals.startsRemoteVerification
        ? 'inventory-fragment'
        : 'unformed';

  return {
    evacueeLocation,
    custodyDispute,
    missingCargoLead,
    rescueUrgency: evacueeLocation === 'shelter-located' ? 'stabilized-initially' : 'delayed-by-verification',
    compactPosture: custodyDispute === 'framed-for-negotiation'
      ? 'coordinating'
      : ['authority-contested', 'escalated'].includes(custodyDispute)
        ? 'jurisdiction-contested'
        : 'security-watch',
    evidenceCustody: missingCargoLead === 'compromised'
      ? 'compromised'
      : ['secured-hold-confirmed', 'inventory-fragment'].includes(missingCargoLead)
        ? 'preserved-initially'
        : 'volatile',
    missingModuleLead: missingCargoLead === 'secured-hold-confirmed'
      ? 'lead-preserved'
      : missingCargoLead === 'inventory-fragment'
        ? 'lead-delayed'
        : missingCargoLead === 'compromised'
          ? 'lead-weakened'
          : 'unformed'
  };
}

function discoveryRescueFrontStatus(discoveryState) {
  if (discoveryState.evacueeLocation === 'shelter-located') return 'evacuees-located';
  if (discoveryState.evacueeLocation === 'partial-signal') return 'partial-shelter-signal';
  return 'location-unconfirmed';
}

function discoveryDiplomacyFrontStatus(discoveryState) {
  if (discoveryState.custodyDispute === 'framed-for-negotiation') return 'custody-framed';
  if (discoveryState.custodyDispute === 'authority-contested') return 'jurisdiction-contested';
  if (discoveryState.custodyDispute === 'escalated') return 'escalated';
  return 'watching';
}

function discoveryEvidenceFrontStatus(discoveryState) {
  if (discoveryState.missingCargoLead === 'secured-hold-confirmed') return 'missing-cargo-lead-preserved';
  if (discoveryState.missingCargoLead === 'inventory-fragment') return 'inventory-fragment-preserved';
  if (discoveryState.missingCargoLead === 'compromised') return 'compromised';
  return 'volatile';
}

function discoveryHiddenActorPosture(discoveryState) {
  if (discoveryState.missingCargoLead === 'secured-hold-confirmed' && discoveryState.custodyDispute === 'framed-for-negotiation') return 'jurisdiction-pressure-visible';
  if (discoveryState.missingCargoLead === 'compromised' || discoveryState.custodyDispute === 'escalated') return 'concealed-leverage-improving';
  if (discoveryState.custodyDispute === 'authority-contested') return 'jurisdiction-pressure-rising';
  return 'concealed-window-open';
}

function chapter1DiscoveryFrontDelta({ outcomePacket, intentParse, signals, discoveryState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'convoy-contact-execution');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.rescue',
        title: 'Rescue Front',
        status: discoveryRescueFrontStatus(discoveryState),
        visibility: 'hidden',
        playerSummary: 'The convoy rescue front now has an offsite shelter lead and triage pressure.',
        pressureIds: ['pressure.convoy-rescue-window', 'pressure.obligation.convoy-rescue-delay'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['rescue', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.medical-quarantine',
        title: 'Medical Quarantine Front',
        status: signals.bypassesQuarantine ? 'exception-logged' : signals.usesQuarantinePosture || signals.preparesRescue ? 'shelter-triage-framed' : 'unresolved',
        visibility: 'hidden',
        playerSummary: 'Shelter triage remains tied to quarantine discipline until medical evidence clears risk.',
        pressureIds: ['pressure.obligation.quarantine-exception-review'],
        linkedClockIds: ['chapter-1.rescue-window', 'chapter-1.security-exposure'],
        tags: ['medical', 'quarantine', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: discoveryState.custodyDispute === 'escalated' ? 'escalation-blocked' : signals.usesSecurityPosture ? 'contained' : 'watching',
        visibility: 'hidden',
        playerSummary: 'Security exposure now includes a visible custody and jurisdiction pressure.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: discoveryEvidenceFrontStatus(discoveryState),
        visibility: 'hidden',
        playerSummary: 'The evidence front now has a missing-cargo lead tied to the secured hold inventory.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: discoveryDiplomacyFrontStatus(discoveryState),
        visibility: 'hidden',
        playerSummary: 'Regional diplomacy now has a custody claim that must be handled without erasing local jurisdiction concerns.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1DiscoveryActorDelta({ outcomePacket, intentParse, discoveryState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'convoy-contact-execution');
  return {
    upsertPostures: [
      {
        actorId: 'relief-convoy-twelve',
        posture: discoveryState.evacueeLocation === 'shelter-located' ? 'evacuees-located' : 'offsite-location-uncertain',
        visibility: 'hidden',
        playerSummary: 'Relief Convoy Twelve now has an offsite evacuee lead instead of only silent ships.',
        pressureIds: ['pressure.convoy-rescue-window'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: discoveryState.custodyDispute === 'framed-for-negotiation' && discoveryState.missingCargoLead === 'secured-hold-confirmed'
          ? 'custody-cargo-followup-framed'
          : 'discovery-followup-incomplete',
        visibility: 'hidden',
        playerSummary: 'The Breckenridge has framed the next shelter, custody, and cargo pressures.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: discoveryHiddenActorPosture(discoveryState),
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture changes as custody and missing-cargo pressure becomes visible to the player.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1PellTermsState(signals, outcomePacket) {
  const failed = outcomePacket.resultBand === 'Failure' || outcomePacket.resultBand === 'Great Failure';
  const pellContact = signals.escalatesWeapons || signals.detainsCompactPersonnel
    ? 'coercive-standoff'
    : signals.offersJointInspection && (signals.acknowledgesCompactConcern || signals.keepsJointInspectionTone)
      ? 'joint-inspection-open'
      : signals.demandsIversRelease || signals.contactsPell
        ? 'lawful-demand-issued'
        : 'deferred';
  const iversStatus = signals.demandsIversRelease
    ? failed || pellContact === 'coercive-standoff' ? 'detention-contested' : 'release-negotiation-open'
    : 'not-yet-addressed';
  const cargoRecoveryRoute = signals.destroysConvoyEvidence
    ? 'compromised'
    : signals.setsLegalCargoUndertaking && signals.offersJointInspection
      ? 'joint-inspection-undertaking'
      : signals.setsLegalCargoUndertaking || signals.tracksMissingCargo || signals.preservesConvoyEvidence
        ? 'legal-demand'
        : pellContact === 'coercive-standoff'
          ? 'pursuit-needed'
          : 'unformed';
  return {
    pellContact,
    iversStatus,
    cargoRecoveryRoute,
    custodyDispute: pellContact === 'joint-inspection-open'
      ? 'framed-for-negotiation'
      : pellContact === 'coercive-standoff'
        ? 'escalated'
        : pellContact === 'lawful-demand-issued'
          ? 'authority-contested'
          : 'not-yet-engaged',
    compactPosture: pellContact === 'joint-inspection-open'
      ? 'coordinating'
      : pellContact === 'coercive-standoff'
        ? 'jurisdiction-contested'
        : 'security-watch',
    missingCargoLead: cargoRecoveryRoute === 'compromised'
      ? 'compromised'
      : ['joint-inspection-undertaking', 'legal-demand'].includes(cargoRecoveryRoute)
        ? 'secured-hold-confirmed'
        : 'inventory-fragment',
    missingModuleLead: cargoRecoveryRoute === 'compromised'
      ? 'lead-weakened'
      : ['joint-inspection-undertaking', 'legal-demand'].includes(cargoRecoveryRoute)
        ? 'lead-preserved'
        : 'lead-delayed'
  };
}

function pellTermsDiplomacyFrontStatus(pellTermsState) {
  if (pellTermsState.pellContact === 'joint-inspection-open') return 'joint-inspection-open';
  if (pellTermsState.pellContact === 'lawful-demand-issued') return 'lawful-demand-issued';
  if (pellTermsState.pellContact === 'coercive-standoff') return 'escalated';
  return 'watching';
}

function pellTermsEvidenceFrontStatus(pellTermsState) {
  if (pellTermsState.cargoRecoveryRoute === 'joint-inspection-undertaking') return 'cargo-undertaking-open';
  if (pellTermsState.cargoRecoveryRoute === 'legal-demand') return 'legal-demand-open';
  if (pellTermsState.cargoRecoveryRoute === 'compromised') return 'compromised';
  return 'volatile';
}

function chapter1PellTermsFrontDelta({ outcomePacket, intentParse, signals, pellTermsState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'offsite-custody-cargo-leads');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.rescue',
        title: 'Rescue Front',
        status: 'evacuees-located',
        visibility: 'hidden',
        playerSummary: 'Shelter triage remains active while Pell contact terms are set.',
        pressureIds: ['pressure.convoy-rescue-window', 'pressure.obligation.convoy-rescue-delay'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['rescue', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.medical-quarantine',
        title: 'Medical Quarantine Front',
        status: signals.bypassesQuarantine ? 'exception-logged' : signals.usesQuarantinePosture || signals.preparesRescue ? 'shelter-triage-framed' : 'unresolved',
        visibility: 'hidden',
        playerSummary: 'Medical posture remains active while release or inspection terms are negotiated.',
        pressureIds: ['pressure.obligation.quarantine-exception-review'],
        linkedClockIds: ['chapter-1.rescue-window', 'chapter-1.security-exposure'],
        tags: ['medical', 'quarantine', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: pellTermsState.pellContact === 'coercive-standoff' ? 'escalation-blocked' : signals.usesSecurityPosture || pellTermsState.pellContact === 'joint-inspection-open' ? 'contained' : 'watching',
        visibility: 'hidden',
        playerSummary: 'Security exposure now follows the first terms set for Pell contact.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: pellTermsEvidenceFrontStatus(pellTermsState),
        visibility: 'hidden',
        playerSummary: 'The missing-cargo evidence route now has first contact terms.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: pellTermsDiplomacyFrontStatus(pellTermsState),
        visibility: 'hidden',
        playerSummary: 'Regional diplomacy now has first terms for Pell, Ivers, and the cargo lead.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1PellTermsActorDelta({ outcomePacket, intentParse, pellTermsState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'offsite-custody-cargo-leads');
  return {
    upsertPostures: [
      {
        actorId: 'relief-convoy-twelve',
        posture: pellTermsState.iversStatus === 'release-negotiation-open' ? 'officers-release-negotiation-open' : 'officers-still-held',
        visibility: 'hidden',
        playerSummary: 'The convoy officers now have a first release or custody posture.',
        pressureIds: ['pressure.convoy-rescue-window'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: pellTermsState.pellContact === 'joint-inspection-open' && pellTermsState.cargoRecoveryRoute === 'joint-inspection-undertaking'
          ? 'joint-inspection-terms-open'
          : pellTermsState.pellContact === 'coercive-standoff'
            ? 'coercive-contact-corrected'
            : 'contact-terms-incomplete',
        visibility: 'hidden',
        playerSummary: 'The Breckenridge has first terms for the custody and cargo problem.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: pellTermsState.pellContact === 'joint-inspection-open'
          ? 'lawful-exit-visible'
          : pellTermsState.pellContact === 'coercive-standoff'
            ? 'jurisdiction-hardening'
            : 'jurisdiction-pressure-rising',
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture changes as Pell contact terms shape the cargo and custody path.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1JointInspectionState(signals, outcomePacket) {
  const executesInspection = signals.executesJointInspection || signals.offersJointInspection;
  const securesRelease = signals.securesSupervisedRelease || signals.demandsIversRelease;
  const opensSharedRecord = signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const protectsCargoChain = signals.protectsCargoEvidenceChain || signals.setsLegalCargoUndertaking || signals.preservesConvoyEvidence;
  const lawfulExit = signals.givesPellLawfulExit || signals.acknowledgesCompactConcern || signals.keepsJointInspectionTone;
  const blocked = signals.escalatesWeapons || signals.detainsCompactPersonnel;
  const compromised = signals.destroysConvoyEvidence || outcomePacket.resultBand === 'Failure' || outcomePacket.resultBand === 'Great Failure';
  const fullExecution = executesInspection && securesRelease && opensSharedRecord && protectsCargoChain && lawfulExit;

  const jointInspectionStatus = blocked
    ? 'blocked'
    : signals.destroysConvoyEvidence
      ? 'compromised'
      : fullExecution
        ? 'shared-record-open'
        : securesRelease || lawfulExit
          ? 'release-first'
          : executesInspection || opensSharedRecord || protectsCargoChain
            ? 'cargo-first'
            : 'underdefined';

  const pellContact = blocked
    ? 'coercive-standoff'
    : ['shared-record-open', 'cargo-first'].includes(jointInspectionStatus)
      ? 'joint-inspection-active'
      : jointInspectionStatus === 'release-first'
        ? 'joint-inspection-open'
        : 'lawful-demand-issued';

  const iversStatus = blocked || compromised
    ? 'detention-contested'
    : securesRelease || jointInspectionStatus === 'shared-record-open' || jointInspectionStatus === 'release-first'
      ? 'supervised-release-secured'
      : 'release-negotiation-open';

  const cargoRecoveryRoute = signals.destroysConvoyEvidence
    ? 'compromised'
    : blocked
      ? 'pursuit-needed'
      : ['shared-record-open', 'cargo-first'].includes(jointInspectionStatus)
        ? 'joint-inspection-in-progress'
        : jointInspectionStatus === 'release-first'
          ? 'joint-inspection-undertaking'
          : 'legal-demand';

  return {
    jointInspectionStatus,
    pellContact,
    iversStatus,
    cargoRecoveryRoute,
    custodyDispute: blocked ? 'escalated' : 'framed-for-negotiation',
    compactPosture: blocked ? 'jurisdiction-contested' : 'coordinating',
    missingCargoLead: signals.destroysConvoyEvidence ? 'compromised' : 'secured-hold-confirmed',
    missingModuleLead: signals.destroysConvoyEvidence ? 'lead-weakened' : 'lead-preserved'
  };
}

function jointInspectionDiplomacyFrontStatus(jointInspectionState) {
  if (jointInspectionState.jointInspectionStatus === 'shared-record-open') return 'joint-inspection-active';
  if (jointInspectionState.jointInspectionStatus === 'release-first') return 'supervised-release-open';
  if (jointInspectionState.jointInspectionStatus === 'cargo-first') return 'inspection-first';
  if (jointInspectionState.jointInspectionStatus === 'blocked') return 'escalated';
  return 'watching';
}

function jointInspectionEvidenceFrontStatus(jointInspectionState) {
  if (['shared-record-open', 'cargo-first'].includes(jointInspectionState.jointInspectionStatus)) return 'joint-inspection-record-open';
  if (jointInspectionState.jointInspectionStatus === 'release-first') return 'cargo-undertaking-open';
  if (jointInspectionState.jointInspectionStatus === 'compromised') return 'compromised';
  if (jointInspectionState.jointInspectionStatus === 'blocked') return 'pursuit-needed';
  return 'volatile';
}

function chapter1JointInspectionFrontDelta({ outcomePacket, intentParse, signals, jointInspectionState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'pell-contact-terms');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.rescue',
        title: 'Rescue Front',
        status: jointInspectionState.iversStatus === 'supervised-release-secured' ? 'witness-release-secured' : 'evacuees-located',
        visibility: 'hidden',
        playerSummary: 'Rescue and witness access now reflect the supervised Ivers release route.',
        pressureIds: ['pressure.convoy-rescue-window', 'pressure.obligation.convoy-rescue-delay'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['rescue', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.medical-quarantine',
        title: 'Medical Quarantine Front',
        status: signals.bypassesQuarantine ? 'exception-logged' : 'shelter-triage-framed',
        visibility: 'hidden',
        playerSummary: 'Medical posture remains active while Ivers becomes available as a supervised witness.',
        pressureIds: ['pressure.obligation.quarantine-exception-review'],
        linkedClockIds: ['chapter-1.rescue-window', 'chapter-1.security-exposure'],
        tags: ['medical', 'quarantine', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: jointInspectionState.pellContact === 'coercive-standoff' ? 'escalation-blocked' : 'contained',
        visibility: 'hidden',
        playerSummary: 'Security exposure follows whether the joint inspection route stays lawful or hardens.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: jointInspectionEvidenceFrontStatus(jointInspectionState),
        visibility: 'hidden',
        playerSummary: 'The shared inspection record now shapes the missing-cargo evidence route.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: jointInspectionDiplomacyFrontStatus(jointInspectionState),
        visibility: 'hidden',
        playerSummary: 'Regional diplomacy now reflects the first execution of Pell contact terms.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1JointInspectionActorDelta({ outcomePacket, intentParse, jointInspectionState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'pell-contact-terms');
  return {
    upsertPostures: [
      {
        actorId: 'relief-convoy-twelve',
        posture: jointInspectionState.iversStatus === 'supervised-release-secured' ? 'ivers-supervised-release-secured' : 'officers-still-held',
        visibility: 'hidden',
        playerSummary: 'Ivers and the convoy officers now have a supervised release posture.',
        pressureIds: ['pressure.convoy-rescue-window'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: jointInspectionState.jointInspectionStatus === 'shared-record-open' ? 'joint-inspection-executing' : 'joint-inspection-incomplete',
        visibility: 'hidden',
        playerSummary: 'The Breckenridge has begun executing the joint inspection route.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: jointInspectionState.pellContact === 'coercive-standoff' ? 'jurisdiction-hardening' : 'lawful-exit-in-progress',
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture changes as the joint inspection and supervised release route executes.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1CargoPulseState(signals, outcomePacket) {
  const tracesPulse = signals.tracesDiagnosticPulse || signals.startsRemoteVerification;
  const preservesJointSeal = signals.preservesJointCargoSeal || signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const protectsCargoChain = signals.protectsCargoEvidenceChain || signals.setsLegalCargoUndertaking || signals.preservesConvoyEvidence;
  const lawfulCooperation = signals.givesPellLawfulExit || signals.acknowledgesCompactConcern || signals.keepsJointInspectionTone || signals.coordinatesWithAuthorities;
  const nonHostileSecurity = signals.preparesNonHostileInterception || (signals.usesSecurityPosture && !signals.escalatesWeapons);
  const forcePressure = signals.escalatesWeapons || signals.detainsCompactPersonnel || signals.attemptsImmediateCargoSeizure;
  const compromised = signals.destroysConvoyEvidence || outcomePacket.resultBand === 'Failure' || outcomePacket.resultBand === 'Great Failure';
  const fullTrace = tracesPulse && preservesJointSeal && protectsCargoChain && lawfulCooperation && nonHostileSecurity && !forcePressure && !compromised;

  const cargoLocation = forcePressure || signals.destroysConvoyEvidence
    ? 'compromised'
    : fullTrace
      ? 'joint-locus-preserved'
      : tracesPulse || protectsCargoChain || preservesJointSeal
        ? 'diagnostic-pulse-traced'
        : 'unconfirmed';

  const cargoRecoveryRoute = forcePressure
    ? 'pursuit-needed'
    : signals.destroysConvoyEvidence
      ? 'signal-compromised'
      : cargoLocation === 'joint-locus-preserved'
        ? 'joint-seal-preserved'
        : cargoLocation === 'diagnostic-pulse-traced'
          ? 'diagnostic-pulse-traced'
          : 'joint-inspection-in-progress';

  return {
    cargoLocation,
    cargoRecoveryRoute,
    jointInspectionStatus: forcePressure
      ? 'blocked'
      : signals.destroysConvoyEvidence
        ? 'compromised'
        : cargoLocation === 'joint-locus-preserved'
          ? 'shared-record-open'
          : cargoLocation === 'diagnostic-pulse-traced'
            ? 'cargo-first'
            : 'underdefined',
    pellContact: forcePressure ? 'coercive-standoff' : 'joint-inspection-active',
    compactPosture: forcePressure ? 'jurisdiction-contested' : 'coordinating',
    missingCargoLead: signals.destroysConvoyEvidence ? 'compromised' : 'secured-hold-confirmed',
    missingModuleLead: cargoLocation === 'joint-locus-preserved' || cargoLocation === 'diagnostic-pulse-traced'
      ? 'location-traced'
      : signals.destroysConvoyEvidence
        ? 'lead-weakened'
        : 'lead-preserved'
  };
}

function cargoPulseEvidenceFrontStatus(cargoPulseState) {
  if (cargoPulseState.cargoLocation === 'joint-locus-preserved') return 'recovery-locus-preserved';
  if (cargoPulseState.cargoLocation === 'diagnostic-pulse-traced') return 'diagnostic-pulse-traced';
  if (cargoPulseState.cargoLocation === 'compromised') return 'compromised';
  return 'volatile';
}

function cargoPulseDiplomacyFrontStatus(cargoPulseState) {
  if (cargoPulseState.pellContact === 'coercive-standoff') return 'escalated';
  if (cargoPulseState.cargoLocation === 'joint-locus-preserved') return 'joint-recovery-coordination';
  if (cargoPulseState.cargoLocation === 'diagnostic-pulse-traced') return 'inspection-first';
  return 'watching';
}

function chapter1CargoPulseFrontDelta({ outcomePacket, intentParse, cargoPulseState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'joint-inspection-release-cargo');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.rescue',
        title: 'Rescue Front',
        status: 'witness-release-secured',
        visibility: 'hidden',
        playerSummary: 'Witness access remains secured while the cargo recovery locus is traced.',
        pressureIds: ['pressure.convoy-rescue-window', 'pressure.obligation.convoy-rescue-delay'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['rescue', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: cargoPulseState.pellContact === 'coercive-standoff' ? 'escalation-blocked' : 'contained',
        visibility: 'hidden',
        playerSummary: 'Security exposure follows whether the cargo trace stays non-hostile.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: cargoPulseEvidenceFrontStatus(cargoPulseState),
        visibility: 'hidden',
        playerSummary: 'The missing-cargo evidence front now has a traced recovery locus.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: cargoPulseDiplomacyFrontStatus(cargoPulseState),
        visibility: 'hidden',
        playerSummary: 'Regional diplomacy now reflects whether the cargo trace preserves shared custody.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1CargoPulseActorDelta({ outcomePacket, intentParse, cargoPulseState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'joint-inspection-release-cargo');
  return {
    upsertPostures: [
      {
        actorId: 'relief-convoy-twelve',
        posture: 'ivers-supervised-release-secured',
        visibility: 'hidden',
        playerSummary: 'Ivers remains available as the cargo signal is traced.',
        pressureIds: ['pressure.convoy-rescue-window'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: cargoPulseState.cargoLocation === 'joint-locus-preserved' ? 'cargo-recovery-locus-preserved' : 'cargo-trace-incomplete',
        visibility: 'hidden',
        playerSummary: 'The Breckenridge has traced the next cargo recovery locus.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: cargoPulseState.pellContact === 'coercive-standoff' ? 'jurisdiction-hardening' : 'joint-cargo-seal-possible',
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture changes as the cargo signal becomes traceable under joint inspection.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1HardwareRecoveryState(signals, outcomePacket) {
  const recoversHardware = signals.recoversEmergencyHardware || signals.tracksMissingCargo;
  const preservesJointSeal = signals.preservesJointCargoSeal || signals.defersFinalCustody || signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const preservesTrace = signals.preservesRecoveryTelemetry || signals.tracesDiagnosticPulse || signals.startsRemoteVerification;
  const protectsCargoChain = signals.protectsCargoEvidenceChain || signals.setsLegalCargoUndertaking || signals.preservesConvoyEvidence;
  const lawfulCooperation = signals.givesPellLawfulExit || signals.acknowledgesCompactConcern || signals.keepsJointInspectionTone || signals.coordinatesWithAuthorities;
  const nonHostileSecurity = signals.preparesNonHostileInterception || (signals.usesSecurityPosture && !signals.escalatesWeapons);
  const forcePressure = signals.escalatesWeapons || signals.detainsCompactPersonnel || signals.attemptsImmediateCargoSeizure;
  const compromised = signals.destroysConvoyEvidence || outcomePacket.resultBand === 'Failure' || outcomePacket.resultBand === 'Great Failure';
  const fullRecovery = recoversHardware && preservesJointSeal && preservesTrace && protectsCargoChain && lawfulCooperation && nonHostileSecurity && !forcePressure && !compromised;

  const recoveredHardwareStatus = forcePressure
    ? 'contested'
    : signals.destroysConvoyEvidence
      ? 'compromised'
      : fullRecovery
        ? 'recovered-under-joint-seal'
        : recoversHardware
          ? 'recovered-by-authority'
          : 'unrecovered';

  const cargoRecoveryRoute = recoveredHardwareStatus === 'recovered-under-joint-seal'
    ? 'hardware-recovered-under-seal'
    : recoveredHardwareStatus === 'recovered-by-authority'
      ? 'authority-recovered'
      : recoveredHardwareStatus === 'contested'
        ? 'pursuit-needed'
        : recoveredHardwareStatus === 'compromised'
          ? 'signal-compromised'
          : 'joint-seal-preserved';

  return {
    recoveredHardwareStatus,
    cargoLocation: ['recovered-under-joint-seal', 'recovered-by-authority'].includes(recoveredHardwareStatus)
      ? 'recovered-under-seal'
      : recoveredHardwareStatus === 'contested' || recoveredHardwareStatus === 'compromised'
        ? 'compromised'
        : 'joint-locus-preserved',
    cargoRecoveryRoute,
    jointInspectionStatus: recoveredHardwareStatus === 'recovered-under-joint-seal'
      ? 'shared-record-open'
      : recoveredHardwareStatus === 'contested'
        ? 'blocked'
        : recoveredHardwareStatus === 'compromised'
          ? 'compromised'
          : 'cargo-first',
    pellContact: recoveredHardwareStatus === 'contested' ? 'coercive-standoff' : 'joint-inspection-active',
    compactPosture: recoveredHardwareStatus === 'contested' ? 'jurisdiction-contested' : 'coordinating',
    missingCargoLead: recoveredHardwareStatus === 'compromised' ? 'compromised' : 'secured-hold-confirmed',
    missingModuleLead: ['recovered-under-joint-seal', 'recovered-by-authority'].includes(recoveredHardwareStatus)
      ? 'recovered-intact'
      : recoveredHardwareStatus === 'compromised'
        ? 'lead-weakened'
        : 'location-traced'
  };
}

function hardwareRecoveryEvidenceFrontStatus(hardwareRecoveryState) {
  if (hardwareRecoveryState.recoveredHardwareStatus === 'recovered-under-joint-seal') return 'hardware-recovered-under-seal';
  if (hardwareRecoveryState.recoveredHardwareStatus === 'recovered-by-authority') return 'hardware-recovered-by-authority';
  if (hardwareRecoveryState.recoveredHardwareStatus === 'contested') return 'recovery-contested';
  if (hardwareRecoveryState.recoveredHardwareStatus === 'compromised') return 'compromised';
  return 'recovery-incomplete';
}

function hardwareRecoveryDiplomacyFrontStatus(hardwareRecoveryState) {
  if (hardwareRecoveryState.recoveredHardwareStatus === 'recovered-under-joint-seal') return 'joint-custody-preserved';
  if (hardwareRecoveryState.recoveredHardwareStatus === 'recovered-by-authority') return 'authority-recovery-contested';
  if (hardwareRecoveryState.recoveredHardwareStatus === 'contested') return 'escalated';
  return 'watching';
}

function chapter1HardwareRecoveryFrontDelta({ outcomePacket, intentParse, hardwareRecoveryState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'cargo-diagnostic-pulse');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.rescue',
        title: 'Rescue Front',
        status: 'witness-release-secured',
        visibility: 'hidden',
        playerSummary: 'Witness access remains secured while the missing emergency hardware is recovered.',
        pressureIds: ['pressure.convoy-rescue-window', 'pressure.obligation.convoy-rescue-delay'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['rescue', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: hardwareRecoveryState.pellContact === 'coercive-standoff' ? 'escalation-blocked' : 'contained',
        visibility: 'hidden',
        playerSummary: 'Security exposure follows whether hardware recovery stays under seal.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: hardwareRecoveryEvidenceFrontStatus(hardwareRecoveryState),
        visibility: 'hidden',
        playerSummary: 'The missing-cargo evidence front now has a hardware recovery posture.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: hardwareRecoveryDiplomacyFrontStatus(hardwareRecoveryState),
        visibility: 'hidden',
        playerSummary: 'Regional diplomacy now reflects whether hardware recovery preserved joint custody.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1HardwareRecoveryActorDelta({ outcomePacket, intentParse, hardwareRecoveryState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'cargo-diagnostic-pulse');
  return {
    upsertPostures: [
      {
        actorId: 'relief-convoy-twelve',
        posture: 'ivers-supervised-release-secured',
        visibility: 'hidden',
        playerSummary: 'Ivers remains available while the recovered hardware is sealed.',
        pressureIds: ['pressure.convoy-rescue-window'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: hardwareRecoveryState.recoveredHardwareStatus === 'recovered-under-joint-seal' ? 'hardware-recovered-under-seal' : 'hardware-recovery-contested',
        visibility: 'hidden',
        playerSummary: 'The Breckenridge has a recovery posture for the missing emergency hardware.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: hardwareRecoveryState.recoveredHardwareStatus === 'recovered-under-joint-seal' ? 'joint-custody-witness' : hardwareRecoveryState.recoveredHardwareStatus === 'contested' ? 'jurisdiction-hardening' : 'custody-pressure-rising',
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture changes as the missing emergency hardware is recovered or contested.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1ResolutionState(signals, outcomePacket, campaignState) {
  const createsRecord = signals.createsJointIncidentRecord || signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const securesIvers = signals.securesIversTrust || signals.securesSupervisedRelease || signals.demandsIversRelease;
  const pellWitness = signals.recruitsPellWitness || signals.givesPellLawfulExit || signals.contactsPell || signals.acknowledgesCompactConcern;
  const compactAccess = signals.grantsCompactInvestigationAccess || signals.coordinatesWithAuthorities || signals.sharesEvidence;
  const acknowledgesAuth = signals.acknowledgesAuthenticationFailure;
  const documentsDebt = signals.documentsParnellTechnicalDebt;
  const finalCustody = signals.finalizesJointCustody || signals.preservesJointCargoSeal || signals.defersFinalCustody;
  const forceClosure = signals.usesSuperiorAuthority || signals.escalatesAuthority || signals.escalatesWeapons || signals.detainsCompactPersonnel;
  const costlyIncident = signals.costlyResolutionIncident || signals.destroysConvoyEvidence || outcomePacket.resultBand === 'Failure' || outcomePacket.resultBand === 'Great Failure';
  const fragmented = signals.fragmentedResolution;
  const existingHardwareStatus = outcomeFlagValue(campaignState, 'chapter-1.recovered-hardware-status', 'pending');
  const hardwareRecovered = ['recovered-under-joint-seal', 'recovered-by-authority'].includes(existingHardwareStatus) || signals.recoversEmergencyHardware;
  const cooperative = outcomePacket.resultBand === 'Success'
    && createsRecord
    && securesIvers
    && pellWitness
    && compactAccess
    && acknowledgesAuth
    && documentsDebt
    && finalCustody
    && hardwareRecovered
    && !forceClosure
    && !costlyIncident
    && !fragmented;

  const resolutionPath = costlyIncident
    ? 'costly'
    : forceClosure
      ? 'authoritative'
      : cooperative
        ? 'cooperative'
        : 'fragmented';

  return {
    resolutionPath,
    incidentRecordStatus: costlyIncident
      ? 'compromised-record'
      : forceClosure
        ? 'starfleet-record-only'
        : createsRecord
          ? cooperative
            ? 'joint-record-created'
            : 'fragmented-record'
          : 'fragmented-record',
    iversTrust: costlyIncident
      ? 'distrustful'
      : cooperative
        ? 'trusts-player'
        : securesIvers
          ? 'cautious'
          : 'unavailable',
    pellStatus: costlyIncident
      ? 'injured'
      : forceClosure
        ? 'detained'
        : fragmented
          ? 'escaped'
          : pellWitness
            ? cooperative
              ? 'witness-recruited'
              : 'released-under-record'
            : 'escaped',
    compactInvestigationAccess: costlyIncident
      ? 'contested'
      : forceClosure
        ? 'restricted-access'
        : compactAccess
          ? cooperative
            ? 'joint-access'
            : 'restricted-access'
          : 'denied',
    authenticationFailurePosture: acknowledgesAuth
      ? cooperative
        ? 'publicly-acknowledged'
        : 'recorded-internally'
      : forceClosure
        ? 'minimized'
        : 'deflected',
    parnellTechnicalDebt: costlyIncident
      ? 'escalated'
      : documentsDebt
        ? 'documented-contained'
        : 'accepted-untracked',
    compactPosture: cooperative ? 'joint-record-access' : forceClosure ? 'jurisdiction-contested' : 'coordinating',
    jointInspectionStatus: cooperative ? 'joint-incident-record-created' : createsRecord ? 'shared-record-open' : 'compromised',
    pellContact: cooperative ? 'witness-cooperation-secured' : forceClosure ? 'coercive-standoff' : 'deferred',
    cargoRecoveryRoute: cooperative ? 'resolved-under-joint-record' : outcomeFlagValue(campaignState, 'chapter-1.cargo-recovery-route', 'hardware-recovered-under-seal')
  };
}

function chapter1ResolutionFrontDelta({ outcomePacket, intentParse, resolutionState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'hardware-recovery-under-seal');
  const cooperative = resolutionState.resolutionPath === 'cooperative';
  const costly = resolutionState.resolutionPath === 'costly';
  const authoritative = resolutionState.resolutionPath === 'authoritative';
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.rescue',
        title: 'Rescue Front',
        status: costly ? 'rescued-with-strain' : cooperative ? 'crews-rescued-recorded' : 'rescued-record-open',
        visibility: 'hidden',
        playerSummary: costly
          ? 'The crews are rescued, but the closing record carries humanitarian strain.'
          : 'The crews are rescued and the closing record preserves their witness status.',
        pressureIds: ['pressure.convoy-rescue-window', 'pressure.obligation.convoy-rescue-delay'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['rescue', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.medical-quarantine',
        title: 'Medical And Quarantine Front',
        status: costly ? 'medical-strain-escalated' : 'shelter-followup-documented',
        visibility: 'hidden',
        playerSummary: costly
          ? 'Medical follow-up remains under scrutiny after the convoy closure.'
          : 'Shelter and Parnell follow-up obligations are documented for continuity.',
        pressureIds: ['pressure.convoy-rescue-window'],
        linkedClockIds: ['chapter-1.rescue-window'],
        tags: ['medical', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: authoritative || costly ? 'scrutiny-rising' : 'contained',
        visibility: 'hidden',
        playerSummary: authoritative || costly
          ? 'Security exposure carries forward into later accountability.'
          : 'Security exposure is contained by the joint closure record.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: resolutionState.incidentRecordStatus,
        visibility: 'hidden',
        playerSummary: 'Evidence custody now reflects the Chapter 1 closing record.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: cooperative ? 'regional-trust-improved' : authoritative ? 'authority-suspicion-elevated' : costly ? 'humanitarian-strain-rising' : 'record-fragmented',
        visibility: 'hidden',
        playerSummary: cooperative
          ? 'Regional trust improves because Compact access and accountability are preserved.'
          : 'Regional diplomacy carries forward unresolved accountability pressure.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1ResolutionActorDelta({ outcomePacket, intentParse, resolutionState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'hardware-recovery-under-seal');
  const cooperative = resolutionState.resolutionPath === 'cooperative';
  const authoritative = resolutionState.resolutionPath === 'authoritative';
  const costly = resolutionState.resolutionPath === 'costly';
  return {
    upsertPostures: [
      {
        actorId: 'relief-convoy-twelve',
        posture: cooperative ? 'ivers-trust-secured' : costly ? 'witness-trust-damaged' : 'ivers-cautious-witness',
        visibility: 'hidden',
        playerSummary: cooperative
          ? 'Ivers trusts the Breckenridge record enough to remain a witness.'
          : 'Ivers remains connected to the record, but trust is less secure.',
        pressureIds: ['pressure.convoy-rescue-window'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: cooperative ? 'cooperative-resolution-filed' : authoritative ? 'authority-resolution-filed' : costly ? 'costly-resolution-under-review' : 'fragmented-resolution-filed',
        visibility: 'hidden',
        playerSummary: cooperative
          ? 'The Breckenridge has filed a cooperative Chapter 1 resolution record.'
          : 'The Breckenridge closes Chapter 1 with unresolved accountability pressure.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: cooperative ? 'contained-by-joint-record' : authoritative ? 'suspicion-elevated' : costly ? 'scrutiny-amplified' : 'record-pressure-active',
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture changes as the immediate convoy crisis closes into a resolution record.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1FalseColorsTransitionState(signals, outcomePacket, campaignState) {
  const arrival = signals.reachesAsterion;
  const report = signals.receivesCompactPatrolReport;
  const recordHandoff = signals.carriesJointRecordForward || signals.createsJointIncidentRecord || signals.opensSharedInspectionRecord || signals.sharesEvidence;
  const authorityNotice = signals.alertsAsterionAuthorities || signals.coordinatesWithAuthorities;
  const nonHostile = signals.maintainsNonHostileTransition || (signals.usesSecurityPosture && !signals.escalatesWeapons);
  const contested = signals.escalatesWeapons || signals.detainsCompactPersonnel || signals.destroysConvoyEvidence || outcomePacket.resultBand === 'Failure' || outcomePacket.resultBand === 'Great Failure';
  const cleanTransition = outcomePacket.resultBand === 'Success' && arrival && report && recordHandoff && authorityNotice && nonHostile && !contested;
  const existingIncidentRecordStatus = outcomeFlagValue(campaignState, 'chapter-1.incident-record-status', 'joint-record-created');

  return {
    cleanTransition,
    contested,
    transitionStatus: contested
      ? 'transition-contested'
      : report
        ? 'false-colors-report-received'
        : arrival
          ? 'arrival-only'
          : 'transition-delayed',
    nextMissionHook: contested
      ? 'chapter-2-report-contested'
      : report
        ? 'chapter-2-false-colors-open'
        : 'chapter-2-delayed',
    compactPosture: contested ? 'jurisdiction-contested' : outcomeFlagValue(campaignState, 'chapter-1.compact-posture', 'joint-record-access'),
    incidentRecordStatus: recordHandoff ? existingIncidentRecordStatus : 'fragmented-record',
    securityFrontStatus: contested ? 'false-colors-pressure-contested' : report ? 'false-colors-alarm-contained' : 'arrival-watch',
    evidenceFrontStatus: recordHandoff ? 'joint-record-carried-forward' : 'record-handoff-incomplete',
    regionalFrontStatus: contested ? 'arrival-suspicion-rising' : report ? 'false-colors-crisis-open' : 'arrival-briefing-open'
  };
}

function chapter1FalseColorsTransitionFrontDelta({ outcomePacket, intentParse, transitionState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'chapter-1-resolution-terms');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-1.security-exposure',
        title: 'Security Exposure Front',
        status: transitionState.securityFrontStatus,
        visibility: 'hidden',
        playerSummary: transitionState.contested
          ? 'The False Colors report arrives under avoidable security pressure.'
          : 'The False Colors report arrives while the Breckenridge holds a defensive, non-hostile posture.',
        pressureIds: ['pressure.compact-silent-extraction'],
        linkedClockIds: ['chapter-1.security-exposure'],
        tags: ['security', 'chapter-1', 'chapter-2-transition'],
        ...source
      },
      {
        id: 'front.chapter-1.evidence-custody',
        title: 'Evidence Custody Front',
        status: transitionState.evidenceFrontStatus,
        visibility: 'hidden',
        playerSummary: 'The Chapter 1 record is carried into the next crisis report.',
        pressureIds: ['pressure.forged-authority-uncertainty', 'pressure.obligation.convoy-evidence-custody'],
        linkedClockIds: ['chapter-1.evidence-volatility'],
        tags: ['evidence', 'chapter-1', 'chapter-2-transition'],
        ...source
      },
      {
        id: 'front.chapter-1.regional-diplomacy',
        title: 'Regional Diplomacy Front',
        status: transitionState.regionalFrontStatus,
        visibility: 'hidden',
        playerSummary: 'Regional diplomacy pivots from convoy resolution to the new identity accusation.',
        pressureIds: ['pressure.regional.convoy-first-impression'],
        linkedClockIds: [],
        tags: ['regional-trust', 'chapter-1', 'chapter-2-transition'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter1FalseColorsTransitionActorDelta({ outcomePacket, intentParse, transitionState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'chapter-1-resolution-terms');
  return {
    upsertPostures: [
      {
        actorId: 'uss-breckenridge',
        posture: transitionState.contested ? 'false-colors-accusation-contested' : 'false-colors-accusation-received',
        visibility: 'hidden',
        playerSummary: transitionState.contested
          ? 'The Breckenridge faces the identity accusation with added suspicion.'
          : 'The Breckenridge receives the identity accusation while preserving its prior record.',
        pressureIds: ['pressure.forged-authority-uncertainty'],
        ...source
      },
      {
        actorId: 'compact-recovery-team',
        posture: transitionState.contested ? 'arrival-suspicion-rising' : 'watching-false-colors-report',
        visibility: 'hidden',
        playerSummary: null,
        directorSummary: 'A concealed Chapter 1 actor posture carries into the False Colors transition without revealing attribution.',
        pressureIds: ['pressure.compact-silent-extraction'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2TransparencyTermsState(signals, outcomePacket) {
  const independentVerification = signals.permitsJointAudit
    || signals.invitesNeutralSpecialist
    || signals.allowsCompactObservers
    || signals.establishesIndependentSensorBaseline;
  const medicalHelp = signals.offersAegisMedicalHelp || signals.preparesRescue;
  const medicalSeparated = medicalHelp && signals.separatesMedicalFromPolitics;
  const alibiVerification = signals.verifiesBreckenridgeAlibi
    || signals.usesCryptographicChallenge
    || signals.establishesIndependentSensorBaseline
    || signals.startsRemoteVerification;
  const controlledSecrecy = signals.protectsTacticalSecrets
    || signals.createsClassifiedAnnex
    || signals.refusesUnrestrictedAuthAccess;
  const accessDenial = signals.deniesCompactAccess || signals.authorityOnlyAlibiClaim;
  const overexposure = signals.overexposesTacticalSystems;
  const success = outcomePacket.resultBand === 'Success';

  return {
    independentVerification,
    medicalHelp,
    alibiVerification,
    controlledSecrecy,
    accessDenial,
    overexposure,
    transparencyPosture: accessDenial
      ? 'authority-denial'
      : overexposure
        ? 'audit-restricted'
        : success && signals.invitesNeutralSpecialist
          ? 'neutral-specialist-invited'
          : success || independentVerification
            ? 'joint-audit-framed'
            : medicalHelp
              ? 'medical-first'
              : signals.usesSecurityPosture
                ? 'security-lockdown'
                : 'audit-restricted',
    compactAccessScope: overexposure
      ? 'unbounded'
      : accessDenial
        ? 'denied'
        : signals.createsClassifiedAnnex || signals.protectsTacticalSecrets
          ? 'classified-annex'
          : signals.allowsCompactObservers
            ? 'observer-limited'
            : independentVerification
              ? 'joint-audit'
              : 'observer-limited',
    aegisMedicalPosture: medicalSeparated
      ? 'medical-help-separated-from-politics'
      : medicalHelp
        ? 'medical-help-offered'
        : accessDenial || overexposure
          ? 'contested'
          : 'deferred',
    breckenridgeAlibiStatus: alibiVerification && independentVerification
      ? 'independent-verification-framed'
      : accessDenial || signals.authorityOnlyAlibiClaim
        ? 'starfleet-only-claim'
        : overexposure
          ? 'contested'
          : 'underdeveloped',
    tacticalSecrecyPosture: overexposure
      ? 'overexposed'
      : signals.createsClassifiedAnnex || signals.protectsTacticalSecrets
        ? 'controlled-annex'
        : signals.refusesUnrestrictedAuthAccess && independentVerification
          ? 'withheld-with-alternative'
          : signals.refusesUnrestrictedAuthAccess || accessDenial
            ? 'withheld-without-alternative'
            : 'pending',
    evidenceFrontStatus: accessDenial
      ? 'starfleet-only-proof-contested'
      : overexposure
        ? 'audit-open-boundary-unsafe'
        : independentVerification && alibiVerification
          ? 'independent-verification-framed'
          : independentVerification
            ? 'audit-route-open'
            : 'audit-underdeveloped',
    medicalFrontStatus: medicalSeparated
      ? 'care-offered-without-leverage'
      : medicalHelp
        ? 'care-offered'
        : 'care-pending',
    securityFrontStatus: overexposure
      ? 'command-auth-exposure'
      : controlledSecrecy
        ? 'controlled-disclosure'
        : accessDenial
          ? 'access-denied'
          : 'boundary-underdefined',
    politicalFrontStatus: success
      ? 'trust-through-verification'
      : accessDenial
        ? 'self-certification-suspicion'
        : overexposure
          ? 'transparency-with-security-cost'
          : 'first-terms-incomplete'
  };
}

function chapter2TransparencyFrontDelta({ outcomePacket, intentParse, transparencyState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'false-colors-arrival-briefing');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-2.evidence-audit',
        title: 'False Colors Evidence Audit Front',
        status: transparencyState.evidenceFrontStatus,
        visibility: 'hidden',
        playerSummary: transparencyState.independentVerification
          ? 'The audit route now has a verifiable frame beyond Starfleet self-certification.'
          : 'The audit route still needs a stronger independent frame.',
        pressureIds: ['pressure.false-colors-audit-fragility', 'pressure.false-colors-public-anger'],
        linkedClockIds: ['chapter-2.audit-fragility', 'chapter-2.public-anger'],
        tags: ['evidence', 'audit', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.aegis-medical',
        title: 'Aegis Two Medical Front',
        status: transparencyState.medicalFrontStatus,
        visibility: 'hidden',
        playerSummary: transparencyState.medicalHelp
          ? 'Aegis Two medical help is offered before culpability is settled.'
          : 'Aegis Two medical help remains pending after the first briefing response.',
        pressureIds: ['pressure.false-colors-medical-risk'],
        linkedClockIds: ['chapter-2.medical-risk'],
        tags: ['medical', 'compact', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.security-access',
        title: 'Security Access Front',
        status: transparencyState.securityFrontStatus,
        visibility: 'hidden',
        playerSummary: transparencyState.overexposure
          ? 'The first transparency terms risk exposing command authentication architecture.'
          : 'The first transparency terms keep command authentication behind a controlled boundary.',
        pressureIds: ['pressure.false-colors-security-access'],
        linkedClockIds: ['chapter-2.security-access-risk'],
        tags: ['security', 'access', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.political-legitimacy',
        title: 'Political Legitimacy Front',
        status: transparencyState.politicalFrontStatus,
        visibility: 'hidden',
        playerSummary: transparencyState.accessDenial
          ? 'The accusation now carries a public self-certification problem.'
          : 'The first response treats transparency as proof rather than surrender.',
        pressureIds: ['pressure.false-colors-public-anger'],
        linkedClockIds: ['chapter-2.public-anger'],
        tags: ['political', 'legitimacy', 'chapter-2'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2TransparencyActorDelta({ outcomePacket, intentParse, transparencyState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'false-colors-arrival-briefing');
  return {
    upsertPostures: [
      {
        actorId: 'uss-breckenridge',
        posture: transparencyState.overexposure
          ? 'transparent-but-overexposed'
          : transparencyState.accessDenial
            ? 'defensive-self-certification'
            : transparencyState.independentVerification
              ? 'independent-verification-offered'
              : 'first-terms-underdeveloped',
        visibility: 'hidden',
        playerSummary: transparencyState.independentVerification
          ? 'The Breckenridge offers a verifiable route for its alibi without conceding culpability.'
          : 'The Breckenridge still needs a stronger public proof route.',
        pressureIds: ['pressure.false-colors-audit-fragility'],
        ...source
      },
      {
        actorId: 'aegis-two',
        posture: transparencyState.medicalHelp ? 'medical-help-offered' : 'care-pending',
        visibility: 'hidden',
        playerSummary: transparencyState.medicalHelp
          ? 'Aegis Two is offered medical help before culpability is settled.'
          : 'Aegis Two medical trust remains fragile.',
        pressureIds: ['pressure.false-colors-medical-risk'],
        ...source
      },
      {
        actorId: 'director-nia-kessler',
        posture: transparencyState.independentVerification ? 'verification-route-available' : 'verification-route-unsatisfied',
        visibility: 'hidden',
        playerSummary: transparencyState.independentVerification
          ? 'Kessler has a verification route she can defend inside Compact institutions.'
          : 'Kessler still lacks an independently defensible verification route.',
        pressureIds: ['pressure.false-colors-audit-fragility'],
        ...source
      },
      {
        actorId: 'marshal-holt',
        posture: transparencyState.overexposure
          ? 'access-demand-expanded'
          : transparencyState.controlledSecrecy
            ? 'access-demand-contained'
            : 'pressing-for-broader-access',
        visibility: 'hidden',
        playerSummary: transparencyState.controlledSecrecy
          ? 'The broad access demand is contained by a controlled alternative.'
          : 'The broad access demand remains politically active.',
        pressureIds: ['pressure.false-colors-security-access'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2OrisonEvidenceState(signals, outcomePacket) {
  const independentBaseline = signals.securesOrisonBaseline
    || signals.establishesIndependentSensorBaseline
    || signals.startsRemoteVerification;
  const auditChain = signals.preservesAuditChain || signals.permitsJointAudit || signals.allowsCompactObservers;
  const compactParticipation = signals.allowsCompactObservers || signals.permitsJointAudit || signals.invitesNeutralSpecialist;
  const calibrationProof = signals.usesImaniCalibration;
  const reconstruction = signals.reconstructsAttackerRoute || (independentBaseline && signals.startsRemoteVerification);
  const controlledDisclosure = signals.protectsTacticalSecrets
    || signals.createsClassifiedAnnex
    || signals.refusesUnrestrictedAuthAccess
    || signals.releasesSelectedLogs;
  const overexposure = signals.overexposesTacticalSystems;
  const unsupportedAccusation = signals.makesUnsupportedHoltAccusation;
  const covertHoltInquiry = signals.covertHoltInquiry || signals.preservesDirectorateAccessLogs;
  const accessDenial = signals.deniesCompactAccess || signals.authorityOnlyAlibiClaim;
  const success = outcomePacket.resultBand === 'Success';

  return {
    independentBaseline,
    auditChain,
    compactParticipation,
    calibrationProof,
    reconstruction,
    controlledDisclosure,
    overexposure,
    unsupportedAccusation,
    covertHoltInquiry,
    accessDenial,
    auditChainStatus: overexposure || unsupportedAccusation
      ? 'compromised'
      : independentBaseline && auditChain && compactParticipation
        ? 'independent-baseline-preserved'
        : auditChain
          ? 'joint-chain-open'
          : accessDenial
            ? 'starfleet-controlled'
            : 'delayed',
    orisonSensorStatus: independentBaseline
      ? 'baseline-secured'
      : auditChain
        ? 'partial-baseline'
        : unsupportedAccusation || overexposure
          ? 'contested'
          : 'pending',
    calibrationEvidenceStatus: calibrationProof && (success || independentBaseline)
      ? 'breckenridge-mismatch-demonstrated'
      : calibrationProof
        ? 'accepted-with-caveat'
        : accessDenial
          ? 'withheld'
          : 'pending',
    attackReconstructionStatus: reconstruction && independentBaseline
      ? 'route-reconstruction-opened'
      : reconstruction
        ? 'probable-route-framed'
        : overexposure || unsupportedAccusation
          ? 'contaminated'
          : 'underdeveloped',
    disclosureBoundaryStatus: overexposure
      ? 'overexposed'
      : signals.releasesSelectedLogs
        ? 'selected-logs-released'
        : controlledDisclosure
          ? 'controlled-nonclassified'
          : accessDenial
            ? 'withheld'
            : 'pending',
    evidenceFrontStatus: success
      ? 'orison-baseline-preserved'
      : overexposure
        ? 'baseline-with-security-cost'
        : unsupportedAccusation
          ? 'baseline-politicized'
          : independentBaseline
            ? 'partial-baseline-preserved'
            : 'baseline-delayed',
    politicalFrontStatus: success
      ? 'legitimacy-evidence-improved'
      : unsupportedAccusation
        ? 'political-accusation-hardens'
        : accessDenial
          ? 'self-certification-persists'
          : 'evidence-credibility-partial',
    securityFrontStatus: overexposure
      ? 'access-risk-raised'
      : controlledDisclosure
        ? 'selected-disclosure-contained'
        : 'boundary-pending'
  };
}

function chapter2OrisonEvidenceFrontDelta({ outcomePacket, intentParse, evidenceState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'transparency-terms-set');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-2.evidence-audit',
        title: 'False Colors Evidence Audit Front',
        status: evidenceState.evidenceFrontStatus,
        visibility: 'hidden',
        playerSummary: evidenceState.independentBaseline
          ? 'The Orison evidence baseline is preserved for a proof route beyond Starfleet self-certification.'
          : 'The Orison evidence baseline still needs preservation before the alibi can carry shared legitimacy.',
        pressureIds: ['pressure.false-colors-audit-fragility', 'pressure.false-colors-orison-evidence'],
        linkedClockIds: ['chapter-2.audit-fragility', 'chapter-2.public-anger'],
        tags: ['evidence', 'orison', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.security-access',
        title: 'Security Access Front',
        status: evidenceState.securityFrontStatus,
        visibility: 'hidden',
        playerSummary: evidenceState.overexposure
          ? 'Evidence disclosure creates a command-system exposure cost.'
          : 'Evidence disclosure remains bounded to nonclassified proof.',
        pressureIds: ['pressure.false-colors-security-access'],
        linkedClockIds: ['chapter-2.security-access-risk'],
        tags: ['security', 'access', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.political-legitimacy',
        title: 'Political Legitimacy Front',
        status: evidenceState.politicalFrontStatus,
        visibility: 'hidden',
        playerSummary: evidenceState.unsupportedAccusation
          ? 'The evidence route is entangled with an unsupported political accusation.'
          : 'The evidence route improves public legitimacy without requiring final attribution yet.',
        pressureIds: ['pressure.false-colors-public-anger'],
        linkedClockIds: ['chapter-2.public-anger'],
        tags: ['political', 'legitimacy', 'chapter-2'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2OrisonEvidenceActorDelta({ outcomePacket, intentParse, evidenceState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'transparency-terms-set');
  return {
    upsertPostures: [
      {
        actorId: 'uss-breckenridge',
        posture: evidenceState.calibrationProof
          ? 'alibi-supported-by-calibration'
          : evidenceState.independentBaseline
            ? 'alibi-supported-by-baseline'
            : 'alibi-still-technical-claim',
        visibility: 'hidden',
        playerSummary: evidenceState.calibrationProof
          ? 'The Breckenridge alibi now has engineering evidence that does not depend only on command testimony.'
          : 'The Breckenridge alibi still needs stronger independent support.',
        pressureIds: ['pressure.false-colors-orison-evidence'],
        ...source
      },
      {
        actorId: 'director-nia-kessler',
        posture: evidenceState.compactParticipation ? 'audit-chain-defensible' : 'audit-chain-politically-fragile',
        visibility: 'hidden',
        playerSummary: evidenceState.compactParticipation
          ? 'Kessler has enough participation in the audit to defend the process publicly.'
          : 'Kessler still lacks enough participation to defend the audit as independent.',
        pressureIds: ['pressure.false-colors-audit-fragility'],
        ...source
      },
      {
        actorId: 'marshal-holt',
        posture: evidenceState.unsupportedAccusation
          ? 'publicly-accused-without-record'
          : evidenceState.covertHoltInquiry || evidenceState.auditChain
            ? 'access-records-preserved'
            : 'political-pressure-available',
        visibility: 'hidden',
        playerSummary: evidenceState.unsupportedAccusation
          ? 'The evidence route now risks becoming a political fight before the record supports it.'
          : 'The access-record question is preserved without making an unsupported public accusation.',
        pressureIds: ['pressure.false-colors-orison-evidence'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2AegisMedicalState(signals, outcomePacket) {
  const care = signals.stabilizesCriticalOfficer || signals.offersAegisMedicalHelp || signals.preparesRescue;
  const jointChannel = signals.opensJointMedicalChannel || signals.coordinatesWithAuthorities;
  const neutralCare = signals.separatesMedicalFromPolitics || signals.recordsMedicalNeutrality;
  const consent = signals.protectsMedicalConsent;
  const testimony = signals.preservesPatrolTestimony;
  const coercive = signals.usesCareAsLeverage
    || signals.forcesMedicalQuestioning
    || signals.escalatesWeapons
    || signals.detainsCompactPersonnel;
  const success = outcomePacket.resultBand === 'Success';

  return {
    care,
    jointChannel,
    neutralCare,
    consent,
    testimony,
    coercive,
    aegisCareStatus: coercive
      ? 'care-politicized'
      : success && care
        ? 'critical-officer-stabilized'
        : care
          ? 'care-offered'
          : jointChannel
            ? 'care-delayed'
            : 'care-contested',
    medicalNeutralityStatus: coercive
      ? 'care-used-as-leverage'
      : neutralCare && jointChannel
        ? 'care-separated-from-politics'
        : jointChannel
          ? 'compact-led-with-starfleet-support'
          : neutralCare
            ? 'care-separated-from-politics'
            : 'unclear',
    compactMedicalTrust: coercive
      ? 'damaged'
      : success || (care && jointChannel && neutralCare)
        ? 'improved'
        : 'cautious',
    patrolTestimonyStatus: coercive
      ? 'testimony-contested'
      : testimony && consent
        ? 'voluntary-testimony-preserved'
        : testimony
          ? 'testimony-delayed'
          : care
            ? 'testimony-delayed'
            : 'pending',
    publicMedicalRecordStatus: coercive
      ? 'politicized'
      : neutralCare
        ? 'medical-neutrality-recorded'
        : care
          ? 'private-only'
          : 'casualty-pressure-rising',
    medicalFrontStatus: coercive
      ? 'care-politicized'
      : success
        ? 'critical-care-stabilized'
        : care
          ? 'care-offered'
          : 'care-pending',
    evidenceFrontStatus: testimony && consent && !coercive
      ? 'voluntary-testimony-preserved'
      : coercive
        ? 'testimony-contested'
        : 'testimony-pending',
    politicalFrontStatus: coercive
      ? 'medical-trust-damaged'
      : neutralCare && care
        ? 'medical-neutrality-supports-legitimacy'
        : 'medical-trust-cautious'
  };
}

function chapter2AegisMedicalFrontDelta({ outcomePacket, intentParse, medicalState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'orison-evidence-baseline');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-2.aegis-medical',
        title: 'Aegis Two Medical Front',
        status: medicalState.medicalFrontStatus,
        visibility: 'hidden',
        playerSummary: medicalState.care
          ? 'Aegis Two care is handled as medical work rather than a political bargain.'
          : 'Aegis Two care remains a trust pressure.',
        pressureIds: ['pressure.false-colors-medical-risk', 'pressure.false-colors-medical-testimony'],
        linkedClockIds: ['chapter-2.medical-risk'],
        tags: ['medical', 'compact', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.evidence-audit',
        title: 'False Colors Evidence Audit Front',
        status: medicalState.evidenceFrontStatus,
        visibility: 'hidden',
        playerSummary: medicalState.testimony && medicalState.consent && !medicalState.coercive
          ? 'Voluntary Aegis Two testimony is preserved for the audit.'
          : 'Aegis Two testimony remains unresolved or contested.',
        pressureIds: ['pressure.false-colors-audit-fragility', 'pressure.false-colors-medical-testimony'],
        linkedClockIds: ['chapter-2.audit-fragility'],
        tags: ['evidence', 'testimony', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.political-legitimacy',
        title: 'Political Legitimacy Front',
        status: medicalState.politicalFrontStatus,
        visibility: 'hidden',
        playerSummary: medicalState.coercive
          ? 'The medical front damages legitimacy because care appears coercive.'
          : 'Medical neutrality supports legitimacy without settling attribution.',
        pressureIds: ['pressure.false-colors-public-anger'],
        linkedClockIds: ['chapter-2.public-anger'],
        tags: ['political', 'medical', 'chapter-2'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2AegisMedicalActorDelta({ outcomePacket, intentParse, medicalState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'orison-evidence-baseline');
  return {
    upsertPostures: [
      {
        actorId: 'aegis-two',
        posture: medicalState.coercive
          ? 'medical-trust-damaged'
          : medicalState.care
            ? 'critical-care-stabilized'
            : 'care-still-pending',
        visibility: 'hidden',
        playerSummary: medicalState.care
          ? 'Aegis Two care is stabilized without requiring a political concession.'
          : 'Aegis Two care remains unresolved.',
        pressureIds: ['pressure.false-colors-medical-risk'],
        ...source
      },
      {
        actorId: 'director-nia-kessler',
        posture: medicalState.neutralCare && !medicalState.coercive ? 'medical-neutrality-defensible' : 'medical-trust-cautious',
        visibility: 'hidden',
        playerSummary: medicalState.neutralCare && !medicalState.coercive
          ? 'Kessler can defend the care channel as neutral rather than coercive.'
          : 'Kessler remains cautious about how the care channel will read publicly.',
        pressureIds: ['pressure.false-colors-medical-testimony'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: medicalState.testimony && medicalState.consent && !medicalState.coercive
          ? 'testimony-preserved-through-care'
          : medicalState.coercive
            ? 'medical-ethics-scrutiny'
            : 'care-route-open',
        visibility: 'hidden',
        playerSummary: medicalState.testimony && medicalState.consent && !medicalState.coercive
          ? 'The Breckenridge preserves testimony by making care trustworthy first.'
          : 'The Breckenridge still needs medical trust to support the wider proof route.',
        pressureIds: ['pressure.false-colors-medical-testimony'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2SecurityAccessState(signals, outcomePacket) {
  const controlledAnnex = signals.definesControlledSecurityAnnex
    || signals.createsClassifiedAnnex
    || signals.protectsTacticalSecrets
    || signals.refusesUnrestrictedAuthAccess;
  const demonstration = signals.runsCommandAuthDemonstration
    || signals.usesCryptographicChallenge
    || signals.verifiesBreckenridgeAlibi
    || signals.startsRemoteVerification;
  const bronnProfessionalized = signals.defendsBronnSecurityRole && !signals.scapegoatsBronn;
  const kesslerAlternative = signals.givesKesslerDefensibleAlternative
    || signals.allowsCompactObservers
    || signals.permitsJointAudit
    || signals.invitesNeutralSpecialist;
  const tollandLimit = signals.honorsTollandDisclosureLimit || controlledAnnex;
  const overexposure = signals.overexposesTacticalSystems || signals.acceptsUnrestrictedCommandInspection;
  const denial = signals.deniesCompactAccess || signals.authorityOnlyAlibiClaim;
  const politicized = signals.scapegoatsBronn
    || signals.escalatesWeapons
    || signals.detainsCompactPersonnel;
  const success = outcomePacket.resultBand === 'Success';

  return {
    controlledAnnex,
    demonstration,
    bronnProfessionalized,
    kesslerAlternative,
    tollandLimit,
    overexposure,
    denial,
    politicized,
    securityAccessStatus: overexposure
      ? 'overexposed'
      : politicized
        ? 'politicized'
        : denial
          ? 'denied'
          : success && controlledAnnex && demonstration
            ? 'controlled-demonstration'
            : kesslerAlternative
              ? 'observer-alternative'
              : 'underdefined',
    commandAuthExposureStatus: overexposure
      ? 'exposed'
      : controlledAnnex && demonstration
        ? 'protected'
        : demonstration
          ? 'selected-proof-shared'
          : denial
            ? 'withheld'
            : politicized
              ? 'contested'
              : 'pending',
    bronnAuditStatus: signals.scapegoatsBronn
      ? 'personally-blamed'
      : bronnProfessionalized && demonstration
        ? 'professional-demonstration'
        : bronnProfessionalized
          ? 'contested'
          : denial
            ? 'sidelined'
            : 'contested',
    kesslerAccessPosition: overexposure
      ? 'overexposed'
      : denial
        ? 'excluded'
        : kesslerAlternative
          ? 'defensible-alternative'
          : 'cautious',
    tollandDisclosureStatus: overexposure
      ? 'limits-breached'
      : tollandLimit && controlledAnnex
        ? 'limits-honored'
        : 'limits-unclear',
    securityFrontStatus: overexposure
      ? 'command-auth-overexposed'
      : politicized
        ? 'bronn-politicized'
        : denial
          ? 'access-denied'
          : success
            ? 'controlled-command-auth-demo'
            : 'security-boundary-partial',
    evidenceFrontStatus: demonstration && kesslerAlternative && !denial && !overexposure
      ? 'identity-proof-demonstrated'
      : denial
        ? 'audit-self-certification'
        : overexposure
          ? 'identity-proof-overexposed'
          : 'identity-proof-partial',
    politicalFrontStatus: kesslerAlternative && controlledAnnex && !politicized && !denial
      ? 'kessler-face-saving-access-path'
      : politicized
        ? 'security-dispute-personalized'
        : denial
          ? 'access-exclusion-politicized'
          : 'access-position-cautious'
  };
}

function chapter2SecurityAccessFrontDelta({ outcomePacket, intentParse, securityState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'aegis-medical-trust');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-2.security-access',
        title: 'Security Access Front',
        status: securityState.securityFrontStatus,
        visibility: 'hidden',
        playerSummary: securityState.controlledAnnex
          ? 'The Breckenridge has a controlled route for proving identity integrity without exposing command authentication.'
          : 'The security-access boundary still needs a credible proof route.',
        pressureIds: ['pressure.false-colors-security-access', 'pressure.false-colors-security-demonstration'],
        linkedClockIds: ['chapter-2.security-access-risk'],
        tags: ['security', 'access', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.evidence-audit',
        title: 'False Colors Evidence Audit Front',
        status: securityState.evidenceFrontStatus,
        visibility: 'hidden',
        playerSummary: securityState.demonstration
          ? 'The audit now has a command-system integrity demonstration that does not identify the attacker.'
          : 'The audit still needs a safer identity-integrity demonstration.',
        pressureIds: ['pressure.false-colors-audit-fragility', 'pressure.false-colors-security-demonstration'],
        linkedClockIds: ['chapter-2.audit-fragility'],
        tags: ['evidence', 'security', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.political-legitimacy',
        title: 'Political Legitimacy Front',
        status: securityState.politicalFrontStatus,
        visibility: 'hidden',
        playerSummary: securityState.kesslerAlternative
          ? 'Kessler has a defensible access position that does not require unrestricted command-system inspection.'
          : 'Kessler still needs a public path that is more credible than Starfleet-only refusal.',
        pressureIds: ['pressure.false-colors-public-anger'],
        linkedClockIds: ['chapter-2.public-anger'],
        tags: ['political', 'security', 'chapter-2'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2SecurityAccessActorDelta({ outcomePacket, intentParse, securityState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'aegis-medical-trust');
  return {
    upsertPostures: [
      {
        actorId: 'uss-breckenridge',
        posture: securityState.overexposure
          ? 'command-auth-overexposed'
          : securityState.controlledAnnex && securityState.demonstration
            ? 'command-auth-boundary-defended'
            : 'access-boundary-contested',
        visibility: 'hidden',
        playerSummary: securityState.controlledAnnex
          ? 'The Breckenridge can defend command-authentication boundaries while still offering proof.'
          : 'The Breckenridge still needs a cleaner way to prove integrity without unsafe access.',
        pressureIds: ['pressure.false-colors-security-demonstration'],
        ...source
      },
      {
        actorId: 'hadrik-bronn',
        posture: securityState.bronnAuditStatus,
        visibility: 'hidden',
        playerSummary: securityState.bronnProfessionalized
          ? 'Bronn is treated as a professional security witness rather than a political liability.'
          : 'Bronn remains exposed to accusations around the security boundary.',
        pressureIds: ['pressure.false-colors-security-demonstration'],
        ...source
      },
      {
        actorId: 'director-nia-kessler',
        posture: securityState.kesslerAccessPosition,
        visibility: 'hidden',
        playerSummary: securityState.kesslerAlternative
          ? 'Kessler can defend a verification path that does not demand unsafe command-system access.'
          : 'Kessler still lacks a strong public alternative to wider access demands.',
        pressureIds: ['pressure.false-colors-security-demonstration'],
        ...source
      },
      {
        actorId: 'helena-tolland',
        posture: securityState.tollandDisclosureStatus,
        visibility: 'hidden',
        playerSummary: securityState.tollandDisclosureStatus === 'limits-honored'
          ? 'Tolland can accept the access compromise because classified disclosure limits held.'
          : 'Tolland treats the access compromise as politically or operationally exposed.',
        pressureIds: ['pressure.false-colors-security-demonstration'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2JointCharterState(signals, outcomePacket) {
  const charter = signals.framesJointInvestigationCharter
    || signals.permitsJointAudit
    || signals.allowsCompactObservers;
  const kessler = signals.givesKesslerFaceSavingStatement
    || signals.givesKesslerDefensibleAlternative;
  const holtRestricted = signals.restrictsHoltInterference
    || signals.preservesDirectorateAccessLogs
    || signals.covertHoltInquiry;
  const hecate = signals.preservesWeakHecateTrace;
  const openOrders = signals.authorizesOpenOrders;
  const overclaim = signals.overclaimsHecateTrace;
  const unsupportedAccusation = signals.makesUnsupportedHoltAccusation;
  const rupture = unsupportedAccusation
    || overclaim
    || signals.escalatesWeapons
    || signals.detainsCompactPersonnel;
  const completed = outcomePacket.resultBand === 'Success'
    && charter
    && kessler
    && holtRestricted
    && hecate
    && openOrders
    && !rupture;

  return {
    charter,
    kessler,
    holtRestricted,
    hecate,
    openOrders,
    overclaim,
    unsupportedAccusation,
    rupture,
    completed,
    jointInvestigationStatus: rupture
      ? 'political-rupture'
      : completed
        ? 'joint-charter-framed'
        : charter && kessler
          ? 'managed-ambiguity'
          : charter
            ? 'underdefined'
            : 'underdefined',
    kesslerLegitimacyStatus: rupture && !kessler
      ? 'excluded'
      : kessler && charter
        ? 'face-saving-support'
        : kessler
          ? 'public-partner'
          : 'cautious',
    holtContainmentStatus: unsupportedAccusation
      ? 'publicly-accused'
      : signals.restrictsHoltInterference
        ? 'interference-restricted'
        : signals.preservesDirectorateAccessLogs || signals.covertHoltInquiry
          ? 'access-logs-preserved'
          : 'unrestricted',
    hecateLeadStatus: overclaim
      ? 'overclaimed'
      : hecate
        ? 'weak-trace-preserved'
        : openOrders
          ? 'deferred'
          : 'pending',
    openOrdersTransitionStatus: completed
      ? 'open-orders-authorized'
      : rupture
        ? 'contested'
        : openOrders
          ? 'delayed'
          : 'delayed',
    politicalFrontStatus: rupture
      ? 'political-rupture'
      : completed
        ? 'joint-legitimacy-framed'
        : charter && kessler
          ? 'managed-ambiguity'
          : 'charter-underdefined',
    evidenceFrontStatus: overclaim
      ? 'trace-overclaimed'
      : hecate
        ? 'weak-hecate-trace-preserved'
        : 'trace-deferred',
    securityFrontStatus: unsupportedAccusation
      ? 'holt-accusation-premature'
      : holtRestricted
        ? 'interference-restricted'
        : 'interference-unrestricted'
  };
}

function chapter2JointCharterFrontDelta({ outcomePacket, intentParse, jointState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'security-access-demonstration');
  return {
    upsertRecords: [
      {
        id: 'front.chapter-2.political-legitimacy',
        title: 'Political Legitimacy Front',
        status: jointState.politicalFrontStatus,
        visibility: 'hidden',
        playerSummary: jointState.completed
          ? 'The first proof route is now a joint framework Kessler can defend publicly.'
          : 'The joint framework still needs a cleaner legitimacy posture.',
        pressureIds: ['pressure.false-colors-public-anger', 'pressure.false-colors-joint-charter'],
        linkedClockIds: ['chapter-2.public-anger'],
        tags: ['political', 'legitimacy', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.evidence-audit',
        title: 'False Colors Evidence Audit Front',
        status: jointState.evidenceFrontStatus,
        visibility: 'hidden',
        playerSummary: jointState.hecate
          ? 'The audit preserves a weak Hecate lead for later correlation without making it final attribution.'
          : 'The audit still needs a clear handling rule for the weak follow-up lead.',
        pressureIds: ['pressure.false-colors-audit-fragility', 'pressure.false-colors-joint-charter'],
        linkedClockIds: ['chapter-2.audit-fragility'],
        tags: ['evidence', 'audit', 'chapter-2'],
        ...source
      },
      {
        id: 'front.chapter-2.security-access',
        title: 'Security Access Front',
        status: jointState.securityFrontStatus,
        visibility: 'hidden',
        playerSummary: jointState.holtRestricted
          ? 'The charter protects audit records and limits unilateral interference without premature public accusation.'
          : 'The access and interference limits remain too loose for durable closeout.',
        pressureIds: ['pressure.false-colors-security-access', 'pressure.false-colors-joint-charter'],
        linkedClockIds: ['chapter-2.security-access-risk'],
        tags: ['security', 'audit', 'chapter-2'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
}

function chapter2JointCharterActorDelta({ outcomePacket, intentParse, jointState, phaseAdvance }) {
  const source = sourceStateFields(outcomePacket, intentParse, phaseAdvance?.to || 'security-access-demonstration');
  return {
    upsertPostures: [
      {
        actorId: 'director-nia-kessler',
        posture: jointState.completed
          ? 'face-saving-support'
          : jointState.kessler
            ? 'public-partner'
            : 'cautious',
        visibility: 'hidden',
        playerSummary: jointState.kessler
          ? 'Kessler has a public path to support the joint framework without retreating from her own mandate.'
          : 'Kessler remains cautious because the public statement is not yet defensible.',
        pressureIds: ['pressure.false-colors-joint-charter'],
        ...source
      },
      {
        actorId: 'marshal-holt',
        posture: jointState.holtContainmentStatus,
        visibility: 'hidden',
        playerSummary: jointState.holtRestricted
          ? 'Holt is contained through record-protection rules rather than an unsupported public accusation.'
          : 'Holt retains room to interfere with the record.',
        pressureIds: ['pressure.false-colors-joint-charter'],
        ...source
      },
      {
        actorId: 'uss-breckenridge',
        posture: jointState.completed
          ? 'open-orders-authorized'
          : jointState.charter
            ? 'joint-charter-framed'
            : 'transition-contested',
        visibility: 'hidden',
        playerSummary: jointState.completed
          ? 'The Breckenridge can remain in the Reach under temporary Open Orders while the investigation continues.'
          : 'The Breckenridge does not yet have a clean Open Orders transition.',
        pressureIds: ['pressure.false-colors-joint-charter'],
        ...source
      },
      {
        actorId: 'mara-whitaker',
        posture: jointState.completed
          ? 'open-orders-command-accepted'
          : jointState.openOrders
            ? 'open-orders-cautious'
            : 'transition-pending',
        visibility: 'hidden',
        playerSummary: jointState.completed
          ? 'Whitaker accepts the temporary Open Orders posture as disciplined mission availability, not flight from the crisis.'
          : 'Whitaker still needs a cleaner basis before treating Open Orders as authorized.',
        pressureIds: ['pressure.false-colors-joint-charter'],
        ...source
      }
    ],
    rawValuesHidden: true
  };
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
        clockDelta(graphIndex, campaignState, 'hesperus-medical-risk', hesperusMedical + 1, 'The Hesperus pressure continues while the Breckenridge leaves under conditions.')
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
        ...phaseAdvanceDelta(phaseAdvance),
        ...chapter1OpeningMissionActivation()
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
      pressureLedger: buildPressureLedgerDeltaForTurn({ campaignState, outcomePacket, intentParse }),
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'request-chapter-1-counsel') {
    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: []
      },
      clocks: [],
      commandStyle: emptyCommandStyleDelta(),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'set-initial-convoy-posture') {
    const signals = intentParse.signals || {};
    const rescueClock = getClockValue(campaignState, 'chapter-1.rescue-window', 2);
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const posture = signals.escalatesWeapons
      ? 'weapons-escalation-blocked'
      : signals.bypassesQuarantine
        ? 'rescue-first-quarantine-risk'
        : signals.detainsCompactPersonnel
          ? 'detention-authority-contested'
          : signals.destroysConvoyEvidence
            ? 'evidence-compromised-for-speed'
            : signals.coordinatesWithAuthorities && !signals.closesOnConvoy && !signals.preparesRescue
              ? 'diplomacy-coordination-first'
              : signals.preservesConvoyEvidence && !signals.closesOnConvoy && !signals.preparesRescue
                ? 'evidence-first-cautious'
                : signals.startsRemoteVerification && !signals.closesOnConvoy && signals.usesSecurityPosture
                  ? 'security-first-remote-recon'
                  : signals.closesOnConvoy && signals.startsRemoteVerification && signals.preparesRescue
                    ? 'balanced-rescue-verification'
                    : signals.startsRemoteVerification && !signals.closesOnConvoy
                      ? 'remote-verification-first'
                      : signals.closesOnConvoy || signals.preparesRescue
                        ? 'rescue-first-approach'
                        : 'unclear-posture';

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.initial-response-posture', value: posture },
          { id: 'chapter-1.convoy-evidence', value: chapter1ConvoyEvidenceValue(signals) },
          { id: 'chapter-1.rescue-urgency', value: chapter1RescueUrgencyValue(signals) },
          { id: 'chapter-1.quarantine-posture', value: signals.bypassesQuarantine ? 'bypassed' : signals.usesQuarantinePosture ? 'active' : 'pending' },
          { id: 'chapter-1.quarantine-confidence', value: chapter1QuarantineConfidenceValue(signals) },
          { id: 'chapter-1.compact-posture', value: chapter1CompactPostureValue(signals) },
          { id: 'chapter-1.evidence-custody', value: signals.destroysConvoyEvidence ? 'compromised' : signals.preservesConvoyEvidence || signals.startsRemoteVerification ? 'preserved-initially' : 'pending' },
          { id: 'chapter-1.missing-module-lead', value: chapter1MissingModuleLeadValue(signals) }
        ],
        activePhaseIdSet: outcomePacket.resultBand === 'Success' || outcomePacket.resultBand === 'Partial Success'
          ? 'convoy-approach'
          : 'initial-reception',
        phaseSet: outcomePacket.resultBand === 'Success' || outcomePacket.resultBand === 'Partial Success'
          ? 'convoy-approach'
          : 'initial-reception',
        availableDecisionPointIdsSet: outcomePacket.resultBand === 'Success' || outcomePacket.resultBand === 'Partial Success'
          ? ['decision.first-boarding-threshold']
          : ['decision.initial-convoy-posture']
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.rescue-window',
          (signals.startsRemoteVerification || signals.coordinatesWithAuthorities || signals.preservesConvoyEvidence) && !signals.closesOnConvoy ? rescueClock - 1 : rescueClock,
          (signals.startsRemoteVerification || signals.coordinatesWithAuthorities || signals.preservesConvoyEvidence) && !signals.closesOnConvoy
            ? 'Verification, coordination, or evidence-first caution delays possible rescue contact.'
            : 'Rescue window remains under active first-response management.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          signals.bypassesQuarantine || signals.closesOnConvoy ? securityClock + 1 : securityClock,
          signals.bypassesQuarantine || signals.closesOnConvoy
            ? 'Close or quarantine-light posture increases security exposure.'
            : 'Remote posture keeps immediate security exposure stable.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          signals.preservesConvoyEvidence || signals.startsRemoteVerification ? evidenceClock - 1 : evidenceClock + (signals.destroysConvoyEvidence ? 1 : 0),
          signals.preservesConvoyEvidence || signals.startsRemoteVerification
            ? 'Initial verification and preservation reduce evidence volatility.'
            : signals.destroysConvoyEvidence
              ? 'Evidence-destructive handling increases volatility.'
              : 'Evidence volatility remains unresolved.'
        )
      ],
      commandStyle: buildCommandStyleDelta(outcomePacket.commandDecisionAwards || []),
      pressureLedger: buildPressureLedgerDeltaForTurn({ campaignState, outcomePacket, intentParse }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'set-first-boarding-threshold') {
    const signals = intentParse.signals || {};
    const rescueClock = getClockValue(campaignState, 'chapter-1.rescue-window', 2);
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const thresholdState = chapter1ThresholdState(signals);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.convoy-evidence', value: thresholdState.convoyEvidence },
          { id: 'chapter-1.rescue-urgency', value: thresholdState.rescueUrgency },
          { id: 'chapter-1.quarantine-posture', value: thresholdState.quarantinePosture },
          { id: 'chapter-1.quarantine-confidence', value: thresholdState.quarantineConfidence },
          { id: 'chapter-1.compact-posture', value: thresholdState.compactPosture },
          { id: 'chapter-1.evidence-custody', value: thresholdState.evidenceCustody },
          { id: 'chapter-1.missing-module-lead', value: thresholdState.missingModuleLead }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.rescue-window',
          (signals.closesOnConvoy || signals.preparesRescue) && !signals.escalatesWeapons
            ? rescueClock - 1
            : rescueClock,
          (signals.closesOnConvoy || signals.preparesRescue) && !signals.escalatesWeapons
            ? 'The first contact threshold moves rescue from waiting posture into prepared execution.'
            : 'Rescue remains delayed while the threshold is restated or verified.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          signals.escalatesWeapons || signals.bypassesQuarantine || (signals.closesOnConvoy && !signals.usesSecurityPosture)
            ? securityClock + 1
            : (signals.usesSecurityPosture || signals.startsRemoteVerification)
              ? securityClock - 1
              : securityClock,
          signals.escalatesWeapons || signals.bypassesQuarantine || (signals.closesOnConvoy && !signals.usesSecurityPosture)
            ? 'The threshold increases exposure through escalation, quarantine exception, or close contact without security control.'
            : (signals.usesSecurityPosture || signals.startsRemoteVerification)
              ? 'Security posture and verification reduce immediate exposure before first contact.'
              : 'Security exposure remains unresolved.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          signals.destroysConvoyEvidence
            ? evidenceClock + 1
            : (signals.preservesConvoyEvidence || signals.startsRemoteVerification)
              ? evidenceClock - 1
              : evidenceClock,
          signals.destroysConvoyEvidence
            ? 'Evidence volatility rises because first contact damages the clean record chain.'
            : (signals.preservesConvoyEvidence || signals.startsRemoteVerification)
              ? 'Evidence custody and verification reduce volatility before intrusive contact.'
              : 'Evidence volatility remains unresolved.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1ActorDelta({ outcomePacket, intentParse, signals, thresholdState, phaseAdvance }),
      fronts: chapter1FrontDelta({ outcomePacket, intentParse, signals, thresholdState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'execute-first-contact-response') {
    const signals = intentParse.signals || {};
    const rescueClock = getClockValue(campaignState, 'chapter-1.rescue-window', 2);
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const executionState = chapter1ExecutionState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.first-contact-route', value: executionState.firstContactRoute },
          { id: 'chapter-1.parnell-rescue', value: executionState.parnellRescue },
          { id: 'chapter-1.faraday-evidence-access', value: executionState.faradayEvidenceAccess },
          { id: 'chapter-1.convoy-evidence', value: executionState.convoyEvidence },
          { id: 'chapter-1.rescue-urgency', value: executionState.rescueUrgency },
          { id: 'chapter-1.evidence-custody', value: executionState.evidenceCustody }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.rescue-window',
          executionState.parnellRescue === 'stabilized' || executionState.parnellRescue === 'risk-accepted'
            ? rescueClock - 1
            : rescueClock + 1,
          executionState.parnellRescue === 'stabilized' || executionState.parnellRescue === 'risk-accepted'
            ? 'First contact puts Parnell rescue into active execution.'
            : 'First contact delays immediate Parnell rescue while other work takes priority.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          signals.escalatesWeapons || signals.bypassesQuarantine || ((signals.usesBoardingTeam || signals.closesOnConvoy) && !signals.usesSecurityPosture)
            ? securityClock + 1
            : (signals.usesSecurityPosture || signals.startsRemoteVerification)
              ? securityClock - 1
              : securityClock,
          signals.escalatesWeapons || signals.bypassesQuarantine || ((signals.usesBoardingTeam || signals.closesOnConvoy) && !signals.usesSecurityPosture)
            ? 'First contact increases exposure through escalation, quarantine exception, or uncovered boarding.'
            : (signals.usesSecurityPosture || signals.startsRemoteVerification)
              ? 'Remote verification or overwatch keeps first contact security exposure contained.'
              : 'Security exposure remains unresolved during first contact.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          executionState.faradayEvidenceAccess === 'compromised'
            ? evidenceClock + 1
            : ['preserved-log-access', 'remote-only-fragments'].includes(executionState.faradayEvidenceAccess)
              ? evidenceClock - 1
              : evidenceClock,
          executionState.faradayEvidenceAccess === 'compromised'
            ? 'First contact compromises clean access to Faraday Bell records.'
            : ['preserved-log-access', 'remote-only-fragments'].includes(executionState.faradayEvidenceAccess)
              ? 'First contact preserves useful Faraday Bell record access.'
              : 'Evidence volatility remains unresolved during first contact.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1ExecutionActorDelta({ outcomePacket, intentParse, signals, executionState, phaseAdvance }),
      fronts: chapter1ExecutionFrontDelta({ outcomePacket, intentParse, signals, executionState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'frame-offsite-custody-cargo-leads') {
    const signals = intentParse.signals || {};
    const rescueClock = getClockValue(campaignState, 'chapter-1.rescue-window', 2);
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const discoveryState = chapter1DiscoveryState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.evacuee-location', value: discoveryState.evacueeLocation },
          { id: 'chapter-1.custody-dispute', value: discoveryState.custodyDispute },
          { id: 'chapter-1.missing-cargo-lead', value: discoveryState.missingCargoLead },
          { id: 'chapter-1.compact-posture', value: discoveryState.compactPosture },
          { id: 'chapter-1.rescue-urgency', value: discoveryState.rescueUrgency },
          { id: 'chapter-1.evidence-custody', value: discoveryState.evidenceCustody },
          { id: 'chapter-1.missing-module-lead', value: discoveryState.missingModuleLead }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.rescue-window',
          discoveryState.evacueeLocation === 'shelter-located' ? rescueClock - 1 : rescueClock + 1,
          discoveryState.evacueeLocation === 'shelter-located'
            ? 'The evacuee shelter lead makes rescue triage more actionable.'
            : 'Evacuee location remains uncertain and rescue pressure rises.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          discoveryState.custodyDispute === 'escalated'
            ? securityClock + 1
            : signals.usesSecurityPosture || discoveryState.custodyDispute === 'framed-for-negotiation'
              ? securityClock - 1
              : securityClock,
          discoveryState.custodyDispute === 'escalated'
            ? 'Custody escalation increases security exposure.'
            : signals.usesSecurityPosture || discoveryState.custodyDispute === 'framed-for-negotiation'
              ? 'A lawful custody frame and security posture contain immediate exposure.'
              : 'Security exposure remains unresolved around the custody claim.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          discoveryState.missingCargoLead === 'compromised'
            ? evidenceClock + 1
            : ['secured-hold-confirmed', 'inventory-fragment'].includes(discoveryState.missingCargoLead)
              ? evidenceClock - 1
              : evidenceClock,
          discoveryState.missingCargoLead === 'compromised'
            ? 'Missing-cargo evidence degrades during discovery.'
            : ['secured-hold-confirmed', 'inventory-fragment'].includes(discoveryState.missingCargoLead)
              ? 'The secured-hold inventory preserves a missing-cargo lead.'
              : 'Evidence volatility remains unresolved around the missing cargo.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1DiscoveryActorDelta({ outcomePacket, intentParse, discoveryState, phaseAdvance }),
      fronts: chapter1DiscoveryFrontDelta({ outcomePacket, intentParse, signals, discoveryState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'set-pell-contact-terms') {
    const signals = intentParse.signals || {};
    const rescueClock = getClockValue(campaignState, 'chapter-1.rescue-window', 2);
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const pellTermsState = chapter1PellTermsState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.pell-contact', value: pellTermsState.pellContact },
          { id: 'chapter-1.ivers-status', value: pellTermsState.iversStatus },
          { id: 'chapter-1.cargo-recovery-route', value: pellTermsState.cargoRecoveryRoute },
          { id: 'chapter-1.custody-dispute', value: pellTermsState.custodyDispute },
          { id: 'chapter-1.compact-posture', value: pellTermsState.compactPosture },
          { id: 'chapter-1.missing-cargo-lead', value: pellTermsState.missingCargoLead },
          { id: 'chapter-1.missing-module-lead', value: pellTermsState.missingModuleLead }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.rescue-window',
          pellTermsState.iversStatus === 'release-negotiation-open' ? rescueClock - 1 : rescueClock,
          pellTermsState.iversStatus === 'release-negotiation-open'
            ? 'Release terms make the offsite rescue and witness path more actionable.'
            : 'Rescue window remains stable while Pell contact terms are underdefined.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          pellTermsState.pellContact === 'coercive-standoff'
            ? securityClock + 1
            : pellTermsState.pellContact === 'joint-inspection-open'
              ? securityClock - 1
              : securityClock,
          pellTermsState.pellContact === 'coercive-standoff'
            ? 'Coercive Pell contact raises security exposure.'
            : pellTermsState.pellContact === 'joint-inspection-open'
              ? 'Joint inspection terms contain immediate security exposure.'
              : 'Security exposure remains stable while contact terms develop.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          pellTermsState.cargoRecoveryRoute === 'compromised'
            ? evidenceClock + 1
            : ['joint-inspection-undertaking', 'legal-demand'].includes(pellTermsState.cargoRecoveryRoute)
              ? evidenceClock - 1
              : evidenceClock,
          pellTermsState.cargoRecoveryRoute === 'compromised'
            ? 'Cargo evidence is weakened during Pell contact.'
            : ['joint-inspection-undertaking', 'legal-demand'].includes(pellTermsState.cargoRecoveryRoute)
              ? 'Cargo recovery terms reduce evidence volatility.'
              : 'Evidence volatility remains stable while cargo terms develop.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1PellTermsActorDelta({ outcomePacket, intentParse, pellTermsState, phaseAdvance }),
      fronts: chapter1PellTermsFrontDelta({ outcomePacket, intentParse, signals, pellTermsState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'execute-joint-inspection-release') {
    const signals = intentParse.signals || {};
    const rescueClock = getClockValue(campaignState, 'chapter-1.rescue-window', 2);
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const jointInspectionState = chapter1JointInspectionState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.joint-inspection-status', value: jointInspectionState.jointInspectionStatus },
          { id: 'chapter-1.pell-contact', value: jointInspectionState.pellContact },
          { id: 'chapter-1.ivers-status', value: jointInspectionState.iversStatus },
          { id: 'chapter-1.cargo-recovery-route', value: jointInspectionState.cargoRecoveryRoute },
          { id: 'chapter-1.custody-dispute', value: jointInspectionState.custodyDispute },
          { id: 'chapter-1.compact-posture', value: jointInspectionState.compactPosture },
          { id: 'chapter-1.missing-cargo-lead', value: jointInspectionState.missingCargoLead },
          { id: 'chapter-1.missing-module-lead', value: jointInspectionState.missingModuleLead }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.rescue-window',
          jointInspectionState.iversStatus === 'supervised-release-secured' ? rescueClock - 1 : rescueClock,
          jointInspectionState.iversStatus === 'supervised-release-secured'
            ? 'Supervised Ivers release improves rescue and witness access.'
            : 'Rescue window remains stable while release execution is underdefined.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          jointInspectionState.pellContact === 'coercive-standoff'
            ? securityClock + 1
            : jointInspectionState.jointInspectionStatus === 'shared-record-open'
              ? securityClock - 1
              : securityClock,
          jointInspectionState.pellContact === 'coercive-standoff'
            ? 'Coercive inspection execution raises security exposure.'
            : jointInspectionState.jointInspectionStatus === 'shared-record-open'
              ? 'Shared inspection execution contains immediate security exposure.'
              : 'Security exposure remains stable while inspection execution develops.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          jointInspectionState.cargoRecoveryRoute === 'compromised'
            ? evidenceClock + 1
            : ['joint-inspection-in-progress', 'joint-inspection-undertaking'].includes(jointInspectionState.cargoRecoveryRoute)
              ? evidenceClock - 1
              : evidenceClock,
          jointInspectionState.cargoRecoveryRoute === 'compromised'
            ? 'Cargo evidence is weakened during joint inspection execution.'
            : ['joint-inspection-in-progress', 'joint-inspection-undertaking'].includes(jointInspectionState.cargoRecoveryRoute)
              ? 'Shared inspection execution reduces cargo evidence volatility.'
              : 'Evidence volatility remains stable while inspection execution develops.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1JointInspectionActorDelta({ outcomePacket, intentParse, jointInspectionState, phaseAdvance }),
      fronts: chapter1JointInspectionFrontDelta({ outcomePacket, intentParse, signals, jointInspectionState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'trace-cargo-diagnostic-pulse') {
    const signals = intentParse.signals || {};
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const cargoPulseState = chapter1CargoPulseState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.cargo-location', value: cargoPulseState.cargoLocation },
          { id: 'chapter-1.cargo-recovery-route', value: cargoPulseState.cargoRecoveryRoute },
          { id: 'chapter-1.joint-inspection-status', value: cargoPulseState.jointInspectionStatus },
          { id: 'chapter-1.pell-contact', value: cargoPulseState.pellContact },
          { id: 'chapter-1.compact-posture', value: cargoPulseState.compactPosture },
          { id: 'chapter-1.missing-cargo-lead', value: cargoPulseState.missingCargoLead },
          { id: 'chapter-1.missing-module-lead', value: cargoPulseState.missingModuleLead }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          cargoPulseState.pellContact === 'coercive-standoff'
            ? securityClock + 1
            : cargoPulseState.cargoLocation === 'joint-locus-preserved'
              ? securityClock - 1
              : securityClock,
          cargoPulseState.pellContact === 'coercive-standoff'
            ? 'Forced cargo recovery pressure raises security exposure.'
            : cargoPulseState.cargoLocation === 'joint-locus-preserved'
              ? 'Non-hostile cargo signal tracing contains immediate security exposure.'
              : 'Security exposure remains stable while the cargo trace develops.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          cargoPulseState.cargoRecoveryRoute === 'signal-compromised'
            ? evidenceClock + 1
            : ['joint-seal-preserved', 'diagnostic-pulse-traced'].includes(cargoPulseState.cargoRecoveryRoute)
              ? evidenceClock - 1
              : evidenceClock,
          cargoPulseState.cargoRecoveryRoute === 'signal-compromised'
            ? 'Cargo evidence is weakened while tracing the diagnostic pulse.'
            : ['joint-seal-preserved', 'diagnostic-pulse-traced'].includes(cargoPulseState.cargoRecoveryRoute)
              ? 'Tracing the cargo pulse reduces evidence volatility.'
              : 'Evidence volatility remains stable while the cargo trace develops.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1CargoPulseActorDelta({ outcomePacket, intentParse, cargoPulseState, phaseAdvance }),
      fronts: chapter1CargoPulseFrontDelta({ outcomePacket, intentParse, cargoPulseState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'recover-hardware-under-seal') {
    const signals = intentParse.signals || {};
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const hardwareRecoveryState = chapter1HardwareRecoveryState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.recovered-hardware-status', value: hardwareRecoveryState.recoveredHardwareStatus },
          { id: 'chapter-1.cargo-location', value: hardwareRecoveryState.cargoLocation },
          { id: 'chapter-1.cargo-recovery-route', value: hardwareRecoveryState.cargoRecoveryRoute },
          { id: 'chapter-1.joint-inspection-status', value: hardwareRecoveryState.jointInspectionStatus },
          { id: 'chapter-1.pell-contact', value: hardwareRecoveryState.pellContact },
          { id: 'chapter-1.compact-posture', value: hardwareRecoveryState.compactPosture },
          { id: 'chapter-1.missing-cargo-lead', value: hardwareRecoveryState.missingCargoLead },
          { id: 'chapter-1.missing-module-lead', value: hardwareRecoveryState.missingModuleLead }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          hardwareRecoveryState.pellContact === 'coercive-standoff'
            ? securityClock + 1
            : hardwareRecoveryState.recoveredHardwareStatus === 'recovered-under-joint-seal'
              ? securityClock - 1
              : securityClock,
          hardwareRecoveryState.pellContact === 'coercive-standoff'
            ? 'Forced hardware recovery raises security exposure.'
            : hardwareRecoveryState.recoveredHardwareStatus === 'recovered-under-joint-seal'
              ? 'Joint-seal hardware recovery contains immediate security exposure.'
              : 'Security exposure remains stable while recovery posture develops.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          hardwareRecoveryState.recoveredHardwareStatus === 'compromised'
            ? evidenceClock + 1
            : ['recovered-under-joint-seal', 'recovered-by-authority'].includes(hardwareRecoveryState.recoveredHardwareStatus)
              ? evidenceClock - 1
              : evidenceClock,
          hardwareRecoveryState.recoveredHardwareStatus === 'compromised'
            ? 'Hardware recovery damages the evidence chain.'
            : ['recovered-under-joint-seal', 'recovered-by-authority'].includes(hardwareRecoveryState.recoveredHardwareStatus)
              ? 'Recovered hardware reduces evidence volatility.'
              : 'Evidence volatility remains stable while recovery posture develops.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1HardwareRecoveryActorDelta({ outcomePacket, intentParse, hardwareRecoveryState, phaseAdvance }),
      fronts: chapter1HardwareRecoveryFrontDelta({ outcomePacket, intentParse, hardwareRecoveryState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'set-chapter1-resolution-terms') {
    const signals = intentParse.signals || {};
    const rescueClock = getClockValue(campaignState, 'chapter-1.rescue-window', 2);
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const resolutionState = chapter1ResolutionState(signals, outcomePacket, campaignState);
    const cooperative = resolutionState.resolutionPath === 'cooperative';
    const costly = resolutionState.resolutionPath === 'costly';
    const authoritative = resolutionState.resolutionPath === 'authoritative';

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.resolution-path', value: resolutionState.resolutionPath },
          { id: 'chapter-1.incident-record-status', value: resolutionState.incidentRecordStatus },
          { id: 'chapter-1.ivers-trust', value: resolutionState.iversTrust },
          { id: 'chapter-1.pell-status', value: resolutionState.pellStatus },
          { id: 'chapter-1.compact-investigation-access', value: resolutionState.compactInvestigationAccess },
          { id: 'chapter-1.authentication-failure-posture', value: resolutionState.authenticationFailurePosture },
          { id: 'chapter-1.parnell-technical-debt', value: resolutionState.parnellTechnicalDebt },
          { id: 'chapter-1.compact-posture', value: resolutionState.compactPosture },
          { id: 'chapter-1.joint-inspection-status', value: resolutionState.jointInspectionStatus },
          { id: 'chapter-1.pell-contact', value: resolutionState.pellContact },
          { id: 'chapter-1.cargo-recovery-route', value: resolutionState.cargoRecoveryRoute }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.rescue-window',
          costly ? rescueClock + 1 : rescueClock,
          costly
            ? 'Costly closure increases humanitarian strain around the rescued crews.'
            : 'Chapter 1 closure keeps the rescue window from reopening.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          authoritative || costly ? securityClock + 1 : cooperative ? securityClock - 1 : securityClock,
          authoritative || costly
            ? 'Authority pressure or costly closure raises security exposure.'
            : cooperative
              ? 'Cooperative resolution reduces security exposure.'
              : 'Security exposure remains stable through fragmented closure.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          cooperative ? evidenceClock - 1 : costly ? evidenceClock + 1 : evidenceClock,
          cooperative
            ? 'A joint incident record reduces evidence volatility.'
            : costly
              ? 'Costly closure increases evidence volatility.'
              : 'Evidence volatility remains stable while unresolved terms carry forward.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1ResolutionActorDelta({ outcomePacket, intentParse, resolutionState, phaseAdvance }),
      fronts: chapter1ResolutionFrontDelta({ outcomePacket, intentParse, resolutionState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'transition-chapter1-to-false-colors') {
    const signals = intentParse.signals || {};
    const securityClock = getClockValue(campaignState, 'chapter-1.security-exposure', 1);
    const evidenceClock = getClockValue(campaignState, 'chapter-1.evidence-volatility', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const transitionState = chapter1FalseColorsTransitionState(signals, outcomePacket, campaignState);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-1.transition-status', value: transitionState.transitionStatus },
          { id: 'chapter-1.next-mission-hook', value: transitionState.nextMissionHook },
          { id: 'chapter-1.compact-posture', value: transitionState.compactPosture },
          { id: 'chapter-1.incident-record-status', value: transitionState.incidentRecordStatus }
        ],
        endStateSet: transitionState.cleanTransition ? 'chapter-1-transition-to-false-colors' : null,
        completedMissionIdSet: transitionState.cleanTransition ? 'chapter-1-the-empty-convoy' : null,
        nextMissionIdSet: transitionState.nextMissionHook === 'chapter-2-false-colors-open' ? 'chapter-2-false-colors' : null,
        transitionStatusSet: transitionState.nextMissionHook === 'chapter-2-false-colors-open' ? 'chapter-2-pending' : 'chapter-2-contested',
        ...phaseDelta
      },
      mainCampaign: transitionState.nextMissionHook === 'chapter-2-false-colors-open'
        ? {
            completedChaptersAdd: ['chapter-1-the-empty-convoy'],
            availableChaptersAdd: ['chapter-2-false-colors'],
            lockedChaptersRemove: ['chapter-2-false-colors'],
            chapterCursorSet: 'chapter-2-false-colors'
          }
        : {},
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.security-exposure',
          transitionState.contested ? securityClock + 1 : securityClock,
          transitionState.contested
            ? 'Contested False Colors handoff raises security exposure.'
            : 'Non-hostile False Colors handoff preserves security exposure.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-1.evidence-volatility',
          transitionState.incidentRecordStatus === 'fragmented-record' ? evidenceClock + 1 : evidenceClock,
          transitionState.incidentRecordStatus === 'fragmented-record'
            ? 'Incomplete record handoff increases evidence volatility.'
            : 'The Chapter 1 record carries forward without increasing evidence volatility.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter1FalseColorsTransitionActorDelta({ outcomePacket, intentParse, transitionState, phaseAdvance }),
      fronts: chapter1FalseColorsTransitionFrontDelta({ outcomePacket, intentParse, transitionState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'set-false-colors-transparency-terms') {
    const signals = intentParse.signals || {};
    const publicAngerClock = getClockValue(campaignState, 'chapter-2.public-anger', 2);
    const auditFragilityClock = getClockValue(campaignState, 'chapter-2.audit-fragility', 2);
    const medicalRiskClock = getClockValue(campaignState, 'chapter-2.medical-risk', 2);
    const securityAccessClock = getClockValue(campaignState, 'chapter-2.security-access-risk', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const transparencyState = chapter2TransparencyTermsState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-2.transparency-posture', value: transparencyState.transparencyPosture },
          { id: 'chapter-2.compact-access-scope', value: transparencyState.compactAccessScope },
          { id: 'chapter-2.aegis-medical-posture', value: transparencyState.aegisMedicalPosture },
          { id: 'chapter-2.breckenridge-alibi-status', value: transparencyState.breckenridgeAlibiStatus },
          { id: 'chapter-2.tactical-secrecy-posture', value: transparencyState.tacticalSecrecyPosture }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.public-anger',
          transparencyState.accessDenial
            ? publicAngerClock + 1
            : transparencyState.independentVerification || transparencyState.medicalHelp
              ? publicAngerClock - 1
              : publicAngerClock,
          transparencyState.accessDenial
            ? 'Starfleet-only proof raises public anger around the Aegis Two accusation.'
            : transparencyState.independentVerification || transparencyState.medicalHelp
              ? 'Independent verification or visible medical help lowers immediate public anger.'
              : 'Public anger remains stable while terms are underdeveloped.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.audit-fragility',
          transparencyState.independentVerification
            ? auditFragilityClock - 1
            : transparencyState.accessDenial
              ? auditFragilityClock + 1
              : auditFragilityClock,
          transparencyState.independentVerification
            ? 'Independent verification lowers audit fragility.'
            : transparencyState.accessDenial
              ? 'Denied verification raises audit fragility.'
              : 'Audit fragility remains stable while first terms are incomplete.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.medical-risk',
          transparencyState.medicalHelp ? medicalRiskClock - 1 : medicalRiskClock + 1,
          transparencyState.medicalHelp
            ? 'Aegis Two medical help lowers immediate casualty risk.'
            : 'Deferred medical help raises casualty and trust risk.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.security-access-risk',
          transparencyState.overexposure
            ? securityAccessClock + 1
            : transparencyState.controlledSecrecy
              ? securityAccessClock - 1
              : securityAccessClock,
          transparencyState.overexposure
            ? 'Unrestricted access raises command-authentication exposure.'
            : transparencyState.controlledSecrecy
              ? 'A controlled annex lowers access risk.'
              : 'Security access risk remains stable while boundaries are underdefined.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter2TransparencyActorDelta({ outcomePacket, intentParse, transparencyState, phaseAdvance }),
      fronts: chapter2TransparencyFrontDelta({ outcomePacket, intentParse, transparencyState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'establish-orison-evidence-baseline') {
    const signals = intentParse.signals || {};
    const publicAngerClock = getClockValue(campaignState, 'chapter-2.public-anger', 2);
    const auditFragilityClock = getClockValue(campaignState, 'chapter-2.audit-fragility', 2);
    const securityAccessClock = getClockValue(campaignState, 'chapter-2.security-access-risk', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const evidenceState = chapter2OrisonEvidenceState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-2.audit-chain-status', value: evidenceState.auditChainStatus },
          { id: 'chapter-2.orison-sensor-status', value: evidenceState.orisonSensorStatus },
          { id: 'chapter-2.calibration-evidence-status', value: evidenceState.calibrationEvidenceStatus },
          { id: 'chapter-2.attack-reconstruction-status', value: evidenceState.attackReconstructionStatus },
          { id: 'chapter-2.disclosure-boundary-status', value: evidenceState.disclosureBoundaryStatus },
          {
            id: 'chapter-2.breckenridge-alibi-status',
            value: evidenceState.calibrationProof || evidenceState.independentBaseline
              ? 'independent-verification-framed'
              : outcomeFlagValue(campaignState, 'chapter-2.breckenridge-alibi-status', 'underdeveloped')
          }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.public-anger',
          evidenceState.unsupportedAccusation || evidenceState.accessDenial
            ? publicAngerClock + 1
            : evidenceState.independentBaseline && evidenceState.calibrationProof
              ? publicAngerClock - 1
              : publicAngerClock,
          evidenceState.unsupportedAccusation || evidenceState.accessDenial
            ? 'Unsupported accusation or Starfleet-only proof keeps public anger rising.'
            : evidenceState.independentBaseline && evidenceState.calibrationProof
              ? 'Independent baseline and calibration proof lower public anger.'
              : 'Public anger remains stable while the evidence baseline develops.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.audit-fragility',
          evidenceState.independentBaseline && evidenceState.auditChain
            ? auditFragilityClock - 1
            : evidenceState.accessDenial || evidenceState.unsupportedAccusation
              ? auditFragilityClock + 1
              : auditFragilityClock,
          evidenceState.independentBaseline && evidenceState.auditChain
            ? 'Orison baseline preservation lowers audit fragility.'
            : evidenceState.accessDenial || evidenceState.unsupportedAccusation
              ? 'Denied participation or unsupported accusation raises audit fragility.'
              : 'Audit fragility remains stable while the baseline remains partial.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.security-access-risk',
          evidenceState.overexposure
            ? securityAccessClock + 1
            : evidenceState.controlledDisclosure
              ? securityAccessClock - 1
              : securityAccessClock,
          evidenceState.overexposure
            ? 'Evidence handling exposes too much tactical architecture.'
            : evidenceState.controlledDisclosure
              ? 'Selected nonclassified disclosure keeps access risk contained.'
              : 'Security access risk remains stable while disclosure boundaries develop.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter2OrisonEvidenceActorDelta({ outcomePacket, intentParse, evidenceState, phaseAdvance }),
      fronts: chapter2OrisonEvidenceFrontDelta({ outcomePacket, intentParse, evidenceState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'stabilize-aegis-medical-trust') {
    const signals = intentParse.signals || {};
    const publicAngerClock = getClockValue(campaignState, 'chapter-2.public-anger', 2);
    const auditFragilityClock = getClockValue(campaignState, 'chapter-2.audit-fragility', 2);
    const medicalRiskClock = getClockValue(campaignState, 'chapter-2.medical-risk', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const medicalState = chapter2AegisMedicalState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-2.aegis-care-status', value: medicalState.aegisCareStatus },
          { id: 'chapter-2.medical-neutrality-status', value: medicalState.medicalNeutralityStatus },
          { id: 'chapter-2.compact-medical-trust', value: medicalState.compactMedicalTrust },
          { id: 'chapter-2.patrol-testimony-status', value: medicalState.patrolTestimonyStatus },
          { id: 'chapter-2.public-medical-record-status', value: medicalState.publicMedicalRecordStatus },
          { id: 'chapter-2.aegis-medical-posture', value: medicalState.care ? 'medical-help-separated-from-politics' : outcomeFlagValue(campaignState, 'chapter-2.aegis-medical-posture', 'pending') }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.medical-risk',
          medicalState.coercive
            ? medicalRiskClock + 1
            : medicalState.care
              ? medicalRiskClock - 1
              : medicalRiskClock,
          medicalState.coercive
            ? 'Coercive handling raises medical and trust risk.'
            : medicalState.care
              ? 'Aegis Two care lowers medical risk.'
              : 'Medical risk remains stable while care remains unresolved.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.public-anger',
          medicalState.coercive
            ? publicAngerClock + 1
            : medicalState.care && medicalState.neutralCare
              ? publicAngerClock - 1
              : publicAngerClock,
          medicalState.coercive
            ? 'Care entangled with leverage raises public anger.'
            : medicalState.care && medicalState.neutralCare
              ? 'Visible neutral care lowers public anger.'
              : 'Public anger remains stable while medical neutrality is incomplete.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.audit-fragility',
          medicalState.testimony && medicalState.consent && !medicalState.coercive
            ? auditFragilityClock - 1
            : medicalState.coercive
              ? auditFragilityClock + 1
              : auditFragilityClock,
          medicalState.testimony && medicalState.consent && !medicalState.coercive
            ? 'Voluntary testimony lowers audit fragility.'
            : medicalState.coercive
              ? 'Contested testimony raises audit fragility.'
              : 'Audit fragility remains stable while testimony is pending.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter2AegisMedicalActorDelta({ outcomePacket, intentParse, medicalState, phaseAdvance }),
      fronts: chapter2AegisMedicalFrontDelta({ outcomePacket, intentParse, medicalState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'set-security-access-demonstration') {
    const signals = intentParse.signals || {};
    const publicAngerClock = getClockValue(campaignState, 'chapter-2.public-anger', 2);
    const auditFragilityClock = getClockValue(campaignState, 'chapter-2.audit-fragility', 2);
    const securityAccessClock = getClockValue(campaignState, 'chapter-2.security-access-risk', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const securityState = chapter2SecurityAccessState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-2.security-access-status', value: securityState.securityAccessStatus },
          { id: 'chapter-2.command-auth-exposure-status', value: securityState.commandAuthExposureStatus },
          { id: 'chapter-2.bronn-audit-status', value: securityState.bronnAuditStatus },
          { id: 'chapter-2.kessler-access-position', value: securityState.kesslerAccessPosition },
          { id: 'chapter-2.tolland-disclosure-status', value: securityState.tollandDisclosureStatus },
          {
            id: 'chapter-2.tactical-secrecy-posture',
            value: securityState.overexposure
              ? 'overexposed'
              : securityState.controlledAnnex
                ? 'controlled-annex'
                : outcomeFlagValue(campaignState, 'chapter-2.tactical-secrecy-posture', 'pending')
          },
          {
            id: 'chapter-2.compact-access-scope',
            value: securityState.overexposure
              ? 'unbounded'
              : securityState.denial
                ? 'denied'
                : securityState.kesslerAlternative
                  ? 'observer-limited'
                  : outcomeFlagValue(campaignState, 'chapter-2.compact-access-scope', 'pending')
          }
        ],
        ...phaseDelta
      },
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.security-access-risk',
          securityState.overexposure
            ? securityAccessClock + 1
            : securityState.controlledAnnex && securityState.demonstration
              ? securityAccessClock - 1
              : securityAccessClock,
          securityState.overexposure
            ? 'Unrestricted command-system access raises security exposure.'
            : securityState.controlledAnnex && securityState.demonstration
              ? 'A controlled command-authentication demonstration lowers security access risk.'
              : 'Security access risk remains stable while the demonstration remains partial.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.audit-fragility',
          securityState.denial || securityState.politicized
            ? auditFragilityClock + 1
            : securityState.demonstration && securityState.kesslerAlternative
              ? auditFragilityClock - 1
              : auditFragilityClock,
          securityState.denial || securityState.politicized
            ? 'Starfleet-only access handling or politicized blame raises audit fragility.'
            : securityState.demonstration && securityState.kesslerAlternative
              ? 'A defensible demonstration lowers audit fragility.'
              : 'Audit fragility remains stable while access proof remains partial.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.public-anger',
          securityState.denial || securityState.politicized
            ? publicAngerClock + 1
            : securityState.kesslerAlternative && securityState.controlledAnnex
              ? publicAngerClock - 1
              : publicAngerClock,
          securityState.denial || securityState.politicized
            ? 'Access denial or personalized blame raises public anger.'
            : securityState.kesslerAlternative && securityState.controlledAnnex
              ? 'A credible access alternative lowers public anger.'
              : 'Public anger remains stable while the access position remains cautious.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter2SecurityAccessActorDelta({ outcomePacket, intentParse, securityState, phaseAdvance }),
      fronts: chapter2SecurityAccessFrontDelta({ outcomePacket, intentParse, securityState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      turnLedger: {
        appendOutcomeId: outcomePacket.id,
        swipeRerollForbidden: true
      }
    };
  }

  if (intentParse.primaryIntent === 'frame-joint-investigation-charter') {
    const signals = intentParse.signals || {};
    const publicAngerClock = getClockValue(campaignState, 'chapter-2.public-anger', 2);
    const auditFragilityClock = getClockValue(campaignState, 'chapter-2.audit-fragility', 2);
    const securityAccessClock = getClockValue(campaignState, 'chapter-2.security-access-risk', 2);
    const phaseDelta = phaseAdvanceDelta(phaseAdvance);
    const jointState = chapter2JointCharterState(signals, outcomePacket);

    return {
      outcomeId: outcomePacket.id,
      mission: {
        knownFactIdsAdd: outcomePacket.revealedFactIds || [],
        outcomeFlagsSet: [
          { id: 'chapter-2.joint-investigation-status', value: jointState.jointInvestigationStatus },
          { id: 'chapter-2.kessler-legitimacy-status', value: jointState.kesslerLegitimacyStatus },
          { id: 'chapter-2.holt-containment-status', value: jointState.holtContainmentStatus },
          { id: 'chapter-2.hecate-lead-status', value: jointState.hecateLeadStatus },
          { id: 'chapter-2.open-orders-transition-status', value: jointState.openOrdersTransitionStatus }
        ],
        endStateSet: jointState.completed ? 'chapter-2-joint-investigation-charter' : null,
        completedMissionIdSet: jointState.completed ? 'chapter-2-false-colors' : null,
        nextMissionIdSet: jointState.completed ? 'open-orders-1-work-worth-doing' : null,
        transitionStatusSet: jointState.completed ? 'open-orders-1-pending' : null,
        ...phaseDelta
      },
      mainCampaign: jointState.completed
        ? {
            completedChaptersAdd: ['chapter-2-false-colors'],
            availableChaptersAdd: ['open-orders-1-work-worth-doing'],
            lockedChaptersRemove: ['open-orders-1-work-worth-doing'],
            chapterCursorSet: 'open-orders-1-work-worth-doing'
          }
        : {},
      clocks: [
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.public-anger',
          jointState.rupture
            ? publicAngerClock + 1
            : jointState.completed
              ? publicAngerClock - 1
              : publicAngerClock,
          jointState.rupture
            ? 'Premature accusation or pursuit raises public anger.'
            : jointState.completed
              ? 'A defensible joint charter lowers public anger.'
              : 'Public anger remains stable while the charter remains partial.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.audit-fragility',
          jointState.overclaim || jointState.unsupportedAccusation
            ? auditFragilityClock + 1
            : jointState.holtRestricted && jointState.hecate
              ? auditFragilityClock - 1
              : auditFragilityClock,
          jointState.overclaim || jointState.unsupportedAccusation
            ? 'Overclaiming the weak lead or premature accusation raises audit fragility.'
            : jointState.holtRestricted && jointState.hecate
              ? 'Record protection and weak-lead preservation lower audit fragility.'
              : 'Audit fragility remains stable while closeout terms remain partial.'
        ),
        clockDelta(
          graphIndex,
          campaignState,
          'chapter-2.security-access-risk',
          jointState.rupture
            ? securityAccessClock + 1
            : jointState.holtRestricted
              ? securityAccessClock - 1
              : securityAccessClock,
          jointState.rupture
            ? 'Escalated closeout handling raises security-access risk.'
            : jointState.holtRestricted
              ? 'Holt interference restrictions lower security-access risk.'
              : 'Security-access risk remains stable while interference limits remain partial.'
        )
      ],
      commandStyle: emptyCommandStyleDelta(),
      actors: chapter2JointCharterActorDelta({ outcomePacket, intentParse, jointState, phaseAdvance }),
      fronts: chapter2JointCharterFrontDelta({ outcomePacket, intentParse, jointState, phaseAdvance }),
      relationships: {
        affectedCrewIds: intentParse.targetIds || [],
        descriptiveChanges: [],
        rawValuesHidden: true
      },
      pressureLedger: buildPressureLedgerDeltaForTurn({ campaignState, outcomePacket, intentParse }),
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
      clockDelta(graphIndex, campaignState, 'arrival-schedule-margin', arrivalSchedule - 1, 'The Breckenridge accepts a minor delay.'),
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
