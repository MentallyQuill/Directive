# Native Chat Branch Timeline Design

## Status

Approved design for implementation planning.

This specification adds game-style timeline behavior when a player uses SillyTavern's native **Create Branch** action from the exact active Directive campaign chat. It also aligns Campaign-page Save Game and Load Game behavior with the same immutable timeline model.

## Problem

SillyTavern creates a branch by copying the selected transcript prefix into a new chat and opening it. Today, Directive intentionally binds campaign authority to one exact chat ID. The copied branch therefore opens as an ordinary, unbound chat: Directive clears its campaign prompt, does not settle its messages, and leaves the original campaign save active.

That behavior protects the save from cross-chat mutation, but it violates normal player expectations. A player who branches from an earlier message expects to continue the campaign from the game state at that message while preserving the timeline they left.

The feature must provide that behavior without:

- storing a complete campaign state after every message;
- repeating completed model interpretation work;
- trusting filenames or partial metadata as branch authority;
- mutating or overwriting the timeline the player left;
- enabling campaign generation while branch custody is ambiguous; or
- affecting ordinary SillyTavern chats merely because Directive is enabled.

## Product Model

Directive exposes three related concepts:

- **Active timeline:** the one campaign save and exact SillyTavern chat currently authorized for play.
- **Saved game:** an immutable state-and-chat checkpoint that may be renamed, loaded repeatedly, or deleted when it is not active.
- **Native chat branch:** a SillyTavern-created transcript fork which Directive converts into a new active timeline after proving its parent and retained lineage.

Creating or loading a timeline never overwrites another timeline. Loading a saved game creates a new active continuation. Leaving an active timeline through branching or loading preserves it automatically as a saved game.

## Player Experience

### Campaign Commands

The current campaign page uses conventional game language:

- **Continue** opens the exact active campaign chat.
- **Save Game** creates an immutable named save while leaving the active timeline unchanged.
- **Load Game** opens the saved-game selector.
- **Delete Campaign** remains separate from saved-game management.

`Save checkpoint` becomes `Save Game`. The saved-game list remains on the Campaign route and is also the source for the Load Game selector.

### Native Branch Flow

When SillyTavern opens a newly created branch from the exact active campaign chat:

1. Directive immediately clears the campaign prompt and prevents Directive campaign generation in the unbound branch.
2. Directive shows a non-interactive `Preparing new timeline` status while it verifies and commits the fork.
3. Directive preserves the timeline the player left as an immutable saved game.
4. Directive reconstructs state at the branch endpoint and binds the new chat as the active timeline.
5. Directive rebuilds the exact campaign prompt for the child timeline.
6. Directive opens a naming dialog for the saved parent timeline.

The naming dialog says:

> **Name Previous Timeline**
>
> Your previous timeline was saved so you can return to it.

Its input is prefilled with a player-facing suggested name such as:

> Prelude: A Ship Underway — Stardate 53068.4

When no stardate is available, the fallback uses the visible mission or chapter plus local date and time. Name collisions receive a deterministic numeric suffix.

Closing, cancelling, or submitting an empty name retains the suggested name. Renaming changes only the Directive saved-game label. It never renames the SillyTavern chat file, chat ID, or character.

The naming dialog is not an authority gate. The parent is already preserved under its suggested name before the dialog appears.

### Load Game Flow

Load Game lists immutable saved games, most recent first. Each entry shows:

- saved-game name;
- visible mission or chapter;
- stardate when known; and
- creation date.

Selecting an entry shows:

> Loading this save creates a new timeline. Your current timeline will be preserved automatically.

On confirmation, Directive preserves the current active timeline, clones the selected saved chat into a new playable SillyTavern chat, forks the selected state into a new active save identity, and switches the campaign to the new timeline. The selected saved game remains unchanged and may be loaded again.

### Failure Experience

If Directive cannot prove that a new chat is a safe native branch, it performs no campaign-state writes. The chat remains an ordinary unbound chat, campaign generation remains disabled there, and Directive offers **Return to Campaign**.

If a verified fork is interrupted, Directive reports that timeline preparation is incomplete and resumes the persisted transaction. It never invites the player to continue campaign play in an indeterminate chat.

## Authority Invariants

The implementation must maintain all of these invariants:

1. Only the exact active campaign chat can initiate automatic branch conversion.
2. A native branch is accepted only after exact parent, entity, and retained-lineage proof.
3. The parent timeline is preserved before the active timeline changes.
4. The parent saved game is immutable after preservation.
5. Child state contains exactly the accepted contributions whose complete source pairs survive in the retained transcript.
6. No model interpretation, episode evaluation, narration, or prose generation is repeated during reconstruction.
7. The new save ID, new chat ID, and all branch-bound state identifiers agree before activation.
8. The campaign active-timeline pointer changes only after every new authority artifact validates; that compare-and-swap is the transaction commit point and final semantic-authority selection.
9. Directive campaign generation stays disabled while a fork journal is pending or the current chat is unbound.
10. Display-name changes never alter host identity.
11. A completed or retried transaction is idempotent.
12. Chats outside the exact active Directive campaign binding are unaffected.

## Native Branch Detection

SillyTavern's `CHAT_CHANGED` event is the integration point. Native branches and SillyTavern bookmarks both use `chat_metadata.main_chat`, so `main_chat` alone is not sufficient authority.

Directive recognizes a candidate native branch only when all of the following are true:

- the newly selected chat has no exact Directive binding;
- its `main_chat` names the previously active Directive chat;
- the selected entity is the same exact character entity as the parent binding;
- the parent chat still exists and matches the active save binding;
- the parent message at the child endpoint records the child chat name in its native `extra.branches` collection;
- the child transcript is an exact prefix of the parent transcript through the selected endpoint; and
- the selected swipe, message roles, stable host-message identities, and text hashes match at every retained source used by Directive authority.

Detection must not depend on a `Branch #N` filename suffix. The suffix is presentation and may change independently of branch semantics.

Opening a SillyTavern bookmark/checkpoint, copying a chat file, renaming a chat, changing characters, or selecting an unrelated chat must not trigger automatic conversion.

### Branch Endpoint Semantics

Directive's acceptance rule remains unchanged: a selected assistant response becomes accepted only when the next player message is sent.

- A branch ending on a player message includes the accepted pair completed by that player message.
- A branch ending on an assistant message treats that assistant response as provisional until the player sends a new message in the child timeline.
- A branch created with an explicitly selected swipe retains only that swipe and uses its exact hash.

The retained set is therefore defined by complete, hash-valid accepted-pair source ranges, not by receipt count or raw message count.

## State Reconstruction

The child begins as an isolated in-memory copy of the authoritative parent state. A single branch reconstruction coordinator then derives the state associated with the retained lineage. Reconstruction must use a transient state gateway with no storage adapter; it must never invoke the live parent's persistence gateway or publish intermediate revisions.

### Survivor Selection

The coordinator builds a set of retained source records from the child transcript. A source survives only when its complete accepted pair exists and its stored message IDs, selected swipe identity, text hashes, and source-range hash all match.

Every accepted contribution not in that set is removed through the same deterministic source-invalidation and rebuild rules used for message deletion, editing, hiding, and swipe changes. The coordinator must cover every mutable authority affected by accepted play, including:

- active and archived mission evidence;
- mission objectives, facts, clocks, outcomes, transitions, and conclusion state;
- Story Settlement contributions, receipts, episodes, working capsule, effects, and supersessions;
- the accepted-time ledger and derived current time;
- Command Bearing reserves, awards, spends, commits, and refunds; and
- source-backed People, Ship, world, and player-safe projections.

The coordinator is not allowed to perform independent best-effort pruning in each UI projection. It reconstructs authoritative state once, then rebuilds projections from that state.

### Identity Rebinding

After reconstruction, one deterministic rebind pass assigns the child save ID and child chat ID to every branch-bound envelope and nested authority that V1 requires to agree. It retains source host-message identities and hashes because SillyTavern copied those messages into the child transcript.

The child save wrapper records optional fork provenance:

```js
forkedFrom: {
  saveId: parentSaveId,
  chatId: parentChatId,
  endpointHostMessageId,
  lineageHash,
  operationId,
}
```

This is custody metadata, not a second semantic tracker. Existing V1 saves without `forkedFrom` remain valid.

### Validation Oracle

Before persistence, the child must pass:

- the complete V1 campaign-state contract;
- cross-root save, chat, mission, settlement, and time binding checks;
- active mission-definition and package validation;
- Story Settlement validation;
- Command Bearing validation;
- retained-source resolution against the child transcript; and
- the complete player projection build.

The central correctness property is:

> A derived child state must equal the state produced by a clean campaign that accepted exactly the retained lineage, apart from newly assigned custody identities and timestamps.

## Saved-Game Custody

All saved games are complete immutable V1 snapshots. They are not the per-message reconstruction mechanism.

The current V1 storage shapes remain usable:

- a new immutable saved game uses a `checkpoint` record with its own record ID and the source timeline save ID in `parentSaveId`;
- its authoritative state retains that source timeline branch ID until a load operation assigns a new active save ID; and
- `index.activeSaveId` is the sole authority for which active-slot record may receive campaign mutations.

When a native branch or Load Game operation preserves the timeline being left, it first writes and verifies that immutable checkpoint. After the child becomes active, the superseded active record may be removed as journaled cleanup because the checkpoint now owns the preserved state and chat binding. A cleanup failure is harmless duplication, not lost authority; recovery may remove only the exact superseded record named by the completed operation.

Saved-game listing and campaign deletion must be keyed by campaign ID, not only by the current active save's `parentSaveId`. This ensures that saved timelines from earlier forks remain visible and are deleted with the campaign even after their source active records have been retired.

There are two preservation methods:

- **Clone while continuing:** Save Game clones the current chat because the active chat will continue to change.
- **Retire active chat:** Native branching and Load Game preserve the chat being left directly because it will no longer be active or mutated by Directive.

The saved-game record identifies its preservation method and exact preserved chat binding. Loading always clones from the preserved chat; it never makes the immutable saved chat itself active for mutation.

Opening an immutable saved chat directly through SillyTavern does not activate it. Directive keeps that chat read-only and unprompted and directs the player to Load Game, which creates a separately bound playable continuation.

If the exact current state and chat lineage are already preserved by an immutable saved game, the implementation may reuse that saved game instead of creating a duplicate. This is an optimization and must be proven by exact hashes, not inferred from names or timestamps.

## Failure-Atomic Fork Transaction

Branch conversion crosses Directive storage and SillyTavern chat metadata, which cannot be committed in one filesystem transaction. Directive therefore uses an idempotent operation journal.

The journal is stored in the isolated V1 namespace and contains operation progress, exact identifiers, revisions, and hashes. It never contains an alternative semantic account of the campaign.

Example stages:

```text
detected
  -> parent-preserved
  -> child-derived
  -> child-persisted
  -> child-binding-written
  -> active-pointer-switched   # commit point
  -> prompt-ready
  -> parent-record-retired
  -> completed
```

The operation ID is stable for the tuple of campaign ID, parent save ID, parent chat ID, child chat ID, and retained-lineage hash. Duplicate `CHAT_CHANGED` events, reloads, or retries resume the same operation.

### Ordering

1. Acquire a per-campaign serialized operation lease and verify the active index revision.
2. Clear the prompt and persist the `detected` journal before semantic writes.
3. Persist and validate the immutable parent saved game under the automatic name.
4. Derive, rebind, and fully validate child state through the isolated transient gateway.
5. Persist the child active-save record without publishing it as active.
6. Persist the exact Directive binding in the child chat metadata.
7. Re-read the parent index revision, current child chat identity, and complete child transcript. Require the child lineage hash to remain identical to the journaled candidate and require the parent save to remain active. A message, swipe, edit, chat switch, or competing state commit during preparation aborts before activation.
8. Compare-and-swap the campaign index active pointer from parent to child. This is the commit point and the final semantic-authority selection.
9. Configure the child runtime and rebuild the prompt.
10. Retire the superseded parent active record only after verifying the immutable parent checkpoint and committed child pointer. This is recoverable cleanup, not an authority change.
11. Mark the journal complete and open the non-blocking rename dialog for the preserved parent.

### Recovery Rules

- **Before the commit point:** the parent remains active. Directive may safely resume or compensate by removing incomplete child records and metadata it can prove belong to the operation.
- **At or after the commit point:** the child is authoritative. Recovery only moves forward by repairing binding, runtime, and prompt activation; it never guesses that the parent should be restored.
- **Uncertain external write:** retain the journal, disable generation, and verify exact persisted state before taking another action.
- **Active-index conflict:** stop without switching and re-read the campaign. Never overwrite a newer active timeline.
- **Child transcript changed during preparation:** stop without switching. Because any appended prose was generated without established Directive custody, do not silently absorb it into the child state.
- **Rename failure or dismissal:** keep the already-persisted automatic name.

Cleanup must never delete the selected chat or any chat whose ownership cannot be proven from the operation journal and exact binding.

## Load Game Transaction

Load Game uses the same journal and commit discipline with a different child-chat source:

1. Validate the selected immutable saved game and preserved chat.
2. Preserve the active timeline being left under an automatic name.
3. Clone the selected saved chat into a new playable chat without opening it yet.
4. Rebind a copy of the selected saved state to a new save and chat identity.
5. Validate and persist the new child.
6. Write exact child metadata.
7. Compare-and-swap the active pointer.
8. Open the new chat, rebuild the prompt, and complete the journal.

The selected saved game and the automatically preserved current timeline remain immutable and loadable.

## Performance and Scale

Directive does not create a full save per message.

Native branch reconstruction performs one bounded scan of the retained child transcript and the parent's source-backed authority. Its target complexity is linear in transcript messages plus persisted authority records. Routine accepted pairs already produce compact provenance or insignificant receipts rather than full state copies.

A complete state snapshot is stored only when the player explicitly saves, creates a native branch, or loads another timeline. SillyTavern already stores the branched chat transcript.

Sparse internal acceleration snapshots are outside this design. They may be proposed later only if measurements on multi-thousand-message fixtures show that deterministic reconstruction misses an agreed latency target. Such snapshots would be caches, never independent semantic authority.

## Component Boundaries

Implementation should keep the feature in focused units:

- **Native branch detector:** reads host chat identity and proves branch lineage; performs no state writes.
- **Lineage fingerprint service:** normalizes messages and produces exact source and transcript hashes.
- **Branch reconstruction coordinator:** selects surviving accepted sources and deterministically derives child state.
- **State identity rebinder:** updates branch-bound custody identities and validates cross-root agreement.
- **Timeline transaction service:** owns the journal, stage transitions, recovery, compensation, and active-pointer commit.
- **Saved-game repository/controller:** creates immutable saved games and lists, renames, loads, or deletes them.
- **Campaign UI:** presents commands, progress, naming, selection, confirmation, and failure messages without holding authority.

The runtime event handler only recognizes a candidate and invokes the transaction service. It must not embed reconstruction or persistence logic directly in `CHAT_CHANGED` handling.

## Test Strategy

### Detection and Isolation

- exact active parent branch is detected;
- unrelated, unbound, non-campaign, different-character, copied, and renamed chats are ignored;
- SillyTavern bookmarks/checkpoints are not mistaken for branches;
- nested branches use their direct active parent;
- branch filenames are irrelevant to detection; and
- duplicate or delayed chat-change events are idempotent.

### Lineage and Reconstruction

- branch ending on an assistant retains that response as provisional;
- branch ending on a player includes the newly completed accepted pair;
- explicitly selected swipes use the selected variant and hash;
- hidden, edited, deleted, superseded, and invalidated sources do not survive incorrectly;
- reconstruction before and after mission transitions, Story Settlement episode seals, time advances, Command Bearing changes, and campaign conclusions is exact;
- parent state remains byte-for-byte unchanged; and
- child state is equivalent to clean retained-lineage play after custody fields are normalized.

### Failure Injection

Inject a failure after every journal stage and verify:

- before commit, the parent remains active and playable;
- after commit, the child remains active and recoverable;
- generation is disabled whenever custody is incomplete;
- reload resumes the same operation;
- no duplicate saved games or child saves are created;
- unsafe cleanup never deletes a selected or unproven chat; and
- active-index compare-and-swap conflicts do not overwrite newer state.

### Player Interaction

- the automatic name exists before the dialog opens;
- cancel, close, and empty submission retain it;
- a custom name updates only the display label;
- Load Game preserves the current timeline and leaves the selected save immutable;
- saved games are sorted and labeled correctly; and
- Return to Campaign opens the authoritative chat after an unprovable branch.

### Scale

Use fixtures with at least 5,000 messages and source records spanning multiple missions. Assert linear record traversal, bounded memory use appropriate to one state copy plus transcript normalization, no model calls, and a measured reconstruction time recorded by the test suite.

### Live SillyTavern Proof

In the exact installed `default-user` extension:

1. create a native branch from an assistant message;
2. verify parent preservation, automatic naming, provisional response handling, and child activation;
3. create another branch from a player message with a non-default selected swipe;
4. verify exact retained state and independent subsequent settlement;
5. load the preserved original timeline and verify that both later timelines remain available;
6. reload SillyTavern during an injected pending transaction and verify recovery; and
7. confirm ordinary chats remain unaffected and the console has no errors.

## Compatibility

Existing current V1 saves remain loadable. New custody fields required for fork provenance must be optional when reading existing saves and exact when present. This feature does not import or reinterpret pre-V1 or unrecognized state.

The implementation plan must identify every schema and documentation update needed to keep the V1 compatibility boundary explicit. It must not silently weaken exact state validation.

## Non-Goals

- No full campaign snapshot after every message.
- No second semantic chronology, quest ledger, or parallel mutable tracker.
- No model-assisted branch reconstruction.
- No automatic conversion of chats outside the exact active campaign.
- No host chat-file renaming as part of saved-game naming.
- No mutation of immutable saved games during load.
- No changes to SillyTavern core branch creation.
- No speculative acceleration snapshots without performance evidence.

## Acceptance Criteria

The design is satisfied when a player can branch from any retained message in the exact active Directive campaign chat and continue with precisely the state that existed at that point; the previous timeline is automatically preserved and nameable; Save Game and Load Game follow the same immutable model; interruptions recover without corrupting either timeline; no campaign generation occurs under ambiguous custody; and multi-thousand-message campaigns require neither per-message full saves nor repeated model work.
