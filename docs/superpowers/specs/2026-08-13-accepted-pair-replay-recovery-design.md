# Accepted-Pair Replay Recovery Design

## Goal

Prevent a provider failure during accepted-pair replay from trapping the player in a zero-attempt narration modal whose Retry action cannot resume replay.

## Scope

- Preserve Story Settlement as a fail-closed narration gate.
- Reuse the existing in-memory `acceptedPairReplayNeeded` authority flag; add no save fields, sidecars, migrations, or parallel trackers.
- Keep the existing persistence retry behavior unchanged.
- Let the player dismiss the presentation layer without clearing runtime authority or starting narration.

## Runtime Behavior

`retryPendingAcceptedPairSettlement()` remains the bridge-facing recovery entry point. When a persistence settlement object exists, it follows the existing source-attested persistence retry path. When no persistence object exists but replay is pending, it rebuilds accepted state from the complete active bound chat and succeeds only when replay finishes without a blocked pair. With neither recovery condition present, it continues to return `no-pending-settlement`.

The SillyTavern bridge continues host generation only after the recovery entry point returns `ok: true`. A provider failure during replay therefore keeps narration blocked while preserving already completed replay work.

## Dialog Behavior

The modal distinguishes persistence and replay copy. Replay failures do not claim that persistence was attempted zero times. Retry remains available. Close, Escape, or a backdrop click dismisses the modal so the player can adjust provider configuration or reload; dismissal does not mutate campaign state and the next generation remains guarded by the runtime.

## Testing

- Runtime regression: replay-pending recovery invokes complete-chat replay when no persistence object exists and returns success only after the replay clears.
- Bridge regression: a zero-attempt replay dialog Retry reaches replay recovery and continues canonical host generation on success.
- Dialog regression: replay copy omits the misleading attempt count; Close, Escape, and backdrop clicks dismiss the overlay; and persistence copy remains unchanged.
- Full V1 alpha gate remains green.
