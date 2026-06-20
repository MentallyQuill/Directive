import { normalizePressureRecord } from './pressure-ledger.mjs';

function outcomeFlagValue(campaignState, flagId, fallback = null) {
  return (campaignState?.mission?.outcomeFlags || []).find((flag) => flag.id === flagId)?.value ?? fallback;
}

function includesAny(value, fragments) {
  const text = String(value || '');
  return fragments.some((fragment) => text.includes(fragment));
}

function sourceFields({ campaignState, outcomePacket, intentParse }) {
  return {
    sourceOutcomeId: outcomePacket?.id || null,
    sourceTurnId: null,
    sourceMissionId: campaignState?.mission?.activeMissionId || null,
    sourcePhaseId: campaignState?.mission?.activePhaseId || campaignState?.mission?.phase || null,
    lastUpdatedByOutcomeId: outcomePacket?.id || null,
    history: [{
      type: 'seeded',
      sourceOutcomeId: outcomePacket?.id || null,
      intent: intentParse?.primaryIntent || null
    }]
  };
}

function preludePressureSeeds({ campaignState, outcomePacket, intentParse }) {
  const source = sourceFields({ campaignState, outcomePacket, intentParse });
  const seeds = [];
  const shipState = outcomeFlagValue(campaignState, 'prelude.ship-state', 'untested-limitations-remain');
  const bronnState = outcomeFlagValue(campaignState, 'prelude.bronn', 'unsettled');
  const priyaState = outcomeFlagValue(campaignState, 'prelude.priya', 'unsettled');
  const hesperusState = outcomeFlagValue(campaignState, 'prelude.hesperus-resolution', 'unresolved');

  if (includesAny(shipState, ['limitation', 'incomplete', 'workaround', 'untested', 'concealed-risk'])) {
    seeds.push({
      id: 'pressure.ship.imani-technical-debt',
      type: 'ship',
      title: 'Engineering Repair Debt',
      playerSummary: 'Imani still has unresolved Breckinridge technical debt to make visible before it becomes routine.',
      directorSummary: `Prelude ship-state "${shipState}" creates engineering follow-up pressure.`,
      urgencyBand: shipState === 'technically-passed-through-concealed-risk' ? 'high' : 'medium',
      escalationBand: 'signal',
      linkedCrewIds: ['imani-cross'],
      linkedSystemIds: ['command-network', 'combined-load-systems'],
      linkedFactIds: ['ship.command-network-certificate-issue', 'ship.combined-load-risk'],
      linkedChapterIds: ['open-orders-1-work-worth-doing'],
      linkedTemplateIds: ['side-the-long-repair'],
      tags: ['engineering', 'technical-debt', 'repair', 'open-orders-1'],
      ...source
    });
  }

  if (!['acting-service-respected', 'failure-conditions-used-well'].includes(bronnState)) {
    seeds.push({
      id: 'pressure.crew.bronn-fallback-command',
      type: 'crew',
      title: 'Fallback Command Concern',
      playerSummary: 'Bronn has not fully seen how fallback command authority should behave under stress.',
      directorSummary: `Prelude Bronn state "${bronnState}" leaves fallback-command pressure active.`,
      urgencyBand: 'medium',
      escalationBand: 'signal',
      linkedCrewIds: ['hadrik-bronn'],
      linkedSystemIds: ['command-survivability'],
      linkedChapterIds: ['open-orders-1-work-worth-doing'],
      linkedTemplateIds: ['side-borrowed-wings'],
      tags: ['security', 'fallback-command', 'crew-development', 'open-orders-1'],
      ...source
    });
  }

  if (!['delegation-boundaries-clear'].includes(priyaState)) {
    seeds.push({
      id: 'pressure.crew.priya-coordination-network',
      type: 'crew',
      title: 'Coordination Strain',
      playerSummary: 'Priya still needs clearer channels for routing obligations before they pile up unseen.',
      directorSummary: `Prelude Priya state "${priyaState}" creates operations coordination pressure.`,
      urgencyBand: 'medium',
      escalationBand: 'signal',
      linkedCrewIds: ['priya-nayar'],
      linkedSystemIds: ['operations-routing'],
      linkedChapterIds: ['open-orders-1-work-worth-doing'],
      linkedTemplateIds: ['side-quiet-channels'],
      tags: ['operations', 'coordination', 'relationships', 'open-orders-1'],
      ...source
    });
  }

  if (hesperusState !== 'unresolved') {
    seeds.push({
      id: 'pressure.obligation.hesperus-follow-up',
      type: 'obligation',
      title: 'Hesperus Follow-Up',
      playerSummary: 'The Hesperus rescue left follow-up work that should be honored instead of forgotten after arrival.',
      directorSummary: `Prelude Hesperus resolution "${hesperusState}" carries ordinary rescue and accountability obligations.`,
      urgencyBand: 'low',
      escalationBand: 'latent',
      linkedCrewIds: ['priya-nayar', 'imani-cross', 'miriam-sato'],
      linkedSystemIds: ['administrative-follow-up'],
      tags: ['hesperus', 'obligation', 'follow-up'],
      ...source
    });
  }

  return seeds;
}

function chapter1PressureSeeds({ campaignState, outcomePacket, intentParse }) {
  const source = sourceFields({ campaignState, outcomePacket, intentParse });
  const signals = intentParse?.signals || {};
  const existingPressureIds = new Set((campaignState?.pressureLedger?.records || []).map((record) => record.id));
  const carriedPreludeSeeds = preludePressureSeeds({ campaignState, outcomePacket, intentParse })
    .filter((record) => !existingPressureIds.has(record.id))
    .map((record) => ({
      ...record,
      history: [
        ...record.history,
        {
          type: 'carried-into-chapter-1',
          reason: 'Unresolved Prelude consequence is available to the Chapter 1 response frame.'
        }
      ]
    }));
  const seeds = [...carriedPreludeSeeds];
  const posture = signals.escalatesWeapons
    ? 'weapons-escalation-blocked'
    : signals.bypassesQuarantine
      ? 'rescue-first-quarantine-risk'
      : signals.coordinatesWithAuthorities && !signals.closesOnConvoy
        ? 'diplomacy-coordination-first'
        : signals.preservesConvoyEvidence && !signals.closesOnConvoy && !signals.preparesRescue
          ? 'evidence-first-cautious'
          : signals.startsRemoteVerification && !signals.closesOnConvoy
            ? 'security-first-remote-recon'
            : signals.closesOnConvoy || signals.preparesRescue
              ? 'rescue-first-approach'
              : 'unclear-posture';

  seeds.push({
    id: 'pressure.regional.convoy-first-impression',
    type: 'regional',
    title: 'Convoy First Impression',
    playerSummary: `The first response to Relief Convoy Twelve now shapes how nearby authorities read the Breckinridge's priorities: ${posture}.`,
    directorSummary: `Chapter 1 initial posture committed as "${posture}".`,
    urgencyBand: signals.escalatesWeapons || signals.bypassesQuarantine ? 'high' : 'medium',
    escalationBand: signals.escalatesWeapons ? 'escalation' : 'signal',
    linkedCrewIds: ['mara-whitaker', 'priya-nayar'],
    linkedFactIds: ['chapter-1.relief-convoy-distress-packet', 'chapter-1.convoy-powered-silent'],
    linkedPhaseIds: ['convoy-approach', 'first-committed-response'],
    linkedDecisionPointIds: ['decision.first-boarding-threshold'],
    linkedChapterIds: ['open-orders-1-work-worth-doing'],
    linkedTemplateIds: ['side-quiet-channels'],
    tags: ['regional-trust', 'convoy', 'chapter-1'],
    ...source
  });

  if (signals.startsRemoteVerification && !signals.closesOnConvoy) {
    seeds.push({
      id: 'pressure.obligation.convoy-rescue-delay',
      type: 'obligation',
      title: 'Rescue Delay',
      playerSummary: 'Remote verification preserved safety and records, but possible survivors waited longer for contact.',
      directorSummary: 'Remote-first posture carries humanitarian follow-up pressure.',
      urgencyBand: 'high',
      escalationBand: 'signal',
      linkedCrewIds: ['miriam-sato', 'rowan-saye'],
      linkedFactIds: ['chapter-1.relief-convoy-distress-packet'],
      linkedPhaseIds: ['convoy-approach', 'first-committed-response'],
      linkedDecisionPointIds: ['decision.first-boarding-threshold'],
      tags: ['rescue', 'medical', 'humanitarian', 'chapter-1'],
      ...source
    });
  }

  if (signals.bypassesQuarantine) {
    seeds.push({
      id: 'pressure.obligation.quarantine-exception-review',
      type: 'obligation',
      title: 'Quarantine Exception Review',
      playerSummary: 'The quarantine exception has to be justified and contained after the immediate rescue order.',
      directorSummary: 'Accepted quarantine risk creates medical and command review pressure.',
      urgencyBand: 'high',
      escalationBand: 'escalation',
      linkedCrewIds: ['miriam-sato', 'mara-whitaker'],
      linkedFactIds: ['chapter-1.relief-convoy-distress-packet'],
      linkedPhaseIds: ['convoy-approach', 'first-committed-response'],
      linkedDecisionPointIds: ['decision.first-boarding-threshold'],
      tags: ['medical', 'quarantine', 'accepted-risk', 'chapter-1'],
      ...source
    });
  }

  if (signals.preservesConvoyEvidence || signals.startsRemoteVerification) {
    seeds.push({
      id: 'pressure.obligation.convoy-evidence-custody',
      type: 'obligation',
      title: 'Convoy Evidence Custody',
      playerSummary: 'The convoy response created an evidence chain that must be protected through the next contact.',
      directorSummary: 'Initial verification and evidence preservation created durable evidence-custody pressure.',
      urgencyBand: 'medium',
      escalationBand: 'signal',
      linkedCrewIds: ['imani-cross', 'rowan-saye', 'priya-nayar'],
      linkedFactIds: ['chapter-1.quarantine-code-routing-mismatch'],
      linkedPhaseIds: ['convoy-approach', 'first-committed-response'],
      linkedDecisionPointIds: ['decision.first-boarding-threshold'],
      tags: ['evidence', 'operations', 'science', 'chapter-1'],
      ...source
    });
  }

  return seeds;
}

function chapter2PressureSeeds({ campaignState, outcomePacket, intentParse }) {
  const source = sourceFields({ campaignState, outcomePacket, intentParse });
  const resultBand = String(outcomePacket?.resultBand || '').trim();
  if (!['Great Success', 'Success', 'Partial Success'].includes(resultBand)) {
    return [];
  }

  return [{
    id: 'pressure.regional.false-colors-quiet-channels',
    type: 'regional',
    title: 'False Colors Coordination Channels',
    playerSummary: 'Priya needs a calm, accountable coordination channel after the False Colors charter so Kessler, station operators, Compact observers, civilian couriers, and Breckinridge Ops can share records while the weak Hecate trace stays in a correlation queue, not a pursuit target.',
    directorSummary: 'The joint investigation charter creates Open Orders pressure for Priya to convert public legitimacy, audit-record protection, and temporary Breckinridge presence into accountable regional coordination while forensic specialists travel.',
    urgencyBand: 'medium',
    escalationBand: 'signal',
    linkedCrewIds: ['priya-nayar'],
    linkedSystemIds: ['operations-routing', 'audit-record-protection', 'regional-courier-channel'],
    linkedFactIds: [
      'chapter-2.kessler-joint-legitimacy-statement',
      'chapter-2.holt-interference-restricted',
      'chapter-2.weak-hecate-trace-preserved',
      'chapter-2.open-orders-reach-presence-authorized'
    ],
    linkedChapterIds: ['open-orders-1-work-worth-doing'],
    linkedTemplateIds: ['side-quiet-channels'],
    tags: ['regional-trust', 'coordination', 'operations', 'false-colors', 'open-orders-1'],
    ...source,
    history: [
      ...source.history,
      {
        type: 'carried-from-false-colors-charter',
        reason: 'The joint charter authorizes calm coordination while forensic specialists travel.'
      }
    ]
  }];
}

export function buildPressureLedgerDeltaForTurn({ campaignState, outcomePacket, intentParse }) {
  const primaryIntent = intentParse?.primaryIntent;
  const records = primaryIntent === 'complete-final-command-review'
    ? preludePressureSeeds({ campaignState, outcomePacket, intentParse })
    : primaryIntent === 'set-initial-convoy-posture'
      ? chapter1PressureSeeds({ campaignState, outcomePacket, intentParse })
      : primaryIntent === 'frame-joint-investigation-charter'
        ? chapter2PressureSeeds({ campaignState, outcomePacket, intentParse })
        : [];
  return {
    upsertRecords: records.map(normalizePressureRecord),
    rawValuesHidden: true
  };
}
