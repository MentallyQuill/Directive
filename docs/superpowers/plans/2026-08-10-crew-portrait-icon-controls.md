# Crew Portrait Icon Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Crew player's large portrait text buttons with an attached icon overlay and in-place remove confirmation.

**Architecture:** Keep the existing campaign portrait runtime actions unchanged. Move the UI control group into the player portrait frame, use the supplied SVG shapes as CSS masks, and let one render-local control switch between normal and confirmation states without rebuilding the Crew panel.

**Tech Stack:** JavaScript ES modules, DOM assertion scripts, CSS masks, SVG assets, Playwright browser conformance.

## Global Constraints

- Use `uploadpcimage.svg` for add and replace.
- Use `removepcimage.svg` for removal.
- Render no visible text labels inside the portrait controls.
- Keep accessible names and tooltips for every icon button.
- Place one attached two-button group inside the upper-right of the player portrait on desktop and mobile.
- Replace the normal pair in place with a red confirm check and grey cancel X.
- Do not change runtime portrait persistence or render controls on NPC portraits.

---

### Task 1: Portrait overlay state machine

**Files:**
- Create: `assets/icons/upload-pc-image.svg`
- Create: `assets/icons/remove-pc-image.svg`
- Modify: `tools/scripts/test-v1-crew-panel.mjs`
- Modify: `src/ui/people-journal.js`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: `actions.importCampaignPlayerPortrait({ file })`, `actions.removeCampaignPlayerPortrait()`, and `actions.refresh()`.
- Produces: `.directive-crew-player-portrait-controls` containing normal `.directive-crew-player-portrait-upload` / `.directive-crew-player-portrait-remove` buttons or confirmation `.directive-crew-player-portrait-confirm` / `.directive-crew-player-portrait-cancel` buttons.

- [ ] **Step 1: Write the failing placement and icon test**

Assert each rendered player detail has one control group whose parent is `.people-detail-portrait`, whose normal buttons contain upload/remove mask spans, and whose text content contains none of `Add image`, `Replace image`, or `Remove image`. Assert an NPC detail has no group.

- [ ] **Step 2: Run the Crew test and verify RED**

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Expected: FAIL because the current actions are large text buttons inside `.people-detail-identity`.

- [ ] **Step 3: Add the supplied assets and minimal overlay**

Copy the supplied SVG path geometry into the two `assets/icons/` files. Replace `createButton()` use with compact icon buttons that set `aria-label`, `title`, `type="button"`, and an async click handler. Append the control group to the player portrait figure:

```js
const portraitVisual = portrait(model, record, 'detail', 'people-detail-portrait');
if (record.isPlayer) portraitVisual.appendChild(createPlayerPortraitActions(record, view, actions));
hero.appendChild(portraitVisual);
```

Use CSS masks backed by `../assets/icons/upload-pc-image.svg` and `../assets/icons/remove-pc-image.svg`; position the attached group at `top: 8px; right: 8px` with a `30px` square hit area per control.

- [ ] **Step 4: Run the Crew test and verify GREEN**

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Expected: PASS for placement, supplied icon identity, accessibility, and NPC exclusion.

- [ ] **Step 5: Write the failing inline-confirmation test**

Click remove and assert the clicked group replaces the normal pair with a red confirm check and grey cancel X without calling the runtime action. Click cancel and assert the normal pair returns. Enter confirmation again, click confirm, and assert one removal plus one refresh.

- [ ] **Step 6: Run the Crew test and verify RED**

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Expected: FAIL because removal still uses the browser confirmation path.

- [ ] **Step 7: Implement the confirmation state**

Give `createPlayerPortraitActions()` two local render functions. The normal renderer attaches upload/remove. The confirmation renderer attaches:

```js
createPortraitControl({ label: 'Confirm remove image', className: 'directive-crew-player-portrait-confirm', glyph: '✓', onClick: removeAndRefresh });
createPortraitControl({ label: 'Cancel remove image', className: 'directive-crew-player-portrait-cancel', glyph: '×', onClick: renderNormal });
```

Remove all `globalThis.confirm` use from this flow.

- [ ] **Step 8: Run focused UI verification**

Run: `node tools/scripts/test-v1-crew-panel.mjs`

Run: `node tools/scripts/test-certified-people-panel.mjs`

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: all PASS.

- [ ] **Step 9: Commit the UI correction**

```powershell
git add assets/icons/upload-pc-image.svg assets/icons/remove-pc-image.svg tools/scripts/test-v1-crew-panel.mjs src/ui/people-journal.js styles/directive.css
git commit -m "fix(crew): compact portrait controls"
```

### Task 2: Integration verification

**Files:**
- Modify only if a verification failure exposes a feature defect.

**Interfaces:**
- Consumes: the committed overlay state machine from Task 1.
- Produces: a merge-ready branch with no uncommitted changes.

- [ ] **Step 1: Run static checks**

Run: `git diff --check main...HEAD`

Expected: no output and exit code 0.

- [ ] **Step 2: Run the complete alpha gate**

Run: `npm.cmd test`

Expected: all 97 focused checks pass.

- [ ] **Step 3: Review and integrate**

Review the production diff against the approved design, merge into current `main`, rerun `npm.cmd test`, and push only after the merged tree is green.
