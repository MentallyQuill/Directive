# Storage Source

SillyTavern file API adapters, storage indexes, stale-write protection, domain storage, campaign storage, package storage, mission storage, and diagnostics.

`save-records.mjs` owns the first storage-agnostic campaign save record helpers: first save, Save Game overwrite, Save Game As, Load Game clone behavior, and save-list metadata.

`directive-storage-filenames.mjs` owns flat `directive-` filename and `/user/files/` JSON path validation.

`directive-file-api.mjs` wraps the SillyTavern files API and exposes the repository adapter shape.

`directive-storage-repository.mjs` owns the async adapter-backed persistence boundary for Character Creator drafts and campaign saves. Runtime code should connect it to the SillyTavern file API rather than writing payload/index files directly.
