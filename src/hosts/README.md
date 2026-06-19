# Host Adapters

Host adapters are the planned boundary between Directive's shared game engine and specific runtime hosts.

The shared engine owns mission state, packages, adjudication, transactions, retrieval, generation roles, and sidecar job contracts. Host adapters own lifecycle, storage mapping, generation access, event subscriptions, UI mounting, prompt integration, and host-specific diagnostics.

Current status:

- `host-contract.mjs` defines the first host capability and adapter contract scaffold.
- `fake/` contains test-only host utilities.
- `sillytavern/` contains early adapter wrappers that are not wired into the active runtime yet.
- `tools/scripts/test-host-import-boundaries.mjs` guards the transition by allowing only the known SillyTavern baseline files and future host adapter folders to reference host globals.
- The current SillyTavern runtime files still live under `src/extension/` until Stage 29 and Stage 30 are stable.

Do not add Lumiverse entrypoints, move SillyTavern files, or wire this into runtime behavior until the Stage 30 gate is stable.
