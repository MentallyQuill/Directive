# Settings and Provider Policy Overhaul Implementation Plan

> **For Codex:** Execute this plan task-by-task with red-green-refactor discipline. Preserve unrelated worktree files such as `debug.log`.

**Goal:** Replace Directive's cramped Settings layout and private endpoint flow with a full-width, stacked, SillyTavern-native provider policy UI while restoring the approved certified Tooltips, routing-summary, and diagnostics controls.

**Architecture:** Keep persisted provider policy in `directive-provider-settings.mjs`, resolve it into transport-ready behavior in a small provider-policy module, and let `provider-client.mjs` expose status/test/certification without owning credentials. The Settings panel renders the normalized runtime view, auto-saves changes through existing actions, and uses the existing runtime tooltip engine. Runtime support export remains metadata-only unless a host adapter can provide an explicitly bounded visible transcript.

**Tech stack:** JavaScript ES modules, SillyTavern host APIs, DOM-native UI, CSS, Node assertion scripts, Playwright visual conformance.

---

### Task 1: Lock the new provider settings and policy contract

**Files:**
- Create: `src/providers/generation-policy.mjs`
- Modify: `src/providers/directive-provider-settings.mjs`
- Modify: `tools/scripts/test-directive-provider-routing.mjs`

1. Replace direct-endpoint and secret-store assertions with failing assertions for the two-source schema, policy defaults, obsolete-source normalization, and removal of secret APIs.
2. Add failing table-driven assertions for behavioral preset, instruct, sampler, and structured-output resolution, plus configuration fingerprint stability/change detection.
3. Run `node tools/scripts/test-directive-provider-routing.mjs` and confirm the new assertions fail for the expected missing schema/policy behavior.
4. Implement normalized settings containing only `provider`, `profileId`, `presetMode`, `instructMode`, `samplerMode`, `structuredOutputMode`, `temperature`, `topP`, and `maxTokens`.
5. Implement the pure policy resolver and stable configuration fingerprint. Ensure obsolete endpoint/model/key properties are dropped.
6. Re-run the focused script and continue only when the policy assertions pass.

### Task 2: Make both supported transports obey the resolved policy

**Files:**
- Modify: `src/hosts/sillytavern/provider-client.mjs`
- Modify: `tools/scripts/test-directive-provider-routing.mjs`

1. Add failing assertions for profile metadata discovery/validation, current-model completion-mode detection, sampler omission, preset/instruct flags, structured Auto fallback, explicit Native-schema rejection, certification invalidation, and cancellation.
2. Run the focused provider script and confirm failures are localized to the new transport expectations.
3. Remove the OpenAI URL builder, response-format adapter, optional-parameter retry, fetch transport, and `fetchImpl`/API-key dependencies.
4. Apply resolved policy to current-model and connection-profile requests. Do not send temperature or Top P in SillyTavern-settings mode.
5. Add configuration-scoped test/certification state. A successful schema-capability probe certifies only its exact fingerprint; explicit Native schema fails when uncertified, while Auto uses Prompt JSON until certified.
6. Return sanitized status and test capability data. Keep timeout, cancellation, response normalization, and visible-output retry behavior.
7. Re-run the focused provider script until green.

### Task 3: Rebuild the Settings view model and interaction contract

**Files:**
- Modify: `src/ui/view-models/certified-settings-view.mjs`
- Modify: `src/ui/settings-panel.js`
- Modify: `src/ui/runtime-ui-kit.js` only if a small public tooltip-state adapter is needed
- Modify: `tools/scripts/test-certified-settings-view.mjs`
- Modify: `tools/scripts/test-certified-settings-panel.mjs`

1. Add failing view assertions for Interface, Model Lanes, Directive Preset, Model-Call Routing, and Diagnostics data with no General/Advanced navigation model.
2. Add failing DOM assertions for no `settings-navigation`, two stacked cards, exactly two provider options, tooltip toggle wiring, policy controls, conditional sampler rows, searchable profile picker, auto-save, read-only routing rows, and collapsed diagnostics.
3. Run both focused UI scripts and confirm the old layout fails the new contract.
4. Build a single full-width settings surface. Restore the Tooltips toggle using `areDirectiveTooltipsDisabled` and `setDirectiveTooltipsDisabled`.
5. Render both lane cards with Current Model and Connection Profile only. Add the Recursion-style policy controls and accessible contextual help. Hide profile selection unless needed and hide Temperature/Top P unless Directive override is selected.
6. Auto-save valid field changes, refresh status without losing focus, and invalidate visible test feedback on relevant changes. Keep Test as an explicit action.
7. Add the read-only generation-role routing summary and collapsed privacy-bounded Diagnostics disclosure. Do not add tutorial/help/startup controls.
8. Re-run both focused UI scripts until green.

### Task 4: Expose safe runtime data and bounded diagnostics

**Files:**
- Modify: `src/runtime/runtime-app.mjs`
- Modify: relevant host adapter only if an already-bounded visible-transcript API exists
- Modify: or create focused runtime support-export test under `tools/scripts/`
- Modify: `tools/scripts/run-alpha-gate.mjs` if a focused script is added

1. Add failing assertions that provider configuration includes role bindings and sanitized policy/status, and support export never contains endpoint/key fields or hidden prompt content.
2. Inspect the host chat API for an existing selected-branch, player-visible transcript source. If the boundary is provable, add explicit opt-in export; otherwise report transcript availability as false and keep the option disabled.
3. Implement role bindings from the generation-role registry and sanitize provider configuration before exposing it to the UI/export.
4. Replace raw prompt inspection in support exports with bounded routing metadata. Accept `includeStoryTranscript` and include transcript data only when the safe host capability is available and requested.
5. Run the focused runtime test until green.

### Task 5: Widen and stack the certified UI

**Files:**
- Modify: `styles/directive.css`
- Modify: `tools/scripts/test-visual-conformance.mjs` or the existing certified Settings visual assertions
- Modify: `src/ui/README.md`

1. Add failing static/geometry assertions that Settings has one content column, provider cards remain one column at desktop width, and narrow controls collapse without horizontal overflow.
2. Remove the obsolete sidebar grid column and force the provider grid to one column. Add responsive policy-row, tooltip-trigger, routing-summary, and diagnostics styles using the certified design tokens.
3. Update the UI README to describe the current V1 settings contract.
4. Run the focused visual conformance script and inspect any generated Settings screenshots before accepting layout changes.

### Task 6: Verify, review, integrate, and publish

**Files:**
- Review all files changed above

1. Run the focused provider, Settings view, Settings panel, runtime support-export, and visual tests.
2. Run `npm.cmd test` and confirm every focused, browser-safety, scenario, and visual gate passes.
3. Search production source for `openai_compatible`, `OpenAI-compatible endpoint`, `directive.provider-key`, `baseUrl`, and provider `apiKey` remnants; only intentional historical documentation may remain.
4. Review the complete diff for scope, accessibility, security boundaries, and accidental changes. Leave `debug.log` and all unrelated work untouched.
5. Commit the implementation with a concise conventional commit.
6. Recheck the primary `main` worktree, merge `codex/settings-provider-overhaul` without discarding concurrent work, rerun the full gate on merged `main`, and push `main` to `origin`.
7. Verify local `main` and `origin/main` resolve to the same commit and report the exact verification result.
