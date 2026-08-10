# Ashes V1: A Peace of Their Own Migration Plan

> Status: approved implementation work under the standing V1 architecture scope. This plan covers non-UI content, deterministic authority, and the missing authoritative-time bridge; it does not authorize UI or narrator-prompt changes.

**Goal:** Make `chapter-7-a-peace-of-their-own` the tenth V1-native Ashes journey entry while preserving open constitutional negotiation, shared manipulation, civilian stakes, and a real task-group deadline without reproducing five percentage objectives, seven revelation rows, or every faction demand as trackers.

**Identity:** Bind the V1 definition to the existing package quest `chapter-7-a-peace-of-their-own`, its empty legacy mission graph, the exact Chapter 6 transition target, and package version `0.3.0-pre-alpha.1`. Its exact successor is the source-authored V1-only interval `open-orders-3-before-the-lamps-go-out`; do not skip directly to Chapter 8 or add a duplicate legacy quest row.

**Scheduler boundary:** The legacy package can make Chapter 7 available through broader Colony/Old Lessons/Compact-Unity prerequisites. The current V1 journey reaches it only through terminal Chapter 6. Do not import the legacy availability rule as parallel authority or claim that package-level sibling scheduling is solved by this mission slice.

## Player-Safe Opening

Initially show:

- Compact occupation of Annex Six and the announced oversight, reconstruction, hearing, humanitarian, and facility-control demands;
- Tolland's order to restore Federation control and prevent military-system transfer;
- Captain Joelle Mercer, the approaching task group, and her authority if the situation becomes openly hostile;
- an approximately thirty-six-hour arrival window;
- three responsibilities: stabilize the standoff, establish shared political/technical truth, and produce an actual command settlement.

Do not initially reveal:

- that Kessler entered primarily to restrain Holt;
- the occupation's three internal factions;
- the portable Pale Lantern interface;
- manipulated telemetry on either side;
- Holt's intended demonstration;
- which Compact demands have broad support and which emergency powers lack review;
- a hidden objective count or progress percentage.

The Compact is not labeled a rebellion and Starfleet restoration is not presented as the default moral answer.

## Authoritative-Time Prerequisite

Chapter 7 has a real authored deadline. The task group arrives in approximately thirty-six hours, the player knows this at opening, and arrival materially changes leverage and tactical authority. V1 must therefore use one visible countdown clock rather than a generic urgency label.

The current campaign-time pipeline already commits accepted scene time through `directive.timeBoundary.v1` records. Mission definitions already authorize `timeAdvanced` claims and the deterministic reducer already advances, resolves, expires, and reconstructs clocks. The missing link is runtime materialization: accepted-pair settlement currently does not convert the matching committed time boundary into authoritative mission evidence.

Implement a general bridge with these constraints:

- read only the time boundary matching the accepted scene's current player message or exact source range;
- materialize time only for active clocks whose `advanceSources` accepts `authoritativeStoryTime` or the boundary's authored source/type/reason;
- convert elapsed minutes into supported clock units without rounding away real elapsed time;
- use a distinct runtime/adjudicator contribution with source custody tied to the same scene boundary;
- include that contribution in Story Settlement provenance without creating a visible semantic tracker;
- deduplicate replay by boundary, clock, and evidence key;
- invalidate the mission time contribution when the source player message is edited, deleted, or its accepted pair is rebuilt;
- never let assistant or user prose directly authorize clock advancement;
- fail closed for unsupported units, missing boundaries, stopped clocks, malformed time, or unauthorized policies.

The Chapter 7 clock starts visible at thirty-six hours. Expiry produces one hidden `task-group-arrived` event and does not automatically fail or close the mission. A settlement reached earlier resolves the clock. Chapter 7 remains playable after arrival, including armed stand-down, coercive restoration, Compact control, fragmentation, and open-conflict routes.

## Minimal Mission Authority

Use three required objectives:

1. **Stabilize the Annex standoff** — establish the actual security and civilian result, including failure-forward conflict.
2. **Establish shared truth and interface control** — make both the political-legitimacy account and mutual telemetry manipulation player-known, then establish the interface's actual disposition.
3. **Establish legitimate command arrangements** — record the actual settlement, Annex/defense control, and coalition/task-group posture.

The five legacy objective rows collapse into these responsibilities. Individual demands, concessions, weapons locks, protests, life-support faults, forged orders, boarding moves, and negotiation scenes remain causal story material unless they establish one of the aggregate results.

## Aggregate Truth and Alternate Routes

### Political legitimacy and faction account

One required Duty Report establishes that Kessler entered to restrain Holt, facility personnel and negotiators do not share every hardline goal, some Compact demands have broad democratic support, and other emergency powers never received public review.

The account may be established through direct negotiation and testimony, civilian/public records, or independent mediator and legal review. Kessler, Holt, or one public scene is not a single point of failure.

### Interface and mutual manipulation

One required urgent Duty Report establishes that Holt has a portable Pale Lantern interface, it is showing manipulated task-group telemetry, the task group receives similarly manipulated annex reports, and Nightfall can exploit weapons locks, boarding attempts, or communications cutoffs.

The account may be established through shared live telemetry, technical isolation or capture of the interface, or cross-system reconstruction. Seizing the device is not the only truth route, and destroying it does not prove the wider network is gone.

## Open Proposals, Choices, and Results

Record only three high-value player choices:

- the player's explicit crisis posture toward negotiation, interposition, bounded enforcement, covert intervention, withdrawal, or responsible handoff;
- the player's informed interface/telemetry response after the manipulation report;
- the player's concrete settlement framework after the political-legitimacy report.

The settlement classifier must include an `otherConcreteFramework` escape value so enforceable freeform arrangements are not rejected merely because the author did not enumerate them. Story Settlement preserves the exact terms; deterministic mission authority records only the broad framework and the actual observed result.

Choices remain distinct from results. The model/world owns actual standoff state, civilian harm, interface custody, settlement, Annex/defense control, and coalition/task-group posture. Proposed terms are evaluated through depicted legality, enforceability, participation, and immediate security rather than exact wording. Negotiation, referendum, Federation safeguards, Compact autonomy, bilateral coordination, withdrawal, seizure, disclosure, and force are not automatically good or bad.

Conflict or casualties before the player learns of mutual manipulation record cost without inventing informed blame. The mission remains playable after a reasonable but unsuccessful choice, after the task group arrives, or after shots are exchanged.

Crew and relationship consequences remain Story Settlement/People material when significant. They do not become separate mission rows for every Whitaker, Kieran, Priya, Bronn, Rowan, Miriam, Imani, Kessler, Holt, or Mercer reaction.

## Projection and Closure

Expose five aggregate dimensions only:

- constitutional settlement and command legitimacy;
- Annex and regional-defense control;
- interface custody and shared telemetry truth;
- civilian safety and violence;
- coalition/task-group posture, including whether Kessler, Holt, and Mercer can sustain the result.

Close only when all three required responsibilities have actual terminal dispositions. A proposal, concession, report, task-group arrival, interface seizure, weapons freeze, public statement, or single successful check cannot close the mission.

Use failure-forward terminal dispositions grounded in the source and package outcomes:

- provisional accord;
- armed stand-down;
- Federation restoration;
- Compact control;
- fragmented authority;
- open conflict;
- responsible handoff for mixed states not captured above.

Open conflict outranks all political labels. Coercive control cannot be projected as a provisional accord merely because a charter was proposed. All dispositions continue to Open Orders III with exact recorded costs.

## Transition, Command Bearing, and Anti-Spam

After closure, transition setup communicates the coordinated Nightfall tests against evacuation routes, defense controls, Starfleet challenge codes, Compact alerts, and Cardassian relief transponders. It establishes why repairs, legal consultation, political approval, and distributed command preparation create a final short interval.

Do not initially or transitionally reveal Chapter 8's exact activation sequence, hidden network behavior, or an author-expected finale solution. Do not claim the local interface's destruction ended Nightfall.

No Command Bearing award or spend is added in this slice. The source's Inspiration/Resolve examples remain intent until the neutral reserve has a complete authored award contract.

An incidental protest rumor, one forged alert, a light-support fault, a weapons-track mention, or one faction demand must not create a ship issue, relationship moment, thread, quest, or extra mission tracker.

## Implementation Tasks

### Task 1: Authoritative-time bridge

- [x] Create a RED runtime contract proving a matching committed time boundary advances a running V1 clock even when semantic interpretation abstains.
- [x] Prove fractional unit conversion, replay idempotency, source mutation rewind, restoration epoch, stopped-clock behavior, missing/mismatched boundary behavior, and assistant/user time-authority rejection.
- [x] Implement the bounded time-boundary-to-mission-evidence bridge and register its contract in the alpha gate.

### Task 2: Chapter 7 RED contract

- [ ] Create `tests/fixtures/mission/v1/chapter-7-peace-of-their-own-scenarios.fixture.json`.
- [ ] Create `tools/scripts/test-ashes-v1-chapter-7-mission.mjs` and register it in the alpha gate.
- [ ] Assert exact package/Chapter 6 identity, empty legacy graph, V1-only Open Orders III target, spoiler-safe opening, three objectives, two reports, five dimensions, one fair clock, alternate truth routes, open proposals, non-linear play, pre-knowledge cost, expiry-without-auto-failure, mixed outcomes, and hostile source/revision cases.

### Task 3: Definition and validator

- [ ] Create `packages/bundled/breckenridge/v1/chapter-7-a-peace-of-their-own.mission-v1.json`.
- [ ] Add one known opening fact, two discoverable aggregate facts, one task-group-arrival event, three player-owned choices, world-owned routes/results, three required objectives, five dimensions, seven terminal dispositions, and the real thirty-six-hour clock.
- [ ] Create `tools/scripts/validate-ashes-v1-chapter-7.mjs` and register it in the alpha gate.

### Task 4: Registry, runtime, and journey

- [ ] Register Chapter 7 after Chapter 6 without importing its empty legacy graph or broad legacy availability rule.
- [ ] Prove exact activation, initial visible clock, authoritative advancement, expiry, settlement-before-expiry resolution, reload, idempotency, legacy-root isolation, Open Orders III pending state, journey-wide identity, and source-mutation descendant pruning.
- [ ] Create `tools/scripts/test-ashes-v1-chapter-7-runtime.mjs` for accepted-pair batching, report custody, freeform-framework classification, pre-knowledge conflict fairness, anti-spam, invalidation, restoration, and time custody.

### Task 5: Adversarial review and certification

- [ ] Challenge Compact-as-rebels framing, Starfleet-as-default framing, Kessler/Holt flattening, Mercer caricature, proposal-as-success, charter railroading, interface single points of failure, pre-knowledge blame, clock per-turn drift, deadline auto-failure, post-expiry dead ends, report spam, persistent-consequence bloat, terminal priority, package drift, and live semantic uncertainty.
- [ ] Fix every Critical or Important non-UI finding, run focused and full gates, then create the readiness record and update the documentation index and Ashes migration plan.

## Explicit Non-Goals and Stop Boundary

- No UI, narrator prompt, notification, urgency styling, or chat-presentation changes.
- No generic countdown formatting redesign; store correct authoritative time and leave its eventual display treatment to the UI approval boundary.
- No legacy quest rewrite or mission graph.
- No package-level sibling scheduler claim.
- No automatic success from negotiation, Federation compliance, Compact recognition, arrest, seizure, disclosure, referendum, or force.
- No automatic failure from task-group arrival, conflict, temporary withdrawal, fragmentation, or a reasonable action taken before hidden manipulation is known.
- No per-turn clock decrement and no model-owned elapsed time.
- No Command Bearing mechanics in this slice.
- Stop only before an actual player-facing UI or narrator-prompt change.
