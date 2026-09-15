# Player Promise Stabilization Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent implementation and review. Execute bounded journeys in order; preserve the full goal across sessions.

**Goal:** Verify and stabilize all six current player promises, including real-provider, installed-host soak evidence.

**Architecture:** Retain accepted-pair authority, deterministic reducers, the state gateway, and player-safe projections. Locate failures through complete journeys and repair their owning boundaries. No new semantic store or mandatory model reviewer.

**Tech Stack:** JavaScript ES modules, Node test scripts, Playwright, SillyTavern, configured model providers.

**Spec:** The active user-approved goal in this task; current contracts in `docs/design/RELIABLE_OBJECTIVE_PROGRESS.md`, `docs/architecture/SEMANTIC_AUTHORITY.md`, `docs/architecture/FAIR_DISCOVERY.md`, and `docs/testing/V1_GAMEPLAY_ARCHITECTURE_TEST_PLAN.md`.

## Global constraints

- Start from verified published main; baseline is `1d4102db9695fcb90cc9976a5117267a8b255407`.
- Preserve dirty checkouts and all personal host data; worktree is `.worktrees/player-promise-stabilization`.
- Use a separate loopback test host and new data root if the existing host is unavailable. Copy only required disposable-account configuration; do not copy old campaigns or expose credentials in evidence.
- Live testing is authorized by the goal. Existing personal host configuration and saves are outside the mutation scope.
- Default first live batch: at most 30 generation requests or 30 minutes, whichever comes first. This bounds a batch, not the goal. Record results and choose the next targeted batch from evidence.
- Never infer model accuracy from mocked interpretations or predicate fixtures.
- Confirm source identity of the installed extension before each live build; preserve sanitized evidence in ignored `artifacts/stabilization-20260914/`.
- Publish scoped fixes to main only after relevant tests and independent review. Preserve work-in-progress evidence across continuations.

## Task 1: Baseline and disposable-host readiness

**Files:** `tools/scripts/run-alpha-gate.mjs` (reuse), ignored `artifacts/stabilization-20260914/`, `docs/testing/PLAYER_PROMISE_STABILIZATION.md`.

- [x] Verify GitHub main and create isolated worktree.
- [x] Run `npm.cmd test`, save full output, and investigate any failures before attributing later failures to changes.
- [x] Read existing host CLI/configuration and disposable account provider configuration without printing secrets.
- [x] Start an isolated loopback host with fresh chats/saves and an exact production-file copy of Directive.
- [x] Record host/source identities, installed hashes, fresh-state proof, and configured model identities.

## Task 2: Objective correction and reload

**Files to trace:** `src/runtime/runtime-app.mjs`, `src/runtime/v1-mission-runtime.mjs`, `src/mission/v1/objective-progress.mjs`, `src/runtime/state-delta-gateway.mjs`, `src/storage/v1-storage-repository.mjs`, existing `tools/scripts/test-objective-progress-*.mjs`.

- [x] Trace actual correction APIs, source receipts, partial-progress preservation, reward reconciliation, and reload projection.
- [x] Run existing app, race, core, runtime, and browser correction tests.
- [x] Add a focused failing regression only where a concrete unprotected boundary or defect is established; implement its owning-boundary fix and rerun impacted checks.
- [ ] Create a fresh Ashes campaign in the real host. Play a partial-progress turn, exercise resolve/reopen controls, reload, and continue with a real provider.
- [x] Separately delay a model result past a correction and interrupt a save; verify expected state and honest feedback (controlled production-path probe).
- [x] Record natural interpretation separately from deliberate control-based fault setup.

The correction-sensitive runtime trigger slice now has a canonical regression for manual and automatic completion after reopening, retained rejection custody, exact legacy identity, persisted-state roundtrips, and fresh report delivery. Independent review approved it together with interpreter and continuity schema alignment, including the final focused-prompt repair; the final 228-check gate and installed exact reload pass. Batch 17 preserved accepted state through two output-limited attempts. Batch 18 accepted the preserved delegation with a larger output allowance and established the hidden runtime distress fact; exact reload and provider-setting restoration pass. Twenty distinct accepted pairs are recorded, but three-timeline distribution, live trigger delivery and completed staff progression remain open. These bounded results do not close Task 2 or the broader goal.

## Task 3: Selected swipe and timeline custody

**Files to trace:** `src/runtime/v1-accepted-pair-source.mjs`, `src/runtime/timeline-transaction-service.mjs`, `src/runtime/native-branch-lineage.mjs`, `src/runtime/v1-branch-reconstruction.mjs`, timeline/storage/branch gate scripts.

- [ ] Accept a selected alternative reply, create native branches at assistant and player endpoints, reload, and independently continue each timeline.
- [ ] Exercise edit/delete invalidation, repeated checkpoint loads, stale session writes, and interruption boundaries.
- [ ] Verify exact source/swipe bindings, accepted state, unchanged parent checkpoints, and absence of duplicate rewards.

### Reproduced branch-history defect: bounded containment slice

Native installed-host reproduction on `2ccc90b` proves that an earlier transcript branch retains a later manual objective correction. Current saves store neither correction chronology nor a complete restorable base for effects removed by corrections. A decision journal alone is therefore not yet a sufficient historical reconstruction design.

- [x] Add a shared pure preflight for exact truncating branches with objective decisions in current or archived mission occurrences. Reject ambiguous history with `DIRECTIVE_BRANCH_DECISION_HISTORY_UNAVAILABLE`; preserve full-tail branches and untouched no-control truncations. Do not infer decision time from mission revisions.
- [x] Run preflight under the timeline lease before storing an operation, preserving a checkpoint, or publishing a child save. Keep the same invariant in direct reconstruction. Existing completed operations and immutable checkpoint loads remain usable.
- [x] Surface a specific deduplicated player-facing explanation: the native child exists but Directive cannot attach it; the original timeline is unchanged; return through Campaign Continue or load an available checkpoint. Do not offer an ineffective Retry. Add a narrowly scoped rejected-child generation blocker, re-detected after reload and cleared on valid recovery; only then may the UI say generation is paused. Unrelated ordinary chats remain usable.
- [x] A refusal marker may be saved only in the exact native child chat's metadata, carrying child/parent identity and the refusal reason, never campaign authority or permission to adopt a changed transcript. Verify the marker through an exact saved-child read; native save resolution is not a persistence acknowledgment. If saving is unverified, retain the current-session block and explain that reload protection was not saved. Close stale dialogs when changing chats, including ordinary chats and deferred refresh races.
- [x] If an interrupted older operation reaches the new refusal, verify exact journal ownership, pre-switch stage, and active parent before any unwind. Preserve checkpoints and child chats. Never cancel a switched or unrelated operation.
- [x] Red-green tests cover resolve/reopen/resume, archived controls, a control after an unaccepted draft, same-tail/no-control cases, parent immutability, no pending-operation deadlock, and successful checkpoint recovery after refusal.
- [x] Independent review, focused/full gate, installed native refusal and recovery proof, then publish the containment to main. Published `7c274d161`; all 667 installed files and exact parent reload verified.

**Ruling:** This is integrity containment, not completion of fork-time decision inheritance. Full anchored history with reconstructible correction effects and mission-run rollback stays open in the goal. No blanket deletion or invented chronology is permitted.

### Historical-state foundation

- [x] Add a read-only repository API that restores complete states at actual saved custody-revision boundaries, verifies the entire captured chain and exact current head, returns provenance and coverage, and rejects corrupt, missing, stale, or unavailable history. Independent review and the expanded 229-check gate pass.
- [x] Verify the installed reader against independently retained real-campaign snapshots. Revisions 31 and 32 match complete saved snapshots; exact 40-row reload and read-only state/manifest/chat preservation pass on candidate 1ba34e8a.
- [x] Publish the reviewed and verified historical-state foundation. Published fe7f05971; all 667 installed Git blobs and exact 40-row reload verified.
- [ ] Add complete mutation capture, transcript anchors, immutable inherited history ownership, source-version reconciliation, and transactional branch integration. Retain existing refusal until those boundaries are proven together; revision restoration alone does not locate a native transcript cut.

### Accepted-source commit boundary

- [x] Reproduce silent swipe, text, visibility, ordering and binding changes while analysis is pending; verify the unchanged control and signaled cancellation separately.
- [x] Capture the original source before asynchronous work and validate exact current binding/source synchronously before state application. Preserve consecutive Continue behavior through the existing full-history fallback. Focused review and the first 230-check gate pass.
- [x] Close the installed native Send handoff gap: a stale-source rejection blocks another analysis pass from the same gesture, automatic/quiet gestures and a subsequent end event without a fresh start. A fresh explicit/manual gesture can reconcile the visible source. Ordinary no-event source-mutation reconciliation remains compatible.
- [x] Verify final installed silent-mutation containment, exact cleanup, relevant/full tests and independent review, then publish the scoped fix. Published 600e05af0; all 230 checks, 667 installed files, native silent-hide proof and exact 40-row published reload pass.

## Task 4: Private briefing and spoiler safety

**Files to trace:** `src/story/continuity-analyst.mjs`, `src/story/character-information.mjs`, narration projection, existing character-information evaluation scripts.

- [ ] Run the six extraction cases using real configured providers and separately adjudicate source meaning.
- [ ] Extend to private briefing, late arrival, partial document, reported claim, and outdated information during continued narration.
- [ ] Check all relevant player projections for unsupported disclosure and check false ignorance as well as knowledge leaks.

## Task 5: Fair campaign journeys

**Files to trace:** bundled Ashes definitions, `docs/testing/ashes-objective-support-matrix.json`, objective predicate/reducer and journey scripts.

- [ ] Map all 13 missions and 50 objectives to relevant predicate and consequence coverage.
- [ ] Exercise representative early/middle/late journeys including non-success dispositions, optional decline, varied order, corrections, transitions, rewards, and closure.
- [ ] Identify explicit prerequisite/delivery paths for every observed blockage; do not silently fabricate narrative evidence to advance tests.
- [ ] Distinguish controlled later-state fixtures from chapters reached naturally in live play.

## Task 6: Rich long campaigns and recovery/coexistence

**Files to trace:** thread retrieval, story settlement/projections, segmented storage, generation router/host bridge, existing scale/cancellation/preset tests.

- [ ] Build representative rich saves at small, medium, and long history sizes; measure load/save, prompt construction, retrieval, and browser responsiveness.
- [ ] Probe paraphrased obligations, dormant threads, obsolete facts, recurring relationships, and branch reconstruction.
- [ ] Live-test provider failures, Stop/Retry, reload and provider changes, mobile controls, preset restoration, and a separate ordinary chat.
- [ ] Check latency/call counts alongside semantic outcomes and record censored timeouts separately.

## Predeclared acceptance and evidence rules

- Deterministic integrity: zero wrong-timeline writes, lost committed corrections, duplicate rewards, invalid accepted sources, or false save-success acknowledgements in the exercised cases.
- Core semantic corpus: zero false completed objectives on labelled partial/negated/attempt cases and zero unsupported recipient grants on labelled private-information cases. Every missed positive or unclassified response requires adjudication; structural rejection is not a semantic pass.
- End-to-end narration: record unsupported knowledge, false ignorance, invented communication, player-agency violations, and disclosure violations for each response. Any material violation opens a defect/evaluation item; one favorable answer is insufficient proof of general quality.
- Performance: compare identical rich workloads and configurations at declared sizes; flag greater than 2x regression at a fixed size and any unbounded growth in per-turn prompt input. Report actual measurements and sample sizes without claiming population percentiles from a tiny sample.
- Live sessions: reach at least 20 accepted player/assistant pairs across at least three fresh or explicitly forked test timelines, including correction/reload, selected-swipe branching, and private-information continuation. This minimum does not close unexercised required scenarios or unresolved material failures.
- Evidence distinguishes controlled state tests, real-provider synthetic evaluation, real-host fault injection, and natural live play.

Minimum sample/distribution verified through batch 27: twenty-two wholly real distinct accepted pairs across at least three continued fresh/native-fork timelines; twenty-three natural-content pairs when including one injected-failure/real-recovery acceptance. Inherited receipts and repeated-source replay add no credit. Independent exact-tuple audit: `natural-timeline-distribution-audit.json/.md`. Both latest child turns preserve the full parent checkpoint and pass exact reload. This completes only the minimum sample/distribution requirement; the remaining scenario and semantic-quality work above stays open.

## Task 7: Publish and completion audit

- [ ] Review each production fix independently, run relevant checks and the release gate, and publish only scoped files.
- [ ] Verify remote main and the final installed build separately.
- [ ] Update `docs/testing/PLAYER_PROMISE_STABILIZATION.md` with coverage, defects/fixes, live results, metrics, limitations, and exact evidence paths.
- [ ] Audit every goal area and scenario; leave the goal active while required proof or fixes remain.

## Captured-history storage preparation checkpoint

- [x] Define and implement a disabled captured-save API with immutable bounded history, exact expected-head preflight, saved-binding checks, exact retries, and committed/not-committed/uncertain publication outcomes.
- [x] Reproduce and fix independent review findings about persisted request identity and mismatched saved entity identity; freeze the corrected source and pass all 231 checks.
- [x] Verify thirteen complete cases through installed browser modules and actual isolated host file storage; preserve the live campaign, parent, chat and settings and exact 45-row reload.
- [ ] Integrate authoritative host snapshots and complete writer capture, recover uncertain publication, preserve inherited ownership, and verify chronological native branch reconstruction before changing the existing refusal.

The 22-call candidate-completeness A/B and eight-call rank-fidelity A/B both failed adoption and remain unadopted. Staff readiness was explicitly corrected using player controls and retained on reload; automatic interpretation is not thereby proven. Through closed batch 30, 291 real requests yielded twenty-five wholly real distinct accepted pairs (twenty-six natural-content identities including one mixed-failure acceptance), across at least three continued timelines. The authored report mechanism delivered its packet, but notice text omitted the substantive fact granted by acceptance; this is a material disclosure failure, not a semantic pass.

## Host snapshot and substantive report checkpoint

- [x] Review optional complete host-snapshot preparation; verify native selection, full metadata, narrow media/Date compatibility, immutable detachment, explicit bounds and refusal cases.
- [x] Install the four frozen host files over a803859b7, verify all 670 inventory files, and prove actual 51-row JSON equality before/after native reload with identical snapshot hash and unchanged save, both checkpoints and settings. Controlled detached fresh-Date rows also equal their persisted ISO representation. No provider calls or acceptance occurred.
- [x] Pass expanded full release gate in an isolated published-baseline copy containing only the frozen host snapshot source/test/gate overlay: all 232 checks passed.
- [x] Publish host-snapshot preparation as 1551cc71f; verify remote main, all 670 installed files and exact 51-row reload. No production caller or earlier-branch permission is enabled by this preparation.
- [x] Version new Duty Reports to include the full authored routed fact, preserve settled V1 authority/replay, conservatively refuse insufficient pending V1 disclosure and redeliver V2 through ordinary narration. Retain preparation identity across generation and close invalid-manifest/direct-interpreter bypasses.
- [x] Independently review report repair, pass all 234 checks, verify the installed actual pending V1 refusal, and run one natural continuation with unchanged state/checkpoints/settings and exact 53-row reload. The old notice grants no new fact; the new V2 draft attaches correctly but its surrounding narration weakens the risk into a hypothetical. End the batch without accepting it; coherent substantive disclosure remains unproven.
- [ ] Publish the reviewed report-content/custody repair with its explicit live semantic limitation. Resolve the narrator coherence/authority-context gap without claiming canonical text alone proves entailment.
- [x] Prepare and independently review source-bound controlled middle/late campaign starts, including complete public-spine state, native raw/normalized source consistency negatives and segmented roundtrip. All four discovered native-readback holes now reject. Fixture setup receives no natural-play credit.
- [ ] Import the approved controlled starts through actual native APIs using observed binding/filename/row identities, then conduct bounded real-provider middle/late journeys and verify consequences, rewards, transitions and closure.
