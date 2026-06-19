# Comparison Notes

Visual Target Unit: Mobile shell/navigation states

Iteration: 01

Selected Concept: Concept C, compact implementation target

Runtime Evidence:

- Before phone: `mobile-shell-before-phone.png`
- After phone: `mobile-shell-after-phone.png`
- After desktop: `mobile-shell-after-desktop.png`

## Before Implementation

- Phone route navigation is correctly on the bottom.
- After moving from Starships to Mission, Back appears as a separate 53px strip above the 68px route bar.
- The two stacked shell bars visually compete and reduce page content height.
- Route labels fit, and no top route tabs are present.

## Match

- Phone Back is now mounted inside the bottom route shelf as a narrow left segment.
- The separate Back strip above the route tabs is gone.
- Phone body height increased from 675px to 728px in the Back-enabled Mission state.
- Bottom route count remains six.
- Mission remains the active route and Back remains enabled after route navigation.
- Back is still hidden on desktop, where the top-right global Back/Close model remains active.
- Live 390px label metrics reported no clipped route labels, including Starships and Settings.
- No top route tabs were introduced.
- No horizontal overflow was reported.

## Mismatch

- The route labels are necessarily smaller when Back is visible, because 390px must fit Back plus six routes in one shelf.
- This is an accepted UX tradeoff for removing the second bottom bar and reclaiming content height.

## Runtime Problems

- None accepted as blockers for this iteration.

## UX Check

- The bottom shelf now has one navigation layer instead of two stacked shell bars.
- Back is visually subordinate to the route tabs while remaining touch-safe and reachable.
- Content gains vertical room in the Back-enabled state.

## LCARS Check

- The bottom shelf reads as one segmented LCARS command rail.
- Back uses a coral auxiliary segment; active route uses the amber route treatment.
- Decorative shelf structure does not masquerade as unavailable controls.

## Keep

- Bottom route navigation.
- Six route tabs and their route IDs.
- Back history behavior.
- Top-right desktop/global actions.

## Change

- Move the phone Back action into the bottom shelf as an auxiliary LCARS segment.
- Keep the bottom shelf a single visual band.
- Preserve readable route labels at 390px width.

## Reject

- Top route navigation.
- A second bottom shell bar.
- Back as a full-width row.
- Clipped labels or overlapping body content.

## Next Iteration

- Continue the Visual Target Loop on the remaining runtime surfaces and feature states.
- If more global shell actions are added later, they should become compact auxiliary shelf segments or remain top-right global actions; do not add another full-width bottom bar.
