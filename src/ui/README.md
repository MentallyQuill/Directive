# UI Source

Reusable UI kit modules and panel renderers.

Render modules should not call providers directly or perform storage writes.

Render modules that keep module-level UI state must export a reset hook and wire it into `resetDirectiveRuntimeLayout()` so the SillyTavern Extensions menu **Reset Window** action restores default route-local UI. See `docs/development/RESET_WINDOW_CONTRACT.md`.

Shell modules:

- `directive-routes.mjs`: host-neutral primary route metadata.
- `directive-command-spine-shell.js`: shared SillyTavern and Lumiverse frame with a floating LCARS spine, one route drawer, drawer header actions, a bottom-right resize handle, and phone navigation fallback.
- `directive-shell-layout.mjs`: default geometry, viewport constraints, compact/expanded spine state, and local layout persistence.
- `directive-compact-shell.js`: prior compact bottom-navigation frame retained as historical scaffolding and regression reference; active host frontends should not use it as their primary shell.

Shell-level navigation belongs to the shell. On desktop/tablet, the spine owns primary routes and one drawer at a time in both hosts. At phone width, the shell owns the bottom route bar. Panel renderers should not add their own primary navigation, floating shell actions, resize controls, or host-specific close/open controls.

Current runtime panels:

- `campaign-panel.js`: package cards, creator draft resume, and Campaign Records save, branch, load, and delete actions.
- `character-creator-panel.js`: package-owned player-character creation flow.
- `mission-panel.js`: read-only initialized mission state, chat-native play status, pending reviews, and open-world work.
- `crew-panel.js`: senior crew roster from active campaign state and package context, with hidden raw relationship values.
- `ship-panel.js`: ship condition and technical debt from active campaign state and package context.
- `command-log-panel.js`: player-facing committed Command Log entries.
- `settings-panel.js`: provider controls, model routing, runtime controls, preset controls, tutorial preferences, and state safety tools. Campaign Difficulty belongs to the campaign surface, not Settings.
