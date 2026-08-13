# Focused Campaign Dashboard and Browser Design

**Status:** Approved design

## Goal

Make the Campaign tab focus on the campaign the player is actively playing. Saved games and the Campaign browser remain available on demand instead of permanently competing with the active campaign for space.

The change must preserve Directive's existing timeline semantics, campaign-library presentation, failure-closed deletion, responsive behavior, and accessible keyboard and screen-reader operation.

## Approved Information Architecture

The Campaign tab has two presentation modes:

1. **Active Campaign Dashboard** - the default whenever an active campaign exists.
2. **Campaign Browser** - opened explicitly through a `Campaigns` control, or shown automatically when no active campaign exists.

The dashboard does not render the persistent `Your Stories`, `Campaign Library`, or saved-game lists. This removes low-value choices from the player's ordinary play surface while retaining every workflow behind an intentional control.

`Campaigns`, rather than `New Campaign`, is the browser label because the destination supports both existing stories and new Campaign Library packages.

## Active Campaign Dashboard

The dashboard presents the selected active campaign's existing identity, hero artwork, player-facing summary, and current status. A compact dashboard heading identifies it as the current campaign and places the `Campaigns` browser control at the trailing edge.

The action hierarchy is:

- `Continue` as the dominant primary action;
- `Save Game` and `Load Game` as equal secondary actions; and
- an icon-only campaign-delete control using the supplied trash-can-with-X artwork.

Desktop has enough width to keep Continue, Save Game, Load Game, and the square delete control in one aligned action row. Phone layouts use two deliberate rows: Continue plus the delete icon on the first row, then equal-width Save Game and Load Game controls on the second. The layout must use a responsive grid rather than incidental flex wrapping.

`Load Game` is disabled when the campaign has no saved games. No saved-game rows appear on the dashboard.

## Load and Save Dialogs

`Load Game` opens Directive's existing AAA-style load dialog on desktop and mobile. The dialog:

- explains that loading creates a new timeline while preserving the current timeline automatically;
- lists every saved game for the exact selected campaign;
- displays each save's human-readable name plus chapter, stardate, and creation date;
- requires the player to select a save before enabling its final `Load Game` action; and
- calls the existing load action with the exact selected saved-game ID only after confirmation.

The list is local to the dialog and may scroll independently. It must remain bounded by the dynamic viewport on phones. Closing it restores focus to the dashboard's Load Game control.

`Save Game` continues to open the existing named-save dialog. Successful save refreshes the dashboard so Load Game becomes enabled when the first save is created. Saved-game deletion remains available within the load-management surface rather than returning a persistent save list to the dashboard. Its confirmation and exact checkpoint targeting remain intact.

## Campaign Delete Control

The supplied `delete.svg` contributes its `24 24` view box and path. The imported asset drops fixed 800-pixel dimensions, black fill, generator comment, and source-only metadata. Directive renders it through the established icon-mask or `currentColor` treatment with the salmon danger color.

The dashboard control is a square icon button with a minimum 44 by 44 CSS-pixel target on phones. It has accessible name `Delete campaign` and a visible `Delete campaign` tooltip on pointer hover and keyboard focus. Touch comprehension does not depend on the tooltip because activating the icon only opens the fully labeled confirmation dialog.

The existing campaign-deletion dialog remains the destructive authority. It names the exact SillyTavern character, explains that its chats will be removed, requires typed `delete`, and keeps the final Delete action disabled until valid. Host deletion remains first and failure-closed; Directive storage is retained if host deletion fails.

## Campaign Browser

Activating `Campaigns` replaces the dashboard with the existing Campaign browser inside the Campaign tab. It is a tab subview, not a modal:

- desktop retains the existing master/detail browser the user approved;
- mobile retains the existing single-open disclosure browser;
- `Your Stories`, Campaign Library packages, availability states, artwork, descriptions, and player-safe campaign facts remain unchanged; and
- future campaigns remain selectable previews whose activation is disabled.

When an active campaign exists, the browser includes a `Back to Current Campaign` control. Returning restores the same dashboard campaign without mutating campaign or timeline state. Browsing records changes only browser selection; it does not silently activate, load, or switch a campaign.

When no active campaign exists, the Campaign tab opens directly in browser mode and omits the back control. Starting or resuming campaign setup continues through the existing creator flow. Once a campaign becomes active, returning to the Campaign tab defaults to its dashboard.

## State and Authority Boundaries

Dashboard-versus-browser mode is presentation state owned by the Campaign panel. It must not become campaign persistence, timeline state, or a second active-campaign authority. Each render derives the active campaign from the certified campaign view.

Existing actions remain authoritative:

- Continue opens the exact active campaign chat.
- Save Game creates a saved game through the existing save action.
- Load Game passes the selected saved-game ID through the existing load action.
- Campaign deletion uses the exact campaign, active save, character, and chat binding already enforced by the deletion controller.
- Browser package actions continue to start or resume the existing creator draft.

Dialog dismissal and browser navigation preserve the Campaign tab's surrounding scroll and focus context where applicable. Runtime refresh after save, load, creation, or deletion re-derives the correct mode from current certified state rather than trusting stale UI state.

## Accessibility and Responsive Requirements

- All phone interaction targets are at least 44 CSS pixels in both dimensions.
- Icon-only controls have programmatic labels and never rely on color or hover text alone.
- Tooltips appear on keyboard focus as well as pointer hover.
- Dashboard grids do not wrap accidentally or overflow at certified desktop and phone widths.
- Load-dialog rows are native buttons or equivalent keyboard-operable controls with `aria-pressed` selection state.
- Existing modal focus containment, inert background, Escape handling, error announcements, and opener-focus restoration remain intact.
- Campaign browser controls expose the current subview and return action clearly to assistive technology.

## Verification

Focused DOM and browser coverage must prove:

1. an active campaign defaults to the dashboard on desktop and mobile;
2. the dashboard omits persistent story, Campaign Library, and saved-game lists;
3. desktop renders one aligned action row and mobile renders the intentional two-row grid without overflow;
4. Continue, Save Game, Load Game, and delete preserve their exact action targets;
5. Load Game opens the complete saved-game picker, stays disabled until selection, and does not load before confirmation;
6. the load dialog fits and scrolls within desktop, phone, and narrow-phone viewports;
7. Campaigns opens the existing desktop master/detail browser and mobile disclosure browser;
8. Back to Current Campaign restores the dashboard without a runtime mutation;
9. no active campaign defaults directly to browser mode without a back control;
10. the delete icon has the approved asset, accessible name, tooltip, danger styling, and phone target size;
11. campaign deletion still requires typed `delete` and remains failure-closed; and
12. focus order, Escape dismissal, focus restoration, labels, and browser subview state are correct.

The full `npm.cmd test` gate must pass after focused campaign-panel, timeline-dialog, deletion-dialog, accessibility, and responsive visual tests.

## Non-Goals

This design does not change save serialization, timeline branching, campaign activation authority, campaign deletion ordering, campaign content, creator behavior, or the approved Campaign Library detail presentation. It does not add a modal Campaign Library or a second persisted campaign-selection model.
