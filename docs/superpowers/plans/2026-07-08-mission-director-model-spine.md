# Mission Director Model Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace foreground Mission Director semantic routing and outcome selection with model-authored story position and outcome plans while preserving mechanical custody validation.

**Architecture:** The Utility Turn Arbiter remains the first turn owner. For `directiveOutcome`, runtime builds a source-bound `MissionDirectorFrame`, runs `missionDirectorStoryPositioner`, runs `missionDirectorOutcomePlanner`, runs `missionDirectorPlanReviewer`, then assembles and commits only custody-valid packets. Existing deterministic Mission Director intent parsing and Ashes resolver branches become non-runtime fixtures/comparison aids rather than semantic fallbacks.

**Tech Stack:** JavaScript ES modules, SillyTavern host adapter, Directive generation router, structured JSON provider calls, Node test scripts, `npm.cmd test`.

## Global Constraints

- Pre-alpha: no legacy compatibility is required for old deterministic Mission Director behavior.
- Models own judgment; code owns custody.
- Do not migrate Crew, Ship, Continuity, Relationship, or Command Bearing sidecars in this plan.
- Do not let model output directly mutate campaign state.
- Do not remove mechanical validation, source custody, idempotency, state-delta gateway checks, persistence, or stale-source rejection.
- Do not persist raw prompts, raw player text, raw provider output, hidden state, provider reasoning, cookies, CSRF tokens, API keys, private NPC thoughts, raw relationship values, or raw hidden pressure values.
- Do not use `parseIntent()` or Ashes resolver output as runtime semantic fallback after this migration lands.

---

## File Structure

- Create: `src/directors/mission-director-model-contracts.mjs`
  - Normalizes and validates `MissionDirectorFrame`, `MissionStoryPosition`, `MissionOutcomePlan`, and `MissionDirectorPlanReview`.
- Create: `src/directors/mission-director-frame.mjs`
  - Builds compact player-safe Mission Director frames from campaign state, package data, Arbiter plan, source refs, and recent transcript.
- Create: `src/directors/mission-director-model-spine.mjs`
  - Runs story positioner, outcome planner, reviewer, stale-result checks, and packet assembly adapter.
- Modify: `src/generation/generation-roles.mjs`
  - Adds `missionDirectorStoryPositioner`, `missionDirectorOutcomePlanner`, and `missionDirectorPlanReviewer`.
- Modify: `src/generation/model-call-authority-matrix.mjs`
  - Documents provider lane, trigger, parser schema, hidden-state policy, and tests for each new role.
- Modify: `src/directors/open-world-turn-coordinator.mjs`
  - Routes foreground Director turns through the model spine and removes deterministic semantic fallback from runtime.
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
  - Passes Arbiter plan, ingress/source refs, and recent transcript into Director preview.
- Modify: `src/runtime/runtime-app.mjs`
  - Passes generation router into Director coordinator preview/commit path if not already available at the call site.
- Test: `tools/scripts/test-mission-director-model-contracts.mjs`
- Test: `tools/scripts/test-mission-director-frame.mjs`
- Test: `tools/scripts/test-mission-director-model-spine.mjs`
- Test: update `tools/scripts/test-generation-router.mjs`
- Test: update `tools/scripts/test-model-call-authority-matrix.mjs`
- Test: update `tools/scripts/test-chat-turn-orchestrator.mjs`
- Docs: update `docs/superpowers/specs/2026-07-08-mission-director-model-spine-design.md` only if implementation discovers a spec contradiction.

---

### Task 1: Add Mission Director Model Contracts

**Files:**
- Create: `src/directors/mission-director-model-contracts.mjs`
- Create: `tools/scripts/test-mission-director-model-contracts.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `MISSION_DIRECTOR_FRAME_KIND`, `MISSION_STORY_POSITION_KIND`, `MISSION_OUTCOME_PLAN_KIND`, `MISSION_DIRECTOR_PLAN_REVIEW_KIND`
- Produces: `normalizeMissionStoryPosition(value, { expectedSourceHash }) -> { ok, value, error }`
- Produces: `normalizeMissionOutcomePlan(value, { expectedSourceHash, expectedStoryPositionHash, allowedRoots, allowedFactIds, allowedDecisionIds }) -> { ok, value, error }`
- Produces: `normalizeMissionDirectorPlanReview(value, { expectedSourceHash, expectedStoryPositionHash, expectedOutcomePlanHash }) -> { ok, value, error }`
- Consumes: no new project code

- [ ] **Step 1: Write the failing contract test**

Create `tools/scripts/test-mission-director-model-contracts.mjs`:

```js
import assert from 'node:assert/strict';
import {
  MISSION_DIRECTOR_PLAN_REVIEW_KIND,
  MISSION_OUTCOME_PLAN_KIND,
  MISSION_STORY_POSITION_KIND,
  normalizeMissionDirectorPlanReview,
  normalizeMissionOutcomePlan,
  normalizeMissionStoryPosition
} from '../../src/directors/mission-director-model-contracts.mjs';

const sourceHash = 'frame.hash.1';
const storyPositionHash = 'story.hash.1';
const outcomePlanHash = 'outcome.hash.1';

const story = normalizeMissionStoryPosition({
  kind: MISSION_STORY_POSITION_KIND,
  schemaVersion: 1,
  sourceHash,
  confidence: 0.84,
  storyPosition: {
    contextType: 'phase_window',
    missionId: 'prelude-a-ship-underway',
    questId: 'prelude-a-ship-underway',
    phaseId: 'ready-room-handover',
    locationId: 'captain-ready-room',
    anchorId: 'ready-room-whitaker-question',
    anchorFrom: 'ready-room-entry-complete',
    anchorTo: 'ready-room-handoff-close',
    arc: 'Prelude',
    phase: 'A Ship Underway',
    currentConversation: 'Whitaker asks for the XO first read before inspection.'
  },
  sceneContinuity: {
    mustPreserve: ['Sam is already in the ready room.'],
    mustNotReestablish: ['Sam boarding the ship.']
  },
  outcomeRelevance: {
    route: 'outcome',
    reason: 'The player gives a durable order.',
    activeDecisionIds: ['decision.ready-room-handover'],
    candidateOutcomeIds: ['outcome.ready-room-handover.accepted'],
    requiresClarification: false
  },
  sourceUse: {
    evidenceRefs: ['message:18'],
    ignoredStaleSetup: [],
    uncertainties: []
  }
}, { expectedSourceHash: sourceHash });

assert.equal(story.ok, true);
assert.equal(story.value.storyPosition.phaseId, 'ready-room-handover');

const rejectedStory = normalizeMissionStoryPosition({
  kind: MISSION_STORY_POSITION_KIND,
  schemaVersion: 1,
  sourceHash: 'wrong',
  confidence: 0.5,
  storyPosition: {},
  outcomeRelevance: { route: 'outcome' },
  sourceUse: { evidenceRefs: ['message:18'] }
}, { expectedSourceHash: sourceHash });
assert.equal(rejectedStory.ok, false);
assert.equal(rejectedStory.error.code, 'source_hash_mismatch');

const plan = normalizeMissionOutcomePlan({
  kind: MISSION_OUTCOME_PLAN_KIND,
  schemaVersion: 1,
  sourceHash,
  storyPositionHash,
  resultBand: 'Partial Success',
  outcomeSummary: 'The XO gives Whitaker a bounded readiness answer.',
  consequencePlan: {
    costs: ['Whitaker expects a first-hand follow-up after inspection.'],
    revealedFactIds: ['crew.transfer-cohort-tension'],
    commandDecisionAwards: [],
    openAssignments: [],
    questOutcomeKey: '',
    completionRecommendation: 'continue'
  },
  narrationPlan: {
    allowedFacts: ['Whitaker is in the ready room.'],
    forbiddenFacts: ['Hidden pressure values.'],
    constraints: ['Do not reintroduce boarding.'],
    mustPreserve: ['Sam is already in the ready room.'],
    mustNotReestablish: ['Sam boarding the ship.']
  },
  stateProposal: {
    allowedRoots: ['mission'],
    operations: [{ op: 'set', path: 'mission.lastOutcomeSummary', value: 'bounded readiness answer' }]
  },
  diagnostics: {
    reasonerUsed: false,
    uncertainties: [],
    reviewRequired: false
  }
}, {
  expectedSourceHash: sourceHash,
  expectedStoryPositionHash: storyPositionHash,
  allowedRoots: ['mission'],
  allowedFactIds: ['crew.transfer-cohort-tension'],
  allowedDecisionIds: []
});
assert.equal(plan.ok, true);
assert.equal(plan.value.resultBand, 'Partial Success');

const rejectedRoot = normalizeMissionOutcomePlan({
  kind: MISSION_OUTCOME_PLAN_KIND,
  schemaVersion: 1,
  sourceHash,
  storyPositionHash,
  resultBand: 'Success',
  outcomeSummary: 'Bad root.',
  consequencePlan: { revealedFactIds: [], commandDecisionAwards: [], completionRecommendation: 'continue' },
  narrationPlan: {},
  stateProposal: { allowedRoots: ['relationships'], operations: [{ path: 'relationships.raw', value: 1 }] },
  diagnostics: {}
}, {
  expectedSourceHash: sourceHash,
  expectedStoryPositionHash: storyPositionHash,
  allowedRoots: ['mission'],
  allowedFactIds: [],
  allowedDecisionIds: []
});
assert.equal(rejectedRoot.ok, false);
assert.equal(rejectedRoot.error.code, 'unsupported_state_root');

const review = normalizeMissionDirectorPlanReview({
  kind: MISSION_DIRECTOR_PLAN_REVIEW_KIND,
  schemaVersion: 1,
  sourceHash,
  storyPositionHash,
  outcomePlanHash,
  approved: true,
  risk: 'low',
  requiredAction: 'approve',
  reasons: [],
  narrationSafety: {
    hiddenStateLeak: false,
    staleSetupRisk: false,
    forbiddenClaims: []
  }
}, { expectedSourceHash: sourceHash, expectedStoryPositionHash: storyPositionHash, expectedOutcomePlanHash: outcomePlanHash });
assert.equal(review.ok, true);

console.log('mission director model contracts passed');
```

Add a script to `package.json`:

```json
"test:mission-director-model-contracts": "node tools/scripts/test-mission-director-model-contracts.mjs"
```

- [ ] **Step 2: Run the failing test**

Run: `npm.cmd run test:mission-director-model-contracts`

Expected: FAIL with module-not-found for `mission-director-model-contracts.mjs`.

- [ ] **Step 3: Implement the contracts**

Create `src/directors/mission-director-model-contracts.mjs` with:

```js
export const MISSION_DIRECTOR_FRAME_KIND = 'directive.missionDirectorFrame.v1';
export const MISSION_STORY_POSITION_KIND = 'directive.missionStoryPosition.v1';
export const MISSION_OUTCOME_PLAN_KIND = 'directive.missionOutcomePlan.v1';
export const MISSION_DIRECTOR_PLAN_REVIEW_KIND = 'directive.missionDirectorPlanReview.v1';

const RESULT_BANDS = new Set(['Success', 'Partial Success', 'Partial Failure', 'Failure', 'Great Failure']);
const STORY_ROUTES = new Set(['outcome', 'hostContinue', 'pause']);
const REVIEW_ACTIONS = new Set(['approve', 'pause', 'retryStoryPosition', 'retryOutcomePlan', 'hostContinue']);
const REVIEW_RISKS = new Set(['low', 'medium', 'high']);
const COMPLETION_RECOMMENDATIONS = new Set(['continue', 'completeQuest', 'pauseForReview']);
const HIDDEN_PATTERNS = [
  /\braw (?:relationship|pressure|hidden|secret)\b/i,
  /\bhidden (?:state|truth|pressure|score|value)\b/i,
  /\bprovider reasoning\b/i,
  /\bprivate npc thought\b/i,
  /\bapi key\b/i,
  /\bcsrf\b/i,
  /\bcookie\b/i
];

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanList(value, limit = 32) {
  return asArray(value).map(compact).filter(Boolean).slice(0, limit);
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasHiddenLeak(value) {
  const text = JSON.stringify(value || {});
  return HIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

function fail(code, details = {}) {
  return { ok: false, value: null, error: { code, ...details } };
}

function sourceHashOk(value, expectedSourceHash) {
  if (!expectedSourceHash) return true;
  return compact(value.sourceHash) === compact(expectedSourceHash);
}

export function normalizeMissionStoryPosition(value = {}, { expectedSourceHash = '' } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  if (value.kind !== MISSION_STORY_POSITION_KIND) return fail('wrong_kind');
  if (!sourceHashOk(value, expectedSourceHash)) return fail('source_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const relevance = object(value.outcomeRelevance);
  const route = compact(relevance.route);
  if (!STORY_ROUTES.has(route)) return fail('unsupported_route');
  const evidenceRefs = cleanList(value.sourceUse?.evidenceRefs, 24);
  if (!evidenceRefs.length) return fail('missing_evidence_refs');
  const storyPosition = object(value.storyPosition);
  return {
    ok: true,
    value: {
      kind: MISSION_STORY_POSITION_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
      storyPosition: {
        contextType: compact(storyPosition.contextType) || 'unknown',
        missionId: compact(storyPosition.missionId),
        questId: compact(storyPosition.questId),
        phaseId: compact(storyPosition.phaseId),
        locationId: compact(storyPosition.locationId),
        anchorId: compact(storyPosition.anchorId),
        anchorFrom: compact(storyPosition.anchorFrom),
        anchorTo: compact(storyPosition.anchorTo),
        arc: compact(storyPosition.arc),
        phase: compact(storyPosition.phase),
        currentConversation: compact(storyPosition.currentConversation)
      },
      sceneContinuity: {
        mustPreserve: cleanList(value.sceneContinuity?.mustPreserve, 24),
        mustNotReestablish: cleanList(value.sceneContinuity?.mustNotReestablish, 24)
      },
      outcomeRelevance: {
        route,
        reason: compact(relevance.reason),
        activeDecisionIds: cleanList(relevance.activeDecisionIds, 24),
        candidateOutcomeIds: cleanList(relevance.candidateOutcomeIds, 24),
        requiresClarification: relevance.requiresClarification === true
      },
      sourceUse: {
        evidenceRefs,
        ignoredStaleSetup: cleanList(value.sourceUse?.ignoredStaleSetup, 24),
        uncertainties: cleanList(value.sourceUse?.uncertainties, 24)
      }
    },
    error: null
  };
}

function operationRoot(operation = {}) {
  const path = compact(operation.path || operation.pointer);
  if (path) return path.replace(/^\/+/, '').split(/[./]/)[0] || '';
  return compact(operation.root || operation.domain || operation.targetRoot);
}

export function normalizeMissionOutcomePlan(value = {}, {
  expectedSourceHash = '',
  expectedStoryPositionHash = '',
  allowedRoots = [],
  allowedFactIds = [],
  allowedDecisionIds = []
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  if (value.kind !== MISSION_OUTCOME_PLAN_KIND) return fail('wrong_kind');
  if (!sourceHashOk(value, expectedSourceHash)) return fail('source_hash_mismatch');
  if (expectedStoryPositionHash && compact(value.storyPositionHash) !== compact(expectedStoryPositionHash)) return fail('story_position_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const resultBand = compact(value.resultBand);
  if (!RESULT_BANDS.has(resultBand)) return fail('unsupported_result_band');
  const allowedRootSet = new Set(cleanList(allowedRoots, 64));
  const factSet = new Set(cleanList(allowedFactIds, 512));
  const decisionSet = new Set(cleanList(allowedDecisionIds, 128));
  const stateProposal = object(value.stateProposal);
  const proposedRoots = cleanList(stateProposal.allowedRoots, 32);
  for (const root of proposedRoots) {
    if (!allowedRootSet.has(root)) return fail('unsupported_state_root', { root });
  }
  const operations = asArray(stateProposal.operations).filter((entry) => entry && typeof entry === 'object');
  for (const operation of operations) {
    const root = operationRoot(operation);
    if (root && !allowedRootSet.has(root)) return fail('unsupported_state_root', { root });
  }
  const consequencePlan = object(value.consequencePlan);
  const revealedFactIds = cleanList(consequencePlan.revealedFactIds, 64);
  for (const id of revealedFactIds) {
    if (factSet.size && !factSet.has(id)) return fail('unknown_fact_id', { id });
  }
  const commandDecisionAwards = asArray(consequencePlan.commandDecisionAwards).filter((entry) => entry && typeof entry === 'object');
  for (const award of commandDecisionAwards) {
    const id = compact(award.id);
    if (id && decisionSet.size && !decisionSet.has(id)) return fail('unknown_decision_id', { id });
  }
  const recommendation = compact(consequencePlan.completionRecommendation) || 'continue';
  if (!COMPLETION_RECOMMENDATIONS.has(recommendation)) return fail('unsupported_completion_recommendation');
  return {
    ok: true,
    value: {
      kind: MISSION_OUTCOME_PLAN_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      storyPositionHash: compact(value.storyPositionHash),
      resultBand,
      outcomeSummary: compact(value.outcomeSummary),
      consequencePlan: {
        costs: cleanList(consequencePlan.costs, 24),
        revealedFactIds,
        commandDecisionAwards: cloneJson(commandDecisionAwards),
        openAssignments: cloneJson(asArray(consequencePlan.openAssignments).slice(0, 24)),
        questOutcomeKey: compact(consequencePlan.questOutcomeKey),
        completionRecommendation: recommendation
      },
      narrationPlan: {
        allowedFacts: cleanList(value.narrationPlan?.allowedFacts, 64),
        forbiddenFacts: cleanList(value.narrationPlan?.forbiddenFacts, 64),
        constraints: cleanList(value.narrationPlan?.constraints, 32),
        mustPreserve: cleanList(value.narrationPlan?.mustPreserve, 24),
        mustNotReestablish: cleanList(value.narrationPlan?.mustNotReestablish, 24)
      },
      stateProposal: {
        allowedRoots: proposedRoots,
        operations: cloneJson(operations)
      },
      diagnostics: {
        reasonerUsed: value.diagnostics?.reasonerUsed === true,
        uncertainties: cleanList(value.diagnostics?.uncertainties, 24),
        reviewRequired: value.diagnostics?.reviewRequired === true
      }
    },
    error: null
  };
}

export function normalizeMissionDirectorPlanReview(value = {}, {
  expectedSourceHash = '',
  expectedStoryPositionHash = '',
  expectedOutcomePlanHash = ''
} = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('not_object');
  if (value.kind !== MISSION_DIRECTOR_PLAN_REVIEW_KIND) return fail('wrong_kind');
  if (!sourceHashOk(value, expectedSourceHash)) return fail('source_hash_mismatch');
  if (expectedStoryPositionHash && compact(value.storyPositionHash) !== compact(expectedStoryPositionHash)) return fail('story_position_hash_mismatch');
  if (expectedOutcomePlanHash && compact(value.outcomePlanHash) !== compact(expectedOutcomePlanHash)) return fail('outcome_plan_hash_mismatch');
  if (hasHiddenLeak(value)) return fail('hidden_state_leak');
  const requiredAction = compact(value.requiredAction);
  if (!REVIEW_ACTIONS.has(requiredAction)) return fail('unsupported_required_action');
  const risk = compact(value.risk);
  if (!REVIEW_RISKS.has(risk)) return fail('unsupported_risk');
  return {
    ok: true,
    value: {
      kind: MISSION_DIRECTOR_PLAN_REVIEW_KIND,
      schemaVersion: 1,
      sourceHash: compact(value.sourceHash),
      storyPositionHash: compact(value.storyPositionHash),
      outcomePlanHash: compact(value.outcomePlanHash),
      approved: value.approved === true,
      risk,
      requiredAction,
      reasons: cleanList(value.reasons, 24),
      narrationSafety: {
        hiddenStateLeak: value.narrationSafety?.hiddenStateLeak === true,
        staleSetupRisk: value.narrationSafety?.staleSetupRisk === true,
        forbiddenClaims: cleanList(value.narrationSafety?.forbiddenClaims, 24)
      }
    },
    error: null
  };
}
```

- [ ] **Step 4: Run the contract test**

Run: `npm.cmd run test:mission-director-model-contracts`

Expected: PASS and prints `mission director model contracts passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/directors/mission-director-model-contracts.mjs tools/scripts/test-mission-director-model-contracts.mjs
git commit -m "feat: add mission director model contracts"
```

---

### Task 2: Register Mission Director Model Roles

**Files:**
- Modify: `src/generation/generation-roles.mjs`
- Modify: `src/generation/model-call-authority-matrix.mjs`
- Modify: `tools/scripts/test-generation-router.mjs`
- Modify: `tools/scripts/test-model-call-authority-matrix.mjs`

**Interfaces:**
- Consumes: role ids from Task 1 schema names
- Produces: generation roles `missionDirectorStoryPositioner`, `missionDirectorOutcomePlanner`, `missionDirectorPlanReviewer`

- [ ] **Step 1: Write role assertions**

In `tools/scripts/test-generation-router.mjs`, add assertions equivalent to existing role-registry checks:

```js
for (const roleId of ['missionDirectorStoryPositioner', 'missionDirectorOutcomePlanner', 'missionDirectorPlanReviewer']) {
  assert.equal(registry.has(roleId), true, `${roleId} must be registered`);
  const role = registry.get(roleId);
  assert.equal(role.output, 'structured-json', `${roleId} uses structured output`);
  assert.equal(role.fallback, 'fail-closed', `${roleId} fails closed`);
}
assert.equal(registry.get('missionDirectorStoryPositioner').providerKind, 'utility');
assert.equal(registry.get('missionDirectorPlanReviewer').providerKind, 'utility');
```

In `tools/scripts/test-model-call-authority-matrix.mjs`, add:

```js
for (const roleId of ['missionDirectorStoryPositioner', 'missionDirectorOutcomePlanner', 'missionDirectorPlanReviewer']) {
  const authority = authorityForRole(roleId);
  assert.equal(authority.roleId, roleId);
  assert.equal(authority.blocking, true);
  assert.equal(authority.mayInjectPrompt, false);
  assert.match(authority.hiddenStatePolicy, /raw prompts/i);
  assert.match(authority.hiddenStatePolicy, /provider reasoning/i);
}
assert.equal(authorityForRole('missionDirectorOutcomePlanner').mayProposeState, true);
```

- [ ] **Step 2: Run the focused tests**

Run:

```bash
node tools/scripts/test-generation-router.mjs
node tools/scripts/test-model-call-authority-matrix.mjs
```

Expected: FAIL because the roles are unknown.

- [ ] **Step 3: Add role definitions**

In `src/generation/generation-roles.mjs`, append the three role ids to `GENERATION_ROLE_IDS` near `missionDirectorAdvisor`:

```js
'missionDirectorStoryPositioner',
'missionDirectorOutcomePlanner',
'missionDirectorPlanReviewer',
```

Add defaults:

```js
missionDirectorStoryPositioner: {
  id: 'missionDirectorStoryPositioner',
  label: 'Mission Director Story Positioner',
  providerKind: 'utility',
  blocking: true,
  output: 'structured-json',
  timeoutMs: BLOCKING_UTILITY_TIMEOUT_MS,
  structuredOutput: true,
  modelPreferences: {
    cost: 'low',
    latency: 'fast',
    capability: 'utility-reasoning'
  },
  mayProposeState: false,
  mayInjectPrompt: false,
  mayRunDuringMainGeneration: true,
  fallback: 'fail-closed'
},
missionDirectorOutcomePlanner: {
  id: 'missionDirectorOutcomePlanner',
  label: 'Mission Director Outcome Planner',
  providerKind: 'reasoning',
  blocking: true,
  output: 'structured-json',
  timeoutMs: 90000,
  structuredOutput: true,
  modelPreferences: {
    cost: 'balanced',
    latency: 'medium',
    capability: 'reasoning-writing'
  },
  mayProposeState: true,
  mayInjectPrompt: false,
  mayRunDuringMainGeneration: true,
  fallback: 'fail-closed'
},
missionDirectorPlanReviewer: {
  id: 'missionDirectorPlanReviewer',
  label: 'Mission Director Plan Reviewer',
  providerKind: 'utility',
  blocking: true,
  output: 'structured-json',
  timeoutMs: BLOCKING_UTILITY_TIMEOUT_MS,
  structuredOutput: true,
  modelPreferences: {
    cost: 'low',
    latency: 'fast',
    capability: 'utility-reasoning'
  },
  mayProposeState: false,
  mayInjectPrompt: false,
  mayRunDuringMainGeneration: true,
  fallback: 'fail-closed'
},
```

In `src/generation/model-call-authority-matrix.mjs`, add entries:

```js
missionDirectorStoryPositioner: {
  roleId: 'missionDirectorStoryPositioner',
  providerKind: 'utility',
  trigger: 'Utility Turn Arbiter selected a foreground Mission Director outcome route.',
  blocking: true,
  mayProposeState: false,
  mayInjectPrompt: false,
  allowedRoots: EMPTY,
  owningModule: 'src/directors/mission-director-model-spine.mjs',
  parserSchema: 'directive.missionStoryPosition.v1',
  fallback: 'fail-closed',
  playerVisibleOutput: 'None directly; story position and outcome relevance only.',
  hiddenStatePolicy: 'Receives a compact player-safe Mission Director frame. It cannot see raw prompts, provider reasoning, hidden truth, raw relationship values, hidden pressure values, private NPC thoughts, cookies, CSRF tokens, or API keys.',
  tests: ['test-mission-director-model-contracts.mjs', 'test-mission-director-model-spine.mjs']
},
missionDirectorOutcomePlanner: {
  roleId: 'missionDirectorOutcomePlanner',
  providerKind: 'reasoning',
  trigger: 'Validated Mission Director story position requires a bounded outcome plan.',
  blocking: true,
  mayProposeState: true,
  mayInjectPrompt: false,
  allowedRoots: Object.freeze(['mission', 'commandLog', 'questLedger', 'threadLedger', 'eventLedger', 'storyArcLedger', 'attentionState', 'openWorld']),
  owningModule: 'src/directors/mission-director-model-spine.mjs',
  parserSchema: 'directive.missionOutcomePlan.v1',
  fallback: 'fail-closed',
  playerVisibleOutput: 'None directly; custody validation assembles any committed outcome packet.',
  hiddenStatePolicy: 'Receives story position, package vocabulary, and player-safe continuity only. It cannot see raw prompts, provider reasoning, private NPC thoughts, cookies, CSRF tokens, or API keys. State proposals are advisory and custody-validated before commit.',
  tests: ['test-mission-director-model-contracts.mjs', 'test-mission-director-model-spine.mjs']
},
missionDirectorPlanReviewer: {
  roleId: 'missionDirectorPlanReviewer',
  providerKind: 'utility',
  trigger: 'Mission Director story position and outcome plan need source-fit, stale-setup, and narration-safety review.',
  blocking: true,
  mayProposeState: false,
  mayInjectPrompt: false,
  allowedRoots: EMPTY,
  owningModule: 'src/directors/mission-director-model-spine.mjs',
  parserSchema: 'directive.missionDirectorPlanReview.v1',
  fallback: 'fail-closed',
  playerVisibleOutput: 'None directly; review decision only.',
  hiddenStatePolicy: 'Receives only hashes, sanitized story position, sanitized outcome plan, and player-safe frame summary. It cannot see raw prompts, provider reasoning, hidden state, private NPC thoughts, cookies, CSRF tokens, or API keys.',
  tests: ['test-mission-director-model-contracts.mjs', 'test-mission-director-model-spine.mjs']
},
```

- [ ] **Step 4: Run role tests**

Run:

```bash
node tools/scripts/test-generation-router.mjs
node tools/scripts/test-model-call-authority-matrix.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/generation/generation-roles.mjs src/generation/model-call-authority-matrix.mjs tools/scripts/test-generation-router.mjs tools/scripts/test-model-call-authority-matrix.mjs
git commit -m "feat: register mission director model roles"
```

---

### Task 3: Build Source-Bound Mission Director Frames

**Files:**
- Create: `src/directors/mission-director-frame.mjs`
- Create: `tools/scripts/test-mission-director-frame.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `MISSION_DIRECTOR_FRAME_KIND`
- Produces: `buildMissionDirectorFrame({ campaignState, packageData, message, chatId, ingressId, arbiterPlan, sourceFrameRef, recentTranscript, sourceSettlement, promptStatus, recoverySummary }) -> { frame, sourceHash, allowedRoots, allowedFactIds, allowedDecisionIds }`

- [ ] **Step 1: Write the failing frame test**

Create `tools/scripts/test-mission-director-frame.mjs`:

```js
import assert from 'node:assert/strict';
import { buildMissionDirectorFrame } from '../../src/directors/mission-director-frame.mjs';
import { MISSION_DIRECTOR_FRAME_KIND } from '../../src/directors/mission-director-model-contracts.mjs';

const campaignState = {
  campaign: { id: 'campaign-1' },
  saveId: 'save-1',
  mission: {
    activeMissionId: 'prelude-a-ship-underway',
    activeMissionGraphId: 'ashes-prelude',
    activePhaseId: 'ready-room-handover',
    availableDecisionPointIds: ['decision.ready-room-handover']
  },
  attentionState: {
    foregroundQuestId: 'prelude-a-ship-underway',
    scene: {
      locationId: 'captain-ready-room',
      presentCharacterIds: ['mara-whitaker', 'hadrik-bronn']
    }
  },
  worldState: {
    currentLocationId: 'captain-ready-room',
    currentStardate: 58912.4
  },
  knowledgeLedger: {
    facts: [{ id: 'crew.transfer-cohort-tension', known: true }]
  },
  relationships: {
    seniorCrew: { hiddenRawScore: 9 }
  }
};

const packageData = {
  questTemplates: {
    templates: [{
      id: 'prelude-a-ship-underway',
      title: 'Prelude: A Ship Underway',
      missionGraph: {
        id: 'ashes-prelude',
        phases: [{ id: 'ready-room-handover', label: 'Ready Room Handover' }],
        decisionPoints: [{ id: 'decision.ready-room-handover', label: 'Ready-room handover' }],
        outcomeFlags: [{ id: 'crew.transfer-cohort-tension', allowedValues: [true, false] }]
      }
    }]
  }
};

const { frame, sourceHash, allowedRoots, allowedFactIds, allowedDecisionIds } = buildMissionDirectorFrame({
  campaignState,
  packageData,
  message: {
    text: 'I tell Whitaker I want a first-hand inspection before judging readiness.',
    hostMessageId: 'msg-18'
  },
  chatId: 'chat-1',
  ingressId: 'ingress-1',
  arbiterPlan: { route: 'directiveOutcome' },
  sourceFrameRef: { kind: 'directive.turnSourceFrameRef.v1', sourceId: 'frame-1' },
  recentTranscript: [{ role: 'assistant', text: 'Whitaker asks for Sam first read.' }]
});

assert.equal(frame.kind, MISSION_DIRECTOR_FRAME_KIND);
assert.equal(frame.ingress.ingressId, 'ingress-1');
assert.equal(frame.currentStoryState.activePhaseId, 'ready-room-handover');
assert.equal(frame.packageStoryMap.phases[0].id, 'ready-room-handover');
assert.equal(allowedRoots.includes('mission'), true);
assert.equal(allowedFactIds.includes('crew.transfer-cohort-tension'), true);
assert.equal(allowedDecisionIds.includes('decision.ready-room-handover'), true);
assert.equal(typeof sourceHash, 'string');
assert.equal(JSON.stringify(frame).includes('hiddenRawScore'), false);

console.log('mission director frame passed');
```

Add a script to `package.json`:

```json
"test:mission-director-frame": "node tools/scripts/test-mission-director-frame.mjs"
```

- [ ] **Step 2: Run the failing frame test**

Run: `npm.cmd run test:mission-director-frame`

Expected: FAIL with module-not-found for `mission-director-frame.mjs`.

- [ ] **Step 3: Implement the frame builder**

Create `src/directors/mission-director-frame.mjs`:

```js
import { MISSION_DIRECTOR_FRAME_KIND } from './mission-director-model-contracts.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function textHash(text) {
  return hashStableJson({ text: String(text || '') });
}

function templates(packageData = {}) {
  const source = packageData.questTemplates?.templates || packageData.questTemplates || [];
  return asArray(source);
}

function missionGraphFor(campaignState = {}, packageData = {}) {
  const activeMissionId = campaignState.mission?.activeMissionId || campaignState.attentionState?.foregroundQuestId || '';
  const template = templates(packageData).find((item) => item.id === activeMissionId || item.missionGraph?.id === campaignState.mission?.activeMissionGraphId);
  return template?.missionGraph || null;
}

function knownFactIds(campaignState = {}) {
  return asArray(campaignState.knowledgeLedger?.facts)
    .map((fact) => typeof fact === 'string' ? fact : (fact?.known === false || fact?.stale === true ? '' : fact?.id))
    .filter(Boolean);
}

function compactTranscript(entries = []) {
  return asArray(entries).slice(-12).map((entry, index) => ({
    id: compact(entry.id || entry.hostMessageId || `message:${index}`),
    role: compact(entry.role || (entry.isUser ? 'user' : 'assistant')),
    text: compact(entry.text || entry.mes || entry.content).slice(0, 900),
    textHash: compact(entry.textHash) || textHash(entry.text || entry.mes || entry.content)
  })).filter((entry) => entry.text);
}

function packageStoryMap(campaignState = {}, packageData = {}) {
  const graph = missionGraphFor(campaignState, packageData) || {};
  const phases = asArray(graph.phases).map((phase) => ({
    id: compact(phase.id),
    label: compact(phase.label || phase.title || phase.id),
    summary: compact(phase.summary || phase.description).slice(0, 500)
  })).filter((phase) => phase.id);
  const decisionPoints = asArray(graph.decisionPoints).map((decision) => ({
    id: compact(decision.id),
    label: compact(decision.label || decision.title || decision.id),
    phaseId: compact(decision.phaseId || decision.activePhaseId),
    summary: compact(decision.summary || decision.description).slice(0, 500)
  })).filter((decision) => decision.id);
  const outcomeOptions = asArray(graph.outcomes || graph.outcomeOptions).map((outcome) => ({
    id: compact(outcome.id),
    label: compact(outcome.label || outcome.title || outcome.id),
    phaseId: compact(outcome.phaseId),
    summary: compact(outcome.summary || outcome.description).slice(0, 500)
  })).filter((outcome) => outcome.id);
  return {
    missions: templates(packageData).map((template) => ({
      id: compact(template.id),
      title: compact(template.title),
      missionGraphId: compact(template.missionGraph?.id)
    })).filter((mission) => mission.id),
    phases,
    decisionPoints,
    outcomeOptions,
    knownFacts: knownFactIds(campaignState),
    revealBoundaries: asArray(graph.revealBoundaries).map(cloneJson)
  };
}

export function buildMissionDirectorFrame({
  campaignState = {},
  packageData = {},
  message = {},
  chatId = '',
  ingressId = '',
  arbiterPlan = null,
  sourceFrameRef = null,
  recentTranscript = [],
  sourceSettlement = null,
  promptStatus = null,
  recoverySummary = null
} = {}) {
  const graph = missionGraphFor(campaignState, packageData) || {};
  const map = packageStoryMap(campaignState, packageData);
  const activeStoryState = {
    activeMissionId: compact(campaignState.mission?.activeMissionId),
    activeMissionGraphId: compact(campaignState.mission?.activeMissionGraphId || graph.id),
    activePhaseId: compact(campaignState.mission?.activePhaseId || campaignState.attentionState?.scene?.phaseId),
    foregroundQuestId: compact(campaignState.attentionState?.foregroundQuestId || campaignState.questLedger?.foregroundQuestId),
    locationId: compact(campaignState.worldState?.currentLocationId || campaignState.attentionState?.scene?.locationId),
    stardate: campaignState.worldState?.currentStardate ?? campaignState.campaign?.currentStardate ?? null,
    presentCharacterIds: asArray(campaignState.attentionState?.scene?.presentCharacterIds).map(compact).filter(Boolean)
  };
  const frame = {
    kind: MISSION_DIRECTOR_FRAME_KIND,
    schemaVersion: 1,
    campaignId: compact(campaignState.campaign?.id || campaignState.campaign?.templateCampaignId),
    saveId: compact(campaignState.saveId || campaignState.campaign?.saveId),
    chatId: compact(chatId || message.chatId),
    ingress: {
      ingressId: compact(ingressId),
      hostMessageId: compact(message.hostMessageId || message.id),
      textHash: compact(message.textHash) || textHash(message.text || message.mes || message.content),
      sourceFrameRef: cloneJson(sourceFrameRef || null)
    },
    turnArbiterPlan: cloneJson(arbiterPlan || null),
    recentTranscript: compactTranscript(recentTranscript),
    sourceSettlement: cloneJson(sourceSettlement || null),
    currentStoryState: activeStoryState,
    packageStoryMap: map,
    continuityProjection: cloneJson(campaignState.runtimeTracking?.lastContinuityProjection || null),
    promptStatus: cloneJson(promptStatus || null),
    recoverySummary: cloneJson(recoverySummary || null)
  };
  return {
    frame,
    sourceHash: hashStableJson(frame),
    allowedRoots: ['mission', 'commandLog', 'questLedger', 'threadLedger', 'eventLedger', 'storyArcLedger', 'attentionState', 'openWorld'],
    allowedFactIds: map.knownFacts,
    allowedDecisionIds: map.decisionPoints.map((decision) => decision.id)
  };
}
```

- [ ] **Step 4: Run the frame test**

Run: `npm.cmd run test:mission-director-frame`

Expected: PASS and prints `mission director frame passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/directors/mission-director-frame.mjs tools/scripts/test-mission-director-frame.mjs
git commit -m "feat: build mission director frames"
```

---

### Task 4: Implement the Model Spine Runner

**Files:**
- Create: `src/directors/mission-director-model-spine.mjs`
- Create: `tools/scripts/test-mission-director-model-spine.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildMissionDirectorFrame(...)`
- Consumes: contract normalizers from Task 1
- Produces: `runMissionDirectorModelSpine(options) -> { ok, route, storyPosition, outcomePlan, review, turnPacket, diagnostics }`
- Produces: `buildTurnPacketFromOutcomePlan({ turnId, sceneSnapshot, storyPosition, outcomePlan, review }) -> turnPacket`

- [ ] **Step 1: Write the failing model spine test**

Create `tools/scripts/test-mission-director-model-spine.mjs`:

```js
import assert from 'node:assert/strict';
import { runMissionDirectorModelSpine } from '../../src/directors/mission-director-model-spine.mjs';
import {
  MISSION_DIRECTOR_PLAN_REVIEW_KIND,
  MISSION_OUTCOME_PLAN_KIND,
  MISSION_STORY_POSITION_KIND
} from '../../src/directors/mission-director-model-contracts.mjs';

function routerFor({ storyRoute = 'outcome', reviewerAction = 'approve' } = {}) {
  const calls = [];
  return {
    calls,
    async generate(roleId, request) {
      calls.push({ roleId, request });
      const frameHash = request.context?.sourceHash || request.sourceHash;
      if (roleId === 'missionDirectorStoryPositioner') {
        return {
          ok: true,
          response: {
            content: {
              kind: MISSION_STORY_POSITION_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              confidence: 0.9,
              storyPosition: {
                contextType: 'phase_window',
                missionId: 'prelude-a-ship-underway',
                questId: 'prelude-a-ship-underway',
                phaseId: 'ready-room-handover',
                locationId: 'captain-ready-room',
                anchorId: 'ready-room-whitaker-question',
                anchorFrom: 'ready-room-entry-complete',
                anchorTo: 'ready-room-handoff-close',
                arc: 'Prelude',
                phase: 'A Ship Underway',
                currentConversation: 'Whitaker asks for the XO first read.'
              },
              sceneContinuity: {
                mustPreserve: ['Already in ready room.'],
                mustNotReestablish: ['Boarding the ship.']
              },
              outcomeRelevance: {
                route: storyRoute,
                reason: 'fixture',
                activeDecisionIds: ['decision.ready-room-handover'],
                candidateOutcomeIds: ['outcome.ready-room'],
                requiresClarification: false
              },
              sourceUse: { evidenceRefs: ['message:18'], ignoredStaleSetup: [], uncertainties: [] }
            }
          }
        };
      }
      if (roleId === 'missionDirectorOutcomePlanner') {
        return {
          ok: true,
          response: {
            content: {
              kind: MISSION_OUTCOME_PLAN_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              storyPositionHash: request.context.storyPositionHash,
              resultBand: 'Partial Success',
              outcomeSummary: 'The XO gives Whitaker a bounded first-read answer.',
              consequencePlan: {
                costs: ['Whitaker expects follow-up after inspection.'],
                revealedFactIds: ['crew.transfer-cohort-tension'],
                commandDecisionAwards: [],
                openAssignments: [],
                questOutcomeKey: '',
                completionRecommendation: 'continue'
              },
              narrationPlan: {
                allowedFacts: ['Whitaker is in the ready room.'],
                forbiddenFacts: [],
                constraints: ['Do not reintroduce boarding.'],
                mustPreserve: ['Already in ready room.'],
                mustNotReestablish: ['Boarding the ship.']
              },
              stateProposal: { allowedRoots: ['mission'], operations: [] },
              diagnostics: { reasonerUsed: false, uncertainties: [], reviewRequired: false }
            }
          }
        };
      }
      if (roleId === 'missionDirectorPlanReviewer') {
        return {
          ok: true,
          response: {
            content: {
              kind: MISSION_DIRECTOR_PLAN_REVIEW_KIND,
              schemaVersion: 1,
              sourceHash: frameHash,
              storyPositionHash: request.context.storyPositionHash,
              outcomePlanHash: request.context.outcomePlanHash,
              approved: reviewerAction === 'approve',
              risk: reviewerAction === 'approve' ? 'low' : 'high',
              requiredAction: reviewerAction,
              reasons: reviewerAction === 'approve' ? [] : ['fixture rejection'],
              narrationSafety: { hiddenStateLeak: false, staleSetupRisk: false, forbiddenClaims: [] }
            }
          }
        };
      }
      return { ok: false, error: { code: 'unexpected_role' } };
    }
  };
}

const baseOptions = {
  campaignState: {
    campaign: { id: 'campaign-1' },
    mission: { activeMissionId: 'prelude-a-ship-underway', activePhaseId: 'ready-room-handover', availableDecisionPointIds: ['decision.ready-room-handover'] },
    attentionState: { foregroundQuestId: 'prelude-a-ship-underway', scene: { locationId: 'captain-ready-room', presentCharacterIds: ['mara-whitaker'] } },
    worldState: { currentLocationId: 'captain-ready-room', currentStardate: 58912.4 },
    knowledgeLedger: { facts: [{ id: 'crew.transfer-cohort-tension', known: true }] }
  },
  packageData: {
    questTemplates: {
      templates: [{
        id: 'prelude-a-ship-underway',
        missionGraph: {
          id: 'ashes-prelude',
          phases: [{ id: 'ready-room-handover', label: 'Ready Room Handover' }],
          decisionPoints: [{ id: 'decision.ready-room-handover' }]
        }
      }]
    }
  },
  turnId: 'turn.fixture',
  playerInput: 'I tell Whitaker I want a first-hand inspection before judging readiness.',
  message: { text: 'I tell Whitaker I want a first-hand inspection before judging readiness.', hostMessageId: 'msg-18' },
  chatId: 'chat-1',
  ingressId: 'ingress-1',
  arbiterPlan: { route: 'directiveOutcome' },
  sceneSnapshot: { activePhaseId: 'ready-room-handover', playerInput: 'fixture' },
  recentTranscript: [{ role: 'assistant', text: 'Whitaker asks for Sam first read.' }]
};

const router = routerFor();
const result = await runMissionDirectorModelSpine({ ...baseOptions, generationRouter: router });
assert.equal(result.ok, true);
assert.equal(result.route, 'outcome');
assert.equal(result.turnPacket.outcomePacket.resultBand, 'Partial Success');
assert.deepEqual(router.calls.map((call) => call.roleId), [
  'missionDirectorStoryPositioner',
  'missionDirectorOutcomePlanner',
  'missionDirectorPlanReviewer'
]);

const hostRouter = routerFor({ storyRoute: 'hostContinue' });
const hostResult = await runMissionDirectorModelSpine({ ...baseOptions, generationRouter: hostRouter });
assert.equal(hostResult.ok, true);
assert.equal(hostResult.route, 'hostContinue');
assert.equal(hostResult.turnPacket, null);
assert.deepEqual(hostRouter.calls.map((call) => call.roleId), ['missionDirectorStoryPositioner']);

const rejectedRouter = routerFor({ reviewerAction: 'pause' });
const rejected = await runMissionDirectorModelSpine({ ...baseOptions, generationRouter: rejectedRouter });
assert.equal(rejected.ok, false);
assert.equal(rejected.route, 'pause');
assert.equal(rejected.turnPacket, null);

console.log('mission director model spine passed');
```

Add a script:

```json
"test:mission-director-model-spine": "node tools/scripts/test-mission-director-model-spine.mjs"
```

- [ ] **Step 2: Run the failing spine test**

Run: `npm.cmd run test:mission-director-model-spine`

Expected: FAIL with module-not-found for `mission-director-model-spine.mjs`.

- [ ] **Step 3: Implement the spine runner**

Create `src/directors/mission-director-model-spine.mjs`:

```js
import { buildMissionDirectorFrame } from './mission-director-frame.mjs';
import {
  normalizeMissionDirectorPlanReview,
  normalizeMissionOutcomePlan,
  normalizeMissionStoryPosition
} from './mission-director-model-contracts.mjs';
import { hashStableJson } from '../runtime/architecture-redesign-contracts.mjs';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function compact(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function extractData(result = {}) {
  const response = result.response || result;
  if (response.content && typeof response.content === 'object') return response.content;
  if (response.data && typeof response.data === 'object') return response.data;
  const text = response.text || response.content || response.raw?.text || '';
  if (typeof text === 'string' && text.trim()) return JSON.parse(text);
  return null;
}

async function generateJson(generationRouter, roleId, request) {
  if (!generationRouter || typeof generationRouter.generate !== 'function') {
    return { ok: false, error: { code: 'generation_router_missing' } };
  }
  try {
    const result = await generationRouter.generate(roleId, request);
    if (!result?.ok) return { ok: false, error: result?.error || { code: 'provider_failed' } };
    return { ok: true, value: extractData(result), error: null };
  } catch (error) {
    return { ok: false, error: { code: error?.code || 'provider_exception', message: error?.message || String(error) } };
  }
}

export function buildTurnPacketFromOutcomePlan({ turnId, sceneSnapshot = {}, storyPosition, outcomePlan, review }) {
  const outcomeId = `outcome.${String(turnId || 'mission-model').replace(/^turn\./, '')}`;
  const summary = compact(outcomePlan.outcomeSummary) || 'Mission Director outcome plan accepted.';
  return {
    contractVersion: 2,
    turnId,
    sceneSnapshot: cloneJson(sceneSnapshot),
    modelStoryPosition: cloneJson(storyPosition),
    modelPlanReview: cloneJson(review),
    intentParse: {
      summary,
      primaryIntent: 'model-authored-mission-outcome',
      targetIds: [],
      declaredMethod: summary,
      assumptions: [],
      signals: { modelAuthored: true }
    },
    actionClassification: {
      category: 'modelAuthoredMissionOutcome',
      reason: storyPosition.outcomeRelevance?.reason || 'Mission Director model spine selected outcome.'
    },
    authorityCapabilityCheck: {
      result: 'model-reviewed-custody-pending',
      authority: { result: 'model-reviewed', basis: [] },
      capability: { result: 'model-reviewed', basis: [] },
      constraints: []
    },
    directorResponse: {
      usedDecisionPointIds: cloneJson(storyPosition.outcomeRelevance?.activeDecisionIds || []),
      usedFactIds: cloneJson(outcomePlan.consequencePlan?.revealedFactIds || []),
      usedClockIds: [],
      usedPressureIds: [],
      primaryPressureIds: [],
      secondaryPressureIds: [],
      commandDecisionCandidates: cloneJson(outcomePlan.consequencePlan?.commandDecisionAwards || []),
      focusBudget: { primaryPressureMax: 1, secondaryPressureMax: 1, relationshipBeatMax: 1 },
      responseSummary: summary
    },
    outcomePacket: {
      id: outcomeId,
      resultBand: outcomePlan.resultBand,
      summary,
      costs: cloneJson(outcomePlan.consequencePlan?.costs || []),
      revealedFactIds: cloneJson(outcomePlan.consequencePlan?.revealedFactIds || []),
      commandDecisionAwards: cloneJson(outcomePlan.consequencePlan?.commandDecisionAwards || []),
      questCompleted: outcomePlan.consequencePlan?.completionRecommendation === 'completeQuest'
    },
    competencePacket: {
      sourceOutcomeId: outcomeId,
      assumedActions: [],
      proceduralWarnings: cloneJson(outcomePlan.diagnostics?.uncertainties || []),
      authorityNotes: [],
      counselRequests: [],
      noGotchaPolicyApplied: true
    },
    stateDelta: {
      outcomeId,
      mission: {},
      openWorld: {
        sourceAnchorRange: cloneJson(sceneSnapshot.sourceAnchorRange || null),
        modelStateProposal: cloneJson(outcomePlan.stateProposal || null)
      }
    },
    narratorPacket: {
      sourceOutcomeId: outcomeId,
      resultBand: outcomePlan.resultBand,
      summary,
      constraints: cloneJson(outcomePlan.narrationPlan?.constraints || []),
      allowedFacts: cloneJson(outcomePlan.narrationPlan?.allowedFacts || []),
      forbiddenFacts: cloneJson(outcomePlan.narrationPlan?.forbiddenFacts || []),
      mustPreserve: cloneJson(outcomePlan.narrationPlan?.mustPreserve || []),
      mustNotReestablish: cloneJson(outcomePlan.narrationPlan?.mustNotReestablish || [])
    },
    commandLogPacket: {
      sourceOutcomeId: outcomeId,
      summaryInputs: [summary],
      visibleConsequences: cloneJson(outcomePlan.consequencePlan?.costs || [])
    },
    provenance: {
      modelSpine: true,
      storyPositionHash: hashStableJson(storyPosition),
      outcomePlanHash: hashStableJson(outcomePlan),
      reviewHash: hashStableJson(review)
    }
  };
}

export async function runMissionDirectorModelSpine(options = {}) {
  const {
    generationRouter,
    turnId,
    sceneSnapshot = {}
  } = options;
  const frameResult = buildMissionDirectorFrame(options);
  const sourceHash = frameResult.sourceHash;
  const storyRaw = await generateJson(generationRouter, 'missionDirectorStoryPositioner', {
    lane: 'utility',
    sourceHash,
    context: { ...frameResult, sourceHash },
    responseFormat: 'json'
  });
  if (!storyRaw.ok) return { ok: false, route: 'pause', turnPacket: null, diagnostics: { stage: 'storyPositioner', error: storyRaw.error } };
  const story = normalizeMissionStoryPosition(storyRaw.value, { expectedSourceHash: sourceHash });
  if (!story.ok) return { ok: false, route: 'pause', turnPacket: null, diagnostics: { stage: 'storyPositionerValidation', error: story.error } };
  if (story.value.outcomeRelevance.route !== 'outcome') {
    return { ok: true, route: story.value.outcomeRelevance.route, storyPosition: story.value, outcomePlan: null, review: null, turnPacket: null, diagnostics: { sourceHash } };
  }
  const storyPositionHash = hashStableJson(story.value);
  const outcomeRaw = await generateJson(generationRouter, 'missionDirectorOutcomePlanner', {
    lane: 'reasoning',
    sourceHash,
    context: { ...frameResult, sourceHash, storyPosition: story.value, storyPositionHash },
    responseFormat: 'json'
  });
  if (!outcomeRaw.ok) return { ok: false, route: 'pause', storyPosition: story.value, turnPacket: null, diagnostics: { stage: 'outcomePlanner', error: outcomeRaw.error } };
  const outcome = normalizeMissionOutcomePlan(outcomeRaw.value, {
    expectedSourceHash: sourceHash,
    expectedStoryPositionHash: storyPositionHash,
    allowedRoots: frameResult.allowedRoots,
    allowedFactIds: frameResult.allowedFactIds,
    allowedDecisionIds: frameResult.allowedDecisionIds
  });
  if (!outcome.ok) return { ok: false, route: 'pause', storyPosition: story.value, turnPacket: null, diagnostics: { stage: 'outcomePlannerValidation', error: outcome.error } };
  const outcomePlanHash = hashStableJson(outcome.value);
  const reviewRaw = await generateJson(generationRouter, 'missionDirectorPlanReviewer', {
    lane: 'utility',
    sourceHash,
    context: { sourceHash, storyPosition: story.value, storyPositionHash, outcomePlan: outcome.value, outcomePlanHash },
    responseFormat: 'json'
  });
  if (!reviewRaw.ok) return { ok: false, route: 'pause', storyPosition: story.value, outcomePlan: outcome.value, turnPacket: null, diagnostics: { stage: 'reviewer', error: reviewRaw.error } };
  const review = normalizeMissionDirectorPlanReview(reviewRaw.value, { expectedSourceHash: sourceHash, expectedStoryPositionHash: storyPositionHash, expectedOutcomePlanHash: outcomePlanHash });
  if (!review.ok || !review.value.approved || review.value.requiredAction !== 'approve') {
    return { ok: false, route: review.value?.requiredAction || 'pause', storyPosition: story.value, outcomePlan: outcome.value, review: review.value || null, turnPacket: null, diagnostics: { stage: 'reviewerValidation', error: review.error } };
  }
  const turnPacket = buildTurnPacketFromOutcomePlan({ turnId, sceneSnapshot, storyPosition: story.value, outcomePlan: outcome.value, review: review.value });
  return {
    ok: true,
    route: 'outcome',
    storyPosition: story.value,
    outcomePlan: outcome.value,
    review: review.value,
    turnPacket,
    diagnostics: { sourceHash, storyPositionHash, outcomePlanHash }
  };
}
```

- [ ] **Step 4: Run the spine test**

Run: `npm.cmd run test:mission-director-model-spine`

Expected: PASS and prints `mission director model spine passed`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/directors/mission-director-model-spine.mjs tools/scripts/test-mission-director-model-spine.mjs
git commit -m "feat: add mission director model spine"
```

---

### Task 5: Route Foreground Mission Director Through the Spine

**Files:**
- Modify: `src/directors/open-world-turn-coordinator.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `tools/scripts/test-chat-turn-orchestrator.mjs`

**Interfaces:**
- Consumes: `runMissionDirectorModelSpine(options)` from Task 4
- Produces: Director preview/commit path that uses model spine for foreground `directiveOutcome`

- [ ] **Step 1: Add regression expectations**

In `tools/scripts/test-chat-turn-orchestrator.mjs`, add a fixture where:

```js
const generationRoles = [];
const generationRouter = {
  async generate(roleId, request) {
    generationRoles.push(roleId);
    return modelSpineFixtureResponse(roleId, request);
  }
};
```

Assert:

```js
assert.deepEqual(generationRoles.slice(0, 3), [
  'missionDirectorStoryPositioner',
  'missionDirectorOutcomePlanner',
  'missionDirectorPlanReviewer'
]);
assert.equal(JSON.stringify(result).includes('complete-ready-room-handover'), false);
assert.equal(JSON.stringify(result).includes('model-authored-mission-outcome'), true);
```

Also add a provider-failure fixture:

```js
const failingRouter = { async generate() { return { ok: false, error: { code: 'fixture_failure' } }; } };
const failed = await orchestrator.observePlayerMessage({ text: 'I issue the order.', chatId: 'chat-1', generationRouter: failingRouter });
assert.notEqual(failed.decision?.classification, 'directorResponseNeeded');
assert.equal(JSON.stringify(failed).includes('complete-ready-room-handover'), false);
assert.equal(failed.recoveryRequired || failed.responseStrategy === 'pause' || failed.responseStrategy === 'injectAndContinue', true);
```

- [ ] **Step 2: Run the regression test**

Run: `node tools/scripts/test-chat-turn-orchestrator.mjs`

Expected: FAIL because runtime still uses deterministic Director internals.

- [ ] **Step 3: Integrate the spine in the coordinator**

In `src/directors/open-world-turn-coordinator.mjs`:

1. Import the spine:

```js
import { runMissionDirectorModelSpine } from './mission-director-model-spine.mjs';
```

2. In `createDirectorCoordinatorTurnAsync`, replace the model interpretation branch with:

```js
export async function createDirectorCoordinatorTurnAsync({ generationRouter = null, ...options } = {}) {
  const sceneSnapshot = buildOpenWorldSceneSnapshot(options.campaignState, options.packageData, options.playerInput, options.sceneSnapshotOverrides || {});
  const spine = await runMissionDirectorModelSpine({
    ...options,
    generationRouter,
    sceneSnapshot,
    message: options.message || { text: options.playerInput },
    recentTranscript: options.recentTranscript || [],
    arbiterPlan: options.arbiterPlan || null,
    sourceFrameRef: options.sourceFrameRef || null
  });
  if (spine.ok && spine.route === 'hostContinue') {
    return {
      turnPacket: null,
      projectedState: options.campaignState,
      hostContinue: true,
      storyPosition: spine.storyPosition,
      diagnostics: spine.diagnostics
    };
  }
  if (!spine.ok || spine.route !== 'outcome' || !spine.turnPacket) {
    const error = new Error('Mission Director model spine did not produce an approved outcome.');
    error.code = 'MISSION_DIRECTOR_MODEL_SPINE_FAILED';
    error.details = spine.diagnostics || {};
    throw error;
  }
  return finalizeCoordinatedTurn({
    campaignState: options.campaignState,
    packageData: options.packageData,
    packet: spine.turnPacket,
    turnId: options.turnId,
    sceneSnapshot,
    sceneSnapshotOverrides: options.sceneSnapshotOverrides || {},
    usedTacticalGraph: false,
    interpretation: null,
    fallbackReason: null,
    continuityDirectorPacket: null
  });
}
```

3. Do not call `interpretQuestActionWithModel()` or `deterministicQuestActionInterpretation()` from the async foreground runtime path.

- [ ] **Step 4: Pass generation context from runtime**

In `src/runtime/runtime-app.mjs`, where `createDirectorCoordinatorTurnAsync` or preview options are built, include:

```js
generationRouter,
message: options.message || null,
recentTranscript: options.recentTranscript || [],
arbiterPlan: options.arbiterPlan || null,
sourceFrameRef: options.sourceFrameRef || null
```

In `src/runtime/chat-turn-orchestrator.mjs`, when calling `previewDirectorTurn`, pass:

```js
arbiterPlan: cloneJson(decision.arbiterPlan || null),
message: cloneJson(message),
recentTranscript: displaySafeRecentChat(host.chat.getRecentMessages?.({ limit: 12, playerSafeOnly: true }) || []),
sourceFrameRef: cloneJson(decision.sourceFrameRef || null)
```

- [ ] **Step 5: Run the orchestrator test**

Run: `node tools/scripts/test-chat-turn-orchestrator.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/directors/open-world-turn-coordinator.mjs src/runtime/runtime-app.mjs src/runtime/chat-turn-orchestrator.mjs tools/scripts/test-chat-turn-orchestrator.mjs
git commit -m "feat: route mission director through model spine"
```

---

### Task 6: Remove Runtime Semantic Fallbacks

**Files:**
- Modify: `src/directors/open-world-turn-coordinator.mjs`
- Modify: `src/adjudication/intent-parser.mjs`
- Modify: `src/adjudication/ashes-of-peace/action-resolver.mjs`
- Modify: `tools/scripts/test-mission-director-model-spine.mjs`

**Interfaces:**
- Consumes: model spine integration from Task 5
- Produces: runtime cannot use deterministic intent parser or Ashes resolver for foreground Mission Director outcome semantics

- [ ] **Step 1: Add import-guard regression**

In `tools/scripts/test-mission-director-model-spine.mjs`, add:

```js
import fs from 'node:fs';

const coordinatorSource = fs.readFileSync(new URL('../../src/directors/open-world-turn-coordinator.mjs', import.meta.url), 'utf8');
assert.equal(coordinatorSource.includes("import { parseIntent }"), false);
assert.equal(coordinatorSource.includes("deterministicQuestActionInterpretation"), false);
assert.equal(coordinatorSource.includes("resolveAction("), false);
```

- [ ] **Step 2: Run the guard test**

Run: `npm.cmd run test:mission-director-model-spine`

Expected: FAIL while deterministic imports remain.

- [ ] **Step 3: Demote deterministic files**

In `src/adjudication/intent-parser.mjs`, add a top-level comment:

```js
// Legacy fixture/comparison parser. Foreground Mission Director runtime must not import this for semantic authority.
```

In `src/adjudication/ashes-of-peace/action-resolver.mjs`, add:

```js
// Legacy fixture/comparison resolver. Foreground Mission Director runtime must not call this as semantic fallback.
```

In `src/directors/open-world-turn-coordinator.mjs`, remove unused imports:

```js
import { parseIntent } from '../adjudication/intent-parser.mjs';
import {
  deterministicQuestActionInterpretation,
  interpretQuestActionWithModel,
  validateQuestActionInterpretation
} from '../quests/action-interpreter.mjs';
```

Remove branches that call those functions in the async foreground path. Keep synchronous helpers only if tests outside live runtime still import them, but mark them test-only or unreachable from `createDirectorCoordinatorTurnAsync`.

- [ ] **Step 4: Run guard and affected tests**

Run:

```bash
npm.cmd run test:mission-director-model-spine
node tools/scripts/test-chat-turn-orchestrator.mjs
node tools/scripts/test-chat-native-runtime-flow.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/directors/open-world-turn-coordinator.mjs src/adjudication/intent-parser.mjs src/adjudication/ashes-of-peace/action-resolver.mjs tools/scripts/test-mission-director-model-spine.mjs
git commit -m "refactor: demote deterministic mission semantics"
```

---

### Task 7: Diagnostics and Gates

**Files:**
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-chat-native-runtime-flow.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: spine diagnostics `{ sourceHash, storyPositionHash, outcomePlanHash }`
- Produces: sanitized model-call and runtime diagnostics for the Mission Director model spine

- [ ] **Step 1: Add diagnostics assertions**

In `tools/scripts/test-chat-native-runtime-flow.mjs`, add assertions after a model-spine committed outcome:

```js
const journalText = JSON.stringify(runtime.view?.() || runtime.debugSnapshot?.() || {});
assert.match(journalText, /missionDirectorStoryPositioner|missionDirectorOutcomePlanner|missionDirectorPlanReviewer/);
assert.doesNotMatch(journalText, /raw relationship|hidden pressure|provider reasoning|api key|csrf|cookie/i);
```

In `tools/scripts/run-alpha-gate.mjs`, add the focused tests:

```js
await run('node', ['tools/scripts/test-mission-director-model-contracts.mjs']);
await run('node', ['tools/scripts/test-mission-director-frame.mjs']);
await run('node', ['tools/scripts/test-mission-director-model-spine.mjs']);
```

- [ ] **Step 2: Run diagnostics tests**

Run:

```bash
node tools/scripts/test-chat-native-runtime-flow.mjs
node tools/scripts/run-alpha-gate.mjs
```

Expected: FAIL until diagnostics are surfaced and alpha gate includes the new tests.

- [ ] **Step 3: Surface sanitized diagnostics**

Where Director preview/commit results are recorded in `src/runtime/runtime-app.mjs` and `src/runtime/chat-turn-orchestrator.mjs`, include:

```js
missionDirectorModelSpine: {
  storyPositionHash: result.diagnostics?.storyPositionHash || null,
  outcomePlanHash: result.diagnostics?.outcomePlanHash || null,
  route: result.hostContinue ? 'hostContinue' : 'outcome',
  roleIds: [
    'missionDirectorStoryPositioner',
    result.hostContinue ? null : 'missionDirectorOutcomePlanner',
    result.hostContinue ? null : 'missionDirectorPlanReviewer'
  ].filter(Boolean)
}
```

Do not include raw frame, raw transcript, raw model request, raw provider response, raw player text, hidden state, or provider reasoning.

- [ ] **Step 4: Run gates**

Run:

```bash
node tools/scripts/test-generation-router.mjs
node tools/scripts/test-model-call-authority-matrix.mjs
node tools/scripts/test-mission-director-model-contracts.mjs
node tools/scripts/test-mission-director-frame.mjs
node tools/scripts/test-mission-director-model-spine.mjs
node tools/scripts/test-chat-turn-orchestrator.mjs
node tools/scripts/test-chat-native-runtime-flow.mjs
node tools/scripts/run-alpha-gate.mjs
npm.cmd test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/runtime/chat-turn-orchestrator.mjs src/runtime/runtime-app.mjs tools/scripts/test-chat-native-runtime-flow.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "test: gate mission director model spine"
```

---

## Self-Review

- Spec coverage: Tasks cover new model roles, Saga-inspired story position, model-authored outcome plan, model review, custody validation, runtime integration, deterministic semantic demotion, diagnostics, and gates.
- Placeholder scan: The plan contains no unresolved placeholder language or unspecified test steps.
- Type consistency: `sourceHash`, `storyPositionHash`, and `outcomePlanHash` flow from frame to story position to outcome plan to review. Function names match the file structure section.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-mission-director-model-spine.md`. Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.

Choose the execution mode before implementation starts.
