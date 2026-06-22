# Target User Flow

## Status

This document defines the target user flow for Directive as a chat-native campaign extension.

Directive is pre-alpha. The current shelf-first Mission input is an implementation bridge, not a compatibility contract. When the target flow lands, update the runtime, host adapters, tests, user docs, and labels in place. Do not preserve the old loop as a public contract unless it remains useful as an accessibility or recovery fallback.

## Core Contract

Directive should let the player install the extension, start a campaign, create a player officer, and then play inside an ordinary host chat.

The extension should own the campaign state, prompt context, turn adjudication, relationship simulation, crew and ship records, Command Bearing, side work, saves, and campaign conclusion. The player should not have to create a special chat named `Directive`, `Narrator`, or anything similar.

The player-facing rule is:

```text
The chat is where the player plays. Directive is the engine that interprets, injects, records, and updates the campaign.
```

## Target Flow Summary

1. User installs and enables Directive.
2. User opens Directive and selects a campaign package.
3. User clicks **Create Character**.
4. Directive opens a guided Character Creator.
5. User completes the character and clicks **Start Campaign**.
6. Directive creates or binds a campaign chat, posts the campaign intro, and marks the campaign active.
7. User writes in-character posts in that chat.
8. Each player post runs through a cheap utility pass.
9. Meaningful posts escalate into heavier Director, relationship, ship, crew, Command Bearing, sidecar, or narrator work.
10. Directive updates campaign state, prompt injection, UI charts, logs, saves, and any needed chat response.
11. The loop continues until the campaign reaches a conclusion and Directive closes or archives the campaign record.

## Install And Activation

### Frontend

After installation, Directive appears in the host extension surface. Opening it shows the campaign shell with package selection, save records, settings, and diagnostics.

The first-run state should be simple:

- no active campaign;
- visible campaign package choices;
- a primary **Create Character** action for the selected ready package;
- load/resume actions only when saved Directive records exist;
- storage and provider status shown as diagnostics, not onboarding copy.

### Backend

Directive initializes the host adapter, storage repository, package registry, generation router, event listeners, prompt-injection bridge, and chat-binding service.

Install alone should not create campaign state. Campaign state begins when the user starts or loads a campaign.

### Injection

No campaign prompt should be injected before a campaign is active. A minimal extension readiness block may be available for diagnostics, but the host model should not receive campaign content until a campaign is selected and started.

## Campaign Selection

### Frontend

The user selects a campaign package from the Campaign surface. For the first packaged campaign, this is the Breckenridge / Ashes of Peace package.

The selected package view should show:

- campaign title and premise;
- player role;
- ship and command context;
- expected tone and length;
- package health;
- provider and storage readiness;
- **Create Character** as the main action.

### Backend

Directive verifies that the package has the required projection, mission graph, crew dataset, guardrails, character-creation context, and prompt-injection metadata.

Package data remains reusable source material. It does not become campaign truth until **Start Campaign** projects it into a campaign-owned save.

### Injection

None yet. Package browsing should not alter the active chat context.

## Character Creation

### Frontend

Clicking **Create Character** opens a guided Character Creator. The screen should feel like Starfleet personnel setup, not a tabletop character sheet.

The creator should guide the user through:

- identity and form of address;
- species and broad background;
- career path and formative experience;
- assignment reason;
- personality traits and command flaw;
- editable dossier review;
- simulation mode if the package supports more than one.

The final action should be **Start Campaign**.

### Backend

Directive writes a character-creator draft as the user progresses. Drafts are recoverable, but they are not campaign state.

When the user clicks **Start Campaign**, Directive performs a single campaign-start transaction:

- accept the final character draft;
- create the initial campaign state from the package projection;
- create the player-character record;
- initialize Inspiration and Resolve;
- initialize crew, ship, mission, pressure, relationship, Command Log, and save ledgers;
- create the first save;
- create or bind the campaign chat;
- generate the first campaign intro packet;
- mark the campaign active.

### Injection

No ordinary chat prompt injection is required during creator setup. If a provider helps draft biography or dossier text, that provider receives only Character Creator context and explicit user-provided inputs.

## Campaign Chat Creation

### Frontend

After **Start Campaign**, Directive should create a new host chat by default and open it for the user.

The chat name should be generated from campaign and character context, for example:

```text
Directive - Ashes of Peace - Commander Serrin
```

The user should not have to create or name this chat manually. Advanced users may bind an existing chat, but the default path should be automatic.

Directive should post the first campaign message into the chat. That first message should establish:

- the ship and current assignment;
- the player character's post;
- the immediate scene frame;
- the Captain or senior staff handoff as needed;
- the first playable prompt for the player.

This message is campaign prose, not an out-of-character setup guide.

### Backend

The host adapter creates or binds a chat and stores a `campaignChatBinding` in campaign state:

- host id;
- chat id;
- campaign id;
- save id;
- created or bound timestamp;
- current prompt-context revision;
- intro message id if available.

The campaign save remains authoritative. The chat transcript is the play surface and source of user turn text, but not the only source of truth.

### Injection

Immediately after campaign activation, Directive should install active campaign prompt context for the bound chat.

In SillyTavern, this should use host prompt APIs such as `setExtensionPrompt` or the current equivalent prompt-manager surface. In Lumiverse, it should use the interceptor path.

## Active Campaign Prompt Context

Directive should continuously inject current, player-safe campaign context into the active campaign chat.

Prompt context should be assembled from authoritative campaign state, not from loose chat scraping.

Default injected blocks:

| Block | Purpose |
|---|---|
| Campaign Frame | Campaign title, premise, current chapter, active mission, tone, and player role. |
| Player Character | Name, rank, billet, authority lane, public dossier, current Command Bearing state. |
| Active Scene | Location, present characters, current question, immediate stakes, available decision points. |
| Known Facts | Player-visible facts, revealed evidence, formal objectives, active directives. |
| Crew Context | Relevant senior staff, current visible status, player-safe relationship descriptors. |
| Ship Status | Condition, damage, restrictions, technical debt, relevant systems. |
| Command Log Continuity | Recent committed outcomes and visible consequences. |
| Active Pressures | Player-visible obligations, deadlines, Open Orders, follow-ups, and unresolved costs. |
| Narrator Constraints | Safety rules for hidden truth, tone, continuity, and no rerolling committed mechanics. |

Hidden facts, raw relationship values, unrevealed clocks, detector scores, and Director-only reasoning must not be injected into ordinary narrator context.

## Player Chat Loop

### Step 1: User Posts

The user writes a normal in-character message in the campaign chat.

Directive observes the sent message and builds a chat-turn packet:

- message id;
- chat id;
- save id;
- campaign id;
- player text;
- recent chat context;
- active scene summary;
- prompt-context revision;
- current campaign-state revision.

### Step 2: Cheap Utility Pass

Every player post should run a cheap utility call or deterministic equivalent.

This pass classifies the post and decides whether heavier work is needed. It should be low latency and low cost.

Primary outputs:

- `sceneColor`: no material state change;
- `routineCommand`: low-risk professional action;
- `consequentialCommand`: meaningful mission, risk, relationship, authority, or resource change;
- `counselRequest`: player asks for advice, options, protocol, or specialist read;
- `clarificationNeeded`: viable intent exists but key target or method is missing;
- `riskConfirmationNeeded`: serious or critical foreseeable risk;
- `directorResponseNeeded`: the campaign should actively respond, interrupt, reveal, or escalate;
- `noDirectiveAction`: let ordinary chat continue with current prompt context.

The utility pass should also recommend which heavier workers are needed:

- Mission Director;
- relationship evaluator;
- ship/medical/damage evaluator;
- Command Bearing evaluator;
- side mission or Open Orders detector;
- continuity tracker;
- narrator response;
- prompt-context update only.

### Step 3: Handling No-Change Posts

If the post is scene color, banter, or non-consequential roleplay, Directive should not overprocess it.

Expected behavior:

- optionally update recent chat continuity;
- refresh prompt context if the visible scene focus changed;
- allow the host generation to continue normally;
- do not mutate relationships or Command Bearing just because wording was odd.

### Step 4: Handling Routine Commands

For routine professional actions, Directive should apply the Command Competence contract:

```text
The game supplies professional competence. The player supplies judgment.
```

Directive may assume routine, reversible, authorized, low-cost Starfleet procedure without requiring the player to type every step.

Examples:

- logging a distress call;
- preserving telemetry;
- routing a task to the right station;
- keeping the Captain informed;
- maintaining normal medical and security readiness.

Routine actions may update the Command Log or injected context, but should not trigger a heavyweight adjudication unless they touch a meaningful pressure.

### Step 5: Handling Consequential Commands

If the player message changes mission posture, relationships, risk, authority, evidence, resources, ship condition, crew safety, or campaign pressure, Directive escalates to the heavier turn pipeline.

The reasoner pass should:

- parse intent;
- retrieve relevant package, mission, crew, ship, and state context;
- apply professional competence;
- evaluate authority and capability;
- select active pressures;
- resolve success, partial success, failure, or unsupported action;
- compute state deltas;
- evaluate Inspiration and Resolve marks or spend eligibility;
- produce relationship, crew, ship, pressure, and Command Log updates;
- produce narrator constraints;
- decide whether the host should continue generation or Directive should post an explicit response.

The reasoner should not make raw hidden values visible. It may update hidden simulation state, but exposed summaries must remain player-safe.

### Step 6: Confirmation And Pause Points

Directive should interrupt or pause the chat flow only when necessary.

Pause points:

- serious or critical procedural risk;
- material authority violation;
- insufficient target or method;
- eligible Command Bearing spend;
- player-facing choice between meaningful alternatives;
- provider failure after mechanics commit.

The UI should surface the pause in Directive, but the player should be able to resolve it without losing the chat context.

When possible, pause copy should be in-character:

- an officer asks a clarification;
- the Captain flags an authority boundary;
- a department head warns about risk;
- the player is offered a Command Bearing intervention before narration finalizes.

## Response Strategy

Directive needs two valid response paths.

### Inject-And-Continue

Use this when the normal host narrator can respond safely if it receives updated context.

Directive updates prompt blocks before generation:

- active scene;
- known facts;
- Command Log continuity;
- relationship-visible posture;
- ship or crew condition;
- immediate narrator constraints.

The host model then writes the response using the ordinary chat provider.

### Directive-Posted Response

Use this when Directive must own the response because mechanics, hidden state, or campaign pacing require exact handling.

Examples:

- a committed Mission Director outcome needs narration;
- a pressure interrupts the scene;
- a side mission opens;
- a senior officer asks required clarification;
- a major consequence lands;
- the campaign reaches a chapter transition or conclusion.

In this path, Directive generates or composes the response from the committed packet and posts it into the campaign chat through the host adapter. The response should read like normal roleplay prose, not a system report.

## State Updates

After each committed turn, Directive updates the authoritative campaign save.

State domains include:

- mission phase and available decision points;
- known facts and revealed evidence;
- Command Log;
- turn ledger;
- Inspiration and Resolve marks, ranks, reserve, and spend records;
- senior crew relationship descriptors and hidden relationship values;
- crew injuries, stress, reassignments, and development moments;
- ship condition, damage, repair state, technical debt, and restrictions;
- pressure ledger, Open Orders, follow-ups, and side missions;
- actor postures, fronts, clocks, and hidden campaign state;
- prompt-context revision and chat binding.

The UI then refreshes the relevant charts:

- Campaign snapshot;
- Mission active context;
- Crew roster and relationship summaries;
- Ship status and damage;
- Command Log;
- Settings and diagnostics;
- save and branch records.

Visible charts should summarize current state without exposing hidden values or Director-only reasons.

## Sidecars

Sidecars are support workers, not the authoritative source of campaign truth.

Target sidecar types:

| Sidecar | Trigger | Output |
|---|---|---|
| Continuity Tracker | after meaningful player or narrator turns | player-safe continuity notes and retrieval tags |
| Relationship Evaluator | after interpersonal scenes or crew-impacting choices | hidden relationship deltas plus visible descriptors |
| Crew State Evaluator | after injuries, stress, command changes, or development moments | crew chart updates |
| Ship State Evaluator | after damage, repair, system strain, travel, or technical decisions | ship chart updates |
| Command Bearing Evaluator | after leadership-significant decisions | Inspiration/Resolve eligibility, marks, and spend hooks |
| Side Mission Detector | after pressure changes or intervals | candidate Open Orders or follow-up work |
| Recap Summarizer | after scene, chapter, or session boundaries | compact prompt and log summaries |
| Prompt Context Builder | whenever authoritative state changes | updated injection blocks and depth placement |

Sidecar outputs should be validated before state mutation. Proposal-only sidecars may suggest updates, but the campaign state should only change through accepted, validated state deltas.

## Prompt Injection Depth

Directive should manage not only what gets injected, but where and how strongly it is injected.

Default policy:

- always inject compact campaign identity and active scene context;
- inject recent Command Log continuity near the active scene context;
- inject crew and ship details only when relevant to the current scene;
- inject side work only when it is currently actionable or at risk of being forgotten;
- inject narrator constraints close to the active generation instruction;
- never inject raw hidden state into ordinary generation.

When a plot pressure must surface, Directive may inject a stronger scene beat block or post the response itself.

Examples:

- weak clue: inject as background context;
- active pressure: inject as narrator-safe scene instruction;
- urgent interruption: Directive posts the interruption into chat;
- hidden-only pressure: do not inject until a player-visible signal exists.

## Autosave And Recovery

Directive should autosave after each stable committed turn and after major sidecar-applied updates.

Recovery must support:

- failed provider response after mechanics commit;
- interrupted chat generation;
- deleted or edited player message;
- rerun from pre-outcome snapshot;
- branch save;
- prompt-context rebuild;
- active chat rebinding;
- storage diagnostics.

Provider failure must not reroll mechanics. Retry narration or response generation from the same committed packet.

## Campaign Conclusion

A campaign can end through authored completion, failure state, retirement, player choice, or a package-defined endpoint.

At conclusion, Directive should:

- post or inject the final scene;
- write the final Command Log entry;
- settle active pressures;
- mark the campaign save as complete;
- generate a campaign recap;
- preserve final crew, ship, Command Bearing, and relationship summaries;
- stop active prompt injection for that chat or switch it to read-only epilogue context;
- offer export, archive, new campaign, or branch-from-before-finale actions.

The user should understand that the campaign is complete without needing to inspect raw state.

## UI Role In The Target Flow

The Directive UI should support play without replacing chat.

Primary UI responsibilities:

- campaign package selection;
- Character Creator;
- active campaign snapshot;
- current mission context;
- pause/confirmation handling;
- crew, ship, relationship, and Command Bearing charts;
- Command Log;
- saves, branches, diagnostics, and recovery;
- side work review.

The Mission text box can remain as a fallback for debugging, accessibility, or hosts without chat interception. It should not be the default player flow once chat-native command handling is implemented.

## Implementation Implications

The target flow requires these runtime capabilities:

1. Host chat creation and chat binding.
2. First campaign intro generation and chat posting.
3. SillyTavern prompt injection through `setExtensionPrompt` or equivalent host prompt APIs.
4. Prompt context lifecycle: install, update, clear, rebuild, and attribution.
5. Sent-message observation for the bound campaign chat.
6. Cheap utility classification for every player post.
7. Escalation policy for heavyweight Director and sidecar calls.
8. Directive-owned chat response posting when mechanics require exact narration.
9. Validated sidecar proposal application.
10. UI refresh from authoritative campaign state after each committed update.
11. Recovery for provider failure, message edit/delete, branch, and prompt rebuild.

## Acceptance Criteria

The target flow is working when:

- a fresh user can install Directive, create a character, and click **Start Campaign** without manual chat setup;
- Directive creates or binds a campaign chat and posts the first in-character campaign message;
- the user can play by writing normal chat messages;
- every player post is classified by a cheap utility path or deterministic equivalent;
- consequential posts update structured campaign state;
- prompt injection updates after each committed change;
- normal host generation sees current player-safe campaign context;
- Directive can post a response itself when committed mechanics require it;
- crew, ship, Command Bearing, relationship, pressure, and Command Log charts update from the same authoritative state;
- provider failure does not reroll mechanics;
- the campaign can reach a clear conclusion and archive or complete its save.
