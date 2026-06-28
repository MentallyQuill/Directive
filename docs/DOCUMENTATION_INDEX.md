# Directive Documentation

Directive documentation is organized into release-facing guides, package references, architecture records, design baselines, planning notes, and source briefs.

The current project state is pre-alpha. User-facing docs describe the working runtime slice and should stay conservative until the implementation catches up.

## Release Notes

- [Directive 0.1.0-pre-alpha.1](release/0.1.0-pre-alpha.1.md): current pre-alpha version baseline.
- [Chat-Native Target Flow Checkpoint](release/CHAT_NATIVE_TARGET_FLOW_CHECKPOINT.md): automatic campaign chat activation, dual providers, utility routing, deep tracking, recovery, and conclusion.

## Release-Facing Docs

These are the public-facing docs that should be safe to hand to operators, campaign authors, and release testers.

### Start Here

- [First Campaign Workflow](user/FIRST_CAMPAIGN_WORKFLOW.md): shortest path from opening Directive to testing the bundled Breckenridge/Ashes of Peace campaign loop.
- [Directive Operator Manual](user/DIRECTIVE_OPERATOR_MANUAL.md): detailed operator guide for runtime shell, Campaign Command/Library/Records, Character Creator, activation, Mission, Crew, Ship, Log, Assist, Settings, saves, recovery, and SillyTavern controls.

### Host Setup And Operations

- [SillyTavern Preset](user/SILLYTAVERN_PRESET.md): importable Directive prompt preset, reference-preset review notes, install/update controls, and prompt-ownership boundaries.
- [Storage And State Safety](user/STORAGE_AND_STATE_SAFETY.md): storage model, package/campaign boundary, save behavior, transaction safety, diagnostics, import safety, and troubleshooting.

### Campaign Package Contracts

- [Campaign Package Model](packages/CAMPAIGN_PACKAGE_MODEL.md): package-first product model, bundled Breckenridge/Ashes, Glass Harbor/Drowned Constellation, Serein/Black Current, Eudora Vale/Broken Accord, Aster Vale/Unseen Border, and Celandine/Enemy's Garden examples, package contents, JSON storage direction, transport direction, and unresolved package questions.
- [Campaign Package Schema](packages/CAMPAIGN_PACKAGE_SCHEMA.md): schema v2 artifacts, bundled package records, package import normalization, package diagnostics, validation commands, and next schema work.

### Runtime Architecture

- [Chat-Native Runtime](architecture/CHAT_NATIVE_RUNTIME.md): implemented host binding, activation journal, Utility/Reasoning routing, turn arbitration, tracked durability, prompt safety, sidecar gateway, reconciliation, and conclusion architecture.
- [Continuity Projection Matrix (CPM) Technical Manual](technical/CONTINUITY_PROJECTION_MATRIX.md): as-coded source-backed continuity projection, prompt lanes, planner fallback, Director packets, sidecar handoff, contradiction hints, diagnostics, and certification flow.
- [Directive Datasets](technical/DIRECTIVE_DATASETS.md): package, projection, crew, ship, mission graph, Mission Component, save-state, journal, and configuration data map, including how datasets feed CPM, Directors, sidecars, prompts, and UI.
- [Timekeeping System](architecture/TIMEKEEPING_SYSTEM.md): Stardate/ship-time reply header contract, display-only clock boundary, deterministic time ownership, model sanitization, and deterministic/Utility-backed time adjudication.
- [Mission Director As-Coded](architecture/MISSION_DIRECTOR_AS_CODED.md): current executable Director loop, module ownership, Hesperus behavior, Chapter 1 opening behavior, narrator safety, Command Log rules, and runtime limits.

### Release Verification

- [Testing Strategy](testing/TESTING_STRATEGY.md): product-contract tests, visual smoke direction, storage tests, transaction tests, CPM deterministic coverage, Command Bearing deterministic/live coverage, and package import safety.
- [Live Campaign Soak Test Plan](testing/LIVE_CAMPAIGN_SOAK_TEST_PLAN.md): opt-in 50-turn live SillyTavern campaign stress plan with unlimited model calls for Assist, CPM prompt/source proof, Command Bearing evidence/closure/Mark Review/point-spend certification, message actions, retcons, recovery, branching, and continuity.

## Technical Manual

- [Directive Technical Manual](technical/DIRECTIVE_TECHNICAL_MANUAL.md): Haynes-style technical overview covering runtime spine, package/state boundary, player turn lifecycle, model-call authority, state transactions, prompt context, sidecars, host adapters, and diagnostics.
- [Player Turn Sequence](technical/PLAYER_TURN_SEQUENCE.md): post-to-response lifecycle from host ingress through classification, Director escalation, mechanics commit, narration, autosave, sidecars, and recovery.
- [CPM Technical Manual](technical/CONTINUITY_PROJECTION_MATRIX.md): deep dive with source-frame, fact-index, prompt-lane, Director-packet, sidecar, contradiction, diagnostic, and certification infographics.
- [Directive Datasets](technical/DIRECTIVE_DATASETS.md): technical map of source bibles, packages, projections, crew/ship datasets, mission graphs, Mission Components, save-state data, runtime journals, and dynamic-system consumers.
- [Model Calls And Provider Routing](technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md): Utility/Reasoning lanes, provider sources, role groups, model-call authority table, structured output, and sanitized diagnostics.
- [State Transactions And Recovery](technical/STATE_TRANSACTIONS_AND_RECOVERY.md): tracked campaign revisions, runtime journals, turn ledger, narration recovery, edit/delete reconciliation, manual saves, branches, and sidecar application.
- [Host Integration Manual](technical/HOST_INTEGRATION_MANUAL.md): SillyTavern adapter, fake host, host boundary diagram, and future host-adapter rules.

## Campaign Authoring

- [Campaign Authoring Guide](authoring/CAMPAIGN_AUTHORING_GUIDE.md): deep author workflow for campaign promise, player role, ship, crew, Character Creator, world, arcs, quests, threads, reactions, Director cards, context policy, guardrails, assets, validation, and import.
- [Campaign Package Structure](authoring/CAMPAIGN_PACKAGE_STRUCTURE.md): `.directive-campaign.zip` transport, required root spine, archive layout, bundled layout, package/save boundary, and validation commands.
- [Campaign Schema Reference](authoring/CAMPAIGN_SCHEMA_REFERENCE.md): author-facing reference for the required `manifest`, `ship`, `crew`, `characterCreation`, `world`, `storyArcs`, `endConditions`, `questTemplates`, `threadTemplates`, `reactionRules`, `directorCards`, `contextPolicy`, `guardrails`, and `assets` roots.
- [Character Bible Shaping Guide](authoring/CHARACTER_BIBLE_SHAPING_GUIDE.md): Ashes-inspired target structure and richness standard for senior-staff character bibles, including personality engines, reveal ladders, relationships, warmth, physical tells, and example line shapes.
- [LLM Campaign Authoring Guide](authoring/LLM_CAMPAIGN_AUTHORING_GUIDE.md): compact handoff for model-assisted campaign-package drafting and revision.
- [Ashes Of Peace Authoring Reference](authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md): annotated map of the bundled Breckenridge/Ashes files, source folders, package capabilities, and render slots.
- [Glass Harbor Authoring Reference](authoring/GLASS_HARBOR_AUTHORING_REFERENCE.md): annotated map of the bundled Glass Harbor/Drowned Constellation draft package, source folders, validation commands, draft caveats, and render slots.
- [Serein Authoring Reference](authoring/SEREIN_AUTHORING_REFERENCE.md): annotated map of the bundled Serein/Black Current draft package, source folders, validation commands, End Conditions pass, and draft caveats.
- [Eudora Vale Authoring Reference](authoring/EUDORA_VALE_AUTHORING_REFERENCE.md): annotated map of the bundled Eudora Vale/Broken Accord draft package, source folders, validation commands, End Conditions pass, and draft caveats.
- [Aster Vale Authoring Reference](authoring/ASTER_VALE_AUTHORING_REFERENCE.md): annotated map of the bundled Aster Vale/Unseen Border draft package, source folders, validation commands, End Conditions pass, and draft caveats.
- [Celandine Authoring Reference](authoring/CELANDINE_AUTHORING_REFERENCE.md): annotated map of the bundled Celandine/Enemy's Garden draft package, source folders, validation commands, End Conditions pass, and draft caveats.

## Design

- [Directive Design Baseline](design/DIRECTIVE_DESIGN_BASELINE.md): locked product premise, player role, first campaign package, visible UI shape, and vertical-slice intent.
- [Command And Morality Model](design/COMMAND_AND_MORALITY_MODEL.md): established command-style principles, values, directives, adjudication posture, and unresolved mechanics questions.
- [LCARS Visual Identity](design/LCARS_VISUAL_IDENTITY.md): governing UX-first LCARS-inspired UI visual system for concept prompts, runtime styling, and visual acceptance.
- [Directive Interface Design Bible](design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md): current LCARS-informed interface direction, shell hierarchy, route behavior, responsive rules, and visual acceptance criteria.
- [Command Shelf Redesign](design/COMMAND_SHELF_REDESIGN.md): target black-inactive, route-accented, LCARS drawer-shelf treatment for desktop/tablet command spine and phone bottom route shelf.
- [UI-UX Simplification Review](design/UI_UX_SIMPLIFICATION_REVIEW.md): route-by-route clutter audit, removal candidates, augmentation targets, and redundancy ownership rules for the pre-alpha extension UI.
- [Reference Concepts](design/reference-concepts/README.md): selected concept-art targets for the current mobile and desktop Directive interface pass.
- [SillyTavern Preset Reference Review](design/SILLYTAVERN_PRESET_REFERENCE_REVIEW.md): Wandlight and Pura preset feature review, adopted patterns, and excluded patterns for Directive's bundled preset.
- [Target User Flow](design/TARGET_USER_FLOW.md): executable install-to-campaign-conclusion contract for chat creation, active prompt injection, player chat observation, utility classification, Director escalation, sidecars, UI state charts, saves, and campaign completion.
- [Campaign End Conditions](design/CAMPAIGN_END_CONDITIONS.md): target contract for terminal outcomes, checkpoint replay, Push On continuations, final outcome bands, and the Ashes of Peace end-condition update path.
- [First Start Revision](design/FIRST_START_REVISION.md): approved pre-alpha revision that makes new campaign creation always create a fresh campaign chat, keeps existing-chat rebinding as recovery/admin only, and defines campaign chat naming.
- [Current Chat Campaign Scope Revision](design/CURRENT_CHAT_CAMPAIGN_SCOPE_REVISION.md): implemented pre-alpha revision that makes Campaign Command a scalable campaign index whose cards target the latest save while Mission, Crew, Ship, and Log render only the currently selected campaign chat.
- [Difficulty Modes Clarity Revision](design/DIFFICULTY_MODES_CLARITY_REVISION.md): implemented pre-alpha revision for presenting Exploration and Command as Campaign Difficulty choices during creation and changing that campaign-level mode during play.
- [Directive Assist](design/DIRECTIVE_ASSIST.md): pre-send chat assistant design for Draft In Character, Brief Me, and role-aware order/report framing beside the SillyTavern input.
- [Define Selection](design/DEFINE_SELECTION.md): highlighted-text context explainer design for Utility-backed in-universe definitions of characters, systems, mission details, social cues, risks, jargon, and ambiguous selections without mutating campaign state.
- [Directive Tips And Tutorials](design/DIRECTIVE_TIPS_AND_TUTORIALS.md): first-run tutorial offer, reusable guidance popover, Settings Systems controls, tutorial modules, and extensive tip backlog for Assist, message actions, mechanics, pressure, crew memory, Command Bearing, recovery, and providers.
- [Directive Tutorial Revision](design/DIRECTIVE_TUTORIAL_REVISION.md): Saga-style tutorial expansion plan, Basic/Advanced/feature walkthrough structure, tutorial-only training scenario, exact Show Me targets, Settings tutorial library, and implementation slices.
- [Chat-Native Command Intent](design/CHAT_NATIVE_COMMAND_INTENT.md): target design for replacing the shelf-first XO intent input with chat-native command interpretation, intent tolerance, warnings, and pending review.
- [Mission Components](design/MISSION_COMPONENTS.md): highlighted-text capture design for player-curated mission evidence, items, claims, source notes, ship issues, leads, and CPM-compatible component records.
- [Scene Handshake Protocol](design/SCENE_HANDSHAKE_PROTOCOL.md): commit-on-next-player-reply design for settling accepted host-generated prose into source-backed assignments, Log entries, ship readiness, threads, and validated player-visible records through the Utility lane.
- [Outcome Integrity](design/OUTCOME_INTEGRITY.md): planned campaign-state trust contract for reviewing player edits to Directive-owned assistant prose without letting transcript edits rewrite committed outcomes, costs, relationships, or Command Bearing.
- [CPM Design Baseline](design/CONTINUITY_PROJECTION_MATRIX.md): as-coded pre-alpha foundation and full Saga-informed design for source-backed, relevance-aware, depth-layered continuity prompt projection, generated-prose quarantine, audits, and contradiction guards.
- [Command Bearing System](design/COMMAND_BEARING_SYSTEM.md): Inspiration and Resolve Marks, Bearing Ranks, Command Reserve, Recovery, point spends, Anchored Consequences, and intervention UI rules.
- [Command Competence Layer](design/COMMAND_COMPETENCE_LAYER.md): professional knowledge, procedural autocomplete, Command Briefs, Domain Reports, Request Counsel, warnings, authority notes, standing orders, and no-gotcha consequence rules.
- [Character Creator Model](design/CHARACTER_CREATOR_MODEL.md): campaign-agnostic three-step player-character creation, package-provided options, editable generated dossier, and adjudication use.
- [Character Creator Guided Flow Improvement](design/CHARACTER_CREATOR_GUIDED_FLOW_IMPROVEMENT.md): implementation-facing plan for wizard-style creator flow, compact command hierarchy, meaningful draft resume behavior, discard/reset, player portrait import, and section-level wand generation.
- [Mission Director Model](design/MISSION_DIRECTOR_MODEL.md): behind-the-scenes situation management, mission flexibility, Captain constraint, and non-railroading rules.
- [Narrative Thread Engine](design/NARRATIVE_THREAD_ENGINE.md): hidden B-story continuity layer for vignettes, recurring details, character threads, Open Orders promotion, post-hoc Command Bearing, and thread-ledger integration.
- [Crew And Relationship Model](design/CREW_AND_RELATIONSHIP_MODEL.md): approved senior crew, relationship dimensions, hidden simulation policy, and open backstory work.
- [Crew Development And Experience Model](design/CREW_DEVELOPMENT_AND_EXPERIENCE_MODEL.md): hidden senior-staff growth, Development Moments, offscreen growth, officer arcs, and mechanical effects without visible XP bars.

## Packages

- [Campaign Package Model](packages/CAMPAIGN_PACKAGE_MODEL.md): package responsibilities, package/campaign boundary, Creator compatibility, transport direction, and security direction.
- [Campaign Package Schema](packages/CAMPAIGN_PACKAGE_SCHEMA.md): root and split schemas, bundled package verification, import/update diagnostics, competence metadata, and pressure authoring notes.
- [Campaign State Projection](packages/CAMPAIGN_STATE_PROJECTION.md): package-to-campaign boundary, bundled projection examples, hidden-state policy, and projection validation.
- [Crew Dataset Contract](packages/CREW_DATASET_CONTRACT.md): structured senior-staff Director-card dataset contract, reveal gates, development dimensions, packet audience safety, and bundled crew datasets.
- [Crew Dataset Rich Character Design](packages/CREW_DATASET_RICH_CHARACTER_DESIGN.md): richer runtime character dataset target for voice capsules, line-shape examples, prompt-budget tiers, card hydration, warmth modes, and hidden reveal safety.
- [Prelude Mission Graph](packages/PRELUDE_MISSION_GRAPH.md): loadable tactical phase graphs, Hesperus and Glass Harbor prelude coverage, outcome flags, failure policy, and graph validation.

## Campaigns

- [Ashes Of Peace Campaign](campaigns/ASHES_OF_PEACE_CAMPAIGN.md): Campaign One implementation baseline, including the Asterion Reach, Pale Lantern, chapter structure, side assignments, campaign state tracks, and production decisions.
- [Ashes Of Peace Open World](campaigns/ASHES_OF_PEACE_OPEN_WORLD.md): schema-v2 open-world implementation shape for the bundled Breckenridge/Ashes package.
- [Glass Harbor / Drowned Constellation](campaigns/GLASS_HARBOR_DROWNED_CONSTELLATION.md): bundled draft campaign reference for U.S.S. Glass Harbor, Nerine Reef, open-world scope, end families, and playtest caveats.
- [Serein / Black Current](campaigns/SEREIN_BLACK_CURRENT.md): bundled draft campaign reference for U.S.S. Serein, the Vanta Wake, open-world scope, end families, and playtest caveats.
- [Eudora Vale / Broken Accord](campaigns/EUDORA_VALE_BROKEN_ACCORD.md): bundled draft campaign reference for U.S.S. Eudora Vale, the Ilyra System, open-world scope, end families, and playtest caveats.
- [Aster Vale / Unseen Border](campaigns/ASTER_VALE_UNSEEN_BORDER.md): bundled draft campaign reference for U.S.S. Aster Vale, the Lacuna March, open-world scope, end families, and playtest caveats.
- [Celandine / Enemy's Garden](campaigns/CELANDINE_ENEMYS_GARDEN.md): bundled draft campaign reference for U.S.S. Celandine, the Cyradon Relief Cluster, open-world scope, end families, and playtest caveats.

## Architecture

- [Saga Reference Review](architecture/SAGA_REFERENCE_REVIEW.md): current review of Saga `refactor`, what to reuse, what to avoid, and the copy-vs-clean-build decision.
- [Repository Structure](architecture/REPO_STRUCTURE.md): Saga-inspired top-level scaffold, Directive-specific ownership boundaries, and structure verifier.
- [Source Architecture](architecture/SOURCE_ARCHITECTURE.md): proposed repo/module layout and ownership rules to avoid monolithic Saga-style files.
- [Director Retrieval And Context Orchestration](architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md): Saga-inspired package dataset retrieval, Director-card packet boundaries, crew reveal gates, and narrator safety rules.
- [Mission Director Contracts](architecture/MISSION_DIRECTOR_CONTRACTS.md): turn packet spine from scene snapshot through state delta, narrator packet, and Command Log packet.
- [Mission Director As-Coded](architecture/MISSION_DIRECTOR_AS_CODED.md): current executable Director loop and runtime behavior.
- [Open-World Campaign Architecture](architecture/OPEN_WORLD_CAMPAIGN_ARCHITECTURE.md): schema-v2 package/save boundary, director ownership, open-world event transaction, and bundled tactical graph coverage.
- [Timekeeping System](architecture/TIMEKEEPING_SYSTEM.md): deterministic stardate/ship-time display, prompt and model boundaries, current implementation map, and validated time-adjudication layer.
- [Persistence And Continuity](architecture/PERSISTENCE_AND_CONTINUITY.md): authoritative state, storage domains, hidden simulation state, save model, and continuity boundaries.
- [Turn Transactions](architecture/TURN_TRANSACTIONS.md): transactional turn model for swipes, edits, deletions, branches, and provider failures.

## Testing

- [Testing Strategy](testing/TESTING_STRATEGY.md): first invariants, package schema tests, storage tests, visual smoke targets, transaction tests, provider tests, Command Bearing deterministic/live coverage, and the current alpha gate command list.
- [Live Campaign Soak Test Plan](testing/LIVE_CAMPAIGN_SOAK_TEST_PLAN.md): comprehensive unlimited-model-call live campaign certification plan covering fresh activation, 50-turn play, Directive Assist, Command Bearing accumulation/closure/review/spend behavior, authority attacks, edit/delete/swipe retcons, Scene Reconciliation, saves, branches, wrong-chat isolation, and forensic artifacts.
- [Documentation Render Tracking](testing/DOCUMENTATION_RENDER_TRACKING.md): source-controlled render gap register, `Render needed` marker inventory, target assets, and verification commands.

## Development Notes

- [Pre-Alpha Systems](development/PRE_ALPHA_SYSTEMS.md): current pre-alpha definition, release gate, key systems, alpha blockers, alpha non-blockers, and near-term focus.
- [Visual Target Loop](development/VISUAL_TARGET_LOOP.md): GPT Image 2 concept-art workflow for page, window, feature, control-group, and state-variant UI iteration against live SillyTavern screenshots.
- [Reset Window Contract](development/RESET_WINDOW_CONTRACT.md): implementation contract for the SillyTavern Reset Window action, including shell geometry, route-local UI state, non-destructive boundaries, and test expectations.
- [SillyTavern Open-World Live Campaign Report](development/SILLYTAVERN_OPEN_WORLD_LIVE_CAMPAIGN_REPORT.md): live SillyTavern verification evidence for open-world campaign creation, chat-native turns, Director responses, sidecars, host-shell leak fixes, and remaining provider risks.
- [Turn Latency Audit 2026-06-28](development/TURN_LATENCY_AUDIT_2026_06_28.md): live Sam Vickers/Ashes latency evidence for turn orchestration, save bloat, sidecar batching, stale-source rejection, and near-term performance targets.

Development records in this section are not automatically user-facing contracts. Promote them into `user/`, `packages/`, `architecture/`, or `testing/` when the runtime behavior exists and the doc becomes part of the product contract.

## Planning

- [Pre-Alpha Refactor And Cleanup Plan](planning/PRE_ALPHA_REFACTOR_AND_CLEANUP_PLAN.md): first major cleanup contract for SillyTavern-only pre-alpha focus, Lumiverse removal, retired shell deletion, runtime decomposition, host lifecycle cleanup, CSS split, tooling cleanup, and documentation archiving.
- [Documentation Expansion Plan](planning/DOCUMENTATION_EXPANSION_PLAN.md): staged plan for expanding the README, Operator's Manual, Technical Manual, Campaign Authoring Guide, documentation renders, cross-doc alignment, and release-facing verification.
- [Documentation Render Capture Plan](planning/DOCUMENTATION_RENDER_CAPTURE_PLAN.md): live SillyTavern render harness contract, verified capture matrix, documentation-grade cleanup, and remaining fixture-state inventory.
- [Documentation Feature Audit 2026-06-27](planning/DOCUMENTATION_FEATURE_AUDIT_2026_06_27.md): repo-wide documentation drift audit covering newly implemented runtime features, release-facing update targets, and infographic/render stand-ins.
- [Campaign Flow Revision Plan](planning/CAMPAIGN_FLOW_REVISION_PLAN.md): revision plan for replacing the overloaded Campaign package-home state machine with Command, Library & Import, and Records surfaces.
- [Active Chat Save Guard Plan](planning/ACTIVE_CHAT_SAVE_GUARD_PLAN.md): planned manual-save safety guard requiring Save Game and Save Game As to verify the active host chat matches the loaded campaign save, including Save As branch metadata ownership.
- [Command Spine Migration](planning/COMMAND_SPINE_MIGRATION.md): implemented SillyTavern left command spine, single resizable drawer, full-screen workspace escalation, mobile fallback, source ownership, and tests.
- [Parallel Agent Coordination Protocol](planning/PARALLEL_AGENT_COORDINATION_PROTOCOL.md): Agent-0 orchestration and worker-agent operating model for parallel MVP, UI, Narrative Thread, Mission Director, and QA development.
- [Interface Redesign Integration Prep](planning/INTERFACE_REDESIGN_INTEGRATION_PREP.md): review of the 2026-06-20 frontier-model UI redesign bundle, with integration lanes, blockers, file ownership, and verification gates for selective adoption.
- [Backend Redesign Integration Prep](planning/BACKEND_REDESIGN_INTEGRATION_PREP.md): backend/runtime integration rules for the 2026-06-20 redesign bundle, allowing broad non-Chapter 2 adoption while protecting False Colors through Quiet Channels.
- [Architecture Redesign Proposal](planning/ARCHITECTURE_REDESIGN_PROPOSAL.md): forward-only transaction, storage, Director, CPM, Handshake, sidecar, recovery, and 5000-message/under-60-second latency redesign proposal.
- [Visual Asset And Mobile UI Integration Plan](planning/VISUAL_ASSET_AND_MOBILE_UI_INTEGRATION_PLAN.md): package-owned Breckenridge crew portrait and ship-art integration plan, with Saga-informed UI, Theme Pack, Icon Pack, style, and flow direction; its original shared bottom-navigation assumption is superseded for SillyTavern by the Command Spine Migration.
- [MVP Playable Alpha Plan](planning/MVP_PLAYABLE_ALPHA_PLAN.md): development path to a SillyTavern-first MVP alpha with complete Prelude, complete Chapter 1, probable side missions, complete UI, and side-mission generator architecture.
- [Pre-Production Roadmap](planning/PRE_PRODUCTION_ROADMAP.md): remaining pre-production stages from schema deepening through first runtime slice.
- [Next Ten Development Stages](planning/NEXT_TEN_DEVELOPMENT_STAGES.md): Stage 11-20 implementation plan and current status after completing the Prelude, transaction/retrieval hardening, package import normalization, diagnostics, and alpha gate.
- [Post-Stage 20 Implementation Plan](planning/POST_STAGE_20_IMPLEMENTATION_PLAN.md): detailed Stage 21-30 plan for Command Competence, Chapter 1's first playable frame, and the side-mission pressure framework.
- [Dual Host Support Plan](planning/DUAL_HOST_SUPPORT_PLAN.md): historical/superseded staged architecture plan for earlier SillyTavern and Lumiverse parity work; current pre-alpha cleanup is SillyTavern-only.
- [Scene Reconciliation Plan](planning/SCENE_RECONCILIATION_PLAN.md): planned retcon and branch support for reconciling changed chat passages into safe auto-applied updates or reviewed Directive state proposals, with Saga-inspired scan batching and a separate replay path for `Recalculate From Here`.
- [Model Call Robustness Pass Plan](planning/MODEL_CALL_ROBUSTNESS_PASS_PLAN.md): implementation plan for explicit provider lanes, robust turn-intent classification, sidecar JSON contracts, model-call authority boundaries, and player-safe diagnostics.
- [CPM Implementation Plan](planning/CONTINUITY_PROJECTION_MATRIX_IMPLEMENTATION_PLAN.md): staged multi-agent implementation plan for the full continuity projection service, including source frames, materializers, Utility planning, prompt lanes, guards, generated-claim quarantine, Director packets, adaptive hints, diagnostics, and live verification.
- [Campaign Character Richness Expansion Plan](planning/CAMPAIGN_CHARACTER_RICHNESS_EXPANSION_PLAN.md): staged plan for raising every non-Ashes senior-staff bible to the Ashes richness standard, then migrating those richer bibles into richer crew datasets with voice capsules, reveal gates, and director hydration.
- [Command Bearing Agent Execution Plan](planning/COMMAND_BEARING_AGENT_EXECUTION_PLAN.md): phased multi-agent build plan for Command Bearing backend, Assist controls, Readied spend runtime, Character/Crew tabs, integration freezes, and verification.
- [Command Bearing User-Facing System Plan](planning/COMMAND_BEARING_USER_FACING_SYSTEM_PLAN.md): implementation plan for Assist-adjacent point counts, Readied Inspiration/Resolve spends, pre-send fit checks, eligibility validation, refund boundaries, and provider-failure recovery.
- [Command Bearing Backend Development Plan](planning/COMMAND_BEARING_BACKEND_DEVELOPMENT_PLAN.md): backend implementation plan for Command Bearing state migration, evidence ledgers, closure-triggered Mark Reviews, relationship perception records, Readied spend transactions, projections, and verification.
- [Player Character Page And Crew Tabs Plan](planning/PLAYER_CHARACTER_PAGE_AND_CREW_TABS_PLAN.md): companion implementation plan for splitting the Crew drawer into Character and Crew tabs, adding player-character Command Bearing stats, banked points, service record, and player-safe crew interaction history.
- [Campaign End Conditions Implementation Plan](planning/CAMPAIGN_END_CONDITIONS_IMPLEMENTATION_PLAN.md): full-system rollout plan for required package end-condition schema, Ashes records, runtime detection, checkpoint decisions, replay, Push On, terminal branches, conclusion metadata, UI, and verification.
- [Initial Development Sequence](planning/INITIAL_DEVELOPMENT_SEQUENCE.md): recommended order of work before the first playable slice.
- [Director Loop Implementation Plan](planning/DIRECTOR_LOOP_IMPLEMENTATION_PLAN.md): staged plan for the first executable Mission Director loop and fixture coverage.
- [Future Creator Tools](planning/FUTURE_CREATOR_TOOLS.md): future Starship Creator and Mission Creator planning, kept out of the first release but reflected in schema and architecture choices.
- [Clarifying Questions](planning/CLARIFYING_QUESTIONS.md): design, gameplay, mechanics, package, and content questions that should be answered before implementation decisions.

## Legal And Attribution

- [Third-Party Notices](../THIRD_PARTY_NOTICES.md): MIT notices for Saga and SillyTavern-MultihogDnDFramework reference work.

## Source Briefs

The current baseline comes from source briefs copied into this repository:

- [Directive Game Design Document](source/Directive_Game_Design_Document.md)
- [Star Trek Command RPG Extension Project Brief](source/Star_Trek_Command_RPG_Extension_Project_Brief.md)
- [Directive Ashes of Peace Campaign v0.2](source/Directive_Ashes_of_Peace_Campaign_v0.2.md)
- [Directive Breckenridge Senior Staff Character Bible](source/Directive_Breckenridge_Senior_Staff_Character_Bible.md)
- [Directive Intrepid-Class Starship Bible](source/Directive_Intrepid_Class_Starship_Bible.md)
- [Directive Steamrunner-Class Starship Bible](source/Directive_Steamrunner_Class_Starship_Bible.md)
- [Directive New Orleans-Class Starship Bible](source/Directive_New_Orleans_Class_Starship_Bible.md)
- [Directive Norway-Class Starship Bible](source/Directive_Norway_Class_Starship_Bible.md)

When a decision here conflicts with those briefs, update the relevant design doc and keep the question log current.
