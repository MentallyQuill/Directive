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
node tools\scripts\test-visual-system-foundation.mjs
node tools\scripts\validate-starship-package.mjs
node tools\scripts\test-starship-package-context.mjs
node tools\scripts\test-starship-package-importer.mjs
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
node tools\scripts\test-runtime-stage23-25-chapter1-opening.mjs
node tools\scripts\test-pressure-ledger.mjs
node tools\scripts\test-open-orders-review.mjs
node tools\scripts\test-open-orders-scene.mjs
node tools\scripts\test-open-orders-resolution.mjs
node tools\scripts\test-runtime-stage26-28-first-response-pressure.mjs
node tools\scripts\test-runtime-stage29-30-pressure-handoff.mjs
node tools\scripts\test-runtime-stage31-chapter1-boarding-threshold.mjs
node tools\scripts\test-runtime-stage32-chapter1-fronts.mjs
node tools\scripts\test-runtime-stage33-chapter1-first-contact.mjs
node tools\scripts\test-runtime-stage34-chapter1-discovery.mjs
node tools\scripts\test-runtime-stage35-chapter1-pell-contact.mjs
node tools\scripts\test-runtime-stage36-chapter1-joint-inspection.mjs
node tools\scripts\test-runtime-stage37-chapter1-cargo-pulse.mjs
node tools\scripts\test-runtime-stage38-chapter1-hardware-recovery.mjs
node tools\scripts\test-runtime-stage39-chapter1-resolution-terms.mjs
node tools\scripts\test-runtime-stage40-chapter1-false-colors-transition.mjs
node tools\scripts\test-runtime-mvp-chapter1-complete.mjs
node tools\scripts\test-runtime-mvp-fresh-journey.mjs
node tools\scripts\test-side-mission-opportunity-detector.mjs
node tools\scripts\test-side-mission-provider-assist.mjs
node tools\scripts\test-runtime-stage41-chapter2-transparency-terms.mjs
node tools\scripts\test-runtime-stage42-chapter2-orison-evidence.mjs
node tools\scripts\test-runtime-stage43-chapter2-aegis-medical.mjs
node tools\scripts\test-runtime-stage44-chapter2-security-access.mjs
node tools\scripts\test-runtime-stage45-chapter2-joint-charter.mjs
node tools\scripts\test-stage30-runtime-hygiene.mjs
node tools\scripts\test-dual-host-scaffold.mjs
node tools\scripts\validate-mission-graph.mjs
node tools\scripts\validate-mission-graph.mjs schemas/mission/mission-graph.schema.json packages/bundled/breckinridge/ashes-of-peace.starship-package.json packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json packages/bundled/breckinridge/chapter-1-the-empty-convoy.mission-graph.json
node tools\scripts\validate-mission-graph.mjs schemas/mission/mission-graph.schema.json packages/bundled/breckinridge/ashes-of-peace.starship-package.json packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json packages/bundled/breckinridge/chapter-2-false-colors.mission-graph.json
node tools\scripts\test-mission-graph-fixture.mjs
node tools\scripts\test-mission-state-delta-contract.mjs
node tools\scripts\validate-mission-director-contract.mjs
node tools\scripts\test-mission-director-loop.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\test-runtime-director-turn.mjs
node tools\scripts\test-runtime-host-injection.mjs
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
node tools\scripts\test-thread-ledger.mjs
node tools\scripts\verify-repo-structure.mjs
```

`test-director-retrieval-orchestration.mjs` proves the shared Director retrieval pipeline: audience packet separation, hidden reveal gating, exact narrator recall for current Prelude phases, retrieval journals, and simulation-mode-independent retrieval breadth.

`test-visual-system-foundation.mjs` proves the first Directive UI foundation: data-only Theme Pack tokens, Icon Pack slot fallback, package image resolver fallback, desktop/static phone-width top-control CSS scans, and hidden raw-value non-regression.

`test-command-competence-planner.mjs` proves the Stage 21 Command Competence planner: routine professional action eligibility, Command Brief inputs, professional knowledge filtering, default Domain Report economy, Authority Notes, hidden-truth exclusion, and source-state immutability.

`test-command-competence-no-gotcha.mjs` proves serious procedural consequences must have a fair-play basis: communicated warning, explicit fair exception, genuine concealment, or a similar no-gotcha basis. It also proves omitted routine procedure is not a valid serious consequence when Procedural Autocomplete handled it.

`test-runtime-stage22-command-brief.mjs` proves the Stage 22 Command Brief runtime integration: mission graphs can provide competence policy, Director previews expose a competence packet, commits write commandCompetence ledgers, turn ledger entries preserve the packet, and the Mission panel renders the Command Brief without leaking hidden truth.

`test-runtime-stage23-25-chapter1-opening.mjs` proves Stage 23-25 integration: broad/domain counsel selection, default report economy, serious and critical warning confirmation, accepted-risk ledger persistence, replacement rollback, Prelude-to-Chapter-1 graph activation, and the first Chapter 1 opening posture.

`test-pressure-ledger.mjs` proves the pressure ledger MVP: deterministic pressure seeding from committed campaign flags, save/load and branch clone preservation, Open Orders candidate eligibility, suppression without deletion, and escalation after an ignored campaign beat.

`test-open-orders-review.mjs` proves the first Open Orders I review slice: eligible authored candidates can be reviewed, selected, or deferred; review records persist in the pressure ledger; selected assignments become available under `sideMissions`; deferrals suppress the source pressure; save/load clones preserve the state; and hidden-source details stay out of player-facing records.

`test-open-orders-scene.mjs` proves the first Open Orders I scene-play slice: a selected assignment opens into active campaign-owned scene state, receives a player-safe scene brief, records an intermediate scene beat, updates pressure history and Command Log continuity, survives save/load cloning, resolves from active state while preserving scene progress, rejects duplicate or inactive scene operations, and proves The Long Repair and Borrowed Wings remain complete multi-beat MVP assignments.

`test-open-orders-resolution.mjs` proves the Open Orders I resolution/progress slice: selected assignments complete through campaign-owned state across all three authored first-interval templates, resolve linked pressure, award authored assets, update `sideMissions` and interval progress, distinguish satisfied versus overextended direct-command load, preserve delegated completion state, write player-safe Command Log rows, survive save/load cloning, and reject duplicate completion.

`test-runtime-stage26-28-first-response-pressure.mjs` proves Stage 26-28 runtime integration: Chapter 1 first-response paths, quarantine warnings, no-gotcha routine support, Exploration/Command hazardous mode pairing, pressure persistence, replacement rollback, and delete rollback.

`test-runtime-stage29-30-pressure-handoff.mjs` proves Stage 29-30 handoff hardening: Chapter 1 first-response flags, pressure links to later Chapter 1/Open Orders I, pressure-aware Domain Reports and Command Briefs, side-candidate availability, and hidden-truth safety.

`test-runtime-stage31-chapter1-boarding-threshold.mjs` proves the second Chapter 1 decision slice: first-contact threshold intent routing, pressure-aware reports, quarantine/evidence/security state updates, warning confirmation, phase advance to consequence review, and hidden-truth safety.

`test-runtime-stage32-chapter1-fronts.mjs` proves the first Chapter 1 actor/front state slice: committed first-contact thresholds upsert hidden actor posture and front records, preserve them through JSON save/load, roll them back on delete, and keep hidden truth out of player-facing summaries.

`test-runtime-stage33-chapter1-first-contact.mjs` proves the first Chapter 1 operational contact slice: the post-threshold execution decision routes through parser/classifier/authority, advances into convoy contact execution, reveals only player-safe Faraday Bell and Parnell facts, updates actor/front state, survives JSON save/load, rolls back on delete, and keeps hidden truth out of player-facing packets.

`test-runtime-stage34-chapter1-discovery.mjs` proves the next Chapter 1 discovery slice: first contact can frame the Ilyon shelter, Pell custody claim, and missing secured-cargo lead; commit player-facing flags; update hidden actor/front state; survive JSON save/load; roll back on delete; and keep hidden signal-source, medical, and cargo-content truth out of player-facing packets.

`test-runtime-stage35-chapter1-pell-contact.mjs` proves the next Chapter 1 contact slice: Pell contact terms can open a joint-inspection route, Ivers release negotiation, and a legal missing-cargo undertaking; commit player-facing flags; update hidden actor/front state; survive JSON save/load; roll back on delete; and keep later false-order, medical, and cargo-use truth out of player-facing packets.

`test-runtime-stage36-chapter1-joint-inspection.mjs` proves the next Chapter 1 execution slice: the opened Pell terms can become a shared inspection record, supervised Ivers release, and active cargo evidence route; commit player-facing flags; update hidden actor/front state; survive JSON save/load; roll back on delete; and keep later false-order, medical, concealed-vessel, and cargo-use truth out of player-facing packets.

`test-runtime-stage37-chapter1-cargo-pulse.mjs` proves the next Chapter 1 cargo slice: the active cargo evidence route can trace a weak diagnostic pulse, preserve a joint recovery locus, and keep final hardware recovery unresolved; commit player-facing flags; update hidden actor/front state; survive JSON save/load; roll back on delete; and keep later false-order, medical, concealed-vessel, and cargo-use truth out of player-facing packets.

`test-runtime-stage38-chapter1-hardware-recovery.mjs` proves the next Chapter 1 recovery slice: the traced cargo route can recover the missing emergency hardware under joint evidence seal while preserving a timing trace and deferring final custody; commit player-facing flags; update hidden actor/front state; survive JSON save/load; roll back on delete; and keep later false-order, medical, concealed-vessel, and cargo-use truth out of player-facing packets.

`test-runtime-stage39-chapter1-resolution-terms.mjs` proves the next Chapter 1 resolution slice: the recovered-hardware record can close into a cooperative joint incident record, Ivers witness trust, Pell witness terms, Compact investigation access, authentication accountability, and Parnell follow-up debt; commit player-facing flags; update hidden actor/front state; survive JSON save/load; roll back on delete; and keep later false-order, medical, concealed-vessel, and cargo-use truth out of player-facing packets.

`test-runtime-stage40-chapter1-false-colors-transition.mjs` proves the Chapter 1 handoff slice: the cooperative closing record can reach Asterion, receive the Compact patrol false-colors report, mark Chapter 1 complete, unlock the Chapter 2 skeleton, update hidden actor/front state, survive JSON save/load, roll back on delete, and keep the impersonation source out of player-facing packets.

`test-runtime-mvp-chapter1-complete.mjs` proves Chapter 1 as one complete MVP player journey from seeded Prelude/Chapter 1 start through the Asterion / False Colors handoff, including player-safe checkpoint text, pressure carry-forward, Command Log continuity, save/load clone behavior, hidden-source safety, and real completed-state opportunity detection plus scheduling, opening, and resolution for post-Chapter-1 side work.

`test-runtime-mvp-fresh-journey.mjs` proves the composed MVP journey from package Character Creator through full Prelude completion, complete Chapter 1, post-Chapter-1 side work scheduling/opening/resolution, save/load clone behavior, hidden-source safety, and bounded turn-ledger rollback snapshots across a real fresh run.

`test-side-mission-opportunity-detector.mjs` proves deterministic post-Chapter-1 side-mission opportunity detection and review persistence: interval/package guards, score thresholding, evidence/hardware and pressure/obligation candidates, Schedule/Defer records, scheduled follow-up state, deterministic scene briefs, scene beats, direct/delegated resolution, cooldown suppression, hidden-source rejection, no provider calls, and input immutability.

`test-side-mission-provider-assist.mjs` proves proposal-only provider assistance for post-Chapter-1 follow-ups: fake structured candidate phrasing and scene framing, sanitized runtime diagnostic/proposal persistence, invalid JSON rejection, provider failure fail-soft behavior, hidden-leak rejection, authority-key rejection for attempted state/source authorship, generation role policy, runtime/bridge wiring, request safety, and campaign immutability.

`test-runtime-stage41-chapter2-transparency-terms.mjs` proves the first Chapter 2 playable slice: the False Colors briefing can set medical help, independent verification, alibi proof, Compact access scope, and tactical secrecy terms; commit player-facing flags and clocks; update hidden actor/front state; survive JSON save/load; roll back on delete; and keep the attack source out of player-facing packets.

`test-runtime-stage42-chapter2-orison-evidence.mjs` proves the next Chapter 2 evidence slice: the post-transparency audit can preserve Orison sensor and traffic baselines, demonstrate a Breckinridge calibration mismatch, open attacker-route reconstruction, commit player-facing flags and clocks, update hidden actor/front state, survive JSON save/load, roll back on delete, and keep the attack source out of player-facing packets.

`test-runtime-stage43-chapter2-aegis-medical.mjs` proves the next Chapter 2 medical-trust slice: the post-evidence response can stabilize the critical Aegis Two officer, open a Compact-observed medical channel, separate medical care from culpability or leverage, preserve voluntary patrol testimony, commit player-facing flags and clocks, update hidden actor/front state, survive JSON save/load, roll back on delete, and keep the attack source out of player-facing packets.

`test-runtime-stage44-chapter2-security-access.mjs` proves the next Chapter 2 security-access slice: the post-medical response can define a controlled command-authentication annex, record Bronn's professional security demonstration, give Kessler a defensible access alternative, honor Tolland's disclosure limits, commit player-facing flags and clocks, update hidden actor/front state, survive JSON save/load, roll back on delete, and keep the attack source out of player-facing packets.

`test-runtime-stage45-chapter2-joint-charter.mjs` proves the Chapter 2 closeout slice: the post-security response can frame a joint investigation charter, give Kessler a face-saving legitimacy statement, restrict Holt interference, preserve the weak Hecate lead for later correlation, authorize the Open Orders transition, commit player-facing flags and clocks, update hidden actor/front state, survive JSON save/load, roll back on delete, and keep hidden-source facts out of player-facing packets.

`test-stage30-runtime-hygiene.mjs` scans `src`, `tools`, `packages`, and `schemas` for legacy runtime identifiers before alpha-gate completion.

`test-mission-state-delta-contract.mjs` proves existing actor/front state deltas fail fast when hidden raw-value guards, source outcome ids, graph clock links, or explicit graph pressure links are malformed.

`test-dual-host-scaffold.mjs` runs the dual-host scaffold suite: host contracts, SillyTavern and Lumiverse host factories, Lumiverse manifest/entrypoints, logical storage adapters, generation routing, prompt-injection safety, sidecar jobs, Command Log summary sidecars, Lumiverse batch-sidecar routing, and host-aware sidecar orchestration.

`test-lumiverse-entrypoints.mjs` proves `spindle.json` points at real Lumiverse backend/frontend source entrypoints, the backend imports under a fake `spindle`, replies are targeted by `userId`, the four read-only tools and player-safe prompt-block interceptor register safely, the runtime bridge can initialize, quick-start, save/load, preview/commit a Director turn, run Open Orders candidate review, scene activation, and scene beat progress, generate narration through Lumiverse quiet generation, run diagnostic sidecars through Lumiverse batch generation with resolved connection metadata, and the frontend drawer tab renders the shared top-control shell with Open Orders candidate/assignment controls.

`smoke-lumiverse-live.mjs` is the local live-host smoke for an active Lumiverse server. It reads `LUMIVERSE_USERNAME` and `LUMIVERSE_PASSWORD`, imports/restarts the local Directive extension, grants `generation`/`interceptor`/`tools`, verifies the frontend bundle includes top-control, Open Orders, and `Advance Scene` control markers, verifies registered tools, runs WebSocket runtime actions, and attempts prompt dry-run injection without a model call. Set `DIRECTIVE_LIVE_GENERATION=1` to also run real narration and concurrent sidecar model calls; provider-auth failures print a structured external-blocker result.

`smoke-sillytavern-live.mjs` is the local live-host scaffold for an active SillyTavern server. With no host configured, or with `--dry-run`, it prints the intended checklist and exits successfully. Set `SILLYTAVERN_BASE_URL=http://127.0.0.1:8000` to verify served Directive manifest/source assets. Set `DIRECTIVE_SILLYTAVERN_BROWSER=1` to check the live browser shell with Playwright when available or an installed Edge/Chrome CDP fallback. Set `DIRECTIVE_SILLYTAVERN_STORAGE=1` only when the host API is connected and the smoke may write, verify, read, and delete one smoke-owned `/user/files` JSON file; the script can bootstrap CSRF/session headers from `/csrf-token` when explicit env headers are absent. Browser-only no-generation UI smoke can run while SillyTavern reports API disconnected, but narration, provider routing, storage, preview/commit, and save/load require a connected API/provider surface.

`test-runtime-host-injection.mjs` proves `createDirectiveRuntimeApp({ host })` can initialize through a `DirectiveHost`, expose host metadata in runtime views, run a Director turn, and generate narration through the host generation client without provider overrides.

`test-command-log-summary-sidecar.mjs` proves the first LLM-assisted Command Log sidecar: low-cost fast utility-role request metadata, SillyTavern sequential generation, Lumiverse batch-capable generation, committed-entry-only updates, and fail-soft provider errors.

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

`test-thread-ledger.mjs` proves the first Narrative Thread Engine foundation: hidden ledger constants, record normalization, lifecycle deltas, evidence merge, closure reviews, immutability, and player-safe summary filtering.

`test-starship-package-context.mjs` proves the runtime package-context adapter can derive Starships-tab summary data and package-driven Character Creator context without mutating package templates.

`test-extension-shell.mjs` proves the Directive manifest, lifecycle hook exports, extensions-menu launcher, runtime action registry, and minimal tabbed runtime shell use Directive identity and avoid legacy project identifiers.

`test-runtime-shell-creator-flow.mjs` proves the rendered Starships tab can start a package-owned Character Creator draft, save partial identity, leave and resume the draft, complete the review, begin the campaign, create the first save, render state-backed Mission, Crew, Ship, Log, and Settings panels, preview and accept a Mission-panel action, show the resulting autosave, overwrite the manual save through Save Game, create a branch through Save As, and load a save from Starships.

`test-campaign-start-and-save.mjs` proves partial Character Creator draft saves, accepted creator reviews, initial campaign-state creation, first save records, Save Game overwrite, Save Game As, load behavior, and template immutability.

`test-sillytavern-file-api.mjs` proves Directive storage filenames, `/user/files` path guards, SillyTavern `/api/files/*` wrapper behavior, physical adapter verify/read/write/delete behavior, repository initialization through the SillyTavern logical-to-file adapter chain, and diagnostics over the SillyTavern file API adapter seam.

`test-directive-storage-repository.mjs` proves the adapter-backed storage repository uses logical keys, writes payloads, maintains lightweight indexes for Character Creator drafts and campaign saves, prunes rolling autosaves, recovers from a missing active-save payload by selecting a readable fallback, and reports missing/unreadable payload diagnostics.

`test-campaign-start-service.mjs` proves the runtime-facing service workflow can start and resume a draft, accept it into campaign state, write the first save, Save Game, Save Game As, autosave with a rolling cap, and Load Game.

`test-runtime-campaign-start-controller.mjs` proves the runtime controller can build Starships and Character Creator view models, drive package-owned draft save/resume, accept the review into a first save, load campaign state, and recover an active save during startup without hardcoding Ashes data into UI logic.
