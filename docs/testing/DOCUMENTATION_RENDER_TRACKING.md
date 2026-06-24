# Documentation Render Tracking

This is the source-controlled register for documentation render gaps. The live capture process and renderer details remain in [Documentation Render Capture Plan](../planning/DOCUMENTATION_RENDER_CAPTURE_PLAN.md); this file tracks where the docs currently ask for missing visuals.

## Rules

- Place committed documentation PNGs under `assets/documentation/renders/`.
- Keep generated `render-manifest.json`, `render-report.json`, browser profiles, and contact sheets ignored.
- Every missing render should have a structured `directive-render` HTML comment immediately before the visible marker line in the target doc.
- The visible marker line should be searchable and should summarize the needed visual.
- No image should be embedded above native resolution. Use centered, unsized image blocks.

Current captured runtime baseline: 59 PNGs in `assets/documentation/renders/`.

## Current Needed Renders

| Render ID | Source Doc Line | Source | Target Asset | Needed Visual |
| --- | --- | --- | --- | --- |
| `docs-directive-package-asset-fallback` | `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md:332` | fixture or static example | `assets/documentation/renders/docs-directive-package-asset-fallback.png` | Package asset manifest examples and missing-runtime-image fallback behavior. |
| `docs-directive-glass-harbor-authoring-library` | `docs/authoring/GLASS_HARBOR_AUTHORING_REFERENCE.md:74` | fixture | `assets/documentation/renders/docs-directive-glass-harbor-authoring-library.png` | Glass Harbor package detail in Campaign Library for authoring docs. |
| `docs-directive-glass-harbor-authoring-creator` | `docs/authoring/GLASS_HARBOR_AUTHORING_REFERENCE.md:77` | fixture | `assets/documentation/renders/docs-directive-glass-harbor-authoring-creator.png` | Glass Harbor Character Creator review state with Acting Captain role copy. |
| `docs-directive-glass-harbor-authoring-map` | `docs/authoring/GLASS_HARBOR_AUTHORING_REFERENCE.md:80` | static or fixture | `assets/documentation/renders/docs-directive-glass-harbor-authoring-map.png` | Player-safe Nerine Reef map or runtime map/fallback example that excludes Director-only hidden locations. |
| `docs-directive-glass-harbor-library` | `docs/campaigns/GLASS_HARBOR_DROWNED_CONSTELLATION.md:91` | fixture | `assets/documentation/renders/docs-directive-glass-harbor-library.png` | Campaign Library package detail for The Drowned Constellation, including draft status and unresolved asset fallbacks. |
| `docs-directive-glass-harbor-character-creator` | `docs/campaigns/GLASS_HARBOR_DROWNED_CONSTELLATION.md:94` | fixture | `assets/documentation/renders/docs-directive-glass-harbor-character-creator.png` | Glass Harbor Character Creator review state showing the newly promoted XO / Acting Captain role. |
| `docs-directive-glass-harbor-open-world` | `docs/campaigns/GLASS_HARBOR_DROWNED_CONSTELLATION.md:97` | fixture | `assets/documentation/renders/docs-directive-glass-harbor-open-world.png` | Glass Harbor Mission Open World state showing Nerine Reef opportunities without exposing Director-only map data. |
| `docs-directive-glass-harbor-crew` | `docs/campaigns/GLASS_HARBOR_DROWNED_CONSTELLATION.md:100` | fixture | `assets/documentation/renders/docs-directive-glass-harbor-crew.png` | Glass Harbor Crew roster showing intentional portrait fallback or final portraits once assets are authored. |
| `docs-directive-campaign-difficulty-creator` | `docs/design/DIFFICULTY_MODES_CLARITY_REVISION.md:381` | fixture | `assets/documentation/renders/docs-directive-campaign-difficulty-creator.png` | Character Creator review step after the Campaign Difficulty selector and selected-mode summary land. |
| `docs-directive-campaign-difficulty-command` | `docs/design/DIFFICULTY_MODES_CLARITY_REVISION.md:384` | fixture | `assets/documentation/renders/docs-directive-campaign-difficulty-command.png` | Campaign Command in-play difficulty block and change sheet. |
| `docs-directive-campaign-difficulty-confirm` | `docs/design/DIFFICULTY_MODES_CLARITY_REVISION.md:387` | fixture | `assets/documentation/renders/docs-directive-campaign-difficulty-confirm.png` | Exploration-to-Command confirmation and pending-outcome blocked state. |
| `docs-directive-prompt-inspection` | `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md:246` | fixture or diagram | `assets/documentation/renders/docs-directive-prompt-inspection.png` | Sanitized Settings view showing prompt block ids, placement, hashes, and revision without hidden state. |
| `docs-directive-sidecar-proposal-journal` | `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md:276` | fixture or diagram | `assets/documentation/renders/docs-directive-sidecar-proposal-journal.png` | Sidecar-specific proposal journal. |
| `docs-directive-host-specific-surfaces` | `docs/technical/HOST_INTEGRATION_MANUAL.md:119` | live host | `assets/documentation/renders/docs-directive-host-specific-surfaces.png` | SillyTavern launcher, message actions, Directive Assist beside composer, and Lumiverse overlay if materially different. |
| `docs-directive-player-turn-sequence-diagram` | `docs/technical/PLAYER_TURN_SEQUENCE.md:168` | diagram | `assets/documentation/renders/docs-directive-player-turn-sequence-diagram.png` | Designed turn-sequence infographic if the Mermaid diagram is replaced with a static diagram. |
| `docs-directive-edit-delete-recovery` | `docs/technical/STATE_TRANSACTIONS_AND_RECOVERY.md:119` | fixture | `assets/documentation/renders/docs-directive-edit-delete-recovery.png` | Edit/delete recovery and dependent-turn review. |
| `docs-directive-host-launcher` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:26` | live host | `assets/documentation/renders/docs-directive-host-launcher.png` | SillyTavern Extensions menu with Directive launcher. |
| `docs-directive-shell-reset-window` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:94` | live host | `assets/documentation/renders/docs-directive-shell-reset-window.png` | Closed shelf, fullscreen/workspace escalation, and Reset Window host result. |
| `docs-directive-campaign-rebind-live` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:168` | live host | `assets/documentation/renders/docs-directive-campaign-rebind-live.png` | Host-specific Rebind Chat proof and real first-start chat proof outside the runtime fixture matrix. |
| `docs-directive-records-delete-review` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:284` | fixture | `assets/documentation/renders/docs-directive-records-delete-review.png` | Destructive delete confirmation and dependent-turn review modal. |
| `docs-directive-creator-assist-microstates` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:408` | fixture | `assets/documentation/renders/docs-directive-creator-assist-microstates.png` | Section-wand preview/apply/regenerate/dismiss and discard confirmation. |
| `docs-directive-activation-live-proof` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:448` | live host | `assets/documentation/renders/docs-directive-activation-live-proof.png` | Real host chat creation, first intro posted in SillyTavern, and prompt-context installed proof outside the runtime fixture matrix. |
| `docs-directive-mission-terminal-checkpoint` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:581` | fixture | `assets/documentation/renders/docs-directive-mission-terminal-checkpoint.png` | Mission Directive Checkpoint card with Replay From Checkpoint, Push On, Keep This Ending, Save As Branch, and saved-branch-count states. |
| `docs-directive-crew-portrait-microstates` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:697` | fixture | `assets/documentation/renders/docs-directive-crew-portrait-microstates.png` | Portrait import/change/remove microstates and long-bio disclosure variants. |
| `docs-directive-log-search-detail` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:788` | fixture | `assets/documentation/renders/docs-directive-log-search-detail.png` | Search/filter states and expanded detail variant. |
| `docs-directive-assist-composer` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:820` | live host | `assets/documentation/renders/docs-directive-assist-composer.png` | Assist menu, Brief Me result, order/report draft, Apply to Chat before/after, provider fallback, and disabled/no-active-campaign state beside the real composer. |
| `docs-directive-settings-safety-results` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:969` | fixture | `assets/documentation/renders/docs-directive-settings-safety-results.png` | Action-result variants for every Safety operation. |
| `docs-directive-sillytavern-host-surfaces` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:1010` | live host | `assets/documentation/renders/docs-directive-sillytavern-host-surfaces.png` | Extensions menu, Reset Window result, Assist beside host controls, message actions overflow, preset status card, and live send row. |
| `docs-directive-lumiverse-host-surfaces` | `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:1028` | live host | `assets/documentation/renders/docs-directive-lumiverse-host-surfaces.png` | App overlay, launcher tab, permission/status view, prompt dry-run or interceptor proof, and storage diagnostics if documenting host differences. |

## Verification

Use these checks after editing render markers:

```powershell
rg -n "Render needed:" README.md docs --glob "*.md" --glob "!docs/testing/DOCUMENTATION_RENDER_TRACKING.md"
rg -n "directive-render" README.md docs --glob "*.md" --glob "!docs/testing/DOCUMENTATION_RENDER_TRACKING.md"
```

The first command should list visible render markers. The second should list the structured marker comments. For each visible marker, there should be one nearby structured comment with a stable render id, status, source, target asset, and this tracking file path.

Use this image-reference check after embedding newly captured renders:

```powershell
node -e "const fs=require('fs'),path=require('path');const roots=['README.md','docs'];const missing=[];const imgTag=new RegExp('<'+'img src=\"([^\"]+)\"','g');function walk(p){const s=fs.statSync(p);if(s.isDirectory())for(const e of fs.readdirSync(p))walk(path.join(p,e));else if(p.endsWith('.md'))scan(p)}function scan(f){const t=fs.readFileSync(f,'utf8');for(const m of t.matchAll(imgTag)){const target=path.resolve(path.dirname(f),m[1]);if(!fs.existsSync(target))missing.push(`${f}: ${m[1]}`)}}for(const r of roots)walk(r);if(missing.length){console.error(missing.join('\\n'));process.exit(1)}console.log('ok')"
```
