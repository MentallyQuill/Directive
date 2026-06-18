# Directive Documentation

Directive documentation is organized as a development reference first. User-facing docs should be promoted later when the extension has working surfaces worth documenting.

## Design

- [Directive Design Baseline](design/DIRECTIVE_DESIGN_BASELINE.md): locked product premise, player role, first starship package, visible UI shape, and vertical-slice intent.
- [Command And Morality Model](design/COMMAND_AND_MORALITY_MODEL.md): established command-style principles, values, directives, adjudication posture, and unresolved mechanics questions.
- [Crew And Relationship Model](design/CREW_AND_RELATIONSHIP_MODEL.md): approved senior crew, relationship dimensions, hidden simulation policy, and open backstory work.

## Packages

- [Starship Package Model](packages/STARSHIP_PACKAGE_MODEL.md): package-first product model, Breckenridge as the first package, package contents, JSON storage direction, transport direction, and unresolved package questions.

## Architecture

- [Saga Reference Review](architecture/SAGA_REFERENCE_REVIEW.md): current review of Saga `refactor`, what to reuse, what to avoid, and the copy-vs-clean-build decision.
- [Source Architecture](architecture/SOURCE_ARCHITECTURE.md): proposed repo/module layout and ownership rules to avoid monolithic Saga-style files.
- [Persistence And Continuity](architecture/PERSISTENCE_AND_CONTINUITY.md): authoritative state, storage domains, hidden simulation state, and continuity boundaries.
- [Turn Transactions](architecture/TURN_TRANSACTIONS.md): transactional turn model for swipes, edits, deletions, branches, and provider failures.

## Testing

- [Testing Strategy](testing/TESTING_STRATEGY.md): first invariants, visual smoke direction, storage tests, transaction tests, and package import safety.

## Planning

- [Initial Development Sequence](planning/INITIAL_DEVELOPMENT_SEQUENCE.md): recommended order of work before the first playable slice.
- [Future Creator Tools](planning/FUTURE_CREATOR_TOOLS.md): future Starship Creator and Mission Creator planning, kept out of the first release but reflected in schema and architecture choices.
- [Clarifying Questions](planning/CLARIFYING_QUESTIONS.md): design, gameplay, mechanics, package, and content questions that should be answered before implementation decisions.

## Source Briefs

The current baseline comes from two source briefs copied into this repository:

- [Directive Game Design Document](source/Directive_Game_Design_Document.md)
- [Star Trek Command RPG Extension Project Brief](source/Star_Trek_Command_RPG_Extension_Project_Brief.md)

When a decision here conflicts with those briefs, update the relevant design doc and keep the question log current.
