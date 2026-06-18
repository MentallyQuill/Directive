# Pre-Production Roadmap

## Purpose

This roadmap defines the remaining pre-production work before Directive should move into a broad runtime implementation. It sits between the high-level design docs and the code-facing development sequence.

Pre-production is complete when Directive has buildable contracts for the bundled Breckinridge/Ashes of Peace package, the first campaign-state projection, the prelude mission graph, the Mission Director transaction interfaces, senior crew dossiers, command mechanics, and the package loader plan.

## Current Baseline

Already established:

- Extension identity: `directive`.
- Version target: `0.1.0-pre-alpha.1`.
- First bundled starship package: U.S.S. Breckinridge.
- First campaign: `Ashes of Peace`.
- Opening stardate: `53049.2`.
- Package transport: `.directive-starship.zip`.
- Package JSON spine: `manifest`, `ship`, `crew`, `characterCreation`, `mainCampaign`, `sideMissionRules`, `missionTemplates`, `guardrails`, `assets`.
- Root package schema plus split domain schemas under `schemas/common`, `schemas/packages`, `schemas/campaign`, and `schemas/mission`.
- First bundled package skeleton: [ashes-of-peace.starship-package.json](../../packages/bundled/breckinridge/ashes-of-peace.starship-package.json).
- First campaign-state projection: [ashes-of-peace.campaign-projection.json](../../packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json).
- Senior staff character bible source: [Directive Breckinridge Senior Staff Character Bible](../source/Directive_Breckinridge_Senior_Staff_Character_Bible.md).
- Director retrieval architecture: [Director Retrieval And Context Orchestration](../architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md).
- Crew development model: [Crew Development And Experience Model](../design/CREW_DEVELOPMENT_AND_EXPERIENCE_MODEL.md).
- Character Creator model: [Character Creator Model](../design/CHARACTER_CREATOR_MODEL.md).
- Crew dataset contract: [Crew Dataset Contract](../packages/CREW_DATASET_CONTRACT.md).
- Prelude mission graph: [Prelude Mission Graph](../packages/PRELUDE_MISSION_GRAPH.md).
- First executable Mission Director loop: [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md).
- First transaction-state slice: [transaction-state.mjs](../../src/campaign/transaction-state.mjs).
- First starship package context adapter: [starship-package-context.mjs](../../src/packages/starship-package-context.mjs).
- Save direction: multiple saves with `Save Game`, `Save Game As`, and `Load Game`.
- Campaign start direction: package selection, package-defined three-step Character Creator, review, then first save.
- Current package verifier: [validate-starship-package.mjs](../../tools/scripts/validate-starship-package.mjs).
- Current projection verifier: [validate-campaign-projection.mjs](../../tools/scripts/validate-campaign-projection.mjs).
- Current repo-structure verifier: [verify-repo-structure.mjs](../../tools/scripts/verify-repo-structure.mjs).

## Stage 1: Schema Deepening

Goal: move from one broad top-level schema to field-level schemas that can support real package loading and future creator tools.

Work:

- Split field-level schemas for `ship`, `crew`, `mainCampaign`, `missionTemplate`, `stateTrack`, `actor`, `faction`, `guardrails`, and `assets`.
- Define how pre-alpha placeholders are represented and prevented from slipping into a release as finished data.
- Define stable id conventions for packages, campaigns, missions, side assignments, actors, factions, state tracks, and assets.
- Decide which nested fields are strict now and which remain extensible until the prelude graph is proven.
- Keep the bundled Ashes package validating after each schema change.

Exit condition:

- The bundled package validates against the split schemas.
- Placeholder fields are explicit and machine-detectable.
- Schema docs explain what is stable and what remains pre-alpha.

Current state:

- Initial split schemas exist, including the first mission graph schema.
- The package verifier rejects drift back toward a monolithic root schema.
- `characterCreation` is now a package-owned schema domain in the top-level spine, starting with the Ashes of Peace locked XO context.
- Further deepening is still needed for mission graph state deltas, Director packets, and crew B-plot or coalition-rule cards.

## Stage 2: Campaign-State Projection

Goal: define how reusable package template data becomes a specific campaign playthrough.

Work:

- Define the package-owned template domains copied or referenced at campaign start.
- Define campaign-owned state initialized from the package: player character slot, ship state, crew relationship state, active mission, hidden campaign tracks, campaign assets, known facts, hidden facts, and Command Log baseline.
- Define which values are copied, which are referenced, and which are generated per campaign.
- Define how hidden state is protected from normal UI while remaining available to Director/adjudication logic.
- Define how save files refer back to the package version used at campaign creation.

Exit condition:

- A documented projection contract exists from `ashes-of-peace.starship-package.json` into initial campaign state.
- The contract preserves the package/campaign boundary.
- The contract names all initial state domains needed by the prelude.

Current state:

- The first Ashes of Peace projection exists.
- The projection initializes the active prelude graph, starting phase, active decision point, graph outcome flags, and graph clocks.
- The projection verifier compares initial campaign tracks, assets, crew ids, active mission, graph state, directives, and package version against the bundled package and mission graph.
- Further iteration should happen alongside Mission Director state-delta contracts.

## Stage 3: Prelude Mission Graph

Goal: convert `A Ship Underway` from campaign prose into the first real mission graph contract.

Work:

- Define mission graph shape: phases, facts, objectives, directives, clocks, fronts, revelations, actors, locations, decision points, outcome flags, and end states.
- Model the prelude timeline: shuttle rendezvous, ready-room handover, readiness conference, fallback-command drill, command rhythm scenes, Hesperus diversion, follow-up conversations, combined-load test, final command review, and arrival at the Reach.
- Encode the Hesperus diversion as a contained mission with flexible solutions.
- Define prelude outcome flags for crew integration, Whitaker, Kieran, Priya, Bronn, Rowan, Miriam, Imani, and ship state.
- Define transition data into Chapter 1.

Exit condition:

- The prelude has a loadable mission graph skeleton.
- The graph supports multiple valid approaches rather than scene-order railroading.
- Prelude outcome flags can be projected into campaign state and Command Log summaries.

Current state:

- The bundled prelude mission graph exists with ten phases, Hesperus facts, hidden clocks, decision points, one Hesperus fraud Command Decision, outcome flags, end states, and retrieval hooks.
- The mission graph validator checks phase coverage, required decisions, outcome flags, failure policy, transition target, package identity, and crew-card retrieval references.
- The first mission graph fixture proves the Hesperus fraud Command Decision is reachable, non-repeatable, and protected by the prelude failure policy.

## Stage 4: Mission Director Contracts

Goal: lock the structured interfaces between player prose, retrieval, adjudication, Mission Director state, narration, and persistence.

Work:

- Define scene snapshot inputs for Director retrieval.
- Define Director-card packet boundaries for Mission Director, Crew Director, Ship Director, Command Director, narrator, and Command Log.
- Define intent parse packet.
- Define capability and authority check packet.
- Define action classification values: valid within mission bounds, mission-relevant lateral move, mission-abandoning move, impossible or unsupported move.
- Define Director response packet: responding fronts, clocks, actors, revelations, pressure, and possible end-state changes.
- Define outcome packet.
- Define state delta packet and validator rules.
- Define narration context packet for SillyTavern.
- Define Command Log input packet.
- Define how Exploration and Command mode alter Director/narration guardrails without breaking causality.

Exit condition:

- Consequential turn flow can be described entirely through structured packets.
- A swipe can regenerate prose without rerolling Director state.
- Mission-abandoning moves have an explicit structured path instead of ad hoc narration.
- Hidden Director-only data cannot enter narrator packets without explicit reveal state.

Current state:

- The initial Mission Director turn contract exists in [Mission Director Contracts](../architecture/MISSION_DIRECTOR_CONTRACTS.md).
- Turn fixtures cover Hesperus accountability, repeated Command Decision prevention, Captain-approved mission deviation, Captain-refused mission deviation, Captain-counteroffered mission deviation, and an impossible/unsupported command.
- The contract validator checks graph ids, projection ids, decision points, facts, clocks, Command Decision awards, outcome flag values, narrator-safe cards, and swipe protection.
- The runtime loop generates Director packets for all current loop fixtures and compares them against expected turn fixtures.
- State deltas now include Hesperus phase advancement from `hesperus-diversion` to `hesperus-aftermath`.
- Remaining work is to add narrator-regeneration/provider-failure fixtures, Exploration-mode variants, actor posture/front updates, and broader mission rules beyond Hesperus.
- Swipe direction is now split: default swipes regenerate narration from committed mechanics, while explicit player-selected mechanics reruns can create a replacement outcome candidate.

## Stage 5: Crew Dossiers

Goal: turn the locked senior crew roster into implementation-ready character data.

Work for each senior officer:

- Service history.
- Prior postings.
- Why they are aboard the Breckinridge.
- Existing relationships aboard the ship.
- View of Bronn's acting-XO period.
- Initial reaction to the player as permanent XO.
- Professional strength and blind spot.
- Private pressure or unresolved thread.
- Relationship starting state.
- Development and experience axes.
- Command-style reactions to Inspiration and Resolve.
- Package-local voice guidance.
- B-plot hooks.

Exit condition:

- Each senior officer has a dossier that can become package JSON.
- Relationship initialization is grounded in the Ashes prelude.
- Crew development axes and Development Moments are represented separately from relationship values.
- Crew advice and disagreement rules can be generated from structured data, not only prose notes.

Current state:

- The senior staff character bible exists as the prose baseline.
- The crew dataset contract exists.
- The Breckinridge senior staff crew dataset covers all seven non-player senior officers with foundational profile, voice, relationship, reveal, development, and command-style cards.
- Retrieval fixtures prove narrator-safe packet separation for the prelude ready-room handoff and a full senior-staff briefing.
- Next work is adding B-plot hooks, coalition rules, and mission-graph links for those cards.

## Stage 6: Command Mechanics Lock

Goal: resolve the mechanics that affect progression, consequences, and player-facing command identity.

Work:

- Define Inspiration and Resolve thresholds.
- Define unlocks, modifiers, or techniques.
- Define what Command Decisions look like in data.
- Define how Command Decisions are detected, proposed, validated, and awarded.
- Define how Values are affirmed, challenged, compromised, reinterpreted, or replaced.
- Define Exploration mode guardrails.
- Define Command mode severity boundaries, including injury, death, reassignment, resignation, and relationship failure.
- Define what the player sees in the UI and Command Log.

Exit condition:

- The first Command Decision in the prelude can be represented and validated.
- Exploration and Command mode behavior can be implemented as data and prompts rather than vague tone.
- There is no hidden morality axis.

Current state:

- Earlier command-progression terminology has been retired in active contracts; the concept is now Command Decision.
- The Hesperus accountability Command Decision is represented in the prelude graph and validated as non-repeatable.
- Repeat-prevention coverage proves an already-awarded Command Decision does not award new command-style progression.
- Command Bearing is now the active progression and intervention model.
- Command Bearing uses typed Command Marks, five Bearing Ranks, a shared Command Reserve capped at two points, campaign-defined Recovery, and two-tier point interventions from Provisional Outcome to Final Outcome.
- The Ashes projection now starts both Inspiration and Resolve at Rank I with no Marks, no points, a one-point reserve, rank thresholds, and empty award/spend/recovery ledgers.
- Remaining work is to define Ashes B-stories and Command Crucibles that can award Marks, Recovery intervals, intervention UI, and first executable spend fixtures.
- Exploration mode now has hard guardrails: senior staff and the player character cannot die, but they can be injured, incapacitated, relieved, stranded, or otherwise removed from an active fight when causally justified.
- Command mode death is possible but rare and heavily causal; injury or temporary incapacitation is much more likely.

## Stage 7: Package Loader Plan

Goal: design the path from bundled JSON package to Starships tab and new campaign creation.

Work:

- Define bundled package discovery.
- Define package validation and diagnostics.
- Define package list metadata shown in the Starships tab.
- Define package detail view contents.
- Define `Start Campaign` flow.
- Consume the `characterCreation` package domain for role mode, allowed species, backgrounds, formative experiences, assignment reasons, and continuity guardrails.
- Define template immutability rules.
- Define installed/imported package records.
- Define how `.directive-starship.zip` imports normalize into JSON package records.
- Define how package updates interact with existing campaign saves.

Exit condition:

- Runtime implementation can build the Starships tab without inventing package behavior.
- Starting Ashes of Peace has a clear data path from package JSON to campaign state.
- Package template mutation is explicitly forbidden and testable.

Current state:

- The package context adapter derives Starships-tab summary data and Character Creator context from package JSON.
- The package context smoke test covers Ashes of Peace locked-role extraction, option lists, dossier boundaries, and clone isolation.

## Stage 8: First Runtime Slice

Goal: build only the runtime surface needed to prove the package and campaign contracts.

Work:

- Minimal Directive extension shell.
- Tabs: Starships, Mission, Crew, Ship, Log, Settings.
- Bundled package validation at startup or on demand.
- Starships tab list/detail for Ashes of Peace.
- Start campaign from package.
- Package-defined Character Creator for the incoming XO role, using Identity, Service, Personality, and Review screens.
- Editable generated dossier with local fallback if provider generation fails.
- First save creation after character creation.
- Save Game, Save Game As, and Load Game support for multiple saves.
- Campaign-state creation from projection contract.
- Read-only Mission, Crew, Ship, and Log views backed by state.
- Package/schema verifier included in local test flow.

Exit condition:

- A user can load Directive, inspect the bundled Breckinridge/Ashes package, start a campaign, and view the initialized campaign state.
- A user can create the campaign-required player character, write the first save, save as a new slot, and load an existing save.
- No adjudication or narration loop is required yet.
- The runtime proves package loading and state creation without hardcoding Ashes data into UI code.

## Recommended Next Work

Continue the transaction, save, and runtime foundation next.

Reason:

- The projection, crew dataset, prelude graph, Director loop, and first transaction-state helpers now define the package/campaign/turn path.
- The next risk is persistence and runtime integration: creating package-defined player characters, writing and loading multiple saves, committing generated Director outcomes into campaign state, safely handling swipes/edits/deletes across saved state, and rendering initialized package/campaign state without hardcoding Ashes behavior into UI modules.
- Stage 4 should continue only for missing packet variants such as narrator-regeneration failure, provider failure, Exploration-mode softening, actor posture, fronts, and side-mission inheritance.

Stage 1 should continue in parallel only where the transaction/runtime work reveals concrete schema needs.
