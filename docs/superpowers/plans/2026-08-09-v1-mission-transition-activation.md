# V1 Mission Transition Activation Implementation Plan

> **Execution rule:** implement task by task with red-green-refactor discipline. This slice may add state, runtime, prompt-packet, migration, and diagnostic contracts. It may not render a new player-facing mission state or alter the five-page UI.

**Goal:** Make a terminal V1 mission activate exactly one authored successor without letting narration choose progression, while preserving enough completed-mission evidence to undo closure and every descendant activation after an edit, delete, swipe, or branch change.

**Architecture:** `mission.v1` remains the one current mission state. Completed terminal states move into a closed `mission.v1History` archive; they are not copied into a second active authority. A small `mission.v1Journey` record owns branch-local run identity and the active run pointer. The source mission's existing transition receipt remains the transition authority. When an exact target V1 definition is available, State Delta Gateway atomically archives the terminal source, creates a fresh target state, advances the active run, updates the compatibility mission pointer, and seals the source Story episode. When the target definition is unavailable, the terminal source and its receipt remain a durable pending transition rather than fabricating a successor or rolling back valid closure.

Historic source mutation rebuilds the affected archived source from surviving evidence, removes every later mission run and descendant Story contribution, and either reactivates the source or creates one fresh successor from its rebuilt transition. This is deterministic causal rollback, not a player reconciliation workflow.

## Non-Negotiable Boundaries

- The model cannot close a mission, choose a terminal disposition, choose a target, create a target definition, or activate a successor.
- Narration occurs after commitment and cannot roll back or redirect a valid transition.
- `mission.v1History` contains terminal mission states only. `mission.v1` contains the current run only. No current state is duplicated.
- Every run is bound to one package ID/version, definition ID/version, source ID, branch, and deterministic run ID.
- V1 forbids repeated activation of the same definition in one journey. Repeating procedural missions require a later explicit instance/template contract rather than ambiguous history matching.
- A missing or invalid target definition produces a durable pending transition with a bounded reason code. It does not strand the source without a receipt and does not guess from legacy mission graphs.
- Phase targets remain pending until a versioned V1 phase-state contract exists. The runtime must not pretend that changing a legacy `activePhaseId` is equivalent to activating typed V1 state.
- Source mutation across a closure boundary invalidates the closure, activation, all descendant mission evidence, and descendant Story material in one transaction.
- Mission history and transition packets contain authored IDs, player-safe outcome/setup text, hashes, and typed effects only; no raw transcript or provider rationale.
- No transition automatically awards Command Bearing or creates ship, relationship, quest, thread, or Command Log rows.
- No player-facing rendering is changed in this slice.

---

### Task 1: Mission Journey and Archive Contract

**Files:**
- Create: `src/mission/v1/mission-journey.mjs`
- Create: `tools/scripts/test-v1-mission-journey.mjs`
- Modify: `schemas/campaign/campaign-state-projection.schema.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] **Step 1: Write failing journey validation tests**

Cover a fresh current run, one completed archived source plus one active successor, JSON restart, branch/package/version mismatch, duplicate run or definition identity, nonterminal archive state, active pointer mismatch, broken transition lineage, unknown fields, and hidden/raw text contamination.

- [x] **Step 2: Define deterministic run identity and normalization**

Derive the initial run from branch and definition identity. Derive a successor run from branch, source run, transition ID, and exact target definition. Normalize pre-journey shadow state without persisting or inventing history.

- [x] **Step 3: Validate disjoint authority**

Require terminal archived states to pass mission-state authority against their pinned definition. Require the current state to match the active run and compatibility `mission.activeMissionId`. Reject a definition appearing twice in one V1 journey.

- [x] **Step 4: Run and commit Task 1**

Commit:

```text
feat(mission): define V1 mission journeys
```

### Task 2: Atomic Mission-Target Activation

**Files:**
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`
- Modify: `tools/scripts/test-v1-mission-runtime.mjs`

- [x] **Step 1: Write failing two-definition transition tests**

Close a source mission with varied accepted evidence and prove that one transaction archives its terminal state, creates a fresh target state, advances the deterministic run pointer, updates the active mission source ID, and seals one Story episode.

- [x] **Step 2: Resolve targets exactly**

Match the authored target to exactly one valid V1 definition by stable definition ID or pinned package source ID. Require the same package ID/version, reject self-targeting, ambiguity, unavailable targets, and phase targets for immediate activation.

- [x] **Step 3: Preserve pending closure safely**

If a target cannot activate, commit the terminal source and transition receipt with a sanitized pending reason. Do not fabricate target state, call narration, or discard accepted closure evidence.

- [x] **Step 4: Prove idempotence and restart**

Replay, retry, and JSON restart cannot add a second archive entry, run, activation, boundary, episode, or target mission.

- [x] **Step 5: Run and commit Task 2**

Commit:

```text
feat(runtime): activate V1 mission successors
```

### Task 3: Pending Activation and Failure Containment

**Files:**
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Create: `tools/scripts/test-v1-mission-transition-runtime.mjs`
- Modify: `tools/scripts/test-runtime-host-injection.mjs`

- [x] **Step 1: Expose a pure pending-transition diagnostic**

Return whether the current terminal mission has no receipt, an unsupported phase target, a missing target definition, an invalid target, or one exactly activatable target. Do not mutate state or call a provider.

- [x] **Step 2: Add explicit pending activation**

When assets later contain the exact target definition, an internal runtime method atomically performs the same activation transaction. Provider and narration availability are irrelevant.

- [x] **Step 3: Prove state conflict and persistence behavior**

Stale revision, package drift, persistence rollback, restart, and repeated activation fail closed or no-op without duplicating progress. Returned errors exclude thrown text and hidden packet fields.

- [x] **Step 4: Run and commit Task 3**

Commit:

```text
feat(runtime): recover pending mission activation
```

### Task 4: Historic Closure Mutation and Causal Rollback

**Files:**
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-v1-source-mutation-runtime.mjs`
- Modify: `tools/scripts/test-v1-projection-rebuild.mjs`
- Create: `tools/scripts/test-v1-mission-journey-rebuild.mjs`

- [x] **Step 1: Write failing historic-source mutation tests**

After at least two mission activations, edit, delete, swipe, or branch-exclude evidence that closed the first mission. Locate the archived run by exact contribution identity, not text or mission title.

- [x] **Step 2: Rebuild and prune descendants atomically**

Rebuild the affected mission from surviving evidence. Remove later archived/current mission runs and every descendant Story contribution/effect/summary. If the source no longer closes, make it current. If it still closes to the same valid target, create one fresh successor activation epoch.

- [x] **Step 3: Preserve unrelated earlier history**

Mutation in a later mission cannot alter earlier archived states. A source with no mission effect may repair Story Settlement without rolling campaign progression back.

- [x] **Step 4: Prove branch, replay, and restart safety**

Two saves remain isolated; repeated mutation is a no-op; reconstruction calls no model; serialization preserves the repaired journey exactly.

- [x] **Step 5: Run and commit Task 4**

Commit:

```text
feat(runtime): rebuild mission journeys from source
```

### Task 5: Authorized Transition Narration Contract

**Files:**
- Create: `src/mission/v1/mission-transition-narration.mjs`
- Create: `tools/scripts/test-v1-mission-transition-narration.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] **Step 1: Write failing player-safe packet tests**

Build narration input only from the committed transition receipt, visible Story effects, player-known terminal/optional summaries, and the authored next setup. Exclude hidden facts, inactive objectives, evidence logs, source hashes, manifests, provider diagnostics, and legacy trackers.

- [x] **Step 2: Define strict narrator authority**

The model may write voice, pacing, dialogue, sensory detail, and connective scene prose. It may not change disposition, target, known outcomes, or reveal anything in `mustNotReveal`. Structured review may accept, reject, or request one bounded retry; it cannot mutate state.

- [x] **Step 3: Provide a deterministic local fallback**

If narration fails or is omitted, return a concise authored summary and next setup from the receipt. State remains committed and the campaign remains playable.

- [x] **Step 4: Keep installation diagnostic-only**

Expose packet/fallback preparation through the runtime app without injecting it into the narrator prompt or posting a message. Actual narrator installation remains a later prompt-authority cutover.

- [x] **Step 5: Run and commit Task 5**

Commit:

```text
feat(mission): bind transition narration authority
```

### Task 6: Readiness Evidence and Ashes Migration Handoff

**Files:**
- Create: `docs/development/V1_MISSION_TRANSITION_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/planning/ASHES_V1_MIGRATION_PLAN.md`
- Modify: this plan

- [x] **Step 1: Run focused and complete gates**

Record journey, reducer, runtime, transition, narration packet, source mutation, projection, host injection, schema/package, and complete alpha results.

- [x] **Step 2: Adversarial robustness review**

Challenge duplicate activation, missing targets, phase targets, self-transition, package drift, restart, narrator failure, persistence conflict, source mutation before/after closure, descendant pruning, branch isolation, hidden leakage, Command Bearing leakage, and tracking spam. Fix every Critical or Important non-UI finding.

- [x] **Step 3: Record the canonical Ashes boundary**

Prelude's transition remains pending until `chapter-1-the-empty-convoy` has a complete V1 definition. This is an explicit migration gate, not a reason to activate the legacy graph or weaken target validation.

- [x] **Step 4: Commit Task 6**

Commit:

```text
docs(runtime): certify V1 mission transitions
```

## Completion Boundary

This plan is complete when Directive proves that an exact terminal V1 mission activates one exact V1 successor atomically when available, remains durably pending when unavailable, and rolls closure plus descendants back from source custody. It does not authorize visible Mission-page changes, automatic transition narration, legacy writer retirement, or a claim that Ashes is complete. The next content slice must migrate `chapter-1-the-empty-convoy` into the now-proven transition contract.
