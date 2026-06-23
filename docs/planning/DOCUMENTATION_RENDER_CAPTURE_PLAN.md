# Documentation Render Capture Plan

## Purpose

Directive documentation renders must come from the real SillyTavern-hosted extension, not an emulated DOM. The local renderer lives in the ignored `.directive-doc-renderer/` package so it can keep browser profiles, verification captures, and transient reports out of source control while still producing durable PNG assets for `assets/documentation/renders/`.

Use the renderer after starting SillyTavern:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\.directive-doc-renderer\render-all.ps1
```

Stateful Mission, Crew, Ship, and Log renders use `-OpenCampaignChat`, which clicks the real Campaign Records `Open Campaign Chat` control, reconnects after SillyTavern switches chat targets, and then opens the requested route.

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

## Documentation-Grade Cleanup Found

The renderer is operational, but several captures should be polished before promotion into manuals:

- Mobile Mission reports clipped `Player` and `Campaign` labels in the hero stat cards.
- Campaign Library reports a clipped long package metadata label.
- Settings Safety reports clipped compact stat labels.
- Mission Open Threads currently shows an empty player-visible thread state; the manual also needs a fixture with active visible threads.

These are product/UI or fixture-state issues, not renderer infrastructure failures.

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
| Host-specific surfaces | SillyTavern extension launcher, message actions, Directive Assist button, and any Lumiverse-specific runtime shell or smoke view that differs materially from SillyTavern. |

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
| Host integration | SillyTavern host adapter boundaries, Lumiverse adapter boundaries, generation interception, message observation, and prompt lifecycle. |

## Fixture States Still Needed

The current live save is enough for baseline route renders. Complete manuals still need controlled fixtures for:

- fresh install with no active campaign;
- first campaign creation from Character Creator through activation;
- active visible Open Threads;
- pending review states for clarification, risk, authority, and Command Bearing;
- provider success, provider failure, and disabled-provider settings states;
- active save mismatch, branch, load, delete, and recovery states;
- active ship damage/restriction/repair states;
- completed and archived campaign states;
- Directive Assist interactions from the real SillyTavern input surface.
