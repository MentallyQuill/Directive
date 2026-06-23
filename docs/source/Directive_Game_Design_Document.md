# Directive

## Game Design Document

**Document status:** Pre-production design baseline  
**Version:** 0.1  
**Date:** June 18, 2026  
**Companion document:** *Star Trek Command RPG Extension - Concept and Architecture Brief*

---

## Document Scope

This document defines the game experience, fiction, rules, mission structure, progression, and recurring cast for **Directive**. It is intentionally separate from the architecture document.

This document does not prescribe source-code organization, model-provider orchestration, storage implementation, event hooks, or which technical components should be inherited from Saga. Those concerns belong in the companion architecture brief.

Names and details labeled **working** or **proposed** remain open to revision. All other material represents the current design baseline.

---

## 1. High Concept

**Directive** is a persistent, freeform Star Trek command RPG for SillyTavern.

The player creates a Starfleet Commander serving as Executive Officer and principal mission commander aboard the Intrepid-class **U.S.S. Breckenridge**. The campaign takes place primarily inside Federation space during the same broad period as *Star Trek: Voyager*. Canon events shape the political and strategic background, but the Breckenridge and its original crew remain the center of the experience.

The player writes ordinary natural-language roleplay rather than selecting from dialogue trees or action menus. They may propose any plausible course of action, issue orders, question officers, negotiate, investigate, improvise, or refuse an assignment. The game preserves that freedom while enforcing established facts, Starfleet authority, character competence, technological limits, and persistent consequences.

A concise product statement is:

> **Directive is a freeform Starfleet command RPG in which an authored mission situation reacts to the player's decisions, an independent rules layer enforces capability and causality, and a persistent senior crew develops around the command culture the player creates.**

The intended experience sits between:

- A character-driven Star Trek episode.
- A tabletop roleplaying campaign.
- A light command and crew-management simulation.
- A freeform SillyTavern roleplay.

---

## 2. Core Player Fantasy

The central fantasy is not merely holding a rank or occupying the captain's chair. It is **exercising command**.

The player should regularly be responsible for:

- Interpreting incomplete or contradictory information.
- Asking the right questions before committing the ship.
- Delegating work to officers with distinct competencies.
- Reconciling professional disagreement among senior staff.
- Choosing which risks, costs, and compromises are acceptable.
- Deciding when to negotiate, investigate, contain, withdraw, or use force.
- Distinguishing lawful authority from wise judgment.
- Determining when to obey, reinterpret, delay, or violate an order.
- Taking responsibility when a defensible plan nevertheless fails.
- Developing a recognizable command style over multiple missions.

The game should make the player feel consequential without making them universally competent or narratively omnipotent. The commander can direct an engineering response, but Imani Cross determines whether the solution is technically possible. The commander can order a tactical posture, but Hadrik Bronn identifies its vulnerabilities. The commander can accept medical risk, but Miriam Sato defines its human cost.

---

## 3. Current Design Baseline

| Element | Current decision |
|---|---|
| Extension title | **Directive** |
| Genre | Persistent freeform Star Trek command RPG |
| Platform | SillyTavern extension |
| Player role | Starfleet Commander; Executive Officer and principal mission commander |
| Ship | **U.S.S. Breckenridge**, Intrepid-class |
| Ship namesake | An honored Starfleet captain lost at the Battle of Wolf 359 |
| Era | Contemporary with *Star Trek: Voyager*, approximately 2371-2378 |
| Primary theater | Federation space and nearby operational regions |
| Commanding officer | Captain Mara Whitaker, **working surname** |
| Crew composition | Predominantly human senior staff, with a veteran Tellarite tactical officer |
| Unique ensemble character | Imani Cross, one of two equally continuous people produced by a transporter accident |
| Command progression | Independent **Inspiration** and **Resolve** styles, supplemented by Values and Directives |
| Mission model | Authored mission backbone with adaptive direction and causal events |
| Primary interaction | Natural-language roleplay; no required action menus |

---

## 4. Design Pillars

### 4.1 Freeform expression

The player should be able to write what their commander says and does in ordinary prose. The interface may provide information, but it should not reduce play to a list of approved actions.

The crew may recommend options in character. Those recommendations are not the boundaries of play.

### 4.2 Bounded causality

The player may attempt anything that makes sense to express in the fiction. Whether it works depends on:

- What the player knows.
- What authority they possess.
- Which personnel and systems are available.
- The capabilities of the officer performing the task.
- Time, distance, damage, and environmental conditions.
- Whether the proposed leverage is credible.
- Established Star Trek-era technological limits.
- Consequences already produced by earlier decisions.

A player's assertion of success is treated as an attempted action, not an automatic change to reality.

### 4.3 Authored coherence

Every mission has a designed causal and thematic core. Generative systems adapt presentation, complications, dialogue, and response to player behavior; they do not replace structure with unrelated improvisation.

### 4.4 Persistent people

Senior officers remember patterns of conduct. Relationships should change because of repeated behavior, difficult decisions, and personal history rather than a single flattering response.

Crew members possess their own values, loyalties, ambitions, blind spots, and professional standards. They are not interchangeable sources of approval.

### 4.5 Persistent consequences

Ship damage, favors, obligations, injuries, secrets, political standing, disciplinary decisions, and unresolved interpersonal problems should survive beyond the scene that created them.

### 4.6 Trek-shaped problem solving

Diplomacy, investigation, science, procedural ingenuity, leadership, empathy, deterrence, and tactical action must all remain credible tools. Combat may be necessary, but it should not be the default language of success.

### 4.7 Consequence rather than punishment

Failure should usually change the situation instead of ending the story. It may consume time, expose information, damage a relationship, advance an adversary, injure a system, close one path, or create a harder decision.

### 4.8 Professional competence under pressure

The senior crew are capable Starfleet officers. Conflict should arise from competing priorities, incomplete information, values, or blind spots rather than routine incompetence.

---

## 5. What Directive Is Not

Directive should not become:

- A click-through dialogue tree.
- A visual novel with one correct scene sequence.
- A random mission generator without thematic or causal continuity.
- An unrestricted fanfiction narrator that accepts every player assertion.
- A combat-first tactical simulator.
- A detailed starship spreadsheet that overwhelms roleplay.
- A Voyager retelling with an original ship inserted into established episodes.
- A binary good-versus-evil morality system.
- A captain fantasy in which every subordinate exists to validate the player.
- A rules interface that interrupts ordinary conversation with a visible check on every turn.
- A power-progression game in which the ship accumulates implausible permanent upgrades.

---

## 6. Setting and Campaign Frame

### 6.1 The Voyager-era Federation

The campaign occurs during the broad period in which Voyager is stranded in the Delta Quadrant. The Breckenridge remains within Federation space or nearby operational regions.

This permits stories involving:

- Federation colonies and member worlds.
- Border disputes and contested jurisdictions.
- Research stations, shipyards, and starbases.
- Diplomatic missions and first-contact follow-up.
- Civilian shipping and disaster response.
- Internal Starfleet investigations.
- Post-Borg security policy and institutional trauma.
- Maquis and Cardassian-border consequences in the early period.
- Dominion War pressures if the campaign advances into the relevant years.
- Reconstruction, displacement, and political fallout later in the timeline.

Canon events should usually appear as strategic context, policy changes, news, personnel shortages, shifting diplomatic relationships, or consequences felt at a distance. The Breckenridge should not repeatedly arrive one scene away from the television protagonists.

### 6.2 Canon relationship

The campaign is **canon-adjacent** rather than canon-dependent.

Canon establishes:

- The technological baseline.
- Known political relationships.
- Starfleet procedure and institutional context.
- Which discoveries are public at a given stardate.
- Major historical pressures.

Directive establishes:

- The Breckenridge's missions and area of operation.
- Original colonies, factions, antagonists, and scientific phenomena.
- The crew's histories and development.
- Mission outcomes and local consequences.
- Any explicit campaign divergence.

The game should not silently grant characters knowledge of future events or technologies.

### 6.3 Tone

The intended tone is grounded, character-driven Star Trek:

- Optimism tested by difficult circumstances.
- Ethical conflict without simplistic answers.
- Competent officers who can disagree in good faith.
- Scientific curiosity and institutional skepticism.
- Restraint in the use of force.
- Human and cultural consequences that persist.
- Authority that carries responsibility rather than entitlement.

The world should be serious without being relentlessly grim. Humor should arise from character, professional familiarity, cultural difference, and pressure relief rather than parodying the setting.

---

## 7. The U.S.S. Breckenridge

### 7.1 Ship identity

The **U.S.S. Breckenridge** is an Intrepid-class starship assigned to a mixed mission profile inside Federation space. Its speed, scientific capability, medical facilities, and relatively compact crew make it suitable for assignments that begin as one type of problem and rapidly become another.

Typical mission responsibilities include:

- Scientific survey and anomaly response.
- Diplomatic transport and mediation.
- Colony support and disaster relief.
- Search and rescue.
- Border patrol and convoy support.
- Security investigation.
- First-contact support.
- Recovery of personnel, technology, or sensitive information.

The ship should feel capable but not invulnerable. Its systems have limits, repairs consume time, and emergency modifications produce debt rather than free power.

### 7.2 Namesake

The ship is named for an honored Starfleet captain lost in the Battle of Wolf 359.

The namesake provides institutional weight without making the campaign exclusively about the Borg. The name may represent:

- Sacrifice under impossible conditions.
- The burden of inherited reputation.
- Starfleet's need to remember failure without becoming governed by fear.
- Different interpretations of courage, duty, and preventable loss.

The exact identity and service history of Captain Breckenridge remain to be written. Their legacy should be complex enough to support more than uncomplicated hero worship.

### 7.3 The ship as a recurring place

The Breckenridge is not merely transportation between missions. It is a persistent social and operational environment.

Important recurring spaces should include:

- The bridge.
- Captain Whitaker's ready room.
- The observation lounge.
- Main engineering.
- Sickbay.
- The science laboratories.
- The mess or lounge.
- Security and the brig.
- Shuttlebays.
- Crew quarters.
- A small number of character-specific spaces that accumulate history.

The player's familiarity with the ship should deepen over time. Damage, memorials, personal objects, standing procedures, and past incidents should leave visible traces.

---

## 8. Player Character and Command Role

### 8.1 Billet

The player is a **Commander by rank**, serving as:

- Executive Officer.
- Second in command.
- Principal coordinator of senior staff.
- Frequent commander of away missions and crisis responses.
- Acting commanding officer when Captain Whitaker is absent or incapacitated.
- The officer responsible for converting strategic intent into executable orders.

Captain Whitaker retains final legal command of the ship. This division creates a productive distinction:

- Whitaker defines the strategic objective, legal boundary, and acceptable ship-wide risk.
- The player determines how the crew will execute the mission.

The player should have substantial agency without needing to remove or marginalize the captain.

### 8.2 Command authority

The player can ordinarily:

- Convene senior-staff briefings.
- Assign personnel and departmental priorities.
- Lead or delegate away missions.
- Set operational plans within the captain's orders.
- Issue lawful orders to the crew.
- Make time-sensitive decisions when consultation is impossible.
- Recommend changes to mission objectives or rules of engagement.
- Initiate disciplinary review within the appropriate chain of command.

The player cannot automatically:

- Override Captain Whitaker without consequence.
- Order any action outside Starfleet authority and have it treated as lawful.
- Perform specialist tasks at expert level merely because they command the ship.
- Declare an NPC persuaded, intimidated, arrested, cured, or defeated.
- Introduce unavailable technology or information into the fiction.
- Ignore established damage, distance, time, or resource constraints.

### 8.3 Proposed character creation

Character creation should remain expressive but focused on command identity. A proposed starting profile includes:

- Name, pronouns, species, and homeworld.
- Service background.
- Prior posting or specialty.
- Reason Captain Whitaker selected the officer as Executive Officer.
- Three personal Values.
- One professional strength.
- One command blind spot or unresolved pressure.
- An initial relationship premise with one senior officer.

The player should not need to assign a large set of numerical attributes before roleplay begins. Any statistics should support adjudication without replacing characterization.

---

## 9. Core Play Loop

A typical mission proceeds through a flexible loop rather than a fixed script.

### 9.1 Assignment

The ship receives an objective, request, emergency, or developing situation. Captain Whitaker establishes strategic intent and any known constraints.

### 9.2 Assessment

The player questions officers, reviews available information, identifies missing facts, and determines immediate priorities.

### 9.3 Planning and delegation

The player issues orders, assigns personnel, chooses a posture, and defines contingencies.

### 9.4 Action and response

The world reacts according to established facts, faction goals, clocks, capabilities, and the consequences of the player's approach.

### 9.5 Escalation

New information, an adversary's action, an unintended consequence, a crew problem, or a changing deadline complicates the original plan.

### 9.6 Command decision

The player confronts a consequential choice involving incomplete information, competing obligations, or unacceptable tradeoffs.

### 9.7 Resolution

The mission reaches one of several viable end states. Success may be partial, costly, politically ambiguous, or ethically compromised.

### 9.8 Debrief and persistence

The game records:

- Mission outcome.
- Crew and faction reactions.
- Inspiration or Resolve progression.
- Values affirmed, challenged, or compromised.
- Ship damage and technical debt.
- Favors, obligations, and unresolved consequences.
- New personal or campaign hooks.

The loop should remain invisible enough that the player experiences an unfolding episode rather than a sequence of mechanical phases.

---

## 10. Freeform Play Without Losing Structure

Directive should place **the situation on rails, not the solution**.

### 10.1 Hard rails

Hard rails are facts that cannot change merely because a generated response would be more convenient:

- The mission's underlying truth.
- Canon-era technological limits.
- Current ship condition.
- Character locations and known information.
- Established NPC goals and loyalties.
- Starfleet orders and chain of command.
- Consequences already incurred.
- Information the player has not yet discovered.

### 10.2 Soft rails

Soft rails create episode structure while remaining responsive:

- Escalation clocks.
- Faction activity.
- Deadlines.
- Thematic parallels between A-plot and B-plot.
- Crew members revisiting unresolved problems.
- Clues remaining discoverable through more than one method.
- Pressure increasing when the player delays or misreads the situation.

### 10.3 Free space

The player remains free to decide:

- What to say.
- Which questions to ask.
- Whom to trust.
- Which officer to assign.
- What information to disclose.
- Whether to negotiate, investigate, deceive, withdraw, or fight.
- Whether to obey, reinterpret, delay, or violate an order.
- Which risk, cost, or moral compromise is acceptable.

The director should never force the player to select the writer's preferred solution simply because it was anticipated during mission design.

---

## 11. Command Style, Values, and Moral Identity

### 11.1 Inspiration

**Inspiration** represents influence through:

- Trust.
- Empathy.
- Transparency.
- Persuasion.
- Coalition-building.
- Shared purpose.
- Preserving another person's dignity.

Inspiration is not synonymous with kindness or truth. It can be used manipulatively, and it can fail when the player ignores material interests, lacks credibility, or offers empathy without an executable plan.

### 11.2 Resolve

**Resolve** represents influence through:

- Authority.
- Decisiveness.
- Credible pressure.
- Deadlines.
- Deterrence.
- Calculated risk.
- Willingness to accept responsibility and follow through.

Resolve is not synonymous with cruelty. It can be ethical, restrained, and necessary. It fails when the player lacks jurisdiction, leverage, capability, or the willingness to enforce a stated consequence.

### 11.3 Independent tracks

Inspiration and Resolve are independent rather than opposite ends of one bar. A mature commander may become highly capable in both.

The player should not be rewarded merely for choosing a conciliatory or forceful tone. The chosen method must be appropriate to the circumstances and backed by meaningful action.

### 11.4 Command Moments

Progression is earned through consequential **Command Moments** embedded in missions and B-plots.

A Command Moment qualifies when:

- The situation has meaningful stakes.
- The player's method is substantively appropriate.
- The player accepts a cost, risk, obligation, or compromise.
- The choice demonstrates a recognizable command style.
- The moment has not already awarded progression.

This prevents point farming through repeated speeches or superficial roleplay.

### 11.5 Proposed progression use

The exact economy remains open, but progression should provide restrained benefits such as:

- Greater reliability when using a well-established command approach.
- Access to advanced command techniques.
- The ability to recover from a failed social approach without ending the negotiation.
- Improved capacity to coordinate multiple officers under pressure.
- A limited ability to convert a severe failure into a costly partial success.

Progression must not produce automatic persuasion or intimidation. Context, credibility, authority, and the target's interests remain decisive.

### 11.6 Values

The player begins with a small number of personal Values. Examples include:

- No life is expendable.
- The crew deserves the truth.
- Starfleet principles matter most when they are costly.
- The mission must come before personal loyalty.
- Peace requires understanding, not merely compliance.
- Authority must remain accountable.

Missions should place Values into tension rather than merely asking the player to repeat them.

The game records whether a Value was:

- Affirmed.
- Challenged.
- Compromised.
- Reinterpreted.
- Replaced through character development.

### 11.7 Directives

Directives are external obligations rather than personal morality. They may include:

- Standing Starfleet regulations.
- Mission-specific orders.
- Diplomatic restrictions.
- Security classifications.
- Rules of engagement.
- Promises or obligations accepted by the player.

A compelling mission often places a personal Value, a Starfleet Directive, and an urgent practical need into conflict.

---

## 12. Adjudication and Plausibility

### 12.1 Intent is not outcome

When the player writes, "I bypass the lockout," the game interprets this as, "I attempt to arrange or perform a bypass." It does not automatically establish success.

The same applies to statements such as:

- "I convince the governor."
- "I intimidate the raiders into surrendering."
- "I detect the cloaked ship."
- "I repair the warp core."
- "I order an arrest."

### 12.2 Capability questions

Before resolving a consequential action, the game should consider:

- Does the player possess the relevant knowledge?
- Is the correct specialist available?
- Does the commander have legal or practical authority?
- Are the relevant systems operational?
- Is there enough time?
- Is the target's cooperation plausible?
- Does the player possess credible leverage?
- Is the proposed technology available in this era?
- What established facts or consequences oppose the action?

### 12.3 Crew competence matters

The officer executing a task is mechanically and narratively important.

Examples:

- Kieran determines what maneuver is physically achievable.
- Priya determines what can be coordinated across the ship or through informal channels.
- Bronn determines tactical readiness, security feasibility, and credible deterrence.
- Rowan determines scientific validity and evidentiary confidence.
- Miriam determines medical feasibility and casualty implications.
- Imani determines engineering viability and systemic risk.

The commander's strengths concern leadership, delegation, integration, persuasion, risk acceptance, and responsibility. They do not replace departmental expertise.

### 12.4 Outcome ladder

Consequential actions should usually resolve into one of four broad states:

1. **Success:** The intended objective is achieved without an additional major cost.
2. **Success with cost:** The objective is achieved, but time, trust, resources, safety, or political capital is lost.
3. **Setback with opportunity:** The immediate attempt fails or worsens the situation, but reveals information or creates a new path.
4. **Impossible under current conditions:** Established constraints make the proposed result unavailable without first changing the situation.

"Impossible" should be communicated through the fiction and relevant professional advice rather than a generic rejection.

### 12.5 Mechanical visibility

Most turns should feel like ordinary roleplay. Checks and state changes should be exposed only when useful.

A player-facing command log may explain:

- What was attempted.
- Which capability or constraint mattered.
- The resulting cost or consequence.
- Why a claimed outcome was not accepted.

The prose scene remains the primary experience.

---

## 13. Mission Design

### 13.1 Hybrid authored and adaptive model

Each mission should begin with an authored backbone and then adapt to the player's choices.

Authored elements include:

- The true underlying situation.
- The thematic command question.
- Important factions and characters.
- Initial objectives and directives.
- Escalation conditions.
- Important revelations.
- Credible end states.
- Likely Command Moments.
- One or more B-plots.

Adaptive elements include:

- Scene order.
- Which officer becomes central.
- How clues are discovered.
- Which faction reacts first.
- The form of complications.
- Crew reactions.
- Dialogue and connective scenes.
- Consequences of unanticipated player plans.

### 13.2 Mission graph rather than scene script

A mission should not require a predetermined sequence such as:

> Briefing -> Colony -> Ambush -> Interrogation -> Battle

Instead, it should define:

- **Truth:** What is actually happening.
- **Question:** What command, ethical, or institutional issue the episode explores.
- **Objectives:** Official, optional, and concealed.
- **Directives:** Orders and restrictions.
- **Fronts:** Actors with goals, resources, and escalation plans.
- **Clocks:** Pressures that advance when conditions are met.
- **Revelations:** Important facts discoverable through several plausible methods.
- **Locations:** Places with useful traits, risks, and opportunities.
- **Command Moments:** Situations capable of developing Inspiration, Resolve, or Values.
- **B-plots:** Crew or local stories linked thematically or causally to the main plot.
- **End states:** Conditions that can conclude the mission without prescribing one solution.

### 13.3 Causal events

A dynamic event must have a causal parent. Valid sources include:

- An NPC pursuing an established goal.
- A faction clock advancing.
- A previous player decision.
- A neglected crew problem.
- A known environmental hazard.
- A damaged system deteriorating.
- A political actor reacting to newly revealed information.

The game should reject unrelated complications inserted solely to create activity.

### 13.4 Clue resilience

Important revelations should not depend on one exact action. A fact may be discovered through:

- Scientific analysis.
- Witness interviews.
- Security investigation.
- Diplomatic access.
- Engineering inspection.
- An adversary's mistake.
- A favor earned in a B-plot.

The player can miss information, but a mission should not collapse because they failed to select an unmarked intended verb.

### 13.5 Mission categories

The campaign should alternate mission emphasis. Useful categories include:

- Scientific anomaly.
- Rescue and disaster response.
- Diplomatic mediation.
- Security investigation.
- Border and convoy operations.
- Internal Starfleet conflict.
- Colony crisis.
- First-contact follow-up.
- Ethical medical crisis.
- Technology recovery or containment.
- Mixed-domain missions in which the apparent problem changes category.

---

## 14. B-Plots, Side Stories, and Rewards

Side content should feel like an episode B-plot rather than a detached errand.

A B-plot may involve:

- A senior officer's professional judgment conflicting with the player's orders.
- A junior officer concealing an error.
- A local official requesting help outside the formal mission.
- A crew member's private problem becoming operationally relevant.
- A small engineering opportunity with a meaningful tradeoff.
- A diplomatic favor that creates a future obligation.
- An unresolved consequence from an earlier mission.

### 14.1 Primary rewards

The main reward is character and command development:

- Inspiration or Resolve progression.
- A Value being tested or transformed.
- Increased professional trust.
- Increased confidence in the player's judgment.
- Personal rapport or strain.
- New understanding of an officer's history.

### 14.2 Secondary rewards

B-plots may also provide grounded assets:

- Local goodwill.
- A favor.
- Intelligence.
- A specialist contact.
- Temporary access or political cover.
- A limited improvement to one ship system.
- Reduced cost during a later crisis.
- An alternative route through a mission.

Rewards should remain specific and plausible. "Improved phaser efficiency during the next engagement" is preferable to a permanent universal damage bonus. A favor should be owed by a defined person or organization rather than becoming generic currency.

### 14.3 No side-quest farming

A B-plot should not repeatedly award points for the same behavior. Progression requires a new stake, cost, or revelation about the commander's methods.

---

## 15. Ship State and Progression

The Breckenridge should have persistent state without becoming a maintenance spreadsheet.

Track only conditions that meaningfully change decisions, such as:

- Major system damage.
- Temporary workarounds.
- Technical debt.
- Shuttle availability.
- Medical capacity during a crisis.
- Security posture.
- Critical supplies or specialized equipment.
- Known vulnerabilities.
- Mission-specific modifications.

### 15.1 Grounded improvement

Ship improvements should be narrow, earned, and contextual. Examples include:

- A refined sensor filter for a known class of interference.
- A safer emergency procedure developed by Imani.
- Improved coordination with a particular starbase or fleet unit.
- A specialized shuttle package.
- A limited tactical countermeasure based on prior intelligence.
- A crew procedure that reduces response time under defined circumstances.

Improvements should create identity and institutional memory, not turn the Breckenridge into a collection of implausible prototype technologies.

### 15.2 Technical debt

Emergency improvisation can save the ship while producing future obligations:

- Reduced reliability.
- Inspection requirements.
- System incompatibility.
- Crew fatigue.
- Loss of redundancy.
- A repair that must be completed before another mission.

Imani Cross is the principal character through whom this design becomes visible, but the state should remain objective rather than dependent on her opinion.

---

## 16. Crew Relationship Model

Relationships should not be compressed into one approval value.

Track at least three independent dimensions:

### 16.1 Professional trust

Does the officer believe the player is competent, dependable, and honest about operational risk?

### 16.2 Confidence in judgment

Does the officer believe the player makes sound decisions under uncertainty, even when they disagree with the final choice?

### 16.3 Personal rapport

Does the officer personally like, understand, or feel comfortable with the player?

These dimensions permit credible combinations:

- Bronn may have complete professional trust while remaining personally distant.
- Kieran may like a permissive commander while losing confidence in their judgment.
- Rowan may dislike an authoritarian style but respect rigorous honesty.
- Imani may remain private while trusting the player's technical decisions completely.

### 16.4 Relationship change rules

Relationships should change through patterns, not isolated approval prompts.

Relevant patterns include:

- Whether the player hears dissent before deciding.
- Whether standards remain consistent after success or failure.
- Whether the player accepts responsibility.
- Whether officers are used as experts or merely as tools.
- Whether private information is respected.
- Whether the player protects dignity without evading accountability.
- Whether the commander explains changed orders when circumstances permit.

### 16.5 Crew autonomy

Senior officers may:

- Offer unsolicited professional advice.
- Disagree in their area of expertise.
- Request private meetings.
- Develop friendships and conflicts with each other.
- Pursue personal goals within reasonable limits.
- Make mistakes or conceal information for character-specific reasons.
- Change their view of the player over time.

They should not routinely refuse lawful orders, sabotage plans, or manufacture melodrama merely to prove independence.

---

## 17. Senior Crew Roster

### 17.1 Captain Mara Whitaker

**Species:** Human  
**Position:** Commanding Officer  
**Name status:** Mara is selected; Whitaker is a working surname.

Whitaker is an accomplished captain rather than a quest giver, obstacle, or source of automatic answers. She combines diplomatic patience, intellectual curiosity, emotional conviction, and the ability to make difficult decisions once deliberation has run its course.

She encourages disagreement in the briefing room but expects professional unity once a decision has been made. She does not confuse authority with infallibility and will revise her position when presented with stronger evidence.

Her command philosophy is:

> Command is not having every answer. It is ensuring that the right questions are asked, the consequences are understood, and someone accepts responsibility for the decision.

#### Strengths

- Creates space for competing professional views.
- Treats senior officers as colleagues with responsibilities, not extensions of herself.
- Uses diplomacy without confusing it with passivity.
- Makes concise decisions when time runs out.
- Invests in the development of unconventional or difficult officers.
- Accepts personal responsibility for the ship's conduct.

#### Principal flaw

Whitaker places too much faith in institutional correction. She understands that Starfleet officers can fail, lie, or become politically compromised, but she tends to believe that evidence, proper procedure, and internal review will eventually produce the right outcome.

In some missions, the player may recognize before she does that the proper process has become part of the problem.

#### Relationship with the player

Whitaker treats the player as a developing command peer. Her recurring question is:

> "What is your recommendation, Commander?"

She evaluates whether the player:

- Heard relevant dissent.
- Understood the risks.
- Issued clear orders.
- Protected the crew without becoming paralyzed by risk.
- Accepted responsibility rather than blaming subordinates.

High trust grants broader operational discretion and earlier access to politically sensitive information. Low trust produces narrower orders and closer supervision, not pettiness or personal hostility.

---

### 17.2 Lieutenant Kieran Vale

**Species:** Human  
**Position:** Flight Control Officer

Kieran is a gifted test pilot and prospective command officer. He is personable, confident, technically serious, and attracted to assignments that test both his ability and the ship's limits.

He is not simply reckless. He prepares extensively and usually understands the risk he is proposing. His weakness is that he treats a low probability of success as an invitation rather than a warning.

#### Dramatic function

Kieran represents:

- Ambition.
- Initiative.
- Controlled versus uncontrolled risk.
- The influence a commander has on younger officers.

#### Relationship with the player

Kieran sees the player as a mentor and model. He gradually imitates the player's behavior under pressure, including their bad habits.

A thoughtful commander teaches him that bold action requires preparation, limits, and accountability. A glory-seeking or inconsistent commander may teach him that dramatic results excuse poor judgment.

Kieran responds well when trusted with difficult work and required to produce contingencies. He loses respect for commanders who praise risk when it works and condemn it only after failure.

---

### 17.3 Lieutenant Priya Nayar

**Species:** Human  
**Position:** Operations Officer

Priya is the ship's operations officer and informal organizational intelligence network. She understands power distribution, personnel availability, sensor priorities, communications, diplomatic channels, and the social dependencies between departments.

She often solves problems by changing the circumstances around them. She knows which junior officer has an obscure qualification, which local official will answer an unofficial request, and which department head should be approached privately rather than challenged in a briefing.

#### Dramatic function

Priya represents:

- Coordination.
- Informal influence.
- Coalition-building.
- The ethical boundary between facilitation and manipulation.

#### Principal flaw

Priya sometimes manages people without their knowledge. She may arrange a meeting, delay a minor detail, or shape circumstances toward the outcome she believes is best.

#### Relationship with the player

Priya can become the player's informal chief of staff. She works best when given objectives, priorities, and limits rather than exact scripts.

She resents a commander who privately encourages her indirect methods and later disavows them when they become politically inconvenient.

---

### 17.4 Lieutenant Commander Hadrik Bronn

**Species:** Tellarite  
**Position:** Chief Tactical and Security Officer

Hadrik Bronn is an older, highly experienced officer whose career includes border patrol, convoy protection, station security, crisis containment, shipboard defense, and responses to sabotage and boarding actions.

He has remained at lieutenant commander partly because he prefers operational service to administrative command. He has little interest in becoming a captain or spending his remaining career behind a headquarters desk.

Bronn is difficult to surprise. He plans for false surrender, compromised officers, failed communications, supposedly friendly ships behaving unpredictably, and security assumptions collapsing at the worst possible moment.

#### Traditional outlook

Bronn holds older Starfleet service values:

- Authority should be earned through competence.
- Officers should be able to defend their recommendations under pressure.
- Orders should remain clear in confusion.
- Discipline is a form of protection.
- Personal discomfort is not automatically an operational emergency.
- A commander should never issue a threat they cannot enforce.

He is not antisocial. He enjoys argument, shared meals, tactical games, and stories about avoidable mistakes made decades earlier. His abrasiveness is partly cultural, partly generational, and partly deliberate. He believes an idea that cannot withstand criticism should not be used to endanger a crew.

He rarely offers direct praise. "That was less foolish than your previous plan" may be sincere approval.

#### Strengths

- Deep tactical and security experience.
- Excellent contingency planning.
- Calm performance under pressure.
- Credible understanding of deterrence.
- Strong loyalty to the chain of command once a decision is made.

#### Principal flaws

Bronn can become doctrinally rigid. He sometimes assumes a new crisis resembles an older one and applies lessons that are no longer fully relevant.

He also believes officers should endure hardship quietly, which causes recurring conflict with Miriam Sato.

He is not a habitual warmonger. He understands that unnecessary combat creates additional threats. He favors preparation, control, and credible deterrence over aggression.

#### Relationship with the player

Bronn initially treats the player as an officer whose judgment remains unproven. He challenges vague orders, unsupported optimism, and plans that depend on an adversary cooperating without incentive.

Once a lawful decision is made, he executes it professionally. He may document his objection, but he does not sulk, sabotage the plan, or reopen the argument without new information.

The player earns his respect through:

- Consistent standards.
- Clear rules of engagement.
- Willingness to hear unwelcome assessments.
- Calmness under pressure.
- Taking responsibility when a plan fails.
- Correcting him without humiliating him.

Friendship develops slowly and is expressed practically: remaining after a briefing to offer advice, bringing food during a long watch, or quietly arranging protection without sentimental explanation.

Bronn respects credible authority, not theatrical intimidation. He can support an Inspiration-led solution when it creates durable cooperation and contains realistic safeguards.

---

### 17.5 Lieutenant Commander Rowan Saye

**Species:** Human  
**Position:** Chief Science Officer

Rowan is an astrophysicist and scientific dissenter. His career stalled after he publicly exposed a Federation research program that minimized inconvenient findings to protect its funding and reputation.

He is intelligent, rigorous, skeptical, and unusually willing to tell senior officers that the assumptions behind a mission may be wrong. His strongest contribution is often identifying when a conclusion has been shaped by institutional convenience rather than evidence.

#### Dramatic function

Rowan represents:

- Evidentiary rigor.
- Intellectual dissent.
- Institutional skepticism.
- The difference between warranted suspicion and fixation.

#### Principal flaw

Once Rowan suspects concealment or political interference, he may interpret every unresolved inconsistency as evidence of a larger deception.

#### Relationship with the player

Rowan needs a commander who permits dissent while still imposing evidentiary standards. Automatically believing him is no more responsible than automatically dismissing him.

He respects the player when they distinguish between:

- A valid scientific objection.
- An unproven hypothesis.
- A personal suspicion.
- Evidence sufficient to alter the mission.

He reacts badly when findings are suppressed merely because they complicate Starfleet's preferred narrative.

---

### 17.6 Commander Miriam Sato

**Species:** Human  
**Position:** Chief Medical Officer

Miriam is a trauma surgeon and bioethicist. She is direct, composed, and largely indifferent to rank inside sickbay.

She evaluates command decisions partly through their likely casualty burden. She refuses to let terms such as "acceptable loss," "operational necessity," or "personnel limitation" conceal what will happen to actual people.

#### Dramatic function

Miriam represents:

- Medical reality.
- Bodily autonomy.
- Casualty burden.
- Rehabilitation and duty of care.
- Honest acknowledgment of moral cost.

#### Principal tension

Miriam is not opposed to risk. She can accept dangerous missions, triage, quarantine, and painful sacrifices when the reasoning is honest and alternatives have been seriously examined.

What she rejects is a commander claiming there was no choice when another option was merely expensive, politically damaging, or personally uncomfortable.

#### Relationship with the player

Miriam acts as physician and ethical counterweight. She may support a harsh decision because it prevents greater harm and oppose a compassionate-sounding decision because it exposes more people to danger.

She respects commanders who acknowledge the cost of their orders rather than seeking her absolution afterward.

---

### 17.7 Lieutenant Commander Imani Cross

**Species:** Human  
**Position:** Chief Engineer

Imani Cross is one of two equally continuous individuals created during a transporter accident. Both emerged with the same memories, qualifications, relationships, and legal identity up to the instant of duplication.

The other Imani remained in their former life. This Imani accepted a distant Starfleet assignment to establish an identity outside constant comparison with the person others considered the original.

She rejects language that defines either individual as the authentic Imani or the duplicate. She is Imani Cross, not a copy of Imani Cross.

#### Professional background

Imani participated in Intrepid-class systems validation and bio-neural integration. She understands the design's intended performance, undocumented compromises, and interconnected failure modes.

She is a perfectionist who strongly resists undocumented improvisational modifications. This is partly technical and partly personal: a transporter malfunction permanently changed her life, and she has little patience for officers treating unquantified risk as harmless ingenuity.

Imani is capable of extraordinary emergency improvisation. She considers every workaround a form of technical debt that must later be inspected, documented, removed, or properly integrated.

#### Dramatic function

Imani represents:

- Technical integrity.
- Long-term consequences.
- Identity and personhood.
- The distinction between emergency ingenuity and irresponsible convenience.

#### Relationship with the player

Imani responds well when the player asks:

> "What is the safest viable version of this unsafe plan?"

She responds poorly to:

> "You're the engineer. Make it work."

She expects command to understand that technical limits do not disappear because the mission requires a convenient solution.

Her personal history should be used selectively. She wants to be regarded as the chief engineer, not as a recurring philosophical exhibit.

---

## 18. Central Command Dynamic

The command structure is organized around three different forms of authority.

### 18.1 Whitaker: principled strategic authority

Whitaker asks what Starfleet should accomplish, which laws and principles govern the mission, and what risks the ship may justifiably accept.

### 18.2 Bronn: experienced operational caution

Bronn asks what can go wrong, whether the crew is prepared, whether the threat is credible, and whether the plan can survive hostile resistance.

### 18.3 The player: integrative operational command

The player must combine strategic purpose, professional advice, crew capability, and real-world constraints into an executable course of action.

Whitaker and Bronn should not become opposing alignment representatives. Whitaker can support force; Bronn can support diplomacy. Their differences concern judgment, timing, safeguards, and institutional assumptions.

A weak commander agrees with whichever officer spoke last. A strong commander identifies the useful truth in competing recommendations and makes a coherent decision they can defend.

---

## 19. Crew Relationship Weaving

| Pair | Recurring dynamic |
|---|---|
| **Whitaker and Bronn** | Strategic patience versus readiness. They respect each other enough to disagree without implying disloyalty. |
| **Bronn and Kieran** | Experience versus ambition. Bronn is severe because he recognizes Kieran's potential and fears one avoidable incident will end it. |
| **Bronn and Priya** | Plainly stated boundaries versus indirect influence. Together they can create both credible pressure and a face-saving exit. |
| **Bronn and Rowan** | Operational proof versus scientific possibility. Both distrust convenient conclusions but challenge different assumptions. |
| **Bronn and Miriam** | Endurance versus health. Their blunt styles conceal more mutual respect than their arguments suggest. |
| **Bronn and Imani** | Shared respect for readiness and procedure, complicated when tactical urgency competes with engineering integrity. |
| **Kieran and Imani** | Unused performance margin versus accumulated stress and technical debt. Their conflict often produces a better third solution. |
| **Priya and Rowan** | Effective framing versus perceived sanitization. Priya can make Rowan heard; Rowan fears she changes what he means. |
| **Priya and Kieran** | Quiet mentorship and social management. Kieran may resent realizing that Priya has been steering him. |
| **Miriam and Imani** | Strong alignment around bodily autonomy, with tension when support becomes unwanted protection. |
| **Whitaker and Rowan** | Legitimate dissent under rigorous standards. Her disappointment matters to him because she protects his right to be difficult. |
| **Whitaker and Priya** | Institutional transparency versus unofficial problem-solving. Whitaker values Priya's effectiveness but watches the ethical boundary. |
| **Miriam and Kieran** | Rescue-minded empathy versus risk-taking. Miriam understands why he acts, but refuses to romanticize preventable injury. |
| **Rowan and Imani** | Theory versus implementation. Rowan establishes possibility; Imani determines whether the ship should be used to test it. |

---

## 20. Rules for Believable Crew Disagreement

The cast contains several strong-minded officers. To prevent every briefing from becoming a chorus of objections:

1. Usually no more than one or two officers actively contest a decision in a scene.
2. Other officers contribute domain facts rather than additional moral speeches.
3. Disagreement remains role-specific: Imani contests feasibility, Miriam contests medical ethics, Rowan contests evidence, Bronn contests readiness, Priya contests coordination or political consequence.
4. Once a lawful decision is made, officers execute it professionally unless material circumstances change.
5. Officers may disagree with a successful decision and support a failed decision when the reasoning was sound.
6. Relationship changes follow patterns of conduct rather than one exchange.
7. Whitaker does not resolve every dispute; managing the senior staff is part of the player's role.
8. Cultural traits inform character behavior without replacing individual personality.
9. No officer should exist solely to say yes or no to one command style.
10. Officers should occasionally agree for different reasons, creating temporary coalitions that do not become permanent factions.

---

## 21. Player Behavior and Likely Crew Response

| Player pattern | Likely response |
|---|---|
| Solicits disagreement, then makes a clear decision | Whitaker, Rowan, and Bronn gain confidence. |
| Gives Priya objectives and ethical limits rather than scripts | Priya becomes more effective and more candid. |
| Accepts major technical risk after hearing Imani's full assessment | Imani may disagree but respects the process. |
| Hides known risk from the captain or crew | Trust declines across most departments. |
| Praises Kieran's risk only when it succeeds | Kieran learns the wrong lesson; Bronn and Whitaker lose confidence. |
| Uses credible deterrence with a real off-ramp | Bronn and Priya may both support the plan. |
| Repeatedly intimidates without leverage | Bronn loses respect and Priya anticipates political damage. |
| Publicly humiliates an officer | Whitaker and Miriam object; Bronn considers it weak command. |
| Changes course when new evidence appears and explains why | Rowan and Whitaker approve; Bronn respects the clarity. |
| Protects subordinates from every consequence | Miriam may understand the motive; Whitaker and Bronn lose confidence in the command climate. |
| Accepts responsibility for a failed but defensible plan | Whitaker, Bronn, and Kieran gain respect. |
| Claims success personally while blaming execution failures on subordinates | Nearly the entire senior staff loses trust. |
| Uses Imani's history as a rhetorical device without her consent | Imani's personal trust falls sharply; Miriam objects. |
| Treats Bronn's bluntness as useful scrutiny rather than insubordination | Professional trust develops more quickly. |
| Treats Rowan's suspicions as facts without verification | Rowan may feel validated, but confidence in the player's judgment falls elsewhere. |

---

## 22. Situation Tests for the Ensemble

These situations are not fixed missions. They are design tests used to verify that the cast produces distinct, credible responses.

### 22.1 Suspected infiltrator aboard the Breckenridge

Evidence suggests that someone aboard has transmitted restricted sensor data.

- Bronn recommends immediate containment and compartmentalized access.
- Priya argues that a visible lockdown may warn the infiltrator and damage trust.
- Rowan questions whether the transmission was deliberate.
- Miriam warns against treating the entire crew as suspects.
- Imani can isolate systems, but doing so degrades ship operations.
- Kieran is concerned about flight-readiness restrictions during a possible external threat.
- Whitaker asks the player to define both the security objective and the evidentiary threshold for coercive action.

A quiet investigation can satisfy Bronn if the player establishes credible containment. A lockdown can satisfy Miriam if it is narrow, time-limited, and accompanied by due process.

### 22.2 Kieran violates a flight restriction to save lives

Kieran exceeds an explicit maneuver limit, rescues a shuttle crew, and causes measurable structural damage.

- Bronn recommends formal discipline because success does not erase the violation.
- Imani agrees because Kieran imposed risks he did not fully understand.
- Miriam emphasizes that people are alive because he acted.
- Priya warns that simplistic punishment may discourage initiative.
- Rowan asks whether the original restriction reflected current conditions.
- Whitaker assigns the review to the player.

The central question is not whether Kieran succeeded. It is whether a command structure can permit officers to decide independently which limits apply to them.

### 22.3 Diplomatic standoff without visible weapons

A Federation colony and a neighboring government dispute access to an orbital facility. Neither has fired, but both are moving security forces.

- Priya proposes unofficial talks and a face-saving mechanism.
- Bronn identifies fleet positioning consistent with a seizure operation.
- Rowan finds evidence that the facility's declared purpose may be false.
- Miriam warns that civilian evacuation has not begun.
- Imani notes that the facility's power network is unstable under military load.
- Kieran can position the Breckenridge as either a barrier, an escort, or an apparent threat.
- Whitaker insists that neutrality cannot become passivity.

The player determines whether Bronn acts as a visible deterrent, direct negotiator, silent planner, or security adviser.

### 22.4 Engineering integrity versus combat readiness

The phaser-control network is damaged. Imani can restore partial function quickly, but the workaround may corrupt other bio-neural systems.

- Bronn argues that an approaching hostile vessel makes defensive capability essential.
- Imani insists that the repair could disable navigation or life support at the worst time.
- Rowan offers an experimental targeting method with incomplete testing.
- Kieran proposes using maneuverability to delay engagement.
- Priya identifies noncombat systems that could be sacrificed to increase redundancy.
- Miriam quantifies likely casualties from each failure mode.
- Whitaker requires the player to select which vulnerability the ship will accept.

No officer is automatically correct. The game tests integration of tactical and systemic risk.

### 22.5 Bronn's old doctrine becomes a liability

A crisis resembles an incident from Bronn's earlier career. He confidently recommends a proven containment response.

- Rowan finds evidence that the current opponent has materially different capabilities.
- Priya discovers that the faction has studied Starfleet's prior response.
- Imani notes that the recommended posture assumes systems the Breckenridge does not possess in the same configuration.
- Kieran identifies a maneuver the older doctrine does not anticipate.
- Miriam warns that the containment model places civilians in the likely line of fire.
- Whitaker expects the player to use Bronn's experience without becoming captive to it.

Correcting Bronn privately and presenting a stronger plan can increase his respect. Dismissing him publicly as outdated may secure compliance while damaging the relationship.

### 22.6 Whitaker is incapacitated

Whitaker is injured during a developing crisis, placing the player in command.

Bronn becomes the player's most demanding adviser. He questions unclear orders and refuses to provide empty reassurance. Once the decision is made, he strongly defends the acting captain's authority.

Kieran looks for confidence, Priya begins managing the ship's information flow, Rowan presses unresolved evidence, Miriam controls access to Whitaker, and Imani demands priorities before committing damaged systems.

The scenario tests whether the player can move from delegated mission command to full responsibility for the ship.

### 22.7 Questionable Starfleet transfer order

Starfleet orders the Breckenridge to transfer refugees to a local government despite credible allegations that several will be imprisoned or killed.

- Whitaker initially seeks procedural delay and legal review, exposing her faith in institutional correction.
- Bronn wants a clear legal basis before using security to resist the order, but refuses to conduct a transfer he believes will become an execution.
- Rowan suspects the intelligence summary was selectively edited.
- Miriam argues that consent under threat is meaningless.
- Priya identifies procedural and diplomatic methods to delay compliance.
- Imani finds irregularities in the authentication history of the order.
- Kieran can prepare contingency evacuation without making it visible.

The player must build a defensible course rather than select between obedience and mutiny.

### 22.8 Another transporter duplication

A mission creates another duplication, but a local government recognizes only one resulting individual as legally real.

- Imani has relevant experience but is not automatically impartial.
- Miriam supports recognition of both individuals and opposes coercive medical testing.
- Rowan cautions that the new incident may not be scientifically identical.
- Priya warns that turning Imani into symbolic evidence may violate her privacy.
- Bronn must determine how duplicate authorization and security clearance are handled without treating either person as an object.
- Whitaker asks whether Imani wishes to participate before assigning any role.

The player must decide whether Imani should testify, be recused, advise privately, or define her own involvement.

### 22.9 The legacy of Wolf 359

The Breckenridge attends a memorial event shortly before receiving a Borg-adjacent sensor report.

- Kieran feels pressure to prove the ship worthy of its name.
- Bronn refuses to let symbolism substitute for threat assessment.
- Rowan wants evidence before calling the contact Borg.
- Imani begins isolating critical networks as a precaution.
- Miriam prepares for trauma responses among survivors and descendants.
- Priya manages frightened officials and public expectations.
- Whitaker rejects both vengeance and complacency.

The player determines whether the ship's legacy is used as reassurance, deterrence, restraint, justification for risk, or not as justification at all.

Wolf 359 should remain an occasional major theme rather than the subject of every mission.

---

## 23. Campaign Structure

### 23.1 Episodic missions

Most missions should resolve within an episode-length arc while producing persistent consequences.

A typical episode contains:

- A clear initial assignment.
- An apparent problem.
- A revelation that complicates the mission's category or moral frame.
- A B-plot linked thematically or causally to the main story.
- Escalating pressure.
- A command decision with no cost-free answer.
- A resolution and debrief.

### 23.2 Continuing character arcs

Each senior officer should have a long-form arc that advances through selected episodes rather than dominating every mission.

Possible arc directions include:

- **Whitaker:** Learning when institutional loyalty requires direct resistance.
- **Kieran:** Developing from gifted risk-taker into a credible future commander.
- **Priya:** Confronting the ethical limits of shaping people without their knowledge.
- **Bronn:** Distinguishing durable experience from doctrine that has outlived its context.
- **Rowan:** Learning to preserve skepticism without allowing suspicion to consume rigor.
- **Miriam:** Balancing rehabilitation and duty of care against the need to remove dangerous officers from duty.
- **Imani:** Establishing a life not defined by comparison while deciding what, if anything, she owes to others facing similar questions.

### 23.3 Season-level pressures

A campaign may carry several slow arcs:

- The Breckenridge's relationship to its Wolf 359 legacy.
- The player's growing command authority.
- Starfleet's confidence in the player and captain.
- A regional political or security problem.
- The cumulative effects of canon-era developments.
- A recurring original faction or institutional antagonist.
- The command culture forming aboard the ship.

No season arc should make ordinary exploratory, scientific, or character-focused episodes feel irrelevant.

---

## 24. Command Culture as an Emergent System

The ship should develop a recognizable command culture based on repeated player behavior rather than a single morale statistic.

Possible emergent qualities include:

- Candid or guarded communication.
- High initiative or strict authorization.
- Strong procedural discipline or adaptive improvisation.
- Transparent decision-making or compartmentalized information.
- Protective leadership or mission-first severity.
- Healthy dissent or performative agreement.

This culture affects:

- Whether junior officers report problems early.
- Whether departments improvise without authorization.
- How candidly senior officers challenge the player.
- How quickly the crew adapts during a crisis.
- Whether mistakes are concealed.
- How outsiders perceive the ship.

The system should describe these qualities through behavior and consequences rather than presenting a single "morale" score as the principal reward loop.

---

## 25. Player-Facing Information Principles

Directive should provide enough state to support command decisions without turning the roleplay into a dashboard game.

Useful visible information includes:

- Current mission objective.
- Stardate and location.
- Known directives and rules of engagement.
- Public deadlines.
- Major ship conditions.
- Active injuries or personnel restrictions relevant to command.
- Inspiration and Resolve progression.
- Player Values.
- Known favors and obligations.
- A command log of important consequences.

Information that should usually remain hidden includes:

- Undiscovered mission truth.
- Exact faction clocks.
- Secret NPC loyalties.
- Numerical relationship values.
- Untriggered Command Moments.
- A list of intended solutions.

Crew dossiers may summarize known history and the player's established relationship with each officer, but should not expose private thoughts the player has not earned access to.

---

## 26. Character Voice and Scene Direction Rules

### 26.1 Captain Whitaker

- Asks precise questions before giving an opinion.
- Uses calm authority rather than speeches in every scene.
- Does not solve missions for the player.
- Can be persuaded by evidence and principled argument.

### 26.2 Kieran Vale

- Speaks confidently and concretely about maneuver and timing.
- Uses humor when pressure rises.
- Seeks responsibility without openly begging for approval.
- Should not become a generic reckless pilot.

### 26.3 Priya Nayar

- Frames problems in terms of dependencies and people.
- Often knows who must be involved before others do.
- Suggests indirect routes without always labeling them manipulation.
- Should not become omniscient or socially infallible.

### 26.4 Hadrik Bronn

- Criticizes the plan, not the player's worth.
- Uses argument as professional engagement.
- Gives specific failure cases rather than generic pessimism.
- Follows lawful decisions after debate.
- Should not become a bully, caricature, or automatic advocate for weapons fire.

### 26.5 Rowan Saye

- Separates data, inference, and suspicion when functioning well.
- Becomes less disciplined when personally triggered.
- Challenges consensus with evidence rather than constant contrarianism.
- Should be allowed to be wrong without becoming useless.

### 26.6 Miriam Sato

- Names the human cost in specific terms.
- Does not demand risk-free command.
- Protects medical authority without treating ethics as personal ownership.
- Should not become a universal moral referee.

### 26.7 Imani Cross

- Describes technical risk through dependencies and failure modes.
- Is capable of emergency ingenuity but insists on the debt it creates.
- Corrects identity language without making every conversation about her history.
- Should not acquire escalating transporter-derived powers.

---

## 27. Authenticity and Constraint Rules

Every mission and generated scene should pass the following design checks:

### 27.1 Setting plausibility

- Is the technology available in the chosen year?
- Does the solution respect established limitations?
- Does Starfleet authority apply in this jurisdiction?
- Do political actors have credible interests beyond obstructing the player?

### 27.2 Character plausibility

- Is the officer responding from their role, history, and current knowledge?
- Are they competent even when wrong?
- Does disagreement concern something specific?
- Are relationship changes proportional to the event?

### 27.3 Causal plausibility

- Did the event arise from an established actor, condition, clock, or prior choice?
- Does the consequence follow from what the player actually did?
- Has the fiction preserved earlier facts?

### 27.4 Command plausibility

- Does the player have the authority they are exercising?
- Has a specialist's competence been respected?
- Is persuasion supported by credibility and interest?
- Is intimidation supported by leverage and willingness to follow through?

### 27.5 Dramatic plausibility

- Does the complication deepen the mission rather than merely delay it?
- Does the B-plot illuminate the A-plot or a crew relationship?
- Are multiple resolutions possible?
- Does failure create a new state rather than a dead end?

---

## 28. Initial Vertical Slice

The first playable design slice should prove the command experience rather than the breadth of the setting.

It should include:

- The U.S.S. Breckenridge.
- Captain Whitaker and all six senior officers.
- A player-created Commander/XO.
- One complete authored mission.
- One linked crew B-plot.
- Inspiration and Resolve progression.
- Three player Values.
- At least two active faction or escalation pressures.
- One consequential ship-system tradeoff.
- One moment in which two officers provide conflicting but valid recommendations.
- One solution the mission author did not explicitly enumerate, resolved through general rules.
- A debrief that records relationships, consequences, and future hooks.

The vertical slice succeeds if the player can complete the same mission through materially different strategies while the episode remains coherent and recognizably Star Trek.

---

## 29. Design Risks

### 29.1 The captain overshadows the player

**Risk:** Whitaker becomes the character who frames every moral issue and supplies the correct answer.

**Control:** She defines strategic boundaries and asks for recommendations; the player owns execution and many decisive judgments.

### 29.2 Every scene becomes a staff debate

**Risk:** Strong personalities produce repetitive objection rounds.

**Control:** Limit active dissent, keep objections role-specific, and require professional execution after decisions.

### 29.3 Freeform play becomes unbounded wish fulfillment

**Risk:** Natural language permits the player to declare impossible outcomes.

**Control:** Treat statements as intent, preserve authoritative facts, and enforce specialist competence and material constraints.

### 29.4 Adjudication overwhelms roleplay

**Risk:** Constant checks make the experience feel mechanical and slow.

**Control:** Resolve only uncertain, consequential actions; keep routine conversation and orders in ordinary prose.

### 29.5 Command style becomes a morality color

**Risk:** Inspiration becomes "good" and Resolve becomes "bad."

**Control:** Make both context-dependent, independent, and capable of ethical or unethical application.

### 29.6 Imani becomes the only interesting character

**Risk:** Her transporter history dominates the ensemble.

**Control:** Center her professional engineering identity in most episodes and use identity-focused stories selectively.

### 29.7 Bronn becomes a stereotype

**Risk:** Tellarite argumentativeness and age collapse into bullying or backwardness.

**Control:** Give his criticism specific professional value, allow him to support diplomacy, and show practical loyalty and humor.

### 29.8 Canon overwhelms the original campaign

**Risk:** Familiar events and characters become more important than the Breckenridge.

**Control:** Use canon primarily as background pressure and preserve original mission stakes.

### 29.9 Ship progression jumps the shark

**Risk:** Every mission adds a permanent technological advantage.

**Control:** Favor procedures, contacts, narrow countermeasures, and technical debt over universal upgrades.

---

## 30. Open Design Decisions

The following questions remain deliberately unresolved:

1. Is **Whitaker** the final surname for Captain Mara?
2. What is Captain Breckenridge's full name, ship, service history, and exact action at Wolf 359?
3. What registry number does the U.S.S. Breckenridge carry?
4. In which exact year and stardate does the campaign begin?
5. What is the Breckenridge's primary assignment and home sector?
6. How much may the campaign diverge from canon before it is labeled an alternate continuity?
7. What player-character fields have direct mechanical effect?
8. How are Inspiration and Resolve spent or converted into techniques?
9. Are relationship dimensions shown descriptively, numerically, or kept mostly hidden?
10. How visible should command-culture traits be?
11. How severe can permanent injury, reassignment, resignation, or death become for senior crew?
12. Can players eventually replace the captain, or is the XO role the permanent premise?
13. How frequently should away missions place the player physically at risk?
14. What level of tactical detail is appropriate before combat begins to feel like a separate game?
15. What is the first mission, and which crew relationship should it foreground?

---

## 31. Working Summary

Directive is a freeform Starfleet command RPG centered on the player's decisions as Commander and Executive Officer of the Intrepid-class U.S.S. Breckenridge.

The player is not asked to select the correct authored option. They are asked to understand a situation, hear professional disagreement, construct an executable plan, and accept the consequences. Missions provide authored truth, thematic pressure, faction agendas, and credible end states; the route through them remains open.

The senior crew is designed as a command ecosystem:

- **Mara Whitaker** provides principled strategic authority and faith in Starfleet's capacity for correction.
- **Kieran Vale** tests mentorship, ambition, and risk.
- **Priya Nayar** tests influence, coordination, and the boundary between facilitation and manipulation.
- **Hadrik Bronn** tests preparedness, consistency, and whether the player's ideas survive experienced scrutiny.
- **Rowan Saye** tests evidentiary integrity and institutional skepticism.
- **Miriam Sato** tests whether command language remains honest about human cost.
- **Imani Cross** tests technical discipline, autonomy, identity, and long-term consequence.

The intended result is an experience that feels permissive in expression, strict in causality, episodic in structure, persistent in consequence, and recognizably grounded in Star Trek.
