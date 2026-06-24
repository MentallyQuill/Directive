# Testing Strategy

## Test Culture

Directive should inherit Saga's preference for product-contract tests, visual smoke coverage, storage safety, and live host verification where behavior depends on SillyTavern or Lumiverse.

Tests should prove behavior, not stale source shape. Source-layout tests are acceptable only for boundaries that are explicit architecture contracts, such as no `saga` runtime identifiers and no monolithic runtime owner.

## First Invariants

Highest priority:

- `directive` identity is used in manifest, hooks, globals, storage prefixes, CSS prefixes, and DOM IDs.
- No production runtime identifiers use `saga`.
- Directive runtime navigation is shell-owned. SillyTavern desktop/tablet uses a left command spine and one resizable drawer; phone width uses the bottom route bar. Drawer collapse, full-screen escalation, resize persistence, and Close remain shell-owned. Panel renderers must not add primary navigation or floating shell controls.
- Campaign package schema starts at version 2.
- Settings remain control-plane only.
- Campaign package templates do not mutate when campaign state changes.
- Campaign packages validate the approved top-level spine: `manifest`, `ship`, `crew`, `characterCreation`, `world`, `storyArcs`, `endConditions`, `questTemplates`, `threadTemplates`, `reactionRules`, `directorCards`, `contextPolicy`, `guardrails`, `assets`.
- Character Creator options are package-provided and never hardcoded to Ashes of Peace in runtime logic.
- Bundled Breckenridge/Ashes, Glass Harbor/Drowned Constellation, Serein/Black Current, Eudora Vale/Broken Accord, Aster Vale/Unseen Border, and Celandine/Enemy's Garden data validate through the same package JSON schema as imported packages.
- Ashes of Peace package data contains an open-world story shell, world data, story arcs, standing quest templates, thread templates, reaction rules, and the prelude mission.
- Open-world quests inherit current world, ship, crew, relationship, knowledge, thread, and event state, then commit outcomes back to the same campaign continuity.
- Simulation mode is exactly `Exploration` or `Command`; retired rank-based difficulty labels do not appear in runtime UI.
- Exploration mode applies softer prompt and Director guardrails without erasing committed causality.
- Command mode preserves full deterministic simulation consequences without cheating against the player.
- Inspiration and Resolve are independent command-style tracks, not a single morality axis.
- Command Bearing reserve capacity never exceeds two total points.
- Command Bearing spends improve eligible Provisional Outcomes by exactly two tiers and cannot apply to Success or Great Success.
- Command Bearing spends cannot erase Anchored Consequences or make impossible actions possible.
- Recovery intervals use unique in-world ids and cannot be farmed by repeated time skipping.
- Command Competence supplies routine professional actions without selecting command judgment for the player.
- Command Briefs expose only player-safe facts and professional context, never director-only truth.
- Serious procedural consequences require prior communication, informed bypass, genuine concealment, or another no-gotcha exception.
- Accepted procedural risks are anchored in transaction state and cannot be erased by narration swipes.
- Crew development is distinct from relationship approval and cannot be farmed through low-stakes conversations.
- Mission Director tests preserve the mission's dramatic question without requiring fixed scene order.
- Mission-abandoning actions are classified and resolved through authority, evidence, Captain intent, directives, risk, and cost.
- Director retrieval tests keep Mission Director, Crew Director, Ship Director, Command Director, narrator, and Command Log packets separated by audience and visibility.
- Hidden crew revelations and mission truths never enter narrator packets until reveal state permits them.
- Campaign state is authoritative over narration.
- A swipe cannot reroll an adjudicated outcome.
- A user edit restores and re-resolves state.
- A deletion removes dependent consequences.
- A provider failure cannot partially commit state.
- Dynamic events identify a causal source.
- Clocks advance only from valid triggers.
- Command Decisions cannot be awarded twice for one decision.
- Hidden relationship values are not exposed in normal UI.
- Package import rejects active content and unsafe paths.
- `.directive-campaign.zip` imports normalize into validated JSON package records.
- Side-pressure records are campaign-owned, plain-language, save/load safe, and roll back with the outcome that created them.
- Install and package browsing do not create campaign state or inject campaign prompt context.
- Start Campaign creates one Directive-owned host character card, creates one fresh host chat under that card, posts one introduction, installs one player-safe prompt packet, and completes an idempotent activation journal.
- Active-campaign **Rebind Chat** updates the bound chat to the currently open host chat, rebuilds prompt context, records a recovery/admin journal entry, and does not post a second campaign introduction.
- Only player messages from the bound chat enter the campaign orchestrator.
- Every accepted player post receives one deduplicated ingress record and one utility classification or deterministic equivalent.
- Every turn has exactly one response strategy: host inject-and-continue, Directive-posted response, or explicit pause.
- Consequential mechanics are durably checkpointed before provider narration or host posting.
- Narration and conclusion retries reuse the same outcome or conclusion identity and cannot reroll mechanics.
- Player-safe prompt construction uses explicit selectors and excludes hidden canary values.
- Accepted sidecar proposals are revision-checked, root-authorized, atomically applied, journaled, persisted, and followed by prompt synchronization.
- Stale or cross-domain sidecar proposals are rejected without partial mutation.
- Message edits and deletes either restore a safe snapshot or enter review-required recovery when dependent turns exist.
- Campaign completion posts one final response, marks the save complete, clears prompt injection, and permits explicit archive.
- Utility and Reasoning provider settings remain independent; direct endpoint API keys are session-only.

## Visual Smoke Targets

Initial visual targets:

- Desktop command spine, single drawer, paired bottom resize handles, and compact/expanded shelf modes.
- Resized and full-screen workspace states.
- Phone-width bottom navigation and shell action strip.
- Campaign tab package list.
- Mission overview.
- Crew roster and crew detail.
- Ship state overview.
- Command Log summary and detail expansion.
- Settings provider configuration.
- State safety and diagnostics surfaces.

## Storage Tests

Storage tests should cover:

- Master index creation.
- Domain index creation.
- Payload write and verify.
- Passive asset write and verify.
- Stale write detection.
- Delete cleanup and retry marking.
- Corrupt JSON handling.
- Missing payload diagnostics.
- Import success only after durable storage.
- Character Creator drafts written as payloads and listed through a lightweight draft index.
- Campaign package imports written as payloads and listed through a lightweight package-import index.
- Campaign saves written as payloads and listed through a lightweight save index.
- Load Game marking the selected save active without requiring every save payload to be read.
- Storage filenames stay flat, `directive-` prefixed, and limited to passive JSON for draft/save/import/index payloads.
- Host storage is wrapped behind Directive adapters: SillyTavern owns `/api/files/upload`, `/api/files/verify`, `/api/files/delete`, and `/user/files` mapping, while Lumiverse owns scoped Spindle storage.

## Alpha Gate Contract Suite

The current alpha gate is the dependency-free contract suite in [run-alpha-gate.mjs](../../tools/scripts/run-alpha-gate.mjs). Use it as the normal local confidence command:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

The gate currently runs these checks in order and stops at the first failure:

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
node tools\scripts\test-runtime-shell-creator-flow.mjs
node tools\scripts\test-ship-panel-state-records.mjs
node tools\scripts\test-visual-system-foundation.mjs
node tools\scripts\validate-campaign-package.mjs
node tools\scripts\validate-campaign-package.mjs schemas/campaign-package.schema.json packages/bundled/glass-harbor/drowned-constellation.campaign-package.json
node tools\scripts\test-campaign-package-context.mjs
node tools\scripts\test-campaign-package-importer.mjs
node tools\scripts\test-package-update-diagnostics.mjs
node tools\scripts\test-campaign-start-and-save.mjs
node tools\scripts\test-sillytavern-file-api.mjs
node tools\scripts\test-directive-storage-repository.mjs
node tools\scripts\test-campaign-start-service.mjs
node tools\scripts\test-runtime-campaign-start-controller.mjs
node tools\scripts\validate-campaign-projection.mjs
node tools\scripts\validate-campaign-projection.mjs packages/bundled/glass-harbor/drowned-constellation.campaign-projection.json packages/bundled/glass-harbor/drowned-constellation.campaign-package.json
node tools\scripts\validate-crew-dataset.mjs
node tools\scripts\validate-crew-dataset.mjs schemas/packages/crew-dataset.schema.json packages/bundled/glass-harbor/drowned-constellation.campaign-package.json packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json
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
node tools\scripts\validate-mission-graph.mjs schemas/mission/mission-graph.schema.json packages/bundled/glass-harbor/drowned-constellation.campaign-package.json packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json packages/bundled/glass-harbor/mission-graphs/prelude-soundings.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas/mission/mission-graph.schema.json packages/bundled/glass-harbor/drowned-constellation.campaign-package.json packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json packages/bundled/glass-harbor/mission-graphs/chapter-1-aster-basin.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas/mission/mission-graph.schema.json packages/bundled/glass-harbor/drowned-constellation.campaign-package.json packages/bundled/glass-harbor/glass-harbor-senior-staff.crew-dataset.json packages/bundled/glass-harbor/mission-graphs/chapter-2-caligo-sounding.mission-graph.json
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\test-mission-state-delta-contract.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\test-runtime-director-turn.mjs
node tools\scripts\test-runtime-host-injection.mjs
node tools\scripts\test-runtime-stage9-turn-loop.mjs
node tools\scripts\test-simulation-mode-policy.mjs
node tools\scripts\test-runtime-stage18-rerun-branch-recovery.mjs
node tools\scripts\test-command-bearing.mjs
node tools\scripts\test-crew-bplots.mjs
node tools\scripts\test-thread-ledger.mjs
node tools\scripts\verify-repo-structure.mjs
```

`test-runtime-shell-creator-flow.mjs` covers the first playable inspection surface: package-owned Character Creator, simulation-mode default/persistence, first save creation, Campaign Records Save Game, Save Game As dialog naming with Save/Cancel, Load Game, Settings diagnostics/reload/preview-clear controls, State Safety verify/settle/export/cleanup controls, and rendered Mission, Crew, Ship, Log, and Settings panels backed by initialized campaign state.

`test-ship-panel-state-records.mjs` covers structured Ship caveat records, ensuring visible object records render inside Operational Readiness folder disclosures while hidden records and raw object strings stay out of the Ship tab.

`test-visual-system-foundation.mjs` covers the Saga-inspired Directive visual foundation: data-only Theme Pack tokens, passive Icon Pack slots, icon fallback behavior, package image resolver fallback behavior, command-spine/drawer CSS contracts, phone full-height overlay/z-index guards, and hidden raw-value non-regression. `test-command-spine-layout.mjs` covers the default half-width footprint, viewport constraints, mobile breakpoint, persisted resize geometry, compact/expanded spine modes, and non-persistent full-screen state.

`test-runtime-director-turn.mjs` covers the first runtime Director commit and narration handoff: active campaign state becomes a scene snapshot, `runMissionDirectorTurn` produces the turn packet, `commitDirectorTurn` updates campaign state, Mission/Log state changes are visible through the runtime view, narrator prompts are composed from committed narrator packets, provider failure records retryable recovery, and swipes still default to preserving committed mechanics.

`test-runtime-stage9-turn-loop.mjs` covers the first playable turn loop: active campaign state can preview a Provisional Outcome, expose an eligible Command Bearing intervention, commit a Final Outcome after a spend, generate narration from the committed packet, record provider failure, and retry narration without creating a new mechanical turn.

`test-command-bearing.mjs` covers the Command Bearing MVP helpers: typed Marks, rank/cap progression, unique Recovery, shared reserve limits, spend eligibility, two-tier outcome improvement, duplicate-spend protection, and intervention prompt actions.

`test-command-competence-planner.mjs` covers the Stage 21 competence planner: routine professional action eligibility and rejection, Command Brief inputs, professional knowledge filtering, default Domain Report selection, Authority Notes, hidden-truth exclusion, and non-mutation of source policy, scene snapshot, and campaign state.

`test-command-competence-no-gotcha.mjs` covers no-gotcha fairness for serious procedural consequences: omitted routine procedure should be autocompleted, communicated warnings can justify accepted risk, and genuinely concealed danger can remain fair without leaking hidden truth.

`test-runtime-stage22-command-brief.mjs` covers Stage 22 Command Brief runtime integration: optional mission-graph competence policy, Director preview `competencePacket`, commit-time `commandCompetence` ledger records, turn-ledger packet preservation, and Mission panel rendering without hidden-truth leakage.

`test-open-world-model-contracts.mjs` covers the schema-v2 model-call roles for quest action interpretation, quest architecture, scene-delta extraction, and scene reconciliation extraction.

`test-open-world-thread-engine.mjs` covers schema-v2 thread lifecycle, evidence merging, promotion readiness, player-safe summaries, and hidden-state exclusion.

`test-open-world-dynamic-quest-e2e.mjs` covers thread-to-quest promotion, dynamic quest registration, deterministic quest state mutation, and player-safe quest visibility.

`test-open-world-delegation-lifecycle.mjs` covers accepting, activating, delegating, pausing, abandoning, and resolving open-world quest work.

`test-open-world-context-budget.mjs` covers context orchestration and player-safe prompt budget limits for open-world state.

`test-lumiverse-entrypoints.mjs` covers Lumiverse backend/frontend source entrypoints, runtime bridge initialization, open-world quest runtime actions, narration routing, sidecar diagnostics, and frontend command-spine mounting.

`test-logical-storage-adapter.mjs` and `test-logical-storage-paths.mjs` cover host-neutral storage behavior and path safety used by both SillyTavern and Lumiverse.

The Lumiverse adapter tests cover events, host factory construction, generation client behavior, prompt blocks, interceptor registration, storage adapter behavior, tools adapter behavior, and open-world runtime bridge entrypoints.

`test-sidecar-job-runner.mjs`, `test-host-sidecar-orchestrator.mjs`, `test-command-log-summary-sidecar.mjs`, and `test-prompt-injection-safety.mjs` cover schema-v2 sidecar execution, host-aware routing, low-cost command-log summaries, and prompt-injection rejection.

`test-stage30-runtime-hygiene.mjs` covers the runtime/package/schema identifier hygiene check required before expanding Chapter 1.

`test-dual-host-scaffold.mjs` covers host contracts, SillyTavern and Lumiverse host factories, logical storage adapters, generation routing, prompt-injection safety, sidecar jobs, Command Log summary sidecars, Lumiverse batch-sidecar routing, and host-aware sidecar orchestration.

`test-mission-state-delta-contract.mjs` hardens the Director contract around existing actor/front state deltas, requiring hidden raw-value guards, source outcome IDs, graph clock links, and graph pressure links where those explicit links are present.

`test-crew-bplots.mjs` covers senior-staff B-plot hook derivation, coalition/objection rule packets, hidden plain-language relationship memory updates, and mission graph links for crew arcs.

`test-thread-ledger.mjs` covers the first Narrative Thread foundation: hidden ledger constants, record normalization, directed lifecycle transitions, evidence merging, closure review appends, immutability, and player-safe summaries that exclude latent/watchlisted records, raw scores, hidden facts, and Command Bearing potential.

These dependency-free verifiers check the Directive extension shell contract, prove the rendered Campaign-to-Character-Creator draft save/resume flow and Mission-panel turn controls, check bundled Ashes of Peace and Glass Harbor package records against the schema-v2 contract, gate Ashes-specific invariants to the Ashes reference package, prove storage and save behavior, validate current mission-graph fixtures, prove open-world quest/thread/context/reconciliation behavior, prove hidden-source safety across player-facing packets, prove dual-host scaffolding, and ensure the anticipated repo scaffold remains intact.

## Live Host Smokes

Live host smokes are not a substitute for deterministic contract tests, but they are required when behavior depends on the host application.

- Comprehensive long-run live certification is defined in [Live Campaign Soak Test Plan](LIVE_CAMPAIGN_SOAK_TEST_PLAN.md). That plan is intentionally opt-in and heavier than the smoke scaffold: it uses Playwright as the primary browser driver, allows unlimited live model calls, creates a fresh campaign, plays roughly 50 turns, exercises Directive Assist, message actions, edits, deletes, swipes, Scene Reconciliation, End Conditions terminal branches, branch saves, wrong-chat isolation, and forensic report capture.
- Playwright soak readiness is checked by [check-playwright-soak-readiness.mjs](../../tools/scripts/check-playwright-soak-readiness.mjs). It is an offline preflight that launches Chromium, drives a role-locator click, switches desktop/phone viewports, and writes a fixture trace plus screenshots before any live SillyTavern campaign state is touched.
- SillyTavern live smoke scaffold is [smoke-sillytavern-live.mjs](../../tools/scripts/smoke-sillytavern-live.mjs). With no host configured it prints the intended checklist and exits successfully. With `SILLYTAVERN_BASE_URL` it verifies the served extension manifest and source assets. With `DIRECTIVE_SILLYTAVERN_BROWSER=1` it checks the live browser shell, global Directive bridge, command-spine shell, single-drawer route navigation, shell actions, and all Campaign/Mission/Crew/Ship/Log/Settings route panels through Playwright when available or an installed Edge/Chrome CDP fallback. `DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1` adds desktop and phone-width PNG capture for every Directive route and asserts command-spine/drawer geometry on desktop and bottom-navigation geometry on phone width before writing files under `DIRECTIVE_SILLYTAVERN_SCREENSHOT_DIR` or the OS temp directory. If the live panel already has an active campaign, the default browser path previews one deterministic Mission outcome and discards it. `DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1` additionally clicks Campaign Records Save Game, creates a smoke-named Save Game As branch through the naming dialog, reads the save index/payload through SillyTavern storage, reloads the branch from Campaign, and verifies campaign identity after load. `DIRECTIVE_SILLYTAVERN_GENERATION=1` or `DIRECTIVE_LIVE_GENERATION=1` allows Accept Outcome to run the live narration/provider path and reports `providerGeneration.attempted/proven`; with `DIRECTIVE_SILLYTAVERN_STRICT=1`, Narration Recovery fails the smoke instead of counting as provider proof. With `DIRECTIVE_SILLYTAVERN_TEARDOWN=1`, the browser path invokes served disable cleanup and verifies the panel and Directive bridge are removed. With `DIRECTIVE_SILLYTAVERN_STORAGE=1` it bootstraps CSRF/session headers from `/csrf-token` when env headers are absent, then writes, verifies, reads, and deletes one smoke-owned `/user/files` JSON payload.
- SillyTavern terminal endings smoke is [smoke-sillytavern-terminal-endings-live.mjs](../../tools/scripts/smoke-sillytavern-terminal-endings-live.mjs). With `SILLYTAVERN_BASE_URL` and live generation enabled, it creates fresh Ashes campaigns, forces a terminal Breckenridge failure, verifies `terminalOutcomeDecision` and `terminalOutcomeCheckpoint`, then resolves Save as branch, Replay from checkpoint, Push On, and Keep this ending while checking ledger statuses, branch records, continuation frames, terminal conclusion metadata, final campaign band, and model-call growth. With `DIRECTIVE_SILLYTAVERN_TERMINAL_TRIGGER=command-fitness-ladder`, the same live smoke runs the subtle conduct ladder and proves public insubordination, impaired bridge duty, and officer assault remain non-terminal before unlawful command usurpation creates a command-removal checkpoint.
- Manual SillyTavern browser smoke on the current local host has covered the previous bottom-navigation shell, Campaign, Character Creator default mode and draft persistence, Mission preview/commit with live provider-backed narration/autosave, Campaign Records Save Game, Save Game As branch creation through the naming dialog, branch load, post-Chapter-1 Follow-Up Opportunity scheduling, scheduled follow-up persistence through Save Game As branch load, Settings provider-assist diagnostics/action surfacing on an eligible follow-up save, persisted fail-soft provider timeout diagnostics, accepted proposal-only provider diagnostics, Command Log review-row safety, Crew/Ship/Log/Settings route inspection, desktop shell layout, and phone-width full-screen shell layout with persistent bottom route navigation, integrated Back segment, and explicit Close control behavior.
- SillyTavern no-generation UI smoke may treat the host API/provider connection as an external optional condition when the goal is only to prove page load, menu registration, bridge registration, and shell rendering. Narration, provider routing, `/api/files` storage, preview/commit, save/load, and teardown confidence require a connected SillyTavern API surface and must not be reported as passed from a browser-only disconnected host.
- SillyTavern live smoke now has repeatable opt-in automation for menu registration, command-spine shell rendering, route panels, desktop/phone screenshot capture, CSRF-bootstrapped file API storage, active-campaign preview/discard, gated live commit/narration with provider-proof reporting, gated Campaign Records Save Game / Save Game As branch reselect, and teardown cleanup when Playwright or the Edge/Chrome CDP fallback can control a local browser. The current local host has strict terminal proof for static source assets, `/api/files` upload/verify/read/delete, route coverage through `chromium-cdp`, desktop/phone screenshot geometry, Campaign Records Save Game / Save Game As branch reselect, and one provider-backed commit with `providerGeneration.proven === true`.
- Lumiverse default live smoke is [smoke-lumiverse-live.mjs](../../tools/scripts/smoke-lumiverse-live.mjs). The default path avoids model spend while checking Spindle import/restart, 1.0.4 local-dev extension preservation, permission grant including `app_manipulation`, frontend bundle serving with command-spine app-overlay markers, registered tools, runtime initialize, quick campaign creation, manual save, load, deterministic preview, commit without narration, and prompt dry-run injection. Set `DIRECTIVE_LUMIVERSE_IMPORT=0` to skip import-local entirely; set `DIRECTIVE_LUMIVERSE_PRESERVE_DEV_MODE=0` only when intentionally overwriting an existing local-dev install.
- Lumiverse live generation smoke is opt-in with `DIRECTIVE_LIVE_GENERATION=1`; it should cover `spindle.generate.quiet` narration and concurrent `spindle.generate.batch` sidecars once the local provider connection is valid.
- Lumiverse registered tools currently have live registration coverage and fake-Spindle invocation coverage. Local Lumiverse source exposes direct REST listing through `/api/v1/spindle/tools`; extension tool invocation itself is Council/generation-routed via `TOOL_INVOCATION`, so non-spending live invocation coverage requires a Lumiverse test hook or an intentional Council/generation smoke.

Crew dataset tests should add:

- Director-card schema reference validation.
- Crew dataset manifest and package-id validation.
- Officer ids matching the package crew roster.
- Reveal-gated cards staying out of narrator packets.
- Indexes referencing existing card ids only.
- Development dimensions remaining separate from relationship dimensions.

Mission graph tests should add:

- Package and mission identity validation.
- Required prelude phases and decision points.
- Required outcome flags.
- Failure policy invariants.
- Command Decision reachability and non-repeatability.
- Transition from the prelude into Chapter 1.

Mission Director contract tests should add:

- Scene snapshot identity against active graph and projection.
- Action classification categories.
- Decision point, fact, clock, and Command Decision references.
- State delta outcome flags constrained to graph allowed values.
- Clock deltas constrained to graph clock bounds.
- Narrator packets limited to narrator-safe cards and player-safe facts.
- Command Log packets bound to committed outcome ids.

Mission Director loop tests should add:

- Generated packet comparison against a known turn fixture.
- Pressure focus selection from actor intentions, readiness gates, and scene budget.
- Input immutability for graph, projection, crew dataset, and fixture state.
- Hesperus Command Decision award prevention after the same decision has already been awarded.
- Captain approve/refuse/counteroffer variants for mission-abandoning moves.
- Impossible or unsupported command handling.
- Phase advancement from Hesperus resolution into aftermath.

Command Competence tests should add:

- Knowledge-class classification for routine professional knowledge, specialist knowledge, command judgment, and concealed information.
- Procedural Autocomplete eligibility for routine, reversible, low-cost, noncontroversial, authorized, intent-consistent, non-escalatory actions.
- Procedural Autocomplete rejection for boarding, pursuit, weapons, quarantine waiver, jurisdictional escalation, or other command decisions.
- Command Brief construction from routine response, known facts, uncertainty, operational pressure, and command question.
- Domain Report selection with one or two reports by default and broader counsel only when requested.
- Request Counsel parsing for broad, domain-specific, protocol, recommendation, and objection requests.
- Procedural Warning severity for advisory, serious, and critical departures.
- Authority Note generation for chain-of-command, jurisdiction, emergency authority, and captain-level boundaries.
- No-gotcha enforcement before serious procedural consequences.
- Standing Order matching without mutating historical turns.
- Retroactive Competence acceptance only for plausible, routine, uncontradicted preparation.
- Anchored Risk survival across narration swipe and rollback on outcome replacement.
- Chapter 1 opening fixture where a terse distress-response order receives competent routine support without revealing the false-order truth.

Side-pressure tests should add:

- Pressure seeding from mission outcomes, relationship memory, ship state, package seeds, fronts, and clocks.
- Pressure records with type, source, urgency band, escalation band, cooldown, linked crew, linked systems, linked facts, and linked templates.
- Save/load preservation without exposing hidden scores in normal UI.
- Transaction rollback when the originating outcome is rerun, deleted, or branched away.
- Cooldown behavior that keeps active pressure from becoming repetitive side work.
- Candidate selection from package-authored Open Orders templates.
- Suppression behavior where "not now" delays a pressure without resolving or deleting it.
- Escalation after a campaign beat when a realistic consequence follows ignored pressure.
- Player-facing summaries that do not leak hidden Lantern, Compact, or director-only facts.

Command Bearing tests should add:

- Mark award threshold progression at Ranks I-V.
- One award per unique story, Command Decision, or Command Crucible id.
- Shared reserve capacity at Rank I-II and Rank III+.
- Track point caps by Bearing Rank.
- Recovery uniqueness and cap behavior.
- Intervention eligibility for Inspiration and Resolve.
- Two-tier Provisional Outcome improvement.
- No spend on Success or Great Success.
- Anchored Consequences surviving the spend.
- Spend refund on provider or transaction failure before commit.
- Swipe, edit, delete, and branch behavior for spends and awards.

Character Creator tests should add:

- Campaign context package validation.
- Locked-role display for Ashes of Peace.
- Runtime context extraction from package JSON without mutating package templates.
- Partial draft save, restore, autosave history, and return-to-creator behavior.
- Accepted review conversion into initialized campaign state.
- Runtime-facing service workflow for draft resume and first save creation.
- Runtime controller Campaign and Character Creator view models backed by package data.
- Rendered Campaign and Character Creator shell flow for partial draft save, resume, campaign begin, first save, Campaign Records Save Game, Save Game As, and Load Save.
- Identity, Service, Personality, and Review screen state.
- Local fallback dossier when provider generation fails.
- Generated dossier field boundaries and editable draft behavior.
- Trait profile passed to adjudication without becoming a numeric skill sheet.
- Provider output does not invent forbidden major personal facts.

Campaign save tests should add:

- First save creation immediately after Character Creator review acceptance.
- Save Game overwrite preserving the save id and incrementing revision.
- Save Game As creating a distinct save slot.
- Load Game returning a cloned campaign state.
- Save-list metadata available without reading every full campaign payload.
- Campaign save records preserving hidden state without exposing raw values in normal UI.
- Service-level Save Game, Save Game As, and Load Game workflows over the storage repository.

## Transaction Tests

Transaction tests should use deterministic fixtures before real providers:

- Consequential turn commit.
- Non-consequential turn ignored or logged without state mutation.
- Swipe regeneration preserves outcome ID.
- User edit rolls back original result.
- Delete rolls back dependent changes.
- Branch uses the correct snapshot.
- Interrupted parse resumes or rolls back.
- Narration failure does not lose committed mechanical outcome.

## Provider Tests

Provider tests should cover:

- Host generation adapters route narration and sidecar roles through the active host.
- Command Log assisted summaries use the low-cost `commandLogSummarizer` role and update only the matching committed Command Log entry.
- Utility/Reasoning lanes can be configured separately, and per-role lane overrides route individual model-call roles through the selected lane.
- JSON response repair.
- Empty content from reasoning models.
- Token-limit detection.
- Sanitized diagnostics.
