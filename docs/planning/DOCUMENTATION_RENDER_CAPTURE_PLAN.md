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

## Documentation-Grade Cleanup Found

The renderer is operational, but several captures should be polished before promotion into manuals:

- Mobile Mission reports clipped `Player` and `Campaign` labels in the hero stat cards.
- Campaign Library reports a clipped long package metadata label.
- Settings Safety reports clipped compact stat labels.
- The original live Mission Open Threads capture showed an empty player-visible thread state; the documentation fixture now supplies active visible threads, but the full matrix still needs promotion and visual inspection.

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

## Draft Manual Render Slot Audit

The current docs scan finds 39 render markers. Some are duplicate asks across authoring/reference docs and technical cross-links; treat this table as the capture backlog to reconcile against `.directive-doc-renderer/render-all.ps1`.

| Source | Slot | Current coverage |
| --- | --- | --- |
| `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md:34` | Campaign Library package-detail view for Ashes of Peace. | Covered by `docs-directive-campaign-library`; add authoring-specific alias if docs need a separate file name. |
| `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md:95` | Crew roster and selected officer dossier from package data. | Partially covered by `docs-directive-crew-roster`; still needs selected-officer and collapsed/expanded dossier variants. |
| `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md:113` | Character Creator package-authored role/background/trait choices. | Needs creator step renders for identity, service, personality, and review. |
| `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md:160` | Mission/Open World authored quest data as active or available work. | Covered by `docs-directive-mission-open-world` once fixture matrix is visually accepted. |
| `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md:178` | Mission or Crew Open Threads with active visible threads. | Covered by fixture-backed `docs-directive-mission-open-threads`; Crew-linked thread variant still useful. |
| `docs/authoring/CAMPAIGN_AUTHORING_GUIDE.md:248` | Asset manifest examples and runtime image fallback behavior. | Needs new package-asset/fallback render or static annotated asset example. |
| `docs/authoring/ASHES_OF_PEACE_AUTHORING_REFERENCE.md:53-56` | Package detail, Creator options, Crew roster, Mission/Open World authoring examples. | Same coverage as authoring guide rows above. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:24` | SillyTavern Extensions menu with Directive launcher. | Needs host-surface capture outside runtime shell. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:65` | Desktop command spine closed/open/fullscreen/reset and phone shell. | Open desktop and phone shell are covered; closed shelf, fullscreen/workspace, and reset result still need host/UI captures. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:112` | Campaign Command: no campaign, active, interrupted activation, Rebind Chat, conclusion, archive. | No campaign, active, and completed/conclusion are fixture-supported; interrupted activation, Rebind Chat, and archived state still need fixtures. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:144` | Package library/detail, long metadata label, successful import, import diagnostics error. | Library/detail covered; import success/error diagnostics and long-label polish still need fixtures or live import run. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:193` | Records empty/grouped/selected/multi-select, guard ok/blocked, Save Game As, branch metadata, delete confirmation. | Baseline Records covered; detailed save-state and modal/confirmation variants still need fixtures and scripted interactions. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:282` | Creator empty/resume, each step state, portraits, wand preview controls, validation, Start Campaign, discard. | Review fixture exists; all other creator lifecycle and assist variants need fixture states and scripted clicks. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:311` | Activation start progress, fresh chat opened, first intro, prompt context installed, failed activation, retry. | Needs activation journal fixtures plus at least one real live activation proof capture. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:421` | Mission active, no-bound guard, clarification, risk, Command Bearing, committed outcome, narration recovery, populated/empty threads/world, pending reconciliation. | Active, clarification, risk, Command Bearing, provisional, recovery, populated threads/world are fixture-supported; no-bound, empty, authority review, and pending reconciliation still need fixtures. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:466` | Crew full roster, player selected, senior selected, long bio collapsed/expanded, portrait controls, linked pressure/work/memory/thread, empty states. | Baseline rich roster covered; selection, disclosure, portrait, and empty variants still need scripted states. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:498` | Ship clean baseline, active damage, restriction, technical debt, all readiness folders expanded. | Damage/restriction/debt fixture exists; clean baseline and expanded-folder scripted capture still needed. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:530` | Log empty/new campaign, latest entry, expanded detail, filters, assisted summary success/failure. | Baseline latest entry covered; empty, filter states, and assisted-summary failure still need fixtures/scripted interactions. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:560` | Directive Assist menu, Brief Me result, order/report draft, Apply before/after, provider fallback, disabled/no campaign. | Needs real SillyTavern input-side captures and Assist result fixtures. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:648` | Settings Systems, Providers preset states, provider lanes, routing folders, tests, diagnostics populated/empty, Safety clean/issue/action results. | Systems/Providers/Safety and provider failure are partly covered; preset variants, expanded routing, empty diagnostics, safety issue, and action-result variants still need fixtures. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:687` | Extensions menu, Reset Window, Assist beside host controls, message actions overflow, preset status, `/send` row. | Needs host-surface capture scripts, plus real message-action and `/send` row proof. |
| `docs/user/DIRECTIVE_OPERATOR_MANUAL.md:704` | Lumiverse overlay, launcher, permissions/status, prompt dry-run/interceptor proof, storage diagnostics. | Needs Lumiverse live-host capture path or explicit deferral if host differences are not documented in this pass. |
| `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md:59` | Sanitized system overview diagram. | Needs generated or rendered diagram if Mermaid is not enough. |
| `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md:220` | Sanitized prompt inspection from Settings with block ids and revision. | Needs richer prompt-inspection Settings fixture. |
| `docs/technical/DIRECTIVE_TECHNICAL_MANUAL.md:243` | Sidecar diagnostics or model-call journal view. | Model-call diagnostics partly covered by Providers; sidecar journal needs fixture/UI surface if available. |
| `docs/technical/STATE_TRANSACTIONS_AND_RECOVERY.md:91` | Mission recovery console with edit/delete or narration recovery state. | Narration recovery fixture exists; edit/delete recovery still needs fixture. |
| `docs/technical/HOST_INTEGRATION_MANUAL.md:108-110` | SillyTavern launcher, message actions, Lumiverse overlay. | Same host-surface gaps as Operator Manual. |
| `docs/technical/PLAYER_TURN_SEQUENCE.md:133-136` | Mission active, pending interaction, recovery console, turn-sequence infographic. | Runtime states partly covered; infographic still needs design/render step. |
| `docs/technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md:103` | Settings Providers model-call diagnostics panel. | Covered by Providers once fixture matrix is visually accepted; add focused diagnostics crop if needed. |

## Fixture States Still Needed

The ignored renderer currently has documentation fixture support for active campaign, no active campaign, creator review, visible Open Threads, clarification, risk confirmation, Command Bearing, provisional outcome, narration recovery, provider failure, ship damage, and completed campaign. Complete manuals still need controlled fixtures for:

- first campaign creation from Character Creator through activation;
- creator empty/resume/identity/service/personality/review, portrait states, section-wand preview/apply/regenerate/dismiss, validation failure, and discard confirmation;
- interrupted activation, activation failed/retry, fresh chat opened, first intro visible, and prompt context installed;
- campaign Rebind Chat, archived campaign, hidden/inactive sessions, import success, and import diagnostics failure;
- Records empty/grouped/selected/multi-select, active-chat guard blocked, Save Game As, branch metadata, and delete confirmation;
- pending review states for no-bound chat, authority review, empty Open Threads, empty Open World, pending reconciliation, edit/delete recovery, and dependent-turn review;
- Crew player-selected/senior-selected states, long bio collapsed/expanded, portrait import/change/remove, linked work/memory/thread, and empty states;
- Ship clean baseline and readiness folders expanded;
- Log empty, filter/search states, expanded details, and assisted-summary failure;
- provider preset missing/current/behind, disabled-provider settings, routing folders expanded, provider test success/failure, model-call diagnostics empty, safety issue, and action-result states;
- active save mismatch, branch, load, delete, and recovery states;
- Directive Assist interactions from the real SillyTavern input surface;
- SillyTavern launcher, Assist host button, message actions overflow, live `/send` row, and Reset Window result;
- Lumiverse overlay/launcher/permission/status captures if host differences remain in the manuals;
- sanitized overview, turn-sequence, prompt-context, and sidecar/model-call diagrams or diagnostic crops.
