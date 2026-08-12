# Accepted-Pair Seconds Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track accepted fictional time at whole-second resolution and render `HH:MM:SS` without breaking existing minute-only V1 saves.

**Architecture:** The shared accepted-pair interpreter proposes elapsed seconds for both messages. Focused formatting and custody code validates, accumulates, persists, rebuilds, and projects seconds deterministically while retaining minute compatibility fields for existing saves and mission clocks.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, Directive V1 state custody, SillyTavern runtime prompts.

## Global Constraints

- Work directly on `main` and preserve the unrelated `debug.log` modification.
- Use one shared Utility model call; do not add a sidecar or provider role.
- Keep the preset free of time rules and time-specific regex.
- Accept legacy minute-only V1 saves without manual migration.
- Use `00:00:00` through `23:59:59`; never render `24:00:00`.

---

### Task 1: Seconds Footer Contract

**Files:**
- Modify: `tools/scripts/test-ship-time.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-source.mjs`
- Modify: `src/time/ship-time.mjs`

**Interfaces:**
- Produces: `formatShipTimeFooter({ stardate, secondOfDay })`.
- Produces: footer fields `secondOfDay` and compatibility `minuteOfDay`.

- [ ] Add an assertion for `*Stardate 53068.4 | 08:30:47 hours*` and run `node tools/scripts/test-ship-time.mjs` to observe the old-format failure.
- [ ] Implement exact `HH:MM:SS` formatting and final-line parsing; rerun the footer test.
- [ ] Change the accepted-source fixture by one second and prove source identity changes; run `node tools/scripts/test-v1-accepted-pair-source.mjs`.
- [ ] Commit the focused footer change.

### Task 2: Full-Pair Seconds Interpretation

**Files:**
- Modify: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`
- Modify: `src/mission/v1/accepted-pair-interpreter.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`

**Interfaces:**
- Produces: `interpretation.time = { decision, elapsedSeconds, reason, confidence }`.
- Consumes: `timeContext.current.secondOfDay` and `elapsedSeconds`.

- [ ] Change one valid-output test to `elapsedSeconds: 47` and run the interpreter test to observe closed-schema rejection.
- [ ] Add a corrected-assistant case whose valid time remains positive and a prompt assertion requiring the complete pair; rerun to confirm failure.
- [ ] Replace minute validation and schema text with bounded whole seconds, keep time independent from assistant claim acceptance, and strengthen full-pair duration guidance.
- [ ] Update mission runtime time context to expose seconds and rerun the interpreter test.
- [ ] Commit the focused interpreter change.

### Task 3: Seconds Custody and Compatibility

**Files:**
- Modify: `tools/scripts/test-v1-accepted-pair-time.mjs`
- Modify: `tools/scripts/test-v1-state-delta-gateway.mjs`
- Modify: `tools/scripts/test-campaign-start-service.mjs`
- Modify: `src/runtime/v1-accepted-pair-time.mjs`
- Modify: `src/runtime/v1-campaign-state.mjs`
- Modify: `src/campaign/campaign-start.mjs`

**Interfaces:**
- Produces: cumulative `elapsedSeconds`, `shipClock.secondOfDay`, exact seconds footers, and bounded `timeLedger.decisions`.
- Preserves: legacy minute-only state and boundary compatibility.

- [ ] Add a 47-second custody case and run `node tools/scripts/test-v1-accepted-pair-time.mjs` to observe failure.
- [ ] Implement deterministic seconds arithmetic with minute compatibility projections; rerun the custody test.
- [ ] Add a second sub-minute boundary proving cumulative rollover past one minute; rerun to observe and then satisfy the assertion.
- [ ] Add unchanged and indeterminate diagnostic persistence, duplicate decision idempotency, midnight rollover, long-cut, invalidation, and legacy-boundary rebuild cases one at a time through red-green cycles.
- [ ] Extend V1 state validation and campaign initialization for optional-compatible seconds fields; run state and campaign-start tests.
- [ ] Commit the focused custody change.

### Task 4: Runtime and Mission Integration

**Files:**
- Modify: `tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-v1-runtime-opening-prompt.mjs`
- Modify: affected accepted-pair interpreter fixtures under `tools/scripts/`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/runtime-app.mjs`

**Interfaces:**
- Consumes: exact boundary seconds and derives numeric minutes for mission clocks.
- Produces: runtime `currentTime` with seconds and the final `HH:MM:SS` footer contract.

- [ ] Add mission-clock coverage for a seconds boundary and run its focused test to observe failure.
- [ ] Convert boundary lookup, source identity, evidence text, and clock projection from exact seconds.
- [ ] Update runtime prompt/opening assertions to `08:30:00` and explicitly require elapsed time across both messages; implement and rerun.
- [ ] Update all strict interpreter fixtures from `elapsedMinutes` to `elapsedSeconds` and run the changed focused suite.
- [ ] Commit the runtime integration.

### Task 5: Documentation and Release Verification

**Files:**
- Modify: `docs/architecture/SEMANTIC_AUTHORITY.md`
- Modify: `docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md`
- Modify: `docs/user/SILLYTAVERN_PRESET.md`
- Modify: `docs/superpowers/specs/2026-08-12-hybrid-accepted-pair-ship-time-design.md`

**Interfaces:**
- Documents seconds-resolution authority, legacy compatibility, and the unchanged preset boundary.

- [ ] Update current documentation from minute-only footers and proposals to seconds while preserving the historical implementation plan.
- [ ] Search production, current docs, and active tests for obsolete `elapsedMinutes` model fields and `HHMM` footer requirements; retain only explicit compatibility and legacy coverage.
- [ ] Run all changed focused tests and `git diff --check`.
- [ ] Run `npm.cmd test` and inspect every failure.
- [ ] Review the complete diff, stage everything except `debug.log`, and commit with a concise conventional message.
- [ ] Run `npm.cmd test` against the exact committed tree, push `main`, and verify the GitHub SHA equals local.
