# Directive Tutorial Revision

## Status

Implemented revision, 2026-06-25. This document records the Tips and Tutorials design and the implementation shape for Directive's Saga-style onboarding system.

Directive now has a shared guidance popover, tutorial/tip preference state, `Show Me` targeting, Settings > Systems controls, a tutorial library, and tutorial-only populated drawer state. The revision makes the tutorial complete enough that a first-time player can understand how to start, play, inspect, recover, and ask for help without reading the manual first.

Implemented code lives in:

- `src/guidance/directive-guidance-content.mjs` for Basic, Advanced, feature tutorials, and rotating tips.
- `src/guidance/directive-guidance.js` for popover lifecycle, exact `Show Me` preparation, tip arrows, and temporary Assist preview fixtures.
- `src/guidance/directive-training-scenario.mjs` for tutorial-only populated campaign view models.
- `src/runtime/runtime-shell.js` for training scenario activation, cleanup, inert tutorial actions, and the `Training Scenario` banner.
- `src/ui/*-panel.js` and `src/hosts/sillytavern/message-actions.js` for exact `data-directive-tour` anchors.
- `src/ui/settings-panel.js` for the Settings > Systems tutorial library.

## Problem

Directive has changed enough that the current tutorial is too shallow:

- Campaign creation and activation are now chat-native, not just a runtime setup flow.
- Campaign Command is increasingly a campaign/session index rather than the only active play surface.
- Mission, Crew, Ship, and Log are most useful after a campaign exists.
- Directive Assist and Directive Message Actions are critical to normal play and recovery, but live outside the drawer.
- Settings > Systems now owns guidance preferences, runtime behavior, and safety controls.
- Command Bearing, pressure, recovery, reconciliation, saves, branches, and campaign conclusion need plain player-facing explanation.

The immediate UX problem is that several drawers look empty or underpowered before a campaign is loaded. A tutorial that only highlights the real empty UI cannot teach what those drawers are for.

## Product Goal

The Basic Tutorial should give the player everything needed to begin using Directive:

1. Understand that chat is the primary play surface.
2. Understand that the command spine is the control and inspection surface.
3. Start or load a campaign.
4. Know what happens when a campaign activates.
5. Know where to inspect current mission context.
6. Know how to read and handle Mission Director pauses.
7. Know what Crew, Ship, and Log mean during play.
8. Know when to use Assist.
9. Know when to use Message Actions.
10. Know where saves, recovery, settings, tutorials, and tips live.

The tutorial should feel like Saga's walkthroughs in structure: an external popover, route preparation, narrow highlights, Back/Next/Finish controls, and focused modules. It should use Directive terminology and Directive visual treatment.

## Scope

### In Scope

- Revising the Basic Tutorial into a complete first-run walkthrough.
- Adding smaller feature tutorials for Assist, Message Actions, Campaign Records, Mission outcome handling, Crew/Ship/Log interpretation, and Settings.
- Adding a tutorial-only populated state so empty drawers can be toured honestly.
- Keeping tips separate from tutorials.
- Keeping `Show Me` highlight granularity exact.
- Updating docs, tests, and live Playwright coverage after implementation.

### Out Of Scope

- Creating a real demo campaign the player can accidentally continue.
- Writing fake records into persistent campaign storage.
- Creating a SillyTavern chat during tutorial preview mode.
- Injecting prompt context or calling providers for tutorial data.
- Teaching hidden simulation internals, raw scores, or spoiler facts.

## Tutorial Architecture

The guidance layer should support three tutorial classes.

### Basic Walkthrough

The first-run tutorial. It teaches the minimum complete operating loop.

Recommended steps:

| Step | Purpose | Primary Target |
| --- | --- | --- |
| Welcome To Directive | Explain chat as play surface and command spine as control surface. | Runtime panel |
| Command Spine | Show Campaign, Mission, Crew, Ship, Log, Settings. | Route buttons |
| Campaign Command | Start/load campaign, explain campaign sessions. | Campaign route |
| Start Or Continue | Show package/session entry point. | Campaign start/continue control |
| Campaign Activation | Explain first save, bound chat, intro, prompt context. | Campaign activation/status area |
| Play In Chat | Explain that ordinary player actions happen in chat. | Chat input |
| Mission | Explain current context, pending Director work, Accept/Discard. | Mission route body |
| Crew | Explain player-visible crew status and memories. | Crew route body |
| Ship | Explain operational condition and technical caveats. | Ship route body |
| Log | Explain committed outcomes and continuity records. | Log route body |
| Directive Assist | Explain pre-send help, not adjudication. | Assist launcher |
| Message Actions | Explain reconciliation and retcon support. | Message action launcher |
| Settings Systems | Explain tips, tutorials, runtime settings, safety controls. | Settings > Systems |
| Finish | Tell the player where to restart tutorials and tips. | Tips & Tutorials card |

### Advanced Walkthrough

Manual tutorial from Settings. It should not be forced on first run.

Recommended steps:

| Step | Purpose |
| --- | --- |
| Mission Director Pauses | Why Directive may stop to review a consequential turn. |
| Command Bearing | Marks, reserve, recovery, and player-facing meaning. |
| Pressure | Why public pressure and operational strain matter. |
| Crew Memory | How relationships, readiness, and officer memory affect play without visible approval farming. |
| Ship Consequences | How damage, restrictions, and technical debt persist. |
| Saves And Branches | Save, Save As, records, recovery, and branch reselect. |
| Scene Reconciliation | How edited/deleted/swiped messages are repaired. |
| Provider Routing | Utility vs reasoning lanes, diagnostics, and safe failure. |
| Campaign Conclusion | What end states, archive, Push On, and replay mean. |

### Feature Walkthroughs

Feature tutorials are shorter and should be launchable from Settings or relevant tips.

| Tutorial | Purpose |
| --- | --- |
| Assist | Draft In Character, Brief Me, Frame As Order, Frame As Report, preview actions, and final send responsibility. |
| Message Actions | Open host overflow, open Directive actions, reconcile one message, mark a range, reconcile from here, recalculate from here, clear markers. |
| Campaign Records | Continue, save, save as, branch, active chat binding, wrong-chat warnings. |
| Mission Outcomes | Pending preview, player-safe summary, Accept Outcome, Discard, recovery state. |
| Crew And Ship | How to inspect readiness, constraints, caveats, and officer/player-facing state. |
| Command Log | What records mean, what is committed, and why log entries are not hidden truth dumps. |
| Settings And Safety | Tutorial/tip toggles, runtime history, provider routing, diagnostics, storage safety. |

## Tutorial-Only Populated Campaign

### Decision

Add a tutorial-only training scenario that populates drawer view models while a tutorial is active.

This should not be a real campaign. It should be an ephemeral tutorial fixture that the guidance controller can activate and dismiss.

### Rules

- The training scenario is only active during tutorial mode.
- It does not write campaign saves, package records, chat metadata, prompt context, storage indexes, or SillyTavern files.
- It does not create or bind a SillyTavern chat.
- It does not call Utility or Reasoning providers.
- It does not change the active real campaign.
- It must be visually labeled as `Training Scenario`.
- It must close automatically when the tutorial ends, is closed, or the player starts/loads a real campaign.
- It must never be available as a playable campaign package.

### Why Not A Real Demo Campaign

A real demo campaign creates product risks:

- Players may accidentally continue it.
- Saves and chat bindings become confusing.
- Tutorial state can leak into storage, prompt context, or live chat.
- Test cleanup becomes harder.
- The tutorial has to explain both Directive and the fake campaign at once.

A training scenario should be a UI fixture, not content.

## Training Scenario Data

The fixture should be representative enough for every drawer to have useful targets.

### Campaign

Show:

- one package card for `Ashes of Peace`;
- one active training save;
- one Continue-like control;
- one status row explaining that this is a training scenario;
- one disabled or clearly inert start/load action when appropriate.

Teach:

- package vs campaign vs save;
- activation creates real state only outside training mode;
- chat binding belongs to real campaign activation.

### Mission

Show:

- current objective;
- current location;
- active scene summary;
- pending Director preview;
- Accept Outcome and Discard controls;
- recovery/status note;
- Command Bearing or pressure hint if available.

Teach:

- Mission is the current command desk;
- pending previews are not committed until accepted;
- chat remains where the player acts.

### Crew

Show:

- 4 to 6 officers;
- varied readiness states;
- one relationship/memory example;
- one officer with a useful caveat;
- one selected officer detail area.

Teach:

- Crew is player-visible continuity, advice, and readiness;
- raw hidden scores are not exposed;
- officers remember patterns through summaries and consequences.

### Ship

Show:

- operational status summary;
- several systems in green/yellow/red;
- one technical debt item;
- one operational restriction;
- one repaired or improving item.

Teach:

- ship state is campaign truth once committed;
- damage and caveats can constrain future outcomes;
- Ship is not just decorative flavor.

### Log

Show:

- recent player action;
- accepted outcome;
- crew update;
- ship update;
- recovery or save event;
- filter/search controls if present.

Teach:

- Log is committed, player-facing continuity;
- it is not a raw hidden-state dump;
- use it to remember what Directive has accepted as true.

### Settings

Show:

- Tips & Tutorials controls;
- Interface Hints;
- Runtime history;
- provider routing overview;
- diagnostics/safety controls.

Teach:

- Settings is the controls surface;
- tutorial/tip preferences are browser guidance preferences;
- provider and storage diagnostics are support tools, not campaign play.

## Visual And Copy Requirements

- The training state must carry a persistent `Training Scenario` label in every drawer.
- The label should be compact, not a modal warning.
- Copy must say "training" or "preview", not "demo campaign".
- Tutorial text must avoid hidden truth, raw relationship values, raw pressure scores, and unrevealed campaign spoilers.
- Tutorial copy should be short enough to read inside the popover without scrolling.
- Each step should highlight one target.
- A broad route highlight is only acceptable when the step is about the route itself.
- If a step refers to a button, sub-tab, or menu item, `Show Me` must highlight that exact element.

## Technical Shape

Implemented pieces:

| Piece | Responsibility |
| --- | --- |
| `directive-training-scenario.mjs` | Builds static tutorial fixture view models. |
| Guidance controller | Starts/stops training scenario mode around tutorials and prepares exact `Show Me` targets. |
| Runtime shell | Applies the tutorial view override while guidance is active and routes tutorial actions to inert handlers. |
| Panel renderers | Render existing panels from the tutorial view model without storage or provider writes. |
| Settings card | Lists Basic, Advanced, and feature tutorials. |
| Tests | Prove fixture isolation, populated drawers, exact highlights, and cleanup. |

The cleanest path is to keep the fixture close to `src/guidance/`, because it is an onboarding surface rather than campaign content. Runtime should treat it as a temporary view override, not as a campaign save.

## State And Lifecycle

Recommended lifecycle:

1. User starts Basic Tutorial.
2. Guidance controller records existing runtime view state.
3. Training scenario mode starts if no real campaign is active, or if the tutorial explicitly requests it.
4. Runtime renders training view models with a `Training Scenario` label.
5. Tutorial steps navigate and highlight normal UI targets.
6. On close, finish, Escape, real campaign load/start, or extension disable, training mode stops.
7. Runtime returns to the previous real state.

Current implementation uses training scenario mode for tutorials whose metadata sets `trainingScenario: true`. Assist and Message Actions walkthroughs use live host-adjacent controls because they are about controls outside the drawer training state.

If a real campaign is active, future revisions can either:

- use the real campaign when the step is safe and populated;
- or switch to training mode for steps that require a predictable pending preview or specific drawer shape.

The player should never lose active campaign context because they opened a tutorial.

## Show Me Contract

The existing narrow-target rule still applies.

Examples:

| Step | Prepare | Highlight |
| --- | --- | --- |
| Show Mission route | Open Mission | Mission route button or Mission header |
| Explain Accept Outcome | Open Mission and install training preview | Exact Accept Outcome button |
| Explain Crew readiness | Open Crew | Exact readiness card or selected officer row |
| Explain Ship caveats | Open Ship | Exact caveat/system row |
| Explain Log entry | Open Log | Exact log entry |
| Explain Assist Brief Me | Open Assist menu | Exact `Brief Me` menu item |
| Explain Message Reconciliation | Open message actions menu | Exact `Reconcile This Message` item |
| Explain Tutorial toggles | Open Settings > Systems | Exact Tutorial Prompts or Startup Tips toggle row |

If the exact target cannot exist because the host has no eligible message, the tutorial should either create a training host-adjacent target or explain why the target appears only once a message exists. It should not silently highlight the entire page.

## Settings Revision

Settings > Systems should evolve from one `Begin Tutorial` button into a small tutorial library.

Recommended controls:

| Control | Behavior |
| --- | --- |
| Tutorial Prompts | Toggle automatic first-run tutorial offers. |
| Startup Tips | Toggle automatic tips. |
| Basic Walkthrough | Start the first-run tutorial. |
| Advanced Walkthrough | Start advanced operations tutorial. |
| Assist Tutorial | Start Assist feature tutorial. |
| Message Actions Tutorial | Start host message action tutorial. |
| Show Tip | Show next eligible tip. |
| Reset Tutorial Progress | Clear tutorial completion and startup dismissal. |

The card should remain compact. It should not become a status dashboard.

## Acceptance Criteria

### Product

- A new player can complete Basic Walkthrough and understand how to start and play a campaign.
- Empty pre-campaign drawers are replaced by tutorial-only populated training views during tutorial steps.
- Training state is clearly labeled and cannot be mistaken for a real campaign.
- Tips remain separate from tutorials.
- Manual tutorial access remains available after automatic tutorial prompts are disabled.

### Safety

- No tutorial fixture data is written to campaign storage.
- No tutorial fixture data is injected into prompts.
- No SillyTavern chat is created or rebound by tutorial preview mode.
- No provider calls happen for training scenario data.
- Closing the tutorial restores real runtime state.

### UI

- Every Basic Tutorial step has a concrete target.
- `Show Me` highlights the narrowest available element.
- Assist and Message Actions steps open their host-adjacent menus and highlight exact sub-buttons.
- Mobile and desktop placement keep the guidance popover inside the viewport.

### Tests

Add or expand tests to prove:

- Basic, Advanced, and feature tutorial metadata is valid.
- Training scenario view models populate Campaign, Mission, Crew, Ship, Log, and Settings.
- Training scenario mode never calls storage, chat binding, prompt install, or providers.
- Training scenario mode cleans up on Finish, Close, Escape, real campaign load/start, and extension disable.
- Exact `data-directive-tour` anchors exist for every tutorial target.
- `Show Me` uses exact sub-controls before broader fallbacks.
- Live SillyTavern Playwright can complete the Basic Tutorial through at least one route, one drawer sub-control, Assist, Message Actions, and Settings.

## Implementation Slices

### Slice 1: Tutorial Content Revision

- Rewrite Basic Tutorial step list in `directive-guidance-content.mjs`.
- Add Advanced and feature tutorials.
- Add missing `data-directive-tour` anchors discovered by content.
- Update focused guidance tests.

### Slice 2: Training Scenario Fixture

- Add the static tutorial view model builder.
- Add runtime override plumbing.
- Render `Training Scenario` labels.
- Prove no storage/provider/chat side effects.

### Slice 3: Settings Tutorial Library

- Expand Tips & Tutorials card with separate tutorial launch buttons.
- Keep toggles compact.
- Add exact tour anchors for each launch control.

### Slice 4: Host-Adjacent Tutorial Coverage

- Ensure Assist and Message Actions tutorial steps prepare their menus.
- Add or verify exact action anchors.
- Add live Playwright checks for the exact sub-button highlights.

### Slice 5: Docs And Verification

- Update Operator Manual and Tips And Tutorials.
- Update alpha gate coverage.
- Run focused tests, alpha gate, and live SillyTavern Playwright smoke.

## Decisions And Follow-Ups

- Basic Walkthrough currently always uses training scenario mode.
- The tutorial library shows all feature tutorials immediately.
- The training scenario includes one pending outcome by default so Mission outcome steps can highlight exact controls.
- Message Actions uses live host-adjacent controls when present; the Basic walkthrough verified `message.launcher` in live SillyTavern.
- Assist preview sub-button tips use a temporary guidance fixture when no real Assist preview exists, so `Show Me` highlights exact preview buttons instead of the launcher fallback.
- Only Basic Tutorial completion affects startup tutorial prompts. Feature tutorial completion state is deferred.
