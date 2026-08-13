# Save Game Completion Feedback Design

## Problem

The Save Game dialog currently awaits both durable save creation and a full Campaign-panel refresh before it closes. A save can therefore be complete and loadable while the dialog still shows a disabled Save Game button. Cancel then appears to be the only available action, and the already-rendered Load Game dialog can still show its pre-save list.

## Interaction Contract

Save Game has three explicit states:

- Ready: the player can edit the name, cancel, or start the save.
- Saving: the primary action reads `Saving...` and is disabled while durable persistence is pending; the secondary action reads `Close` because closing the dialog cannot cancel accepted runtime work.
- Failed: the dialog remains open, displays the save error in an assertive alert, and restores the Save Game action for retry.

Durable persistence is the success boundary. Once `actions.saveGame` resolves, the dialog closes immediately and restores focus to its opener. Campaign-panel refresh happens only after that close and cannot keep a completed save looking pending.

Cancel is available before persistence starts. Once the runtime accepts the operation, that action becomes Close and dismisses only the dialog. The persisted saved-game name remains exactly the trimmed player input.

## Component Boundary

`createSaveGameDialog` owns pending, success-close, and failure presentation. It accepts an optional `onSaved` callback that runs only after the overlay is removed. `campaign-panel.js` passes `actions.saveGame` as the authoritative persistence callback and performs `actions.refresh` through `onSaved`.

The existing Load Game behavior remains unchanged. A newly opened Load Game dialog uses the refreshed Campaign view and contains the new checkpoint.

## Error Handling

Persistence rejection is caught inside the Save Game dialog so it does not become an unhandled UI event. The error message is shown without closing the dialog. Refresh failure occurs after persistence success and therefore must not reopen or retain the Save Game dialog; the existing runtime refresh path remains responsible for rendering refresh errors.

## Verification

Focused dialog tests will prove that:

- the pending label is visible while persistence is unresolved;
- persistence success removes the dialog before post-save refresh begins;
- refresh completion is not required for the dialog click handler to resolve; and
- persistence failure leaves the dialog open with an alert and retryable controls.

Campaign-panel tests will continue to certify the exact Save Game action payload and refreshed saved-game presentation. The full project test gate will check for regressions.
