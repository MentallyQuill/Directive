export const packageSpine = [
  'manifest',
  'ship',
  'crew',
  'characterCreation',
  'mainCampaign',
  'sideMissionRules',
  'missionTemplates',
  'guardrails',
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
  'schemas/packages/assets.schema.json',
  'schemas/campaign/campaign-state-projection.schema.json'
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
  'activeStarshipPackage',
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
  'first-committed-response'
];

export const chapter1RequiredFactIds = [
  'chapter-1.relief-convoy-distress-packet',
  'chapter-1.convoy-powered-silent',
  'chapter-1.quarantine-code-routing-mismatch',
  'chapter-1.truth.forged-starfleet-signals',
  'chapter-1.truth.no-pathogen',
  'chapter-1.truth.compact-recovery-team'
];

export const chapter1RequiredDecisionPointIds = [
  'decision.initial-convoy-posture',
  'decision.first-boarding-threshold'
];

export const chapter1RequiredOutcomeFlagIds = [
  'chapter-1.initial-response-posture',
  'chapter-1.convoy-evidence',
  'chapter-1.rescue-urgency',
  'chapter-1.quarantine-posture',
  'chapter-1.quarantine-confidence',
  'chapter-1.compact-posture',
  'chapter-1.evidence-custody',
  'chapter-1.missing-module-lead'
];

export const chapter1RequiredPressureIds = [
  'pressure.convoy-rescue-window',
  'pressure.forged-authority-uncertainty',
  'pressure.compact-silent-extraction'
];
