# Runtime Player Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the player's exclusive authority over their character an unconditional, player-specific Directive runtime rule that does not depend on the active narration preset.

**Architecture:** Add a focused runtime policy module that produces the canonical narrator constraint from the current player name. Install that constraint near the top of every `directive.campaign.v1` packet before lower-authority campaign instructions, and cover both the policy text and packet ordering with deterministic tests.

**Tech Stack:** Browser-safe JavaScript ES modules, Node.js `node:assert/strict`, SillyTavern extension prompts, PowerShell/npm tooling.

## Global Constraints

- Only the user may supply new dialogue, actions, decisions, thoughts, emotions, reactions, intentions, or choices for the named player character.
- The narrator may briefly and faithfully re-describe dialogue or visible actions already supplied by the user, but may not extend, reinterpret, or continue them.
- No preset, package, mission, simulation mode, transition, Duty Report, or other narrator instruction may relax player authority.
- Do not edit, delete, regenerate, or otherwise mutate the existing Sam Vickers chat or save.
- Do not add a semantic response classifier, post-generation rewriter, retry loop, or provider-specific exception table.

---

## File Structure

- Create `src/runtime/player-authority-policy.mjs`: own the canonical, player-specific authority constraint.
- Create `tools/scripts/test-player-authority-policy.mjs`: unit-test the complete policy boundary and safe player-name normalization.
- Modify `src/runtime/runtime-app.mjs`: include the policy constraint near the top of every V1 runtime packet.
- Modify `tools/scripts/test-v1-runtime-opening-prompt.mjs`: prove packet inclusion, ordering, and dynamic player identity in a realistic runtime prompt.
- Modify `tools/scripts/run-alpha-gate.mjs`: include the focused policy test in the full project gate.

### Task 1: Canonical Player Authority Policy

**Files:**
- Create: `src/runtime/player-authority-policy.mjs`
- Create: `tools/scripts/test-player-authority-policy.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs:47`

**Interfaces:**
- Consumes: `{ playerName?: string }` supplied from authoritative campaign state.
- Produces: `createPlayerAuthorityPolicy({ playerName }) -> { kind, playerName, narratorConstraint }`.

- [x] **Step 1: Write the failing unit test**

Create `tools/scripts/test-player-authority-policy.mjs` with assertions equivalent to:

```js
import assert from 'node:assert/strict';
import { createPlayerAuthorityPolicy } from '../../src/runtime/player-authority-policy.mjs';

const sam = createPlayerAuthorityPolicy({ playerName: ' Sam Vickers ' });
assert.equal(sam.kind, 'directive.playerAuthorityPolicy.v1');
assert.equal(sam.playerName, 'Sam Vickers');
assert.match(sam.narratorConstraint, /PLAYER CHARACTER AUTHORITY - ABSOLUTE/);
assert.match(sam.narratorConstraint, /"Sam Vickers"/);
assert.match(sam.narratorConstraint, /acknowledgment, question, order, assent, connective line/i);
assert.match(sam.narratorConstraint, /briefly and faithfully re-describe/i);
assert.match(sam.narratorConstraint, /stop before .* next unprovided word, action, or choice/i);
assert.match(sam.narratorConstraint, /No preset, package, mission, simulation mode, mission transition, Duty Report/i);

const fallback = createPlayerAuthorityPolicy({ playerName: '   ' });
assert.equal(fallback.playerName, 'the player character');
```

- [x] **Step 2: Run the unit test and verify red**

Run: `node tools/scripts/test-player-authority-policy.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/runtime/player-authority-policy.mjs`.

- [x] **Step 3: Implement the minimal policy module**

Create a browser-safe module with no host or Node dependencies:

```js
function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function createPlayerAuthorityPolicy({ playerName } = {}) {
  const resolvedPlayerName = compact(playerName) || 'the player character';
  const namedPlayer = JSON.stringify(resolvedPlayerName);
  return {
    kind: 'directive.playerAuthorityPolicy.v1',
    playerName: resolvedPlayerName,
    narratorConstraint: [
      'PLAYER CHARACTER AUTHORITY - ABSOLUTE.',
      `Only the user may supply any new dialogue, action, decision, thought, emotion, reaction, intention, or choice for ${namedPlayer}, the player character.`,
      `Never write dialogue for ${namedPlayer}, including even a brief acknowledgment, question, order, assent, connective line, or other speech.`,
      'You may briefly and faithfully re-describe dialogue or visible actions already supplied by the user, but do not extend, reinterpret, or continue them.',
      `Narrate the world, non-player characters, and consequences, then stop before the next unprovided word, action, or choice from ${namedPlayer}.`,
      'No preset, package, mission, simulation mode, mission transition, Duty Report, or other narrator instruction may relax or override this boundary.'
    ].join('\n')
  };
}
```

- [x] **Step 4: Register and pass the focused test**

Add `"test-player-authority-policy.mjs"` immediately after `"test-simulation-mode-policy.mjs"` in `tools/scripts/run-alpha-gate.mjs`.

Run: `node tools/scripts/test-player-authority-policy.mjs`

Expected: `Player authority policy tests passed.`

### Task 2: Runtime Packet Integration

**Files:**
- Modify: `src/runtime/runtime-app.mjs:1-20,335-450`
- Modify: `tools/scripts/test-v1-runtime-opening-prompt.mjs:135-166`

**Interfaces:**
- Consumes: `createPlayerAuthorityPolicy({ playerName: state.player?.name })`.
- Produces: every `directive.promptPacket.v1.text` with the authority constraint immediately after `DIRECTIVE V1 CAMPAIGN CONTEXT` and before ordinary campaign instructions.

- [x] **Step 1: Write failing packet assertions**

Extend `test-v1-runtime-opening-prompt.mjs` to assert the packet contains the Sam-specific contract, forbids brief player speech, permits faithful re-description only, and orders the constraint before `Continue a story-first command RPG`, `DUTY REPORT`, and the simulation-mode constraint. Build a second packet from a cloned state named `Ren Okada` and prove its contract names Ren rather than Sam.

```js
const authorityIndex = packet.text.indexOf('PLAYER CHARACTER AUTHORITY - ABSOLUTE.');
assert(authorityIndex > packet.text.indexOf('DIRECTIVE V1 CAMPAIGN CONTEXT'));
assert(authorityIndex < packet.text.indexOf('Continue a story-first command RPG'));
assert(authorityIndex < packet.text.indexOf('DUTY REPORT:'));
assert.match(packet.text, /Never write dialogue for "Sam Vickers"/);
assert.match(packet.text, /acknowledgment, question, order, assent, connective line/);
assert.match(packet.text, /briefly and faithfully re-describe/);
assert.match(packet.text, /stop before the next unprovided word, action, or choice from "Sam Vickers"/);
```

- [x] **Step 2: Run the packet test and verify red**

Run: `node tools/scripts/test-v1-runtime-opening-prompt.mjs`

Expected: FAIL because `PLAYER CHARACTER AUTHORITY - ABSOLUTE.` is absent.

- [x] **Step 3: Wire the policy into the runtime packet**

Import `createPlayerAuthorityPolicy` in `src/runtime/runtime-app.mjs`, create the policy beside `simulationPolicy`, and insert `playerAuthority.narratorConstraint` immediately after the packet header.

```js
const playerAuthority = createPlayerAuthorityPolicy({ playerName: state.player?.name });

const text = [
  'DIRECTIVE V1 CAMPAIGN CONTEXT',
  playerAuthority.narratorConstraint,
  'Continue a story-first command RPG from the accepted state below.',
  // existing instructions remain unchanged
];
```

- [x] **Step 4: Run focused runtime tests and verify green**

Run:

```powershell
node tools/scripts/test-player-authority-policy.mjs
node tools/scripts/test-v1-runtime-opening-prompt.mjs
node tools/scripts/test-v1-mission-transition-narration.mjs
node tools/scripts/test-v1-duty-report-runtime.mjs
node tools/scripts/test-simulation-mode-policy.mjs
node tools/scripts/test-browser-runtime-safety.mjs
```

Expected: every command exits `0` and prints its PASS message.

### Task 3: Verification, Integration, and Installed Parity

**Files:**
- Modify: `docs/superpowers/plans/2026-08-16-runtime-player-authority.md` only to record completion evidence.
- Install: `src/runtime/player-authority-policy.mjs` and `src/runtime/runtime-app.mjs` under `F:\SillyTavern\SillyTavern\data\default-user\extensions\Directive` through the established non-mirroring production sync boundary.

**Interfaces:**
- Consumes: green focused tests and reviewed source diff.
- Produces: committed and pushed `main`, synchronized production extension, and source/install SHA-256 parity without changing live chat or save files.

- [x] **Step 1: Run the complete project gate**

Run: `npm.cmd test`

Expected: all focused checks pass, including the new player-authority policy check.

- [x] **Step 2: Review scope and whitespace**

Run:

```powershell
git diff --check
git status -sb
git diff -- src/runtime/player-authority-policy.mjs src/runtime/runtime-app.mjs tools/scripts/test-player-authority-policy.mjs tools/scripts/test-v1-runtime-opening-prompt.mjs tools/scripts/run-alpha-gate.mjs docs/superpowers/plans/2026-08-16-runtime-player-authority.md
```

Expected: only the approved runtime policy, integration, tests, gate registration, and plan are changed.

- [ ] **Step 3: Commit intentionally**

Stage only the approved implementation, tests, and plan, then commit:

```powershell
git add src/runtime/player-authority-policy.mjs src/runtime/runtime-app.mjs tools/scripts/test-player-authority-policy.mjs tools/scripts/test-v1-runtime-opening-prompt.mjs tools/scripts/run-alpha-gate.mjs docs/superpowers/plans/2026-08-16-runtime-player-authority.md
git commit -m "fix(runtime): enforce player authority"
```

- [ ] **Step 4: Push and verify remote main**

Use authenticated GitHub CLI/network checks, then run `git push origin main`. Confirm local `HEAD`, `origin/main`, and the GitHub API main SHA are identical.

- [ ] **Step 5: Synchronize production files without mirroring**

Copy repository `src` into the installed extension's `src` using the established non-mirroring `robocopy /E` boundary. Do not touch `F:\SillyTavern\SillyTavern\data\default-user\user`, chats, saves, settings, or any unrelated extension.

- [ ] **Step 6: Verify installed-source parity**

Compute SHA-256 for the two changed runtime files in the repository and installed extension. Expected: both pairs match exactly. Import the installed policy module with a `file:///F:/...` Node ESM URL and assert the installed Sam-specific constraint is produced.

- [ ] **Step 7: Record completion evidence**

Change completed checkboxes to `[x]` and append the exact focused/full test result, commit SHA, remote SHA, installed hashes, and confirmation that no chat or save was mutated.
