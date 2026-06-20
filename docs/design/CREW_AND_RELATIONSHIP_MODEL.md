# Crew And Relationship Model

## Status

The senior crew roster is approved and locked as the first starship package's core ensemble. The first character bible baseline now exists in [Directive Breckenridge Senior Staff Character Bible](../source/Directive_Breckenridge_Senior_Staff_Character_Bible.md).

The next implementation step is to convert that prose bible into structured package dataset cards, relationship-start records, reveal gates, and voice guidance that Director retrieval can use safely.

Crew growth and officer-specific experience are defined separately in [Crew Development And Experience Model](CREW_DEVELOPMENT_AND_EXPERIENCE_MODEL.md). Relationship state says how an officer relates to the player; development state says how that officer is changing through missions, conversations, strain, mentorship, and personal arcs.

## Approved Senior Crew

- Captain Mara Whitaker: commanding officer; principled strategic authority; faith in institutional correction.
- Lieutenant Kieran Vale: flight control officer; gifted test pilot; ambition, mentorship, and controlled risk.
- Lieutenant Priya Nayar: operations officer; coordination, informal influence, and ethical boundaries.
- Lieutenant Commander Hadrik Bronn: chief tactical and security officer; veteran Tellarite; preparedness, discipline, and operational scrutiny.
- Lieutenant Commander Rowan Saye: chief science officer; evidentiary rigor, dissent, and institutional skepticism.
- Doctor Miriam Sato: chief medical officer; medical reality, bioethics, casualty burden, and honest cost.
- Lieutenant Commander Imani Cross: chief engineer; technical integrity, autonomy, identity, and long-term consequence.

## Relationship Dimensions

Relationships should not collapse into one approval score. The model should track at least:

- Professional confidence: does the officer believe the player is capable, prepared, and dependable?
- Integrity trust: does the officer believe the player is honest, responsible, and acting in good faith?
- Personal rapport: does the officer personally like, understand, or feel comfortable with the player?

This allows credible combinations. An officer may dislike the player but trust their command ability. An officer may like the player but doubt their judgment. An officer may believe the player is competent but morally unreliable.

Raw values stay hidden. The player should experience relationship state through officer behavior, debrief summaries, command-log summaries, crew dossiers, and consequences.

## Hidden Scale

Relationship values use internal `0-100` summaries, translated into qualitative bands before being passed to narration.

| Range | Meaning |
|---:|---|
| 0-19 | Broken, hostile, or absent |
| 20-39 | Guarded or doubtful |
| 40-59 | Provisional or unproven |
| 60-79 | Strong |
| 80-100 | Exceptional |

A typical meaningful scene should change a relationship value by only `2-5` points. Campaign-defining betrayals, sacrifices, or revelations may change a value by `8-15`.

Numeric values summarize accumulated memories. They do not replace those memories. The memory ledger is the source of truth for why an NPC behaves differently.

Narrator packets should receive player-safe qualitative summaries and key memories, not raw values.

Preferred:

```text
Whitaker has strong but incomplete professional confidence in the commander.
She trusts the commander's intentions but remains personally formal.
She remembers that the commander accepted responsibility for the Hesperus delay.
```

Avoid:

```text
Trust: 61
Rapport: 39
```

## Senior NPC Hidden State

Each senior NPC should have permanent profile fields:

```text
coreValues
pressurePoint
redLines
socialStyle
conflictStyle
privateWant
privateFear
```

Each senior NPC should also have current-state fields:

```text
strain
currentGoal
currentConcern
currentStance
arcStage
```

`strain` combines immediate stress, fatigue, and emotional pressure. It should affect patience and behavior without rewriting personality.

`currentStance` should be categorical:

- `supports`
- `supports-with-reservations`
- `undecided`
- `concerned`
- `objects`
- `refuses`

Refusal should be rare for Starfleet officers. It normally requires an unlawful order, medical incapacity, or a severe personal red line.

## Knowledge And Memory

Senior NPCs should track:

```text
knownFacts
suspicions
secrets
memoryLedger
promisesAndDebts
```

A memory entry should record both the event and the NPC's interpretation.

```text
event: The commander accepted Cross's warning and abandoned the faster repair.
interpretation: The commander respects technical limits even under pressure.
effects:
  professionalConfidence: 3
  integrityTrust: 2
```

Two NPCs can interpret the same player action differently.

## Relationship Change Rules

Relationship shifts should come from patterns and consequential events, not isolated approval prompts.

Relevant patterns include:

- Hearing dissent before deciding.
- Consistency after success and failure.
- Accepting responsibility.
- Treating officers as experts rather than tools.
- Respecting private information.
- Protecting dignity without evading accountability.
- Explaining changed orders when circumstances permit.

## Crew Autonomy

Senior officers may:

- Offer unsolicited professional advice.
- Disagree in their area of expertise.
- Request private meetings.
- Develop friendships and conflicts with each other.
- Pursue personal goals within reasonable limits.
- Make mistakes or conceal information for character-specific reasons.
- Change their view of the player over time.

They should not routinely refuse lawful orders, sabotage plans, or create melodrama solely to prove independence.

## Starting Relationship Frame

The player joins at stardate `53049.2`, twenty-five days after the reconstituted crew departed Utopia Planitia. Captain Whitaker and Bronn are returning Breckenridge veterans; the rest of the established senior staff embarked during the post-refit departure period.

Bronn has served as acting XO for the yard departure and initial shakedown while retaining tactical responsibility. Priya has handled much of the practical cross-department scheduling beneath that temporary arrangement. The player's arrival completes the long-term command structure rather than creating it from nothing.

The crew is familiar with each other's basic competence, but the player is not yet part of the ship's command culture.

This means starting state should support:

- Existing crew-to-crew impressions.
- Some established working relationships.
- Limited or no deep trust with the player.
- The player being evaluated as a developing command peer.
- Early B-plots that help form the ship's command culture.

## Starting Relationship Baselines

These are the current Ashes of Peace starting values toward the player, assuming the player has no prior relationship with the officers. Character Creator background compatibility may later adjust them by about `5` points.

| Officer | Professional confidence | Integrity trust | Personal rapport |
|---|---:|---:|---:|
| Mara Whitaker | 60 | 55 | 35 |
| Kieran Vale | 50 | 50 | 58 |
| Priya Nayar | 55 | 55 | 52 |
| Hadrik Bronn | 45 | 55 | 28 |
| Rowan Saye | 50 | 48 | 35 |
| Miriam Sato | 55 | 60 | 45 |
| Imani Cross | 52 | 52 | 35 |

Each officer also begins with a hidden question about the player:

| Officer | Initial hidden question |
|---|---|
| Whitaker | Can this officer integrate advice and still make an independent decision? |
| Vale | Will the new commander encourage initiative or restrict it? |
| Nayar | Will the commander communicate intent and trust the staff to execute it? |
| Bronn | Can the commander defend an order when challenged by someone more experienced? |
| Saye | Will inconvenient evidence remain welcome once it threatens the mission? |
| Sato | Does the commander recognize the human cost behind operational language? |
| Cross | Will command respect technical limits when those limits become inconvenient? |

These questions give early interactions direction without requiring scripted hostility.

## Minor NPCs

Mission-specific NPCs do not need the full senior-crew model. A compact hidden state is enough:

```text
goal
fear
leverage
stanceTowardPlayer
redLine
knownFacts
concealedFact
importantMemory
```

Only recurring characters need full relationship tracks, arc progression, and detailed memory ledgers.

## Lethality And Departure

Crew death should be possible. The exact severity model is unresolved. Directive must never kill, injure, reassign, or resign a senior officer through arbitrary drama. Severe outcomes require clear causal setup, fair warning appropriate to the active simulation mode, and a state trail showing why the outcome followed.

## Structured Data Work Needed

Each senior officer needs implementation-ready structured records derived from the character bible:

- Service history.
- Prior postings.
- Existing relationships aboard the Breckenridge.
- Why Whitaker selected or accepted them.
- Professional strength and blind spot.
- Private pressure or unresolved thread.
- Permanent profile fields.
- Current-state fields.
- Known facts, suspicions, secrets, memories, promises, and debts.
- Command-style response patterns.
- Relationship arc seeds.
- Package-local voice guidance.
- Reveal ladder entries.
- Likely coalition and objection rules.
- B-plot hooks.
