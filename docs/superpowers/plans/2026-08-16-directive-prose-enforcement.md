# Directive Prose Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Directive's generic grounded-prose prompt with a compact, post-history, Star Trek-tuned anti-slop enforcement block.

**Architecture:** Keep the stable `directive-grounded-prose` identifier and replace its content in the bundled SillyTavern preset. Move that identifier after `chatHistory`, preserve the existing post-history gameplay reinforcement, and use the current preset-version lifecycle to prompt installed copies to refresh.

**Tech Stack:** SillyTavern preset JSON, Node.js ESM assertion scripts, npm alpha gate.

## Global Constraints

- The replacement prose block must contain no more than 320 words.
- Apply the rules to narration and NPC dialogue while preserving literal operational negation, deliberate character voice, and supported technical terminology.
- Do not add model-specific prompts, assistant prefill, regex prose rewriting, or new logit-bias entries.
- Do not stage or overwrite `debug.log`.
- Push the verified result to `main`.

---

### Task 1: Lock the compact preset contract

**Files:**
- Modify: `tools/scripts/test-sillytavern-preset-manager.mjs:88-180`

**Interfaces:**
- Consumes: `presets/sillytavern/directive.json` as the bundled preset asset.
- Produces: regression coverage for preset version, prose-block identity, enabled order, word budget, anti-pattern coverage, and positive replacement rules.

- [ ] **Step 1: Write the failing preset assertions**

Update all bundled-version expectations to `Directive-0.1.0-pre-alpha.13`, then add:

```js
const proseEnforcement = asset.prompts.find((entry) => entry.identifier === 'directive-grounded-prose');
assert.equal(proseEnforcement?.name, 'Directive Prose Enforcement');

const chatHistoryIndex = assetOrder.findIndex((entry) => entry.identifier === 'chatHistory');
const proseEnforcementIndex = assetOrder.findIndex((entry) => entry.identifier === 'directive-grounded-prose');
const postHistoryIndex = assetOrder.findIndex((entry) => entry.identifier === 'directive-post-history');
assert.ok(proseEnforcementIndex > chatHistoryIndex, 'Prose enforcement should follow chat history.');
assert.ok(proseEnforcementIndex < postHistoryIndex, 'Gameplay reinforcement should remain the final enabled system prompt.');

const proseEnforcementContent = proseEnforcement?.content || '';
assert.ok(proseEnforcementContent.trim().split(/\s+/).length <= 320, 'Prose enforcement should remain compact.');
assert.match(proseEnforcementContent, /Epanorthosis/);
assert.match(proseEnforcementContent, /Technobabble as atmosphere/);
assert.match(proseEnforcementContent, /Automatic command validation/);
assert.match(proseEnforcementContent, /State the intended meaning directly/);
assert.match(proseEnforcementContent, /Fresh Ink/);
assert.match(proseEnforcementContent, /Voice Isolation/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-sillytavern-preset-manager.mjs
```

Expected: FAIL because the bundled version is still `.12`, the block is still named `Directive Grounded Prose`, and it remains before `chatHistory`.

### Task 2: Replace and reposition the prose enforcement block

**Files:**
- Modify: `presets/sillytavern/directive.json:499-521,590-646`
- Modify: `src/hosts/sillytavern/preset-manager.mjs:9`

**Interfaces:**
- Consumes: the existing preset prompt schema and `DIRECTIVE_PRESET_VERSION` lifecycle.
- Produces: bundled preset version `Directive-0.1.0-pre-alpha.13` with a compact post-history prose contract.

- [ ] **Step 1: Replace the prompt name and content**

Keep identifier `directive-grounded-prose` and set its name to `Directive Prose Enforcement`. Use this exact content:

```text
# Prose Enforcement
Apply these rules in narration and NPC dialogue. Preserve deliberate character voice and necessary facts.

## Banned Constructions
- Epanorthosis and rhetorical correction: `not X, but Y`, `it is not X, it is Y`, `not just X`, and close variants. State Y directly.
- Negative parallelism used for drama: `No sound. No movement. No hope.` Describe what happens.
- Hollow atmosphere: heavy silence, palpable tension, charged air, or a ship or room seeming to breathe, wait, or understand.
- Unnamed significance: a nameless feeling, something shifting between people, the weight of a moment, or an action immediately explaining its symbolism.
- Perception dodging and mouth choreography: `didn't know what to say`, mouth opening and closing, swallowing thickly, or searching a face.
- Fragmented emphasis, rule-of-three summaries, and poetic or reflective scene wrap-ups.

## Stock Starship Prose
- Technobabble as atmosphere: quantum, subspace, chroniton, or sensor terms without a reading, mechanism, or consequence.
- Decorative ship ambience: unexplained ozone, ionized air, metallic tang, holographic shimmer, console chirps, or machinery hum used only for mood.
- Automatic command validation: bridge-wide awe, a crew moving as one, instant respect, approving looks, professional masks slipping on cue, or narration praising rank.
- Generic body tics: caught breath, widened eyes, tightened jaw, whitened knuckles, dropped voice, racing heart, or a shiver down the spine.

## Use Instead
Use direct statements, character-specific dialogue, professional behavior, readings, reports, object handling, spatial changes, and concrete consequences. Technical language requires a supporting measurement, diagnosis, failure, or scientific claim. Literal negation remains valid for facts, refusals, warnings, and operational limits.

## Fresh Ink
The previous turn already happened. Begin with new action, dialogue, evidence, or consequence. Do not restate, paraphrase, decorate, or echo the player's wording.

## Voice Isolation
Use chat history for factual continuity and established character voices, not narrator clichés, cadence, or repeated sentence frames.
```

- [ ] **Step 2: Move the enabled prompt after history**

In `prompt_order[0].order`, remove `directive-grounded-prose` from its current position and insert it immediately after `chatHistory`, before `directive-post-history`. Keep it enabled.

- [ ] **Step 3: Increment the bundled version**

Set both values to `Directive-0.1.0-pre-alpha.13`:

```js
export const DIRECTIVE_PRESET_VERSION = 'Directive-0.1.0-pre-alpha.13';
```

```json
"presetVersion": "Directive-0.1.0-pre-alpha.13"
```

Update the preset notes to describe compact Wandlight-style post-history prose enforcement tuned for Starfleet and science-fiction narration.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node tools/scripts/test-sillytavern-preset-manager.mjs
```

Expected: `SillyTavern preset manager tests passed: metadata, status comparison, install, and narration selection lifecycle`.

### Task 3: Verify and integrate

**Files:**
- Verify only: all changed files

**Interfaces:**
- Consumes: the completed preset, version constant, and regression test.
- Produces: a clean commit merged and pushed to `origin/main` without unrelated files.

- [ ] **Step 1: Validate the artifact and diff**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('presets/sillytavern/directive.json','utf8')); console.log('Directive preset JSON parsed.')"
git diff --check
git status --short
```

Expected: JSON parse confirmation, no diff errors, and only the approved files plus test-generated `debug.log` listed.

- [ ] **Step 2: Run the full alpha gate**

Run:

```powershell
npm.cmd test
```

Expected: exit code `0` and `[v1-gate] passed 145 focused checks.`

- [ ] **Step 3: Commit only the approved implementation files**

Stage:

```powershell
git add presets/sillytavern/directive.json src/hosts/sillytavern/preset-manager.mjs tools/scripts/test-sillytavern-preset-manager.mjs docs/superpowers/plans/2026-08-16-directive-prose-enforcement.md
```

Commit:

```text
fix(preset): enforce grounded Starfleet prose
```

- [ ] **Step 4: Merge into current local main and push**

Fast-forward local `main` to current `origin/main`, fast-forward merge `codex/star-trek-prose-enforcement`, rerun the focused preset test from merged `main`, then run:

```powershell
git push origin main
```

Expected: `origin/main` advances to the implementation commit while the original checkout's unrelated `debug.log` remains modified and unstaged.
