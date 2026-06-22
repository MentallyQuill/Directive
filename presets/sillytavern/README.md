# SillyTavern Presets

This directory contains SillyTavern prompt preset exports intended for manual import through SillyTavern's prompt preset UI.

Use `directive.json` as the default Directive play preset. It provides the stable Star Trek command-RPG system layer while Directive injects current campaign context through `setExtensionPrompt` at play time.

The preset carries metadata under `extensions.directive` so the SillyTavern Settings panel can detect whether the installed preset is missing, current, older, newer, or installed under a legacy name.
