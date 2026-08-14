# Visible Turn Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Directive turn feedback visibly readable even when interception finishes in less than 350 ms.

**Architecture:** The existing token map will record a visible start time. Handoff timers will preserve the reading phase for a bounded minimum before showing the existing writing phase, without awaiting either timer in the generation path.

**Tech Stack:** JavaScript ES modules, Node.js assertions, Playwright, SillyTavern overlay DOM.

## Global Constraints

- Presentation timers must never delay host generation.
- Cancellation, failure, block, and disable paths clear immediately.
- Overlapping tokens retain independent timer ownership.

---

### Task 1: Guarantee readable fast-path feedback

**Files:**
- Modify: `src/hosts/sillytavern/turn-activity-indicator.js`
- Modify: `tools/scripts/test-turn-activity-indicator-visual.mjs`

**Interfaces:**
- Consumes: `markDirectiveTurnActivity()`, `resolveDirectiveHostGenerationHandoff()`, and `clearDirectiveTurnActivity()`.
- Produces: immediate reading visibility followed by bounded writing handoff for a fast interceptor.

- [ ] **Step 1: Write the failing Playwright assertion**

Resolve the orchestrator immediately. Assert the real indicator first exposes `Directive is reading your post...`, remains visible at 250 ms, later changes to `SillyTavern is writing...`, and eventually becomes hidden.

- [ ] **Step 2: Verify the regression fails**

Run `node tools/scripts/test-turn-activity-indicator-visual.mjs`.

Expected: failure because the current 350 ms reveal timer is canceled before the status exists.

- [ ] **Step 3: Implement token-owned dwell timers**

Render immediately from `markDirectiveTurnActivity()`, store `visibleAt`, and schedule writing handoff after any remaining portion of the 450 ms reading dwell. Schedule final clearing 350 ms after the writing phase begins.

- [ ] **Step 4: Verify focused and complete gates**

Run `node tools/scripts/test-turn-activity-indicator-visual.mjs`, `node tools/scripts/test-sillytavern-event-wiring.mjs`, and `npm.cmd test`.

Expected: the browser regression, event lifecycle test, and complete alpha gate all exit 0.

- [ ] **Step 5: Publish and install**

Commit the documentation and scoped code/test changes, push the verified head to `origin/main`, fast-forward the clean `default-user` installation, reload SillyTavern, and re-run the fast-path browser interaction.
