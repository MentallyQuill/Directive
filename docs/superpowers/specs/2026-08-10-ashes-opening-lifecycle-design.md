# Ashes Opening Lifecycle Design

## Goal

Ashes of Peace must open like a Star Trek episode: a concise authored montage establishes the player's arrival aboard the U.S.S. Breckenridge, then control passes to the player at the first scene worth playing. Captain Mara Whitaker's first meeting with the player must begin as a warm, natural professional introduction before it becomes a command handover.

The authored opening must survive regeneration of the first assistant message, remain available as campaign continuity after the visible chat grows, and begin in a Directive-owned chat that is free of story instructions inherited from an unrelated SillyTavern chat.

## Root Cause

Directive currently posts `campaign.openingMessage` as an ordinary assistant message after creating the campaign chat. The runtime prompt contains the active mission projection and general crew narration guides, but it does not retain a protected opening setup. Regenerating the posted message therefore removes the only authored copy of the opening and asks the model to infer a replacement from broad objectives such as completing the command handover.

The current opening and mission objective both put Whitaker immediately into operational business. Her crew guide says that she is measured and should not be cold, but it gives the model no first-meeting cadence. The result can be technically competent dialogue that feels like an interview or wartime briefing.

Fresh Directive character chats can also inherit per-chat SillyTavern Author's Note fields. The inspected default-user Ashes chat contained instructions about Hermione from an unrelated story. Directive clears the host's generated greeting from a fresh chat, but it does not sanitize these inherited story-control fields.

Finally, early arrival details that produce no mission evidence can be classified as insignificant by Story Settlement. Without a separate campaign-owned continuity summary, those details eventually exist only in the visible chat window.

## Approved Experience

The deterministic opening message is a concise narrated montage with these beats:

1. On the previous morning, the player's shuttle rendezvouses with the Breckenridge.
2. The player receives a brief first impression of the newly refitted ship and its postwar crew.
3. A crew member shows the player to the executive officer's cabin.
4. Several waiting PADDs are established: transfer orders, senior-staff dossiers, refit and readiness reports, and an Asterion Reach briefing.
5. A short passage conveys the player reviewing those materials and seeing enough of the ship to form first impressions.
6. The story cuts to 0830 the following morning outside Whitaker's ready room.
7. Control passes to the player at the door. The montage does not decide whether or how the player enters.

The first interactive exchange inside the ready room follows this cadence:

1. Whitaker greets the player by name and introduces herself properly.
2. She offers a seat and coffee or another ordinary courtesy.
3. She makes brief, genuine conversation about the trip, the player's first impressions, or the fact that she personally requested the assignment.
4. She leaves room for the player to answer and establish their own social posture.
5. She transitions naturally into the command handover and the Breckenridge's assignment.

Whitaker remains measured, concise, and professionally senior. Warmth does not make her effusive, indiscreet, or automatically agreeable. The opening is neither an interrogation nor a crisis briefing, and there is no wartime urgency before the story establishes one.

## Package Contract

The Ashes package gains one required `campaign.openingContext` object alongside the existing `campaign.openingMessage`:

- `continuitySummary`: a compact statement of the arrival, cabin assignment, supplied PADD categories, and elapsed night. These are established player experiences, not hidden facts.
- `firstPlayableScene`: a compact statement that the active scene begins at 0830 outside Whitaker's ready room before the command handover.
- `firstSceneGuidance`: ordered narration constraints for Whitaker's introduction, courtesy, small talk, player response opportunity, and transition into command business.

`campaign.openingMessage` remains the exact player-facing montage posted into the fresh chat. `openingContext` is semantic support for regeneration and later continuity; it must not contain secret mission information, objective solutions, or facts the player has not experienced.

This is a V1 package-contract change. Ashes is the only playable V1 campaign, so no legacy fallback, migration, compatibility path, or inference from old package shapes is added. Package validation fails clearly when the required opening context is absent or malformed.

## Runtime Prompt Lifecycle

The runtime prompt projects the opening contract in two phases:

### Unanswered opening

Before the first accepted player/assistant pair, the packet includes:

- the exact authored `openingMessage` as the canonical cold open;
- the non-secret `openingContext`;
- an instruction that regeneration may vary wording but must preserve every established beat, end at the same player decision point, and must not continue through the ready-room door or decide the player's action.

This makes an overswipe an alternate rendering of the same opening rather than permission to invent a different starting history.

### Continuing campaign

After the first accepted pair, the packet removes the cold-open regeneration instruction and full opening prose. It retains only `openingContext.continuitySummary` as established campaign history. During the Prelude it also retains `firstPlayableScene` and `firstSceneGuidance` until the command-handover objective is terminal. After that objective closes, those scene-specific instructions are removed while the compact continuity summary remains available for the campaign.

The packet labels all retained opening material as past or currently established context and tells the narrator not to replay, recap, or quote it unless the player's action naturally calls for it.

## Whitaker Narration Guidance

Whitaker's general crew narration guide is revised to make her humane command style explicit without binding every later appearance to the opening ritual:

- She uses ordinary professional courtesies and takes a genuine interest in people.
- She can be warm, dryly funny, and conversational when circumstances permit.
- Increased formality is a response to stress, conflict, or official process, not her default social posture.
- She does not turn every conversation into an assessment, briefing, or speech.

The exact first-meeting sequence remains in `campaign.openingContext.firstSceneGuidance`, where it cannot incorrectly govern later crises.

## Fresh-Chat Prompt Hygiene

After Directive creates and selects a fresh campaign chat, but before binding or posting the opening, the SillyTavern adapter sanitizes only inherited per-chat Author's Note controls:

- `note_prompt`
- `note_interval`
- `note_position`
- `note_depth`
- `note_role`

The fresh Directive chat receives an empty Author's Note and safe host defaults for its controls. Directive preserves unrelated chat metadata, the user's other chats, global presets, generated character data, and all Directive binding metadata.

If the new chat contains no inherited Author's Note, setup continues normally. If a non-empty inherited note is found but cannot be cleared and saved, campaign chat setup fails closed with a retryable prompt-hygiene error. Existing chats are not silently edited because their notes may have been deliberately authored by the player. The failed fresh chat follows the existing rollback and cleanup path, leaving the previously selected chat and user data intact.

## PADD Scope

This design establishes the PADDs as canonical story props and names their categories. A player may refer to them or ask about their contents through normal play, and narration must remain consistent with visible package state.

This change does not add a prop inventory, document viewer, generated-file persistence, on-demand content-generation command, or PADD-specific UI. Those capabilities require a separate design covering authority, spoiler boundaries, persistence, regeneration, and presentation. No placeholder subsystem is introduced here.

## Data Flow

1. Package loading validates `openingMessage` and `openingContext` together.
2. Campaign creation copies the package's opening context into the runtime assets available to prompt construction; it does not create mutable mission facts for these already-experienced setup details.
3. Directive creates a dedicated SillyTavern character chat, removes the host greeting, sanitizes inherited Author's Note controls, saves the clean header, and binds the chat.
4. Prompt installation projects the unanswered-opening contract.
5. Directive posts the exact authored montage with opening ownership metadata.
6. A SillyTavern regeneration receives the same opening contract and can only provide an alternate rendering with the same endpoint.
7. After the player's first accepted exchange, prompt rebuilding switches to continuing-campaign mode.
8. Whitaker's first-scene guidance remains active until the command handover is terminal; the compact opening continuity remains available thereafter.

## Failure Handling

- Invalid or secret-bearing opening context fails package certification rather than being silently omitted.
- An inherited non-empty Author's Note that cannot be cleared and persisted aborts fresh campaign chat setup with a specific retryable error.
- Failure after chat creation uses the existing failure-atomic rollback: restore the prior campaign and prompt, reopen the prior chat when needed, and remove only the failed Directive-created chat.
- Prompt rebuilding must never install opening context into a chat whose binding does not match the active save.
- Existing saves and chats are not rewritten or migrated. The inspected default-user chat remains historical evidence; live acceptance uses a newly created campaign save and chat.

## Verification

Focused automated coverage must prove:

- Ashes package validation requires a complete, non-secret opening context.
- A new campaign prompt contains the authored montage, continuity summary, regeneration boundary, and first-scene guidance before the first accepted pair.
- Regenerating the first assistant message cannot remove the prompt-side opening contract.
- After the first accepted pair, the full montage and regeneration instruction are absent while continuity and first-scene guidance remain.
- After command handover completion, first-scene guidance is absent while compact continuity remains.
- A fresh chat seeded with an unrelated Author's Note is cleaned before binding and opening delivery.
- Prompt-hygiene failure rolls back without modifying the previously selected chat or unrelated metadata.
- Whitaker's crew dataset includes the approved humane command-style constraints.
- Existing swipe custody, chat binding, prompt binding, and Story Settlement behavior remain intact.

The full `npm.cmd test` gate must pass after the focused tests.

Live default-user proof must use a fresh Ashes campaign and demonstrate:

1. source and installed extension parity for all changed files;
2. an empty campaign-specific Author's Note after chat creation;
3. the authored shuttle, cabin, PADD, overnight, and ready-room montage;
4. an opening-message regeneration that preserves those beats and still ends before the player's entry decision;
5. a first ready-room response in which Whitaker introduces herself, offers ordinary courtesy, makes brief natural conversation, and does not immediately launch into an intense mission briefing;
6. retained opening continuity in the installed prompt after the first accepted exchange.
