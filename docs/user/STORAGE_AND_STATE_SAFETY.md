# Storage And State Safety

Directive keeps reusable package templates separate from campaign saves. Structured campaign state is authoritative; chat prose and Command Log text are presentation.

## Storage Model

Directive is a browser-side SillyTavern extension. It should not turn `settings.json` into a data warehouse.

Settings should hold compact control-plane data:

- Extension preferences.
- Storage pointers.
- Active package/save references.
- Lightweight diagnostics.
- Provider route choices when those settings are implemented.

Campaign-owned and draft-owned payloads should live as Directive-managed flat JSON files under SillyTavern's `/user/files` area through the Directive storage repository.

Current planned and implemented file families include:

```text
directive-storage-index.v1.json
directive-character-creator-draft-index.v1.json
directive-save-index.v1.json
directive-character-creator-draft-<draftId>.v1.json
directive-campaign-<campaignId>.v1.json
directive-save-<saveId>.v1.json
directive-turn-ledger-<campaignId>.v1.json
directive-command-log-<campaignId>.v1.json
directive-starship-pack-<packId>.v1.json
directive-mission-pack-<packId>.v1.json
```

The current repository uses adapter-backed tests and a SillyTavern file API wrapper. Runtime storage should provide `readJson(path)` and `writeJson(path, value)` behavior without requiring UI panels to write storage directly.

## Package Versus Campaign State

Package-owned data:

- Ship template.
- Crew template.
- Character Creator options.
- Campaign and mission templates.
- Side mission rules.
- Guardrails.
- Passive assets.

Campaign-owned data:

- Player character.
- Current ship state.
- Mission progress.
- Known and hidden facts.
- Turn ledger.
- Command Log.
- Relationship and crew-development continuity.
- Command Bearing records.
- Command Competence ledgers.
- Pressure ledger records.
- Saves and branches.

Package updates can change future reference data during pre-alpha, but campaign-owned state remains the authority for what already happened.

## Saves

A campaign is the long-running playthrough identity. A save is a named restorable snapshot or branch of that campaign.

Current save actions:

- **Save Game:** overwrite the active save slot.
- **Save As:** create a separate save branch with parent/divergence metadata.
- **Load Save:** restore a saved campaign state.
- Stable-turn autosave: created after a committed outcome is successfully narrated.

Save metadata should be listable without reading every full campaign payload.

## Transaction Safety

Directive separates mechanics commit from narration.

The intended order is:

1. Build a scene snapshot from committed campaign state.
2. Run Director and adjudication logic.
3. Build Command Competence, warning, pressure, and outcome packets.
4. Preview the outcome.
5. Accept the outcome, confirm risk, or spend an eligible point.
6. Commit structured state.
7. Generate narration from the committed packet.
8. Autosave after stable narration.

If narration fails after mechanics commit, Directive records retryable narration recovery. It should not silently reroll mechanics or corrupt campaign state.

## Storage Diagnostics

The current Settings panel can show storage diagnostics:

- Status.
- Issue count.
- Creator draft count.
- Save count.

Future State Safety controls should add verify, settle, clean-missing-records, export, and cleanup workflows. Until those controls exist, diagnostics should stay read-only and conservative.

## Import Safety

Starship package imports use `.directive-starship.zip`.

The current normalizer rejects:

- Absolute paths.
- Path traversal.
- Script files.
- HTML.
- Executables.
- Scriptable SVG.
- WebAssembly.
- Ambiguous or missing package JSON roots.

Imported packages are prompt-relevant content after the player uses them, even when the archive itself is data-only. Treat packages from unknown sources as untrusted prompt material.

## Manual Inspection

For pre-alpha testing, inspect the active SillyTavern user profile after campaign creation, save/load, and turn commits:

- `settings.json` should remain compact.
- Directive payload filenames should stay flat and `directive-` prefixed.
- Creator drafts should be listed through a draft index.
- Saves should be listed through a save index.
- Campaign payloads should preserve hidden state without exposing raw values in normal UI.
- Package templates in the repository should not mutate when campaign state changes.

## Troubleshooting

| Problem | First check |
| --- | --- |
| A package appears unhealthy | Open Starships and read Package Health issue count, then run the package validators. |
| A save does not appear | Check storage diagnostics and run the storage repository tests. |
| Narration failed after accepting an outcome | Use narration retry; do not rerun mechanics unless that is intentional. |
| A turn result should change after editing the order | Use Rerun Outcome from the pre-outcome snapshot. |
| Old pre-alpha data no longer loads | Update files in place to the current contract; legacy migration is not maintained yet. |

## Verification

Run:

```powershell
node tools\scripts\test-directive-file-api.mjs
node tools\scripts\test-directive-storage-repository.mjs
node tools\scripts\test-campaign-start-service.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\test-runtime-stage18-rerun-branch-recovery.mjs
```
