# Storage Source

Exact V1 persistence.

- `v1-storage-repository.mjs` stores the V1 index, creator drafts, active campaign manifests, and explicit checkpoint manifests.
- `v1-segmented-save-contracts.mjs` defines the state-free manifest, immutable base, and bounded A/B delta-segment layout. A logical `directive.campaignSave.v1` is hydrated from one base plus strict revision- and SHA-256-bound deltas.
- The current segment rolls over after 64 deltas or before 512 KiB. Each update writes and re-reads the inactive A/B slot before switching the manifest, so a torn segment or manifest write leaves the prior manifest head loadable.
- `v1-player-portrait-storage.mjs` stores the accepted player portrait.
- `logical-storage-paths.mjs` defines the allowed logical keys.
- `logical-storage-adapter.mjs` delegates those keys to the active host.
- `directive-storage-filenames.mjs` validates the SillyTavern physical filename mapping.

Every loaded payload must have the exact V1 kind and shape. Hash corruption, revision gaps, unsafe paths, and unreferenced layouts fail closed. The repository does not scan for, migrate, recover, translate, or rewrite unsupported monolithic saves.
