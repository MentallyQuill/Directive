# Directive Documentation

Directive documentation is organized into release-facing guides, package references, architecture records, design baselines, planning notes, and source briefs.

The current project state is pre-alpha. User-facing docs describe the working runtime slice and should stay conservative until the implementation catches up.

## Release Notes

- [Directive 0.1.0-pre-alpha.1](release/0.1.0-pre-alpha.1.md): current pre-alpha checkpoint for the runtime shell, bundled Breckenridge package, campaign start, Mission Director loop, Command Competence, pressure ledger, storage, and alpha gate.

## Release-Facing Docs

- [First Campaign Workflow](user/FIRST_CAMPAIGN_WORKFLOW.md): shortest path from opening Directive to testing the bundled Breckenridge/Ashes of Peace campaign loop.
- [Directive Operator Manual](user/DIRECTIVE_OPERATOR_MANUAL.md): current surface-by-surface guide for Starships, Character Creator, Mission, Crew, Ship, Log, Settings, and runtime limits.
- [Lumiverse Installation And Smoke Testing](user/LUMIVERSE_INSTALLATION.md): current local Spindle install, permission grant, smoke test, tool coverage, and troubleshooting workflow.
- [Storage And State Safety](user/STORAGE_AND_STATE_SAFETY.md): storage model, package/campaign boundary, save behavior, transaction safety, diagnostics, import safety, and troubleshooting.
- [Starship Package Model](packages/STARSHIP_PACKAGE_MODEL.md): package-first product model, Breckenridge as the first package, package contents, JSON storage direction, transport direction, and unresolved package questions.
- [Starship Package Schema](packages/STARSHIP_PACKAGE_SCHEMA.md): schema v1 artifacts, bundled Ashes of Peace package skeleton, package import normalization, package diagnostics, validation commands, and next schema work.
- [Mission Director As-Coded](architecture/MISSION_DIRECTOR_AS_CODED.md): current executable Director loop, module ownership, Hesperus behavior, Chapter 1 opening behavior, narrator safety, Command Log rules, and runtime limits.
- [Testing Strategy](testing/TESTING_STRATEGY.md): product-contract tests, visual smoke direction, storage tests, transaction tests, and package import safety.

## Design

- [Directive Design Baseline](design/DIRECTIVE_DESIGN_BASELINE.md): locked product premise, player role, first starship package, visible UI shape, and vertical-slice intent.
- [Command And Morality Model](design/COMMAND_AND_MORALITY_MODEL.md): established command-style principles, values, directives, adjudication posture, and unresolved mechanics questions.
- [LCARS Visual Identity](design/LCARS_VISUAL_IDENTITY.md): governing UX-first LCARS-inspired UI visual system for concept prompts, runtime styling, and visual acceptance.
- [Directive Interface Design Bible](design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md): current LCARS-informed interface direction, shell hierarchy, route behavior, responsive rules, and visual acceptance criteria.
- [Reference Concepts](design/reference-concepts/README.md): selected concept-art targets for the current mobile and desktop Directive interface pass.
- [Command Bearing System](design/COMMAND_BEARING_SYSTEM.md): Inspiration and Resolve Marks, Bearing Ranks, Command Reserve, Recovery, point spends, Anchored Consequences, and intervention UI rules.
- [Command Competence Layer](design/COMMAND_COMPETENCE_LAYER.md): professional knowledge, procedural autocomplete, Command Briefs, Domain Reports, Request Counsel, warnings, authority notes, standing orders, and no-gotcha consequence rules.
- [Character Creator Model](design/CHARACTER_CREATOR_MODEL.md): campaign-agnostic three-step player-character creation, package-provided options, editable generated dossier, and adjudication use.
- [Mission Director Model](design/MISSION_DIRECTOR_MODEL.md): behind-the-scenes situation management, mission flexibility, Captain constraint, and non-railroading rules.
- [Narrative Thread Engine](design/NARRATIVE_THREAD_ENGINE.md): hidden B-story continuity layer for vignettes, recurring details, character threads, Open Orders promotion, post-hoc Command Bearing, and thread-ledger integration.
- [Crew And Relationship Model](design/CREW_AND_RELATIONSHIP_MODEL.md): approved senior crew, relationship dimensions, hidden simulation policy, and open backstory work.
- [Crew Development And Experience Model](design/CREW_DEVELOPMENT_AND_EXPERIENCE_MODEL.md): hidden senior-staff growth, Development Moments, offscreen growth, officer arcs, and mechanical effects without visible XP bars.

## Packages

- [Starship Package Model](packages/STARSHIP_PACKAGE_MODEL.md): package responsibilities, package/campaign boundary, Creator compatibility, transport direction, and security direction.
- [Starship Package Schema](packages/STARSHIP_PACKAGE_SCHEMA.md): root and split schemas, bundled package verification, import/update diagnostics, competence metadata, and pressure authoring notes.
- [Campaign State Projection](packages/CAMPAIGN_STATE_PROJECTION.md): package-to-campaign boundary, Ashes of Peace initial state domains, hidden-state policy, and projection validation.
- [Crew Dataset Contract](packages/CREW_DATASET_CONTRACT.md): structured senior-staff Director-card dataset contract, reveal gates, development dimensions, packet audience safety, and Breckenridge foundational crew cards.
- [Prelude Mission Graph](packages/PRELUDE_MISSION_GRAPH.md): loadable `A Ship Underway` phase graph, Hesperus Command Decision, outcome flags, failure policy, and graph validation.

## Campaigns

- [Ashes Of Peace Campaign](campaigns/ASHES_OF_PEACE_CAMPAIGN.md): Campaign One implementation baseline, including the Asterion Reach, Pale Lantern, chapter structure, side assignments, campaign state tracks, and production decisions.

## Architecture

- [Saga Reference Review](architecture/SAGA_REFERENCE_REVIEW.md): current review of Saga `refactor`, what to reuse, what to avoid, and the copy-vs-clean-build decision.
- [Repository Structure](architecture/REPO_STRUCTURE.md): Saga-inspired top-level scaffold, Directive-specific ownership boundaries, and structure verifier.
- [Source Architecture](architecture/SOURCE_ARCHITECTURE.md): proposed repo/module layout and ownership rules to avoid monolithic Saga-style files.
- [Director Retrieval And Context Orchestration](architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md): Saga-inspired package dataset retrieval, Director-card packet boundaries, crew reveal gates, and narrator safety rules.
- [Mission Director Contracts](architecture/MISSION_DIRECTOR_CONTRACTS.md): turn packet spine from scene snapshot through state delta, narrator packet, and Command Log packet.
- [Mission Director As-Coded](architecture/MISSION_DIRECTOR_AS_CODED.md): current executable Director loop and runtime behavior.
- [Persistence And Continuity](architecture/PERSISTENCE_AND_CONTINUITY.md): authoritative state, storage domains, hidden simulation state, save model, and continuity boundaries.
- [Turn Transactions](architecture/TURN_TRANSACTIONS.md): transactional turn model for swipes, edits, deletions, branches, and provider failures.

## Testing

- [Testing Strategy](testing/TESTING_STRATEGY.md): first invariants, package schema tests, storage tests, visual smoke targets, transaction tests, provider tests, and the current alpha gate command list.

## Development Notes

- [Pre-Alpha Systems](development/PRE_ALPHA_SYSTEMS.md): current pre-alpha definition, release gate, key systems, alpha blockers, alpha non-blockers, and near-term focus.
- [Visual Target Loop](development/VISUAL_TARGET_LOOP.md): GPT Image 2 concept-art workflow for page, window, feature, control-group, and state-variant UI iteration against live SillyTavern screenshots.

Development records in this section are not automatically user-facing contracts. Promote them into `user/`, `packages/`, `architecture/`, or `testing/` when the runtime behavior exists and the doc becomes part of the product contract.

## Planning

- [Starships Flow Revision Plan](planning/STARSHIPS_FLOW_REVISION_PLAN.md): revision plan for replacing the overloaded Starships package-home state machine with Command, Library & Import, and Records surfaces.
- [Command Spine Migration](planning/COMMAND_SPINE_MIGRATION.md): implemented SillyTavern left command spine, single resizable drawer, full-screen workspace escalation, mobile fallback, source ownership, tests, and remaining Lumiverse migration work.
- [Parallel Agent Coordination Protocol](planning/PARALLEL_AGENT_COORDINATION_PROTOCOL.md): Agent-0 orchestration and worker-agent operating model for parallel MVP, UI, Narrative Thread, Mission Director, and QA development.
- [Interface Redesign Integration Prep](planning/INTERFACE_REDESIGN_INTEGRATION_PREP.md): review of the 2026-06-20 frontier-model UI redesign bundle, with integration lanes, blockers, file ownership, and verification gates for selective adoption.
- [Backend Redesign Integration Prep](planning/BACKEND_REDESIGN_INTEGRATION_PREP.md): backend/runtime integration rules for the 2026-06-20 redesign bundle, allowing broad non-Chapter 2 adoption while protecting False Colors through Quiet Channels.
- [Visual Asset And Mobile UI Integration Plan](planning/VISUAL_ASSET_AND_MOBILE_UI_INTEGRATION_PLAN.md): package-owned Breckenridge crew portrait and ship-art integration plan, with Saga-informed UI, Theme Pack, Icon Pack, style, and flow direction; its original shared bottom-navigation assumption is superseded for SillyTavern by the Command Spine Migration.
- [MVP Playable Alpha Plan](planning/MVP_PLAYABLE_ALPHA_PLAN.md): development path to a SillyTavern-first MVP alpha with complete Prelude, complete Chapter 1, probable side missions, complete UI, and side-mission generator architecture.
- [Pre-Production Roadmap](planning/PRE_PRODUCTION_ROADMAP.md): remaining pre-production stages from schema deepening through first runtime slice.
- [Next Ten Development Stages](planning/NEXT_TEN_DEVELOPMENT_STAGES.md): Stage 11-20 implementation plan and current status after completing the Prelude, transaction/retrieval hardening, package import normalization, diagnostics, and alpha gate.
- [Post-Stage 20 Implementation Plan](planning/POST_STAGE_20_IMPLEMENTATION_PLAN.md): detailed Stage 21-30 plan for Command Competence, Chapter 1's first playable frame, and the side-mission pressure framework.
- [Dual Host Support Plan](planning/DUAL_HOST_SUPPORT_PLAN.md): staged architecture plan for supporting both SillyTavern and Lumiverse through host adapters, generation roles, logical storage, and sidecar jobs.
- [Initial Development Sequence](planning/INITIAL_DEVELOPMENT_SEQUENCE.md): recommended order of work before the first playable slice.
- [Director Loop Implementation Plan](planning/DIRECTOR_LOOP_IMPLEMENTATION_PLAN.md): staged plan for the first executable Mission Director loop and fixture coverage.
- [Future Creator Tools](planning/FUTURE_CREATOR_TOOLS.md): future Starship Creator and Mission Creator planning, kept out of the first release but reflected in schema and architecture choices.
- [Clarifying Questions](planning/CLARIFYING_QUESTIONS.md): design, gameplay, mechanics, package, and content questions that should be answered before implementation decisions.

## Source Briefs

The current baseline comes from source briefs copied into this repository:

- [Directive Game Design Document](source/Directive_Game_Design_Document.md)
- [Star Trek Command RPG Extension Project Brief](source/Star_Trek_Command_RPG_Extension_Project_Brief.md)
- [Directive Ashes of Peace Campaign v0.2](source/Directive_Ashes_of_Peace_Campaign_v0.2.md)
- [Directive Breckenridge Senior Staff Character Bible](source/Directive_Breckenridge_Senior_Staff_Character_Bible.md)

When a decision here conflicts with those briefs, update the relevant design doc and keep the question log current.
