# Interface Redesign Integration Prep

> **Historical authority note:** This document records the June 2026 redesign handoff and its then-current seam map. The approved production routes are Campaign, Mission, People, Ship, and Settings. Where this document mentions Crew, Log, the compact shell, old stage counts, donor archives, or an older route order, the living [expanded interface contract](../design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md) supersedes it.

## Purpose

This document reviews the `Directive-interface-redesign.zip` handoff provided on 2026-06-20 and prepares it for integration into the current Directive repo.

The handoff is visually valuable and directionally aligned with Directive's LCARS-first, UX-first, bottom-navigation runtime direction. It is not safe to import wholesale. Treat it as a concept-led source bundle that must be adapted into the current Stage 46 runtime, package, and dual-host codebase.

## Reviewed Source

Local review source:

- Archive: `C:/Users/Keptin/Downloads/Directive-interface-redesign.zip`
- Extracted review copy: `C:/Users/Keptin/AppData/Local/Temp/directive-interface-redesign-review-20260620/Directive-main`
- Review manifest: `artifacts/interface-redesign-2026-06-20/MANIFEST.md`

The archive is a full repo-shaped bundle, not a narrow patch. It contains runtime source, host source, package/content records, docs, tools, tests, generated assets, preview tools, and rendered review screenshots.

## Review Verdict

The redesign should be integrated selectively.

Strong material to bring forward:

- LCARS command-console direction with stronger structural geometry.
- Persistent bottom route shelf on mobile and desktop.
- Removal of tab-history Back behavior from primary route navigation.
- Compact, readable text scale and labels.
- Package art and crew portrait framing as operational context rather than marketing decoration.
- Lumiverse parity work that follows the same route order and visual grammar.
- New visual bible material that makes the shell hierarchy explicit.

Material that must not be copied directly:

- Full `src/` replacement.
- Full `styles/directive.css` replacement without route-by-route verification.
- Full `src/hosts/lumiverse/frontend.js` replacement before host parity checks.
- Full `tools/scripts/` replacement.
- Full `docs/testing/TESTING_STRATEGY.md` replacement.
- Full package/content replacement under the renamed `breckenridge` paths.
- The archive's `run-alpha-gate.mjs`, which is behind the current repo gate.

## Current-State Mismatch

The archive reports:

- `node tools/scripts/run-alpha-gate.mjs` passed 71 checks.
- Responsive screenshot review at 390 px, 768 px, and 1440 px.
- Shared runtime renders and Lumiverse renders under `artifacts/interface-redesign-2026-06-20/`.

The current repo reports:

- The alpha gate is a 72-check suite.
- Stage 46 Chapter 2 Quiet Channels continuity is present and must remain covered.
- The bundled package path is `packages/bundled/breckenridge`.
- The authoring content path is `content/campaigns/breckenridge`.

This means the redesign bundle predates the current runtime and package state. Its UI ideas can be imported; its repo state cannot replace the current repo.

## Canonical Package Identity

`Breckenridge` is the repo-wide canonical package identity. UI integration must preserve that spelling across visible text, package ids, actor ids, asset ids, content paths, save metadata, tests, fixtures, docs, and runtime output.

In-character dialogue and authored flavor text may use **the Breck** as a casual nickname for the ship when the speaker's voice supports it. Do not use the nickname for ids, paths, labels, headings, package metadata, tests, fixtures, or formal system copy.

Default integration posture:

- Preserve `Breckenridge` / `breckenridge` during UI integration.
- Reject any imported code, fixture, doc, or generated asset metadata that reintroduces an alternate spelling.
- Treat a case-insensitive repo search for the old spelling as a required verification step before declaring the UI redesign integrated.

## Candidate Files To Adapt

High-value candidates:

| Bundle file | Integration value | Required handling |
|---|---|---|
| `docs/design/DIRECTIVE_INTERFACE_DESIGN_BIBLE.md` | Strong canonical interface direction. | Merge with or promote alongside `docs/design/LCARS_VISUAL_IDENTITY.md`; avoid contradictory visual authority. |
| `docs/design/reference-concepts/*` | Useful selected concept targets. | Import only chosen reference outputs and document them as visual targets, not runtime evidence. |
| `src/ui/directive-media.js` | Clean package-image frame helper. | Adapt to current package image resolver and asset paths. |
| `src/ui/directive-compact-shell.js` | Bottom shelf and route shell direction. | Cherry-pick shell structure while preserving current route contracts and tests. |
| `src/ui/runtime-ui-kit.js` | Shared LCARS primitives and icons. | Diff carefully; avoid broad helper churn unless needed by route panels. |
| `src/ui/campaign-panel.js` | Strongest first route target: package identity and launch action. | Integrate first after shell foundation. |
| `src/ui/crew-panel.js` | Portrait roster and selected-officer detail. | Integrate after media resolver and package assets are stable. |
| `src/ui/ship-panel.js` | Operational ship hero and readiness panels. | Integrate with package-image support. |
| `src/ui/mission-panel.js` | Active mission, state tiles, route-local navigation, XO intent. | Integrate after Campaign/Crew/Ship because it touches the core play loop. |
| `src/ui/command-log-panel.js` | Records/log layout. | Preserve current Command Log data rules and hidden-state boundaries. |
| `src/ui/settings-panel.js` | Safety/system controls layout. | Preserve existing settings behavior and host capability reporting. |
| `src/ui/character-creator-panel.js` | Command bar and creator flow polish. | Preserve current creator validation and Back semantics within the creator workflow only. |
| `styles/directive.css` | Main visual system payload. | Extract LCARS shell/media/route classes by slice; verify phone width after each route. |
| `src/hosts/lumiverse/frontend.js` | Host parity direction. | Rebase after shared UI stabilizes; do not regress current Lumiverse generation/storage/tool contracts. |

## Do Not Copy Whole

These areas are explicitly excluded from direct import:

- `packages/bundled/breckenridge/*`
- `content/campaigns/breckenridge/*`
- `tools/scripts/run-alpha-gate.mjs`
- `tools/scripts/test-*` as a bulk replacement
- `docs/testing/TESTING_STRATEGY.md`
- `src/runtime/*`
- `src/mission/*`
- `src/hosts/lumiverse/backend.js`
- generated preview tooling unless it is deliberately adopted as a maintained visual-smoke tool

The redesign archive includes backend/runtime/test/docs changes that are outside the UI objective and older than the current Chapter 2 state.

## Integration Phases

### Phase 1: Documentation And Visual Targets

Goal: preserve the visual direction without touching runtime behavior.

Actions:

- Import or merge the design bible language into the active visual authority.
- Add selected reference concept outputs under a repo-owned design/reference location.
- Update `docs/DOCUMENTATION_INDEX.md`.
- Keep older `docs/design/visual-targets/` material as iteration history unless explicitly superseded.

Verification:

- `node tools\scripts\verify-repo-structure.mjs`
- Markdown link check if available.

### Phase 2: Media Foundation

Goal: make package images usable by route panels without hardcoded package-specific filenames.

Actions:

- Adapt `src/ui/directive-media.js`.
- Preserve `src/packages/package-image-resolver.mjs` behavior.
- Add only package-owned image assets that are referenced by current package metadata.
- Keep placeholder behavior for missing images.

Verification:

- `node tools\scripts\test-visual-system-foundation.mjs`
- Search for hardcoded package-image filenames in UI helpers.

### Phase 3: Shared Shell And LCARS CSS

Goal: establish the shared LCARS shell geometry and phone-width bottom route fallback before changing route content.

Actions:

- Adapt the compact shell structure from the bundle.
- Preserve direct route selection.
- Do not reintroduce tab-history Back.
- Move only the CSS required by shell, command shelf, media frames, LCARS panels, and stable route layout.

Verification:

- `node tools\scripts\test-extension-shell.mjs`
- `node tools\scripts\test-visual-system-foundation.mjs`
- Search for `routeHistory`, `navigateBack`, `directive-mobile-can-go-back`, and `[data-mobile-shell-action="back"]`.

### Phase 4: Route Panels One At A Time

Goal: integrate the redesign without masking regressions.

Recommended order:

1. Campaign: proves package identity, launch action, records import, and bottom shelf.
2. Crew: proves portrait media, roster density, selected-officer details, and hidden relationship boundaries.
3. Ship: proves operational hero, readiness, restrictions, and technical-debt text fit.
4. Mission: proves active mission command, XO intent, route-local tabs, recovery, and side work.
5. Command Log: proves records/log density and generated/assisted summary boundaries.
6. Settings: proves state safety, host capabilities, diagnostics, and Provider Assist state.
7. Character Creator: proves command bar, step flow, validation, save/begin behavior, and creator-local Back only.

Verification after each route:

- Focused route/unit test if one exists.
- `node tools\scripts\test-runtime-shell-creator-flow.mjs` when Character Creator or shell actions change.
- Phone-width visual smoke at 390 px.
- Desktop visual smoke at 1440 px.
- Manual screenshot comparison against the selected concept target.

### Phase 5: Lumiverse Parity

Goal: apply the same shell and route hierarchy to Lumiverse without regressing host contracts.

Actions:

- Rebase Lumiverse frontend changes after shared UI is stable.
- Preserve current generation, storage, tool, and prompt-block contracts.
- Keep no-generation deterministic flows as default smoke coverage.

Verification:

- `node tools\scripts\test-lumiverse-entrypoints.mjs`
- `node tools\scripts\test-dual-host-scaffold.mjs`
- Lumiverse desktop and phone screenshots.

### Phase 6: Full Gate

Goal: prove the redesigned UI did not regress current runtime capability.

Required before declaring the redesign integrated:

- `node tools\scripts\run-alpha-gate.mjs`
- Current 72-check gate still passes.
- Stage 46 Quiet Channels continuity still passes.
- No tab-history Back control is visible in the route shell.
- SillyTavern and Lumiverse smoke paths still use the same route vocabulary.
- 390 px, 768 px, and 1440 px screenshots show no global overflow, clipped route labels, or overlapping controls.

## First Recommended Slice

Start with a narrow integration branch:

1. Add the interface design bible or merge its stronger sections into the active LCARS visual identity doc.
2. Import selected reference concept outputs as visual targets.
3. Adapt `src/ui/directive-media.js` if it is needed by the first runtime slice.
4. Integrate the Campaign route visual redesign with the current package spelling and current package data.
5. Run shell, visual foundation, dual-host scaffold, and alpha gate checks.

This gives Directive the new art direction and the highest-value first screen without risking the full runtime all at once.

## Agent-0 Coordination Notes

Agent-0 should own integration sequencing and shared-file freezes for:

- `styles/directive.css`
- `src/ui/directive-compact-shell.js`
- `src/ui/runtime-ui-kit.js`
- `src/ui/directive-media.js`
- `src/hosts/lumiverse/frontend.js`
- `docs/design/LCARS_VISUAL_IDENTITY.md`
- any promoted interface design bible

Worker agents may take route panels only after Agent-0 freezes the shared shell/CSS contract for that slice. If a worker needs shared CSS or shell changes, it must hand off the requested selector/API change instead of editing shared files independently.

## Acceptance Standard

The redesign is integration-ready only when the live app, not only the concept renders, satisfies these conditions:

- It reads as LCARS at a glance through structure, not only color.
- It remains easier to use than the older UI.
- It preserves bottom route navigation.
- It does not expose tab-history Back navigation.
- It preserves hidden-state and player-safe wording boundaries.
- It works in both SillyTavern and Lumiverse.
- It passes the current alpha gate, not the archive's older gate.
