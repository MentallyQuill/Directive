# Storage Source

SillyTavern file API adapters, storage indexes, stale-write protection, domain storage, campaign storage, package storage, mission storage, and diagnostics.

`save-records.mjs` owns the first storage-agnostic campaign save record helpers: first save, Save Game overwrite, Save Game As, autosave records, Load Game clone behavior, and save-list metadata.

`directive-storage-filenames.mjs` owns flat `directive-` filename and `/user/files/` JSON path validation.

Host-specific physical storage APIs live under `src/hosts/<host>/`. SillyTavern's `/api/files/*` wrapper is owned by `src/hosts/sillytavern/file-api.mjs`.

`directive-storage-repository.mjs` owns the async adapter-backed persistence boundary for Character Creator drafts, campaign saves, and rolling autosave pruning. It reads and writes host-neutral logical keys; host adapters own physical path mapping.

`logical-storage-paths.mjs` is the isolated dual-host storage key scaffold. It defines host-neutral logical keys and maps them to SillyTavern flat `/user/files` paths or Lumiverse-style scoped storage keys.

`logical-storage-adapter.mjs` wraps a host storage adapter so repository code can read and write logical keys while the host adapter owns the physical path mapping.

It also owns storage diagnostics and active-save recovery:

- `diagnoseDirectiveStorage(...)` initializes indexes, verifies indexed payload paths when the adapter supports file verification, detects missing/unreadable payloads, and reports save/draft/file counts.
- `recoverActiveCampaignSave(...)` tries the indexed active save first, then current save rows, then newest save rows, repairing the active-save pointer when a readable fallback is found.
