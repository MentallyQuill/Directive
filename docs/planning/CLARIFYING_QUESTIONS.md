# Clarifying Questions

This file is the holding area for design, gameplay, and mechanics decisions. Do not implement unresolved mechanics by guessing.

## Immediate Questions

1. What is the Breckinridge registry number?
   This needs workshop.

2. Is `Whitaker` now final for Captain Mara, or still a working surname?

3. What is Captain Breckinridge's full name, former command, and memorial record?

4. What final names, classes, and histories should define the two principal donor ships used to reconstitute the crew?

5. Which crew relationship should the prelude foreground first if the player does not naturally choose a focus?

6. How should bounded randomness work, if at all?
    The current direction is deterministic-first and non-D&D.

7. What are the exact Inspiration and Resolve thresholds, unlocks, modifiers, and techniques?

8. How should Command Moments be detected?
    Authored mission tags, adjudicator inference, Director proposal, or combined review?

9. How can Values be changed or replaced, beyond recording affirmed, compromised, or challenged outcomes?
    Player-confirmed during debrief, inferred from repeated behavior, or only through authored moments?

10. What are the exact mechanical guardrails for Exploration mode?
    Current direction: curb worst outcomes, avoid crew death, and make relationship development more forgiving.

11. What level of senior crew death, permanent injury, reassignment, or resignation is allowed in Command mode?

12. Can future packages eventually place the player in a captain role, or should Directive's core engine assume XO-style delegated command and let packages emulate variants carefully?

13. How much campaign divergence from canon should trigger an alternate-continuity label?

14. How much raw provider output should be stored for diagnostics?

15. Should the Command Log include LLM-written prose summaries only, or also structured expandable factors for developer/debug mode?

16. How should side mission intervals be defined?
    Options include mission count, stardate/time passage, campaign beats, ship status, relationship triggers, unresolved obligations, or a hybrid.

17. Should generated side missions come from authored templates, provider-assisted generation under package constraints, or both?

18. How much Captain autonomy should be explicit state versus prompt guidance?

19. What exact fields define Captain Whitaker's trust, risk tolerance, and tolerance for mission deviation?

20. How should mission-abandoning moves be surfaced in the Command Log?

## Resolved Decisions

- Starship package share/import transport extension: `.directive-starship.zip`.
- Opening stardate: `53049.2`.
- First campaign: `Ashes of Peace`.
- Primary theater: Asterion Reach.
- Main campaign antagonist/threat architecture: Pale Lantern.
- Public simulation mode labels: `Exploration` and `Command`.
- `Command` is full simulation mode with the Story Director, deterministic adjudication, hidden state, and serious but fair consequence handling.
- `Exploration` is story-forward mode that adjusts prompts to curb worst outcomes, avoid crew death, and make relationship development more forgiving.
- Package and mission content should be modular loadable JSON. The Breckinridge package should follow the same JSON package schema as imported and future Creator-made packages.
- Working starship package JSON spine: `manifest`, `ship`, `crew`, `mainCampaign`, `sideMissionRules`, `missionTemplates`, `guardrails`, `assets`.
- Each starship package contains its own main campaign or questline.
- Side missions are generated at intervals based on the package's campaign design and must carry persistent ship, crew, relationship, and campaign state into and out of the mission.
- Inspiration and Resolve are independent command-style tracks, not morality opposites.
- Inspiration and Resolve should unlock techniques or provide modifiers, not automatic victories.
- Morality is represented through Values, Directives, relationships, Starfleet standing, and recorded consequences, not a third numeric morality score.
- The Mission Director is a situation manager, not a fixed plot script.
- The Mission Director should protect dramatic question, causal integrity, and persistent consequences rather than required scene order.
- Ashes of Peace begins with the prelude mission `A Ship Underway`, followed by eight main chapters, three Open Orders intervals, nine designed side assignments, a multi-front finale, and an epilogue.

## Backstory Questions

Each senior officer needs:

- Prior postings.
- Why they are aboard the Breckinridge.
- Who they already know.
- What they think of the previous temporary XO.
- Initial reaction to the player as permanent XO.
- Private pressure or unresolved thread.
- First B-plot seed.

## Package Questions

- Can a package include optional alternate crew members?
- Can a package include custom UI art and portraits?
- Are mission packs separate from starship packages, or nested inside them?
- Can one campaign switch starship packages, or only start a new campaign from a different package?
- How are package updates applied to an existing campaign?
- Should Starship Creator and Mission Creator drafts use separate draft-project storage from finalized packages?
- Should Starship Creator be form-first, LLM-assisted, or staged like Saga's Deck Maker pattern?
- Should Mission Creator create missions only for a selected starship package, or support package compatibility tags?
