# Testing Strategy

## Test Culture

Directive should inherit Saga's preference for product-contract tests, visual smoke coverage, storage safety, and live host verification where behavior depends on SillyTavern.

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
- Host prompt tests preserve non-Directive prompt keys and external context-extension surfaces. They must not clear World Info, Memory Books-created World Info, Summaryception, VectFox, or unknown host-owned prompt keys.
- External context diagnostics store bounded statuses, counts, hashes, refs, visibility markers, unavailable reasons, redaction summaries, and timing labels only. They must not capture raw external prompt bodies, generated Memory Books text, Summaryception summaries, vector payloads, embeddings, API keys, Qdrant secrets, provider errors, or hidden Director material.
- External retrieval, summarization, vector, and host-provider delay must be attributed separately from Directive submit-to-generation-start latency.
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
- Scene Handshake settlement turns accepted host-native assistant prose into bounded campaign state only on the next player reply, never from rejected/corrected/stale/wrong-chat sources, and never outside the V1 allowlist of current orders/open assignments, source-backed Log entries, explicit low-risk ship readiness notes, and thread signals.
- Accepted objective or assignment state must project immediately into Mission Current Orders/Open Assignments, source-backed Command Log, and linked player-safe Crew Character/Roster context when crew members are named or affected; transcript-only evidence is not sufficient.
- Timekeeping reply headers are display-only wrappers derived from authoritative campaign state. They appear on every bound assistant reply, are stripped from Directive-controlled evidence/model paths, and cannot advance campaign time without a validated time-boundary commit.
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
- Host storage is wrapped behind Directive adapters: SillyTavern owns `/api/files/upload`, `/api/files/verify`, `/api/files/delete`, and `/user/files` mapping, while the fake host keeps direct logical-key mapping for deterministic tests.

## Alpha Gate Contract Suite

The current alpha gate is the dependency-free contract suite in [run-alpha-gate.mjs](../../tools/scripts/run-alpha-gate.mjs). Use it as the normal local confidence command:

```powershell
node tools\scripts\run-alpha-gate.mjs
```

The gate script is the canonical maintained list and stops at the first failure. It generates bundled package, projection, crew dataset, and mission graph validation from the bundled package registry, so docs should not duplicate the full command list.

Coverage groups:

- extension shell, host contracts, SillyTavern adapters, lifecycle, events, storage, prompt, and generation routing
- runtime state, chat-native activation, turn orchestration, response recovery, state transactions, sidecars, model-call authority, and prompt safety
- open-world package schema v2 contracts, quest/thread/story/reaction/director coordination, package import, and generated bundled package validation
- Command Bearing, Command Competence, mission graph validation, Director fixtures, transaction recovery, end conditions, and visual/system contracts

`npm test`, `npm run verify`, `npm run alpha-gate`, and `node tools\scripts\run-alpha-gate.mjs` all run the same maintained suite.

`test-runtime-shell-creator-flow.mjs` covers the first playable inspection surface: package-owned Character Creator, simulation-mode default/persistence, first save creation, Campaign Records Save Game, Save Game As dialog naming with Save/Cancel, Load Game, Settings diagnostics/reload/preview-clear controls, State Safety verify/settle/export/cleanup controls, and rendered Mission, Crew, Ship, Log, and Settings panels backed by initialized campaign state.

`test-ship-panel-state-records.mjs` covers structured Ship caveat records, ensuring visible object records render inside Operational Readiness folder disclosures while hidden records and raw object strings stay out of the Ship tab.

`test-visual-system-foundation.mjs` covers the Saga-inspired Directive visual foundation: data-only Theme Pack tokens, passive Icon Pack slots, icon fallback behavior, package image resolver fallback behavior, command-spine/drawer CSS contracts, phone full-height overlay/z-index guards, and hidden raw-value non-regression. `test-command-spine-layout.mjs` covers the default half-width footprint, viewport constraints, mobile breakpoint, persisted resize geometry, compact/expanded spine modes, and non-persistent full-screen state.

`test-runtime-director-turn.mjs` covers the first runtime Director commit and narration handoff: active campaign state becomes a scene snapshot, `runMissionDirectorTurn` produces the turn packet, `commitDirectorTurn` updates campaign state, Mission/Log state changes are visible through the runtime view, narrator prompts are composed from committed narrator packets, provider failure records retryable recovery, and swipes still default to preserving committed mechanics.

`test-runtime-stage9-turn-loop.mjs` covers the first playable turn loop: active campaign state can preview a Provisional Outcome, expose an eligible Command Bearing intervention, commit a Final Outcome after a spend, generate narration from the committed packet, record provider failure, and retry narration without creating a new mechanical turn.

`test-command-bearing.mjs` covers the Command Bearing MVP helpers: typed Marks, rank/cap progression, unique Recovery, shared reserve limits, spend eligibility, two-tier outcome improvement, duplicate-spend protection, and intervention prompt actions.

`test-time-advance-adjudicator.mjs` covers deterministic and Utility-backed time-advance proposals: quiet conversations stay at zero, shipboard transitions remain small, explicit waits and scene cuts resolve to bounded elapsed minutes, oversized routine proposals clamp, and model proposals remain proposal-only until runtime validation commits a time boundary.

`test-mission-components.mjs` and `test-mission-components-capture.mjs` cover highlighted-text Mission Component creation, source preservation, Utility/local proposal normalization, source-authority/type/status validation, stale/wrong-chat guards, component update/archive behavior, and the SillyTavern capture affordance.

`test-command-competence-planner.mjs` covers the Stage 21 competence planner: routine professional action eligibility and rejection, Command Brief inputs, professional knowledge filtering, default Domain Report selection, Authority Notes, hidden-truth exclusion, and non-mutation of source policy, scene snapshot, and campaign state.

`test-command-competence-no-gotcha.mjs` covers no-gotcha fairness for serious procedural consequences: omitted routine procedure should be autocompleted, communicated warnings can justify accepted risk, and genuinely concealed danger can remain fair without leaking hidden truth.

`test-runtime-stage22-command-brief.mjs` covers Stage 22 Command Brief runtime integration: optional mission-graph competence policy, Director preview `competencePacket`, commit-time `commandCompetence` ledger records, turn-ledger packet preservation, and Mission panel rendering without hidden-truth leakage.

`test-open-world-model-contracts.mjs` covers the schema-v2 model-call roles for quest action interpretation, quest architecture, scene-delta extraction, and scene reconciliation extraction.

[Continuity Projection Matrix (CPM)](../technical/CONTINUITY_PROJECTION_MATRIX.md) coverage is split between deterministic contract tests and opt-in live soak evidence. The alpha gate includes CPM foundation, diagnostics, Director packet, factual-grounding prompt-proof, and five-user coordinator contract tests:

- `test-continuity-projection-foundation.mjs`
- `test-continuity-projection-diagnostics.mjs`
- `test-continuity-director-packets.mjs`
- `test-factual-grounding-matrix-prompt-proof.mjs`
- `test-continuity-matrix-five-user-soak-coordinator.mjs`

The live five-user CPM coordinator is certification evidence only when run against SillyTavern with non-human soak users. Bounded `--turn-limit` runs prove the coordinator and canaries, not the full 52-turn certification.

`test-open-world-thread-engine.mjs` covers schema-v2 thread lifecycle, evidence merging, promotion readiness, player-safe summaries, and hidden-state exclusion.

`test-open-world-dynamic-quest-e2e.mjs` covers thread-to-quest promotion, dynamic quest registration, deterministic quest state mutation, and player-safe quest visibility.

`test-open-world-delegation-lifecycle.mjs` covers accepting, activating, delegating, pausing, abandoning, and resolving open-world quest work.

`test-open-world-context-budget.mjs` covers context orchestration and player-safe prompt budget limits for open-world state.

`test-logical-storage-adapter.mjs` and `test-logical-storage-paths.mjs` cover host-neutral storage behavior and path safety used by SillyTavern plus the direct-key fake host mapper.

`test-sidecar-job-runner.mjs`, `test-host-sidecar-orchestrator.mjs`, `test-command-log-summary-sidecar.mjs`, and `test-prompt-injection-safety.mjs` cover schema-v2 sidecar execution, host-aware routing, low-cost command-log summaries, and prompt-injection rejection.

`test-stage30-runtime-hygiene.mjs` covers the runtime/package/schema identifier hygiene check required before expanding Chapter 1.

`test-host-scaffold.mjs` covers host contracts, SillyTavern host/generation/storage checks, fake-host contracts, logical storage adapters, generation routing, prompt-injection safety, sidecar jobs, Command Log summary sidecars, fake-host batch routing, and host-aware sidecar orchestration.

`test-mission-state-delta-contract.mjs` hardens the Director contract around existing actor/front state deltas, requiring hidden raw-value guards, source outcome IDs, graph clock links, and graph pressure links where those explicit links are present.

`test-crew-bplots.mjs` covers senior-staff B-plot hook derivation, coalition/objection rule packets, hidden plain-language relationship memory updates, and mission graph links for crew arcs.

`test-thread-ledger.mjs` covers the first Narrative Thread foundation: hidden ledger constants, record normalization, directed lifecycle transitions, evidence merging, closure review appends, immutability, and player-safe summaries that exclude latent/watchlisted records, raw scores, hidden facts, and Command Bearing potential.

These dependency-free verifiers check the Directive extension shell contract, prove the rendered Campaign-to-Character-Creator draft save/resume flow and Mission-panel turn controls, check bundled Ashes of Peace and Glass Harbor package records against the schema-v2 contract, gate Ashes-specific invariants to the Ashes reference package, prove storage and save behavior, validate current mission-graph fixtures, prove open-world quest/thread/context/reconciliation behavior, prove hidden-source safety across player-facing packets, prove SillyTavern plus fake-host scaffolding, and ensure the anticipated repo scaffold remains intact.

## Release Verification Map

Read the verification stack in three layers:

| Layer | What It Proves | Main Evidence |
| --- | --- | --- |
| Dependency-free contract suite | Runtime, package, schema, routing, state, prompt, Mission Components, time adjudication, CPM, and UI contracts work without a live host. | `node tools\scripts\run-alpha-gate.mjs` and targeted `tools/scripts/test-*.mjs` files. |
| Focused live smokes | SillyTavern integration points work against a real host: served extension freshness, shell rendering, storage, generation intercepts, activation, Scene Handshake, terminal endings, screenshots, and provider proof. | `smoke-sillytavern-live.mjs`, `smoke-scene-handshake-live.mjs`, terminal endings smoke, and their artifacts. |
| Opt-in live certification | A real Ashes campaign can survive long-form play with unlimited model calls, sidecar-settled pacing, factual grounding, CPM prompt/source proof, Command Bearing, message mutation, timekeeping, recovery, and release artifacts. | `soak-sillytavern-campaign-live.mjs` and `run-continuity-matrix-five-user-soak.mjs --live --write-artifacts`. |

The live soak has two model-assisted review roles: `factualGroundingReviewer` and `storyQualityReviewer`. They create test artifacts only. They do not mutate campaign state, inject prompts, expose hidden state, or produce player-visible campaign prose.

External-context compatibility is a separate certification surface. Tests must distinguish `observability` from `fixtureDepth`: browser-confirmed installed/disabled/not-installed status proves the host can be inspected, while rich fixture depth proves active redacted pressure from native World Info/Lorebooks, Memory Books/STMB, Summaryception, and VectFox. Certification uses non-human soak users only, never `default-user`, and requires generation-time prompt-inspection snapshots, `report.artifacts.hostExtensions`, concrete `report.artifacts.externalContextSummary`, validated `host-extensions/external-context-summary.json`, target-specific external-environment summaries, redaction canaries, and separate latency attribution for VectFox retrieval/interception, Summaryception summarization, and Memory Books generation when observable.

<!-- directive-render: id=docs-directive-cpm-live-certification; target=assets/documentation/renders/docs-directive-cpm-live-certification.png; source=diagram; -->
Render needed: CPM live certification infographic showing prompt-availability audit, source-id proof, generated-output fact check, contradiction guard/quarantine, and five-user coordinator aggregation.

<!-- directive-render: id=docs-directive-live-soak-artifact-pipeline; target=assets/documentation/renders/docs-directive-live-soak-artifact-pipeline.png; source=diagram; -->
Render needed: live soak artifact pipeline showing non-human SillyTavern users, sidecar-settled pacing, live logs, screenshots, transcript captures, fact checks, prompt inspection, state snapshots, and report schema.

## Live Host Smokes

Live host smokes are not a substitute for deterministic contract tests, but they are required when behavior depends on the host application.

- Comprehensive long-run live certification is defined in [Live Campaign Soak Test Plan](LIVE_CAMPAIGN_SOAK_TEST_PLAN.md). That plan is intentionally opt-in and heavier than the smoke scaffold: it uses Playwright as the primary browser driver, allows unlimited live model calls, creates a fresh campaign, plays roughly 50 turns, exercises Directive Assist, Command Bearing evidence/closure/Mark Review/point-spend behavior, message actions, edits, deletes, swipes, Scene Reconciliation, End Conditions terminal branches, branch saves, wrong-chat isolation, and forensic report capture.
- Scene Handshake live certification is part of the soak plan and has a focused live smoke in [smoke-scene-handshake-live.mjs](../../tools/scripts/smoke-scene-handshake-live.mjs). It must prove accepted host-native assignment settlement, Mission Current Orders/Open Assignments, source-backed Command Log memory, linked Crew Character/Roster projection for named crew, explicit low-risk ship/thread signals, prompt rebuild before current-player classification, idempotency, wrong-chat/save guards, selected-swipe/edit/delete source handling, and sanitized `sceneHandshakeSettler` diagnostics.
- Objective-assignment projection certification is part of the soak plan. Any live test that creates assigned work must capture Mission, Log, and linked Crew excerpts/screenshots plus bounded save-state roots before continuing, so a state/UI projection gap cannot be hidden by a later interval.
- Timekeeping reply-header live certification is part of the soak plan. It must prove exact `*Stardate #####.# | HHMM hours*` headers on Directive-owned and host-native replies, bundled preset Reply Header compliance, stale-header replacement, header stripping from evidence/model paths, branch/campaign isolation, and no time advancement without deterministic state mutation.
- External context-extension certification is part of the soak plan. It must prove prompt-key preservation, final-host-prompt provenance, target-specific diagnostics for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox, observability versus fixture-depth labels, redaction of raw external content/secrets, and source-versus-visibility normalization for ghosted/hidden/prompt-excluded rows.
- Playwright soak readiness is checked by [check-playwright-soak-readiness.mjs](../../tools/scripts/check-playwright-soak-readiness.mjs). It is an offline preflight that launches Chromium, drives a role-locator click, switches desktop/phone viewports, and writes a fixture trace plus screenshots before any live SillyTavern campaign state is touched.
- SillyTavern live smoke scaffold is [smoke-sillytavern-live.mjs](../../tools/scripts/smoke-sillytavern-live.mjs). With no host configured it prints the intended checklist and exits successfully. With `SILLYTAVERN_BASE_URL` it verifies the served extension manifest and source assets. With `DIRECTIVE_SILLYTAVERN_BROWSER=1` it checks the live browser shell, global Directive bridge, command-spine shell, single-drawer route navigation, shell actions, and all Campaign/Mission/Crew/Ship/Log/Settings route panels through Playwright when available or an installed Edge/Chrome CDP fallback. `DIRECTIVE_SILLYTAVERN_SCREENSHOTS=1` adds desktop and phone-width PNG capture for every Directive route and asserts command-spine/drawer geometry on desktop and bottom-navigation geometry on phone width before writing files under `DIRECTIVE_SILLYTAVERN_SCREENSHOT_DIR` or the OS temp directory. If the live panel already has an active campaign, the default browser path previews one deterministic Mission outcome and discards it. `DIRECTIVE_SILLYTAVERN_SAVE_FLOW=1` additionally clicks Campaign Records Save Game, creates a smoke-named Save Game As branch through the naming dialog, verifies the branch save points at a cloned chat id rather than the source chat, reads the save index/payload through SillyTavern storage, reloads the branch from Campaign, and verifies campaign identity after load. `DIRECTIVE_SILLYTAVERN_GENERATION=1` or `DIRECTIVE_LIVE_GENERATION=1` allows Accept Outcome to run the live narration/provider path and reports `providerGeneration.attempted/proven`; with `DIRECTIVE_SILLYTAVERN_STRICT=1`, Narration Recovery fails the smoke instead of counting as provider proof. With `DIRECTIVE_SILLYTAVERN_TEARDOWN=1`, the browser path invokes served disable cleanup and verifies the panel and Directive bridge are removed. With `DIRECTIVE_SILLYTAVERN_STORAGE=1` it bootstraps CSRF/session headers from `/csrf-token` when env headers are absent, then writes, verifies, reads, and deletes one smoke-owned `/user/files` JSON payload.
- SillyTavern terminal endings smoke is [smoke-sillytavern-terminal-endings-live.mjs](../../tools/scripts/smoke-sillytavern-terminal-endings-live.mjs). With `SILLYTAVERN_BASE_URL` and live generation enabled, it creates fresh Ashes campaigns, forces a terminal Breckenridge failure, verifies `terminalOutcomeDecision` and `terminalOutcomeCheckpoint`, then resolves Save as branch, Replay from checkpoint, Push On, and Keep this ending while checking ledger statuses, branch records, continuation frames, terminal conclusion metadata, final campaign band, and model-call growth. With `DIRECTIVE_SILLYTAVERN_TERMINAL_TRIGGER=command-fitness-ladder`, the same live smoke runs the subtle conduct ladder and proves public insubordination, impaired bridge duty, and officer assault remain non-terminal before unlawful command usurpation creates a command-removal checkpoint.
- Manual SillyTavern browser smoke on the current local host has covered the previous bottom-navigation shell, Campaign, Character Creator default mode and draft persistence, Mission preview/commit with live provider-backed narration/autosave, Campaign Records Save Game, Save Game As branch creation through the naming dialog, branch load, post-Chapter-1 Follow-Up Opportunity scheduling, scheduled follow-up persistence through Save Game As branch load, Settings provider-assist diagnostics/action surfacing on an eligible follow-up save, persisted fail-soft provider timeout diagnostics, accepted proposal-only provider diagnostics, Command Log review-row safety, Crew/Ship/Log/Settings route inspection, desktop shell layout, and phone-width full-screen shell layout with persistent bottom route navigation, integrated Back segment, and explicit Close control behavior.
- SillyTavern no-generation UI smoke may treat the host API/provider connection as an external optional condition when the goal is only to prove page load, menu registration, bridge registration, and shell rendering. Narration, provider routing, `/api/files` storage, preview/commit, save/load, and teardown confidence require a connected SillyTavern API surface and must not be reported as passed from a browser-only disconnected host.
- SillyTavern live smoke now has repeatable opt-in automation for menu registration, command-spine shell rendering, route panels, desktop/phone screenshot capture, CSRF-bootstrapped file API storage, active-campaign preview/discard, gated live commit/narration with provider-proof reporting, gated Campaign Records Save Game / Save Game As branch reselect, and teardown cleanup when Playwright or the Edge/Chrome CDP fallback can control a local browser. The current local host has strict terminal proof for static source assets, `/api/files` upload/verify/read/delete, route coverage through `chromium-cdp`, desktop/phone screenshot geometry, Campaign Records Save Game / Save Game As branch reselect, and one provider-backed commit with `providerGeneration.proven === true`.
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

Command Bearing tests should add deterministic and live coverage. The dependency-free suite should keep proving rank math, reserve limits, validation, hidden-state rejection, and transaction invariants. The live soak plan then certifies that those same rules work in a real SillyTavern campaign through believable play, visible Assist controls, model-backed evaluators, save/chat state, and transcript evidence.

Deterministic Command Bearing tests should add or preserve:

- Mark award threshold progression at Ranks I-V.
- One award per unique story, closure, Command Decision, or Command Crucible id.
- Shared reserve capacity at Rank I-II and Rank III+.
- Track point caps by Bearing Rank.
- Recovery uniqueness and cap behavior.
- Intervention eligibility for Inspiration and Resolve.
- Exact two-tier Provisional Outcome improvement.
- No spend on Success or Great Success.
- Anchored Consequences surviving the spend.
- Spend refund on provider or transaction failure before commit.
- Validated evidence, closure, Mark Review, and spend proposal parsing before state mutation.
- Duplicate closure/replay protection for evidence reviews and awards.
- Swipe, edit, delete, save/load, and branch behavior for spends, evidence, reviews, and awards.

Live Command Bearing soak coverage should follow [Live Campaign Soak Test Plan](LIVE_CAMPAIGN_SOAK_TEST_PLAN.md) and prove:

- Evidence accumulation: routine competence, politeness, keywords, and Assist-only actions create no evidence; meaningful committed outcomes can create Inspiration or Resolve evidence only when Agency, Commitment, and Causality are present.
- Boundary detection: scene endings, topic changes, and prompt refreshes do not award Marks by themselves; thread, quest, chapter, milestone, arc, or Command Crucible closure must be proven from authoritative state before a Mark Review can run.
- Mark Review grading: every review is conservative, player-safe, source-anchored, track-specific, and duplicate-guarded; no-award reviews are valid evidence when causality or track fit is weak.
- Point lifecycle: Assist point display, Check Inspiration/Resolve, Ready, Cancel, returned points, valid spends, controlled narration, provider failure handling, and save/load persistence all bind to the correct save, chat, next ingress, and final sent text.
- Spend authority: a valid point spend resolves the base outcome first, validates the final player text, consumes exactly one available point, improves by exactly two bands, and preserves Anchored Consequences.
- Projection safety: Assist, Character/Crew, Command Log, and summaries show useful player-safe Command Bearing history without raw scores, hidden relationship values, hidden clocks, private NPC thoughts, provider reasoning, or Director-only notes.
- Abuse resistance: keyword farming, reward claims, wrong-chat sends, branch replay, swipe/retry, post-commit edit/delete, and hidden-state bait cannot create free evidence, duplicate Marks, rerolled mechanics, or special Command Bearing refunds.
- Interval logging: every 5-10 turn Command Bearing interval records start/end state, model-call roles, evidence/review/spend counts, screenshots, transcript pointers, and a `command-bearing-interval` live-log note even when the interval fails or stops early.

The live plan's Command Bearing probe library and evaluator calibration matrix are the operational checklist for Agent C and any other lane that creates or mutates Command Bearing state. They define organic, organic-negative, fixture-backed, and blocked results plus the minimum interval artifacts needed to certify a gate. Point lifecycle certification must stay gated behind proven evidence taxonomy, scene non-closure, and deterministic closure proof.

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
