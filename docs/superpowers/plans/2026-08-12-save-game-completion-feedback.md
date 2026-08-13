# Save Game Completion Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Save Game close as soon as its checkpoint is durably persisted while presenting pending and failure states honestly.

**Architecture:** Keep persistence authority in `actions.saveGame`. Move Campaign-panel refresh into a post-close callback so presentation work cannot retain the success dialog. Keep pending and failure state inside the dialog component where the player can see and retry it.

**Tech Stack:** Browser-native JavaScript modules, the existing lightweight DOM test harness, Node.js assertions, and the repository alpha test gate.

## Global Constraints

- Do not change timeline persistence, checkpoint identity, or saved-game naming semantics.
- Do not modify or delete existing live saves or chats.
- Preserve unrelated `debug.log` and `.codex-remote-attachments/` worktree changes.
- A successful `actions.saveGame` resolution is the only success boundary.

---

### Task 1: Separate durable save completion from Campaign refresh

**Files:**
- Modify: `tools/scripts/test-timeline-dialogs.mjs`
- Modify: `src/ui/timeline-dialogs.js`
- Modify: `src/ui/campaign-panel.js`

**Interfaces:**
- Consumes: `createSaveGameDialog({ campaign, opener, onSave })` and Campaign actions `saveGame(payload)` plus `refresh()`.
- Produces: `createSaveGameDialog({ campaign, opener, onSave, onSaved })`, where `onSaved(result)` begins only after the dialog closes.

- [ ] **Step 1: Write the failing dialog tests**

Add deferred persistence and refresh promises to `tools/scripts/test-timeline-dialogs.mjs`. Assert literal player-visible behavior: `Saving...` while persistence is pending; the overlay remains connected before persistence resolves; the overlay is disconnected and `onSaved` has begun after persistence resolves even while refresh remains pending. Add a rejection case asserting a visible alert, `Save Game` label restoration, an enabled primary action, and a connected dialog.

- [ ] **Step 2: Run the focused test to verify RED**

Run: `node tools/scripts/test-timeline-dialogs.mjs`

Expected: FAIL because the primary label remains `Save Game`, `onSaved` is unsupported, and persistence rejection escapes instead of rendering an alert.

- [ ] **Step 3: Implement the minimal dialog boundary**

In `createSaveGameDialog`:

```js
export function createSaveGameDialog({ campaign, opener = null, onSave = null, onSaved = null } = {}) {
  // existing frame and input setup
  const error = createElement('p', 'timeline-dialog-error');
  error.setAttribute('role', 'alert');
  error.setAttribute('aria-live', 'assertive');
  error.hidden = true;

  // primary click
  controls.primary.textContent = 'Saving...';
  let result;
  try {
    result = await onSave?.({ name });
  } catch (cause) {
    error.textContent = cause?.message || String(cause || 'Save Game failed.');
    error.hidden = false;
    busy = false;
    controls.primary.textContent = 'Save Game';
    controls.primary.disabled = !compact(input.value);
    return;
  }
  busy = false;
  controls.primary.textContent = 'Save Game';
  frame.close('saved');
  await onSaved?.(result);
}
```

Append the error before the action row and return it for focused assertions.

In `campaign-panel.js`, replace the combined `runAndRefresh` callback for Save Game:

```js
onSave: (payload) => actions.saveGame?.(payload),
onSaved: () => actions.refresh?.()
```

Leave other Campaign actions on `runAndRefresh`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run: `node tools/scripts/test-timeline-dialogs.mjs`

Expected: PASS with `timeline dialog tests passed`.

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: PASS with the Campaign-panel save payload and refresh behavior intact.

- [ ] **Step 5: Run the complete project gate**

Run: `npm.cmd test`

Expected: exit 0 with every test passing.

- [ ] **Step 6: Review, commit, and publish**

Inspect `git diff --check`, `git diff --stat`, and the focused source diff. Stage only the plan, focused tests, and two UI source files. Commit with:

```text
fix(campaign): close completed save dialog
```

Push `main` to `origin`, then verify local and remote `main` resolve to the same commit.
