# Ashes V1: Dead Letters Migration Plan

> Status: completed and certified for the non-UI scope on 2026-08-09. This plan covers non-UI content, exact package identity, deterministic mission authority, runtime activation, source custody, adversarial review, and documentation. It does not authorize player-facing UI changes or narrator-prompt cutover.

**Goal:** Make `chapter-3-dead-letters` the fifth V1-native Ashes journey entry without exposing the Dominion relay, private archive, distributed architecture, predictive routines, current Starfleet Intelligence access, Farwatch, or Demeris route before accepted play earns them.

**Architecture:** Represent Dead Letters as three core responsibilities: establish a defensible operating position at Hecate Seven, determine what the anomalous message system is and what the evidence can prove, and leave the physical system plus its human archive in an informed custody state. Navigation, investigation, relay disposition, and archive governance remain separate outcome dimensions but do not become separate progress bars for every approach, location, message, access method, salvage complication, or technical observation.

**Authority boundary:** The model interprets accepted prose against authored evidence standards. Deterministic validation owns facts, events, decisions, results, objective disposition, closure, and transition. Voluntary relay and archive choices are exclusively player-sourced; selection or an order is never the observed result. Crew can deliver aggregate findings after real acquisition events, with Whitaker fallback, but cannot choose ownership, disclosure, destruction, or operational risk for the player.

**Identity boundary:** Dead Letters is an existing Ashes package quest template with an empty legacy `missionGraph` object. Bind the V1 definition to the exact package template and the exact Open Orders I target. Add only the V1 definition to the V1 registry; do not invent a legacy mission graph, incremental progress data, or another quest identity.

**Campaign-order boundary:** The current canonical chapter source transitions Dead Letters to `chapter-4-the-colony-that-stayed`, while the later open-world package permits Dead Letters and The Colony That Stayed after False Colors in either order. This slice keeps Dead Letters internally independent of Chapter 4 and uses the canonical Chapter 4 target for the current linear V1 journey. It does not claim campaign-level sibling-mission scheduling parity. That scheduler must be resolved before full Ashes open-world certification, without changing Dead Letters evidence or outcome semantics.

**Implementation discipline:** Red-Green-Refactor. Lock the spoiler, reachability, failure-forward, user-agency, report-custody, transition, and source-rebuild behavior in failing fixtures before registering the mission. Commit bounded tasks after focused verification and run the complete alpha gate before certification.

## Canonical V1 Distillation

### Initial player-safe state

The player initially knows only that correlated traffic points toward Hecate Seven, the Drift is hazardous and incompletely charted, and the Breckenridge must identify and secure the source without assuming who built, accessed, or controls it.

Initial projection must not reveal:

- a Dominion relay;
- Pale Lantern;
- a private intercepted archive;
- fabricated family or casualty messages;
- a distributed or predictive architecture;
- local postwar access;
- a current Starfleet Intelligence handshake;
- Farwatch, Holt, Rourke, a compromised salvager, Demeris, or Mira Solenn;
- a hidden revelation count or legacy percentage.

### Core objectives

1. `Establish a defensible operating position at Hecate Seven` - reach, probe, or otherwise establish usable contact through a safe, costly, responsibly deferred, or failure-forward approach.
2. `Determine what the message system is and what the evidence supports` - distinguish observed data, inference, and attribution; full evidence is not required when loss or withdrawal produces a causally grounded alternate route.
3. `Resolve the site's operational and human custody` - settle both the physical system and the records/people affected by it through observed outcomes, not plans.

No Wayward Sun, maintenance shaft, comet canyon, beacon, message fragment, access crystal, purge attempt, or specialist task becomes its own objective. Those are scenes, approaches, complications, or Story Settlement effects that may influence the aggregate outcomes.

### Aggregate facts and reports

1. `Relay and archive character` - after usable site contact, the player learns that a Dominion-origin relay fabricates or recombines messages using genuine intercepted private communications; the archive has human stakes and is not supernatural.
2. `Network architecture picture` - after usable relay evidence, the player learns that this is one node in a distributed system with predictive community-response scenarios, and that the node alone does not prove its current controller.
3. `Access history and Demeris route` - after recovered access evidence or a depicted alternate corroboration route, the player learns that the node had postwar local access, received a current Starfleet Intelligence handshake, and points toward a Demeris maintenance account and Mira Solenn; it does not prove Rourke, Holt, Farwatch, or Pale Lantern attribution.

Each fact has one required aggregate Duty Report. Direct relay logs are the primary route. Cardassian logistics records, Compact testimony, traffic residue, or another authored corroboration can preserve the Demeris route after loss, destruction, or responsible withdrawal. Alternate evidence must be depicted and source-owned; the mission cannot teleport the next chapter.

### Decisions and observed outcomes

- navigation/access result: stable access, access with cost, responsible withdrawal, or forced loss of position;
- relay disposition decision: isolate, observe behind quarantine, destroy after bounded copy, destroy without copy, or withdraw;
- archive-governance decision: protected joint custody, protected restricted custody, broad release, or intelligence custody;
- observed relay result: preserved and isolated, controlled observation contained, controlled observation exposed, destroyed after copy, destroyed without copy, lost or seized, or left in place;
- observed archive result: protected joint, protected restricted, broadly released, intelligence-controlled, lost control, or not recovered.

Voluntary decisions are user-only. Favorable and costly implementation results require later accepted assistant prose depicting what actually happened. Loss/seizure and forced outcomes can be assistant-observed without fabricating a prior player choice.

### Outcome dimensions and closure

Project only four dimensions:

- operating-position quality;
- evidence quality and route;
- relay disposition;
- archive custody.

Close only when all three core objectives have authored terminal dispositions. Full discovery is not required for forward progress after responsible withdrawal, destruction, or loss, but missing evidence must remain missing and change the terminal disposition. No single failed check ends the mission.

Target terminal dispositions:

- accountable isolation;
- bounded observation;
- costly truth forward;
- privacy protected with evidence loss;
- responsible withdrawal forward;
- compromised custody forward.

All continue to `chapter-4-the-colony-that-stayed`. Transition narration must identify whether Demeris came from relay logs or alternate corroboration and must not invent access, attribution, preserved evidence, privacy protection, or a live trace.

### Clock policy

Dead Letters defines no mission clock. Comet instability, purge attempts, salvage interference, and active transmission are scene pressures or events unless a future authored scene introduces a concrete player-known deadline, start condition, advancement authority, expiry, and consequence. The legacy pressure list is not converted into timers.

## Task 1: Lock the Contract in Failing Tests

**Files:**

- Create: `tools/scripts/test-ashes-v1-chapter-3-mission.mjs`
- Create: `tests/fixtures/mission/v1/chapter-3-dead-letters-scenarios.fixture.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Assert the absent V1 definition, exact package template identity, Open Orders predecessor, package binding, minimal objective inventory, and Chapter 4 target.
- [x] Assert the initial projection contains only the Hecate mission route and three spoiler-safe responsibilities.
- [x] Assert no legacy incremental progress, phase, pressure, hidden revelation count, quest event, or synthetic clock enters V1.
- [x] Assert exactly three aggregate facts and Duty Reports beyond the initially known route.
- [x] Add clean isolation, bounded observation, destroyed-after-copy, privacy-first destruction, responsible withdrawal, lost/seized, and partial-evidence failure-forward scenarios.
- [x] Add non-linear evidence/custody order and alternate Demeris-corroboration scenarios.
- [x] Add hostile cases for approach/order as success, archive policy before discovery, player-declared world outcomes, report without acquisition, unsupported attribution, stale revisions, wrong swipes, and unknown policies.
- [x] Run the new test and record the expected RED failure because the definition is absent.

## Task 2: Author the V1 Mission Definition

**Files:**

- Create: `packages/bundled/breckenridge/v1/chapter-3-dead-letters.mission-v1.json`

- [x] Add one initially known Hecate route fact and three discoverable aggregate facts.
- [x] Add site-contact, relay-evidence, direct-access-history, and alternate-corroboration events without treating plans as acquisition.
- [x] Add user-only voluntary relay/archive decisions and assistant-observed access, relay, and archive results.
- [x] Add three required objectives and four outcome dimensions without per-location or per-message objectives.
- [x] Add three required report routes with exact crew IDs and Whitaker fallbacks.
- [x] Add six forward-only terminal dispositions and the exact Chapter 4 transition.
- [x] Keep clocks empty and omit legacy progress/pressure/revelation arrays.
- [x] Run schema, evidence, reducer, linter, and scenario tests to GREEN.

## Task 3: Validate Spoilers, Reachability, and Failure-Forward Semantics

**Files:**

- Create: `tools/scripts/validate-ashes-v1-chapter-3.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Bind source identity to the exact package template and predecessor target without requiring a legacy mission graph.
- [x] Prove every core objective and terminal disposition is reachable.
- [x] Prove initial player surfaces contain none of the director-only truths or future-route spoilers.
- [x] Prove all voluntary custody decisions are exclusively user-owned and all successful results require observed outcome evidence.
- [x] Prove direct logs and alternate corroboration are distinct causal routes to the Demeris lead.
- [x] Prove loss, destruction, and withdrawal preserve forward progress without fabricating full relay evidence.
- [x] Validate every preferred and fallback reporter against the authoritative crew dataset.
- [x] Prove Wayward Sun and the compromised salvager are complications, not mandatory objectives or initial facts.

## Task 4: Register and Activate Chapter 3

**Files:**

- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `tools/scripts/test-bundled-package-registry.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`

- [x] Register Dead Letters after Open Orders I without inventing a mission graph.
- [x] Prove terminal Open Orders I changes from pending to ready only with the exact Chapter 3 definition.
- [x] Prove activation archives Open Orders once, creates a fresh Chapter 3 state, reloads cleanly, and preserves unrelated roots.
- [x] Prove duplicate activation is idempotent and no legacy pressure, revelation, progress, custody, or reaction state is copied into V1.
- [x] Prove terminal Dead Letters targets Chapter 4 but remains pending until Chapter 4 has an exact V1 definition.

## Task 5: Accepted-Pair, Report, and Source-Custody Proof

**Files:**

- Create: `tools/scripts/test-ashes-v1-chapter-3-runtime.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Prove varied player approach prose does not become access success before an observed result.
- [x] Prove user-only relay/archive choices cannot be made by assistant narration.
- [x] Prove selected assistant prose can settle several high-value observed claims into one mission aggregate.
- [x] Prove all three required facts are stripped without selected-swipe Duty Report custody.
- [x] Prove the single bounded Demeris report becomes eligible through direct or alternate evidence while mission state retains the actual route for future transition narration.
- [x] Prove destruction, loss, or withdrawal cannot retain facts that were never acquired.
- [x] Prove swipe/edit/delete causally rebuilds decisions, events, reports, results, closure, transition, and Story effects without a provider call.
- [x] Prove source mutation before and after Chapter 3 activation repairs Open Orders or prunes the Chapter 3 descendant.
- [x] Prove dead-letter message color and quiet ship scenes do not create mission evidence or unrelated tracker mutations.

## Task 6: Adversarial Review and Certification

**Files:**

- Create: `docs/development/ASHES_V1_DEAD_LETTERS_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/planning/ASHES_V1_MIGRATION_PLAN.md`
- Modify: this plan

- [x] Challenge initial plot giveaway, revelation checklist conversion, navigation railroad, privacy-as-binary morality, evidence teleportation, Starfleet-handshake attribution, Demeris-route fabrication, model self-certification, success-on-order, report spam, Wayward Sun mandatory drift, false urgency, single-check failure, optional blocking, mixed-outcome priority, actor identity, source mutation, package drift, and legacy Chapter 4 fallback.
- [x] Fix every Critical or Important non-UI finding.
- [x] Run focused suites, `git diff --check`, and the complete alpha gate.
- [x] Record deterministic proof and residual limitations without claiming narrator, UI, live rehearsal, Command Bearing, campaign-order scheduler, or complete Ashes readiness.
- [x] Commit the certification docs.

## Explicit Non-Goals and Stop Boundary

- Do not change player-facing UI, mission cards, objective rows, progress bars, urgency display, notifications, chat report presentation, or the send-tray Directive launcher.
- Do not inject V1 projections into narrator prompts or post transition narration into chat.
- Do not invent a legacy Dead Letters mission graph or rewrite the package quest template.
- Do not create a tracker row for every signal, message, hazard, location, salvage claim, access crystal, specialist, or revelation.
- Do not expose Pale Lantern, Farwatch, Rourke, Holt, the compromised Wayward Sun crew member, Demeris, or Mira Solenn before a causal disclosure route.
- Do not convert scene pressure into a mission clock without a real authored deadline.
- Do not grant Command Bearing from this slice.
- Do not claim campaign-level sibling-mission scheduling parity; keep Dead Letters internally reorderable while the campaign scheduler gap remains explicit.
- Do not activate Chapter 4 from legacy data.
- Stop and request explicit user approval only when implementation reaches an actual player-facing UI change.
