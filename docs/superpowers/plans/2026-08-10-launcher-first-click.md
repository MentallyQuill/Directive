# Launcher First-Click Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first press of the SillyTavern composer launcher open Directive after startup refresh has mounted the runtime shell.

**Architecture:** Preserve the existing startup refresh and toggle action. Establish one visibility invariant at panel construction: a runtime panel mounted for background rendering starts hidden and aria-hidden, while `showDirectiveRuntimePanel()` remains the only path that makes the panel and overlay visible.

**Tech Stack:** JavaScript ES modules, Node.js assertions, Directive alpha gate.

## Global Constraints

- Keep the V1 hard cutover; add no legacy support, migration, or compatibility layer.
- Limit production behavior changes to initial runtime-panel visibility.
- Preserve startup refresh, launcher placement, overlay behavior, and focus restoration.

---

### Task 1: Align Initial Panel and Overlay Visibility

**Files:**
- Modify: `tools/scripts/test-directive-runtime-overlay-host.mjs`
- Modify: `src/runtime/runtime-shell.js`

**Interfaces:**
- Consumes: `refreshDirectiveRuntimePanel()`, `showDirectiveRuntimePanel()`, and `hideDirectiveRuntimePanel()` from `src/runtime/runtime-shell.js`.
- Produces: A newly mounted `#directive-runtime-panel` with `hidden === true` and `aria-hidden="true"` until explicitly shown.

- [x] **Step 1: Write the failing regression test**

Before the existing explicit-show assertions, call `refreshDirectiveRuntimePanel()` and assert that both the created overlay and panel remain hidden, including the panel's `aria-hidden` state.

- [x] **Step 2: Run the focused test to verify RED**

Run: `node tools/scripts/test-directive-runtime-overlay-host.mjs`

Expected: FAIL because the background-mounted panel currently has `hidden === false`.

- [x] **Step 3: Implement the minimal visibility invariant**

In `createPanel()`, set the newly created panel's `hidden` property to `true` and its `aria-hidden` attribute to `true` before applying layout and chrome.

- [x] **Step 4: Run the focused test to verify GREEN**

Run: `node tools/scripts/test-directive-runtime-overlay-host.mjs`

Expected: PASS with the background-refresh, explicit-show, hide, focus-restoration, and refresh-cancellation assertions intact.

- [x] **Step 5: Run the complete repository gate**

Run: `npm.cmd test`

Expected: `[v1-gate] passed 91 focused checks.`

- [ ] **Step 6: Commit the bounded change**

Stage only the plan, regression test, and runtime shell. Commit with a concise bug-fix message, merge the feature branch into `main`, rerun the complete gate on `main`, and push `main` to `origin`.
