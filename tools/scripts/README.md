# Tool Scripts

Node-based local scripts for validation, smoke checks, audits, fixture tests, and release gates.

## Current Fast Checks

```powershell
node tools\scripts\run-alpha-gate.mjs
```

The alpha gate runs the current fast checks below in order and stops at the first failure:

```powershell
node tools\scripts\test-extension-shell.mjs
node tools\scripts\test-runtime-shell-creator-flow.mjs
node tools\scripts\validate-starship-package.mjs
node tools\scripts\test-starship-package-context.mjs
node tools\scripts\test-starship-package-importer.mjs
node tools\scripts\test-package-update-diagnostics.mjs
node tools\scripts\test-campaign-start-and-save.mjs
node tools\scripts\test-directive-file-api.mjs
node tools\scripts\test-directive-storage-repository.mjs
node tools\scripts\test-campaign-start-service.mjs
node tools\scripts\test-runtime-campaign-start-controller.mjs
node tools\scripts\validate-campaign-projection.mjs
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\test-crew-retrieval-fixture.mjs
node tools\scripts\test-director-retrieval-orchestration.mjs
node tools\scripts\test-command-competence-planner.mjs
node tools\scripts\test-command-competence-no-gotcha.mjs
node tools\scripts\test-runtime-stage22-command-brief.mjs
node tools\scripts\test-runtime-stage23-25-chapter1-opening.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\test-runtime-director-turn.mjs
node tools\scripts\test-runtime-stage9-turn-loop.mjs
node tools\scripts\test-runtime-stage10-prelude-autosave.mjs
node tools\scripts\test-runtime-stage11-readiness.mjs
node tools\scripts\test-runtime-stage12-fallback-command.mjs
node tools\scripts\test-runtime-stage13-command-rhythm.mjs
node tools\scripts\test-runtime-stage14-hesperus-aftermath.mjs
node tools\scripts\test-runtime-stage15-combined-load.mjs
node tools\scripts\test-runtime-stage16-prelude-completion.mjs
node tools\scripts\test-simulation-mode-policy.mjs
node tools\scripts\test-runtime-stage18-rerun-branch-recovery.mjs
node tools\scripts\test-command-bearing.mjs
node tools\scripts\test-crew-bplots.mjs
node tools\scripts\verify-repo-structure.mjs
```

`test-director-retrieval-orchestration.mjs` proves the shared Director retrieval pipeline: audience packet separation, hidden reveal gating, exact narrator recall for current Prelude phases, retrieval journals, and simulation-mode-independent retrieval breadth.

`test-command-competence-planner.mjs` proves the Stage 21 Command Competence planner: routine professional action eligibility, Command Brief inputs, professional knowledge filtering, default Domain Report economy, Authority Notes, hidden-truth exclusion, and source-state immutability.

`test-command-competence-no-gotcha.mjs` proves serious procedural consequences must have a fair-play basis: communicated warning, explicit fair exception, genuine concealment, or a similar no-gotcha basis. It also proves omitted routine procedure is not a valid serious consequence when Procedural Autocomplete handled it.

`test-runtime-stage22-command-brief.mjs` proves the Stage 22 Command Brief runtime integration: mission graphs can provide competence policy, Director previews expose a competence packet, commits write commandCompetence ledgers, turn ledger entries preserve the packet, and the Mission panel renders the Command Brief without leaking hidden truth.

`test-runtime-stage23-25-chapter1-opening.mjs` proves Stage 23-25 integration: broad/domain counsel selection, default report economy, serious and critical warning confirmation, accepted-risk ledger persistence, replacement rollback, Prelude-to-Chapter-1 graph activation, and the first Chapter 1 opening posture.

`test-pressure-ledger.mjs` proves the pressure ledger MVP: deterministic pressure seeding from committed campaign flags, save/load and branch clone preservation, Open Orders candidate eligibility, suppression without deletion, and escalation after an ignored campaign beat.

`test-runtime-stage26-28-first-response-pressure.mjs` proves Stage 26-28 runtime integration: Chapter 1 first-response paths, quarantine warnings, no-gotcha routine support, Exploration/Command hazardous mode pairing, pressure persistence, replacement rollback, and delete rollback.

`test-runtime-stage29-30-pressure-handoff.mjs` proves Stage 29-30 handoff hardening: Chapter 1 first-response flags, pressure links to later Chapter 1/Open Orders I, pressure-aware Domain Reports and Command Briefs, side-candidate availability, and hidden-truth safety.

`test-stage30-runtime-hygiene.mjs` scans `src`, `tools`, `packages`, and `schemas` for legacy runtime identifiers before alpha-gate completion.

`test-starship-package-importer.mjs` proves pre-alpha `.directive-starship.zip` normalization from stored ZIP entries and decoded archive entries, including unsafe path rejection, active content rejection, missing spine fields, package id mismatch, and invalid transport metadata.

`test-package-update-diagnostics.mjs` proves package health diagnostics for bundled/imported records, campaign package-version drift, package id mismatch, missing active mission graph ids, projection mismatches, and Starships view health summaries.

`test-mission-director-loop.mjs` runs the executable Director loop against deterministic mission fixtures and compares generated packets to established turn contract fixtures.

`test-transaction-state.mjs` proves the in-memory campaign transaction helpers can commit, swipe, edit, delete, and restore Director outcomes without mutating source state.

`test-runtime-director-turn.mjs` proves runtime scene snapshot construction, Mission Director execution, transaction commit, narrator prompt/provider handoff, provider-failure recovery, Command Log update, and default swipe-reroll preservation from active campaign state.

`test-runtime-stage9-turn-loop.mjs` proves the first playable turn loop: Provisional Outcome preview, eligible Command Bearing spend, Final Outcome commit, narration generation, provider-failure recovery, and retry without rerolling mechanics.

`test-runtime-stage10-prelude-autosave.mjs` proves opening Prelude scenario depth and save stability: arrival-tone resolution, ready-room handoff resolution, phase advancement, hidden outcome flags, crew-integration strain updates, stable narrated autosaves, and the three-autosave rolling cap.

`test-runtime-stage11-readiness.mjs` proves the senior staff readiness conference: package-started campaign play can reach `senior-readiness-conference`, preview and commit readiness priorities, reveal combined-load risk, update hidden senior-staff and ship flags, advance to `fallback-command-drill`, autosave the stable turn, and record hidden relationship memory.

`test-runtime-stage12-fallback-command.mjs` proves the fallback-command drill: normal campaign play can reach `fallback-command-drill`, commit a temporary fallback-command protocol, reveal fallback incompatibility and command-network certificate facts, carry an accepted limitation into ship state, increase technical-debt pressure when remediation is deferred, advance to `command-rhythm-scenes`, autosave, and record hidden relationship memory.

`test-runtime-stage13-command-rhythm.mjs` proves the command-rhythm interval: normal campaign play can reach `command-rhythm-scenes`, resolve a freeform senior-staff contact interval without an active decision point, record hidden command-culture tendency, update relationship memory, advance to `hesperus-diversion`, and expose the Hesperus decision points.

`test-runtime-stage14-hesperus-aftermath.mjs` proves Hesperus aftermath continuity: normal campaign play can resolve the Hesperus rescue, commit aftermath follow-up records, reveal optional escape-pod data only when assigned, advance to `combined-load-test`, autosave, and record relationship memory for affected owners.

`test-runtime-stage15-combined-load.mjs` proves the combined-load test: normal campaign play can reach `combined-load-test`, commit an honest readiness limitation with schedule cost, advance to `final-command-review`, autosave, preserve narrator safety constraints, and record relationship memory for flight, operations, and engineering.

`test-runtime-stage16-prelude-completion.mjs` proves Prelude completion: normal campaign play can complete final command review, set arrival posture and Prelude end state, reveal the Relief Convoy Twelve transition fact, queue Chapter 1, autosave, and record relationship memory for the final review.

`test-simulation-mode-policy.mjs` proves Exploration versus Command consequence policy: the same hazardous combined-load action preserves hidden state truth in both modes, Command keeps full causal severity, Exploration caps fatal/severe outcomes without forcing success, narrator constraints reflect mode, and retired rank-style difficulty labels stay out of active settings policy.

`test-runtime-stage18-rerun-branch-recovery.mjs` proves transaction recovery across player-controlled changes: Rewrite Narration preserves mechanics, Rerun Outcome previews from the original pre-outcome snapshot without changing current state, accepting a replacement rolls back spends and awards, Save As records branch divergence metadata from active state, and Delete Outcome restores the prior snapshot.

`test-command-bearing.mjs` proves Command Bearing Marks, rank thresholds, Recovery uniqueness, reserve caps, spend eligibility, outcome improvement, duplicate-spend protection, and intervention prompt shape.

`test-crew-bplots.mjs` proves senior-staff B-plot hook derivation, coalition/objection rules, hidden relationship memory updates, and mission graph links for crew arcs.

`test-starship-package-context.mjs` proves the runtime package-context adapter can derive Starships-tab summary data and package-driven Character Creator context without mutating package templates.

`test-extension-shell.mjs` proves the Directive manifest, lifecycle hook exports, extensions-menu launcher, runtime action registry, and minimal tabbed runtime shell use Directive identity and avoid legacy project identifiers.

`test-runtime-shell-creator-flow.mjs` proves the rendered Starships tab can start a package-owned Character Creator draft, save partial identity, leave and resume the draft, complete the review, begin the campaign, create the first save, render state-backed Mission, Crew, Ship, Log, and Settings panels, preview and accept a Mission-panel action, show the resulting autosave, overwrite the manual save through Save Game, create a branch through Save As, and load a save from Starships.

`test-campaign-start-and-save.mjs` proves partial Character Creator draft saves, accepted creator reviews, initial campaign-state creation, first save records, Save Game overwrite, Save Game As, load behavior, and template immutability.

`test-directive-file-api.mjs` proves Directive storage filenames, `/user/files` path guards, SillyTavern `/api/files/*` wrapper behavior, adapter verify/read/write/delete behavior, repository initialization through the file adapter, and diagnostics over the file API adapter seam.

`test-directive-storage-repository.mjs` proves the adapter-backed storage repository writes payloads, maintains lightweight indexes for Character Creator drafts and campaign saves, prunes rolling autosaves, recovers from a missing active-save payload by selecting a readable fallback, and reports missing/unreadable payload diagnostics.

`test-campaign-start-service.mjs` proves the runtime-facing service workflow can start and resume a draft, accept it into campaign state, write the first save, Save Game, Save Game As, autosave with a rolling cap, and Load Game.

`test-runtime-campaign-start-controller.mjs` proves the runtime controller can build Starships and Character Creator view models, drive package-owned draft save/resume, accept the review into a first save, load campaign state, and recover an active save during startup without hardcoding Ashes data into UI logic.
