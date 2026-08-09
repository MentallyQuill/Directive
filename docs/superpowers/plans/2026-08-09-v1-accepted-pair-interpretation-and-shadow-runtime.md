# V1 Accepted-Pair Interpretation and Shadow Runtime Implementation Plan

> **Execution rule:** implement task by task with red-green-refactor discipline. Do not change player-facing UI in this plan.

**Goal:** Connect the certified Ashes Prelude mission definition to Directive's real commit-on-next-player-message lifecycle without giving a model state authority, without sealing one story entry per exchange, and without disabling legacy player-facing projections before their replacements exist.

**Architecture:** The selected previous assistant variant and the newly submitted player message form an exact, branch-bound source pair. A bounded Utility interpretation pass sees only authored mission-policy candidates and proposes candidate IDs. Deterministic code attaches exact source refs, validates policy custody and predicates, reduces mission state, and contributes immediate effects to one accumulating Story Settlement episode. The V1 path runs as diagnostic shadow state beside the existing live projection until aggregate and UI consumers are ready for cutover.

**Tech stack:** browser-compatible JavaScript modules, strict JSON contracts, existing generation router, SRE accepted-pair source frames, State Delta Gateway compare-and-swap, JSON Schema, Node assertion suites, SillyTavern fake-host/runtime tests.

## Non-Negotiable Boundaries

- The player locks the selected previous assistant response by submitting the next message; an explicit correction or rejection does not authorize that assistant contribution.
- The submitted player message is accepted evidence of the player's speech, intent, or decision, but never self-certifies success or world truth.
- The model selects only authored candidate IDs and values. It cannot invent target IDs, policies, state paths, objective state, story text, or domain records.
- Interpretation failure, timeout, ambiguity, or abstention produces no mission effect and never blocks the legacy turn path while V1 remains shadow-only.
- Immediate mission mechanics may update per accepted pair, but Story Settlement accumulates contributions and effects in one active semantic episode. It does not seal an episode for each back-and-forth.
- This slice does not append `ship.technicalDebt`, thread, relationship-memory, quest, story-event, or Command Bearing records.
- Legacy writers remain active for current player-facing behavior until the later aggregate/projection cutover passes parity and reaches the explicit UI approval gate.
- No UI renderer, layout, interaction, or player-facing copy changes are authorized by this plan.

---

### Task 1: Authored Interpretation Guidance and Candidate Packets

**Files:**
- Modify: `src/mission/v1/mission-contracts.mjs`
- Modify: `schemas/mission/mission-v1.schema.json`
- Modify: `packages/bundled/breckenridge/v1/prelude-a-ship-underway.mission-v1.json`
- Create: `src/mission/v1/interpretation-candidates.mjs`
- Modify: `tools/scripts/test-v1-mission-contracts.mjs`
- Create: `tools/scripts/test-v1-interpretation-candidates.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: validated mission definition and current mission state.
- Produces: `createMissionInterpretationCandidatePacket({ definition, state })`, containing bounded authored candidate IDs, semantic guidance, source slots, proposable values, current target state, and no player-visible hidden-objective projection.

- [x] **Step 1: Write failing strict-contract tests**

Require every evidence policy that authorizes `user` or `assistant` sources to include:

```js
interpretation: {
  evidenceStandard: 'explicit' | 'clearOutcome',
  guidance: 'Claim only when ...',
  values: [{ value: 'safe', guidance: '...' }],
  exclusions: ['A plan or attempt alone does not prove completion.']
}
```

Non-valued claims omit `values`. Valued claims list one or more unique values allowed by the target outcome. Runtime-only and adjudicator-only policies may omit interpretation guidance and are never model candidates. Reject unknown keys, blank guidance, unknown values, duplicate values, and a valued user/assistant policy with no proposable values.

- [x] **Step 2: Add guidance to every Prelude policy eligible for prose interpretation**

Define narrow positive standards and explicit exclusions. In particular:

- handover/readiness require an established result, not a greeting or plan;
- rescue response begun is distinct from rescue success;
- survivor safety and material cost require an observed outcome;
- record review is distinct from inconsistency, discrepancy, confirmed falsification, and attribution;
- a user decision requires an explicit chosen course, not a question or tentative thought;
- final readiness and arrival require depicted completion, not announced intent.

- [x] **Step 3: Write failing candidate-packet tests**

Prove that the packet:

- includes only policies with `user` or `assistant` custody;
- excludes runtime truth establishment and authoritative time;
- binds policies to `previousAssistant` and/or `currentPlayer` source slots;
- omits already-known one-way disclosures and already-occurred one-way events;
- exposes only authored candidate semantics and current target value, not objectives, closure predicates, transitions, hidden counts, or `mustNotReveal` text;
- remains bounded and stably ordered regardless of definition array order.

- [x] **Step 4: Implement the pure candidate builder**

The builder never examines prose and never decides that a claim occurred. It prepares the closed choice set for the interpreter. Candidate identity is the evidence-policy ID; target identity and allowed values come only from the validated definition.

- [x] **Step 5: Run, register, and commit Task 1**

Run:

```powershell
node tools/scripts/test-v1-mission-contracts.mjs
node tools/scripts/test-v1-interpretation-candidates.mjs
node tools/scripts/validate-ashes-v1-prelude.mjs
```

Commit:

```text
feat(mission): author interpretation candidates
```

### Task 2: Bounded Accepted-Pair Interpreter

**Files:**
- Create: `src/mission/v1/accepted-pair-interpreter.mjs`
- Create: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: exact selected assistant/player source texts, a candidate packet, mission/branch/revision envelope, and the existing `sourceSettlementLatestPair` Utility role.
- Produces: a validated `directive.missionEvidenceInterpretation.v1` with assistant acceptance and zero or more candidate selections; then a deterministic mission-evidence proposal with exact source refs.

- [x] **Step 1: Write failing prompt and parser tests**

Cover paraphrased prose, dialogue and narration, reversed clause order, negation, hypothetical plans, attempted-versus-completed action, ambiguous outcomes, explicit player decisions, correction/rejection of previous prose, unknown candidate IDs, wrong source slots, disallowed values, duplicate selections, prose around JSON, malformed JSON, timeout, and provider throw.

- [x] **Step 2: Implement a closed output contract**

The provider may return only:

```js
{
  kind: 'directive.missionEvidenceInterpretation.v1',
  assistantAcceptance: 'accepted' | 'rejected' | 'corrected' | 'ambiguous',
  claims: [{ candidateId, sourceSlot: 'previousAssistant' | 'currentPlayer', value? }],
  abstained: true | false
}
```

Unknown fields and selections are rejected. Assistant claims are discarded unless acceptance is `accepted`. Current-player claims remain independently eligible. An empty or abstained result is valid no-change.

- [x] **Step 3: Build a constrained Utility prompt**

The prompt contains the exact bounded source pair, candidate packet, source-role rules, and evidence standards. It says explicitly that plans, attempts, guesses, questions, atmosphere, transient emotion, and mere mentions are not completed events or outcomes. It requests no summary, tracker, objective state, consequence, reward, or narration.

- [x] **Step 4: Deterministically materialize the proposal**

Code—not the model—adds mission ID, branch ID, base revision, stable claim IDs, policy target/type, value, source message ID, selected swipe ID, and text hash. The model cannot supply or override any of those fields.

- [x] **Step 5: Run, register, and commit Task 2**

Commit:

```text
feat(mission): interpret accepted source pairs
```

### Task 3: Multi-Contribution Mission Custody and Episode Accumulation

**Files:**
- Modify: `src/mission/v1/evidence-contracts.mjs`
- Modify: `src/mission/v1/mission-reducer.mjs`
- Modify: `src/story/story-settlement.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `tools/scripts/test-v1-mission-evidence.mjs`
- Modify: `tools/scripts/test-v1-mission-reducer.mjs`
- Modify: `tools/scripts/test-v1-story-settlement.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`

**Interfaces:**
- Consumes: one proposal whose claims may cite the previous assistant or current player, plus both exact source contributions.
- Produces: immediate mission effects with claim-specific contribution provenance and one continuing Story Settlement episode until a deterministic hard boundary seals it.

- [x] **Step 1: Write failing multi-source custody tests**

Prove that one pair can disclose an assistant-observed outcome and record a player decision with different contribution IDs; invalidating either message removes only evidence causally supported by that contribution and reconstructs mission state from survivors.

- [x] **Step 2: Attach contribution identity during evidence validation**

Resolved accepted sources expose their stable contribution ID. Accepted claims retain that ID. The reducer writes it to the evidence log and effect source list; a caller-wide fallback is retained only for old fixture compatibility.

- [x] **Step 3: Write failing episode-consolidation tests**

Prove that:

- five meaningful accepted pairs in one continuing scene create one open episode, not five sealed entries;
- repeated sources and effects are idempotent;
- an insignificant pair records a receipt only when no semantic episode is active;
- an insignificant pair during an active episode does not close or duplicate it;
- a deterministic hard boundary seals the accumulated episode once with a summary derived only from visible authored effects;
- a mission transition always seals the active episode;
- no raw transcript text is retained.

- [x] **Step 4: Refactor the V1 spine to accumulate**

`settleAcceptedPair` accepts `sourceContributions`, adds only referenced accepted contributions, applies effects immediately, and keeps the episode open by default. It seals only when `hardBoundary` is supplied or a mission transition is committed. The deterministic capsule builder uses definition-owned player text for visible effects; hidden effects can support mechanics but cannot enter the capsule.

- [x] **Step 5: Preserve no-change and replay behavior**

A pair with no accepted claims is a no-op receipt when no episode is active. A replay with no new claims never opens, closes, or persists another episode. Compare-and-swap still protects every write.

- [x] **Step 6: Run and commit Task 3**

Commit:

```text
feat(story): accumulate accepted scene evidence
```

### Task 4: V1 Mission Asset Registry and Source-Pair Adapter

**Files:**
- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `src/runtime/package-library.mjs`
- Create: `src/runtime/v1-mission-runtime.mjs`
- Create: `tools/scripts/test-v1-mission-runtime.mjs`
- Modify: existing package-library/registry tests selected by the alpha gate
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: bundled/imported runtime assets, active campaign state, accepted-pair snapshot, generation router, and State Delta Gateway.
- Produces: exact active V1 definition resolution and `settleV1MissionAcceptedPair(...)` for shadow runtime use.

- [x] **Step 1: Write failing asset-loading tests**

Extend package refs and runtime assets with `missionDefinitionPaths`, URLs, records, and `missionDefinitionsById`. The Ashes ref loads Prelude V1. Other bundled campaigns load none. Imported archives may be indexed only when a strict `directive.missionDefinition.v1` payload has a matching package binding.

- [x] **Step 2: Implement active-definition resolution**

Resolve by exact package ID/version plus current `mission.v1.definitionId` or legacy `mission.activeMissionId` matching the definition's `packageBinding.sourceId`. Never select by package ID alone. Ambiguous, stale-version, wrong-source, or non-Ashes matches return an explicit unavailable reason.

- [x] **Step 3: Write failing adapter tests**

Cover selected-swipe custody, current-player contribution custody, correction of assistant prose, no-change abstention, stale source before apply, gateway revision conflict, provider failure, wrong package/version/mission, deduplication, and transition sealing. Assert legacy `mission`, ship, relationships, threads, quests, logs, and Command Bearing remain unchanged except for the additive `mission.v1` and `storySettlement` roots.

- [x] **Step 4: Implement the runtime adapter**

Build the candidate packet, call the bounded interpreter, resolve exact sources from the snapshot, materialize the evidence proposal, and pass it to the V1 spine. Return sanitized diagnostics and committed roots. Never expose raw prompt/response content in campaign state.

- [x] **Step 5: Run, register, and commit Task 4**

Commit:

```text
feat(runtime): settle V1 accepted pairs
```

### Task 5: Orchestrator Shadow Wiring

**Files:**
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Create: `tools/scripts/test-v1-accepted-pair-orchestrator.mjs`
- Modify: affected orchestrator/runtime tests
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: the already-created CORE ingress/source frame and the same latest-pair snapshot used by Scene Handshake.
- Produces: shadow V1 settlement before classification, with legacy live projection unchanged.

- [x] **Step 1: Write failing lifecycle tests**

Prove the call order:

```text
CORE ingress
  -> legacy Scene Handshake while still authoritative
  -> V1 shadow accepted-pair interpretation against refreshed state
  -> classification of current player message
```

The V1 call uses the selected visible swipe. It does not run for wrong chat/save, historical replay, Directive-owned/control response, unavailable definition, or already-settled source range. Timeout/provider failure reports a sanitized shadow diagnostic and permits the legacy turn to continue.

- [x] **Step 2: Add an explicit shadow-mode dependency**

The orchestrator receives `settleV1MissionAcceptedPair` and `enableV1MissionShadow`. It owns sequencing but not definition lookup or model parsing. Default remains false for isolated consumers; runtime-app enables it only when the active assets resolve an exact V1-native mission.

- [x] **Step 3: Preserve latency and authority boundaries**

Use a bounded shadow timeout no greater than the existing Scene Handshake blocking budget. Shadow failure cannot become narration or mission success. Report only counts, reason codes, definition/version IDs, and source hashes.

- [x] **Step 4: Run and commit Task 5**

Commit:

```text
feat(runtime): shadow V1 mission settlement
```

### Task 6: Edit, Delete, Swipe, and Reconstruction Wiring

**Files:**
- Modify: `src/runtime/message-reconciler.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Create: `tools/scripts/test-v1-source-mutation-runtime.mjs`
- Modify: affected message-reconciler tests
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: a host message mutation after normal CORE/REPAIR reconciliation.
- Produces: exact V1 contribution invalidation and deterministic mission reconstruction from surviving evidence.

- [x] **Step 1: Write failing mutation tests**

Cover assistant edit, assistant deletion, selected-swipe change, player edit, player deletion, unrelated message mutation, repeated invalidation, save branch isolation, and restart from persisted V1 state. Prove that no raw transcript reinterpretation occurs during reconstruction.

- [x] **Step 2: Add a post-repair V1 invalidation callback**

Wrap reconciler outcomes so V1 invalidation runs after the existing CORE/REPAIR mutation path against the latest campaign revision. Resolve contribution IDs by exact host message ID and branch. Do not guess from text or legacy settlement IDs.

- [x] **Step 3: Rebuild and persist atomically**

Use the V1 spine's evidence replay and State Delta Gateway. Invalidated episodes leave player prompt/UI projection only after a later cutover; shadow diagnostics record the reconstruction now. Unrelated or repeated mutations are no-op.

- [x] **Step 4: Run and commit Task 6**

Commit:

```text
feat(runtime): rebuild V1 state after source mutation
```

### Task 7: Shadow Certification and Next-Cutover Boundary

**Files:**
- Create: `docs/development/V1_ACCEPTED_PAIR_SHADOW_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: this plan

- [x] **Step 1: Run all focused suites**

Run the mission contracts, candidate builder, interpreter, evidence/reducer, Story Settlement, state spine, asset loader, V1 runtime adapter, orchestrator, source-mutation, Ashes scenario, projection, and package-linter suites directly.

- [x] **Step 2: Run the complete alpha gate**

Run: `npm.cmd test`

- [x] **Step 3: Challenge the shadow slice**

Document evidence and residual risk for paraphrase recall, false positives, negation, attempts versus results, source-slot custody, correction/rejection, double-model latency, stale analysis, episode accumulation, no-change volume, restart, source mutation, hidden leaks, and legacy/V1 divergence.

- [x] **Step 4: Define the next cutover prerequisites**

State precisely that player-facing cutover still requires:

- bounded soft-boundary/significance evaluation and active-episode checkpointing;
- one ship aggregate and concise people/relationship projections from accepted effects;
- Duty Report narration, delivery acknowledgement, and deduplication;
- prompt-context consumption of the V1 projection;
- an explicit cutover registry that disables legacy semantic writers only for V1-native scope;
- player-facing Mission/Campaign/People/Ship rendering changes, which trigger the UI approval gate;
- isolated live-host rehearsal before any release certification.

- [x] **Step 5: Commit Task 7**

Commit:

```text
docs(runtime): certify V1 accepted-pair shadow
```

## Completion Boundary

This plan is complete when free-form accepted chat can produce policy-bound V1 mission claims through a real shadow runtime path, multiple exchanges accumulate in one semantic episode, source mutations reconstruct state exactly, and the full repository gate remains green. It does not make V1 state player-visible, retire legacy writers, or change the UI. Those actions belong to the next aggregate/projection cutover plan and its explicit UI approval gate.
