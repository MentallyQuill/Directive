# Creator Source

Ashes V1 player-character creation.

- `character-creator-draft.mjs` owns the exact partial draft and accepted-review contract.
- `character-creator-assist.mjs` may propose package-safe field values through the configured provider and falls back to bounded local suggestions when generation is unavailable.

The creator consumes package-owned choices and templates. It does not create campaigns, ships, missions, or imported package formats.
