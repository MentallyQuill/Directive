# V1 Player Identity Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the V1 creator portrait lifecycle, project and render the immutable accepted commander, and remove stale alternate-authority code and naming.

**Architecture:** Advertise portrait support from the actual storage boundary, add one exact player-identity projection to the composite V1 projection, and consume it read-only in the People route. Delete unreachable pre-V1 helpers and rename misleading state proposal sources without adding compatibility or a mutable player domain.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, fake DOM fixtures, CSS, PowerShell, npm.

## Global Constraints

- V1 state remains the only runtime authority.
- Do not load, translate, mirror, migrate, or otherwise support legacy chats or saves.
- Do not add `player` to `V1_MUTABLE_STATE_DOMAINS`.
- Only creator drafts can import, replace, or remove player portraits.
- The People route displays accepted player data and offers no player-edit controls.
- Do not perform live SillyTavern qualification.
- Preserve `.codex-remote-attachments/` and unrelated user files.
- Use one-test-at-a-time Red/Green/Refactor for behavior changes.

---

### Task 1: Runtime Portrait Capability and Lifecycle Contracts

**Files:**
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Create: `tools/scripts/test-v1-player-portrait.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/ui/character-creator-panel.js`

**Interfaces:**
- Produces: `runtimeView.media.playerPortraitImportSupported: boolean`.
- Consumes: `host.storage.writeBase64File(fileName, base64Data, options)` and `host.storage.deleteFile(path, options)`.

- [x] **Step 1: Add a failing runtime capability assertion**

Create capable storage by extending `createFakeJsonStorage()` with `writeBase64File()` and `deleteFile()`. Assert the initialized runtime view contains:

```js
assert.deepEqual(view.media, { playerPortraitImportSupported: true });
```

Also initialize with default fake JSON storage and assert the flag is false.

- [x] **Step 2: Run the runtime test and verify RED**

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: FAIL because `campaignViewEnvelope()` does not return `media`.

- [x] **Step 3: Implement capability projection and creator removal gating**

Add a small runtime helper that requires both binary write and delete methods, return its result from `campaignViewEnvelope()`, and require the same media flag before enabling the creator Remove button.

- [x] **Step 4: Run the runtime test and verify GREEN**

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: PASS.

- [x] **Step 5: Add direct portrait pipeline contracts**

In `test-v1-player-portrait.mjs`, use literal byte fixtures to assert PNG/JPEG/WebP acceptance, unsupported MIME rejection, the 5 MB limit, a stored `/user/files/...` descriptor, replacement-safe deletion, and rejection of deletion outside Directive's user-file path contract. Add the script to `run-alpha-gate.mjs`.

- [x] **Step 6: Run the portrait test and gate entry**

Run: `node tools/scripts/test-v1-player-portrait.mjs`

Expected: PASS against the existing asset and storage services; failures indicate an uncovered boundary defect that must be corrected with a new Red/Green cycle.

### Task 2: Exact Player Identity Projection

**Files:**
- Create: `src/projection/v1/player-identity-projection.mjs`
- Create: `tools/scripts/test-v1-player-identity-projection.mjs`
- Modify: `src/projection/v1/player-projection.mjs`
- Modify: `tools/scripts/test-v1-composite-player-projection.mjs`
- Modify: `src/ui/v1-player-facing-panel-model.mjs`
- Modify: `tools/scripts/test-v1-player-facing-panel-model.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `createPlayerIdentityProjection({ campaignState })` returning `kind: 'directive.playerIdentityProjection.v1'` and accepted visible identity fields.
- Produces: `v1PlayerProjection.player` and `createV1CrewPanelModel(projection).player`.
- Consumes: `campaignState.player` only.

- [x] **Step 1: Write the failing identity projection test**

Import the wished-for function and assert exact literal output for name, pronouns/address, rank, billet, role, species, appearance, first impression, dossier, and portrait. Mutate the returned nested values and assert the source campaign state is unchanged.

- [x] **Step 2: Run the identity test and verify RED**

Run: `node tools/scripts/test-v1-player-identity-projection.mjs`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the minimal pure projection**

Create the exact projection kind and deep-copy only the approved fields. Do not return `adjudicationProfile`, creator draft fields, storage adapter data, or methods.

- [x] **Step 4: Run the identity test and verify GREEN**

Run: `node tools/scripts/test-v1-player-identity-projection.mjs`

Expected: PASS.

- [x] **Step 5: Add failing composite and panel-model assertions**

Assert `createV1PlayerProjection()` includes the exact player projection, `requireV1PlayerProjection()` rejects a missing or wrong player kind, and `createV1CrewPanelModel()` returns the copied player.

- [x] **Step 6: Run both focused tests and verify RED**

Run: `node tools/scripts/test-v1-composite-player-projection.mjs`

Run: `node tools/scripts/test-v1-player-facing-panel-model.mjs`

Expected: FAIL because the composite and panel model do not yet carry player identity.

- [x] **Step 7: Connect the exact projection and verify GREEN**

Call `createPlayerIdentityProjection({ campaignState })`, include the result as `player`, require `directive.playerIdentityProjection.v1`, and copy it into the crew model.

- [x] **Step 8: Re-run both focused tests**

Expected: both PASS.

### Task 3: Immutable Commander Presentation

**Files:**
- Create: `tools/scripts/test-v1-crew-panel.mjs`
- Modify: `src/ui/crew-panel.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `createV1CrewPanelModel(projection).player`.
- Consumes: `createPlayerPortraitImage(portrait, options)`.
- Produces: a `.directive-v1-player` commander card before `.directive-v1-roster-heading`.

- [x] **Step 1: Write the failing DOM behavior test**

Render a People view through the real `renderCrewPanel()` with a fake document. Assert the commander name, rank/billet, portrait path and alt text appear before the Senior Staff heading, and assert there are no portrait import/remove controls.

- [x] **Step 2: Run the panel test and verify RED**

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Expected: FAIL because no commander card is rendered.

- [x] **Step 3: Implement the commander card and focused styles**

Create a private `createPlayerCard(player)` in `crew-panel.js`, reuse `createPlayerPortraitImage()`, and add only the responsive grid/typography selectors needed for the V1 card. Do not import portrait controls or add actions.

- [x] **Step 4: Run the panel test and verify GREEN**

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Expected: PASS.

### Task 4: Remove Alternate Paths and Correct Authority Names

**Files:**
- Delete: `src/ui/mission-display-identity.mjs`
- Delete: `src/ui/player-portrait-controls.js`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`

**Interfaces:**
- Produces: authoritative proposal descriptors whose `source` names describe V1 recovery/review without `Shadow` terminology.

- [x] **Step 1: Add failing state-spine source assertions**

Capture the proposal descriptors issued by the source-recovery and episode-review paths. Assert their exact new authoritative names and `assert.doesNotMatch(source, /shadow/i)`.

- [x] **Step 2: Run the state-spine test and verify RED**

Run: `node tools/scripts/test-v1-state-spine-runtime.mjs`

Expected: FAIL because the existing source values contain `Shadow`.

- [x] **Step 3: Rename the proposal sources and delete unreachable modules**

Use `v1StateSpineSourceRecovery` and `v1EpisodeReviewAuthority`. Delete the two unreachable modules; do not replace them with adapters or compatibility helpers.

- [x] **Step 4: Run the state-spine test and search reachability**

Run: `node tools/scripts/test-v1-state-spine-runtime.mjs`

Run: `rg -n "mission-display-identity|player-portrait-controls|Shadow" src tools/scripts`

Expected: test PASS; search returns no production references or shadow authority names.

### Task 5: Full Verification and Documentation Reconciliation

**Files:**
- Modify: `docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md`
- Modify: `docs/testing/V1_GAMEPLAY_ARCHITECTURE_TEST_PLAN.md`
- Modify: `docs/superpowers/plans/2026-08-10-v1-player-identity-integrity.md`

**Interfaces:**
- Documents the player identity projection, immutable portrait lifecycle, and added focused checks.

- [x] **Step 1: Update the architecture and test-plan inventories**

Describe the exact player identity projection and creator-only portrait lifecycle. Add the new focused scripts to the relevant offline gate evidence without claiming live qualification.

- [x] **Step 2: Run the complete verification gate**

Run: `npm.cmd test`

Expected: every focused V1 check passes with exit code 0.

- [x] **Step 3: Review the final diff and invariant searches**

Run: `git diff --check`

Run: `git status --short`

Run: `rg -n "legacy|compatib|migration|shadow" src`

Expected: no whitespace errors; only intended files plus untouched `.codex-remote-attachments/`; no newly introduced legacy, compatibility, migration, or shadow implementation.

- [x] **Step 4: Mark plan checkboxes complete and commit**

Stage only the approved implementation, tests, and documentation. Preserve `.codex-remote-attachments/` untracked. Commit with a concise V1-focused Conventional Commit message.
