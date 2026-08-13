# Cohesion Mini-Quest Template Catalog

**Status:** Approved forty-template roster with complete generator-ready design contracts drafted for review. Runtime schema implementation remains future work.

**Date:** 2026-08-13

## Purpose

Define the initial content catalog for the commander-facing Cohesion system in [Cohesion and Commander Mini-Quests](./2026-08-13-cohesion-command-work-design.md).

This is a hybrid catalog. Each entry provides a reusable command-story structure, while the Breckenridge campaign supplies eligible departments, ship regions, established crew, background-crew bindings, and campaign-specific variations.

The player is a commander rather than a specialist. Every template therefore requires judgment, prioritization, mentorship, welfare, delegation, mediation, follow-up, or coordination. Technical labor may be part of the fiction, but performing that labor personally is never the only valid path.

## Distribution

| Level | Selection weight | Template count | Ring segments | Cohesion |
| --- | ---: | ---: | ---: | ---: |
| Level 1 | 50% | 20 | 1 | 5 |
| Level 2 | 30% | 12 | 2 | 10 |
| Level 3 | 15% | 6 | 3 | 15 |
| Level 4 | 5% | 2 | 4 | 20 |
| **Total** | **100%** | **40** | — | — |

Directive selects an eligible level first, then selects an eligible template within that level through a deterministic shuffle bag. Choosing uniformly from all eligible templates is forbidden because temporary template ineligibility would distort the 50/30/15/5 level curve.

If a level cannot fit the remaining unowned Cohesion, violates an active-level safeguard, or has no eligible template, its weight is renormalized across the remaining eligible levels.

## Content Balance

| Primary family | Template count |
| --- | ---: |
| Personnel and welfare | 12 |
| Interdepartmental coordination | 10 |
| Training and preparedness | 8 |
| Systems and logistics | 6 |
| Shipboard life | 4 |
| **Total** | **40** |

A template may have secondary families, but one primary family controls selection diversity and cooldown behavior.

## Contract Library

The roster summaries below remain the human-readable index. The complete generation contracts are split by level so that a content pass can change one tier without making this catalog unmanageable:

- [Level 1 contracts](./2026-08-13-cohesion-mini-quest-level-1-contracts.md): twenty short command interventions;
- [Level 2 contracts](./2026-08-13-cohesion-mini-quest-level-2-contracts.md): twelve investigated and verified interventions;
- [Level 3 contracts](./2026-08-13-cohesion-mini-quest-level-3-contracts.md): six multi-department command efforts; and
- [Level 4 contracts](./2026-08-13-cohesion-mini-quest-level-4-contracts.md): two rare shipwide initiatives.

Each contract has one stable template ID and version. An instantiated issue receives a separate stable instance ID and resolves its authored bindings at creation. Template versions are immutable after release; a substantive contract change creates a new version rather than changing the meaning of replayed history.

### Shared Contract Semantics

The level-specific files use the following fields:

- **Bindings:** Closed roles that the generator may fill from campaign-authored departments, locations, established characters, or bounded background-crew records.
- **Eligible when:** Positive predicates that must all be true before selection.
- **Excluded when:** Template-specific vetoes evaluated in addition to global queue, level, cooldown, privacy, and Cohesion safeguards.
- **Player-facing situation:** The safe premise shown when the issue becomes visible.
- **Command objective:** The leadership outcome, never a mandatory specialist procedure.
- **Why it matters:** The concrete player-facing benefit of acting, including the relevant ship or crew limitation that will end.
- **Operational condition:** The exact limitation carried while the issue remains unresolved.
- **Phases:** Named, ordered milestones. A phase becomes complete only from accepted, source-bound story evidence. Known next phases may be shown; undiscovered details remain hidden.
- **Valid approaches:** Credible categories of action, not a forced dialogue choice list.
- **Does not complete:** Attractive but insufficient actions that the interpreter must reject as completion evidence.
- **Completion evidence:** The minimum accepted story facts required to resolve the issue.
- **Computer help:** Player-safe guidance the ship's computer may provide through the existing Directive prompt entry.
- **Variations:** Closed premise variations that add replay value without inventing campaign facts.
- **Anchor:** Approximate artwork region for the leader line; it is presentational rather than a deck-map claim.
- **Narrator limits:** Facts, diagnoses, culpability, outcomes, or private details that generation must not invent.
- **Invalidation:** What happens if a required binding or premise becomes impossible before completion.
- **Reuse:** Template cooldown and binding-diversity policy.

Unless an entry explicitly overrides them, these rules apply:

- Level 1 restores 5 Cohesion, Level 2 restores 10, Level 3 restores 15, and Level 4 restores 20.
- Resolution removes only the issue's authored operational condition and restores only its owned segments.
- No routine template grants a permanent capability. An optional lasting reward exists only when a campaign explicitly binds one at issue creation.
- The commander may resolve work through conversation, judgment, delegation, supervision, direct participation, or a reasonable combination.
- Technical assistance may be useful, but personally performing specialist labor is never mandatory.
- Asking the ship's computer for help is never quest progress by itself.
- Merely issuing an order is insufficient when the contract requires consent, observation, testing, verification, or follow-up.
- If invalidation occurs before the issue becomes visible, retire it and restore its debt. If it occurs after visibility, explain the retirement in player-safe terms before restoring debt.
- The generator may not bind an established named character to a private, medical, disciplinary, romantic, family, or psychological premise unless authored campaign data explicitly permits that exact situation.
- A bounded background crewmember may receive only the minimum role and situation facts needed for the issue. The quest may develop that crewmember through accepted play, but the generator may not pre-author hidden history or personality.

## Level 1 Templates

Level 1 issues cost and restore 5 Cohesion. They normally require one situation, one command response, and at most one short verification or follow-up scene.

### 1. The Missed Watch

**Family:** Personnel and welfare

A background crewmember misses or arrives late for an important watch. The commander determines whether the cause is confusion, workload, adjustment, or an authorized personal circumstance and establishes a fair response.

**Resolves:** Unreliable watch coverage.

### 2. New to the Ship

**Family:** Personnel and welfare

A recent transfer has not integrated with their team and is being left outside informal communication. The commander may speak with them, involve their supervisor, or create an appropriate point of connection.

**Resolves:** An isolated crewmember missing critical team context.

### 3. Message From Home

**Family:** Personnel and welfare

A background crewmember receives a family communication that creates a bounded scheduling or support need. The commander balances the person's welfare with current duties.

**Resolves:** Distraction and coverage strain.

This template never binds to an established named character unless campaign data authorizes the situation.

### 4. Credit Where It Is Due

**Family:** Personnel and welfare

A junior crewmember or small team made a valuable contribution that disappeared inside a departmental report. The commander verifies what happened and decides how to recognize it.

**Resolves:** A morale and trust problem around overlooked work.

### 5. The Handoff Gap

**Family:** Interdepartmental coordination

One watch or department uses different terminology from the next, causing a small but recurring information loss. The commander identifies the ambiguity and establishes a clear handoff.

**Resolves:** Unreliable transfer of operational information.

### 6. Who Owns the Next Step?

**Family:** Interdepartmental coordination

Two departments each believe the other owns a minor but necessary responsibility. The commander clarifies ownership without simply blaming one side.

**Resolves:** Stalled cross-department work.

### 7. One Bad Drill Habit

**Family:** Training and preparedness

A rookie or small team repeatedly uses an unsafe shortcut during practice. The commander observes, coaches or delegates coaching, and confirms the correct expectation.

**Resolves:** One known training vulnerability.

### 8. The Maintenance Window

**Family:** Systems and logistics

Engineering needs access to a system or compartment that another department cannot conveniently release. The commander chooses a workable time, acceptable interruption, or alternate arrangement.

**Resolves:** Deferred maintenance caused by scheduling conflict.

### 9. The Missing Pet

**Family:** Shipboard life

A crewmember's pet has escaped into a shared or operational area. The commander organizes a proportionate search, manages any disruption, and may choose to participate.

**Resolves:** Localized disruption and an anxious owner.

### 10. Holodeck Double Booking

**Family:** Shipboard life

Two legitimate groups were assigned the same limited recreation period. The commander mediates a fair solution while recognizing that rest and community matter aboard a long-range ship.

**Resolves:** Recreation conflict and resentment.

### 11. The Promotion Request

**Family:** Personnel and welfare

A crewmember asks to be considered for greater responsibility. The commander reviews their preparation and provides either a justified opportunity or a concrete development path.

**Resolves:** Uncertainty and frustration around advancement.

Completion does not require granting the promotion.

### 12. Mentor Mismatch

**Family:** Personnel and welfare

A junior crewmember and assigned mentor are not communicating effectively. The commander resets expectations, changes the arrangement, or establishes a better way for them to work together.

**Resolves:** Ineffective professional support.

### 13. No Relief on the Roster

**Family:** Personnel and welfare

One qualified crewmember is repeatedly covering a duty because no reliable backup has been scheduled. The commander arranges relief, starts cross-training, or reprioritizes the workload.

**Resolves:** Immediate overreliance on one person.

### 14. A Needed Day Off

**Family:** Personnel and welfare

A crewmember requests time away from duty after sustained work. The commander arranges credible coverage while treating rest as an operational need rather than a personal indulgence.

**Resolves:** Short-term fatigue and coverage strain.

### 15. The Stale Standing Order

**Family:** Interdepartmental coordination

An older shipboard order conflicts with a refit-era procedure or newer departmental practice. The commander identifies which rule governs and communicates the decision.

**Resolves:** Contradictory operating expectations.

### 16. The Missing Context

**Family:** Interdepartmental coordination

A routine handoff omitted information another team needed to act correctly. The commander establishes what was lost and improves the briefing or reporting practice.

**Resolves:** Incomplete operational briefings.

### 17. The Unfamiliar Evacuation Route

**Family:** Training and preparedness

A refit, reassignment, or changed compartment use has left one group uncertain about its emergency route. The commander ensures that the route is clarified and rehearsed.

**Resolves:** One localized evacuation vulnerability.

### 18. The Replicator Queue

**Family:** Systems and logistics

A heavily used replicator or service point is unavailable or overburdened, creating conflict between duty needs and ordinary crew use. The commander establishes priorities and a fair temporary arrangement.

**Resolves:** A localized logistics bottleneck.

### 19. Quiet Hours

**Family:** Shipboard life

Crew working different watches are disturbing one another's rest in nearby quarters or shared space. The commander mediates a workable standard.

**Resolves:** Rest disruption and shift resentment.

### 20. A Place for the Gathering

**Family:** Shipboard life

A crew group wants to hold a cultural, recreational, or community event, but space and duty schedules conflict. The commander helps establish an appropriate time and place.

**Resolves:** A community need blocked by shipboard logistics.

## Level 2 Templates

Level 2 issues cost and restore 10 Cohesion. They normally require understanding the real problem, choosing an intervention, and verifying that the intervention worked.

### 21. Falling Behind

**Family:** Personnel and welfare

A background crewmember's performance has declined across several reviews. The commander establishes whether the cause is training, workload, unclear expectations, shipboard adjustment, or an authorized personal circumstance, then creates and revisits a support plan.

**Resolves:** Persistent performance and coverage strain.

### 22. Return to Duty

**Family:** Personnel and welfare

Medical has cleared a crewmember to return, but the department and crewmember have incompatible expectations about workload or responsibility. The commander coordinates a humane, operationally credible return.

**Resolves:** Unsafe or mistrusted duty reintegration.

Medical privacy remains protected; the task exposes only what command legitimately needs.

### 23. Sensor Language

**Family:** Interdepartmental coordination

Science and Operations classify or report the same sensor observations differently. The commander brings them together, establishes a shared reporting standard, and tests it against a controlled example.

**Resolves:** Inconsistent sensor interpretation.

### 24. The Blended Watch

**Family:** Interdepartmental coordination

Personnel assembled from different prior crews have incompatible watch practices. The commander observes the friction, chooses what should be standardized, and verifies the revised watch.

**Resolves:** Unreliable mixed-crew coordination.

### 25. Rookies Under Pressure

**Family:** Training and preparedness

A junior response team performs correctly in isolation but loses discipline when conditions change. The commander runs or observes a drill, leads the debrief, changes the preparation, and confirms improvement.

**Resolves:** Poor performance under changing conditions.

### 26. Shuttle Turnaround

**Family:** Systems and logistics

Flight Control and Engineering disagree over inspection depth, turnaround time, or readiness responsibility. The commander sets priorities, assigns ownership, and validates the resulting process.

**Resolves:** Unreliable shuttle availability.

### 27. After the Bad Call

**Family:** Personnel and welfare

A background crewmember's confidence has fallen after a documented mistake or difficult evaluation. The commander debriefs the event fairly, establishes support or supervised responsibility, and verifies that the crewmember can act decisively again.

**Resolves:** Hesitation affecting duty performance.

The template cannot invent an undisclosed serious incident involving a named character.

### 28. The Informal Leader

**Family:** Personnel and welfare

A respected enlisted crewmember or junior officer is carrying responsibilities beyond their formal authority. The commander recognizes the useful leadership while clarifying accountability, support, and limits.

**Resolves:** An authority gap held together by one person's unofficial effort.

### 29. Bridge-to-Engineering Lag

**Family:** Interdepartmental coordination

Operational changes reach Engineering too late, while Engineering limitations reach the bridge without enough context. The commander brings both sides together, establishes an escalation path, and tests it.

**Resolves:** Delayed command-and-engineering communication.

### 30. Security at Sickbay's Door

**Family:** Interdepartmental coordination

Medical privacy and Security's safety responsibilities are producing incompatible expectations during a routine but sensitive situation. The commander establishes a bounded protocol that protects both care and safety.

**Resolves:** Conflict between medical confidentiality and security access.

The quest does not disclose a patient's private condition.

### 31. The Evacuation Bottleneck

**Family:** Training and preparedness

A drill reveals that one corridor, turbolift route, or assembly procedure cannot handle the assigned personnel flow. The commander reviews the failure, approves a revised plan, and runs a meaningful retest.

**Resolves:** A known evacuation bottleneck.

### 32. Cargo Without an Owner

**Family:** Systems and logistics

Supplies or equipment pass through several departments without one accountable custodian. The commander traces the responsibility gap, establishes custody, and verifies the handoff.

**Resolves:** Unreliable cross-department inventory control.

## Level 3 Templates

Level 3 issues cost and restore 15 Cohesion. They cross several roles and require multiple meaningful stages.

### 33. Departments at Cross-Purposes

**Family:** Interdepartmental coordination

Three departments are each behaving reasonably under incompatible assumptions. The commander hears the different positions, identifies the institutional conflict, sets a shared procedure, and observes it under real work.

**Resolves:** A recurring cross-department coordination failure.

Controlled variations bind different department combinations rather than always producing the same argument.

### 34. Damage Control Across the Line

**Family:** Training and preparedness

Engineering, Security, and Medical use fallback procedures that work independently but conflict during a combined emergency. The commander runs an initial exercise, reviews the breakdown, approves revisions, and conducts a meaningful retest.

**Resolves:** Incompatible emergency response.

### 35. Refit Under Load

**Family:** Systems and logistics

A refitted system works individually but has not been proven under realistic linked demand. The commander allocates time and risk, coordinates the affected departments, oversees the operational test, and addresses its findings.

**Resolves:** A material integration uncertainty.

This template can incorporate existing Systems Integration or Sensor Calibration work without discarding their capability and evidence contracts.

### 36. Three Watches, Three Ships

**Family:** Interdepartmental coordination

Each duty watch has developed its own reasonable but incompatible practices. The commander compares them, decides what must be standardized and what may remain flexible, and oversees a cross-watch validation.

**Resolves:** Ship operation changing unpredictably between watches.

### 37. The Drill Nobody Trusts

**Family:** Training and preparedness

Crew members treat readiness exercises as predictable theater because past drills did not reflect their real constraints. The commander gathers concerns, designs a credible exercise, protects the purpose from becoming punitive, and follows through on its findings.

**Resolves:** Loss of confidence in the ship's training program.

### 38. Power, Sensors, and Priorities

**Family:** Systems and logistics

Several departments need the same maintenance window, power margin, or operational access. The commander understands the dependencies, selects a sequence, accepts an explicit temporary limitation, and oversees the coordinated work.

**Resolves:** Competing system work that cannot safely proceed independently.

## Level 4 Templates

Level 4 issues cost and restore 20 Cohesion. Only one Level 4 issue may exist across the visible queue and backlog at a time.

### 39. The Shipwide Readiness Cycle

**Family:** Training and preparedness

Several smaller signs point to a broader readiness problem involving training, procedures, schedules, system dependencies, and departmental confidence.

Expected phases:

1. Gather departmental concerns.
2. Decide priorities and acceptable risk.
3. Delegate a coordinated improvement plan.
4. Allow meaningful crew work and ship time to pass.
5. Conduct an integrated exercise or operational validation.
6. Address the result and establish the lasting standard.

**Resolves:** A major shipwide readiness limitation.

Completion restores 20 Cohesion and may unlock one campaign-authored lasting capability. The template has a very long cooldown or is limited to once per major campaign arc.

### 40. The Long Watch

**Family:** Training and preparedness; secondary personnel and coordination

A prolonged period of demanding operations has produced connected fatigue, deferred maintenance, weakened training, fragile watch coverage, reduced informal communication, and departments compensating for one another without a sustainable plan.

Expected phases:

1. Determine where the ship is carrying hidden strain.
2. Decide which operations must continue and which can pause.
3. Protect meaningful rest and recovery time.
4. Delegate maintenance, training, and coverage changes.
5. Allow the plan to operate across several duty cycles.
6. Review the result and return the ship to sustainable readiness.

**Resolves:** A broad post-operation Cohesion crisis.

Completion restores 20 Cohesion and may establish a temporary protection against immediately generating another fatigue- or workload-related issue.

The Shipwide Readiness Cycle prepares the crew through integrated review and exercise. The Long Watch recovers the crew after prolonged operational strain.

## Repetition and Diversity Rules

- Level 1 templates may recur after a moderate cooldown with new bindings and controlled variations.
- Level 2 templates recur less often and must avoid the same recent department, crewmember, and premise.
- Level 3 templates require a long cooldown and materially different bindings.
- Level 4 templates are limited to once per major arc or an equivalently long cooldown.
- Both Level 4 templates may never coexist in the visible queue or backlog.
- The same template may not recur while an instance is active or queued.
- Multiple personnel issues may not bind to the same crewmember concurrently.
- Shipboard-life templates may not cluster until the system feels frivolous.
- A recently completed Level 3 or 4 issue suppresses another high-level issue unless Cohesion and accepted story conditions justify it.
- An instantiated issue retains its selected people, departments, premise, level, and reward through reload and replay.

## Fact and Privacy Boundaries

- Established senior staff may participate only through campaign-authorized situations and public facts.
- A template may not randomly assign a named character depression, a breakup, family trouble, loneliness, misconduct, medical history, or a secret.
- Personal situations bind to an authored situation, an authored secondary crewmember, or a minimally defined background crewmember created through a bounded variation.
- Medical templates reveal only information command legitimately needs.
- A request for promotion does not require promotion as the successful outcome.
- Rest, recreation, community, mentorship, and personal support remain legitimate command concerns rather than joke penalties.
- Technical tasks must preserve the player's commander role and accept delegation, coordination, supervision, or direct assistance as appropriate approaches.
- Ordinary templates restore Cohesion and remove their condition. They do not automatically award permanent capabilities.

## Contract Coverage

Every approved roster entry now has a generator-ready design contract covering identity, bindings, predicates, player-safe setup, command purpose, operational effect, phases, valid approaches, insufficient actions, completion evidence, assistance, variations, anchor placement, narrator limits, invalidation, and reuse.

The contracts define content behavior, not runtime storage. Exact issue-record types, deterministic binding algorithms, accepted-evidence vocabulary, and migration code belong in the later implementation plan after the remaining system-wide decisions in the main design are locked.
