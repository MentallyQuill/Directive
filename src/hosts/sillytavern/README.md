# SillyTavern Host Adapter

Planned home for SillyTavern lifecycle, event, storage, generation, UI-mount, and theme integration.

Current status:

- `generation-client.mjs` wraps the existing SillyTavern generation surface behind the host generation client shape.
- `narration-provider.mjs` owns SillyTavern current-chat narration calls and is consumed through the generation client.
- `file-api.mjs` owns SillyTavern `/api/files/*` and `/user/files` physical storage calls.
- `storage-adapter.mjs` maps logical Directive storage keys to SillyTavern `/user/files` paths through the existing file storage adapter shape.
- `events-adapter.mjs` wraps SillyTavern context event subscriptions without calling runtime actions directly.
- `host-factory.mjs` composes stubbed SillyTavern surfaces into a contract-valid `DirectiveHost`.
- `bootstrap.js`, `lifecycle.js`, and `shell-events.js` own the active SillyTavern shell implementation. The manifest-facing `src/extension/` files re-export or delegate here.
- The active SillyTavern bootstrap creates a `DirectiveHost` and passes it into `createDirectiveRuntimeApp({ host })`.
- Logical storage is the active default; physical SillyTavern `/user/files` paths are adapter output, not repository input.

Remaining extraction work: do not add new SillyTavern-specific assumptions outside this folder. Any remaining SillyTavern manifest shims should stay thin and delegate here.

Frontend direction: SillyTavern and Lumiverse both use Directive's shared command-spine shell. The host adapter supplies mounting, storage, generation, and host tokens; `src/runtime/runtime-shell.js` owns the compact/expanded spine, single resizable drawer, full-screen workspace escalation, and phone-width fallback. Route panels remain host-neutral.
