# Directive Model-Call Envelope Design

**Status:** Approved

**Date:** 2026-08-10

## Purpose

Prevent Directive-owned Utility and auxiliary Reasoning requests from inheriting model-specific generation parameters from an unrelated active SillyTavern preset, while keeping gameplay narration governed by the full Directive narration contract.

## Product Decisions

- Gameplay narration continues to use the bundled Directive preset and the complete runtime campaign packet.
- A bound campaign chat activates the installed Directive preset through SillyTavern's canonical preset manager before prompt synchronization and host generation. Leaving the bound chat or disabling Directive restores the user's previous preset.
- Utility and structured Reasoning roles use only their role-local system prompt, user prompt, and schema. They do not receive the bundled preset's narration prompt stack.
- A current-model Chat Completion request uses the bundled `Directive` preset as its generation-parameter baseline without changing SillyTavern's globally selected preset.
- `reasoning_effort` remains `auto` in the bundled preset so SillyTavern omits the optional parameter instead of guessing a model-specific value.
- Direct OpenAI-compatible requests retry at most once when the endpoint identifies one of Directive's optional top-level generation fields as unsupported. The retry removes only that field.
- No model-name allowlist, compatibility table, migration layer, or provider-specific instruction variant is introduced.

## Request Paths

### Current SillyTavern Chat Completion

Directive calls `ChatCompletionService.processRequest` with the current model and source, exact role-local messages, explicit token and sampling overrides, and `presetName: "Directive"`. SillyTavern applies the preset's generation settings but does not replace the supplied messages with its narration prompt order.

If the service is unavailable, the main API is not Chat Completion, or the bundled preset cannot be resolved, the existing raw-generation fallback remains available. The controlled Chat Completion path is preferred whenever the host exposes it.

### Connection Profile

Directive continues to use `ConnectionManagerRequestService.sendRequest` with `includePreset: true`. The selected profile supplies its generation preset; Directive supplies the exact role-local messages. Structured schemas are forwarded as request payload data.

### Direct OpenAI-Compatible Endpoint

Directive sends the conservative payload it owns. If a non-success response names an optional top-level field that Directive actually sent, Directive removes that field and retries once. Required fields and structured-output contracts are never removed, and a second failure is returned normally.

## Error Handling

- Missing or incompatible host services fall back to the existing raw current-model path.
- Abort and timeout signals remain attached to every attempt.
- Optional-parameter retry is bounded to one additional transport attempt.
- Provider errors continue to include the final HTTP status and bounded response text.
- Visible-output retry remains a separate concern and retains its existing limit.

## Verification

- A current Chat Completion test proves the `Directive` parameter preset is selected while only role-local messages are sent.
- A profile test proves JSON schema forwarding and existing preset inclusion.
- A direct-endpoint test proves one rejected optional field is removed and retried.
- A direct-endpoint test proves required or unknown rejected fields do not trigger retry.
- The full alpha gate must remain green before merge.
