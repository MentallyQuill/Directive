# Blank Send Continue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a blank activation of SillyTavern's Send control into a visible `Continue.` player message in the exact active Directive campaign chat.

**Architecture:** A focused SillyTavern host module captures Send-control clicks, verifies the existing runtime's exact chat binding, normalizes only blank attachment-free input, and then leaves submission to SillyTavern. Runtime activation installs the listener and shell teardown removes it; the runtime app exposes its existing binding result through a synchronous read-only query.

**Tech Stack:** Browser ES modules, SillyTavern DOM/event APIs, Node.js `assert` script tests, Directive alpha gate.

## Global Constraints

- The exact submitted text is `Continue.`.
- Empty and whitespace-only textarea values are blank.
- Apply only when Directive is enabled and the exact current chat is campaign-bound.
- Skip pending file attachments.
- Do not prevent, duplicate, or directly invoke SillyTavern submission or generation.
- Preserve nonblank messages, unbound chats, disabled sessions, explicit native Continue, and plain textarea Enter behavior.
- Preserve unrelated dirty work and user data.

---

### Task 1: Blank Send host boundary

**Files:**
- Create: `src/hosts/sillytavern/blank-send-continue.js`
- Create: `tools/scripts/test-sillytavern-blank-send-continue.mjs`
- Modify: `src/hosts/sillytavern/runtime-activation.mjs`
- Modify: `src/hosts/sillytavern/shell-events.js`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `getSillyTavernDirectiveRuntimeBridge()` and `runtimeApp.isCurrentChatBound(): boolean`.
- Produces: `installBlankSendContinue({ root? }): boolean`, `disposeBlankSendContinue(): boolean`, and test hooks for the pure normalization decision.

- [ ] **Step 1: Write the failing host test**

Create `tools/scripts/test-sillytavern-blank-send-continue.mjs`. Dynamically import the planned module so absence becomes an assertion failure, then use a minimal fake document containing `#send_but`, `#send_textarea`, and `#file_form_input`. Assert that a bound, enabled empty or whitespace-only Send writes `Continue.` and emits one bubbling `input` event. Assert that nonblank text, attachments, unbound state, disabled state, `#option_continue`, and unrelated targets are untouched. Assert duplicate installation adds one listener and disposal removes it.

Also construct a runtime app harness already used by `test-v1-runtime-app.mjs` and assert `isCurrentChatBound()` is true only for the exact binding. If extending that large harness obscures the focused test, exercise the public query through the same bridge stub used by the host module and retain the runtime method as a direct delegation to the already-tested private predicate.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-sillytavern-blank-send-continue.mjs
```

Expected: exit nonzero with the assertion that `blank-send-continue.js` is unavailable or that the blank input was not normalized.

- [ ] **Step 3: Implement the minimal normalizer**

Create `blank-send-continue.js` with constants for `#send_but`, `#send_textarea`, `#file_form_input`, and `Continue.`. Its capture handler must:

```js
if (!event?.target?.closest?.('#send_but')) return false;
const { runtimeApp, enabled } = getSillyTavernDirectiveRuntimeBridge();
if (enabled === false || runtimeApp?.isCurrentChatBound?.() !== true) return false;
const textarea = root.querySelector?.('#send_textarea');
if (!textarea || String(textarea.value ?? '').trim()) return false;
const fileInput = root.querySelector?.('#file_form_input');
if (Number(fileInput?.files?.length || 0) > 0) return false;
textarea.value = 'Continue.';
textarea.dispatchEvent?.(new Event('input', { bubbles: true }));
return true;
```

Wrap DOM/event construction defensively so an unavailable browser API fails open. Install exactly one capture listener on the resolved document and remove that exact listener during disposal.

Expose `isCurrentChatBound: () => currentChatIsBound()` on the runtime app public API. Install the normalizer during `activateSillyTavernDirectiveRuntime()` and dispose it from extension teardown beside the existing launcher and event lifecycle cleanup.

- [ ] **Step 4: Register and verify GREEN**

Add `test-sillytavern-blank-send-continue.mjs` beside the other SillyTavern host tests in `run-alpha-gate.mjs`.

Run:

```powershell
node tools/scripts/test-sillytavern-blank-send-continue.mjs
```

Expected: `PASS SillyTavern blank Send continuation` and exit zero.

- [ ] **Step 5: Run focused coexistence tests**

Run:

```powershell
node tools/scripts/test-sillytavern-event-wiring.mjs
node tools/scripts/test-directive-runtime-overlay-host.mjs
node tools/scripts/test-v1-runtime-app.mjs
```

Expected: all three scripts print their PASS line and exit zero.

- [ ] **Step 6: Run the complete gate and inspect the diff**

Run:

```powershell
npm.cmd test
git diff --check
git diff -- src/hosts/sillytavern/blank-send-continue.js src/hosts/sillytavern/runtime-activation.mjs src/hosts/sillytavern/shell-events.js src/runtime/runtime-app.mjs tools/scripts/test-sillytavern-blank-send-continue.mjs tools/scripts/run-alpha-gate.mjs
```

Expected: the full alpha gate exits zero, `git diff --check` is clean, and the diff contains no changes outside the approved boundary.

- [ ] **Step 7: Commit and publish**

Stage only the planned source, test, gate, spec, and plan files. Commit with:

```text
fix(chat): make blank send continue
```

Verify GitHub CLI authentication with network permission, push `main` to `origin`, and confirm local HEAD equals `origin/main` while unrelated dirty files remain uncommitted.
