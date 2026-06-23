# Player Turn Sequence

This document explains the current player-post lifecycle from host ingress to stable save.

## Plain-Language Flow

1. The player writes in the bound campaign chat.
2. Directive records that post as an ingress event.
3. Directive decides whether the post is routine, needs a quick utility pass, or needs the Director.
4. Routine turns synchronize prompt context and let the host continue.
5. Consequential turns commit structured mechanics before prose.
6. Narration is generated from the committed packet.
7. The response is posted exactly once.
8. Directive autosaves and may schedule sidecars.
9. If something fails, recovery resumes from the last durable step.

## Infographic

```mermaid
flowchart TD
  A["Host player message"] --> B["Normalize message and active chat identity"]
  B --> C{"Bound campaign chat?"}
  C -->|no| D["Ignore or fail open to host"]
  C -->|yes| E["Record ingress in runtimeTracking.ingressLedger"]
  E --> F["Deterministic fast-path classification"]
  F --> G{"Clear routine path?"}
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
  T --> U["Record response and stable autosave"]
  U --> V["Schedule sidecars and rebuild prompt"]
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

Designed turn-sequence infographic pending if Mermaid is replaced with a static diagram.
