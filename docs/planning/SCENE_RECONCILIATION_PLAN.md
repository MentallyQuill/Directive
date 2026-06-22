# Scene Reconciliation Plan

## Status

Planned pre-alpha feature.

User-facing feature name:

```text
Scene Reconciliation
```

Primary action labels:

- `Reconcile This Message`
- `Set Reconciliation Start`
- `Set Reconciliation End`
- `Reconcile From Here`
- `Recalculate From Here`
- `Open Pending Reconciliation`

`Scene Reconciliation` is the feature family. `Reconcile From Here` is the routine scan-and-patch action for the passage from the selected message through the latest message. `Recalculate From Here` is the rarer replay action for mechanics-heavy divergence.

## Purpose

Directive saves structured campaign state. SillyTavern saves the chat transcript. Those two records can diverge when the player edits, reswipes, deletes, rewrites, or branches prior chat messages.

That divergence is not always an error. SillyTavern gives the player retcon freedom, and Directive should support that freedom instead of trying to prevent it. The goal is to give the player tools to tell Directive:

```text
Treat this changed passage as the story now. Update Directive's structured state where needed.
```

Scene Reconciliation turns a selected chat passage into reviewable structured changes. It does not silently rewrite campaign state, does not scan the entire transcript by default, and does not pretend that chat prose and Directive state can always be perfectly synchronized.

## Core Product Decision

SillyTavern chat is narrative evidence. Directive campaign state is authoritative mechanics state.

When the player changes past chat, Directive should not automatically infer that every downstream state record must change. Instead:

- the player chooses a message, scene, or outcome boundary;
- Directive scans that bounded passage;
- the Mission Director and authorized sidecar workers produce proposed changes;
- safe proposals apply through the existing state-delta gateway;
- consequential, conflicting, stale, or low-confidence proposals go to a review queue;
- stale or conflicting proposals remain visible until the player rejects, reruns, or accepts a deliberate recalculation.

This is closer to Saga's `Scan Story Lore` pattern than to a full turn replay. Saga scans chat ranges into reviewable Pending Review entries with chunking, message hashes, duplicate routing, and accept/reject gates. Directive should adapt that architecture for campaign state reconciliation instead of lorecard creation.

## Tooltip Contract

`Reconcile From Here` and `Recalculate From Here` must always explain their difference in hover text. The labels are intentionally parallel, so the tooltips carry the safety distinction.

Recommended tooltips:

| Control | Tooltip |
|---|---|
| `Reconcile This Message` | `Scan this message for Directive state changes. Safe updates may apply automatically; consequential changes need review. Does not replay later outcomes.` |
| `Set Reconciliation Start` | `Mark this message as the start of a passage to reconcile.` |
| `Set Reconciliation End` | `Mark this message as the end of a passage to reconcile.` |
| `Reconcile From Here` | `Scan from this message through the latest chat and reconcile Directive state to the changed passage. Does not rerun Mission Director outcomes.` |
| `Recalculate From Here` | `Preview a replay from this point's pre-outcome snapshot. May replace or drop later outcomes, logs, sidecars, and state changes.` |
| `Open Pending Reconciliation` | `Review consequential or conflicting reconciliation items that were not applied automatically.` |

Shorter mobile labels may be used only if the same distinction remains available through the control's accessible label or detail sheet.

## Design Inputs

Primary Directive inputs:

- [Turn Transactions](../architecture/TURN_TRANSACTIONS.md)
- [Chat-Native Runtime](../architecture/CHAT_NATIVE_RUNTIME.md)
- [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md)
- [Mission Director Contracts](../architecture/MISSION_DIRECTOR_CONTRACTS.md)
- [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)
- [Directive Assist](../design/DIRECTIVE_ASSIST.md)
- [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md)

Saga reference patterns:

- `Scan Story Lore`: bounded chat scan, chunk hashes, skip-unchanged behavior, candidate operations, duplicate routing, and Pending Review.
- `Continuity Scan`: compact live-state extraction with chunk/reducer shape.
- `Loredeck Creator`: durable staged jobs, checkpoints, partial success preservation, retry, and review gates.

Directive should reuse the ideas, not the lorecard domain model.

## Terms

**Anchor**: a stable reference to a host chat message or message range. It should include host, chat id, message id when available, ordinal fallback, text hash, and neighbor hashes.

**Anchor range**: the passage selected for reconciliation. It has a start anchor, end anchor, message count, and range hash.

**Reconciliation run**: a durable job record for one scan or recalculation request.

**Observation**: a model or deterministic extraction from chat prose. Observations are evidence, not state mutations.

**Proposal**: a validated, reviewable state change derived from observations.

**Pending Reconciliation**: the review queue for proposals that have not been accepted or rejected.

**Applied Reconciliation**: an accepted proposal that successfully passed the state-delta gateway.

**Stale proposal**: a pending proposal whose base campaign revision, save id, chat id, outcome reference, or anchor range hash no longer matches the current context.

## User Workflows

### Reconcile This Message

Use when a single edited, deleted, reswiped, or suspicious message may change Directive state.

Expected entry points:

- Directive Assist menu near the chat input.
- A selected-message action when the host exposes selection or message context.
- A Mission or Log row action for tracked ingress/outcome records.

Flow:

1. Resolve the selected message into an anchor range.
2. Build a compact packet containing current campaign state, relevant turn ledger entries, visible Command Log context, and existing pending reconciliation items.
3. Ask the appropriate worker to extract state-relevant observations.
4. Normalize observations into one or more proposals.
5. Auto-apply safe proposals.
6. Place consequential, conflicting, stale, or low-confidence proposals in Pending Reconciliation.
7. Let the player accept, reject, edit, or rerun reviewed proposals.

Typical model-call budget: one Utility or Reasoning call, plus no reducer unless the message contains multiple domains.

### Reconcile From Here

Use when the player has retconned a short passage, branched from an earlier beat, or revised several messages and wants Directive to reconcile from a selected message through the latest chat.

Expected entry points:

- Message action: `Reconcile From Here`.
- Directive Assist action only when a start marker already exists or the user explicitly asks to reconcile the marked passage.
- Command tab action near `Open Campaign Chat`, `Save`, and `Save As` only when it opens the same marked-passage workflow.
- Log action for a visible range of recent tracked turns.

Flow:

1. Resolve the selected message through latest chat, marked range, or Log-provided interval.
2. Create a reconciliation run with `campaignId`, `saveId`, `chatId`, anchor range, base revision, and affected turn/outcome ids.
3. Build a scan plan:
   - small spans use one extractor call;
   - larger spans split into chunks with overlap;
   - unchanged chunks are skipped when their range hash matches a completed prior run.
4. Extract observations from each chunk.
5. Reduce observations by domain:
   - mission and phase state;
   - ship status;
   - crew and relationship state;
   - Command Bearing and command consequences;
   - pressure/front/open-order state;
   - Command Log corrections;
   - side-mission hooks.
6. Route duplicate, conflicting, or superseding proposals against current state and pending proposals.
7. Auto-apply safe proposals and append consequential, conflicting, stale, or low-confidence proposals to Pending Reconciliation.

Typical model-call budget:

- small passage: one call;
- normal scene: two to six calls depending on chunk count and reducers;
- large backfill: bounded batch job with progress, checkpoints, and an explicit continuation affordance.

### Recalculate From Here

Use when the player wants Directive to rerun mechanics from a historical outcome boundary rather than merely reconcile state to changed prose.

This is not the normal retcon tool. It can call the Mission Director once per consequential player message in the replay window, so it needs strict limits.

Flow:

1. Select a committed outcome or tracked player message.
2. Locate the pre-outcome snapshot from the turn ledger.
3. Restore a scratch state, not the live campaign state.
4. Read player-authored messages after the anchor.
5. Rerun consequential turns in order until a stop condition.
6. Present a preview:
   - replacement outcome list;
   - state delta summary;
   - Command Log changes;
   - sidecar invalidations;
   - dropped dependent outcomes;
   - narration that would need rewrite or repost.
7. Apply only after explicit player acceptance.

Stop conditions:

- replay turn budget reached;
- missing pre-outcome snapshot;
- changed passage cannot be mapped to tracked ingress;
- major ambiguity in player intent;
- proposed state delta crosses forbidden domains;
- hidden state would be exposed in the preview;
- provider failure;
- dependent outcomes would be dropped beyond the player's selected range.

Typical model-call budget: one Director pass per consequential player message within the replay window, plus optional sidecar reruns after acceptance. The default budget should be small.

## Proposal Operations

Scene Reconciliation should use explicit operations so review rows are understandable and validators can stay strict.

Recommended operations:

| Operation | Meaning |
|---|---|
| `create` | Add a new state record, thread, open order, log correction, or visible fact. |
| `update` | Change a known state record without replacing its identity. |
| `merge` | Add details to an existing record. |
| `supersede` | Mark an older state as no longer current and replace it with a newer state. |
| `conflict` | The changed passage contradicts current state and needs player judgment. |
| `noop` | The passage has no Directive state impact. |

All proposals must declare:

- domain;
- target path or target id;
- base revision;
- source anchors;
- evidence message refs;
- player-safe summary;
- hidden-state handling policy;
- allowed state-delta operations;
- confidence and reason;
- stale-check inputs.

## Data Shape

The exact schema can be refined during implementation, but the campaign state needs a durable reconciliation ledger under `runtimeTracking`. Accepted campaign fact changes still pass through the state-delta gateway as ordinary domain writes; reconciliation runs, markers, pending rows, and applied records remain audit metadata.

```json
{
  "runtimeTracking": {
    "sceneReconciliation": {
      "markers": {
        "start": {
          "hostMessageId": "12",
          "chatId": "host_chat_...",
          "index": 12,
          "textHash": "hash_...",
          "textPreview": "visible passage"
        },
        "end": null
      },
      "runs": [
        {
          "id": "recon-run-...",
          "action": "message|scene|recalculate",
          "status": "running|completed|completedWithErrors|failed|cancelled",
          "anchorRange": {
            "start": "anchor",
            "end": "anchor",
            "rangeHash": "hash_...",
            "messageCount": 8
          },
          "startedAt": "2026-06-22T00:00:00.000Z",
          "completedAt": null
        }
      ],
      "pending": [
        {
          "id": "recon-proposal-...",
          "runId": "recon-run-...",
          "allowedRoots": ["mission"],
          "baseRevision": 42,
          "summary": "The revised passage places the away team at the cargo bay before medical triage.",
          "confidence": 0.78,
          "reviewReason": "consequential",
          "status": "pending"
        }
      ],
      "applied": [
        {
          "id": "recon-proposal-...",
          "runId": "recon-run-...",
          "appliedRevision": 43,
          "appliedAt": "2026-06-22T00:00:00.000Z"
        }
      ],
      "lastResult": null
    }
  }
}
```

Implementation should keep hidden state out of player-facing proposal summaries. Hidden writes are allowed only when the worker and domain validator are authorized for that state root.

## Anchor Contract

Every reconciliation run needs anchors that survive ordinary SillyTavern behavior as well as possible.

Anchor identity should prefer:

1. host message id;
2. Directive ingress id;
3. turn id or outcome id;
4. ordinal index;
5. text hash;
6. previous and next message hashes.

An anchor range hash should include:

- host id;
- chat id;
- message ids or ordinals;
- normalized message text hashes;
- role/name labels;
- range length.

Anchor drift should not crash the feature. It should produce a clear stale state:

```text
This reconciliation was created for an older version of the passage. Rerun it before applying.
```

## Sidecar And Mission Director Contract

Current sidecars already propose changes against a base revision and allowed state roots. Scene Reconciliation should extend that source contract with anchor awareness.

Recommended source fields:

```json
{
  "campaignId": "campaign_...",
  "saveId": "save_...",
  "chatId": "host_chat_...",
  "baseRevision": 42,
  "runId": "recon_...",
  "anchorRangeId": "range_...",
  "anchorRangeHash": "hash_...",
  "turnIds": ["turn_..."],
  "outcomeIds": ["outcome_..."],
  "workerType": "mission|crew|ship|relationship|command_bearing|side_mission|command_log"
}
```

A proposal is stale if any of these are true:

- campaign id changed;
- save id changed;
- chat id changed;
- base revision no longer matches and the proposal is not explicitly rebased;
- anchor range hash changed;
- target outcome was deleted, replaced, or superseded;
- target domain validator no longer allows the proposed write.

The Mission Director should be involved in two ways:

- as a reconciliation worker for mission/phase/outcome proposals;
- as the replay engine for `Recalculate From Here`.

Routine scene reconciliation should not call the Director once per downstream turn. It should extract the changed passage, auto-apply safe proposals, and reserve player review for consequential, conflicting, stale, or low-confidence changes.

## Review UI

Pending Reconciliation should feel like Saga's Pending Review, but with Directive state language.

Safe reconciliation should not create a large manual checklist. The default completion summary should collapse auto-applied changes:

```text
Scene reconciled.
7 safe updates applied.
2 items need review.
```

Each row should show:

- operation;
- domain;
- source passage or evidence message refs;
- player-safe summary;
- destination preview;
- confidence or caution state;
- stale/conflict markers;
- `Apply`, `Reject`, and `Rerun` actions.

Bulk actions should exist only after the individual row contract is clear. Early pre-alpha should start with individual apply/reject for consequential rows to avoid accidental state rewrites.

The player should never see raw hidden values, raw relationship scores, hidden truth ids, Director-only package facts, or unrevealed side-mission truth. Player-facing summaries must use qualitative, visible language.

## Save And Branch Behavior

`Save` and `Save As` remain Directive campaign-state operations. SillyTavern chat saving remains host-owned.

Scene Reconciliation makes the split safer by giving the player a deliberate way to align Directive state after chat changes.

Rules:

- reconciliation runs are scoped to `campaignId`, `saveId`, and `chatId`;
- pending proposals should not automatically carry across `Save As` unless the new branch explicitly inherits the same chat binding and anchor range;
- loading a different save marks pending proposals stale unless their save id and base revision are still valid;
- accepting a proposal after `Save As` should write to the active branch only;
- branch metadata should record the divergence outcome or anchor when available.

Open implementation issue:

- `Save As` should verify whether the active chat binding now points at the new save id. If it does not, Directive should either rebind the active chat metadata or clearly show that the branch save and chat transcript are separate records.

## Implementation Stages

### Stage 1: Contract And Anchors

- Add anchor range utilities.
- Add range hashing and stale checks.
- Add reconciliation run/proposal schema helpers.
- Add fixture coverage for message id, ordinal fallback, text hash, and neighbor-hash drift.

### Stage 2: Pending Reconciliation Store

- Add `runtimeTracking.sceneReconciliation` ledger fields for markers, runs, pending proposals, and applied proposals.
- Add persistence helpers.
- Add state-delta gateway hooks for applying accepted proposals.
- Add stale rejection when base revision, save id, chat id, or anchor hash no longer matches.

### Stage 3: Reconcile This Message

- Add a message action and optional Directive Assist entry.
- Build the extractor packet.
- Normalize observations into proposal rows.
- Auto-apply safe proposals and add a compact review surface for consequential apply/reject.
- Test single-message retcon and no-impact message paths.

### Stage 4: Reconcile From Here

- Add range selection and scan-plan creation.
- Add Saga-inspired chunking, overlap, chunk hashes, retry, and skip-unchanged behavior.
- Add domain reducers and duplicate/conflict routing.
- Add progress and partial-success handling.
- Test normal scene, changed chunk only, partial provider failure, duplicate proposal, and stale pending proposal.

### Stage 5: Sidecar Anchoring

- Extend sidecar source metadata with anchor ranges.
- Mark sidecar results stale when their source passage changes.
- Add rerun actions for stale sidecars.
- Ensure accepted sidecars still pass allowed-root validation.

### Stage 6: Recalculate From Here

- Add scratch-state replay from `snapshotBefore`.
- Add replay turn budget and stop conditions.
- Preview replacement outcomes without mutating live state.
- Accept replacement into a branch-aware transaction.
- Mark dependent sidecars, Command Log summaries, and prompt packets stale or regenerated.

### Stage 7: Verification And UX Polish

- Add fake-host edit/branch fixtures.
- Add provider-failure fixtures.
- Add alpha-gate coverage for no hidden-state leakage.
- Add UI regression checks for Pending Reconciliation labels and stale/conflict states.
- Add tooltip regression checks that distinguish `Reconcile From Here` from `Recalculate From Here`.
- Update user docs only after the runtime feature exists.

## Testing Strategy

Unit coverage:

- anchor range normalization;
- range hash stability;
- stale checks;
- proposal operation validation;
- hidden-state redaction;
- allowed-root enforcement;
- duplicate/conflict routing;
- Save As branch scoping.

Integration coverage:

- edited single message auto-applies safe changes or creates a pending proposal when consequential;
- changed scene auto-applies safe changes and creates grouped review items for consequential domains;
- unchanged chunk is skipped;
- accepted proposal applies through the state-delta gateway;
- stale proposal cannot apply;
- rejected proposal remains journaled;
- recalculation preview does not mutate live campaign state;
- accepting recalculation drops or invalidates dependent outcomes deliberately.

Host smoke coverage:

- SillyTavern message edit path;
- SillyTavern branch or Save As path;
- message action path;
- Directive Assist marked-passage path;
- pending review surface in the drawer;
- load-save staleness behavior.

## Non-Goals

- No automatic full-transcript diff after every chat edit.
- No silent campaign-state mutation from changed prose.
- No guarantee that arbitrary rewritten prose can reconstruct every hidden mechanic.
- No raw hidden-state display in review rows.
- No automatic SillyTavern transcript rewriting.
- No legacy schema compatibility work while Directive remains pre-alpha.

## Open Questions

- What is the first MVP domain set: mission, Command Log, ship, crew, Command Bearing, pressure, or side missions?
- Should applying a Command Log correction append a correction row or rewrite the affected row?
- Should `Save As` offer to bind the active chat to the new branch immediately?
- Should a SillyTavern chat branch automatically suggest `Save As`, or should the player always initiate it from Directive?
- What replay budget should `Recalculate From Here` use by default?
- Should sidecar recalculation run immediately after an accepted reconciliation or wait for explicit `Rerun Sidecars`?

## Recommended MVP

Build the first MVP as:

1. `Reconcile This Message` as a message action.
2. Message actions for `Reconcile This Message`, `Reconcile From Here`, `Set Reconciliation Start`, `Set Reconciliation End`, and `Recalculate From Here`.
3. Directive Assist action for `Open Pending Reconciliation` and marked-passage reconciliation.
4. Safe auto-apply with a collapsed completion summary.
5. Pending Reconciliation rows with `Apply` and `Reject` for consequential or conflicting items.
6. Mission, Command Log, and ship-status proposals only.
7. Anchor range stale checks.
8. State-delta gateway application.
9. No full `Recalculate From Here` until the review-based path is reliable.

That delivers the core player value: after a retcon, the player can ask Directive to align the structured state with the changed passage without forcing a replay of the entire branch.
