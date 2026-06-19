# UI Source

Reusable UI kit modules and panel renderers.

Render modules should not call providers directly or perform storage writes.

Shared shell:

- `directive-routes.mjs`: host-neutral primary route metadata.
- `directive-compact-shell.js`: compact top-control frame with top navigation and top-right shell actions. Host adapters mount this shell; panel renderers fill its body.

Shell-level navigation and global actions are top-control only. Panel renderers should not add bottom navigation, bottom-right floating actions, or host-specific close/open controls; use the shared top-right action cluster for global controls and scroll-local rows only for content-specific decisions.

Current runtime panels:

- `starships-panel.js`: package cards, creator draft resume, and save load actions.
- `character-creator-panel.js`: package-owned player-character creation flow.
- `mission-panel.js`: read-only initialized mission state plus Save Game and Save As actions.
- `crew-panel.js`: senior crew roster from active campaign state and package context, with hidden raw relationship values.
- `ship-panel.js`: ship condition and technical debt from active campaign state and package context.
- `command-log-panel.js`: player-facing committed Command Log entries.
- `settings-panel.js`: simulation mode, package version, save pointer, and current Command Bearing reserve summary.
