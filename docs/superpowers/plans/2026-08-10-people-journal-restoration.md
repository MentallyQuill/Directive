# People Journal Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore package portraits, free player-controlled People categories, and accessible cross-category sorting while retaining V1 authority and Command Bearing.

**Architecture:** Enrich the V1 player-safe projections with explicit portrait/service/category descriptors, reconcile them through a campaign-scoped presentation-preference repository, and render desktop/mobile from one collection model. Reuse the existing reorder primitives and package media resolver; never write presentation ordering into campaign state.

**Tech Stack:** Browser ES modules, Node.js assertion scripts, Playwright visual/interaction harness, CSS, JSON V1 datasets.

## Global Constraints

- `docs/design/mockups/directive-expanded-interface.html` and `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md` remain visual and interaction authority.
- Every visible person, including the player, is freely movable.
- Organization is presentation-only and scoped by campaign ID plus V1 branch/save ID.
- Command Bearing behavior and placement remain unchanged.
- No legacy support, migrations, compatibility layers, or story-state schema changes.
- Tests must demonstrate red before production edits and green afterward.

---

### Task 1: Project Package Portrait and Service Metadata

**Files:**
- Modify: `packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json`
- Modify: `src/projection/v1/people-projection.mjs`
- Modify: `src/projection/v1/player-identity-projection.mjs`
- Modify: `tools/scripts/test-v1-people-projection.mjs`
- Modify: `tools/scripts/test-v1-player-identity-projection.mjs`
- Modify: `tools/scripts/test-ashes-v1-campaign.mjs`

**Interfaces:**
- Produces each crew person with `portrait: { kind: 'crew.portrait.formal', subjectId }`, `categoryId`, and `service: { organization, department, rankCode, rankLabel }`.
- Produces the player with `categoryId: 'ships-company'` and explicit Starfleet command-service metadata.

- [ ] **Step 1: Write failing projection assertions**

Add literal assertions such as:

```js
assert.deepEqual(whitaker.portrait, {
  kind: 'crew.portrait.formal',
  subjectId: 'mara-whitaker'
});
assert.deepEqual(whitaker.service, {
  organization: 'starfleet',
  department: 'command',
  rankCode: 'captain',
  rankLabel: 'Captain'
});
assert.equal(whitaker.categoryId, 'ships-company');
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run each command and require exit code `0`:

```powershell
node tools/scripts/test-v1-people-projection.mjs
node tools/scripts/test-v1-player-identity-projection.mjs
node tools/scripts/test-ashes-v1-campaign.mjs
```

Expected: failures because portrait, service, and category metadata are absent.

- [ ] **Step 3: Add explicit public metadata and project it**

Add `service` and `categoryId` to all seven bundled officers. Copy only those public fields into `createPeoplePlayerProjection()` and construct the portrait descriptor from the stable officer ID. Add the player service/category descriptor in `createPlayerIdentityProjection()` without parsing rank or billet strings.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all three scripts pass and private narration guidance remains absent from the projection.

- [ ] **Step 5: Commit**

```powershell
git add packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json src/projection/v1/people-projection.mjs src/projection/v1/player-identity-projection.mjs tools/scripts/test-v1-people-projection.mjs tools/scripts/test-v1-player-identity-projection.mjs tools/scripts/test-ashes-v1-campaign.mjs
git commit -m "feat(people): project portrait and service metadata"
```

### Task 2: Add Campaign-Scoped People Preferences

**Files:**
- Create: `src/ui/people-collection-preferences.js`
- Create: `tools/scripts/test-people-collection-preferences.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces `createPeopleCollectionPreferences({ scopeKey, records, storage })`.
- Controller methods: `snapshot()`, `select(id)`, `toggleCategory(id)`, `addCategory(label)`, `renameCategory(id, label)`, `removeCategory(id)`, `moveCategory(id, toIndex)`, and `moveRecord(id, categoryId, toIndex)`.
- Snapshot: `{ selectedPersonId, collapsedCategoryIds, categories: [{ id, label, system, recordIds }] }`.

- [ ] **Step 1: Write behavior-first preference tests**

Cover literal expected snapshots for:

```js
controller.moveRecord('player.sam', 'custom-bridge', 0);
assert.deepEqual(controller.snapshot().categories.find(({ id }) => id === 'custom-bridge').recordIds, ['player.sam']);
```

Also cover new-person append, stale-person removal, malformed persisted JSON, duplicate IDs, custom add/rename/remove, removal fallback to `unknown-unsorted`, category reorder, selection, collapse state, campaign-scope separation, and a storage implementation that throws.

- [ ] **Step 2: Run the new test and verify RED**

Run: `node tools/scripts/test-people-collection-preferences.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement normalization and persistence**

Use storage key `directive.people.preferences.v1:${encodeURIComponent(scopeKey)}`. Persist only normalized presentation state. Generate custom IDs with `crypto.randomUUID()` when available and a timestamp/counter fallback. A failed read/write must not prevent returning a valid snapshot.

- [ ] **Step 4: Run the new test and verify GREEN**

Run: `node tools/scripts/test-people-collection-preferences.mjs`

Expected: `PASS People collection preferences`.

- [ ] **Step 5: Add the test to the alpha gate and commit**

```powershell
git add src/ui/people-collection-preferences.js tools/scripts/test-people-collection-preferences.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(people): persist campaign-scoped organization"
```

### Task 3: Restore Categories, Portraits, Details, and Command Bearing Integration

**Files:**
- Modify: `src/ui/view-models/certified-people-view.mjs`
- Replace: `src/ui/people-journal.js`
- Modify: `src/ui/crew-panel.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-certified-people-view.mjs`
- Modify: `tools/scripts/test-certified-people-panel.mjs`
- Modify: `tools/scripts/test-v1-crew-panel.mjs`

**Interfaces:**
- `buildCertifiedPeopleView(projection, view)` returns `scopeKey`, `packageData`, `records`, and `commandBearing`.
- `createPeopleJournal({ model, onChange })` renders desktop and phone from the same preference controller.
- Package people use `createPackageImage(packageData, person.portrait, { variant })`; the player uses `createPlayerPortraitImage()`.

- [ ] **Step 1: Add failing certified-view and panel assertions**

Assert that a real package-backed Mara row contains a `people-row-image` image, the selected detail contains a `people-detail-portrait` image, category toolbar/header/handle controls exist, the player is inside a category rather than pinned outside the collection, and the Command Bearing strip still precedes the journal.

- [ ] **Step 2: Run focused panel tests and verify RED**

Run each command and require exit code `0`:

```powershell
node tools/scripts/test-certified-people-view.mjs
node tools/scripts/test-certified-people-panel.mjs
node tools/scripts/test-v1-crew-panel.mjs
```

Expected: missing category, handle, and package portrait assertions.

- [ ] **Step 3: Build the unified People journal**

Restore the approved toolbar, collapsible category groups, portrait rows, pips, selected detail, custom-category inline editing/removal confirmation, and phone accordion. Render current relationship posture and visible moments only. Preserve the existing Command Bearing function unchanged in `crew-panel.js` and mount the journal below it.

- [ ] **Step 4: Restore exact desktop/phone styling**

Implement the contract's `240px` desktop master pane, `48px` thumbnails, detail portrait clamp/fade, independent scroll owners, `200px` phone portrait, distinct disclosure and handle targets, category controls, drop placeholder/preview, and visible keyboard focus.

- [ ] **Step 5: Run focused panel tests and verify GREEN**

Run the Step 2 command. Expected: all scripts pass.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/view-models/certified-people-view.mjs src/ui/people-journal.js src/ui/crew-panel.js styles/directive.css tools/scripts/test-certified-people-view.mjs tools/scripts/test-certified-people-panel.mjs tools/scripts/test-v1-crew-panel.mjs
git commit -m "feat(ui): restore full People journal"
```

### Task 4: Restore Pointer, Touch, Keyboard, and Cross-Category Movement

**Files:**
- Modify: `src/ui/expanded-interface-reorder.js`
- Modify: `src/ui/reorderable-collection.js`
- Modify: `src/ui/people-journal.js`
- Modify: `tools/scripts/test-reorderable-collection.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`

**Interfaces:**
- Reorder binding accepts peer category lists and reports `{ id, toCategoryId, toIndex, input }`.
- Keyboard boundary movement chooses the adjacent expanded category and preserves handle focus after rerender.

- [ ] **Step 1: Add failing controller and browser interactions**

Test `ArrowDown` at the final row, mouse drag across categories, touch/pen activation only after `175ms`, exact-height placeholder, body-level centered preview, nearest-list auto-scroll, and localStorage persistence after fixture remount.

- [ ] **Step 2: Run focused interactions and verify RED**

Run each command and require exit code `0`:

```powershell
node tools/scripts/test-reorderable-collection.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: cross-category and restored People interaction assertions fail.

- [ ] **Step 3: Extend shared reorder behavior minimally**

Keep existing same-list consumers unchanged. Add optional cross-list resolution, use the preference controller as the only commit point, cancel safely on blur/pointer cancellation, and restore focus to the moved handle after rerender.

- [ ] **Step 4: Use the real bundled package in the browser fixture**

Load `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json` in the fixture so screenshot and interaction assertions prove actual portrait resolution rather than hand-written image paths.

- [ ] **Step 5: Run focused interactions and verify GREEN**

Run the Step 2 command. Expected: controller and Playwright conformance pass at all four viewports.

- [ ] **Step 6: Commit**

```powershell
git add src/ui/expanded-interface-reorder.js src/ui/reorderable-collection.js src/ui/people-journal.js tools/scripts/test-reorderable-collection.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs tools/fixtures/expanded-interface-runtime-fixture.mjs
git commit -m "feat(people): restore accessible cross-category sorting"
```

### Task 5: Full Verification, Review, Merge, and Push

**Files:**
- Modify only files required by verified review findings.

- [ ] **Step 1: Run focused People gates**

```powershell
node tools/scripts/test-v1-people-projection.mjs
node tools/scripts/test-people-collection-preferences.mjs
node tools/scripts/test-certified-people-panel.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

- [ ] **Step 2: Run the complete gate**

Run: `npm.cmd test`

Expected: all focused checks pass with zero failures.

- [ ] **Step 3: Review the branch against the design**

Compare `origin/main...HEAD`, fix every Critical or Important finding test-first, then rerun focused and full gates.

- [ ] **Step 4: Merge into the latest local `main`**

From `F:\git\Directive`, run `git pull`, merge `codex/people-journal-restoration`, and rerun `npm.cmd test` on the merged tree.

- [ ] **Step 5: Push `main`**

Run: `git push origin main`

Expected: remote `main` advances to the verified merge commit without force-push.
