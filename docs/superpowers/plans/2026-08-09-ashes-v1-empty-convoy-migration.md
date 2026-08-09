# Ashes V1: The Empty Convoy Migration Plan

> Status: approved implementation work. This plan covers non-UI content, registration, runtime activation, deterministic verification, and documentation only. It does not authorize player-facing UI changes or narrator-prompt cutover.

**Goal:** Make `chapter-1-the-empty-convoy` the second complete V1-native Ashes mission so a terminal Prelude activates it through the proven journey authority, while replacing the legacy phase/flag tracker with a small spoiler-safe, non-linear, evidence-backed mission contract.

**Architecture:** Treat the existing campaign package, mission graph, and prose campaign docs as authored migration inputs, not runtime authority. Encode only high-value mission state in one V1 definition. The accepted-pair interpreter proposes evidence; deterministic validation and reduction own facts, objectives, dimensions, closure, and transition. Mandatory Duty Report routes surface plot-critical knowledge through competent crew initiative. Chapter 2 remains unavailable as a V1 definition, so a completed Chapter 1 transition must remain durably pending rather than falling back to the legacy graph.

**Implementation discipline:** Red-Green-Refactor. Add failing contract and scenario tests before the definition or registry changes that satisfy them. Commit each bounded task after focused verification. Run the complete alpha gate and adversarial review before certifying the slice.

## Canonical V1 Distillation

The legacy graph's ten phases and twenty-eight outcome flags collapse into:

- `Protect the people of Relief Convoy Twelve` — required and visible at activation;
- `Resolve the conflicting quarantine authority` — conditional-required after a mandatory crew report makes the conflict player-known;
- `Account for the missing emergency hardware` — conditional-required after a mandatory crew report makes the dispersal/cargo picture player-known;
- `Establish a shared incident record with the Compact` — conditional-optional, never required for closure and never a hidden punishment;
- four aggregate outcome dimensions: relief effort, authority response, hardware disposition, and Compact cooperation;
- zero Chapter 1 clocks until campaign content supplies a concrete, player-known deadline with an authored consequence.

The definition must not mirror every contact, scan, flicker, custody exchange, technical observation, or legacy flag. Intermediate events exist only when they gate a materially different fact, objective, or outcome.

## Fair Discovery and Open-World Rules

- The player starts knowing only the convoy emergency and immediate rescue responsibility.
- The authority conflict is delivered through a required Operations/Science report; it is not an objective-gap spoiler.
- After substantive first contact, one aggregate crew report may disclose the high-value dispersal picture: survivors' location, Compact custody, and missing secured emergency hardware.
- A later recovery lead and the Starfleet-authentication significance each require causal prior evidence and a required or material report route.
- Conditional-required objectives include mandatory player-visible activation routes. They cannot appear before their triggering fact is known.
- The player may solve rescue, authority, hardware, and cooperation in any causally valid order after activation. Objective predicates encode dependencies, not a phase rail.
- Rescue success does not require discovering the hardware by player initiative. Competent crew action carries the discovery route.
- Optional cooperation changes the outcome record but never blocks mission closure.
- Failure is forward-only. Consequences attach only to informed action, an explicit handoff, or a known risk; no branch is failed for undisclosed information.

## Task 1: Lock the Contract in Failing Tests

**Files:**

- Create: `tools/scripts/test-ashes-v1-chapter-1-mission.mjs`
- Create: `tests/fixtures/mission/v1/chapter-1-empty-convoy-scenarios.fixture.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] Assert the definition path, package binding, stable mission ID, and exact objective inventory.
- [ ] Assert initial player projection contains only the emergency and rescue objective, with no false-order, missing-hardware, Compact-custody, or hidden-count leakage.
- [ ] Assert Chapter 1 has no clock and no legacy progress/phase/flag fields.
- [ ] Assert every plot-critical discoverable fact has one causal disclosure policy and one crew report route.
- [ ] Add scenario expectations for cooperative success, lawful unilateral success, handoff, success with cost, informed failure-forward, undiscovered-content safety, knowing decline after disclosure, and non-linear evidence order.
- [ ] Add hostile evidence cases for user-declared outcomes, stale revisions, wrong swipes, and unknown policies.
- [ ] Run the new test and record the expected RED failure because the definition is absent.

## Task 2: Author the V1 Mission Definition

**Files:**

- Create: `packages/bundled/breckenridge/v1/chapter-1-the-empty-convoy.mission-v1.json`

- [ ] Add aggregate fixed facts and causal disclosure gates.
- [ ] Add explicit and clear-outcome evidence policies with negative examples that prevent proposal, intention, suspicion, or narration from counting as committed results.
- [ ] Add required crew-report routes with Whitaker fallbacks for every mandatory discovery.
- [ ] Add only the intermediate events needed to gate first contact, recovery-route discovery, and final authentication significance.
- [ ] Add bounded outcome enums for survivor safety, authority resolution, hardware disposition, and the optional incident record.
- [ ] Add three core objectives, one optional objective, four dimensions, mixed terminal dispositions, and the exact Chapter 2 transition.
- [ ] Keep `clocks` empty and omit legacy phase/progress/percentage/tracker fields.
- [ ] Run schema, mission-contract, and new scenario tests to GREEN.

## Task 3: Validate Reachability and Fairness

**Files:**

- Create: `tools/scripts/validate-ashes-v1-chapter-1.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] Run the mission package linter with Chapter 2 recognized as an authored package target.
- [ ] Require every core objective disposition to be reached by at least one fixture.
- [ ] Prove optional cooperation never appears in `closeWhen`.
- [ ] Prove every conditional-required objective names a mandatory player-visible fact route.
- [ ] Prove no mission closure scenario depends on an undisclosed fact or a hidden clock.
- [ ] Add the validator to the complete alpha gate and run focused validation.

## Task 4: Register and Activate the Real Successor

**Files:**

- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `tools/scripts/test-bundled-package-registry.mjs`
- Create: `tools/scripts/test-ashes-v1-mission-handoff.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] Add the Chapter 1 definition after Prelude in the Ashes definition registry.
- [ ] Assert the runtime package library loads both exact pinned definitions.
- [ ] Use the real Prelude and Chapter 1 files to prove a terminal Prelude target changes from pending to activatable when Chapter 1 is present.
- [ ] Prove activation archives Prelude, creates a fresh Chapter 1 state, advances the branch-local journey once, and does not copy legacy roots or Prelude objective/outcome fields.
- [ ] Prove save/reload validation and replay idempotence.
- [ ] Prove Chapter 1 completion targets Chapter 2 but remains pending while no exact V1 Chapter 2 definition exists.

## Task 5: Accepted-Pair and Source-Mutation Proof

**Files:**

- Modify: `tools/scripts/test-ashes-v1-chapter-1-mission.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`

- [ ] Prove natural-language evidence can settle the same authored outcomes through the existing accepted-pair interpretation contract without prose matching in the reducer.
- [ ] Prove one accepted exchange may settle multiple high-value claims without creating multiple mission/objective records.
- [ ] Prove a swipe, edit, or delete invalidates the owned contribution and deterministically rebuilds Chapter 1 without a provider call.
- [ ] Prove mutation before Chapter 1 activation repairs Prelude only; mutation after activation can roll the journey back and prune descendants.
- [ ] Prove unrelated prose creates no mission evidence and no tracking root mutations.

## Task 6: Adversarial Review and Certification

**Files:**

- Create: `docs/development/ASHES_V1_EMPTY_CONVOY_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/planning/ASHES_V1_MIGRATION_PLAN.md`
- Modify: this plan

- [ ] Challenge spoiler leakage, premature crew reports, undiscoverable required objectives, report spam, accidental rails, false closure, optional-objective blocking, provider hallucination, source mutation, restart, duplicate activation, definition drift, and Chapter 2 fallback.
- [ ] Fix every Critical or Important non-UI finding.
- [ ] Run focused suites, `git diff --check`, and the complete alpha gate.
- [ ] Record deterministic proof and remaining limitations without claiming narrator, UI, live rehearsal, or complete Ashes readiness.
- [ ] Commit the certification docs.

## Explicit Non-Goals and Stop Boundary

- Do not change the Mission page, objective presentation, progress bar, urgency panel, completion treatment, or any other player-facing UI.
- Do not inject the V1 mission projection into narrator prompts yet.
- Do not deliver transition prose into chat yet.
- Do not delete the legacy Chapter 1 graph or legacy writers until the exact-scope cutover proves no remaining consumer depends on them.
- Do not make Chapter 2 active from legacy data. Its V1 definition is a later migration slice.
- Do not award or spend Command Bearing from mission outcomes in this slice.
- Stop and request the user's explicit approval only when implementation reaches an actual player-facing UI change.
