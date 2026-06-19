# Pre-Alpha Systems

This document identifies the major systems Directive needs coherent before it can move from pre-alpha into a useful alpha test.

## Pre-Alpha Definition

Directive is pre-alpha while the first playable campaign loop, persistence model, package schema, and runtime shell are still being proven.

Pre-alpha is ready to become alpha when testers can:

- Install and open Directive in SillyTavern without console-breaking runtime errors.
- Start the bundled Breckinridge/Ashes of Peace campaign.
- Create and save a player character through package-owned Character Creator data.
- Play the Prelude and first Chapter 1 frame with fair Command Competence support.
- Save, load, branch, rerun, delete, and recover narration without corrupting state.
- See player-safe Mission, Crew, Ship, Log, Settings, pressure, and package-health information.
- Run the alpha gate and get deterministic evidence for the core contracts.

Alpha does not require every chapter, side mission, host adapter, creator tool, or mobile polish pass. It does require the core loop to be coherent enough that feedback is meaningful.

## Current Development Stage

Directive currently has:

- Clean extension identity and SillyTavern menu integration.
- A tabbed runtime shell.
- A package-driven Character Creator and first-save path.
- A bundled Breckinridge/Ashes of Peace package with schema and diagnostic coverage.
- Prelude mission coverage through final command review.
- Chapter 1 activation and first-response pressure handoff.
- Command Competence MVP behavior for the current Chapter 1 opening slice.
- Command Bearing MVP helpers and runtime intervention prompts.
- Campaign-owned pressure ledger records and Open Orders candidate selection.
- Adapter-backed storage repository tests.
- A dependency-free alpha gate.

The main risk has shifted from missing scaffolding to cross-system correctness: the same committed turn must stay consistent across Mission Director packets, campaign state, narration retries, Command Log rows, pressure records, saves, and branch recovery.

## Release Metadata And Gate

Current release metadata:

```text
version: 0.1.0-pre-alpha.1
key: directive
minimum_client_version: 1.12.0
auto_update: false
```

Before any alpha checkpoint, run:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

The gate should remain fast and deterministic. Live SillyTavern smoke testing should follow when a change depends on host UI, provider routing, or browser runtime behavior.

## Key Systems

### 1. Runtime Shell

The shell must keep opening, closing, tab routing, and panel rendering separate from storage writes, provider calls, and mission resolution.

Current entry points:

- `src/extension/index.js`
- `src/extension/bootstrap.js`
- `src/runtime/runtime-shell.js`
- `src/runtime/runtime-app.mjs`

### 2. Starship Package System

Bundled, imported, and future Creator-made packages should share one schema and diagnostics path.

Current anchors:

- `schemas/starship-package.schema.json`
- `packages/bundled/breckinridge/ashes-of-peace.starship-package.json`
- `src/packages/starship-package-importer.mjs`
- `src/packages/package-diagnostics.mjs`

### 3. Campaign Start And Saves

Campaign start must remain package-driven and storage-backed. Character Creator drafts are not campaign saves; accepting a draft creates campaign state and the first save.

Current anchors:

- `src/campaign/campaign-start.mjs`
- `src/campaign/campaign-start-service.mjs`
- `src/runtime/campaign-start-controller.mjs`
- `src/storage/save-records.mjs`

### 4. Mission Director

The Mission Director owns structured turn packets, not final prose. It must preserve input immutability, audience visibility, phase advancement, state-delta validation, and hidden-truth safety.

Current anchors:

- `src/mission/director.mjs`
- `src/adjudication/*`
- `src/retrieval/*`
- `src/campaign/transaction-state.mjs`

### 5. Command Competence

The system supplies routine professional competence while leaving command judgment to the player. It should prevent procedural gotchas without becoming an answer menu.

Current anchors:

- `src/competence/*`
- `docs/design/COMMAND_COMPETENCE_LAYER.md`
- `tests/fixtures/competence/*`

### 6. Command Bearing

Inspiration and Resolve are typed leadership tracks and limited interventions. They are not morality, luck, or passive bonuses.

Current anchors:

- `src/command/command-bearing.mjs`
- `docs/design/COMMAND_BEARING_SYSTEM.md`

### 7. Pressure Ledger And Open Orders

Pressure records are campaign-owned. They connect main mission consequences to future side work without exposing director-only truth or generating disconnected errands.

Current anchors:

- `src/pressures/*`
- `docs/planning/POST_STAGE_20_IMPLEMENTATION_PLAN.md`

### 8. Storage And State Safety

Settings stay compact. Drafts, saves, campaign payloads, and indexes use Directive-owned flat JSON records through a host adapter.

Current anchors:

- `src/storage/*`
- `docs/architecture/PERSISTENCE_AND_CONTINUITY.md`
- `docs/user/STORAGE_AND_STATE_SAFETY.md`

### 9. Host Boundary

The active runtime is SillyTavern. Dual-host support is planned through a host contract after the Stage 30 gate is stable.

Current anchors:

- `src/hosts/`
- `docs/planning/DUAL_HOST_SUPPORT_PLAN.md`

## Alpha Blockers

- Directive cannot open reliably in SillyTavern.
- Character Creator drafts or first campaign saves are lost or mutate package templates.
- The Prelude or Chapter 1 opening cannot be proven by deterministic tests.
- Command Briefs, Domain Reports, pressure summaries, narrator packets, or Command Log text leak hidden truth.
- Save/load, branch, rerun, delete, or narration retry corrupts authoritative campaign state.
- Package diagnostics miss package/projection/dataset/mission-graph mismatches.
- `run-alpha-gate.mjs` is not green.

## Alpha Non-Blockers

- Complete Ashes of Peace campaign coverage.
- Starship Creator and Mission Creator.
- Full player-facing import/export UI.
- Full mobile operator manual.
- Provider-assisted Command Log summarization.
- Automatic chat edit/delete event interception.
- Lumiverse adapter parity.

## Current Focus

1. Keep the alpha gate green.
2. Expand Chapter 1 beyond the first response without hardcoding one-off shortcuts.
3. Preserve the package/campaign boundary as new mission data is added.
4. Keep hidden state out of player-facing packets.
5. Add live SillyTavern smoke coverage for the current runtime shell.
6. Promote docs from planning/development into user-facing docs only after runtime behavior exists.
