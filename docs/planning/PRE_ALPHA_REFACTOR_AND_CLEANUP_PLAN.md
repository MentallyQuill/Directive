# Pre-Alpha Refactor And Cleanup Plan

## Purpose

Directive has reached the point where the fastest path to a playable alpha is not more additive feature work. The first major pre-alpha cleanup should reduce support surfaces, remove stale scaffolding, and split the largest runtime modules along the ownership boundaries the current code has proven.

This plan is a source-controlled cleanup contract. It is intentionally allowed to remove old code and update contracts in place because Directive is pre-alpha and does not need to preserve legacy compatibility for old installs, old saves, dormant host support, or old test scaffolds.

## Core Decisions

### 1. Make The Pre-Alpha Product SillyTavern-Only

Directive should remove active Lumiverse support from the pre-alpha product surface.

Reason:

- Recent product behavior, live verification, UI placement fixes, prompt behavior, save binding, edit/delete recovery, and host feedback work have all centered on SillyTavern.
- Lumiverse support carries a real maintenance load: `src/hosts/lumiverse/`, `src/frontend.ts`, `spindle.json`, Lumiverse tests, live smoke scripts, and user docs all force every runtime and UI refactor to maintain a second host path.
- The current Lumiverse path is not close enough to parity with the bespoke SillyTavern behavior to justify keeping it active during the first alpha cleanup.
- Pre-alpha status means deleting the adapter now is cleaner than preserving dormant compatibility code.

Target:

- Keep Directive host-neutral where it directly improves SillyTavern quality or fake-host testing.
- Keep `src/hosts/fake/` and host contract tests as deterministic support for runtime services.
- Remove Lumiverse as a declared product target for now.
- Leave a short future-support note in docs: Lumiverse may return after SillyTavern alpha stabilizes, but it is not a near-term milestone.

### 2. Collapse Historical UI Scaffolding

The command-spine shell is the active shell. The old compact shell is historical scaffolding and should be removed.

Remove or update:

- `src/ui/directive-compact-shell.js`
- compact-shell references in `src/ui/README.md`, `styles/README.md`, `README.md`, and planning docs
- compact-shell assertions in `tools/scripts/test-visual-system-foundation.mjs`
- any CSS that only exists to support the old compact shell

### 3. Treat Docs And Tests As Part Of Cleanup

Cleanup is not complete when code disappears. It is complete when the product contract no longer says the deleted system exists.

Every cleanup slice should update:

- docs that advertise removed behavior
- alpha-gate entries
- live smoke documentation
- source architecture docs
- operator/user docs
- tests that only kept removed scaffolding alive

### 4. Make Command Bearing The Only Command Progression Model

`commandStyle` was an earlier compatibility shape. Command Bearing is now the product contract.

Target:

- Remove `commandStyle` from mechanics domains, sidecar fallback reads, runtime decision helpers, transaction helpers, and tests.
- Stop mirroring `commandBearing` into `commandStyle`.
- Update older docs or tests that still treat `commandStyle` as a supported state root.

### 5. Use One Runtime State And Revision Contract

Directive needs one clear mutation boundary for durable campaign state and runtime tracking.

Target:

- Decide whether operational tracking has its own revision or every durable `runtimeTracking` write advances the main runtime revision.
- Route ingress, response, recovery, sidecar, model-call, prompt-sync, and scene-reconciliation writes through the chosen boundary.
- Use the same revision source for stale-write checks unless a sidecar explicitly owns a narrower source revision.

## Audit Baseline

The local audit identified these structural pressure points.

### Large Runtime Aggregates

These files are doing too many jobs:

- `src/runtime/runtime-app.mjs` is about 4.8k lines and owns package asset loading, imported package merging, UI preferences, active save guards, character creator fallbacks, model-call journaling, runtime services, host binding, prompt sync, and screen-level public API.
- `src/mission/state-delta.mjs` is about 4.7k lines and mixes reusable delta shape with Breckenridge/Ashes-specific mission consequences.
- `src/adjudication/action-resolver.mjs` is about 2.4k lines and contains many campaign-specific intent-to-outcome resolvers.
- `src/runtime/chat-turn-orchestrator.mjs` is about 2.3k lines and owns ingress queuing, stale-source checks, pending interactions, terminal decisions, swipes, response recovery, sidecar scheduling, scene handshake, and narration dispatch routing.
- `src/ui/campaign-panel.js`, `src/ui/mission-panel.js`, and `src/runtime/runtime-shell.js` are large enough that route-local state and modal/overlay ownership are becoming hard to reason about.
- `styles/directive.css` is about 12.7k lines and contains several generations of shell, mobile, overlay, route, and compatibility rules.

### Stale Or Cleanup-Worthy Files

Confirmed candidates:

- `src/hosts/lumiverse/`
- `src/frontend.ts`
- `spindle.json`
- `tools/scripts/test-lumiverse-*.mjs`
- `tools/scripts/smoke-lumiverse-live.mjs`
- Lumiverse entries in `tools/scripts/run-alpha-gate.mjs`
- Lumiverse sections in `README.md`, `docs/user/LUMIVERSE_INSTALLATION.md`, `docs/technical/HOST_INTEGRATION_MANUAL.md`, `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md`, `docs/testing/TESTING_STRATEGY.md`, `src/hosts/README.md`, and `docs/DOCUMENTATION_INDEX.md`
- `src/ui/directive-compact-shell.js`
- `src/extension/bootstrap.js` and `src/extension/events.js`, which are re-export shims now that `src/extension/index.js` imports SillyTavern host modules directly
- compatibility branches for old SillyTavern event aliases in `src/hosts/sillytavern/events-adapter.mjs`
- legacy preset-name/status paths in `src/hosts/sillytavern/preset-manager.mjs`, after confirming the current preset contract
- legacy `commandStyle` support and fallback reads in transaction, sidecar, runtime, and chat-turn code
- legacy command-log array support in `src/campaign/transaction-state.mjs` and its matching old-shape tests
- duplicate snapshot compactors in `src/runtime/state-delta-gateway.mjs` and `src/campaign/transaction-state.mjs`
- split version/release contract across root extension metadata, package metadata, README, and release notes
- strict package validation rules duplicated separately from import-time package diagnostics
- tracked historical visual ZIPs or generated visual artifacts that duplicate source-controlled folders
- alpha-gate, `package.json` scripts, and `tools/scripts/README.md` drift
- live SillyTavern scripts duplicating login, cookie, page auth, bridge-path, and panel-opening helpers
- `verify-repo-structure.mjs` requiring placeholder directories instead of only active ownership boundaries

Candidates requiring a wire-or-delete decision:

- `src/competence/no-gotcha.mjs`: docs describe no-gotcha as active Command Competence behavior, but the module appears to be used only by its focused test.
- `src/competence/retroactive-competence.mjs`: isolated helper with no production import.
- `src/pressures/pressure-cooldowns.mjs`: isolated helper with no production import.
- `src/pressures/pressure-scoring.mjs`: isolated helper with no production import.

Generated or local-only cleanup:

- `.directive-doc-renderer/`, `.tmp/`, `artifacts/`, `node_modules/`, and `source-images/` are ignored local/generated paths. They do not need source deletion unless ignored files were accidentally committed or the source image retention policy changes.

## Refactor Tracks

### Track A: Remove Lumiverse Active Support

Goal: reduce the product to SillyTavern plus fake-host verification for pre-alpha.

Primary removals:

- Delete `src/hosts/lumiverse/`.
- Delete `src/frontend.ts`.
- Delete `spindle.json`.
- Delete `tools/scripts/smoke-lumiverse-live.mjs`.
- Delete `tools/scripts/test-lumiverse-entrypoints.mjs`.
- Delete `tools/scripts/test-lumiverse-events-adapter.mjs`.
- Delete `tools/scripts/test-lumiverse-generation-client.mjs`.
- Delete `tools/scripts/test-lumiverse-host-factory.mjs`.
- Delete `tools/scripts/test-lumiverse-interceptor-adapter.mjs`.
- Delete `tools/scripts/test-lumiverse-prompt-blocks.mjs`.
- Delete `tools/scripts/test-lumiverse-storage-adapter.mjs`.
- Delete `tools/scripts/test-lumiverse-tools-adapter.mjs`.

Required follow-up edits:

- Remove Lumiverse checks from `tools/scripts/run-alpha-gate.mjs`.
- Rework `tools/scripts/test-dual-host-scaffold.mjs` into a SillyTavern plus fake-host contract test, or replace it with clearer host-contract tests.
- Update `tools/scripts/test-host-import-boundaries.mjs` so the forbidden/allowed host globals match the SillyTavern-only product.
- Remove the unresolved Lumiverse frontend build contract instead of codifying it. `spindle.json` points at `dist/frontend.js`, but the pre-alpha cleanup direction is to delete Lumiverse active support rather than add build tooling for a deferred host.
- Remove Lumiverse references from `README.md`.
- Remove `docs/user/LUMIVERSE_INSTALLATION.md` from the docs index, then delete or archive it.
- Update `docs/technical/HOST_INTEGRATION_MANUAL.md` to describe SillyTavern, fake host, and future host-adapter requirements only.
- Update `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md`, `docs/testing/TESTING_STRATEGY.md`, `docs/development/PRE_ALPHA_SYSTEMS.md`, `src/hosts/README.md`, `src/ui/README.md`, and `src/runtime/README.md`.
- Update planning docs that still present dual-host parity as active work. `docs/planning/DUAL_HOST_SUPPORT_PLAN.md` should become historical or explicitly superseded.

Keep:

- `src/hosts/host-contract.mjs`
- `src/hosts/fake/`
- host-neutral storage and generation interfaces that are actively used by SillyTavern or fake-host tests
- import-boundary tests that prevent SillyTavern globals from leaking into host-neutral runtime modules

Acceptance criteria:

- `rg -n "Lumiverse|Spindle|spindle.json|src/frontend|src/hosts/lumiverse" README.md docs src tools package.json manifest.json` returns only an intentional future-support note and historical planning references.
- The alpha gate has no Lumiverse test entries.
- The product docs describe Directive as a SillyTavern extension for pre-alpha.
- Fake-host tests still protect host contract behavior.

### Track B: Clean SillyTavern Host Lifecycle And Globals

Goal: make enable, disable, reload, and live smoke behavior idempotent.

Problems to fix:

- `src/hosts/sillytavern/shell-events.js` wires host events without a clear unsubscribe lifecycle.
- `src/hosts/sillytavern/message-actions.js` registers event-source and document handlers that need explicit teardown.
- `src/extension/index.js`, `src/hosts/sillytavern/feature-toggle.mjs`, and `src/hosts/sillytavern/runtime-bridge.mjs` share responsibility for generation interceptor and global bridge state.
- `globalThis.Directive` is broad and should become a narrow debug/runtime bridge contract.

Refactor direction:

- Use `src/hosts/sillytavern/events-adapter.mjs` as the one disposable event-subscription owner.
- Make event setup idempotent.
- Make disable cleanup unsubscribe event listeners, remove document listeners, clear UI, and uninstall feature globals.
- Move host-specific menu/settings/global bridge code from `src/extension/` into `src/hosts/sillytavern/`.
- Keep `src/extension/index.js` as the manifest entrypoint shim.
- Remove `src/extension/bootstrap.js` and `src/extension/events.js` once tests/docs no longer require them.

Acceptance criteria:

- Disable followed by enable does not double-register listeners.
- Live host smoke can prove panel cleanup and bridge cleanup.
- Tests cover event teardown and re-enable.
- The generation interceptor is installed only through the active feature-state path.

### Track C: Split `runtime-app.mjs` Into Service Modules

Goal: make the runtime app a coordinator, not a storage/package/UI/model-call monolith.

Recommended extractions:

- `src/packages/bundled-package-registry.mjs`: owns bundled package references and discovery metadata.
- `src/runtime/package-library-service.mjs`: loads bundled and imported package records, builds runtime asset indexes, and summarizes diagnostics.
- `src/runtime/active-save-guard.mjs`: owns active chat/save binding checks and recovery action summaries.
- `src/runtime/runtime-model-call-journal.mjs`: owns model-call event sequencing, pending event replay, and player-safe journal entries.
- `src/runtime/runtime-ui-preferences.mjs`: owns hidden campaign session keys and other runtime UI preferences.
- `src/runtime/creator-runtime-service.mjs`: owns Character Creator runtime asset selection, review fallback, and portrait upload support.
- `src/runtime/mission-asset-selector.mjs`: owns active package, mission graph, projection, and crew dataset selection.
- `src/runtime/runtime-view-envelope.mjs`: owns view envelope shaping and player-safe public view summaries.
- `src/runtime/runtime-command-handlers.mjs`: groups public command handlers so the app constructor is not also the command implementation.

Keep inside `createDirectiveRuntimeApp()`:

- construction of services
- public API composition
- campaign state getter/setter coordination
- high-level runtime workflows

Acceptance criteria:

- `runtime-app.mjs` drops below roughly 2k lines.
- Package loading and active save guard behavior have focused tests.
- Runtime app tests still verify end-to-end campaign start, save, load, Director turn, narration, and host injection.
- `runDirectorTurn` is removed or routed through the same mechanics checkpoint path as provisional-turn commit.

### Track D: Move Bundled Package Registration Out Of Runtime

Goal: make package data package-owned and stop repeating path lists across runtime and tools.

Problems to fix:

- `BUNDLED_CAMPAIGN_PACKAGE_REFS` lives in `src/runtime/runtime-app.mjs`.
- `tools/scripts/run-alpha-gate.mjs` repeats every package, projection, crew dataset, and mission graph path.
- validators default to Breckenridge/Ashes paths even when the repo now carries six bundled packages.

Refactor direction:

- Create a package registry module or JSON manifest under `packages/bundled/`.
- Let runtime, validators, and alpha gate consume the same registry.
- Make the registry list package id, package JSON, projection JSON, crew dataset JSON, mission graphs, asset map roots, and status.
- Keep Ashes-specific invariants clearly labeled as package-specific checks.

Acceptance criteria:

- Adding a bundled campaign requires updating one registry, not runtime plus multiple scripts.
- Alpha gate validation loops over the registry.
- Runtime package loading has no hardcoded Breckenridge/Ashes path list.

### Track E: Unify Package Validation And Release Metadata

Goal: make import-time package acceptance, local validators, docs, and visible package metadata enforce the same product contract.

Problems to fix:

- `tools/scripts/validate-campaign-package.mjs` enforces required manifest fields that import-time diagnostics currently allow to be missing.
- `src/packages/campaign-package-importer.mjs` relies on the weaker diagnostics path.
- Extension version metadata is split across `package.json`, `manifest.json`, docs, and release notes, while bundled package versions may legitimately differ.
- Some package manifest titles are inconsistent in product-visible library and save labels.
- Ashes still carries unresolved release-facing asset placeholders while being treated as the primary reference package.

Refactor direction:

- Extract strict package contract checks into a shared module used by validators and import diagnostics.
- Make importer reject packages missing required manifest fields such as `kind`, `schemaVersion`, `status`, `bundled`, `transportExtension`, and `sourceDocuments`.
- Add importer tests for missing required manifest fields.
- Decide and document the version policy:
  - either promote root extension docs/metadata to the current release version, or
  - explicitly distinguish extension version from bundled package version and archive stale release notes.
- Normalize bundled manifest titles or add explicit `displayTitle` and `campaignTitle` fields for product-visible labels.
- Add status-sensitive unresolved asset rules, or downgrade incomplete packages to `draft`.

Acceptance criteria:

- A package accepted by import diagnostics satisfies the same strict contract as the package validator.
- Version fields have one documented meaning and current docs index points at the right current release.
- Campaign Library and save records use consistent title fields across all bundled packages.
- Unresolved asset placeholders cannot hide in a release-facing package status.

### Track F: Isolate Campaign-Specific Mechanics

Goal: separate reusable engine code from Breckenridge/Ashes tactical content.

Problems to fix:

- `src/mission/state-delta.mjs` contains reusable delta structure and many Ashes-specific consequences.
- `src/adjudication/action-resolver.mjs` contains reusable resolution mechanics and campaign-specific branches.
- Some tests rightly use Ashes as the reference package, but the code shape makes it easy for Ashes assumptions to leak into non-Ashes campaigns.

Refactor direction:

- Introduce a campaign mechanics registry keyed by package id or mission graph id.
- Move Ashes/Breckenridge-specific tactical resolvers into a package-specific module tree, for example `src/campaigns/breckenridge/` or `src/mission/bundled/breckenridge/`.
- Keep shared interfaces in `src/mission/`, `src/adjudication/`, and `src/campaign/`.
- Keep package-specific invariants in package-specific tests.

Acceptance criteria:

- Shared Mission Director code can invoke package-specific mechanics through a narrow interface.
- Non-Ashes packages can validate and run generic/open-world flows without importing Ashes-specific resolver branches.
- Tests make explicit which fixtures are generic and which are Ashes-specific.

### Track G: Split Chat Turn Orchestration

Goal: make chat-native turn handling easier to reason about and debug.

Recommended extractions:

- ingress ledger and stale-source checks
- pending interaction resolution
- terminal outcome decision routing
- response swipe and protected edit routing
- response recovery and replacement handling
- sidecar scheduling policy
- scene handshake settlement
- player-safe chat transcript normalization

Acceptance criteria:

- `chat-turn-orchestrator.mjs` becomes the sequence coordinator.
- Each extracted module has focused deterministic tests.
- Delete/edit/swipe/reobserve recovery tests remain green.

### Track H: Unify State Revision And Snapshot Compaction

Goal: make stale-write checks and state history snapshots use one authoritative contract.

Problems to fix:

- `src/runtime/state-delta-gateway.mjs` increments `runtimeTracking.revision` for tracked commits, but several durable runtime-tracking writes are handled by direct helper paths.
- Sidecars use revision as a stale-write boundary, but not every durable write currently has an obvious revision policy.
- Command Log summary sidecars use turn count as a revision fallback, which can miss prompt sync, recovery, model-call journaling, sidecars, or scene reconciliation.
- Snapshot compaction exists in both `src/runtime/state-delta-gateway.mjs` and `src/campaign/transaction-state.mjs` with different stripped roots.

Refactor direction:

- Define the runtime revision policy in one module.
- Decide whether operational runtime-tracking writes advance the main revision or a separate operational revision.
- Make sidecar stale checks use the chosen revision source.
- Give Command Log summary sidecars either the same runtime revision or an explicitly named command-log source revision.
- Extract one shared snapshot compactor used by gateway history and transaction rollback/delete snapshots.

Acceptance criteria:

- Tests prove ingress, response, recovery, sidecar, model-call, prompt-sync, and scene-reconciliation writes update the intended revision counter.
- Sidecar stale-write tests use the same revision policy as runtime commits.
- Snapshot compaction tests cover model-call journal, reconciliation internals, and other runtime-only ledgers through one helper.

### Track I: Retire `commandStyle`

Goal: make Command Bearing the only command progression and intervention state.

Problems to fix:

- Transaction code mirrors `commandBearing` back into `commandStyle`.
- Transaction code still accepts `stateDelta.commandStyle`.
- Sidecar and chat-turn code still read `state.commandBearing || state.commandStyle`.
- Runtime turn commit helpers still carry command-style roots.

Refactor direction:

- Delete `commandStyle` fallback reads.
- Delete `stateDelta.commandStyle` support.
- Delete command-log and transaction tests that exist only for the old command-style shape.
- Update docs to state old pre-alpha `commandStyle` data is not migrated; current saves should be updated in place if needed.

Acceptance criteria:

- `rg -n "commandStyle" src tools docs README.md` returns only historical planning notes or none.
- Command Bearing tests remain green.
- Turn commit, sidecar scheduling, and chat orchestration use `commandBearing` only.

### Track J: Move Campaign Sidecars Onto The Host-Neutral Runner

Goal: keep campaign sidecar authority local while making transport and concurrency host-neutral.

Problems to fix:

- `src/jobs/campaign-sidecar-scheduler.mjs` owns its own `generationRouter.batch` and `Promise.all` transport behavior.
- `src/jobs/host-sidecar-orchestrator.mjs` already has a generic runner that respects host concurrency policy.

Refactor direction:

- Make the campaign scheduler build authoritative sidecar jobs.
- Delegate transport, batching, and concurrency to `host-sidecar-orchestrator.mjs`.
- Keep proposal validation, stale revision checks, and state commit logic in campaign-owned code.

Acceptance criteria:

- Existing campaign sidecar conflict/stale tests remain green.
- Host-sidecar runner tests cover sequential and batch behavior.
- Campaign scheduler no longer duplicates transport policy.

### Track K: Replace Body-Level Overlays With A Host-Aware Overlay Service

Goal: keep all Directive overlays inside the intended host surface.

Current body-level or scattered overlays include:

- guidance popovers in `src/guidance/directive-guidance.js`
- Save Game As and difficulty dialogs in `src/ui/campaign-panel.js`
- Directive Assist layers in `src/hosts/sillytavern/directive-assist-button.js`
- message menus in `src/hosts/sillytavern/message-actions.js`
- turn activity indicator in `src/hosts/sillytavern/turn-activity-indicator.js`

Refactor direction:

- Add a host-aware overlay root service.
- For SillyTavern, prefer the chat surface or Directive runtime mount where appropriate.
- Give every overlay a teardown path tied to host disable and route reset.
- Remove direct `document.body.appendChild()` calls except in a documented fallback.

Acceptance criteria:

- Guidance, Assist, message actions, Save As, difficulty confirmation, and activity indicators all use one overlay placement contract.
- Live SillyTavern checks prove overlays do not escape above host chrome.
- Reset Window and disable cleanup close transient overlays.

### Track L: Split Active CSS And Delete Old Selectors

Goal: make style ownership match active surfaces.

Refactor direction:

- Split `styles/directive.css` into source sections or files for:
  - shell and command spine
  - route panels
  - controls and UI kit
  - overlays and host-mounted popovers
  - documentation or visual test fixtures, if needed
- Delete compact-shell and old bottom-shell rules after Track A/B cleanup.
- Keep CSS cascade order explicit.
- Prefer route/surface-scoped selectors over broad global button overrides.

Acceptance criteria:

- Active CSS no longer contains rules for removed Lumiverse or compact-shell surfaces.
- Visual foundation tests assert active shell contracts only.
- Guidance and icon-button hover fixes remain protected.

### Track M: Tooling And Alpha Gate Cleanup

Goal: make verification easier to maintain while preserving coverage.

Problems to fix:

- `tools/scripts/run-alpha-gate.mjs` is a long manually maintained list.
- `package.json` exposes only a few scripts and does not provide a canonical `test` or `verify` command.
- `tools/scripts/README.md` lists a smaller fast-check set that has drifted from the gate.
- Many validators repeat package paths.
- Live smoke scripts contain their own mini-frameworks.
- Some tests protect historical scaffolding instead of active behavior.
- Some deterministic tests may belong in the gate or need explicit extended-test classification.
- `verify-repo-structure.mjs` contains duplicate expected directories and still requires README-only placeholder scaffolds.

Refactor direction:

- Add a canonical `npm test` or `npm run verify` wrapper for the maintained verification path.
- Generate package validation checks from the bundled package registry.
- Generate or validate `tools/scripts/README.md` fast-check listings from the same source as the gate.
- Split alpha gate into named groups with stable output.
- Keep live SillyTavern smoke opt-in and focused.
- Move repeated live SillyTavern helpers into `tools/scripts/lib/sillytavern-live-harness.mjs`.
- Split the large `smoke-sillytavern-live.mjs` script into scenario modules or shared harness helpers.
- Remove Lumiverse smoke/tests.
- Remove compact shell assertions.
- Centralize package/runtime validation contracts currently duplicated across package diagnostics, validators, projection checks, and package context helpers.
- Remove tracked historical visual archives such as `docs/design/visual-targets.zip` when the unzipped source or newer reference concepts remain available.
- Tighten `verify-repo-structure.mjs` so it checks active ownership boundaries, not placeholder directories kept only for an early scaffold.
- Promote reusable documentation render checks into tracked tooling, or make ignored renderer dependency explicitly local-only in docs.
- Decide whether isolated helpers such as no-gotcha and pressure scoring are integrated or deleted.

Acceptance criteria:

- `npm test` or `npm run verify` is the canonical local verification entry.
- Alpha gate remains a single command but is easier to scan.
- Script docs cannot drift silently from the maintained gate.
- Removing a product surface removes its tests from the gate in the same change.
- Test names match active contracts, not historical stage numbers where possible.
- Live scripts share login/session/panel helpers instead of duplicating them.
- Repo structure checks fail on real boundary drift, not missing placeholder READMEs.

### Track N: Documentation Cleanup And Archiving

Goal: make docs reflect the product that exists after cleanup.

Refactor direction:

- Update release-facing docs first.
- Convert stale planning docs into historical references or archive them.
- Remove claims that Lumiverse is active.
- Remove claims that compact shell is retained.
- Update architecture docs from "initial scaffold" to current source ownership.
- Move source briefs and old plans out of the main path where they compete with current contracts.
- Move completed or superseded implementation plans out of the active Planning list, or label them historical in place.
- Keep `docs/DOCUMENTATION_INDEX.md` focused on current contracts and active plans.
- Clarify ownership for generated documentation render artifacts. If render scripts remain ignored/local-only, docs should not imply they are source-controlled product tooling.
- Link or delete orphaned visual-target layout JSON files instead of leaving unreferenced generated output in active design folders.

High-value doc targets:

- `README.md`
- `docs/DOCUMENTATION_INDEX.md`
- `docs/user/DIRECTIVE_OPERATOR_MANUAL.md`
- `docs/user/FIRST_CAMPAIGN_WORKFLOW.md`
- `docs/user/STORAGE_AND_STATE_SAFETY.md`
- `docs/technical/HOST_INTEGRATION_MANUAL.md`
- `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md`
- `docs/testing/TESTING_STRATEGY.md`
- `docs/architecture/REPO_STRUCTURE.md`
- `docs/architecture/SOURCE_ARCHITECTURE.md`
- `docs/development/PRE_ALPHA_SYSTEMS.md`
- `docs/planning/DUAL_HOST_SUPPORT_PLAN.md`

Acceptance criteria:

- The docs index routes new contributors to current contracts.
- Historical plans are labeled historical or superseded.
- User docs do not describe removed host support.

## Suggested Implementation Sequence

### Phase 0: Freeze The Cleanup Contract

Work:

- Land this plan.
- Run a tracked-file scan for Lumiverse, compact-shell, legacy compatibility, and source architecture drift.
- Decide whether old planning docs are archived in place or moved under a historical folder.

Verification:

```powershell
rg -n "Lumiverse|Spindle|directive-compact-shell|legacy compact|historical scaffolding" README.md docs src tools package.json manifest.json
```

### Phase 1: Host Scope Reset

Work:

- Remove Lumiverse active support.
- Remove compact shell.
- Update alpha gate, docs, and tests.
- Keep fake host and SillyTavern host contract tests.

Verification:

```powershell
node tools\scripts\test-host-contract-fake.mjs
node tools\scripts\test-sillytavern-host-factory.mjs
node tools\scripts\test-sillytavern-event-wiring.mjs
node tools\scripts\test-command-spine-layout.mjs
node tools\scripts\run-alpha-gate.mjs
```

### Phase 2: Package Contract And Metadata Cleanup

Work:

- Add the bundled package registry.
- Make import diagnostics share strict package validation rules.
- Normalize package title/version/status policy.
- Remove or downgrade unresolved release-facing package assets.

Verification:

```powershell
node tools\scripts\validate-campaign-package.mjs
node tools\scripts\test-campaign-package-importer.mjs
node tools\scripts\test-campaign-package-context.mjs
node tools\scripts\run-alpha-gate.mjs
```

### Phase 3: SillyTavern Lifecycle And Overlay Cleanup

Work:

- Refactor event subscription lifecycle.
- Make feature toggle own globals and generation interceptor state.
- Add the overlay root service.
- Move SillyTavern-specific extension menu/settings code under `src/hosts/sillytavern/`.

Verification:

```powershell
node tools\scripts\test-sillytavern-runtime-lifecycle.mjs
node tools\scripts\test-sillytavern-event-wiring.mjs
node tools\scripts\test-sillytavern-message-actions.mjs
node tools\scripts\test-directive-guidance.mjs
node tools\scripts\test-directive-assist.mjs
```

### Phase 4: Runtime App Decomposition

Work:

- Extract package library, bundled registry, active save guard, model-call journal, UI preferences, creator runtime service, and mission asset selector.
- Define the runtime revision policy and shared snapshot compactor before splitting state-heavy command handlers.
- Keep public runtime API stable while modules move.

Verification:

```powershell
node tools\scripts\test-runtime-shell-creator-flow.mjs
node tools\scripts\test-runtime-host-injection.mjs
node tools\scripts\test-campaign-start-and-save.mjs
node tools\scripts\test-current-chat-campaign-scope.mjs
node tools\scripts\test-state-delta-gateway.mjs
node tools\scripts\test-transaction-state.mjs
```

### Phase 5: Mechanics And Turn Path Decomposition

Work:

- Split package-specific Ashes mechanics from shared mission/adjudication code.
- Split chat turn orchestration into focused modules.
- Retire `commandStyle` so Command Bearing is authoritative.
- Move campaign sidecar transport onto the host-neutral sidecar runner.
- Decide wire-or-delete status for isolated no-gotcha, retroactive competence, pressure scoring, and pressure cooldown helpers.

Verification:

```powershell
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-runtime-director-turn.mjs
node tools\scripts\test-chat-turn-orchestrator.mjs
node tools\scripts\test-chat-response-recovery.mjs
node tools\scripts\test-command-competence-no-gotcha.mjs
node tools\scripts\test-campaign-sidecar-scheduler.mjs
node tools\scripts\test-host-sidecar-orchestrator.mjs
```

### Phase 6: CSS, Docs, And Gate Finalization

Work:

- Split active CSS or at least delete removed-surface sections.
- Update release-facing docs.
- Archive or label stale plans.
- Remove duplicated historical visual archives that are no longer current references.
- Consolidate alpha-gate scripts, package scripts, and script README docs.
- Deduplicate live SillyTavern harness helpers.
- Tighten repo-structure verification around active boundaries.
- Clarify generated documentation-render artifact ownership.
- Regenerate docs/render tracking if needed.

Verification:

```powershell
node tools\scripts\test-visual-system-foundation.mjs
node tools\scripts\test-open-world-docs-contract.mjs
node tools\scripts\verify-repo-structure.mjs
node tools\scripts\run-alpha-gate.mjs
```

## Definition Of Done

This refactor and cleanup pass is complete when:

1. Directive is documented and tested as a SillyTavern-only pre-alpha extension.
2. Lumiverse active code, descriptor, tests, smoke scripts, and user docs are removed or explicitly archived as future work.
3. The fake host remains as the deterministic host-contract test surface.
4. The compact shell is deleted and command-spine shell is the only active runtime shell.
5. SillyTavern enable, disable, and re-enable paths are idempotent and tested.
6. Runtime globals and generation interceptor ownership flow through one feature-state owner.
7. Runtime overlays use a host-aware overlay root instead of scattered body appends.
8. Runtime revision ownership and snapshot compaction use one shared contract.
9. `commandStyle` is retired and Command Bearing is the only active command progression state.
10. Campaign sidecar transport uses the host-neutral sidecar runner.
11. Import-time package acceptance and validator rules share one strict contract.
12. Version, title, package status, and unresolved asset policies are explicit and tested.
13. `runtime-app.mjs`, `chat-turn-orchestrator.mjs`, and campaign mechanics modules are split into smaller ownership-based modules.
14. Bundled package registration is package-owned and shared by runtime, validators, and alpha gate.
15. `package.json`, alpha gate, and script docs expose one maintained verification contract.
16. Live SillyTavern scripts share harness helpers instead of duplicating session/bootstrap code.
17. Repo structure verification tracks active boundaries instead of placeholder scaffolds.
18. Alpha gate and docs no longer keep retired surfaces alive.
