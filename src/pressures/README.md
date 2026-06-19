# Pressures

Campaign pressures are durable, campaign-owned consequences that can later feed
Open Orders and side assignments. They summarize unresolved ship, crew,
regional, and obligation state in player-facing language while preserving
director-only details for adjudication.

Pressure modules are pure domain logic. Runtime and UI layers may render the
player-facing summaries, but pressure seeding, cooldowns, escalation,
side-mission candidate selection, Open Orders candidate review state, scene
activation/beats, and Open Orders assignment resolution/progress state stay
here.
