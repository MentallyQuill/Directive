# Scalable Settlement Robustness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining transaction, hydration, host-event, and coverage weaknesses from Directive's scalable-settlement architecture without changing its semantic authority or physical JSON layout.

**Architecture:** Keep the manifest as the campaign-save commit point, treat published index summaries as repairable caches, and replay verified delta hash chains with one final state hash. Detach post-narration work at the SillyTavern shell boundary, preserve serialized state mutations inside the runtime, and certify the actual 10,000-row hot path through `runtime-app` rather than helper-only assertions.

**Tech Stack:** Node.js ESM, Web Crypto SHA-256, SillyTavern host adapters, JSON contracts, repository script tests.

## Global Constraints

- Preserve accepted-pair receipts and Story Settlement as the only semantic authority.
- Preserve SillyTavern narration/provider ownership and Directive's single `directive.campaign.v1` prompt entry.
- Preserve the new-save-only boundary; add no migration or compatibility hydration.
- Add no database, embeddings, sidecar authority index, new model role, or automatic semantic backfill.
- Exclude `debug.log` from every commit.

---

### Task 1: Make manifest commits and deletes failure-coherent

**Files:**
- Modify: `src/storage/v1-storage-repository.mjs`
- Modify: `tools/scripts/test-v1-storage-repository.mjs`

**Interfaces:**
- Consumes: `storeV1CampaignSave(adapter, save, { previousSave, makeActive })` and `deleteV1CampaignSave(adapter, saveId)`.
- Produces: manifest-authoritative existing-save commits, repairable stale summaries, and post-unpublication cleanup diagnostics.

- [ ] **Step 1: Change the existing-save index-failure test to require success after the manifest commit**

After injecting the index write failure, await `storeV1CampaignSave(...)` successfully, assert `loadV1CampaignSave()` returns the revised save, and assert that load repairs the already-published summary. Add separate assertions that a brand-new save's index failure and an active-pointer change still reject.

- [ ] **Step 2: Run the storage test and verify the existing-save expectation fails**

Run: `node tools/scripts/test-v1-storage-repository.mjs`

Expected: failure because `storeV1CampaignSave()` currently propagates the post-manifest index error.

- [ ] **Step 3: Make existing published/stable-pointer index refresh best-effort**

Capture whether `index.saves[id]` already exists and whether `makeActive` would change `index.activeSaveId` before writing the manifest. After the manifest is verified, suppress only the index error for an already-published save whose active pointer is unchanged. Continue throwing for new publication or pointer movement.

- [ ] **Step 4: Add a failing delete-order test**

Extend the memory adapter with one-shot delete failure injection. Assert an index write failure deletes no manifest/base/segment, and assert a cleanup failure after index unpublication returns the failed logical path while `listV1CampaignSaves()` no longer exposes the save.

- [ ] **Step 5: Reorder deletion and return bounded cleanup diagnostics**

Write the index without the save first. Then attempt manifest, base, and both A/B segment removals, collecting exact failed logical paths in `cleanupFailures`. Return `{ deleted, deletedActive, id, cleanupFailures }`; never include content.

- [ ] **Step 6: Run focused storage, timeline, controller, and campaign-start tests**

Run: `node tools/scripts/test-v1-storage-repository.mjs`, `node tools/scripts/test-v1-timeline-storage.mjs`, `node tools/scripts/test-v1-native-branch-runtime.mjs`, `node tools/scripts/test-campaign-start-service.mjs`, and `node tools/scripts/test-runtime-campaign-start-controller.mjs`.

- [ ] **Step 7: Commit**

Commit: `fix(storage): honor manifest commit authority`

### Task 2: Replay verified delta chains without per-delta full-state hashing

**Files:**
- Modify: `src/storage/v1-state-delta-codec.mjs`
- Modify: `src/storage/v1-storage-repository.mjs`
- Modify: `tools/scripts/test-v1-state-delta-codec.mjs`
- Modify: `tools/scripts/test-v1-storage-repository.mjs`

**Interfaces:**
- Produces: `applyV1StateDeltaChainStep({ saveId, state, delta, expectedBeforeHash }) -> { state, stateHash }`.
- Preserves: `applyV1StateDelta()` with full before/after SHA-256 verification for standalone callers.

- [ ] **Step 1: Add failing chain-step and hash-count tests**

Require a valid trusted chain step to return the delta's `afterHash`, reject a mismatched `expectedBeforeHash`, and retain strict operation/revision validation. Add codec test hooks that reset/read SHA-256 invocation count. Reset before loading a 65-delta repository and require no more than base hash + segment hashes + final manifest-head hash.

- [ ] **Step 2: Run codec and repository tests and verify the new interface/count fails**

Run: `node tools/scripts/test-v1-state-delta-codec.mjs` and `node tools/scripts/test-v1-storage-repository.mjs`.

- [ ] **Step 3: Split strict operation replay from hash verification**

Implement one internal decoder that validates exact delta fields, save ID, revision, authorized paths, operations, and resulting revision. `applyV1StateDelta()` computes and verifies both hashes. `applyV1StateDeltaChainStep()` verifies the declared before hash against the caller's trusted running hash and returns the declared after hash without hashing the whole intermediate state.

- [ ] **Step 4: Use the trusted chain only inside verified manifest hydration**

Hash the base state once, content-hash each referenced segment, replay deltas in order through `applyV1StateDeltaChainStep()`, and hash the final state once against `manifest.currentStateHash`. Preserve every existing corruption and discontinuity error.

- [ ] **Step 5: Run codec, repository, scale, branch, and projection parity tests**

Run the codec/repository tests plus `node tools/scripts/test-v1-scalability-contract.mjs`, `node tools/scripts/test-v1-branch-reconstruction.mjs`, `node tools/scripts/test-v1-composite-player-projection.mjs`, and `node tools/scripts/test-v1-prompt-projection.mjs`.

- [ ] **Step 6: Commit**

Commit: `perf(storage): verify delta chains at boundaries`

### Task 3: Detach post-narration work from the host event chain

**Files:**
- Modify: `src/hosts/sillytavern/shell-events.js`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-sillytavern-event-wiring.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`

**Interfaces:**
- Preserves: `runtimeApp.handleHostGenerationEnded(payload)` for direct/manual callers.
- Changes: the shell `handleGenerationEnded(payload)` returns an immediate scheduled result.

- [ ] **Step 1: Add a failing shell-event nonblocking test**

Install a runtime bridge whose `handleHostGenerationEnded()` waits on a held promise. Call the shell hook and assert it immediately returns `{ handled: true, scheduled: true, abortDefaultGeneration: false }` before releasing the promise; then release and assert the app received the payload.

- [ ] **Step 2: Run the event-wiring test and verify it blocks/fails**

Run: `node tools/scripts/test-sillytavern-event-wiring.mjs`.

- [ ] **Step 3: Schedule generation-ended work through the existing detached helper**

Make `handleGenerationEnded()` call `scheduleReconciliation('Post-narration Directive work failed', () => app()?.handleHostGenerationEnded?.(payload))`.

- [ ] **Step 4: Add a failing runtime metadata-isolation test**

Force `attachAssistantRuntimeMetadata()` to reject while a checkpoint is pending. Assert `handleHostGenerationEnded()` still invokes/schedules the episode review and returns a bounded duty-report/metadata failure diagnostic.

- [ ] **Step 5: Contain metadata attachment failure and continue episode scheduling**

Catch attachment failure locally, log through `host.logger.warn`, mark attachment unavailable, and always reach `scheduleEpisodeReviewFlight()`.

- [ ] **Step 6: Run event, runtime, scheduler, duty-report, and coexistence tests**

Run the event-wiring, runtime-app, episode scheduler, duty-report runtime, and Directive provider/notification tests.

- [ ] **Step 7: Commit**

Commit: `fix(host): detach post-narration analysis`

### Task 4: Replace helper-only scale claims with a real runtime hot-path check

**Files:**
- Modify: `src/runtime/accepted-pair-recovery-state.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-accepted-pair-recovery-state.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-scalability-contract.mjs`

**Interfaces:**
- Adds: `entryCount()` to the in-memory accepted-pair call-budget diagnostic API.
- Preserves: one automatic and one manual call allowance per unresolved fingerprint.

- [ ] **Step 1: Add a failing call-budget lifecycle test**

Expose `entryCount()` and require `clear(fingerprint)` to return the budget to zero retained entries. In the runtime test, require a successful accepted-pair settlement to clear its fingerprint entry while a failed pair remains retained for manual Retry.

- [ ] **Step 2: Clear successful receipt fingerprints**

After `mission.ok === true`, call `acceptedPairCallBudget.clear(fingerprint)`. Do not clear a blocked pair or a reconciliation-required failure.

- [ ] **Step 3: Add the real 10,000-row runtime scenario**

In `test-v1-runtime-app.mjs`, place 10,000 rows in the bound fake chat with a fresh assistant/player pair in the tail. Wrap `host.chat.getRecentMessages()` to record requested limits, record generation-role counts, execute `app.observeHostPlayerMessage()`, and assert: settlement succeeds; every normal read is at most `V1_ACCEPTED_PAIR_SOURCE_WINDOW`; `acceptedPairMissionEvidence` increases by exactly one; `episodeEvaluator` does not increase; and the receipt is durably present after reload.

- [ ] **Step 4: Narrow the helper scale test's claims**

Keep `test-v1-scalability-contract.mjs` responsible for 30/1,000/10,000 segmented persistence, projection parity, segment bounds, and post-narration scheduler coalescing. Rename output fields so it no longer presents direct helper calls as an end-to-end runtime measurement.

- [ ] **Step 5: Run recovery, runtime, scale, source, and event tests**

Run the recovery-state, runtime-app, scalability, accepted-pair-source, SillyTavern event-wiring, and soft-boundary tests.

- [ ] **Step 6: Commit**

Commit: `test(runtime): prove bounded hot path end to end`

### Task 5: Integrated review, verification, and publication

**Files:**
- Modify: `docs/superpowers/specs/2026-08-15-scalable-settlement-robustness-audit-design.md` only for implementation-level clarification revealed by verification.

- [ ] **Step 1: Run `git diff --check` and inspect every production diff against the design invariants**

- [ ] **Step 2: Run `npm.cmd test` and require all focused checks to pass**

- [ ] **Step 3: Confirm `git status --short` contains no staged or committed `debug.log`**

- [ ] **Step 4: Merge current GitHub `main` without overwriting concurrent work and rerun `npm.cmd test` on integrated `main`**

- [ ] **Step 5: Push `main` and verify local/GitHub SHA equality with GitHub CLI**
