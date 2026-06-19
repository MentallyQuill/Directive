# Comparison Notes

Visual Target Unit: Settings and State Safety

Iteration: 01

Selected Concept: Concept C, compact mobile-first LCARS

Runtime Evidence:

- Before desktop: `settings-before-desktop.png`
- Before phone: `settings-before-phone.png`
- After desktop: `settings-after-desktop.png`
- After phone: `settings-after-phone.png`

## Before Implementation

- The current Settings page uses readable but generic stacked cards.
- Phone width buries Safety, Packs, and Assist below passive runtime metadata.
- Bottom route navigation is already correct and should remain binding.
- The page needs route-local sub-tabs to match the selected concept and reduce scroll pressure.

## Match

- Settings now renders as a single LCARS control console instead of a generic vertical stack.
- The first viewport shows compact status tiles, route-local sub-tabs, and the active Safety pane.
- State Safety is the first active pane card and exposes Verify Active Save, Settle Active State, Export Active Save, and Clean Missing Records immediately.
- Systems, Packs, and Assist remain mounted as local sub-tabs.
- Bottom route navigation remains the only route navigation; no top route tabs were reintroduced.
- Live desktop and phone DOM checks reported no horizontal overflow.

## Mismatch

- Generated concept images implied even tighter phone density than the runtime can safely support with the current SillyTavern shell header and bottom action bars.
- Provider Assist may resolve to an empty state when no diagnostics or eligible candidates are available, which is correct runtime behavior but visually quieter than the concept art.

## Runtime Problems

- None accepted as blockers for this iteration.
- The phone screenshot cuts off at normal viewport scroll continuation below the State Safety metadata, but the command buttons themselves fit and are visible.

## UX Check

- The highest-risk Settings controls are now first in the active Safety pane.
- Long action labels wrap inside their buttons instead of clipping.
- Passive runtime metadata moved behind the Systems sub-tab.

## LCARS Check

- Status tiles, asymmetric left rails, segmented sub-tabs, and rounded command rows now carry the LCARS identity structurally.
- Decorative LCARS elements do not act as fake controls.

## Player-Safety Check

- No raw hidden values, hidden relationship labels, or unrevealed campaign state were introduced.
- Provider diagnostics remain isolated to Settings.

## Keep

- Existing Settings action labels and behavior.
- Existing bottom route navigation.
- Theme Pack and Icon Pack preview data.
- Provider Assist diagnostics in Settings rather than Mission.

## Change

- Convert the stack into a single LCARS Settings console.
- Add compact status tiles near the top.
- Add page-local sub-tabs for Systems, Safety, Packs, and Assist.
- Give Safety controls a clearer operator-command layout.

## Reject

- Top route navigation.
- LCARS decoration that looks like disabled controls.
- Huge labels, clipped action text, or dense rows that wrap into unreadable blocks.

## Next Iteration

- Continue the Visual Target Loop on the next remaining dense surface.
- If Settings receives more controls, split State Safety and Storage Diagnostics into separate Safety sub-panes rather than returning to a long stack.
