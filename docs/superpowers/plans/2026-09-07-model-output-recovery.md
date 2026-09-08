# Shared Model Output Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Execute inline unless delegation is separately authorized.

**Goal:** Recover common malformed structured responses across Directive's model consumers without changing valid values, weakening semantic validation, or increasing model-call budgets.

**Architecture:** Extend the existing pure structured-output parser and reuse it at the remaining model-output JSON boundaries. Keep provider normalization, task validators, generation prompts, retry ownership, and state commitment in their existing modules. Recovery is deterministic and bounded; it never generates missing meaning.

**Tech Stack:** Browser-compatible JavaScript ES modules; Node assertion scripts; existing alpha gate. No new runtime dependency in the initial implementation.

**Spec:** The agreed bounded design is recorded in the next section of this plan, derived from the planning conversation. This document is the execution specification as well as the task plan.

## Design and global constraints

- Valid unambiguous JSON is parsed before stripping reasoning tags, fences, or applying repairs; its values remain unchanged.
- Conflicting duplicate object keys are ambiguous input, even though JSON.parse accepts them. Reject them as an intentional safety tightening; never silently choose the last value. Repeated identical values may retain normal JSON.parse semantics.
- Recovery can change syntax, not content, evidence, IDs, booleans, units, missing fields, or abstention meaning.
- Each consumer's existing semantic validator runs after recovery, with the original request context.
- Add zero model requests. Preserve existing timeout, retry, cancellation, fallback, replay, and custody behavior.
- Do not partially commit sidecar results or introduce partial coverage semantics.
- Preserve successful prose output; do not route narrative text through a JSON parser.
- No provider profiling, routing, new settings, schema registry, dependency graph, or generic format framework.
- No global field aliases, enum coercion, metadata synthesis, or unknown-field deletion in this release. Add an operation-specific adapter only in a later change backed by a concrete rejected fixture and preserved semantic checks.
- Preserve unrelated dirty files. Current checkout has unrelated documentation, logs, attachments, and probes. Do not stage them or change the running SillyTavern installation or user data.
- Use an isolated worktree for implementation if the checkout remains dirty. This planning change itself stays in the current workspace.
- When GitHub operations are needed, use GitHub CLI with network permission enabled; an expired token requires user reauthentication.

## Current integration map

| Consumer | Entry point | Plan |
|---|---|---|
| Character creator | `src/creators/character-creator-assist.mjs`, `parseProviderResponse` | Already uses shared parser; preserve Utility repair/regeneration and validator behavior |
| Accepted-pair gameplay | `src/mission/v1/accepted-pair-interpreter.mjs`, `parseMissionAcceptedPairInterpretationOutput` | Already uses shared parser; regression coverage for evidence and abstention |
| People dossiers | `src/people/people-dossier-author.mjs`, `parsePeopleDossierBatchOutput` | Already uses shared parser; preserve batch and identity checks and no new retries |
| Episode evaluation | `src/story/episode-evaluator.mjs`, `parseStrictJsonObject` | Replace strict text parsing with shared parsing; retain domain validation |
| Transition narration candidate | `src/mission/v1/mission-transition-narration.mjs`, `parseJsonObject` | Reuse shared parser for structured candidate envelope; preserve text and transition checks |
| Provider/host text transport | `src/providers/provider-response-normalizer.mjs`, `src/hosts/sillytavern/generation-client.mjs`, `src/hosts/sillytavern/provider-client.mjs` | Audit and regression only; no new repair or requests at transport layer |
| Other narration/duty-report/conclusion paths | Existing generation/host flow | Verify coverage during inventory; keep prose, application JSON cloning, storage JSON, and capability probes outside this parser migration |

The role registry currently names four roles: acceptedPairMissionEvidence, episodeEvaluator, peopleDossierAuthor, and characterCreatorSectionDraft. Transition candidate parsing is an additional structured boundary, not an invented registry role.

## Public interface

Keep `parseStructuredJsonText(text, options)` and all existing exports compatible. Keep `ok`, `value`, `candidate`, `repaired`, `error`, and `diagnostic` behavior available to callers. Add optional recovery metadata only:

```js
// Success metadata; no raw response copied into extra diagnostics.
recovery: {
  stage: 'direct', // or 'extracted', 'syntax-repaired'
  repairs: [],    // stable codes such as 'trailing-comma'
}
```

Add diagnostic codes `json_ambiguous` and `json_recovery_limit` to the existing error-code export. Existing failures keep their established code where the category has not changed. New codes remain ordinary rejected output in callers; explicitly do not make them eligible for automatic model repair in the creator's current allowlist.

Keep `requireObject: false` behavior working for direct arrays/scalars. Do not return a nested object from a top-level array simply to satisfy an object requirement.

## Task 1: Lock down the successful path and inventory consumers

**Files:**
- Modify/test: `tools/scripts/test-provider-response-parser.mjs`
- Modify: `src/providers/structured-output-parser.mjs`
- Create: `tools/fixtures/model-output-recovery.json`

**Interfaces:** Existing parser exports; fixture records use `{ id, input, expectedOk, expectedValue?, expectedCode? }`.

- [ ] Inventory model-output reads using `rg -n 'JSON.parse|parseStructuredJsonText|assertProviderResponseText' src`; classify every hit as model output, storage, cloning, or probe. Record additional real model boundaries in this plan before migration; do not globally replace JSON.parse.
- [ ] Add the following regression to the parser script, alongside direct fixtures containing URLs, smart punctuation, backslashes, literal reasoning tags, empty strings, false, zero, arrays, and nested objects:

```js
const intact = { text: '<think>literal</think> Keep /* this */ and https://example.test/a', count: 0, enabled: false };
const direct = parseStructuredJsonText(JSON.stringify(intact));
assert.equal(direct.ok, true);
assert.deepEqual(direct.value, intact);
assert.equal(direct.repaired, false);
```

- [ ] Run `node tools/scripts/test-provider-response-parser.mjs`; confirm the literal-tag preservation regression fails for the expected reason before editing source.
- [ ] Make direct JSON parsing precede text cleanup. Preserve object requirement checks and current exported helpers. Run the parser script again.
- [ ] Add golden fixture pairs: valid result plus the same result with one supported syntax defect. Use synthetic public values; do not copy private chat content or hidden reasoning into fixtures.
- [ ] Review and commit only these task files when implementation is authorized.

## Task 2: Replace unsafe repairs with bounded lexical recovery

**Files:**
- Modify: `src/providers/structured-output-parser.mjs`
- Create: `src/providers/structured-output-scanner.mjs`
- Modify/test: `tools/scripts/test-provider-response-parser.mjs`
- Modify fixtures: `tools/fixtures/model-output-recovery.json`

**Interfaces:** The scanner is private implementation support. Export `scanStructuredOutput(source)` returning `{ ok, candidates, repairs, errorCode? }`; each candidate is a string for JSON.parse. The parser retains the public interface above. No scanner code executes input.

- [ ] Add regression assertions:

```js
const damaged = '{"text":"Keep /* this */ literal",}';
assert.deepEqual(parseStructuredJsonText(damaged).value, { text: 'Keep /* this */ literal' });
assert.equal(parseStructuredJsonText('{"decision":true,"decision":false}').ok, false);
assert.equal(parseStructuredJsonText('Example: {"a":1}\nAnswer: {"a":2}').ok, false);
assert.equal(parseStructuredJsonText('{"text":"unfinished').ok, false);
```

- [ ] Run the parser script and confirm the corruption and ambiguity assertions fail before implementation.
- [ ] Implement a linear lexical scan tracking quote, escape, comment, object, and array state. Preserve all characters inside valid double-quoted values. Strip comments and trailing commas only outside strings; escape literal line breaks only inside strings. Track decoded keys per object, including escaped-key collisions; reject conflicting repeated values before they are lost to JSON.parse.
- [ ] Support only these additional grammar repairs: unquoted identifier keys matching `[A-Za-z_$][A-Za-z0-9_$]*` in key position; single-quoted strings with unambiguous delimiters and supported escapes. Reject uncertain apostrophes, bare values, smart-quote delimiters, missing separators, and truncated values. Do not implement speculative brace completion.
- [ ] Extract complete top-level objects outside closed external reasoning blocks/fences. Permit one distinct candidate or repeated identical candidates; reject differing candidates instead of selecting the first. Do not mine unclosed reasoning blocks for an answer. Preserve literal tags inside JSON strings.
- [ ] Bound recovery scanning to 262144 UTF-16 code units, nesting to 64, and distinct extracted candidates to 4. Limits apply to recovery, not to otherwise valid direct JSON; run duplicate-key inspection on direct JSON without imposing the smaller recovery limits. Stop scanning once a recovery limit is exceeded and return `json_recovery_limit`.
- [ ] Preserve the existing missing-operation-closer fixture through a narrowly bounded legacy branch; do not generalize it. Keep it string-aware and reject if it yields competing interpretations. Document its repair code separately.
- [ ] Emit bounded stage/repair codes, preserving existing error samples rather than adding full response logging. Avoid candidate combinations or recursive retries; scan once and test the bounded candidates.
- [ ] Load and run all fixture records from the existing parser test script. Assert input values remain unchanged for every valid/defective pair that succeeds. Run `node tools/scripts/test-provider-response-parser.mjs`.
- [ ] Review and commit this task's files.

## Task 3: Share recovery across gameplay and sidecar boundaries

**Files:**
- Modify: `src/story/episode-evaluator.mjs`
- Modify: `src/mission/v1/mission-transition-narration.mjs`
- Test: `tools/scripts/test-v1-episode-evaluator.mjs`
- Test: `tools/scripts/test-v1-mission-transition-narration.mjs`
- Test: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`
- Test: `tools/scripts/test-people-dossier-author.mjs`
- Test: `tools/scripts/test-character-creator-assist.mjs`

**Interfaces:** Consumers use `parseStructuredJsonText(value, { requireObject: true })` only for text. Keep existing object-input handling and consumer result shapes. Map parser failures into current domain error arrays; do not rewrite domain validators.

- [ ] For each consumer, take an existing accepted test payload, serialize it, add a trailing comma outside the final object, and assert the existing exported consumer parser produces the same domain value as the original. Add equivalent fenced-output coverage for episode and transition parsers.
- [ ] Run the affected scripts; confirm the newly migrated strict entry points fail before implementation.
- [ ] Replace only the text parsing bodies of episode `parseStrictJsonObject` and transition `parseJsonObject`; rename the episode private helper to `parseJsonObject` to avoid a misleading strict-only name. Use this pattern, retaining each caller's own failure shape:

```js
const parsed = parseStructuredJsonText(value, { requireObject: true });
if (!parsed.ok) return { ok: false, errors: ['episode evaluation output must contain one unambiguous JSON object'] };
return { ok: true, value: parsed.value };
```

- [ ] In accepted-pair fixtures, corrupt syntax on an otherwise invalid claim and verify recovery still rejects unknown candidates, unsupported/noncontiguous evidence, and contradictory abstention. Use the existing request-bound fixtures and validators, not a new mock validator.
- [ ] In dossier fixtures, verify repaired responses still reject unrequested person IDs, conflicting names, missing records, and duplicate records. In transition fixtures, verify wrong transition keys and invalid text remain rejected. In episode fixtures, verify invalid source/effect references remain rejected.
- [ ] In creator fixtures, assert conflicts in explicitly supplied metadata remain failures; keep existing field normalization and fallback semantics unchanged. Confirm the shared parser does not expand the model-repair eligibility allowlist.
- [ ] Run the five test scripts listed above with `node tools/scripts/<filename>` plus `node tools/scripts/test-provider-response-parser.mjs`.
- [ ] Review and commit this task's files.

## Task 4: Verify request budgets and publish the contract

**Files:**
- Modify/test: `tools/scripts/test-character-creator-assist.mjs`
- Modify/test: `tools/scripts/test-v1-accepted-pair-interpreter.mjs`
- Modify/test: `tools/scripts/test-people-dossier-author.mjs`
- Modify/test: `tools/scripts/test-v1-episode-evaluator.mjs`
- Modify: `src/generation/README.md`
- Modify: `tools/scripts/run-alpha-gate.mjs` only if a new standalone test script was actually added; existing scripts already participate.

**Interfaces:** Existing generation-router fakes and request counters. No new production retry interfaces.

- [ ] Add request-count assertions to existing fake-router scenarios: valid first response consumes one request; locally recoverable first response consumes one request; unrecoverable output does not exceed the pre-change attempt count for that same consumer scenario.
- [ ] Exercise existing creator repair/regeneration, dossier fallback, accepted-pair unresolved/replay, and episode retry cases. Assert cancellation and token-limit/empty-visible failures still reach their original handling without synthesizing successful output.
- [ ] Run focused scripts, then `node tools/scripts/test-sillytavern-generation-client.mjs`, `node tools/scripts/test-directive-provider-routing.mjs`, and `node tools/scripts/test-provider-response-parser.mjs`.
- [ ] Document the shared parser entry point, covered consumers, accepted repairs, ambiguity/limit behavior, unchanged validators, and zero additional inference requests in `src/generation/README.md`. Explain that this release recovers representation failures and does not improve unsupported reasoning.
- [ ] Run `npm.cmd test` once on the completed combined change; investigate failures and repeat only affected checks until another full run is warranted by changes. Do not run a paid/live soak or modify the installed host as part of this plan.
- [ ] Review diff for valid-output changes, new request sites, unrelated edits, and any validator weakening. Specifically inspect duplicate-key tightening and legacy operation repair.
- [ ] Commit scoped changes; report tests, recovered fixture classes, intentional rejection changes, and limitations. Push/deployment is a separate integration action requiring session authorization.

## Completion criteria

- All four registered structured roles benefit from the same bounded parser, as does the transition-candidate boundary.
- Valid values, including embedded tags/comment markers, remain unchanged.
- Recoverable fixture pairs produce identical domain results; ambiguous/truncated and semantically invalid cases remain rejected.
- Model request counts and time budgets do not increase; good responses never trigger repair inference.
- Existing authority, fallback, cancellation, replay, and object-input behavior remain intact.
- Full alpha gate passes. Report actual fixture/test evidence, not an unmeasured claim about all small models.

## Follow-up threshold

Only propose label aliases, smaller schemas, alternate record formats, or changed retry prompts after real rejected outputs show that syntax recovery leaves a recurring representation problem. Each such change must name the affected operation and demonstrate valid-output parity and unchanged request ceilings. No adaptive orchestration work is included in this plan.


## Execution record — 2026-09-07

Implemented from origin/main e4bb661df in an isolated worktree. The source inventory confirmed the listed boundaries; the transition helper also serves its structured review proposal, which now shares recovery without changing review validation. No transport, prompt, schema, runtime commitment, or retry-owner code changed.

All four tasks are complete. Changes are consolidated into one reviewed implementation commit rather than intermediate task commits. Parser regressions were observed failing before implementation; episode/transition syntax regressions likewise failed before migration. Creator's single-quoted invalid envelope now reaches schema rejection, so its targeted-retry diagnostic expectation changed from json_invalid to json_schema_invalid with the same three requests.

Verification: npm.cmd test passed all 164 focused checks, including browser checks. The parser has 36 replay fixtures plus depth-7000, size/depth/candidate limits, escaped-key collisions, CR-only comments, and 30000 repeated-candidate regressions. Four role-level tests confirm both direct and locally recovered success use one request. A supplemental 2000 generated valid/repair roundtrip probe passed. Independent review found six issues during implementation; each was fixed and the final review had no remaining actionable findings.

No live provider soak or installed-host mutation was performed. Test-generated logs and unrelated checkout files are excluded from the PR. The original plan's deferred adapters and orchestration remain deferred.
