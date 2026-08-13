# Connection Profile Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-native connection-profile datalist with an accessible searchable modal whose results scroll vertically and save immediately on selection.

**Architecture:** Add one focused UI component that receives profile metadata, owns the dialog lifecycle and filtering, and reports only a chosen profile ID. Keep provider persistence and readiness feedback in `settings-panel.js`; use one component on every viewport and CSS alone to present it as a desktop dialog or mobile sheet.

**Tech Stack:** Browser-native ES modules and DOM APIs, Directive's `runtime-ui-kit.js` and `directive-overlay-root.js`, Node assertion scripts with the shared fake DOM, Playwright visual-conformance coverage, and plain CSS.

## Global Constraints

- Directive persists only the selected profile ID; SillyTavern retains profile, routing, model, preset, and credential custody.
- Selecting or clearing saves immediately and closes; dismissal never saves.
- Search is case-insensitive across label, name, model, and ID.
- Long profile text wraps, results scroll vertically, and mobile targets are at least 44 CSS pixels tall.
- Existing unrelated `debug.log` and `.codex-remote-attachments/` worktree changes must remain untouched.

---

### Task 1: Searchable Profile Dialog

**Files:**
- Create: `src/ui/connection-profile-picker.js`
- Create: `tools/scripts/test-connection-profile-picker.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `createConnectionProfilePicker({ profiles, selectedId, opener, onSelect })`, where `profiles` is an array of `{ id, label?, name?, model?, completionMode? }` and `onSelect(profileId)` may return a promise.
- Produces: `{ overlay, dialog, searchInput, resultList, clearButton, close(reason), isOpen() }` and calls `onSelect` exactly once with a string ID after a result or clear action.

- [ ] **Step 1: Write the failing component test**

Use `installFakeDom()` to provide a runtime panel and opener. Assert dialog semantics, runtime-panel inertness, initial search focus, selected-row state, label/name/model/ID search, no-results copy, immediate async selection, clear-to-empty selection, backdrop/close/Escape cancellation, and opener focus restoration. The core selection assertions are:

```js
const chosen = [];
const picker = createConnectionProfilePicker({
  profiles: [
    { id: 'profile.deep', label: 'Deep Reasoning', model: 'deepseek-reasoner' },
    { id: 'profile.fast', name: 'Fast Utility', model: 'gpt-5-mini' }
  ],
  selectedId: 'profile.deep',
  opener,
  onSelect: async (profileId) => chosen.push(profileId)
});
assert.equal(picker.dialog.getAttribute('aria-modal'), 'true');
assert.equal(fakeDocument.activeElement, picker.searchInput);
picker.searchInput.value = '5-mini';
await picker.searchInput.dispatch('input');
await picker.resultList.children[0].click();
assert.deepEqual(chosen, ['profile.fast']);
assert.equal(picker.isOpen(), false);
assert.equal(fakeDocument.activeElement, opener);
```

- [ ] **Step 2: Run the test to verify RED**

Run: `node tools/scripts/test-connection-profile-picker.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/ui/connection-profile-picker.js`.

- [ ] **Step 3: Implement the minimal dialog component**

Create and export `createConnectionProfilePicker`. Normalize searchable text with:

```js
const searchText = (profile) => [profile.label, profile.name, profile.model, profile.id]
  .map((value) => String(value || '').trim().toLowerCase())
  .filter(Boolean)
  .join('\n');
```

Append the overlay through `appendDirectiveModal`, set the runtime panel inert while open, render result buttons from the filtered profiles, and label the current item with `aria-current="true"`. Result clicks and the clear button await `onSelect`, then close and restore focus. Close, backdrop, and Escape must not invoke `onSelect`. Keep the picker open with an alert/status message if `onSelect` rejects, so Settings can report failure without claiming success.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `node tools/scripts/test-connection-profile-picker.mjs`

Expected: `Connection profile picker tests passed.`

- [ ] **Step 5: Register the test and commit**

Add `"test-connection-profile-picker.mjs"` to `tools/scripts/run-alpha-gate.mjs`, then run:

```powershell
git add -- src/ui/connection-profile-picker.js tools/scripts/test-connection-profile-picker.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): add profile picker dialog"
```

### Task 2: Settings Integration

**Files:**
- Modify: `src/ui/settings-panel.js`
- Modify: `tools/scripts/test-certified-settings-panel.mjs`

**Interfaces:**
- Consumes: `createConnectionProfilePicker` from Task 1.
- Produces: a `button.settings-control.settings-profile-picker` whose text reflects the friendly selected profile label and whose picker callback invokes `actions.updateProviderSettings({ kind, patch: { profileId } })`.

- [ ] **Step 1: Extend the Settings test for the new control**

Replace datalist assertions with button behavior. Configure at least two profiles, switch Utility to Connection Profile, click the Utility profile button, choose the second result, and assert:

```js
assert.equal(utilityProfileButton.tagName, 'BUTTON');
assert.equal(utilityProfileButton.getAttribute('aria-haspopup'), 'dialog');
await utilityProfileButton.click();
const pickerOverlay = document.getElementById('directive-modal-root').children[0];
const secondChoice = all(pickerOverlay).find((node) => node.dataset.connectionProfileId === 'profile.reasoning');
await secondChoice.click();
assert.deepEqual(updates.at(-1), { kind: 'utility', patch: { profileId: 'profile.reasoning' } });
assert.match(utilityProfileButton.textContent, /Reasoning profile/);
```

Also assert that an unknown stored ID is displayed verbatim and remains selectable as the current missing value until changed.

- [ ] **Step 2: Run the Settings test to verify RED**

Run: `node tools/scripts/test-certified-settings-panel.mjs`

Expected: FAIL because the existing profile control is an `INPUT` backed by a `DATALIST`.

- [ ] **Step 3: Replace the datalist integration**

Import `createConnectionProfilePicker`. Replace `createProfilePicker` with a button builder that resolves display text from `profile.label || profile.name || profile.id`, opens the shared picker, calls the existing update action, refreshes provider state and feedback, then updates its own text only after a successful save. Do not attach the old generic `change` autosave handler to the button.

- [ ] **Step 4: Run both focused tests to verify GREEN**

Run:

```powershell
node tools/scripts/test-connection-profile-picker.mjs
node tools/scripts/test-certified-settings-panel.mjs
```

Expected: both scripts print their PASS messages.

- [ ] **Step 5: Commit the integration**

```powershell
git add -- src/ui/settings-panel.js tools/scripts/test-certified-settings-panel.mjs
git commit -m "fix(settings): replace profile datalist"
```

### Task 3: Responsive Presentation and Browser Proof

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Consumes: `.connection-profile-picker-overlay`, `.connection-profile-picker-dialog`, `.connection-profile-picker-search`, `.connection-profile-picker-results`, and `.connection-profile-picker-option` emitted by Task 1.
- Produces: centered desktop geometry and a mobile sheet with a single declared vertical scroll owner.

- [ ] **Step 1: Add failing browser geometry assertions**

In the Settings route, activate Connection Profile, open the first profile picker, and measure its dialog, results, options, and long-text wrapping. Assert the results have `data-directive-scroll-owner="true"`, `overflow-y` is `auto` or `scroll`, `overflow-x` is not scrollable, option height is at least 44px at widths up to 640px, and the dialog remains inside the viewport. Assert desktop width is bounded and mobile width occupies nearly the viewport without document overflow.

- [ ] **Step 2: Run the visual test to verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the new picker classes have no bounded dialog, vertical result scrolling, or mobile touch geometry.

- [ ] **Step 3: Add responsive picker styles**

Style the fixed overlay above the Directive runtime, the bounded dialog grid, sticky header/search/actions, and `.connection-profile-picker-results { overflow-y: auto; overflow-x: hidden; }`. Use `overflow-wrap: anywhere` on labels/details. Under `@media (max-width: 640px)`, use a near-full-screen sheet sized with `100dvh`, reduce outer padding, and set every option and action to `min-height: 44px`.

- [ ] **Step 4: Run focused UI verification**

Run:

```powershell
node tools/scripts/test-expanded-interface-visual-conformance.mjs
node tools/scripts/test-connection-profile-picker.mjs
node tools/scripts/test-certified-settings-panel.mjs
```

Expected: all three scripts pass with no page errors or horizontal overflow.

- [ ] **Step 5: Commit presentation and proof**

```powershell
git add -- styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "fix(ui): make profile selection scrollable"
```

### Task 4: Final Verification and Main Push

**Files:**
- Verify only; do not stage `debug.log` or `.codex-remote-attachments/`.

**Interfaces:**
- Consumes: all completed tasks.
- Produces: verified `main` commits pushed to `origin/main`.

- [ ] **Step 1: Run formatting and repository-state checks**

Run:

```powershell
git diff --check -- src/ui/connection-profile-picker.js src/ui/settings-panel.js styles/directive.css tools/scripts/test-connection-profile-picker.mjs tools/scripts/test-certified-settings-panel.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs tools/scripts/run-alpha-gate.mjs
git status --short
```

Expected: no whitespace errors; only the user's pre-existing `debug.log` and `.codex-remote-attachments/` remain outside committed work.

- [ ] **Step 2: Run the complete gate**

Run: `npm.cmd test`

Expected: exit code 0 with the V1 gate summary and all browser-safe module and authored-scenario checks passing.

- [ ] **Step 3: Verify commit and branch state**

Run:

```powershell
git status -sb
git log -5 --oneline
```

Expected: branch is `main`; feature files are clean; pre-existing user files remain uncommitted.

- [ ] **Step 4: Push the verified commits**

Run: `git push origin main`

Expected: `origin/main` advances to the verified local `main` commit.
