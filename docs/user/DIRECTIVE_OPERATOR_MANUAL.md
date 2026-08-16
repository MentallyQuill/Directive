# Directive V1 Operator Manual

Directive is played inside SillyTavern chat.
Open it from the small ship icon beside the send controls.

## Alpha guidance

This is active-alpha software.
Behavior may change between updates.
Assume rough edges and keep the possibility of recovery in mind.

## Campaign

Campaign is where you start and continue Ashes of Peace.
Finish the guided character setup, then Directive creates and binds a dedicated campaign chat.

The active campaign card can open its chat and create checkpoints.
Use a checkpoint before important choices, major branch turns, or story pivots.
A checkpoint is a stored V1 snapshot and is not an undo log.

If you leave and return to the game, verify you are in the active campaign chat.

## Mission

Primary objectives are the main required goals for mission closure.
Optional objectives add extra ways to improve outcomes.
Conditional objectives appear only after their trigger becomes known.

Deadline information is shown only when it is known in your current story state.
Missions can close in different outcomes, including partial success or transfer scenarios, according to authored rules.

## People

People cards are public-facing records for notable NPC contacts.
When you first meet someone by a usable name, Directive may create a card.
It can fill basic public details immediately but never invent secrets, private motives, romance, or future plot.

The People panel shows:

Profile identity.
Public service record.
Your connection to that person.
Qualitative posture and any active open matters.

Past defining moments are kept per contact and expand when you tap each card.
There is no hard cap on how many moments are preserved.
Missing fields are shown as missing, not fabricated.

Use Command Bearing by spending one point for one bounded advantage on the next generated reply.
The point is only consumed after you send the draft you selected.
Canceling or choosing a different draft restores it.

## Ship

The Ship page shows:

Current ship identity and tone.
Operational aggregate.
Material limitations from the accepted story.
Visible ship systems, current levels, and known next improvements.

A ship system card shows:

The full improvement ladder.
Where it is currently in that ladder.
Why the state is valid from accepted story evidence.
What that state changes in play.
Known current ship work.

Ship work is played in chat.
There is no project action to force progress.
Work starts when the story supports it and resolves only after the accepted assistant output clearly completes it.

## Settings

Settings controls model lanes and the bundled preset.
You can install or refresh the preset, inspect the V1 role map, check storage health, and export diagnostics.

Directive uses either:

SillyTavern current model.
Or a connection profile you selected.

You do not add API keys directly in Directive.
Directive does not store provider secrets.

Temperature and Top P controls are available only when Directive’s own model override is active.
When using Structured Output Auto, Directive validates the exact native schema before use.

Diagnostics exclude hidden messages, credentials, and unselected or deleted branches.
Transcript export is opt-in and includes only player-visible messages from the active selected branch.

## Swipes and corrections

Assistant replies are drafts until you send your next player message.
You can swipe freely before that.
Changing the selected source or editing the chat message will rebuild dependent state.

Do not manually edit Directive JSON files.

## When something feels broken

Confirm the active campaign chat is open.
Refresh Directive.
Open Settings and verify storage.
Check preset status.
Reload SillyTavern once.
If the issue remains, export diagnostics and use the recovery path.

Directive refuses unknown saves rather than guessing a repair.
