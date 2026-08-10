# Character Creator JSON Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover malformed or structurally invalid Character Creator provider output with strict section contracts, one bounded Utility repair, and diagnostic-guided regeneration.

**Architecture:** A focused Character Creator contract module builds and validates section schemas. The provider transport forwards strict schemas where supported, while the assist orchestrator classifies failures and chooses repair, targeted regeneration, or the existing local fallback without exceeding three provider calls.

**Tech Stack:** Browser-native JavaScript modules, SillyTavern generation APIs, OpenAI-compatible chat completions, Node.js assertion scripts.

## Global Constraints

- At most three provider calls and at most one repair call per user action.
- Repair only malformed JSON, non-object JSON, or locally schema-invalid JSON.
- Never send player input, campaign/package context, original prompts, unsafe output, or hidden terms to the repair provider.
- Cap repair input at 12,000 characters and sanitized diagnostics at 12 entries.
- Preserve cancellation across every provider call and ignore late output.
- Retain the package-safe local fallback after provider recovery is exhausted.
- Do not add runtime dependencies or dynamic evaluation.

---

### Task 1: Section Contract And Strict Transport

**Files:**
- Create: `src/creators/character-creator-section-contract.mjs`
- Modify: `src/creators/character-creator-assist.mjs`
- Modify: `src/hosts/sillytavern/provider-client.mjs`
- Modify: `tools/scripts/test-character-creator-assist.mjs`
- Modify: `tools/scripts/test-directive-provider-routing.mjs`

**Interfaces:**
- Produces: `buildCharacterCreatorSectionDraftSchema({ sectionId, mode, fieldRules })`.
- Produces: `validateCharacterCreatorSectionDraftPayload(payload, { sectionId, mode, fieldRules })`, returning `{ ok, diagnostics }`.
- Consumes: `fieldRules` entries shaped as `{ path, allowedValues?: string[] }`.

- [ ] **Step 1: Write failing contract and transport tests**

Add assertions that the identity schema permits only identity field paths, constrains select IDs, rejects nested/wrong-section fields locally, and that direct OpenAI-compatible requests include:

```js
response_format: {
  type: 'json_schema',
  json_schema: {
    name: 'directive_character_creator_section_draft_request',
    strict: true,
    schema: request.jsonSchema
  }
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node tools/scripts/test-character-creator-assist.mjs; node tools/scripts/test-directive-provider-routing.mjs`

Expected: imports/strict-schema assertions fail because the contract module and transport forwarding do not exist.

- [ ] **Step 3: Implement the section contract**

Build a strict-provider schema with all top-level and section properties required, exact top-level keys, exact section field properties, string text values, and enums for option fields. Keep local validation tolerant of omitted optional section fields for prompt-only transports and return diagnostics shaped as:

```js
{ path: '/fields/identity.speciesId', keyword: 'enum', detail: 'identity.speciesId' }
```

- [ ] **Step 4: Forward strict schemas on direct OpenAI-compatible calls**

Add a safe schema name derived from `request.kind`, include strict `json_schema` only when a schema object exists, and leave prose calls unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node tools/scripts/test-character-creator-assist.mjs; node tools/scripts/test-directive-provider-routing.mjs`

Expected: both scripts pass.

- [ ] **Step 6: Commit**

```text
feat(providers): enforce creator draft schema
```

### Task 2: One-Shot Repair And Targeted Regeneration

**Files:**
- Modify: `src/creators/character-creator-assist.mjs`
- Modify: `tools/scripts/test-character-creator-assist.mjs`

**Interfaces:**
- Produces: repair request kind `directive.characterCreatorSectionDraftRepairRequest`.
- Produces: diagnostics `repairAttempted`, `repairSucceeded`, `targetedRegenerationAttempted`, and bounded `providerAttempts`.
- Consumes: the section schema and local validation diagnostics from Task 1.

- [ ] **Step 1: Write failing malformed-output repair test**

Return single-quoted JSON from the Reasoning call and valid repaired JSON from Utility. Assert two calls, Utility owns the second call, the repair body includes only `damagedOutput`, `targetSchema`, and `schemaDiagnostics`, and the result source remains provider-backed.

- [ ] **Step 2: Run the test and verify RED**

Run: `node tools/scripts/test-character-creator-assist.mjs`

Expected: the second call is the current identical Reasoning retry, not Utility repair.

- [ ] **Step 3: Implement eligible one-shot repair**

Preserve damaged text only in the active stack, truncate it to 12,000 characters, scan it for unsafe terms, build a compact repair request, and parse plus validate the repair response once. Do not recursively repair it.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node tools/scripts/test-character-creator-assist.mjs`

Expected: repair assertions pass.

- [ ] **Step 5: Write failing repair-failure regeneration test**

Return malformed primary and repair outputs, then a valid third Reasoning response. Assert the third prompt includes only sanitized failure categories and does not include damaged output.

- [ ] **Step 6: Run the test and verify RED**

Run: `node tools/scripts/test-character-creator-assist.mjs`

Expected: no targeted regeneration request exists.

- [ ] **Step 7: Implement targeted regeneration**

Append a JSON-only correction instruction based on `json_invalid`, `json_not_object`, or `json_schema_invalid`. Reuse the original player-safe request and strict section schema, keep the third call on Reasoning, and retain the original failure category if the third call fails.

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `node tools/scripts/test-character-creator-assist.mjs`

Expected: the repair and targeted regeneration cases pass.

- [ ] **Step 9: Commit**

```text
feat(creators): repair malformed draft JSON
```

### Task 3: Safety, Cancellation, Progress, And Fallback

**Files:**
- Modify: `src/creators/character-creator-assist.mjs`
- Modify: `tools/scripts/test-character-creator-assist.mjs`
- Modify: `tools/scripts/test-character-creator-assist-panel.mjs`

**Interfaces:**
- Consumes: the existing `signal` and `onProgress` arguments.
- Produces: progress statuses `utility-repair` and `reasoning-regeneration`.

- [ ] **Step 1: Write failing edge-case tests**

Cover unsafe malformed text skipping Utility repair, abort during Utility repair preventing a third call, repair input truncation, diagnostics capped at 12 entries, non-repairable timeout behavior, and exact progress messages.

- [ ] **Step 2: Run tests and verify RED**

Run: `node tools/scripts/test-character-creator-assist.mjs; node tools/scripts/test-character-creator-assist-panel.mjs`

Expected: one or more new safety/progress assertions fail.

- [ ] **Step 3: Implement minimal edge-case handling**

Pass the active signal to every call, test `signal.aborted` before scheduling follow-up work, emit exact phase events, discard unsafe damaged output, and retain the current local fallback for exhausted/non-repairable failures.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node tools/scripts/test-character-creator-assist.mjs; node tools/scripts/test-character-creator-assist-panel.mjs`

Expected: both scripts pass.

- [ ] **Step 5: Commit**

```text
fix(creators): bound draft repair recovery
```

### Task 4: Integrated Verification

**Files:**
- Modify only if verification exposes a defect covered by a new failing test.

**Interfaces:**
- Consumes: all prior task behavior.
- Produces: a clean, reviewed feature branch ready for fast-forward integration.

- [ ] **Step 1: Run focused verification**

Run: `node tools/scripts/test-provider-response-parser.mjs; node tools/scripts/test-directive-provider-routing.mjs; node tools/scripts/test-character-creator-assist.mjs; node tools/scripts/test-character-creator-assist-panel.mjs`

Expected: all scripts pass.

- [ ] **Step 2: Run full verification**

Run: `npm.cmd test`

Expected: all focused alpha-gate checks pass.

- [ ] **Step 3: Check the diff**

Run: `git diff --check; git status -sb; git log --oneline main..HEAD`

Expected: no whitespace errors, no uncommitted files, and only scoped feature commits.

- [ ] **Step 4: Request independent code review**

Review requirements, transport compatibility, repair eligibility, hidden-data isolation, cancellation, bounded calls, and regression coverage. Resolve every important finding with a failing test before changing production code.

- [ ] **Step 5: Merge, retest, and push**

Fast-forward `main`, run `npm.cmd test` on merged `main`, push `origin main`, and verify GitHub's remote SHA equals local `HEAD`.
