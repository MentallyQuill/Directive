# Cohesion and Commander Mini-Quests

**Status:** Living design; core Cohesion, task-level, queue, Ship-page, and forty-template roster decisions are locked. The exact template contracts and Command Bearing targeting rule remain to be designed.

**Date:** 2026-08-13

## Purpose

Turn the Ship page into a commander-facing operational-cohesion loop rather than an engineering status dashboard.

The player commands a starship community. Their responsibility is not to personally repair every system. It is to keep people, departments, procedures, morale, training, logistics, and machinery working together. Ship work may involve a drill, a struggling crewmember, a disagreement between departments, a sensor-alignment effort, a maintenance problem that needs command support, or an ordinary shipboard-life problem such as a lost pet.

Every surfaced problem becomes a small, playable command story with a concrete effect on the ship. The player can see what needs attention, why it matters to them, what they can do next, and what they will restore or unlock by resolving it.

The central loop is:

1. a concrete issue creates Cohesion debt;
2. the issue owns every point of Cohesion it removes;
3. Directive surfaces up to five issues as commander mini-quests;
4. the player addresses them naturally through story play;
5. accepted outcomes resolve the issue and restore its Cohesion; and
6. queued issues move into view as command capacity becomes available.

## Relationship to the Existing Ship System

This design supersedes the player-facing dashboard and the prohibition on recurring degradation in `2026-08-12-ship-operational-affordances-design.md`.

It retains that design's strongest authority boundaries:

- accepted story remains the source of durable semantic progress;
- the model does not write arbitrary Ship state;
- deterministic code validates closed authored effects;
- Ship capabilities and mission interactions remain causal rather than generic bonuses;
- source invalidation, swipes, edits, saves, loads, and branches replay deterministically;
- SillyTavern's ordinary main-model generation owns narration;
- Directive adds no Ship narration sidecar or extra model call; and
- Directive's complete gameplay contract remains in its namespaced `directive.campaign.v1` context rather than depending on a SillyTavern preset.

The existing campaign-authored Systems Integration and Sensor Calibration work can become major Cohesion mini-quests. Their capabilities, constraints, milestone evidence, and mission dependency receipts remain useful. Their old system cards, state ladders, `Why this state` paragraphs, and separate constraints/capabilities sections do not remain on the primary Ship page.

## Product Principles

- Call the value **Cohesion**.
- Cohesion represents the ship working as one institution, not hull integrity or engineering condition alone.
- Every Cohesion loss has a concrete cause and a real mini-quest capable of restoring it. Visible tasks expose that cause; queued tasks remain private while their aggregate debt stays visible.
- Randomness may select an eligible issue and schedule its arrival. Randomness never determines whether a player action succeeds.
- The player is a commander. Every mini-quest must require prioritization, judgment, coordination, mentorship, welfare, delegation, follow-up, or another credible command responsibility.
- A technical task may invite the commander to assist, but it must not treat the player as the chief engineer.
- A person is not a broken component. Personnel quests reward humane command, support, trust, and restored team function rather than presenting emotional distress as something repaired for points.
- Every task must give the player a reason to care: a specific operational condition removed, Cohesion restored, a lasting capability unlocked, or a meaningful route opened.
- The page shows only work that the player can act on now or can advance by pursuing an explicit blocker.
- Undiscovered details stay hidden. Aggregate Cohesion debt never does.
- The visual design remains restrained: the ship, its Cohesion ring, at most five callouts, and one shared details panel.

## Cohesion Scale

Cohesion uses a 0–100 scale and is displayed as a twenty-segment ring around the ship. Each segment is worth five Cohesion points.

The player does not need to perform arithmetic. The ring is primary, while exact values support task rewards and accessibility copy.

| Ring state | Cohesion | Meaning |
| --- | ---: | --- |
| 18–20 filled segments | 90–100 | Exceptional: the ship is unusually prepared and resilient. |
| 14–17 filled segments | 70–85 | Ready: normal competent operation without a general Cohesion penalty. |
| 9–13 filled segments | 45–65 | Strained: relevant unresolved issues begin producing meaningful limitations under demand. |
| 0–8 filled segments | 0–40 | Critical: high-demand operations face serious restrictions, forced tradeoffs, or bounded failures. |

Cohesion changes in five-point increments, so no reachable value falls between those bands.

### Issue-Derived Authority

Cohesion is not a freely mutable score and does not decay by message count. It is derived from unresolved issue effects:

> `current Cohesion = 100 - total Cohesion owned by unresolved issues`

Every missing segment belongs to exactly one active or queued issue. A queued issue's details may remain hidden, but its contribution to the aggregate backlog is always disclosed. This guarantees that:

- Cohesion never falls for an invisible or unexplained reason;
- the ring can always account for its missing segments;
- resolving a quest restores the amount it promised;
- no task can disappear while leaving orphaned debt;
- one task cannot consume another task's recovery;
- replay can rebuild Cohesion from surviving accepted issue effects; and
- a superseded or invalid issue must restore its debt or explicitly transfer it to a replacement issue.

At zero Cohesion, ordinary issue generation stops. At very low Cohesion, generation slows sharply and the system prioritizes recovery rather than creating a death spiral.

## Mini-Quest Levels

The locked invariant is:

> **A Level N mini-quest owns N ring segments, costs 5N Cohesion, and restores 5N Cohesion when completed.**

Level measures scope and operational impact. It does not set a hidden success chance.

| Level | Ring segments | Cohesion | Expected story scope | Typical structure |
| --- | ---: | ---: | --- | --- |
| 1 | 1 | 5 | 1–2 scenes | One situation and one command response |
| 2 | 2 | 10 | 1–3 scenes | Understand the issue, then address it |
| 3 | 3 | 15 | 2–4 scenes | Coordinate several people, places, or stages |
| 4 | 4 | 20 | 3–4 substantial scenes | An ongoing effort involving delegation, waiting, and follow-up |

Scene counts are pacing targets, not counters. Directive validates authored milestones and outcomes rather than requiring a number of messages or scenes.

A player may concentrate time and resources to compress a larger quest into a day or two. Competent delegation is valid and expected. Delegation does not erase the quest's meaningful command decisions, follow-up, or accepted completion evidence.

### Example Level Shapes

#### Level 1: Immediate command attention

A new crewmember is repeatedly late to watch. The commander speaks with the crewmember or supervisor, establishes the immediate cause, and chooses an appropriate response.

Completion restores 5 Cohesion and removes the watch-reliability concern.

#### Level 2: Small coordination problem

Science and Operations record sensor anomalies differently. The commander identifies the broken handoff, establishes a shared procedure, and has the departments verify it.

Completion restores 10 Cohesion and removes inconsistent sensor reporting.

#### Level 3: Department-level effort

Rookie damage-control teams perform well independently but fail when Engineering and Security must coordinate. The commander observes a drill, identifies the cross-department problem, changes the procedure or team arrangement, and verifies the response.

Completion restores 15 Cohesion and establishes reliable coordinated damage control.

#### Level 4: Sustained command project

A broader readiness problem involves training, scheduling, equipment availability, and departmental confidence. The commander determines the causes, sets priorities, delegates work, allows in-world time to pass, and returns for a follow-up exercise or decision.

Completion restores 20 Cohesion, removes a major active limitation, and may grant a campaign-authored lasting capability.

## Quest Content

The initial library will contain forty structured templates:

- 20 Level 1 templates;
- 12 Level 2 templates;
- 6 Level 3 templates; and
- 2 Level 4 templates.

The intended starting rarity is approximately:

- Level 1: 50%;
- Level 2: 30%;
- Level 3: 15%; and
- Level 4: 5%.

Template count and selection weight remain separate, so Level 4 can stay rare despite having reusable variation.

The forty templates will span:

- training and preparedness;
- mentorship and personnel support;
- interdepartmental coordination;
- systems and logistics; and
- ordinary shipboard life.

Examples include rookie drills, performance support, team confidence, Science–Operations handoffs, Engineering coordination, maintenance scheduling, duty conflicts, community needs, family or home communication, shared-space problems, and a lost pet.

The approved roster, content balance, and first-pass behavior of all forty templates live in [Cohesion Mini-Quest Template Catalog](./2026-08-13-cohesion-mini-quest-template-catalog.md). The next design phase expands each approved entry into the exact template contract described below.

### Commander Test

Every template must answer: **Why does this require the commander?**

Valid answers include:

- setting competing priorities;
- allocating time, access, or resources;
- mediating departments or people;
- mentoring or supporting a crewmember;
- protecting crew welfare;
- setting responsibility and expectations;
- running or reviewing a drill;
- making a risk or policy judgment;
- following up on delegated work; or
- bringing roles together when no department can solve the problem alone.

A template that merely asks the player to perform technical labor fails this test.

### Template Contract

Each template will eventually define at least:

- stable template ID and version;
- level and Cohesion ownership;
- issue family and department affinities;
- eligibility and exclusion predicates;
- cooldown and reuse policy;
- allowed crew bindings;
- player-safe setup;
- why command attention is needed;
- current operational condition;
- credible approaches without prescribing one solution;
- named phases or milestones;
- accepted completion standard;
- Cohesion restored;
- optional lasting reward;
- bounded ship-computer guidance;
- approximate ship anchor region;
- facts the narrator must not invent; and
- invalidation or supersession behavior.

Random selection may bind controlled variations such as eligible background crew, ship region, department pairing, or surface premise. It may not invent an unbounded objective, completion rule, or reward.

## Crew and Personal-Story Boundary

Established major characters may participate only through situations permitted by campaign-authored facts and template eligibility. Directive must not randomly decide that a known officer has depression, a breakup, family trouble, loneliness, a secret, or another material trait that the campaign has not authorized.

Personal quests should use one of three safe sources:

1. an authored situation for a known character;
2. an authored secondary crewmember or background roster entry; or
3. a minimally defined new background crewmember instantiated through a bounded template.

Once a new crewmember and their public situation appear in accepted story, they become stable campaign facts rather than being regenerated on every prompt.

Valid command responses may include listening, adjusting duties, connecting someone with appropriate support, mentoring, resolving a workplace cause, creating community, or helping departments respond humanely. The reward is restored trust and team function, not a claim that command attention cures a medical or emotional condition.

## Issue Generation and Scheduling

Directive does not generate issues every fixed number of messages. Message counts do not represent story time: ten messages could describe seconds or days.

Instead, it schedules deterministic opportunity checks against accepted in-world time and meaningful story boundaries, including:

- a duty cycle passing;
- a mission beginning or ending;
- arrival at a new location;
- sustained stressful operation;
- completion of another Ship task;
- a relevant crew, capability, constraint, or system change; or
- a template-specific trigger becoming eligible.

Normal opportunity windows may use deterministic jitter, provisionally in a 12–36 ship-hour range. The selected future window persists with the timeline, so reloads and retries do not reroll it. Branches inherit or reconstruct the schedule at their exact accepted lineage.

At each eligible check:

1. Directive revalidates the current queue, backlog, Cohesion, campaign state, and exclusions.
2. It constructs the closed set of eligible templates.
3. It uses a deterministic shuffle bag to avoid obvious streaks in level, department, or family.
4. It creates at most one new issue.
5. The new issue receives stable bindings, level, owned Cohesion, and queue position.
6. Its Cohesion debt becomes active at the same durable boundary as the issue.
7. Directive schedules the next opportunity window.

The scheduler aims to keep roughly three visible tasks available, but it does not promise three. It never invents filler when no eligible template exists.

Additional safeguards:

- no more than one Level 4 issue may be active across the visible queue and backlog;
- no more than two combined Level 3–4 issues may be active;
- the same department or quest family should not repeat in an obvious streak;
- no issue may claim more unowned Cohesion than remains;
- ordinary generation stops at zero Cohesion; and
- Critical Cohesion favors recovery and defers routine new issues.

## Visible Queue and Hidden Backlog

The Ship page displays at most five task callouts. These are the five issues currently surfaced for command attention, not the complete set of unresolved problems aboard the ship.

Additional generated issues enter a durable backlog. A queued issue already:

- has a selected template, level, and stable bindings;
- owns its missing Cohesion segments;
- contributes to the current Cohesion band;
- retains a deterministic queue position; and
- survives reload, replay, save, load, and branch reconstruction.

The backlog may accumulate beyond five issues, subject to the finite 100-point Cohesion scale and the rule that every issue must own available segments.

### Hidden Details, Visible Debt

Queued issue details remain hidden until promotion. The player can still see the aggregate truth:

> **5 ACTIVE · 3 QUEUED**
>
> **30 Cohesion tied to queued issues**

The UI does not reveal queued task names, crew bindings, departments, premises, or solutions.

Missing segments owned by visible tasks have task-specific preview behavior. Missing segments owned by the backlog use one quiet neutral treatment. Hovering or focusing the backlog indicator highlights the aggregate backlog arc without revealing its contents.

### Promotion

When a visible task completes:

1. its exact segments refill;
2. its operational condition ends;
3. it moves into completed history;
4. the first valid queued issue is promoted;
5. its task details and callout become player-visible; and
6. its segments remain empty because their debt was already counted.

Promotion does not cause another Cohesion loss.

Before promotion, Directive revalidates eligibility against the current story. If the premise has become impossible, the issue retires and its Cohesion is restored. It may not silently change level, reward, premise, or crew binding.

### Queue Priority

The normal backlog is first-in, first-out, with two bounded exceptions:

- campaign-critical Ship work may move ahead of routine work; and
- an issue whose next action is immediately required by the current mission may move ahead of unrelated routine work.

Level alone does not determine priority.

Once the player makes meaningful accepted progress on a visible task, that task stays pinned until completed, invalidated, or explicitly superseded. The scheduler does not hide work the player has begun.

## Operational Effects and Rewards

Every mini-quest has two mandatory mechanical consequences:

1. while unresolved, it owns Cohesion debt and a specific operational condition; and
2. when resolved, it removes that condition and restores its Cohesion.

Major authored tasks may additionally unlock a permanent capability, remove a lasting constraint, or open a campaign route. Routine generated work should not always grant permanent powers, which would create reward inflation and farming.

Effects must remain causal. A lost pet does not lower sensor resolution. It may distract a section, expose a communication failure, or affect morale. A sensor-handoff issue may directly reduce the quality or speed of sensor reporting.

The Cohesion band controls how much unresolved issues strain the whole institution:

- at Ready, the crew usually compensates for ordinary problems;
- at Strained, relevant conditions produce meaningful limitations when a scene taxes the affected people or systems; and
- at Critical, demanding operations may require tradeoffs, lose bounded options, or fail in ways connected to active conditions.

Specific visible issue conditions enter the narration packet. Hidden backlog details do not. The aggregate Cohesion band may affect general resilience without leaking undiscovered premises.

Mission definitions may consume an exact Cohesion band or visible condition when a deterministic mission consequence requires it. Generic Cohesion must not become an unexplained universal success percentage.

## Command Bearing Relief

The quantitative value is locked:

> **One Command Bearing point can relieve up to 20 Cohesion points, equal to four ring segments or one Level 4 issue.**

This is intended as a scarce, high-impact recovery option when the player has accumulated substantial Cohesion debt.

The existing implemented `narrativeEdge` effect does **not** guarantee success. It creates one credible favorable opening or softens one immediate cost and explicitly cannot guarantee success, erase a consequence, or decide the player's action. The new Cohesion proposal must therefore not be documented as existing behavior.

Before implementation, the design must choose one exact integration:

1. **Single-issue resolution:** spend one point on a visible issue; one decisive player-authored command intervention succeeds and resolves up to 20 Cohesion owned by that issue.
2. **Bounded command initiative:** spend one point on a declared command initiative that may resolve up to 20 Cohesion across a compatible group of visible issues.
3. **Separate Cohesion relief effect:** preserve `narrativeEdge` unchanged and add a distinct Command Bearing spend available from the Ship page.

The 20-point ceiling is fixed. Targeting, eligible issue combinations, required narration, and whether this extends or supplements `narrativeEdge` remain intentionally open for the next design discussion.

Any final rule must preserve reserve, arm, provisional-response, acceptance, refund, replay, and invalidation custody. A point cannot silently clear hidden debt without a player-declared command action and an accepted causal result.

## Ship-Page Experience

The old banner image and dashboard cards are removed. The new transparent Breckenridge artwork becomes the central Ship-page asset and occupies approximately 90% of the usable content width.

The page is exclusively about actionable work. It contains no separate shipwide status summary, system ladder, `Why this state` section, generic gameplay-effect paragraph, undiscovered placeholder, active-constraints card wall, or capabilities inventory.

### Central Composition

- The Breckenridge is centered with generous negative space.
- The twenty-segment Cohesion ring surrounds it.
- Up to five task buttons sit in controlled left and right rails.
- Fine elbowed leader lines connect buttons to approximate system-associated regions.
- Anchors suggest a region; they do not claim to be an exact deck map.
- Selecting a task highlights its button, leader line, anchor, and owned ring segments.
- One shared details panel sits immediately below the ship.
- Completed work remains collapsed below the details panel.

Campaign content may provide broad anchor regions such as `forward`, `port`, `starboard`, `central`, `aft`, or `engineering`. The UI assigns a stable fallback when no region is authored.

Other campaigns may provide their own transparent schematic artwork. The Breckenridge image is a package asset, not a hardcoded global Ship image.

### Ring Interaction

When the player hovers over, keyboard-focuses, or selects a task:

- the task's leader line and anchor brighten;
- its exact missing segments display a ghost-filled recovery preview;
- existing filled segments do not change;
- the task shows `RESTORES +N COHESION`; and
- selection keeps the preview visible while the details panel is open.

When a task completes, its exact segments fill with a restrained animation. Reduced-motion mode uses an immediate high-contrast change.

Backlogged segments use a neutral missing-segment treatment. The aggregate backlog indicator can highlight that arc without revealing task details.

### Task Buttons

Each callout communicates the essential decision before selection:

> **LEVEL 2 · +10 COHESION**
>
> **ALIGN SENSOR HANDOFFS**

A compact presentation may use one to four level pips, but reward text remains explicit. Color is never the only state indicator.

All available work has equal default importance. Campaign-critical or mission-immediate ordering affects queue position, not a permanent visual `recommended` badge.

The first visible task is selected when the page opens. This teaches the interaction without calling it more important. Selection persists while the task remains available. When it completes or disappears, the first remaining visible task becomes selected.

### Task Details Panel

The selected task shows:

**Situation**

What has happened and why it needs command attention.

**Command objective**

What successful leadership looks like, rather than a technical procedure the player must personally perform.

**Current operational effect**

What remains impaired while the issue is unresolved.

**Next step**

The concrete action available now. A task with an actionable blocker remains visible and explains how to advance or remove it.

**Progress**

Only for multi-phase tasks, using named completed, current, and known-next phases rather than percentages. Undiscovered phases remain hidden.

**On completion**

The exact Cohesion restored, operational condition removed, and any lasting capability or route unlocked.

**Need help?**

The player can always ask the ship's computer in chat for grounded options.

A task stays hidden when the player has no available action at the current time, place, knowledge state, or campaign state. It becomes visible when either the task itself or a known blocker offers something the commander can do now.

### Completed Work

Completed work appears in a collapsed history beneath the active panel. Each entry shows:

- task name;
- issue family or associated system;
- Cohesion restored; and
- the plain-language improvement produced.

It does not expose timestamps, evidence receipts, source IDs, state ranks, or internal transition language.

### Empty and Backlog States

If no visible work exists and no backlog exists:

> **No active ship work**
>
> The Breckenridge has no currently known issue requiring command attention.

If the visible queue is temporarily empty while queued issues await safe promotion, the page explains that additional issues are queued without revealing them.

### Responsive and Accessible Behavior

On wide screens, task labels occupy both sides of the ship and use leader lines.

On narrow screens, the ship and ring remain prominent while labels become a compact linked task list below the image. Small matching markers may remain on the ship, but full labels and crossing lines are not squeezed into the viewport.

Requirements include:

- task callouts are real buttons with generous hit targets;
- normal keyboard navigation reaches every task;
- focus and selection are distinct;
- the details panel updates without stealing focus;
- leader lines and anchors are decorative;
- all conveyed meaning exists in button and panel text;
- task labels remain usable without the image;
- the ring has accessible text for total, visible, and queued Cohesion debt;
- color is not the only state signal; and
- reduced-motion preferences are honored.

## Ship-Computer Help

The player may always ask the ship's computer how to approach a currently known mini-quest.

The page communicates this through shared copy rather than a special help button:

> Handle this naturally in the story through command decisions, personal involvement, delegation, or conversation. If you are unsure how to begin or what options are available, ask the ship's computer for help.

Each template supplies bounded, player-safe computer guidance describing:

- conditions that must be established;
- credible categories of approaches;
- what does not satisfy the task; and
- facts the computer must not assume.

Only guidance for visible tasks enters Directive's existing runtime packet. When asked, the normal SillyTavern generation responds in character with concrete options grounded in the accepted story.

The computer may explain, identify missing conditions, suggest options, and answer follow-up questions. It may not complete the work, expose a queued or undiscovered issue, invent a required person or component, choose the player's action, or guarantee an unsupported result.

The complete assistance contract lives in `directive.campaign.v1`. It does not depend on the bundled Directive preset, add a model call, introduce a separate computer chatbot, or mutate another extension's prompt entry. An unrelated hostile preset may reduce model compliance, but Directive remains operationally preset-agnostic.

## Semantic Authority and Replay

Cohesion, issue creation, quest progress, queue position, promotion, completion, and reward must share one replayable authority model.

The intended boundary is:

- templates are immutable campaign definitions;
- deterministic scheduling chooses only from a closed eligible set;
- created issue records carry stable identity, bindings, level, Cohesion ownership, and schedule provenance;
- accepted Story Settlement effects record issue creation, milestone completion, resolution, retirement, and replacement;
- Cohesion is derived from unresolved issue effects rather than stored as an independently editable number;
- the player projection shows only visible, player-safe issue information;
- the narration packet contains the aggregate Cohesion band plus visible conditions and computer guidance; and
- deterministic mission consumption uses exact bands or conditions only where authored.

The accepted-pair interpreter may select closed milestone candidates for visible quests. It cannot invent a quest, level, phase, reward, Cohesion value, crew binding, or completion rule.

Source invalidation rebuilds surviving issue effects, progress, Cohesion, queue order, and downstream mission results. A retry reuses validated completed model work where applicable and must not reroll scheduling or issue selection.

## Failure Boundaries

- No eligible template: leave the queue below target rather than generate filler.
- Cohesion has insufficient unowned segments: select only a fitting level or defer.
- Queued premise becomes invalid: retire it and restore its owned Cohesion before promotion.
- Visible premise becomes invalid: explicitly retire, replace, or reframe it through an authored rule; never silently delete debt.
- Narrator suggests an unsupported completion: reject the positive quest evidence and retain prior state.
- Model or provider failure: preserve the prior authoritative queue and Cohesion.
- Schedule boundary replays: reproduce the same issue selection and bindings.
- Player edits, deletes, hides, swipes, branches, saves, or loads: rebuild from surviving accepted lineage.
- Cohesion reaches Critical: slow or pause issue generation and prioritize recoverable work.
- More than five issues exist: show five and disclose aggregate queued count and debt.

## Verification Requirements

Future implementation must prove:

- Level N always owns N segments and 5N Cohesion;
- Cohesion always equals 100 minus unresolved issue debt;
- no segment is owned twice or left missing without an owner;
- issue generation is deterministic across retry, reload, and replay;
- branch reconstruction produces the correct schedule, queue, backlog, and Cohesion;
- opportunity checks use accepted in-world time or declared story boundaries, never message counts;
- level and family weights do not violate active-task safeguards;
- Critical Cohesion stops or slows ordinary generation as designed;
- five visible tasks remain the hard rendering maximum while deeper debt persists safely;
- aggregate queued count and Cohesion match hidden issue records without leaking details;
- promotion does not apply Cohesion loss twice;
- invalid queued issues retire and restore debt;
- visible task hover, focus, and selection preview exactly their owned segments;
- task completion fills exactly those segments;
- desktop and mobile layouts remain readable and keyboard-operable;
- reduced-motion behavior is correct;
- computer help includes only visible task guidance;
- the assistance contract is unchanged under the Directive preset, no preset, and an unrelated preset;
- generation call counts remain unchanged;
- established crew facts are never expanded beyond authored allowances;
- accepted quest milestones are idempotent and source-bound;
- source invalidation removes progress and replays dependent consequences; and
- the existing Ship capability and mission-receipt mechanics remain valid beneath the new presentation.

## Locked Decisions

- The value is called Cohesion.
- Cohesion is 0–100 and is shown as twenty five-point segments.
- Cohesion is entirely issue-derived; there is no unexplained ambient decay.
- Level N owns N segments and restores 5N Cohesion.
- Levels 1–4 represent increasing scope, with Level 4 rare.
- The first template library contains 20/12/6/2 templates across Levels 1/2/3/4, preserving the 50/30/15/5 rarity curve exactly.
- Opportunity timing uses accepted in-world time and meaningful story boundaries, not message counts.
- Random-looking selection is deterministic and replay-safe.
- The visible Ship queue contains at most five tasks.
- Additional issues may accumulate in a hidden-detail backlog.
- The player sees aggregate queued issue count and Cohesion debt.
- Every missing segment belongs to a visible or queued issue.
- Promotion reveals existing debt and never applies it twice.
- Tasks are commander work spanning systems, people, morale, training, coordination, logistics, and shipboard life.
- The old banner and dashboard cards are removed.
- The central transparent ship artwork occupies roughly 90% of usable width.
- A segmented Cohesion ring surrounds the ship.
- Leader-line task buttons preview the segments they restore.
- One shared details panel explains situation, command objective, effect, next step, progress, and reward.
- The page shows actionable tasks and actionable blockers, not work wholly outside the player's present reach.
- The player can always ask the ship's computer for grounded help.
- Computer help uses the existing preset-agnostic runtime packet and normal SillyTavern generation.
- One Command Bearing point has a locked Cohesion-relief ceiling of 20 points.

## Open Design Work

Before implementation planning, continue this document with:

1. the exact Command Bearing targeting and narration rule;
2. the schema-level contracts for the approved forty mini-quest templates;
3. the exact first-release Cohesion-band effects;
4. final opportunity-window and low-Cohesion scheduling constants;
5. the allowed background-crew instantiation grammar;
6. the exact schema for issue records, template bindings, phases, rewards, and backlog priority; and
7. the migration or replacement relationship between existing Breckenridge Ship milestones and the new Cohesion mini-quests.

No implementation should begin until those sections are resolved, the completed specification is self-reviewed, and the user approves the written design.
