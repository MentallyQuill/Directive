# Ship Command Assignment Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Ship route's conversational Cohesion-task headings and supporting labels with the approved command-focused RPG vocabulary.

**Architecture:** Keep the change presentation-only in `ship-journal.js`; the projection, package data, task authority, persistence, mechanics, styles, and interaction structure remain untouched. Protect the exact visible and accessible vocabulary through the existing certified Ship-panel and browser-visual tests, then align the durable expanded-interface contract.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, Playwright/Chromium visual checks, Markdown design contracts.

## Global Constraints

- Use these exact detail labels: `Level {n} Command Assignment`, `Situation`, `Objective`, `Command Impact`, `Course of Action`, `Operational Risk`, and `Resolution Criteria`.
- Update adjacent visible and ARIA task chrome to use `command assignment`, `resolution`, `objectives`, and `resolved assignments` consistently.
- Keep `Next: {phase}`, all source-owned task prose, rewards, Command Bearing controls, Cohesion terminology, CSS classes, JavaScript identifiers, projection fields, task IDs, and persistence unchanged.
- Preserve desktop selection, mobile disclosures, callouts, accessibility relationships, history, backlog, and empty-state behavior.
- Do not stage or modify unrelated `debug.log` or `.codex-remote-attachments/` worktree changes.

---

### Task 1: Certify and implement the command-assignment vocabulary

**Files:**
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-cohesion-ship-visual.mjs`
- Modify: `src/ui/ship-journal.js`
- Modify: `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md`

**Interfaces:**
- Consumes: `createShipCohesionWorkspace(ship, activePackage, actions, commandBearing)` and existing `ship.cohesion.visibleTasks` projection records.
- Produces: unchanged DOM structure and behavior with the exact approved player-facing vocabulary.

- [ ] **Step 1: Write focused failing vocabulary assertions**

Replace the old positive copy assertions in `test-certified-ship-panel.mjs` with assertions for the entire approved hierarchy and supporting chrome:

```js
assert.match(text, /Level 1 Command Assignment/);
assert.match(text, /Situation/);
assert.match(text, /Objective/);
assert.match(text, /Command Impact/);
assert.match(text, /Course of Action/);
assert.match(text, /Operational Risk/);
assert.match(text, /Resolution Criteria/);
assert.match(text, /Progress · 0 of 1 objectives complete/);
assert.match(text, /4 additional assignments queued/i);
assert.match(text, /Resolved assignments \(1\)/);
assert.equal(byClass('ship-task-nav')[0].getAttribute('aria-label'), 'Available command assignments');
assert.equal(byClass('ship-task-mobile-callouts')[0].getAttribute('aria-label'), 'Command assignment locations');
assert.doesNotMatch(
  text,
  /command task|What needs your attention|Your objective|Why it matters to you|How to pursue it|While it remains unresolved|What completion looks like|steps complete|Completed work|more issues queued/i,
);
```

Change the existing active-detail browser assertion in `test-cohesion-ship-visual.mjs` to require the new headings and reject the retired ones:

```js
const activeDetailText = await activeDetail.textContent();
assert.match(activeDetailText, /Command Impact/);
assert.match(activeDetailText, /Course of Action/);
assert.doesNotMatch(activeDetailText, /Why it matters to you|How to pursue it/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
```

Expected: FAIL because the rendered panel still contains `Level 1 command task` and lacks `Level 1 Command Assignment`.

- [ ] **Step 3: Implement the minimal vocabulary change**

In `src/ui/ship-journal.js`, change only player-facing strings:

```js
eyebrow.textContent = `Level ${task.level} Command Assignment`;
appendCopy(content, 'ship-task-detail-section', 'Situation', task.playerText.situation);
appendCopy(content, 'ship-task-detail-section', 'Objective', task.playerText.objective);
appendCopy(content, 'ship-task-detail-section ship-task-why', 'Command Impact', task.playerText.whyItMatters);
pursueHeading.textContent = 'Course of Action';
appendCopy(content, 'ship-task-detail-section ship-task-impact', 'Operational Risk', task.playerText.operationalEffect);
if (task.completion?.guidance) appendCopy(content, 'ship-task-detail-section ship-task-completion', 'Resolution Criteria', task.completion.guidance);
progress.textContent = `Progress · ${completed} of ${(task.phases || []).length} objectives complete`;
```

Apply these supporting strings without renaming implementation identifiers or source data:

```js
summary.textContent = `Resolved assignments (${records.length})`;
empty.textContent = 'No command assignments require attention.';
taskNav.setAttribute('aria-label', 'Available command assignments');
mobileCallouts.setAttribute('aria-label', 'Command assignment locations');
next.textContent = task.currentPhase ? `Next: ${task.currentPhase.label}` : 'Ready for resolution';
backlog.textContent = `${cohesion.backlog.count} additional assignments queued · ${cohesion.backlog.cohesion} Cohesion to restore`;
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
node tools/scripts/test-certified-ship-panel.mjs
```

Expected: `PASS certified Cohesion Ship panel` with exit code 0.

- [ ] **Step 5: Align the durable Ship-route contract**

Replace the obsolete operational-board composition in the Ship Route section of `docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md` with this contract:

```markdown
Ship is the player's command-assignment workspace. It identifies the active ship, presents authoritative Cohesion, and turns visible ship or crew problems into playable command work.

Each assignment detail reads in this order: Command Assignment level and title, Cohesion reward, bound crew identity when present, Situation, Objective, Command Impact, Course of Action, Operational Risk, Resolution Criteria when present, and objective progress. Desktop uses the orbit selection and adjacent detail panel; phone uses the existing accessible callouts and inline disclosures.

All assignment prose remains package- or projection-owned. The route does not invent state, duplicate Mission objectives or People dossiers, rename persistence fields, or change Cohesion and Command Bearing mechanics.
```

Remove obsolete requirements for hero, Current Operation, sortable Operational Issues, and Operational Capabilities surfaces that the certified Cohesion workspace no longer renders. Retain applicable player-safe source and omission rules.

- [ ] **Step 6: Run focused visual and authority verification**

Run:

```powershell
node tools/scripts/test-cohesion-ship-visual.mjs
node tools/scripts/test-certified-ui-authority.mjs
```

Expected: both scripts exit 0 and report their PASS summaries.

- [ ] **Step 7: Run the full repository gate**

Run:

```powershell
npm.cmd test
```

Expected: the alpha gate exits 0 with no failed test scripts.

- [ ] **Step 8: Review, commit, and push only the scoped files**

Run:

```powershell
git diff --check
git status --short
git diff -- src/ui/ship-journal.js tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-cohesion-ship-visual.mjs docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md docs/superpowers/plans/2026-08-14-ship-command-assignment-copy.md
git add -- src/ui/ship-journal.js tools/scripts/test-certified-ship-panel.mjs tools/scripts/test-cohesion-ship-visual.mjs docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md docs/superpowers/plans/2026-08-14-ship-command-assignment-copy.md
git commit -m "refactor(ship): professionalize assignment copy"
git push origin main
```

Confirm `debug.log` and `.codex-remote-attachments/` remain uncommitted and the remote `main` SHA matches local `HEAD`.
