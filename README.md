<p align="center">
  <img src="assets/branding/directive-banner.jpg" alt="Directive Starship Command banner">
</p>

# Directive

**Directive is a pre-alpha SillyTavern extension for a persistent, freeform Star Trek command RPG.**

The primary playable campaign package is **Ashes of Peace**, centered on the player as the new Starfleet Commander and Executive Officer aboard the Intrepid-class U.S.S. Breckenridge. Directive is not hardcoded to one ship: the bundled package set also includes draft campaigns for U.S.S. Glass Harbor, U.S.S. Serein, U.S.S. Eudora Vale, U.S.S. Aster Vale, and U.S.S. Celandine. The product model revolves around loadable campaign packages that define the ship, crew, campaign frame, mission types, local worldbuilding, end conditions, and package-specific guardrails.

Directive is chat-first. The player acts through ordinary roleplay prose, while the extension maintains authoritative structured state behind the scenes. Player prose declares intent and attempted action; it does not directly rewrite reality.

Current development state: `0.1.0-pre-alpha.1`. Active pre-alpha support is SillyTavern-only, described by `manifest.json`, and requires SillyTavern `1.12.0` or newer. Lumiverse support is deferred until after the SillyTavern alpha stabilizes.

<p align="center">
  <img src="assets/documentation/readme/directive-campaign-command.png" alt="Directive Campaign command console with Ashes of Peace expanded">
</p>

## Contents

- [Fast Start](#fast-start)
- [Key Features](#key-features)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Security](#security)
- [Project Layout](#project-layout)
- [Storage](#storage)
- [Authoring Campaign Packages](#authoring-campaign-packages)
- [Verification](#verification)
- [Source Material](#source-material)
- [License](#license)

## Fast Start

### SillyTavern

1. Install Directive from the repo git URL in SillyTavern (**Extensions > Install Extension**) and reload the page.
2. Open **Extensions > Directive**. In **Settings > Providers**, install or update the [Directive SillyTavern preset](docs/user/SILLYTAVERN_PRESET.md), then configure your Utility Provider (fast and cheap model, e.g. nvidia/nemotron-3-ultra-550b-a55b:thinking) and Reasoning Provider (GLM-5.2, Deepseek-V4 Pro, Opus 4.8, and other frontier models).
3. In **Campaign > Library & Import**, select **Ashes of Peace** and choose **Create Character**.
4. Complete the guided character creation, choose the Campaign Difficulty, use **Save Draft** if you need to pause, then select **Start Campaign**.
5. Directive creates and selects its own host character card, opens a fresh campaign chat, posts the intro once, installs player-safe campaign context, and marks the first save active. You do not need to create or select a SillyTavern character/group first.
6. Play by writing normal in-character posts in the campaign chat. Use **Mission** for active context, pause decisions, Open Threads/Open World work, committed outcomes, and recovery; use **Campaign** for saves, records, package import, and chat-binding recovery.

<p align="center">
  <img src="assets/documentation/renders/docs-directive-character-creator-review.png" alt="Directive Character Creator review dossier">
</p>

Use [First Campaign Workflow](docs/user/FIRST_CAMPAIGN_WORKFLOW.md) for the play path and [Directive Operator Manual](docs/user/DIRECTIVE_OPERATOR_MANUAL.md) for runtime details.

## Key Features

| Surface | What it does |
| --- | --- |
| **Chat-Native Campaign Activation** | Accepts the Character Creator draft, creates the first save, creates a fresh campaign chat, posts one intro, installs prompt context, and resumes safely after partial failure. |
| **Dual Provider Routing** | Separates low-cost Utility work from deeper Reasoning work, lets operators route individual model-call roles between lanes, and supports the current host model, SillyTavern Connection Profiles, and session-key OpenAI-compatible endpoints. |
| **Scene Handshake And Utility Turn Gate** | Settles accepted host-generated scene prose into source-backed assignments, Log entries, ship readiness, and thread signals before classifying the next player post through deterministic fast paths or Utility fallback. |
| **Mission Director** | Resolves consequential freeform intent through deterministic-first mission, adjudication, retrieval, state-delta, narrator, and Command Log packets. |
| **Continuity Projection Matrix** | Projects source-backed continuity facts into stable player-safe prompt lanes and Director-specific packets, with planner validation, source hashes, contradiction hints, and live factual-grounding proof. |
| **Timekeeping Header** | Prefixes bound-campaign replies with the current `Stardate \| ship time` display header while keeping time advancement deterministic and separate from model inference. |
| **Mechanics-First Durability** | Persists committed mechanics before narration or host posting, so retries reuse the same outcome rather than rerolling it. |
| **Deep Campaign Tracking** | Maintains revisioned, bounded snapshots plus ingress, response, recovery, sidecar, and pending-interaction journals scoped to the campaign/chat binding. |
| **Validated Sidecars** | Runs continuity, relationship, crew, ship, Command Bearing, and side-work workers as proposal-only jobs whose operations require authorized roots and a current base revision. |
| **Player-Safe Prompt Context** | Builds explicit campaign, player, scene, fact, crew, ship, log, pressure, and narrator blocks; supports install, update, clear, rebuild, inspection, and chat-switch suspension. |
| **Command Competence And Bearing** | Supplies routine Starfleet procedure while preserving player judgment, and offers transaction-safe Inspiration/Resolve interventions at eligible pauses. |
| **Tips, Tutorials, And Training Preview** | Provides first-run and feature tutorials, Show Me targeting, startup tips, Settings controls, and an inert populated training scenario that teaches drawers without writing real saves or chats. |
| **Persistent Saves And Recovery** | Supports drafts, first saves, autosaves, branches, load, edit/delete reconciliation, prompt rebuild, response retry, narration rewrite, outcome rerun, and rollback. |
| **Campaign Conclusion** | Commits a recoverable closing record, posts the final scene, completes the save, clears injection, and exposes archival. |
| **SillyTavern Host Boundary** | Keeps runtime services behind host contracts while SillyTavern owns storage, generation, prompt, chat, event, and shell integration. The fake host remains for deterministic contract tests. |

<p align="center">
  <img src="assets/documentation/renders/docs-directive-mission-active.png" alt="Directive Mission active play support surface">
</p>

## Documentation

Release notes:

- [Directive 0.1.0-pre-alpha.1](docs/release/0.1.0-pre-alpha.1.md)
- [Chat-Native Target Flow Checkpoint](docs/release/CHAT_NATIVE_TARGET_FLOW_CHECKPOINT.md)

Release-facing docs are grouped by reader path. Use the [Documentation Index](docs/DOCUMENTATION_INDEX.md) for the complete map.

Operator start:

- [First Campaign Workflow](docs/user/FIRST_CAMPAIGN_WORKFLOW.md)
- [Directive Operator Manual](docs/user/DIRECTIVE_OPERATOR_MANUAL.md)

Host setup and operations:

- [SillyTavern Preset](docs/user/SILLYTAVERN_PRESET.md)
- [Storage And State Safety](docs/user/STORAGE_AND_STATE_SAFETY.md)

Technical manuals:

- [Directive Technical Manual](docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md)
- [Continuity Projection Matrix](docs/technical/CONTINUITY_PROJECTION_MATRIX.md)
- [Model Calls And Provider Routing](docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md)
- [Player Turn Sequence](docs/technical/PLAYER_TURN_SEQUENCE.md)
- [Timekeeping System](docs/architecture/TIMEKEEPING_SYSTEM.md)
- [Chat-Native Runtime](docs/architecture/CHAT_NATIVE_RUNTIME.md)
- [Mission Director As-Coded](docs/architecture/MISSION_DIRECTOR_AS_CODED.md)

Campaign authoring and package contracts:

- [Campaign Authoring Guide](docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md)
- [Campaign Package Model](docs/packages/CAMPAIGN_PACKAGE_MODEL.md)
- [Campaign Package Schema](docs/packages/CAMPAIGN_PACKAGE_SCHEMA.md)
- [Campaign Schema Reference](docs/authoring/CAMPAIGN_SCHEMA_REFERENCE.md)
- [LLM Campaign Authoring Guide](docs/authoring/LLM_CAMPAIGN_AUTHORING_GUIDE.md)

Bundled campaign references:

- [Glass Harbor / Drowned Constellation](docs/campaigns/GLASS_HARBOR_DROWNED_CONSTELLATION.md)
- [Serein / Black Current](docs/campaigns/SEREIN_BLACK_CURRENT.md)
- [Eudora Vale / Broken Accord](docs/campaigns/EUDORA_VALE_BROKEN_ACCORD.md)
- [Aster Vale / Unseen Border](docs/campaigns/ASTER_VALE_UNSEEN_BORDER.md)
- [Celandine / Enemy's Garden](docs/campaigns/CELANDINE_ENEMYS_GARDEN.md)

Feature and design checkpoints:

- [Scene Handshake Protocol](docs/design/SCENE_HANDSHAKE_PROTOCOL.md)
- [Directive Tutorial Revision](docs/design/DIRECTIVE_TUTORIAL_REVISION.md)
- [Outcome Integrity](docs/design/OUTCOME_INTEGRITY.md)
- [Command Spine Migration](docs/planning/COMMAND_SPINE_MIGRATION.md)

Release verification:

- [Testing Strategy](docs/testing/TESTING_STRATEGY.md)

Development notes live in [docs/development](docs/development/) and [docs/planning](docs/planning/) until promoted, rewritten, or archived as release-facing docs.

## Roadmap

- Run repeatable live SillyTavern smoke for automatic chat creation, interceptor ordering, Connection Profile calls, prompt placement, Scene Handshake settlement, message edit/delete payloads, and post/save failure recovery.
- Revisit future host adapters, including possible Lumiverse support, only after the SillyTavern alpha contract is stable.
- Deepen provider-assisted relationship, crew, ship, and continuity proposals while keeping state mutation revision-checked and proposal-only.
- Promote Outcome Integrity from design contract into a fully documented user-facing edit-review flow once the runtime behavior is complete.
- Add the planned time-adjudication layer on top of the current deterministic reply-header foundation.
- Expand package management with export, delete, update comparison, and richer trust review.
- Add richer branch comparison and campaign archive/export UX without weakening the authoritative save model.

## Security

Directive runs as a browser-side SillyTavern extension. It does not require a SillyTavern server plugin for the current SillyTavern storage model.

Campaign package imports are intended to be data-only. The current `.directive-campaign.zip` normalizer rejects unsafe paths and active file types such as scripts, HTML, executables, scriptable SVG, and WebAssembly. Imported packages can still affect prompt content after you load and use them, so treat packages from unknown sources as untrusted prompt material.

Utility and Reasoning requests route through the selected host model, SillyTavern Connection Profile, or direct OpenAI-compatible endpoint. Per-role routing overrides are persisted as non-secret settings. Direct endpoint keys are session-only and are not serialized into extension settings or campaign saves.

Narration routes through the active host generation adapter. Provider or host-post failures after a structured mechanics commit are retried from the same committed packet instead of rerolling mechanics.

## Project Layout

```text
assets/                 Branding, icons, documentation assets, and passive package assets.
content/                Authoring-source campaign content before normalization.
docs/                   Release-facing docs, architecture notes, planning, testing, and source briefs.
packages/               Normalized bundled and example campaign package records.
schemas/                JSON schemas for packages, campaign projection, and mission contracts.
src/                    Runtime source split by ownership.
styles/                 Directive CSS entrypoints.
tests/                  Fixtures, browser, visual, storage, unit, and contract test notes.
tools/scripts/          Dependency-free validators, contract tests, and alpha gate scripts.
```

Important runtime modules:

- `src/extension/index.js`: SillyTavern manifest-facing entrypoint shim.
- `src/hosts/sillytavern/`: SillyTavern lifecycle, chat creation/binding, message observation, prompt injection, dual-provider routing, storage, generation, and shell integration.
- `src/hosts/fake/`: deterministic host-contract utilities for tests.
- `src/ui/directive-command-spine-shell.js`: SillyTavern left command spine, single drawer, mobile fallback, and resize handle.
- `src/ui/directive-shell-layout.mjs`: persisted drawer geometry and viewport constraints.
- `src/runtime/runtime-shell.js`: Directive route state, drawer/full-screen behavior, resizing, and panel routing.
- `src/runtime/runtime-app.mjs`: composition root for package loading, activation, chat orchestration, Director commit, prompt synchronization, recovery, conclusion, and UI projections.
- `src/runtime/chat-turn-orchestrator.mjs`: serialized ingress, utility routing, pause handling, exact-one response arbitration, and response recovery.
- `src/runtime/state-delta-gateway.mjs`: revisioned state mutation, bounded snapshots, journals, authorization, and recovery.
- `src/providers/directive-provider-settings.mjs`: independent Utility and Reasoning provider configuration.
- `src/runtime/campaign-start-controller.mjs`: Campaign and Character Creator view models over the campaign-start service.
- `src/mission/director.mjs`: current deterministic Mission Director loop.
- `src/campaign/transaction-state.mjs`: commit, swipe, rerun, delete, restore, and branch-safe state mutation.
- `src/competence/`: Command Competence packet builders and policy helpers.
- `src/pressures/`: pressure ledger normalization, deterministic pressure seeding, side-mission candidate selection, Open Orders review state, assignment scene activation/beats, and assignment resolution/progress state.
- `src/packages/campaign-package-importer.mjs`: `.directive-campaign.zip` import normalizer.
- `src/storage/directive-storage-repository.mjs`: indexed JSON storage repository for drafts and campaign saves.

## Storage

Settings should stay compact: preferences, pointers, active package/save references, and lightweight diagnostics. Drafts, campaign saves, turn ledgers, Command Log records, imported package payloads, and future creator projects should live as Directive-owned logical JSON records. SillyTavern maps those records to flat files under `/user/files`; the fake host keeps direct logical-key mapping for deterministic tests.

Directive separates reusable package data from campaign-owned state. A package defines the ship and campaign template; a save records what happened in one playthrough. Campaign state is authoritative over narration and Command Log prose.

See [Storage And State Safety](docs/user/STORAGE_AND_STATE_SAFETY.md) for the current storage contract.

## Authoring Campaign Packages

Directive packages use the approved top-level spine:

```text
manifest
ship
crew
characterCreation
world
storyArcs
endConditions
questTemplates
threadTemplates
reactionRules
directorCards
contextPolicy
guardrails
assets
```

The primary reference package is [packages/bundled/breckenridge/ashes-of-peace.campaign-package.json](packages/bundled/breckenridge/ashes-of-peace.campaign-package.json). Additional bundled draft packages live under [packages/bundled/glass-harbor](packages/bundled/glass-harbor/), [packages/bundled/serein](packages/bundled/serein/), [packages/bundled/eudora-vale](packages/bundled/eudora-vale/), [packages/bundled/aster-vale](packages/bundled/aster-vale/), and [packages/bundled/celandine](packages/bundled/celandine/). Start with [Campaign Authoring Guide](docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md), [Campaign Package Structure](docs/authoring/CAMPAIGN_PACKAGE_STRUCTURE.md), [Campaign Schema Reference](docs/authoring/CAMPAIGN_SCHEMA_REFERENCE.md), [Campaign Package Model](docs/packages/CAMPAIGN_PACKAGE_MODEL.md), and [Campaign Package Schema](docs/packages/CAMPAIGN_PACKAGE_SCHEMA.md).

Reference-quality packages should be data-only, schema-valid, mission-graph driven, and explicit about hidden truth, reveal gates, Character Creator constraints, Command Competence metadata, quest templates, thread templates, reaction rules, Director cards, context policy, guardrails, assets, and player-facing safety.

## Verification

Run the current alpha gate:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

The gate validates the extension shell, dual-provider routing, SillyTavern chat/prompt/event lifecycle, campaign activation, reply-header timekeeping, Scene Handshake settlement, utility classification, exact-one response behavior, mechanics-first recovery, player-safe prompt projection, state-delta authorization, sidecar scheduling, message reconciliation, tutorial/training targets, campaign conclusion, bundled package contracts, Mission Director behavior, storage, transaction safety, SillyTavern plus fake-host contract coverage, and repository structure.

For a local SillyTavern server, sync the installed extension copy, then run:

```powershell
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SILLYTAVERN_BROWSER='1'
$env:DIRECTIVE_SILLYTAVERN_SCREENSHOTS='1'
$env:DIRECTIVE_SILLYTAVERN_RESIZE_SWEEP='1'
node tools\scripts\smoke-sillytavern-live.mjs
```

## Source Material

The initial documentation and package contracts were derived from repo-local source briefs:

- [Directive Game Design Document](docs/source/Directive_Game_Design_Document.md)
- [Star Trek Command RPG Extension Project Brief](docs/source/Star_Trek_Command_RPG_Extension_Project_Brief.md)
- [Directive Ashes of Peace Campaign v0.2](docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md)
- [Directive Breckenridge Senior Staff Character Bible](docs/source/Directive_Breckenridge_Senior_Staff_Character_Bible.md)
- Saga as a reference for Utility/Reasoning provider separation and SillyTavern provider routing.
- SillyTavern Multihog DnD Framework as a reference for chat-scoped tracking, history, restoration, and durable state updates.
- See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for attribution and license text.

## License

See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
