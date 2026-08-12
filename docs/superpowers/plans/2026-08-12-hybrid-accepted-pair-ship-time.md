# Hybrid Accepted-Pair Ship Time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Directive's separate time-adjudication call and preset-assisted leading header with one preset-agnostic runtime footer contract whose proposed elapsed time is interpreted in the existing accepted-pair mission call and committed deterministically.

**Architecture:** A focused ship-time module parses and formats visible timestamps. Accepted-pair snapshots keep footer identity while exposing footer-free prose to semantic evidence. `acceptedPairMissionEvidence` returns both closed mission selections and a validated time decision; V1 mission settlement invokes injected time custody after that one call and before time-driven mission evidence is materialized.

**Tech Stack:** JavaScript ES modules, Node.js assertion scripts, SillyTavern runtime prompt blocks, JSON preset assets.

## Global Constraints

- Canonical time remains in V1 `campaign`, `worldState`, and bounded `timeLedger`; add no sidecar.
- The only structured time interpretation uses `acceptedPairMissionEvidence`; remove `timeAdvanceAdjudicator` as a generation role.
- Runtime injection is the complete time contract; the bundled preset contains no clock, cadence, timestamp position, or timestamp format.
- The canonical plain-text footer is not compressed into a preset-regex machine tag; time-specific preset regex is forbidden.
- Visible time uses a final nonblank line shaped `*Stardate 53068.4 | 1045 hours*`, with `0000` through `2359` and no exposed seconds.
- Model output proposes elapsed minutes only. Deterministic code computes the authoritative Stardate and ship clock and fails closed to zero elapsed minutes.
- Swipes, duplicate settlement, invalidation, and branch reconstruction retain accepted-pair custody semantics.
- Preserve unrelated user changes, including `debug.log`.

---

### Task 1: Ship-Time Display Boundary

**Files:**
- Create: `src/time/ship-time.mjs`
- Modify: `src/runtime/v1-accepted-pair-source.mjs`
- Test: `tools/scripts/test-ship-time.mjs`
- Test: `tools/scripts/test-v1-accepted-pair-source.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- Produces: `formatShipTimeFooter({ stardate, minuteOfDay })` and `extractShipTimeFooter(text)`.
- Produces: accepted assistant source fields `timeFooter` and a source-range identity that changes when only the footer changes.

- [ ] Write one failing footer-format test for `0000` and run `node tools/scripts/test-ship-time.mjs` to verify the missing module/API fails.
- [ ] Implement the formatter and rerun the test to green.
- [ ] Add one failing extraction test proving only an exact final nonblank footer is separated from prose; implement extraction and rerun to green.
- [ ] Add one failing accepted-pair source test proving narrative text excludes the footer while `timeFooter` is preserved and footer-only edits change `sourceRangeHash`; update snapshot construction and rerun both focused tests.
- [ ] Add the ship-time test to the alpha gate and commit the green task.

### Task 2: Shared Mission and Time Interpretation

**Files:**
- Modify: `src/mission/v1/accepted-pair-interpreter.mjs`
- Test: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`

**Interfaces:**
- Consumes: `timeContext.current`, `timeContext.footer`, and footer-free `sourcePair` text.
- Produces: `interpretation.time = { decision, elapsedMinutes, reason, confidence }`, where decision is `advance`, `unchanged`, or `indeterminate`.

- [ ] Add one failing parser test for a valid positive time decision; run the interpreter test and confirm rejection under the old closed schema.
- [ ] Extend strict output validation and normalization, including nonnegative integer minutes, zero-only unchanged/indeterminate decisions, bounded confidence, and fail-closed rejection of unknown fields; rerun to green.
- [ ] Add one failing prompt test proving current authoritative time, the parsed footer proposal, anti-acceleration rules, and time JSON schema are present; update the request builder and rerun to green.
- [ ] Add one failing no-mission-candidates test proving the shared provider call still runs and can return time while claims abstain; remove the no-candidates provider bypass and rerun to green.
- [ ] Add rejection and malformed-time cases proving invalid structured output cannot yield a time decision; rerun to green and commit.

### Task 3: Deterministic Time Custody in Mission Settlement

**Files:**
- Modify: `src/runtime/v1-accepted-pair-time.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Delete: `src/time/time-advance-adjudicator.mjs`
- Test: `tools/scripts/test-v1-accepted-pair-time.mjs`
- Test: `tools/scripts/test-v1-mission-runtime.mjs`
- Test: `tools/scripts/test-v1-mission-authoritative-time-runtime.mjs`
- Test: `tools/scripts/test-v1-runtime-app.mjs`
- Delete: `tools/scripts/test-time-advance-adjudicator.mjs`
- Modify: `tools/scripts/run-alpha-gate.mjs`

**Interfaces:**
- `commitV1AcceptedPairTimeAdvance({ campaignState, snapshot, packageData, timeDecision, stateDeltaGateway, ingressId, now })` commits no model work.
- `createV1MissionRuntime({ commitAcceptedPairTime })` invokes custody once after successful shared interpretation and returns the time result with mission settlement.

- [ ] Rewrite one accepted-pair custody test to pass a shared `timeDecision` and fail because custody still calls the retired adjudicator; refactor custody to accept only the decision and rerun to green.
- [ ] Add fail-closed tests for unchanged, indeterminate, malformed, excessive, and duplicate decisions; implement bounded normalization and rerun after each case.
- [ ] Add one failing mission-runtime integration case proving a single interpretation produces time custody before time-driven mission claims; inject the custody callback, refresh state and gateway revision after its commit, and rerun to green.
- [ ] Add one failing runtime-app case proving settlement makes no `timeAdvanceAdjudicator` request and returns the shared time result; wire the callback and remove the separate pre-mission call.
- [ ] Move accepted-boundary lookup helpers into accepted-pair custody, update mission imports, delete the retired adjudicator and test, remove it from the alpha gate, and rerun all affected time/mission/runtime tests.
- [ ] Commit the green custody and integration task.

### Task 4: Preset-Agnostic Footer Prompt and Opening

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `presets/sillytavern/directive.json`
- Modify: `src/hosts/sillytavern/preset-manager.mjs`
- Test: `tools/scripts/test-v1-runtime-opening-prompt.mjs`
- Test: `tools/scripts/test-v1-runtime-app.mjs`
- Test: `tools/scripts/test-sillytavern-preset-manager.mjs`

**Interfaces:**
- Runtime packet exposes accepted current time and the complete final-footer narration contract.
- Runtime-authored opening text ends with `formatShipTimeFooter(...)`.

- [ ] Add one failing runtime-prompt assertion for a final-line footer instruction, current accepted clock, continuous-action same-minute guidance, and deadline/reference exclusions; replace the leading-header instruction and rerun to green.
- [ ] Add one failing opening assertion that the runtime-authored timestamp is the final line; update opening construction and rerun to green.
- [ ] Add one failing preset test rejecting independent time/header/footer instructions and time-specific rendering regex; remove the two time-specific preset clauses, revise notes, bump bundled preset to `Directive-0.1.0-pre-alpha.12`, and rerun to green.
- [ ] Add or extend the unrelated-preset runtime case to show prompt time content is runtime-owned and unchanged; rerun focused tests and commit.

### Task 5: Provider Surface, Documentation, and Full Verification

**Files:**
- Modify: `src/generation/generation-roles.mjs`
- Modify: `docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md`
- Modify: `docs/user/SILLYTAVERN_PRESET.md`
- Modify: `tools/scripts/test-directive-provider-routing.mjs`
- Modify: `tools/scripts/test-certified-settings-panel.mjs`
- Modify: `tools/scripts/test-v1-runtime-app.mjs`
- Modify: `tools/scripts/test-sillytavern-generation-client.mjs`

**Interfaces:**
- Public provider role registry lists one shared `acceptedPairMissionEvidence` Utility role for mission evidence and elapsed story time.

- [ ] Update one provider-role expectation first and run its focused test to verify the retired role is still exposed.
- [ ] Remove `timeAdvanceAdjudicator` from role definitions and all settings/runtime fixtures, update the role label and documentation to describe the shared responsibility, and rerun the provider/settings tests to green.
- [ ] Run `rg -n "timeAdvanceAdjudicator|exact first-line time header|Honor any exact first line" src presets docs tools/scripts` and remove all obsolete production, preset, documentation, and gate references.
- [ ] Run every changed focused test, then `npm.cmd test`; resolve failures with a new failing regression case before production fixes.
- [ ] Run `git diff --check`, inspect the complete diff and status, commit any final documentation/test updates, then push `main` to `origin` and verify the remote main SHA equals local HEAD.
