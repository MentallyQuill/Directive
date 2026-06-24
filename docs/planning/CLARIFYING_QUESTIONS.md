# Clarifying Questions

This file is the holding area for design, gameplay, and mechanics decisions. Do not implement unresolved mechanics by guessing.

## Immediate Questions

1. Is `Whitaker` now final for Captain Mara, or still a working surname?

2. What is Captain Breckenridge's full name, former command, and memorial record?

3. What final names, classes, and histories should define the two principal donor ships used to reconstitute the crew?

4. Which crew relationship should the prelude foreground first if the player does not naturally choose a focus?

5. How should bounded randomness work, if at all?
    The current direction is deterministic-first and non-D&D.

6. Which Ashes of Peace B-stories and Command Crucibles can award Command Marks?
   Resolved system direction: Command Bearing uses Rank I-V thresholds at 0, 2, 5, 9, and 14 cumulative Marks per track.

7. How should Command Decisions be detected?
    Authored mission tags, adjudicator inference, Director proposal, or combined review?

8. How can Values be changed or replaced, beyond recording affirmed, compromised, or challenged outcomes?
    Player-confirmed during debrief, inferred from repeated behavior, or only through authored moments?

9. What are the exact Exploration-mode prompt structures and data switches?
    Resolved guardrail: senior staff and the player cannot die in Exploration, but can be injured, incapacitated, relieved, stranded, or otherwise removed from a fight when causally justified.

10. What exact failure-policy language should define senior crew death, permanent injury, reassignment, or resignation in Command mode?
    Resolved direction: death is real but rare, injury/incapacitation is more likely, and reassignment/resignation is less likely during a campaign.

11. Can future packages eventually place the player in a captain role, or should Directive's core engine assume XO-style delegated command and let packages emulate variants carefully?

12. How much campaign divergence from canon should trigger an alternate-continuity label?

13. How much raw provider output should be stored for diagnostics?

14. Should the Command Log include LLM-written prose summaries only, or also structured expandable factors for developer/debug mode?

15. How should side mission trigger weighting and cadence work?
    Resolved direction: side missions are driven by unresolved pressures, relationship pressures, and campaign beats. Remaining work is deciding priority, cooldowns, and escalation timing.

16. Should generated side missions come from authored templates, provider-assisted generation under package constraints, or both?

17. What exact starting values and update rules should Captain Whitaker's hidden command-posture fields use in the Ashes projection?
    Resolved direction: initial Ashes projection now includes Whitaker's relationship baselines, relationship memory ledger, and captain-specific state fields. Remaining work is update rules.

18. How should mission-abandoning moves be surfaced in the Command Log?

19. What exact save payload split should the first runtime use?
    Resolved direction: support Save Game, Save Game As, Load Game, first save after Character Creator review, rolling autosaves, and recovery snapshots.

20. What exact Ashes of Peace Character Creator options should the package provide?
    Resolved direction: the bundled package now provides locked XO role copy, age bands, allowed species, career backgrounds, formative experiences, assignment reasons, trait choices, flaws, dossier limits, generation rules, continuity guardrails, and local fallback templates.

21. What exact provider prompt and local-template text should the Character Creator use for generated dossiers?
    Local fallback templates are now package data. Remaining work is the provider prompt and response contract.

22. What diagnostics should appear when a package update changes ids or fields used by an in-progress campaign?

23. Which Ashes of Peace intervals qualify as Recovery for Command Bearing?
    Examples might include safe sleep periods, duty-cycle resets, safe transit, shore leave, emergency stand-down, or chapter transitions.

24. Should Ashes of Peace begin after a qualifying Recovery and allow the player to choose one opening Inspiration or Resolve Point?

25. What exact first UI copy should Directive use for Command Bearing intervention prompts, Mark awards, and Recovery prompts?

## Resolved Decisions

- Campaign package share/import transport extension: `.directive-campaign.zip`.
- U.S.S. Breckenridge registry: `NCC-74638`.
- Opening stardate: `53049.2`.
- First campaign: `Ashes of Peace`.
- Primary theater: Asterion Reach.
- Main campaign antagonist/threat architecture: Pale Lantern.
- Public simulation mode labels: `Exploration` and `Command`.
- `Command` is full simulation mode with the Story Director, deterministic adjudication, hidden state, and serious but fair consequence handling.
- `Exploration` is story-forward mode that adjusts prompts to curb worst outcomes, avoid crew death, and make relationship development more forgiving.
- Character Creator is a campaign-agnostic three-step flow plus review: Identity, Service, Personality, Review and begin.
- Character Creator options are package-provided. The core creator must not assume a specific ship, era, war, captain, faction, or historical event.
- Character Creator produces a brief editable dossier with local fallback if provider generation fails.
- Package and mission content should be modular loadable JSON. The Breckenridge package should follow the same JSON package schema as imported and future Creator-made packages.
- Working campaign package JSON spine: `manifest`, `ship`, `crew`, `characterCreation`, `world`, `storyArcs`, `questTemplates`, `threadTemplates`, `reactionRules`, `directorCards`, `contextPolicy`, `guardrails`, `assets`.
- Package schema now includes `characterCreation` as a package-owned domain.
- Each campaign package contains its own main campaign or questline.
- Side missions are generated at intervals based on the package's campaign design and must carry persistent ship, crew, relationship, and campaign state into and out of the mission.
- Side missions are triggered by unresolved pressures, relationship pressures, and a hybrid of campaign beats; if the player avoids them, pressure builds toward realistic consequences.
- Inspiration and Resolve are independent command-style tracks, not morality opposites.
- Inspiration and Resolve should unlock techniques or provide modifiers, not automatic victories.
- Command Bearing is the active Inspiration and Resolve progression/intervention system.
- Command Bearing uses typed Command Marks, independent Bearing Ranks, and a shared Command Reserve capped at two total points.
- Bearing Rank thresholds are I at 0 Marks, II at 2, III at 5, IV at 9, and V at 14.
- Ranks II and IV provide narrative recognition rather than passive outcome bonuses.
- A valid Inspiration or Resolve Point spend improves an eligible Provisional Outcome by two tiers and cannot be spent on an existing Success or Great Success.
- Command Bearing Points cannot make impossible actions possible, erase Anchored Consequences, override NPC agency, or stack Inspiration and Resolve on the same action.
- Recovery is campaign-defined and must use unique in-world interval ids.
- Morality is represented through Values, Directives, relationships, Starfleet standing, and recorded consequences, not a third numeric morality score.
- The Mission Director is a situation manager, not a fixed plot script.
- The Mission Director should protect dramatic question, causal integrity, and persistent consequences rather than required scene order.
- Default swipes regenerate narration from committed mechanics. The player should also have an explicit option to rerun mechanics for a swipe, trusting the player not to abuse that capability.
- Player-facing swipe labels: `Rewrite Narration` for prose-only regeneration and `Rerun Outcome` for explicit adjudication reruns.
- Directive should support multiple saves from the first runtime slice with Save Game, Save Game As, and Load Game behavior.
- Starting a campaign should create the package-required player character before writing the first save. The first save is created after Character Creator review is accepted.
- The first runtime should use rolling autosaves, recovery snapshots before high-risk state changes, and pending-narration recovery rather than overwriting stable autosaves with failed provider output.
- Exploration mode dynamically changes Director and provider prompt structures toward softer complications. Senior staff NPCs and the player character cannot die in Exploration, but may be injured or removed from active danger when causally justified.
- Captain Whitaker's trust, risk tolerance, and mission-deviation tolerance should be explicit hidden state. The player can learn about these tendencies through in-character conversation and observation, but raw values remain hidden.
- Senior NPCs should not use one approval score. Relationship state uses hidden `professionalConfidence`, `integrityTrust`, and `personalRapport` tracks.
- Relationship values use an internal `0-100` scale and are converted to qualitative bands before narration.
- Relationship memory ledgers are the source of truth. Numeric fields summarize accumulated memories and support thresholds; they do not replace remembered events and interpretations.
- Whitaker hidden posture fields include `delegationScope`, `commandReadiness`, `publicBacking`, `oversightPressure`, `mentorshipInvestment`, `institutionalFaith`, `defianceReadiness`, and `shipAttachment`.
- Minor mission NPCs can use compact state: goal, fear, leverage, stance toward player, red line, known facts, concealed fact, and important memory.
- Command mode death is possible but rare and heavily causal. Injury, incapacitation, and being taken out of action for several days are more likely than death. Reassignment or resignation should usually require sustained pressure, repeated breach, or a major story consequence.
- Crew relationship and development changes do not require direct conversation. Player choices, observed command behavior, delegation, and consequences can all affect trust, allegiance, and development.
- How much relationship state affects professional behavior is officer-specific and must be defined by personality and background.
- Package updates may affect in-progress campaigns during alpha. Future save-breaking changes may require a campaign updater, but there is no pre-alpha legacy-compatibility requirement yet.
- Ashes of Peace begins with the prelude mission `A Ship Underway`, followed by eight main chapters, three Open Orders intervals, nine designed side assignments, a multi-front finale, and an epilogue.

## Backstory Questions

Each senior officer needs:

- Prior postings.
- Why they are aboard the Breckenridge.
- Who they already know.
- What they think of the previous temporary XO.
- Initial reaction to the player as permanent XO.
- Private pressure or unresolved thread.
- First B-plot seed.

## Package Questions

- Can a package include optional alternate crew members?
- Can a package include custom UI art and portraits?
- Are mission packs separate from campaign packages, or nested inside them?
- Can one campaign switch campaign packages, or only start a new campaign from a different package?
- What does the eventual campaign updater need to do when package updates break existing campaign state?
- Should Starship Creator and Mission Creator drafts use separate draft-project storage from finalized packages?
- Should Starship Creator be form-first, LLM-assisted, or staged like Saga's Deck Maker pattern?
- Should Mission Creator create missions only for a selected campaign package, or support package compatibility tags?
