# Host Adapters

Host adapters are the boundary between Directive's shared game engine and specific runtime hosts.

The shared runtime owns exact V1 state, Story Settlement, mission validation and reduction, narration context, and player-safe projections. A host adapter supplies chat events, accepted-message identity, generation, exact logical storage, UI mounting, and host settings.

- `host-contract.mjs` defines that boundary.
- `fake/` provides test-only host behavior.
- `sillytavern/` is the production adapter.

Host code must not create alternate campaign state, semantic trackers, or compatibility stores.
