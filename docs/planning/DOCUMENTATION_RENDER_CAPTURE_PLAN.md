# Documentation Render Capture Plan

## Purpose

Directive documentation renders must come from the real SillyTavern-hosted extension, not an emulated DOM. The local renderer lives in the ignored `.directive-doc-renderer/` package so it can keep browser profiles, verification captures, and transient reports out of source control while still producing durable PNG assets for `assets/documentation/renders/`.

Use the renderer after starting SillyTavern:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.directive-doc-renderer\render-all.ps1
```

The current local renderer supports two state sources:

- live host state for proof that the real SillyTavern extension, fonts, shell chrome, and host integrations render correctly;
- `-Fixture documentation -FixtureState <state>` for deterministic manual states injected through the real Directive runtime shell.

Use `-OpenCampaignChat` only for host-flow captures that must prove the real `Open Campaign Chat` path. Most documentation matrix rows should use the documentation fixture so they remain repeatable without changing the active SillyTavern chat.

## Current Verified Matrix

The initial matrix is verified against live SillyTavern at `http://127.0.0.1:8000/`.

| Render ID | Surface | Purpose |
| --- | --- | --- |
| `docs-directive-campaign-command` | Campaign Command | Active campaign/session index and recovery entry points. |
| `docs-directive-campaign-library` | Campaign Library & Import | Package browsing, package detail, and import entry. |
| `docs-directive-campaign-records` | Campaign Records | Save list, selected save, and save safety controls. |
| `docs-directive-mission-active` | Mission | Bound campaign play support surface. |
| `docs-directive-mission-context` | Mission Context | Objectives, directives, pressure, and chapter checkpoint support. |
| `docs-directive-mission-open-threads` | Mission Open Threads | Player-visible ongoing concerns and thread disclosure. |
| `docs-directive-mission-open-world` | Mission Open World | Open-world side work, opportunities, focus, delegation, and abandonment. |
| `docs-directive-crew-roster` | Crew | Roster, selected officer dossier, posture, pressure, work, memories, and threads. |
| `docs-directive-ship-status` | Ship | Ship hero, readiness, damage, restrictions, and technical debt. |
| `docs-directive-log-command-history` | Log | Command history, consequences, and committed inputs. |
| `docs-directive-settings-systems` | Settings Systems | Runtime controls and interface hints. |
| `docs-directive-settings-providers` | Settings Providers | Provider lanes, model-call routing, and diagnostics. |
| `docs-directive-settings-safety` | Settings Safety | State safety, storage diagnostics, verification, settle, export, and cleanup. |
| `docs-mobile-directive-campaign` | Mobile Campaign | Phone-width Campaign route and bottom navigation. |
| `docs-mobile-directive-mission` | Mobile Mission | Phone-width active campaign Mission route. |
| `docs-mobile-directive-crew` | Mobile Crew | Phone-width Crew route. |
| `docs-mobile-directive-ship` | Mobile Ship | Phone-width Ship route. |
| `docs-mobile-directive-settings` | Mobile Settings | Phone-width Settings route. |

The expanded 2026-06-23 matrix produces 59 PNGs in `assets/documentation/renders/`. Treat `assets/documentation/renders/render-manifest.json` as the local capture manifest when running the renderer, but keep it ignored because it is machine-generated. The expanded set adds deterministic fixtures for import success/failure, activation recovery, archive/complete campaign states, Records empty/guard/branch/Save As, Character Creator steps and portrait states, Mission pending interaction/recovery/empty states, Crew player portrait and empty states, Ship clean/expanded readiness, Log empty/assisted failure, and Settings preset/routing/provider/model-call/safety variants.

## Documentation-Grade QA

Final pass status on 2026-06-23:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\.directive-doc-renderer\render-all.ps1 -OutputDir assets\documentation\renders -ContinueOnError` completed 59/59.
- Contact sheets generated under `.directive-doc-renderer/contact-sheets/` were visually inspected for blank captures, host composer leakage, broken media, bad crops, and obvious text artifacts.
- Target crops are clamped to the Directive runtime body so tall target sections do not include SillyTavern input chrome.
- The package library metadata, import diagnostics, Settings diagnostics summary, player portrait fixture, activation recovery, and Mission reconciliation surfaces were corrected during QA.

Known residual limitations:

- Several wide Character Creator section renders are intentionally shallow crops of the active form section; use the review and portrait renders for broader Creator context.
- Empty-state captures are intentionally sparse where the UI is sparse, especially Crew empty and Log empty.
- Host-surface renders, Directive Assist beside the chat input, and technical diagrams remain outside the 59 runtime-matrix PNGs. Future-host renders, including possible Lumiverse support, are deferred until that host is active again.

## Operator's Manual Capture Inventory

The Operator's Manual needs visual evidence for every operator-facing decision point:

| Area | Capture States |
| --- | --- |
| Runtime shell | Closed shelf, open command drawer, active route, mobile full-screen shell, reset-window result, and fullscreen/workspace escalation if exposed. |
| Campaign | No active campaign, active sessions, hidden sessions, package library, package detail, import diagnostics, Records, selected save, Save Game, Save Game As, load, delete, conclude, archive, and Rebind Chat recovery. |
| Character Creator | New draft, resume draft, step navigation, editable profile fields, portrait import, section-level assist, validation failure, review, Start Campaign, and draft discard/reset. |
| Campaign activation | Start Campaign progress, fresh SillyTavern chat creation, first intro posted once, prompt context installed, interrupted activation, Finish Chat Setup, and Retry Chat Setup. |
| Mission | Active bound-chat state, no-bound-chat guard, pending clarification, serious-risk confirmation, authority review, Command Bearing choice, latest committed outcome, narration recovery, Context, Open Threads, and Open World. |
| Crew | Roster, selected officer, player-safe dossier, public relationship posture, current pressure, open work, recent command memory, active open threads, and empty states. |
| Ship | Baseline readiness, active advisories, damage, restrictions, repairs, technical debt, and clean/empty states. |
| Log | Latest command history, entry detail, visible consequences, committed inputs, search/filter states, and empty/new-campaign state. |
| Directive Assist | Draft In Character, Brief Me, role-aware framing, insertion into chat input, provider failure, and fallback or disabled state. |
| Settings | Systems, Providers, Safety, preset status, provider tests, role routing, prompt inspection/rebuild/clear controls, model-call diagnostics, storage diagnostics, state verification, settle, export, reload, and cleanup controls. |
| Saves and recovery | Active-chat save guard, branch metadata, save mismatch, load mismatch, stale preview cleanup, missing-record cleanup, edit/delete recovery, and dependent-turn review. |
| Campaign conclusion | Confirmation, concluding state, final scene posted, cleared prompt context, completed campaign record, archive, and retry conclusion. |
| Host-specific surfaces | SillyTavern extension launcher, message actions, Directive Assist button, and any active-host runtime shell or smoke view that differs materially from the drawer runtime. |

## Technical Manual Capture Inventory

The Technical Manual should prefer diagrams plus sanitized diagnostic renders:

| Topic | Evidence |
| --- | --- |
| Player turn sequence | Mermaid or rendered flow from host player message through classification, Director escalation, state transaction, narration, prompt rebuild, autosave, sidecars, and recovery. |
| Model-call routing | Utility lane, Reasoning lane, role routing, host provider/client boundaries, direct endpoint mode, and failure categories. |
| Prompt context | Sanitized prompt context inspection showing block IDs, placement, revision, and player-safe content boundaries. |
| State transactions | Snapshot-before, authorized state delta, commit, response ledger, recovery journal, edit/delete rollback, and branch behavior. |
| Sidecars | Proposal-only jobs, authorized roots, base revision checks, accepted/rejected proposals, and journal diagnostics. |
| Storage | Logical save/index structure, package/campaign boundary, active save verification, export, settle, and cleanup behavior. |
| Host integration | SillyTavern host adapter boundaries, fake-host test seams, generation interception, message observation, prompt lifecycle, and future-host adapter requirements. |

## Manual Integration Status

The 59 runtime PNGs have been embedded into the current manuals where the captured state directly supports the text:

- `docs/user/DIRECTIVE_OPERATOR_MANUAL.md` now uses Campaign, Records, Character Creator, Mission, Crew, Ship, Log, Settings, and mobile runtime captures.
- `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md` and `docs/authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md` now use package library, Character Creator, Crew, Open Threads, and Open World examples.
- `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md`, `MODEL_CALLS_AND_PROVIDER_ROUTING.md`, `PLAYER_TURN_SEQUENCE.md`, `STATE_TRANSACTIONS_AND_RECOVERY.md`, and `HOST_INTEGRATION_MANUAL.md` now use provider, routing, recovery, save-guard, state-safety, shell, and mobile captures.

The manuals should not reintroduce generic prose-only placeholders for covered runtime states. For remaining gaps, add a structured `directive-render` HTML comment plus a visible render-needed marker line, and register the row in [Documentation Render Tracking](../testing/DOCUMENTATION_RENDER_TRACKING.md).

## Remaining Capture Gaps

The runtime fixture matrix now covers the major Operator's Manual decision states listed above. Remaining documentation gaps are either host-specific, interaction-specific, or better served as diagrams:

- SillyTavern host surfaces: Extensions launcher, Directive Assist input-side button/menu, message actions overflow, live `/send` row, Reset Window result, and any first-start real-chat proof that must show SillyTavern outside the Directive drawer.
- Future-host surfaces: deferred until another host is active again; capture only when a supported host materially differs from SillyTavern.
- Directive Assist workflows: Brief Me result, order/report draft, Apply before/after, provider fallback, and disabled/no-campaign states beside the real host composer.
- Character Creator assist microstates: section-wand preview/apply/regenerate/dismiss and discard confirmation.
- Records destructive/recovery modals: delete confirmation, active save mismatch, same-campaign different-save guard, load mismatch, terminal timeline branch metadata, and dependent-turn review.
- Terminal checkpoint flow: Mission Directive Checkpoint card, Replay From Checkpoint, Push On, Keep This Ending, Save As Branch, saved-branch-count state, and Records terminal branch label.
- Glass Harbor package-specific surfaces: Library package detail, Character Creator review, Mission Open World, Crew roster, Ship fallback, and player-safe map/fallback.
- Log interaction variants: search/filter states and expanded entry detail.
- Package asset fallback example: an authoring-focused render or static annotated example for missing runtime images.
- Technical Manual visuals: sanitized system overview, player-turn sequence, state transaction, prompt-context, sidecar, and model-call routing diagrams.
