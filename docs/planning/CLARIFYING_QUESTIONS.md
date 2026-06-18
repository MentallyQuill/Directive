# Clarifying Questions

This file is the holding area for design, gameplay, and mechanics decisions. Do not implement unresolved mechanics by guessing.

## Immediate Questions

1. What exact opening stardate should the Breckenridge campaign use?
   Current direction: just after "Message in a Bottle", after stardate `51462.0`.

2. Should starship packages contain one default campaign start, multiple campaign starts, or both?
   Clarify whether the approved direction is one required default plus optional alternate starts.

3. What is the Breckenridge registry number?
   This needs workshop.

4. Is `Whitaker` now final for Captain Mara, or still a working surname?

5. What is Captain Breckenridge's full name, ship, service history, and exact action at Wolf 359?

6. What is the Breckenridge's primary assignment and home sector?

7. What is the first mission premise?
   Current direction: relatively mundane A-plot, heavier B-plot, focused on the new XO settling into command culture.

8. Which crew relationship should the first mission foreground?

9. What do the two simulation modes change?
    Approved labels: `Exploration` and `Command`.
    Options include warning level, off-ramps, consequence severity, lethality, Director leniency, or resolution thresholds.

10. How should bounded randomness work, if at all?
    The current direction is deterministic-first and non-D&D.

11. Are Inspiration and Resolve passive scores, spendable resources, unlocked techniques, or a hybrid?

12. How should Command Moments be detected?
    Authored mission tags, adjudicator inference, Director proposal, or combined review?

13. How can Values change?
    Player-confirmed during debrief, inferred from repeated behavior, or only through authored moments?

14. What level of senior crew death, permanent injury, reassignment, or resignation is allowed in Exploration versus Command?

15. Can future packages eventually place the player in a captain role, or should Directive's core engine assume XO-style delegated command and let packages emulate variants carefully?

16. How much campaign divergence from canon should trigger an alternate-continuity label?

17. How much raw provider output should be stored for diagnostics?

18. Should the Command Log include LLM-written prose summaries only, or also structured expandable factors for developer/debug mode?

## Resolved Decisions

- Starship package share/import transport extension: `.directive-starship.zip`.
- Public simulation mode labels: `Exploration` and `Command`.
- Opening era: just after Voyager's "Message in a Bottle", after stardate `51462.0`.
- Package and mission content should be modular loadable JSON. The Breckenridge package should follow the same JSON package schema as imported and future Creator-made packages.

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
- Are mission packs separate from starship packages, or nested inside them?
- Can one campaign switch starship packages, or only start a new campaign from a different package?
- How are package updates applied to an existing campaign?
- Should Starship Creator and Mission Creator drafts use separate draft-project storage from finalized packages?
- Should Starship Creator be form-first, LLM-assisted, or staged like Saga's Deck Maker pattern?
- Should Mission Creator create missions only for a selected starship package, or support package compatibility tags?
