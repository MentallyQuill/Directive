# Campaign Action Alignment Design

## Goal

Clean up the phone Campaign dashboard action dock without flattening its visual hierarchy.

## Layout contract

- Continue remains the wide primary action on row one.
- Delete campaign remains a compact 44 px square action on row one.
- Save Game and Load Game remain equal-width actions on row two.
- Delete campaign's right edge aligns with Load Game's right edge.
- The horizontal gap between Continue and Delete campaign matches the horizontal gap between Save Game and Load Game.
- Existing action order, labels, icons, enabled states, focus behavior, dialogs, and desktop layout remain unchanged.

## Implementation

Keep the existing Campaign dashboard DOM and grid. In the phone media query, change only the dashboard-scoped absolute right inset for Delete campaign from 12 px to the dock's existing 20 px right padding. This preserves the current 7 px grid gap and all existing control proportions.

## Verification

Extend the existing Playwright visual-conformance geometry assertions at the certified 390 x 844 touch viewport. Assert that Delete campaign and Load Game share a right edge and that the two horizontal gaps match within one CSS pixel. Run the focused visual-conformance suite and the repository's full test gate.
