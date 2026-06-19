# SillyTavern Host Adapter

Planned home for SillyTavern lifecycle, event, storage, generation, UI-mount, and theme integration.

Current status:

- `generation-client.mjs` wraps the existing SillyTavern generation surface behind the host generation client shape.
- `storage-adapter.mjs` maps logical Directive storage keys to SillyTavern `/user/files` paths through the existing file storage adapter shape.
- `events-adapter.mjs` wraps SillyTavern context event subscriptions without calling runtime actions directly.
- `host-factory.mjs` composes stubbed SillyTavern surfaces into a contract-valid `DirectiveHost`.
- The active runtime still imports the legacy provider and extension entrypoints until the Stage 30 gate is stable.

Do not move active `src/extension/`, runtime defaults, or storage paths into this folder until Stage 30 is complete.
