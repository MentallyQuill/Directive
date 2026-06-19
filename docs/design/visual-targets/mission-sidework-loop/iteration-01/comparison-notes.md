# Comparison Notes

## Before Runtime Evidence

- Desktop screenshot: [mission-sidework-before-desktop.png](mission-sidework-before-desktop.png)
- Phone screenshot: [mission-sidework-before-phone.png](mission-sidework-before-phone.png)
- Layout metrics: [mission-sidework-before-layout.json](mission-sidework-before-layout.json)

Before metrics:

- Desktop: Side Work visible, 0 support cards, 0 candidate rows, 0 action rows, 6 bottom tabs, 0 top route tabs, 0 clipped labels.
- Phone: Side Work visible, 0 support cards, 0 candidate rows, 0 action rows, 6 bottom tabs, 0 top route tabs, 0 clipped labels.

## Keep

- The Mission page already uses bottom route navigation and page-local Mission sub-tabs.
- The empty Side Work state is reachable and does not leak hidden campaign information.

## Change

- Replace the plain `Side Work` / `No side work is active.` fallback with an intentional LCARS console.
- Add compact status tiles so the player can tell whether Open Orders, Follow-Ups, active work, or progress intervals exist.
- Restyle candidate, scheduled, active, and progress records as Side Work cards instead of generic metadata rows.
- Keep Concept C's bottom command shelf direction as the selected visual target.

## Reject

- Top route-menu navigation.
- Decorative LCARS blocks that look clickable but do nothing.
- Side Work layouts that overpower the main Mission command flow.

## Next Code Pass

- Add Mission Side Work console helpers in `src/ui/mission-panel.js`.
- Add LCARS Side Work CSS in `styles/directive.css`.
- Add visual-system assertions for the new Side Work classes and bottom command shelf rule.
- Capture after screenshots on desktop and phone-width SillyTavern.

## After Runtime Evidence

- Desktop screenshot: [mission-sidework-after-desktop.png](mission-sidework-after-desktop.png)
- Phone screenshot: [mission-sidework-after-phone.png](mission-sidework-after-phone.png)
- Layout metrics: [mission-sidework-after-layout.json](mission-sidework-after-layout.json)

After metrics:

- Desktop: Side Work visible, Side Work console present, 4 status blocks, 1 intentional empty state, 0 support cards, 6 bottom tabs, 0 top route tabs, 0 clipped labels.
- Phone: Side Work visible, Side Work console present, 4 status blocks, 1 intentional empty state, 0 support cards, 6 bottom tabs, 0 top route tabs, 0 clipped labels.

## Result

- The third concept's compact mobile-first direction is now the implementation bias for this surface.
- The runtime no longer treats Side Work as a plain fallback sentence.
- Bottom command shelf navigation remains binding; no top route menu was introduced.
- The live empty state is accepted for this iteration. Active Open Orders and Follow-Up cards are implemented in source and covered by the side-mission action tests, but the local host state captured here did not currently contain active side work.
