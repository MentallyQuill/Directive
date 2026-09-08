# Model Calls and Provider Routing

Directive exposes two provider lanes for work it owns: Utility for the blocking accepted-pair interpretation and Reasoning for bounded behind-the-scenes story analysis and character drafting. Each generation role owns its lane; callers cannot override the provider kind per request. SillyTavern's active main model remains the canonical gameplay narrator and is not a Directive provider role.

| Role | Lane | Output | Authority |
|---|---|---|---|
| `acceptedPairMissionEvidence` | Utility | structured mission, elapsed-time, and batched People observations | none |
| `peopleDossierAuthor` | Reasoning | one public-dossier batch for newly named emergent contacts | none |
| `episodeEvaluator` | Reasoning | bounded episode, relationship-posture, and defining-moment proposal | none |
| `characterCreatorSectionDraft` | Reasoning | structured draft | none |

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

Structured output uses role-local closed JSON schemas, then is parsed, size-limited, shape-validated, and checked again against the exact mission candidates or episode snapshot supplied to the call. Policies whose deterministic predicate is false never enter the mission candidate packet. Provider timeouts and host generation cancellation abort the underlying request. Provider failure cannot produce partial semantic mutation. Mission evidence and elapsed story time both fail closed; deterministic runtime code alone accumulates seconds and calculates the canonical Stardate and `HH:MM:SS` ship clock. Time, mission, Story Settlement, and accepted Command Bearing changes share one persistence commit. A persistence failure retries at most twice while reusing the already validated Utility result; exhausted failure blocks narration until manual retry succeeds. Valid unchanged decisions are retained as bounded diagnostics. Indeterminate timing commits neither a time decision nor an accepted-pair receipt; it blocks narration through existing recovery, and manual retry requests a fresh interpretation. Character drafting may use the local authored fallback.

The main narration model receives the visible chat plus one V1 campaign context packet containing the player dossier, current mission projection, concise people and ship projections, Command Bearing, accepted story projection, authoritative current time, the final-footer contract, and authored narration guidance. Hidden objective text is never copied into the player-facing portions of that packet.

Directive installs that packet as one namespaced SillyTavern extension prompt (`directive.campaign.v1`). It never enumerates, filters, rewrites, or clears another extension's prompt entries. VectFox, Summaryception, Memory Books, and similar extensions therefore remain in SillyTavern's normal prompt assembly. The settlement interceptor returns `injectAndContinue` without aborting successful host generation; only an unresolved durable-settlement failure blocks the main call, and it uses the deferred abort form so later extension interceptors still run. An unbound generation boundary always clears the Directive key to prevent campaign context from crossing chats.

Ordinary accepted pairs use one Utility call for mission, time, and every People observation together, followed by SillyTavern's normal main-model generation. Utility is never called per person. If that accepted pair contains one or more valid direct named introductions, one optional Reasoning call authors all initial public dossiers as a batch; failure leaves the minimal name card intact and does not create a per-turn retry loop. A pending Story Settlement checkpoint may add one episode-evaluator Reasoning call for the whole episode and all involved relationships. It never performs a Utility-versus-Reasoning comparison in production. Structured roles disable visible-output retry, and completed interpretation/dossier work is reused after a state-conflict or persistence retry.

The player People projection retains every source-backed defining moment. The narration packet is a separate compact projection containing current identity/relationship state and at most eight recent defining moments globally, so durable history does not make prompts grow without bound.

Accepted-pair identity hashes complete selected assistant and player text and parses the complete assistant response for its time footer before bounding provider prompt text. Replay and reconciliation use complete raw SillyTavern history so selected-swipe custody is preserved; raw history is never included in exported support diagnostics or player-facing prompt projections.

## Accepted story-time interpretation

The existing Utility result classifies time as explicit duration, implicit action, scene transition, no passage, or unresolved. Positive passage requires verbatim evidence from an authorized accepted-pair source. Opening narration is baseline context; only the new player contribution can advance it. Rejected assistant events cannot supply elapsed time. The prompting player text is supplied as context only when its prior time decision is present, so a narration recap can avoid counting that action twice.

Unambiguous supported numeric and word durations are checked for exact conversion. Approximate durations, ranges, clock transitions, and overlapping intervals retain contextual interpretation. Additional immediate action can extend an explicit interval when separately evidenced. Advances above five minutes require enacted duration or transition evidence; this is an evidence threshold, not a fixed reply duration or a clamp. Implicit action remains an estimate grounded in the scene.

Fresh proposals are validated again at clock custody. Invalid or unresolved results cannot silently become permanent zero-time settlements. Persistence retries reuse a valid interpretation; semantic recovery obtains a fresh one. Ordinary continuation accumulates nonnegative whole seconds exactly once. Intentional edits, swipes, deletions, and branch restoration still reconstruct the selected timeline. Existing clock and ledger formats are unchanged, and historical settled decisions are not reinterpreted or caught up. No additional routine model call is introduced.
