# SillyTavern Message Edit Release Design

## Goal

Let SillyTavern finish or cancel a native message edit immediately while Directive reconciles edited campaign authority in the background.

## Root Cause

SillyTavern awaits every `MESSAGE_EDITED` listener before it emits `MESSAGE_UPDATED`, clears its global edit id, and saves the chat. Directive currently returns its full invalidation and accepted-pair replay promise from that listener, so the native editor remains open for the duration of replay. It then routes the following `MESSAGE_UPDATED` event through the same edit handler and repeats the replay.

## Event Boundary

`handleMessageEdited()` schedules `runtimeApp.handleHostMessageEdited()` and immediately returns a handled/scheduled result. Rejections remain visible through Directive's existing warning channel. The runtime operation itself stays on `settlementQueue`; this changes host callback ownership, not campaign authority ordering.

The shell records the edited host message id until the one immediately following `MESSAGE_UPDATED` event for that id. That paired update is acknowledged without scheduling a second invalidation. An independent `MESSAGE_UPDATED` event still schedules `handleHostMessageVisibilityChanged()` so native visibility changes continue to invalidate source authority.

## Authority Safety

The runtime exposes `handleHostMessageVisibilityChanged()` through the same `invalidateSource()` path as edits, with a distinct event type. Both operations remain serialized with accepted-pair settlement. `interceptGeneration()` already awaits `settlementQueue` before it reads or projects campaign state, so narration cannot cross a pending edit or visibility reconciliation.

No save schema, campaign projection, source-history format, or accepted-pair rule changes.

## Testing

- A pending runtime edit promise cannot keep the shell edit callback pending.
- The update paired with an edit schedules no second invalidation.
- An independent update still schedules visibility reconciliation without blocking the host callback.
- A runtime edit queued behind the shell boundary still delays generation until reconciliation completes.
- The full V1 gate and a live Playwright edit of the latest Sam Vickers chat remain green.
