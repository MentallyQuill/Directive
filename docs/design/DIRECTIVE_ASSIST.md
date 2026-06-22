# Directive Assist

## Status

This document defines the target design for **Directive Assist**, a pre-send SillyTavern chat assistant for composing player-character messages from rough player intent.

Directive is pre-alpha. Build this feature in place against the current runtime and host-adapter architecture. Do not preserve the old shelf-first XO intent entry as a long-term user workflow.

## Purpose

Directive Assist helps the player turn rough intent into in-character chat without leaving the SillyTavern input flow.

The player should be able to type a short, out-of-character instruction in the normal chat box, choose a Directive Assist action, review the generated player-character message, edit it, and send it when ready.

Core rule:

```text
Directive Assist composes the player's voice. The Mission Director still interprets the sent chat.
```

Directive Assist is not the Mission Director and does not commit outcomes. It is an input assistant. The Mission Director remains responsible for checking what actually ends up in chat, interpreting command intent, applying Command Competence, warning about risk, resolving consequences, and committing state.

## Core Decision

Use a compact **Directive Assist** button near the SillyTavern chat input, beside the existing extension quick controls.

The first version should include only three high-value actions:

- `Draft In Character`
- `Brief Me`
- `Frame as Order/Report`

These actions should support role-flexible play. Ashes of Peace starts with the player as an XO, but future campaign packages may cast the player as an Ensign, department head, civilian specialist, liaison, guest officer, or another role with different authority and voice.

## Relationship To Chat-Native Command Intent

[Chat-Native Command Intent](CHAT_NATIVE_COMMAND_INTENT.md) defines how Directive interprets sent chat and routes consequential action through structured state.

Directive Assist happens before that.

```text
rough player input
Directive Assist action
editable player-character draft
player sends chat
Mission Director checks sent chat
Command Competence / warnings / resolution / state commit
```

There is no "mark as command" action. If the player sends a message, the Mission Director should be able to inspect it and decide whether it is scene color, routine command, consequential command, counsel request, clarification need, risk confirmation, or unsupported intent.

Directive Assist only improves the player's ability to express what they mean in character.

## Product Goals

Directive Assist should:

- keep the player in the normal SillyTavern chat workflow;
- reduce anxiety around command wording;
- make the player character sound like a real participant in the scene;
- adapt to the current package role, rank, department, staff access, and command lane;
- preserve the player's intent instead of optimizing it into a better decision;
- support concise command, report, recommendation, and question forms;
- make professional context easy to request without opening a large shelf view;
- avoid committing state before the player sends the final message.

Directive Assist should not:

- process every chat message before the player asks for help;
- replace the player's judgment;
- choose the correct mission answer;
- resolve consequences;
- inject hidden truth;
- impersonate NPCs as if they are speaking for themselves;
- overwrite the chat input without a clear review path;
- become a generic writing toolbar.

## Button Placement

The primary entry should be an icon button near the SillyTavern chat input, close to the existing extension quick button.

The button opens a small action menu. The menu should be fast, keyboard reachable, and dismissible. It should not open the full Directive shelf unless the selected action needs more room or the player asks for a detailed view.

Suggested labels:

- Button: `Directive Assist`
- Tooltip: `Open Directive Assist`
- Menu actions:
  - `Draft In Character`
  - `Brief Me`
  - `Frame as Order`
  - `Frame as Report`

`Frame as Order` and `Frame as Report` are variants of the same action family, but they should be separate menu commands for speed.

## Shared Input Rules

All actions read from:

- current chat input text;
- current Directive campaign state;
- current package role profile;
- player-character dossier;
- active scene summary;
- present characters and plausible staff access;
- known facts, public pressures, and visible directives;
- package voice guidance and guardrails.

All actions must avoid:

- Director-only hidden truth;
- raw relationship values;
- raw pressure or command-track numbers;
- unearned backstory;
- invented authority the player character does not have;
- changing the intended command judgment without permission.

If the chat input is empty, actions may use the current scene as the focus. If the input is not empty, the input should be treated as the player's intended focus.

## Player-Character Voice

Every generated draft must sound like the player character, not like a neutral assistant.

The voice model should use:

- player name;
- rank and billet;
- service history and personality notes from the dossier;
- current role authority;
- package era and institutional tone;
- current relationship posture only when player-visible and narratively established;
- the player's recent phrasing patterns when available and not disruptive.

The voice model must remain bounded:

- Do not invent a fixed personality for an undefined player character.
- Do not force one command style.
- Do not make every player polished, witty, intimidating, or diplomatic.
- Do not add trauma, ideology, secret history, or canonical relationships.
- Do not make the player character know facts they have not learned.

When the dossier is sparse, default to restrained professional prose and let the player edit toward their preferred style.

## Role Flexibility

Directive Assist must treat role as package data, not as hardcoded XO language.

Examples:

| Role | Useful framing |
|---|---|
| XO or commander | orders, delegation, command posture, responsibility, staff coordination |
| Ensign | report, observation, recommendation, request for permission, execution detail |
| Department head | specialist assessment, departmental order, risk note, implementation plan |
| Civilian specialist | expertise, concern, negotiation, technical or cultural read |
| Liaison | diplomatic framing, translation of interests, request for clarification |

The same rough input can therefore become different chat depending on role.

Rough input:

```text
verify the signal and keep rescue ready
```

XO framing:

```text
"Priya, start authentication and preserve the raw packet. Miriam, keep rescue teams ready, but we hold our approach until we know what this signal is asking us to trust."
```

Ensign framing:

```text
"Commander, I recommend we authenticate the packet before closing. I can keep the raw telemetry preserved while medical stands by for rescue."
```

## Action: Draft In Character

`Draft In Character` turns rough player intent into a complete player-character chat message.

Use when the player knows what they want to do but does not want to manually translate notes into in-character prose.

Input:

```text
tell bronn hold fire, priya verify signal, rescue ready
```

Output should:

- preserve the player's priorities;
- add natural scene phrasing;
- include relevant names, ranks, or roles only when helpful;
- include routine professional wording when it makes the message clearer;
- keep the message editable and sendable;
- avoid resolving whether the order succeeds.

Output should not:

- add a new strategy;
- add an unasked moral stance;
- turn a cautious instruction into a dramatic speech;
- replace the player's intended tone with an optimized command tone;
- insert hidden facts or future consequences.

Default output length should be short enough to send as chat. A good default is one to three paragraphs, with the first implementation favoring one compact paragraph plus quoted dialogue when appropriate.

## Action: Brief Me

`Brief Me` gives the player concise player-character context before they decide what to write.

Use when the player is unsure what their character should already know, what protocol implies, or what the active command question is.

Output should normally include:

```text
Known:
Uncertain:
Routine:
Pressure:
Decision:
```

Not every section is required. The brief should be short, non-prescriptive, and player-safe.

`Brief Me` may read the current input as focus.

Input:

```text
boarding the convoy
```

Possible output:

```text
Known: The convoy signal is valid enough to require response, but the silence and record gaps are not normal.
Uncertain: Biohazard risk, command authenticity, survivor condition, and evidence integrity remain unresolved.
Routine: Authentication, telemetry preservation, standoff scans, and rescue readiness are professional defaults.
Pressure: Delay may cost lives; rushing may compromise quarantine or evidence.
Decision: Name the posture you want: rescue-first, evidence-first, remote verification, or balanced approach.
```

`Brief Me` should not commit a turn, show hidden truth, or tell the player which choice is correct.

## Action: Frame as Order/Report

`Frame as Order/Report` reshapes the current input into a specific role-appropriate speech act.

This action is needed because future player roles will not always issue commands. The same intent may need to become an order, report, recommendation, request, objection, or question.

Initial menu variants:

- `Frame as Order`
- `Frame as Report`

Future variants may include:

- `Frame as Recommendation`
- `Frame as Question`
- `Frame as Objection`
- `Frame as Permission Request`

These future variants should wait until the first three actions are stable.

### Frame as Order

Use when the player has authority to direct action.

Output should:

- name accountable recipients when useful;
- keep responsibility with the player character;
- include clear priority and limits;
- avoid pretending the order already succeeded.

Example:

```text
"Priya, preserve the raw signal and begin authentication. Bronn, defensive readiness only. Miriam, prep rescue teams for quarantine intake. We do not close until I have a clean risk picture."
```

### Frame as Report

Use when the player is informing, escalating, or recommending from a role that may not own final authority.

Output should:

- describe what the player knows or assesses;
- distinguish fact from recommendation;
- identify uncertainty;
- respect rank and chain of command;
- avoid overclaiming authority.

Example:

```text
"Commander, the packet merits response, but I do not think we have enough to close safely. I recommend authentication and standoff scans while medical prepares for rescue."
```

## Generation Contract

Directive Assist generation should use a low-latency assist role, not the main narrator path when a separate utility role is available.

The prompt should include:

- the action requested;
- raw input text;
- player-character voice profile;
- role and authority profile;
- active scene summary;
- player-safe known facts;
- relevant visible staff and roles;
- output constraints.

The prompt should exclude:

- hidden truth;
- Director-only raw state;
- raw values for relationship, pressure, Command Bearing, or hidden clocks;
- uncommitted parser alternatives;
- internal implementation notes.

The output should be structured enough for the UI:

```text
assistResult
  action
  title
  replacementText
  notes[]
  warnings[]
  usedContext[]
```

`replacementText` is the editable chat draft. `notes` can explain what was preserved or assumed. `warnings` are assist-level caveats only; serious procedural warnings still belong to Command Competence and Mission Director handling after the player sends or requests a formal check.

## UI Behavior

For `Draft In Character`, `Frame as Order`, and `Frame as Report`:

1. Player types rough input in the chat box.
2. Player opens Directive Assist.
3. Player chooses an action.
4. Directive generates replacement text.
5. The chat box is updated only after the player can review or undo the change.
6. The player edits and sends normally.

Implementation may use a small preview popover with:

- generated draft;
- `Apply to Chat`;
- `Replace Selection` when text selection exists;
- `Try Again`;
- `Cancel`.

Directly replacing the input without recovery is not acceptable.

For `Brief Me`:

1. Player opens Directive Assist.
2. Player chooses `Brief Me`.
3. Directive shows a compact player-safe brief.
4. The brief may offer `Insert Summary`, but should not overwrite the chat input by default.

## Mission Director Boundary

Directive Assist output is not authoritative.

After the player sends the final chat message, the Mission Director should still inspect it. The sent message may differ from the generated draft because the player can edit it.

The Mission Director should decide whether the sent message is:

- scene color;
- routine command;
- consequential command;
- counsel request;
- clarification need;
- risk confirmation need;
- unsupported intent.

This check is always based on the sent chat, not on the earlier assist draft alone.

## Command Competence Boundary

Directive Assist may include ordinary professional language in a draft, but it does not apply Procedural Autocomplete or commit assumed actions.

Command Competence remains responsible for:

- routine professional actions;
- Command Briefs;
- Domain Reports;
- Request Counsel;
- Authority Notes;
- Procedural Warnings;
- no-gotcha enforcement;
- accepted-risk records.

`Brief Me` can reuse Command Brief concepts, but it is a pre-decision player aid. The committed Command Brief remains part of the Mission Director turn flow when a consequential action is processed.

## Relationship And Command Bearing Boundary

Directive Assist should not create relationship or Command Bearing effects by itself.

NPCs respond to what the player sends and what the player does, not to the existence of an assist draft.

No Inspiration, Resolve, relationship memory, reputation change, or Command Log record should be awarded or penalized because the player used Directive Assist.

## Persistence

Directive Assist should persist only lightweight operational data by default:

- enabled actions and visibility settings;
- last selected action, if useful;
- input recovery buffer;
- debug diagnostics when debug mode is enabled.

Assist drafts should not become campaign state unless the player sends the resulting message and the Mission Director commits a turn.

If input recovery is implemented, it should be local and user-facing. It should not become hidden simulation evidence.

## Package Authoring Requirements

Packages should provide enough player-role metadata to support Directive Assist without hardcoding Ashes of Peace assumptions.

Recommended package data:

```text
playerRole
  roleLabel
  rankDefault
  authorityScope
  commonSpeechActs[]
  staffAccess[]
  commandLane
  reportLane
  prohibitedClaims[]
  defaultTone
  voiceHints[]
```

Campaign state and the player-character dossier may override or refine this data.

For Ashes of Peace:

- role label: Commander, Executive Officer;
- authority scope: principal mission coordinator under Captain Whitaker;
- common speech acts: order, recommendation, counsel request, staff delegation, command posture;
- staff access: senior staff and Captain when present or reachable;
- default tone: restrained Starfleet professional unless player dossier says otherwise.

## Accessibility And Safety

Directive Assist should support players who have difficulty writing long in-character prose.

Accessibility rules:

- support keyboard operation;
- preserve the player's original input;
- make generated text editable;
- provide undo or input recovery;
- avoid forcing florid prose;
- avoid long output unless the player asks;
- keep button labels clear and stable.

Safety rules:

- do not send automatically;
- do not impersonate NPCs as if their statements are authoritative;
- do not reveal hidden facts;
- do not make the player responsible for generated text until they send it;
- do not treat assist usage as in-world behavior.

## MVP Acceptance Criteria

The MVP is complete when:

- A Directive Assist button appears near the SillyTavern chat input.
- `Draft In Character` converts rough intent into editable player-character chat.
- `Brief Me` produces concise player-safe context without committing a turn.
- `Frame as Order` and `Frame as Report` reshape input according to current role authority.
- Generated drafts use player-character name, rank, role, and available voice guidance without inventing major biography.
- Ashes of Peace output treats the player as XO under Captain Whitaker.
- A non-XO fixture proves the same actions can frame lower-authority speech.
- Assist actions do not commit Mission Director state, Command Log rows, relationship memory, or Command Bearing changes.
- The Mission Director still checks the final sent chat.
- Input recovery prevents accidental loss of the player's rough text.

## Testing Strategy

Tests should cover:

- empty input `Brief Me`;
- rough input `Draft In Character`;
- `Frame as Order` for Ashes of Peace XO;
- `Frame as Report` for a lower-authority role fixture;
- player-character voice fields included in the assist prompt;
- hidden-state exclusion from assist prompts;
- assist result does not mutate campaign state;
- apply/cancel/input recovery behavior;
- final sent chat is still routed to Mission Director interpretation;
- Lumiverse fallback behavior if the chat-input button is unavailable.

## Non-Goals

The first version should not include:

- generic spellcheck;
- make longer or make shorter actions;
- erotic, comedic, or genre-style rewrite modes;
- automatic processing of every typed message before send;
- NPC reply generation;
- outcome prediction;
- risk adjudication as a committed warning;
- Command Bearing recommendations;
- standing-order editing;
- broad persistent guide management.

Those may be useful in other extensions, but they are not the first high-value Directive Assist lane.

## Open Questions

- Should `Frame as Recommendation`, `Frame as Question`, and `Frame as Permission Request` be separate second-wave actions, or should they be variants inside `Frame as Report`?
- Should `Brief Me` use a popover, the Directive shelf, or both depending on available space?
- Should generated drafts include first-person narration by default, quoted dialogue by default, or package-configured style?
- How much recent player writing should voice matching use before it risks overfitting or privacy concerns?
- Which SillyTavern hook gives the cleanest apply-to-chat, replace-selection, and recovery behavior beside the existing quick button?
