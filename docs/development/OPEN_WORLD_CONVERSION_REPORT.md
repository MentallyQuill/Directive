# Open-World Conversion Report

## Scope

This pre-alpha change is a total conversion from the linear campaign contract to schema version 2. No legacy package or save compatibility layer is included.

## Phase 1: Architecture contract

Completed:

- Defined package/save ownership.
- Split world, quest, tactical, thread, reaction, story-arc, and context responsibilities.
- Defined event-boundary transaction order.
- Defined hidden-information and prompt-audience invariants.
- Documented systemic and tactical quest paths.

Primary document: `docs/architecture/OPEN_WORLD_CAMPAIGN_ARCHITECTURE.md`.

## Phase 2: Schema version 2

Completed schemas:

- World, routes, locations, factions, actors, fronts, clocks, and tracks.
- Declarative predicates and effects.
- Story arcs, milestones, convergence rules, and ending axes.
- Quest templates and concurrent quest ledger.
- Reaction rules.
- Thread templates.
- Director cards.
- Context policy and generated context plan.
- Campaign state projection.
- Tactical mission graph version 2.

The root package spine no longer contains `mainCampaign`, `sideMissionRules`, or `missionTemplates`.

## Phase 3: Runtime state and Director Coordinator

Completed:

- World, story arc, quest, knowledge, thread, event, and attention ledgers.
- Quest opportunity selection, delegation, explicit resolution, and availability reconciliation.
- World travel and elapsed-time advancement.
- Event cascades and world effects.
- Milestone reconciliation and one-shot convergence effects.
- Runtime public APIs for open-world operations.

## Phase 4: Open-world vertical slice

Completed executable slice:

- A Ship Underway begins in transit.
- Completion makes The Empty Convoy and early side work available.
- Player can choose local or remote work.
- Travel advances time and triggers world processing.
- A side quest may be delegated where allowed.
- World fronts can advance while another quest is foregrounded.
- Context is rebuilt from current salience after every boundary.

## Phase 5: Context Orchestrator

Completed:

- Audience-specific candidate retrieval.
- Four depth tiers.
- Total and per-tier token budgets.
- Salience scores, mandatory blocks, repeat penalties, and omission diagnostics.
- Dynamic inclusion of active quest, location, actors, pressures, facts, threads, events, fronts, arc orientation, and earned assets.
- Hard rejection of Director-only blocks in narrator prompt conversion.
- Schema-v2-only prompt builder and prompt revision tracking.

## Phase 6: Narrative Thread Engine

Completed modules:

- Scene delta extraction.
- Deterministic candidate prefilter.
- Scout proposal contract.
- Curator and bandwidth selection.
- Activation.
- Closure.
- Side-assignment promotion.
- Package-authored seed instantiation.

Generated thread proposals require source evidence and pass deterministic validation before ledger mutation.

## Phase 7: Ashes of Peace reauthoring

Completed package data:

- 12 structured locations and travel routes.
- 6 factions and 10 recurring regional actors.
- 5 fronts, clocks, and 5 hidden campaign tracks.
- 4 story arcs with milestone and convergence rules.
- 19 authored quests: Prelude, eight main quests, epilogue, and nine designed side quests.
- 14 thread templates.
- 21 reaction rules.
- 45 Director cards.
- Fixed-interval side work converted to standing open-world quest work.
- Finale and epilogue unlocked by state predicates rather than fixed succession.

## Phase 8: Reactions, UI, and hardening

Completed:

- Offscreen world-reaction passes at meaningful boundaries.
- Quest delegation and explicit authored outcomes.
- Region, quest journal, and Open Threads view models.
- Save metadata for location, foreground quest, and world stardate.
- Package, projection, tactical graph, context safety, reaction, thread, UI, runtime, and vertical-slice tests.
- Schema and source syntax validation in the active pre-alpha gate.

## Known pre-alpha boundary

Only the first three main quests have bespoke tactical mission graphs. All other quests are fully usable through the systemic quest path but do not yet have authored phase graphs, pressure cadence, or graph-specific decision-point state deltas. This is intentional schema separation, not a campaign ordering dependency.
