# SillyTavern Preset

Directive includes an importable SillyTavern prompt preset at:

```text
presets/sillytavern/directive.json
```

Use it as the stable play-time prompt layer for Directive campaigns. It is not a campaign package and it is not a replacement for Directive prompt synchronization. The preset defines the durable Star Trek command-RPG posture, while Directive injects current campaign facts through its SillyTavern prompt adapter.

## Install Or Update

1. Open SillyTavern.
2. Open **Extensions > Directive**.
3. Open **Settings > Providers**.
4. Use the **Directive Preset** card above provider routing to install, update, reinstall, or refresh the preset status.
5. Select the installed **Directive** preset manually in SillyTavern before starting or resuming a Directive campaign chat.
6. Keep Directive enabled so the campaign prompt blocks can be installed into the bound campaign chat.

The installer saves the preset under the stable SillyTavern preset name **Directive**. It does not intentionally switch the active SillyTavern preset; if SillyTavern briefly changes selection while saving, Directive attempts to restore the previous selection and asks you to verify it before generating.

Campaign intro generation reads the selected preset only when that preset is Directive-compatible: the bundled **Directive** preset, a legacy Directive preset name, Directive metadata, or active `directive_pov` controls with the Directive player-agency prompt. If the active preset is unrelated, the intro ignores it and uses Directive's default third-person limited external perspective.

## Version Metadata

The bundled preset stores update metadata under `extensions.directive`:

```json
{
  "presetName": "Directive",
  "presetVersion": "Directive-0.1.0-pre-alpha.4",
  "version": "0.1.0",
  "metadataSchema": 1,
  "bundledPreset": true
}
```

Directive compares that metadata against the installed SillyTavern preset and reports missing, current, update available, version unknown, newer installed, or legacy-name states.

## What The Preset Owns

- The stable Directive play contract: the player controls their package-defined command character; the model writes the crew, ship or station, NPCs, world, and consequences.
- Default third-person limited narration plus optional POV controls modeled after Wandlight's preset toggles.
- Starfleet command framing: authority boundaries, professional competence, duty, risk, and persistent consequence.
- Star Trek constraints: canon-adjacent play, package-defined era limits, technology limits, and no unsupported future knowledge.
- Generic crew agency and role-based voice fallback when package, character-card, or Directive-injected crew data is thin.
- Hybrid prose lenses for warm shipboard scenes and diplomatic pressure scenes, using named author anchors only as recognition cues.
- Anti-omniscience, anti-echo, grounded prose, and post-history reinforcement.

## What Directive Still Owns

- Current campaign frame.
- Player character, command role, chain of command, active vessel or station, current era, and active ship state.
- Known facts, formal objectives, active scene, crew context, Command Log continuity, pressures, and narrator constraints.
- Named ships, captains, senior staff, factions, mission premises, local politics, and campaign-specific tone deltas.
- Hidden state filtering.
- Committed outcomes and mechanics-first recovery.
- Prompt rebuild, clear, inspection, and chat-switch suspension.

## Reference Review

The preset was designed after reviewing the local reference presets in `F:\git\ST-Wandlight\Reference`.

Useful patterns adopted:

- Modular prompt sections that can be ordered in SillyTavern.
- A strong main role contract.
- Character agency and social friction without making every NPC hostile.
- Anti-omniscient knowledge boundaries.
- Concrete prose and post-history reinforcement.
- Wandlight-style POV controls with third-person limited enabled by default.
- Hybrid named-anchor prose lenses that translate author recognition into Directive-specific scene function rather than direct imitation.
- Anti-echo rules that prevent paraphrasing the player's last input.
- A low-depth agency rule that only `{{user}}` speaks, acts, decides, and thinks for the player's command character unless explicitly told otherwise.
- Off-screen pressure as an internal scene principle.
- Wandlight-style metadata-backed update detection and stable preset naming.

Patterns intentionally excluded:

- Hidden HTML trackers and visible relationship/status meters.
- CYOA menus, dice rolls, HP combat, and required option lists.
- NSFW toggles and unrelated content policy overrides.
- Instructions that write the player's dialogue, actions, or thoughts.
- Prompt-side durable state tracking that would conflict with Directive saves.

See [SillyTavern Preset Reference Review](../design/SILLYTAVERN_PRESET_REFERENCE_REVIEW.md) for the closer Wandlight and Pura comparison.

## Placement Notes

The preset keeps SillyTavern's normal placeholder sections enabled: World Info, persona, character description, personality, scenario, dialogue examples, and chat history. Directive's extension prompt blocks are installed separately through `setExtensionPrompt`, so they do not appear as ordinary preset entries.

The final `Directive Post-History Reinforcement` entry is placed after chat history to restate the rules most likely to drift during play: continue with new content, preserve committed outcomes, do not write for the player, do not expose hidden state, and leave a command-relevant opening.
