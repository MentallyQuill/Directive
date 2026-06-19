# Tool Scripts

Node-based local scripts for validation, smoke checks, audits, fixture tests, and release gates.

## Current Fast Checks

```powershell
node tools\scripts\test-extension-shell.mjs
node tools\scripts\test-runtime-shell-creator-flow.mjs
node tools\scripts\validate-starship-package.mjs
node tools\scripts\test-starship-package-context.mjs
node tools\scripts\test-campaign-start-and-save.mjs
node tools\scripts\test-directive-file-api.mjs
node tools\scripts\test-directive-storage-repository.mjs
node tools\scripts\test-campaign-start-service.mjs
node tools\scripts\test-runtime-campaign-start-controller.mjs
node tools\scripts\validate-campaign-projection.mjs
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\test-crew-retrieval-fixture.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\test-runtime-director-turn.mjs
node tools\scripts\test-runtime-stage9-turn-loop.mjs
node tools\scripts\test-runtime-stage10-prelude-autosave.mjs
node tools\scripts\test-command-bearing.mjs
node tools\scripts\test-crew-bplots.mjs
node tools\scripts\verify-repo-structure.mjs
```

`test-mission-director-loop.mjs` runs the executable Director loop against deterministic mission fixtures and compares generated packets to established turn contract fixtures.

`test-transaction-state.mjs` proves the in-memory campaign transaction helpers can commit, swipe, edit, delete, and restore Director outcomes without mutating source state.

`test-runtime-director-turn.mjs` proves runtime scene snapshot construction, Mission Director execution, transaction commit, narrator prompt/provider handoff, provider-failure recovery, Command Log update, and default swipe-reroll preservation from active campaign state.

`test-runtime-stage9-turn-loop.mjs` proves the first playable turn loop: Provisional Outcome preview, eligible Command Bearing spend, Final Outcome commit, narration generation, provider-failure recovery, and retry without rerolling mechanics.

`test-runtime-stage10-prelude-autosave.mjs` proves opening Prelude scenario depth and save stability: arrival-tone resolution, ready-room handoff resolution, phase advancement, hidden outcome flags, crew-integration strain updates, stable narrated autosaves, and the three-autosave rolling cap.

`test-command-bearing.mjs` proves Command Bearing Marks, rank thresholds, Recovery uniqueness, reserve caps, spend eligibility, outcome improvement, duplicate-spend protection, and intervention prompt shape.

`test-crew-bplots.mjs` proves senior-staff B-plot hook derivation, coalition/objection rules, hidden relationship memory updates, and mission graph links for crew arcs.

`test-starship-package-context.mjs` proves the runtime package-context adapter can derive Starships-tab summary data and package-driven Character Creator context without mutating package templates.

`test-extension-shell.mjs` proves the Directive manifest, lifecycle hook exports, extensions-menu launcher, runtime action registry, and minimal tabbed runtime shell use Directive identity and avoid Saga identifiers.

`test-runtime-shell-creator-flow.mjs` proves the rendered Starships tab can start a package-owned Character Creator draft, save partial identity, leave and resume the draft, complete the review, begin the campaign, create the first save, render state-backed Mission, Crew, Ship, Log, and Settings panels, preview and accept a Mission-panel action, show the resulting autosave, overwrite the manual save through Save Game, create a branch through Save As, and load a save from Starships.

`test-campaign-start-and-save.mjs` proves partial Character Creator draft saves, accepted creator reviews, initial campaign-state creation, first save records, Save Game overwrite, Save Game As, load behavior, and template immutability.

`test-directive-file-api.mjs` proves Directive storage filenames, `/user/files` path guards, SillyTavern `/api/files/*` wrapper behavior, adapter verify/read/write/delete behavior, repository initialization through the file adapter, and diagnostics over the file API adapter seam.

`test-directive-storage-repository.mjs` proves the adapter-backed storage repository writes payloads, maintains lightweight indexes for Character Creator drafts and campaign saves, prunes rolling autosaves, recovers from a missing active-save payload by selecting a readable fallback, and reports missing/unreadable payload diagnostics.

`test-campaign-start-service.mjs` proves the runtime-facing service workflow can start and resume a draft, accept it into campaign state, write the first save, Save Game, Save Game As, autosave with a rolling cap, and Load Game.

`test-runtime-campaign-start-controller.mjs` proves the runtime controller can build Starships and Character Creator view models, drive package-owned draft save/resume, accept the review into a first save, load campaign state, and recover an active save during startup without hardcoding Ashes data into UI logic.
