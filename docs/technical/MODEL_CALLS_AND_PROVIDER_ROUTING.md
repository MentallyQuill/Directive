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

Structured output is parsed, size-limited, shape-validated, and checked against a closed candidate set. Provider failure cannot produce partial semantic mutation. Mission evidence fails closed; time adjudication has a deterministic fallback where the contract permits it; character drafting may use the local authored fallback.

The main narration model receives the visible chat plus one V1 campaign context packet containing the player dossier, current mission projection, concise people and ship projections, Command Bearing, accepted story projection, and authored narration guidance. Hidden objective text is never copied into the player-facing portions of that packet.
