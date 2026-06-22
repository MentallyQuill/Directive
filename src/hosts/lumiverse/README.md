# Lumiverse Host Adapter

Lumiverse support lives in this repo as a second host adapter for the same Directive engine. The root `spindle.json` points the backend at this folder and points the frontend at the built `dist/frontend.js` bundle. Lumiverse builds that bundle from `src/frontend.ts`. Directive's current Lumiverse baseline is `1.0.4`.

Current status:

- `backend.js` is the Spindle backend entrypoint. It creates an operator-level Lumiverse `DirectiveHost` for tools/events/interceptors, creates per-user runtime contexts for user-scoped saves, tracks safe host/runtime status, registers player-safe council-eligible read-only tools, installs a fail-open player-safe prompt-block interceptor, routes runtime bridge requests, and replies only with a targeted `userId`.
- `frontend.js` is the Lumiverse frontend source module. It mounts the shared command-spine runtime shell through `ctx.ui.mountApp({ position: 'app-overlay' })`, loads `styles/directive.css`, registers a lightweight drawer-tab launcher, and proxies shared route-panel actions through Lumiverse frontend/backend messaging.
- `runtime-bridge.mjs` maps targeted Lumiverse frontend messages to shared runtime actions for initialize, quick campaign creation, save/load, panel-led Director turns, Open Orders review/scene/scene-beat/resolution, narration, and diagnostic sidecars. It returns the full runtime view for the trusted frontend shell while preserving player-safe summaries for tools and prompt blocks.
- `storage-adapter.mjs` adapts injected `spindle.storage` or `spindle.userStorage` objects to Directive's logical-key JSON storage shape.
- `generation-client.mjs` adapts injected `spindle.generate` methods to Directive's host generation client shape. Operator-scoped calls forward the authenticated `userId`; quiet narration uses Lumiverse's quiet generation path; batch sidecars resolve the user's Lumiverse connection profile and attach the provider/model metadata required by the raw batch path.
- `events-adapter.mjs` wraps `spindle.on(...)` subscriptions with aliases and cleanup.
- `interceptor-adapter.mjs` builds fail-open prompt injection handlers from Directive's shared prompt safety packet.
- `prompt-blocks.mjs` turns the sanitized Lumiverse runtime summary into player-safe host prompt blocks for active situation, recent command-log continuity, and crew/ship context.
- `tools-adapter.mjs` registers read-only Directive query tools and routes `TOOL_INVOCATION` events to handlers.
- `host-factory.mjs` composes injected Spindle surfaces into a contract-valid `DirectiveHost`.

The live Lumiverse slice uses the same floating command shelf, single drawer, route panels, drawer resizing, and full-screen workspace escalation as SillyTavern. Backend-to-frontend messaging, read-only tool registration, event observation, diagnostic sidecars, and fail-open prompt-block injection still use sanitized runtime summaries. The first tools are query-only: active situation, command-log search, crew context, and ship status. Prompt blocks include only player-safe active situation, command-log continuity, and crew/ship context.

Frontend direction: keep Lumiverse on the same shared command-spine shell as SillyTavern. Host adapters may differ in mount, storage, generation, and permission plumbing, but they must not fork route-panel structure, route order, drawer behavior, or player-safe view models.

Lumiverse 1.0.4 extension notes for this adapter:

- Current MVP permissions are `generation`, `interceptor`, `tools`, and `app_manipulation`. `app_manipulation` is required because Directive intentionally mounts a floating app overlay instead of accepting a sidebar-only UI.
- `host-factory.mjs` detects optional 1.0.4 surfaces as capabilities when the injected `spindle` exposes them: tab location, style mode, UI automation, shared components, DOM registry, per-character display resolution, regex/macro control, world-book attachments, preset variables, and unified LumiHub install. Detection does not mean Directive uses those surfaces in the MVP path.
- `TabLocation` and `ctx.ui.requestTabLocation(...)` can move Directive or built-in tabs later, but the command-spine shell uses `mountApp` rather than a drawer-tab surface.
- `spindle.chat.setStyleMode(chatId, 'extension-relaxed', userId)` also requires `app_manipulation`; do not call it unless Directive adds viewport-fixed in-chat message content.
- Use UI Automation for future onboarding/provider repair flows that need to open Connections or Settings.
- `interceptor-adapter.mjs` preserves Lumiverse source index/id, message id, listing id, and DOM registry references in prompt-injection breakdown metadata when the host supplies them, while keeping hidden-source checks in Directive before injection.
- Treat world-book APIs as future package install/export support, not as campaign-state authority.

Live verification is covered by `tools/scripts/smoke-lumiverse-live.mjs`. By default it avoids real model calls while checking local import/restart, permission grant, frontend serving with command-spine app-overlay markers, tool registration, WebSocket runtime actions, and prompt dry-run injection. `DIRECTIVE_LIVE_GENERATION=1` opts into live narration and concurrent sidecar generation; provider-auth failures are reported as structured external blockers.
