# Directive V1 Operator Manual

Directive is played primarily in SillyTavern chat. Click the small ship icon beside the send controls to open the Directive interface.

## Campaign

Start or resume Ashes of Peace here. Finish the guided character setup, then Directive creates and binds a dedicated campaign chat. Other campaign cards are previews only and cannot be selected.

The active campaign card can open its chat and create a named V1 checkpoint. A checkpoint is a deliberate copy of the current exact save, useful before a major decision. It is not an undo log and does not make chat edits safe across different timelines.

## Mission

Primary objectives are required for the mission's authored closure. Optional objectives shape outcomes but are not required. Conditional objectives appear only after their trigger becomes known. Objectives can often be completed in different orders.

Time-sensitive information appears only when the deadline is known. A mission can finish with costs, a safe handoff, or another partial-success disposition when the authored rules allow it.

## People

Crew profiles are stable public service-record information. When you directly meet an otherwise incidental NPC and they give you a usable name, Directive adds a People card immediately. It may fill the initial card with ordinary public identity and service details, but never secrets, private motives, romance, or future plot. Later accepted facts update that same stable record; a merely mentioned name creates no card.

The detail panel shows Profile, the available public/service record, and Connection to You: when you met, the current qualitative posture, and one unresolved open matter when applicable. Every durable relationship turning point remains under Defining moments. Entries start collapsed and expand individually when tapped; there is no three-entry history limit. Missing information is omitted instead of invented.

The player's portrait has two small controls in its upper-right corner: the upload arrow adds or replaces the image, and the remove icon opens an inline red-check or grey-X confirmation before leaving the portrait blank. Command Bearing is a small earned reserve; its most recent award or use explains why the balance changed.

Use one point to reserve a bounded favorable edge for the next generated response. You may swipe freely, and the point commits only when you reply to the selected response. Cancel before acceptance to restore it. Editing, deleting, or re-swiping the accepted source later also restores the point.

## Ship

The Ship page gives one operational assessment, any material active limitations, and the campaign's small set of meaningful ship systems. A system card shows the whole improvement ladder, the current state, why the accepted story supports it, what that state changes in play, and the ship work currently known to the crew. Small atmospheric details from prose do not become individual ship issues.

Ship work is played in chat. There is no project button: investigate, obtain cooperation, arrange time, run a test, or attempt a repair naturally in the story. A work item changes only after an accepted assistant response clearly depicts its authored completion; ordering or beginning work is not completion. Completing work can unlock a named approach in later scenes, but it never guarantees success or replaces the need for credible circumstances.

Ashes begins with Systems Integration unvalidated and Sensor Calibration provisional. The visible ladders make their possible improvement clear from the start, while later work orders are revealed as their prerequisites are completed.

## Settings

Configure the Utility and Reasoning model lanes, install or refresh the Directive preset, inspect the read-only V1 role map, verify V1 storage, and export support diagnostics. Each lane uses either SillyTavern's Current Model or a SillyTavern Connection Profile; Directive does not accept endpoints or API keys.

The default provider policy is isolated and keeps SillyTavern's sampler settings. Instruct Auto follows the selected source's chat/text completion mode. Temperature and Top P appear only when Directive override is selected. Structured Output Auto uses Prompt JSON until the exact source configuration passes the provider test's native-schema check.

Tooltips can be disabled from Interface. Diagnostics excludes credentials, system prompts, hidden messages, alternate swipes, and unselected branches. Story transcript export is opt-in and contains only player-visible messages from the active selected branch.

## Swipes and corrections

An assistant reply is provisional until you send the next player message while it is selected. Swipe freely before that point. Editing, deleting, hiding, or selecting a different accepted source causes Directive to rebuild dependent state. Do not manually edit Directive JSON files.

## When something is wrong

Confirm the correct campaign chat is open, refresh the Directive view, verify storage in Settings, check the preset status, and reload SillyTavern once. If the problem persists, export support diagnostics. Directive intentionally refuses unrecognized saves instead of guessing how to repair them.
