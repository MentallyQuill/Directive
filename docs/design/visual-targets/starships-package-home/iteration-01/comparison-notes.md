# Comparison Notes

Status: first runtime pass implemented and checked in real SillyTavern at `http://127.0.0.1:8000/`.

Live evidence:

- Desktop screenshot: [live-sillytavern-desktop-bottom-nav.png](live-sillytavern-desktop-bottom-nav.png)
- Phone-width screenshot: [live-sillytavern-phone-bottom-nav.png](live-sillytavern-phone-bottom-nav.png)
- Served SillyTavern source check passed with `bottomNavigationSource: true`.
- In-app browser geometry check found `data-directive-shell="bottom-navigation"` on desktop and phone width.
- Real bottom-route clickthrough passed for Starships, Mission, Crew, Ship, Log, and Settings with non-empty panel content.

## Keep

- Bottom route navigation as the shared shell rule. It matches the selected Concept C direction and reads correctly in the live SillyTavern panel.
- Top shell reserved for Directive identity plus Back/Close controls.
- Starships hierarchy: status blocks first, package identity, one primary command zone, readiness rows, then secondary package/library actions.
- Active route tabs remain route tabs; Close stays a separate explicit action.
- LCARS color and segmented rail language should remain structural, not decorative filler.

## Change

- Add state variants to the next prompt set. The live host currently has drafts and saves, so the correct primary command is `Load Save`; a fresh install should still target `Start Campaign`.
- Tighten the phone Starships card density. The primary command is readable, but the readiness and metadata rows need more breathing room in the next pass.
- Improve long-label behavior for readiness blocks such as `Mission Graphs`; the live desktop card truncates the label in the narrow block.
- Consider reducing the active bottom-tab glow on phone width so the active route reads as selected without overpowering adjacent routes.

## Reject

- Do not restore top route navigation.
- Do not make the active route double as Exit/Close.
- Do not add decorative LCARS panels that look clickable without a real action.
- Do not let import diagnostics or library metadata outrank the next safe command.

## Next Prompt

- Generate separate Concept C variants for fresh package state, active-save state, and draft-resume state.
- Ask GPT Image 2 to preserve bottom route navigation, explicit Back/Close controls, and a UX-first LCARS hierarchy.
- Include a phone-width version where readiness rows wrap cleanly and bottom tabs remain readable without label clipping.

## Next Code Pass

- Apply the same LCARS/bottom-navigation treatment to Mission next, using a dedicated Visual Target Loop target.
- Tune responsive Starships spacing and long-label handling after Mission has a matching shell vocabulary.
- Add a visual smoke assertion for the active bottom route remaining a route label, not `Exit`.
