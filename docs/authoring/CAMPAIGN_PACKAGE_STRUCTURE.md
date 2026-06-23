# Campaign Package Structure

Directive campaign packages normalize to strict data-only JSON package records. Import/export transports use `.directive-campaign.zip`.

## Required Root Spine

Every package must provide:

```text
manifest
ship
crew
characterCreation
world
storyArcs
questTemplates
threadTemplates
reactionRules
directorCards
contextPolicy
guardrails
assets
```

The schema root is `schemas/campaign-package.schema.json`.

## Zip Transport

The import normalizer accepts:

- a filename ending in `.directive-campaign.zip`;
- relative archive paths only;
- exactly one package root JSON payload:
  - `package.json`, or
  - a file ending in `.campaign-package.json`;
- passive supporting files.

The importer rejects:

- path traversal;
- absolute paths;
- scripts;
- HTML;
- executables;
- scriptable SVG;
- WebAssembly;
- invalid JSON;
- ambiguous package root payloads;
- packages whose manifest id does not match an expected id.

## Suggested Archive Layout

```text
my-campaign.directive-campaign.zip
  package.json
  assets/
    campaign-card.png
    ship-hero.png
    crew/
      officer-name.png
  docs/
    author-notes.md
```

Author notes may be retained as passive reference material, but runtime behavior must come from package JSON and validated assets.

## Bundled Layout

Bundled packages live under:

```text
packages/bundled/<package-slug>/
```

The current reference package uses:

```text
packages/bundled/breckenridge/
  ashes-of-peace.campaign-package.json
  ashes-of-peace.campaign-projection.json
  breckenridge-senior-staff.crew-dataset.json
  prelude-a-ship-underway.mission-graph.json
  chapter-1-the-empty-convoy.mission-graph.json
  chapter-2-false-colors.mission-graph.json
```

## Package And Campaign Boundary

Package data:

- can define templates, starting facts, assets, and guardrails;
- should be reusable across playthroughs;
- should not record one player's campaign outcomes.

Campaign state:

- records the player character;
- records mission and quest progress;
- records relationship, crew, ship, thread, world, and command changes;
- owns the turn ledger and Command Log;
- owns save branches and recovery state.

## Validation Commands

```powershell
node tools\scripts\validate-campaign-package.mjs
node tools\scripts\test-campaign-package-importer.mjs
node tools\scripts\test-package-update-diagnostics.mjs
```

Run the alpha gate before promoting a package or docs change into a release-facing checkpoint:

```powershell
node tools\scripts\run-alpha-gate.mjs
```
