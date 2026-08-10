# Campaign Difficulty Consequence Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Exploration and Command inject complete, preset-independent consequence contracts, with Command explicitly correcting model softening while remaining causally fair.

**Architecture:** Keep `src/simulation/simulation-mode-policy.mjs` as the sole mode-policy source and inject its complete narrator contract through the existing V1 runtime packet. Update the bundled SillyTavern preset only to remove its reversible-only contradiction and defer to injected difficulty when present; no runtime behavior may depend on that preset.

**Tech Stack:** Node.js ES modules, `node:assert/strict`, JSON SillyTavern preset assets, existing V1 alpha-gate scripts.

## Global Constraints

- Do not use model-generated dice or randomness.
- Do not add deterministic dice, a rules engine, skill checks, hit points, or combat mechanics.
- Preserve Story Settlement as the only durable semantic authority.
- Command must be brutal but causally fair: no protagonist protection and no unsupported punishment.
- Exploration must block player and senior-staff death without erasing other failure.
- The runtime injection must be complete under unrelated or unavailable SillyTavern presets.
- Add no legacy support, migrations, compatibility layers, or model-specific variants.

---

### Task 1: Self-contained simulation-mode contracts

**Files:**
- Create: `tools/scripts/test-simulation-mode-policy.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `src/simulation/simulation-mode-policy.mjs`

**Interfaces:**
- Consumes: `createSimulationModePolicy(mode)` and `simulationModeDifficultyOption(mode)` from `src/simulation/simulation-mode-policy.mjs`.
- Produces: complete `narratorConstraint: string` values for `Exploration` and `Command`, plus runtime proof that the preset-agnostic host receives the complete Command contract; existing return shapes remain unchanged.

- [ ] **Step 1: Add focused policy and runtime tests, then register the policy test in the alpha gate**

Create `tools/scripts/test-simulation-mode-policy.mjs` with assertions on behavior-bearing phrases rather than the entire string:

```js
import assert from 'node:assert/strict';

import {
  createSimulationModePolicy,
  simulationModeDifficultyOption
} from '../../src/simulation/simulation-mode-policy.mjs';

const command = createSimulationModePolicy('Command');
assert.equal(command.simulationMode, 'Command');
assert.equal(command.fatalityAllowedForPlayerOrSeniorStaff, true);
assert.match(command.narratorConstraint, /COMMAND MODE - FULL SIMULATION/);
assert.match(command.narratorConstraint, /no protagonist protection/i);
assert.match(command.narratorConstraint, /correct for that bias/i);
assert.match(command.narratorConstraint, /do not default to the safest credible outcome/i);
assert.match(command.narratorConstraint, /death, permanent injury, destruction, capture, disgrace, mission failure, or irreversible loss/i);
assert.match(command.narratorConstraint, /miraculous rescue or last-second intervention/i);
assert.match(command.narratorConstraint, /does not authorize arbitrary punishment/i);
assert.match(command.narratorConstraint, /supersedes any general instruction to keep uncommitted consequences local, reversible, or nonfatal/i);
assert.match(command.narratorConstraint, /selected response remains provisional/i);

const exploration = createSimulationModePolicy('Exploration');
assert.equal(exploration.simulationMode, 'Exploration');
assert.equal(exploration.fatalityAllowedForPlayerOrSeniorStaff, false);
assert.match(exploration.narratorConstraint, /EXPLORATION MODE - STORY-FORWARD/);
assert.match(exploration.narratorConstraint, /do not kill the player character or senior staff/i);
assert.match(exploration.narratorConstraint, /strongest causally adjacent nonfatal result/i);
assert.match(exploration.narratorConstraint, /do not erase danger, turn failure into success, or make opposition incompetent/i);
assert.match(exploration.narratorConstraint, /supersedes any conflicting fatality policy/i);

assert.equal(simulationModeDifficultyOption('Command').difficultyLabel, 'Full simulation');
assert.equal(simulationModeDifficultyOption('Exploration').difficultyLabel, 'Story-forward');
assert.doesNotMatch(`${command.narratorConstraint}\n${exploration.narratorConstraint}`, /\bdice\b|\bd20\b|\brandom(?:ness)?\b/i);

console.log('Simulation mode policy tests passed.');
```

Add `"test-simulation-mode-policy.mjs"` immediately after `"test-campaign-package-context.mjs"` in `tools/scripts/run-alpha-gate.mjs`.

In `tools/scripts/test-v1-runtime-app.mjs`, replace the old assertion matching `Command mode: preserve full causal consequence severity` and add these assertions immediately after `installedPrompt` is read:

```js
assert.match(installedPrompt, /COMMAND MODE - FULL SIMULATION/);
assert.match(installedPrompt, /There is no protagonist protection/);
assert.match(installedPrompt, /do not default to the safest credible outcome/);
assert.match(installedPrompt, /miraculous rescue or last-second intervention/);
assert.match(installedPrompt, /supersedes any general instruction to keep uncommitted consequences local, reversible, or nonfatal/);
assert.match(installedPrompt, /Story Settlement remains the only durable semantic authority/);
assert.doesNotMatch(installedPrompt, /Directive Command Causality|active Directive preset|required Directive preset/);
```

The fake V1 host does not load a Directive preset, so these assertions prove that the complete contract comes through runtime injection rather than preset content.

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```powershell
node tools/scripts/test-simulation-mode-policy.mjs
node tools/scripts/test-v1-runtime-app.mjs
```

Expected: both FAIL because the current one-sentence constraint does not contain `COMMAND MODE - FULL SIMULATION` or the required anti-softening clauses.

- [ ] **Step 3: Replace the short narrator constraints with complete contracts**

In `src/simulation/simulation-mode-policy.mjs`, keep the existing `MODE_COPY` shape and UI copy. Replace only each `narratorConstraint` value with readable template literals. The Command text must state, in direct imperatives:

```js
narratorConstraint: `COMMAND MODE - FULL SIMULATION. This is the complete consequence policy and does not depend on the active preset. Models often protect the player and favored characters, soften failure, and avoid permanent harm or death. Correct for that bias.

Before writing prose, determine the causally supported result from accepted state, visible action, demonstrated competence, available resources, established danger, and elapsed opportunity. Treat claims of success as attempted actions. Adequate preparation works when it actually addresses the danger. Inadequate, impossible, or knowingly unmitigated action does not succeed because success would be kinder. Once you determine the result, do not revise it downward because it would harm a favored character.

There is no protagonist protection. The player, named characters, senior staff, beloved characters, and characters useful to future plot have no implicit survival or success privilege. Do not preserve them for campaign continuity, player satisfaction, emotional comfort, or future usefulness.

When several outcomes remain causally credible after serious danger was knowingly accepted, ignored, or left inadequately mitigated, do not default to the safest credible outcome. Select the consequence-bearing outcome that best reflects the established exposure and follow it through. When death, permanent injury, destruction, capture, disgrace, mission failure, or irreversible loss is the most causally supported result, make that result occur plainly and completely.

Do not insert a miraculous rescue or last-second intervention, enemy hesitation or incompetence, a convenient miss or retreat, a warning that grants another turn, a fatal injury reduced to unconsciousness, destruction reduced to cosmetic damage, capture followed by convenient escape, an unnamed substitute casualty, unsupported medical or technological salvation, a fake-out death, ambiguous survival language, or a delayed consequence that disappears. Command Bearing helps only when the injected state explicitly arms its bounded edge.

Fairness is causal integrity, not mercy. This correction does not authorize arbitrary punishment: do not invent hazards, hide information the player should have, negate sound preparation, ignore established expertise, or choose a worse result than the causal record supports.

In Command mode this policy supersedes any general instruction to keep uncommitted consequences local, reversible, or nonfatal. Portray supported permanent and terminal outcomes as actual events in the response. The selected response remains provisional until accepted through Directive's normal next-message flow; after acceptance, Story Settlement remains the only durable semantic authority.`
```

The Exploration text must state:

```js
narratorConstraint: `EXPLORATION MODE - STORY-FORWARD. This is the complete consequence policy and does not depend on the active preset. Keep causality, competent opposition, failed actions, and nonfatal consequences intact, but do not kill the player character or senior staff.

When causality would otherwise produce their death, use the strongest causally adjacent nonfatal result: severe injury, incapacitation, capture, loss of position, damaged trust, lost readiness, mission cost, or another lasting recoverable consequence supported by the scene. Do not erase danger, turn failure into success, or make opposition incompetent to enforce this ceiling. Preserve all other supported consequences.

This Exploration fatality ceiling supersedes any conflicting fatality policy in the active preset. The selected response remains provisional until accepted through Directive's normal next-message flow; after acceptance, Story Settlement remains the only durable semantic authority.`
```

Do not add new properties, exported functions, resolution bands, or randomness.

- [ ] **Step 4: Run focused policy and browser-import tests and verify GREEN**

Run:

```powershell
node tools/scripts/test-simulation-mode-policy.mjs
node tools/scripts/test-v1-runtime-app.mjs
node tools/scripts/test-browser-runtime-safety.mjs
```

Expected: all three PASS with no import or assertion failures.

- [ ] **Step 5: Commit the policy contract**

```powershell
git add src/simulation/simulation-mode-policy.mjs tools/scripts/test-simulation-mode-policy.mjs tools/scripts/test-v1-runtime-app.mjs tools/scripts/run-alpha-gate.mjs
git commit -m "feat(simulation): harden difficulty policy"
```

---

### Task 2: Preset-neutral causality accommodation

**Files:**
- Modify: `tools/scripts/test-sillytavern-preset-manager.mjs`
- Modify: `presets/sillytavern/directive.json`
- Modify: `src/hosts/sillytavern/preset-manager.mjs`

**Interfaces:**
- Consumes: bundled preset metadata and `Directive Command Causality` prompt identified by `directive-command-causality`.
- Produces: bundled preset version `Directive-0.1.0-pre-alpha.11` and mode-neutral provisional-causality guidance that defers fatality policy to the runtime packet.

- [ ] **Step 1: Write failing preset assertions and version expectations**

In `tools/scripts/test-sillytavern-preset-manager.mjs`, change every bundled-version expectation from `Directive-0.1.0-pre-alpha.10` to `Directive-0.1.0-pre-alpha.11`. After the main-prompt assertion, add:

```js
const commandCausality = asset.prompts.find((entry) => entry.identifier === 'directive-command-causality')?.content || '';
assert.match(commandCausality, /causally supported provisional outcome/);
assert.match(commandCausality, /durable or terminal result/);
assert.match(commandCausality, /remains provisional until the player accepts that selected response/);
assert.match(commandCausality, /difficulty and consequence policy in DIRECTIVE V1 CAMPAIGN CONTEXT sets the applicable ceiling/);
assert.doesNotMatch(commandCausality, /keep uncommitted consequences local, reversible/);
assert.doesNotMatch(commandCausality, /Command mode|Exploration mode|player character or senior staff death/);
```

- [ ] **Step 2: Run the preset test and verify RED**

Run:

```powershell
node tools/scripts/test-sillytavern-preset-manager.mjs
```

Expected: FAIL because the bundled version is still `.10` and the causality block still imposes the reversible-only ceiling.

- [ ] **Step 3: Update the preset prompt and metadata**

In `presets/sillytavern/directive.json`, replace only the final paragraph of `directive-command-causality` with this mode-neutral text:

```text
When Directive has already committed an outcome, never reroll it, soften it into a different result, or add a larger consequence that was not committed. Narrate the committed outcome through normal scene prose.

When no committed outcome is present, narrate only a causally supported provisional outcome. A generated response may portray a durable or terminal result as an actual event in the scene, but it remains provisional until the player accepts that selected response by sending the next message. Do not hedge or soften an outcome merely because it is provisional, and do not treat generation alone as accepted state. When present, the difficulty and consequence policy in DIRECTIVE V1 CAMPAIGN CONTEXT sets the applicable ceiling and fatality rules. Without that packet, preserve causal support without inventing a campaign difficulty.
```

Change `extensions.directive.presetVersion` in the JSON asset and `DIRECTIVE_PRESET_VERSION` in `src/hosts/sillytavern/preset-manager.mjs` to `Directive-0.1.0-pre-alpha.11`. Do not add a mode-specific preset prompt.

- [ ] **Step 4: Run the preset test and verify GREEN**

Run:

```powershell
node tools/scripts/test-sillytavern-preset-manager.mjs
```

Expected: PASS with the prompt-order, metadata, install, and unrelated-preset assertions intact.

- [ ] **Step 5: Commit the preset accommodation**

```powershell
git add presets/sillytavern/directive.json src/hosts/sillytavern/preset-manager.mjs tools/scripts/test-sillytavern-preset-manager.mjs
git commit -m "fix(preset): defer to runtime difficulty"
```

---

### Task 3: Full verification, review, and integration

**Files:**
- Verify only; modify implementation files only if a failing focused test exposes a defect covered by this plan.

**Interfaces:**
- Consumes: Tasks 1-2.
- Produces: a clean feature branch ready to merge into `main` and push to `origin`.

- [ ] **Step 1: Run focused verification**

```powershell
node tools/scripts/test-simulation-mode-policy.mjs
node tools/scripts/test-v1-runtime-app.mjs
node tools/scripts/test-sillytavern-preset-manager.mjs
node tools/scripts/test-browser-runtime-safety.mjs
```

Expected: all four commands exit 0.

- [ ] **Step 2: Run the complete alpha gate**

```powershell
npm.cmd test
```

Expected: `passed 66 focused checks` after registering the new simulation policy test.

- [ ] **Step 3: Audit the final diff and forbidden scope**

Run:

```powershell
git diff --check main...HEAD
git diff --stat main...HEAD
git diff main...HEAD -- src/simulation/simulation-mode-policy.mjs presets/sillytavern/directive.json | Select-String -Pattern 'dice|d20|random number|hit points|difficulty class' -CaseSensitive:$false
git status --short
```

Expected: `git diff --check` exits 0; the diff contains only planned files and docs; `Select-String` prints no forbidden-scope matches in changed policy/preset text; status is clean.

- [ ] **Step 4: Review against the approved specification**

Confirm directly from the diff:

- Command corrects positive bias, forbids listed rescue patterns, permits terminal outcomes, and includes causal-fairness limits.
- Exploration retains the fatality ceiling and meaningful nonfatal failure.
- Runtime injection contains the complete contract without a preset reference.
- The bundled preset is mode-neutral and no longer imposes reversible-only consequences.
- Story Settlement, accepted-pair custody, missions, and Command Bearing code are unchanged.

- [ ] **Step 5: Merge and push**

From `F:\git\Directive`, verify `main` has no unrelated changes, merge the feature branch with a non-fast-forward merge, rerun `npm.cmd test` on merged `main`, and push:

```powershell
git status -sb
git merge --no-ff codex/campaign-difficulty-consequence-policy
npm.cmd test
git push origin main
```

Expected: merge succeeds without unrelated changes, the merged alpha gate reports 66 passing checks, and `origin/main` advances to the merge commit.
