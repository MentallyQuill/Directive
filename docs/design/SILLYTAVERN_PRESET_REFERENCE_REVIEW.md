# SillyTavern Preset Reference Review

This review compares the two strongest reference presets for Directive's bundled SillyTavern preset:

- `F:\git\Wandlight\Presets\Wandlight-1.4.json`
- `F:\git\ST-Wandlight\Reference\Pura's Director Preset 14.0 (SillyTavern).json`

Directive should borrow structure and discipline from both, not their genre content or state-tracking surface.

## Wandlight Preset

What is valuable:

- Stable front-facing preset name with metadata-backed update detection.
- `extensions.wandlight` metadata with `presetName`, `presetVersion`, comparable `version`, and feature flags.
- Timestamp and scene-context discipline that supports fast local context detection.
- Strong knowledge-boundary rules: characters cannot know future events, off-page events, or uncommunicated facts.
- "Fresh Ink Only" and repetition controls that prevent the model from restating the user's input.
- Flexible length and perspective toggles that separate durable rules from user preference.
- A formatting rule that reads a POV variable, with separate `{{setvar::pov::...}}` controls for third-person limited, first-person, and other perspective choices.
- "Rational characters don't assume malice" as a compact anti-caricature rule.

Directive adoption:

- Use stable preset name **Directive** and bundled file `presets/sillytavern/directive.json`.
- Store update metadata under `extensions.directive`.
- Install/update/reinstall through the Settings UI while preserving the active SillyTavern selection where possible.
- Keep the bundled preset campaign and timeline agnostic; named ships, captains, crews, eras, and mission premises belong to package data and Directive-injected prompt blocks.
- Add Wandlight-style POV controls while keeping third-person limited enabled as the default Directive perspective.
- Borrow knowledge-boundary, fresh-content, repetition, and rational-character discipline.
- Translate prose influence into concrete scene rules and anti-patterns instead of relying only on abstract style requests.
- Keep visible scene headers optional for now; Directive already owns active scene, stardate, location, and campaign state through player-safe prompt blocks.

Avoid:

- Harry Potter-specific house logic, wand tells, school timestamp framing, and canon-book chronology.
- Prompt-side assumptions that a preset owns durable state. Directive saves and prompt synchronization own that.

## Pura's Director Preset

What is valuable:

- A strong main role contract: scene architect, character writer, plot instigator, and world simulator.
- One immediate scene beat per output, ending with a concrete hook.
- Character primacy: wants, history, contradiction, and relationship pressure generate plot movement.
- Dialogue as social leverage rather than exposition.
- Material realism: concrete spatial mechanics, objects, sensory sources, and environment as decision pressure.
- Perspective limits and anti-omniscience.
- Top-level SillyTavern `bias_preset_selected` and `bias_presets` packaging for bundled logit-bias profiles.
- Optional trackers for relationships, scene, pending events, status, time, and off-screen activity.
- Named voice toggles that use author names as recognition anchors while storing the operative prose rule in a reusable prompt variable.
- Friction mode as a corrective against automatic agreement.

Directive adoption:

- Add `Directive Scene Rhythm`: one command-relevant scene movement per response, no premature settlement.
- Add `Directive Professional Friction`: role-specific resistance without making everyone hostile.
- Add `Directive Off-Screen Pressure`: absent actors and systems move only from causal parents, with no visible hidden tracker output.
- Add `Directive Prose Lenses`: a hybrid approach that names Becky Chambers for warm shipboard humanism and Arkady Martine for political/cultural pressure, then immediately converts those names into Directive-specific behavior and guardrails.
- Add speech/perception boundaries: typed narration, planning, OOC text, and private inner monologue are not audible scene content; only explicit dialogue, transmissions, observable behavior, records, sensors, established telepathic contact, or in-universe forced telepathic intrusion attempts with method, resistance, risk, limits, and consequences can inform character reactions.
- Add conservative Pura-style logit-bias presets rather than importing the reference lists wholesale. Directive should discourage refusal/meta artifacts, mindreading phrases, stock body-language beats, and sci-fi slop such as ozone-heavy atmosphere cliches without banning ordinary Starfleet apology, system, plasma, or quantum language when those are materially true.
- Keep grounded prose and dialogue-as-action rules close to post-history so they survive chat drift.

Avoid:

- Visible relationship meters, event/status/time trackers, NPC profile sheets, CYOA choices, and hidden HTML state blocks.
- Anything that writes the player's package-defined command character's dialogue, private thoughts, final decision, or selected action.
- Universal "director and narratee" framing that would blur Directive's player/authoritative-state boundary.
- Broad content toggles unrelated to Directive's Starfleet command RPG purpose.
- Direct author pastiche, quotation, catchphrase mimicry, or sentence-level imitation.
- First-person player-character narration as a default; it is too likely to write the player's private thoughts or choices.
- Broad logit-bias entries that suppress common command-RPG vocabulary, ordinary NPC apologies, or legitimate Star Trek technical terms.

## Current Preset Direction

The bundled preset should stay compact enough to coexist with Directive's runtime prompt blocks. It owns durable style and roleplay contract. Directive owns current facts, committed outcomes, hidden-state filtering, prompt rebuilds, and campaign persistence. Campaign packages own named ships, captains, senior staff, eras, factions, mission premises, and local tone deltas.
