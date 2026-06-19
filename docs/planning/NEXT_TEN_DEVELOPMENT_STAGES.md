# Next Ten Development Stages

## Purpose

This document defines the ten implementation stages after the first-playable Directive slice.

The current baseline now proves package loading, package-driven Character Creator, first-save creation, Save Game, Save Game As, Load Game, the rendered runtime shell, the full Prelude mission path, Command Bearing intervention, Exploration/Command consequence policy, explicit narration rewrite versus outcome rerun, Director retrieval, package import normalization, package diagnostics, Chapter 1's opening response frame, Command Competence support, pressure ledger seeding, Open Orders candidate selection, and the local alpha gate.

Stages 11-20 finished the playable `A Ship Underway` Prelude, then hardened the cross-cutting systems needed before Chapter 1 and broader package support.

## Reviewed Baseline

Current implementation evidence:

- Runtime app and shell: [runtime-app.mjs](../../src/runtime/runtime-app.mjs), [runtime-shell.js](../../src/runtime/runtime-shell.js).
- Runtime Director turn path: [director-turn-runtime.mjs](../../src/runtime/director-turn-runtime.mjs).
- Mission Director orchestration: [director.mjs](../../src/mission/director.mjs).
- Deterministic adjudication: [intent-parser.mjs](../../src/adjudication/intent-parser.mjs), [action-resolver.mjs](../../src/adjudication/action-resolver.mjs), [capability-validator.mjs](../../src/adjudication/capability-validator.mjs).
- Phase advancement: [phase-advancement.mjs](../../src/mission/phase-advancement.mjs).
- Campaign transaction state: [transaction-state.mjs](../../src/campaign/transaction-state.mjs).
- Command Bearing helpers: [command-bearing.mjs](../../src/command/command-bearing.mjs).
- Bundled Prelude graph: [prelude-a-ship-underway.mission-graph.json](../../packages/bundled/breckinridge/prelude-a-ship-underway.mission-graph.json).
- Bundled campaign projection: [ashes-of-peace.campaign-projection.json](../../packages/bundled/breckinridge/ashes-of-peace.campaign-projection.json).
- Senior staff dataset: [breckinridge-senior-staff.crew-dataset.json](../../packages/bundled/breckinridge/breckinridge-senior-staff.crew-dataset.json).
- As-coded Director doc: [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md).
- Persistence and transaction docs: [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md), [Turn Transactions](../architecture/TURN_TRANSACTIONS.md).
- Retrieval architecture: [Director Retrieval And Context Orchestration](../architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md).
- Command mechanics: [Command Bearing System](../design/COMMAND_BEARING_SYSTEM.md).
- Current fast checks: [tools/scripts/README.md](../../tools/scripts/README.md).

Important current limits after Stage 50:

- Chapter 1 now completes into Chapter 2: False Colors, and the transparency-terms, Orison evidence-baseline, Aegis medical-trust, security-access demonstration, and joint investigation charter scenes are playable.
- Open Orders I can review, select, and defer authored candidates from the pressure ledger.
- Open Orders I side assignments can resolve across all three authored first-interval templates into campaign-owned completion state, pressure resolution, reward asset state, Command Log continuity, and interval progress.
- Open Orders I interval state now distinguishes partial, satisfied, and overextended direct-command load, with delegated completion state preserved.
- Selected Open Orders I assignments can open into active campaign-owned scene state with player-safe scene briefs before completion.
- Active Open Orders I assignments can record a first intermediate scene beat with player-safe progress, pressure history, Command Log continuity, Mission/Lumiverse controls, and preservation into the later completion record.
- Full fronts, richer multi-beat Open Orders I scene play, and broader side-mission play still need implementation.
- Pressure-aware Domain Reports and Command Brief operational pressure are implemented for the Chapter 1 handoff path, but broader pressure use across later chapters still needs expansion.
- The Command Log now has an initial LLM-assisted summary sidecar over committed, player-visible state; deterministic packet inputs remain authoritative and visible.
- Automatic SillyTavern user-message edit/delete/branch event interception is still future work; explicit runtime recovery controls exist.
- Package import has a normalization and diagnostics path, but not a full player-facing import UI.
- The ZIP reader supports stored entries for the pre-alpha test path; broader compressed-ZIP support can be added later if needed.

## Implementation Status

Stages 11-50 are implemented in the current pre-alpha codebase:

- Stage 11: senior readiness conference.
- Stage 12: fallback-command drill.
- Stage 13: command rhythm and crew B-plots.
- Stage 14: Hesperus aftermath and follow-up.
- Stage 15: combined-load test.
- Stage 16: final command review and Prelude completion.
- Stage 17: Exploration mode and consequence policy.
- Stage 18: rerun outcome, rewrite narration, delete outcome, branch, and recovery.
- Stage 19: Director retrieval orchestration MVP.
- Stage 20: package import normalization, update diagnostics, and alpha gate.
- Stage 21: Command Competence planner.
- Stage 22: Command Brief runtime integration.
- Stage 23: Domain Reports and Request Counsel.
- Stage 24: warning confirmation and accepted-risk persistence.
- Stage 25: Chapter 1 opening graph and transition.
- Stage 26: Chapter 1 first response resolution.
- Stage 27: pressure ledger MVP.
- Stage 28: pressure-to-side-mission candidate selection.
- Stage 29: Chapter 1 consequence and pressure handoff.
- Stage 30: robustness gate, docs, and alpha-readiness hardening.
- Stage 31: Chapter 1 first boarding/contact threshold.
- Stage 32: Chapter 1 hidden actor/front persistence.
- Stage 33: Chapter 1 first-contact execution.
- Stage 34: Chapter 1 shelter, custody, and missing-cargo lead framing.
- Stage 35: Chapter 1 Pell contact terms, Ivers release route, and missing-cargo undertaking.
- Stage 36: Chapter 1 joint inspection execution, supervised Ivers release, and active cargo evidence route.
- Stage 37: Chapter 1 cargo diagnostic pulse tracing and preserved joint recovery locus.
- Stage 38: Chapter 1 hardware recovery under joint evidence seal.
- Stage 39: Chapter 1 cooperative resolution terms, joint incident record, witness trust, Compact access, authentication accountability, and Parnell follow-up debt.
- Stage 40: Chapter 1 Asterion arrival, False Colors patrol report, Chapter 1 completion state, and Chapter 2 skeleton unlock.
- Stage 41: Chapter 2 False Colors transparency terms, medical help, independent verification, alibi proof, Compact access scope, tactical secrecy posture, hidden actor/front persistence, and hidden-source safety.
- Stage 42: Chapter 2 Orison evidence baseline, independent sensor preservation, Breckinridge calibration mismatch, attacker-route reconstruction, selected disclosure boundaries, hidden actor/front persistence, and hidden-source safety.
- Stage 43: Chapter 2 Aegis medical trust, critical officer stabilization, Compact-observed medical channel, medical neutrality, voluntary patrol testimony, hidden actor/front persistence, and hidden-source safety.
- Stage 44: Chapter 2 security-access demonstration, command-authentication annex, Bronn professional security demonstration, Kessler access alternative, Tolland disclosure limits, hidden actor/front persistence, and hidden-source safety.
- Stage 45: Chapter 2 joint investigation charter, Kessler legitimacy statement, Holt interference restriction, weak Hecate trace preservation, Open Orders transition state, hidden actor/front persistence, and hidden-source safety.
- Stage 46: Open Orders I candidate review, selected/deferred review persistence, pressure cooldown/suppression, available side-assignment state, Mission panel controls, and hidden-source safety.
- Stage 47: Open Orders I assignment resolution, completed-assignment persistence, linked pressure resolution, reward asset earning, Mission/Lumiverse runtime action wiring, Command Log continuity, and hidden-source safety.
- Stage 48: Open Orders I interval progress, all three first-interval assignment reward paths, satisfied versus overextended state, delegated completion state, Mission/Lumiverse progress display, and hidden-source safety.
- Stage 49: Open Orders I assignment scene activation, active scene-brief persistence, pressure-history continuity, Mission/Lumiverse scene actions, resolution from active scene state, and hidden-source safety.
- Stage 50: Open Orders I assignment scene beat progress, active scene progress persistence, pressure-history continuity, Mission/Lumiverse Advance Scene actions, completion-record preservation, and hidden-source safety.

## Stage Rules

These stages are sequential by default. A stage may begin early only when it does not force speculative schema, storage, or UI choices that the preceding stage is meant to prove.

Each stage must preserve these rules:

- Do not introduce `saga` runtime identifiers.
- Keep package templates immutable during campaign play.
- Keep UI modules free of storage writes, provider calls, and Ashes-specific logic.
- Keep hidden raw values out of ordinary UI, narrator packets, and Command Log text.
- Treat campaign state as authoritative and narration as presentation.
- Make deterministic fixtures pass before adding provider-assisted behavior.
- Add small modules in the existing ownership boundaries instead of creating a monolithic runtime or Director file.
- Because Directive is pre-alpha, update in place to the best current design rather than preserving old compatibility paths.

## Stage 11: Senior Readiness Conference

Goal: make `senior-readiness-conference` a real playable Director slice instead of generic fallback.

Why now:

The current turn loop advances into `senior-readiness-conference`, but the next player action does not yet receive phase-specific resolution. This is the next blocking gap in the Prelude.

Work:

- Add intent signals for readiness prioritization, department sequencing, accepted risk, deferred work, and delegation.
- Resolve `decision.readiness-priorities` with phase-specific outcome bands.
- Use senior staff cards and coalition/objection rules to determine who contributes, objects, or asks for follow-up.
- Commit hidden plain-language relationship memories for the affected officers.
- Update outcome flags for `prelude.kieran`, `prelude.priya`, `prelude.rowan`, `prelude.miriam`, `prelude.imani`, `prelude.ship-state`, and `prelude.crew-integration` where causally justified.
- Advance to `fallback-command-drill` when the schedule or prioritization stance is concrete enough.
- Add narrator and Command Log packet rules for the briefing.

Exit condition:

A player can handle the first senior staff readiness conference through freeform prose, accept at least one real risk or deferral, and reach `fallback-command-drill` with visible continuity and hidden simulation changes committed.

Verification:

- Add a senior-readiness Director fixture and turn fixture.
- Extend `test-mission-director-loop.mjs`.
- Add or extend a runtime smoke test proving the phase advances from `senior-readiness-conference` to `fallback-command-drill`.
- Keep `validate-mission-graph.mjs`, `validate-mission-director-contract.mjs`, `test-runtime-stage10-prelude-autosave.mjs`, and `test-crew-bplots.mjs` passing.

## Stage 12: Fallback-Command Drill

Goal: implement the Breckinridge's fallback-command drill as the first ship-procedure and command-continuity test.

Why now:

The character bible and campaign material make fallback command one of Bronn's defining shipboard concerns. This phase tests command authority, department trust, and ship-system constraints without needing the main campaign threat yet.

Work:

- Add intent signals for fallback policy, security doctrine, emergency authority, bridge loss, command-network certificates, and technical remediation.
- Resolve `decision.fallback-procedure`.
- Add ship/procedure packet data for fallback command, command-network certificate issues, and emergency authority boundaries.
- Commit effects on `prelude.bronn`, `prelude.priya`, `prelude.imani`, `prelude.ship-state`, `crew-integration-strain`, and `technical-debt-pressure`.
- Support at least two viable approaches: procedural consensus and decisive temporary policy with deferred remediation.
- Advance to `command-rhythm-scenes` when a fallback-command policy exists for the remaining transit.

Exit condition:

The drill produces a concrete fallback-command policy, records whether technical remediation is assigned or deferred, and changes later Prelude context.

Verification:

- Add fallback-command Director and runtime fixtures.
- Test that technical-debt and relationship memories change without exposing raw values.
- Test that both consensus and decisive-policy approaches can succeed with different costs.
- Keep `test-command-bearing.mjs` passing if a Command Bearing opportunity is introduced.

## Stage 13: Command Rhythm And Crew B-Plots

Goal: turn `command-rhythm-scenes` into the first lightweight Crew Director loop.

Why now:

The Prelude needs to show that Directive is not only a mission resolver. The player should be able to build command rhythm with officers, trigger early B-plot hooks, and create continuity through ordinary operational contact.

Work:

- Add a small Crew Director or crew-runtime helper that selects one or two meaningful senior staff contacts from current state, not equal-time rotation.
- Use existing B-plot hooks and coalition/objection rules from the senior staff dataset.
- Record at least two senior officer contacts and one command-culture tendency.
- Add relationship memories from direct conversation, delegated work, disagreement, support, or silence.
- Allow a low-risk Command Bearing Mark only if the scene has real Agency, Commitment, and Causality.
- Advance to `hesperus-diversion` after the required contact and command-culture signals exist.

Exit condition:

The player can spend a short transit interval shaping crew rhythm, and the resulting memories influence later narration or objections.

Verification:

- Add command-rhythm fixtures for at least two different officer contact patterns.
- Extend `test-crew-bplots.mjs` for selected-contact behavior and no equal-time debate.
- Add a runtime smoke path from `command-rhythm-scenes` to `hesperus-diversion`.
- Test that hidden high-trust cards remain hidden unless reveal gates are met.

## Stage 14: Hesperus Aftermath And Follow-Up

Goal: make Hesperus consequences persist beyond the immediate diversion.

Why now:

The Hesperus slice already resolves the emergency and accountability decision. The next step is proving that a contained side incident leaves durable obligations and follow-up work.

Work:

- Resolve `hesperus-aftermath` using the actual Hesperus outcome rather than a fixed scene.
- Add follow-up obligations for medical, engineering, legal, schedule, and crew reaction consequences.
- Preserve optional discoveries such as subspace/escape-pod anomalies only when the player actually earned or noticed them.
- Let the player assign follow-up work to departments or defer it with cost.
- Update Command Log summaries to show unresolved obligations and accepted costs.
- Advance to `combined-load-test` after Hesperus consequences are recorded and schedule margin is updated.

Exit condition:

Hesperus no longer behaves like an isolated fixture. Its costs, obligations, and officer reactions carry into the remaining Prelude.

Verification:

- Add aftermath fixtures for at least the current accountability path and one mission-deviation path.
- Test that the same Hesperus Command Decision cannot award again in aftermath.
- Test that aftermath state depends on prior outcome flags.
- Test that Command Log entries remain player-facing and do not reveal hidden Director-only data.

## Stage 15: Combined-Load Test

Goal: implement the ship's combined-load test as the Prelude's technical-debt endgame.

Why now:

The current graph has `technical-debt-pressure` and `ship.combined-load-risk`, but the runtime does not yet make those pressures matter. This phase should prove ship simulation can create consequences that are not just social.

Work:

- Add intent signals for test sequencing, engineering caution, full-load execution, staged-load execution, deferral, contingency, and risk acceptance.
- Resolve `decision.combined-load-risk`.
- Use accumulated technical-debt, schedule margin, Hesperus aftermath, and prior fallback-command choices.
- Commit effects to `prelude.kieran`, `prelude.imani`, `prelude.priya`, `prelude.ship-state`, `technical-debt-pressure`, and `arrival-schedule-margin`.
- Support success with cost, partial test, deferral, and severe but fair technical complication.
- Advance to `final-command-review` when the integrated test has a committed status.

Exit condition:

The ship arrives at final review with a concrete technical posture: clean enough, delayed, limited, or carrying known technical debt.

Verification:

- Add combined-load fixtures for a cautious staged approach and a high-risk full-load approach.
- Test that prior technical-debt state changes the outcome band or costs.
- Test that Exploration mode policy hooks can later soften severe outcomes without hiding causality.
- Keep package and campaign projection validation passing.

## Stage 16: Final Command Review And Prelude Completion

Goal: finish `A Ship Underway` and transition into Chapter 1.

Why now:

Until the Prelude can complete, Directive cannot test campaign continuity across mission boundaries.

Work:

- Resolve `decision.final-readiness-report`.
- Summarize Prelude outcomes from committed flags, clocks, relationship memories, Command Bearing records, and technical state.
- Let Whitaker accept, challenge, or condition the player's final readiness recommendation.
- Set the arrival posture and one of the graph end states: `arrival-on-schedule`, `arrival-delayed`, or `arrival-with-limitation`.
- Activate `chapter-1-the-empty-convoy` from final review with the Chapter 1 opening phase and decision point ready.
- Create a Prelude completion Command Log summary suitable for later recall.

Exit condition:

The bundled campaign can complete the Prelude and carry a coherent campaign state into the first Chapter 1 frame.

Verification:

- Add final-review and Prelude-completion fixtures.
- Add a runtime smoke test from new campaign start through all Prelude phases using deterministic player inputs.
- Test that completed Prelude state references package data but owns campaign-specific consequences.
- Update [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md) to describe the completed Prelude behavior.

## Stage 17: Exploration Mode And Consequence Policy

Goal: implement the real difference between `Exploration` and `Command`.

Why now:

The simulation-mode labels are already established. Once the full Prelude path exists, the system can prove easier-mode consequence shaping across multiple kinds of scenes.

Work:

- Add simulation-mode policy helpers consumed by adjudication, Director packets, narrator constraints, and runtime UI.
- In `Exploration`, prevent senior staff and player-character death, soften worst complications, and prefer injury, delay, loss of position, damaged trust, or temporary incapacitation when causally justified.
- In `Command`, preserve full deterministic simulation severity while keeping outcomes fair and causally established.
- Ensure mode changes affect prompt structures and consequence permission, not memory, retrieval breadth, or hidden state truth.
- Add player-facing Settings text that explains the modes without exposing hidden mechanics.

Exit condition:

The same hazardous situation can resolve under both modes with consistent causality but different severity ceilings.

Verification:

- Add paired Exploration and Command fixtures for at least one hazardous ship/mission outcome.
- Test that Exploration blocks senior staff/player death but does not force success.
- Test that Command can produce severe results only from established risk.
- Test that retired Ensign/Lieutenant/Commander difficulty labels do not appear.

## Stage 18: Rerun Outcome, Edit, Delete, Branch, And Recovery

Goal: finish the transaction safety model around normal SillyTavern interaction patterns.

Why now:

The runtime already supports narration retry and default mechanics preservation. The next risk is player-controlled mechanics reruns, edits, deletes, and branches.

Work:

- Add explicit `Rerun Outcome` behavior distinct from `Rewrite Narration`.
- Create recovery snapshots before mechanics reruns, user-message edits, deletions, and branch-changing operations.
- Restore Command Bearing points and Marks correctly when an accepted outcome is replaced or removed.
- Preserve the current committed outcome until a replacement candidate is accepted.
- Add branch/save metadata so a save slot can describe its parent or divergence point.
- Add UI affordances for pending recovery, replacement candidate acceptance, and cancellation without exposing hidden raw values.

Exit condition:

The player can rewrite narration, rerun mechanics by choice, edit an initiating action, delete a dependent outcome, or branch a save without corrupting campaign state or duplicating rewards.

Verification:

- Extend `test-transaction-state.mjs` for spend rollback, award rollback, replacement candidate acceptance, and branch snapshots.
- Add runtime tests for `Rewrite Narration` versus `Rerun Outcome`.
- Test that provider failure before final commit refunds points and provider failure after commit retries from the same packet.
- Test that inactive branches cannot duplicate Command Marks or Recovery.

## Stage 19: Director Retrieval Orchestration MVP

Goal: generalize the current hand-selected context into a reusable Director-card retrieval pipeline.

Why now:

The later Prelude phases will generate enough relationship, ship, and mission state that hand-picking narrator cards in `director.mjs` becomes brittle. This stage turns the Saga-inspired Lore Automation concept into Directive's own retrieval system.

Work:

- Implement `src/retrieval` modules for dataset indexing, hard gates, recall lanes, packet assembly, run journals, and diagnostics.
- Produce separate Mission Director, Crew Director, Ship Director, Command Director, narrator, and Command Log packets from one retrieval run.
- Keep hidden mission truth and high-trust crew cards out of narrator packets until campaign state permits reveal.
- Add retrieval run journals tied to outcome ids or turn-ledger entries.
- Replace hardcoded narrator-card selection in the current Director with retrieval packet assembly.
- Keep provider-assisted semantic reranking optional and bounded; deterministic gates remain authoritative.

Exit condition:

The Director can select relevant crew, ship, mission, command, and campaign context from datasets without pasting whole bibles into prompts or leaking hidden state.

Verification:

- Extend crew retrieval fixtures to include ship, mission, command, and narrator packet separation.
- Test candidate gating by package, mission phase, present character, revealed fact, hidden visibility, and simulation mode.
- Test retrieval run journal counts and selected card ids.
- Test that the same source card can be available to one audience and blocked from another.

## Stage 20: Package Import, Update Diagnostics, And Alpha Gate

Goal: harden the first alpha-ready package path after the Prelude and core runtime are proven.

Why now:

Directive is package-first. Once the bundled package can play through the Prelude, the runtime needs the import/update diagnostics and release gate that keep future starships from breaking the core loop.

Work:

- Implement `.directive-starship.zip` import normalization into validated JSON package records.
- Reject unsafe paths, active content, missing package spine fields, schema-invalid data, and mismatched ids.
- Add Starships-tab package diagnostics for bundled and imported packages.
- Add simple alpha package-update behavior for in-progress campaigns: campaign state remains authoritative, newer package data may be read, and diagnostics report missing or incompatible ids.
- Add a local alpha gate script that runs the fast contract tests in the expected order.
- Add visual smoke coverage for desktop and phone-width runtime panels if the harness exists by then.
- Update docs for package authoring constraints needed by future Starship Creator and Mission Creator work.

Exit condition:

Directive can validate and load the bundled Breckinridge package through the same package path expected for imported starship packages, and the repo has a single local gate for pre-alpha readiness.

Verification:

- Add package import tests for valid package, unsafe archive contents, missing fields, id mismatch, and schema invalidity.
- Add update-diagnostic tests for in-progress campaign/package drift.
- Add `run-alpha-gate` or equivalent local script covering the current fast checks.
- Run the full fast-check sequence before marking Stage 20 complete.

Current status: `node tools\scripts\run-alpha-gate.mjs` passes all 34 checks.

## Deferred Until After Stage 20

These are important, but should not interrupt the next ten stages unless a stage explicitly needs a small enabling slice:

- Full Chapter 1 implementation beyond its first frame.
- Full side-mission generator and interval scheduler.
- Full Starship Creator UI.
- Full Mission Creator UI.
- Package marketplace or sharing UX beyond local import.
- Long-term migration framework for public user saves.
- Large canon-pack system.
- Provider-assisted semantic retrieval as a required dependency.

## Current Recommended Next Stage

Start the post-Stage 20 track with [Post-Stage 20 Implementation Plan](POST_STAGE_20_IMPLEMENTATION_PLAN.md).

The Prelude now proves the core loop. The next major risk is whether the completed Prelude consequences can shape a new main mission, while unresolved crew, ship, and campaign pressures start to feed side-mission availability without becoming isolated errands.
