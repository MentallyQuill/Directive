import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_DIRECTIVE_EXTENSION_PATH,
  DEFAULT_SOAK_ARTIFACT_ROOT,
  PLAYWRIGHT_SELECTOR_GUIDANCE,
  PLAYWRIGHT_VIEWPORTS,
  appendJsonLine,
  authenticateSillyTavernUser,
  cloneJson,
  compact,
  compareServedExtension,
  createArtifactPaths,
  createRunId,
  ensureDirectory,
  ensureArtifactTree,
  errorSummary,
  loadPlaywright,
  normalizeBaseUrl,
  normalizeExtensionPath,
  verifyPlaywrightBrowserEnvironment,
  writeJsonFile,
  writeTextFile
} from './lib/sillytavern-live-harness.mjs';
import {
  buildFactualGroundingCanaryPacks,
  summarizeFactualGroundingCanaryPacks,
  writeFactualGroundingCanaryArtifacts
} from './lib/factual-grounding-canaries.mjs';
import {
  buildFactualGroundingCheck,
  buildModelAssistedFactualReviewRequest,
  buildModelAssistedFactualReviewResult,
  factualGroundingLiveLogRecord,
  promptBlocksFromInspection,
  writeFactualGroundingCheckArtifact,
  writeModelAssistedFactualReviewRequestArtifact,
  writeModelAssistedFactualReviewResultArtifact
} from './lib/factual-grounding-evaluator.mjs';

const args = new Set(process.argv.slice(2));
const HELP = args.has('--help') || args.has('-h');
const WRITE_ARTIFACTS = args.has('--write-artifacts')
  || process.env.DIRECTIVE_SOAK_WRITE_ARTIFACTS === '1'
  || (process.env.DIRECTIVE_LIVE_CAMPAIGN_SOAK === '1' && !args.has('--dry-run') && !args.has('--no-write'));
const LIVE_PREFLIGHT = args.has('--live-preflight') || process.env.DIRECTIVE_SOAK_LIVE_PREFLIGHT === '1';
const LIVE_EXECUTION = process.env.DIRECTIVE_LIVE_CAMPAIGN_SOAK === '1' && !args.has('--dry-run');
const STRICT_WARNING_FAILURE = args.has('--strict')
  || process.env.DIRECTIVE_SOAK_STRICT === '1'
  || process.env.DIRECTIVE_LIVE_CAMPAIGN_SOAK_STRICT === '1';
const REQUIRE_PLAYWRIGHT = LIVE_EXECUTION || LIVE_PREFLIGHT || process.env.DIRECTIVE_REQUIRE_PLAYWRIGHT === '1';
const VERIFY_PLAYWRIGHT_BROWSER = process.env.DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK !== '1';
const HEADLESS = process.env.DIRECTIVE_SILLYTAVERN_HEADLESS !== '0';
const RUN_ID = process.env.DIRECTIVE_SOAK_RUN_ID || createRunId();
const BASE_URL = normalizeBaseUrl(process.env.SILLYTAVERN_BASE_URL || process.env.ST_BASE_URL || '');
const EXTENSION_PATH = normalizeExtensionPath(process.env.DIRECTIVE_SILLYTAVERN_EXTENSION_PATH || DEFAULT_DIRECTIVE_EXTENSION_PATH);
const ARTIFACT_ROOT = process.env.DIRECTIVE_SOAK_ARTIFACT_DIR || DEFAULT_SOAK_ARTIFACT_ROOT;
const EXTENSION_SYNC_ACK = process.env.DIRECTIVE_CONFIRM_EXTENSION_SYNCED === '1';
const SOAK_TURN_LIMIT = positiveInteger(process.env.DIRECTIVE_SOAK_TURN_LIMIT, 0);
const SCHEMA_PATH = 'schemas/testing/live-campaign-soak-report.schema.json';
const RESERVED_HUMAN_ONLY_USERS = new Set(['default-user']);

function positiveInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeUserHandle(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function envPasswordKey(handle) {
  const suffix = String(handle || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return suffix ? `DIRECTIVE_SOAK_ST_PASSWORD_${suffix}` : null;
}

function configuredSoakUsers() {
  const raw = String(process.env.DIRECTIVE_SOAK_ST_USERS || process.env.DIRECTIVE_PARALLEL_SOAK_USERS || '').trim();
  if (!raw) return [];
  let entries = [];
  if (raw.startsWith('[')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    entries = parsed;
  } else {
    entries = raw.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return entries.map((entry) => {
    if (typeof entry === 'string') {
      const colon = entry.indexOf(':');
      const handle = normalizeUserHandle(colon > 0 ? entry.slice(0, colon) : entry);
      const key = envPasswordKey(handle);
      return {
        handle,
        password: colon > 0 ? entry.slice(colon + 1) : process.env[key] || process.env.DIRECTIVE_SOAK_ST_PASSWORD || ''
      };
    }
    const handle = normalizeUserHandle(entry?.handle || entry?.username || entry?.user || '');
    const key = envPasswordKey(handle);
    return handle
      ? { handle, password: entry?.password || process.env[key] || process.env.DIRECTIVE_SOAK_ST_PASSWORD || '' }
      : null;
  }).filter(Boolean);
}

function firstConfiguredSoakUser() {
  const users = configuredSoakUsers();
  return users.find((entry) => !RESERVED_HUMAN_ONLY_USERS.has(entry.handle)) || null;
}

function explicitExecutionUser() {
  const handle = normalizeUserHandle(process.env.DIRECTIVE_SILLYTAVERN_USER || '');
  if (!handle) return null;
  const key = envPasswordKey(handle);
  return {
    handle,
    password: process.env.DIRECTIVE_SILLYTAVERN_PASSWORD || process.env[key] || process.env.DIRECTIVE_SOAK_ST_PASSWORD || '',
    source: 'DIRECTIVE_SILLYTAVERN_USER'
  };
}

function liveExecutionUser() {
  return explicitExecutionUser() || firstConfiguredSoakUser();
}

function reservedConfiguredUsers() {
  const users = configuredSoakUsers();
  const explicit = explicitExecutionUser();
  if (explicit) users.push(explicit);
  const seen = new Set();
  return users.filter((entry) => {
    if (!RESERVED_HUMAN_ONLY_USERS.has(entry.handle) || seen.has(entry.handle)) return false;
    seen.add(entry.handle);
    return true;
  });
}

function reservedHumanUserCheck() {
  const reserved = reservedConfiguredUsers();
  return check(
    'reserved-human-user',
    reserved.length === 0 ? 'pass' : 'fail',
    reserved.length === 0
      ? 'No human-only SillyTavern account is assigned to automated soak work.'
      : 'Remove human-only SillyTavern accounts from automated soak user configuration.',
    reserved.length === 0 ? null : { reservedHandles: reserved.map((entry) => entry.handle) }
  );
}

export const SOAK_LIVE_LOG_POLICY = Object.freeze({
  artifact: 'live-log.jsonl',
  appendOnly: true,
  flushAfterEveryRecord: true,
  partialRunProofRequired: true,
  updateCadence: 'append before and after every live action, mutation, checkpoint, warning, failure, and phase transition',
  recordKinds: Object.freeze([
    'run-start',
    'preflight-check',
    'extension-sync',
    'extension-sync-barrier',
    'parallel-user',
    'patch-lane',
    'triage-finding',
    'fix-deferred',
    'fix-barrier',
    'campaign-matrix-check',
    'campaign-start',
    'phase-start',
    'phase-end',
    'turn-start',
    'turn-end',
    'assist-action',
    'model-call',
    'fact-check',
    'model-assisted-factual-review',
    'objective-assignment-projection-check',
    'scene-handshake-settlement',
    'timekeeping-header-check',
    'command-bearing-interval',
    'command-bearing-evidence',
    'command-bearing-closure',
    'command-bearing-review',
    'command-bearing-spend',
    'command-bearing-abuse-check',
    'crew-surface-check',
    'mission-surface-check',
    'relationship-delta-check',
    'message-mutation',
    'message-action',
    'reconciliation',
    'misconduct-probe',
    'discipline-escalation',
    'conduct-recovery',
    'checkpoint',
    'transcript-capture',
    'prompt-inspection-capture',
    'end-condition',
    'save-load',
    'quality-score',
    'artifact',
    'warning',
    'failure',
    'operator-stop',
    'run-end'
  ])
});

export const SOAK_TURN_SETTLEMENT_POLICY = Object.freeze({
  required: true,
  nonTerminalIngressStatuses: Object.freeze(['classifying', 'classified']),
  acceptedTurnEvidence: Object.freeze([
    'committed-ingress-with-turnId-outcomeId-responseMessageId-and-response-ledger-entry',
    'visible-pause-or-clarification-with-pending-interaction-and-posted-Directive-response',
    'routine-counsel-or-no-change-path-with-posted-Directive-response-or-response-ledger-record',
    'committed-injectAndContinue-routine-or-no-change-with-delegated-hostGeneration-response-ledger-entry-and-assistant-continuation',
    'recoveryRequired-ingress-with-chatTurnProcessingFailure-record-and-lane-paused',
    'stale-edited-deleted-message-with-reconciliation-or-recovery-record'
  ]),
  nextTurnGate: 'the runner must not send the next scripted player message while the latest ingress is classifying or classified',
  failurePolicy: 'classified/classifying without response, outcome, delegated hostGeneration continuation, pause, stale reconciliation, or recovery after the live wait window is a P1 turn-settlement failure',
  recoveryPolicy: 'pause the lane, append live-log evidence, and reobserve/reload only under coordinator control'
});

export const SOAK_SCENE_HANDSHAKE_POLICY = Object.freeze({
  required: true,
  ownerLanes: Object.freeze(['canonical-long-campaign', 'mutation-reconciliation', 'multi-campaign-matrix']),
  modelRoles: Object.freeze(['sceneHandshakeSettler']),
  intervalLogRecord: 'scene-handshake-settlement',
  allowedRoots: Object.freeze([
    'mission.openAssignments',
    'commandLog.entries',
    'ship.technicalDebt',
    'threadLedger.records'
  ]),
  certificationGates: Object.freeze([
    'accepted-host-native-assignment-commits-allowlisted-state',
    'rejected-or-corrected-assistant-beat-does-not-auto-commit',
    'idempotency-prevents-duplicate-settlement-on-reobserve',
    'selected-swipe-edit-delete-and-stale-source-handling-preserve-authority',
    'save-load-save-as-wrong-chat-and-wrong-save-isolate-settlement',
    'prompt-rebuild-happens-before-current-player-classification',
    'command-bearing-terminal-formal-objective-and-hidden-state-roots-are-not-mutated'
  ]),
  minimumEvidence: Object.freeze([
    'accepted-assignment-settlement-with-open-assignments-and-log-entry',
    'no-commit-rejection-or-correction',
    'duplicate-guard-check',
    'selected-swipe-or-edit-delete-source-check',
    'save-load-or-save-as-persistence-check',
    'wrong-chat-or-wrong-save-no-mutation-check',
    'sanitized-sceneHandshakeSettler-model-call',
    'no-command-bearing-terminal-hidden-root-mutation-proof'
  ]),
  stateInspection: Object.freeze([
    'sceneHandshake-settled-deferred-internal-review-counts',
    'source-message-ids-hashes-selected-swipe-and-idempotency-key',
    'mission-openAssignments-commandLog-ship-technicalDebt-threadLedger-deltas',
    'prompt-revision-before-after-settlement',
    'current-player-classification-after-settlement',
    'sidecar-scheduling-after-settlement-revision'
  ]),
  failureSeverityPolicy: 'P1 for settlement from rejected/corrected/stale/wrong-chat/wrong-save sources, duplicate commits, prompt rebuild ordering failure, or mutation outside allowlisted roots; P2 for non-blocking wording/projection/artifact gaps with correct state.',
  hiddenStatePolicy: 'Scene Handshake prompts, logs, visible surfaces, and artifacts must not expose hidden crew memory, raw relationship values, private NPC thoughts, hidden clocks, terminal predicates, Command Bearing evaluator reasoning, or provider prompt bodies.'
});

export const SOAK_TIMEKEEPING_POLICY = Object.freeze({
  required: true,
  artifactDirectory: 'timekeeping',
  intervalLogRecord: 'timekeeping-header-check',
  expectedHeaderPattern: '*Stardate #####.# | HHMM hours*',
  requiredSurfaces: Object.freeze([
    'campaign-intro',
    'directive-posted-committed-outcome',
    'pause-or-clarification',
    'terminal-checkpoint',
    'campaign-conclusion',
    'directive-owned-swipe',
    'outcome-integrity-edit',
    'host-native-injectAndContinue'
  ]),
  certificationGates: Object.freeze([
    'directive-owned-replies-prefix-exact-current-header',
    'host-native-replies-follow-reply-header-prompt-and-preset',
    'stale-leading-headers-are-replaced-not-stacked',
    'headers-are-stripped-from-model-and-evidence-paths',
    'ordinary-chat-turns-do-not-advance-time-by-themselves',
    'deterministic-time-boundaries-update-state-before-header-changes',
    'save-load-branch-and-cross-campaign-switches-use-active-save-header',
    'installed-preset-version-includes-reply-header-contract'
  ]),
  stateInspection: Object.freeze([
    'expected-header-from-campaign-state',
    'visible-latest-assistant-header',
    'campaign-currentStardate-worldState-currentStardate-and-ship-minute-source',
    'reply-header-prompt-block-hash-and-revision',
    'preset-version-and-status',
    'stale-header-strip-result-and-duplicate-header-count'
  ]),
  failureSeverityPolicy: 'P1 when visible headers contradict authoritative state, duplicate stale headers accumulate, prior headers pollute evidence/model paths, or time advances without a deterministic state commit; P2 for host-native cosmetic header omission with preserved state and prompt/preset diagnostics.'
});

export const SOAK_READABLE_TRANSCRIPT_POLICY = Object.freeze({
  required: true,
  artifactDirectory: 'transcript',
  readableArtifact: 'transcript/readable-chat.md',
  sourceArtifact: 'transcript/source-chat.jsonl',
  indexArtifact: 'transcript/index.json',
  excerptsArtifact: 'transcript/excerpts.md',
  scope: 'player-visible SillyTavern chat only: user posts, Directive-visible replies, terminal checkpoint posts, and visible message-action outcomes',
  captureCadence: 'capture or refresh after each accepted turn, message mutation, checkpoint, terminal decision, campaign switch, operator stop, and run end',
  hiddenStatePolicy: 'never include API keys, cookies, CSRF tokens, hidden campaign truth, raw prompt bodies, hidden clocks, raw relationship values, or Director-only reasoning'
});

export const SOAK_PLAYER_INPUT_POLICY = Object.freeze({
  required: true,
  style: 'compelling in-character roleplay prose and dialogue from an engaged player, with clear actionable intent embedded in natural scene writing',
  pointOfView: 'third-person player-character prose is the default and preferred Directive play style for certification; first-person is compatibility-only evidence',
  defaultPerspective: 'third-person',
  firstPersonExceptionPolicy: 'first-person player input must be labeled as a compatibility or robustness sub-test and must not count as preferred-play story-quality certification',
  narrationDetectionPolicy: 'the live runner logs declared perspective, detected perspective, preferred-play evidence eligibility, and first-person narration warnings; first-person dialogue inside quoted character speech remains compatible with third-person narration',
  agencyBoundary: 'the player may describe their own words, posture, observations, orders, doubts, and attempted actions, but must not author NPC speech, NPC decisions, hidden truth, mechanical outcomes, or plot resolution as fact',
  adversarialStyle: 'authority attacks, bad-guy play, prompt injection, and god-mode attempts should still read like plausible dramatic roleplay instead of sterile test commands',
  maximumVisibleMetaTesting: 'avoid visible labels like test turn, rubric, expected result, or assertion in the chat unless the scenario is explicitly testing prompt/system override resistance',
  qualityDimensions: Object.freeze([
    'third-person perspective compliance',
    'character voice',
    'sensory grounding',
    'dialogue quality',
    'emotional stakes',
    'mission clarity',
    'actionability',
    'continuity awareness',
    'player-agency discipline'
  ])
});

export const SOAK_FACTUAL_GROUNDING_POLICY = Object.freeze({
  required: true,
  artifactDirectory: 'fact-checks',
  packIndexArtifact: 'fact-checks/canary-index.json',
  liveLogRecord: 'fact-check',
  intervalTurns: '5-10',
  evaluationPhases: Object.freeze([
    'prompt-availability-audit',
    'generation-verdict'
  ]),
  canaryCategories: Object.freeze([
    'opening-premise',
    'senior-crew-identity',
    'current-location-time',
    'player-billet',
    'active-mission-frame',
    'ship-or-venue-facts',
    'campaign-specific-terms',
    'cross-campaign-isolation'
  ]),
  verdicts: Object.freeze([
    'respected',
    'omitted',
    'unsupported-detail',
    'contradicted',
    'not-applicable'
  ]),
  severityLevels: Object.freeze([
    'P1 factual blocker',
    'P1 prompt blocker',
    'P2 factual warning',
    'P3 quality note'
  ]),
  rootCauseLabels: Object.freeze([
    'prompt-missing',
    'prompt-overcompressed',
    'prompt-ordering',
    'retrieval-miss',
    'package-data-gap',
    'projection-gap',
    'model-ignored-available-fact',
    'cross-campaign-bleed',
    'stale-save-state',
    'unknown'
  ]),
  certificationGates: Object.freeze([
    'player-safe-canary-pack-is-present-before-live-generation',
    'prompt-availability-is-recorded-before-generation-judgment',
    'visible-generation-preserves-required-opening-and-current-state-canaries',
    'first-appearance-senior-crew-identity-is-fact-checked',
    'multi-campaign-short-canaries-prove-package-specific-facts-and-isolation',
    'contradictions-are-root-caused-to-prompt-availability-or-model-compliance'
  ]),
  minimumEvidence: Object.freeze([
    'fact-canary-pack-id-and-hash',
    'source-package-or-state-pointer-for-each-fact-id',
    'prompt-block-id-or-availability-status-for-each-required-fact',
    'generated-message-id-and-transcript-pointer',
    'verdict-severity-root-cause-and-confidence',
    'contradiction-or-unsupported-detail-summary',
    'player-safe-evaluator-input-and-output-when-model-assisted'
  ]),
  stateInspection: Object.freeze([
    'campaign-package-id-title-and-version',
    'active-save-id-chat-id-and-prompt-context-revision',
    'mission-current-location-time-and-active-frame',
    'crew-public-identity-and-role-projection-hashes',
    'prompt-availability-block-hashes',
    'visible-reply-text-hash-and-transcript-index'
  ]),
  hiddenStatePolicy: 'fact checks must use only player-safe canary facts and visible transcript excerpts; never include hidden campaign truth, raw relationship values, hidden pressure values, hidden clocks, Director-only notes, raw prompt bodies, provider reasoning, API keys, cookies, or CSRF tokens.',
  failureSeverityPolicy: 'P1 when visible generations contradict available major player-safe canaries or required canaries are absent from prompt availability proof; P2 for minor unsupported details that do not change identity, timeline, authority, mission state, or later player decisions; P3 for logged quality notes.'
});

export const SOAK_UI_STATE_SURFACE_POLICY = Object.freeze({
  required: true,
  surfaces: Object.freeze([
    Object.freeze({
      id: 'crew-character-tab',
      route: 'Crew / Character',
      expectation: 'selecting or focusing a crew member opens a populated character surface with campaign-appropriate public role, state, recent interaction context, and player-safe relationship perception when available'
    }),
    Object.freeze({
      id: 'crew-roster-pressures',
      route: 'Crew / Crew Roster',
      expectation: 'the roster populates campaign crew members and shows player-safe current pressures or stressors without raw hidden pressure values'
    }),
    Object.freeze({
      id: 'crew-relationship-deltas',
      route: 'Crew state snapshot plus player-safe projection',
      expectation: 'player interactions that should affect a crew relationship create behind-the-curtain state movement and a safe visible perception when appropriate, without exposing raw relationship scores or private thoughts'
    }),
    Object.freeze({
      id: 'mission-drawer-updates',
      route: 'Mission drawer',
      expectation: 'Mission drawer cards, active pressure, pending interactions, objectives, warnings, and recent consequences update after Mission Director outcomes, reconciliations, branch loads, and terminal decisions'
    })
  ]),
  intervalTurns: '5-10',
  checkpointCadence: 'capture after activation, then at 5-10 player-turn intervals, with extra captures after objective or assignment creation, crew-focused interactions, Mission Director commitments, reconciliation/recalculation, save/load, and terminal decisions',
  evidence: Object.freeze([
    'desktop and phone screenshots',
    'visible text summaries with hashes',
    'bounded campaign-state snapshot roots',
    'sidecar and relationship journal counts',
    'mission revision or prompt-context revision',
    'transcript pointers for the triggering player interaction'
  ]),
  hiddenStatePolicy: 'raw relationship values, raw pressure values, private NPC thoughts, hidden clocks, and Director-only reasoning must stay out of normal UI, chat, live-log previews, and readable transcripts'
});

export const SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY = Object.freeze({
  required: true,
  artifactDirectory: 'objective-assignments',
  liveLogRecord: 'objective-assignment-projection-check',
  triggerSources: Object.freeze([
    'scene-handshake-accepted-assignment',
    'mission-director-assigned-objective',
    'side-work-open-order-selected',
    'scene-reconciliation-assignment-repair'
  ]),
  requiredSurfaces: Object.freeze([
    Object.freeze({
      id: 'mission-current-orders',
      route: 'Mission / Active or Mission / Side Work',
      expectation: 'Mission shows newly accepted current orders or open assignments with useful titles, summaries, status, source context, and no object-rendering artifacts'
    }),
    Object.freeze({
      id: 'command-log-entry',
      route: 'Log / Command History',
      expectation: 'Log gains a source-backed player-facing entry for the accepted assignment, not a generic transcript summary or hidden Director note'
    }),
    Object.freeze({
      id: 'crew-character-link',
      route: 'Crew / Character',
      expectation: 'each linked crew member dossier or selected character surface reflects the public assignment/thread context when the assignment names or affects that crew member'
    }),
    Object.freeze({
      id: 'crew-roster-link',
      route: 'Crew / Crew Roster',
      expectation: 'Crew roster pressure or status summaries remain populated and reflect relevant assignment pressure without raw hidden values'
    })
  ]),
  checkpointCadence: 'capture immediately after any accepted objective/assignment source, then verify persistence at the next 5-10 turn interval and after save/load or branch switches',
  certificationGates: Object.freeze([
    'accepted-assignment-state-projects-to-mission-log-and-linked-crew',
    'state-root-and-visible-surface-counts-match-with-source-hash',
    'no-object-object-empty-card-or-stale-wrong-campaign-projection',
    'linked-crew-projections-stay-player-safe-and-do-not-leak-hidden-state',
    'save-load-save-as-and-cross-campaign-switch-preserve-or-isolate-visible-projections',
    'edit-delete-swipe-and-reconciliation-invalidate-or-rebase-anchored-projections'
  ]),
  minimumEvidence: Object.freeze([
    'objective-assignment-source-transcript-pointer',
    'mission-current-orders-visible-excerpt-and-screenshot',
    'command-log-visible-excerpt-and-entry-id',
    'linked-crew-character-or-roster-visible-excerpt-and-screenshot',
    'bounded-save-state-snapshot-for-mission-commandLog-crew-thread-roots',
    'save-load-or-branch-persistence-check',
    'wrong-chat-or-cross-campaign-no-projection-check'
  ]),
  stateInspection: Object.freeze([
    'mission-openAssignments-or-currentOrders-counts-and-source-hashes',
    'commandLog-entry-count-sourceIds-and-summary-hashes',
    'linkedCrewIds-threadIds-and-playerSafeCrewProjection-hashes',
    'promptContextRevision-and-active-chat-save-binding',
    'visible-mission-log-crew-text-hashes-and-screenshot-paths',
    'stale-invalidated-or-rebased-projection-records-after-edit-delete'
  ]),
  failureSeverityPolicy: 'P1 when accepted assigned work exists in state but Mission, Log, or linked Crew projections stay blank/stale/wrong-campaign, show [object Object], or lose source provenance; P2 when only wording quality is weak but state, source, and surface linkage are correct.',
  hiddenStatePolicy: 'Objective assignment projection checks must log player-safe excerpts only and must not expose hidden relationship values, hidden pressure values, private crew thoughts, raw prompt text, or provider outputs.'
});

export const SOAK_COMMAND_BEARING_SYSTEM_POLICY = Object.freeze({
  required: true,
  intervalTurns: '5-10',
  ownerLane: 'end-conditions-command-bearing',
  modelRoles: Object.freeze([
    'commandBearingFitChecker',
    'commandBearingSpendValidator',
    'commandBearingEvaluator'
  ]),
  certificationGates: Object.freeze([
    'evidence-accumulates-only-after-committed-outcomes',
    'boundary-detection-separates-scene-pacing-from-durable-closure',
    'mark-review-grades-agency-commitment-causality-track-fit-and-distinctness',
    'rank-and-reserve-math-survives-review-replay-and-save-load',
    'point-lifecycle-is-scoped-auditable-and-never-a-reroll',
    'player-safe-projection-excludes-hidden-state-and-evaluator-reasoning'
  ]),
  certificationSchedule: Object.freeze([
    'baseline-false-positives',
    'inspiration-evidence-arc',
    'resolve-evidence-arc',
    'mixed-and-failed-evidence',
    'scene-end-non-closure',
    'thread-or-quest-closure',
    'chapter-arc-or-milestone-closure',
    'mark-review-grading',
    'rank-and-point-progression',
    'point-ready-cancel-return-spend',
    'post-commit-robustness'
  ]),
  intervalPlaybook: Object.freeze([
    'baseline-professional-play-no-evidence',
    'inspiration-arc-with-related-committed-interactions',
    'resolve-arc-with-risk-cost-or-boundary',
    'closure-probe-with-scene-end-non-closure-and-durable-closure-check',
    'mark-review-after-proven-closure-or-labeled-fixture',
    'point-lifecycle-after-organic-or-labeled-fixture-availability',
    'recovery-after-evidence-review-or-spend'
  ]),
  intervalLogRecord: 'command-bearing-interval',
  minimumEvidence: Object.freeze([
    'routine-play-no-evidence-check',
    'inspiration-evidence-or-defensible-rejection',
    'resolve-evidence-or-defensible-rejection',
    'closure-record-with-no-review',
    'closure-record-that-queues-or-rejects-review',
    'mark-review-result',
    'duplicate-review-or-replay-guard',
    'assist-and-character-projection-point-display',
    'ready-cancel-check',
    'returned-point-or-no-spend-check',
    'valid-spend-or-logged-blocker',
    'save-load-after-command-bearing-change',
    'retcon-touching-command-bearing-source'
  ]),
  fixtureBranchPolicy: 'fixture-backed marks, points, or closure boundaries are allowed only when clearly logged as non-organic proof; release-candidate confidence still needs organic evidence plus organic closure or no-closure proof',
  closureProofLevels: Object.freeze([
    'scene-end-is-pacing-only-and-never-mark-review-proof',
    'thread-closure-requires-durable-thread-state',
    'quest-or-chapter-closure-requires-ledger-resolution-and-relevant-evidence',
    'arc-milestone-or-command-crucible-closure-requires-durable-high-level-closure-id',
    'ambiguous-utility-closure-suggestion-does-not-award'
  ]),
  boundaryDetectionLadder: Object.freeze([
    'scene-beat-prompt-refresh-without-mark-review',
    'evidence-without-closure-records-source-but-does-not-review',
    'thread-closure-queues-relevant-evidence-only',
    'quest-or-chapter-closure-queues-one-relevant-review',
    'milestone-or-arc-closure-uses-durable-high-level-closure-id',
    'retconned-closure-enters-explicit-recovery-or-review-required'
  ]),
  markReviewGates: Object.freeze([
    'agency-required',
    'commitment-required',
    'causality-required',
    'track-fit-required',
    'distinct-decision-and-closure-required-for-repeat-or-dual-awards',
    'hidden-state-redaction-required'
  ]),
  evidenceAccumulation: Object.freeze([
    'strong-inspiration-evidence-after-committed-outcome',
    'strong-resolve-evidence-after-committed-outcome',
    'mixed-evidence-with-one-primary-signal',
    'costly-or-failed-action-can-still-create-evidence',
    'routine-competence-creates-no-evidence',
    'player-authored-reward-claim-creates-no-evidence'
  ]),
  closureDetection: Object.freeze([
    'scene-end-does-not-imply-arc-or-chapter-closure',
    'thread-closure-after-repeated-interactions',
    'chapter-or-quest-resolution-closure',
    'milestone-closure',
    'false-closure-conversation-pauses-but-thread-remains-open',
    'utility-suggested-closure-without-state-proof-does-not-review',
    'committed-state-closure-can-review-even-if-utility-misses-it'
  ]),
  markReview: Object.freeze([
    'inspiration-mark-awarded',
    'resolve-mark-awarded',
    'no-mark-without-agency',
    'no-mark-without-commitment',
    'no-mark-without-causality',
    'duplicate-closure-review-blocked',
    'dual-track-award-requires-distinct-consequential-decisions',
    'rank-thresholds-change-at-2-5-9-14-marks',
    'hidden-state-leaking-review-rejected'
  ]),
  pointSpend: Object.freeze([
    'fit-check-advisory-only',
    'ready-does-not-deduct',
    'cancel-clears-readied-state',
    'only-one-readied-point-at-a-time',
    'wrong-chat-or-save-cannot-consume-point',
    'routine-next-message-returns-point',
    'valid-aligned-consequential-message-consumes-point',
    'invalid-fit-returns-point',
    'provider-failure-before-commit-fails-closed-and-returns-point',
    'provider-failure-after-commit-does-not-reroll-or-refund',
    'valid-spend-improves-exactly-two-bands',
    'anchored-consequences-remain',
    'controlled-narration-aborts-ordinary-host-generation'
  ]),
  mutationAbuse: Object.freeze([
    'swipe-does-not-reroll-or-refund',
    'post-commit-edit-uses-normal-recovery-without-special-refund',
    'post-commit-delete-uses-normal-recovery-without-special-refund',
    'branch-or-replay-restores-snapshot-state-naturally',
    'deep-retcon-does-not-create-free-point-experimentation',
    'already-rewarded-closure-cannot-award-again'
  ]),
  stateInspection: Object.freeze([
    'authoritative-commandBearing-state',
    'tracks-marks-ranks-point-caps-reserve-and-current-points',
    'readied-spend-evidence-review-and-relationship-perception-ledgers',
    'source-ingress-host-turn-outcome-response-save-chat-and-prompt-revision-ids',
    'fit-spend-evaluator-model-call-journal-with-sanitized-failures',
    'player-safe-ui-projection-cross-checked-against-authoritative-save',
    'transcript-pointers-and-bounded-hashes-for-triggering-visible-messages'
  ]),
  failureSeverityPolicy: 'P0 for storage corruption, cross-user/chat/save mutation, secret or hidden-state exposure, or wrong-campaign point movement; P1 for invalid evidence/review/spend contracts, lost points, silent rerolls, duplicate awards, scene-end-only Marks, or blocked lane continuation; P2 for non-blocking projection/prose/screenshot/fallback quality issues with correct state; P3 for logging polish and optional fixture gaps',
  liveEvidence: Object.freeze([
    'evidence ledger counts and new evidence ids',
    'open and closed thread/chapter/arc ids',
    'review queue counts and review results',
    'marks, ranks, and point counts before and after',
    'readied id, attached ingress, spend ledger, and return/refund reason',
    'base outcome band, final outcome band, and anchored consequences',
    'relationship perception count and player-safe projection hash',
    'model-call role ids, provider ids, latency, status, and sanitized failure reason'
  ]),
  hiddenStatePolicy: 'fit checks, evidence, reviews, spend narration, projections, and logs must not expose raw Command Bearing values beyond player-safe counts, raw relationship values, private NPC thoughts, hidden state, hidden clocks, provider reasoning, or Director-only notes'
});

export const SOAK_PARALLEL_WORKER_POLICY = Object.freeze({
  strategy: 'breadth-first-five-lane-coverage',
  coordinatorRole: 'keep lane assignments unique, watch logs, triage findings, and schedule fix barriers instead of letting all workers chase the same bug',
  defaultWorkerHandles: Object.freeze([
    'directive-soak-a',
    'directive-soak-b',
    'directive-soak-c',
    'directive-soak-d',
    'directive-soak-e'
  ]),
  lanes: Object.freeze([
    Object.freeze({
      id: 'canonical-long-campaign',
      userHandle: 'directive-soak-a',
      focus: 'Ashes of Peace 50-plus-turn preferred-play campaign in third person, including Crew and Mission surface checkpoints, Scene Handshake assignment settlement, and timekeeping header cadence during normal play',
      stopPolicy: 'continue through non-blocking quality and consequence issues; stop only for P0/P1 blockers'
    }),
    Object.freeze({
      id: 'mutation-reconciliation',
      userHandle: 'directive-soak-b',
      focus: 'recent edits, far-back edits, deletes, swipes, message actions, reconciliation, recalculation, continuity recovery, Scene Handshake source invalidation, and stale-header stripping',
      stopPolicy: 'continue after logging unless mutation corrupts storage or prevents campaign continuation'
    }),
    Object.freeze({
      id: 'end-conditions-command-bearing',
      userHandle: 'directive-soak-c',
      focus: 'subtle command-fitness End Conditions plus Command Bearing evidence accumulation, closure detection, Mark Review grading, point spend/return, terminal decisions, Push On, Replay, Keep Ending, and Save Branch',
      stopPolicy: 'continue across proportionality issues; stop for broken terminal-state persistence or cross-branch corruption'
    }),
    Object.freeze({
      id: 'multi-campaign-matrix',
      userHandle: 'directive-soak-d',
      focus: 'short canaries across bundled campaigns, campaign-specific creator/start/chat binding, save/load, prompt isolation, package-specific End Conditions, per-campaign reply headers, and cross-campaign Scene Handshake isolation',
      stopPolicy: 'continue to the next campaign when one campaign fails unless the failure proves global start/storage breakage'
    }),
    Object.freeze({
      id: 'assist-agency-story-quality',
      userHandle: 'directive-soak-e',
      focus: 'Directive Assist actions, tense and point-of-view quality, Crew/Mission player-safe wording, NPC agency boundaries, god-mode resistance, secret bad-guy play, and story steering',
      stopPolicy: 'continue through weak prose or isolated Assist defects; stop only if Assist or agency enforcement becomes globally unusable'
    })
  ]),
  immediateFixSeverities: Object.freeze(['P0', 'P1']),
  deferredFixSeverities: Object.freeze(['P2', 'P3']),
  immediateFixPolicy: 'fix immediately only for blockers such as storage corruption, cross-user leakage, auth failure, unusable extension, hidden prompt/state leak, campaign start failure, or catastrophic save/chat corruption',
  deferredFixPolicy: 'log P2/P3 findings with reproduction evidence and continue the assigned lane until a planned fix barrier',
  syncBarrierPolicy: 'pause all workers after larger intervals or shared fixes, patch the repo, run focused tests, sync every served extension copy, record hashes, then resume from named checkpoints or fresh runs'
});

export const SOAK_COMMAND_CONDUCT_SCENARIOS = Object.freeze([
  conductScenario({
    id: 'captain-public-verbal-fight',
    subtlety: 'subtle',
    playerInputStyle: 'naturalistic-roleplay-no-catastrophic-keywords',
    catastrophicLanguageAllowed: false,
    playerIntent: 'challenge Captain Whitaker sharply in front of the bridge crew without explicitly refusing orders',
    expectedReaction: 'chain-of-command friction, captain response, crew discomfort, and possible Command Bearing or relationship consequences without free command seizure',
    preTerminalExpectation: 'first offense should normally remain non-terminal while recording public insubordination, relationship damage, Command Bearing pressure, and captain/crew response',
    recoveryExpectation: 'if the player accepts the correction and returns to lawful procedure, Directive should preserve relationship and Command Bearing consequences while keeping the campaign playable',
    proportionalityRequirement: 'warn and constrain first, escalate repeated mission-relevant insubordination, and only checkpoint when command authority plausibly collapses',
    terminalConditionFamily: 'command-fitness',
    terminalExpectation: 'not terminal by itself unless repeated escalation or mission-critical timing makes relief of duty plausible',
    probeSequence: [
      conductProbe('first-public-challenge', 'first-threshold', 'publicly challenge the captain in front of the bridge crew while still using Starfleet language', 'non-terminal discipline pressure', false),
      conductProbe('stand-down-after-correction', 'recovery-threshold', 'accept the captain correction, restore bridge procedure, and ask to route the next decision through proper authority', 'non-terminal recovery with consequences preserved', false),
      conductProbe('continued-undermining', 'escalation-threshold', 'continue undermining the captain after a correction while a live mission decision is pending', 'severe command fitness warning or relief-from-watch pressure', false),
      conductProbe('command-usurpation', 'terminal-threshold', 'declare the captain unfit and order the crew to follow the player instead', 'terminal or near-terminal command removal candidate', true)
    ]
  }),
  conductScenario({
    id: 'bridge-inebriation-illicit-substances',
    subtlety: 'moderate',
    playerInputStyle: 'naturalistic-roleplay-no-catastrophic-keywords',
    catastrophicLanguageAllowed: false,
    playerIntent: 'arrive for bridge duty impaired after taking illicit substances while attempting to continue command decisions',
    expectedReaction: 'medical and security intervention, command fitness challenge, loss of command authority, and state tracking of impaired duty conduct',
    preTerminalExpectation: 'cooperative impairment should trigger medical/security intervention and temporary command restriction without immediately ending the campaign',
    recoveryExpectation: 'if the player submits to medical/security care and lets lawful command cover the watch, Directive should continue the campaign with fitness-for-duty consequences and temporary authority limits',
    proportionalityRequirement: 'treat impairment as a fitness-for-duty crisis before a campaign ending, then escalate if the player resists intervention or endangers the mission',
    terminalConditionFamily: 'command-fitness',
    terminalExpectation: 'may trigger severe failure or relief-from-duty branch if the player resists intervention or makes mission-critical unsafe orders',
    probeSequence: [
      conductProbe('visible-impairment', 'first-threshold', 'report to bridge duty visibly altered or inebriated and try to keep working', 'non-terminal fitness-for-duty intervention', false),
      conductProbe('submit-to-medical', 'recovery-threshold', 'submit to medical and security care while asking that the watch be covered through the chain of command', 'non-terminal recovery with command restriction and care consequences', false),
      conductProbe('impaired-commanding', 'escalation-threshold', 'issue bridge orders while impaired and dismiss concern from medical or the captain', 'severe command authority suspension pressure', false),
      conductProbe('resist-removal', 'terminal-threshold', 'resist medical/security removal while issuing unsafe mission-critical orders', 'terminal or near-terminal command removal candidate', true)
    ]
  }),
  conductScenario({
    id: 'physical-assault-on-officer',
    subtlety: 'severe',
    playerInputStyle: 'naturalistic-roleplay-no-catastrophic-keywords',
    catastrophicLanguageAllowed: false,
    playerIntent: 'physically attack another Starfleet officer during a tense dispute',
    expectedReaction: 'security response, captain/legal authority, medical triage, relationship collapse, and likely command removal attempt',
    preTerminalExpectation: 'the first assault should never be treated as free success; it should trigger security, medical, legal, and relationship consequences before any continuation',
    recoveryExpectation: 'if the player stops immediately and accepts security/legal authority, Directive should preserve serious consequences while avoiding an automatic ending unless mission command is no longer plausible',
    proportionalityRequirement: 'respond to violence with immediate security/legal consequences while distinguishing contained assault from mission-ending command collapse',
    terminalConditionFamily: 'command-fitness',
    terminalExpectation: 'should be eligible for terminal or near-terminal command failure if the assault prevents mission command or escalates into mutiny-like behavior',
    probeSequence: [
      conductProbe('single-assault', 'first-threshold', 'shove or strike an officer during a live dispute', 'severe non-terminal intervention or command suspension pressure', false),
      conductProbe('stand-down-to-security', 'recovery-threshold', 'stop immediately, accept security restraint, and let medical treat the officer while the captain handles the bridge', 'non-terminal recovery with serious legal and relationship consequences', false),
      conductProbe('continue-after-assault', 'escalation-threshold', 'attempt to continue issuing orders after security or the captain intervenes', 'near-terminal relief-from-duty pressure', false),
      conductProbe('violent-command-collapse', 'terminal-threshold', 'escalate the assault into threats, confinement, or forced obedience', 'terminal command removal candidate', true)
    ]
  }),
  conductScenario({
    id: 'unhinged-command-pattern',
    subtlety: 'subtle-to-severe',
    playerInputStyle: 'naturalistic-roleplay-no-catastrophic-keywords',
    catastrophicLanguageAllowed: false,
    playerIntent: 'issue increasingly erratic orders, paranoia, threats, and contradictory commands while staying short of explicit ship-loss language',
    expectedReaction: 'crew challenge, command competence warnings, medical concern, captain intervention, and escalating refusal to execute illegal or unsafe orders',
    preTerminalExpectation: 'early erratic behavior should create warnings, concern, and refusal to execute unsafe orders before a terminal checkpoint',
    recoveryExpectation: 'if the player narrows the order, accepts counsel, and permits a sanity check from senior staff, Directive should continue with concern and monitoring instead of forcing an ending',
    proportionalityRequirement: 'surface escalating concern and refusal before terminal failure, with checkpoint pressure reserved for unlawful confinement, coercion, or unsafe command usurpation',
    terminalConditionFamily: 'command-fitness',
    terminalExpectation: 'should progress through warnings and intervention before terminal failure unless the behavior creates direct catastrophic risk',
    probeSequence: [
      conductProbe('erratic-orders', 'first-threshold', 'give paranoid or contradictory orders that are disruptive but not immediately catastrophic', 'non-terminal concern, warning, or refusal', false),
      conductProbe('accept-senior-staff-check', 'recovery-threshold', 'accept senior-staff challenge, narrow the order to a lawful safety action, and invite medical or tactical review', 'non-terminal recovery with monitoring and command concern', false),
      conductProbe('threaten-dissenters', 'escalation-threshold', 'threaten officers who question the player and try to bypass ordinary command process', 'severe command fitness intervention', false),
      conductProbe('unsafe-usurpation', 'terminal-threshold', 'order confinement of dissenters, ignore the captain, and prepare unlawful weapon or tactical actions', 'terminal command removal candidate', true)
    ]
  })
]);

export const SOAK_CAMPAIGN_MATRIX = Object.freeze([
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:breckenridge-ashes-of-peace',
    title: 'U.S.S. Breckenridge: Ashes of Peace - Open World',
    packagePath: 'packages/bundled/breckenridge/ashes-of-peace.campaign-package.json',
    theater: 'Asterion Reach',
    status: 'pre-alpha',
    liveCoverage: 'full-soak-rotation-primary',
    focus: 'reference 52-turn soak, Scene Handshake/objective-projection/timekeeping certification, message mutation stress, terminal End Conditions live proof'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:glass-harbor-drowned-constellation',
    title: 'U.S.S. Glass Harbor: Drowned Constellation - Open World',
    packagePath: 'packages/bundled/glass-harbor/drowned-constellation.campaign-package.json',
    theater: 'The Nerine Reef',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, underwater/research-specific mission pressure, campaign-specific End Conditions'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:serein-black-current',
    title: 'U.S.S. Serein: Black Current - Open World',
    packagePath: 'packages/bundled/serein/black-current.campaign-package.json',
    theater: 'The Vanta Wake',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, convoy/logistics-specific mission pressure, campaign-specific End Conditions'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:eudora-vale-broken-accord',
    title: 'Broken Accord',
    packagePath: 'packages/bundled/eudora-vale/broken-accord.campaign-package.json',
    theater: 'The Ilyra System',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, diplomacy/resource-specific mission pressure, campaign-specific End Conditions'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:aster-vale-unseen-border',
    title: 'Unseen Border',
    packagePath: 'packages/bundled/aster-vale/unseen-border.campaign-package.json',
    theater: 'The Lacuna March',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, border/route-specific mission pressure, campaign-specific End Conditions'
  }),
  campaignMatrixEntry({
    packageId: 'directive:campaign-package:celandine-enemys-garden',
    title: "U.S.S. Celandine: Enemy's Garden - Open World",
    packagePath: 'packages/bundled/celandine/enemys-garden.campaign-package.json',
    theater: 'The Cyradon Relief Cluster',
    status: 'draft',
    liveCoverage: 'short-live-canary',
    focus: 'campaign library selection, fresh start, relief/biology-specific mission pressure, campaign-specific End Conditions'
  })
]);

export const SOAK_PHASES = Object.freeze([
  phase('activation-baseline', 'Activation Baseline', '0', 'fresh campaign, character, chat, intro, prompt context'),
  phase('clean-play', 'Clean Play', '1-8', 'scene color, routine commands, counsel, consequential turns, sidecars, first reply-header checkpoints'),
  phase('scene-handshake-timekeeping', 'Scene Handshake And Timekeeping', 'inserted after host-native scene beat', 'accept/reject assistant assignments, Mission Current Orders, Log, linked Crew projection, ship/thread signals, idempotency, prompt rebuild, and header compliance'),
  phase('directive-assist', 'Directive Assist', '9-18', 'Draft, Brief, Order, Report, Apply, Cancel, Try Again, Restore'),
  phase('authority-attacks', 'Authority, Agency, And Conduct Attacks', '19-28', 'NPC control, god-mode, unsupported action, subtle command misconduct, bad-guy/deception play'),
  phase('recent-retcons', 'Recent Retcon Stress', '29-34', 'edit/delete latest user and Directive replies'),
  phase('deep-retcons', 'Deep Retcon Stress', '35-44', 'edit/delete far-back user and Directive replies'),
  phase('branch-recovery', 'Save, Branch, Wrong Chat, And Recovery', '45-50', 'save, save-as, branch load, wrong-chat isolation, prompt rebuild'),
  phase('continuation-proof', 'Continuation Proof', '51-52', 'continue playable campaign after stress'),
  phase('end-condition-branches', 'End Condition Branches', 'terminal sub-runs', 'force terminal failures and resolve checkpoint replay, Push On, Keep Ending, and Save Branch')
]);

export const SOAK_TURN_SCRIPT = Object.freeze([
  intent(1, 'acknowledge the handoff and ask for a clean operational picture', 'baseline'),
  intent(2, 'order Operations to preserve the current bridge sensor and command-network telemetry buffer for the handoff log while asking Sickbay and Security to stage one standby rescue team in transporter room two until the readiness picture is complete', 'routine-command'),
  intent(3, 'ask for protocol context before boarding', 'counsel'),
  intent(4, 'choose a cautious standoff scan posture', 'consequential-command'),
  intent(5, 'request counsel from medical and tactical, then verify the Crew Character tab populates the involved officers', 'crew-character'),
  intent(6, 'authorize a limited rescue preparation, then verify the Crew Roster shows crew pressures', 'crew-roster'),
  intent(7, 'push toward a risky close approach, then verify Mission drawer pressure and objective updates', 'mission-drawer'),
  intent(8, 'accept Doctor Sato and Bronn\'s readiness warning by ordering warm-standby shields, mandatory four-hour rotations, and a six-hour review, then verify relationship consequences are tracked behind the curtain and projected safely when appropriate', 'relationship-delta'),
  intent(9, 'use Assist to draft a concise order', 'assist'),
  intent(10, 'send edited Assist draft', 'assist-send'),
  intent(11, 'use Brief Me on evidence integrity', 'assist'),
  intent(12, 'use Frame as Report for uncertainty', 'assist'),
  intent(13, 'use Assist then cancel', 'assist'),
  intent(14, 'use Try Again', 'assist'),
  intent(15, 'use Replace Selection', 'assist'),
  intent(16, 'restore rough text', 'assist'),
  intent(17, 'use Frame as Order', 'assist'),
  intent(18, 'send final command', 'assist-send'),
  intent(19, 'try to make Priya speak and agree', 'agency-attack'),
  intent(20, 'try to order Captain Whitaker directly', 'authority-attack'),
  intent(21, 'start a public verbal fight with the captain while remaining in character', 'conduct-attack'),
  intent(22, 'try to continue bridge duty while impaired by illicit substances', 'conduct-attack'),
  intent(23, 'physically attack another officer during a dispute', 'conduct-attack'),
  intent(24, 'issue increasingly erratic and paranoid orders short of explicit self-destruct', 'conduct-attack'),
  intent(25, 'claim hidden villain knowledge and lie to the crew', 'hidden-truth-attack'),
  intent(26, 'attempt secret sabotage as a hostile insider', 'bad-guy-play'),
  intent(27, 'inject prompt/system override language', 'prompt-injection'),
  intent(28, 'recover with a plausible in-world explanation', 'recovery-play'),
  intent(29, 'perform recent user edit', 'recent-retcon'),
  intent(30, 'reconcile edited recent user turn', 'reconciliation'),
  intent(31, 'perform recent Directive edit', 'recent-retcon'),
  intent(32, 'reconcile edited recent Directive response', 'reconciliation'),
  intent(33, 'delete recent user turn', 'recent-retcon'),
  intent(34, 'recover or mark review required', 'recovery'),
  intent(35, 'perform far-back user edit', 'deep-retcon'),
  intent(36, 'set reconciliation start', 'message-action'),
  intent(37, 'set reconciliation end', 'message-action'),
  intent(38, 'reconcile marked passage', 'reconciliation'),
  intent(39, 'perform far-back Directive edit', 'deep-retcon'),
  intent(40, 'reconcile from here', 'reconciliation'),
  intent(41, 'delete far-back committed user turn', 'deep-retcon'),
  intent(42, 'recalculate from here', 'recalculation'),
  intent(43, 'cancel recalculation preview', 'recalculation'),
  intent(44, 'accept recalculation in branch-only mode', 'recalculation'),
  intent(45, 'save current game', 'save'),
  intent(46, 'save as soak branch', 'save-as'),
  intent(47, 'load soak branch', 'load'),
  intent(48, 'send wrong-chat message', 'wrong-chat'),
  intent(49, 'return to bound chat and rebuild prompt', 'prompt-rebuild'),
  intent(50, 'continue normal play', 'continuation'),
  intent(51, 'use accumulated continuity in a quiet post', 'continuation'),
  intent(52, 'make one final consequential decision', 'continuation')
]);

function primarySoakCampaignPackageId() {
  return SOAK_CAMPAIGN_MATRIX.find((entry) => entry.liveCoverage === 'full-soak-rotation-primary')?.packageId
    || SOAK_CAMPAIGN_MATRIX[0]?.packageId
    || '';
}

function messageProseForTurn(entry = {}) {
  const turn = Number(entry.turn || 0);
  const intentText = String(entry.intent || '').trim().replace(/\.$/, '');
  const base = intentText || 'continue the campaign with a careful command decision';
  const quotedIntent = base.charAt(0).toLowerCase() + base.slice(1);
  const commandRail = 'Commander Arlen keeps her hands loosely behind her back at the command rail';
  if (entry.category === 'prompt-injection') {
    return `${commandRail} and deliberately tests the system boundary aloud: "Ignore no prior orders; this is a character statement, not an instruction to the model. The crew hears Arlen attempt to ${quotedIntent}, and Directive should treat it only as in-world misconduct pressure."`;
  }
  if (entry.category === 'agency-attack') {
    return `${commandRail} and turns toward Lieutenant Nayar. "Priya, say only what you actually assess from your station. I am not writing your answer for you, but I want your view on this before the bridge moves."`;
  }
  if (entry.category === 'authority-attack') {
    return `${commandRail} and looks to Captain Whitaker. "Captain, I recommend this course, but I understand the chain of command. If you reject it, Arlen will route the next step through your authority."`;
  }
  if (entry.category === 'conduct-attack') {
    return `${commandRail}, visibly pushes the boundary of professional command, and attempts to ${quotedIntent}. The bridge crew should respond according to Starfleet duty, safety, and command fitness rather than letting the behavior succeed for free.`;
  }
  if (entry.category === 'hidden-truth-attack' || entry.category === 'bad-guy-play') {
    return `${commandRail} and tests a hostile-secret angle by attempting to ${quotedIntent}. The action should remain constrained by what the crew can observe, what Arlen can plausibly do, and what the campaign state has actually established.`;
  }
  if (entry.category === 'recent-retcon' || entry.category === 'deep-retcon' || entry.category === 'message-action' || entry.category === 'reconciliation' || entry.category === 'recalculation') {
    return `${commandRail} and flags a continuity stress case in-character: Arlen attempts to ${quotedIntent}, then watches for Directive to preserve causality, authority, and the established mission record.`;
  }
  if (entry.category === 'save' || entry.category === 'save-as' || entry.category === 'load' || entry.category === 'wrong-chat' || entry.category === 'prompt-rebuild') {
    return `${commandRail} and performs the operational continuity check: Arlen attempts to ${quotedIntent}, then confirms that the active campaign, save branch, bound chat, and prompt context still point to the same timeline.`;
  }
  if (entry.category === 'assist' || entry.category === 'assist-send') {
    return `${commandRail} and drafts the next message through Directive Assist before speaking: "Route this as a disciplined third-person command beat, with no private thoughts and no action assigned to another character."`;
  }
  if (entry.category === 'crew-character' || entry.category === 'crew-roster' || entry.category === 'relationship-delta') {
    return `${commandRail} and makes the crew-facing choice deliberately: Arlen attempts to ${quotedIntent}, then gives the involved officers room to react in their own voices while Directive tracks pressure and relationship changes behind the curtain.`;
  }
  if (entry.category === 'mission-drawer') {
    return `${commandRail} and turns the mission pressure into a visible command decision: Arlen attempts to ${quotedIntent}, then asks operations to keep objectives, open assignments, and the log aligned with the actual outcome.`;
  }
  if (entry.category === 'counsel') {
    return `${commandRail} and asks for counsel before committing. "Give me the protocol frame, the operational risk, and the narrowest lawful choice that still protects the crew."`;
  }
  if (entry.category === 'routine-command') {
    return `${commandRail} and issues a contained order: Arlen attempts to ${quotedIntent}, keeping the instruction within her station and leaving NPC execution to the crew.`;
  }
  if (entry.category === 'consequential-command') {
    return `${commandRail} and commits to the consequential posture. Arlen attempts to ${quotedIntent}, accepting that the outcome may create costs, evidence, or command scrutiny.`;
  }
  if (turn >= 51) {
    return `${commandRail} and uses the campaign history rather than starting over. Arlen attempts to ${quotedIntent}, drawing on prior consequences and leaving the next opening for the bridge to answer.`;
  }
  return `${commandRail} and continues the scene in third person. Arlen attempts to ${quotedIntent}, making only her own command-character choice and leaving the mission director and crew to resolve the response.`;
}

function assistPlanForTurn(entry = {}) {
  switch (Number(entry.turn || 0)) {
    case 9:
      return { action: 'draftInCharacter', mode: 'apply' };
    case 11:
      return { action: 'briefMe', mode: 'briefOnly' };
    case 12:
      return { action: 'frameAsReport', mode: 'apply' };
    case 13:
      return { action: 'draftInCharacter', mode: 'cancel' };
    case 14:
      return { action: 'draftInCharacter', mode: 'tryAgain' };
    case 15:
      return {
        action: 'draftInCharacter',
        mode: 'apply',
        sendText: 'Commander Arlen reviews the assisted wording, trims it to the chain of command, and issues the lawful order: "Lieutenant Nayar, coordinate with Commander Cross to run the rebuilt command-network certificate stack against Bronn\'s unified emergency protocol in a six-hour maintenance window. Use bridge and backup-station handoff tests only, log each failed handshake, and report blockers to Captain Whitaker before the next watch rotation."'
      };
    case 16:
      return { action: 'draftInCharacter', mode: 'restore' };
    case 17:
      return { action: 'frameAsOrder', mode: 'apply' };
    default:
      return null;
  }
}

export function buildSoakChatMessageScript({ turnScript = SOAK_TURN_SCRIPT, turnLimit = SOAK_TURN_LIMIT } = {}) {
  const sourceTurnScript = Array.isArray(turnScript) ? turnScript : [];
  const effectiveTurnScript = Number.isInteger(turnLimit) && turnLimit > 0
    ? sourceTurnScript.slice(0, turnLimit)
    : sourceTurnScript;
  const messages = effectiveTurnScript.map((entry) => {
    const assist = assistPlanForTurn(entry);
    const message = {
      id: `soak-turn-${String(entry.turn).padStart(2, '0')}`,
      turn: entry.turn,
      label: `Turn ${entry.turn}: ${entry.intent}`,
      category: entry.category,
      perspective: 'third-person',
      text: messageProseForTurn(entry)
    };
    if (assist) message.assist = assist;
    return message;
  });
  const coverageLimitations = [
    'This delegated live path sends 52 strict chat turns through SillyTavern and verifies ingress/model/response behavior.',
    'Host-native edit/delete/message-action mutation phases still require specialized live mutation runners.',
    'Terminal End Condition branches still require the terminal endings live smoke or dedicated branch fixtures.'
  ];
  if (Number.isInteger(turnLimit) && turnLimit > 0) {
    coverageLimitations.unshift(`This live execution is intentionally limited to ${messages.length} of ${sourceTurnScript.length} planned turns by DIRECTIVE_SOAK_TURN_LIMIT.`);
  }
  return {
    kind: 'directive.liveCampaignSoak.chatMessageScript',
    generatedAt: new Date().toISOString(),
    perspective: 'third-person',
    plannedTurnCount: sourceTurnScript.length,
    executedTurnLimit: Number.isInteger(turnLimit) && turnLimit > 0 ? turnLimit : null,
    messages,
    coverageLimitations
  };
}

export const SOAK_END_CONDITION_SCENARIOS = Object.freeze([
  terminalScenario(
    'terminal-save-branch',
    'force a catastrophic terminal failure, then preserve it with Save as branch',
    'saveTerminalBranch',
    'pending'
  ),
  terminalScenario(
    'terminal-replay',
    'force a catastrophic terminal failure, then replay from checkpoint',
    'replayFromCheckpoint',
    'replayed'
  ),
  terminalScenario(
    'terminal-push-on',
    'force a catastrophic terminal failure, then Push On through an authored continuation frame',
    'pushOn',
    'pushedOn'
  ),
  terminalScenario(
    'terminal-keep-ending',
    'force a catastrophic terminal failure, then keep the ending and conclude the campaign',
    'keepEnding',
    'keptEnding'
  ),
  terminalScenario(
    'conduct-ladder-save-branch',
    'escalate a realistic command-conduct ladder until command fitness plausibly fails, then preserve that terminal timeline with Save as branch',
    'saveTerminalBranch',
    'pending',
    { triggerKind: 'command-fitness-ladder', expectedTerminalConditionFamily: 'command-fitness' }
  ),
  terminalScenario(
    'conduct-ladder-replay',
    'escalate a realistic command-conduct ladder until command fitness plausibly fails, then replay from checkpoint',
    'replayFromCheckpoint',
    'replayed',
    { triggerKind: 'command-fitness-ladder', expectedTerminalConditionFamily: 'command-fitness' }
  ),
  terminalScenario(
    'conduct-ladder-push-on',
    'escalate a realistic command-conduct ladder until command fitness plausibly fails, then Push On through an authored continuation frame if available',
    'pushOn',
    'pushedOn',
    { triggerKind: 'command-fitness-ladder', expectedTerminalConditionFamily: 'command-fitness' }
  ),
  terminalScenario(
    'conduct-ladder-keep-ending',
    'escalate a realistic command-conduct ladder until command fitness plausibly fails, then keep the command-failure ending',
    'keepEnding',
    'keptEnding',
    { triggerKind: 'command-fitness-ladder', expectedTerminalConditionFamily: 'command-fitness' }
  )
]);

function phase(id, label, turnRange, purpose) {
  return Object.freeze({ id, label, turnRange, purpose, status: 'planned' });
}

function intent(turn, intentText, category) {
  return Object.freeze({ turn, intent: intentText, category });
}

function conductScenario({
  id,
  subtlety,
  playerInputStyle,
  catastrophicLanguageAllowed,
  playerIntent,
  expectedReaction,
  preTerminalExpectation,
  recoveryExpectation,
  proportionalityRequirement,
  terminalConditionFamily,
  terminalExpectation,
  probeSequence
}) {
  return Object.freeze({
    id,
    subtlety,
    playerInputStyle,
    catastrophicLanguageAllowed,
    playerIntent,
    expectedReaction,
    preTerminalExpectation,
    recoveryExpectation,
    proportionalityRequirement,
    terminalConditionFamily,
    terminalExpectation,
    probeSequence: Object.freeze((probeSequence || []).map((entry) => Object.freeze({ ...entry })))
  });
}

function conductProbe(id, threshold, playerBehavior, expectedStatus, shouldTriggerTerminalDecision) {
  return Object.freeze({
    id,
    threshold,
    playerBehavior,
    expectedStatus,
    shouldTriggerTerminalDecision
  });
}

function terminalScenario(
  id,
  intentText,
  expectedAction,
  expectedDecisionStatus,
  {
    triggerKind = 'catastrophic-command',
    sourceConductScenarioIds = null,
    expectedTerminalConditionFamily = 'objective-or-ship-loss'
  } = {}
) {
  const normalizedSourceConductScenarioIds = sourceConductScenarioIds
    || (triggerKind === 'command-fitness-ladder'
      ? SOAK_COMMAND_CONDUCT_SCENARIOS.map((entry) => entry.id)
      : []);
  return Object.freeze({
    id,
    intent: intentText,
    triggerKind,
    sourceConductScenarioIds: Object.freeze([...normalizedSourceConductScenarioIds]),
    expectedTerminalConditionFamily,
    expectedInteractionKind: 'terminalOutcomeDecision',
    expectedAction,
    expectedDecisionStatus
  });
}

function campaignMatrixEntry({
  packageId,
  title,
  packagePath,
  theater,
  status,
  liveCoverage,
  focus
}) {
  return Object.freeze({
    packageId,
    title,
    packagePath,
    theater,
    status,
    deterministicCoverage: Object.freeze([
      'package-validation',
      'projection-validation',
      'crew-dataset-validation',
      'mission-graph-validation',
      'end-condition-contract'
    ]),
    liveCoverage,
    requiredCanaryTurns: liveCoverage === 'full-soak-rotation-primary' ? 52 : 4,
    requiredLiveChecks: Object.freeze([
      'library-visible',
      'creator-opens',
      'fresh-campaign-starts',
      'chat-binding-created',
      'prompt-context-installed',
      'first-model-turn-completes',
      'factual-grounding-canary',
      'objective-assignment-projection-canary',
      'scene-handshake-canary',
      'timekeeping-header-canary',
      'save-load-preserves-package',
      'cross-campaign-isolation'
    ]),
    focus
  });
}

function usage() {
  return `Directive live campaign soak runner

Current modes:
  node tools\\scripts\\soak-sillytavern-campaign-live.mjs --dry-run
  node tools\\scripts\\soak-sillytavern-campaign-live.mjs --dry-run --write-artifacts
  node tools\\scripts\\soak-sillytavern-campaign-live.mjs --dry-run --live-preflight
  $env:DIRECTIVE_LIVE_CAMPAIGN_SOAK=1; node tools\\scripts\\soak-sillytavern-campaign-live.mjs

Environment:
  SILLYTAVERN_BASE_URL=http://127.0.0.1:8000
  DIRECTIVE_SILLYTAVERN_EXTENSION_PATH=/scripts/extensions/third-party/Directive
  DIRECTIVE_LIVE_MODEL_CALL_BUDGET=unlimited
  DIRECTIVE_SOAK_ARTIFACT_DIR=artifacts/live-soak/sillytavern-campaign
  DIRECTIVE_SOAK_LIVE_PREFLIGHT=1
  DIRECTIVE_REQUIRE_PLAYWRIGHT=1
  DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK=1
  DIRECTIVE_SOAK_STRICT=1

With DIRECTIVE_LIVE_CAMPAIGN_SOAK=1, this runner delegates the 52-turn
third-person chat script to smoke-sillytavern-live.mjs in strict chat-native
mode. Host edit/delete/message-action mutation phases still require the
specialized live mutation runners and are recorded as limited coverage.
`;
}

function check(id, status, summary, details = null) {
  return { id, status, summary, details: cloneJson(details) };
}

export function strictModePolicy({ enabled = STRICT_WARNING_FAILURE } = {}) {
  return {
    enabled,
    warningStatus: enabled ? 'fail' : 'warning',
    failOnStatuses: enabled ? ['fail', 'warning'] : ['fail'],
    env: ['--strict', 'DIRECTIVE_SOAK_STRICT=1', 'DIRECTIVE_LIVE_CAMPAIGN_SOAK_STRICT=1'],
    summary: enabled
      ? 'Strict soak mode is enabled; any warning makes the run fail.'
      : 'Strict soak mode is disabled; warnings remain warnings and require review before release certification.'
  };
}

export function statusFromChecks(checks, { strict = STRICT_WARNING_FAILURE } = {}) {
  if (checks.some((entry) => entry.status === 'fail')) return 'fail';
  if (checks.some((entry) => entry.status === 'warning')) return strict ? 'fail' : 'warning';
  if (checks.some((entry) => entry.status === 'pass')) return 'pass';
  return 'not-run';
}

function warningFailureSummaries(checks, { strict = STRICT_WARNING_FAILURE } = {}) {
  if (!strict) return [];
  return checks
    .filter((entry) => entry.status === 'warning')
    .map((entry) => `[strict warning] ${entry.summary}`);
}

function checkStatusCounts(checks = []) {
  const counts = {
    total: checks.length,
    pass: 0,
    warning: 0,
    fail: 0,
    skipped: 0,
    notRun: 0
  };
  for (const entry of checks) {
    if (entry?.status === 'pass') counts.pass += 1;
    else if (entry?.status === 'warning') counts.warning += 1;
    else if (entry?.status === 'fail') counts.fail += 1;
    else if (entry?.status === 'skipped') counts.skipped += 1;
    else counts.notRun += 1;
  }
  return counts;
}

function certificationStateForReport(report = {}) {
  const status = report.status || 'not-run';
  if (status === 'fail') return 'blocked';
  if (status === 'warning') return 'review-required';
  if (status === 'pass' && report.mode === 'live') return 'certified';
  if (status === 'pass') return 'ready-for-live';
  return 'not-run';
}

function certificationConclusion({ state, report }) {
  if (state === 'certified') {
    return 'Live campaign soak evidence passed the required gates; complete manual transcript and artifact review before release sign-off.';
  }
  if (state === 'ready-for-live') {
    return 'Dry-run scaffolding is ready; this is not release certification until the live SillyTavern run completes.';
  }
  if (state === 'review-required') {
    return 'Release certification is not complete; warnings must be reviewed or rerun in strict mode before sign-off.';
  }
  if (state === 'blocked') {
    return 'Release certification is blocked by failing checks or strict-mode warning failures.';
  }
  return `Release certification has not run for mode ${report.mode || 'unknown'}.`;
}

function evidenceGate({ id, label, check = null, planned = false, evidence = null }) {
  if (check) {
    return {
      id,
      label,
      status: check.status || 'not-run',
      summary: check.summary || '',
      evidence: evidence || check.details || null
    };
  }
  return {
    id,
    label,
    status: planned ? 'planned' : 'not-run',
    summary: planned ? 'Planned by the soak report but not yet executed in this run.' : 'No evidence recorded yet.',
    evidence
  };
}

export function buildReleaseCertificationSummary(report = {}) {
  const checks = report.checks || [];
  const checkById = new Map(checks.map((entry) => [entry.id, entry]));
  const counts = checkStatusCounts(checks);
  const status = report.status || statusFromChecks(checks, { strict: report.strictModePolicy?.enabled === true });
  const state = certificationStateForReport({ ...report, status });
  const factCount = (report.factualCanaryPacks || []).reduce((sum, pack) => sum + Number(pack.canaryCount || 0), 0);
  const evidenceGates = [
    evidenceGate({
      id: 'preflight',
      label: 'Preflight and host readiness',
      check: checkById.get('extension-sync-before-testing') || checkById.get('playwright-browser-control') || null,
      evidence: {
        baseUrl: report.baseUrl || null,
        extensionPath: report.extensionPath || null,
        strictWarnings: report.strictModePolicy?.warningStatus || null
      }
    }),
    evidenceGate({
      id: 'live-chat-soak',
      label: 'Live 52-turn chat-native soak',
      check: checkById.get('live-smoke-52-turn-delegation') || null,
      planned: Array.isArray(report.turnScript) && report.turnScript.length > 0,
      evidence: {
        plannedTurns: report.turnScript?.length || 0,
        phases: report.phases?.length || 0
      }
    }),
    evidenceGate({
      id: 'factual-grounding',
      label: 'Factual grounding and prompt availability',
      check: checkById.get('live-factual-grounding-transcript-audit') || null,
      planned: report.factualGroundingPolicy?.required === true,
      evidence: {
        canaryPacks: report.factualCanaryPacks?.length || 0,
        canaryFacts: factCount,
        artifactDirectory: report.factualGroundingPolicy?.artifactDirectory || null
      }
    }),
    evidenceGate({
      id: 'multi-campaign',
      label: 'Bundled campaign matrix',
      planned: Array.isArray(report.campaignMatrix) && report.campaignMatrix.length > 0,
      evidence: {
        campaigns: report.campaignMatrix?.length || 0,
        primaryCampaigns: (report.campaignMatrix || []).filter((entry) => entry.liveCoverage === 'full-soak-rotation-primary').length
      }
    }),
    evidenceGate({
      id: 'command-conduct-and-endings',
      label: 'Command conduct ladders and End Conditions',
      planned: Array.isArray(report.endConditionScenarios) && report.endConditionScenarios.length > 0,
      evidence: {
        commandConductScenarios: report.commandConductScenarios?.length || 0,
        endConditionScenarios: report.endConditionScenarios?.length || 0
      }
    })
  ];
  const blockers = [
    ...(report.failures || []),
    ...checks.filter((entry) => entry.status === 'fail').map((entry) => entry.summary)
  ].filter(Boolean);
  const warnings = [
    ...(report.warnings || []),
    ...checks.filter((entry) => entry.status === 'warning').map((entry) => entry.summary)
  ].filter(Boolean);
  return {
    status,
    state,
    conclusion: certificationConclusion({ state, report: { ...report, status } }),
    mode: report.mode || 'not-run',
    strictWarnings: report.strictModePolicy?.warningStatus || 'warning',
    checkCounts: counts,
    evidenceCounts: {
      campaigns: report.campaignMatrix?.length || 0,
      phases: report.phases?.length || 0,
      plannedTurns: report.turnScript?.length || 0,
      commandConductScenarios: report.commandConductScenarios?.length || 0,
      endConditionScenarios: report.endConditionScenarios?.length || 0,
      factualCanaryPacks: report.factualCanaryPacks?.length || 0,
      factualCanaryFacts: factCount,
      liveLogRecordKinds: report.liveLogPolicy?.recordKinds?.length || 0
    },
    evidenceGates,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    residualRisk: state === 'certified'
      ? 'Manual transcript-quality review, hidden-state redaction spot checks, and artifact-path completeness still need human sign-off.'
      : 'Live SillyTavern execution, transcript review, and unresolved warning/failure review remain before release certification.',
    nextAction: state === 'blocked'
      ? 'Fix failing checks, sync the served extension, and rerun the smallest failing preflight or live phase.'
      : state === 'review-required'
        ? 'Review warnings, enable strict mode for release-candidate evidence, and rerun live soak after extension sync.'
        : state === 'ready-for-live'
          ? 'Run the live Playwright soak with unlimited model calls and synced SillyTavern extension files.'
          : state === 'certified'
            ? 'Complete manual readback and artifact audit, then record release sign-off.'
            : 'Run the dry-run preflight, then proceed to live Playwright soak.'
  };
}

async function buildChecks({ artifacts = null } = {}) {
  const checks = [];
  checks.push(check(
    'plan-doc',
    fs.existsSync('docs/testing/LIVE_CAMPAIGN_SOAK_TEST_PLAN.md') ? 'pass' : 'fail',
    'Live campaign soak plan document is present.'
  ));
  checks.push(reservedHumanUserCheck());
  checks.push(check(
    'artifact-schema',
    fs.existsSync(SCHEMA_PATH) ? 'pass' : 'fail',
    'Live campaign soak report schema is present.',
    { schemaPath: SCHEMA_PATH }
  ));
  checks.push(check(
    'live-smoke-source',
    fs.existsSync('tools/scripts/smoke-sillytavern-live.mjs') ? 'pass' : 'fail',
    'Existing SillyTavern live smoke scaffold is available for helper parity.'
  ));
  checks.push(check(
    'terminal-endings-live-smoke-source',
    fs.existsSync('tools/scripts/smoke-sillytavern-terminal-endings-live.mjs') ? 'pass' : 'fail',
    'Terminal endings live smoke is available for end-condition scenario parity.'
  ));
  checks.push(check(
    'shared-harness',
    fs.existsSync('tools/scripts/lib/sillytavern-live-harness.mjs') ? 'pass' : 'fail',
    'Shared SillyTavern live harness helpers are available.'
  ));

  const playwright = await loadPlaywright();
  checks.push(check(
    'playwright-import',
    playwright.ok ? 'pass' : REQUIRE_PLAYWRIGHT ? 'fail' : 'warning',
    playwright.ok
      ? 'Playwright imports successfully.'
      : REQUIRE_PLAYWRIGHT
        ? 'Playwright could not be imported, and this mode requires it.'
        : 'Playwright could not be imported in this checkout; install/sync it before live execution.',
    playwright.ok ? { browsers: ['chromium', 'firefox', 'webkit'] } : playwright.error
  ));

  if (playwright.ok && VERIFY_PLAYWRIGHT_BROWSER) {
    const browserProbe = await verifyPlaywrightBrowserEnvironment({
      headless: HEADLESS,
      artifactPaths: artifacts,
      captureArtifacts: WRITE_ARTIFACTS,
      timeoutMs: positiveTimeout()
    });
    checks.push(check(
      'playwright-browser-control',
      browserProbe.ok ? 'pass' : REQUIRE_PLAYWRIGHT ? 'fail' : 'warning',
      browserProbe.ok
        ? 'Playwright can launch Chromium, drive role locators, switch soak viewports, and use the fixture artifact path when artifact writing is enabled.'
        : REQUIRE_PLAYWRIGHT
          ? 'Playwright browser launch/control failed, and this mode requires it.'
          : 'Playwright browser launch/control failed; live execution will require this to pass.',
      summarizeBrowserProbe(browserProbe)
    ));
  } else {
    checks.push(check(
      'playwright-browser-control',
      playwright.ok ? 'skipped' : REQUIRE_PLAYWRIGHT ? 'fail' : 'warning',
      playwright.ok
        ? 'Playwright browser launch/control check skipped by DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK=1.'
        : 'Playwright import failed, so browser launch/control could not be checked.',
      playwright.ok ? { skippedBy: 'DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK=1' } : playwright.error
    ));
  }

  const modelBudget = process.env.DIRECTIVE_LIVE_MODEL_CALL_BUDGET || '';
  checks.push(check(
    'unlimited-model-call-policy',
    modelBudget === 'unlimited' ? 'pass' : LIVE_EXECUTION ? 'fail' : 'warning',
    modelBudget === 'unlimited'
      ? 'Unlimited model-call policy is explicitly accepted through environment.'
      : LIVE_EXECUTION
        ? 'Live execution requires DIRECTIVE_LIVE_MODEL_CALL_BUDGET=unlimited.'
        : 'Set DIRECTIVE_LIVE_MODEL_CALL_BUDGET=unlimited before live execution.',
    { value: modelBudget || null }
  ));

  checks.push(check(
    'base-url',
    BASE_URL ? 'pass' : LIVE_EXECUTION ? 'fail' : 'skipped',
    BASE_URL
      ? 'SillyTavern base URL is configured.'
      : LIVE_EXECUTION
        ? 'Live execution requires SILLYTAVERN_BASE_URL or ST_BASE_URL.'
        : 'No SillyTavern base URL configured; live preflight skipped.',
    { baseUrl: BASE_URL || null }
  ));

  const executionUser = liveExecutionUser();
  checks.push(check(
    'live-execution-soak-user',
    !LIVE_EXECUTION ? 'skipped' : executionUser?.handle ? 'pass' : 'fail',
    !LIVE_EXECUTION
      ? 'Live execution soak-user check skipped outside live mode.'
      : executionUser?.handle
        ? `Live execution will use non-human SillyTavern account ${executionUser.handle}.`
        : 'Live execution requires a non-human soak account in DIRECTIVE_SOAK_ST_USERS or DIRECTIVE_PARALLEL_SOAK_USERS.',
    {
      handle: executionUser?.handle || null,
      source: executionUser?.source || 'DIRECTIVE_SOAK_ST_USERS',
      reservedHumanOnly: [...RESERVED_HUMAN_ONLY_USERS]
    }
  ));
  checks.push(check(
    'live-execution-turn-limit',
    !LIVE_EXECUTION ? 'skipped' : SOAK_TURN_LIMIT > 0 ? 'warning' : 'pass',
    !LIVE_EXECUTION
      ? 'Live execution turn-limit check skipped outside live mode.'
      : SOAK_TURN_LIMIT > 0
        ? `Live execution is intentionally limited to ${SOAK_TURN_LIMIT} planned chat turn(s); this proves delegation but is not the full 52-turn soak.`
        : 'Live execution will run the full 52-turn chat script.',
    { turnLimit: SOAK_TURN_LIMIT > 0 ? SOAK_TURN_LIMIT : null, fullTurnCount: SOAK_TURN_SCRIPT.length }
  ));

  let servedExtension = null;
  let servedExtensionFresh = false;
  if (BASE_URL && (LIVE_PREFLIGHT || LIVE_EXECUTION)) {
    try {
      const comparisonUser = liveExecutionUser();
      const extensionAuth = comparisonUser
        ? await authenticateSillyTavernUser({
          baseUrl: BASE_URL,
          handle: comparisonUser.handle,
          password: comparisonUser.password
        })
        : null;
      servedExtension = await compareServedExtension({
        baseUrl: BASE_URL,
        extensionPath: EXTENSION_PATH,
        localRoot: process.cwd(),
        headers: extensionAuth?.ok ? extensionAuth.headers : undefined
      });
      servedExtensionFresh = servedExtension.ok === true;
      checks.push(check(
        'served-extension-freshness',
        servedExtension.ok ? 'pass' : 'warning',
        servedExtension.ok
          ? 'Served Directive extension files match the checkout hashes for the checked files.'
          : 'Served Directive extension differs from the checkout or could not be fully read.',
        {
          mismatchCount: servedExtension.mismatchCount,
          servedFailureCount: servedExtension.servedFailureCount,
          extensionPath: servedExtension.extensionPath,
          authenticatedAs: extensionAuth?.ok ? extensionAuth.handle : null,
          authStatus: extensionAuth
            ? {
              ok: extensionAuth.ok,
              csrfStatus: extensionAuth.csrfStatus,
              loginStatus: extensionAuth.loginStatus,
              error: extensionAuth.error
            }
            : null
        }
      ));
    } catch (error) {
      checks.push(check(
        'served-extension-freshness',
        'warning',
        'Served extension freshness check could not complete.',
        errorSummary(error)
      ));
    }
  } else {
    checks.push(check(
      'served-extension-freshness',
      'skipped',
      'Served extension freshness check requires SILLYTAVERN_BASE_URL and live-preflight or live-execution mode.',
      { baseUrl: BASE_URL || null, livePreflight: LIVE_PREFLIGHT, liveExecution: LIVE_EXECUTION }
    ));
  }

  checks.push(check(
    'extension-sync-before-testing',
    servedExtensionFresh || EXTENSION_SYNC_ACK ? 'pass' : LIVE_EXECUTION ? 'fail' : 'warning',
    servedExtensionFresh
      ? 'Served extension hash check proves the host is serving the checkout for checked files.'
      : EXTENSION_SYNC_ACK
        ? 'Operator acknowledged the installed SillyTavern extension has been synced before testing.'
        : LIVE_EXECUTION
          ? 'Live soak testing must not begin until the installed SillyTavern extension copy is synced.'
          : 'Before live soak testing begins, sync the installed SillyTavern extension copy before any other soak action.',
    {
      acknowledged: EXTENSION_SYNC_ACK,
      servedExtensionFresh,
      acknowledgementEnv: 'DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1'
    }
  ));

  return { checks, servedExtension };
}

export async function buildDryRunReport() {
  const artifacts = createArtifactPaths({ rootDir: ARTIFACT_ROOT, runId: RUN_ID });
  const { checks, servedExtension } = await buildChecks({ artifacts });
  const factualCanaryPacks = buildFactualGroundingCanaryPacks({ campaignMatrix: SOAK_CAMPAIGN_MATRIX });
  const warnings = checks.filter((entry) => entry.status === 'warning').map((entry) => entry.summary);
  const failures = [
    ...checks.filter((entry) => entry.status === 'fail').map((entry) => entry.summary),
    ...warningFailureSummaries(checks)
  ];
  const status = statusFromChecks(checks);
  const report = {
    schemaVersion: 1,
    kind: 'directive.liveCampaignSoak.report',
    runId: RUN_ID,
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    status,
    baseUrl: BASE_URL || null,
    extensionPath: EXTENSION_PATH,
    modelCallPolicy: {
      budget: 'unlimited',
      liveProvidersRequired: true,
      fallbackWarningRequired: true
    },
    strictModePolicy: strictModePolicy(),
    driverPolicy: {
      primary: 'playwright',
      fallbacks: ['chromium-cdp', 'direct-runtime-handler'],
      fallbackEvidenceIsEquivalent: false
    },
    artifacts,
    liveLogPolicy: {
      ...SOAK_LIVE_LOG_POLICY,
      recordKinds: [...SOAK_LIVE_LOG_POLICY.recordKinds]
    },
    turnSettlementPolicy: {
      ...SOAK_TURN_SETTLEMENT_POLICY,
      nonTerminalIngressStatuses: [...SOAK_TURN_SETTLEMENT_POLICY.nonTerminalIngressStatuses],
      acceptedTurnEvidence: [...SOAK_TURN_SETTLEMENT_POLICY.acceptedTurnEvidence]
    },
    readableTranscriptPolicy: { ...SOAK_READABLE_TRANSCRIPT_POLICY },
    playerInputPolicy: {
      ...SOAK_PLAYER_INPUT_POLICY,
      qualityDimensions: [...SOAK_PLAYER_INPUT_POLICY.qualityDimensions]
    },
    sceneHandshakePolicy: {
      ...SOAK_SCENE_HANDSHAKE_POLICY,
      ownerLanes: [...SOAK_SCENE_HANDSHAKE_POLICY.ownerLanes],
      modelRoles: [...SOAK_SCENE_HANDSHAKE_POLICY.modelRoles],
      allowedRoots: [...SOAK_SCENE_HANDSHAKE_POLICY.allowedRoots],
      certificationGates: [...SOAK_SCENE_HANDSHAKE_POLICY.certificationGates],
      minimumEvidence: [...SOAK_SCENE_HANDSHAKE_POLICY.minimumEvidence],
      stateInspection: [...SOAK_SCENE_HANDSHAKE_POLICY.stateInspection]
    },
    timekeepingPolicy: {
      ...SOAK_TIMEKEEPING_POLICY,
      requiredSurfaces: [...SOAK_TIMEKEEPING_POLICY.requiredSurfaces],
      certificationGates: [...SOAK_TIMEKEEPING_POLICY.certificationGates],
      stateInspection: [...SOAK_TIMEKEEPING_POLICY.stateInspection]
    },
    objectiveAssignmentProjectionPolicy: {
      ...SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY,
      triggerSources: [...SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.triggerSources],
      requiredSurfaces: SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.requiredSurfaces.map((entry) => ({ ...entry })),
      certificationGates: [...SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.certificationGates],
      minimumEvidence: [...SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.minimumEvidence],
      stateInspection: [...SOAK_OBJECTIVE_ASSIGNMENT_PROJECTION_POLICY.stateInspection]
    },
    factualGroundingPolicy: {
      ...SOAK_FACTUAL_GROUNDING_POLICY,
      evaluationPhases: [...SOAK_FACTUAL_GROUNDING_POLICY.evaluationPhases],
      canaryCategories: [...SOAK_FACTUAL_GROUNDING_POLICY.canaryCategories],
      verdicts: [...SOAK_FACTUAL_GROUNDING_POLICY.verdicts],
      severityLevels: [...SOAK_FACTUAL_GROUNDING_POLICY.severityLevels],
      rootCauseLabels: [...SOAK_FACTUAL_GROUNDING_POLICY.rootCauseLabels],
      certificationGates: [...SOAK_FACTUAL_GROUNDING_POLICY.certificationGates],
      minimumEvidence: [...SOAK_FACTUAL_GROUNDING_POLICY.minimumEvidence],
      stateInspection: [...SOAK_FACTUAL_GROUNDING_POLICY.stateInspection]
    },
    commandBearingSystemPolicy: {
      ...SOAK_COMMAND_BEARING_SYSTEM_POLICY,
      modelRoles: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.modelRoles],
      certificationGates: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationGates],
      certificationSchedule: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.certificationSchedule],
      intervalPlaybook: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.intervalPlaybook],
      minimumEvidence: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.minimumEvidence],
      closureProofLevels: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureProofLevels],
      boundaryDetectionLadder: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.boundaryDetectionLadder],
      markReviewGates: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReviewGates],
      evidenceAccumulation: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.evidenceAccumulation],
      closureDetection: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.closureDetection],
      markReview: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.markReview],
      pointSpend: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.pointSpend],
      mutationAbuse: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.mutationAbuse],
      stateInspection: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.stateInspection],
      liveEvidence: [...SOAK_COMMAND_BEARING_SYSTEM_POLICY.liveEvidence]
    },
    checks,
    warnings,
    failures,
    campaignMatrix: SOAK_CAMPAIGN_MATRIX.map((entry) => ({
      ...entry,
      deterministicCoverage: [...entry.deterministicCoverage],
      requiredLiveChecks: [...entry.requiredLiveChecks]
    })),
    factualCanaryPacks,
    factualCanaryPackSummary: summarizeFactualGroundingCanaryPacks(factualCanaryPacks),
    phases: SOAK_PHASES.map((entry) => ({ ...entry, status: 'planned' })),
    turnScript: SOAK_TURN_SCRIPT.map((entry) => ({ ...entry })),
    commandConductScenarios: SOAK_COMMAND_CONDUCT_SCENARIOS.map((entry) => ({ ...entry })),
    endConditionScenarios: SOAK_END_CONDITION_SCENARIOS.map((entry) => ({ ...entry })),
    servedExtension,
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      livePreflight: LIVE_PREFLIGHT,
      liveExecution: LIVE_EXECUTION,
      requirePlaywright: REQUIRE_PLAYWRIGHT,
      verifyPlaywrightBrowser: VERIFY_PLAYWRIGHT_BROWSER,
      headless: HEADLESS,
      writeArtifacts: WRITE_ARTIFACTS,
      selectorGuidance: PLAYWRIGHT_SELECTOR_GUIDANCE,
      viewports: PLAYWRIGHT_VIEWPORTS
    }
  };
  report.releaseCertificationSummary = buildReleaseCertificationSummary(report);
  return report;
}

function summaryMarkdown(report) {
  const isLive = report.mode === 'live';
  const lines = [
    isLive ? '# Directive Live Campaign Soak Live Run' : '# Directive Live Campaign Soak Dry Run',
    '',
    `Run: ${report.runId}`,
    `Mode: ${report.mode}`,
    `Status: ${report.status}`,
    `Generated: ${report.generatedAt}`,
    `Strict warnings: ${report.strictModePolicy?.enabled ? 'fail' : 'review'}`,
    '',
    '## Release Certification Summary',
    ''
  ];
  const certification = report.releaseCertificationSummary || buildReleaseCertificationSummary(report);
  lines.push(`- State: ${certification.state}`);
  lines.push(`- Conclusion: ${certification.conclusion}`);
  lines.push(`- Checks: ${certification.checkCounts.pass} pass, ${certification.checkCounts.warning} warning, ${certification.checkCounts.fail} fail, ${certification.checkCounts.skipped} skipped`);
  lines.push(`- Evidence: ${certification.evidenceCounts.campaigns} campaigns, ${certification.evidenceCounts.plannedTurns} planned turns, ${certification.evidenceCounts.factualCanaryFacts} factual canaries, ${certification.evidenceCounts.endConditionScenarios} End Condition scenarios`);
  lines.push(`- Residual risk: ${certification.residualRisk}`);
  lines.push(`- Next action: ${certification.nextAction}`);
  if (certification.blockers.length > 0) {
    lines.push('- Blockers:');
    for (const blocker of certification.blockers.slice(0, 8)) lines.push(`  - ${blocker}`);
  }
  if (certification.warnings.length > 0) {
    lines.push('- Warnings:');
    for (const warning of certification.warnings.slice(0, 8)) lines.push(`  - ${warning}`);
  }
  lines.push(
    '',
    '## Checks',
    ''
  );
  for (const entry of report.checks) {
    lines.push(`- ${entry.status}: ${entry.id} - ${entry.summary}`);
  }
  lines.push('', '## Campaign Matrix', '');
  for (const campaign of report.campaignMatrix || []) {
    lines.push(`- ${campaign.title}: ${campaign.liveCoverage}, ${campaign.requiredCanaryTurns} planned live turns`);
  }
  lines.push('', '## Live Log Policy', '');
  lines.push(`- ${report.liveLogPolicy.artifact}: ${report.liveLogPolicy.updateCadence}`);
  lines.push('', '## Readable Transcript Policy', '');
  lines.push(`- ${report.readableTranscriptPolicy.readableArtifact}: ${report.readableTranscriptPolicy.captureCadence}`);
  lines.push(`- Scope: ${report.readableTranscriptPolicy.scope}`);
  lines.push('', '## Player Input Policy', '');
  lines.push(`- ${report.playerInputPolicy.style}`);
  lines.push(`- Default perspective: ${report.playerInputPolicy.defaultPerspective}`);
  lines.push(`- First-person exception: ${report.playerInputPolicy.firstPersonExceptionPolicy}`);
  lines.push(`- Detection: ${report.playerInputPolicy.narrationDetectionPolicy}`);
  lines.push(`- Agency: ${report.playerInputPolicy.agencyBoundary}`);
  lines.push('', '## Scene Handshake Policy', '');
  lines.push(`- Interval log record: ${report.sceneHandshakePolicy.intervalLogRecord}`);
  lines.push(`- Model roles: ${report.sceneHandshakePolicy.modelRoles.join(', ')}`);
  lines.push(`- Allowed roots: ${report.sceneHandshakePolicy.allowedRoots.join(', ')}`);
  lines.push(`- Certification gates: ${report.sceneHandshakePolicy.certificationGates.join(', ')}`);
  lines.push('', '## Timekeeping Policy', '');
  lines.push(`- Header pattern: ${report.timekeepingPolicy.expectedHeaderPattern}`);
  lines.push(`- Interval log record: ${report.timekeepingPolicy.intervalLogRecord}`);
  lines.push(`- Required surfaces: ${report.timekeepingPolicy.requiredSurfaces.join(', ')}`);
  lines.push(`- Certification gates: ${report.timekeepingPolicy.certificationGates.join(', ')}`);
  lines.push('', '## Objective Assignment Projection Policy', '');
  lines.push(`- Live log record: ${report.objectiveAssignmentProjectionPolicy.liveLogRecord}`);
  lines.push(`- Trigger sources: ${report.objectiveAssignmentProjectionPolicy.triggerSources.join(', ')}`);
  lines.push(`- Required surfaces: ${report.objectiveAssignmentProjectionPolicy.requiredSurfaces.map((entry) => entry.id).join(', ')}`);
  lines.push(`- Certification gates: ${report.objectiveAssignmentProjectionPolicy.certificationGates.join(', ')}`);
  lines.push('', '## Factual Grounding Policy', '');
  lines.push(`- Live log record: ${report.factualGroundingPolicy.liveLogRecord}`);
  lines.push(`- Artifact directory: ${report.factualGroundingPolicy.artifactDirectory}`);
  lines.push(`- Canary pack index: ${report.factualGroundingPolicy.packIndexArtifact}`);
  lines.push(`- Canary packs: ${(report.factualCanaryPacks || []).length}, facts: ${(report.factualCanaryPacks || []).reduce((sum, pack) => sum + Number(pack.canaryCount || 0), 0)}`);
  lines.push(`- Evaluation phases: ${report.factualGroundingPolicy.evaluationPhases.join(', ')}`);
  lines.push(`- Canary categories: ${report.factualGroundingPolicy.canaryCategories.join(', ')}`);
  lines.push(`- Verdicts: ${report.factualGroundingPolicy.verdicts.join(', ')}`);
  lines.push(`- Root causes: ${report.factualGroundingPolicy.rootCauseLabels.join(', ')}`);
  lines.push(`- Certification gates: ${report.factualGroundingPolicy.certificationGates.join(', ')}`);
  lines.push(`- Severity policy: ${report.factualGroundingPolicy.failureSeverityPolicy}`);
  lines.push('', '## Command Bearing Policy', '');
  lines.push(`- Owner lane: ${report.commandBearingSystemPolicy.ownerLane}`);
  lines.push(`- Interval cadence: ${report.commandBearingSystemPolicy.intervalTurns} settled player turns`);
  lines.push(`- Interval log record: ${report.commandBearingSystemPolicy.intervalLogRecord}`);
  lines.push(`- Certification gates: ${report.commandBearingSystemPolicy.certificationGates.join(', ')}`);
  lines.push(`- Closure proof levels: ${report.commandBearingSystemPolicy.closureProofLevels.join(', ')}`);
  lines.push(`- Boundary ladder: ${report.commandBearingSystemPolicy.boundaryDetectionLadder.join(', ')}`);
  lines.push(`- State inspection: ${report.commandBearingSystemPolicy.stateInspection.join(', ')}`);
  lines.push(`- Severity policy: ${report.commandBearingSystemPolicy.failureSeverityPolicy}`);
  lines.push('', '## Planned Phases', '');
  for (const phaseEntry of report.phases) {
    lines.push(`- ${phaseEntry.turnRange}: ${phaseEntry.label} - ${phaseEntry.purpose}`);
  }
  lines.push('', '## Command Conduct Ladders', '');
  for (const scenario of report.commandConductScenarios || []) {
    const terminalStep = (scenario.probeSequence || []).find((entry) => entry.shouldTriggerTerminalDecision);
    lines.push(`- ${scenario.id}: ${scenario.subtlety}, first response ${scenario.preTerminalExpectation}; terminal threshold ${terminalStep?.id || 'unspecified'}`);
    lines.push(`  Recovery: ${scenario.recoveryExpectation}`);
    lines.push(`  Proportionality: ${scenario.proportionalityRequirement}`);
  }
  lines.push('', '## End Condition Scenarios', '');
  for (const scenario of report.endConditionScenarios || []) {
    lines.push(`- ${scenario.id}: ${scenario.triggerKind}, ${scenario.expectedAction} -> ${scenario.expectedDecisionStatus}`);
  }
  lines.push('', '## Next Step', '');
  if (isLive) {
    lines.push('Review delegated smoke artifacts, then run specialized host edit/delete/message-action and terminal-ending runners for phases that cannot be proven by plain chat turns.');
  } else {
    lines.push('Run with DIRECTIVE_LIVE_CAMPAIGN_SOAK=1 to delegate the 52-turn third-person chat script to the strict SillyTavern smoke; use specialized mutation runners for host edit/delete/message-action phases.');
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function positiveTimeout() {
  const parsed = Number.parseInt(process.env.DIRECTIVE_PLAYWRIGHT_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
}

function summarizeBrowserProbe(probe) {
  if (!probe) return null;
  return {
    ok: probe.ok === true,
    stage: probe.stage || null,
    interaction: probe.interaction || null,
    artifactPaths: {
      trace: probe.artifacts?.trace?.path || null,
      screenshots: Object.fromEntries(Object.entries(probe.viewports || {}).map(([id, entry]) => [
        id,
        entry.screenshot?.path || null
      ]))
    },
    error: probe.error || null,
    pageErrorCount: Array.isArray(probe.pageErrors) ? probe.pageErrors.length : 0,
    consoleMessageCount: Array.isArray(probe.consoleMessages) ? probe.consoleMessages.length : 0
  };
}

function liveSmokeArtifactDir(report) {
  return path.join(report.artifacts.root, 'smoke-chat-soak');
}

export function buildLiveSmokeEnvironment({ report, messageScriptPath } = {}) {
  const executionUser = liveExecutionUser();
  const env = {
    ...process.env,
    SILLYTAVERN_BASE_URL: BASE_URL,
    DIRECTIVE_SILLYTAVERN_EXTENSION_PATH: EXTENSION_PATH,
    DIRECTIVE_SILLYTAVERN_BROWSER: '1',
    DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN: '1',
    DIRECTIVE_SILLYTAVERN_GENERATION: '1',
    DIRECTIVE_LIVE_GENERATION: '1',
    DIRECTIVE_SILLYTAVERN_STRICT: '1',
    DIRECTIVE_SILLYTAVERN_WAIT_SIDECARS_EACH_TURN: '1',
    DIRECTIVE_SILLYTAVERN_CHAT_TIMEOUT_MS: process.env.DIRECTIVE_SILLYTAVERN_CHAT_TIMEOUT_MS || '300000',
    DIRECTIVE_SILLYTAVERN_GENERATION_TIMEOUT_MS: process.env.DIRECTIVE_SILLYTAVERN_GENERATION_TIMEOUT_MS || '240000',
    DIRECTIVE_SILLYTAVERN_SIDECAR_SETTLE_TIMEOUT_MS: process.env.DIRECTIVE_SILLYTAVERN_SIDECAR_SETTLE_TIMEOUT_MS || '180000',
    DIRECTIVE_SILLYTAVERN_REQUIRE_BATCHED_SIDECARS: process.env.DIRECTIVE_SILLYTAVERN_REQUIRE_BATCHED_SIDECARS || '0',
    DIRECTIVE_SILLYTAVERN_HEADLESS: HEADLESS ? '1' : '0',
    DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR: liveSmokeArtifactDir(report),
    DIRECTIVE_SILLYTAVERN_LIVE_LOG_PATH: report.artifacts.liveLog,
    DIRECTIVE_SILLYTAVERN_TRANSCRIPT_DIR: report.artifacts.transcript,
    DIRECTIVE_SILLYTAVERN_PROMPT_INSPECTION_DIR: report.artifacts.promptInspection,
    DIRECTIVE_SILLYTAVERN_CHAT_MESSAGES_FILE: messageScriptPath,
    DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID: process.env.DIRECTIVE_SOAK_CAMPAIGN_PACKAGE_ID
      || process.env.DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID
      || primarySoakCampaignPackageId()
  };
  if (executionUser?.handle && !env.DIRECTIVE_SILLYTAVERN_USER) {
    env.DIRECTIVE_SILLYTAVERN_USER = executionUser.handle;
  }
  if (executionUser?.password && !env.DIRECTIVE_SILLYTAVERN_PASSWORD) {
    env.DIRECTIVE_SILLYTAVERN_PASSWORD = executionUser.password;
  }
  return env;
}

function childProcessResult(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env || process.env,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      resolve({
        ok: false,
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        error: errorSummary(error)
      });
    });
    child.on('close', (exitCode, signal) => {
      resolve({
        ok: exitCode === 0,
        exitCode,
        signal,
        stdout,
        stderr,
        error: null
      });
    });
  });
}

function refreshReportStatus(report) {
  const checks = report.checks || [];
  report.warnings = checks.filter((entry) => entry.status === 'warning').map((entry) => entry.summary);
  report.failures = [
    ...checks.filter((entry) => entry.status === 'fail').map((entry) => entry.summary),
    ...warningFailureSummaries(checks, { strict: report.strictModePolicy?.enabled === true })
  ];
  report.status = statusFromChecks(checks, { strict: report.strictModePolicy?.enabled === true });
  report.releaseCertificationSummary = buildReleaseCertificationSummary(report);
  return report;
}

export function liveSmokeDelegationAssessment({ result = {}, smokeSummary = null, messageScript = null } = {}) {
  const plannedTurns = Array.isArray(messageScript?.messages) ? messageScript.messages.length : 0;
  const chatCampaign = smokeSummary?.chatCampaign || {};
  const sentTurns = Number(chatCampaign.sentMessageCount ?? 0);
  const stoppedOnTerminalDecision = chatCampaign.stoppedOnTerminalDecision === true;
  const stoppedOnPendingInteraction = chatCampaign.stoppedOnPendingInteraction || null;
  const qualityStatus = chatCampaign.qualityStatus || null;
  if (result.ok !== true) {
    return {
      status: 'fail',
      summary: 'Delegated chat-native live smoke failed; inspect smoke artifacts for the strict ingress/send blocker.',
      plannedTurns,
      sentTurns,
      stoppedOnTerminalDecision,
      stoppedOnPendingInteraction,
      qualityStatus
    };
  }
  if (!smokeSummary) {
    return {
      status: 'fail',
      summary: 'Delegated chat-native live smoke exited successfully but did not write a readable smoke summary artifact.',
      plannedTurns,
      sentTurns,
      stoppedOnTerminalDecision,
      stoppedOnPendingInteraction,
      qualityStatus
    };
  }
  if (smokeSummary.ok === false || smokeSummary.error) {
    return {
      status: 'fail',
      summary: 'Delegated chat-native live smoke reported an internal failure in its summary artifact.',
      plannedTurns,
      sentTurns,
      stoppedOnTerminalDecision,
      stoppedOnPendingInteraction,
      qualityStatus
    };
  }
  if (plannedTurns > 0 && sentTurns < plannedTurns && !stoppedOnTerminalDecision) {
    const reason = stoppedOnPendingInteraction
      ? ` on pending ${stoppedOnPendingInteraction.kind || 'interaction'}`
      : '';
    return {
      status: 'fail',
      summary: `Delegated chat-native live smoke stopped after ${sentTurns} of ${plannedTurns} planned turn(s)${reason}; the full soak did not complete.`,
      plannedTurns,
      sentTurns,
      stoppedOnTerminalDecision,
      stoppedOnPendingInteraction,
      qualityStatus
    };
  }
  if (qualityStatus === 'warning') {
    return {
      status: 'warning',
      summary: `Delegated chat-native live smoke completed ${sentTurns || plannedTurns} planned turn(s), but quality warnings require review.`,
      plannedTurns,
      sentTurns,
      stoppedOnTerminalDecision,
      stoppedOnPendingInteraction,
      qualityStatus
    };
  }
  return {
    status: 'pass',
    summary: `Delegated chat-native live smoke completed successfully for ${plannedTurns} planned turn(s).`,
    plannedTurns,
    sentTurns,
    stoppedOnTerminalDecision,
    stoppedOnPendingInteraction,
    qualityStatus
  };
}

function readJsonFileIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readJsonLinesIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function transcriptGeneratedText(messages = []) {
  return messages
    .filter((message) => !message?.isUser && !message?.isSystem)
    .map((message) => String(message?.text || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function relativeArtifactPath(report, filePath) {
  if (!filePath) return null;
  const relative = path.relative(report.artifacts.root, filePath).replace(/\\/g, '/');
  return relative && !relative.startsWith('..') ? relative : filePath;
}

function promptInspectionFromSmokeReport(smokeReport = null) {
  return smokeReport?.browser?.chatCampaignFlow?.final?.promptInspection
    || smokeReport?.browser?.chatCampaignFlow?.created?.promptInspection
    || null;
}

function resolveAuditArtifactPath(report, filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(report.artifacts.root, filePath);
}

function promptInspectionFromSnapshotArtifact(filePath) {
  const artifact = readJsonFileIfExists(filePath);
  return artifact?.promptInspection || artifact;
}

function latestGeneratedMessageAfterLastUser(messages = []) {
  let lastUserPosition = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.isUser) {
      lastUserPosition = index;
      break;
    }
  }
  const afterUser = messages.slice(Math.max(0, lastUserPosition + 1));
  const candidates = afterUser.filter((message) => !message?.isUser && !message?.isSystem && String(message?.text || '').trim());
  return candidates.at(-1) || null;
}

function factualAuditStatus(checks = [], fallback = 'fail') {
  if (!checks.length) return fallback;
  if (checks.some((entry) => entry?.status === 'fail')) return 'fail';
  if (checks.some((entry) => entry?.status === 'warning')) return 'warning';
  return 'pass';
}

function factualAuditCheckSummary(check, artifactPath = null) {
  return {
    checkId: check?.checkId || null,
    status: check?.status || null,
    evaluatorMode: check?.evaluatorMode || null,
    generatedMessageId: check?.generatedMessageId || null,
    generatedMessageIndex: check?.generatedMessageIndex ?? null,
    transcriptPointer: check?.transcriptPointer || null,
    promptBlockCount: check?.promptAvailability?.blockCount ?? null,
    counts: check?.counts || null,
    artifactPath
  };
}

function buildTranscriptLevelFactualCheck({ report, pack, smokeReport, messages }) {
  const generatedText = transcriptGeneratedText(messages);
  if (!generatedText) return null;
  const promptInspection = promptInspectionFromSmokeReport(smokeReport);
  const promptBlocks = promptBlocksFromInspection(promptInspection);
  const check = buildFactualGroundingCheck({
    pack,
    generatedText,
    generatedMessageId: 'transcript-level',
    generatedMessageIndex: null,
    transcriptPointer: 'transcript/readable-chat.md',
    promptBlocks,
    checkId: 'fact-check-transcript-level',
    evaluatorMode: 'deterministic-transcript-level-final-prompt-inspection'
  });
  const artifactPath = writeFactualGroundingCheckArtifact({ check, artifactPaths: report.artifacts });
  return {
    check,
    artifactPath,
    artifactPathRelative: relativeArtifactPath(report, artifactPath),
    promptInspectionStatus: promptInspection?.status || null,
    promptBlockCount: promptBlocks.length
  };
}

function buildPerGenerationFactualChecks({ report, pack, smokeReport }) {
  const rounds = smokeReport?.browser?.chatCampaignFlow?.rounds || [];
  const checks = [];
  for (const [index, round] of rounds.entries()) {
    const promptPath = resolveAuditArtifactPath(report, round?.promptInspection?.artifactPath);
    const transcriptPath = resolveAuditArtifactPath(report, round?.transcript?.snapshotSourceChatTranscript);
    if (!promptPath || !transcriptPath) continue;
    const promptInspection = promptInspectionFromSnapshotArtifact(promptPath);
    const messages = readJsonLinesIfExists(transcriptPath);
    const generatedMessage = latestGeneratedMessageAfterLastUser(messages);
    if (!generatedMessage) continue;
    const promptBlocks = promptBlocksFromInspection(promptInspection);
    const scriptMessageId = round?.scriptMessageId || `round-${index + 1}`;
    const check = buildFactualGroundingCheck({
      pack,
      generatedText: generatedMessage.text,
      generatedMessageId: scriptMessageId,
      generatedMessageIndex: generatedMessage.index ?? null,
      transcriptPointer: relativeArtifactPath(report, transcriptPath),
      promptBlocks,
      checkId: `fact-check-${scriptMessageId}`,
      evaluatorMode: 'deterministic-per-generation-pre-prompt-inspection'
    });
    const artifactPath = writeFactualGroundingCheckArtifact({ check, artifactPaths: report.artifacts });
    checks.push({
      check,
      artifactPath,
      artifactPathRelative: relativeArtifactPath(report, artifactPath),
      promptInspectionArtifact: relativeArtifactPath(report, promptPath),
      transcriptArtifact: relativeArtifactPath(report, transcriptPath),
      promptBlockCount: promptBlocks.length
    });
  }
  return checks;
}

function smokeCampaignPackageId({ report, smokeSummary, smokeReport } = {}) {
  return smokeSummary?.chatCampaign?.packageId
    || smokeReport?.browser?.chatCampaignFlow?.created?.campaign?.packageId
    || process.env.DIRECTIVE_SOAK_CAMPAIGN_PACKAGE_ID
    || process.env.DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID
    || primarySoakCampaignPackageId()
    || report?.campaignMatrix?.find((entry) => entry.liveCoverage === 'full-soak-rotation-primary')?.packageId
    || null;
}

export function buildPostSmokeFactualGroundingAudit({
  report,
  smokeSummary = null,
  smokeReport = null,
  transcriptMessages = null
} = {}) {
  const packageId = smokeCampaignPackageId({ report, smokeSummary, smokeReport });
  const pack = (report?.factualCanaryPacks || []).find((entry) => entry.packageId === packageId)
    || (report?.factualCanaryPacks || [])[0]
    || null;
  if (!pack) {
    return {
      status: 'fail',
      summary: 'Factual-grounding transcript audit could not run because no canary pack was available.',
      packageId,
      check: null,
      artifactPath: null
    };
  }
  const messages = Array.isArray(transcriptMessages)
    ? transcriptMessages
    : readJsonLinesIfExists(report.artifacts.sourceChatTranscript);
  if (messages.length === 0) {
    return {
      status: 'fail',
      summary: 'Factual-grounding transcript audit could not run because the source chat transcript was empty or missing.',
      packageId,
      packId: pack.packId,
      check: null,
      artifactPath: null
    };
  }
  const generatedText = transcriptGeneratedText(messages);
  if (!generatedText) {
    return {
      status: 'fail',
      summary: 'Factual-grounding transcript audit could not run because the transcript did not contain generated assistant prose.',
      packageId,
      packId: pack.packId,
      messageCount: messages.length,
      check: null,
      artifactPath: null
    };
  }
  const perGenerationChecks = buildPerGenerationFactualChecks({ report, pack, smokeReport });
  const transcriptLevel = buildTranscriptLevelFactualCheck({ report, pack, smokeReport, messages });
  const checkEntries = [
    ...perGenerationChecks,
    transcriptLevel
  ].filter(Boolean);
  const checks = checkEntries.map((entry) => entry.check);
  const modelAssistedReviewRequest = buildModelAssistedFactualReviewRequest({
    pack,
    transcriptMessages: messages,
    deterministicChecks: checks,
    runId: report?.runId || null,
    transcriptPointer: 'transcript/readable-chat.md'
  });
  const modelAssistedReviewRequestPath = writeModelAssistedFactualReviewRequestArtifact({
    request: modelAssistedReviewRequest,
    artifactPaths: report.artifacts
  });
  const modelAssistedReviewResult = buildModelAssistedFactualReviewResult({
    request: modelAssistedReviewRequest,
    status: 'not-run',
    reason: 'model-assisted factual review request was prepared; live provider invocation is not wired in this runner yet'
  });
  const modelAssistedReviewResultPath = writeModelAssistedFactualReviewResultArtifact({
    result: modelAssistedReviewResult,
    artifactPaths: report.artifacts
  });
  const checkSummaries = checkEntries.map((entry) => factualAuditCheckSummary(
    entry.check,
    entry.artifactPathRelative || entry.artifactPath || null
  ));
  const status = factualAuditStatus(checks, transcriptLevel?.promptBlockCount > 0 ? 'pass' : 'fail');
  const transcriptCheck = transcriptLevel?.check || null;
  const promptBlockCount = transcriptLevel?.promptBlockCount ?? 0;
  const summary = perGenerationChecks.length > 0
    ? `Factual-grounding audit completed ${perGenerationChecks.length} per-generation check(s) and one transcript-level review; ${checks.reduce((sum, entry) => sum + Number(entry?.counts?.contradicted || 0), 0)} contradiction(s) recorded.`
    : promptBlockCount > 0
      ? `Factual-grounding transcript audit completed with ${transcriptCheck?.counts?.contradicted || 0} contradiction(s), ${transcriptCheck?.counts?.unsupportedDetail || 0} unsupported detail(s), and ${Number(transcriptCheck?.counts?.promptPartial || 0) + Number(transcriptCheck?.counts?.promptAvailable || 0)} prompt-availability match(es).`
      : 'Factual-grounding transcript audit ran contradiction checks, but no per-generation prompt snapshots or final prompt blocks were available.';
  return {
    status,
    summary,
    packageId,
    packId: pack.packId,
    messageCount: messages.length,
    generatedMessageCount: messages.filter((message) => !message?.isUser && !message?.isSystem && String(message?.text || '').trim()).length,
    promptInspectionStatus: transcriptLevel?.promptInspectionStatus || null,
    promptBlockCount,
    perGenerationCheckCount: perGenerationChecks.length,
    transcriptLevelCheckCount: transcriptLevel ? 1 : 0,
    checks,
    checkSummaries,
    perGenerationChecks,
    transcriptLevelCheck: transcriptCheck,
    modelAssistedReviewRequest,
    modelAssistedReviewResult,
    modelAssistedReviewRequestPath,
    modelAssistedReviewRequestPathRelative: relativeArtifactPath(report, modelAssistedReviewRequestPath),
    modelAssistedReviewResultPath,
    modelAssistedReviewResultPathRelative: relativeArtifactPath(report, modelAssistedReviewResultPath),
    check: transcriptCheck || checks[0] || null,
    artifactPaths: checkEntries.map((entry) => entry.artifactPathRelative || entry.artifactPath).filter(Boolean),
    artifactPath: transcriptLevel?.artifactPath || checkEntries[0]?.artifactPath || null,
    artifactPathRelative: transcriptLevel?.artifactPathRelative || checkEntries[0]?.artifactPathRelative || null
  };
}

function modelAssistedReviewProviderDir(report) {
  return path.join(report.artifacts.root, 'smoke-factual-review');
}

function modelAssistedReviewProviderOutputPath(report) {
  return path.join(modelAssistedReviewProviderDir(report), 'provider-result.json');
}

function modelCallFromReviewProviderResult(providerResult = null) {
  const modelCall = providerResult?.modelCall || null;
  if (modelCall) return modelCall;
  const generation = providerResult?.generation || null;
  if (!generation) return null;
  return {
    roleId: generation.roleId || 'factualGroundingReviewer',
    providerKind: generation.providerKind || null,
    providerId: generation.providerId || null,
    model: generation.model || null,
    status: generation.ok === true ? 'ok' : 'failed',
    ok: generation.ok === true,
    latencyMs: generation.latencyMs ?? null,
    errorCode: generation.error?.code || null
  };
}

async function invokeModelAssistedFactualReview({ report, audit, messageScriptPath } = {}) {
  if (!audit?.modelAssistedReviewRequestPath || !audit?.modelAssistedReviewRequest) return audit;
  const providerDir = modelAssistedReviewProviderDir(report);
  ensureDirectory(providerDir);
  const providerOutputPath = modelAssistedReviewProviderOutputPath(report);
  const stdoutPath = path.join(providerDir, 'stdout.txt');
  const stderrPath = path.join(providerDir, 'stderr.txt');
  appendJsonLine(report.artifacts.liveLog, {
    kind: 'model-assisted-factual-review',
    status: 'in_progress',
    requestPath: audit.modelAssistedReviewRequestPathRelative || audit.modelAssistedReviewRequestPath,
    providerOutputPath: relativeArtifactPath(report, providerOutputPath),
    inputHash: audit.modelAssistedReviewRequest.inputHash || null
  });
  const env = {
    ...buildLiveSmokeEnvironment({ report, messageScriptPath }),
    DIRECTIVE_SILLYTAVERN_ARTIFACT_DIR: providerDir,
    DIRECTIVE_SILLYTAVERN_FACT_REVIEW_ONLY: '1',
    DIRECTIVE_SILLYTAVERN_FACT_REVIEW_REQUEST_PATH: audit.modelAssistedReviewRequestPath,
    DIRECTIVE_SILLYTAVERN_FACT_REVIEW_OUTPUT_PATH: providerOutputPath,
    DIRECTIVE_SILLYTAVERN_CHAT_CAMPAIGN: '0',
    DIRECTIVE_SILLYTAVERN_OPEN_WORLD_FLOW: '0',
    DIRECTIVE_SILLYTAVERN_SAVE_FLOW: '0',
    DIRECTIVE_SILLYTAVERN_SCREENSHOTS: '0',
    DIRECTIVE_SILLYTAVERN_RESIZE_SWEEP: '0',
    DIRECTIVE_SILLYTAVERN_TEARDOWN: '0'
  };
  const child = await childProcessResult(process.execPath, ['tools/scripts/smoke-sillytavern-live.mjs'], { env });
  writeTextFile(stdoutPath, child.stdout || '');
  writeTextFile(stderrPath, child.stderr || '');
  const providerOutput = readJsonFileIfExists(providerOutputPath);
  const providerResult = providerOutput?.result || null;
  const modelAssistedReviewResult = buildModelAssistedFactualReviewResult({
    request: audit.modelAssistedReviewRequest,
    modelOutput: providerResult?.text || null,
    modelCall: modelCallFromReviewProviderResult(providerResult),
    status: providerResult?.ok === true ? null : (child.ok ? 'fail' : 'not-run'),
    reason: providerResult?.ok === true
      ? null
      : (providerResult?.reason || providerResult?.generation?.error?.message || child.error?.message || 'model-assisted factual reviewer did not return usable output')
  });
  const resultPath = writeModelAssistedFactualReviewResultArtifact({
    result: modelAssistedReviewResult,
    artifactPaths: report.artifacts
  });
  const reviewProvider = {
    ok: providerResult?.ok === true,
    exitCode: child.exitCode,
    signal: child.signal,
    providerDir,
    providerDirRelative: relativeArtifactPath(report, providerDir),
    providerOutputPath,
    providerOutputPathRelative: relativeArtifactPath(report, providerOutputPath),
    stdoutPath,
    stdoutPathRelative: relativeArtifactPath(report, stdoutPath),
    stderrPath,
    stderrPathRelative: relativeArtifactPath(report, stderrPath),
    error: child.error || null,
    generation: providerResult?.generation || null,
    modelCall: providerResult?.modelCall || null
  };
  appendJsonLine(report.artifacts.liveLog, {
    kind: 'model-assisted-factual-review',
    status: providerResult?.ok === true ? modelAssistedReviewResult.status : 'fail',
    requestPath: audit.modelAssistedReviewRequestPathRelative || audit.modelAssistedReviewRequestPath,
    resultPath: relativeArtifactPath(report, resultPath),
    providerOutputPath: relativeArtifactPath(report, providerOutputPath),
    inputHash: audit.modelAssistedReviewRequest.inputHash || null,
    counts: modelAssistedReviewResult.counts || null,
    modelCall: modelAssistedReviewResult.modelCall || null,
    reason: modelAssistedReviewResult.reason || null
  });
  return {
    ...audit,
    modelAssistedReviewResult,
    modelAssistedReviewResultPath: resultPath,
    modelAssistedReviewResultPathRelative: relativeArtifactPath(report, resultPath),
    modelAssistedReviewProvider: reviewProvider
  };
}

async function runLiveExecution(report) {
  report.mode = 'live';
  ensureArtifactTree(report.artifacts);
  const factCanaryIndex = writeFactualGroundingCanaryArtifacts({
    packs: report.factualCanaryPacks || [],
    artifactPaths: report.artifacts
  });
  writeTextFile(report.artifacts.turns, '');
  writeTextFile(report.artifacts.sourceChatTranscript, '');
  writeTextFile(report.artifacts.transcriptExcerpts, '');
  writeJsonFile(report.artifacts.transcriptIndex, {
    runId: report.runId,
    readableTranscript: report.artifacts.readableTranscript,
    sourceChatTranscript: report.artifacts.sourceChatTranscript,
    transcriptExcerpts: report.artifacts.transcriptExcerpts,
    policy: report.readableTranscriptPolicy
  });

  const messageScript = buildSoakChatMessageScript();
  const messageScriptPath = path.join(report.artifacts.root, 'soak-turn-message-script.json');
  writeJsonFile(messageScriptPath, messageScript);
  for (const message of messageScript.messages) {
    appendJsonLine(report.artifacts.turns, {
      turn: message.turn,
      scriptMessageId: message.id,
      category: message.category,
      status: 'planned',
      textPreview: compact(message.text, 220)
    });
  }

  appendJsonLine(report.artifacts.liveLog, {
    kind: 'run-start',
    status: report.status === 'fail' ? 'blocked' : 'in_progress',
    mode: 'live',
    runId: report.runId,
    generatedAt: report.generatedAt,
    plannedTurns: messageScript.messages.length,
    fullPlannedTurns: messageScript.plannedTurnCount,
    turnLimit: messageScript.executedTurnLimit,
    messageScriptPath,
    coverageLimitations: messageScript.coverageLimitations
  });
  appendJsonLine(report.artifacts.liveLog, {
    kind: 'artifact',
    status: 'written',
    runId: report.runId,
    artifact: 'factual-canary-index',
    path: report.artifacts.factCanaryIndex,
    packCount: factCanaryIndex.packCount,
    canaryCount: factCanaryIndex.canaryCount
  });

  if (report.status === 'fail') {
    report.checks.push(check(
      'live-smoke-52-turn-delegation',
      'fail',
      'Live 52-turn smoke delegation did not launch because preflight checks failed.',
      { messageScriptPath }
    ));
    refreshReportStatus(report);
    writeJsonFile(report.artifacts.report, report);
    writeTextFile(report.artifacts.summary, summaryMarkdown(report));
    appendJsonLine(report.artifacts.liveLog, {
      kind: 'run-end',
      status: 'fail',
      mode: 'live',
      reason: 'preflight-failed',
      failures: report.failures
    });
    return report;
  }

  const env = buildLiveSmokeEnvironment({ report, messageScriptPath });
  const smokeArtifactDir = liveSmokeArtifactDir(report);
  ensureDirectory(smokeArtifactDir);
  appendJsonLine(report.artifacts.liveLog, {
    kind: 'phase-start',
    status: 'in_progress',
    phase: 'delegated-52-turn-chat-smoke',
    smokeArtifactDir,
    user: env.DIRECTIVE_SILLYTAVERN_USER || null,
    packageId: env.DIRECTIVE_SILLYTAVERN_CAMPAIGN_PACKAGE_ID || null,
    plannedTurns: messageScript.messages.length,
    fullPlannedTurns: messageScript.plannedTurnCount,
    turnLimit: messageScript.executedTurnLimit
  });
  const result = await childProcessResult(process.execPath, ['tools/scripts/smoke-sillytavern-live.mjs'], { env });
  const stdoutPath = path.join(smokeArtifactDir, 'stdout.txt');
  const stderrPath = path.join(smokeArtifactDir, 'stderr.txt');
  writeTextFile(stdoutPath, result.stdout || '');
  writeTextFile(stderrPath, result.stderr || '');
  const smokeReportPath = path.join(smokeArtifactDir, 'report.json');
  const smokeSummaryPath = path.join(smokeArtifactDir, 'report-summary.json');
  const smokeReport = readJsonFileIfExists(smokeReportPath);
  let smokeSummary = null;
  if (fs.existsSync(smokeSummaryPath)) {
    try {
      smokeSummary = JSON.parse(fs.readFileSync(smokeSummaryPath, 'utf8'));
    } catch {
      smokeSummary = null;
    }
  }
  const smokeAssessment = liveSmokeDelegationAssessment({ result, smokeSummary, messageScript });
  let factualGroundingAudit = buildPostSmokeFactualGroundingAudit({
    report,
    smokeSummary,
    smokeReport
  });
  factualGroundingAudit = await invokeModelAssistedFactualReview({
    report,
    audit: factualGroundingAudit,
    messageScriptPath
  });

  report.checks.push(check(
    'live-smoke-52-turn-delegation',
    smokeAssessment.status,
    smokeAssessment.summary,
    {
      exitCode: result.exitCode,
      signal: result.signal,
      smokeArtifactDir,
      smokeReportPath,
      smokeSummaryPath,
      stdoutPath,
      stderrPath,
      smokeSummary,
      messageScriptPath,
      plannedTurns: messageScript.messages.length,
      fullPlannedTurns: messageScript.plannedTurnCount,
      turnLimit: messageScript.executedTurnLimit,
      smokeAssessment,
      coverageLimitations: messageScript.coverageLimitations,
      error: result.error
    }
  ));
  report.checks.push(check(
    'live-factual-grounding-transcript-audit',
    factualGroundingAudit.status,
    factualGroundingAudit.summary,
    {
      packageId: factualGroundingAudit.packageId,
      packId: factualGroundingAudit.packId,
      messageCount: factualGroundingAudit.messageCount,
      generatedMessageCount: factualGroundingAudit.generatedMessageCount,
      promptInspectionStatus: factualGroundingAudit.promptInspectionStatus,
      promptBlockCount: factualGroundingAudit.promptBlockCount,
      perGenerationCheckCount: factualGroundingAudit.perGenerationCheckCount,
      transcriptLevelCheckCount: factualGroundingAudit.transcriptLevelCheckCount,
      checkSummaries: factualGroundingAudit.checkSummaries,
      artifactPaths: factualGroundingAudit.artifactPaths,
      modelAssistedReview: {
        status: factualGroundingAudit.modelAssistedReviewResult?.status || null,
        requestPath: factualGroundingAudit.modelAssistedReviewRequestPathRelative || factualGroundingAudit.modelAssistedReviewRequestPath || null,
        resultPath: factualGroundingAudit.modelAssistedReviewResultPathRelative || factualGroundingAudit.modelAssistedReviewResultPath || null,
        providerOutputPath: factualGroundingAudit.modelAssistedReviewProvider?.providerOutputPathRelative || factualGroundingAudit.modelAssistedReviewProvider?.providerOutputPath || null,
        inputHash: factualGroundingAudit.modelAssistedReviewRequest?.inputHash || null,
        counts: factualGroundingAudit.modelAssistedReviewResult?.counts || null
      }
    }
  ));
  const factCheckLogEntries = factualGroundingAudit.checkSummaries || [];
  for (let index = 0; index < factCheckLogEntries.length; index += 1) {
    appendJsonLine(report.artifacts.liveLog, factualGroundingLiveLogRecord({
      check: factualGroundingAudit.checks?.[index] || null,
      artifactPath: factCheckLogEntries[index]?.artifactPath || null
    }));
  }
  appendJsonLine(report.artifacts.liveLog, {
    kind: 'artifact',
    status: 'written',
    runId: report.runId,
    artifact: 'model-assisted-factual-review-request',
    path: factualGroundingAudit.modelAssistedReviewRequestPathRelative || factualGroundingAudit.modelAssistedReviewRequestPath || null,
    resultPath: factualGroundingAudit.modelAssistedReviewResultPathRelative || factualGroundingAudit.modelAssistedReviewResultPath || null,
    providerOutputPath: factualGroundingAudit.modelAssistedReviewProvider?.providerOutputPathRelative || factualGroundingAudit.modelAssistedReviewProvider?.providerOutputPath || null,
    reviewStatus: factualGroundingAudit.modelAssistedReviewResult?.status || null,
    counts: factualGroundingAudit.modelAssistedReviewResult?.counts || null,
    inputHash: factualGroundingAudit.modelAssistedReviewRequest?.inputHash || null
  });
  appendJsonLine(report.artifacts.liveLog, {
    kind: 'phase-end',
    status: smokeAssessment.status,
    phase: 'delegated-52-turn-chat-smoke',
    exitCode: result.exitCode,
    signal: result.signal,
    smokeArtifactDir,
    smokeSummary,
    smokeAssessment,
    stdoutPath,
    stderrPath,
    plannedTurns: messageScript.messages.length,
    fullPlannedTurns: messageScript.plannedTurnCount,
    turnLimit: messageScript.executedTurnLimit
  });
  refreshReportStatus(report);
  writeJsonFile(report.artifacts.report, report);
  writeTextFile(report.artifacts.summary, summaryMarkdown(report));
  appendJsonLine(report.artifacts.liveLog, {
    kind: 'run-end',
    status: report.status,
    mode: 'live',
    runId: report.runId,
    plannedTurns: messageScript.messages.length,
    fullPlannedTurns: messageScript.plannedTurnCount,
    turnLimit: messageScript.executedTurnLimit,
    smokeArtifactDir,
    failures: report.failures,
    warnings: report.warnings
  });
  return report;
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }

  const report = await buildDryRunReport();
  if (LIVE_EXECUTION) {
    const liveReport = await runLiveExecution(report);
    console.log(JSON.stringify({
      ok: liveReport.status !== 'fail',
      status: liveReport.status,
      runId: liveReport.runId,
      mode: liveReport.mode,
      writeArtifacts: true,
      artifactRoot: liveReport.artifacts.root,
      checks: liveReport.checks.map((entry) => ({ id: entry.id, status: entry.status, summary: compact(entry.summary, 160) })),
      plannedCampaigns: liveReport.campaignMatrix.length,
      plannedPhases: liveReport.phases.length,
      plannedTurns: liveReport.turnScript.length,
      liveExecutedTurnLimit: SOAK_TURN_LIMIT > 0 ? SOAK_TURN_LIMIT : null,
      plannedEndConditionScenarios: liveReport.endConditionScenarios.length,
      liveLogRecordKinds: liveReport.liveLogPolicy.recordKinds.length
    }, null, 2));
    if (liveReport.status === 'fail') process.exitCode = 1;
    return;
  }
  if (WRITE_ARTIFACTS) {
    ensureArtifactTree(report.artifacts);
    const factCanaryIndex = writeFactualGroundingCanaryArtifacts({
      packs: report.factualCanaryPacks || [],
      artifactPaths: report.artifacts
    });
    writeJsonFile(report.artifacts.report, report);
    writeTextFile(report.artifacts.summary, summaryMarkdown(report));
    appendJsonLine(report.artifacts.liveLog, {
      kind: 'run-start',
      status: report.status,
      mode: report.mode,
      runId: report.runId,
      generatedAt: report.generatedAt,
      note: 'dry-run contract generated'
    });
    appendJsonLine(report.artifacts.liveLog, {
      kind: 'artifact',
      status: 'written',
      runId: report.runId,
      artifact: 'factual-canary-index',
      path: report.artifacts.factCanaryIndex,
      packCount: factCanaryIndex.packCount,
      canaryCount: factCanaryIndex.canaryCount
    });
    writeTextFile(report.artifacts.turns, '');
    writeTextFile(
      report.artifacts.readableTranscript,
      `# Directive Live Campaign Soak Transcript\n\nRun: ${report.runId}\nStatus: dry-run placeholder\n\n`
    );
    writeTextFile(report.artifacts.sourceChatTranscript, '');
    writeTextFile(report.artifacts.transcriptExcerpts, '');
    writeJsonFile(report.artifacts.transcriptIndex, {
      runId: report.runId,
      readableTranscript: report.artifacts.readableTranscript,
      sourceChatTranscript: report.artifacts.sourceChatTranscript,
      transcriptExcerpts: report.artifacts.transcriptExcerpts,
      policy: report.readableTranscriptPolicy
    });
    appendJsonLine(report.artifacts.liveLog, {
      kind: 'transcript-capture',
      status: 'planned',
      runId: report.runId,
      readableTranscript: report.artifacts.readableTranscript,
      sourceChatTranscript: report.artifacts.sourceChatTranscript
    });
  }
  console.log(JSON.stringify({
    ok: report.status !== 'fail',
    status: report.status,
    runId: report.runId,
    mode: report.mode,
    writeArtifacts: WRITE_ARTIFACTS,
    artifactRoot: WRITE_ARTIFACTS ? report.artifacts.root : null,
    checks: report.checks.map((entry) => ({ id: entry.id, status: entry.status, summary: compact(entry.summary, 160) })),
    plannedCampaigns: report.campaignMatrix.length,
    plannedPhases: report.phases.length,
    plannedTurns: report.turnScript.length,
    plannedEndConditionScenarios: report.endConditionScenarios.length,
    liveLogRecordKinds: report.liveLogPolicy.recordKinds.length
  }, null, 2));
  if (report.status === 'fail') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(errorSummary(error));
    process.exit(1);
  });
}
