import { classifyAction } from '../adjudication/action-classifier.mjs';
import { checkAuthorityAndCapability } from '../adjudication/capability-validator.mjs';
import { parseIntent } from '../adjudication/intent-parser.mjs';
import { resolveAction } from '../adjudication/action-resolver.mjs';
import { validateDirectorTurn } from '../adjudication/state-delta-validator.mjs';
import {
  commandConductLogSummaryInputs,
  commandConductRemovalRequired
} from '../adjudication/command-conduct.mjs';
import { planCommandCompetence } from '../competence/competence-planner.mjs';
import { indexMissionGraph, unique } from './graph-lookup.mjs';
import { selectPressureFocus } from './pacing.mjs';
import { evaluatePhaseAdvance } from './phase-advancement.mjs';
import { buildStateDelta } from './state-delta.mjs';
import {
  applySimulationModePolicyToOutcome,
  simulationModeNarratorConstraints
} from '../simulation/simulation-mode-policy.mjs';
import { runDirectorRetrieval } from '../retrieval/packet-builder.mjs';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function missionCompetencePolicy(input, graph) {
  return input.competencePolicy
    || graph.competencePolicy
    || graph.commandCompetencePolicy
    || graph.competence
    || null;
}

function buildDirectorResponse({ pressureFocus, intentParse, campaignState = {} }) {
  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.post-refit-shakedown-underway',
        'crew.acting-xo-handoff',
        'ship.provisional-routines',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player establishes first command tone while boarding a working ship, with consequences for whether provisional routines feel respected or replaced.'
    };
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'crew.acting-xo-handoff',
        'crew.transfer-cohort-tension',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player completes the Captain and acting-XO handoff while giving or withholding command-value signal that will shape later interpretation.'
    };
  }

  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'hesperus.no-hostile-actor',
        'hesperus.passenger-risk',
        'hesperus.inspection-fraud',
        'hesperus.plasma-injector-failing',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'arrival-schedule-margin',
        'hesperus-medical-risk',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player uses credible authority and accepts a logged delay while separating passenger safety from owner accountability. This supports a Resolve award without making the passengers carry the full cost.'
    };
  }

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'crew.transfer-cohort-tension',
        'ship.provisional-routines',
        'ship.combined-load-risk',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        'technical-debt-pressure',
        'arrival-schedule-margin',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player sets senior staff readiness priorities by deciding what receives time, who owns follow-up, and which risk remains explicit for the next drill.'
    };
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.fallback-command-incompatibility',
        'ship.command-network-certificate-issue',
        'ship.provisional-routines',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player turns the fallback-command drill into an executable command-continuity policy while deciding how to handle the command-network certificate limitation.'
    };
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.provisional-routines',
        'crew.transfer-cohort-tension',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'crew-integration-strain',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player uses routine senior staff contact to define how concerns, dissent, and follow-up should move through the XO.'
    };
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'hesperus.inspection-fraud',
        intentParse.signals?.preservesEscapePodData ? 'hesperus.escape-pod-subspace-data' : null,
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'arrival-schedule-margin',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player assigns persistent Hesperus follow-up obligations so the rescue has consequences without becoming a new conspiracy thread.'
    };
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.command-network-certificate-issue',
        'ship.combined-load-risk',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'arrival-schedule-margin',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player resolves the combined-load test by balancing technical debt, schedule margin, Kieran flight profile, and honest readiness reporting.'
    };
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'ship.command-network-certificate-issue',
        'ship.combined-load-risk',
        'chapter-1.relief-convoy-distress-packet',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'arrival-schedule-margin',
        'crew-integration-strain',
        'technical-debt-pressure',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player completes the final command review by setting the arrival posture and carrying committed Prelude consequences toward Chapter 1.'
    };
  }

  if (intentParse.primaryIntent === 'request-chapter-1-counsel') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.relief-convoy-distress-packet',
        'chapter-1.convoy-powered-silent',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.rescue-window',
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player requests compact officer counsel before committing the first Relief Convoy Twelve response posture.'
    };
  }

  if (intentParse.primaryIntent === 'set-initial-convoy-posture') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.relief-convoy-distress-packet',
        'chapter-1.convoy-powered-silent',
        'chapter-1.quarantine-code-routing-mismatch',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.rescue-window',
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player commits the first Chapter 1 command posture by balancing rescue speed, authentication, quarantine posture, security exposure, and evidence custody.'
    };
  }

  if (intentParse.primaryIntent === 'set-first-boarding-threshold') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.relief-convoy-distress-packet',
        'chapter-1.convoy-powered-silent',
        'chapter-1.quarantine-code-routing-mismatch',
        'chapter-1.no-biosignature-at-range',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.rescue-window',
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player commits the first Chapter 1 boarding or rescue-contact threshold by balancing rescue delay, quarantine, security, and evidence custody.'
    };
  }

  if (intentParse.primaryIntent === 'execute-first-contact-response') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.relief-convoy-distress-packet',
        'chapter-1.convoy-powered-silent',
        'chapter-1.quarantine-code-routing-mismatch',
        'chapter-1.no-biosignature-at-range',
        'chapter-1.faraday-ivers-routing-annotation',
        'chapter-1.parnell-trapped-worker',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.rescue-window',
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player executes the first Chapter 1 contact route by assigning rescue, quarantine, security, and evidence work after the boarding threshold.'
    };
  }

  if (intentParse.primaryIntent === 'frame-offsite-custody-cargo-leads') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.faraday-ivers-routing-annotation',
        'chapter-1.parnell-trapped-worker',
        'chapter-1.ilyon-shelter-evacuees',
        'chapter-1.pell-custody-claim',
        'chapter-1.secured-recycling-module-missing',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.rescue-window',
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player frames the offsite shelter, custody, and missing-cargo leads produced by first contact.'
    };
  }

  if (intentParse.primaryIntent === 'set-pell-contact-terms') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.ilyon-shelter-evacuees',
        'chapter-1.pell-custody-claim',
        'chapter-1.secured-recycling-module-missing',
        'chapter-1.pell-separate-warning',
        'chapter-1.emergency-transponder-hardware-manifest',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.rescue-window',
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player sets Pell contact terms for the custody dispute, Ivers release route, and missing-cargo recovery route.'
    };
  }

  if (intentParse.primaryIntent === 'execute-joint-inspection-release') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.pell-separate-warning',
        'chapter-1.emergency-transponder-hardware-manifest',
        'chapter-1.ivers-supervised-statement',
        'chapter-1.joint-inspection-record-opened',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.rescue-window',
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player executes the joint inspection, supervised Ivers release route, and missing-cargo evidence chain.'
    };
  }

  if (intentParse.primaryIntent === 'trace-cargo-diagnostic-pulse') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.joint-inspection-record-opened',
        'chapter-1.emergency-transponder-hardware-manifest',
        'chapter-1.missing-hardware-diagnostic-pulse',
        'chapter-1.cargo-recovery-locus-preserved',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player traces the missing cargo diagnostic pulse and preserves the recovery locus under joint inspection.'
    };
  }

  if (intentParse.primaryIntent === 'recover-hardware-under-seal') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.missing-hardware-diagnostic-pulse',
        'chapter-1.cargo-recovery-locus-preserved',
        'chapter-1.emergency-hardware-recovered-under-seal',
        'chapter-1.recovery-timing-trace-preserved',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player recovers the missing emergency hardware under seal and preserves the recovery trace.'
    };
  }

  if (intentParse.primaryIntent === 'set-chapter1-resolution-terms') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.emergency-hardware-recovered-under-seal',
        'chapter-1.recovery-timing-trace-preserved',
        'chapter-1.joint-incident-record-created',
        'chapter-1.cooperative-resolution-filed',
        'chapter-1.starfleet-authentication-failure-acknowledged',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.rescue-window',
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player closes the immediate convoy crisis into a Chapter 1 resolution record.'
    };
  }

  if (intentParse.primaryIntent === 'transition-chapter1-to-false-colors') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-1.joint-incident-record-created',
        'chapter-1.asterion-arrival',
        'chapter-1.compact-patrol-false-colors-report',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-1.security-exposure',
        'chapter-1.evidence-volatility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player carries Chapter 1 closure into Asterion and receives the False Colors crisis report.'
    };
  }

  if (intentParse.primaryIntent === 'set-false-colors-transparency-terms') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-2.aegis-two-attack-report',
        'chapter-2.false-breckenridge-signature',
        'chapter-2.breckenridge-convoy-alibi',
        'chapter-2.aegis-two-casualties',
        'chapter-2.transparency-terms-framed',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-2.public-anger',
        'chapter-2.audit-fragility',
        'chapter-2.medical-risk',
        'chapter-2.security-access-risk',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player sets the first False Colors transparency terms for medical help, independent verification, alibi proof, Compact access, and tactical secrecy.'
    };
  }

  if (intentParse.primaryIntent === 'establish-orison-evidence-baseline') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-2.transparency-terms-framed',
        'chapter-2.orison-sensor-baseline-preserved',
        'chapter-2.breckenridge-calibration-mismatch',
        'chapter-2.attack-track-reconstruction-opened',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-2.public-anger',
        'chapter-2.audit-fragility',
        'chapter-2.security-access-risk',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player preserves the Orison evidence baseline and opens an independent alibi route without revealing the attacker source.'
    };
  }

  if (intentParse.primaryIntent === 'stabilize-aegis-medical-trust') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-2.aegis-two-medical-channel-opened',
        'chapter-2.critical-officer-stabilized',
        'chapter-2.patrol-officer-testimony-preserved',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-2.medical-risk',
        'chapter-2.public-anger',
        'chapter-2.audit-fragility',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player stabilizes Aegis Two care and preserves voluntary testimony without making treatment coercive.'
    };
  }

  if (intentParse.primaryIntent === 'set-security-access-demonstration') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-2.command-auth-annex-defined',
        'chapter-2.bronn-security-demonstration-recorded',
        'chapter-2.kessler-access-alternative-framed',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-2.security-access-risk',
        'chapter-2.audit-fragility',
        'chapter-2.public-anger',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player contains the command-system access dispute through a controlled proof path without surrendering command-authentication architecture.'
    };
  }

  if (intentParse.primaryIntent === 'frame-joint-investigation-charter') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: unique([
        'chapter-2.kessler-joint-legitimacy-statement',
        'chapter-2.holt-interference-restricted',
        'chapter-2.weak-hecate-trace-preserved',
        'chapter-2.open-orders-reach-presence-authorized',
        ...pressureFocus.usedFactIds
      ]),
      usedClockIds: unique([
        'chapter-2.public-anger',
        'chapter-2.audit-fragility',
        'chapter-2.security-access-risk',
        ...pressureFocus.usedClockIds
      ]),
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player converts the first False Colors crisis into a joint investigation charter, preserves a weak Hecate lead, and opens the temporary Open Orders posture.'
    };
  }

  if (intentParse.primaryIntent === 'command-conduct-misconduct') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: pressureFocus.usedFactIds,
      usedClockIds: pressureFocus.usedClockIds,
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: [],
      focusBudget: pressureFocus.focusBudget,
      responseSummary: commandConductRemovalRequired(intentParse.signals || {}, campaignState)
        ? 'The player conduct crosses into command-removal pressure. Captain, medical, security, and crew authority interrupt ordinary command.'
        : 'The player creates a command-conduct incident. Captain, medical, security, and crew authority respond without surrendering NPC agency.'
    };
  }

  if (intentParse.primaryIntent === 'terminal-catastrophic-command') {
    return {
      usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
      usedFactIds: pressureFocus.usedFactIds,
      usedClockIds: pressureFocus.usedClockIds,
      usedPressureIds: pressureFocus.selectedPressureIds,
      primaryPressureIds: pressureFocus.primaryPressureIds,
      secondaryPressureIds: pressureFocus.secondaryPressureIds,
      commandDecisionCandidates: [],
      focusBudget: pressureFocus.focusBudget,
      responseSummary: 'The player commits a catastrophic command path that must resolve into an authored campaign end-condition checkpoint.'
    };
  }

  return {
    usedDecisionPointIds: pressureFocus.usedDecisionPointIds,
    usedFactIds: pressureFocus.usedFactIds,
    usedClockIds: pressureFocus.usedClockIds,
    usedPressureIds: pressureFocus.selectedPressureIds,
    primaryPressureIds: pressureFocus.primaryPressureIds,
    secondaryPressureIds: pressureFocus.secondaryPressureIds,
    commandDecisionCandidates: pressureFocus.commandDecisionCandidates,
    focusBudget: pressureFocus.focusBudget,
    responseSummary: 'The Director selected currently ready mission structure and pressure for adjudication.'
  };
}

function buildNarratorPacket({ graphIndex, retrievalRun, sceneSnapshot, outcomePacket, intentParse }) {
  const visibleFactIds = unique([
    ...(sceneSnapshot?.knownFactIds || []),
    ...(outcomePacket.revealedFactIds || [])
  ]).filter((factId) => graphIndex.facts.get(factId)?.visibility !== 'directorOnly');

  const constraints = [
    'Do not reveal hidden campaign conspiracy information.',
    'Do not expose raw relationship values or hidden clock values.'
  ];

  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    constraints.push(
      'Narrate the Breckenridge as a working ship already underway, not a ceremonial reception.',
      'Show first impressions through routine, handoff, and professional attention rather than hidden scores.'
    );
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    constraints.push(
      'Keep Whitaker measured and concise; do not make her solve the XO role for the player.',
      'Treat any stated value as future-facing continuity, not a morality score.'
    );
  }

  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    constraints.push(
      'Narrate the outcome as success with cost, not total victory.',
      'Show that the Hesperus issue is ordinary fraud and maintenance pressure, not sabotage.'
    );
  }

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    constraints.push(
      'Narrate the senior staff conference as disciplined prioritization, not a full consensus scene.',
      'Let one or two officers speak from department constraints; do not give every officer equal debate time.',
      'Show that an accepted risk remains tracked rather than magically solved.'
    );
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    constraints.push(
      'Narrate the fallback-command drill as a procedural stress test, not a combat emergency.',
      'Show Bronn testing failure conditions without making him a rival for command.',
      'Keep the command-network certificate issue technical and contained unless state later escalates it.'
    );
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    constraints.push(
      'Narrate focused operational contact, not a social montage or biography tour.',
      'Show only the officers directly relevant to the player action.',
      'End with a sense that the next mission pressure can interrupt routine.'
    );
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    constraints.push(
      'Narrate aftermath work as operational continuity, not a new crisis.',
      'Do not imply the Hesperus failure is connected to Pale Lantern or sabotage.',
      'Only mention escape-pod subspace data if it is in allowed facts.'
    );
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    constraints.push(
      'Narrate the combined-load fault as ordinary technical causality, not sabotage.',
      'Show whether command owns the limitation; do not make a clean pass if the outcome records a limitation.',
      'Keep Kieran flight-profile execution bounded by the committed result.'
    );
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    constraints.push(
      'Narrate Whitaker as testing the XO readiness posture, not handing out a score.',
      'Summarize only committed Prelude consequences; do not invent hidden main-campaign answers.',
      'Reveal the Relief Convoy Twelve distress packet as a transition pressure, not as solved information.'
    );
  }

  if (intentParse.primaryIntent === 'request-chapter-1-counsel') {
    constraints.push(
      'Narrate officers giving compact professional counsel, not a labeled solution menu.',
      'Keep the response decision open until the player commits a posture.',
      'Do not reveal director-only signal sources or concealed-actor facts.'
    );
  }

  if (intentParse.primaryIntent === 'set-initial-convoy-posture') {
    constraints.push(
      'Narrate the first convoy response as command execution under uncertainty.',
      'Do not reveal director-only campaign causes, concealed actors, hidden signal sources, or undiscovered cargo truths.',
      'Show routine professional actions as already underway without turning them into a protocol quiz.'
    );
  }

  if (intentParse.primaryIntent === 'set-first-boarding-threshold') {
    constraints.push(
      'Narrate first contact as a threshold decision, not as a solved boarding scene.',
      'Show only player-facing evidence such as routing mismatch and no confirmed biosignature at range.',
      'Do not reveal director-only actors, unrevealed medical conclusions, unrevealed signal sources, or undiscovered cargo truths.'
    );
  }

  if (intentParse.primaryIntent === 'execute-first-contact-response') {
    constraints.push(
      'Narrate first contact as operational execution after the threshold, not as a new posture debate.',
      'Show only player-facing discoveries such as the Faraday Bell routing annotation and Parnell rescue pressure when allowed by facts.',
      'Do not reveal director-only causes, concealed actors, concealed vessels, detainees, missing-cargo truths, or unrevealed medical conclusions.'
    );
  }

  if (intentParse.primaryIntent === 'frame-offsite-custody-cargo-leads') {
    constraints.push(
      'Narrate this as discovery framing after first contact, not as resolution of the custody dispute or cargo recovery.',
      'Show only allowed player-facing shelter, custody, and missing-cargo facts.',
      'Do not reveal unrevealed signal-source causes, unrevealed medical conclusions, or the contents and later use of the missing cargo.'
    );
  }

  if (intentParse.primaryIntent === 'set-pell-contact-terms') {
    constraints.push(
      'Narrate Pell contact as terms being opened, not as completed release or cargo recovery.',
      'Show only allowed player-facing warning and cargo-manifest facts.',
      'Do not reveal the deeper false-order architecture, unrevealed medical conclusions, or later use of the recovered hardware.'
    );
  }

  if (intentParse.primaryIntent === 'execute-joint-inspection-release') {
    constraints.push(
      'Narrate this as joint inspection execution and supervised witness release, not as final Chapter 1 resolution.',
      'Show only allowed player-facing Ivers and shared-record facts.',
      'Do not reveal the deeper false-order architecture, unrevealed medical conclusions, concealed vessels, or later use of the missing hardware.'
    );
  }

  if (intentParse.primaryIntent === 'trace-cargo-diagnostic-pulse') {
    constraints.push(
      'Narrate this as cargo-signal tracing and recovery-locus preservation, not as completed hardware recovery.',
      'Show only allowed player-facing cargo pulse and joint recovery-locus facts.',
      'Do not reveal the deeper false-order architecture, unrevealed medical conclusions, the later use of the hardware, or concealed vessel names.'
    );
  }

  if (intentParse.primaryIntent === 'recover-hardware-under-seal') {
    constraints.push(
      'Narrate this as emergency hardware recovery under evidence seal, not as final Chapter 1 resolution.',
      'Show only allowed player-facing recovery and timing-trace facts.',
      'Do not reveal the deeper false-order architecture, unrevealed medical conclusions, the later use of the hardware, or concealed vessel names.'
    );
  }

  if (intentParse.primaryIntent === 'set-chapter1-resolution-terms') {
    constraints.push(
      'Narrate this as Chapter 1 crisis closure and consequence recording, not as the final campaign answer.',
      'Show only allowed player-facing resolution, witness, access, authentication-accountability, and rescue follow-up facts.',
      'Do not reveal the deeper false-order architecture, unrevealed medical conclusions, the later use of the hardware, or concealed vessel names.'
    );
  }

  if (intentParse.primaryIntent === 'transition-chapter1-to-false-colors') {
    constraints.push(
      'Narrate this as the transition from Chapter 1 into the next crisis report.',
      'Show only Asterion arrival, the carried-forward joint record, and the Compact patrol report.',
      'Do not reveal who staged the impersonation, why it happened, unrevealed medical conclusions, the later use of the hardware, or concealed vessel names.'
    );
  }

  if (intentParse.primaryIntent === 'set-false-colors-transparency-terms') {
    constraints.push(
      'Narrate this as the first False Colors transparency briefing, not as final proof or final attribution.',
      'Show only player-facing attack, signature, alibi, casualty, medical, audit, access, and tactical-boundary facts.',
      'Do not reveal the attacking craft, staged-attack cell, hidden faction involvement, unrevealed identity-hardware use, or any later source of the impersonation.'
    );
  }

  if (intentParse.primaryIntent === 'establish-orison-evidence-baseline') {
    constraints.push(
      'Narrate this as evidence-baseline preservation after the first transparency terms, not as final proof or final attribution.',
      'Show only player-facing Orison baseline, calibration mismatch, selected-log, audit-chain, and route-reconstruction facts.',
      'Do not reveal the attacking craft type, control route, hidden faction involvement, local insider source, or any later source of the impersonation.'
    );
  }

  if (intentParse.primaryIntent === 'stabilize-aegis-medical-trust') {
    constraints.push(
      'Narrate this as Aegis Two medical trust and voluntary testimony, not final attribution.',
      'Show only player-facing medical-channel, stabilization, consent, medical-neutrality, and testimony facts.',
      'Do not reveal the attacking craft type, control route, hidden faction involvement, local insider source, or later impersonation source.'
    );
  }

  if (intentParse.primaryIntent === 'set-security-access-demonstration') {
    constraints.push(
      'Narrate this as a Breckenridge command-system access demonstration, not final attribution.',
      'Show only player-facing access-boundary, command-authentication demonstration, Bronn professional-role, Kessler alternative, and disclosure-limit facts.',
      'Do not reveal the attacking craft type, control route, hidden faction involvement, local insider source, or later impersonation source.'
    );
  }

  if (intentParse.primaryIntent === 'frame-joint-investigation-charter') {
    constraints.push(
      'Narrate this as a joint investigation charter and Open Orders transition, not final attribution.',
      'Show only player-facing Kessler charter, interference restriction, weak Hecate lead, and Open Orders transition facts.',
      'Do not reveal the attacking craft type, hidden faction involvement, local insider source, or final impersonation source.'
    );
  }

  if (intentParse.primaryIntent === 'command-conduct-misconduct') {
    constraints.push(
      'Narrate the player conduct as attempted behavior with consequences, not guaranteed compliance by NPCs.',
      'Keep Captain Whitaker, medical, security, and bridge officers in their own authority lanes.',
      'Show visible discipline, fitness-for-duty, refusal, relief, or confinement consequences without exposing hidden End Condition predicates.'
    );
  }

  return {
    sourceOutcomeId: outcomePacket.id,
    allowedFactIds: visibleFactIds,
    allowedCardIds: retrievalRun?.packets?.narrator?.cardIds || [],
    constraints,
    rawHiddenValuesExposed: false,
    directorOnlyDataIncluded: false
  };
}

function buildCommandLogPacket({ outcomePacket, intentParse, campaignState = {} }) {
  if (intentParse.primaryIntent === 'command-conduct-misconduct') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: commandConductLogSummaryInputs(intentParse.signals || {}, campaignState),
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'establish-arrival-tone') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player boarded the Breckenridge during a working transfer rather than a ceremonial reception.',
        'The player established an initial command tone around existing routines and the acting-XO handoff.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'complete-ready-room-handover') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player completed the private command handoff with Captain Whitaker and Bronn.',
        'The exchange established initial expectations for executive authority and personal command values.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'resolve-hesperus-with-accountability') {
    const commandProgressionConsequences = (outcomePacket.commandDecisionAwards || []).length > 0
      ? ['Resolve progression earned.']
      : ['No additional command progression earned.'];
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player transferred vulnerable passengers first.',
        'The player preserved the falsified inspection record.',
        'The player imposed formal inquiry obligations on the Hesperus owner.',
        'The Breckenridge accepted a minor delay and limited the repair to impulse-safe stabilization.'
      ],
      visibleConsequences: [
        ...commandProgressionConsequences,
        'Minor arrival delay accepted.',
        'Hesperus passengers protected.',
        'Inspection fraud preserved for formal follow-up.'
      ]
    };
  }

  if (intentParse.primaryIntent === 'set-readiness-priorities') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player set senior staff readiness priorities for the remaining transit.',
        'The player named department ownership for follow-up work.',
        'The player carried at least one readiness risk forward explicitly instead of hiding it.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'set-fallback-command-procedure') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The fallback-command drill exposed incompatible emergency habits.',
        'The command-network certificate issue was identified as a real technical limitation.',
        'The player set a command-continuity policy and assigned or deferred remediation with explicit ownership.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'establish-command-rhythm') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player used transit time to establish command rhythm with senior staff.',
        'The player created expectations for how concerns, dissent, and follow-up should reach the XO.',
        'The routine command pattern will be tested by the next mission pressure.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'assign-hesperus-aftermath') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player assigned Hesperus aftermath follow-up work.',
        'The Hesperus consequences remain ordinary rescue, repair, medical, and administrative obligations.',
        'The ship can resume the Prelude shakedown path with those obligations recorded.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'resolve-combined-load-test') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player resolved the combined-load test readiness question.',
        'The decision recorded how technical debt, schedule margin, and Kieran flight-profile risk were handled.',
        'The final command review must account for the committed test status.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'complete-final-command-review') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player completed the final command review with Captain Whitaker.',
        'The review summarized committed Prelude readiness, delay, relationship, and command-culture consequences.',
        'The Breckenridge received the Relief Convoy Twelve distress packet before formal Asterion reception.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'request-chapter-1-counsel') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player requested officer counsel before committing the first Relief Convoy Twelve response posture.',
        'Counsel informed the command decision without resolving it for the player.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'set-initial-convoy-posture') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player set the first response posture for Relief Convoy Twelve.',
        'The order balanced rescue speed, authentication, quarantine posture, security exposure, and evidence custody according to the player method.',
        'Routine distress response actions were handled as professional execution rather than a protocol quiz.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'set-first-boarding-threshold') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player set the first Relief Convoy Twelve boarding or rescue-contact threshold.',
        'The order balanced rescue delay, quarantine posture, security exposure, and evidence custody according to the player method.',
        'The first contact threshold now carries committed consequences into the next Chapter 1 frame.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'execute-first-contact-response') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player executed the first Relief Convoy Twelve contact route after committing the boarding threshold.',
        'The order assigned rescue, quarantine, security, and evidence work according to the player method.',
        'The first operational contact revealed only player-safe convoy facts and carried unresolved Chapter 1 pressures forward.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'frame-offsite-custody-cargo-leads') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player framed the next Relief Convoy Twelve leads after first contact.',
        'The order assigned shelter triage, custody response, and missing-cargo evidence work according to the player method.',
        'The discovery beat revealed only player-facing shelter, custody, and missing-cargo facts while deeper causes remain unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'set-pell-contact-terms') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player set first contact terms for Pell, Ivers, and the missing secured cargo.',
        'The order framed release posture, joint inspection or lawful pressure, and cargo recovery according to the player method.',
        'The contact beat revealed only player-facing warning and manifest facts while release, recovery, and deeper causes remain unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'execute-joint-inspection-release') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player executed the opened joint inspection route after Pell contact terms.',
        'The order handled Ivers supervised release, Pell lawful exit, shared inspection records, and cargo evidence custody according to the player method.',
        'The execution beat revealed only player-facing Ivers and shared-record facts while final cargo recovery and deeper causes remain unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'trace-cargo-diagnostic-pulse') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player traced the missing cargo diagnostic pulse under the joint inspection route.',
        'The order handled signal tracing, joint custody, Pell cooperation, and cargo evidence according to the player method.',
        'The cargo beat revealed only player-facing signal and recovery-locus facts while final recovery and deeper causes remain unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'recover-hardware-under-seal') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player recovered or contested the missing emergency hardware under the joint inspection route.',
        'The order handled evidence seal, recovery telemetry, Pell cooperation, final custody deferral, and security posture according to the player method.',
        'The recovery beat revealed only player-facing recovery and timing-trace facts while final attribution and later implications remain unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'set-chapter1-resolution-terms') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player set Chapter 1 resolution terms for the immediate convoy crisis.',
        'The order handled the joint incident record, Ivers trust, Pell witness status, Compact access, authentication accountability, and Parnell rescue follow-up according to the player method.',
        'The resolution beat revealed only player-facing closure facts while final attribution and later implications remain unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'transition-chapter1-to-false-colors') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player carried the Chapter 1 closing record into Asterion arrival.',
        'The order handled record handoff, authority notification, Compact patrol report intake, and non-hostile posture according to the player method.',
        'The transition revealed only player-facing Asterion arrival and false-colors report facts while the source of the impersonation remains unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'set-false-colors-transparency-terms') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player set the first Chapter 2 False Colors transparency terms.',
        'The order handled medical help, independent verification, alibi proof, Compact access scope, and tactical secrecy boundaries according to the player method.',
        'The briefing revealed only player-facing accusation, casualty, alibi, and transparency facts while the source of the impersonation remains unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'establish-orison-evidence-baseline') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player preserved the first Orison evidence baseline for Chapter 2.',
        'The order handled independent sensors, audit chain, Breckenridge calibration evidence, route reconstruction, selected disclosure, and tactical secrecy boundaries according to the player method.',
        'The evidence beat revealed only player-facing baseline and alibi facts while the attacker source remains unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'stabilize-aegis-medical-trust') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player handled Aegis Two medical trust for Chapter 2.',
        'The order handled critical care, Compact-observable medical trust, patient consent, voluntary testimony, and medical neutrality according to the player method.',
        'The medical beat revealed only player-facing care and testimony facts while the attacker source remains unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'set-security-access-demonstration') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player handled the Chapter 2 command-system access dispute.',
        'The order handled controlled command-authentication proof, Bronn professional security demonstration, Kessler-facing access alternatives, and Tolland disclosure limits according to the player method.',
        'The security beat revealed only player-facing access-boundary and demonstration facts while the attacker source remains unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  if (intentParse.primaryIntent === 'frame-joint-investigation-charter') {
    return {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [
        'The player handled the Chapter 2 joint investigation charter.',
        'The order handled Kessler public legitimacy, audit-record protection, Holt interference limits, weak Hecate trace preservation, and the Open Orders transition according to the player method.',
        'The closeout revealed only player-facing charter and weak-lead facts while final attribution remains unresolved.'
      ],
      visibleConsequences: outcomePacket.costs || []
    };
  }

  return {
    sourceOutcomeId: outcomePacket.id,
    summaryInputs: [outcomePacket.summary],
    visibleConsequences: outcomePacket.costs || []
  };
}

function buildNoCommittedOutcomeTurnPacket({ input, sceneSnapshot, intentParse, arbiterPlan = null, reason }) {
  const outcomePacket = {
    id: `outcome.${String(input.turnId || 'turn').replace(/^turn\./, '')}`,
    resultBand: 'No Change',
    summary: 'No durable mission outcome was committed because the turn requires Utility Arbiter approval.',
    costs: [],
    revealedFactIds: [],
    commandDecisionAwards: [],
    noCommitReason: reason
  };
  return {
    contractVersion: 1,
    turnId: input.turnId,
    graphPath: input.graphPath,
    projectionPath: input.projectionPath,
    sceneSnapshot,
    intentParse,
    actionClassification: { category: 'noDurableOutcome', reason },
    authorityCapabilityCheck: { result: 'notEvaluated', reason },
    pressureFocus: null,
    directorResponse: null,
    outcomePacket,
    stateDelta: {},
    directorPackets: {},
    narratorPacket: {
      sourceOutcomeId: outcomePacket.id,
      summary: outcomePacket.summary,
      constraints: ['Do not narrate a durable state change.']
    },
    commandLogPacket: {
      sourceOutcomeId: outcomePacket.id,
      summaryInputs: [outcomePacket.summary],
      visibleConsequences: []
    },
    ...(arbiterPlan ? { arbiterPlan: cloneJson(arbiterPlan) } : {})
  };
}

export function runMissionDirectorTurn(input) {
  const graph = cloneJson(input.graph);
  const projection = cloneJson(input.projection);
  const crewDataset = cloneJson(input.crewDataset || {});
  const shipDataset = cloneJson(input.shipDataset || {});
  const sceneSnapshot = cloneJson(input.sceneSnapshot);
  const campaignState = cloneJson(input.campaignState || projection.initialState || {});
  const arbiterPlan = input.arbiterPlan ? cloneJson(input.arbiterPlan) : null;
  const graphIndex = indexMissionGraph(graph);

  const intentParse = parseIntent(sceneSnapshot);
  const arbiterApprovedOutcome = arbiterPlan?.route === 'directiveOutcome'
    && arbiterPlan?.statePlan?.commitOutcome === true;
  if (!arbiterApprovedOutcome && ([
    'establish-arrival-tone',
    'complete-ready-room-handover',
    'set-readiness-priorities',
    'establish-command-rhythm'
  ].includes(intentParse.primaryIntent)
    || (sceneSnapshot.activePhaseId === 'ready-room-handover' && intentParse.primaryIntent === 'no-action'))) {
    return buildNoCommittedOutcomeTurnPacket({
      input,
      sceneSnapshot,
      intentParse,
      arbiterPlan,
      reason: 'arbiter-required-for-broad-phase-outcome'
    });
  }
  const competencePolicy = missionCompetencePolicy(input, graph);
  const competencePacket = competencePolicy
    ? planCommandCompetence({
      policy: competencePolicy,
      sceneSnapshot,
      campaignState,
      sourceTurnId: input.turnId
    })
    : null;
  const actionClassification = classifyAction({ graphIndex, sceneSnapshot, intentParse });
  const authorityCapabilityCheck = checkAuthorityAndCapability({ actionClassification, intentParse, sceneSnapshot, campaignState });
  const pressureFocus = selectPressureFocus({ graph, graphIndex, sceneSnapshot, intentParse, campaignState });
  const directorResponse = buildDirectorResponse({ pressureFocus, intentParse, campaignState });
  const baseOutcomePacket = resolveAction({
    turnId: input.turnId,
    intentParse,
    actionClassification,
    authorityCapabilityCheck,
    pressureFocus,
    campaignState
  });
  const outcomePacket = applySimulationModePolicyToOutcome({
    outcomePacket: baseOutcomePacket,
    campaignState,
    sceneSnapshot,
    intentParse
  });
  const retrievalRun = runDirectorRetrieval({
    crewDataset,
    shipDataset,
    missionGraph: graph,
    sceneSnapshot,
    campaignState,
    intentParse,
    turnId: input.turnId,
    outcomeId: outcomePacket.id,
    coreRecallEntries: input.coreRecallEntries || []
  });
  const phaseAdvance = evaluatePhaseAdvance({ graph, sceneSnapshot, intentParse, outcomePacket });
  const stateDelta = buildStateDelta({ graphIndex, campaignState, outcomePacket, intentParse, authorityCapabilityCheck, phaseAdvance });
  const narratorPacket = buildNarratorPacket({ graphIndex, retrievalRun, sceneSnapshot, outcomePacket, intentParse });
  narratorPacket.constraints = unique([
    ...(narratorPacket.constraints || []),
    ...simulationModeNarratorConstraints({ campaignState, sceneSnapshot })
  ]);
  const commandLogPacket = buildCommandLogPacket({ outcomePacket, intentParse, campaignState });

  const turnPacket = {
    contractVersion: 1,
    turnId: input.turnId,
    graphPath: input.graphPath,
    projectionPath: input.projectionPath,
    sceneSnapshot,
    intentParse,
    ...(competencePacket ? { competencePacket } : {}),
    actionClassification,
    authorityCapabilityCheck,
    directorResponse,
    outcomePacket,
    stateDelta,
    directorPackets: cloneJson(retrievalRun?.packets || {}),
    narratorPacket,
    commandLogPacket,
    ...(arbiterPlan ? { arbiterPlan } : {}),
    provenance: input.continuityDirectorPacket ? {
      continuityProjection: {
        kind: 'directive.continuityDirectorPacketReceived.v1',
        audience: input.continuityDirectorPacket.audience || null,
        sourceHash: input.continuityDirectorPacket.sourceHash || null,
        hash: input.continuityDirectorPacket.hash || null,
        selectedFactCount: Array.isArray(input.continuityDirectorPacket.facts) ? input.continuityDirectorPacket.facts.length : 0
      }
    } : undefined
  };

  const validation = validateDirectorTurn({ graphIndex, turnPacket });
  if (!validation.ok) {
    throw new Error(`Generated Mission Director turn failed validation:\n${validation.errors.map((error) => `- ${error}`).join('\n')}`);
  }

  return turnPacket;
}
