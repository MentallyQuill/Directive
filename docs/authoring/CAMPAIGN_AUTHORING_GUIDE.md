# V1 Campaign Authoring Guide

## Start with the story

Write the campaign's dramatic question, player role, recurring cast, world constraints, and mission sequence before writing trackers. A mission definition should encode only facts and decisions that must remain reliable across prose variation.

## Author a mission as a rule graph

1. Define the visible mission promise in `playerText`.
2. List world facts and mark what is initially known, discoverable, or hidden.
3. Create evidence policies for the exact disclosures, events, outcomes, and decisions that matter.
4. Define required, optional, and conditional objectives independently of display order.
5. Define outcome dimensions for partial success, costs, handoffs, and informed failure.
6. Add clocks only when time materially changes choices; author start, visibility, resolution, expiry, and consequence rules.
7. Give important discoveries at least one fair report or crew-delivery route.
8. Define `closeWhen`, terminal dispositions, and the next transition.
9. Add `mustNarrate` and `mustNotReveal` guidance for the transition.

Evidence guidance should describe meaning, not keywords. State what accepted prose must clearly establish and what near-misses do not count. This lets the model recognize varied play while deterministic code preserves authority.

## Avoid tracking spam

Do not create a fact, objective, ship condition, character moment, or outcome for every colorful detail. Ask whether later scenes must reliably know it, whether player choice depends on it, and whether it changes authored state. A conversation normally contributes to one active episode; it should not become several UI rows.

## Author fair optionality

Optional content may improve outcomes, preserve evidence, create future setup, or earn Command Bearing. It must not secretly punish a player who never learned it existed. When a discovery is important, author an in-world character capable of surfacing it.

Command Bearing awards are explicit mission data. Each award names one optional objective, the creditable terminal dispositions, and a short player-facing reason. A mission may award at most one point per optional objective. Routine required progress, sentiment, and model judgment never create awards.

## Certify

Every V1-native campaign must pass schema/contract validation, graph reachability, spoiler linting, scenario matrices, accepted-pair source mutation, projection checks, prompt safety, storage restart, and a live SillyTavern playthrough. V1 currently certifies only Ashes of Peace.
