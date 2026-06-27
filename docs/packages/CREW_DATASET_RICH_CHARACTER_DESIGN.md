# Crew Dataset Rich Character Design

This document defines the richer crew dataset approach for turning full character bibles into compact runtime personality data.

The problem this solves is visible in the current pre-alpha shape: the authored bibles can contain rich character work, while live prompt context may only carry rank, billet, species, and a thin voice instruction. The new target is a crew dataset that acts as the runtime personality API. It should preserve distinct voice, warmth, pressure behavior, and line-shape examples without injecting whole bibles.

## Design Principle

Use three layers:

- **Character bible:** deep authoring source. It can be long, literary, and detailed.
- **Crew dataset:** structured runtime source. It distills the bible into cards, voice capsules, reveal gates, relationship dynamics, development moments, and command reactions.
- **Prompt context:** active slice only. It injects the smallest useful subset for characters who are present, speaking, or causally relevant.

The prompt should never need a whole character bible to write one good scene.

## Current Boundary

The package `crew.senior` roster owns stable public identity:

- name;
- rank;
- billet;
- species;
- public role;
- public profile;
- public age or appearance facts when authored.

The crew dataset owns richer characterization:

- profile summary;
- voice and portrayal rules;
- relationship dynamics;
- reveal-gated private history;
- development hooks;
- command-style reactions;
- future B-plot and coalition cards.

Campaign state owns what has happened in this playthrough:

- relationship memories;
- visible posture;
- hidden raw relationship values;
- current stance;
- strain;
- revealed cards;
- promises and debts;
- current goals and concerns.

## Required Card Set

A rich senior officer should have these six foundational cards:

```text
crew.profile
crew.voice
crew.relationship
crew.reveal
crew.development
command.styleReaction
```

Future rich packages should also add:

```text
crew.bplot
crew.coalitionRule
```

The current schema already allows these card types. The richer voice fields below fit under `payload`, which already allows additional properties.

## Voice Capsule

Every major `crew.voice` card should include a `voiceCapsule` object under `payload`.

Suggested shape:

```json
{
  "summary": "One compact voice summary remains required for backward compatibility.",
  "voiceCapsule": {
    "coreEngine": "What this person is really doing in the room.",
    "contradiction": "The tension that keeps the character from becoming a type.",
    "speechMechanics": [
      "Sentence rhythm, diction, question style, correction style."
    ],
    "pressureShift": [
      "How speech and behavior change under stress."
    ],
    "warmthHumor": [
      "How warmth, care, ease, or humor appears."
    ],
    "physicalTells": [
      "Distinctive gestures, posture, working habits, or room behavior."
    ],
    "exampleLineShapes": [
      {
        "id": "recommendation-pressure",
        "situation": "requesting a recommendation",
        "shape": "I have six assessments. I need one recommendation."
      }
    ],
    "avoid": [
      "Flattening traps and wrong portrayals."
    ]
  }
}
```

The capsule should be written for selective prompt rendering. It should not include hidden material unless the card is gated away from narrator use.

## Line Shapes

Line shapes are not catchphrases. They teach syntax, posture, temperature, and relationship stance.

Each major character should have 8 to 12 line shapes. The set should cover:

- command pressure;
- correction;
- disagreement;
- warmth;
- humor;
- private trust;
- crisis;
- ordinary work.

Avoid making every example a rebuke. If all examples are severe, the model will write severity even when the character should be warm.

Good line shapes are short:

```text
"I would rather have your honest caveat than a clean report I cannot use."
"That was not how I would have done it. That is not criticism."
"Come in. I have coffee, tea, and three reports pretending not to contradict each other."
```

Bad line shapes are long speeches, lore dumps, or exact catchphrases the model will repeat.

### Personality Coverage Grid

Line shapes must sample the person, not only the job. A character's role is the easiest thing for a model to understand, so role-only examples will flatten a rich officer into a captain, doctor, engineer, or tactical caricature.

Every major character's line-shape set should cover multiple bible axes:

| Axis | Purpose |
|---|---|
| Role pressure | How the character acts under duty, command, or professional obligation. |
| Warmth | How the character shows care, trust, affection, respect, or ease. |
| Humor | What wit, dry observation, awkwardness, or social release sounds like for this person. |
| Flaw or blind spot | How the character's weakness leaks into speech without becoming exposition. |
| Relationship mode | How speech changes with trust, doubt, mentorship, rivalry, or disappointment. |
| Ordinary life | How habits, tools, routines, rooms, food, reading, craft, or rituals ground them. |
| Stress shift | How pressure changes syntax, temperature, pace, formality, or silence. |
| Moral engine | What belief drives the line underneath the surface. |

For a 10-line set, use this minimum blend:

| Category | Count |
|---|---:|
| Duty or command pressure | 2 |
| Warmth or trust | 2 |
| Humor or private ease | 1 |
| Ordinary-life or habit line | 1 |
| Flaw or blind spot | 1 |
| Relationship-specific line | 1 |
| Stress or crisis | 1 |
| Moral-engine line | 1 |

Some lines can satisfy more than one category, but the final set must not lean on a single axis. Whitaker's examples should not all be "give me the recommendation" lines. Bronn's examples should not all be tactical objections. Miriam's examples should not all be medical warnings. Priya's examples should not all be coordination advice.

Add a `bibleAxes` list to each line shape when practical:

```json
{
  "id": "honest-caveat",
  "situation": "accepting an imperfect report",
  "shape": "I would rather have your honest caveat than a clean report I cannot use.",
  "bibleAxes": ["warmth", "moral-engine", "role-pressure"]
}
```

Review gates:

- Reject a line-shape set if most examples could be spoken by any competent officer in the same billet.
- Reject a line-shape set if all examples trace to `role-pressure`.
- Require at least two examples that show warmth, trust, ease, or private humanity.
- Require at least one example that shows the character's flaw or blind spot.
- Require at least one example rooted in ordinary life or physical habit.

### Dialogue Naturalism Gate

The personality coverage grid prevents role-only caricature. The dialogue naturalism gate prevents polished, robotic examples that technically cover the right axes but do not sound like people talking to each other.

Line shapes must read as speakable dialogue, not author notes, aphorisms, or prompt instructions. A good test is whether an actor could say the line aloud without having to sand off the stiffness first.

Requirements:

- Use contractions, conjunctions, interruptions, and connective tissue when the character would naturally use them.
- Let lines carry thought in motion: caveat, correction, hesitation, humor, or a second beat that changes the first beat.
- Ground some lines in mundane specifics from the bible: drinks, tools, reports, watches, rooms, rituals, hobbies, repairs, or recurring physical habits.
- Include conversational registers, not only command register: public duty, private office, tired end-of-watch, trusted friend, disagreement, apology, amusement, and quiet concern.
- Include crew banter or conversational friction where the bible supports it, especially for major recurring relationships.
- Keep competence intact without turning professionalism into clipped syntax or emotional absence.

Avoid:

- aphorism stacking;
- every line ending with a lesson;
- sentence fragments used only to sound stern;
- examples that read like mission-order templates;
- flawless, over-composed paragraphs no one would actually say in a room;
- "captain voice," "doctor voice," or "engineer voice" replacing the specific person.

Bad:

```text
"The record will matter. It will not save us from deciding."
"I require your recommendation."
```

Better:

```text
"The record matters. Of course it matters. But it isn't going to make this decision for us."
"I don't need you to sound certain. I need to know what you're certain enough to stand behind."
```

Review gates:

- Reject a line-shape set if most examples sound like maxims, thesis statements, or motivational quotes.
- Reject a line-shape set if it has no contractions or connective tissue unless the character bible explicitly supports that stiffness.
- Require at least two examples that show conversational warmth, ease, private trust, or banter.
- Require at least one example grounded in an ordinary object, room, habit, or routine.
- Require at least one relationship-specific banter, disagreement, or conversational-friction line for each major recurring officer.

### Authoring Reference Shelf

Named authors and works can be useful internal calibration references, but they must not become runtime prompt text or imitation instructions.

Becky Chambers is a useful authoring reference for the desired richness of ensemble-forward science fiction: warm lived-in crews, ordinary habits, private jokes, emotional intelligence, disagreement without cruelty, and banter that reveals relationship history. That reference should guide what traits the bible and voice capsule encode. It should not appear as "write like Becky Chambers" in voice data, prompt context, or model-facing instructions.

When a named reference is helpful, translate it into direct craft targets:

- warm ensemble banter;
- ordinary-life specificity;
- relationship-specific friction and repair;
- private-ease register;
- moral texture without speechmaking;
- dialogue that sounds spoken aloud;
- humor that reveals history instead of forcing quips.

Review gates:

- Named author references may appear in authoring guidance, but not in runtime-injected crew data.
- Reject prompt-facing text that asks the model to imitate a living author or named style.
- Require the actual voice capsule to encode concrete traits, registers, and line shapes rather than relying on a reference name.

## Prompt Rendering Tiers

The runtime should render character data by tier.

### Tier 0: Identity Facts

Always cheap and broadly safe:

- rank;
- name;
- species;
- billet;
- public role;
- public profile.

These facts can appear in continuity invariants and relevant crew context.

### Tier 1: Active Voice Capsule

Inject only for characters who are present, likely to speak, or directly relevant.

Target:

- 120 to 220 tokens per active major character;
- maximum 2 to 3 active voice capsules per ordinary turn;
- include no hidden reveal material;
- include only narrator-safe voice card content.

Example rendered slice:

```text
Whitaker voice: prepared, exacting, intellectually warm under command restraint. Care appears as standards, memory, and earned trust. Under stress she gets quieter, more formal, and more precise. Warmth is specific rather than effusive.
Tells: annotated padd margins; silence that exposes evasion; brief warmth after a standard is met.
Line shapes: "I asked for your judgment because I wanted your judgment." / "I would rather have your honest caveat than a clean report I cannot use."
Avoid: cold judge, generic wise captain, automatic answer-giver.
```

### Tier 2: Scene Relationship Lens

Add one line when relationship or current scene pressure matters:

```text
Whitaker is evaluating whether the XO can own uncertainty without either deferring everything upward or performing independence.
```

This should come from `crew.relationship`, campaign relationship memory, or scene snapshot. It should not expose raw relationship values.

### Tier 3: Example Line Shapes

Include 1 to 3 line shapes only when the character is likely to speak. Rotate or select by situation so the same examples do not become repeated phrases.

### Tier 4: Reveal-Gated Material

Private fears, hidden failures, personal correspondence, trauma, and secret motives remain blocked unless:

- the card gate passes;
- the audience is allowed;
- campaign state marks the reveal as earned;
- narrator safety permits the material.

## Card Hydration

Retrieval should not stop at card ids when a runtime consumer needs characterization. Selected cards should be hydrated into compact, audience-scoped excerpts for narrator prompts, Mission Director packets, and internal support workers.

Hydration rules:

- resolve selected card ids to cards;
- reject `directorOnly` and `lockedHidden` cards for narrator output;
- summarize or render only allowlisted payload fields for every audience;
- include voice capsule fields in priority order;
- cap total hydrated character text;
- record omitted card ids for diagnostics.

Suggested priority order:

1. `payload.voiceCapsule.coreEngine`
2. `payload.voiceCapsule.speechMechanics`
3. `payload.voiceCapsule.pressureShift`
4. `payload.voiceCapsule.warmthHumor`
5. `payload.voiceCapsule.physicalTells`
6. selected `payload.voiceCapsule.exampleLineShapes`
7. `payload.voiceCapsule.avoid`
8. fallback `payload.summary` and `payload.constraints`

Internal director hydration uses the same source cards but a different budget:

- `crewDirector` and relationship sidecars may receive compact `crew.voice`, `crew.relationship`, `crew.development`, and relevant command-reaction slices;
- `missionDirector` may receive compact voice and command-shape guidance when a character's stance changes how an outcome should be evaluated;
- `shipDirector` should receive ship/system guidance by default, with crew voice only when a selected card explicitly belongs to the ship/system audience;
- `commandDirector` and Command Bearing workers should receive command-relevant guidance, but must not expose hidden, locked, or reveal-gated details in player-facing summaries;
- sidecar prompts should include a worker-specific hydrated card block plus card-id diagnostics, not the raw full retrieval packet.

## Budget Policy

Recommended initial budget:

| Prompt component | Target |
|---|---:|
| Active voice capsule per major character | 120-220 tokens |
| Ordinary turn active capsules | 2 characters |
| Briefing or conference active capsules | 3 characters |
| Example line shapes per active speaker | 1-3 |
| Total crew voice block | 450-650 tokens |

If more characters are present, prefer:

- identity only for non-speaking characters;
- one ensemble rule;
- one or two active speakers;
- no equal-time biography rotation.

## Distinct Physical Vocabulary

Every major officer needs distinctive physical tells. These are not ornamental. They help the model write subtext without generic emotional narration.

Rules:

- no shared default gestures across a crew;
- tells should be actionable in scenes;
- tells should change under pressure;
- tells should fit the work environment;
- avoid repetitive stage directions.

Examples:

```text
Whitaker: annotated padd margins; long silence before correction; hands still when angry.
Bronn: squares a report before attacking its assumptions; lowers his chin when inviting argument.
Imani: marks dependencies in the air or on a panel; corrects terminology before emotion.
Miriam: names durations and consent terms; stills when someone uses vague casualty language.
```

## Warmth Requirement

Every major voice capsule should define warmth, not only conflict.

Warmth can be:

- exacting standards as care;
- dry humor;
- practical help;
- remembered details;
- trust given as responsibility;
- quiet protection;
- blunt honesty;
- shared work rather than confession.

Do not make warmth generic. Whitaker warmth is precise and earned. Bronn warmth may look like harsher scrutiny because he thinks the person can survive it. Priya warmth may appear as access and preparation. Miriam warmth may appear as naming the human cost before command can evade it.

## Example Whitaker Capsule

This is a model for the target density.

```json
{
  "summary": "Whitaker is prepared, exacting, intellectually warm under command restraint, and precise under stress.",
  "voiceCapsule": {
    "coreEngine": "She creates conditions for sound collective judgment, then accepts responsibility for the decision.",
    "contradiction": "She knows institutions must be challenged, but still over-trusts evidence and proper records to make them correct themselves.",
    "speechMechanics": [
      "Complete sentences, precise verbs, few wasted modifiers.",
      "Asks questions before declarations.",
      "Corrects reasoning rather than attacking the person."
    ],
    "pressureShift": [
      "Becomes quieter, more formal, and more exact.",
      "Contractions disappear.",
      "Names cost, reversibility, authority, and who carries the risk."
    ],
    "warmthHumor": [
      "Warmth is specific rather than effusive.",
      "Notices effort and remembers details.",
      "Gives trust as usable authority.",
      "Dry humor targets procedural absurdity."
    ],
    "physicalTells": [
      "Annotated padd margins.",
      "A pause long enough for evasion to expose itself.",
      "Brief warmth after a standard is met.",
      "Hands still when angry."
    ],
    "exampleLineShapes": [
      {
        "id": "honest-caveat",
        "situation": "accepting an imperfect report",
        "shape": "I would rather have your honest caveat than a clean report I cannot use."
      },
      {
        "id": "wanted-judgment",
        "situation": "encouraging independent command",
        "shape": "I asked for your judgment because I wanted your judgment. Not a more diplomatic version of mine."
      },
      {
        "id": "private-ease",
        "situation": "private ready-room opening",
        "shape": "Come in. I have coffee, tea, and three reports pretending not to contradict each other."
      }
    ],
    "avoid": [
      "cold judge",
      "generic wise captain",
      "scolding schoolteacher",
      "automatic answer-giver"
    ]
  }
}
```

## Dataset Migration Checklist

For each bundled campaign:

1. Expand or revise the prose character bible first.
2. Add or update every major officer's `crew.voice` card with a `voiceCapsule`.
3. Add warmth and humor fields, not only stress behavior.
4. Add 8 to 12 line shapes per major officer.
5. Run the personality coverage grid against every line-shape set.
6. Run the dialogue naturalism gate against every line-shape set.
7. Ensure `crew.profile`, `crew.relationship`, `crew.reveal`, `crew.development`, and `command.styleReaction` are as rich as the voice card.
8. Add B-plot and coalition cards where the campaign is ready.
9. Update indexes.
10. Validate with `node tools/scripts/validate-crew-dataset.mjs`.
11. Add prompt-context tests proving active voice capsules hydrate for present characters.
12. Add safety tests proving hidden reveal cards do not hydrate before gates pass.

## Verification Expectations

A playtest-ready rich crew dataset should pass these checks:

- active prompt context includes present-character voice cues, not only identity facts;
- narrator prompt hydration includes selected narrator-safe voice card text;
- hidden reveal material is absent until gated;
- raw relationship values are absent from narrator and host prompt blocks;
- active crew voice block stays inside the budget;
- example line shapes are available but not repeated as mandatory catchphrases;
- line-shape sets include role pressure, warmth, humor or ease, flaw, relationship mode, ordinary life, stress shift, and moral engine rather than only billet behavior;
- line-shape sets sound speakable aloud, use natural connective tissue where appropriate, and include banter or private-ease examples rather than only polished aphorisms;
- named author references stay in authoring guidance and do not appear in runtime prompt slices or model-facing imitation instructions;
- each officer has distinct physical tells;
- each officer has a warmth mode as well as a pressure mode.

## Relationship To Existing Contract

`CREW_DATASET_CONTRACT.md` remains the schema and audience-safety contract. This document is the richer design target for pre-alpha authoring and runtime prompt improvements.

When the richer design is stable, promote the optional `voiceCapsule` fields into schema-level validation.
