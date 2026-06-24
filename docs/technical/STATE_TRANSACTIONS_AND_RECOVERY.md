# State Transactions And Recovery

This document explains Directive's tracked state, save model, turn ledger, sidecar application, and recovery rules.

## Plain-Language Model

Directive treats campaign state like an aircraft flight recorder. Every important operation should leave enough trace to answer:

- what did the player send?
- what did Directive decide?
- what structured outcome was committed?
- what response was posted?
- what failed?
- which save revision can recover the campaign?

The user-facing version of this contract is [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md).

## Authoritative Stores

| Store | Meaning |
| --- | --- |
| Package records | Reusable campaign templates. |
| Draft records | Character Creator work before campaign state exists. |
| Save index | List of saves, autosaves, branches, and current save references. |
| Save records | Full campaign state snapshots. |
| Host settings | Preferences, provider config without secrets, pointers, lightweight diagnostics. |

## Campaign Runtime Tracking

`runtimeTracking` contains the operational ledger around the campaign state:

- `revision`;
- `history`;
- `ingressLedger`;
- `responseLedger`;
- `recoveryJournal`;
- `sidecarJournal`;
- `modelCallJournal`;
- `endConditionLedger`;
- `pendingInteractions`.

```mermaid
flowchart TD
  State["Campaign state"] --> Tracking["runtimeTracking"]
  Tracking --> History["bounded snapshots"]
  Tracking --> Ingress["ingress ledger"]
  Tracking --> Response["response ledger"]
  Tracking --> Recovery["recovery journal"]
  Tracking --> Sidecars["sidecar journal"]
  Tracking --> ModelCalls["model-call journal"]
  Tracking --> Endings["end-condition ledger"]
  Tracking --> Pending["pending interactions"]
```

## Commit Rules

### Layman's View

Every state change must say which part of the campaign it is allowed to touch. If it tries to touch a different part, Directive rejects it.

### Deep View

`src/runtime/state-delta-gateway.mjs` defines mutable campaign domains and checks domain names before commit. `commitTrackedCampaignState` creates a new tracked revision and records history. `applyTrackedStatePatch` and `applyStateDeltaOperations` are used when callers need patch/operation style updates.

Director turn packets are applied by `src/campaign/transaction-state.mjs`, which updates campaign domains and appends turn-ledger and command-log records.

## Turn Ledger

The turn ledger records committed outcomes and bounded snapshots. It supports:

- no reroll on narration swipe;
- narration success/failure records;
- replacement narration against same outcome;
- edit committed outcome from retained snapshot;
- delete committed outcome by restoring pre-outcome snapshot;
- branch-safe save behavior.

## End-Condition Ledger

`runtimeTracking.endConditionLedger` records terminal detections and their resolution state. It contains:

- detections;
- pending or resolved terminal decisions;
- continuation frames selected through `Push On`;
- terminal timeline branch records.

Terminal detection happens after mechanics commit, so the terminal consequence is a committed timeline fact until the operator resolves the checkpoint. Replay restores the retained checkpoint snapshot. If the direct turn-ledger snapshot is unavailable, the runtime falls back to runtime history snapshots tied to the outcome id, then pre-last-stable and latest retained snapshots. `Push On`, `Keep This Ending`, and terminal branch saves are ordinary tracked state transactions.

## Narration Recovery

Narration happens after mechanics commit. If narration fails:

1. the outcome remains committed;
2. Directive records pending narration recovery;
3. retry uses the same outcome id and narrator packet;
4. the save remains consistent.

This prevents provider failure from becoming a hidden mechanics reroll.

## Message Edit And Delete

Message edits and deletes flow through the message reconciler. A safe, dependent-free change can roll back to a retained snapshot. A change with dependent committed turns becomes review-required instead of silently corrupting continuity.

Recovery and save-guard renders:

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-mission-narration-recovery.png" alt="Mission narration recovery state">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-records-save-guard-blocked.png" alt="Active-chat save guard blocked">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-records-branch-ready.png" alt="Save branch ready state">
</p>

<!-- directive-render id="docs-directive-edit-delete-recovery" status="needed" source="fixture" asset="assets/documentation/renders/docs-directive-edit-delete-recovery.png" tracking="../testing/DOCUMENTATION_RENDER_TRACKING.md" -->
Render needed: edit/delete recovery and dependent-turn review.

## Manual Saves And Branches

Manual saves are chat-affine. Save Game and Save Game As are available only when the active host chat matches the loaded campaign save binding.

Save Game overwrites the active save. Save Game As creates a named branch with parent/divergence metadata and updates the active binding to the new save branch.

Records also supports load and delete without requiring the selected save's chat to be active.

Terminal timeline branches are created from a committed terminal checkpoint. The saved branch preserves terminal metadata and rewrites the cloned `campaignChatBinding.saveId` to the branch save id, so loading the branch does not retain the source save binding.

## Sidecar Application

Sidecars submit operation proposals with:

- worker id;
- base revision;
- operations;
- allowed roots;
- summary/reason.

The state gateway rejects stale base revisions and unauthorized roots. Accepted operations commit a new revision, journal the result, persist, and rebuild prompt context.

## Reusable Extension Pattern

1. Keep state templates separate from playthrough saves.
2. Use monotonic revisions.
3. Record snapshots before consequential commits.
4. Track ingress and response separately.
5. Make sidecars proposal-only.
6. Make manual save guard check the host identity that actually owns the save.
7. Store enough diagnostics to recover without leaking hidden content.
