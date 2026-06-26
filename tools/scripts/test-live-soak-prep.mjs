import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  PLAYWRIGHT_SELECTOR_GUIDANCE,
  appendJsonLine,
  createArtifactPaths,
  createRunId,
  ensureArtifactTree,
  normalizeBaseUrl,
  normalizeExtensionPath,
  readJsonFile,
  tempArtifactRoot,
  verifyPlaywrightBrowserEnvironment,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';
import {
  buildFactualGroundingCanaryPacks,
  writeFactualGroundingCanaryArtifacts
} from './lib/factual-grounding-canaries.mjs';
import {
  buildFactualGroundingCheck,
  buildModelAssistedFactualReviewRequest,
  buildModelAssistedFactualReviewResult,
  factualGroundingLiveLogRecord,
  promptBlocksFromInspection,
  writeFactualGroundingCheckArtifact
} from './lib/factual-grounding-evaluator.mjs';
import {
  SOAK_CAMPAIGN_MATRIX,
  SOAK_COMMAND_BEARING_SYSTEM_POLICY,
  SOAK_COMMAND_CONDUCT_SCENARIOS,
  SOAK_END_CONDITION_SCENARIOS,
  SOAK_FACTUAL_GROUNDING_POLICY,
  SOAK_LIVE_LOG_POLICY,
  SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY,
  SOAK_PARALLEL_WORKER_POLICY,
  SOAK_PLAYER_INPUT_POLICY,
  SOAK_PHASES,
  SOAK_READABLE_TRANSCRIPT_POLICY,
  SOAK_SCENE_HANDSHAKE_POLICY,
  SOAK_TIMEKEEPING_POLICY,
  SOAK_TURN_SETTLEMENT_POLICY,
  SOAK_TURN_SCRIPT,
  buildLiveSmokeEnvironment,
  buildPostSmokeFactualGroundingAudit,
  buildReleaseCertificationSummary,
  buildSoakChatMessageScript,
  liveSmokeDelegationAssessment,
  SOAK_UI_STATE_SURFACE_POLICY,
  buildDryRunReport,
  statusFromChecks,
  strictModePolicy
} from './soak-sillytavern-campaign-live.mjs';
import {
  playerInputPerspectiveEvidence
} from './lib/player-input-perspective.mjs';

assert.equal(normalizeBaseUrl('http://127.0.0.1:8000///'), 'http://127.0.0.1:8000');
assert.equal(normalizeExtensionPath('scripts/extensions/third-party/Directive/'), '/scripts/extensions/third-party/Directive');
assert.match(createRunId(new Date('2026-06-23T12:34:56.789Z')), /^2026-06-23T12-34-56-789Z$/);
assert.equal(PLAYWRIGHT_SELECTOR_GUIDANCE.prefer.some((entry) => /role/.test(entry)), true);

const soakRunnerSource = fs.readFileSync(path.resolve('tools/scripts/soak-sillytavern-campaign-live.mjs'), 'utf8');
assert.match(soakRunnerSource, /ensureDirectory,/);
assert.match(soakRunnerSource, /ensureDirectory\(smokeArtifactDir\)/);
assert.match(soakRunnerSource, /DIRECTIVE_SILLYTAVERN_PROMPT_INSPECTION_DIR/);
assert.match(soakRunnerSource, /DIRECTIVE_SILLYTAVERN_FACT_REVIEW_ONLY/);
assert.match(soakRunnerSource, /invokeModelAssistedFactualReview/);
const liveSmokeSource = fs.readFileSync(path.resolve('tools/scripts/smoke-sillytavern-live.mjs'), 'utf8');
assert.match(liveSmokeSource, /visibleDirectiveProgress/);
assert.match(liveSmokeSource, /visible-directive-chat-response/);
assert.match(liveSmokeSource, /sidecar-not-expected-before-committed-or-complete-turn/);
assert.match(liveSmokeSource, /PROMPT_INSPECTION_DIR/);
assert.match(liveSmokeSource, /capturePromptInspectionSnapshot/);
assert.match(liveSmokeSource, /snapshotSourceChatTranscript/);
assert.match(liveSmokeSource, /runFactualGroundingReviewOnly/);
assert.match(liveSmokeSource, /DIRECTIVE_SILLYTAVERN_FACT_REVIEW_REQUEST_PATH/);

const schema = readJsonFile('schemas/testing/live-campaign-soak-report.schema.json');
assert.equal(schema.properties.modelCallPolicy.properties.budget.const, 'unlimited');
assert.equal(schema.required.includes('releaseCertificationSummary'), true);
assert.equal(schema.properties.releaseCertificationSummary.properties.state.enum.includes('certified'), true);
assert.equal(schema.properties.releaseCertificationSummary.properties.evidenceGates.items.properties.status.enum.includes('planned'), true);
assert.equal(schema.properties.strictModePolicy.properties.enabled.type, 'boolean');
assert.equal(schema.properties.strictModePolicy.properties.warningStatus.enum.includes('fail'), true);
assert.equal(schema.properties.driverPolicy.properties.primary.const, 'playwright');
assert.equal(schema.properties.driverPolicy.properties.fallbackEvidenceIsEquivalent.const, false);
assert.equal(schema.properties.liveLogPolicy.properties.artifact.const, 'live-log.jsonl');
assert.equal(schema.properties.turnSettlementPolicy.properties.required.const, true);
assert.equal(schema.properties.readableTranscriptPolicy.properties.required.const, true);
assert.equal(schema.properties.playerInputPolicy.properties.required.const, true);
assert.equal(schema.properties.sceneHandshakePolicy.properties.required.const, true);
assert.equal(schema.properties.sceneHandshakePolicy.properties.intervalLogRecord.const, 'scene-handshake-settlement');
assert.equal(schema.properties.sceneHandshakePolicy.required.includes('allowedRoots'), true);
assert.equal(schema.properties.timekeepingPolicy.properties.required.const, true);
assert.equal(schema.properties.timekeepingPolicy.properties.artifactDirectory.const, 'timekeeping');
assert.equal(schema.properties.timekeepingPolicy.properties.intervalLogRecord.const, 'timekeeping-header-check');
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.properties.required.const, true);
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.properties.artifactDirectory.const, 'objective-assignments');
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.properties.liveLogRecord.const, 'objective-assignment-projection-check');
assert.equal(schema.properties.objectiveAssignmentProjectionPolicy.required.includes('requiredSurfaces'), true);
assert.equal(schema.properties.factualGroundingPolicy.properties.required.const, true);
assert.equal(schema.properties.factualGroundingPolicy.properties.artifactDirectory.const, 'fact-checks');
assert.equal(schema.properties.factualGroundingPolicy.properties.packIndexArtifact.const, 'fact-checks/canary-index.json');
assert.equal(schema.properties.factualGroundingPolicy.properties.liveLogRecord.const, 'fact-check');
assert.equal(schema.properties.factualGroundingPolicy.required.includes('packIndexArtifact'), true);
assert.equal(schema.properties.factualGroundingPolicy.required.includes('rootCauseLabels'), true);
assert.equal(schema.properties.commandBearingSystemPolicy.properties.required.const, true);
assert.equal(schema.properties.commandBearingSystemPolicy.properties.intervalLogRecord.const, 'command-bearing-interval');
assert.equal(schema.properties.commandBearingSystemPolicy.required.includes('certificationGates'), true);
assert.equal(schema.properties.commandBearingSystemPolicy.required.includes('boundaryDetectionLadder'), true);
assert.equal(schema.properties.artifacts.required.includes('liveLog'), true);
assert.equal(schema.properties.artifacts.required.includes('readableTranscript'), true);
assert.equal(schema.properties.artifacts.required.includes('sourceChatTranscript'), true);
assert.equal(schema.properties.artifacts.required.includes('factChecks'), true);
assert.equal(schema.properties.artifacts.required.includes('factCanaryIndex'), true);
assert.equal(schema.properties.campaignMatrix.items.$ref, '#/$defs/campaignMatrixEntry');
assert.equal(schema.properties.factualCanaryPacks.items.$ref, '#/$defs/factualCanaryPack');
assert.equal(schema.properties.commandConductScenarios.items.$ref, '#/$defs/commandConductScenario');
assert.equal(schema.properties.endConditionScenarios.items.$ref, '#/$defs/endConditionScenario');

assert.equal(SOAK_LIVE_LOG_POLICY.appendOnly, true);
assert.equal(SOAK_LIVE_LOG_POLICY.flushAfterEveryRecord, true);
assert.equal(SOAK_LIVE_LOG_POLICY.partialRunProofRequired, true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('operator-stop'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('failure'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('parallel-user'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('patch-lane'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('extension-sync-barrier'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('triage-finding'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('fix-deferred'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('fix-barrier'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('transcript-capture'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('prompt-inspection-capture'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('fact-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('model-assisted-factual-review'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('objective-assignment-projection-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('scene-handshake-settlement'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('timekeeping-header-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-evidence'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-closure'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-review'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-spend'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-abuse-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('crew-surface-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('mission-surface-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('relationship-delta-check'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('misconduct-probe'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('discipline-escalation'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('conduct-recovery'), true);
assert.equal(SOAK_LIVE_LOG_POLICY.recordKinds.includes('command-bearing-interval'), true);
assert.equal(SOAK_TURN_SETTLEMENT_POLICY.required, true);
assert.deepEqual(SOAK_TURN_SETTLEMENT_POLICY.nonTerminalIngressStatuses, ['classifying', 'classified']);
assert.match(SOAK_TURN_SETTLEMENT_POLICY.nextTurnGate, /must not send the next scripted player message/);
assert.match(SOAK_TURN_SETTLEMENT_POLICY.failurePolicy, /P1 turn-settlement failure/);
assert.match(SOAK_TURN_SETTLEMENT_POLICY.failurePolicy, /delegated hostGeneration continuation/);
assert(SOAK_TURN_SETTLEMENT_POLICY.acceptedTurnEvidence.includes('committed-ingress-with-turnId-outcomeId-responseMessageId-and-response-ledger-entry'));
assert(SOAK_TURN_SETTLEMENT_POLICY.acceptedTurnEvidence.includes('committed-injectAndContinue-routine-or-no-change-with-delegated-hostGeneration-response-ledger-entry-and-assistant-continuation'));
assert(SOAK_TURN_SETTLEMENT_POLICY.acceptedTurnEvidence.includes('recoveryRequired-ingress-with-chatTurnProcessingFailure-record-and-lane-paused'));
assert.equal(SOAK_READABLE_TRANSCRIPT_POLICY.required, true);
assert.equal(SOAK_READABLE_TRANSCRIPT_POLICY.readableArtifact, 'transcript/readable-chat.md');
assert.equal(SOAK_PLAYER_INPUT_POLICY.required, true);
assert.match(SOAK_PLAYER_INPUT_POLICY.style, /roleplay prose/);
assert.equal(SOAK_PLAYER_INPUT_POLICY.defaultPerspective, 'third-person');
assert.match(SOAK_PLAYER_INPUT_POLICY.firstPersonExceptionPolicy, /must not count/);
assert.match(SOAK_PLAYER_INPUT_POLICY.narrationDetectionPolicy, /declared perspective/);
assert.match(SOAK_PLAYER_INPUT_POLICY.narrationDetectionPolicy, /quoted character speech/);
assert(SOAK_PLAYER_INPUT_POLICY.qualityDimensions.includes('third-person perspective compliance'));
assert(SOAK_PLAYER_INPUT_POLICY.qualityDimensions.includes('dialogue quality'));
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.required, true);
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.artifactDirectory, 'fact-checks');
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.packIndexArtifact, 'fact-checks/canary-index.json');
assert.equal(SOAK_FACTUAL_GROUNDING_POLICY.liveLogRecord, 'fact-check');
assert.deepEqual(SOAK_FACTUAL_GROUNDING_POLICY.evaluationPhases, ['prompt-availability-audit', 'generation-verdict']);
assert(SOAK_FACTUAL_GROUNDING_POLICY.canaryCategories.includes('senior-crew-identity'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.canaryCategories.includes('opening-premise'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.canaryCategories.includes('cross-campaign-isolation'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.verdicts.includes('contradicted'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.rootCauseLabels.includes('model-ignored-available-fact'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.rootCauseLabels.includes('prompt-missing'));
assert(SOAK_FACTUAL_GROUNDING_POLICY.certificationGates.includes('prompt-availability-is-recorded-before-generation-judgment'));
const factualCanaryPacks = buildFactualGroundingCanaryPacks({ campaignMatrix: SOAK_CAMPAIGN_MATRIX });
assert.equal(factualCanaryPacks.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(factualCanaryPacks.every((pack) => pack.kind === 'directive.liveCampaignSoak.factualCanaryPack'), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaryCount === pack.canaries.length), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.every((entry) => entry.hiddenStateSafe === true)), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.some((entry) => entry.category === 'campaign-specific-terms')), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.some((entry) => entry.category === 'ship-or-venue-facts')), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.some((entry) => entry.category === 'player-billet')), true);
assert.equal(factualCanaryPacks.every((pack) => pack.canaries.some((entry) => entry.category === 'senior-crew-identity')), true);
const ashesCanaryPack = factualCanaryPacks.find((pack) => pack.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace');
assert(ashesCanaryPack);
assert(ashesCanaryPack.canaries.some((entry) => entry.id.endsWith('.opening.transit-premise') && /twenty-five days underway/i.test(entry.summary)));
assert(ashesCanaryPack.canaries.some((entry) => entry.id.endsWith('.opening.transit-premise') && /drops to impulse at the transfer waypoint/i.test(entry.summary)));
const bronnCanary = ashesCanaryPack.canaries.find((entry) => entry.id.endsWith('.senior-crew.hadrik-bronn.identity'));
assert(bronnCanary);
assert.match(bronnCanary.summary, /Tellarite/);
assert.match(bronnCanary.summary, /Late fifties/i);
assert(bronnCanary.contradictionWatchlist.some((entry) => /another species than Tellarite/i.test(entry)));
const transitCanary = ashesCanaryPack.canaries.find((entry) => entry.id.endsWith('.opening.transit-premise'));
assert(transitCanary);
const badFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-001',
  generatedMessageIndex: 1,
  transcriptPointer: 'transcript/readable-chat.md#mes-001',
  promptBlocks: [
    { id: 'crew-public-identity', text: bronnCanary.summary },
    { id: 'opening-premise', text: transitCanary.summary }
  ],
  requiredFactIds: [bronnCanary.id, transitCanary.id],
  generatedText: 'Lieutenant Commander Hadrik Bronn, a 40-year-old Human officer, says the Breckenridge has been at impulse for 6 days before the new XO arrives.'
});
assert.equal(badFactCheck.kind, 'directive.liveCampaignSoak.factualCheck');
assert.equal(badFactCheck.status, 'fail');
assert.equal(badFactCheck.counts.contradicted, 2);
assert.equal(badFactCheck.promptAvailability.byFactId[bronnCanary.id].status, 'available');
assert.equal(badFactCheck.promptAvailability.byFactId[transitCanary.id].status, 'available');
assert.equal(badFactCheck.results.find((entry) => entry.factId === bronnCanary.id).rootCauseLabel, 'model-ignored-available-fact');
assert.equal(badFactCheck.results.find((entry) => entry.factId === transitCanary.id).rootCauseLabel, 'model-ignored-available-fact');
const missingPromptFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-002',
  promptBlocks: [{ id: 'unrelated', text: 'Only a generic bridge scene prompt is available.' }],
  requiredFactIds: [bronnCanary.id],
  generatedText: 'Hadrik Bronn is introduced as a Human officer.'
});
assert.equal(missingPromptFactCheck.status, 'fail');
assert.equal(missingPromptFactCheck.promptAvailability.byFactId[bronnCanary.id].status, 'missing');
assert.equal(missingPromptFactCheck.results[0].rootCauseLabel, 'prompt-missing');
const metadataPromptBlocks = promptBlocksFromInspection({
  blocks: [
    { id: 'relevant-crew', title: 'Relevant Crew Context', hash: 'crew-hash' },
    { id: 'immediate-scene', title: 'Immediate Scene', hash: 'scene-hash' }
  ]
});
const metadataFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-002b',
  promptBlocks: metadataPromptBlocks,
  requiredFactIds: [bronnCanary.id, transitCanary.id],
  generatedText: 'Hadrik Bronn is introduced as a Human officer while the bridge watches the transfer unfold.'
});
assert.equal(metadataFactCheck.status, 'fail');
assert.equal(metadataFactCheck.promptAvailability.byFactId[bronnCanary.id].status, 'partial');
assert.equal(metadataFactCheck.promptAvailability.byFactId[bronnCanary.id].matchedMetadata.some((entry) => entry.blockId === 'relevant-crew'), true);
assert.equal(metadataFactCheck.results.find((entry) => entry.factId === bronnCanary.id).rootCauseLabel, 'model-ignored-available-fact');
const goodFactCheck = buildFactualGroundingCheck({
  pack: ashesCanaryPack,
  generatedMessageId: 'mes-003',
  promptBlocks: [
    { id: 'crew-public-identity', text: bronnCanary.summary },
    { id: 'opening-premise', text: transitCanary.summary }
  ],
  requiredFactIds: [bronnCanary.id, transitCanary.id],
  generatedText: `${bronnCanary.assertions[0]} ${transitCanary.assertions[0]} ${transitCanary.assertions[1]}`
});
assert.equal(goodFactCheck.status, 'pass');
assert.equal(goodFactCheck.counts.respected, 2);
const badFactLogRecord = factualGroundingLiveLogRecord({ check: badFactCheck, artifactPath: 'fact-checks/mes-001/fact-check.json' });
assert.equal(badFactLogRecord.kind, 'fact-check');
assert.equal(badFactLogRecord.status, 'fail');
assert.equal(badFactLogRecord.verdictCounts.contradicted, 2);
const modelReviewRequest = buildModelAssistedFactualReviewRequest({
  pack: ashesCanaryPack,
  transcriptMessages: [
    { index: 0, isUser: true, text: 'Commander Arlen asks Bronn for the bridge handoff.' },
    { index: 1, isUser: false, directiveOwned: true, text: 'Bronn is described as a Human officer.' }
  ],
  deterministicChecks: [badFactCheck],
  runId: 'prep-test'
});
assert.equal(modelReviewRequest.kind, 'directive.liveCampaignSoak.factualModelReviewRequest');
assert.equal(modelReviewRequest.canaries.every((entry) => entry.hiddenStateSafe === true), true);
assert.equal(modelReviewRequest.transcript.length, 2);
assert.equal(modelReviewRequest.deterministicChecks[0].checkId, badFactCheck.checkId);
assert.match(modelReviewRequest.hiddenStatePolicy, /raw prompt bodies/);
assert.equal(modelReviewRequest.canaries.some((entry) => Object.hasOwn(entry, 'directorOnlyData')), false);
assert.equal(modelReviewRequest.transcript.some((entry) => Object.hasOwn(entry, 'prompt')), false);
assert.equal(modelReviewRequest.deterministicChecks.some((entry) => Object.hasOwn(entry, 'generatedTextPreview')), false);
const modelReviewResult = buildModelAssistedFactualReviewResult({
  request: modelReviewRequest,
  modelOutput: {
    status: 'fail',
    overallAssessment: 'The transcript contradicts Bronn identity.',
    findings: [
      {
        factId: bronnCanary.id,
        verdict: 'contradicted',
        severity: 'P1 factual blocker',
        rootCauseLabel: 'model-ignored-available-fact',
        summary: 'Bronn is described as Human.',
        evidenceSpans: [{ messageIndex: 1, quote: 'Bronn is described as a Human officer.' }],
        confidence: 0.96
      }
    ]
  },
  modelCall: {
    roleId: 'factualGroundingReviewer',
    providerKind: 'utility',
    model: 'fixture-reviewer',
    status: 'completed',
    ok: true,
    latencyMs: 25
  }
});
assert.equal(modelReviewResult.kind, 'directive.liveCampaignSoak.factualModelReviewResult');
assert.equal(modelReviewResult.status, 'fail');
assert.equal(modelReviewResult.counts.contradicted, 1);
assert.equal(modelReviewResult.counts.p1, 1);
assert.equal(modelReviewResult.modelCall.roleId, 'factualGroundingReviewer');
assert.equal(SOAK_SCENE_HANDSHAKE_POLICY.required, true);
assert.deepEqual(SOAK_SCENE_HANDSHAKE_POLICY.modelRoles, ['sceneHandshakeSettler']);
assert.equal(SOAK_SCENE_HANDSHAKE_POLICY.intervalLogRecord, 'scene-handshake-settlement');
assert(SOAK_SCENE_HANDSHAKE_POLICY.ownerLanes.includes('canonical-long-campaign'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.allowedRoots.includes('mission.openAssignments'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.allowedRoots.includes('commandLog.entries'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.certificationGates.includes('accepted-host-native-assignment-commits-allowlisted-state'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.certificationGates.includes('rejected-or-corrected-assistant-beat-does-not-auto-commit'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.certificationGates.includes('command-bearing-terminal-formal-objective-and-hidden-state-roots-are-not-mutated'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.minimumEvidence.includes('sanitized-sceneHandshakeSettler-model-call'));
assert(SOAK_SCENE_HANDSHAKE_POLICY.stateInspection.includes('prompt-revision-before-after-settlement'));
assert.match(SOAK_SCENE_HANDSHAKE_POLICY.failureSeverityPolicy, /outside allowlisted roots/);
assert.match(SOAK_SCENE_HANDSHAKE_POLICY.hiddenStatePolicy, /Command Bearing evaluator reasoning/);
assert.equal(SOAK_TIMEKEEPING_POLICY.required, true);
assert.equal(SOAK_TIMEKEEPING_POLICY.artifactDirectory, 'timekeeping');
assert.equal(SOAK_TIMEKEEPING_POLICY.intervalLogRecord, 'timekeeping-header-check');
assert.equal(SOAK_TIMEKEEPING_POLICY.expectedHeaderPattern, '*Stardate #####.# | HHMM hours*');
assert(SOAK_TIMEKEEPING_POLICY.requiredSurfaces.includes('host-native-injectAndContinue'));
assert(SOAK_TIMEKEEPING_POLICY.certificationGates.includes('stale-leading-headers-are-replaced-not-stacked'));
assert(SOAK_TIMEKEEPING_POLICY.certificationGates.includes('installed-preset-version-includes-reply-header-contract'));
assert(SOAK_TIMEKEEPING_POLICY.stateInspection.includes('reply-header-prompt-block-hash-and-revision'));
assert.match(SOAK_TIMEKEEPING_POLICY.failureSeverityPolicy, /visible headers contradict authoritative state/);
assert.equal(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.required, true);
assert.equal(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.artifactDirectory, 'objective-assignments');
assert.equal(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.liveLogRecord, 'objective-assignment-projection-check');
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.triggerSources.includes('scene-handshake-accepted-assignment'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.some((entry) => entry.id === 'mission-current-orders'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.some((entry) => entry.id === 'command-log-entry'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.some((entry) => entry.id === 'crew-character-link'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.some((entry) => entry.id === 'crew-roster-link'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.certificationGates.includes('accepted-assignment-state-projects-to-mission-log-and-linked-crew'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.minimumEvidence.includes('linked-crew-character-or-roster-visible-excerpt-and-screenshot'));
assert(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.stateInspection.includes('linkedCrewIds-threadIds-and-playerSafeCrewProjection-hashes'));
assert.match(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.failureSeverityPolicy, /Mission, Log, or linked Crew/);
assert.match(SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.hiddenStatePolicy, /hidden relationship values/);
assert.equal(SOAK_UI_STATE_SURFACE_POLICY.required, true);
assert.equal(SOAK_UI_STATE_SURFACE_POLICY.intervalTurns, '5-10');
assert.match(SOAK_UI_STATE_SURFACE_POLICY.checkpointCadence, /5-10 player-turn intervals/);
assert.equal(SOAK_UI_STATE_SURFACE_POLICY.surfaces.length, 4);
assert(SOAK_UI_STATE_SURFACE_POLICY.surfaces.some((entry) => entry.id === 'crew-character-tab'));
assert(SOAK_UI_STATE_SURFACE_POLICY.surfaces.some((entry) => entry.id === 'crew-roster-pressures'));
assert(SOAK_UI_STATE_SURFACE_POLICY.surfaces.some((entry) => entry.id === 'crew-relationship-deltas'));
assert(SOAK_UI_STATE_SURFACE_POLICY.surfaces.some((entry) => entry.id === 'mission-drawer-updates'));
assert.match(SOAK_UI_STATE_SURFACE_POLICY.hiddenStatePolicy, /raw relationship values/);
assert.equal(SOAK_COMMAND_BEARING_SYSTEM_POLICY.required, true);
assert.equal(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalTurns, '5-10');
assert.equal(SOAK_COMMAND_BEARING_SYSTEM_POLICY.ownerLane, 'end-conditions-command-bearing');
assert.deepEqual(SOAK_COMMAND_BEARING_SYSTEM_POLICY.modelRoles, [
  'commandBearingFitChecker',
  'commandBearingSpendValidator',
  'commandBearingEvaluator'
]);
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationGates.includes('evidence-accumulates-only-after-committed-outcomes'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationGates.includes('boundary-detection-separates-scene-pacing-from-durable-closure'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationGates.includes('point-lifecycle-is-scoped-auditable-and-never-a-reroll'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule.includes('baseline-false-positives'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule.includes('scene-end-non-closure'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule.includes('rank-and-point-progression'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule.includes('post-commit-robustness'));
assert.equal(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalLogRecord, 'command-bearing-interval');
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalPlaybook.includes('baseline-professional-play-no-evidence'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalPlaybook.includes('closure-probe-with-scene-end-non-closure-and-durable-closure-check'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalPlaybook.includes('point-lifecycle-after-organic-or-labeled-fixture-availability'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('routine-play-no-evidence-check'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('closure-record-with-no-review'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('mark-review-result'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('valid-spend-or-logged-blocker'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence.includes('retcon-touching-command-bearing-source'));
assert.match(SOAK_COMMAND_BEARING_SYSTEM_POLICY.fixtureBranchPolicy, /organic evidence/);
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureProofLevels.includes('scene-end-is-pacing-only-and-never-mark-review-proof'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureProofLevels.includes('thread-closure-requires-durable-thread-state'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureProofLevels.includes('ambiguous-utility-closure-suggestion-does-not-award'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.boundaryDetectionLadder.includes('scene-beat-prompt-refresh-without-mark-review'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.boundaryDetectionLadder.includes('quest-or-chapter-closure-queues-one-relevant-review'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.boundaryDetectionLadder.includes('retconned-closure-enters-explicit-recovery-or-review-required'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReviewGates.includes('agency-required'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReviewGates.includes('causality-required'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReviewGates.includes('hidden-state-redaction-required'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.evidenceAccumulation.includes('strong-inspiration-evidence-after-committed-outcome'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.evidenceAccumulation.includes('routine-competence-creates-no-evidence'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.evidenceAccumulation.includes('player-authored-reward-claim-creates-no-evidence'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureDetection.includes('utility-suggested-closure-without-state-proof-does-not-review'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureDetection.includes('committed-state-closure-can-review-even-if-utility-misses-it'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReview.includes('no-mark-without-agency'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReview.includes('duplicate-closure-review-blocked'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReview.includes('rank-thresholds-change-at-2-5-9-14-marks'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.pointSpend.includes('valid-spend-improves-exactly-two-bands'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.pointSpend.includes('anchored-consequences-remain'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.pointSpend.includes('controlled-narration-aborts-ordinary-host-generation'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.mutationAbuse.includes('swipe-does-not-reroll-or-refund'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.mutationAbuse.includes('already-rewarded-closure-cannot-award-again'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.stateInspection.includes('authoritative-commandBearing-state'));
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.stateInspection.includes('fit-spend-evaluator-model-call-journal-with-sanitized-failures'));
assert.match(SOAK_COMMAND_BEARING_SYSTEM_POLICY.failureSeverityPolicy, /P1/);
assert.match(SOAK_COMMAND_BEARING_SYSTEM_POLICY.failureSeverityPolicy, /duplicate awards/);
assert(SOAK_COMMAND_BEARING_SYSTEM_POLICY.liveEvidence.some((entry) => /evidence ledger/.test(entry)));
assert.match(SOAK_COMMAND_BEARING_SYSTEM_POLICY.hiddenStatePolicy, /private NPC thoughts/);
assert.equal(SOAK_PARALLEL_WORKER_POLICY.strategy, 'breadth-first-five-lane-coverage');
assert.equal(SOAK_PARALLEL_WORKER_POLICY.defaultWorkerHandles.length, 5);
assert.deepEqual(
  SOAK_PARALLEL_WORKER_POLICY.defaultWorkerHandles,
  ['directive-soak-a', 'directive-soak-b', 'directive-soak-c', 'directive-soak-d', 'directive-soak-e']
);
assert.equal(SOAK_PARALLEL_WORKER_POLICY.lanes.length, 5);
assert.equal(new Set(SOAK_PARALLEL_WORKER_POLICY.lanes.map((entry) => entry.id)).size, 5);
assert.equal(new Set(SOAK_PARALLEL_WORKER_POLICY.lanes.map((entry) => entry.userHandle)).size, 5);
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'canonical-long-campaign'));
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'mutation-reconciliation'));
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'end-conditions-command-bearing'));
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'multi-campaign-matrix'));
assert(SOAK_PARALLEL_WORKER_POLICY.lanes.some((entry) => entry.id === 'assist-agency-story-quality'));
assert.deepEqual(SOAK_PARALLEL_WORKER_POLICY.immediateFixSeverities, ['P0', 'P1']);
assert.deepEqual(SOAK_PARALLEL_WORKER_POLICY.deferredFixSeverities, ['P2', 'P3']);
assert.match(SOAK_PARALLEL_WORKER_POLICY.deferredFixPolicy, /continue/);
const thirdPersonWithDialogue = playerInputPerspectiveEvidence('Serrin steps to the rail and says, "I need the sensor pass on screen."', 'third-person');
assert.equal(thirdPersonWithDialogue.detectedPerspective, 'third-person');
assert.equal(thirdPersonWithDialogue.preferredPlayEvidence, true);
assert.equal(thirdPersonWithDialogue.firstPersonNarrationSuspected, false);
const firstPersonNarration = playerInputPerspectiveEvidence('I step to the rail and ask for the sensor pass.', 'third-person');
assert.equal(firstPersonNarration.detectedPerspective, 'first-person');
assert.equal(firstPersonNarration.preferredPlayEvidence, false);
assert.equal(firstPersonNarration.perspectiveWarning, 'declared-third-person-but-first-person-narration-suspected');
const declaredFirstPerson = playerInputPerspectiveEvidence('Serrin steps to the rail.', 'first-person');
assert.equal(declaredFirstPerson.detectedPerspective, 'first-person');
assert.equal(declaredFirstPerson.preferredPlayEvidence, false);
assert.equal(declaredFirstPerson.perspectiveWarning, 'declared-first-person-compatibility-only');

assert.equal(SOAK_CAMPAIGN_MATRIX.length, 6);
assert.equal(new Set(SOAK_CAMPAIGN_MATRIX.map((entry) => entry.packageId)).size, 6);
assert.equal(SOAK_CAMPAIGN_MATRIX.filter((entry) => entry.liveCoverage === 'full-soak-rotation-primary').length, 1);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('cross-campaign-isolation')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('factual-grounding-canary')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('objective-assignment-projection-canary')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('scene-handshake-canary')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.requiredLiveChecks.includes('timekeeping-header-canary')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.every((entry) => entry.deterministicCoverage.includes('end-condition-contract')), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:glass-harbor-drowned-constellation'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:serein-black-current'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:eudora-vale-broken-accord'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:aster-vale-unseen-border'), true);
assert.equal(SOAK_CAMPAIGN_MATRIX.some((entry) => entry.packageId === 'directive:campaign-package:celandine-enemys-garden'), true);

assert.equal(SOAK_PHASES.length, 10);
assert.equal(SOAK_PHASES.some((entry) => entry.id === 'scene-handshake-timekeeping'), true);
assert.equal(SOAK_TURN_SCRIPT.length, 52);
assert.equal(SOAK_TURN_SCRIPT.at(0).turn, 1);
assert.equal(SOAK_TURN_SCRIPT.at(-1).turn, 52);
assert.equal(new Set(SOAK_TURN_SCRIPT.map((entry) => entry.turn)).size, 52);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'crew-character'), true);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'crew-roster'), true);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'mission-drawer'), true);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'relationship-delta'), true);
assert.equal(SOAK_TURN_SCRIPT.some((entry) => entry.category === 'conduct-attack'), true);
assert.equal(statusFromChecks([{ status: 'warning' }], { strict: false }), 'warning');
assert.equal(statusFromChecks([{ status: 'warning' }], { strict: true }), 'fail');
assert.equal(statusFromChecks([{ status: 'pass' }], { strict: true }), 'pass');
assert.equal(strictModePolicy({ enabled: true }).warningStatus, 'fail');
assert.equal(strictModePolicy({ enabled: false }).warningStatus, 'warning');
const dryCertificationSummary = buildReleaseCertificationSummary({
  mode: 'dry-run',
  status: 'pass',
  strictModePolicy: strictModePolicy({ enabled: false }),
  checks: [{ id: 'playwright-browser-control', status: 'pass', summary: 'browser ok' }],
  campaignMatrix: SOAK_CAMPAIGN_MATRIX,
  phases: SOAK_PHASES,
  turnScript: SOAK_TURN_SCRIPT,
  commandConductScenarios: SOAK_COMMAND_CONDUCT_SCENARIOS,
  endConditionScenarios: SOAK_END_CONDITION_SCENARIOS,
  factualCanaryPacks: [{ canaryCount: 3 }],
  liveLogPolicy: SOAK_LIVE_LOG_POLICY
});
assert.equal(dryCertificationSummary.state, 'ready-for-live');
assert.match(dryCertificationSummary.conclusion, /not release certification/);
const liveCertificationSummary = buildReleaseCertificationSummary({
  ...dryCertificationSummary,
  mode: 'live',
  status: 'pass',
  strictModePolicy: strictModePolicy({ enabled: true }),
  checks: [{ id: 'live-smoke-52-turn-delegation', status: 'pass', summary: 'live ok' }],
  campaignMatrix: SOAK_CAMPAIGN_MATRIX,
  phases: SOAK_PHASES,
  turnScript: SOAK_TURN_SCRIPT,
  commandConductScenarios: SOAK_COMMAND_CONDUCT_SCENARIOS,
  endConditionScenarios: SOAK_END_CONDITION_SCENARIOS,
  factualCanaryPacks: [{ canaryCount: 3 }],
  liveLogPolicy: SOAK_LIVE_LOG_POLICY
});
assert.equal(liveCertificationSummary.state, 'certified');
assert.equal(liveCertificationSummary.checkCounts.total, 1);
const liveMessageScript = buildSoakChatMessageScript();
assert.equal(liveMessageScript.kind, 'directive.liveCampaignSoak.chatMessageScript');
assert.equal(liveMessageScript.perspective, 'third-person');
assert.equal(liveMessageScript.plannedTurnCount, SOAK_TURN_SCRIPT.length);
assert.equal(liveMessageScript.executedTurnLimit, null);
assert.equal(liveMessageScript.messages.length, SOAK_TURN_SCRIPT.length);
assert.equal(liveMessageScript.messages.at(0).id, 'soak-turn-01');
assert.equal(liveMessageScript.messages.at(-1).id, 'soak-turn-52');
assert.equal(liveMessageScript.messages.every((entry) => entry.perspective === 'third-person'), true);
assert.equal(liveMessageScript.messages.every((entry) => /\bCommander Arlen\b/.test(entry.text)), true);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-02')?.text || '', /bridge sensor and command-network telemetry buffer/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-02')?.text || '', /transporter room two/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-08')?.text || '', /warm-standby shields/);
assert.match(liveMessageScript.messages.find((entry) => entry.id === 'soak-turn-15')?.assist?.sendText || '', /command-network certificate stack/);
assert.equal(liveMessageScript.messages.some((entry) => entry.assist?.action === 'briefMe'), true);
assert.equal(liveMessageScript.messages.some((entry) => entry.assist?.mode === 'tryAgain'), true);
assert.equal(liveMessageScript.coverageLimitations.some((entry) => /edit\/delete\/message-action/.test(entry)), true);
const fullCompletionAssessment = liveSmokeDelegationAssessment({
  result: { ok: true },
  smokeSummary: { ok: true, chatCampaign: { sentMessageCount: SOAK_TURN_SCRIPT.length, qualityStatus: 'pass' } },
  messageScript: liveMessageScript
});
assert.equal(fullCompletionAssessment.status, 'pass');
const warningCompletionAssessment = liveSmokeDelegationAssessment({
  result: { ok: true },
  smokeSummary: { ok: true, chatCampaign: { sentMessageCount: SOAK_TURN_SCRIPT.length, qualityStatus: 'warning' } },
  messageScript: liveMessageScript
});
assert.equal(warningCompletionAssessment.status, 'warning');
const prematurePendingAssessment = liveSmokeDelegationAssessment({
  result: { ok: true },
  smokeSummary: {
    ok: true,
    chatCampaign: {
      sentMessageCount: 8,
      qualityStatus: 'warning',
      stoppedOnPendingInteraction: { kind: 'clarificationNeeded' }
    }
  },
  messageScript: liveMessageScript
});
assert.equal(prematurePendingAssessment.status, 'fail');
assert.match(prematurePendingAssessment.summary, /stopped after 8 of 52 planned turn/);
const limitedLiveMessageScript = buildSoakChatMessageScript({ turnLimit: 1 });
assert.equal(limitedLiveMessageScript.plannedTurnCount, SOAK_TURN_SCRIPT.length);
assert.equal(limitedLiveMessageScript.executedTurnLimit, 1);
assert.equal(limitedLiveMessageScript.messages.length, 1);
assert.equal(limitedLiveMessageScript.messages.at(0).id, 'soak-turn-01');
assert.equal(limitedLiveMessageScript.coverageLimitations.some((entry) => /intentionally limited to 1 of 52 planned turns/.test(entry)), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.length, 4);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.some((entry) => entry.id === 'captain-public-verbal-fight'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.some((entry) => entry.id === 'bridge-inebriation-illicit-substances'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.some((entry) => entry.id === 'physical-assault-on-officer'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.some((entry) => entry.id === 'unhinged-command-pattern'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.terminalConditionFamily === 'command-fitness'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.playerInputStyle === 'naturalistic-roleplay-no-catastrophic-keywords'), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.catastrophicLanguageAllowed === false), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.preTerminalExpectation), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.recoveryExpectation), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.proportionalityRequirement), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.length >= 4), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.threshold === 'first-threshold')), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.threshold === 'recovery-threshold')), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.threshold === 'escalation-threshold')), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.threshold === 'terminal-threshold')), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.shouldTriggerTerminalDecision === true)), true);
assert.equal(SOAK_COMMAND_CONDUCT_SCENARIOS.every((entry) => entry.probeSequence.some((probe) => probe.shouldTriggerTerminalDecision === false)), true);
const catastrophicLanguage = /\b(?:self[- ]?destruct|auto[- ]?destruct|abandon ship|escape pods?|campaign objective fails|trigger(?:s|ed)? end conditions?|terminal checkpoint)\b/i;
for (const scenario of SOAK_COMMAND_CONDUCT_SCENARIOS) {
  assert.equal(catastrophicLanguage.test(scenario.playerIntent), false, `${scenario.id} playerIntent must avoid catastrophic shortcut language`);
  for (const probe of scenario.probeSequence) {
    assert.equal(catastrophicLanguage.test(probe.playerBehavior), false, `${scenario.id}/${probe.id} playerBehavior must avoid catastrophic shortcut language`);
    assert.equal(catastrophicLanguage.test(probe.expectedStatus), false, `${scenario.id}/${probe.id} expectedStatus must avoid catastrophic shortcut language`);
  }
}
assert.equal(SOAK_END_CONDITION_SCENARIOS.length, 8);
assert.deepEqual(
  SOAK_END_CONDITION_SCENARIOS.map((entry) => entry.expectedAction).sort(),
  [
    'keepEnding',
    'keepEnding',
    'pushOn',
    'pushOn',
    'replayFromCheckpoint',
    'replayFromCheckpoint',
    'saveTerminalBranch',
    'saveTerminalBranch'
  ]
);
assert.deepEqual(
  SOAK_END_CONDITION_SCENARIOS.map((entry) => entry.expectedDecisionStatus).sort(),
  ['keptEnding', 'keptEnding', 'pending', 'pending', 'pushedOn', 'pushedOn', 'replayed', 'replayed']
);
assert.equal(SOAK_END_CONDITION_SCENARIOS.filter((entry) => entry.triggerKind === 'catastrophic-command').length, 4);
assert.equal(SOAK_END_CONDITION_SCENARIOS.filter((entry) => entry.triggerKind === 'command-fitness-ladder').length, 4);
assert.equal(
  SOAK_END_CONDITION_SCENARIOS
    .filter((entry) => entry.triggerKind === 'command-fitness-ladder')
    .every((entry) => entry.sourceConductScenarioIds.length === SOAK_COMMAND_CONDUCT_SCENARIOS.length),
  true
);

const report = await buildDryRunReport();
assert.equal(report.kind, 'directive.liveCampaignSoak.report');
assert.equal(report.modelCallPolicy.budget, 'unlimited');
assert.equal(report.releaseCertificationSummary.status, report.status);
assert.equal(report.releaseCertificationSummary.mode, report.mode);
assert.equal(report.releaseCertificationSummary.checkCounts.total, report.checks.length);
assert.equal(report.releaseCertificationSummary.evidenceCounts.campaigns, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.releaseCertificationSummary.evidenceCounts.plannedTurns, SOAK_TURN_SCRIPT.length);
assert(report.releaseCertificationSummary.evidenceGates.some((entry) => entry.id === 'factual-grounding'));
assert.match(report.releaseCertificationSummary.nextAction, /warning|live|strict|Fix|Run/i);
assert.equal(report.strictModePolicy.enabled, false);
assert.equal(report.strictModePolicy.warningStatus, 'warning');
assert(report.strictModePolicy.env.includes('--strict'));
assert.equal(report.driverPolicy.primary, 'playwright');
assert.equal(report.driverPolicy.fallbackEvidenceIsEquivalent, false);
assert.equal(report.liveLogPolicy.artifact, 'live-log.jsonl');
assert.deepEqual(report.turnSettlementPolicy.nonTerminalIngressStatuses, ['classifying', 'classified']);
assert.match(report.turnSettlementPolicy.failurePolicy, /P1 turn-settlement failure/);
assert.equal(report.readableTranscriptPolicy.required, true);
assert.equal(report.playerInputPolicy.required, true);
assert.equal(report.playerInputPolicy.defaultPerspective, 'third-person');
assert.match(report.playerInputPolicy.narrationDetectionPolicy, /first-person narration warnings/);
assert.equal(report.playerInputPolicy.qualityDimensions.includes('player-agency discipline'), true);
assert.equal(report.sceneHandshakePolicy.required, true);
assert.equal(report.sceneHandshakePolicy.intervalLogRecord, 'scene-handshake-settlement');
assert(report.sceneHandshakePolicy.modelRoles.includes('sceneHandshakeSettler'));
assert(report.sceneHandshakePolicy.allowedRoots.includes('mission.openAssignments'));
assert(report.sceneHandshakePolicy.certificationGates.includes('prompt-rebuild-happens-before-current-player-classification'));
assert(report.sceneHandshakePolicy.minimumEvidence.includes('wrong-chat-or-wrong-save-no-mutation-check'));
assert(report.sceneHandshakePolicy.stateInspection.includes('sidecar-scheduling-after-settlement-revision'));
assert.equal(report.timekeepingPolicy.required, true);
assert.equal(report.timekeepingPolicy.artifactDirectory, 'timekeeping');
assert.equal(report.timekeepingPolicy.intervalLogRecord, 'timekeeping-header-check');
assert.equal(report.timekeepingPolicy.expectedHeaderPattern, '*Stardate #####.# | HHMM hours*');
assert(report.timekeepingPolicy.requiredSurfaces.includes('host-native-injectAndContinue'));
assert(report.timekeepingPolicy.certificationGates.includes('headers-are-stripped-from-model-and-evidence-paths'));
assert(report.timekeepingPolicy.stateInspection.includes('stale-header-strip-result-and-duplicate-header-count'));
assert.equal(report.objectiveAssignmentProjectionPolicy.required, true);
assert.equal(report.objectiveAssignmentProjectionPolicy.artifactDirectory, 'objective-assignments');
assert.equal(report.objectiveAssignmentProjectionPolicy.liveLogRecord, 'objective-assignment-projection-check');
assert(report.objectiveAssignmentProjectionPolicy.triggerSources.includes('scene-handshake-accepted-assignment'));
assert(report.objectiveAssignmentProjectionPolicy.requiredSurfaces.some((entry) => entry.id === 'mission-current-orders'));
assert(report.objectiveAssignmentProjectionPolicy.requiredSurfaces.some((entry) => entry.id === 'command-log-entry'));
assert(report.objectiveAssignmentProjectionPolicy.requiredSurfaces.some((entry) => entry.id === 'crew-character-link'));
assert(report.objectiveAssignmentProjectionPolicy.certificationGates.includes('accepted-assignment-state-projects-to-mission-log-and-linked-crew'));
assert(report.objectiveAssignmentProjectionPolicy.minimumEvidence.includes('mission-current-orders-visible-excerpt-and-screenshot'));
assert(report.objectiveAssignmentProjectionPolicy.stateInspection.includes('visible-mission-log-crew-text-hashes-and-screenshot-paths'));
assert.equal(report.factualGroundingPolicy.required, true);
assert.equal(report.factualGroundingPolicy.artifactDirectory, 'fact-checks');
assert.equal(report.factualGroundingPolicy.packIndexArtifact, 'fact-checks/canary-index.json');
assert.equal(report.factualGroundingPolicy.liveLogRecord, 'fact-check');
assert(report.factualGroundingPolicy.evaluationPhases.includes('prompt-availability-audit'));
assert(report.factualGroundingPolicy.evaluationPhases.includes('generation-verdict'));
assert(report.factualGroundingPolicy.canaryCategories.includes('senior-crew-identity'));
assert(report.factualGroundingPolicy.canaryCategories.includes('active-mission-frame'));
assert(report.factualGroundingPolicy.verdicts.includes('unsupported-detail'));
assert(report.factualGroundingPolicy.rootCauseLabels.includes('cross-campaign-bleed'));
assert(report.factualGroundingPolicy.minimumEvidence.includes('prompt-block-id-or-availability-status-for-each-required-fact'));
assert.match(report.factualGroundingPolicy.failureSeverityPolicy, /P1/);
assert.equal(report.factualCanaryPacks.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.factualCanaryPackSummary.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.factualCanaryPacks.every((pack) => pack.canaryCount >= 10), true);
assert(report.factualCanaryPackSummary.some((entry) => entry.packageId === 'directive:campaign-package:breckenridge-ashes-of-peace'));
assert(report.factualCanaryPacks.some((pack) => pack.canaries.some((entry) => entry.id.endsWith('.opening.transit-premise'))));
assert.equal(report.commandBearingSystemPolicy.required, true);
assert.equal(report.commandBearingSystemPolicy.intervalLogRecord, 'command-bearing-interval');
assert(report.commandBearingSystemPolicy.certificationGates.includes('mark-review-grades-agency-commitment-causality-track-fit-and-distinctness'));
assert(report.commandBearingSystemPolicy.intervalPlaybook.includes('recovery-after-evidence-review-or-spend'));
assert(report.commandBearingSystemPolicy.closureProofLevels.includes('scene-end-is-pacing-only-and-never-mark-review-proof'));
assert(report.commandBearingSystemPolicy.boundaryDetectionLadder.includes('thread-closure-queues-relevant-evidence-only'));
assert(report.commandBearingSystemPolicy.markReviewGates.includes('track-fit-required'));
assert(report.commandBearingSystemPolicy.stateInspection.includes('player-safe-ui-projection-cross-checked-against-authoritative-save'));
assert.match(report.commandBearingSystemPolicy.failureSeverityPolicy, /scene-end-only Marks/);
assert.equal(report.campaignMatrix.length, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(report.phases.length, SOAK_PHASES.length);
assert.equal(report.turnScript.length, SOAK_TURN_SCRIPT.length);
assert.equal(report.commandConductScenarios.length, SOAK_COMMAND_CONDUCT_SCENARIOS.length);
assert.equal(report.endConditionScenarios.length, SOAK_END_CONDITION_SCENARIOS.length);
assert(report.checks.some((entry) => entry.id === 'playwright-import'));
assert(report.checks.some((entry) => entry.id === 'playwright-browser-control'));
assert(report.checks.some((entry) => entry.id === 'terminal-endings-live-smoke-source'));
assert(report.checks.some((entry) => entry.id === 'served-extension-freshness'));
assert(report.checks.some((entry) => entry.id === 'extension-sync-before-testing'));
assert(report.checks.some((entry) => entry.id === 'reserved-human-user'));
assert(report.checks.some((entry) => entry.id === 'live-execution-soak-user'));
assert(report.checks.some((entry) => entry.id === 'live-execution-turn-limit'));
const liveSmokeEnv = buildLiveSmokeEnvironment({ report, messageScriptPath: 'artifacts/live-script.json' });
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_BROWSER, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_GENERATION, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_LIVE_GENERATION, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_STRICT, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_WAIT_SIDECARS_EACH_TURN, '1');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_CHAT_TIMEOUT_MS, '300000');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_GENERATION_TIMEOUT_MS, '240000');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_SIDECAR_SETTLE_TIMEOUT_MS, '180000');
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_CHAT_MESSAGES_FILE, 'artifacts/live-script.json');
assert.match(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR, /smoke-chat-soak$/);
assert.equal(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_PROMPT_INSPECTION_DIR, report.artifacts.promptInspection);
assert.match(liveSmokeEnv.DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID, /breckenridge-ashes-of-peace/);
const priorExecutionUser = process.env.DIRECTIVE_SILLYTAVERN_USER;
process.env.DIRECTIVE_SILLYTAVERN_USER = 'directive-soak-z';
const overrideExecutionEnv = buildLiveSmokeEnvironment({ report, messageScriptPath: 'artifacts/live-script.json' });
assert.equal(overrideExecutionEnv.DIRECTIVE_SILLYTAVERN_USER, 'directive-soak-z');
if (priorExecutionUser === undefined) delete process.env.DIRECTIVE_SILLYTAVERN_USER;
else process.env.DIRECTIVE_SILLYTAVERN_USER = priorExecutionUser;
assert.equal(fs.existsSync('tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs'), true);

const browserProbe = await verifyPlaywrightBrowserEnvironment({ captureArtifacts: false });
assert.equal(browserProbe.ok, true, JSON.stringify(browserProbe.error || browserProbe));
assert.equal(browserProbe.interaction.resultText, '1');

const tempRoot = tempArtifactRoot();
const paths = createArtifactPaths({ rootDir: tempRoot, runId: 'prep-test' });
ensureArtifactTree(paths);
const factualCanaryIndex = writeFactualGroundingCanaryArtifacts({ packs: factualCanaryPacks, artifactPaths: paths });
const badFactCheckArtifactPath = writeFactualGroundingCheckArtifact({ check: badFactCheck, artifactPaths: paths });
const tempReport = { ...report, artifacts: paths };
const badTranscriptLines = [
  JSON.stringify({ index: 0, isUser: true, isSystem: false, text: 'Commander Arlen asks for the bridge handoff.' }),
  JSON.stringify({
    index: 1,
    isUser: false,
    isSystem: false,
    directiveOwned: true,
    responseKind: 'committedOutcome',
    text: 'Lieutenant Commander Hadrik Bronn, a 40-year-old Human officer, says the Breckenridge has been at impulse for 6 days.'
  })
].join('\n') + '\n';
writeTextFile(paths.sourceChatTranscript, badTranscriptLines);
const promptSnapshotPath = path.join(paths.promptInspection, 'pre-generation-soak-turn-01-0001.json');
writeJsonFile(promptSnapshotPath, {
  kind: 'directive.sillytavern.promptInspectionSnapshot',
  promptInspection: {
    status: 'active',
    blocks: [
      { id: 'relevant-crew', title: 'Relevant Crew Context', hash: 'crew-hash' },
      { id: 'immediate-scene', title: 'Immediate Scene', hash: 'scene-hash' },
      { id: 'ship-status', title: 'Relevant Ship Status', hash: 'ship-hash' }
    ]
  }
});
const transcriptSnapshotPath = path.join(paths.transcript, 'snapshots', '0002-turn-end-soak-turn-01.source-chat.jsonl');
writeTextFile(transcriptSnapshotPath, badTranscriptLines);
const postSmokeAudit = buildPostSmokeFactualGroundingAudit({
  report: tempReport,
  smokeSummary: {
    chatCampaign: {
      packageId: ashesCanaryPack.packageId
    }
  },
  smokeReport: {
    browser: {
      chatCampaignFlow: {
        rounds: [
          {
            scriptMessageId: 'soak-turn-01',
            promptInspection: {
              artifactPath: promptSnapshotPath
            },
            transcript: {
              snapshotSourceChatTranscript: transcriptSnapshotPath
            }
          }
        ],
        final: {
          promptInspection: {
            status: 'active',
            blocks: [
              { id: 'relevant-crew', title: 'Relevant Crew Context', hash: 'crew-hash' },
              { id: 'immediate-scene', title: 'Immediate Scene', hash: 'scene-hash' },
              { id: 'ship-status', title: 'Relevant Ship Status', hash: 'ship-hash' }
            ]
          }
        }
      }
    }
  }
});
assert.equal(postSmokeAudit.status, 'fail');
assert.equal(postSmokeAudit.perGenerationCheckCount, 1);
assert.equal(postSmokeAudit.transcriptLevelCheckCount, 1);
assert.equal(postSmokeAudit.checks.length, 2);
assert.equal(postSmokeAudit.checks[0].generatedMessageId, 'soak-turn-01');
assert.equal(postSmokeAudit.checks[0].counts.contradicted, 2);
assert.equal(postSmokeAudit.checks[0].promptAvailability.checked, true);
assert.equal(postSmokeAudit.check.counts.contradicted, 2);
assert.equal(postSmokeAudit.promptBlockCount, 3);
assert.equal(postSmokeAudit.modelAssistedReviewRequest.kind, 'directive.liveCampaignSoak.factualModelReviewRequest');
assert.equal(postSmokeAudit.modelAssistedReviewResult.status, 'not-run');
assert.match(postSmokeAudit.modelAssistedReviewRequestPathRelative, /^fact-checks\/model-assisted-review\/request\.json$/);
assert.match(postSmokeAudit.modelAssistedReviewResultPathRelative, /^fact-checks\/model-assisted-review\/result\.json$/);
assert.equal(readJsonFile(postSmokeAudit.modelAssistedReviewRequestPath).inputHash, postSmokeAudit.modelAssistedReviewRequest.inputHash);
assert(postSmokeAudit.artifactPaths.some((entry) => /fact-checks\/soak-turn-01\/fact-check\.json$/.test(entry)));
assert.match(postSmokeAudit.artifactPathRelative, /^fact-checks\/transcript-level\/fact-check\.json$/);
assert.equal(readJsonFile(postSmokeAudit.artifactPath).kind, 'directive.liveCampaignSoak.factualCheck');
writeJsonFile(paths.report, report);
appendJsonLine(paths.liveLog, { kind: 'run-start', status: 'planned' });
appendJsonLine(paths.turns, { turn: 1, status: 'planned' });
writeJsonFile(paths.transcriptIndex, { runId: 'prep-test', readableTranscript: paths.readableTranscript });
assert.equal(fs.existsSync(paths.report), true);
assert.equal(fs.readFileSync(paths.liveLog, 'utf8').trim(), JSON.stringify({ kind: 'run-start', status: 'planned' }));
assert.equal(fs.readFileSync(paths.turns, 'utf8').trim(), JSON.stringify({ turn: 1, status: 'planned' }));
assert.equal(path.basename(paths.readableTranscript), 'readable-chat.md');
assert.equal(path.basename(paths.sourceChatTranscript), 'source-chat.jsonl');
assert.equal(fs.existsSync(paths.transcriptIndex), true);
assert.equal(fs.existsSync(paths.factCanaryIndex), true);
assert.equal(readJsonFile(paths.factCanaryIndex).kind, 'directive.liveCampaignSoak.factualCanaryIndex');
assert.equal(factualCanaryIndex.packCount, SOAK_CAMPAIGN_MATRIX.length);
assert.equal(factualCanaryIndex.canaryCount, factualCanaryPacks.reduce((sum, pack) => sum + pack.canaryCount, 0));
assert.equal(fs.existsSync(factualCanaryIndex.packs[0].artifact), true);
assert.equal(fs.existsSync(badFactCheckArtifactPath), true);
assert.match(badFactCheckArtifactPath, /fact-checks[\\/]+mes-001[\\/]+fact-check\.json$/);
assert.equal(readJsonFile(badFactCheckArtifactPath).counts.contradicted, 2);

const expectedDirs = [
  'snapshots',
  'transcript',
  'screenshots',
  'playwright',
  'promptInspection',
  'storage',
  'objectiveAssignments',
  'factChecks',
  'sceneHandshake',
  'timekeeping',
  'endConditions',
  'parallelUsers',
  'discovery'
];
for (const key of expectedDirs) {
  assert.equal(fs.statSync(paths[key]).isDirectory(), true, `${key} artifact directory should exist`);
}

console.log('Live soak prep tests passed.');
