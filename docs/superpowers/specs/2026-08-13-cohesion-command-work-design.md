# Cohesion and Commander Mini-Quests

**Status:** Approved for implementation. Core Cohesion, task, scheduling, migration, Command Bearing, package-content, authority, and Ship-page decisions are locked.

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
- The visual design remains restrained: the ship, its Cohesion ring, and at most five task controls. Desktop uses callouts plus one shared details panel; mobile uses compact inline accordion disclosure.

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

The approved roster, content balance, and generator-ready behavior of all forty templates live in [Cohesion Mini-Quest Template Catalog](./2026-08-13-cohesion-mini-quest-template-catalog.md) and its linked level-specific contract files.

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

The implementation uses a separate single-issue `cohesionRelief` spend and preserves `narrativeEdge` unchanged.

The player selects one visible issue and spends one Command Bearing point. The spend reserves against that exact issue and arms on the next player message. The player's message must declare a decisive command action aimed at resolving the selected issue. The narrator receives the visible issue contract and is instructed to let that command intervention succeed credibly without inventing unsupported facts or solving unrelated work.

The spend commits only when the selected assistant response is accepted by the next player message and accepted evidence establishes the targeted issue's resolution. It restores the issue's owned Cohesion, up to the fixed 20-point ceiling. It never crosses task boundaries, targets queued work, clears anonymous debt, or completes a permanent capability whose separate evidence contract has not passed.

If the response is rejected, corrected away from the result, swiped out, deleted, invalidated, or cannot credibly resolve the selected task, Directive refunds the spend through the existing source-bound Command Bearing custody. A pending Cohesion Relief spend blocks another Command Bearing spend. Save, load, branch reconstruction, and replay retain or refund it under the same lineage rules as `narrativeEdge`.

## Cohesion Bands

The first release uses three exact bands:

- **Ready: 75-100.** Only the specific conditions owned by unresolved issues apply. The crew normally compensates for unrelated routine strain.
- **Strained: 40-74.** When a scene materially taxes a person, department, workflow, or system named by a visible active condition, narration must express one causal limitation: slower response, reduced confidence or detail, an unavailable shortcut, extra supervision, or an explicit tradeoff. This is not a blanket penalty.
- **Critical: 0-39.** Demanding ship or crew actions that touch an active condition must expose a meaningful causal cost: degraded information, limited duration or scope, delay, lost optional route, required resource tradeoff, or bounded failure. Unrelated systems do not randomly fail, and Cohesion is never converted to a universal success percentage.

The aggregate band and visible active conditions enter the narration packet. Hidden backlog premises never do. Mission definitions may consume exact bands or visible condition IDs when authored, but generic Cohesion cannot override an authored capability, guarantee success, or invent a failure.

## Scheduling Constants

Opportunity checks use accepted authoritative ship time and accepted story boundaries:

- the first generated-task opportunity occurs after four accepted in-world hours;
- thereafter, ordinary time opportunities occur every twelve accepted in-world hours;
- a hard or soft Story Settlement boundary creates an additional opportunity only when at least four accepted in-world hours have passed since the last check;
- one opportunity creates at most one issue;
- when fewer than three unresolved issues exist, the next eligible opportunity creates one issue whenever an eligible template and unowned segment exist;
- with three through seven unresolved issues, deterministic selection creates an issue on 35% of opportunities;
- with eight or more unresolved issues, deterministic selection creates an issue on 15% of opportunities;
- ordinary generation is paused at Critical Cohesion and resumes when Cohesion reaches 40;
- the five-item visual limit does not limit backlog depth; and
- authored campaign issues may appear at their authored availability boundary without waiting for an ordinary opportunity.

The roll is a stable hash of campaign package, branch, opportunity sequence, accepted time boundary, and eligible-template digest. Retry, reload, save, load, and replay therefore reproduce it. A check records a replayable `ship.cohesionOpportunityChecked` effect even when no issue is created.

Template cooldown is measured in completed opportunity checks: Level 1 uses three, Level 2 six, Level 3 twelve, and Level 4 is limited to once per major campaign arc. A completed Long Watch suppresses fatigue- and workload-derived templates for the next two eligible opportunity checks. Existing active-level and family-diversity safeguards remain in force.

## Background Crew Grammar

Generated background crew records contain only:

- a deterministic stable person ID;
- a deterministic display name selected from a package-authored name bank;
- optional package-authored pronouns;
- Starfleet rank category;
- department and ordinary billet category;
- watch assignment when relevant;
- one relevant public qualification when required; and
- the immediate, player-safe situation created by the selected quest.

Generation may not pre-author appearance, personality, secret, diagnosis, medical history, romance, family history, trauma, misconduct, ideology, protected characteristic, or hidden motive. Accepted play may later establish additional public facts through the existing People authority.

Each template declares whether a binding must be `backgroundOnly`, may use an `establishedPublic` crewmember, or may use a department role without naming a person. Sensitive personnel templates default to `backgroundOnly`. Established characters require an exact campaign-authored template permission and use only the existing public-record allowlist. Names, departments, ranks, and qualifications come from package data; the runtime never asks a model to invent a binding.

Generated people persist through the issue record and appear in People only after accepted story introduces them through the existing `personIntroduced` path. Retiring an unseen issue does not create a person.

## Issue Authority Schema

Cohesion is derived from active Story Settlement effects. There is no independently editable Cohesion value or mutable quest tracker.

The version-one effect vocabulary is:

- `ship.cohesionOpportunityChecked`, containing opportunity sequence, accepted time, boundary provenance, eligibility digest, deterministic roll, and result;
- `ship.cohesionIssueCreated`, targeting a stable issue instance and containing template ID/version, level, owned segment IDs, bindings, player-safe variation, anchor, queue priority, creation opportunity, and source provenance;
- `ship.cohesionPhaseCompleted`, targeting an issue with phase ID and accepted source contribution IDs;
- `ship.cohesionIssueResolved`, targeting an issue with completion phase, restored segment IDs, removed condition ID, and optional authored reward reference;
- `ship.cohesionIssueRetired`, targeting an issue with a player-safe reason and restored segment IDs; and
- `ship.cohesionGenerationGuardActivated`, containing guard kind and remaining eligible checks.

Issue IDs are stable hashes of branch ID, template ID/version, opportunity sequence, and normalized bindings. Segment ownership is assigned deterministically from the lowest available ring indexes after rotating the starting index by the issue hash. No two unresolved issues may own the same segment.

Projection derives Cohesion, band, visible queue, hidden count and debt, exact progress, selected anchors, and completed history from surviving active effects plus authored migration issues. Queue order is campaign-immediate first, campaign-authored second, then creation opportunity and stable ID. Meaningful progress pins a visible issue. Generated issues are otherwise first-in, first-out.

Only the current phase produces an accepted-pair interpretation candidate. The candidate carries the template's completion guidance and exclusions. Accepted evidence creates one idempotent phase effect. Completing the final phase creates the resolution effect at the same settlement boundary. Source invalidation removes dependent phase and resolution effects through existing Story Settlement lineage and deterministically rebuilds Cohesion and queue state.

## Existing Ship Work Migration

Existing Breckenridge mechanics remain authoritative and are projected as two authored Cohesion issues:

- **Systems Integration** is a Level 3 authored issue owning 15 Cohesion. Its visible phases map in order to `ship-milestone.integration-isolation-test`, `ship-milestone.integration-combined-load-test`, and `ship-milestone.integration-failover-validation`. It resolves only when the existing system reaches `ship-state.integration.integrated`.
- **Sensor Calibration** is a Level 2 authored issue owning 10 Cohesion. Its visible phases map to `ship-milestone.sensor-controlled-baseline` and `ship-milestone.sensor-live-load-validation`. It resolves only when the existing system reaches `ship-state.sensors.validated`.

These authored issues exist as deterministic projections of the mechanics ladder and accepted milestone effects; migration does not duplicate milestone effects or rewrite existing saves. Their segment ownership is deterministic and precedes generated issue ownership. Partial milestone progress maps to completed Cohesion phases but does not partially refill the issue's segments. Existing capabilities, constraints, narration rules, evidence receipts, mission interactions, and source invalidation behavior remain unchanged beneath the new presentation.

New saves begin with these authored debts when their terminal states are not satisfied. Existing saves derive the same issues from their current milestone state on first load. A terminal existing system produces completed history and owns no missing segment. If a legacy system definition is absent, no migration issue is synthesized.

## Ship-Page Experience

The old banner image and dashboard cards are removed. The new transparent Breckenridge artwork becomes the central Ship-page asset and occupies approximately 90% of the usable content width.

The page is exclusively about actionable work. It contains no separate shipwide status summary, system ladder, `Why this state` section, generic gameplay-effect paragraph, undiscovered placeholder, active-constraints card wall, or capabilities inventory.

### Central Composition

- The Breckenridge is centered with generous negative space.
- The twenty-segment Cohesion ring surrounds it.
- On desktop, up to five task buttons sit in controlled left and right rails.
- On desktop, fine elbowed leader lines connect buttons to approximate system-associated regions.
- Anchors suggest a region; they do not claim to be an exact deck map.
- Selecting a task highlights its button, leader line, anchor, and owned ring segments.
- On desktop, one shared details panel sits immediately below the ship.
- On mobile, task controls form a compact single-column accordion below the ship and disclose non-redundant details inline.
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

## Task Category Iconography

Every visible task uses exactly one decorative icon derived from its existing `primaryFamily`. Secondary families do not change the icon, so a task retains one stable visual identity everywhere it appears.

| Primary family | Player label | SVG asset |
|---|---|---|
| `personnel` | Personnel | `personnel.svg` |
| `coordination` | Coordination | `coordination.svg` |
| `training` | Training | `training.svg` |
| `systems` | Systems | `systems.svg` |
| `shipboardLife` | Shipboard Life | `life.svg` |

The icon appears immediately before the visible title on every leader-line task card and in the selected task detail header. Authored Ship tasks continue to use their `systems` primary family rather than receiving a separate authored-work icon.

The supplied source artwork is stored as local UI assets. Presentation uses the SVG silhouettes as CSS masks so color, hover, focus, selected, and Cohesion-band treatments remain theme-controlled without rewriting the artwork. Each decorative icon is excluded from the accessibility tree because the adjacent visible task title already supplies the accessible name. Missing or unknown primary-family values render no icon and never replace or obscure the title.

DOM and Playwright verification must prove that every visible task receives the correct family mapping in both placements, the icon assets load successfully, the task card and detail title remain readable at certified viewports, and keyboard or pointer selection updates the detail icon with the selected task.

## Cohesion Ring Geometry

The twenty Cohesion markers are true curved SVG arc paths rather than straight capsules rotated around the ship. Each arc follows the ring radius, has rounded line caps, retains its stable segment index and issue ownership, and leaves an approximately six-pixel visual gap from its neighbors at certified desktop and mobile sizes. Filled, debt, queued, selected-task preview, and reduced-motion treatments remain unchanged.

Ring stroke depth is four times the initial curved-ring treatment: desktop uses `clamp(20px, 2.8vw, 32px)` and viewports at or below 820 pixels use `15px`. Arc sweep is shortened symmetrically to offset the larger round caps, preserving twenty visibly separate segments and a four-to-eight-pixel visual gap instead of allowing the strokes to merge into a continuous band.

The ring is rendered in two synchronized visual layers around one ship image. The ten arcs on the ship's right side render behind the hull; the ten arcs on the left side render in front. The changeover occurs in the gaps at the top and bottom of the circle, so no segment is split or duplicated. This creates the illusion that the ship passes through a single encircling ring without changing Cohesion ownership or interaction behavior.

On viewports at or below 820 pixels, the ship and both ring layers share one bounded, centered canvas below the identity header. The ring may not cross the header divider or overlap the class, registry, ship name, Cohesion score, or status label. The ship image and ring center must remain aligned within two CSS pixels at every certified mobile size.

Playwright geometry checks must verify twenty curved paths, round line caps, ten back-layer and ten front-layer segments, the expected stacking order around the ship, a four-to-eight-pixel neighboring gap, and centered non-overlapping mobile geometry. Existing hover, focus, and selected-task preview counts remain authoritative.

## Responsive Task Accordion

Desktop retains the five-position leader-line task controls and one shared detail panel below the ship stage. At 820 pixels and below, leader lines disappear and the same tasks become a single-column accordion below the bounded ship canvas. Each collapsed task header is a compact two-line touch target: its first line contains the category icon, title, and disclosure indicator; its second line contains the current next step and Cohesion reward. Headers size to content and never stretch to consume unused vertical space.

Mobile task details render immediately beneath their associated header. They contain the job situation, objective, player value, pursuit guidance, unresolved effect, completion guidance, progress, and Command Bearing action, but they omit the repeated task title, category icon, level eyebrow, and reward header already present in the accordion summary. Zero or one mobile task may be expanded. Activating a closed task expands it and contracts any open peer; activating the open task may collapse it. Desktop selection continues to update the shared detail panel and ring preview.

Accordion headers expose `aria-expanded` and reference their associated detail region with `aria-controls`. Collapsed detail regions use the native `hidden` state, keyboard activation follows button behavior, and focus or pointer previews do not expand a task. Playwright must cover zero-open, one-open, replacement, and collapse behavior with two and five visible tasks at 390x844 and 360x500.

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
- A curved segmented Cohesion ring surrounds the ship, with its right half behind the hull and its left half in front.
- Desktop leader-line task buttons preview the segments they restore.
- Mobile uses a compact, single-open accordion below the ship; each header shows title, next step, and reward, while its inline details omit redundant header information.
- Desktop uses one shared details panel explaining situation, command objective, effect, next step, progress, and reward.
- The page shows actionable tasks and actionable blockers, not work wholly outside the player's present reach.
- The player can always ask the ship's computer for grounded help.
- Computer help uses the existing preset-agnostic runtime packet and normal SillyTavern generation.
- One Command Bearing point has a locked Cohesion-relief ceiling of 20 points.

## Implementation Readiness

The system-wide decisions and forty generator contracts are approved. Implementation may proceed test-first while preserving accepted-pair authority, source-bound replay, SillyTavern narration ownership, package-defined content, and the existing Ship capability and mission-receipt contracts.
