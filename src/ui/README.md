# UI Source

These modules render the exact V1 player surface. They consume player-safe view models and never analyze prose, call a provider, or create semantic state.

The shell owns the five routes: Campaign, Mission, People, Ship, and Settings. Panels must not duplicate primary information across routes or expose hidden campaign facts.

- Campaign: Ashes selection, disabled campaign previews, player setup, and exact V1 records.
- Mission: revealed mission purpose, objectives, known clocks, and optional commitments.
- People: concise public crew profiles and durable character moments.
- Ship: one aggregated operational picture.
- Settings: provider, preset, tutorial, and state controls.

Route-local expansion and ordering are presentation preferences only. Long content scrolls inside the bounded Directive frame.
