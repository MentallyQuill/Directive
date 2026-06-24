# Campaign End Conditions

## Status

This is the pre-alpha design contract for campaign end conditions, terminal outcomes, checkpoint replay, and continuing after severe campaign disruption.

Directive already has campaign conclusion, turn snapshots, outcome replacement, Delete Outcome, save branching, and pending chat interactions. This document defines how those systems should work together when a campaign reaches, or appears to reach, an ending.

The full build plan is [Campaign End Conditions Implementation Plan](../planning/CAMPAIGN_END_CONDITIONS_IMPLEMENTATION_PLAN.md).

## Core Decision

End conditions are checkpoint decisions, not automatic hard stops.

When a player death, command-removal event, ship loss, campaign-objective collapse, or authored finale could end the campaign, Directive should commit the event as real for that timeline, then offer a player-visible checkpoint decision in chat. The player can replay from a checkpoint, keep the ending, branch the failed timeline, or push on if the fiction still supports a playable campaign.

The player-facing principle is:

```text
The outcome happened. This timeline may be over. You can replay from the last stable checkpoint, keep the ending, save it as a branch, or continue if there is a plausible path forward.
```

## Vocabulary

`End condition`

An authored or detected state that could close a campaign branch. End conditions include successful finales, player death, permanent command removal, unrecoverable mission collapse, loss of the campaign vessel or base, regional catastrophe, retirement, and explicit player choice.

`Terminal outcome`

A committed outcome that may end the current branch. It has a result band, a causal basis, visible consequences, and recovery options. It is not merely a failed check.

`Checkpoint`

A restorable state before the terminal outcome. The preferred checkpoint is the retained pre-outcome snapshot for the terminal turn. If that snapshot is no longer retained, the runtime may use the latest stable autosave or a package-defined checkpoint.

`Replay from checkpoint`

The player chooses to restore the campaign to the checkpoint and continue. The terminal timeline should remain available as a branch or recovery record when possible.

`Keep this ending`

The player accepts the terminal outcome as the campaign ending. Directive concludes the campaign, records the final band, posts or preserves the final scene, clears active prompt context, and marks the save complete.

`Push On`

The player chooses to continue despite the potential end condition. The severe consequence remains true. Directive reframes the campaign around a plausible new playable premise instead of undoing the event.

`Save as branch`

The player preserves the terminal timeline as a branch before replaying or trying a continuation.

## Six-Band Ending Use

The six outcome bands remain useful, but final campaign classification is not always the same as the last turn's local result band.

- `Great Success`: the campaign's central crisis is resolved cleanly and creates durable extra advantage.
- `Success`: the central crisis is resolved with normal cost.
- `Partial Success`: the central crisis is contained, but major costs, losses, debts, or unresolved institutional damage remain.
- `Partial Failure`: the worst outcome is prevented, but the campaign promise is badly compromised.
- `Failure`: the command objective fails and a serious ending lands.
- `Great Failure`: the campaign branch ends in catastrophic loss, fairly caused and unrecoverable unless the player replays or pushes into a radically changed premise.

End-condition logic should compute both:

- `terminalOutcomeBand`: severity of the terminal event.
- `finalCampaignBand`: classification of the accepted ending after all axes are evaluated.

Example: the Breckenridge is destroyed while saving the Reach. The terminal event is severe, but the accepted ending may be `Partial Success` or `Success` if the campaign objective is achieved.

## Product Rules

### Commit Before Offering Replay

Terminal outcomes should be committed before Directive offers replay. This preserves stakes and avoids making severe consequences feel like ordinary validation errors.

The chat should show the consequence first, then the recovery offer.

### No Gotcha Endings

A terminal outcome needs a fair causal basis:

- visible risk, warning, or obvious lethal/illegal context;
- meaningful player decision or accumulated consequence;
- no hidden instant failure from an omitted routine procedure;
- professional competence and standing orders applied before severe consequence;
- mode policy respected.

The existing Ashes guardrail still applies: no single failed check ends a mission.

### Exploration And Command Modes

`Exploration` should block player-character and senior-staff death, and should generally convert terminal death into injury, temporary incapacitation, loss of position, damaged trust, delay, capture, or another recoverable consequence.

`Command` can allow player death, senior-staff death, command removal, and severe ship loss when the risk is causally established and fair.

Both modes may still offer checkpoint replay. The difference is which terminal outcomes are allowed without softening.

### Push On Is A Continuation License, Not An Undo

`Push On` should not erase the terminal event. It authorizes a new playable frame if one exists.

Good push-on frames include:

- playing through court-martial, confinement, rescue, or political fallout after command removal;
- continuing from escape pods, survivors, a replacement command center, or an allied vessel after the Breckenridge is lost;
- operating under demotion, oversight, probation, or temporary relief;
- continuing as a compromised campaign where the player has lost assets, trust, or authority but still has agency;
- shifting to an epilogue-investigation, inquiry, or rebuilding frame.

Bad push-on frames include:

- pretending the event did not happen;
- giving the player impossible authority;
- continuing when the player character has no agency and the package has no successor or alternate play role;
- using the narrator to hand-wave out of committed causal state.

### The Director Can Challenge Strict End Conditions

End conditions should be deterministic checks, but not brittle traps. If the player has a plausible argument for survival, legal appeal, alternate command continuity, ship evacuation, offscreen rescue, or nonstandard continuation, the runtime should permit `Push On` or convert the terminal event into a severe non-terminal outcome.

Packages should define likely end conditions, but the Mission Director should ask:

```text
Is the campaign's playable premise truly gone, or has it transformed?
```

## Recovery Offer Shape

Terminal recovery should be surfaced in chat because the emotional moment happens in chat. Mission and Campaign surfaces may mirror the controls, but should not be the only place to resolve the decision.

Suggested chat-visible structure:

```text
Directive Checkpoint

This is a terminal outcome: Great Failure.
Reason: the Breckenridge was lost with command continuity broken.

Replay from checkpoint
Push On
Keep this ending
Save as branch
```

The message must stay player-safe. It can name the visible reason and band, but must not reveal hidden clocks, raw scores, unrevealed actors, or Director-only conditions.

## Runtime Flow

1. Consequential player turn resolves through the normal Director transaction.
2. Outcome packet and state delta commit as usual.
3. End-condition detector evaluates the committed state.
4. If no end condition fires, play continues normally.
5. If a terminal candidate fires, Directive posts the committed scene and a checkpoint decision.
6. Runtime records a pending interaction with the terminal outcome id, checkpoint source, available options, final-band candidate, and push-on policy.
7. Player chooses an option:
   - `Replay from checkpoint`: restore checkpoint and mark the terminal timeline as replayed or optionally branched.
   - `Push On`: commit a continuation frame and keep the severe event true.
   - `Keep this ending`: call campaign conclusion with final ending metadata.
   - `Save as branch`: save the terminal timeline as a branch, then return to the pending decision.
8. Prompt context is rebuilt from the resulting state.

## Target State Fields

The final schema can change, but end-condition data should be able to express this shape:

```json
{
  "endConditions": {
    "version": 1,
    "defaultCheckpointPolicy": {
      "preferred": "preOutcomeSnapshot",
      "fallbacks": ["lastStableAutosave", "packageCheckpoint"],
      "terminalBranch": "explicitPlayerChoice",
      "snapshotRetention": "untilTerminalDecisionResolved"
    },
    "resultBands": {
      "bands": []
    },
    "continuationFrames": [],
    "conditions": [
      {
        "id": "terminal.ashes.breck-destroyed-objective-failed",
        "title": "Breckenridge Destroyed And Objective Failed",
        "family": "shipOrBaseLoss",
        "severity": "terminal",
        "priority": 900,
        "defaultTerminalOutcomeBand": "Great Failure",
        "trigger": {
          "all": [
            { "type": "shipState", "path": "ship.status", "equals": "destroyed" },
            { "type": "campaignFlag", "id": "campaign-objective", "equals": "failed" }
          ]
        },
        "fairWarning": {
          "requiresVisibleRisk": true,
          "requiresCausalSetup": true,
          "blocksSingleCheckFailure": true
        },
        "checkpointPolicy": {
          "preferred": "preOutcomeSnapshot",
          "fallbacks": ["lastStableAutosave"],
          "snapshotRetention": "untilTerminalDecisionResolved"
        },
        "resolutionPolicy": {
          "actions": ["replayFromCheckpoint", "pushOn", "keepEnding", "saveTerminalBranch"]
        },
        "pushOnPolicy": {
          "allowed": "whenPlausibleContinuationExists"
        },
        "continuationFrameIds": ["survivors-after-breck-loss"],
        "finalCampaignBandRules": [
          {
            "band": "Great Failure",
            "summary": "The Breckenridge is destroyed and the campaign objective has failed."
          }
        ],
        "endingAxisEffects": [],
        "playerFacingSummary": "The Breckenridge is destroyed and the campaign objective has failed.",
        "directorNotes": "Do not treat ship loss as automatic campaign failure if evacuation, relief command, or objective success remains plausible."
      }
    ]
  }
}
```

The package schema requires an `endConditions` root. Ashes of Peace uses this root for authored completion, terminal candidates, continuation frames, checkpoint policy, final-band mapping, and ending-axis effects.

## End Condition Families

### Authored Completion

The campaign reaches its intended finale and epilogue. This is the normal ending path.

Ashes example:

- The Last Directive resolves.
- The Terms We Keep resolves.
- Ending axes classify operational, political, accountability, and crew outcomes.

### Player Death

In `Command`, player death can be terminal if fair and causally established. In `Exploration`, it should be rewritten to a severe recoverable state.

Recovery options:

- replay from checkpoint;
- keep the death ending;
- branch the timeline;
- push on only if the package explicitly supports a successor, survival ambiguity, or altered playable role.

### Permanent Command Removal

The player is relieved, jailed, court-martialed, removed from duty, or otherwise loses the package-defined command role.

This may be terminal, but `Push On` should often be available. Court-martial, appeal, custody, political inquiry, rescue, or rebuilding can be valid command stories if the campaign still has playable agency.

### Ship Or Base Loss

Loss of the campaign vessel or station is a terminal candidate, not an automatic ending.

Questions:

- Did the player save the central objective?
- Did the crew survive?
- Is there a plausible command successor frame?
- Can the campaign continue from survivors, allied support, or inquiry?
- Does the package require that vessel or merely begin with it?

### Campaign Objective Collapse

The central crisis becomes unrecoverable. This can happen from accumulated clocks, failed finales, lost evidence routes, faction collapse, or antagonist success.

`Push On` may continue into aftermath or resistance if the package supports it.

### Player Choice

The player may choose to conclude, retire, resign, transfer, accept judgment, or end the campaign after an epilogue. This should use the same conclusion service and final-band metadata.

## Ashes Of Peace Update Path

Ashes already has the end-condition baseline wired into the package:

- `endingAxes` for operational, political, accountability, and crew outcome dimensions.
- `endingProfiles` that unlock the finale and epilogue.
- an `ashes-of-peace-complete` attention flag after the epilogue.
- guardrails that failure should be fair and usually failure-forward.
- 12 authored `endConditions.conditions`.
- 7 authored `endConditions.continuationFrames`.
- default and per-condition checkpoint policies with snapshot-retention expectations.

The remaining Ashes work is content refinement, live-play tuning, and adding package-specific variants as playtests reveal new plausible endings.

### Current Authored End Conditions

Ashes currently defines:

- `completion.ashes.terms-we-keep-resolved`;
- `terminal.ashes.player-death-command`;
- `terminal.ashes.permanent-command-removal`;
- `terminal.ashes.breck-destroyed-objective-failed`;
- `terminal.ashes.breck-destroyed-objective-saved`;
- `terminal.ashes.breck-lost-survivors-continue`;
- `terminal.ashes.nightfall-catastrophe`;
- `terminal.ashes.reach-legitimacy-collapse`;
- `terminal.ashes.farwatch-buries-accountability`;
- `terminal.ashes.compact-civilian-catastrophe`;
- `terminal.ashes.player-resignation-or-retirement`;
- `terminal.ashes.player-choice-conclude`.

Each record maps to the current axes where relevant:

- `ending.operational`;
- `ending.political`;
- `ending.accountability`;
- `ending.crew`.

### Current Push-On Frames

Ashes currently defines:

- `court-martial-and-inquiry`;
- `relieved-but-advising`;
- `survivors-after-breck-loss`;
- `allied-command-frame`;
- `aftermath-resistance`;
- `medical-survival-and-command-gap`;
- `retired-but-testifying`.

Each frame must continue to say what the player can still decide, who recognizes their authority, which UI routes remain meaningful, and what prompt context changes.

### Schema And Validators

The package schema and validator require:

- a package `endConditions` root;
- `schemas/endings/end-conditions.schema.json`;
- `schemas/endings/end-condition-predicate.schema.json`;
- `schemas/endings/continuation-frame.schema.json`;
- package diagnostics for missing roots, duplicate ids, and bad continuation-frame refs;
- Ashes end-condition ids, ending-axis refs, continuation-frame refs, and player-safe copy checks.

### Runtime Integration

The runtime includes an end-condition service after outcome commit and before normal post-turn idle state.

It:

- evaluate terminal candidates against committed state;
- choose terminal and final band candidates;
- post the checkpoint decision in chat;
- record a pending interaction;
- resolve Replay, Push On, Keep Ending, and Save Branch actions;
- call the existing conclusion service only when the player accepts an ending;
- restore from turn snapshots or autosaves for replay;
- rebuild prompt context after every resolution.

### Test Coverage

Ashes coverage should prove:

- authored completion concludes normally;
- terminal candidate posts a chat checkpoint decision;
- replay restores pre-outcome state;
- keep ending writes final band and completes campaign;
- push on preserves the severe event and installs a continuation frame;
- Breckenridge destruction can be failure, partial success, or push-on depending on campaign state;
- Exploration softens player death while Command can allow it when fair;
- hidden trigger details never appear in player-facing recovery copy.

## Authoring Requirements

Campaign authors should provide:

- all intended authored completions;
- all plausible terminal candidate families;
- fair-warning requirements;
- checkpoint policy;
- push-on policy;
- continuation frames;
- final-band rules;
- ending-axis effects;
- player-safe recovery copy;
- Director-only notes for edge cases;
- validation notes for conditions the runtime cannot evaluate yet.

Authors should avoid:

- instant game-over checks;
- hidden trap endings;
- automatic ship-loss failure;
- treating command removal as always unplayable;
- ending the campaign because a planned chapter was skipped;
- making replay the only way out when a plausible continuation exists.

## Open Implementation Questions

- Should terminal checkpoint messages use buttons in hosts that support them, or plain chat text plus mirrored Mission controls?
- Should a push-on continuation be previewed before acceptance?
- How many terminal branches should autosave retain?
- Should player death in `Command` always offer `Push On` when transporter, medical, or offscreen rescue ambiguity is plausible?
- Should a package be able to disable `Push On`, or should the runtime always allow a player-driven continuation if the Director can construct one?
