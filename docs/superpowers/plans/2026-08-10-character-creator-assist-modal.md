# Character Creator Assist Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline Character Creator assist output with a cancellable, progress-aware review modal and prevent creator controls from overlapping under long content.

**Architecture:** A focused dialog module owns modal presentation, focus, inert state, and the active-session registry. The creator panel keeps request and form authority, using an abort controller plus run token to reject late results; the runtime shell cancels the registry before hiding.

**Tech Stack:** Browser JavaScript modules, DOM APIs, CSS, Node assertion scripts, Playwright, PowerShell/npm.

## Global Constraints

- Both empty-section drafts and refinements require explicit Apply confirmation.
- Closing the modal or Directive aborts the active request and ignores late results.
- Preserve the approved expanded Directive shell and LCARS visual language.
- Do not add legacy compatibility, migrations, dependencies, or unrelated refactors.
- Use `npm.cmd` on Windows and pass the complete V1 alpha gate before merge.

---

### Task 1: Dialog presentation and active-session registry

**Files:**
- Create: `src/ui/character-creator-assist-dialog.js`
- Create: `tools/scripts/test-character-creator-assist-dialog.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `createCharacterCreatorAssistDialog(options)`, `registerActiveCreatorAssistSession(session)`, and `cancelActiveCreatorAssistSession(reason)`.
- The dialog handle exposes `showProgress(message)`, `showResult(options)`, `showError(options)`, `isOpen()`, and `close(reason)`.

- [ ] **Step 1: Write the failing dialog test**

  Assert immediate modal mounting, `role="dialog"`, live progress, inert shell state, one-active-session replacement, cancel callback, Escape handling, and focus restoration.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node tools/scripts/test-character-creator-assist-dialog.mjs`

  Expected: failure because `src/ui/character-creator-assist-dialog.js` does not exist.

- [ ] **Step 3: Implement the minimal dialog module**

  Create DOM states using existing UI-kit button and icon helpers, mount through `appendDirectiveModal`, and keep a module-level active-session token whose cancel function is called on replacement or runtime close.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run: `node tools/scripts/test-character-creator-assist-dialog.mjs`

  Expected: pass with no warnings.

### Task 2: Creator request integration and explicit review

**Files:**
- Modify: `src/ui/character-creator-panel.js`
- Create: `tools/scripts/test-character-creator-assist-panel.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: dialog and active-session APIs from Task 1.
- Produces: wand behavior that opens progress immediately, reviews every successful result, and applies only after the modal Apply action.

- [ ] **Step 1: Write the failing creator integration test**

  Render the real creator panel in a fake DOM. Click the Identity wand with an empty section, resolve a provider result, assert the form is unchanged until Apply, then assert Apply saves the proposed fields. Start another request, cancel it, resolve it late, and assert the late result does not mount or save.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `node tools/scripts/test-character-creator-assist-panel.mjs`

  Expected: failure because the existing panel appends inline output and auto-applies provider drafts for empty sections.

- [ ] **Step 3: Implement the request state machine**

  Replace inline preview helpers with the dialog handle. Capture current inputs per run, forward provider progress into the modal, require Apply for all results, invalidate the run token before abort/close, and expose Retry or Dismiss for failures.

- [ ] **Step 4: Run the focused tests and verify GREEN**

  Run: `node tools/scripts/test-character-creator-assist-dialog.mjs`

  Run: `node tools/scripts/test-character-creator-assist-panel.mjs`

  Expected: both pass.

### Task 3: Runtime-close cancellation

**Files:**
- Modify: `src/runtime/runtime-shell.js`
- Modify: `tools/scripts/test-directive-runtime-overlay-host.mjs`

**Interfaces:**
- Consumes: `cancelActiveCreatorAssistSession(reason)` from Task 1.
- Produces: `hideDirectiveRuntimePanel()` cancellation before shell hiding and focus restoration.

- [ ] **Step 1: Add a failing runtime-close assertion**

  Register an active fake assist session, hide Directive, and assert the session receives `directive-closed` exactly once before the shell is hidden.

- [ ] **Step 2: Run the runtime shell test and verify RED**

  Run: `node tools/scripts/test-directive-runtime-overlay-host.mjs`

  Expected: failure because shell hiding does not cancel modal sessions.

- [ ] **Step 3: Add cancellation to the hide lifecycle**

  Import the registry function and call it at the start of `hideDirectiveRuntimePanel()` so close button, backdrop, Escape, mobile back, and extension-disable paths share the same behavior.

- [ ] **Step 4: Run the runtime shell test and verify GREEN**

  Run: `node tools/scripts/test-directive-runtime-overlay-host.mjs`

  Expected: pass.

### Task 4: Modal styling and layout regression

**Files:**
- Modify: `styles/directive.css`
- Create: `tools/scripts/test-character-creator-assist-layout.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: dialog class names from Task 1.
- Produces: desktop/mobile modal presentation, visible loading feedback, and a non-overlapping creator command bar.

- [ ] **Step 1: Write the failing browser layout test**

  Load the production CSS in Playwright at desktop and phone widths. Assert the dialog fits the viewport, scrolls internally when necessary, exposes a visible spinner, and computes the creator command bar as non-sticky with step buttons at least 40px high.

- [ ] **Step 2: Run the browser test and verify RED**

  Run: `node tools/scripts/test-character-creator-assist-layout.mjs`

  Expected: failure because modal classes are absent and the creator command bar computes as sticky.

- [ ] **Step 3: Add the scoped CSS**

  Style the dimmed overlay, LCARS dialog, progress indicator, review list, action row, error state, and mobile containment. Replace the negative sticky offsets with normal-flow positioning so long form content cannot cover commissioning steps.

- [ ] **Step 4: Run the browser test and verify GREEN**

  Run: `node tools/scripts/test-character-creator-assist-layout.mjs`

  Expected: pass at all tested viewports.

### Task 5: Full verification and integration

**Files:**
- Modify only files required by failures directly caused by Tasks 1-4.

**Interfaces:**
- Produces: a merge-ready feature branch with no unrelated changes.

- [ ] **Step 1: Run all focused feature tests**

  Run the four character-assist and runtime-overlay scripts directly and confirm clean output.

- [ ] **Step 2: Run the full repository gate**

  Run: `npm.cmd test`

  Expected: every focused V1 check passes.

- [ ] **Step 3: Review the complete diff**

  Confirm no inline assist preview remains, no automatic empty-section application remains, lifecycle cancellation is centralized, and documentation matches behavior.

- [ ] **Step 4: Commit, merge, and push**

  Commit the verified implementation on `codex/creator-assist-modal`, merge it into `main` without discarding unrelated work, rerun the focused gate on `main`, and push `main` to `origin`.
