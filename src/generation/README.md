# Generation

This folder contains the V1 model-call boundary.

- `generation-roles.mjs` defines the supported narration and Story Settlement roles.
- `hidden-truth-safety.mjs` prevents player-facing narration from receiving hidden campaign facts.

Mission progression is not inferred here. Story Settlement proposes closed candidates; the mission validator and reducer decide what may commit.
