# Utility Turn Arbiter Design

## Status

Design spec for a pre-alpha runtime change. No legacy compatibility is required. Existing deterministic semantic behavior may be removed when the new Utility Turn Arbiter replaces it in place.

## Problem

Directive currently gives deterministic code too much semantic authority. The live Ashes ready-room failure showed the pattern:

1. The player answered Captain Whitaker inside an already-established ready-room scene.
2. The Utility classifier failed with provider-visible reasoning only.
3. Runtime fell back to deterministic classification and mission resolver output.
4. The Ashes resolver selected stale arrival/handoff framing.
5. Narration re-established the ready room and Whitaker instead of continuing the current conversation.

This is not only a bug in one Ashes phase. It is an architecture smell: deterministic pattern code is deciding meaning. Deterministic code should protect custody, source integrity, safety gates, schemas, idempotency, persistence, and state reducer boundaries. A Utility model should arbitrate turn meaning and response ownership from source-bound context.

## Goal

Add a blocking Utility Turn Arbiter that decides turn route, response ownership, scene-continuity constraints, and allowed state intent before runtime chooses host continuation, Directive outcome commit, local pacing, pause, or recovery.

## Non-Goals

- Do not let a model directly mutate campaign state.
- Do not pass hidden state, raw prompts, provider reasoning, cookies, CSRF tokens, API keys, or raw secret host data to the Arbiter.
- Do not remove deterministic source custody, idempotency, save binding, stale-source checks, recovery, reducer validation, or prompt-budget enforcement.
- Do not rewrite every mission package in this slice.
- Do not make an additional player-facing UI surface.

## Recursion Reference Pattern

Use Recursion as inspiration for explicit policy and lifecycle boundaries, not as code to port.

Relevant pattern:

- Stored settings and current-run policy are separate.
- Runtime uses an explicit effective plan rather than implicit heuristics.
- Work requests carry lifecycle metadata such as refresh, replacement, and prompt footprint.
- Prompt contracts state what work is requested and what must stay true.

Directive equivalent:

- `TurnArbiterPlan` becomes the explicit current-turn policy.
- `responsePlan.owner` replaces implicit response ownership from deterministic classification.
- `sceneContinuity.mustPreserve` and `mustNotReestablish` travel into host continuation and Directive narration.
- `statePlan.proposedOperations` is only a proposal. Reducers and gateways decide what can persist.

## Architecture

Current simplified path:

```text
player message
  -> deterministic + Utility classifier
  -> deterministic arbitration
  -> chat-turn-orchestrator branch
  -> Mission Director deterministic resolver
  -> narration or host continuation
```

Target path:

```text
player message + source frame + player-safe context
  -> source settlement for previous assistant/player pair
  -> Utility Turn Arbiter
  -> TurnArbiterPlan validation
  -> runtime branch
       hostContinue: install response guidance, release host generation
       directiveOutcome: preview/commit Director turn with Arbiter intent
       localPacing: deterministic local transition/routine response
       pause: post clarification/risk/recovery prompt
       recovery: mark retry/review without committing mechanics
  -> sidecars and prompt sync after validated route
```

The Arbiter owns semantic routing. Runtime owns execution.

## New Role

Add generation role:

```text
utilityTurnArbiter
```

Role defaults:

- providerKind: `utility`
- blocking: `true`
- output: `structured-json`
- timeoutMs: same blocking Utility budget class as `utilityTurnClassifier`
- modelPreferences: low cost, fast latency, utility-reasoning
- mayProposeState: `false`
- mayInjectPrompt: `false`
- mayRunDuringMainGeneration: `true`
- fallback: `fail-closed`

`fail-closed` means: if Arbiter fails, runtime may pause or release host generation with minimal source-bound guidance, but it must not commit a deterministic mission outcome.

## Turn Arbiter Context

Input must be player-safe and source-bound:

- campaign id, save id, chat id
- ingress id, host message id, text hash
- selected previous assistant variant metadata
- latest visible transcript window
- current mission id, phase id, active decision ids
- current location/time display
- open assignments and pending interactions
- source-settlement summary for the latest assistant/player pair
- prompt external-environment status summary, without raw prompt bodies
- recent recovery status
- current route capability map

Input must not include raw hidden state, raw prompt bodies, raw provider reasoning, raw relationship values, raw pressure values, private NPC thoughts, cookies, CSRF tokens, API keys, or unredacted secrets.

## Turn Arbiter Output

Canonical output kind:

```text
directive.turnArbiterPlan.v1
```

Shape:

```json
{
  "kind": "directive.turnArbiterPlan.v1",
  "schemaVersion": 1,
  "route": "hostContinue",
  "confidence": 0.86,
  "ambiguity": "low",
  "playerIntent": {
    "speechAct": "answering-question",
    "action": "defers final ship assessment until inspection",
    "target": "mara-whitaker",
    "directObject": "Breckenridge readiness assessment",
    "domainSignals": ["ship", "ready-room-handover"],
    "riskSignals": []
  },
  "sceneContinuity": {
    "currentLocation": "captain-ready-room",
    "currentConversation": "Whitaker asks Sam what his XO read of the ship is before he has inspected it.",
    "mustPreserve": [
      "Sam is already seated in Whitaker's ready room.",
      "Whitaker has already introduced herself and asked for Sam's view.",
      "Bronn has already briefed Sam on the walk up."
    ],
    "mustNotReestablish": [
      "Sam boarding the ship",
      "Sam first meeting Whitaker",
      "the ready room as a newly introduced space"
    ]
  },
  "responsePlan": {
    "owner": "host",
    "strategy": "injectAndContinue",
    "guidance": "Continue Whitaker's response in the current ready-room exchange. She can accept that Sam wants first-hand inspection before judging the ship and move him toward Bronn or systems review."
  },
  "statePlan": {
    "commitOutcome": false,
    "allowedDomains": ["sourceBinding", "continuity", "mission"],
    "proposedOperations": [
      {
        "domain": "mission",
        "op": "upsertOpenAssignment",
        "summary": "Sam owes Whitaker a first-hand XO read after inspecting Breckenridge systems."
      }
    ],
    "promptDirtyDomains": ["sourceBinding", "continuity", "missionQuestThread"]
  },
  "risk": {
    "requiresPause": false,
    "pauseReason": "",
    "reasons": []
  },
  "diagnostics": {
    "sourceUse": "latest visible transcript and source-settlement summary only",
    "deterministicFallbackUsed": false
  }
}
```

## Route Semantics

`hostContinue`

- Runtime syncs prompt guidance and releases native host generation.
- No Director outcome is committed.
- Sidecars may record source-bound context after the visible host response appears.

`directiveOutcome`

- Runtime previews and commits a Director turn.
- Director receives Arbiter intent and continuity constraints.
- Narrator receives `mustPreserve` and `mustNotReestablish`.
- Commit proceeds only through existing turn-commit coordinator and state-delta gateway.

`localPacing`

- Runtime posts deterministic local pacing text for location movement or other narrow nonsemantic pacing.
- Use only for routes validated by Arbiter, not broad keyword fallback.

`pause`

- Runtime posts a clarification, warning, risk confirmation, or recovery prompt.
- No mechanics commit.

`recovery`

- Runtime marks retry/review required.
- No mechanics commit.
- Used for source mismatch, stale state, bad selected swipe, Arbiter contract failure, or prompt-budget failure.

## Validation Rules

Runtime validates Arbiter output before branching:

- `kind` must be `directive.turnArbiterPlan.v1`.
- `route` must be one of the known routes.
- `responsePlan.owner` must match route.
- `statePlan.commitOutcome` may be true only for `directiveOutcome`.
- `proposedOperations` may not mutate state directly.
- hidden-state leak patterns reject the plan.
- low confidence plus consequential route becomes `pause`.
- missing `sceneContinuity` on host or narration routes becomes `pause` or recovery.
- `mustNotReestablish` passes into every visible prose path.

Provider transport success is not feature success. Invalid JSON, empty visible content, reasoning-only response, hidden-state leak, unsupported route, and stale source all fail closed.

## Deterministic Engine Demotion

Remove deterministic semantic authority in stages:

1. `utility-turn-classifier.mjs` remains temporarily for comparison tests and migration, but runtime stops using deterministic fallback for committed outcomes.
2. `intent-parser.mjs`, `action-classifier.mjs`, `capability-validator.mjs`, and `ashes-of-peace/action-resolver.mjs` stop deciding whether a chat turn is a mission outcome. They may run only after Arbiter selects `directiveOutcome`.
3. Package mission graphs provide constraints, decision ids, phase metadata, and possible consequence vocabulary. They do not automatically transform any in-phase text into an outcome.
4. Canned outcome summaries cannot become visible narration unless Arbiter selected `directiveOutcome` and the summary is grounded in current scene continuity.

## Failure Policy

On Arbiter failure:

- If pending interaction or risk state is active: `pause`.
- If the message is ordinary in-scene dialogue and source is clean: `hostContinue` with minimal prompt guidance from current transcript.
- If state mutation appears necessary: `recovery`.
- Never commit deterministic mission mechanics from fallback.
- Never use a canned package outcome as fallback visible prose.

## Observability

Model-call journal records:

- role id `utilityTurnArbiter`
- status, latency, provider lane, provider label
- parse/validation/apply status
- request hash
- ingress id, host message id, text hash
- selected route
- fallback decision if failure path used

Diagnostics do not store raw prompt, raw player text, raw provider output, hidden state, or provider reasoning.

## Test Strategy

Focused tests:

- role registry and authority matrix include `utilityTurnArbiter`
- contract parser accepts valid plans and rejects malformed/hidden-state-leaking plans
- Arbiter provider reasoning-only failure cannot become `directiveOutcome`
- Sam/Whitaker ready-room fixture routes to `hostContinue`
- `directiveOutcome` route still commits exactly one response
- low-confidence consequential Arbiter output pauses
- prompt guidance receives `mustNotReestablish`

Broad gates:

- `node tools/scripts/test-generation-router.mjs`
- `node tools/scripts/test-model-call-authority-matrix.mjs`
- `node tools/scripts/test-turn-intent-classifier-fixtures.mjs` during migration
- `node tools/scripts/test-chat-turn-orchestrator.mjs`
- `node tools/scripts/test-chat-native-runtime-flow.mjs`
- `npm.cmd test`

Live proof:

- Sync installed default-user extension if needed.
- Reproduce the latest Ashes ready-room sequence in SillyTavern.
- Verify Sam's next in-scene reply does not reintroduce boarding, Whitaker, or the ready room.
- Verify model-call journal shows `utilityTurnArbiter`.
- Verify no deterministic committed outcome appears when Arbiter fails.

## Acceptance Criteria

- Runtime no longer commits deterministic mission outcomes when the Utility semantic call fails.
- Ready-room answers like Sam's row 18 route to host continuation unless Arbiter explicitly selects `directiveOutcome`.
- `mustNotReestablish` continuity constraints reach host continuation and Directive narration.
- Deterministic code still protects source integrity, idempotency, persistence, reducer validation, and recovery.
- Tests cover Arbiter success, invalid output, reasoning-only failure, low confidence, and Ashes ready-room regression.
- Full alpha gate passes.
