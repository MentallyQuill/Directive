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
- No deterministic non-generation post may satisfy architecture latency proof. Skipped posts such as `clarificationNeeded`, `routineCommand`, `locationTransition`, `riskConfirmationNeeded`, campaign intros, and terminal checkpoints must be recorded separately from persisted latency-bearing `entries[]`, and at least one persisted CORE latency-bearing turn must pass.

## Current Decision Record

These decisions are binding for the next implementation stages:

- Forward-only pre-alpha replacement is allowed. Old runtime/save write paths are temporary bridge points, not long-term compatibility surfaces.
- Frame is the final human-facing name for the combined source provenance object. Do not reintroduce SEED Frame as the architecture name.
- External-context support means compatibility and coexistence with ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox. It does not mean direct integration, automatic import, automatic trust, or automatic repair of those tools.
- The v1-to-v2 persistence bridge must preserve manual Save and Save As behavior as explicit v1 checkpoints until the materialized-head/resume contract is complete.
- Queued runtime persistence may write v2 active-state artifacts through the facade and attach them to the existing v1 save-index entry with `v2ManifestRef`.
- Autosave is not automatically the same as queued runtime persistence. Converting autosaves to the v2 active-save facade would remove separate v1 autosave records and pruning behavior, so autosave cutover requires its own design decision and tests.
- A compact v2 materialized head is not automatically a full runtime resume source. Model-call journal continuity, sidecar journal continuity, runtimeTracking projections, and turnLedger projections need explicit rehydration or projection contracts.
- Persisted generation-start timing proof must come from CORE Store projections in the save-scoped `core` layout. The v1 save payload and v2 active-save facade may locate or resume a save during the bridge, but they must not be expanded into durable timing ledgers to satisfy architecture certification.
- CORE timing proof classifies entries by `route + responseKind + generation timestamps`, not route alone. Raw `directivePosted` CORE rows can be generated committed outcomes or deterministic/control posts; only the generated rows count toward `checkedTurnCount`.

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

## External Context Compatibility Workstream

This workstream implements the compatibility boundary defined in [Architecture Redesign Proposal](ARCHITECTURE_REDESIGN_PROPOSAL.md#external-context-extension-compatibility). It is not a plan to absorb ST Lorebooks, Memory Books, Summaryception, or VectFox into Directive. Users may want those tools for context extension, so Directive must coexist with them while preserving its own authority, source identity, prompt ownership, latency metrics, and storage scale targets.

Core rule:

```text
External context may influence generation.
Only Directive-owned records may influence Directive authority.
```

Compatibility means Directive can share the SillyTavern context surface with these tools without owning them. Users may keep ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox active for context extension, but Directive must preserve its own prompt keys, source identity, recovery policy, storage budget, and latency metrics. This is not a requirement to directly integrate with those tools, call their internals, import their generated content, or make their summaries/vector hits Directive truth.

The practical boundary is:

| Concern | Directive behavior |
| --- | --- |
| Prompt ownership | Write, rebuild, and clear only `directive.*` prompt keys. Preserve host-owned World Info surfaces, `summaryception`, `3_vectfox*`, and unknown extension keys. |
| Source authority | Treat external lore, summaries, generated memories, and vector hits as possible generation influence, not committed campaign state. |
| Visibility | Normalize hidden, ghosted, summarized, unhidden, and prompt-excluded rows before REPAIR or SRE. A source row that still exists is not deleted solely because an extension hid it from prompt assembly. |
| Latency | Report Directive architecture latency separately from observable external interceptor/retrieval/model-call delay. |
| Storage | Store only bounded counts, hashes, statuses, refs, and redaction summaries. Never store raw external prompt bodies, generated Memory Book text, Summaryception summaries, vector payloads, embeddings, secrets, or hidden Director material. |

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
| Memory Books | LENS, REPAIR, CORE | Treat Memory Books as a World Info producer with STMB metadata, risky-mode warnings, and range-validation diagnostics. | Fixtures for `stmemorybooks: true`, `STMB_start`/`STMB_end`, `chat_metadata.STMemoryBooks`, chat-bound `world_info`, generated-memory conflicts, stale/inverted ranges, side prompts, auto-hide/unhide, and no raw generated memory persistence. |
| Summaryception | REPAIR, LENS, SRE | Normalize ghosted/summarized rows as visibility mutations and preserve the `summaryception` prompt key. | Fixtures for prompt-key preservation, `extra.sc_ghosted`, `ghostedIndices`, summarized-only ranges, `is_system=true + is_hidden=false`, stale summaries after edit/swipe/branch, and no normal-turn reobserve loop after an edited dependent row. |
| VectFox | LENS, Frame, CORE | Observe vector prompt keys, generation-interceptor hints, external timing, and privacy settings without making retrieval blocking or authoritative. | Fixtures for `3_vectfox*` keys, disabled-present state, interceptor delay, Qdrant unavailable/cloud/local modes, prompt ghosting as prompt exclusion, selected-swipe/reroll mismatch, redacted vector diagnostics, and separate external latency accounting. |

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
- Generation-time external-context proof uses pre-generation prompt-inspection snapshots. For a rich prepared fixture lane, the proof must include target-specific compact evidence for native ST World Info/Lorebooks, Memory Books/STMB, Summaryception, VectFox, final-host-prompt inclusion, and redaction reasons; a generic external prompt key alone is limited evidence.
- REPAIR prevents extension visibility churn from becoming edit/delete recovery and prevents true source edits/deletes from becoming normal replacement ingress.
- FORGE does not ingest external summaries/vector results automatically.
- Scale tests prove bounded external diagnostics do not inflate hot-path saves.
- Live probe artifacts record each target as `browser-confirmed`, `disabled`, `not-installed`, `unavailable`, `indeterminate`, `disk-confirmed`, or `settings-only` with the required warning/failure semantics.

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

## Current Proof And Gap Register

Last updated: June 29, 2026.

This register prevents the implementation plan from treating synthetic proof, bounded live proof, or storage-shaped proof as production cutover. The active plan remains valid, but the next stages should start from these facts.

### Proven Or Partly Proven

| Area | Current evidence | What it proves |
| --- | --- | --- |
| V2 logical storage keys | `src/storage/logical-storage-paths.mjs`; `test-logical-storage-paths.mjs`; logical SillyTavern storage defaults in the host adapter path. | The v2 artifact namespace is defined and reachable through the host storage abstraction, with separate active-save and CORE key builders for the same `(campaignId, saveId)`. |
| Transaction store substrate | `src/storage/transaction-store-v2.mjs`; `tools/scripts/test-transaction-store-v2.mjs`. | Blob-first, hash-verified, manifest-last commits are implemented for v2 artifacts, and `layout: "core"` commits do not rewrite active-save manifests or heads. |
| Old-save importer | `importCampaignSaveRecordToV2` in `transaction-store-v2.mjs`; `tools/scripts/test-old-save-importer-v2.mjs`. | V1 full saves can be converted into v2-shaped artifacts without preserving raw transcript/provider/snapshot payloads or legacy open-world `rootsSet` payloads in hot artifacts. |
| V2 active-save facade | `src/storage/active-save-facade-v2.mjs`; `tools/scripts/test-active-save-facade-v2.mjs`; v2 save-index bridge in `directive-storage-repository.mjs`. | A controller/runtime-facing API can persist active runtime state as v2 artifacts, preserve the existing v1 save-index path, attach `v2ManifestRef`, avoid `saves/{saveId}.v1.json` writes, and keep raw transcript/provider/snapshot payloads out of v2 artifacts. |
| 5000-message scale harness | `tools/scripts/test-storage-scale-5000.mjs`. Latest reported pass: 5000 synthetic messages, 22,081 byte head, 2,016,186 byte host map, 2,534 byte save manifest, 10,542 byte prompt cache, 3 event segments, 16,177,360 byte legacy v1 baseline. | The target v2 storage shape can meet the documented size budgets in a storage-shaped synthetic harness and strips legacy broad `rootsSet` pressure from v2 artifacts. |
| CORE Store API | `src/storage/core-store-v2.mjs`; `tools/scripts/test-core-store-v2.mjs`. | `beginTurn`, mechanics commits, visible response recording, diagnostics appends, multiple background batches per transaction, idempotent background replay, and old-ledger projections can work from v2 events in isolation through the CORE save-scoped layout. |
| Active-save/CORE cross-writer safety | `tools/scripts/test-storage-cross-writer-v2.mjs`. | Active-save then CORE, and CORE then active-save, both preserve the active save-index manifest ref, active materialized state, CORE projections, and separate manifest/head paths. |
| Frame and latency contracts | `src/runtime/architecture-redesign-contracts.mjs`; `test-architecture-redesign-contracts.mjs`. | Frame, external environment refs, stable hashes, and generation-start latency metrics are representable and testable. |
| Production Frame, response, and model-call diagnostic bridges | `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/response-dispatcher.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/model-call-journal.mjs`; `src/hosts/sillytavern/chat-adapter.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-response-dispatcher-core-bridge.mjs`; `tools/scripts/test-runtime-model-call-journal.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-sillytavern-chat-prompt-adapters.mjs`. | Production ingress now creates compact `directive.turnSourceFrame.v1` metadata before classification, runtime-app instantiates/hydrates a CORE Store proxy for active campaign chats, old ingress rows carry `sourceFrameId`/`coreTransactionId`, ordinary hostContinue delegates call SillyTavern `Generate(...)` with `waitForCompletion: false`, CORE can advance `routePending -> hostContinueReleased` and `routePending -> visibleResponsePosted` for the same transaction, Directive-posted committed responses carry `directiveGenerationStartedAt`/`turnLatency` into the old response ledger and CORE response projection, CORE read projections now expose `turnTiming` derived from persisted phase/visible-response events, retryable response failure can enter `responseRetryRequired` and later record the visible response without weakening generic recovery, model-call diagnostics mirror best-effort into CORE diagnostics for the active in-progress ingress without blocking generation, branch/source CORE projections stay isolated, and reload tests prove CORE projections append rather than overwrite after app restart. |
| CORE mechanics bridge ordering | `src/runtime/turn-commit-coordinator.mjs`; `src/storage/core-store-v2.mjs`; `src/runtime/runtime-app.mjs`; `tools/scripts/test-turn-commit-coordinator-core-mechanics.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-mechanics-narration-runtime-synthetic.mjs`. | Chat-native deterministic mechanics checkpoints now commit the compact CORE mechanics bundle before the v1 checkpoint bridge persists. If a real CORE mechanics write fails, the turn errors before narration and before the old v1 checkpoint can record old-ledger-only success. Runtime app now stages the candidate committed state until checkpoint success, so live memory does not advance ahead of failed CORE/v1 checkpointing. The v1 checkpoint is therefore a bridge projection after CORE, not the first durable mechanics writer for this path. When a turn packet carries `directive.openWorldReducerBundle.v1`, CORE mechanics records validated, redacted reducer-source evidence: source kind, source outcome/event/range hashes, source hash, operation count, changed roots, and operation hash, without storing reducer values. Reducer-owned roots are excluded from broad `domainCommitted` hash operations to avoid duplicate authority. CORE mechanics also passes the transaction's observed `baseMechanicsRevision` and preflights the current revision so stale mechanics fail before route advance. |
| Live generation-start timing artifact plumbing | `tools/scripts/smoke-sillytavern-live.mjs`; `tools/scripts/soak-sillytavern-campaign-live.mjs`; `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/lib/generation-timing-proof-policy.mjs`; `tools/scripts/test-generation-timing-proof-policy.mjs`; `tools/scripts/test-live-soak-prep.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `tools/scripts/test-response-dispatcher-core-bridge.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; bounded artifacts `artifacts/live-soak/sillytavern-campaign/2026-06-28T21-58-54-918Z/report.json`, `artifacts/live-soak/sillytavern-campaign/hostcontinue-generation-start-fixed-20260628-165022/report.json`, `artifacts/live-soak/sillytavern-campaign/core-timing-skipped-proof-20260628-175237/report.json`, and `artifacts/live-soak/sillytavern-campaign/core-timing-mixed-proof-20260628-175644/report.json`. | Live smoke artifacts can attach per-turn `generationTiming`, compact summaries include generation-start status/max latency/skipped turns, delegated soak promotion copies the proof into `turn-end` live-log records, and the soak runner emits `live-generation-start-timing` before full certification. Runtime-snapshot proof covers `directiveCommit` and `hostContinue`. The current persisted extractor now reads CORE Store `turnTiming` projections through the save-scoped `core` layout. The mixed Ashes proof passed from persisted CORE projection with one `committedOutcome` at `13934 ms`, `architectureWithin60s: true`, and one skipped `clarificationNeeded`; the all-skipped proof returned `warning`, proving deterministic posts cannot certify the metric alone. The five-user coordinator now summarizes each lane's `live-generation-start-timing.details.proof`, rejects missing/runtime-only/summary-only/all-skipped timing as certification evidence, rejects reusable lanes without persisted CORE proof, and emits aggregate `generation-start-timing-core-proof`. |
| Fast gate and mechanics/narration timing | `fast-gate-runtime-synthetic.mjs`; `mechanics-narration-runtime-synthetic.mjs`; `runtime-app.mjs`; `generation/narration.mjs`; related tests. | The target route timing and narration-start split are viable in synthetic runtime flows, and the production Directive narration provider boundary now records `directiveGenerationStartedAt` before awaiting provider completion. |
| Command Log summary bridge | `runtime-app.mjs`; `command-log-summary-sidecar.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-command-log-summary-sidecar.mjs`; `tools/scripts/test-core-store-v2.mjs`. | Command Log assisted summary is no longer awaited before Directive narration starts. Direct runtime turns defer it until narration, chat-native committed turns schedule it after visible response/prompt settlement, and `flushChatSidecars()` settles the queue with campaign/save/chat/outcome/input guards. Chat-native committed turns mirror queued status into CORE `sidecarDiagnostics`, and successful settlements now commit a sanitized CORE background batch with zero mechanics operations, one `commandLogSummary` worker ref, source refs, input-signature hash, and assisted-summary hash. Raw summary text, prompt text, player text, and provider output stay out of CORE artifacts. |
| Narrative Thread settlement bridge | `src/runtime/runtime-app.mjs`; `src/runtime/chat-turn-orchestrator.mjs`; `src/directors/narrative-thread-director.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-narrative-thread-director.mjs`; `tools/scripts/test-core-store-v2.mjs`. | Chat-native committed turns no longer await the post-commit conversation processor before returning from the visible response path. Runtime schedules Narrative Thread extraction on a specialized post-visible queue after Command Log settlement for normal committed turns and non-terminal pending-interaction accept/confirm resolutions, mirrors queued/applied/stale/failure states into CORE `sidecarDiagnostics`, and commits successful settlements as sanitized `narrative-thread:*` CORE background batches with zero mechanics operations and one `narrativeThreadDirector` worker ref. The director now accepts a source-current guard and can stop stale work before provider or apply stages where the queue detects drift; the orchestrator also rejects direct pending-resolution commits when the original pending source ingress is stale. Raw player text, assistant text, prompts, scene deltas, provider output, and campaign state snapshots stay out of CORE diagnostics and background refs. |
| Advisory enrichment bridge | `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/model-call-journal.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-runtime-model-call-journal.mjs`; `tools/scripts/test-core-store-v2.mjs`. | Counsel turns now release host generation with a deterministic fallback advisory before `missionDirectorAdvisor` completes. Runtime schedules advisory enrichment on a post-release queue, patches the same advisory id on success, commits a sanitized `advisory-enrichment:*` CORE background batch with zero mechanics operations and one `missionDirectorAdvisor` worker ref, and records delayed model-call diagnostics against the original CORE transaction using ids/hashes rather than raw prompt, player text, provider output, or advisory prose. |
| Terminal checkpoint settlement bridge | `src/runtime/chat-turn-orchestrator.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/campaign-end-condition-service.mjs`; `src/runtime/architecture-redesign-contracts.mjs`; `tools/scripts/test-chat-turn-terminal-outcome.mjs`; `tools/scripts/test-campaign-end-condition-service.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`. | Terminal committed narration remains the transaction's single CORE visible response. Terminal checkpoint posts now settle as sanitized zero-operation `terminal-checkpoint:*` CORE background/control batches with one `terminalOutcomeCheckpoint` worker ref, while terminal checkpoint replies settle their own CORE resolution transaction instead of remaining `observed`. The bridge records ids, hashes, action/status, checkpoint host ids, and source refs only; raw checkpoint text and raw player resolution text are redacted from CORE events and diagnostics. Terminal checkpoint replies still bypass ordinary Director preview/commit, regular sidecars, Command Log summary, Narrative Thread extraction, and advisory enrichment. |
| Synthetic FORGE background batch | `src/jobs/forge-coordinator-synthetic.mjs`; `src/storage/core-store-v2.mjs`; `src/runtime/lens-prompt-scheduler-synthetic.mjs`; `tools/scripts/test-background-projection-batch.mjs`; `tools/scripts/test-core-store-v2.mjs`. | The target FORGE shape is viable in isolation: source preflight/recheck, abort/stale handling, worker fan-out, conflict rejection, one CORE `commitBackgroundBatch(...)`, one FORGE diagnostic bundle, one LENS background flush, idempotent replay, and diagnostics-only no-change results that do not persist raw worker prompts or responses into CORE state. |
| Production regular sidecar bridge | `src/jobs/campaign-sidecar-scheduler.mjs`; `src/runtime/runtime-app.mjs`; `src/storage/core-store-v2.mjs`; `src/runtime/architecture-redesign-contracts.mjs`; `tools/scripts/test-campaign-sidecar-scheduler.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-runtime-host-injection.mjs`. | Regular campaign sidecars now parse/validate before mutation, reject cross-worker path conflicts before mutation, apply accepted non-conflicting operations through one `stateDeltaGateway.applyOperations(...)` call, optionally record one CORE `commitBackgroundBatch(...)` through the runtime CORE proxy, run one prompt sync for the accepted batch, and keep per-worker journals/diagnostics as projections over the aggregate apply. The bridge now carries compact `turnSourceFrameRef`/`sourceToken` provenance into sidecar diagnostics and CORE background refs while redacting raw player text, assistant text, prompt text, provider output, and full Frame/source snapshots. |
| Open-world reducers | `src/directors/open-world-event-reducers.mjs`; `open-world-turn-coordinator.mjs`; `transaction-state.mjs`; `test-open-world-event-reducers.mjs`; `test-transaction-state.mjs`. | New coordinated open-world packets emit bounded reducer bundles instead of broad `openWorld.rootsSet` packets, and the production commit path now rejects any new `rootsSet` replacement even when a reducer bundle is also present. Reducer bundles now have a reusable validator/compactor that rejects forbidden keys, unknown operation types, invalid roots, runtime journal writes, and stale operation-count/changed-root diagnostics. Existing retained legacy ledger entries are still sanitized during pruning. |
| Dependent edit reobserve guard | `src/runtime/chat-turn-orchestrator.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; recovery/SRE focused tests. | An edited player row with an existing dependent assistant response returns `staleSource` before reclassification and cannot create a replacement ingress for the same host row. |
| Source-mutation CORE recovery bridge | `src/runtime/message-reconciler.mjs`; `src/storage/core-store-v2.mjs`; `tools/scripts/test-message-recovery.mjs`; `tools/scripts/test-core-store-v2.mjs`. | CORE Store can reopen a settled transaction to `recoveryRequired`, and the reconciler has a tested hash-only source-mutation recovery shape for committed player-message edits/deletes and Directive-response edits/deletes. The CORE bundle carries source kind, host/ingress/response/outcome refs, source Frame ref, replacement-text hash, pre-outcome revision, allowed actions, and dependent refs without raw replacement text. This is bridge proof, not production REPAIR ownership: the production `runtimeCoreTurnStore` facade still has to expose `markRecoveryRequired` before live edit/delete recovery can be considered CORE-owned. |
| External context readiness | Five-user bounded Ashes artifact `2026-06-28T12-23-18-316Z`; readiness external-context probe. | Non-human soak profiles can browser-confirm ST Lorebooks, Memory Books, Summaryception, and VectFox observability without using `default-user`. |
| External context fixture-depth gate | `tools/scripts/lib/sillytavern-live-harness.mjs`; `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `tools/scripts/test-live-soak-prep.mjs`. | The readiness probe now reports `fixtureDepth` separately from browser/disk observability. Bounded live runs keep shallow fixture depth as a warning, while an unbounded full-certification run fails unless at least one non-human soak profile has rich active evidence for all required external-context targets. |
| External context fixture prep | `tools/scripts/prepare-sillytavern-external-context-fixture.mjs`; `tools/scripts/test-external-context-fixture-prep.mjs`; `tools/scripts/test-sillytavern-external-context-readiness-preflight.mjs`; `tools/scripts/run-alpha-gate.mjs`. | A deterministic dry-run/write/validate tool can prepare non-human soak profiles with bounded native World Info, STMemoryBooks, Summaryception, and VectFox fixture data. It refuses `default-user`, allows only `directive-soak-a` through `directive-soak-e`, writes no API keys or raw extension source, writes the fixture under the real Ashes character chat folder, clears all known SillyTavern disabled-extension arrays for the target fixture systems, validates through the same compatibility and fixture-depth contracts, and can feed sanitized synthetic browser snapshots into offline readiness so `host-extension-fixture-depth` is behaviorally tested without live SillyTavern. |
| Live external context fixture certification | `artifacts/live-soak/sillytavern-campaign/2026-06-28T20-56-56-424Z/report.json`; `host-extensions/external-context-probe.json`; `live-log.jsonl`; `tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs --live --activate-external-context-fixture --write-artifacts`. | Strict five-user readiness passed with `host-extension-fixture-depth: pass`. `directive-soak-a` activated `Directive - Ashes - external-context-fixture`, loaded chat-bound World Info plus STMemoryBooks, Summaryception, and VectFox visibility markers, and produced `rich-active` evidence for all four targets. The other four soak users remained browser-observed/storage-isolated and did not need fixture activation. |
| External context generation proof gate | `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `src/hosts/sillytavern/prompt-adapter.mjs`; `tools/scripts/smoke-sillytavern-live.mjs`. | The coordinator now summarizes pre-generation prompt-inspection artifacts separately from readiness. It requires expected capture depth, `externalPromptEnvironmentRef`, known external prompt keys, compact `externalPromptEnvironmentTargets`, final-host-prompt inclusion, and redaction summaries. When readiness marks a lane as a rich fixture user, the aggregate `external-context-generation-proof` fails unless that lane also proves rich generation-time pressure for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox. |
| Browser-safe shared contracts | Standalone smoke `2026-06-28T06-18-37`; contract hash/UTF-8 canaries. | Shared modules reachable from SillyTavern no longer depend on `node:crypto` or `Buffer`. |

### Not Yet Proven

| Area | Gap | Required closeout |
| --- | --- | --- |
| Runtime persistence cutover | Queued runtime persistence now has the controller-level v2 facade bridge and writes by explicit save id without changing active-save navigation. Chat-native flow proves queued runtime writes preserve the v1 checkpoint payload path/content while attaching a v2 runtime manifest ref and compact active head; controller tests prove manual Save/Save As remain v1 checkpoints and autosave stays on its separate v1 lane. CORE Store is still not the full production turn writer. | Keep `controller.persistRuntimeCampaignState(...)` limited to queued runtime writes, preserve v1 index paths with `v2ManifestRef`, keep manual Save/Save As/open/load as explicit active-save owners, classify or migrate remaining direct `saveCurrentGame(...)` runtime callers such as settings/history/settle-state flows, keep autosave on its separate v1 lane until designed, and continue migrating durable turn ownership to CORE Store. |
| V2 layout bridge ownership | Active-save facade owns the default v2 resume/index layout; CORE Store owns `campaigns/{campaignId}/saves/{saveId}/core/...` and `campaigns/{campaignId}/core/...`. | Preserve this split until CORE can materialize the full active resume head and own manual Save/Save As/autosave semantics. Keep cross-writer tests in the alpha gate before live controller CORE Store instantiation as a writer. |
| V2 runtime resume source | The v2 active-save facade materializes a compact head that omits heavyweight runtime journals by design. Reloading from that head is not yet a proven full runtime resume path. | Define projection/rehydration rules for `runtimeTracking`, `turnLedger`, model-call journal continuity, sidecar journal continuity, and prompt/runtime revision continuity before claiming full v2 runtime resume safety. |
| CORE Store production ownership | Runtime app now instantiates and hydrates CORE Store for active campaign chats and routes production ingress, hostContinue release, Directive-posted visible responses, retryable response recovery phase, deterministic chat-native mechanics checkpoints, active-turn model-call diagnostics, Command Log summary diagnostics/background settlement, Narrative Thread diagnostics/background settlement, and regular campaign-sidecar lifecycle/background settlement through it. The chat-native mechanics checkpoint now writes CORE before the v1 checkpoint bridge. Source-mutation recovery has store/reconciler proof, but production `runtimeCoreTurnStore` still lacks `markRecoveryRequired`, so edit/delete recovery remains old-ledger authoritative in production. | Expose `markRecoveryRequired` through the production CORE facade, route source mutations through REPAIR before old reconciliation, migrate generic recovery, response edits, host-native completion/failure review, remaining background lifecycle writes, broader response-state ownership, and final bounded reducer/event mechanics application through CORE with old ledgers exposed only as read projections. |
| Full persisted timing certification | Bounded single-user Ashes proof now passes from CORE Store projections for `directivePosted` committed outcomes and records deterministic `clarificationNeeded` posts as skipped non-generation evidence. The five-user coordinator now requires each live lane to include a passing `live-generation-start-timing` check with `source: "coreStoreTurnTiming"`, `timingSource: "coreProjection"`, and `checkedTurnCount > 0`, and it exposes aggregate `generation-start-timing-core-proof`. It has not yet run the full five-user Ashes depth with that gate. | Run the five-user Ashes coordinator without `--turn-limit` and prove CORE-projection-backed `generationTiming.persisted.entries[]` across all lanes, including `hostContinue` and `directiveCommit` lanes. Keep all-skipped, summary-only, runtime-snapshot-only, or unknown-route artifacts as warning/failure rather than pass. Do not restore full response ledgers to v1 save payloads or promote the active-save facade head into the timing ledger. |
| Frame in production | Production ingress creates `directive.turnSourceFrame.v1`, and regular campaign sidecars now carry a compact `turnSourceFrameRef`/`sourceToken` into sidecar diagnostics and CORE background refs. Downstream SRE, REPAIR, LENS, and the full CORE lifecycle still do not consume the Frame as their only source token. | Extend compact Frame refs to CORE transaction, SRE, REPAIR, LENS, and remaining FORGE/background handoffs, then remove duplicate source-token construction. |
| True `hostContinue` release | Ordinary hostContinue now calls SillyTavern `Generate(...)` with `waitForCompletion: false`, records release timing, exposes CORE `turnTiming`, and has live-smoke artifact plumbing for runtime/persisted timing proof. The bounded three-turn Ashes run at `artifacts/live-soak/sillytavern-campaign/hostcontinue-generation-start-fixed-20260628-165022/report.json` proved a `hostContinue` counsel turn from runtime snapshot evidence with `hostGenerationReleasedAt`, `hostGenerationReleaseMode: nonblocking`, `generationStartLatencyMs: 1131`, and `architectureWithin60s: true`. | Retain CORE-projection-backed `generationTiming.persisted.entries[]` with `hostGenerationReleasedAt`, `architectureWithin60s: true`, separate provider completion timing, and no blocking model-backed SRE/advisory/LENS/FORGE work before release. Repeat this in the five-user coordinator before full certification. |
| `directiveCommit` hot-path closeout | Production Director commit records `directiveGenerationStartedAt` at the narration provider boundary, keeps provider completion separate, exposes CORE `turnTiming`, and has live-smoke artifact plumbing for persisted timing proof. Command Log summary and Narrative Thread extraction now have queued bridges that no longer block narration start or the chat-native visible response return path, including non-terminal pending accept/confirm resolutions, and successful chat-native settlements commit CORE background effects. Terminal checkpoint posts and replies now have a zero-operation CORE settlement policy. A bounded single-lane live rerun at `artifacts/live-soak/sillytavern-campaign/2026-06-28T21-58-54-918Z/report.json` proved one `directiveCommit` turn from runtime snapshot evidence with max generation-start latency `25875 ms` and `architectureWithin60s: true`; the later three-turn Ashes proof at `hostcontinue-generation-start-fixed-20260628-165022` repeated `directiveCommit` evidence with max `23384 ms`; the mixed CORE-projection Ashes proof at `core-timing-mixed-proof-20260628-175644` proved persisted CORE timing for one `committedOutcome` at `13934 ms`. Other post-turn work can still block after visible response or remain unordered across background queues. | Retain CORE-projection-backed `generationTiming.persisted.entries[]` with `directiveGenerationStartedAt`, `generationStartLatencyMs <= 60000`, `architectureWithin60s: true`, terminal-outcome coverage, and repeat evidence in the five-user coordinator before full certification. |
| Production FORGE ownership | Synthetic FORGE and the regular campaign-sidecar bridge now prove one aggregate apply, one optional CORE background batch, one prompt sync, and conflict-before-mutation for accepted regular sidecars. Command Log summary, Narrative Thread extraction, advisory enrichment, and terminal checkpoint settlement remain specialized queues/control paths, but successful settlements now share CORE background semantics instead of diagnostics-only apply. The Narrative Thread bridge now covers normal committed turns and non-terminal pending accept/confirm resolutions; the director still applies internal state commits through its existing director path rather than one FORGE aggregate apply. | Fold director-internal multi-commit work and remaining background effects into FORGE/background settlement. Keep regular sidecar, Command Log, Narrative Thread, advisory, and terminal checkpoint bridge tests as the production safety floor. |
| Open-world final shape | Broad `rootsSet` application is removed from migrated production commits, and production chat-native mechanics checkpoints now create compact CORE turn projections. CORE now validates and records redacted reducer-bundle source evidence when a committed packet carries `directive.openWorldReducerBundle.v1`, excludes reducer-owned roots from duplicate broad domain operations, and enforces stale mechanics base revisions. Reducer bundles are still derived through an existing projection commit path. | Apply bounded reducer events through CORE Store once instead of deriving them from a projected full-state commit. |
| Full REPAIR ownership | The dependent-edit loop has a targeted guard, and the source-mutation CORE recovery bridge has tested store/reconciler coverage. Edit/delete/retry/rerun/rollback are still not owned by one REPAIR service boundary; Scene Handshake/Mission Component invalidation, reobserved no-outcome deletes, narration retry, response retry closure, rerun, rollback, and delete committed outcome still read or write old ledgers/snapshots in places. | Route all source mutations and recovery choices through REPAIR with old recovery ledgers as projections. Promote the REPAIR runtime boundary, expose CORE `markRecoveryRequired`, write source-mutation recovery before old projections, and extend CORE projections to include source mutation, dependent outcome/response refs, and allowed actions. |
| Full Ashes certification | Current five-user proof used `--turn-limit 1`, producing expected bounded-depth warnings. | Run the five-user Ashes coordinator without `--turn-limit`: 52 turns per lane, 53 fact checks per lane, all lane results pass. |
| Rich active external-context generation pressure | Strict readiness now proves a prepared non-human profile can be loaded in-browser and reach `fixtureDepth: pass`, and the deterministic coordinator gate now rejects shallow generation evidence for rich fixture users. The full Ashes coordinator has not yet run unbounded against that prepared profile, so no full-depth lane artifact proves generation-time prompt/retrieval/visibility pressure across 52 turns. | Run the unbounded five-user coordinator after prepared-fixture readiness passes, retain `external-context-fixture-depth: pass`, require pre-generation prompt snapshots for the full depth, and prove generation-time external prompt/retrieval diagnostics remain redacted and correctly attributed while all lanes complete. |
| Full story-quality proof | Bounded proof scored only a few visible messages per lane and some model-assisted story review remained `not-run`. | Full-depth live run must score full transcripts for agency, continuity, prose naturalness, and campaign-specific tone. |

### Agent Findings To Preserve

The June 28, 2026 runtime/storage agents agreed on the following bridge shape:

- `CampaignStartController` needs a controller-level `persistRuntimeCampaignState(...)` method that loads the existing v1 checkpoint, calls the v2 active-save facade, updates active controller ids/state, and returns the v2 persist result.
- Only queued runtime persistence should call that method during the bridge. Public/manual `saveCurrentGame()` and `saveCurrentGameAs()` continue to call the v1 save paths and return v1 `directive.campaignSave` payloads.
- `autosaveStableTurn()` should not be swept into this bridge without a separate autosave design. The autosave lane currently has distinct v1 record/pruning semantics.
- The v2 facade return shape should include `kind: "directive.activeCampaignStatePersist.v2"`, `storageFormat: "v2"`, `campaignId`, `saveId`, `updatedAt`, `wroteV1Payload: false`, `saveManifestRef`, `campaignManifestRef`, artifact `refs`, and a `saveIndexEntry` that preserves the existing v1 `path` while adding `runtimeStorageFormat: "v2"`, `v2RuntimePersistedAt`, and `v2ManifestRef`.
- Tests must assert that v2 runtime persistence does not write `campaignSaveLogicalKey(saveId)`, writes v2 manifests before index update, preserves the v1 save-index path, sets `runtimeStorageFormat: "v2"`, and attaches `v2ManifestRef`.
- Controller tests must prove v1 payload/revision preservation during runtime v2 persist, then prove later manual Save writes a new v1 checkpoint and clears the runtime v2 marker.
- Chat-native flow tests must keep manual Save/Save As v1 return-shape assertions and must not claim model-call sequence continuity through the compact v2 head until projections or rehydration exist.
- Queued runtime persistence must be save-bound and non-navigating. It persists the save id from `campaignChatBinding.saveId`; public load/open/Save Game As flows, not background runtime writes, own controller active-save identity.
- The current compact v2 head intentionally omits runtime journals. That is good for scale, but it means reload-through-v2 is not yet a full runtime resume source until journal projections or rehydration are defined. Current runtime load keeps the v1 checkpoint as the default resume source and overlays known binding metadata for current-chat hydration without rewriting the checkpoint.
- The first production CORE migration seam should be ingress, not diagnostics. Diagnostics need a stable transaction id, so `beginTurn(sourceFrame)` must exist before model-call, sidecar, recovery, or response diagnostics can be safely attached.
- `chat-turn-orchestrator.createIngress(...)` is the correct low-disruption production Frame seam because dedupe has resolved the authoritative host message identity and active campaign/save/chat context is available there. `runtime-bridge.mjs` and `chat-adapter.mjs` are too early to own campaign/source provenance.
- CORE `beginTurn` should run before the old ingress projection during the bridge. If CORE begin fails, the runtime must not persist an old-ledger-only ingress as if the new durable writer had accepted the source.
- The production hostContinue release split must keep provider completion outside generation-start latency. Nonblocking `continueHostGeneration` records `hostGenerationReleasedAt`, but host-native completion, contradiction review, and failure recovery now need a later event path rather than synchronous observed-message review.
- If host generation has already been released and CORE cannot record `hostContinueReleased`, Directive must still preserve release evidence in the old response ledger and open typed recovery. This is a bridge failure state, not a silent success.
- Directive-posted responses now bridge CORE visible-response state. A specific `responseRetryRequired` phase lets response post failures and provider-failure-after-mechanics cases attach retryable recovery to the same transaction and later record one visible response without making generic `recoveryRequired` reopenable. Broader response-state ownership is still incomplete until response edits, host-native completion/review/failure, and generic recovery flows are owned by CORE/REPAIR projections.
- Production chat-native mechanics checkpoints now bridge into CORE before narration: `turn-commit-coordinator.mjs` records compact domain-hash operation bundles through `commitMechanics(...)`, records validated redacted `directive.openWorldReducerBundle.v1` source evidence when present, avoids duplicate broad domain commits for reducer-owned roots, passes `baseMechanicsRevision`, `response-dispatcher.mjs` tolerates the intended `mechanicsPending -> visibleResponsePosted` ordering, and `test-chat-native-runtime-flow.mjs` proves persisted CORE turn-ledger projections survive reload without raw transcript text, raw narration, snapshots, `runtimeTracking`, or `rootsSet`.
- Model-call diagnostics now bridge only the active in-progress ingress transaction and remain best-effort. The Command Log summary bridge, Narrative Thread settlement bridge, and regular campaign sidecar scheduler now use explicit committed-turn context rather than `activeIngressId`: Command Log and Narrative Thread queued/failure/stale states use CORE diagnostics, successful specialized settlements use sanitized CORE background effect batches, and accepted regular sidecars use CORE background batches for aggregate state operations.
- Synthetic FORGE already demonstrates the target batch semantics, including one CORE `backgroundBatchCommitted` event per FORGE run, one FORGE diagnostic, one LENS background flush, and no raw worker prompt/response storage for diagnostics-only no-change work.
- The first production FORGE slice is now implemented for regular campaign sidecars: `runtimeCoreTurnStore.commitBackgroundBatch(...)` is exposed to `createCampaignSidecarScheduler`; accepted sidecar operations are aggregated before mutation; cross-worker path conflicts reject the affected batch before mutation; accepted regular sidecars use one bridge apply, one best-effort CORE background batch commit, and one prompt sync.
- The Command Log bridge now keeps the summarizer specialized because it is presentation-only and `mayProposeState: false`, but it shares FORGE/CORE settlement semantics on success: zero mechanics operations, one `commandLogSummary` worker ref, source refs, input-signature hash, assisted-summary hash, and no raw assisted-summary text.
- CORE Store now allows multiple background batches per transaction. This prevents specialized background systems from fighting over one `backgroundBatchCommitted` slot while preserving idempotent replay and duplicate batch-id rejection.
- The Narrative Thread bridge now keeps extraction specialized because it owns source extraction, thread-ledger, command-bearing review, and quest-promotion domain logic, but it shares FORGE/CORE settlement semantics on success: zero mechanics operations, one `narrativeThreadDirector` worker ref, source refs, pending-resolution provenance refs when applicable, input-signature hash, redacted changed-domain refs, and no raw player text, assistant text, prompts, scene delta, or provider output.
- The test closeout for this production bridge is `test-campaign-sidecar-scheduler.mjs`, `test-background-projection-batch.mjs`, `test-core-store-v2.mjs`, `test-chat-native-runtime-flow.mjs`, `test-chat-turn-orchestrator.mjs`, `test-command-log-summary-sidecar.mjs`, `test-narrative-thread-director.mjs`, and `test-runtime-host-injection.mjs`. The expected evidence is one aggregate apply for regular sidecars, one CORE background commit when a transaction id is present, one prompt sync, conflict detection before mutation, idempotent/stale background behavior, Command Log summary remaining post-visible-response while settling successful summaries through CORE background effects, Narrative Thread extraction remaining post-visible-response for normal and non-terminal pending committed turns, cancel/revise paths not scheduling extraction, and stale source guards preventing provider/apply work when possible.
- CORE Store must not write the active-save facade's default v2 layout during the bridge. The resolved bridge gives CORE a save-scoped `core` namespace while active-save remains the save-index and runtime-resume layout owner.
- External prompt environment at the fast gate must be cached or bounded. Deep ST Lorebooks/Memory Books/Summaryception/VectFox inspection belongs to LENS/readiness probes and must not block hostContinue release; Frame may carry an unknown or cached compact ref.
- The counsel/advisory audit found another foreground provider wait: `handleCounsel` awaited `missionDirectorAdvisor`, committed the advisory record, and ran prompt sync before `injectAndContinue` reached the response dispatcher. The bridge now uses a deterministic fallback advisory shell first, host generation release next, and provider-backed advisory enrichment later through FORGE/CORE with stale-source checks before provider and before apply.
- Advisory enrichment now has an explicit post-release diagnostic target. Delayed `missionDirectorAdvisor` model-call diagnostics attach to the originating CORE transaction by event metadata after the ingress has advanced beyond `classified`, while CORE diagnostics store only ids and hashes.
- Terminal checkpoint settlement must not use `recordVisibleResponse` for the checkpoint prompt. The committed terminal narration remains the transaction's single CORE visible response; checkpoint posts and checkpoint replies settle through sanitized zero-operation CORE background/control batches with ids/hashes only.
- The June 29 REPAIR/SRE audit confirmed that edit/delete recovery is still primarily owned by `MessageReconciler`, `state-delta-gateway`, old `runtimeTracking.ingressLedger`, old `responseLedger`, old `recoveryJournal`, and turn-ledger snapshot flows. The current dependent-edit guard stops the Sam Vickers cycle, but it does not make REPAIR the owner.
- The smallest REPAIR production bridge is: expose `markRecoveryRequired` through `runtimeCoreTurnStore`, route player/Directive response source mutations into a REPAIR runtime before old reconciliation, write a sanitized CORE recovery case, then mirror only a projection reference into the old recovery journal during migration.
- CORE recovery projections need to expose enough detail for product review: source mutation kind, source kind, host/ingress/response/outcome refs, dependent outcome/response refs, source Frame ref, replacement-text hash/presence, pre-outcome revision, auto-rollback flag, and allowed actions. They must not expose raw replacement text.
- The June 29 response-lifecycle audit confirmed that CORE already models `hostContinueReleased`, `visibleResponsePosted`, `responseRetryRequired`, and `recoveryRequired`, but production host-native completion is not projected. Nonblocking SillyTavern `Generate(...)` returns immediately and currently drops completion/failure observation; the old response ledger therefore proves release, not terminal native assistant success.
- The smallest CORE response-lifecycle bridge is a nonblocking host completion callback: release host generation immediately as today, observe completion/failure later, write `recordVisibleResponse(...)` or typed recovery/diagnostic through CORE in the background, and never retry host generation from the callback.

### Next Implementation Order

1. Preserve v2 layout bridge ownership: active-save owns the default v2 resume/index layout, CORE Store owns the save-scoped `core` layout, and cross-writer tests stay in the gate.
2. Storage cutover: wire the tested v2 active-save facade through `CampaignStartController` and `persistRuntimeCampaignStateNow` so queued runtime writes stop rewriting v1 full-save payloads, while manual Save/Save As remain v1 checkpoints and autosave cutover is designed separately.
3. Continue production CORE ownership: expose recovery APIs through the runtime facade, move source-mutation recovery, mechanics, remaining background lifecycle writes, and broader response-state ownership into CORE with old ledgers as projections.
4. Production fast gate: release ordinary `hostContinue` without awaiting provider completion, model-backed SRE, advisory work, LENS rebuild, FORGE, remaining thread settlement, or Command Log summary; then project host-native completion/failure through a later CORE event path.
5. Production `directiveCommit` hot path: keep the new `directiveGenerationStartedAt` metric, move remaining non-required work into FORGE/background settlement, and prove the persisted budget in live SillyTavern.
6. REPAIR/SRE ownership expansion: generalize the dependent-edit guard and source-mutation CORE bridge into a single recovery authority for edit/delete/retry/rerun/rollback.
7. Full-depth live certification: run only after production persistence and generation-start metrics are real, not synthetic.

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
- `test-external-context-browser-probe.mjs`
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

First implementation slice:

- Add runtime schemas for Frame, CORE transaction, external prompt environment, and architecture metrics.
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

First scale harness slice:

- Add `test-storage-scale-5000.mjs` before v2 storage migration begins.
- The test should generate exactly 5000 synthetic host rows, bounded materialized head state, host-message map entries without raw transcript text, active prompt-cache metadata, event segments, diagnostics segments, external prompt-environment diagnostics, and a legacy v1 large-save baseline.
- The v2 candidate artifacts must round-trip through logical storage so the scale budget is attached to storage-shaped records, not only in-memory objects.
- The v2 candidate layout must satisfy the documented byte thresholds, including prompt cache <= 1 MB, and show zero hot-path full-save rewrites with at most one small pre-generation transaction write.
- The legacy baseline must explicitly violate the full-save rewrite rule so the harness catches a naive implementation that keeps rewriting `payload.campaignState`.
- This harness is not proof that the runtime has migrated. It is the scale gate that Stage 3 and Stage 4 must satisfy with real storage APIs.

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

First storage substrate slice:

- Add v2 logical keys for campaign manifest, save manifest, materialized head, host map, prompt cache, event segments, turn segments, diagnostics segments, and checkpoints.
- Add `transaction-store-v2` storage helpers for bounded JSON segment writes, segment chunking, checkpoint write/load, artifact refs, artifact hash verification, materialized head reads, and manifest-last save layout commits.
- The commit path must write blobs first, read them back, verify artifact hashes, then write the save manifest and campaign manifest as the final pointer writes. If a blob hash fails, neither manifest pointer may be written.
- Add a dev-only v1 importer from `directive.campaignSave` into v2 artifacts. It can use the old full save as input, but v2 output must omit raw transcript text, provider prompt/response bodies, external extension payloads, broad `runtimeTracking` journals, and full retained snapshots from the hot artifacts.
- Update the 5000-message scale harness to use the v2 substrate API instead of handwritten artifact writes.

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
- Expose read projections for ingress ledger, response ledger, turn ledger, recovery journal, model-call diagnostics, and sidecar diagnostics.
- Add revision split:
  - mechanics revision;
  - runtime revision;
  - diagnostic revision;
  - prompt revision.
- Move diagnostics to diagnostics segments.
- Prohibit direct new writes to old ledger helpers outside CORE Store.
- Add canonical `directive.coreEvent.v1` envelopes for turn/runtime/gameplay events.
- Add separate `directive.coreDiagnostic.v1` entries for model-call, sidecar, provider, external-prompt, and storage diagnostics.
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
- `commitMechanics` and accepted `commitBackgroundBatch` reduce a toy head and advance mechanics exactly once per accepted commit.
- Record-visible-response is exactly-once across `hostContinue`, `directiveNarration`, and `directivePause` cases.
- Artifacts do not contain `payload.campaignState`, `runtimeTracking.history[].snapshot`, `turnLedger.entries[].snapshotBefore`, raw prompt bodies, raw provider output, raw transcript text, raw sidecar packets, or secrets.
- No `saves/*.v1.json` full-save write occurs.
- Replay from event segments reconstructs the same materialized head and read projections.
- Persisted `turnTiming` reconstructs submit-to-generation-start latency for both `hostContinue` and `directiveCommit` without reading `payload.campaignState.runtimeTracking`.

Exit gate:

- CORE Store can record a synthetic turn without writing full campaign state.
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
- Normalize accepted assistant variant once at host/source boundary.
- Add latest-boundary precheck before classification.
- Dedupe source revision by chat id, host message id, and text hash.
- Route by deterministic checks first.
- Use Utility classification only when deterministic checks are insufficient.
- Return `hostContinue`, `directiveCommit`, `directivePause`, or `recoveryReview`.
- For ordinary `hostContinue`, release host generation without waiting for model-backed SRE, advisory generation, LENS rebuild, FORGE, thread extraction, or Command Log summary.
- For counsel/advisory `hostContinue`, create or reserve the deterministic fallback advisory id before release, but do not await `missionDirectorAdvisor`, advisory prompt sync, or advisory model-call diagnostics before host generation release.
- Record Directive-owned prompt revision used by released host generation, plus whether the final SillyTavern prompt may include external host prompt material.
- Add a post-release host-native completion/failure event path for nonblocking SillyTavern generation. It may observe the completed native assistant row and write CORE projections later, but it must not block release or retry host generation.

Suggested tests:

- `test-chat-turn-orchestrator.mjs`;
- `test-turn-intent-classifier-fixtures.mjs`;
- `test-turn-transaction-runtime.mjs`;
- `test-sillytavern-event-wiring.mjs`;
- controlled slow Utility provider test;
- counsel/advisory fast-gate fixture proving `continueHostGeneration` records release before a deferred `missionDirectorAdvisor` provider promise resolves.
- host-native completion callback fixture proving nonblocking release returns immediately, later completion writes exactly one CORE visible-response projection, duplicate callbacks are idempotent, raw assistant text is redacted, and callback failure becomes diagnostics/recovery rather than a thrown release error.

Exit gate:

- Deterministic hostContinue generation release target < 10 seconds.
- Hard under-60-second generation-start assertion exists.
- Edits/deletes/stale source can route to REPAIR review instead of normal classification.
- HostContinue does not wait for native WI scans, Summaryception, VectFox retrieval, or other external extension inspection owned by SillyTavern.
- Host-native completion/failure review is a later CORE/REPAIR/SRE event path, not a synchronous contradiction review inside the release call.

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
- Enforce latest-boundary rule:
  - latest player row with no dependent assistant may restart same transaction;
  - edited/deleted player row with dependent assistant or committed outcome enters recovery case;
  - response retry reuses same outcome/idempotency;
  - rerun outcome creates explicit branch/checkpoint candidate.
- Keep existing invalidation helpers temporarily, but remove policy decisions from scattered callers.
- Write source-mutation recovery into CORE first for CORE-backed ingress/response rows, then mirror only projection refs into old ingress/response/recovery ledgers during the bridge.
- Extend CORE recovery projections with source mutation, dependent outcome/response refs, source Frame refs, allowed actions, replacement-text hash/presence, and pre-outcome revision without raw replacement text.
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

Exit gate:

- Edited dependent player row cannot produce a replacement classified ingress.
- Recovery case has one owner and one visible product path.
- CORE Store, not `runtimeTracking.recoveryJournal`, is the first durable writer for CORE-backed source mutations.
- Sam Vickers loop cannot reproduce in deterministic fixture.
- Ghosted or hidden rows do not create false deletes, false latest-boundary gaps, or normal-turn reobserve loops.
- Summarized-only and prompt-excluded rows do not create latest-boundary gaps or stale source-frame recovery errors.

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
  - active native ST World Info/lorebook names, chat-bound `chat_metadata.world_info`, character/persona lorebook refs, settings hash, placement counts, and ST-owned prompt-surface counts for before/after, at-depth, outlet, Author's Note, and example-message influence;
  - Memory Books/STMB installed/version/settings state, `chat_metadata.STMemoryBooks` counts, `stmemorybooks: true` WI entry count/hash, `STMB_start`/`STMB_end` range diagnostics, active chat-bound `world_info`, and risky mode flags;
  - Summaryception enabled state, prompt key state, prompt-slot metadata, `summarizedUpTo`, layer counts, snippet counts, ghosted count, `ghostedIndices` extrema, `extra.sc_ghosted` marker counts, and stale-summary flags;
  - VectFox enabled/disabled/disk-only state, `3_vectfox*` prompt keys, position/depth/role metadata, backend type, Qdrant/cloud/local mode, semantic WI state, EventBase state, summarizer injection state, agentic retrieval state, ghosting state, collection counts, hook presence, and redacted vector settings;
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
- Add prompt-surface preservation assertions for:
  - native WI `worldInfoBefore`, `worldInfoAfter`, `customDepthWI_<depth>_<role>`, `customWIOutlet_<name>`, Author's Note influence, and example-message influence;
  - Summaryception `summaryception`;
  - VectFox `3_vectfox`, `3_vectfox_posN`, `3_vectfox_eventbase`, `3_vectfox_summarizer`, and `3_vectfox_lorebook`;
  - Memory Books-created WI entries and chat-bound `world_info`, rather than a Memory Books-specific prompt key.
- Ensure diagnostics-only writes do not dirty prompt.
- Guard against fact-use stats self-invalidating cache keys.

Suggested tests:

- `test-prompt-dirty-domains.mjs`;
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
- HostContinue can honestly record next-generation prompt rebuild.
- External prompt keys survive Directive prompt rebuild and clear.
- Prompt diagnostics distinguish Directive-owned context from external host prompt material.
- External prompt-environment snapshots persist only counts, hashes, prompt keys, positions, settings hashes, and redaction summaries.
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
- Keep Command Log assisted summary as a specialized presentation sidecar, but settle successful summaries through shared CORE/FORGE background semantics.
- Keep Narrative Thread extraction as a specialized source/thread sidecar during the bridge, but settle successful chat-native extractions through shared CORE/FORGE background semantics.
- Move quest/background architecture and director-internal multi-commit work into FORGE when not visible-blocking.
- Keep external summarizers/vectorizers outside FORGE by default. Summaryception, Memory Books, and VectFox may coexist as external tools, but their outputs are not FORGE results unless a future reviewed-import flow explicitly converts them into Directive proposals.
- Define a future optional approved-artifact export seam for vector tools: public Command Log summaries, mission components, reviewed CPM evidence, or other player-safe artifacts tagged with campaign/save/chat/source metadata.
- Record when external generation, retrieval, or summarization may be running outside Directive's generation router so latency and provider-call diagnostics are not misattributed to FORGE.
- First production bridge slice, completed for regular campaign sidecars:
  - CORE `commitBackgroundBatch` is exposed through `runtimeCoreTurnStore`;
  - the CORE background-commit capability is passed into `createCampaignSidecarScheduler`;
  - worker results are parsed and validated before `stateDeltaGateway.applyOperations`;
  - accepted non-conflicting operations aggregate into one bridge apply and one best-effort CORE background batch commit;
  - cross-worker path conflicts reject before mutation;
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
- external Summaryception/Memory Books/VectFox coexistence fixture proving FORGE does not ingest their outputs automatically.

Exit gate:

- One FORGE run produces at most one state transaction and one prompt rebuild.
- One CORE transaction may contain multiple background batches when independent post-turn systems settle at different times.
- Stop/edit/delete cancels queued background workers.
- External summarizer/vectorizer output is either ignored as external prompt context or enters a review/import proposal; it never commits as Directive state automatically.
- In-flight unabortable provider output becomes diagnostics-only if stale.
- Regular campaign sidecars prove one aggregate apply, one CORE `backgroundBatchCommitted` event, and one prompt sync. Command Log summary proves post-visible-response settlement, a zero-operation CORE background effect on success, and diagnostics-only stale/failure behavior. Narrative Thread settlement proves post-visible-response queueing for normal and non-terminal pending committed turns, source-stale guards before provider/apply stages, stale pending-source rejection before direct pending commit, a zero-operation CORE background effect on success, and redacted diagnostics/artifacts. Terminal checkpoint settlement proves a second visible control row is not recorded as a second CORE visible response, terminal post/resolution effects settle through sanitized zero-operation CORE batches, and terminal replies do not schedule ordinary sidecars.

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
- Define the final autosave shape before removing v1 autosave records or pruning behavior.
- Define v2 runtime resume projections for `runtimeTracking`, `turnLedger`, model-call journal continuity, sidecar journal continuity, and prompt/runtime revision continuity.
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
- Reload from v2 preserves runtime sequencing required for the next turn, including model-call ids and background diagnostics continuity.
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
- `generationTiming.persisted.entries[]` sourced from CORE `turnTiming` projections, with `timingSource: "coreProjection"` or equivalent provenance;
- active head size;
- event segment size;
- diagnostics segment size;
- Directive context revision/hash used by visible generation;
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
node tools\scripts\check-sillytavern-multi-user-soak-readiness.mjs --live --activate-external-context-fixture --write-artifacts
```

The prep tool is intentionally profile-scoped and refuses `default-user`. Its validation is not a substitute for browser readiness; it prepares bounded data so the live browser probe can prove rich fixture depth. The live activation flag is also explicit: normal readiness remains passive, while certification may select the prepared Ashes fixture character/chat before observing `context.chat`, `chatMetadata`, prompt keys, and visibility markers.
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
node tools\scripts\run-continuity-matrix-five-user-soak.mjs --live --turn-limit 2 --activate-external-context-fixture --write-artifacts
```

- Credentials may come from `DIRECTIVE_SOAK_ST_USERS` JSON or `handle:password`, shared `DIRECTIVE_SOAK_ST_PASSWORD`, or per-user `DIRECTIVE_SOAK_ST_PASSWORD_DIRECTIVE_SOAK_A` through `_E`.
- If the SillyTavern data root is not `F:\SillyTavern\SillyTavern\data`, set `DIRECTIVE_SILLYTAVERN_DATA_ROOT`, `SILLYTAVERN_DATA_ROOT`, or `ST_DATA_ROOT`.
- If the served extension path differs, set `DIRECTIVE_SILLYTAVERN_EXTENSION_PATH`.
- Coordinator env equivalents are `DIRECTIVE_CPM_FIVE_USER_SOAK_LIVE=1`, `DIRECTIVE_CPM_FIVE_USER_SOAK_WRITE=1`, `DIRECTIVE_SOAK_TURN_LIMIT=N`, `DIRECTIVE_CPM_FIVE_USER_SOAK_RUN_ID`, `DIRECTIVE_CPM_FIVE_USER_SOAK_ARTIFACT_DIR`, and `DIRECTIVE_CPM_FIVE_USER_SOAK_RESUME=1`.
- Readiness can require rich external-context fixtures with `DIRECTIVE_SOAK_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH=1` or `DIRECTIVE_REQUIRE_EXTERNAL_CONTEXT_FIXTURE_DEPTH=1`. Without that flag, readiness treats shallow fixture evidence as an explicit warning so operators can prepare fixtures before running certification.
- Live readiness can activate a prepared fixture with coordinator/readiness `--activate-external-context-fixture` or `DIRECTIVE_SOAK_ACTIVATE_EXTERNAL_CONTEXT_FIXTURE=1`. The activation path uses SillyTavern host chat APIs, not Directive campaign runtime APIs, and records `external-context-fixture-activation` entries in `live-log.jsonl`.
- Do not use `DIRECTIVE_SOAK_STRICT=1` or `DIRECTIVE_LIVE_CAMPAIGN_SOAK_STRICT=1` for bounded proof unless the desired result is failure on bounded-depth warnings.

Default-user and freshness rules:

- `default-user` is reserved for human testing and is rejected by readiness, lane execution, and five-user lane policy. Five-user proof uses `directive-soak-a` through `directive-soak-e`.
- Served-extension freshness is hash-based when `SILLYTAVERN_BASE_URL` is set. Live proof compares served SHA-256 values against checkout SHA-256 values for the manifest, manifest JS/CSS, bootstrap/runtime files, and soak proof files.
- `extension-sync-before-testing` passes only when served hashes match or `DIRECTIVE_CONFIRM_EXTENSION_SYNCED=1` is set after manual sync. A hash mismatch remains a `served-extension-freshness` warning unless strict mode makes warnings fatal.

Bounded proof semantics:

- A run with `--turn-limit 1` or `--turn-limit 2` is bounded proof, not full 52-turn certification.
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

Current implementation evidence from June 28, 2026:

- Standalone Directive browser smoke passed after the shared architecture contract module was made browser-safe: `artifacts/live-soak/smoke-diagnostic/2026-06-28T06-18-37/report.json`.
- Before that fix, SillyTavern discovered and activated `third-party/Directive`, but the served module graph failed on `node:crypto`; the browser showed Directive script/style tags but no `globalThis.Directive` bridge or `#directive_settings` DOM.
- Shared runtime modules that are served into SillyTavern must not import Node-only APIs such as `node:crypto` or depend on `Buffer`. Browser-safe hashing/byte-length utilities are now part of the shared contract layer and have deterministic tests.
- Single-lane bounded live proof passed for `ashes-factual-director`: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-28T12-19-21-597Z/report.json`.
- Full five-user bounded Ashes proof passed with readiness enabled: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-28T12-23-18-316Z/report.json`.
- The full five-user run ended `status: warning` only because `--turn-limit 1` is bounded proof. Required checks passed: five-user lane policy, non-human users, live readiness, external-context readiness proof, continuity prompt/source proof, external-context generation proof, factual grounding, and lane artifact completeness.
- The readiness artifact recorded 5 users and 20 target statuses as `browser-confirmed`; each lane recorded generation-time `externalPromptEnvironmentRef` proof and known external prompt keys.
- That run is not full certification: it used one turn per lane, produced two fact-check artifacts per lane, showed minimal generation-time external prompt-key evidence, and did not prove rich active Memory Books, Summaryception, or VectFox fixture behavior.
- Strict readiness artifact `artifacts/live-soak/sillytavern-campaign/2026-06-28T20-47-03-043Z/report.json` failed only `host-extension-fixture-depth`: browser/runtime observability passed, but `fixtureDepth.status` was `warning`, `stLorebooks` and `vectFox` had zero rich users, `currentChatId` was null, chat-bound World Info was absent from browser metadata, and VectFox remained disabled through a missed `extension_settings.disabledExtensions` entry. This is the expected limited-evidence failure mode.
- Strict readiness artifact `artifacts/live-soak/sillytavern-campaign/2026-06-28T20-56-56-424Z/report.json` then passed with `--activate-external-context-fixture`: `directive-soak-a` activated `Directive - Ashes - external-context-fixture`, loaded `Directive External Context Fixture` as chat-bound World Info, and reached `fixtureDepth.status: pass` with `rich-active` evidence for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox.
- Generation-start timing proof now has deterministic, artifact-plumbing, and bounded live runtime-snapshot coverage: CORE Store projections expose `turnTiming`, response dispatch carries Directive-posted `turnLatency` into persisted CORE response refs, live smoke rounds attach runtime and persisted `generationTiming`, delegated soak promotion writes that proof into `turn-end` records, and the soak runner emits `live-generation-start-timing`. The failed bounded five-user run at `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-28T21-42-29-479Z/report.json` exposed a missing-timestamp normalization bug; the bounded single-lane rerun at `artifacts/live-soak/sillytavern-campaign/2026-06-28T21-58-54-918Z/report.json` proved one runtime-snapshot `directiveCommit` turn at `25875 ms`; and the bounded three-turn Ashes run at `artifacts/live-soak/sillytavern-campaign/hostcontinue-generation-start-fixed-20260628-165022/report.json` proved runtime-snapshot coverage for both `directiveCommit` and `hostContinue`, including `hostContinue` release at `1131 ms`. The persisted closeout is now specifically a CORE projection extractor closeout: the smoke path must read save-scoped CORE `turnTiming` for the active `(campaignId, saveId)` instead of stale v1 save payload ledgers.
- External-context generation proof now has deterministic gate coverage beyond generic key presence. The prompt adapter records compact target summaries as `externalPromptEnvironmentTargets`; live smoke preserves them in prompt-inspection artifacts; and the five-user coordinator requires pre-generation snapshots, expected capture depth, external environment refs, known external keys, final-host-prompt inclusion, and rich target pressure when readiness identifies a rich fixture user. This is not yet full live certification until the unbounded Ashes run produces those artifacts.

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
- lane prompt snapshots: `lanes/<laneId>/<runId>-<laneId>/prompt-inspection/*.json`.

For rich prepared fixture users, `.lanes[].externalContextGenerationProof.richFixturePressure.status` must be `pass`. The details should show compact target evidence for ST Lorebooks/World Info, Memory Books, Summaryception, VectFox, `finalHostPromptMayIncludeExternal`, and redaction reasons without raw prompt bodies or external generated content.

The readiness probe must classify `stLorebooks`, `memoryBooks`, `summaryception`, and `vectFox` as `browser-confirmed`, `disabled`, `not-installed`, `disk-confirmed`, `settings-only`, `unavailable`, or `indeterminate`. `browser-confirmed`, `disabled`, and `not-installed` are pass statuses. `disk-confirmed` or `settings-only` without browser confirmation is limited evidence and should remain warning/failure depending on the run requirement.

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

### External Compatibility Worker

```text
You are the External Compatibility worker. Your lane is SillyTavern context-extension coexistence for native ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox. Inspect installed/live surfaces without copying implementation or raw user content. Do not integrate with extension internals, call private APIs as a dependency, import generated memories/summaries/vector hits into Directive state, or change runtime authority policy. Handoff with observable prompt keys, World Info surfaces, chat metadata markers, visibility markers, settings hashes, unavailable signals, redaction risks, prompt-key preservation fixtures, and live-proof artifact expectations.
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
