# Comparison Notes

Status: implemented for the active Ship route.

Evidence:

- Desktop before screenshot: [ship-before-desktop.png](ship-before-desktop.png)
- Phone before screenshot: [ship-before-phone.png](ship-before-phone.png)
- Desktop after screenshot: [ship-after-desktop.png](ship-after-desktop.png)
- Phone after screenshot: [ship-after-phone.png](ship-after-phone.png)

Concept-art note: Concepts A, B, and C were generated inline from [prompt.md](prompt.md). The built-in image tool did not expose new project-copyable PNG files in this environment, so the durable artifact for this iteration is the prompt set, selected target, and runtime before/after evidence.

## Keep

- Bottom route navigation from the shared shell.
- Player-safe ship identity, condition, restrictions, damage, and technical debt.
- Read-only Ship route behavior.

## Change

- Replace tall generic cards with a compact LCARS ship-status console.
- Put ship identity and readiness blocks above long condition prose.
- Replace raw command-structure IDs with readable labels when available.
- Group technical debt as operational caveats.
- Prevent phone-width cutoff, squished text, and awkward label wrapping.

## Reject

- Do not restore top route navigation.
- Do not add fake ship-management controls.
- Do not show hidden system failures or raw source IDs.
- Do not use official Star Trek schematics as runtime assets.

## Next Prompt

- Generate follow-up variants only if long condition text, technical debt, or command structure fail visually in later route-wide reviews.

## Implemented Code Pass

- Implemented Ship LCARS status-console structure.
- Added compact readiness status blocks for class, registry, condition, restrictions, damage, and technical debt.
- Replaced raw command-structure IDs with player-facing crew labels where package data provides them.
- Shortened `Acting XO Before Player` to `Prior Acting XO` after phone verification showed label cutoff.
- Grouped known technical debt as operational caveats.
- Captured desktop and phone screenshots in real SillyTavern.
- Verified live DOM state: 6 readiness blocks, 4 command rows, 3 caveats, no raw command IDs visible, zero visible overflow.

## Next Code Pass

- Apply the same Visual Target Loop process to Log or Settings.
- Revisit Ship only if later package data adds longer registry values, damage entries, restrictions, or command labels that need extra text-fit handling.
