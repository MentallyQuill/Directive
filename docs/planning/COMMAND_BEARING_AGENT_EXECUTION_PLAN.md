# Command Bearing Agent Execution Plan

## Status

This is the phased multi-agent execution plan for building the Command Bearing user-facing system, Command Bearing backend, and Player Character/Crew tab split as one coordinated pre-alpha build.

It depends on:

- [Parallel Agent Coordination Protocol](PARALLEL_AGENT_COORDINATION_PROTOCOL.md)
- [Command Bearing User-Facing System Plan](COMMAND_BEARING_USER_FACING_SYSTEM_PLAN.md)
- [Command Bearing Backend Development Plan](COMMAND_BEARING_BACKEND_DEVELOPMENT_PLAN.md)
- [Player Character Page And Crew Tabs Plan](PLAYER_CHARACTER_PAGE_AND_CREW_TABS_PLAN.md)
- [Command Bearing System](../design/COMMAND_BEARING_SYSTEM.md)
- [Model Call Robustness Pass Plan](MODEL_CALL_ROBUSTNESS_PASS_PLAN.md)

Directive is pre-alpha. This execution plan assumes the build can rename, replace, and restructure current `commandStyle` behavior in place. Do not preserve old pause-first Command Bearing intervention behavior or old public state names when they conflict with the new `commandBearing` contract.

## Goal

Build the entire Command Bearing and Character surface in a coordinated series:

- authoritative `commandBearing` state with migration from `commandStyle`;
- deterministic validation for every model-produced Command Bearing proposal;
- evidence ledger, review ledger, closure-triggered Mark Review, and relationship perception records;
- Readied Inspiration/Resolve point spends that improve committed outcomes by mechanics, not prompt bias;
- Assist controls for point counts, fit checks, and Readied point state;
- Crew drawer `Character` and `Crew` local tabs;
- Character page projection showing identity, portrait, banked points, Command Bearing evidence/reviews/history, and player-safe crew interaction history;
- tests, docs, and live-host confidence for the integrated feature.

This is too cross-cutting for one agent to build safely without coordination. Agent-0 should run this as a phased integration with parallel workers, short handoffs, and explicit freeze windows.

## Single Codex Chat Operating Model

This plan is designed to run from one primary Codex chat.

The primary chat is Agent-0. Agent-0 creates and manages its own worker agents from that chat using the available Codex multi-agent, New Task, or New Chat capability. The user should not have to coordinate separate conversations, reconcile worker outputs, or manually decide which worker owns a file. Agent-0 is the command center.

Agent-0 must keep all durable coordination state in the primary chat:

- current phase;
- active worker registry;
- file ownership map;
- frozen files;
- worker prompts sent;
- worker handoffs received;
- integration order;
- tests run;
- unresolved blockers.

Worker agents may work in separate task contexts, but they are not independent project leads. They receive a narrow prompt from Agent-0, edit only assigned files, run targeted checks, and return a handoff to Agent-0. Agent-0 decides whether to integrate, reject, retarget, or launch the next worker.

If Codex multi-agent tooling is unavailable, Agent-0 should still use this plan as a sequential runbook. In that mode, each worker lane becomes a scoped checklist executed one at a time in the primary chat.

### Primary Chat Kickoff Prompt

When starting implementation, the user should be able to give one instruction in the primary Codex chat:

```text
Use docs/planning/COMMAND_BEARING_AGENT_EXECUTION_PLAN.md as the operating plan.
Act as Agent-0.
Create and manage the needed worker agents yourself.
Keep the worker registry, file ownership map, freeze windows, integration order, and verification results in this chat.
Do not ask me to coordinate subagents manually.
Begin with Phase 0.
```

Agent-0 should then:

- read this plan and the three source planning docs;
- inspect current git state;
- create the initial worker registry;
- launch only Phase 1 workers after Phase 0 exits;
- collect handoffs into the primary chat;
- integrate one lane at a time;
- advance phases only after exit gates pass.

## Non-Negotiable Contracts

All agents must preserve these contracts:

- `commandBearing` becomes the authoritative runtime state name.
- Model calls propose; deterministic code validates and commits.
- Evidence is not XP and does not award Marks directly.
- Mark Review happens only after deterministic closure proof.
- Utility closure signals can schedule attention, but cannot prove closure or award Marks.
- Readied points apply only to the next player message in the bound campaign chat.
- A valid Readied spend improves the base outcome by exactly the configured two-tier bump, bounded by the six-band outcome ladder.
- The base outcome must be resolved without Command Bearing bias before the spend is applied.
- Consequential Readied-point turns abort normal SillyTavern generation and post a Directive-owned response from the committed packet.
- Assist owns point counts, fit checks, Ready/Readied/Cancel controls, and short spend/return status.
- Character owns the durable player record, Command Bearing history, evidence, reviews, and player-safe relationship perception records.
- Crew preserves the Senior Staff Roster and Duty Roster inspector.
- UI projections must not expose hidden relationship values, private NPC thoughts, model scores, raw provider output, hidden facts, or raw evaluator diagnostics.
- Swipes and narration retries do not reroll mechanics or refund spent points.
- Post-commit edits/deletes use normal branch/replay/reconciliation, not Command Bearing-specific refunds.

## Agent Roster For This Build

Use the repo's [Parallel Agent Coordination Protocol](PARALLEL_AGENT_COORDINATION_PROTOCOL.md). Agent names below are build-specific lanes. Agent-0 may map them onto Agent-1 through Agent-5 worker tasks, but the primary Codex chat remains the single source of truth.

| Build lane | Primary responsibility | Default owner | Primary files and folders |
|---|---|---|---|
| Orchestration and integration | Tasking, ownership map, freezes, shared docs, final integration, alpha gate | Agent-0 | `docs/DOCUMENTATION_INDEX.md`, shared docs, final edits in shared runtime/host/storage files |
| State, validation, and transactions | `commandBearing` migration, validators, ledgers, idempotency, transaction application | Backend worker A | `src/command/`, `src/campaign/transaction-state.mjs`, `src/runtime/state-delta-gateway.mjs`, `src/adjudication/state-delta-validator.mjs` |
| Model contracts, sidecars, closure, evidence, review | Utility closure signal, evidence collector, relationship perception records, Mark Review, closure planner | Backend worker B | `src/jobs/`, `src/generation/model-call-authority-matrix.mjs`, `src/adjudication/utility-turn-classifier.mjs`, `src/directors/`, `src/threads/`, `src/quests/`, `src/story/` |
| Readied runtime, host, and narration | Readied ingress attachment, host-generation abort, base outcome, eligibility, spend commit, narration packet, SillyTavern posting | Runtime worker | `src/runtime/chat-turn-orchestrator.mjs`, `src/runtime/runtime-app.mjs`, `src/runtime/response-dispatcher.mjs`, `src/generation/narration*.mjs`, `src/hosts/sillytavern/`, `src/assist/directive-assist.mjs` |
| Assist and Character UI | Assist Command Bearing module, fit-check display, Crew drawer tabs, Character tab, player-safe projections | UI worker | `src/ui/crew-panel.js`, `src/ui/runtime-ui-kit.js`, `src/ui/README.md`, `styles/`, Assist host UI files, projection helpers assigned by Agent-0 |
| Verification and docs support | Test inventory, targeted tests, hidden-leak checks, live smoke preparation, docs drift notes | QA worker | `test/`, `tests/`, `tools/scripts/`, docs updates assigned by Agent-0 |

If fewer worker agents are available, prioritize:

1. State, validation, and transactions.
2. Readied runtime, host, and narration.
3. Model contracts, sidecars, closure, evidence, review.
4. UI.
5. QA.

If only three total agents are available, Agent-0 should keep QA and docs in the primary chat, run one backend worker and one UI/runtime worker, and use shorter integration freezes.

## Agent-0 Operating Rules

Agent-0 owns:

- the active file ownership map;
- phase boundaries;
- integration freezes;
- shared schema/save-shape decisions;
- cross-linking docs;
- `docs/DOCUMENTATION_INDEX.md`;
- final alpha-gate and live-smoke decisions;
- conflict resolution when two workers need the same file.

Agent-0 should run a repeated manager loop:

1. choose the current phase exit gate;
2. inspect `git status --short`;
3. freeze or reserve shared files;
4. launch only the workers needed for that phase;
5. record each worker in the active worker registry;
6. wait for handoffs or poll worker status through the available Codex task-management surface;
7. freeze affected workers before integration;
8. inspect diffs by lane;
9. integrate one lane at a time;
10. run targeted checks;
11. update the registry and work map;
12. release, retarget, or retire workers;
13. advance only when the phase exit gate is met.

Agent-0 should not let workers make independent changes to these shared seams without an explicit freeze or handoff:

- campaign save shape;
- `commandBearing` state root shape;
- Mission Director turn packet shape;
- runtime ingress/response ledger shape;
- SillyTavern host generation and posting flow;
- sidecar output schemas;
- player-safe projection shape;
- shared CSS/shell navigation;
- docs index, release notes, or alpha-gate scripts.

Agent-0 should maintain a short live work map:

```text
Phase:
Frozen files:
Active workers:
Worker lane:
Files owned:
Current branch/revision:
Tests required before handoff:
Integration requests:
```

Agent-0 should also maintain an active worker registry:

```text
Worker:
Phase:
Task:
Status: planned | launched | running | handoff-received | integrated | blocked | retired
Allowed files:
Forbidden files:
Prompt sent:
Last update:
Tests expected:
Handoff received:
Integration decision:
```

Workers should not create additional workers. If a worker sees useful parallel work, it should request a new worker from Agent-0 in its handoff.

## Parallelization Strategy

This build has three dependency layers.

### Layer 1: Contracts Before Behavior

Parallelizable:

- state model and validator skeletons;
- sidecar schema contracts;
- UI fixture/projection contract sketches;
- test harness inventory.

Not parallelizable:

- committing real turn behavior before validator and transaction helpers exist;
- rendering hidden ledgers directly in UI;
- model contracts that assume state roots Agent-0 has not frozen.

### Layer 2: Mechanics Before Surfaces

Parallelizable:

- evidence/review backend against fixtures;
- Readied runtime against mocked spend helpers;
- Character tab against player-safe projection fixtures;
- Assist UI against mocked point/readied state.

Not parallelizable:

- final UI wiring to runtime before projection helpers are stable;
- SillyTavern generation abort behavior before runtime commit semantics are stable;
- Mark Review awards before closure proof and idempotency gates exist.

### Layer 3: Integration Before Polish

Parallelizable:

- targeted tests by lane;
- docs drift notes;
- visual fixture checks;
- live-smoke script preparation.

Not parallelizable:

- final alpha gate;
- live SillyTavern readied-point smoke;
- docs index/release-facing updates;
- shared cleanup from `commandStyle` to `commandBearing`.

## Phase Plan

### Phase 0: Baseline And Ownership Freeze

Owner: Agent-0.

Purpose: establish the build baseline and stop file conflicts before workers start.

Tasks:

- run `git status --short`;
- record existing dirty files and mark them user-owned unless Agent-0 created them;
- run the current targeted baseline tests Agent-0 expects to rely on;
- identify existing Command Bearing tests and UI tests;
- assign worker lanes and allowed file ranges;
- tell workers to read this plan plus their required source docs;
- create the active worker registry in the primary Codex chat;
- launch no more than the Phase 1 workers needed for contract foundation;
- freeze docs index, shared schemas, alpha-gate scripts, and shared host/runtime seams until explicitly delegated.

Required reading for every worker:

- [Parallel Agent Coordination Protocol](PARALLEL_AGENT_COORDINATION_PROTOCOL.md)
- this execution plan
- all three Command Bearing/Character planning docs listed in Status

Exit gate:

- Agent-0 has a current ownership map;
- Agent-0 has a current worker registry in the primary chat;
- workers have scoped prompts;
- no worker is editing the same shared file without explicit assignment.

### Single-Chat Worker Lifecycle

Agent-0 should manage every worker through this lifecycle from the primary Codex chat.

### 1. Launch

Before launching a worker, Agent-0 writes a registry entry and sends a prompt from the Worker Launch Prompts section with:

- worker lane;
- phase;
- exact task;
- allowed files;
- forbidden files;
- required docs;
- expected tests;
- stop conditions;
- handoff deadline or completion condition.

Agent-0 should launch fewer workers than theoretically possible. For this build, two or three active workers are usually better than five because many files are shared integration points.

### 2. Monitor

Agent-0 tracks worker state in the registry:

- `planned`: prompt drafted, not sent;
- `launched`: prompt sent, no work reported yet;
- `running`: worker has started and owns its assigned files;
- `handoff-received`: worker stopped and returned a handoff;
- `integrated`: Agent-0 accepted and integrated the work;
- `blocked`: worker cannot continue without Agent-0;
- `retired`: worker's lane is complete or superseded.

Agent-0 should not let a worker remain `running` across a phase boundary. Either integrate, retarget, or retire it before advancing.

### 3. Freeze

Before integrating any shared seam, Agent-0 sends a freeze instruction to affected workers:

```text
Integration freeze for Command Bearing Phase <n>.

Stop after your current command.
Do not edit files until I release the freeze.
Return a handoff with files changed, tests run, behavior changed, hidden-state checks, risks, and integration requests.
```

Agent-0 should wait for handoffs from workers touching adjacent files before integrating.

### 4. Integrate

Agent-0 integrates one lane at a time:

- inspect worker diff;
- check it stayed within assigned files;
- run lane tests;
- resolve conflicts without reverting unrelated work;
- update docs only if the behavior exists or the doc is explicitly planning-only;
- mark the registry entry `integrated` or `retired`.

### 5. Release Or Retarget

After integration, Agent-0 either releases the worker with a narrowed next task or retires it:

```text
Freeze released for your lane.

Resume only this task:
<narrow next task>

You may edit:
<files>

Do not edit:
<files>
```

Workers that finish their lane should not keep searching for extra work. They should hand off suggested next tasks to Agent-0.

### Worker Output Rules

Every worker handoff must be self-contained enough for Agent-0 to integrate from the primary chat without reading the entire worker conversation.

Worker handoffs must include:

- exact files changed;
- exact tests run and results;
- behavior changed;
- player-safe/hidden-state checks performed;
- assumptions made;
- blockers or risks;
- requested integration order;
- suggested next worker task.

Worker handoffs must not include:

- raw hidden model output;
- raw provider prompts or completions;
- unvalidated hidden relationship values;
- speculative changes outside the assigned lane;
- instructions for the user to coordinate another agent.

### Phase 1: Contract Foundation

Primary owners:

- Backend worker A for state, migration, validators, transactions.
- Backend worker B for model schemas and role authority.
- QA worker for test inventory.
- UI worker for fixture-only projection shape notes.

Parallel work:

- Backend worker A:
  - migrate `commandStyle` target contract to `commandBearing`;
  - add authoritative ledger shapes for evidence, reviews, spends, recovery, and readied state;
  - add validator helpers named in the backend plan;
  - add idempotency key helpers;
  - add unit tests for migration and validator gates.
- Backend worker B:
  - add schema ids for Utility closure signal, evidence proposal, relationship perception proposal, Mark Review proposal, and fit-check output;
  - update role authority in `model-call-authority-matrix.mjs`;
  - extend parser contracts without mutating campaign state;
  - add parser and hidden-output rejection tests.
- QA worker:
  - inventory current tests touching `commandStyle`, sidecars, runtime turns, Crew UI, and SillyTavern host posting;
  - draft the cross-lane verification matrix.
- UI worker:
  - inspect Crew and Assist rendering paths;
  - prepare fixture contract expectations for `commandBearingPlayerView` and `playerCharacterView`;
  - do not wire UI to hidden state yet.

Agent-0 integration order:

1. State shape and migration.
2. Validator helpers.
3. Parser/schema contracts.
4. Test harness updates.

Exit gate:

- `commandBearing` target state shape exists behind helpers;
- validators reject malformed, unauthorized, unanchored, duplicate, hidden-leaking, and transaction-unsafe proposals;
- parser contracts exist for all planned model outputs;
- no UI reads raw hidden ledgers.

### Phase 2: Evidence, Closure, Relationship Perception, And Mark Review

Primary owners:

- Backend worker B for evidence, closure, perception, and Mark Review proposal flows.
- Backend worker A for transaction application and idempotency.
- QA worker for fixture and integration tests.
- UI worker for Character projection fixtures.

Parallel work:

- Backend worker B:
  - add Utility `closureSignals` as a non-authoritative candidate;
  - add deterministic closure planner using committed quest/thread/arc/chapter state;
  - add evidence collector proposal flow through the `commandBearingEvaluator` lane;
  - add relationship perception proposal flow and separate hidden/display validation;
  - add Mark Review proposal flow that can award Inspiration, Resolve, or no Mark.
- Backend worker A:
  - commit evidence records after meaningful committed outcomes;
  - apply Mark Review records and awards atomically;
  - keep stale invalidation and duplicate-award protection deterministic;
  - ensure rank/cap/reserve changes are recalculated by code.
- UI worker:
  - build or refine player-safe projection fixtures for evidence, reviews, history, and relationship perception;
  - do not expose raw relationship values or model diagnostics.
- QA worker:
  - add tests for meaningful turn creates evidence but no Mark;
  - add tests for quest/thread/arc/chapter closure review;
  - add tests for no-award review persistence;
  - add hidden-leak regression tests.

Agent-0 integration order:

1. Closure signal parser.
2. Closure planner.
3. Evidence ledger commit path.
4. Relationship perception records.
5. Mark Review transaction path.
6. Projection fixtures.

Exit gate:

- meaningful committed turns can create evidence without awarding a Mark;
- proven closure can trigger exactly one Mark Review;
- Mark Review can award Inspiration, Resolve, or no Mark;
- invalid review output leaves evidence open and retryable;
- relationship perceptions are player-safe display records.

### Phase 3: Readied Spend Runtime And Narration

Primary owners:

- Runtime worker for chat-native turn orchestration, host generation abort, narration packet, and posting.
- Backend worker A for spend helpers and transaction validation.
- Backend worker B for post-send eligibility contract.
- QA worker for runtime tests.
- UI worker for mocked Assist action wiring.

Parallel work:

- Runtime worker:
  - attach readied state to the next bound-chat player ingress;
  - abort normal SillyTavern generation for consequential readied-point turns;
  - resolve the base outcome without Command Bearing bias;
  - call post-send eligibility only when a readied point is attached;
  - build the committed Command Bearing outcome-adjustment packet;
  - route final narration through the controlled narrator provider;
  - post the Directive-owned response into SillyTavern.
- Backend worker A:
  - add ready, cancel, return, consume, and spend-ledger helpers;
  - validate exact readied id, ingress id, chat id, outcome id, and outcome-band improvement;
  - preserve pre-commit refund and post-commit repair boundaries.
- Backend worker B:
  - add post-send eligibility schema and parser;
  - ensure eligibility cannot decide mission outcome or mutate state.
- UI worker:
  - wire mocked Ready/Readied/Cancel status and spend/return notices behind projection fixtures;
  - wait for Agent-0 before touching shared runtime action APIs.
- QA worker:
  - add routine return, track mismatch return, impossible return, already-successful return, valid spend commit, and provider failure tests.

Agent-0 integration order:

1. Spend helpers.
2. Eligibility parser.
3. Runtime ingress attachment.
4. Host generation abort.
5. Commit and narration packet.
6. SillyTavern response posting.
7. Assist action wiring.

Exit gate:

- valid aligned Readied spend improves the result by exactly two bands;
- invalid or ineligible messages return the point;
- provider failure before mechanical commit returns or preserves the point;
- provider failure after mechanical commit preserves the spend and enters response repair;
- narration receives definitions, ladder, base band, final band, eligibility, improvements, and anchored consequences.

### Phase 4: Assist And Character/Crew UI

Primary owners:

- UI worker for Assist module, Crew local tabs, Character page, and display states.
- Backend worker A for player-safe projection helpers.
- Runtime worker for action callbacks and runtime view envelopes.
- QA worker for UI and hidden-leak tests.

Parallel work:

- UI worker:
  - add Assist Command Bearing rows with banked Inspiration/Resolve counts;
  - add `Ready Inspiration`, `Ready Resolve`, `Readied`, `Cancel`, `Check Inspiration`, and `Check Resolve`;
  - render fit-check reports without replacement prose;
  - add Crew drawer local tabs: `Character` and `Crew`;
  - preserve existing Senior Staff Roster and Duty Roster under `Crew`;
  - render Character identity, portrait/fallback, service record, Command Bearing summary, evidence, Mark Reviews, spend/recovery history, current standing, and interaction logs;
  - keep local tab switching from snapping scroll or creating top-level shell routes.
- Backend worker A:
  - implement `projectCommandBearingForPlayer`;
  - implement `playerCharacterView`;
  - ensure projections are the only UI source for Command Bearing and relationship perception display.
- Runtime worker:
  - expose Assist and Character projections in the active view envelope;
  - route fit-check actions through the Assist service;
  - preserve wrong-chat/no-campaign guard behavior.
- QA worker:
  - add tests for Assist point counts, readied state, fit-check display, Character tab rendering, Crew tab preservation, and hidden-value absence.

Agent-0 integration order:

1. Projection helpers.
2. Assist action data.
3. Assist module rendering.
4. Crew drawer local tabs.
5. Character page rendering.
6. CSS and responsive polish.
7. UI tests.

Exit gate:

- Assist shows authoritative banked points and Readied state;
- fit checks provide brief GM-style feedback without rewriting player text;
- Character shows durable Command Bearing and player-safe interaction history;
- Crew still shows the current senior staff roster and Duty Roster inspector;
- no hidden values or raw model diagnostics appear in UI.

### Phase 5: Recovery, Reconciliation, And Live Host Confidence

Primary owners:

- Runtime worker for partial reply, swipe, retry, edit/delete, and repair behavior.
- Backend worker A for stale evidence/review invalidation.
- QA worker for smoke scripts and live proof.
- Agent-0 for integration freeze and live-host decision.

Parallel work:

- Runtime worker:
  - preserve spend state across narration swipes/retries;
  - repair post-commit partial replies from the same committed packet;
  - route post-commit edit/delete through normal reconciliation;
  - avoid Command Bearing-specific deep-history refund logic.
- Backend worker A:
  - mark evidence stale after source invalidation;
  - mark downstream reviews stale when required;
  - preserve awarded Marks unless branch/replay/reconciliation says otherwise.
- QA worker:
  - add tests for swipes, partial response repair, post-commit edit/delete, and branch/replay behavior;
  - prepare a SillyTavern smoke for visible Assist controls and one Readied-point flow.

Agent-0 integration order:

1. Runtime recovery.
2. State invalidation.
3. Smoke fixtures/scripts.
4. Live SillyTavern smoke if provider/host prerequisites are available.

Exit gate:

- swipes and narration retries keep the same mechanics;
- post-commit provider failure repairs from the committed packet;
- edit/delete invalidates or reconciles normally;
- live or smoke proof covers at least one visible Assist/Readied flow.

### Phase 6: Cleanup, Docs, And Alpha Gate

Primary owners:

- Agent-0 for final integration and shared docs.
- QA worker for verification.
- UI, runtime, and backend workers for lane-specific cleanup after Agent-0 assigns it.

Tasks:

- remove stale pause-first Command Bearing UI assumptions;
- remove old public `commandStyle` naming from runtime docs/tests where `commandBearing` is now authoritative;
- update Operator Manual, Tips, technical docs, and render tracking only after behavior exists;
- update `src/threads/README.md` because thread closure can now feed Command Bearing review;
- run targeted lane tests;
- run `node tools\scripts\verify-repo-structure.mjs`;
- run `node tools\scripts\run-alpha-gate.mjs`;
- decide whether an additional live SillyTavern smoke is required after final integration.

Exit gate:

- all acceptance criteria from the three source planning docs are either implemented or explicitly deferred with a reason;
- alpha gate passes or has a documented blocker;
- docs index and planning docs link the final plan set;
- no worker-owned partial scaffolds remain unintegrated.

## Work That Can Safely Run In Parallel

| Work | Can run beside | Must wait for |
|---|---|---|
| Validator helper skeletons | Parser schema contracts, test inventory | Agent-0 state-shape freeze |
| Utility closure signal parser | Evidence proposal parser, UI fixture planning | Role authority decision |
| Evidence collector proposal flow | Relationship perception proposal flow | Validator/source-anchor helpers |
| Closure planner | Evidence fixture tests | committed quest/thread/arc/chapter source refs |
| Mark Review parser | Character projection fixtures | closure proof contract |
| Readied state helper tests | Assist UI fixture design | commandBearing migration |
| Runtime readied ingress audit | UI mock controls | spend helper API |
| Narration packet tests | Fit-check parser tests | final outcome packet shape |
| Character tab layout | Assist module layout | projection fixture shape |
| Hidden-leak tests | All lanes | player-safe projection contract |
| Live smoke preparation | UI/runtime work | integrated runtime behavior |

## Work That Should Not Run In Parallel

- Two workers editing `src/runtime/runtime-app.mjs`.
- Two workers editing `src/campaign/transaction-state.mjs`.
- Two workers editing `src/ui/crew-panel.js`.
- UI wiring that reads raw state while projection helpers are still changing.
- Runtime spend flow before transaction idempotency is stable.
- Mark Review award application before closure proof is stable.
- Final `commandStyle` cleanup while workers still depend on old names.
- Docs index or release-facing docs edits by worker agents unless Agent-0 assigns them.
- Live host smoke while runtime generation abort and response posting behavior is mid-change.

## Worker Launch Prompts

Agent-0 can use these as starting prompts after filling in file boundaries and current test commands.

### Backend Worker A: State, Validation, Transactions

```text
You are the Command Bearing backend state worker for Directive.
You were launched by Agent-0 from the primary Codex chat. Report only to Agent-0 through the requested handoff. Do not ask the user to coordinate your work, and do not create additional workers.

Read:
- docs/planning/PARALLEL_AGENT_COORDINATION_PROTOCOL.md
- docs/planning/COMMAND_BEARING_AGENT_EXECUTION_PLAN.md
- docs/planning/COMMAND_BEARING_BACKEND_DEVELOPMENT_PLAN.md

Task:
Implement the assigned phase slice for commandBearing state, deterministic validators, ledgers, idempotency, and transaction application.

Scope:
- You may edit only the files Agent-0 assigns, usually under src/command plus explicitly assigned transaction/state-delta files.
- Do not edit docs/DOCUMENTATION_INDEX.md, release notes, manifests, alpha-gate scripts, shared runtime host files, or UI files unless Agent-0 explicitly adds them.

Acceptance:
- Validator and transaction behavior is covered by targeted tests.
- Model outputs remain proposals until deterministic validation accepts them.
- No hidden values or raw provider diagnostics become player-facing state.

Stop and hand off if the work needs a save-shape decision, turn packet change, host generation behavior, UI projection change, or another agent's files.
```

### Backend Worker B: Model Contracts, Closure, Evidence, Review

```text
You are the Command Bearing model-contract and evidence worker for Directive.
You were launched by Agent-0 from the primary Codex chat. Report only to Agent-0 through the requested handoff. Do not ask the user to coordinate your work, and do not create additional workers.

Read:
- docs/planning/PARALLEL_AGENT_COORDINATION_PROTOCOL.md
- docs/planning/COMMAND_BEARING_AGENT_EXECUTION_PLAN.md
- docs/planning/COMMAND_BEARING_BACKEND_DEVELOPMENT_PLAN.md
- docs/planning/MODEL_CALL_ROBUSTNESS_PASS_PLAN.md

Task:
Implement the assigned phase slice for Utility closure signals, evidence proposals, relationship perception records, closure planning, and Mark Review proposals.

Scope:
- You may edit only the files Agent-0 assigns, usually under src/jobs, src/generation, src/adjudication, src/directors, src/threads, src/quests, or src/story.
- Do not commit campaign state directly from model output.

Acceptance:
- Parser/schema tests reject malformed, hidden-leaking, unauthorized, and unanchored output.
- Utility closure signals are non-authoritative.
- Mark Review requires deterministic closure proof and supplied evidence.

Stop and hand off if the work needs transaction application, runtime ingress behavior, UI rendering, or a shared schema decision.
```

### Runtime Worker: Readied Spend And Narration

```text
You are the Command Bearing runtime worker for Directive.
You were launched by Agent-0 from the primary Codex chat. Report only to Agent-0 through the requested handoff. Do not ask the user to coordinate your work, and do not create additional workers.

Read:
- docs/planning/PARALLEL_AGENT_COORDINATION_PROTOCOL.md
- docs/planning/COMMAND_BEARING_AGENT_EXECUTION_PLAN.md
- docs/planning/COMMAND_BEARING_USER_FACING_SYSTEM_PLAN.md
- docs/planning/COMMAND_BEARING_BACKEND_DEVELOPMENT_PLAN.md

Task:
Implement the assigned phase slice for Readied point ingress attachment, SillyTavern generation abort, base outcome resolution, eligibility, committed spend, narration packet construction, and Directive-owned response posting.

Scope:
- You may edit only runtime, generation, host, or Assist service files Agent-0 assigns.
- Do not change transaction helpers, UI rendering, docs index, or sidecar schemas unless Agent-0 assigns them.

Acceptance:
- Consequential Readied turns do not let normal host generation produce the committed reply.
- Valid spends improve the committed outcome by the configured two-band rule.
- Provider failures respect pre-commit refund and post-commit repair boundaries.

Stop and hand off if the work needs validator behavior, transaction application, UI surface changes, or a host capability not currently available.
```

### UI Worker: Assist And Character/Crew

```text
You are the Command Bearing and Character UI worker for Directive.
You were launched by Agent-0 from the primary Codex chat. Report only to Agent-0 through the requested handoff. Do not ask the user to coordinate your work, and do not create additional workers.

Read:
- docs/planning/PARALLEL_AGENT_COORDINATION_PROTOCOL.md
- docs/planning/COMMAND_BEARING_AGENT_EXECUTION_PLAN.md
- docs/planning/COMMAND_BEARING_USER_FACING_SYSTEM_PLAN.md
- docs/planning/PLAYER_CHARACTER_PAGE_AND_CREW_TABS_PLAN.md

Task:
Implement the assigned phase slice for Assist Command Bearing controls, fit-check display, Crew drawer Character/Crew tabs, Character page rendering, and player-safe projection consumption.

Scope:
- You may edit only UI, CSS, and projection files Agent-0 assigns.
- Do not read hidden state directly in UI.
- Do not add Ready controls outside Assist.
- Do not create a new top-level Character route.

Acceptance:
- Assist shows authoritative point counts and Readied state.
- Character shows durable Command Bearing and player-safe relationship perception history.
- Crew preserves the existing Senior Staff Roster and Duty Roster inspector.
- UI tests or fixture checks prove hidden values do not render.

Stop and hand off if the UI needs new runtime action APIs, projection fields, shared shell navigation changes, or hidden state exposure to render.
```

### QA Worker: Verification And Drift Control

```text
You are the Command Bearing QA worker for Directive.
You were launched by Agent-0 from the primary Codex chat. Report only to Agent-0 through the requested handoff. Do not ask the user to coordinate your work, and do not create additional workers.

Read:
- docs/planning/PARALLEL_AGENT_COORDINATION_PROTOCOL.md
- docs/planning/COMMAND_BEARING_AGENT_EXECUTION_PLAN.md
- all three Command Bearing/Character planning docs
- docs/testing/TESTING_STRATEGY.md if Agent-0 assigns full verification

Task:
Build and maintain the test matrix for the assigned phase, identify docs drift, and prepare targeted smoke verification.

Scope:
- You may edit tests, smoke scripts, and docs only where Agent-0 assigns them.
- Do not weaken tests to fit implementation.
- Do not edit docs/DOCUMENTATION_INDEX.md unless Agent-0 explicitly assigns it.

Acceptance:
- Each implemented lane has targeted tests.
- Hidden-state leak checks exist for UI/projections/model outputs.
- Agent-0 receives clear smoke and alpha-gate recommendations.

Stop and hand off if a failure crosses lanes, requires a live provider credential, or needs a product-contract decision.
```

## Verification Matrix

Minimum verification before this build is considered integrated:

| Area | Required proof |
|---|---|
| State migration | Existing saves or fixtures migrate from `commandStyle` to `commandBearing` without losing ranks, marks, points, reserve, recovery, or awarded-source protection. |
| Deterministic validation | Invalid schema, wrong role, bad source id, hidden leak, duplicate award, stale evidence, and transaction mismatch all fail without mutating state. |
| Evidence | Meaningful committed turn creates evidence; routine turn does not; evidence never awards a Mark directly. |
| Closure | Utility signal alone cannot trigger review; committed closure with evidence can trigger exactly one review. |
| Mark Review | Inspiration award, Resolve award, no-award review, duplicate-source rejection, and rank-change output are covered. |
| Relationship perception | Hidden relationship delta and player-safe perception are validated separately; Character receives only player-safe records. |
| Readied spend | ready, cancel, attach, return, consume, exact two-tier improvement, and spend ledger are covered. |
| Runtime host flow | Consequential Readied turn aborts normal SillyTavern generation and posts a Directive-owned response. |
| Narration packet | Packet includes track definition, six-band ladder, base outcome, final outcome, eligibility basis, improvements, anchored consequences, and safety rules. |
| Recovery | Pre-commit provider failure returns/preserves the point; post-commit narration/posting failure preserves spend and repairs from committed packet. |
| Swipes and edits | Swipe/retry does not reroll or refund; post-commit edit/delete uses normal reconciliation. |
| Assist UI | Counts, Ready/Readied/Cancel, fit checks, wrong-chat guard, busy state, spend status, and return status render from authoritative projections. |
| Character UI | Character/Crew tabs render; Character shows identity, portrait/fallback, Command Bearing summary, evidence, reviews, history, and player-safe crew interactions. |
| Hidden-state safety | UI, Command Log, Assist, narrator packets, Character projection, and diagnostics exclude hidden values, private NPC thoughts, raw provider output, and model reasoning. |
| Docs | Planning docs and documentation index are linked; user-facing docs update only after runtime behavior exists. |
| Gate | Targeted tests pass, repo structure verification passes, alpha gate passes or has a documented blocker. |

## Integration Freeze Checklist For This Build

Agent-0 should freeze workers from the primary Codex chat before:

- merging any `commandBearing` state shape change;
- changing sidecar output schemas;
- changing runtime ingress or response ledger behavior;
- changing SillyTavern generation abort or posting behavior;
- wiring UI to projections;
- removing `commandStyle` compatibility names;
- running live SillyTavern smoke;
- running final alpha gate.

Freeze handoff must include:

- files changed;
- tests run;
- behavior changed;
- hidden-state/player-safe checks;
- known risks;
- integration requests;
- exact next slice suggested by the worker.

During the freeze, Agent-0 should:

- mark affected workers `handoff-received`, `blocked`, or `retired` in the registry;
- inspect `git status --short`;
- integrate only one lane at a time;
- run that lane's targeted checks before moving to the next lane;
- record each integration decision in the primary chat;
- release or retire workers explicitly after checks pass.

## Definition Of Done

This build is done when:

- all three source planning docs' acceptance criteria are implemented or explicitly deferred by Agent-0;
- no old pause-first Command Bearing flow remains active;
- `commandBearing` is the authoritative state name;
- deterministic validators guard every model-produced proposal before mutation;
- Assist lets players see, check, ready, cancel, spend, and understand returned points;
- Character shows the durable Command Bearing and player-safe relationship record;
- Crew still works as the existing senior staff roster and Duty Roster inspector;
- Readied spend mechanics are committed before narration and are not hidden prompt bias;
- closure-triggered Mark Review can award Inspiration, Resolve, or no Mark from accumulated evidence;
- recovery, swipe, edit, and provider-failure boundaries are tested;
- hidden data stays out of player-facing surfaces;
- targeted tests, repo structure verification, and alpha gate are green or have documented blockers;
- docs are cross-linked and no longer describe stale Command Bearing behavior as current behavior.
