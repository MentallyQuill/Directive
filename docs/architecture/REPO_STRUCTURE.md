# Repository Structure

## Purpose

Directive uses a Saga-inspired repository scaffold while keeping Directive's domains separate from Saga's loredeck-specific implementation.

Saga's useful pattern is the durable top-level split:

```text
assets/
content/
docs/
src/
styles/
tests/
tools/scripts/
```

Directive adds:

```text
packages/
schemas/
```

because starship packages are first-class data artifacts and need schema contracts before runtime package loading exists.

## Top-Level Ownership

- `assets/`: passive visual and media assets.
- `content/`: authoring-source content that can be normalized into package JSON.
- `docs/`: design, architecture, package, campaign, planning, testing, and source-reference documents.
- `packages/`: normalized starship package records, beginning with bundled Breckenridge/Ashes of Peace.
- `schemas/`: JSON schemas and schema-adjacent contracts.
- `src/`: runtime source code, split by ownership.
- `styles/`: CSS entry files and runtime styling.
- `tests/`: unit, contract, storage, browser, and visual tests.
- `tools/scripts/`: local validation, smoke, audit, and release-gate scripts.

## Source Ownership

The initial `src/` scaffold is:

```text
src/
  extension/
  runtime/
  ui/
  packages/
  creators/
  retrieval/
  directors/
  campaign/
  mission/
  adjudication/
  simulation/
  actors/
  providers/
  generation/
  hosts/
  jobs/
  storage/
  settings/
  theme/
```

These directories match the boundaries in [Source Architecture](SOURCE_ARCHITECTURE.md). They are intentionally present before implementation so new code has an obvious home and does not drift into a monolith.

The dual-host architecture adds host-adapter and sidecar-job directories to the verified shape. That direction is tracked in [Dual Host Support Plan](../planning/DUAL_HOST_SUPPORT_PLAN.md); SillyTavern shell implementation now lives under `src/hosts/sillytavern/`, while `src/extension/` keeps the manifest-facing entrypoint shims and shared extension UI helpers.

## Content And Package Boundary

`content/` is the authoring workspace. It may contain working files for crew dossiers, mission graph drafts, guardrails, and campaign projection notes.

`packages/` is the normalized package-output area. Bundled packages in this directory must validate through the same path as imported and future Creator-made packages.

For the first package:

```text
content/starships/breckenridge/
packages/bundled/breckenridge/
```

## Verification

Run:

```powershell
node tools\scripts\verify-repo-structure.mjs
```

This verifies the expected scaffold directories and ownership READMEs, and rejects Saga-specific runtime folders such as `src/loredecks`.
