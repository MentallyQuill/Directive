# V1 State Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the versioned, deterministic V1 Story Settlement and mission-state spine that can interpret bounded evidence without allowing models, prose, UI, or legacy trackers to mutate campaign truth directly.

**Architecture:** Introduce focused V1 contract, predicate, evidence, reducer, and settlement modules beside the current pre-alpha systems. Prove them with dependency-free Node contract tests and one spoiler-safe Hesperus reference fixture before adding state-gateway shadow integration. Do not cut over Hesperus content, player UI, Command Bearing, or legacy writers in this plan; later plans consume this tested spine.

**Tech Stack:** JavaScript ES modules, JSON Schema Draft 2020-12, dependency-free Node assertions, existing state-delta gateway and alpha-gate runner.

## Execution Record

Tasks 1 through 7 are implemented. All seven direct V1 suites, all six focused legacy regression suites, and the complete 242-check alpha gate pass. Task 7 records the final classification and readiness boundary in [V1 State Spine Implementation Report](../../development/V1_STATE_SPINE_IMPLEMENTATION_REPORT.md).

This plan remains bounded as originally approved: it establishes the generic additive shadow spine and does not claim Ashes migration, player-facing cutover, or legacy-writer retirement.

## Global Constraints

- Work only on branch `rearchitected` in `F:\git\Directive\.worktrees\rearchitected`.
- Ashes of Peace is the only V1-native campaign target.
- Story Settlement is the sole target V1 semantic chronology.
- Models produce bounded proposals; deterministic code validates and commits.
- Player prose can prove intent or speech, not its own success.
- Objective order comes from predicates, never array position.
- Hidden optional objectives cannot block, downgrade, or leak into primary completion.
- Only authored player-visible clocks may render deadlines.
- One accepted scene produces zero or one semantic episode.
- Native SillyTavern source identity, selected swipes, edits, deletion, and branches remain authoritative.
- This plan is additive and shadow-only at runtime; it must not disable legacy writers before later parity and migration gates.
- Keep modules focused; do not add a general rules engine, arbitrary executable predicates, model calls, or third-party dependencies.
- Add every new contract test to `tools/scripts/run-alpha-gate.mjs`, while also running it directly because the known baseline visual test currently stops the full gate early.

---

### Task 1: Versioned Story and Mission Contracts

**Files:**
- Create: `src/story/story-settlement-contracts.mjs`
- Create: `src/mission/v1/mission-contracts.mjs`
- Create: `schemas/story/story-settlement.schema.json`
- Create: `schemas/mission/mission-v1.schema.json`
- Create: `tools/scripts/test-v1-story-settlement-contracts.mjs`
- Create: `tools/scripts/test-v1-mission-contracts.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `createEmptyStorySettlement({ branchId })`, `validateStorySettlement(value)`, `validateMissionDefinition(definition)`, `indexMissionDefinition(definition)`, and exported V1 enum sets used by every later task.
- Consumes: existing stable-ID conventions and JSON-safe campaign records only.

- [x] **Step 1: Write failing Story Settlement contract tests**

Test exact initial state, invalid branch IDs, one active episode limit, sealed episode immutability shape, source-contribution requirements, effect identity uniqueness, receipt shape, and single valid Focus reference.

```js
const empty = createEmptyStorySettlement({ branchId: 'save.alpha' });
assert.deepEqual(empty, {
  kind: 'directive.storySettlement.v1',
  schemaVersion: 1,
  branchId: 'save.alpha',
  revision: 0,
  activeEpisode: null,
  episodes: [],
  receipts: [],
  focus: null
});
assert.equal(validateStorySettlement(empty).ok, true);
assert.match(validateStorySettlement({ ...empty, branchId: '' }).errors.join('\n'), /branchId/);
```

- [x] **Step 2: Run the Story Settlement test and verify RED**

Run: `node tools/scripts/test-v1-story-settlement-contracts.mjs`

Expected: failure because `src/story/story-settlement-contracts.mjs` does not exist.

- [x] **Step 3: Implement Story Settlement constants, factory, and structural validator**

Define and export:

```js
export const STORY_SETTLEMENT_KIND = 'directive.storySettlement.v1';
export const STORY_EPISODE_KIND = 'directive.storyEpisode.v1';
export const STORY_SETTLEMENT_RECEIPT_KIND = 'directive.storySettlementReceipt.v1';
export const EMERGENT_FOCUS_KIND = 'directive.emergentFocus.v1';
export const STORY_EPISODE_STATUSES = Object.freeze(new Set([
  'open', 'sealPending', 'recoveryRequired', 'sealed', 'invalidated'
]));
export function createEmptyStorySettlement({ branchId = 'main' } = {}) {}
export function validateStorySettlement(value = {}) {}
```

The validator returns `{ ok, errors }`, rejects unknown kinds/statuses, duplicate episode/effect/receipt IDs, more than one nonterminal episode, source contributions without `messageId`, `role`, `textHash`, or `acceptedAtRevision`, and Focus references that do not point to an unresolved consequence in a sealed current-branch episode.

- [x] **Step 4: Add the Story Settlement JSON schema**

Mirror the runtime contract using strict `additionalProperties: false` at the root and durable record boundaries. Permit bounded diagnostic metadata only inside an explicit `diagnostics` object. Do not permit raw transcript duplication.

- [x] **Step 5: Run the Story Settlement test and verify GREEN**

Run: `node tools/scripts/test-v1-story-settlement-contracts.mjs`

Expected: `V1 Story Settlement contract tests passed.`

- [x] **Step 6: Write failing mission-definition contract tests**

Cover stable IDs; required, optional, and conditional classes; conditional `activatedAs`; independent visibility; terminal dispositions; known predicate operators; objective references; clock completeness; transition priority; and deterministic rejection of duplicate or unknown references.

```js
const result = validateMissionDefinition(referenceMission);
assert.equal(result.ok, true, result.errors.join('\n'));
assert.match(
  validateMissionDefinition({ ...referenceMission, objectives: [{ ...referenceMission.objectives[0], id: 'objective.missing-ref', availableWhen: { factKnown: 'fact.unknown' } }] }).errors.join('\n'),
  /unknown fact/
);
```

- [x] **Step 7: Run the mission-definition test and verify RED**

Run: `node tools/scripts/test-v1-mission-contracts.mjs`

Expected: failure because `src/mission/v1/mission-contracts.mjs` does not exist.

- [x] **Step 8: Implement mission constants, definition index, and validator**

Define and export:

```js
export const MISSION_DEFINITION_KIND = 'directive.missionDefinition.v1';
export const MISSION_OBJECTIVE_CLASSES = Object.freeze(new Set(['required', 'optional', 'conditional']));
export const MISSION_OBJECTIVE_STATES = Object.freeze(new Set(['inactive', 'available', 'inProgress', 'terminal']));
export const MISSION_OBJECTIVE_DISPOSITIONS = Object.freeze(new Set([
  'completed', 'completedWithCost', 'handedOff', 'knowinglyDeclined',
  'waived', 'failedAfterInformedAction', 'expiredAfterKnownDeadline'
]));
export function indexMissionDefinition(definition = {}) {}
export function validateMissionDefinition(definition = {}) {}
```

The index contains maps for objectives, facts, events, outcomes, clocks, terminal dispositions, and transitions. The validator checks all predicate references without evaluating predicates, rejects dependency cycles by default, requires visible routes for conditional-required objectives, and rejects ambiguous equal-priority terminal transitions.

- [x] **Step 9: Add the V1 mission JSON schema**

Define strict records for player-safe text, objectives, facts, events, outcomes, clocks, outcome dimensions, close predicate, terminal dispositions, and transitions. Predicate leaves are declarative JSON and cannot contain source code or model instructions.

- [x] **Step 10: Register and run both tests**

Add `test-v1-story-settlement-contracts.mjs` and `test-v1-mission-contracts.mjs` immediately after existing story contract checks in `run-alpha-gate.mjs`.

Run:

```powershell
node tools/scripts/test-v1-story-settlement-contracts.mjs
node tools/scripts/test-v1-mission-contracts.mjs
```

Expected: both pass.

- [x] **Step 11: Commit Task 1**

```text
feat(architecture): add V1 state contracts
```

### Task 2: Declarative Predicate Engine

**Files:**
- Create: `src/mission/v1/predicate-evaluator.mjs`
- Create: `tools/scripts/test-v1-mission-predicates.mjs`
- Modify: `src/mission/v1/mission-contracts.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `indexMissionDefinition(definition)` from Task 1 and a read-only mission evaluation context.
- Produces: `validateMissionPredicate(predicate, index)`, `evaluateMissionPredicate(predicate, context)`, and `collectMissionPredicateRefs(predicate)`.

- [x] **Step 1: Write failing predicate tests**

Test constants, `all`, `any`, `not`, `factKnown`, `worldFact`, `eventOccurred`, `outcomeIs`, `objectiveState`, `objectiveDisposition`, `clockState`, and `missionStatus`. Prove short-circuit behavior, unknown operators, malformed leaves, and no state mutation.

```js
const predicate = {
  all: [
    { eventOccurred: 'event.survivors-transferred' },
    { any: [
      { factKnown: 'fact.manifest-reconciled' },
      { objectiveDisposition: { id: 'objective.account-crew', in: ['handedOff'] } }
    ] }
  ]
};
assert.equal(evaluateMissionPredicate(predicate, context).value, true);
```

- [x] **Step 2: Run the predicate test and verify RED**

Run: `node tools/scripts/test-v1-mission-predicates.mjs`

Expected: missing-module failure.

- [x] **Step 3: Implement the closed predicate vocabulary**

Return `{ ok, value, reasons, errors }`. Validation rejects unknown keys and mixed operators in one node. Evaluation never throws for false state; it throws only for programmer misuse and otherwise returns validation errors. Reasons name only player-safe or internal stable IDs and contain no model prose.

- [x] **Step 4: Bind definition validation to predicate validation**

Replace Task 1's internal predicate-reference walker with `validateMissionPredicate`. Keep import direction acyclic by moving shared enum constants to `mission-contracts.mjs` and allowing predicate evaluator to consume an index passed by the caller.

- [x] **Step 5: Run and register the predicate test**

Run: `node tools/scripts/test-v1-mission-predicates.mjs`

Expected: `V1 mission predicate tests passed.`

- [x] **Step 6: Commit Task 2**

```text
feat(mission): add deterministic predicates
```

### Task 3: Evidence and Accepted-Source Validation

**Files:**
- Create: `src/mission/v1/evidence-contracts.mjs`
- Create: `tools/scripts/test-v1-mission-evidence.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: indexed mission definitions, proposal records, and `resolveSourceRef(sourceRef)` supplied by CORE/SRE integration.
- Produces: `validateMissionEvidenceProposal({ definition, state, proposal, resolveSourceRef })` returning accepted and rejected claims without mutation.

- [x] **Step 1: Write failing evidence tests**

Cover current branch/revision, accepted-pair state, selected swipe, text hash, source role, known target ID, effect allowlist, duplicates, stale evidence, unsupported player self-certification, mixed valid/invalid claims, and provider confidence not overriding proof.

```js
const result = validateMissionEvidenceProposal({
  definition,
  state,
  proposal,
  resolveSourceRef: (ref) => acceptedSources.get(ref.messageId)
});
assert.deepEqual(result.acceptedClaims.map((claim) => claim.targetId), ['event.survivors-transferred']);
assert.equal(result.rejectedClaims[0].reasonCode, 'player-cannot-prove-outcome');
```

- [x] **Step 2: Run the evidence test and verify RED**

Run: `node tools/scripts/test-v1-mission-evidence.mjs`

Expected: missing-module failure.

- [x] **Step 3: Implement evidence contracts**

Support bounded claim types `intentExpressed`, `decisionRecorded`, `factDisclosed`, `eventOccurred`, `outcomeObserved`, and `timeAdvanced`. Only `intentExpressed` and `decisionRecorded` may rely on player-authored source alone. Result claims require assistant/runtime/adjudicator evidence. Deduplicate by branch, source identity, claim type, and target ID.

- [x] **Step 4: Add explicit rejection codes**

Use stable codes including `stale-revision`, `wrong-branch`, `source-missing`, `source-not-accepted`, `swipe-mismatch`, `hash-mismatch`, `unknown-target`, `effect-not-allowed`, `player-cannot-prove-outcome`, and `duplicate-claim`.

- [x] **Step 5: Run and register the evidence test**

Run: `node tools/scripts/test-v1-mission-evidence.mjs`

Expected: `V1 mission evidence tests passed.`

- [x] **Step 6: Commit Task 3**

```text
feat(mission): validate accepted evidence
```

### Task 4: Mission Reducer, Clocks, Closure, and Transition Packet

**Files:**
- Create: `src/mission/v1/mission-state.mjs`
- Create: `src/mission/v1/mission-reducer.mjs`
- Create: `tools/scripts/test-v1-mission-reducer.mjs`
- Create: `tests/fixtures/mission/v1/v1-hesperus-reference.fixture.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: validated claims from Task 3 and predicate evaluation from Task 2.
- Produces: `createMissionState({ definition, branchId })` and `reduceMissionEvidence({ definition, state, acceptedClaims, sourceContribution })` returning `{ state, effects, transitionPacket }`.

- [x] **Step 1: Write failing reducer tests**

Use a spoiler-safe Hesperus reference definition to prove objective activation, separate internal and visible state, valid non-linear ordering, primary rescue closure without fraud, late optional accountability, deterministic outcome dimensions, clocks, exactly-once transition activation, and no mutation of input.

```js
const rescueOnly = reduceMissionEvidence({ definition, state, acceptedClaims: rescueClaims, sourceContribution });
assert.equal(rescueOnly.state.status, 'terminal');
assert.equal(rescueOnly.state.terminalDisposition, 'primarySuccess');
assert.equal(rescueOnly.state.objectives['objective.hesperus-accountability'].visibility, 'hidden');
assert.equal(rescueOnly.transitionPacket.next.id, 'phase.command-review');
```

- [x] **Step 2: Run the reducer test and verify RED**

Run: `node tools/scripts/test-v1-mission-reducer.mjs`

Expected: missing-module failure.

- [x] **Step 3: Implement initial mission state**

Store definition ID/version, branch, revision, mission status, objective state keyed by stable ID, known facts, world facts, events, outcomes, clock states, outcome dimensions, accepted evidence keys, terminal disposition, and committed transition receipt.

- [x] **Step 4: Implement the reduction order**

Apply accepted claims, then disclosures, objective activation/visibility, progress, terminal dispositions, clock changes, clock consequences, outcome dimensions, mission closure, and one transition in that order. Derive objective state exclusively from authored predicates. Increment revision once per non-noop transaction.

- [x] **Step 5: Implement clock rules**

Only `timeAdvanced` claims with authoritative source may advance running clocks. Start, pause, resume, expiry, and resolution use authored predicates. Hidden clock expiry may cause world effects but cannot produce an evaluative objective disposition unless the clock was player-visible before the relevant choice.

- [x] **Step 6: Implement authorized transition packets**

Emit `directive.missionTransitionNarration.v1` only after terminal state commits. Include source disposition, player-known outcome summaries, known optional outcomes, unresolved known consequences, one next target, `mustNarrate`, and `mustNotReveal`. Re-running the same evidence returns the existing transition receipt without a second activation.

- [x] **Step 7: Run and register the reducer test**

Run: `node tools/scripts/test-v1-mission-reducer.mjs`

Expected: `V1 mission reducer tests passed.`

- [x] **Step 8: Commit Task 4**

```text
feat(mission): reduce V1 mission state
```

### Task 5: Story Settlement Episode Lifecycle

**Files:**
- Create: `src/story/story-settlement.mjs`
- Create: `tools/scripts/test-v1-story-settlement.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: structural contracts from Task 1, accepted source contributions, and typed effects such as those returned by Task 4.
- Produces: `openStoryEpisode`, `acceptStoryContribution`, `appendStoryEffects`, `sealStoryEpisode`, `settleInsignificantScene`, `setEmergentFocus`, and `invalidateStorySource`.

- [x] **Step 1: Write failing lifecycle tests**

Prove zero/one episode per scene, idempotent contribution acceptance, effect deduplication, concise sealed episode shape, no-significance receipts, one Focus reference, invalid Focus rejection, branch isolation, source invalidation, and immutable input.

- [x] **Step 2: Run the lifecycle test and verify RED**

Run: `node tools/scripts/test-v1-story-settlement.mjs`

Expected: missing-module failure.

- [x] **Step 3: Implement active episode operations**

Opening requires branch and scene scope. Contributions use accepted message/swipe/hash custody. Effects carry stable IDs, type, target, source contribution IDs, and player visibility. Repeated contributions or effects are no-ops.

- [x] **Step 4: Implement sealing and receipts**

Sealing requires a boundary reason and either lasting changes, unresolved consequences, meaningful disclosures, or typed effects. Otherwise create a compact processing receipt and clear the active episode. Never copy the full transcript into the ledger.

- [x] **Step 5: Implement Focus and invalidation**

Focus can reference one unresolved consequence in one current sealed episode. Invalidation marks dependent episodes/effects invalidated, clears invalid Focus, and leaves supersession provenance for deterministic reconstruction.

- [x] **Step 6: Run and register the lifecycle test**

Run: `node tools/scripts/test-v1-story-settlement.mjs`

Expected: `V1 Story Settlement lifecycle tests passed.`

- [x] **Step 7: Commit Task 5**

```text
feat(story): add episode settlement lifecycle
```

### Task 6: State Gateway and Shadow Runtime Integration

**Files:**
- Create: `src/runtime/v1-state-spine.mjs`
- Create: `tools/scripts/test-v1-state-spine-runtime.mjs`
- Modify: `src/runtime/state-delta-gateway.mjs`
- Modify: `schemas/campaign/campaign-state-projection.schema.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: V1 Story Settlement and mission reducer modules plus existing gateway revision and persistence services.
- Produces: `createV1StateSpine({ getState, stateDeltaGateway, resolveSourceRef, now })` with shadow `settleAcceptedPair`, `reduceMissionProposal`, and `invalidateSources` operations.

- [x] **Step 1: Write failing integration tests**

Test gateway allowlisting for `storySettlement`, V1 mission state under `mission.v1`, compare-and-swap revision rejection, one persisted transaction, no legacy writer mutation, source invalidation, and shadow diagnostics when V1 output disagrees with legacy projection.

- [x] **Step 2: Run the integration test and verify RED**

Run: `node tools/scripts/test-v1-state-spine-runtime.mjs`

Expected: missing-module or forbidden-domain failure.

- [x] **Step 3: Add target state domains safely**

Allow `storySettlement` as a mutable root and `mission.v1` through the existing `mission` root. Add optional V1 state records to the campaign projection schema without requiring them for legacy packages or saves.

- [x] **Step 4: Implement shadow spine orchestration**

Validate source custody, validate evidence proposal, reduce mission state, append typed effects to one active episode, and commit through one state-delta transaction. In shadow mode, store bounded diagnostics but do not change player-facing legacy mission, quest, thread, ship, relationship, or Command Bearing projections.

- [x] **Step 5: Implement stale-result and invalidation behavior**

Reject stale base revisions before mutation. Source invalidation uses exact contribution IDs to rebuild V1 state from surviving effects or marks recovery required when required source is unavailable.

- [x] **Step 6: Run and register the integration test**

Run: `node tools/scripts/test-v1-state-spine-runtime.mjs`

Expected: `V1 state spine runtime tests passed.`

- [x] **Step 7: Commit Task 6**

```text
feat(runtime): integrate V1 state spine
```

### Task 7: Spine Robustness and Cutover Readiness Review

**Files:**
- Create: `docs/development/V1_STATE_SPINE_IMPLEMENTATION_REPORT.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/superpowers/plans/2026-08-09-v1-state-spine-implementation.md`

**Interfaces:**
- Consumes: all Task 1-6 tests and current runtime characterization.
- Produces: evidence-backed readiness report and explicit blockers for the next Prelude/Hesperus migration plan.

- [x] **Step 1: Run all V1 targeted tests**

```powershell
node tools/scripts/test-v1-story-settlement-contracts.mjs
node tools/scripts/test-v1-mission-contracts.mjs
node tools/scripts/test-v1-mission-predicates.mjs
node tools/scripts/test-v1-mission-evidence.mjs
node tools/scripts/test-v1-mission-reducer.mjs
node tools/scripts/test-v1-story-settlement.mjs
node tools/scripts/test-v1-state-spine-runtime.mjs
```

Expected: all pass with zero failures.

- [x] **Step 2: Run focused legacy regression tests**

```powershell
node tools/scripts/test-story-ledger-projection.mjs
node tools/scripts/test-state-delta-gateway.mjs
node tools/scripts/test-source-reconciliation-engine-synthetic.mjs
node tools/scripts/test-scene-handshake-settler.mjs
node tools/scripts/test-mission-director-story-graph-spine.mjs
node tools/scripts/test-mission-state-delta-contract.mjs
```

Expected: all pass because the new spine remains shadow-only.

- [x] **Step 3: Run the full alpha gate and classify baseline failures**

Run: `npm.cmd test`

Expected current baseline: the expanded-interface visual-conformance test may stop the gate at the previously observed `1024x768/people` independent-scroll assertion. Any new failure before that point or any different V1-related failure blocks this plan.

- [x] **Step 4: Challenge the implementation against the approved architecture**

Document evidence for varied-prose tolerance, strict mutation authority, source invalidation, optional discovery fairness, non-linear ordering, clock fairness, one-episode custody, idempotency, schema versioning, migration safety, and cost boundaries. Record every known limitation without calling shadow mode player-ready.

- [x] **Step 5: Write and index the implementation report**

The report distinguishes implemented state-spine behavior, current legacy behavior, known baseline failures, and the exact next plan: Prelude/Hesperus V1 data migration and runtime cutover.

- [x] **Step 6: Commit Task 7**

```text
docs(architecture): report V1 spine readiness
```

## Completion Boundary

This plan is complete when the generic V1 state spine is versioned, directly tested, shadow-integrated, and documented without changing current player-visible behavior. It does not claim Hesperus migration, UI retirement, neutral Command Bearing, or complete Ashes certification; those remain separate implementation plans that consume this spine.
