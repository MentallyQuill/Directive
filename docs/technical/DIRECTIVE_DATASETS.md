# Directive V1 datasets

V1 runtime data is intentionally small and exact.

## Campaign package

The campaign package owns campaign identity, opening state, player-character creation, world guardrails, and asset references. It does not contain runtime saves or mutable tracking state.

## Crew dataset

`directive.crewDataset.v1` contains only a manifest and officer records. Each officer has an ID, name, billet, public profile summary, and a bounded narration guide with voice and constraints. Public summaries feed the People projection. Narration guidance is injected only into the campaign prompt packet and never becomes player state.

## Ship dataset

`directive.shipDataset.v1` contains a manifest, a profile with capability summary, narration guidance, and hard facts, and may contain one `directive.shipMechanics.v1` definition. Operational condition still lives in campaign state as `directive.shipOperationalOverview.v1`; it is not copied from package lore or derived from every prose mention.

Ship mechanics are package-authored state ladders, not a mutable tracker. Each system defines ordered states, player-safe causal text, capabilities, constraints, narrative work milestones, and forward transitions. Milestones specify the same bounded interpretation evidence standard used by mission evidence. Later work may remain undiscovered until its authored predecessor is accepted.

Accepted `ship.milestoneCompleted` Story Settlement effects are the only durable repair authority. Current system state, visible work, capabilities, and constraints are derived read-only from those effects. Mission definitions may declare `shipInteractions` that bind a named capability to exact evidence policies and explicit limits. Package loading rejects unknown capability or policy references.

Ashes V1 authors two systems: Systems Integration (`unvalidated -> segmented -> integrated`) and Sensor Calibration (`provisional -> aligned -> validated`). These are campaign content expressed through the universal Ship grammar; another campaign can supply different systems without a bespoke Ship implementation.

## Mission definitions

Mission definitions own authored facts, evidence policies, events, outcomes, objectives, clocks, reports, entry capabilities, closure, dispositions, and transitions. Runtime mission state is created from a definition and then reduced from validated evidence.

## Runtime data

V1 storage contains only `v1/index.v1.json`, V1 creator drafts, V1 saves, and separately stored V1 player portraits. The repository does not scan for or import other layouts.
