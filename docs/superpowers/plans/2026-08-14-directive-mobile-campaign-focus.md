# Directive Mobile Campaign Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent SillyTavern's delayed composer autofocus from opening the virtual keyboard during Directive-owned mobile campaign chat transitions while preserving desktop and manual-host behavior.

**Architecture:** Add a focused mobile composer guard under the SillyTavern host integration and wrap only the adapter's actual campaign-chat navigation path. Keep the guard active through SillyTavern's delayed focus window, restore the host composer exactly, and restore Continue focus after the Campaign panel rerenders.

**Tech Stack:** Browser DOM APIs, JavaScript ES modules, Node.js strict assertions, repository fake DOM utilities, and the `npm.cmd test` alpha gate.

## Global Constraints

- Do not modify SillyTavern source or global manual chat-switch behavior.
- Apply suppression only to Directive-owned chat opens at viewports no wider than 640 CSS pixels.
- Preserve desktop composer autofocus.
- Preserve exact campaign binding, timeline, prompt, and save behavior.
- Restore `inputmode`, `readonly`, and focus state after every success, failure, or timeout path.
- Preserve the unrelated `debug.log` and `.codex-remote-attachments/` changes in the primary checkout.

---

### Task 1: Directive-Owned Mobile Composer Guard

**Files:**
- Create: `src/hosts/sillytavern/mobile-composer-focus-guard.js`
- Create: `tools/scripts/test-sillytavern-mobile-chat-focus.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs`
- Modify: `src/ui/campaign-panel.js`
- Modify: `tools/scripts/test-certified-campaign-panel.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `createDirectiveMobileComposerFocusGuard(options?)`, returning `{ active, release(), releaseAfter(delayMs?) }`.
- Consumes: the guard from `createSillyTavernChatAdapter().openCampaignChat()` only after the adapter knows navigation is required.
- Preserves: `openCampaignChat(binding): Promise<boolean>` and every existing host fallback and binding contract.

- [ ] **Step 1: Write the failing mobile adapter regression**

Create `test-sillytavern-mobile-chat-focus.mjs` with a small event-capable fake document, a `#send_textarea` fake, a connected Continue button, a 390-pixel fake window, and a real `createSillyTavernChatAdapter`. Have the fake host schedule the same delayed composer focus after changing the current chat. Assert that Directive prevents the composer from remaining focused, calls its blur behavior, restores Continue focus, and restores the composer's original `inputmode` and read-only state.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-sillytavern-mobile-chat-focus.mjs`

Expected: FAIL because no mobile composer guard exists and the fake SillyTavern autofocus leaves the composer active.

- [ ] **Step 3: Implement the minimal mobile focus guard and adapter integration**

Create `mobile-composer-focus-guard.js` with the supported composer selectors, the 640-pixel mobile check, exact attribute/property preservation, capture-phase composer focus interception, focus restoration to a connected non-editable prior target, idempotent cleanup, a 400-millisecond post-open hold, and a ten-second watchdog. In `chat-adapter.mjs`, create the guard only after rejecting missing bindings and already-current chats, then call `releaseAfter()` from `finally` around the existing host navigation flow.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-sillytavern-mobile-chat-focus.mjs`

Expected: PASS with no active composer focus and exact host attribute restoration.

- [ ] **Step 5: Add the failing desktop and no-navigation contracts**

Extend the same test with independent fixtures proving that a 1024-pixel Directive open leaves SillyTavern's autofocus intact and that opening the already-current chat performs no composer mutation. Add a failed-host-open fixture proving eventual restoration after `releaseAfter()`.

- [ ] **Step 6: Run the focused test and verify RED where required**

Run: `node tools/scripts/test-sillytavern-mobile-chat-focus.mjs`

Expected: the failed-open cleanup assertion fails until every adapter return path schedules guard cleanup; desktop and already-current behavior must already remain unchanged.

- [ ] **Step 7: Complete cleanup behavior and verify GREEN**

Make the smallest guard or adapter correction needed for the failed-open case. Rerun `node tools/scripts/test-sillytavern-mobile-chat-focus.mjs` and expect all mobile, desktop, already-current, and failure assertions to pass.

- [ ] **Step 8: Add the failing Continue focus regression**

Extend `test-certified-campaign-panel.mjs` so clicking the active dashboard Continue button resolves `openCampaignChat`, allows the panel refresh to replace the clicked button, and asserts that `document.activeElement` is the replacement `[data-campaign-action="continue"]` control.

- [ ] **Step 9: Run the Campaign panel test and verify RED**

Run: `node tools/scripts/test-certified-campaign-panel.mjs`

Expected: FAIL because `runAndRefresh` currently replaces the clicked Continue control without focusing its replacement.

- [ ] **Step 10: Restore Continue focus and verify GREEN**

Allow `runAndRefresh` to request a post-refresh Campaign action focus and use it only for Continue. Rerun `node tools/scripts/test-certified-campaign-panel.mjs` and expect the complete Campaign panel contract to pass.

- [ ] **Step 11: Register and run focused adjacent gates**

Add `test-sillytavern-mobile-chat-focus.mjs` beside the other SillyTavern host checks in `run-alpha-gate.mjs`. Run:

```powershell
node tools/scripts/test-sillytavern-mobile-chat-focus.mjs
node tools/scripts/test-sillytavern-checkpoint-chat.mjs
node tools/scripts/test-certified-campaign-panel.mjs
node tools/scripts/test-v1-runtime-app.mjs
node tools/scripts/test-browser-runtime-safety.mjs
```

Expected: every focused host, Campaign, runtime, and browser-import check passes.

- [ ] **Step 12: Commit the focused implementation**

```powershell
git add -- src/hosts/sillytavern/mobile-composer-focus-guard.js src/hosts/sillytavern/chat-adapter.mjs src/ui/campaign-panel.js tools/scripts/test-sillytavern-mobile-chat-focus.mjs tools/scripts/test-certified-campaign-panel.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(chat): suppress mobile campaign keyboard"
```

### Task 2: Verification and Main Integration

**Files:**
- Verify all committed feature and documentation files.
- Preserve all unrelated primary-checkout files.

**Interfaces:**
- Consumes: the focused implementation commit and approved design documents.
- Produces: a verified exact commit on GitHub `main`.

- [ ] **Step 1: Run the complete repository gate**

Run: `npm.cmd test`

Expected: every focused Node and Playwright check passes, including the newly registered mobile host focus contract.

- [ ] **Step 2: Review scope and whitespace**

Run:

```powershell
git diff --check
git status --short
git log -5 --oneline
```

Expected: only the intended feature and documentation commits differ from the branch point, with no whitespace errors.

- [ ] **Step 3: Review the final diff**

Inspect `git diff main...HEAD` for Directive-only scope, exact cleanup, mobile/desktop separation, focus accessibility, and preservation of chat authority. Correct any finding through another red-green cycle.

- [ ] **Step 4: Reconcile current GitHub main**

Use GitHub CLI with network access to compare the remote `main` SHA to the branch point. If remote `main` advanced, rebase the feature branch on the new tip and rerun `npm.cmd test`.

- [ ] **Step 5: Merge into the primary main checkout**

Merge the verified feature branch into `main` without staging, modifying, or deleting `debug.log` or `.codex-remote-attachments/`. Rerun the focused mobile focus test from the merged main checkout.

- [ ] **Step 6: Push and prove the exact remote SHA**

Push `main` to `origin`, then compare `git rev-parse HEAD` with `gh api repos/MentallyQuill/Directive/commits/main --jq .sha`. The SHAs must match.
