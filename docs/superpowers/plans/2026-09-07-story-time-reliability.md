# Story Time Reliability Implementation Plan

> Planning snapshot, preserved 2026-09-07. Implementation work exists separately in the `codex/story-time-reliability` worktree and is not included in this documentation commit. Check that worktree before starting duplicate work. Status and installed-host observations below describe the original planning baseline.

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline; no parallel agent work is needed for this coupled path.

**Goal:** Make accepted story time advance plausibly and exactly once, with explicit evidence for substantial passage and recoverable interpretation failures.

**Architecture:** Retain campaign-owned elapsed seconds, deterministic clock arithmetic, source identity, and the existing accepted-pair interpretation call. Improve the interpretation contract and its validation before considering storage or timeline changes. Use full message sequences to distinguish numerical correctness from semantic timing quality.

**Tech Stack:** Browser JavaScript modules, Node assertion scripts, existing V1 state gateway and SillyTavern adapters.

**Spec:** Approved design and acceptance contract below, based on the timekeeping review and its subsequent sanity check in this task.

## Approved design and constraints

- The runtime owns canonical time. The model identifies enacted passage and proposes duration; it never writes an absolute clock.
- Preserve the existing single accepted-pair interpretation call. Do not add a time sidecar or routine extra provider calls.
- No fixed increment per reply, word-count timing, activity-duration table, or confidence-score gate.
- Explicit quantity conversion is deterministic where supported. Semantic enactment remains contextual; do not expand the existing verb whitelist into a natural-language parser.
- A duration quote must support the proposed duration, not merely contain temporal vocabulary. Distinguish a quoted subinterval from total elapsed passage.
- Separate explicit passage, implicit action, scene transitions, confirmed no passage, and unresolved interpretation in the model contract.
- Opening text establishes a baseline; only subsequent enacted player passage contributes at that first boundary.
- Rejected events do not consume time merely because the assistant narrated them. Preserve independently accepted speech and actions.
- Overlapping actions and repeated descriptions of the same event must not be charged twice.
- Unresolved interpretation must not become a completed zero-time boundary. Resolve through the existing settlement recovery path before later settlement depends on it; do not silently revisit historical zeros or catch up later.
- Genuine history edits, branch changes, and checkpoint restoration may rewind time. Ordinary continuation and duplicate delivery may not.
- Preserve existing saves and unrelated dirty work. The installed extension has objective-progress changes absent from this checkout; installation must preserve that work.
- No live-host installation, restart, or save repair is part of the initial implementation milestone.

## Milestone 1: Executable evidence and contract

**Files:**
- Create `tools/scripts/test-v1-time-reliability.mjs`.
- Create `tools/fixtures/v1-time-reliability-cases.mjs`.
- Read `src/mission/v1/accepted-pair-interpreter.mjs`, `src/runtime/v1-accepted-pair-time.mjs`, and `src/time/time-evidence.mjs`.

**Interfaces:** Reuse `parseMissionAcceptedPairInterpretationOutput`, `prepareV1AcceptedPairTimeAdvance`, and the existing runtime test fixtures. Each sequence fixture contains source messages, opening/acceptance context, proposed interpretation, and an expected temporal relationship or exact duration. An implicit dialogue fixture does not demand one arbitrary exact number.

- [ ] Create an isolated checkout for implementation after reading the worktree skill; preserve the current dirty main checkout.
- [ ] Encode the reproduced failures as regression cases: ten minutes accepted as 3,600 seconds; unsupported 31-day advance; opening meditation and past-tense enacted wait reduced to zero; rejected eight-hour sleep retained; unresolved timing deduplicated as completed.
- [ ] Add positive controls for ten minutes = 600 seconds, half an hour = 1,800 seconds, 1.5 hours = 5,400 seconds, OOC with no enacted time, and valid opening player passage.
- [ ] Add paired controls for a scheduled wait, refused wait, retrospective duration, interrupted wait, and a completed wait. Validate the distinction rather than matching a verb.
- [ ] Add sequences for player action followed by assistant recap, concurrent work, a correction that preserves dialogue, and an explicit scene transition across midnight.
- [ ] Run `node tools/scripts/test-v1-time-reliability.mjs` and retain the observed failures before editing production code.

Acceptance examples to encode using the existing parser/preparation APIs:

```js
assert.equal(parseTenMinutesAsOneHour.ok, false);
assert.equal(parseUnsupportedLongAdvance.ok, false);
assert.equal(openingMeditation.patch.timeLedger.elapsedSeconds, 600);
assert.equal(rejectedSleepIncludesEightHours, false);
assert.equal(unresolvedWasCommittedAsZero, false);
```

## Milestone 2: Interpretation and validation

**Files:**
- Modify `src/mission/v1/accepted-pair-interpreter.mjs`.
- Modify `src/time/time-evidence.mjs`.
- Modify `src/runtime/v1-accepted-pair-time.mjs`.
- Modify `tools/scripts/test-v1-accepted-pair-interpreter.mjs` and `tools/scripts/test-v1-accepted-pair-time.mjs`.

**Interfaces:** The provider contract distinguishes explicit duration, implicit action, scene transition, no passage, and unresolved timing. It carries source-bound evidence for positive passage. Normalize accepted results to the existing whole-second custody input; keep persisted clock and ledger formats compatible.

- [ ] Update schema, prompt, parser, and fixtures together; require a coherent basis for the decision and evidence identifying the contributing source passage.
- [ ] Implement exact quantity conversion for unambiguous supported durations. Reject mismatched conversion; do not require total scene time to equal one quoted subinterval when additional sequential action is supported.
- [ ] Require substantial passage to be explained by enacted duration or transition evidence. Treat contradictory proposals as invalid, never silently clamp them to an arbitrary maximum.
- [ ] Replace the opening verb gate with source-scope validation of the structured interpretation; preserve the baseline exclusion.
- [ ] Reject time attributed solely to a rejected event while allowing supported surviving action. Test corrected and ambiguous acceptance separately.
- [ ] Keep ordinary implicit duration contextual. Teach and test sequential versus overlapping passage, and prevent charging an already-counted player action again when narration recaps it.
- [ ] Run the new regression suite plus both existing focused suites and verify each original failure is addressed without losing its negative controls.

## Milestone 3: Recovery and timeline sequences

**Files:**
- Modify `src/runtime/v1-mission-runtime.mjs` and `src/runtime/runtime-app.mjs` only where recovery wiring requires it.
- Test `tools/scripts/test-v1-runtime-app.mjs`, `tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`, and `tools/scripts/test-v1-native-branch-runtime.mjs`.

**Interfaces:** Unresolved timing returns an unavailable settlement result through existing recovery. It produces no durable accepted-pair receipt, no time decision, and no partial mission/time commitment. Retry must be allowed to obtain a fresh interpretation instead of reusing an unresolved cached result.

- [ ] Write a failed-interpretation then successful-retry sequence; assert the first attempt commits nothing and the second commits time once.
- [ ] Test persistence retry separately: reuse the already validated interpretation and never advance twice.
- [ ] Test reload with a pending settlement, repeated host delivery, edit, delete, swipe, and branch restoration.
- [ ] Assert ordinary continuation has nondecreasing total elapsed seconds. Assert intentional reconstruction yields the target timeline, rather than forbidding all decreases.
- [ ] Inspect whether source invalidation exposes an intermediate clock in the host sequence. Change presentation/reconciliation only if this is reproduced; do not redesign timeline transactions solely from the earlier code-level risk.

## Milestone 4: Verification and integration report

**Files:**
- Modify `tools/scripts/run-alpha-gate.mjs` to include the new suite.
- Update `docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md` for the final interpretation/recovery contract.

- [ ] Run the focused sequence tests, projection tests, and generated-time hygiene tests.
- [ ] Run `npm.cmd test` and `git diff --check` after the final implementation.
- [ ] Review the final diff for save compatibility, accidental model-call growth, unsupported coercion, and unrelated changes.
- [ ] Report deterministic proof separately from model quality. A scripted model response demonstrates runtime handling, not realistic live estimates.
- [ ] Prepare a bounded disposable-host evaluation using the same sequence matrix, measuring missed passage, unsupported jumps, double counting, and recovery frequency.
- [ ] Before any later installation, compare the final source with the installed artifact and reconcile concurrent objective-progress work. Do not overwrite the installed extension from this checkout wholesale.

## Current status

Planning and source baseline inspection are complete. Production code is unchanged. Regression implementation, full verification, and disposable-host evaluation remain to be executed.
