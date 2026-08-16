# Runtime Player Authority Design

**Date:** 2026-08-16

## Problem

Directive's bundled narration preset contains a player-agency rule, but the latest Sam Vickers response still invented two new lines for Sam: an acknowledgment and a follow-up question. Even a brief narrator-authored line removes the player's autonomy, makes the role play appear to write itself, and breaks immersion.

Player authority is a gameplay invariant, not a prose preference. It therefore cannot depend on the Directive preset, another compatible preset, a particular provider, or a campaign package. Directive's always-injected `directive.campaign.v1` runtime packet must own the invariant.

## Decision

Every Directive V1 runtime prompt packet will include a concise, prominent, player-specific authority contract immediately after the packet header and before campaign, mission, simulation, transition, Duty Report, or ship-mechanics instructions.

The contract will establish that:

- only the user may supply new dialogue, actions, decisions, thoughts, emotions, reactions, intentions, or choices for the named player character;
- the narrator must never invent even a brief acknowledgment, question, order, assent, connective line, or other speech for the player character;
- the narrator may briefly and faithfully re-describe dialogue or visible actions already supplied by the user, but may not extend, reinterpret, or continue them;
- the narrator should portray the world, NPCs, and consequences, then stop before the player character's next unprovided word, action, or choice; and
- no preset, package, mission, simulation mode, transition, Duty Report, or other narrator instruction may relax this boundary.

The player character's current name will be included in the contract so the rule is concrete at generation time rather than expressed only as a generic role-play convention.

## Ownership Boundaries

- **Directive runtime** owns player autonomy, accepted-state authority, campaign rules, and narrator constraints required for correct play.
- **Narration presets** own prose style, tense, perspective, pacing, formatting, and other presentation preferences. A preset may repeat or strengthen the player-authority rule, but Directive correctness must not depend on it.
- **Campaign packages** own campaign-specific facts, actors, scenes, and authored affordances. They cannot authorize the narrator to speak or decide for the player character.
- **Simulation modes and runtime events** may determine consequence severity or require an NPC/report beat, but must leave the player's response open.

## Runtime Placement and Data Flow

`createV1RuntimePromptPacket()` will derive the player-authority instruction from `state.player.name` and place it near the top of the text installed by the SillyTavern prompt adapter under `directive.campaign.v1`.

This path is already chat-bound and installed independently of the active narration preset. The invariant will therefore reach narration requests even when the Directive preset is unavailable, activation fails, or a future preset changes its prompt composition.

The change will not alter save state, Story Settlement, accepted-pair authority, provider routing, generation interception, or chat history. It is a generation-time narrator boundary only.

## Failure Behavior

This design does not add a post-generation prose rewriter or heuristic detector. A late cleanup pass could expose streamed text before removal, misclassify legitimate references to the player, or silently alter narration after generation.

Instead, Directive will make the authority boundary explicit at its highest reliable preset-independent prompt surface and certify it against adversarial scenarios. If provider testing still demonstrates violations after this change, the next architectural step would be a Directive-owned pre-display generation and validation pipeline, not brittle regex cleanup.

## Tests

Focused runtime-prompt tests will prove that:

- every V1 packet contains the player-specific authority contract;
- the contract forbids new player dialogue, including acknowledgments, questions, orders, assent, and connective speech;
- faithful re-description of user-authored dialogue or visible actions remains allowed without continuation;
- the narrator is told to stop before the next unprovided player contribution;
- the contract explicitly outranks presets, packages, missions, simulation modes, transitions, Duty Reports, and other narrator instructions;
- the instruction precedes those lower-authority runtime instructions in the generated packet; and
- changing the player name changes the concrete identity named in the contract.

The latest Sam Vickers turn will be represented as a regression scenario in the test language: answering Engineering may continue through Cross, Whitaker, Sato, and the world, but the narrator may not supply Sam's acknowledgment or follow-up question.

Existing opening, simulation-mode, mission-transition, Duty Report, prompt-adapter, preset-manager, browser-runtime safety, and full project tests must continue to pass. The production extension must be synchronized and hash-checked before live use.

## Out of Scope

- Editing, deleting, regenerating, or otherwise mutating the existing Sam Vickers chat or save.
- Building a semantic response classifier, post-generation rewriter, retry loop, or provider-specific exception table.
- Moving style, tense, perspective, or pacing ownership out of narration presets.
- Changing accepted-pair settlement or treating provisional assistant prose as authoritative state.
