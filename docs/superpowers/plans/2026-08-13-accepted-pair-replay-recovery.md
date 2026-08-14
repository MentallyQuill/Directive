# Accepted-Pair Replay Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the zero-attempt accepted-pair replay modal recoverable without weakening Story Settlement authority.

**Architecture:** Extend the existing runtime recovery entry point to resume complete-chat replay when no persistence settlement object exists. Keep the bridge fail-closed, and make the modal dismissible as presentation state only.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, SillyTavern host bridge, Directive fake DOM.

## Global Constraints

- Do not change save schemas or provider routing.
- Do not start narration until accepted-pair replay succeeds.
- Preserve completed replay work and existing persistence retry semantics.

---

### Task 1: Recover Replay and Release the Modal

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/ui/settlement-retry-dialog.js`
- Modify: `styles/directive.css`
- Test: `tools/scripts/test-v1-runtime-app.mjs`
- Test: `tools/scripts/test-sillytavern-event-wiring.mjs`
- Test: `tools/scripts/test-settlement-retry-dialog.mjs`

**Interfaces:**
- Consumes: `acceptedPairReplayNeeded`, `rebuildAcceptedStateFromChat()`, and the existing `retryPendingAcceptedPairSettlement()` bridge contract.
- Produces: replay-aware `{ ok, reasonCode, settlementBlocked, acceptedPairReplay }` recovery results and Close, Escape, and backdrop dismissal that mutate no runtime authority.

- [ ] **Step 1: Write failing runtime, bridge, and dialog regressions**

Add assertions that a replay-pending runtime without a persistence object resumes complete-chat replay; replay copy omits `after 0 attempts`; and Close, Escape, and backdrop clicks remove the overlay.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node tools/scripts/test-v1-runtime-app.mjs; node tools/scripts/test-sillytavern-event-wiring.mjs; node tools/scripts/test-settlement-retry-dialog.mjs`

Expected: failures showing replay Retry returns `no-pending-settlement`, replay copy contains `after 0 attempts`, or no Close action exists.

- [ ] **Step 3: Implement minimal runtime and dialog changes**

In `retryPendingAcceptedPairSettlement()`, call `rebuildAcceptedStateFromChat()` only when `acceptedPairReplayNeeded` is true and no persistence object exists. Return `ok: true` only when replay is not blocked. In the dialog, render reason-specific copy and dismiss the presentation layer through Close, Escape, or backdrop click without changing runtime state.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node tools/scripts/test-v1-runtime-app.mjs; node tools/scripts/test-sillytavern-event-wiring.mjs; node tools/scripts/test-settlement-retry-dialog.mjs`

Expected: all three scripts pass.

- [ ] **Step 5: Run the full gate**

Run: `npm.cmd test`

Expected: all focused checks pass with zero failures.

- [ ] **Step 6: Commit the implementation**

Stage only the six implementation and test files plus these design/plan documents, then commit with a focused fix message.
