# Host Adapters

Host adapters are the boundary between Directive's shared game engine and specific runtime hosts.

The shared engine owns mission state, packages, adjudication, transactions, retrieval, generation roles, sidecar job contracts, and the host-neutral UI model. Host adapters own lifecycle, storage mapping, generation access, event subscriptions, UI mounting, prompt integration, host-specific diagnostics, and theme-token mapping.

Current status:

- `host-contract.mjs` defines the first host capability and adapter contract scaffold.
- `fake/` contains test-only host utilities.
- `sillytavern/` contains the active SillyTavern bootstrap/lifecycle/event shell, `DirectiveHost` factory, physical file API, storage, generation, narration, event, and UI-progress adapters. The manifest-facing `src/extension/` files delegate host-specific shell behavior here.
- `lumiverse/` contains Lumiverse Spindle backend/frontend source entrypoints plus storage, generation, event, interceptor, tool, and host-factory adapters.
- `tools/scripts/test-host-import-boundaries.mjs` guards the transition by allowing only host adapter folders and narrow shared storage mapping helpers to reference host-specific globals or paths.
- `src/extension/` remains only as the SillyTavern manifest entrypoint plus shared extension UI helpers such as menu mounting, runtime action registration, and the global bridge.

Root descriptors remain host-specific: `manifest.json` for SillyTavern and `spindle.json` for Lumiverse.

Frontend direction: shared route metadata, route panels, and the command-spine shell remain host-neutral. SillyTavern mounts the shell through its extension menu; Lumiverse mounts the same shell through a Spindle app overlay with a drawer-tab launcher. Host adapters must not fork route panel structure, route order, drawer behavior, or player-safe view models.
