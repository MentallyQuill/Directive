# Configurable analysis limits

Settings provides one **Analysis capacity** slider from **0.5× to 5×**, with **1×** as the default. It scales context selection and response capacity together. Higher values allow more context and longer responses, which can use more tokens and take longer. It does not change timeouts, retries, lookup passes, thread retirement, deadline timing, or stored campaign history.

The current multiplier updates while dragging and saves when the value changes. **Reset capacity** returns to 1× without clearing custom settings. Exact budgets live in one collapsed **Advanced** section. A visible count identifies active overrides so the slider's effect is clear.

Confirmed provider output-limit failures show one persistent notification suggesting increased Analysis Capacity, with an **Open Settings** shortcut. Exact output overrides receive guidance to increase or clear the override instead; at 5× the notice suggests checking Advanced or trying another model. Concurrent failures and retries reuse the same notice. The recovery dialog also offers the Settings shortcut. Malformed responses, timeouts, and reasoning-only responses without an output-limit finish reason do not trigger this notice.

## Model lanes and role overrides

Each Utility or Reasoning lane keeps its connection configuration and **Request timeout (seconds)** visible. **Advanced** contains lane output tokens and each registered role's output, timeout, and retry overrides. Blank fields inherit the value shown in their placeholder. Lane output starts at 8,192 tokens multiplied by capacity; an exact lane override replaces it. A role output override replaces the lane value. The runtime router and native provider transport use the same effective value.

The model provider can still reject budgets beyond its supported context or output size. Directive normalizes numeric values to safe integers. Timeouts are capped at 2,147,483 seconds solely because browser timers use signed 32-bit milliseconds; the earlier 86,400-second cap is removed. Output settings no longer impose the earlier 131,072-token ceiling.

**Attempts** includes the first call. One disables coordinator retries. The field appears for mission interpretation, continuity analysis, story direction, legacy combined direction, and episode review. Failed roles retry independently; successful results remain cached for the captured turn. Other roles expose output and timeout controls without implying that they participate in this coordinator.

## Shared context and response budgets

The **Shared context and response limits** group inside **Advanced** applies across analysis roles. Values are absolute overrides, not multipliers. Clearing an individual field restores inheritance. **Reset advanced overrides** clears both lanes' output overrides, per-role overrides, and shared exact limits; it preserves the capacity slider and lane timeouts. No confirmation dialog is required. The source of labels, defaults, scaling eligibility, and normalization is `src/generation/analysis-limits.mjs`.

The controls cover:

- Request context size and thread retrieval size, record counts, facts per record, inactivity distance, deadline lead time, and lookup passes.
- Continuity response changes, title/fact/quote lengths, links, deadline hint horizon, lookup counts and queries, and local references.
- Direction conditions, target IDs, known entity counts, and display-name lengths.
- Episode effects, sources, recent evidence and summaries, people events, relationships, questions, and summary/moment text lengths.
- Interpreter claim and people-event counts, public person text, evidence quotes, time explanations, and scene-pacing text.
- Dossier batch size, ship/introduction context, public fields and profile summaries; opening reference selections and native opening narration output tokens.
- Provider visible-output recovery attempts and the output budget for provider certification probes.
- Native narration completion observation wait and deterministic fallback episode-summary size.

**Narration completion wait** controls how long Directive observes the host chat for the completed assistant message after handing narration to SillyTavern. It is separate from the model-lane timeouts and uses the same browser timer maximum. Explicit observation deadlines supplied by a caller take precedence.

**Continuity passes** includes the initial analysis. One disables follow-up retrieval. Each pass may request only the configured number of lookups and IDs. The coordinator's role retry budget is separate, so an exhausted role may begin its lookup sequence again on its next permitted attempt.

**Visible-output recovery attempts** applies to provider requests that permit this recovery. Focused turn analyses disable that provider retry and use their coordinator role budget instead. This avoids two automatic retry loops for the same failed analysis. Provider tests use their own configurable token budget rather than inheriting a large gameplay response budget.

Content limits affect request schemas and corresponding generation validators together. Storage validation keeps structural and evidence requirements but must not reject already accepted content merely because the user later selects smaller generation limits. Exact source evidence, valid IDs, allowed field ownership, captured revisions, and player authority remain mandatory; increasing a size limit does not relax these rules.

## Persistence and application

Configuration lives in the existing SillyTavern extension settings:

```text
directive.providers.utility.analysisCapacity
directive.providers.utility.analysisOverrides
directive.providers.utility.outputTokenOverride
directive.providers.reasoning.outputTokenOverride
directive.providers.utility.roleLimits[roleId]
directive.providers.reasoning.roleLimits[roleId]
```

Per-role entries contain `maxTokens`, `timeoutSeconds`, and `maxAttempts`; null values restore inheritance. Sparse `analysisOverrides` entries retain existing custom exact limits. Legacy `analysisLimits` and `maxTokens` settings are migrated without treating old defaults as custom overrides. Scaling always starts from the defaults, so moving the slider repeatedly does not compound values. Nested patches preserve sibling settings; null clears one override or resets its group. The existing Settings action persists the changes.

Changes take effect on subsequent requests. Captured analysis limits travel with the request so validation and follow-up retrieval use the same content budget. They do not rewrite the installed extension, change save facts, or retrospectively declare unresolved threads expired.

## Verification

- `test-analysis-limit-settings.mjs`: normalization, inheritance, large values, timer range, lane ownership, nested updates, and reload persistence.
- `test-configured-generation-limits.mjs`: effective role/lane budgets reach transport, coordinator retry settings, visible-output recovery, and provider probe budgets.
- `test-certified-settings-panel.mjs`: rendered controls dispatch the existing save actions, including resetting an override to inheritance.
- `test-analysis-capacity-browser.mjs`: desktop/mobile rendering, 0.5× and 5×, current-value display, persistence through reload, collapsed Advanced, inherited values, resets, and unchanged timeout/retry/retirement settings.
- `test-narration-settings-browser.mjs`: desktop and mobile edits, persistence, rerender, inherited values, and control bounds; screenshots are local artifacts.

Focused continuity and episode tests verify that response content above old defaults is accepted only when the corresponding configured budget permits it.
