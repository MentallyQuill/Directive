# Pre-Production Roadmap

## Purpose

This roadmap defines the remaining pre-production work before Directive should move into a broad runtime implementation. It sits between the high-level design docs and the code-facing development sequence.

Pre-production is complete when Directive has buildable contracts for the bundled Breckenridge/Ashes of Peace package, the first campaign-state projection, the prelude mission graph, the Mission Director transaction interfaces, senior crew dossiers, command mechanics, and the package loader plan.

## Current Baseline

Already established:

- Extension identity: `directive`.
- Version target: `0.1.0-pre-alpha.1`.
- First bundled campaign package: U.S.S. Breckenridge.
- First campaign: `Ashes of Peace`.
- Opening stardate: `53049.2`.
- Package transport: `.directive-campaign.zip`.
- Package JSON spine: `manifest`, `ship`, `crew`, `characterCreation`, `world`, `storyArcs`, `questTemplates`, `threadTemplates`, `reactionRules`, `directorCards`, `contextPolicy`, `guardrails`, `assets`.
- Root package schema plus split domain schemas under `schemas/common`, `schemas/packages`, `schemas/campaign`, and `schemas/mission`.
- First bundled package skeleton: [ashes-of-peace.campaign-package.json](../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json).
- First Directive manifest and runtime shell: [manifest.json](../../manifest.json), [runtime-shell.js](../../src/runtime/runtime-shell.js).
- First runtime app bridge for bundled package loading and controller wiring: [runtime-app.mjs](../../src/runtime/runtime-app.mjs).
- First campaign-state projection: [ashes-of-peace.campaign-projection.json](../../packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json).
- Senior staff character bible source: [Directive Breckenridge Senior Staff Character Bible](../source/Directive_Breckenridge_Senior_Staff_Character_Bible.md).
- Director retrieval architecture: [Director Retrieval And Context Orchestration](../architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md).
- Crew development model: [Crew Development And Experience Model](../design/CREW_DEVELOPMENT_AND_EXPERIENCE_MODEL.md).
- Character Creator model: [Character Creator Model](../design/CHARACTER_CREATOR_MODEL.md).
- Crew dataset contract: [Crew Dataset Contract](../packages/CREW_DATASET_CONTRACT.md).
- Prelude mission graph: [Prelude Mission Graph](../packages/PRELUDE_MISSION_GRAPH.md).
- First executable Mission Director loop: [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md).
- First transaction-state slice: [transaction-state.mjs](../../src/campaign/transaction-state.mjs).
- First campaign package context adapter: [campaign-package-context.mjs](../../src/packages/campaign-package-context.mjs).
- First Character Creator draft-save helper: [character-creator-draft.mjs](../../src/creators/character-creator-draft.mjs).
- First campaign-start helper: [campaign-start.mjs](../../src/campaign/campaign-start.mjs).
- First campaign-start service: [campaign-start-service.mjs](../../src/campaign/campaign-start-service.mjs).
- First campaign save-record helper: [save-records.mjs](../../src/storage/save-records.mjs).
- First SillyTavern file API adapter: [file-api.mjs](../../src/hosts/sillytavern/file-api.mjs).
- First storage repository helper: [directive-storage-repository.mjs](../../src/storage/directive-storage-repository.mjs).
- First runtime campaign-start controller: [campaign-start-controller.mjs](../../src/runtime/campaign-start-controller.mjs).
- Save direction: multiple saves with `Save Game`, `Save Game As`, and `Load Game`.
- Campaign start direction: package selection, package-defined three-step Character Creator, review, then first save.
- Current package verifier: [validate-campaign-package.mjs](../../tools/scripts/validate-campaign-package.mjs).
- Current projection verifier: [validate-campaign-projection.mjs](../../tools/scripts/validate-campaign-projection.mjs).
- Current repo-structure verifier: [verify-repo-structure.mjs](../../tools/scripts/verify-repo-structure.mjs).

## Stage 1: Schema Deepening

Goal: move from one broad top-level schema to field-level schemas that can support real package loading and future creator tools.

Work:

- Split field-level schemas for `ship`, `crew`, `world`, `storyArcs`, `questTemplates`, `threadTemplates`, `reactionRules`, `directorCards`, `contextPolicy`, `stateTrack`, `actor`, `faction`, `guardrails`, and `assets`.
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

- A documented projection contract exists from `ashes-of-peace.campaign-package.json` into initial campaign state.
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
- Why they are aboard the Breckenridge.
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
- The Breckenridge senior staff crew dataset covers all seven non-player senior officers with foundational profile, voice, relationship, reveal, development, and command-style cards.
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

Goal: design the path from bundled JSON package to Campaign tab and new campaign creation.

Work:

- Define bundled package discovery.
- Define package validation and diagnostics.
- Define package list metadata shown in the Campaign tab.
- Define package detail view contents.
- Define `Start Campaign` flow.
- Consume the `characterCreation` package domain for role mode, allowed species, backgrounds, formative experiences, assignment reasons, and continuity guardrails.
- Define template immutability rules.
- Define installed/imported package records.
- Define how `.directive-campaign.zip` imports normalize into JSON package records.
- Define how package updates interact with existing campaign saves.

Exit condition:

- Runtime implementation can build the Campaign tab without inventing package behavior.
- Starting Ashes of Peace has a clear data path from package JSON to campaign state.
- Package template mutation is explicitly forbidden and testable.

Current state:

- The package context adapter derives Campaign-tab summary data and Character Creator context from package JSON.
- The package context smoke test covers Ashes of Peace locked-role extraction, option lists, dossier boundaries, and clone isolation.
- The runtime campaign-start controller consumes package summaries and creator context through the adapter rather than embedding Breckenridge-specific choices.

## Stage 8: First Runtime Slice

Goal: build only the runtime surface needed to prove the package and campaign contracts.

Work:

- Minimal Directive extension shell.
- Tabs: Campaign, Mission, Crew, Ship, Log, Settings.
- Bundled package validation at startup or on demand.
- Campaign tab list/detail for Ashes of Peace.
- Start campaign from package.
- Package-defined Character Creator for the incoming XO role, using Identity, Service, Personality, and Review screens.
- Editable generated dossier with local fallback if provider generation fails.
- First save creation after character creation.
- Save Game, Save Game As, and Load Game support for multiple saves.
- Campaign-state creation from projection contract.
- Read-only Mission, Crew, Ship, and Log views backed by state.
- Package/schema verifier included in local test flow.

Exit condition:

- A user can load Directive, inspect the bundled Breckenridge/Ashes package, start a campaign, and view the initialized campaign state.
- A user can create the campaign-required player character, write the first save, save as a new slot, and load an existing save.
- No adjudication or narration loop is required yet.
- The runtime proves package loading and state creation without hardcoding Ashes data into UI code.

Current state:

- The Directive manifest, lifecycle hooks, extensions-menu launcher, runtime action registry, and package-backed Campaign tab shell exist under Directive identity.
- The runtime app loads bundled package/projection JSON, creates the campaign-start controller over the storage adapter, and exposes screen-level operations for the renderer.
- Character Creator draft records can preserve partial Identity, Service, Personality, and dossier input with revisioned autosave history.
- Accepted creator reviews can initialize campaign state from the Ashes projection and package context.
- Campaign save records support first save, Save Game overwrite, Save Game As, Load Game clone behavior, and save-list metadata.
- Directive storage filenames are constrained to flat `directive-` JSON files under `/user/files/`.
- The Directive file API adapter wraps SillyTavern file upload, verify, delete, and direct user-file read behavior.
- The campaign-start/save smoke test proves partial creator drafts, accepted review projection, first save creation, save copy, overwrite, load, and package/projection immutability.
- The storage repository smoke test proves creator drafts and campaign saves persist as payload files with lightweight indexes for list views and active-save tracking.
- The campaign-start service smoke test proves a runtime-facing workflow for draft creation, partial draft save, draft resume, review acceptance, first save creation, Save Game, Save Game As, and Load Game.
- The runtime campaign-start controller smoke test proves Campaign and Character Creator view models, package-owned draft save/resume, review acceptance, first save creation, Save Game As, and Load Game without a DOM renderer.
- The runtime shell is split into a frame/action owner plus `src/ui` panel modules for Campaign, Character Creator, Mission, Crew, Ship, Log, and Settings.
- The runtime app exposes active package context alongside initialized campaign state so read-only panels can display package-owned ship and crew labels without hardcoding Ashes behavior.
- The rendered Mission panel shows player, ship, campaign, active mission, phase, stardate, simulation mode, formal objectives, active directives, Save Game, and Save As.
- The rendered Crew, Ship, Log, and Settings panels display initialized state while preserving hidden raw values.
- The runtime shell creator-flow smoke test proves the rendered Campaign tab can start a package-owned creator draft, save partial identity, return to Campaign, resume the draft, complete review, begin the campaign, create the first save, render state-backed Mission/Crew/Ship/Log/Settings panels, overwrite the save through Save Game, create a branch through Save As, load a save from Campaign, and render the state-backed panels after load.
- Storage diagnostics initialize indexes, verify indexed payload paths when available, report missing/unreadable payloads, and surface counts to the Settings panel.
- Startup active-save recovery loads the active campaign save when present, and can repair the active-save pointer to the newest readable fallback if the active payload is missing.
- The file API smoke path covers upload/read/verify/delete behavior through the Directive adapter and diagnostics over that adapter seam.
- The runtime app now loads package mission assets needed for Director execution: campaign projection records, senior staff crew dataset, and active mission graph.
- `director-turn-runtime.mjs` builds scene snapshots from active campaign state, runs `runMissionDirectorTurn`, creates runtime Provisional Outcome packets, evaluates Command Bearing intervention eligibility, commits accepted Final Outcomes through `commitDirectorTurn`, retains narrator and Command Log packets, and preserves the default swipe behavior that does not rerun mechanics.
- The runtime Director smoke test proves the Hesperus accountability turn can update active campaign state, Mission state, Command Bearing records, turn ledger, and Command Log through the runtime app.
- Narration prompt composition now uses committed narrator packets and visible Command Log continuity only.
- Runtime narration can call an injected provider or the active SillyTavern host generation adapter, record successful prose on the turn ledger, and record retryable provider failure without rerolling mechanics.
- Existing completed narration is not overwritten by a later failed rewrite attempt.
- Command Bearing Marks now apply during committed Director transactions, update track Marks, recalculate rank titles and point caps, and preserve one-award-per-source protection.
- Command Bearing Recovery supports unique recovery ids, track caps, shared reserve caps, and no-benefit recovery records when the reserve is full.
- Command Bearing spend helpers evaluate eligible Inspiration/Resolve spends, improve spendable outcomes by two tiers, block Success/Great Success spends, protect one spend per outcome, and produce the first intervention prompt shape.
- The runtime app now exposes the first playable turn loop: Preview Outcome, optional Command Bearing spend, Accept Outcome, Final Outcome commit, narration generation, narration retry without rerolling mechanics, and immediate Mission/Log state refresh.
- The rendered Mission panel now lets the player enter a prose action, preview a Provisional Outcome, accept it or invoke an eligible Command Bearing point, discard the preview, and retry failed narration.
- The Director now has playable opening Prelude beats before Hesperus: arrival tone advances from `shuttle-rendezvous` to `ready-room-handover`, and the ready-room handoff advances to `senior-readiness-conference`, with outcome flags, known facts, crew-integration strain, relationship memory, narrator constraints, and Command Log entries.
- Stable narrated turns now create non-current rolling autosaves capped to three per campaign. Failed narration records pending recovery and does not overwrite the stable autosave set.
- The Mission panel shows the latest autosave timestamp when a stable turn has persisted.
- Crew B-plot hooks now derive from senior staff cards and mission graph retrieval hooks instead of a parallel hardcoded arc list.
- Coalition/objection rule packets can be derived for a mission phase from relationship, development, and command-style reaction cards.
- Committed Director turns now add hidden plain-language relationship memories for present senior staff while preserving raw-value hiding.

## Recommended Next Work

Use [Next Ten Development Stages](NEXT_TEN_DEVELOPMENT_STAGES.md) as the completed Stage 11-20 implementation record.

Use [Post-Stage 20 Implementation Plan](POST_STAGE_20_IMPLEMENTATION_PLAN.md) as the active implementation plan for Command Competence, Chapter 1's first playable frame, and the side-mission pressure framework.

Reason:

- The projection, package context, Character Creator draft records, campaign-start helper/service, save records, rolling autosaves, storage repository, crew dataset, prelude graph, Director loop, transaction-state helpers, and first playable Mission panel now define the package/campaign/turn path.
- The next risk is deeper simulation coverage across the remaining Prelude phases: senior-readiness priorities, fallback-command drill, command rhythm scenes, Hesperus aftermath, combined-load test, final command review, and the transition into Chapter 1.
- After the Prelude path is complete, the next risk shifts to cross-cutting hardening: Exploration-mode consequence policy, explicit mechanics reruns, edit/delete/branch recovery, generalized Director retrieval, package import, update diagnostics, and a local alpha gate.

Stage 1 should continue in parallel only where the transaction/runtime work reveals concrete schema needs. Future creator-tool planning should continue to shape package and mission contracts, but full Starship Creator and Mission Creator surfaces remain deferred until after the Stage 11-20 plan.
