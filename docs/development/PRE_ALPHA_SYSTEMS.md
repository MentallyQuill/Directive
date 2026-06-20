# Pre-Alpha Systems

This document identifies the major systems Directive needs coherent before it can move from pre-alpha into a useful alpha test.

## Pre-Alpha Definition

Directive is pre-alpha while the first playable campaign loop, persistence model, package schema, and runtime shell are still being proven.

Pre-alpha is ready to become alpha when testers can:

- Install and open Directive in SillyTavern without console-breaking runtime errors.
- Start the bundled Breckenridge/Ashes of Peace campaign.
- Create and save a player character through package-owned Character Creator data.
- Play the Prelude and complete Chapter 1 with fair Command Competence support, then inspect current Chapter 2 preview and Open Orders I proof surfaces without hidden-state leakage.
- Save, load, branch, rerun, delete, and recover narration without corrupting state.
- See player-safe Mission, Crew, Ship, Log, Settings, pressure, and package-health information.
- Run the alpha gate and get deterministic evidence for the core contracts.

Alpha does not require every chapter, side mission, host adapter, creator tool, or mobile polish pass. It does require the core loop to be coherent enough that feedback is meaningful.

## Current Development Stage

Directive currently has:

- Clean extension identity and SillyTavern menu integration.
- A bottom-navigation runtime shell.
- A package-driven Character Creator and first-save path.
- A bundled Breckenridge/Ashes of Peace package with schema and diagnostic coverage.
- Prelude mission coverage through final command review.
- Chapter 1 activation, first-response pressure handoff, first boarding-threshold slice, actor/front persistence, first-contact execution, offsite shelter/custody/cargo lead framing, first Pell contact terms, joint inspection execution, cargo diagnostic pulse tracing, hardware recovery under seal, cooperative convoy-crisis resolution terms, the Asterion/False Colors transition, the first Chapter 2 transparency-terms slice, the Orison evidence-baseline slice, the Aegis medical-trust slice, the security-access demonstration slice, and the joint investigation charter/Open Orders transition slice.
- Command Competence MVP behavior across the current Chapter 1 path, with player-safe carry-forward into Chapter 2 preview slices.
- Command Bearing MVP helpers and runtime intervention prompts.
- Campaign-owned pressure ledger records, Open Orders candidate selection, Open Orders review persistence, Open Orders I assignment scene activation, first scene-beat progress, and assignment resolution/progress state for all three authored first-interval assignments, with The Long Repair and Borrowed Wings marked as complete multi-beat MVP assignments.
- Deterministic post-Chapter-1 side-mission opportunity detection for player-safe Missing Hardware Audit, Quarantine Review, and Pell Terms Follow-Up candidates from committed state, with Mission-panel Schedule/Defer, Open, Advance, Resolve, and Delegate controls that persist campaign-owned follow-up review, scene, and resolution state.
- Provider-assisted side-mission proposal contracts for candidate phrasing and scene framing, with fake-provider coverage for accepted proposals, invalid JSON, provider failure, hidden-leak rejection, authority-key rejection, and campaign immutability; live SillyTavern has accepted and persisted proposal-only follow-up diagnostics.
- An initial LLM-assisted Command Log summary sidecar over committed, player-visible state.
- Data-only Theme Pack and Icon Pack foundations plus package image fallback behavior for the bottom-navigation UI.
- A hidden Narrative Thread ledger foundation for later B-story and side-work promotion.
- Static SillyTavern live-host source smoke, strict browser/storage/provider smoke through Playwright or Edge/Chrome CDP, repeatable desktop/phone route screenshot geometry, and manual browser verification of creator mode persistence, post-Chapter-1 Follow-Up Opportunity scheduling and scene play, Settings safety controls, phone-width layout, and route surfaces.
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

The shell must keep opening, closing, tab routing, and panel rendering separate from storage writes, provider calls, and mission resolution. Directive's shell control schema uses shared bottom navigation for routes across hosts. Back, close, refresh, save, and overflow controls remain explicit shell or route-local actions rather than panel-owned floating controls.

Current entry points:

- `src/extension/index.js`
- `src/extension/bootstrap.js`
- `src/hosts/sillytavern/bootstrap.js`
- `src/runtime/runtime-shell.js`
- `src/runtime/runtime-app.mjs`

### 2. Starship Package System

Bundled, imported, and future Creator-made packages should share one schema and diagnostics path.

Current anchors:

- `schemas/starship-package.schema.json`
- `packages/bundled/breckenridge/ashes-of-peace.starship-package.json`
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

Settings stay compact. Drafts, saves, campaign payloads, and indexes use Directive-owned logical JSON records through a host adapter.

Current anchors:

- `src/storage/*`
- `docs/architecture/PERSISTENCE_AND_CONTINUITY.md`
- `docs/user/STORAGE_AND_STATE_SAFETY.md`

### 9. Host Boundary

The active playable runtime remains SillyTavern, but the dual-host contract is now in place. SillyTavern and Lumiverse support share the same engine through host adapters. The Lumiverse descriptor targets the 1.0.4 Spindle extension surface while keeping MVP permissions limited to `generation`, `interceptor`, and `tools`.

Current anchors:

- `src/hosts/`
- `docs/planning/DUAL_HOST_SUPPORT_PLAN.md`

## Alpha Blockers

- Directive cannot open reliably in SillyTavern.
- Character Creator drafts or first campaign saves are lost or mutate package templates.
- The Prelude or complete Chapter 1 MVP path cannot be proven by deterministic tests.
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
2. Keep provider-assisted proposal and scene-framing contracts proposal-only while live-host diagnostics mature.
3. Preserve the package/campaign boundary as new mission data is added.
4. Keep hidden state out of player-facing packets.
5. Keep live SillyTavern browser/storage/provider/screenshot automation repeatable through Playwright or Edge/Chrome CDP.
6. Promote docs from planning/development into user-facing docs only after runtime behavior exists.
