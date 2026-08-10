# Model Calls and Provider Routing

Directive exposes two provider lanes: Utility for fast structured analysis and Reasoning for story-quality generation. Each generation role owns its lane; callers cannot override the provider kind per request.

| Role | Lane | Output | Authority |
|---|---|---|---|
| `narration` | Reasoning | prose | none |
| `acceptedPairMissionEvidence` | Utility | structured candidate selection | none |
| `timeAdvanceAdjudicator` | Utility | structured elapsed-time proposal | none |
| `characterCreatorSectionDraft` | Reasoning | structured draft | none |
| `utilityJson` | Utility | bounded story distillation | none |

Providers may use the current SillyTavern model, a SillyTavern connection profile, or an explicitly configured OpenAI-compatible endpoint. API keys for direct endpoints remain session-only.

Directive separates narration prompts from auxiliary generation parameters. Gameplay narration uses the full bundled Directive preset plus the V1 campaign context packet. Utility and structured Reasoning calls instead send only their role-local system prompt, user prompt, and schema; they do not inherit the preset's narration prompt stack.

For the current SillyTavern Chat Completion model, Directive applies the bundled `Directive` preset as a per-request generation-parameter baseline without changing the preset selected in the main SillyTavern UI. Connection-profile calls use the profile's configured preset in the same parameter-only role. This keeps `reasoning_effort` at the bundled preset's model-neutral `auto` setting while preserving Directive-owned temperature, top-p, token, and schema overrides.

Direct OpenAI-compatible calls do not depend on a SillyTavern preset. If an endpoint rejects an optional top-level generation field that Directive actually sent, Directive retries once without that exact field. Required fields, unknown fields, nested fields, and structured-output contracts are never removed, and no model-name compatibility table is maintained.

Structured output is parsed, size-limited, shape-validated, and checked against a closed candidate set. Provider failure cannot produce partial semantic mutation. Mission evidence fails closed; time adjudication has a deterministic fallback where the contract permits it; character drafting may use the local authored fallback.

The main narration model receives the visible chat plus one V1 campaign context packet containing the player dossier, current mission projection, concise people and ship projections, Command Bearing, accepted story projection, and authored narration guidance. Hidden objective text is never copied into the player-facing portions of that packet.
