# Ashes V1: Open Orders I Migration Plan

> Status: approved implementation work. This plan covers non-UI content, V1-only mission identity, registration, runtime activation, deterministic verification, and documentation. It does not authorize player-facing UI changes or narrator-prompt cutover.

**Goal:** Make `open-orders-1-work-worth-doing` the fourth V1-native Ashes journey entry without turning its three optional assignments into a mandatory checklist, duplicating legacy side-quest UI, or preserving the old incremental progress tracker as state authority.

**Architecture:** Represent Open Orders I as one V1 interval mission with one required conclusion objective and three visible optional assignment objectives. Explicit player decisions record direct engagement, delegation, or knowing decline. Each engaged assignment receives at most one causal aggregate Duty Report after a real assessment, then one high-value result. Two resolved assignments are a normal interval load. All three can produce broad coverage when at least one is delegated, or overextension when all three remain under direct command. Early departure is allowed and carries only a known forward consequence. The transition targets `chapter-3-dead-letters`.

**Identity boundary:** Open Orders I is authored campaign structure and the exact target of the False Colors graph, but it is not a legacy quest template. Add only its V1 definition to the V1 registry. Do not add a legacy package quest row, because doing so could create a duplicate player-facing mission or awaken old quest/UI behavior. Validation must bind its source identity to the predecessor's exact authored transition target and bind its successor to the existing Chapter 3 package template.

**Implementation discipline:** Red-Green-Refactor. Lock behavior in failing tests before the definition and registry changes. Preserve the existing pressure/Open Orders/side-assignment runtime for uncut-over consumers without treating it as V1 authority. Commit bounded tasks after focused verification. Run the complete alpha gate and adversarial review before certification.

## Canonical V1 Distillation

The interval contains:

- `Conclude the first Open Orders interval` - required and visible; it closes only on an explicit player-safe conclusion decision;
- `The Long Repair` - optional, visible opportunity;
- `Borrowed Wings` - optional, visible opportunity;
- `Quiet Channels` - optional, visible opportunity;
- one initially known opportunity fact that tells the player all three assignments are available, two are a normal load, and a third requires credible delegation or carries overextension risk;
- one assessment fact and one internal assessment event per assignment;
- one aggregate Duty Report per engaged assignment, never one row per task, scene beat, favor, technical observation, trainee, or contact;
- explicit engagement decisions (`direct`, `delegated`, or `declined`) and aggregate assignment results;
- four player-facing dimensions: interval load plus the result of each assignment;
- no interval clock, because delegation duration and background analysis are not player-known failure deadlines.

## Assignment Fairness

- All three opportunities are genuinely optional. Declining one or all is recorded, not treated as cheating.
- Completing or responsibly resolving any two assignments is a normal interval load.
- Completing all three under direct command records overextension; completing all three with credible delegation records broad coverage without an automatic penalty.
- Delegation remains a real choice with an offscreen outcome. It does not grant an asset merely because the order was issued.
- Each assignment result requires its player-safe assessment fact unless it is knowingly declined.
- The Long Repair is genuine infrastructure risk, not sabotage.
- Borrowed Wings concerns honest qualification and adaptive duty, not a hidden compromised pilot.
- Quiet Channels is primarily mutual aid, not a Pale Lantern front; any compromised traffic does not turn the whole network into a conspiracy.
- These truths arrive through capable crew after actual assessment, so the player is not punished for failing to guess them.
- Asset-quality results, limited results, and informed failures all continue the campaign.

## Task 1: Lock the Contract in Failing Tests

**Files:**

- Create: `tools/scripts/test-ashes-v1-open-orders-1-mission.mjs`
- Create: `tests/fixtures/mission/v1/open-orders-1-scenarios.fixture.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Assert the absent definition, exact V1-only source identity, package binding, objective inventory, and Chapter 3 target.
- [x] Assert the initial projection shows one interval objective and three optional opportunities without hidden counts, conspiracy spoilers, or legacy percentages.
- [x] Assert no legacy phase, progress, pressure, side-quest, or clock fields enter the V1 definition.
- [x] Assert exactly three assessment reports, each gated by an engaged assignment and a completed assessment.
- [x] Add scenarios for two-assignment normal completion, broad three-assignment coverage with delegation, three-direct overextension, limited mixed results, informed assignment failure, early departure, all-declined departure, and non-linear assignment order.
- [x] Add hostile cases for success on selection alone, delegated asset on order alone, premature assessment reports, player-declared world results, stale revisions, wrong swipes, and unknown policies.
- [x] Run the new test and record the expected RED failure because the definition is absent.

## Task 2: Author the V1 Interval Definition

**Files:**

- Create: `packages/bundled/breckenridge/v1/open-orders-1-work-worth-doing.mission-v1.json`

- [x] Add the aggregate opportunity and assignment-assessment facts.
- [x] Add player-provable engagement decisions for direct work, delegation, and knowing decline.
- [x] Add one clear assessment event and one required report route per engaged assignment.
- [x] Add aggregate result policies that require the corresponding player-known assessment and distinguish actual success, limited resolution, and informed failure from plans or attempts.
- [x] Add explicit conclusion policies for a normal two-assignment load, broad delegated coverage, direct overextension, and early departure.
- [x] Add one core objective, three optional objectives, four dimensions, forward-only terminal dispositions, and the exact Chapter 3 transition.
- [x] Keep clocks empty and omit legacy progress/phase/pressure/side-assignment state.
- [x] Run schema, contract, and scenario tests to GREEN.

## Task 3: Validate Reachability, Identity, and Load Semantics

**Files:**

- Create: `tools/scripts/validate-ashes-v1-open-orders-1.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Bind `packageBinding.sourceId` to the exact False Colors transition target without adding a legacy quest template.
- [x] Bind the transition target to the existing `chapter-3-dead-letters` package template.
- [x] Prove every core/terminal disposition is reachable and no optional assignment participates directly in `closeWhen`.
- [x] Prove a normal conclusion requires two resolved assignments, broad coverage requires all three plus delegation, and overextension requires all three under direct command.
- [x] Prove decline and early departure are player-known decisions, not hidden failure inference.
- [x] Validate every preferred and fallback reporter against the authoritative crew dataset.
- [x] Prove no result requires a conspiracy reveal or a synthetic clock.

## Task 4: Register and Activate the Interval

**Files:**

- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `tools/scripts/test-bundled-package-registry.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Register Open Orders I after False Colors without adding a legacy package quest row.
- [x] Prove terminal False Colors changes from pending to ready only with the exact interval definition.
- [x] Prove activation archives False Colors once, creates a fresh interval state, reloads cleanly, and leaves unrelated roots unchanged.
- [x] Prove duplicate activation is idempotent and no legacy pressure, assignment, reward, or progress state is copied into V1.
- [x] Prove terminal Open Orders I targets Chapter 3 but remains pending until Chapter 3 has an exact V1 definition.

## Task 5: Accepted-Pair, Delegation, Report, and Source-Custody Proof

**Files:**

- Create: `tools/scripts/test-ashes-v1-open-orders-1-runtime.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Prove current-player prose can record explicit direct, delegated, or declined engagement decisions without proving world outcomes.
- [x] Prove selected assistant prose can settle several high-value claims into one interval aggregate without creating tracker rows.
- [x] Prove required assessment facts are stripped without selected-swipe Duty Report custody.
- [x] Prove each selected assignment produces at most one aggregate assessment report and no report for an unselected or declined assignment.
- [x] Prove delegation does not grant an asset until a depicted offscreen result is accepted.
- [x] Prove swipe/edit/delete rebuilds direct, delegated, report, result, and conclusion evidence without a provider call.
- [x] Prove source mutation before and after interval activation repairs False Colors or rolls the journey back and prunes the interval descendant.
- [x] Prove unrelated quiet scenes create no mission evidence or unrelated tracking-root changes.

## Task 6: Adversarial Review and Certification

**Files:**

- Create: `docs/development/ASHES_V1_OPEN_ORDERS_1_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/planning/ASHES_V1_MIGRATION_PLAN.md`
- Modify: this plan

- [x] Challenge mandatory-side-quest drift, duplicated legacy UI identity, selection-as-success, delegation-as-free-reward, assessment teleportation, report spam, hidden overextension, fake clocks, forced assignment order, optional blocking, premature Chapter 3 setup, model self-certification, actor identity, source mutation, package drift, and legacy Chapter 3 fallback.
- [x] Fix every Critical or Important non-UI finding.
- [x] Run focused suites, `git diff --check`, and the complete alpha gate.
- [x] Record deterministic proof and residual limitations without claiming narrator, UI, live rehearsal, reward-asset projection, or complete Ashes readiness.
- [x] Commit the certification docs.

## Explicit Non-Goals and Stop Boundary

- Do not add a legacy Open Orders quest template or alter current Mission/Lumiverse UI behavior.
- Do not change player-facing pages, selection controls, progress bars, urgency display, notifications, or completion presentation.
- Do not inject V1 projections into narrator prompts or deliver transition prose into chat.
- Do not delete or rewrite the legacy pressure, Open Orders, assignment-scene, delegation, reward, or interval-progress runtimes while uncut-over consumers remain.
- Do not grant legacy reward assets from V1 state in this slice; record only the authoritative V1 assignment result pending a later projection/cutover decision.
- Do not make every quiet scene advance an assignment.
- Do not activate Chapter 3 from legacy data.
- Do not award or spend Command Bearing from this interval.
- Stop and request explicit user approval only when implementation reaches an actual player-facing UI change.
