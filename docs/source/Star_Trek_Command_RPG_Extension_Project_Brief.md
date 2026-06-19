# Star Trek Command RPG Extension

## Concept and Architecture Brief

This document consolidates the current design discussion for a new SillyTavern extension and identifies infrastructure that can be carried forward from the existing Saga extension.

The working recommendation is to build a new, independently named extension as a selective fork of Saga. Saga should be treated as a donor framework for SillyTavern integration, provider access, storage, responsive UI, and testing. Its lore-oriented domain model should not become the foundation of the game's state model.

---

## 1. Project Definition

The project is a persistent, AI-directed Star Trek command RPG for SillyTavern.

The player creates an original Starfleet command officer and assumes command authority aboard a new Intrepid-class starship with an original crew. The campaign takes place in Federation space during the same broad period as Star Trek: Voyager, approximately 2371-2378. Canon events can influence the political, strategic, and cultural background, but the player's ship and crew remain the center of the experience.

The extension should combine:

- Freeform SillyTavern text roleplay.
- Authored mission structure.
- Adaptive AI direction.
- Persistent crew and ship simulation.
- Rules-based action adjudication.
- Star Trek continuity and technology constraints.
- Episodic missions with campaign consequences.

A concise definition is:

> A freeform Star Trek command RPG in which authored mission truths and autonomous faction agendas create a bounded situation; the player may attempt any plausible action; an independent adjudicator enforces capability and causality; and an AI director converts the consequences into an episodic Star Trek narrative.

The target experience sits between an interactive television episode, a tabletop roleplaying campaign, and a light command-management simulation.

---

## 2. Core Fantasy

The primary fantasy is not merely being called "Captain." It is exercising command.

The player should be responsible for:

- Interpreting incomplete information.
- Issuing orders and delegating work.
- Choosing which risks are acceptable.
- Resolving disagreements among senior officers.
- Managing diplomatic, ethical, tactical, and operational pressure.
- Deciding when to obey, reinterpret, or violate orders.
- Accepting responsibility for consequences.
- Developing a recognizable command style over time.

The exact player billet remains open. Possible configurations include:

- The ship's commanding officer, regardless of rank.
- A newly promoted Commander serving as acting commanding officer.
- A Captain by rank and commanding officer by billet.
- An executive officer who regularly receives delegated mission command.
- A configurable campaign setup supporting more than one of these arrangements.

The important design decision is that gameplay focuses on command decisions rather than rank fantasy or unrestricted self-insertion.

---

## 3. Setting and Continuity

### 3.1 Campaign frame

The campaign uses:

- A new Intrepid-class starship.
- A fully original senior staff and supporting crew.
- Federation space and nearby operational regions.
- The Voyager-era political and technological baseline.
- Optional alignment to major canon events by stardate or campaign year.

The ship should not replace Voyager, shadow Voyager's journey, or retell Voyager episodes. Voyager-era events should function as background continuity, strategic context, news, policy changes, and occasional indirect consequences.

### 3.2 Canon relationship

The campaign should be canon-adjacent rather than canon-dependent.

Canon can establish:

- What technologies exist.
- What Starfleet and Federation institutions know.
- Which factions are active.
- Current diplomatic relationships.
- Major conflicts and security concerns.
- Which discoveries or secrets have not yet become public.
- What operational doctrines and laws are in force.

The original campaign determines:

- The player's assignments.
- The ship's local area of operations.
- Original factions, colonies, anomalies, and antagonists.
- The crew's personal stories.
- Mission outcomes and campaign divergences.

The extension should track explicit divergences rather than silently rewriting canon.

### 3.3 Tone

The intended tone is grounded Star Trek:

- Competent professionals under pressure.
- Ethical conflict without simplistic good/evil sorting.
- Diplomacy, investigation, science, and command judgment as viable solutions.
- Technology that follows era-appropriate limits.
- Consequences that persist.
- Optimism that is tested rather than assumed.

The system should resist "jumping the shark" by preventing unsupported powers, technologies, authority, knowledge, or outcomes from becoming true merely because the player states them.

---

## 4. Design Pillars

### 4.1 Freeform expression

The player acts through ordinary natural-language roleplay. The extension should not reduce command to a menu of dialogue choices or tactical buttons.

### 4.2 Bounded causality

The player may attempt anything that can be expressed in the fiction, but success depends on established facts, capabilities, resources, authority, and consequences.

### 4.3 Authored coherence

Missions should have an authored dramatic and causal backbone. AI generation should adapt the experience, not replace structure with random improvisation.

### 4.4 Persistent people and systems

Crew members, relationships, ship damage, favors, obligations, knowledge, and unresolved problems should survive across scenes and missions.

### 4.5 Independent adjudication

The narrative model should not decide its own rules. An authoritative state and separate adjudication process should determine what is possible and what changes.

### 4.6 Episodic Trek structure

Missions should feel like episodes, with an A-plot, optional or recurring B-plots, escalating pressure, a thematic question, and multiple credible resolutions.

### 4.7 Consequence over punishment

Failure should usually change the situation rather than stop play. A failed action can consume time, expose information, damage trust, escalate a faction, injure a system, or create a new decision.

---

## 5. What the Project Is Not

The extension should not become:

- A click-through dialogue tree.
- A pure random mission generator.
- A rigid visual novel with one correct sequence of scenes.
- An unrestricted fanfiction narrator that accepts every player assertion.
- A detailed starship spreadsheet that overwhelms roleplay.
- A Voyager retelling with the serial numbers changed.
- A binary morality game in which diplomacy is always good and authority is always bad.
- A system where every message triggers several visible checks and interrupts conversational flow.

---

## 6. Command Style and Moral Identity

### 6.1 Inspiration and Resolve

The Mass Effect Paragon/Renegade concept can be adapted into two independent command-style tracks rather than a binary morality axis.

Working terms:

- **Inspiration**: Influence through trust, empathy, transparency, persuasion, coalition-building, and preserving another person's dignity.
- **Resolve**: Influence through authority, decisiveness, credible pressure, deadlines, calculated risk, and willingness to accept responsibility.

These are not opposites and neither is inherently moral or immoral. A strong commander may develop both.

Examples:

- Inspiration can fail when the player ignores material interests, conceals an obvious truth, or lacks credibility.
- Resolve can fail when the player has no jurisdiction, leverage, force, information, or willingness to follow through.
- Inspiration can be manipulative.
- Resolve can be ethical and necessary.

Command-style progression should unlock techniques, modifiers, situational options, or greater reliability. It should not create automatic social victories.

### 6.2 Values and Directives

Moral identity should be modeled separately through values and obligations.

Possible player Values:

- No life is expendable.
- The crew deserves the truth.
- The mission comes before personal loyalty.
- Starfleet principles matter most when they are costly.
- Peace requires understanding, not merely compliance.

Possible Directives:

- Preserve the neutrality of a disputed system.
- Do not reveal the existence of a classified listening post.
- Avoid military escalation.
- Recover Federation personnel without violating local sovereignty.

The game should record whether the commander affirmed, compromised, challenged, or changed a Value. It should not convert every decision into a numeric good/evil score.

### 6.3 Command moments

Progression points should be earned through meaningful Command Moments rather than selecting labeled dialogue options.

A Command Moment qualifies when:

- The situation has meaningful stakes.
- The player's method is substantively appropriate.
- The player accepts a risk, cost, obligation, or compromise.
- The resolution reveals a consistent command style.
- The same situation has not already awarded progression.

This prevents point farming and preserves roleplay.

---

## 7. Side Stories and Rewards

Side quests should be written as episode B-plots, crew stories, or optional operational problems. They should not feel like detached errands.

Examples include:

- A senior officer's professional judgment conflicts with the player's orders.
- A crew member concealed an error that now affects the mission.
- A local official asks for help outside the formal assignment.
- An engineering workaround could improve one system but create another risk.
- A diplomatic contact offers useful intelligence in exchange for a morally uncomfortable favor.
- A junior officer's personal problem exposes a wider crew or institutional issue.

Their primary progression reward can be Inspiration or Resolve points earned through Command Moments.

They can also provide grounded secondary rewards:

- Trust or strain with a crew member.
- A local favor.
- Intelligence.
- Access to a specialist.
- A specific temporary ship-system benefit.
- A limited operational asset.
- Improved standing with a faction.
- A future complication or obligation.

Rewards should remain narrow and credible. The player should not complete a personal favor and receive a permanent universal bonus to the entire ship.

---

## 8. Freeform Roleplay Without Losing Structure

The correct model is a **bounded causal sandbox**.

The mission director controls pressure, timing, and the actions of the world. It does not control the player's solution.

The player can type an order such as:

> Have Commander Vale maintain a targeting solution, but do not raise shields. Open a channel and tell the governor I will give him ten minutes to evacuate voluntarily. After that, transmit our evidence to his cabinet and request Starfleet arrest authority.

The extension interprets this as a collection of attempted actions. It does not assume the desired result occurred.

### 8.1 Put the situation on rails, not the solution

#### Hard rails

Hard rails are authoritative facts that cannot be casually contradicted:

- Mission truth.
- Canon-era technology and political conditions.
- Ship capabilities and current damage.
- Character location, knowledge, health, and availability.
- NPC motives and established decisions.
- Starfleet orders and chain of command.
- Consequences already incurred.
- Current inventory, evidence, and resources.

#### Soft rails

Soft rails shape the experience without dictating a single path:

- Mission and faction clocks.
- Escalation conditions.
- Act pacing.
- Deadlines.
- Crew members surfacing unresolved problems.
- Clues that can be discovered through several methods.
- Thematic links between A-plots and B-plots.
- Factions reacting to player actions.

#### Free space

The player remains free to decide:

- What to say.
- Who to trust.
- Which officer to assign.
- Which evidence to disclose.
- Whether to negotiate, investigate, deceive, retreat, or fight.
- Whether to obey, reinterpret, or violate orders.
- Which risks and moral compromises are acceptable.

The mission defines a problem and active forces. It should not define one mandatory solution.

---

## 9. Core Turn Pipeline

A consequential player message should pass through a structured pipeline.

### 9.1 Intent interpretation

The player's prose is converted into structured intent:

- Goal.
- Method.
- Orders issued.
- Intended executor.
- Target.
- Assumptions.
- Claimed facts or outcomes.
- Apparent command style.
- Resources the player intends to use.

Example internal interpretation:

```json
{
  "goal": "compel a voluntary evacuation",
  "methods": ["credible pressure", "evidence disclosure", "legal escalation"],
  "orders": [
    { "executor": "Commander Vale", "action": "maintain targeting solution" },
    { "executor": "communications", "action": "open channel" }
  ],
  "assumptions": [
    "the evidence is available",
    "the cabinet can be reached",
    "Starfleet may have arrest jurisdiction"
  ],
  "claimedOutcomes": []
}
```

### 9.2 Capability validation

The authoritative state checks:

- Does the player know the relevant information?
- Is the necessary officer present and available?
- Is the required ship system operational?
- Does the player possess the claimed evidence or resource?
- Does the commanding officer have jurisdiction or authority?
- Is there enough time?
- Is the target reachable?
- Is the technology available in this era?
- Is the threat or promise credible?

Basic facts should be resolved deterministically where possible. The LLM can interpret ambiguity but should not decide whether a logged system is online.

### 9.3 Resolution

Only uncertain and consequential actions require mechanical resolution.

A simple internal model could be:

```text
Executor competence
+ ship assistance
+ preparation
+ leverage
+ applicable command style
- difficulty
- active complications
= result band
```

The executor matters. If the player orders an engineering task, the chief engineer's competence and available resources determine the technical outcome. Command ability affects delegation, coordination, prioritization, persuasion, morale under pressure, and the quality of orders. It does not make the player the best engineer, pilot, scientist, physician, and security officer aboard.

Recommended result bands:

- Success.
- Success with cost.
- Setback with a new opportunity.
- Impossible under current conditions.

"Impossible" should communicate the fictional constraint. It should not be a generic refusal.

### 9.4 Director response

The mission director receives the resolved outcome and decides which existing pressure responds:

- An NPC acts on an established goal.
- A clock advances.
- A faction changes posture.
- A deadline becomes urgent.
- A crew relationship changes.
- A clue becomes available or is lost.
- A prior consequence returns.

The director should not introduce an unrelated random encounter merely because a turn needs excitement.

### 9.5 Narration

The narration model receives an outcome packet containing:

- Facts now established.
- State changes.
- NPC intentions.
- Information that may be revealed.
- Facts that must remain hidden.
- Prohibited contradictions.
- The unresolved dramatic question.

It then writes normal roleplay prose. The player should see a bridge scene, conversation, away mission, report, or consequence rather than a mechanical choice menu.

---

## 10. Mission Architecture

### 10.1 Hybrid authored/generated model

A hybrid model is the strongest fit.

Each mission should have an authored backbone:

- Initial assignment.
- Hidden truth.
- Central ethical or command question.
- Important NPCs and factions.
- Active threats or fronts.
- Escalation conditions.
- Key revelations.
- Several plausible resolution paths.
- Consequences for failure, compromise, or partial success.

The AI director can generate or adapt:

- Connective scenes.
- Crew reactions.
- Complications caused by player actions.
- Alternate investigative routes.
- B-plots.
- Environmental details.
- Dialogue and moment-to-moment presentation.
- Responses to plans the author did not anticipate.

For the initial release, authored mission packages should be primary. Fully generated missions can be added later after the director, adjudicator, and state systems are reliable.

### 10.2 Mission graph instead of scene script

A mission package should define a graph of truths, actors, pressures, and end conditions rather than a fixed scene list.

Recommended mission components:

- **Truth**: What is actually happening.
- **Question**: The ethical or command issue the episode explores.
- **Objectives**: Official, optional, and concealed.
- **Directives**: Standing orders and mission-specific restrictions.
- **Fronts**: Factions or individuals with goals, resources, and clocks.
- **Revelations**: Important facts discoverable through multiple methods.
- **Locations**: Places with traits, hazards, access conditions, and inhabitants.
- **Command Moments**: Potential situations for Inspiration, Resolve, or Value challenges.
- **B-plots**: Crew or local stories tied thematically or causally to the A-plot.
- **End States**: Conditions that can conclude the mission.
- **Aftermath Rules**: How outcomes affect the campaign.

A mission should not require:

```text
Briefing -> colony -> ambush -> interrogation -> final battle
```

Instead, an antagonist has a goal, a plan, resources, and a clock. The ambush only occurs if that actor still wants it, can carry it out, and reaches the relevant point in the plan.

### 10.3 Campaign structure

Missions can remain episodic while contributing to larger arcs through:

- Recurring factions.
- Crew development.
- Unresolved obligations.
- Political changes.
- Ship history and damage.
- A reputation for particular command methods.
- Consequences from earlier compromises.
- Long-term mysteries.

The campaign should be able to produce both standalone episodes and multi-mission arcs.

---

## 11. Dynamic Event Manager

Dynamic events must be causal rather than random.

Every event should have an internal parent:

- An NPC pursuing an established goal.
- A mission clock advancing.
- A consequence of a previous player action.
- A neglected crew problem.
- A known environmental hazard.
- A damaged system deteriorating.
- A faction reacting to newly revealed information.
- A directive becoming harder to satisfy.

Example internal event:

```yaml
source: diplomatic_crisis_clock
cause: player disclosed evidence to the colonial cabinet
actor: Governor Tal
action: orders security forces to seize the subspace relay
purpose: escalate the conflict and force prioritization
deadline: two scene transitions
```

The event manager should ask:

1. What changed?
2. Which actor or system notices?
3. What does that actor or system want?
4. What action can it credibly take?
5. Why does the event happen now?
6. Which existing thread does it advance?

An event that cannot answer these questions should generally not occur.

---

## 12. Persistent Crew Simulation

The crew should be a major source of gameplay, not interchangeable dialogue voices.

Each recurring officer should have:

- Rank and duty position.
- Professional competencies.
- Areas of weakness.
- Personal Values.
- Command expectations.
- Relationships with other crew members.
- Relationship state with the player.
- Current stress, injury, fatigue, or availability.
- Private concerns and unresolved threads.
- Knowledge and security clearance.
- A personal arc.
- Opinions about important player decisions.

Crew members should:

- Give advice based on expertise and personality.
- Disagree credibly.
- Remember how they were treated.
- Gain or lose trust.
- Execute orders according to ability and circumstances.
- Make mistakes without becoming incompetent caricatures.
- Produce B-plots that intersect with missions.
- Occasionally force the player to choose between institutional, operational, and personal concerns.

A starting scope of six senior officers is sufficient for a vertical slice.

---

## 13. Persistent Ship Simulation

The Intrepid-class ship should have persistent, legible state without becoming an engineering spreadsheet.

Useful tracked categories include:

- Hull and structural condition.
- Propulsion.
- Power availability.
- Sensors.
- Communications.
- Transporters.
- Tactical systems.
- Medical capacity.
- Shuttles and auxiliary craft.
- Specialized equipment.
- Temporary modifications.
- Damage, repairs, and workarounds.
- Limited mission-specific resources.

Ship state should influence what the crew can attempt.

Improvements should be specific and grounded, such as:

- Better resolution from a modified sensor package in one class of anomaly.
- A temporary increase in transporter reliability under known interference.
- A new diplomatic database supplied by an allied culture.
- A repaired shuttle becoming available.
- A one-use engineering workaround.

The game should avoid universal percentage upgrades that do not have a clear fictional meaning.

---

## 14. Adjudication and Anti-Cheating

The project needs an authoritative referee, but the system should be framed as adjudication rather than punishment.

Core rule:

> Player prose declares intent and attempted action. It does not directly write authoritative outcomes.

Examples:

- "I bypass the lockout" becomes "I attempt to bypass the lockout."
- "The admiral agrees" becomes an attempt to persuade or compel the admiral.
- "I remember the classified protocol" is checked against player knowledge and clearance.
- "We beam through the interference" is checked against transporter capability, interference, modifications, and risk.

The authoritative state should track enough information to reject unsupported claims:

- Location.
- Knowledge.
- Authority.
- Inventory and evidence.
- Crew availability.
- Ship condition.
- Time.
- Active directives.
- Established relationships.
- Technology constraints.

The adjudicator should be transparent enough to feel fair. A collapsible command log can show the relevant factors and result without placing mechanics in every narrated paragraph.

---

## 15. Turn Modes and Provider Efficiency

Most messages should not trigger the entire game pipeline.

Recommended turn modes:

- **Roleplay turn**: Routine dialogue or low-stakes interaction. Narrator only.
- **Consequential action**: Capability validation and resolution before narration.
- **Command Moment**: Resolution plus possible Inspiration, Resolve, or Value evaluation.
- **Scene transition**: Director advances clocks and selects active pressure.
- **Mission debrief**: Consequences, progression, reports, and future hooks are committed.
- **Administrative turn**: UI or campaign management without in-fiction narration.

A lightweight classifier can determine the turn mode. Rules and local state checks should handle simple cases before using a provider call.

This preserves the feel of normal SillyTavern roleplay and controls latency and cost.

---

## 16. Model and System Responsibilities

The extension should separate responsibilities rather than asking one model to improvise everything.

### 16.1 Narrator

Responsible for:

- In-character dialogue.
- Scene prose.
- Sensory detail.
- Crew portrayal.
- Presenting established consequences.

Not responsible for:

- Changing authoritative state without an approved delta.
- Inventing new ship capabilities.
- Awarding progression.
- Deciding hidden mission truth.

### 16.2 Adjudicator

Responsible for:

- Interpreting consequential intent.
- Identifying assumptions.
- Applying capabilities and constraints.
- Resolving uncertain actions.
- Producing a structured result and proposed state delta.

### 16.3 Mission Director

Responsible for:

- Pacing.
- Selecting active pressures.
- Advancing fronts and clocks.
- Managing revelations.
- Introducing causal complications.
- Connecting A-plots and B-plots.
- Determining when the mission reaches an end state.

### 16.4 State Manager

Responsible for:

- Authoritative campaign state.
- Validation.
- Transactions.
- Snapshots and rollback.
- Persistence.
- State migrations.
- Import and export.

This layer should be deterministic code wherever practical.

### 16.5 Canon and Continuity Layer

Responsible for:

- Timeline position.
- Canon knowledge boundaries.
- Technology availability.
- Faction state.
- Era-appropriate terminology and institutions.
- Explicit campaign divergences.

---

## 17. Authoritative State Model

The extension should treat structured state as authoritative and chat prose as presentation.

Suggested top-level domains:

```text
campaign
player
crew
ship
mission
fronts
clocks
relationships
commandStyle
values
directives
canon
turnLedger
ui
settings
```

Potential state examples:

- Campaign ID and stardate.
- Current location and assignment.
- Player rank, billet, Values, Inspiration, and Resolve.
- Crew profiles and current conditions.
- Ship systems and damage.
- Active mission package and node state.
- Faction goals and clocks.
- Known clues and concealed truths.
- Active directives.
- Relationship changes.
- Outstanding favors and obligations.
- Canon boundary and divergences.
- Turn snapshots and committed state deltas.

World Info or prompt lore can support narration, but critical game state should not live only in model context.

---

## 18. Transactional Turns, Swipes, Edits, and Branches

Game state must remain stable under normal SillyTavern chat operations.

Recommended transaction flow:

1. Snapshot authoritative state when the player submits a consequential message.
2. Assign a unique turn ID.
3. Parse and resolve the action once.
4. Store the mechanical outcome packet under that turn ID.
5. Generate narration from the stored outcome.
6. Validate and commit the state delta.
7. Record the final result in the command log.

Required chat behavior:

- **Assistant swipe**: Keep the same mechanical result and regenerate only the prose.
- **User edit**: Restore the state before that turn and resolve the revised action again.
- **Message deletion**: Roll back dependent state changes.
- **Branch creation**: Fork from the correct historical snapshot.
- **Regeneration after interruption**: Reuse a committed result or safely resume an incomplete transaction.

Without this ledger, swiping could reroll outcomes, deleting a message could leave rewards behind, and edited orders could coexist with consequences from the original order.

---

## 19. User Interface

The game should remain chat-first. The extension UI supports orientation, state inspection, campaign management, and debugging. It should not become the primary action interface.

Recommended primary sections:

1. **Mission**
   - Current assignment.
   - Objectives.
   - Public directives.
   - Known time pressure.
   - Current location.
   - Mission summary.

2. **Crew**
   - Senior staff roster.
   - Duty status.
   - Relationships.
   - Current personal threads.
   - Known expertise.

3. **Ship**
   - System condition.
   - Damage and repair queue.
   - Available craft and mission assets.
   - Temporary modifications.

4. **Command Log**
   - Adjudicated turns.
   - State changes.
   - Inspiration and Resolve awards.
   - Value challenges.
   - Important decisions.
   - Optional mechanical detail.

5. **Settings**
   - Provider roles.
   - Mechanical visibility.
   - Difficulty and strictness.
   - Canon boundary.
   - Import/export.
   - Debugging and state safety.

A compact in-chat or shelf summary can show:

- Stardate and location.
- Current objective.
- Important ship conditions.
- Active directives.
- Inspiration and Resolve.
- Publicly known clock pressure.

The UI should not present lists of available actions. Crew recommendations should appear in character within the roleplay.

---

## 20. Initial Vertical Slice

The first playable prototype should remain deliberately narrow.

Recommended scope:

- One original Intrepid-class starship.
- One player command role.
- Six senior officers.
- One complete mission package.
- One A-plot.
- One crew B-plot.
- Two active factions or fronts.
- Two escalation clocks.
- Inspiration and Resolve.
- Three player Values.
- Basic ship-system state.
- Intent parsing and capability validation.
- Four result bands.
- Transactional turn ledger.
- Mission, Crew, Ship, Log, and Settings UI.
- Desktop and mobile support.

The vertical slice should prove that freeform play, adjudication, persistent state, and authored direction cooperate correctly before adding procedural mission generation or a large campaign.

---

# Part II: Using Saga as the Foundation

## 21. Recommendation

Do not build the Star Trek RPG as a mode inside Saga, and do not discard Saga to start from a blank repository.

Use a **surgical fork**:

- Create a new repository or branch from the reviewed Saga snapshot.
- Give the extension a new identity immediately.
- Preserve generic platform infrastructure.
- Remove Saga's lore-authoring domain.
- Start a new game-state schema at version 1.
- Build the RPG around adjudicated turns and mission state.

The conceptual distinction is:

- Saga's central unit is a piece of lore and whether it belongs in the prompt now.
- The RPG's central unit is an adjudicated turn within a persistent mission and campaign state.

Trying to turn the second into another Saga workflow would spread mode checks and compatibility logic through the runtime, navigation, persistence, and generation systems.

Starting from nothing would discard difficult and already working infrastructure such as mobile navigation, provider routing, storage safety, prompt integration, and visual testing.

---

## 22. Saga Components to Reuse Largely Intact

The following parts of the uploaded Saga snapshot are strong donor candidates. They still require renaming, dependency cleanup, and targeted tests, but their underlying responsibilities are useful.

| Saga area | Candidate files | Use in the RPG |
| --- | --- | --- |
| Extension bootstrap and lifecycle | `src/extension/bootstrap.js`, `index.js`, `lifecycle.js`, `runtime-mount.js`, `menu-button.js` | Install, enable, disable, mount, and runtime startup patterns. |
| Runtime action registry | `src/runtime/runtime-actions.js` | Central dispatch for UI and game actions without coupling panels directly to domain logic. |
| Domain-independent generation runner | `src/generation/generation-job-runner.js` | Resumable adjudication, mission generation, batch content generation, retry, checkpoint, cancellation, and diagnostics. The file explicitly describes itself as domain-agnostic. |
| Provider client patterns | `src/providers/lore-llm-client.js` | Current SillyTavern model, Connection Profile, and OpenAI-compatible routing; model status; connection tests; provider role configuration. Rename and split by RPG role. |
| Response normalization | `src/providers/lore-response-normalizer.js` | Normalize provider response shapes, detect empty output, finish reasons, token-limit failures, and invalid JSON. |
| UI primitives | `src/ui/runtime-ui-kit.js`, `input-focus-preservation.js` | Buttons, chips, badges, status pills, dialogs, overlays, busy actions, toasts, and focus behavior. Remove lore-specific formatters. |
| Theme and CSS foundation | `styles/tokens.css`, `components.css`, `layout.css`, `runtime.css`, `src/theme/runtime-theme.js` | Design tokens, responsive layout, theme integration, component styling, and runtime shell behavior. |
| State backup and safety | `src/state/state-backup.js`, `storage-safety.js`, `import-export.js` | Campaign backups, restore points, state-safety diagnostics, and export/import patterns. |
| File storage foundation | `src/storage/saga-file-api.js`, `saga-storage-index.js`, `saga-storage-stale-write.js`, `saga-storage-diagnostics.js`, `saga-domain-storage.js` | External payload storage, indexes, stale-write detection, integrity checks, and storage diagnostics. Rename all Saga identifiers. |
| Secure direct-provider key handling | `src/state/secure-keyring.js` | Retain only if direct endpoint configuration remains supported. Connection Profiles should remain preferable. |
| Download/export helpers | `src/runtime/runtime-downloads.js` | Campaign exports, mission pack exports, diagnostics, and backup downloads. |
| Visual smoke framework | `tests/browser/visual-smoke.html`, `tools/scripts/serve-visual-smoke.mjs`, related smoke tests | Desktop, tablet, and mobile regression testing. |

---

## 23. Saga UI and Mobile Work Worth Preserving

Saga already contains substantial responsive-shell work that should not be recreated without cause.

Useful runtime references include:

- `src/runtime/runtime-shell.js`
- `src/runtime/runtime-shell-view.js`
- `src/runtime/runtime-navigation.js`
- `src/runtime/runtime-rail-metrics.js`
- `src/runtime/runtime-collapsible.js`
- `src/runtime/tab-registry.js`
- `src/runtime/runtime-composition.js`
- `src/runtime/runtime-setting-controls.js`
- `src/runtime/runtime-setting-groups.js`

Saga's current interface includes:

- Desktop rail and shelf behavior.
- Drawers and overlay handling.
- Phone-width bottom route navigation and shell action strip.
- Route pages and subview stacks.
- Detail sheets.
- Touch-sized controls.
- Mobile-specific state persistence.
- Desktop and mobile documentation renders that can be used as visual references.

The game should retain the shell geometry and interaction patterns while replacing the tabs and content.

Suggested route conversion:

| Saga-oriented route | RPG route |
| --- | --- |
| Session | Mission |
| Loredecks | Crew or Campaign Library |
| Continuity | Command Log or Timeline |
| Context | Ship or Situation |
| Lore | Crew/Intel details |
| Injection | Advanced Director/Prompt diagnostics |
| Settings | Settings |

This mapping is conceptual. The implementation should create clean new routes rather than preserving old route names internally.

---

## 24. Saga Systems to Adapt Substantially

### 24.1 Prompt injection

Candidate source:

- `src/continuity/prompt-injector.js`
- `src/runtime/context-composition.js`
- `src/runtime/injection-preview-panel.js`

Adapt the mechanism for composing and injecting:

- Current authoritative state summary.
- Crew presence and relevant character state.
- Ship conditions.
- Mission facts.
- Director outcome packets.
- Canon constraints.
- Prohibited contradictions.

Do not preserve Saga's lore-card selection semantics as the game-state model.

### 24.2 Event lifecycle

Candidate source:

- `src/extension/events.js`
- `src/extension/lifecycle.js`

Saga already handles generation start, end, interruption, chat changes, and extension enable/disable. The RPG must extend this substantially to cover:

- User message creation.
- Assistant message creation.
- User edits.
- Assistant swipes.
- Message deletion.
- Branch changes.
- Interrupted transactions.
- State rollback and replay.

This is a critical addition. The current Saga event surface is useful but insufficient for authoritative game-state transactions.

### 24.3 Provider roles

Saga currently distinguishes utility and reasoning use cases. The RPG should adapt this into explicit roles such as:

- Intent classifier or utility model.
- Adjudicator.
- Mission Director.
- Mission/content generator.
- Narrator, usually the active SillyTavern chat model.

Users should be able to assign the same provider to several roles or separate them.

### 24.4 Package import and export

Candidate source:

- `src/loredecks/loredeck-package-service.js`
- `src/loredecks/loredeck-package-zip.js`
- `src/loredecks/loredeck-library-service.js`
- `src/loredecks/loredeck-library-index.js`

Adapt these patterns for data-only packages such as:

- Mission packs.
- Campaign templates.
- Ship packs.
- Crew packs.
- Canon timeline packs.
- Theme packs.

Preserve path validation and rejection of active file types.

### 24.5 Context and canon gating

Candidate source:

- `src/context/context-gating.js`
- `src/context/context-resolver.js`
- `src/context/context-index.js`
- `src/context/canon-lore-db.js`
- `src/lorecards/lore-injection-filter.js`

These are useful design references for:

- Timeline-aware retrieval.
- Knowledge boundaries.
- Future-information guards.
- Relevance filtering.
- Context-specific canon retrieval.

They should be simplified around the RPG's canon layer rather than copied wholesale.

### 24.6 Storage domains

Saga's external storage domains are tied to Loredecks, creator projects, story openers, and themes. Preserve the indexed-file and stale-write architecture, but define new domains such as:

- Campaigns.
- Mission packs.
- Crew templates.
- Ship templates.
- Canon packs.
- Turn-ledger archives.
- Themes and icons.

---

## 25. Saga Material to Use as Reference Only

### 25.1 Existing Star Trek Loredecks

The snapshot contains TNG, DS9, and Voyager season Loredecks, including:

- Episode and timeline anchors.
- Character and faction state.
- Reveal guards.
- Future-information guards.
- Season-local context rules.

These can help seed the new canon timeline and provide examples of time-gated content.

However, their own manifests identify them as draft reference material, mark them as needing review, and state that human canon review is required. They should not be treated as authoritative production data without review.

The RPG also needs different information than a season summary Loredeck. It requires operational details such as:

- Starfleet authority and procedures.
- Era-specific technology limits.
- Federation political conditions.
- Faction capabilities and current relationships.
- Travel and communications assumptions.
- Which canon developments are public at each campaign date.

The existing decks are a starting source, not the final canon system.

### 25.2 Saga documentation and screenshots

The extensive desktop and mobile documentation can be used as:

- Interaction references.
- Regression targets.
- Examples of drawer, shelf, and route behavior.
- A basis for new operator documentation.

The content and terminology should be rewritten for the RPG.

### 25.3 Lore timeline concepts

Saga's lore timeline and continuity concepts may inspire:

- Command decision history.
- Mission aftermath records.
- Relationship changes.
- Canon divergences.
- Restore and audit tools.

The implementation should be a new command ledger rather than a renamed Lorecard ledger.

---

## 26. Saga Systems That Should Be Replaced or Removed

The following are too closely tied to Saga's lore-authoring purpose to serve as the RPG's core:

- Loredeck and Lorecard workflows.
- Deck Maker.
- Story Maker.
- Pending Lore review.
- Lore Automation.
- Lore relevance and elevation controls.
- Loredeck health and repair workflows.
- Loredeck creator projects.
- The existing continuity scanner as the source of authoritative state.
- Saga's default state object.
- Saga's existing state migrations.
- Saga's route names and global namespace.
- Saga storage prefixes and file names.
- Saga CSS class and DOM ID prefixes.
- Saga manifest key and extension hooks.

Saga's state schema is currently version 27 and contains extensive compatibility fields for its lore systems. The RPG should start with a clean schema version 1 rather than inheriting those migrations.

Large panels such as the Loredeck Library, Lorecards workspace, creator panels, health center, and workbench should be treated as UI references only. Adapting their domain logic would likely cost more than writing focused Mission, Crew, Ship, and Command Log panels.

---

## 27. Proposed New Source Layout

A possible source structure is:

```text
src/
  extension/
    bootstrap.js
    lifecycle.js
    message-events.js
    runtime-mount.js

  campaign/
    campaign-state.js
    state-schema.js
    state-manager.js
    turn-ledger.js
    transaction-manager.js
    rollback-manager.js
    import-export.js

  mission/
    mission-schema.js
    mission-graph.js
    mission-loader.js
    director.js
    event-manager.js
    fronts.js
    clocks.js
    objectives.js
    revelations.js
    end-states.js

  adjudication/
    turn-classifier.js
    intent-parser.js
    capability-validator.js
    action-resolver.js
    command-moment-evaluator.js
    outcome-packet.js
    state-delta-validator.js

  simulation/
    crew-manager.js
    ship-manager.js
    relationship-manager.js
    command-style.js
    values.js
    directives.js

  generation/
    generation-job-runner.js
    provider-router.js
    response-normalizer.js
    structured-generation.js
    narrator-bridge.js

  canon/
    canon-pack-loader.js
    timeline-gating.js
    knowledge-boundaries.js
    technology-constraints.js
    divergence-manager.js

  storage/
    file-api.js
    storage-index.js
    stale-write.js
    campaign-storage.js
    mission-pack-storage.js
    diagnostics.js

  runtime/
    runtime-shell.js
    navigation.js
    runtime-actions.js
    prompt-composition.js

  ui/
    runtime-ui-kit.js
    mission-panel.js
    crew-panel.js
    ship-panel.js
    command-log-panel.js
    settings-panel.js
```

This keeps platform, simulation, adjudication, mission direction, and presentation separate.

---

## 28. Recommended Fork Sequence

### Phase 0: Establish the donor baseline

- Preserve the Saga snapshot as a tagged donor reference.
- Run the relevant existing tests.
- Document any already-failing fixtures.
- Identify generic modules and their dependencies.

### Phase 1: Create a new identity

Immediately change:

- Manifest key and display name.
- Global namespace.
- Storage prefix and paths.
- CSS class and DOM ID prefixes.
- Lifecycle hook names.
- Repository metadata.
- User-facing terminology.

This avoids creating a long-lived half-Saga, half-game codebase.

### Phase 2: Remove Saga domain systems

Remove or quarantine:

- Lorecards.
- Loredeck authoring.
- Story Maker.
- Deck Maker.
- Lore automation.
- Lore health and repair.
- Bundled non-Star-Trek content.
- Saga-specific state migrations.

Keep the donor repository available for later reference rather than leaving unused modules in production.

### Phase 3: Install a new state foundation

Build:

- Schema version 1.
- Campaign state.
- Crew and ship state.
- Mission state.
- Turn ledger.
- Transaction manager.
- Backup, restore, import, and export.

Do this before building a complex director.

### Phase 4: Rebuild the shell

Use Saga's shell and mobile patterns to create:

- Mission.
- Crew.
- Ship.
- Command Log.
- Settings.

Retain responsive behavior and remove lore terminology.

### Phase 5: Implement adjudication

Build one complete path:

```text
player message
-> turn classification
-> intent parsing
-> deterministic capability checks
-> uncertain action resolution
-> outcome packet
-> narration
-> committed state delta
```

### Phase 6: Implement one authored mission

Add:

- Mission truth.
- Two fronts.
- Two clocks.
- Several revelations.
- Multiple end states.
- One B-plot.
- Command Moments.

### Phase 7: Add canon gating

Introduce a reviewed Voyager-era canon pack and technology rules after the core game loop works.

### Phase 8: Expand content and generation

Only then add:

- Additional missions.
- Mission authoring tools.
- Generated mission drafts.
- Campaign arcs.
- Pack import/export.
- More detailed ship and crew progression.

---

## 29. Testing Priorities

Saga's test culture is worth preserving, but the new project needs game-specific invariants.

Highest-priority tests:

- A swipe cannot reroll an adjudicated outcome.
- Editing a player message restores and re-resolves state.
- Deleting a message removes dependent rewards and consequences.
- A failed provider response cannot partially commit state.
- A stale storage write is rejected.
- The narrator cannot add unapproved state changes.
- A player cannot use unknown information.
- An offline ship system cannot be used without a valid workaround.
- Command points cannot be awarded twice for one Command Moment.
- Clocks advance only from valid triggers.
- Dynamic events always identify a causal source.
- Mission end states are reachable through more than one approach.
- Mobile navigation preserves the active campaign and subview state.
- Importing a mission pack cannot execute active content.

Visual smoke targets should cover:

- Desktop shelf and rail.
- Tablet layout.
- Phone top navigation.
- Mission detail sheets.
- Crew and ship lists.
- Command Log expansion.
- Provider and state-safety settings.

---

## 30. Open Design Decisions

The following questions remain intentionally unresolved:

1. Is the player always the commanding officer, or can the campaign support executive officer and mission-command variants?
2. Is the player's rank fixed, configurable, or determined by the campaign premise?
3. Which exact year or Voyager season anchors the initial campaign?
4. How directly can major canon events affect the campaign?
5. How visible should mechanical difficulty and result calculations be?
6. Should uncertain action resolution use numeric stats, tags and thresholds, dice-like randomness, or a hybrid?
7. How many crew attributes are needed before the system becomes too heavy?
8. Can crew members die or leave permanently?
9. How much ship damage and repair detail is desirable?
10. Do Inspiration and Resolve unlock explicit techniques, passive modifiers, or both?
11. Can Values change during play, and what causes a change?
12. Should mission packs be fully authored, AI-assisted drafts, or support both workflows?
13. How much of the narration is generated by the active chat model versus a dedicated narrator role?
14. What information is shown to the player and what remains Director-only?
15. How strict should canon be after the campaign begins to diverge?

These questions can be answered through the vertical slice rather than through speculative design alone.

---

## 31. Final Working Summary

The proposed extension is a persistent Star Trek mission-director and command-simulation system for SillyTavern.

It follows a new Intrepid-class starship and original crew operating in Federation space during the Voyager era. The player creates a Starfleet command officer and exercises real command authority through freeform text roleplay. Missions use authored truths, factions, clocks, revelations, and multiple end states. A separate adjudicator converts player assertions into attempts, checks them against authoritative state, and resolves consequential uncertainty. A mission director advances only causal pressures and presents the result through normal Star Trek roleplay rather than choice menus.

Character progression centers on two independent command styles, Inspiration and Resolve, while moral identity is expressed through Values, Directives, relationships, and consequences. Side stories function as episode B-plots that create meaningful Command Moments and grounded rewards.

Saga provides a valuable technical starting point for the shell, shelf, mobile navigation, provider routing, structured generation, storage, state safety, prompt integration, UI primitives, and testing. The new extension should nevertheless have its own identity, schema, mission model, turn ledger, and domain architecture. It should be descended from Saga, not implemented as Star Trek mode inside Saga.
