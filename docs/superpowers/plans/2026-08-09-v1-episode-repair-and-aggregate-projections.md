# V1 Episode Repair and Aggregate Projections Implementation Plan

> **Execution rule:** implement task by task with red-green-refactor discipline. Do not change player-facing UI or install V1 prompt authority in this plan.

**Goal:** Make accumulated Story Settlement episodes durable under semantic boundaries and source mutation, then expose one concise, rebuildable V1 projection for mission, story, ship, and people without recreating per-mention trackers.

**Architecture:** Accepted mission evidence continues to update mechanics immediately while one active episode accumulates meaning. Deterministic code owns hard-boundary custody, checkpoint identity, invalidation, replacement ordering, and projection materialization. A sealed episode whose source changes is excluded immediately and, when surviving accepted evidence is sufficient, replaced by a new immutable episode that explicitly supersedes it. Pure projectors read authoritative mission state, current structured campaign aggregates, valid sealed episodes, and package data; they never call a model, persist a second truth, expose hidden state, or copy legacy `ship.technicalDebt` rows.

**Tech stack:** browser-compatible JavaScript modules, existing V1 mission/state spine, Story Settlement contracts, State Delta Gateway compare-and-swap, Node assertion suites, bundled Ashes Prelude fixtures.

## Non-Negotiable Boundaries

- A message count, token count, topic change, speaker change, emotional beat, room movement, or ordinary time advance cannot seal an episode.
- Long scenes receive rolling checkpoints only. A checkpoint is not a story entry and does not imply significance.
- Hard boundaries use a closed, validated code set and trusted runtime provenance. Arbitrary caller prose cannot authorize sealing.
- Soft-boundary interpretation remains a later bounded evaluator using an active-episode capsule; this slice does not add another model call or pretend keyword rules can recognize every style of play.
- Mission transitions remain deterministic hard boundaries.
- Invalidated or recovery-required episodes are immediately excluded from every projection.
- A replacement episode may contain only surviving accepted contributions and effects. It must cite the stale episode it supersedes; it may not reuse a stale summary.
- Focus is cleared conservatively when its source episode is invalidated. Redirect requires a later proof that the same unresolved consequence survived.
- Ship is one operational aggregate. Legacy `technicalDebt` remains archived/diagnostic-only and is never copied into V1 output.
- People may expose authored identity, current player-known posture, and rare episode annotations only. Presence alone cannot create a moment.
- Projection is pure, deterministic, source-backed, and ephemeral. It does not mutate or persist gameplay state.
- This plan produces prompt-ready data but does not connect it to live prompt composition. Legacy player-facing authority remains in place.
- No UI renderer, route, layout, interaction, or player-facing copy changes are authorized by this plan.

---

### Task 1: Boundary and Checkpoint Contracts

**Files:**
- Create: `src/story/episode-boundary.mjs`
- Modify: `src/story/story-settlement-contracts.mjs`
- Modify: `src/story/story-settlement.mjs`
- Modify: `schemas/story/story-settlement.schema.json`
- Create: `tools/scripts/test-v1-episode-boundary.mjs`
- Modify: `tools/scripts/test-v1-story-settlement-contracts.mjs`
- Modify: `tools/scripts/test-v1-story-settlement.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: a trusted boundary signal or deterministic checkpoint threshold plus current episode custody.
- Produces: a validated hard-boundary record or a compact rolling checkpoint; neither contains transcript prose.

- [x] **Step 1: Write failing closed-boundary tests**

Define allowed hard-boundary codes:

```text
mission-transition
authored-scene-closure
save-branch-change
major-time-jump
meaningful-location-transition
world-settlement
source-recovery
```

Require stable boundary ID, code, trusted source kind/ID, and cited accepted contribution IDs where applicable. Reject unknown codes, free-form reason authority, wrong branch, unknown contributions, and untrusted sources. Prove ordinary time advancement and room movement do not become hard boundaries.

- [x] **Step 2: Write failing checkpoint tests**

An open episode keeps `boundaryState` with the last reviewed episode revision, contribution/effect counts, checkpoint sequence, and decision `continue`. At a configurable safety count, `checkpointStoryEpisode(...)` advances only checkpoint metadata. It does not seal, create a receipt, duplicate an episode, store raw text, or call a provider.

- [x] **Step 3: Implement backward-compatible contracts**

New episodes receive boundary state. Existing schema-version-1 episodes without it remain readable and are normalized when next mutated. Validate supplied boundary state strictly without requiring a destructive save migration.

- [x] **Step 4: Run, register, and commit Task 1**

Commit:

```text
feat(story): formalize episode boundaries
```

### Task 2: Trusted Boundary Propagation and Checkpointing

**Files:**
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/chat-turn-orchestrator.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`
- Modify: `tools/scripts/test-v1-mission-runtime.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-orchestrator.mjs`

**Interfaces:**
- Consumes: validated `directive.episodeHardBoundary.v1` signals and accepted-pair settlement results.
- Produces: an accumulated open episode, checkpointed open episode, or one sealed episode at a proven boundary.

- [x] **Step 1: Write failing propagation tests**

Prove the orchestrator/runtime passes a validated boundary unchanged, mission transition constructs its own deterministic boundary, stale or malformed boundaries fail closed, and generic legacy time-boundary records are ignored. A boundary with no significant active episode is a no-op rather than an empty story entry.

- [x] **Step 2: Add deterministic checkpoint scheduling**

Checkpoint after a bounded number of new accepted contributions/effects since the last review. Replays and no-change pairs do not advance it. Checkpoint creation remains within the same State Delta Gateway transaction.

- [x] **Step 3: Preserve transition and concurrency guarantees**

Sealing uses the active episode revision and accepted sources captured by the transaction. A newer contribution or source mutation rejects a stale apply. The deterministic summary continues to use only visible authored effects.

- [x] **Step 4: Run and commit Task 2**

Commit:

```text
feat(runtime): enforce semantic episode boundaries
```

### Task 3: Sealed Episode Supersession

**Files:**
- Modify: `src/story/story-settlement-contracts.mjs`
- Modify: `src/story/story-settlement.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `tools/scripts/test-v1-story-settlement-contracts.mjs`
- Modify: `tools/scripts/test-v1-story-settlement.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`
- Modify: `tools/scripts/test-v1-source-mutation-runtime.mjs`

**Interfaces:**
- Consumes: one atomic set of invalid contribution IDs plus surviving accepted evidence and authored visible effect text.
- Produces: invalidated audit history and, when meaningful effects survive, one current sealed replacement with `supersedesEpisodeIds`.

- [x] **Step 1: Write failing partial-invalidation tests**

Seal an episode containing several accepted pairs, then edit/delete/swipe one source. Assert:

- the old episode becomes `invalidated` and is never current authority;
- dependent effects disappear while independent effects survive;
- a meaningful survivor set creates exactly one sealed replacement;
- the replacement has fresh stable identity, only surviving contributions/effects, a recomputed visible summary, a `source-recovery` boundary, and `supersedesEpisodeIds: [oldId]`; the stale episode retains its original boundary for audit;
- repeated invalidation is idempotent;
- invalidating every meaningful effect creates no replacement;
- multiple invalidated contributions in one host mutation create one replacement, not a supersession chain;
- restart/JSON round-trip and later restoration produce deterministic results without resurrecting stale identity.

- [x] **Step 2: Implement atomic batch invalidation**

Replace sequential sealed-source invalidation in the V1 spine with one batch operation. Active episodes still remove invalid dependencies in place. Sealed episodes are immutable except for terminal invalidation metadata; replacement construction is isolated and validated before commit.

- [x] **Step 3: Enforce projection-current identity**

Validate supersession references, forbid cycles/self-reference, and define a pure current-episode selector that excludes invalidated/recovery-required/stale records and any sealed record superseded by another current sealed record.

- [x] **Step 4: Keep Focus conservative**

Clear Focus whenever its episode becomes stale. Do not redirect until unresolved consequences have explicit source custody and identity-equivalence proof.

- [x] **Step 5: Run and commit Task 3**

Commit:

```text
feat(story): supersede stale sealed episodes
```

### Task 4: Pure Story and Prompt-Ready Projections

**Files:**
- Create: `src/projection/v1/story-projection.mjs`
- Create: `src/projection/v1/prompt-projection.mjs`
- Create: `tools/scripts/test-v1-story-projection.mjs`
- Create: `tools/scripts/test-v1-prompt-projection.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: validated Story Settlement plus current mission/player-safe knowledge context.
- Produces: concise current story entries and a bounded prompt-ready context packet.

- [x] **Step 1: Write failing current-story tests**

Project sealed current episodes only, in stable chronology. Omit active, insignificant, invalidated, recovery-required, and superseded history. Each entry contains one concise summary, visible lasting changes, visible unresolved consequences, and internal episode/effect source refs. It contains no transcript, hashes, hidden effects, provider diagnostics, or per-contribution rows.

- [x] **Step 2: Write failing prompt selection tests**

Select deterministically by active mission/root references, valid Focus, participants, location, unresolved consequence, and recency. Cap entries and text budget. A stale Focus is omitted. Retrieval never calls a model or vector store and never changes state.

- [x] **Step 3: Implement pure projectors**

Use one current-episode selector shared with source repair. Keep source refs in internal metadata while exposing only player-safe fields to normal consumers.

- [x] **Step 4: Run and commit Task 4**

Commit:

```text
feat(projection): derive current V1 story context
```

### Task 5: One Ship Operational Aggregate

**Files:**
- Create: `src/projection/v1/ship-projection.mjs`
- Create: `tools/scripts/test-v1-ship-projection.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: current structured ship state, Ashes package baseline, V1 mission player projection, and valid source-backed ship effects when present.
- Produces: one `directive.shipPlayerProjection.v1` operational aggregate.

- [x] **Step 1: Write failing anti-spam tests**

Using the Breckenridge fixture from the reported UI failure, prove that plating smell, corridor flicker, a calibration remark, and repeated refit-language create zero issue rows. The output has one condition summary. Confirmed damage and explicit restrictions remain structured. The legacy `technicalDebt` array is absent even when populated with many rows.

- [x] **Step 2: Define deterministic baseline precedence**

Build from ship identity, the top-level package/save condition, confirmed damage, explicit active restrictions, and current campaign-owned readiness fields. Valid episode effects may revise the aggregate only through authored stable target IDs; wording similarity cannot create identity.

- [x] **Step 3: Attach current mission relevance**

Expose at most one current readiness objective/link from the spoiler-safe mission projection. Do not duplicate all objectives, story summaries, or mission progress on Ship.

- [x] **Step 4: Implement, run, and commit Task 5**

Commit:

```text
feat(projection): consolidate ship status
```

### Task 6: People Projection Without Conversation Memory Spam

**Files:**
- Create: `src/projection/v1/people-projection.mjs`
- Create: `tools/scripts/test-v1-people-projection.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: crew dataset identity, player-known current posture, valid sealed character-moment annotations, and active mission relevance.
- Produces: concise crew cards/details with rare source-backed moments.

- [ ] **Step 1: Write failing absence-is-valid tests**

Routine dialogue with every officer present produces no character moments. An officer may appear with identity and current role while `moments` is empty. Hidden relationship numbers, private interpretation, generic memories, and evidence queues never project.

- [ ] **Step 2: Define strict moment consumption**

Only a validated player-visible annotation on a current sealed episode may appear. Cap one annotation per affected recurring character per episode, dedupe by stable identity, and order by episode chronology. This task consumes annotations but does not yet authorize their model extraction.

- [ ] **Step 3: Add mission relevance without duplication**

Expose a stable current-mission link for relevant officers, not copies of mission objectives or story entries.

- [ ] **Step 4: Implement, run, and commit Task 6**

Commit:

```text
feat(projection): derive concise people views
```

### Task 7: Composite Shadow Projection and Readiness Evidence

**Files:**
- Create: `src/projection/v1/player-projection.mjs`
- Create: `tools/scripts/test-v1-composite-player-projection.mjs`
- Create: `tools/scripts/test-v1-projection-rebuild.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Create: `docs/development/V1_EPISODE_REPAIR_AND_PROJECTION_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`

**Interfaces:**
- Consumes: exact active V1 definition/runtime assets and committed campaign state.
- Produces: an on-demand diagnostic shadow projection containing mission, story, ship, and people; no live UI/prompt consumer is changed.

- [ ] **Step 1: Write failing composite and rebuild tests**

Prove deterministic JSON equality across repeated reads and restart, no state mutation, branch/package/definition isolation, spoiler safety, source-mutation removal, sealed replacement inclusion, no `technicalDebt`, no hidden facts, and no duplicate semantic presentation across sections.

- [ ] **Step 2: Expose a read-only runtime method**

`buildV1PlayerProjection(...)` resolves the exact active definition and returns unavailable outside Ashes Prelude V1. Runtime-app may expose it to diagnostics/tests only. Do not write it into campaign state or connect it to UI/prompt builders.

- [ ] **Step 3: Run focused and full gates**

Run all new suites, affected runtime/source-mutation suites, package/schema validators, and `node tools/scripts/run-alpha-gate.mjs`. Record exact counts and elapsed time.

- [ ] **Step 4: Document residual cutover risks**

Explicitly retain as later work: soft-boundary evaluator and active working capsule, character-moment extraction, Duty Report delivery, prompt-authority installation, mission transitions into a V1-native next mission, remaining Ashes migration, legacy writer retirement, parity/live soak, and the player-facing UI approval gate.

- [ ] **Step 5: Commit Task 7**

Commit:

```text
docs(runtime): certify V1 episode projections
```

## Completion Boundary

This plan is complete when sealed story history repairs safely after source mutation and a concise composite V1 projection can be rebuilt on demand from authoritative state. It does **not** authorize claiming V1 cutover or architecture completion. Prompt installation, renderer changes, legacy writer retirement, the rest of Ashes, isolated live-host rehearsal, and the approval-gated UI work remain separate gates.
