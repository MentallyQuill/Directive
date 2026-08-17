# Unified Yellow-Orange Beveled Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Directive notification one yellow-orange 4px-beveled LCARS presentation and replace the preset startup modal with a persistent card in the shared stack.

**Architecture:** Extend the existing notification surface with an independently owned system slot. Add a focused preset-update notification controller that owns persistence and actions, while `runtime-shell.js` only supplies the existing runtime callbacks. Keep gameplay timing and projection authority unchanged.

**Tech Stack:** Browser JavaScript ES modules, CSS, Node.js assertion scripts, fake DOM tests, Playwright Chromium.

## Global Constraints

- The canonical notification accent is exactly `#f2a126`.
- Every Directive notification card has true 4px bevels on all four corners.
- Preset notices are persistent and preserve Open Preset Settings, Later, and Stop Reminders behavior.
- Activity, preset, and gameplay cards share collision avoidance with SillyTavern native toasts.
- Do not change healthy expanded-shell header geometry without a reproducible failure.
- Preserve unrelated `debug.log` work.

---

### Task 1: Add an independently owned system notification slot

**Files:**
- Modify: `src/ui/directive-notification-surface.js`
- Modify: `tools/scripts/test-directive-notification-surface.mjs`

**Interfaces:**
- Produces: `acquireDirectiveNotificationSurface('system')` returning `{ host, activitySlot, systemSlot, gameplaySlot }`.
- Preserves: independent `releaseDirectiveNotificationSurface(owner)` lifetime accounting.

- [ ] **Step 1: Write the failing ownership and slot test**

Add acquisition for `system`, assert one shared host and DOM order `activitySlot`, `systemSlot`, `gameplaySlot`, release activity/gameplay, and assert the host remains until system releases.

```js
const systemSurface = acquireDirectiveNotificationSurface('system');
assert.equal(systemSurface.host, activitySurface.host);
assert.deepEqual(systemSurface.host.children, [
  systemSurface.activitySlot,
  systemSurface.systemSlot,
  systemSurface.gameplaySlot,
]);
releaseDirectiveNotificationSurface('activity');
releaseDirectiveNotificationSurface('gameplay');
assert.equal(document.getElementById('directive-notifications'), systemSurface.host);
releaseDirectiveNotificationSurface('system');
assert.equal(document.getElementById('directive-notifications'), null);
```

- [ ] **Step 2: Verify RED**

Run: `node tools/scripts/test-directive-notification-surface.mjs`

Expected: FAIL because `system` is rejected or `systemSlot` is absent.

- [ ] **Step 3: Implement the minimal system owner and slot**

Add `system` to `OWNER_NAMES`, create `.directive-system-notification-list`, set `aria-live="polite"`, place it between the existing slots, return it from acquisition, and clear it with surface teardown.

- [ ] **Step 4: Verify GREEN**

Run: `node tools/scripts/test-directive-notification-surface.mjs`

Expected: `Directive notification surface tests passed.`

- [ ] **Step 5: Commit**

```bash
git add src/ui/directive-notification-surface.js tools/scripts/test-directive-notification-surface.mjs
git commit -m "feat(ui): add system notification slot"
```

### Task 2: Replace the preset modal with a persistent notification

**Files:**
- Create: `src/ui/preset-update-notification.js`
- Create: `tools/scripts/test-preset-update-notification.mjs`
- Modify: `src/runtime/runtime-shell.js`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `showPresetUpdateNotification(reminder, handlers)` returning `{ shown: boolean }`.
- Produces: `resetPresetUpdateNotification(reason)` returning `{ reset: true, reason }`.
- Consumes handlers: `{ onOpen(): Promise<void>, onLater(): Promise<void>, onDisable(): Promise<void> }`.

- [ ] **Step 1: Write the failing controller test**

Use `installFakeDom()`. Show one reminder, assert one persistent `.directive-preset-update-notification`, exact supplied copy/version, and three buttons. Invoke each action in separate reset/show cycles and assert the corresponding real handler is called once, the card is removed, and the shared surface releases.

```js
const shown = showPresetUpdateNotification(reminder, handlers);
assert.equal(shown.shown, true);
assert.equal(document.querySelectorAll('.directive-preset-update-notification').length, 1);
assert.equal(byAction('open').textContent, 'Open Preset Settings');
assert.equal(byAction('later').textContent, 'Later');
assert.equal(byAction('disable').textContent, 'Stop Reminders');
```

Also show the same reminder twice and assert only one card exists.

- [ ] **Step 2: Verify RED**

Run: `node tools/scripts/test-preset-update-notification.mjs`

Expected: module-not-found failure for `preset-update-notification.js`.

- [ ] **Step 3: Implement the focused controller**

Build one card with the shared card/category/title classes, `data-notification-action` buttons, version metadata, and no timer. Use the system slot. Disable all actions while the selected async handler runs; remove and release the system owner before awaiting navigation/persistence so duplicate cards cannot remain.

- [ ] **Step 4: Route startup reminder through the controller**

Delete `removeDirectivePresetUpdateDialog()` and `createDirectivePresetUpdateDialog()` from `runtime-shell.js`. Call:

```js
return showPresetUpdateNotification(reminder, {
  onOpen: () => openDirectivePresetSettings({ highlight: true }),
  onLater: () => app.dismissDirectivePresetStartupReminder?.({ bundledVersion: reminder.bundledVersion }),
  onDisable: () => app.dismissDirectivePresetStartupReminder?.({ disable: true, bundledVersion: reminder.bundledVersion }),
});
```

Register the new test in `run-alpha-gate.mjs`.

- [ ] **Step 5: Verify GREEN**

Run: `node tools/scripts/test-preset-update-notification.mjs`

Expected: `Preset update notification tests passed.`

- [ ] **Step 6: Commit**

```bash
git add src/ui/preset-update-notification.js src/runtime/runtime-shell.js tools/scripts/test-preset-update-notification.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): move preset prompt into stack"
```

### Task 3: Apply the shared yellow-orange bevel contract

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-gameplay-notification-visual.mjs`
- Modify: `tools/scripts/serve-expanded-interface-preview.mjs`

**Interfaces:**
- Consumes: all `.directive-notification-card` variants.
- Produces: computed `borderLeftColor === rgb(242, 161, 38)` and polygonal 4px corner coverage for every card.

- [ ] **Step 1: Change the visual test to require one accent and bevel geometry**

Replace the distinct-route-color assertion with exact uniform color assertions. Read `clipPath` for every card and assert the 4px polygon. Add the preset fixture card and assert it shares the same color, geometry, stacking surface, keyboard-visible actions, and no animation under reduced motion.

```js
assert.deepEqual(new Set(cardStyles.map(({ borderLeftColor }) => borderLeftColor)), new Set(['rgb(242, 161, 38)']));
assert.equal(cardStyles.every(({ clipPath }) => clipPath.includes('4px')), true);
```

- [ ] **Step 2: Verify RED**

Run: `node tools/scripts/test-gameplay-notification-visual.mjs`

Expected: FAIL because People/Ship use distinct colors, cards are rounded, and no preset card fixture exists.

- [ ] **Step 3: Implement the minimal shared styles**

Remove route/activity accent overrides. Add the system list to shared spacing. Give `.directive-notification-card` a matched outer and inner 4px polygon treatment, square border radius, preserved shadow, and child stacking above the inner surface. Add compact preset content/actions styles with 44px mobile targets and visible focus.

- [ ] **Step 4: Expose a fixture-only preset proof hook**

Import the controller in the preview fixture and expose `__directiveShowPresetUpdateNotification(reminder, handlers)` without touching campaign state.

- [ ] **Step 5: Verify GREEN**

Run: `node tools/scripts/test-gameplay-notification-visual.mjs`

Expected: `Directive gameplay notification visual tests passed.`

- [ ] **Step 6: Commit**

```bash
git add styles/directive.css tools/scripts/test-gameplay-notification-visual.mjs tools/scripts/serve-expanded-interface-preview.mjs
git commit -m "style(ui): unify beveled notifications"
```

### Task 4: Guard header containment and complete release verification

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Produces: geometry assertions that brand, route path, and close action remain inside both top bar and shell at all 25 route/viewports.

- [ ] **Step 1: Add direct containment measurements**

Measure the shell, top bar, brand, route path, and close action in the existing viewport loop. Assert each child starts at or below the shell/top-bar top and ends at or above neither bottom boundary, with 0.5px tolerance.

- [ ] **Step 2: Run focused verification**

```bash
node tools/scripts/test-directive-notification-surface.mjs
node tools/scripts/test-preset-update-notification.mjs
node tools/scripts/test-gameplay-notification-visual.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all focused suites pass.

- [ ] **Step 3: Run the full alpha gate**

Run: `npm.cmd test`

Expected: exit 0 with every production module and browser safety check passing.

- [ ] **Step 4: Verify diff scope and commit**

Run `git diff --check`, inspect `git status --short`, preserve unrelated `debug.log`, then commit only the header test if it was not included in Task 3.

```bash
git add tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "test(ui): guard shell header containment"
```

- [ ] **Step 5: Synchronize and live-verify**

Copy only changed production files into the exact active installed Directive extension, verify SHA-256 parity, reload SillyTavern, and confirm notification color, bevels, preset actions, stack collision behavior, and top-bar containment in the real browser.

- [ ] **Step 6: Reconcile and push main**

Use GitHub CLI with network permission to verify authentication and remote state, fetch current `origin/main`, preserve any independent remote work, rerun affected verification after reconciliation, push `main`, and confirm remote SHA equals local SHA.
