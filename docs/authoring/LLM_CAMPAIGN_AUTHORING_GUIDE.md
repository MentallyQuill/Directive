# LLM Campaign Authoring Guide

Use this compact handoff when asking a model to draft or revise a Directive campaign package.

## Goal

Generate or revise data-only Directive campaign package material. The output must support validation and runtime use. Do not write prose-only lore that cannot map to package roots.

## Required Roots

The campaign package must include:

```text
manifest
ship
crew
characterCreation
world
storyArcs
endConditions
questTemplates
threadTemplates
reactionRules
directorCards
contextPolicy
guardrails
assets
```

End conditions are a required package root. Include authored completions, terminal candidates, checkpoint policy, continuation frames, final-band rules, ending-axis effects, and player-safe recovery copy in `endConditions`.

## Non-Negotiable Rules

- Do not write for the player character.
- Do not expose hidden truth in player-facing summaries.
- Do not make narration the source of campaign state.
- Do not invent executable package content.
- Do not use active file types or scriptable assets.
- Do not create package roots outside the current schema.
- Do not create hard game-over traps. End conditions should offer checkpoint replay and, where plausible, a Push On continuation.
- Keep ids stable, lowercase, and package-local where possible.
- Link records by ids, not by prose names alone.

## Recommended Prompt Shape

```text
You are drafting Directive campaign package data.

Campaign premise:
<short premise>

Player role:
<role, authority, constraints>

Required output:
Return JSON-ready package sections for:
- manifest
- ship
- crew
- characterCreation
- world
- storyArcs
- endConditions
- questTemplates
- threadTemplates
- reactionRules
- directorCards
- contextPolicy
- guardrails
- assets

Constraints:
- data-only
- no hidden truth in player-facing fields
- no writing for the player
- every quest/thread/reaction/director card uses stable ids
- every hidden item has explicit visibility or reveal policy
- end conditions include checkpoint replay, Push On policy, final-band mapping, and player-safe recovery copy
- include validation notes for unresolved assumptions
```

## Revision Prompt Shape

```text
Revise the provided Directive package section.

Keep:
- existing ids unless explicitly told to rename;
- package/save boundary;
- player-safe hidden-state separation;
- schema root names;
- source-document provenance.

Fix:
<specific validation or design problem>

Return:
- revised JSON fragment;
- changed ids;
- migration risk if an existing save could reference old ids;
- validation checks to run.
```

## Output Review Checklist

- Are all required roots present?
- Are player-facing and Director-only fields separated?
- Are ids stable and referenced consistently?
- Are quests tied to world, actors, locations, factions, arcs, or mission graphs?
- Are end conditions fair, checkpoint-backed, and explicit about Push On versus true campaign conclusion?
- Are thread visibility rules clear?
- Are reaction rules bounded?
- Are Director cards audience-labeled?
- Does context policy exclude hidden state?
- Are guardrails usable by runtime prompt context?
- Are assets passive?

## Validation Commands

```powershell
node tools\scripts\validate-campaign-package.mjs schemas\campaign-package.schema.json <package-json-path>
node tools\scripts\test-campaign-package-importer.mjs
```
