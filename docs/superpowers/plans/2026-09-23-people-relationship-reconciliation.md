# People relationship reconciliation implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution. Steps use checkbox tracking.

**Goal:** Reconcile People open matters with accepted outcomes and recover bounded People overflow without losing observations.

**Architecture:** Persist source-backed resolution events targeting existing matter effects. Share a pure relationship fold between context, UI, and episode review. Use one conditional People-only Utility recovery pass before the existing atomic accepted-pair settlement.

**Tech Stack:** JavaScript ES modules, Node assert scripts, existing alpha gate and Playwright.

**Spec:** docs/superpowers/specs/2026-09-23-people-relationship-reconciliation-design.md

## Global constraints
- Preserve Story Settlement authority, source custody, qualitative posture, and deterministic rollback.
- No inferred attitude, trust, character knowledge, or audience changes from matter completion.
- No running-host or saved-game mutation; no new provider role or always-on call.
- Preserve unrelated workspace changes; integrate and push to main after verification.

## Review focus
- Resolution source removed after sealing: surviving original matter reopens (Task 1).
- Identical descriptions belonging to different effects: only exact target clears (Task 1).
- Old evidence re-emitted at checkpoint: cannot recreate a resolved matter (Task 2).
- Recovery renames an introduction reference or omits an observed event: fail before commit (Task 3).
- Cancellation or revision conflict during recovery: no partial People or mission persistence (Task 4).

## Task 1: Exact source-backed matter resolution
Files: create src/people/relationship-state.mjs and tools/scripts/test-people-matter-resolution.mjs; modify src/people/accepted-pair-people.mjs, src/people/people-event-contracts.mjs, src/projection/v1/people-projection.mjs, src/story/story-settlement.mjs, src/mission/v1/accepted-pair-interpreter.mjs, runtime context call sites, and gate registration.
Interfaces: projectRelationshipStates(episodes) returns a Map keyed by person ID with posture, openMatter, openMatterId and blocked source IDs; createPeopleInterpretationContext receives optional limits; new event type relationshipMatterResolved carries matterEffectId.
- [x] Write tests against real settlement/projection functions. Literal expectations: Cross matter null after Saye outcome; original posture unchanged; source invalidation restores original text; later effect remains open; wrong target/person/user source rejected.
- [x] Run `node tools/scripts/test-people-matter-resolution.mjs` and observe missing behavior fail.
- [x] Implement the shared conditional fold, bounded context, closed observation schema, materialization and admission checks. Resolution is effective only when `event.matterEffectId === current.openMatterId`; event sources must be accepted assistant contributions.
- [x] Run the new test plus accepted-pair People, People events, projection and interpreter tests. Check no legacy save migration.

## Task 2: Episode reconciliation and stale-evidence guard
Files: src/story/episode-evaluator.mjs, src/runtime/v1-state-spine.mjs, tools/scripts/test-v1-episode-evaluator.mjs, new integration test as necessary.
Interfaces: currentRelationships exposes openMatterId and blockedOpenMatterSourceIds; optional openMatterResolutions entries are `{ personId, matterEffectId, evidenceEventId }`.
- [x] Add failing evaluator and spine tests: Cross resolution may cite Saye assistant evidence; reject nonexistent/wrong/user evidence and a simultaneous reopen; persist through real review commit and reload.
- [x] Run evaluator and spine integration tests to observe expected failures.
- [x] Build requests with shared reconciled state, validate exact source-backed resolution targets, materialize quoted events during the existing review commit, and reject openMatter updates backed solely by evidence at or before a resolution.
- [x] Run episode evaluator, state spine, settlement and rollback tests.

## Task 3: Bounded People overflow recovery
Files: src/mission/v1/accepted-pair-interpreter.mjs, optional src/people/people-observation-recovery.mjs if warranted, tools/scripts/test-people-observation-recovery.mjs, existing configurable-interpreter and Sam Vickers regression tests.
Interfaces: requested peopleCoverage complete|overflow; conditional recovery response `{ kind: 'directive.peopleObservationRecovery.v1', peopleEvents, coverage }`. Existing interpreter result remains atomic and diagnostics add recovery counts.
- [x] Add failing tests proving no silent truncation, all initial observations survive, mission/time stay frozen, and malformed tails fail. Test explicit overflow, saturated historical responses, incomplete recovery, local-ref dependencies, cancellation and provider failure.
- [x] Run `node tools/scripts/test-people-observation-recovery.mjs` to observe intended failure.
- [x] Validate full original output; split non-People authority from bounded People recovery; make at most one extra same-role request; require complete, preserving output; return failure before persistence when recovery cannot complete.
- [x] Replace old truncation assertions with lossless recovery/failure expectations. Run interpreter/configuration/evidence-passage/provider/runtime regression scripts.

## Task 4: Integration, documentation, review and main
Files: architecture People documentation, test gate registration, runtime integration tests, this plan execution record.
- [x] Exercise accepted-pair runtime with real spine/storage and fake provider boundary, proving successful persistence and no partial commit on failure/cancellation; exercise save reload and source rollback.
- [x] Update architecture documentation with resolution semantics, limits and recovery behavior.
- [x] Run focused tests, then `npm.cmd test`, recording output and fixing material regressions.
- [x] Request a fresh whole-branch review, reproduce findings and fix material issues with regression tests.
- [x] Commit scoped files, fetch main, integrate any upstream changes without rewriting history, push HEAD:main, and verify with network-enabled GitHub CLI.

## Execution record
- Goal explicitly authorizes all stages through push; proceed without routine approval handoffs.
- Worktree baseline: origin/main b75c34dbc1835cd0ea46a668273a0e25e9c76dc0; main checkout dirt preserved.

- Tasks 1-3: complete. New regression failures were observed for missing context, unsupported resolution, silent overflow truncation, repaired-episode ordering, conflicting replay, context priority, and reviewer findings; affected tests now pass.
- Task 4: complete. Implementation pushed to main and verified with GitHub CLI.
- Baseline: `npm.cmd test` passed all 286 checks on b75c34d.
- First candidate gate stopped at unchanged `test-ui-experience-polish-visual.mjs:57` focus-color assertion. An immediate isolated rerun passed unchanged; final full gate passed all 289 checks. No browser assertion was weakened.
- Independent review: P1 found a later unchanged null-matter effect could erase resolution custody. Fixed by emitting only changed relationship fields; a two-review segmented-save/reload/rollback test passes.
- Independent review: P2 found an old outcome could satisfy a newer obligation. Fixed by checking accepted source order both in episode proposals and settlement admission; same-contribution evidence remains eligible.
- Reviewer independently reran both affected regression scripts and confirmed both findings addressed with no remaining material gap in the fixes.
- Ruling: use original episode opening order for relationship folds, not replacement seal time. Source repair must not promote older relationship effects above newer ones.
- Ruling: omit and count overlong obligation text instead of truncating a condition the model must prove fulfilled.
- Limits: model semantic extraction and provider coverage claims are not live-qualified by these offline tests. Running SillyTavern and stored campaigns remain untouched.

- Final verification: `npm.cmd test` passed all 289 checks after review fixes, including the unchanged visual test and 25 route/viewports; `git diff --check` passed.

- Integration: implementation commit `db0e487996b418116ad9940cb849d0da8a652c8d` pushed as a fast-forward to `main`; `gh api repos/MentallyQuill/Directive/commits/main --jq .sha` confirmed the exact commit. This documentation-only completion record follows it.
