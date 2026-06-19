# Directive

**Directive is a pre-alpha SillyTavern extension for a persistent, freeform Star Trek command RPG.**

The first supported starship package is **Ashes of Peace**, centered on the player as the new Starfleet Commander and Executive Officer aboard the Intrepid-class U.S.S. Breckinridge. Directive is not hardcoded to one ship: the product model revolves around loadable starship packages that define the ship, crew, campaign frame, mission types, local worldbuilding, and package-specific guardrails.

Directive is chat-first. The player acts through ordinary roleplay prose, while the extension maintains authoritative structured state behind the scenes. Player prose declares intent and attempted action; it does not directly rewrite reality.

Current development state: `0.1.0-pre-alpha.1`, minimum SillyTavern version `1.12.0`, automatic updates disabled.

## Contents

- [Fast Start](#fast-start)
- [Key Features](#key-features)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Security](#security)
- [Project Layout](#project-layout)
- [Storage](#storage)
- [Authoring Starship Packages](#authoring-starship-packages)
- [Verification](#verification)
- [Source Material](#source-material)
- [License](#license)

## Fast Start

1. Copy the Directive GitHub URL:

   ```text
   https://github.com/MentallyQuill/Directive
   ```

2. In SillyTavern, open **Extensions** and install the extension from the copied URL. Reload the page.
3. Open the SillyTavern extensions menu and choose **Directive**.
4. On **Starships**, choose **Start Campaign** for the bundled Breckinridge package.
5. Fill the package-owned Character Creator draft, choose `Command` or `Exploration`, then choose **Begin**.
6. On **Mission**, write what the XO does, choose **Preview Outcome**, review the Command Brief or Procedure Check, then accept the outcome, confirm the risk, invoke an eligible Command Bearing point, or revise the order.

For the current playable path, start with [First Campaign Workflow](docs/user/FIRST_CAMPAIGN_WORKFLOW.md). For a surface-by-surface guide, see [Directive Operator Manual](docs/user/DIRECTIVE_OPERATOR_MANUAL.md).

## Key Features

| Surface | What it does |
| --- | --- |
| **Starship Packages** | Package the ship, crew, Character Creator context, campaign frame, mission graphs, side mission rules, guardrails, and passive assets. |
| **Starships Tab** | Lists package health, creator drafts, and saves; starts campaigns; resumes drafts; and loads saves. |
| **Character Creator** | Uses package-owned options to create the player-character record before the first campaign save is written. |
| **Mission Director** | Resolves freeform player intent through deterministic-first mission, adjudication, retrieval, state-delta, narrator, and Command Log packets. |
| **Command Competence** | Supplies routine professional actions, Command Briefs, Domain Reports, Request Counsel, warnings, authority notes, and no-gotcha checks. |
| **Command Bearing** | Tracks Inspiration and Resolve as typed leadership resources with limited, transaction-safe outcome interventions. |
| **Pressure Ledger** | Records campaign-owned crew, ship, regional, and obligation pressures that can route future Open Orders without exposing hidden truth. |
| **Persistent Saves** | Supports Character Creator drafts, first saves, Save Game, Save As branches, Load Save, stable-turn autosaves, and explicit recovery controls. |
| **Simulation Modes** | Provides `Command` for full deterministic consequences and `Exploration` for softer consequence ceilings without erasing causality. |
| **Host Boundary** | Targets SillyTavern first while planning host-neutral adapters for future runtime surfaces. |

## Documentation

Release notes:

- [Directive 0.1.0-pre-alpha.1](docs/release/0.1.0-pre-alpha.1.md)

Release-facing docs:

- [Documentation Index](docs/DOCUMENTATION_INDEX.md)
- [First Campaign Workflow](docs/user/FIRST_CAMPAIGN_WORKFLOW.md)
- [Directive Operator Manual](docs/user/DIRECTIVE_OPERATOR_MANUAL.md)
- [Storage And State Safety](docs/user/STORAGE_AND_STATE_SAFETY.md)
- [Starship Package Model](docs/packages/STARSHIP_PACKAGE_MODEL.md)
- [Starship Package Schema](docs/packages/STARSHIP_PACKAGE_SCHEMA.md)
- [Mission Director As-Coded](docs/architecture/MISSION_DIRECTOR_AS_CODED.md)
- [Testing Strategy](docs/testing/TESTING_STRATEGY.md)

Development notes live in [docs/development](docs/development/) and [docs/planning](docs/planning/) until promoted, rewritten, or archived as release-facing docs.

## Roadmap

- Expand Chapter 1 beyond the first response and pressure handoff.
- Add live SillyTavern smoke coverage for the current runtime shell.
- Build player-facing starship package import/export around the existing normalizer.
- Deepen save/branch management and State Safety maintenance controls.
- Continue splitting shared engine code from SillyTavern-specific host integration.
- Add Starship Creator and Mission Creator only after the package and mission graph contracts stay stable.

## Security

Directive is a browser-side SillyTavern extension. It does not require a server plugin for its current storage model.

Starship package imports are intended to be data-only. The current `.directive-starship.zip` normalizer rejects unsafe paths and active file types such as scripts, HTML, executables, scriptable SVG, and WebAssembly. Imported packages can still affect prompt content after you load and use them, so treat packages from unknown sources as untrusted prompt material.

Narration currently routes through the available SillyTavern generation surface. Provider failures after a structured mechanics commit should be retried from the same committed packet instead of rerolling mechanics.

## Project Layout

```text
assets/                 Branding, icons, documentation assets, and passive package assets.
content/                Authoring-source starship content before normalization.
docs/                   Release-facing docs, architecture notes, planning, testing, and source briefs.
packages/               Normalized bundled and example starship package records.
schemas/                JSON schemas for packages, campaign projection, and mission contracts.
src/                    Runtime source split by ownership.
styles/                 Directive CSS entrypoints.
tests/                  Fixtures, browser, visual, storage, unit, and contract test notes.
tools/scripts/          Dependency-free validators, contract tests, and alpha gate scripts.
```

Important runtime modules:

- `src/extension/index.js`: extension entrypoint and SillyTavern integration.
- `src/runtime/runtime-shell.js`: Directive window, tabs, and panel routing.
- `src/runtime/runtime-app.mjs`: package loading, active campaign state, Director preview/commit workflow, narration handoff, and autosave orchestration.
- `src/runtime/campaign-start-controller.mjs`: Starships and Character Creator view models over the campaign-start service.
- `src/mission/director.mjs`: current deterministic Mission Director loop.
- `src/campaign/transaction-state.mjs`: commit, swipe, rerun, delete, restore, and branch-safe state mutation.
- `src/competence/`: Command Competence packet builders and policy helpers.
- `src/pressures/`: pressure ledger, scoring, cooldowns, and side-mission candidate selection.
- `src/packages/starship-package-importer.mjs`: `.directive-starship.zip` import normalizer.
- `src/storage/directive-storage-repository.mjs`: indexed JSON storage repository for drafts and campaign saves.

## Storage

Settings should stay compact: preferences, pointers, active package/save references, and lightweight diagnostics. Drafts, campaign saves, turn ledgers, Command Log records, imported package payloads, and future creator projects should live as Directive-owned flat JSON files under SillyTavern `/user/files`.

Directive separates reusable package data from campaign-owned state. A package defines the ship and campaign template; a save records what happened in one playthrough. Campaign state is authoritative over narration and Command Log prose.

See [Storage And State Safety](docs/user/STORAGE_AND_STATE_SAFETY.md) for the current storage contract.

## Authoring Starship Packages

Directive packages use the approved top-level spine:

```text
manifest
ship
crew
characterCreation
mainCampaign
sideMissionRules
missionTemplates
guardrails
assets
```

The first reference package is [packages/bundled/breckinridge/ashes-of-peace.starship-package.json](packages/bundled/breckinridge/ashes-of-peace.starship-package.json). Start with [Starship Package Model](docs/packages/STARSHIP_PACKAGE_MODEL.md) and [Starship Package Schema](docs/packages/STARSHIP_PACKAGE_SCHEMA.md).

Reference-quality packages should be data-only, schema-valid, mission-graph driven, and explicit about hidden truth, reveal gates, Character Creator constraints, Command Competence metadata, pressure seeds, side mission rules, and player-facing safety.

## Verification

Run the current alpha gate:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

The gate validates the extension shell, runtime flow, package schema, package import normalization, campaign start, storage repository, Mission Director contracts, Command Competence, Command Bearing, pressure handoff, transaction safety, and repository structure.

## Source Material

The initial documentation and package contracts were derived from repo-local source briefs:

- [Directive Game Design Document](docs/source/Directive_Game_Design_Document.md)
- [Star Trek Command RPG Extension Project Brief](docs/source/Star_Trek_Command_RPG_Extension_Project_Brief.md)
- [Directive Ashes of Peace Campaign v0.2](docs/source/Directive_Ashes_of_Peace_Campaign_v0.2.md)
- [Directive Breckinridge Senior Staff Character Bible](docs/source/Directive_Breckinridge_Senior_Staff_Character_Bible.md)
- Current review of `F:/git/Saga` as a reference for documentation structure, platform integration, storage, testing, and release-gate patterns.

## License

See [LICENSE](LICENSE).
