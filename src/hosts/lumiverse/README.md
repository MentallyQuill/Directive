# Lumiverse Host Adapter

Lumiverse support lives in this repo as a second host adapter for the same Directive engine. The root `spindle.json` points the backend at this folder and points the frontend at the built `dist/frontend.js` bundle. Lumiverse builds that bundle from `src/frontend.ts`.

Current status:

- `backend.js` is the Spindle backend entrypoint. It creates an operator-level Lumiverse `DirectiveHost` for tools/events/interceptors, creates per-user runtime contexts for user-scoped saves, tracks safe host/runtime status, registers player-safe council-eligible read-only tools, installs a fail-open player-safe prompt-block interceptor, routes runtime bridge requests, and replies only with a targeted `userId`.
- `frontend.js` is the Lumiverse frontend source module. It registers the Directive drawer tab, mounts the shared top-control compact shell, requests backend/runtime status through Lumiverse frontend/backend messaging, and exposes the first shelf controls for initialize, quick start, load latest, preview/commit turn, sidecars, Open Orders candidate/assignment/scene-beat actions, and save.
- `runtime-bridge.mjs` maps targeted Lumiverse frontend messages to shared runtime actions for initialize, quick campaign creation, save/load, panel-led Director turns, Open Orders review/scene/scene-beat/resolution, narration, and diagnostic sidecars while returning player-safe summaries.
- `storage-adapter.mjs` adapts injected `spindle.storage` or `spindle.userStorage` objects to Directive's logical-key JSON storage shape.
- `generation-client.mjs` adapts injected `spindle.generate` methods to Directive's host generation client shape. Operator-scoped calls forward the authenticated `userId`; quiet narration uses Lumiverse's quiet generation path; batch sidecars resolve the user's Lumiverse connection profile and attach the provider/model metadata required by the raw batch path.
- `events-adapter.mjs` wraps `spindle.on(...)` subscriptions with aliases and cleanup.
- `interceptor-adapter.mjs` builds fail-open prompt injection handlers from Directive's shared prompt safety packet.
- `prompt-blocks.mjs` turns the sanitized Lumiverse runtime summary into player-safe host prompt blocks for active situation, recent command-log continuity, and crew/ship context.
- `tools-adapter.mjs` registers read-only Directive query tools and routes `TOOL_INVOCATION` events to handlers.
- `host-factory.mjs` composes injected Spindle surfaces into a contract-valid `DirectiveHost`.

The first live Lumiverse slice is intentionally conservative: shared top-control shelf UI, backend-to-frontend messaging, read-only tool registration, event observation, diagnostic sidecars, and fail-open prompt-block injection from sanitized runtime summaries. The first tools are query-only: active situation, command-log search, crew context, and ship status. Prompt blocks include only player-safe active situation, command-log continuity, and crew/ship context.

Frontend direction: keep the Lumiverse shelf on the shared compact Directive shell: top navigation, top-right shell actions, stacked subviews, stable scroll containment, touch-safe controls, and host theme tokens. Lumiverse should mount that shell inside its shelf/drawer surface instead of growing a separate Lumiverse-only UI.

Live verification is covered by `tools/scripts/smoke-lumiverse-live.mjs`. By default it avoids real model calls while checking local import/restart, permission grant, frontend serving with top-control, Open Orders, and Advance Scene control markers, tool registration, WebSocket runtime actions, and prompt dry-run injection. `DIRECTIVE_LIVE_GENERATION=1` opts into live narration and concurrent sidecar generation; provider-auth failures are reported as structured external blockers.
