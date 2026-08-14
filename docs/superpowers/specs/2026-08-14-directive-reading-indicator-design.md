# Directive Reading Indicator Reliability Design

## Problem

Directive can settle and persist an accepted player turn through the SillyTavern generation interceptor even when the native player-message event path does not own an activity token. In that case the save remains authoritative, but the user never sees “Directive is reading your post...” during a slow settlement.

## Decision

The SillyTavern generation interceptor will acquire its own Directive turn-activity token immediately before it awaits the runtime orchestrator. This is the final common boundary for every generation attempt and therefore covers both normal event-driven settlement and generation-boundary recovery.

The existing token map remains the authority for overlapping activity. On a successful `injectAndContinue` handoff, the existing handoff function changes every active token to “SillyTavern is writing...” and clears them after its bounded delay. On blocked, inactive, or failed interception, the interceptor clears only the token it owns. This preserves an independently active event token and prevents one path from clearing another path's work.

## Error and Lifecycle Behavior

- Disabled or unavailable orchestration creates no activity.
- A blocked settlement clears the reading activity before showing recovery UI.
- A fail-open interceptor clears its token before returning the error result.
- Extension disable and generation stop continue to cancel every remaining activity through the existing lifecycle functions.

## Verification

A regression test will hold the real interceptor promise beyond the 350 ms reveal delay and assert that the real activity indicator is visible with the reading label. It will then release the interceptor, verify the writing handoff, and confirm eventual removal of active activity. The focused host-event test and full alpha gate must pass.
