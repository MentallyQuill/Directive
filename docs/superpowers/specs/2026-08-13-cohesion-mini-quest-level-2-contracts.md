# Cohesion Mini-Quest Level 2 Contracts

**Status:** Complete generator-ready design contracts for templates 21-32, pending user review.

**Date:** 2026-08-13

These contracts inherit the shared semantics in the [Cohesion Mini-Quest Template Catalog](./2026-08-13-cohesion-mini-quest-template-catalog.md). Each issue owns two ring segments and restores 10 Cohesion. The three broad phase labels are visible at creation, but causes, private facts, test outcomes, and required adjustments remain undiscovered until accepted play establishes them. Level 2 requires distinct milestones: understand the actual issue, establish a command intervention, and verify its first meaningful result. The intervention and verification may occur in the same scene only when the fiction provides a credible test.

## 21. Falling Behind

**ID/version:** `cohesion.l2.falling-behind.v1`

**Profile:** Level 2; primary Personnel and welfare; secondary Training and preparedness.

**Bindings:** One background crewmember, their supervisor, one duty area, at least two public performance observations, and one closed cause category.

**Eligible when:** Accepted duty context can support a gradual performance decline without inventing a serious incident; the crewmember is not bound to another personnel issue.

**Excluded when:** The premise would require an unapproved medical, psychological, romantic, family, disciplinary, or substance-use explanation; an active emergency fully explains the decline.

**Player-facing situation:** A crewmember who previously met expectations has fallen behind across more than one routine review, and their supervisor's ordinary corrections have not held.

**Command objective:** Identify the work-relevant cause, establish a humane improvement plan, and verify an early sign that the plan is workable.

**Why it matters:** Resolution recovers dependable performance without discarding the crewmember and prevents the department from continually paying an extra supervision or coverage cost.

**Operational condition:** `persistent_performance_strain` - the department spends extra supervision or accepts a bounded weakness in the affected duty.

**Phases:** `review_pattern` - compare the public observations and hear the crewmember and supervisor; `set_support_plan` - define one or two concrete supports, expectations, and a review point; `verify_progress` - observe or receive accepted evidence of an early improvement, honest obstacle, or justified plan adjustment.

**Valid approaches:** Private check-in; workload reduction; clarified expectations; targeted practice; different supervision; temporary reassignment paired with a return path.

**Does not complete:** A motivational speech; punishment without cause; indefinite removal from duty; demanding private details; writing the plan without the crewmember or supervisor understanding it.

**Completion evidence:** Accepted story establishes a legitimate work-relevant cause category, a specific support and expectation, and one reviewed result showing improvement or a responsibly adjusted plan.

**Computer help:** Summarize public performance patterns, workload and training facts, and possible support categories; suggest conversations and review structures; never diagnose or reveal private information.

**Variations:** Training gap; workload imbalance; unclear standard; unfamiliar assignment; shipboard adjustment explicitly limited to work routines.

**Anchor:** The duty department region.

**Narrator limits:** Do not invent depression, breakup, family trouble, illness, misconduct, or hidden evaluations. The crewmember is not incompetent by default.

**Invalidation:** If the crewmember transfers or an authored cause supersedes the premise, retire with player-safe explanation. If a mission delays review, keep progress and expose the next safe review opportunity.

**Reuse:** Long cooldown; never reuse a crewmember in the same arc and vary cause, department, and intervention.

## 22. Return to Duty

**ID/version:** `cohesion.l2.return-to-duty.v1`

**Profile:** Level 2; primary Personnel and welfare; secondary Interdepartmental coordination.

**Bindings:** One campaign-authorized returning crewmember, Medical as clearance authority, their duty department, supervisor, and a bounded workload plan.

**Eligible when:** Accepted campaign data or play establishes a return-to-duty clearance; command legitimately knows the functional limitations or staged-work recommendation.

**Excluded when:** The generator would need to invent why the person was absent, a diagnosis, prognosis, treatment, disability, or confidential medical detail.

**Player-facing situation:** Medical has cleared a crewmember to return, but the department and crewmember do not share the same expectations about workload or trust.

**Command objective:** Establish a respectful, medically compliant reintegration plan and verify that the first duty period works.

**Why it matters:** Resolution returns a qualified person to useful duty while protecting both safety and trust, widening the department's real operating capacity.

**Operational condition:** `duty_reintegration_unsettled` - the department either underuses a qualified person or risks assigning work outside cleared limits.

**Phases:** `align_expectations` - hear Medical's functional guidance, the crewmember, and the supervisor; `authorize_return_plan` - define duties, support, limits, and review point; `review_first_watch` - confirm the arrangement worked or make a supported adjustment.

**Valid approaches:** Staged duties; supervised watch; temporary limit with review; alternate assignment; facilitated conversation about trust and expectations.

**Does not complete:** Asking for diagnosis; overriding Medical; restoring full duty solely to prove confidence; indefinite light duty with no review.

**Completion evidence:** Accepted story records a plan consistent with authorized functional guidance and a reviewed first result accepted by command.

**Computer help:** State only clearance, functional limits, schedule, and responsible contacts available to command; suggest staged duty and review; refuse requests for protected medical details.

**Variations:** Return after routine injury, illness, leave, or mission recovery only when the originating fact is already authored or accepted.

**Anchor:** Between Sickbay and the duty department, otherwise `central`.

**Narrator limits:** Never invent diagnosis, cause, symptoms, prognosis, treatment, shame, or fear. Medical and the crewmember retain appropriate privacy.

**Invalidation:** If Medical changes clearance, return to `authorize_return_plan` using only new authorized guidance. Retire if the person leaves the roster.

**Reuse:** Very long cooldown; only campaign-authorized returning personnel may bind.

## 23. Sensor Language

**ID/version:** `cohesion.l2.sensor-language.v1`

**Profile:** Level 2; primary Interdepartmental coordination; secondary Systems and logistics.

**Bindings:** Science, Operations, one sensor-report category, one representative from each, and one safe controlled comparison.

**Eligible when:** Both departments are active, the report category can be grounded in current ship capabilities, and a test can occur without inventing a discovery.

**Excluded when:** The disagreement concerns an active unknown mission contact whose classification must remain narratively uncertain, or Sensor Calibration already owns the same premise.

**Player-facing situation:** Science and Operations use different labels or confidence standards for the same sensor observations, slowing command decisions.

**Command objective:** Establish shared reporting language and validate it against a controlled or historical example.

**Why it matters:** Resolution gives the player faster, clearer sensor advice and removes ambiguity about what confidence the bridge should place in a report.

**Operational condition:** `sensor_reporting_inconsistent` - sensor conclusions take longer to reconcile and arrive with ambiguous confidence.

**Phases:** `compare_methods` - identify the conflicting terms, thresholds, or roles; `adopt_standard` - choose a shared report form and decision ownership; `validate_standard` - run one controlled comparison or replay an authorized known sample and review the result.

**Valid approaches:** Joint workshop; common confidence scale; paired readout; read-back protocol; distinguish raw observation from interpretation.

**Does not complete:** Ordering one department to adopt the other's language wholesale; accepting a glossary without a test; recalibrating hardware as the only response.

**Completion evidence:** Accepted story records the shared standard, responsible roles, and a successful bounded comparison understood by both departments.

**Computer help:** Show the two current report structures, known capability limits, and safe test options; suggest terminology, confidence, or ownership alignment; never resolve an unknown contact.

**Variations:** Confidence levels; anomaly classification; contact identity language; resolution qualifiers; provenance labels.

**Anchor:** Forward or sensor region.

**Narrator limits:** Do not invent a sensor contact, hardware defect, scientific fact, or hidden cause. Do not declare either department incompetent.

**Invalidation:** If an authored calibration changes the relevant data, reset only `validate_standard`; if one department becomes unavailable, keep the actionable blocker visible when rescheduling is possible.

**Reuse:** Long cooldown; vary report category and representatives.

## 24. The Blended Watch

**ID/version:** `cohesion.l2.blended-watch.v1`

**Profile:** Level 2; primary Interdepartmental coordination; secondary Training and preparedness.

**Bindings:** One mixed duty watch, two prior-practice cohorts, a watch leader, one routine bridge or operational procedure, and a verification watch.

**Eligible when:** The campaign supports personnel from different prior assignments or training backgrounds and the procedure has more than one reasonable practice.

**Excluded when:** The difference is a clear safety violation better represented by One Bad Drill Habit, or the whole ship has divergent watch practices represented by Three Watches, Three Ships.

**Player-facing situation:** A newly mixed watch performs adequately, but incompatible inherited habits create hesitation and duplicated work.

**Command objective:** Decide what must be standard, what may remain flexible, and prove the watch can operate as one team.

**Why it matters:** Resolution makes this watch reliable during unexpected transitions instead of forcing the player to compensate for duplicated or hesitant crew action.

**Operational condition:** `mixed_watch_coordination_drag` - the watch responds more slowly during transitions or unexpected changes.

**Phases:** `observe_watch` - identify one or two consequential differences; `set_watch_standard` - define roles, language, or sequence while preserving harmless flexibility; `verify_watch` - observe a routine or simulated transition under the revised standard.

**Valid approaches:** Shadow the watch; facilitated debrief; watch-leader proposal with command approval; paired practice; concise watch compact.

**Does not complete:** Declaring one former crew's practice superior without review; replacing the watch; standardizing harmless personal style.

**Completion evidence:** Accepted story identifies the consequential conflict, records the agreed standard, and shows one credible coordinated performance.

**Computer help:** Compare procedural differences already observed, identify the watch leader, and suggest observation or a bounded drill; never invent stereotypes about former crews.

**Variations:** Handoff sequence; console callouts; escalation timing; confirmation practice; division of monitoring duties.

**Anchor:** Forward or bridge region.

**Narrator limits:** Do not invent inter-crew prejudice, prior disasters, or universal cultural habits.

**Invalidation:** Retire if the watch is dissolved before visibility; if membership changes after progress, preserve the standard and require one validation with the current watch.

**Reuse:** Long cooldown; vary watch, procedure, and cohort origins.

## 25. Rookies Under Pressure

**ID/version:** `cohesion.l2.rookies-under-pressure.v1`

**Profile:** Level 2; primary Training and preparedness; secondary Personnel and welfare.

**Bindings:** One junior response team, an instructor or supervisor, a known routine skill, one safe changing-condition drill, and one improvement focus.

**Eligible when:** The team can perform the base skill and a non-punitive drill can be scheduled.

**Excluded when:** The team lacks basic qualification, a real emergency is underway, or the issue is only one individual's shortcut.

**Player-facing situation:** A junior team performs correctly when practice is predictable but loses coordination when conditions change.

**Command objective:** Observe the pressure failure, lead a useful debrief, change preparation, and confirm improvement.

**Why it matters:** Resolution turns a routine-only junior team into a credible option during changing conditions, expanding who the commander can safely rely on.

**Operational condition:** `junior_team_pressure_fragility` - the team may handle routine duty but cannot be relied upon for the affected role during rapid change.

**Phases:** `run_baseline_drill` - observe one controlled change and record the actual failure mode; `coach_response` - revise roles, cues, or practice around that failure; `run_retest` - introduce a different bounded change and verify improvement.

**Valid approaches:** Direct observation; delegate drill control; team-led debrief; role rotation; simple decision cues; graduated difficulty.

**Does not complete:** A speech about confidence; repeating the identical drill until memorized; punishing errors made in good-faith training.

**Completion evidence:** Accepted story establishes the original coordination failure, a targeted change, and improved performance under a non-identical test.

**Computer help:** Provide qualification status, safe drill controls, and observed team-level failure categories; suggest debrief and graduated retest; never predict a scripted success.

**Variations:** Communications loss; changed route; unavailable team lead; conflicting casualty priorities; equipment substitution.

**Anchor:** Training or bound response-area region.

**Narrator limits:** Do not create real casualties, humiliation, secret incompetence, or a surprise punitive evaluation.

**Invalidation:** If a mission creates a real use of the skill, accepted successful performance may satisfy `run_retest`; failure does not invent extra debt but preserves the issue for recovery.

**Reuse:** Long cooldown; vary team, skill, and pressure change.

## 26. Shuttle Turnaround

**ID/version:** `cohesion.l2.shuttle-turnaround.v1`

**Profile:** Level 2; primary Systems and logistics; secondary Interdepartmental coordination.

**Bindings:** Flight Control, Engineering or maintenance, one shuttle class or craft, a readiness owner, an inspection dispute, and one controlled turnaround.

**Eligible when:** The campaign has shuttle operations and a non-critical craft or process available for review.

**Excluded when:** The craft is currently damaged in an authored mission, immediate launch is mandatory, or a specific technical fault is unknown.

**Player-facing situation:** Flight Control wants faster availability while maintenance personnel believe inspection responsibility or depth is unclear.

**Command objective:** Set risk, ownership, and readiness criteria, then validate one turnaround under the agreed process.

**Why it matters:** Resolution restores predictable shuttle availability and reduces the chance that an away-team or logistics choice is narrowed by an avoidable readiness dispute.

**Operational condition:** `shuttle_readiness_unreliable` - one shuttle is delayed or its availability cannot be confidently promised.

**Phases:** `map_turnaround` - hear both groups and locate the delay or ownership gap; `authorize_process` - set inspection minimums, custody, and escalation; `validate_turnaround` - complete one bounded turnaround and review readiness.

**Valid approaches:** Joint process walk-through; tiered inspections by mission type; explicit sign-off; pre-staging; separate preparation from final release.

**Does not complete:** Ordering faster work; waiving inspection without risk basis; personally inspecting or piloting as the only solution.

**Completion evidence:** Accepted story records ownership and readiness rules and a completed test producing a credible ready/not-ready result.

**Computer help:** Provide current turnaround steps, known schedule impact, and responsible roles; suggest tiering, custody, or staging; never certify a craft or invent a fault.

**Variations:** Inspection duplication; unclear release authority; tool availability; mission-kit loading; refueling versus maintenance sequencing.

**Anchor:** Aft, shuttle bay, or flight-control region.

**Narrator limits:** Do not invent a crash risk, damaged craft, negligence, or guaranteed readiness.

**Invalidation:** If the bound craft becomes mission-critical or damaged, suspend validation and expose the safe blocker; retire if shuttle operations become unavailable for the arc.

**Reuse:** Long cooldown; vary craft, process gap, and department representatives.

## 27. After the Bad Call

**ID/version:** `cohesion.l2.after-bad-call.v1`

**Profile:** Level 2; primary Personnel and welfare; secondary Training and preparedness.

**Bindings:** One background crewmember, their supervisor, one documented bounded mistake or difficult evaluation, one supervised responsibility, and one reviewer.

**Eligible when:** The event is already accepted or can be generated as a minor, non-secret duty error with no serious harm.

**Excluded when:** Binding a named character would invent an incident; the event implies casualty, trauma, formal discipline, gross negligence, or private health facts.

**Player-facing situation:** After a documented mistake or difficult evaluation, a crewmember now hesitates at moments when their role requires a timely decision.

**Command objective:** Debrief the event fairly, restore supported responsibility, and verify decisive performance without erasing accountability.

**Why it matters:** Resolution returns timely judgment to the affected role and lets the player develop a crewmember through earned trust rather than simple praise or removal.

**Operational condition:** `duty_confidence_reduced` - the bound role reacts late or over-escalates routine decisions.

**Phases:** `debrief_event` - distinguish the actual error from hindsight and establish the learning need; `restore_responsibility` - set support, supervision, and a bounded chance to act; `review_performance` - evaluate one real or simulated decision and give clear follow-up.

**Valid approaches:** Private debrief; supervised watch; targeted simulation; mentor pairing; limited authority that grows after review.

**Does not complete:** Declaring the mistake irrelevant; demanding confidence; removing all responsibility; guaranteeing that no future error can occur.

**Completion evidence:** Accepted story records a fair learning conclusion, an authorized practice opportunity, and one reviewed decision showing credible regained function.

**Computer help:** Summarize only the documented public event, current role, and training options; suggest debrief, supervision, and a bounded test; never infer trauma, shame, or motive.

**Variations:** Late escalation; incorrect priority; overcautious hold; missed procedural cue; ambiguous evaluation outcome.

**Anchor:** The duty station or department region.

**Narrator limits:** Do not invent a serious incident, casualty, diagnosis, secret failure, or named-character history.

**Invalidation:** Retire if the event record is overturned before visibility; if the person transfers, preserve any accepted debrief but retire remaining phases with no invented outcome.

**Reuse:** Very long cooldown; never bind the same person twice or repeat the same mistake category in an arc.

## 28. The Informal Leader

**ID/version:** `cohesion.l2.informal-leader.v1`

**Profile:** Level 2; primary Personnel and welfare; secondary Interdepartmental coordination.

**Bindings:** One respected background crewmember or junior officer, their formal supervisor, one team, one unofficial responsibility, and one authority/support adjustment.

**Eligible when:** Routine operations can support an observable authority gap and the informal leader is not already bound to a performance or promotion issue.

**Excluded when:** The premise would require mutiny, favoritism, insubordination, discrimination, or a secret chain of command.

**Player-facing situation:** A capable crewmember is quietly holding a team together through responsibilities their formal role does not clearly support.

**Command objective:** Preserve useful leadership while making accountability, authority, relief, and limits explicit.

**Why it matters:** Resolution converts a fragile personal dependency into stable team capacity and gives the commander another responsibly supported leader.

**Operational condition:** `unofficial_authority_dependency` - decisions depend on one person's influence without reliable backing or succession.

**Phases:** `map_real_role` - hear the team, informal leader, and supervisor and identify the unsupported responsibilities; `formalize_boundaries` - assign authority, support, title-neutral responsibility, or workload correction; `observe_handoff` - verify the team can act under the clarified structure.

**Valid approaches:** Bounded acting responsibility; formal supervisor support; redistribute hidden work; recognize contribution; create a deputy or escalation path.

**Does not complete:** Immediate promotion as the only answer; stripping influence to restore appearances; praising the person while leaving hidden work intact.

**Completion evidence:** Accepted story records the actual responsibility, an explicit authority/support arrangement, and one credible use or handoff under it.

**Computer help:** Summarize observable workflow and formal roles; suggest recognizing, bounding, redistributing, or supporting the unofficial work; never infer ambition or disloyalty.

**Variations:** Shift coordination; specialist advice; onboarding others; supply organization; calm decision support.

**Anchor:** The team's department region.

**Narrator limits:** Do not invent rivalry, resentment, misconduct, or entitlement to rank.

**Invalidation:** If formal assignment changes independently, revalidate whether the authority gap remains; retire if the team dissolves.

**Reuse:** Long cooldown; vary role, team, and remedy.

## 29. Bridge-to-Engineering Lag

**ID/version:** `cohesion.l2.bridge-engineering-lag.v1`

**Profile:** Level 2; primary Interdepartmental coordination; secondary Systems and logistics.

**Bindings:** Bridge operations, Engineering, one operational-change category, one limitation-report category, representatives from both, and one safe communication test.

**Eligible when:** Both groups have a recurring information dependency and current operations allow a bounded rehearsal or live low-risk use.

**Excluded when:** A current mission deliberately limits communication or Refit Under Load already owns the same system dependency.

**Player-facing situation:** Operational changes reach Engineering too late, while Engineering limitations reach the bridge without enough decision context.

**Command objective:** Establish a two-way escalation path that communicates timing, operational meaning, and acknowledgment.

**Why it matters:** Resolution lets bridge decisions account for engineering reality sooner and prevents technical limitations from arriving as unexplained last-minute restrictions.

**Operational condition:** `bridge_engineering_information_lag` - power or maneuver decisions incur delay or a bounded avoidable limitation.

**Phases:** `trace_both_directions` - identify one late bridge update and one unclear engineering report category; `set_escalation_path` - define triggers, message content, recipient, and acknowledgment; `test_path` - use it in a simulation or routine operational change.

**Valid approaches:** Shared status format; liaison role; priority triggers; bridge read-back; engineering impact statement; scheduled readiness sync.

**Does not complete:** Adding more reports without ownership; blaming one department; solving only one communication direction.

**Completion evidence:** Accepted story records the two-way protocol and one test in which both sides receive and understand actionable context.

**Computer help:** Map existing message routes and observed delay categories; suggest triggers, recipients, or read-backs; never invent an engineering limit or bridge order.

**Variations:** Power reallocation; maneuver demand; maintenance restriction; alert-state change; propulsion readiness.

**Anchor:** Between forward and engineering/aft regions.

**Narrator limits:** Do not invent imminent system failure, insubordination, or withheld information.

**Invalidation:** If a major refit replaces the communication path, return to `set_escalation_path`; if either department is temporarily inaccessible, keep the blocker visible.

**Reuse:** Very long cooldown; vary information categories and representatives.

## 30. Security at Sickbay's Door

**ID/version:** `cohesion.l2.security-sickbay-door.v1`

**Profile:** Level 2; primary Interdepartmental coordination; secondary Personnel and welfare.

**Bindings:** Medical, Security, one routine sensitive access scenario, authorized representatives, and one tabletop or procedural test.

**Eligible when:** A general protocol question can be posed without identifying a patient or inventing a crime, threat, or diagnosis.

**Excluded when:** An active patient, investigation, quarantine, or security event would make the issue mission-specific or expose protected facts.

**Player-facing situation:** Medical privacy and Security's safety responsibilities produce incompatible expectations about access during a routine sensitive situation.

**Command objective:** Establish a narrow protocol defining authority, minimum disclosure, access, and escalation.

**Why it matters:** Resolution protects patient privacy and ship safety at the same time, preventing a future sensitive scene from forcing an arbitrary choice between them.

**Operational condition:** `medical_security_access_conflict` - a future routine sensitive event would cause delay, overreach, or under-protection.

**Phases:** `define_legitimate_needs` - hear each department's minimum requirements without discussing a real patient's private facts; `authorize_protocol` - set access, information, and escalation boundaries; `tabletop_test` - apply the protocol to a fictionalized scenario and resolve ambiguities.

**Valid approaches:** Joint policy review; minimum-necessary information rule; named escalation roles; controlled waiting/access zones; tabletop exercise.

**Does not complete:** Granting Security unrestricted access; letting Medical ignore a credible safety need; using a real patient's case as training material.

**Completion evidence:** Accepted story records a bounded protocol and a successful scenario test in which both care and safety needs are addressed.

**Computer help:** Provide existing general authorities and facility-access categories; suggest minimum disclosure, escalation, and tabletop review; refuse patient-specific details.

**Variations:** Visitor access; evidence custody outside treatment space; protective presence; emergency notification; restricted records request.

**Anchor:** Medical or central region.

**Narrator limits:** Do not invent a patient, diagnosis, offender, threat, investigation, or confidential record.

**Invalidation:** If an authored event creates a specific live case, suspend this generic issue rather than applying its unresolved design blindly; resume or retire after the case.

**Reuse:** Very long cooldown; vary general scenario and procedural ambiguity.

## 31. The Evacuation Bottleneck

**ID/version:** `cohesion.l2.evacuation-bottleneck.v1`

**Profile:** Level 2; primary Training and preparedness; secondary Systems and logistics.

**Bindings:** One ship region, two or more work groups, one safe route abstraction, damage-control or safety lead, and two controlled drills.

**Eligible when:** A non-emergency drill can reveal a flow problem without requiring exact unsupported deck geometry.

**Excluded when:** An evacuation is underway, the route is unsafe, or a Level 3 combined-response issue already owns the same groups and route.

**Player-facing situation:** A drill shows that assigned personnel cannot move through one route or assembly procedure without delay and confusion.

**Command objective:** Understand the flow failure, approve a practical revision, and prove the revision under a changed retest.

**Why it matters:** Resolution removes a known evacuation delay and preserves more safe options if a later emergency taxes the affected region.

**Operational condition:** `evacuation_flow_bottleneck` - the affected region would evacuate slowly during a real emergency.

**Phases:** `review_failed_flow` - establish where congestion or role conflict occurred; `revise_route_plan` - approve alternate routing, timing, assembly, or guidance; `retest_flow` - run a safe test with one changed condition and verify improvement.

**Valid approaches:** Stagger groups; split routes; change assembly sequence; add guides; relocate obstructions when campaign data permits; clarify priority movement.

**Does not complete:** Telling people to move faster; repeating the identical drill with no change; inventing an exact corridor solution unsupported by ship data.

**Completion evidence:** Accepted story records the observed bottleneck, approved revision, and improved controlled flow under a meaningful retest.

**Computer help:** Summarize group counts, route categories, and observed drill delays; suggest timing, routing, or assembly changes; never fabricate deck plans.

**Variations:** Turbolift dependence; assembly-point congestion; opposing traffic; mobility assistance; equipment carried during evacuation.

**Anchor:** The affected region.

**Narrator limits:** Do not create casualties, panic, inaccessible crew, or precise deck geography absent from campaign data.

**Invalidation:** If refit or damage changes the route, return to `revise_route_plan`; if the region becomes inaccessible, keep the route blocker visible only when command can act on an alternate.

**Reuse:** Very long cooldown per region; vary groups and flow failure.

## 32. Cargo Without an Owner

**ID/version:** `cohesion.l2.cargo-without-owner.v1`

**Profile:** Level 2; primary Systems and logistics; secondary Interdepartmental coordination.

**Bindings:** One ordinary supply or equipment category, at least three custody roles or departments, one receiving need, one accountable custodian, and one verification handoff.

**Eligible when:** The cargo can be generated as routine, non-hazardous, non-classified material and its custody matters to current ship readiness.

**Excluded when:** The cargo is dangerous, alien, classified, contraband, mission-critical, missing through suspected theft, or tied to an authored mystery.

**Player-facing situation:** Useful supplies are moving through several departments, but no one owns their condition and location from receipt to issue.

**Command objective:** Trace the custody gap, assign accountable ownership, and validate one complete handoff.

**Why it matters:** Resolution makes the affected supplies reliably available, preventing future tasks from being delayed by inventory that exists but cannot be found or accepted.

**Operational condition:** `inventory_custody_unreliable` - the supply category may be delayed, duplicated, or unavailable when requested.

**Phases:** `trace_custody` - follow one representative item or record through the current path; `assign_accountability` - define owner, acceptance signal, and exception escalation; `verify_handoff` - complete one receipt-to-issue transfer under the new rule.

**Valid approaches:** Custody map; single accountable owner; signed or acknowledged handoff; exception queue; consolidate storage or records.

**Does not complete:** Conducting a full inventory with no ownership change; blaming the last handler; personally carrying the cargo through the process.

**Completion evidence:** Accepted story identifies the broken handoff, records accountable custody, and confirms one successful end-to-end transfer.

**Computer help:** Show authorized inventory records, current custody steps, and responsible roles; suggest acceptance and exception mechanisms; never infer theft or reveal classified cargo.

**Variations:** Repair parts; field kits; scientific consumables; uniforms; shuttle equipment; noncritical emergency stores.

**Anchor:** Cargo, aft, or bound storage region.

**Narrator limits:** Do not invent contraband, sabotage, scarcity crisis, dangerous material, or criminal culpability.

**Invalidation:** Retire if the cargo category is removed from ship inventory; if an authored loss occurs, supersede into that authored story without duplicating Cohesion debt.

**Reuse:** Long cooldown; vary supply category, custody path, and departments.
