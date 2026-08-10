# Directive Model-Call Envelope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate Directive-owned model calls from unrelated SillyTavern preset parameters without injecting narration prompts into Utility or structured Reasoning roles.

**Architecture:** Prefer SillyTavern's `ChatCompletionService` for the current Chat Completion model, applying the bundled `Directive` preset only as the generation-parameter source while passing exact role-local messages. Preserve existing profile and direct-endpoint routes, forward structured schemas through profiles, and add one response-driven retry that removes only an optional direct-endpoint field explicitly rejected by the provider.

**Tech Stack:** Browser-native JavaScript modules, SillyTavern extension APIs, Node.js `assert/strict`, existing alpha-gate scripts.

## Global Constraints

- Gameplay narration retains the full bundled Directive preset and runtime campaign packet.
- Utility and structured Reasoning requests retain only their role-local prompts and schemas.
- Do not add model-name allowlists, provider-specific instruction variants, migrations, or compatibility layers.
- Retry an unsupported optional direct-endpoint parameter at most once.
- Required payload fields and structured-output contracts must never be removed.

---

### Task 1: Controlled SillyTavern request envelope

**Files:**
- Modify: `src/hosts/sillytavern/provider-client.mjs:310-423`
- Test: `tools/scripts/test-directive-provider-routing.mjs`

**Interfaces:**
- Consumes: `context.mainApi`, `context.chatCompletionSettings`, `context.ChatCompletionService.processRequest`, `DIRECTIVE_PRESET_NAME`, existing request objects.
- Produces: current-model Chat Completion requests using `{ presetName: DIRECTIVE_PRESET_NAME }`, exact message arrays, explicit sampling/token overrides, and forwarded `json_schema` payloads.

- [ ] **Step 1: Write failing current-model and profile schema tests**

Add a current Chat Completion context whose `ChatCompletionService.processRequest` records its arguments and returns `{ content: "controlled-current-answer" }`. Generate a Utility role and assert the request uses the current model/source, exact system and user messages, `stream: false`, explicit `temperature`, `top_p`, `max_tokens`, `json_schema`, and `{ presetName: "Directive" }`. Extend the existing profile assertion to require `payload.json_schema`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-directive-provider-routing.mjs`

Expected: FAIL because the current-model route calls `generateRaw` instead of `ChatCompletionService.processRequest`, and profile payloads do not contain `json_schema`.

- [ ] **Step 3: Implement the controlled current-model route**

Import `DIRECTIVE_PRESET_NAME`. Add a Chat Completion branch before `generateRaw` that builds exact messages from `requestPrompts`, calls `processRequest` non-streaming with current connection identity plus Directive-owned overrides, and extracts the returned content through the existing normalizer. Add `json_schema` to profile override payloads when present. Leave the raw fallback intact for hosts that do not expose the controlled service.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-directive-provider-routing.mjs`

Expected: PASS with the controlled current-model and profile schema assertions.

- [ ] **Step 5: Commit the controlled envelope**

```powershell
git add src/hosts/sillytavern/provider-client.mjs tools/scripts/test-directive-provider-routing.mjs
git commit -m "fix(providers): isolate Directive model calls"
```

### Task 2: Response-driven optional-parameter retry

**Files:**
- Modify: `src/hosts/sillytavern/provider-client.mjs:387-423`
- Test: `tools/scripts/test-directive-provider-routing.mjs`

**Interfaces:**
- Consumes: direct OpenAI-compatible HTTP error JSON with `error.param`, and the request body Directive constructed.
- Produces: at most one retry with a rejected optional field removed when that exact top-level field is present in the original payload.

- [ ] **Step 1: Write failing retry-boundary tests**

Add one fake endpoint that rejects `temperature` with status 400 on the first request and succeeds on the second. Assert two calls, identical required fields, and absence of `temperature` only on the retry. Add another fake endpoint that rejects required `model`; assert one call and a normal `DIRECTIVE_PROVIDER_REQUEST_FAILED` error.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/scripts/test-directive-provider-routing.mjs`

Expected: FAIL because direct requests currently throw after the first non-success response.

- [ ] **Step 3: Implement the bounded retry**

Build the direct request body once. Parse the bounded response JSON already read for error handling. If `error.param` names an own top-level field in the body and that field is one of Directive's optional generation fields (`temperature` or `top_p`), clone the body without that field and make one additional request with the same endpoint, headers, credentials, and abort signal. Do not retry required, unknown, nested, or already-retried fields.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node tools/scripts/test-directive-provider-routing.mjs`

Expected: PASS with exactly one bounded retry for `temperature` and no retry for `model`.

- [ ] **Step 5: Commit the retry behavior**

```powershell
git add src/hosts/sillytavern/provider-client.mjs tools/scripts/test-directive-provider-routing.mjs
git commit -m "fix(providers): shed rejected optional fields"
```

### Task 3: Operator documentation and full verification

**Files:**
- Modify: `docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md`

**Interfaces:**
- Consumes: the implemented current-model, profile, and direct-endpoint behavior.
- Produces: operator-facing explanation of narration-preset versus auxiliary-call parameter ownership.

- [ ] **Step 1: Document the envelope**

Explain that narration uses the full Directive preset and runtime packet, auxiliary calls use exact role-local messages, current Chat Completion calls use the bundled preset only for generation parameters, and direct endpoints may retry once without an explicitly rejected optional field.

- [ ] **Step 2: Run focused and full verification**

Run:

```powershell
node tools/scripts/test-directive-provider-routing.mjs
npm.cmd test
git diff --check
```

Expected: provider routing passes, all alpha-gate checks pass, and `git diff --check` exits 0.

- [ ] **Step 3: Commit documentation**

```powershell
git add docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md docs/superpowers/plans/2026-08-10-directive-model-call-envelope.md
git commit -m "docs: explain Directive call isolation"
```

- [ ] **Step 4: Review and integrate**

Request a diff review against the pre-feature base. Resolve all Critical and Important findings, rerun the full alpha gate, merge `codex/directive-model-envelope` into `main`, rerun the full alpha gate on `main`, and push `main` to `origin`.

### Task 4: Host narration preset lifecycle correction

**Files:**
- Modify: `src/hosts/sillytavern/preset-manager.mjs`
- Modify: `src/runtime/runtime-app.mjs`
- Modify: `src/hosts/sillytavern/shell-events.js`
- Modify: `src/hosts/host-contract.mjs`
- Modify: `src/hosts/sillytavern/host-factory.mjs`
- Test: `tools/scripts/test-sillytavern-preset-manager.mjs`
- Test: `tools/scripts/test-v1-runtime-app.mjs`
- Test: `tools/scripts/test-sillytavern-event-wiring.mjs`

**Interfaces:**
- Consumes: the installed `Directive` Chat Completion preset, SillyTavern's canonical preset manager, the `OAI_PRESET_CHANGED_AFTER` event, and the runtime's existing bound-chat check.
- Produces: `activateNarrationPreset()` and `restoreNarrationPreset()` as a chat-scoped preset lease. A bound campaign activates the complete Directive narration preset before prompt synchronization and each host generation; an unbound chat or extension disable restores the user's prior selection.

- [x] **Step 1: Write failing preset lifecycle tests**

Add tests proving activation selects the installed `Directive` preset by its real option value, waits for SillyTavern's preset-applied event, preserves one restore target across repeated activation, adopts a manual selection made during the lease as the next restore target, restores that target when campaign play ends, and fails open when the bundled preset is not installed.

- [x] **Step 2: Run the focused preset test and verify RED**

Run: `node tools/scripts/test-sillytavern-preset-manager.mjs`

Expected: FAIL because the preset manager does not expose narration activation or restoration.

- [x] **Step 3: Implement the chat-scoped preset lease**

Resolve the installed Directive preset through the existing manager helpers, select it with `findPreset()` plus `selectPreset()`, await `OAI_PRESET_CHANGED_AFTER` when the host exposes that event, and serialize transitions. Keep the original selection for restoration; if the user selects another preset while the campaign remains active, remember that new selection before reasserting Directive. Never introduce model-name or provider-field tables.

- [x] **Step 4: Write failing runtime lifecycle tests**

Require `syncPrompt()` to activate the narration preset for a bound campaign and restore it for an unbound chat. Require extension disable to restore the lease even when no chat-change event occurs.

- [x] **Step 5: Run runtime and event tests and verify RED**

Run:

```powershell
node tools/scripts/test-v1-runtime-app.mjs
node tools/scripts/test-sillytavern-event-wiring.mjs
```

Expected: FAIL because runtime prompt synchronization and extension disable do not call the new lifecycle methods.

- [x] **Step 6: Wire the lifecycle through the host contract**

Expose the two preset lifecycle methods from the SillyTavern host. In `syncPrompt()`, restore before clearing an unbound chat and activate before building/installing a bound campaign packet. On extension disable, restore before tearing down the bridge. Log activation failure and continue with the existing runtime packet so a missing host preset does not block the player's request.

- [x] **Step 7: Run focused and full verification**

Run:

```powershell
node tools/scripts/test-sillytavern-preset-manager.mjs
node tools/scripts/test-v1-runtime-app.mjs
node tools/scripts/test-sillytavern-event-wiring.mjs
npm.cmd test
git diff --check
```

Expected: all focused checks and the 73-check alpha gate pass, and `git diff --check` exits 0.
