# Continuity Projection Matrix (CPM) Implementation Plan

## Status

Planned pre-alpha implementation.

This plan turns the [Continuity Projection Matrix (CPM)](../design/CONTINUITY_PROJECTION_MATRIX.md) into a complete staged build. It assumes Directive can replace current prompt-context behavior in place because the project is still pre-alpha.

This is not a vertical-slice-only plan. The first slices prove Bronn identity and Breckenridge travel continuity, but the target is the full campaign-state continuity service:

- source-frame construction;
- structured continuity fact schema;
- domain materializers;
- broad recall;
- Utility projection planner;
- deterministic plan validation;
- static prompt lanes;
- Director packets;
- contradiction guard and retry/repair enforcement;
- generated-claim quarantine;
- adaptive projection hints;
- audit, cache, diagnostics, settings, and live-host proof;
- bundled campaign normalization and regression coverage.

## Source Contracts

Required reading before implementation:

- [CPM Design Baseline](../design/CONTINUITY_PROJECTION_MATRIX.md)
- [Parallel Agent Coordination Protocol](PARALLEL_AGENT_COORDINATION_PROTOCOL.md)
- [Model Call Robustness Pass Plan](MODEL_CALL_ROBUSTNESS_PASS_PLAN.md)
- [Scene Handshake Protocol](../design/SCENE_HANDSHAKE_PROTOCOL.md)
- [Outcome Integrity](../design/OUTCOME_INTEGRITY.md)
- [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)
- [Chat-Native Runtime](../architecture/CHAT_NATIVE_RUNTIME.md)
- [Player Turn Sequence](../technical/PLAYER_TURN_SEQUENCE.md)
- [Model Calls And Provider Routing](../technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md)
- [Mission Director Contracts](../architecture/MISSION_DIRECTOR_CONTRACTS.md)
- [Director Retrieval And Context Orchestration](../architecture/DIRECTOR_RETRIEVAL_AND_CONTEXT_ORCHESTRATION.md)
- [Campaign Package Schema](../packages/CAMPAIGN_PACKAGE_SCHEMA.md)
- [Crew Dataset Contract](../packages/CREW_DATASET_CONTRACT.md)

Useful reference only:

- Frontier-model prototype bundle reviewed on 2026-06-26.

The prototype should not be adopted wholesale. It is useful for static prompt-key clearing, role metadata, prompt-packet merge shape, seed crew materialization, and seed tests. It is not a safe base because it does not enforce retry-class guard failures, does not guard host-native `injectAndContinue` output, does not model the full Breckenridge transit, passes too little scene frame into recall, and validates Utility plans too loosely.

## Goal

Build CPM as the authoritative projection service between committed campaign reality and model-facing context.

The system must answer, every turn and for every consumer:

- what is true now;
- what used to be true;
- what changed because of the player;
- what is hidden;
- what is player-known;
- what is superseded;
- what generated claims are known false;
- what facts are hard invariants;
- which audience may see each fact;
- which prompt depth should each fact occupy;
- which omissions are safe;
- which contradictions require retry, repair, review, or quarantine.

The operating contract is:

```text
The Utility provider decides what matters now.
The backend decides what is true, visible, legal, and installable.
Directors decide and validate.
The matrix remembers, reconciles, and projects.
Narration expresses.
```

## Non-Negotiable Contracts

All agents must preserve these contracts:

- The source of truth remains package data, campaign state, owned ledgers, Scene Handshake settlements, reconciliation records, and validated state deltas.
- The matrix may store projection hints, rejected claims, candidate claims, accepted non-derivable facts, caches, overrides, and audits. It must not become a second canon store.
- Utility output selects from supplied fact ids only.
- Utility output cannot create fact ids, rewrite hard values, reveal hidden facts, install prompts, or mutate state.
- Deterministic validation must reject unknown fact ids, hidden narrator-blocked facts, conflict losers, invalid lanes, invalid TTLs, invalid force levels, illegal compression groups, and hard-floor demotions.
- Hard-floor facts survive Utility omission.
- Audience filtering happens before any Utility call.
- Narrator/player prompt packets contain only player-safe facts.
- Director packets may contain authorized hidden facts only for the receiving Director audience.
- Generated prose is presentation until validated by Scene Handshake, Director validation, user confirmation, reconciliation, or state-gateway operation.
- Retry-class continuity violations must not dispatch unchanged player-visible text.
- Host-native generations must be observable enough for post-generation guard and generated-claim quarantine.
- Static Matrix prompt keys and dynamic Directive prompt keys clear on disable, error, unload, chat switch, save load, branch switch, failed generation, aborted generation, and stale prompt sync.
- Prompt text is never source truth.
- Branch-local and swipe-local claims remain isolated until accepted into branch state.

## Single Codex Chat Operating Model

This plan is designed to run from one primary Codex chat.

The primary chat is Agent-0. Agent-0 creates and manages worker agents using available Codex multi-agent, New Task, or New Chat tooling. The user should not need to coordinate worker chats manually.

Agent-0 owns durable coordination state:

- active phase;
- phase exit gate;
- active worker registry;
- file ownership map;
- frozen files;
- worker prompts sent;
- worker handoffs received;
- integration queue;
- tests run;
- unresolved blockers;
- live-host verification status.

If multi-agent tooling is unavailable, Agent-0 runs this plan sequentially. Each worker lane becomes a scoped checklist executed in the primary chat.

### Primary Chat Kickoff Prompt

When implementation starts, the user should be able to say:

```text
Use docs/planning/CONTINUITY_PROJECTION_MATRIX_IMPLEMENTATION_PLAN.md as the operating plan.
Act as Agent-0.
Create and manage the needed worker agents yourself.
Keep the worker registry, file ownership map, freeze windows, integration order, and verification results in this chat.
Do not ask me to coordinate subagents manually.
Begin with Stage 0.
```

### Agent-0 State Board

Agent-0 should maintain this board in the primary chat whenever a stage starts, a worker is launched, a worker hands off, or a stage closes:

```text
CPM Build Board
Stage:
Stage gate:
Active workers:
- <worker id/name>: <lane>, <status>, <allowed files>, <expected handoff>
Frozen files:
Integration queue:
Tests last run:
Live proof:
Open blockers:
Next Agent-0 action:
```

## Agent Roster

Agent-0 may map these build lanes onto Agent-1 through Agent-8 worker tasks. If fewer workers are available, combine lanes only at stage boundaries.

| Build lane | Default owner | Primary responsibility | Primary files and folders |
| --- | --- | --- | --- |
| Orchestration and integration | Agent-0 | Tasking, ownership map, freeze windows, final integration, docs index, alpha gate, live smoke decision. | `docs/DOCUMENTATION_INDEX.md`, shared docs, final edits in shared runtime/generation/host files |
| State and storage | Backend worker A | `continuity` state root, schema/version helpers, fact-use stats, projection hints, rejected/candidate claims, cache, audit retention, migration from prototype/old prompt records. | `src/continuity/`, `src/runtime/state-delta-gateway.mjs`, `src/campaign/transaction-state.mjs`, save-state helpers |
| Source frame and materializers | Backend worker B | Source frame, fact schema, source hashes, conflict keys, source-authority ranking, domain materializers, bundled campaign normalization. | `src/continuity/`, `packages/bundled/`, package validation scripts |
| Utility and model contracts | Model worker | Utility planner, contradiction reviewer, claim extractor, compressor roles, prompts, schemas, parser contracts, provider routing tests. | `src/generation/`, `src/providers/`, `schemas/generation/`, `tools/scripts/test-model-call-authority-matrix.mjs` |
| Runtime and host prompt integration | Runtime worker | Prompt sync, static keys, prompt adapter clearing, host-native output observation, retry/repair dispatch, branch/save prompt invalidation. | `src/runtime/`, `src/hosts/sillytavern/`, `src/generation/player-safe-prompt-context-builder.mjs` |
| Directors and sidecars | Director worker | Director packets, sidecar packets, post-commit invalidation, Director audience gates, packet audits. | `src/directors/`, `src/jobs/`, `src/retrieval/`, `src/campaign/transaction-state.mjs` |
| Guard and quarantine | Safety worker | Deterministic guard, Utility reviewer, repair/retry/review policy, generated-claim extraction/adjudication, Scene Handshake and Outcome Integrity integration. | `src/continuity/`, `src/runtime/chat-turn-orchestrator.mjs`, `src/runtime/scene-handshake-settler.mjs`, `src/runtime/outcome-integrity.mjs` |
| Diagnostics and UI | UI worker | Projection inspector, compact settings policy, prompt audit surface, developer diagnostics, no hidden leaks. | `src/ui/`, `styles/`, settings panel files |
| Verification and live proof | QA worker | Unit/snapshot/lifecycle/live tests, alpha gate, SillyTavern canaries, package regression fixtures, hidden-leak checks. | `tools/scripts/`, `tests/`, `docs/testing/` |

## Agent-0 Reserved Files

Agent-0 should normally own or integrate final edits in:

- `docs/DOCUMENTATION_INDEX.md`
- `docs/planning/CONTINUITY_PROJECTION_MATRIX_IMPLEMENTATION_PLAN.md`
- `docs/design/CONTINUITY_PROJECTION_MATRIX.md`
- `tools/scripts/run-alpha-gate.mjs`
- shared package schema roots
- `src/runtime/runtime-app.mjs`
- `src/runtime/chat-turn-orchestrator.mjs`
- `src/generation/player-safe-prompt-context-builder.mjs`
- `src/generation/model-call-authority-matrix.mjs`
- `src/hosts/sillytavern/prompt-adapter.mjs`

Workers may propose changes to these files in handoff notes. They should not edit them unless Agent-0 explicitly assigns the edit.

## Freeze Rules

Agent-0 must issue an integration freeze before:

- changing save shape;
- changing package schema;
- changing generation roles or model-call authority;
- changing prompt adapter keys or prompt install lifecycle;
- changing `chat-turn-orchestrator` dispatch/retry behavior;
- changing Scene Handshake or Outcome Integrity acceptance paths;
- merging Director packet integration;
- touching bundled campaign data across more than one package;
- running full alpha gate after several worker handoffs;
- live SillyTavern smoke proof.

Freeze instruction:

```text
Integration freeze. Stop after your current command. Do not edit files until I release the freeze. Send a handoff with files changed, tests run, known risks, and integration requests.
```

## Implementation Stages

### Stage 0: Baseline, Prototype Audit, And Work Map

Goal: lock the starting point and prevent prototype mistakes from becoming production architecture.

Owner: Agent-0, with QA support.

Tasks:

- Inspect current `git status --short`.
- Snapshot current prompt-context, generation-role, host-prompt, Director, sidecar, Scene Handshake, Outcome Integrity, and save-state seams.
- Compare the frontier-model prototype against the design contract.
- Create an integration work map with file ownership and frozen surfaces.
- Decide whether any prototype files are mined manually or discarded.
- Identify current live Sam Vickers save/chat artifacts that prove the Bronn and travel failures.

Reference-only prototype salvage list:

- static prompt-key names and clear-all behavior;
- role metadata for `continuityProjectionPlanner`, `continuityContradictionReviewer`, `continuityClaimExtractor`, and `continuityProjectionCompressor`;
- prompt-packet merge shape;
- initial crew identity materializer ideas;
- deterministic Bronn species pattern detector;
- focused test fixture shape.

Do not salvage directly:

- monolithic matrix module;
- dispatch behavior that posts retry-class violations;
- host-native guard omission;
- under-modeled travel fact;
- permissive validator;
- tests that prove only final-ten-days travel.

Exit gate:

- Agent-0 has a current file ownership map.
- Prototype decisions are recorded in the primary chat.
- No prototype code has been copied blindly.

### Stage 1: Prompt Rails And Role Authority

Goal: establish static prompt lanes and model-call authority before building projection logic.

Primary agents: Runtime worker, Model worker, QA worker.

Tasks:

- Add static prompt keys:
  - `directive.contract`
  - `directive.continuity.invariants`
  - `directive.scene.active`
  - `directive.continuity.domain`
  - `directive.recap.committed`
  - `directive.context.revolving`
- Update SillyTavern prompt adapter to clear static Matrix keys plus dynamic Directive keys.
- Ensure prompt install/rebuild clears missing static keys.
- Add generation roles:
  - `continuityProjectionPlanner`
  - `continuityContradictionReviewer`
  - `continuityClaimExtractor`
  - `continuityProjectionCompressor`
- Add authority-matrix entries with `mayProposeState: false`, `mayInjectPrompt: false`, and empty `allowedRoots`.
- Add schema stubs for planner, guard reviewer, claim extractor, and compressor outputs.
- Add tests that fail if static keys are not cleared on disable/error/chat switch/save load/branch switch.

Exit gate:

- Prompt adapter tests prove static and dynamic key clearing.
- Model-call authority tests prove roles cannot mutate state or inject prompt text.
- No matrix role can be added without explicit provider lane and authority metadata.

### Stage 2: Continuity State Root And Storage Contract

Goal: add durable matrix-owned storage without creating a second canon store.

Primary agents: State and storage worker, QA worker.

Tasks:

- Add `continuity` state root shape:

```js
continuity: {
  schemaVersion: 1,
  acceptedFacts: [],
  candidateClaims: [],
  rejectedClaims: [],
  projectionHints: [],
  factUseStats: {},
  automationLocks: {},
  projectionCache: {},
  projectionRuns: [],
  lastProjection: null
}
```

- Define retention limits for runs, claims, hints, and stats.
- Add schema/version helpers and safe initialization.
- Ensure matrix writes are limited to `continuity` and prompt-context runtime tracking.
- Add state-delta-gateway tests preventing matrix paths from writing Director-owned roots.
- Add branch id, chat id, source message id, swipe id, source hash, prompt revision, and campaign revision fields to stored records.
- Add import/load behavior that can initialize missing `continuity` roots for existing pre-alpha saves.

Exit gate:

- Save-state tests prove `continuity` root initializes and persists.
- Tests prove matrix helpers cannot patch `mission`, `ship`, `crew`, `relationships`, `commandBearing`, `pressureLedger`, `questLedger`, `worldState`, or `commandLog` directly.
- Projection cache is disposable and rebuildable.

### Stage 3: Source Frame And Fact Schema

Goal: create the deterministic substrate that every later stage uses.

Primary agents: Source frame and materializers worker, State and storage worker.

Tasks:

- Implement `src/continuity/source-frame.mjs`.
- Implement `src/continuity/fact-schema.mjs`.
- Implement `src/continuity/fact-index.mjs`.
- Build source frame fields:
  - campaign id;
  - save id;
  - branch id;
  - chat id;
  - revision;
  - source hash;
  - package id;
  - package data;
  - campaign state;
  - crew dataset;
  - current scene;
  - active mission;
  - active mission phase;
  - active location;
  - active actors;
  - current ship state;
  - recent messages;
  - player message;
  - turn classification;
  - Director route;
  - projection hints;
  - rejected claims;
  - fact-use stats.
- Define fact record axes separately:
  - truth status;
  - authority;
  - source authority rank;
  - visibility;
  - projection status;
  - lifecycle;
  - scope;
  - conflict key.
- Implement conflict-key derivation:
  - subject type;
  - subject id;
  - predicate;
  - single-active-value semantics;
  - package-authored override.
- Implement source hash policy using only decision-relevant fields.

Exit gate:

- Unit tests prove stable ids, stable conflict keys, branch-scoped source hash changes, and no raw hidden data in narrator source frames.
- Fact records are structural. Prose is render metadata only.

### Stage 4: Domain Materializers And Bundled Campaign Normalization

Goal: materialize source-backed facts across all domains and normalize campaign data gaps.

Primary agents: Source frame/materializers worker, QA worker, Agent-0 for package schema decisions.

Required modules:

```text
src/continuity/materializers/package-facts.mjs
src/continuity/materializers/campaign-state-facts.mjs
src/continuity/materializers/crew-identity-facts.mjs
src/continuity/materializers/ship-travel-facts.mjs
src/continuity/materializers/mission-facts.mjs
src/continuity/materializers/command-log-facts.mjs
src/continuity/materializers/ledger-facts.mjs
src/continuity/materializers/rejected-claim-facts.mjs
src/continuity/materializers/scene-handshake-facts.mjs
src/continuity/materializers/reconciliation-facts.mjs
src/continuity/materializers/thread-facts.mjs
src/continuity/materializers/pressure-facts.mjs
```

Materializer rules:

- pure functions;
- no prompt budgeting;
- no model calls;
- no state mutation;
- always include source ids and conflict keys;
- render hard facts from templates, not model prose;
- mark hidden facts before they can reach recall.

Bundled campaign normalization:

- Add structured ship transit records where authored package data currently stores travel state only as prose.
- For Breckenridge/Ashes, encode:
  - origin: Utopia Planitia;
  - long-haul regime: warp, approximately warp 5.5 if source-backed;
  - elapsed summary: senior staff has spent several weeks together since departure;
  - current phase: shuttle rendezvous/local transfer;
  - local maneuver regime: impulse only for local rendezvous maneuvers;
  - remaining summary: roughly a week or final ten days out from the Asterion Reach, depending source wording;
  - negative constraint: do not frame the whole post-Utopia transit as six days at impulse.
- Normalize crew identity facts for every bundled campaign.
- Normalize location label fallback: `name || title || label || id`.
- Add package validation warnings for hard travel/location facts still living only in prose.

Exit gate:

- Bronn species, rank, billet, public profile, and appearance materialize from package/crew dataset.
- Breckenridge transit materializes origin, current transit, long-haul/local maneuver distinction, elapsed/remaining summary, and negative guard line.
- Every bundled campaign start has crew identity facts and current location facts.
- Package validation reports missing structured hard-continuity fields.

### Stage 5: Conflict Resolution, Audience Gates, And Broad Recall

Goal: create the deterministic candidate universe for Utility planning.

Primary agents: Source frame/materializers worker, Safety worker.

Tasks:

- Implement `conflict-resolver.mjs`.
- Implement `audience-gates.mjs`.
- Implement `recall-frame.mjs`.
- Implement `broad-recall.mjs`.
- Add audience gates:
  - narrator;
  - missionDirector;
  - crewDirector;
  - shipDirector;
  - commandDirector;
  - narrativeThreadDirector;
  - continuityTracker;
  - contradictionGuard;
  - diagnostic.
- Add recall sources:
  - exact entity mentions in player text;
  - alias matches in recent messages;
  - current scene actors;
  - active speaker or target actor;
  - nearby/present crew;
  - active mission phase;
  - current location;
  - current route/transit/ship posture;
  - recent assistant-mentioned topics;
  - recent user-mentioned topics;
  - pending Director domain;
  - open quest/thread/pressure facts;
  - recent rejected claims;
  - user/operator-pinned facts;
  - high-risk model-default facts;
  - facts recently omitted before guard violation;
  - active projection hints.
- Add hard floors:
  - hidden-info contract;
  - current location/transit when scene-relevant;
  - active mission phase;
  - present named crew compact identity table;
  - recent rejected-claim guard facts.

Exit gate:

- Recall tests prove Bronn identity is recalled when Bronn is present, mentioned, speaking, or recently contradicted.
- Travel facts recall when location, route, ETA, warp, impulse, shuttle, rendezvous, station, or arrival may matter.
- Narrator gate blocks hidden facts before Utility planning.
- Director gates allow authorized hidden packets without leaking them to narrator.

### Stage 6: Utility Projection Planner And Validator

Goal: add model-adjudicated relevance under deterministic authority rails.

Primary agents: Model worker, Safety worker, QA worker.

Modules:

```text
src/continuity/projection-planner-prompt.mjs
src/continuity/projection-planner-client.mjs
src/continuity/projection-plan-validator.mjs
src/continuity/projection-planner-fallback.mjs
```

Planner request must be:

- audience-filtered;
- bounded by candidate caps;
- source-backed;
- fact-id based;
- free of hidden narrator text;
- explicit about hard floors, budgets, recent rejected claims, projection hints, and fact-use stats.

Validator must reject or alter:

- unknown fact ids;
- facts not in candidate set or hard floor;
- hidden/audience-blocked facts;
- inactive facts unless historical context is allowed;
- conflict losers;
- invented values;
- model-authored hard prose;
- hard-floor demotions below minimum lane or force;
- invalid lane;
- invalid TTL;
- invalid force for authority;
- over-budget support facts;
- invalid compression groups.

Fallback order:

1. cached validated plan when input hash matches;
2. Utility planner;
3. last-good plan when source hash is compatible;
4. deterministic floor.

Exit gate:

- Tests prove hard floors survive Utility omission.
- Unknown ids and hidden facts are rejected.
- Invalid force/lane/TTL are rejected or normalized only when policy explicitly permits it.
- Utility can route facts to `guardOnly` or `auditOnly`, but cannot suppress required hard floors.
- Provider failure produces safe deterministic floor.

### Stage 7: Prompt Lane Rendering And Runtime Prompt Integration

Goal: replace ordinary prompt-context injection for continuity-critical facts with static Matrix lanes.

Primary agents: Runtime worker, Model worker, QA worker.

Modules:

```text
src/continuity/prompt-lanes.mjs
src/continuity/prompt-renderers.mjs
src/continuity/continuity-projection-service.mjs
src/continuity/index.mjs
```

Prompt lane rules:

- L0 `directive.contract`: hidden-info policy and global Directive contract.
- L1 `directive.continuity.invariants`: hard facts, no compression.
- L2 `directive.scene.active`: current scene, active location, active mission phase, present actors, immediate stakes.
- L3 `directive.continuity.domain`: crew/ship/world/mission/pressure/command support.
- L4 `directive.recap.committed`: recent committed outcomes only.
- L5 `directive.context.revolving`: rotating background and hooks.
- L6 diagnostics: never injected into narrator prompt.

Runtime integration:

- `buildPlayerSafePromptContext` consumes Matrix prompt blocks.
- `synchronizeActivePrompt` passes source frame inputs:
  - player text;
  - turn classification;
  - response strategy;
  - current scene snapshot when available;
  - present/mentioned actors;
  - recent messages;
  - current route/location/ship state.
- Prompt revision records Matrix block ids, prompt keys, hashes, source hashes, and audit summary.
- Static keys are installed with deterministic role, placement, depth, and ttl.

Exit gate:

- Prompt packets contain static Matrix lanes when campaign is active.
- Prompt sync failure clears static Matrix keys.
- Prompt revision stores enough data to inspect which facts were installed.
- Bronn and Breckenridge prompt blocks appear in the latest Sam Vickers prompt when relevant.

### Stage 8: Contradiction Guard, Retry, Repair, And Host-Native Output Observation

Goal: make projection failures actionable before bad text becomes accepted output.

Primary agents: Runtime worker, Safety worker, QA worker.

Modules:

```text
src/continuity/contradiction-guard.mjs
src/continuity/contradiction-reviewer-prompt.mjs
```

Guard layers:

1. Deterministic guard:
   - aliases;
   - predicate-specific forbidden patterns;
   - known false claim checks;
   - conflict-key checks.
2. Utility contradiction reviewer:
   - semantic review for uncertain or high-risk cases;
   - selected guard facts only;
   - no state mutation;
   - no hidden narrator leakage.

Guard actions:

- `ok`: dispatch normally.
- `warn`: dispatch and log.
- `repair`: deterministic local repair, only when narrow and player-safe.
- `retry`: do not dispatch unchanged text; regenerate or request host retry with focused player-safe correction.
- `review`: hold for review or surface developer diagnostic.

Repair is allowed only when:

- violation is local and narrow;
- replacement is player-safe;
- replacement does not require hidden facts;
- replacement does not change causal structure;
- source fact has hard or committed authority.

Host-native observation:

- Add an observation path for SillyTavern-generated assistant messages after `injectAndContinue`.
- Run contradiction guard on observed host-native output.
- If host API supports edit/regenerate/delete, apply retry/repair policy.
- If host API cannot safely repair/retry, mark recoveryRequired and surface Scene Reconciliation/diagnostic path rather than treating output as accepted continuity.

Exit gate:

- "Bronn is human" is repaired or retried before acceptance.
- "six days at impulse since leaving Utopia" is retried or blocked; unchanged text is not accepted silently.
- Host-native `injectAndContinue` replies are observed and guarded.
- Hidden-fact contradictions do not leak hidden details in retry prompts.
- Guard failures create rejected claims and projection hints.

### Stage 9: Generated-Claim Quarantine And Acceptance Paths

Goal: stop generated prose from becoming unreviewed canon while allowing player-visible world changes to become state.

Primary agents: Safety worker, Runtime worker, Director worker.

Modules:

```text
src/continuity/generated-claim-extractor.mjs
src/continuity/generated-claim-adjudicator.mjs
```

Initial high-risk claim classes:

- crew identity/species/rank/billet;
- current location/travel/elapsed time;
- ship damage/restrictions/readiness;
- mission phase/objective completion;
- deaths, injuries, casualties;
- hidden reveals;
- faction/world-state changes;
- command-log-worthy commitments.

Adjudication:

- Conflict with hard/committed fact: reject and feed guard signal.
- Plausible but unauthoritative: candidate.
- Accepted by Scene Handshake/Director/user/reconciliation: convert through owned state path.

Integrations:

- Scene Handshake settlement.
- Outcome Integrity edit/delete/swipe handling.
- Reconciliation/retcon workflows.
- Command Log summarization.
- Thread and pressure sidecars.

Exit gate:

- Generated false Bronn species and false travel claims become rejected claims.
- Valid low-risk prose remains candidate until accepted.
- Branch-local generated claims do not contaminate another branch.
- Command Log and thread summaries ignore raw unvalidated claims.

### Stage 10: Director Packets And Sidecar Cooperation

Goal: make Directors consume Matrix packets without giving the matrix outcome authority.

Primary agents: Director worker, Source frame/materializers worker, QA worker.

Modules:

```text
src/continuity/director-packets.mjs
```

Packets:

- Matrix -> Mission Director packet.
- Matrix -> Crew Director packet.
- Matrix -> Ship Director packet.
- Matrix -> Command Director packet.
- Matrix -> Narrative Thread packet.
- Matrix -> Continuity Tracker packet.
- Matrix -> Narrator prompt packet.
- Matrix -> Contradiction Guard packet.
- Matrix -> Projection Audit.

Integration points:

- pre-Director: Director-specific Matrix packet joins scene snapshot.
- post-commit: committed state invalidates projection cache and materializes changed facts.
- sidecars: domain packet enters sidecar context; sidecars remain proposal-only.
- Director returns: accepted packets/proposals become source for later materialization.

Exit gate:

- Narrator does not receive hidden Director-only facts.
- Mission Director receives mission-authorized hidden facts when allowed.
- Ship Director receives structured transit/technical facts.
- Sidecars cannot inject prompt text.
- Director packet audits explain selected and blocked facts.

### Stage 11: Adaptive Projection Control

Goal: make the matrix improve after misses without creating prompt bloat or canon drift.

Primary agents: State and storage worker, Safety worker, UI worker.

Modules:

```text
src/continuity/projection-hints.mjs
src/continuity/projection-cache.mjs
src/continuity/projection-audit.mjs
```

Projection hints:

- boost and guard;
- minimum lane;
- minimum force;
- cooldown;
- user/operator pin;
- user/operator mute;
- suppress until scene change;
- expire at revision;
- refresh on violation;
- owner: user/operator/automation/system.

Fact-use stats:

- selected count;
- recent selected count;
- guard violation count;
- recent guard violation count;
- last selected revision;
- last violation revision;
- last lane;
- last force;
- cooldown until revision.

Undershoot response:

1. Record rejected claim.
2. Boost correct fact.
3. Add guard focus.
4. Temporarily raise minimum lane/force.
5. Repair or retry current output.
6. Log omitted fact and violation.

Overshoot response:

1. Reduce boost.
2. Demote lane.
3. Move to guard-only if contradiction-sensitive.
4. Cool down soft/background facts.
5. Keep hard facts available for guard.

Exit gate:

- Recent contradictions temporarily raise prompt force and guard focus.
- Repeated unused soft facts cool down.
- User pins override cooldown within visibility rules.
- User mutes cannot suppress hard floors.
- Hints expire and are audit-visible.

### Stage 12: Diagnostics, Settings, And Operator Inspector

Goal: make the matrix debuggable without turning Settings into a bulky feature.

Primary agents: UI worker, QA worker, Agent-0.

Diagnostics:

- latest projection run;
- source hash;
- policy hash;
- prompt keys and hashes;
- selected facts;
- skipped facts;
- blocked hidden counts;
- conflict winners/losers;
- over-budget facts;
- guard facts;
- rejected claims;
- provider/model status;
- fallback reason;
- cache hit/miss.

Settings policy:

- `plannerMode`: `localOnly`, `utilityAssisted`, `utilityPrimary`, `reasoningEscalated`.
- `automationMode`: `off`, `select`, `selectPinMute`, `curateCandidates`.
- style: `careful`, `balanced`, `aggressive`.
- guard mode.
- generated-claim extraction mode.
- audit retention.

UI rules:

- compact developer/operator inspector;
- hidden facts shown as counts or safe categories in player-facing contexts;
- no raw provider prompts or hidden values;
- no large always-open panels.

Exit gate:

- Inspector can explain why Bronn species was selected, skipped, guarded, or blocked.
- Inspector can explain why Breckenridge transit was selected, skipped, guarded, or blocked.
- Settings expose policy status without encouraging ordinary users to micromanage continuity.

### Stage 13: Full Verification Suite

Goal: prove the matrix works as a system, not a collection of modules.

Primary agents: QA worker, Agent-0.

Unit tests:

- source frame;
- fact schema;
- materializers;
- conflict resolver;
- audience gates;
- broad recall;
- Utility request building;
- plan validator;
- prompt lanes;
- static prompt key clearing;
- contradiction guard;
- generated-claim adjudicator;
- projection hints;
- cache;
- audit retention.

Snapshot tests:

- fresh prompt matrix for every bundled campaign;
- Ashes Sam Vickers start with Bronn and travel facts;
- player-caused world change later projecting as branch lore;
- branch/save load with branch-specific facts;
- Utility failure fallback.

Lifecycle tests:

- disable;
- chat switch;
- save load;
- branch switch;
- failed generation;
- aborted generation;
- retry;
- Scene Handshake commit;
- outcome commit;
- edit/delete/swipe reconciliation.

Contradiction tests:

- Bronn human false claim;
- Breckenridge six-days-at-impulse false claim;
- hidden reveal leak;
- stale generated prose entering prompt;
- soft mismatch warn-only;
- travel contradiction retry-only.

Live tests:

- latest Sam Vickers/Breckenridge save;
- Bronn speaks or is described;
- travel/rendezvous timing is discussed;
- host-native generation is guarded;
- installed prompt keys and depths are inspected;
- prompt audit matches installed keys;
- rejected claim creates temporary boost.

Exit gate:

- Targeted test suite green.
- `node tools\scripts/run-alpha-gate.mjs` green.
- Live SillyTavern canary produces proof artifacts when host access is available.

### Stage 14: Documentation, Release Notes, And Cleanup

Goal: align docs after implementation and remove transitional scaffolding.

Primary agents: Agent-0, QA worker, Docs support if available.

Tasks:

- Update [CPM Design Baseline](../design/CONTINUITY_PROJECTION_MATRIX.md) with as-coded deltas.
- Update [Technical Manual](../technical/DIRECTIVE_TECHNICAL_MANUAL.md).
- Update [Player Turn Sequence](../technical/PLAYER_TURN_SEQUENCE.md).
- Update [Model Calls And Provider Routing](../technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md).
- Update [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md).
- Update [Campaign Package Schema](../packages/CAMPAIGN_PACKAGE_SCHEMA.md).
- Update [Testing Strategy](../testing/TESTING_STRATEGY.md).
- Add release-note entry.
- Remove prototype-only docs or mark them superseded.

Exit gate:

- Docs match implemented behavior.
- Documentation index points to implementation plan and as-coded docs.
- No stale prototype instructions remain as active guidance.

## Full Acceptance Criteria

CPM is complete when:

- Every active campaign prompt sync builds or reuses a validated Matrix projection.
- Every Matrix projection has an audit tied to prompt revision and source hash.
- Hard identity and travel facts for active scenes are directly visible in protected system lanes.
- Bronn is projected as Tellarite when present, mentioned, speaking, or recently contradicted.
- Bronn is not accepted as human in generated output.
- Breckenridge transit distinguishes long-haul post-Utopia travel from local impulse rendezvous maneuvers.
- The ship is not accepted as six days at impulse from Utopia unless committed campaign state actually changed.
- Host-native and Directive-owned generated outputs are guarded before acceptance.
- Retry-class continuity violations do not dispatch unchanged text.
- Generated prose cannot become prompt authority without validation.
- Utility planner selects fewer, higher-value facts than broad recall.
- Hard floors survive Utility omission.
- Unknown Utility fact ids are rejected.
- Hidden narrator-blocked facts are rejected.
- Conflict losers do not render as truth.
- Invalid lanes, TTLs, force levels, and compression groups are rejected or safely normalized by explicit policy.
- Background continuity rotates without displacing hard invariants.
- Recent contradictions raise temporary force and guard focus.
- Repeated unused soft facts cool down.
- Static and dynamic prompt keys clear reliably on lifecycle events.
- Projection cache invalidates on source hash, input hash, and policy hash changes.
- Audits explain selected, skipped, blocked, over-budget, guarded, and rejected facts without leaking hidden details.
- Director packets feed Directors without replacing Director authority.
- Sidecars remain proposal-only.
- Branch-local and swipe-local claims remain isolated until accepted into branch state.
- Full targeted tests, alpha gate, and live SillyTavern canaries pass.

## Suggested Stage Batching

If Agent-0 has enough workers:

1. Stage 0 alone.
2. Stage 1 and Stage 2 in parallel, with Agent-0 integration freeze before merge.
3. Stage 3 and Stage 4 in parallel after storage and role rails land.
4. Stage 5 and Stage 6 together, because recall and validation must agree.
5. Stage 7 and Stage 8 together only after Agent-0 freezes runtime files.
6. Stage 9 and Stage 10 in parallel after guard enforcement is stable.
7. Stage 11 and Stage 12 in parallel after audits exist.
8. Stage 13 and Stage 14 sequentially.

If running sequentially, do not skip stage gates. The failure mode this plan avoids is a prompt-only patch that appears to work in one save while leaving campaign continuity unprotected everywhere else.

## Worker Handoff Template

Every worker handoff should use this format:

```text
CPM Worker Handoff
Worker:
Stage:
Lane:
Files changed:
Contracts touched:
Tests run:
Results:
Known risks:
Required Agent-0 integration:
Do not merge until:
Next recommended slice:
```

## Agent-0 Integration Checklist

Before each stage closes, Agent-0 should verify:

- file ownership map is updated;
- no worker edited outside assigned lane without approval;
- shared files were integrated by Agent-0 or explicitly delegated;
- tests for the stage passed;
- hidden data has not entered narrator/user-facing outputs;
- model roles remain authority-bounded;
- prompt keys clear on lifecycle events touched by the stage;
- save shape changes have initialization and migration coverage;
- docs or follow-up notes record any as-coded contract deltas;
- the next stage has a clear handoff prompt.
