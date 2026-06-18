# Provider Source

Provider routing, provider settings, response normalization, structured generation, and sanitized diagnostics.

`sillytavern-narration-provider.mjs` is the current pre-alpha narrator provider adapter. It calls the active SillyTavern context when `generateRaw`, `generate`, or `generateText` is available, and otherwise reports a provider-unavailable error.
