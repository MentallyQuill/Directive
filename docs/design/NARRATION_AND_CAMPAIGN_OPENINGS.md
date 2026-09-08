# Narration settings and campaign openings

Directive Settings includes separate **Point of View** and **Tense** controls. The default is third person limited, past tense. First person, second person and third person limited are supported in past or present tense.

These are global user preferences for future narration, including regenerated replies. Loading a save does not restore an older preference or rewrite existing messages. Quoted dialogue and factual reports retain their natural form. Limited narration follows the player's available knowledge and sensory access; no selection authorizes invented player speech, actions, thoughts, emotions or decisions.

## Generation responsibilities

- The campaign owns the opening premise and starting boundary.
- The accepted character dossier supplies established identity and background.
- The Director uses the Reasoning model lane to select bounded scene/background references and descriptive emphasis. Its output cannot add facts.
- The current SillyTavern chat model writes the opening with the resolved narration policy and enabled prose guidance. Opening prose does not use the Reasoning or Utility profile.
- The runtime stores scene inputs and direction in chat metadata, verifies the current campaign/chat binding, and posts only into an empty chat. Concurrent requests for the same binding share one flight.

If direction or narration fails, the character and campaign remain saved. Mission offers **Retry opening**. Retrying retains validated direction; it never substitutes canned prose. A chat change or a new player message prevents a late opening from being appended.

Ordinary replies, Continue, swipes, mission transitions and narrative framing around Duty Reports receive the same runtime narration policy. Canonical report content and structured settlement/model outputs retain their own contracts. Existing posted openings remain unchanged.

## Campaign author contract

`campaign.openingPremise` replaces `openingMessage` and `openingContext`. Packages using those legacy fields must update; no migration of old prose into a new premise is inferred. This is a package-authoring change, not a transcript rewrite.

| Field | Meaning |
| --- | --- |
| `continuitySummary` | Established events before play. Do not prescribe unprovided player choices. |
| `firstPlayableScene` | Starting situation and exact handoff boundary. |
| `requiredContext` | Facts the opening must establish. |
| `sceneMaterial` | Grounded details available for Director selection. |
| `personalization` | Guidance for using accepted character background. |
| `forbiddenFacts` | Restrictions on inventions or revelations; avoid embedding secret answers in the premise. |
| `firstSceneGuidance` | Guidance for the reply after the player's first action. Not enacted in the opening. |
| `continuationGuidance` | Optional guidance after the player answers that initial exchange. |
| `firstSceneEndObjectiveId` | Optional objective whose terminal state ends introductory guidance. |

`continuitySummary` and `firstPlayableScene` are nonempty strings. `requiredContext`, `sceneMaterial` and `firstSceneGuidance` are nonempty string arrays. `personalization` and `forbiddenFacts` are string arrays; `continuationGuidance` is optional. No runtime code names Ashes characters, places or objectives.

The Director selects scene IDs and character-reference IDs from the request. It cannot supply arbitrary prose instructions, extra keys, invented references or duplicates. Biography is player-known rather than automatically public; an NPC does not gain knowledge merely because the player's dossier contains it. The schema is included in the prompt as well as the native schema field, supporting both Prompt JSON and native structured output.

Ashes preserves arrival the previous morning, the refitted Breckenridge, the supplied briefing material and the 0830 ready-room doorway. It no longer assumes the player read every document or chose a tour. The narrator establishes those facts through the chosen viewpoint and relevant character background, then stops before the next player action.

## Verification

Focused tests cover six narration combinations, settings persistence, compatible-preset prose extraction, generic campaign premises, bounded Director references, the current-model narration route, failed generation/retry, metadata custody, late player messages and chat switches. Runtime tests cover actual startup, reload and prompt rebuilding. Browser tests exercise the controls at desktop and phone widths. Support diagnostics include current narration preferences and the opening's captured preferences without exporting character background by default.

Automated generation tests use controlled provider responses; they establish request and lifecycle behavior rather than literary quality. A live-model proof was attempted during this change, but the local SillyTavern host stopped responding before generation. No installed extension, live campaign or provider configuration was changed for that attempt.
