# Generation

This folder contains the V1 model-call boundary.

- `generation-roles.mjs` defines the supported narration and Story Settlement roles.
- `hidden-truth-safety.mjs` prevents player-facing narration from receiving hidden campaign facts.

Mission progression is not inferred here. Story Settlement proposes closed candidates; the mission validator and reducer decide what may commit.

## Structured response recovery

`src/providers/structured-output-parser.mjs` is the shared text parser for all
registered structured roles, plus transition narration candidates and
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

## Parallel turn analysis

Normal directed turns run event interpretation, continuity analysis, and story
direction concurrently. Episode evaluation joins that group only when a checkpoint
review is due. Every role reads a captured save revision. The state spine validates
and commits their combined findings through one custody update before narration.

Continuity owns thread changes; direction owns next-beat guidance and cannot refer
to a concurrent analyst's new local IDs. Episode evaluation sees only committed
episode evidence. Each role has its own response contract. The legacy combined
director adapter remains available for existing injected consumers.

The coordinator allows two attempts per failed role per run, retaining successful
results for the same input identity. User retry resumes failed roles; source edits,
chat switches, cancellation, or changed input invalidate reuse. A continuity lookup
can request stored records and make a second focused pass. A direction invalidated
by accepted findings is reconciled in a separate direction-only pass. These are
bounded additional calls, not additional narrative turns.

Full continuity events stay in the save. Routine retrieval selects relevant facts
and explicitly reports omitted history; absence from a prompt is not evidence of
absence from the campaign. Dormancy never implies an obligation was fulfilled.
