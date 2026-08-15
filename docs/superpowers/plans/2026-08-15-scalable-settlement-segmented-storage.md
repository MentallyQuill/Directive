# Scalable Settlement and Segmented Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make normal accepted-pair settlement and campaign persistence scale independently of transcript length while retaining bounded episode evaluation and every V1 player-facing projection.

**Architecture:** Preserve the logical `directive.campaignSave.v1` and V1 state contracts while replacing physical monolithic saves with a base, validated deterministic deltas, and bounded A/B JSON segments. Split accepted-pair settlement from deterministic reconciliation and post-narration episode maintenance; use existing receipts for pair idempotency and a durable checkpoint-attempt record for evaluator idempotency.

**Tech Stack:** JavaScript ESM, Node.js assertion scripts, SillyTavern logical JSON storage, Web Crypto SHA-256, existing Directive V1 reducers and projection contracts.

## Global Constraints

- No general migration, compatibility hydration, automatic historical backfill, database, embeddings, retrieval model, or new semantic authority.
- Normal Continue must never request the complete transcript.
- A new accepted pair may call `acceptedPairMissionEvidence` at most once; a receipt hit calls it zero times.
- Historical reconciliation and retained branch reconstruction call no models.
- Episode evaluation remains and makes at most one automatic call per checkpoint outside replay and outside the blocking narration path.
- Mission, People, Ship, Command Bearing, time, prompt, notification, branch, swipe, edit, delete, and checkpoint player contracts remain intact.
- Existing `debug.log` modifications are unrelated and must remain unstaged.

---

### Task 1: Deterministic state-delta codec

**Files:**
- Create: `src/storage/v1-state-delta-codec.mjs`
- Create: `tools/scripts/test-v1-state-delta-codec.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `canonicalJson(value)`, `sha256Json(value)`, `encodeV1StateDelta({ saveId, before, after, changedRoots, createdAt, source })`, and `applyV1StateDelta({ saveId, state, delta })`.
- Delta operations are strict `{ op: 'set'|'delete'|'splice', path: Array<string|number>, ... }` records and include before/after revision and SHA-256 hashes.

- [ ] **Step 1: Write a failing codec test** covering nested object replacement, array append, array element mutation, deletion, exact round-trip equality, and stable canonical hashing across object key order. The production change it catches is emitting a whole-root replacement or applying a delta to the wrong state.
- [ ] **Step 2: Run `node tools/scripts/test-v1-state-delta-codec.mjs`** and confirm failure because the module does not exist.
- [ ] **Step 3: Implement canonical JSON, Web Crypto SHA-256, minimal recursive diffing, strict path validation, and delta application.** Reject prototype keys, unsupported operations, save mismatches, revision gaps, before-hash mismatches, and after-hash mismatches.
- [ ] **Step 4: Run the codec test** and confirm it passes.
- [ ] **Step 5: Add one malformed-operation case**, run it red, then add the minimal rejection and return green.
- [ ] **Step 6: Register the test in `run-alpha-gate.mjs` and commit** with `feat(storage): add validated state deltas`.

### Task 2: Segmented campaign-save repository

**Files:**
- Create: `src/storage/v1-segmented-save-contracts.mjs`
- Modify: `src/storage/v1-storage-repository.mjs`
- Modify: `src/storage/README.md`
- Modify: `tools/scripts/test-v1-storage-repository.mjs`

**Interfaces:**
- Produces manifest, base, and segment validators plus logical paths for base and A/B segment slots.
- `storeV1CampaignSave(adapter, save, options)` continues returning a logical `directive.campaignSave.v1`; `options.previousSave` supplies the exact prior logical save when available.
- `loadV1CampaignSave()` hydrates and validates the same logical save shape expected by all existing consumers.

- [ ] **Step 1: Add a failing repository test** asserting that a new save writes a manifest and base rather than embedding `state` at `V1_STORAGE_PATHS.save(id)`, while load returns the exact original logical save.
- [ ] **Step 2: Run `node tools/scripts/test-v1-storage-repository.mjs`** and confirm the old monolithic record violates the expectation.
- [ ] **Step 3: Implement manifest/base contracts and first-save storage**, using SHA-256 state hashes and explicit layout rejection for old monolithic records.
- [ ] **Step 4: Run the repository test** and confirm the first-save round trip passes.
- [ ] **Step 5: Add one failing update test** asserting a second state revision creates a delta segment, keeps the manifest state-free, and hydrates exact state.
- [ ] **Step 6: Implement delta persistence with 64-delta/512-KiB rollover and A/B current-segment generations.** Write and re-read the inactive slot before switching the manifest.
- [ ] **Step 7: Add failure-injection tests one at a time** for segment-write failure, verification mismatch, manifest-write failure, hash corruption, and revision discontinuity; implement the minimal recovery/rejection for each red test.
- [ ] **Step 8: Update delete and verify behavior** so manifests, bases, and referenced segment slots are verified; cleanup deletes only save-owned mutable files and leaves shared immutable content recoverable.
- [ ] **Step 9: Update storage documentation, run repository plus campaign-start/timeline tests, and commit** with `feat(storage): segment campaign saves`.

### Task 3: Pass prior state through campaign persistence

**Files:**
- Modify: `src/campaign/campaign-start-service.mjs`
- Modify: `src/runtime/campaign-start-controller.mjs`
- Modify: `tools/scripts/test-campaign-start-service.mjs`
- Modify: `tools/scripts/test-runtime-campaign-start-controller.mjs`

**Interfaces:**
- Consumes: `storeV1CampaignSave(..., { previousSave })` from Task 2.
- Produces: normal runtime persistence that computes one delta from already-loaded state without rehydrating the complete segment chain on every turn.

- [ ] **Step 1: Add a failing service test** whose storage read counter proves an update uses the already-loaded previous save and does not reload segment history inside `storeV1CampaignSave`.
- [ ] **Step 2: Run the focused campaign-start test** and confirm the extra read fails the assertion.
- [ ] **Step 3: Thread `previousSave` from controller/service state into repository updates**, retaining compare-and-swap revision/hash checks.
- [ ] **Step 4: Run the two focused controller/service tests** and confirm green.
- [ ] **Step 5: Commit** with `perf(storage): persist from loaded save state`.

### Task 4: Bounded accepted-pair source resolution

**Files:**
- Modify: `src/runtime/v1-accepted-pair-source.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs` or the actual bounded chat-adapter module found by the failing integration test
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-source.mjs`

**Interfaces:**
- Produces: exact source snapshot creation from `currentPlayerMessage`, `previousAssistantMessage`, and `promptingPlayerHostMessageId`, with a fixed bounded fallback window.
- Normal `observeHostPlayerMessage()` does not use `Number.MAX_SAFE_INTEGER`.

- [ ] **Step 1: Replace the current full-read assertion with a failing 10,000-message behavior test** asserting the normal settlement requests only a fixed bounded window and still identifies the exact assistant/player pair.
- [ ] **Step 2: Run `node tools/scripts/test-v1-runtime-app.mjs`** and confirm failure because normal settlement requests the complete chat.
- [ ] **Step 3: Add explicit bounded source inputs to `prepareV1AcceptedPairSnapshot()` and the host adapter**, attaching/reusing prompting-player metadata rather than searching history.
- [ ] **Step 4: Change normal player observation and exact-pair retry to use bounded inputs.** Missing anchors must return a stable source-resolution failure and must not widen the read.
- [ ] **Step 5: Run accepted-pair-source and runtime-app tests** and confirm green.
- [ ] **Step 6: Add one red/green test each** for intervening system messages, missing anchor metadata, stale chat switch, selected swipe, and an exact duplicate receipt.
- [ ] **Step 7: Commit** with `perf(runtime): bound accepted-pair reads`.

### Task 5: Explicit recovery state and model-call circuit breaker

**Files:**
- Create: `src/runtime/accepted-pair-recovery-state.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-branch-reconstruction.mjs`

**Interfaces:**
- Produces one discriminated recovery record: `none`, `pair-retry`, or `reconcile-required`.
- Produces a per-pair call-budget guard keyed by accepted-pair fingerprint.

- [ ] **Step 1: Add a failing provider-abort test** asserting one failed pair does not call the interpreter for earlier settled pairs on intercept or Retry.
- [ ] **Step 2: Run the runtime test** and confirm the current `acceptedPairReplayNeeded` path issues historical settlement work.
- [ ] **Step 3: Implement the recovery-state contract and replace the two mutable recovery booleans.** Provider failures retain one exact pair; deterministic source mutations request reconciliation; persistence retry retains the cached interpretation path.
- [ ] **Step 4: Add the call-budget guard before provider invocation** and fail closed on a second automatic interpretation for the same fingerprint.
- [ ] **Step 5: Run runtime and branch tests** and confirm provider abort, manual retry, missing old source, and retained branch history remain correct with zero historical calls.
- [ ] **Step 6: Add a 10,000-message deterministic reconciliation test** proving local scan may be linear but model calls remain zero and the scan yields in bounded batches.
- [ ] **Step 7: Commit** with `fix(runtime): isolate accepted-pair recovery`.

### Task 6: Single-flight post-narration episode review

**Files:**
- Modify: `src/story/working-capsule.mjs`
- Modify: `src/story/story-settlement-contracts.mjs`
- Modify: `src/story/story-settlement.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/hosts/sillytavern/runtime-bridge.mjs`
- Modify: `tools/scripts/test-v1-soft-boundary-runtime.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-sillytavern-event-wiring.mjs`

**Interfaces:**
- Produces a durable checkpoint attempt record containing token, status, automatic-attempt count, reason code, and committed revision.
- Produces `schedulePendingEpisodeReview()` and `retryPendingEpisodeReview()` with one in-flight Promise per checkpoint token.

- [ ] **Step 1: Add a failing replay regression** asserting 1,000 already-settled pairs with one pending checkpoint make zero evaluator calls during replay.
- [ ] **Step 2: Run the runtime test** and confirm the evaluator is called from `settleSnapshot()`.
- [ ] **Step 3: Remove evaluation from pair settlement and add the durable attempt contract**, preserving existing working-capsule validation and stale-token checks.
- [ ] **Step 4: Add a failing generation-ended event test** asserting the scheduler starts exactly one evaluation after narration and coalesces duplicate events.
- [ ] **Step 5: Implement the single-flight scheduler and event wiring.** Mark the attempt durably before calling the provider; apply a result only through existing validated `applyEpisodeReview()`.
- [ ] **Step 6: Add red/green cases one at a time** for timeout, abort, chat switch, stale checkpoint, persistence failure, manual retry, later-checkpoint coalescing, and hard-boundary deterministic sealing.
- [ ] **Step 7: Verify Mission projection remains byte-equivalent while People relationships/moments and working-story prompt update after successful review.**
- [ ] **Step 8: Commit** with `fix(story): bound episode review scheduling`.

### Task 7: Scale, parity, and full-gate certification

**Files:**
- Create: `tools/scripts/test-v1-scalability-contract.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Modify: `docs/superpowers/specs/2026-08-15-scalable-settlement-segmented-storage-design.md` only if verification reveals an implementation-level clarification

**Interfaces:**
- Consumes all prior task contracts.
- Produces executable 30/1,000/10,000-message scalability and projection-parity certification.

- [ ] **Step 1: Add a failing scale test** comparing normal source-read count, Utility calls, evaluator calls, segment sizes, and logical projections across 30, 1,000, and 10,000 messages.
- [ ] **Step 2: Run the scale test** and confirm any remaining unbounded behavior fails with a behavior-specific assertion.
- [ ] **Step 3: Make only the minimal production corrections needed** for constant normal call counts, bounded active segment size, exact hydrated state, and projection parity.
- [ ] **Step 4: Run focused storage, runtime, episode, branch, campaign-start, event-wiring, player-projection, People, Ship, and prompt tests.**
- [ ] **Step 5: Run `npm.cmd test`** and require the complete gate to pass with pristine output.
- [ ] **Step 6: Inspect `git diff --check`, `git status --short`, and the staged diff** to ensure `debug.log` and unrelated work are excluded.
- [ ] **Step 7: Commit certification changes** with `test(runtime): certify scalable settlement`.
- [ ] **Step 8: Follow verification-before-completion, request code review, merge the isolated branch into local `main`, run the full gate on merged `main`, push `origin main`, and verify local/remote SHA equality.**

