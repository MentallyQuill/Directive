# Directive Reading Indicator Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the Directive reading indicator visible while generation-boundary accepted-pair settlement is in flight.

**Architecture:** The SillyTavern generation interceptor acquires a reference-counted activity token at the common generation boundary. Successful narration handoff resolves all active tokens through the existing writing transition; every non-handoff exit clears only the boundary token.

**Tech Stack:** JavaScript ES modules, Node.js assertions, repository fake DOM, Playwright, SillyTavern extension bridge.

## Global Constraints

- Do not mutate campaign, chat, or save authority to provide presentation feedback.
- Preserve duplicate-safe token ownership across native event and generation-boundary paths.
- Preserve fail-open host generation behavior.

---

### Task 1: Protect slow boundary settlement with activity feedback

**Files:**
- Modify: `tools/scripts/test-sillytavern-event-wiring.mjs`
- Modify: `src/hosts/sillytavern/runtime-bridge.mjs`

**Interfaces:**
- Consumes: `markDirectiveTurnActivity()`, `finishDirectiveTurnActivity()`, and `resolveDirectiveHostGenerationHandoff()` from `turn-activity-indicator.js`.
- Produces: `directiveGenerationInterceptor()` behavior that owns and releases a boundary activity token.

- [ ] **Step 1: Write the failing test**

Add an orchestrator whose `interceptGeneration()` returns a controlled pending promise. Invoke `directiveGenerationInterceptor()`, wait beyond 350 ms, and assert `#directive-turn-activity-indicator` is visible with `Directive is reading your post...`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/scripts/test-sillytavern-event-wiring.mjs`

Expected: FAIL because the generation interceptor currently creates no activity token.

- [ ] **Step 3: Write minimal implementation**

Import `markDirectiveTurnActivity` and `finishDirectiveTurnActivity`. Create one token after the enabled/orchestrator guard. Clear that token for every result except successful `injectAndContinue`, where `resolveDirectiveHostGenerationHandoff()` owns the transition and delayed cleanup. Clear the token in `catch` before returning the fail-open result.

- [ ] **Step 4: Run focused tests**

Run: `node tools/scripts/test-sillytavern-event-wiring.mjs`

Expected: PASS with the slow boundary visibly entering reading state and then writing handoff.

- [ ] **Step 5: Run Playwright and full verification**

Run the repository Playwright reproduction for the indicator, then `npm.cmd test`.

Expected: Playwright observes the visible status geometry and the full alpha gate exits 0.

- [ ] **Step 6: Commit and publish**

Stage only the spec, plan, regression test, and runtime bridge change. Commit with `fix(host): show boundary settlement activity`, then push the verified commit directly to `origin/main`.
