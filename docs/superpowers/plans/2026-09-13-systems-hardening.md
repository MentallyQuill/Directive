# Recent Systems Hardening Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development; implement and review each owned task, then review the whole branch.

**Goal:** Resolve the September 13 review findings and publish verified fixes to main.

**Architecture:** Preserve accepted-pair authority and the atomic state gateway. Reuse settled continuity independently of direction refresh, order mutations by their validated occurrence, and bind cancellation/recovery to their owning operation. Preserve existing save compatibility and strict evidence validation.

**Tech Stack:** JavaScript ESM, Node assert regression scripts, Playwright, SillyTavern adapters.

**Spec:** `F:/git/Directive/artifacts/reviews/2026-09-13/systems-review.md` (approved review with reproduction scripts).

## Global Constraints

- User authorizes implementation and pushing main after completion; no routine approval loop.
- Work only in `F:/git/Directive/.worktrees/systems-hardening`; preserve dirty main and all other worktrees.
- No installation, configuration change, restart, or player-save mutation on a live host.
- Generated evidence never acquires authored mission authority. Retain exact source custody and strict rejection.
- One regression red/green cycle per behavior. Register new test scripts in the gate during integration.
- Workers own disjoint production files, do not revert one another, and do not commit/push. Main owns integration, gate registration, final review, and publication.
- Treat real-provider evaluation separately from deterministic assertions; record unmeasured external results rather than fabricate proof.

## Task 1: Settled continuity reuse and bounded validation feedback

**Files:** `src/runtime/v1-mission-runtime.mjs`, `src/runtime/parallel-turn-analysis.mjs`, `src/mission/v1/accepted-pair-interpreter.mjs`; relevant director runtime/coordinator/interpreter tests.

**Interfaces:** Continue returning the same directed settlement result. Pass optional bounded `validationErrors` through coordinator task invocation and interpreter input; diagnostics are never story evidence.

- [x] Convert `story-lifecycle-replay-probes.mjs` settled-pair scenario to an actual regression in the director runtime suite. Vary localRef on a second valid response. Require:

```js
assert.equal(swipe.continuityEvents.length, normal.continuityEvents.length);
assert.equal(continuityCalls, 1);
```

- [x] Run `node tools/scripts/test-story-director-mission-runtime.mjs` and verify the new assertion fails before editing production code.
- [x] For a settled pair, refresh direction without re-extracting committed continuity; maintain legacy settled-pair behavior explicitly. Extend regression through provider settings refresh, repeated swipe, and rejected assistant evidence.
- [x] Run the director runtime suite plus continuity lineage and branch reconstruction suites.
- [x] Add one coordinator/interpreter rejection recovery case where first exact-quote validation fails and second request sees the diagnostic while sourcePair/candidates remain unchanged.

```js
assert.ok(secondInput.validationErrors.length > 0);
assert.deepEqual(secondInput.sourcePair, firstInput.sourcePair);
```

- [x] Observe red; implement bounded string-only feedback (at most eight errors, 240 characters each) across both coordinator and interpreter. Never grant new candidates or loosen quoting.
- [x] Run coordinator, interpreter, time reliability, and director runtime checks; record red/green evidence and self-review.

## Task 2: Causal thread and acquisition ordering

**Files:** `src/story/continuity-events.mjs`, `src/story/continuity-contracts.mjs`, `src/story/character-information.mjs`; information/status/source-lineage tests and related documentation.

**Interfaces:** Existing continuity events stay readable. Preserve source/delivery custody, deterministic event identity, replay and branch pruning. Any acquisition locator must be validated against existing exact evidence, not invented timestamps.

- [x] Convert the status probe into a regression: assistant resolves, player reopens; require `projectContinuityThreads(events)[0].status === 'active'` using the actual projection API.
- [x] Run the new assertion and verify red. Replace lexical status precedence with validated occurrence chronology while preserving creation dependencies; test same-message reversals and ambiguous occurrences.
- [x] Run continuity events, retrieval and lineage suites.
- [x] Convert `information-acquisition-order-probe.mjs` to a regression requiring the actually later delivered 15:00 statement to survive a one-statement cap.
- [x] Verify red; distinguish primary statement provenance from the audience evidence establishing delivery. Preserve chronological order through event materialization and projection without treating reports as truth.
- [x] Test default cap, cross-source edit/prune, rejected assistant, branch rebind, legacy records, and equivalent proposal ordering. Run information access/projection suites and record results.

## Task 3: Recovery ownership and canceled dossier retry

**Files:** `src/hosts/sillytavern/runtime-bridge.mjs`, `shell-events.js`, `generation-client.mjs`; `src/runtime/generation-cancellation.mjs`, `src/runtime/runtime-app.mjs`, `src/runtime/people-dossier-queue.mjs`; corresponding host/cancellation/dossier tests.

**Interfaces:** A retry belongs to its captured campaign/save/chat and runtime epoch. Canceled transport cleanup cannot suppress events from a later operation. Explicit biography retry returns accurate queued work.

- [x] Convert the stale Retry probe to a regression requiring no starts in chat B; verify red.
- [x] Validate binding/epoch before and after awaited preparation; close stale dialogs when ownership changes. Test switch-before-click, switch-during-preparation, Stop, and new legitimate retry.
- [x] Convert held native ownership probe to require a new generation-ended event to be handled after Stop; verify red.
- [x] Release canceled ownership at the correct generation lifetime without underflow or releasing another active operation. Test delayed/ignored native abort, normal completion, error, and overlap.
- [x] Convert canceled dossier probe to require `{ok:true, queued:1}` on the first retry; verify red.
- [x] Drain staged terminal outcomes before retry selection, serialize with state updates, and exclude only truly running work. Verify one replacement call and source invalidation safety.
- [x] Run cancellation, retry handoff, opening, generation client, dossier runtime, and turn progress checks; record red/green evidence.

## Task 4: Draft preservation and stronger evaluation coverage

**Files:** `src/ui/settings-panel.js`; settings/browser tests; `tools/scripts/test-information-access-runtime.mjs`, `tools/scripts/character-information-evaluation.mjs`, optional evaluation runner and tests.

**Interfaces:** Async settings actions retain typed drafts until saved/discarded explicitly. Evaluation uses production extraction requests and separates unsupported grants from omissions; no oracle labels in model inputs.

- [x] Convert delayed settings probe to a regression preserving focused text `19000`; verify red.
- [x] Track per-field draft/version so unrelated saves update inheritance hints without overwriting unsaved edits. Cover queued saves, failures and reset semantics; run settings and browser suites.
- [x] Replace whole-packet regex assertions with direct `characterInformation.characters[].statements` assertions including recipient IDs and statement text.
- [x] Add an executable offline extraction evaluation contract using the private-call, late-arrival, partial-document, reported-communication and outdated-report cases. Test scorer for false grants and omissions independently; keep real-provider results explicitly unrun when no safe configured endpoint is available.
- [x] Exercise controlled capacity boundaries and provider error taxonomy with existing production request builders and fixture transports. Preserve model/provider privacy and do not expose credentials.

## Task 5: Integrate, review and publish

- [ ] Register new tests in `tools/scripts/run-alpha-gate.mjs`; update documentation with changed contracts and measured limitations.
- [ ] Run `npm.cmd test` from the worktree; resolve failures without weakening unrelated contracts.
- [ ] Independent whole-diff review: replay compatibility, source ordering, cancellation races, generated schema compatibility, draft handling and test quality. Address actionable findings and rerun affected checks.
- [ ] Confirm scoped diff, unchanged dirty main and current remote main via network-enabled GitHub CLI.
- [ ] Commit only scoped work; push the verified commit to main without force. If main advanced, integrate it and repeat affected/full verification before push.
- [ ] Verify remote main SHA and report outcome. Mark the goal complete only after scope and publication are complete; clearly distinguish live-provider limitations.
