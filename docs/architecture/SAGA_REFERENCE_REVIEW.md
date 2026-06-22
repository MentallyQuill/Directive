# Saga Reference Review

## Current Donor Anchor

Reviewed source:

- Repository: `F:/git/Saga`
- Branch: `refactor`
- Commit: `2f7215d0 Removed deck plans`
- Git status at review: clean against `origin/refactor`

## Recommendation

Directive should be built as a clean extension that selectively transplants Saga patterns and small modules. Do not copy the full Saga tree and strip it.

Saga is a valuable donor, but it remains heavily shaped around Loredecks, Lorecards, Context, Continuity, and Saga runtime identifiers. Copying it wholesale would spend early Directive work deleting domain assumptions instead of building the new game model.

## Evidence

Largest Saga files at review:

| File | Lines | Risk |
| --- | ---: | --- |
| `src/runtime/lore-panel.js` | 11787 | Runtime control plane and broad domain orchestration. |
| `src/lorecards/lorecards-panel.js` | 5917 | Lorecard-specific UI and behavior. |
| `src/loredecks/loredeck-library-panel.js` | 5596 | Loredeck Library domain surface. |
| `src/loredecks/loredeck-defaults.js` | 2726 | Bundled Saga content defaults. |
| `src/loredecks/loredeck-creator-panel.js` | 2316 | Deck Maker domain UI. |
| `src/lorecards/lore-generator.js` | 2282 | Lore generation and context-specific orchestration. |

Largest stylesheets:

| File | Lines | Risk |
| --- | ---: | --- |
| `runtime.css` | 6408 | Shell, panels, and domain details are mixed. |
| `review.css` | 2861 | Lorecard/review-specific styling. |
| `settings.css` | 1647 | Large but more bounded. |
| `layout.css` | 1607 | Geometry and mobile shell mixed with product selectors. |

## Reuse As Reference

Reuse concepts and small modules where possible:

- Extension bootstrap and lifecycle patterns.
- Runtime action registry pattern.
- Domain-agnostic generation job runner.
- Provider client patterns and response normalization.
- UI primitive ideas.
- Focus preservation and busy-action patterns.
- Theme token direction.
- Files API wrapper and external storage design.
- State safety, backup, import/export, and diagnostics patterns.
- Visual smoke harness and documentation renderer strategy.
- Documentation organization and release-facing doc discipline.

## Avoid Direct Carryover

Do not carry these directly:

- Saga runtime namespace, global bridge, CSS prefixes, DOM IDs, storage prefixes, or manifest hooks.
- Saga schema v27, migrations, default state, and compatibility baggage.
- Loredeck, Lorecard, Deck Maker, Story Maker, Context, Continuity, and Injection domain surfaces.
- Saga route names and Basic/Advanced tab assumptions.
- Large panel files as starting points.
- Saga bundled content as production data.

## Directive Adaptation

Directive should create new platform-facing modules that borrow Saga's lessons but start with Directive names and state contracts:

- `directive` manifest key and hooks.
- Schema version 1.
- New `Campaign`, `Mission`, `Crew`, `Ship`, `Log`, and `Settings` routes.
- New storage domains for starship packages, campaigns, missions, turn ledgers, themes, and passive assets.
- New prompt composition around authoritative game state and outcome packets.
- New transaction model built before complex mission direction.

