export const packageSpine = [
  'manifest',
  'ship',
  'crew',
  'characterCreation',
  'mainCampaign',
  'sideMissionRules',
  'missionTemplates',
  'guardrails',
  'promptInjection',
  'assets'
];

export const expectedRootRefs = {
  manifest: 'packages/manifest.schema.json',
  ship: 'packages/ship.schema.json',
  crew: 'packages/crew.schema.json',
  characterCreation: 'packages/character-creation.schema.json',
  mainCampaign: 'campaign/main-campaign.schema.json',
  sideMissionRules: 'packages/side-mission-rules.schema.json',
  missionTemplates: 'mission/mission-templates.schema.json',
  guardrails: 'packages/guardrails.schema.json',
  promptInjection: 'packages/prompt-injection.schema.json',
  assets: 'packages/assets.schema.json'
};

export const requiredSchemaFiles = [
  'schemas/common/common.schema.json',
  'schemas/packages/manifest.schema.json',
  'schemas/packages/ship.schema.json',
  'schemas/packages/crew.schema.json',
  'schemas/packages/character-creation.schema.json',
  'schemas/packages/director-card.schema.json',
  'schemas/packages/crew-dataset.schema.json',
  'schemas/campaign/main-campaign.schema.json',
  'schemas/packages/side-mission-rules.schema.json',
  'schemas/mission/mission-templates.schema.json',
  'schemas/mission/mission-graph.schema.json',
  'schemas/mission/mission-director-turn.schema.json',
  'schemas/packages/guardrails.schema.json',
  'schemas/packages/prompt-injection.schema.json',
  'schemas/packages/assets.schema.json',
  'schemas/campaign/campaign-state-projection.schema.json',
  'schemas/sidecars/state-delta-proposal.schema.json',
  'schemas/sidecars/command-log-summary.schema.json'
];

export const ashesRequiredCrewIds = [
  'mara-whitaker',
  'player-commander',
  'kieran-vale',
  'priya-nayar',
  'hadrik-bronn',
  'rowan-saye',
  'miriam-sato',
  'imani-cross'
];

export const ashesRequiredChapterIds = [
  'prelude-a-ship-underway',
  'chapter-1-the-empty-convoy',
  'chapter-2-false-colors',
  'open-orders-1-work-worth-doing',
  'chapter-3-dead-letters',
  'chapter-4-the-colony-that-stayed',
  'chapter-5-old-lessons',
  'open-orders-2-what-survives',
  'chapter-6-the-cost-of-knowing',
  'chapter-7-a-peace-of-their-own',
  'open-orders-3-before-the-lamps-go-out',
  'chapter-8-the-last-directive',
  'epilogue-the-terms-we-keep'
];

export const campaignProjectionStateDomains = [
  'campaign',
  'activeCampaignPackage',
  'player',
  'crew',
  'ship',
  'mission',
  'mainCampaign',
  'sideMissions',
  'pressureLedger',
  'actors',
  'fronts',
  'clocks',
  'relationships',
  'commandCulture',
  'commandStyle',
  'commandCompetence',
  'values',
  'directives',
  'canon',
  'campaignTracks',
  'campaignAssets',
  'turnLedger',
  'commandLog',
  'ui',
  'settings'
];

export const campaignProjectionHiddenDomains = [
  'relationships',
  'commandCulture',
  'campaignTracks',
  'pressureLedger',
  'actors',
  'fronts',
  'clocks'
];

export const preludeRequiredPhaseIds = [
  'shuttle-rendezvous',
  'ready-room-handover',
  'senior-readiness-conference',
  'fallback-command-drill',
  'command-rhythm-scenes',
  'hesperus-diversion',
  'hesperus-aftermath',
  'combined-load-test',
  'final-command-review',
  'arrival-at-reach'
];

export const preludeRequiredDecisionPointIds = [
  'decision.arrival-tone',
  'decision.handover-value',
  'decision.readiness-priorities',
  'decision.fallback-procedure',
  'decision.hesperus-response',
  'decision.inspection-fraud-accountability',
  'decision.combined-load-risk',
  'decision.final-readiness-report'
];

export const preludeRequiredOutcomeFlagIds = [
  'prelude.crew-integration',
  'prelude.whitaker',
  'prelude.kieran',
  'prelude.priya',
  'prelude.bronn',
  'prelude.rowan',
  'prelude.miriam',
  'prelude.imani',
  'prelude.ship-state',
  'prelude.hesperus-resolution',
  'prelude.arrival-delay',
  'prelude.command-decision-hesperus-fraud'
];

export const preludeRequiredPressureIds = [
  'pressure.hesperus-passenger-risk',
  'pressure.hesperus-inspection-fraud'
];

export const chapter1RequiredPhaseIds = [
  'initial-reception',
  'convoy-approach',
  'first-posture-decision',
  'first-committed-response',
  'convoy-contact-execution',
  'offsite-custody-cargo-leads',
  'pell-contact-terms',
  'joint-inspection-release-cargo',
  'cargo-diagnostic-pulse',
  'hardware-recovery-under-seal',
  'chapter-1-resolution-terms',
  'asterion-arrival-false-colors'
];

export const chapter1RequiredFactIds = [
  'chapter-1.relief-convoy-distress-packet',
  'chapter-1.convoy-powered-silent',
  'chapter-1.quarantine-code-routing-mismatch',
  'chapter-1.faraday-ivers-routing-annotation',
  'chapter-1.parnell-trapped-worker',
  'chapter-1.ilyon-shelter-evacuees',
  'chapter-1.pell-custody-claim',
  'chapter-1.secured-recycling-module-missing',
  'chapter-1.pell-separate-warning',
  'chapter-1.emergency-transponder-hardware-manifest',
  'chapter-1.ivers-supervised-statement',
  'chapter-1.joint-inspection-record-opened',
  'chapter-1.missing-hardware-diagnostic-pulse',
  'chapter-1.cargo-recovery-locus-preserved',
  'chapter-1.emergency-hardware-recovered-under-seal',
  'chapter-1.recovery-timing-trace-preserved',
  'chapter-1.joint-incident-record-created',
  'chapter-1.cooperative-resolution-filed',
  'chapter-1.starfleet-authentication-failure-acknowledged',
  'chapter-1.asterion-arrival',
  'chapter-1.compact-patrol-false-colors-report',
  'chapter-1.truth.forged-starfleet-signals',
  'chapter-1.truth.no-pathogen',
  'chapter-1.truth.compact-recovery-team'
];

export const chapter1RequiredDecisionPointIds = [
  'decision.initial-convoy-posture',
  'decision.first-boarding-threshold',
  'decision.first-contact-execution',
  'decision.offsite-custody-cargo-discovery',
  'decision.pell-contact-terms',
  'decision.joint-inspection-release-cargo',
  'decision.cargo-diagnostic-pulse',
  'decision.hardware-recovery-under-seal',
  'decision.chapter-1-resolution-terms',
  'decision.asterion-arrival-false-colors'
];

export const chapter1RequiredOutcomeFlagIds = [
  'chapter-1.initial-response-posture',
  'chapter-1.convoy-evidence',
  'chapter-1.rescue-urgency',
  'chapter-1.quarantine-posture',
  'chapter-1.quarantine-confidence',
  'chapter-1.compact-posture',
  'chapter-1.evidence-custody',
  'chapter-1.missing-module-lead',
  'chapter-1.first-contact-route',
  'chapter-1.parnell-rescue',
  'chapter-1.faraday-evidence-access',
  'chapter-1.evacuee-location',
  'chapter-1.custody-dispute',
  'chapter-1.missing-cargo-lead',
  'chapter-1.pell-contact',
  'chapter-1.ivers-status',
  'chapter-1.cargo-recovery-route',
  'chapter-1.joint-inspection-status',
  'chapter-1.cargo-location',
  'chapter-1.recovered-hardware-status',
  'chapter-1.resolution-path',
  'chapter-1.incident-record-status',
  'chapter-1.ivers-trust',
  'chapter-1.pell-status',
  'chapter-1.compact-investigation-access',
  'chapter-1.authentication-failure-posture',
  'chapter-1.parnell-technical-debt',
  'chapter-1.transition-status',
  'chapter-1.next-mission-hook'
];

export const chapter1RequiredPressureIds = [
  'pressure.convoy-rescue-window',
  'pressure.forged-authority-uncertainty',
  'pressure.compact-silent-extraction'
];

export const chapter2RequiredPhaseIds = [
  'false-colors-arrival-briefing',
  'transparency-terms-set',
  'orison-evidence-baseline',
  'aegis-medical-trust',
  'security-access-demonstration',
  'joint-investigation-charter'
];

export const chapter2RequiredFactIds = [
  'chapter-2.aegis-two-attack-report',
  'chapter-2.false-breckenridge-signature',
  'chapter-2.breckenridge-convoy-alibi',
  'chapter-2.aegis-two-casualties',
  'chapter-2.transparency-terms-framed',
  'chapter-2.orison-sensor-baseline-preserved',
  'chapter-2.breckenridge-calibration-mismatch',
  'chapter-2.attack-track-reconstruction-opened',
  'chapter-2.aegis-two-medical-channel-opened',
  'chapter-2.critical-officer-stabilized',
  'chapter-2.patrol-officer-testimony-preserved',
  'chapter-2.command-auth-annex-defined',
  'chapter-2.bronn-security-demonstration-recorded',
  'chapter-2.kessler-access-alternative-framed',
  'chapter-2.kessler-joint-legitimacy-statement',
  'chapter-2.holt-interference-restricted',
  'chapter-2.weak-hecate-trace-preserved',
  'chapter-2.open-orders-reach-presence-authorized',
  'chapter-2.truth.disguised-cargo-tug',
  'chapter-2.truth.holt-cell-staged-attack',
  'chapter-2.truth.lantern-escalated-attack',
  'chapter-2.truth.hecate-control-trace',
  'chapter-2.truth.local-patrol-schedules-supplied'
];

export const chapter2RequiredDecisionPointIds = [
  'decision.false-colors-transparency-terms',
  'decision.orison-evidence-baseline',
  'decision.aegis-medical-trust',
  'decision.security-access-demonstration',
  'decision.joint-investigation-charter'
];

export const chapter2RequiredOutcomeFlagIds = [
  'chapter-2.transparency-posture',
  'chapter-2.compact-access-scope',
  'chapter-2.aegis-medical-posture',
  'chapter-2.breckenridge-alibi-status',
  'chapter-2.tactical-secrecy-posture',
  'chapter-2.audit-chain-status',
  'chapter-2.orison-sensor-status',
  'chapter-2.calibration-evidence-status',
  'chapter-2.attack-reconstruction-status',
  'chapter-2.disclosure-boundary-status',
  'chapter-2.aegis-care-status',
  'chapter-2.medical-neutrality-status',
  'chapter-2.compact-medical-trust',
  'chapter-2.patrol-testimony-status',
  'chapter-2.public-medical-record-status',
  'chapter-2.security-access-status',
  'chapter-2.command-auth-exposure-status',
  'chapter-2.bronn-audit-status',
  'chapter-2.kessler-access-position',
  'chapter-2.tolland-disclosure-status',
  'chapter-2.joint-investigation-status',
  'chapter-2.kessler-legitimacy-status',
  'chapter-2.holt-containment-status',
  'chapter-2.hecate-lead-status',
  'chapter-2.open-orders-transition-status'
];

export const chapter2RequiredPressureIds = [
  'pressure.false-colors-public-anger',
  'pressure.false-colors-audit-fragility',
  'pressure.false-colors-medical-risk',
  'pressure.false-colors-security-access',
  'pressure.false-colors-orison-evidence',
  'pressure.false-colors-medical-testimony',
  'pressure.false-colors-security-demonstration',
  'pressure.false-colors-joint-charter'
];
