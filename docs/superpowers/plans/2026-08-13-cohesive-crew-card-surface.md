# Cohesive Crew Card Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give desktop Crew cards one continuous hover surface and divider across character content and the reorder handle.

**Architecture:** Keep the existing sibling selection and reorder buttons. Move presentation ownership to their shared `.collection-person-row` article with desktop-scoped CSS, and protect the behavior with the existing Playwright visual-conformance harness.

**Tech Stack:** CSS, browser DOM APIs, Playwright, Node.js assertions.

## Global Constraints

- Preserve separate selection and reorder button semantics.
- Preserve keyboard focus and pointer drag behavior.
- Do not change mobile accordion or touch-drag presentation.
- Preserve the selected-card gradient and blue selection rail.
- Do not include unrelated dirty files in the commit.

---

### Task 1: Unify desktop Crew card presentation

**Files:**
- Modify: `styles/directive.css:3913-3921`
- Test: `tools/scripts/test-expanded-interface-visual-conformance.mjs:788-824`

**Interfaces:**
- Consumes: `.collection-person-row`, `.people-row`, and `.collection-person-drag-handle` from `src/ui/people-journal.js`.
- Produces: a desktop card whose article owns hover/focus background and the only bottom divider.

- [x] **Step 1: Write the failing browser assertion**

Hover a non-selected desktop Crew card through both `.people-row` and `.collection-person-drag-handle`. Assert that the article background is non-transparent, both child buttons are transparent, the selection button has no bottom border, and the article retains a `1px solid` bottom border.

- [x] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-expanded-interface-visual-conformance.mjs`

Expected: FAIL with `hovering the character body must highlight the shared outer card surface` because the article background is transparent.

- [x] **Step 3: Implement the minimal desktop-scoped CSS**

Add hover and focus-within background styling to `.people-desktop-journal .collection-person-row`. Override its direct `.people-row` child to use a transparent background and no bottom border.

- [x] **Step 4: Run focused and repository verification**

Run `node tools/scripts/test-expanded-interface-visual-conformance.mjs`, then `npm.cmd test`. Both commands must exit successfully before integration.

- [ ] **Step 5: Commit and integrate**

Stage only the design, plan, CSS, and browser regression files. Commit with `fix(people): unify crew card surface`, merge into `main`, rerun the full gate on the merged tree, and push `main`.
