# Unified Directive Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Directive activity and authoritative gameplay cards in one icon-led upper-chat stack that dynamically avoids SillyTavern's visible native toasts.

**Architecture:** Add a presentation-only notification surface that owns shared DOM slots, chat-panel geometry, native-toast collision avoidance, observers, and teardown. Keep gameplay queue/timer/navigation authority in `gameplay-notification-center.js` and turn-token/handoff authority in `turn-activity-indicator.js`; both acquire a slot from the shared surface and render the same card grammar.

**Tech Stack:** Browser-native ES modules, DOM APIs, ResizeObserver, MutationObserver, CSS masks and animations, Node.js assertion tests, Playwright Chromium, SillyTavern toastr DOM conventions.

## Global Constraints

- SillyTavern native notifications have collision priority; never mutate toastr settings, classes, cards, timing, or ownership.
- Place Directive inside the rendered `#sheld` chat width and below the rendered `#top-bar`.
- Activity and gameplay cards stack simultaneously; activity does not consume any of the three gameplay slots.
- Activity stays lifecycle-controlled and non-dismissible; gameplay retains six-second timing, pause, dismiss, and View behavior.
- Gameplay eligibility and publication remain committed V1 projection-delta behavior after successful persistence.
- Use only existing `route-campaign`, `route-mission`, `route-crew`, `route-ship`, and `action-view` SVG glyphs.
- Preserve the `360.5px` compact View boundary, polite live behavior, focus treatment, and reduced-motion support.
- Keep existing unrelated `debug.log` and `.codex-remote-attachments/` work untouched.

---

### Task 1: Shared notification surface and collision geometry

**Files:**
- Create: `src/ui/directive-notification-surface.js`
- Create: `tools/scripts/test-directive-notification-surface.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `acquireDirectiveNotificationSurface(owner: 'activity' | 'gameplay') -> { host, activitySlot, gameplaySlot }`
- Produces: `releaseDirectiveNotificationSurface(owner: 'activity' | 'gameplay') -> { released, owners }`
- Produces: `refreshDirectiveNotificationSurface() -> { left, top, shiftedByNativeToast } | null`
- Produces: `resetDirectiveNotificationSurface(reason: string) -> { reset, reason }`
- Produces test hook `__directiveNotificationSurfaceTestHooks.computePlacement(input)` with rectangle-only deterministic geometry.

- [ ] **Step 1: Write the failing surface tests**

Create `tools/scripts/test-directive-notification-surface.mjs` with fake DOM rectangles and observer doubles. Cover owner sharing, below-top-bar placement, chat-panel horizontal centering, top-center collision, side-toast non-collision, top-side collision on narrow chat widths, native-toast removal, and final-owner teardown.

```js
import assert from 'node:assert/strict';
import {
  __directiveNotificationSurfaceTestHooks,
  acquireDirectiveNotificationSurface,
  releaseDirectiveNotificationSurface,
  resetDirectiveNotificationSurface,
} from '../../src/ui/directive-notification-surface.js';

const placement = __directiveNotificationSurfaceTestHooks.computePlacement({
  chatRect: { left: 340, top: 48, right: 940, bottom: 800, width: 600, height: 752 },
  topBarRect: { left: 340, top: 0, right: 940, bottom: 48, width: 600, height: 48 },
  surfaceSize: { width: 340, height: 210 },
  toastRects: [{ left: 490, top: 48, right: 790, bottom: 110, width: 300, height: 62 }],
});
assert.deepEqual(placement, { left: 640, top: 116, shiftedByNativeToast: true, width: 340 });
```

- [ ] **Step 2: Register and run the new test to verify RED**

Add `"test-directive-notification-surface.mjs"` immediately before `"test-gameplay-notification-center.mjs"` in `tools/scripts/run-alpha-gate.mjs`.

Run: `node tools/scripts/test-directive-notification-surface.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `directive-notification-surface.js`.

- [ ] **Step 3: Implement deterministic placement**

Create `src/ui/directive-notification-surface.js` with a pure collision function. Base placement is `max(chatRect.top + 8, topBarRect.bottom + 8)`, horizontal center is the chat rectangle center, maximum width is `min(340, viewportWidth - 24, chatRect.width - 16)`, and a native collision shifts below the colliding toast by `6px`.

```js
function rectanglesIntersect(left, right) {
  return left.left < right.right && left.right > right.left
    && left.top < right.bottom && left.bottom > right.top;
}

function computePlacement({ chatRect, topBarRect, surfaceSize, toastRects = [], viewportWidth = globalThis.innerWidth || 1280 }) {
  const width = Math.max(0, Math.min(340, viewportWidth - 24, chatRect.width - 16));
  const left = chatRect.left + (chatRect.width / 2);
  let top = Math.max(chatRect.top + 8, (topBarRect?.bottom || chatRect.top) + 8);
  let shiftedByNativeToast = false;
  for (const toast of [...toastRects].sort((a, b) => a.top - b.top)) {
    const candidate = { left: left - width / 2, right: left + width / 2, top, bottom: top + surfaceSize.height };
    if (!rectanglesIntersect(candidate, toast)) continue;
    top = toast.bottom + 6;
    shiftedByNativeToast = true;
  }
  return { left, top, shiftedByNativeToast, width };
}
```

- [ ] **Step 4: Implement surface ownership and slots**

Create one `#directive-notifications` region with `.directive-notification-activity-slot` and `.directive-gameplay-notification-list`. Append it through `appendDirectiveOverlay`. Track owners in a `Set`; acquire mounts once and release removes the host only when the last owner leaves.

```js
export function acquireDirectiveNotificationSurface(owner) {
  if (!new Set(['activity', 'gameplay']).has(owner)) throw new TypeError('Unknown Directive notification owner.');
  owners.add(owner);
  ensureSurface();
  startObservers();
  refreshDirectiveNotificationSurface();
  return { host, activitySlot, gameplaySlot };
}
```

- [ ] **Step 5: Implement collision observation and cleanup**

Observe the surface, `#sheld`, `#top-bar`, and visible `#toast-container > .toast` children with ResizeObserver when available. Observe document subtree child, class, and style mutations with MutationObserver. Refresh on window resize. Re-scan toast children before every measurement, compare geometry before writing inline `left`, `top`, and `width`, and disconnect everything after the final release.

- [ ] **Step 6: Run focused surface tests to verify GREEN**

Run: `node tools/scripts/test-directive-notification-surface.mjs`

Expected: `Directive notification surface tests passed.`

- [ ] **Step 7: Commit the shared surface**

```powershell
git add -- src/ui/directive-notification-surface.js tools/scripts/test-directive-notification-surface.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(ui): add shared notification surface"
```

---

### Task 2: Gameplay cards adopt shared surface and route title glyphs

**Files:**
- Modify: `src/ui/gameplay-notification-center.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-gameplay-notification-center.mjs`
- Modify: `tools/scripts/test-gameplay-notification-visual.mjs`

**Interfaces:**
- Consumes: `acquireDirectiveNotificationSurface('gameplay')` and `releaseDirectiveNotificationSurface('gameplay')`
- Preserves: `publishGameplayNotifications`, `resetGameplayNotifications`, `handleGameplayNotificationUiMessage`, and existing test-hook contracts.
- Produces: title glyph mapping `mission -> route-mission`, `people -> route-crew`, `ship -> route-ship`.

- [ ] **Step 1: Extend gameplay DOM tests for shared host and icons**

Add assertions before implementation:

```js
assert.equal(document.querySelectorAll('#directive-notifications').length, 1);
assert.equal(document.querySelector('.directive-notification-title-icon').dataset.glyph, 'route-mission');
assert.equal(document.querySelector('.directive-gameplay-notification-list').getAttribute('aria-live'), 'polite');
```

Publish Mission, People, and Ship records and assert the three glyph values are `route-mission`, `route-crew`, and `route-ship`. Reset gameplay and assert its owner/content clears without assuming the shared host must disappear when an activity owner exists.

- [ ] **Step 2: Run gameplay tests to verify RED**

Run: `node tools/scripts/test-gameplay-notification-center.mjs`

Expected: FAIL because the current host is `#directive-gameplay-notifications` and no title glyph exists.

- [ ] **Step 3: Replace private host ownership with the shared gameplay slot**

Remove `host`/`list` creation from `gameplay-notification-center.js`. Acquire the surface before showing the first card, append cards to `gameplaySlot`, and release the gameplay owner after reset or after the final exiting card is removed and no queued card remains.

```js
function routeGlyph(route) {
  if (route === 'people') return 'route-crew';
  if (route === 'ship') return 'route-ship';
  return 'route-mission';
}
```

- [ ] **Step 4: Add the shared title-row structure**

Inside the existing dismiss button, keep category first, then append a `.directive-notification-title-row` containing a decorative `.directive-vector-glyph.directive-notification-title-icon` and the existing strong title, followed by summary. Keep View as a sibling button and retain `action-view`.

```js
const titleRow = createElement('span', 'directive-notification-title-row');
const titleIcon = createElement('span', 'directive-vector-glyph directive-notification-title-icon');
titleIcon.dataset.glyph = routeGlyph(record.route);
titleIcon.setAttribute('aria-hidden', 'true');
titleRow.append(titleIcon, title);
```

- [ ] **Step 5: Generalize card CSS without changing gameplay behavior**

Rename the host selector to `.directive-notification-surface`, keep `.directive-gameplay-notification-list`, and introduce `.directive-notification-card` for the shared surface, border, rail, shadow, enter/exit motion, and reduced motion. Keep gameplay-specific two-column layout and View rules. Add a 15px title icon and min-width-zero title row. Preserve route colors and the `360.5px` View-label rule.

- [ ] **Step 6: Update Playwright glyph and chat geometry assertions**

In `test-gameplay-notification-visual.mjs`, assert each route's title icon mask, assert the surface center equals `#sheld` center, and assert the surface top is below `#top-bar` rather than using the old raw viewport range.

- [ ] **Step 7: Run focused gameplay tests to verify GREEN**

Run: `node tools/scripts/test-gameplay-notification-center.mjs`

Run: `node tools/scripts/test-gameplay-notification-visual.mjs`

Expected: both pass; dismissal, View routing, timers, pause, queue, reduced motion, and `360.5px` behavior remain green.

- [ ] **Step 8: Commit gameplay integration**

```powershell
git add -- src/ui/gameplay-notification-center.js styles/directive.css tools/scripts/test-gameplay-notification-center.mjs tools/scripts/test-gameplay-notification-visual.mjs
git commit -m "feat(ui): unify gameplay notification cards"
```

---

### Task 3: Turn activity adopts the unified card stack

**Files:**
- Modify: `src/hosts/sillytavern/turn-activity-indicator.js`
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-sillytavern-event-wiring.mjs`
- Modify: `tools/scripts/test-turn-activity-indicator-visual.mjs`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`

**Interfaces:**
- Consumes: `acquireDirectiveNotificationSurface('activity')` and `releaseDirectiveNotificationSurface('activity')`.
- Preserves: activity token functions, `350ms` reveal, latest-token precedence, `150ms` generation handoff, cancellation, and disposal.
- Produces: activity category/title presentation and `route-campaign` decorative glyph.

- [ ] **Step 1: Write failing activity integration assertions**

Update event-wiring and visual tests to require one shared host, activity in its dedicated slot, no button or View control, category/title split, `route-campaign`, and simultaneous activity plus three gameplay cards.

```js
assert.equal(boundaryActivity?.querySelector('.directive-notification-category')?.textContent, 'Directive');
assert.equal(boundaryActivity?.querySelector('.directive-turn-activity-label')?.textContent, 'Reading your post...');
assert.equal(boundaryActivity?.querySelector('.directive-notification-title-icon')?.dataset.glyph, 'route-campaign');
assert.equal(boundaryActivity?.querySelector('button'), null);
```

- [ ] **Step 2: Run activity tests to verify RED**

Run: `node tools/scripts/test-sillytavern-event-wiring.mjs`

Run: `node tools/scripts/test-turn-activity-indicator-visual.mjs`

Expected: FAIL because the old activity indicator is a bottom pill with spinner and complete-sentence label.

- [ ] **Step 3: Render activity through the shared surface**

Build the indicator as `article.directive-notification-card.directive-turn-activity-indicator.is-activity`, with a non-interactive copy wrapper, category, title row, `route-campaign` glyph, and strong label. Acquire only when the reveal delay elapses; append to `activitySlot`. Release and remove when the last token clears.

```js
function activityPresentation(activity) {
  return activity?.phase === 'writing'
    ? { category: 'SillyTavern', title: 'Writing...' }
    : { category: 'Directive', title: 'Reading your post...' };
}
```

Keep custom caller labels as a fallback title when a phase is neither `reading` nor `writing`.

- [ ] **Step 4: Replace pill/spinner CSS with activity-card rules**

Delete the bottom positioning, old theme-derived pill background, circular spinner, and spinner keyframes if unused. Add salmon accent, one-column grid, pointer-events none, title-glyph opacity pulse, and static reduced-motion glyph.

- [ ] **Step 5: Expose fixture controls for combined browser proof**

In `expanded-interface-runtime-fixture.mjs`, export fixture-only helpers that start and clear activity through the production module, plus a helper that mounts a SillyTavern-shaped `#toast-container` and `.toast` card without using toastr or mutating campaign data.

- [ ] **Step 6: Verify activity and gameplay coexistence**

Run the two focused activity tests and `test-gameplay-notification-center.mjs`. Assert three gameplay cards stay visible while the activity card is also visible and that clearing activity leaves all gameplay cards untouched.

- [ ] **Step 7: Commit activity integration**

```powershell
git add -- src/hosts/sillytavern/turn-activity-indicator.js styles/directive.css tools/scripts/test-sillytavern-event-wiring.mjs tools/scripts/test-turn-activity-indicator-visual.mjs tools/fixtures/expanded-interface-runtime-fixture.mjs
git commit -m "feat(ui): unify turn activity notifications"
```

---

### Task 4: Browser collision proof, installed verification, and release

**Files:**
- Modify: `tools/scripts/test-gameplay-notification-visual.mjs`
- Modify if diagnostics are generated: `debug.log` only by removing lines produced during this task, never pre-existing user content.

**Interfaces:**
- Consumes: production surface geometry and fixture-only native-toast helper.
- Produces: browser evidence for non-overlap, responsive placement, return-to-base behavior, and installed source parity.

- [ ] **Step 1: Add failing native-toast collision scenarios**

Add Playwright cases for desktop top-center, desktop top-left outside the chat lane, 360px top-center, native-toast removal, and reduced motion. Compare actual rectangles:

```js
const geometry = await page.evaluate(() => {
  const directive = document.querySelector('#directive-notifications').getBoundingClientRect();
  const toast = document.querySelector('#toast-container > .toast').getBoundingClientRect();
  return { directive: { top: directive.top, left: directive.left, right: directive.right }, toast: { bottom: toast.bottom, left: toast.left, right: toast.right } };
});
assert.ok(geometry.directive.top >= geometry.toast.bottom + 6);
```

- [ ] **Step 2: Run browser test to verify RED, then complete geometry refresh fixes**

Run: `node tools/scripts/test-gameplay-notification-visual.mjs`

Expected before final geometry fixes: at least the native-toast collision or removal-return assertion fails. Adjust only surface measurement/observation until every rectangle assertion passes.

- [ ] **Step 3: Run all focused notification checks**

Run:

```powershell
node tools/scripts/test-directive-notification-surface.mjs
node tools/scripts/test-gameplay-notification-center.mjs
node tools/scripts/test-gameplay-notification-visual.mjs
node tools/scripts/test-sillytavern-event-wiring.mjs
node tools/scripts/test-turn-activity-indicator-visual.mjs
node tools/scripts/test-directive-runtime-overlay-host.mjs
```

Expected: every command exits zero.

- [ ] **Step 4: Run the full Directive gate**

Run: `npm.cmd test`

Expected: all focused scripts and production-module browser safety pass with exit code zero.

- [ ] **Step 5: Inspect and clean only generated diagnostics**

Compare `git diff -- debug.log` to the pre-task state. Remove only Chromium diagnostic lines generated by this feature's browser runs. Leave every pre-existing line and unrelated untracked path untouched. Run `git diff --check` and `git status --short`.

- [ ] **Step 6: Commit final browser proof or amendments**

```powershell
git add -- tools/scripts/test-gameplay-notification-visual.mjs src/ui/directive-notification-surface.js styles/directive.css
git commit -m "test(ui): prove notification coexistence"
```

Omit unchanged paths; use `git status --short` to stage only feature-owned files.

- [ ] **Step 7: Synchronize the production extension into the installed Directive copy**

Resolve the active installed path without changing chats or campaign data. Copy only changed production files and the existing icon assets they reference. Hash-compare source and installed files. Do not copy `.git`, tests, docs, `debug.log`, or campaign/save data.

- [ ] **Step 8: Perform installed browser verification**

In the active SillyTavern session, verify reading activity, brief writing handoff, one Mission/People/Ship proof stack through fixture or non-mutating UI hooks, a native toast at the configured position, non-intersecting rectangles, View behavior, mobile geometry, and zero new console errors. Do not mutate the active campaign save.

- [ ] **Step 9: Reconcile and push verified commits to main**

Fetch current remote state, preserve concurrent commits, and re-run affected focused tests if reconciliation changes feature files. Then push the verified local `main`:

```powershell
git pull --rebase --autostash origin main
git push origin main
```

Verify local `HEAD` equals `origin/main` and report the exact pushed SHA, focused checks, full gate, installed hash parity, and live interaction evidence separately.
