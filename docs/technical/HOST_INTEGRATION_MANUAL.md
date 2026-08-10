# Host Integration Manual

Directive's shared runtime depends on a normalized host contract. SillyTavern supplies storage, chat observation, prompt installation, generation access, event subscription, preset management, and the launcher/UI mount. The fake host supplies the same boundaries for deterministic tests.

## SillyTavern lifecycle

On extension load, Directive creates the host, initializes exact V1 storage, loads bundled Ashes assets, mounts the UI, installs the global action bridge and generation interceptor, wires events, and adds the ship launcher beside the composer.

The extension subscribes to chat changes, player messages, message edits, selected-swipe changes, message deletions, generation stops, and extension disable. Player-message handling schedules settlement without blocking SillyTavern's generation. The generation interceptor waits for any pending settlement, installs the current chat-bound V1 prompt, and lets normal host generation continue.

Prompt installation uses the single key `directive.campaign.v1` and refuses to install into a chat other than the save's exact `campaignChatBinding.chatId`. Chat changes clear or restore the packet according to that binding.

Storage maps logical V1 JSON keys into SillyTavern user files. Paths are validated before mapping. No host adapter discovers, translates, or hydrates other Directive file layouts.

Edits, deletions, visibility changes, and selected-swipe changes invalidate source custody, rebuild dependent V1 state, and reinstall prompt context. Generation stop cancels transient activity only; it does not commit prose.

Disabling Directive removes the interceptor, prompt, launcher, overlays, event subscriptions, and global bridge without mutating campaign data.
