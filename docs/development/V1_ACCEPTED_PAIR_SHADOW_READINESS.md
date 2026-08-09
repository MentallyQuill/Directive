# V1 Accepted-Pair Shadow Readiness

## Decision

The accepted-pair interpretation path is ready to remain enabled as an additive shadow for the exact V1-native Ashes Prelude definition.

It is not ready to replace legacy semantic writers, feed the narrator prompt, drive player-facing projections, or certify V1 gameplay. Those cutovers remain intentionally blocked.

No player-facing UI was changed by this slice.

## Implemented Boundary

The runtime now executes this path when the player sends a message after an assistant response:

```text
accepted selected assistant swipe + current player message
    -> one shared source snapshot
    -> eligible authored evidence-policy candidates
    -> bounded Utility interpretation
    -> untrusted typed claim proposal
    -> deterministic source/policy/precondition validation
    -> deterministic mission reduction
    -> one open Story Settlement episode or compact insignificant receipt
    -> one State Delta Gateway transaction over mission.v1 + storySettlement
```

The shadow settlement runs after CORE ingress observation and the legacy Scene Handshake, and before normal turn classification. It consumes the same selected-swipe snapshot as the legacy settlement path. Its failure is sanitized and does not authorize narration, mission success, or a legacy-state mutation.

Activation is deliberately narrow:

- the active campaign package must match the exact Ashes package ID and version;
- the active mission must resolve the exact package-owned V1 definition ID or its pinned legacy source ID;
- the save and chat binding must match the snapshot envelope;
- non-Ashes teaser campaigns have no V1 mission definition and cannot enter this path.

The shadow writes only `mission.v1` and `storySettlement`. Existing mission fields, ship records, relationships, quests, threads, Command Log, and Command Bearing remain unchanged.

## What Is Proven

### Freeform interpretation seam

- The model sees only currently eligible authored policy candidates, not an open-ended state-writing schema.
- Structured output may select a candidate, source slot, and allowed value or abstain.
- Unknown candidates, malformed output, unauthorized source roles, invalid values, and unsupported claims fail closed.
- Assistant acceptance distinguishes accepted, corrected/rejected, and ambiguous source custody.
- Code—not the model—owns predicates, objectives, clocks, terminal disposition, and transition packets.

### Accepted-source custody

- The previous assistant contribution is bound to the selected swipe ID and text hash.
- The current player contribution is bound to its host message ID and text hash.
- Branch, chat, save, campaign, package, mission, and revision mismatches fail closed.
- The assistant cannot establish world truth or authoritative time; the player cannot self-certify outcomes.
- A replay cannot duplicate an already settled source pair.

### Low-noise Story Settlement

- Multiple meaningful accepted pairs accumulate into one open semantic episode.
- A meaningful exchange may create several typed effects without creating several player trackers.
- An insignificant exchange creates a compact internal receipt only when no episode is active.
- Insignificant exchanges during an active episode do not create new story entries or writes.
- Full transcript prose is not copied into Story Settlement or diagnostics.
- Effect identity includes its accepted contribution identity, so a restored source epoch cannot collide with invalidated history.

### Source mutation and reconstruction

- Message edits, deletions, and selected-swipe changes invoke V1 invalidation after the existing CORE/REPAIR mutation path.
- Exact host-message identity resolves exact V1 contributions; text similarity and legacy settlement IDs are not used.
- Mission state rebuilds from surviving accepted evidence without another model call.
- Replay preserves accepted-batch chronology, including multiple surviving updates to the same outcome.
- Active episodes remove only dependent contributions and effects while retaining unrelated surviving effects.
- Repeated and unrelated mutations are no-ops.
- Restoring identical source text creates a new `.rN` acceptance epoch, scene/effect identity, and auditable invalidation cycle.
- A mixed assistant/player pair can restore one invalidated source without the still-valid source falsely blocking settlement.
- Serialize/load restart and two-save isolation fixtures preserve custody.
- Older shadow roots without required source-message provenance or evidence chronology fail with an explicit migration reason instead of guessing.

### Failure containment

- Provider timeout, invalid JSON, interpretation rejection, stale revision, package drift, source mismatch, and callback failure return bounded reason codes.
- Returned diagnostics contain IDs, counts, hashes, provider/model labels, and latency only; raw prose and thrown error text are excluded.
- Shadow failure cannot block the already authorized legacy path.
- State commits use one compare-and-swap gateway write across the two V1 roots.

## Robustness Challenge

| Risk | Current evidence | Residual risk and required mitigation |
|---|---|---|
| Paraphrase recall | Candidate guidance and structured interpreter contracts accept model-selected authored IDs | No live corpus proves recall across player voices, indirect prose, or long scenes. Run adversarial transcript fixtures and live multi-user rehearsal before cutover. |
| False positives | Evidence standards, exclusions, source roles, preconditions, and deterministic allowlists constrain claims | A model can still over-read weak prose when a policy is authored too broadly. Measure precision by policy and tighten campaign guidance rather than adding phrase rules. |
| Negation and attempts versus results | Intent, decision, event, disclosure, world fact, and observed outcome are separate claim types | Current deterministic tests supply structured selections; they do not prove the live model handles negation, hypotheticals, failed attempts, or quoted speech. Add prose fixtures and abstention thresholds. |
| Source-slot custody | Every selected claim is materialized against `previousAssistant` or `currentPlayer`, then revalidated | Host event timing and unusual SillyTavern extensions still require live proof. Keep one shared snapshot and reject any post-analysis source drift. |
| Correction and rejection | Corrected or ambiguous assistant prose cannot supply assistant evidence; player evidence remains independently eligible | Live correction phrasing may be ambiguous. Favor abstention and a later accepted exchange over heuristic merging. |
| Double-model latency | The V1 call is bounded to no more than the existing blocking budget and fails soft | It currently runs sequentially after the legacy settlement, so shadow mode adds a second semantic read. Capture real p50/p95 latency; remove the legacy call only through the cutover registry after parity. |
| Stale async analysis | Snapshot custody, mission revision, and State Delta Gateway compare-and-swap reject stale work | Rapid edits can waste a model call. Do not retry automatically against changed prose; let the next accepted pair produce a fresh snapshot. |
| Episode accumulation | Multi-exchange tests keep one open episode and suppress insignificant writes | Soft scene boundaries, long-scene checkpoints, and significance-based sealing are not implemented. Without them an episode can remain open too long. |
| No-change volume | No-effect interpretation does not create a player record, and active-episode chatter is no-write | The Utility model is still called for each eligible accepted pair. Measure abstention/no-effect rate before adding batching or candidate short-circuits. |
| Restart and branches | Serialized restart and separate-save fixtures reconstruct without a model and do not cross branches | Real SillyTavern Save As, chat switching, storage hydration, and long-history branch ancestry remain live-test obligations. |
| Source mutation | Edit/delete/swipe, restored epochs, mixed-source pairs, repeated invalidation, and post-REPAIR ordering are covered | A sealed episode is marked stale, but deterministic replacement/supersession from survivors is not yet implemented. This blocks prompt/UI cutover. |
| Hidden-information leaks | Player projection contracts omit hidden state; shadow results do not enter UI or prompt; diagnostics are sanitized | The actual narrator has not consumed the V1 projection. Prompt integration needs hidden-canary tests before any live use. |
| Legacy/V1 divergence | Shadow diagnostics can record status divergence while legacy roots remain untouched | This is not semantic parity. Add per-policy/mission comparison artifacts and inspect disagreements; do not make legacy output the truth oracle. |
| Campaign-definition quality | Prelude/Hesperus has reviewed policies, fairness predicates, outcome dimensions, and scenario fixtures | Deterministic code cannot repair an over-permissive policy, dead-end predicate, unfair deadline, or missing crew reveal route. Lint and scenario-review every migrated mission. |
| Shadow-state migration | Missing chronology/provenance fails explicitly | No migration utility exists because this state has not shipped as V1 authority. Before release, either reset pre-authority shadow roots or provide one explicit versioned migration. |

## Verification Evidence

The following 19 focused suites passed directly on 2026-08-09:

- Story Settlement contracts and lifecycle;
- mission definition, predicate, evidence, and reducer contracts;
- interpretation candidates and accepted-pair interpreter;
- Duty Report planner and player-safe mission projection;
- mission package linter and canonical Ashes Prelude validator;
- V1 state spine, runtime adapter, orchestrator, and source-mutation runtime;
- runtime package library loading;
- Ashes migration inventory and 12-scenario Prelude/Hesperus matrix.

The complete repository alpha gate then passed all **253 checks** in **192 seconds**. It includes existing CORE/REPAIR, SillyTavern message-action, runtime-flow, persistence, schema, package, scale, and UI regression suites.

An independent code review identified two correctness defects before commit:

1. survivor replay originally lost accepted-batch chronology and could reverse an unrelated later outcome;
2. a pre-provenance insignificant receipt could silently no-op and leave a restored source permanently deduplicated.

Both now have regressions. Chronology is durable, and incompatible shadow roots require explicit migration. The same challenge pass also replaced whole-open-episode invalidation with contribution-level rollback.

Deterministic test success is baseline evidence only. It is not a substitute for live-provider interpretation quality or the required SillyTavern rehearsal/certification runs.

## Cutover Prerequisites

Player-facing or prompt-authority cutover remains blocked until all of the following exist:

1. **Soft boundaries and checkpoints:** bounded significance evaluation, long-scene checkpointing, hard-boundary handling, and deterministic sealing.
2. **Sealed supersession:** stale sealed episodes are excluded and a survivor-backed replacement explicitly supersedes them when safe; otherwise the state becomes `recoveryRequired`.
3. **Aggregate projections:** one concise ship aggregate and concise people/relationship projections derive from accepted Story Settlement effects. They must not recreate per-mention ledgers.
4. **Duty Report delivery:** narration, scheduling, capable-crew fallback, delivery acknowledgement, deduplication, and accepted-source settlement prove what the player actually learned.
5. **Prompt consumption:** the narrator receives a compact, player-safe/current-authority V1 projection with hidden-canary, stale-source, and budget tests.
6. **Mission transitions:** the terminal transition packet activates exactly one valid next V1 mission and remains idempotent across narration failure, reload, and source reconstruction.
7. **Cutover registry:** an explicit exact-scope registry enables V1 authority and disables legacy semantic writers only for the matching package/definition/version. No broad campaign-name switch is acceptable.
8. **Parity evidence:** shadow comparison records policy-level agreements, disagreements, abstentions, latency, and no-effect volume without treating legacy tracking spam as desired parity.
9. **Player-facing rendering:** Mission, Campaign, People, and Ship consume only their approved concise projections. This is the explicit UI approval gate; no renderer change is authorized by this report.
10. **Live-host rehearsal:** use isolated Directive soak profiles—not `default-user`—for provider behavior, accepted swipes, edits, deletion, Save As, restart, chat isolation, latency, hidden leaks, and forensic artifact review.
11. **Ashes completion:** migrate and scenario-certify the remaining Ashes missions and campaign transitions. Prelude/Hesperus alone does not make Ashes a complete V1-native campaign.

Non-Ashes campaigns remain image-and-name teasers, greyed and unselectable, and do not block the Ashes V1 cutover.

## Next Architectural Slice

The next implementation plan should combine boundary/sealed-supersession mechanics with projection inputs before any UI work. That order allows Directive to prove that one durable Story Settlement can produce stable high-value ship and people aggregates, Duty Reports, and narrator context without reviving parallel trackers.

The implementation may continue through contracts, reducers, data, runtime wiring, prompt packets, cutover scaffolding, and isolated live diagnostics under the standing approval. It must stop before an actual player-facing renderer, layout, label, or interaction change and request the UI approval gate.
