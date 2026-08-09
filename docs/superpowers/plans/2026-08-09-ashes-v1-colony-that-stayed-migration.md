# Ashes V1: The Colony That Stayed Migration Plan

> Status: implemented and deterministic-gate certified within the approved non-UI scope. Player-facing UI, narrator-prompt cutover, open-world scheduling, Old Lessons migration, legacy retirement, and live certification remain outside this completed mission slice.

**Goal:** Make `chapter-4-the-colony-that-stayed` the sixth V1-native Ashes journey entry without telling the player why Demeris survived, what Mira Solenn did, whether Starfleet broke its evacuation commitment, who else received interface access, or what accountability outcome is correct before accepted play establishes those facts and choices.

**Architecture:** Represent the chapter as three player-facing responsibilities: establish a workable and safe process under contested jurisdiction, establish the strongest supportable historical and technical account, and resolve personal accountability plus technical custody. The old archive, workshop, evacuation, Solenn, disclosure, and accountability checklist becomes causal evidence, aggregate reports, decisions, results, and dimensions rather than five simultaneous progress bars.

**Authority boundary:** The model interprets accepted prose against authored evidence standards. Deterministic validation owns evidence, facts, decisions, observed results, objective disposition, closure, and transition. Process posture, Solenn disposition, and interface custody are exclusively player-sourced when voluntary. Assistant prose can establish what process actually formed and what happened to people or evidence, but it cannot choose legal or ethical policy for the player.

**Identity boundary:** The Colony That Stayed is an existing Ashes package quest template with an empty legacy `missionGraph`. Bind the V1 definition to that exact package identity, the exact Dead Letters target, and the exact `chapter-5-old-lessons` successor. Do not invent a legacy graph, import incremental progress, or create another quest row.

**Campaign-order boundary:** The source package permits Dead Letters and The Colony That Stayed as sibling opportunities after False Colors and allows Old Lessons after either when enough campaign facts exist. The current V1 journey reaches Colony after Dead Letters and then Old Lessons. This slice records that linear scheduler limitation explicitly and keeps Colony evidence/result semantics independent of whether a future scheduler offers it before or after Dead Letters.

**Implementation discipline:** Red-Green-Refactor. Lock spoiler safety, fair discovery, no-fault loss, coupled final choices, report custody, mixed outcomes, exact activation, and source reconstruction in failing fixtures before registration. Run the complete alpha gate before certification.

## Canonical V1 Distillation

### Initial player-safe state

The player initially knows that:

- the Demeris traffic lead identifies Mira Solenn but does not prove her conduct;
- Demeris refuses Starfleet searches or arrests and protects Solenn;
- Governor Marr offers testimony through a negotiated public inquiry and asks for the colony's unanswered wartime records;
- Starfleet, the Compact, and Cardassian witnesses assert competing legitimate interests.

Initial projection must not reveal:

- Solenn's Pale Lantern access or specific uses;
- the diverted evacuation convoy as established truth;
- forged clearances, the detained freighter, or the two deaths;
- concealment from Governor Marr;
- Compact Security access or another device;
- Holt's agents, the hidden portable interface, or a wider controller;
- a required legal answer, hidden revelation count, or legacy percentage.

### Core objectives

1. `Establish a workable process under contested jurisdiction` - create, compel, expose, hand off, or fail to create a process whose legitimacy and safety consequences are recorded.
2. `Establish what the Demeris evidence supports` - receive aggregate, causally grounded findings about wartime survival, Solenn's use and harm, and continuing access; distinguish proof from inference and controller attribution.
3. `Resolve personal accountability and technical custody` - separately establish what happens to Solenn and to the interface/evidence after informed player choices or a documented no-fault handoff/loss.

The civic hall, archive, workshop, clinic, public forum, crowd, witness, survivor, altered record, seizure order, covert search, and theft attempt are scenes, approaches, evidence sources, or consequences. They are not separate objectives.

### Aggregate facts and reports

1. `Demeris survival and evacuation record` - the colony survived through a coercive but life-preserving Cardassian civilian arrangement, and the promised Federation evacuation convoy was genuinely redirected by a wartime command decision rather than fabricated by the local interface.
2. `Solenn use, benefit, and harm` - Solenn used a dormant Pale Lantern interface to find relief and redirect supplies, expanded into forged clearances, saved lives, caused a freighter detention in which two people died, and concealed that downstream harm.
3. `Continuing access and next-crisis route` - Solenn later shared limited access with Compact Security, another access device exists, and a requested Orison response scenario supplies the bounded next lead without proving local control of the distributed network.

Each fact has one required aggregate Duty Report. Primary routes include Demeris archives, Solenn testimony, the workshop interface, the public inquiry, and Starfleet records. Alternate and failure-forward routes include Cardassian records, the freighter survivor, interface residue, Compact records, and later operator evidence. An uncooperative or absent Solenn changes route and cost; it does not erase campaign-critical knowledge.

### Process, evidence route, and final dispositions

Track three user decisions and their actual results:

- process posture: joint inquiry, conditional local jurisdiction, compelled Starfleet authority, covert search, or responsible withdrawal;
- Solenn disposition: restorative proceedings, local trial, Starfleet custody, conditional immunity/cooperation, or protected local cooperation;
- interface custody: shared oversight, local seal, Starfleet custody, destruction with a preserved record, or destruction without one.

Track observed results separately:

- actual process: joint public inquiry, local protected inquiry, Starfleet seizure, exposed covert recovery, responsible handoff, or collapse;
- evidence route: direct inquiry, mixed corroboration, or external reconstruction;
- Solenn result: restorative process, local proceedings, Starfleet custody, cooperative protection, handed-off local status, or escape/unavailability;
- interface result: shared secure custody, local secure custody, Starfleet secure custody, destruction with record, destruction without record, handed-off local custody, or loss/seizure.

Voluntary choices are user-only. Favorable or costly results require later accepted assistant prose depicting what actually happened. Withdrawal and process collapse may allow Demeris or another authority to act autonomously; those outcomes are observed handoff/loss, not fabricated player decisions.

### Outcome dimensions and closure

Project only four aggregate dimensions:

- process legitimacy and safety;
- evidence quality/route;
- Solenn's status;
- interface/evidence custody.

Close only when all three objectives have authored terminal dispositions. Evidence may arrive in any causal order. The final Solenn and interface choices may be expressed in one player message because their policies are independent once the facts are known. Choices alone do not close the mission; both actual results are required.

Target terminal dispositions:

- shared accountability;
- lawful local resolution;
- Starfleet control at legitimacy cost;
- covert truth at cost;
- responsible handoff;
- fractured accountability forward.

All continue to `chapter-5-old-lessons`. Transition authority carries the actual public/process, evidence, Solenn, and interface results and introduces the Orison crisis only through the player-known continuing-access report.

### Fairness and no-fault policy

`failedAfterInformedAction` requires:

- the player knows the relevant Solenn/interface facts;
- the player made at least one final voluntary disposition choice; and
- the actual person or interface result escaped accountable control.

If Solenn escapes, the interface is seized, or the process collapses before an informed final choice, record `completedWithCost` or `handedOff`, not player failure. Later reports may explain the consequence but cannot retroactively assign blame.

### Clock policy

The Colony That Stayed defines no mission clock. Tolland's seizure order, a gathering crowd, a witness's fear, an attempted theft, and public anger are pressures or events unless a later authored scene supplies a concrete player-known deadline, advancement authority, expiry, and consequence.

## Task 1: Lock the Contract in Failing Tests

**Files:**

- Create: `tools/scripts/test-ashes-v1-chapter-4-mission.mjs`
- Create: `tests/fixtures/mission/v1/chapter-4-colony-that-stayed-scenarios.fixture.json`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Assert the absent definition, exact package quest, empty legacy mission graph, Dead Letters predecessor, package binding, minimal objectives, and Old Lessons target.
- [x] Assert the initial projection contains only the Demeris jurisdiction dispute and three spoiler-safe responsibilities.
- [x] Assert no legacy progress, pressure, revelation, event-template, or synthetic clock enters V1.
- [x] Assert exactly three aggregate discoverable facts/reports and four outcome dimensions.
- [x] Add shared inquiry, local protection, Starfleet seizure, covert recovery, responsible withdrawal, process collapse, and flight/destruction scenarios.
- [x] Add non-linear report order, same-message final choices, no-fault loss-before-choice, and alternate reconstruction scenarios.
- [x] Add hostile cases for process intent as result, final choice before knowledge, assistant-owned legal choice, player-declared observed result, premature report, unsupported attribution, stale revision, wrong swipe, and unknown policy.
- [x] Run the new test and record RED because the definition is absent.

## Task 2: Author the V1 Mission Definition

**Files:**

- Create: `packages/bundled/breckenridge/v1/chapter-4-the-colony-that-stayed.mission-v1.json`

- [x] Add one initially known jurisdiction/claims fact and three discoverable aggregate facts.
- [x] Add three causal evidence-acquisition events whose standards accept direct and alternate sources without accepting plans or guesses.
- [x] Add user-only process, Solenn, and interface decisions with separate assistant-observed results.
- [x] Add an aggregate evidence-route result so direct, mixed, and external truth remain distinct without extra objectives.
- [x] Add three required objectives and four dimensions.
- [x] Add three required report routes with exact crew IDs and Whitaker fallback.
- [x] Add six failure-forward terminal dispositions and exact Old Lessons transition.
- [x] Keep clocks empty and omit legacy progress/pressure/revelation arrays.

## Task 3: Validate Fair Discovery and Legal Neutrality

**Files:**

- Create: `tools/scripts/validate-ashes-v1-chapter-4.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Bind exact package, predecessor, and successor identity.
- [x] Prove every required objective and terminal disposition is reachable.
- [x] Prove initial player surfaces reveal no hidden Solenn action, evacuation truth, deaths, continuing access, or controller attribution.
- [x] Prove all voluntary legal/custody decisions are exclusively user-owned and no legal answer is structurally privileged as universally correct.
- [x] Prove all required facts survive Solenn refusal, escape, evidence loss, or withdrawal through causal alternate routes.
- [x] Prove loss before an informed final choice is not `failedAfterInformedAction`.
- [x] Validate reporter identities and required Duty Report custody.
- [x] Prove Holt agents and the hidden interface are complications, not mandatory objectives or initial facts.

## Task 4: Register and Activate Chapter 4

**Files:**

- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `tools/scripts/test-bundled-package-registry.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`

- [x] Register Colony after Dead Letters without inventing a mission graph.
- [x] Prove terminal Dead Letters changes from pending to ready only with the exact Chapter 4 definition.
- [x] Prove activation archives Dead Letters once, creates fresh Chapter 4 state, reloads, and preserves unrelated roots.
- [x] Prove duplicate activation is idempotent and legacy jurisdiction, pressure, revelation, and progress state is not copied.
- [x] Prove terminal Chapter 4 targets Old Lessons but remains pending until Old Lessons has an exact V1 definition.

## Task 5: Accepted-Pair, Report, and Source-Custody Proof

**Files:**

- Create: `tools/scripts/test-ashes-v1-chapter-4-runtime.mjs`
- Modify: `tools/scripts/test-ashes-v1-mission-handoff.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

- [x] Prove process intent/order is not the observed process result.
- [x] Prove one player message can record both informed Solenn and interface choices without causal rejection.
- [x] Prove selected assistant prose can settle both final observed results into one aggregate source contribution.
- [x] Prove required facts are stripped without selected-swipe report custody and each delivered report visibly communicates its bounded claim.
- [x] Prove quiet political/color dialogue creates no mission evidence or unrelated relationship/thread tracker spam.
- [x] Prove source mutation reopens closure, removes stale results and transition, and advances custody epoch on restoration.
- [x] Prove mutation before/after Chapter 4 activation repairs Dead Letters or prunes the Chapter 4 descendant without a provider call.

## Task 6: Adversarial Review and Certification

**Files:**

- Create: `docs/development/ASHES_V1_COLONY_THAT_STAYED_READINESS.md`
- Modify: `docs/DOCUMENTATION_INDEX.md`
- Modify: `docs/planning/ASHES_V1_MIGRATION_PLAN.md`
- Modify: this plan

- [x] Challenge initial spoilers, predetermined legal morality, five-objective checklist conversion, process-as-success, testimony dependence, Solenn-as-single-point-of-failure, evacuation-record teleportation, public-hearing railroad, Starfleet seizure as automatic failure, local protection as automatic success, hidden-interface objective drift, report spam, false urgency, no-fault loss, coupled-choice batching, mixed-outcome priority, actor identity, source repair, package drift, open-world scheduler overclaim, and legacy Old Lessons fallback.
- [x] Fix every Critical or Important non-UI finding.
- [x] Run focused suites, docs contracts, `git diff --check`, and the complete alpha gate.
- [x] Record deterministic proof and residual limits without claiming narrator, UI, live rehearsal, Command Bearing, open-world scheduler parity, or complete Ashes readiness.
- [x] Commit certification docs.

## Explicit Non-Goals and Stop Boundary

- Do not change player-facing UI, mission cards, objectives, progress bars, urgency, notifications, chat report presentation, or the send-tray Directive launcher.
- Do not inject V1 projections into narrator prompts or post transition narration into chat.
- Do not invent a legacy Colony mission graph or rewrite its package quest.
- Do not expose the evacuation truth, Solenn's actions, freighter deaths, Compact access, another device, Holt agents, or the Old Lessons setup before a causal report.
- Do not declare prosecution, immunity, local jurisdiction, public disclosure, classification, seizure, or shared custody the universal moral answer.
- Do not convert every witness, record, hearing event, crowd response, or location into a tracker.
- Do not create a clock without a concrete player-known deadline.
- Do not grant Command Bearing in this slice.
- Do not claim campaign-level sibling scheduling parity.
- Do not activate Old Lessons through legacy data.
- Stop and request explicit user approval only when implementation reaches an actual player-facing UI change.
