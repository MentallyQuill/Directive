# Cohesion Ship Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Ship dashboard with a commander-facing Cohesion ring and actionable mini-quest system backed by replayable Story Settlement authority, forty package-authored templates, existing Ship milestones, and a separate single-task Command Bearing relief spend.

**Architecture:** Package data defines templates, binding vocabulary, scheduling policy, and authored migration issues. Pure Ship modules validate that data, derive issue state from Story Settlement effects, schedule deterministic opportunities, create closed accepted-pair candidates, and project only player-safe visible work. The runtime app continues to own provider and prompt custody; the UI consumes the projection and renders an interactive ship/ring/task composition without creating state.

**Tech Stack:** Native JavaScript ES modules, JSON package data and schemas, Directive V1 Story Settlement and accepted-pair runtime, DOM UI modules, CSS, Node assertion scripts, Playwright Chromium.

## Global Constraints

- Cohesion is 0-100 in twenty five-point segments and is entirely issue-derived.
- Level N owns N segments and restores 5N Cohesion.
- The template roster remains 20/12/6/2 across Levels 1/2/3/4 with 50/30/15/5 level selection.
- At most five tasks are visible; additional issues remain in a hidden-detail backlog with aggregate count and debt.
- Existing Ship milestones, capability evidence, constraints, mission interactions, and receipts remain authoritative.
- Accepted Story Settlement and source lineage own durable progress; no mutable parallel quest tracker is introduced.
- Normal SillyTavern narration remains canonical; no new model call, provider route, preset dependency, or narration sidecar is added.
- Established crew use only package-authorized public facts; sensitive premises use bounded background crew.
- The Ship page shows actionable work and blockers, not undiscovered work.
- The supplied transparent Breckenridge image replaces the Ship banner and occupies roughly 90% of usable composition width.
- Desktop uses leader-line buttons; narrow screens use a linked task list without squeezed crossing lines.
- All interactions are keyboard operable, color-independent, reduced-motion safe, and Playwright tested.

---

### Task 1: Package Cohesion Contract and Forty Templates

**Files:**
- Create: `packages/bundled/breckenridge/breckenridge.cohesion-catalog.json`
- Create: `schemas/packages/cohesion-catalog.schema.json`
- Create: `src/ship/v1/cohesion-contracts.mjs`
- Modify: `src/packages/bundled-package-registry.mjs`
- Modify: `src/runtime/package-library.mjs`
- Modify: `tools/scripts/v1-test-fixtures.mjs`
- Create: `tools/scripts/test-v1-cohesion-contracts.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces `validateCohesionCatalog(catalog): {ok:boolean, errors:string[]}`.
- Produces `indexCohesionCatalog(catalog): {templates:Map, policy, authoredIssues, backgroundCrew}`.
- Adds `cohesionCatalog` to bundled runtime assets without changing other package consumers.

- [ ] Write a failing test that loads the real Breckenridge catalog and asserts forty unique versioned templates, exact level/family counts, required player/help/evidence fields, policy constants, migration targets, and bounded crew vocabulary.
- [ ] Run `node tools/scripts/test-v1-cohesion-contracts.mjs` and verify failure because the catalog API and data do not exist.
- [ ] Implement validation, schema, registry loading, and all forty compact runtime contracts derived from the approved contract documents.
- [ ] Run the focused test and package-library tests; verify green.
- [ ] Commit `feat(ship): add cohesion quest catalog`.

### Task 2: Pure Cohesion Derivation and Deterministic Scheduling

**Files:**
- Create: `src/ship/v1/cohesion-state.mjs`
- Create: `src/ship/v1/cohesion-scheduler.mjs`
- Create: `tools/scripts/test-v1-cohesion-state.mjs`
- Create: `tools/scripts/test-v1-cohesion-scheduler.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces `deriveCohesionState({catalog, shipDataset, storySettlement, branchId}): CohesionState`.
- Produces `planCohesionOpportunity({catalog, cohesionState, authoritativeTime, boundary, campaignIdentity}): CohesionOpportunityPlan`.
- Produces immutable effect builders for opportunity, creation, phase, resolution, retirement, and generation guard effects.

- [ ] Write failing state tests for authored migration, exact segment ownership, 100-minus-debt Cohesion, visible five/backlog aggregate, phase progress, resolution, retirement, invalidation-derived rebuild, and completed history.
- [ ] Verify the state test fails for the missing module.
- [ ] Implement the minimal pure reducer and effect validation; run the state test green.
- [ ] Write failing scheduler tests for four-hour warmup, twelve-hour windows, four-hour boundary guard, 100/35/15% queue rolls, Critical pause, level weights, high-level safeguards, cooldown, family diversity, deterministic binding and IDs, and retry/replay identity.
- [ ] Verify expected scheduler failures, implement stable-hash scheduling and bounded crew binding, then run both focused suites green.
- [ ] Commit `feat(ship): derive and schedule cohesion work`.

### Task 3: Accepted-Pair Quest Evidence and Story Settlement Integration

**Files:**
- Create: `src/ship/v1/cohesion-evidence.mjs`
- Modify: `src/mission/v1/accepted-pair-interpreter.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/runtime/v1-branch-reconstruction.mjs`
- Create: `tools/scripts/test-v1-cohesion-evidence.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`
- Modify: `tools/scripts/test-v1-branch-reconstruction.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces `createCohesionInterpretationCandidates(...)` using only current visible phases.
- Produces `validateCohesionEvidenceProposal(...)` and idempotent source-bound phase/resolution effects.
- Extends the existing accepted-pair candidate packet without changing its JSON output shape or adding a model call.

- [ ] Write failing tests proving one current-phase candidate per visible issue, exact exclusions, no queued premise leakage, idempotent phase completion, final resolution, and rejection of skipped/unsupported phases.
- [ ] Verify red, implement candidate and evidence custody, and verify green.
- [ ] Write failing state-spine/runtime tests proving opportunity effects and phase effects settle atomically with mission/time/people work, source invalidation rebuilds them, retries reuse interpretation, and no new generation role is invoked.
- [ ] Verify red, integrate the pure modules at the accepted-pair boundary, and run all affected authority suites green.
- [ ] Commit `feat(ship): settle cohesion progress`.

### Task 4: Cohesion Projection, Operational Packet, and Band Consequences

**Files:**
- Modify: `src/projection/v1/ship-projection.mjs`
- Modify: `src/ship/v1/ship-operational-packet.mjs`
- Modify: `src/ui/view-models/certified-ship-view.mjs`
- Modify: `tools/scripts/test-v1-ship-projection.mjs`
- Modify: `tools/scripts/test-v1-ship-operational-packet.mjs`
- Modify: `tools/scripts/test-certified-ship-view.mjs`

**Interfaces:**
- Adds `ship.cohesion` with total, band, segments, visible tasks, queued aggregate, and completed history.
- Operational packet includes aggregate band, visible conditions, active task help, and exact causal band instructions; it excludes queued bindings and premises.

- [ ] Write failing projection tests for Ready/Strained/Critical, five visible tasks, queued count/debt, selected-phase copy, rewards, anchors, source refs, and migration issues.
- [ ] Verify red, implement player-safe projection, and verify green.
- [ ] Write failing packet tests for causal Strained/Critical instructions, visible computer help, absence of queued secrets, unchanged capabilities/interactions, and preset-independent payload shape.
- [ ] Verify red, implement packet changes, and run the focused suites green.
- [ ] Commit `feat(ship): project cohesion consequences`.

### Task 5: Single-Issue Command Bearing Relief

**Files:**
- Modify: `src/command/v1-command-bearing.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/v1-state-spine.mjs`
- Modify: `src/projection/v1/player-projection.mjs`
- Modify: `tools/scripts/test-v1-command-bearing.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-state-spine-runtime.mjs`

**Interfaces:**
- Adds Command Bearing effect `cohesionRelief` with exact visible `targetIssueId` and maximum 20 Cohesion.
- Adds runtime actions `reserveCohesionRelief({issueId})` and `cancelCohesionRelief()`.
- Keeps `narrativeEdge` behavior and existing API stable.

- [ ] Write failing unit tests for reserve, arm, commit, refund, projection, target validation, 20-point ceiling, and mutual exclusion with `narrativeEdge`.
- [ ] Verify red, generalize Command Bearing custody minimally, and verify green.
- [ ] Write failing runtime tests for Ship action reservation, targeted prompt instruction, accepted causal resolution, non-resolution refund, swipe/delete invalidation refund, save/load, and branch reconstruction.
- [ ] Verify red, wire the action through the existing accepted-pair boundary, and run affected suites green.
- [ ] Commit `feat(ship): add command bearing relief`.

### Task 6: Ship Artwork and Interactive Cohesion UI

**Files:**
- Add: `assets/packages/breckenridge/images/ship/uss-breckenridge.cohesion.png`
- Modify: `packages/bundled/breckenridge/ashes-of-peace.campaign-package.json`
- Rewrite: `src/ui/ship-journal.js`
- Modify: `src/ui/ship-panel.js`
- Modify: `styles/directive.css`
- Modify: `tools/fixtures/expanded-interface-runtime-fixture.mjs`
- Modify: `tools/scripts/test-certified-ship-panel.mjs`
- Modify: `tools/scripts/test-ship-panel-state-records.mjs`
- Create: `tools/scripts/test-cohesion-ship-interaction.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- `renderShipPanel(body, view, actions)` renders one `.ship-cohesion-workspace`, twenty accessible segments, up to five task buttons, one shared details panel, backlog summary, and collapsed completion history.
- Task selection is local UI state; `actions.reserveCohesionRelief({issueId})` is the only new mutation control.

- [ ] Write failing DOM tests that require no banner/status/system-card/constraint wall, a 20-segment ring, explicit Cohesion and reward labels, selected task detail, help copy, leader-line metadata, backlog aggregate, completed history, keyboard selection, and Command Bearing action state.
- [ ] Verify red, copy and register the supplied transparent ship asset, rewrite the renderer, and implement desktop/mobile/reduced-motion CSS.
- [ ] Run DOM tests green; update the production fixture with realistic visible and queued task data.
- [ ] Commit `feat(ship): build cohesion command workspace`.

### Task 7: Playwright Interaction and Visual Certification

**Files:**
- Modify: `tools/scripts/test-expanded-interface-visual-conformance.mjs`
- Create: `tools/scripts/test-cohesion-ship-visual.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`
- Create/update screenshots under: `docs/design/visual-targets/cohesion-ship-work/iteration-01/`

**Interfaces:**
- Playwright certifies desktop 1440x900, tablet 1024x768, mobile 390x844, compact mobile 360x500, keyboard operation, task selection, ring preview, detail updates, backlog disclosure, overflow, and reduced motion.

- [ ] Write the Playwright assertions against the production fixture and run them red against any missing interaction or geometry.
- [ ] Fix renderer/CSS behavior through test-first regression cycles until all interactions and viewport geometry pass.
- [ ] Capture desktop and mobile screenshots from the production fixture and visually inspect the ship scale, ring clarity, leader lines, task hierarchy, details density, and narrow layout.
- [ ] Run the existing expanded-interface visual conformance and the new focused visual suite green.
- [ ] Commit `test(ship): certify cohesion workspace`.

### Task 8: Full Verification, Main Integration, and Push

**Files:**
- Modify only defects found by verification, each preceded by a failing regression test.

- [ ] Run focused Cohesion, Ship, Command Bearing, replay, projection, prompt, DOM, and Playwright suites.
- [ ] Run `npm.cmd test` and require all alpha-gate checks to pass.
- [ ] Inspect `git diff --check`, committed file scope, generated artifacts, and worktree status.
- [ ] Review the complete branch diff for authority leakage, mutable duplicate state, queue secrecy, inaccessible controls, or unrelated edits.
- [ ] Merge `codex/cohesion-ship-work` into `main` without touching the user's unrelated dirty files.
- [ ] Re-run `npm.cmd test` and the focused Playwright visual suite on `main`.
- [ ] Push `main` to `origin` with GitHub CLI authentication/network verified as required by repository instructions.
