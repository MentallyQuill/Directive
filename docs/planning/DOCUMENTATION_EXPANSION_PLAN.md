# Documentation Expansion Plan

## Purpose

Directive needs a Saga-style documentation system with a high-level README that routes readers into deeper, current-state docs. This plan breaks the documentation expansion into staged work so the public docs, operator docs, technical manual, and campaign authoring manual can be built from the same verified product contract.

Directive is still pre-alpha. Documentation should describe the best current contract, update stale material in place, and avoid preserving legacy explanations that no longer match the extension.

## Core Documentation Goals

1. Make the README the public front door, not the complete manual.
2. Make `docs/DOCUMENTATION_INDEX.md` the complete navigable map.
3. Expand the Operator's Manual into the practical surface-by-surface guide.
4. Add a Technical Manual that explains how Directive actually works behind the curtain.
5. Add a Campaign Authoring Guide that is deep enough for a new campaign package author to build, validate, and ship a Directive campaign.
6. Anchor every claim to current code, current package data, current screenshots/renders, and current verification commands.

## Source Baseline

The expansion should start from these existing documents:

- [README](../../README.md)
- [Documentation Index](../DOCUMENTATION_INDEX.md)
- [First Campaign Workflow](../user/FIRST_CAMPAIGN_WORKFLOW.md)
- [Directive Operator Manual](../user/DIRECTIVE_OPERATOR_MANUAL.md)
- [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md)
- [Chat-Native Runtime Architecture](../architecture/CHAT_NATIVE_RUNTIME.md)
- [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md)
- [Mission Director Contracts](../architecture/MISSION_DIRECTOR_CONTRACTS.md)
- [Open-World Campaign Architecture](../architecture/OPEN_WORLD_CAMPAIGN_ARCHITECTURE.md)
- [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)
- [Turn Transactions](../architecture/TURN_TRANSACTIONS.md)
- [Campaign Package Model](../packages/CAMPAIGN_PACKAGE_MODEL.md)
- [Campaign Package Schema](../packages/CAMPAIGN_PACKAGE_SCHEMA.md)
- [Ashes Of Peace Campaign](../campaigns/ASHES_OF_PEACE_CAMPAIGN.md)
- [Testing Strategy](../testing/TESTING_STRATEGY.md)

## Stage 0: Current-State Inventory

### Objective

Build a current source-of-truth inventory before writing public prose.

### Work

- Audit current README links, docs index entries, user docs, architecture docs, package docs, and planning docs.
- Inventory current runtime surfaces: Campaign, Character Creator, Mission, Crew, Ship, Log, Settings, Assist, Records, package import, save/load, and recovery.
- Inventory current technical seams: host adapters, storage adapters, prompt injection, generation routing, provider settings, turn classification, Director turn creation, state transactions, sidecars, model-call journal, prompt context, and message reconciliation.
- Inventory current campaign-authoring seams: package schema, bundled Breckenridge/Ashes package, content source folders, validation scripts, package import diagnostics, and asset handling.

### Outputs

- A working documentation map for the expansion.
- A list of stale docs or sections that should be rewritten in place.
- A list of screenshots/renders required before finalizing user-facing docs.

### Verification

- `rg --files -g "*.md"`
- `node tools\scripts\verify-repo-structure.mjs`

## Stage 1: Documentation Architecture

### Objective

Create the durable table of contents before expanding the large docs.

### Work

- Update [README](../../README.md) to keep only high-level orientation and route readers into the detailed manuals.
- Update [Documentation Index](../DOCUMENTATION_INDEX.md) to separate Release Notes, User Guides, Campaign Authoring, Technical Manual, Architecture, Package Reference, Testing, Development, Planning, Legal, and Source Briefs.
- Decide final homes for the new manuals:
  - `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md`
  - `docs/technical/PLAYER_TURN_SEQUENCE.md`
  - `docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md`
  - `docs/technical/STATE_TRANSACTIONS_AND_RECOVERY.md`
  - `docs/technical/HOST_INTEGRATION_MANUAL.md`
  - `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md`
  - `docs/authoring/CAMPAIGN_PACKAGE_STRUCTURE.md`
  - `docs/authoring/CAMPAIGN_SCHEMA_REFERENCE.md`
  - `docs/authoring/LLM_CAMPAIGN_AUTHORING_GUIDE.md`
  - `docs/authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md`
- Keep existing architecture/package/design docs as source-specific references unless they are clearly obsolete.

### Outputs

- Updated README documentation table.
- Updated docs index.
- Empty or stubbed manual files only if the next stage needs stable link targets.

### Verification

- Manual link review.
- `node tools\scripts\verify-repo-structure.mjs`

## Stage 2: Render And Evidence Capture

### Objective

Capture the visual evidence required to write accurate manuals and avoid screenshot-backed docs that describe stale UI.

Use [Documentation Render Capture Plan](DOCUMENTATION_RENDER_CAPTURE_PLAN.md) as the working inventory for the live SillyTavern renderer, verified capture IDs, documentation-grade cleanup, and remaining fixture states.

### Render Rules

- Capture real Directive surfaces, not decorative mockups.
- Capture desktop and phone-width variants when layout or operation changes materially.
- Prefer current SillyTavern renders for the Operator's Manual because that is the primary pre-alpha host.
- Capture Lumiverse only where host behavior differs or where the Lumiverse install/smoke docs need proof.
- Store working captures under `artifacts/documentation-renders/<date>/`.
- Promote only durable documentation assets into `assets/documentation/`.
- Keep render names descriptive and stable enough to survive doc revisions.

### README Render Needs

The README should need a small number of polished, current renders:

| Render | Viewport | Purpose |
| --- | --- | --- |
| Active campaign shell | Desktop, about `1440x900` | First visual proof of Directive's actual runtime shape. Show the command shelf, active Mission context, and chat-native campaign state. |
| Campaign package/library surface | Desktop or tablet | Shows that Directive starts from campaign packages, not generic prompt settings. |
| Mobile command shell | Phone, about `390x844` | Shows the phone-width route model and that Directive is usable inside a narrow host viewport. |
| Character Creator review or campaign start | Desktop | Shows the player-officer creation path that leads into a fresh campaign chat. |

The README should not require every surface. Its renders should sell orientation and trust, then route readers to the manuals.

### Operator's Manual Render Needs

The Operator's Manual needs complete surface evidence. Capture both desktop and phone-width views unless the surface is desktop-only or phone-only.

| Surface Or Flow | Required States |
| --- | --- |
| Runtime shell | Closed shelf, open drawer, active route, fullscreen/workspace escalation, reset-window/default state. |
| Campaign | No active campaign, package library, package detail, imported package diagnostics, active campaign Command, Records/save list. |
| Character Creator | Start/resume, step navigation, editable profile fields, portrait import, section wand assistance, review, validation failure, accept/start campaign. |
| Campaign activation | Start Campaign action, fresh campaign chat creation, activation progress, first intro posted, prompt context installed. |
| Mission | Active scene, command input context, consequential turn pending, warning/confirmation pause, pending response recovery, Rebind Chat recovery if exposed. |
| Crew | Roster, selected officer, public bio disclosure, Open Threads, relationship/development summaries that are player-safe. |
| Ship | Current ship status, systems/condition, alerts or damage states, any route-specific empty or recovery states. |
| Log | Command Log, turn history, summaries, sidecar-assisted summary, filters or detail views if exposed. |
| Assist | Draft In Character, Brief Me, role-aware framing, provider failure or fallback state. |
| Settings | Provider lanes, role routing, prompt preset controls, prompt context inspection, diagnostics, state safety, storage status. |
| Saves and recovery | Save Game, Save Game As, Load Save, branch metadata, active-chat guard, delete save, verify/settle/export active save. |
| Campaign conclusion | Concluded campaign state, archival/recovery affordance, cleared prompt injection. |
| Host-specific surfaces | SillyTavern launcher/message actions, Lumiverse app overlay and smoke-test view where materially different. |

### Technical Manual Render Needs

The Technical Manual should use diagrams and diagnostic captures more than product screenshots.

| Evidence | Purpose |
| --- | --- |
| Player turn sequence diagram | Explain host ingress, classification, Director escalation, transaction commit, narration, autosave, sidecars, and recovery. |
| Model-call routing diagram | Show Utility and Reasoning lanes, role IDs, host generation clients, and sidecar jobs. |
| Prompt context inspection render | Show what player-safe prompt blocks look like without exposing hidden state. |
| Model-call diagnostics render | Show sanitized call journal fields, provider lane, role, status, duration, and failure category. |
| Storage file tree or State Safety render | Explain logical save/index structure and current host storage behavior. |
| Turn ledger/state transaction diagram | Explain snapshot-before, packet commit, narration recovery, swipe, edit, delete, and branch behavior. |
| Sidecar diagnostics render | Show proposal-only sidecars, authorized roots, base revision checks, and rejected operations. |
| Host boundary diagram | Contrast SillyTavern and Lumiverse adapters without duplicating code comments. |

Technical diagrams can be Mermaid where code-shaped flow is clearer than a screenshot. Diagnostic screenshots should only show player-safe or sanitized data.

### Campaign Authoring Render Needs

The Campaign Authoring Guide needs fewer runtime screenshots than the Operator's Manual, but it needs authoring evidence:

| Render Or Artifact | Purpose |
| --- | --- |
| Campaign package detail | Shows how package metadata, hook copy, images, and chapter counts appear to users. |
| Import diagnostics | Shows what package validation or import errors look like. |
| Character Creator options | Shows how package-authored roles, backgrounds, hooks, and constraints surface in the creator. |
| Crew roster from package data | Shows how authored crew records become player-facing cards. |
| Mission or quest state | Shows how authored mission/quest data becomes active play. |
| Open Threads/Open Orders | Shows how authored thread templates and pressure/side-work data become visible only when appropriate. |
| Asset manifest examples | Shows package-owned images and fallbacks. |

## Stage 3: README Expansion

### Objective

Make the README a high-level route map into the full documentation set.

### Work

- Keep the README short enough to scan.
- Preserve Saga-style structure: fast start, key features, documentation, security, project layout, storage, authoring, verification, source material, license.
- Add direct links to the Technical Manual and Campaign Authoring Guide once those files exist.
- Add only the small README render set from Stage 2.
- Keep release-facing wording current, not aspirational.

### Outputs

- Updated [README](../../README.md).
- Updated README screenshots or render links.

### Verification

- Link check.
- Visual review of README render sizing in GitHub-style markdown.

## Stage 4: Operator's Manual Expansion

### Objective

Turn the Operator's Manual into the complete practical guide for running Directive.

### Work

- Rewrite the manual around task flows and surfaces:
  - Install/open Directive.
  - Configure providers.
  - Install/update the SillyTavern preset.
  - Choose/import a campaign package.
  - Create the player officer.
  - Start a campaign and bind a fresh chat.
  - Play in chat.
  - Resolve pauses and warnings.
  - Use Crew, Ship, Log, Assist, Settings, Records, and State Safety.
  - Save, branch, load, recover, rebind, and conclude.
- Use screenshots from Stage 2 for each major surface.
- Keep technical internals out unless they affect operator decisions.
- Move deep internals into the Technical Manual and link there.

### Outputs

- Expanded [Directive Operator Manual](../user/DIRECTIVE_OPERATOR_MANUAL.md).
- Updated [First Campaign Workflow](../user/FIRST_CAMPAIGN_WORKFLOW.md) if the shortest path changes.
- Updated [Storage And State Safety](../user/STORAGE_AND_STATE_SAFETY.md) where operator-facing save behavior is clarified.

### Verification

- Manual run-through against a current live or harnessed Directive session.
- Screenshot path validation.
- Focused browser smoke where screenshots are captured.

## Stage 5: Technical Manual

### Objective

Create the deep technical manual for how Directive actually works.

### Work

- Explain the runtime spine from host event to committed campaign state.
- Document the player turn sequence:
  - host player message observed,
  - active chat/campaign binding checked,
  - Utility classification,
  - Director escalation decision,
  - scene snapshot and retrieval,
  - competence/warning packets,
  - mission/quest/world/reaction/thread resolution,
  - state delta authorization,
  - transaction commit,
  - narration,
  - autosave,
  - sidecars,
  - prompt rebuild,
  - recovery.
- Document model calls:
  - Utility lane,
  - Reasoning lane,
  - role routing,
  - authority matrix,
  - structured-output parsing,
  - sidecar contracts,
  - provider failure handling,
  - sanitized diagnostics.
- Document persistence:
  - package vs campaign state,
  - save index and save records,
  - chat binding,
  - turn ledger,
  - sidecar/model-call journals,
  - revision/base-revision checks,
  - snapshot retention.
- Document host integration:
  - SillyTavern storage, prompt, generation, chat, and shell adapters,
  - Lumiverse storage, generation, tool, runtime bridge, and app overlay,
  - fake host test seams.
- Document limits and invariants:
  - hidden state must not leak,
  - model output cannot mutate unauthorized roots,
  - narration retry cannot reroll mechanics,
  - sidecars are proposal-only,
  - prompt context is player-safe,
  - active save is chat-affine.

### Outputs

- `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md`
- Optional split references if the manual becomes too large:
  - `docs/technical/PLAYER_TURN_SEQUENCE.md`
  - `docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md`
  - `docs/technical/STATE_TRANSACTIONS_AND_RECOVERY.md`
  - `docs/technical/HOST_INTEGRATION_MANUAL.md`

### Verification

- Source cross-check against `src/runtime`, `src/directors`, `src/generation`, `src/jobs`, `src/campaign`, `src/storage`, `src/hosts`, and `src/providers`.
- Focused tests for the contracts being described.
- Alpha gate when technical claims touch runtime behavior.

## Stage 6: Campaign Authoring Manual

### Objective

Create the deep authoring manual for building Directive campaign packages.

### Work

- Explain what a Directive campaign package is and is not.
- Explain the package/save boundary and why campaign packages are reusable templates.
- Document the `.directive-campaign.zip` shape and package import safety rules.
- Document each required root:
  - `manifest`
  - `ship`
  - `crew`
  - `characterCreation`
  - `world`
  - `storyArcs`
  - `questTemplates`
  - `threadTemplates`
  - `reactionRules`
  - `directorCards`
  - `contextPolicy`
  - `guardrails`
  - `assets`
- Explain authoring workflows:
  - campaign concept,
  - playable command role,
  - starting ship/station,
  - senior crew,
  - region/world state,
  - factions/fronts/clocks,
  - main arcs,
  - quests and tactical graphs,
  - side work and Open Orders,
  - hidden threads,
  - reaction rules,
  - Director cards,
  - prompt context policy,
  - guardrails,
  - player-safe copy,
  - assets,
  - validation and import.
- Use Ashes of Peace as an annotated reference implementation.
- Add a compact LLM handoff guide for model-assisted campaign generation and revision.

### Outputs

- `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md`
- `docs/authoring/CAMPAIGN_PACKAGE_STRUCTURE.md`
- `docs/authoring/CAMPAIGN_SCHEMA_REFERENCE.md`
- `docs/authoring/LLM_CAMPAIGN_AUTHORING_GUIDE.md`
- `docs/authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md`
- Updated package docs if old schema references are superseded.

### Verification

- `node tools\scripts\validate-campaign-package.mjs packages\bundled\breckenridge\ashes-of-peace.campaign-package.json`
- Package import test or alpha gate coverage.
- Manual check that every documented required root exists in `schemas/campaign-package.schema.json`.

## Stage 7: Cross-Doc Alignment

### Objective

Make the docs read as one system instead of separate historical notes.

### Work

- Cross-link the README, docs index, Operator's Manual, Technical Manual, Campaign Authoring Guide, package docs, architecture docs, and testing docs.
- Retire or rewrite stale planning language that conflicts with implemented behavior.
- Keep design docs as intent/history, and label current runtime docs as current behavior.
- Keep user-facing docs player-safe and operator-oriented.
- Keep technical docs explicit about hidden state and internal authority boundaries.
- Keep authoring docs clear about package data versus campaign state.

### Outputs

- Updated [Documentation Index](../DOCUMENTATION_INDEX.md).
- Updated [Testing Strategy](../testing/TESTING_STRATEGY.md) if new doc checks or render checks become part of the release bar.
- Updated release notes only when the docs are being promoted into a release checkpoint.

### Verification

- Link check.
- `node tools\scripts\verify-repo-structure.mjs`
- `node tools\scripts\run-alpha-gate.mjs` before claiming release-facing completion.

## Stage 8: Release-Facing Signoff

### Objective

Finish the expansion with proof that the docs match current behavior.

### Work

- Run the full documentation link and structure checks available in the repo.
- Run focused tests for any behavior documented or changed during the pass.
- Run the alpha gate if docs make current-runtime claims.
- Do a final screenshot/render audit:
  - each referenced render exists,
  - each render matches the described surface,
  - mobile and desktop captions are not swapped,
  - hidden state is not exposed,
  - stale experimental UI is not shown.
- Update release notes only if this documentation expansion is part of a named release checkpoint.

### Outputs

- Final README.
- Final docs index.
- Expanded Operator's Manual.
- Technical Manual and any split technical references.
- Campaign Authoring Guide and supporting authoring references.
- Render manifest for documentation assets.
- Verification summary.

## Suggested Work Order

1. Stage 0: inventory.
2. Stage 1: docs architecture and stable target paths.
3. Stage 2: render capture.
4. Stage 3: README.
5. Stage 4: Operator's Manual.
6. Stage 5: Technical Manual.
7. Stage 6: Campaign Authoring Manual.
8. Stage 7: cross-doc alignment.
9. Stage 8: signoff.

The Operator's Manual should start after the render inventory exists. The Technical Manual can start before all renders are captured because many of its assets are diagrams and source-derived evidence. The Campaign Authoring Manual should start after the package schema and bundled Ashes package are re-audited, because it will become the strongest contract for future package work.

## Definition Of Done

- README gives a concise, Saga-style table of contents into deeper docs.
- Documentation Index exposes every current major manual and reference.
- Operator's Manual covers every current user-facing Directive surface with current renders.
- Technical Manual explains the actual player-turn and model-call machinery from current source.
- Campaign Authoring Guide explains how to build, validate, import, and revise a complete campaign package.
- Render assets are current, named, and free of hidden-state leaks.
- Stale docs are updated in place or clearly labeled as planning/history.
- Verification commands are recorded in the final documentation pass.
