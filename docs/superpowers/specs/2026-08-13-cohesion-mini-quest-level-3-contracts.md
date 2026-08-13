# Cohesion Mini-Quest Level 3 Contracts

**Status:** Complete generator-ready design contracts for templates 33-38, pending user review.

**Date:** 2026-08-13

These contracts inherit the shared semantics in the [Cohesion Mini-Quest Template Catalog](./2026-08-13-cohesion-mini-quest-template-catalog.md). Each issue owns three ring segments and restores 15 Cohesion. Level 3 work spans several roles and normally requires at least three scenes or story beats: diagnosis, command decision, delegated execution, and a meaningful validation. Crew work may advance off-screen only after the commander authorizes it and accepted story time passes.

## 33. Departments at Cross-Purposes

**ID/version:** `cohesion.l3.departments-cross-purposes.v1`

**Profile:** Level 3; primary Interdepartmental coordination; secondary Systems and logistics.

**Bindings:** Three distinct departments, one shared operational workflow, one representative from each, one incompatible assumption per department, and one real-work validation opportunity.

**Eligible when:** Three departments are available, their routine responsibilities genuinely intersect, and each position can be reasonable within authored operations.

**Excluded when:** The conflict requires anyone to violate clear orders, conceals a crime, depends on undiscovered mission facts, or is already owned by a more specific active template.

**Player-facing situation:** Three departments are each doing sensible work under different assumptions, causing the combined process to repeatedly fail.

**Command objective:** Understand every legitimate constraint, identify the institutional contradiction, establish one shared operating agreement, and validate it during real work.

**Why it matters:** Resolution removes a recurring three-department failure, freeing the player from repeated arbitration and making the shared workflow reliable under unusual demand.

**Operational condition:** `three_department_workflow_conflict` - the shared workflow loses time, consumes extra command attention, and cannot reliably handle unusual demand.

**Phases:** `hear_departments` - establish each group's responsibility, assumption, and constraint; `identify_systemic_conflict` - state the precise point where locally reasonable behavior becomes collectively incompatible; `authorize_shared_procedure` - assign priorities, handoffs, exception authority, and accountable ownership; `crew_implementation` - allow the departments to update their practice after accepted authorization and sufficient story time; `validate_in_operation` - observe one real or safely simulated use and address a bounded finding.

**Visibility:** The three departments and broad workflow are visible at creation. Each assumption becomes visible when heard. `crew_implementation` and validation details remain hidden until the shared procedure is authorized.

**Valid approaches:** Joint command conference; separate fact-finding followed by mediation; temporary command rule plus a delegated procedural revision; pilot the agreement on one shift before shipwide adoption.

**Does not complete:** Choosing a winner before hearing all three constraints; ordering better cooperation; personally managing every handoff; publishing a procedure without operational use.

**Completion evidence:** Accepted story establishes all three constraints, the shared conflict, an acknowledged procedure with ownership and exceptions, and one operational validation whose finding is either satisfactory or credibly corrected.

**Computer help:** Summarize known workflows and where timing, ownership, or priorities diverge; suggest questions for each department and structures for a shared agreement; never assign motive or choose the commander's tradeoff.

**Variations:** Science-Operations-Engineering sensor workflow; Medical-Security-Operations casualty routing; Flight Control-Engineering-Logistics small-craft readiness; Security-Operations-Civilian-services access planning.

**Anchor:** `central`, with leader-line emphasis between bound regions.

**Narrator limits:** Do not create villains, insubordination, hidden agendas, or facts outside departmental authority. Every side must retain at least one legitimate concern.

**Invalidation:** If one department or workflow becomes unavailable before visibility, retire. After progress, a temporary absence blocks the next joint phase; a permanent structural change requires explicit supersession and preserves accepted lessons without duplicating debt.

**Reuse:** Very long cooldown; all three departments, workflow, and core contradiction must differ on reuse.

## 34. Damage Control Across the Line

**ID/version:** `cohesion.l3.damage-control-across-line.v1`

**Profile:** Level 3; primary Training and preparedness; secondary Interdepartmental coordination.

**Bindings:** Engineering or damage control, Security, Medical, one emergency class, one representative or team from each, a safe integrated exercise, and a retest variation.

**Eligible when:** Each department has an authored emergency role and ship conditions permit controlled training.

**Excluded when:** A real emergency is underway, training resources are unavailable, the scenario would expose an undiscovered vulnerability, or the same teams are bound to another combined-response issue.

**Player-facing situation:** Departmental fallback procedures work independently but conflict when Engineering, Security, and Medical must respond to the same emergency space.

**Command objective:** Expose the interlock failure safely, approve compatible fallback roles, and prove the combined response under changed conditions.

**Why it matters:** Resolution gives the commander a coordinated emergency-response option instead of forcing slower improvised rescue and containment when several departments converge.

**Operational condition:** `combined_emergency_response_incompatible` - a complex casualty would force improvised sequencing, slowing rescue and containment.

**Phases:** `authorize_baseline_exercise` - choose the emergency class, safety controls, and evaluation goals; `observe_combined_failure` - run the exercise and establish where movement, custody, communication, or authority conflicts; `approve_revisions` - define common priorities, role boundaries, and exception calls; `departmental_practice` - allow each team to train its revised part; `integrated_retest` - run a non-identical scenario and review the combined result.

**Visibility:** The broad readiness concern and baseline exercise are visible. Specific failure points emerge from the exercise. Retest complications remain undiscovered until the revised plan is ready.

**Valid approaches:** Command-observed drill; delegated exercise controller; joint after-action review; revised casualty corridor; unified scene command; shared callout or triage priority.

**Does not complete:** A tabletop discussion alone; repeating the exact scripted drill; optimizing one department at the expense of the emergency objective; surprise testing designed to embarrass crews.

**Completion evidence:** Accepted story records a safe baseline, at least one genuine interdepartmental conflict, authorized revisions, departmental preparation, and improved combined performance under a meaningfully altered retest.

**Computer help:** Provide authorized emergency roles, drill-safety constraints, and observed interlock categories; suggest exercise structure and debrief questions; never simulate results before play or reveal hidden mission vulnerabilities.

**Variations:** Hull breach with casualties; fire near a secured area; evacuation through a damage-control zone; loss of normal communications; hazardous-area rescue without invented technical specifics.

**Anchor:** The exercise region or `central`.

**Narrator limits:** No real casualties, secret incompetence, punitive surprise, or invented deck geometry. Training errors remain bounded unless player choices credibly create consequences.

**Invalidation:** If a real emergency interrupts, preserve completed preparation and block the next exercise. Accepted real-world combined success may satisfy validation only when it tests the authored revisions without requiring retroactive facts.

**Reuse:** Very long cooldown; change emergency class, teams, region, and primary coordination failure.

## 35. Refit Under Load

**ID/version:** `cohesion.l3.refit-under-load.v1`

**Profile:** Level 3; primary Systems and logistics; secondary Interdepartmental coordination and Training and preparedness.

**Bindings:** One campaign-authored refitted system or integration target, its technical owner, two or more consuming departments, an approved load profile, a safe temporary limitation, and authoritative evidence or capability linkage.

**Eligible when:** Campaign data defines the refit or capability state, the system is individually functional, realistic linked demand remains unvalidated, and command can allocate a test window.

**Excluded when:** The generator would invent a refit, technical specification, fault, capability, or certification requirement; the system is failed; an existing authored Ship task already owns the exact work unless explicit migration maps it here.

**Player-facing situation:** A refitted system works on its own but has not been proven while multiple departments depend on it at realistic demand.

**Command objective:** Choose an acceptable test risk, coordinate consumers, oversee the integrated load, and act on the findings.

**Why it matters:** Resolution removes the refit's specific operating restriction and can restore a high-demand or automated capability that remains unavailable while integration is unproven.

**Operational condition:** `refit_integration_unproven` - the affected capability cannot safely use its highest-demand or most automated operating mode.

**Phases:** `review_evidence_gap` - establish what has passed, what remains unproven, and which departments depend on it; `authorize_load_plan` - choose load, window, abort limits, observers, and temporary operating restrictions; `prepare_departments` - delegate setup and allow required crew work and accepted story time; `conduct_integrated_test` - run the load and record bounded results through authoritative evidence; `resolve_findings` - accept the result, authorize a correction and retest, or retain a narrower limitation with an explicit next action.

**Visibility:** Authored system identity, known evidence gap, and present limitation are visible. Test findings and corrective work remain undiscovered until produced.

**Valid approaches:** Controlled combined-load test; staged load increase; isolate one interaction; accept a temporary mission limitation to gain a safer test window; delegate technical execution while commanding risk and priorities.

**Does not complete:** Declaring confidence; personally repairing components; passing individual component checks; narrating a successful test without authoritative evidence; bypassing an existing capability contract.

**Completion evidence:** Accepted, source-bound story evidence records the approved plan, participating departments, conducted test, result, and closure of the exact authored evidence gap. If the result finds a problem, the issue resolves only after a supported correction and validation or an authored supersession converts it to a different visible task without double debt.

**Computer help:** Summarize campaign-authored passed evidence, missing validation, consuming departments, and allowed test categories; suggest staged risk decisions; never invent system behavior, test results, or certification.

**Variations:** Integrated sensor processing; combined-load power distribution; failover under sustained demand; refit-era control routing; campaign-authored Systems Integration or Sensor Calibration work.

**Anchor:** The authored system region, often engineering, central, or forward.

**Narrator limits:** All technical facts, evidence IDs, capability changes, and results must come from campaign definitions or accepted authoritative outcomes. No spontaneous fault or miracle repair.

**Invalidation:** If authored capability state changes, deterministically re-evaluate the evidence gap. Retire and restore debt if already validated; supersede through an authored mapping if the system fails or the evidence contract changes.

**Reuse:** Only for a different authored integration target or a new versioned validation gap; no generic recurrence on the same refit.

## 36. Three Watches, Three Ships

**ID/version:** `cohesion.l3.three-watches-three-ships.v1`

**Profile:** Level 3; primary Interdepartmental coordination; secondary Training and preparedness.

**Bindings:** Three duty watches serving the same operational function, each watch leader, two or more divergent practices, one shipwide standardization scope, and a cross-watch validation period.

**Eligible when:** The campaign supports at least three watch rotations and accepted routine permits distinct practices to have developed.

**Excluded when:** Only one mixed watch is affected, formal procedure already resolves all differences, or staffing makes cross-watch validation impossible in the current story window.

**Player-facing situation:** Each watch operates competently on its own, but the ship changes behavior when responsibility passes between them.

**Command objective:** Compare practices, preserve harmless strengths, standardize consequential behavior, and prove continuity across watch changes.

**Why it matters:** Resolution makes ship performance consistent across the day, so the player's available options no longer depend unpredictably on which watch is on duty.

**Operational condition:** `watch_to_watch_variability` - readiness, reporting, or response quality changes unpredictably at watch boundaries.

**Phases:** `observe_three_watches` - gather one representative practice and concern from each watch; `separate_style_from_standard` - identify which differences affect safety, information, or command intent; `authorize_common_standard` - set required practices and allowed flexibility; `watch_training_cycle` - allow leaders to brief and rehearse their crews; `validate_transitions` - review at least two handoffs involving all three watches and correct one residual issue if found.

**Visibility:** The broad variability is visible. Individual watch differences emerge through observation. Validation criteria become visible after the common standard is authorized.

**Valid approaches:** Watch-leader council; rotating observation; common handoff core with local flexibility; shared readiness drill; standardize triggers rather than every technique.

**Does not complete:** Declaring one watch the model for all; replacing watch leaders; writing an exhaustive script; validating only one watch in isolation.

**Completion evidence:** Accepted story records input from all watches, an explicit standard/flexibility boundary, completed crew preparation, and cross-watch transitions that meet the standard.

**Computer help:** Compare accepted watch practices and handoff outcomes, identify overlap, and suggest standard-versus-flexible distinctions; never stereotype a shift or invent performance records.

**Variations:** Bridge watch; engineering watch; security response watch; flight operations; shipwide status handoff.

**Anchor:** `central` or the shared duty region.

**Narrator limits:** No watch is inherently lazy, elite, reckless, or disloyal. Do not invent failures, rivalries, or exact staffing.

**Invalidation:** If a watch is dissolved, explicit supersession may convert the issue to The Blended Watch at adjusted debt only through an authored migration; temporary staffing shortages block validation but preserve progress.

**Reuse:** Once per operational function per major arc; all watches and divergence categories must materially differ on reuse.

## 37. The Drill Nobody Trusts

**ID/version:** `cohesion.l3.drill-nobody-trusts.v1`

**Profile:** Level 3; primary Training and preparedness; secondary Personnel and welfare.

**Bindings:** One shipboard readiness program, at least three representative crew roles or departments, one accepted reason prior drills lack credibility, a safe exercise design, and one improvement finding.

**Eligible when:** Accepted routine or generated non-sensitive history can establish predictable, irrelevant, or consequence-free prior exercises without inventing a disaster.

**Excluded when:** The distrust would require misconduct by a named instructor, prior casualties, trauma, deception, or an active real emergency.

**Player-facing situation:** Crew members treat an important drill as theater because its old format does not reflect their real constraints or lead to visible change.

**Command objective:** Hear why the program lacks credibility, authorize a fair and realistic exercise, protect it from becoming punitive, and act on what it reveals.

**Why it matters:** Resolution makes training results meaningful again, improving real readiness while proving that the commander's exercises lead to institutional change rather than theater.

**Operational condition:** `training_program_not_credible` - crews comply with scheduled drills but do not transfer lessons into demanding operations.

**Phases:** `gather_crew_concerns` - hear multiple roles and identify the credibility failure; `design_credible_exercise` - set purpose, realism, safety, evaluator boundaries, and protection from punitive misuse; `conduct_exercise` - run the exercise with at least one meaningful but bounded uncertainty; `publish_findings` - distinguish crew performance from system or procedure problems; `act_on_finding` - authorize and later confirm one visible improvement.

**Visibility:** Distrust and participating roles are visible. Exact exercise injects and findings remain hidden until their phases to prevent gaming and spoilers.

**Valid approaches:** Listening sessions; anonymous or representative feedback; transparent evaluation criteria; crew-informed scenario design; independent observers; visible command follow-through.

**Does not complete:** A harder surprise drill; demanding enthusiasm; punishing candid feedback; running the exercise without acting on any finding.

**Completion evidence:** Accepted story records representative concerns, a credible non-punitive design, completed exercise, honest findings, and one implemented improvement recognized by affected crew.

**Computer help:** Summarize safe feedback categories and prior drill structure, suggest design safeguards and follow-through options, and withhold undiscovered exercise injects.

**Variations:** Damage control; evacuation; small-craft response; bridge casualty; communications loss; departmental continuity.

**Anchor:** `central` or primary training region.

**Narrator limits:** Do not invent trauma, deaths, malicious instructors, hidden dissent, or universal crew cynicism. Feedback must be bounded and role-relevant.

**Invalidation:** If a real event credibly validates the same training revisions, it may satisfy `conduct_exercise` and `publish_findings` only through accepted evidence. If operations prevent safe training, keep the actionable design or scheduling step visible.

**Reuse:** Once per training program per major arc; vary exercise class and credibility failure.

## 38. Power, Sensors, and Priorities

**ID/version:** `cohesion.l3.power-sensors-priorities.v1`

**Profile:** Level 3; primary Systems and logistics; secondary Interdepartmental coordination.

**Bindings:** Three or more departments, one shared scarce operating resource, at least two maintenance or access needs, one temporary limitation, a sequencing owner, and a coordinated-work validation.

**Eligible when:** Campaign-authored ship capabilities support the shared resource and multiple non-emergency work items can safely compete for it.

**Excluded when:** The scarcity is caused by an active mission emergency, requires invented technical limits, or one task has an authored priority that removes the command decision.

**Player-facing situation:** Several departments need the same power margin, maintenance window, access route, or sensor time, and their work cannot safely proceed independently.

**Command objective:** Understand dependencies, choose a transparent sequence, accept a bounded temporary limitation, and oversee coordinated completion.

**Why it matters:** Resolution clears several linked readiness constraints at once and gives the player control over which temporary limitation the ship accepts to get there.

**Operational condition:** `shared_resource_work_conflict` - all affected work remains partially deferred, keeping several capabilities below their routine readiness.

**Phases:** `map_dependencies` - establish each need, duration category, prerequisites, and consequence of delay; `choose_sequence` - prioritize work, name the temporary limitation, define abort criteria, and assign coordination ownership; `prepare_work` - allow departments to stage personnel and resources after authorization; `execute_sequence` - conduct the ordered work across accepted story time; `confirm_readiness` - verify restored access and remove the declared temporary limitation.

**Visibility:** Departments, shared resource, and current condition are visible. Exact technical steps and findings remain the crew's work and appear only when accepted story establishes them.

**Valid approaches:** Staged access; combine compatible work; defer one lower-priority function; alternate power or sensor schedule; assign a coordination officer; split preparation from scarce-resource use.

**Does not complete:** Granting every request simultaneously; personally performing technical work; hiding the temporary cost; narrating completion before crew time passes.

**Completion evidence:** Accepted story records all material dependencies, an explicit ordered plan and limitation, authorized execution across sufficient story time, and confirmation that the shared resource and affected functions are ready.

**Computer help:** Present campaign-authorized dependency and schedule categories, identify conflicts, and outline sequencing options and their visible tradeoffs; never choose priorities or invent technical consequences.

**Variations:** Power margin; sensor-array access; computer-core diagnostic time; shuttle-bay access; environmental shutdown window; specialist team availability.

**Anchor:** The shared system region, otherwise `central`.

**Narrator limits:** Do not invent exact power figures, failures, component behavior, or guaranteed completion times. Every tradeoff must stay within authored capabilities.

**Invalidation:** If a mission consumes the shared resource, preserve planning and expose postponement or reprioritization as the blocker. If any work item completes independently, deterministically rebuild the remaining sequence without changing owned debt.

**Reuse:** Very long cooldown; vary shared resource, department set, and priority conflict.
