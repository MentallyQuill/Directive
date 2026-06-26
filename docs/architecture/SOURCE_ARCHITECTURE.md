# Source Architecture

## Goal

Directive should avoid Saga's remaining monolithic-file problem from the start. Each module should own a narrow system boundary. Render files should not own provider calls, storage mutation, mission resolution, or broad application composition.

The durable repo scaffold is documented in [Repository Structure](REPO_STRUCTURE.md). This file focuses on source-code ownership under `src/`.

For the current host scope, see [Host Integration Manual](../technical/HOST_INTEGRATION_MANUAL.md) and [Pre-Alpha Refactor And Cleanup Plan](../planning/PRE_ALPHA_REFACTOR_AND_CLEANUP_PLAN.md). Active pre-alpha support is SillyTavern-only, with `src/hosts/fake` retained for deterministic contract tests.

## Current Source Ownership Snapshot

This snapshot describes active ownership boundaries, not a promise that every example filename exists. Keep implementation-specific examples current when modules move.

```text
src/
  extension/
    index.js
    bootstrap.js
    lifecycle.js
    events.js
    menu-button.js
    runtime-mount.js

  runtime/
    runtime-actions.js
    runtime-shell.js
    runtime-app.mjs
    campaign-start-controller.mjs
    director-turn-runtime.mjs
    prompt-composition.js

  ui/
    runtime-ui-kit.js
    character-creator-panel.js
    mission-panel.js
    crew-panel.js
    ship-panel.js
    campaign-panel.js
    command-log-panel.js
    settings-panel.js

  packages/
    campaign-package-schema.js
    campaign-package-loader.js
    campaign-package-library.js
    bundled-package-index.js

  creators/
    starship-creator-schema.js
    starship-creator-projects.js
    mission-creator-schema.js
    mission-creator-projects.js

  retrieval/
    scene-snapshot.js
    dataset-index.js
    director-card-schema.js
    gate-evaluator.js
    recall-lanes.js
    semantic-classifier.js
    packet-builder.js
    run-journal.js
    diagnostics.js

  directors/
    director-coordinator.js
    mission-director.js
    crew-director.js
    ship-director.js
    command-director.js

  campaign/
    campaign-state.js
    state-schema.js
    state-manager.js
    turn-ledger.js
    transaction-manager.js
    rollback-manager.js
    import-export.js

  command/
    command-bearing.js

  mission/
    mission-schema.js
    mission-graph.js
    mission-loader.js
    director.js
    event-manager.js
    fronts.js
    clocks.js
    revelations.js
    end-states.js

  adjudication/
    turn-classifier.js
    intent-parser.js
    capability-validator.js
    action-resolver.js
    outcome-packet.js
    state-delta-validator.js
    command-decision-evaluator.js

  simulation/
    crew-manager.js
    ship-manager.js
    relationship-manager.js
    command-culture.js
    values.js
    directives.js

  actors/
    actor-state.js
    faction-state.js
    villain-state.js
    mission-character-state.js

  providers/
    provider-router.js
    provider-settings.js
    response-normalizer.js
    structured-generation.js

  generation/
    generation-job-runner.js

  hosts/
    host-contract.mjs
    fake/
    sillytavern/

  jobs/
    sidecar-job-contracts.mjs
    sidecar-job-runner.mjs
    host-sidecar-orchestrator.mjs
    command-log-summary-sidecar.mjs

  storage/
    file-api.js
    storage-index.js
    stale-write.js
    domain-storage.js
    campaign-storage.js
    package-storage.js
    mission-storage.js
    diagnostics.js

  settings/
    default-settings.js
    settings-store.js
    secure-keyring.js

  theme/
    theme-tokens.js
    css-classes.js
```

## Ownership Rules

- `extension/` owns the manifest-facing entrypoint shims and shared extension UI helpers. Active SillyTavern lifecycle and event implementation lives under `hosts/sillytavern/`.
- `runtime/` owns shell geometry, routing, prompt sync, and action dispatch.
- `ui/` owns rendering, user interaction, host-neutral route metadata, the command-spine shell, and local shell geometry helpers.
- `campaign/` owns authoritative campaign state and transaction safety.
- `retrieval/` owns scene snapshots, package dataset indexes, Director-card gates, recall lanes, packet assembly, retrieval journals, and diagnostics.
- `directors/` owns coordinated Director modules that consume retrieval packets and propose structured outcome data without bypassing adjudication or persistence rules.
- `mission/` owns authored mission structure and Director state.
- `mission/ashes-of-peace/` owns deterministic Breckenridge / Ashes of Peace state-delta mechanics; `mission/state-delta.mjs` remains a thin facade for existing shared callers.
- `adjudication/` owns intent, validation, resolution, and state delta proposals.
- `adjudication/ashes-of-peace/` owns deterministic Breckenridge / Ashes of Peace action resolution; `adjudication/action-resolver.mjs` remains a thin facade for existing shared callers.
- `simulation/` owns crew, ship, command culture, values, directives, and relationships.
- `packages/` owns reusable campaign package schemas and loading.
- `creators/` is reserved for future Starship Creator and Mission Creator draft projects. It should use package and mission schemas rather than inventing separate final formats.
- `hosts/` owns host contracts, capability negotiation, per-host adapters, UI mounting, and theme-token mapping for SillyTavern and fake-host tests.
- `jobs/` owns sidecar job contracts, background generation orchestration, progress events, stale-result rejection, and reconciliation.
- `storage/` owns logical persistence mechanics and host-neutral repository semantics.
- `providers/` owns provider routing and response normalization.
- `theme/` owns theme tokens and CSS class helpers consumed by runtime UI.

## Host Adapter Boundary

The host boundary exists without changing the Mission Director, campaign, adjudication, package, retrieval, or transaction ownership rules above.

The split is:

- `src/hosts/` owns host contracts, capability negotiation, and per-host adapters.
- `src/hosts/sillytavern/` owns the current SillyTavern bootstrap, lifecycle, event, storage, provider, UI-mount, and theme integration.
- `src/ui/` owns shell components and shared route metadata; host adapters should not fork route panels or campaign-facing panel structure.
- SillyTavern uses the command spine, one resizable drawer, and a phone-width bottom-navigation fallback. Do not introduce panel-owned primary navigation, panel-owned resize geometry, extra floating shell controls, or divergent route order.
- `src/jobs/` owns sidecar job contracts, background generation orchestration, progress events, stale-result rejection, and reconciliation.
- `src/generation/` owns host-neutral generation roles such as narration, continuity tracking, Mission Director advice, crew sidecars, ship sidecars, and utility JSON.

The manifest still points to `src/extension/index.js`, but that file delegates SillyTavern bootstrap and event handling to `src/hosts/sillytavern/`. Keep future host-specific shell behavior under the host adapter instead of expanding the shim layer.

## Anti-Monolith Rules

- Do not create a `directive-panel.js` equivalent to Saga's `lore-panel.js`.
- Do not pass giant dependency maps into panels.
- Do not put model calls in render modules.
- Do not put storage writes in render modules.
- Do not let shell code know package internals.
- Do not let the Campaign tab own campaign transaction logic.
- Do not let Command Log summaries become the authoritative source of truth.
- Do not let future creator draft formats diverge from final package and mission graph schemas.
- Do not let any single Director own all retrieval logic.
- Do not let hidden Director cards enter narrator packets without explicit reveal state.

## Initial Facades

Some facades are acceptable if they stay thin:

- `runtime/runtime-actions.js` can dispatch actions by ID.
- `campaign/state-manager.js` can expose state operations.
- `storage/domain-storage.js` can share storage helpers.
- `providers/provider-router.js` can select provider roles.

Facades should delegate to owned modules and remain small.

## Current Mission Director Slice

The first executable Director loop now uses these source modules:

```text
src/mission/director.mjs
src/mission/graph-lookup.mjs
src/mission/pacing.mjs
src/mission/phase-advancement.mjs
src/mission/state-delta.mjs
src/mission/ashes-of-peace/state-delta.mjs
src/adjudication/intent-parser.mjs
src/adjudication/action-classifier.mjs
src/adjudication/capability-validator.mjs
src/adjudication/action-resolver.mjs
src/adjudication/ashes-of-peace/action-resolver.mjs
src/adjudication/state-delta-validator.mjs
src/campaign/transaction-state.mjs
```

This slice keeps mission structure, pressure pacing, phase advancement, adjudication, state-delta validation, and campaign transaction mutation separate. Future runtime integration should preserve that boundary instead of folding the loop into a UI, provider, or storage module.

## Current Runtime Shell Slice

The first runtime shell now uses these source modules:

```text
src/extension/index.js
src/extension/bootstrap.js
src/extension/lifecycle.js
src/extension/events.js
src/extension/menu-button.js
src/extension/runtime-mount.js
src/extension/global-bridge.js
src/hosts/sillytavern/bootstrap.js
src/hosts/sillytavern/lifecycle.js
src/hosts/sillytavern/shell-events.js
src/runtime/runtime-actions.js
src/runtime/runtime-shell.js
src/runtime/runtime-app.mjs
src/runtime/campaign-start-controller.mjs
src/runtime/director-turn-runtime.mjs
src/command/command-bearing.mjs
src/ui/runtime-ui-kit.js
src/ui/directive-routes.mjs
src/ui/directive-command-spine-shell.js
src/ui/directive-shell-layout.mjs
src/ui/campaign-panel.js
src/ui/character-creator-panel.js
src/ui/mission-panel.js
src/ui/crew-panel.js
src/ui/ship-panel.js
src/ui/command-log-panel.js
src/ui/settings-panel.js
```

This slice keeps SillyTavern lifecycle, action dispatch, command-spine geometry and persistence, shell frame rendering, package/controller orchestration, route panel rendering, Director turn runtime, narration prompt/provider handoff, Command Bearing helpers, crew/B-plot simulation helpers, storage-backed autosaves, and campaign-start transactions separate. The shell owns tab state and callbacks; `src/ui` panels render view data; `runtime-app.mjs` loads package/projection/mission assets, tracks pending Provisional Outcomes, and exposes active package context plus initialized campaign state. `director-turn-runtime.mjs` builds scene snapshots, calls the Mission Director, adds runtime Provisional Outcome/Bearing eligibility fields, and commits accepted Final Outcomes through transaction-state helpers. Command Bearing progression and intervention helpers live in `src/command`. Crew B-plot hooks and hidden relationship memory helpers live in `src/simulation`. Narration prompt composition lives in `src/generation`, and provider access lives in `src/providers`. UI modules do not perform storage writes directly, call providers, or hardcode Ashes-specific data.
