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
- No Directive runtime path may call Memory Books internals or use Memory Books hide/unhide flows to maintain Directive state.
- No certification gate may require a Memory Books-specific prompt key; proof must accept ST World Info entries, STMB metadata, chat-bound `world_info`, and range diagnostics.
- No hidden/ghosted message may be treated as deleted solely because an external extension changed its prompt visibility.
- No live smoke may be reported as passing architecture latency unless persisted timing records prove submit-to-generation-start.
- No deterministic non-generation post may satisfy architecture latency proof. Skipped posts such as `clarificationNeeded`, `routineCommand`, `locationTransition`, `riskConfirmationNeeded`, campaign intros, and terminal checkpoints must be recorded separately from persisted latency-bearing `entries[]`, and at least one persisted CORE latency-bearing turn must pass.

## Current Decision Record

These decisions are binding for the next implementation stages:

- Forward-only pre-alpha replacement is allowed. Old runtime/save write paths are temporary bridge points, not long-term compatibility surfaces.
- Frame is the final human-facing name for the combined source provenance object. Do not reintroduce SEED Frame as the architecture name.
- External-context support means compatibility and coexistence with ST-Lorebooks / ST Lorebooks / World Info, Memory Books, Summaryception, and VectFox. It does not mean direct integration, automatic import, automatic trust, or automatic repair of those tools.
- External-context support must use one normalized evidence contract across fixture prep, disk/browser probes, prompt adapter summaries, readiness fixture-depth checks, generation proof, and live coordinator gates. A layer that cannot emit `memoryBooks.rangeDiagnostics`, `summaryception.staleness`, or `vectFox.backendDiagnostics` should report limited evidence instead of inventing its own pass rule.
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
| Production regular sidecar bridge | `src/jobs/campaign-sidecar-scheduler.mjs`; `src/runtime/runtime-app.mjs`; `src/storage/core-store-v2.mjs`; `src/runtime/architecture-redesign-contracts.mjs`; `tools/scripts/test-campaign-sidecar-scheduler.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-runtime-host-injection.mjs`. | Regular campaign sidecars now parse/validate before mutation, reject cross-worker path conflicts before mutation, apply accepted non-conflicting operations through one `stateDeltaGateway.applyOperations(...)` call, optionally record one CORE `commitBackgroundBatch(...)` through the runtime CORE proxy, run one prompt sync for the accepted batch, and keep per-worker journals/diagnostics as projections over the aggregate apply. The bridge now carries compact `turnSourceFrameRef`/`sourceToken` provenance into sidecar diagnostics and CORE background refs while redacting raw player text, assistant text, prompt text, provider output, and full Frame/source snapshots. June 29 live regression work also narrowed the FORGE source check: unchanged source Frames may rebase over newer unrelated global revisions, likely-truncated JSON receives one strict repair attempt before the existing fail-closed rejection path, sidecar proposals are compact by default, and `test-campaign-sidecar-scheduler.mjs` proves short invalid JSON still rejects while truncated JSON can be repaired without persisting malformed raw sidecar text. |
| Open-world reducers | `src/directors/open-world-event-reducers.mjs`; `open-world-turn-coordinator.mjs`; `transaction-state.mjs`; `test-open-world-event-reducers.mjs`; `test-transaction-state.mjs`. | New coordinated open-world packets emit bounded reducer bundles instead of broad `openWorld.rootsSet` packets, and the production commit path now rejects any new `rootsSet` replacement even when a reducer bundle is also present. Reducer bundles now have a reusable validator/compactor that rejects forbidden keys, unknown operation types, invalid roots, runtime journal writes, and stale operation-count/changed-root diagnostics. Existing retained legacy ledger entries are still sanitized during pruning. |
| Dependent edit reobserve guard | `src/runtime/chat-turn-orchestrator.mjs`; `tools/scripts/test-chat-turn-orchestrator.mjs`; recovery/SRE focused tests. | An edited player row with an existing dependent assistant response returns `staleSource` before reclassification and cannot create a replacement ingress for the same host row. |
| Source-mutation REPAIR/CORE recovery bridge | `src/runtime/repair-runtime.mjs`; `src/runtime/runtime-app.mjs`; `src/runtime/message-reconciler.mjs`; `src/storage/core-store-v2.mjs`; `tools/scripts/test-repair-runtime.mjs`; `tools/scripts/test-message-recovery.mjs`; `tools/scripts/test-core-store-v2.mjs`; `tools/scripts/test-chat-native-runtime-flow.mjs`; `tools/scripts/test-repair-runtime-synthetic.mjs`. | A production `repair-runtime` boundary now opens CORE-first source-mutation recovery cases before old-ledger mutation. CORE Store can reopen a settled transaction to `recoveryRequired`; the production runtime CORE facade exposes `markRecoveryRequired`; and fake-host runtime paths now prove committed player-source edits plus committed Directive response edits/deletes write persisted CORE recovery projections before old ingress/response/recovery projections. CORE recovery projections expose source mutation, compact REPAIR decision, REPAIR-computed `legacyProjection`, dependent outcome/response refs, source Frame refs, allowed actions, visibility metadata when provided, and replacement-text hash/presence while stripping raw `replacementText`. CORE recovery conflicts still fail closed before old ledgers mutate. `MessageReconciler` consumes `legacyProjection` for the bridge's old projection status/action mirroring and remains the temporary projection/prompt-sync adapter, not the policy owner. |
| External context readiness | Five-user bounded Ashes artifact `2026-06-28T12-23-18-316Z`; readiness external-context probe. | Non-human soak profiles can browser-confirm ST Lorebooks, Memory Books, Summaryception, and VectFox observability without using `default-user`. |
| External context fixture-depth gate | `tools/scripts/lib/sillytavern-live-harness.mjs`; `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `tools/scripts/test-live-soak-prep.mjs`. | The readiness probe now reports `fixtureDepth` separately from browser/disk observability. Bounded live runs keep shallow fixture depth as a warning, while an unbounded full-certification run fails unless at least one non-human soak profile has rich active evidence for all required external-context targets. |
| External context fixture prep | `tools/scripts/prepare-sillytavern-external-context-fixture.mjs`; `tools/scripts/test-external-context-fixture-prep.mjs`; `tools/scripts/test-sillytavern-external-context-readiness-preflight.mjs`; `tools/scripts/run-alpha-gate.mjs`. | A deterministic dry-run/write/validate tool can prepare non-human soak profiles with bounded native World Info, STMemoryBooks, Summaryception, and VectFox fixture data. It refuses `default-user`, allows only `directive-soak-a` through `directive-soak-e`, writes no API keys or raw extension source, writes the fixture under the real Ashes character chat folder, clears all known SillyTavern disabled-extension arrays for the target fixture systems, validates through the same compatibility and fixture-depth contracts, and can feed sanitized synthetic browser snapshots into offline readiness so `host-extension-fixture-depth` is behaviorally tested without live SillyTavern. |
| Live external context fixture certification | `artifacts/live-soak/sillytavern-campaign/2026-06-28T20-56-56-424Z/report.json`; `host-extensions/external-context-probe.json`; `live-log.jsonl`; `tools/scripts/check-sillytavern-multi-user-soak-readiness.mjs --live --activate-external-context-fixture --write-artifacts`. | Strict five-user readiness passed with `host-extension-fixture-depth: pass`. `directive-soak-a` activated `Directive - Ashes - external-context-fixture`, loaded chat-bound World Info plus STMemoryBooks, Summaryception, and VectFox visibility markers, and produced `rich-active` evidence for all four targets. The other four soak users remained browser-observed/storage-isolated and did not need fixture activation. |
| External context generation proof gate | `tools/scripts/run-continuity-matrix-five-user-soak.mjs`; `tools/scripts/test-continuity-matrix-five-user-soak-coordinator.mjs`; `src/hosts/sillytavern/prompt-adapter.mjs`; `tools/scripts/smoke-sillytavern-live.mjs`. | The coordinator now summarizes pre-generation prompt-inspection artifacts separately from readiness. It requires expected capture depth, `externalPromptEnvironmentRef`, known external prompt keys, compact `externalPromptEnvironmentTargets`, final-host-prompt inclusion, and redaction summaries. When readiness marks a lane as a rich fixture user, the aggregate `external-context-generation-proof` fails unless that lane also proves rich generation-time pressure for ST Lorebooks/World Info, Memory Books, Summaryception, and VectFox. |
| Browser-safe shared contracts | Standalone smoke `2026-06-28T06-18-37`; contract hash/UTF-8 canaries. | Shared modules reachable from SillyTavern no longer depend on `node:crypto` or `Buffer`. |

### Not Yet Proven

| Area | Gap | Required closeout |
| --- | --- | --- |
| Runtime persistence cutover | Queued runtime persistence now has the controller-level v2 facade bridge and writes by explicit save id without changing active-save navigation. Chat-native flow proves queued runtime writes preserve the v1 checkpoint payload path/content while attaching a v2 runtime manifest ref and compact active head; controller tests prove manual Save/Save As remain v1 checkpoints and autosave stays on its separate v1 lane. Runtime settings/history updates now use the same v2 runtime persistence bridge instead of rewriting the v1 checkpoint. `settleActiveState(...)` is now classified and tested as an explicit State Safety v1 checkpoint action: it captures runtime-current settings into the manual checkpoint and clears the v2 runtime marker. CORE Store is still not the full production turn writer. | Keep `controller.persistRuntimeCampaignState(...)` limited to queued/runtime-current writes, preserve v1 index paths with `v2ManifestRef`, keep manual Save/Save As/Settle Active State/open/load as explicit active-save owners, keep autosave on its separate v1 lane until designed, and continue migrating durable turn ownership to CORE Store. |
| V2 layout bridge ownership | Active-save facade owns the default v2 resume/index layout; CORE Store owns `campaigns/{campaignId}/saves/{saveId}/core/...` and `campaigns/{campaignId}/core/...`. | Preserve this split until CORE can materialize the full active resume head and own manual Save/Save As/autosave semantics. Keep cross-writer tests in the alpha gate before live controller CORE Store instantiation as a writer. |
| V2 runtime resume source | The v2 active-save facade materializes a compact head that omits heavyweight runtime journals by design. Reloading from that head is not yet a proven full runtime resume path. | Define projection/rehydration rules for `runtimeTracking`, `turnLedger`, model-call journal continuity, sidecar journal continuity, and prompt/runtime revision continuity before claiming full v2 runtime resume safety. |
| CORE Store production ownership | Runtime app now instantiates and hydrates CORE Store for active campaign chats and routes production ingress, hostContinue release, post-release host-native completion/failure projection, synchronous and delayed host-native continuity-contradiction recovery, Directive-posted visible responses, retryable response recovery phase, deterministic chat-native mechanics checkpoints, active-turn model-call diagnostics, Command Log summary diagnostics/background settlement, Narrative Thread diagnostics/background settlement, regular campaign-sidecar lifecycle/background settlement, CORE-backed source-mutation recovery, and latest/no-outcome source-restart replacement transactions through it. CORE Store now records latest-boundary restart links with `supersedeLatestSourceTransaction(...)`, `latestSourceRestarted`, prior phase `restartSuperseded`, persisted recovery resolution, and hydrated/persisted source-restart projections. The chat-native mechanics checkpoint now writes CORE before the v1 checkpoint bridge, and committed player-source edits now have production-path CORE recovery projection proof. | Route the remaining source mutation decisions through a REPAIR service boundary before old reconciliation, migrate generic recovery, response edits/deletes beyond the current bridge, remaining background lifecycle writes, broader response-state ownership, final independent SRE review-worker ownership, and final bounded reducer/event mechanics application through CORE with old ledgers exposed only as read projections. |
| Full persisted timing certification | Bounded single-user Ashes proof now passes from CORE Store projections for `directivePosted` committed outcomes and records deterministic `clarificationNeeded` posts as skipped non-generation evidence. The five-user coordinator now requires each live lane to include a passing `live-generation-start-timing` check with `source: "coreStoreTurnTiming"`, `timingSource: "coreProjection"`, and `checkedTurnCount > 0`, and it exposes aggregate `generation-start-timing-core-proof`. It has not yet run the full five-user Ashes depth with that gate. | Run the five-user Ashes coordinator without `--turn-limit` and prove CORE-projection-backed `generationTiming.persisted.entries[]` across all lanes, including `hostContinue` and `directiveCommit` lanes. Keep all-skipped, summary-only, runtime-snapshot-only, or unknown-route artifacts as warning/failure rather than pass. Do not restore full response ledgers to v1 save payloads or promote the active-save facade head into the timing ledger. |
| Frame in production | Production ingress creates `directive.turnSourceFrame.v1`, and regular campaign sidecars now carry a compact `turnSourceFrameRef`/`sourceToken` into sidecar diagnostics and CORE background refs. Downstream SRE, REPAIR, LENS, and the full CORE lifecycle still do not consume the Frame as their only source token. | Extend compact Frame refs to CORE transaction, SRE, REPAIR, LENS, and remaining FORGE/background handoffs, then remove duplicate source-token construction. |
| True `hostContinue` release | Ordinary hostContinue now calls SillyTavern `Generate(...)` with `waitForCompletion: false`, records release timing, exposes CORE `turnTiming`, and has live-smoke artifact plumbing for runtime/persisted timing proof. The bounded three-turn Ashes run at `artifacts/live-soak/sillytavern-campaign/hostcontinue-generation-start-fixed-20260628-165022/report.json` proved a `hostContinue` counsel turn from runtime snapshot evidence with `hostGenerationReleasedAt`, `hostGenerationReleaseMode: nonblocking`, `generationStartLatencyMs: 1131`, and `architectureWithin60s: true`. | Retain CORE-projection-backed `generationTiming.persisted.entries[]` with `hostGenerationReleasedAt`, `architectureWithin60s: true`, separate provider completion timing, and no blocking model-backed SRE/advisory/LENS/FORGE work before release. Repeat this in the five-user coordinator before full certification. |
| Terminal host-native completion certification | Bounded five-user Ashes artifact `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T08-22-01-670Z/report.json` proves the bridge can record persisted CORE host-native completion at the required turn depth in all five non-human soak lanes. Follow-up deterministic gates now prove the certification contract rejects count-only `hostContinue` completion proof and requires `soak-turn-03` binding. The bridge fixes behind the bounded proof are: canonical 64-character host-row hashes in the SillyTavern adapter, transaction-aware CORE reobserve for same-transaction host observations, `backgroundSettling -> visibleResponsePosted` phase allowance for post-release host-native completion, and a `visibleResponseRefRepaired` event for missing-hash repair. | Full certification requires the unbounded 52-turn run with the stricter proof: every lane's `live-host-native-completion-proof`, aggregate `host-native-completion-core-proof`, and full-certification preflight must expose passing required completion evidence for `scriptMessageId: "soak-turn-03"`, `turn: 3`, `expectedRoute: "hostContinue"`, and `expectedResponseStrategy: "injectAndContinue"`. Keep proof hash-only; do not store raw assistant text in artifacts or CORE projections. |
| `directiveCommit` hot-path closeout | Production Director commit records `directiveGenerationStartedAt` at the narration provider boundary, keeps provider completion separate, exposes CORE `turnTiming`, and has live-smoke artifact plumbing for persisted timing proof. Command Log summary and Narrative Thread extraction now have queued bridges that no longer block narration start or the chat-native visible response return path, including non-terminal pending accept/confirm resolutions, and successful chat-native settlements commit CORE background effects. Terminal checkpoint posts and replies now have a zero-operation CORE settlement policy. A bounded single-lane live rerun at `artifacts/live-soak/sillytavern-campaign/2026-06-28T21-58-54-918Z/report.json` proved one `directiveCommit` turn from runtime snapshot evidence with max generation-start latency `25875 ms` and `architectureWithin60s: true`; the later three-turn Ashes proof at `hostcontinue-generation-start-fixed-20260628-165022` repeated `directiveCommit` evidence with max `23384 ms`; the mixed CORE-projection Ashes proof at `core-timing-mixed-proof-20260628-175644` proved persisted CORE timing for one `committedOutcome` at `13934 ms`. Other post-turn work can still block after visible response or remain unordered across background queues. | Retain CORE-projection-backed `generationTiming.persisted.entries[]` with `directiveGenerationStartedAt`, `generationStartLatencyMs <= 60000`, `architectureWithin60s: true`, terminal-outcome coverage, and repeat evidence in the five-user coordinator before full certification. |
| Production FORGE ownership | Synthetic FORGE and the regular campaign-sidecar bridge now prove one aggregate apply, one optional CORE background batch, one prompt sync, and conflict-before-mutation for accepted regular sidecars. Command Log summary, Narrative Thread extraction, advisory enrichment, and terminal checkpoint settlement remain specialized queues/control paths, but successful settlements now share CORE background semantics instead of diagnostics-only apply. The Narrative Thread bridge now covers normal committed turns and non-terminal pending accept/confirm resolutions; the director still applies internal state commits through its existing director path rather than one FORGE aggregate apply. | Fold director-internal multi-commit work and remaining background effects into FORGE/background settlement. Keep regular sidecar, Command Log, Narrative Thread, advisory, and terminal checkpoint bridge tests as the production safety floor. |
| Open-world final shape | Broad `rootsSet` application is removed from migrated production commits, and production chat-native mechanics checkpoints now create compact CORE turn projections. CORE now validates and records redacted reducer-bundle source evidence when a committed packet carries `directive.openWorldReducerBundle.v1`, excludes reducer-owned roots from duplicate broad domain operations, and enforces stale mechanics base revisions. Reducer bundles are still derived through an existing projection commit path. | Apply bounded reducer events through CORE Store once instead of deriving them from a projected full-state commit. |
| Full REPAIR ownership | The dependent-edit loop has a targeted guard, and the source-mutation bridge now has a production `repair-runtime` boundary with CORE-first projection proof for committed player edits and committed Directive response edits/deletes. Edit/delete source-mutation opening is no longer buried solely inside `MessageReconciler`, REPAIR now returns `legacyProjection` for the bridge's old ingress/response/recovery status and action mirroring, owns diagnostic-only visibility observations, supplies compact source-reobserve decisions for the Sam Vickers dependent-edit guard plus latest-boundary restart eligibility, defines response-recovery policy for host-native unavailable/failed and synchronous/delayed host-native continuity contradiction paths, authorizes host-native failed/unavailable reobserve closure, and now authorizes source-mutation rollback actuation before `MessageReconciler` restores a tracked revision. `chat-turn-orchestrator` now consumes `restartLatestSource` for latest/no-outcome rows by creating a distinct restart ingress/source Frame/CORE transaction, calling CORE Store `supersedeLatestSourceTransaction(...)`, marking the old ingress `restartSuperseded`, resolving the old recovery as `latest-source-reobserved`, and proving duplicate reobserve idempotency. CORE Store persists that link as `latestSourceRestarted`, keeps both host-map rows, excludes the superseded transaction from active CORE heads, and rehydrates the link from event segments. CORE Store also keeps generic `recoveryRequired` terminal for visible responses unless the response ref carries REPAIR's host-native reobserve closure decision; delayed reobserve after failed/unavailable writes a hash-only visible response and a resolved recovery projection while old response/recovery ledgers are mirrored closed; delayed callback or manual reobserve contradictions now retain the hash-only visible response ref and then reopen CORE recovery with SRE-review actions. Retry/rerun beyond source mutation, broader rollback execution beyond the current REPAIR-authorized source-mutation restore, Scene Handshake/Mission Component invalidation, reobserved no-outcome delete writes, narration retry, generic committed response retry actuation, delete committed outcome, and final independent SRE contradiction worker ownership still read or write old ledgers/snapshots in places. | Continue moving recovery choices into REPAIR until old recovery ledgers are pure projections. Next steps: move generic committed response retry/reobserve policy and broader rollback execution through REPAIR, and split final SRE source-review worker ownership from response-dispatch bridge settlement. |
| Full Ashes certification | Current strongest five-user proof is bounded artifact `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T08-22-01-670Z/report.json`. It used `--turn-limit 3`, reached the required host-native completion turn, and passed readiness, external-context generation proof, persisted CORE generation-start timing, persisted CORE host-native completion, factual grounding, and artifact completeness. Its top-level `warning` status is expected bounded-depth evidence, not a failed gate. The latest single-lane bounded regression artifact `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T14-32-56-379Z/report.json` used `--turn-limit 3` on `ashes-factual-director` and passed `qualityStatus`, persisted CORE generation-start timing, persisted CORE host-native completion, story-quality review, factual grounding, and sidecar health with 11 sidecars, 8 applied, 3 no-change, and 0 rejected. Its only lane warning was the intentional three-turn limit, but the older retained failed-call artifact shape omitted request hashes for the `continuityProjectionPlanner` and `missionDirectorAdvisor` failures. The full-depth audit still applies: model-assisted story review reliability, strict-mode warning promotion, artifact counts, external-context fixture standard, and lane-owned model-call fallback evidence must be settled before an unbounded run. | Do not start the multi-hour five-user Ashes coordinator without `--turn-limit` until `preflight-continuity-matrix-full-certification.mjs --strict` proves story-quality review is reliable, strict-mode warnings are expected/cleared, unbounded artifact counts are computed, the external-context fixture standard is explicit, and failed model-call policy is resolved from durable lane-owned per-call redacted evidence. Full certification requires 52 turns per lane, 52 pre-generation prompt snapshots per lane, 53 fact checks per lane, 265 total fact checks, all lane results pass, model-assisted story review is identity-matched and not `not-run`, strict release warnings disappear, model-call failures are either zero or fallback-handled with `modelCallPolicy.failurePolicyEvidence` role/status/error-code/request-hash evidence, and full story-quality review passes. |
| Rich active external-context generation pressure | Strict readiness now proves a prepared non-human profile can be loaded in-browser and reach `fixtureDepth: pass`, and the deterministic coordinator gate now rejects shallow generation evidence for rich fixture users. The full Ashes coordinator has not yet run unbounded against that prepared profile, so no full-depth lane artifact proves generation-time prompt/retrieval/visibility pressure across 52 turns. | Run the unbounded five-user coordinator after prepared-fixture readiness passes, retain `external-context-fixture-depth: pass`, require pre-generation prompt snapshots for the full depth, and prove generation-time external prompt/retrieval diagnostics remain redacted and correctly attributed while all lanes complete. |
| Full story-quality proof | Bounded proof scored only a few visible messages per lane. The full-depth audit found model-assisted story review was not release-ready: several lanes had `not-run` review status despite provider success, one lane timed out `storyQualityReviewer` after 60 seconds, and one deterministic story score warned below the release-candidate minimum. The coordinator now emits `story-quality-model-review`, reads both flat and nested lane report shapes, treats missing/`not-run`/unparseable/timeout evidence as non-certifying, and fails unbounded certification unless every lane has parseable `pass` model-assisted story-quality review. `tools/scripts/replay-story-quality-review-preflight.mjs` can replay existing request artifacts through the review-only smoke path or dry-run-assess result files before a multi-hour run, and now rejects stale or fabricated results whose kind/schema, request id, input hash, reviewer role, model-call success, score counts, score/message ids, score/message indexes, or transcript coverage do not match the request. | Run replay preflight in strict mode against the latest bounded artifact and any single-lane rehearsal artifact before starting full five-user Ashes. Full-depth live run must score full transcripts for agency, continuity, prose naturalness, and campaign-specific tone; release strict mode should require identity-matched parseable model-assisted review with `pass` status, and never accept `not-run`, timeout, missing result, unparseable provider output, stale result hashes, wrong reviewer roles, missing model calls, duplicate/unknown/missing score refs, partial transcript coverage, or zero-score fabricated passes as certification evidence. |

### Full-Depth Certification Preflight

Run these before any unbounded five-user Ashes certification attempt. The purpose is to fail in minutes, not after a multi-hour live run.

| Preflight | Owner | Required result |
| --- | --- | --- |
| Aggregate full-certification preflight | QA/Live agent | Run `node tools\scripts\preflight-continuity-matrix-full-certification.mjs --artifact-root <artifact-root> --strict` against the latest coordinator artifact before removing `--turn-limit`; add `--write-artifacts` to persist `full-certification-preflight.json`. Required result for release readiness: aggregate report status pass, no non-passing aggregate checks, every lane report status pass, every lane check pass, any `live-smoke-52-turn-delegation` check pass, five lanes present, no turn limit, no strict-blocking warnings, 52 prompt snapshots per lane, 53 fact checks per lane, story-quality release proof, external-context generation depth, validated `host-extensions/external-context-summary.json` / `externalContextSummary` artifact content for every lane, explicit external-context coverage standard, factual-grounding pass, persisted CORE generation-start timing, persisted CORE host-native completion with exact required-turn binding, and model-call policy pass. Failed model calls are acceptable only as resolved details when durable lane evidence at `modelCallPolicy.failurePolicyEvidence` includes role id, status, sanitized error code, request hash, known authority fallback, and no release-blocking role policy. Missing durable lane policy evidence, count-only failures, count-only host-native completion proof, unknown roles, missing request hashes, `fail-closed`, and `fail-retryable` role failures block the gate. A bounded artifact should fail this gate by design. |
| Story-quality review replay | QA/Live agent | Run `node tools\scripts\replay-story-quality-review-preflight.mjs --artifact-root <artifact-root> --strict` to replay existing `quality-review/model-assisted-review/request.json` artifacts through the review-only path, or add `--dry-run` to assess existing result files only. Required result: every lane has identity-matched parseable `pass`, no `not-run`, no missing result, no stale input hash/request id, no missing or wrong-role model call, no zero-score fabricated pass, no duplicate/unknown/missing score refs, no partial transcript coverage, no unparseable provider output, and no 60-second `storyQualityReviewer` timeout. |
| Architecture Redesign release bundle | QA/Live agent | After the strict Continuity Matrix full-certification preflight passes, run `node tools\scripts\preflight-architecture-redesign-release-bundle.mjs --manifest <bundle-manifest> --strict --write-artifacts`. Required result: strict Continuity Matrix `full-certification-preflight.json` pass, Command Bearing closure report pass, Command Bearing point lifecycle report pass, catastrophic terminal endings report pass, command-fitness terminal endings report pass, message mutation discovery pass, and message mutation actuation proof pass. Build the mutation proof with `node tools\scripts\run-sillytavern-message-mutation-actuation-live.mjs --live --write-artifacts` using non-human soak-user targets, or use `preflight-sillytavern-message-mutation-actuation.mjs --manifest <mutation-manifest> --strict --write-artifacts` only when the source-edit, source-delete, assistant-edit, assistant-delete, and selected-swipe child reports already exist. The five-user chat soak alone is not full Architecture Redesign certification; discovery-only message mutation evidence is also not enough because edit/delete/swipe actuation must be proven through live host controls without `default-user`. |
| Message-mutation actuation producer | REPAIR/SRE worker with QA/Live agent | Use `tools/scripts/run-sillytavern-message-mutation-actuation-live.mjs` as the focused live proof producer for `directive.sillytavernMessageMutation.actuationProof.v1`. It composes `run-sillytavern-message-edit-live.mjs` for source/assistant edit, `run-sillytavern-message-delete-live.mjs` for source/assistant delete, and the Scene Handshake selected-swipe smoke, while enforcing non-`default-user` execution, configured soak-user membership when provided, strict pass/fail, numeric distinct targets, and delete-safe target ordering before any chat mutation. Do not count `run-sillytavern-message-action-live.mjs` as mutation actuation; it is optional reconciliation pressure only. Required result: source edit/delete, assistant edit/delete, and selected-swipe all pass with native host-control evidence, expected REPAIR/CORE/SRE recovery or source-integrity evidence, redacted text hashes instead of raw replacement text, served-extension freshness, non-human SillyTavern user identity, and `defaultUserTouched: false`. |
| Strict-mode dry assessment | QA/Live agent | Evaluate the latest bounded lane reports under strict-mode semantics and list every warning that would become a failure. Non-depth warnings must be fixed or explicitly scoped out before the full run. |
| Unbounded artifact budget | QA/Live agent | Compute expected full-depth artifact counts without live generation: 52 generation prompt snapshots per lane, 53 fact checks per lane, 265 fact checks total, transcript-level review, model-assisted review, readable transcript, live log, and report/summary artifacts. |
| Coordinator release gates | Agent-0 with QA | Add or confirm aggregate checks for model-assisted story review status, quality-review parseability, all expected prompt snapshots, all expected fact checks, full lane artifact completeness, and strict lane status. |
| External-context coverage standard | Agent-0 | Decide whether release certification requires rich external-context fixture pressure on every non-human lane or accepts one rich fixture lane as limited coverage. The report must label this explicitly. |
| Model-call failure policy | Agent-0 with QA | The lane producer owns this evidence. `soak-sillytavern-campaign-live.mjs` writes `modelCallPolicy.failurePolicyEvidence` and emits `live-model-call-failure-policy`; `run-continuity-matrix-five-user-soak.mjs` carries `.lanes[].modelCallFailurePolicy` and emits aggregate `model-call-failure-policy`; full-certification preflight consumes the lane-owned evidence first. Inspect failed model-call roles and redacted per-call evidence from retained smoke model-call records only to populate or diagnose that durable policy object, not as a substitute for it. Release policy must distinguish authoritative failed calls from fallback-handled advisory/utility failures through the model-call authority matrix. Full-certification preflight fails missing durable lane evidence, count-only evidence, unknown roles, missing status/error code/request hash, unknown fallback policy, `fail-closed`, and `fail-retryable` failures. It reports fallback-handled calls as pass-level details only when the owning gates passed and no state/prompt/prose authority was lost. |
| Single-lane strict live rehearsal | QA/Live agent | Run one mid-depth or unbounded single-lane strict rehearsal, preferably the factual lane first because it previously hit the story-quality reviewer timeout. Do not scale to five lanes until this lane is clean. |

Do not treat the bounded turn-3 artifact as proof that these release gates are ready. It records terminal host-native completion and persisted generation-start timing at bounded depth, but the host-native completion artifact contract still needs exact required-turn binding before release certification. It also does not prove full story-quality review, 53 fact checks per lane, strict-mode cleanliness, full external-context pressure, or per-call failed-model-call release evidence.

### Agent Findings To Preserve

The June 28, 2026 runtime/storage agents agreed on the following bridge shape:

- `CampaignStartController` needs a controller-level `persistRuntimeCampaignState(...)` method that loads the existing v1 checkpoint, calls the v2 active-save facade, updates active controller ids/state, and returns the v2 persist result.
- Only queued runtime persistence should call that method during the bridge. Public/manual `saveCurrentGame()` and `saveCurrentGameAs()` continue to call the v1 save paths and return v1 `directive.campaignSave` payloads.
- `autosaveStableTurn()` should not be swept into this bridge without a separate autosave design. The autosave lane currently has distinct v1 record/pruning semantics.
- The v2 facade return shape should include `kind: "directive.activeCampaignStatePersist.v2"`, `storageFormat: "v2"`, `campaignId`, `saveId`, `updatedAt`, `wroteV1Payload: false`, `saveManifestRef`, `campaignManifestRef`, artifact `refs`, and a `saveIndexEntry` that preserves the existing v1 `path` while adding `runtimeStorageFormat: "v2"`, `v2RuntimePersistedAt`, and `v2ManifestRef`.
- Tests must assert that v2 runtime persistence does not write `campaignSaveLogicalKey(saveId)`, writes v2 manifests before index update, preserves the v1 save-index path, sets `runtimeStorageFormat: "v2"`, and attaches both `v2RuntimePersistedAt` and `v2ManifestRef`.
- Controller tests must prove v1 payload/revision preservation during runtime v2 persist, then prove later manual Save writes a new v1 checkpoint and clears the runtime v2 marker.
- Chat-native flow tests must keep manual Save/Save As v1 return-shape assertions and must not claim model-call sequence continuity through the compact v2 head until projections or rehydration exist.
- Queued runtime persistence must be save-bound and non-navigating. It persists the save id from `campaignChatBinding.saveId`; public load/open/Save Game As flows, not background runtime writes, own controller active-save identity.
- The current compact v2 head intentionally omits runtime journals. That is good for scale, but it means reload-through-v2 is not yet a full runtime resume source until journal projections or rehydration are defined. Current runtime load keeps the v1 checkpoint as the default resume source and overlays known binding metadata for current-chat hydration without rewriting the checkpoint.
- The first production CORE migration seam should be ingress, not diagnostics. Diagnostics need a stable transaction id, so `beginTurn(sourceFrame)` must exist before model-call, sidecar, recovery, or response diagnostics can be safely attached.
- `chat-turn-orchestrator.createIngress(...)` is the correct low-disruption production Frame seam because dedupe has resolved the authoritative host message identity and active campaign/save/chat context is available there. `runtime-bridge.mjs` and `chat-adapter.mjs` are too early to own campaign/source provenance.
- CORE `beginTurn` should run before the old ingress projection during the bridge. If CORE begin fails, the runtime must not persist an old-ledger-only ingress as if the new durable writer had accepted the source.
- The production hostContinue release split must keep provider completion outside generation-start latency. Nonblocking `continueHostGeneration` records `hostGenerationReleasedAt`, and the first post-release bridge now observes host-native completion/failure later with hash-only assistant refs. Contradiction review and user-facing failure policy still need to move into CORE/REPAIR/SRE instead of returning to synchronous observed-message review.
- If host generation has already been released and CORE cannot record `hostContinueReleased`, Directive must still preserve release evidence in the old response ledger and open typed recovery. This is a bridge failure state, not a silent success.
- Directive-posted responses now bridge CORE visible-response state. A specific `responseRetryRequired` phase lets response post failures and provider-failure-after-mechanics cases attach retryable recovery to the same transaction and later record one visible response without making generic `recoveryRequired` reopenable. Host-native failed/unavailable recovery can now close from delayed reobserve only through REPAIR's response-reobserve closure decision, which writes a hash-only CORE visible response and resolved recovery projection. Broader response-state ownership is still incomplete until generic response retry actuation, response edits, host-native contradiction/review policy, and generic recovery flows are owned by CORE/REPAIR projections.
- Production chat-native mechanics checkpoints now bridge into CORE before narration: `turn-commit-coordinator.mjs` records compact domain-hash operation bundles through `commitMechanics(...)`, records validated redacted `directive.openWorldReducerBundle.v1` source evidence when present, avoids duplicate broad domain commits for reducer-owned roots, passes `baseMechanicsRevision`, `response-dispatcher.mjs` tolerates the intended `mechanicsPending -> visibleResponsePosted` ordering, and `test-chat-native-runtime-flow.mjs` proves persisted CORE turn-ledger projections survive reload without raw transcript text, raw narration, snapshots, `runtimeTracking`, or `rootsSet`.
- Model-call diagnostics now bridge only the active in-progress ingress transaction and remain best-effort. The Command Log summary bridge, Narrative Thread settlement bridge, and regular campaign sidecar scheduler now use explicit committed-turn context rather than `activeIngressId`: Command Log and Narrative Thread queued/failure/stale states use CORE diagnostics, successful specialized settlements use sanitized CORE background effect batches, and accepted regular sidecars use CORE background batches for aggregate state operations.
- Synthetic FORGE already demonstrates the target batch semantics, including one CORE `backgroundBatchCommitted` event per FORGE run, one FORGE diagnostic, one LENS background flush, and no raw worker prompt/response storage for diagnostics-only no-change work.
- The first production FORGE slice is now implemented for regular campaign sidecars: `runtimeCoreTurnStore.commitBackgroundBatch(...)` is exposed to `createCampaignSidecarScheduler`; accepted sidecar operations are aggregated before mutation; cross-worker path conflicts reject the affected batch before mutation; accepted regular sidecars use one bridge apply, one best-effort CORE background batch commit, and one prompt sync.
- The June 29 sidecar latency/rejection audit refined that slice: FORGE should guard source freshness through the source Frame, not reject valid background effects merely because unrelated background or later-turn work advanced the global runtime revision. The scheduler now rebases over monotonic unrelated revision drift only after source-ingress freshness still passes, keeps non-monotonic revision drift fail-closed, compacts sidecar proposals, and gives likely-truncated JSON one strict repair attempt before the existing invalid-proposal rejection path. The latest bounded live proof (`2026-06-29T14-32-56-379Z`) ended with 0 rejected sidecars, while `test-campaign-sidecar-scheduler.mjs` proves unrepaired invalid JSON still rejects without mutation.
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
- The first REPAIR production bridge now has an explicit runtime boundary: `repair-runtime.mjs` records source-mutation recovery decisions and CORE-first recovery cases before `MessageReconciler` mirrors them into old projections and prompt sync. `runtimeCoreTurnStore` exposes `markRecoveryRequired`; committed player-source edits, committed Directive response edits, and committed Directive response deletes have fake-host runtime proof; CORE recovery conflicts fail closed before old-ledger mutation; CORE exposes compact `repairDecision` projections with `legacyProjection`; and CORE strips literal raw `replacementText` even if a future caller passes it. REPAIR now drives the old projection outcome for source-mutation edit/delete paths, latest/no-outcome source restart decisions, and tracked-revision rollback actuation authorization; `chat-turn-orchestrator` actuates those restart decisions as distinct replacement ingress/source Frame/CORE transaction ids while preserving the old recovery as resolved audit evidence. Remaining bridge work is to move generic retry/rerun, broader rollback execution, and visibility-only production behavior behind REPAIR, promote source restarts into a store-native linked CORE event/API, and demote old recovery ledgers to pure projections.
- CORE recovery projections need to expose enough detail for product review: source mutation kind, source kind, host/ingress/response/outcome refs, dependent outcome/response refs, source Frame ref, replacement-text hash/presence, pre-outcome revision, auto-rollback flag, and allowed actions. They must not expose raw replacement text.
- The June 29 response-lifecycle audit confirmed that CORE already models `hostContinueReleased`, `visibleResponsePosted`, `responseRetryRequired`, and `recoveryRequired`. The first production bridge now adds a nonblocking host completion callback: release host generation immediately, wait until the release projection is persisted, then observe completion/failure later and write exactly one CORE `recordVisibleResponse(...)` or generic recovery projection with hash-only host refs.
- The host-native completion bridge deliberately does not retry host generation, store raw assistant text, or require contradiction review inside the release call. Deterministic fake-host tests prove the callback and duplicate-idempotency behavior. If a host adapter provides a synchronous contradictory assistant row, the dispatcher asks REPAIR for `hostNativeContinuityContradiction`, writes CORE `recoveryRequired`, preserves the old recovery projection, and redacts the observed assistant text from host-continuation refs. If a delayed callback or manual `reobserveHostGenerationCompletions(...)` later sees contradictory host-native text, the dispatcher records the hash-only visible response first, then asks REPAIR/SRE policy for contradiction recovery so the CORE transaction keeps `visibleResponseRef` evidence while moving to `recoveryRequired`. Live SillyTavern certification and the final independent SRE review worker remain open.
- The live-proof audit found that older bounded artifacts did not contain host-native callback fields. The June 29 bounded five-user Ashes run now certifies the required turn-3 terminal SillyTavern assistant rows from persisted CORE response projections for the bounded depth. The remaining certification gap is full-depth coverage, not the turn-3 host-native proof path.
- The SRE/REPAIR policy audit separated persistence from judgment: CORE can record the terminal hash-only assistant ref, SRE-style post-visible review can reopen contradiction recovery without deleting the visible evidence, and REPAIR must own failed/unavailable/retry/reobserve decisions. `unavailable` should remain distinct from host-generation failure so diagnostics do not turn missing host evidence into a false failed generation.
- The first backend policy slice now makes that distinction concrete in `response-dispatcher.mjs`: a callback with no observable assistant row records `hostNativeAssistantUnavailable` with reobserve-first actions and response status `unavailable`, true callback `failed` records CORE `responseRetryRequired` with retry/reobserve/fallback actions, and synchronous or delayed contradictory host-native assistant rows record `hostNativeContinuityContradiction` with SRE-review/fallback/branch actions. A later successful host-native observation or delayed `reobserveHostGenerationCompletions(...)` may close failed/unavailable recovery only through REPAIR's response-reobserve closure decision; generic `recoveryRequired` remains blocked from visible-response posting. A delayed contradiction is not treated as completion: tests prove the visible response hash is retained, the old response projection moves to `recoveryRequired`, and no raw assistant prose is stored in CORE or response ledgers.
- The story-quality/live-certification audit found the next certification blocker: the existing review-only smoke path is usable, but full-depth certification must have a coordinator aggregate gate plus replay preflight so `not-run`, timeout, missing result, unparseable model-assisted story-quality results, stale identities, wrong reviewer roles, missing model-call proof, score-count mismatch, duplicate/unknown score refs, and partial transcript coverage cannot be mistaken for pass/warning evidence. That slice is now implemented through `story-quality-model-review` and `tools/scripts/replay-story-quality-review-preflight.mjs`; full-run readiness is guarded by `tools/scripts/preflight-continuity-matrix-full-certification.mjs`, and strict dry-run assessment of bounded artifacts fails as expected.
- The REPAIR/SRE audit's next backend ownership slice is now started in production code: `repair-runtime.mjs` owns source-mutation recovery case construction, allowed actions, CORE-first recovery writes, idempotent replay through CORE idempotency keys, compact repair-decision projection, old-projection outcome decisions for committed player/Directive response mutations, latest/dependent source-reobserve policy, source-mutation rollback actuation authorization, response-recovery policy for host-native unavailable/failed/continuity-contradiction cases, and response-reobserve closure authorization for host-native failed/unavailable rows. `chat-turn-orchestrator` now acts on latest/no-outcome restart decisions with a fresh replacement CORE transaction, store-native `latestSourceRestarted` supersede link, and idempotent duplicate handling; `MessageReconciler` is now a temporary old-ledger/prompt-sync projection adapter for source mutation, and `response-dispatcher` remains the temporary host-observation bridge for synchronous contradiction, delayed post-visible contradiction settlement, and authorized reobserve closure. The remaining REPAIR/SRE slice is generic retry/rerun ownership, broader rollback execution ownership, visibility-only production mutation ownership, and final SRE-owned review worker separation from the response-dispatch bridge.

### Next Implementation Order

1. Preserve v2 layout bridge ownership: active-save owns the default v2 resume/index layout, CORE Store owns the save-scoped `core` layout, and cross-writer tests stay in the gate.
2. Storage cutover: wire the tested v2 active-save facade through `CampaignStartController` and `persistRuntimeCampaignStateNow` so queued runtime writes stop rewriting v1 full-save payloads, while manual Save/Save As remain v1 checkpoints and autosave cutover is designed separately.
3. Continue production CORE ownership: move remaining source-mutation decisions, mechanics, remaining background lifecycle writes, and broader response-state ownership into CORE with old ledgers as projections.
4. Production fast gate: release ordinary `hostContinue` without awaiting provider completion, model-backed SRE, advisory work, LENS rebuild, FORGE, remaining thread settlement, or Command Log summary; keep host-native completion/failure on the post-release CORE bridge and expand review/recovery policy around it.
5. Production `directiveCommit` hot path: keep the new `directiveGenerationStartedAt` metric, move remaining non-required work into FORGE/background settlement, and prove the persisted budget in live SillyTavern.
6. REPAIR/SRE ownership expansion: generalize the dependent-edit guard and source-mutation CORE bridge into a single recovery authority for edit/delete/retry/rerun/rollback.
7. Full-depth live certification: run only after production persistence and generation-start metrics are real, not synthetic.

Immediate storage-cutover slice from the current agent audit:

- Keep public `saveCurrentGame(...)`, `saveCurrentGameAs(...)`, and `autosaveStableTurn(...)` on their current v1 checkpoint/autosave lanes for this slice.
- Runtime/settings persistence is now migrated first: `updateRuntimeHistoryLimit(...)` and `updateRuntimeSettings(...)` persist through `persistRuntimeCampaignState(...)` instead of `controller.saveCurrentGame(...)`.
- `settleActiveState(...)` is classified as a user-invoked State Safety checkpoint, not queued runtime-current persistence. Keep it on the v1 checkpoint lane unless product language changes.
- Focused proof now shows runtime/settings updates preserve the existing v1 payload bytes, attach `runtimeStorageFormat: "v2"`, `v2RuntimePersistedAt`, and `v2ManifestRef` to the save-index entry, and update the compact v2 active head. Controller proof still covers later manual Save rewriting a v1 checkpoint and clearing all v2 runtime bridge fields. Shell proof covers Settle Active State through both the UI action and direct app API: it returns a v1 `directive.campaignSave`, keeps the active save slot/path, captures runtime-current settings, and clears the v2 runtime marker, timestamp, and manifest ref.
- Shell flow proof now shows Settle Active State intentionally writes a v1 checkpoint after runtime settings create a v2 marker, clears `runtimeStorageFormat`/`v2ManifestRef`, and captures the runtime-current settings into the v1 save payload.
- Required focused tests for this slice are `test-runtime-campaign-start-controller.mjs`, `test-chat-native-runtime-flow.mjs`, `test-active-save-facade-v2.mjs`, and `test-storage-cross-writer-v2.mjs`; run `run-alpha-gate.mjs` only after those pass.

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
- Keep and expand the post-release host-native completion/failure event path for nonblocking SillyTavern generation. It observes the completed native assistant row and writes CORE projections later without blocking release or retrying host generation.

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
- Route host `MESSAGE_UPDATED` through REPAIR visibility observation, not edit recovery. Visibility-only changes may append one bounded CORE `sourceVisibilityMutation` diagnostic for the transaction; they must not save the campaign, sync prompt context, mutate ingress/response status, or create recovery journal entries.
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
- Production visibility-only fixture proving Summaryception ghosting, Memory Books unhide markers, and VectFox prompt exclusion append diagnostic-only CORE evidence without prompt sync, save, or recovery side effects.

Exit gate:

- Edited dependent player row cannot produce a replacement classified ingress.
- Recovery case has one owner and one visible product path.
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
- Normalize the rich-fixture diagnostic objects in the same model:
  - `memoryBooks.rangeDiagnostics`;
  - `summaryception.staleness`;
  - `vectFox.backendDiagnostics`.
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
- `story-quality-model-review` aggregate check with every lane at parseable `pass` for unbounded certification;
- `quality-review/model-assisted-review/result.json` per lane, with no `not-run`, timeout, missing result, or unparseable provider output;
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
node tools\scripts\run-continuity-matrix-five-user-soak.mjs --live --turn-limit 3 --activate-external-context-fixture --write-artifacts
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
- Generation-start timing proof now has deterministic, artifact-plumbing, and bounded live runtime-snapshot coverage: CORE Store projections expose `turnTiming`, response dispatch carries Directive-posted `turnLatency` into persisted CORE response refs, live smoke rounds attach runtime and persisted `generationTiming`, delegated soak promotion writes that proof into `turn-end` records, and the soak runner emits `live-generation-start-timing`. The failed bounded five-user run at `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-28T21-42-29-479Z/report.json` exposed a missing-timestamp normalization bug; the bounded single-lane rerun at `artifacts/live-soak/sillytavern-campaign/2026-06-28T21-58-54-918Z/report.json` proved one runtime-snapshot `directiveCommit` turn at `25875 ms`; and the bounded three-turn Ashes run at `artifacts/live-soak/sillytavern-campaign/hostcontinue-generation-start-fixed-20260628-165022/report.json` proved runtime-snapshot coverage for both `directiveCommit` and `hostContinue`, including `hostContinue` release at `1131 ms`. The persisted closeout is now specifically a CORE projection extractor closeout: the smoke path must read save-scoped CORE `turnTiming` for the active `(campaignId, saveId)` instead of stale v1 save payload ledgers.
- External-context generation proof now has deterministic gate coverage beyond generic key presence. The prompt adapter records compact target summaries as `externalPromptEnvironmentTargets`; live smoke preserves them in prompt-inspection artifacts; and the five-user coordinator requires pre-generation snapshots, expected capture depth, external environment refs, known external keys, final-host-prompt inclusion, and rich target pressure when readiness identifies a rich fixture user. This is not yet full live certification until the unbounded Ashes run produces those artifacts.
- Host-native completion projection now has deterministic bridge and artifact-contract coverage. The SillyTavern adapter emits a post-release hash-only completion/failure callback; response dispatch waits for the release record to persist, then writes one CORE visible-response projection or generic recovery projection; duplicate callbacks are idempotent. Live smoke now attaches per-round `hostNativeCompletion.persisted` and aggregate `hostNativeCompletionProof`; delegated soak emits `live-host-native-completion-proof`; and the five-user coordinator emits aggregate `host-native-completion-core-proof`. This is not live certification until an Ashes run proves terminal host-native assistant rows from SillyTavern artifacts and the proof remains bound to the scripted `hostNativeCompletionRequired` turn instead of a generic completion count.
- Bounded sidecar/finalization regression proof passed for `ashes-factual-director`: `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T14-32-56-379Z/report.json`. The lane used `--turn-limit 3`, passed persisted CORE generation-start timing with max latency `29911 ms`, passed persisted CORE host-native completion with one completion and max latency `14756 ms`, passed story-quality review and factual grounding, and ended with `sidecarRejectedCount: 0` / `sidecarRejectedDelta: 0` after 11 sidecars. This run confirms the previous stale-global-revision sidecar conflicts and relationship JSON rejection are no longer present in bounded proof. It is still not full certification because the only remaining lane warning is the intentional three-turn limit.
- Story-quality certification now has deterministic coordinator and replay-preflight coverage. `run-continuity-matrix-five-user-soak.mjs` emits aggregate `story-quality-model-review` and rejects missing, `not-run`, unparseable, timeout, non-pass, stale request/result identity, wrong reviewer role, missing model-call proof, score-count mismatch, duplicate/unknown score refs, or partial transcript score coverage for unbounded certification. `replay-story-quality-review-preflight.mjs --dry-run --strict` against `artifacts/live-soak/continuity-projection-matrix-five-user/2026-06-29T08-22-01-670Z` found five request artifacts and correctly failed them: four `not-run` results and one timeout/latency failure. This proves the bounded artifact cannot be promoted to full-depth readiness without replaying or regenerating story-quality review evidence.
- Full-certification preflight now has a deterministic aggregate gate and a lane-owned model-call evidence contract. `soak-sillytavern-campaign-live.mjs` writes `modelCallPolicy.failurePolicyEvidence` and lane check `live-model-call-failure-policy`; `run-continuity-matrix-five-user-soak.mjs` carries `.lanes[].modelCallFailurePolicy`, rejects reusable lane artifacts without passing policy evidence, and emits aggregate `model-call-failure-policy`; `preflight-continuity-matrix-full-certification.mjs --strict` consumes that durable lane evidence before considering raw smoke diagnostics. The synthetic test proves a full 52-turn five-lane artifact can pass, fallback-handled failed calls can remain pass-level details when redacted per-call evidence is complete, `fail-closed`/`fail-retryable` or unknown-role failures block release, count-only failed-call evidence fails, and missing lane-owned policy evidence fails even when raw smoke artifacts could be reconstructed. Against the latest bounded `ashes-factual-director` artifact, strict preflight is expected to reject it as non-certification because it is single-lane, turn-limited, below the 52/53 artifact budget, and its older retained failed-call records omit request hashes even though sidecar, timing, story-quality, and factual-grounding regressions are green. Future smoke artifacts now preserve redacted request/fallback fields in retained model-call records so the next live proof can classify fallback-handled failures without nested runtime-state inference.
- REPAIR production ownership now has a concrete boundary slice. `repair-runtime.mjs` records compact REPAIR decisions, REPAIR-computed `legacyProjection`, CORE-first source-mutation recovery cases, diagnostic-only `sourceVisibilityMutation` observations for extension-driven visibility changes, compact source-reobserve decisions for dependent/stale/latest-boundary source rows, source-mutation rollback actuation authorization, response-recovery policy for host-native unavailable/failed observations, response-reobserve closure authorization for host-native failed/unavailable rows, and `hostNativeContinuityContradiction` policy for synchronous and delayed contradictory host-native assistant rows; CORE projections expose `repairDecision`; `state-delta-gateway.mjs` now preserves compact `coreRecovery`/`coreRecoveryError` refs on initial response records and compact source-restart refs on ingress records; `chat-turn-orchestrator.mjs` now consumes `restartLatestSource` to create a distinct latest/no-outcome replacement ingress/source Frame/CORE transaction, calls `supersedeLatestSourceTransaction(...)`, marks the old ingress `restartSuperseded`, and resolves the old recovery as `latest-source-reobserved`; CORE Store persists `latestSourceRestarted`, rehydrates the old/new link from event segments, excludes the superseded prior transaction from active heads, blocks generic `recoveryRequired -> visibleResponsePosted`, and permits only REPAIR-authorized host-native response reobserve closure; and `response-dispatcher.mjs` redacts synchronous host-continuation observed-message text into ids, flags, length, and hash, resolves old failed/unavailable response/recovery projections after authorized delayed reobserve, and now runs contradiction review after delayed callback/manual reobserve before allowing a host-native completion to stand. `test-repair-runtime.mjs` covers the non-synthetic boundary, source reobserve policy, latest-boundary `restartLatestSource` eligibility, dependent latest blocking, idempotency, visibility-only diagnostics, summarized-only rows, delete precedence, response edits, rollback-with-revision versus no-revision behavior, rollback actuation authorization, response recovery policies, no-core fallback, missing writer failure, and raw-text redaction; `test-message-recovery.mjs` proves old projection status/action follows REPAIR's returned `legacyProjection`, source-mutation rollback restore is gated by `directive.repairRollbackActuationDecision.v1`, and visibility-only observations do not mutate ingress status, recovery journals, prompt revisions, or saves; `test-response-dispatcher-core-bridge.mjs` proves host-native completion, unavailable, failed/retry, delayed failed/unavailable reobserve closure, synchronous contradiction, async callback contradiction, and manual reobserve contradiction recovery paths write CORE recovery before old projections and do not persist raw host assistant text in CORE/response ledgers; `test-sillytavern-runtime-lifecycle.mjs` and `test-sillytavern-event-wiring.mjs` prove `MESSAGE_UPDATED` is wired to visibility observation rather than duplicate edit recovery; `test-chat-turn-orchestrator.mjs` proves the Sam Vickers dependent-edit guard consumes REPAIR's source-reobserve decision, latest/no-outcome restart actuation gets a fresh CORE identity plus one CORE supersede call, and duplicate restart observation is idempotent; `test-core-store-v2.mjs` proves the persisted/hydrated `latestSourceRestarted` projections plus authorized response-reobserve recovery resolution; and `test-chat-native-runtime-flow.mjs` proves fake-host runtime paths for committed player-source edits plus committed Directive response edits/deletes before old projections become the UI/runtime bridge. This is still not full REPAIR/SRE ownership: generic committed response retry/reobserve actuation, broader rollback execution ownership, and final independent SRE worker ownership remain open.

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

For rich prepared fixture users, `.lanes[].externalContextGenerationProof.richFixturePressure.status` must be `pass`. The details should show compact target evidence for ST Lorebooks/World Info, Memory Books, Summaryception, VectFox, `finalHostPromptMayIncludeExternal`, and redaction reasons without raw prompt bodies or external generated content.

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

The proof producer must validate more than those top-level fields. Edit/delete scenarios should include target host id, source role, ingress/response/transaction refs where available, mutation kind, original/replacement text hashes, native host-control evidence, expected and observed recovery type, ledger status after mutation, CORE recovery status, compact REPAIR decision kind, prompt-context advancement, and recovery-journal delta without raw replacement text. Selected-swipe evidence should include selected host assistant source id, selected swipe index, swipe count, source-integrity status, selected-hash equality with the accepted assistant variant, absence of discarded-swipe canaries from committed state, prompt-context advancement, and persisted-save verification. Shallow scenario shells are acceptable only as release-bundle summary inputs after the strict producer has already validated the child reports.

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
