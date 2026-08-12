# SillyTavern Preset

Directive bundles `presets/sillytavern/directive.json`. Install it from Directive Settings or import it through SillyTavern's Chat Completion preset controls.

The preset supplies Directive's narrative style, player-agency rules, anti-repetition guidance, and response cleanup. Live campaign facts, Stardate, ship time, time-passage guidance, and the visible timestamp footer come from Directive's chat-bound runtime packet, not from static preset text or preset regex.

Settings reports whether the bundled preset is installed and current. Reinstalling replaces the Directive preset record with the bundled version; it does not alter unrelated presets. When a bound Directive campaign chat is open, Directive activates the installed preset before synchronizing campaign context and before each host generation. Leaving for an unrelated chat or disabling Directive restores the preset that was selected before campaign play.

If the preset is missing, install it and refresh status. Directive fails open with the exact campaign context packet if the host cannot activate the preset, so campaign state and ship-time custody remain available; only the bundled narrative style, cleanup, and model-neutral generation defaults are unavailable.
