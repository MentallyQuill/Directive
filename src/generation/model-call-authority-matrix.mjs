import { GENERATION_ROLE_IDS } from './generation-roles.mjs';
import { SIDECAR_OUTPUT_SCHEMA_IDS } from '../jobs/sidecar-output-contracts.mjs';

const EMPTY = Object.freeze([]);

const MATRIX = Object.freeze({
  narration: {
    roleId: 'narration',
    providerKind: 'reasoning',
    trigger: 'Committed Mission Director outcome needs player-facing prose.',
    blocking: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/runtime/runtime-app.mjs',
    parserSchema: null,
    fallback: 'fail-retryable',
    playerVisibleOutput: 'Narration prose after mechanics commit.',
    hiddenStatePolicy: 'May use only committed/player-safe turn packets; cannot alter mechanics.',
    tests: ['test-runtime-director-turn.mjs', 'test-runtime-host-injection.mjs']
  },
  campaignIntro: {
    roleId: 'campaignIntro',
    providerKind: 'reasoning',
    trigger: 'Campaign activation posts the opening chat message.',
    blocking: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/runtime/campaign-activation-coordinator.mjs',
    parserSchema: null,
    fallback: 'local-fallback',
    playerVisibleOutput: 'Campaign introduction prose.',
    hiddenStatePolicy: 'Uses player-safe campaign setup only.',
    tests: ['test-chat-native-activation-conclusion.mjs', 'test-chat-native-runtime-flow.mjs']
  },
  campaignConclusion: {
    roleId: 'campaignConclusion',
    providerKind: 'reasoning',
    trigger: 'Campaign conclusion recap is generated after deterministic completion.',
    blocking: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/runtime/campaign-conclusion-service.mjs',
    parserSchema: null,
    fallback: 'local-fallback',
    playerVisibleOutput: 'Campaign conclusion prose.',
    hiddenStatePolicy: 'Uses committed conclusion facts only.',
    tests: ['test-chat-native-activation-conclusion.mjs', 'test-chat-native-runtime-flow.mjs']
  },
  missionDirectorAdvisor: {
    roleId: 'missionDirectorAdvisor',
    providerKind: 'reasoning',
    trigger: 'Player asks for counsel or professional assessment.',
    blocking: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/runtime/chat-turn-orchestrator.mjs',
    parserSchema: null,
    fallback: 'skip',
    playerVisibleOutput: 'Player-safe counsel text.',
    hiddenStatePolicy: 'No mechanics, no hidden facts, no durable state authority.',
    tests: ['test-chat-turn-orchestrator.mjs']
  },
  utilityTurnClassifier: {
    roleId: 'utilityTurnClassifier',
    providerKind: 'utility',
    trigger: 'Active campaign player message is not a deterministic fast path.',
    blocking: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/adjudication/utility-turn-classifier.mjs',
    parserSchema: 'directive.turnIntentClassification',
    fallback: 'deterministic',
    playerVisibleOutput: 'None; validated routing decision only.',
    hiddenStatePolicy: 'Receives player-safe context; arbitration rejects hidden-state output.',
    tests: ['test-turn-intent-classifier-fixtures.mjs', 'test-chat-turn-orchestrator.mjs']
  },
  questActionInterpreter: {
    roleId: 'questActionInterpreter',
    providerKind: 'utility',
    trigger: 'A foreground quest action must be mapped to authorized objective and method ids.',
    blocking: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/quests/action-interpreter.mjs',
    parserSchema: 'directive.questActionInterpretation',
    fallback: 'deterministic',
    playerVisibleOutput: 'None; deterministic quest services validate and apply the chosen action.',
    hiddenStatePolicy: 'Receives only authorized ids and visible context. It cannot select results or mutate state.',
    tests: ['test-open-world-model-contracts.mjs']
  },
  questArchitect: {
    roleId: 'questArchitect',
    providerKind: 'reasoning',
    trigger: 'A grounded narrative thread qualifies for quest promotion.',
    blocking: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/quests/quest-architect.mjs',
    parserSchema: 'directive.questArchitectureProposal',
    fallback: 'deterministic',
    playerVisibleOutput: 'None directly; deterministic registration creates any quest template and instance.',
    hiddenStatePolicy: 'May reference only supplied facts, actors, locations, factions, assets, and source anchors. Registration is deterministic.',
    tests: ['test-open-world-dynamic-quest-e2e.mjs', 'test-open-world-model-contracts.mjs']
  },
  sceneDeltaExtractor: {
    roleId: 'sceneDeltaExtractor',
    providerKind: 'utility',
    trigger: 'A committed player/assistant exchange is converted to grounded observations.',
    blocking: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/threads/scene-delta-extractor.mjs',
    parserSchema: 'directive.sceneDelta',
    fallback: 'deterministic',
    playerVisibleOutput: 'None directly; extracted observations remain evidence until deterministic processors apply them.',
    hiddenStatePolicy: 'Every observation requires a source message id or quoted evidence. It cannot commit state.',
    tests: ['test-open-world-dynamic-quest-e2e.mjs', 'test-open-world-model-contracts.mjs']
  },
  sceneReconciliationExtractor: {
    roleId: 'sceneReconciliationExtractor',
    providerKind: 'utility',
    trigger: 'Changed chat chunks require bounded reconciliation proposals.',
    blocking: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/runtime/scene-reconciliation.mjs',
    parserSchema: 'directive.sceneReconciliationObservations',
    fallback: 'deterministic',
    playerVisibleOutput: 'None directly; accepted proposals still pass state validation and revision checks.',
    hiddenStatePolicy: 'Chat text is evidence only. Accepted proposals still pass state validation and revision checks.',
    tests: ['test-scene-reconciliation.mjs', 'test-scene-reconciliation-open-world.mjs', 'test-open-world-model-contracts.mjs']
  },
  relationshipEvaluator: {
    roleId: 'relationshipEvaluator',
    providerKind: 'utility',
    trigger: 'Committed turn may affect crew relationships.',
    blocking: false,
    mayProposeState: true,
    mayInjectPrompt: false,
    allowedRoots: Object.freeze(['relationships', 'crew']),
    owningModule: 'src/jobs/campaign-sidecar-scheduler.mjs',
    parserSchema: SIDECAR_OUTPUT_SCHEMA_IDS.stateDeltaProposal,
    fallback: 'journal-only',
    playerVisibleOutput: 'None directly; proposal-only state deltas.',
    hiddenStatePolicy: 'Proposal roots are allowlisted and revalidated by the state gateway.',
    tests: ['test-campaign-sidecar-scheduler.mjs']
  },
  commandBearingEvaluator: {
    roleId: 'commandBearingEvaluator',
    providerKind: 'utility',
    trigger: 'Committed turn may contain command-style signal.',
    blocking: false,
    mayProposeState: true,
    mayInjectPrompt: false,
    allowedRoots: Object.freeze(['commandStyle', 'commandCulture']),
    owningModule: 'src/jobs/campaign-sidecar-scheduler.mjs',
    parserSchema: SIDECAR_OUTPUT_SCHEMA_IDS.stateDeltaProposal,
    fallback: 'journal-only',
    playerVisibleOutput: 'None directly; Command Bearing authority remains deterministic.',
    hiddenStatePolicy: 'May propose journal/culture deltas only through allowlisted roots.',
    tests: ['test-campaign-sidecar-scheduler.mjs', 'test-command-bearing.mjs']
  },
  promptContextBuilder: {
    roleId: 'promptContextBuilder',
    providerKind: 'utility',
    trigger: 'Prompt context needs compact player-safe assistance.',
    blocking: false,
    mayProposeState: false,
    mayInjectPrompt: true,
    allowedRoots: EMPTY,
    owningModule: 'src/generation/player-safe-prompt-context-builder.mjs',
    parserSchema: null,
    fallback: 'deterministic',
    playerVisibleOutput: 'None; host prompt blocks only.',
    hiddenStatePolicy: 'Prompt builder is allowlisted and player-safe.',
    tests: ['test-player-safe-prompt-context.mjs', 'test-prompt-injection-safety.mjs']
  },
  continuityTracker: {
    roleId: 'continuityTracker',
    providerKind: 'utility',
    trigger: 'Committed turn may require continuity notes or known-fact cleanup.',
    blocking: false,
    mayProposeState: true,
    mayInjectPrompt: false,
    allowedRoots: Object.freeze(['continuity', 'mission']),
    owningModule: 'src/jobs/campaign-sidecar-scheduler.mjs',
    parserSchema: SIDECAR_OUTPUT_SCHEMA_IDS.stateDeltaProposal,
    fallback: 'journal-only',
    playerVisibleOutput: 'None directly; proposal-only continuity deltas.',
    hiddenStatePolicy: 'Allowed roots only; stale revisions are rejected.',
    tests: ['test-campaign-sidecar-scheduler.mjs']
  },
  crewDirector: {
    roleId: 'crewDirector',
    providerKind: 'utility',
    trigger: 'Committed turn may affect crew condition or assignments.',
    blocking: false,
    mayProposeState: true,
    mayInjectPrompt: false,
    allowedRoots: Object.freeze(['crew']),
    owningModule: 'src/jobs/campaign-sidecar-scheduler.mjs',
    parserSchema: SIDECAR_OUTPUT_SCHEMA_IDS.stateDeltaProposal,
    fallback: 'journal-only',
    playerVisibleOutput: 'None directly; proposal-only crew deltas.',
    hiddenStatePolicy: 'Allowed crew root only; no direct narration authority.',
    tests: ['test-campaign-sidecar-scheduler.mjs']
  },
  shipDirector: {
    roleId: 'shipDirector',
    providerKind: 'utility',
    trigger: 'Committed turn may affect ship condition or systems.',
    blocking: false,
    mayProposeState: true,
    mayInjectPrompt: false,
    allowedRoots: Object.freeze(['ship']),
    owningModule: 'src/jobs/campaign-sidecar-scheduler.mjs',
    parserSchema: SIDECAR_OUTPUT_SCHEMA_IDS.stateDeltaProposal,
    fallback: 'journal-only',
    playerVisibleOutput: 'None directly; proposal-only ship deltas.',
    hiddenStatePolicy: 'Allowed ship root only; no mechanics authority.',
    tests: ['test-campaign-sidecar-scheduler.mjs']
  },
  commandLogSummarizer: {
    roleId: 'commandLogSummarizer',
    providerKind: 'utility',
    trigger: 'Committed Command Log entry needs compact player-facing summary.',
    blocking: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/jobs/command-log-summary-sidecar.mjs',
    parserSchema: SIDECAR_OUTPUT_SCHEMA_IDS.commandLogSummary,
    fallback: 'skip',
    playerVisibleOutput: 'Command Log assisted summary.',
    hiddenStatePolicy: 'Committed player-visible state only; schema rejects hidden-state language.',
    tests: ['test-command-log-summary-sidecar.mjs']
  },
  recapSummarizer: {
    roleId: 'recapSummarizer',
    providerKind: 'utility',
    trigger: 'Compact recap generation.',
    blocking: false,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/runtime/campaign-conclusion-service.mjs',
    parserSchema: null,
    fallback: 'defer',
    playerVisibleOutput: 'Player-facing recap text or structured recap.',
    hiddenStatePolicy: 'Committed/player-safe state only.',
    tests: ['test-chat-native-activation-conclusion.mjs']
  },
  directiveAssist: {
    roleId: 'directiveAssist',
    providerKind: 'reasoning',
    trigger: 'User invokes Directive Assist rewrite/inspection.',
    blocking: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/assist/directive-assist.mjs',
    parserSchema: 'directive.assistResponse',
    fallback: 'fail-retryable',
    playerVisibleOutput: 'Assist replacement text and warnings.',
    hiddenStatePolicy: 'No campaign hidden state authority.',
    tests: ['test-directive-assist.mjs']
  },
  characterCreatorSectionDraft: {
    roleId: 'characterCreatorSectionDraft',
    providerKind: 'reasoning',
    trigger: 'Character Creator requests a section draft.',
    blocking: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/creators/character-creator-assist.mjs',
    parserSchema: 'directive.characterCreatorSectionDraft',
    fallback: 'local-fallback',
    playerVisibleOutput: 'Creator draft text.',
    hiddenStatePolicy: 'No gameplay hidden state; draft output only.',
    tests: ['test-character-creator-assist.mjs']
  },
  utilityJson: {
    roleId: 'utilityJson',
    providerKind: 'utility',
    trigger: 'Generic low-cost structured JSON helper.',
    blocking: true,
    mayProposeState: false,
    mayInjectPrompt: false,
    allowedRoots: EMPTY,
    owningModule: 'src/hosts/sillytavern/provider-client.mjs',
    parserSchema: null,
    fallback: 'fail-retryable',
    playerVisibleOutput: 'Caller-owned structured output.',
    hiddenStatePolicy: 'Caller must supply player-safe input and validate output.',
    tests: ['test-directive-provider-routing.mjs', 'test-sillytavern-generation-client.mjs']
  }
});

export const MODEL_CALL_AUTHORITY_MATRIX = MATRIX;

export function authorityForRole(roleId) {
  const entry = MATRIX[roleId];
  if (!entry) throw new Error(`Unknown model-call authority role "${roleId}".`);
  return {
    ...entry,
    allowedRoots: [...entry.allowedRoots],
    tests: [...entry.tests]
  };
}

export function listModelCallAuthorityMatrix() {
  return GENERATION_ROLE_IDS.map(authorityForRole);
}

export function allowedRootsForModelRole(roleId) {
  return authorityForRole(roleId).allowedRoots;
}
