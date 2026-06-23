# Campaign Schema Reference

This is the author-facing reference for the required campaign package roots. It summarizes the current schema domains; use the JSON schema files as the final authority for exact field rules.

## Root Schema

Root file: `schemas/campaign-package.schema.json`

Required roots:

| Root | Schema | Authoring Purpose |
| --- | --- | --- |
| `manifest` | `schemas/packages/manifest.schema.json` | Package identity, version, status, source docs, and transport extension. |
| `ship` | `schemas/packages/ship.schema.json` | Starting vessel/station template. |
| `crew` | `schemas/packages/crew.schema.json` | Senior crew and supporting crew package data. |
| `characterCreation` | `schemas/packages/character-creation.schema.json` | Package-owned player officer creation options. |
| `world` | `schemas/world/world.schema.json` | Region, locations, routes, factions, actors, fronts, clocks, and state tracks. |
| `storyArcs` | `schemas/story/story-arcs.schema.json` | Campaign arc structure and progression. |
| `questTemplates` | `schemas/quests/quest-templates.schema.json` | Main, side, standing, and dynamic quest templates. |
| `threadTemplates` | `schemas/threads/thread-templates.schema.json` | Ongoing concern and B-story templates. |
| `reactionRules` | `schemas/reactions/reaction-rules.schema.json` | World/event reaction rules. |
| `directorCards` | `schemas/directors/director-cards.schema.json` | Retrievable guidance for Director, narrator, crew, ship, command, and log contexts. |
| `contextPolicy` | `schemas/generation/context-policy.schema.json` | Prompt-context selection and placement policy. |
| `guardrails` | `schemas/packages/guardrails.schema.json` | Player agency, safety, hidden truth, setting, and narration boundaries. |
| `assets` | `schemas/packages/assets.schema.json` | Passive images and package-owned media references. |

## Manifest

Must identify the package as Directive campaign data.

Important fields:

- `kind`: must be `directive.campaignPackage`;
- `schemaVersion`: current package schema version;
- `id`: stable globally unique package id;
- `slug`: human-readable package slug;
- `title`;
- `version`;
- `status`;
- `bundled`;
- `transportExtension`: `.directive-campaign.zip`;
- `sourceDocuments`.

## Ship

Use this for starting vessel or station data. Include enough information for:

- Campaign package card;
- Ship route;
- prompt context;
- Director reasoning;
- status and repair tracking after projection into campaign state.

## Crew

Use this for player-safe senior staff and supporting crew templates. Keep raw relationship or hidden development values out of normal player-facing copy. Use reveal gates and Director cards for information that should surface later.

## Character Creation

This root should make the player officer setup package-driven. Author fields for:

- identity options;
- service options;
- personality/trait options;
- dossier fields;
- generation assistance;
- fallback text;
- validation requirements.

## World

The world root should make the campaign playable outside one scripted scene. Include locations, routes, factions, actors, fronts, clocks, state tracks, and daily-life texture.

## Story Arcs

Story arcs orient the campaign. They should not be a hardcoded script. Link arcs to quests, fronts, threads, facts, and phases.

## Quest Templates

Quest templates should be stable and id-based. They may reference mission graphs, allowed actors, locations, factions, objectives, outcome rules, and state inheritance policy.

## Thread Templates

Thread templates are for player-visible and hidden ongoing concerns. Define visibility carefully. Hidden and latent threads should not appear in Open Threads until runtime state makes them visible.

## Reaction Rules

Reaction rules should be bounded. Prefer deterministic predicates and explicit effects. If a future rule uses model assistance, keep the model's authority proposal-only.

## Director Cards

Director cards are retrieval units. Author them for specific audiences:

- Mission Director;
- crew;
- ship;
- command;
- narrator;
- Command Log.

Each card should be concise, tagged, visibility-aware, and tied to package ids.

## Context Policy

Context policy tells Directive what to put in prompt blocks. Define what belongs in:

- contract context;
- immediate scene;
- continuity context;
- regional context;
- narrator constraints.

Never route hidden truth into player-safe prompt blocks.

## Guardrails

Guardrails should be actionable. Include:

- no writing for the player;
- hidden truth boundaries;
- failure-forward behavior;
- command authority boundaries;
- setting/canon boundaries;
- tone and narration constraints.

## Assets

Assets should be passive and package-owned. Use stable ids and subject references so UI surfaces can find card, hero, portrait, and fallback images.

## Validation Pressure Points

Before a package is release-facing, check:

- all required roots exist;
- manifest identity and transport are valid;
- package ids match projection, crew dataset, and mission graph records;
- quest references resolve;
- mission graph references resolve;
- hidden information is not in player-facing fields;
- package assets are passive;
- Character Creator can produce a valid player officer draft.
