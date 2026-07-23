# Runtime Source

Runtime shell, navigation, action dispatch, prompt composition, and state-to-UI orchestration.

Runtime code should not own package internals or campaign transaction logic.

`runtime-actions.js` owns action registration and dispatch.

`runtime-app.mjs` loads bundled campaign package/projection JSON plus one or more mission graphs per package, creates the campaign-start controller over the host/storage adapter, and exposes screen-level operations to the shell. It can be constructed with `createDirectiveRuntimeApp({ host })`; explicit `adapter` and `narrationProvider` overrides still exist for focused tests.

`runtime-shell.js` mounts the host-neutral, viewport-bound expanded interface and delegates route body content to panel modules. `directive-expanded-shell.js` owns the shared LCARS rail, route heading, close action, and five-route bottom navigation. Route-local display preferences are persisted separately from simulation state; the shell has no draggable or resizable window geometry.

`director-turn-runtime.mjs` builds scene snapshots from active campaign state, calls the Mission Director loop, returns Provisional Outcome and optional Command Competence packets, evaluates warning confirmation and Command Bearing intervention eligibility, and commits Final Outcome packets through transaction-state helpers.

Narration remains a post-commit runtime operation. `runtime-app.mjs` can preview Director turns, accept a provisional result, spend an eligible Command Bearing point, compose a narrator prompt from the committed turn packet, call the active host narration provider, record successful prose on the turn ledger, create a stable autosave after successful narration, or record a retryable narration failure without rerolling mechanics.

`campaign-start-controller.mjs` is the current runtime seam for campaign start. It wraps the package context adapter, campaign-start service, and storage repository to produce Campaign and Character Creator view models, start/resume creator drafts, accept a review into the first campaign save, recover the active save at startup, expose active package context and storage diagnostics for read-only panels, and track the active campaign/save for later runtime integration.
