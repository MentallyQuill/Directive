# Storage And State Safety

Directive keeps reusable package templates separate from campaign saves. Structured campaign state is authoritative; chat prose and Command Log text are presentation.

## Storage Model

Directive is a host-portable extension engine. It should not turn host settings into a data warehouse.

Settings should hold compact control-plane data:

- Extension preferences.
- Storage pointers.
- Active package/save references.
- Lightweight diagnostics.
- Provider route choices when those settings are implemented.

Campaign-owned and draft-owned payloads live as Directive-managed logical JSON records through the Directive storage repository. SillyTavern maps those logical keys to flat `/user/files` JSON files; Lumiverse can map the same keys to scoped Spindle storage.

Current logical record families include:

```text
system/storage-index.v1.json
indexes/character-creator-drafts.v1.json
indexes/saves.v1.json
drafts/character-creator/{draftId}.v1.json
saves/{saveId}.v1.json
jobs/{campaignId}/{jobId}.v1.json
```

The repository uses adapter-backed tests and host storage adapters. Runtime storage should provide `readJson(logicalKey)` and `writeJson(logicalKey, value)` behavior without requiring UI panels to write storage directly.

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

## Storage Diagnostics And State Safety

The current Settings panel can show storage diagnostics:

- Status.
- Issue count.
- Creator draft count.
- Save count.

The current Settings panel also exposes conservative State Safety controls:

- **Verify Active Save:** read the indexed active save payload and report whether it is valid campaign-save JSON.
- **Settle Active State:** overwrite the active save slot with the current campaign state.
- **Export Active Save:** prepare the active save as passive JSON for off-host backup or inspection.
- **Clean Missing Records:** remove index references whose payload files are missing. Corrupt or unreadable payloads stay indexed and remain visible as errors.

State Safety controls must remain control-plane actions. They should not invent campaign state, mutate package templates, or hide unreadable payloads.

## Import Safety

Campaign package imports use `.directive-campaign.zip`.

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

For pre-alpha testing, inspect the active host storage after campaign creation, save/load, and turn commits.

In SillyTavern:

- `settings.json` should remain compact.
- Directive payload filenames should stay flat and `directive-` prefixed.
- Creator drafts should be listed through a draft index.
- Saves should be listed through a save index.
- Campaign payloads should preserve hidden state without exposing raw values in normal UI.
- Package templates in the repository should not mutate when campaign state changes.

In Lumiverse:

- Directive save and draft payloads should remain scoped to the authenticated user's Spindle storage.
- Logical keys such as `indexes/saves.v1.json` and `saves/{saveId}.v1.json` should stay host-neutral.
- The default live smoke should be able to quick-start, manually save, load that save, preview, and commit without requiring direct filesystem assumptions.
- Prompt-block dry-run output should include only player-safe Directive context, not hidden facts or raw relationship values.

## Troubleshooting

| Problem | First check |
| --- | --- |
| A package appears unhealthy | Open Campaign and read Package Health issue count, then run the package validators. |
| A save does not appear | Check storage diagnostics and run the storage repository tests. |
| Narration failed after accepting an outcome | Use narration retry; do not rerun mechanics unless that is intentional. |
| A turn result should change after editing the order | Use Rerun Outcome from the pre-outcome snapshot. |
| Old pre-alpha data no longer loads | Update files in place to the current contract; legacy migration is not maintained yet. |

## Verification

Run:

```powershell
node tools\scripts\test-sillytavern-file-api.mjs
node tools\scripts\test-directive-storage-repository.mjs
node tools\scripts\test-campaign-start-service.mjs
node tools\scripts\test-transaction-state.mjs
node tools\scripts\test-runtime-stage18-rerun-branch-recovery.mjs
```
