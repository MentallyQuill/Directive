# Campaign-Required Empty State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain invalid-current-chat message on Mission, People, and Ship with a centered ship-status panel that teaches the existing Campaign-tab flow and pulses that tab at 0.5 Hz.

**Architecture:** A focused UI module renders the structured campaign-required panel and exposes one shell synchronization function. Mission, People, and Ship opt into that renderer only at their existing missing-projection guard; the runtime shell reads the body marker after every render and owns the navigation cue, so the panel never reaches outward or creates a second route action.

**Tech Stack:** Browser-native ES modules, fake-DOM Node tests, CSS animations and reduced-motion media queries, Playwright Chromium visual/interaction checks.

## Global Constraints

- Campaign remains the sole actionable destination; do not add a duplicate button, connector line, arrow, or save-loading handler.
- Pulse frequency is exactly 0.5 Hz: one complete illumination cycle every two seconds.
- Animate only internal illumination, border strength, icon color, and label color; do not animate transform, scale, position, or geometry and do not add an external neon halo.
- Under `prefers-reduced-motion: reduce`, retain a steady emphasized Campaign state with no animation.
- Apply the structured state only to invalid current-chat/save bindings on Mission, People, and Ship; preserve generic empty collections and runtime errors.
- Preserve Campaign tab click, keyboard, tooltip, roving-focus, `aria-selected`, `aria-current`, and touch-target behavior.
- Preserve unrelated `debug.log`, `.codex-remote-attachments/`, and concurrent worktree changes.

---

## File Structure

- Create `src/ui/current-chat-empty-state.js`: render the structured panel, declare stable IDs/copy, mark the owning body, and synchronize Campaign guidance state without selecting a route.
- Modify `src/ui/mission-panel.js`: use the dedicated renderer at the existing missing-projection guard.
- Modify `src/ui/crew-panel.js`: use the dedicated renderer at the existing missing-projection guard.
- Modify `src/ui/ship-panel.js`: use the dedicated renderer at the existing missing-projection guard.
- Modify `src/runtime/runtime-shell.js`: clear and resynchronize Campaign guidance around every route render and error path.
- Modify `styles/directive.css`: style the centered status panel and exact two-second internal-light pulse, including mobile and reduced-motion rules.
- Create `tools/scripts/test-campaign-required-empty-state.mjs`: focused fake-DOM structural, state-transition, accessibility, and CSS contract coverage.
- Modify `tools/fixtures/expanded-interface-runtime-fixture.mjs`: add a read-only query mode that renders an invalid-current-chat view and applies the same shell synchronization function.
- Create `tools/scripts/test-campaign-required-empty-state-visual.mjs`: desktop/mobile/reduced-motion Playwright geometry, perceptibility, and interaction coverage.
- Modify `tools/scripts/run-alpha-gate.mjs`: include the focused structural and visual checks in the full repository gate.

---

### Task 1: Structured Current-Chat Empty State

**Files:**
- Create: `src/ui/current-chat-empty-state.js`
- Modify: `src/ui/mission-panel.js:1-3,126-132`
- Modify: `src/ui/crew-panel.js:1-3,62-68`
- Modify: `src/ui/ship-panel.js:1-3,7-13`
- Create: `tools/scripts/test-campaign-required-empty-state.mjs`

**Interfaces:**
- Consumes: `currentChatEmptyMessage(view, fallback?)`, `createElement(tag, className)`, `createIconFromDescriptor(descriptor, options)`, `resolveDirectiveIconSlot(pack, 'route.ship')`.
- Produces: `CAMPAIGN_GUIDANCE_INSTRUCTION_ID: string`, `appendCurrentChatEmptyState(container, view): HTMLElement`, and the body marker `container.dataset.campaignRequired = 'true'`.

- [ ] **Step 1: Write the failing renderer and panel-guard tests**

Create a fake-DOM test that imports all three panel renderers plus the new module and proves the exact structure and isolation:

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appendCurrentChatEmptyState, CAMPAIGN_GUIDANCE_INSTRUCTION_ID } from '../../src/ui/current-chat-empty-state.js';
import { renderMissionPanel } from '../../src/ui/mission-panel.js';
import { renderCrewPanel } from '../../src/ui/crew-panel.js';
import { renderShipPanel } from '../../src/ui/ship-panel.js';

const body = document.createElement('section');
appendCurrentChatEmptyState(body, { currentChat: { status: 'none-selected' } });
assert.equal(body.dataset.campaignRequired, 'true');
assert.equal(body.querySelectorAll('.directive-campaign-required').length, 1);
assert.equal(body.querySelector('.directive-campaign-required-eyebrow').textContent, 'CAMPAIGN CONNECTION REQUIRED');
assert.equal(
  body.querySelector(`#${CAMPAIGN_GUIDANCE_INSTRUCTION_ID}`).textContent,
  'Open Campaign below, then choose or load a save to bring this panel online.'
);
assert.equal(body.querySelector('.directive-campaign-required-icon').dataset.glyph, 'route-ship');
assert.equal(body.querySelector('.directive-campaign-required-icon').getAttribute('aria-hidden'), 'true');
assert.match(body.querySelector('.directive-campaign-required-detail').textContent, /Campaign Records/);

for (const render of [renderMissionPanel, renderCrewPanel, renderShipPanel]) {
  const routeBody = document.createElement('section');
  render(routeBody, { currentChat: { status: 'none-selected' } });
  assert.equal(routeBody.dataset.campaignRequired, 'true');
  assert.equal(routeBody.querySelectorAll('.directive-runtime-empty').length, 0);
}

const missionSource = fs.readFileSync(new URL('../../src/ui/mission-panel.js', import.meta.url), 'utf8');
assert.match(missionSource, /No current V1 mission is available/);
```

The fake element must support `append`, `appendChild`, `setAttribute`, `getAttribute`, `removeAttribute`, `querySelector`, and `querySelectorAll` for IDs, classes, and `[data-*]` selectors. Its `classList` must implement `add`, `remove`, and `toggle(name, force)`. Keep the implementation local to this test.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-campaign-required-empty-state.mjs`

Expected: FAIL because `src/ui/current-chat-empty-state.js` does not exist.

- [ ] **Step 3: Implement the dedicated renderer**

Create the focused module with stable player-facing copy and the bundled ship glyph:

```js
import { currentChatEmptyMessage } from './current-chat-scope-copy.js';
import { createElement, createIconFromDescriptor } from './runtime-ui-kit.js';
import { DIRECTIVE_BUNDLED_ICON_PACKS, resolveDirectiveIconSlot } from '../theme/directive-icon-packs.mjs';

export const CAMPAIGN_GUIDANCE_INSTRUCTION_ID = 'directive-campaign-guidance-instruction';
export const CAMPAIGN_GUIDANCE_INSTRUCTION = 'Open Campaign below, then choose or load a save to bring this panel online.';

export function appendCurrentChatEmptyState(container, view) {
  container.dataset.campaignRequired = 'true';
  const surface = createElement('section', 'directive-campaign-required');
  const icon = createIconFromDescriptor(
    resolveDirectiveIconSlot(DIRECTIVE_BUNDLED_ICON_PACKS[0], 'route.ship'),
    { slot: 'route.ship', fallbackClass: 'fa-solid fa-shuttle-space', className: 'directive-campaign-required-icon' }
  );
  icon.setAttribute('aria-hidden', 'true');
  const copy = createElement('div', 'directive-campaign-required-copy');
  const eyebrow = createElement('span', 'directive-campaign-required-eyebrow');
  eyebrow.textContent = 'CAMPAIGN CONNECTION REQUIRED';
  const instruction = createElement('p', 'directive-campaign-required-instruction');
  instruction.id = CAMPAIGN_GUIDANCE_INSTRUCTION_ID;
  instruction.textContent = CAMPAIGN_GUIDANCE_INSTRUCTION;
  const detail = createElement('p', 'directive-campaign-required-detail');
  detail.textContent = currentChatEmptyMessage(view);
  copy.append(eyebrow, instruction, detail);
  surface.append(icon, copy);
  container.appendChild(surface);
  return surface;
}
```

Replace only each panel's `appendEmpty(body, currentChatEmptyMessage(view))` guard with `appendCurrentChatEmptyState(body, view)`. Remove now-unused imports without changing the valid-projection path or the mission's valid-but-empty message.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-campaign-required-empty-state.mjs`

Expected: PASS for the renderer, all three guarded routes, bundled icon, exact instruction, and generic-empty isolation.

- [ ] **Step 5: Commit the renderer slice**

```powershell
git add -- src/ui/current-chat-empty-state.js src/ui/mission-panel.js src/ui/crew-panel.js src/ui/ship-panel.js tools/scripts/test-campaign-required-empty-state.mjs
git commit -m "feat(ui): add campaign guidance state"
```

---

### Task 2: Shell Guidance State and 0.5 Hz Pulse

**Files:**
- Modify: `src/ui/current-chat-empty-state.js`
- Modify: `src/runtime/runtime-shell.js:1-22,115-135,281-299`
- Modify: `styles/directive.css:3274-3388,3798-3815`
- Modify: `tools/scripts/test-campaign-required-empty-state.mjs`

**Interfaces:**
- Consumes: `CAMPAIGN_GUIDANCE_INSTRUCTION_ID` and the body marker `dataset.campaignRequired` from Task 1.
- Produces: `syncCampaignRequiredGuidance(panel, body): boolean`, shell marker `data-campaign-guidance="true"`, Campaign-control class `is-campaign-guidance-target`, and temporary `aria-describedby="directive-campaign-guidance-instruction"`.

- [ ] **Step 1: Extend the focused test for state synchronization and CSS**

Add assertions that build a shell with `createDirectiveExpandedShell()`, mark its body, synchronize it, and clear it:

```js
import { createDirectiveExpandedShell } from '../../src/ui/directive-expanded-shell.js';
import { syncCampaignRequiredGuidance } from '../../src/ui/current-chat-empty-state.js';

const shell = createDirectiveExpandedShell({
  routes: ['campaign', 'mission', 'people', 'ship', 'settings'].map((id) => ({ id, label: id })),
  activeRouteId: 'ship'
});
const shellBody = shell.querySelector('[data-directive-runtime-body="true"]');
appendCurrentChatEmptyState(shellBody, { currentChat: { status: 'none-selected' } });
assert.equal(syncCampaignRequiredGuidance(shell, shellBody), true);
const campaign = shell.querySelector('[data-route-id="campaign"]');
assert.match(campaign.className, /is-campaign-guidance-target/);
assert.equal(campaign.getAttribute('aria-describedby'), CAMPAIGN_GUIDANCE_INSTRUCTION_ID);
delete shellBody.dataset.campaignRequired;
assert.equal(syncCampaignRequiredGuidance(shell, shellBody), false);
assert.doesNotMatch(campaign.className, /is-campaign-guidance-target/);
assert.equal(campaign.getAttribute('aria-describedby'), null);

const css = fs.readFileSync(new URL('../../styles/directive.css', import.meta.url), 'utf8');
assert.match(css, /@keyframes\s+directive-campaign-guidance-pulse/);
assert.match(css, /animation:\s*directive-campaign-guidance-pulse\s+2s\s+ease-in-out\s+infinite/);
assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?is-campaign-guidance-target[\s\S]*?animation:\s*none/);
assert.doesNotMatch(css.match(/@keyframes\s+directive-campaign-guidance-pulse[\s\S]*?\n\}/)?.[0] || '', /transform:/);
```

Also read `src/runtime/runtime-shell.js` and assert it clears `body.dataset.campaignRequired` before rendering and invokes `syncCampaignRequiredGuidance(panel, body)` on both success and catch paths.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-campaign-required-empty-state.mjs`

Expected: FAIL because the synchronization export, runtime calls, and pulse CSS do not exist.

- [ ] **Step 3: Implement shell-owned synchronization**

Add this focused export without selecting or clicking a route:

```js
export function syncCampaignRequiredGuidance(panel, body) {
  const required = body?.dataset?.campaignRequired === 'true';
  const campaign = panel?.querySelector?.('[data-route-id="campaign"]');
  panel?.setAttribute?.('data-campaign-guidance', required ? 'true' : 'false');
  campaign?.classList?.toggle?.('is-campaign-guidance-target', required);
  if (required) campaign?.setAttribute?.('aria-describedby', CAMPAIGN_GUIDANCE_INSTRUCTION_ID);
  else campaign?.removeAttribute?.('aria-describedby');
  return required;
}
```

In `renderBody(panel)`, delete the stale body marker and synchronize the cleared state immediately after `clearElement(body)`. Synchronize again after `renderActivePanel(body, view)`. On the catch path, clear the marker before appending the runtime error and synchronize false afterward.

- [ ] **Step 4: Implement the centered panel and exact pulse CSS**

Add route-body-scoped styles using the existing expanded-interface colors:

```css
.directive-expanded-shell .directive-campaign-required {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: clamp(14px, 3vw, 24px);
  width: min(620px, calc(100% - 32px));
  margin: auto;
  padding: clamp(18px, 4vw, 30px);
  border: 1px solid color-mix(in srgb, var(--directive-expanded-amber) 46%, transparent);
  border-radius: 8px 0 8px 8px;
  background: color-mix(in srgb, var(--directive-expanded-surface) 92%, transparent);
  box-shadow: inset 4px 0 0 color-mix(in srgb, var(--directive-expanded-amber) 78%, transparent);
}

@keyframes directive-campaign-guidance-pulse {
  0%, 100% {
    color: color-mix(in srgb, var(--directive-route-color) 88%, white);
    background: color-mix(in srgb, var(--directive-route-color) 8%, transparent);
    border-bottom-color: color-mix(in srgb, var(--directive-route-color) 62%, transparent);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--directive-route-color) 28%, transparent),
      inset 0 0 10px color-mix(in srgb, var(--directive-route-color) 8%, transparent);
  }
  50% {
    color: color-mix(in srgb, var(--directive-route-color) 96%, white);
    background: color-mix(in srgb, var(--directive-route-color) 24%, transparent);
    border-bottom-color: color-mix(in srgb, var(--directive-route-color) 94%, transparent);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--directive-route-color) 66%, transparent),
      inset 0 0 20px color-mix(in srgb, var(--directive-route-color) 22%, transparent);
  }
}

.directive-expanded-shell .directive-route-control.is-campaign-guidance-target:not(.active) {
  animation: directive-campaign-guidance-pulse 2s ease-in-out infinite;
}
```

Give the bundled ship glyph a stable non-shrinking size and amber mask color. Use condensed uppercase styling for the eyebrow and readable normal-case styling for instruction/detail copy. At a narrow breakpoint, stack the icon above the copy only if the horizontal layout cannot retain readable width.

In the existing reduced-motion media query, set `animation: none` and apply the keyframe's emphasized steady colors. Do not change Campaign control geometry or its hover/focus/active selectors.

- [ ] **Step 5: Run focused shell and guidance tests**

Run:

```powershell
node tools/scripts/test-campaign-required-empty-state.mjs
node tools/scripts/test-expanded-interface-shell.mjs
node tools/scripts/test-expanded-interface-focus.mjs
```

Expected: all PASS; the state cleans up, the 2-second cycle is exact, reduced motion is static, and existing route behavior remains intact.

- [ ] **Step 6: Commit the shell and visual-contract slice**

```powershell
git add -- src/ui/current-chat-empty-state.js src/runtime/runtime-shell.js styles/directive.css tools/scripts/test-campaign-required-empty-state.mjs
git commit -m "feat(ui): pulse campaign guidance tab"
```

---

### Task 3: Responsive Browser Certification and Full Gate

**Files:**
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs:18-25,149-208,232-251`
- Create: `tools/scripts/test-campaign-required-empty-state-visual.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs:1-42`
- Modify if browser evidence reveals a scoped defect: `styles/directive.css`

**Interfaces:**
- Consumes: `appendCurrentChatEmptyState()` through the three route renderers and `syncCampaignRequiredGuidance(shell, body)` from Tasks 1-2.
- Produces: fixture URL `?route=<mission|people|ship>&campaignRequired=1` and a full-gate registered visual check.

- [ ] **Step 1: Add the failing visual check and full-gate registration**

Create a Playwright test using `serve-expanded-interface-preview.mjs`. For desktop `1280 x 800`, mobile `390 x 844`, and narrow mobile `360 x 780`, visit all three affected routes with `campaignRequired=1` and assert:

```js
const panel = page.locator('.directive-campaign-required');
const body = page.locator('[data-directive-runtime-body="true"]');
const campaign = page.locator('[data-route-id="campaign"]');
const geometry = await page.evaluate(() => {
  const bodyRect = document.querySelector('[data-directive-runtime-body="true"]').getBoundingClientRect();
  const panelRect = document.querySelector('.directive-campaign-required').getBoundingClientRect();
  const navRect = document.querySelector('.directive-route-bar').getBoundingClientRect();
  const box = ({ left, top, right, bottom, width, height }) => ({ left, top, right, bottom, width, height });
  return {
    bodyRect: box(bodyRect),
    panelRect: box(panelRect),
    navRect: box(navRect),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
});
assert.ok(Math.abs((geometry.panelRect.left + geometry.panelRect.width / 2) - (geometry.bodyRect.left + geometry.bodyRect.width / 2)) <= 2);
assert.ok(Math.abs((geometry.panelRect.top + geometry.panelRect.height / 2) - (geometry.bodyRect.top + geometry.bodyRect.height / 2)) <= 3);
assert.ok(geometry.panelRect.bottom < geometry.navRect.top);
assert.equal(geometry.overflow, false);
assert.equal(await campaign.getAttribute('aria-describedby'), 'directive-campaign-guidance-instruction');
const style = await campaign.evaluate((node) => {
  const computed = getComputedStyle(node);
  return {
    animationDuration: computed.animationDuration,
    animationName: computed.animationName,
    transform: computed.transform
  };
});
assert.equal(style.animationDuration, '2s');
assert.equal(style.transform, 'none');
await campaign.click();
await page.waitForSelector('.directive-expanded-shell[data-active-route="campaign"]');
```

Sample the Campaign control's computed background/box-shadow near the quiet and bright halves of the cycle and assert that the internal treatment changes while its bounding box remains identical. Use a reduced-motion browser context to assert `animationName === 'none'`, steady emphasis remains visible, and geometry is unchanged.

Register both `test-campaign-required-empty-state.mjs` and `test-campaign-required-empty-state-visual.mjs` in `run-alpha-gate.mjs` adjacent to the expanded-interface tests.

- [ ] **Step 2: Run the visual check and verify RED**

Run: `node tools/scripts/test-campaign-required-empty-state-visual.mjs`

Expected: FAIL because the fixture does not yet expose the invalid-current-chat mode or synchronize the guidance state.

- [ ] **Step 3: Add the fixture-only campaign-required mode**

Read `campaignRequired` from `URLSearchParams`. When it equals `1`, return a cloned view with:

```js
{
  ...normalView,
  currentChatActivePackage: null,
  v1PlayerProjection: null,
  currentChat: { status: 'none-selected' }
}
```

After the fixture calls `renderRoute(body, view)`, call `syncCampaignRequiredGuidance(shell, body)`. This mode is read-only, exists only in the preview fixture, and does not mutate campaign/save data.

- [ ] **Step 4: Run and refine the browser check**

Run: `node tools/scripts/test-campaign-required-empty-state-visual.mjs`

Expected: PASS across desktop, certified mobile, narrow mobile, all three routes, route interaction, and reduced motion. If geometry or perceptibility fails, adjust only the scoped `.directive-campaign-required` or `.is-campaign-guidance-target` rules and rerun until green.

- [ ] **Step 5: Run focused regressions and the full gate**

Run:

```powershell
node tools/scripts/test-campaign-required-empty-state.mjs
node tools/scripts/test-campaign-required-empty-state-visual.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
npm.cmd test
git diff --check
git status --short
```

Expected: every command PASS. Final status may contain the user's unrelated `debug.log` and `.codex-remote-attachments/`, but no unintended staged or modified files.

- [ ] **Step 6: Commit the certification slice**

```powershell
git add -- tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/test-campaign-required-empty-state-visual.mjs tools/scripts/run-alpha-gate.mjs styles/directive.css
git commit -m "test(ui): certify campaign guidance state"
```

- [ ] **Step 7: Review final diff and publish exact main**

Run:

```powershell
git status --short
git log -5 --oneline
git diff HEAD~3..HEAD -- src/ui/current-chat-empty-state.js src/ui/mission-panel.js src/ui/crew-panel.js src/ui/ship-panel.js src/runtime/runtime-shell.js styles/directive.css tools/fixtures/expanded-interface-runtime-fixture.mjs tools/scripts/test-campaign-required-empty-state.mjs tools/scripts/test-campaign-required-empty-state-visual.mjs tools/scripts/run-alpha-gate.mjs
git push origin main
```

Expected: push succeeds without force, the implementation commits are on `main`, and unrelated dirty files remain uncommitted.
