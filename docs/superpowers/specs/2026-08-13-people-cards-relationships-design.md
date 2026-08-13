# People Cards and Relationships Design

## Goal

Directive automatically creates a campaign-scoped People Card when a directly encountered NPC gives the player a usable name, then keeps that card's public record and relationship history current from accepted, source-backed play.

## Product contract

- A third-party mention of a name does not create a card.
- A direct encounter creates a card once the NPC gives the player a usable name.
- Existing authored people keep authored public facts only.
- A newly emergent person receives one public dossier authored from the accepted introduction context. It may contain public identity and professional details, but never secrets, private motives, romance, hidden state, or future plot.
- Later accepted play can add or supersede public facts and relationship evidence.
- Relationship state is qualitative: current posture, an optional open matter, and an unbounded history of defining moments. There is no relationship score.
- Every defining moment remains available in the People panel. Entries use native tap/click accordions so the list stays compact without discarding history.
- Ordinary interaction evidence remains durable but does not automatically become a defining moment.
- Edits, swipes, deletes, branching, and reconstruction remove unsupported People data through the existing source-invalidation and replay authority.

## Authority model

People data is not a parallel mutable profile store. Each Story Settlement episode may contain an append-only `peopleEvents` ledger with three event types:

- `personIntroduced`: assigns one runtime-owned stable person ID to a source-backed direct introduction and optionally carries the one-time public dossier.
- `publicFactLearned`: appends one allowlisted public fact for an existing stable person ID. The latest surviving event for a field wins.
- `relationshipEvidence`: records a concise, observable interaction outcome for later episode evaluation.

All events cite accepted Story Settlement contribution IDs. Runtime code validates IDs, fields, source custody, sizes, and cross-references before persistence. Models propose observations; models never mutate cards directly and names are never durable keys.

## Model-call budget

The existing `acceptedPairMissionEvidence` Utility call gains one bounded `peopleEvents` result array and a compact directory of known people. It evaluates all people in the accepted pair together. No Utility call runs per person.

If the accepted pair contains one or more valid new introductions, Directive makes one batched `peopleDossierAuthor` Reasoner call for the entire introduction set. It runs only for those new stable IDs and is cached with the accepted-pair interpretation so a persistence retry does not repay completed model work. Failure still creates the minimal named card and does not trigger an automatic every-turn retry.

The existing `episodeEvaluator` Reasoner call receives a bounded projection of stored People events plus current relationship context. It may propose current-posture updates at a checkpoint and defining moments only at a meaningful seal. All involved people are evaluated in the same call.

## Public dossier fields

The runtime allowlist is:

- `displayName`
- `role`
- `affiliation`
- `species`
- `age`
- `birthplace`
- `serviceBackground`
- `assignmentHistory`
- `profileSummary`

Absent values are omitted. Emergent dossiers may author coherent public facts when the setting supports them. Authored roster entries are never overwritten by speculative dossier generation.

## Projection and prompt separation

The player-facing People projection combines the authored crew dataset with surviving dynamic introductions and fact events. It exposes the complete defining-moment history, newest first, with source references.

Narration receives a separate compact People prompt projection. It includes a compact known-person directory, current qualitative posture, open matters, and a globally bounded recent/relevant moment subset. Comprehensive storage and UI history therefore do not create unbounded prompt growth.

## People details panel

The existing hero remains intact. The body order is:

1. Profile.
2. Service Record for Starfleet personnel or Public Record otherwise.
3. Connection to You, containing Known since, Current posture, and Open matter when present.
4. Defining moments, with every entry represented as a collapsed native disclosure. The summary line is a short title; expansion reveals the full source-backed public description.

Empty values, rows, and sections are omitted. Newly introduced people use the existing portrait fallback until a portrait asset exists.

## Recovery and compatibility

Existing V1 saves without `peopleEvents` remain valid and project exactly as before except that existing character moments are no longer truncated to three. Source invalidation prunes People events by contribution ID, rebuilds surviving sealed episodes when necessary, and removes dynamic cards whose introduction no longer survives.

No new storage root, background scanner, vector database, relationship meter, identity auto-merge, or manual card editor is introduced.
