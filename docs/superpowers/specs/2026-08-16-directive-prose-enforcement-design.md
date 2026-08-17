# Directive Prose Enforcement Design

## Goal

Replace Directive's broad grounded-prose guidance with a compact, post-history anti-slop layer modeled on Wandlight's prose enforcement and tuned for Star Trek command play. Cover common structural, atmospheric, somatic, dialogue, and science-fiction prose habits without adding a large token burden or model-specific behavior.

## Scope

- Retain the stable `directive-grounded-prose` identifier so existing imported-preset structure remains compatible.
- Rename the visible block to `Directive Prose Enforcement`.
- Move the enabled block immediately after `chatHistory` and before `directive-post-history` in the selected prompt order.
- Replace the current prose content rather than stacking a second anti-slop prompt.
- Keep the replacement at or below 350 words.
- Preserve the current logit-bias profiles and regex cleanup unchanged.
- Apply the prose rules to narration and NPC dialogue while preserving deliberate character voice, literal operational negation, and technically meaningful terminology.

## Enforcement Model

The block follows Wandlight's compact pattern: name the failure family, show the intended replacement behavior, and finish with fresh-content and voice-isolation rules.

### Banned constructions

Cover rhetorical correction and negative reframing, hollow atmosphere, unnamed feelings, theatrical fragments, rule-of-three emphasis, mouth choreography, generic body reactions, poetic scene closure, echoing, and paraphrase-led openings.

### Star Trek and science-fiction tuning

Reject decorative technobabble and stock starship atmosphere: unexplained ozone or ionized air, generic subspace hums, holographic shimmer, quantum terminology without a measurement, the ship holding its breath, crews moving as one, and abstract invocations of the weight of command. Technical language remains valid when a sensor reading, diagnosis, system failure, scientific claim, or concrete action supports it.

### Command-scene tuning

Avoid automatic awe, instant respect, approving bridge-wide reactions, professional masks slipping on cue, and narration that explains the moral significance of an officer's action after already showing it. Character disagreement, refusal, correction, and literal negative statements remain available when the scene requires them.

### Positive replacements

Prefer direct statements, specific dialogue, instrument readings, reports, object handling, spatial changes, visible professional conduct, and concrete consequences. Use history for factual continuity and established character voice, not repeated narrator templates.

## Versioning and Compatibility

Increment the bundled preset version from `Directive-0.1.0-pre-alpha.12` to `Directive-0.1.0-pre-alpha.13` in both the preset metadata and `DIRECTIVE_PRESET_VERSION`. Existing installs will then be correctly reported as needing replacement through the current preset-manager lifecycle.

## Verification

- Add focused preset-manager assertions for the new name, post-history placement, compact word budget, core anti-pattern families, positive replacement guidance, and version.
- Verify the focused test fails before modifying the preset.
- Run the focused test after implementation.
- Parse the JSON, run `git diff --check`, and run the full `npm.cmd test` alpha gate.
- Stage only the preset, preset-manager constant, focused test, and approved design/plan documents. Never stage `debug.log`.
