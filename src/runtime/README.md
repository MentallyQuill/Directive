# Runtime Source

Runtime shell, navigation, action dispatch, prompt composition, and state-to-UI orchestration.

Runtime code should not own package internals or campaign transaction logic.

`runtime-actions.js` owns action registration and dispatch.

`runtime-app.mjs` loads bundled starship package/projection JSON, creates the campaign-start controller over the storage adapter, and exposes screen-level operations to the shell.

`runtime-shell.js` owns the tabbed Directive window: Starships, Mission, Crew, Ship, Log, and Settings. The Starships tab currently renders package cards, Character Creator draft save/resume, campaign begin, first save, and Save Game.

`campaign-start-controller.mjs` is the current runtime seam for campaign start. It wraps the package context adapter, campaign-start service, and storage repository to produce Starships and Character Creator view models, start/resume creator drafts, accept a review into the first campaign save, and track the active campaign/save for later panel renderers.
