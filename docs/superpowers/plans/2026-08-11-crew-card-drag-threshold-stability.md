# Crew Card Drag Threshold Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the drop slot stable at card boundaries and keep a continuous grabbing cursor for the complete active drag.

**Architecture:** Preserve the shared reorder controller and People configuration. Exclude the positional placeholder from FLIP animations so only real siblings glide, and use one document-root class as the cursor owner from activation through terminal cleanup.

**Tech Stack:** Browser DOM APIs, Web Animations API, CSS, Node.js, Playwright Chromium, Directive's alpha gate.

## Global Constraints

- Keep the existing midpoint, ordering, persistence, `175ms` touch hold, `8px` touch cancellation, `170ms` sibling reflow, and `160ms` docking contracts.
- Do not add threshold hysteresis unless a reproducible oscillation remains after the slot stops animating.
- Category dragging must retain its current behavior.
- Use one failing real-browser regression before each production change.

---

### Task 1: Stationary destination slot

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `src/ui/expanded-interface-reorder.js`

**Interfaces:**
- Consumes: `relocatePlaceholder(parent, before)` and its `state.reflowAnimations` set.
- Produces: a slot that relocates to final layout immediately while real `itemSelector` siblings retain FLIP animation.

- [ ] **Step 1: Write the failing browser regression**

After lifting the player-character card and crossing Mara Whitaker's midpoint, sample the active slot and displaced card across two animation frames. Assert that the slot has no animations and retains the same top and left while Mara's running FLIP changes her visual top upward toward the settled position:

```js
const thresholdState = await peoplePage.evaluate(async () => {
  const slot = document.querySelector('.people-card-drop-slot');
  const peer = document.querySelector('.collection-person-row[data-person-id="mara-whitaker"]');
  const sample = () => {
    const slotRect = slot.getBoundingClientRect();
    const peerRect = peer.getBoundingClientRect();
    return {
      slotTop: slotRect.top,
      slotLeft: slotRect.left,
      peerTop: peerRect.top
    };
  };
  const first = sample();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const second = sample();
  return {
    slotAnimations: slot.getAnimations().length,
    peerAnimating: peer.getAnimations().some(({ playState }) => playState === 'running'),
    first,
    second
  };
});
assert.equal(thresholdState.slotAnimations, 0);
assert.equal(thresholdState.peerAnimating, true);
assert.equal(thresholdState.second.slotTop, thresholdState.first.slotTop);
assert.equal(thresholdState.second.slotLeft, thresholdState.first.slotLeft);
assert.ok(thresholdState.second.peerTop < thresholdState.first.peerTop);
```

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the slot has a running FLIP animation and changes position across frames with motion opposing Mara's glide.

- [ ] **Step 3: Exclude the placeholder from FLIP elements**

Change the reflow element list to contain only visible real items:

```js
const elements = [...(root?.querySelectorAll?.(itemSelector) || [])]
  .filter((element) => element?.getClientRects?.().length > 0);
```

Remove placeholder-settling code that is no longer reachable or required, while preserving docking measurement after final layout.

- [ ] **Step 4: Run the focused suite and verify GREEN**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS, with a stationary slot and at least one moving sibling.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/expanded-interface-reorder.js tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "fix(people): stabilize drag destination slot"
```

### Task 2: Continuous grabbing cursor

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `src/ui/expanded-interface-reorder.js`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: drag activation and `finalize(commit)` terminal cleanup.
- Produces: `.directive-reorder-grabbing` on `document.documentElement` exactly while a reorder is active.

- [ ] **Step 1: Write the failing cursor regression**

During an active pointer drag, sample the root, the card button beneath the pointer, and the destination slot. After cancellation, assert cleanup:

```js
assert.deepEqual(await peoplePage.evaluate(() => ({
  rootClass: document.documentElement.classList.contains('directive-reorder-grabbing'),
  root: getComputedStyle(document.documentElement).cursor,
  card: getComputedStyle(document.querySelector('.people-row')).cursor,
  slot: getComputedStyle(document.querySelector('.people-card-drop-slot')).cursor
})), { rootClass: true, root: 'grabbing', card: 'grabbing', slot: 'grabbing' });
await peoplePage.keyboard.press('Escape');
assert.equal(await peoplePage.evaluate(() => document.documentElement.classList.contains('directive-reorder-grabbing')), false);
```

- [ ] **Step 2: Run the focused suite and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the root has no active drag class and card/slot cursors remain `pointer`/`auto`.

- [ ] **Step 3: Add and clean up the document drag-state class**

On activation:

```js
state.ownerDocument.documentElement?.classList.add('directive-reorder-grabbing');
```

In terminal cleanup before clearing state:

```js
state.ownerDocument?.documentElement?.classList.remove('directive-reorder-grabbing');
```

Add the scoped cursor rule:

```css
html.directive-reorder-grabbing,
html.directive-reorder-grabbing * { cursor: grabbing !important; }
```

- [ ] **Step 4: Run the focused suite and verify GREEN**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS across active drag and Escape cleanup.

- [ ] **Step 5: Commit**

```powershell
git add src/ui/expanded-interface-reorder.js styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs
git commit -m "fix(people): hold grabbing cursor during drag"
```

### Task 3: Visual and integration verification

**Files:**
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`

**Interfaces:**
- Consumes: the stationary slot and root cursor behavior from Tasks 1 and 2.
- Produces: living-contract language and verified desktop/mobile evidence.

- [ ] **Step 1: Update the living contract**

Specify that the destination outline settles immediately and remains stationary while only siblings glide from their old visual positions, and that the active person-card cursor remains grabbing over the complete viewport interaction path.

- [ ] **Step 2: Capture and inspect the threshold frame**

Use the production People fixture at `1024x768`. Lift the player-character card and cross Mara Whitaker's midpoint by one pixel. Capture two frames while sibling animation is active and verify the slot stays fixed while Mara glides upward from her old visual position.

- [ ] **Step 3: Inspect phone hold-drag**

Use `390x844`; verify the fixed slot, the ghost's horizontal roster lock while it follows vertical pointer movement, and unchanged touch-scroll custody before activation.

- [ ] **Step 4: Run complete verification**

Run: `npm.cmd test`

Expected: `[v1-gate] passed 97 focused checks.`

- [ ] **Step 5: Commit documentation**

```powershell
git add docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md
git commit -m "docs(ui): certify stable drag threshold"
```
