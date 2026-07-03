# Architecture Redesign Implementation Plan

## Status

Planned execution program for the forward-only pre-alpha architecture break described in [Architecture Redesign Proposal](ARCHITECTURE_REDESIGN_PROPOSAL.md).

This is the operating plan for implementation. The proposal defines what the target architecture is. This plan defines how to get there without turning the rewrite into an uncontrolled parallel edit of the runtime.

Directive is pre-alpha. The plan intentionally replaces the old runtime/save shape in place after importer support proves old development saves can be opened and rewritten into the new layout.

Pre-alpha cutover rule: implement the best current architecture in place. Do not preserve legacy runtime behavior, save-shape behavior, public helper names, old tests, or stale docs for old users or old code once the new owner is available. Transitional importers, manual checkpoint readers, and compatibility projections are allowed only as temporary migration tools with an owner, a removal gate, and tests proving they do not remain runtime authority.

## Source Documents

Required before implementation:

- [Architecture Redesign Proposal](ARCHITECTURE_REDESIGN_PROPOSAL.md)
- [Turn Latency Audit 2026-06-28](../development/TURN_LATENCY_AUDIT_2026_06_28.md)
- [Parallel Agent Coordination Protocol](PARALLEL_AGENT_COORDINATION_PROTOCOL.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)
- [State Transactions And Recovery](../technical/STATE_TRANSACTIONS_AND_RECOVERY.md)
- [Player Turn Sequence](../technical/PLAYER_TURN_SEQUENCE.md)
- [Continuity Projection Matrix Technical Manual](../technical/CONTINUITY_PROJECTION_MATRIX.md)
- Narrative Engine chat review and local reference-code inspection: use as a design reference for recall, budget lanes, witness scope, scene seals, and correction workflow, not as a port target.

Live audit inputs that must become fixtures or gates:

- Turn 29 / chat row 30 counsel handoff: `hostContinue` release must not await model-backed Scene Handshake, advisory enrichment, prompt rebuild, sidecars, or full-save persistence before generation start.
- Chat row 31 assistant response: diagnostics must distinguish visible chat row, host message id, ingress id, response id, and CORE transaction id instead of treating adjacent rows as turns.
- Turn 31 / chat row 32 committed outcome: `directiveCommit` proof must record narration generation start before provider completion and separate post-visible background settlement from response posting.
- Edited retry after `Sam waited for her reply.`: dependent edited player rows must enter REPAIR review/rollback/replacement and cannot create replacement classified ingress as normal turns.
- 73 MB save around low-30s chat rows: the 5000-message scale harness must fail any design that keeps full campaign state, runtime history, retained snapshots, or broad `rootsSet` deltas in hot-save rewrites.

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
- `src/retrieval/recall-lanes.mjs`
- `src/retrieval/dataset-index.mjs`
- `src/retrieval/card-hydration.mjs`
- `src/runtime/define-selection.mjs`
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
7. Recall Index gives LENS/SRE/REPAIR/FORGE deterministic access to long-campaign evidence without transcript duplication.
8. LENS prompt budget lanes make prompt inclusion, omissions, and cache inputs explicit.
9. Continuity facts carry witness/knowledge scope through `knownBy`, `witnessedBy`, `subjectIds`, and `disclosureState`.
10. FORGE scene/phase seals compact long scenes into source-linked summaries, facts, open threads, callbacks, and recall entries.
11. Correct-as-Swipe uses SRE/REPAIR evidence before appending candidate assistant swipes.
12. External SillyTavern context-extension tools can coexist without becoming Directive authority.
13. Visible generation starts within 60 seconds after player submit.
14. A 5000-message campaign does not rewrite full history on every turn.

## Non-Negotiable Contracts

- No broad parallel rewrite of `chat-turn-orchestrator.mjs`, `runtime-app.mjs`, `state-delta-gateway.mjs`, or `transaction-state.mjs`.
- No hot-path full `payload.campaignState` rewrite after CORE Store is active.
- No new runtime behavior before schemas and instrumentation can measure the required budget.
- No migration that depends on unmeasured save-size improvement.
- No permanent legacy compatibility layer after a replacement owner is proven. Old APIs, aliases, fixtures, and docs should be rewritten or removed in the same cutover wave rather than kept as parallel supported behavior.
- No response retry may rerun mechanics.
- No dependent edited/deleted player row may re-enter normal classification.
- No stale/mismatched selected assistant source may run model-backed auto-settlement or apply state.
- No background worker may mutate state after source invalidation.
- No dual-write bridge may solve one split-brain case by creating the opposite case. CORE/FORGE must not commit durable accepted work before the old bridge apply is proven commit-safe or compensable, and old ledgers/state must not commit durable accepted work before CORE/FORGE settlement is proven commit-safe or compensable.
- No diagnostics-only, model-call-only, journal-only, or activity-only write may dirty prompt context.
- No Recall Index, scene seal, prompt budget trace, or correction case may store raw transcript text, raw prompt text, raw provider output, external generated memory, Summaryception summary text, vector hit payloads, embeddings, or secrets.
- No optional semantic/vector candidate may become committed Directive truth without a Frame/CORE/package/reviewed-import evidence ref.
- No candidate correction swipe may mutate accepted continuity until the selected assistant variant changes and SRE/REPAIR process that source mutation.
- No external context-extension content may become committed Directive state without explicit review/approval.
- No Directive prompt clear/rebuild may clear non-Directive prompt keys.
- No Directive runtime path may call Memory Books internals or use Memory Books hide/unhide flows to maintain Directive state.
- No certification gate may require a Memory Books-specific prompt key; proof must accept ST World Info entries, STMB metadata, chat-bound `world_info`, and range diagnostics.
- No hidden/ghosted message may be treated as deleted solely because an external extension changed its prompt visibility.
- No live smoke may be reported as passing architecture latency unless persisted timing records prove submit-to-generation-start.
- No deterministic non-generation post may satisfy architecture latency proof. Skipped posts such as `clarificationNeeded`, `routineCommand`, `locationTransition`, `riskConfirmationNeeded`, campaign intros, and terminal checkpoints must be recorded separately from persisted latency-bearing `entries[]`, and at least one persisted CORE latency-bearing turn must pass.

## Current Decision Record

These decisions are binding for the next implementation stages:

- Forward-only pre-alpha replacement is allowed. Old runtime/save write paths are temporary bridge points, not long-term compatibility surfaces.
- When the old implementation conflicts with the new architecture, update the code, tests, fixtures, and docs in place to the new design. Do not add dual behavior merely to preserve old pre-alpha saves, old helper names, old runtime ledgers, or old UI projections.
- Frame is the final human-facing name for the combined source provenance object. Do not reintroduce SEED Frame as the architecture name.
- External-context support means compatibility and coexistence with ST-Lorebooks / ST Lorebooks / World Info, Memory Books, Summaryception, and VectFox. It does not mean direct integration, automatic import, automatic trust, or automatic repair of those tools.
- The External Context Compatibility Workstream is part of the redesign implementation scope. Agent audit findings and per-extension planning implications should drive contracts, fixtures, live-proof gates, and durable manual updates until the behavior is promoted out of planning docs.
- External-context support must use one normalized evidence contract across fixture prep, disk/browser probes, prompt adapter summaries, readiness fixture-depth checks, generation proof, and live coordinator gates. A layer that cannot emit `memoryBooks.rangeDiagnostics`, `summaryception.staleness`, or `vectFox.backendDiagnostics` should report limited evidence instead of inventing its own pass rule.
- The Narrative Engine transfer is a redesign pivot, not a side appendix. Hybrid scene recall, prompt budget lanes, witness-scoped facts, scene/phase seals, structured lore/RAG metadata, pressure/arc digests, and evidence-backed Correct-as-Swipe must be planned into CORE/Frame/SRE/REPAIR/FORGE/LENS rather than added later as isolated features.
- Narrative Engine code is a reference source, not the implementation substrate. Borrow architecture and algorithms by reimplementation; do not port its app shell, server routes, storage model, UI, local archive format, world simulator, or vector database dependency. Any direct nontrivial code copy needs MIT attribution and Directive-native tests.
- Recall Index is a CORE projection capability, not a separate truth store. LENS consumes recall hits through budget lanes; SRE/REPAIR invalidate or fork recall when selected swipes, source edits, rollback, or branches change source truth.
- Witness-scoped facts are part of continuity correctness. Active-cast and protected-continuity prompt lanes must be able to prove why an actor can know, infer, or not know a fact.
- Scene/phase seals are FORGE background settlement records. They can update Recall Index and prompt dirty domains, but they must not block visible generation or rewrite the hot save.
- The v1-to-v2 persistence bridge now keeps normal manual Save, Save As, and autosave on v2-owned authority after runtime bridge takeover. State Safety remains the explicit v1 checkpoint action and must stay visibly separate from hot-path persistence.
- Queued runtime persistence may write v2 active-state artifacts through the facade and attach them to the existing v1 save-index entry with `v2ManifestRef`; runtime bridge loads must verify that ref before trusting it and fall back only to the explicit v1 checkpoint lane.
- Autosave cutover uses non-current v2 manifest-owned autosave entries with pruning semantics preserved. Autosave must not move the active manual save pointer, clear active save v2 authority, or recreate v1 autosave payloads after runtime bridge takeover.
- A compact v2 materialized head is not automatically a full runtime resume source. RuntimeTracking, turnLedger, compact model-call journal projections, compact sidecar/background diagnostic projections, compact prompt-cache resume evidence, and recent Command Log assisted-summary presentation fields are now rehydrated or projected from bounded v2 event/turn/diagnostics tails plus manifest-owned artifacts, but broader presentation replay and final CORE-owned resume semantics still need explicit projection contracts.
- Persisted generation-start timing proof must come from CORE Store projections in the save-scoped `core` layout. The v1 save payload and v2 active-save facade may locate or resume a save during the bridge, but they must not be expanded into durable timing ledgers to satisfy architecture certification.
- CORE timing proof classifies entries by `route + responseKind + generation timestamps`, not route alone. Raw `directivePosted` CORE rows can be generated committed outcomes or deterministic/control posts; only the generated rows count toward `checkedTurnCount`.
- Implementation cadence is macro first, then micro. Build the named system boundaries, contracts, and first vertical turn lifecycle before spending substantial time perfecting local edge behavior. Narrow seam hardening, exhaustive focused tests, and small recovery-policy refinements move to phase gates unless they unblock the macro path.
- Temporary roughness is acceptable only when it is visible on the board. Known failing focused tests, incomplete projection adapters, and deferred edge cases must be logged with an owner, final target system, and phase gate; they should not pull implementation back into micro-first polishing while CORE/Frame/SRE/REPAIR/FORGE/LENS are still only partially wired.
- The macro pass is not a release-candidate pass. It may temporarily leave a narrow feature, edge recovery path, or focused test incomplete when the new authority boundary is correct, the gap is documented, and the primary vertical player-turn path is still moving toward the target architecture.
- As of the macro-first pivot, the next implementation slice should be selected by missing system ownership, not by the nearest narrow failing behavior. Work such as prompt-cleanup polish, generic retry actuation, proof-pipeline refinements, and small projection mismatches should be treated as integration or micro backlog unless it blocks the primary vertical turn path or creates new authority in the wrong owner.
- The verification cadence should match the pass. During macro work, run syntax checks, contract-shape checks, and gross-path smoke tests for newly connected seams. During integration, run focused deterministic suites for the wired systems. During micro hardening, run broad focused suites, alpha gate, scale proof, and full live certification.
- The redesign is allowed to move faster than the old system can remain fully functional. The implementation priority is to build independent macro systems, integrate them in deliberate larger passes, and then restore full runtime behavior. Do not spend macro cycles keeping every old narrow behavior green unless the failure is a data-safety issue, source-authority issue, raw-content leak, or primary vertical-path blocker.
- Agent utilization should be treated as a throughput requirement. Agent-0 should not personally inspect, implement, test, and document every subsystem. During independent build waves, use parallel workers for disjoint lanes; during shared-file integration windows, reduce concurrency and let Agent-0 integrate.
- Sub-agent implementation is now the default development protocol for architecture slices: a fresh implementation worker owns the bounded patch, a spec-compliance reviewer checks it against the plan, a code-quality reviewer checks ordering, invariants, hidden failure modes, and maintainability, and Agent-0 integrates only after both reviews pass or records the finding as a blocker/backlog item.
- The finish strategy is full implementation first, release proof second. Do not redefine success around the current green deterministic gates or bounded live proof. The remaining architecture cutover must still be completed: CORE/v2 runtime authority, REPAIR/SRE ownership, FORGE/LENS completion, and then certification.
- Short-time pressure changes sequencing, not scope. Stop low-value polish and broad discovery, but do not skip the architecture systems that make the proposal true. Every new slice should remove a real blocker from one of the finish waves below.
- The plan must now be managed by an explicit finish scoreboard. Every remaining item is classified as implementation blocker, proof blocker, integration backlog, micro backlog, or out of scope. A feature that is only described in architecture prose is not complete.
- "Narrative Engine feature captured" means the transfer has a Directive owner, non-owner boundary, first implementation slice, storage boundary, invalidation behavior, proof gate, and code reference decision. If any of those are missing, the feature is still a planning or implementation blocker.
- Narrative Engine ideas that do not fit Directive's owner model are explicitly non-transfers unless a future reviewed design says otherwise. Adaptive LLM/provider queueing may inform FORGE/generation-router scheduling, but it is not a new architecture owner. NPC/world simulation, vault/archive UI, app/server routes, local archive storage, and mandatory vector-database dependencies are out of scope for this redesign.
- The final strategy review found no reason to reduce the architecture scope. It did find execution gaps: the plan needs a feature-freeze rule, exact agent packs by wave, WIP limits, a strict distinction between "captured" and "implemented" Narrative Engine features, and a rule that full live proof starts only after Waves 1-3 exit.

### Strategy Pivot / User Change Log

This table records user-requested pivots that changed execution strategy. Use it when a future agent is unsure whether to preserve an older plan section or follow the current finish strategy.

| Date | Requested change | Affected sections | Supersedes | Owner / gate | Status |
| --- | --- | --- | --- | --- | --- |
| 2026-06-30 | Treat Directive as pre-alpha and update old code/tests/docs in place to the best new architecture. | Current Decision Record, Non-Negotiable Contracts, Stage 12, Stage 14. | Long-lived legacy compatibility for old helper names, hot save shape, runtime ledgers, and stale docs. | Agent-0 during every cutover slice. | Active. |
| 2026-06-30 | Use macro-first implementation, then integration, then micro hardening. | Throughput Pivot, Macro-First Implementation Cadence, Finish-Time Execution Controls. | Micro-first seam rewiring and broad verification after every narrow edit. | Agent-0 state board and wave exit gates. | Active. |
| 2026-06-30 | Use agents aggressively but efficiently. | Agent Use Under Time Pressure, Required Agent Packs, Agent Prompt Templates. | Agent-0 personally inspecting, implementing, testing, and documenting every lane. | Slice intake and worker/reviewer handoffs. | Active. |
| 2026-06-30 | Full implementation remains required; bounded proof is not completion. | No-Waste Full-Implementation Finish Strategy, Wave Exit Gates, Stage 13. | Redefining success around current deterministic or bounded live gates. | Wave 4 proof only after Wave 1-3 exit. | Active. |
| 2026-06-30 | Incorporate Narrative Engine features as Directive-native architecture. | Narrative Engine Transfer Workstream, Stages 1/2/7/8/9/10/13. | Treating recall, budget lanes, witness facts, scene seals, and Correct-as-Swipe as optional add-ons. | Narrative Engine Coverage Lock. | Active. |
| 2026-06-30 | Preserve compatibility with ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox without direct integration. | External Context Compatibility Workstream, LENS/Frame diagnostics, Stage 13 proof. | Calling private extension internals, trusting generated memory, or storing external content as Directive truth. | External-context proof gates. | Active. |
| 2026-06-30 | Time pressure should reduce waste, not scope. | Finish Slice Intake, Agent Use Under Time Pressure, Verification Cadence. | Open-ended discovery, agent waiting loops, full alpha/live proof as development proof. | Slice timebox and selected verification commands. | Active. |
| 2026-06-30 | Final strategy review: freeze scope, finish implementation, and make agent usage explicit. | Final Strategy Review Controls, Final Strategy Addendum, Required Agent Packs By Finish Wave, Narrative Engine Capture Audit. | Relying on architecture prose, ad hoc agent usage, or bounded proof as a substitute for implementation. | Wave exit gates and Agent-0 State Board. | Active. |

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

Worker agents are required for throughput, but their handoffs are evidence and patch candidates, not final integration authority. The concurrency level depends on the pass:

| Pass | Recommended active workers | Why |
| --- | --- | --- |
| Macro independent build | 3-5 workers when file scopes are disjoint. | Contracts, storage, recall, prompt-budget, witness facts, scene seals, and QA fixtures can progress in parallel before shared runtime wiring. |
| Macro vertical wiring | 2-3 workers plus Agent-0. | Shared runtime seams need tighter coordination, but SRE/REPAIR, LENS/FORGE, and QA can still work beside Agent-0. |
| Integration window | 1-2 workers plus Agent-0. | Shared files are frozen; Agent-0 integrates and workers inspect seams or write targeted fixtures. |
| Micro hardening | 3-5 workers when tests/fixtures are disjoint. | Edge fixtures, live proof, docs propagation, redaction canaries, and scale checks can parallelize again. |

Avoid five workers editing the same hot runtime files. Do use five workers when the lanes are contracts, storage, retrieval/recall, prompt budgeting, QA fixtures, or docs/test artifacts with clear file ownership.

Agent usage follows the macro-first cadence:

- During the macro pass, agents audit or build named system boundaries, not isolated edge cases. Assign them to Frame/LENS, CORE storage/runtime, SRE/REPAIR, FORGE/provider/background, or QA/scale proof.
- During the integration pass, agents inspect handoff seams and stale ownership risks while Agent-0 edits shared runtime files.
- During the micro pass, agents expand focused tests, close deferred recovery cases, and harden live proof. This is when edge-case sweeps become the main work.
- A worker finding that identifies a real bug does not automatically interrupt macro work. Agent-0 either classifies it as a macro blocker or records it in the deferred micro queue with the gate that will catch it.

### Sub-Agent Development Gate

Every implementation slice that changes behavior should use this gate unless the slice is a trivial docs-only or mechanical rename:

1. Agent-0 writes the slice objective, owned files, forbidden files, safety invariants, expected tests, and handoff format.
2. A fresh implementation worker writes the failing test first, proves it fails, implements the smallest bounded patch, runs focused verification, and returns changed files plus evidence.
3. A spec-compliance reviewer inspects only the slice scope and answers whether the patch satisfies the plan, naming any missing requirement or scope drift.
4. A code-quality reviewer inspects the patch for hidden ordering risks, split-brain writes, unbounded payloads, raw-content leaks, idempotency holes, race windows, and maintainability.
5. Agent-0 either integrates the patch after both reviews pass, sends it back to a worker with concrete review findings, or reclassifies the issue as a macro blocker, integration backlog, or micro backlog.

The reviewer gate is not optional ceremony. The first CORE-backed sidecar fail-closed attempt demonstrated why: moving FORGE settlement before the old `stateDeltaGateway.applyOperations(...)` prevented "old state ahead of CORE" but created "CORE ahead of old state" if the old apply later failed. That finding belongs in the plan as a bridge-consistency blocker, not as an accepted implementation.

For dual-write bridges, reviewers must demand tests for both failure orders:

- new owner fails before old-state mutation: no old mutation, no prompt sync, rejected compact diagnostics;
- old-state mutation/apply/persist fails after new-owner preflight or settlement: no durable new-owner acceptance unless the bridge has an explicit compensation/recovery record and replay contract.

Passing only the first failure order is insufficient for CORE/FORGE, CORE/REPAIR, CORE/LENS, or active-save/v1 bridge cutover work.

### Throughput Pivot

The redesign has been moving too slowly because two process patterns are expensive:

1. Agent-0 has been doing too much serialized work.
2. The implementation has tried to keep the old runtime fully functional while moving one narrow seam at a time.

The corrected model is not "break everything and hope." It is "break old assumptions in controlled places while preserving safety invariants." Independent macro systems should be built to their target contracts first, then wired together in larger integration passes.

Always preserve these safety invariants:

| Invariant | Why it cannot be broken |
| --- | --- |
| No destructive storage writes | User saves and development fixtures must remain recoverable. |
| No raw transcript/prompt/provider/external payload leaks into CORE, Recall Index, scene seals, budget traces, or diagnostics | The redesign's storage/privacy guarantees depend on this from day one. |
| Source authority remains explicit | Selected swipes, Frames, CORE refs, SRE verdicts, and REPAIR cases cannot be blurred even during macro work. |
| Dual-write bridges remain consistency-safe | During migration, old projections and new CORE/FORGE/LENS records must not get permanently ahead of each other without an explicit compensation or recovery contract. |
| Prompt-key ownership remains explicit | Directive must not clear or mutate non-Directive prompt keys while LENS is incomplete. |
| Schema and syntax remain valid for touched modules | Broken imports and parse errors hide real architecture progress. |
| Known failures are logged | Temporary breakage is acceptable only when visible, owned, and tied to a later gate. |

Temporarily allowed during macro work:

| Allowed roughness | Required control |
| --- | --- |
| Narrow focused tests red because an old seam is being replaced. | Record owner, final system, reason deferred, and integration/micro gate. |
| Old UI projection incomplete while CORE projections are being built. | Keep a compatibility projection task on the board. |
| Old runtime path bypasses a new macro module during independent build. | Mark the module as contract/synthetic proof only until the integration window. |
| Duplicate bridge code exists while old and new systems overlap. | Name the bridge owner and removal stage. |
| Live SillyTavern proof is skipped during macro construction. | Record that live proof resumes at Stage 13 or the next integration gate. |
| Alpha gate is not run after every small edit. | Run syntax/contract/gross-path checks for macro work, then focused suites at integration. |

Not allowed:

| Not allowed | Reason |
| --- | --- |
| Hiding a known failing test because it is inconvenient. | Breakage must be visible to remain controlled. |
| Adding new old-ledger authority to make a narrow test pass. | This extends the architecture being removed. |
| Reintroducing full hot-save rewrites as a bridge. | This contradicts the primary 5000-message target. |
| Reversing bridge write order without proving both failure directions. | This replaces one split-brain class with another and makes the architecture harder to reason about. |
| Letting candidate correction swipes mutate accepted continuity immediately. | This violates selected-swipe source truth. |
| Treating external ST Lorebooks, Memory Books, Summaryception, or VectFox content as Directive authority. | External context remains influence/diagnostics unless reviewed import is explicitly designed. |

### No-Waste Full-Implementation Finish Strategy

The redesign is not finished when bounded proof is green. Bounded proof says the current bridge can work; it does not prove the proposal. The finish strategy is to stop expanding the surface area and drive four implementation waves to completion.

#### Wave 1: CORE Runtime Authority

Goal: make v2/CORE the real runtime authority instead of a strong sidecar projection.

Required outcomes:

- first-turn CORE/v2 bootstrap is explicit and does not depend on a stale v1 materialized head;
- materialized-head freshness rules are defined and enforced;
- runtime rehydration can resume the needed active projections without treating the old full save as the hot runtime log;
- old ingress/response/runtime ledgers are projections or compatibility views, not new authority;
- save, autosave, manual Save As, active runtime persistence, and CORE manifests have clear ownership and no hidden full-history rewrite path.

Primary workers:

- CORE Runtime worker owns storage/runtime cutover and projection compatibility.
- QA/scale worker owns 5000-message and hot-write/read verification.
- Agent-0 owns shared storage/runtime integration and final cutover semantics.

Stop doing during this wave:

- cosmetic prompt or UI cleanup;
- live certification runs meant to prove release readiness;
- edge recovery tweaks unless they expose data loss, raw leakage, source-authority confusion, or a primary vertical-path blocker.

#### Wave 2: REPAIR/SRE Ownership

Goal: make source mutation, retry, rerun, rollback, reobserve, and post-visible source review flow through one recovery/source-integrity authority.

Required outcomes:

- committed response retry/reobserve cannot rerun mechanics unless REPAIR explicitly authorizes the correct recovery path;
- rollback execution is owned by REPAIR policy and records CORE recovery before compatibility projections mutate;
- SRE owns source-integrity review for selected swipes, explicit ranges, host-native completions, and recovery repair modes;
- stale, mismatched, deleted, summarized-only, hidden, or external-visibility-mutated sources cannot re-enter normal classification;
- the Sam Vickers dependent-edit loop class remains blocked by architecture, not by one local special case.

Primary workers:

- REPAIR/SRE worker owns policy, source-integrity modes, and source-mutation fixtures.
- QA worker owns edit/delete/swipe/retry/rerun regression fixtures.
- Agent-0 owns shared `chat-turn-orchestrator`, `message-reconciler`, `response-dispatcher`, and runtime integration.

Stop doing during this wave:

- adding old-ledger fallback authority to make a narrow test pass;
- scattering retry/reobserve policy into host adapters, response dispatch, prompt sync, or sidecar code;
- treating selected-swipe staging proof as native actuation proof.

#### Wave 3: FORGE/LENS Completion

Goal: finish background and prompt ownership so post-visible work cannot recreate latency, save-bloat, or prompt-dirty churn.

Required outcomes:

- background work settles through FORGE/CORE with source-current guards, one accepted batch result, compact diagnostics, and LENS prompt dirty/cache behavior;
- LENS owns prompt budget traces, cache inputs, external prompt-environment refs, and prompt-key preservation;
- scene/phase seals, pressure/arc digests, recall-index refs, external-context diagnostics, Command Log/Narrative Thread/advisory/terminal settlement, and open-world boundary work remain bounded and nonblocking;
- external ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox stay external influence/diagnostics, not FORGE outputs or CORE truth;
- prompt rebuild frequency and save-write frequency stay compatible with the 5000-message target.

Primary workers:

- FORGE/LENS worker owns background settlement, prompt-budget/cache behavior, and redaction canaries.
- External compatibility worker owns prompt-key coexistence and bounded external-context artifacts.
- Agent-0 owns integration points where background settlement touches runtime state or prompt installation.

Stop doing during this wave:

- new raw prompt/provider/transcript/external diagnostics;
- prompt rebuilds for diagnostics-only changes;
- treating each sidecar as an independent save/prompt event when one batch can settle it.

#### Wave 4: Proof And Certification

Goal: prove the fully implemented architecture, not discover missing implementation.

Required order:

1. deterministic preflights and alpha gate;
2. strict or strict-equivalent single-lane rehearsal;
3. bounded five-user proof only if it can catch artifact/proof regressions cheaply;
4. full unbounded five-user, 52-turn Ashes certification with non-human `directive-soak-*` users only;
5. release-bundle proof, including message mutation actuation and the specialized terminal/Command Bearing producers;
6. Stage 14 docs promotion after behavior is proven.

Required certification evidence remains unchanged:

- CORE-targeted generation-start timing and host-native completion;
- 52 prompt snapshots per lane and 53 fact checks per lane;
- model-assisted factual and story-quality review;
- lane-owned model-call failure policy evidence;
- all-lane external-context proof if the stronger coverage standard is selected;
- source/assistant edit/delete native host-control evidence;
- selected-swipe source-truth proof now, and native selected-swipe actuation only after the runner exists;
- no `default-user` soak proof.

Do not spend time on:

- repeating full live runs before deterministic gates and the single-lane rehearsal are clean;
- broad audit agents without a concrete implementation owner;
- docs promotion before runtime behavior exists;
- arguing that bounded proof is enough for full certification.

#### Wave Exit Gates

Do not mark waves complete because the next wave is more tempting. Wave 1, Wave 2, and Wave 3 implementation slices may run in parallel only when the file scopes and authority boundaries are independent and the slice removes a named blocker. Wave 4 proof still cannot start until the Wave 1-3 exits are satisfied, or the remaining gaps are explicitly classified as proof-only with an owner and catch gate.

| Wave | Definition of done | Required evidence before advancing |
| --- | --- | --- |
| Wave 1: CORE Runtime Authority | CORE/v2 is the runtime authority for the primary turn lifecycle, and old ledgers are compatibility projections rather than new write authority. | First-turn CORE/v2 bootstrap test; materialized-head freshness test; active runtime rehydration test; cross-writer save/autosave/Save As ownership test; 5000-message hot-write/read budget with no full-history rewrite. |
| Wave 2: REPAIR/SRE Ownership | Source mutation, retry, rerun, rollback, reobserve, selected-swipe review, and post-visible source review enter REPAIR/SRE before any normal turn, mechanics rerun, or continuity apply can occur. | Retry/rerun does not rerun mechanics without REPAIR authorization; rollback writes CORE recovery before compatibility projection mutation; selected-swipe/source mutation cannot become normal ingress; explicit-range and host-native source review use SRE source-integrity verdicts; Sam Vickers dependent-edit loop remains blocked by architecture. |
| Wave 3: FORGE/LENS Completion | Background work and prompt ownership cannot reintroduce turn latency, prompt churn, hot-save bloat, or raw diagnostic archives. | Background effects settle through FORGE/CORE with source-current guards and idempotency; prompt rebuilds are coalesced through LENS; budget traces prove included/omitted refs and overflow behavior; external context diagnostics remain bounded/redacted; scene seals, pressure digests, recall refs, and open-world boundary effects stay nonblocking. |
| Wave 4: Proof And Certification | The completed architecture is proven under deterministic, bounded, single-lane, and full five-user live conditions. | Alpha gate; strict single-lane rehearsal; bounded five-user artifact with only expected scope warnings; full 52-turn five-user Ashes run with non-human users only; release bundle with mutation actuation, terminal, Command Bearing, model-review, external-context, timing, and host-native completion proof. |

#### Final Strategy Review Controls

The final strategy review adds execution controls, not a smaller scope. Time pressure changes how work is sequenced and delegated; it does not remove the need for full implementation.

| Risk or question | Plan decision | Enforced by |
| --- | --- | --- |
| Bounded proof is mistaken for architecture completion. | Green bounded proof is useful evidence, but it is not the finish line. CORE/v2 authority, REPAIR/SRE ownership, FORGE/LENS completion, and full certification all remain required. | Wave exit gates, Current Proof And Gap Register, Stage 13 full-depth proof. |
| Narrative Engine features are treated as optional extras. | Hybrid Recall Index, LENS prompt budget lanes, witness-scoped facts, scene/phase seals, pressure/arc digests, structured lore/RAG metadata, and Correct-as-Swipe stay in the required redesign scope. | Narrative Engine Transfer Completion Matrix and Stage 1/2/9/10/13 gates. |
| Narrative Engine code is copied instead of adapted. | Borrow methods and architecture patterns, not the standalone app/server/storage/UI/vector stack. Direct nontrivial code copy requires MIT attribution, isolation behind Directive-native contracts, and targeted tests. | Code reference policy row, worker prompts, Agent-0 review. |
| External context tools become hidden Directive dependencies. | ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox remain external context-extension tools. Directive must coexist, observe, attribute, bound, and redact; it must not call private internals, trust generated content, or block fast generation on deep inspection. | External Context Compatibility Workstream, LENS/Frame diagnostics, REPAIR visibility normalization, Stage 13 live proof. |
| Agent-0 serializes the redesign again. | Any wave with two or more disjoint lanes starts by assigning workers. If Agent-0 uses fewer workers than the recommended matrix, the board must state why scope was reduced or serial execution was accepted. | Per-Stage Agent Allocation, Agent-0 State Board, worker stop conditions. |
| Agent work becomes another waiting loop. | Explorers and workers must have a slice timebox, a narrow handoff, and a concrete stop condition. Agent-0 continues non-overlapping critical-path work while agents run; if an agent cannot return concrete blockers, patches, or gates inside the window, reduce scope or defer the issue. | Finish Slice Intake, Agent Use Under Time Pressure, worker stop conditions. |
| Micro verification consumes macro build time. | Macro slices get syntax, contract-shape, redaction, size, and gross-path checks. Broad focused suites, alpha gate, scale proof, and full live proof are phase gates unless a failure is a macro blocker. | Throughput Pivot, Failure Classification, Definition Of Functional By Pass. |
| Old authority is extended to keep narrow behavior green. | Temporary bridges are allowed only when owned, named, and scheduled for removal. New old-ledger authority, hot full-save rewrites, raw diagnostic archives, and source-truth ambiguity are not allowed. | Safety invariants, Wave 1 and Wave 2 gates, Known Red template. |
| Certification starts before implementation is done. | Full live proof is a judgment pass, not a discovery pass. Do deterministic preflights, strict/single-lane rehearsal, bounded proof only when useful, then full non-human five-user Ashes certification. | Wave 4 required order, Stage 13 readiness gates. |
| Architecture text hides missing implementation detail. | Every feature claimed by the proposal must appear on the finish scoreboard as implemented, in progress, proof-blocked, deferred with owner/gate, or rejected. | Finish Scoreboard, Narrative Engine Coverage Lock, Agent-0 State Board. |

#### Final Strategy Addendum

This addendum captures the final strategy review before the remaining implementation push. It does not change the target architecture. It changes how the work is constrained so the redesign can finish without wasting cycles.

Key conclusions:

- Full implementation is still required. The plan must not shrink to the currently green deterministic gates, the bounded three-turn proof, or a documentation-only redesign.
- The remaining problem is execution control more than architecture discovery. Stop opening new broad audits unless they answer a blocker on the current finish wave.
- Use a feature freeze for architecture scope. New ideas enter only if they remove a blocker from CORE runtime authority, REPAIR/SRE ownership, FORGE/LENS completion, Narrative Engine transfer, external-context compatibility, migration cutover, or certification.
- Treat every worker as either implementation, spec review, quality review, or QA/live proof. Avoid generic "look around" agents while Waves 1-3 still have implementation blockers.
- Keep WIP small. Agent-0 should run one active implementation slice plus at most one non-overlapping worker pack; everything else waits on the board.
- Full live certification is a judgment pass. If it discovers missing implementation, the plan failed to run enough deterministic, scale, and single-lane rehearsal proof first.

Execution corrections from the review:

| Missing or weak control | Plan update |
| --- | --- |
| Scope could keep expanding because new architecture ideas are interesting. | Add feature freeze. New work must map to a finish wave and blocker. Narrative Engine and external-context work are already in scope; unrelated product work is integration or micro backlog. |
| Agent use was encouraged but not operational enough. | Use the Required Agent Packs By Finish Wave table as the default staffing rule. If fewer workers are available, reduce slice scope instead of serializing the full slice inside Agent-0. |
| "Captured from Narrative Engine" could be mistaken for implemented. | Use the Narrative Engine Capture Audit and Transfer Completion Matrix. A row is incomplete until it has owner, runtime path, storage boundary, invalidation behavior, proof gate, and code-reference decision. |
| Verification could still drift back to micro-first behavior. | Each slice states stop-after evidence before work starts. Do not add broad proof after focused proof passes unless a selected command fails or a reviewer finds a macro blocker. |
| Full live proof could start too early because bounded proof looks good. | Wave 4 starts only after Wave 1 CORE authority, Wave 2 REPAIR/SRE ownership, and Wave 3 FORGE/LENS completion exit gates are satisfied or the remaining gaps are explicitly classified as proof-only. |
| Workers could return useful but unmergeable findings. | Worker prompts must include allowed files, forbidden files, exact handoff format, stop condition, and classification rule. Findings without a finish-wave blocker become backlog, not current-slice interrupts. |
| Old bridge code could survive by inertia. | Every temporary bridge needs owner, removal stage, failure-order proof, and a reason it is safe while present. Bridges that write old authority first are macro blockers unless proven compensable. |
| External-context compatibility could become direct integration. | Keep all extension work at host-observable prompt/source/visibility/latency/redaction boundaries. No private extension internals, raw content, or generated external memory becomes Directive authority. |

Immediate no-waste rule:

```text
If a task does not remove a blocker from the current finish wave, classify it before doing it.
If it is useful but not blocking, put it in integration backlog or micro backlog.
If it cannot name a Directive owner, storage boundary, source-authority rule, and proof gate, it is not ready for implementation.
```

#### Final Strategy Agent Pack

Use this pack for the remaining push whenever the slice has disjoint work. Agent-0 may run fewer workers only by reducing scope.

| Current wave | Default worker count | Workers to launch first | Reviewers | Agent-0 should do in parallel |
| --- | --- | --- | --- | --- |
| Wave 1: CORE Runtime Authority | 3 workers | CORE runtime/resume worker, CORE storage/freshness worker, QA scale/hot-write worker. | Spec reviewer and code-quality reviewer per behavior patch. | Freeze shared runtime/storage files, integrate accepted patches, keep the board current, and prepare the next bridge-removal slice. |
| Wave 2: REPAIR/SRE Ownership | 3 workers | REPAIR policy worker, SRE source-integrity worker, mutation/retry QA worker. | Spec reviewer and code-quality reviewer per policy/runtime patch. | Own shared orchestrator/reconciler/dispatcher edits and resolve old-ledger projection demotion. |
| Wave 3: FORGE/LENS Completion | 4 workers | FORGE settlement worker, LENS prompt-budget worker, Recall/Budget worker, External Compatibility worker. | Spec reviewer and code-quality reviewer per FORGE/LENS bridge patch. | Own runtime prompt/background integration, bridge removal, prompt-key ownership, and final dirty-domain decisions. |
| Wave 4: Proof And Certification | 5 workers | QA/live worker, external-context proof worker, story/factual review worker, release-bundle worker, docs propagation worker. | Artifact reviewer and docs/status reviewer. | Decide pass/fail, keep `default-user` out of soak proof, interpret artifacts against final CORE projections, and promote docs after behavior is proven. |

Agent stop conditions:

- Implementation worker stops after the named failing test passes and selected verification succeeds. It does not expand scope after finding adjacent bugs.
- Spec reviewer stops after deciding whether the patch satisfies the slice intake and proposal. It does not redesign the slice unless it rejects it.
- Code-quality reviewer stops after checking ordering, authority, idempotency, redaction, boundedness, and maintainability risks.
- QA/live worker stops after producing the requested artifact or exact failure evidence. It does not repair runtime behavior during proof unless reassigned.
- Agent-0 stops a slice when the stop-after evidence is reached, a reviewer rejects it, or the slice cannot remove the stated blocker.

#### Current Finish Operating State

Updated July 1, 2026. This section is the current operating board until Agent-0 replaces it with a fresher Architecture Redesign Board entry. It exists so future workers do not mistake architecture capture, bounded proof, or partial bridge safety for completed implementation.

| Lane | Current state | Next execution action | Do not spend time on |
| --- | --- | --- | --- |
| CORE/v2 runtime authority | Partly implemented and focused-test proven for first-turn bootstrap, source-frame scope validation, hot `beginTurn(...)` append, v2 bridge load/recovery, manifest freshness, Save/Save As/autosave v2 authority, response duplicate recovery, CORE-projection freshness arbitration, gated authoritative `coreStoreV2` runtime projection markers, active-save CORE-only/merge projection rules, hostContinue/retry/recovery response projections, compact `snapshotBeforeRetained` resume markers, outcome-replacement active-save-persist failure recovery, tuple-checked outcome-replacement replay, recovery/restart persist rollback, and resolved recovery replay for visible-response/source-restart/rollback closures. Remaining blockers are full runtime resume/replay semantics across all production paths, old-ledger write removal for any direct response/recovery/background surfaces not yet represented by CORE events, and final bounded reducer/event mechanics application. | Use Wave 1 CORE Runtime/Storage/QA workers only for slices that remove old-ledger durable authority or prove the runtime can resume/replay from CORE/v2 without hot full-save rewrites. Next CORE slices should target direct old-ledger writers still outside CORE projections, not additional bridge polish. | Prompt wording, UI polish, broad live proof, and proof-pipeline refinements unless they expose data loss, source-authority confusion, raw leakage, or a primary vertical-path blocker. |
| REPAIR/SRE ownership | Partly implemented for source-mutation recovery boundary, dependent-edit guard, selected-swipe runtime event handling, latest-source restart links, committed player-source rollback/delete execution through REPAIR/CORE rollback actuation records, host-native response-recovery policy seams, no-CORE `hostResponsePostFailure` retry fail-closed actuation, provider-failure-after-mechanics retry through REPAIR/CORE-selected response swipe, retained-outcome rerun preview/branch-candidate authorization with compact checkpoint evidence, terminal checkpoint replay REPAIR actuation with explicit CORE/v2 checkpoint refs and bounded replay evidence hashes, chat-native CORE-backed rerun commit through a fresh replacement transaction, Scene Handshake prompt-sync failure recovery through CORE/REPAIR turn-processing recovery without old revision restore, the first SRE host-native continuity verdict facade used by response dispatch, post-verdict host-native continuity contradiction recovery through a named REPAIR boundary for immediate/callback/reobserve paths, stricter source/text-hash trust for provided SRE reviews, sanitized fail-closed host-native contradiction compatibility projection when REPAIR returns missing or incomplete projection bundles, independent SRE `source-review-worker` ownership for host-native post-visible review reuse/fail-closed evidence, visibility-only production guard for Summaryception/Memory Books/VectFox/native hidden metadata, REPAIR-owned dependent invalidation projection for Scene Handshake and Mission Component source mutations, SRE explicit-range terminal settlement gating for Scene Reconciliation before invalidation or proposal apply, SRE latest-pair selected-variant preflight blocking before Scene Handshake provider/apply, configured terminal latest-pair Scene Handshake owner boundary that consumes the ingress Frame, production chat-turn default `sourceSettlementLatestPair` provider wiring with fail-closed no-apply-owner and sanitized provider-error behavior, and production `chat-turn-orchestrator` caller retirement through the `source-settlement-latest-pair` owner adapter. CORE mechanics now emits pre-outcome checkpoint artifacts, terminal replay reuses those refs, rerun preview and committed outcome delete require CORE checkpoint refs/artifacts instead of old raw snapshot fallback, valid host-native continuity contradictions, host-native unavailable/failed recoveries, provider-failure-after-mechanics retry recoveries, and generic CORE-backed `hostResponsePostFailure` recovery now rely on CORE recovery/response/ingress/continuity projections instead of writing old `runtimeTracking.recoveryJournal`, old response recovery payloads, `runtimeTracking.ingressLedger`, or continuity rejected-claim/hint/fact-use roots. Generic retry from CORE-backed `hostResponsePostFailure` now stores a compact non-raw `directive.responseRetryGenerationPlan.v1`; deterministic `locationTransition` retry regenerates visible pacing from that plan, and committed/director retry regenerates fresh visible narration through the generation router from player-safe campaign state plus compact committed-outcome evidence without rerunning mechanics or keeping failed raw response text. Source-mutation rollback execution now loads CORE checkpoint restore state when a source turn has a compact checkpoint ref while history-only rollback remains blocked, checkpoint-backed rollback execution no longer appends old `restoreRevision` recovery-journal rows, CORE-backed no-outcome player-source mutations and CORE-recorded committed source mutations no longer write old recovery-journal rows, CORE-backed turn-processing failures no longer write old recovery-journal rows, and REPAIR-owned dependent invalidation projections no longer append old Scene Handshake or Mission Component recovery-journal rows. Live edit/delete proof runners, shared live harness snapshots, message-action reports, and testing/technical docs now expose or name CORE recovery projection evidence while keeping old recovery counts as legacy telemetry; mutation preflight and release-bundle preflight now reject count-only mutation evidence and require CORE/REPAIR owner proof. Remaining blocker is broader old-ledger projection demotion and full live certification, not response-retry raw text authority. | Use the Wave 2 REPAIR/SRE/mutation QA pack for one policy table or runtime seam at a time; next slice should remove remaining old-ledger durable authority or prove owner projections/status in release gates. Old reconciliation ledgers may mirror status only after REPAIR/SRE decides the action. | Letting edited/deleted/retried sources re-enter normal classification, rerunning mechanics without REPAIR authorization, treating selected-swipe/correction candidates as accepted continuity before selection, or allowing provider-only SRE settlement to report durable apply authority. |
| FORGE/LENS ownership | Active Wave 3 cutover. Accepted sidecar bridge safety, scene/phase seals, pressure/arc digests, open-world boundary settlement, internal background settlement, accepted-batch prompt flushing, no-FORGE accepted-batch fail-closed behavior, Command Bearing review prompt flushing, Command Bearing review CORE projection, Command Bearing accepted-evidence CORE projection, rejection/failure sidecar-journal demotion, automatic packet-level Recall refs in LENS budget lanes, CORE/package/scene-seal hybrid Recall retrieval, production Director CORE-Recall pass-through, and production LENS CORE-Recall packet conversion now have focused bridge proof. The accepted sidecar prompt missing-helper/replay quality gate is now closed at focused-test depth: once FORGE participates, missing or falsey accepted prompt helpers record compact LENS-unavailable warning evidence, scheduler-owned `syncPromptContext(...)` does not run, and accepted replay carries the same warning so it cannot become a clean provider-cache barrier. No-FORGE accepted batches now reject before old v1 mutation instead of using scheduler-built direct CORE settlement. Ordinary accepted effectful batches now validate the compatibility projection without mutation, settle through FORGE/CORE, keep projected domain roots out of live v1 state and prompt input, and let LENS merge only prompt metadata (`campaignChatBinding`, `runtimeResume`, and `runtimeTracking.promptContext`) from a live/filtered state plus compact CORE accepted-batch evidence. Command Bearing accepted evidence now becomes compact `directive.commandBearingEvidence.v1` effect refs and named CORE `commandBearingEvidence` projections; the scheduler may build transient evidence state only to run closure review, then persists prompt metadata over the pre-evidence base so v1 evidence/review/mark roots do not become durable truth. Failed, rejected, stale, and unsafe accepted-batch paths no longer append old `runtimeTracking.sidecarJournal` rows; their durable evidence is CORE diagnostics/results and compact active-save projections. | Return to the remaining Wave 1 and Wave 2 authority blockers, then finish external-context ownership and live certification for Narrative Engine transfer rows. Keep LENS work focused on prompt ownership blockers, not generic rebuild polish. | More broad sidecar audits, generic prompt rebuild polish, or full live proof before Wave 1-3 blockers have owner/removal gates. |
| Narrative Engine transfer | Captured architecturally, not fully complete. Recall Index, LENS prompt budget lanes, structured retrieval metadata, scene/phase seals, pressure/arc digests, and Correct-as-Swipe now have focused implementation proof; witness-scoped fact depth and live/integration certification remain incomplete until their detail checklist and proof pass. | Assign Witness/Correction, External Compatibility, QA/live, and any remaining REPAIR/SRE workers through the transfer matrix; every slice must state owner, runtime path, storage boundary, invalidation behavior, proof gate, and code-reference decision. | Porting Narrative Engine's app/server/storage/UI/vector stack, treating optional semantic/vector hits as authority, or marking a feature complete because it is described in prose. |
| External-context compatibility | Compatibility is a proof boundary, not direct integration. The normalized evidence contract and redacted summary hardening are in plan/proof work; the full 52-turn run still needs all target tools represented through redacted host-observable evidence. | Keep ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox in the External Compatibility and QA/live worker lanes; prove prompt-key preservation, visibility semantics, latency attribution, unavailable/disabled states, and redaction without private internals. | Calling extension internals, importing generated memories/summaries/vector hits, storing raw external prompt/vector content, or treating external tools as Directive truth. |
| Certification | Blocked by implementation until Waves 1-3 exit. Bounded three-turn and single-lane artifacts are useful regression evidence, not completion. | Run deterministic preflights, strict single-lane rehearsal, and bounded proof only after they answer a named release blocker. Start the full five-user, 52-turn Ashes run only after Wave 1-3 blockers are gone or classified proof-only. | Starting a multi-hour live run to discover missing implementation, using `default-user`, or accepting count-only/summary-only proof where CORE projections are required. |

July 1/2 contradiction continuity/response demotion supersedes any older board wording that still groups old response recovery payloads, ingress recovery patches, rejected claims, projection hints, fact-use stats, or dispatcher-local generated-claim quarantine with remaining response-dispatch compatibility debt. Valid CORE-backed contradiction response duplicate/recovery status, ingress recovery status, and continuity recovery projection now come from CORE read projections; response dispatch no longer imports `claim-quarantine.mjs` or writes old continuity candidate/rejected claim roots.

Current next-slice order under time pressure:

1. Return to the remaining Wave 1 and Wave 2 authority blockers: full runtime resume/replay semantics across production paths, direct old-ledger writers not yet replaced by CORE projections, final bounded reducer/event mechanics application, and old rollback/recovery projection writes that still mirror after REPAIR/CORE authority.
2. Finish the remaining Wave 3 LENS/FORGE and Narrative Engine transfer gaps through owning systems rather than standalone modules: prompt budget lanes, external-context diagnostics, Recall Index invalidation, witness/correction in SRE/REPAIR, scene/phase seal storage beyond refs where needed, and optional semantic candidates behind deterministic-first gates.
3. Run the external-context compatibility proof workstream only after deterministic owner paths can expose redacted prompt-environment evidence without private extension internals.
4. Start Wave 4 proof only after the implementation exists: strict preflights, one rehearsal lane, bounded multi-lane proof if useful, then the full non-human five-user Ashes certification and release bundle.

#### Narrative Engine Capture Audit

This audit answers whether the Narrative Engine features are sufficiently captured. The answer is: captured architecturally, not yet fully implemented. Rows below remain active until their completion gates pass.

| Feature | Capture status | Missing before implementation can be called complete | Finish wave |
| --- | --- | --- | --- |
| Hybrid scene recall | Captured as Directive Recall Index over CORE/Frame/package/scene-seal/reviewed-import evidence. | Store/query/result contracts must prove deterministic scoring, invalidation/fork on edit/delete/swipe/branch/Save As, bounded previews, no raw transcript archive, and 5000-message segment budgets. | Waves 1 and 3, proof in Wave 4. |
| LENS prompt budget lanes | Captured as LENS-owned prompt inclusion, omission, cache input, and overflow trace. | Prompt builder must route through budget lanes; overflow policy, protected-lane behavior, token-estimator tolerance, cache-key inputs, and no raw prompt-body storage need focused tests. | Wave 3, proof in Wave 4. |
| Witness-scoped facts | Captured through `knownBy`, `witnessedBy`, `subjectIds`, `disclosureState`, and active-cast/protected-continuity filtering. | Fact schemas/materializers need migration rules from current visibility labels, anti-telepathy tests, false-belief/inferred handling, and contradiction precedence. | Wave 2 and Wave 3, proof in Wave 4. |
| Scene/phase seals | Captured as FORGE background settlement records feeding Recall Index and LENS dirty domains. | Trigger/debounce rules, merge/supersede behavior, artifact segment retention, stale skip, idempotent replay, and one CORE background batch/one LENS dirty output need focused proof. | Wave 3, proof in Wave 4. |
| Pressure/arc digests | Captured as FORGE pressure/open-thread/callback/arc/Command Bearing digest refs. | Trigger expansion beyond the current bridge, auxiliary artifact storage, prompt cache revision behavior, and scale impact proof remain open. | Wave 3, proof in Wave 4. |
| Correct-as-Swipe | Implemented at deterministic depth, with bounded live proof hook in place. `correctAsSwipe.propose` accepts selected-source refs, SRE evidence verdicts, and proposed candidate prose; appends an unselected assistant swipe with compact provenance; stores compact correction cases; writes CORE diagnostics when possible; supports REPAIR reject/expire lifecycle; recognizes selected candidate swipes by index plus selected-text hash; exposes an assistant-scoped highlighted-selection UI affordance; and `tools/scripts/test-correct-as-swipe-live.mjs` verifies served-copy freshness, browser selection, UI candidate append, unselected host swipe state, raw-content redaction, and runtime selected-swipe event-bridge acceptance on a live bound campaign. The native runner now opens explicit non-human Ashes save/chat bindings, requires served-copy freshness, rejects `default-user`, accepts CORE/ledger-recorded host-generation rows as eligible natural targets, rejects arbitrary unrecorded assistant rows, and fails before candidate append unless the target is the latest eligible assistant row because SillyTavern text swipe buttons are bound only to `.last_mes`. It also has an opt-in setup mode that posts a setup-only latest Directive-owned response through the host adapter, records a response-ledger target via runtime test hook, uses the exact setup response id to avoid positional host-id ledger collisions, dismisses Directive preset-update overlays that can block native controls, and reports only ids/hashes/counts. Strict setup-assisted live proof passed on `directive-soak-b` at `artifacts/live-smoke/selected-swipe-actuation/2026-07-02T23-41-07-914Z/selected-swipe-actuation-report.json`. Natural latest-response live proof passed on `directive-soak-b` at `artifacts/live-smoke/selected-swipe-actuation/2026-07-03T00-11-15-605Z/selected-swipe-actuation-report.json`: served-copy fresh, `targetSetup: null`, `defaultUserTouched: false`, latest CORE-recorded Ashes host-generation row `51`, native `.last_mes .swipe_right` actuation, selected index `0 -> 1`, `nativeHostControlMoved: true`, `sourceIntegrity: "clean"`, and no diagnostic fallback. | Natural selected-swipe actuation is now proven. Remaining Correct-as-Swipe work is release-bundle integration, optional non-matching swipe live evidence, and preserving deterministic fallback proof for ordinary selected-swipe REPAIR cases. | Wave 4 proof. |
| Structured lore/RAG metadata | Captured as package/dataset/reviewed-import retrieval facets consumed by Recall Index and LENS. | Schema/loader/query gates must define retrieval mode, priority, linked actors/locations/missions/phases/tags/keywords/audience/knownBy/source authority/RAG hints without importing ST Lorebooks by default. | Waves 1 and 3, proof in Wave 4. |
| Optional semantic/vector candidates | Captured as feature-gated, deterministic-first, non-authoritative candidate evidence. | Disabled-by-default flag, timeout/error budget, redaction canary, deterministic-first ranking, and reviewed-import promotion path remain open. No required vector database is allowed. | Wave 3 or later micro backlog; proof only if enabled. |
| Code borrowing policy | Captured as reference/reimplement by default. | Any copied or closely adapted pure function needs source path/commit, MIT attribution, isolation behind Directive contracts, owning test, and release-check ledger. | Applies to all waves. |

Narrative Engine rows are not release-blocking because they are novel by themselves. They are release-blocking only where they are part of the redesign promise: 5000-message recall without transcript duplication, prompt budget honesty, source-safe witness knowledge, nonblocking scene compaction, evidence-backed correction, and no second application architecture.

#### Finish Scoreboard

Agent-0 should update this scoreboard at the start and end of each implementation slice. It is intentionally more concrete than the proposal so the redesign cannot drift into broad documentation while runtime ownership is still incomplete.

| Item | Current classification | Required next evidence | Owner |
| --- | --- | --- | --- |
| CORE/v2 runtime authority | Implementation blocker until full runtime resume/replay semantics and direct old-ledger writers no longer depend on old ledgers. Current focused proof now covers gated authoritative CORE runtime projection markers, active-save CORE-only/merge rules, response/recovery projection closure for hostContinue/retry/recovery, compact rerun snapshot markers, outcome-replacement persist-failure recovery, outcome replacement replay tuple validation, recovery/source-restart persist rollback, and resolved recovery replay after visible response, source restart, or rollback. | Next evidence should prove remaining production resume paths, old-ledger writer removal, final bounded reducer/event mechanics application, and 5000-message hot-write/read budgets without full-save rewrite. | Agent-0 plus CORE Storage/Runtime workers. |
| REPAIR/SRE ownership | Implementation blocker until remaining old recovery ledgers are pure projections. Host-native contradiction verdicts now come from SRE through `source-review-worker.mjs`, supplied SRE reviews require source/text-hash match, recovery policy/CORE recovery enters a named REPAIR boundary before compatibility projection updates, valid contradiction, host-native unavailable/failed, provider-failure-after-mechanics, and generic CORE-backed `hostResponsePostFailure` recovery rows now come from CORE projections rather than `runtimeTracking.recoveryJournal`, missing or incomplete REPAIR projection bundles fail closed through sanitized hash-only projection, terminal checkpoint replay now requires REPAIR actuation before restore/persist/prompt sync, rejects missing CORE refs and generic history snapshots, writes/reuses CORE/v2 checkpoint refs during terminal detection, and restores only through `runtime-app`'s storage loader, rerun preview and committed outcome delete use CORE checkpoint refs instead of old turn-ledger snapshots, Scene Handshake prompt-sync failure now records CORE/REPAIR turn-processing recovery without old revision restore, production chat-turn latest-pair settlement defaults to `sourceSettlementLatestPair`, production latest-pair caller routing now enters the `source-settlement-latest-pair` owner adapter instead of importing the legacy Scene Handshake settler directly, visibility-only external metadata no longer re-enters normal turn observation, Scene Handshake/Mission Component dependent invalidation now comes from REPAIR id/status projection at focused-test depth, committed outcome delete now fails closed unless CORE transaction, CORE checkpoint ref/artifact, retained snapshot evidence, REPAIR authorization, CORE recovery, and CORE rollback actuation evidence exist before restore runs, checkpoint-backed player-source rollback now loads CORE checkpoint restore state through message recovery, history-only player-source rollback fails closed without mutation/persist/prompt-sync/CORE rollback actuation, checkpoint-backed rollback no longer appends old `restoreRevision` recovery-journal rows, CORE-backed no-outcome player-source mutations and CORE-recorded committed source mutations no longer write old recovery-journal rows, CORE-backed turn-processing failures no longer write old recovery-journal rows, REPAIR-owned dependent invalidation no longer writes old Scene Handshake/Mission Component recovery-journal rows, response dispatch no longer imports or calls `recordRecoveryEvent(...)`, deterministic CORE-backed `hostResponsePostFailure` retry can regenerate `locationTransition` visible pacing from a compact non-raw CORE `responseRetryPlan`, and model-backed committed/director retry regenerates visible narration from compact committed-outcome evidence without rerunning mechanics. | Deterministic mutation/retry/swipe/contradiction/visibility fixtures prove no mechanics rerun, no dependent-edit reobserve loop, no visibility-only normal-turn replay, CORE-first recovery, SRE source verdicts, REPAIR-owned recovery policy, REPAIR-owned dependent invalidation, checkpoint-backed rollback handoff, no old restoreRevision rollback journal append, no old recovery rows for CORE-backed no-outcome or committed source mutations, no old recovery rows for CORE-backed turn-processing failures, no old recovery rows for REPAIR-owned dependent invalidation, no old recovery rows for CORE-backed host-native unavailable/failed observations, no old recovery rows for CORE-backed provider-failure-after-mechanics retry, no old recovery rows for CORE-backed generic post failure, no old recovery rows for dispatcher CORE/diagnostic failure lanes even when CORE diagnostics are unavailable, non-raw deterministic and model-backed retry regeneration, CORE/REPAIR recovery projections in live mutation proof consumers and release-bundle preflight, and SRE-owned settlement decisions. Next proof debt: remaining old-ledger read/projection demotion plus live certification depth. | Agent-0 plus REPAIR/SRE workers. |
| FORGE/LENS ownership | Implementation blocker until remaining prompt rebuild ownership, prompt budget/cache lanes, external-context cache identity, and auxiliary background artifacts are fully cut over from temporary bridges. Ordinary accepted batches, Command Bearing accepted evidence, Command Bearing closure reviews, and rejected/failed/stale sidecar paths no longer persist old v1 evidence/review roots or old sidecar-journal rows. | FORGE/LENS tests prove source-current guards, one accepted batch result, stable idempotency, no raw diagnostics, no ordinary v1 root projection writes, no v1 Command Bearing evidence/review ledger/mark persistence, CORE-owned rejection/failure diagnostics, one prompt rebuild, prompt metadata preservation, and prompt-key coexistence. | Agent-0 plus FORGE/LENS workers. |
| Narrative Engine transfer | Mixed implementation/proof blocker until every transferred feature passes its owner-specific completion gate. | Transfer Completion Matrix rows show owner, storage boundary, invalidation, runtime path, proof, and code-reference policy; 5000-message scale includes recall, budget, witness, seal, correction, and structured retrieval artifacts. | Recall/Budget, Witness/Correction, FORGE/LENS, REPAIR/SRE workers. |
| External-context compatibility | Proof blocker until all target tools have one normalized evidence contract across fixture prep, browser probes, prompt snapshots, readiness, and generation proof. | Redacted external-context summary and full-certification artifacts prove ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox coexistence without private internals, raw content, or Directive authority confusion. | External Compatibility and QA/live workers. |
| Certification | Blocked by implementation until Waves 1-3 exit. | Alpha gate, strict single-lane rehearsal, bounded proof only if useful, then full 52-turn five-user Ashes proof using non-human users. | Agent-0 plus Wave 4 worker pack. |

Classification rules:

- Implementation blocker: target owner cannot yet own its work or old authority still writes first.
- Proof blocker: implementation appears present, but deterministic/scale/live evidence is missing.
- Integration backlog: old/new handoff is incomplete but safe to defer to the next integration window.
- Micro backlog: edge behavior, polish, or broader fixture depth that does not change owner authority.
- Out of scope: useful idea that does not advance CORE, Frame, SRE, REPAIR, FORGE, LENS, external compatibility, Narrative Engine transfer, migration cutover, or certification.

#### Finish-Time Execution Controls

Use these controls when time is short. They are meant to keep the redesign moving toward full implementation without turning the plan into either release-proof busywork or another serial micro-fix loop.

| Control | Required behavior | Failure signal |
| --- | --- | --- |
| Keep one critical path | Every active slice must advance CORE/v2 authority, REPAIR/SRE ownership, FORGE/LENS ownership, Narrative Engine transfer contracts, migration cutover, or certification readiness. | Work is useful but cannot be placed in one of those buckets. |
| Bias toward pre-alpha cutover | Because Directive is still pre-alpha, redesign slices should replace old paths in place once the new authority has focused proof. Old systems stay only as temporary bridge projections, named fallback gates, or migration evidence while callers, tests, and docs are updated to the target design. | A slice spends time preserving old behavior for hypothetical legacy users instead of completing the target architecture. |
| Start each slice with an agent pack | Any slice with two or more disjoint lanes launches workers before Agent-0 begins deep serial inspection. | Agent-0 is personally auditing storage, prompt, recovery, proof, and docs in the same pass. |
| Use integration windows deliberately | Shared runtime files are edited by Agent-0 during named windows after worker findings are queued. | Multiple workers or follow-on edits touch the same hot file without a freeze plan. |
| Stop running release proof as development proof | Full alpha/live gates run only at integration, scale, and certification gates. Macro slices run syntax, contract, redaction, size, and gross-path checks. | A broad live or alpha run is started to answer a question a focused deterministic test could answer. |
| Reject optional-feature drift | Narrative Engine and external-context work enters only through the named architecture owners and gates. | Recall, prompt budget, witness, seal, correction, or external-context behavior is implemented as a side subsystem with its own authority. |
| Require two-review acceptance for code slices | Every nontrivial behavior patch goes through implementation worker, spec reviewer, and code-quality reviewer before Agent-0 accepts it. | A patch is kept because the focused test is green while review has found an unaddressed ordering, authority, redaction, or scale risk. |
| Treat bridge split-brain as a macro blocker | Any CORE/FORGE/REPAIR/LENS bridge that can durably commit one side while the other fails must define preflight, transactionality, compensation, or fail-closed behavior before the patch lands. | A slice says "best effort" for authoritative CORE/FORGE settlement or tests only the easier failure direction. |
| Keep deferred work visible | Every skipped edge case has owner, current bridge, target owner, safe-deferral reason, and catch gate. | A failure is known only in chat history or a worker handoff, not in the plan/status board. |

Current finish-critical path:

1. Finish Wave 1 CORE/v2 runtime authority by keeping first-turn CORE/v2 bootstrap, source-frame scope validation, hot `beginTurn(...)` append, runtime bridge load/recovery, manifest freshness, Save/Save As/autosave v2 authority, explicit v1 checkpoint fallback gates, response recovery duplicate replay, and CORE-projection freshness arbitration in regression while closing full runtime resume semantics and broader durable turn lifecycle ownership in CORE.
2. Finish Wave 2 REPAIR/SRE ownership for generic retry/rerun, rollback execution, dependent source mutation, visibility-only source changes, selected-swipe/range review, and host-native contradiction review.
3. Finish Wave 3 FORGE/LENS ownership for background batching, completed accepted-batch bridge-consistency proof, scene/phase seals, pressure/arc digests, recall revisions, prompt budget lanes, external-context cache identity, prompt cache inputs, and prompt-key coexistence, then remove any remaining prompt/runtime dependence on temporary compatibility validation state.
4. Complete the Narrative Engine transfer inside those owners: Recall Index, budget lanes, witness-scoped facts, scene/phase seals, pressure/arc digests, structured retrieval metadata, optional semantic candidates, and Correct-as-Swipe.
5. Execute migration cutover so old hot writes are removed, gated, or demoted to compatibility projections.
6. Run Wave 4 proof only after the implementation exists: deterministic preflights, strict single-lane rehearsal, bounded proof if useful, full five-user Ashes certification, release bundle, and docs promotion.

Do not broaden the design again unless the new requirement blocks one of those six items. If a new idea is useful but not blocking, add it to the integration or micro backlog with a target owner.

#### Finish Slice Intake Checklist

Every new implementation slice must pass this intake before Agent-0 or a worker starts deep inspection. The purpose is to keep time pressure from turning into either broad redesign drift or narrow green-test busywork.

```text
Finish Slice Intake
slice id:
target wave:
target stage:
target owner system:
blocker removed:
primary runtime seam:
current bridge being removed or constrained:
slice timebox:
required worker pack:
Agent-0 frozen files:
worker-owned files:
reviewers required:
minimum proof level:
selected verification commands:
broad proof explicitly deferred:
stop-after evidence:
deferred issues and catch gate:
Narrative Engine transfer impact:
external-context compatibility impact:
scale/save-size impact:
stop condition:
```

Required answers:

- `target wave` must be one of CORE Runtime Authority, REPAIR/SRE Ownership, FORGE/LENS Completion, or Proof And Certification.
- `blocker removed` must name a real architecture blocker, such as old-ledger authority, prompt rebuild churn, hot-save bloat, source-mutation loop risk, split-brain bridge ordering, missing recall/budget/witness/seal/correction contract, or missing certification evidence.
- `slice timebox` must state the expected implementation/review window and the fallback if the slice overruns: reduce scope, classify blockers, or defer micro issues. Open-ended exploration is not a valid timebox while Wave 1-3 authority blockers remain open.
- `required worker pack` must match the table below unless the slice is docs-only, mechanical, or constrained to one shared hot file.
- `minimum proof level` must match the pass: syntax/contract/redaction/size/gross-path proof for macro work, focused deterministic suites for integration work, and alpha/scale/live proof only for micro/certification work.
- `selected verification commands` must name the exact focused commands to run for the slice. During macro work this should usually be syntax checks, contract-shape tests, targeted redaction/size checks, and one gross-path check if wiring changed.
- `broad proof explicitly deferred` must name any alpha gate, broad focused suite, scale harness, or live proof being skipped and the phase gate where it will run. A skipped broad proof is acceptable only when the selected commands catch the slice's safety risks.
- `stop-after evidence` must state the maximum proof needed before moving on, such as "two focused tests plus node --check" or "reviewer-approved redaction canary." Do not keep adding proof after this point unless a selected command fails or a reviewer finds a macro blocker.
- `Narrative Engine transfer impact` must say whether the slice advances, defers, or does not touch Recall Index, prompt budget lanes, witness-scoped facts, scene/phase seals, pressure/arc digests, structured retrieval metadata, optional semantic candidates, or Correct-as-Swipe.
- `external-context compatibility impact` must say whether ST Lorebooks/World Info, Memory Books, Summaryception, or VectFox prompt ownership, visibility, latency attribution, or redaction proof is affected.
- `stop condition` must be concrete. Examples: "reviewer finds untested split-brain ordering," "old full-save hot rewrite remains," "raw text canary appears in CORE/LENS/FORGE artifacts," or "slice cannot be placed in a finish wave."

Do not start a slice whose only stated value is "investigate," "clean up," "make tests greener," or "improve docs" while Wave 1-3 authority blockers remain open. Convert that work into a named worker audit with a bounded handoff, or defer it to Wave 4/Stage 14.

#### Agent Use Under Time Pressure

Short time does not mean fewer agents. It means fewer open-ended agents.

| Situation | Required agent use | Time control |
| --- | --- | --- |
| Two or more disjoint implementation lanes | Launch the matching worker pack before Agent-0 performs serial deep inspection. | Each worker gets one owner system, allowed files, forbidden files, proof commands, and a handoff template. |
| Read-only explorer audit | Use only for a bounded question that will change the current slice plan. | Ask for exact refs, concrete blockers, and suggested gates; do not wait on broad tours while Agent-0 has non-overlapping implementation work. |
| One shared hot runtime seam | Agent-0 edits the shared files; workers may inspect or write disjoint tests only. | Freeze shared files and require spec/code-quality review before accepting behavior changes. |
| Bridge ordering, storage authority, raw redaction, or source-truth risk | Use implementation worker plus separate spec and code-quality reviewers. | Reviewers must reject untested failure ordering, raw payload leaks, duplicate authority, or unbounded artifacts even if focused tests pass. |
| Certification/preflight/live proof | Use QA/live workers separate from implementation workers. | Do not start full proof until the implementation wave exit gate says the system is ready for judgment. |
| Docs-only update | Agent-0 can patch directly. | Keep it linked to a wave/stage and do not let docs work replace missing runtime work. |

If the available worker count is lower than the recommended pack, reduce the slice. Do not keep the same slice size and compensate by doing all inspection, implementation, tests, and documentation inside Agent-0.

#### Required Agent Packs By Finish Wave

These are the minimum useful worker packs for the remaining redesign. They refine the per-stage allocation matrix for the current finish strategy.

| Finish wave | Agent pack | Agent-0 owns | Worker handoffs |
| --- | --- | --- | --- |
| Wave 1: CORE Runtime Authority | CORE Storage worker, CORE Runtime worker, QA/scale worker. Optional read-only freshness auditor when bridge semantics are uncertain. | Shared storage/runtime integration, fallback semantics, v1/v2 ownership decisions, final test selection. | Freshness/fallback matrix, v2 manifest/head/event hash gaps, save/autosave/Save As ownership gaps, 5000-message budget risks. |
| Wave 2: REPAIR/SRE Ownership | REPAIR policy worker, SRE source-integrity worker, mutation/retry QA worker. Optional Correct-as-Swipe worker when candidate swipe flow is active. | Recovery authority, old-ledger projection demotion, shared orchestrator/reconciler/dispatcher edits. | Retry/rerun/rollback decision table, source mutation fixtures, stale/hidden/summarized visibility cases, correction-case contract. |
| Wave 3: FORGE/LENS Completion | FORGE worker, LENS prompt-budget worker, Recall/Budget worker, External Context worker. | Runtime prompt/background integration, prompt-key ownership, CORE/LENS/FORGE handoff semantics. | Batch settlement inventory, prompt budget trace gaps, recall/scene-seal/pressure revision gaps, external-context redaction and latency evidence. |
| Wave 4: Proof And Certification | QA/live worker, story/factual review worker, external-context proof worker, release-bundle worker, docs worker. | Pass/fail judgment, non-human soak-user selection, proof interpretation, final docs authority. | Deterministic preflight results, single-lane rehearsal evidence, full-depth artifact gaps, mutation/terminal/Command Bearing bundle status, docs promotion diff. |

If fewer workers are available, reduce the slice scope. Do not keep the full slice and compensate by letting Agent-0 serialize every lane.

Current Wave 1 focus should remain narrow and architectural:

1. Keep first-turn CORE/v2 bootstrap explicit and regression-covered, including source-frame campaign/save/chat scope validation and hot `beginTurn(...)` append after the initial full CORE layout publication.
2. Keep materialized-head freshness and runtime-resume rules enforced, including stale `v2ManifestRef` fallback, manifest-owned reload after hot append, bounded current-tail projection hydration, and the rule that preserved materialized heads are checkpoints/caches rather than current turn authority.
3. Keep old ingress/response/runtime ledgers as compatibility projections only. Response-dispatch recovery duplicates and runtime freshness over old ledger counts are now focused-test covered; remaining Wave 1 authority risk is any broader response, recovery, resume, or background lifecycle path that still treats old ledgers as durable truth.
4. Preserve save, autosave, manual Save As, v2 active-state, State Safety checkpoint, and CORE manifest ownership boundaries.
5. Prove the 5000-message hot-write/read budget without full-history rewrites or raw transcript/provider/replacement-text leaks.
6. Verify v2 runtime bridge refs before trusting them: stale save-index `v2ManifestRef` hashes, corrupt materialized heads, corrupt event segments, missing manifests, and mismatched campaign/save/chat ids must either fail closed or fall back only to the explicit v1 checkpoint path.

Do not spend Wave 1 time on prompt wording, broad UI polish, live release certification, or proof-pipeline refinements unless the board classifies the issue as a macro blocker.

### Parallel Build Waves

Use waves instead of a continuous trickle of seam rewrites:

| Wave | Agent-0 role | Worker role | Output | Verification |
| --- | --- | --- | --- | --- |
| 0: Control board | Freeze shared files, record dirty state, assign lanes. | None or QA baseline. | Board with active workers, frozen files, blockers, known reds. | `git status --short`; doc/scaffold checks as needed. |
| 1: Independent system build | Issue role-first prompts and file scopes. | Build contracts/modules/fixtures in disjoint lanes. | Importable macro systems with synthetic tests. | Syntax, contract-shape, redaction, size fixtures. |
| 2: Handoff review | Classify worker output. | Provide findings, risks, tests, and integration requests. | Integration queue and deferred micro board. | Agent-0 review, not broad alpha gate. |
| 3: Integration window | Freeze shared runtime files and wire systems in larger slices. | Inspect seams, write targeted fixtures, avoid conflicting edits. | Old paths moved behind new owners or projections. | Focused deterministic suites for wired systems. |
| 4: System proof | Decide whether the integrated system is ready for judgment. | QA expands scale/live fixtures. | Scale and live proof candidates. | Scale gate, alpha gate, non-human live soak when ready. |
| 5: Micro hardening | Close deferred edge cases by owner. | Parallel edge-case/test/doc workers. | Recovery/detail polish and docs propagation. | Full focused suites, alpha gate, live certification. |

### Failure Classification

Every red test, known break, or worker finding must be classified before it can change the current slice:

| Classification | Definition | Action |
| --- | --- | --- |
| Macro blocker | Prevents the named system from owning its work, risks data loss, leaks raw content, breaks source authority, or blocks the primary vertical path. | Stop the slice and fix or redesign immediately. |
| Integration backlog | Old/new wiring mismatch, projection gap, duplicated bridge, or cross-owner handoff issue. | Record in integration queue and address during the next integration window. |
| Micro backlog | Edge recovery detail, exhaustive fixture, local UI projection, proof-pipeline refinement, or compatibility depth issue. | Record with owner and catch-gate; do not interrupt macro build. |
| Out of scope | Useful product work that does not serve the architecture redesign. | Record separately or drop. |

Temporary red entries need this shape:

```text
Known Red:
id:
test/artifact:
owner:
final target system:
current failing behavior:
why safe to defer:
catch gate:
removal condition:
```

### Integration Window Rules

An integration window is when Agent-0 deliberately wires independent macro systems into the real runtime. It should be short, frozen, and explicit.

Before opening:

- Choose one integration objective, such as "route prompt synchronization through LENS budget lanes" or "settle scene seals through FORGE/CORE."
- Freeze shared files that Agent-0 will edit.
- Tell workers which files are read-only during the window.
- Pull worker handoffs into an integration queue.
- Decide the targeted tests before editing.

During integration:

- Agent-0 owns shared runtime edits.
- Workers may inspect, write fixtures, or patch disjoint tests only when assigned.
- Do not chase unrelated red tests unless they are macro blockers.
- Prefer replacing old authority with new owner calls over adding compatibility fallbacks.
- Log any bridge that remains, with its removal stage.

After integration:

- Run the targeted deterministic suites for the wired systems.
- Update the board: completed, still bridged, integration backlog, micro backlog.
- Only run broad alpha/live gates when the integrated system is meant to be judged as a system.

### Definition Of Functional By Pass

The word "functional" must mean different things at different passes:

| Pass | Functional means | It does not mean |
| --- | --- | --- |
| Macro | The named owner exists, accepts/returns the right contracts, preserves safety invariants, and has synthetic proof. | The whole old app is green. |
| Integration | The real runtime path calls the new owner for the chosen slice, old authority is projection/bridge only, and focused tests pass. | Every edge case and live host path is hardened. |
| Micro | Edge cases, live proof, scale proof, redaction, docs, and alpha gate are release-ready. | New macro authority should still be changing shape. |

### Agent-0 State Board

Agent-0 should maintain this board at every stage start, worker launch, worker handoff, integration freeze, and stage close:

```text
Architecture Redesign Board
Pass:
Stage:
Stage gate:
Active workers:
- <worker id/name>: <lane>, <status>, <allowed files>, <expected handoff>
Frozen files:
Integration queue:
Deferred micro issues:
Known red tests/artifacts:
Remaining bridge code:
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
| Recall and prompt budget | Worker G after Frame/CORE contracts | Recall Index contracts, deterministic retrieval facets, LENS prompt budget traces, omission proof, scale fixtures | `src/retrieval/`, prompt builder tests, recall/budget tests |
| Witness and correction | Worker H after SRE/REPAIR contracts | witness-scoped facts, evidence verdicts, Correct-as-Swipe correction cases, candidate swipe provenance | `src/continuity/`, SRE/REPAIR tests, Define Selection/host swipe seams |

If agent capacity is limited, use this priority:

1. Agent-0 plus Contracts/Metrics.
2. Agent-0 plus CORE Storage.
3. Agent-0 plus CORE Runtime.
4. Agent-0 plus one REPAIR/SRE worker.
5. Agent-0 plus one FORGE/LENS worker.
6. Agent-0 plus Recall/Budget or Witness/Correction worker when Narrative Engine transfer contracts are active.
7. QA worker when deterministic gates are ready to prove, or earlier when scale fixtures can be built without shared runtime edits.

If the work is in an independent build wave and file scopes are disjoint, prefer running three to five workers rather than leaving Agent-0 to serialize research, implementation, and fixtures. If the work is in an integration window over shared runtime files, reduce concurrency and make Agent-0 the only shared-file editor.

## Per-Stage Agent Allocation

Agent counts below are expressed as `Agent-0 + N workers`. They are planning defaults, not a rigid law. Agent-0 may reduce concurrency when file scopes collide, but should not silently fall back to serial work during independent build waves.

Use these rules:

- Minimum staffing is the smallest setup that can make progress without losing control.
- Recommended staffing is the expected efficient setup for that stage.
- Stretch staffing is allowed only when file scopes are disjoint and handoffs can be reviewed cleanly.
- Agent-0 owns shared-file integration, final stage interpretation, frozen files, test selection, and stage closeout.
- Workers own lane-specific artifacts, tests, inspection, and patch candidates.
- If a worker cannot name its lane, allowed files, stop condition, and handoff artifact, do not launch that worker.

### Allocation Matrix

| Stage | Minimum | Recommended | Stretch | Recommended workers | Agent-0 owns | Do not parallelize | Handoff / merge condition |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Stage 0: Baseline And Control Board | Agent-0 only | Agent-0 + 1 | Agent-0 + 2 | QA baseline worker; optional dirty-tree/doc inventory worker. | Dirty worktree interpretation, pass selection, known-red classification, freeze plan. | Final ownership of uncommitted changes; live-user selection; blocker classification. | Board opened with pass, active workers, frozen files, known reds, bridge code, and next action. |
| Stage 1: Contracts And Metrics | Agent-0 + 1 | Agent-0 + 4 | Agent-0 + 5 | Contracts worker; external-context contract worker; Recall/Budget worker; Witness/Correction worker; QA fixture worker. | Final schema names, authority boundaries, test selection, shared contract module acceptance. | Runtime hot paths; package schema roots unless assigned; alpha-gate script edits. | Contract tests and fixtures exist; no behavior migration has started; raw-content redaction rules are explicit. |
| Stage 2: Scale Harness | Agent-0 + 1 | Agent-0 + 3 | Agent-0 + 4 | QA scale worker; storage-shape worker; recall/seal/budget fixture worker; optional external diagnostics fixture worker. | Scale thresholds, pass/fail interpretation, fixture realism decisions. | Runtime migration; threshold changes without Agent-0 approval. | 5000-message fixture fails naive full-save design and includes v2, recall, seal, budget, correction, and external diagnostics artifacts. |
| Stage 3: V2 Storage Substrate | Agent-0 + 1 | Agent-0 + 2 | Agent-0 + 3 | CORE Storage worker; storage QA/importer worker; optional logical-path review worker. | Manifest/checkpoint semantics, final storage API names, bridge safety. | Same storage files by multiple workers; `chat-turn-orchestrator.mjs`; `runtime-app.mjs`; `state-delta-gateway.mjs`. | Storage substrate passes synthetic tests; runtime is not yet routed through it except assigned bridge points. |
| Stage 4: CORE Store | Agent-0 + 1 | Agent-0 + 2 | Agent-0 + 3 | CORE Store API worker; projection compatibility worker; optional QA read-projection worker. | Transaction phase semantics, event envelope, idempotency, projection compatibility. | Live runtime migration until synthetic projections pass; old-ledger writes as new authority. | CORE Store records/replays synthetic turns and exposes projections without full-save writes. |
| Stage 5: Frame And Fast Gate | Agent-0 + 1 | Agent-0 + 2 | Agent-0 + 3 | Frame/source worker; fast-gate timing worker; optional QA route/timing worker. | Shared runtime integration, route ownership, exact hot-path tests. | Concurrent edits to `chat-turn-orchestrator.mjs`, `runtime-app.mjs`, runtime bridge, or response dispatch. | One primary `hostContinue` path builds Frame/CORE refs and releases generation without deep background waits. |
| Stage 6: Mechanics/Narration Split | Agent-0 + 1 | Agent-0 + 2 | Agent-0 + 2 | Mechanics/narration worker; QA retry/provider-timing worker. | Mechanics/narration boundary, response idempotency, provider timing interpretation. | Multiple workers editing commit/narration hot path; retry semantics. | `directiveCommit` records generation start before provider completion and retry does not rerun mechanics. |
| Stage 7: REPAIR Skeleton | Agent-0 + 1 | Agent-0 + 3 | Agent-0 + 4 | REPAIR policy worker; message/source fixture worker; Correct-as-Swipe/correction-case worker; optional QA regression worker. | Recovery product path, CORE-first recovery ownership, dependent-edit policy. | Direct source mutation policy in scattered callers; assistant text mutation; mechanics rerun decisions. | Sam Vickers dependent-edit loop is covered by deterministic fixture; REPAIR owns recovery/correction cases. |
| Stage 8: SRE | Agent-0 + 1 | Agent-0 + 2 | Agent-0 + 3 | SRE facade worker; selected-swipe/range fixture worker; optional witness/evidence verdict worker. | Settlement modes, source-integrity hard-skip rules, SRE/REPAIR boundary. | Prompt install; response posting; rollback/replay policy; CORE storage substrate. | Latest-pair/range preflight or settlement uses one source-integrity authority and never auto-applies stale sources. |
| Stage 9: LENS | Agent-0 + 1 | Agent-0 + 3 | Agent-0 + 4 | LENS prompt scheduler worker; Recall/Budget worker; external prompt-environment worker; prompt-adapter QA worker. | Prompt ownership, cache-key rules, final prompt lifecycle integration, dirty-domain semantics. | Non-Directive prompt key clearing; simultaneous edits to prompt adapter lifecycle; hidden prompt body archival. | Prompt rebuilds are coalesced, budget traces exist, recall inclusion is traceable, and external prompt keys survive clear/rebuild. |
| Stage 10: FORGE | Agent-0 + 1 | Agent-0 + 3 | Agent-0 + 4 | FORGE coordinator worker; scene/phase seal worker; cancellation/stale-source worker; QA batch fixture worker. | Background ownership, aggregate settlement semantics, LENS dirty handoff, source-token policy. | State mutation outside CORE/FORGE; worker prompts/schema merge into one generic sidecar; foreground waits. | Background work batches one settlement/diagnostic/prompt-dirty result; scene seals and digests settle without blocking visible generation. |
| Stage 11: Open-World Reducers | Agent-0 + 1 | Agent-0 + 2 | Agent-0 + 3 | Reducer/event worker; mission/open-world regression worker; optional recall-facet projection worker. | Reducer contracts, event shapes, branch/checkpoint policy. | Broad `rootsSet` compatibility; direct runtimeTracking writes; concurrent edits to reducer core files. | Open-world commits bounded events with recall/seal facets and no broad root replacement in v2 hot path. |
| Stage 12: Migration Cutover | Agent-0 + 1 | Agent-0 + 2 | Agent-0 + 2 | Migration/cutover worker; projection/UI compatibility worker. | Cutover switch, old write-path removal, final bridge decision, alpha-gate timing. | Broad parallel edits to shared runtime/storage files; autosave semantics without explicit decision. | Runtime uses CORE/v2 by default, old hot-write paths are removed or fail closed, and remaining bridges are documented. |
| Stage 13: Scale And Live Proof | Agent-0 + 2 | Agent-0 + 5 | Agent-0 + 6 | QA scale worker; live soak worker; external-context proof worker; factual/story review worker; artifact/preflight worker; optional performance worker. | Certification interpretation, non-human soak-user selection, release/pass call. | `default-user` as soak proof; live proof against stale installed extension; changing product behavior during proof. | 5000-message scale, alpha gate, full-depth non-human live proof, external-context proof, and model-review gates pass or fail with concrete evidence. |
| Stage 14: Documentation And Cleanup | Agent-0 + 1 | Agent-0 + 3 | Agent-0 + 4 | Docs propagation worker; stale-doc audit worker; user-facing/manual worker; optional QA docs-link worker. | Final doc authority, documentation index, superseded-doc decisions. | Runtime behavior claims not backed by implementation proof; release notes/manifests unless assigned. | Planning decisions are promoted into durable manuals, stale docs are updated/superseded, and implementation status is accurate. |

### Stage Staffing Rules

Use the matrix at every stage start:

1. Pick minimum, recommended, or stretch staffing.
2. Write the chosen staffing on the Architecture Redesign Board.
3. Name every worker role and allowed file scope.
4. Name every shared file reserved for Agent-0.
5. Name the expected handoff artifact for each worker.
6. Name the first integration window before workers start editing shared-adjacent files.

If a recommended worker is unavailable, Agent-0 must either reduce the stage scope or explicitly accept slower serial execution on the board. Do not silently keep the full stage scope with fewer agents and then compensate by doing micro-first repairs.

### Worker Stop Conditions

Every worker prompt must include one of these stop conditions:

| Stop condition | Use when |
| --- | --- |
| Contract handoff | The worker has produced schema/API/test proposals and should stop before runtime wiring. |
| Patch candidate handoff | The worker has changed only assigned files and run assigned checks. |
| Finding-only handoff | The worker inspected a risky area and should not edit. |
| Fixture handoff | The worker added deterministic fixtures/tests and should not change product behavior. |
| Integration request | The worker found a shared-file change that Agent-0 must perform. |

Workers should stop and hand off rather than opportunistically following issues into another lane. Cross-lane findings go into the integration queue unless Agent-0 reassigns scope.

## External Context Compatibility Workstream

This workstream implements the compatibility boundary defined in [Architecture Redesign Proposal](ARCHITECTURE_REDESIGN_PROPOSAL.md#external-context-extension-compatibility). It is not a plan to absorb ST Lorebooks, Memory Books, Summaryception, or VectFox into Directive. Users may want those tools for context extension, so Directive must coexist with them while preserving its own authority, source identity, prompt ownership, latency metrics, and storage scale targets.

Core rule:

```text
External context may influence generation.
Only Directive-owned records may influence Directive authority.
```

Implementation support means Directive must tolerate and account for these tools as part of the host environment. It does not mean the first redesign wave operates them directly.

| Support scope | Implementation meaning | Gate that proves it |
| --- | --- | --- |
| Must coexist | Known tools can be installed, enabled, disabled, unavailable, or active without corrupting Directive turns, prompts, saves, or recovery. | Prompt-key preservation tests, visibility-normalization fixtures, and non-human live readiness probes. |
| Must observe | LENS/Frame artifacts can report compact external-environment evidence and unknown/limited states without raw content capture. | `externalPromptEnvironment`, `external-context-summary.json`, prompt-inspection snapshots, and redaction canaries. |
| Must attribute | Directive timing separates fast-gate/narration-start budgets from host provider completion and external retrieval/interceptor/summarization work. | CORE timing proof plus live coordinator external-latency labels when observable. |
| Must bound | External diagnostics stay out of the hot save and cannot dirty mechanics or prompt rebuilds by themselves. | 5000-message scale fixtures and CORE diagnostic segment checks. |
| May interop later | Reviewed import/export can propose external material for user approval. | A future explicit proposal with source refs, hashes, approval state, and privacy review. |
| Must not depend | Runtime correctness cannot call private extension internals, require one Memory Books prompt key, trust generated memories, or block `hostContinue` for deep inspection. | Agent-0 rejects worker handoffs or patches that cross those boundaries. |

Implementation must avoid creating one bespoke compatibility path per extension. ST Lorebooks, Memory Books, Summaryception, VectFox, and unknown future tools need target-specific observers and fixtures, but they should all feed the same Frame/LENS/CORE diagnostic contract. Agent handoffs should therefore report target-specific fields as normalized evidence, not as new authority stores, new hot-save roots, or extension-owned turn flows.

Compatibility means Directive can share the SillyTavern context surface with these tools without owning them. Users may keep ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox active for context extension, but Directive must preserve its own prompt keys, source identity, recovery policy, storage budget, and latency metrics. This is not a requirement to directly integrate with those tools, call their internals, import their generated content, or make their summaries/vector hits Directive truth.

The practical boundary is:

| Concern | Directive behavior |
| --- | --- |
| Prompt ownership | Write, rebuild, and clear only `directive.*` prompt keys. Preserve host-owned World Info surfaces, `summaryception`, `3_vectfox*`, and unknown extension keys. |
| Source authority | Treat external lore, summaries, generated memories, and vector hits as possible generation influence, not committed campaign state. |
| Visibility | Normalize hidden, ghosted, summarized, unhidden, and prompt-excluded rows before REPAIR or SRE. A source row that still exists is not deleted solely because an extension hid it from prompt assembly. |
| Latency | Report Directive architecture latency separately from observable external interceptor/retrieval/model-call delay. |
| Storage | Store only bounded counts, hashes, statuses, refs, and redaction summaries. Never store raw external prompt bodies, generated Memory Book text, Summaryception summaries, vector payloads, embeddings, secrets, or hidden Director material. |
| Diagnostics/privacy | Treat external-context records as redacted evidence objects, not debug dumps. Redact raw lorebook text, generated memories, summaries, vector hits, embeddings, endpoint URLs, provider bodies, API keys, Qdrant secrets, and private extension state. |
| Unknown future tools | Preserve unknown non-Directive prompt keys and visibility markers when observable. Classify them as `unknownExternalContext` until a reviewed field contract exists. |

Prompt provenance has three implementation layers:

| Layer | Required implementation meaning |
| --- | --- |
| Directive-owned prompt packet | The LENS-built packet and revision from Directive state. This is what `promptContextRevision` or its v2 replacement identifies. |
| Host final prompt composition | The SillyTavern prompt after native World Info, Memory Books-created WI, Summaryception, VectFox, presets, Author's Note, example messages, and unknown contributors. This may differ from Directive's packet. |
| Model-visible generation environment | The generation path after host interceptors, retrieval hooks, provider transforms, and external extension work. This is influence and timing evidence, not CORE authority. |

Implementation guardrail:

| Question | Required answer before implementation |
| --- | --- |
| Does this feature need to call extension internals? | No, unless a later reviewed interop flow explicitly approves that dependency. Coexistence should use host-observable public surfaces and redacted diagnostics. |
| Does this content become Directive truth? | No, unless it enters a reviewed import/export proposal with provenance, approval state, and bounded source refs. |
| Does this observation block `hostContinue`? | No. Deep extension inspection belongs to LENS/readiness probes or cached compact refs, not the fast gate. |
| Does this write grow the hot save? | No. Store compact diagnostics in CORE/probe artifacts only; raw external context never enters hot save payloads. |
| Does this visibility change imply edit/delete? | No. REPAIR decides source mutation from host row existence, source ids, text hashes, selected variants, and explicit delete evidence. |

### Stage Mapping

| Stage | Compatibility work |
| --- | --- |
| Stage 1 | Define redacted external prompt-environment contracts, prompt-key ownership tests, visibility normalization fixtures, and live-probe artifact shape. |
| Stage 2 | Add bounded external diagnostics to 5000-message scale fixtures and prove they do not create hot-path full-save rewrites. |
| Stage 5 | Attach compact external environment refs to Frame without blocking hostContinue on deep extension inspection. |
| Stage 7 | Route extension visibility churn through REPAIR as visibility-only unless there is a true source mutation. |
| Stage 8 | Keep SRE source settlement based on Directive/host source tokens; external lore, summaries, and vector hits are non-authoritative evidence only. |
| Stage 9 | Make LENS the owner of prompt-key hygiene, prompt provenance wording, external-environment snapshots, prompt-order diagnostics, and compatibility warnings. |
| Stage 10 | Keep Summaryception, Memory Books, and VectFox outside FORGE unless a future reviewed-import/export flow explicitly converts material into Directive proposals. |
| Stage 13 | Capture live external-context probe evidence before soak turns and separate external interceptor/retrieval timing from Directive architecture latency. |
| Stage 14 | Document operator-facing compatibility, warnings, privacy boundaries, and prompt provenance after runtime behavior exists. |

### Implementation Crosswalk

The external systems are not being merged into Directive. The implementation merges only the Directive-side responsibilities that make coexistence safe: prompt ownership, source identity, visibility semantics, latency attribution, redaction, and bounded diagnostics.

| External system | Primary Directive owners | First implementation slice | Proof required |
| --- | --- | --- | --- |
| ST Lorebooks / World Info | LENS, Frame, SRE | Observe active/native World Info surfaces and preserve ST-owned prompt material through Directive prompt install/rebuild/clear. | Prompt-key/prompt-surface tests for `worldInfoBefore`, `worldInfoAfter`, at-depth keys, outlets, Author's Note, example-message influence, disabled/unavailable state, and conflicting lorebook facts remaining non-authoritative. |
| Memory Books | LENS, REPAIR, CORE | Treat Memory Books as a World Info producer with STMB metadata, risky-mode warnings, and range-validation diagnostics. | Fixtures for `stmemorybooks: true`, `STMB_start`/`STMB_end`, `chat_metadata.STMemoryBooks`, chat-bound `world_info`, generated-memory conflicts, stale/inverted ranges, side prompts, auto-hide/unhide, no dedicated prompt-key dependency, and no raw generated memory persistence. |
| Summaryception | REPAIR, LENS, SRE | Normalize ghosted/summarized rows as visibility mutations and preserve the `summaryception` prompt key. | Fixtures for prompt-key preservation, `extra.sc_ghosted`, `ghostedIndices`, summarized-only ranges, `is_system=true + is_hidden=false`, stale summaries after edit/swipe/branch, and no normal-turn reobserve loop after an edited dependent row. |
| VectFox | LENS, Frame, CORE | Observe vector prompt keys, generation-interceptor hints, external timing, and privacy settings without making retrieval blocking or authoritative. | Fixtures for `3_vectfox*` keys, disabled-present state, interceptor delay, Qdrant unavailable/cloud/local modes, prompt ghosting as prompt exclusion, selected-swipe/reroll mismatch, redacted vector diagnostics, and separate external latency accounting. |
| Unknown external context | LENS, Frame, REPAIR | Preserve unknown non-Directive prompt keys and visibility markers, record compact unknown-state diagnostics, and avoid private-extension dependencies. | Fixtures prove unknown keys survive Directive clear/rebuild, unknown prompt influence is marked non-authoritative, unknown visibility-only markers do not become source mutation without host row/text evidence, and redaction defaults closed. |

Execution decisions for the first implementation wave:

| Target | Do now | Defer behind reviewed interop | Do not do |
| --- | --- | --- | --- |
| ST Lorebooks / World Info | Preserve native prompt surfaces, record prompt-position/settings hashes, and keep conflicting lorebook facts non-authoritative. | Optional reviewed conversion of a lorebook entry into a Directive fact proposal. | Rewrite user lorebooks, clear WI surfaces, or assume WI equals committed campaign state. |
| Memory Books | Observe STMB World Info markers, chat metadata, risky modes, and stale range evidence. | Reviewed import/export of player-safe Command Log or CPM evidence. | Auto-import generated memories, write Memory Books entries by default, or trust STMB ranges after branch/edit/delete without validation. |
| Summaryception | Preserve `summaryception`, normalize ghosted/summarized rows, and mark stale summaries after source mutation. | Optional warning/review tools for stale external summaries. | Replace CORE/FORGE summaries, treat ghosted rows as deletes, or reobserve edited dependent rows as normal turns. |
| VectFox | Observe `3_vectfox*` prompt slots, prompt ghosting, backend mode, redacted settings, and external latency. | Export reviewed player-safe artifacts with campaign/save/chat/source metadata. | Import vector hits as truth, block hostContinue on vector retrieval, or assume vector indexes know Directive branch lineage. |

Implementation controls for the proposal's compatibility risk register:

| Control | Primary owner | Required proof |
| --- | --- | --- |
| Prompt-key preservation | LENS / host adapter | Deterministic prompt lifecycle tests show Directive clears only `directive.*` keys while native WI, `summaryception`, `3_vectfox*`, Memory Books-created WI, and unknown host keys survive install/rebuild/clear. |
| Source-existence normalization | REPAIR / SRE | Fixtures prove hidden, ghosted, summarized, unhidden, and prompt-excluded rows remain source rows unless the host transcript actually removes them. |
| Authority boundary | CORE / SRE | Tests prove external lore, STMB memory, Summaryception summary, or vector-hit conflicts can be recorded as diagnostics or review evidence without mutating committed campaign state. |
| Latency attribution | LENS / live QA | Live artifacts separate Directive release/narration-start latency from external interceptor, retrieval, summarization, vector, or provider delay when observable. |
| Storage budget | CORE / QA | 5000-message scale tests include external diagnostics and still show zero hot-path full-save rewrites, bounded diagnostics segments, and no raw external generated content. |
| Redaction/privacy | LENS / QA | Redaction canary fixtures prove API keys, Qdrant secrets, raw prompt text, Memory Books content, Summaryception summaries, vector payloads, provider errors, and hidden Director material are excluded. |
| Prompt provenance layers | LENS / Frame / live QA | Artifacts distinguish Directive-owned prompt packet revision, final host prompt composition, and model-visible generation environment. `finalHostPromptMayIncludeExternal` must never be read as Directive authority. |
| Non-authority diagnostics | CORE / QA | Schema and behavior tests prove `externalPromptEnvironmentRef`, `external-context-summary.json`, and prompt-inspection target summaries cannot dirty mechanics, create facts, satisfy source settlement, authorize rollback, or trigger prompt rebuild by themselves. |
| Live-proof honesty | QA / Agent-0 | Readiness distinguishes observability from fixture depth, generation proof requires target-specific pressure for rich fixtures, and `default-user` is never counted as soak proof. |

Agent usage for this crosswalk should be deliberately split:

- External Inventory agent: inspects installed/live SillyTavern surfaces and hands off observed fields, prompt keys, metadata markers, settings hashes, unavailable states, and redaction risks.
- Prompt/LENS agent: implements or audits prompt-key preservation, prompt provenance wording, external-environment snapshot shape, and diagnostic cache behavior.
- REPAIR/SRE agent: implements or audits source-existence versus visibility semantics, stale external ranges, Summaryception ghosting, Memory Books hide/unhide, and true-delete precedence.
- QA/Live agent: owns deterministic fixtures, redaction canaries, readiness artifact shape, five-user non-human soak evidence, and bounded versus full-certification semantics.

Agent-0 integrates the contracts, keeps external content out of Directive authority, and rejects patches that call private extension internals, copy extension implementation, persist raw external content, or move extension inspection onto the fast path.

### Agent Work Packages

Use agents for inspection and fixtures, but keep final integration in Agent-0:

| Agent lane | Assignment | Handoff |
| --- | --- | --- |
| Extension Inventory | Inspect installed SillyTavern extension surfaces for ST Lorebooks, Memory Books, Summaryception, and VectFox without copying implementation or raw user content. | Observable prompt keys, metadata fields, global signatures, settings hashes, unavailable signals, and redaction risks. |
| Prompt Hygiene | Audit host prompt adapters and prompt lifecycle tests. | Proof that Directive writes/clears only `directive.*` keys and preserves `summaryception`, `3_vectfox*`, native World Info, Memory Books, and unknown host-owned keys. |
| Visibility And REPAIR | Audit host-message normalization, edit/delete recovery, hidden/ghosted/summarized rows, and latest-boundary decisions. | Fixtures proving visibility-only changes are not deletes and true deletes dominate extension metadata. |
| LENS Diagnostics | Design compact external-environment snapshots, prompt-order diagnostics, and compatibility warnings. | Field list, redaction policy, cache/dirty-domain behavior, and warning matrix. |
| FORGE/Latency | Audit background workers and external model/retrieval timing boundaries. | Proof that external summarizers/vectorizers are observed separately from FORGE and not misattributed to Directive latency. |
| Live QA | Extend live readiness and soak artifacts. | Per-soak-user external-context probe, browser/disk hash comparison, unavailable reasons, and redaction summary. |

### Agent Audit Findings To Preserve

The June 28, 2026 extension-agent audit inspected `F:\SillyTavern\SillyTavern` and found that the compatibility workstream needs to be field-specific, not just extension-name-specific.

| Target | Agent finding | Implementation implication |
| --- | --- | --- |
| Native ST World Info | World Info can affect before/after prompt assembly, at-depth prompt keys, outlets, Author's Note, example messages, recursive scanning, and min-activation scanning. | LENS must snapshot WI settings/placement hashes and prompt-surface counts. Prompt clear/rebuild tests must preserve ST-owned WI surfaces, not only unknown extension keys. |
| Memory Books | The installed Memory Books copy primarily creates ST World Info entries and `chat_metadata.STMemoryBooks`; no stable Memory Books-specific `setExtensionPrompt` key was found. | Treat Memory Books as a World Info producer. Preserve `world_info` and STMB-marked entries; do not design around a single prompt key. |
| Summaryception | Summaryception writes prompt key `summaryception`, chat metadata, summary layers, `summarizedUpTo`, `ghostedIndices`, and `extra.sc_ghosted`. Persisted ghosted rows may show `is_system=true` while `is_hidden=false`. | REPAIR visibility normalization must key on Summaryception markers and preserved source ids/roles, not only `is_hidden` or `is_system`. |
| VectFox | VectFox writes `3_vectfox*` prompt slots, can register generation-path behavior, and can use Qdrant/vector storage, EventBase, semantic WI, summarizer injection, agentic retrieval, and prompt ghosting. | LENS records prompt-slot metadata and external timing; REPAIR treats prompt ghosting as prompt exclusion; CORE stores only redacted counts/hashes. |
| Live users | `default-user` contains the richest installed evidence. Current `directive-soak-*` users may have settings copied without matching extension directories or fixture data. | Stage 13 live proof must be per-user and browser/runtime-confirmed. Disk-present under `default-user` is not a pass for soak-user compatibility. |

### Durable Documentation Propagation

The redesign docs are the architecture authority, but the compatibility boundary must eventually move into the durable manuals after implementation proves the behavior. Agent audit, June 29, 2026: the core planning docs are aligned, while the following manuals still need explicit propagation work.

| Manual | Required addition |
| --- | --- |
| `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md` | Add an external prompt-environment note under Prompt Context / Host Boundary. State that Directive owns only its prompt packet/revision; final SillyTavern prompts may also include World Info, Summaryception, VectFox, Memory Books-produced WI, and other host material. Mention `externalPromptEnvironmentRef`, known external keys, redaction, and `finalHostPromptMayIncludeExternal`. |
| `docs/technical/HOST_INTEGRATION_MANUAL.md` | Add SillyTavern context-extension coexistence rules: preserve non-Directive prompt keys, observe host-visible surfaces only, avoid private extension APIs, classify browser/disk/settings-only evidence honestly, redact raw prompt bodies/secrets/vector payloads, and record disabled/unavailable states. |
| `docs/architecture/CHAT_NATIVE_RUNTIME.md` and `docs/technical/PLAYER_TURN_SEQUENCE.md` | Carry the source-versus-visibility rule into turn flow docs. Summaryception ghosting, Memory Books hide/unhide, VectFox prompt ghosting, and native hide are visibility mutations, not deletes; true deletes dominate metadata; external retrieval/interceptor delay is separate from Directive generation-start latency. |
| `docs/technical/STATE_TRANSACTIONS_AND_RECOVERY.md` | State that external context observations are diagnostics, not campaign state. Persist counts, hashes, statuses, and refs only; do not dirty prompts or mechanics merely because an external snapshot changed; reviewed import/export is the only future trust path. |
| `docs/technical/CONTINUITY_PROJECTION_MATRIX.md` | Add the external-context authority boundary: lorebook entries, generated memories, summaries, and vector hits may explain model influence but cannot satisfy CPM source ids, become accepted facts, replace CORE/FORGE summaries, or resolve contradictions without review. |
| `docs/testing/TESTING_STRATEGY.md` and `docs/testing/LIVE_CAMPAIGN_SOAK_TEST_PLAN.md` | Add observability versus `fixtureDepth`, non-human soak users, rich-active evidence per target, generation-time prompt snapshots, redaction canaries, and separate latency attribution for VectFox, Summaryception, and Memory Books work. |
| `docs/user/SILLYTAVERN_PRESET.md` | Add operator-facing wording that World Info placeholders remain enabled, external tools may still affect the final host prompt, Directive does not validate/import/repair their content, and diagnostics are provenance/privacy aids rather than authority. |
| `docs/DOCUMENTATION_INDEX.md` | Link the eventual compatibility note or updated manual sections so external-context compatibility is not discoverable only through planning docs. |
| `docs/design/MISSION_COMPONENTS.md` | Tighten the Memory Books wording: Memory Books may remain a prior-art UX reference, but Directive must not import, call, depend on, or repair Memory Books internals. |

### Diagnostic Object Contract And Wiring Gap

External compatibility cannot be proven by installed/active booleans alone. Rich active fixture proof needs the same bounded diagnostic objects at every layer that produces or consumes external-environment evidence:

| Object | Producer expectations | Consumer expectations |
| --- | --- | --- |
| `memoryBooks.rangeDiagnostics` | Prepared fixture snapshots, disk scans, browser probes, and external-context observer output should report status, entry range count, chat range count, valid/inverted/out-of-bounds/stale counts, and a hash over range refs only. | Fixture-depth and generation-proof checks treat `unknown` or `missing` as insufficient for rich Memory Books evidence. Stale or inverted statuses are evidence to warn on, not a reason to import memory as truth. |
| `summaryception.staleness` | Fixture snapshots, chat-metadata scans, browser probes, and host-message markers should report status, chat length, summarized-range-beyond-chat, stale-after-mutation, ghosted-system-visible count, and summarized-only count. | REPAIR/SRE checks use this as visibility/source evidence. Rich Summaryception evidence requires known staleness or ghost visibility diagnostics, not only a `summaryception` prompt key. |
| `vectFox.backendDiagnostics` | Fixture snapshots, settings scans, browser probes, and generation snapshots should report backend status, backend type label, unavailable flag, external timing observed flag, bounded timing values or buckets, and a hash/redaction summary. | LENS and live QA attribute possible delay to external retrieval/interception only when observable. Rich VectFox evidence requires a known backend/interceptor status, while disabled/unavailable states remain valid passive-coexistence evidence. |
| `unknownExternalContext` | Prompt observation should classify non-Directive prompt keys that are not recognized ST World Info, Summaryception, or VectFox surfaces as compact unknown external context. It stores counts, prefix hashes, prompt-key hashes, visibility-marker counts, and redaction reasons only. | Unknown future context tools may influence generation, but they remain diagnostics/provenance only. They must not become Directive authority, prompt dirty triggers, source mutation evidence, or raw prompt captures. |
| `diagnostics[]` | Every normalized target should also emit a shared `directive.externalPromptEnvironmentDiagnostic.v1` record with layer, target, status, source, merge source, evidence hash, `authority.directiveAuthority: false`, and `rawContentCaptured: false`. | Fixture prep, browser probes, prompt adapter summaries, readiness checks, and generation proof can consume one LENS/Frame diagnostic shape instead of inventing separate pass rules per layer. |

Agent finding, June 29, 2026: the implementation is vulnerable to a partial-wiring failure. `fixtureTargetEvidence()` can require `rangeDiagnostics`, `staleness`, and `backendDiagnostics` for rich evidence, but fixture producers and browser readiness capture can still omit those objects. In that state, `test-external-context-fixture-prep.mjs` fails for the right reason: the proof pipeline is stricter than the evidence producers. This is not a reason to weaken fixture-depth rules. It is a reason to make the normalized LENS contract the single source of truth.

Follow-up canary, June 29, 2026: partial browser diagnostics can also be misleading when they are object-shaped but still `status: "unknown"` or `status: "missing"`. A browser snapshot with unknown Memory Books range diagnostics, unknown Summaryception staleness, or unknown VectFox backend diagnostics must not mask richer disk/fixture evidence such as `valid`, `stale`, `disabled`, `unavailable`, or `local-backend-configured`. The merge rule is "best useful diagnostic wins": a known browser/runtime diagnostic wins over stale disk evidence, but an unknown browser placeholder falls through to the best bounded non-unknown source. Prompt-adapter target summaries must carry the same objects so generation proof cannot fall back to generic prompt-key presence.

VectFox has one extra guard: browser settings-only evidence must not be combined with disk backend type to synthesize a richer `external-backend-configured` result. If the browser only proves settings visibility, the diagnostic may say `observed`; richer backend status must come from the same browser/runtime observation, an explicit diagnostic object, or an explicit selected disk/fixture diagnostic.

Artifact-contract finding, June 29, 2026: the external-context proof family must not stop at prompt-inspection logs. The live soak schema must require `promptInspection`, `hostExtensions`, and the concrete `externalContextSummary` artifact; checkpoint snapshots must include `hostExtensions` and `externalContextSummary`; delegated smoke promotion must write and validate `host-extensions/external-context-summary.json` from sanitized prompt-inspection captures; and the five-user coordinator must expose `artifacts.hostExtensions` plus summary links to the readiness `host-extensions/external-context-probe.json`. This prevents the redesign docs from promising evidence that the report contract does not guarantee.

The implementation work is:

1. Propagate normalized diagnostics through `buildExternalContextBrowserProbe()` into both browser and combined external environments.
2. Seed `prepare-sillytavern-external-context-fixture.mjs` synthetic snapshots with stable diagnostics: Memory Books `status: "valid"`, Summaryception `status: "observed"` or a precise ghost/stale status, and VectFox `status: "local-backend-configured"` with a redacted fixture backend label.
3. Extend live readiness capture to return the same compact objects without raw prompt bodies, generated memory text, summary text, vector hits, embeddings, API keys, Qdrant secrets, collection names, raw endpoint URLs, stack traces, or provider error bodies.
4. Tighten generation rich pressure for rich fixture lanes only: Memory Books range status must be known and non-missing; Summaryception staleness must be known; VectFox backend status must be known and not an unexplained `unknown`. Do not require exact backend names, remote network success, or latency thresholds for certification.
5. Add focused tests for positive diagnostics, missing-diagnostic canaries, and "unknown browser does not mask richer disk/fixture diagnostic" canaries in `test-external-context-fixture-prep.mjs`, `test-live-soak-prep.mjs`, prompt-adapter tests, and the five-user coordinator contract tests.

Implemented bridge slice, June 29, 2026: `external-prompt-environment.schema.json` now requires `unknownExternalContext` and normalized `diagnostics[]`; `architecture-redesign-contracts.mjs` emits non-authoritative diagnostic records for ST Lorebooks, Memory Books, Summaryception, VectFox, and unknown external context; `prompt-adapter.mjs` exposes those records in prompt inspection; and the observer/prompt-adapter tests prove unknown third-party prompt keys are hash-only, raw-content-free, and `directiveAuthority: false`. This is deterministic LENS/Frame proof, not live certification by itself.

Implemented target-summary slice, July 2, 2026: `architecture-redesign-contracts.mjs` now owns the shared compact target summary for ST Lorebooks/World Info, Memory Books/STMB, Summaryception, VectFox, and unknown external context instead of leaving that shape private to the SillyTavern prompt adapter. The summary keeps target status, counts, hashes, risky-mode flags, range/staleness/backend diagnostics, `directiveAuthority: false`, and `rawContentCaptured: false`; active targets with missing rich diagnostics are marked with `richEvidenceMissing`. `lens-prompt-budget-trace.mjs` now carries sanitized `externalPromptEnvironmentTargets` in LENS cache inputs, so prompt ownership audits can prove final-host external pressure without storing raw prompt bodies, generated memories, Summaryception summaries, vector payloads, Qdrant/API keys, or endpoint URLs. Focused proof: `test-external-prompt-environment.mjs`, `test-lens-prompt-budget-lane-contracts.mjs`, and `test-sillytavern-chat-prompt-adapters.mjs`.

This is a concrete example of where the redesign should reduce architectural duplication. The external-context pipeline currently has several independent proof surfaces: fixture prep, disk scan, browser probe, external observer, prompt adapter summaries, readiness fixture depth, and generation proof. They should remain separately focused, but they must share one normalized diagnostic contract. Otherwise the system repeats the same pattern as the old turn path: many independently reasonable layers, each saving or validating a slightly different idea of truth.

### Per-Extension Planning Implications

#### ST Lorebooks / World Info

- LENS records active lorebook names, chat-bound `chat_metadata.world_info`, visible activation flags, prompt positions, depth/recursive settings hashes, and disabled/unavailable state.
- Prompt provenance splits Directive context from final host prompt material. A valid Directive generation may include active World Info that Directive did not project.
- SRE treats lorebook facts as external evidence, not committed campaign state.
- CORE stores only bounded lorebook diagnostics. Active lorebook changes do not dirty Directive mechanics or force hot-path full-save writes.
- Tests cover before/after/depth injection, recursive WI, disabled WI, conflicting facts, and prompt-key coexistence.
- Observed field contract:
  - active/global lorebooks from `world_info.globalSelect` / `selected_world_info`;
  - chat-bound lorebook from `chat_metadata.world_info`;
  - character/persona lorebook refs from character extension-world settings and persona lorebook settings;
  - settings hash over depth, budget, budget cap, include-names, recursive, case sensitivity, whole-word matching, group scoring, min activations, max recursion, and character/global ordering;
  - placement counts/hashes for before, after, Author's Note top/bottom, at-depth, example-message top/bottom, and outlet;
  - at-depth depth/role counts for ST roles `system`, `user`, and `assistant`;
  - activated-entry hashes keyed by world, uid, position, depth, role, and content hash only.
- Prompt surfaces to preserve: `worldInfoBefore`, `worldInfoAfter`, `customDepthWI_<depth>_<role>`, `customWIOutlet_<name>`, Author's Note influence such as `2_floating_prompt`, and example-message influence.

#### Memory Books

- Treat Memory Books as an external Lorebook producer. It may create World Info entries, bind them through chat metadata, use side prompts, and run generated memory flows outside Directive.
- LENS records STMB markers, active chat-bound Memory Book, entry count/hash, risky mode flags, side-prompt/auto-summary state, and context settings when observable.
- CORE does not import generated memories automatically. Future interop must be reviewed import/export with entry id/title/hash, proposed fact, source range if known, and approval state.
- REPAIR treats Memory Books hide/unhide markers as visibility metadata and assumes generated entries may become stale after edit, delete, swipe change, rerun, branch, Save Game As, or recovery.
- Tests cover STMB lorebook-entry fixtures, chat-bound WI fixtures, stale external memory after source mutation, generated memory conflicting with Directive state, and live coexistence with risky modes disclosed.
- Observed field contract:
  - installed/version/hash, enabled or settings-present state, unavailable reason, and profile id;
  - `chat_metadata.STMemoryBooks.sceneStart`, `sceneEnd`, `highestMemoryProcessed`, and `manualLorebook`;
  - `chat_metadata.world_info` value/hash;
  - WI entry markers `stmemorybooks`, `STMB_start`, `STMB_end`, `displayIndex`, `position`, `depth`, `role`, `order`, `constant`, `vectorized`, `selective`, `disable`, `probability`, `scanDepth`, recursion flags, sticky/cooldown flags, and `outletName`;
  - risky-mode booleans/hashes for auto-summary, auto-create, auto-hide/unhide, side prompts, after-memory side prompts, manual lorebook mode, and at-depth user/assistant entries.
- Do not persist raw Memory Books content, raw comments/titles, raw keys, prompt templates, side prompt text, provider error bodies, or transcript text.
- Validate `STMB_start`/`STMB_end`, `sceneStart`, and `sceneEnd` before using them for warnings or import proposals; stale or inverted external ranges are expected in real data.

#### Summaryception

- Summaryception summaries remain external narrative memory. They do not replace CORE segments, Command Log/FORGE summaries, checkpoints, or source-token replay.
- Host-message normalization models `is_hidden`, `extra.sc_ghosted`, `ghostedIndices`, `summarizedUpTo`, and summarized ranges separately from source mutation.
- REPAIR keeps ghosted or summarized rows as source rows when they still exist, and routes true source edits/deletes without reobserving them as normal player turns.
- LENS records Summaryception enabled state, prompt key presence, layer counts, ghosted count, summarized range markers, injection hash, and stale-summary warnings after edit/swipe/branch when observable.
- REPAIR, SRE, or the mutation observer must set Summaryception stale-after-mutation evidence when an edit, delete, selected-swipe change, branch, rerun, or Save Game As crosses a summarized range. Passive probes may report `staleAfterMutation: false` only as "not observed by this probe"; they must not certify that the external summary is fresh without mutation-lineage evidence.
- Tests cover prompt-key preservation, ghosted player/assistant rows, summarized-but-not-hidden ranges, stale summaries after mutation, and REPAIR handling of hidden-but-existing messages.
- Observed field contract:
  - prompt key `summaryception` with presence, byte count/hash, position/depth/role metadata, and no value capture;
  - settings hash/redacted fields from `extension_settings.summaryception`, including enabled, pause, `disableGhosting`, verbatim turns, turns per summary, snippets per layer/promotion, max layers, prompt preset, connection source, response length, and secret-present booleans;
  - `chatMetadata.summaryception.layers`, `summarizedUpTo`, and `ghostedIndices` counts, hashes, and extrema;
  - layer counts, byte lengths, turn-range extrema, timestamps, promotion markers, and hashes, without `layers[].text`;
  - marker counts for `extra.sc_ghosted`, `ghostedIndices`, native hide/unhide effects, `is_hidden`, and `is_system` side effects.
- Visibility normalization must explicitly handle `extra.sc_ghosted + is_system=true + is_hidden=false` as Summaryception visibility mutation, not proof of a system message or delete.

#### VectFox

- VectFox is treated as external retrieval/vector context. It may inject `3_vectfox*` prompt blocks, register generation interceptors, query vector/Qdrant storage, run EventBase extraction, and optionally remove older vectorized messages from the prompt.
- LENS records enabled/disabled state, prompt keys, position/depth, backend type, semantic WI state, summarizer injection state, ghosting/prompt-exclusion state, and redacted vector settings.
- CORE and REPAIR do not assume vector indexes track Directive save ids, branch lineage, accepted swipes, hidden/player-safe boundaries, or CPM source hashes.
- Latency metrics separate Directive architecture latency from external interceptor/retrieval delay when VectFox is active and observable.
- Privacy/operator docs disclose that external vector backends may store or embed chat/lorebook text outside Directive's storage and visibility model.
- Tests cover disabled-present state, enabled prompt injection, interceptor delay, Qdrant unavailable, selected-swipe/reroll invalidation, prompt-size impact, prompt-excluded rows, and redacted diagnostics.
- Observed field contract:
  - manifest version/hash, loading order, hook presence, `vectfox_rearrangeChat` or equivalent generation-interceptor signal, and hook timing;
  - prompt-slot metadata for `3_vectfox`, `3_vectfox_posN`, `3_vectfox_eventbase`, `3_vectfox_summarizer`, and `3_vectfox_lorebook`;
  - settings hash/redacted allowlist for enabled state, backend mode, Qdrant/local/cloud mode, position/depth, top-K/query/threshold, semantic WI, EventBase, summarizer injection, prompt ghosting, and agentic retrieval flags;
  - collection/registry counts, backend labels, plugin health/version, EventBase marker/tip presence, and redaction summary;
  - external interceptor, retrieval, Qdrant/network, EventBase extraction, summarizer injection, and agentic retrieval timing when observable.
- Prompt ghosting is prompt-only exclusion. It does not delete the host row and must never become REPAIR source mutation.

### Compatibility Exit Conditions

The redesign cannot claim external-context compatibility until these are true:

- Prompt lifecycle tests prove Directive clears/rebuilds only `directive.*` keys.
- Host-message normalization distinguishes hidden, ghosted, summarized, prompt-excluded, unhidden, and true-deleted rows.
- LENS snapshots external environment diagnostics without storing raw prompt bodies, generated Memory Book text, Summaryception summaries, vector payloads, API keys, or hidden Director material.
- Frame carries only a compact external environment ref or unknown-state marker on the hot path.
- Prompt provenance artifacts distinguish Directive-owned prompt packet revision, host final prompt composition, and model-visible generation environment.
- Generation-time external-context proof uses pre-generation prompt-inspection snapshots. For a rich prepared fixture lane, the proof must include target-specific compact evidence for native ST World Info/Lorebooks, Memory Books/STMB, Summaryception, VectFox, final-host-prompt inclusion, and redaction reasons; a generic external prompt key alone is limited evidence.
- Generation-time proof includes both coexistence status and influence attribution: whether each target was active, disabled, not installed, unavailable, indeterminate, or unknown, and whether external prompt/retrieval/interceptor work may have influenced that generation.
- Rich fixture proof requires normalized diagnostic objects: `memoryBooks.rangeDiagnostics`, `summaryception.staleness`, and `vectFox.backendDiagnostics`. Missing objects are a fixture/probe wiring failure, not proof that the external target is absent.
- Schema-valid `externalPromptEnvironment` is a passive coexistence artifact, not rich compatibility certification. Rich active evidence requires non-unknown Summaryception staleness and VectFox backend diagnostics from fixture prep, browser probe, prompt inspection, and generation proof. Disabled, not-installed, and unavailable states are valid passive evidence only when explicitly surfaced as such, not as active prompt pressure.
- REPAIR prevents extension visibility churn from becoming edit/delete recovery and prevents true source edits/deletes from becoming normal replacement ingress.
- Future or unknown external tools obey the same generic rule: prompt visibility changes never imply source mutation without host row existence, host text hash, selected variant, or explicit delete evidence.
- FORGE does not ingest external summaries/vector results automatically.
- Scale tests prove bounded external diagnostics do not inflate hot-path saves.
- Live probe artifacts record each target as `browser-confirmed`, `disabled`, `not-installed`, `unavailable`, `indeterminate`, `disk-confirmed`, or `settings-only` with the required warning/failure semantics.

Per-extension acceptance checks:

| Extension | Minimum deterministic acceptance | Minimum live acceptance |
| --- | --- | --- |
| ST Lorebooks / World Info | Prompt lifecycle fixtures prove Directive preserves `worldInfoBefore`, `worldInfoAfter`, at-depth keys, outlets, Author's Note influence, example-message influence, and unknown host-owned keys while reporting only hashes/counts/status. Conflicting lorebook facts remain diagnostics, not campaign state. | A non-human soak profile browser-confirms active native World Info or an explicit disabled/not-installed state, and generation-time prompt inspection records target-specific external-environment evidence when the rich fixture is active. |
| Memory Books | Fixtures prove STMB-created World Info entries, chat-bound `world_info`, `chat_metadata.STMemoryBooks`, side-prompt/risky-mode flags, hide/unhide metadata, and stale/inverted ranges are observed and redacted without importing generated memory. | A prepared non-human fixture exposes rich active STMB/Memory Books evidence, and live artifacts prove no raw generated memory text or side-prompt text is stored. |
| Summaryception | Fixtures prove the `summaryception` prompt key is preserved; `extra.sc_ghosted`, `ghostedIndices`, summarized ranges, `is_system=true + is_hidden=false`, and native hide/unhide effects remain visibility/source metadata; stale summaries after edit/swipe/branch do not create normal-turn reobserve loops. | A prepared non-human fixture exposes Summaryception prompt and visibility markers, and live artifacts show target-specific prompt pressure or an explicit disabled/not-installed status without counting `default-user`. |
| VectFox | Fixtures prove `3_vectfox*` prompt keys survive Directive clear/rebuild, hook/interceptor and backend settings are redacted, prompt ghosting is represented as prompt exclusion, selected-swipe/reroll mismatches do not become vector authority, and observable retrieval delay is separate timing. | A prepared non-human fixture exposes VectFox prompt/interceptor evidence or explicit unavailable/disabled status, and live generation proof records separate external timing/redaction evidence when active. |

Implementation pressure by architecture layer:

| Layer | Required implication from the extension audit |
| --- | --- |
| Frame | Carry an external environment ref, `unknown` marker, or cached compact hash only. Never inline lorebook text, Memory Books content, Summaryception summaries, or vector payloads. |
| CORE | Store bounded diagnostics and source refs only. External context observations may support review, but they must not mutate mechanics, checkpoints, rollback snapshots, or committed campaign facts. |
| REPAIR | Receive normalized source-existence and visibility reasons. Visibility churn from Summaryception, Memory Books, VectFox, native hide/unhide, or prompt exclusion is not a source edit/delete unless the host row is actually gone or changed. |
| SRE | Use external lore/summary/vector evidence only as non-authoritative context during reconciliation. Source settlement remains based on Directive/host source ids, selected variants, hashes, and accepted outcomes. |
| LENS | Own prompt-key preservation, prompt-provenance wording, redaction, fixture-depth labels, warning generation, and separate external latency/privacy diagnostics. |
| FORGE | Keep external summarizers/vectorizers outside Directive's background worker authority unless a future reviewed-import/export flow converts their output into explicit proposals. |

These checks are intentionally compatibility checks, not product claims that Directive manages those extensions. They prove Directive can coexist with user-owned context-extension systems while keeping authority, privacy, storage, and latency boundaries intact.

### Compatibility Implementation Modes

Implementation agents should classify every external-context change into one of four modes before writing code or fixtures:

| Mode | When it applies | Allowed implementation | Reject if it does this |
| --- | --- | --- | --- |
| Passive coexistence | The tool is installed, disabled, not installed, or present without active prompt influence. | Preserve host-owned keys/settings, record target status, unavailable reason, and fixture-depth label. | Calls private extension internals, rewrites extension state, or reports disk evidence as live soak proof. |
| Generation influence | The final host prompt or generation path may include World Info, Memory Books, Summaryception, VectFox, or unknown extension context. | Attach compact LENS/Frame diagnostics with prompt-key refs, placement classes, hashes/counts, redaction summary, and external timing if observable. | Stores raw context, treats influence as Directive truth, dirties mechanics, or expands hot-save writes. |
| Visibility mutation | An extension hides, ghosts, summarizes, unhides, or prompt-excludes rows while the source row still exists. | Normalize source existence separately from visibility reason, then route through REPAIR/SRE as visibility-only unless true source mutation exists. | Creates normal replacement ingress, false delete recovery, reruns mechanics, or loses selected-swipe/source identity. |
| Reviewed interop | A future user-approved flow intentionally imports or exports bounded material. | Use explicit proposal records with provenance, source refs, hashes, approval state, and redaction. | Auto-imports lore, generated memories, summaries, vector hits, embeddings, provider output, or side-prompt text. |

Latency buckets for implementation and proof:

| Bucket | Required recording |
| --- | --- |
| Directive fast gate | Player submit / Frame creation through `hostContinue` release, Directive pause post, or Directive narration-start request. This is the under-60-second architecture budget. |
| Directive provider completion | Directive-owned narration start through completion/abort. Report as provider latency, not generation-start latency. |
| Host provider completion | Host-native release through assistant completion/abort. Report separately from Directive release timing. |
| External retrieval/interceptor | Observable VectFox, unknown hook, or host extension retrieval/interceptor timing around generation. Report separately unless Directive explicitly waited before release. |
| External summarization/generation | Observable Memory Books, Summaryception, VectFox, or unknown external model work. Report as external work unless a future reviewed Directive flow invokes it. |
| Background settlement | Visible response release/post through FORGE/LENS/diagnostic completion or cancellation. Must be cancelable and must not satisfy fast-gate latency. |

Per-extension implementation stance:

| Target | User-compatible support | Implementation consequence |
| --- | --- | --- |
| ST Lorebooks / World Info | Users can keep native lorebooks active and final prompts may include WI material outside Directive's packet. | LENS preserves and reports native prompt surfaces; SRE records conflicts as evidence only; CORE stores only bounded diagnostics. |
| Memory Books | Users can keep generated-memory workflows that create World Info entries and chat metadata. | Treat Memory Books as a World Info producer with stale-range/risky-mode diagnostics; never trust generated memory or STMB ranges without reviewed import. |
| Summaryception | Users can keep rolling summaries and ghosting for prompt-length control. | Preserve `summaryception`, distinguish summaries/ghosting from source mutation, and prevent stale summary metadata from creating normal-turn reobserve loops. |
| VectFox | Users can keep vector/EventBase retrieval and prompt ghosting, including external backends. | Preserve `3_vectfox*` prompt slots, redact backend/vector settings, separate external retrieval/interceptor timing, and treat prompt ghosting as prompt exclusion only. |

### Agent-Driven Extension Planning Protocol

When a stage touches external context compatibility, use agents for inspection and pressure testing, but keep final architecture integration with Agent-0. The goal is to understand how each extension affects prompt composition, source visibility, latency, storage, and live proof without making Directive dependent on private extension internals.

For each extension set, send agents with two lenses:

| Agent lens | Assignment | Required handoff |
| --- | --- | --- |
| Extension-surface audit | Inspect installed/live SillyTavern surfaces, observable prompt keys, chat metadata, settings, visibility markers, hook/interceptor signals, unavailable states, and redaction risks. | Observed fields, safe diagnostics, unsafe raw fields, prompt surfaces to preserve, live-user caveats, and fixture requirements. |
| Architecture-pressure audit | Map those observations to Frame, CORE, REPAIR, SRE, LENS, FORGE, and QA responsibilities. | Ownership decision, hot-path impact, storage impact, latency attribution, recovery risks, tests needed, and explicit non-goals. |

Agent findings should use this handoff template:

| Field | Required content |
| --- | --- |
| Target | `stLorebooks`, `memoryBooks`, `summaryception`, `vectFox`, or `unknownExternalContext`. |
| Observable surfaces | Prompt keys or prompt assembly surfaces, metadata fields, settings hashes, message markers, hook/timing signals, and fixture-depth evidence. |
| User-compatible behavior | What the user can keep doing with the extension during a Directive campaign. |
| Directive boundary | What Directive observes, preserves, warns about, or redacts. |
| Authority rule | Why the extension output is influence or evidence, not committed Directive truth. |
| Visibility/source rule | Whether observed markers change source identity, visibility, or neither. |
| Latency/storage rule | Whether the extension can add external delay or storage pressure, and how Directive records it without charging the wrong budget. |
| Tests/artifacts | Deterministic fixtures, schema tests, live readiness proof, generation proof, redaction canaries, and scale evidence. |
| Reject list | Private APIs, raw prompt/body capture, automatic import/trust, extension-state rewrites, hot-path blocking, or save growth. |

Per-extension agent focus:

| Target | Extension-surface audit focus | Architecture-pressure audit focus |
| --- | --- | --- |
| ST Lorebooks / World Info | Active/global lorebooks, chat-bound `world_info`, before/after surfaces, at-depth role keys, outlets, Author's Note/example-message influence, recursive/depth settings, and disabled/unavailable states. | LENS prompt provenance and prompt-surface preservation; SRE non-authoritative conflict evidence; CORE bounded diagnostics; live proof with active and inactive WI profiles. |
| Memory Books | STMB-created WI entries, `chat_metadata.STMemoryBooks`, `STMB_start`/`STMB_end`, `sceneStart`/`sceneEnd`, side prompts, auto-summary/create/hide/unhide modes, generated-memory identity hashes, and absence of a dedicated prompt-key requirement. | Treat as a World Info producer; validate stale/inverted ranges; route hide/unhide through REPAIR visibility normalization; keep generated memories out of CORE unless reviewed import/export is explicitly designed. |
| Summaryception | `summaryception` prompt key, chat summary layers, `summarizedUpTo`, `ghostedIndices`, `extra.sc_ghosted`, `is_system=true + is_hidden=false`, native hide/unhide effects, and stale-summary signals. | Preserve source rows through ghosting/summarization; set stale-after-mutation evidence after edit/delete/swipe/branch/rerun/Save Game As; prevent edited dependent rows from re-entering normal classification loops. |
| VectFox | `3_vectfox*` prompt slots, generation-interceptor or hook signals, backend/Qdrant/cloud/local settings, EventBase, semantic WI, summarizer injection, agentic retrieval, prompt ghosting, collection counts, and redacted timing. | Separate external retrieval/interceptor latency from Directive generation-start proof; treat prompt ghosting as prompt exclusion only; never assume vector indexes know save lineage, accepted swipes, branches, or Directive source hashes. |

The implementation decision after every agent batch should be one of four outcomes:

| Outcome | Meaning | Next step |
| --- | --- | --- |
| Preserve/observe | Directive only needs to preserve surfaces and record compact diagnostics. | Add or update LENS/host-adapter fixtures and redaction tests. |
| Normalize visibility | The extension changes prompt visibility around existing rows. | Route through host-message normalization and REPAIR/SRE tests before any runtime behavior depends on it. |
| Attribute latency/privacy | The extension can add retrieval, summarization, generation, vector, or external-storage work. | Add timing/privacy diagnostics and live-proof labels without blocking `hostContinue`. |
| Reviewed interop only | The extension output might be useful as imported/exported material. | Defer to a future reviewed import/export design with explicit provenance and approval state. |

Agent-0 should reject any handoff that recommends direct integration before proving why preservation, observation, visibility normalization, latency attribution, or reviewed interop is insufficient. This keeps the redesign from turning compatibility into a second overengineered runtime beside CORE and LENS.

## Narrative Engine Transfer Workstream

This workstream implements the pivot described in [Architecture Redesign Proposal](ARCHITECTURE_REDESIGN_PROPOSAL.md#narrative-engine-transfer-pivot). It incorporates the useful Narrative Engine patterns into Directive's existing redesign owners without porting Narrative Engine's app/server/storage/UI architecture.

The product target is better long-campaign memory and correction behavior at 5000-message scale:

- recall the right prior scenes without retaining or prompting the full transcript;
- give LENS explicit prompt budgets, floors, omissions, and cache inputs;
- prevent character knowledge leakage with witness-scoped facts;
- seal long scenes and phase boundaries into compact, source-linked records;
- offer evidence-backed correction as candidate swipes rather than direct accepted-prose mutation;
- keep optional semantic/vector retrieval non-authoritative and feature-gated;
- preserve compatibility with external ST Lorebooks, Memory Books, Summaryception, and VectFox.

### Transfer Scope

| Capability | Target owner | Implementation shape | Explicitly not |
| --- | --- | --- | --- |
| Hybrid scene recall | CORE projection plus Recall Index helpers consumed by LENS/SRE/REPAIR/FORGE | Compact entries over Frame/CORE/package/scene-seal/reviewed-import refs; deterministic facet and lexical scoring before optional semantic candidates. | Raw transcript archive, external vector truth store, or prompt body cache. |
| Prompt budget lanes | LENS | Named lanes with token floors, estimated tokens, included refs, omitted refs, omission reasons, and cache-key inputs. | A hidden monolithic prompt builder or untraceable truncation. |
| Witness-scoped facts | Continuity schemas, CPM materializers, SRE, FORGE scene seals, LENS active-cast/protected-continuity lanes | `knownBy`, `witnessedBy`, `subjectIds`, `disclosureState`, `disclosureSourceFrameId`, and evidence refs. | Generic narrator/player visibility only, or hidden Director knowledge leaking into active character behavior. |
| Scene/phase seals | FORGE over CORE background batches | Typed seal worker emits summary, events, facts, witness updates, open threads, mission pressure, callbacks, correction candidates, recall entries, and dirty domains. | Foreground provider wait, repeated sidecar saves, or raw transcript/provider archival. |
| Correct-as-Swipe | Define Selection, SRE, REPAIR, Narration/Utility, host swipe adapter, CORE correction projections | Selected text gets evidence verdict, correction case, candidate swipe, and later selected-swipe acceptance handling. | Direct assistant text mutation, mechanics rerun, or accepting external lore as correction authority. |
| Structured lore/RAG metadata | Package schemas, dataset loaders, Recall Index, LENS | `retrieval.mode`, priority, linked entities, actors, locations, missions, phases, tags, keywords, audience, `knownBy`, source authority, and RAG hints. | ST Lorebook import by default or mandatory vector database. |
| Pressure/arc digests | FORGE plus Mission/Open Threads/Command Bearing/Timekeeping projections | Compact operational pressure, open threads, callbacks, arc pressure, and command-bearing digest refs for LENS lanes. | Full NPC simulator or second narrative state engine. |

### Code Reference Rules

Agents may inspect Narrative Engine for behavior and algorithm shape, but should hand off findings as Directive-native design notes:

- Prefer "reference/reimplement" for recall scoring, prompt lane budgeting, scene sealing, and correction flow.
- Do not copy Express/Electron/app shell/server/storage/UI code.
- Do not introduce a required local vector database or archive-folder storage dependency.
- Do not copy example world content.
- If a small pure function is directly copied, add MIT attribution and a test proving Directive behavior.
- Keep copied or adapted code behind Directive contracts so future replacement does not affect storage authority.

### Narrative Engine Non-Transfer Decisions

These decisions prevent the pivot from expanding into a second application architecture. If a future worker thinks one of these should change, they must open a new design decision with owner, storage boundary, latency impact, and proof gate before writing implementation code.

| Narrative Engine idea | Decision | Allowed Directive use |
| --- | --- | --- |
| Adaptive LLM/provider queueing | Do not add as a standalone owner or scheduling subsystem during the architecture cutover. | FORGE and `generationRouter` may adopt bounded timeout, priority, idempotency, and provider-lane tactics when they reduce visible latency or background waste. |
| NPC/world simulation engine | Do not port. Directive's Mission, Open Threads, Command Bearing, Timekeeping, and open-world reducers remain the domain systems. | Compact pressure/arc digests and bounded reducer events may capture useful state without creating a second simulator. |
| Vault/archive UI and local archive storage | Do not port. CORE/v2 storage and SillyTavern host transcript remain the storage surfaces. | Recall Index may store refs, hashes, facets, bounded previews, and optional embedding refs, never a raw transcript archive. |
| Required vector database | Do not require. Vector/semantic retrieval is optional, feature-gated, and non-authoritative. | Optional semantic candidates can affect recall ranking only after deterministic evidence retrieval, and only with redacted refs/hashes. |
| Express/server/app-shell routes | Do not port. Directive lives as a SillyTavern extension with its existing host/runtime shell. | API or helper shapes may be reimplemented only when they fit Directive contracts. |
| World/lore consistency checker | Do not port as a separate checker. | Map useful evidence-check behavior into SRE verdicts, Recall Index evidence retrieval, and Correct-as-Swipe cases. |
| Example world content | Do not copy. | Reauthor Directive packages and fixtures under Directive review rules. |

### Stage Mapping

| Stage | Narrative Engine transfer work |
| --- | --- |
| Stage 1: Contracts And Metrics | Add schemas for Recall Index entries/queries/results, prompt budget traces, witness-scoped facts, scene/phase seals, correction cases, candidate swipe provenance, structured retrieval metadata, and semantic-candidate feature flags. |
| Stage 2: Scale Harness | Extend the 5000-message fixture with recall entries, scene seals, prompt budget traces, witness facts, package retrieval metadata, correction-case stubs, and optional semantic candidate refs. |
| Stage 3: V2 Storage Substrate | Add bounded storage layouts for recall index segments, scene-seal segments, prompt-budget diagnostics, correction projections, and package retrieval metadata indexes. |
| Stage 4: CORE Store | Add CORE events/projections for recall revision, scene-seal commits, correction cases, witness fact updates, and selected-swipe invalidation/fork behavior. |
| Stage 5: Frame And Fast Gate | Ensure Frame carries source facets needed for deterministic recall query construction without blocking `hostContinue` or embedding raw chat. |
| Stage 6: Mechanics/Narration Split | Keep narration input budgeted through LENS lanes; do not let recall or scene sealing block narration start. |
| Stage 7: REPAIR Skeleton | Add correction-case ownership and candidate-swipe allowed actions; prove candidate swipes do not mutate accepted continuity until selected. |
| Stage 8: SRE | Add evidence verdict mode for selected text and correction review; use witness-scope fields during source settlement and selected-swipe invalidation. |
| Stage 9: LENS | Implement prompt budget lanes, prompt budget trace output, recall inclusion/omission, and active-cast/protected-continuity filtering by witness scope. |
| Stage 10: FORGE | Implement scene/phase seal worker and pressure/arc digest refresh as typed background batches with one CORE commit and one LENS dirty-domain output. |
| Stage 11: Open-World Reducers | Emit bounded events that scene seals and Recall Index can consume; remove broad `rootsSet` dependencies from recall and digests. |
| Stage 12: Migration Cutover | Remove old prompt/retrieval summary writes that duplicate recall/seal/budget-trace data in hot save state. |
| Stage 13: Scale And Live Proof | Prove recall, scene seals, prompt budgets, witness facts, correction stubs, and external diagnostics stay bounded at 5000 messages and during non-human live soak. |
| Stage 14: Documentation And Cleanup | Promote recall, budget lanes, witness scope, scene seals, and Correct-as-Swipe docs out of planning into technical/user-facing manuals. |

### Narrative Engine Transfer Completion Matrix

This matrix is the execution ledger for the Narrative Engine pivot. A feature is not complete because it appears in the proposal; it is complete only when the owner, runtime path, storage boundary, and proof gate below are satisfied.

| Transferred feature | Directive owner | Current status | Completion gate |
| --- | --- | --- | --- |
| Hybrid scene recall | CORE projections plus Directive Recall Index, consumed by LENS/SRE/REPAIR/FORGE | Partially implemented through Recall Index contracts, scene-seal refs, scale fixtures, LENS cache inputs, scope-filtered queries, deterministic Recall source-mutation/fork contracts, production REPAIR/Save As evidence hooks, bounded CORE Recall auxiliary artifact storage, FORGE scene/phase and pressure/arc producer wiring, and REPAIR source-mutation auxiliary rewrites. `queryRecallIndex(...)` now omits campaign/save/branch mismatches, `applyRecallSourceMutation(...)` invalidates edit/delete/selected-swipe/rollback source refs or forks valid refs for branch/Save As without reviving stale entries, REPAIR source-mutation projections carry compact `recallSourceMutation`, CORE background batches can persist normalized `directive.recallIndexSegment.v1` auxiliary refs, source mutations rewrite the current auxiliary snapshot to stale entries, Save As rewrites/forks only the current non-stale auxiliary refs into target save/branch storage, scene/phase seal workers pass full Recall entries into CORE while persisting only compact refs, and pressure/arc digest workers now have matching auxiliary proof. Remaining work is broader LENS consumption depth and live proof, not producer/storage substrate for the known Recall-producing FORGE workers. | Recall entries/query/results use Frame/CORE/package/scene-seal/reviewed-import refs only; rollback, branch, Save As, delete, edit, and selected-swipe changes invalidate or fork recall deterministically; 5000-message scale proof includes recall segments and no raw transcript archive. |
| Prompt budget lanes | LENS | Partially implemented through budget-lane contracts, cache inputs, trace schemas, production scheduler trace refs, sanitized external target summaries, deterministic ordinary overflow omission, protected-continuity fail-closed over-budget evidence, scheduler-level block filtering, prompt-install blocking for protected overage, explicit lane metadata emitted by context/continuity prompt builders, and package-driven lane budget overrides. Broader dataset-driven lane scoring remains open. | Prompt builds emit lane budgets, floors, included refs, omitted refs, over-budget refs, omission reasons, cache inputs, external-environment refs, compact external target evidence, overflow policy, blocking status, enforced block omission, builder-owned lane ids, package budget overrides, and no raw prompt storage. |
| Witness-scoped facts | Continuity schemas, CPM materializers, SRE, FORGE, and LENS active-cast/protected-continuity lanes | Partially implemented through continuity fact normalization and projection-plan actor gating. `createContinuityFact(...)` now carries `knownBy`, `witnessedBy`, `subjectIds`, `disclosureState`, `disclosureSourceFrameId`, and sanitized evidence refs; the projection validator blocks private/secret/inferred/false-belief facts unless the current Frame/source actors know or witnessed them. Focused proof covers a Bronn-known private fact entering the prompt while a Sam-only private fact is rejected for a Bronn scene, plus hard-floor/guard-focus anti-telepathy rejection. Broader materializer migration and false-belief semantics remain open. | `knownBy`, `witnessedBy`, `subjectIds`, `disclosureState`, `disclosureSourceFrameId`, and evidence refs drive continuity materialization and active-cast prompt inclusion; anti-telepathy test proves hidden knowledge is not given to actors who do not know it. |
| Scene/phase seals | FORGE over CORE background batches, feeding Recall Index and LENS | Partially implemented through scene/phase seal refs, CORE background batches, Recall Index revision refs, and LENS cache inputs. Broader trigger coverage and auxiliary artifact storage remain open. | Scene/phase seal worker emits compact summary/event/fact/witness/thread/callback/correction/recall refs, never raw transcript/provider text; stale-source skip and idempotent replay pass; seals update Recall/LENS without blocking visible generation or rewriting the hot save. |
| Pressure/arc digests | FORGE plus Mission/Open Threads/Command Bearing/Timekeeping projections | Partially implemented for provider-free pressure/arc digest refs and LENS revision inputs. Trigger expansion and artifact storage remain open. | Pressure/open-thread/callback/arc/command-bearing digest refs settle as bounded CORE background effects; committed visible turns with pressure signals trigger nonblocking settlement; prompt cache uses `pressureArcDigestRevision` rather than broad dirty roots. |
| Correct-as-Swipe | Define Selection, SRE, REPAIR, host swipe adapter, CORE correction projections | Implemented at deterministic depth and partially live-proven. Candidate-swipe proposal, compact correction cases, SRE evidence verdicts, REPAIR lifecycle decisions, assistant-scoped UI affordance, unselected host swipe append, event-bridge acceptance, and setup-assisted native selected-swipe actuation have proof. Remaining live gap is native selected-swipe actuation against a naturally produced latest Directive response in the real-turn Ashes lane. | Selected text produces an evidence verdict and correction case; REPAIR authorizes allowed actions; host adapter appends candidate assistant swipe with provenance refs; accepted continuity changes only after selected-swipe source truth changes and SRE/REPAIR process the mutation. |
| Structured lore/RAG metadata | Package schemas, dataset loaders, Recall Index, LENS | Captured conceptually; needs explicit schema and loader/query gate so package/reviewed-import facts are first-class Recall inputs without becoming ST Lorebook imports. | Package/dataset/reviewed-import entries expose retrieval mode, priority, linked actors/locations/missions/phases/tags/keywords/audience/knownBy/source authority/RAG hints; Recall deterministic retrieval uses those facets before optional semantic candidates. |
| Optional semantic/vector candidates | Recall Index optional lane plus external-context boundary | Captured as non-authoritative and feature-gated. No required vector database should be introduced. | Semantic/vector candidates can influence ranking only behind a feature flag and never become committed truth without Frame/CORE/package/reviewed-import evidence; external VectFox hits remain external diagnostics unless reviewed import/export is explicitly designed. |
| Code reference policy | Agent-0 plus assigned workers | Captured in proposal and workstream rules. | Any direct nontrivial copied Narrative Engine code carries MIT attribution, is isolated behind Directive-native contracts, and has tests proving Directive behavior; app shell/server/storage/UI/world simulator/vector database code is not ported. |
| Scale proof for transferred features | QA/scale worker | Partially implemented through scale harness coverage for v2, recall, seals, budget traces, correction stubs, and external diagnostics. | 5000-message scale gate proves Recall Index, scene seals, prompt budget traces, witness facts, correction-case stubs, structured retrieval metadata, and external diagnostics stay segmented, bounded, and raw-content-free. |

For a row to move from "captured" to "implemented," the worker handoff must name:

- the exact Directive owner and old path being replaced or bridged;
- the storage artifact or projection and its raw-content redaction rule;
- the invalidation/fork behavior for edit, delete, selected-swipe change, rollback, branch, and Save As when applicable;
- the LENS prompt lane or proof surface that consumes the feature;
- the focused deterministic test and the scale or live gate that prove it;
- the code-reference decision: reimplemented idea, copied small pure function with MIT attribution, or rejected/non-transfer.

### Narrative Engine Implementation Detail Checklist

The transfer matrix above is not sufficient by itself. Before a worker marks a transferred feature complete, the implementation must answer the concrete detail checklist below.

| Feature | Required implementation details | Required proof |
| --- | --- | --- |
| Recall Index query/result | `RecallQuery` and `RecallResult` schemas; score-reason enum; deterministic sort keys and tie-breakers; preview byte limits; authority labels; cache/revision inputs; invalidation/fork matrix for edit, delete, selected-swipe change, rollback, branch, Save As, package revision, reviewed import, and scene-seal supersede. | Contract tests for query/result shape, deterministic tie-breakers, preview truncation, raw-content canaries, and invalidation/fork behavior for at least edit/delete/swipe/branch. Scale harness proves bounded recall segments at 5000 messages. |
| LENS prompt budget lanes | Default lane floors/caps; overflow order; protected-lane failure behavior; token-estimator tolerance; lane cache-key inputs; omitted-ref reason enum; acceptance policy when estimated tokens exceed budget; external-environment diagnostic lane behavior. | Prompt-budget fixture with controlled overflow, protected-continuity overage, semantic-candidate omission, estimator tolerance, and no raw prompt body storage. |
| Witness-scoped facts | Migration semantics from current `narratorSafe`, `directorOnly`, `hidden`, and `playerFacing` labels; `groupId` expansion rules; `falseBelief` and `inferred` confidence handling; contradiction resolution precedence; examples for active-cast and protected-continuity prompt filtering. | Anti-telepathy tests proving an active actor receives only facts they know, witnessed, can infer, were told, or may hold as false belief; contradiction fixture proves hidden/external-only facts do not become actor-visible truth. |
| FORGE scene/phase seals | Deterministic trigger and debounce rules; byte/turn threshold rules; merge/supersede behavior; artifact segment and retention rules; stale-source states; idempotent replay states; seal-to-recall revision behavior; LENS dirty-domain outputs. | FORGE tests for trigger selection, stale skip, idempotent replay, supersede/merge, redaction canaries, one CORE background batch, one LENS dirty-domain output, and bounded artifact retention. |
| Correct-as-Swipe | `CorrectionCase` state table; verdict states; allowed actions; candidate swipe provenance fields; idempotency key; append-vs-auto-select product policy; reject/expire behavior; selected-swipe acceptance sequence; rollback/branch invalidation sequence. | Deterministic flow test from Define Selection through SRE verdict, REPAIR case, candidate swipe append, and later selected-swipe acceptance. Proof must show accepted continuity is unchanged until selection and raw selected text/rewrite text is not archived in CORE. |
| Optional semantic/vector/RAG candidates | Feature flag/config name; semantic provider request/result schema; latency/error budget; redaction proof fields; deterministic-first ranking contract; reviewed-import promotion path; VectFox/external-vector separation. | Disabled-by-default test; enabled candidate test proving semantic hits affect ranking only as candidates; timeout/error budget test; redaction canary; reviewed-import test proving only reviewed refs can become committed truth. |
| Code borrowing audit ledger | Per borrowed or closely adapted function: source repo/path/commit, license notice location, copy-vs-reimplement rationale, owning Directive test, release check, and removal/replacement owner. | Release/doc check fails if a copied/adapted Narrative Engine entry lacks ledger metadata or MIT attribution. Reimplemented ideas need a note in the worker handoff but not a code-copy ledger row. |

### Narrative Engine Coverage Lock

Before any wave can be marked complete, Agent-0 must confirm the Narrative Engine transfer feature that belongs to that wave is either implemented, explicitly deferred to a later named wave, or rejected with a written reason. "Referenced in the proposal" is not enough.

| Wave | Required Narrative Engine coverage check |
| --- | --- |
| Wave 1: CORE Runtime Authority | CORE/v2 stores or projects the refs needed for Recall Index entries, scene/phase seal refs, correction cases, witness fact refs, prompt-budget diagnostics, and structured retrieval metadata without raw transcript/prompt/provider storage. |
| Wave 2: REPAIR/SRE Ownership | REPAIR/SRE own correction cases, evidence verdicts, selected-swipe invalidation/fork behavior, stale source settlement, and witness-scope checks that prevent hidden knowledge from becoming actor-visible truth. |
| Wave 3: FORGE/LENS Completion | FORGE emits scene/phase seals, pressure/arc digests, recall revisions, correction candidates, and dirty domains; LENS consumes Recall Index and witness facts through prompt budget lanes with inclusion/omission traces and cache inputs. |
| Wave 4: Proof And Certification | Scale/live proof includes recall, budget lanes, witness facts, scene seals, pressure/arc digests, correction stubs, structured retrieval metadata, optional semantic-candidate redaction, and external-context coexistence under 5000-message pressure. |

If a worker finds that a transferred feature would require a standalone Narrative Engine subsystem, the default answer is to re-scope it into the Directive owner table above. Standalone imports are allowed only after Agent-0 records why no existing owner can hold the behavior and what authority boundaries prevent duplicate truth.

### Agent Work Packages

Use agents when this workstream enters implementation, but keep Agent-0 as final integrator for shared files.

| Worker | Assignment | Allowed focus | Handoff requirements |
| --- | --- | --- | --- |
| Recall worker | Inspect current retrieval seams and design Recall Index contracts. | `src/retrieval/*`, package/dataset loaders, CORE projection refs, LENS query inputs. | Entry schema, query shape, invalidation rules, deterministic scoring notes, optional vector boundary, tests needed. |
| Prompt-budget worker | Map current prompt builders to LENS lanes. | `src/generation/player-safe-prompt-context-builder.mjs`, LENS scheduler, CPM outputs, prompt cache. | Lane list, budget floors, cache inputs, omission trace contract, raw-content redaction rules. |
| Witness worker | Audit continuity/materializer fact shapes. | `src/continuity/*`, materializers, CPM facts, SRE fact proposals, package schemas. | Field migration plan, anti-telepathy tests, active-cast prompt implications, source evidence requirements. |
| Seal worker | Design FORGE scene/phase seal worker. | FORGE coordinator, sidecar scheduler, Command Log/Narrative Thread background settlement, terminal checkpoints. | Trigger rules, seal output schema, stale-source policy, CORE event shape, LENS dirty domains, scale impact. |
| Correction worker | Design Correct-as-Swipe. | Define Selection, SRE, REPAIR, Outcome Integrity, host swipe append APIs. | Flow diagram, correction case schema, evidence verdict contract, candidate swipe provenance, selected-swipe acceptance tests. |
| QA/scale worker | Extend scale/perf/live proof. | `tools/scripts/test-storage-scale-5000.mjs`, alpha gate fixtures, non-human live soak artifacts. | Byte budgets, fixture generator changes, test names, failure conditions, external compatibility interactions. |

Agent prompts should explicitly say that Narrative Engine is a reference, not a port target. A useful worker handoff should answer:

- Which Directive owner gets the capability?
- Which existing old path becomes a bridge or projection?
- Which records are refs/hashes/previews only?
- Which source changes invalidate or fork the record?
- Which prompt lane consumes it?
- Which deterministic test proves the contract?
- Which scale test proves it does not recreate hot-save growth?

### Implementation Order

The pivot should enter after the macro owner boundaries exist but before final scale/live proof:

1. Add contract-only types and tests for recall, budget trace, witness facts, scene seals, correction cases, candidate swipes, and retrieval metadata.
2. Extend the 5000-message scale fixture to include those artifacts before production writers exist.
3. Add read-only Recall Index projection over existing CORE/package/scene-seal-shaped fixtures.
4. Add LENS prompt budget trace in diagnostics-only mode, then route real prompt packet assembly through it.
5. Add witness-scoped fields to fact schemas and materializers, with active-cast prompt filtering tests.
6. Add FORGE scene/phase seal worker in diagnostic-only or no-apply mode, then promote accepted seal output to CORE background batches.
7. Add SRE evidence-verdict mode and REPAIR correction-case state for Correct-as-Swipe.
8. Wire host candidate swipe append with provenance; selected-swipe acceptance remains the continuity boundary.
9. Add optional semantic candidate provider behind a feature flag only after deterministic recall is proven.
10. Promote docs and user-facing controls after deterministic, scale, and live proof pass.

### Exit Conditions

This workstream is done when:

- Recall queries can retrieve relevant prior scene/package/CORE evidence without reading raw transcript history from the save.
- LENS prompt budget traces show lane budgets, included refs, omitted refs, omission reasons, and cache inputs.
- Prompt inclusion for active cast and protected continuity can explain `knownBy`/`witnessedBy`/`disclosureState` decisions.
- FORGE scene/phase seals settle through CORE background batches and update Recall Index without blocking visible generation.
- Correct-as-Swipe can append a candidate assistant swipe with evidence provenance and no accepted-continuity mutation until selection.
- Optional semantic/vector candidates are non-authoritative, feature-gated, and redacted.
- 5000-message scale proof includes recall index, scene seals, budget traces, correction stubs, and external diagnostics without hot full-save rewrites.

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

Read these stages through the macro-first cadence and the [Per-Stage Agent Allocation](#per-stage-agent-allocation) matrix. Stages 1-6 establish the broad contracts, storage shape, CORE path, Frame path, fast gate, and mechanics/narration split. Stages 7-10 make the named recovery, settlement, prompt, and background owners real enough to wire together. Stages 11-14 harden reducers, migration, scale/live proof, and documentation. A stage may leave documented local edge cases for a later phase gate when the macro owner is correct and the primary vertical turn path remains aligned.

| Stage | Pass | Name | Primary gate |
| --- | --- | --- | --- |
| 0 | Control | Baseline And Control Board | current alpha gate and dirty worktree recorded |
| 1 | Macro | Contracts And Metrics | schemas and measurement tests land before behavior, including recall/budget/witness/seal/correction contracts |
| 2 | Macro | Scale Harness | 5000-message and write-count tests exist before migration, including recall/seal/budget artifacts |
| 3 | Macro | V2 Storage Substrate | segments, manifests, checkpoints, importer prove load/write |
| 4 | Macro | CORE Store | typed transactions replace direct ledger writes behind API |
| 5 | Macro | Frame And Fast Gate | hostContinue release is fast and measured |
| 6 | Macro | Mechanics/Narration Split | directiveCommit starts narration under budget |
| 7 | Integration | REPAIR Skeleton | dependent edit/delete cannot cycle through normal turns |
| 8 | Integration | SRE | settlement/reconciliation share source integrity rules and evidence verdicts |
| 9 | Integration | LENS | prompt dirtying, budget lanes, recall inclusion, and external prompt-environment diagnostics are explicit |
| 10 | Integration | FORGE | background work batches one apply, one journal bundle, one prompt rebuild, and scene/phase seals |
| 11 | Micro | Open-World Reducers | broad `rootsSet` and full packet retention are gone |
| 12 | Micro | Migration Cutover | old write paths removed or gated off |
| 13 | Micro | Scale And Live Proof | synthetic and live evidence prove latency, storage, recall, prompt budget, and external-context goals |
| 14 | Micro | Documentation And Cleanup | old docs are updated or marked superseded |

## Current Proof And Gap Register

Last updated: July 2, 2026.

This register prevents the implementation plan from treating synthetic proof, bounded live proof, or storage-shaped proof as production cutover. The active plan remains valid, but the next stages should start from these facts.

### Proven Or Partly Proven

| Area | Current evidence | What it proves |
| --- | --- | --- |
| V2 logical storage keys | `src/storage/logical-storage-paths.mjs`; `test-logical-storage-paths.mjs`; logical SillyTavern storage defaults in the host adapter path. | The v2 artifact namespace is defined and reachable through the host storage abstraction, with separate active-save and CORE key builders for the same `(campaignId, saveId)`. |
| Transaction store substrate | `src/storage/transaction-store-v2.mjs`; `tools/scripts/test-transaction-store-v2.mjs`. | Blob-first, hash-verified, manifest-last commits are implemented for v2 artifacts, and `layout: "core"` commits do not rewrite active-save manifests or heads. |
| Old-save importer | `importCampaignSaveRecordToV2` in `transaction-store-v2.mjs`; `tools/scripts/test-old-save-importer-v2.mjs`. | V1 full saves can be converted into v2-shaped artifacts without preserving raw transcript/provider/snapshot payloads or legacy open-world `rootsSet` payloads in hot artifacts. |
| V2 active-save facade | `src/storage/active-save-facade-v2.mjs`; `tools/scripts/test-active-save-facade-v2.mjs`; v2 save-index bridge in `directive-storage-repository.mjs`. | A controller/runtime-facing API can persist active runtime state as v2 artifacts, preserve the existing v1 save-index path, attach `v2ManifestRef`, avoid `saves/{saveId}.v1.json` writes, keep raw transcript/provider/snapshot payloads out of v2 artifacts, record a 384 KB active-head budget diagnostic, and compact turn-scaled Command Log history to a recent projection plus omitted counts. |
| 5000-message scale harness | `tools/scripts/test-storage-scale-5000.mjs`. Latest reported pass: 5000 synthetic messages, 22,081 byte head, 2,016,186 byte host map, 2,534 byte save manifest, 10,542 byte prompt cache, 3 event segments, 16,177,360 byte legacy v1 baseline, plus one real hot append against the written fixture with 4 hot writes and 8 hot reads. | The target v2 storage shape can meet the documented size budgets in a storage-shaped synthetic harness, strips legacy broad `rootsSet` pressure from v2 artifacts, and now proves real hot-turn read/write logs do not touch sealed history or overwrite old open-tail keys. |
| CORE Store API | `src/storage/core-store-v2.mjs`; `tools/scripts/test-core-store-v2.mjs`. | `beginTurn`, mechanics commits, visible response recording, diagnostics appends, multiple background batches per transaction, idempotent background replay, and old-ledger projections can work from v2 events in isolation through the CORE save-scoped layout. The first `beginTurn(...)` can publish the initial CORE layout; later `beginTurn(...)` calls append event deltas without rewriting head/host-map/prompt-cache artifacts. CORE source-frame refs retain campaign/save/chat identity and reject campaign/save scope mismatches before writing. |
| Active-save/CORE cross-writer safety | `tools/scripts/test-storage-cross-writer-v2.mjs`. | Active-save then CORE, and CORE then active-save, both preserve the active save-index manifest ref, active materialized state, CORE projections, and separate manifest/head paths. |
| Frame and latency contracts | `src/runtime/architecture-redesign-contracts.mjs`; `test-architecture-redesign-contracts.mjs`. | Frame, external environment refs, stable hashes, and generation-start latency metrics are representable and testable. |
| Macro system skeleton contracts | `src/runtime/frame-contracts.mjs`; `src/runtime/lens-prompt-scheduler.mjs`; `src/runtime/core-turn-runtime.mjs`; `src/runtime/repair-command-boundary.mjs`; `src/runtime/source-settlement-service.mjs`; `src/jobs/forge-contracts.mjs`; `src/jobs/forge-coordinator.mjs`; `tools/scripts/test-architecture-redesign-system-skeletons.mjs`. | The named macro owners now have importable production-facing contract/facade modules. The contract test proves Frame and range Frame refs are hash-only, LENS maps old root names to prompt dirty domains and keeps diagnostics-only records from dirtying prompt, SRE hard-skips mismatched source settlement before provider calls, FORGE redacts raw prompt/provider/state payloads while producing one batch shape, CORE exposes route-level runtime methods over the store, and REPAIR exposes command-level recovery/authorization names over `repair-runtime`. This is macro scaffolding proof only; it does not prove full production cutover. |
| First production facade wiring | `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/runtime-app.mjs`; `src/jobs/campaign-sidecar-scheduler.mjs`; `src/runtime/frame-contracts.mjs`; `src/runtime/lens-prompt-scheduler.mjs`; `src/runtime/core-turn-runtime.mjs`; `tools/scripts/test-architecture-redesign-system-skeletons.mjs`; `tools/scripts/test-architecture-redesign-contracts.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-response-dispatcher-core-bridge.mjs`; `tools/scripts/test-campaign-sidecar-scheduler.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-background-projection-batch.mjs`; `tools/scripts/test-prompt-dirty-domains.mjs`. | Production player ingress now builds source Frames through the Frame facade and CORE turn opening prefers the route-level `observeSource(...)` facade when available. Runtime's active CORE wrapper exposes route-level methods such as `observeSource`, `routePending`, `releaseHostContinue`, `commitDirectiveMechanics`, `openRecovery`, `appendDiagnostic`, and `settleBackgroundBatch` over the existing store. `core-turn-runtime` now matches the real CORE Store API by sending `advanceTurn(transactionId, { phase, ... })` patches for route/release phases, and the skeleton test asserts that shape. Campaign sidecar source tokens now come from Frame's `createSourceToken(...)`, and production CORE background batches normalize sidecar/background dirty roots through LENS before persisting `promptDirtyDomains`, including real sidecar roots such as `relationships`, `crew`, `ship`, `mission`, `commandBearing`, and `commandCulture`. |
| REPAIR command boundary wiring | `src/runtime/repair-command-boundary.mjs`; `src/runtime/response-dispatcher.mjs`; `src/runtime/message-reconciler.mjs`; `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/runtime-app.mjs`; `tools/scripts/test-architecture-redesign-system-skeletons.mjs`; `tools/scripts/test-repair-runtime.mjs`; `tools/scripts/test-message-recovery.mjs`; `tools/scripts/test-response-dispatcher-core-bridge.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-source-reconciliation-engine-synthetic.mjs`. | Production now defaults to `createRepairCommandBoundary(...)` instead of direct `createRepairRuntime(...)` construction in the dispatcher, reconciler, orchestrator, and runtime service assembly. The boundary exposes command-level names for source mutation, visibility mutation, response failure, retry authorization, rollback authorization, rerun/reobserve, and response reobserve closure while retaining old method aliases for bridge/test doubles. Response dispatcher and chat-turn orchestrator now call command-name response failure/retry methods with compatibility fallbacks, and Message Reconciler calls command-name source/visibility/rollback methods with compatibility fallbacks. This is a contract-only ownership alignment; it intentionally does not cut SRE into automatic Scene Handshake settlement yet. |
| FORGE sidecar provider and settlement bridge | `src/jobs/forge-coordinator.mjs`; `src/jobs/campaign-sidecar-scheduler.mjs`; `src/jobs/forge-contracts.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/lens-prompt-scheduler.mjs`; `tools/scripts/test-campaign-sidecar-scheduler.mjs`; `tools/scripts/test-architecture-redesign-system-skeletons.mjs`; `tools/scripts/test-background-projection-batch.mjs`; `tools/scripts/test-prompt-dirty-domains.mjs`. | Production regular campaign sidecar provider fan-out now enters FORGE through `createForgeCoordinator(...).runProviderBatch(...)`, with a supplied sidecar runner so FORGE owns provider idempotency, compact source/job/result diagnostics, provider ownership labels, and hash-only packet evidence without taking over the scheduler's parsing/projection bridge. Accepted batches now use the FORGE accepted-batch prepare/settle path: preflight before old mutation, non-mutating v1 compatibility projection validation through `stateDeltaGateway.validateOperations(...)`, final CORE/FORGE settlement before any old-state compatibility carveout, no ordinary v1 root assignment/persistence, hash-mismatch rejection for changed accepted-batch replay, and idempotent replay for identical accepted batches without duplicate old apply, prompt sync, CORE settlement, or journals. No-FORGE accepted batches now reject before old v1 mutation instead of building a scheduler-owned direct CORE settlement; `commitCoreBackgroundBatch(...)` remains for the separate Command Bearing review CORE settlement until it is moved fully behind FORGE/internal background APIs. The scheduler temporarily owns JSON parsing/repair, Command Bearing evidence compatibility projection assignment/persistence, old sidecar journals, and a request/source-fingerprint-aware provider-batch replay guard so cached provider packets cannot reapply stale v1 state, prompt sync, CORE settlement, or journals. Accepted sidecar prompt sync and Command Bearing closure-review prompt sync now use FORGE-owned injected flusher seams wired in `runtime-app.mjs` to the real `synchronizeActivePrompt(...)` path after required CORE settlement; ordinary accepted prompt input is live/filtered state plus compact CORE accepted-batch projection evidence, while Command Bearing review prompt input is transient reviewed state plus compact CORE review projection evidence and persists only prompt metadata over the pre-review compatibility state. When FORGE participates in accepted-batch lifecycle, missing or falsey accepted prompt helpers now produce compact LENS-unavailable warning evidence instead of invoking scheduler-owned `syncPromptContext(...)`, and replay carries the same warning; the absent-review-helper fallback remains a temporary bridge. The bridge deliberately does not pass the v1 runtime base revision as a CORE stale-check revision yet, because active v1 and CORE mechanics revisions are not fully unified. |
| LENS production cache and external-context wiring | `src/runtime/lens-prompt-scheduler.mjs`; `src/runtime/frame-contracts.mjs`; `src/hosts/sillytavern/prompt-adapter.mjs`; `tools/scripts/test-architecture-redesign-system-skeletons.mjs`; `tools/scripts/test-prompt-dirty-domains.mjs`; `tools/scripts/test-sillytavern-external-context-observer.mjs`; `tools/scripts/test-sillytavern-chat-prompt-adapters.mjs`. | The production LENS facade now uses the same macro contract proven by the synthetic scheduler: prompt cache keys are built from bounded campaign/version/source fields plus `externalPromptEnvironmentRef.hash`, identical dirty flushes reuse the prior packet instead of rebuilding/reinstalling, dirty flushes can observe a normalized external prompt environment when a Frame ref is not already supplied, and CORE prompt diagnostics retain only cache records, Directive-owned prompt keys, external prompt refs/keys, hashes, statuses, and redaction summaries. Prompt install failure no longer advances the Directive prompt revision. Manual and runtime-owned global Directive prompt clears now run through `LENS.clearDirectivePrompt(...)`; because the host clear is global for Directive prompt keys, these clears drop all LENS installed-lane cache entries, while failed host clear preserves LENS installed state and records a failure diagnostic. Campaign conclusion now uses an injected runtime clear dependency, so LENS-style failed clear results are recorded as conclusion cleanup failures instead of silently marking prompt cleanup complete. Extension-disabled host lifecycle cleanup now prefers the runtime app LENS clear method and uses direct host clear only when the bridge method is unavailable. Preserve-packet chat suspension now has an explicit `LENS.suspendDirectivePrompt(...)` path: it calls the host with `preservePacket: true`, keeps installed-lane cache records, records suspended lanes with active/bound chat identity when available, and forces reinstall on the next bound sync instead of returning a false cache reuse. Failed suspension preserves installed cache without marking the lane suspended. Campaign activation prompt install and activation-failed cleanup now enter through injected prompt lifecycle dependencies; runtime-app supplies a LENS-backed install/suspend bridge, so activation can install while the campaign is still `activating` without calling the host prompt adapter directly. SillyTavern adapter internal rebuild/install-failed/syncForChat preserves remain host-local transport internals. This keeps ST Lorebooks/World Info, Memory Books, Summaryception, VectFox, and unknown prompt contributors as host-owned context while making their redacted influence visible to LENS/Frame proof. |
| Runtime prompt synchronization through LENS | `src/runtime/runtime-app.mjs`; `src/runtime/lens-prompt-scheduler.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-runtime-host-injection.mjs`; `tools/scripts/test-sillytavern-chat-prompt-adapters.mjs`; `tools/scripts/test-prompt-dirty-domains.mjs`. | `runtime-app.synchronizeActivePrompt(...)` now delegates prompt dirtying, cache-key comparison, host prompt install/rebuild choice, external prompt-environment ref attachment, and CORE prompt diagnostics to a lazy production LENS scheduler. The existing player-safe prompt packet builders remain local to `runtime-app` for this bridge, but LENS owns the install/reuse/suspend decision and returns `lens.status`, `rebuilt`, `cacheKey`, lane, and external ref evidence. The bridge accepts a stable prompt-sync idempotency key from background owners such as the sidecar scheduler and forwards it to LENS dirty/flush handling. Activation uses a sibling `installActivationPromptThroughLens(...)` helper because the normal active sync intentionally skips non-`active` campaigns; that helper forces the first activation install through LENS and returns the LENS packet revision/cache metadata for `recordPromptContextRevision(...)`. Activation does not use LENS replay idempotency yet because failed activation retries can suspend and reinstall the same activation id. Manual `clearPromptContext(...)`, campaign-complete conclusion cleanup, completed-campaign load cleanup, completed-campaign archive cleanup, active-save deletion cleanup, no-active-campaign chat-change cleanup, and extension-disabled runtime cleanup now clear through LENS and the next rebuild installs a fresh packet instead of reusing stale installed-lane state. Wrong-chat/unbound-chat and activation-failed suspension now go through LENS suspend, keep the host adapter's packet for later reinstall, and force a reinstall when the bound chat is restored or activation retries. Chat-native, orchestrator, and SillyTavern lifecycle proof now asserts that an unchanged repeated prompt rebuild returns LENS `reused`, does not call the host prompt adapter again, does not invoke the blocking continuity planner, routes conclusion/archive/delete/no-active/extension-disabled global clears as all-lane LENS clears, routes wrong-chat/activation-failed suspension as all-lane preserve-packet LENS suspension, and records LENS lane/cache evidence on activation install. The LENS runtime cache key deliberately excludes model-call journal growth so diagnostics cannot force prompt rebuild churn. |
| LENS prompt packet construction boundary | `src/runtime/lens-prompt-packet-builder.mjs`; `src/runtime/runtime-app.mjs`; `src/generation/player-safe-prompt-context-builder.mjs`; `tools/scripts/test-architecture-redesign-system-skeletons.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-runtime-host-injection.mjs`. | Player-safe prompt packet construction now enters through the LENS-owned `buildLensPromptPacket(...)` / `createLensPromptInput(...)` boundary instead of direct calls from `runtime-app` into generation prompt builders for normal runtime synchronization. The new boundary wraps the existing player-safe prompt builders for this slice, attaches LENS revision/cache/external-environment metadata, exposes `lensPromptPacketProjectionSummary(...)` for activity reporting, and keeps prompt content behavior unchanged while moving ownership. Activation still builds its continuity-planned packet in `campaign-activation-coordinator` during the bridge, then hands that packet to the injected LENS lifecycle so LENS owns install, revision/cache metadata, suspension, and retry reinstall behavior. Focused tests prove the boundary builds a valid `directive.playerSafePromptContext` packet with revision/cache/external ref metadata and that chat-native activation, rebuild, player-turn prompt sync, prompt cache reuse, and host-injection flows still pass. |
| SRE Scene Handshake diagnostic preflight | `src/runtime/source-settlement-service.mjs`; `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/frame-contracts.mjs`; `tools/scripts/test-architecture-redesign-system-skeletons.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-source-reconciliation-engine-synthetic.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-message-recovery.mjs`. | Scene Handshake now has a provider-free SRE preflight before the old `runSceneHandshakeSettlement(...)` path. The preflight reads the existing ingress Frame and CORE transaction, calls `preflightLatestPair(...)`, appends a diagnostic-only `sourceSettlement` record to the same CORE transaction, reports `sreSceneHandshakePreflight` activity, and never applies operations or calls the SRE provider path. The selected-swipe Scene Handshake regression proves SRE observes the same source transaction while preserving selected assistant variant acceptance, Scene Handshake commit behavior, prompt sync, time-boundary idempotency, and raw player text redaction. Automatic SRE settlement remains intentionally deferred. |
| SRE Scene Reconciliation range preflight | `src/runtime/scene-reconciliation.mjs`; `src/runtime/source-settlement-service.mjs`; `src/runtime/runtime-app.mjs`; `tools/scripts/test-scene-reconciliation.mjs`; `tools/scripts/test-scene-reconciliation-open-world.mjs`; `tools/scripts/test-architecture-redesign-system-skeletons.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`. | Scene Reconciliation now has a provider-free SRE `explicitRange` preflight at the start of `execute(...)`, before invalidation, model observations, proposal creation, safe auto-apply, or pending review creation. Runtime injects the active CORE-backed `sourceSettlementService`; CORE-targeted ranges call `preflightRange(...)` with hash-only message refs and persist only a compact `sourcePreflight` status/range/diagnostic summary, while missing CORE transaction ranges are locally marked `skippedMissingCoreTransaction` and do not call SRE. The SRE service now validates explicit range Frames against expected campaign/save/chat identity, so wrong-chat/wrong-save ranges hard-skip before any provider/apply path. This is diagnostic-only evidence; automatic range settlement and range-review application remain deferred. |
| Production Frame, response, and model-call diagnostic bridges | `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/response-dispatcher.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/model-call-journal.mjs`; `src/hosts/sillytavern/chat-adapter.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-response-dispatcher-core-bridge.mjs`; `tools/scripts/test-runtime-model-call-journal.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-sillytavern-chat-prompt-adapters.mjs`. | Production ingress now creates compact `directive.turnSourceFrame.v1` metadata before classification, runtime-app instantiates/hydrates a CORE Store proxy for active campaign chats, old ingress rows carry `sourceFrameId`/`coreTransactionId`, ordinary hostContinue delegates call SillyTavern `Generate(...)` with `waitForCompletion: false`, CORE can advance `routePending -> hostContinueReleased` and `routePending -> visibleResponsePosted` for the same transaction, Directive-posted committed responses carry `directiveGenerationStartedAt`/`turnLatency` into the old response ledger and CORE response projection, CORE read projections now expose `turnTiming` derived from persisted phase/visible-response events, retryable response failure can enter `responseRetryRequired` and later record the visible response without weakening generic recovery, host-native failed/unavailable recovery can close through delayed reobserve only with a REPAIR response-reobserve closure decision, model-call diagnostics mirror best-effort into CORE diagnostics for the active in-progress ingress without blocking generation, branch/source CORE projections stay isolated, and reload tests prove CORE projections append rather than overwrite after app restart. |
| CORE mechanics bridge ordering | `src/runtime/turn-commit-coordinator.mjs`; `src/storage/core-store-v2.mjs`; `src/runtime/runtime-app.mjs`; `tools/scripts/test-turn-commit-coordinator-core-mechanics.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-mechanics-narration-runtime-synthetic.mjs`. | Chat-native deterministic mechanics checkpoints now commit the compact CORE mechanics bundle before the v1 checkpoint bridge persists. If a real CORE mechanics write fails, the turn errors before narration and before the old v1 checkpoint can record old-ledger-only success. Runtime app now stages the candidate committed state until checkpoint success, so live memory does not advance ahead of failed CORE/v1 checkpointing. The v1 checkpoint is therefore a bridge projection after CORE, not the first durable mechanics writer for this path. When a turn packet carries `directive.openWorldReducerBundle.v1`, CORE mechanics records validated, redacted reducer-source evidence: source kind, source outcome/event/range hashes, source hash, operation count, changed roots, and operation hash, without storing reducer values. Reducer-owned roots are excluded from broad `domainCommitted` hash operations to avoid duplicate authority. CORE mechanics also passes the transaction's observed `baseMechanicsRevision` and preflights the current revision so stale mechanics fail before route advance. |
| Live generation-start timing artifact plumbing | `tools/scripts/smoke-sillytavern-live.mjs`; `tools/scripts/soak-sillytavern-campaign-live.mjs`; `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/lib/generation-timing-proof-policy.mjs`; `tools/scripts/test-generation-timing-proof-policy.mjs`; `tools/scripts/test-live-soak-prep.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `tools/scripts/test-response-dispatcher-core-bridge.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; bounded artifacts `artifacts/live-soak/sillytavern-campaign/2026-06-28T21-58-54-918Z/report.json`, `artifacts/live-soak/sillytavern-campaign/hostcontinue-generation-start-fixed-20260628-165022/report.json`, `artifacts/live-soak/sillytavern-campaign/core-timing-skipped-proof-20260628-175237/report.json`, and `artifacts/live-soak/sillytavern-campaign/core-timing-mixed-proof-20260628-175644/report.json`. | Live smoke artifacts can attach per-turn `generationTiming`, compact summaries include generation-start status/max latency/skipped turns, delegated soak promotion copies the proof into `turn-end` live-log records, and the soak runner emits `live-generation-start-timing` before full certification. Runtime-snapshot proof covers `directiveCommit` and `hostContinue`. The current persisted extractor now reads CORE Store `turnTiming` projections through the save-scoped `core` layout. The mixed Ashes proof passed from persisted CORE projection with one `committedOutcome` at `13934 ms`, `architectureWithin60s: true`, and one skipped `clarificationNeeded`; the all-skipped proof returned `warning`, proving deterministic posts cannot certify the metric alone. The five-user coordinator now summarizes each lane's `live-generation-start-timing.details.proof`, rejects missing/runtime-only/summary-only/all-skipped timing as certification evidence, rejects reusable lanes without persisted CORE proof, and emits aggregate `generation-start-timing-core-proof`. |
| Live host-native completion proof | `src/hosts/sillytavern/chat-adapter.mjs`; `src/runtime/response-dispatcher.mjs`; `src/storage/core-store-v2.mjs`; `tools/scripts/smoke-sillytavern-live.mjs`; `tools/scripts/soak-sillytavern-campaign-live.mjs`; `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/test-live-soak-prep.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; bounded artifact `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T08-22-01-670Z/report.json`. | Live smoke now reads save-scoped CORE response projections after host-native rounds, stores per-round `hostNativeCompletion.persisted`, attaches per-round `hostNativeCompletionRequirement`, and emits aggregate `hostNativeCompletionProof` with compact summary fields plus required-completion counts. Delegated soak preserves the requirement object in promoted `turn-end` records and emits `live-host-native-completion-proof`; the five-user coordinator summarizes lane proof, rejects missing/non-CORE/incomplete proof, rejects count-only proof when the required turn is in scope, rejects reusable lanes without completion proof, and emits aggregate `host-native-completion-core-proof` with required-completion status per lane. The June 29 bounded five-user Ashes run reached turn 3 in all five non-human soak profiles and recorded one terminal `hostContinue` assistant row per lane from persisted CORE response projections with `source: "coreStoreResponseLedger"`, `completionSource: "coreProjection"`, `completedHostContinueCount: 1`, `failedHostContinueCount: 0`, host row `6`, and a 64-character text hash. Max host-native completion latency was `70382 ms`. Deterministic tests now cover the stricter required-turn contract; full live certification still requires a fresh unbounded run producing this proof. |
| Required hostContinue route contract | `tools/scripts/soak-sillytavern-campaign-live.mjs`; `tools/scripts/smoke-sillytavern-live.mjs`; `tools/scripts/test-live-soak-prep.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `tools/scripts/test-continuity-matrix-full-certification-preflight.mjs`. | The Ashes soak script marks turn 3 with derived `scriptMessageId: "soak-turn-03"`, `turn: 3`, `expectedRoute: "hostContinue"`, `expectedResponseStrategy: "injectAndContinue"`, and `hostNativeCompletionRequired: true`. The smoke runner preserves this metadata on the marked round as `hostNativeCompletionRequirement`, delegated soak preserves it during promotion, the coordinator derives the same required message from `SOAK_TURN_SCRIPT`, and full-certification preflight fails count-only proof. Required proof is `requiredHostNativeCompletions[]` / `requiredCompletions[]` with exact script id, turn, route, strategy, source, completion source, and pass status. Turn-limited scripts below turn 3 cannot carry this requirement and therefore remain limited evidence only. |
| Fast gate and mechanics/narration timing | `fast-gate-runtime-synthetic.mjs`; `mechanics-narration-runtime-synthetic.mjs`; `runtime-app.mjs`; `generation/narration.mjs`; related tests. | The target route timing and narration-start split are viable in synthetic runtime flows, and the production Directive narration provider boundary now records `directiveGenerationStartedAt` before awaiting provider completion. |
| Command Log summary bridge | `runtime-app.mjs`; `command-log-summary-sidecar.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-command-log-summary-sidecar.mjs`; `tools/scripts/test-core-store-v2.mjs`. | Command Log assisted summary is no longer awaited before Directive narration starts. Direct runtime turns defer it until narration, chat-native committed turns schedule it after visible response/prompt settlement, and `flushChatSidecars()` settles the queue with campaign/save/chat/outcome/input guards. Chat-native committed turns mirror queued status into CORE `sidecarDiagnostics`, and successful settlements now commit a sanitized CORE background batch with zero mechanics operations, one `commandLogSummary` worker ref, source refs, input-signature hash, and assisted-summary hash. Raw summary text, prompt text, player text, and provider output stay out of CORE artifacts. |
| Narrative Thread settlement bridge | `src/runtime/runtime-app.mjs`; `src/runtime/chat-turn-orchestrator.mjs`; `src/directors/narrative-thread-director.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-narrative-thread-director.mjs`; `tools/scripts/test-core-store-v2.mjs`. | Chat-native committed turns no longer await the post-commit conversation processor before returning from the visible response path. Runtime schedules Narrative Thread extraction on a specialized post-visible queue after Command Log settlement for normal committed turns and non-terminal pending-interaction accept/confirm resolutions, mirrors queued/applied/stale/failure states into CORE `sidecarDiagnostics`, and commits successful settlements as sanitized `narrative-thread:*` CORE background batches with zero mechanics operations and one `narrativeThreadDirector` worker ref. The director now accepts a source-current guard and can stop stale work before provider or apply stages where the queue detects drift; the orchestrator also rejects direct pending-resolution commits when the original pending source ingress is stale. Raw player text, assistant text, prompts, scene deltas, provider output, and campaign state snapshots stay out of CORE diagnostics and background refs. |
| Advisory enrichment bridge | `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/model-call-journal.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-runtime-model-call-journal.mjs`; `tools/scripts/test-core-store-v2.mjs`. | Counsel turns now release host generation with a deterministic fallback advisory before `missionDirectorAdvisor` completes. Runtime schedules advisory enrichment on a post-release queue, patches the same advisory id on success, commits a sanitized `advisory-enrichment:*` CORE background batch with zero mechanics operations and one `missionDirectorAdvisor` worker ref, and records delayed model-call diagnostics against the original CORE transaction using ids/hashes rather than raw prompt, player text, provider output, or advisory prose. |
| Terminal checkpoint settlement bridge | `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/campaign-end-condition-service.mjs`; `src/runtime/architecture-redesign-contracts.mjs`; `tools/scripts/test-chat-turn-terminal-outcome.mjs`; `tools/scripts/test-campaign-end-condition-service.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`. | Terminal committed narration remains the transaction's single CORE visible response. Terminal checkpoint posts now settle as sanitized zero-operation `terminal-checkpoint:*` CORE background/control batches with one `terminalOutcomeCheckpoint` worker ref, while terminal checkpoint replies settle their own CORE resolution transaction instead of remaining `observed`. The bridge records ids, hashes, action/status, checkpoint host ids, and source refs only; raw checkpoint text and raw player resolution text are redacted from CORE events and diagnostics. Terminal checkpoint replies still bypass ordinary Director preview/commit, regular sidecars, Command Log summary, Narrative Thread extraction, and advisory enrichment. |
| Synthetic FORGE background batch | `src/jobs/forge-coordinator-synthetic.mjs`; `src/storage/core-store-v2.mjs`; `src/runtime/lens-prompt-scheduler-synthetic.mjs`; `tools/scripts/test-background-projection-batch.mjs`; `tools/scripts/test-core-store-v2.mjs`. | The target FORGE shape is viable in isolation: source preflight/recheck, abort/stale handling, worker fan-out, conflict rejection, one CORE `commitBackgroundBatch(...)`, one FORGE diagnostic bundle, one LENS background flush, idempotent replay, and diagnostics-only no-change results that do not persist raw worker prompts or responses into CORE state. |
| Production regular sidecar bridge | `src/jobs/campaign-sidecar-scheduler.mjs`; `src/jobs/forge-coordinator.mjs`; `src/runtime/runtime-app.mjs`; `src/storage/core-store-v2.mjs`; `src/runtime/architecture-redesign-contracts.mjs`; `tools/scripts/test-campaign-sidecar-scheduler.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-runtime-host-injection.mjs`. | Regular campaign sidecars now parse/validate before mutation, reject cross-worker path conflicts before mutation, validate accepted non-conflicting operations through one non-mutating `stateDeltaGateway.validateOperations(...)` projection preview, settle one accepted-batch CORE background bridge through production FORGE, skip ordinary v1 root assignment/persistence after settlement, flush accepted-batch prompts through FORGE/LENS from live/filtered state plus compact CORE projection evidence, and keep per-worker diagnostics as projections over the settled batch. The bridge now carries compact `turnSourceFrameRef`/`sourceToken` provenance into sidecar diagnostics and FORGE/CORE background refs while redacting raw player text, assistant text, prompt text, provider output, and full Frame/source snapshots. June 29 live regression work also narrowed the FORGE source check: unchanged source Frames may rebase over newer unrelated global revisions, likely-truncated JSON receives one strict repair attempt before the existing fail-closed rejection path, sidecar proposals are compact by default, and `test-campaign-sidecar-scheduler.mjs` proves short invalid JSON still rejects while truncated JSON can be repaired without persisting malformed raw sidecar text. June 30 FORGE/LENS bridge proof adds provider fan-out through `runProviderBatch(...)`, provider-result replay that preserves failure status without rerunning providers, scheduler-side stable batch replay that prevents duplicate old apply/prompt/journal work, idempotent `settleAcceptedBatch(...)` replay with no second background commit or diagnostic, LENS-normalized sidecar prompt dirty domains/idempotency keys for accepted batches, and review-hash-scoped FORGE/LENS prompt flushing for Command Bearing closure review. |
| Open-world reducers | `src/directors/open-world-event-reducers.mjs`; `open-world-turn-coordinator.mjs`; `transaction-state.mjs`; `test-open-world-event-reducers.mjs`; `test-transaction-state.mjs`. | New coordinated open-world packets emit bounded reducer bundles instead of broad `openWorld.rootsSet` packets, and the production commit path now rejects any new `rootsSet` replacement even when a reducer bundle is also present. Reducer bundles now have a reusable validator/compactor that rejects forbidden keys, unknown operation types, invalid roots, runtime journal writes, and stale operation-count/changed-root diagnostics. Existing retained legacy ledger entries are still sanitized during pruning. |
| Dependent edit reobserve guard | `src/runtime/chat-turn-orchestrator.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; recovery/SRE focused tests. | An edited player row with an existing dependent assistant response returns `staleSource` before reclassification and cannot create a replacement ingress for the same host row. |
| Source-mutation REPAIR/CORE recovery bridge | `src/runtime/repair-runtime.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/message-reconciler.mjs`; `src/storage/core-store-v2.mjs`; `tools/scripts/test-repair-runtime.mjs`; `tools/scripts/test-message-recovery.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-repair-runtime-synthetic.mjs`. | A production `repair-runtime` boundary now opens CORE-first source-mutation recovery cases before old-ledger mutation. CORE Store can reopen a settled transaction to `recoveryRequired`; the production runtime CORE facade exposes `markRecoveryRequired`; and fake-host runtime paths now prove committed player-source edits plus committed Directive response edits/deletes write persisted CORE recovery projections before old ingress/response/recovery projections. CORE recovery projections expose source mutation, compact REPAIR decision, REPAIR-computed `legacyProjection`, dependent outcome/response refs, source Frame refs, allowed actions, visibility metadata when provided, and replacement-text hash/presence while stripping raw `replacementText`. CORE recovery conflicts still fail closed before old ledgers mutate. `MessageReconciler` consumes `legacyProjection` for the bridge's old projection status/action mirroring and remains the temporary projection/prompt-sync adapter, not the policy owner. |
| External context readiness | Five-user bounded Ashes artifact `2026-06-28T12-23-18-316Z`; readiness external-context probe. | Non-human soak profiles can browser-confirm ST Lorebooks, Memory Books, Summaryception, and VectFox observability without using `default-user`. |
| External context fixture-depth gate | `tools/scripts/lib/sillytavern-live-harness.mjs`; `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `tools/scripts/test-live-soak-prep.mjs`. | The readiness probe now reports `fixtureDepth` separately from browser/disk observability. Bounded live runs keep shallow fixture depth as a warning, while an unbounded full-certification run fails unless at least one non-human soak profile has rich active evidence for all required external-context targets. |
| External context fixture prep | `tools/scripts/prepare-sillytavern-external-context-fixture.mjs`; `tools/scripts/test-external-context-fixture-prep.mjs`; `tools/scripts/test-sillytavern-external-context-readiness-preflight.mjs`; `tools/scripts/run-alpha-gate.mjs`. | A deterministic dry-run/write/validate tool can prepare non-human soak profiles with bounded native World Info, STMemoryBooks, Summaryception, and VectFox fixture data. It refuses `default-user`, allows only `directive-soak-a` through `directive-soak-e`, writes no API keys or raw extension source, writes the fixture under the real Ashes character chat folder, clears all known SillyTavern disabled-extension arrays for the target fixture systems, validates through the same compatibility and fixture-depth contracts, and can feed sanitized synthetic browser snapshots into offline readiness so `host-extension-fixture-depth` is behaviorally tested without live SillyTavern. |
| Live external context fixture certification | `artifacts/live-soak/sillytavern-campaign/2026-06-30T01-20-17-302Z/report.json`; `host-extensions/external-context-probe.json`; `live-log.jsonl`; `tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs --live --prepare-external-context-fixtures --activate-external-context-fixture --write-artifacts`. | Strict five-user readiness now passes with `host-extension-fixture-preparation: pass` and `host-extension-fixture-depth: pass` across all five non-human soak users. `fixtureDepth.fullFixtureUserHandles` contains `directive-soak-a` through `directive-soak-e`; each user has rich-active ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox evidence; each fixture chat activated; storage isolation passed; `default-user` remained unused. |
| External context generation proof gate | `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `src/hosts/sillytavern/prompt-adapter.mjs`; `tools/scripts/smoke-sillytavern-live.mjs`. | The coordinator now summarizes pre-generation prompt-inspection artifacts separately from readiness. It requires expected capture depth, exact expected `scriptMessageId` coverage for the requested turn scope, no missing/duplicate/unexpected pre-generation script ids, `externalPromptEnvironmentRef`, known external prompt keys, compact `externalPromptEnvironmentTargets`, final-host-prompt inclusion, and redaction summaries. When readiness marks a lane as a rich fixture user, the aggregate `external-context-generation-proof` fails unless that lane also proves rich generation-time pressure for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox. |
| Browser-safe shared contracts | Standalone smoke `2026-06-28T06-18-37`; contract hash/UTF-8 canaries. | Shared modules reachable from SillyTavern no longer depend on `node:crypto` or `Buffer`. |

### Not Yet Proven

| Area | Gap | Required closeout |
| --- | --- | --- |
| Runtime persistence cutover | Queued runtime persistence now has the controller-level v2 facade bridge and writes by explicit save id without changing active-save navigation. Chat-native flow proves queued runtime writes preserve the v1 checkpoint payload path/content while attaching a v2 runtime manifest ref and compact active head; normal manual Save preserves v2 authority after runtime takeover; Save As creates a v2 manifest-owned branch without creating a v1 save payload; autosave creates non-current v2 manifest-owned autosaves and prunes older autosave manifests without moving the active manual save pointer. Runtime settings/history updates use the same v2 runtime persistence bridge. `settleActiveState(...)` remains an explicit State Safety v1 checkpoint action by force-checkpoint option. CORE Store is still not the full production turn writer. | Keep Save/Save As/autosave v2 authority in regression, preserve State Safety as the explicit v1 checkpoint action, extend runtime persistence to manifest-index saves without requiring v1 anchors where still needed, and continue migrating durable turn ownership to CORE Store. |
| V2 layout bridge ownership | Active-save facade owns the default v2 resume/index layout; CORE Store owns `campaigns/{campaignId}/saves/{saveId}/core/...` and `campaigns/{campaignId}/core/...`. Normal Save, Save As, and autosave now preserve/create v2 manifest authority through the bridge instead of demoting runtime-current state to v1. | Preserve this split until CORE can materialize the full active resume head and own the default runtime save semantics. Keep cross-writer tests in the alpha gate before live controller CORE Store instantiation as the only durable turn writer. |
| V2 runtime resume source | The v2 active-save facade materializes a compact head and now rehydrates compact ingress/response/recovery runtime projections, current-tail `turnLedger` projections, compact model-call journal diagnostics, compact CORE sidecar/background diagnostics, compact prompt-cache resume evidence, `responseLedgerRevision`, and hash/id-only Outcome Integrity refs from active event/turn/diagnostics segments plus the manifest-owned prompt-cache artifact. Manifest-owned v2 save reload now uses the manifest record on disk rather than stale save-index `manifestRef` metadata, accepts direct v2 materialized heads, and sees hot appended event/turn evidence without reading sealed history. It still omits heavyweight runtime journals, raw sidecar packets, provider output, raw prompt-cache block bodies, and raw model-call prompt/response bodies by design. | Keep bounded ingress/response/recovery/turn/model-call/sidecar/background/prompt-cache projection rehydration in regression, then define projection/rehydration rules for any remaining presentation/recovery projections needed before claiming full v2 runtime resume safety. |
| Macro skeleton runtime wiring | Frame, LENS, SRE, CORE runtime, REPAIR command, and FORGE facades now exist with a shared contract test, and production wiring now uses Frame/LENS/CORE/REPAIR/FORGE facade boundaries for source token, prompt-dirty, LENS prompt packet/cache/ref/install evidence, SRE diagnostic preflight, SRE latest-pair selected-variant preflight, SRE explicit-range terminal settlement, production-default SRE latest-pair terminal Scene Handshake settlement, production latest-pair caller routing through the `source-settlement-latest-pair` owner adapter, REPAIR-owned dependent invalidation projection for Scene Handshake/Mission Component source mutations, CORE route-method, recovery-command, and background-batch evidence seams. Several production call sites still reach old modules directly. Sidecar queue execution, response dispatch internals, active-save persistence, and the internals behind the latest-pair adapter still need to move behind the named owners. | Continue wiring one primary player-turn vertical slice through these facades before returning to micro hardening: move full background execution through `forge-coordinator`, continue persistence through the v2/CORE split, and replace latest-pair adapter internals with native SRE mode code once caller ownership stays stable. Keep old ledgers only as projection adapters during the bridge. |
| CORE Store production ownership | Runtime app now instantiates and hydrates CORE Store for active campaign chats and routes production ingress, hostContinue release, post-release host-native completion/failure projection, synchronous and delayed host-native continuity-contradiction recovery, Directive-posted visible responses, retryable response recovery phase, deterministic chat-native mechanics checkpoints, active-turn model-call diagnostics, Command Log summary diagnostics/background settlement, Narrative Thread diagnostics/background settlement, regular campaign-sidecar lifecycle/background settlement, CORE-backed source-mutation recovery, latest/no-outcome source-restart replacement transactions, and CORE-backed outcome-rerun replacement transactions through it. CORE Store now records latest-boundary restart links with `supersedeLatestSourceTransaction(...)`, `latestSourceRestarted`, prior phase `restartSuperseded`, persisted recovery resolution, and hydrated/persisted source-restart projections; it also records compact `outcomeReplacementRecorded` events for committed outcome reruns. The chat-native mechanics checkpoint now writes CORE before the v1 checkpoint bridge, and committed player-source edits now have production-path CORE recovery projection proof. Storage hot-path proof has moved from substrate-only to public CORE operations: `beginTurn(...)`, `advanceTurn(...)`, `commitMechanics(...)`, `recordVisibleResponse(...)`, `repairVisibleResponseRef(...)`, `markRecoveryRequired(...)`, `supersedeLatestSourceTransaction(...)`, `recordOutcomeReplacement(...)`, and `commitBackgroundBatch(...)`; after initial layout publication, these persist event/turn deltas through `commitV2EventTurnSegments(...)`. `test-core-store-v2.mjs` proves hot `beginTurn(...)`/route advancement writes only event tail plus manifests, mechanics writes only event tail, turn tail, and manifests, response record/repair/recovery/source-restart/outcome-replacement/background-batch writes only event tail plus manifests, these paths do not read/write head, host-map, prompt-cache, v1, or active-save paths, mechanics does not read/write/verify sealed event/turn refs after rollover, and reload derives route, timing, mechanics revision, turn id, outcome id, prompt dirty domains, visible response refs, repaired response hashes, recovery cases, source-restart links, replacement history, background batch summaries, and hydrated same-key replay/reject behavior from manifest-selected segments. CORE read projections now derive host-map rows from `turnObserved`, `visibleResponseRecorded`, repair, and source-restart events without reading `host-map.v2.json`; background prompt dirty domains hydrate from `backgroundBatchCommitted.operationBundle.dirtyDomains`, not from the preserved materialized head/prompt-cache refs. Manifest-owned v2 repository reload after hot append is now proven against the 5000-message harness without sealed-history reads. First source-turn runtime bootstrap is focused-test proven: a source save with no preexisting CORE layout publishes CORE/v2 projections on the first player turn, binds old ingress to `sourceFrameId`/`coreTransactionId`, updates the save index to `runtimeStorageFormat: "v2"`, and leaves the original v1 checkpoint payload untouched. Response-dispatch recovery duplicates now replay as `recoveryRequired` without reposting or rereleasing when CORE response/release recording failed, and runtime freshness arbitration now compares transient CORE read-projection evidence before old ledger growth can win. | Route the remaining source mutation decisions through a REPAIR service boundary before old reconciliation, move remaining background lifecycle writes, broader response-state ownership, full runtime resume semantics, contradiction compatibility projection demotion, and final bounded reducer/event mechanics application through CORE with old ledgers exposed only as read projections. Background dirty-domain replay, first-turn CORE bootstrap, response recovery duplicate replay, runtime freshness arbitration, and manifest-owned reload freshness are now event-derived/proven and no longer block append-only background batches. |
| Full persisted timing certification | Bounded single-user Ashes proof now passes from CORE Store projections for `directivePosted` committed outcomes and records deterministic `clarificationNeeded` posts as skipped non-generation evidence. The five-user coordinator now requires each live lane to include a passing `live-generation-start-timing` check with `source: "coreStoreTurnTiming"`, `timingSource: "coreProjection"`, and `checkedTurnCount > 0`, and it exposes aggregate `generation-start-timing-core-proof`. It has not yet run the full five-user Ashes depth with that gate. | Run the five-user Ashes coordinator without `--turn-limit` and prove CORE-projection-backed `generationTiming.persisted.entries[]` across all lanes, including `hostContinue` and `directiveCommit` lanes. Keep all-skipped, summary-only, runtime-snapshot-only, or unknown-route artifacts as warning/failure rather than pass. Do not restore full response ledgers to v1 save payloads or promote the active-save facade head into the timing ledger. |
| Frame in production | Production ingress creates `directive.turnSourceFrame.v1`, and regular campaign sidecars now carry a compact `turnSourceFrameRef`/`sourceToken` into sidecar diagnostics and CORE background refs. Downstream SRE, REPAIR, LENS, and the full CORE lifecycle still do not consume the Frame as their only source token. | Extend compact Frame refs to CORE transaction, SRE, REPAIR, LENS, and remaining FORGE/background handoffs, then remove duplicate source-token construction. |
| True `hostContinue` release | Ordinary hostContinue now calls SillyTavern `Generate(...)` with `waitForCompletion: false`, records release timing, exposes CORE `turnTiming`, and has live-smoke artifact plumbing for runtime/persisted timing proof. The bounded three-turn Ashes run at `artifacts/live-soak/sillytavern-campaign/hostcontinue-generation-start-fixed-20260628-165022/report.json` proved a `hostContinue` counsel turn from runtime snapshot evidence with `hostGenerationReleasedAt`, `hostGenerationReleaseMode: nonblocking`, `generationStartLatencyMs: 1131`, and `architectureWithin60s: true`. | Retain CORE-projection-backed `generationTiming.persisted.entries[]` with `hostGenerationReleasedAt`, `architectureWithin60s: true`, separate provider completion timing, and no blocking model-backed SRE/advisory/LENS/FORGE work before release. Repeat this in the five-user coordinator before full certification. |
| Terminal host-native completion certification | Bounded five-user Ashes artifact `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T08-22-01-670Z/report.json` proves the bridge can record persisted CORE host-native completion at the required turn depth in all five non-human soak lanes. Follow-up deterministic gates now prove the certification contract rejects count-only `hostContinue` completion proof and requires `soak-turn-03` binding. The bridge fixes behind the bounded proof are: canonical 64-character host-row hashes in the SillyTavern adapter, transaction-aware CORE reobserve for same-transaction host observations, `backgroundSettling -> visibleResponsePosted` phase allowance for post-release host-native completion, and a `visibleResponseRefRepaired` event for missing-hash repair. | Full certification requires the unbounded 52-turn run with the stricter proof: every lane's `live-host-native-completion-proof`, aggregate `host-native-completion-core-proof`, and full-certification preflight must expose passing required completion evidence for `scriptMessageId: "soak-turn-03"`, `turn: 3`, `expectedRoute: "hostContinue"`, and `expectedResponseStrategy: "injectAndContinue"`. Keep proof hash-only; do not store raw assistant text in artifacts or CORE projections. |
| `directiveCommit` hot-path closeout | Production Director commit records `directiveGenerationStartedAt` at the narration provider boundary, keeps provider completion separate, exposes CORE `turnTiming`, and has live-smoke artifact plumbing for persisted timing proof. Command Log summary and Narrative Thread extraction now have queued bridges that no longer block narration start or the chat-native visible response return path, including non-terminal pending accept/confirm resolutions, and successful chat-native settlements commit CORE background effects. Terminal checkpoint posts and replies now have a zero-operation CORE settlement policy. A bounded single-lane live rerun at `artifacts/live-soak/sillytavern-campaign/2026-06-28T21-58-54-918Z/report.json` proved one `directiveCommit` turn from runtime snapshot evidence with max generation-start latency `25875 ms` and `architectureWithin60s: true`; the later three-turn Ashes proof at `hostcontinue-generation-start-fixed-20260628-165022` repeated `directiveCommit` evidence with max `23384 ms`; the mixed CORE-projection Ashes proof at `core-timing-mixed-proof-20260628-175644` proved persisted CORE timing for one `committedOutcome` at `13934 ms`. Other post-turn work can still block after visible response or remain unordered across background queues. | Retain CORE-projection-backed `generationTiming.persisted.entries[]` with `directiveGenerationStartedAt`, `generationStartLatencyMs <= 60000`, `architectureWithin60s: true`, terminal-outcome coverage, and repeat evidence in the five-user coordinator before full certification. |
| CORE/FORGE accepted-batch bridge consistency | This blocker is now closed at focused-test depth. The accepted regular sidecar bridge uses a FORGE prepare / non-mutating compatibility validation / final-settle protocol: CORE/FORGE rejection fails before old mutation, validation failure fails before final settlement, final-settlement failure no longer requires compensation because the compatibility projection has not been assigned, ordinary accepted batches no longer persist old v1 domain roots, prompt sync receives live/filtered state plus compact CORE projection evidence, Command Bearing accepted evidence becomes compact CORE effect/projection rows instead of old `commandBearing.evidenceLedger` roots, rejected/failed/stale paths no longer append old `runtimeTracking.sidecarJournal` rows, identical accepted-batch replay is idempotent, changed accepted-batch replay rejects by worker-results hash even when the caller does not supply an explicit hash, and provider failures/results are compacted before activity, CORE diagnostics, or replay caches can leak raw provider text. | Treat this as a bridge-safety proof, not the full architecture finish. Keep accepted-batch split-brain, raw-canary, Command Bearing evidence/review projection, and no-old-journal rejection tests as the safety floor while Wave 1/2 lifecycle ownership and remaining LENS budget/external-context work continue. |
| Production FORGE ownership | Synthetic FORGE and the regular campaign-sidecar bridge now prove non-mutating compatibility projection validation, one FORGE-owned accepted-batch CORE background settlement, no ordinary v1 root projection writes, FORGE/LENS prompt flushing from live/filtered state plus compact CORE accepted-batch evidence, Command Bearing accepted-evidence projection without v1 evidence-root persistence, Command Bearing review CORE projection without v1 review-root persistence, conflict-before-mutation, bridge-safe accepted-batch prepare/validate/final-settle ordering, request-hash/source-fingerprint-aware provider replay, hash-guarded accepted-batch replay, compact recovery/warning evidence, and raw-provider-diagnostic redaction for accepted regular sidecars. Production `runtime-app` now injects `createForgeCoordinator(...)` into the sidecar scheduler, and accepted sidecar worker results pass through the FORGE accepted-batch path with provider-owner diagnostics and idempotent replay instead of the scheduler hand-building the CORE background batch. Command Log summary, Narrative Thread extraction, advisory enrichment, and terminal checkpoint settlement remain specialized queues/control paths, but successful settlements now share CORE background semantics instead of diagnostics-only apply. The Narrative Thread bridge now covers normal committed turns and non-terminal pending accept/confirm resolutions; the director still applies internal state commits through its existing director path rather than one FORGE aggregate apply. | Continue moving provider execution, validation, prompt scheduling, director-internal multi-commit work, and remaining background effects into FORGE/background settlement now that accepted-batch bridge safety is proved. Keep regular sidecar, Command Log, Narrative Thread, advisory, terminal checkpoint, accepted-batch split-brain, provider-replay-hash, accepted-replay-hash, recovery-marker, prompt-input-leak, Command Bearing evidence/review projection, no-old-journal rejection, and raw-canary tests as the production safety floor. |
| Open-world final shape | Broad `rootsSet` application is removed from migrated production commits, and production chat-native mechanics checkpoints now create compact CORE turn projections. CORE now validates and records redacted reducer-bundle source evidence when a committed packet carries `directive.openWorldReducerBundle.v1`, excludes reducer-owned roots from duplicate broad domain operations, and enforces stale mechanics base revisions. Reducer bundles are still derived through an existing projection commit path. | Apply bounded reducer events through CORE Store once instead of deriving them from a projected full-state commit. |
| Full REPAIR ownership | The dependent-edit loop has a targeted guard, and the source-mutation bridge now has a production `repair-runtime` boundary with CORE-first projection proof for CORE-backed no-outcome player edits/deletes, committed player edits, and committed Directive response edits/deletes. Edit/delete source-mutation opening is no longer buried solely inside `MessageReconciler`, REPAIR now returns `legacyProjection` for the bridge's old ingress/response/recovery status and action mirroring, owns diagnostic-only visibility observations, supplies compact source-reobserve decisions for the Sam Vickers dependent-edit guard plus latest-boundary restart eligibility, defines response-recovery policy for host-native unavailable/failed and synchronous/delayed host-native continuity contradiction paths, authorizes host-native failed/unavailable reobserve closure, and now authorizes source-mutation rollback actuation before `MessageReconciler` restores a tracked revision. REPAIR now also discovers Scene Handshake settlement ids and Mission Component ids for tracked and untracked source mutations, returns compact dependent invalidation projection without raw replacement text, prevents deleted Mission Components from downgrading to stale, and lets `MessageReconciler` apply only those projected ids/statuses. `chat-turn-orchestrator` now consumes `restartLatestSource` for latest/no-outcome rows by creating a distinct restart ingress/source Frame/CORE transaction, calling CORE Store `supersedeLatestSourceTransaction(...)`, marking the old ingress `restartSuperseded`, resolving the old recovery as `latest-source-reobserved`, and proving duplicate reobserve idempotency. CORE Store persists that link as `latestSourceRestarted`, keeps both host-map rows, excludes the superseded transaction from active CORE heads, and rehydrates the link from event segments. CORE Store also keeps generic `recoveryRequired` terminal for visible responses unless the response ref carries REPAIR's host-native reobserve closure decision; delayed reobserve after failed/unavailable writes a hash-only visible response and a resolved recovery projection while old response/recovery ledgers are mirrored closed; delayed callback or manual reobserve contradictions now retain the hash-only visible response ref and then reopen CORE recovery with SRE-review actions. Provider-failure-after-mechanics now opens CORE `responseRetryRequired` before the fallback row is posted, stores the fallback old response/ingress as `responseRetryRequired`, retries only as a selected assistant swipe on the same response/outcome after REPAIR authorization, reuses an already-created retry swipe after CORE closure failure, and blocks stale/later-row targets. Terminal checkpoint replay now fails closed without REPAIR terminal-replay actuation, uses only explicit outcome-tied checkpoint sources, stores bounded replay evidence hashes, and preserves terminal resolution ingress/message ids through runtime app settlement routing. Scene Handshake prompt-sync failure now enters CORE/REPAIR turn-processing recovery without calling the old revision restore. Outcome rerun preview and committed outcome delete now fail closed without CORE checkpoint ref/artifact evidence before restore/preview. No-CORE tracked source mutations now fail closed before old ingress/response/recovery mutation, persistence, or prompt sync instead of writing a compatibility recovery row. The host-native post-visible source-review boundary now lives in `source-review-worker.mjs`; remaining rollback-like compatibility debt is base restore internals and any old recovery ledgers not yet pure projections. | Continue moving recovery choices into REPAIR until old recovery ledgers are pure projections. Next steps: move remaining base restore debt through REPAIR/SRE and keep response-dispatch contradiction state on CORE/REPAIR read projections. |
| Full Ashes certification | Current strongest five-user proof is bounded artifact `artifacts/live-soak/continuity-projection-matrix-five-user/2026-07-02T22-14-31-788Z/report.json` after `--resume`. It used `--turn-limit 3` across `directive-soak-a` through `directive-soak-e`, kept `default-user` out of soak proof, and returned `ok: true` / aggregate `warning`. It passed non-human lane selection, external-context readiness proof, host-native turn coverage, continuity prompt/source proof, external-context generation proof, persisted CORE generation-start timing, persisted CORE host-native completion, durable model-call failure policy, deterministic and model-assisted factual grounding, and model-assisted story-quality review. The first pass of the same run exposed one real host-native completion miss in `ashes-sidecars-timekeeping`; the resumed run reused four warning lanes and reran the failed lane to pass. Remaining warnings are bounded-depth only or certification-depth gaps: live-readiness warning, shallow fixture-depth evidence for ST-Lorebooks/VectFox at readiness, three-turn limit, and lower-than-full fact-check depth. | Do not treat this bounded five-lane proof as full certification. Before removing `--turn-limit`, run `preflight-continuity-matrix-full-certification.mjs --strict` and story-quality replay preflight, choose the external-context coverage standard, and ensure strict-mode warnings are expected or cleared. Full certification still requires 52 turns per lane, 52 pre-generation prompt snapshots per lane, 53 fact checks per lane, 265 total fact checks, all lane results pass without bounded-depth warnings, identity-matched model-assisted story review, strict release warnings cleared, model-call failures either zero or fallback-handled with durable lane-owned role/status/error-code/request-hash evidence, and full story-quality review pass. |
| Rich active external-context generation pressure | Strict readiness now proves all five non-human soak profiles can be prepared, activated in-browser, and reach `fixtureDepth: pass`, and the deterministic coordinator gate now rejects shallow generation evidence for rich fixture users. The full Ashes coordinator has not yet run unbounded against those prepared profiles, so no full-depth lane artifact proves generation-time prompt/retrieval/visibility pressure across 52 turns. | Run the unbounded five-user coordinator after prepared-fixture readiness passes, retain `external-context-fixture-depth: pass`, require pre-generation prompt snapshots for the full depth, and prove generation-time external prompt/retrieval diagnostics remain redacted and correctly attributed while all lanes complete. The preferred release standard is now `all-lanes`: every non-human lane must appear in `fixtureDepth.fullFixtureUserHandles`. `single-rich-lane` remains a labeled limited-evidence fallback only. In either mode, fixture handles must match configured non-human soak lane handles; `default-user`, stale profile names, and unknown handles fail the certification preflight. |
| Full story-quality proof | Bounded proof scored only a few visible messages per lane. The full-depth audit found model-assisted story review was not release-ready: several lanes had `not-run` review status despite provider success, one lane timed out `storyQualityReviewer` after 60 seconds, and one deterministic story score warned below the release-candidate minimum. The coordinator now emits `story-quality-model-review`, reads both flat and nested lane report shapes, treats missing/`not-run`/unparseable/timeout evidence as non-certifying, and fails unbounded certification unless every lane has parseable `pass` model-assisted story-quality review. `tools/scripts/replay-story-quality-review-preflight.mjs` can replay existing request artifacts through the review-only smoke path or dry-run-assess result files before a multi-hour run, and now rejects stale or fabricated results whose kind/schema, request id, input hash, reviewer role, model-call success, score counts, score/message ids, score/message indexes, or transcript coverage do not match the request. | Run replay preflight in strict mode against the latest bounded artifact and any single-lane rehearsal artifact before starting full five-user Ashes. Full-depth live run must score full transcripts for agency, continuity, prose naturalness, and campaign-specific tone; release strict mode should require identity-matched parseable model-assisted review with `pass` status, and never accept `not-run`, timeout, missing result, unparseable provider output, stale result hashes, wrong reviewer roles, missing model calls, duplicate/unknown/missing score refs, partial transcript coverage, or zero-score fabricated passes as certification evidence. |

### Full-Depth Certification Preflight

Run these before any unbounded five-user Ashes certification attempt. The purpose is to fail in minutes, not after a multi-hour live run.

| Preflight | Owner | Required result |
| --- | --- | --- |
| Aggregate full-certification preflight | QA/Live agent | Run `node tools\scripts\preflight-continuity-matrix-full-certification.mjs --artifact-root <artifact-root> --strict --coverage-standard <single-rich-lane\|all-lanes>` against the latest coordinator artifact before removing `--turn-limit`; add `--write-artifacts` to persist `full-certification-preflight.json`. Required result for release readiness: aggregate report status pass, no non-passing aggregate checks, every lane report status pass, every lane check pass, any `live-smoke-52-turn-delegation` check pass, five lane ids present, each lane id bound to its configured non-human soak user, no `default-user`, no swapped/stale/unknown user handles, no turn limit, no strict-blocking warnings, 52 prompt snapshots per lane, 53 fact checks per lane, story-quality release proof, external-context generation depth, validated `host-extensions/external-context-summary.json` / `externalContextSummary` artifact content for every lane, explicit external-context coverage standard, factual-grounding pass, model-assisted factual review pass, persisted CORE generation-start timing, persisted CORE host-native completion with exact required-turn binding, and model-call policy pass. Strict mode fails if `--coverage-standard` is omitted, and the CLI exits nonzero for both `fail` and `warning` reports. Factual grounding must include deterministic fact-check pass plus identity-matched `fact-checks/model-assisted-review/request.json` and `result.json` with `result.status: "pass"`, matching request id/input hash/package refs, `modelCall.roleId: "factualGroundingReviewer"`, successful model call, zero contradicted/omitted/unsupported-detail/P1/P2 counts, no timeout, no missing result, and no unparseable provider-output reason. The external-context coverage standard must be one of `single-rich-lane` or `all-lanes`; unknown standards fail closed, `single-rich-lane` requires at least one configured non-human lane handle in `fixtureDepth.fullFixtureUserHandles`, and `all-lanes` requires every non-human lane user there. Any `fullFixtureUserHandles` entry outside the configured lane set, including `default-user`, fails the gate. Failed model calls are acceptable only as resolved details when durable lane evidence at `modelCallPolicy.failurePolicyEvidence` includes role id, status, sanitized error code, request hash, known authority fallback, and no release-blocking role policy. Missing durable lane policy evidence, count-only failures, count-only host-native completion proof, unknown roles, missing request hashes, release-blocking `fail-closed`, and `fail-retryable` role failures block the gate; the explicit exception is `sourceSettlementLatestPair` when it fails closed without state authority, prompt authority, prose authority, or applied operations. A bounded artifact should fail this gate by design. |
| Story-quality review replay | QA/Live agent | Run `node tools\scripts\replay-story-quality-review-preflight.mjs --artifact-root <artifact-root> --strict` to replay existing `quality-review/model-assisted-review/request.json` artifacts through the review-only path, or add `--dry-run` to assess existing result files only. Required result: every lane has identity-matched parseable `pass`, no `not-run`, no missing result, no stale input hash/request id, no missing or wrong-role model call, no zero-score fabricated pass, no duplicate/unknown/missing score refs, no partial transcript coverage, no unparseable provider output, and no `storyQualityReviewer` timeout at the certification budget. |
| Architecture Redesign release bundle | QA/Live agent | After the strict Continuity Matrix full-certification preflight passes, run `node tools\scripts\preflight-architecture-redesign-release-bundle.mjs --manifest <bundle-manifest> --strict --write-artifacts`. Required result: strict Continuity Matrix `full-certification-preflight.json` pass, Command Bearing closure report pass, Command Bearing point lifecycle report pass, catastrophic terminal endings report pass, command-fitness terminal endings report pass, message mutation discovery pass, and message mutation actuation proof pass. Build the mutation proof with `node tools\scripts\run-sillytavern-message-mutation-actuation-live.mjs --live --write-artifacts` using non-human soak-user targets, or use `preflight-sillytavern-message-mutation-actuation.mjs --manifest <mutation-manifest> --strict --write-artifacts` only when the source-edit, source-delete, assistant-edit, assistant-delete, and selected-swipe child reports already exist. The five-user chat soak alone is not full Architecture Redesign certification; discovery-only message mutation evidence is also not enough because source/assistant edit/delete must be proven through live host controls and selected-swipe source truth must be proven without `default-user`. |
| Message-mutation actuation producer | REPAIR/SRE worker with QA/Live agent | Use `tools/scripts/run-sillytavern-message-mutation-actuation-live.mjs` as the focused live proof producer for `directive.sillytavernMessageMutation.actuationProof.v1`. It composes `run-sillytavern-message-edit-live.mjs` for source/assistant edit, `run-sillytavern-message-delete-live.mjs` for source/assistant delete, and `run-sillytavern-selected-swipe-actuation-live.mjs` for native selected-swipe actuation, while enforcing non-`default-user` execution, configured soak-user membership when provided, strict pass/fail, numeric distinct targets, and delete-safe target ordering before any chat mutation. Do not count `run-sillytavern-message-action-live.mjs` as mutation actuation; it is optional reconciliation pressure only. Required result: source edit/delete and assistant edit/delete pass with native host-control evidence and compact `directive.sourceMutationProof.v1` REPAIR/CORE refs; selected-swipe passes with compact `directive.sourceIntegrityProof.v1`, `actuationMode: "native-host-swipe-control"`, `nativeHostControlMoved: true`, served-extension freshness, and non-`default-user` execution. Setup-assisted selected-swipe native actuation passed at `artifacts/live-smoke/selected-swipe-actuation/2026-07-02T23-41-07-914Z/selected-swipe-actuation-report.json`; natural real-turn latest-response native actuation passed at `artifacts/live-smoke/selected-swipe-actuation/2026-07-03T00-11-15-605Z/selected-swipe-actuation-report.json`. Remaining work is source/assistant edit/delete actuation and strict producer assembly. All child artifacts must use redacted hashes/lengths instead of raw replacement, prompt, stdout, or provider text, prove served-extension freshness, use a non-human SillyTavern user, and report `defaultUserTouched: false`. |
| Strict-mode dry assessment | QA/Live agent | Evaluate the latest bounded lane reports under strict-mode semantics and list every warning that would become a failure. Non-depth warnings must be fixed or explicitly scoped out before the full run. |
| Unbounded artifact budget | QA/Live agent | Compute expected full-depth artifact counts without live generation: 52 generation prompt snapshots per lane, 53 fact checks per lane, 265 fact checks total, transcript-level review, model-assisted review, readable transcript, live log, and report/summary artifacts. |
| Coordinator release gates | Agent-0 with QA | Add or confirm aggregate checks for model-assisted story review status, quality-review parseability, all expected prompt snapshots, all expected fact checks, full lane artifact completeness, and strict lane status. |
| External-context coverage standard | Agent-0 | Choose `single-rich-lane` or `all-lanes` before release certification. `single-rich-lane` is limited coverage: at least one configured non-human lane profile has rich active ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox fixture pressure, while other lanes still need observability and generation-proof attribution. `all-lanes` is the stronger standard: every non-human lane user must be listed in `fixtureDepth.fullFixtureUserHandles`. The full-certification preflight rejects unknown coverage-standard names and any fixture handle outside the lane set, so an accidental label, stale profile, or `default-user` fixture cannot pass as policy. |
| Model-call failure policy | Agent-0 with QA | The lane producer owns this evidence. `soak-sillytavern-campaign-live.mjs` writes `modelCallPolicy.failurePolicyEvidence` and emits `live-model-call-failure-policy`; `run-continuity-matrix-five-user-soak.mjs` carries `.lanes[].modelCallFailurePolicy` and emits aggregate `model-call-failure-policy`; full-certification preflight consumes the lane-owned evidence first. Inspect failed model-call roles and redacted per-call evidence from retained smoke model-call records only to populate or diagnose that durable policy object, not as a substitute for it. Release policy must distinguish authoritative failed calls from fallback-handled advisory/utility failures through the model-call authority matrix. Full-certification preflight fails missing durable lane evidence, count-only evidence, unknown roles, missing status/error code/request hash, unknown fallback policy, release-blocking `fail-closed`, and `fail-retryable` failures. It reports fallback-handled calls as pass-level details only when the owning gates passed and no state/prompt/prose authority was lost; `sourceSettlementLatestPair` timeout is the current explicit no-mutation fail-closed exception and must remain bounded by the SRE/latest-pair owner tests. |
| Single-lane strict live rehearsal | QA/Live agent | Run one mid-depth or unbounded single-lane strict rehearsal, preferably the factual lane first because it previously hit the story-quality reviewer timeout. Do not scale to five lanes until this lane is clean. |

Do not treat the bounded turn-3 artifact as proof that these release gates are ready. It records terminal host-native completion and persisted generation-start timing at bounded depth, but the host-native completion artifact contract still needs exact required-turn binding before release certification. It also does not prove full story-quality review, 53 fact checks per lane, strict-mode cleanliness, full external-context pressure, or per-call failed-model-call release evidence.

### Agent Findings To Preserve

The June 28, 2026 runtime/storage agents agreed on the following bridge shape:

- `CampaignStartController` needs a controller-level `persistRuntimeCampaignState(...)` method that loads the existing v1 checkpoint, calls the v2 active-save facade, updates active controller ids/state, and returns the v2 persist result.
- Only queued runtime persistence should call that method during the bridge. Public/manual `saveCurrentGame()` and `saveCurrentGameAs()` continue to call the v1 save paths and return v1 `directive.campaignSave` payloads.
- `autosaveStableTurn()` should not be swept into this bridge without a separate autosave design. The autosave lane currently has distinct v1 record/pruning semantics.
- The v2 facade return shape should include `kind: "directive.activeCampaignStatePersist.v2"`, `storageFormat: "v2"`, `campaignId`, `saveId`, `updatedAt`, `wroteV1Payload: false`, `saveManifestRef`, `campaignManifestRef`, artifact `refs`, and a `saveIndexEntry` that preserves the existing v1 `path` while adding `runtimeStorageFormat: "v2"`, `v2RuntimePersistedAt`, and `v2ManifestRef`.
- Tests must assert that v2 runtime persistence does not write `campaignSaveLogicalKey(saveId)`, writes v2 manifests before index update, preserves the v1 save-index path, sets `runtimeStorageFormat: "v2"`, and attaches both `v2RuntimePersistedAt` and `v2ManifestRef`.
- Controller tests must prove v1 payload/revision preservation during queued runtime v2 persist, then prove later normal manual Save preserves v2 authority and Save As creates a v2 manifest-owned branch without a v1 payload. State Safety remains the explicit force-checkpoint action.
- Chat-native flow tests must keep manual Save/Save As v2 descriptor assertions after runtime takeover and must not claim model-call sequence continuity through the compact v2 head until projections or rehydration exist.
- Queued runtime persistence must be save-bound and non-navigating. It persists the save id from `campaignChatBinding.saveId`; public load/open/Save Game As flows, not background runtime writes, own controller active-save identity.
- The current compact v2 head intentionally omits raw runtime journals. That is good for scale, and runtime bridge load now rehydrates compact `runtimeTracking`, `turnLedger`, model-call, sidecar/background, and prompt-cache resume projections from v2 event/turn/diagnostics/prompt-cache artifacts instead of defaulting to the stale v1 checkpoint when the bridge ref is valid. It is still not a full final resume source until required presentation replay projections are complete.
- The first production CORE migration seam should be ingress, not diagnostics. Diagnostics need a stable transaction id, so `beginTurn(sourceFrame)` must exist before model-call, sidecar, recovery, or response diagnostics can be safely attached.
- `chat-turn-orchestrator.createIngress(...)` is the correct low-disruption production Frame seam because dedupe has resolved the authoritative host message identity and active campaign/save/chat context is available there. `runtime-bridge.mjs` and `chat-adapter.mjs` are too early to own campaign/source provenance.
- CORE `beginTurn` should run before the old ingress projection during the bridge. If CORE begin fails, the runtime must not persist an old-ledger-only ingress as if the new durable writer had accepted the source.
- The production hostContinue release split must keep provider completion outside generation-start latency. Nonblocking `continueHostGeneration` records `hostGenerationReleasedAt`, and the first post-release bridge now observes host-native completion/failure later with hash-only assistant refs. Contradiction review and user-facing failure policy still need to move into CORE/REPAIR/SRE instead of returning to synchronous observed-message review.
- If host generation has already been released and CORE cannot record `hostContinueReleased`, Directive must still preserve release evidence in the old response ledger and open typed recovery. This is a bridge failure state, not a silent success.
- Directive-posted responses now bridge CORE visible-response state. A specific `responseRetryRequired` phase lets response post failures and provider-failure-after-mechanics cases attach retryable recovery to the same transaction and later record one visible response without making generic `recoveryRequired` reopenable. Host-native failed/unavailable recovery can now close from delayed reobserve only through REPAIR's response-reobserve closure decision, which writes a hash-only CORE visible response and resolved recovery projection. Broader response-state ownership is still incomplete until generic response retry actuation, response edits, host-native contradiction/review policy, and generic recovery flows are owned by CORE/REPAIR projections.
- Production chat-native mechanics checkpoints now bridge into CORE before narration: `turn-commit-coordinator.mjs` records compact domain-hash operation bundles through `commitMechanics(...)`, records validated redacted `directive.openWorldReducerBundle.v1` source evidence when present, avoids duplicate broad domain commits for reducer-owned roots, passes `baseMechanicsRevision`, `response-dispatcher.mjs` tolerates the intended `mechanicsPending -> visibleResponsePosted` ordering, and `test-chat-native-runtime-flow.mjs` proves persisted CORE turn-ledger projections survive reload without raw transcript text, raw narration, snapshots, `runtimeTracking`, or `rootsSet`.
- Model-call diagnostics now bridge only the active in-progress ingress transaction and remain best-effort. The Command Log summary bridge, Narrative Thread settlement bridge, and regular campaign sidecar scheduler now use explicit committed-turn context rather than `activeIngressId`: Command Log and Narrative Thread queued/failure/stale states use CORE diagnostics, successful specialized settlements use sanitized CORE background effect batches, and accepted regular sidecars use CORE background batches for aggregate state operations.
- Synthetic FORGE already demonstrates the target batch semantics, including one CORE `backgroundBatchCommitted` event per FORGE run, one FORGE diagnostic, one LENS background flush, and no raw worker prompt/response storage for diagnostics-only no-change work.
- The first production FORGE slice is now implemented for regular campaign sidecars: `runtimeCoreTurnStore.commitBackgroundBatch(...)` is exposed to `createCampaignSidecarScheduler`; accepted sidecar operations are aggregated into a non-mutating compatibility projection preview; cross-worker path conflicts reject the affected batch before mutation; accepted regular sidecars now use one FORGE-owned CORE background batch settlement, no ordinary v1 root assignment/persistence, and one FORGE/LENS prompt flush from live/filtered state plus compact CORE accepted-batch evidence.
- The June 29 sidecar latency/rejection audit refined that slice: FORGE should guard source freshness through the source Frame, not reject valid background effects merely because unrelated background or later-turn work advanced the global runtime revision. The scheduler now rebases over monotonic unrelated revision drift only after source-ingress freshness still passes, keeps non-monotonic revision drift fail-closed, compacts sidecar proposals, and gives likely-truncated JSON one strict repair attempt before the existing invalid-proposal rejection path. The latest bounded live proof (`2026-06-29T14-32-56-379Z`) ended with 0 rejected sidecars, while `test-campaign-sidecar-scheduler.mjs` proves unrepaired invalid JSON still rejects without mutation.
- The Command Log bridge now keeps the summarizer specialized because it is presentation-only and `mayProposeState: false`, but it shares FORGE/CORE settlement semantics on success: zero mechanics operations, one `commandLogSummary` worker ref, source refs, input-signature hash, assisted-summary hash, and no raw assisted-summary text.
- CORE Store now allows multiple background batches per transaction. This prevents specialized background systems from fighting over one `backgroundBatchCommitted` slot while preserving idempotent replay and duplicate batch-id rejection.
- The Narrative Thread bridge now keeps extraction specialized because it owns source extraction, thread-ledger, command-bearing review, and quest-promotion domain logic, but it shares FORGE/CORE settlement semantics on success: zero mechanics operations, one `narrativeThreadDirector` worker ref, source refs, pending-resolution provenance refs when applicable, input-signature hash, redacted changed-domain refs, and no raw player text, assistant text, prompts, scene delta, or provider output.
- The test closeout for this production bridge is `test-campaign-sidecar-scheduler.mjs`, `test-background-projection-batch.mjs`, `test-core-store-v2.mjs`, `test-chat-native-runtime-flow.mjs`, `test-chat-turn-orchestrator.mjs`, `test-command-log-summary-sidecar.mjs`, `test-narrative-thread-director.mjs`, and `test-runtime-host-injection.mjs`. The expected evidence is one non-mutating compatibility projection validation for accepted regular sidecars, one CORE background commit when a transaction id is present, no ordinary v1 root projection writes, one prompt sync/flush from live/filtered state plus compact CORE accepted-batch evidence, conflict detection before mutation, idempotent/stale background behavior, Command Log summary remaining post-visible-response while settling successful summaries through CORE background effects, Narrative Thread extraction remaining post-visible-response for normal and non-terminal pending committed turns, cancel/revise paths not scheduling extraction, and stale source guards preventing provider/apply work when possible.
- CORE Store must not write the active-save facade's default v2 layout during the bridge. The resolved bridge gives CORE a save-scoped `core` namespace while active-save remains the save-index and runtime-resume layout owner.
- External prompt environment at the fast gate must be cached or bounded. Deep ST Lorebooks/Memory Books/Summaryception/VectFox inspection belongs to LENS/readiness probes and must not block hostContinue release; Frame may carry an unknown or cached compact ref.
- The counsel/advisory audit found another foreground provider wait: `handleCounsel` awaited `missionDirectorAdvisor`, committed the advisory record, and ran prompt sync before `injectAndContinue` reached the response dispatcher. The bridge now uses a deterministic fallback advisory shell first, host generation release next, and provider-backed advisory enrichment later through FORGE/CORE with stale-source checks before provider and before apply.
- Advisory enrichment now has an explicit post-release diagnostic target. Delayed `missionDirectorAdvisor` model-call diagnostics attach to the originating CORE transaction by event metadata after the ingress has advanced beyond `classified`, while CORE diagnostics store only ids and hashes.
- Terminal checkpoint settlement must not use `recordVisibleResponse` for the checkpoint prompt. The committed terminal narration remains the transaction's single CORE visible response; checkpoint posts and checkpoint replies settle through sanitized zero-operation CORE background/control batches with ids/hashes only.
- The June 29 REPAIR/SRE audit confirmed that edit/delete recovery is still primarily owned by `MessageReconciler`, `state-delta-gateway`, old `runtimeTracking.ingressLedger`, old `responseLedger`, old `recoveryJournal`, and turn-ledger snapshot flows. The current dependent-edit guard stops the Sam Vickers cycle, but it does not make REPAIR the owner.
- The first REPAIR production bridge now has an explicit runtime boundary: `repair-runtime.mjs` records source-mutation recovery decisions and CORE-first recovery cases before `MessageReconciler` mirrors them into old projections and prompt sync. `runtimeCoreTurnStore` exposes `markRecoveryRequired`; CORE-backed no-outcome player-source edits/deletes, committed player-source edits, committed Directive response edits, and committed Directive response deletes have fake-host runtime proof; CORE recovery conflicts fail closed before old-ledger mutation; CORE exposes compact `repairDecision` projections with `legacyProjection`; and CORE strips literal raw `replacementText` even if a future caller passes it. REPAIR now drives the old projection outcome for source-mutation edit/delete paths, latest/no-outcome source restart decisions, and tracked-revision rollback actuation authorization; `chat-turn-orchestrator` actuates those restart decisions as distinct replacement ingress/source Frame/CORE transaction ids while preserving the old recovery as resolved audit evidence. No-CORE tracked source mutation now blocks instead of falling back to old recovery rows. Remaining bridge work is broader rollback execution, visibility-only production behavior behind REPAIR, source restart store-native linked CORE event/API completion, and old recovery ledger projection demotion.
- CORE recovery projections need to expose enough detail for product review: source mutation kind, source kind, host/ingress/response/outcome refs, dependent outcome/response refs, source Frame ref, replacement-text hash/presence, pre-outcome revision, auto-rollback flag, and allowed actions. They must not expose raw replacement text.
- The June 29 response-lifecycle audit confirmed that CORE already models `hostContinueReleased`, `visibleResponsePosted`, `responseRetryRequired`, and `recoveryRequired`. The first production bridge now adds a nonblocking host completion callback: release host generation immediately, wait until the release projection is persisted, then observe completion/failure later and write exactly one CORE `recordVisibleResponse(...)` or generic recovery projection with hash-only host refs.
- The host-native completion bridge deliberately does not retry host generation, store raw assistant text, or require contradiction review inside the release call. Deterministic fake-host tests prove the callback and duplicate-idempotency behavior. If a host adapter provides a synchronous contradictory assistant row, the dispatcher asks REPAIR for `hostNativeContinuityContradiction`, writes CORE `recoveryRequired`, uses bridge-only old response markers, and redacts the observed assistant text from host-continuation refs. If a delayed callback or manual `reobserveHostGenerationCompletions(...)` later sees contradictory host-native text, the dispatcher records the hash-only visible response first, then asks REPAIR/SRE policy for contradiction recovery so the CORE transaction keeps `visibleResponseRef` evidence while moving to `recoveryRequired`. Live SillyTavern certification remains open; the independent SRE source-review worker boundary and CORE-owned contradiction projection demotion are focused-test proven.
- The live-proof audit found that older bounded artifacts did not contain host-native callback fields. The June 29 bounded five-user Ashes run now certifies the required turn-3 terminal SillyTavern assistant rows from persisted CORE response projections for the bounded depth. The remaining certification gap is full-depth coverage, not the turn-3 host-native proof path.
- The SRE/REPAIR policy audit separated persistence from judgment: CORE can record the terminal hash-only assistant ref, SRE-style post-visible review can reopen contradiction recovery without deleting the visible evidence, and REPAIR must own failed/unavailable/retry/reobserve decisions. `unavailable` should remain distinct from host-generation failure so diagnostics do not turn missing host evidence into a false failed generation.
- The first backend policy slice now makes that distinction concrete in `response-dispatcher.mjs`: a callback with no observable assistant row records `hostNativeAssistantUnavailable` with reobserve-first actions and response status `unavailable`, true callback `failed` records CORE `responseRetryRequired` with retry/reobserve/fallback actions, and synchronous or delayed contradictory host-native assistant rows record `hostNativeContinuityContradiction` with SRE-review/fallback/branch actions. A later successful host-native observation or delayed `reobserveHostGenerationCompletions(...)` may close failed/unavailable recovery only through REPAIR's response-reobserve closure decision; generic `recoveryRequired` remains blocked from visible-response posting. CORE-backed unavailable/failed observations no longer write old recovery-journal rows, and reobserve closure reads CORE recovery projections when old rows are absent. A delayed contradiction is not treated as completion: tests prove the visible response hash is retained, the old response projection moves to `recoveryRequired`, and no raw assistant prose is stored in CORE or response ledgers.
- The story-quality/live-certification audit found the next certification blocker: the existing review-only smoke path is usable, but full-depth certification must have a coordinator aggregate gate plus replay preflight so `not-run`, timeout, missing result, unparseable model-assisted story-quality results, stale identities, wrong reviewer roles, missing model-call proof, score-count mismatch, duplicate/unknown score refs, and partial transcript coverage cannot be mistaken for pass/warning evidence. That slice is now implemented through `story-quality-model-review` and `tools/scripts/replay-story-quality-review-preflight.mjs`; full-run readiness is guarded by `tools/scripts/preflight-continuity-matrix-full-certification.mjs`, and strict dry-run assessment of bounded artifacts fails as expected.
- The REPAIR/SRE audit's next backend ownership slice is now started in production code: `repair-runtime.mjs` owns source-mutation recovery case construction, allowed actions, CORE-first recovery writes, idempotent replay through CORE idempotency keys, compact repair-decision projection, old-projection outcome decisions for committed player/Directive response mutations, latest/dependent source-reobserve policy, source-mutation rollback actuation authorization, response-recovery policy for host-native unavailable/failed/continuity-contradiction cases, and response-reobserve closure authorization for host-native failed/unavailable rows. `chat-turn-orchestrator` now acts on latest/no-outcome restart decisions with a fresh replacement CORE transaction, store-native `latestSourceRestarted` supersede link, and idempotent duplicate handling; `MessageReconciler` is now a temporary old-ledger/prompt-sync projection adapter for source mutation, `response-dispatcher` remains the temporary host-observation bridge for synchronous contradiction, delayed post-visible contradiction settlement, and authorized reobserve closure, and `source-review-worker.mjs` owns the independent host-native SRE review call/reuse boundary. The remaining REPAIR/SRE slice is base-restore ownership, broader rollback execution ownership, and old recovery ledger projection demotion.

### Next Implementation Order

1. Freeze current micro-first work into status. Generic committed-response retry actuation, storage bridge details, proof-pipeline refinements, and narrow focused-test failures remain useful, but they do not drive the next slice unless they block the primary vertical path or would create authority in the wrong system.
2. Finish the named macro owners as real implementation surfaces. Frame, LENS, SRE, CORE, REPAIR, and FORGE each need importable runtime boundaries, compact event/decision shapes, documented ownership rules, and enough production wiring to be the obvious destination for new work.
3. Wire the primary vertical player-turn path through those owners before polishing local seams. One realistic player message should flow through source observation, Frame creation, CORE transaction, route decision, response release/post, REPAIR/SRE recovery hooks, FORGE background scheduling, LENS prompt scheduling, and persistence with old ledgers acting only as bridge projections where still required.
4. Collapse duplicate background, prompt, recovery, timing, and persistence flows after the vertical path is coherent. Command Log, Narrative Thread, advisory enrichment, terminal checkpoint settlement, and regular sidecars should share FORGE/CORE settlement semantics; prompt rebuilds should go through LENS dirty-domain scheduling instead of each worker forcing its own save/prompt cycle.
5. Consolidate persistence and scale ownership. Preserve v2 layout bridge ownership, stop hot-path v1 full-save rewrites for runtime-current state, keep manual Save/Save As checkpoint semantics explicit, and prove the 5000-message budget against both CORE segments and the materialized/resume head.
6. Expand REPAIR/SRE ownership after the macro owners are wired. Generalize edit/delete/retry/rerun/rollback, selected-swipe settlement, dependent-source handling, visibility-only extension churn, stale Summaryception/Memory Books ranges, and host-native contradiction review behind the named owners.
7. Convert the deferred micro backlog into focused hardening passes. Each backlog item must name the final owner, current bridge behavior, why it was safe to defer, and the gate that now requires it.
8. Run verification as phase gates, not after every small edit. Macro slices get syntax, contract-shape, and gross-path checks. Integrated system slices get focused deterministic suites. Only after the major systems are wired do we run broad focused suites, alpha gate, scale proof, and full-depth five-user live SillyTavern Ashes certification with non-human soak users only.

Immediate slice selection should use this priority order:

1. Missing macro owner on the player-turn vertical path.
2. Duplicate hot-path save, prompt, sidecar, or recovery work that prevents the vertical path from having one owner.
3. Storage/runtime work needed to stop full hot-save rewrites and make 5000-message scale proof meaningful.
4. Focused deterministic failure that invalidates the current macro owner.
5. Local edge behavior, visual polish, proof-pipeline refinement, or exhaustive compatibility detail.

The fifth category is real work, but it belongs to integration or micro hardening. It should not displace macro owner wiring unless the State Board marks it as a blocker.

Known storage-cutover bridge items to schedule inside the macro/integration passes:

- Public `saveCurrentGame(...)`, `saveCurrentGameAs(...)`, and `autosaveStableTurn(...)` now preserve or create v2 manifest authority after runtime bridge takeover instead of rewriting v1 payloads. State Safety remains the explicit v1 checkpoint path.
- Runtime/settings persistence is now migrated first: `updateRuntimeHistoryLimit(...)` and `updateRuntimeSettings(...)` persist through `persistRuntimeCampaignState(...)` instead of `controller.saveCurrentGame(...)`.
- `settleActiveState(...)` remains a user-invoked State Safety checkpoint until product language changes; it may stay as an explicit checkpoint action even after normal Save/Save As move to v2-owned authority.
- Focused proof now shows runtime/settings updates preserve the existing v1 payload bytes, attach `runtimeStorageFormat: "v2"`, `v2RuntimePersistedAt`, and `v2ManifestRef` to the save-index entry, update the compact v2 active head, verify the save-index runtime bridge ref hash before load, fail pure v2 loads closed on materialized-head hash mismatch, and fall runtime-bridge corrupt/missing manifest/head/event cases back only to the explicit v1 checkpoint. Manual Save preserves v2 authority, Save As creates a v2-owned save entry, autosave creates/prunes v2-owned autosave manifests without moving the active save, manifest-owned v2 reload sees hot appended event/turn evidence, and Shell proof still covers Settle Active State as a v1 checkpoint action.
- The production reload freshness blocker for manifest-owned v2 saves is closed at focused-test level. `test-storage-scale-5000.mjs` now registers the v2 save through the repository index, appends a hot player/assistant turn through `commitV2EventTurnSegments(...)`, and proves both `loadCampaignSaveFromStorage(...)` and `recoverActiveCampaignSave(...)` see that current-tail evidence without relying on stale save-index `manifestRef` hashes or reading/verifying sealed history.
- The next Wave 1 macro blockers are full runtime resume semantics, broader durable turn lifecycle ownership in CORE Store, and any remaining response/recovery/background paths that still use old ledgers as more than compatibility projections. First-turn `beginTurn(...)` CORE/v2 bootstrap, source-frame scope validation, hot `beginTurn(...)` append, response recovery duplicate replay, and CORE-projection freshness arbitration are now focused-test covered and should stay in regression. Required focused regression tests for the next bridge slice are `test-current-chat-campaign-scope.mjs`, `test-chat-native-runtime-flow.mjs`, `test-runtime-campaign-start-controller.mjs`, `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-response-dispatcher-core-bridge.mjs`, `test-core-store-v2.mjs`, and `test-storage-scale-5000.mjs`; run `run-alpha-gate.mjs` only after the next meaningful runtime/storage integration pass.

## Stage 0: Baseline And Control Board

Goal: lock the starting point so the redesign is measured against known behavior.

Owner: Agent-0, optional QA worker.

Tasks:

- Inspect `git status --short`.
- Record current uncommitted files and which are user/Agent-0 owned.
- Choose the current pass: macro independent build, macro vertical wiring, integration window, or micro hardening.
- Decide the target worker count for the pass and assign lanes before Agent-0 starts serial implementation work.
- Run focused docs checks if docs are dirty.
- Run lightweight baseline checks for already-modified runtime/storage files only when they clarify current ownership, known failures, or merge risk.
- Record known red focused suites in the deferred micro queue instead of blocking the macro pass, unless the failure invalidates the primary vertical turn path.
- Record every known red as `macro blocker`, `integration backlog`, `micro backlog`, or `out of scope`.
- Identify remaining bridge code and the stage that should remove each bridge.
- Record the last known alpha-gate status if available. Rerun `node tools\scripts\run-alpha-gate.mjs` at integration or micro gates, not before every macro slice.
- Record whether local SillyTavern is available and which non-human soak user should be used for later live proof.
- Open an Architecture Redesign Board in the primary thread.

Exit gate:

- Current baseline is known.
- Shared files are assigned to Agent-0 or frozen.
- Macro blockers are separated from deferred micro issues.
- Agent utilization is set for the pass: parallel workers for independent build, reduced concurrency for shared-file integration.
- Known red tests/artifacts and bridge-removal targets are visible on the board.
- No worker starts coding without a lane, allowed file list, and expected handoff.

Do not delegate:

- final baseline interpretation;
- current dirty-worktree ownership;
- live-host credential/user decisions.

## Macro-First Implementation Cadence

The redesign should not be executed as a long sequence of tiny seam fixes. The old system is already over-composed, and early live evidence showed time loss from repeated saving, sidecar work, review loops, and partially overlapping recovery systems. The implementation order must therefore make the new architecture real at system scale before polishing every local boundary.

This does not mean ignoring correctness. It means the inner loop changes:

1. Build or finish the major owner.
2. Wire that owner into the real vertical runtime path.
3. Run only the checks needed to catch syntax errors, broken contracts, data-loss risk, and wrong-owner authority while the macro shape is incomplete.
4. Defer local edge hardening to the named integration or micro gate, with owner and catch-gate recorded.
5. Run broad deterministic, scale, and live proof only when the connected system is ready to be judged as a system.

Execution order:

| Pass | Primary question | Main output | Verification level |
| --- | --- | --- | --- |
| Macro | Do the named systems exist and own the right work? | Importable CORE, Frame, SRE, REPAIR, FORGE, and LENS boundaries plus one primary vertical turn path. | Syntax checks, contract-shape tests, and one gross-path smoke for newly connected paths. |
| Integration | Does the real runtime use those systems coherently? | Old ledgers behind projections, one visible-response authority, one background settlement path, one prompt scheduling path, and v2 runtime persistence on the hot path. | Focused deterministic suites for the touched systems and targeted regression tests for known blockers. |
| Micro | Are edge cases, recovery policies, and release gates hard enough? | Retry/rerun/rollback detail, selected-swipe/range settlement detail, external-context edge fixtures, scale proof, and full live certification. | Full focused suites, alpha gate, 5000-message scale gate, and five-user live SillyTavern Ashes certification. |

### Macro Pass

Goal: create the durable shape of the new runtime.

Tasks:

- Add or consolidate the first real modules/contracts for Frame, LENS, SRE, CORE, REPAIR, and FORGE.
- Wire one primary player-turn vertical slice across source observation, Frame creation, CORE transaction, route decision, visible response, REPAIR/SRE recovery hooks, FORGE background settlement, LENS prompt scheduling, and persistence.
- Prefer explicit temporary adapters over deep local rewrites when old code still owns a surface.
- Preserve enough old projections for the UI/runtime bridge, but do not design new work around old ledgers as authority.
- Use agents by system boundary: Frame/LENS, SRE/REPAIR, CORE storage/runtime, FORGE/generation, and QA/live proof.
- Keep a short deferred micro list for focused failures and local edge cases discovered during the pass. Each entry needs the final owner, why it is safe to defer, and the phase gate that must catch it.
- Ask every worker handoff to classify findings as `macro blocker`, `integration backlog`, or `micro backlog`. Agent-0 should only interrupt the macro slice for blockers that stop the vertical turn path, risk data loss, or create authority in the wrong system.

Allowed rough edges during the macro pass:

- Some old ledgers may remain as projections.
- Some adapters may be one-way or diagnostic-only.
- Some test fixtures may assert only contract shape and gross end-to-end behavior.
- Some local recovery cases may be deferred if the new authority boundary is correct and the deferred gap is documented.

Disallowed shortcuts:

- Do not preserve a local seam that contradicts the target owner. For example, a new retry path cannot rerun mechanics, a new prompt path cannot clear non-Directive prompt keys, and a new background path cannot mutate state outside CORE/FORGE.
- Do not add new hot-save full rewrites as a bridge.
- Do not create extension-specific authority stores for ST Lorebooks, Memory Books, Summaryception, VectFox, or unknown tools.

### Integration Pass

Goal: make the macro shape coherent across the real runtime.

Tasks:

- Replace temporary adapters with shared APIs where two or more systems consume the same concept.
- Collapse duplicate source, prompt, recovery, background, and timing records into the named owners.
- Move old-ledger writes behind projection adapters.
- Ensure the primary turn path has one source Frame, one CORE transaction, one visible-response authority, one background apply path, and one prompt revision decision.
- Pull forward deferred issues only when the owning system is now wired enough to fix them in the right place.
- Update docs and diagrams to match actual code, not transitional intent.

### Micro Pass

Goal: harden edge behavior after the major architecture exists.

Tasks:

- Finish narrow REPAIR retry/reobserve/rerun/rollback cases.
- Tighten SRE settlement modes for selected swipes, dependent edits, hidden/ghosted rows, Summaryception ranges, Memory Books ranges, and vector/prompt ghosting.
- Replace temporary projection bridges with store-native events where still needed.
- Expand contract tests into behavioral tests.
- Run the full deterministic gate, scale gate, and live SillyTavern certification only after the macro and integration passes are wired.

### Verification Cadence

During the macro pass, use lightweight checks:

- `node --check` for touched modules.
- Focused contract-shape tests for new modules.
- A small gross-path smoke when a vertical slice is first connected.

During the integration pass, use targeted deterministic suites for the systems being wired together. This is the point where a known focused regression should be fixed if it means the vertical path is incoherent or if it would invalidate the phase gate.

During the micro pass, run the exhaustive checks: broad focused suites, alpha gate, 5000-message scale proof, and five-user live Playwright proof. Do not spend large cycles chasing every existing focused test after each small edit while major systems are still missing. Full focused suites, alpha gate, 5000-message scale proof, and five-user live proof are phase gates, not the inner loop for every file change.

### Deferral Rule

A micro issue can be deferred only when all of these are true:

- The target owner and final behavior are documented.
- The current code does not create new authority in the wrong system.
- The issue does not block the primary vertical turn path.
- The issue is listed in the implementation status or stage exit gap.
- A later phase gate is named that will catch it.

## Stage 1: Contracts And Metrics

Goal: make the target measurable before runtime behavior changes.

Owner: Agent-0 or Contracts/Metrics worker.

Inputs:

- Frame schema from the proposal.
- CORE transaction fields and phases.
- SRE, REPAIR, FORGE, and LENS event contracts.
- Recall Index, prompt budget trace, witness-scoped fact, scene/phase seal, correction case, and candidate swipe contracts.
- Latency instrumentation fields in the proposal.

Tasks:

- Add schema/shape fixtures for Frame, range Frame, CORE transaction, event record, turn segment, diagnostics segment, manifest, materialized head, checkpoint, host map, and prompt cache.
- Add schema/shape fixtures for `ExternalContextProfile`, `ExternalPromptEnvironment`, and redacted external context diagnostics.
- Add schema/shape fixtures for `RecallIndexEntry`, `RecallQuery`, `RecallResult`, `LensPromptBudgetTrace`, witness-scoped continuity facts, `ScenePhaseSeal`, `CorrectionCase`, and candidate swipe provenance.
- Add schema/shape fixtures for structured package retrieval metadata and optional semantic candidate refs.
- Add test helpers for stable JSON byte counts.
- Add fake storage write counters for full-save rewrites, segment writes, head writes, manifest writes, and diagnostics writes.
- Add timing helpers for `playerSubmittedAt`, `turnObservedAt`, `routeDecidedAt`, `hostGenerationReleasedAt`, `directiveGenerationStartedAt`, `visibleResponsePostedAt`, and `backgroundSettledAt`.
- Add no-behavior-change tests proving the instrumentation helpers can report generation-start latency separately from provider completion.
- Add no-behavior-change host fixtures for native ST Lorebooks, Memory Books/STMB markers, Summaryception metadata/ghosting, and VectFox prompt/interceptor signals.

Suggested tests:

- `test-architecture-redesign-schemas.mjs`
- `test-external-context-browser-probe.mjs`
- `test-directive-recall-index-contracts.mjs`
- `test-lens-prompt-budget-lane-contracts.mjs`
- `test-witness-scoped-fact-contracts.mjs`
- `test-forge-scene-phase-seal.mjs`
- `test-correct-as-swipe-contracts.mjs`
- `test-turn-latency-metrics.mjs`
- `test-storage-write-counters.mjs`

Exit gate:

- Schema tests pass.
- Instrumentation can represent both `hostContinue` and `directiveCommit`.
- External context fixtures can represent installed-extension prompt and visibility state without storing raw external prompt bodies or secrets.
- Recall, budget trace, witness fact, scene seal, and correction-case fixtures prove refs/hashes/bounded previews only.
- No runtime hot path has been rewritten yet.

Agent use:

- One contracts worker can draft schemas and tests.
- Agent-0 integrates schemas and reserves names.

First implementation slice:

- Add runtime schemas for Frame, CORE transaction, external prompt environment, and architecture metrics.
- Add runtime schemas for Recall Index, LENS prompt budget trace, witness-scoped facts, scene/phase seals, correction cases, candidate swipe provenance, and package retrieval metadata.
- Add a small contract helper module for stable JSON hashes, redaction, external prompt-environment normalization, host-message visibility normalization, latency metrics, and storage-write counters.
- Harden SillyTavern prompt lifecycle tests so Directive-owned install/rebuild/clear paths cannot touch external prompt keys such as `summaryception`, `3_vectfox*`, native World Info, or Memory Books-produced prompt material.
- Normalize Summaryception, Memory Books, VectFox, native hidden-row, and true-delete visibility states at the host-message boundary.
- Extend live soak readiness inspection with a redacted `directive.sillytavern.externalContextProbe.v1` browser/runtime artifact while keeping `default-user` reserved for human testing.
- Add a pure live-probe artifact builder with `all-visible`, `explicitly-unavailable`, `disk-browser-mismatch`, `disabled-vectfox`, and `redaction-canary` fixtures before wiring Playwright capture into live readiness.
- Add the new contract and prompt-key coexistence tests to the alpha gate only after the focused tests pass locally.

Agent findings to preserve:

- Contracts/Metrics lane should stay behavior-light until the scale harness and CORE Store APIs exist. Do not start v2 storage or runtime fast-gate migration in this slice.
- Prompt Compatibility lane identified prompt-key ownership as the lowest-risk immediate compatibility win. The adapter must treat non-Directive prompt keys as host-owned, even when a malformed block asks Directive to use one.
- Live Soak lane identified external-extension inspection as a readiness artifact, not a blocking prerequisite for hostContinue. The live harness should record present/enabled/disabled/unknown state with hashes and redactions, then leave final prompt assembly to SillyTavern.
- Browser proof lane should capture only allowlisted runtime metadata: context readiness, resolved user, chat id/length, prompt-key presence, settings hashes, chat-metadata counts, message-marker counts, extension global-signature booleans, and unavailable reasons. It must never capture raw prompt text, Memory Book content, Summaryception summaries, vector payloads, API keys, or hidden Director material.
- Visibility normalization lane should model source existence independently from visibility. Summaryception summarized ranges, Summaryception ghosting, Memory Books hide/unhide metadata, VectFox prompt exclusion, native hidden rows, and true deletes must enter REPAIR with distinct reasons.

## Stage 2: Scale Harness

Goal: fail early if the v2 architecture cannot meet the 5000-message contract.

Owner: QA/Performance worker, separate from CORE implementation.

Tasks:

- Build a synthetic 5000-message campaign fixture generator.
- Include realistic but bounded command logs, threads, quests, crew/ship state, host map entries, diagnostics stubs, sidecar summaries, and prompt revisions.
- Include realistic but bounded Recall Index entries, scene/phase seals, prompt budget traces, witness-scoped facts, structured package retrieval metadata, correction-case stubs, and optional semantic candidate refs.
- Include bounded external context diagnostics for active World Info, Memory Books entry counts, Summaryception ghosted rows, and VectFox prompt/interceptor state.
- Build a v1 large-save fixture that includes `runtimeTracking.history`, `turnLedger.entries`, model-call journal, sidecar journal, and nested retained packet shapes.
- Assert proposal targets:
  - materialized head <= 8 MB minified JSON;
  - save manifest <= 50 KB;
  - host map <= 5 MB excluding raw chat text;
  - event segment rolls over at <= 2 MB;
  - diagnostics segment rolls over at <= 5 MB;
  - recall index segments roll over at <= 5 MB;
  - scene-seal segments roll over at <= 5 MB;
  - prompt budget diagnostics remain bounded and do not store prompt bodies;
  - hot-path full-save rewrites = 0;
  - writes before generation start <= 1 small transaction write.
  - hot-turn writes do not rewrite sealed v2 event, turn, recall, scene-seal, or prompt-budget history segments.

Suggested tests:

- `test-storage-scale-5000.mjs`
- `test-architecture-redesign-scale-harness.mjs`
- `test-directive-recall-index-contracts.mjs`
- `test-lens-prompt-budget-lane-contracts.mjs`
- `test-old-save-importer-fixture.mjs`
- `test-event-segment-rollover.mjs`

Exit gate:

- Scale harness exists and fails against naive full-save rewrites.
- CORE Store work cannot close until this harness passes.

Agent use:

- Delegate fixture generation and assertions to QA.
- Do not delegate target threshold changes.

First scale harness slice:

- Add `test-storage-scale-5000.mjs` before v2 storage migration begins.
- The test should generate exactly 5000 synthetic host rows, bounded materialized head state, host-message map entries without raw transcript text, active prompt-cache metadata, event segments, diagnostics segments, external prompt-environment diagnostics, and a legacy v1 large-save baseline.
- It should also generate Recall Index entries, scene/phase seals, prompt budget traces, witness-scoped facts, correction-case stubs, and package retrieval metadata so the scale harness proves the Narrative Engine transfer does not reintroduce full-history growth.
- The v2 candidate artifacts must round-trip through logical storage so the scale budget is attached to storage-shaped records, not only in-memory objects.
- The v2 candidate layout must satisfy the documented byte thresholds, including prompt cache <= 1 MB, and show zero hot-path full-save rewrites with at most one small pre-generation transaction write.
- The scale proof must distinguish bootstrap/import writes from hot-turn writes. Bulk fixture creation may write all historical artifacts once, but after player submit the hot path must write only the allowed current tail/new segment plus compact heads/manifests and must preserve sealed historical segment refs and hashes.
- Include a compact-v2 negative case that rewrites sealed segment keys without writing `payload.campaignState`; it must fail the sealed-segment rewrite gate without being misreported as a legacy full-save rewrite.
- The scale harness now replaces synthetic hot-turn key accounting with an actual append/settle operation against the written 5000-message fixture, and asserts bounded read/write/verify logs from the storage adapter.
- The legacy baseline must explicitly violate the full-save rewrite rule so the harness catches a naive implementation that keeps rewriting `payload.campaignState`.
- This harness is not proof that the runtime has migrated. It is the scale gate that Stage 3 and Stage 4 must satisfy with real storage APIs.

## Stage 3: V2 Storage Substrate

Goal: create the storage layer CORE can use without rewriting the full save.

Owner: CORE Storage worker, single owner.

Tasks:

- Add logical keys for campaign manifest, materialized head, events segment, turns segment, diagnostics segment, prompt cache, host map, save manifest, and checkpoint.
- Add logical keys for recall index segments, scene-seal segments, prompt-budget diagnostics, correction projections, and package retrieval metadata indexes.
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

First storage substrate slice:

- Add v2 logical keys for campaign manifest, save manifest, materialized head, host map, prompt cache, event segments, turn segments, diagnostics segments, and checkpoints.
- Add v2 logical keys for recall index segments, scene-seal segments, prompt-budget diagnostics, correction projections, and structured retrieval metadata indexes.
- Add `transaction-store-v2` storage helpers for bounded JSON segment writes, segment chunking, checkpoint write/load, artifact refs, artifact hash verification, materialized head reads, and manifest-last save layout commits.
- The commit path must write blobs first, read them back, verify artifact hashes, then write the save manifest and campaign manifest as the final pointer writes. If a blob hash fails, neither manifest pointer may be written.
- Add a dev-only v1 importer from `directive.campaignSave` into v2 artifacts. It can use the old full save as input, but v2 output must omit raw transcript text, provider prompt/response bodies, external extension payloads, broad `runtimeTracking` journals, and full retained snapshots from the hot artifacts.
- Update the 5000-message scale harness to use the v2 substrate API instead of handwritten artifact writes.

Second storage substrate slice:

- Make `commitV2SaveLayout(..., reuseExistingSegmentRefs: true)` a manifest-cursor hot path instead of an eager history reader.
- Trust already-published sealed segment refs from the current save manifest and carry them forward byte-for-byte without reading or rewriting those segment files.
- Read and hash-verify only changed open-tail segments, new rollover segments, checkpoints, materialized heads, host maps, prompt caches, and manifest pointers before publication.
- Write changed open-tail segments to versioned segment keys rather than overwriting the logical key named by the current manifest. This keeps old manifest readers valid while a new hot commit is in flight.
- Add a narrow append/settle substrate API for event/turn hot appends that preserves existing head, host map, prompt cache, diagnostics, checkpoints, and sealed segment refs while moving only the affected event/turn tails plus manifests.
- Use that append/settle API from at least one public CORE Store mutator before calling the storage substrate production-ready; `commitMechanics(...)` is the first safe slice because reload can derive its transaction mechanics state, mechanics revision, outcome id, turn ledger row, and prompt dirty domains from the appended event/turn segments.
- Scope post-write `verifyJsonFiles` calls to newly written artifacts plus save/campaign manifests, not every historical segment key.
- Apply the same bounded verification rule to diagnostics-only appends: diagnostics append may read current manifests and verify new diagnostics segments, but must not read old head/event/turn history.
- Keep full bootstrap/import/fallback commits on the conservative full write/read verification path by leaving `reuseExistingSegmentRefs` disabled.

Hot-path invariants:

- Reused refs must come from the current accepted manifest or an equivalent previous successful commit cursor.
- Only immutable sealed prefix segments that were already sealed in the previous manifest are eligible for ref-only reuse. The previous open tail remains read/write/verify territory once when it rolls over.
- New or rewritten blobs must be read back and hash-checked before the save manifest and campaign manifest are written.
- Readers must follow manifest refs, not assume fixed numeric segment paths such as `events/0000.v2.json`, because changed tails may publish versioned keys.
- A verified manifest commit makes its sealed refs the integrity anchor for future hot commits. Full cold audit, import, or repair tooling can still re-read the complete history when needed.

## Stage 4: CORE Store

Goal: introduce the transaction/event API as the single durable writer.

Owner: Agent-0 plus CORE Store worker. Agent-0 integrates final runtime seams.

Stage stance:

- Build this as a synthetic CORE Store proof first, not a runtime migration.
- The store may use fake storage and a toy materialized head, but it must call the real v2 storage substrate so manifest-last writes, segment refs, and hash verification are exercised.
- Do not route `chat-turn-orchestrator.mjs`, `state-delta-gateway.mjs`, `response-dispatcher.mjs`, live saves, or SillyTavern host events through CORE Store until the synthetic proof can reconstruct read projections from segments.
- Treat old ledgers as compatibility projections only. New writes go through CORE Store events and diagnostics segments.

Tasks:

- Implement CORE Store APIs:
  - `beginTurn(sourceFrame)`;
  - `advanceTurn(txnId, phasePatch)`;
  - `commitMechanics(txnId, operationBundle)`;
  - `recordVisibleResponse(txnId, responseRef)`;
  - `markRecoveryRequired(txnId, recoveryBundle)`;
  - `commitBackgroundBatch(txnId, operationBundle)`;
  - `appendDiagnostics(txnId, diagnosticsEvent)`.
- Add CORE projection APIs for recall revision, scene-seal refs, witness fact updates, correction cases, candidate swipe refs, and selected-swipe invalidation/fork relationships.
- Expose read projections for ingress ledger, response ledger, turn ledger, recovery journal, model-call diagnostics, and sidecar diagnostics.
- Expose read projections for Recall Index, prompt budget traces, scene/phase seals, and correction cases without making them mutable campaign-state roots.
- Add revision split:
  - mechanics revision;
  - runtime revision;
  - diagnostic revision;
  - prompt revision.
- Move diagnostics to diagnostics segments.
- Prohibit direct new writes to old ledger helpers outside CORE Store.
- Add canonical `directive.coreEvent.v1` envelopes for turn/runtime/gameplay events.
- Add separate `directive.coreDiagnostic.v1` entries for model-call, sidecar, provider, external-prompt, and storage diagnostics.
- Add separate bounded diagnostics for prompt budget traces and recall query traces. These may store refs, lane names, counts, token estimates, omission reasons, hashes, and scores, but never prompt bodies or transcript bodies.
- Record dirty domains from mechanics/background commits, but leave prompt revision ownership to LENS.
- Reject stale `baseMechanicsRevision`, invalid phase transitions, duplicate visible responses, and duplicate non-idempotent commits before writing.
- Replay matching idempotency keys without advancing revisions.
- Build `turnTiming` as a CORE read projection from persisted `phaseAdvanced` and `visibleResponseRecorded` events. This projection is the durable authority for architecture latency proof.

Current writer seams to audit before migration:

- `recordTurnIngress`, `recordDirectiveResponse`, `recordRecoveryEvent`, `recordSidecarEvent`, and `recordModelCallEvent` in `src/runtime/state-delta-gateway.mjs`.
- `commitTrackedCampaignState` in `src/runtime/state-delta-gateway.mjs`, especially `runtimeTracking.history[].snapshot`.
- Runtime call sites in `src/runtime/chat-turn-orchestrator.mjs`, `src/runtime/response-dispatcher.mjs`, `src/runtime/message-reconciler.mjs`, `src/jobs/campaign-sidecar-scheduler.mjs`, `src/runtime/model-call-journal.mjs`, `src/campaign/transaction-state.mjs`, and `src/runtime/turn-commit-coordinator.mjs`.
- Legacy diagnostics summarizers in `src/storage/transaction-store-v2.mjs` must account for current runtime journals under `runtimeTracking`, not only top-level `campaignState.modelCallJournal` or `campaignState.sidecarJournal`.

Suggested tests:

- `test-core-store-v2.mjs` or `test-core-transaction-store-synthetic.mjs`;
- `test-core-store-read-projections.mjs` if the first synthetic test grows too large;
- `test-turn-transaction-runtime.mjs` phase/store subset;
- `test-transaction-store-v2.mjs`;
- `test-model-call-diagnostics-segments.mjs`;
- `test-state-delta-gateway.mjs` updated only after equivalent CORE behavior exists.

The first synthetic test should assert:

- `beginTurn`, `advanceTurn`, `commitMechanics`, `recordVisibleResponse`, `markRecoveryRequired`, `commitBackgroundBatch`, and `appendDiagnostics` append the expected event or diagnostics records.
- Projections for ingress ledger, response ledger, turn ledger, recovery journal, model-call diagnostics, and sidecar diagnostics derive from event/turn/diagnostics segments.
- `appendDiagnostics` advances only diagnostic revision and does not write head, dirty prompt, or advance mechanics/runtime revisions.
- `advanceTurn` can persist through the append-only event delta path after `beginTurn` bootstraps the CORE manifest: no head/host-map/prompt-cache/turn writes, no v1 save writes, and manifest pointers last.
- `commitMechanics` can persist through the append-only event/turn delta path after segment rollover: no sealed segment reads/writes/verifies, no old open-tail overwrite, no head/host-map/prompt-cache writes, no v1 save writes, and manifest pointers last.
- `recordVisibleResponse` and `repairVisibleResponseRef` can persist through the append-only event delta path: no head/host-map/prompt-cache/turn/diagnostics writes, no v1 save writes, no raw response text, and manifest pointers last.
- `markRecoveryRequired` and `supersedeLatestSourceTransaction` can persist through the append-only event delta path: no head/host-map/prompt-cache/turn/diagnostics writes, no v1 save writes, raw source/replacement text redacted, recovery/source-restart links hydrate from events, and manifest pointers last.
- `commitBackgroundBatch` can persist through the append-only event delta path: no head/host-map/prompt-cache/turn/diagnostics writes, no v1 save writes, background dirty domains hydrate from `backgroundBatchCommitted` events, and manifest pointers last.
- Host-map read projections derive player, assistant, response-repair, and latest-source restart rows from CORE events rather than requiring the host-map artifact as row authority.
- `commitMechanics` and accepted `commitBackgroundBatch` reduce a toy head and advance mechanics exactly once per accepted commit.
- Record-visible-response is exactly-once across `hostContinue`, `directiveNarration`, and `directivePause` cases.
- Artifacts do not contain `payload.campaignState`, `runtimeTracking.history[].snapshot`, `turnLedger.entries[].snapshotBefore`, raw prompt bodies, raw provider output, raw transcript text, raw sidecar packets, or secrets.
- No `saves/*.v1.json` full-save write occurs.
- Replay from event segments reconstructs the same materialized head and read projections.
- Persisted `turnTiming` reconstructs submit-to-generation-start latency for both `hostContinue` and `directiveCommit` without reading `payload.campaignState.runtimeTracking`.

Exit gate:

- CORE Store can record a synthetic turn without writing full campaign state.
- CORE Store has public hot-path writers, `advanceTurn(...)`, `commitMechanics(...)`, `recordVisibleResponse(...)`, `repairVisibleResponseRef(...)`, `markRecoveryRequired(...)`, `supersedeLatestSourceTransaction(...)`, and `commitBackgroundBatch(...)`, that avoid full CORE head/host-map/prompt-cache rewrites while remaining reload-correct from segments.
- Read projections can power existing UI/test callers during migration.
- Diagnostics do not advance mechanics revision.
- No `runtimeTracking.history[].snapshot` write in the new path.
- Runtime migration is still blocked until the synthetic store proof passes and the old writer seams above have replacement projection coverage.

Do not delegate:

- final transaction phase semantics;
- final API names;
- final compatibility/read-projection behavior.

Agent use:

- Use one CORE Store worker to inspect transaction/store semantics and one projection worker to inspect old ledger consumers.
- Keep Agent-0 as the only integrator for `run-alpha-gate.mjs`, shared storage helpers, and any runtime-facing adapter.
- Ask workers for findings, test proposals, and migration risks before code handoff. Do not let workers independently migrate hot runtime files in this stage.

## Stage 5: Frame And Fast Gate

Goal: make hostContinue fast before deeper systems are migrated.

Owner: one runtime worker, integrated by Agent-0.

Tasks:

- Build Frame from host event.
- Attach a compact external prompt-environment reference or unknown-state marker to the Frame without blocking the fast gate on deep extension inspection.
- Attach compact recall facets to the Frame: active actor ids, location id, phase id, mission/thread ids, selected assistant variant hash, and source hashes. Do not run broad Recall Index queries in the fast gate.
- Normalize accepted assistant variant once at host/source boundary.
- Add latest-boundary precheck before classification.
- Dedupe source revision by chat id, host message id, and text hash.
- Route by deterministic checks first.
- Use Utility classification only when deterministic checks are insufficient.
- Return `hostContinue`, `directiveCommit`, `directivePause`, or `recoveryReview`.
- For ordinary `hostContinue`, release host generation without waiting for model-backed SRE, advisory generation, LENS rebuild, FORGE, thread extraction, or Command Log summary.
- For counsel/advisory `hostContinue`, create or reserve the deterministic fallback advisory id before release, but do not await `missionDirectorAdvisor`, advisory prompt sync, or advisory model-call diagnostics before host generation release.
- Record Directive-owned prompt revision used by released host generation, plus whether the final SillyTavern prompt may include external host prompt material.
- Keep and expand the post-release host-native completion/failure event path for nonblocking SillyTavern generation. It observes the completed native assistant row and writes CORE projections later without blocking release or retrying host generation.

Suggested tests:

- `test-chat-turn-orchestrator.mjs`;
- `test-turn-intent-classifier-fixtures.mjs`;
- `test-turn-transaction-runtime.mjs`;
- `test-frame-recall-facets.mjs`;
- `test-sillytavern-event-wiring.mjs`;
- controlled slow Utility provider test;
- counsel/advisory fast-gate fixture proving `continueHostGeneration` records release before a deferred `missionDirectorAdvisor` provider promise resolves.
- host-native completion callback fixture proving nonblocking release returns immediately, later completion writes exactly one CORE visible-response projection, duplicate callbacks are idempotent, raw assistant text is redacted, and callback failure becomes diagnostics/recovery rather than a thrown release error.

Exit gate:

- Deterministic hostContinue generation release target < 10 seconds.
- Hard under-60-second generation-start assertion exists.
- Edits/deletes/stale source can route to REPAIR review instead of normal classification.
- HostContinue does not wait for native WI scans, Summaryception, VectFox retrieval, or other external extension inspection owned by SillyTavern.
- HostContinue does not wait for Recall Index query expansion, scene sealing, prompt budget rebuild, or semantic/vector retrieval.
- Host-native completion/failure review is a later CORE/REPAIR/SRE event path, not a synchronous contradiction review inside the release call.

Current implementation note, June 29, 2026:

- `src/hosts/sillytavern/chat-adapter.mjs` returns immediately for nonblocking host generation and schedules a `directive.hostGenerationObservation.v1` callback after `Generate(...)` settles. The callback includes ids, timing, status, text hash, text length, and byte length, but not raw assistant text or provider payloads.
- `src/runtime/response-dispatcher.mjs` waits until the release response has been persisted, then records a CORE visible-response projection for observed assistant rows, an `unavailable`/reobserve-first recovery for missing assistant rows, or `responseRetryRequired` for true host-generation failure. Duplicate callbacks short-circuit after terminal settlement, while a later completed observation or delayed `reobserveHostGenerationCompletions(...)` can close host-native failed/unavailable recovery only with REPAIR's response-reobserve closure decision.
- `tools/scripts/test-sillytavern-chat-prompt-adapters.mjs`, `tools/scripts/test-response-dispatcher-core-bridge.mjs`, and `tools/scripts/test-core-store-v2.mjs` are the deterministic proof floor. Bounded live proof now exists in `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T08-22-01-670Z/report.json`: all five non-human Ashes lanes reached turn 3 and recorded terminal host-native completion from persisted CORE response projections. Full live certification still needs the unbounded 52-turn run and an exact required-turn completion object in each lane and aggregate proof.
- `tools/scripts/smoke-sillytavern-live.mjs` now emits `hostNativeCompletionProof`, delegated soak emits `live-host-native-completion-proof`, and `tools/scripts/run-continuity-matrix-five-user-soak.mjs` emits aggregate `host-native-completion-core-proof`. These are proof gates, not certification until the live lanes include completed `hostContinue` rows from CORE projections.
- `tools/scripts/soak-sillytavern-campaign-live.mjs` marks `soak-turn-03` as the required `hostContinue` proof turn. The smoke runner can preserve that route contract through per-round requirement proof, but delegated soak, coordinator, and preflight summaries must keep the required `scriptMessageId` / turn / route / strategy binding instead of flattening the evidence into a generic completion count.

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
- Move Command Log assisted summary out of mechanics/narration commit and into post-visible-response background settlement.
- Move Narrative Thread post-commit extraction out of the visible-response return path and into post-visible-response background settlement.
- Build narration input from the current LENS prompt packet or bounded prompt-budget overlay; do not wait for Recall Index expansion, scene sealing, or semantic candidates after mechanics commit.
- Ensure response retry reuses outcome id and response idempotency key.
- Keep provider completion latency separate from architecture latency.

Suggested tests:

- `test-runtime-director-turn.mjs`;
- `test-runtime-stage9-turn-loop.mjs`;
- `test-transaction-state.mjs`;
- `test-command-log-summary-sidecar.mjs`;
- `test-narrative-thread-director.mjs`;
- controlled slow narration provider test.

Exit gate:

- Directive-owned narration generation starts under 60 seconds in deterministic slow-provider tests.
- Retry response does not rerun mechanics.
- Recall, scene seal, and prompt budget trace work is either already cached or deferred; it cannot delay narration start.
- Provider failure after mechanics enters REPAIR-compatible response retry state.

## Stage 7: REPAIR Skeleton

Goal: stop the edited-message loop before source settlement is deeply refactored.

Owner: REPAIR worker, Agent-0 final integration.

Tasks:

- Create REPAIR service boundary around edit/delete/retry/rerun/rollback decisions.
- Expose CORE `markRecoveryRequired` through the production runtime CORE facade before claiming edit/delete recovery is CORE-owned.
- Route host edit/delete/swipe/Stop/chat-change events through REPAIR.
- Normalize visibility-only host mutations separately from source mutations, including `is_hidden`, Summaryception `extra.sc_ghosted`, Summaryception `ghostedIndices`, VectFox prompt ghosting, and Memory Books hide/unhide behavior.
- Treat Summaryception `summarizedUpTo` and summarized ranges as summarized context markers, not hidden rows, unless separate ghost/hide metadata exists.
- Represent VectFox prompt ghosting as prompt exclusion or external prompt visibility, not as host-row deletion.
- Preserve delete precedence: a confirmed source delete remains a source mutation even if extension metadata also says hidden, summarized, prompt-excluded, or unhidden.
- Route host `MESSAGE_UPDATED` through REPAIR visibility observation, not edit recovery. Visibility-only changes may append one bounded CORE `sourceVisibilityMutation` diagnostic for the transaction; they must not save the campaign, sync prompt context, mutate ingress/response status, or create recovery journal entries.
- Enforce latest-boundary rule:
  - latest player row with no dependent assistant may restart same transaction;
  - edited/deleted player row with dependent assistant or committed outcome enters recovery case;
  - response retry reuses same outcome/idempotency;
  - rerun outcome creates explicit branch/checkpoint candidate.
- Keep existing invalidation helpers temporarily, but remove policy decisions from scattered callers.
- Write source-mutation recovery into CORE first for CORE-backed ingress/response rows, then mirror only projection refs into old ingress/response/recovery ledgers during the bridge.
- Extend CORE recovery projections with source mutation, dependent outcome/response refs, source Frame refs, allowed actions, replacement-text hash/presence, and pre-outcome revision without raw replacement text.
- Add correction-case state for evidence-backed Correct-as-Swipe: selected source refs, evidence verdict refs, proposed candidate swipe refs, allowed actions, and selected-swipe acceptance follow-up without raw replacement text.
- Cancel queued background work for invalidated source tokens.
- Keep hidden/ghosted rows available for source identity, selected-swipe checks, and recovery decisions unless the host actually deleted them.

Suggested tests:

- `test-message-recovery.mjs`;
- `test-recovery-director.mjs`;
- `test-sillytavern-message-actions.mjs`;
- `test-sillytavern-runtime-lifecycle.mjs`;
- Sam Vickers edited-message fixture based on the turn-latency audit.
- Summaryception ghosted player/assistant row fixtures.
- Summaryception summarized-range fixtures proving summarized-only rows remain present source rows.
- Memory Books hide/unhide visibility fixtures.
- VectFox prompt-excluded latest-player-row fixture.
- Latest hidden/ghosted player row fixture proving source identity and latest-boundary detection still work.
- CORE-backed source-mutation recovery fixture proving committed player edits/deletes and Directive response edits/deletes create sanitized `recoveryRequired` cases before old projections.
- Production visibility-only fixture proving Summaryception ghosting, Memory Books unhide markers, and VectFox prompt exclusion append diagnostic-only CORE evidence without prompt sync, save, or recovery side effects.
- Correct-as-Swipe fixture proving a correction case can append a candidate assistant swipe with provenance and does not mutate accepted continuity until the user selects it.

Exit gate:

- Edited dependent player row cannot produce a replacement classified ingress.
- Recovery case has one owner and one visible product path.
- Correction cases have one owner, append candidate swipes idempotently, and do not rerun mechanics.
- CORE Store, not `runtimeTracking.recoveryJournal`, is the first durable writer for CORE-backed source mutations.
- Sam Vickers loop cannot reproduce in deterministic fixture.
- Ghosted or hidden rows do not create false deletes, false latest-boundary gaps, or normal-turn reobserve loops.
- Summarized-only and prompt-excluded rows do not create latest-boundary gaps or stale source-frame recovery errors.
- `MESSAGE_UPDATED` visibility observations are idempotent and diagnostic-only, while true source deletes detected on the same path still enter REPAIR source recovery.

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
- Add evidence-verdict mode for selected text and Correct-as-Swipe: `supported`, `contradicted`, `unsupported`, `ambiguous`, or `external-only`.
- Use witness-scoped fields when settlement proposes or validates facts: `knownBy`, `witnessedBy`, `subjectIds`, `disclosureState`, and evidence refs.
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
- selected-text evidence verdict fixture.
- witness-scoped fact settlement fixture proving anti-telepathy constraints.

Exit gate:

- Accepted selected swipe is the only assistant-prose continuity source.
- Stale/mismatched integrity never triggers auto-commit.
- Edited dependent rows route to REPAIR, not settlement auto-apply.
- Evidence verdicts cite Directive-owned Frame/CORE/package/reviewed-import refs; external lore, Memory Books, Summaryception, or VectFox can produce `external-only` evidence but not committed truth.

Implementation note, June 30, 2026:

- Scene Handshake has diagnostic-only `latestPair` SRE preflight against the active ingress Frame and CORE transaction before the legacy Scene Handshake settler. It records provider-free `sourceSettlement` diagnostics and preserves selected-swipe acceptance without automatic SRE settlement.
- Scene Reconciliation has diagnostic-only `explicitRange` SRE preflight at the beginning of `execute(...)`. CORE-targeted ranges call `preflightRange(...)` with hash-only message refs, validate observed range identity against expected campaign/save/chat, and store only compact `sourcePreflight` status/range/diagnostic evidence. Ranges without a CORE transaction are locally marked `skippedMissingCoreTransaction` and do not call SRE.
- Automatic Scene Handshake settlement and automatic Scene Reconciliation settlement are still deferred. They should be added only after the diagnostic preflights prove no selected-swipe, stale-range, double-settlement, or raw-text persistence regression. The host-native post-visible source-review worker is a separate focused-test-proven boundary and is not automatic settlement/apply authority.
- Current focused proof: `node tools\scripts\test-scene-reconciliation.mjs`, `node tools\scripts\test-scene-reconciliation-open-world.mjs`, `node tools\scripts\test-architecture-redesign-system-skeletons.mjs`, `node tools\scripts\test-source-reconciliation-engine-synthetic.mjs`, `node tools\scripts\test-chat-turn-orchestrator.mjs`, and `node tools\scripts\test-chat-native-runtime-flow.mjs`.

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
- Add prompt budget lanes:
  - `stableRules`;
  - `protectedContinuity`;
  - `activeScene`;
  - `activeCast`;
  - `missionPressure`;
  - `recentTranscript`;
  - `recall`;
  - `volatileTurn`;
  - `externalEnvironment`.
- Emit `LensPromptBudgetTrace` diagnostics with lane budgets, estimated tokens, included refs, omitted refs, omission reasons, and cache inputs without storing prompt bodies.
- Consume Recall Index hits as refs scored by authority and relevance; LENS decides inclusion and omissions through lane budgets.
- Filter active-cast and protected-continuity lanes by witness-scoped facts and source evidence.
- Add external prompt-environment model:
  - active native ST World Info/lorebook names, chat-bound `chat_metadata.world_info`, character/persona lorebook refs, settings hash, placement counts, and ST-owned prompt-surface counts for before/after, at-depth, outlet, Author's Note, and example-message influence;
  - Memory Books/STMB installed/version/settings state, `chat_metadata.STMemoryBooks` counts, `stmemorybooks: true` WI entry count/hash, `STMB_start`/`STMB_end` range diagnostics, active chat-bound `world_info`, and risky mode flags;
  - Summaryception enabled state, prompt key state, prompt-slot metadata, `summarizedUpTo`, layer counts, snippet counts, ghosted count, `ghostedIndices` extrema, `extra.sc_ghosted` marker counts, and stale-summary flags;
  - VectFox enabled/disabled/disk-only state, `3_vectfox*` prompt keys, position/depth/role metadata, backend type, Qdrant/cloud/local mode, semantic WI state, EventBase state, summarizer injection state, agentic retrieval state, ghosting state, collection counts, hook presence, and redacted vector settings;
  - unknown/unavailable state for hosts or users where a signal cannot be inspected safely.
- Normalize the rich-fixture diagnostic objects in the same model:
  - `memoryBooks.rangeDiagnostics`;
  - `summaryception.staleness`;
  - `vectFox.backendDiagnostics`.
- Route prompt dirty emissions from CORE Store commits.
- Move scattered `synchronizeActivePrompt` calls behind LENS scheduling.
- Manual prompt clear and runtime-owned global cleanup clears now route through `LENS.clearDirectivePrompt(...)`. The current cleanup set is campaign-complete conclusion cleanup, completed-campaign load, completed-campaign archive, active-save deletion, no-active-campaign chat-change cleanup, and extension-disabled runtime cleanup when the runtime app bridge is available. These clears are isolated from generation timing, preserve the same host clear behavior, clear all LENS installed-lane state for host-global Directive prompt clears, and do not forget installed state if the host clear reports failure. Wrong-chat and unbound-chat suspension now route through `LENS.suspendDirectivePrompt(...)`, which calls the host clear with `preservePacket: true`, keeps LENS installed-lane state, records suspended lanes, and prevents a later false cache reuse by forcing reinstall on the next bound sync.
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
- Add prompt-surface preservation assertions for:
  - native WI `worldInfoBefore`, `worldInfoAfter`, `customDepthWI_<depth>_<role>`, `customWIOutlet_<name>`, Author's Note influence, and example-message influence;
  - Summaryception `summaryception`;
  - VectFox `3_vectfox`, `3_vectfox_posN`, `3_vectfox_eventbase`, `3_vectfox_summarizer`, and `3_vectfox_lorebook`;
  - Memory Books-created WI entries and chat-bound `world_info`, rather than a Memory Books-specific prompt key.
- Ensure diagnostics-only writes do not dirty prompt.
- Guard against fact-use stats self-invalidating cache keys.

Suggested tests:

- `test-prompt-dirty-domains.mjs`;
- `test-lens-prompt-budget-lane-contracts.mjs`;
- `test-directive-recall-index-contracts.mjs`;
- `test-witness-scoped-facts.mjs`;
- `test-external-prompt-environment.mjs`;
- `test-host-prompt-key-coexistence.mjs`;
- `test-player-safe-prompt-context.mjs`;
- CPM prompt/cache tests;
- host prompt adapter lifecycle tests.
- Native WI fixtures for before/after, at-depth roles, outlets, Author's Note, example-message influence, recursive scan, min activations, disabled WI, forced activation, and conflicting lorebook facts.
- Summaryception fixtures for `summaryception` prompt-key preservation, older metadata without `ghostedIndices`, `disableGhosting=true`, branch metadata with `summarizedUpTo >= chat.length`, stale summaries after edit/swipe/branch, and persisted ghosting with `extra.sc_ghosted`, `is_system=true`, and `is_hidden=false`.
- Memory Books fixtures for `stmemorybooks: true` entries, `STMB_start`/`STMB_end`, stale/inverted ranges, chat-bound `world_info`, at-depth user/assistant roles, side prompts, auto-hide/unhide, generated-memory conflict, and no dedicated Memory Books prompt key.
- VectFox fixtures for `3_vectfox`, `3_vectfox_posN`, `3_vectfox_eventbase`, `3_vectfox_summarizer`, `3_vectfox_lorebook`, generation-interceptor marker, prompt ghosting, Qdrant unavailable/cloud states, EventBase state, agentic retrieval state, and redacted vector settings.

Exit gate:

- One visible-lane prompt rebuild at most.
- One background-batch prompt rebuild at most.
- No rebuild for diagnostics-only writes.
- Prompt budget trace records included/omitted refs and cache inputs without archiving prompt bodies.
- Recall Index inclusion is deterministic-first, optional semantic candidates are non-authoritative, and omitted recall refs are traceable.
- Active-cast prompt content respects `knownBy`, `witnessedBy`, and `disclosureState`.
- HostContinue can honestly record next-generation prompt rebuild.
- External prompt keys survive Directive prompt rebuild and clear.
- Prompt diagnostics distinguish Directive-owned context from external host prompt material.
- External prompt-environment snapshots persist only counts, hashes, prompt keys, positions, settings hashes, and redaction summaries.
- Rich external-context fixture proof includes Memory Books range diagnostics, Summaryception staleness diagnostics, and VectFox backend diagnostics through fixture prep, browser readiness, prompt-adapter summaries, and coordinator generation proof.
- Memory Books and VectFox diagnostics never persist raw generated memory text, prompt templates, side prompts, vector hits, embeddings, Qdrant secrets, API keys, or provider error bodies.

Implementation note, June 28, 2026:

- `src/hosts/sillytavern/external-context-observer.mjs` is the reusable host boundary for converting active SillyTavern context into the redacted external prompt-environment model. It keeps raw lorebook, Memory Books, Summaryception, VectFox, and prompt bodies out of Directive diagnostics.
- The five-user coordinator now promotes external-context readiness proof and lane prompt-snapshot generation proof separately. Readiness proves per-user browser/disk extension visibility before the run; lane prompt snapshots prove the generation artifacts recorded an `externalPromptEnvironmentRef` and known external prompt keys.
- SillyTavern prompt inspection now carries compact generation-time proof fields from the prompt adapter through live smoke snapshots and delegated soak live-log promotion: `externalPromptEnvironmentRef`, `knownExternalPromptKeys`, `directiveOwnedPromptKeys`, `finalHostPromptMayIncludeExternal`, `unavailableSignals`, and redaction reasons. The environment identity hash excludes `observedAt` so repeated inspections of unchanged external context do not create false drift.

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
- Add a typed scene/phase seal worker that emits compact summaries, events, facts, witness updates, open threads, mission pressure, callbacks, correction candidates, Recall Index entries, and dirty domains.
- Add pressure/open-thread/callback/arc digest refresh as bounded FORGE background effects rather than full transcript summaries.
- Ensure scene seals and digests run after visible generation starts or visible control response posts, never before generation start.
- Keep Command Log assisted summary as a specialized presentation sidecar, but settle successful summaries through shared CORE/FORGE background semantics.
- Keep Narrative Thread extraction as a specialized source/thread sidecar during the bridge, but settle successful chat-native extractions through shared CORE/FORGE background semantics.
- Move quest/background architecture and director-internal multi-commit work into FORGE when not visible-blocking.
- Keep external summarizers/vectorizers outside FORGE by default. Summaryception, Memory Books, and VectFox may coexist as external tools, but their outputs are not FORGE results unless a future reviewed-import flow explicitly converts them into Directive proposals.
- Define a future optional approved-artifact export seam for vector tools: public Command Log summaries, mission components, reviewed CPM evidence, or other player-safe artifacts tagged with campaign/save/chat/source metadata.
- Record when external generation, retrieval, or summarization may be running outside Directive's generation router so latency and provider-call diagnostics are not misattributed to FORGE.
- First production bridge slice, completed for regular campaign sidecars:
  - CORE `commitBackgroundBatch` is exposed through `runtimeCoreTurnStore`;
  - the production `createForgeCoordinator(...)` is injected into `createCampaignSidecarScheduler`; the old direct CORE background-commit accepted-batch fallback has since been removed, so missing FORGE accepted settlement fails closed before old v1 mutation;
  - sidecar provider fan-out now enters FORGE through `runProviderBatch(...)`, with the scheduler supplying the sidecar runner callback so FORGE owns provider idempotency and redacted provider diagnostics without owning v1 parse/apply;
  - worker results are parsed and validated before `stateDeltaGateway.validateOperations`;
  - accepted non-conflicting operations aggregate into one non-mutating compatibility projection preview and one FORGE-owned CORE background batch settlement before ordinary v1 projection roots are discarded; only the temporary Command Bearing carveout may assign/persist command roots;
  - accepted sidecar worker results pass through `settleAcceptedBatch(...)` with provider-owner diagnostics, `providerCallAttempted: false`, hash-only worker refs, normalized prompt dirty domains, and idempotent replay;
  - the scheduler records a stable sidecar batch id before provider execution and skips duplicate prompt/journal/CORE settlement when the same transaction/source/workers are scheduled again, while source fingerprints prevent stale clean cache replay;
  - cross-worker path conflicts reject before mutation;
  - unchanged source Frames can rebase over unrelated monotonic runtime revision drift, while non-monotonic drift and stale source ingress still fail closed;
  - sidecar proposal prompts are compact by default, and likely-truncated JSON receives one strict repair attempt before invalid output is rejected without mutation;
  - one batch-level prompt sync runs after accepted effects settle.
- Second production bridge slice, completed for Command Log summary:
  - CORE Store supports multiple background batches per transaction with idempotent replay and duplicate batch-id rejection;
  - successful Command Log summaries commit a sanitized CORE background effect batch with zero mechanics operations and one `commandLogSummary` worker ref;
  - queued, stale, failed, and background-bridge-failed states remain diagnostics;
  - raw assisted-summary text, prompts, player text, and provider output stay out of CORE artifacts.
- Third production bridge slice, completed for Narrative Thread settlement:
  - chat-native committed turns schedule post-commit conversation extraction after the visible response path instead of awaiting it;
  - non-terminal pending accept/confirm resolutions schedule the same settlement against the original pending source ingress and carry resolution ingress/message hashes as provenance;
  - cancel, revise, dismiss, and terminal checkpoint resolution paths do not schedule Narrative Thread extraction unless they create a new committed visible outcome;
  - runtime settles the Narrative Thread queue after Command Log settlement to avoid stale-state overwrite races;
  - queued, applied, stale, and failed states mirror into CORE `sidecarDiagnostics`;
  - successful settlements commit a sanitized `narrative-thread:*` CORE background effect batch with zero mechanics operations and one `narrativeThreadDirector` worker ref;
  - source guards can stop stale work before provider or apply stages where the queued context detects drift, and direct pending-resolution commits reject stale original pending ingress before mechanics commit;
  - raw player text, assistant text, prompts, scene deltas, provider output, and campaign state snapshots stay out of CORE artifacts.
- Fourth production bridge slice, completed for advisory enrichment:
  - counsel creates or reserves the deterministic advisory id and releases host generation before awaiting `missionDirectorAdvisor`;
  - provider-backed advisory enrichment runs in a post-release queue with the original source message id, ingress id, player text hash, fallback advisory hash, and advisory id;
  - the queue checks source freshness before provider work and again before applying enrichment;
  - successful enrichment patches the same advisory id and commits a sanitized `advisory-enrichment:*` CORE background effect batch with zero mechanics operations and one `missionDirectorAdvisor` worker ref;
  - provider failure, invalid JSON, no-change enrichment, stale source, or missing transaction records preserve the fallback advisory and record bounded diagnostics only;
  - model-call diagnostics for this delayed worker attach to the originating transaction even when the ingress is already `hostContinueReleased` or `complete`;
  - raw advisory prompt text, provider output, player text, and generated advisory prose stay out of CORE background refs and diagnostics.
- Fifth production bridge slice, completed for terminal checkpoint settlement:
  - terminal committed narration remains the transaction's single CORE visible response;
  - terminal checkpoint posts bypass `response-dispatcher` as a second control row, then settle through a sanitized zero-operation `terminal-checkpoint:*` CORE background/control batch with one `terminalOutcomeCheckpoint` worker ref;
  - terminal checkpoint replies resolve the pending decision without scheduling ordinary Director preview/commit, regular sidecars, Command Log summary, Narrative Thread extraction, or advisory enrichment;
- terminal checkpoint replies advance and settle their own CORE resolution transaction when they arrive through a player-message ingress, instead of leaving it at `observed`;
- direct UI/API terminal resolution without a fresh resolution ingress attaches settlement to the original terminal transaction without trying to record a second CORE visible response;
- raw checkpoint text, raw player resolution text, prompts, provider output, and hidden Director material stay out of CORE background refs and diagnostics.

Implementation note, June 30, 2026:

- `src/jobs/forge-coordinator.mjs` now exposes `settleAcceptedBatch(...)` for pre-generated, already-accepted worker results. This lets production regular sidecars move CORE background settlement ownership into FORGE without rerunning providers or duplicating the scheduler's v1 mutation path; accepted batches now use `stateDeltaGateway.validateOperations(...)` only as a non-mutating compatibility projection preview before final settlement.
- `src/jobs/forge-coordinator.mjs` also exposes `runProviderBatch(...)` for provider execution only. The method records hash-only source/job/result diagnostics and idempotent provider replay, but it does not call `createForgeBatchCommit`, `commitBackgroundBatch`, `settleAcceptedBatch`, or LENS flush.
- `src/jobs/campaign-sidecar-scheduler.mjs` now prefers the injected FORGE coordinator for provider fan-out and requires `settleAcceptedBatch(...)` for accepted sidecar background settlement. The direct `runSidecarJobs(...)` provider path remains a temporary provider-execution bridge, but the direct CORE accepted-batch callback fallback is removed; `commitCoreBackgroundBatch(...)` remains only for the separate Command Bearing closure-review settlement bridge. `runtime-app.mjs` injects a CORE-backed production coordinator.
- The scheduler keeps a temporary stable sidecar-batch replay barrier for its old v1 parse/compatibility-validation/prompt bridge. Replayed provider packets cannot duplicate compatibility validation, prompt sync, FORGE settlement, CORE diagnostics, or compact CORE read projections.
- The scheduler's accepted-batch prompt bridge now computes LENS-normalized dirty domains from accepted worker roots/operation domains (`ship`/`crew`/`relationships` -> `crewShipRelationship`, `commandBearing` -> `command`, `continuity`/`factIndex` -> `continuity`) and hands stable accepted-batch `promptSyncIdempotencyKey` values to FORGE/LENS after CORE/FORGE settlement, using live/filtered state plus compact CORE accepted-batch evidence rather than the transient compatibility projection.
- Accepted regular sidecar prompt synchronization now flows through a FORGE-owned `flushAcceptedBatchPrompt(...)` seam when available. Production runtime wires that seam to a runtime-owned `acceptedBatchPromptFlusher` adapter that calls the real `synchronizeActivePrompt(...)` path, so accepted sidecars do not use LENS's placeholder packet builder and the scheduler can adopt/persist the returned prompt-context campaign state. Command Bearing closure-review prompt synchronization now flows through a FORGE-owned `flushCommandBearingReviewPrompt(...)` seam after durable review CORE settlement and compact `directive.coreCommandBearingReviewProjection.v1` handoff. The scheduler-owned `syncPromptContext(...)` paths are fallback-only when the FORGE/LENS helper is unavailable.
- The chat-native diagnostics red is closed: CORE v2 hot commits now serialize save/layout manifest publication across full layout writes, event/turn deltas, and diagnostics appends, and diagnostics appends carry a small recent-diagnostic repair window so a stale manifest tail cannot drop the first regular sidecar lifecycle row. This preserved `continuity` queued/running/no-change diagnostics, Narrative Thread queued/applied diagnostics, and Command Log background settlement through reload.
- Current focused proof: `node tools\scripts\test-campaign-sidecar-scheduler.mjs`, `node tools\scripts\test-architecture-redesign-system-skeletons.mjs`, `node tools\scripts\test-background-projection-batch.mjs`, `node tools\scripts\test-chat-turn-orchestrator.mjs`, `node tools\scripts\test-active-save-facade-v2.mjs`, `node tools\scripts\test-prompt-dirty-domains.mjs`, `node tools\scripts\test-core-store-v2.mjs`, `node tools\scripts\test-transaction-store-v2.mjs`, and `node tools\scripts\test-chat-native-runtime-flow.mjs`.

Suggested tests:

- `test-background-projection-batch.mjs`;
- `test-campaign-sidecar-scheduler.mjs`;
- `test-command-log-summary-sidecar.mjs`;
- `test-narrative-thread-director.mjs`;
- `test-generation-router.mjs`;
- `test-host-sidecar-orchestrator.mjs`;
- stale-cancellation fixture;
- counsel/advisory deferred-provider fixture proving host generation release precedes `missionDirectorAdvisor` completion and enrichment patches the same advisory id;
- deeper advisory enrichment stale/edit/delete fixture proving fallback advisory remains and no provider/apply work mutates stale source.
- terminal checkpoint fixture proving checkpoint posts create zero-operation CORE settlement batches, terminal resolution ingress transactions settle instead of staying `observed`, and terminal replies do not schedule regular sidecars, Command Log summary, Narrative Thread extraction, or advisory enrichment.
- scene/phase seal fixture proving one bounded CORE background batch updates seal refs, Recall Index entries, prompt dirty domains, and witness updates without raw transcript/provider output.
- pressure/arc digest fixture proving digest refresh is source-token checked, cancelable, and bounded.
- external Summaryception/Memory Books/VectFox coexistence fixture proving FORGE does not ingest their outputs automatically.

Exit gate:

- One FORGE run produces at most one state transaction and one prompt rebuild.
- One CORE transaction may contain multiple background batches when independent post-turn systems settle at different times.
- Stop/edit/delete cancels queued background workers.
- Scene/phase seals and pressure digests update Recall Index/LENS dirty domains through CORE background batches without blocking visible generation.
- External summarizer/vectorizer output is either ignored as external prompt context or enters a review/import proposal; it never commits as Directive state automatically.
- In-flight unabortable provider output becomes diagnostics-only if stale.
- Regular campaign sidecars prove one non-mutating compatibility projection validation, one CORE `backgroundBatchCommitted` event, no ordinary v1 root projection writes, and one prompt sync/flush from live/filtered state plus compact CORE accepted-batch evidence. Command Log summary proves post-visible-response settlement, a zero-operation CORE background effect on success, and diagnostics-only stale/failure behavior. Narrative Thread settlement proves post-visible-response queueing for normal and non-terminal pending committed turns, source-stale guards before provider/apply stages, stale pending-source rejection before direct pending commit, a zero-operation CORE background effect on success, and redacted diagnostics/artifacts. Terminal checkpoint settlement proves a second visible control row is not recorded as a second CORE visible response, terminal post/resolution effects settle through sanitized zero-operation CORE batches, and terminal replies do not schedule ordinary sidecars.

## Stage 11: Open-World Reducers

Goal: remove broad state replacement and retained full-packet pressure.

Owner: mechanics/open-world worker, single owner.

Tasks:

- Replace open-world `rootsSet` output with bounded event/reducer operations.
- Convert quest, thread, world boundary, reaction, and story milestone updates into typed events.
- Emit typed events with actor/location/mission/thread/phase facets that scene seals and Recall Index can consume without reading broad state snapshots.
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
- Open-world events carry enough facets for recall/seal/digest projection without duplicating open-world roots.
- Open-world fixture tests prove equivalent state outcomes.

## Stage 12: Migration Cutover

Goal: stop writing the old architecture.

Owner: Agent-0.

Tasks:

- Switch runtime write path to v2 by default.
- Keep v1 importer as load-only development convenience, not a supported parallel runtime format.
- Remove or hard-fail old full-save hot-path writes in runtime turns.
- Define the final autosave shape before removing v1 autosave records or pruning behavior.
- Keep compact v2 `runtimeTracking`, `turnLedger`, model-call diagnostics-tail, sidecar/background diagnostics-tail, and prompt-cache resume rehydration in regression, and complete the remaining presentation/recovery resume projections.
- Remove direct old ledger mutation from migrated paths.
- Remove or gate old hot-save prompt/retrieval summary roots that duplicate Recall Index, scene seals, prompt budget traces, or correction projections.
- Update tests that expected old `runtimeTracking` ledger roots; do not keep old assertions as compatibility expectations after the v2 projection exists.
- Update runtime panels to consume compact projections or diagnostics segments.
- Update docs that describe `runtimeTracking` as the durable ledger container.
- Remove compatibility aliases, bridge fallbacks, duplicate helper names, and old projection shims once their replacement owner has passing deterministic proof. If a shim cannot be removed in this stage, record it on the Architecture Redesign Board with target owner, reason it is still needed, and the exact gate that deletes it.

Suggested tests:

- all new v2 tests;
- old-save importer tests;
- storage/load/save tests;
- UI projection tests;
- `node tools\scripts\run-alpha-gate.mjs`.

Exit gate:

- A v1 save loads and rewrites into v2.
- A v2 save reloads without old hot-path payload behavior.
- Reload from v2 preserves runtime sequencing required for the next turn, including model-call ids and background diagnostics continuity.
- Current runtime uses CORE Store by default.
- Old runtime/save APIs are either removed, fail closed, or documented as projection-only/import-only with a deletion gate.

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
- `test-directive-recall-index-contracts.mjs`;
- `test-lens-prompt-budget-lane-contracts.mjs`;
- `test-witness-scoped-facts.mjs`;
- `test-forge-scene-phase-seal.mjs`;
- `test-correct-as-swipe-workflow.mjs`;
- `test-architecture-redesign-scale-harness.mjs`;
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
- `generationTiming.persisted.entries[]` sourced from CORE `turnTiming` projections, with `timingSource: "coreProjection"` or equivalent provenance;
- `story-quality-model-review` aggregate check with every lane at parseable `pass` for unbounded certification;
- `quality-review/model-assisted-review/result.json` per lane, with no `not-run`, timeout, missing result, or unparseable provider output;
- `fact-checks/model-assisted-review/result.json` per lane, identity-matched to `request.json`, with `factualGroundingReviewer` model-call success, `pass` status, and zero release-blocking factual counts;
- active head size;
- event segment size;
- diagnostics segment size;
- Directive context revision/hash used by visible generation;
- Recall Index revision, query trace, and bounded included/omitted recall refs;
- LENS prompt budget trace with lane budgets, included refs, omitted refs, omission reasons, and cache inputs;
- scene/phase seal refs when a boundary is crossed, plus seal segment size;
- witness-scoped fact evidence for at least one active-cast fact when the lane includes character-specific knowledge;
- Correct-as-Swipe candidate-swipe provenance when that workflow is exercised, with no accepted-continuity mutation until selected;
- external prompt environment snapshot: native World Info active state, Memory Books/STMB markers, Summaryception state, VectFox enabled/injection state, and unknown/unavailable signals;
- pre-generation prompt-inspection snapshots for the executed lane depth, including compact external target summaries and no raw external prompt bodies;
- `directive.sillytavern.externalContextProbe.v1` readiness artifact captured before the campaign smoke, with per-user `stLorebooks`, `memoryBooks`, `summaryception`, and `vectFox` statuses;
- per-user browser/disk hashes, context readiness, prompt-key presence, chat-metadata counts, message-marker counts, global-signature booleans, redaction summary, and unavailable reasons;
- list of external prompt keys observed or explicitly not inspectable;
- confirmation that Directive clear/rebuild touched only `directive.*` prompt keys;
- canceled background jobs after edit/delete;
- no hot-path full-save rewrite.
- no latency certification based only on runtime snapshots, chat output, or stale v1 `payload.campaignState.runtimeTracking` ledgers.

Live scope:

- SillyTavern is the active pre-alpha host gate.
- Lumiverse is future host-neutral design pressure, not an active pass/fail gate for this redesign.
- Use non-human soak users for live proof unless the reported bug is specifically in the human default user context.
- Run one live coexistence pass with installed native Lorebooks, Memory Books, Summaryception, and VectFox present in the SillyTavern profile. VectFox may be disabled for the pass, but the diagnostics must record disabled-present state.
- Do not treat `default-user` disk evidence as soak proof. Each `directive-soak-*` user must be browser/runtime-confirmed or explicitly marked `disk-confirmed`, `settings-only`, `not-installed`, `disabled`, `unavailable`, or `indeterminate`.
- Prepare at least one non-human profile with a small redacted fixture for Memory Books/STMB entries, Summaryception ghosting, native WI placements, and VectFox prompt keys/interceptor state. If a run only sees copied settings without installed extension files or fixture data, report limited evidence instead of passing compatibility.
- Use the deterministic prep tool before certification when the target soak profile lacks rich active data:

```powershell
node tools\scripts\prepare-sillytavern-external-context-fixture.mjs --data-root F:\SillyTavern\SillyTavern\data --user directive-soak-a --write
node tools\scripts\prepare-sillytavern-external-context-fixture.mjs --data-root F:\SillyTavern\SillyTavern\data --user directive-soak-a --validate
node tools\scripts\check-sillytavern-multi-user-soak-readiness.mjs --external-context-fixture --write-artifacts
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SOAK_ST_USERS='directive-soak-a,directive-soak-b,directive-soak-c,directive-soak-d,directive-soak-e'
$env:DIRECTIVE_SILLYTAVERN_DATA_ROOT='F:\SillyTavern\SillyTavern\data'
$env:DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH='1'
node tools\scripts\check-sillytavern-multi-user-soak-readiness.mjs --live --prepare-external-context-fixtures --activate-external-context-fixture --write-artifacts
```

The prep tool is intentionally profile-scoped and refuses `default-user`. Its validation is not a substitute for browser readiness; it prepares bounded data so the live browser probe can prove rich fixture depth. The readiness `--prepare-external-context-fixtures` flag writes that bounded fixture to each configured non-human soak user before inspection, while `--activate-external-context-fixture` selects the prepared Ashes fixture character/chat before observing `context.chat`, `chatMetadata`, prompt keys, and visibility markers.
- Pass the external-context probe when each target is `browser-confirmed`, `disabled`, or `not-installed`. Treat `disk-confirmed` or `settings-only` without browser signal as a warning or failure depending on whether that live run requires external-compatibility proof.
- Record external-context `fixtureDepth` separately from observability. `browser-confirmed` means the target is observable in the profile; it does not prove active Memory Books entries, Summaryception ghost/layer behavior, native WI placement, or VectFox prompt/interceptor pressure. Full external-compatibility certification requires at least one non-human soak profile with rich redacted fixture evidence for each target, or an explicit limited-evidence warning.
- Readiness and coordinator status semantics now enforce that distinction. Multi-user readiness reports `host-extension-fixture-depth`; bounded live coordinator runs may report incomplete `fixtureDepth` as a warning, but an unbounded full-certification run fails `external-context-fixture-depth` unless the fixture-depth status is `pass`.
- Interpret fixture-depth target levels as `rich-active`, `browser-observed`, `disk-only`, `inactive`, `unavailable`, or `unknown`. `browser-observed` means settings/global surfaces were visible but active fixture evidence was not proven. `inactive` is acceptable evidence for disabled/not-installed reporting, but it is not rich compatibility proof.
- Keep the browser probe pre-generation and side-effect-light. Final prompt order, retrieval behavior, and generation-time extension latency are later smoke/soak evidence, not readiness-probe claims.
- If VectFox is enabled for a pass, record external interceptor/retrieval latency separately from Directive architecture latency and redact Qdrant/API-key settings.
- The save index may locate the active `(campaignId, saveId)` and expose `v2ManifestRef`, but persisted timing extraction must then read the save-scoped CORE layout. The extractor must not treat an empty or stale v1 checkpoint ledger as proof that no persisted timing exists.

Five-user coordinator requirements:

- Minimal bounded live command:

```powershell
$env:SILLYTAVERN_BASE_URL='http://127.0.0.1:8000'
$env:DIRECTIVE_SOAK_ST_USERS='directive-soak-a,directive-soak-b,directive-soak-c,directive-soak-d,directive-soak-e'
$env:DIRECTIVE_LIVE_MODEL_CALL_BUDGET='unlimited'
$env:DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH='1'
node tools\scripts\run-continuity-matrix-five-user-soak.mjs --live --turn-limit 3 --activate-external-context-fixture --write-artifacts
node tools\scripts\run-continuity-matrix-five-user-soak.mjs --live --turn-limit 3 --prepare-external-context-fixtures --activate-external-context-fixture --write-artifacts
```

- Credentials may come from `DIRECTIVE_SOAK_ST_USERS` JSON or `handle:password`, shared `DIRECTIVE_SOAK_ST_PASSWORD`, or per-user `DIRECTIVE_SOAK_ST_PASSWORD_DIRECTIVE_SOAK_A` through `_E`.
- If the SillyTavern data root is not `F:\SillyTavern\SillyTavern\data`, set `DIRECTIVE_SILLYTAVERN_DATA_ROOT`, `SILLYTAVERN_DATA_ROOT`, or `ST_DATA_ROOT`.
- If the served extension path differs, set `DIRECTIVE_SILLYTAVERN_EXTENSION_PATH`.
- Coordinator env equivalents are `DIRECTIVE_CPM_FIVE_USER_SOAK_LIVE=1`, `DIRECTIVE_CPM_FIVE_USER_SOAK_WRITE=1`, `DIRECTIVE_SOAK_TURN_LIMIT=N`, `DIRECTIVE_CPM_FIVE_USER_SOAK_RUN_ID`, `DIRECTIVE_CPM_FIVE_USER_SOAK_ARTIFACT_DIR`, and `DIRECTIVE_CPM_FIVE_USER_SOAK_RESUME=1`.
- Readiness can require rich external-context fixtures with `DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH=1` or `DIRECTIVE_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH=1`. Without that flag, readiness treats shallow fixture evidence as an explicit warning so operators can prepare fixtures before running certification.
- Live readiness can prepare fixtures with coordinator/readiness `--prepare-external-context-fixtures` or `DIRECTIVE_SOAK_PREPARE_EXTERNAL_CONTEXT_FIXTURES=1`, then activate them with `--activate-external-context-fixture` or `DIRECTIVE_SOAK_ACTIVATE_EXTERNAL_CONTEXT_FIXTURE=1`. The activation path uses SillyTavern host chat APIs, not Directive campaign runtime APIs, and records `external-context-fixture-activation` entries in `live-log.jsonl`.
- Do not use `DIRECTIVE_SOAK_STRICT=1` or `DIRECTIVE_LIVE_CAMPAIGN_SOAK_STRICT=1` for bounded proof unless the desired result is failure on bounded-depth warnings.

Default-user and freshness rules:

- `default-user` is reserved for human testing and is rejected by readiness, lane execution, and five-user lane policy. Five-user proof uses `directive-soak-a` through `directive-soak-e`.
- Served-extension freshness is hash-based when `SILLYTAVERN_BASE_URL` is set. Live proof compares served SHA-256 values against checkout SHA-256 values for the manifest, manifest JS/CSS, bootstrap/runtime files, and soak proof files.
- `extension-sync-before-testing` passes only when served hashes match or `DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1` is set after manual sync. A hash mismatch remains a `served-extension-freshness` warning unless strict mode makes warnings fatal.

Bounded proof semantics:

- A run with `--turn-limit 1` or `--turn-limit 2` is pre-hostContinue limited evidence. It can prove readiness, prompt/source, external-context, and early factual-grounding plumbing, but it cannot prove the required `soak-turn-03` host-native completion path. `--turn-limit 3` is the minimum bounded hostContinue completion proof, and omitting the turn limit remains required for full 52-turn certification.
- The expected top-level coordinator `status` for a healthy bounded live run is `warning`, because `turn-depth` and `lane-results` include bounded-depth warnings.
- Expected top-level checks for healthy bounded proof:
  - `pass` `five-user-lane-policy`
  - `pass` `non-human-soak-users`
  - `pass` `live-readiness`
  - `pass` `external-context-readiness-proof`
  - `pass` or `warning` `external-context-fixture-depth` (`warning` means the run proved observability but not rich active fixtures)
  - `warning` `turn-depth`
  - `pass` `continuity-prompt-source-proof`
  - `pass` `external-context-generation-proof`
  - `pass` `factual-grounding`
  - `pass` `lane-artifact-completeness`
  - `warning` `lane-results`
- `lane-results` is warning because each child lane report includes `live-execution-turn-limit: warning`. This is expected for bounded proof.
- Fact-check artifact count should equal `turnLimit + 1`. A one-turn run needs two fact-check files; a two-turn run needs three.

Current implementation evidence from June 28-29, 2026:

- Standalone Directive browser smoke passed after the shared architecture contract module was made browser-safe: `artifacts/live-soak/smoke-diagnostic/2026-06-28T06-18-37/report.json`.
- Before that fix, SillyTavern discovered and activated `third-party/Directive`, but the served module graph failed on `node:crypto`; the browser showed Directive script/style tags but no `globalThis.Directive` bridge or `#directive_settings` DOM.
- Shared runtime modules that are served into SillyTavern must not import Node-only APIs such as `node:crypto` or depend on `Buffer`. Browser-safe hashing/byte-length utilities are now part of the shared contract layer and have deterministic tests.
- Single-lane bounded live proof passed for `ashes-factual-director`: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-28T12-19-21-597Z/report.json`.
- Full five-user bounded Ashes proof passed with readiness enabled: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-28T12-23-18-316Z/report.json`.
- The full five-user run ended `status: warning` only because `--turn-limit 1` is bounded proof. Required checks passed for that early-depth scope: five-user lane policy, non-human users, live readiness, external-context readiness proof, continuity prompt/source proof, external-context generation proof, factual grounding, and lane artifact completeness. It did not and could not prove the later `soak-turn-03` host-native completion requirement.
- The readiness artifact recorded 5 users and 20 target statuses as `browser-confirmed`; each lane recorded generation-time `externalPromptEnvironmentRef` proof and known external prompt keys.
- That run is not full certification: it used one turn per lane, produced two fact-check artifacts per lane, showed minimal generation-time external prompt-key evidence, and did not prove rich active Memory Books, Summaryception, or VectFox fixture behavior.
- Strict readiness artifact `artifacts/live-soak/sillytavern-campaign/2026-06-28T20-47-03-043Z/report.json` failed only `host-extension-fixture-depth`: browser/runtime observability passed, but `fixtureDepth.status` was `warning`, `stLorebooks` and `vectFox` had zero rich users, `currentChatId` was null, chat-bound World Info was absent from browser metadata, and VectFox remained disabled through a missed `extension_settings.disabledExtensions` entry. This is the expected limited-evidence failure mode.
- Strict readiness artifact `artifacts/live-soak/sillytavern-campaign/2026-06-28T20-56-56-424Z/report.json` then passed with `--activate-external-context-fixture`: `directive-soak-a` activated `Directive - Ashes - external-context-fixture`, loaded `Directive External Context Fixture` as chat-bound World Info, and reached `fixtureDepth.status: pass` with `rich-active` evidence for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox.
- Strict five-user readiness artifact `artifacts/live-soak/sillytavern-campaign/2026-06-30T01-20-17-302Z/report.json` passed after adding explicit fixture preparation to readiness. The command used `--prepare-external-context-fixtures --activate-external-context-fixture`; `host-extension-fixture-preparation`, `host-extension-fixture-depth`, browser context proof, and storage isolation all passed. `fixtureDepth.fullFixtureUserHandles` listed all five non-human soak users, and every target coverage entry reported `richUserCount: 5` for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox.
- Full-certification preflight warning classification is now fail-closed. Bounded-depth warnings are recognized by explicit check ids (`turn-depth`, lane `live-execution-turn-limit`, and aggregate `lane-results` only when every lane warning is explicitly depth-only), not by summary text. A warning that merely mentions "turn", "bounded", or "limited" now remains a strict blocker until a release gate deliberately classifies it.
- Generation-start timing proof now has deterministic, artifact-plumbing, and bounded live runtime-snapshot coverage: CORE Store projections expose `turnTiming`, response dispatch carries Directive-posted `turnLatency` into persisted CORE response refs, live smoke rounds attach runtime and persisted `generationTiming`, delegated soak promotion writes that proof into `turn-end` records, and the soak runner emits `live-generation-start-timing`. The failed bounded five-user run at `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-28T21-42-29-479Z/report.json` exposed a missing-timestamp normalization bug; the bounded single-lane rerun at `artifacts/live-soak/sillytavern-campaign/2026-06-28T21-58-54-918Z/report.json` proved one runtime-snapshot `directiveCommit` turn at `25875 ms`; and the bounded three-turn Ashes run at `artifacts/live-soak/sillytavern-campaign/hostcontinue-generation-start-fixed-20260628-165022/report.json` proved runtime-snapshot coverage for both `directiveCommit` and `hostContinue`, including `hostContinue` release at `1131 ms`. The persisted closeout is now specifically a CORE projection extractor closeout: the smoke path must read save-scoped CORE `turnTiming` for the active `(campaignId, saveId)` instead of stale v1 save payload ledgers.
- External-context generation proof now has deterministic gate coverage beyond generic key presence. The prompt adapter records compact target summaries as `externalPromptEnvironmentTargets`; live smoke preserves them in prompt-inspection artifacts; and the five-user coordinator requires pre-generation snapshots, expected capture depth, exact expected `scriptMessageId` coverage, no missing/duplicate/unexpected pre-generation script ids, external environment refs, known external keys, final-host-prompt inclusion, and rich target pressure when readiness identifies a rich fixture user. This is not yet full live certification until the unbounded Ashes run produces those artifacts.
- Host-native completion projection now has deterministic bridge and artifact-contract coverage. The SillyTavern adapter emits a post-release hash-only completion/failure callback; response dispatch waits for the release record to persist, then writes one CORE visible-response projection or generic recovery projection; duplicate callbacks are idempotent. Live smoke now attaches per-round `hostNativeCompletion.persisted` and aggregate `hostNativeCompletionProof`; delegated soak emits `live-host-native-completion-proof`; and the five-user coordinator emits aggregate `host-native-completion-core-proof`. This is not live certification until an Ashes run proves terminal host-native assistant rows from SillyTavern artifacts and the proof remains bound to the scripted `hostNativeCompletionRequired` turn instead of a generic completion count.
- Bounded sidecar/finalization regression proof passed for `ashes-factual-director`: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T14-32-56-379Z/report.json`. The lane used `--turn-limit 3`, passed persisted CORE generation-start timing with max latency `29911 ms`, passed persisted CORE host-native completion with one completion and max latency `14756 ms`, passed story-quality review and factual grounding, and ended with `sidecarRejectedCount: 0` / `sidecarRejectedDelta: 0` after 11 sidecars. This run confirms the previous stale-global-revision sidecar conflicts and relationship JSON rejection are no longer present in bounded proof. It is still not full certification because the only remaining lane warning is the intentional three-turn limit.
- Bounded certification regression proof now passes every hard aggregate gate for `ashes-factual-director`: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T22-38-15-661Z/report.json`. The lane used `--turn-limit 3`, `directive-soak-a`, and `--activate-external-context-fixture`; it passed external-context readiness and generation proof with rich pressure for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox; persisted CORE generation-start timing for 3 turns with max latency `46381 ms`; required host-native completion for `scriptMessageId: "soak-turn-03"`, `turn: 3`, `expectedRoute: "hostContinue"`, and `expectedResponseStrategy: "injectAndContinue"` with max completion latency `14534 ms`; factual grounding with 4 deterministic checks, 0 bad findings, and model-assisted factual review `pass`; and story-quality model review with 7 model scores, 0 score-zero, 0 warning-or-weak findings, and reviewer latency `19124 ms`. The report status remains `warning` only because it is single-lane, bounded-depth proof.
- Bounded `ashes-sidecars-timekeeping` regression proof now passes after correcting the Shuttlebay 1/Shuttlebay 2 factual false positive: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T23-20-40-184Z/report.json`. The previous failing artifact correctly routed the shuttle past visible Shuttlebay 1 and into Shuttlebay 2, but deterministic and model-assisted factual review treated the visibility/orientation sentence as a Shuttlebay 1 arrival. The corrected proof used `--turn-limit 3`, `directive-soak-c`, and `--activate-external-context-fixture`; it passed external-context readiness and generation proof, persisted CORE generation-start timing for 3 turns with max latency `9498 ms`, required terminal host-native completion from persisted CORE projections with max completion latency `23441 ms`, factual grounding with deterministic checks plus model-assisted factual review `pass`, and story-quality model review with 7 scores, 0 score-zero, 0 warning-or-weak findings, and reviewer latency `24897 ms`. The report status remains `warning` only because it is single-lane, bounded-depth proof.
- Bounded three-lane regression proof on June 30, `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-30T00-18-07-165Z/report.json`, remains the failure artifact that exposed the stale proof pipeline. It exercised `ashes-command-bearing-endings`, `ashes-drawer-projection`, and `ashes-sidecars-timekeeping` with `--turn-limit 3`, external-context fixture activation, and non-human soak users only. The run passed factual grounding, story-quality model review, continuity prompt/source proof, external-context generation proof, and model-call failure policy. It also confirmed the recent behavior fixes: command-bearing prose no longer stopped on a false clarification, the six-day/three-day travel/refit drift did not recur, and fallback narration no longer exposed mechanics wording such as "The attempt resolves as...".
- The same June 30 artifact still failed aggregate `generation-start-timing-core-proof`, `host-native-completion-core-proof`, `lane-artifact-completeness`, and therefore `lane-results`. The runtime evidence was better than the aggregate result: final CORE projections contained player host rows and host-native completion evidence after reobserve, but the smoke/delegated-soak/coordinator proof pipeline retained early warnings and still used legacy `runtimeTracking` snapshots for ingress counts and CORE proof target selection. Treat this as a proof-pipeline closeout, not as evidence that CORE did not persist the turn.
- The CORE-targeted bounded rerun at `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-30T01-05-30-310Z/report.json` is now the main bounded implementation-planning evidence. It reran the same three Ashes lanes at `--turn-limit 3` after proof selection moved to explicit player host ids and CORE transaction ids. The run passed external-context readiness, external-context fixture depth, host-native completion turn coverage, continuity prompt/source proof, external-context generation proof, persisted CORE generation-start timing, persisted CORE host-native completion, model-call failure policy, factual grounding, story-quality model review, and lane artifact completeness. The report status remained `warning` only because the pass was intentionally bounded to three selected lanes and three turns.
- June 30 v2 storage evidence confirms the bridge direction and the remaining size risk. The active save index was current with `runtimeStorageFormat: "v2"` and a `v2ManifestRef`, while the old v1 save payload stayed stale by design under `wroteV1Payload: false`. For the inspected command-bearing save, the CORE split was compact (`core-head` about 3.9 KB, host map about 5.9 KB, events about 58.6 KB, turns about 1.7 KB, diagnostics about 144.7 KB), but the non-core v2 head was still about 333.5 KB after only three turns. The 5000-message gate must therefore budget both CORE segments and the active materialized/resume head.
- Active runtime head budget closeout, June 30: `src/storage/active-save-facade-v2.mjs` now records `directive.runtimeActiveHeadBudget.v1` on the runtime-current v2 head and persistence diagnostic, with a 384 KB budget matching the architecture scale harness. The runtime-current head compacts Command Log into the latest 32 entries plus total/omitted counts and summary hashes, so turn-scaled older presentation prose does not ride along in the hot bridge head. The later runtime bridge load/cutover slices moved verified runtime-current loads onto the v2 facade with compact runtime/turn rehydration; explicit v1 checkpoints remain only the fallback/checkpoint lane while remaining full-resume projections are finished. Focused proof: `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, and `test-architecture-redesign-scale-harness.mjs`.
- Story-quality certification now has deterministic coordinator and replay-preflight coverage. `run-continuity-matrix-five-user-soak.mjs` emits aggregate `story-quality-model-review` and rejects missing, `not-run`, unparseable, timeout, non-pass, stale request/result identity, wrong reviewer role, missing model-call proof, score-count mismatch, duplicate/unknown score refs, or partial transcript score coverage for unbounded certification. `replay-story-quality-review-preflight.mjs --dry-run --strict` against `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T08-22-01-670Z` found five request artifacts and correctly failed them: four `not-run` results and one timeout/latency failure. The certification reviewer budget is now `120000 ms`, matching the role registry for the non-blocking `storyQualityReviewer`; timeout evidence still fails, but a successful pass is no longer rejected merely for exceeding the old 60-second ceiling. This proves the older bounded artifact cannot be promoted to full-depth readiness without replaying or regenerating story-quality review evidence.
- Factual-grounding certification now requires model-assisted factual review in addition to deterministic fact-check files. `run-continuity-matrix-five-user-soak.mjs` reads `fact-checks/model-assisted-review/request.json` and `result.json`, validates request/result identity, `factualGroundingReviewer` role, successful model call, pass status, no timeout/unparseable output, and zero bad factual counts. Missing or `not-run` factual model review remains limited evidence, while stale identity, wrong role, timeout, unparseable output, failed status, or bad model-review findings block release.
- Full-certification preflight now has a deterministic aggregate gate and a lane-owned model-call evidence contract. `soak-sillytavern-campaign-live.mjs` writes `modelCallPolicy.failurePolicyEvidence` and lane check `live-model-call-failure-policy`; `run-continuity-matrix-five-user-soak.mjs` carries `.lanes[].modelCallFailurePolicy`, rejects reusable lane artifacts without passing policy evidence, and emits aggregate `model-call-failure-policy`; `preflight-continuity-matrix-full-certification.mjs --strict` consumes that durable lane evidence before considering raw smoke diagnostics. The synthetic test proves a full 52-turn five-lane artifact can pass, fallback-handled failed calls can remain pass-level details when redacted per-call evidence is complete, `fail-closed`/`fail-retryable` or unknown-role failures block release, count-only failed-call evidence fails, and missing lane-owned policy evidence fails even when raw smoke artifacts could be reconstructed. Against the latest bounded `ashes-factual-director` artifact, strict preflight is expected to reject it as non-certification because it is single-lane, turn-limited, below the 52/53 artifact budget, and its older retained failed-call records omit request hashes even though sidecar, timing, story-quality, and factual-grounding regressions are green. Future smoke artifacts now preserve redacted request/fallback fields in retained model-call records so the next live proof can classify fallback-handled failures without nested runtime-state inference.
- REPAIR production ownership now has a concrete boundary slice. `repair-runtime.mjs` records compact REPAIR decisions, REPAIR-computed `legacyProjection`, CORE-first source-mutation recovery cases, diagnostic-only `sourceVisibilityMutation` observations for extension-driven visibility changes, compact source-reobserve decisions for dependent/stale/latest-boundary source rows, source-mutation rollback actuation authorization, response-recovery policy for host-native unavailable/failed observations, response-reobserve closure authorization for host-native failed/unavailable rows, and `hostNativeContinuityContradiction` policy for synchronous and delayed contradictory host-native assistant rows; CORE projections expose `repairDecision`; `state-delta-gateway.mjs` now preserves compact `coreRecovery`/`coreRecoveryError` refs on initial response records and compact source-restart refs on ingress records; `chat-turn-orchestrator.mjs` now consumes `restartLatestSource` to create a distinct latest/no-outcome replacement ingress/source Frame/CORE transaction, calls `supersedeLatestSourceTransaction(...)`, marks the old ingress `restartSuperseded`, and resolves the old recovery as `latest-source-reobserved`; CORE Store persists `latestSourceRestarted`, rehydrates the old/new link from event segments, excludes the superseded prior transaction from active heads, blocks generic `recoveryRequired -> visibleResponsePosted`, and permits only REPAIR-authorized host-native response reobserve closure; `response-dispatcher.mjs` redacts synchronous host-continuation observed-message text into ids, flags, length, and hash, keeps failed/unavailable old response rows as bridge status projections only while CORE recovery and later CORE resolution remain authoritative, and now runs contradiction review after delayed callback/manual reobserve before allowing a host-native completion to stand; and `source-review-worker.mjs` now owns host-native post-visible SRE review/reuse/fail-closed evidence. `test-repair-runtime.mjs` covers the non-synthetic boundary, source reobserve policy, latest-boundary `restartLatestSource` eligibility, dependent latest blocking, idempotency, visibility-only diagnostics, summarized-only rows, delete precedence, response edits, rollback-with-revision versus no-revision behavior, rollback actuation authorization, response recovery policies, no-core fallback, missing writer failure, and raw-text redaction; `test-message-recovery.mjs` proves old projection status/action follows REPAIR's returned `legacyProjection`, source-mutation rollback restore is gated by `directive.repairRollbackActuationDecision.v1`, and visibility-only observations do not mutate ingress status, recovery journals, prompt revisions, or saves; `test-response-dispatcher-core-bridge.mjs` proves host-native completion, unavailable, failed/retry, delayed failed/unavailable reobserve closure, synchronous contradiction, async callback contradiction, and manual reobserve contradiction recovery paths write CORE recovery before old projections, do not write old recovery-journal rows for CORE-backed unavailable/failed observations, and do not persist raw host assistant text in CORE/response ledgers; `test-sillytavern-runtime-lifecycle.mjs` and `test-sillytavern-event-wiring.mjs` prove `MESSAGE_UPDATED` is wired to visibility observation rather than duplicate edit recovery; `test-chat-turn-orchestrator.mjs` proves the Sam Vickers dependent-edit guard consumes REPAIR's source-reobserve decision, latest/no-outcome restart actuation gets a fresh CORE identity plus one CORE supersede call, duplicate restart observation is idempotent, and CORE-backed provider-failure-after-mechanics retry no longer writes or resolves old recovery rows; `test-core-store-v2.mjs` proves the persisted/hydrated `latestSourceRestarted` projections plus authorized response-reobserve recovery resolution; and `test-chat-native-runtime-flow.mjs` proves fake-host runtime paths for committed player-source edits plus committed Directive response edits/deletes before old projections become the UI/runtime bridge. This is still not full REPAIR/SRE ownership: generic committed response retry/reobserve actuation, broader rollback execution ownership, and generic Directive response post-failure demotion remain open.
- Selected-swipe source-mutation handling now has deterministic runtime ownership from host event to recovery evidence. `events-adapter.mjs` aliases SillyTavern `MESSAGE_SWIPED`, `shell-events.js` registers it, `runtime-app.mjs` delegates it to `chat-turn-orchestrator.mjs`, the orchestrator normalizes selected-swipe index/count without storing invalid numeric evidence, `message-reconciler.mjs` routes it as `directiveResponseSelectedSwipeChanged`, `playerMessageSelectedSwipeChanged`, or `sceneHandshakeSourceSelectedSwipeChanged`, and `repair-runtime.mjs` records hash-only selected-swipe mutation evidence in the REPAIR/CORE bundle. Focused proof: `test-sillytavern-event-wiring.mjs`, `test-sillytavern-runtime-lifecycle.mjs`, `test-message-recovery.mjs`, `test-repair-runtime.mjs`, `test-chat-turn-orchestrator.mjs`, and `test-chat-native-runtime-flow.mjs`. This closes the deterministic event/runtime gap; it does not yet replace the pending Playwright native swipe-control runner required for release actuation proof.

### June 30 CORE Proof Closeout

The June 30 agent audit identified the remaining legacy proof sites that must be closed before another broad live run is trusted:

| File | Legacy dependency | Required change |
| --- | --- | --- |
| `tools/scripts/smoke-sillytavern-live.mjs` | `waitForChatNativeIngressCount()` waits on `view.chatNative.tracking.ingressCount`. | Wait on CORE host-map/source-frame player rows for the host message ids sent in the run. Keep the legacy count only as a diagnostic field. |
| `tools/scripts/smoke-sillytavern-live.mjs` | Final ingress assertion compares `finalSnapshot.tracking.ingressCount` to expected sent player messages. | Replace with CORE player row/source-frame proof keyed to the scripted host ids. Failure should mean missing CORE source evidence, not stale legacy count mismatch. |
| `tools/scripts/smoke-sillytavern-live.mjs` | `chatNativeRuntimeSnapshot()` and post-send progress matching read `campaignState.runtimeTracking.ingressLedger` / `responseLedger`. | Add a CORE snapshot helper around `readCoreStoreProjectionsV2()` that exposes `corePlayerRows`, `coreAssistantRows`, `coreTurnObservedCount`, `coreTransactionsByHostMessageId`, `coreResponseRows`, and `coreTurnTiming`. |
| `tools/scripts/smoke-sillytavern-live.mjs` | `hostNativeCompletionProofFromCoreProjections()` and `generationTimingProofFromCoreProjections()` read CORE rows but choose target transactions by diffing runtimeTracking-derived before/after snapshots. | Select targets from CORE transaction ids keyed by host message/source frame for each sent turn. |
| `tools/scripts/soak-sillytavern-campaign-live.mjs` | Live-log timing and host-native aggregators keep an early per-turn warning even when later CORE proof passes after reobserve. | Reclassify empty/no-target-yet early warnings as incomplete diagnostics when final CORE projection proof contains passing entries for the required source turns. |
| `tools/scripts/soak-sillytavern-campaign-live.mjs` | Host-native assessment can say no terminal completion when `evidence.status !== "pass"` even though completion counts and required-turn binding are present. | Base status on required-turn CORE binding and failure count, not on stale aggregate warning state. |
| `tools/scripts/run-continuity-matrix-five-user-soak.mjs` | Aggregate timing and host-native checks require both lane proof and lane check status to already be `pass`, so lane warnings from stale proof windows become aggregate failures. | Consume the final lane-owned CORE projection proof. Treat legacy/runtime-only warnings as non-certification diagnostics once final CORE proof passes. |
| `tools/scripts/run-continuity-matrix-five-user-soak.mjs` | `lane-artifact-completeness` hard-fails after an upstream delegated smoke abort leaves external-context summary captures and per-turn fact checks incomplete. | Do not mask real missing artifacts, but distinguish abort-caused incomplete artifacts from runtime pass/fail. Either let the smoke finish artifact production after legacy assertions are replaced, or generate fact/external-context artifacts before abort paths exit. |

Implementation order:

1. Add the CORE snapshot helper to the smoke runner and record it in after-send and final snapshots.
2. Replace final player-ingress certification with CORE host-map/source-frame evidence for the player host ids sent by the current run.
3. Retarget generation-start and host-native completion proof selection to CORE transactions by host id/source frame.
4. Capture final persisted CORE projection proof after `reobserveHostGenerationCompletions()` and promote that final proof into delegated-soak lane checks.
5. Update coordinator aggregation to prefer final lane-owned CORE proof over stale live-log warning summaries.
6. Rerun the same three-lane June 30 command before expanding to all five lanes.

Exit criteria for this closeout:

- Legacy `runtimeTracking` appears only under clearly labeled diagnostic fields in certification artifacts.
- A lane with passing final CORE generation-start proof cannot fail because an earlier no-target warning remained in the live log.
- A lane with passing required-turn host-native CORE completion cannot fail because `runtimeTracking.responseLedger` was incomplete.
- `lane-artifact-completeness` reports missing fact/prompt/external-context artifacts independently of CORE timing/completion status.
- The next bounded three-lane artifact either passes these gates or fails with a concrete missing CORE row/required artifact, not a stale legacy count mismatch.

Implementation progress, June 30:

- CORE read projections now expose persisted host-map rows alongside event-derived ingress, response, timing, recovery, diagnostics, and background projections.
- CORE Store hot-path proof now includes `commitBackgroundBatch(...)` in addition to route advancement, mechanics, visible response record/repair, recovery, and latest-source restart. The background path writes only an event segment plus save/campaign manifests, preserves head/host-map/prompt-cache/turn/diagnostics refs, hydrates background dirty domains from `backgroundBatchCommitted.operationBundle.dirtyDomains`, and replays same-key background commits after reload without appending duplicate events.
- The live smoke runner now targets persisted generation-start and host-native completion proof by explicit player `hostMessageId` / CORE transaction id instead of relying on before/after `runtimeTracking` ledger diffs.
- Final player-ingress settlement for known sent host ids now uses CORE host-map/source-frame evidence. The old `tracking.ingressCount` remains only as a fallback when the smoke could not identify sent host ids.
- Delegated-soak timing and host-native aggregation now lets final run-end CORE proof override earlier no-target warnings, while real failed proof and missing required-turn bindings still fail.
- Deterministic coverage now includes `test-smoke-sillytavern-core-proof-targeting.mjs`, `test-live-soak-prep.mjs`, and `test-continuity-matrix-five-user-soak-coordinator.mjs`; the new smoke proof targeting test is part of `run-alpha-gate.mjs`.
- The updated `src/storage/core-store-v2.mjs` was synced into `directive-soak-a` through `directive-soak-e`; `default-user` remains reserved for human testing.
- Bounded live rerun `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-30T01-05-30-310Z/report.json` passed the previously failing `generation-start-timing-core-proof`, `host-native-completion-core-proof`, and `lane-artifact-completeness` aggregate gates. Remaining warnings were the intended bounded-scope warnings: three selected lanes, three-turn depth, and lane results inheriting lane-level bounded warnings.
- This closes the stale-runtimeTracking proof-pipeline false failure for bounded proof. Full release certification still requires the unbounded five-lane, 52-turn Ashes run with CORE-targeted timing/completion proof, complete external-context artifacts, scale budgets, and non-human soak users only.
- Focused storage/FORGE verification after the background append-only closeout now passes `test-core-store-v2.mjs`, `test-background-projection-batch.mjs`, `test-campaign-sidecar-scheduler.mjs`, `test-transaction-store-v2.mjs`, `test-repair-runtime.mjs`, `test-message-recovery.mjs`, `test-chat-turn-orchestrator.mjs`, `test-response-dispatcher-core-bridge.mjs`, `test-active-save-facade-v2.mjs`, `test-prompt-dirty-domains.mjs`, `test-chat-native-runtime-flow.mjs`, and the prior `test-storage-scale-5000.mjs` scale proof. The former chat-native red was a CORE diagnostics manifest-tail race: a stale manifest publication could drop the first regular sidecar queued diagnostic even though CORE had accepted it. The closeout serializes v2 manifest publication per save/layout and repairs recent diagnostics missing from a stale persisted tail.
- The canonical alpha gate is green after this closeout: `node tools\scripts\run-alpha-gate.mjs` passed 201 checks, including `test-chat-native-runtime-flow.mjs`, `test-storage-cross-writer-v2.mjs`, `test-transaction-store-v2.mjs`, `test-core-store-v2.mjs`, `test-forge-scene-phase-seal.mjs`, `test-forge-pressure-arc-digest.mjs`, `test-forge-internal-background-settlement.mjs`, `test-forge-open-world-boundary-settlement.mjs`, and `test-external-context-summary-artifact.mjs`.
- REPAIR/CORE response-recovery follow-up, June 30 / July 2: `chat-turn-orchestrator.mjs` now treats CORE-backed Directive response post failures and provider-failure-after-mechanics recovery marking as CORE-mandatory. If `markRecoveryRequired(...)` is missing or returns `notRecorded` for a turn that already has a CORE transaction, the turn records a `DIRECTIVE_CORE_RESPONSE_RECOVERY_NOT_RECORDED` processing recovery and does not create an old-ledger-only `hostResponsePostFailure` retry record. When CORE accepts the recovery, the old recovery journal no longer carries the compatibility recovery row; CORE projections carry compact recovery evidence. Because the removed generic `hostResponsePostFailure` row was the only durable holder of raw retry text, generic retry now uses a compact non-raw `directive.responseRetryGenerationPlan.v1`; deterministic `locationTransition` retry regenerates visible pacing from that plan, and committed/director retry regenerates fresh visible narration through `generationRouter.generate('narration', ...)` from player-safe state plus compact committed-outcome evidence without rerunning mechanics. Focused proof: `test-chat-turn-orchestrator.mjs` covers missing-writer fail-closed behavior, no old generic post-failure recovery row for CORE-backed failures, no raw post-failure text in recovery journals, provider-failure projection/retry behavior, deterministic generic retry regeneration without raw text, and model-backed committed/director retry from compact evidence. `test-core-store-v2.mjs` proves the retry plan is projected from CORE and strips raw `text`/`prompt` fields.
- Live mutation proof consumer and release-bundle follow-up, July 2: `run-sillytavern-message-edit-live.mjs` and `run-sillytavern-message-delete-live.mjs` now expose target CORE recovery projection evidence (`targetCoreRecovery`, `coreRecoveryCount`, and attached ingress/response `coreRecovery`/`repairDecision`) in their runtime snapshots. Their wait loops require target CORE recovery projection or bridge tracking changes instead of old recovery-journal growth, and their `sourceMutationProof` keeps old recovery-count deltas only as `legacyRecoveryDelta`. The shared live harness snapshot and message-action runner now report `legacyRecoveryCount`, `coreRecoveryCount`, `latestCoreRecovery`, and recent CORE recovery projections while preserving `recoveryCount` only as compatibility telemetry. `preflight-sillytavern-message-mutation-actuation.mjs` no longer fails source/assistant edit/delete artifacts just because old `runtimeTracking.recoveryJournal` count did not increase; it now treats `sourceMutationProof.coreRecovery` plus `repairDecision` as the owner evidence. `preflight-architecture-redesign-release-bundle.mjs` now rejects count-only mutation scenario summaries and requires edit/delete `sourceMutationProof` CORE recovery plus REPAIR decision fields and selected-swipe `sourceIntegrityProof` owner fields. Follow-up strictness now rejects selected-swipe staged proof as release actuation: `sourceIntegrityProof` must report `actuationMode: "native-host-swipe-control"`, `nativeHostControlMoved: true`, selected host message id, selected index/count, selected-hash match, discarded-swipe canary absence, and SRE decision status. `run-sillytavern-selected-swipe-actuation-live.mjs` now provides that native Playwright runner: it prepares an unselected Correct-as-Swipe candidate on a recorded Directive assistant response, clicks a native SillyTavern swipe control, confirms the host selected index moved, and emits the release-grade source-integrity block. The combined message-mutation actuation runner now calls this native runner for the `selected-swipe` child instead of `smoke-scene-handshake-live.mjs`. Staged Scene Handshake/Correct-as-Swipe bridge proof remains useful evidence but cannot certify the release bundle. The new runner still needs live Ashes soak execution before release proof is complete. Testing and technical docs now name CORE/REPAIR projected recovery evidence as the authority and old recovery-journal counts as compatibility telemetry. Focused proof: `test-sillytavern-message-mutation-actuation-preflight.mjs`, `test-sillytavern-message-mutation-actuation-live-runner.mjs`, and `test-architecture-redesign-release-bundle-preflight.mjs`.
- CORE-backed no-outcome source-mutation demotion, July 2: `test-message-recovery.mjs` now models uncommitted player edit/delete rows with source Frame refs and CORE transaction ids, matching the hot path after source observation. When REPAIR/CORE records those no-outcome source mutations, `MessageReconciler` updates only the bridge ingress projection and no longer appends old `playerMessageEdited` or `playerMessageDeleted` recovery-journal rows. CORE recovery bundles carry the source-mutation reason, compact REPAIR decision, replacement-text hash/presence, and no raw replacement text.
- No-CORE source-mutation fallback removal, July 2: `message-reconciler.mjs` no longer writes any old `runtimeTracking.recoveryJournal` row for tracked source mutations when CORE recovery cannot be recorded. Instead it returns `ok: false`, `action: "coreRecoveryRequired"`, and `reason: "source-mutation-core-recovery-required"` before old ingress/response mutation, persistence, or prompt sync. Focused proof: `test-message-recovery.mjs` includes a no-CORE player edit canary and asserts state/persistence/prompt-sync stay untouched and the raw text is absent; `test-architecture-redesign-system-skeletons.mjs` now requires zero `recordRecoveryEvent(...)` writers in `message-reconciler.mjs`.
- Visible-response record diagnostic demotion, July 2: `response-dispatcher.mjs` now handles the case where Directive posts a visible assistant row but CORE cannot record `visibleResponsePosted` by appending a compact CORE diagnostic (`worker: "visibleResponseRecord"`, `eventType: "coreVisibleResponseRecordFailure"`) before old fallback. When that diagnostic records, the old response row is bridge-only `coreRecoveryDiagnosticProjected`, duplicate dispatch reads the CORE diagnostic, raw thrown error text is absent from CORE/runtime state, old ingress recovery status/id is not patched, and no old `runtimeTracking.recoveryJournal` `coreVisibleResponseRecordFailure` row is written. Focused proof: `test-response-dispatcher-core-bridge.mjs` covers visible post failure, duplicate dispatch, diagnostic projection, and no repost.
- HostContinue release-record diagnostic demotion, July 2: `response-dispatcher.mjs` now handles the case where host-native generation was released but CORE cannot record `hostContinueReleased` by appending a compact CORE diagnostic (`worker: "hostContinueReleaseRecord"`, `eventType: "coreHostContinueReleaseFailure"`) before old fallback. When that diagnostic records, the old response row is bridge-only `coreRecoveryDiagnosticProjected`, duplicate dispatch reads the CORE diagnostic, raw thrown error text is absent from CORE/runtime state, old ingress recovery status/id is not patched, and no old `runtimeTracking.recoveryJournal` `coreHostContinueReleaseFailure` row is written. Focused proof: `test-response-dispatcher-core-bridge.mjs` covers plain release failure plus contradiction+release-failure interaction.
- Host-native completion-record diagnostic demotion, July 2: `response-dispatcher.mjs` now handles the case where SillyTavern host-native generation completes but CORE `recordVisibleResponse(...)` fails by appending a compact CORE diagnostic (`worker: "hostNativeCompletionRecord"`, `eventType: "coreHostNativeCompletionFailure"`) before any old recovery fallback. When that diagnostic records, the old response row is bridge-only `coreRecoveryDiagnosticProjected`, duplicate dispatch reads the CORE diagnostic by response/transaction id, raw thrown error text is absent from CORE and runtime state, and no old `runtimeTracking.recoveryJournal` `coreHostNativeCompletionFailure` row is written. Focused proof: `test-response-dispatcher-core-bridge.mjs` now covers callback status, bridge row shape, duplicate dispatch, diagnostic projection, and raw-error redaction for this lane.
- No-CORE hostResponsePostFailure raw-text demotion, July 2: `chat-turn-orchestrator.mjs` no longer writes raw failed response text into old `runtimeTracking.recoveryJournal.details.text` for the no-CORE `hostResponsePostFailure` fallback. The old bridge now records only `responseTextPresent`, `responseTextHash`, `responseTextLength`, compact retry plan, ids, decision refs, and error refs. `retryCommittedResponse(...)` also ignores legacy `details.text`, so retry text must come from deterministic/model-backed regeneration through the compact retry plan after REPAIR authorization. Focused proof: `test-architecture-redesign-system-skeletons.mjs` statically rejects the old raw `details.text` pattern and requires compact response text evidence; `test-chat-turn-orchestrator.mjs` proves retry still works through compact regeneration.
- REPAIR response-retry actuation follow-up, July 1: `retryCommittedResponse(...)` now fails closed whenever REPAIR does not authorize the retry, including old `hostResponsePostFailure` recovery rows with no CORE transaction. The regression test temporarily proved the old guard returned `ok: true` for a no-CORE retry, then the restored guard returned `response-retry-not-authorized` without response dispatch, recovery resolution, or persistence. Focused proof: `node tools/scripts/test-chat-turn-orchestrator.mjs` plus syntax checks for `src/runtime/chat-turn-orchestrator.mjs` and `tools/scripts/test-chat-turn-orchestrator.mjs`. This closed the old-ledger retry bypass; the next follow-up covers retained-outcome rerun.
- REPAIR outcome-rerun actuation and CORE replacement-event follow-up, July 1/2: `repair-runtime.mjs` now exposes `directive.repairOutcomeRerunActuationDecision.v1`, `repair-command-boundary.mjs` routes `authorizeRerunBranch(...)` through it, and `runtime-app.mjs` requires that decision before `previewOutcomeReplacement(...)` recomputes mechanics from a retained checkpoint. New committed ledger rows carry an explicit `snapshotBeforeRetained` flag; REPAIR consumes that compact flag, CORE checkpoint refs, loaded checkpoint evidence, and transaction refs, so raw `snapshotBefore` payloads do not authorize and are not reflected in the decision. REPAIR now distinguishes the original outcome transaction (`replacedTransactionId`) from the required fresh branch transaction (`transactionId` / `replacementTransactionId`), so CORE-backed rerun commit cannot reuse the already-committed original transaction for replacement mechanics. `core-store-v2.mjs` now exposes append-only `recordOutcomeReplacement(...)`: it writes event tail plus manifests only, redacts raw replacement text/snapshots, preserves compact REPAIR decision transaction ids, projects/hydrates `turnLedger.replacementHistory` and `lastReplacedOutcomeId`, and rolls back in-memory state on failed append so idempotency cannot mask non-durable writes. `turn-commit-coordinator.mjs` records replacement events only after CORE mechanics succeeds, requires an explicit fresh replacement transaction id, and fails before v1 persistence if mechanics is skipped or replacement recording fails. `runtime-app.mjs` only writes old bounded `turnLedger.replacementHistory` for no-CORE/direct compatibility paths, but those paths still need a CORE checkpoint artifact for preview instead of raw snapshot fallback. Chat-native CORE-backed rerun preview stores only a compact candidate id plus input hash, adds no durable CORE projection before commit, and redacts raw replacement prose from the stored pending turn plus public preview/view payloads; commit revalidates the original outcome/transaction before opening the branch, creates the fresh CORE transaction, mirrors a compact synthetic ingress/source Frame, uses that transaction for replacement mechanics, and records the CORE replacement event. If checkpointing fails after the synthetic transaction opens, runtime marks that transaction `recoveryRequired` with compact outcome-rerun failure evidence. `active-save-facade-v2.mjs` now persists and reloads compact replacement events so v2 resume preserves replacement history without raw canaries. Focused proof: `test-repair-runtime.mjs` covers authorized, missing-snapshot, replaced-transaction propagation, replacement-transaction-required evidence, and raw-snapshot-only denial decisions; `test-core-store-v2.mjs` covers append-only hot-path shape, redaction, projection/hydration, decision transaction ids, and append-failure rollback; `test-turn-commit-coordinator-core-mechanics.mjs` covers mechanics-before-replacement ordering, missing explicit transaction fail-closed, skipped mechanics fail-closed, replacement-record failure fail-closed, and ledger CORE transaction annotation; `test-runtime-stage18-rerun-branch-recovery.mjs` covers CORE-checkpoint preview, missing artifact denial, no-ref raw-snapshot denial, checkpoint-backed no-CORE/direct compatibility rerun, and stale target transaction rejection helper; `test-chat-native-runtime-flow.mjs` covers preview no-CORE-write, public/raw pending redaction, post-commit raw exclusion, commit-time fresh transaction creation, synthetic ingress projection, checkpoint-failure recovery marking, and CORE replacement history; `test-active-save-facade-v2.mjs` covers compact replacement event reload; and `test-architecture-redesign-system-skeletons.mjs` covers the updated REPAIR boundary contract. The terminal replay, committed delete, and Scene Handshake prompt-sync follow-ups close matching replay/delete/prompt-sync actuation gates; remaining REPAIR/SRE actuation blockers are base restore internals.

- REPAIR terminal checkpoint replay actuation follow-up, July 1: `repair-runtime.mjs` now exposes `directive.repairTerminalCheckpointReplayActuationDecision.v1`, and `campaign-end-condition-service.mjs` requires that decision before replay restores a checkpoint snapshot, persists state, or syncs prompt context. Replay only accepts explicit outcome-tied checkpoint sources (`turnLedger.entries[].snapshotBefore` or matching `runtimeTracking.history[].snapshot`) and fails closed for generic history snapshots, missing REPAIR authority, or denied REPAIR policy. REPAIR receives compact refs only: decision/interaction/condition/turn/outcome ids, source kind, snapshot-present flag, runtime/ledger revisions, and a bounded replay evidence hash that ignores retained full-snapshot hashes and raw snapshot content. Runtime app now forwards `resolutionIngressId` and `resolutionHostMessageId` into terminal decision resolution so live settlement routing keeps the user reply source. `keepEnding` now fails before mutation/persist when conclusion service is unavailable. Focused proof: `test-campaign-end-condition-service.mjs` covers missing/denied REPAIR, compact evidence, full-snapshot-hash rejection, explicit outcome history replay, generic history failure, no partial keep-ending mutation, and normal replay/branch/push/keep flows; `test-repair-runtime.mjs` covers authorized and missing-snapshot terminal replay decisions plus raw-snapshot exclusion; `test-chat-turn-terminal-outcome.mjs` covers chat reply terminal decision resolution; and `test-architecture-redesign-system-skeletons.mjs` covers runtime-app terminal resolution id forwarding. Remaining terminal work is replacing old retained snapshot sources with CORE/v2 replay evidence as part of full runtime resume, not REPAIR actuation.

- REPAIR Scene Handshake prompt-sync failure follow-up, July 1: `chat-turn-orchestrator.mjs` no longer compensates a Scene Handshake prompt synchronization failure by calling the old `stateDeltaGateway.restore(...)` revision rollback. Accepted latest-pair settlement still surfaces the prompt-sync failure to the existing turn-processing failure boundary, which records `chatTurnProcessingFailure`, marks the ingress `recoveryRequired`, and writes CORE recovery evidence with `normalTurnAllowed: false` for `stage: "sceneHandshake"` before any normal classification or Director continuation can proceed. Focused proof: `test-chat-turn-orchestrator.mjs` first failed with `Scene Handshake prompt-sync failure must not use old revision restore. 1 !== 0`, then passed with zero restore calls, CORE recovery, recovery journal evidence, and no classifier/Director continuation.

- REPAIR outcome-rerun snapshot evidence follow-up, July 1/2: retained-outcome rerun authorization now receives compact `snapshotPresent` evidence in addition to `snapshotBeforeRetained`. REPAIR denies `snapshotBeforeRetained: true` when the actual retained CORE checkpoint artifact is missing, returning `outcome-rerun-snapshot-evidence-missing` before `runtime-app.mjs` can build a provisional branch. The raw snapshot does not cross into REPAIR and is no longer read after authorization; runtime builds preview only from the loaded CORE checkpoint artifact. Focused proof: `test-repair-runtime.mjs` covers retained-flag-only denial and raw-snapshot-only denial, and `test-runtime-stage18-rerun-branch-recovery.mjs` first failed with an unclassified downstream preview error before passing with `DIRECTIVE_REPAIR_RERUN_NOT_AUTHORIZED` and no new pending replacement/Director turn; a later RED failed while no-ref raw-snapshot rerun still succeeded, then passed after runtime stopped counting `ledgerEntry.snapshotBefore` as snapshot evidence.
- REPAIR rollback/delete execution follow-up, July 1: committed player-source rollback now executes through REPAIR before any old compatibility projection mutates. `repair-command-boundary.mjs` exposes `executeRollbackActuation(...)`, validates the compatibility restore candidate first, records compact rollback actuation evidence, then returns the temporary compatibility restore; `message-reconciler.mjs` calls that owner seam before touching old ingress/recovery ledgers and returns `rollbackBlocked` without state mutation, prompt sync, or persistence if CORE rollback actuation is not recorded. `core-store-v2.mjs` now exposes append-only `recordRollbackActuation(...)`, requires an active `recoveryRequired` recovery, matching transaction/recovery ids, authorized finite restore revision, and rollback-on-persist-failure; it persists `rollbackActuationRecorded` event tails plus manifests only, hydrates transaction rollback refs, projects resolved recovery rows and named `rollbackActuations`, and strips raw/replacement text canaries from source mutation, repair decision, legacy projection, and rollback actuation payloads. Same-key recovery replay after rollback now resolves to the prior rollback instead of reopening recovery. `core-turn-runtime.mjs` forwards the new method for production runtime use. Focused proof: `test-message-recovery.mjs` first failed with no CORE rollback record, then failed with old ledger mutation after a not-recorded rollback, and now proves CORE-record-before-restore plus fail-closed no-mutation behavior. `test-core-store-v2.mjs` proves append-only rollback event writes, idempotent replay, same-key recovery replay after rollback, transaction/recovery scoping, append-failure rollback, hydration/projections, resolved recovery rows, and raw/replacement text redaction across all rollback payload sections. Adjacent proof: `test-repair-runtime.mjs`, `test-chat-turn-orchestrator.mjs`, `test-chat-native-runtime-flow.mjs`, and `test-architecture-redesign-system-skeletons.mjs`.
- REPAIR committed-outcome delete rollback follow-up, July 1: visible `deleteCommittedOutcome(...)` now fails closed unless the target ledger entry has a CORE transaction id, explicit retained snapshot flag plus snapshot object, finite restore revision, REPAIR rollback authorization, recorded CORE recovery, and recorded CORE rollback actuation. The old `restoreBeforeCommittedOutcome(...)` compatibility restore runs only after those gates pass; denied REPAIR authorization, missing CORE transaction, or missing retained snapshot leaves campaign state, pending caches, old ledgers, CORE recovery projections, and rollback projections unchanged. The REPAIR boundary returns compact `directive.repairRollbackActuationDecision.v1` evidence for `committedOutcomeDeleted`, and public delete results include compact CORE recovery, REPAIR decision, and rollback actuation refs without raw snapshot/player/prompt/provider text. Focused proof: `test-runtime-stage18-rerun-branch-recovery.mjs` covers no-CORE legacy delete fail-closed, malformed CORE-backed retained-snapshot fail-closed before REPAIR/CORE/restore, denied REPAIR authorization with no CORE side effects, CORE-backed happy path rollback projection, and raw rollback payload redaction; adjacent proof passed for `test-core-store-v2.mjs`, `test-message-recovery.mjs`, `test-architecture-redesign-system-skeletons.mjs`, and syntax checks.
- REPAIR provider-failure retry/reobserve follow-up, July 1/2: chat-native provider-failure-after-mechanics now opens CORE `responseRetryRequired` through REPAIR before the fallback assistant row is posted, and `response-dispatcher.mjs` records that fallback old response projection as `responseRetryRequired` without consuming CORE's final visible-response slot. `retryCommittedResponse(...)` includes `providerFailureAfterMechanicsCommit` as a first-class REPAIR retry case but does not rerun mechanics or recommit the outcome; it regenerates only the visible response text, appends it as a selected assistant swipe on the same fallback response/outcome, and then closes CORE recovery through REPAIR's `directive.repairResponseRetryActuationDecision.v1`. Retry target validation requires current latest assistant position plus response id, outcome id, campaign id, and ledger match; non-Directive later assistant rows block stale retry. If CORE closure fails after the host swipe exists, the next retry reuses the same selected retry swipe and refuses to close CORE if the user has switched back to the fallback/original swipe. Provider error evidence is bounded and hash-only before REPAIR/CORE, retry prompt snippets and context are capped, and raw provider error canaries are excluded from recovery journals, response refs, CORE recovery bundles, and persisted state. The July 2 demotion removed the old `providerFailureAfterMechanicsCommit` recovery-journal row when CORE recovery records successfully; retry now reads CORE recovery projections plus the fallback response row and does not recreate an old resolved row after CORE closure. Focused proof: `test-chat-turn-orchestrator.mjs` covers fallback CORE-slot suppression, fallback response/ingress `responseRetryRequired`, raw provider canary redaction, no old provider-failure recovery row for CORE-backed fallback, no mechanics rerun, one-generation retry, idempotent retry-swipe reuse after CORE closure failure, stale selected-swipe rejection, later-host-assistant stale target rejection, and CORE recovery closure through REPAIR.
- SRE host-native verdict extraction follow-up, July 1: `response-dispatcher.mjs` no longer calls the continuity contradiction guard directly for host-native assistant observations. It delegates the verdict to `source-reconciliation-engine.mjs`, and injected SRE verdicts are authoritative; the default SRE facade preserves the old `ok/findings/checkedFactCount` review shape while adding bounded SRE owner metadata and source refs. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed because injected SRE was ignored, then passed by proving a contradictory host-native row is accepted when SRE returns `ok:true` and no dispatcher-local contradiction recovery is created. Later REPAIR work moved the post-verdict recovery policy behind a named REPAIR boundary, and the follow-up source-review worker slice moved host-native post-visible review orchestration into `source-review-worker.mjs`: `response-dispatcher.mjs` no longer imports `source-reconciliation-engine.mjs` directly, existing `sourceReconciliationEngine` injection is preserved through the worker, direct `sourceReviewWorker` injection is available for tests/adapters, supplied reviews require source ids plus the observed host text hash, stale `message.textHash` cannot override actual observed text, malformed/unavailable SRE output becomes sanitized fail-closed evidence, and raw finding summaries/reasons are represented only by length/hash metadata. Focused proof: `test-architecture-redesign-system-skeletons.mjs`, `test-response-dispatcher-core-bridge.mjs`, `test-source-reconciliation-engine-synthetic.mjs`, `node --check src/runtime/source-review-worker.mjs`, and `node --check src/runtime/response-dispatcher.mjs`. Review gate: quality review initially rejected raw `summary`/`reason` leakage from worker output, then approved after the worker and skeleton tests enforced hash/length-only evidence. Remaining SRE/REPAIR blockers are demoting response-dispatch compatibility projections and the terminal/prompt-sync/rerun restore work listed above.
- SRE explicit-range terminal settlement follow-up, July 1: `scene-reconciliation.mjs` now calls `sourceSettlementService.reconcileRange(...)` as the terminal SRE gate for changed explicit ranges before run-start ledger writes, Mission/scene invalidation, model extraction, or proposal apply. `hardSkipped`, `staleBeforeApply`, `repairRequired`, and `noChange` stop the old Scene Reconciliation path; only `accepted` proceeds. The persisted run/lastResult settlement evidence uses hash-only message/range refs and compact operation bundle hashes, not raw transcript text or `textPreview`. Production's default `createSourceSettlementService()` does not expose terminal `reconcileRange` unless both a real range provider and apply owner are supplied, so an unconfigured service cannot silently convert Scene Reconciliation into a no-op terminal SRE. Failed apply results return `repairRequired`, including empty-operation terminal attempts. Focused proof: `test-scene-reconciliation.mjs` covers terminal settlement ordering, hard-skip stop, stale-before-apply stop, accepted apply ordering, and raw-text exclusion; `test-source-reconciliation-engine-synthetic.mjs` covers default/provider-only/apply-only terminal exposure guards plus failed apply semantics in both the service and synthetic engine. Adjacent proof: `test-scene-reconciliation-open-world.mjs`, `test-response-dispatcher-core-bridge.mjs`, `test-message-recovery.mjs`, `test-repair-runtime.mjs`, and `test-scene-handshake-settler.mjs`.
- SRE latest-pair selected-variant preflight follow-up, July 1: chat-native ingress Frames now carry the previous non-system, non-Directive assistant selected-swipe hash and source-integrity status before Scene Handshake runs. `settleSceneHandshake(...)` treats SRE `preflightLatestPair(...)` as a blocking source-integrity gate: non-clean status stops Scene Handshake provider calls, old proposal apply, and prompt sync while letting the normal player turn continue to classification. The preflight compares the stored Frame hash against a freshly observed previous-assistant selected hash so the check is not tautological; selected and visible swipe text are normalized through the same display-safe path before hashing; system rows are excluded through normalized and raw flags; activity/diagnostics stay hash/status/reason only. `createSourceSettlementService.settleLatestPair(...)` also now refuses operation-bearing provider results without a real apply owner by returning `repairRequired` with `source-settlement-apply-owner-missing`, so terminal latest-pair wiring cannot accidentally report durable apply through the default no-op apply function. Focused proof: `test-chat-turn-orchestrator.mjs` covers harmless whitespace, fresh selected-hash drift, system-row skip, hard-skip blocking before Scene Handshake provider/apply, and raw-text exclusion from activity; `test-source-reconciliation-engine-synthetic.mjs` covers latest-pair provider-only apply-owner failure. Reviewer gate: spec and quality reviewers passed after the system-row, normalization, and non-tautological hash checks were added. Later SRE follow-ups closed production default role wiring and direct production caller retirement; host-native contradiction still needs compatibility-projection demotion after the later REPAIR boundary slice.
- SRE terminal latest-pair owner-boundary follow-up, July 1: `runSceneHandshakeSettlement(...)` now accepts an opt-in `runLatestPairSettlementProvider`, caller `latestPairSourceFrame`, and stale-before-apply validator. When configured through `chat-turn-orchestrator`, terminal latest-pair SRE consumes the ingress `directive.turnSourceFrame.v1`, stops `hardSkipped`, `staleBeforeApply`, `repairRequired`, and `noChange` decisions without falling through to the legacy Scene Handshake provider, applies accepted operations once through `stateDeltaGateway.applyOperations({ source: "sourceSettlement" })`, records `metadata.sourceOwner: "sre"` on the Scene Handshake last result, derives dirty roots from applied operation paths rather than provider-declared domains, converts provider/validate/apply throws into compact SRE decisions, and preserves accepted-scene time advancement by calling the existing time-boundary owner once after SRE apply. Focused proof: `test-scene-handshake-settler.mjs` covers accepted, provider throw, misleading domain/prompt dirty roots, stale-before-apply, repair-required apply failure, no-change, hard-skip, and accepted time advancement; `test-chat-turn-orchestrator.mjs` proves a configured terminal SRE provider replaces legacy `sceneHandshakeSettler` generation in the real turn path; `test-source-reconciliation-engine-synthetic.mjs`, `test-scene-reconciliation.mjs`, `test-chat-turn-orchestrator.mjs`, and `test-architecture-redesign-system-skeletons.mjs` stayed green. Reviewer gate: spec and quality reviewers approved after the stale/repair settled-ledger assertions and no-double-apply orchestration test were added. Remaining SRE work at that point was production-default role wiring; the owner-boundary safety seam is closed at focused-test depth.
- SRE production-default latest-pair provider follow-up, July 1: `chat-turn-orchestrator.mjs` now creates a default `createLatestPairSreSettlementProvider(...)` when a turn path has `generationRouter.generate` but no injected latest-pair provider. The provider uses the dedicated `sourceSettlementLatestPair` Utility role and model-call authority row, reuses Scene Handshake settlement parsing/validation, returns only validator-derived operations, records SRE ownership/model-role evidence, and strips raw provider/player/prompt text from persisted diagnostics. Missing apply owner and provider throw/empty/invalid output stay inside SRE as `repairRequired` diagnostics and do not fall through to legacy `sceneHandshakeSettler`; provider throws use fixed sanitized messages so raw upstream errors cannot persist. Focused proof: `test-chat-turn-orchestrator.mjs` covers production default happy path, no-apply-owner fail-closed behavior, raw provider-throw canary redaction, stale/hard-skip preflight blocking before either provider role, and no legacy role call; `test-scene-handshake-settler.mjs`, `test-sillytavern-runtime-lifecycle.mjs`, `test-source-reconciliation-engine-synthetic.mjs`, `test-architecture-redesign-system-skeletons.mjs`, `test-model-call-authority-matrix.mjs`, `test-response-dispatcher-core-bridge.mjs`, and `test-repair-runtime.mjs` stayed green. Reviewer gate: spec and quality reviewers passed after the no-apply-owner and sanitized-error regressions were added. Direct production caller retirement is now closed by the `source-settlement-latest-pair` owner adapter; remaining latest-pair debt is replacing that adapter's internal delegation with native SRE mode code when broader SRE cutover is ready.
- REPAIR host-native contradiction boundary follow-up, July 1: response dispatch still observes host-native assistant rows and SRE still produces the host-native continuity verdict, but post-verdict recovery now enters a named REPAIR boundary (`handleHostNativeContinuityContradiction` / `recordHostNativeContinuityContradiction`) before compatibility response/recovery projections are updated. The immediate observed-message path no longer has its own inline contradiction recovery/quarantine/hint block; it reuses the same `settleHostNativeContinuityContradiction(...)` helper as async callback and reobserve paths, passes the precomputed SRE verdict into that helper, and lets the helper record rejected-claim quarantine, projection hints, fact-use stats, recovery journal, ingress status, and CORE recovery from the REPAIR decision. This slice extends that bridge so REPAIR may return a compact `compatibilityProjection` bundle for host-native continuity contradictions; `response-dispatcher.mjs` mirrors that REPAIR-owned bundle for rejected-claim refs, projection hints, fact-use stats, recovery journal entry, and ingress patch instead of rebuilding those policy shapes locally, while falling back to the old local construction when no bundle is supplied. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed with the REPAIR canary bundle present on `coreRecovery.compatibilityProjection` while the dispatcher still wrote its hard-coded recovery event, then passed with the dispatcher mirroring the REPAIR-supplied canary recovery id/action/allowed actions, ingress error, rejected-claim ref, hint, and fact-use stats without raw observed assistant text. Adjacent check passed for `test-repair-runtime.mjs`. Remaining limit: dispatcher still physically mirrors temporary compatibility projections during migration; REPAIR can now own the projection shape/policy, but the compatibility response ledger/recovery journal/quarantine/hint surfaces still need to become CORE/REPAIR read projections before final cutover.
- REPAIR dependent invalidation follow-up, July 1/2: `MessageReconciler` no longer discovers Scene Handshake or Mission Component dependents locally after source edits/deletes. Tracked ingress/response mutations and untracked host-row source mutations now call REPAIR first with current campaign state, and REPAIR returns a compact `directive.repairDependentInvalidation.v1` projection containing only Scene Handshake settlement ids, Mission Component ids, target source status, and prompt dirty domains. The old compatibility ledgers still mirror the projected invalidation during migration, but they apply only REPAIR-returned ids/statuses and do not store raw replacement text in dependent invalidation records. Missing REPAIR source handlers fail closed as `repair-source-mutation-unavailable` without mutating dependents, and repeated edit/delete ordering cannot downgrade a deleted Mission Component back to stale. The July 2 demotion removed the old recovery-journal mirrors for those dependent projections: no `sceneHandshakeSourceInvalidated`, `missionComponentSourceEdited`, or `missionComponentSourceDeleted` row is appended for tracked or untracked REPAIR-owned dependent invalidation. Focused proof: `test-message-recovery.mjs` covers untracked assistant source mutation, REPAIR call evidence, sentinel-only dependency application, no raw replacement-text persistence, stale-over-deleted protection, missing-handler no-throw/no-mutation behavior, and no old dependent recovery rows; `test-repair-runtime.mjs` covers real projection discovery, untracked source kind, hash-only replacement text, deleted target status, and stale-after-deleted filtering; `test-architecture-redesign-system-skeletons.mjs` statically rejects those old dependent recovery row types in production `message-reconciler.mjs`. Reviewer gate: spec reviewer passed, quality reviewer initially rejected the deleted-to-stale and missing-handler cases, then approved after regression tests and guards were added. Remaining REPAIR/SRE work is base restore internals, host/provider response-recovery output demotion, and proof-pipeline consumers that still wait on old recovery-count deltas.
- Terminal replay CORE checkpoint source cutover, July 1: `campaign-end-condition-service.mjs` now writes or reuses a CORE/v2 terminal replay checkpoint artifact when a terminal decision is detected, stores only a compact `directive.coreTerminalReplayCheckpointRef.v1` on the detection, decision, and pending interaction, and requires that ref during replay. Production `runtime-app.mjs` wires the producer to `writeV2Checkpoint(... layout: "core")` and the consumer to `loadV2Checkpoint(... layout: "core")`. `transaction-store-v2.mjs` now lets event/turn hot appends include checkpoint artifacts without rewriting active-save manifests. `core-store-v2.mjs` now lets `commitMechanics(...)` append one CORE mechanics pre-outcome checkpoint artifact beside the mechanics event/turn delta, records only compact `coreCheckpointRef` on turn records and mechanics event refs, and keeps the raw pre-outcome state out of turn/event projections. `turn-commit-coordinator.mjs` now sends `checkpointBefore` from the pre-outcome campaign state and mirrors the returned compact ref into the compatibility turn ledger and `lastCommittedTurn`. Terminal detection reuses that existing CORE mechanics ref without duplicating a terminal checkpoint artifact. Replay no longer falls back to `turnLedger.snapshotBefore`, outcome-tied `runtimeTracking.history`, generic stable history, or any other old snapshot surface. REPAIR receives only bounded source kind/revision/hash evidence before restore, persist, or prompt sync. Focused proof: `test-transaction-store-v2.mjs` first failed until checkpoint refs appended through the CORE layout manifest; `test-core-store-v2.mjs` first failed until `commitMechanics(...)` wrote the checkpoint artifact and projected the compact ref; `test-turn-commit-coordinator-core-mechanics.mjs` first failed until the coordinator passed pre-outcome `checkpointBefore` and stored the returned ref; `test-campaign-end-condition-service.mjs` first failed until terminal detection reused existing CORE mechanics refs without writer calls, and previously proved ref-only replay. `test-architecture-redesign-system-skeletons.mjs` first failed until runtime-app imported both `loadV2Checkpoint` and `writeV2Checkpoint` and passed both terminal checkpoint seams into the service.
- Outcome rerun CORE checkpoint preview follow-up, July 1/2: `runtime-app.mjs` now loads a committed outcome's compact `coreCheckpointRef` through `loadV2Checkpoint(... layout: "core")` before asking REPAIR to authorize rerun preview. REPAIR still receives compact evidence only (`snapshotPresent`, source kind, and checkpoint ref), and the pre-outcome campaign state used for provisional branch preview comes only from the loaded CORE checkpoint artifact. If the checkpoint artifact or checkpoint ref is missing, rerun is denied as `outcome-rerun-snapshot-evidence-missing` even when old raw `snapshotBefore` is still present. Focused proof: `test-runtime-stage18-rerun-branch-recovery.mjs` first failed when a raw-less ledger entry with a valid CORE checkpoint ref still reported `snapshotPresent: false`, then passed after the runtime loaded the CORE checkpoint artifact and kept the old missing-snapshot denial intact; a later RED failed while no-ref raw-snapshot rerun still succeeded, then passed after runtime stopped using raw `snapshotBefore` as preview source/evidence.
- Host-native contradiction recovery demotion follow-up, July 1: `response-dispatcher.mjs` still mirrors response, ingress, rejected-claim, projection-hint, and fact-use compatibility surfaces during migration, but valid REPAIR-owned host-native continuity contradiction recovery rows no longer write into old `runtimeTracking.recoveryJournal`. Those recovery rows are read from CORE recovery projections instead; invalid/missing REPAIR projection fallbacks still use the temporary sanitized compatibility recovery row until the next demotion slice. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed while REPAIR-owned contradiction projections still appended old recovery rows, then passed after valid immediate, async, reobserve, REPAIR-owned, and release-failure contradiction cases asserted CORE `readProjections().recoveryJournal` as recovery authority while keeping the distinct CORE-release-failure recovery bridge intact.
- Host-native contradiction ingress projection demotion follow-up, July 1: CORE `readProjections().ingressLedger[]` now exposes active recovery refs for valid CORE-backed contradiction cases (`recoveryId`, `recoveryStatus`, `recoveryReason`, `recoveryPhase`, and allowed actions), and `response-dispatcher.mjs` skips REPAIR compatibility `ingressPatch` writes when CORE recorded the recovery. Response-ledger `recoveryId` and the dispatch result now prefer the recorded CORE recovery case id rather than a skipped compatibility-projection id. Invalid or missing CORE projection fallbacks still use the sanitized old ingress patch. Review follow-up also rejected nested raw-text REPAIR compatibility bundles before mirroring rejected claims, projection hints, or fact-use stats; those cases fall back to the sanitized hash-only projection. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed because CORE ingress projections lacked recovery ids, then failed again when response/dispatch recovery ids pointed at the skipped compatibility id and nested `rawText` could persist through supplied projections, then passed after REPAIR-owned, raw-nested, and CORE-release-failure contradiction cases asserted old `runtimeTracking.ingressLedger` stayed clean, CORE ingress projections carried recovery authority, response/dispatch ids used CORE recovery, and raw canaries were absent from state, dispatch output, and CORE. Adjacent proof: `test-core-store-v2.mjs`, `test-chat-turn-orchestrator.mjs`, `test-chat-native-runtime-flow.mjs`, `test-repair-runtime.mjs`, and `test-active-save-facade-v2.mjs`.
- Host-native contradiction continuity projection demotion follow-up, July 1/2: CORE recovery events now store compact continuity evidence and `buildCoreStoreReadProjections(...)` exposes it as `continuityRecoveryProjection` with rejected-claim refs, projection hints, and fact-use stats when REPAIR supplies durable proof. For CORE-recorded host-native continuity contradictions, `response-dispatcher.mjs` no longer mirrors REPAIR compatibility projections into old `state.continuity.rejectedClaims`, `state.continuity.projectionHints`, or `state.continuity.factUseStats`, even when the REPAIR projection is valid but lacks durable continuity-projection proof. CORE projection compaction recursively strips raw-bearing prose fields before storing/exposing `continuityRecoveryProjection`; invalid raw supplied projections are rejected before any old continuity mirror. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed because `continuityRecoveryProjection` was missing, then passed after the REPAIR-owned contradiction asserted CORE rejected-claim/hint/fact-use evidence, old continuity state stayed clean, raw observed assistant prose stayed absent, and existing recovery/ingress demotion invariants held. Follow-ups then failed on raw CORE projection leakage, missing durable-projection old continuity mirroring, and accepted host-native candidate quarantine; they passed after CORE-recorded contradictions and SRE-approved host-native completions stopped writing old continuity/quarantine roots. Adjacent proof: `test-core-store-v2.mjs`, `test-response-dispatcher-core-bridge.mjs`, `test-repair-runtime.mjs`, `test-chat-turn-orchestrator.mjs`, `test-chat-native-runtime-flow.mjs`, and `test-active-save-facade-v2.mjs`.
- Host-native contradiction response/recovery projection demotion follow-up, July 2: CORE-backed host-native continuity contradictions no longer copy recovery status, `coreRecovery`, or full SRE continuity review payloads into old `runtimeTracking.responseLedger` rows once CORE records recovery; those rows become bridge-only `coreRecoveryProjected` markers with hash-only host observation fields, while duplicate dispatch/reobserve reads CORE `recoveryJournal` projections by transaction id to return recovery-required status and the CORE recovery id. Missing/invalid/absent REPAIR compatibility projections and SRE-review failures with no durable continuity-fact projection also no longer make response dispatch write old `runtimeTracking.recoveryJournal`, patch old `runtimeTracking.ingressLedger`, or keep old response-row recovery payloads when CORE recovery was recorded; CORE recovery is considered authoritative independent of compatibility-projection validity or continuity-projection presence. SRE/CORE writer failures still keep a sanitized old bridge only when CORE did not record durable recovery or a compact CORE diagnostic. The final dispatcher-local claim-quarantine fallback is now retired: `response-dispatcher.mjs` no longer imports `claim-quarantine.mjs` or calls `quarantineGeneratedClaims(...)`, and `test-architecture-redesign-system-skeletons.mjs` guards that boundary. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed while old response rows stayed `recoveryRequired`, then passed after immediate, async, reobserve, and REPAIR-owned valid contradiction cases asserted bridge-only old response rows and CORE-driven duplicate recovery results. Follow-up RED assertions for raw, empty, and absent REPAIR compatibility projections failed while sanitized old recovery/ingress fallbacks were written, then passed after `coreBackedRecoveryRecorded` stopped depending on compatibility projection validity; a later SRE-review failure RED failed while the CORE-recorded no-fact lane still kept old `recoveryRequired` row authority, then passed after the row became bridge-only without old ingress/recovery journal writes. A static RED then failed while the old generated-claim quarantine import remained in response dispatch, and passed after the dead fallback was removed.
- Host-native contradiction writer-failure diagnostic follow-up, July 2: when REPAIR/CORE contradiction recovery writing throws before CORE recovery can be recorded, response dispatch now appends a compact CORE diagnostic row (`worker: "hostNativeContinuityRecovery"`, `status: "failed"`) on the transaction and uses that diagnostic plus a bridge-only response row as the failure bridge. The diagnostic stores response/ingress/transaction refs, observed-message hash, hashed error evidence, and compact repair policy refs, not raw observed text or raw thrown error strings. Once that diagnostic is recorded, response dispatch no longer opens old `runtimeTracking.recoveryJournal` entries, patches old ingress recovery status/id, or stores copied `coreRecoveryError` / full continuity review payloads on the response row for the writer-failure lane. The old response row is now `coreRecoveryDiagnosticProjected`, duplicate dispatch reads CORE diagnostics by response/transaction id, and dispatch returns the stable response recovery id without trusting old row status as authority. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed because the REPAIR writer-throw lane had no CORE-side evidence before old fallback, then failed while old recovery/ingress authority was still written despite the diagnostic, then failed while the response row remained `recoveryRequired`, and passed after the diagnostic appeared in `coreStore.readProjections().sidecarDiagnostics`, duplicate dispatch read that diagnostic, old response payloads/recovery/ingress stayed clean, and raw canaries stayed absent from state, dispatch output, and CORE.
- Host-native accepted response candidate-quarantine demotion follow-up, July 2: SRE-approved host-native responses no longer write dispatcher-local `continuity.candidateClaims` through `quarantineGeneratedClaims(...)`. The response row still records the sanitized SRE review for bridge visibility, but accepted generated-content candidate extraction is no longer durable old-continuity authority on the host-native response path. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed because the SRE-ok host-native response wrote a candidate quarantine claim, then passed after `response-dispatcher.mjs` stopped writing candidate quarantine for accepted host-native completions.
- Committed outcome delete CORE checkpoint restore follow-up, July 2: `runtime-app.deleteCommittedOutcome(...)` now requires the outcome's `coreCheckpointRef`, loads the CORE/v2 checkpoint artifact, and restores from that artifact after REPAIR/CORE rollback actuation records. A raw `turnLedger.entries[].snapshotBefore` is no longer a no-ref delete fallback; missing refs and missing artifacts reject before REPAIR authorization, CORE recovery writes, CORE rollback writes, or old restore. Focused proof: `test-runtime-stage18-rerun-branch-recovery.mjs` first failed because delete restored the old raw snapshot and lost a CORE checkpoint canary, then passed after the delete path restored the canary from the CORE checkpoint artifact while preserving rollback actuation evidence and raw-payload redaction. Reviewer follow-up added a second focused regression where the CORE ref points at a missing checkpoint while the old raw snapshot is still present; delete rejected before REPAIR authorization, CORE recovery writes, CORE rollback writes, or old snapshot restore. A later RED failed while a CORE-backed no-ref delete still succeeded through raw `snapshotBefore`; it passed after delete required `DIRECTIVE_REPAIR_DELETE_OUTCOME_CORE_CHECKPOINT_REQUIRED` before any REPAIR/CORE side effect.
- Pure turn-ledger raw snapshot removal follow-up, July 2: `commitDirectorTurn(...)` no longer creates raw `turnLedger.entries[].snapshotBefore` payloads or marks pure commits as retained-snapshot capable. The compatibility `editCommittedOutcome(...)` and `deleteCommittedOutcome(...)` helpers now fail closed with `DIRECTIVE_CORE_CHECKPOINT_ACTUATION_REQUIRED`, and `turn-commit-coordinator.mjs` marks `snapshotBeforeRetained` only when CORE mechanics returns a compact checkpoint ref. Focused proof: `test-transaction-state.mjs` first failed while pure commits still stored raw snapshots and edit/delete restored them, then passed with raw-free turn ledgers, CORE-checkpoint-required pure edit/delete, and no nested runtime/recovery ledgers inside retained turn packets. `test-runtime-stage18-rerun-branch-recovery.mjs` was updated to build rerun/delete fixtures from explicit CORE checkpoint artifacts or raw-free checkpoint refs rather than old raw ledger snapshots; adjacent proof passed for `test-turn-commit-coordinator-core-mechanics.mjs`, `test-repair-runtime.mjs`, and `test-chat-native-runtime-flow.mjs`. This closes new normal-turn raw snapshot growth; remaining snapshot authority work is older base-restore/history helpers.

- No-CORE outcome rerun compatibility removal follow-up, July 2: REPAIR now denies outcome rerun unless the target ledger entry has an original CORE transaction (`replacedTransactionId` / replacement authority), and runtime no longer has a no-CORE replacement transaction bypass or old bounded `turnLedger.replacementHistory` write path for rerun commits. `core-store-v2.mjs` and `active-save-facade-v2.mjs` no longer persist or project `legacyNoCoreRerunAllowed`; replacement history comes from CORE `outcomeReplacementRecorded` projections. Focused proof: `test-repair-runtime.mjs` first failed while a retained no-CORE outcome still authorized rerun, then passed after REPAIR returned `outcome-rerun-core-transaction-missing` and omitted the legacy flag. `test-runtime-stage18-rerun-branch-recovery.mjs` then moved replacement-history assertions to CORE projections, proved CORE-backed rerun replacement still records `replacedTransactionId`, and exposed the branch-local CORE artifact gap that the follow-up closed. Adjacent proof passed for `test-chat-native-runtime-flow.mjs`, `test-core-store-v2.mjs`, `test-active-save-facade-v2.mjs`, `test-turn-commit-coordinator-core-mechanics.mjs`, `test-storage-scale-5000.mjs`, `test-architecture-redesign-system-skeletons.mjs`, and `verify-repo-structure.mjs`.

- Save As branch CORE clone follow-up, July 2: `core-store-v2.mjs` now exports `copyCoreStoreStateV2ForSaveBranch(...)`, which loads the source save's CORE layout, retargets save/chat/branch refs, copies event/turn/diagnostic segments, and rewrites referenced CORE checkpoint artifacts into the branch-local `core` layout. `runtime-app.saveCurrentGameAs(...)` calls that helper after cloned chat binding exists and before prompt rebuild/final branch save can observe branch CORE projections. Focused proof: `test-runtime-stage18-rerun-branch-recovery.mjs` first failed because `campaigns/<campaign>/saves/<branch>/core/save-manifest.v2.json` did not exist, then passed after the branch save loaded branch-local CORE state containing the copied transaction and a branch-local checkpoint snapshot whose `campaignChatBinding.saveId` points at the branch save. Adjacent proof passed for `test-core-store-v2.mjs`, `test-active-save-facade-v2.mjs`, `test-chat-native-runtime-flow.mjs`, and `test-storage-scale-5000.mjs`.

- REPAIR history-only rollback fail-closed follow-up, July 2: `repair-command-boundary.mjs` no longer imports or calls `restoreTrackedCampaignRevision(...)` for rollback execution. A rollback actuation now requires supplied CORE checkpoint restore state; if only old `runtimeTracking.history` exists, execution returns `rollback-core-checkpoint-required` / `DIRECTIVE_REPAIR_ROLLBACK_CORE_CHECKPOINT_REQUIRED` before CORE rollback actuation recording, old-ledger mutation, persistence, or prompt synchronization. Focused proof: `test-architecture-redesign-system-skeletons.mjs` first failed while a history-only rollback still applied, then passed after REPAIR blocked it. `test-message-recovery.mjs` was updated from the old rollback expectation to assert committed player delete with old history and no CORE checkpoint returns `rollbackBlocked`, preserves phase-after state, records no `restoreRevision`, does not append rollback actuation, and performs no persist or prompt sync. Syntax proof passed for `repair-command-boundary.mjs`. Remaining work is checkpoint-backed source-mutation rollback handoff, not restoring from base history.

- Checkpoint-backed source-mutation rollback handoff, July 2: `message-reconciler.mjs` now resolves a committed player source's compact CORE checkpoint ref from ingress/turn-ledger/history metadata, asks an injected `loadCoreCheckpointState(...)` seam for the checkpoint artifact state, and passes that state plus the compact ref into REPAIR rollback execution. `runtime-app.mjs` wires the seam to the existing v2 CORE checkpoint loader through `loadOutcomeRerunCheckpointSnapshot(...)`, so player-source delete rollback no longer depends on old `runtimeTracking.history` snapshots. Focused proof: `test-message-recovery.mjs` first failed with `rollbackBlocked` for a source turn carrying `coreCheckpointRef`, then passed after the loader seam restored the CORE checkpoint state, recorded CORE rollback actuation before assigning restored state, removed post-outcome facts/logs, marked the source recovery-required/deleted, persisted once for recovery and once for prompt sync, and kept the previous history-only rollback blocked. `test-architecture-redesign-system-skeletons.mjs` now statically guards both the runtime loader wiring and the checkpoint-state handoff into REPAIR. Syntax proof passed for `message-reconciler.mjs` and `runtime-app.mjs`.

- Checkpoint rollback restore-journal demotion, July 2: `repair-command-boundary.mjs` now restores checkpoint-backed source rollback without appending an old `runtimeTracking.recoveryJournal` row of type `restoreRevision`. CORE rollback actuation remains the durable restore evidence, and `MessageReconciler` still applies the source mutation projection after the restored checkpoint state. Focused proof: `test-message-recovery.mjs` first failed while checkpoint-backed rollback still appended `restoreRevision`, then passed after the executor preserved existing recovery rows without adding the old restore marker. `test-architecture-redesign-system-skeletons.mjs` now statically rejects `type: "restoreRevision"` inside `repair-command-boundary.mjs`, and `test-repair-runtime.mjs` stayed green for CORE-first recovery/rollback policy.

- CORE-recorded source-mutation recovery demotion, July 2: `message-reconciler.mjs` now detects recorded CORE recovery cases and skips old `runtimeTracking.recoveryJournal` writes for committed player-message edits/deletes, Directive-response edits/deletes, and selected-swipe source mutations. The bridge still applies ingress/response status projections and dependent invalidation projections after REPAIR decides the action, but recovery case details stay in CORE projections. Focused proof: `test-message-recovery.mjs` first failed while committed player edit still wrote old `playerMessageEdited` recovery rows, then passed after old recovery rows disappeared for committed player, response, delete, and selected-swipe source mutations while CORE recovery bundles retained compact decision/source evidence. `test-chat-native-runtime-flow.mjs` now proves runtime player/assistant recovery paths persist CORE projections and do not expose old recoveryJournal rows for CORE-recorded edit/delete recoveries. `test-architecture-redesign-system-skeletons.mjs` statically guards the `coreRecoveryRecorded(...)` gate around `recordRecoveryEvent(...)`.

- CORE-backed turn-processing recovery demotion, July 2: `chat-turn-orchestrator.mjs` now records CORE turn-processing recovery first and skips the old `chatTurnProcessingFailure` recoveryJournal row when that CORE recovery exists. The failed ingress retains `recoveryId`, compact `coreRecovery`, status, classification, and error for runtime visibility. Source reobserve/retry now passes `priorRecoveryId` from the prior ingress into `supersedeLatestSourceTransaction(...)`, so the CORE source-restart closure no longer depends on an old recovery row. Focused proof: `test-chat-turn-orchestrator.mjs` first failed while Scene Handshake prompt-sync failure still wrote an old recovery row, then passed after prompt-sync/classifier failures kept CORE recovery and ingress projection only. The classifier retry regression first exposed missing `priorRecoveryId` after the old row was removed, then passed after restart closure used the ingress recovery id. `test-chat-native-runtime-flow.mjs` and `test-message-recovery.mjs` stayed green.
- REPAIR dependent-invalidation recovery demotion, July 2: `message-reconciler.mjs` now treats `directive.repairDependentInvalidation.v1` as owner-returned projection output only. Scene Handshake settlements, derived assignments/log/thread rows, and Mission Component source statuses still update for bridge visibility and prompt dirtying, but the reconciler no longer writes old `sceneHandshakeSourceInvalidated`, `missionComponentSourceEdited`, or `missionComponentSourceDeleted` recovery-journal rows for tracked or untracked source mutations. Focused proof: `test-message-recovery.mjs` first failed while the Scene Handshake dependent projection still appended `sceneHandshakeSourceInvalidated`, then passed after Scene Handshake and Mission Component dependent projections kept status/source changes without old recovery rows. `test-architecture-redesign-system-skeletons.mjs` now statically rejects those old dependent recovery type strings in production `message-reconciler.mjs`; `test-repair-runtime.mjs` stayed green. Read-only agent review found no non-test source dependency on the exact old row types, but flagged live mutation proof scripts that still watch generic `recoveryCount` deltas as proof-pipeline debt.
- CORE-backed host-native unavailable/failed recovery demotion, July 2: `response-dispatcher.mjs` now skips old `runtimeTracking.recoveryJournal` rows for host-native assistant unavailable and host-native generation failed observations when CORE recovery records successfully. The old response ledger row remains a bridge-visible status projection (`unavailable` or `responseRetryRequired`) with compact CORE recovery refs, while the REPAIR decision, allowed actions, recovery phase, and later response-reobserve resolution live in CORE projections. `findResponseRecovery(...)` now reads `coreTurnStore.readProjections().recoveryJournal` before old rows, so delayed host-native reobserve can authorize closure through REPAIR without recreating an old open/resolved recovery row. Focused proof: `test-response-dispatcher-core-bridge.mjs` first failed while unavailable still wrote an old `hostNativeAssistantUnavailable` row, then passed after unavailable, sentinel REPAIR policy, failed, and delayed failed/unavailable reobserve cases asserted CORE projections and no old recovery rows. `test-chat-turn-orchestrator.mjs`, `test-chat-native-runtime-flow.mjs`, `test-repair-runtime.mjs`, and `node --check src/runtime/response-dispatcher.mjs` stayed green.
- CORE-backed provider-failure-after-mechanics recovery demotion, July 2: `chat-turn-orchestrator.mjs` now skips old `runtimeTracking.recoveryJournal` rows for `providerFailureAfterMechanicsCommit` when CORE recovery records successfully. The fallback assistant row and ingress remain bridge-visible as `responseRetryRequired`, but retry authority is found through CORE `readProjections().recoveryJournal` plus the fallback response row. Provider-failure retry still appends a selected assistant swipe, validates target freshness, closes CORE through REPAIR retry actuation, and does not rerun mechanics. Focused proof: `test-chat-turn-orchestrator.mjs` first failed while the fallback still expected an old provider-failure row, then passed after the test asserted CORE projection authority, no old open/resolved row, idempotent retry-swipe reuse after CORE closure failure, and CORE recovery resolution. `test-chat-native-runtime-flow.mjs`, `test-response-dispatcher-core-bridge.mjs`, `test-repair-runtime.mjs`, and `node --check src/runtime/chat-turn-orchestrator.mjs` stayed green.
- SRE latest-pair caller-retirement follow-up, July 1: production `chat-turn-orchestrator.mjs` no longer imports `scene-handshake-settler.mjs` or references `runSceneHandshakeSettlement(...)` directly. It now creates the default latest-pair provider through `createLatestPairSourceSettlementProvider(...)` and calls `settleLatestPairSource(...)` from `source-settlement-latest-pair.mjs`, so the production caller depends on the SRE/latest-pair owner boundary. The new owner adapter still delegates internally to the legacy settler during migration; that debt is explicit and no longer leaks through the orchestrator dependency boundary. Focused proof: `test-architecture-redesign-system-skeletons.mjs` fails if the orchestrator imports the legacy settler, references `runSceneHandshakeSettlement(...)`, omits the owner adapter import, or if the owner adapter/exports are missing. Adjacent proof: `test-chat-turn-orchestrator.mjs`, `test-scene-handshake-settler.mjs`, `test-model-call-authority-matrix.mjs`, `node --check src/runtime/source-settlement-latest-pair.mjs`, and `git diff --check` for the changed slice. Reviewer gate: spec and quality reviewers approved the boundary, role ownership, fail-closed behavior, and migration adapter shape.
- FORGE scene/phase seal vertical, first macro slice: `src/jobs/forge-scene-phase-seal.mjs` now creates compact scene/phase seal refs, Recall Index entry refs, witness/correction refs, and LENS dirty domains without storing raw transcript, prompt, provider, witness, or correction text. `createForgeCoordinator(...).settleScenePhaseSeal(...)` settles that accepted worker result through one CORE `backgroundBatchCommitted` event; `forge-contracts.mjs` preserves safe effect-ref metadata for generic FORGE workers, derives scene seal / recall entry refs and recall revisions, and redacts `providerOutput`; CORE read projections expose `sceneSealRefs` and `recallIndex.revision` from background events. Focused proof: `test-forge-scene-phase-seal.mjs` covers generic and dedicated FORGE paths, CORE projection/reload, Recall Index query inclusion, LENS budget trace cache inputs, idempotent replay, stale-source skip, and raw-payload canaries. Remaining FORGE work is broader trigger coverage and auxiliary seal/digest/recall artifact storage beyond refs.
- FORGE/LENS runtime seal, pressure/arc digest, and open-world boundary follow-up, June 30: LENS prompt scheduling now treats `recallIndexRevision`, `sceneSealRevision`, and `pressureArcDigestRevision` as explicit cache inputs, not dirty domains. CORE read projections expose canonical `sceneSealRevision`, `pressureArcDigestRefs`, and `pressureArcDigestRevision`; FORGE forwards derived `recallRevisions` into background LENS flushes; runtime prompt sync reads Recall/scene-seal/pressure-digest revisions from CORE projections; and runtime-created FORGE now receives the real LENS scheduler plus a source-current guard that rejects missing, edited, deleted, invalidated, superseded, or mismatched ingress records. `chat-turn-orchestrator.mjs` queues provider-free scene/phase seal settlement after a committed visible Directive turn when the committed turn carries phase/scene/location boundary evidence, queues provider-free pressure/arc digest settlement after committed visible turns with pressure, thread, mission, command, or consequence signals, and queues provider-free open-world boundary settlement when the committed turn includes an already-applied `openWorld.reducerBundle`; none of these paths block visible response posting. Focused proof: `test-chat-turn-orchestrator.mjs` covers the nonblocking committed-turn triggers, compact source/outcome ids, duplicate-observation idempotency, and raw-message exclusion; `test-architecture-redesign-system-skeletons.mjs` covers revision-aware LENS cache reuse/rebuild; `test-forge-scene-phase-seal.mjs`, `test-forge-pressure-arc-digest.mjs`, and `test-forge-open-world-boundary-settlement.mjs` cover FORGE-to-LENS handoff, CORE projection/reload, idempotent replay, stale-source skip, effect-only settlement, and raw-payload canaries. Full deterministic proof after the open-world boundary follow-up: `node tools\scripts\run-alpha-gate.mjs` passed 201 checks. Remaining FORGE work is broader location/time-boundary trigger coverage, auxiliary digest/recall-entry artifact storage beyond refs, and pressure/arc digest trigger expansion beyond committed visible turns.
- Internal FORGE settlement bridge, June 30: `createForgeCoordinator(...).settleInternalBackgroundBatch(...)` now lets specialized runtime background bridges settle prebuilt zero-operation effect bundles through the same source-checked FORGE/CORE/LENS path instead of direct ad hoc CORE commits. Command Log assisted summaries, Narrative Thread extraction, advisory enrichment, and terminal checkpoint post/resolution settlement now route through the shared runtime helper, which uses the runtime FORGE coordinator when initialized and falls back only before that coordinator exists. The path source-checks transaction/source-frame identity before commit, records FORGE diagnostics with counts and hashes only, preserves idempotent replay, optionally flushes LENS, and keeps raw prompt/provider/external-context fields out of persisted and cached settlement results. Focused proof: `test-forge-internal-background-settlement.mjs` covers CORE projection/reload, LENS handoff, replay idempotency, stale-source skip, and raw canaries; `test-chat-native-runtime-flow.mjs`, `test-runtime-host-injection.mjs`, and `test-chat-turn-terminal-outcome.mjs` cover the migrated runtime bridge surfaces.
- Accepted regular sidecar bridge-safety closeout, June 30, superseded July 1: accepted effectful regular sidecar batches now use a FORGE prepare / non-mutating old projection validation / final CORE settlement protocol instead of treating every worker as an independently durable v1 sidecar result. `campaign-sidecar-scheduler.mjs` computes one accepted-batch hash from the accepted worker results, requires final settlement evidence to match the CORE transaction id, background batch id, idempotency key, and `acceptedBatchHash`, and no longer lets the old compatibility projection mutate or persist ordinary domain roots before or after durable CORE/FORGE settlement. FORGE computes accepted-batch hashes from worker results when present, rejects supplied/computed hash mismatches, and rejects effectful cached replay without matching accepted-batch evidence. CORE returned and hydrated `backgroundBatches[]` now preserve compact `forgeBatchRef`, `backgroundEffectRefs`, `acceptedBatchHash`, `reviewHash`, and safe read-model refs for scene seals, pressure digests, recall entries, and open-world boundary settlements without raw provider/review text. Command Bearing closure review mutations now require a separate CORE background settlement with `reviewHash` validation before review-specific prompt sync. Focused proof: `test-campaign-sidecar-scheduler.mjs` covers no old v1 success/noChange journaling on accepted settled batches, no pre-CORE old projection mutation or persist, no ordinary post-CORE root assignment/persist, unsafe preflight `settled`/`noChange`, missing/mismatched transaction/batch/idempotency/hash receipts, no-evidence replay rejection, supplied-hash spoof rejection, validation/final-settlement failure ordering, accepted-journal persistence bypass, Command Bearing review settlement failure, and raw warning/reason redaction; `test-core-store-v2.mjs` covers production CORE returned/hydrated compact refs; `test-forge-open-world-boundary-settlement.mjs` covers identical replay versus same-idempotency mismatched replay; `test-forge-scene-phase-seal.mjs` and `test-forge-pressure-arc-digest.mjs` cover derived read-model refs after compaction. This remains a temporary bridge, not final ownership: the remaining Wave 3 cutover is to remove the accepted-sidecar v1 compatibility projection/journal bridge once CORE read projections cover runtime callers.
- Accepted regular sidecar prompt ownership follow-up, June 30, superseded July 1: accepted sidecar prompt synchronization now moves behind FORGE/LENS without enabling premature LENS flush during final CORE settlement. After CORE/FORGE settlement, `campaign-sidecar-scheduler.mjs` calls `forgeCoordinator.flushAcceptedBatchPrompt(...)` with normalized dirty domains, a prompt idempotency key derived from provider request evidence plus the accepted worker-result hash, source refs, live/filtered campaign state, and compact CORE accepted-batch projection evidence. `forge-coordinator.mjs` exposes this as an injected `acceptedBatchPromptFlusher` seam, and production `runtime-app.mjs` wires that seam to `synchronizeActivePrompt(..., persist: false)` so the real LENS packet builder and prompt-context metadata path are used instead of the scheduler calling `syncPromptContext(...)` or FORGE calling LENS's placeholder packet builder. The scheduler adopts and persists only returned prompt metadata, does not fall back after a FORGE/LENS flush attempt or failure, and leaves projected v1 roots out of prompt input. Completed provider-batch replay now caches only clean applied outcomes; rejected bridge outcomes, recovery-required results, post-settlement warning results, and unsafe FORGE statuses cannot become replay barriers. Once FORGE participates in accepted-batch lifecycle, missing or falsey accepted prompt helpers now record compact LENS-unavailable warning evidence instead of invoking scheduler-owned `syncPromptContext(...)`; replay carries the same warning so it cannot become a clean provider-cache barrier. No-FORGE accepted batches now reject before old mutation, so there is no no-FORGE prompt fallback. Focused proof: `test-campaign-sidecar-scheduler.mjs` covers FORGE/LENS accepted-batch prompt flush, prompt-only metadata adoption, stable dirty-domain/idempotency evidence, changed accepted worker-result hashes, changed provider request hashes, no scheduler prompt-sync call in the FORGE/LENS path, no fallback after LENS failure, missing FORGE/LENS helper warning evidence, replay warning preservation, transient rejected bridge outcomes retrying instead of replaying as completed, no transient non-command roots in LENS input, and raw source canaries excluded from FORGE/LENS prompt evidence. Syntax proof: `node --check src\jobs\campaign-sidecar-scheduler.mjs`, `node --check src\jobs\forge-coordinator.mjs`, and `node --check src\runtime\runtime-app.mjs`.
- Command Bearing review prompt ownership follow-up, June 30, superseded July 1: Command Bearing closure-review prompt synchronization now moves behind FORGE/LENS as its own post-review prompt adapter. The scheduler still performs a transient review mutation for prompt construction, but after durable CORE review settlement it calls `forgeCoordinator.flushCommandBearingReviewPrompt(...)` with `promptDirtyDomains: ['commandBearing']`, source refs, compact `directive.coreCommandBearingReviewProjection.v1`, and a prompt idempotency key suffixed by the validated `reviewHash`. `forge-coordinator.mjs` exposes this as an injected `commandBearingReviewPromptFlusher` seam, and production `runtime-app.mjs` wires that seam to `synchronizeActivePrompt(..., persist: false)` with a Command Bearing review prompt frame. Failed review CORE settlement blocks review prompt flushing; LENS failure or stale install restores non-review compatibility state and records compact `lens` warning evidence. The scheduler-owned review `syncPromptContext(...)` path remains fallback-only when the FORGE/LENS helper is absent and is prompt-only filtered. Focused proof: `test-campaign-sidecar-scheduler.mjs` covers review CORE receipt `reviewHash` validation, review prompt flush ordering after review settlement, review-hash idempotency, compact CORE review projection handoff, no scheduler review prompt sync in the FORGE/LENS path, no fallback after LENS failure, no v1 review ledger/mark persistence, LENS failure/stale-state warning semantics, unrelated live-drift preservation, and raw warning/canary redaction. Syntax proof: `node --check src\jobs\campaign-sidecar-scheduler.mjs`, `node --check src\jobs\forge-coordinator.mjs`, and `node --check src\runtime\runtime-app.mjs`.
- Accepted sidecar partial-FORGE fallback constraint, June 30: if an accepted sidecar batch enters FORGE preflight through `prepareAcceptedBatch(...)`, the scheduler now requires the same coordinator to provide `settleAcceptedBatch(...)` before compatibility projection assignment. A prepare-only FORGE coordinator no longer falls through to scheduler-built direct CORE background settlement, even when `commitCoreBackgroundBatch` is available. This keeps the v1 compatibility projection bridge but prevents a split ownership state where FORGE preflights and scheduler direct CORE settlement both claim the accepted-batch lifecycle. Focused proof: `test-campaign-sidecar-scheduler.mjs` covers prepare-only FORGE plus direct CORE callback rejecting before old projection assignment, with zero direct CORE calls, zero prompt sync calls, no state mutation, compact rejected journal evidence, and raw canary exclusion. Syntax proof: `node --check src\jobs\campaign-sidecar-scheduler.mjs` and `node --check tools\scripts\test-campaign-sidecar-scheduler.mjs`.
- Accepted sidecar FORGE/LENS prompt fallback constraint, June 30: accepted sidecar prompt sync is now FORGE/LENS-owned whenever FORGE participates in accepted-batch lifecycle through prepare, settle, or prompt-flush seams. A missing `acceptedBatchPromptFlusher` or falsey flush result records compact `{ stage: 'lens', code: 'DIRECTIVE_SIDECAR_POST_SETTLEMENT_LENS_FLUSH_UNAVAILABLE' }` warning evidence, does not call scheduler-owned `syncPromptContext(...)`, and does not advance prompt revision through a hidden fallback. Accepted replay carries the same warning so warned outcomes are not promoted into clean provider-cache results. Focused proof: `test-campaign-sidecar-scheduler.mjs` covers missing FORGE/LENS helper with zero scheduler prompt-sync calls, no prompt revision advancement, warning evidence on initial application and two replays, provider replay cache rejection for warned outcomes, compact diagnostics across replay, and raw canary exclusion. Syntax proof: `node --check src\jobs\campaign-sidecar-scheduler.mjs` and `node --check tools\scripts\test-campaign-sidecar-scheduler.mjs`.
- Accepted sidecar no-FORGE direct CORE fallback removal, June 30: accepted sidecar batches now require `forgeCoordinator.settleAcceptedBatch(...)` and a usable accepted-batch settlement object with one CORE transaction for final settlement. If no FORGE accepted-batch settlement owner is present, or if the accepted batch cannot form that settlement object, the scheduler rejects before old v1 mutation, does not call `commitCoreBackgroundBatch(...)`, does not call scheduler-owned prompt sync, writes compact rejected journal evidence with `bridge-failed-before-old-mutation`, and leaves `commitCoreBackgroundBatch(...)` available only for the separate Command Bearing closure-review settlement bridge. The FORGE review prompt wrapper now preserves compact `sourceToken` evidence into `commandBearingReviewPromptFlusher(...)`, with scheduler-side fallback derivation from source-frame refs. Focused proof: `test-campaign-sidecar-scheduler.mjs` covers no-FORGE accepted-batch rejection, no-CORE-transaction accepted-batch rejection before compatibility validation/assignment, zero direct CORE calls, zero prompt sync calls, no accepted state mutation, bad direct-fallback receipt variants no longer being consulted, FORGE-settled success fixture conversion, accepted-batch prompt ownership through FORGE/LENS, Command Bearing review settlement still using its separate CORE bridge, and review prompt source-token preservation. Syntax proof: `node --check src\jobs\campaign-sidecar-scheduler.mjs`, `node --check src\jobs\forge-coordinator.mjs`, and `node --check tools\scripts\test-campaign-sidecar-scheduler.mjs`.
- LENS stale-source host-install guard, June 30: `lens.flush(...)` and the synthetic LENS harness now accept a `beforeInstallPrompt` guard that runs after packet build/cache-key calculation but before host prompt install or rebuild. A rejected guard returns compact `installSkippedStale` evidence, does not call the host prompt adapter, does not advance `directiveOwnedRevision`, does not clear dirty domains, does not mark the idempotency key handled, and does not return the raw prompt packet. `runtime-app.synchronizeActivePrompt(...)` passes the guard into LENS and skips runtime/binding/persist commits on `installSkippedStale`; FORGE forwards the guard through accepted-batch and Command Bearing review prompt flusher seams; the scheduler passes freshness guards for accepted-batch and review prompt flushes and records compact `DIRECTIVE_SIDECAR_POST_SETTLEMENT_STATE_STALE` warning evidence instead of adopting stale prompt state. Focused proof: `test-prompt-dirty-domains.mjs` covers build-only/stale-skip behavior, no host prompt writes, retained dirty state, unchanged installed revision, and raw-prompt redaction; `test-campaign-sidecar-scheduler.mjs` covers Command Bearing review pre-install guard propagation/invocation and stale-state warning behavior. Syntax proof: `node --check src\runtime\lens-prompt-scheduler.mjs`, `node --check src\runtime\lens-prompt-scheduler-synthetic.mjs`, `node --check src\runtime\runtime-app.mjs`, `node --check src\jobs\forge-coordinator.mjs`, and `node --check src\jobs\campaign-sidecar-scheduler.mjs`.
- Runtime stale-background preservation follow-up, June 30: the open-world FORGE gate exposed a stale background assignment class in `test-chat-native-runtime-flow.mjs`: Narrative Thread background settlement could assign an older `campaignState` while Outcome Integrity edit persistence was in flight, dropping a selected response revision before the next mission view. Runtime background assignments now merge fresher response-ledger projections instead of blind replacement, active runtime persistence re-applies the intended response projection after storage awaits, and v2 runtime response reconstruction coalesces duplicate projected response rows while preserving richer `outcomeIntegrity` metadata. Focused proof: `test-chat-native-runtime-flow.mjs`, `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, `test-storage-scale-5000.mjs`, and the 201-check alpha gate.
- Active-save v2 redaction and CORE cache-input follow-up, June 30: active-save v2 response projections now demote raw response `replacementText` into compact `replacementTextPresent`, `replacementTextHash`, and `replacementTextLength` evidence before writing runtime event segments or rehydrating compatibility `runtimeTracking.responseLedger` rows. Runtime prompt synchronization now awaits CORE read projections before building LENS cache inputs, so scene-seal and pressure/arc digest revisions from CORE projections are passed into the prompt install/rebuild request instead of being lost behind an unresolved Promise. Focused proof: `test-active-save-facade-v2.mjs` covers the raw replacement-text canary and compact rehydration evidence; `test-chat-native-runtime-flow.mjs` proves a prompt rebuild after CORE scene-seal/pressure projections carries the awaited revision cache inputs; adjacent checks passed for `test-storage-cross-writer-v2.mjs`, `test-core-store-v2.mjs`, `test-storage-scale-5000.mjs`, `test-architecture-redesign-system-skeletons.mjs`, `test-prompt-dirty-domains.mjs`, and `test-runtime-host-injection.mjs`.
- Runtime bridge load/recovery follow-up, June 30: normal repository/controller load now honors the active-save v2 runtime bridge when a v1 checkpoint save index entry carries `runtimeStorageFormat: "v2"` and `v2ManifestRef`. `loadCampaignSaveFromStorage(...)` and `recoverActiveCampaignSave(...)` load through the active-save v2 facade so the compact materialized head and runtime event-segment projections become the runtime-current state instead of the stale v1 checkpoint. If the runtime bridge manifest is missing or unreadable and the v1 checkpoint payload remains readable, both paths fall back to the v1 checkpoint instead of treating the bridge as a hard pure-v2 save. Focused proof: `test-runtime-campaign-start-controller.mjs` proves controller initialization and explicit load use v2 stardate/projection evidence after runtime persistence; `test-directive-storage-repository.mjs` proves repository load/recovery, compact ingress/response projection hydration, no raw replacement/history restoration, and v1 fallback after deleting the runtime bridge manifest; adjacent checks passed for `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, and `test-chat-native-runtime-flow.mjs`.
- Runtime bridge freshness follow-up, June 30: runtime-bridge v2 load now verifies the save-index `v2ManifestRef` artifact hash before delegating to the active-save facade's canonical manifest loader. A stale or corrupt runtime bridge ref no longer bypasses the save index and silently resumes v2 runtime-current state; it falls back only to the explicit v1 checkpoint lane, matching the bridge policy. Pure v2 saves remain fail-closed: a corrupted materialized head throws `DIRECTIVE_V2_ARTIFACT_HASH_MISMATCH` instead of falling back within the same save. Focused proof: `test-directive-storage-repository.mjs` covers stale runtime bridge `v2ManifestRef.hash` load/recovery fallback and pure v2 materialized-head hash mismatch; adjacent checks passed for `test-runtime-campaign-start-controller.mjs`, `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, `test-transaction-store-v2.mjs`, and `test-chat-native-runtime-flow.mjs`.
- Manual Save/Save As v2 authority follow-up, June 30: after runtime bridge takeover, normal manual Save now routes through the active-save v2 facade and preserves the v2 manifest ref instead of rewriting the stale v1 checkpoint or clearing runtime v2 markers. Save As now creates a v2 manifest-owned branch entry and can update that manifest again after cloned-chat prompt binding; manifest-owned save-index entries refresh `manifestRef` hashes when their manifest changes, and export/read paths load campaign state through the repository loader instead of assuming `saveRecord.payload.campaignState`. `settleActiveState(...)` keeps an explicit `forceCheckpoint` path for State Safety v1 checkpoints. Focused proof: `test-runtime-campaign-start-controller.mjs`, `test-chat-native-runtime-flow.mjs`, `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-transaction-store-v2.mjs`, `test-runtime-host-injection.mjs`, `test-chat-native-activation-conclusion.mjs`, and `test-storage-scale-5000.mjs`.
- Autosave v2 authority follow-up, June 30: after runtime bridge takeover, `autosaveCurrentGame(...)` now writes a non-current v2 autosave manifest entry through the active-save facade instead of creating a v1 autosave payload. Autosave pruning keeps the newest autosave, deletes older v2 autosave manifests, and does not move the active manual save pointer or clear the active save's v2 authority. State Safety remains the explicit v1 checkpoint path. Focused proof: `test-runtime-campaign-start-controller.mjs`, `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-chat-native-runtime-flow.mjs`, `test-transaction-store-v2.mjs`, `test-runtime-host-injection.mjs`, `test-chat-native-activation-conclusion.mjs`, and `test-storage-scale-5000.mjs`.
- CORE begin/processing-failure authority follow-up, June 30: `beginTurn(...)` now publishes the initial CORE layout for a fresh store but uses event-delta hot append for later turn openings, so ordinary `beginTurn(...)`/route opening no longer rewrites head, host-map, prompt-cache, active-save, v1, sealed event/turn segments, or old open tails. CORE source-frame refs now preserve campaign/save/chat identity and reject mismatched campaign/save scopes before writing. Chat-turn processing failures for CORE-backed ingress now mark CORE recovery first and fail closed if `markRecoveryRequired(...)` cannot record the recovery, so the old `chatTurnProcessingFailure` recovery projection cannot become durable without CORE evidence. Runtime first source-turn bootstrap is now explicit: `test-chat-native-runtime-flow.mjs` proves a source save with no preexisting CORE layout creates CORE projections on the first player turn, binds old ingress to the CORE transaction/source frame, updates the save index with v2 runtime authority, and leaves the original v1 checkpoint payload unchanged. Focused proof: `test-core-store-v2.mjs`, `test-chat-turn-orchestrator.mjs`, `test-chat-native-runtime-flow.mjs`, `test-runtime-campaign-start-controller.mjs`, `test-response-dispatcher-core-bridge.mjs`, `test-turn-commit-coordinator-core-mechanics.mjs`, `test-message-recovery.mjs`, `test-current-chat-campaign-scope.mjs`, `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-transaction-store-v2.mjs`, and `test-storage-scale-5000.mjs`. The later response/freshness follow-up below closes the two remaining blockers identified at that point.
- CORE response duplicate and freshness authority follow-up, June 30: response-dispatch duplicate replay no longer reports `ok: true` from old `responseLedger` rows when the original dispatch reached `recoveryRequired` because CORE visible-response recording or hostContinue release recording failed. The duplicate still avoids reposting visible text or rereleasing host generation, but it now returns `ok: false`, `recoveryRequired: true`, the original `recoveryId`, and compact CORE error evidence. Runtime freshness arbitration now accepts transient `directive.coreStoreReadProjections.v1` evidence for CORE turn, ingress, response, and recovery projection counts; current-chat refresh and stale runtime persistence attach that evidence only for comparison, so CORE/v2 projections outrank stale old-ledger growth without persisting the evidence object. Focused proof: `test-response-dispatcher-core-bridge.mjs`, `test-current-chat-campaign-scope.mjs`, `test-chat-turn-orchestrator.mjs`, `test-message-recovery.mjs`, `test-core-store-v2.mjs`, `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, `test-chat-native-runtime-flow.mjs`, and `test-storage-scale-5000.mjs`. The remaining Wave 1 authority blockers are full runtime resume semantics, broader durable response/recovery/background lifecycle ownership in CORE, contradiction compatibility projection demotion, and final bounded reducer/event mechanics application.
- CORE sidecar diagnostics and accepted-batch prompt projection follow-up, July 1: runtime freshness evidence now carries CORE `sidecarDiagnostics`, and `flushChatSidecars()` reports `coreSidecarDiagnosticsBefore/After`, `coreSidecarDiagnosticDelta`, and a result-aware `sidecarDelta` so accepted FORGE-settled sidecars do not depend on old `runtimeTracking.sidecarJournal` growth for user-facing progress or freshness arbitration. Accepted regular sidecar prompt flushes now also carry a compact `directive.coreAcceptedSidecarBatchProjection.v1` with transaction id, batch id, idempotency key, `acceptedBatchHash`, worker keys, dirty domains, operation count, source Frame ref, and compact settlement receipt evidence. This does not remove the temporary compatibility `campaignState` yet, but it gives FORGE/LENS the CORE-derived projection needed to shrink that bridge next. Focused proof: `test-chat-native-runtime-flow.mjs` and `test-campaign-sidecar-scheduler.mjs`.
- LENS accepted-batch cache-input follow-up, July 1: production and synthetic LENS now treat the compact CORE accepted-sidecar batch projection as prompt cache identity by extracting `acceptedBatchHash`, CORE transaction/batch refs, background batch id, worker count, and operation count into bounded cache inputs. `runtime-app` threads `coreAcceptedBatchProjection` from the FORGE accepted-batch prompt flusher into the LENS prompt frame, so two accepted sidecar batches with the same source token and dirty domains but different accepted-batch hashes rebuild distinct prompt packets instead of relying on compatibility-state revision churn or being incorrectly reused. This further demotes the v1 compatibility projection from prompt-cache authority, while still leaving the temporary compatibility `campaignState` in place until runtime surfaces can read the CORE background projection directly. Focused proof: `test-prompt-dirty-domains.mjs`, `test-campaign-sidecar-scheduler.mjs`, `test-runtime-host-injection.mjs`, and `test-chat-native-runtime-flow.mjs`.
- Active-save v2 CORE sidecar resume follow-up, July 1: active-save v2 materialized heads and runtime resume cursors now count accepted FORGE/CORE sidecar work from compact CORE read-projection evidence, using both `sidecarDiagnostics` and accepted `backgroundBatches` worker counts before falling back to old `runtimeTracking.sidecarJournal`/top-level `sidecarJournal` counts. `runtime-app.flushRuntimeDiagnostics()` now performs a guarded metadata refresh after CORE diagnostic queues settle, only when CORE sidecar resume counts advance beyond the compact state count, so reload metadata no longer reports zero sidecars merely because accepted settled batches bypass old v1 applied journals. The transient `directiveRuntimeEvidence.coreStoreReadProjections` object is stripped from durable v2 heads and raw diagnostic canaries remain excluded. Focused proof: `test-active-save-facade-v2.mjs` and `test-chat-native-runtime-flow.mjs`.
- Chat-native CORE sidecar tracking follow-up, July 1: the mission/runtime view's `chatNative.tracking.sidecarCount` now reads the same compact freshness projection used by runtime persistence, including active-save v2 `runtimeResume.sidecarCount`, CORE `sidecarDiagnostics`, and accepted `backgroundBatches` worker counts. The UI surface therefore reports accepted FORGE/CORE sidecar progress even when the old `runtimeTracking.sidecarJournal` bridge remains empty or stale, without storing transient CORE projection evidence in the view state. Focused proof: `test-chat-native-runtime-flow.mjs`.
- Flush sidecar progress reporting follow-up, July 1: `runtime-app.flushChatSidecars()` now reports `sidecarCountBefore/After` as compact CORE-aware progress counts, while preserving the old v1 journal numbers under `sidecarJournalCountBefore/After` for bridge diagnostics. This keeps smoke/live tooling from treating an empty or stale `runtimeTracking.sidecarJournal` as zero accepted background progress after FORGE/CORE settlement. Focused proof: `test-chat-native-runtime-flow.mjs`.
- Active-save v2 CORE projection cutover follow-up, July 1: active-save v2 host rows, runtime event segments, turn records, runtime summaries, and loaded compatibility projections now read from `directiveRuntimeEvidence.coreStoreReadProjections` instead of defaulting to stale `runtimeTracking`/`turnLedger` roots. The facade strips transient CORE evidence from the materialized head, writes only compact ids/hashes/statuses into v2 artifacts, and rehydrates compact `runtimeTracking` plus `turnLedger` from event/turn segments on load. Because current CORE response projections are intentionally partial for host-continue and non-visible-response turns, row selection is CORE-preferred but completeness-guarded: when CORE has at least the compatibility row count it wins outright; when CORE is partial, unmatched compatibility rows are retained while matching rows prefer CORE ids/transaction evidence. Review hardening added order-preserving partial merges, logical fallback-tuple response dedupe, compact recovery projection persistence/rehydration, transaction/source-frame evidence preservation, and sanitized Outcome Integrity evidence instead of raw nested revision copies. Focused proof: `test-active-save-facade-v2.mjs` covers conflicting stale v1 ledgers versus newer CORE projections, partial CORE response/turn merge order, compact recovery reload, transaction/source evidence, and raw projection/outcome-integrity canary redaction; `test-chat-native-runtime-flow.mjs` covers partial CORE response projections without shrinking active-save response counts; adjacent checks passed for `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-runtime-campaign-start-controller.mjs`, and `test-storage-scale-5000.mjs` with 5000 messages, a 22081-byte materialized head, and no sealed segment rewrites.
- Active-save v2 compact model-call resume follow-up, July 1: active-save diagnostics segments now carry compact `runtimeModelCallProjected` rows with model-call id, role/provider/model ids, status, request hash, parse/validation/applied status, latency, retry/error code, recorded time, campaign revision, and optional transaction/source-frame refs. Raw prompts, raw responses, provider payloads, and arbitrary metadata stay out of v2 artifacts. `loadActiveCampaignStateV2(...)` rehydrates those rows into compatibility `runtimeTracking.modelCallJournal`, dedupes repeated projections by model-call id while keeping the latest compact row, and preserves the sequence cursor so new model calls after v2 reload advance from the last restored id. Focused proof: `test-active-save-facade-v2.mjs` covers raw prompt/response canaries, compact diagnostics projection, reload, re-persist, sequence advance to `model-call:43:*`, duplicate projection dedupe, and raw-payload exclusion; adjacent checks passed for `test-runtime-model-call-journal.mjs`, `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-runtime-campaign-start-controller.mjs`, `test-current-chat-campaign-scope.mjs`, `test-chat-native-runtime-flow.mjs`, and `test-storage-scale-5000.mjs`.
- Active-save v2 compact sidecar/background resume follow-up, July 1: active-save diagnostics segments now carry compact `runtimeSidecarDiagnosticProjected` and `runtimeBackgroundBatchProjected` rows. Sidecar rows preserve only ids, worker/role/provider ids, status, accepted-batch hash, counts, dirty domains, timestamps, and transaction/source-frame refs; worker identity accepts the real producer aliases `worker`, `sidecarType`, `workerType`, and object-shaped worker refs so same-transaction workers do not collapse during load dedupe. Background rows preserve batch id, idempotency key, outcome id, accepted-batch hash, review hash, worker/operation/effect counts, dirty domains, compact FORGE batch refs, and transaction/source-frame refs. Raw sidecar packets, raw worker/provider output, raw prompts, and arbitrary diagnostic payloads stay out of v2 artifacts. `loadActiveCampaignStateV2(...)` now reconstructs those rows under transient `directiveRuntimeEvidence.coreStoreReadProjections.sidecarDiagnostics` and `backgroundBatches`, leaves `runtimeTracking.sidecarJournal` empty for accepted CORE evidence, and still lets re-persist write compact diagnostic projections from CORE read evidence. Focused proof: `test-active-save-facade-v2.mjs` covers compact sidecar/background diagnostics projection, reload continuity under CORE projections, same-transaction CORE worker-alias rows without ids, raw sidecar canary exclusion, empty legacy sidecar journal on load, and re-persist through the compact loaded state; adjacent checks passed for `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-runtime-campaign-start-controller.mjs`, `test-current-chat-campaign-scope.mjs`, `test-chat-native-runtime-flow.mjs`, `test-campaign-sidecar-scheduler.mjs`, and `test-storage-scale-5000.mjs` with 5000 messages, a 22081-byte materialized head, and no sealed segment rewrites.
- Active-save v2 compact prompt-cache resume follow-up, July 1: active-save load now reads the manifest-owned `promptCache` artifact through normal v2 artifact hash verification and exposes only compact resume evidence under `head.promptCache`: Directive-owned prompt revision, compact external prompt environment ref, block count, optional block keys, and update time. If the prompt-cache revision is newer than the materialized-head binding, `loadActiveCampaignStateV2(...)` restores `campaignChatBinding.promptContextRevision` and `runtimeResume.promptContextRevision`; if the prompt-cache external prompt environment ref is at least as fresh, it restores that compact ref as well. Raw prompt-cache block bodies are not copied into campaign state or load results. Focused proof: `test-active-save-facade-v2.mjs` builds a stale materialized head plus newer prompt-cache artifact, asserts prompt revision/ref rehydration, and proves a raw prompt-block canary is absent from both campaign state and the load result. Adjacent checks passed for `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-runtime-campaign-start-controller.mjs`, `test-current-chat-campaign-scope.mjs`, and `test-chat-native-runtime-flow.mjs`; the read-only explorer confirmed this is the correct boundary because runtime reopening should preserve prompt cursor/provenance and let LENS/runtime retarget the actual prompt rather than replay prompt blocks from storage load.
- Active-save v2 compact Command Log presentation follow-up, July 1: materialized heads now keep recent Command Log entries plus bounded player-safe assisted-summary presentation fields (`kind`, `status`, `sourceOutcomeId`, `roleId`, `providerId`, `title`, `summary`, and `highlights`) while still omitting older turn-scaled Command Log prose and raw assisted-summary provider output/diagnostics/model payloads. `loadActiveCampaignStateV2(...)` preserves those compact recent summaries for Command Log UI/search and resume presentation without making raw sidecar output durable. Focused proof: `test-active-save-facade-v2.mjs` first failed on missing compact assisted summaries, then passed with raw provider-output canary exclusion and load preservation. Adjacent checks passed for `test-storage-cross-writer-v2.mjs`, `test-directive-storage-repository.mjs`, `test-runtime-campaign-start-controller.mjs`, `test-current-chat-campaign-scope.mjs`, `test-chat-native-runtime-flow.mjs`, `test-transaction-store-v2.mjs`, and `test-storage-scale-5000.mjs` with 5000 messages, a 22081-byte materialized head, and no sealed segment rewrites.
- Manifest-owned v2 reload freshness follow-up, June 30: repository pure-v2 load now uses the manifest record currently stored at the save-index path before trusting stale index-side `manifestRef` metadata, accepts direct `directive.materializedCampaignHead.v2` heads as compact materialized state, and overlays bounded current-tail runtime/turn projections from the latest event and turn segments. `test-directive-storage-repository.mjs` proves pure-v2 load/recovery sees hot appended ingress, response, and turn projections after `commitV2EventTurnSegments(...)` instead of failing on stale manifest hashes. `test-storage-scale-5000.mjs` now extends the 5000-message fixture through production repository registration, hot append, `loadCampaignSaveFromStorage(...)`, and `recoverActiveCampaignSave(...)`, with 4 hot-turn writes, 8 reload/read operations, 0 sealed segment reads, 0 sealed segment rewrites, and 0 open-tail overwrites.
- Live certification sequencing, from the June 30 live-proof agent review: do not start the unbounded five-user, 52-turn Ashes run until deterministic preflights, dry/offline readiness, live readiness, and a bounded `--turn-limit 3` live proof pass strict preflight with only expected depth/scope warnings. Required bounded-preflight checks include live soak prep, five-user coordinator, full-certification preflight, story-quality review preflight, model-call failure policy evidence, external-context fixture prep, smoke CORE proof targeting, factual grounding prompt proof, external-context readiness, and both scale harnesses. Full certification still requires all five non-human `directive-soak-*` users, no lingering `DIRECTIVE_SOAK_TURN_LIMIT`, 52 prompt snapshots per lane, 53 fact checks per lane, model-assisted factual/story review passes, lane-owned model-call failure evidence, all-lane external-context proof, and the specialized mutation/terminal/Command Bearing release-bundle producers.
- External-context summary hardening, June 30: delegated smoke promotion now sanitizes `host-extensions/external-context-summary.json` at the writer boundary, removing raw/secret fields from prompt-inspection captures and preserving only compact refs, statuses, hashes, prompt keys, target diagnostics, unavailable signals, redaction reasons, and redaction path metadata. The five-user coordinator validator now fails otherwise shaped summaries that contain raw prompt/body fields, generated Memory Books text, Summaryception summaries, VectFox vector payloads, embeddings, endpoint URLs, collection identifiers, API keys, or secret-looking values. It also requires `aggregate.finalHostPromptMayIncludeExternal === true` and useful compact evidence for each required target, so placeholder target objects such as empty `stLorebooks`, `memoryBooks`, `summaryception`, or `vectFox` summaries cannot pass as compatibility proof. Focused proof: `test-external-context-summary-artifact.mjs` builds a rich four-target fixture, asserts `directiveAuthority: false`, verifies all target diagnostics survive, proves raw canaries are stripped, and mutates the artifact to prove corrupted unsafe, missing-final-host-prompt, and placeholder-target summaries fail lane/preflight validation.
- External-context generation-proof tightening, July 1: generation-time rich fixture pressure no longer treats a bare `worldInfoBefore`/World Info prompt key as sufficient ST Lorebooks evidence. The prompt snapshot must also carry a normalized `stLorebooks` target summary, matching the stricter Memory Books `rangeDiagnostics`, Summaryception `staleness`, and VectFox `backendDiagnostics` requirements. This prevents a live lane from passing rich external-context proof with only generic World Info prompt pressure and no target-specific ST Lorebooks evidence. Focused proof: `test-external-context-summary-artifact.mjs` and `test-continuity-matrix-five-user-soak-coordinator.mjs`.
- Accepted sidecar prompt-sync cutover follow-up, July 1: this supersedes the earlier June 30 accepted sidecar prompt-ownership note that treated old v1 projection persistence as a hard gate for all prompt synchronization. After durable CORE/FORGE settlement, ordinary accepted-batch prompt sync now proceeds from the live/filtered campaign state plus compact accepted-batch projection evidence and does not require or attempt old compatibility writes. That keeps LENS prompt freshness tied to CORE/FORGE settlement instead of a best-effort v1 write. Command Bearing closure-review prompt sync now follows the same ownership rule with separate CORE review settlement plus compact `directive.coreCommandBearingReviewProjection.v1` evidence, not a second v1 review-root persistence gate. Focused proof: `test-campaign-sidecar-scheduler.mjs` first failed with `postCorePromptSyncs.length === 0`, then passed with the new `postCorePromptSyncs.length === 1` assertion while preserving Command Bearing review prompt isolation. Adjacent checks passed for `test-prompt-dirty-domains.mjs`, `test-chat-native-runtime-flow.mjs`, `test-background-projection-batch.mjs`, `test-active-save-facade-v2.mjs`, `test-storage-cross-writer-v2.mjs`, `test-runtime-host-injection.mjs`, and `test-storage-scale-5000.mjs` with 5000 messages, a 22081-byte materialized head, and no sealed segment rewrites.
- Accepted sidecar FORGE/LENS warning-path ownership tightening, July 1: FORGE/LENS accepted-batch prompt flushing now receives live/filtered campaign state plus compact `directive.coreAcceptedSidecarBatchProjection.v1` evidence after durable CORE/FORGE settlement, then the scheduler persists only returned prompt-context state. Missing/unavailable FORGE/LENS helpers still produce compact LENS-unavailable warning evidence. Command Bearing closure-review prompt synchronization now uses its own compact CORE review projection and prompt-only adoption path, so review roots/marks do not persist through fallback or failure recovery. Focused proof: `test-campaign-sidecar-scheduler.mjs` failed with only the old projection-persist reason recorded, then passed with one FORGE/LENS flush, zero scheduler fallback sync calls for accepted batches, compact CORE accepted-batch projection evidence, and preserved Command Bearing review isolation.
- Accepted sidecar v1 projection shrink, July 1: ordinary accepted FORGE-settled sidecars now use `stateDeltaGateway.validateOperations(...)` only as transient compatibility validation evidence, not as prompt input. After CORE/FORGE settlement, they do not assign or persist projected v1 domain roots, do not advance v1 mechanics revision, and do not write old applied sidecar journal rows. FORGE/LENS receives live/filtered campaign state plus `directive.coreAcceptedSidecarBatchProjection.v1`, and scheduler adoption of the returned state is prompt-only: `campaignChatBinding`, `runtimeResume`, and `runtimeTracking.promptContext`. Command Bearing accepted evidence has now moved out of the old-state carveout: mixed Command Bearing batches emit compact `directive.commandBearingEvidence.v1` effect refs and named CORE `commandBearingEvidence` projections, while the scheduler may build transient evidence state only to run closure review and then persists prompt metadata over the pre-evidence base. Crew, ship, relationship, continuity, commandCulture, and other non-prompt roots remain CORE-only and excluded from prompt input. Command Bearing closure-review prompt flushes also adopt only prompt metadata from FORGE/LENS or scheduler fallback output, so a bad prompt-return state cannot smuggle non-command roots after the review mutation. Completed provider-batch replay now rechecks source ingress liveness/status and source fingerprints before returning cached `applied` results, so an accepted clean replay cannot bypass `DIRECTIVE_SIDECAR_SOURCE_STALE` after an edit/delete/invalidation. Focused proof: `test-campaign-sidecar-scheduler.mjs` first failed on old root/persist assumptions, then on the quality-review RED for mixed Command Bearing leakage (`crew.casualties` persisted as `1 !== 0`), then on the spec re-review RED for Command Bearing review prompt output leaking `ship.condition`, then on the stale-cache RED where a cacheable accepted replay returned `applied/applied` after invalidation. It now asserts no old projection persist for ordinary batches, no root assignment snapshots, prompt-only metadata merge, clean provider-batch replay, stale replay rejection before provider generation, mixed Command Bearing non-command root exclusion, review-prompt root filtering, no transient non-command roots in LENS input, no old Command Bearing evidence roots, and compact CORE `commandBearingEvidence` projection handoff. Adjacent checks passed for `test-chat-native-runtime-flow.mjs`, `test-prompt-dirty-domains.mjs`, `test-background-projection-batch.mjs`, `test-active-save-facade-v2.mjs`, `test-core-store-v2.mjs`, and `test-architecture-redesign-system-skeletons.mjs`.
- Command Bearing review CORE projection cutover, July 1: closure-review awards no longer persist old v1 `commandBearing.reviewLedger` or track-mark roots through either old bridge writes or review prompt-sync writes. The scheduler still builds a transient reviewed state for LENS prompt construction, but durable review evidence is the CORE background batch with `directive.commandBearingReviewClosure.v1` refs and the named `commandBearingReviewClosures` read projection from CORE Store. `flushCommandBearingReviewPrompt(...)` now forwards compact `directive.coreCommandBearingReviewProjection.v1` evidence; runtime-owned LENS prompt flushing carries that projection through the prompt frame and normalized cache inputs, so review hash/batch evidence participates in prompt cache identity. Returned prompt state is merged over the pre-review compatibility state, so only prompt metadata persists. LENS failure, stale host-install, no-state/null review flush, or fallback no-state prompt sync restores non-review compatibility state and rolls back transient review-owned `runtimeTracking` revision, mechanics revision, stable revision, history, and lastDelta while preserving unrelated non-review drift. If a real tracked drift commit occurs during the review prompt race, retained independent history entries that are not already part of the persistent base history are scrubbed so their snapshots cannot carry transient review ledger/mark roots or nested runtime history. Focused proof: `test-campaign-sidecar-scheduler.mjs` first failed on v1 review-root persistence and missing prompt projection, then on no-state review flush leaving v1 review roots live, then on fallback no-state and transient runtimeTracking leakage, then on tracked drift history snapshots retaining review roots, then on scrubbed snapshots nesting full runtime history, then on over-scrubbing base history snapshots, then passed with no old review persist reason, no persisted review snapshots, CORE review settlement refs, compact prompt projection handoff, LENS failure/stale/no-state/fallback restoration, tracking rollback/snapshot scrub, compact history snapshots, preserved base snapshots, and raw canary exclusion; `test-core-store-v2.mjs` first failed on missing `commandBearingReviewClosures`, then passed with closure id, transaction id, batch id, review hash, source Frame id, compact forge ref, and raw review redaction; `test-prompt-dirty-domains.mjs` first failed by reusing the prompt cache across distinct review hashes, then passed with `commandBearingReview.reviewHash` in build/install cache inputs.
- Active-save v2 accepted sidecar CORE projection cutover, July 1: the next bridge slice removed the load-time sidecar-journal backfill for accepted CORE sidecar/background diagnostics. Loaded v2 state now carries sidecar diagnostics and accepted background batches only as transient CORE read projection evidence, while `runtimeTracking.sidecarJournal` remains empty unless older compatibility state supplies it. Runtime summary, resume count, diagnostics persistence, and re-persist still count/write the same compact evidence through `sidecarDiagnosticRows(...)` and `backgroundBatchRows(...)`, so user-visible sidecar progress and save-size proof no longer depend on old applied-journal growth. Focused proof: `test-active-save-facade-v2.mjs` first failed with `4 !== 0` on the legacy sidecar journal assertion, then passed with empty legacy journal, three CORE sidecar diagnostics, one accepted background batch, preserved worker aliases, raw provider canary exclusion, and compact re-persisted diagnostics.
- Command Bearing evidence projection and sidecar rejection-journal demotion, July 1: accepted Command Bearing evidence no longer persists old v1 evidence roots. The scheduler emits compact `directive.commandBearingEvidence.v1` effect refs into FORGE/CORE accepted batches, CORE Store exposes named `commandBearingEvidence` projections, active-save v2 persists/loads them as `runtimeCommandBearingEvidenceProjected` rows, and runtime/LENS cache inputs carry `commandBearingEvidenceRevision`. Closure review still uses transient evidence state for review planning, but persists prompt metadata over the pre-evidence base. Failed, rejected, stale, and unsafe sidecar paths no longer append `runtimeTracking.sidecarJournal` rows; focused tests assert CORE diagnostics carry rejection evidence instead of vacuous old-journal rows. Focused proof: `test-campaign-sidecar-scheduler.mjs`, `test-core-store-v2.mjs`, `test-active-save-facade-v2.mjs`, and `test-prompt-dirty-domains.mjs`. Adjacent checks passed for `test-chat-native-runtime-flow.mjs`, `test-background-projection-batch.mjs`, `test-architecture-redesign-system-skeletons.mjs`, and `test-storage-scale-5000.mjs`.
- Alpha-gate v2 cutover cleanup, July 1: the full gate exposed stale test assumptions and two real compact-runtime seams. `active-save-facade-v2.mjs` now preserves compact Command Log entry `type` for recent presentation replay so campaign-start records render as `Campaign Start` after v2 load without restoring raw summary-input prose. `runtime-app.mjs` now reapplies the cloned Save As branch binding after prompt rebuild so LENS cannot hand back a source-bound campaign state before the final branch save. `test-runtime-shell-creator-flow.mjs` now treats Start Campaign as the owner of opening-scene posting, treats Save Game as v2 runtime-current persistence when v2 authority exists, and treats Settle Active State as the explicit v1 checkpoint action. `test-runtime-stage18-rerun-branch-recovery.mjs` now asserts branch metadata through v2 save-index evidence and branch chat identity through the operation/host binding rather than v1 payload shape. Focused proofs passed for `test-active-save-facade-v2.mjs`, `test-runtime-shell-creator-flow.mjs`, `test-runtime-stage18-rerun-branch-recovery.mjs`, and `test-chat-native-runtime-flow.mjs`; the canonical `run-alpha-gate.mjs` then passed all 201 checks.
- REPAIR visibility-only production guard, July 1: SillyTavern `MESSAGE_UPDATED` visibility payloads now preserve raw/nested/wrapper-level external markers before stale host lookup or stale nested message metadata can erase them, while async `host.chat.getMessage(...)` is awaited before REPAIR receives a message. `normalizeHostMessageVisibility(...)` remains the single marker contract for Summaryception ghosting, Memory Books hide/unhide, VectFox prompt ghosting, native hidden rows, zero-index metadata ranges, and explicit delete/source-mutation precedence. The host fallback observer now marks the latest player-row signature pending when primary `MESSAGE_SENT` observation is scheduled, then settles the fallback baseline when primary observation succeeds, including after a transient retry; a visibility-only DOM mutation can no longer schedule a duplicate normal player observation for the same row while primary processing is pending or after retry success. The same slice tightened host-native SRE review reuse so source ids plus actual observed-text hash must match; stale source/host `textHash` metadata no longer causes either false trust or a duplicate SRE review after the first text-derived review. Focused proof: `test-chat-turn-orchestrator.mjs` first failed on raw visibility markers disappearing behind stale `host.chat.getMessage(...)`, then passed for raw payloads, raw payloads with host lookup present, nested `payload.message.extra` markers, wrapper `payload.extra` markers merged over stale nested messages, zero-index visibility maps, async host lookup, and throwing no-persist/no-prompt sentinels; `test-sillytavern-runtime-lifecycle.mjs` first failed because a visibility DOM scan scheduled a second normal observation, then failed again when a successful primary retry did not settle the fallback baseline, then passed with exactly one `visibility` and one primary `sent`/retry sequence; `test-response-dispatcher-core-bridge.mjs` covers missing/stale supplied SRE review hashes, stale source hashes, and stale host observation hashes without duplicate SRE review. Adjacent checks passed for `test-message-recovery.mjs`, `test-repair-runtime.mjs`, `test-source-reconciliation-engine-synthetic.mjs`, `test-sillytavern-chat-prompt-adapters.mjs`, `test-architecture-redesign-contracts.mjs`, and `test-architecture-redesign-system-skeletons.mjs`. This closes the production visibility reobserve loop class for external context-extension markers; full five-user live proof remains a Wave 4 certification gate.
- Post-commit conversation failure raw-error demotion, July 2: the former `postCommitConversationFailed` old recovery writer in `chat-turn-orchestrator.mjs` now projects compact error evidence only: error code, `messageHash`, and `messageLength`. `runtime-app.mjs` no longer writes scheduled post-commit old recovery rows at all. Raw exception messages are no longer copied into `runtimeTracking.recoveryJournal.details`, and `test-architecture-redesign-system-skeletons.mjs` rejects the old raw `error.message` patterns. This is a targeted save-bloat/raw-archive cleanup while narrative-thread/post-commit work still awaits fuller CORE/FORGE ownership.
- Scheduled post-commit conversation diagnostic-only demotion, July 2: the normal scheduled Narrative Thread/post-visible extraction failure path in `runtime-app.mjs` now awaits a CORE diagnostic (`worker: "narrativeThreadDirector"`, `eventType: "postCommitConversationFailed"`) and does not write an old `runtimeTracking.recoveryJournal` fallback if that diagnostic is unavailable. `test-architecture-redesign-system-skeletons.mjs` guards the awaited helper, named failure event, and zero old runtime-app recovery writers. Remaining post-commit debt is fuller FORGE/Narrative Thread ownership and live proof.
- Blocking post-commit conversation diagnostic-only demotion, July 2: the no-scheduler `postCommitConversationProcessor` bridge in `chat-turn-orchestrator.mjs` now attempts a compact CORE diagnostic through `coreTurnStore.appendDiagnostics(...)` / `appendDiagnostic(...)` and no longer writes an old `runtimeTracking.recoveryJournal` `postCommitConversationFailed` fallback when CORE diagnostics are unavailable. `test-architecture-redesign-system-skeletons.mjs` guards the helper, diagnostic event shape, and zero old chat-turn recovery writers. Fuller Narrative Thread/FORGE ownership remains open, but the chat-turn bridge is no longer an old-recovery writer.
- Administrative lifecycle demotion, July 2: `campaignDifficultyChange` and `chatRebind` no longer use `runtimeTracking.recoveryJournal` as an administrative event log. `state-delta-gateway.mjs` now owns bounded `runtimeTracking.lifecycleJournal` records for compact applied lifecycle facts, runtime-app writes those two events through `recordLifecycleEvent(...)`, and checkpoint restore paths preserve that journal without copying it into compact historical turn snapshots. Focused proof updates require lifecycle records and reject the former recovery rows in `test-campaign-difficulty-runtime.mjs`, `test-chat-native-runtime-flow.mjs`, and `test-architecture-redesign-system-skeletons.mjs`. This moved administrative rows out of recovery state before the later runtime recovery-writer removal closed the primary old-writer paths.
- Generic restoreRevision recovery demotion, July 2: `restoreTrackedCampaignRevision(...)` no longer writes `runtimeTracking.recoveryJournal` rows of type `restoreRevision`. The state-delta gateway now preserves existing recovery rows during generic restore and records a compact `stateRevisionRestored` entry in bounded `runtimeTracking.lifecycleJournal`. `test-state-delta-gateway.mjs` proves restore no longer creates the old recovery row, and `test-architecture-redesign-system-skeletons.mjs` rejects `restoreRevision` type literals in both `repair-command-boundary.mjs` and `state-delta-gateway.mjs`.
- Narration bookkeeping missing-outcome diagnostic-only demotion, July 2: when narration generation fails and the committed outcome row is missing, `runtime-app.mjs` now finds the source ingress transaction and appends a CORE diagnostic (`worker: "directiveNarration"`, `eventType: "narrationBookkeepingMissingOutcome"`). It persists only when that CORE diagnostic exists and no longer writes an old `runtimeTracking.recoveryJournal` fallback row if diagnostic recording is unavailable. `test-architecture-redesign-system-skeletons.mjs` statically requires the diagnostic helper, diagnostic-gated persistence, and zero old runtime-app recovery writers.
- Old recovery writer inventory guard, July 2: `test-architecture-redesign-system-skeletons.mjs` now treats production `recordRecoveryEvent(...)` calls as forbidden in the primary runtime recovery owners: `message-reconciler.mjs`, `chat-turn-orchestrator.mjs`, `runtime-app.mjs`, and `response-dispatcher.mjs` all have 0 old recovery writers. The guard also rejects `response-dispatcher.mjs` importing old recovery writer authority while requiring compact CORE diagnostic event evidence for host-native completion, host-native failed/unavailable, hostContinue release, and visible-response record failure lanes. This does not finish old-ledger removal everywhere, because old recovery projections/readers and compatibility telemetry still exist, but it stops these runtime paths from silently expanding save growth.
- Response-dispatcher old recovery writer removal, July 2: `response-dispatcher.mjs` no longer writes `runtimeTracking.recoveryJournal` rows for host-native continuity compatibility projections, host-native completion record failures, host-native failed/unavailable observations, hostContinue release record failures, or visible-response record failures. When CORE recovery/diagnostics are unavailable, the dispatcher now fails closed through compact response status/error refs without appending old recovery rows or patching old ingress recovery status. Focused proof: `test-response-dispatcher-core-bridge.mjs` covers diagnostic-backed lanes plus a no-diagnostic visible-response failure canary, and `test-architecture-redesign-system-skeletons.mjs` statically requires zero dispatcher `recordRecoveryEvent(...)` writers.
- Active-save v2 recovery resume CORE-only cut, July 2: `active-save-facade-v2.mjs` no longer merges unmatched legacy `runtimeTracking.recoveryJournal` rows into v2 runtime event segments, runtime summary counts, or reload projections. Recovery resume now comes only from compact CORE `recoveryJournal` read projections; old recovery rows may still exist as legacy telemetry on an input checkpoint, but v2 active-save persistence does not revive or reserialize them. Focused proof: `test-active-save-facade-v2.mjs` now rejects legacy recovery row revival for both ordinary and partial CORE projection saves, and `test-architecture-redesign-system-skeletons.mjs` guards `projectedRecoveryRows(...)` as CORE-only.
- Shared runtime ledger view CORE-first cut, July 2: `runtime-ledger-view.mjs` now centralizes ingress, response, and recovery lookup for the first runtime consumers and exposes an async projection path for the runtime-app CORE facade. Response dispatch duplicate/recovery lookup, chat-turn response-retry lookup, and MessageReconciler source-mutation lookup now use the shared async view instead of independently reading old arrays first. Matching CORE ingress/response rows remain authoritative while matching old bridge rows can supply missing compatibility fields; recovery rows are CORE-only whenever any CORE recovery projection exists, with legacy fallback only for explicit old-save lanes that have no CORE recovery projection. Focused proof: `test-runtime-ledger-view.mjs` covers CORE-over-stale-old, async CORE-store projections, authoritative CORE-only mode, and recovery suppression; `test-architecture-redesign-system-skeletons.mjs` guards dispatcher/orchestrator/reconciler async imports.
- Runtime freshness CORE-first ledger view cut, July 2: `runtime-app.mjs` now derives ingress, response, and recovery freshness counters from the shared CORE-first ledger view instead of independently taking the max of old `runtimeTracking` rows and CORE projection rows. CORE authority arbitration no longer requires `projections.recoveryJournal` to cover legacy recovery rows, so stale old recovery telemetry cannot make a state look fresher or block authoritative CORE runtime evidence. Focused proof: `test-current-chat-campaign-scope.mjs`, `test-runtime-ledger-view.mjs`, and `test-architecture-redesign-system-skeletons.mjs`.
- Turn-save history retention shrink, July 2: retained old turn-save history now defaults to 8 instead of 20 in `state-delta-gateway.mjs`, `runtime-app.mjs`, `transaction-state.mjs`, the Settings UI, and the bundled Ashes projection. Runtime/UI max is now 20 instead of 60, and neither `runtime-app.mjs` nor `settings-panel.js` preserves old `runtimeTracking.historyLimit` as an implicit user setting when `settings.maxTurnSaveHistory` is absent. This keeps embedded compact snapshots as a short convenience window while CORE/v2 checkpoint artifacts own durable replay, rollback, terminal recovery, and long-campaign proof. `test-architecture-redesign-system-skeletons.mjs` statically guards the new defaults/caps/Ashes seed, and the runtime shell test now expects the Settings default to display 8. This directly reduces save-size growth for the 5000-message target without removing user control.
- 5000-message segment chunking performance fix, July 2: `test-storage-scale-5000.mjs` first timed out at `180s`, then phase timing showed `commitV2SaveLayout(...)` consuming `183,319ms` before auxiliary writes, hot-turn append, reload, or legacy comparison. Root cause was `chunkV2SegmentEntries(...)` rebuilding and stable-byte-counting the growing segment for every entry. The chunker now uses exact binary sizing per segment, preserving the max-byte contract while dropping the measured initial v2 layout commit to `2,805ms` in the same harness. The scale gate now asserts the initial 5000-message commit stays under `60,000ms`, while retaining the same proof: `3` event segments, `1` diagnostics segment, `4` hot-turn writes, `8` hot-turn reads, zero sealed segment reads/rewrites, zero open-tail overwrites, redaction canaries clean, and legacy full-save pressure still demonstrated at `16,177,360` bytes.
- LENS production prompt budget trace cut, July 2: `createLensPromptScheduler(...)` now emits a compact `directive.lensPromptBudgetTrace.v1` for real prompt flushes, attaches a `directive.lensPromptBudgetTraceRef.v1` to installed packet/cache records, and writes the trace into CORE prompt diagnostics alongside cache inputs. The fallback lane builder covers stable rules, protected continuity, active scene, active cast, mission pressure, recent transcript, recall, volatile turn, and external environment refs without storing prompt body, transcript, provider output, external memory, Summaryception summary text, vector payloads, embeddings, or secrets. Production runtime activation now carries the trace through the host prompt install path. Focused proof: `test-architecture-redesign-system-skeletons.mjs`, `test-prompt-dirty-domains.mjs`, `test-lens-prompt-budget-lane-contracts.mjs`, and `test-chat-native-runtime-flow.mjs`.
- LENS prompt overflow policy cut, July 2: `directive.lensPromptBudgetTrace.v1` lanes now record `overflowPolicy`, `status`, `budgetExceeded`, `blocking`, `reservedFloorSatisfied`, and `overBudgetRefs`. Ordinary lanes keep deterministic `omit-overflow` behavior with `budget-exceeded` omitted refs. The protected continuity lane defaults to `fail-closed`: over-budget protected refs remain included for audit continuity, get mirrored as compact `protected-budget-exceeded` over-budget refs, and mark the lane `blocked-over-budget`/`blocking: true` so scheduler enforcement can fail closed instead of silently dropping hard-floor continuity. The diagnostic external-environment lane remains `diagnostic-only`, never blocks, and still carries zero Directive authority. Focused proof: `test-lens-prompt-budget-lane-contracts.mjs` covers ordinary recall overflow, protected continuity overage, diagnostic external context, and raw-content canaries.
- LENS prompt budget enforcement cut, July 2: `createLensPromptScheduler(...)` now derives block-level budget refs from prompt blocks when explicit lanes are absent, applies trace omissions before prompt install, strips build-only/raw `promptBudgetLanes`, `rawPromptBody`, and `rawResponse` fields from the installed packet, and records compact `directive.lensPromptBudgetEnforcement.v1` evidence. Ordinary over-budget refs remove matching blocks before install; protected-continuity overage returns `promptBudgetBlocked`, writes a warning diagnostic, and does not call the host prompt installer. Focused proof: `test-lens-prompt-budget-lane-contracts.mjs` covers scheduler filtering for recall blocks, no raw omitted recall text in returned/install packets, and protected over-budget blocking with zero install calls; `test-architecture-redesign-system-skeletons.mjs` and `test-prompt-dirty-domains.mjs` cover adjacent production scheduler behavior.
- LENS builder lane metadata cut, July 2: `context-orchestrator.mjs` now assigns `lensPromptBudgetLane` to every selected open-world context block and records that lane in runtime prompt-context metadata; `projection-matrix.mjs` assigns LENS lanes to every static continuity prompt block. The scheduler keeps regex derivation as a fallback, but normal prompt packets now carry builder-owned lane intent into LENS budget traces and enforcement. Focused proof: `test-open-world-context-budget.mjs`, `test-player-safe-prompt-context.mjs`, `test-continuity-projection-foundation.mjs`, `test-lens-prompt-budget-lane-contracts.mjs`, `test-prompt-dirty-domains.mjs`, and `test-architecture-redesign-system-skeletons.mjs`.
- Package-driven LENS lane budget cut, July 2: `context-policy.schema.json` now allows optional `contextPolicy.lensPromptBudgetLanes` overrides for the nine LENS lanes, and the Ashes package declares explicit lane budgets/floors plus protected-continuity fail-closed and external-environment diagnostic-only policy. `runtime-app.mjs` passes those package overrides through `campaignContext.promptBudgetLaneOverrides`, includes them in the LENS prompt policy hash, and `lens-prompt-scheduler.mjs` applies them to derived lanes and prompt cache identity. `lens-prompt-budget-trace.mjs` records sanitized overrides under trace cache inputs. Focused proof: `validate-campaign-package.mjs`, `test-campaign-package-importer.mjs`, `test-campaign-package-context.mjs`, `test-lens-prompt-budget-lane-contracts.mjs`, and `test-chat-native-runtime-flow.mjs`, including activation-time evidence that Ashes protected continuity uses the package override.
- Witness-scoped continuity fact gate cut, July 2: `createContinuityFact(...)` now normalizes `knownBy`, `witnessedBy`, `subjectIds`, `disclosureState`, `disclosureSourceFrameId`, and allowlisted `evidenceRefs`, stripping raw transcript/provider/prompt/text/selection/quote/excerpt evidence from both top-level refs and semantics refs unless they are compact hash refs. `validateContinuityProjectionPlan(...)` now applies the current source Frame's relevant/present/referenced actor ids before accepting render operations, guard focus, compression groups, or required hard-floor insertion: private/secret/inferred/false-belief facts are rejected unless a relevant actor is in `knownBy` or `witnessedBy`, while public/shared facts keep existing behavior. Rendered continuity lines include a compact `Knowledge scope` marker for actor-scoped facts so multi-actor prompts do not silently flatten private knowledge into shared truth. Focused proof: `test-continuity-projection-foundation.mjs` verifies a Bronn-known private fact can render in a Bronn scene with scope metadata while a Sam-only private fact is rejected and never appears in prompt text; `test-continuity-projection-plan-validator.mjs` verifies hard-floor and guard-focus anti-telepathy rejection plus allowed selection for Sam's own scene, including present-actor fallback; `test-storage-scale-5000.mjs` keeps witness-fact segments bounded at scale.
- Witness false-belief/inferred semantics cut, July 2: false-belief and inferred continuity facts are now perspective/provisional records, not protected objective truth. `createContinuityFact(...)` caps inferred confidence at `0.7` and false-belief confidence at `0.5`. `buildContinuityFactIndex(...)` keeps actor-scoped false beliefs in a separate conflict partition so a character's wrong belief can coexist with the source-backed objective fact without replacing it, while inferred facts lose precedence ties against asserted facts. `validateContinuityProjectionPlan(...)` prevents false-belief/inferred facts from becoming hard invariants, lowers requested invariant lanes to `directive.continuity.domain`, and rejects `guardOnly` use for perspective/provisional facts. Focused proof: `test-continuity-projection-foundation.mjs` now verifies confidence caps, objective fact plus false-belief coexistence, Sam-scoped perspective rendering, knowledge-scope disclosure markers, and invariant-lane lowering; `test-continuity-projection-plan-validator.mjs` verifies planner lane lowering, guard rejection, and no guard fact insertion for false-belief records; adjacent proof passed for `test-player-safe-prompt-context.mjs`, `test-storage-scale-5000.mjs`, `test-architecture-redesign-system-skeletons.mjs`, and `test-lens-prompt-budget-lane-contracts.mjs`; full `run-alpha-gate.mjs` passed `201` checks after the cut.
- Witness visibility/group migration cut, July 2: legacy broad visibility labels now migrate into witness disclosure semantics at the schema boundary instead of relying on every materializer to supply new fields immediately. `createContinuityFact(...)` and `factKnowledgeScope(...)` derive `directorOnly` and `hidden` facts as `secret`, while `narratorSafe` and `playerFacing` remain `public` unless an explicit disclosure state is supplied. `buildContinuitySourceFrame(...)` now carries scene group ids and actor group maps, and `isFactAllowedForSourceFrame(...)` expands `knownBy`/`witnessedBy` group ids against the current Frame before accepting a scoped fact. Focused proof: `test-continuity-projection-foundation.mjs` verifies director-only/hidden visibility migration, group-known senior-staff private fact inclusion for a present group member, and outsider blocking; `test-continuity-projection-plan-validator.mjs` verifies the same migration and group expansion at planner-validation depth. Adjacent proof passed for `test-player-safe-prompt-context.mjs`, `test-continuity-director-packets.mjs`, `test-storage-scale-5000.mjs`, and `test-architecture-redesign-system-skeletons.mjs`; full `run-alpha-gate.mjs` passed `201` checks after the cut.
- Witness active-cast LENS lane weighting cut, July 2: `buildContinuityProjectionMatrix(...)` now emits compact per-fact `directive.continuityFactRef.v1` budget refs for selected continuity facts. Actor/group-scoped facts are assigned to the `activeCast` LENS lane, while objective continuity facts stay in `protectedContinuity`; the rendered prompt block remains a normal continuity block, but LENS budget traces can now account for actor-scoped witness pressure separately from protected invariants. `createLensPromptScheduler(...)` consumes block-level `promptBudgetRefs`/`lensPromptBudgetRefs`, adds them to the target lanes, and strips those build-only refs from returned/installed packets after trace construction so raw nested budget metadata cannot become prompt payload state. Focused proof: `test-continuity-projection-foundation.mjs` verifies actor-scoped Bronn and senior-staff witness facts emit `activeCast` budget refs with no raw fact prose in refs; `test-lens-prompt-budget-lane-contracts.mjs` verifies nested continuity refs feed both `activeCast` and `protectedContinuity`, raw nested ref text is absent from flush output, and installed packets strip build-only refs. Adjacent proof passed for `test-prompt-dirty-domains.mjs`, `test-chat-native-runtime-flow.mjs`, `test-runtime-host-injection.mjs`, and `test-architecture-redesign-system-skeletons.mjs`. Remaining witness work is broader authored materializer enrichment where domain data can provide richer `knownBy`/`witnessedBy` fields than visibility-derived defaults, plus live proof that Ashes artifacts include these lane refs without raw-content leakage.
- Recall Index source-mutation/fork contract cut, July 2: `queryRecallIndex(...)` now enforces campaign/save/branch scope before scoring entries, preventing mixed-segment or branch-copy recall leaks. `createRecallSourceMutation(...)` and `applyRecallSourceMutation(...)` add a deterministic contract for source edit/delete, assistant edit/delete, selected-swipe, rollback, branch, and Save As handling: source mutations mark matching recall entries stale with compact invalidation refs, branch/Save As forks valid refs to the target save/branch, stale entries are not revived, and replacement/source refs are sanitized for raw selected text, prompts, transcripts, provider output, vector payloads, embeddings, and secrets. Focused proof: `test-directive-recall-index-contracts.mjs` covers scope mismatch omission, selected-swipe invalidation, raw replacement ref redaction, Save As fork refs, and semantic candidates remaining non-authoritative. Remaining work is wiring this contract into production Save As/source-mutation paths and auxiliary recall artifact storage.
- Recall Index production hook follow-up, July 2: REPAIR source-mutation recovery now attaches a compact `directive.recallSourceMutation.v1` to `sourceMutation` projections for source edit/delete, assistant edit/delete, and selected-swipe changes, using campaign/save/branch scope plus source Frame and host-message ids without raw replacement text. Save Game As now returns CORE branch-clone Recall fork evidence through `coreBranchClone.recallSourceMutation`; when source CORE state is missing, the branch result reports `skipped: true` with the Recall fork intent instead of pretending an auxiliary clone happened. Focused proof: `test-chat-native-runtime-flow.mjs` verifies Save As branch evidence and runtime player-source edit Recall invalidation evidence; `test-repair-runtime.mjs`, `test-message-recovery.mjs`, `test-core-store-v2.mjs`, and `test-active-save-facade-v2.mjs` cover adjacent REPAIR/CORE behavior. Remaining work is full auxiliary recall artifact storage/fork rewriting rather than evidence-only production hooks.
- Correct-as-Swipe candidate-swipe workflow slice, July 2: `src/runtime/correct-as-swipe.mjs` now owns the `correctAsSwipe.propose` runtime contract, compact correction case, evidence-verdict refs, candidate swipe provenance, selected-swipe acceptance boundary, and raw-text exclusion. `runtime-app.mjs` exposes `proposeCorrectAsSwipeCandidate(...)`; `runtime-shell.js` and `runtime-mount.js` register the runtime action; fake and SillyTavern chat adapters support `appendAssistantMessageSwipe({ select: false })` so candidate correction swipes can be appended without changing the visible/selected assistant variant. SRE selected-text verdict production now runs through `source-review-worker.mjs` and `source-reconciliation-engine.mjs`, emits `directive.sreCorrectAsSwipeEvidenceVerdict.v1`, supports supported/contradicted/unsupported/ambiguous/external-only verdicts, and stores only compact refs/hashes/summary hashes. REPAIR reject/expire lifecycle now runs through `buildCorrectAsSwipeLifecycleDecision(...)`, `settleCorrectAsSwipeCaseLifecycle(...)`, and the `correctAsSwipe.settleCase` runtime action, storing compact reason hashes and optional CORE diagnostics without mutating host prose or continuity. Selected-swipe acceptance now has a narrow marker path: `MessageReconciler` checks matching Correct-as-Swipe candidate swipe index plus selected-text hash before generic REPAIR selected-swipe recovery, marks the case accepted with compact `acceptedSelection` refs, and leaves non-matching swipes on the existing recovery path. The SillyTavern highlighted-selection UI now exposes an assistant-only Correct-as-Swipe button beside Add Component and Define Selection, opens a candidate-swipe textarea seeded from the full assistant row, and submits `correctAsSwipe.propose` without DOM elements or rects in the runtime payload. Focused proof: `test-correct-as-swipe-workflow.mjs` verifies SRE-derived verdict sanitizing, candidate append, compact response-ledger case, optional CORE diagnostics, REPAIR lifecycle rejection, accepted selection refs, no raw selected/proposed/reason text in verdict/case/state/diagnostic, no continuity mutation, duplicate host append reuse, and selected swipe remaining unchanged until user selection; `test-message-recovery.mjs` verifies known candidate selection does not create generic REPAIR recovery while ordinary selected-swipe source mutations still do; `test-mission-components-capture.mjs` verifies the assistant-scoped UI affordance and runtime payload shape. Existing swipe flows stay covered by `test-sillytavern-chat-prompt-adapters.mjs`, `test-chat-turn-orchestrator.mjs`, `test-extension-shell.mjs`, `test-runtime-host-injection.mjs`, and `test-chat-native-runtime-flow.mjs`. Live proof hook: `node tools/scripts/test-correct-as-swipe-live.mjs` now fails closed on served-copy mismatch, missing explicit soak user, and `default-user`, opens the bound campaign chat, selects a recorded Directive assistant response in browser DOM, appends a candidate through the UI, proves the selected visible swipe remains unchanged, verifies compact correction state has no raw selected/proposed text, and exercises selected-swipe acceptance through the runtime event bridge. Remaining Correct-as-Swipe work is to run this hook on Ashes with a `directive-soak-*` user, archive the artifact under Wave 4 proof, and add native SillyTavern swipe-button actuation if the host exposes a stable control.
- Live-readiness preflight refresh, July 2: deterministic external/live-prep gates passed before any new live lane work: `test-live-soak-prep.mjs`, `test-continuity-matrix-five-user-soak-coordinator.mjs`, `test-external-context-summary-artifact.mjs`, `test-external-context-fixture-prep.mjs`, `test-sillytavern-external-context-readiness-preflight.mjs`, `test-continuity-matrix-full-certification-preflight.mjs`, `test-smoke-sillytavern-core-proof-targeting.mjs`, and `test-generation-timing-proof-policy.mjs`. Offline readiness passed for `directive-soak-a` through `directive-soak-e` with `default-user` excluded, rich active external-context fixture depth present, and artifact root `artifacts/live-soak/sillytavern-campaign/2026-07-02T16-23-21-454Z`. Live readiness then passed against `http://127.0.0.1:8000` with `--activate-external-context-fixture --write-artifacts`, confirming five-user storage isolation, browser/runtime external-context probe coverage, fixture activation for every non-human lane, and artifact root `artifacts/live-soak/sillytavern-campaign/2026-07-02T16-23-31-817Z`. The dry-run five-user coordinator wrote planned Ashes lane evidence at `artifacts/live-soak/continuity-projection-matrix-five-user/2026-07-02T16-24-29-671Z`, mapping all five lanes to non-human soak users. The next bounded `--live --turn-limit 3 --activate-external-context-fixture --write-artifacts` coordinator run is ready from a preflight standpoint but requires explicit approval because it mutates persistent non-human SillyTavern profiles and runs live model-backed turns.
- Bounded five-user Ashes live proof, July 2: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-07-02T22-14-31-788Z/report.json` now returns `ok: true` / aggregate `warning` after `--resume`. The run used only `directive-soak-a` through `directive-soak-e`, left `default-user` untouched, and passed non-human lane selection, external-context readiness proof, host-native completion turn coverage, continuity prompt/source proof, external-context generation proof, persisted CORE generation-start timing, persisted CORE host-native completion, durable model-call failure policy, deterministic and model-assisted factual grounding, and model-assisted story-quality review. The initial pass found a real `hostContinueReleased` without visible assistant completion in `ashes-sidecars-timekeeping`; the resumed pass reused the four good lanes and reran that lane successfully. Follow-up full-certification preflight now recomputes fixture depth from the raw readiness probe rather than trusting stale aggregate fixture-depth summaries, and `--coverage-standard all-lanes` passes after accepting Memory Books active-book metadata plus valid range diagnostics as rich evidence even when a lane has no `1_memory` prompt key. The same strict preflight now treats aggregate/lane execution warnings from the bounded run as depth-only, so aggregate/lane execution pass and the remaining red checks are the real full-certification gaps: bounded three-turn depth, lower-than-full prompt/fact artifact depth, and lower-than-full external-context generation depth. SRE latest-pair model timeouts are capped at 8 seconds and classified as fallback-handled only for the no-mutation/no-prompt-authority `sourceSettlementLatestPair` role; this preserves fail-closed safety while removing the earlier 30-second latency tax from the release gate.
- CORE response-retry closeout, July 2: `run-alpha-gate.mjs` initially failed at `test-chat-response-recovery.mjs` after the CORE-first recovery cut because the old fixture used a legacy `runtimeTracking.recoveryJournal` row with no CORE transaction or `allowedActions`, and the current REPAIR authorizer correctly refused non-CORE response retry actuation. The focused test now uses a real CORE v2 transaction and `responseRetryRequired` recovery case instead of legacy recovery authority. The runtime fix is in `chat-turn-orchestrator.mjs`: CORE response-retry projection lookup no longer uses the placeholder `responseRetryRequired` projection id as the retry post idempotency key, and later resolved CORE recovery rows suppress earlier required rows with the same recovery id so duplicate retry calls do not reopen a closed case. Focused proof passed for `test-chat-response-recovery.mjs`, `test-chat-turn-orchestrator.mjs`, `test-response-dispatcher-core-bridge.mjs`, and `test-runtime-ledger-view.mjs`; the full `run-alpha-gate.mjs` then passed `201` checks, including both 5000-message scale gates and the external-context/five-user certification preflight tests.
- Structured Recall retrieval metadata slice, July 2: `recall-index.mjs` now normalizes first-class retrieval metadata on Recall Index entries: retrieval mode, bounded priority, audience, known-by actors, source authority, and sanitized RAG hints. `createRecallQuery(...)` accepts retrieval-mode, audience, known-by, and source-authority facets, and `queryRecallIndex(...)` filters mismatches before scoring while still keeping optional semantic/vector candidates non-authoritative and disabled unless explicitly requested. `recall-index.schema.json` now declares the retrieval metadata object and query facets. Focused proof in `test-directive-recall-index-contracts.mjs` covers package/reviewed-import-style facets, deterministic package-lore filtering, known-by/audience/source-authority scoring, semantic candidates remaining diagnostic-only, and raw prompt/vector/embedding/secret canary stripping from RAG hints and result refs. Adjacent proof passed for `test-architecture-redesign-scale-harness.mjs`, `test-storage-scale-5000.mjs`, `test-lens-prompt-budget-lane-contracts.mjs`, `test-architecture-redesign-system-skeletons.mjs`, and full `run-alpha-gate.mjs` (`201` checks). Remaining Recall work is still auxiliary recall artifact storage/fork rewriting; this slice closes the explicit structured lore/RAG metadata contract gap without adding a required vector database or importing ST Lorebooks as Directive authority.
- Director package retrieval-to-Recall bridge, July 2: `dataset-index.mjs` now builds package-authority Recall Index entries from crew and ship director cards, carrying hash-only card refs, card/source facets, lanes, keywords, bounded package previews, retrieval mode, priority, audience, known-by actors, source authority, and sanitized RAG hints. `runDirectorRetrieval(...)` now exposes Recall Index diagnostics and packet-level `recallRefs` for every audience while preserving the existing Director packet selection path; this lets LENS/SRE/REPAIR/FORGE consume structured package lore metadata without treating ST Lorebooks, raw Director card payloads, or vector stores as Directive authority. `director-card.schema.json` now allows authored retrieval facets (`mode`, `audience(s)`, `knownBy`, `sourceAuthority`, `ragHints`) for future packages. Focused proof in `test-director-retrieval-orchestration.mjs` verifies Ashes shuttle package Recall refs for Intrepid shuttle approach/shuttlebay facts, package source authority, narrator audience filtering, retrieval-mode scoring, packet exposure, and raw package constraint/anchor exclusion from Recall diagnostics. Adjacent proof passed for `test-crew-retrieval-fixture.mjs`, `test-directive-recall-index-contracts.mjs`, `test-campaign-package-importer.mjs`, `validate-campaign-package.mjs`, `test-architecture-redesign-scale-harness.mjs`, `test-storage-scale-5000.mjs`, `test-runtime-host-injection.mjs`, and full `run-alpha-gate.mjs` (`201` checks). Remaining Recall work is auxiliary artifact storage/fork rewriting; structured package/dataset loader/query gating is now implemented at deterministic depth.
- Recall auxiliary artifact storage/fork cut, July 2: CORE background batches now persist accepted worker `recallEntries` into bounded `directive.recallIndexSegment.v1` auxiliary artifacts under the CORE save path, while the event bundle stores only compact `recallAuxiliaryRefs` rather than full entry bodies. Auxiliary entries are normalized through the Recall Index contract before write, stripping raw transcripts, selected text, prompts, provider output, vector payloads, embeddings, secrets, and Qdrant payloads. `copyCoreStoreStateV2ForSaveBranch(...)` now reads source Recall auxiliary refs, applies the deterministic Save As `directive.recallSourceMutation.v1`, writes forked target-save/target-branch Recall auxiliary segments, preserves `forkedFromRef` provenance, and rewrites copied CORE background events to point at the target refs. Runtime Save Game As now exposes `coreBranchClone.recallAuxiliaryRewrite` alongside the existing compact mutation evidence, so production no longer reports Recall fork intent without doing the auxiliary rewrite. Focused proof in `test-core-store-v2.mjs` covers source auxiliary segment persistence, raw canary stripping, target Save As fork segment writes, target-only event refs, target save/branch scoping, and preserved source provenance. Adjacent proof passed for `test-chat-native-runtime-flow.mjs`, `test-directive-recall-index-contracts.mjs`, `test-storage-scale-5000.mjs`, `test-architecture-redesign-system-skeletons.mjs`, and full `run-alpha-gate.mjs` (`201` checks). Remaining Recall work is to broaden producer coverage for all FORGE/REPAIR paths that should supply full Recall entries, but the storage/fork substrate is now real rather than evidence-only.
- FORGE Recall auxiliary producer cut, July 2: `createForgeBatchCommit(...)` now carries worker-produced `recallEntries` as write-only CORE input, and the FORGE coordinator passes those entries into every accepted background batch path that already commits `recallEntryRefs`. CORE still strips full entries out of the persisted event bundle and writes only compact `recallAuxiliaryRefs`, so scene/phase seal production now generates real auxiliary Recall segments rather than only refs. `test-forge-scene-phase-seal.mjs` now proves `settleScenePhaseSeal(...)` carries one Recall entry, hydrated CORE projections expose one auxiliary ref, the auxiliary segment can be read back, and raw provider summary/transcript canaries do not survive in refs or stored entries. Adjacent proof passed for `test-core-store-v2.mjs`, `test-forge-internal-background-settlement.mjs`, `test-background-projection-batch.mjs`, `test-chat-native-runtime-flow.mjs`, `test-runtime-stage18-rerun-branch-recovery.mjs`, and full `run-alpha-gate.mjs` (`201` checks). Remaining Recall producer work is narrower: REPAIR/source-mutation and any non-scene FORGE workers that create first-class Recall entries still need explicit producer coverage.
- REPAIR source-mutation Recall rewrite cut, July 2: `markRecoveryRequired(...)` now detects compact `sourceMutation.recallSourceMutation`, reads the current CORE Recall auxiliary snapshot, applies `applyRecallSourceMutation(...)`, writes a replacement `directive.recallIndexSegment.v1` snapshot, and stores compact `recallAuxiliaryRewrite`/`recallAuxiliaryRefs` evidence on the CORE recovery projection. The auxiliary ref collector now treats source-mutation rewrites as snapshot replacement rather than append-only history, so later Save As forks only current valid Recall entries and does not revive stale source-edit/delete/selected-swipe entries from older auxiliary segments. Focused proof in `test-core-store-v2.mjs` covers accepted Recall entries becoming stale after a source edit, raw replacement-text exclusion, projection-level rewrite refs, and a later Save As producing zero forked refs from stale source entries. Runtime proof in `test-chat-native-runtime-flow.mjs` verifies real source-edit recovery projections now carry `directive.recallAuxiliaryRewrite.v1` evidence. Adjacent proof passed for `test-message-recovery.mjs`, `test-repair-runtime.mjs`, `test-architecture-redesign-system-skeletons.mjs`, `test-storage-scale-5000.mjs`, `test-forge-scene-phase-seal.mjs`, and full `run-alpha-gate.mjs` (`201` checks). Remaining Recall producer work is now limited to non-scene FORGE workers that create first-class Recall entries.
- FORGE pressure/arc Recall auxiliary proof cut, July 2: `createPressureArcDigestWorkerResult(...)` already produced first-class Recall entries, and the shared `createForgeBatchCommit(...)`/FORGE coordinator wiring now passes those entries into CORE just like scene/phase seals. The focused gap was proof: `test-forge-pressure-arc-digest.mjs` now verifies accepted pressure/arc batches carry one `recallEntries` item, hydrated CORE projections expose one `directive.recallIndexSegment.v1` auxiliary ref, the auxiliary segment can be read back, and raw pressure/arc provider-summary/body/thread/callback canaries do not survive in refs or stored entries. Adjacent proof passed for `test-core-store-v2.mjs`, `test-forge-scene-phase-seal.mjs`, `test-forge-internal-background-settlement.mjs`, and `test-background-projection-batch.mjs`. This closed the known non-scene FORGE Recall producer/storage proof gap.
- LENS hybrid Recall consumption cut, July 2: `runDirectorRetrieval(...)` now accepts CORE Recall entries from auxiliary storage/projections and merges them with package-derived Recall entries before querying. Retrieval queries use deterministic, scene-seal, reviewed-import, and package modes together, so CORE/FORGE scene-seal evidence and package lore can appear in the same audience packet without a vector dependency or external-tool authority. `lens-prompt-scheduler.mjs` now turns packet-level `recallRefs` and `omittedRecallRefs` into the Recall prompt budget lane automatically when explicit lanes are not provided, and packet refresh keeps only compact ref fields so raw source text, raw seal summaries, package previews, and stale Recall text do not survive in installed packets or budget traces. Focused proof in `test-director-retrieval-orchestration.mjs` verifies a CORE scene-seal Recall ref outranks package refs for the Ashes shuttle rendezvous while still retaining package shuttlebay Recall; `test-lens-prompt-budget-lane-contracts.mjs` verifies automatic Recall lane inclusion, budget overflow omission, stale-source omission, and raw canary stripping. Adjacent proof passed for `test-storage-scale-5000.mjs`. Remaining Recall work was production/runtime pass-through and live/integration certification.
- Production CORE-Recall to Director/LENS cut, July 2: runtime prompt synchronization now reads current CORE Recall auxiliary entries through `runtimeCoreTurnStore.readRecallIndexAuxiliaryEntries(...)` and `readCoreRecallIndexAuxiliaryEntries(...)`, passes compact CORE Recall evidence into `createLensPromptInput(...)`, and lets `buildLensPromptPacket(...)` convert CORE entries into hash-only `recallRefs`. Runtime Director turns, provisional turns, rerun previews, the open-world coordinator, and tactical Mission Director turns now accept the same `coreRecallEntries` lane so production Director packets can query CORE scene-seal/Recall evidence alongside package Recall. Chat-native prompt sync also carries committed narrator `recallRefs` from the turn packet into the LENS prompt frame, so immediate post-turn prompt rebuilds have Recall lane evidence without re-reading raw transcript history. Focused proof passed in `test-runtime-director-turn.mjs` for runtime Director CORE Recall pass-through and raw canary stripping; `test-lens-prompt-budget-lane-contracts.mjs` for production LENS packet conversion; `test-chat-native-runtime-flow.mjs`, `test-runtime-host-injection.mjs`, `test-prompt-dirty-domains.mjs`, `test-open-world-director-coordinator-contracts.mjs`, and `test-mission-director-loop.mjs` for adjacent runtime/prompt/coordinator compatibility. Remaining Recall work is live certification: run the Ashes live lanes and prove persisted artifacts include Recall/budget evidence without full-history rewrites.

Coordinator artifact contract:

```text
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/report.json
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/summary.md
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/live-log.jsonl
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/readiness/<runId>-readiness/report.json
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/readiness/<runId>-readiness/host-extensions/compatibility.json
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/readiness/<runId>-readiness/host-extensions/external-context-probe.json
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/readiness/<runId>-readiness/host-extensions/external-context-probe.<handle>.json
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/lanes/<laneId>/<runId>-<laneId>/report.json
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/lanes/<laneId>/<runId>-<laneId>/summary.md
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/lanes/<laneId>/<runId>-<laneId>/live-log.jsonl
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/lanes/<laneId>/<runId>-<laneId>/host-extensions/external-context-summary.json
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/lanes/<laneId>/<runId>-<laneId>/fact-checks/canary-index.json
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/lanes/<laneId>/<runId>-<laneId>/transcript/readable-chat.md
artifacts/live-soak/continuity-projection-matrix-five-user/<runId>/lanes/<laneId>/<runId>-<laneId>/prompt-inspection/*.json
```

Readiness external-context evidence appears in:

- coordinator report: `.readiness.externalContextProbe`;
- coordinator check: `.checks[] | select(.id=="external-context-readiness-proof")`;
- readiness report: `.externalContextProbe`;
- raw probe: `readiness/<runId>-readiness/host-extensions/external-context-probe.json`.

Generation external-context evidence appears in:

- coordinator lane records: `.lanes[].externalContextProof` for the latest prompt snapshot summary and `.lanes[].externalContextGenerationProof` for pre-generation snapshot depth and rich-fixture pressure;
- coordinator check details: `.checks[] | select(.id=="external-context-generation-proof").details.lanes`;
- lane host-extension summary: `lanes/<laneId>/<runId>-<laneId>/host-extensions/external-context-summary.json`;
- lane prompt snapshots: `lanes/<laneId>/<runId>-<laneId>/prompt-inspection/*.json`.

For full-depth release proof, `.lanes[].externalContextGenerationProof.expectedScriptMessageIds` must match the Ashes script scope, and `.missingScriptMessageIds`, `.unexpectedScriptMessageIds`, `.duplicateScriptMessageIds`, and `.missingScriptMessageIdCount` must all be empty/zero. For rich prepared fixture users, `.lanes[].externalContextGenerationProof.richFixturePressure.status` must be `pass`. The details should show compact target evidence for ST Lorebooks/World Info, Memory Books, Summaryception, VectFox, `finalHostPromptMayIncludeExternal`, and redaction reasons without raw prompt bodies or external generated content.

The lane `host-extensions/external-context-summary.json` artifact is intentionally not a raw prompt-inspection archive. It must pass the same unsafe-field scan used by coordinator and full-certification preflight: redaction reasons and redaction path metadata are allowed, but raw lorebook text, generated Memory Books text, Summaryception summaries, VectFox payloads, embeddings, endpoint URLs, collection names, API keys, secrets, provider bodies, and hidden Director material fail the lane. It must also prove final-host-prompt external influence was possible and provide non-placeholder compact evidence for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox.

Host-native completion evidence appears in:

- smoke report: `.browser.chatCampaignFlow.rounds[].hostNativeCompletion.persisted`, `.browser.chatCampaignFlow.rounds[].hostNativeCompletionRequirement`, and `.browser.chatCampaignFlow.hostNativeCompletionProof`;
- compact smoke summary: `.chatCampaign.hostNativeCompletionStatus`, `.chatCampaign.hostNativeCompletionProofSource`, `.chatCampaign.hostNativeCompletionProofCompletionSource`, `.chatCampaign.hostNativeCompletionCount`, `.chatCampaign.hostNativeCompletionFailureCount`, `.chatCampaign.hostNativeCompletionRequiredCount`, `.chatCampaign.hostNativeCompletionRequiredPassCount`, `.chatCampaign.hostNativeCompletionRequiredFailureCount`, and `.chatCampaign.hostNativeCompletionMaxLatencyMs`;
- delegated soak check: `.checks[] | select(.id=="live-host-native-completion-proof")`;
- coordinator lane records: `.lanes[].hostNativeCompletionProof`;
- coordinator aggregate check: `.checks[] | select(.id=="host-native-completion-core-proof")`.

Certification requires `source: "coreStoreResponseLedger"`, `completionSource: "coreProjection"`, `completedHostContinueCount > 0`, no failed hostContinue completions, no raw assistant text in proof artifacts, and a passing required-turn binding for every scripted `hostNativeCompletionRequired` message. For Ashes, the required object is currently `scriptMessageId: "soak-turn-03"`, `turn: 3`, `expectedRoute: "hostContinue"`, and `expectedResponseStrategy: "injectAndContinue"`. Count-only proof is limited evidence and must not satisfy release certification.

Model-call failure policy evidence appears in:

- lane report policy: `.modelCallPolicy.failurePolicyEvidence`;
- lane check: `.checks[] | select(.id=="live-model-call-failure-policy")`;
- coordinator lane records: `.lanes[].modelCallFailurePolicy`;
- coordinator aggregate check: `.checks[] | select(.id=="model-call-failure-policy")`;
- full-certification preflight lane records: `.lanes[].modelCallPolicy`;
- full-certification preflight aggregate check: `.checks[] | select(.id=="model-call-failure-policy")`.

Certification requires lane-owned durable evidence first. Raw `smoke-chat-soak/report.json` retained model calls may explain or populate the policy object, but they are not a substitute for `modelCallPolicy.failurePolicyEvidence` in the lane report.

Message-mutation actuation evidence appears in the Architecture Redesign release bundle as `message-mutation-actuation-proof.json`:

- top-level `kind: "directive.sillytavernMessageMutation.actuationProof.v1"`;
- top-level `driver: "playwright"`, non-human `sillyTavernUser`, `defaultUserTouched: false`, and served-extension freshness evidence;
- `artifacts` refs for the source-edit, source-delete, assistant-edit, assistant-delete, and selected-swipe child reports;
- five passing scenarios with ids `source-edit`, `source-delete`, `assistant-edit`, `assistant-delete`, and `selected-swipe`.

The proof producer must validate more than those top-level fields. Edit/delete child reports must include `directive.sourceMutationProof.v1`: target host id, source role, tracked ingress/response kind, mutation kind, original/replacement text hashes or delete original hash, native host-control evidence, ledger status after mutation, CORE recovery status/case refs, compact REPAIR decision kind/action/event type, and prompt-context delta. Old recovery-journal/count deltas are optional legacy telemetry only and cannot be the owner evidence. Selected-swipe child reports must include `directive.sourceIntegrityProof.v1`: selected host assistant source id, `actuationMode: "native-host-swipe-control"`, `nativeHostControlMoved: true`, selected swipe index, swipe count, source-integrity status, selected-hash equality with the accepted assistant variant, absence of discarded-swipe canaries from committed state, SRE/Scene Handshake decision status, and source hash refs. Setup-assisted native selected-swipe actuation is proven at `artifacts/live-smoke/selected-swipe-actuation/2026-07-02T23-41-07-914Z/selected-swipe-actuation-report.json`. Final natural latest-response proof is now also proven at `artifacts/live-smoke/selected-swipe-actuation/2026-07-03T00-11-15-605Z/selected-swipe-actuation-report.json`: `targetSetup: null`, non-default `directive-soak-b`, served extension fresh, latest CORE-recorded Ashes host-generation row `51`, native `.last_mes .swipe_right` actuation, selected index `0 -> 1`, `nativeHostControlMoved: true`, `sourceIntegrity: "clean"`, and no diagnostic fallback. The code implication is part of the plan: Correct-as-Swipe and the SillyTavern adapter must use CORE/ledger response authority for natural host-generation rows, while unrecorded assistant rows remain ineligible. Shallow scenario shells are acceptable only as release-bundle summary inputs after the strict producer has already validated the child reports, and the bundle preflight now rejects count-only mutation summaries that omit CORE/REPAIR owner proof or use staged selected-swipe evidence as release actuation.

The readiness probe must classify `stLorebooks`, `memoryBooks`, `summaryception`, and `vectFox` as `browser-confirmed`, `disabled`, `not-installed`, `disk-confirmed`, `settings-only`, `unavailable`, or `indeterminate`. `browser-confirmed`, `disabled`, and `not-installed` are pass statuses. `disk-confirmed` or `settings-only` without browser confirmation is limited evidence and should remain warning/failure depending on the run requirement.

Exit gate:

- 5000-message synthetic campaign passes size/write/load/replay targets.
- HostContinue and directiveCommit generation-start targets pass under controlled provider latency.
- Live proof records persisted transaction timing, not only chat output.
- Live proof records terminal host-native completion from CORE response projections, not only release timing.
- Live proof records external context-extension state without treating external context as Directive authority.

## Stage 14: Documentation And Cleanup

Goal: make the new architecture discoverable and remove stale instructions.

Owner: Agent-0, optional docs worker.

Tasks:

- Update [Documentation Index](../DOCUMENTATION_INDEX.md).
- Update or supersede [State Transactions And Recovery](../technical/STATE_TRANSACTIONS_AND_RECOVERY.md).
- Update [Player Turn Sequence](../technical/PLAYER_TURN_SEQUENCE.md).
- Update [Testing Strategy](../testing/TESTING_STRATEGY.md) with new v2 tests and live proof.
- Promote the external context-extension compatibility boundary from this plan into durable manuals after runtime behavior proves it. The note must cover ST-Lorebooks / ST Lorebooks / World Info, Memory Books, Summaryception, and VectFox, and say Directive is compatible by preserving and observing host surfaces; it does not operate those tools, call their internals, auto-import their generated material, or treat them as Directive authority.
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

### Recall/Budget Worker

```text
You are the Recall/Budget worker for Directive Architecture Redesign. Read the Narrative Engine Transfer Pivot in docs/planning/ARCHITECTURE_REDESIGN_PROPOSAL.md and the Narrative Engine Transfer Workstream in docs/planning/ARCHITECTURE_REDESIGN_IMPLEMENTATION_PLAN.md. Your lane is Directive Recall Index contracts, deterministic retrieval facets, LENS prompt budget lanes, omission traces, and 5000-message scale impact. Narrative Engine is a design reference, not a port target. Do not add a required vector database, do not store raw transcript/prompt/provider/external content, and do not change source authority. Handoff with schemas, lane budgets, query/invalidation rules, tests, and scale risks.
```

### Witness/Correction Worker

```text
You are the Witness/Correction worker. Your lane is witness-scoped continuity facts and evidence-backed Correct-as-Swipe. SRE owns evidence verdicts and selected-source integrity. REPAIR owns correction cases and allowed actions. Host adapters append candidate swipes; selected-swipe acceptance remains the continuity boundary. Do not mutate accepted assistant prose directly, rerun mechanics, or treat external lore/memory/summary/vector hits as authority. Handoff with fact fields, anti-telepathy tests, correction-case flow, candidate swipe provenance, and integration requests.
```

### FORGE/LENS Worker

```text
You are the FORGE/LENS worker. Your lane is background batch coordination, scene/phase seal settlement, pressure/arc digest refresh, prompt dirty scheduling, prompt budget lanes, and external prompt-environment diagnostics. Keep worker prompts/schemas typed and separate. Do not change mechanics commit or REPAIR policy. Do not clear non-Directive prompt keys or import external extension memory as Directive state. Handoff with batch apply count, prompt rebuild count, scene-seal refs, prompt budget trace evidence, external prompt key coexistence evidence, cancellation behavior, tests run, and any generation-router changes needed.
```

### External Compatibility Worker

```text
You are the External Compatibility worker. Your lane is SillyTavern context-extension coexistence for native ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox. Inspect installed/live surfaces without copying implementation or raw user content. Do not integrate with extension internals, call private APIs as a dependency, import generated memories/summaries/vector hits into Directive state, or change runtime authority policy. Handoff with observable prompt keys, World Info surfaces, chat metadata markers, visibility markers, settings hashes, unavailable signals, redaction risks, prompt-key preservation fixtures, and live-proof artifact expectations.
```

### QA Worker

```text
You are the QA worker. Your lane is deterministic gates, scale fixtures, recall/scene-seal/prompt-budget fixtures, external context-extension fixtures, alpha-gate additions by assignment, and live-proof planning. Do not change product behavior unless Agent-0 assigns a test-only hook or fixture helper. Handoff with exact commands, pass/fail output summaries, artifacts written, redaction checks, size budgets, and residual risks.
```

### Spec-Compliance Reviewer

```text
You are the Spec-Compliance reviewer for a Directive Architecture Redesign slice. Read the assigned slice intake, the relevant section of docs/planning/ARCHITECTURE_REDESIGN_PROPOSAL.md, the relevant section of docs/planning/ARCHITECTURE_REDESIGN_IMPLEMENTATION_PLAN.md, and the worker handoff or changed files. Do not broaden scope and do not implement fixes unless Agent-0 explicitly reassigns you as a worker. Answer whether the patch satisfies the current proposal and plan. Check owner boundaries, required contracts, selected verification, deferred gates, Narrative Engine transfer impact, external-context impact, and pre-alpha cutover rules. Handoff with SPEC_APPROVED or SPEC_REJECTED, exact missing requirements, file/line refs, and the smallest required correction.
```

### Code-Quality Reviewer

```text
You are the Code-Quality reviewer for a Directive Architecture Redesign slice. Read the assigned slice intake, worker handoff, tests, and changed files. Do not re-litigate product scope. Inspect ordering, split-brain bridges, idempotency, stale-source guards, raw-content leaks, unbounded payload growth, old-authority revival, prompt-key ownership, and maintainability. Handoff with QUALITY_APPROVED or QUALITY_REJECTED, exact findings ordered by severity, file/line refs, commands run, and any hidden risk that should become a macro blocker or deferred micro item.
```

## Integration Checklist

Before closing any stage:

- Current pass and worker-concurrency choice are recorded on the Architecture Redesign Board.
- Worker handoffs are received.
- Spec-compliance reviewer handoff is received, or Agent-0 records a waiver because the slice is docs-only, mechanical, or trivial.
- Code-quality reviewer handoff is received, or Agent-0 records a waiver because the slice is docs-only, mechanical, or trivial.
- Agent-0 inspected changed files.
- Targeted tests for the lane pass.
- Recall, prompt budget, witness-scope, scene-seal, and correction-case work either has passing targeted tests or is recorded on the deferred micro board with owner and gate.
- Known red tests/artifacts are classified as macro blockers, integration backlog, micro backlog, or out of scope.
- Remaining bridge code has an owner and removal stage.
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
- Recall Index, prompt budget trace, scene-seal, witness-scope, and correction-case evidence is present when the exercised scenario reaches those features.
- External context diagnostics redact secrets and raw external prompt/vector payloads.

## Final Success Criteria

The redesign implementation is complete when:

1. CORE is the only runtime durable writer for turn work.
2. Frame is the only source provenance token consumed by CPM, SRE, REPAIR, FORGE, and LENS.
3. SRE and REPAIR prevent stale-source, selected-swipe, edit/delete, and dependent-response loops.
4. FORGE applies accepted background work as one batch transaction and one prompt rebuild.
5. FORGE scene/phase seals and pressure digests settle as bounded background batches and update Recall Index/LENS dirty domains without blocking visible generation.
6. LENS coalesces prompt rebuilds, records prompt revision usage honestly, and emits prompt budget traces with included/omitted refs.
7. Recall Index retrieves CORE/Frame/package/scene-seal evidence without archiving raw transcript history or treating optional semantic/vector candidates as truth.
8. Witness-scoped facts drive active-cast/protected-continuity prompt inclusion and prevent character knowledge leakage.
9. Correct-as-Swipe appends candidate swipes with evidence provenance and does not mutate accepted continuity until selected.
10. Known external context-extension tools can coexist: ST Lorebooks, Memory Books, Summaryception, and VectFox are observed/redacted, not cleared, imported, or treated as Directive authority.
11. Open-world mechanics commit bounded events/operations instead of broad root replacement.
12. No hot-path full-save rewrite remains.
13. 5000-message synthetic scale gates pass, including recall index, scene seals, prompt budget traces, correction-case stubs, and external diagnostics.
14. HostContinue and directiveCommit generation start within the required under-60-second architecture budget.
15. Live SillyTavern proof confirms persisted timing, segment sizes, Directive context revision, recall/budget/seal evidence, external context-extension state, and stale-work cancellation.
