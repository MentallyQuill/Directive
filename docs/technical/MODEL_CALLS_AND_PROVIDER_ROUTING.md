# Model Calls and Provider Routing

Directive exposes two provider lanes: Utility for fast structured analysis and Reasoning for story-quality generation. Each generation role owns its lane; callers cannot override the provider kind per request.

| Role | Lane | Output | Authority |
|---|---|---|---|
| `narration` | Reasoning | prose | none |
| `acceptedPairMissionEvidence` | Utility | structured mission selection and elapsed-time proposal | none |
| `characterCreatorSectionDraft` | Reasoning | structured draft | none |
| `utilityJson` | Utility | bounded story distillation | none |

Each lane uses exactly one SillyTavern-native source:

- **Current Model** uses the connection and model active in SillyTavern.
- **Connection Profile** uses a supported chat/text profile from SillyTavern's Connection Manager.

Directive has no direct endpoint transport and stores no provider API keys. Credentials remain entirely inside SillyTavern's native connection handling.

## Generation policy

Both sources use the same policy:

- Behavioral Preset defaults to Isolated. Full source preset opts into the source's generation preset.
- Instruct Formatting defaults to Auto, which enables instruct for text completion and disables it for chat completion.
- Samplers defaults to SillyTavern settings. Directive override sends the configured Temperature and Top P; otherwise those fields are omitted.
- Structured Output defaults to Auto. Prompt JSON omits schema metadata. Native schema requires the exact current configuration to pass certification. Auto uses Native schema only while that certification fingerprint remains current.
- Output token ceiling caps the role request without increasing a smaller requested limit.

Changing a source, profile, completion mode, or policy value invalidates the prior test result. Explicit Native schema fails before transport when the exact configuration is uncertified; it never silently downgrades. Auto safely remains on Prompt JSON until certification succeeds.

The runtime treats the installed `Directive` preset as a chat-scoped narration lease. Opening or generating in a bound campaign chat selects it through SillyTavern's canonical preset manager and waits for `OAI_PRESET_CHANGED_AFTER` before campaign prompt synchronization continues. Leaving for an unbound chat or disabling the extension restores the user's previous preset. A manual preset choice made during campaign play becomes the next restore target if Directive must reassert its narration preset at the following generation boundary.

Structured output is parsed, size-limited, shape-validated, and checked against a closed mission candidate set plus the bounded whole-second elapsed-time schema. Provider failure cannot produce partial semantic mutation. Mission evidence and elapsed story time both fail closed; deterministic runtime code alone accumulates seconds and calculates the canonical Stardate and `HH:MM:SS` ship clock. Time, mission, Story Settlement, and accepted Command Bearing changes share one persistence commit. A persistence failure retries at most twice while reusing the already validated Utility result; exhausted failure blocks narration until manual retry succeeds. Valid unchanged and indeterminate decisions are retained as bounded diagnostics without becoming positive time boundaries. Character drafting may use the local authored fallback.

The main narration model receives the visible chat plus one V1 campaign context packet containing the player dossier, current mission projection, concise people and ship projections, Command Bearing, accepted story projection, authoritative current time, the final-footer contract, and authored narration guidance. Hidden objective text is never copied into the player-facing portions of that packet.

Accepted-pair identity hashes complete selected assistant and player text and parses the complete assistant response for its time footer before bounding provider prompt text. Replay and reconciliation use complete raw SillyTavern history so selected-swipe custody is preserved; raw history is never included in exported support diagnostics or player-facing prompt projections.
