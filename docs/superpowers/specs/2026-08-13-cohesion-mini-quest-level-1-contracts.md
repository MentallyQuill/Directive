# Cohesion Mini-Quest Level 1 Contracts

**Status:** Complete generator-ready design contracts for templates 1-20, pending user review.

**Date:** 2026-08-13

These contracts inherit the shared semantics in the [Cohesion Mini-Quest Template Catalog](./2026-08-13-cohesion-mini-quest-template-catalog.md). Each issue owns one ring segment and restores 5 Cohesion. Both short phase labels are visible at creation, while the facts learned inside them remain undiscovered until accepted play establishes them. The phases may complete in one accepted scene when the story establishes both the command decision and its credible immediate result.

## 1. The Missed Watch

**ID/version:** `cohesion.l1.missed-watch.v1`

**Profile:** Level 1; primary Personnel and welfare; secondary Training and preparedness.

**Bindings:** One duty department, one eligible background crewmember, their watch supervisor, and a duty station.

**Eligible when:** The campaign can supply a routine watch and an unbound background crewmember; ordinary coverage matters; the commander can reach the crewmember or supervisor.

**Excluded when:** The absence is already part of an authored emergency, crime, disappearance, medical event, or named-character story.

**Player-facing situation:** A crewmember missed or arrived late for watch, forcing an improvised replacement. The reason is not yet established.

**Command objective:** Establish the cause, respond proportionately, and restore reliable coverage.

**Why it matters:** Resolution returns dependable staffing to this watch, preventing a future taxed scene from losing a qualified crewmember or suffering a coverage delay.

**Operational condition:** `watch_coverage_unreliable` - when this department is taxed, one qualified crewmember is diverted or its response is delayed.

**Phases:** `understand_absence` - hear the crewmember or supervisor and establish the bounded cause; `restore_coverage` - set a fair expectation, support, schedule change, or corrective step and confirm the next watch is covered.

**Valid approaches:** Private conversation; supervisor-led inquiry with command review; temporary coverage plus a clear follow-up; coaching or proportionate correction.

**Does not complete:** Punishment without establishing cause; personally taking the watch; accepting an unexplained promise with no coverage plan.

**Completion evidence:** Accepted story establishes both a reason command may legitimately know and a credible arrangement for the next affected watch.

**Computer help:** Identify the missed watch, current coverage, and who can clarify the cause; suggest speaking privately, checking the roster, or involving the supervisor; never guess why the crewmember was absent.

**Variations:** Roster confusion; accumulated fatigue; unfamiliar reassignment; an authorized but poorly communicated personal need.

**Anchor:** The bound department's region, otherwise `central`.

**Narrator limits:** Do not invent misconduct, addiction, romance, family crisis, illness, or deception. Do not make discipline the presumed correct answer.

**Invalidation:** If an authored event explains or supersedes the absence, retire the issue; if coverage becomes impossible because of a larger emergency, keep the issue visible with `restore_coverage` blocked by that emergency.

**Reuse:** Moderate cooldown; never repeat the same crewmember, supervisor, and department combination within the same campaign arc.

## 2. New to the Ship

**ID/version:** `cohesion.l1.new-to-ship.v1`

**Profile:** Level 1; primary Personnel and welfare; secondary Interdepartmental coordination.

**Bindings:** One recent-transfer background crewmember, their department, supervisor, and one eligible peer or team context.

**Eligible when:** A recent transfer or newly instantiated background crewmember can be established without contradicting the roster; the commander can arrange contact or inclusion.

**Excluded when:** Campaign data already establishes the person as fully integrated, unavailable, or central to another active personnel issue.

**Player-facing situation:** A recent transfer is meeting formal requirements but is being left outside the team's informal flow of information.

**Command objective:** Give the crewmember a credible route into the team without forcing friendship or public embarrassment.

**Why it matters:** Resolution removes the team's context tax and creates a new reliable working connection the commander can encounter in later shipboard play.

**Operational condition:** `newcomer_context_gap` - the bound team loses time repeating context or risks overlooking one contribution.

**Phases:** `identify_gap` - learn where integration is failing; `create_connection` - establish a sponsor, shared duty, briefing practice, or appropriate invitation and confirm that the person has access to needed context.

**Valid approaches:** Speak with the newcomer; coach the supervisor; assign a peer sponsor; include them in meaningful work or a voluntary social opportunity.

**Does not complete:** Ordering the crew to like them; holding a ceremonial welcome with no working connection; transferring the newcomer away merely to remove discomfort.

**Completion evidence:** Accepted story identifies the practical exclusion and creates one specific, consent-respecting connection that the newcomer can use.

**Computer help:** Explain who supervises the crewmember, which routines they miss, and low-pressure ways to connect them; never diagnose loneliness or hostility.

**Variations:** Missed informal briefings; unfamiliar ship custom; shift mismatch; specialist jargon excluding the newcomer.

**Anchor:** The bound department's region, otherwise `central`.

**Narrator limits:** Do not invent prejudice, hazing, trauma, romance, or a personality defect. Participation in recreation remains voluntary.

**Invalidation:** Retire if the person transfers away or accepted play independently establishes their integration; rebind is forbidden after creation.

**Reuse:** Moderate cooldown; vary department, peer context, and source of the context gap.

## 3. Message From Home

**ID/version:** `cohesion.l1.message-from-home.v1`

**Profile:** Level 1; primary Personnel and welfare; secondary Systems and logistics.

**Bindings:** One background crewmember, their supervisor, a duty obligation, and a bounded support or scheduling need.

**Eligible when:** A background crewmember can be assigned a minimal family or home-contact fact and a manageable request without touching an authored character history.

**Excluded when:** The premise would require bereavement, abuse, illness, legal jeopardy, estrangement, romance, or another sensitive history not authored by the campaign.

**Player-facing situation:** A crewmember received a message from home and asks for a bounded accommodation while an ordinary duty still needs coverage.

**Command objective:** Protect the person's legitimate need and maintain credible duty coverage.

**Why it matters:** Resolution keeps the department covered while showing the crew that command can protect ordinary personal needs without treating them as operational failures.

**Operational condition:** `personal_need_coverage_strain` - the department operates with fragile coverage until the request is decided.

**Phases:** `hear_request` - establish only the details command needs; `balance_need_and_duty` - approve, modify, or decline the request with a humane rationale and a workable coverage plan.

**Valid approaches:** Private conversation; schedule swap; temporary relief; protected communication time; supervisor-supported alternate arrangement.

**Does not complete:** Demanding private details; granting leave without coverage; dismissing the request solely because it is personal.

**Completion evidence:** Accepted story records a clear command decision, communicates it respectfully, and accounts for the affected duty.

**Computer help:** Provide the duty schedule, available coverage categories, and the minimum information command requires; never reveal or infer the message's private content.

**Variations:** Time-sensitive call; family ceremony; administrative matter; limited communication window.

**Anchor:** Crew-area or bound department region, otherwise `central`.

**Narrator limits:** Do not bind established named characters without explicit authorization. Do not invent family conflict, depression, a breakup, or a crisis.

**Invalidation:** Retire if the communication window passes before visibility or the need is independently resolved; after visibility, report that the request was withdrawn or resolved before restoring debt.

**Reuse:** Long cooldown per crewmember; vary the non-sensitive need and duty constraint.

## 4. Credit Where It Is Due

**ID/version:** `cohesion.l1.credit-where-due.v1`

**Profile:** Level 1; primary Personnel and welfare; secondary Interdepartmental coordination.

**Bindings:** One junior background crewmember or small team, their supervisor, a completed contribution, and the report or briefing that obscured it.

**Eligible when:** The generator can create a modest completed contribution compatible with current ship activity and the commander can verify its authorship.

**Excluded when:** Recognition would disclose classified, medically private, disciplinary, or undiscovered mission information.

**Player-facing situation:** Useful work reached command without the names of the people who actually solved the problem.

**Command objective:** Verify the contribution and make recognition accurate, proportionate, and visible to the right people.

**Why it matters:** Resolution restores willingness to volunteer ideas and lets the player's recognition visibly strengthen trust across rank lines.

**Operational condition:** `contribution_trust_eroded` - the team is less willing to volunteer initiative or candidly share work across rank lines.

**Phases:** `verify_contribution` - establish what was done and by whom; `recognize_accurately` - correct the record, acknowledge the work, or create an appropriate opportunity.

**Valid approaches:** Review the report; ask the supervisor and team; offer private or public recognition suited to the contribution; correct attribution without humiliating the supervisor.

**Does not complete:** Generic praise; an unverified award; blaming someone before understanding how attribution was lost.

**Completion evidence:** Accepted story verifies the contribution and records a specific act of recognition or corrected attribution.

**Computer help:** Point to the originating report, eligible witnesses, and recognition channels; do not declare who deserves credit before verification.

**Variations:** Troubleshooting insight; efficient logistics fix; strong mentoring moment; useful observation omitted from a summary.

**Anchor:** The contributing team's region, otherwise `central`.

**Narrator limits:** Do not invent theft, malice, rivalry, or promotion eligibility. Recognition must remain proportionate.

**Invalidation:** If authorship cannot be established from accepted facts, retire without assigning blame; if the record is corrected independently, resolve only when the acknowledgment reaches the contributor.

**Reuse:** Moderate cooldown; vary department, contribution type, and recognition channel.

## 5. The Handoff Gap

**ID/version:** `cohesion.l1.handoff-gap.v1`

**Profile:** Level 1; primary Interdepartmental coordination; secondary Training and preparedness.

**Bindings:** Two adjacent watches or departments, one routine information object, and representatives from each side.

**Eligible when:** Both groups share a recurring handoff and can participate in a short clarification.

**Excluded when:** The missing information is part of an active mission secret or the dispute is already represented by a higher-level coordination issue.

**Player-facing situation:** A recurring term or status label means different things on either side of a routine handoff.

**Command objective:** Establish one shared meaning and a reliable handoff check.

**Why it matters:** Resolution removes repeated clarification and makes the affected operational information faster and more dependable in later scenes.

**Operational condition:** `handoff_information_loss` - the receiving group must reconfirm routine information or risks acting on the wrong assumption.

**Phases:** `locate_ambiguity` - compare the two interpretations; `standardize_handoff` - choose shared wording or a check-back and use it once.

**Valid approaches:** Joint conversation; sample handoff review; concise glossary; read-back protocol; assigning one owner to revise the briefing form.

**Does not complete:** Ordering both sides to communicate better; choosing terminology without hearing both uses; rewriting an entire manual.

**Completion evidence:** Accepted story names the ambiguity, records the shared convention, and shows or schedules one credible use.

**Computer help:** Display the two current formulations and identify representatives who can reconcile them; do not decide the operational meaning without command or subject-matter input.

**Variations:** Readiness labels; maintenance status; sensor confidence; custody state; watch-priority shorthand.

**Anchor:** Between the two bound regions, otherwise `central`.

**Narrator limits:** Do not turn the gap into sabotage, incompetence, or a hidden catastrophe.

**Invalidation:** Retire if an authored procedure update resolves the ambiguity; supersede into a higher-level issue only through an explicit rule without duplicating debt.

**Reuse:** Moderate cooldown; do not repeat either the same information object or department pair consecutively.

## 6. Who Owns the Next Step?

**ID/version:** `cohesion.l1.next-step-owner.v1`

**Profile:** Level 1; primary Interdepartmental coordination; secondary Systems and logistics.

**Bindings:** Two departments, one bounded pending action, and one representative from each.

**Eligible when:** A routine cross-department action can be safely deferred long enough for command clarification.

**Excluded when:** Formal regulation already assigns unambiguous ownership or delay would create an immediate emergency.

**Player-facing situation:** Two departments each reasonably believe the other owns the next step, leaving minor work stalled.

**Command objective:** Assign accountable ownership and a clear handoff without manufacturing blame.

**Why it matters:** Resolution puts the stalled work back into motion and prevents the same responsibility gap from consuming command attention.

**Operational condition:** `cross_department_work_stalled` - the bounded work remains unavailable and consumes follow-up attention.

**Phases:** `trace_responsibility` - establish where the handoff stopped; `assign_owner` - name the responsible role, supporting role, and next check.

**Valid approaches:** Joint clarification; consult procedure; assign a temporary owner and later revise policy; split responsibility with an explicit acceptance point.

**Does not complete:** Doing the work personally; telling both departments to handle it; assigning blame without an ownership rule.

**Completion evidence:** Accepted story identifies one accountable role, one next action, and how the receiving side will know the handoff occurred.

**Computer help:** Summarize the current workflow and where custody becomes ambiguous; suggest temporary assignment, procedural review, or a defined acceptance signal.

**Variations:** Calibration approval; supply pickup; maintenance sign-off; data review; compartment release.

**Anchor:** Between the bound department regions.

**Narrator limits:** Do not invent negligence, corruption, or deliberate obstruction.

**Invalidation:** Retire if the pending action is canceled; if a mission makes it urgent, keep it visible and update the next step to the mission-safe ownership decision.

**Reuse:** Moderate cooldown; vary department pair and workflow object.

## 7. One Bad Drill Habit

**ID/version:** `cohesion.l1.bad-drill-habit.v1`

**Profile:** Level 1; primary Training and preparedness; secondary Personnel and welfare.

**Bindings:** One rookie or small background-crew team, one supervisor or instructor, one routine drill, and one correctable shortcut.

**Eligible when:** The campaign supports the drill and a safe practice setting; the shortcut can be described without creating undisclosed past harm.

**Excluded when:** The behavior is deliberate misconduct, already caused a serious incident, or requires a formal disciplinary investigation.

**Player-facing situation:** A trainee repeatedly uses a shortcut that works in easy practice but would fail under pressure.

**Command objective:** Correct the habit through clear expectation, coaching, and one safe demonstration.

**Why it matters:** Resolution makes the affected team dependable in the trained role when conditions become less forgiving.

**Operational condition:** `known_training_vulnerability` - the bound team cannot be relied upon for the affected drill role under changing conditions.

**Phases:** `observe_habit` - establish what the shortcut is and why it is unsafe; `coach_and_confirm` - coach or delegate coaching and observe one correct repetition.

**Valid approaches:** Observe directly; ask the instructor to demonstrate; private coaching; redesign one drill beat to expose the shortcut safely.

**Does not complete:** Public humiliation; a lecture with no practice; removing the trainee permanently from the role.

**Completion evidence:** Accepted story identifies the habit, communicates the correct standard, and shows one credible corrected repetition.

**Computer help:** Explain the drill standard and available instructors; suggest observation, coaching, and a safe retest; never label the trainee careless or unfit.

**Variations:** Skipped equipment check; incomplete read-back; unsafe positioning; premature assumption of all-clear.

**Anchor:** The drill location or department region.

**Narrator limits:** Do not invent prior injuries, disciplinary history, or broad incompetence.

**Invalidation:** Retire if the trainee changes assignment before visibility; after visibility, allow a replacement trainee only through an explicit supersession that preserves no prior personal facts.

**Reuse:** Moderate cooldown; change trainee, drill, and habit.

## 8. The Maintenance Window

**ID/version:** `cohesion.l1.maintenance-window.v1`

**Profile:** Level 1; primary Systems and logistics; secondary Interdepartmental coordination.

**Bindings:** One serviceable system or compartment, Engineering or another maintenance owner, one affected department, and a bounded access window.

**Eligible when:** Maintenance is useful but not an immediate emergency; the affected department can negotiate timing or an alternate arrangement.

**Excluded when:** The system is already failed, the work is a mission-critical authored repair, or no safe window exists in current story time.

**Player-facing situation:** Necessary maintenance keeps slipping because another department cannot conveniently release access.

**Command objective:** Choose a safe time and acceptable temporary limitation so the crew can do the work.

**Why it matters:** Resolution removes the command-created access blocker so the responsible crew can perform the maintenance before routine deferral becomes a real capability restriction.

**Operational condition:** `maintenance_deferred_by_access` - the work cannot begin, its crew and affected department keep renegotiating access, and continued delay may create a later authored restriction.

**Phases:** `surface_constraints` - hear maintenance and operational needs; `authorize_and_release` - set timing, access, and coverage, then confirm the responsible crew receives the promised access.

**Valid approaches:** Reschedule lower-priority activity; arrange alternate equipment or space; accept a bounded service interruption; split preparation from downtime.

**Does not complete:** Ordering immediate shutdown without hearing constraints; personally repairing the system; postponing it indefinitely.

**Completion evidence:** Accepted story establishes a feasible window, affected-party acknowledgment, authorized temporary operating limits, and confirmation that access begins or is handed to the responsible crew. Technical maintenance results remain governed by their own evidence.

**Computer help:** Provide requested duration, affected functions, and schedule conflicts; suggest alternate windows or substitute resources; never certify technical safety beyond authored data.

**Variations:** Sensor access; environmental service; shuttle bay equipment; diagnostic isolation; compartment inspection.

**Anchor:** The bound system or compartment region.

**Narrator limits:** Do not invent imminent catastrophic failure or claim maintenance is complete when only scheduled.

**Invalidation:** Retire if maintenance completes independently; if an emergency consumes the window, return `authorize_and_release` to current with the accepted cause preserved.

**Reuse:** Short-to-moderate cooldown; vary system and affected department.

## 9. The Missing Pet

**ID/version:** `cohesion.l1.missing-pet.v1`

**Profile:** Level 1; primary Shipboard life; secondary Personnel and welfare.

**Bindings:** One background crewmember owner, one campaign-permitted pet type, one non-hazardous last-known area, and one affected shipboard group.

**Eligible when:** Campaign norms allow personal animals and a bounded search can occur without inventing biosecurity or safety hazards.

**Excluded when:** No pets are permitted, the animal would be inherently dangerous, or the premise conflicts with an active emergency or quarantine.

**Player-facing situation:** A crewmember's pet escaped into a shared or operational area, disrupting work and worrying its owner.

**Command objective:** Organize a proportionate search, protect ship operations, and return or safely contain the animal.

**Why it matters:** Resolution returns attention to the affected area and gives the player a personal, memorable way to show what kind of commander they are.

**Operational condition:** `localized_search_disruption` - the affected area loses a small amount of attention until the animal is found.

**Phases:** `bound_search` - establish last-known area, safe search limits, and responsibilities; `recover_pet` - locate and safely return or contain the animal.

**Valid approaches:** Delegate a search; use ship sensors where plausible; coordinate access; participate personally; create a quiet lure or containment plan.

**Does not complete:** Closing the issue because it seems trivial; ordering an unrestricted shipwide search; inventing a dangerous chase.

**Completion evidence:** Accepted story establishes a bounded plan and the animal's safe recovery or containment.

**Computer help:** Give last-known location, safe access routes, and non-invasive search options; do not know the animal's current location unless accepted evidence or sensors establishes it.

**Variations:** Small mammal; bird-like companion; approved exotic pet; animal hiding near warmth, food, or a familiar voice.

**Anchor:** Last-known area, otherwise `central`.

**Narrator limits:** Do not injure or kill the pet, create contamination, or turn the owner into comic incompetence unless the player causes a supported consequence.

**Invalidation:** Retire if accepted play finds the animal before the callout appears; if the area becomes unsafe, keep the task visible with recovery blocked until access is safe.

**Reuse:** Long cooldown; never repeat the same owner, pet type, or area in one arc.

## 10. Holodeck Double Booking

**ID/version:** `cohesion.l1.holodeck-double-booking.v1`

**Profile:** Level 1; primary Shipboard life; secondary Personnel and welfare.

**Bindings:** Two legitimate background-crew groups, one recreation facility, two representatives, and one constrained time block.

**Eligible when:** The campaign has a reservable recreation space and both groups can accept a mediated alternative.

**Excluded when:** One booking is medical treatment, required training, or an authored mission use that already has priority.

**Player-facing situation:** Two groups were promised the same limited recreation period and each has a legitimate reason to value it.

**Command objective:** Reach a fair, face-saving arrangement that recognizes rest and community as real needs.

**Why it matters:** Resolution removes a small but real cooperation penalty and protects access to the recreation that keeps a long-range crew functional.

**Operational condition:** `recreation_conflict_resentment` - the involved groups cooperate less readily until the allocation feels fair.

**Phases:** `hear_both_groups` - establish each group's need and flexibility; `mediate_booking` - agree on time, alternate space, rotation, or shared use.

**Valid approaches:** Mediate directly; offer equivalent future access; split the block; locate a suitable alternate venue; use a transparent rotation.

**Does not complete:** Arbitrarily favoring rank; canceling both bookings; dismissing recreation as unimportant.

**Completion evidence:** Accepted story records an understood arrangement that both groups can reasonably follow.

**Computer help:** Provide reservation history, alternate spaces, and available times; suggest fair allocation methods; never rank one culture or activity as more worthy.

**Variations:** Team sport versus performance rehearsal; cultural gathering versus game; two different watch schedules; administrative duplication.

**Anchor:** Crew-area or recreation region, otherwise `central`.

**Narrator limits:** Do not invent cultural stereotypes, hostility, or policy violations.

**Invalidation:** Retire if one group withdraws before visibility; after visibility, a voluntary withdrawal may complete only if acknowledged without pressure and future access is clarified.

**Reuse:** Moderate cooldown; vary groups, activities, and remedy.

## 11. The Promotion Request

**ID/version:** `cohesion.l1.promotion-request.v1`

**Profile:** Level 1; primary Personnel and welfare; secondary Training and preparedness.

**Bindings:** One eligible background crewmember, their supervisor, a requested responsibility, and campaign-authored public service evidence.

**Eligible when:** The roster supports a plausible development request and command can review enough public duty information to respond.

**Excluded when:** Rank advancement rules, pending discipline, or classified performance facts would need to be invented.

**Player-facing situation:** A crewmember asks for greater responsibility and wants to know what command expects.

**Command objective:** Give a fair answer: an appropriate opportunity now or a concrete, attainable development path.

**Why it matters:** Resolution turns career uncertainty into visible progress, giving the player a chance to shape future crew capability without granting an automatic promotion.

**Operational condition:** `advancement_expectation_unclear` - the crewmember's initiative and trust in evaluation are reduced.

**Phases:** `review_readiness` - hear the request and review available evidence; `set_path` - grant a bounded opportunity or define specific preparation and a review point.

**Valid approaches:** Supervisor consultation; trial responsibility; mentoring assignment; explicit development criteria; justified deferral.

**Does not complete:** Automatic promotion; vague encouragement; denial without reasons or a path.

**Completion evidence:** Accepted story communicates a reasoned decision plus one specific opportunity, criterion, or scheduled review.

**Computer help:** Summarize public qualifications, available development opportunities, and relevant command policy; never reveal private evaluations or declare entitlement to promotion.

**Variations:** Watch qualification; team-lead opportunity; specialist certification; mentoring responsibility.

**Anchor:** The bound department region.

**Narrator limits:** Do not invent medals, failures, misconduct, ambitions, or resentment. Completion does not require granting advancement.

**Invalidation:** Retire if the person transfers or the requested role ceases to exist; preserve a visible player decision if already delivered and retire only the obsolete follow-up.

**Reuse:** Long cooldown per crewmember; vary responsibility and development route.

## 12. Mentor Mismatch

**ID/version:** `cohesion.l1.mentor-mismatch.v1`

**Profile:** Level 1; primary Personnel and welfare; secondary Training and preparedness.

**Bindings:** One junior background crewmember, one eligible mentor, their supervisor, and one professional-development need.

**Eligible when:** A mentoring relationship can be established as a routine assignment and both participants are available for command intervention.

**Excluded when:** The mismatch would require inventing harassment, discrimination, romance, medical facts, or serious misconduct.

**Player-facing situation:** A junior crewmember and assigned mentor are meeting, but their communication is not producing useful support.

**Command objective:** Restore effective professional support by resetting expectations, changing the format, or rematching them.

**Why it matters:** Resolution restores the junior crewmember's development path and reduces the chance that one unsupported role becomes a later readiness problem.

**Operational condition:** `mentoring_support_ineffective` - the junior's preparation for one responsibility advances slowly or inconsistently.

**Phases:** `identify_mismatch` - establish the practical communication problem; `reset_support` - agree on a better method, expectation, or mentor and one next contact.

**Valid approaches:** Speak separately or together; define concrete mentoring goals; change cadence; add a second resource; rematch without assigning fault.

**Does not complete:** Ordering personal compatibility; blaming one participant; ending support without replacement.

**Completion evidence:** Accepted story identifies the mismatch and establishes a specific, acknowledged support arrangement.

**Computer help:** Provide the formal mentoring goal and scheduling facts; suggest expectation-setting, alternate format, or rematching; never infer private feelings.

**Variations:** Feedback style; schedule mismatch; unclear goal; mentor lacks experience in the needed area.

**Anchor:** The shared department region, otherwise `central`.

**Narrator limits:** Do not invent hostility, bias, attraction, or psychological traits.

**Invalidation:** Retire if either participant transfers or the development need disappears; never silently substitute another person after visibility.

**Reuse:** Moderate cooldown; vary both participants and mismatch type.

## 13. No Relief on the Roster

**ID/version:** `cohesion.l1.no-relief-roster.v1`

**Profile:** Level 1; primary Personnel and welfare; secondary Systems and logistics.

**Bindings:** One overused qualified background crewmember, one duty role, their supervisor, and one possible relief or cross-training option.

**Eligible when:** A routine duty depends on one person more often than intended and a command-level workload decision is possible.

**Excluded when:** The shortage is already a shipwide fatigue issue, an authored casualty, or a role with canonically unique qualifications.

**Player-facing situation:** One qualified crewmember keeps covering the same duty because reliable relief has not been arranged.

**Command objective:** Protect immediate coverage while reducing unsustainable dependence on one person.

**Why it matters:** Resolution removes a single-person failure point and gives the ship more flexibility when the affected duty is needed under pressure.

**Operational condition:** `single_person_coverage_dependency` - absence of the bound crewmember would delay or limit the duty.

**Phases:** `confirm_dependency` - establish frequency, workload, and qualification gap; `provide_relief` - schedule relief, start cross-training, or reduce the duty burden.

**Valid approaches:** Roster change; temporary reassignment; cross-training; reduce nonessential demand; supervisor-owned coverage plan.

**Does not complete:** Praising the crewmember for continuing; ordering more overtime; personally filling the role without a sustainable plan.

**Completion evidence:** Accepted story establishes immediate coverage and a concrete step that reduces dependence.

**Computer help:** Provide recent coverage frequency, qualified alternates, and trainable roles; suggest roster, workload, or training interventions; never diagnose burnout.

**Variations:** Specialist console; small-craft certification; duty officer role; inventory or maintenance authorization.

**Anchor:** The duty station or department region.

**Narrator limits:** Do not invent medical exhaustion, grievance, or unique genius. Do not imply endless overtime is admirable.

**Invalidation:** If a roster change independently adds relief, resolve only when command confirms the sustainable arrangement; fold into The Long Watch only through explicit supersession.

**Reuse:** Moderate cooldown; vary role and department; do not bind the same crewmember twice in an arc.

## 14. A Needed Day Off

**ID/version:** `cohesion.l1.needed-day-off.v1`

**Profile:** Level 1; primary Personnel and welfare; secondary Systems and logistics.

**Bindings:** One background crewmember, their supervisor, one requested rest period, and one coverage option.

**Eligible when:** Accepted or generated duty history supports sustained ordinary work and the request can be handled without private medical facts.

**Excluded when:** Medical leave, acute impairment, punishment, or shipwide fatigue is the actual issue.

**Player-facing situation:** A crewmember asks for time away after sustained duty, but their supervisor is worried about coverage.

**Command objective:** Treat recovery as an operational requirement and arrange credible coverage.

**Why it matters:** Resolution protects both near-term readiness and the crew's confidence that sustainable work matters to command.

**Operational condition:** `rest_need_unresolved` - the team carries avoidable fatigue risk and fragile short-term coverage.

**Phases:** `assess_coverage` - identify the duty impact and available relief; `authorize_recovery` - approve a workable rest period or equivalent recovery plan, communicate coverage, and release the crewmember into that protected time.

**Valid approaches:** Schedule swap; temporary redistribution; protected off-duty block; postpone a nonessential task; authorize a shorter immediate break plus a later full period.

**Does not complete:** Telling the crewmember to endure; approving absence with no coverage; demanding a medical diagnosis.

**Completion evidence:** Accepted story provides a defined recovery period, a named coverage arrangement, and confirmation that the crewmember has entered protected off-duty time.

**Computer help:** Show the relevant schedule and qualified coverage categories; suggest swaps or workload deferral; never infer illness or emotional state.

**Variations:** Consecutive watches; interrupted prior leave; project deadline; rare qualification creating coverage tension.

**Anchor:** Crew-area or duty department region.

**Narrator limits:** Do not invent depression, breakdown, medical incapacity, or dereliction.

**Invalidation:** Retire if the crewmember receives adequate rest before visibility; if an emergency blocks the plan, preserve progress and expose rescheduling as the actionable blocker.

**Reuse:** Long cooldown per crewmember; vary duty and coverage remedy.

## 15. The Stale Standing Order

**ID/version:** `cohesion.l1.stale-standing-order.v1`

**Profile:** Level 1; primary Interdepartmental coordination; secondary Training and preparedness.

**Bindings:** One authored or safely generated older procedure, one current practice, one affected department, and one accountable authority role.

**Eligible when:** The conflict can be resolved through command interpretation without inventing law, classified orders, or critical technical facts.

**Excluded when:** The governing authority is external and currently unknowable, or the conflict belongs to an active mission choice.

**Player-facing situation:** A standing order from before the refit conflicts with the way a department now operates.

**Command objective:** Decide which expectation governs now and make the decision visible to everyone affected.

**Why it matters:** Resolution prevents inconsistent orders from narrowing the player's options or delaying crew action when the procedure matters.

**Operational condition:** `contradictory_operating_expectations` - personnel pause or choose inconsistently when the two rules collide.

**Phases:** `compare_orders` - establish the actual conflict and authority; `publish_clarification` - supersede, narrow, or temporarily interpret the old order and communicate it.

**Valid approaches:** Review both procedures; consult the responsible officer; issue an interim clarification; schedule formal revision while naming the current rule.

**Does not complete:** Quietly ignoring one order; telling staff to use judgment without a standard; rewriting unrelated policy.

**Completion evidence:** Accepted story identifies the governing expectation, its scope, and how affected personnel receive it.

**Computer help:** Present the conflicting text or safe summaries, dates, and responsible offices; never choose legal or command authority on its own.

**Variations:** Access protocol; report timing; inspection sequence; alert-state staffing; refit-era terminology.

**Anchor:** The affected department or system region.

**Narrator limits:** Do not invent Starfleet law, secret orders, or culpability.

**Invalidation:** Retire if an authored update resolves the conflict; if external clarification becomes necessary, keep visible only when requesting it is an actionable next step.

**Reuse:** Long cooldown for the same policy domain; vary department and conflict type.

## 16. The Missing Context

**ID/version:** `cohesion.l1.missing-context.v1`

**Profile:** Level 1; primary Interdepartmental coordination; secondary Training and preparedness.

**Bindings:** One sending group, one receiving group, one routine briefing artifact, and one omitted context category.

**Eligible when:** The omission can be safely generated from routine operations and the commander can convene or direct a briefing improvement.

**Excluded when:** The information is classified, intentionally compartmented, or part of an undiscovered campaign fact.

**Player-facing situation:** A routine briefing delivered facts but omitted the context another team needed to act correctly.

**Command objective:** Restore the missing context and establish a lightweight way to include it next time.

**Why it matters:** Resolution lets the receiving team act faster and with greater confidence instead of repeatedly escalating routine ambiguity to the player.

**Operational condition:** `briefing_context_incomplete` - the receiving group makes slower or less confident routine decisions.

**Phases:** `identify_omission` - establish what the receiver needed and why the sender omitted it; `repair_briefing` - supply the context and add one briefing prompt, owner, or confirmation step.

**Valid approaches:** Review the last briefing; bring both groups together; revise a concise template; add a receiver check-back.

**Does not complete:** Flooding the receiver with all available data; assigning blame; issuing a vague communication reminder.

**Completion evidence:** Accepted story names the missing context and creates a specific repeatable inclusion or confirmation practice.

**Computer help:** Compare the sent and needed information categories; suggest a briefing field, check-back, or owner; do not expose classified or undiscovered facts.

**Variations:** Operational intent; uncertainty level; downstream dependency; timing; reason for a priority.

**Anchor:** Between the sending and receiving regions.

**Narrator limits:** Do not invent deliberate concealment or consequential past failure.

**Invalidation:** Retire if the briefing is no longer used; supersede into a broader coordination issue only with explicit debt transfer.

**Reuse:** Moderate cooldown; vary groups and omitted context category.

## 17. The Unfamiliar Evacuation Route

**ID/version:** `cohesion.l1.unfamiliar-evacuation-route.v1`

**Profile:** Level 1; primary Training and preparedness; secondary Systems and logistics.

**Bindings:** One compartment or work group, one safe primary or alternate route, one supervisor, and one reason the route changed.

**Eligible when:** The campaign ship has a plausible route change from refit, reassignment, or compartment use and a safe walk-through can occur.

**Excluded when:** An evacuation is in progress, the route is currently hazardous, or exact deck geography is unavailable and cannot be abstracted safely.

**Player-facing situation:** A work group is uncertain which evacuation route applies after a change aboard ship.

**Command objective:** Clarify the route and verify that the affected people can use it.

**Why it matters:** Resolution removes a known emergency vulnerability and keeps a future evacuation scene from losing time to avoidable hesitation.

**Operational condition:** `localized_evacuation_uncertainty` - the group would hesitate or congest the area during an emergency.

**Phases:** `confirm_route` - establish the safe route and responsible guidance; `rehearse_route` - communicate and complete one walk-through or focused drill.

**Valid approaches:** Consult damage control; update local signage; brief the team; walk the route; delegate a short rehearsal and receive confirmation.

**Does not complete:** Posting a notice without confirming comprehension; inventing exact deck details; conducting an unsafe surprise alarm.

**Completion evidence:** Accepted story establishes the route and shows the affected group completing or credibly rehearsing it.

**Computer help:** Identify authorized route categories, changed access points, and the responsible safety role; do not fabricate deck numbers or certify an unsafe path.

**Variations:** Refit closure; changed assembly point; new duty space; alternate route after maintenance.

**Anchor:** The affected compartment region.

**Narrator limits:** Do not invent a fire, casualty, prior panic, or exact ship geography absent from campaign data.

**Invalidation:** If the route changes again, return `confirm_route` to current; retire if the group relocates before visibility.

**Reuse:** Long cooldown per region; vary work group and change reason.

## 18. The Replicator Queue

**ID/version:** `cohesion.l1.replicator-queue.v1`

**Profile:** Level 1; primary Systems and logistics; secondary Shipboard life.

**Bindings:** One overburdened service point, one duty-use group, one ordinary-use group, a service owner, and at least one alternative or priority rule.

**Eligible when:** A localized service bottleneck can exist without implying shipwide scarcity or a critical system failure.

**Excluded when:** Food, water, medical supply, or survival needs are actually threatened.

**Player-facing situation:** A heavily used replicator or service point is unavailable or overloaded, and duty needs are colliding with ordinary crew use.

**Command objective:** Establish a fair temporary priority and a practical route around the bottleneck.

**Why it matters:** Resolution restores predictable access, recovers lost crew time, and prevents a minor service problem from hardening into resentment.

**Operational condition:** `localized_service_bottleneck` - one group loses time and resentment grows around access.

**Phases:** `assess_demand` - establish legitimate uses, duration, and alternatives; `set_temporary_access` - publish a bounded priority, schedule, or substitute service.

**Valid approaches:** Reserved duty windows; alternate replicator; queue separation; temporary delivery; defer nonurgent bulk use.

**Does not complete:** Giving permanent privilege to rank; dismissing ordinary use; promising an unsupported repair time.

**Completion evidence:** Accepted story records a clear temporary rule, an available alternative, and communication to affected users.

**Computer help:** Provide service status, demand categories, and known alternatives; suggest scheduling or separation; do not invent scarcity or technical cause.

**Variations:** Galley replicator; fabrication station; laundry service; shared diagnostic terminal; tool issue point.

**Anchor:** The service point or `central`.

**Narrator limits:** Do not turn inconvenience into starvation, rationing, or class conflict without authored support.

**Invalidation:** Retire if service is restored before visibility; after visibility, restoration completes only once temporary restrictions are lifted and communicated.

**Reuse:** Moderate cooldown; vary service point and competing uses.

## 19. Quiet Hours

**ID/version:** `cohesion.l1.quiet-hours.v1`

**Profile:** Level 1; primary Shipboard life; secondary Personnel and welfare.

**Bindings:** Two background-crew watch groups, one adjacent quarters or shared-space context, and one supervisor or facilities representative.

**Eligible when:** Different schedules plausibly share an acoustic environment and a non-punitive operating standard is possible.

**Excluded when:** The disturbance is harassment, an emergency alarm, necessary maintenance with no alternative, or a medical accommodation requiring private disclosure.

**Player-facing situation:** Crew on different watches are disturbing one another's rest and beginning to resent the other group.

**Command objective:** Establish a workable quiet-hours or notification standard that respects both schedules.

**Why it matters:** Resolution improves rest and cooperation across watches, preserving crew effectiveness without demanding a technical repair.

**Operational condition:** `shift_rest_disrupted` - the affected groups carry mild fatigue and cooperate less readily.

**Phases:** `hear_schedule_conflict` - establish when and how disruption occurs; `set_shared_standard` - agree on quiet periods, alternate space, advance notice, or mitigation.

**Valid approaches:** Mediate representatives; adjust use times; designate an alternate area; add notice; request a bounded facilities mitigation.

**Does not complete:** Ordering total silence at all times; favoring the commander's watch; demanding private medical justification.

**Completion evidence:** Accepted story records a specific standard or arrangement acknowledged by both affected groups.

**Computer help:** Provide schedule overlap, shared-space rules, and available alternatives; suggest mediation or mitigation; never infer hostility or medical need.

**Variations:** Exercise space; music or rehearsal; equipment carts; social gathering; maintenance preparation.

**Anchor:** Crew-area region, otherwise `central`.

**Narrator limits:** Do not invent feuds, cultural stereotypes, insomnia, or misconduct.

**Invalidation:** Retire if schedules no longer overlap; if necessary emergency work creates temporary noise, preserve the standard and block completion until a durable arrangement is possible.

**Reuse:** Moderate cooldown; vary groups, source, and remedy.

## 20. A Place for the Gathering

**ID/version:** `cohesion.l1.place-for-gathering.v1`

**Profile:** Level 1; primary Shipboard life; secondary Systems and logistics.

**Bindings:** One background-crew group, one cultural or recreational activity category, one representative, one requested space and time, and at least one feasible alternative.

**Eligible when:** The activity can be described respectfully without inventing specific cultural doctrine and the commander can allocate ordinary shared resources.

**Excluded when:** The activity conflicts with safety, medical isolation, an active emergency, or an authored cultural fact.

**Player-facing situation:** A crew group wants to hold a meaningful gathering, but space and duty schedules do not currently align.

**Command objective:** Make a reasonable place for community while protecting operational needs.

**Why it matters:** Resolution gives the crew a real opportunity for connection and shows that Cohesion includes the social life that helps the ship endure long deployments.

**Operational condition:** `community_need_blocked` - the group loses a near-term opportunity for connection and feels overlooked by ship routine.

**Phases:** `understand_requirements` - establish size, timing, privacy, and basic space needs; `authorize_gathering` - allocate a suitable place and time or agree on an equivalent alternative.

**Valid approaches:** Adjust schedule; offer alternate room; split attendance across watches; protect a future time; ask the group to choose among feasible options.

**Does not complete:** Treating the gathering as frivolous; assigning an unsuitable space merely to clear the request; inventing ceremonial requirements.

**Completion evidence:** Accepted story records an appropriate, acknowledged arrangement that the group can actually use.

**Computer help:** List suitable spaces, capacity categories, and schedule conflicts; suggest viable options; never define the group's customs or speak for its preferences.

**Variations:** Cultural observance; hobby club; remembrance without invented bereavement details; team meal; performance or discussion group.

**Anchor:** Authorized gathering-space region, otherwise `central`.

**Narrator limits:** Do not invent religious beliefs, ethnic customs, trauma, or compulsory participation.

**Invalidation:** Retire if the group withdraws before visibility; after visibility, a rescheduled gathering remains unresolved until a feasible arrangement is accepted.

**Reuse:** Moderate cooldown; vary group, activity category, and resource conflict.
