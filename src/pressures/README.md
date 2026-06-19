# Pressures

Campaign pressures are durable, campaign-owned consequences that can later feed
Open Orders and side assignments. They summarize unresolved ship, crew,
regional, and obligation state in player-facing language while preserving
director-only details for adjudication.

Pressure modules are pure domain logic. Runtime and UI layers may render the
player-facing summaries, but pressure seeding, cooldowns, escalation, and
side-mission candidate selection stay here.
