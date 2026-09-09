# Configurable analysis limits

Settings exposes the budgets used to build analysis requests, validate structured responses, and execute model calls. These settings control the current working context and future requests; lowering them does not delete campaign history or truncate persisted facts.

## Model lanes and role overrides

Each Utility or Reasoning lane has **Default output tokens** and **Request timeout (seconds)**. The expandable **Per-role output, timeout, and retry limits** section offers independent values for each registered role. Blank output-token and timeout fields inherit the lane value. A role override replaces the lane default, including when it is larger. The runtime router and native provider transport use the same effective value, so old request defaults cannot silently impose a smaller output budget.

The model provider can still reject budgets beyond its supported context or output size. Directive normalizes numeric values to safe integers. Timeouts are capped at 2,147,483 seconds solely because browser timers use signed 32-bit milliseconds; the earlier 86,400-second cap is removed. Output settings no longer impose the earlier 131,072-token ceiling.

**Attempts** includes the first call. One disables coordinator retries. The field appears for mission interpretation, continuity analysis, story direction, legacy combined direction, and episode review. Failed roles retry independently; successful results remain cached for the captured turn. Other roles expose output and timeout controls without implying that they participate in this coordinator.

## Shared context and response budgets

Under the Utility lane, **Analysis context and response content limits** applies across analysis roles. The source of labels, defaults, allowed minimums, and normalization is `src/generation/analysis-limits.mjs`.

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
directive.providers.utility.analysisLimits
directive.providers.utility.roleLimits[roleId]
directive.providers.reasoning.roleLimits[roleId]
```

Per-role entries contain `maxTokens`, `timeoutSeconds`, and `maxAttempts`; null token/timeout values mean inheritance. Nested patches merge with existing entries so changing one field preserves sibling settings. Unknown analysis keys and role IDs outside the selected lane are discarded during normalization. The existing Settings action saves these updates through the provider settings store.

Changes take effect on subsequent requests. Captured analysis limits travel with the request so validation and follow-up retrieval use the same content budget. They do not rewrite the installed extension, change save facts, or retrospectively declare unresolved threads expired.

## Verification

- `test-analysis-limit-settings.mjs`: normalization, inheritance, large values, timer range, lane ownership, nested updates, and reload persistence.
- `test-configured-generation-limits.mjs`: effective role/lane budgets reach transport, coordinator retry settings, visible-output recovery, and provider probe budgets.
- `test-certified-settings-panel.mjs`: rendered controls dispatch the existing save actions, including resetting an override to inheritance.
- `test-narration-settings-browser.mjs`: desktop and mobile edits, persistence, rerender, inherited values, and control bounds; screenshots are local artifacts.

Focused continuity and episode tests verify that response content above old defaults is accepted only when the corresponding configured budget permits it.
