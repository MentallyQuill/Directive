# SillyTavern Presets

This directory contains SillyTavern prompt preset exports intended for manual import through SillyTavern's prompt preset UI.

Use `directive.json` as the default Directive play preset. It provides the stable Star Trek command-RPG system layer while Directive injects current campaign context through `setExtensionPrompt` at play time.

The preset carries metadata under `extensions.directive` so Directive Settings can detect whether the exact bundled preset is missing, current, or needs replacement.

The preset also bundles SillyTavern regex cleanup under `extensions.regex_scripts` and selectable Pura-style logit bias profiles under top-level `bias_presets`.
