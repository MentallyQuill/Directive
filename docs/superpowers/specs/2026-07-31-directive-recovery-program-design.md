# Directive Recovery Program Design

**Status:** Approved design; written-spec review pending

**Date:** 2026-07-31

**Scope:** Recover Directive's host integration, campaign onboarding, gameplay authority, and design-to-execution fidelity after the expanded-interface cutover.

## Decision Summary

Directive will remain a chat-native companion around SillyTavern. The default desktop presentation will be a centered, bounded journal overlay with a dimmed host backdrop, not a full-browser takeover. A compact launcher remains available from the host surface, and fullscreen is an explicit user action. Mobile may use a near-fullscreen presentation when the available viewport requires it.

The Campaign route will become a real campaign browser. Selecting a campaign reveals its artwork, hook, setting, ship, player role, and useful campaign-shape information before the player commits to character setup or import.

The gameplay runtime will use an elastic story spine: authored obligations, pressures, and beat eligibility remain authoritative while the player can approach them through freeform play. Player statements will be treated as claims until supported by authored truth, observation, or an explicit Director commitment. Generated narration may not silently promote unsupported claims into world facts.

The recovery is decomposed into three approval-sized implementation slices, each requiring installed-host visual and behavioral evidence before the next slice begins.

## Why This Recovery Exists

The current regression is not a single styling defect.

1. The approved mockup presents a bounded, centered instrument, while the production shell enforces `100vw` by `100dvh` and hides SillyTavern behind it.
2. The New Campaign dialog is mounted below the shell in the stacking order, reads the wrong campaign-summary field, and omits campaign artwork.
3. The Mission Director's open-world philosophy lacks sufficiently hard beat eligibility, pressure resurfacing, and epistemic authority boundaries for authored story play.
4. The implementation plan required live screenshot comparison and installed-host certification, but the cutover proceeded while that visual gate remained open.

The common failure is premature abstraction. “Viewport-bound” was treated as a geometry instruction instead of an integration goal. “Open-world” was treated as freedom from scene order without a corresponding contract for authored obligations. Automated checks established that code paths existed, but did not establish that the resulting player experience matched the approved design.

## Product Identity

Directive is the game screen around the chat, not a second game layered over it. SillyTavern chat remains the primary play surface. Opening Directive should feel like opening a field guide, quest journal, or Pip-Boy: a temporary act of reorientation, planning, or recall before returning to play.

The shell must therefore preserve two simultaneous truths:

- Directive owns its internal routes, focus, scrolling, and controls while open.
- SillyTavern remains visibly present as the host and the place where play continues.

No route may imply that Directive has replaced the host application or owns the entire browser document by default.

## Interface Contract

### Outer shell

On desktop and tablet, the initial target is a centered panel with `width: min(1120px, calc(100vw - 64px))` and `height: min(860px, calc(100dvh - 64px))`, viewport margins, a dimmed/blurred backdrop, and a clear close action. These values are the starting visual contract and may change only through screenshot review. The invariant is that the panel does not touch all four browser edges at ordinary desktop sizes.

The panel owns internal overflow. The host document must not gain a second page scrollbar while the shell is open. A fullscreen control may expand the panel to the viewport when the user explicitly requests it; fullscreen is not the initial state.

The shell mounts at document/body level so that nested dialogs can render above it. Blocking dialogs must have a higher, explicit browser-top stacking layer and must prevent pointer interaction with the underlying shell until they close.

### Launcher and navigation

Directive remains discoverable through a compact launcher integrated with the SillyTavern surface. The launcher may visually borrow from the former shelf, but it is an entry point rather than a second permanent application frame.

Once open, the journal retains the approved five routes:

1. Campaign
2. Mission
3. Crew
4. Ship
5. Settings

The route bar remains inside the bounded panel. It must not be used as a justification for making the panel itself full-screen.

On phones, the panel may expand to nearly the full viewport and use a compact bottom route bar. This is a responsive adaptation, not the desktop identity.

### Campaign browser

Campaign selection is a browse-and-compare flow, not a title-only chooser.

The desktop composition is master/detail:

- The master list shows campaign title, thumbnail or hero crop, concise status, and a short identity cue.
- The detail pane shows hero artwork, high concept or premise, setting/theater, era, ship, player role, expected campaign shape, and the strongest opening hook available from the package.
- The detail pane provides explicit actions for Start Campaign, Continue Character Setup, Import Package where applicable, and Cancel/Back.

Selecting a campaign changes presentation only. It must not create a save, mutate active campaign state, bind a chat, or start character setup until the player chooses the explicit action.

On phones, the master list becomes a card or accordion sequence. Expanding a card reveals the same player-safe detail information before the Start action.

The view-model contract must project the package's canonical campaign summary and assets. It must not invent a `premise` field when the package exposes `highConcept`, and it must not discard package-owned images that are intended for campaign discovery.

## Gameplay Authority Contract

### Elastic story spine

The Director does not require a fixed scene order, but every authored campaign must expose a set of durable obligations. A story position is eligible only when its deterministic gates are satisfied.

Each authored beat or pressure must define:

- dramatic purpose and question;
- prerequisites and evidence gates;
- earliest plausible entry;
- preferred dramatic window;
- latest useful window or expiration behavior;
- active pressure and consequence of delay;
- allowed approaches and resolution bands;
- required follow-up or recovery obligations;
- whether the beat is optional, supporting, mandatory-to-surface, or mandatory-to-resolve.

Exploration can alter cost, timing, relationships, evidence, and outcome. It cannot silently erase a mandatory obligation. When the player spends time away from an unresolved obligation, the world responds through pressure, communication, resource cost, deadline movement, character action, or a changed opportunity. The system should pull the thread back into play diegetically rather than teleporting the player to a scene.

### Director turn sequence

The authoritative sequence is:

1. Parse the player message into intent, proposed action, factual claims, and uncertainty.
2. Build the current story context from campaign state, graph projection, current player action, recent transcript, active pressures, and known facts.
3. Derive eligible story candidates deterministically from node status, edges, prerequisites, timing, and current location.
4. Ask the model to select and plan only from that candidate set.
5. Validate the selection and outcome against source hashes, candidate eligibility, forbidden assertions, and state-operation roots.
6. Apply the approved state proposal through the same authoritative reducer used by deterministic outcomes.
7. Append reviewed story events and pressure updates.
8. Generate narration from committed state, visible evidence, and the approved narration plan.
9. Run post-generation continuity and claim review before accepting host-native prose.

The story-positioner must receive the current player message and recent transcript as actual context, not merely an opaque source-frame reference. Unknown graph nodes must not default to `available` without edge or readiness checks. Model proposals that are accepted by the contract must have a live reducer consumer; carrying a proposal in a packet without applying it is not a valid state transition.

### Epistemic authority

The runtime distinguishes at least these categories:

- authored fact;
- committed observation;
- player claim;
- generated claim;
- supported hypothesis;
- unresolved hypothesis.

Player and generated claims are not world truth merely because they appear in the transcript. A crew member may acknowledge a claim, question it, request evidence, or act cautiously around it. The narration layer may present uncertainty, but it may not promote an unsupported claim to established fact.

Continuity review must expand beyond a narrow contradiction list. It should identify unsupported consequential assertions and either quarantine them, rewrite them as uncertainty, or route the turn into a verification/recovery response. Campaign-specific guardrails remain useful, but they must be a specialization of the general authority model rather than the only defense.

## Recovery Slices

The work is intentionally decomposed. No slice depends on broad, simultaneous redesign of every route or every campaign.

### Slice A: Host-integrated shell

Scope:

- bounded desktop/tablet overlay;
- launcher and open/close/focus behavior;
- backdrop and pointer blocking;
- internal scrolling and host document overflow;
- explicit fullscreen action;
- body-level modal mounting;
- installed-host screenshots at approved viewports.

Exit evidence:

- live SillyTavern screenshots match the approved shell reference;
- the panel visibly coexists with the host at ordinary desktop sizes;
- mobile remains usable without document overflow;
- Escape, close, focus return, and nested-dialog behavior are proven.

### Slice B: Campaign onboarding

Scope:

- campaign master/detail browser;
- package summary projection including hook and artwork;
- explicit selection versus start actions;
- character-creator and import transitions;
- visible empty/error states;
- New Campaign stacking and focus behavior.

Exit evidence:

- a player can compare bundled campaigns before committing;
- Ashes of Peace and at least one other package render real artwork and useful detail;
- the dialog or browser is visible above the shell and blocks the underlying panel;
- start, cancel, continue-draft, and import paths are verified in the installed host.

### Slice C: Story-authority vertical path

Scope:

- one Ashes of Peace opening path;
- current player-input context in story-position selection;
- deterministic candidate eligibility;
- applied state proposal;
- pressure resurfacing after diversion;
- claim quarantine and crew uncertainty behavior;
- narration constrained by committed state.

Exit evidence:

- an authored opening beat cannot be silently bypassed;
- an off-thread exploration turn remains fun but does not erase the active obligation;
- an invented cargo or conspiracy claim is treated as a claim or hypothesis, not established fact;
- a supported discovery can become authoritative only through the approved evidence/Director path;
- the final chat transcript, campaign save, and runtime event ledger agree.

## Verification and Approval Rules

Every recovery slice requires four kinds of evidence:

1. Focused deterministic tests for the changed contract.
2. Installed-extension live testing against SillyTavern, not only repository-local rendering.
3. Screenshots or transcript artifacts that show the user-facing result.
4. A human review against the approved reference before the next slice begins.

The implementation plan must distinguish these states:

- code exists;
- deterministic tests pass;
- installed-host behavior passes;
- visual/semantic review approved;
- live campaign certification complete.

Passing the first two states is never sufficient to claim the final two.

The approved mockup, the written contract, and the installed-host screenshot must be compared at every UI slice. If they differ intentionally, the variance must be recorded and approved before proceeding. Unresolved product decisions must remain visible as decisions; they may not be silently converted into implementation defaults.

## Non-Goals

This recovery does not:

- replace SillyTavern chat with a Directive-owned chat surface;
- restore every historical shelf feature;
- redesign all five routes at once;
- make every authored campaign a fixed linear sequence;
- permit arbitrary transcript text to rewrite committed campaign state;
- introduce a new persistence system before the authority contracts are proven;
- treat screenshot comparison as optional polish.

## References

- [Player-Facing Information Architecture](/F:/git/Directive/docs/superpowers/specs/2026-07-20-player-facing-information-architecture-design.md)
- [Expanded Interface Contract](/F:/git/Directive/docs/design/DIRECTIVE_EXPANDED_INTERFACE_CONTRACT.md)
- [Expanded Interface Mockup](/F:/git/Directive/docs/design/mockups/directive-expanded-interface.html)
- [Expanded Interface Production Integration Plan](/F:/git/Directive/docs/superpowers/plans/2026-07-22-expanded-interface-production-integration.md)
- [Mission Director Model](/F:/git/Directive/docs/design/MISSION_DIRECTOR_MODEL.md)
- [Story Position Context](/F:/git/Directive/src/story/story-context-index.mjs)
- [Campaign Package Summary](/F:/git/Directive/src/packages/campaign-package-context.mjs)
