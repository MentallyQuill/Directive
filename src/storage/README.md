# Storage Source

Exact V1 persistence.

- `v1-storage-repository.mjs` stores only the V1 index, creator drafts, active campaign records, and explicit checkpoints.
- `v1-player-portrait-storage.mjs` stores the accepted player portrait.
- `logical-storage-paths.mjs` defines the allowed logical keys.
- `logical-storage-adapter.mjs` delegates those keys to the active host.
- `directive-storage-filenames.mjs` validates the SillyTavern physical filename mapping.

Every loaded payload must have the exact V1 kind and shape. The repository does not scan for, recover, translate, or rewrite unsupported data.
