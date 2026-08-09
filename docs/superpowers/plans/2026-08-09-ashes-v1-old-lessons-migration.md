# Ashes V1: Old Lessons Migration Plan

> Status: implemented and deterministic-gate certified within the approved non-UI scope. UI, narrator cutover, open-world scheduling, Open Orders II migration, legacy retirement, and live certification remain incomplete.

**Goal:** Make `chapter-5-old-lessons` the seventh V1-native Ashes journey entry without revealing that Sigma-4 is the actual target, that Pale Lantern models familiar Starfleet doctrine, that Holt's cell began the diversion, or that the system expanded the operation before accepted play establishes those findings.

**Architecture:** Represent the chapter as three player-facing responsibilities: stabilize the crowded Orison battlespace, identify and resolve the operation's real objective, and establish a supported account of how the crisis was created. The legacy traffic, O-17, Sigma-4, Bronn, and Meridian checklist becomes causal evidence, hidden decisions/results, aggregate reports, and four deliberate outcome dimensions.

**Authority boundary:** The model interprets accepted prose against authored evidence standards. Deterministic validation owns facts, decisions, actual results, objective disposition, closure, and transition. An explicit Sigma disposition and explicit treatment of Bronn's recommendation are player-owned. Traffic control, platform control, authentication custody, capture, escape, damage, and recovered evidence are observed results; neither an order nor a player assertion can self-certify them.

**Identity boundary:** Old Lessons is an existing Ashes package quest with an empty legacy `missionGraph`. Bind the V1 definition to that exact package identity and the exact Colony transition target. Its source-authored successor is the second quiet interval, assigned the stable V1-only identity `open-orders-2-what-survives`; do not skip directly to Chapter 6 merely because the legacy package omitted the interval as a quest row.

**Campaign-order boundary:** The package allows Old Lessons after False Colors plus either Dead Letters or Colony and enough Pale Lantern facts. The current V1 journey remains linear through both Chapter 3 and Chapter 4 before Old Lessons. This slice records that scheduler limitation and does not simulate sibling availability with mission-local shortcuts.

**Implementation discipline:** Red-Green-Refactor. Lock initial spoiler safety, flexible multi-front order, crew-led contradiction, no-fault loss before knowledge, player/result separation, compact projection, exact activation, and source reconstruction before registration. Run the complete alpha gate before certification.

## Canonical V1 Distillation

### Initial player-safe state

The player initially knows only that:

- conflicting threat warnings have concentrated three civilian convoys and two Compact patrol craft in the Orison Gap;
- obsolete defenses are powering, a Starfleet authentication buoy is unresponsive, and Asterion command links are failing;
- one convoy accuses another of transmitting Cardassian military codes;
- the corridor is becoming crowded, armed, and unstable.

Initial projection must not reveal:

- Sigma-4 as the operation's actual objective;
- an extraction drone or authentication core;
- Pale Lantern's doctrinal modeling;
- Bronn's analogy as incomplete or predicted by the system;
- Holt's cell as the initiating actor;
- autonomous escalation beyond local intent;
- the Meridian's operator or portable interface;
- a hidden objective count, legacy percentage, or countdown.

### Core objectives

1. `Stabilize the Orison battlespace` - establish actual civilian-traffic and defense-platform outcomes, including clean control, cost, cascade, or responsible handoff.
2. `Find and resolve the operation's real objective` - discover the authentication target and establish actual Sigma-4 plus operator/evidence outcomes; direct failure may alter cost but cannot dead-end the campaign.
3. `Establish how the crisis was created` - receive the aggregate supported findings about traffic concentration, doctrine modeling, local initiation, autonomous expansion, and interface limits through direct or alternate evidence.

The convoys, O-17, Sigma-4, Asterion, Meridian, Bronn briefing, Rowan contradiction, Kieran maneuver, Imani warning, warning shot, and pursuit are fronts, scenes, sources, choices, or consequences. They are not separate progress bars.

### Aggregate facts and reports

1. `Concentration pattern and model gap` - the warnings were designed to concentrate traffic; Bronn's Mendora analogy is relevant but incomplete.
2. `Sigma target and doctrine model` - Sigma-4's authentication bridge is the actual technical objective, and the operation predicts familiar Starfleet doctrine rather than merely forging messages.
3. `Holt initiation and autonomous escalation` - Holt's cell initiated the diversion, the network expanded the operation and defense-platform activation beyond local intent, and a portable interface cannot simply command the whole system.

Each fact receives one required aggregate Duty Report. Direct routes include traffic telemetry, platform behavior, buoy diagnostics, maintenance-drone traces, Meridian interception, and operator/interface evidence. Alternate routes include civilian sensor meshes, Asterion logs, Compact patrol records, destroyed-device residue, captured transmissions, and later corroboration. Losing Sigma-4 or the Meridian changes evidence route and consequence; it does not permit the next mission to depend on a hidden guess.

### Hidden results and concise dimensions

Track hidden authoritative outcomes for:

- civilian traffic: stabilized, stabilized with cost, cascade, or handed off;
- platform O-17: controlled, disabled, fired with damage, remains hazardous, or handed off;
- optional player Sigma decision: recover/isolate, destroy with record, destroy without record, knowingly deprioritize, or hand off;
- actual Sigma result: secured, destroyed with record, destroyed without record, core taken, or handed off;
- operator/evidence result: operator captured, interface recovered, identified escape, unidentified escape, evidence destroyed, or handoff;
- evidence route: direct, mixed, or external reconstruction;
- optional player command posture toward Bronn's model: integrate and test, follow without testing, choose an evidence-based alternative, dismiss without testing, or publicly humiliate.

Project only four aggregate dimensions:

- Orison safety, derived from traffic and platform results;
- authentication custody, derived from Sigma-4's actual result;
- operator/evidence disposition;
- command posture, only when an explicit player-owned posture is recorded.

Bronn's command posture is a rare potentially significant character moment, not a required mission objective. Its absence cannot hang closure. Any later relationship projection must be sourced from the recorded posture and accepted story outcome rather than from ordinary dialogue volume.

### Fairness and no-fault policy

The chapter must not punish the player for following a substantially correct senior officer before contradictory evidence is available. If Sigma-4 is lost before its true importance is known or before an explicit target disposition, record a serious cost, not `failedAfterInformedAction`.

An informed failure is reserved for a narrow explicit choice such as knowingly deprioritizing the disclosed authentication target or destroying it without preserving a usable record, followed by the corresponding adverse result. A reasonable informed attempt that fails operationally remains mixed success or cost, not moral blame.

Bronn's advice is neither automatically right nor automatically wrong. Integrating and testing it can strengthen trust; following it without revision can still save lives while losing the core; an evidence-based alternative can succeed without being disrespectful; dismissal or humiliation requires explicit player prose and cannot be inferred from choosing another tactic.

### Closure and terminal dispositions

Close only when all three required objectives have terminal dispositions. Safety requires both traffic and platform outcomes. Operation resolution requires both Sigma and operator/evidence outcomes. Understanding requires all three discoverable aggregate facts plus an evidence-route result.

Target terminal dispositions:

- `multiFrontSuccess`;
- `livesSavedCoreLost`;
- `coreSavedAtCost`;
- `partialContainmentForward`;
- `responsibleHandoff`;
- `cascadeForward`.

All continue to `open-orders-2-what-survives`. Transition narration carries only actual known safety, authentication, evidence, and command-posture results and frames the interval as repair, review, and recovery. It must not skip directly to Farwatch, Rourke, current Starfleet credentials, or Chapter 6 before the interval establishes them.

### Clock policy

Old Lessons defines no mission clock. The source says extraction, platform escalation, traffic panic, and requests occur during the crisis but supplies no concrete player-known deadline, advancement authority, or time value. These are causal fronts and observed outcomes, not an invented `minutes remaining` display. A future authored clock would require an explicit revealed deadline and consequence contract.

## Implementation Tasks

### Task 1: Lock the mission contract in RED

- [x] Create `tests/fixtures/mission/v1/chapter-5-old-lessons-scenarios.fixture.json`.
- [x] Create `tools/scripts/test-ashes-v1-chapter-5-mission.mjs` and register it in the alpha gate.
- [x] Assert exact package/Colony identity, empty legacy graph, spoiler-safe opening, three objectives, three reports, four dimensions, no clock, and the V1-only Open Orders II target.
- [x] Cover clean multi-front success, lives saved/core lost before knowledge, core saved with civilian or political cost, cascade, partial containment, responsible handoff, and informed destructive action.
- [x] Cover non-linear fronts, no command-posture dependency, same-scene related results, direct/mixed/external evidence, source-role violations, premature report, stale revision, wrong swipe, and unsupported controller attribution.
- [x] Run RED because the definition is absent.

### Task 2: Author and validate the V1 definition

- [x] Create `packages/bundled/breckenridge/v1/chapter-5-old-lessons.mission-v1.json`.
- [x] Add one known crisis fact, three discoverable aggregate facts, three causal evidence events, and three required Duty Reports.
- [x] Add hidden traffic, platform, Sigma, operator/evidence, evidence-route, and optional command-posture authority.
- [x] Keep voluntary Sigma and Bronn choices user-only; keep actual results assistant/runtime/adjudicator-owned.
- [x] Add three required objectives, four aggregate dimensions, six terminal dispositions, no clock, and the exact Open Orders II transition.
- [x] Create `tools/scripts/validate-ashes-v1-chapter-5.mjs` and register it in the alpha gate.

### Task 3: Register, activate, and prove source custody

- [x] Register Old Lessons after Colony without creating or importing a legacy mission graph.
- [x] Extend the journey proof through exact Colony-to-Old-Lessons activation, reload, idempotency, descendant pruning, and Open Orders II pending state.
- [x] Create `tools/scripts/test-ashes-v1-chapter-5-runtime.mjs` for accepted-pair, Duty Report custody, batching, anti-spam, invalidation, and restoration proof.
- [x] Preserve all unrelated legacy and V1 domain roots.

### Task 4: Adversarial review and certification

- [x] Challenge the spoiler summary, five-objective checklist, multi-front coupling, tactical railroading, Bronn blame, no-fault target loss, assistant-owned player choices, self-certified results, evidence single points of failure, false urgency, relationship spam, terminal priority, V1-only successor identity, package drift, source repair, and live semantic uncertainty.
- [x] Fix every Critical or Important non-UI finding.
- [x] Run focused suites, docs contracts, `git diff --check`, and the complete alpha gate.
- [x] Create `docs/development/ASHES_V1_OLD_LESSONS_READINESS.md`, update the documentation index and Ashes migration plan, and record residual limits without claiming UI, narrator, scheduler, legacy cutover, Command Bearing, or live certification.

## Explicit Non-Goals and Stop Boundary

- Do not change player-facing UI, mission cards, objectives, progress bars, urgency, notifications, chat report presentation, or the send-tray Directive launcher.
- Do not inject V1 projections into narrator prompts or post transition narration into chat.
- Do not rewrite the legacy Old Lessons quest or invent a legacy mission graph.
- Do not expose Sigma-4 as the target, doctrinal modeling, Holt initiation, autonomous escalation, or interface limits before causal reports.
- Do not require one tactical plan, one scene order, one named scan, one pursuit result, or one treatment of Bronn.
- Do not turn every convoy, platform event, officer recommendation, ship strain, or warning into a tracker.
- Do not create a countdown from dramatic pressure.
- Do not grant Command Bearing in this slice.
- Do not claim campaign-level sibling scheduling parity.
- Do not skip the source-authored Open Orders II interval or activate it through legacy fallback.
- Stop and request explicit user approval only when implementation reaches an actual player-facing UI change.
