# Mobile Crew Expansion Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand and collapse mobile crew records without rebuilding the roster or resetting its scroll position.

**Architecture:** Keep structural People operations on the existing rerender path, but give mobile accordion disclosure a render-local state object that patches only the open card and desktop selection. This preserves the scroll-owner node, focus, and responsive selection consistency.

**Tech Stack:** Browser JavaScript, DOM APIs, Node assertion tests, Playwright visual conformance.

## Global Constraints

- Do not replace `.people-journal-host` for mobile card disclosure.
- Keep exactly one mobile record expanded.
- Preserve selected-person persistence and desktop/mobile selection parity.
- Add no dependency and no compatibility layer.

---

### Task 1: Lock down mobile disclosure stability

**Files:**
- Modify: `tools/scripts/test-certified-people-panel.mjs`
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Modify: `src/ui/people-journal.js`

**Interfaces:**
- Consumes: `createPeopleJournal(model, rerender)` and the existing preferences controller.
- Produces: in-place mobile disclosure with unchanged scroll-owner identity and offset.

- [ ] **Step 1: Write the failing DOM regression**

Instrument the fake body replacement count and scroll owner, click a closed lower mobile record, and assert that the original scroll owner remains attached at the same `scrollTop`, no full replacement occurs, exactly one item is open, and desktop selection follows the mobile selection.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node tools/scripts/test-certified-people-panel.mjs`

Expected: FAIL because the current toggle calls `rerender`, which invokes `body.replaceChildren` and replaces the mobile scroll owner.

- [ ] **Step 3: Implement the minimal local disclosure update**

Add render-local mobile accordion state in `createPeopleJournal`. Change mobile toggle handling to close/open record detail nodes in place, update `aria-expanded`, persist the selected person, and synchronize the desktop row/detail without calling the panel rerender.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `node tools/scripts/test-certified-people-panel.mjs`

Expected: PASS with the same scroll owner and offset.

- [ ] **Step 5: Add and run the browser regression**

At the 390px People viewport, scroll `.people-journal-host`, capture its node and offset, click a lower closed record, then assert the same node remains connected and the offset is unchanged.

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: PASS for all certified viewports and the mobile disclosure regression.

- [ ] **Step 6: Run the complete gate**

Run: `npm.cmd test`

Expected: all focused checks pass with no browser errors.

- [ ] **Step 7: Commit**

```powershell
git add docs/superpowers/specs/2026-08-10-mobile-crew-expand-scroll-design.md docs/superpowers/plans/2026-08-10-mobile-crew-expand-scroll.md tools/scripts/test-certified-people-panel.mjs tools/scripts/test-expanded-interface-visual-conformance.mjs src/ui/people-journal.js
git commit -m "fix(people): preserve mobile roster scroll"
```
