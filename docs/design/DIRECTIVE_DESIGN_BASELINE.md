# Directive Design Baseline

## Status

This file records Directive's current product and system baseline. It synthesizes the more detailed design, package, campaign, persistence, and architecture documents without replacing them.

Directive is pre-alpha. When a better model is established, update docs, schemas, package data, fixtures, and runtime code in place. Do not preserve legacy compatibility paths for old pre-alpha data unless a concrete current need requires it.

Do not invent new mechanics here. If a gameplay or mechanics point remains unresolved, add or keep it in [../planning/CLARIFYING_QUESTIONS.md](../planning/CLARIFYING_QUESTIONS.md). If this file conflicts with a refined system document, resolve the conflict by updating the refined document and this baseline together.

## Refined Source Documents

The current baseline is refined by:

- [Command Bearing System](COMMAND_BEARING_SYSTEM.md)
- [Command And Morality Model](COMMAND_AND_MORALITY_MODEL.md)
- [LCARS Visual Identity](LCARS_VISUAL_IDENTITY.md)
- [Directive Expanded Interface Contract](DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md)
- [Directive Assist](DIRECTIVE_ASSIST.md)
- [Chat-Native Command Intent](CHAT_NATIVE_COMMAND_INTENT.md)
- [Character Creator Model](CHARACTER_CREATOR_MODEL.md)
- [Mission Director Model](MISSION_DIRECTOR_MODEL.md)
- [Crew And Relationship Model](CREW_AND_RELATIONSHIP_MODEL.md)
- [Crew Development And Experience Model](CREW_DEVELOPMENT_AND_EXPERIENCE_MODEL.md)
- [Campaign Package Model](../packages/CAMPAIGN_PACKAGE_MODEL.md)
- [Campaign State Projection](../packages/CAMPAIGN_STATE_PROJECTION.md)
- [Prelude Mission Graph](../packages/PRELUDE_MISSION_GRAPH.md)
- [Ashes Of Peace Campaign](../campaigns/ASHES_OF_PEACE_CAMPAIGN.md)
- [Persistence And Continuity](../architecture/PERSISTENCE_AND_CONTINUITY.md)
- [Mission Director Contracts](../architecture/MISSION_DIRECTOR_CONTRACTS.md)
- [Mission Director As-Coded](../architecture/MISSION_DIRECTOR_AS_CODED.md)

## Product Statement

Directive is a persistent, freeform Star Trek command RPG for SillyTavern. The player writes ordinary natural-language roleplay, while the extension enforces established facts, Starfleet authority, character competence, technological limits, and persistent consequences.

The game should feel permissive in expression, strict in causality, episodic in structure, persistent in consequence, and recognizably grounded in Star Trek.

## Locked Direction

- Extension title: `Directive`
- Extension key and runtime namespace: `directive`
- Initial version target: `0.1.0-pre-alpha.1`
- Platform: SillyTavern extension with host-neutral internal contracts and fake-host tests
- Product model: package-first starship command RPG
- Campaign package transport extension: `.directive-campaign.zip`
- First bundled package: `U.S.S. Breckenridge: Ashes of Peace`
- First package id: `directive:campaign-package:breckenridge-ashes-of-peace`
- First starship: U.S.S. Breckenridge, Intrepid-class
- First campaign: `Ashes of Peace`
- First campaign source version: `0.2`
- Opening stardate: `53049.2`
- Baseline Reach arrival stardate after the prelude: `53076.6`
- Opening year: 2376, Post-Dominion War
- First campaign theater: Asterion Reach
- First supported role: Starfleet Commander by rank, Executive Officer by billet
- Player function: principal mission commander and coordinator of shipboard operations
- Captain boundary: Captain Mara Whitaker retains final legal command
- First playable mission: Prelude, `A Ship Underway`
- Narration: handled by the active host chat model
- Directive provider roles: structure, parsing, adjudication, mission/story director support, summaries, and diagnostics
- Structured state: authoritative over chat prose
- Canon packs: deferred for now; use package guardrails for the first slice
- Raw simulation values: hidden from the player except in debug or developer surfaces
- Runtime UI shell: viewport-bound expanded Directive interface with one shared LCARS frame and persistent five-route navigation across desktop/console and phone layouts
- Runtime visual identity: UX-first LCARS-led Starfleet command-console UI adapted to Directive's host constraints

## Product Boundaries

Directive should not become:

- A dialogue tree.
- A visual novel with one correct scene order.
- A random mission generator without authored causal structure.
- An unrestricted fanfiction narrator that accepts every assertion.
- A combat-first tactical simulator.
- A starship spreadsheet that overwhelms roleplay.
- A Voyager retelling with the serial numbers changed.
- A binary morality system.
- A good/evil, Paragon/Renegade, or third numeric morality meter.
- A generic crew XP or approval-bar RPG.
- A captain fantasy where every subordinate validates the player.
- A branch-table campaign that prewrites every possible future.

## Campaign Package Baseline

Directive revolves around campaign packages. A package is a campaign-capable content bundle, not a skin over one hardcoded campaign. The Breckenridge is the first package, not the whole product model.

The working package spine is:

```text
manifest
ship
crew
characterCreation
world
storyArcs
questTemplates
threadTemplates
reactionRules
directorCards
contextPolicy
guardrails
assets
```

Package-owned data includes ship and crew templates, package-local character creation context, world definitions, story arcs, quest templates, thread templates, reaction rules, Director cards, guardrails, context policy, faction templates, starting relationship seeds, and passive assets.

Campaign-owned data includes the player character, current ship state, tactical mission working state, quest ledger, attention state, dynamic quest catalog, story arc ledger, event ledger, thread ledger, knowledge ledger, relationship evolution, actor/front/clock state, known and hidden facts revealed during play, Command Log records, turn ledger entries, and divergences.

Package templates are immutable during play. Campaign saves pin the package id and version used at creation, then treat campaign state as authoritative. Bundled packages, imported packages, and future Creator-made packages should normalize through the same validation path.

Packages must remain data-only. Import should reject unsafe paths and active file types. Scripts, HTML, executable content, and scriptable SVG are not valid package content.

## First Campaign Baseline

The first package centers on the Breckenridge, its reconstituted senior crew, and the Ashes of Peace campaign in the Asterion Reach. The player arrives as the new long-term XO during the final ten days of transit to the Reach. Bronn has served as acting XO for the yard departure and initial shakedown while retaining tactical responsibility.

The ship is relatively new as an ensemble. The reconstituted crew has spent twenty-five days underway together, enough for basic working impressions but not enough for deep trust, settled command culture, or mature relationship arcs.

The Breckenridge has returned to service after a four-month repair and modernization period at Utopia Planitia. It is certified for service, but several upgraded systems still require integrated validation under sustained deployment conditions. Its known technical debt is part of the campaign state.

Ashes of Peace is a postwar reconstruction, relief, survey, investigation, and diplomacy campaign. The Asterion Reach survived the Dominion War by forming the Asterion Mutual Aid Compact, and the campaign asks what Federation ideals require after Federation institutions have failed to live up to them.

The deeper campaign threat is Pale Lantern, a distributed Dominion contingency system that weaponizes distrust through forged evidence, traffic redirection, authentication manipulation, and selective information. Pale Lantern exploits real grievances. It does not create all of them.

The Breckenridge's starting directives are to:

1. Restore reliable Starfleet presence in the Asterion Reach.
2. Protect civilian life and freedom of navigation.
3. Support humanitarian and reconstruction operations.
4. Survey wartime damage to communications, navigation, and subspace infrastructure.
5. Investigate counterfeit Starfleet signals and missing relief cargo.
6. Avoid prejudicing Federation negotiations concerning the Asterion Mutual Aid Compact.
7. Coordinate with local civil authorities without assuming command unless a lawful emergency requires it.

Ashes of Peace state tracks include Regional Trust, Lantern Escalation, Humanitarian Strain, Starfleet Scrutiny, Compact Unity, crew relationship state, and campaign assets. Raw track values remain hidden in normal play.

The full campaign structure is one prelude mission, eight main chapters, three Open Orders intervals, nine designed side assignments, recurring shipboard B-plots, a multi-front finale, and an epilogue command review. Expected campaign length is roughly 25-40 Sessions.

Side missions and Open Orders assignments occur between main campaign beats according to package design. They are not continuity-free diversions. They must inherit current ship condition, crew relationships, unresolved obligations, and relevant campaign consequences, then commit outcomes back into the same continuity.

## Character Creator Baseline

Character creation is package-driven. The selected campaign package supplies the era, service context, ship, role rules, allowed species, career backgrounds, formative experiences, assignment reasons, continuity guardrails, and local fallback text.

Ashes of Peace uses a locked role: incoming permanent Commander and Executive Officer of the U.S.S. Breckenridge.

The creator flow is:

1. Identity.
2. Service.
3. Personality.
4. Review and begin.

The target completion time is three to five minutes. The player chooses a small number of meaningful facts, then reviews an editable generated dossier. The creator is not a point-buy system, skill-sheet builder, equipment screen, or relationship creator.

Generated dossier material is draft material. The player can edit, remove, regenerate, or intentionally leave details undefined. Provider failure must not block campaign start; the runtime must be able to produce a minimal local fallback dossier.

The creator must not quietly invent major personal facts such as secret ancestry, hidden powers, criminal history, severe trauma, canonical relationships, current-crew friendships, or old romances unless the player explicitly asks for them.

Inspiration and Resolve begin neutral. They are earned through play, not selected during character creation.

## Mission Director Baseline

The Mission Director manages situations, not plots. It protects dramatic questions, causal integrity, hidden truth, authority limits, and persistent consequences. It does not protect required scene order.

Campaigns are simulated through immutable facts and active pressures, not precomputed branch trees. Package-authored story material should define past facts, actor agendas, active pressures, fronts, clocks, resources, constraints, revelation pools, pressure cadence, action windows, and possible end states.

The Director should preserve:

- Hidden truth.
- Actor goals.
- Clocks and consequences.
- Authority and capability limits.
- Mission directives.
- Character relationships.
- End-state logic.

The Director should not preserve:

- Required scene order.
- Required NPC conversation.
- A single clue path.
- A single correct technical solution.
- A single moral reading of the situation.

Consequential actions use this packet spine:

```text
sceneSnapshot
intentParse
actionClassification
authorityCapabilityCheck
directorResponse
outcomePacket
stateDelta
narratorPacket
commandLogPacket
```

Narration is downstream from committed structure. The active SillyTavern model may present scene prose, voice NPCs, and describe approved consequences. It may not decide hidden truth, override committed state, grant progression, resolve mission end states, or turn a failed or partial action into full success through prose.

Unexpected player actions are classified as:

- `validWithinMissionBounds`
- `missionRelevantLateralMove`
- `missionAbandoningMove`
- `impossibleOrUnsupportedMove`

Mission-abandoning moves are command decisions, not automatic refusals. Captain Whitaker may approve, refuse, or counteroffer based on evidence, urgency, feasibility, orders, risk, relationship state, and command posture. Captain authority is a real command constraint, not a plot wall.

The first executable Director slice proves Hesperus accountability, repeated Command Decision protection, Captain-approved deviation, Captain-refused deviation, Captain-counteroffered deviation, impossible command refusal, narrator-safe packet assembly, Command Log packet assembly, and in-memory transaction-state behavior.

## Adjudication Baseline

Directive is deterministic-first. If the player makes good, reasonable choices with adequate authority, knowledge, preparation, and available crew capability, they should generally receive success or partial success.

Uncertainty should come from incomplete information, hidden actor goals, time pressure, competing constraints, system damage, technical debt, credibility, authority, leverage, preparation, and prior consequences. Any randomness or volatility must be bounded, explainable, and fair.

Directive uses six outcome bands:

- Great Success
- Success
- Partial Success
- Partial Failure
- Failure
- Great Failure

Failure should move the campaign forward through cost, pressure, lost time, damaged trust, injury, system strain, harder clue routes, faction leverage, harder decisions, or changed future access. Great Failure must arise from established risk and must not introduce arbitrary catastrophe unrelated to the action.

## Command And Morality Baseline

Directive has no morality score. It separates:

- Command style: how the player influences, coordinates, pressures, delegates, and accepts responsibility.
- Values: what the player believes should matter.
- Directives: external obligations such as orders, regulations, classifications, rules of engagement, and promises.
- Consequences: what actually changes because of decisions.

The active command-style progression model is Command Bearing.

Command Bearing has two independent tracks:

- Inspiration: leadership through trust, shared purpose, transparency, dignity, mentorship, and voluntary cooperation.
- Resolve: leadership through commitment, discipline, credible authority, preparedness, boundaries, and accepted responsibility.

Neither style is inherently ethical or unethical. Relationships, reputation, Values, Directives, mission results, and Command Log continuity respond to the player's actual conduct and consequences.

Every player character begins at Rank I in both tracks with no Marks, no points, and a one-point shared Command Reserve. Ranks advance independently at cumulative Mark thresholds 0, 2, 5, 9, and 14. The shared reserve has an absolute maximum of two points.

One eligible Command Bearing point can improve a Provisional Outcome by two tiers before the Final Outcome is committed:

- Great Failure to Partial Failure
- Failure to Partial Success
- Partial Failure to Success
- Partial Success to Great Success

A point cannot improve Success or Great Success, make an impossible action possible, bypass missing authority, replace specialist expertise, override NPC agency, change established history, erase hidden truth, or remove Anchored Consequences already accepted by the action.

Command Bearing is now the authoritative state model. Pre-alpha saves that still contain older progression data should be updated in place to `commandBearing`; the runtime does not preserve older loose command-style terms as compatibility state.

## Crew And Relationship Baseline

The first package's approved senior crew is:

- Captain Mara Whitaker: commanding officer; principled strategic authority; faith in institutional correction.
- Lieutenant Kieran Vale: flight control officer; gifted test pilot; ambition, mentorship, and controlled risk.
- Lieutenant Priya Nayar: operations officer; coordination, informal influence, and ethical boundaries.
- Lieutenant Commander Hadrik Bronn: chief tactical and security officer; veteran Tellarite; preparedness, discipline, and operational scrutiny.
- Lieutenant Commander Rowan Saye: chief science officer; evidentiary rigor, dissent, and institutional skepticism.
- Commander Miriam Sato: chief medical officer; medical reality, bioethics, casualty burden, and honest cost.
- Lieutenant Commander Imani Cross: chief engineer; technical integrity, autonomy, identity, and long-term consequence.

Relationships do not collapse into one approval score. Senior crew relationship state tracks at least:

- Professional confidence.
- Integrity trust.
- Personal rapport.

Raw values stay hidden. The player should experience relationship state through officer behavior, debrief summaries, Command Log summaries, crew dossiers, and consequences. The memory ledger is the source of truth for why an NPC behaves differently.

Senior officers may advise, disagree, request private meetings, develop crew-to-crew relationships, pursue personal goals, make mistakes, or conceal information for character-specific reasons. They should not routinely refuse lawful orders, sabotage plans, or create melodrama solely to prove independence.

## Crew Development Baseline

Use a Crew Development System, not generic character leveling.

Senior staff are already trained professionals. Development tracks how they change under the player's command culture, what responsibility they are ready to carry, how they learn from success and failure, and which personal pressures resolve, deepen, or remain concealed.

Initial hidden development dimensions are:

- Operational Experience.
- Player Mentorship.
- Personal Arc Progress.
- Command Confidence.
- Professional Strain.

Development should surface through changed advice, new scenes, dossier updates, delegated options, initiative, recovery, strain, Command Log summaries, and mission behavior. Avoid visible XP bars, farmable approval points, generic affection meters, automatic victories, or hidden regressions that have no narrative expression.

Development Moments require meaningful stakes, engagement with the officer's actual concern, a real change, accepted cost or accountability, and non-duplication. Routine conversations, empty praise, or model-generated scenes that do not commit state should not advance development.

## Persistence And Continuity Baseline

Structured state is authoritative. Chat prose is presentation.

Initial campaign state domains are:

```text
campaign
activeCampaignPackage
player
crew
ship
mission
worldState
storyArcLedger
questLedger
dynamicQuestCatalog
knowledgeLedger
threadLedger
eventLedger
attentionState
pressureLedger
relationships
commandCulture
commandBearing
values
directives
canon
campaignTracks
campaignAssets
turnLedger
commandLog
ui
settings
```

Settings should be control plane only. User-owned or campaign-owned content should live in indexed flat files under SillyTavern's `/user/files` area. Directive should support multiple campaign saves from the first playable runtime with `Save Game`, `Save Game As`, and `Load Game`.

A campaign is the long-running playthrough identity. A save is a named restorable snapshot or branch of that campaign. Character Creator drafts are separate records from campaign saves.

Turn mechanics and narration generation are separate steps. Swiping narration should regenerate prose from the same committed mechanics by default. An explicit `Rerun Outcome` action may create a new mechanical outcome candidate, but the previous committed outcome must remain recoverable until the player accepts the replacement.

The Command Log is player-facing continuity support, not the source of truth. It must be generated from committed state and stored outcome packets, and it must not expose hidden state refs, raw relationship values, or debug-only fields.

## Simulation Modes

The approved public simulation modes are:

- Exploration
- Command

Command is the full simulation mode. It uses the Story Director, deterministic adjudication, hidden state, relationship pressure, operational consequences, and fair but serious failure states. Death can exist, but senior staff death or player death requires severe causal setup, clear warning where plausible, and meaningful command failure.

Exploration is the story-forward mode. It uses the same causal state with softer Director and narration guardrails. Senior staff and the player character cannot die in Exploration mode, relationship damage should be more recoverable, and severe mission consequences should prefer delay, cost, obligation, injury, loss of advantage, or future pressure over permanent catastrophe.

Both modes must remain fair. Exploration does not erase causality, and Command does not cheat against the player.

## UI Direction

Directive remains chat-first. The extension UI supports orientation, state inspection, campaign/package management, save/load behavior, and debugging.

Directive's SillyTavern shell is a viewport-bound, full-screen game menu. A narrow Voyager-era LCARS rail, fixed top chrome, bounded route content, and the same five-route bottom bar form the shared desktop/console and phone frame. Do not add panel-owned primary navigation, resize handles, floating shell controls, or route-history Back behavior. Long content scrolls inside Directive-owned bounded regions.

Primary routes are Campaign, Mission, People, Ship, and Settings:

1. Campaign
2. Mission
3. People
4. Ship
5. Settings

Campaign is the package, timeline, chat, and checkpoint entry point. Mission, People, and Ship reflect player-safe active campaign state. Settings owns provider/profile configuration, guidance, diagnostics export, and safety controls. The Command Log remains campaign information rather than a primary route.

The player may see current stardate and location, formal mission objectives, known directives, public deadlines, major ship conditions, current crew assignments, named favors or assets, Values, approved Inspiration and Resolve progression, and Command Log summaries.

The player should not see raw relationship values, secret actor goals, exact faction clocks, undiscovered mission truth, untriggered Command Decisions, Director-only end-state logic, internal command-culture scores, valid solution lists, or hidden Pale Lantern architecture.

## First Vertical Slice Baseline

The first playable slice should prove the command experience, not the breadth of Star Trek.

The selected first mission is Prelude: `A Ship Underway`. It covers shuttle rendezvous, ready-room handoff, senior readiness conference, fallback-command drill, command rhythm scenes, the Hesperus diversion, Hesperus aftermath, combined-load test, final command review, and arrival at the Reach.

The prelude is a prepared pressure package, not a fixed story script. It cannot prevent the campaign from starting. Poor play may create delay, technical debt, reduced trust, cohort tension, administrative scrutiny, or Chapter 1 limitations. It must not destroy the ship, remove a senior officer, or create a punitive bad start without visible cause.

The vertical slice should include:

- The Breckenridge package.
- The package-driven Character Creator.
- A player-created Commander/XO.
- The approved senior crew.
- The `A Ship Underway` mission graph.
- At least two active pressures or fronts.
- One meaningful ship-system or operational tradeoff.
- One moment where officers provide conflicting but valid professional advice.
- One concealed Command Decision that can award Inspiration or Resolve when earned.
- One unanticipated player solution resolved through general rules.
- A debrief or Command Log result that records relationships, consequences, and future hooks.
- Save creation and restore behavior for the initialized campaign state.

The current executable slice already proves the Hesperus accountability path, repeated-award protection, mission deviation approval/refusal/counteroffer, impossible-command refusal, narrator-safe packets, Command Log packets, and in-memory transaction-state operations. Durable runtime storage, provider failure recovery, Exploration-mode softening, broader actor/front updates, and full Command Bearing intervention prompts remain implementation work.
