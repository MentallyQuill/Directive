# SillyTavern Host Adapter

This is Directive V1's production host boundary.

- Chat and lifecycle adapters identify the current chat and accepted message sequence.
- SillyTavern's active main model and normal extension prompt pipeline provide gameplay narration.
- Generation adapters provide only Directive-owned accepted-pair analysis, episode evaluation, and character drafting.
- The prompt adapter injects the single `DIRECTIVE V1 CAMPAIGN CONTEXT` packet.
- The storage adapter maps exact logical V1 keys into SillyTavern user files.
- The launcher mounts the ship icon beside the composer and opens the bounded five-route UI.

This folder must not translate prior Directive formats or maintain alternate state. Unsupported stored data is rejected by the V1 runtime.
