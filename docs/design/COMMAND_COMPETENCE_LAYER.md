# Command Competence Layer

## Purpose

The Command Competence Layer prevents Directive from punishing a player for not knowing fictional Starfleet procedure, technical vocabulary, command doctrine, or which department normally handles a task.

Core rule:

```text
The game supplies professional competence. The player supplies judgment.
```

The player should decide priorities, risk, ethics, authority, trust, strategy, and responsibility. The system should supply routine professional execution, relevant character knowledge, specialist reports, procedural warnings, and fair consequence boundaries.

This layer replaces the earlier idea of showing a single "Starfleet Baseline" option as if it were a recommended answer. The baseline exists, but as professional context and automatic routine action, not as a dialogue-wheel choice.

## Design Requirements

The layer must:

- Preserve freeform play.
- Make the player character feel trained.
- Keep consequential command decisions explicit.
- Prevent procedural gotchas.
- Preserve uncertainty, danger, deception, and failure.
- Use crew as specialists, not answer dispensers.
- Make severe procedural consequences legible before they are committed.
- Remain transactional across swipes, rewrites, reruns, deletes, and branches.

The layer must not:

- Make every player order optimal.
- Pick moral, political, tactical, or strategic answers for the player.
- Reveal hidden facts.
- Replace department heads with an omniscient helper.
- Turn the game into a checklist simulator.
- Award Command Bearing for routine autocomplete.
- Treat every nonstandard action as misconduct.

## Knowledge Classes

Directive should classify professional context into four knowledge classes.

| Class | Meaning | Default Handling |
|---|---|---|
| Routine professional knowledge | Basic doctrine and procedure expected of the player character | Known and usually applied automatically |
| Specialist knowledge | Department-specific assessment or technical expertise | Supplied by relevant officer or system |
| Command judgment | Priority, risk, ethics, authority, strategy, or responsibility | Reserved for the player |
| Unknown or concealed information | Hidden, deceptive, unavailable, or not-yet-discovered facts | Must be investigated, inferred, or revealed |

This classification is the core anti-brittleness rule. The system should not rely on a long list of exact phrases. It should reason from authored decision-node metadata and these four categories.

## Procedural Autocomplete

Procedural Autocomplete adds omitted actions only when all are true:

- Routine.
- Reversible.
- Low-cost.
- Noncontroversial.
- Within authority.
- Consistent with the player's stated intent.
- Non-escalatory.

Examples for a distress packet:

- Signal logging is automatic.
- Authentication starts automatically.
- Raw signal preservation is automatic.
- Long-range scans start automatically.
- Medical and engineering response readiness can be automatic.
- Raising shields is not automatic unless standing orders or context justify it.
- Boarding, pursuit, detention, quarantine waiver, weapons, and jurisdictional escalation remain command decisions.

Autocomplete should usually appear as a short line in narration, a Command Brief, or the Command Log. It should not create a visible checklist every turn.

## Command Brief

A Command Brief is concise, non-prescriptive context. It tells the player what their character and crew would already know before a consequential decision.

Default sections:

```text
Routine response:
Known facts:
Uncertainty:
Operational pressure:
Command question:
```

Not every section is required. Standard briefs should normally stay between 50 and 140 words.

The brief may state professional defaults:

```text
Standard procedure favors remote verification before close approach.
Emergency rescue authority permits earlier intervention when delay threatens life.
```

It must not label one action as correct.

## Domain Reports

Domain Reports are factual or professional assessments from the appropriate officer.

Rules:

- Use one or two reports by default.
- Use more only when the player asks for broad counsel or the situation truly spans several critical domains.
- Reports are not recommendations unless the player asks or the officer has a duty to object.
- Reports must include confidence language where relevant: confirmed, strong assessment, probable inference, plausible hypothesis, speculation, unknown.
- Officers may disagree because they weigh the same evidence differently.

Chapter 1 examples:

- Priya: certificate chain technically validates but is administratively inconsistent.
- Bronn: silent convoy may be a trap; remote reconnaissance before boarding.
- Rowan: no biological signature at range is not proof of no pathogen.
- Miriam: quarantine preparation should proceed until medical evidence clears it.
- Imani: automatic shutdown may erase volatile computer evidence.

## Request Counsel

The player may ask for recommendations, options, protocol, objections, or a domain-specific assessment in natural language.

Recognized examples:

- "Recommendations?"
- "What does protocol require?"
- "What are our options?"
- "What am I overlooking?"
- "Give me the tactical assessment."
- "Doctor, what is the medical risk?"
- "Captain, where does my authority end?"
- "I want objections before I decide."

Request Counsel should provide a compact set of officer perspectives, not a menu of actions. Recommendations remain subjective and character-specific. Asking for counsel should not normally reduce trust or command credibility.

## Procedural Warnings

A Procedural Warning appears only when:

- The intended action is clear.
- The action creates a serious foreseeable risk, legal issue, or authority problem.
- The player character would probably recognize that issue.
- The risk has not already been communicated.
- Proceeding remains possible.

Warning structure:

```text
Proposed action:
Standard concern:
Known consequence:
Available basis for exception:
```

Severity:

- `Advisory`: meaningful but limited concern; no confirmation needed by default.
- `Serious`: foreseeable danger to people, ship, mission, law, or trust; confirmation recommended.
- `Critical`: potentially unlawful, catastrophic, or command-defining; explicit confirmation required.

Warnings confirm informed intent. They do not block unconventional play.

## Authority Notes

Authority Notes explain chain-of-command, jurisdiction, emergency authority, and captain-level boundaries.

They should inform without becoming permission gates. A player may still proceed under emergency authority, disobedience, deception, or political risk if the fiction allows it.

## No-Gotcha Consequence Rule

A serious procedural consequence is fair only when at least one is true:

- The relevant risk was communicated before the decision.
- The player explicitly rejected or bypassed standard procedure.
- The player had enough established information to infer the risk.
- The danger was genuinely concealed and could not reasonably have been known.
- Time pressure made complete assessment impossible, and the uncertainty was clear.
- The player repeatedly ignored a known standing concern.
- The player character was established as impaired or specifically unfamiliar in a relevant way.

If none apply, the omitted step should usually have been handled by Procedural Autocomplete or a Command Brief.

## Anchored Risks

When the player knowingly accepts a risk, the system records it as an anchored risk.

Anchored risks may include:

- Ship damage.
- Lost time.
- Spent resources.
- Legal violation.
- Political exposure.
- Promise or directive breach.
- Subordinate placed at explicit risk.
- Evidence compromised for rescue speed.

Command Bearing can improve an outcome only in a causally appropriate way. It cannot erase an anchored cost unless the intervention specifically addresses that cost.

## Retroactive Competence

Retroactive Competence lets the player establish that routine, reasonable preparation happened earlier when it was plausible and uncontradicted.

Automatic examples:

- Visitors received standard computer-access restrictions.
- A distress packet was logged.
- Away teams carried normal tricorders and communicators.
- Sickbay prepared medical isolation for unknown survivors.

Adjudicated examples:

- A covert tracker was placed on a shuttle.
- A rare diplomatic loophole was prepared.
- A special engineering workaround was staged in advance.

Prohibited examples:

- Retroactively claiming a rare, risky, expensive, covert, or strategically decisive action as routine.
- Contradicting established state.
- Gaining extra preparation by repeatedly rerunning the same question.

## Standing Orders

Standing Orders are player-approved defaults for recurring situations. They are defaults, not scripts.

MVP categories:

- Distress response.
- Visitor and boarding security.
- Away-team deployment.

Initial implementation should begin with distress response only.

Standing orders must be versioned and referenced from turn records so swipes, branches, and reruns do not mutate historical procedure.

## Interaction Sequence

For consequential messages, the robust sequence is:

1. Interpret intent.
2. Classify omitted routine actions.
3. Check professional knowledge.
4. Select specialist reports.
5. Identify the actual command question.
6. Check authority and procedure.
7. Create warnings or authority notes when needed.
8. Confirm or infer informed intent.
9. Resolve the action.
10. Offer Command Bearing if eligible.
11. Narrate from the final packet.
12. Commit state, assumed actions, accepted risks, and memories transactionally.

## State Model

Initial campaign-owned state should include:

```text
commandCompetence
  standingOrders[]
  assumedActionsLedger[]
  acceptedRiskLedger[]
  warningLedger[]
  authorityNotesLedger[]
  retroactiveCompetenceLedger[]
  counselRequestLedger[]
```

Each committed record should include source turn id, source outcome id when available, active mission id, active phase id, package rule ids used, player-facing summary, hidden refs if any, and whether the record is player-visible.

## Relationship And Review Rules

NPCs judge the player's command conduct, not autocomplete.

Routine competence is neutral. Relationship memory may react to:

- Asking for dissent.
- Ignoring a specialist warning.
- Accepting responsibility.
- Concealing or disclosing risk.
- Overriding procedure with a credible basis.
- Scapegoating advice after requesting it.
- Treating counsel as a shield from making decisions.

Command reviews should distinguish decision quality from outcome quality. A sound decision can fail because of deception or opposition. A reckless decision can succeed and still damage trust.

## MVP Acceptance Criteria

The Command Competence MVP is working when:

- A player can respond to a distress call without typing every routine Starfleet step.
- The system records assumed routine actions.
- The player sees a concise Command Brief before a major command decision.
- Officer reports inform without overwhelming or deciding.
- Request Counsel produces compact domain reports or recommendations.
- Serious procedural departures produce warnings before consequences.
- The no-gotcha rule is enforced by adjudication fixtures.
- Anchored risks survive narration swipes, outcome reruns, delete, and branch.
- Command Bearing does not erase anchored costs improperly.
- Chapter 1 can begin with Relief Convoy Twelve without assuming the player knows Starfleet protocol.
