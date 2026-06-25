# Scene Handshake Protocol

## Purpose

The Scene Handshake Protocol is Directive's design for turning accepted host-generated chat prose into structured campaign state.

Directive already observes player posts, classifies intent, commits consequential outcomes, updates prompt context, and renders Mission, Crew, Ship, Log, and Settings from authoritative campaign state. The missing boundary is host-generated assistant prose that introduces durable player-visible facts, assignments, obligations, readiness changes, or command history without going through a Directive-owned committed outcome.

The protocol closes that gap by using the next player reply as the acceptance moment.

```text
Assistant prose is evidence.
The player's next reply is the handshake.
Validated campaign state is authority.
```

## Core Decision

Use **commit-on-next-player-reply** for generated scene beats.

When the player sends a new post, Directive should settle the previous assistant response before classifying the new post. The Utility lane receives the previous assistant response, the player's new reply, and a compact player-visible runtime snapshot. It returns structured settlement proposals. Deterministic code validates, deduplicates, anchors, and commits only allowed state changes before normal turn classification continues.

This avoids committing prose the player might regenerate, edit away, reject, or ignore. It also avoids relying on host-specific generation-complete hooks as the primary source of truth.

## Problem Statement

In a live Sam Vickers / Ashes of Peace campaign, Captain Whitaker gave three clear operational objectives:

- review Commander Cross's command-network handoff issue;
- meet Bronn during alpha shift;
- walk the ship and talk to department heads about refit issues.

The chat prose was clear, but Mission showed no open threads, no open current objectives, and Log did not update. The generated assistant response was treated as ordinary host narration for a scene-color continuation. Because it had no Directive outcome id, turn id, Command Log packet, or settlement event, the structured campaign state never learned about the captain's assignments.

That failure is not just a classifier miss. It is an architectural gap:

- a low-risk player prompt can cause the assistant to introduce durable campaign work;
- host narration can establish obligations that matter to Mission, Crew, Ship, and Log;
- generated prose should not become state until player acceptance is clear;
- UI state must never depend on re-reading raw chat as authority at render time.

## Product Contract

The player should be able to play naturally in chat. If the assistant gives a report, assignment, warning, staff read, or operational status and the player replies as though it is true, Directive should notice and update the relevant campaign surfaces.

The player should not need to manually copy objectives into Mission, run Scene Reconciliation, or ask the extension to remember obvious accepted obligations.

The system should still respect player agency. If the player rejects, corrects, rerolls, or challenges the previous response, Directive should not commit the rejected beat as state.

## Settlement Trigger

Run the Scene Handshake settlement pass at the start of `observeHostPlayerMessage`, before the normal intent classifier.

Inputs:

- active campaign state;
- bound chat id and save id;
- previous assistant message in the bound chat;
- current player message;
- runtime response ledger entry if the previous assistant response was delegated host generation;
- compact player-visible runtime snapshot.

Skip settlement when:

- there is no active bound campaign chat;
- the previous assistant message is already Directive-owned committed narration with an outcome id;
- the previous assistant message has already been settled for the same text hash;
- the current player reply explicitly rejects, corrects, or invalidates the previous assistant beat;
- pending recovery, stale source, wrong-chat, wrong-save, or protected edit state makes the anchor unsafe.

Manual Scene Reconciliation remains the fallback for older transcript ranges, edited messages, or operator-selected repairs.

## Acceptance Semantics

The Utility model should classify how the player's new reply relates to the previous assistant response.

Accepted examples:

- "Yes, sir. I'll address those three."
- "I'll start with Cross in Engineering."
- "Understood. Anything else before I'm dismissed?"
- an in-character action that proceeds from the previous assignment or report.

Not accepted examples:

- "Regenerate that."
- "No, that's not what happened."
- "Wait, Whitaker would not have said that."
- "Ignore that, continue from before."
- an out-of-character correction that changes the prior facts.

Acceptance does not mean the player agrees the prior response was a good outcome. It means the player is treating it as the current fiction.

## Utility Role

The Scene Handshake call should use the Utility lane, not the Reasoning lane by default.

The job is narrow:

- extract explicit player-visible state candidates;
- decide whether the current player reply accepts the previous assistant response;
- identify UI-relevant state changes;
- return strict JSON proposals;
- avoid hidden inference, adjudication, or new narration.

The Utility model must not:

- rewrite formal campaign objectives;
- invent hidden motives or private crew feelings;
- award Command Bearing points;
- resolve quests or outcomes;
- make destructive changes;
- create state from rejected or ambiguous prose;
- produce chat text.

## Snapshot Scope

The settlement prompt should be lean. Directive may track a large amount of UI state, but the Scene Handshake call should receive only the context needed to decide acceptance, dedupe proposals, and produce source-backed state candidates.

The snapshot builder should use a token/character budget, include omission counts for trimmed lists, and log which optional slices were included. It should prefer ids, titles, statuses, semantic fingerprints, and one-line player-safe summaries over full objects.

### V1 Snapshot Budget

Always include:

- core settlement envelope;
- current time and location;
- existing state fingerprints for dedupe;
- deterministic reference resolver slice;
- safety summary.

Include optional domain slices only when the previous assistant response or current player reply mentions matching concepts, names, places, systems, assignments, deadlines, or consequences. Optional slices should be small, sorted by relevance to the source text, and capped.

If the snapshot exceeds budget, drop optional domain slices first. Do not drop source anchors, message ids, text hashes, current player reply text, current time, or current location. If the previous assistant message is unusually long, include bounded text with stable excerpt anchors.

### Core Settlement Envelope

Include:

- campaign id, save id, chat id, package id, package version;
- active mission id, title, phase, and active phase id as labels;
- previous assistant host message id, ordinal, text hash, and full bounded text;
- current player host message id, ordinal, text hash, and text;
- source range hash;
- active runtime revision and mechanics revision.

### Time And Location

Time and location are first-class settlement context, not incidental flavor.

Include:

- current campaign clock or stardate;
- host observed timestamp for both source messages when available;
- active scene location id/name;
- ship zone, deck, room, planet, station, or route context when known;
- current destination and travel-window summary when relevant;
- explicit deadlines or relative time windows already visible to the player.

This lets settlement create due windows, avoid stale obligations, and write Log entries that match the campaign chronology.

### Existing State Fingerprints

Include compact dedupe records, not full UI state:

- formal objectives: id, title, status, and fingerprint only;
- open assignments: id, title, status, due window, linked ids, source hashes, and fingerprint;
- active directives or pending interactions: id, title, status, source hashes, and fingerprint;
- recent Command Log records: id, type, stardate, title/summary fingerprint, and source ids;
- active visible pressures: id, title, status, deadline/countdown, and fingerprint;
- visible known facts relevant to the current location or referenced entities: id, title, and fingerprint.

These records exist so the model can avoid duplicates and so deterministic validation can reject unsupported roots. They are not a full Mission, Log, Crew, Ship, or Knowledge dump.

### Reference Resolver Slice

Before the Utility call, deterministic code should scan the previous assistant response and current player reply for names, aliases, locations, ship systems, and domain terms. The prompt should include only relevant matches:

- player identity and billet;
- mentioned actors or crew: id, display name, rank, billet, division, and one-line public context;
- mentioned ship systems or equipment: id, display name, current public status, and one-line note;
- mentioned locations: id, display name, type, and whether it is the current scene location;
- alias collisions or unresolved names.

The model may return resolved ids for matches or literal names for unresolved references. Deterministic validation owns final id resolution.

### Optional Domain Slices

Optional slices are included only when triggered by the source text.

Mission slice:

- include available decision point ids, active directives, pending interactions, latest committed outcome fingerprint, and recovery/reconciliation counts only when the prior beat mentions orders, objectives, directives, choices, or unresolved action.

Thread slice:

- include matching visible open/watchlisted thread ids, titles, statuses, participant ids, topic keys, semantic fingerprints, and one-line summaries.
- do not include hidden thread prose, private motives, unrevealed backstory, or raw hidden state.

Ship slice:

- include ship identity and only the matching systems, restrictions, damage, technical debt, readiness advisories, or system notes referenced by the source text.

Crew slice:

- include only mentioned crew, directly supervising crew, assigned actors, and crew-linked open work relevant to the source text.
- do not include the full roster, raw relationship scores, or hidden crew development state.

Open-world slice:

- include foreground quest id, matching visible quests/opportunities, active side-work scene, and referenced locations only when the source text mentions those concepts.

Command Bearing slice:

- exclude in V1. Scene Handshake must not ask for Command Bearing evidence, awards, evaluations, point movement, refunds, or spend decisions. Those remain owned by the Command Bearing fit/evaluation systems after the final player message is processed.

### Open Assignments Surface

Add a first-class state surface such as `mission.openAssignments` or `mission.currentOrders`.

Open assignment records should support:

- id;
- title;
- summary;
- status;
- assigned by actor id;
- assigned actor ids;
- due window;
- linked crew ids;
- linked ship/system ids;
- linked thread ids;
- linked quest ids;
- source message ids;
- source anchor range;
- last updated at.

This is the target surface for captain-assigned work like "review Cross's memo", "meet Bronn", and "walk the ship." It is not a replacement for `mission.formalObjectives`.

### Safety Summary

Include only compact guard state:

- current-chat guard status;
- save guard status;
- pending recovery flags;
- protected edit or outcome replacement state;
- stale source warnings.

If safety state is not clean, the model should return `disposition: "internalReview"` or `disposition: "defer"`.

## Excluded Context

Do not include:

- provider settings, API keys, or host profile secrets;
- raw storage diagnostics;
- hidden director facts;
- hidden relationship values;
- hidden thread bodies;
- full UI drawer dumps;
- full Crew, Ship, Thread, Log, or Knowledge ledgers when compact fingerprints or targeted resolver matches are enough;
- private crew development internals;
- save-library records unrelated to the active chat;
- UI preferences;
- tutorial state;
- prompt-only configuration that is not campaign truth.

## Settlement Output Contract

The model should return strict JSON.

```json
{
  "kind": "directive.sceneHandshakeSettlement.v1",
  "acceptedPreviousResponse": true,
  "playerReplyRelation": "acknowledges",
  "confidence": 0.91,
  "disposition": "autoCommit",
  "needsInternalReview": false,
  "internalReviewReasons": [],
  "deferReason": null,
  "operatorRecoveryOnly": false,
  "openAssignmentProposals": [],
  "commandLogProposals": [],
  "shipReadinessProposals": [],
  "threadSignals": []
}
```

### Settlement Disposition

Allowed values:

- `autoCommit`: deterministic validation can commit allowlisted proposals immediately;
- `internalReview`: sidecars, validators, or recovery tooling must evaluate the proposal before commit;
- `defer`: the settlement pass should make no state change and continue normal player-message handling;
- `operatorRecovery`: no automatic player-facing flow; an operator recovery action may re-run or repair settlement later.

`needsInternalReview` never means ordinary players approve a proposal. It means Directive could not safely auto-commit the candidate and should use sidecars, deterministic domain validators, Scene Reconciliation, Outcome Integrity, or operator recovery paths.

### Player Reply Relation

Allowed values:

- `acknowledges`;
- `continues`;
- `acts-on`;
- `asks-followup`;
- `rejects`;
- `corrects`;
- `ambiguous`;
- `unrelated`.

Only `acknowledges`, `continues`, `acts-on`, and `asks-followup` can commit proposals automatically after deterministic validation.

### Open Assignment Proposal

```json
{
  "title": "Review Commander Cross's command-network handoff memo",
  "summary": "Captain Whitaker asked Vickers to get Engineering's walkthrough and give his own systems read on the handoff risk.",
  "status": "open",
  "assignedByActorId": "mara-whitaker",
  "assignedActorIds": ["player-commander"],
  "linkedCrewIds": ["imani-cross"],
  "linkedShipSystemIds": ["command-network"],
  "dueWindow": "within twelve hours",
  "priority": "current",
  "sourceEvidence": ["previous-assistant", "current-player"]
}
```

### Command Log Proposal

```json
{
  "type": "sceneHandshake",
  "summaryInputs": [
    "Captain Whitaker gave Vickers three immediate shakedown priorities before the Asterion Reach arrival window."
  ],
  "visibleConsequences": [
    "Vickers has current orders to review the handoff issue, meet Bronn, and walk the ship for refit concerns."
  ],
  "linkedAssignmentTitles": [
    "Review Commander Cross's command-network handoff memo",
    "Meet Bronn during alpha shift",
    "Walk the ship and check department-head refit concerns"
  ]
}
```

### Ship Readiness Proposal

```json
{
  "kind": "technicalDebt",
  "label": "Command-network handoff review",
  "detail": "Engineering has an unresolved command-network handoff issue requiring XO systems review.",
  "status": "under-review",
  "severity": "watch",
  "owner": "Commander Cross",
  "linkedAssignmentTitle": "Review Commander Cross's command-network handoff memo"
}
```

## Deterministic Validation

The model proposes state. Deterministic code commits state.

Validation should:

- require accepted player relation;
- require source anchors for every proposal;
- reject unsupported roots;
- reject hidden/private inference;
- dedupe by source message hash plus semantic fingerprint;
- keep `mission.formalObjectives` read-only;
- apply only allowlisted operation types;
- route uncertain or high-impact changes to internal validation or operator recovery;
- preserve idempotency on retry/reobserve;
- write runtime journal entries for settlement results.

Accepted explicit orders cannot settle as an empty no-op. If the Utility model returns `acceptedPreviousResponse: true` with empty proposal arrays, deterministic validation must inspect the source for conservative assignment cues such as ordinal lists, explicit current orders, "meet X", "walk the ship", "get down to Engineering", or named readiness issues. When those cues are present, the validator may synthesize bounded fallback proposals for open assignments, a source-backed Log entry, explicit low-risk ship readiness notes, and thread evidence. If the validator cannot safely synthesize or validate proposals for an accepted explicit-order source, the result must route to internal validation instead of recording a misleading settled success.

The fallback is a floor, not a replacement for the Utility model. It fills empty or clearly incomplete categories, dedupes by semantic key, and avoids double-writing categories the Utility already handled.

Allowed automatic roots should be narrow at first:

- `mission.openAssignments`;
- `commandLog.entries`;
- `ship.technicalDebt`;
- `threadLedger.records` after deterministic thread-record normalization.

Internal-validation roots include:

- formal objectives;
- mission phase changes;
- quest status changes;
- pressure escalation with deadline or cost;
- relationship stance changes;
- Command Bearing awards or point changes;
- damage records;
- crew casualties or reassignments.
- known-fact creation or cleanup.

These roots must not appear as direct auto-commit operations from the Scene Handshake call. They can become sidecar inputs, reconciliation candidates, or operator recovery items.

## Persistence And Provenance

Every committed settlement item must retain:

- settlement id;
- settlement transaction id;
- previous assistant host message id;
- current player host message id;
- source text hashes;
- source anchor range;
- campaign id;
- save id;
- chat id;
- pre-settlement state revision;
- post-settlement state revision;
- runtime revision;
- prompt context revision before and after commit;
- created at;
- model role id;
- validator result.

The settlement ledger should live under `runtimeTracking.sceneHandshake` or equivalent:

```json
{
  "settled": [],
  "pendingInternalReview": [],
  "deferred": [],
  "operatorRecovery": [],
  "rejected": [],
  "lastResult": null
}
```

State records created by settlement should be traceable back to the settlement id.

## Interaction With Existing Systems

### Transaction Boundary

Scene Handshake is a pre-classification settlement transaction, not a freeform side effect.

The Utility model proposes only. Deterministic code must:

- snapshot authoritative campaign state before validation;
- validate source anchors, state revision, chat binding, save binding, and allowlisted roots before mutation;
- commit all accepted proposals atomically through the same state-delta/journal path used for validated runtime mutations;
- autosave after a successful mutation;
- record a settlement transaction id and pre/post state revisions;
- roll back or no-op cleanly on malformed JSON, provider failure, stale source, wrong save, wrong chat, validation failure, or prompt-sync failure.

No Scene Handshake proposal may partially mutate Mission, Log, Ship, Thread, Crew, Knowledge, or runtime tracking state.

### Prompt Context Sync

If settlement commits state, Directive must rebuild or update player-safe prompt context before the current player message is classified or host generation continues.

Required behavior:

- settlement sees the prompt-context revision that was active when the player message arrived;
- committed settlement updates campaign state first;
- prompt context is rebuilt from committed state and records the new revision/hash;
- the current player classification sees the post-settlement prompt revision;
- if prompt sync fails, the transaction should either roll back or enter recovery before the current message continues.

This prevents the model from answering the player's new reply with stale Mission, Log, Ship, Crew, or assignment context.

### Save, Load, Branch, And Chat Binding

Scene Handshake must be branch-safe.

Settlement records, idempotency keys, pending internal-validation items, and operator-recovery entries are scoped to:

- campaign id;
- save id;
- chat id;
- campaign-chat binding revision when available;
- previous assistant source hash;
- accepting player source hash.

Save Game As, branch load, active-save deletion, Rebind Chat, wrong-chat guards, and wrong-save guards must not allow a settlement from one branch or chat to apply to another. When loading a branch, pending settlement recovery can be retained only if its source message ids still resolve inside the loaded chat binding. Otherwise it becomes inactive diagnostic history.

### Host Message Lifecycle

The host adapter must provide a normalized source view for the previous assistant response and accepting player reply.

V1 decisions:

- settle only the currently selected visible assistant text, not hidden alternate swipes;
- strip Directive display-only reply headers before evidence hashing and model input;
- ignore interrupted, streaming, deleted, superseded, or unselected generation output;
- treat native swipes, accepted protected edits, and selected assistant variants as source changes that require a new text hash;
- skip settlement for Directive-owned committed narration, terminal checkpoint messages, recovery/control messages, and other non-scene control posts;
- use host ordinals only as secondary evidence because ids, hashes, and chat binding are the authority.

This keeps host-native prose usable as evidence without making every transcript artifact campaign truth.

### Provider And Model-Call Observability

`sceneHandshakeSettler` is a normal model-call role and must be visible in sanitized diagnostics.

Record:

- role id and Utility lane;
- provider id and model id;
- start/end time, latency, timeout, retry count, and status;
- sanitized failure reason;
- prompt budget, source text sizes, and snapshot slices included;
- output parse status and validator disposition;
- committed roots and rejected roots;
- hidden-state redaction result.

Do not persist raw provider prompts, raw hidden state, API keys, provider reasoning, or full raw outputs outside an explicit sanitized diagnostics mode.

### Sidecar Scheduling Order

Scene Handshake should run before current-player classification. Deeper sidecars should run after settlement only when there is committed state or validated evidence worth processing.

Scheduling rules:

- handshake commit establishes a new state revision;
- prompt sync runs before classification;
- current-player classification then runs against the post-settlement state;
- sidecars use revision guards and reject stale-source results;
- batch/concurrent sidecars may rebase disjoint accepted deltas but must reject overlapping path conflicts;
- no-op, deferred, rejected, or provider-failed settlement does not trigger sidecar churn.

This prevents sidecars from racing the current player turn or applying against a stale settlement revision.

### Directive Assist And Readied Command Bearing

Directive Assist can help create the player's final sent text, but Scene Handshake only sees the final committed player message in chat.

Scene Handshake must not:

- inspect unsent Assist drafts as acceptance;
- mutate Assist draft history;
- consume, refund, award, or spend readied Command Bearing points;
- treat settlement as the current player action for Command Bearing fit checks.

If a Command Bearing point is readied, the accepting player reply remains the spend/fit target. V1 settlement does not produce Command Bearing evidence signals; later evaluators may use committed open assignments, Log entries, and thread evidence as ordinary source-backed context.

### End Conditions And Checkpoint Decisions

Scene Handshake must not auto-commit terminal campaign state.

If previous assistant prose implies player death, permanent command removal, ship loss, campaign-objective collapse, regional catastrophe, or an authored finale, settlement should:

- avoid direct mutation of terminal ledgers, formal objectives, conclusion state, or checkpoint decisions;
- produce internal-validation evidence for the Mission Director/end-condition service;
- skip Directive-owned terminal checkpoint messages and player replies that choose terminal checkpoint options;
- preserve branch/checkpoint replay semantics by anchoring evidence to the source messages without resolving the end condition itself.

Terminal decisions remain owned by the End Conditions and Mission Director systems.

### Multi-Host Adapter Contract

Scene Handshake must stay host-neutral. Each host adapter should provide the same normalized facts even if the native host has different event names or message models:

- active campaign/chat/save binding;
- previous visible assistant message id, selected variant id when available, ordinal, text, and text hash;
- accepting player message id, ordinal, text, and text hash;
- edit/delete/swipe/supersede markers;
- interrupted-generation status;
- host observed timestamps;
- ability to rebuild prompt context for the bound chat;
- wrong-chat and wrong-save guard results.

If a host cannot provide a required source fact, settlement should defer rather than guess.

### Utility Classifier

Scene Handshake runs before current-player intent classification. It may update state so the classifier sees the latest accepted assignments, logs, ship readiness, and threads.

### Mission Director

The Mission Director still owns consequential player actions, outcome packets, costs, and formal mission progress. Scene Handshake does not adjudicate the player's new action; it settles the accepted previous beat.

### Scene Reconciliation

Scene Reconciliation remains the manual and range-based repair system. Scene Handshake is the automatic single-turn settlement system for previous assistant response plus current player acceptance.

Both systems should share validators, source anchors, stale checks, and internal recovery surfaces where practical.

Scene Handshake must be compatible with Scene Reconciliation:

- settled records must use the same anchor-range and text-hash vocabulary;
- Reconcile From Here must see Scene Handshake records as anchored downstream state;
- accepted reconciliation changes must be able to invalidate, supersede, or rebase affected handshake records;
- pending internal-validation items should be inspectable through the same Mission recovery/reconciliation tooling when practical;
- duplicate proposals from handshake settlement and manual reconciliation must dedupe by source range plus semantic fingerprint.

### Outcome Integrity And Edits

Outcome Integrity remains the internal protected-edit validation system for Directive-owned assistant prose and already-committed outcomes. Scene Handshake must not bypass it.

Scene Handshake must be compatible with edits and deletes:

- if the previous assistant message or accepting player reply is edited, deleted, swiped, or superseded, anchored handshake state must become stale, invalidated, or internally revalidated;
- native protected edits must check whether the message has handshake-sourced state in addition to committed outcome state;
- accepted prose edits must preserve or explicitly revalidate any linked open assignments, Log entries, ship readiness records, thread evidence, and crew memories;
- rejected or outcome-changing edits must not leave handshake-created records active;
- retry/reobserve must be idempotent and must not duplicate settlement records after edit validation.

The edit system is therefore a compatibility dependency, not a later polish item.

### Narrative Thread Engine

Thread proposals should flow through the existing thread engine. Scene Handshake can supply accepted scene evidence, but the thread engine owns dedupe, reinforcement, surfacing, and optional promotion.

### Command Log

The Command Log should record player-facing accepted changes and current obligations. It should not become a transcript summary. Settlement log proposals must describe durable campaign memory.

### Command Bearing

Scene Handshake does not propose Command Bearing evidence in V1. It must not award marks, move reserve, refund points, or spend points. Command Bearing remains post-hoc and validator-owned.

### Ship And Crew

Settlement may create explicit low-risk ship technical-debt/readiness notes when the previous assistant response establishes them. Crew effects remain indirect in V1 through linked assignment and thread ids; hidden simulation values and crew memory remain untouched unless later dedicated evaluators validate them.

## Sidecar Ownership

Scene Handshake does not make the campaign sidecars redundant. It creates an earlier settlement gate for accepted host-generated prose. Existing sidecars still own deeper domain evaluation after there is a source-backed turn or settlement context.

The expected ownership split is:

| System | Remains responsible for |
|---|---|
| Scene Handshake | Single-turn acceptance, open assignment proposals, source-backed Log proposals, explicit low-risk ship readiness/technical-debt notes, and thread signals from the previous assistant response plus current player reply. |
| Continuity sidecar | Broader continuity cleanup and known-fact maintenance after committed turns or accepted settlement. |
| Relationship sidecar | Relationship-relevant memory/evaluation beyond player-safe explicit memory records. |
| Crew sidecar | Durable crew condition, roster, reassignment, casualty, assignment, and crew-state proposals that need domain validation. |
| Ship sidecar | Deeper ship condition, damage, restriction, readiness, and technical-debt evaluation beyond explicit low-risk facts. |
| Command Bearing sidecar | Command-conduct evidence review after committed context exists; marks, points, reserve, readied state, and spends remain validator-owned. |
| Command Log summary sidecar | Presentation summaries for already committed Command Log entries. It does not decide whether a Log entry exists. |
| Scene Reconciliation | Manual or range-based repair, older transcript settlement, source-range correction, recalculation, and operator recovery. |
| Outcome Integrity | Protected edit validation for Directive-owned prose, committed outcomes, and handshake-anchored state affected by edits. |

Some current sidecar work may become narrower:

- immediate Command Log creation for accepted assistant assignments should move to Scene Handshake;
- first-pass extraction of explicit open assignments should move to Scene Handshake;
- simple explicit ship-readiness notes from accepted prose can be proposed by Scene Handshake before the ship sidecar evaluates deeper implications;
- manual Scene Reconciliation should no longer be the normal path for the latest accepted assistant beat.

That is scope reduction, not redundancy. The sidecars still handle deeper, slower, cross-domain, or validation-heavy work.

## UI Effects

A successful Scene Handshake can update:

- Mission Active, if there are new current orders;
- Mission Context, for current orders and formal-objective context;
- Mission Open Threads, for newly engaged visible threads;
- Crew dossiers indirectly, through officer-linked assignments and threads;
- Ship, for explicit low-risk technical debt/readiness notes;
- Log, for accepted command memory;
- Assist context, because prompt-visible state now includes the accepted beat.

The player should not see noisy debug text. If useful, the UI can surface a compact status such as "3 current orders recorded" or "Accepted scene state updated" in Mission or Assist feedback.

## Sam Vickers Example

Previous assistant response:

```text
Captain Whitaker says there is nothing that will bite in the next twelve hours, then gives three priorities:
1. Commander Cross and the command-network handoff issue.
2. Meet Bronn today during alpha shift.
3. Walk the ship and talk to department heads about refit issues.
```

Current player reply:

```text
"Yes-sir, thank you, I'll keep that in mind while I address those three," he replied. "And I'll be sure to meet Bronn today..."
```

Expected settlement:

- accepted previous response: true;
- create three open assignments;
- append one Command Log entry;
- create or reinforce thread signals for Cross/handoff, Bronn handover, and shipboard refit shakedown;
- create ship technical debt/readiness note for command-network handoff;
- do not change formal objectives;
- do not resolve any objective;
- then classify the current player reply normally.

## Implementation Slices

### Slice 1: Rendering And State Surface

- Add `mission.openAssignments` state shape.
- Render open assignments in Mission.
- Fix object-to-text rendering for formal objectives and directives.
- Add docs/tests for no `[object Object]` Mission output.

### Slice 2: Settlement Prompt And Validator

- Add `sceneHandshakeSettler` Utility role.
- Build the budgeted snapshot builder with required core fields, time/location, compact fingerprints, deterministic reference matches, and triggered optional slices.
- Define strict JSON parser and validator.
- Implement `autoCommit`, `internalReview`, `defer`, and `operatorRecovery` dispositions.
- Wire validated commits through the transaction/state-delta path with settlement transaction ids, pre/post revisions, journaling, autosave, and clean rollback/no-op on failure.
- Commit only `mission.openAssignments`, `commandLog.entries`, explicit low-risk `ship.technicalDebt`, and deterministically normalized `threadLedger.records` at first.
- Use a deterministic fallback floor when the Utility model accepts the prior beat but omits obvious explicit assignments, omits explicit low-risk ship/thread signals from otherwise accepted assignments, or when the Utility provider fails after the player explicitly accepts enumerable current orders. The fallback must stay inside the same allowlisted roots and record `providerFailureFallback` provenance when it substitutes for provider failure.
- Rebuild prompt context after committed settlement and before current-player classification.

### Slice 3: Chat-Native Hook

- Run settlement at the start of player-message observation.
- Resolve the previous assistant message from the bound chat using the V1 previous-message rule.
- Normalize host source facts, selected assistant swipe text, display-header stripping, timestamps, and interrupted/deleted/superseded generation state.
- Skip Directive-owned committed narration, terminal checkpoint/control posts, stale alternates, and unsafe source anchors.
- Correlate delegated response ledger entries where available.
- Enforce the idempotency key before invoking the Utility model when possible, and again before committing state.
- Fail soft on timeout, malformed output, stale anchors, wrong chat, wrong save, or unavailable provider unless the narrow deterministic provider-failure fallback applies.
- Store settlement ledger entries under runtime tracking.

### Slice 4: Threads And Ship Readiness

- Route thread signals through the Narrative Thread Engine.
- Add ship technical-debt/readiness proposal validation.
- Add Crew dossier linkage for officer-linked assignments.
- Trigger deeper sidecars only after committed settlement state or validated evidence signals, with revision guards and stale-source rejection.
- Preserve batch/concurrency rules by rebasing disjoint deltas and rejecting overlapping path conflicts.

### Slice 5: Internal Validation And Recovery

- Send uncertain proposals to internal sidecar/domain validation or operator recovery.
- Invalidate settled state when source messages are edited or deleted.
- Add "rerun settlement for previous response" recovery action if needed.
- Ensure save/load, Save Game As, Rebind Chat, wrong-chat, wrong-save, and active-save deletion paths preserve settled provenance when still valid and deactivate unsafe pending settlement records when source scope no longer matches.
- Keep ordinary players out of approval flows; the chat should continue unless a normal guard or recovery condition already blocks play.

## Test Plan

Focused tests should cover:

- Sam Vickers / Whitaker three-objective settlement fixture;
- accepted explicit-order response with empty Utility proposal arrays still creates conservative fallback state or routes to internal validation;
- snapshot includes current campaign time and scene location;
- snapshot stays within the configured budget by using fingerprints and triggered domain slices instead of full UI state;
- player rejection produces no commit;
- player correction produces internal-validation or operator-recovery state, not automatic commit;
- previous-message resolution ignores user/system messages and skips already Directive-owned committed narration;
- settlement timeout and malformed JSON fail soft with no state change unless the deterministic provider-failure fallback safely applies;
- provider failure and prompt-sync failure cannot partially commit state;
- successful settlement records pre/post state revisions, autosaves, and rebuilds prompt context before current-player classification;
- duplicate observation does not duplicate assignments or Log entries;
- duplicate idempotency keys skip repeat Utility work where possible;
- Save Game As, load branch, Rebind Chat, wrong-chat, wrong-save, and active-save deletion isolate settlement records and pending recovery;
- selected assistant swipe text is the only assistant variant settled;
- display-only stardate headers are stripped before evidence hashes and Utility input;
- interrupted, deleted, superseded, terminal checkpoint, recovery, and control messages are skipped;
- formal objectives remain unchanged;
- object objective display renders text, not `[object Object]`;
- ship technical debt proposal commits only explicit readiness facts;
- existing ship technical debt can be reinforced with handshake source provenance instead of duplicated;
- thread signals dedupe against existing latent/watchlisted threads;
- sidecars run only after committed state or validated evidence signals;
- stale sidecar results are rejected after settlement revision changes;
- overlapping same-batch sidecar path conflicts are rejected;
- `sceneHandshakeSettler` appears in sanitized model-call diagnostics with role, lane, provider/model, latency, timeout, prompt budget, slices included, disposition, and committed roots;
- readied Command Bearing points are not consumed, refunded, spent, or awarded by settlement;
- Assist drafts are ignored unless they become the final sent player message;
- terminal-outcome evidence routes to internal validation and does not mutate end-condition ledgers directly;
- host adapters that cannot provide required normalized source facts defer settlement;
- edit/delete invalidates anchored settlement records;
- wrong-chat/wrong-save guard blocks settlement;
- no ordinary player-facing approval UI appears for internal-validation dispositions.

Live verification should include:

- start or load a bound SillyTavern campaign chat;
- produce an assistant response with explicit assignments;
- reply acknowledging the assignments;
- verify Mission, Crew, Ship, and Log update after the reply;
- verify save artifacts contain anchored settlement records;
- verify prompt context revision updates before the next generated reply;
- verify repeated refresh/reobserve does not duplicate records;
- verify save/load, Save Game As branch, wrong-chat send, selected swipe, edit, delete, and provider-timeout paths preserve authority boundaries;
- verify live diagnostics record the sanitized `sceneHandshakeSettler` model call and snapshot-budget fields.

## Resolved Implementation Defaults

Use these decisions as the V1 implementation contract.

1. Open assignments live under `mission.openAssignments`.
2. V1 auto-commit scope is `mission.openAssignments`, `commandLog.entries`, explicit low-risk `ship.technicalDebt`, and thread evidence routed through the Narrative Thread Engine.
3. The previous response is the latest non-user, non-system assistant message immediately before the new player post in the bound campaign chat, unless that response is already Directive-owned committed narration.
4. Settlement runs synchronously before player intent classification with a short timeout. Timeout, malformed JSON, unsafe anchors, wrong chat, wrong save, stale source, or unavailable Utility provider should fail soft with no state change unless the V1 deterministic provider-failure fallback can safely commit explicit accepted orders through the same validator and allowlisted roots.
5. If the player rejects, corrects, or materially challenges the previous assistant beat, V1 makes no automatic commit. Existing anchored state affected by that correction can become an internal-validation or operator-recovery item.
6. Prompt scope is the full bounded previous assistant response, the full current player reply, source metadata, current time, current location, compact state fingerprints, a deterministic reference resolver slice, and only triggered optional domain slices. It should not include full transcript history or full UI surface dumps.
7. Sidecars run only when settlement commits allowlisted state or returns validated evidence signals. A no-op or deferred settlement should not trigger extra sidecar churn.
8. Existing broken live saves are repaired through an explicit "settle previous accepted scene" recovery action or Scene Reconciliation. The automatic hook applies to new player replies.
9. Mission should render the new state as `Current Orders` or `Open Assignments`, separate from formal package objectives.
10. The idempotency key is `campaignId`, `saveId`, `chatId`, `previousAssistantHostMessageId`, `previousTextHash`, `acceptingPlayerHostMessageId`, and `acceptingTextHash`, plus semantic dedupe inside each target domain.
11. If a source assistant message or accepting player reply is edited, deleted, swiped, or superseded, sourced records become stale until preserved, invalidated, or revalidated by the edit/reconciliation systems.
12. The first golden fixture is the Sam Vickers / Whitaker three-objective handoff. It must prove three current orders, one Log entry, thread evidence, and a command-network technical-debt note without changing formal objectives.
13. Settlement commits are atomic transactions: model output is proposal-only, deterministic validation owns mutation, successful commits journal pre/post revisions and autosave, and failures no-op or recover without partial state.
14. Successful settlement must rebuild prompt context before current-player classification or host generation continues.
15. Settlement provenance and pending recovery are branch-safe and scoped to campaign, save, chat, binding revision when available, source message ids, and source text hashes. Turn orchestration must reject same-chat events when the host binding points at a different campaign or save branch.
16. Host source text is normalized before settlement: use only the selected visible assistant text, strip display-only reply headers, skip interrupted/deleted/superseded/control messages, and treat selected swipes or accepted edits as new source hashes.
17. `sceneHandshakeSettler` is a tracked Utility model-call role with sanitized diagnostics for provider/model, latency, timeout, retry, prompt budget, snapshot slices, parse status, disposition, committed roots, rejected roots, and redaction result.
18. Sidecar scheduling follows settlement revision order: settlement, prompt sync, current-player classification, then deeper sidecars with revision guards, stale-source rejection, and batch path-conflict protection.
19. Directive Assist drafts are ignored until sent as the final player message, and readied Command Bearing points remain scoped to the current player action rather than the settlement event.
20. Terminal outcome implications route to Mission Director/end-condition internal validation; Scene Handshake never directly mutates terminal ledgers, formal objectives, campaign conclusion, or checkpoint decisions.
21. Host adapters must provide normalized source facts for message ids, selected variants, hashes, timestamps, lifecycle markers, prompt rebuild, and guard state. Missing required facts defer settlement.
22. Live certification must cover accepted host-native assignment settlement, prompt revision proof, save/load, Save Game As, wrong-chat isolation, selected swipe, edit/delete, provider timeout or provider-failure fallback behavior, and sanitized model-call diagnostics.
23. Accepted explicit assignments with empty or partial Utility proposal arrays use the deterministic fallback floor. If Utility returns orders and Log but omits explicit ship/thread signals, deterministic validation supplements the missing allowlisted roots from the accepted source text or accepted assignment proposals. If the Utility provider fails after an explicit accepted order pair, V1 may use the same fallback only when deterministic acceptance cues are present. A settled record with `operationCount: 0` is valid only when the previous accepted assistant response contains no explicit current orders, log-worthy commitments, or low-risk readiness/thread evidence.
24. Existing ship readiness or technical-debt records are reinforced, not duplicated, when accepted assistant prose refers to the same issue. The record keeps its existing identity/status and gains handshake source ids, source messages, and source hashes.

## Non-Goals

- Replacing the Mission Director.
- Replacing Scene Reconciliation.
- Turning every assistant detail into a quest.
- Summarizing the full transcript after every turn.
- Letting generated prose directly overwrite campaign mechanics.
- Exposing hidden simulation state to the Utility model.
