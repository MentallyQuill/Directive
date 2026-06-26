# Character Creator Model

## Purpose

Directive needs a campaign-agnostic Character Creator that establishes a credible player character quickly without turning character creation into a tabletop sheet.

The creator should feel closer to a modern RPG origin screen:

- Three short creation steps.
- A small number of meaningful choices.
- A generated, editable dossier.
- No point-buy system.
- No long skill list.
- Enough detail for Directors and narrators to use.
- Enough open space for the character to develop during play.

A typical player should be able to begin a campaign in three to five minutes.

## Core Principles

The creator establishes only the facts needed to start:

- Who the character is.
- Their broad professional background.
- The kind of service experience that shaped them.
- Why they received the current assignment.
- Three positive traits.
- One flaw.

The campaign supplies the context. The core creator must not assume a specific ship, era, war, captain, faction, or historical event.

Generated material is draft material. The player can edit, remove, regenerate, or leave details intentionally undefined before play begins.

The creator must not quietly invent major personal facts such as secret ancestry, hidden powers, criminal history, severe trauma, canonical relationships, current-crew friendships, or old romances unless the player explicitly asks for them.

## Campaign Context Package

Before character creation starts, the selected campaign package provides a character-creation context package.

Required fields:

```text
campaignTitle
eraLabel
currentDateOrStardate
serviceOrFaction
shipName
shipClass
missionProfile
playerRoleRule
allowedSpecies
careerBackgrounds
formativeExperiences
assignmentReasons
continuityGuardrails
```

The package controls which choices are plausible. A postwar relief campaign can offer evacuation and reconstruction experiences. An exploration campaign can offer frontier survey, first contact, and isolated outpost service. A sandbox package can offer multiple player roles.

The current package contract is implemented as `characterCreation` in each campaign package. Its split schema is [character-creation.schema.json](../../schemas/packages/character-creation.schema.json), and the first concrete data lives in [ashes-of-peace.campaign-package.json](../../packages/bundled/breckenridge/ashes-of-peace.campaign-package.json). Runtime UI should consume that package data directly rather than hardcoding Ashes of Peace choices.

## Player Role Modes

The creator supports three role configurations:

- `lockedRole`: the package fixes rank and billet. The UI displays them and does not ask the player to choose.
- `limitedRoleSelection`: the package provides a short list of valid roles.
- `openRoleSelection`: the player may enter a role, subject to package validation. This is mainly for sandbox campaigns.

Authored Directive campaigns should prefer locked or limited roles so mission design can rely on the player having a defined level of authority.

Ashes of Peace uses a locked role: incoming permanent XO of the U.S.S. Breckenridge.

## Creation Flow

The creator has three steps followed by review:

1. Identity.
2. Service.
3. Personality.
4. Review and begin.

Each step should fit comfortably on a mobile screen.

## Step 1: Identity

Required fields:

- Name.
- Pronouns or form of address.
- Species.
- Age band.
- Appearance.

Optional field:

- One-line first impression.

Age band should be broad:

- Young for the role.
- Mid-career.
- Experienced.
- Late-career.

Species choices come from the campaign. Species should create fictional permissions or limitations where needed, not a large statistical package.

Appearance should be one or two roleplay-relevant sentences, not a required inventory of exact physical measurements.

## Step 2: Service

Required fields:

- Current rank and billet, displayed or selected depending on role mode.
- Primary career background.
- Formative service experience.
- Reason for current assignment.

Optional field:

- One fact that must be true.

Recommended general career backgrounds:

- Command and administration.
- Operations and logistics.
- Tactical and security.
- Flight and navigation.
- Science and exploration.
- Engineering and systems.
- Medical and humanitarian service.
- Diplomacy and first contact.
- Intelligence and strategic analysis.

Career background grants broad familiarity. It does not allow the player character to replace the ship's senior specialists.

Recommended formative experience categories:

- Deep-space exploration.
- First-contact or diplomatic duty.
- Major conflict or security crisis.
- Disaster relief and evacuation.
- Frontier or border service.
- Scientific expedition.
- Starbase or planetary assignment.
- Convoy and logistics duty.
- Training or staff service.
- Routine service with no singular defining event.

Recommended assignment reasons:

- Requested by the commanding officer.
- Selected for relevant specialist experience.
- Promoted into the role.
- Transferred as an experienced outsider.
- Requested a fresh start.
- Reassigned after a professional disagreement.
- Part of a newly assembled or reorganized crew.
- Let the creator decide.
- Custom.

## Step 3: Personality

The player chooses three positive traits and one flaw.

Positive traits are selected from three categories:

Insight:

- Analytical.
- Perceptive.
- Curious.
- Intuitive.

Connection:

- Diplomatic.
- Empathic.
- Candid.
- Inspiring.

Execution:

- Decisive.
- Disciplined.
- Resourceful.
- Patient.

Each category should include a short custom-trait option comparable in scope to the standard options.

Recommended flaws:

- Guarded.
- Stubborn.
- Impatient.
- Controlling.
- Proud.
- Distrustful.
- Overprotective.
- Rigid.

A flaw should provide recurring tension without taking control away from the player. The system should not invent an outburst, refusal, or mistake simply because a flaw exists.

Optional field:

- Additional generation note.

## Trait Behavior In Play

Traits are narrative descriptors, not automatic success buttons.

A positive trait can provide a modest situational advantage only when the player's actual approach supports it. A Diplomatic character still needs a credible argument. A Perceptive character may receive an additional observation when actively inspecting a situation. A Resourceful character may be better positioned to exploit available materials, contacts, or preparation.

Traits may affect:

- Initial NPC expectations.
- Generated backstory language.
- Minor adjudication modifiers.
- Which contextual information the Director highlights.
- Optional dialogue or action suggestions outside the roleplay text.

Traits must not:

- Predetermine dialogue.
- Override implausible actions.
- Replace specialist expertise.
- Guarantee success.
- Assign moral alignment.

Inspiration and Resolve begin neutral. They are earned through play, not selected during character creation.

## Generated Dossier

After the third step, the creator generates a compact dossier using one provider call when possible.

Required sections:

- Identity summary.
- Service summary.
- Brief biography.
- Traits.
- Public reputation.
- Optional open thread.

Self-fill prose boxes target roughly 600 to 800 characters and expose a 1500-character editing limit. Generated text that exceeds the limit is preserved for review instead of being truncated. The brief biography should cover early motivation, broad career path, the selected formative experience, and transition into the current assignment. It should leave private beliefs, family details, and personal relationships open unless the player supplied them.

The optional open thread must be restrained and removable with one click. It should never default to secret organizations, hidden ancestry, extraordinary powers, canonical celebrity ties, or severe trauma.

## Generation Rules

The generator should:

- Use the active campaign's era and continuity context.
- Respect allowed species and service structure.
- Keep rank and service progression plausible.
- Use no more than two named prior postings by default.
- Include selected traits subtly.
- Explain why the current assignment is credible.
- Leave room for future invention.
- Treat player-entered facts as authoritative.

The generator should not:

- Hard-code any historical event.
- Assume the U.S.S. Breckenridge unless the active campaign supplies it.
- Connect the character to famous canon figures without a request.
- Make the character universally admired.
- Make the character exceptionally competent in every field.
- Establish friendships or rivalries with current crewmembers before play.
- Reveal information unavailable in the campaign period.

Provider failure must not block campaign start. A local template should produce a minimal dossier from selected fields, and the player can generate richer prose later.

## Review Screen

The review screen is a concise approval and editing stage, not a fourth questionnaire.

Required controls:

- Edit generated text directly.
- Regenerate biography only.
- Regenerate public reputation only.
- Remove optional open thread.
- Restore previous generated version.
- Mark a detail as intentionally undefined.
- Begin campaign.

The UI should visually distinguish:

- Campaign-locked facts.
- Player-selected facts.
- Generated draft.
- Open details intentionally left for later.

Recommended generation detail selector:

- Minimal.
- Standard.
- Detailed.

`Standard` is the default and should aim for the 600-to-800-character self-fill target.

## In-Play Character Development

The initial dossier is intentionally incomplete.

When the player clearly establishes a meaningful background detail during play, Directive may propose adding it to the character record. The system should not add the fact automatically when the statement might be hypothetical, deceptive, sarcastic, or ambiguous.

Appropriate details to develop during play include:

- Family and upbringing.
- Former colleagues.
- Cultural practices.
- Personal beliefs.
- Past successes and failures.
- Hobbies and habits.
- Romantic history.
- Specific prior-service details.
- Reasons behind fears or convictions.

Traits should not change automatically. At major chapter breaks, Directive may suggest that sustained behavior no longer matches a starting trait, but the player always decides whether to keep, replace, or ignore the suggestion.

## Adjudication Use

The creator provides a compact profile to adjudication.

The adjudicator may use this profile to decide what the character reasonably knows, what they can plausibly notice, and where they may have a contextual advantage.

It should not treat the profile as a complete skill system.

Example interpretation:

```text
Current role: Executive Officer
Career background: Operations and logistics
Formative experience: Disaster relief and evacuation
Traits: Analytical, Diplomatic, Resourceful
Flaw: Guarded

Baseline interpretation:
- Strong familiarity with coordination, logistics, and emergency planning.
- Standard professional competence expected for current rank and service.
- Dependent on department specialists for advanced medicine, engineering, science, piloting, and tactical execution.
```

## Campaign Authoring Guidance

Recommended quantities:

- 5 to 9 career backgrounds.
- 5 to 8 formative service experiences.
- 4 to 7 assignment reasons.
- 4 to 10 common species, plus custom when appropriate.
- One locked role or no more than 4 selectable roles.

Each option should be understandable in one sentence and should not require detailed canon knowledge.

## MVP Scope

The first implementation should include:

- Three-step guided flow.
- Campaign-provided role and context.
- Standard identity fields.
- One career background.
- One formative experience.
- One assignment reason.
- Three positive traits and one flaw.
- Optional must-be-true fact.
- Generated 600-to-800-character self-fill dossier prose.
- Public reputation line.
- Optional open thread.
- Direct review editing.
- Local fallback dossier.
- Mobile layout.
- In-play proposal to add newly established facts.

The first implementation does not need:

- Numerical attributes.
- Point allocation.
- Detailed Academy course selection.
- Complete promotion history editing.
- Family-tree creation.
- Relationship creation.
- Equipment selection.
- Automatic personality simulation.
- Automatic trait replacement.

## Acceptance Criteria

The Character Creator is successful when:

- A new player can complete creation in three to five minutes.
- The creator requires only three primary screens before review.
- No choice assumes a specific campaign era unless supplied by the campaign.
- The resulting character has enough history to enter the opening scene credibly.
- The character remains open enough for the player to invent important details during play.
- Traits affect framing and situational adjudication without controlling the player.
- The player character cannot trivially replace every department specialist.
- Generated history remains compatible with the active campaign.
- Provider failure does not prevent campaign startup.
- The flow remains usable on a phone-sized display.
