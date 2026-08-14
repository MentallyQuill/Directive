# Android Desktop-Site Shell Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep Directive's desktop shell fully visible when Chrome Android requests a desktop site at a 980px viewport inside SillyTavern's mobile host layout.

**Architecture:** Preserve the existing responsive branches and remove the desktop shell's dependence on the host root's auto height. Certify the behavior with a real Chromium geometry test that recreates SillyTavern's transformed root and fixed mobile body.

**Tech Stack:** CSS, Node.js, Playwright Chromium, Directive's existing visual conformance harness.

## Global Constraints

- Preserve the desktop interface above 640px and the full-screen mobile interface at or below 640px.
- Keep the shell within the visual page without adding horizontal document scrolling.
- Do not change route content, scroll ownership, navigation, or SillyTavern source files.

---

### Task 1: Certify the SillyTavern desktop-site host boundary

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Consumes: the production preview at `/production?route=campaign` and `.directive-expanded-shell`.
- Produces: a Chromium regression for a 980x720 viewport under reproduced SillyTavern host CSS.

- [ ] **Step 1: Write the failing regression**

Create a 980x720 page, add the host rules `html { transform: translateZ(0); min-height: 0; height: auto; }` and `body { position: fixed; overflow: hidden; min-height: 0; height: 100dvh; }`, then assert those conditions are active and the shell has positive height within the viewport.

- [ ] **Step 2: Run the focused visual test to verify red**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL because the shell height is `0` at 980px under the reproduced host conditions.

### Task 2: Make desktop height independent of the host root

**Files:**
- Modify: `styles/directive.css`
- Test: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Consumes: the shell's existing `inset: 16px` and `max-height: 900px` geometry.
- Produces: an explicit desktop shell height of `calc(100dvh - 32px)` before the 900px cap is applied.

- [ ] **Step 1: Implement the minimal CSS change**

Replace the desktop shell's `height: auto !important` with `height: calc(100dvh - 32px) !important`; leave the mobile override and all other geometry unchanged.

- [ ] **Step 2: Run the focused visual test to verify green**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS, including the new 980px host regression.

- [ ] **Step 3: Run the shell contract test**

Run: `node tools/scripts/test-expanded-interface-shell.mjs`

Expected: PASS after updating any exact desktop geometry contract to require the viewport-derived height.

### Task 3: Verify and publish

**Files:**
- Verify: `styles/directive.css`
- Verify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`

**Interfaces:**
- Consumes: the completed fix branch.
- Produces: a verified commit merged and pushed to GitHub `main`.

- [ ] **Step 1: Verify live host geometry**

Measure the installed SillyTavern page at 390x844, 980x720, and 1001x720. Require contained positive-height shells at all three widths and the expected mobile/desktop media-query states.

- [ ] **Step 2: Run the complete gate**

Run: `npm.cmd test`

Expected: `[v1-gate] passed 131 focused checks.` or a larger current count, with exit code 0.

- [ ] **Step 3: Commit and integrate**

Commit the CSS, regression, design, and plan; merge the branch into `main`, rerun the complete gate on the merged tree, push `main`, and verify GitHub reports the same SHA.

