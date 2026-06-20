# Crew Development And Experience Model

## Purpose

Directive should track senior staff growth over time without turning competent Starfleet officers into generic RPG level tracks.

The Breckenridge senior staff are already trained professionals. The player is not making them capable from scratch. The player is shaping how they develop under this command culture, how much responsibility they are ready to carry, what they learn from success and failure, and which personal pressures they resolve, deepen, or conceal.

This system should support:

- Meaningful conversations with the player.
- Successful and difficult mission actions.
- B-plot progression.
- Officer autonomy and initiative.
- Relationship reveal gates.
- Crew-to-crew development.
- Persistent changes in advice, confidence, risk posture, and command behavior.

It should not create visible grind, farmable approval points, or a simple "crew XP bar."

## Core Decision

Use a **Crew Development System**, not a generic character leveling system.

Development should be hidden or mostly descriptive. The player should experience it through behavior:

- Kieran asks for command responsibility with better risk framing.
- Priya discloses informal arrangements earlier and with clearer boundaries.
- Bronn stops treating the player as temporary until proven otherwise.
- Rowan labels uncertainty more carefully and distinguishes evidence from suspicion.
- Miriam escalates fatigue and consent concerns with more operational precision.
- Imani offers imperfect options sooner while making technical debt explicit.
- Whitaker delegates more real authority when the player's command judgment earns it.

The player may see progress through Command Log summaries, crew dossier updates, new conversations, mission options, or changed behavior. Raw development values should remain hidden outside debug tools.

Crew relationship and development changes do not require direct conversation. The player's command choices, delegation patterns, public treatment of officers, mission priorities, and willingness to carry consequences can all alter how senior staff trust, challenge, support, or distance themselves from the player.

## Separation From Relationships

Crew development is related to relationships, but it is not the same system.

Relationship dimensions track how an officer relates to the player:

- `professionalConfidence`
- `integrityTrust`
- `personalRapport`

Crew development tracks how the officer is changing as a recurring character and Starfleet professional.

An officer can develop while still disliking the player. An officer can personally like the player while failing to grow in an important area. A hard but fair debrief can reduce personal rapport while increasing future operational reliability.

Relationship state can influence professional behavior, but the degree is officer-specific. Some officers may become personally loyal enough to volunteer risk, disclose concerns early, or bend their comfort zone for the player. Others may remain tightly bound to Starfleet values, medical ethics, evidence standards, or chain-of-command expectations even when they like the player. Dataset entries should define this per officer instead of assuming one universal loyalty curve.

## Development Dimensions

Initial hidden dimensions:

### Operational Experience

What the officer has learned through actual duty, crisis work, delegated command, technical execution, or mission consequence.

This is not just success counting. Difficult partial success, controlled failure, honest after-action review, or surviving the consequences of a choice can all create operational experience.

Examples:

- Kieran executes a risky maneuver within explicitly accepted limits.
- Imani manages an emergency workaround and later documents the debt.
- Miriam's medical restriction prevents a more serious readiness failure.
- Bronn's contingency planning prevents a second-order consequence.

### Player Mentorship

How much the player has meaningfully shaped the officer through conversation, delegation, correction, support, challenge, or trust.

Mentorship does not mean kindness. It means the player engaged the officer's real developmental pressure in a way that could change future behavior.

Examples:

- The player helps Kieran distinguish command responsibility from performance.
- The player sets disclosure boundaries with Priya without humiliating her.
- The player pushes Rowan to preserve dissent while tightening evidentiary language.
- The player supports Imani's authority without making her identity the center of the exchange.

### Personal Arc Progress

Progress through the officer's recurring B-plot, private pressure, reveal ladder, or unresolved personal/professional question.

Personal arc progress can move forward, stall, or regress. Some arcs may branch rather than complete.

Examples:

- Bronn processes the acting-XO handoff and his future in front-line service.
- Miriam confronts the line between protection and control.
- Priya chooses whether to formalize obligations she has kept informal.
- Whitaker re-evaluates when institutional process is insufficient.

### Command Confidence

How willing and able the officer is to act independently under the player's command culture.

This is not obedience. It measures whether the officer understands what the player expects, trusts the command environment enough to exercise judgment, and can carry delegated authority without either freezing or freelancing irresponsibly.

Examples:

- An officer takes appropriate initiative when communication is delayed.
- An officer surfaces a warning early because past command responses made that safe.
- An officer handles a side assignment with less direct player intervention.

### Professional Strain

Accumulated fatigue, moral injury, unresolved conflict, stress, or pressure that affects an officer's development and performance.

Strain is not a punishment meter. It explains why a capable officer may need support, rest, confrontation, medical attention, or relief from duty.

Examples:

- Miriam flags crew exhaustion before it becomes a medical incident.
- Rowan's fixation increases after being dismissed too often.
- Imani becomes less willing to offer risky options after repeated unacknowledged technical debt.

## Development Moments

Conversations should not award progress merely because the player talked to an officer.

Use **Development Moments**: consequential scenes or actions where an officer's future behavior can plausibly change.

A Development Moment may award progress only when:

- The scene has meaningful stakes for that officer.
- The player engages the officer's actual concern, not a generic approval prompt.
- Something changes: trust, clarity, obligation, disclosure, confidence, restraint, or behavior.
- The player accepts some cost, risk, vulnerability, accountability, or obligation.
- The same decision has not already awarded development.

Development Moments can occur in:

- Private conversations.
- Briefings.
- Debriefs.
- Mission actions.
- Side assignments.
- Medical, engineering, tactical, or diplomatic scenes.
- Crew-to-crew interactions where the player shaped the conditions.
- Public command decisions observed by the officer.
- Delegated orders whose consequences reach the officer later.

## Mission And Action Experience

Successful actions should matter, but success should not be the only teacher.

An officer may gain operational experience from:

- Clean success through expertise.
- Partial success with acknowledged cost.
- Failure followed by honest diagnosis.
- Taking delegated responsibility.
- Resisting a bad order through proper channels.
- Revising a recommendation after new evidence.
- Carrying a consequence from a previous choice.

An officer should not gain meaningful development from:

- Repeating a low-stakes task.
- Being present in a scene without pressure.
- Receiving empty praise.
- Winning an argument without changing future behavior.
- A model-generated conversation that does not commit state.

## Offscreen Growth

The crew should not develop only when the player personally speaks with them.

Directive should support offscreen development through:

- Departmental work.
- Delegated side assignments.
- Crew-to-crew mentorship.
- Repeated mission exposure.
- Medical recovery.
- Technical investigation.
- Command Log follow-up.
- Open Orders intervals.

Offscreen development still needs a causal parent. The system should know why progress occurred.

Examples:

- Priya and Imani improve cross-department scheduling after the player authorizes a clearer engineering-protection protocol.
- Bronn mentors Kieran during delegated patrol planning after the player assigns responsibility with explicit review terms.
- Miriam and Rowan resolve part of a Huxley-derived tension through a side scene triggered by fatigue and evidence pressure.

## Player-Facing Feedback

Raw values should stay hidden.

Player-facing feedback may appear as:

- Crew dossier updates.
- Command Log summaries.
- Changed advice quality.
- New private scene availability.
- Officer initiative in future missions.
- New delegation options.
- Changed B-plot status.
- Specific remembered behavior in dialogue.

Avoid:

- `+10 XP`.
- visible level-up banners.
- generic affection meters.
- explicit "conversation successful" text.
- notifying the player of every hidden development tick.

## Mechanical Effects

Crew development can affect future play by unlocking or modifying:

- Officer advice depth.
- Autonomous initiative.
- Delegated side mission success bands.
- Crisis resilience.
- Crew coalition behavior.
- Relationship reveal gates.
- B-plot scenes.
- Command Decision availability.
- Mission plan options.
- Failure mitigation when the officer's expertise applies.
- Risk disclosure quality.

Development should usually create options or modifiers, not automatic victories.

Kieran with strong development may frame a dangerous maneuver responsibly. He still cannot make an impossible maneuver safe. Imani with strong development may offer a workable compromise earlier. She still cannot remove technical debt by confidence alone.

Relationship effects should be similarly bounded. A highly loyal officer may give the player more benefit of the doubt, warn them earlier, argue in private instead of in front of the room, or accept a personally costly assignment. They should not abandon core characterization, professional ethics, or established limits unless their personal arc has plausibly moved them there.

## Relationship To Command Style

The player's Inspiration and Resolve can shape how development occurs.

Inspiration-oriented development may emphasize:

- Trust.
- Transparency.
- Shared purpose.
- Dignity.
- Emotional honesty.
- Coalition-building.

Resolve-oriented development may emphasize:

- Clear authority.
- Direct accountability.
- Risk ownership.
- Boundaries.
- Decisive delegation.
- Professional standards.

Neither style is automatically better. A given Development Moment should define what methods are substantively appropriate.

## Relationship To Values And Directives

Crew development may be tied to Values and Directives when an officer sees the player affirm, compromise, challenge, or reinterpret a principle.

Examples:

- Miriam's development changes if the player repeatedly claims "No life is expendable" but ignores cumulative crew exhaustion.
- Bronn's confidence changes if the player rejects preparedness as pessimism until a contingency matters.
- Rowan's arc changes if the player protects inconvenient evidence at a real political cost.
- Priya's development changes if the player uses informal networks while denying responsibility for them.

The system should record what principle was involved, not convert it into morality points.

## Severe Outcomes

Development can regress.

Regression should be causal and fair:

- The player repeatedly ignores an officer's professional domain.
- The officer suffers preventable consequences.
- A private disclosure is mishandled.
- A delegated assignment is unsupported.
- A value is compromised in a way that directly affects the officer.
- Professional strain accumulates without relief.

Regression should not happen just to create drama. It should produce changed behavior, not a hidden penalty with no narrative expression.

Severe states may include:

- Avoidance.
- Reluctant compliance.
- Reduced initiative.
- Formalized dissent.
- Medical restriction.
- Reassignment request.
- Resignation pressure.
- Death or permanent injury only under the established lethality rules.

Exploration mode should soften the most severe outcomes and preserve more recovery routes. Command mode may allow harsher consequences when causally justified.

## Initial Officer Development Axes

These are first-pass axes for the Breckenridge senior staff. They are not final numeric schemas.

### Mara Whitaker

- Delegation trust in the player.
- Willingness to challenge institutional process sooner.
- Confidence that the XO can integrate dissent into action.
- Private burden disclosure and command partnership depth.

### Kieran Vale

- Responsible risk framing.
- Command-readiness development.
- Relationship to ambition and visible performance.
- Ability to accept correction without converting it into humiliation.

### Priya Nayar

- Disclosure of informal obligations.
- Ethical use of access and favors.
- Comfort with formal authority that does not smother practical work.
- Willingness to let the player see implementation costs.

### Hadrik Bronn

- Clean transfer out of acting-XO posture.
- Trust in the player's command strength.
- Flexibility in applying doctrine to new evidence.
- Willingness to mentor rather than only test.

### Rowan Saye

- Precision under suspicion.
- Trust that inconvenient evidence will not be buried.
- Ability to accept uncertainty without escalating into fixation.
- Willingness to collaborate before treating process as compromised.

### Miriam Sato

- Operational impact of medical authority.
- Balance between protection, consent, and command reality.
- Willingness to escalate health concerns early.
- Recovery from past compromises around duty fitness.

### Imani Cross

- Willingness to offer imperfect options.
- Trust that technical debt will be acknowledged.
- Autonomy and identity boundaries.
- Confidence that command understands consequences before ordering risk.

## Data Direction

The crew dataset contract should support:

```text
crewDevelopment
  officerId
  dimensions
  developmentMoments
  operationalExperience
  mentorshipHistory
  personalArcState
  commandConfidence
  professionalStrain
  unlockedScenes
  blockedScenes
  revealGateProgress
  lastChangedByOutcomeId
```

Development records should reference committed outcome ids, mission ids, side assignment ids, Command Log entries, or conversation scene ids. They should not rely on raw transcript memory.

See [Crew Dataset Contract](../packages/CREW_DATASET_CONTRACT.md) for the package-level schema direction.

## Director Retrieval Implications

Crew development must be visible to Director retrieval.

Retrieval should use development state to decide:

- Which officer is likely to speak.
- Whether a private follow-up is available.
- What voice guidance is active.
- Whether a reveal gate has opened.
- Whether an officer volunteers an option, waits to be asked, objects, or defers.
- Whether professional strain should affect performance or advice.

Narrator packets should receive only player-safe expression of development. Crew Director packets may receive hidden raw development state.

## Anti-Patterns

Avoid:

- visible XP bars for senior officers.
- grinding conversations for points.
- treating success as the only source of growth.
- making every private talk a Development Moment.
- collapsing development into approval.
- making the player the only source of officer growth.
- granting automatic mission success because an officer is "leveled."
- hiding regression until it feels arbitrary.
- exposing high-trust revelations as rewards divorced from relationship and context.

## Current Implementation Slice

The first dataset pass has generalized the foundational officer cards across the senior staff.

Built:

- Shared development dimensions for all senior officers.
- One development card per non-player senior officer.
- One high-trust reveal gate per non-player senior officer.
- Narrator-safe profile and voice cards per non-player senior officer.
- Crew Director, Mission Director, Command Director, and narrator packet fixtures.

Next:

- Add concrete Development Moments in the prelude mission graph.
- Add officer B-plot hooks.
- Add coalition and disagreement rules for briefing scenes.

Success criteria:

- Talking to a senior officer only advances development when the scene has actual stakes.
- Successful routine command can affect officer trust, confidence, and growth pressure.
- Mishandling a command discussion can change future behavior without arbitrary punishment.
- Hidden personal material remains locked until its reveal gate is earned.
- The Command Log can summarize the visible consequence without exposing raw values.

## Open Questions

- Should development dimensions use numeric values, named stages, or both?
- Should each officer have custom dimensions only, or a shared core plus custom arcs?
- How often should offscreen growth resolve?
- Should Open Orders intervals include scheduled crew-development checks?
- How should failed but well-debriefed actions differ from successful actions?
- What is the minimum player-facing feedback needed so hidden development does not feel opaque?
