# Chat-Native Runtime Architecture

## Status

Implemented pre-alpha architecture for the Target User Flow. The existing Mission Director remains the deterministic adjudication core; this layer adds host orchestration around it.

## Runtime Spine

```text
SillyTavern events and generation interceptor
        |
SillyTavern runtime bridge
        |
Campaign/chat binding and ingress normalization
        |
Utility classification and worker plan
        |
Chat turn orchestrator
        |
Existing Mission Director and authorized sidecars
        |
Tracked state-delta and durability coordinators
        |
Player-safe prompt builder and response dispatcher
        |
Host chat, active save, and UI projections
```

## Host Boundary

`src/hosts/host-contract.mjs` defines chat, prompt, events, generation, provider, storage, and lifecycle capabilities without importing SillyTavern internals into the engine.

The SillyTavern implementation is split into:

- `chat-adapter.mjs`: chat creation/binding, activation, message normalization, assistant posting, metadata, and idempotency;
- `prompt-adapter.mjs`: install, update, clear, rebuild, suspend, and inspect;
- `provider-client.mjs`: Current Host Model, Connection Profile, and OpenAI-compatible execution;
- `runtime-bridge.mjs`: global generation interceptor and fail-open routing;
- `shell-events.js`: sent/edit/delete/chat/disable event lifecycle.

The interceptor ignores quiet, sidecar, Directive-owned, non-bound-chat, and disabled-extension work. It allows ordinary generation for inject-and-continue turns and aborts it only when Directive owns or pauses the response.

## Campaign Activation

`campaign-activation-coordinator.mjs` executes a persisted journal:

```text
prepared -> chatBound -> introGenerated -> introPosted
         -> promptInstalled -> activated -> chatOpened
```

Every step has status, timestamps, and recoverable error metadata. Chat creation and response posting use idempotency identifiers because host effects and save persistence cannot share one database transaction.

`campaignChatBinding` stores host, entity, chat, campaign, save, introduction, and prompt-revision identity.

## Provider Routing

Directive uses independent Utility and Reasoning lanes. The configuration model is adapted from Saga's provider-role separation while keeping Directive-owned schemas, storage, role IDs, and clients.

Every generation role declares an explicit `providerKind` in code. Provider routing is registry-derived; new roles cannot silently fall into the Reasoning lane. The role/domain authority contract lives in `src/generation/model-call-authority-matrix.mjs` and is checked by `test-model-call-authority-matrix.mjs`.

Utility roles include classification, continuity, prompt-context assistance, compact summaries, quest action interpretation, scene-delta extraction, scene reconciliation extraction, and Directive Assist. Reasoning roles include counsel, narration, campaign introduction, conclusion, relationship/crew/ship proposal workers, and quest architecture assistance.

Open-world model roles are deliberately split:

- `questActionInterpreter` maps a foreground quest action to authorized objective and method ids. It cannot select results or mutate state.
- `questArchitect` may propose grounded quest architecture, but deterministic registration creates any quest template and instance.
- `sceneDeltaExtractor` and `sceneReconciliationExtractor` extract evidence from chat text. Accepted observations still pass deterministic state validation and revision checks.

Provider configuration persists non-secret settings only. OpenAI-compatible API keys stay in an in-memory session vault.

## Turn Orchestration

`chat-turn-orchestrator.mjs` serializes turns per campaign and records a deduplicated ingress key from chat ID, host message ID, and text hash.

The utility result contract selects and validates:

- classification;
- confidence, ambiguity, reasons, and safe action/target slots;
- pending-interaction resolution;
- worker plan before and after deterministic validation;
- response strategy after arbitration.

Deterministic fast paths avoid provider calls for obvious scene color, routine procedure, high-risk confirmation, and pending-interaction replies. Ordinary consequential intent uses the Utility classifier unless it is running without a generation router. Provider output is never authoritative by itself: deterministic arbitration validates stable slots, risk conflicts, hidden-state leakage, response strategy, and required worker plans before the runtime branches.

Explicit pending replies such as "Confirm the order" resolve the existing pending interaction instead of previewing a new Director turn.

Exactly one response is recorded:

- `injectAndContinue`: persist any routine change, synchronize prompt, allow host generation;
- `directivePosted`: commit mechanics, generate/post one idempotent response, abort host generation;
- `pause`: create one pending interaction and post or expose the required clarification/warning.

## Durability

`turn-commit-coordinator.mjs` writes a stable mechanics checkpoint before provider narration. Narration and response status are later revisions of the same committed outcome.

`state-delta-gateway.mjs` maintains monotonic revision, bounded deep snapshots, redo truncation, ingress, response, recovery, sidecar, and pending-interaction ledgers. This history model is adapted from MultihogDnDFramework's per-chat memo and watermark approach, generalized to Directive's structured campaign domains.

Retries preserve outcome and conclusion IDs. They do not call deterministic mechanics again.

## Prompt Safety

`player-safe-prompt-context-builder.mjs` constructs nine blocks from allowlisted selectors. Hidden state is never serialized into an ordinary prompt and then redacted.

Each block records stable ID, priority, depth/placement policy, source revision, and content. The packet has a canonical content hash and monotonic prompt revision. State mutation, accepted sidecars, load, binding changes, and recovery rebuild the packet as required.

## Sidecars

`campaign-sidecar-scheduler.mjs` treats workers as proposal-only. Every proposal declares a base revision, worker type, authorized domains, reason, and patch. State-delta sidecars parse through the shared structured-output parser and validate against `directive.sidecar.stateDeltaProposal.v1` before the state gateway rejects stale revisions, forbidden paths, prototype keys, and cross-domain writes.

Accepted sidecars are persisted and trigger a player-safe prompt rebuild. Failure is journaled without partially applying state.

Command Log summaries parse through `directive.sidecar.commandLogSummary.v1`. Invalid JSON, source mismatches, empty summaries, and hidden-state language become feature failures with persisted diagnostics instead of successful summaries.

## Model-Call Observability

The generation router emits sanitized model-call events for runtime calls. `runtimeTracking.modelCallJournal` stores role id, provider lane, status, provider/model labels, latency, request hash, retryability, error code, and staged parse/validation/apply statuses where available. It does not store raw prompts, raw hidden context, raw player text, or raw provider output.

Settings renders the recent model-call journal in the Providers section. This gives operators a live way to distinguish deterministic routing, Utility classification, Reasoning narration/counsel, and sidecar failures without exposing hidden state.

## Message Reconciliation

`message-reconciler.mjs` handles edits and deletes by locating the ingress record and its pre-turn snapshot. Safe isolated changes can invalidate or roll back. Changes with dependent committed turns are marked `reviewRequired`, preserving the current campaign until the operator deliberately branches or restores.

## Conclusion

`campaign-conclusion-service.mjs` commits pressure settlement, completion reason, and the final Command Log record before generation. The recap is checkpointed before posting. A failed post retries the same text and idempotency key. Completion clears prompt injection; archive is a subsequent explicit state transition.

## UI Contract

The host chat is the play surface. Campaign, Mission, Crew, Ship, Log, and Settings are projections and controls. Mission's old text box is a fallback only. Player-facing views use qualitative or allowlisted fields; raw hidden simulation state remains authoritative but is not passed to narrator prompts.

## Verification Boundary

Dependency-free tests cover adapters, event wiring, provider routing, activation, prompt safety, turn arbitration, exactly-one response, durability, recovery, sidecar authorization, conclusion, archive-adjacent state, and the integrated fake-host lifecycle. A real SillyTavern browser smoke remains necessary before release certification because host API signatures and third-party interceptor ordering are external runtime conditions.
