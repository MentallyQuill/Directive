# Comparison Notes

Status: implemented for the active Mission state; pending outcome, warning confirmation, and active Open Orders still need targeted follow-up concepts.

Evidence:

- Desktop before screenshot: [mission-before-desktop.png](mission-before-desktop.png)
- Phone before screenshot: [mission-before-phone.png](mission-before-phone.png)
- Desktop after screenshot: [mission-after-desktop.png](mission-after-desktop.png)
- Phone after screenshot: [mission-after-phone.png](mission-after-phone.png)

## Keep

- Bottom route navigation from the shared shell.
- Mission, save, preview, and recovery actions remain real runtime controls.
- Player-safe mission objectives and active directives remain visible.

## Change

- Replace the tall generic mission metadata card with compact LCARS status blocks.
- Move Player Action higher in the hierarchy.
- De-emphasize long outcome IDs and timestamps.
- Reduce generic card typography and improve modern compact text scale.
- Prevent phone-width cutoff, squished text, and awkward label wrapping.
- Treat the third concept's bottom route navigation as the permanent shell direction.
- Use Mission-local sub-tabs for dense operational sections instead of moving route navigation to the top.

## Reject

- Do not restore top route navigation.
- Do not hide required save/recovery actions.
- Do not use fake LCARS controls.
- Do not leak hidden state or raw provider output.

## Next Prompt

- After implementation, generate follow-up Mission variants only for specific weak states: pending outcome, warning confirmation, and active Open Orders.

## Implemented Code Pass

- Implemented Mission LCARS console structure.
- Captured desktop and phone screenshots in real SillyTavern.
- Added compact Mission sub-tabs for Command, Context, Side Work, and Recovery.
- Moved Save/Recovery controls out of the first command viewport while keeping them available under Recovery.
- Verified the Side Work tab resolves to a real empty state when no side work is active.
- Recorded the bottom-navigation decision as binding for runtime-shell visual targets.

## Next Code Pass

- Generate and compare targeted variants for pending outcome, warning confirmation, and active Open Orders.
- Verify sub-tab click paths in live SillyTavern after each state-specific pass.
