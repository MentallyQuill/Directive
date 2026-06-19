# UI Source

Reusable UI kit modules and panel renderers.

Render modules should not call providers directly or perform storage writes.

Shared shell:

- `directive-routes.mjs`: host-neutral primary route metadata.
- `directive-compact-shell.js`: compact shared frame with desktop top navigation/top-right shell actions and phone bottom navigation. Host adapters mount this shell; panel renderers fill its body.

Shell-level navigation belongs to the shared shell. Desktop and shelf layouts use top navigation and top-right actions; phone-width SillyTavern uses the shared mobile bottom route bar and shell action strip. Panel renderers should not add their own bottom navigation, bottom-right floating actions, or host-specific close/open controls.

Current runtime panels:

- `starships-panel.js`: package cards, creator draft resume, and save load actions.
- `character-creator-panel.js`: package-owned player-character creation flow.
- `mission-panel.js`: read-only initialized mission state plus Save Game and Save As actions.
- `crew-panel.js`: senior crew roster from active campaign state and package context, with hidden raw relationship values.
- `ship-panel.js`: ship condition and technical debt from active campaign state and package context.
- `command-log-panel.js`: player-facing committed Command Log entries.
- `settings-panel.js`: simulation mode, package version, save pointer, and current Command Bearing reserve summary.
