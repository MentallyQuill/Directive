# Crew Card Drag Threshold Stability Design

## Status

Approved under the existing crew-card drag contract and the standing direction to complete corrective work without additional approval pauses. This design narrows two defects found after the visual correction shipped; ordering, persistence, activation, touch timing, keyboard behavior, and docking timing remain unchanged.

## Proven Defects

- When the pointer crosses the midpoint of the next person card, `relocatePlaceholder()` applies the `170ms` FLIP animation to both the displaced card and the destination slot. Their opposing motion makes the positional outline flicker or panic at the threshold. Transient visual overlap from the real sibling beginning at its old FLIP position over the newly settled slot is expected and is not itself a defect.
- During an active drag, only the original handle's `:active` rule specifies `cursor: grabbing`. The source is replaced by the slot, so the visible cursor comes from the element beneath the pointer and alternates between `pointer` over card controls and `auto` over the slot.

## Corrected Reflow

- The destination slot is positional feedback, not list content. It must relocate directly to the current insertion point and remain visually stationary there.
- FLIP displacement applies only to real reorderable items. Neighboring cards keep the existing `170ms cubic-bezier(.2,.8,.2,1)` glide around the stationary slot.
- Across successive animation frames, the slot's top and left coordinates must remain constant while the adjacent real sibling changes top in the expected direction as it glides away. The sibling may transiently overlap the stationary slot while leaving its old visual position.
- Existing midpoint selection remains authoritative; no hysteresis or delayed destination update is added unless a separate reproducible oscillation remains after the crossing animation is removed.

## Cursor Ownership

- Activation adds one document-root drag-state class. That class forces `cursor: grabbing` for the root and every descendant for the lifetime of the active drag.
- The class is removed on successful docking, invalid release, pointer cancellation, Escape, blur, and immediate/reduced-motion completion.
- The class is shared by person and category dragging because both use the same reorder controller and both represent an active grab.

## Verification

- A real Chromium pointer drag of the player-character card across Mara Whitaker's midpoint must sample two active reflow frames: the slot's top and left stay constant while Mara's visual top changes upward toward her settled position.
- The slot's own Web Animations list must stay empty across both frames while Mara has a running reflow animation.
- Computed cursor must remain `grabbing` over an underlying `.people-row`, the `.people-card-drop-slot`, and the document root during the drag.
- The document-root drag-state class must be absent after every terminal path.
- Desktop and phone active-drag screenshots, immediate docking alignment, reduced motion, category dragging, and the complete alpha gate must remain green.
