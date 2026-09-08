# Generation

This folder contains the V1 model-call boundary.

- `generation-roles.mjs` defines the supported narration and Story Settlement roles.
- `hidden-truth-safety.mjs` prevents player-facing narration from receiving hidden campaign facts.

Mission progression is not inferred here. Story Settlement proposes closed candidates; the mission validator and reducer decide what may commit.

## Structured response recovery

`src/providers/structured-output-parser.mjs` is the shared text parser for all
four registered structured roles, plus transition narration candidates and
their structured review proposals. Already-parsed objects retain each caller's
existing handling. Ordinary narration, storage JSON, and native capability
probes do not pass through recovery.

The parser tries JSON directly before modifying text. Successful values retain
literal tags, URLs, comment markers, punctuation, and whitespace inside strings.
Conflicting duplicate keys are intentionally rejected, including escaped-key
collisions. Identical repeated values are allowed.

On syntax failure only, recovery can extract one unambiguous object/array from
fences or commentary, skip closed external reasoning blocks, remove comments
and trailing commas outside strings, escape literal line breaks, and translate
unquoted identifier keys or unambiguous single-quoted strings. Multiple differing
answers, unclosed reasoning, truncated values, bare values, smart-quote
delimiters, and missing separators remain rejected. The legacy missing-operation
closer repair is restricted to objects starting with `op` in an `operations`
array; it does not authorize arbitrary object completion.

Recovery is limited to 262144 UTF-16 code units, nesting depth 64, and four
distinct candidate texts. Direct valid JSON is not subject to those recovery
limits. Optional `recovery.stage` and `recovery.repairs` metadata describes local
transformations without adding raw-response logging. Ambiguity and limit errors
use `json_ambiguous` and `json_recovery_limit`; creator repair eligibility is not
expanded for these categories.

Every recovered result still passes the consumer's existing semantic validator.
No fields, evidence, IDs, or metadata are synthesized; no partial gameplay
results are committed. Provider normalization, token-limit handling, cancellation,
timeouts, fallback, retry counts, and accepted-source custody remain owned by
their existing modules. Local recovery adds no model calls and does not change
prompts or schemas. It repairs representation defects, not unsupported reasoning.
