# Player Turn Sequence

This document explains the current player-post lifecycle from host ingress to stable save.

## Plain-Language Flow

1. The player writes in the bound campaign chat.
2. Directive shows a delayed chat activity pill such as `Directive is reading your post...`.
3. Directive records that post as an ingress event.
4. Directive decides whether the post is scene color, scene navigation, routine, counsel, a pause, or a Director turn.
5. The activity pill updates to the current blocking phase, such as checking intent, advancing the scene, logging the action, resolving the command, or writing the response.
6. Routine turns synchronize prompt context and let the host continue.
7. Consequential turns commit structured mechanics before prose.
8. Narration is generated from the committed packet.
9. The response is posted exactly once.
10. Directive checks package end conditions and may pause on a terminal checkpoint.
11. Directive autosaves and may schedule sidecars.
12. After the visible response is settled, sidecar work demotes to quiet `Updating campaign context...` chips rather than holding the main spinner at full weight.
13. If something fails, recovery resumes from the last durable step and the UI leaves a review state instead of disappearing immediately.

## Infographic

```mermaid
flowchart TD
  A["Host player message"] --> B["Normalize message and active chat identity"]
  B --> C{"Bound campaign chat?"}
  C -->|no| D["Ignore or fail open to host"]
  C -->|yes| E["Record ingress in runtimeTracking.ingressLedger"]
  E --> F["Show blocking activity: checking intent"]
  F --> F2["Deterministic fast-path classification"]
  F2 --> G{"Clear routine path?"}
  G -->|yes| H["Sync player-safe prompt context"]
  H --> I["Allow host generation"]
  G -->|no| J["Utility classifier role: utilityTurnClassifier"]
  J --> K{"Consequential?"}
  K -->|no| H
  K -->|yes| L["Build scene snapshot and retrieval packet"]
  L --> M["Director turn runtime"]
  M --> N{"Pending review?"}
  N -->|yes| O["Record pending interaction and show Mission pause"]
  N -->|no| P["Commit mechanics through transaction state"]
  P --> Q["Generate narration from committed packet"]
  Q --> R{"Narration ok?"}
  R -->|no| S["Record retryable narration recovery"]
  R -->|yes| T["Post Directive-owned response with idempotency key"]
  T --> U["Evaluate package endConditions"]
  U -->|terminal candidate| V["Record Directive Checkpoint in endConditionLedger"]
  U -->|no terminal candidate| W["Record response and stable autosave"]
  V --> X["Replay, Push On, Keep Ending, or Save Branch"]
  W --> Y["Schedule sidecars and rebuild prompt"]
  Y --> Z["Demote UI to background campaign-context chips"]
```

## Deep Flow

### Ingress

SillyTavern events enter through `src/hosts/sillytavern/shell-events.js`, which forwards player messages, edits, deletes, chat changes, and disable events into the runtime bridge. The generation interceptor enters through `src/hosts/sillytavern/runtime-bridge.mjs` and delegates to `runtimeApp.interceptGeneration`.

The runtime app exposes `observeHostPlayerMessage` and `interceptGeneration` from `src/runtime/runtime-app.mjs`. Those calls create or use the chat-native services built around `src/runtime/chat-turn-orchestrator.mjs`.

The orchestrator normalizes host messages, records ingress through `recordTurnIngress`, and serializes work per campaign id so duplicate or overlapping host events cannot race the same save.

### Active Binding Check

The active campaign is chat-affine. The orchestrator checks the current host chat id against campaign binding before taking authority over a turn. If the chat is not bound, Directive should not mutate campaign state for that post.

Operator-facing symptoms:

- the Mission route can show the campaign chat as bound or unbound;
- Campaign Records can block manual save when the active host chat does not match the loaded save;
- Rebind Chat is recovery/admin behavior, not normal first-start flow.

### Classification

The turn classifier has layered behavior:

- deterministic fast paths for obvious cases;
- `utilityTurnClassifier` model role for ambiguous cases;
- deterministic arbitration of the final worker plan.

The classifier may choose inject-and-continue behavior, a Directive-owned turn, or a pending interaction. It does not mutate state by itself.

### Turn Activity Feedback

The SillyTavern host shows a delayed activity pill for blocking visible work. It should appear only after the short reveal delay so fast deterministic turns do not flash. The label is phase-specific:

- `Directive is reading your post...`
- `Directive is checking intent...`
- `Directive is advancing the scene...`
- `Directive is logging the action...`
- `Directive is filing an advisory note...`
- `Directive is preparing a clarification...`
- `Directive is preparing a checkpoint...`
- `Directive is reviewing the command...`
- `Directive is committing outcome mechanics...`
- `Directive is writing the response...`
- `Directive is syncing campaign context...`

The label should not call every post an order. `order`-style copy is reserved for command-resolution states, not scene color, scene navigation, counsel, or ordinary prose.

When the host-visible outcome is settled but sidecar workers are still running, the activity demotes to `Updating campaign context...` with compact worker chips such as `Continuity`, `Crew`, `Ship`, or `Command Bearing`. Each chip clears as that worker settles. A failed or rejected background worker leaves a short review state with Mission access instead of vanishing at the same moment the visible response posts.

### Director Escalation

Consequential turns enter Director runtime. The runtime builds a scene snapshot from current campaign state, package data, mission graph, quest state, pressure state, crew context, and player input. It may call open-world/quest services or the current deterministic Mission Director.

The output is a turn packet containing:

- scene snapshot;
- command competence packet;
- outcome packet;
- state delta;
- narrator packet;
- Command Log packet;
- optional warning or Command Bearing eligibility.

### Pending Review

Some turns pause before commit:

- clarification needed;
- serious-risk confirmation;
- authority review;
- Command Bearing choice;
- replacement/outcome preview.

Pending interactions live in `runtimeTracking.pendingInteractions` and surface in Mission. They should be player-safe and should tell the operator what decision is required.

### Mechanics Commit

The commit path applies the turn packet before narration. `commitDirectorTurn` updates campaign-owned domains such as mission state, open-world state, clocks, command style, relationships, pressure ledger, actors/fronts, command competence records, relationship memory, Command Log, and turn ledger.

The turn commit coordinator then records mechanics status and persists the save. At this point the outcome exists even if narration fails.

### End-Condition Checkpoint

After mechanics commit, the runtime evaluates the package `endConditions` root against the committed outcome and current campaign state. A matched terminal candidate records:

- a detection entry;
- a `terminalOutcomeDecision` pending interaction;
- checkpoint metadata;
- allowed resolution actions;
- optional `Push On` continuation frames.

Mission renders this as a **Directive Checkpoint**. Replay restores the best retained checkpoint snapshot. `Push On` applies the selected continuation frame. `Keep This Ending` concludes the branch. `Save As Branch` writes a terminal timeline save so the terminal outcome can be preserved without forcing it to remain the active path.

### Narration

Narration uses the `narration` model role through the active generation route. The prompt must come from committed/player-safe packets. Narration cannot change mechanics. If narration fails, Directive records recovery and can retry from the same outcome id.

### Response Posting

Directive-owned turns abort normal host generation and post exactly one assistant response. Response records carry status and idempotency data so retry does not duplicate the same outcome.

### Autosave And Sidecars

After stable narration, the runtime creates a stable autosave. Sidecars may run after committed state is available. They operate on snapshots and propose validated deltas, or they journal failures without mutating state.

## Reusable Extension Pattern

For a new extension, reuse the pattern rather than the Star Trek specifics:

1. Keep host ingress narrow and normalized.
2. Make classification explicit before expensive work.
3. Commit authoritative mechanics before prose.
4. Make generated prose a presentation layer.
5. Store ingress, response, model-call, recovery, and sidecar journals separately.
6. Require idempotency for host posting.
7. Make edit/delete recovery snapshot-based, not guess-based.

## Render Slots

Runtime turn-sequence examples:

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-mission-active.png" alt="Mission Active bound-chat state">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-mission-authority-review.png" alt="Mission pending authority review">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-mission-provisional-turn.png" alt="Mission provisional turn state">
</p>

<p align="center">
  <img src="../../assets/documentation/renders/docs-directive-mission-narration-recovery.png" alt="Mission narration recovery console">
</p>

<!-- directive-render id="docs-directive-player-turn-sequence-diagram" status="diagram-needed" source="diagram" asset="assets/documentation/renders/docs-directive-player-turn-sequence-diagram.png" tracking="../testing/DOCUMENTATION_RENDER_TRACKING.md" -->
Render needed: designed turn-sequence infographic if the Mermaid diagram is replaced with a static diagram.
