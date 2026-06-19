# Lumiverse Host Adapter

Planned home for Lumiverse Spindle backend/frontend entrypoints, storage, generation, events, context handlers, interceptors, tools, and backend-to-frontend messages.

Current status:

- `storage-adapter.mjs` adapts injected `spindle.storage` or `spindle.userStorage` objects to Directive's JSON storage shape.
- `generation-client.mjs` adapts injected `spindle.generate` methods to Directive's host generation client shape.
- `events-adapter.mjs` wraps `spindle.on(...)` subscriptions with aliases and cleanup.
- `interceptor-adapter.mjs` builds fail-open prompt injection handlers from Directive's shared prompt safety packet.
- `tools-adapter.mjs` registers read-only Directive query tools and routes `TOOL_INVOCATION` events to handlers.
- `host-factory.mjs` composes the injected fake-Spindle surfaces into a contract-valid `DirectiveHost`.

There is no `spindle.json`, backend entrypoint, frontend entrypoint, live interceptor registration, or live tool registration yet. Those should wait until the Stage 30 gate is stable and the fake adapter tests are passing.
