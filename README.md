<p align="center">
  <img src="assets/branding/directive-banner.jpg" alt="Directive Starship Command banner">
</p>

# Directive

Directive is a SillyTavern extension for persistent Star Trek-style roleplay.

The project is currently in Alpha. It is changing fast.
Some features will break, and existing behavior can shift between updates.
Play with this in mind and keep local backups when possible.

## What you can play today

Ashes of Peace is the only live campaign.
You play as the executive officer of the U.S.S. Breckenridge with Captain Mara Whitaker and the ship’s senior staff.
Other campaign names may show as previews, but they are not yet playable.

## Fast start

1. Install this repository as a SillyTavern extension and reload the page.
2. Click the ship icon next to the message input.
3. In Settings, install the bundled Directive preset and set the two model lanes.
4. On Campaign, start Ashes of Peace and complete character creation.
5. Chat normally in roleplay prose.

Assistant replies are drafts until you send your next message.
You can swipe through drafts freely.
The draft you accept is the one you send after selecting.

## Main screens

Campaign is where you start and continue games.
Mission shows current goals, known limits, and objective outcomes.
People tracks important contacts and relationship moments.
Ship shows the operational state of the U.S.S. Breckenridge.
Settings covers model lanes, presets, storage checks, and diagnostics.

## Alpha expectations

This is not a stable release yet.
Expect occasional resets, UI shifts, and save edge cases.
If you notice odd behavior, verify the campaign chat binding, refresh Directive, and check Storage in Settings.
If a saved state does not re-open cleanly, use the built-in recovery path in Settings before editing any JSON files manually.

## What not to expect (yet)

Directive V1 does not support migration from old save formats.
There is no command log, thread ledger, sidecar scheduler, or compatibility shim.
Only the active V1 format is supported.

## Documentation

Start with [V1 documentation index](docs/DOCUMENTATION_INDEX.md),
[First Campaign Workflow](docs/user/FIRST_CAMPAIGN_WORKFLOW.md), and [V1 gameplay architecture](docs/architecture/V1_GAMEPLAY_ARCHITECTURE.md) if you want the deeper design.

## Security and providers

Directive is a browser-side SillyTavern extension.
Model calls can use your current SillyTavern model or a connection profile.
Runtime state changes are only applied after deterministic validation.

## Source and license

Creative source docs live in `docs/source/`.
Runtime package data controls what is active while playing.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE](LICENSE).
