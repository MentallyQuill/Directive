# Chat-Native Command Intent

## Status

This document defines the target design for replacing the shelf-first "Enter Your XO Intent" workflow with chat-native command intent interpretation.

Directive is pre-alpha. The current Mission shelf input is a transitional implementation surface, not a compatibility contract. When this feature is implemented, update the runtime, tests, user docs, and visual targets in place rather than preserving the old shelf-input loop.

## Purpose

Directive should let the player play from the SillyTavern chat.

The extension should observe ordinary roleplay prose, infer the command intent behind it, and route that intent through the Mission Director, Command Competence Layer, Command Bearing, relationship memory, Command Log, and persistent campaign state.

The player should not need to break immersion, open the Directive shelf, type a separate "what would happen if" command, preview it, then return to chat as if the actual scene had not happened yet.

Core rule:

```text
The chat is where the player commands. Directive is where the command is interpreted, checked, recorded, and surfaced.
```

## Core Decision

Use **chat-native command intent interpretation**, not a separate shelf command-entry loop.

The player writes naturally in the roleplay chat. Directive interprets the player's intended command action from that message and runs it through the same structured turn pipeline that currently powers deterministic previews.

The Directive shelf remains valuable, but its role changes:

- show current mission context;
- show Command Briefs, Domain Reports, Authority Notes, and Procedural Warnings;
- request confirmation when a risk is serious or critical;
- expose Command Bearing intervention choices when eligible;
- show pending state, recovery actions, saves, logs, and diagnostics;
- support developer and accessibility fallbacks when needed.

The shelf should not be the primary place where the player plays a mission turn.

## Problem

The current shelf-first flow has three product problems.

First, it breaks roleplay flow. The player has to stop the scene, open a utility surface, and ask Directive to evaluate an out-of-band command.

Second, it teaches the wrong behavior. It implies the correct way to play is to formulate an abstract order for a rules engine, not to inhabit the XO in the conversation.

Third, it creates anxiety around phrasing. A player may worry that unusual wording, incomplete Starfleet procedure, or conversational language will be treated as the literal command and damage reputation, trust, or mission outcome.

Directive's better contract is already established by the Command Competence Layer:

```text
The game supplies professional competence. The player supplies judgment.
```

Chat-native command intent extends that rule to message interpretation.

## Player Experience

The normal loop should be:

1. The player writes an in-character chat message.
2. Directive observes the message and builds a command-intent candidate.
3. Routine professional details are supplied automatically when they are low-cost, reversible, authorized, and consistent with the player intent.
4. The active scene responds naturally, or Directive pauses only when a meaningful confirmation, warning, counsel request, or Command Bearing choice is needed.
5. The committed outcome is recorded in Directive's structured state and summarized in the Command Log.

Example:

```text
Player chat:
"Mara, I want us close enough to help, but do not let that convoy swallow our evidence chain. Priya, start authentication. Rowan, give me the cleanest sensor picture we can get at range. Bronn, quiet readiness."
```

Directive should infer:

- primary command posture: balanced rescue and evidence preservation;
- routine professional actions: log signal, preserve raw telemetry, begin authentication;
- domain reports: Operations, Science, Security as needed;
- authority posture: within XO command lane unless Captain approval becomes necessary;
- possible warning: only if the exact scene state makes the approach risky enough.

No separate shelf text box is required.

## Command Intent Tolerance

Command Intent Tolerance is the fairness rule for strange, casual, incomplete, or stylized player wording.

Directive should separate:

- what the player appears to be trying to accomplish;
- how the player character expresses it;
- what professional routine would normally fill in;
- what the fiction can support;
- what other characters might think about the player's manner.

Odd expression is not misconduct.

If the command intent is viable, then unusual wording should not damage relationship, reputation, mission standing, or Command Bearing by itself. At most, it may create light characterization:

- an officer finds the XO eccentric;
- a senior staff member asks for clarification;
- the Captain privately notes the player's style;
- the Command Log records the actual order, not the awkward wording.

The system should punish or complicate the player's conduct only when the underlying command action warrants it.

## Interpretation Levels

Directive should classify every player chat message that might matter to the mission into one of these interpretation levels.

| Level | Meaning | Default Handling |
|---|---|---|
| `sceneColor` | Flavor, banter, emotional beat, or non-command expression | Let the host narration continue; no mission turn required. |
| `routineCommand` | Low-risk order or professional continuation | Apply Procedural Autocomplete if eligible; log if useful. |
| `consequentialCommand` | Meaningful mission, relationship, risk, authority, or resource choice | Run the Mission Director turn pipeline. |
| `counselRequest` | The player asks for options, objections, protocol, or a specialist read | Return compact Domain Reports or recommendations without committing a major action. |
| `clarificationNeeded` | Intent appears viable but material target, authority, or method is missing | Ask a short in-character clarification or choose the conservative routine interpretation. |
| `riskConfirmationNeeded` | Intent is clear and serious or critical risk is foreseeable | Surface a warning and require confirmation when required by policy. |
| `unsupportedIntent` | The requested result lacks current authority, access, capability, or causal support | Refuse, counteroffer, or route to preparatory steps in fiction. |

This classification is about runtime handling, not visible player labels.

## Viability Over Literalism

Directive should interpret toward viable intent when the text supports it.

Good interpretation:

```text
Player:
"Let's not do the stupid version of this. Get me the truth before we start a war."

Viable intent:
avoid escalation, preserve evidence, request verification, seek counsel before committing.
```

Bad interpretation:

```text
Literal overread:
the XO insulted the crew, refused to act, and damaged morale.
```

Directive should use conversational context, current phase, known decision points, active pressures, present characters, and prior command posture to infer intent. It should not require exact authored phrases when the meaning is clear enough.

## Conservative Clarification

When the player message is ambiguous but plausibly viable, Directive should avoid harsh consequences.

Preferred handling order:

1. Infer a conservative routine interpretation if the stakes are low.
2. Have a nearby officer ask a concise in-character clarification.
3. Surface a shelf-side pending clarification only when chat interaction cannot carry the moment cleanly.
4. Treat the message as `sceneColor` if it has no actionable command content.

Ambiguity should become trouble only when the player proceeds after a fair warning, ignores an established concern, or issues a genuinely reckless order.

## Procedural Competence

Chat-native command intent depends on the Command Competence Layer.

The player should not need to type routine Starfleet steps such as:

- logging a distress packet;
- preserving raw telemetry;
- beginning authentication;
- maintaining standard medical readiness;
- restricting visitor system access;
- keeping normal security records;
- routing a department task to the appropriate officer.

These may be assumed when they satisfy the existing Procedural Autocomplete criteria:

- routine;
- reversible;
- low-cost;
- noncontroversial;
- within authority;
- consistent with the player's stated intent;
- non-escalatory.

The player still owns command judgment:

- rescue versus evidence priority;
- whether to accept delay;
- how transparent to be;
- whether to confront, negotiate, defer, or escalate;
- whether to ask counsel;
- whether to knowingly proceed through a warned risk.

## Warnings And Confirmations

Warnings remain the safety valve for command consequences.

If a chat-native command creates a serious foreseeable risk, Directive should make that risk legible before the committed consequence lands.

Warning behavior:

- Advisory warnings may appear in narration, Command Brief, or the shelf without stopping the scene.
- Serious warnings should usually pause before commit and offer confirmation, revision, or counsel.
- Critical warnings require explicit confirmation before commit unless the player has already confirmed that exact risk in the same stable circumstances.

Warnings must not become a permission system. A player may still make unconventional, risky, disobedient, emergency, or politically costly choices when the fiction supports them.

## Relationship And Reputation Rules

NPCs judge command conduct, not parser friction.

Relationship memory may respond to:

- decisions that affect safety, trust, dignity, transparency, authority, or responsibility;
- asking for dissent and then listening or retaliating;
- using counsel as support or as a shield;
- accepting or evading responsibility;
- overriding procedure with or without a credible basis;
- knowingly accepting risk.

Relationship memory should not penalize:

- nonstandard phrasing;
- asking for clarification;
- asking for recommendations;
- omitted routine procedural details;
- accessibility-driven speech patterns;
- stylized roleplay voice;
- an inferred routine action the player did not explicitly name.

If a player's wording is socially unusual but the command is viable, the response should be local and tonal, not a hidden reputation penalty.

## Command Bearing Boundary

Command Bearing should remain tied to meaningful command resolution.

Chat-native intent does not award or remove Inspiration or Resolve because a player phrased something smoothly or awkwardly. Marks and spends should continue to evaluate:

- accepted responsibility;
- trust, dignity, transparency, mentorship, and voluntary cooperation;
- discipline, preparedness, boundaries, credible authority, and risk ownership;
- actual decisions and outcomes after meaningful closure.

Command Bearing may use command-intent records as evidence, but only after the underlying action is resolved.

## Mission Director Boundary

The Mission Director still manages situations, not plots.

Chat-native command intent changes the source of player input. It does not change the causal contract:

- player prose declares intent and attempted action;
- structured state remains authoritative;
- hidden truth remains hidden until revealed;
- capability, authority, time, evidence, and constraints still matter;
- narration remains downstream from committed structure.

The Mission Director should receive a normalized intent packet derived from chat, not a separate shelf-only string.

## Shelf Role

The Directive shelf should become a command support surface.

Primary shelf states:

- `Context`: mission state, public objectives, directives, known facts, pressures, current Command Brief.
- `Pending Review`: provisional outcome, warning, counsel, clarification, or Command Bearing decision awaiting player action.
- `Committed Record`: latest accepted outcome, assumed routine actions, accepted risks, Command Log entry.
- `Recovery`: save, branch, rewrite narration, rerun outcome, delete outcome, diagnostics.

The old "Enter Your XO Intent" card should be removed from the default Mission path.

Acceptable fallback uses:

- developer diagnostics;
- accessibility or keyboard-only fallback when chat interception is unavailable;
- host parity fallback during Lumiverse migration;
- automated smoke tests;
- explicit "manual turn input" debug mode.

Fallback input should be visibly secondary and should not be documented as the normal gameplay loop once chat-native play is implemented.

## Runtime Flow

Target flow:

```text
host chat message
chat turn interceptor
scene snapshot builder
command intent interpreter
Command Competence Layer
action classification
authority/capability validation
Mission Director response
outcome packet
pending warning / counsel / bearing choice if needed
final outcome commit
state delta
narrator packet
host narration
Command Log packet
```

The current deterministic Mission Director loop can remain the internal spine. The implementation work is to move player input capture from shelf-first entry to chat-first interception and add a more tolerant intent normalization stage before existing adjudication.

## Intent Packet Shape

The normalized command-intent packet should include enough information to support fair adjudication and later review without exposing hidden reasoning to the player.

Suggested shape:

```text
commandIntent
  sourceMessageId
  sourceTurnId
  rawPlayerText
  playerVisibleSummary
  interpretationLevel
  primaryIntent
  targetIds[]
  declaredMethod
  inferredRoutineActions[]
  omittedButAssumedActions[]
  unresolvedAmbiguities[]
  socialPresentationNotes[]
  riskSignals[]
  counselSignals[]
  confidence
  needsConfirmation
  needsClarification
```

`socialPresentationNotes` should not directly alter relationship state. They are optional narrator or relationship inputs only when the scene needs tonal color.

`confidence` should be used to decide whether to ask for clarification, not to apply hidden penalties.

## Persistence

Committed command-intent records should be stored with the turn ledger and relevant Command Competence ledgers.

Persisted records should preserve:

- the player-visible command summary;
- the final normalized intent;
- assumed routine actions;
- warnings shown and confirmed;
- accepted risks;
- counsel requested;
- resulting outcome id;
- any relationship-memory inputs actually applied.

Persisted records should avoid:

- raw hidden truth;
- raw confidence thresholds;
- uncommitted parser alternatives;
- social-presentation notes that were not used in narration or relationship memory.

The Command Log should summarize the committed command, not the parser's internal reasoning.

## Host Integration

### SillyTavern

SillyTavern should be the first implementation target because the player's roleplay chat is the core product surface.

The host adapter should:

- detect player-authored messages eligible for Directive processing;
- avoid processing system, narrator, extension, and assistant-only messages as player commands;
- build scene snapshots from committed Directive state plus recent transcript context;
- hold or annotate outgoing generation only when a warning, clarification, or confirmation must happen first;
- let normal narration proceed when no Directive turn is needed.

### Lumiverse

Lumiverse should use the same engine contract once its host adapter can supply equivalent player-message events and generation hooks.

Until parity exists, Lumiverse may retain a manual preview action as a temporary host fallback. The design target remains chat-native.

## Authoring Implications

Mission graph authors should not depend on exact player phrases.

Decision metadata should define:

- allowed intent families;
- meaningful targets;
- common synonyms;
- routine professional actions;
- specialist domains implicated;
- risky omissions;
- authority boundaries;
- warnings and confirmation thresholds;
- clarification prompts.

This keeps intent interpretation grounded in package data rather than a growing list of hardcoded strings.

## Testing Strategy

Tests should prove the feature from the player's point of view.

Core fixture groups:

- odd phrasing with viable command intent;
- omitted routine procedure that should be supplied automatically;
- counsel request through chat;
- serious risk requiring confirmation;
- critical risk requiring confirmation;
- unclear but viable command asking for clarification;
- unsupported command receiving refusal or counteroffer;
- social oddity that does not damage relationship or reputation;
- explicit misconduct that does affect relationship or reputation;
- shelf fallback disabled in normal Mission flow.

Example assertions:

```text
Given a player writes an unusual but clear rescue/evidence order,
Directive resolves the intended command posture,
adds routine authentication and logging,
does not apply a relationship penalty for wording,
and records the committed order in the Command Log.
```

```text
Given a player writes "beam everyone straight into the lounge" during a quarantine-risk scene,
Directive identifies the rescue intent,
flags the quarantine bypass,
requires serious or critical confirmation,
and does not commit the risk before confirmation.
```

```text
Given a player writes "what am I missing?",
Directive returns counsel or Domain Reports,
does not commit a mission outcome,
and does not treat the request as indecision or command weakness.
```

## Implementation Plan

1. Add a chat-turn interception path in the SillyTavern host adapter.
2. Normalize intercepted player text into a command-intent packet.
3. Route the normalized packet through the existing Mission Director turn input.
4. Add pending warning, clarification, counsel, and Command Bearing shelf states.
5. Remove the default Mission shelf command-entry card.
6. Keep a manual input fallback behind diagnostics or host fallback state.
7. Update Mission visual targets to show pending review rather than primary text entry.
8. Update user docs only after runtime behavior exists.
9. Add regression fixtures for intent tolerance, no-gotcha handling, relationship neutrality, and risk confirmation.
10. Run the alpha gate and host smoke coverage.

## MVP Acceptance Criteria

The MVP is complete when:

- A player can issue a consequential mission order in SillyTavern chat without opening the Directive shelf.
- Directive can classify that message as a command, counsel request, clarification need, warning need, unsupported intent, or scene color.
- Viable but unusually worded commands resolve without hidden relationship or reputation damage.
- Routine professional omissions are supplied through Command Competence when eligible.
- Serious and critical risks pause for confirmation before commit.
- The shelf shows pending review, warnings, counsel, Command Bearing, and recovery controls instead of a primary "Enter Your XO Intent" card.
- The Command Log records the normalized committed command and any accepted risk.
- Tests cover odd phrasing, omitted procedure, counsel, warning confirmation, unsupported commands, and relationship neutrality.

## Non-Goals

This feature does not:

- make every player order successful;
- turn Directive into a freeform narrator that accepts asserted outcomes;
- remove authority, capability, hidden truth, or mission constraints;
- hide serious consequences after fair warning;
- convert every chat message into a mechanical turn;
- expose hidden parser confidence or Director reasoning;
- award Command Bearing for fluent wording;
- preserve the current shelf-input loop as a long-term user-facing workflow.

## Open Questions

- Should low-risk `routineCommand` messages auto-commit, or should the first implementation preview every consequential command until the safety model is proven?
- What exact host hook should pause SillyTavern generation when Directive needs warning confirmation?
- Should clarification prompts be emitted as NPC dialogue, shelf pending state, or both?
- How should multi-action player messages split when one part is routine, one part is counsel, and one part is consequential?
- How much recent transcript context should the interpreter receive before privacy, performance, or prompt-drift concerns outweigh accuracy?
