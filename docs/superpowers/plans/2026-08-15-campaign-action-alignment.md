# Campaign Action Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the compact Delete campaign action with the Save Game and Load Game row while preserving the Campaign dock's asymmetric button hierarchy.

**Architecture:** Keep the existing Campaign dashboard DOM, two-row phone grid, and absolute Delete positioning. Prove the intended rendered geometry in the existing Playwright conformance suite, then change the one dashboard-scoped phone inset that causes the mismatch.

**Tech Stack:** CSS, JavaScript, Node.js, Playwright

## Global Constraints

- Continue remains wide, Delete campaign remains a 44 px square, and Save Game and Load Game remain equal-width.
- Delete campaign and Load Game must share a right edge within one CSS pixel.
- The Continue/Delete and Save/Load horizontal gaps must match within one CSS pixel.
- Desktop layout and all action behavior remain unchanged.
- Preserve unrelated working-tree changes.

---

### Task 1: Align the phone Campaign action dock

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: `measureCampaignDashboard(page).actionBoxes`, whose entries expose `action`, `left`, `right`, `top`, `bottom`, `width`, and `height`.
- Produces: a rendered phone layout where Delete campaign uses the dock's 20 px right inset.

- [ ] **Step 1: Add the failing rendered-geometry assertions**

After the existing mobile row assertions, map the action boxes by `data-campaign-action` and assert the approved right-edge and gap contracts:

```js
const mobileActionBoxes = Object.fromEntries(
  mobileCampaign.actionBoxes.map((box) => [box.action, box])
);
const primaryRowGap = mobileActionBoxes.delete.left - mobileActionBoxes.continue.right;
const secondaryRowGap = mobileActionBoxes.load.left - mobileActionBoxes.save.right;
assert.ok(
  Math.abs(mobileActionBoxes.delete.right - mobileActionBoxes.load.right) < 1,
  'Delete campaign and Load Game must share the mobile dock right edge'
);
assert.ok(
  Math.abs(primaryRowGap - secondaryRowGap) < 1,
  'mobile Campaign action rows must use the same horizontal gap'
);
```

- [ ] **Step 2: Run the focused test to verify it fails for the current offset**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL at `Delete campaign and Load Game must share the mobile dock right edge` because Delete campaign is 8 px farther right.

- [ ] **Step 3: Apply the minimal CSS correction**

In the dashboard-scoped phone rule, align the absolute Delete action with the dock's existing right padding:

```css
.directive-expanded-shell .campaign-dashboard > .campaign-dashboard-actions [data-campaign-action="delete"] {
  top: 12px;
  right: 20px;
}
```

- [ ] **Step 4: Run focused verification**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS with the new right-edge and equal-gap assertions.

- [ ] **Step 5: Run full verification and inspect scope**

Run: `npm.cmd test`

Expected: PASS with zero failing tests.

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 6: Commit the implementation**

```powershell
git add -- styles/directive.css tools/scripts/test-expanded-interface-visual-conformance.mjs docs/superpowers/plans/2026-08-15-campaign-action-alignment.md
git commit -m "fix(ui): align campaign action dock"
```
