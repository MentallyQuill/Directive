# Provider Source

Provider routing, provider settings, response normalization, structured generation, and sanitized diagnostics.

Host-specific generation adapters live under `src/hosts/<host>/`. The SillyTavern current-chat narration provider is owned by `src/hosts/sillytavern/narration-provider.mjs` and consumed through the SillyTavern generation client.

`directive-provider-settings.mjs` owns non-secret Utility/Reasoning lane settings plus per-role provider-lane overrides. Role defaults still come from `src/generation/generation-roles.mjs`; persisted overrides are applied at provider-client call time and surfaced in the Settings provider view.
