# Source and Time Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve elapsed time across bounded-ledger pruning and make persisted accepted-pair authority converge with the complete active SillyTavern chat source.

**Architecture:** The time ledger gains an explicit pruned-history anchor so the 128-entry reversible window is never mistaken for total history. Accepted-pair identity uses complete selected text before prompt bounding. Runtime reconciliation reads full raw chat custody, invalidates absent sources through atomic mission/story/time plans, and clears prompt state on every unbound interceptor path.

**Tech Stack:** Browser JavaScript modules, Directive V1 state gateway, SillyTavern chat/event/prompt adapters, Node assertion scripts.

## Global Constraints

- No additional model calls.
- No legacy migration layer; optional anchor fields normalize current V1 state in place on the next accepted-pair write.
- Source identity and footer parsing use complete text; only provider prompt text is bounded.
- The retained reversible window remains 128 entries.
- Main narration remains in SillyTavern's canonical pipeline.

---

### Task 1: Durable Time Anchor

**Files:**
- Modify: `src/runtime/v1-campaign-state.mjs`
- Modify: `src/runtime/v1-accepted-pair-time.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-time.mjs`

- [ ] Add failing probes for 200 sixty-second commits followed by latest-entry invalidation, and for a nonzero elapsed baseline plus a zero-time decision.
- [ ] Run `node tools/scripts/test-v1-accepted-pair-time.mjs` and verify the probes fail with lost historical seconds.
- [ ] Add optional nonnegative integer `prunedElapsedSeconds`. Derive a missing anchor as `elapsedSeconds - sum(retained entries)`, add dropped boundaries when pruning, and rebuild invalidation as anchor plus retained boundaries.
- [ ] Run the focused time and campaign-state tests.
- [ ] Commit with `fix(time): preserve pruned elapsed history`.

### Task 2: Complete Source Identity and Raw Custody

**Files:**
- Modify: `src/runtime/v1-accepted-pair-source.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `tools/scripts/test-v1-accepted-pair-source.mjs`
- Modify: `tools/scripts/test-v1-duty-report-runtime.mjs`

- [ ] Add failing tests proving changes after character 7000/2500 alter identity, a footer after character 7000 is parsed, and selected-swipe runtime metadata survives production history reads.
- [ ] Hash and parse complete selected text, then bound only `snapshot.source.*.text` for the Utility request.
- [ ] Read complete raw history for accepted-pair settlement and replay with `{ limit: Number.MAX_SAFE_INTEGER, playerSafeOnly: false }`.
- [ ] Run source, Duty Report, and runtime-app tests.
- [ ] Commit with `fix(source): bind complete accepted text`.

### Task 3: Host Visibility, Updates, and Prompt Clearing

**Files:**
- Modify: `src/runtime/v1-host-message-contracts.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/hosts/sillytavern/shell-events.js`
- Modify: `src/hosts/sillytavern/prompt-adapter.mjs`
- Modify: corresponding focused tests.

- [ ] Add failing assertions for `is_system`, `MESSAGE_UPDATED`, system-row lineage exclusion, and clearing an externally stale prompt while the adapter believes it is inactive.
- [ ] Normalize `is_system` as host-hidden/system, wire update events to edit invalidation, exclude system rows from active lineage, and always clear the host prompt on unbound sync.
- [ ] Run event, host-context, prompt-adapter, lineage, and runtime-app tests.
- [ ] Commit with `fix(host): reconcile source lifecycle`.

### Task 4: Complete-Chat Reconciliation

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/runtime/v1-mission-runtime.mjs`
- Modify: `src/runtime/v1-accepted-pair-time.mjs`
- Modify: focused runtime tests.

- [ ] Add a failing fixture with more than 500 messages plus a removed accepted source and prove persisted mission/story/time authority remains incorrectly active.
- [ ] Extract pure time invalidation planning and combine it with state-spine mission/story invalidation in one gateway commit.
- [ ] During rebuild, compare persisted reversible source message IDs with the complete active raw chat, atomically invalidate missing sources, then replay surviving pairs.
- [ ] Assert edit, hide, delete, selected-swipe change, reload, and replay converge without split authority or model calls.
- [ ] Commit with `fix(runtime): reconcile complete chat authority`.

### Task 5: Certification and Landing

- [ ] Run all focused commands above.
- [ ] Run `npm.cmd test` and `git diff --check`.
- [ ] Update player-turn and source-custody technical documentation.
- [ ] Merge to `main`, rerun the full gate, and push `main`.
