# Comparison Notes

## Before Runtime Evidence

- Desktop screenshot: [mission-recovery-before-desktop.png](mission-recovery-before-desktop.png)
- Phone screenshot: [mission-recovery-before-phone.png](mission-recovery-before-phone.png)
- Layout metrics: [mission-recovery-before-layout.json](mission-recovery-before-layout.json)

Before metrics:

- Desktop: Recovery visible, 0 recovery consoles, 0 status blocks, 0 recovery cards, 1 Save Controls card, 1 action row, 6 bottom tabs, 0 top route tabs, 0 clipped labels.
- Phone: Recovery visible, 0 recovery consoles, 0 status blocks, 0 recovery cards, 1 Save Controls card, 1 action row, 6 bottom tabs, 0 top route tabs, 0 clipped labels.

## Keep

- Save Game and Save As are present and functional.
- Bottom route navigation and Mission-local sub-tabs already have the right ownership.
- The normal state does not expose hidden campaign information.

## Change

- Replace the lone Save Controls card with an intentional LCARS Recovery console.
- Add compact status tiles for save, branch, narration, and outcome state.
- Group Save, Narration Recovery, Last Outcome, and risk actions as separate recovery records.
- Keep Concept C's bottom command shelf direction as the selected visual target.

## Reject

- Top route-menu navigation.
- Destructive controls in the same visual group as routine saves.
- Decorative LCARS blocks that look clickable but do nothing.

## Next Code Pass

- Add Mission Recovery console helpers in `src/ui/mission-panel.js`.
- Add LCARS Recovery CSS in `styles/directive.css`.
- Add visual-system assertions for Recovery console, status tiles, and action grouping.
- Capture after screenshots on desktop and phone-width SillyTavern.

## After Runtime Evidence

- Desktop screenshot: [mission-recovery-after-desktop.png](mission-recovery-after-desktop.png)
- Phone screenshot: [mission-recovery-after-phone.png](mission-recovery-after-phone.png)
- Layout metrics: [mission-recovery-after-layout.json](mission-recovery-after-layout.json)

After metrics:

- Desktop: Recovery visible, 1 recovery console, 4 status blocks, 1 recovery card, 1 Save Controls record, 1 action row, 6 bottom tabs, 0 top route tabs, 0 clipped labels.
- Phone: Recovery visible, 1 recovery console, 4 status blocks, 1 recovery card, 1 Save Controls record, 1 action row, 6 bottom tabs, 0 top route tabs, 0 clipped labels.

## Result

- Recovery now follows Concept C's compact mobile-first direction with a status-first LCARS console.
- Long branch/save names no longer appear in status tiles; they remain in detail rows where wrapping is acceptable.
- Save Game and Save As remain real controls with their original runtime action paths.
- Narration Recovery and Last Outcome records are implemented but were not visible in the captured local state because no pending narration recovery or renderable last-turn payload was present.
- Bottom command shelf navigation remains binding; no top route menu was introduced.
