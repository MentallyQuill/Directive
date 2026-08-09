# Ashes V1: False Colors Migration Plan

> Status: approved implementation work. This plan covers non-UI content, registration, runtime activation, deterministic verification, and documentation only. It does not authorize player-facing UI changes or narrator-prompt cutover.

**Goal:** Make `chapter-2-false-colors` the third complete V1-native Ashes mission so a terminal Empty Convoy activates it through the exact journey authority, while replacing the legacy staged tracker with a compact, spoiler-safe, open-world mission contract that supports joint legitimacy, unilateral vindication, managed ambiguity, and political rupture without dead-ending the campaign.

**Architecture:** Treat the campaign prose, legacy mission graph, Chapter 2 adjudication code, and protected regression behavior as migration inputs rather than parallel V1 authority. The accepted-pair interpreter proposes source-bound evidence; deterministic validation and reduction own player knowledge, objectives, outcomes, closure, and transition. Competent crew Duty Reports carry mandatory discoveries after causal world events. The mission tracks high-value dispositions, not every briefing term, scan, witness statement, access request, or political exchange.

**Implementation discipline:** Red-Green-Refactor. Add failing contract and scenario tests before authoring or registering the definition. Preserve existing legacy behavior for consumers that have not cut over. Commit each bounded task after focused verification. Run the complete alpha gate and an adversarial review before certifying the slice.

## Canonical V1 Distillation

The legacy graph's six phases, twenty-three facts, twenty-five outcome flags, eight pressures, and four hidden risk clocks collapse into:

- `Protect the wounded aboard Aegis Two` - required and visible at activation;
- `Establish a credible account of the attack` - required and visible at activation, with clean, unilateral, ambiguous, handed-off, and rupture-forward dispositions;
- `Set a safe and credible verification boundary` - conditional-required after a mandatory report makes the access dispute and tactical risk player-known;
- `Establish a joint investigation framework` - conditional-optional after credible shared evidence exists, never required for closure and never a hidden punishment;
- four aggregate outcome dimensions: medical disposition, attack-account disposition, verification/security disposition, and Compact partnership;
- no Chapter 2 clock, because the authored time pressure supplies no concrete player-known deadline and consequence pair.

The independent evidence and Hecate route are evidence within the attack-account objective, not additional checklist objectives. This preserves the campaign clue without turning each forensic discovery into tracker spam.

## Player Knowledge and Causal Discovery

The definition uses four high-value facts:

1. `False Colors crisis` - initially known: Aegis Two was attacked by a vessel presenting as Breckenridge, casualties exist, and the real ship's convoy alibi is disputed because Starfleet controls much of its own proof.
2. `Verification and access dispute` - discoverable through one required briefing report: Kessler needs independent verification, Holt presses for broad system access, and Tolland forbids exposing dangerous command-authentication architecture.
3. `Independent evidence picture` - discoverable only after a credible civilian, station, neutral, or joint evidence baseline is actually preserved: independent records and post-refit calibration exclude the real Breckenridge and open a reconstruction route.
4. `Counterfeit route picture` - discoverable only after usable field, debris, traffic, testimony, or equivalent evidence is actually obtained: the attack used a counterfeit platform connected to Chapter 1 identity material and left a weak Hecate routing lead; the operator and wider conspiracy remain unknown.

Three aggregate Duty Report routes disclose the three discoverable facts. Each report's visible canonical text must state every material fact it commits. A report cannot trigger from an order, plan, theory, access attempt, isolated scan, unverified signal, or director-only truth. Whitaker is the fallback for every mandatory route so the player is not punished for failing to guess an undisclosed plot action.

## Open-World and Fairness Rules

- Medical help, evidence work, political negotiation, and security-boundary work may proceed in any causally valid order.
- The player may use a joint audit, neutral specialist, civilian records, selected-log disclosure, controlled demonstration, cryptographic proof, field recovery, diplomacy, delegation, or another credible equivalent.
- A model may classify varied prose against authored evidence standards, but only deterministic policy validation and reduction may change V1 state.
- Medical care never requires political cooperation or testimony. Voluntary testimony may strengthen evidence but is not required for treatment success.
- The player is not penalized for failing to accuse Holt, identify Pale Lantern, identify the remote tug's operator, or uncover any director-only fact.
- A weak Hecate lead may be preserved without immediate pursuit or unsupported attribution.
- Refusing dangerous access can be a clean success when paired with credible independent proof; surrendering dangerous architecture is a cost even if it helps vindication.
- Optional joint partnership improves the terminal record but never blocks mission closure.
- Failure is forward-only. Negative dispositions require a known risk plus depicted committed action, explicit refusal, actual loss, or an accepted handoff. Undisclosed information cannot generate punishment.

## Terminal Outcome Model

- `jointLegitimacy` - all core responsibilities resolve cleanly and a credible joint Compact framework is established.
- `credibleVindication` - all core responsibilities resolve cleanly without requiring the optional partnership.
- `managedAmbiguity` - the crisis is responsibly contained with material uncertainty, cost, or transferred obligations while evidence and future work remain viable.
- `politicalRuptureForward` - an informed failure, coercive medical outcome, dangerous exposure, destroyed evidence route, or knowingly unsupported refusal produces a serious consequence, but the campaign continues.

The transition target is `open-orders-1-work-worth-doing`. Until that target has an exact V1 definition in the same pinned package version, terminal False Colors state must remain durably pending and must never fall back to legacy package data.

## Task 1: Lock the Contract in Failing Tests

**Files:**

- Create: `tools/scripts/test-ashes-v1-chapter-2-mission.mjs`
- Create: `tests/fixtures/mission/v1/chapter-2-false-colors-scenarios.fixture.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Assert the absent definition path, exact package binding, stable mission ID, and objective inventory.
- [x] Assert the initial projection contains only the player-known attack crisis and two immediate responsibilities, with no tug, Holt, Pale Lantern, Hecate, hidden-objective count, or undisclosed access-demand leakage.
- [x] Assert no legacy phases, pressures, flags, progress percentages, or clocks appear in the V1 definition.
- [x] Assert exactly three causal aggregate Duty Report routes cover every mandatory discoverable fact.
- [x] Add scenarios for joint legitimacy, credible unilateral vindication, managed ambiguity, handoff, informed rupture-forward, optional-partnership omission, non-linear causal order, and undiscovered-content safety.
- [x] Add hostile cases for player self-declared success, premature reports, director-only attribution, stale revisions, wrong swipes, unknown policies, and synthetic countdowns.
- [x] Run the new test and record the expected RED failure because the definition is absent.

## Task 2: Author the V1 Mission Definition

**Files:**

- Create: `packages/bundled/breckenridge/v1/chapter-2-false-colors.mission-v1.json`

- [x] Add the four aggregate facts and two causal evidence-acquisition events.
- [x] Add explicit and clear-outcome policies whose exclusions distinguish completed evidence, care, verification, and political dispositions from intent, attempt, theory, or model assertion.
- [x] Add exactly three required crew-report routes with role-capable preferred actors and Whitaker fallback.
- [x] Add bounded outcomes for medical care, attack-account disposition, verification/security disposition, and optional partnership.
- [x] Add three core objectives, one optional objective, four dimensions, four forward-only terminal dispositions, and the exact Open Orders I transition.
- [x] Keep `clocks` empty and omit every legacy phase/progress/pressure/flag field.
- [x] Run schema, mission-contract, and scenario tests to GREEN.

## Task 3: Validate Reachability, Spoiler Safety, and Fairness

**Files:**

- Create: `tools/scripts/validate-ashes-v1-chapter-2.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] Run the package linter with Open Orders I recognized as an authored package target.
- [ ] Prove every core objective disposition and terminal mission disposition is reachable in at least one fixture.
- [ ] Prove optional partnership never participates in `closeWhen`.
- [ ] Prove the conditional-required security objective has a mandatory player-visible discovery route.
- [ ] Prove no closure path depends on director-only truth, an undisclosed fact, a hidden clock, or a fixed phase order.
- [ ] Prove medical success is independent of testimony and political concessions.
- [ ] Add the validator to the complete alpha gate and run focused validation.

## Task 4: Register and Activate the Real Successor

**Files:**

- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `tools/scripts/test-bundled-package-registry.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] Register False Colors after Empty Convoy in the exact Ashes package version.
- [ ] Assert the runtime package library loads Prelude, Empty Convoy, and False Colors in journey order.
- [ ] Prove terminal Empty Convoy changes from pending to activatable only when the exact False Colors definition exists.
- [ ] Prove activation archives Empty Convoy, creates fresh False Colors state, advances the journey once, and leaves unrelated roots unchanged.
- [ ] Prove save/reload validation, duplicate activation idempotence, and no legacy-root copying.
- [ ] Prove terminal False Colors targets Open Orders I but remains pending while no exact V1 Open Orders definition exists.

## Task 5: Accepted-Pair, Duty Report, and Source-Custody Proof

**Files:**

- Create: `tools/scripts/test-ashes-v1-chapter-2-runtime.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [ ] Prove varied natural-language prose can settle authored Chapter 2 evidence without reducer prose matching.
- [ ] Prove one accepted exchange may settle several high-value claims into one mission aggregate without creating tracker rows.
- [ ] Prove required report claims are stripped without an accepted selected-swipe Duty Report manifest.
- [ ] Prove all three reports deliver once, communicate the same fact they commit, and tolerate different valid delivery order where causal gates permit.
- [ ] Prove swipe/edit/delete invalidates all source-owned claims and deterministically rebuilds state without a provider call.
- [ ] Prove mutation before activation repairs Empty Convoy only; mutation after activation can roll the journey back and prune False Colors descendants.
- [ ] Prove unrelated prose creates no mission evidence or unrelated tracking-root changes.

## Task 6: Adversarial Review and Certification

**Files:**

- Create: `docs/development/ASHES_V1_FALSE_COLORS_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/planning/ASHES_V1_MIGRATION_PLAN.md`
- Modify: this plan

- [ ] Challenge spoiler leakage, plot teleportation, forced phase order, fake urgency, coerced medical care, unsafe access rewarded as success, undiscoverable requirements, premature attribution, report spam, false closure, optional blocking, model self-certification, source mutation, package drift, duplicate activation, and legacy Open Orders fallback.
- [ ] Fix every Critical or Important non-UI finding.
- [ ] Run focused suites, `git diff --check`, and the complete alpha gate.
- [ ] Record deterministic proof and remaining limitations without claiming narrator, UI, live rehearsal, or complete Ashes readiness.
- [ ] Commit the certification docs.

## Explicit Non-Goals and Stop Boundary

- Do not change the Mission page, objective presentation, progress bar, urgency panel, completion treatment, or any other player-facing UI.
- Do not inject the V1 mission projection into narrator prompts yet.
- Do not deliver transition prose into chat yet.
- Do not delete or semantically rewrite the legacy Chapter 2 graph, adjudication paths, pressure systems, or tests while uncut-over consumers remain.
- Do not identify Holt or Pale Lantern as player-known truth in False Colors.
- Do not activate Open Orders I from legacy data.
- Do not award or spend Command Bearing from mission outcomes in this slice.
- Stop and request the user's explicit approval only when implementation reaches an actual player-facing UI change.
