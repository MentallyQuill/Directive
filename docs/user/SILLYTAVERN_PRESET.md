# SillyTavern Preset

# SillyTavern Preset

Directive includes one bundled preset at `presets/sillytavern/directive.json`.
Install or refresh it from Directive Settings, or import it from SillyTavern’s preset controls.

This preset gives Directive its tone and formatting preferences:

Narrative style.
Player-agency direction.
Anti-repetition behavior.
Reply cleanup behavior.

Campaign data itself does not come from the preset.
Live mission facts, Stardate, elapsed ship time, time-passage hints, and footer time stamps come from Directive runtime state.

Settings always shows whether the bundled preset is installed and current.
Reinstalling only updates the bundled preset entry and leaves unrelated SillyTavern presets untouched.

When you enter a bound Directive campaign, Directive activates the installed preset before each generation.
If you leave that chat or disable Directive, your previous SillyTavern preset is restored.

If the preset is missing, install it and refresh status.
Directive still keeps campaign and ship-time state, but you lose the bundled narrative defaults.
