# Crew Player Portrait Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player add, replace, or confirm removal of their portrait from the active campaign's Crew page.

**Architecture:** Add a path-restricted `playerPortrait` mutation domain to the V1 state-delta gateway, expose active-campaign portrait actions through the runtime shell, and extend the shared People detail renderer with player-only controls so desktop and mobile use one behavior path. Every other accepted player field remains immutable.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, fake Directive host/storage adapters, DOM fakes, CSS.

## Global Constraints

- Support PNG, JPEG, and WebP only, with the existing 5 MB limit and normalization behavior.
- Require confirmation before removing a portrait.
- Persist the authoritative campaign state before deleting a replaced or removed file.
- Roll back a newly stored portrait file if campaign persistence fails.
- Permit the `playerPortrait` domain to set only `player.portrait`; do not add the `player` root as a mutable domain.
- Never render portrait mutation controls for NPC records.
- Run the complete alpha gate before integration and again on merged `main`.

---

### Task 1: Active-campaign portrait custody

**Files:**
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/runtime-shell.js`
- Modify: `src/runtime/state-delta-gateway.mjs`
- Modify: `src/runtime/v1-campaign-state.mjs`
- Modify: `tools/scripts/test-v1-state-delta-gateway.mjs`

**Interfaces:**
- Consumes: `createPlayerPortraitUpload(...)`, `storeV1PlayerPortrait(...)`, `cleanupPlayerPortrait(...)`, and `gateway.applyProposal(...)` with the path-restricted `playerPortrait` domain.
- Produces: `importCampaignPlayerPortrait({ file, bytes, arrayBuffer, base64, mimeType, fileName })` and `removeCampaignPlayerPortrait()` runtime actions returning the updated portrait, cleanup result, and current view.

- [ ] **Step 1: Write failing runtime tests**

After the campaign is active, import a portrait and assert the returned/current/persisted state all reference the same `/user/files/directive-player-portrait-*` path. Replace it and assert the previous file is deleted only after the save points to the replacement. Remove it and assert both current and persisted `player.portrait` are `null`.

Add a persistence-failure case by temporarily throwing from `host.storage.writeJson` for the active save path:

```js
const portraitBeforeFailure = (await app.getCurrentView()).campaignState.player.portrait;
await assert.rejects(
  app.importCampaignPlayerPortrait({
    bytes: new Uint8Array([21, 22, 23, 24]),
    mimeType: 'image/png',
    fileName: 'rollback.png'
  }),
  (error) => error?.code === 'DIRECTIVE_V1_STATE_PERSISTENCE_FAILED'
);
assert.deepEqual((await app.getCurrentView()).campaignState.player.portrait, portraitBeforeFailure);
assert.equal(deletedPortraitPaths.at(-1), storedPortraitPaths.at(-1));
```

- [ ] **Step 2: Run the runtime test and verify RED**

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: FAIL because `app.importCampaignPlayerPortrait` is undefined.

- [ ] **Step 3: Implement the runtime actions**

In `runtime-app.mjs`, add public methods that require an active state. Import stores the validated upload, commits this exact state operation, and cleans the new file if the commit rejects:

```js
const committed = await gateway.applyProposal({
  id: `v1-player-portrait.import.${state.campaign.id}.${portrait.asset.updatedAt}`,
  baseRevision: gateway.revision(),
  domains: ['playerPortrait'],
  operations: [{ op: 'set', path: ['player', 'portrait'], value: portrait }],
  source: 'playerPortraitImport'
});
setState(committed.campaignState);
```

Authorize `playerPortrait` in `V1_MUTABLE_STATE_DOMAINS`, map it to the `player` root for changed-root custody, and reject any mutation where the player record excluding `portrait` differs. After success, clean the previous portrait when its path differs. Removal commits `null` through the same narrow domain before cleanup. Expose both methods from `createRuntimeActions()` in `runtime-shell.js`.

- [ ] **Step 4: Run the runtime test and verify GREEN**

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: PASS with persistence, cleanup, warning, and rollback assertions green.

- [ ] **Step 5: Commit the runtime custody slice**

```powershell
git add tools/scripts/test-v1-runtime-app.mjs tools/scripts/test-v1-state-delta-gateway.mjs src/runtime/runtime-app.mjs src/runtime/runtime-shell.js src/runtime/state-delta-gateway.mjs src/runtime/v1-campaign-state.mjs
git commit -m "feat(runtime): manage campaign portraits"
```

### Task 2: Player-only Crew controls

**Files:**
- Modify: `tools/scripts/test-v1-crew-panel.mjs`
- Modify: `src/ui/crew-panel.js`
- Modify: `src/ui/people-journal.js`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: `view.media.playerPortraitImportSupported`, `actions.importCampaignPlayerPortrait(...)`, `actions.removeCampaignPlayerPortrait()`, and `actions.refresh()`.
- Produces: `.directive-crew-player-portrait-import`, `.directive-crew-player-portrait-remove`, and `.directive-crew-player-portrait-actions` controls inside player details.

- [ ] **Step 1: Write failing Crew DOM tests**

Upgrade the test DOM fake with `click()`, `files`, `value`, and listener dispatch. Render a supported view and assert both desktop and mobile player details offer `Replace image` and `Remove image`, while NPC details offer neither. Exercise the hidden file input and assert the selected file reaches `importCampaignPlayerPortrait` followed by one refresh.

Stub `globalThis.confirm` to return `false`, click removal, and assert no mutation or refresh. Then return `true`, click again, and assert one removal and one refresh. Render a player without a portrait and assert the label changes to `Add image` and no removal button appears.

- [ ] **Step 2: Run the Crew test and verify RED**

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Expected: FAIL because the Crew portrait controls do not exist.

- [ ] **Step 3: Implement the shared detail controls**

Pass `{ view, actions }` from `renderCrewPanel` to `createPeopleJournal`, through both desktop and mobile calls to `createPeopleDetail`. For `record.isPlayer`, append a compact action row with a hidden input accepting `image/png,image/jpeg,image/webp`.

Use `createButton` labels `Add image`/`Replace image` and `Remove image`. Disable mutation buttons unless host media support and both active-campaign actions exist. Removal must call:

```js
const confirmed = typeof globalThis.confirm === 'function'
  ? globalThis.confirm('Remove your crew image? The image file will be deleted from this campaign.')
  : true;
if (!confirmed) return;
await actions.removeCampaignPlayerPortrait();
await actions.refresh?.();
```

Add scoped CSS so the action row wraps beneath player identity on desktop and remains full-width and touch-friendly in the mobile detail.

- [ ] **Step 4: Run focused UI tests and verify GREEN**

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Run: `node tools/scripts/test-certified-people-panel.mjs`

Expected: both PASS, including the existing mobile scroll-preservation contract.

- [ ] **Step 5: Commit the Crew UI slice**

```powershell
git add tools/scripts/test-v1-crew-panel.mjs src/ui/crew-panel.js src/ui/people-journal.js styles/directive.css
git commit -m "feat(crew): manage player portrait"
```

### Task 3: Integration verification

**Files:**
- Modify only if a verification failure exposes a feature defect.

**Interfaces:**
- Consumes: the runtime and UI slices from Tasks 1 and 2.
- Produces: a merge-ready feature branch with no uncommitted changes.

- [ ] **Step 1: Run static diff checks**

Run: `git diff --check main...HEAD`

Expected: no output and exit code 0.

- [ ] **Step 2: Run the complete alpha gate**

Run: `npm.cmd test`

Expected: all 95 focused checks pass.

- [ ] **Step 3: Review the final diff**

Confirm every production change is protected by a behavior assertion, NPC records remain unchanged, and no creator-only state is referenced from an active campaign action.

- [ ] **Step 4: Merge and verify `main`**

From the primary checkout, fast-forward or merge `codex/crew-player-portrait-controls` into `main`, rerun `npm.cmd test`, and push `main` to `origin` only after the merged result is green.
