# Mobile Campaign Actions and Saved Games Design

**Status:** Approved design

## Goal

Make the active Campaign page feel deliberate on phones by separating the three jobs currently competing in one wrapped button row:

1. continue the current story;
2. create or load a saved game; and
3. permanently delete the campaign.

The change must preserve Directive's existing timeline semantics, failure-closed campaign deletion, desktop usability, and accessible keyboard and screen-reader behavior.

## Approved Direction

Remove the standalone `Save Game`, `Load Game`, and spelled-out `Delete Campaign` buttons from the active-campaign action row.

The active-campaign detail instead presents:

- a dominant `Continue` button;
- a compact campaign-delete icon button using the supplied trash-can-with-X artwork;
- a `Saved Games` heading with a compact `Save` action; and
- individual saved-game rows that are the entry points for loading and deleting those saves.

The controls must not be compressed merely to keep four long labels on one line. Their grouping communicates priority.

## Active Campaign Actions

`Continue` and the campaign-delete icon share one row. `Continue` expands to fill the available width. The delete control is a square icon button with a minimum 44 by 44 CSS-pixel target on phone layouts.

The supplied `delete.svg` contributes its `24 24` view box and path. The imported asset drops its fixed 800-pixel dimensions, black fill, generator comment, and other source-only metadata. Directive renders it with the existing icon-mask or `currentColor` treatment so the control can use the established salmon danger color.

The icon button has:

- accessible name `Delete campaign`;
- a visible tooltip reading `Delete campaign` on pointer hover and keyboard focus;
- no dependency on hover for activation or comprehension on touch devices; and
- no direct destructive behavior.

Activating the icon opens the existing campaign-deletion dialog. The dialog remains the destructive authority: it names the exact SillyTavern character, explains that its chats will be removed, requires the user to type `delete`, and keeps its final Delete action disabled until that confirmation is valid. It remains viewport-bounded and internally scrollable on phones. No campaign data is removed merely by activating the icon.

## Saved Games

The `Saved Games` heading owns save management. A compact `Save` action appears at the trailing edge of that heading and opens the existing named-save dialog. This removes `Save Game` from the primary campaign action row without hiding the feature.

The saved-game list replaces the generic top-level `Load Game` button. Each row presents one concrete save with a human-readable name and secondary chapter, stardate, and creation-date metadata. The row body is the load affordance. Its accessible name makes the action explicit, for example `Load saved game Before Prelude`.

Choosing a row must not switch timelines immediately. It opens a focused load-confirmation dialog for that exact saved game. The confirmation identifies the selected save and retains the existing explanation that loading creates a new timeline while preserving the current timeline automatically. The user must activate the dialog's `Load Game` action to proceed. The dialog does not repeat the complete saved-game picker because selection has already happened in the page.

Each row also exposes a compact saved-game delete control. Activating that control must stop the row's load behavior and retain the existing saved-game deletion confirmation. Its accessible name includes the save name. Saved-game deletion and campaign deletion remain visually and behaviorally distinct.

When no saves exist, the section shows the existing empty-state message and the heading-level `Save` action remains available.

## Responsive Presentation

The same action semantics apply on desktop and mobile so moving between viewports does not change what a control does.

On phones:

- `Continue` and campaign delete remain on one row without wrapping;
- the `Saved Games` heading and `Save` action remain on one row;
- saved-game metadata wraps within the row rather than forcing horizontal overflow;
- every interactive target is at least 44 CSS pixels in both dimensions; and
- the section includes enough bottom padding that the final row is not crowded by Directive's bottom navigation or the device safe area.

On desktop, the compact delete control supplies its tooltip on both hover and keyboard focus. Saved-game rows remain fully operable by keyboard and expose visible focus treatment.

## Interaction and Error Handling

All existing runtime actions and authority boundaries remain in place. This is a presentation and interaction-composition change, not a timeline or storage rewrite.

- `Continue` calls the existing active-chat action.
- `Save` calls the existing save-game dialog and save action.
- A saved-game row passes its exact saved-game ID into the targeted load confirmation, which calls the existing load action only after confirmation.
- A saved-game delete control passes its exact checkpoint ID into the existing delete-save action.
- Campaign delete continues to use the exact campaign, active save, character, and chat binding already enforced by the deletion flow.
- Loading, saving, or deleting shows the existing busy/error behavior. A failed campaign host deletion must leave Directive campaign storage intact.
- Dialog dismissal restores focus to the control that opened it without changing the surrounding Campaign page selection or scroll position.

## Accessibility

Icon-only controls require programmatic labels and must never rely on color or hover text alone. Tooltips appear on focus as well as hover and do not replace `aria-label` values.

Saved-game rows use native buttons or equivalent keyboard-operable controls. Nested delete controls must not create invalid nested-button markup; the row layout uses separate sibling controls within a grid. Enter or Space on the load control opens the load confirmation. Enter or Space on the delete control opens only the saved-game deletion confirmation.

All modal focus, inert-background, Escape, error announcement, and focus-restoration behavior already provided by Directive is preserved.

## Verification

Focused DOM and browser coverage must prove:

1. the active action row contains `Continue` and one campaign-delete icon control, with no standalone Save or Load button;
2. the icon has the correct accessible name, tooltip behavior, danger styling, and mobile target size;
3. the `Saved Games` heading contains the Save action;
4. every saved-game row exposes separate load and delete controls with exact IDs;
5. selecting a row opens a confirmation for that exact save and does not call the load action before confirmation;
6. confirming load calls the existing load action once and explains current-timeline preservation;
7. saved-game deletion cannot trigger loading;
8. campaign deletion still requires typed `delete`, remains failure-closed, and fits a phone viewport;
9. the layout does not wrap or overflow at the certified phone widths, including a narrow viewport; and
10. keyboard focus order, Escape dismissal, focus restoration, and screen-reader labels remain correct.

The full `npm.cmd test` gate must pass after the focused campaign, timeline-dialog, deletion-dialog, and responsive visual tests.

## Non-Goals

This design does not change save serialization, timeline branching, campaign deletion ordering, campaign data, authored copy outside save presentation, or the Campaign Library's package-selection behavior. Broader hero, navigation-rail, and campaign-metadata refinements can be considered separately after this action hierarchy is shipped and evaluated on a real phone.
