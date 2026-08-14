# SillyTavern Message Edit Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Release SillyTavern's native editor immediately without weakening Directive's accepted-pair authority gate.

**Architecture:** Make edit and visibility shell callbacks fire-and-observe, consume the update paired with an edit, and keep all real reconciliation on the runtime settlement queue that generation already awaits.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, SillyTavern host event bridge, Playwright.

## Global Constraints

- Preserve source invalidation for edits and independent visibility changes.
- Never let generation observe state before queued reconciliation completes.
- Add no persisted deduplication state or save-schema changes.

---

### Task 1: Protect the Host Event Boundary

**Files:**
- Modify: `tools/scripts/test-sillytavern-event-wiring.mjs`
- Modify: `src/hosts/sillytavern/shell-events.js`

- [x] Add regressions proving an unresolved edit reconciliation does not delay the event callback, its paired update is consumed, and an independent update schedules visibility reconciliation.
- [x] Run the event-wiring script and verify the new assertions fail for the current blocking/double-replay behavior.
- [x] Implement the minimal fire-and-observe callbacks and one-shot paired-update marker.
- [x] Run the event-wiring script and verify it passes.

### Task 2: Preserve the Runtime Authority Gate

**Files:**
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Verify: `src/runtime/runtime-app.mjs`

- [x] Add a regression proving generation waits for an edit reconciliation already queued by the shell.
- [x] Verify the existing visibility-change entry point accepts only explicit visibility events.
- [x] Verify the existing generation interceptor awaits the serialized settlement queue; no runtime implementation change is needed.
- [x] Run the focused event and runtime scripts and verify they pass.

### Task 3: Verify and Publish

- [x] Run `npm.cmd test`.
- [x] Sync the verified source into the installed default-user Directive extension and reload it.
- [x] Use Playwright on the latest Sam Vickers chat to confirm an unchanged assistant edit submits promptly and a second edit opens without refresh.
- [x] Review the diff and rerun the completion gate.
- [ ] Commit the scoped changes, push `main`, and verify the remote main SHA.
