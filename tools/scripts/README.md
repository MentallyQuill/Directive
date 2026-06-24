# Tool Scripts

Node-based local scripts for validation, smoke checks, audits, fixture tests, and release gates.

## Current Fast Checks

```powershell
node tools\scripts\run-alpha-gate.mjs
```

The alpha gate runs the current fast checks below in order and stops at the first failure:

```powershell
node tools\scripts\test-extension-shell.mjs
node tools\scripts\test-provider-response-parser.mjs
node tools\scripts\test-directive-provider-routing.mjs
node tools\scripts\test-model-call-authority-matrix.mjs
node tools\scripts\test-sillytavern-chat-prompt-adapters.mjs
node tools\scripts\test-sillytavern-event-wiring.mjs
node tools\scripts\test-sillytavern-runtime-lifecycle.mjs
node tools\scripts\test-player-safe-prompt-context.mjs
node tools\scripts\test-state-delta-gateway.mjs
node tools\scripts\test-campaign-sidecar-scheduler.mjs
node tools\scripts\test-message-recovery.mjs
node tools\scripts\test-chat-native-activation-conclusion.mjs
node tools\scripts\test-chat-turn-orchestrator.mjs
node tools\scripts\test-turn-intent-classifier-fixtures.mjs
node tools\scripts\test-chat-response-recovery.mjs
node tools\scripts\test-chat-native-runtime-flow.mjs
node tools\scripts\test-directive-assist.mjs
node tools\scripts\test-character-creator-assist.mjs
node tools\scripts\test-player-portrait-assets.mjs
node tools\scripts\test-command-spine-layout.mjs
node tools\scripts\test-runtime-shell-creator-flow.mjs
node tools\scripts\test-ship-panel-state-records.mjs
node tools\scripts\test-visual-system-foundation.mjs
node tools\scripts\validate-campaign-package.mjs
node tools\scripts\test-campaign-package-context.mjs
node tools\scripts\test-campaign-package-importer.mjs
node tools\scripts\test-package-update-diagnostics.mjs
node tools\scripts\test-campaign-start-and-save.mjs
node tools\scripts\test-sillytavern-file-api.mjs
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
node tools\scripts\test-host-contract-fake.mjs
node tools\scripts\test-host-import-boundaries.mjs
node tools\scripts\test-host-sidecar-orchestrator.mjs
node tools\scripts\test-lumiverse-entrypoints.mjs
node tools\scripts\test-logical-storage-adapter.mjs
node tools\scripts\test-lumiverse-events-adapter.mjs
node tools\scripts\test-lumiverse-host-factory.mjs
node tools\scripts\test-lumiverse-prompt-blocks.mjs
node tools\scripts\test-sidecar-job-runner.mjs
node tools\scripts\test-logical-storage-paths.mjs
node tools\scripts\test-lumiverse-generation-client.mjs
node tools\scripts\test-lumiverse-interceptor-adapter.mjs
node tools\scripts\test-lumiverse-storage-adapter.mjs
node tools\scripts\test-lumiverse-tools-adapter.mjs
node tools\scripts\test-prompt-injection-safety.mjs
node tools\scripts\test-stage30-runtime-hygiene.mjs
node tools\scripts\test-dual-host-scaffold.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\validate-mission-graph.mjs schemas/mission/mission-graph.schema.json packages/bundled/breckenridge/ashes-of-peace.campaign-package.json packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json packages/bundled/breckenridge/chapter-1-the-empty-convoy.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas/mission/mission-graph.schema.json packages/bundled/breckenridge/ashes-of-peace.campaign-package.json packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\test-mission-state-delta-contract.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\test-runtime-director-turn.mjs
node tools\scripts\test-runtime-host-injection.mjs
node tools\scripts\test-runtime-stage9-turn-loop.mjs
node tools\scripts\test-command-log-summary-sidecar.mjs
node tools\scripts\test-simulation-mode-policy.mjs
node tools\scripts\test-runtime-stage18-rerun-branch-recovery.mjs
node tools\scripts\test-command-bearing.mjs
node tools\scripts\test-crew-bplots.mjs
node tools\scripts\test-thread-ledger.mjs
node tools\scripts\verify-repo-structure.mjs
```

`test-director-retrieval-orchestration.mjs` proves the shared Director retrieval pipeline: audience packet separation, hidden reveal gating, exact narrator recall for current Prelude phases, retrieval journals, and simulation-mode-independent retrieval breadth.

`test-visual-system-foundation.mjs` proves the first Directive UI foundation: data-only Theme Pack tokens, Icon Pack slot fallback, package image resolver fallback, command-spine and phone bottom-navigation CSS scans, phone action CSS scans, and hidden raw-value non-regression.

`test-command-competence-planner.mjs` proves the Stage 21 Command Competence planner: routine professional action eligibility, Command Brief inputs, professional knowledge filtering, default Domain Report economy, Authority Notes, hidden-truth exclusion, and source-state immutability.

`test-command-competence-no-gotcha.mjs` proves serious procedural consequences must have a fair-play basis: communicated warning, explicit fair exception, genuine concealment, or a similar no-gotcha basis. It also proves omitted routine procedure is not a valid serious consequence when Procedural Autocomplete handled it.

`test-runtime-stage22-command-brief.mjs` proves the Stage 22 Command Brief runtime integration: mission graphs can provide competence policy, Director previews expose a competence packet, commits write commandCompetence ledgers, turn ledger entries preserve the packet, and the Mission panel renders the Command Brief without leaking hidden truth.

`test-open-world-model-contracts.mjs` proves the schema-v2 model-call roles for quest action interpretation, quest architecture, scene-delta extraction, and scene reconciliation extraction.

`test-open-world-thread-engine.mjs` proves schema-v2 thread lifecycle, evidence merging, promotion readiness, player-safe summaries, and hidden-state exclusion.

`test-open-world-dynamic-quest-e2e.mjs` proves thread-to-quest promotion, dynamic quest registration, deterministic quest state mutation, and player-safe quest visibility.

`test-open-world-delegation-lifecycle.mjs` proves accepting, activating, delegating, pausing, abandoning, and resolving open-world quest work.

`test-open-world-context-budget.mjs` proves context orchestration and player-safe prompt budget limits for open-world state.

`test-lumiverse-entrypoints.mjs` proves Lumiverse backend/frontend source entrypoints, runtime bridge initialization, open-world quest runtime actions, narration routing, sidecar diagnostics, and frontend command-spine mounting.

`test-logical-storage-adapter.mjs` and `test-logical-storage-paths.mjs` prove host-neutral storage behavior and path safety for SillyTavern and Lumiverse.

The Lumiverse adapter tests prove events, host factory construction, generation client behavior, prompt blocks, interceptor registration, storage adapter behavior, tools adapter behavior, and open-world runtime bridge entrypoints.

`test-sidecar-job-runner.mjs`, `test-host-sidecar-orchestrator.mjs`, `test-command-log-summary-sidecar.mjs`, and `test-prompt-injection-safety.mjs` prove schema-v2 sidecar execution, host-aware routing, low-cost command-log summaries, and prompt-injection rejection.

`test-stage30-runtime-hygiene.mjs` scans `src`, `tools`, `packages`, and `schemas` for legacy runtime identifiers before alpha-gate completion.

`test-mission-state-delta-contract.mjs` proves existing actor/front state deltas fail fast when hidden raw-value guards, source outcome ids, graph clock links, or explicit graph pressure links are malformed.

`test-dual-host-scaffold.mjs` runs the dual-host scaffold suite: host contracts, SillyTavern and Lumiverse host factories, Lumiverse manifest/entrypoints, logical storage adapters, generation routing, prompt-injection safety, sidecar jobs, Command Log summary sidecars, Lumiverse batch-sidecar routing, and host-aware sidecar orchestration.

`test-lumiverse-entrypoints.mjs` proves `spindle.json` points at real Lumiverse backend/frontend source entrypoints, the backend imports under a fake `spindle`, replies are targeted by `userId`, read-only tools and player-safe prompt-block interceptor register safely, the runtime bridge can initialize, quick-start, save/load, preview/commit a Director turn, run open-world quest opportunity/accept/delegate/time actions, generate narration through Lumiverse quiet generation, run diagnostic sidecars through Lumiverse batch generation with resolved connection metadata, the live smoke preserves local-dev extension installs by default, and the frontend mounts the shared command-spine shell through a Lumiverse app overlay while the drawer tab acts only as a launcher.

`smoke-lumiverse-live.mjs` is the local live-host smoke for an active Lumiverse server. It reads `LUMIVERSE_USERNAME` and `LUMIVERSE_PASSWORD`, imports or restarts the local Directive extension, preserves an existing local-dev/dev-mode Directive install by default, grants `generation`/`interceptor`/`tools`/`app_manipulation`, verifies the frontend bundle includes command-spine app-overlay markers plus open-world runtime-action markers, verifies registered tools, runs WebSocket runtime actions, and attempts prompt dry-run injection without a model call. Set `DIRECTIVE_LUMIVERSE_IMPORT=0` to skip import-local completely, or `DIRECTIVE_LUMIVERSE_PRESERVE_DEV_MODE=0` to force import-local even when the listed extension row looks local-dev. Set `DIRECTIVE_LIVE_GENERATION=1` to also run real narration and concurrent sidecar model calls; provider-auth failures print a structured external-blocker result.

`smoke-sillytavern-live.mjs` is the local live-host scaffold for an active SillyTavern server. With no host configured, or with `--dry-run`, it prints the intended checklist and exits successfully. Set `SILLYTAVERN_BASE_URL=http://127.0.0.1:8000` to verify served Directive manifest/source assets. Set `DIRECTIVE_SILLYTAVERN_BROWSER=1` to check the live browser shell with Playwright when available or an installed Edge/Chrome CDP fallback; add `DIRECTIVE_SILLYTAVERN_TOGGLE_ONLY=1` to stop after proving the Directive enabled switch off/on path. Set `DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1` with browser mode to capture desktop and phone-width PNGs for every Directive route and assert bottom-navigation geometry; `DIRECTIVE_SILLYTAVERN_SCREENSHOT_DIR` can override the output root. Set `DIRECTIVE_SILLYTAVERN_STORAGE=1` only when the host API is connected and the smoke may write, verify, read, and delete one smoke-owned `/user/files` JSON file; the script can bootstrap CSRF/session headers from `/csrf-token` when explicit env headers are absent. Browser-only no-generation UI smoke can run while SillyTavern reports API disconnected, but narration, provider routing, storage, preview/commit, and save/load require a connected API/provider surface.

`soak-sillytavern-campaign-live.mjs` is the preparation scaffold for the comprehensive live campaign soak. The current dry-run mode validates the Playwright-first harness assumptions, the unlimited model-call policy, the artifact/report schema, the 52-turn phase contract, End Conditions terminal scenario contract, and optional served-extension freshness checks. Run `node tools\scripts\soak-sillytavern-campaign-live.mjs --dry-run`; add `--write-artifacts` to write the report skeleton under `artifacts/live-soak/sillytavern-campaign/<run-id>`, and add `--live-preflight` with `SILLYTAVERN_BASE_URL` to compare served extension hashes against the checkout. Because extension fixes may land in parallel, live soak testing must begin by syncing the installed/served SillyTavern Directive extension copy; if the hash preflight is skipped, set `DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1` only after syncing.

`smoke-sillytavern-terminal-endings-live.mjs` is the current live End Conditions smoke for an active SillyTavern server. It requires `SILLYTAVERN_BASE_URL` and `DIRECTIVE_SILLYTAVERN_GENERATION=1` or `DIRECTIVE_LIVE_GENERATION=1`. It creates fresh Ashes campaigns, forces a terminal Breckenridge failure, verifies terminal checkpoint posting, then resolves Save as branch, Replay from checkpoint, Push On, and Keep this ending through chat replies while checking the end-condition ledger, branch records, continuation frames, conclusion metadata, final band, and model-call growth.

`check-playwright-soak-readiness.mjs` is the offline Playwright readiness probe for the soak harness. It does not contact SillyTavern. It launches Chromium, drives a role-locator click, switches the soak desktop and phone viewports, and writes a fixture trace plus screenshots. By default it writes to a temp directory; add `--write-artifacts` to write under `artifacts/live-soak/sillytavern-campaign/<run-id>`. The same browser-control probe is also part of the soak dry run unless `DIRECTIVE_SKIP_PLAYWRIGHT_BROWSER_CHECK=1` is set.

`discover-sillytavern-message-mutation-live.mjs` is a read-only Playwright discovery probe for the safest future edit/delete automation path. With no `--live` flag it prints a dry-run report. With `SILLYTAVERN_BASE_URL` and `--live`, it inspects SillyTavern event names, Directive bridge capabilities, recent message-row geometry, and visible edit/delete/message-action controls without mutating chat history. Add `--write-artifacts` to store `discovery/message-mutation-discovery.json` under the soak artifact tree.

`test-live-soak-prep.mjs` verifies the soak prep scaffolding without a live host: helper normalization, artifact directory creation, JSONL writing, schema constants, phase count, the 52-turn script, and the End Conditions terminal scenario contract.

`capture-mission-subtab-live.mjs` captures focused Visual Target Loop evidence for Mission sub-tabs in a real SillyTavern host. Run `node tools\scripts\capture-mission-subtab-live.mjs recovery before` or `node tools\scripts\capture-mission-subtab-live.mjs sidework after` while `SILLYTAVERN_BASE_URL` points at the local host; it launches the same Edge/Chrome CDP fallback, selects Mission, opens the requested sub-tab, and writes desktop/phone screenshots plus layout JSON into that target unit's `docs/design/visual-targets/.../iteration-01` folder.

`test-runtime-host-injection.mjs` proves `createDirectiveRuntimeApp({ host })` can initialize through a `DirectiveHost`, expose host metadata in runtime views, run a Director turn, and generate narration through the host generation client without provider overrides.

`test-command-log-summary-sidecar.mjs` proves the first LLM-assisted Command Log sidecar: low-cost fast utility-role request metadata, SillyTavern sequential generation, Lumiverse batch-capable generation, committed-entry-only updates, and fail-soft provider errors.

`test-campaign-package-importer.mjs` proves pre-alpha `.directive-campaign.zip` normalization from stored ZIP entries and decoded archive entries, including unsafe path rejection, active content rejection, missing spine fields, package id mismatch, and invalid transport metadata.

`test-package-update-diagnostics.mjs` proves package health diagnostics for bundled/imported records, campaign package-version drift, package id mismatch, missing active mission graph ids, projection mismatches, and Campaign view health summaries.

`test-mission-director-loop.mjs` runs the executable Director loop against deterministic mission fixtures and compares generated packets to established turn contract fixtures.

`test-transaction-state.mjs` proves the in-memory campaign transaction helpers can commit, swipe, edit, delete, and restore Director outcomes without mutating source state.

`test-runtime-director-turn.mjs` proves runtime scene snapshot construction, Mission Director execution, transaction commit, narrator prompt/provider handoff, provider-failure recovery, Command Log update, and default swipe-reroll preservation from active campaign state.

`test-runtime-stage9-turn-loop.mjs` proves the first playable turn loop: Provisional Outcome preview, eligible Command Bearing spend, Final Outcome commit, narration generation, provider-failure recovery, and retry without rerolling mechanics.

`test-simulation-mode-policy.mjs` proves Exploration versus Command consequence policy: the same hazardous combined-load action preserves hidden state truth in both modes, Command keeps full causal severity, Exploration caps fatal/severe outcomes without forcing success, narrator constraints reflect mode, and retired rank-style difficulty labels stay out of active settings policy.

`test-runtime-stage18-rerun-branch-recovery.mjs` proves transaction recovery across player-controlled changes: Rewrite Narration preserves mechanics, Rerun Outcome previews from the original pre-outcome snapshot without changing current state, accepting a replacement rolls back spends and awards, Save Game As records branch divergence metadata from active state, and Delete Outcome restores the prior snapshot.

`test-command-bearing.mjs` proves Command Bearing Marks, rank thresholds, Recovery uniqueness, reserve caps, spend eligibility, outcome improvement, duplicate-spend protection, and intervention prompt shape.

`test-crew-bplots.mjs` proves senior-staff B-plot hook derivation, coalition/objection rules, hidden relationship memory updates, and mission graph links for crew arcs.

`test-thread-ledger.mjs` proves the first Narrative Thread Engine foundation: hidden ledger constants, record normalization, lifecycle deltas, evidence merge, closure reviews, immutability, and player-safe summary filtering.

`test-campaign-package-context.mjs` proves the runtime package-context adapter can derive Campaign-tab summary data and package-driven Character Creator context without mutating package templates.

`test-extension-shell.mjs` proves the Directive manifest, lifecycle hook exports, extensions-menu launcher, runtime action registry, and minimal tabbed runtime shell use Directive identity and avoid legacy project identifiers.

`test-provider-response-parser.mjs` proves shared provider output normalization and structured JSON recovery: chat-completion extraction, reasoning-only and token-limit classification, fenced JSON, trailing commas, comments, reasoning tags, and literal line breaks inside JSON strings.

`test-runtime-shell-creator-flow.mjs` proves the rendered Campaign tab can start a package-owned Character Creator draft, save partial identity, leave and resume the draft, complete the review, begin the campaign, create the first save, render state-backed Mission, Crew, Ship, Log, and Settings panels, run Settings diagnostics and State Safety verify/export/cleanup/settle actions, preview and accept a Mission-panel action, show the resulting autosave, overwrite the manual save through Campaign Records Save Game, create a branch through the Save Game As dialog, and load a save from Campaign Records.

`test-ship-panel-state-records.mjs` proves the Ship panel renders structured damage, restriction, and technical-debt records inside Operational Readiness folder disclosures instead of raw object strings while hiding non-visible records.

`test-campaign-start-and-save.mjs` proves partial Character Creator draft saves, accepted creator reviews, initial campaign-state creation, first save records, Save Game overwrite, Save Game As, load behavior, and template immutability.

`test-sillytavern-file-api.mjs` proves Directive storage filenames, `/user/files` path guards, SillyTavern `/api/files/*` wrapper behavior, physical adapter verify/read/write/delete behavior, repository initialization through the SillyTavern logical-to-file adapter chain, and diagnostics over the SillyTavern file API adapter seam.

`test-directive-storage-repository.mjs` proves the adapter-backed storage repository uses logical keys, writes payloads, maintains lightweight indexes for Character Creator drafts and campaign saves, prunes rolling autosaves, recovers from a missing active-save payload by selecting a readable fallback, reports missing/unreadable payload diagnostics, and cleans missing index records while retaining corrupt-payload errors.

`test-campaign-start-service.mjs` proves the runtime-facing service workflow can start and resume a draft, accept it into campaign state, write the first save, Save Game, Save Game As, autosave with a rolling cap, and Load Game.

`test-runtime-campaign-start-controller.mjs` proves the runtime controller can build Campaign and Character Creator view models, drive package-owned draft save/resume, accept the review into a first save, load campaign state, and recover an active save during startup without hardcoding Ashes data into UI logic.
