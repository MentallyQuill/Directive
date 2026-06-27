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
         -> promptInstalled -> chatOpened -> activated
```

Every step has status, timestamps, and recoverable error metadata. Chat creation and response posting use idempotency identifiers because host effects and save persistence cannot share one database transaction.

`campaignChatBinding` stores host, entity, chat, campaign, save, introduction, and prompt-revision identity.

Activation also emits non-authoritative `directive.activationActivity` progress events before slow host/model boundaries. SillyTavern renders those through the same chat-surface activity pill used for turn processing, including the long `Writing opening scene...` state while the campaign-intro model call is running. The activation journal remains the recovery contract; progress events are display-only and cannot fail setup.

## Active Chat Save Guard

Manual save is guarded by the active host chat. `saveCurrentGame` and `saveCurrentGameAs` compare the currently selected host chat against `campaignChatBinding` before writing the loaded campaign state. The guard checks chat id, campaign id, save id, and current host chat metadata when the host exposes it.

Blocked cases return structured results instead of generic save errors. The UI can distinguish no active chat selected, a different save branch from the same campaign, a different Directive campaign, unbound chat, missing host identity capability, and conflicting metadata. Records keeps **Load Save** and **Delete Save** available, but disables **Save Game** and **Save Game As...** with a direct prompt to open or choose the campaign chat linked to the loaded save.

`Save Game As...` is a branch transfer for the active chat: after the new save record is created, Directive updates `campaignChatBinding.saveId`, writes the new binding into host chat metadata, rebuilds prompt context when available, and persists the branch with matching save/chat identity.

Terminal timeline branches use the same binding rule. When a Mission Directive Checkpoint saves the terminal timeline as a branch, the cloned campaign state rewrites `campaignChatBinding.saveId` to the branch save id before persistence.

## Provider Routing

Directive uses independent Utility and Reasoning lanes. The configuration model is adapted from Saga's provider-role separation while keeping Directive-owned schemas, storage, role IDs, and clients.

Native SillyTavern swipes on Directive-owned assistant responses are handled as chat transcript variants. The generation interceptor catches `swipe` generations for the current Directive-owned assistant message, asks Directive's provider route for alternate prose, appends that text through the host assistant-swipe API, and aborts the default host generation. Choosing a prior swipe or directly editing the assistant response remains native SillyTavern state; Directive treats the live selected text as committed prose when the next player message arrives.

Every generation role declares an explicit default `providerKind` in code. Provider routing is registry-derived; new roles cannot silently fall into the Reasoning lane. Operators can override each role's Utility/Reasoning lane from Settings, while the code-owned role/domain authority contract remains in `src/generation/model-call-authority-matrix.mjs` and is checked by `test-model-call-authority-matrix.mjs`.

Utility defaults include classification, continuity, prompt-context assistance, compact summaries, quest action interpretation, scene-delta extraction, scene reconciliation extraction, and relationship/crew/ship/command-bearing proposal workers. Reasoning defaults include counsel, narration, campaign introduction, campaign conclusion, quest architecture assistance, Directive Assist, and character-creator drafting.

Open-world model roles are deliberately split:

- `questActionInterpreter` maps a foreground quest action to authorized objective and method ids. It cannot select results or mutate state.
- `questArchitect` may propose grounded quest architecture, but deterministic registration creates any quest template and instance.
- `sceneDeltaExtractor` and `sceneReconciliationExtractor` extract evidence from chat text. Accepted observations still pass deterministic state validation and revision checks.

Provider configuration persists non-secret settings and per-role lane overrides only. OpenAI-compatible API keys stay in an in-memory session vault.

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

After a committed turn, `campaign-end-condition-service.mjs` evaluates package `endConditions`. A terminal candidate records detection and decision state in `runtimeTracking.endConditionLedger`, then surfaces a player-safe Mission checkpoint with Replay From Checkpoint, Push On, Keep This Ending, and Save As Branch actions.

## Prompt Safety

`player-safe-prompt-context-builder.mjs` first builds the Continuity Projection Matrix's six static prompt lanes, then appends allowlisted dynamic prompt blocks. Hidden state is never serialized into an ordinary prompt and then redacted.

Each block records stable ID, priority, depth/placement policy, source revision, source ids where available, and content. The packet has a canonical content hash and monotonic prompt revision. State mutation, accepted sidecars, load, binding changes, and recovery rebuild the packet as required. See [Continuity Projection Matrix](../technical/CONTINUITY_PROJECTION_MATRIX.md).

The timekeeping reply header is part of this prompt-safety boundary. `context-orchestrator.mjs` emits a current `[Directive: Reply Header]` block for host-native generation, while Directive-owned reply paths prepend the header deterministically. Prior visible headers are treated as display artifacts and stripped from Directive-controlled model/evidence paths. See [Timekeeping System](TIMEKEEPING_SYSTEM.md).

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

SillyTavern turn feedback is phase-aware. The chat-level activity pill is reserved for blocking visible turn work: reading the post, checking accepted prior-scene details through Scene Handshake, checking intent, advancing a scene, logging a routine action, filing an advisory note, preparing a clarification, resolving a command, writing the response, and syncing prompt context. It should not describe all work as interpreting an `order`; scene color, scene navigation, counsel/advisory, Scene Handshake, and host-generation delegation use their own copy.

For `injectAndContinue` turns, the delegation pill remains visible after Directive finishes its own work and clears only when the SillyTavern generation interceptor confirms that native host generation is about to continue. A bounded timeout prevents stale feedback if the host skips that signal, but ordinary handoff should not leave a blank gap before the model starts.

Scene Handshake feedback stays in the shared activity pill rather than opening a separate toast. The player-facing vocabulary is `prior scene` and `scene details`, not provider, model, or settlement internals. Committed domains appear as compact `Orders`, `Log`, `Ship`, and `Threads` chips; internal-review or operator-recovery dispositions leave a Mission review affordance.

After the visible response path settles, queued sidecars demote to quiet campaign-context chips instead of keeping the main spinner in a blocking state. Worker chips clear independently as Continuity, Crew, Ship, Command Bearing, and related background updates settle. Failed or rejected background workers leave a short review state with Mission access while durable diagnostics remain in runtime journals and Settings provider diagnostics.

## Verification Boundary

Dependency-free tests cover adapters, event wiring, provider routing, activation, prompt safety, turn arbitration, exactly-one response, durability, recovery, sidecar authorization, conclusion, archive-adjacent state, and the integrated fake-host lifecycle. A real SillyTavern browser smoke remains necessary before release certification because host API signatures and third-party interceptor ordering are external runtime conditions.
