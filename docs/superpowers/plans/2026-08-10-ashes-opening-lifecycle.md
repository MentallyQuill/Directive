# Ashes Opening Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a swipe-resilient Star Trek-style Ashes opening montage, a humane first meeting with Whitaker, durable opening continuity, and clean SillyTavern campaign-chat prompt metadata.

**Architecture:** Extend the V1 Ashes package with a validated `campaign.openingContext`, then let the runtime prompt derive three bounded phases from accepted state: unanswered opening, first meeting, and post-handover continuity. Extend fresh-chat cleanup at the SillyTavern boundary to reset only Author's Note metadata and fail closed if the cleaned header cannot be saved.

**Tech Stack:** Node.js ESM, JSON campaign packages, `node:assert/strict` script tests, SillyTavern host adapters, PowerShell/npm on Windows.

## Global Constraints

- Ashes of Peace remains the only playable V1 campaign.
- Add no legacy fallback, migration, compatibility path, inferred old-package shape, prop inventory, document viewer, or PADD-specific UI.
- The montage ends outside Whitaker's ready room before the player chooses whether or how to enter.
- Opening context contains no Hesperus, redline, Rhee, Daro, mission-solution, or other undisclosed information.
- Existing chats are never silently sanitized; hygiene applies only to a newly created Directive-owned campaign chat.
- Preserve unrelated dirty work, host metadata, chats, saves, presets, and user data.

---

### Task 1: Author and validate the Ashes opening contract

**Files:**
- Modify: `tools/scripts/test-campaign-package-context.mjs`
- Modify: `src/packages/campaign-package-context.mjs`
- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Modify: `packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json`

**Interfaces:**
- Consumes: `getCampaignPackageSpineErrors(packageData)` and `createCampaignPackageSummary(packageData)`.
- Produces: required `campaign.openingContext` with string `continuitySummary`, string `firstPlayableScene`, and non-empty string array `firstSceneGuidance`.

- [ ] **Step 1: Write the failing package-contract test**

Add assertions that the real Ashes package exposes the three opening-context fields, that deleting `openingContext` yields `packageData.campaign.openingContext must be an object`, that blank summary/scene values and an empty or non-string guidance entry are rejected, and that the combined public opening text does not match `/Hesperus|redline|Rhee|Daro/i`.

```js
assert.match(summary.campaign.openingMessage, /shuttle/i);
assert.match(summary.campaign.openingMessage, /PADD/i);
assert.match(summary.campaign.openingMessage, /ready room/i);
assert.match(summary.campaign.openingContext.continuitySummary, /cabin/i);
assert.equal(summary.campaign.openingContext.firstSceneGuidance.length >= 4, true);

const missingOpeningContext = structuredClone(packageData);
delete missingOpeningContext.campaign.openingContext;
assert.match(getCampaignPackageSpineErrors(missingOpeningContext).join('\n'), /openingContext must be an object/);
```

- [ ] **Step 2: Run the package test and verify RED**

Run: `node tools/scripts/test-campaign-package-context.mjs`

Expected: FAIL because `campaign.openingContext` does not exist and the old opening lacks the shuttle/PADD montage.

- [ ] **Step 3: Implement strict opening-context validation**

In `getCampaignPackageSpineErrors`, require the opening context object before reading it, require both text fields, require a non-empty `firstSceneGuidance` array, and report each non-string/blank guidance entry by index.

```js
const openingContext = packageData.campaign.openingContext;
requireObject(openingContext, 'packageData.campaign.openingContext', errors);
if (object(openingContext)) {
  requireText(openingContext.continuitySummary, 'packageData.campaign.openingContext.continuitySummary', errors);
  requireText(openingContext.firstPlayableScene, 'packageData.campaign.openingContext.firstPlayableScene', errors);
  if (!Array.isArray(openingContext.firstSceneGuidance) || openingContext.firstSceneGuidance.length === 0) {
    errors.push('packageData.campaign.openingContext.firstSceneGuidance must be a non-empty array');
  } else {
    openingContext.firstSceneGuidance.forEach((entry, index) => {
      requireText(entry, `packageData.campaign.openingContext.firstSceneGuidance[${index}]`, errors);
    });
  }
}
```

- [ ] **Step 4: Author the montage, continuity, first-scene guidance, and Whitaker voice**

Replace `campaign.openingMessage` with the approved previous-morning shuttle/cabin/PADD montage and 0830 cut to the ready-room door. Add the validated context fields. Update Whitaker's `narrationGuide` so ordinary professional courtesy, warmth, curiosity, and dry humor are available outside stress, while formal precision remains her stress response; explicitly prohibit turning every conversation into an assessment or briefing.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node tools/scripts/test-campaign-package-context.mjs`

Run: `node tools/scripts/test-bundled-package-registry.mjs`

Expected: both exit 0.

- [ ] **Step 6: Commit Task 1**

```powershell
git add src/packages/campaign-package-context.mjs tools/scripts/test-campaign-package-context.mjs packages/bundled/breckenridge/ashes-of-peace.campaign-package.json packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json
git commit -m "feat(ashes): author opening montage"
```

### Task 2: Project the opening through its runtime phases

**Files:**
- Create: `tools/scripts/test-v1-runtime-opening-prompt.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: `state.storySettlement.receipts`, `state.mission.v1.objectives['objective.prelude.command-handover']`, and `runtimeAssets.packageData.campaign.openingContext`.
- Produces: exported `createV1RuntimePromptPacket({ state, projection, runtimeAssets })`, returning `directive.promptPacket.v1` with phase-appropriate `payload.opening`.

- [ ] **Step 1: Write one failing unanswered-opening prompt test**

Create a minimal valid state/projection/runtime-assets fixture and assert that an empty receipt list produces `opening.phase === 'unanswered'`, includes the exact canonical montage and continuity, and adds an instruction to preserve all established beats and stop before deciding entry.

```js
const packet = createV1RuntimePromptPacket({ state, projection, runtimeAssets });
assert.match(packet.text, /"phase": "unanswered"/);
assert.match(packet.text, /canonicalOpeningMessage/);
assert.match(packet.text, /Preserve every established opening beat/);
assert.match(packet.text, /Do not take the player through the ready-room door/);
```

- [ ] **Step 2: Run the focused prompt test and verify RED**

Run: `node tools/scripts/test-v1-runtime-opening-prompt.mjs`

Expected: FAIL because `createV1RuntimePromptPacket` is not exported and no opening phase exists.

- [ ] **Step 3: Implement the unanswered phase and verify GREEN**

Rename/export the existing pure `promptPacket` function as `createV1RuntimePromptPacket`. Add a focused `openingPromptProjection` helper that clones only package-owned public data. Treat `storySettlement.receipts.length === 0` as unanswered. Add the exact regeneration boundary to packet instructions and put the canonical message only in this phase.

Run: `node tools/scripts/test-v1-runtime-opening-prompt.mjs`

Expected: exit 0 for the unanswered test.

- [ ] **Step 4: Write one failing first-meeting phase test**

Add one insignificant receipt while leaving command handover available. Assert that the full canonical message and regeneration instruction disappear, while continuity, first playable scene, and ordered scene guidance remain with `phase === 'firstMeeting'`.

- [ ] **Step 5: Run RED, implement the first-meeting branch, and verify GREEN**

Run before implementation: `node tools/scripts/test-v1-runtime-opening-prompt.mjs`

Expected: FAIL because the packet remains in unanswered mode or drops all opening data.

Implement the branch, rerun, and expect exit 0.

- [ ] **Step 6: Write one failing post-handover phase test**

Set the command-handover objective to `{ state: 'terminal', visibility: 'resolved', disposition: 'completed' }`. Assert `phase === 'continuity'`, continuity remains, and `firstPlayableScene` plus `firstSceneGuidance` are absent.

- [ ] **Step 7: Run RED, implement the continuity branch, and verify GREEN**

Run before implementation: `node tools/scripts/test-v1-runtime-opening-prompt.mjs`

Expected: FAIL because first-scene material remains.

Implement the terminal-objective branch, rerun, and expect exit 0.

- [ ] **Step 8: Register the focused test and run prompt/runtime regression tests**

Add `test-v1-runtime-opening-prompt.mjs` adjacent to `test-v1-runtime-app.mjs` in `run-alpha-gate.mjs`.

Run: `node tools/scripts/test-v1-runtime-opening-prompt.mjs`

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: both exit 0.

- [ ] **Step 9: Commit Task 2**

```powershell
git add src/runtime/runtime-app.mjs tools/scripts/test-v1-runtime-opening-prompt.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(runtime): retain Ashes opening context"
```

### Task 3: Sanitize inherited Author's Note metadata on fresh chats

**Files:**
- Create: `tools/scripts/test-sillytavern-fresh-chat-hygiene.mjs`
- Modify: `src/hosts/sillytavern/chat-adapter.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Consumes: a newly created chat context with mutable `chatMetadata`/`chat_metadata` and `saveChat`.
- Produces: `clearFreshDirectiveChatOpeningMessages(context)` that clears safe-to-remove greeting messages, resets per-chat Author's Note metadata to `{ note_prompt: '', note_interval: 1, note_position: 1, note_depth: 4, note_role: 0 }`, preserves unrelated metadata, and throws retryable code `DIRECTIVE_FRESH_CHAT_PROMPT_HYGIENE_FAILED` when persistence fails.

- [ ] **Step 1: Write the failing successful-hygiene test**

Seed a fresh context with one host greeting, the inspected Hermione note controls, and unrelated metadata. Call the existing exported test hook. Assert the greeting is removed, the five note fields equal safe SillyTavern defaults, unrelated metadata remains byte-for-byte equivalent, and persistence occurs once.

- [ ] **Step 2: Run the hygiene test and verify RED**

Run: `node tools/scripts/test-sillytavern-fresh-chat-hygiene.mjs`

Expected: FAIL because the current helper removes only messages and leaves the note intact.

- [ ] **Step 3: Implement minimal fresh-chat metadata sanitation**

Add a frozen defaults object and update `clearFreshDirectiveChatOpeningMessages` to sanitize the shared chat metadata object before saving. Include `sanitizedAuthorNote`, `hadInheritedAuthorNote`, and the existing message counts/status in its result. Do not call the helper for existing-chat bindings.

- [ ] **Step 4: Run the hygiene test and verify GREEN**

Run: `node tools/scripts/test-sillytavern-fresh-chat-hygiene.mjs`

Expected: exit 0.

- [ ] **Step 5: Write the failing persistence-error test**

Use a fresh context whose `saveChat` throws. Assert rejection with code `DIRECTIVE_FRESH_CHAT_PROMPT_HYGIENE_FAILED`, `retryable === true`, and a message naming Author's Note isolation. Also assert the helper does not touch a separate object representing the previously selected chat.

- [ ] **Step 6: Run RED, implement the typed retryable error, and verify GREEN**

Run before implementation: `node tools/scripts/test-sillytavern-fresh-chat-hygiene.mjs`

Expected: FAIL because the raw save error escapes.

Wrap only the fresh-chat persistence failure, attach the original error as `cause`, rerun, and expect exit 0.

- [ ] **Step 7: Register and run focused host regressions**

Add the new test beside the other SillyTavern tests in `run-alpha-gate.mjs`.

Run: `node tools/scripts/test-sillytavern-fresh-chat-hygiene.mjs`

Run: `node tools/scripts/test-sillytavern-checkpoint-chat.mjs`

Run: `node tools/scripts/test-v1-runtime-app.mjs`

Expected: all exit 0.

- [ ] **Step 8: Commit Task 3**

```powershell
git add src/hosts/sillytavern/chat-adapter.mjs tools/scripts/test-sillytavern-fresh-chat-hygiene.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "fix(host): isolate fresh campaign prompts"
```

### Task 4: Certify, install, and prove the complete interaction

**Files:**
- Modify only if verification exposes a defect: files owned by Tasks 1-3.

**Interfaces:**
- Consumes: the complete feature branch.
- Produces: passing alpha gate, source/install parity, and live default-user evidence from a new V1 save.

- [ ] **Step 1: Run static and full automated verification**

Run: `git diff --check main...HEAD`

Run: `npm.cmd test`

Expected: zero diff errors and the complete alpha gate exits 0.

- [ ] **Step 2: Review the final diff against the design**

Confirm each requirement has an implementation and test, no unrelated refactor or legacy path was added, PADD work stops at canonical props, current default-user files were not mutated, and the new prompt content contains no hidden Prelude facts.

- [ ] **Step 3: Sync only the Directive extension into default-user**

Use the repository's established installed-copy workflow, excluding `.git`, `node_modules`, artifacts, and unrelated user data. Verify SHA-256 parity for every changed runtime/package file between the feature worktree and `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive`.

- [ ] **Step 4: Run live default-user acceptance on a new campaign**

Create a new Ashes save and prove: the chat Author's Note is empty; the deterministic opener contains shuttle, cabin, PADD, overnight, and ready-room beats; an opening regeneration preserves those beats and stops at the door; the first ready-room response gives introduction, courtesy, small talk, and a natural transition; and the installed runtime prompt retains compact continuity after the first accepted pair.

- [ ] **Step 5: Commit any verification-only corrections**

If live proof required a correction, repeat its focused RED/GREEN cycle and commit with the narrowest conventional message. Otherwise create no empty commit.

- [ ] **Step 6: Merge and push**

From the primary checkout, verify unrelated work is absent, fast-forward merge the completed feature branch into `main`, rerun `npm.cmd test` on the merged tree, and push `main` to `origin`. Verify the remote `main` SHA independently with GitHub CLI network access.
