# Campaign Deletion Design

## Goal

Let a user permanently delete a saved Directive campaign from its selected Campaigns-page detail. Deletion removes the exact SillyTavern character card owned by that campaign, all chats owned by that character, and the campaign's active save and checkpoints from Directive V1 storage.

## Scope And Boundaries

This feature applies only to saved/current V1 campaign records. Campaign Library packages, in-progress creator drafts, checkpoint deletion, and legacy saves remain unchanged.

Directive must use the exact `campaignChatBinding` stored by the selected active save. It must not infer a character from a display name, current host selection, chat filename, legacy data, or another campaign. A campaign without a complete character binding cannot be deleted through this control and must report an actionable error without removing Directive storage.

## Campaign Detail Action

When a saved campaign is selected, its primary action row contains:

1. `Continue` on the left when the campaign can open its chat.
2. `Delete` immediately to the right on the same line.
3. `Save checkpoint` after those actions when the current campaign can be saved.

The Delete control uses the existing danger-action presentation. It is available for both current and saved campaign records because the selected record, not the current chat, is authoritative.

## Confirmation Modal

Selecting Delete opens a Directive-native modal mounted through the shared modal root. The modal dims and blurs the Directive interface, marks the Directive runtime panel inert, uses `role="dialog"` and `aria-modal="true"`, traps keyboard focus, and returns focus to the Delete opener when dismissed.

The modal says that deletion is permanent and explicitly warns:

> This will delete the SillyTavern character card named **<character name>** and all of its chats.

The character name comes from the selected campaign's exact stored binding. The user must type `delete`, with surrounding whitespace ignored and case ignored, to enable the destructive Delete button. Cancel, the close control, and Escape dismiss the modal before deletion begins.

While deletion is running, the input and all modal controls are disabled, dismissal is blocked, and the destructive button communicates a deleting state. On failure, the modal remains open, restores its controls, and shows an alert without claiming success.

## Deletion Data Flow

Deletion is a two-phase operation:

1. Resolve the selected active save, all checkpoints whose `campaignId` and `parentSaveId` belong to it, and the exact character binding. Validate that the binding is a SillyTavern character with an entity ID and character name.
2. Ask the SillyTavern host adapter to delete that exact character through SillyTavern's exported `deleteCharacter` function with `{ deleteChats: true }`. This closes the selected chat safely, refreshes SillyTavern's character UI, and emits its normal character/chat deletion events.
3. Only after host deletion succeeds, delete the campaign's checkpoint records and active save from Directive V1 storage, clear controller/runtime active state when applicable, and refresh the Campaigns view.

Calling the host's core deletion function is required. A raw `/api/characters/delete` request is insufficient because it bypasses live host cleanup and events. Deleting known chats one by one is also insufficient because the character owns the complete chat directory.

If host deletion fails or is unavailable, Directive storage is unchanged. If local storage cleanup fails after the host has deleted the character, the operation reports that exact partial failure and keeps the modal open; it does not fabricate rollback of a character card that no longer exists.

## Post-Deletion State

After complete success:

- the modal closes;
- Directive remains open on the Campaigns page;
- the deleted saved campaign no longer appears;
- the Ashes of Peace Campaign Library package becomes the selected detail;
- the runtime has no active campaign state or active save;
- no opening content, prompt rebuild, or campaign chat creation occurs.

## Accessibility And Responsive Behavior

The action row may wrap only when the viewport cannot fit its controls, preserving the requested Continue/Delete adjacency whenever both render. The modal fits within supported desktop and phone viewports, its body scrolls locally if needed, and its input has a visible label describing the required word. Disabled state is represented with native `disabled` semantics, not color alone.

## Verification

Focused tests must prove:

- the selected campaign view exposes its exact character name from current V1 state;
- Continue and Delete render in that order in the same action row;
- the modal warning names the exact card and all chats;
- `delete` unlocks the destructive action with any letter case and surrounding whitespace, while other text does not;
- cancel and Escape leave the campaign unchanged;
- the host adapter invokes SillyTavern's core character deletion with chat deletion enabled;
- host failure preserves all Directive saves;
- success removes the active save and every checkpoint for the selected campaign but no unrelated save;
- runtime state clears and Campaigns lands on the Ashes library detail;
- the complete alpha gate remains green.

Browser layout verification must cover desktop and phone widths, visible dimming, dialog bounds, Continue/Delete order, and an enabled destructive state.

## Non-Goals

- Recovering deleted character cards or chats.
- Supporting legacy saves or inferred character ownership.
- Adding bulk campaign deletion.
- Deleting Campaign Library packages or creator drafts.
- Reusing checkpoint chat deletion for whole-character cleanup.
