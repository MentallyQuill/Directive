# Parallel Agent Coordination Protocol

## Purpose

This document defines how to run Directive development with Agent-0 coordinating multiple Codex tasks or chats in parallel.

It is written so a new agent can be handed this file and told:

```text
You are Agent-X.
```

The agent should then know its role, required source docs, ownership boundary, handoff rules, stop conditions, and integration expectations.

## Operating Model

Agent-0 is the orchestrator and integration lead in the primary Codex thread. Agent-0 may create up to five worker agents using Codex New Task/New Chat when parallelism is useful.

Default active roster:

| Agent | Role | Default lane |
|---|---|---|
| Agent-0 | Orchestrator and integrator | tasking, sequencing, shared docs, conflict control, final verification |
| Agent-1 | Chapter 2 Campaign Flow | False Colors playable arc, Open Orders continuity, side content quality, release-facing gameplay docs |
| Agent-2 | Visual Asset and Mobile UI System | Saga-derived mobile UX, Theme Packs, Icon Packs, portraits, ship art, shared shell UI |
| Agent-3 | Narrative Thread Engine | hidden thread ledger, B-story continuity, Open Threads, thread-to-Open Orders handoff |
| Agent-4 | Backend And Mission Director Architecture | host-neutral backend seams, Director contract, runtime bridge, storage, sidecar boundaries |
| Agent-5 | QA, Release, and Host Confidence | optional verification lane for alpha gate, docs audit, live host smoke, integration checks |

If only four LLM agents are available during the backend/Chapter 2 series, run Agent-0 plus Agents 1, 4, and 5 first; create Agent-2 or Agent-3 only for targeted UI/thread work. If five workers are available, Agent-5 should be QA/integration support, not a fifth feature lane competing for shared files.

## Current Shared Goal

All agents are working toward the next Directive pre-alpha series: backend robustness, dual-host confidence, and Chapter 2 expansion on top of the now-playable MVP foundation.

Current baseline:

- package-driven start through Character Creator exists,
- Prelude and Chapter 1 are playable through the Asterion / False Colors handoff,
- Chapter 2 has playable slices through transparency terms, Orison evidence, Aegis medical trust, security access, the joint investigation charter, and the Quiet Channels Open Orders continuation,
- Open Orders I review, assignment scenes, scene beats, and first-interval resolution exist,
- the LCARS shared shell uses direct bottom route navigation,
- SillyTavern and Lumiverse host scaffolds exist,
- save/load/branch/recovery and alpha-gate coverage are active.

Current series priorities:

- harden backend host-neutral services before adding more provider-dependent behavior,
- deepen Chapter 2 into a stronger playable arc without exposing hidden source truth,
- extend actor/front and pressure behavior beyond preview slices,
- keep sidecars optional, validated, and fail-soft across SillyTavern and Lumiverse,
- keep Narrative Thread and Open Orders promotion deterministic before provider assistance,
- keep live host smoke evidence current when backend or shell behavior changes,
- keep alpha gate and appropriate targeted smokes green after every integration window.

Primary current plans:

- [MVP Playable Alpha Plan](MVP_PLAYABLE_ALPHA_PLAN.md)
- [Visual Asset And Mobile UI Integration Plan](VISUAL_ASSET_AND_MOBILE_UI_INTEGRATION_PLAN.md)
- [Narrative Thread Engine](../design/NARRATIVE_THREAD_ENGINE.md)
- [Mission Director Model](../design/MISSION_DIRECTOR_MODEL.md)
- [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md)
- [Mission Director Contracts](../architecture/MISSION_DIRECTOR_CONTRACTS.md)
- [Source Architecture](../architecture/SOURCE_ARCHITECTURE.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)
- [Dual Host Support Plan](DUAL_HOST_SUPPORT_PLAN.md)
- [Post Stage 20 Implementation Plan](POST_STAGE_20_IMPLEMENTATION_PLAN.md)
- `src/hosts/lumiverse/README.md`

## Global Rules For Every Agent

1. Read this protocol first, then read the role-specific source docs.
2. Inspect `git status --short` before editing.
3. Treat uncommitted work by other agents as user-owned work. Do not revert it.
4. Keep edits inside your lane unless Agent-0 explicitly expands your scope.
5. Do not edit [Documentation Index](../DOCUMENTATION_INDEX.md), release notes, manifests, package schema roots, or shared alpha-gate scripts unless Agent-0 assigns that file to you.
6. Do not create broad refactors while another agent is touching adjacent runtime paths.
7. Prefer small vertical slices with tests over wide half-finished scaffolds.
8. Keep hidden truth, raw relationship values, raw development values, and Director-only data out of UI, narrator packets, Command Briefs, Domain Reports, Command Log rows, prompt blocks, and generated side-mission proposals.
9. Preserve Directive's shared-shell UI rule: direct bottom route navigation across desktop/shelf/phone layouts, shell-owned Close, no tab-history Back for primary routes, no panel-owned primary navigation, and no bottom-right floating shell controls. A Back affordance is allowed only for a true local drill-in view such as a modal, detail pane, or Character Creator step flow.
10. Run targeted tests for your lane before handoff. Agent-0 or Agent-5 owns the full alpha gate after integration.
11. If you need to cross another agent's boundary, stop and hand Agent-0 an integration request instead of editing through it.

## Agent-0: Orchestrator And Integrator

### Mission

Agent-0 owns parallel tasking, integration order, conflict prevention, and final verification.

Agent-0 should keep the product moving while preventing worker agents from editing the same ownership surfaces at the same time.

### Required Reading

- This protocol.
- [MVP Playable Alpha Plan](MVP_PLAYABLE_ALPHA_PLAN.md)
- [Visual Asset And Mobile UI Integration Plan](VISUAL_ASSET_AND_MOBILE_UI_INTEGRATION_PLAN.md)
- [Narrative Thread Engine](../design/NARRATIVE_THREAD_ENGINE.md)
- [Mission Director Model](../design/MISSION_DIRECTOR_MODEL.md)
- [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md)
- [Source Architecture](../architecture/SOURCE_ARCHITECTURE.md)
- [Dual Host Support Plan](DUAL_HOST_SUPPORT_PLAN.md)
- [Post Stage 20 Implementation Plan](POST_STAGE_20_IMPLEMENTATION_PLAN.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)

### Responsibilities

- Create New Task/New Chat workers with clear one-lane prompts.
- Assign each worker a small feature slice and explicit file boundaries.
- Maintain the current work map in the main thread or in an Agent-0-only status note.
- Decide when to pause all agents for an integration freeze.
- Integrate worker handoffs one lane at a time.
- Resolve shared schema, runtime, docs-index, and alpha-gate conflicts.
- Run `node tools\scripts\verify-repo-structure.mjs`.
- Run `node tools\scripts\run-alpha-gate.mjs` after integration.
- Decide whether live SillyTavern or Lumiverse smoke is appropriate.
- Keep the backend/Chapter 2 work map current: which files are frozen, which agent owns the next vertical slice, and which tests prove the current backend contract.

### Agent-0 Reserved Files

Agent-0 should normally own these shared files:

- `docs/DOCUMENTATION_INDEX.md`
- `README.md`
- `docs/release/*`
- `manifest.json`
- `spindle.json`
- `tools/scripts/run-alpha-gate.mjs`
- `tools/scripts/verify-repo-structure.mjs`
- shared package schema root files unless delegated
- final integration edits in `src/runtime/runtime-app.mjs`
- final integration edits in `src/ui/directive-compact-shell.js`
- final integration edits in `src/mission/director.mjs`
- final integration edits in shared host contracts under `src/hosts/`
- final integration edits in shared sidecar/generation orchestration under `src/jobs/` and `src/generation/`
- final integration edits in shared logical storage paths and repositories under `src/storage/`

Worker agents may propose changes to these files in handoff notes. They should not edit them unless Agent-0 explicitly assigns the edit.

### Freeze Authority

Agent-0 should pause worker agents before integrating whenever:

- two agents need the same file,
- a change alters campaign save shape,
- a change alters package schema,
- a change alters Mission Director turn contract,
- a change alters runtime shell navigation,
- a change alters host backend contracts, runtime bridge messages, storage paths, or sidecar orchestration,
- a change touches both UI and Director state,
- a change touches both Thread Engine and pressure/Open Orders state,
- a change touches both Chapter 2 mission content and backend/runtime persistence,
- alpha gate fails for a reason outside one agent's lane,
- live host behavior needs a coordinated smoke pass,
- a new dependency or build step is needed.

Freeze instruction template:

```text
Integration freeze. Stop after your current command. Do not edit files until I release the freeze. Send a handoff with files changed, tests run, known risks, and any integration request.
```

Release instruction template:

```text
Freeze released. You may resume only the scoped task below. Do not touch the files listed as reserved for this integration window.
```

## Agent-1: Chapter 2 Campaign Flow

### Mission

Agent-1 makes Chapter 2: False Colors play as a coherent campaign arc instead of a set of preview slices, while preserving the completed Prelude and Chapter 1 MVP path.

Agent-1 should focus on player-facing campaign flow: what the player can do, what the command question is, what state becomes visible, and how Open Orders or side content follows from Chapter 2 pressure.

### Required Reading

- This protocol.
- [Ashes Of Peace Campaign](../campaigns/ASHES_OF_PEACE_CAMPAIGN.md)
- [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)
- [First Campaign Workflow](../user/FIRST_CAMPAIGN_WORKFLOW.md)
- [Post Stage 20 Implementation Plan](POST_STAGE_20_IMPLEMENTATION_PLAN.md)
- relevant mission graphs under `packages/bundled/breckenridge/`

### Owns

- Chapter 2 journey audit and player-facing flow.
- Chapter 2 mission graph/content polish under Agent-0-assigned files.
- Open Orders continuity after the joint investigation charter.
- Command Log/Mission summaries tied to Chapter 2 outcomes.
- side-content quality that follows from Chapter 2 pressure.
- release-facing gameplay docs when assigned by Agent-0.
- tests proving Chapter 2 and side-content paths work as player journeys.

### Avoids Unless Assigned

- Theme Pack/Icon Pack implementation.
- portrait/ship asset resolver internals.
- hidden thread ledger internals.
- Mission Director contract rewrites.
- Lumiverse host adapter changes.
- shared backend/storage/sidecar changes.

### Stop And Ask Agent-0 When

- side-content work needs new package schema fields,
- Chapter 2 changes require Mission Director contract changes,
- side content wants to call provider sidecars,
- Mission UI needs new visual-system components owned by Agent-2,
- Thread Engine should become the source of a side assignment.
- backend/runtime persistence is needed for a Chapter 2 behavior.

### Expected Handoff

Agent-1 should hand off:

- exact campaign path tested,
- mission graph or package files changed,
- runtime tests added or updated,
- player-facing behavior now improved,
- remaining side-content gaps,
- Chapter 2 state/pressure/Open Orders assumptions,
- whether hidden-truth safety was checked.

## Agent-2: Visual Asset And Mobile UI System

### Mission

Agent-2 makes Directive feel like a Saga-derived product adapted into the shared command-spine SillyTavern and Lumiverse shell, with the existing phone-width bottom-navigation fallback.

### Required Reading

- This protocol.
- [Visual Asset And Mobile UI Integration Plan](VISUAL_ASSET_AND_MOBILE_UI_INTEGRATION_PLAN.md)
- [Saga Reference Review](../architecture/SAGA_REFERENCE_REVIEW.md)
- [Source Architecture](../architecture/SOURCE_ARCHITECTURE.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)
- `src/ui/README.md`
- `src/ui/directive-compact-shell.js`
- `styles/directive.css`

### Owns

- Theme Pack data shape and token application.
- Icon Pack data shape and icon slot resolver.
- shared shell UI polish.
- portrait and ship-art asset resolver once package metadata exists.
- Crew, Campaign, Ship, Mission visual surfaces.
- visual smoke targets, phone bottom-navigation scans, and no-floating-control scans.
- Settings Theme Pack/Icon Pack surfaces.

### Avoids Unless Assigned

- Mission Director adjudication.
- campaign mechanics.
- thread ledger state.
- save format changes outside visual asset metadata.
- host backend behavior beyond shell mounting constraints.

### Stop And Ask Agent-0 When

- visual assets require package schema tightening,
- Theme/Icon settings need new storage domains,
- UI components need runtime state not yet exposed,
- Lumiverse shelf behavior diverges from SillyTavern shell,
- any design requires bottom controls.

### Expected Handoff

Agent-2 should hand off:

- screenshots or visual smoke notes when available,
- exact token/icon slots added,
- UI files changed,
- fallback behavior for missing assets/icons,
- accessibility/text-fit concerns,
- tests run.

## Agent-3: Narrative Thread Engine

### Mission

Agent-3 builds the hidden Narrative Thread foundation: thread ledger, deterministic scene-boundary detection, B-story curation, and thread-to-Open Orders handoff without turning every detail into a quest.

### Required Reading

- This protocol.
- [Narrative Thread Engine](../design/NARRATIVE_THREAD_ENGINE.md)
- [Crew And Relationship Model](../design/CREW_AND_RELATIONSHIP_MODEL.md)
- [Crew Development And Experience Model](../design/CREW_DEVELOPMENT_AND_EXPERIENCE_MODEL.md)
- [Command Bearing System](../design/COMMAND_BEARING_SYSTEM.md)
- [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)

### Owns

- `threadLedger` state model and tests.
- deterministic thread prefilter/scout/curator modules.
- thread package seed model.
- thread lifecycle and activation rules.
- thread closure hooks into crew development and Command Bearing proposals.
- player-safe `Open Threads` policy proposals.

### Avoids Unless Assigned

- Mission Director core refactor.
- pressure ledger rewrite.
- Open Orders runtime controls.
- visible UI implementation beyond narrow player-safe summaries.
- provider-assisted thread scouting before deterministic ledger works.

### Stop And Ask Agent-0 When

- thread records need campaign save schema changes,
- thread activation needs Mission Director focus-budget changes,
- thread promotion touches Open Orders assignment state,
- closure affects Command Bearing awards,
- UI needs Agent-2 components.

### Expected Handoff

Agent-3 should hand off:

- thread lifecycle slice implemented,
- state shape and persistence behavior,
- hidden/player-safe boundary checks,
- tests added,
- integration points requested from Agent-1, Agent-2, or Agent-4.

## Agent-4: Backend And Mission Director Architecture

### Mission

Agent-4 evolves backend and Director architecture without creating a new monolith.

The Director should manage situations, not plots. It should preserve the turn contract, state-delta safety, hidden-truth boundaries, Command Competence handoff, pacing/focus budget, and narrator separation while becoming more modular.

The backend should keep Directive host-neutral: SillyTavern and Lumiverse should share the same runtime contracts, storage semantics, sidecar orchestration, generation-role policy, and player-safe prompt/tool surfaces.

### Required Reading

- This protocol.
- [Mission Director Model](../design/MISSION_DIRECTOR_MODEL.md)
- [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md)
- [Mission Director Contracts](../architecture/MISSION_DIRECTOR_CONTRACTS.md)
- [Director Retrieval And Context Orchestration](../architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md)
- [Source Architecture](../architecture/SOURCE_ARCHITECTURE.md)
- [Turn Transactions](../architecture/TURN_TRANSACTIONS.md)
- [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)
- [Dual Host Support Plan](DUAL_HOST_SUPPORT_PLAN.md)
- `src/hosts/lumiverse/README.md`
- [Testing Strategy](../testing/TESTING_STRATEGY.md)

### Owns

- backend seam map for host-neutral work.
- host contract, runtime bridge, storage, generation, and sidecar integration proposals when assigned by Agent-0.
- Director seam map and modularization plan.
- narrow extractions from `src/mission/director.mjs` when proven by tests.
- pacing/focus-budget helpers.
- state-delta validation improvements.
- sidecar advisory boundaries.
- Chapter 2 actor/front/pressure state-delta contract improvements when assigned.
- contract fixtures and validator updates.

### Avoids Unless Assigned

- UI rendering.
- Thread Engine ledger implementation.
- Theme/Icon/asset work.
- package content writing.
- direct provider calls inside Director core.
- release-facing docs.
- live-host credential handling.

### Stop And Ask Agent-0 When

- a change alters the turn packet spine,
- state delta domains change,
- fixtures across many stages need regeneration,
- Thread Engine or side-mission generator wants Director focus integration,
- Agent-1 needs Chapter 2 behavior changed while Agent-4 is refactoring shared Director paths,
- a backend change affects both SillyTavern and Lumiverse host behavior,
- a sidecar/provider change needs live generation or host credentials.

### Expected Handoff

Agent-4 should hand off:

- seam extracted or contract clarified,
- before/after module ownership,
- backend contract or host adapter behavior changed,
- fixtures/tests updated,
- risks to existing stages,
- exact integration requests for Agent-1 or Agent-3.

## Agent-5: QA, Release, And Host Confidence

### Mission

Agent-5 is optional and should be created when the repo needs verification, docs alignment, or live-host confidence more than another feature lane.

### Required Reading

- This protocol.
- [Testing Strategy](../testing/TESTING_STRATEGY.md)
- [Dual Host Support Plan](DUAL_HOST_SUPPORT_PLAN.md)
- [Lumiverse Installation And Smoke Testing](../user/LUMIVERSE_INSTALLATION.md)
- [Directive Operator Manual](../user/DIRECTIVE_OPERATOR_MANUAL.md)
- [First Campaign Workflow](../user/FIRST_CAMPAIGN_WORKFLOW.md)

### Owns

- targeted regression reproduction.
- alpha gate and docs-link checks when assigned.
- visual smoke checklist support.
- SillyTavern live smoke planning.
- Lumiverse no-generation smoke support.
- backend smoke and dual-host sidecar verification support.
- docs drift audit after feature integration.

### Avoids Unless Assigned

- feature implementation.
- broad refactors.
- editing shared docs index unless Agent-0 delegates.

### Stop And Ask Agent-0 When

- a verification failure requires cross-lane fixes,
- live host smoke needs credentials or external state,
- docs are wrong because implementation changed in another active lane.

## Work Allocation Matrix

| Area | Primary agent | Secondary agents | Agent-0 integration required when |
|---|---|---|---|
| Chapter 2 playable arc | Agent-1 | Agent-4, Agent-5 | Director behavior, state-delta domains, UI layout, or release docs change. |
| Open Orders and side-content continuity | Agent-1 | Agent-3, Agent-4 | Thread promotion, pressure contracts, or backend sidecar behavior changes. |
| Backend host contracts and runtime bridge | Agent-4 | Agent-5 | SillyTavern/Lumiverse behavior, storage paths, request/response shapes, or prompt/tool surfaces change. |
| Storage, save, recovery, and transaction safety | Agent-4 | Agent-1, Agent-5 | save shape, logical paths, branch behavior, or Chapter 2 persistence changes. |
| Theme Packs | Agent-2 | Agent-5 | Settings storage, schema, or host theme mapping changes. |
| Icon Packs | Agent-2 | Agent-5 | passive asset storage or host icon fallbacks change. |
| Crew portraits and ship art | Agent-2 | Agent-1 | package schema or package data changes. |
| Narrative Thread ledger | Agent-3 | Agent-4 | campaign save shape or transaction state changes. |
| Thread activation | Agent-3 | Agent-4, Agent-1 | Mission Director focus, Open Orders promotion, or Chapter 2 side-content changes. |
| Mission Director modularization | Agent-4 | Agent-1, Agent-3 | turn packet spine, stage fixtures, Chapter 2 state, or state delta domains change. |
| Sidecar/provider generation | Agent-4 | Agent-3, Agent-5 | host adapter capability or live-provider behavior changes. |
| Shared shell and route UX | Agent-2 | Agent-5 | runtime shell navigation, host shelf mounting, or live visual smoke behavior changes. |
| Docs index/release notes | Agent-0 | Agent-5 | always. |
| Alpha gate | Agent-0 | Agent-5 | always after integration. |

## Recommended Parallel Waves

### Wave 0: Backend And Chapter 2 Baseline

Agent-0:

- verify current alpha gate,
- record active file ownership,
- capture current Chapter 2 and backend test baseline,
- create worker prompts with explicit file boundaries.

Agent-1:

- Chapter 2 playable-arc audit from current stage 41-46 tests and mission graph.

Agent-2:

- no broad UI work unless Agent-0 assigns visual proof or a live smoke comparison; keep the shell stable.

Agent-3:

- identify Narrative Thread or B-story hooks that should inform Chapter 2 without changing visible UI.

Agent-4:

- backend seam map for host contracts, runtime bridge, storage, generation roles, and sidecar orchestration.

Agent-5:

- verify deterministic tests that cover Chapter 2, dual-host scaffolding, sidecars, and live-smoke prerequisites.

Stop all agents before any shared schema, runtime shell, host contract, storage path, or Chapter 2 state-delta integration.

### Wave 1: Backend Hardening Verticals

Run these as small vertical slices, not one broad backend rewrite.

Candidate lanes:

- Agent-4: one host-neutral backend contract slice with SillyTavern/Lumiverse fake tests.
- Agent-4: one storage/recovery/transaction hardening slice with clone and rollback tests.
- Agent-4: one sidecar orchestration or generation-role slice with no-generation default proof.
- Agent-5: live smoke planning and no-generation Lumiverse/SillyTavern confidence checks.
- Agent-0: integrate each backend slice before another agent builds on it.

Do not run provider-assisted or live-generation work until deterministic fake-host tests and no-generation live paths are green.

### Wave 2: Chapter 2 Playable Arc Expansion

Agent-1:

- turn the current Chapter 2 preview slices into a stronger player journey with clear command questions, visible consequences, and Open Orders continuity.

Agent-4:

- support Chapter 2 state-delta, actor/front, pressure, and phase-advancement contracts without exposing hidden source truth.

Agent-3:

- propose deterministic thread hooks only when they have player-safe summaries and do not overwrite Agent-1's campaign flow.

Agent-5:

- run Chapter 2 stage tests, MVP fresh journey tests, side-mission tests, hidden-source tests, and docs drift checks after integration.

### Wave 3: Cross-System Integration Windows

This wave should not run fully parallel without freeze windows.

Agent-0 should integrate in this order:

1. Backend contract or storage changes.
2. Mission Director/state-delta changes.
3. Chapter 2 mission graph/content changes.
4. Thread/Open Orders promotion changes.
5. UI or live-smoke harness updates.
6. Docs and release-facing wording.

Run alpha gate after each substantial merge, not only at the end.

### Wave 4: Provider-Assisted Backend And Sidecars

Start only after deterministic contracts work.

Candidate lanes:

- Agent-3: provider-assisted thread scout contracts.
- Agent-4: sidecar advisory boundary for Director.
- Agent-1: Chapter 2 or side-mission candidate validation and player-facing review.
- Agent-5: Lumiverse batch-sidecar fake and live no-generation confidence.

Provider output may propose. Deterministic validators decide.

## Agent-0 Launch Order For This Series

Use this order when starting the next parallel run.

### 1. Agent-4 Backend Baseline Task

Start Agent-4 first for a read-first backend seam audit.

Suggested task:

```text
Audit Directive's host-neutral backend seams for the next hardening slice.

Focus on:
- src/hosts/
- src/runtime/runtime-app.mjs
- src/storage/
- src/jobs/
- src/generation/
- tools/scripts/test-dual-host-scaffold.mjs
- tools/scripts/test-lumiverse-entrypoints.mjs
- tools/scripts/smoke-sillytavern-live.mjs

Do not edit yet unless the fix is narrow and directly testable.
Return a prioritized backend slice list with file ownership, test commands, and cross-host risks.
```

Acceptance:

- no unscoped refactor proposal,
- first backend slice is small enough for one integration window,
- every proposed backend slice names SillyTavern and Lumiverse proof.

### 2. Agent-1 Chapter 2 Arc Task

Start Agent-1 after Agent-4 begins or after the backend baseline is stable.

Suggested task:

```text
Audit Chapter 2: False Colors from the current implemented tests and mission graph.

Focus on:
- packages/bundled/breckenridge/chapter-2-false-colors.mission-graph.json
- packages/bundled/breckenridge/ashes-of-peace.starship-package.json
- src/mission/state-delta.mjs
- src/mission/phase-advancement.mjs
- src/adjudication/action-classifier.mjs
- tools/scripts/test-runtime-stage41-chapter2-transparency-terms.mjs through stage46
- docs/campaigns/ASHES_OF_PEACE_CAMPAIGN.md

Do not broaden Chapter 1. Propose the next Chapter 2 vertical slice as a player journey, with tests.
```

Acceptance:

- identifies where Chapter 2 is still preview-like,
- proposes one next playable vertical,
- preserves hidden-source safety and current Stage 41-46 tests.

### 3. Agent-5 Verification Baseline Task

Start Agent-5 if a fourth worker is available or immediately before the first integration freeze.

Suggested task:

```text
Build a verification map for backend and Chapter 2 integration.

Focus on:
- alpha-gate coverage,
- Chapter 2 stage tests,
- dual-host scaffold tests,
- live SillyTavern no-generation smoke,
- Lumiverse no-generation smoke requirements,
- docs drift surfaces.

Do not implement features. Return the smallest command set that proves each upcoming slice.
```

Acceptance:

- separates deterministic tests from live-host smokes,
- names opt-in generation/save-flow tests explicitly,
- does not require live credentials for default proof.

### 4. Agent-3 Thread Hook Task

Start Agent-3 only after the first Chapter 2 vertical is scoped.

Suggested task:

```text
Identify deterministic Narrative Thread hooks that can support Chapter 2 without becoming visible raw state.

Focus on:
- thread ledger summaries,
- B-story continuity hooks,
- Open Orders promotion boundaries,
- hidden/player-safe separation.

Do not implement provider-assisted scouting yet.
```

Acceptance:

- proposes hooks as player-safe summaries,
- does not change Chapter 2 flow ownership,
- requests Agent-0 integration when Open Orders or Director focus changes.

### 5. Agent-2 UI Support Task

Start Agent-2 only when a backend or Chapter 2 slice needs visible support.

Suggested task:

```text
Verify the visible shell and affected panels for the integrated backend/Chapter 2 slice.

Do not redesign the shell unless Agent-0 assigns it.
Keep direct bottom route navigation and no tab-history Back.
```

Acceptance:

- screenshots or smoke notes when UI changes,
- text-fit and mobile bottom-route behavior checked,
- no new primary navigation model.

## New Task Prompt Template

Use this when creating a worker:

```text
You are Agent-X for Directive.

Read `docs/planning/PARALLEL_AGENT_COORDINATION_PROTOCOL.md` first, then follow the Agent-X section exactly.

Task:
<one narrow task>

Scope:
- You may edit: <files or folders>
- Do not edit: docs/DOCUMENTATION_INDEX.md, README.md, manifests, alpha-gate scripts, or other shared files unless explicitly listed above.

Required docs:
- <role-specific docs>

Acceptance:
- <clear behavior or doc outcome>
- <targeted tests>

Stop and hand off if your work needs another agent's lane, a schema/save format change, a Director contract change, or a shared integration file.

Final handoff must include files changed, tests run, known risks, and requested integration steps.
```

## Worker Handoff Template

Every worker should end with:

```text
Agent: Agent-X
Task:
Status: complete | partial | blocked

Docs read:
- ...

Files changed:
- ...

Tests run:
- ...

Behavior changed:
- ...

Hidden-state/player-safe checks:
- ...

Risks:
- ...

Integration requests for Agent-0:
- ...

Suggested next task:
- ...
```

## Integration Freeze Checklist

Agent-0 should use this checklist during a freeze:

1. Tell workers to stop.
2. Collect every handoff.
3. Run `git status --short`.
4. Inspect changed files by lane.
5. Integrate one lane at a time.
6. Resolve conflicts without reverting unrelated work.
7. Run targeted tests for the integrated lane.
8. Run `node tools\scripts\verify-repo-structure.mjs`.
9. Run `node tools\scripts\run-alpha-gate.mjs` after meaningful integration.
10. Update docs index, testing docs, release notes, or operator docs only after behavior exists.
11. Release workers with narrowed next tasks.

## Conflict Rules

If two workers touch the same file:

- Agent-0 freezes both.
- Agent-0 reads both diffs.
- Agent-0 keeps the behavior that matches current plans and tests.
- Agent-0 asks the worker with the weaker or overlapping slice to retarget.
- No worker should solve the conflict independently unless Agent-0 assigns it.

If a worker discovers the plan is wrong:

- stop editing,
- document the evidence,
- propose the smallest correction,
- let Agent-0 decide whether to update docs first or code first.

If alpha gate fails:

- the agent whose lane caused the failure owns the first fix attempt;
- if the failure crosses lanes, Agent-0 freezes relevant agents;
- do not paper over failures by weakening tests unless the test contract is demonstrably stale and Agent-0 approves.

## Stop Conditions

Any worker should stop and hand off immediately when:

- they need to touch another agent's primary lane,
- they need new dependencies,
- they need network or live-host credentials,
- they need to rewrite package schema or campaign save shape,
- they need to change the Mission Director turn packet spine,
- they need to expose hidden data in UI to solve a display problem,
- they need bottom-right floating controls, panel-owned primary navigation, or tab-history Back outside a true local drill-in flow,
- their targeted tests fail for reasons outside their lane,
- they cannot explain how their change is verified.

Agent-0 should stop all workers when:

- multiple lanes need the same shared file,
- accumulated changes make `git status` hard to reason about,
- a feature is ready for integration,
- a live smoke pass is about to run,
- a release-facing doc update needs to be made from current code facts.

## Definition Of Done For Parallel Work

A parallel slice is done only when:

- the worker's narrow acceptance criteria are met,
- targeted tests pass,
- player-safe/hidden-state boundaries are checked when relevant,
- Agent-0 integrates the slice,
- repo structure verification passes,
- alpha gate passes after integration unless Agent-0 explicitly defers for a documented blocker,
- docs are updated only to match implemented behavior or clearly marked planned work.

## Practical Defaults

- Prefer one worker per major lane.
- Prefer fewer active agents during integration-heavy work.
- Prefer deterministic systems before provider-assisted systems.
- Prefer package-owned metadata over UI filename guesses.
- Prefer hidden ledgers with player-safe summaries over visible raw state.
- Prefer shared-shell consistency: desktop/shelf/phone direct bottom navigation should come from the same shell, not host-specific forks; primary route changes should not build a click-history Back stack.
- Prefer small extract-and-test Director refactors over a large rewrite.
- Prefer Agent-5 verification over a fifth simultaneous feature branch when the worktree is already busy.
