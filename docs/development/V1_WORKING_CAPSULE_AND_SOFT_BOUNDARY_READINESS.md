# V1 Working Capsule and Soft-Boundary Readiness

## Decision

The bounded V1 working capsule and explicit soft-boundary review path are ready to remain enabled as additive shadow architecture for the exact V1-native Ashes Prelude definition.

This slice does not authorize automatic evaluator scheduling, narrator-prompt authority, legacy-writer retirement, or player-facing rendering. The evaluator is reachable only through an explicit runtime diagnostic method. Normal accepted-pair settlement and projection reads do not call it. No player-facing UI changed.

## Implemented Boundary

### One bounded active memory

An open Story Settlement episode owns one mutable `directive.storyWorkingCapsule.v1`:

- one replacement summary of at most 768 characters;
- one optional foreground question of at most 240 characters;
- exact accepted contribution and active effect IDs supporting those semantics;
- at most six recent accepted excerpts, each capped at 240 characters and collectively capped at 1,200 characters;
- an accepted-contribution high-water mark and last evaluated checkpoint sequence.

The capsule is active-only. It is removed when the episode seals and is never projected as a player tracker. An accepted pair with no mission effect may update the same active capsule evidence window, but it creates no receipt, issue row, relationship memory, quest, objective, or episode.

Accepted assistant prose enters custody only after a later player message proceeds from the selected swipe. Player prose can establish intent, speech, or commitment, but cannot prove its own attempted outcome. Source invalidation removes exact contribution identities and clears compromised semantics without asking a model to reconstruct prose.

### Review eligibility is not boundary evidence

A deterministic checkpoint counts newly accepted contributions. It produces one derived `directive.episodeReviewToken.v1` only when the checkpoint sequence is newer than the capsule's last evaluated sequence.

The token identifies the exact branch, episode, Story Settlement revision, and checkpoint. It does not seal an episode, create a player-visible record, or imply that a semantic boundary exists. Hard boundaries still take precedence and seal without issuing a soft-review token.

### Bounded proposal authority

The evaluator uses the existing `utilityJson` lane and receives only:

- exact branch, episode, revision, and checkpoint identity;
- the current bounded working semantics;
- capped recent accepted excerpts;
- at most 24 active player-visible typed effects;
- bounded mission, quest, participant, and location references;
- at most two current player-safe sealed summaries.

It receives no raw transcript range, hidden effect, hidden fact, evidence queue, relationship score, provider error, or unrestricted campaign state. It may return only `continue`, `seal`, or `abstain` in strict JSON with exact supplied IDs.

A soft seal requires one of five closed semantic reasons:

- foreground question resolved;
- foreground question abandoned;
- encounter departure;
- material situation shift;
- sustained context replacement.

It also requires at least one of seven closed lasting-significance criteria: material state change, consequential fact learned, commitment created or resolved, relationship turning point, future-constraining decision, lasting cost/gain/loss, or unresolved consequence.

Topic, keyword, speaker, sentiment, token count, elapsed time, atmosphere, routine acknowledgement, and a single light flicker are explicitly not boundary evidence. No memory remains a valid result.

### Transactional deterministic authority

The model proposes; deterministic code decides whether the proposal may change Story Settlement.

Before apply, code revalidates the exact mission definition and package binding, branch, episode, checkpoint, Story Settlement revision, accepted source hashes, visible effect IDs, proposal shape, and State Delta Gateway revision. A concurrent write or source edit/delete/swipe makes the proposal stale.

`continue` performs one `storySettlement` transaction that replaces the semantic capsule, clears the processed excerpt window, and advances the evaluated checkpoint. `seal` performs one `storySettlement` transaction that removes the capsule and records a durable `directive.episodeSoftBoundary.v1` audit object containing the approved reason, significance criteria, exact source/effect custody, and checkpoint.

Neither decision can mutate mission mechanics, ship, relationships, quests, Command Log, or Command Bearing. Exact replay is a no-op. A different proposal for an already consumed checkpoint fails stale. Provider failure, timeout, malformed output, unsupported IDs, abstention, or stale analysis leaves the episode open and review eligible. A rejected persistence write restores the pre-review in-memory state when no newer mutation exists. If concurrent mutation makes rollback unsafe, the runtime reports `indeterminate`, `noChange: false`, `requiresReconciliation: true`, and `retrySafe: false` instead of claiming success or a harmless no-op.

## Borrowed-Behavior Pin

The implementation preserves the already approved behavior references instead of reinterpreting them:

- Summaryception 5.5.3 at `c67626ab83ee86ec1be4f55b9b3d1d19adb79999`: compare new passage with prior memory and retain only new narrative understanding;
- VectFox 3.6.8 at `886a0144ff8608aabcef4fe1b408a13260c1a730`: delay durable extraction until sources settle, require lasting significance, and retain source-window provenance;
- CharMemory 2.3.1 at `37b21025e120acfbe1dcdeaa8becb05efe7188b4`: prefer encounter-level outcomes over play-by-play, and allow no memory.

Directive owns its contracts and runtime. These extensions are references, not runtime dependencies.

## Robustness Challenge

| Risk | Current mitigation | Remaining boundary |
|---|---|---|
| Every exchange becomes memory | One active capsule replaces prior semantics; no-effect pairs create no player record; checkpoints do not seal | Measure live no-effect and abstention rates before scheduling reviews automatically |
| A meaningful boundary is missed | Bounded accepted context and current typed effects let the Utility evaluator interpret varied prose without phrase rules | Recall across indirect prose, unusual player voices, negation, and long encounters still needs live-provider rehearsal |
| A continuous scene is split repeatedly | Closed semantic reasons plus lasting-significance criteria reject topic/speaker/time heuristics | Provider over-reading remains possible; inspect proposal precision and prefer abstention over lower thresholds |
| Summary drift invents canon | Every semantic claim cites exact accepted contribution IDs and optional current visible effect IDs; unknown IDs fail closed | Citation proves custody, not perfect interpretation; live review must sample whether summaries overstate cited prose |
| Hidden plot leaks | Hidden effects/state never enter the request, arbitrary rationale is rejected, and the capsule is not player-facing | Narrator-prompt and UI consumers require separate hidden-canary tests before cutover |
| A swipe/edit/delete lands during analysis | Request content, token, source hashes, effect IDs, Story Settlement revision, and gateway revision are all rechecked | Wasted provider work is acceptable; do not auto-retry stale prose in the same operation |
| Provider failure blocks play | Review is explicit, fail-soft, and separate from mechanics settlement and normal projection | Background scheduling needs latency/cancellation proof before entering any visible-turn lifecycle |
| Persistence fails after mutation | The gateway restores the exact pre-write state when safe; concurrent drift produces an explicit indeterminate/reconciliation-required result and forbids automatic retry | Durable-storage reconciliation still needs isolated fault-injection and live-host artifact proof |
| Replay duplicates a seal | Applied continue/seal decisions are recognized by exact checkpoint and content and return no change | Cross-version migrations must not reinterpret old review tokens; reset or explicitly migrate pre-authority shadow state |
| Another system is mutated accidentally | Gateway authority is restricted to the single `storySettlement` root and regression fixtures preserve every legacy root | Legacy semantic writers still run elsewhere until exact-scope retirement is implemented |
| The capsule grows forever | Excerpts and semantic strings are strictly capped; processed excerpts clear after successful review | If automatic reviews remain unavailable for a long session, the capsule stays bounded but may lose older nuance |
| Character chatter becomes relationship spam | This slice creates no character moments or relationship records | Character-moment extraction needs its own rare-event eligibility and precision contract; it is not inferred here |
| Package or save state crosses boundaries | Exact definition/version/package/source and branch identity fail closed before apply | Real Save As, chat switching, and persisted-host timing remain isolated live-test obligations |

## Verification Evidence

The focused certification cluster passed directly on 2026-08-09:

- Story Settlement contracts and lifecycle;
- hard- and soft-boundary contracts;
- working capsule and bounded evaluator;
- transactional soft-boundary runtime;
- sealed supersession and Story/Prompt/Ship/People/composite projections;
- projection rebuild, V1 state spine, mission runtime, accepted-pair orchestrator, and source-mutation runtime;
- runtime-app exposure through the fake Directive host.

The transactional fixture proves continue, seal, abstain, provider failure, sanitized diagnostics, concurrent gateway mutation, source invalidation after analysis, JSON restart, exact replay, no-pending no-op, and no evaluator call during ordinary projection.

Independent review found four Important failure modes before certification: excerpts could reach the evaluator before save/package preflight; a seal could recycle only old reviewed evidence; a rejected persistence write could leave consumed in-memory state; and concurrent mutation during persistence rejection could be falsely reported as a no-op. All four now have regressions. The final follow-up review reported no remaining Critical or Important findings.

The complete repository alpha gate passed all **264 checks** in **194.3 seconds** after those fixes. This includes the existing UI regressions, CORE, SRE, REPAIR, FORGE, LENS, SillyTavern host lifecycle, message mutation, persistence, schema/package, prompt-safety, and 5,000-message scale suites.

Deterministic gate success is baseline evidence only. It does not prove live-provider semantic judgment, latency, player usability, or the required isolated SillyTavern rehearsal and multi-user certification.

## Commit Ledger

- `12f8df58 feat(story): add bounded working capsule`
- `1feb6cf7 feat(story): bound soft boundary proposals`
- `3a32c9e7 feat(runtime): queue bounded episode reviews`
- `4fe6f732 feat(runtime): apply soft episode reviews`
- `1797f5ba fix(runtime): harden episode review custody`

## Residual Cutover Gates

The following work remains intentionally outside this readiness claim:

1. **Measured scheduling:** choose and prove a post-visible-response/background review trigger with cancellation, latency, batching, and source-staleness behavior. Do not add it to the blocking visible-turn path.
2. **Character-moment extraction:** define rare-event eligibility, encounter aggregation, custody, abstention, deduplication, and player visibility before any model may create a moment.
3. **Duty Report delivery:** schedule, narrate, acknowledge, deduplicate, and settle what the player actually learned, including Whitaker or capable-crew initiative.
4. **Prompt authority:** install only a compact, current, player-safe V1 context with budget, hidden-canary, stale-source, and fallback proof.
5. **Mission transition:** activate exactly one valid V1-native successor from a terminal transition packet and remain idempotent through narration failure, reload, and reconstruction.
6. **Remaining Ashes migration:** migrate and scenario-certify the rest of Ashes against the final architecture. Prelude/Hesperus alone is not a complete V1-native campaign.
7. **Legacy writer retirement:** introduce an exact package/definition/version cutover registry and remove overlapping writers only after parity evidence.
8. **Player-facing UI approval:** map the approved concise composite into the existing five pages without redundant information. No renderer, layout, label, or interaction change is authorized yet.
9. **Parity and isolated live soak:** measure evaluator precision, recall, abstention, latency, no-effect volume, mutation behavior, restart, Save As, and chat isolation in Directive soak profiles, never `default-user`.
10. **Full certification:** complete the 20-turn strict rehearsal and 25-turn five-user certification, inspect execution artifacts, and obtain operator approval.

Non-Ashes campaigns remain name-and-image teasers, greyed out and unselectable, and do not block the Ashes-only V1 release boundary.

## Next Slice

The next non-UI slice should make fair discovery operational through Duty Report delivery and player-knowledge acknowledgement. That supplies a provable bridge from crew initiative to accepted player knowledge without exposing hidden objectives, and it can be built before narrator-prompt or UI authority changes. Automatic soft-boundary scheduling should remain diagnostic until that slice and isolated provider measurements establish a safe non-blocking lifecycle point.
