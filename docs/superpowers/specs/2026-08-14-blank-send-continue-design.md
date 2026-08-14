# Blank Send Continue Design

## Goal

When a player activates SillyTavern's Send control with no message in the exact chat bound to an active Directive campaign, submit a visible `Continue.` player message through SillyTavern's normal send pipeline.

## Behavior

- Treat an empty or whitespace-only send textarea as blank.
- Normalize a blank Send to the exact text `Continue.`.
- Dispatch SillyTavern's normal bubbling `input` event after normalization.
- Let SillyTavern's existing Send handler perform submission and generation.
- Apply only while Directive is enabled and the exact current chat binding matches the active campaign binding.
- Skip normalization when a file attachment is pending.
- Leave nonblank messages, unbound chats, disabled Directive sessions, and SillyTavern's explicit native Continue control unchanged.
- Cover mouse, touch, and keyboard activation of the Send control through its native `click` event. Plain Enter in the textarea remains governed by SillyTavern's send-on-enter preference.

## Architecture

Add a small SillyTavern host-boundary module that owns blank-Send normalization and its document listener. The listener runs in the capture phase for clicks targeting `#send_but`, so it can update the textarea before SillyTavern's existing Send handler reads it without preventing or duplicating the native action.

The runtime app exposes a synchronous read-only `isCurrentChatBound()` query backed by its existing exact binding comparison. The normalizer consults that query through the existing runtime bridge, checks the current textarea and file input, writes `Continue.`, and emits `input`. Lifecycle installation and disposal remain owned by SillyTavern runtime activation and shell teardown.

## Failure and Coexistence Rules

The normalizer fails open. Missing DOM nodes, unavailable runtime state, malformed targets, or dispatch limitations leave SillyTavern behavior unchanged. It never prevents propagation, stops the event, calls generation directly, mutates Directive campaign state, or changes SillyTavern preferences. Other extensions continue receiving the original click and the resulting input event.

## Testing

Add focused host tests that first fail without the new behavior and then prove:

- empty and whitespace-only bound sends become `Continue.` and emit one input event;
- nonblank text remains unchanged;
- pending attachments remain unchanged;
- disabled or unbound Directive sessions remain unchanged;
- unrelated click targets and explicit Continue controls remain unchanged;
- installation is idempotent and disposal removes the capture listener;
- the runtime binding query returns the existing exact binding result.

Run the focused host test, then the complete Directive alpha gate.
