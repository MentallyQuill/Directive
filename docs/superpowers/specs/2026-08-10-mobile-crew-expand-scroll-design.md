# Mobile Crew Expansion Scroll Design

## Problem

On the mobile People route, tapping a crew card calls the panel-level `rerender` callback. `renderCrewPanel` replaces every child of the route body, including `.people-journal-host`, so the newly created scroll owner starts at `scrollTop = 0`. This makes the roster visibly refresh and snap to the top.

## Approved behavior

- Expanding or collapsing a mobile crew card must not replace the People panel or its mobile scroll owner.
- The roster must retain its exact scroll position and the tapped toggle must retain focus.
- Only one mobile crew card may be expanded at a time.
- The selected-person preference must still update.
- The hidden desktop roster and detail must reflect the same selected person so a responsive resize does not reveal stale selection.
- Category editing, reordering, and other structural operations may continue using the existing full rerender path.

## Approaches considered

1. **Local accordion update — selected.** Update the affected card classes, `aria-expanded`, and detail node in place; close the previously open card; persist selection; and synchronize desktop selection. This removes the cause of the refresh and naturally preserves scrolling and focus.
2. **Capture and restore `scrollTop`.** Save the old scroll offset around the full rerender. This would hide most of the jump but still reload portraits, replace focus, and refresh the entire list.
3. **Keyed renderer for the whole People route.** Introduce general DOM reconciliation. This is broader than the defect and adds unnecessary rendering infrastructure.

## Implementation

`createPeopleJournal` will create one render-local mobile accordion state object shared by all mobile records. Each record exposes an in-place expansion setter. A toggle closes the currently open record, opens or closes itself, updates `openMobilePersonByScope`, selects the person through the existing preferences controller, and calls a render-local desktop selection synchronizer instead of `rerender`.

The synchronizer updates desktop row active/pressed state and replaces only the desktop detail pane. Because the desktop composition is hidden at the mobile breakpoint, this cannot change mobile roster geometry.

## Verification

- A DOM-level regression will prove that clicking a mobile toggle does not call `body.replaceChildren`, preserves the scroll owner's `scrollTop`, maintains a single expanded item, and updates desktop selection.
- The mobile browser conformance test will scroll the roster, open a lower crew record, and assert the same scroll owner remains connected with an unchanged scroll offset.
- The complete V1 gate must remain green.
