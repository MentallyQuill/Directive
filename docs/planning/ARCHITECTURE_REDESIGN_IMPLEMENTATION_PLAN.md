# Architecture Redesign Implementation Plan

## Status

Planned execution program for the forward-only pre-alpha architecture break described in [Architecture Redesign Proposal](ARCHITECTURE_REDESIGN_PROPOSAL.md).

This is the operating plan for implementation. The proposal defines what the target architecture is. This plan defines how to get there without turning the rewrite into an uncontrolled parallel edit of the runtime.

Directive is pre-alpha. The plan intentionally replaces the old runtime/save shape in place after importer support proves old development saves can be opened and rewritten into the new layout.

## Source Documents

Required before implementation:

- [Architecture Redesign Proposal](ARCHITECTURE_REDESIGN_PROPOSAL.md)
- [Turn Latency Audit 2026-06-28](../development/TURN_LATENCY_AUDIT_2026_06_28.md)
- [Parallel Agent Coordination Protocol](PARALLEL_AGENT_COORDINATION_PROTOCOL.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)
- [State Transactions And Recovery](../technical/STATE_TRANSACTIONS_AND_RECOVERY.md)
- [Player Turn Sequence](../technical/PLAYER_TURN_SEQUENCE.md)
- [Continuity Projection Matrix Technical Manual](../technical/CONTINUITY_PROJECTION_MATRIX.md)

Useful current code seams:

- `src/runtime/chat-turn-orchestrator.mjs`
- `src/runtime/runtime-app.mjs`
- `src/runtime/state-delta-gateway.mjs`
- `src/campaign/transaction-state.mjs`
- `src/runtime/message-reconciler.mjs`
- `src/runtime/scene-handshake-settler.mjs`
- `src/runtime/scene-reconciliation.mjs`
- `src/jobs/campaign-sidecar-scheduler.mjs`
- `src/generation/player-safe-prompt-context-builder.mjs`
- `src/directors/open-world-turn-coordinator.mjs`
- `src/storage/`
- `tools/scripts/run-alpha-gate.mjs`

## Goal

Implement the redesign as a staged replacement program with measurable gates:

1. CORE owns transaction phase and durable writes.
2. Frame is the one source provenance token for the turn.
3. SRE owns source reconciliation and stale-source settlement rules.
4. REPAIR owns edit/delete/retry/rerun/recovery state.
5. FORGE owns post-turn background generation batching, validation, and apply.
6. LENS owns prompt dirty scheduling, cache keys, host install timing, and prompt revision records.
7. External SillyTavern context-extension tools can coexist without becoming Directive authority.
8. Visible generation starts within 60 seconds after player submit.
9. A 5000-message campaign does not rewrite full history on every turn.

## Non-Negotiable Contracts

- No broad parallel rewrite of `chat-turn-orchestrator.mjs`, `runtime-app.mjs`, `state-delta-gateway.mjs`, or `transaction-state.mjs`.
- No hot-path full `payload.campaignState` rewrite after CORE Store is active.
- No new runtime behavior before schemas and instrumentation can measure the required budget.
- No migration that depends on unmeasured save-size improvement.
- No response retry may rerun mechanics.
- No dependent edited/deleted player row may re-enter normal classification.
- No stale/mismatched selected assistant source may run model-backed auto-settlement or apply state.
- No background worker may mutate state after source invalidation.
- No diagnostics-only, model-call-only, journal-only, or activity-only write may dirty prompt context.
- No external context-extension content may become committed Directive state without explicit review/approval.
- No Directive prompt clear/rebuild may clear non-Directive prompt keys.
- No hidden/ghosted message may be treated as deleted solely because an external extension changed its prompt visibility.
- No live smoke may be reported as passing architecture latency unless persisted timing records prove submit-to-generation-start.

## Operating Model

Run this from one primary Codex thread as Agent-0.

Agent-0 owns:

- current stage and stage gate;
- worker prompts;
- file ownership map;
- frozen files;
- worker handoffs;
- integration queue;
- final edits in shared files;
- final test selection;
- docs index updates;
- live smoke pass/fail calls.

Worker agents are useful, but their handoffs are evidence and patch candidates, not final integration authority. Keep only two or three workers active at a time. This redesign touches too many shared runtime files for a five-lane implementation sprint.

### Agent-0 State Board

Agent-0 should maintain this board at every stage start, worker launch, worker handoff, integration freeze, and stage close:

```text
Architecture Redesign Board
Stage:
Stage gate:
Active workers:
- <worker id/name>: <lane>, <status>, <allowed files>, <expected handoff>
Frozen files:
Integration queue:
Tests last run:
Scale proof:
Live proof:
Open blockers:
Next Agent-0 action:
```

## Agent Roster

| Lane | Default owner | Primary responsibility | Typical file scope |
| --- | --- | --- | --- |
| Orchestration and integration | Agent-0 | stage control, worker prompts, freeze windows, shared-file edits, docs index, final verification | `docs/DOCUMENTATION_INDEX.md`, planning docs, alpha gate, shared runtime/storage/host integration files |
| Contracts and metrics | Worker A or Agent-0 | Frame/CORE/event/head/manifest schemas, timing/write counters, fixtures | `schemas/`, `tools/scripts/test-*`, new runtime contract helpers |
| CORE storage | Worker B after contracts freeze | v2 storage layout, segment writer, manifest-last commit, checkpoints, old-save importer | `src/storage/`, storage tests, importer tests |
| CORE runtime | Agent-0 or one runtime worker | transaction phase runtime, fast gate, visible response lane, mechanics/narration split | `src/runtime/chat-turn-orchestrator.mjs`, `src/runtime/runtime-app.mjs`, response dispatch integration |
| Mechanics and open-world reducers | Worker C after CORE API freeze | replace broad `rootsSet`, bounded operation/event reducers, checkpoint-backed branch/replay | `src/campaign/transaction-state.mjs`, `src/directors/open-world-turn-coordinator.mjs`, mission/open-world tests |
| REPAIR and SRE | Worker D after Frame/CORE skeleton | latest-boundary recovery, source invalidation, selected-swipe/range source integrity, settlement facade | `src/runtime/message-reconciler.mjs`, `src/runtime/scene-handshake-settler.mjs`, `src/runtime/scene-reconciliation.mjs` |
| FORGE and LENS | Worker E after CORE background effects | background batch coordinator, one apply/journal/prompt rebuild, dirty-domain scheduler | `src/jobs/`, `src/generation/player-safe-prompt-context-builder.mjs`, generation-router tests |
| QA and live proof | Worker F or Agent-0 | targeted test matrix, alpha-gate additions, scale reports, SillyTavern live smoke scripts/results | `tools/scripts/`, `docs/testing/`, live smoke artifacts |

If agent capacity is limited, use this priority:

1. Agent-0 plus Contracts/Metrics.
2. Agent-0 plus CORE Storage.
3. Agent-0 plus CORE Runtime.
4. Agent-0 plus one REPAIR/SRE worker.
5. Agent-0 plus one FORGE/LENS worker.
6. QA worker only when deterministic gates are ready to prove.

## Reserved Files

Agent-0 should normally own or integrate final edits in:

- `docs/DOCUMENTATION_INDEX.md`
- `docs/planning/ARCHITECTURE_REDESIGN_PROPOSAL.md`
- `docs/planning/ARCHITECTURE_REDESIGN_IMPLEMENTATION_PLAN.md`
- `tools/scripts/run-alpha-gate.mjs`
- `src/runtime/runtime-app.mjs`
- `src/runtime/chat-turn-orchestrator.mjs`
- `src/runtime/state-delta-gateway.mjs`
- `src/campaign/transaction-state.mjs`
- `src/storage/`
- host contracts under `src/hosts/`
- prompt install paths under `src/generation/` and host prompt adapters
- final REPAIR, SRE, FORGE, and LENS integration entrypoints

Workers may inspect these files freely. They should edit them only when Agent-0 explicitly assigns the file and freezes conflicting lanes.

## Freeze Rules

Agent-0 must issue an integration freeze before:

- changing save shape;
- changing v2 file names;
- changing transaction phase names;
- changing event taxonomy;
- changing Frame schema;
- changing CORE Store commit order;
- changing prompt install lifecycle;
- changing host generation interception or handoff;
- changing REPAIR latest-boundary policy;
- replacing Scene Handshake/Reconciliation entrypoints;
- replacing sidecar apply/prompt-sync semantics;
- adding alpha-gate tests;
- running live SillyTavern proof.

Freeze prompt:

```text
Integration freeze. Stop after your current command. Do not edit files until I release the freeze. Send a handoff with files changed, tests run, known risks, and integration requests.
```

Release prompt:

```text
Freeze released. Resume only the scoped task below. Do not touch the files listed as reserved for this integration window.
```

## Stage Overview

| Stage | Name | Primary gate |
| --- | --- | --- |
| 0 | Baseline And Control Board | current alpha gate and dirty worktree recorded |
| 1 | Contracts And Metrics | schemas and measurement tests land before behavior |
| 2 | Scale Harness | 5000-message and write-count tests exist before migration |
| 3 | V2 Storage Substrate | segments, manifests, checkpoints, importer prove load/write |
| 4 | CORE Store | typed transactions replace direct ledger writes behind API |
| 5 | Frame And Fast Gate | hostContinue release is fast and measured |
| 6 | Mechanics/Narration Split | directiveCommit starts narration under budget |
| 7 | REPAIR Skeleton | dependent edit/delete cannot cycle through normal turns |
| 8 | SRE | settlement/reconciliation share source integrity rules |
| 9 | LENS | prompt dirtying and external prompt-environment diagnostics are explicit |
| 10 | FORGE | background work batches one apply, one journal bundle, one prompt rebuild |
| 11 | Open-World Reducers | broad `rootsSet` and full packet retention are gone |
| 12 | Migration Cutover | old write paths removed or gated off |
| 13 | Scale And Live Proof | synthetic and live evidence prove the hard goals |
| 14 | Documentation And Cleanup | old docs are updated or marked superseded |

## Stage 0: Baseline And Control Board

Goal: lock the starting point so the redesign is measured against known behavior.

Owner: Agent-0, optional QA worker.

Tasks:

- Inspect `git status --short`.
- Record current uncommitted files and which are user/Agent-0 owned.
- Run focused docs checks if docs are dirty.
- Run current targeted tests relevant to any already-modified runtime/storage files.
- Run `node tools\scripts\run-alpha-gate.mjs` if implementation is about to begin.
- Record whether local SillyTavern is available and which non-human soak user should be used for later live proof.
- Open an Architecture Redesign Board in the primary thread.

Exit gate:

- Current baseline is known.
- Shared files are assigned to Agent-0 or frozen.
- No worker starts coding without a lane, allowed file list, and expected handoff.

Do not delegate:

- final baseline interpretation;
- current dirty-worktree ownership;
- live-host credential/user decisions.

## Stage 1: Contracts And Metrics

Goal: make the target measurable before runtime behavior changes.

Owner: Agent-0 or Contracts/Metrics worker.

Inputs:

- Frame schema from the proposal.
- CORE transaction fields and phases.
- SRE, REPAIR, FORGE, and LENS event contracts.
- Latency instrumentation fields in the proposal.

Tasks:

- Add schema/shape fixtures for Frame, range Frame, CORE transaction, event record, turn segment, diagnostics segment, manifest, materialized head, checkpoint, host map, and prompt cache.
- Add schema/shape fixtures for `ExternalContextProfile`, `ExternalPromptEnvironment`, and redacted external context diagnostics.
- Add test helpers for stable JSON byte counts.
- Add fake storage write counters for full-save rewrites, segment writes, head writes, manifest writes, and diagnostics writes.
- Add timing helpers for `playerSubmittedAt`, `turnObservedAt`, `routeDecidedAt`, `hostGenerationReleasedAt`, `directiveGenerationStartedAt`, `visibleResponsePostedAt`, and `backgroundSettledAt`.
- Add no-behavior-change tests proving the instrumentation helpers can report generation-start latency separately from provider completion.
- Add no-behavior-change host fixtures for native ST Lorebooks, Memory Books/STMB markers, Summaryception metadata/ghosting, and VectFox prompt/interceptor signals.

Suggested tests:

- `test-architecture-redesign-schemas.mjs`
- `test-turn-latency-metrics.mjs`
- `test-storage-write-counters.mjs`

Exit gate:

- Schema tests pass.
- Instrumentation can represent both `hostContinue` and `directiveCommit`.
- External context fixtures can represent installed-extension prompt and visibility state without storing raw external prompt bodies or secrets.
- No runtime hot path has been rewritten yet.

Agent use:

- One contracts worker can draft schemas and tests.
- Agent-0 integrates schemas and reserves names.

## Stage 2: Scale Harness

Goal: fail early if the v2 architecture cannot meet the 5000-message contract.

Owner: QA/Performance worker, separate from CORE implementation.

Tasks:

- Build a synthetic 5000-message campaign fixture generator.
- Include realistic but bounded command logs, threads, quests, crew/ship state, host map entries, diagnostics stubs, sidecar summaries, and prompt revisions.
- Include bounded external context diagnostics for active World Info, Memory Books entry counts, Summaryception ghosted rows, and VectFox prompt/interceptor state.
- Build a v1 large-save fixture that includes `runtimeTracking.history`, `turnLedger.entries`, model-call journal, sidecar journal, and nested retained packet shapes.
- Assert proposal targets:
  - materialized head <= 8 MB minified JSON;
  - save manifest <= 50 KB;
  - host map <= 5 MB excluding raw chat text;
  - event segment rolls over at <= 2 MB;
  - diagnostics segment rolls over at <= 5 MB;
  - hot-path full-save rewrites = 0;
  - writes before generation start <= 1 small transaction write.

Suggested tests:

- `test-storage-scale-5000.mjs`
- `test-old-save-importer-fixture.mjs`
- `test-event-segment-rollover.mjs`

Exit gate:

- Scale harness exists and fails against naive full-save rewrites.
- CORE Store work cannot close until this harness passes.

Agent use:

- Delegate fixture generation and assertions to QA.
- Do not delegate target threshold changes.

## Stage 3: V2 Storage Substrate

Goal: create the storage layer CORE can use without rewriting the full save.

Owner: CORE Storage worker, single owner.

Tasks:

- Add logical keys for campaign manifest, materialized head, events segment, turns segment, diagnostics segment, prompt cache, host map, save manifest, and checkpoint.
- Add segment read/write APIs.
- Support bounded segment rewrites for hosts without append semantics.
- Implement manifest-last commit order.
- Add checkpoint writer and loader.
- Add old-save importer from v1 `payload.campaignState` into v2 head/event/checkpoint/manifest layout.
- Keep old load path available only as importer input.

Commit order:

```text
write new event/turn/diagnostic/checkpoint blobs
verify hashes
write compact head when required
write save/campaign manifest pointer last
refresh derived indexes
```

Suggested tests:

- `test-transaction-store-v2.mjs` storage substrate section;
- `test-old-save-importer-v2.mjs`;
- `test-logical-storage-paths.mjs`;
- `test-logical-storage-adapter.mjs`;
- `test-sillytavern-file-api.mjs` if SillyTavern path behavior changes.

Exit gate:

- Old full save can load and write v2 layout.
- No runtime route is required to use v2 yet.
- Segment write fallback is hidden behind the storage API.

Single-owner files:

- `src/storage/*`
- storage path helpers
- importer helpers
- storage tests

## Stage 4: CORE Store

Goal: introduce the transaction/event API as the single durable writer.

Owner: Agent-0 plus CORE Store worker. Agent-0 integrates final runtime seams.

Tasks:

- Implement CORE Store APIs:
  - `beginTurn(sourceFrame)`;
  - `advanceTurn(txnId, phasePatch)`;
  - `commitMechanics(txnId, operationBundle)`;
  - `recordVisibleResponse(txnId, responseRef)`;
  - `markRecoveryRequired(txnId, recoveryBundle)`;
  - `commitBackgroundBatch(txnId, operationBundle)`;
  - `appendDiagnostics(txnId, diagnosticsEvent)`.
- Expose read projections for ingress ledger, response ledger, turn ledger, recovery journal, model-call diagnostics, and sidecar diagnostics.
- Add revision split:
  - mechanics revision;
  - runtime revision;
  - diagnostic revision;
  - prompt revision.
- Move diagnostics to diagnostics segments.
- Prohibit direct new writes to old ledger helpers outside CORE Store.

Suggested tests:

- `test-turn-transaction-runtime.mjs` phase/store subset;
- `test-transaction-store-v2.mjs`;
- `test-model-call-diagnostics-segments.mjs`;
- `test-state-delta-gateway.mjs` updated only after equivalent CORE behavior exists.

Exit gate:

- CORE Store can record a synthetic turn without writing full campaign state.
- Read projections can power existing UI/test callers during migration.
- Diagnostics do not advance mechanics revision.
- No `runtimeTracking.history[].snapshot` write in the new path.

Do not delegate:

- final transaction phase semantics;
- final API names;
- final compatibility/read-projection behavior.

## Stage 5: Frame And Fast Gate

Goal: make hostContinue fast before deeper systems are migrated.

Owner: one runtime worker, integrated by Agent-0.

Tasks:

- Build Frame from host event.
- Attach a compact external prompt-environment reference or unknown-state marker to the Frame without blocking the fast gate on deep extension inspection.
- Normalize accepted assistant variant once at host/source boundary.
- Add latest-boundary precheck before classification.
- Dedupe source revision by chat id, host message id, and text hash.
- Route by deterministic checks first.
- Use Utility classification only when deterministic checks are insufficient.
- Return `hostContinue`, `directiveCommit`, `directivePause`, or `recoveryReview`.
- For ordinary `hostContinue`, release host generation without waiting for model-backed SRE, advisory generation, LENS rebuild, FORGE, thread extraction, or Command Log summary.
- Record Directive-owned prompt revision used by released host generation, plus whether the final SillyTavern prompt may include external host prompt material.

Suggested tests:

- `test-chat-turn-orchestrator.mjs`;
- `test-turn-intent-classifier-fixtures.mjs`;
- `test-turn-transaction-runtime.mjs`;
- `test-sillytavern-event-wiring.mjs`;
- controlled slow Utility provider test.

Exit gate:

- Deterministic hostContinue generation release target < 10 seconds.
- Hard under-60-second generation-start assertion exists.
- Edits/deletes/stale source can route to REPAIR review instead of normal classification.
- HostContinue does not wait for native WI scans, Summaryception, VectFox retrieval, or other external extension inspection owned by SillyTavern.

Risk files:

- `src/runtime/chat-turn-orchestrator.mjs`
- `src/hosts/sillytavern/runtime-bridge.mjs`
- `src/hosts/sillytavern/shell-events.js`

## Stage 6: Mechanics/Narration Split

Goal: make directiveCommit start narration quickly after mechanics commit.

Owner: runtime/mechanics worker, integrated by Agent-0.

Tasks:

- Split `commitMechanics` from narration generation.
- Commit bounded mechanics events/operations before narration.
- Record `directiveGenerationStartedAt` before awaiting provider completion.
- Move Command Log assisted summary out of mechanics commit and into FORGE.
- Ensure response retry reuses outcome id and response idempotency key.
- Keep provider completion latency separate from architecture latency.

Suggested tests:

- `test-runtime-director-turn.mjs`;
- `test-runtime-stage9-turn-loop.mjs`;
- `test-transaction-state.mjs`;
- `test-command-log-summary-sidecar.mjs`;
- controlled slow narration provider test.

Exit gate:

- Directive-owned narration generation starts under 60 seconds in deterministic slow-provider tests.
- Retry response does not rerun mechanics.
- Provider failure after mechanics enters REPAIR-compatible response retry state.

## Stage 7: REPAIR Skeleton

Goal: stop the edited-message loop before source settlement is deeply refactored.

Owner: REPAIR worker, Agent-0 final integration.

Tasks:

- Create REPAIR service boundary around edit/delete/retry/rerun/rollback decisions.
- Route host edit/delete/swipe/Stop/chat-change events through REPAIR.
- Normalize visibility-only host mutations separately from source mutations, including `is_hidden`, Summaryception `extra.sc_ghosted`, Summaryception `ghostedIndices`, VectFox prompt ghosting, and Memory Books hide/unhide behavior.
- Enforce latest-boundary rule:
  - latest player row with no dependent assistant may restart same transaction;
  - edited/deleted player row with dependent assistant or committed outcome enters recovery case;
  - response retry reuses same outcome/idempotency;
  - rerun outcome creates explicit branch/checkpoint candidate.
- Keep existing invalidation helpers temporarily, but remove policy decisions from scattered callers.
- Cancel queued background work for invalidated source tokens.
- Keep hidden/ghosted rows available for source identity, selected-swipe checks, and recovery decisions unless the host actually deleted them.

Suggested tests:

- `test-message-recovery.mjs`;
- `test-recovery-director.mjs`;
- `test-sillytavern-message-actions.mjs`;
- `test-sillytavern-runtime-lifecycle.mjs`;
- Sam Vickers edited-message fixture based on the turn-latency audit.
- Summaryception ghosted player/assistant row fixtures.
- Memory Books hide/unhide visibility fixtures.

Exit gate:

- Edited dependent player row cannot produce a replacement classified ingress.
- Recovery case has one owner and one visible product path.
- Sam Vickers loop cannot reproduce in deterministic fixture.
- Ghosted or hidden rows do not create false deletes, false latest-boundary gaps, or normal-turn reobserve loops.

## Stage 8: SRE

Goal: unify Scene Handshake and Scene Reconciliation source rules behind one source-integrity service.

Owner: SRE worker.

Tasks:

- Add SRE facade.
- Move selected-variant integrity guard into SRE.
- Support modes:
  - `latestPair`;
  - `explicitRange`;
  - `recoveryRepair`.
- Compose range Frames for explicit transcript ranges.
- Hard-skip stale/mismatch before provider call and before apply.
- Emit bounded settlement events and prompt dirty domains.
- Keep extraction prompts/modes separate internally.
- Let REPAIR own rollback/replay/branch decisions.

Suggested tests:

- `test-source-settlement-service.mjs`;
- `test-scene-handshake-settler.mjs`;
- `test-scene-reconciliation*.mjs`;
- selected-swipe stale/mismatch fixture;
- wrong-chat/wrong-save/range-hash drift fixture.

Exit gate:

- Accepted selected swipe is the only assistant-prose continuity source.
- Stale/mismatched integrity never triggers auto-commit.
- Edited dependent rows route to REPAIR, not settlement auto-apply.

## Stage 9: LENS

Goal: make prompt rebuilds deliberate, coalesced, and cacheable.

Owner: LENS/CPM worker.

Tasks:

- Add prompt dirty-domain model:
  - identity;
  - sceneTime;
  - missionQuestThread;
  - crewShipRelationship;
  - command;
  - continuity;
  - sourceBinding;
  - terminalRecovery.
- Add external prompt-environment model:
  - active native ST World Info/lorebook names and settings hash;
  - chat-bound `chat_metadata.world_info` value;
  - Memory Books/STMB active marker, entry count/hash, and risky mode flags;
  - Summaryception enabled state, prompt key state, `summarizedUpTo`, layer counts, ghosted count, and injection hash;
  - VectFox enabled state, prompt keys, position/depth, backend type, semantic WI state, summarizer injection state, ghosting state, and redacted vector settings;
  - unknown/unavailable state for hosts or users where a signal cannot be inspected safely.
- Route prompt dirty emissions from CORE Store commits.
- Move scattered `synchronizeActivePrompt` calls behind LENS scheduling.
- Split base CPM cache from turn-local prompt-frame overlays.
- Record when a visible generation used a prior prompt revision.
- Rename or annotate prompt revision fields so they mean Directive-owned context revision, not complete final SillyTavern prompt.
- Record external prompt environment snapshots in diagnostics/cache metadata without storing raw external prompt bodies.
- Ensure Directive prompt clear/rebuild calls clear only `directive.*` keys and never clear `summaryception`, `3_vectfox*`, native World Info, Memory Books entries, or other host-owned prompt keys.
- Add prompt-order diagnostics for Directive lanes versus ST World Info before/after/at-depth/role positions.
- Add compatibility warnings for:
  - active native Lorebooks;
  - Memory Books auto-summary, side prompts, auto-hide/unhide, and at-depth user/assistant entries;
  - Summaryception ghosted rows or stale summary ranges;
  - VectFox enabled injection, generation interceptor, Qdrant/cloud backend, or prompt ghosting.
- Ensure diagnostics-only writes do not dirty prompt.
- Guard against fact-use stats self-invalidating cache keys.

Suggested tests:

- `test-prompt-dirty-domains.mjs`;
- `test-external-prompt-environment.mjs`;
- `test-host-prompt-key-coexistence.mjs`;
- `test-player-safe-prompt-context.mjs`;
- CPM prompt/cache tests;
- host prompt adapter lifecycle tests.

Exit gate:

- One visible-lane prompt rebuild at most.
- One background-batch prompt rebuild at most.
- No rebuild for diagnostics-only writes.
- HostContinue can honestly record next-generation prompt rebuild.
- External prompt keys survive Directive prompt rebuild and clear.
- Prompt diagnostics distinguish Directive-owned context from external host prompt material.

## Stage 10: FORGE

Goal: make background work efficient, cancelable, and non-blocking.

Owner: FORGE worker.

Tasks:

- Add FORGE coordinator API.
- Keep worker prompts and schemas typed and separate.
- Preflight source token before provider calls.
- Pass abort signals through generation routing/batch where possible.
- Parse and validate worker outputs.
- Recheck source token before apply.
- Detect cross-effect path conflicts.
- Apply accepted effects as one CORE Store background transaction.
- Write one journal/diagnostics bundle.
- Ask LENS for one prompt rebuild if dirty.
- Move Command Log assisted summary, Narrative Thread extraction, quest/background architecture, and advisory enrichment into FORGE when not visible-blocking.
- Keep external summarizers/vectorizers outside FORGE by default. Summaryception, Memory Books, and VectFox may coexist as external tools, but their outputs are not FORGE results unless a future reviewed-import flow explicitly converts them into Directive proposals.
- Define a future optional approved-artifact export seam for vector tools: public Command Log summaries, mission components, reviewed CPM evidence, or other player-safe artifacts tagged with campaign/save/chat/source metadata.
- Record when external generation, retrieval, or summarization may be running outside Directive's generation router so latency and provider-call diagnostics are not misattributed to FORGE.

Suggested tests:

- `test-background-projection-batch.mjs`;
- `test-campaign-sidecar-scheduler.mjs`;
- `test-command-log-summary-sidecar.mjs`;
- `test-generation-router.mjs`;
- `test-host-sidecar-orchestrator.mjs`;
- stale-cancellation fixture.
- external Summaryception/Memory Books/VectFox coexistence fixture proving FORGE does not ingest their outputs automatically.

Exit gate:

- One FORGE run produces at most one state transaction and one prompt rebuild.
- Stop/edit/delete cancels queued background workers.
- External summarizer/vectorizer output is either ignored as external prompt context or enters a review/import proposal; it never commits as Directive state automatically.
- In-flight unabortable provider output becomes diagnostics-only if stale.

## Stage 11: Open-World Reducers

Goal: remove broad state replacement and retained full-packet pressure.

Owner: mechanics/open-world worker, single owner.

Tasks:

- Replace open-world `rootsSet` output with bounded event/reducer operations.
- Convert quest, thread, world boundary, reaction, and story milestone updates into typed events.
- Remove full retained `snapshotBefore` dependency where checkpoint/inverse op is sufficient.
- Ensure branch, replay, and terminal checkpoints use checkpoint ids.
- Keep Mission Director tactical adjudication separate from open-world reducers.

Suggested tests:

- `test-open-world-event-reducers.mjs`;
- `test-open-world-director-coordinator-contracts.mjs`;
- `test-open-world-dynamic-quest-e2e.mjs`;
- `test-open-world-thread-engine.mjs`;
- `test-transaction-state.mjs`.

Exit gate:

- No new turn packet stores broad root replacement state.
- No `runtimeTracking.history[].snapshot` in v2 hot path.
- Open-world fixture tests prove equivalent state outcomes.

## Stage 12: Migration Cutover

Goal: stop writing the old architecture.

Owner: Agent-0.

Tasks:

- Switch runtime write path to v2 by default.
- Keep v1 importer as load-only development convenience.
- Remove or hard-fail old full-save hot-path writes in runtime turns.
- Remove direct old ledger mutation from migrated paths.
- Update tests that expected old `runtimeTracking` ledger roots.
- Update runtime panels to consume compact projections or diagnostics segments.
- Update docs that describe `runtimeTracking` as the durable ledger container.

Suggested tests:

- all new v2 tests;
- old-save importer tests;
- storage/load/save tests;
- UI projection tests;
- `node tools\scripts\run-alpha-gate.mjs`.

Exit gate:

- A v1 save loads and rewrites into v2.
- A v2 save reloads without old hot-path payload behavior.
- Current runtime uses CORE Store by default.

## Stage 13: Scale And Live Proof

Goal: prove the hard requirements in deterministic and real-host environments.

Owner: Agent-0 plus QA worker.

Deterministic gates:

- `test-storage-scale-5000.mjs`;
- `test-turn-transaction-runtime.mjs`;
- `test-transaction-store-v2.mjs`;
- `test-recovery-director.mjs`;
- `test-background-projection-batch.mjs`;
- `test-prompt-dirty-domains.mjs`;
- `node tools\scripts\verify-repo-structure.mjs`;
- `node tools\scripts\run-alpha-gate.mjs`.

Live SillyTavern proof should happen twice:

1. After CORE Store plus Fast Gate can persist generation-start timing.
2. After REPAIR and FORGE cancellation exist.

Required live evidence:

- served extension is current;
- `playerSubmittedAt`;
- `routeDecidedAt`;
- `hostGenerationReleasedAt` or `directiveGenerationStartedAt`;
- `visibleResponsePostedAt`;
- active head size;
- event segment size;
- diagnostics segment size;
- Directive context revision/hash used by visible generation;
- external prompt environment snapshot: native World Info active state, Memory Books/STMB markers, Summaryception state, VectFox enabled/injection state, and unknown/unavailable signals;
- list of external prompt keys observed or explicitly not inspectable;
- confirmation that Directive clear/rebuild touched only `directive.*` prompt keys;
- canceled background jobs after edit/delete;
- no hot-path full-save rewrite.

Live scope:

- SillyTavern is the active pre-alpha host gate.
- Lumiverse is future host-neutral design pressure, not an active pass/fail gate for this redesign.
- Use non-human soak users for live proof unless the reported bug is specifically in the human default user context.
- Run one live coexistence pass with installed native Lorebooks, Memory Books, Summaryception, and VectFox present in the SillyTavern profile. VectFox may be disabled for the pass, but the diagnostics must record disabled-present state.
- If VectFox is enabled for a pass, record external interceptor/retrieval latency separately from Directive architecture latency and redact Qdrant/API-key settings.

Exit gate:

- 5000-message synthetic campaign passes size/write/load/replay targets.
- HostContinue and directiveCommit generation-start targets pass under controlled provider latency.
- Live proof records persisted transaction timing, not only chat output.
- Live proof records external context-extension state without treating external context as Directive authority.

## Stage 14: Documentation And Cleanup

Goal: make the new architecture discoverable and remove stale instructions.

Owner: Agent-0, optional docs worker.

Tasks:

- Update [Documentation Index](../DOCUMENTATION_INDEX.md).
- Update or supersede [State Transactions And Recovery](../technical/STATE_TRANSACTIONS_AND_RECOVERY.md).
- Update [Player Turn Sequence](../technical/PLAYER_TURN_SEQUENCE.md).
- Update [Testing Strategy](../testing/TESTING_STRATEGY.md) with new v2 tests and live proof.
- Add an external context-extension compatibility note covering ST Lorebooks, Memory Books, Summaryception, and VectFox.
- Update operator-facing language only after runtime behavior exists.
- Mark old Scene Handshake/Reconciliation/sidecar docs with the new SRE/FORGE framing.
- Remove obsolete implementation-plan caveats once cutover is complete.

Exit gate:

- Docs index points to proposal and implementation plan.
- Technical docs reflect current v2 behavior.
- No stale doc says hot-path runtime writes full campaign saves.

## Agent Prompt Templates

### Contracts Worker

```text
You are the Contracts worker for Directive Architecture Redesign. Read docs/planning/ARCHITECTURE_REDESIGN_PROPOSAL.md and docs/planning/ARCHITECTURE_REDESIGN_IMPLEMENTATION_PLAN.md. Your lane is schemas, metrics, and no-behavior-change tests only. Do not edit runtime hot paths. Own only the files Agent-0 lists. Handoff with schemas added, tests added, commands run, and any contract questions.
```

### CORE Storage Worker

```text
You are the CORE Storage worker. Your lane is v2 storage substrate, segment APIs, manifest-last commit, checkpoints, and old-save importer. Do not edit chat-turn-orchestrator, runtime-app, state-delta-gateway, or transaction-state unless Agent-0 explicitly assigns them. Handoff with changed files, storage invariants, tests run, and migration risks.
```

### CORE Runtime Worker

```text
You are the CORE Runtime worker. Your lane is Frame creation, fast gate, visible response timing, and mechanics/narration split for the specific slice Agent-0 assigns. Do not touch SRE, REPAIR, FORGE, or LENS internals unless assigned. Handoff with route timing evidence, exactly-one-response evidence, tests run, and shared-file integration needs.
```

### REPAIR/SRE Worker

```text
You are the REPAIR/SRE worker. Your lane is latest-boundary recovery and source-integrity settlement. REPAIR owns edit/delete/retry/rerun decisions. SRE owns source integrity and settlement modes. Do not edit prompt install, sidecar batch apply, or storage substrate. Handoff with recovery cases covered, stale-source guards, tests run, and integration requests.
```

### FORGE/LENS Worker

```text
You are the FORGE/LENS worker. Your lane is background batch coordination, prompt dirty scheduling, and external prompt-environment diagnostics. Keep worker prompts/schemas typed and separate. Do not change mechanics commit or REPAIR policy. Do not clear non-Directive prompt keys or import external extension memory as Directive state. Handoff with batch apply count, prompt rebuild count, external prompt key coexistence evidence, cancellation behavior, tests run, and any generation-router changes needed.
```

### QA Worker

```text
You are the QA worker. Your lane is deterministic gates, scale fixtures, external context-extension fixtures, alpha-gate additions by assignment, and live-proof planning. Do not change product behavior unless Agent-0 assigns a test-only hook or fixture helper. Handoff with exact commands, pass/fail output summaries, artifacts written, redaction checks, and residual risks.
```

## Integration Checklist

Before closing any stage:

- Worker handoffs are received.
- Agent-0 inspected changed files.
- Targeted tests for the lane pass.
- `git diff --check` exits cleanly, ignoring CRLF warnings only when exit code is zero.
- `node tools\scripts\verify-repo-structure.mjs` passes when docs or scaffold files changed.
- `node tools\scripts\run-alpha-gate.mjs` runs after meaningful runtime/storage integration.
- Architecture Redesign Board is updated.
- Frozen files are either released or carried forward explicitly.

Before live proof:

- Installed SillyTavern extension copy is confirmed current.
- Non-human soak user is selected unless default-user is required.
- Deterministic gates for the touched behavior pass.
- Live script records persisted transaction artifacts.
- Provider completion time and architecture generation-start time are reported separately.
- External context diagnostics redact secrets and raw external prompt/vector payloads.

## Final Success Criteria

The redesign implementation is complete when:

1. CORE is the only runtime durable writer for turn work.
2. Frame is the only source provenance token consumed by CPM, SRE, REPAIR, FORGE, and LENS.
3. SRE and REPAIR prevent stale-source, selected-swipe, edit/delete, and dependent-response loops.
4. FORGE applies accepted background work as one batch transaction and one prompt rebuild.
5. LENS coalesces prompt rebuilds and records prompt revision usage honestly.
6. Known external context-extension tools can coexist: ST Lorebooks, Memory Books, Summaryception, and VectFox are observed/redacted, not cleared, imported, or treated as Directive authority.
7. Open-world mechanics commit bounded events/operations instead of broad root replacement.
8. No hot-path full-save rewrite remains.
9. 5000-message synthetic scale gates pass.
10. HostContinue and directiveCommit generation start within the required under-60-second architecture budget.
11. Live SillyTavern proof confirms persisted timing, segment sizes, Directive context revision, external context-extension state, and stale-work cancellation.
