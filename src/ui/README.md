# UI Source

Reusable UI kit modules and panel renderers.

Render modules should not call providers directly or perform storage writes.

Render modules that keep module-level UI state must export a reset hook and wire it into `resetDirectiveRuntimeLayout()` so explicit test/developer preference resets can restore route-local UI without changing campaign state. The player-facing shell has no window-geometry reset control.

Shell modules:

- `directive-routes.mjs`: host-neutral primary route metadata.
- `directive-expanded-shell.js`: active SillyTavern frame with the shared LCARS rail, route heading, one Close action, bounded route body, and five-route bottom navigation.
- `expanded-interface-focus.js`: shared roving-focus and focus-restoration behavior.
- `responsive-record-list.js` and `reorderable-collection.js`: shared route-local expansion and ordering primitives that never mutate simulation state.

Shell-level navigation belongs to the shell at every viewport. Panel renderers should not add their own primary navigation, floating shell actions, resize controls, or host-specific close/open controls. Long route content scrolls inside bounded regions instead of growing the extension beyond the viewport.

Current runtime panels:

- `campaign-panel.js`: package cards, creator draft resume, and Campaign Records save, branch, load, and delete actions.
- `character-creator-panel.js`: package-owned player-character creation flow.
- `mission-panel.js`: read-only initialized mission state, chat-native play status, pending reviews, and open-world work.
- `crew-panel.js`: current production renderer behind the People route while the approved service-grouped dossier interface is integrated.
- `ship-panel.js`: ship condition and technical debt from active campaign state and package context.
- `command-log-panel.js`: player-facing committed Command Log entries.
- `settings-panel.js`: provider controls, model routing, runtime controls, preset controls, tutorial preferences, and state safety tools. Campaign Difficulty belongs to the campaign surface, not Settings.
