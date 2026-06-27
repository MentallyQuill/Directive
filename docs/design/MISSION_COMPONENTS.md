# Mission Components

Status: pre-alpha design and first implementation contract  
Primary owner: Runtime / Mission UI / Continuity  
Related docs: [Scene Handshake Protocol](SCENE_HANDSHAKE_PROTOCOL.md), [Continuity Projection Matrix (CPM)](CONTINUITY_PROJECTION_MATRIX.md), [Narrative Thread Engine](NARRATIVE_THREAD_ENGINE.md), [Outcome Integrity](OUTCOME_INTEGRITY.md), [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)

## Purpose

Mission Components are player-curated pieces of visible campaign evidence captured directly from chat text.

They are more than notes. A component can be an in-universe note, item, item stat, recalled memory, quoted line, source document, open question, ship issue, procedural constraint, claim, lead, or world detail. The point is to give the player a fast way to preserve meaningful text before it gets buried in chat, while giving Directive a source-backed record that future continuity systems can reason over.

```text
Highlighted text is the source.
The player chooses what matters.
The Utility model proposes structure.
The saved component preserves evidence.
```

## Core Decision

Use **highlighted text capture** as the primary Mission Components intake.

When the player selects text in the host chat, Directive should show a small ship-icon affordance near the end of the selection. The affordance opens a capture review flow labeled:

```text
Add Component to Mission
```

The captured component belongs to the active campaign save and appears in a new Mission drawer local tab:

```text
Open World | Components
```

The Components tab should support sorting, filtering, review, and source inspection. It should not become a SillyTavern lorebook, an unreviewed sidecar dump, or a hidden-state dashboard.

## Problem Statement

Live Ashes of Peace play shows the gap. Bronn's XO briefing packet can include many durable details:

- named refit discrepancies;
- pending replacement work;
- disputed technical interpretations;
- department-specific follow-ups;
- personal assessments of senior staff;
- operational deadlines;
- quotes and informal advice;
- source authority differences between official packet text and Bronn's personal notes.

Some of this may become ship state, some may become open work, some may remain advice, and some may be disputed. Treating the entire assistant message as one automatic settlement is too blunt. Asking a scanner to decide what matters from a long packet is also too blunt.

The player often knows exactly which sentence matters. Mission Components should let the player highlight that sentence and capture it before the next reply.

## Product Goals

Mission Components should:

- Capture valuable visible information immediately, even before the next player reply.
- Preserve exact source text and source location.
- Let the player decide what is worth keeping.
- Use the Utility model to categorize and format, not to decide final truth.
- Support in-universe notes, items, item stats, memories, claims, quotes, leads, questions, procedures, and ship issues.
- Make captured details searchable and sortable inside Mission.
- Feed CPM work through source-backed evidence.
- Avoid sidecars creating a conflicting parallel version of the same reality.

Mission Components should not:

- Automatically turn every captured line into authoritative campaign state.
- Replace Scene Handshake settlement for accepted assistant prose.
- Replace Scene Reconciliation for edited, stale, or suspicious chat passages.
- Expose hidden crew motives, hidden state, raw evaluator output, or Director-only truth.
- Award Command Bearing evidence, resolve outcomes, or mutate package data.
- Depend on SillyTavern lorebook storage.
- Require the player to capture whole messages.

## User Flow

1. The player highlights text in the active campaign chat.
2. Directive shows a compact ship-icon capture button at the end of the selection.
3. The player clicks **Add Component to Mission**.
4. Directive opens a compact review popover anchored near the selection.
5. The Utility lane receives the selected text, source metadata, and a small player-safe campaign snapshot.
6. The Utility lane proposes a title, type, summary, tags, links, source authority, status, and warnings.
7. The player edits or accepts the component.
8. Directive saves the component with verbatim source text and source anchors.
9. The Mission drawer can open directly to **Components** with the new entry highlighted.

The first version should capture one component per click. Later versions may allow a selected passage to produce multiple proposed components, but multi-component extraction should remain review-first.

## Frontend Surfaces

Mission Components should be a three-surface feature:

1. Chat-side capture affordance.
2. Review/edit popover.
3. Mission drawer Components tab.

The chat-side affordance makes capture fast at the moment the player notices useful text. The review popover prevents unreviewed model categorization from becoming campaign state. The Mission drawer tab makes the saved material searchable, sortable, editable, and ready for CPM use.

This should not become a separate notebook app. All visible component management belongs in Mission because components are active mission evidence, leads, objects, claims, and source fragments.

## Capture Affordance

The selection affordance should be lightweight and host-adjacent:

- show only when selected text is inside the active bound campaign chat;
- use the Directive ship icon;
- appear near the selection endpoint without covering the selected text;
- hide on selection clear, scroll, route change, wrong chat, disabled Directive state, or modal open;
- use a tooltip or accessible label: `Add Component to Mission`;
- avoid a large floating toolbar.

The capture affordance should not appear for:

- non-campaign chats;
- wrong-save or wrong-chat states;
- selections outside chat message text;
- hidden/system messages not visible to the player;
- stale message rows currently under reconciliation review.

The capture affordance should appear for both assistant messages and player messages when the selection belongs to the active campaign chat. Player-authored selections have different authority rules, but they are valid component sources.

If a selection crosses multiple chat messages, the first runtime pass should reject it with a concise warning or ask the player to narrow the selection. Multi-message capture can wait until source-range anchoring and review UI are mature.

Visual behavior:

- use one compact icon button, not a toolbar;
- prefer the Directive ship glyph over a generic plus sign;
- keep the button outside the selected text rect when possible;
- clamp the button to the viewport;
- preserve text selection while the review popover opens;
- keep the affordance above SillyTavern message chrome without hiding native controls;
- use a native focusable button with an accessible label.

The button label is not visible by default. The visible affordance is the ship icon. Tooltip/accessibility text should be:

```text
Add Component to Mission
```

### Implementation Reference: Memory Books Clip

Use ST Memory Books' **Clip to Memory Book** feature as the primary UX and implementation reference for the highlighted-text affordance.

Reference files in the local SillyTavern extension:

```text
F:\SillyTavern\SillyTavern\data\default-user\extensions\SillyTavern-MemoryBooks\clipManager.js
F:\SillyTavern\SillyTavern\data\default-user\extensions\SillyTavern-MemoryBooks\index.js
F:\SillyTavern\SillyTavern\data\default-user\extensions\SillyTavern-MemoryBooks\USER_GUIDE.md
```

Useful implementation patterns from Memory Books:

- `getSelectionChatMessage(selection)` restricts capture to chat message rows.
- `getFloatingSelectionState()` reads `document.getSelection()`, normalizes selected text, validates that anchor and focus stay inside `#chat`, resolves the source message, and positions the affordance from the selected range rect.
- The floating button lifecycle binds `selectionchange`, `mouseup`, `keyup`, document `mousedown`, and scroll listeners, then hides the button when the selection is gone or the viewport changes.
- The feature has an explicit setting to enable or disable the floating clip button.

Directive should borrow the selection/button mechanics, not the storage semantics. Mission Components must keep Directive-specific guards for active campaign chat, save binding, stale source, source anchors, Utility categorization, and reviewed campaign-state writes.

## Review Popover

The review popover should be compact enough for the SillyTavern chat surface.

The popover should open near the selected text and remain inside the viewport. It should be large enough to review the model proposal, but not block the whole chat unless the viewport is phone-sized.

Recommended fast-mode layout:

```text
[Ship Issue] [Unresolved]

Port nacelle coolant seal

Cross assesses the seal will fail within 200 hours of sustained warp six or above.

Links
Cross  Port Nacelle  Engineering

Source
"Coolant seal, port nacelle, junction 7-C..."

[Save Component] [Edit] [Cancel]
```

Recommended edit-mode fields:

```text
Title
Type
Status
Summary
Tags
Linked Crew
Linked Ship System
Source Authority
Verbatim Source
Save / Cancel
```

The source text should be visible but not forced into an oversized editor. The player should be able to expand it when needed.

The user can edit the generated title, type, status, tags, links, and summary. The canonical verbatim source should remain immutable unless the player changes the selected text before saving.

Popover modes:

- **Fast mode:** generated title, type, status, summary, links, and source preview are visible; Save is the primary action.
- **Edit mode:** type, status, source authority, tags, links, and summary become editable controls.
- **Provider pending:** show the selected source immediately, then fill proposal fields when Utility classification returns.
- **Provider unavailable:** offer local fallback fields with Type defaulted from simple heuristics and Summary initialized from the selected text.
- **Conflict/warning:** show Utility warnings above Save and require explicit review when the summary may overstate the source.

Controls:

- Type should be a segmented/select control with icons or short labels.
- Status should be a compact select or segmented control.
- Tags should be token chips with keyboard entry.
- Linked Crew and Linked Ship System should use searchable menus where data is available.
- Source Authority should be editable but should default from role/source cues.
- Save should be disabled until Title, Type, Status, Source Authority, and Source text are valid.

The popover should not auto-open the full Mission drawer. After Save, it may show a small success state with **Open Components** as a secondary action.

## Verbatim Versus Template

Use both.

The component must preserve the selected text verbatim. That is the canonical evidence and should never be replaced by a model summary.

The UI can render a typed, pretty template around that evidence:

```text
Title: Port nacelle coolant seal
Type: Ship Issue
Status: Installation pending
Summary: Cross assesses the seal will fail within 200 hours of sustained warp six or above. Replacement part is fabricated; install should wait for a scheduled stop.
Source: [exact highlighted text]
```

The template is presentation. The source excerpt is evidence.

If the Utility model compresses or misstates the source, the component still has the original selected text. Conflicts between summary and source should be detectable and reviewable.

## Component Types

Initial component types:

| Type | Purpose |
|---|---|
| `note` | General in-universe note, memo, or player-useful detail. |
| `item` | Physical object, document, device, artifact, file, sample, or tool. |
| `itemStat` | Condition, property, location, owner, limitation, capability, or charge attached to an item. |
| `shipIssue` | Technical debt, damage, anomaly, maintenance concern, readiness note, or system constraint. |
| `lead` | Follow-up route, person to ask, place to inspect, or next action. |
| `claim` | Something someone states that may be true, false, partial, biased, or disputed. |
| `memory` | Recalled or preserved event, personal detail, crew interaction, or prior campaign beat. |
| `question` | Unresolved uncertainty or investigation question. |
| `quote` | Exact line worth preserving for later roleplay or evidence. |
| `procedure` | Rule, protocol, standing order, access boundary, or operational method. |
| `sourceDocument` | Briefing packet, report, log, memo, manifest, scan result, legal notice, or other in-fiction document. |

Types are classification aids, not separate systems. A component can later be promoted or linked to Mission, Ship, Crew, Log, Thread, or Continuity state.

## Source Authority

Every component should label the authority of the selected text.

Initial authority labels:

| Authority | Meaning |
|---|---|
| `officialPacket` | In-universe official report, packet, log, order, or record. |
| `personalAssessment` | A character's personal read, advice, opinion, or informal note. |
| `dialogue` | Spoken line or immediate conversational claim. |
| `playerObservation` | Player-authored observation, action, or description. |
| `narration` | Visible assistant narration that is not framed as a document or dialogue. |
| `systemStatus` | Displayed sensor, ship, station, medical, tactical, or operational status. |
| `unknown` | Authority could not be determined safely. |

Authority is not truth. It tells future systems how to treat the evidence.

## Player-Authored Components

Users may create Mission Components from their own chat entries.

Player-authored components are useful for:

- personal notes and priorities;
- stated intentions;
- hypotheses;
- quoted orders or commitments;
- player-character memories;
- player-authored observations;
- declared follow-up plans.

They should not automatically become external world truth. A component captured from player text should default to `sourceAuthority: "playerObservation"` unless the selected text clearly quotes an in-universe document, system status, or other visible source.

Examples:

| Player-selected text | Valid component treatment |
|---|---|
| "I'll start with Cross in Engineering." | Lead or intent, not proof that Cross was consulted. |
| "The sensor variance might connect to the deflector alignment." | Hypothesis or question, not confirmed ship truth. |
| "I have a classified device in my bag." | Player claim needing validation, not an automatic item. |
| "Bronn already gave me command codes." | Player claim needing validation unless supported by prior source or committed state. |
| "I want repair truth over optics." | Player priority, value signal, or personal note. |

Promotion rules:

- player-authored components may be saved immediately;
- they may link to Mission, Crew, Ship, or future Continuity records as evidence of player intent or claim;
- they must not create external items, repair states, relationship outcomes, access rights, or facts about other characters without validation against existing source, committed state, or a reviewed Director/Utility proposal;
- the UI should display player-authored components as such when their content could be mistaken for confirmed world state.

## Status And Confidence

Components need status because many captures are unresolved.

Initial statuses:

- `active`
- `unresolved`
- `confirmed`
- `disputed`
- `superseded`
- `archived`

Use confidence sparingly. The first implementation can avoid numeric confidence and rely on authority, status, source text, and user review. If confidence is added later, keep it qualitative:

- `sourceExact`
- `sourceSupported`
- `inferred`
- `uncertain`

## Data Shape

Recommended campaign-state shape:

```json
{
  "knowledgeLedger": {
    "schemaVersion": 2,
    "facts": [],
    "rumors": [],
    "contradictions": [],
    "components": {
      "schemaVersion": 1,
      "records": [
        {
          "id": "component:port-nacelle-coolant-seal:7f32b9e1",
          "title": "Port nacelle coolant seal",
          "type": "shipIssue",
          "status": "unresolved",
          "summary": "Cross assesses the seal will fail within 200 hours of sustained warp six or above. Replacement part is fabricated; install should wait for a scheduled stop.",
          "verbatim": "Coolant seal, port nacelle, junction 7-C...",
          "sourceAuthority": "officialPacket",
          "tags": ["post-refit", "engineering", "port nacelle"],
          "links": {
            "crewIds": ["imani-cross"],
            "shipSystemIds": ["ship.port-nacelle", "ship.coolant-system"],
            "missionIds": ["prelude-a-ship-underway"],
            "componentIds": []
          },
          "source": {
            "host": "sillytavern",
            "chatId": "Directive - Ashes of Peace (57) - 2026-06-25@19h21m03s920ms",
            "hostMessageId": "15",
            "messageRole": "assistant",
            "messageName": "Directive - Ashes of Peace (57)",
            "textHash": "h...",
            "selectionHash": "h...",
            "selectionStart": null,
            "selectionEnd": null,
            "capturedAt": "2026-06-26T21:10:00.000Z",
            "outcomeId": null,
            "ingressId": null
          },
          "derived": {
            "utilityModelCallId": "model-call:...",
            "warnings": [],
            "summaryTextHash": "h..."
          },
          "lifecycle": {
            "createdAt": "2026-06-26T21:10:00.000Z",
            "updatedAt": "2026-06-26T21:10:00.000Z",
            "createdBy": "player",
            "reviewed": true
          }
        }
      ]
    }
  }
}
```

Use `knowledgeLedger.components` for the first implementation. `knowledgeLedger` is already a tracked mutable campaign-state domain, and current prompt projection does not automatically inject arbitrary component records. The important contract is that each component preserves source text and source anchors.

## Utility Model Contract

The Utility lane should propose structure from selected text. It should not commit truth by itself.

Input:

- selected text;
- surrounding message metadata;
- active campaign id/save id/chat id;
- visible current mission title and phase;
- visible crew names and ids;
- visible ship systems or common system aliases;
- existing nearby components for dedupe hints.

Output:

```json
{
  "title": "short player-facing title",
  "type": "note|item|itemStat|shipIssue|lead|claim|memory|question|quote|procedure|sourceDocument",
  "status": "active|unresolved|confirmed|disputed|superseded|archived",
  "summary": "faithful summary of selected text",
  "sourceAuthority": "officialPacket|personalAssessment|dialogue|playerObservation|narration|systemStatus|unknown",
  "tags": [],
  "links": {
    "crewIds": [],
    "shipSystemIds": [],
    "missionIds": [],
    "componentIds": []
  },
  "warnings": []
}
```

Validation rules:

- reject unknown component types;
- reject hidden or Director-only claims;
- reject summaries that introduce facts absent from the selected text;
- keep links to known ids only;
- keep tags short and player-safe;
- surface uncertainty as warnings instead of inventing certainty.

## Relationship To Sidecars

Mission Components must prevent sidecars from creating a competing version of source truth.

Rules:

- A component's verbatim source is canonical evidence for that component.
- Sidecars may reference component ids through `derivedFromComponentIds`.
- Sidecars may propose promotion into `ship.technicalDebt`, `mission.openAssignments`, `threadLedger.records`, `knowledgeLedger.facts`, or Command Log summaries.
- Sidecars must not overwrite verbatim source text.
- If a sidecar summary materially disagrees with a component source, create a pending conflict or warning instead of silently applying the change.
- Promoted records should retain `sourceComponentIds`; source anchors remain canonical on the linked component records.

First-runtime implementation contract:

- The campaign sidecar scheduler exposes a compact list of reviewed, non-archived Mission Components in sidecar context.
- The context includes component id, title, type, status, summary, source authority, source status, links, and source anchors. It does not ask sidecars to rewrite component verbatim text.
- If a sidecar proposal or operation names known component ids, unknown ids are dropped before apply.
- If the sidecar turn source matches an active component source by ingress id, outcome id, or host message id, the scheduler treats that component as the deterministic source provenance even if the model omits the id.
- Object-valued promoted records at eligible state paths are stamped with `sourceComponentIds`.
- The sidecar journal records `derivedFromComponentIds`, matched component ids, and stamped operation count for audit.
- Stale, deleted, archived, or unreviewed components are not auto-matched as sidecar provenance.

For example, if the component says a coolant seal replacement part is fabricated but installation is pending, a sidecar must not summarize that as "the coolant seal is repaired." That is a different claim.

## Relationship To Scene Handshake

Scene Handshake settles accepted assistant prose when the next player reply treats it as current fiction.

Mission Components are different:

- they are user-triggered;
- they can run before the next player reply;
- they capture selected text, not whole assistant messages by default;
- they preserve player-curated evidence even if no state mutation follows.

Scene Handshake can later see components as dedupe evidence. If the player already captured a component from a message, settlement should avoid producing a lossy duplicate and should prefer linking to the component.

## Relationship To Scene Reconciliation

Scene Reconciliation repairs or syncs Directive state after message edits, deletes, stale source, or selected passage review.

Mission Components are not reconciliation. They should not present themselves as state repair tools.

If a source message is edited or deleted, reconciliation should mark affected components as stale, superseded, or needing review. The component should keep its old source evidence for audit, but the UI should make the source risk visible.

## Relationship To Narrative Threads

Some components may become thread evidence.

Examples:

- Bronn's tactical table game can seed a recurring detail.
- Nayar's quiet awareness can support a later crew interaction thread.
- Cross's repeated yard discrepancy discoveries can support an Engineering trust thread.

This should be opt-in or validator-controlled. Capturing a component should not automatically activate a thread.

## Relationship To CPM

Mission Components should be built as the first user-facing evidence spine for CPM.

CPM can eventually decide:

- which components are relevant to the current turn;
- which components are hard constraints, soft support, unresolved questions, or archived history;
- which prompt lane should receive a component-derived fact;
- when a component conflicts with generated prose;
- when a component has been superseded by later state.

The Matrix should consume reviewed components. It should not rely only on raw chat transcript, Command Log summaries, or sidecar paraphrases.

## Mission Drawer Components Tab

The Mission drawer should add a local **Components** tab after Open World:

```text
Active | Context | Open Threads | Open World | Components
```

The current Mission local-tab model should be reused. Switching to Components should change only the content below the Mission local tabs. It should not refresh the full drawer, bubble to shell route navigation, or snap the drawer scroll to the top.

Recommended tab icon:

- first choice: `fa-solid fa-layer-group`;
- second choice: `fa-solid fa-puzzle-piece` if it remains readable at small size;
- future option: Directive vector ship glyph if the icon pack supports a component/register metaphor.

The Components tab should render:

- compact count chips by type/status;
- search;
- sort by recent, title, type, status, source, or linked crew/system;
- filters for type, status, source authority, crew, ship system, and tags;
- source preview and jump-to-source affordance where host support exists;
- edit/archive controls;
- conflict/stale-source indicators.

Recommended first viewport:

```text
Components
Player-curated source evidence for the active mission.

[Search components...]
[Type] [Status] [Source] [Sort]

All 12  Unresolved 5  Ship 3  Claims 2  Items 1

[component cards...]
```

Default order:

1. Unresolved/current mission components.
2. Recently captured active components.
3. Confirmed/reference components.
4. Archived/superseded components behind disclosure.

The tab should not show hidden notes, raw model output, or unreviewed sidecar proposals as if they are player-owned components.

### Component Cards

Component cards should be dense operational records, not notebook pages.

Recommended card shape:

```text
SHIP ISSUE        UNRESOLVED
Port nacelle coolant seal
Cross assesses failure risk within 200 hours of sustained warp six or above.

Source: Official Packet / Bronn XO briefing / Msg 15
Links: Cross, Engineering, Port Nacelle

[Open Source] [Edit] [Archive]
```

Card rules:

- Title and summary carry the meaning.
- Type and status are small chips, not large headers.
- Source authority must be visible.
- Source-stale or conflict state must be visible near the title or source line.
- Links should be compact chips.
- The verbatim source should be collapsed by default, with local expansion.
- Action buttons should be icon+label where space allows and icon-only with tooltips in narrow rows.
- Cards should not contain nested cards.

Type accents:

| Type | Visual accent |
|---|---|
| `shipIssue` | Amber / engineering. |
| `item` | Blue or lavender. |
| `itemStat` | Blue. |
| `lead` | Teal. |
| `claim` | Lavender. |
| `question` | Coral or amber. |
| `memory` | Muted blue. |
| `quote` | Neutral. |
| `procedure` | Amber / command. |
| `sourceDocument` | Lavender. |

Do not let type accents turn the whole tab into a rainbow ledger. Use thin rails, chips, or small icon frames.

### Filtering And Sorting

Minimum filters:

- Type.
- Status.
- Source authority.
- Linked crew.
- Linked ship system.
- Tag.
- Current mission only / all campaign.

Sort options:

- Recently captured.
- Recently updated.
- Type.
- Status.
- Source order.
- Title.

Search should match:

- title;
- summary;
- tags;
- source text;
- linked crew names;
- linked ship systems;
- source authority;
- source message id when present.

Filter controls should be compact, but their active state must be obvious. If filters hide every component, the empty state should offer **Clear Filters**.

### Source Inspection

Every component needs a source affordance.

V1 behavior:

- **Open Source** scrolls the host chat to the source message when available.
- If exact selection highlighting is not yet reliable, highlight the whole source message row.
- Show source metadata in the card: authority, message role, message id, and captured time.
- If source is stale, edited, deleted, or unavailable, show that state directly on the card.

Later behavior:

- temporarily highlight the captured text range inside the message;
- open a source inspector with verbatim text, source hash, current message text, and mismatch status;
- show sidecar or CPM derivations that reference the component.

Source inspection is a trust feature. The UI should always make it easy to answer: "Where did this come from?"

### Empty And Guard States

Empty state for an active campaign:

```text
No Mission Components yet.
Highlight useful chat text, then use the Directive ship button to add it here.
```

Wrong-chat/no-campaign states should follow the existing Mission/Crew/Ship/Log current-chat guard language and should not imply the user can capture into the wrong save.

Filtered-empty state:

```text
No components match these filters.
```

Include **Clear Filters**.

### Mobile Layout

On phone-width layouts:

- render Components as one column;
- keep search first;
- collapse filter controls behind a compact **Filters** button or disclosure;
- keep count chips horizontally scrollable;
- collapse source excerpts by default;
- open edit mode as a full-height modal/drawer instead of inline editing;
- let the Mission drawer body own scrolling;
- avoid nested scrollboxes inside component lists.

The last card and final action row must remain reachable above the mobile bottom route bar.

### Frontend Ownership

Suggested first implementation ownership:

| Surface | Suggested module |
|---|---|
| Host text-selection affordance | `src/hosts/sillytavern/mission-components-capture.js` |
| Runtime actions | `missionComponents.captureSelection`, `missionComponents.save`, `missionComponents.update`, `missionComponents.archive`, `missionComponents.openSource` |
| Mission tab renderer | Start in `src/ui/mission-panel.js`, then extract to `src/ui/mission-components-panel.js` once it grows. |
| Shared record helpers | Keep local until another route needs them. |
| Styling | `styles/directive.css` under the Mission console section. |

Build order should be:

1. Capture affordance.
2. Review popover.
3. Save runtime action.
4. Components tab.

The Components tab has low value without frictionless capture. The capture path is unsafe without review.

## Prompting And Narration Boundaries

Mission Components are not automatically prompt injections.

Before full CPM consumption exists, components may be used conservatively in player-safe prompt context only when:

- the source is not stale;
- the component is active, unresolved, confirmed, or disputed;
- the current scene references linked crew, ship systems, mission, or tags;
- the component is not merely a quote with no operational relevance;
- the prompt text preserves uncertainty and authority.

Generated narration must not cite hidden derived fields. If using a component, the prompt context should prefer the title, type, status, summary, and source authority, not raw diagnostics.

## Editing And Lifecycle

Player actions:

- edit title;
- edit summary;
- change type;
- change status;
- add/remove tags;
- add/remove links;
- archive;
- duplicate as a new component;
- promote to a domain-specific proposal when supported later.

System actions:

- mark source stale after edit/delete/reconciliation;
- mark superseded when a later component or committed state replaces it;
- flag conflicts;
- link sidecar or Matrix derivations;
- preserve audit metadata.

Deletion should be conservative. Prefer archive by default. Hard deletion can wait until storage lifecycle and undo behavior are defined.

## Example: Bronn Briefing Packet

Highlighted source:

```text
Coolant seal, port nacelle, junction 7-C. Yard report stated new seal installed. Seal is holding within tolerance but shows micro-fracture pattern consistent with age. Cross assessment: will fail within 200 hours of sustained warp six or above. Status: Replacement part fabricated. Installation pending - Cross wants to do it during a scheduled stop, not during transit.
```

Utility proposal:

```json
{
  "title": "Port nacelle coolant seal",
  "type": "shipIssue",
  "status": "unresolved",
  "summary": "Cross assesses the port nacelle coolant seal will fail within 200 hours of sustained warp six or above. A replacement part is fabricated, but installation is pending and should wait for a scheduled stop.",
  "sourceAuthority": "officialPacket",
  "tags": ["post-refit", "engineering", "port nacelle"],
  "links": {
    "crewIds": ["imani-cross"],
    "shipSystemIds": ["ship.port-nacelle"],
    "missionIds": ["prelude-a-ship-underway"],
    "componentIds": []
  },
  "warnings": []
}
```

Later promotion could create or update a ship technical debt record, but the promoted record should retain `sourceComponentIds`.

## Implementation Slices

### Slice 1: Design And State Contract

- Add this design document.
- Use `knowledgeLedger.components` as the first persistence root.
- Add schema or validator coverage for component records.
- Define source-anchor behavior for selected text.

### Slice 2: Highlight Capture Affordance

- Detect text selection inside active bound campaign chat messages.
- Render the ship-icon **Add Component to Mission** affordance near the selection endpoint.
- Guard wrong-chat, disabled-extension, stale-source, and non-message selections.
- Preserve exact selected text and host message metadata.
- Reference Memory Books' `SillyTavern-MemoryBooks/clipManager.js` selection detection and floating-button lifecycle when implementing the affordance.
- Reject or ask for a narrower selection when selected text crosses multiple message rows.
- Verify the affordance clamps to viewport and does not cover native SillyTavern controls.

### Slice 3: Utility Categorization

- Add a narrow Utility request for component classification.
- Validate structured JSON.
- Keep model output editable and non-authoritative.
- Add fallback local classification when the provider is unavailable.

### Slice 4: Review Popover And Save

- Render the compact review popover.
- Support fast mode, edit mode, provider-pending state, provider-unavailable fallback, and warning review.
- Allow title/type/status/source-authority/summary/tag/link edits.
- Save accepted records to campaign state through the runtime transaction path.
- Refresh Mission view after save.
- Offer **Open Components** after save without forcing the drawer open by default.

### Slice 5: Mission Components Tab

- Add local Mission drawer tab: `Open World | Components`.
- Render search, sort, filters, counts, cards, and source previews.
- Add edit/archive support.
- Add empty, wrong-chat, and stale-source states.
- Preserve Mission drawer scroll when switching subtabs.
- Avoid nested scrollboxes; let the drawer body own page flow.
- Add responsive phone layout with collapsed filters and single-column cards.

### Slice 6: Sidecar And Reconciliation Integration

- Make sidecars link to `derivedFromComponentIds` when they summarize component-covered source.
- Mark source-stale components after relevant edits/deletes.
- Surface conflicts instead of silently applying contradictory summaries.
- Keep promoted records source-linked.
- Expose reviewed component context to sidecars and stamp promoted object records with `sourceComponentIds`.

### Slice 7: CPM Integration

- Let CPM consume reviewed components.
- Add relevance scoring and prompt-lane projection rules.
- Add contradiction checks between generated prose and active components.
- Add diagnostics explaining why a component was injected, skipped, stale, or blocked.

## Acceptance Criteria

Mission Components are ready for a first runtime pass when:

- selecting chat text in the active campaign chat shows **Add Component to Mission**;
- capture works before the next player reply;
- saved components preserve verbatim selected text and source anchors;
- Utility categorization is reviewable and editable;
- Mission has a **Components** local tab beside Open World;
- switching Mission subtabs stays local and preserves drawer scroll;
- components can be searched, sorted, filtered, edited, and archived;
- component cards show type, status, source authority, source metadata, links, and stale/conflict state when present;
- **Open Source** can navigate to or identify the source message;
- sidecars do not overwrite component source text;
- promoted state links back to component ids;
- edited or deleted source messages mark affected components stale or review-needed;
- hidden state and Director-only data never appear in component records;
- phone-width layout has reachable filters, cards, source excerpts, and final actions without nested scroll traps;
- docs and tests cover the source-preservation contract.

## Non-Goals

This pass should not add:

- a SillyTavern lorebook integration;
- automatic whole-chat memory scraping;
- automatic item stat mutation without review;
- full CPM implementation;
- visual inventory art, item equipment slots, or RPG loot mechanics;
- hidden truth reveal UI;
- Command Bearing awards from captures;
- generic notebook pages disconnected from campaign state.
