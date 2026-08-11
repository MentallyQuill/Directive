# Coming-Later Campaign Teasers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grey coming-later campaign artwork and dim its master-list copy without removing teaser selection or reducing detail-copy readability.

**Architecture:** Reuse the existing `data-campaign-availability="coming-later"` attribute as a CSS boundary. Extend the Playwright presentation check to measure the row's artwork and copy separately from its interactive container and selected detail.

**Tech Stack:** JavaScript ES modules, CSS, Node.js assertions, Playwright Chromium.

## Global Constraints

- Coming-later campaign rows remain pointer-, keyboard-, and assistive-selectable presentation previews.
- Only artwork and list copy are subdued; selection affordances and detail copy remain full strength.
- Campaign availability and start-action guards do not change.
- No package-ID-specific styling or runtime-state changes.

---

### Task 1: Coming-Later Campaign Presentation

**Files:**
- Modify: `tools/scripts/test-campaign-library-presentation.mjs`
- Modify: `styles/directive.css`

**Interfaces:**
- Consumes: Existing `data-campaign-availability="coming-later"`, `.directive-media-frame`, `.campaign-row-copy`, `.campaign-library-hero.is-coming-later`, and disabled campaign action markup.
- Produces: Computed-style contract for grayscale row/detail artwork, dimmed row copy, full-strength interactive row and detail copy.

- [x] **Step 1: Write the failing browser assertions**

Capture computed styles for the row artwork, row heading, row description, and detail copy. Require `grayscale(1)` on row artwork, opacity below `1` on row title and description, row opacity exactly `1`, and detail-copy opacity exactly `1`.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-campaign-library-presentation.mjs`

Expected: FAIL because the current row artwork has `filter: none` and list copy has full opacity.

- [x] **Step 3: Add minimal availability-scoped CSS**

Add selectors equivalent to:

```css
.directive-expanded-shell .campaign-row[data-campaign-availability="coming-later"] .directive-media-frame {
  filter: grayscale(1);
}

.directive-expanded-shell .campaign-row[data-campaign-availability="coming-later"] .campaign-row-copy {
  opacity: .55;
}
```

Do not filter or lower opacity on the button itself or on `.campaign-hero-copy`.

- [x] **Step 4: Run focused checks and verify GREEN**

Run:

```powershell
node tools/scripts/test-campaign-library-presentation.mjs
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-expanded-interface-visual-conformance.mjs
```

Expected: all commands exit `0` and report PASS.

- [x] **Step 5: Run the full gate**

Run: `npm.cmd test`

Expected: `91 focused checks` pass with exit `0`.

- [x] **Step 6: Commit the implementation**

```powershell
git add styles/directive.css tools/scripts/test-campaign-library-presentation.mjs
git commit -m "feat(ui): dim coming-later campaign teasers"
```
