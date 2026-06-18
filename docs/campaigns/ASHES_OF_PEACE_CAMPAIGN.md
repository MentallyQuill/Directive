# Ashes Of Peace Campaign

## Status

This file is the implementation-facing campaign baseline for Directive Campaign One, **Ashes of Peace**. It summarizes the source campaign document without replacing it.

Source of truth for full spoilers and chapter detail:

- [Directive Ashes of Peace Campaign v0.2](../source/Directive_Ashes_of_Peace_Campaign_v0.2.md)

This document contains campaign spoilers. It is for authors, implementers, Mission Director logic, and package-schema work.

## Identity Baseline

- Campaign title: `Ashes of Peace`
- Starship package: U.S.S. Breckinridge
- Ship class: Intrepid-class
- Opening stardate: `53049.2`
- Opening year: 2376
- Primary theater: Asterion Reach
- Player role: Starfleet Commander, Executive Officer, and principal mission commander
- Campaign source version: `0.2`

The spelling baseline is **Breckinridge**. Authored docs should use `U.S.S. Breckinridge`; older source briefs may still contain the prior spelling as historical source material.

## High Concept

The Dominion War is over, but the Federation has not simply returned to its prewar order.

The Breckinridge has completed four months of repair and modernization at Utopia Planitia after wartime damage. Most of its original crew was dispersed during the yard period, and Starfleet has reconstituted the complement from returning veterans, transfer cohorts, and specialists.

Twenty-five days after leaving Mars, the ship rendezvous with the shuttle carrying the player character. Ten days later, it is due to enter the Asterion Reach for a ninety-day stabilization, survey, and relief deployment near the former Cardassian frontier.

The Reach survived the war by forming the Asterion Mutual Aid Compact. The Compact saved lives through pooled civilian vessels, food, defense platforms, medical resources, intelligence, and emergency authority. Now that the war is over, its members do not agree on whether those powers should dissolve.

The deeper campaign threat is Pale Lantern, a distributed Dominion contingency system designed to weaponize distrust after retreat. It fabricates evidence, redirects traffic, manipulates authentication systems, and gives frightened actors enough information to believe preemption is their only safe choice.

Pale Lantern is dangerous because it exploits real grievances. It does not create all of them.

## Campaign Thesis

Peace is not simply the absence of an enemy. Peace is the work of deciding what must be repaired, what must be changed, and who gets to participate in that decision.

The campaign does not ask whether Federation ideals are worthwhile. It asks what those ideals require after Federation institutions have failed to live up to them.

## Package Role

Ashes of Peace is the main campaign or questline inside the Breckinridge starship package.

The package must provide:

- Breckinridge ship template and post-refit constraints.
- Senior crew and starting relationship state.
- Main campaign structure for Ashes of Peace.
- Three Open Orders intervals.
- Designed side assignments.
- Side mission rules that preserve campaign continuity.
- Asterion Reach factions, locations, recurring NPCs, and guardrails.
- Director-only truth for Pale Lantern and related factions.
- Campaign state tracks and ending rules.

Side missions and Open Orders assignments must inherit current campaign state and write persistent outcomes back into the same campaign continuity.

## Opening Baseline

The Breckinridge is not responding to an immediate emergency at campaign start.

Timeline:

- Stardate `52980.8`: Breckinridge departs Utopia Planitia.
- Twenty-five days underway: reconstituted crew conducts shakedown operations without the permanent XO.
- Stardate `53049.2`: the ship receives the player aboard from a long-range personnel shuttle.
- Ten days remain before arrival at the Asterion Reach.
- Stardate `53076.6`: baseline arrival at the Reach, subject to prelude consequences.

The final ten days matter because the player joins a ship with working routines but unsettled command culture. The player should immediately face choices about delegation, provisional procedures, technical debt, crew trust, and Captain Whitaker's expectations.

## Starting Directives

The Breckinridge's formal mission is to:

1. Restore reliable Starfleet presence in the Asterion Reach.
2. Protect civilian life and freedom of navigation.
3. Support humanitarian and reconstruction operations.
4. Survey wartime damage to communications, navigation, and subspace infrastructure.
5. Investigate counterfeit Starfleet signals and missing relief cargo.
6. Avoid prejudicing Federation negotiations concerning the Asterion Mutual Aid Compact.
7. Coordinate with local civil authorities without assuming command unless a lawful emergency requires it.

These orders are intentionally ambiguous. Starfleet does not have one unified private answer. Different officials want different outcomes.

## Region

The Asterion Reach is an original region of Federation colonies, industrial stations, shipping lanes, and small non-aligned settlements near the former Cardassian frontier.

Principal regional anchors:

- Asterion Station.
- Galen Passage.
- Pelion System.
- Orison Belt.
- Helix Yard and Karth industrial moon.
- Demeris System.
- Suvek Relief Enclave.
- Hecate Drift.

The region should feel close enough for regular side assignments. Travel between major systems generally takes hours rather than weeks.

## Factions

Core factions:

- Starfleet Reconstruction Command.
- Asterion Mutual Aid Compact.
- Compact Security Directorate.
- Cardassian Relief Authority.
- Project Farwatch.
- Pale Lantern.

Recurring campaign NPCs include Rear Admiral Helena Tolland, Commander Elias Rourke, Director Nia Kessler, Marshal Darius Holt, Governor Leona Marr, Mira Solenn, Administrator Asha Prel, Captain Nella Ivers, Commander Varrik Tonn, and Doctor Eren Vos.

No character starts with the full campaign truth. Faction autonomy and knowledge boundaries are campaign rules, not optional flavor.

## Campaign State

Ashes of Peace introduces package-specific campaign state tracks:

- Regional Trust.
- Lantern Escalation.
- Humanitarian Strain.
- Starfleet Scrutiny.
- Compact Unity.
- Crew relationship state.
- Campaign assets.

These tracks should remain hidden as raw numbers in normal play. The player should observe them through fiction, briefings, access, resistance, delays, shortages, formal review, local cooperation, and crew behavior.

## Structure

The full campaign contains:

- One prelude mission.
- Eight main chapters.
- Three Open Orders intervals.
- Nine designed side assignments, with typical play completing four to six.
- Recurring shipboard B-plots.
- A multi-front finale.
- One epilogue mission and command review.

Expected campaign length is roughly 35 to 60 substantial text-roleplay sessions.

## Chapter Cards

### Prelude: A Ship Underway

Question: What kind of executive officer has joined the ship?

Pressure: readiness, delegation, and ordinary rescue.

Core consequence: initial crew trust and technical debt.

### Chapter 1: The Empty Convoy

Question: How does Starfleet act when its own authority may be counterfeit?

Pressure: rescue, quarantine, detention, missing hardware.

Core clue: authentic code fragments in a false order.

### Chapter 2: False Colors

Question: Who gets to verify Starfleet's innocence?

Pressure: public accusation, injured patrol crew, tactical secrecy.

Core clue: counterfeit Breckinridge attack routed through Hecate.

### Open Orders I: Work Worth Doing

Question: What does useful Starfleet presence look like between crises?

Pressure: repair, pilot recovery, informal networks.

Core reward: early local assets and crew development.

Designed side assignments:

- The Long Repair.
- Borrowed Wings.
- Quiet Channels.

### Chapter 3: Dead Letters

Question: Who owns intercepted truth after war?

Pressure: hazardous relay recovery, privacy, evidence custody.

Core clue: distributed Dominion contingency architecture.

### Chapter 4: The Colony That Stayed

Question: Is survival under compromised authority disloyalty?

Pressure: jurisdiction, collaboration, diverted evacuation, Solenn's culpability.

Core clue: local use of Pale Lantern and Starfleet's real wartime failure.

### Chapter 5: Old Lessons

Question: How should command use experience when the adversary has studied it?

Pressure: civilian traffic, weapons platforms, authentication theft.

Core clue: Pale Lantern predicts Starfleet doctrine.

### Open Orders II: What Survives

Question: Which emergency measures should persist after emergency?

Pressure: old defenses, trauma treatment, inconvenient science.

Core reward: finale readiness assets.

Designed side assignments:

- The Last Watch.
- Second Opinion.
- An Unwelcome Result.

### Chapter 6: The Cost of Knowing

Question: Who may impose secret risk in the name of security?

Pressure: Farwatch authority, evidence purge, false recall.

Core clue: Starfleet credentials enabled Nightfall.

### Chapter 7: A Peace of Their Own

Question: What political authority did survival create?

Pressure: Annex occupation, task group, charter negotiation.

Core result: the form of regional legitimacy entering the finale.

### Open Orders III: Before the Lamps Go Out

Question: What should the crew preserve before the final crisis?

Pressure: memory, scientific hope, identity law, repair.

Core reward: final preparation and personal closure.

Designed side assignments:

- The Name on the Hull.
- A Signal Toward Home.
- Two Signatures.

### Chapter 8: The Last Directive

Question: Can people cooperate while every system tells them cooperation is dangerous?

Pressure: command mesh, weapons grid, network quorum, evacuation.

Core result: operational and political ending axes.

### Epilogue: The Terms We Keep

Question: What does accountability require after survival?

Pressure: settlement, inquiry, public narrative, crew consequence.

Core result: persistent campaign state for the next story arc.

## Mission Direction Rules

Ashes of Peace reinforces the Mission Director model.

Rules:

- Situation on rails, solution off rails.
- Every dynamic event must have a causal parent.
- Some calm side assignments must remain calm and unrelated to Pale Lantern.
- Crew disagreement should be focused, not a full-crew debate every scene.
- NPC knowledge boundaries must be preserved.
- If the player bypasses an expected scene, move information only when causally justified.
- Escalation pacing should serve the situation, not force combat or countdowns.
- Senior-staff briefings should separate known facts, inference, unknowns, risks, and command decisions.
- Factions act between scenes based on their goals and information, not just to counter the player.

## Failure And Recovery

No single failed check should end a mission. Failure should produce cost, pressure, lost time, damaged trust, injuries, system strain, harder clue routes, faction leverage, or a harder decision.

The campaign can continue if major NPCs refuse cooperation, escape, destroy evidence, or lose office. It can also continue if the Hecate relay is lost, the Breckinridge is heavily damaged, or side assignments are ignored.

Senior-crew death should not result from a casual hidden roll. It requires an established lethal situation, a meaningful decision or accumulated consequence, fair opportunity for command response, and appropriate narrative weight.

Refusing an assignment is a consequential command act, not an out-of-bounds input.

## Player-Facing Information

The player may see:

- Current stardate and location.
- Formal mission objectives.
- Known directives.
- Public deadlines.
- Major ship conditions.
- Current crew assignments.
- Named favors or assets.
- Inspiration and Resolve progression.

The player should not see:

- Lantern Escalation as an exact number.
- NPC loyalty scores.
- Secret faction clocks.
- Undiscovered Pale Lantern architecture.
- A list of valid solutions.
- Predetermined Command Decisions.

## Implementation Implications

The Breckinridge package should model Ashes of Peace through the approved package spine:

```text
manifest
ship
crew
characterCreation
mainCampaign
sideMissionRules
missionTemplates
guardrails
assets
```

Expected package data additions:

- `mainCampaign.id`: stable campaign id for Ashes of Peace.
- `mainCampaign.openingStardate`: `53049.2`.
- `mainCampaign.chapters`: prelude, eight chapters, Open Orders intervals, finale, epilogue.
- `mainCampaign.stateTracks`: Regional Trust, Lantern Escalation, Humanitarian Strain, Starfleet Scrutiny, Compact Unity.
- `mainCampaign.recurringActors`: faction and NPC templates.
- `sideMissionRules.openOrders`: three interval definitions.
- `missionTemplates`: side assignment and main chapter mission graph definitions.
- `guardrails`: mission direction rules, clue resilience, hidden information rules, failure-forward rules, and canon-era constraints.

## Open Production Decisions

Still unresolved:

- Breckinridge registry number.
- Exact late-war action that forced the Breckinridge into the Utopia Planitia yard period.
- Names, classes, and detailed histories of the two principal donor ships used to reconstitute the crew.
- Captain Breckinridge's full name, former command, and memorial record.
- Player character creation constraints and starting Values.
- Exact Inspiration and Resolve thresholds.
- Which side assignments may be delegated without direct player participation.
- Whether Whitaker can be temporarily relieved or incapacitated in the finale.
- Whether Pale Lantern can survive as a future campaign thread.
- Exact legal structure of the final Compact charter.
- Final names and species of minor local officials, pilots, and away-team personnel.
