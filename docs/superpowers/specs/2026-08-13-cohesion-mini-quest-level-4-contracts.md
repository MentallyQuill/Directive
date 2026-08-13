# Cohesion Mini-Quest Level 4 Contracts

**Status:** Complete generator-ready design contracts for templates 39-40, pending user review.

**Date:** 2026-08-13

These contracts inherit the shared semantics in the [Cohesion Mini-Quest Template Catalog](./2026-08-13-cohesion-mini-quest-template-catalog.md). Each issue owns four ring segments and restores 20 Cohesion. Level 4 work is a rare shipwide initiative. Only one Level 4 issue may exist across the visible queue and backlog, and it must not be generated merely because four segments are available.

Level 4 completion requires a command diagnosis, a declared institutional priority, delegated work across several duty cycles, an integrated validation or review, and a lasting operating standard. The player may choose to spend sustained personal attention, but the commander cannot personally perform the entire initiative. Off-screen crew progress occurs only after an accepted authorization and sufficient accepted story time; it never advances from message count alone.

## 39. The Shipwide Readiness Cycle

**ID/version:** `cohesion.l4.shipwide-readiness-cycle.v1`

**Profile:** Level 4; primary Training and preparedness; secondary Interdepartmental coordination and Systems and logistics.

**Bindings:** At least four operational departments, their authorized leaders or representatives, one campaign-consistent readiness theme, two or more accepted warning signs, one executive coordinator, a bounded improvement program, an integrated validation, and optionally one campaign-authored lasting capability.

**Eligible when:** The ship is not at Critical Cohesion; no other Level 4 issue exists; at least four departments can participate; accepted routine has produced two compatible signs of a broad readiness weakness; current or near-future story time permits a multi-day initiative; and the campaign can define a safe integrated validation.

**Excluded when:** A real emergency or immediate mission deadline makes a readiness cycle implausible; the warning signs are entirely owned by other unresolved issues; required departments are inaccessible; the theme would invent unknown ship faults; or the same readiness theme has already been completed in the current major arc.

**Player-facing situation:** Several small, separately manageable signs now point to a broader weakness in how the Breckenridge prepares, coordinates, and learns across departments.

**Command objective:** Establish what the ship must become ready for, choose the priorities and acceptable risks, delegate a coordinated improvement cycle, validate the result, and set a durable standard.

**Why it matters:** Resolution restores four Cohesion segments, removes a shipwide readiness limitation from demanding operations, and may earn one explicitly authored lasting capability when its separate evidence contract is satisfied.

**Operational condition:** `shipwide_readiness_limitation` - demanding operations expose slower coordination and fewer safe fallback options across the bound readiness theme.

**Phases:**

1. `readiness_review` - gather concerns and evidence from all bound departments without assuming one common cause.
2. `command_priorities` - declare the readiness objective, priority order, protected resources, acceptable temporary limits, and executive coordinator.
3. `department_plans` - receive and approve bounded departmental contributions with explicit dependencies and completion signals.
4. `improvement_cycle` - allow delegated training, procedure, schedule, and system work to occur across at least two meaningful duty-cycle or story-time boundaries.
5. `integrated_validation` - conduct one campaign-safe exercise or operational test that requires the departments to function together under at least one changed condition.
6. `after_action_decision` - review the result, correct any bounded finding, and establish the lasting readiness standard and owner.

**Visibility:** The readiness theme, contributing warning signs, bound departments, and first review step are visible at creation. Department-specific diagnoses become visible when reported. Validation conditions stay hidden until the improvement cycle is substantially complete. A campaign-authored lasting capability may be previewed only as `POSSIBLE LASTING IMPROVEMENT` until its exact unlock conditions are known to the player.

**Valid approaches:** Department-head conference; staged readiness assessment; delegate an executive officer or senior lead while retaining command decisions; protect training time by accepting a temporary capability limit; combine exercises; use representative crew feedback; validate through an appropriate live operation when the campaign supplies one.

**Does not complete:** A shipwide speech; ordering every department to improve readiness; resolving a few subordinate tasks without the integrated objective; conducting an exercise before departments prepare; declaring success from morale alone; personally completing technical work; spending Command Bearing without the required accepted causal command action under the final Command Bearing rule.

**Completion evidence:** Accepted, source-bound story establishes input from every bound department, a declared readiness objective and tradeoffs, approved departmental work, required passage of story time, completed integrated validation, an after-action decision, and a named owner and standard for sustaining the improvement. Any lasting capability additionally requires its separate campaign-authored evidence contract.

**Cohesion and lasting reward:** Resolving the issue restores exactly 20 Cohesion and removes `shipwide_readiness_limitation`. It may unlock one campaign-authored capability only when that optional reward was bound at creation and its authoritative evidence contract passes. Otherwise the lasting reward is the new operating standard in completed history, not an additional mechanic.

**Computer help:** The computer may summarize visible warning signs, participating departments, scheduling constraints, and known readiness-plan structures. It may suggest gathering concerns, naming priorities, assigning an executive coordinator, protecting training time, sequencing work, or defining a safe validation. It must not invent the common cause, choose the commander's risk tradeoff, reveal hidden validation conditions, simulate departmental reports, declare crew work complete, or promise a capability unlock.

**Variations:** Integrated emergency readiness; sustained high-speed or high-demand operations; small-craft deployment readiness; multi-source sensor and response coordination; mission-role transition; post-refit shipwide operational certification only when campaign-authored.

**Anchor:** `central`; the selected state may softly emphasize the entire ring or the bound department regions without implying one defective location.

**Narrator limits:** Do not invent shipwide incompetence, hidden failures, exact technical limits, serious prior incidents, crew panic, or departmental animosity. Warning signs must remain bounded and compatible with accepted history. The exercise cannot create unchosen real casualties or permanent damage.

**Invalidation:** Before visibility, retire if the required warning signs or participating departments cease to exist. After progress, temporary mission pressure blocks the next schedulable phase while preserving prior decisions. A permanent change in mission role may reframe the readiness objective only through an authored variation that retains the same level, debt, and already accepted work. If an authored emergency genuinely validates the prepared integrated behavior, its accepted evidence may satisfy `integrated_validation`; it cannot retroactively supply missing preparation.

**Supersession:** Subordinate visible issues may contribute evidence only when their contracts explicitly align with a bound departmental plan. They retain their own Cohesion ownership and must resolve separately; the Level 4 issue never absorbs or double-claims their debt.

**Reuse:** At most once per major campaign arc, with a very long cooldown. A later instance requires a different readiness theme, materially different warning signs, and a different integrated validation.

## 40. The Long Watch

**ID/version:** `cohesion.l4.long-watch.v1`

**Profile:** Level 4; primary Training and preparedness; secondary Personnel and welfare, Interdepartmental coordination, and Systems and logistics.

**Bindings:** At least four shipboard sections or watches, their authorized representatives, two or more accepted strain indicators, one command-owned operational demand list, one recovery coordinator, a multi-cycle recovery plan, a sustainability review, and a post-resolution generation guard.

**Eligible when:** No other Level 4 issue exists; accepted story establishes a prolonged demanding operational period or several compatible strain indicators; multiple sections are compensating beyond routine practice; at least one meaningful operation can be slowed, deferred, redistributed, or protected; and current story state permits command to create recovery space.

**Excluded when:** The ship is in an immediate survival emergency with no discretionary capacity; the generator would need to invent casualties, diagnoses, trauma, mutiny, or system damage; all strain is already owned by specific unresolved issues; or the same campaign arc has already completed The Long Watch.

**Player-facing situation:** The Breckenridge has kept performing through a demanding period by borrowing attention, rest, maintenance time, and informal support from across the ship. The compensations now form one unsustainable pattern.

**Command objective:** Discover where the ship is carrying hidden strain, decide what must continue and what can pause, protect recovery work, and return the crew to a sustainable operating rhythm.

**Why it matters:** Resolution restores four Cohesion segments, returns safe operating margin across the ship, and briefly protects recovery by suppressing newly generated fatigue or workload issues for two eligible checks.

**Operational condition:** `shipwide_sustained_operations_strain` - demanding ship or crew actions have fewer safe margins, and affected sections may need explicit tradeoffs rather than effortless full performance.

**Phases:**

1. `strain_audit` - gather bounded reports from all bound sections covering workload, coverage, deferred maintenance, training, and communication without diagnosing individuals.
2. `operational_triage` - declare which operations continue, slow, pause, or transfer, including one visible temporary cost command accepts.
3. `recovery_plan` - approve protected rest, coverage, maintenance, training, and coordination actions with owners and dependencies.
4. `first_recovery_cycle` - allow at least one meaningful duty-cycle or story-time boundary, then review whether protected time actually remained protected.
5. `adjust_and_continue` - address one supported obstacle, rebalance the plan, and allow at least one additional meaningful cycle.
6. `sustainability_review` - hear affected sections again, verify that hidden compensations have ended or become explicit, and set the continuing workload and escalation standard.

**Visibility:** The broad strain, accepted indicators, bound sections, and audit are visible at creation. Individual reports appear only after they are gathered. The player sees the need for multiple recovery cycles but not a countdown. Obstacles remain undiscovered until supported by accepted results; the generator cannot preselect a dramatic setback.

**Valid approaches:** Department and watch check-ins; empower an executive coordinator; deliberately defer nonessential work; rotate critical coverage; protect rest periods; schedule maintenance and training; simplify reporting; personally visit affected sections; use mission opportunities for recovery when credible.

**Does not complete:** Ordering everyone to take a day off; a morale speech or celebration alone; demanding normal output during protected recovery; instantly narrating multiple duty cycles; clearing individual queued issues automatically; treating one technical repair as shipwide recovery; spending Command Bearing without the final rule's declared and accepted causal intervention.

**Completion evidence:** Accepted, source-bound story establishes reports from all bound sections, an explicit operational triage decision and cost, an owned recovery plan, two distinct accepted time or duty-cycle boundaries, review and adjustment after the first cycle, and a final sustainability review confirming that coverage, deferred work, and escalation are no longer dependent on invisible overextension.

**Cohesion and lasting reward:** Resolving the issue restores exactly 20 Cohesion and removes `shipwide_sustained_operations_strain`. It also activates `long_watch_recovery_guard`, a temporary scheduling constraint rather than extra Cohesion: for the next two eligible opportunity checks, fatigue- and workload-derived templates have zero selection weight unless an accepted new mission consequence explicitly creates such an issue. The guard is replayable, cannot suppress authored campaign work, and expires after those checks whether or not another issue is generated.

**Computer help:** The computer may summarize visible strain categories, watch schedules, deferred-work categories, current operational commitments, and available command levers. It may suggest an audit, protected time, workload triage, coverage rotation, a recovery coordinator, and review cadence. It must not diagnose burnout, depression, trauma, illness, or morale; reveal private records; decide what mission work the commander should abandon; fabricate departmental reports; advance time; or declare recovery complete.

**Variations:** Recovery after extended alert status; dense mission sequence; prolonged high-speed transit; repeated small emergencies; post-refit commissioning tempo; sustained personnel shortage only when accepted story establishes it.

**Anchor:** `central`; selection may softly emphasize multiple bound regions to communicate distributed strain.

**Narrator limits:** Do not invent medical incapacity, breakdowns, family distress, resentment, misconduct, system damage, or a secret crisis. Strain appears through bounded operational indicators and voluntary player conversations, not omniscient psychological claims. Recovery does not make every crewmember happy or erase existing authored consequences.

**Invalidation:** Before visibility, retire if accepted history no longer supports prolonged strain or no operation can be adjusted. After visibility, a new emergency blocks recovery scheduling but does not erase audit or planning. If command voluntarily continues unsustainable operations, the issue remains unresolved; it may expose the same operational condition more often but cannot create extra Cohesion debt. If affected sections permanently change, revalidate bindings and require an explicit player-safe reframe rather than silent substitution.

**Supersession:** Specific personnel, maintenance, or training issues remain independently owned. Their completion may provide supporting evidence to a recovery-plan action, but The Long Watch cannot resolve, conceal, or absorb their Cohesion. Conversely, resolving The Long Watch does not clear queued debt.

**Reuse:** At most once per major campaign arc. A later instance requires a separately accepted demanding period and materially different strain indicators. It cannot generate while `long_watch_recovery_guard` is active.
