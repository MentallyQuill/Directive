# Define Selection

Status: pre-alpha target design  
Primary owner: Runtime / SillyTavern host adapter / Utility provider lane  
Related docs: [Mission Components](MISSION_COMPONENTS.md), [Directive Assist](DIRECTIVE_ASSIST.md), [Scene Handshake Protocol](SCENE_HANDSHAKE_PROTOCOL.md), [Continuity Projection Matrix (CPM)](CONTINUITY_PROJECTION_MATRIX.md), [Model Calls And Provider Routing](../technical/MODEL_CALLS_AND_PROVIDER_ROUTING.md)

## Purpose

Define is a chat-side context explainer for highlighted text.

When the player selects a name, object, ship detail, mission phrase, or loaded sentence in the active campaign chat, Directive should offer a compact `?` affordance beside the existing Mission Components capture button. Clicking it opens a scrollable pop-up that explains what the selection means in the current scene, using player-safe in-universe context.

```text
Highlighted text is the focus.
The current scene supplies context.
The Utility lane explains, but does not commit state.
```

Define is for fast comprehension. It should help the player understand the scene, protocol, stakes, and likely relevance of the highlighted thing without opening the full Directive drawer or creating a durable record.

## Core Decision

Use the same highlighted-text capture mechanics as Mission Components, but keep Define read-only and ephemeral by default.

The chat-side selection affordance should show two sibling buttons when the selection is valid:

- ship button: `Add Component to Mission`;
- question-mark button: `Define Selection`.

The Define button should use the Utility provider by default through an explicit model-call role. It should return structured JSON that the UI renders into a clean, scrollable panel. If the Utility provider fails, the panel should show a conservative local fallback with the selected text, source metadata, and any deterministic matches from crew, ship, mission, and component indexes.

Define should not save a component, mutate campaign state, settle continuity, award Command Bearing, or expose hidden state. The Define panel should not include an `Add Component` action. If the player wants to preserve evidence, they should use the separate ship button beside Define and enter the normal Mission Components review flow.

## Relationship To Existing Features

### Mission Components

Mission Components preserve evidence. Define explains context.

Mission Components are durable, player-reviewed records stored in campaign state. Define is a temporary briefing generated from the selected text and current player-safe context. A Define explanation can help the player decide whether a passage is worth saving, but it is not itself a source of truth.

### Directive Assist

Directive Assist helps compose player-character input before sending a message. Define explains something already visible in the chat. It should not rewrite the player's message or suggest an optimized answer unless the output category explicitly includes follow-up questions or protocol cautions.

### Scene Handshake And Reconciliation

Scene Handshake turns accepted assistant prose into validated campaign state. Scene Reconciliation repairs edited or selected transcript ranges. Define is neither. It may describe what a phrase appears to mean, but it must not settle generated prose as authoritative state.

## User Flow

1. The player highlights text in the active bound campaign chat.
2. Directive validates that the selection belongs to one visible message in the active campaign chat.
3. Directive shows the existing Mission Components ship button and the new Define `?` button near the selection.
4. The player clicks `Define Selection`.
5. Directive opens a pending pop-up anchored near the selected text.
6. The Utility lane receives the selected text, source message metadata, recent scene context, and player-safe campaign indexes.
7. Directive renders the structured result as compact sections.
8. The player scrolls and closes the Define panel when finished.

The first version should reject cross-message selections. Multi-message definitions can wait until source-range anchoring is mature.

## Shared Output Shape

Every Define result should share a stable core shape so the panel is predictable across categories.

Recommended visible sections:

- `Subject`: cleaned title for the highlighted thing.
- `Type`: one primary category and optional secondary categories.
- `Short Answer`: two to four sentences in plain in-universe language.
- `Scene Context`: what the current scene establishes about the subject.
- `Why It Matters`: the operational, social, mission, or continuity relevance.
- `Known / Inferred / Unknown`: separate established facts from reasonable interpretation and open uncertainty.
- `Related`: linked crew, ship systems, mission threads, places, components, or log entries.
- `Player-Safe Limits`: a brief note when the system is intentionally withholding hidden state or when the selection is ambiguous.
- `Source`: collapsed verbatim selected text plus source message metadata.

Type-specific sections should appear only when useful:

- `Proper Address`;
- `Protocol`;
- `Operational Meaning`;
- `Source Reliability`;
- `Relationship Context`;
- `Risks`;
- `Follow-Up Questions`;
- `Timeline`;
- `Terminology`;
- `Subtext`.

## Structured Result Contract

The Utility role should return strict JSON. Suggested shape:

```json
{
  "subject": "Commander Imani Cross",
  "primaryType": "character",
  "secondaryTypes": ["rankTitleProtocol", "relationshipSocialDynamic"],
  "confidence": "high",
  "shortAnswer": "Commander Cross is the Breckenridge's chief engineer. In this scene, she is tied to the command-network handoff problem and should be addressed by rank or billet in formal contexts.",
  "sections": [
    {
      "id": "properAddress",
      "title": "Proper Address",
      "items": [
        "Use Commander Cross in formal address.",
        "Chief Engineer is appropriate when referring to her shipboard role."
      ]
    }
  ],
  "known": [
    "Cross is associated with Engineering and the command-network handoff issue."
  ],
  "inferred": [
    "A direct technical question is likely appropriate if the player is acting as XO."
  ],
  "unknown": [
    "The current selection alone does not prove her private view of the captain's orders."
  ],
  "related": {
    "crewIds": ["crew.imani-cross"],
    "shipSystemIds": ["ship.command-network", "ship.engineering"],
    "missionIds": [],
    "componentIds": []
  },
  "warnings": []
}
```

The renderer should tolerate missing sections, but the model-call validator should require `subject`, `primaryType`, `shortAnswer`, and at least one of `known`, `inferred`, or `unknown`.

## Source Inputs

Define can use:

- selected text;
- selected message text;
- message role, sender, host message id, text hash, and selection offsets;
- accepted selected swipe text for the source message when available;
- recent visible scene window;
- active campaign title, player role, player rank, and player dossier summary;
- current mission phase and player-safe mission context;
- visible open threads, formal objectives, and open-world work;
- crew roster player-safe fields;
- ship dataset player-safe fields;
- saved Mission Components;
- Command Log summaries;
- package glossary, procedures, and public setting context;
- source authority and stale/wrong-chat guards.

Define must avoid:

- hidden crew motives or raw relationship scores;
- unrevealed mission truths;
- Director-only pressure state;
- discarded assistant swipes;
- unaccepted generated drafts;
- raw prompts, model diagnostics, or provider output;
- unsupported facts invented from franchise memory when package context is silent.

## Implementation Mechanics

Define should be implemented as a read-only lookup pipeline with one host-side affordance, one runtime action, one domain module, and one Utility generation role.

### Host Selection Affordance

The first implementation should extend the existing SillyTavern highlighted-text capture surface rather than creating a second independent selection system.

Primary host file:

```text
src/hosts/sillytavern/mission-components-capture.js
```

The current Mission Components button logic should be generalized into a compact selection toolbar that can render two sibling buttons for the same validated selection:

- ship glyph: `Add Component to Mission`;
- question-mark glyph: `Define Selection`.

Both buttons should use the same source validation and positioning state:

- selection must be inside one visible `#chat .mes[mesid]` row;
- anchor and focus must remain inside that row's `.mes_text`;
- active Directive campaign chat must match the current SillyTavern chat id;
- selected text must be non-empty;
- source message must not be under Scene Reconciliation review;
- DOM-only objects, ranges, and rects must not be passed to runtime actions.

The Define button should call:

```text
defineSelection.lookup
```

with the same sanitized selection payload shape used by Mission Components:

```json
{
  "selection": {
    "selectedText": "Commander Cross",
    "chatId": "active-chat-id",
    "host": "sillytavern",
    "hostMessageId": "57",
    "messageText": "Full visible message text...",
    "selectionStart": 118,
    "selectionEnd": 133,
    "message": {
      "hostMessageId": "57",
      "id": "57",
      "index": 57,
      "text": "Full visible message text...",
      "role": "assistant",
      "isUser": false,
      "isSystem": false
    }
  }
}
```

### Runtime Action Path

Register a new runtime action in:

```text
src/extension/runtime-mount.js
```

Suggested action record:

```text
id: defineSelection.lookup
category: defineSelection
label: Define Selection
handler: runtimeApp.defineSelectionLookup(payload)
```

The app method should live beside the Mission Components runtime methods in:

```text
src/runtime/runtime-app.mjs
```

The runtime method should:

1. initialize runtime state;
2. refresh current chat campaign scope;
3. enforce active-chat save guards;
4. re-read the source message through `runtimeHost.chat.getMessage(hostMessageId)`;
5. re-resolve stale/off-by-one rendered text against recent live `context.chat` messages when needed;
6. build the Define context bundle;
7. call `prepareDefineSelection(...)`;
8. return normalized Define output plus the current view envelope.

Define should reuse the Mission Components source verification semantics. If the selected text no longer appears in the live selected source, the action should fail with a concise stale-selection message instead of asking Utility to guess.

### Domain Module

Add a focused runtime module:

```text
src/runtime/define-selection.mjs
```

Suggested exported responsibilities:

- `DEFINE_SELECTION_CATEGORIES`;
- `DEFINE_SELECTION_SECTION_PROFILES`;
- `sourceFromDefineSelection(payload)`;
- `buildDefineContextBundle(input)`;
- `classifyDefineSelectionLocal(bundle)`;
- `buildDefineSelectionRequest(bundle, classification)`;
- `normalizeDefineSelectionResult(raw, bundle, classification)`;
- `deterministicDefineFallback(bundle, classification)`;
- `prepareDefineSelection(input)`.

The module should stay read-only. It should never call the state-delta gateway, never persist campaign state, and never return state operations.

### Context Bundle

Define should not use only the selected message. The runtime should build a source-centered and scene-centered bundle.

Suggested bundle shape:

```json
{
  "kind": "directive.defineSelection.context.v1",
  "selection": {
    "selectedText": "Commander Cross",
    "selectionHash": "hash",
    "selectionStart": 118,
    "selectionEnd": 133
  },
  "source": {
    "host": "sillytavern",
    "chatId": "chat-id",
    "hostMessageId": "57",
    "messageRole": "assistant",
    "messageName": "Directive",
    "messageTextHash": "hash",
    "sourceIntegrity": "clean"
  },
  "sourceWindow": [
    { "id": "54", "role": "user", "name": "Player", "text": "..." },
    { "id": "55", "role": "assistant", "name": "Directive", "text": "..." },
    { "id": "57", "role": "assistant", "name": "Directive", "text": "..." }
  ],
  "currentSceneWindow": [
    { "id": "64", "role": "user", "name": "Player", "text": "..." },
    { "id": "65", "role": "assistant", "name": "Directive", "text": "..." }
  ],
  "scene": {
    "missionTitle": "Ashes of Peace",
    "phaseLabel": "Ready-room handover",
    "location": "Ready room",
    "currentQuestion": "Which refit discrepancy does the XO address first?",
    "immediateStakes": "Departure readiness and senior-staff trust.",
    "presentCharacterIds": ["crew.whitaker", "crew.player"]
  },
  "player": {
    "name": "Sam Vickers",
    "rank": "Commander",
    "billet": "Executive Officer"
  },
  "indexes": {
    "crew": [],
    "shipSystems": [],
    "missions": [],
    "threads": [],
    "components": [],
    "commandLog": [],
    "glossary": []
  },
  "guards": {
    "wrongChat": false,
    "staleSource": false,
    "hiddenStateExcluded": true,
    "discardedSwipesExcluded": true
  }
}
```

`sourceWindow` should usually include the selected message plus a small number of messages before and after it, such as five before and three after when available. This lets Define understand the local sentence and nearby referents.

`currentSceneWindow` should usually include the latest player-safe visible messages, such as the last eight to twelve messages. This lets Define answer from the current scene state even when the selected source is older.

The bundle should also include the player-safe campaign projection already produced by the prompt-context code path, or a narrowed equivalent. It should include mission, scene, ship, crew, relationship perceptions, visible open work, Command Log summaries, and saved Mission Components, but not hidden mechanics or raw relationship values.

### Accepted Swipe And Source Truth

Define should use the same source-truth rules as current continuity and Mission Components work:

1. selected DOM text is the focus;
2. live normalized `context.chat` is the source authority for the message;
3. accepted selected swipe text is valid when it is the selected visible assistant variant;
4. recent live messages may be used to re-resolve rendered Markdown or off-by-one source captures;
5. raw JSONL physical line number, discarded swipes, rejected drafts, and stale message snapshots are not source truth.

The source bundle should carry hashes and source-integrity flags rather than raw internals.

### Category Registry

The output category list below should become a code-owned registry, not only prose. The registry is how Define knows what kind of thing it is defining and which sections should be produced.

Suggested category ids:

```text
character
groupFactionInstitution
speciesCulture
rankTitleProtocol
locationPlace
shipSystemTechnicalTerm
objectItemEvidence
missionQuestThread
eventIncident
procedureRuleLaw
claimRumorUnverified
relationshipSocialDynamic
threatHazardRisk
resourceConstraint
timelineTimeReference
acronymJargonProperNoun
toneSubtext
ambiguousSelection
```

Each registry entry should define:

```json
{
  "id": "character",
  "label": "Character / Person",
  "matchSignals": ["crew-name", "alias", "rank-plus-name", "local-pronoun-reference"],
  "requiredSections": ["shortAnswer", "sceneContext", "knownInferredUnknown"],
  "optionalSections": ["properAddress", "relationshipContext", "risks", "followUpQuestions"],
  "relatedIndexes": ["crew", "mission", "components", "commandLog"],
  "safetyPolicy": "player-safe-visible-only"
}
```

The deterministic classifier should score candidate categories before Utility is called. Utility should receive the top category candidates and the full registry descriptions for those candidates, not permission to invent arbitrary types.

Useful local match signals:

- crew names, short names, family names, aliases, rank-plus-name patterns;
- package faction, institution, department, and location names;
- ship system names, aliases, technical-debt labels, restrictions, and damage records;
- mission objective titles, thread names, quest ids, open assignments, and component titles;
- time patterns such as stardates, shifts, deadlines, relative dates, and elapsed-time phrases;
- claim markers such as `says`, `claims`, `alleges`, `according to`, `reported`;
- protocol markers such as `chain of command`, `quarantine`, `standing order`, `authorization`;
- jargon markers such as uppercase acronyms, hyphenated technical nouns, and glossary matches;
- tone markers such as `with respect`, unusually formal address, evasion, silence, and gestures;
- low-information selections such as pronouns, `the issue`, `that`, or generic noun phrases.

The local classifier should return:

```json
{
  "primaryGuess": "character",
  "candidateTypes": [
    { "id": "character", "score": 0.92, "signals": ["crew-name", "rank-plus-name"] },
    { "id": "rankTitleProtocol", "score": 0.58, "signals": ["rank-token"] }
  ],
  "matchedRecords": {
    "crewIds": ["crew.imani-cross"],
    "shipSystemIds": ["ship.command-network"],
    "missionIds": [],
    "componentIds": []
  },
  "ambiguous": false
}
```

If no category clears the confidence threshold, the runtime should force `ambiguousSelection` and ask Utility to explain possible referents instead of guessing.

### Utility Request

The Utility request should be narrow and structured. It should say:

- define the highlighted selection in the current scene;
- choose `primaryType` only from the supplied candidate categories;
- use the category profile to decide which sections to fill;
- use source-window text for local meaning;
- use current-scene window and player-safe projection for current relevance;
- separate `known`, `inferred`, and `unknown`;
- cite related ids only from supplied indexes;
- do not reveal hidden state, private motives, discarded swipes, or future truth;
- return strict JSON only.

The request should include a compact category profile block for the candidate categories, for example:

```json
{
  "allowedPrimaryTypes": ["character", "rankTitleProtocol", "ambiguousSelection"],
  "categoryProfiles": [
    {
      "id": "character",
      "label": "Character / Person",
      "requiredSections": ["shortAnswer", "sceneContext", "knownInferredUnknown"],
      "optionalSections": ["properAddress", "relationshipContext", "risks"]
    }
  ],
  "bundle": {}
}
```

This keeps the category list authoritative in code while still letting Utility perform contextual synthesis.

### Result Normalization And Validation

The raw Utility output should never be rendered directly. Normalize it first.

Validation rules:

- `primaryType` must be one of the registry ids;
- unknown or low-confidence types become `ambiguousSelection`;
- section ids must be known section profiles;
- related crew, ship, mission, thread, component, and log ids must exist in the context bundle;
- `known`, `inferred`, and `unknown` arrays must be separate;
- private motive claims must be downgraded from `known` to `inferred` or removed with a warning;
- unsupported proper nouns should be moved to `unknown` unless backed by source text or indexes;
- result text should be bounded to pop-up-friendly lengths;
- raw state keys, prompts, provider reasoning, diagnostics, and hidden values should be stripped;
- provider parse failures should use deterministic fallback.

The normalized result should be the only object the UI receives.

### Session Cache

Define may cache normalized results for the current browser session. The cache key should include:

```text
chatId + hostMessageId + selectionHash + selectionStart + selectionEnd + campaignRevision + promptContextRevision
```

The cache should clear or miss on source edit/delete, selected-swipe change, campaign save load, prompt-context revision change, wrong-chat guard, or Directive disable.

## Output Categories

Define should classify the highlighted selection into one primary category and, when useful, one or more secondary categories. The categories below are the target vocabulary for the first full design pass.

### Character / Person

Use for named individuals, pronouns with clear local referents, or short phrases that point at a person.

Returned information should include:

- full name or best visible identifier;
- rank, billet, department, or social position;
- how to address them in the current roleplay context;
- what the player character likely knows about them;
- current scene role and why they are present;
- relationship to the player character, limited to player-safe knowledge;
- active tensions, obligations, or caution flags.

Examples:

- Highlight: `Commander Cross`
  - Subject: Commander Imani Cross.
  - Proper address: `Commander Cross`; `Chief Engineer` when referring to her billet.
  - Scene context: tied to the command-network handoff and Engineering readiness.
  - Why it matters: likely point of contact for refit risk and technical constraints.
  - Unknown: her private confidence level unless already surfaced.

- Highlight: `Bronn`
  - Subject: Hadrik Bronn.
  - Proper address: rank if in formal bridge context; family name can read familiar or blunt depending on relationship.
  - Scene context: tactical/security perspective and Tellarite argumentative style may shape how advice is phrased.
  - Relationship context: distinguish professional challenge from personal hostility when supported by known context.

### Group / Faction / Institution

Use for organizations, crews, departments, agencies, factions, political bodies, inspection teams, and shipboard groups.

Returned information should include:

- what the group is;
- who it answers to or represents;
- how it relates to Starfleet, the ship, the mission, or local politics;
- likely authority boundaries;
- visible interests, pressures, or conflicts;
- relevant members currently known to the player.

Examples:

- Highlight: `yard inspection team`
  - Subject: the Starfleet or dockyard personnel reviewing the post-refit work.
  - Scene context: their findings may affect whether the ship is cleared for sustained operations.
  - Why it matters: they can create delays, restrictions, or accountability questions.
  - Unknown: whether any individual inspector is biased or compromised unless established.

- Highlight: `Operations`
  - Subject: shipboard Operations department.
  - Operational relevance: coordinates systems handoff, resources, communications, and bridge workflow.
  - Related: Operations chief, command-network systems, current mission logistics.

### Species / Culture

Use for species, cultures, cultural practices, and etiquette cues.

Returned information should include:

- plain-language species or cultural context;
- likely etiquette or communication norms in the current scene;
- what the player character would reasonably know;
- cautions against stereotyping;
- local character-specific differences when known;
- connection to the highlighted moment.

Examples:

- Highlight: `Tellarite`
  - Subject: Tellarite cultural context.
  - Scene context: argumentative directness can be normal professional engagement, not automatically disrespect.
  - Player-safe caution: do not reduce Bronn to species behavior if his personal history is relevant.
  - Follow-up: direct, specific questions may be better received than vague reassurance.

- Highlight: `Vulcan protocol`
  - Subject: a formal logic- and procedure-centered norm.
  - Protocol: expect precision, explicit terms, and reduced emotional framing.
  - Unknown: the individual's personal preference unless visible in scene.

### Rank / Title / Protocol

Use for ranks, billets, formal titles, chain-of-command phrases, and protocol names.

Returned information should include:

- what the title or protocol means;
- relative authority;
- how the player character should address or refer to it;
- whether the current scene is formal, informal, urgent, or disciplinary;
- likely consequences of ignoring the protocol;
- distinctions between rank, billet, and temporary assignment.

Examples:

- Highlight: `XO`
  - Subject: Executive Officer.
  - Operational meaning: second-in-command and primary coordinator for crew readiness and execution.
  - Player relevance: if the player is XO, this defines authority and responsibility, not unlimited power.
  - Protocol: captain retains command authority; department heads retain technical ownership.

- Highlight: `relief of command`
  - Subject: formal removal of a commanding officer from active command authority.
  - Why it matters: severe procedural step with medical, legal, or command-fitness implications.
  - Unknown: whether conditions are met unless established by state.

### Location / Place

Use for ship rooms, decks, planets, colonies, stations, regions, sectors, physical areas, and tactical spaces.

Returned information should include:

- where it is or what kind of place it is;
- why people go there;
- current scene relevance;
- environmental or access constraints;
- related crew, systems, or mission threads;
- any known hazards or political stakes.

Examples:

- Highlight: `shuttlebay two`
  - Subject: a secondary shuttle operations area.
  - Operational meaning: launch, recovery, inspection, or maintenance staging.
  - Why it matters: shuttle availability can constrain away missions, evacuation, or repairs.
  - Related: flight control, engineering, maintenance crews.

- Highlight: `Asterion Reach`
  - Subject: campaign region or operational area.
  - Scene context: the ship's local mission pressures and political environment matter here.
  - Unknown: specific hidden actors or future events.

### Ship System / Technical Term

Use for ship systems, technical jargon, engineering terms, bridge systems, medical systems, sensors, weapons, propulsion, power, and comms.

Returned information should include:

- plain in-universe definition;
- what the system does aboard ship;
- why it matters in the current scene;
- operational limits or failure modes;
- relevant department or officer;
- practical next questions a commander might ask.

Examples:

- Highlight: `command-network handoff`
  - Subject: transfer or synchronization of ship command/control authority across systems.
  - Operational meaning: affects whether bridge orders, department status, and automated routing line up reliably.
  - Why it matters: a bad handoff can create delays, conflicting status, or unsafe command execution.
  - Related: Operations, Engineering, command codes.

- Highlight: `lateral sensor array`
  - Subject: sensor system used for scanning and situational awareness.
  - Risk: degraded readings can make tactical or scientific conclusions unreliable.
  - Follow-up: ask whether the variance is calibration, damage, interference, or software drift.

### Object / Item / Evidence

Use for physical items, records, padds, samples, equipment, weapons, parts, documents, medical results, and tangible evidence.

Returned information should include:

- what the item appears to be;
- who has it or where it is;
- what it proves, suggests, or fails to prove;
- source reliability;
- chain-of-custody or handling concerns when relevant;
- related mission or component records.

Examples:

- Highlight: `briefing packet`
  - Subject: a compiled source document.
  - Source reliability: stronger than casual dialogue if official, weaker if it includes personal annotations.
  - Why it matters: can preserve tasking, constraints, and disputed details.
  - Define caution: distinguish official packet text from an officer's personal assessment.

- Highlight: `coolant seal`
  - Subject: a physical engineering component.
  - Operational meaning: part of a thermal or coolant path.
  - Risk: failure can cascade into propulsion or power restrictions.
  - Related: port nacelle, Engineering, repair schedule.

### Mission / Quest / Thread

Use for active assignments, side leads, follow-up work, open orders, unresolved objectives, investigation branches, and named mission threads.

Returned information should include:

- which mission or thread it appears tied to;
- current objective or open question;
- why the detail matters now;
- known blockers or constraints;
- involved crew or departments;
- possible next questions, framed as context rather than commands.

Examples:

- Highlight: `yard-work discrepancies`
  - Subject: a mission or side-thread about refit inconsistencies.
  - Scene context: likely tied to ship readiness and accountability.
  - Why it matters: could affect departure clearance, crew trust, or technical safety.
  - Follow-up questions: which discrepancies are verified, who signed off, what still blocks operations?

- Highlight: `meet Bronn during alpha shift`
  - Subject: an assignment or thread.
  - Player relevance: scheduled interpersonal and tactical follow-up.
  - Timeline: alpha shift implies a near-term duty window, not an indefinite social visit.

### Event / Incident

Use for prior accidents, reported anomalies, battles, failed inspections, scene beats, discoveries, injuries, betrayals, command decisions, and recent turning points.

Returned information should include:

- what happened, in player-safe terms;
- when it happened relative to the current scene;
- who was involved;
- what changed because of it;
- what remains unresolved;
- whether the selection refers to a confirmed event, report, rumor, or interpretation.

Examples:

- Highlight: `the transporter incident`
  - Subject: a prior operational event.
  - Scene context: may shape trust, safety margins, or a character's reaction.
  - Known: only the surfaced facts of the incident.
  - Unknown: private trauma or hidden technical cause unless already revealed.

- Highlight: `failed inspection`
  - Subject: a readiness or compliance event.
  - Why it matters: can affect ship deployment, accountability, and department pressure.
  - Follow-up: what failed, who verified it, what workaround exists?

### Procedure / Rule / Law

Use for Starfleet protocols, regulations, medical rules, security restrictions, legal constraints, diplomatic norms, technical procedures, and standing orders.

Returned information should include:

- what the rule or procedure governs;
- who has authority to invoke or waive it;
- what compliance looks like in the scene;
- likely consequences of violating it;
- whether it is formal law, shipboard practice, cultural norm, or technical procedure;
- what the player character can reasonably ask or order.

Examples:

- Highlight: `quarantine protocol`
  - Subject: medical or biohazard containment procedure.
  - Protocol: restrict movement, isolate affected people or spaces, preserve logs, coordinate medical and command authority.
  - Player relevance: command can direct compliance but should respect medical authority.

- Highlight: `chain of command`
  - Subject: formal command authority sequence.
  - Why it matters: determines who can give orders when the captain is absent, incapacitated, or conflicted.
  - Caution: informal influence is not the same as command authority.

### Claim / Rumor / Unverified Information

Use for statements that may be true, biased, incomplete, disputed, or sourced from a character's perspective.

Returned information should include:

- who made the claim;
- what exactly is claimed;
- what evidence supports it;
- what remains unverified;
- source reliability and possible bias;
- how the player might test it in-universe.

Examples:

- Highlight: `Cross says the seal will fail within 200 hours`
  - Subject: technical risk claim.
  - Source reliability: likely strong if Cross is speaking from Engineering evidence, but still a claim until verified or logged as official.
  - Known: Cross made or is associated with the assessment.
  - Unknown: whether the estimate accounts for all operating conditions.

- Highlight: `they covered it up`
  - Subject: accusation or rumor.
  - Caution: do not treat as confirmed without evidence.
  - Follow-up: ask who benefits, what record changed, and what independent source exists.

### Relationship / Social Dynamic

Use for highlighted behavior, address choices, silence, formal phrasing, avoided eye contact, tension, trust, deference, challenge, or familiarity.

Returned information should include:

- what the social signal may mean;
- who is involved;
- what the current scene supports;
- alternate interpretations;
- relationship context visible to the player;
- how rank, culture, pressure, or prior events may shape the moment.

Examples:

- Highlight: `she did not use his rank`
  - Subject: a possible informality or pointed omission.
  - Inferred: could signal familiarity, frustration, urgency, or deliberate disrespect depending on context.
  - Unknown: private intent.
  - Player relevance: a commander may notice tone without assuming motive.

- Highlight: `Bronn looked away`
  - Subject: nonverbal social cue.
  - Scene context: may indicate discomfort, calculation, anger, or restraint.
  - Caution: do not overread a single gesture as hidden truth.

### Threat / Hazard / Risk

Use for tactical threats, technical hazards, medical risks, legal danger, political exposure, crew morale risks, environmental dangers, or operational vulnerabilities.

Returned information should include:

- what kind of risk it is;
- who or what is exposed;
- severity if visible;
- current mitigations;
- what information is missing;
- relevant departments and possible response lanes.

Examples:

- Highlight: `radiation spike`
  - Subject: environmental or systems hazard.
  - Risk: may affect crew safety, sensors, shields, or equipment.
  - Follow-up: ask location, duration, exposure level, and containment status.

- Highlight: `political exposure`
  - Subject: diplomatic or reputational risk.
  - Why it matters: command choices may affect alliances, local trust, or Starfleet accountability.
  - Unknown: hidden faction motives.

### Resource / Constraint

Use for time, personnel, authority, sensor range, repair materials, shuttle availability, medical capacity, energy budget, command bandwidth, or legal room to act.

Returned information should include:

- what resource or limit is being referenced;
- current availability if visible;
- why it constrains the player's choices;
- tradeoffs or dependencies;
- who can adjust or report on it;
- what to verify before acting.

Examples:

- Highlight: `six hours before departure`
  - Subject: time constraint.
  - Operational relevance: forces prioritization and may limit repair, investigation, or crew meetings.
  - Follow-up: which work must happen before departure and which can continue underway?

- Highlight: `only one shuttle is certified`
  - Subject: resource limit.
  - Why it matters: affects away team planning, emergency options, and mission timing.
  - Related: flight control, Engineering, shuttle maintenance.

### Timeline / Time Reference

Use for stardates, relative time phrases, duty shifts, campaign chronology, deadlines, elapsed time, and references to earlier scenes.

Returned information should include:

- normalized plain-language meaning;
- relation to current ship time or scene phase when known;
- whether it is exact, approximate, or narrative shorthand;
- associated deadlines or sequence constraints;
- what the player should not assume from vague phrasing.

Examples:

- Highlight: `alpha shift`
  - Subject: duty-period reference.
  - Scene context: implies a scheduled active-duty window, often useful for finding specific crew.
  - Unknown: exact clock time unless the current campaign state has established it.

- Highlight: `six days ago`
  - Subject: relative chronology.
  - Define behavior: anchor to known campaign timeline if available; otherwise mark as relative to the speaker's current scene.
  - Caution: do not rewrite stardate history from one phrase.

### Acronym / Jargon / Proper Noun

Use for abbreviations, Starfleet terms, technical shorthand, alien names, named operations, ship-specific nicknames, or package-specific proper nouns.

Returned information should include:

- expansion or plain-language definition;
- whether it is a canon-style term, package-specific term, or local nickname;
- how it matters in the current scene;
- pronunciation or usage hints only when useful;
- related systems, people, or missions.

Examples:

- Highlight: `LCARS`
  - Subject: Library Computer Access/Retrieval System.
  - Operational meaning: Starfleet computer interface and information-access layer.
  - Scene relevance: may refer to displays, records, access permissions, or interface behavior.

- Highlight: `EPS`
  - Subject: electro-plasma system.
  - Operational meaning: power distribution infrastructure.
  - Risk: EPS faults can cause outages, fires, or cascading systems problems.

### Tone / Subtext

Use for loaded dialogue, evasive wording, unusually formal phrasing, sarcasm, deference, accusation, reassurance, or emotional restraint.

Returned information should include:

- what the wording sounds like in context;
- possible social or command implication;
- alternate readings;
- what is established versus inferred;
- what a player character might reasonably notice;
- caution against mind-reading.

Examples:

- Highlight: `With respect, Commander`
  - Subject: formal pushback phrase.
  - Subtext: may signal disagreement while preserving chain-of-command decorum.
  - Alternate readings: genuine courtesy, warning, or controlled anger depending on surrounding dialogue.
  - Player relevance: the player can respond to the tension without assuming private motive.

- Highlight: `That is one way to describe it`
  - Subject: evasive or dryly corrective phrase.
  - Subtext: likely signals disagreement or withheld nuance.
  - Follow-up: ask for precise terms or evidence.

### Ambiguous Selection

Use when the highlighted text is too short, generic, pronoun-based, or overloaded to classify confidently.

Returned information should include:

- top two or three plausible referents;
- what evidence points to each;
- what additional text would disambiguate;
- a conservative short answer;
- a warning that the result is uncertain.

Examples:

- Highlight: `her`
  - Possible referents: the most recent named woman in the selected message, the speaker, or a mission subject.
  - Ask for: include the nearby sentence or the name.
  - Behavior: do not invent a definitive identity.

- Highlight: `the issue`
  - Possible referents: current technical problem, mission dispute, social conflict, or previously named component.
  - Scene context: list likely candidates with confidence.
  - Caution: avoid committing one referent without stronger source evidence.

## Panel Layout

The first implementation should use a compact pop-up, not a full route drawer.

### Chat-Side Selection Dock

The chat-side control should feel like one small Directive selection dock rather than a generic toolbar.

When the player highlights valid text, Directive should show a compact two-button cluster near the selection endpoint:

```text
[ ship ] [ ? ]
```

Button contract:

- the ship glyph remains first and keeps the existing `Add Component to Mission` action;
- the question-mark glyph sits directly beside it and opens `Define Selection`;
- both buttons use the same size, surface, focus ring, hover state, active state, and disabled behavior;
- `Add Component to Mission` preserves the current tooltip and accessible label;
- `Define Selection` uses tooltip and accessible label `Define Selection`;
- the dock should not include visible text labels in normal desktop use;
- the dock should stay outside the selected text rect when possible;
- the whole dock should flip left, above, or below as needed and clamp to the viewport;
- if the selection is invalid, wrong-chat, stale, cross-message, or reconciliation-marked, the dock should hide instead of showing disabled buttons.

State behavior:

- opening Define closes any open Mission Component review popover;
- opening Mission Components closes any open Define panel;
- clearing selection, scrolling away, route changes, Directive disable, wrong-chat guard changes, and modal open should close the dock;
- clicking a dock button should preserve the selected text long enough for source validation and pop-up placement;
- on phone-width layouts, the dock may stack vertically or open the panel centered, but the two actions should remain distinct.

The dock should be visually light. It is a source-action affordance, not a new command shelf.

### Define Pop-Up

The Define pop-up should render as a compact read-only briefing panel anchored near the selected text.

Recommended structure:

```text
Define                         [x]

Commander Imani Cross          Character

At A Glance
Brief answer in 2-4 sentences.

Scene Context
What this means in the current scene.

Proper Address
Commander Cross. Chief Engineer when referring to her billet.

Why It Matters
Operational, social, or mission relevance.

Known / Inferred / Unknown
...

Related
Cross  Engineering  Command Network

Source
...

Close
```

Panel rules:

- render as read-only content, not a form;
- open anchored near the selection and clamp to viewport like Mission Components popovers;
- use a fixed max width and max height with internal scrolling when content exceeds viewport height;
- preserve selection while pending;
- show a pending state immediately: `Defining selection...`;
- show success, deterministic fallback, ambiguous, stale-source, and error states;
- support close through the `x`, `Close`, outside click, and Escape;
- keep keyboard focus inside the panel while open;
- avoid nested cards;
- use compact headings and dense rows;
- prioritize the subject/type and `At A Glance` answer above all deeper sections;
- render `Known / Inferred / Unknown` as distinct subsections, not one blended paragraph;
- render `Source` collapsed by default unless the result is ambiguous or source validation failed;
- keep the footer action to close/dismiss only.

The panel should optimize for a five-second read. The player should understand the highlighted thing from the subject, type chip, and `At A Glance` section before scrolling.

### Panel States

Pending:

```text
Define                         [x]

Defining selection...
Commander Cross
```

Use a spinner or small busy indicator, but keep the selected source visible enough that the player knows what is being defined.

Success:

- show subject and type chip;
- show `At A Glance`;
- show relevant type-specific sections only;
- show related chips for crew, systems, mission threads, components, or log entries;
- show source in a collapsed disclosure.

Fallback:

- show a small notice that Utility was unavailable or unusable;
- show deterministic crew, ship, mission, component, command-log, or glossary matches;
- avoid invented summary text beyond visible/local matches.

Ambiguous:

- title the result `Possible Meanings`;
- list two or three likely referents with evidence signals;
- suggest selecting a fuller phrase or sentence;
- do not pretend one referent is confirmed.

Error or stale source:

- explain the problem in one sentence;
- offer `Close`;
- if the issue is stale selection, ask the player to select the text again;
- do not call Utility after source validation fails.

### Actions

`Close` only dismisses the panel.

Define should not offer `Add Component`, `Save`, or `Copy to Components` inside the panel. The adjacent ship button is the separate entry point for Mission Components. Keeping these actions separate prevents the generated Define explanation from being mistaken for source evidence or a persisted note.

## Provider Role

Define should have an explicit Utility role rather than borrowing a generic utility route indefinitely.

Add the role to:

```text
src/generation/generation-roles.mjs
src/generation/model-call-authority-matrix.mjs
src/ui/settings-panel.js
```

Suggested role id:

```text
defineSelection
```

Suggested role properties:

- `providerKind: utility`;
- `blocking: true`;
- `output: structured-json`;
- `structuredOutput: true`;
- `timeoutMs: 30000`;
- `mayProposeState: false`;
- `mayInjectPrompt: false`;
- `mayRunDuringMainGeneration: false`;
- `fallback: deterministic`;
- model preferences: low cost, fast latency, utility-reasoning.

The model-call authority matrix entry should describe this as a player-visible read-only context explanation. Its allowed mutation roots should be empty. Its owning module should be:

```text
src/runtime/define-selection.mjs
```

Settings should list it in the Utility/background or utility-tools routing group so advanced users can override the provider lane consistently with other structured Utility calls.

Diagnostics should record sanitized metadata only: role id, provider kind, provider id, model, latency, request hash, selected text hash, source message id, parse status, category, and fallback status. Do not store raw selected text or full response in model-call diagnostics.

## Fallback Behavior

If the Utility lane is unavailable or returns unusable output, Define should still show something useful:

- selected text;
- source role and message id;
- deterministic crew, ship, mission, and component matches;
- guessed category only when confidence is reasonable;
- clear fallback notice;
- no invented summary beyond visible matches.

Fallback examples:

- If `Commander Cross` matches a crew record, show her name, rank, billet, and known linked systems.
- If `EPS` matches a glossary/system alias, show the plain definition.
- If no match exists, say the selection is visible in the current message but not yet defined in player-safe indexes.

## Safety And Quality Rules

Define output should:

- be player-safe;
- be in-universe but concise;
- separate known, inferred, and unknown;
- prefer current campaign/package facts over generic franchise knowledge;
- mark uncertainty instead of guessing;
- treat character subtext as interpretation, not hidden intent;
- avoid telling the player what choice to make;
- avoid summarizing the entire scene when the selection is narrow;
- preserve source attribution;
- be useful even when the selection is only a technical term or social cue.

Define output should not:

- reveal hidden state;
- settle continuity;
- create or update Mission Components automatically;
- award or evaluate Command Bearing;
- rewrite player input;
- impersonate NPC speech;
- claim private motives as fact;
- use discarded swipes as evidence;
- treat rumors as confirmed;
- leak model prompts, raw diagnostics, or internal state keys.

## Open Questions

- Should Define results be cacheable by source message id and selection hash for the current browser session?
- Should the panel include a `Copy` action, or would that encourage using Define as a parallel notes system?
- Should package authors provide a glossary specifically for Define, or should it reuse existing crew, ship, world, and context-policy records?
- Should ambiguous selections offer a one-click "expand to sentence" helper when selection offsets are known?
