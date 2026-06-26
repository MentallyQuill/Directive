# Pressures

Campaign pressures are durable, campaign-owned consequences that can later feed
Open Orders and side assignments. They summarize unresolved ship, crew,
regional, and obligation state in player-facing language while preserving
director-only details for adjudication.

Pressure modules are pure domain logic. Runtime and UI layers may render the
player-facing summaries, but pressure ledger normalization and deterministic
pressure seeding stay here. Older standalone scoring and cooldown helpers were
retired during the pre-alpha cleanup because no runtime path imported them.
