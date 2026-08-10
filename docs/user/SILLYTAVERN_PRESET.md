# SillyTavern Preset

Directive bundles `presets/sillytavern/directive.json`. Install it from Directive Settings or import it through SillyTavern's Chat Completion preset controls.

The preset supplies Directive's narrative style, player-agency rules, anti-repetition guidance, and response cleanup. The live campaign facts come from the chat-bound `directive.campaign.v1` prompt packet, not from static preset text.

Settings reports whether the bundled preset is installed and current. Reinstalling replaces the Directive preset record with the bundled version; it does not alter unrelated presets. Perspective hints from a compatible active preset may be respected, while Directive's default keeps narration in second person and never writes the player's private thoughts or final decisions.

If the preset is missing, install it and refresh status. If another preset is selected, Directive still injects exact campaign context, but narrative style and formatting may differ.
