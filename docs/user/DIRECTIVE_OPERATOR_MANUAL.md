# Directive V1 Operator Manual

Directive is played primarily in SillyTavern chat. Click the small ship icon beside the send controls to open the Directive interface.

## Campaign

Start or resume Ashes of Peace here. Finish the guided character setup, then Directive creates and binds a dedicated campaign chat. Other campaign cards are previews only and cannot be selected.

The active campaign card can open its chat and create a named V1 checkpoint. A checkpoint is a deliberate copy of the current exact save, useful before a major decision. It is not an undo log and does not make chat edits safe across different timelines.

## Mission

Primary objectives are required for the mission's authored closure. Optional objectives shape outcomes but are not required. Conditional objectives appear only after their trigger becomes known. Objectives can often be completed in different orders.

Time-sensitive information appears only when the deadline is known. A mission can finish with costs, a safe handoff, or another partial-success disposition when the authored rules allow it.

## People

Crew profiles are stable service-record information. Current posture and defining moments appear only after accepted story events establish them. Command Bearing is a small earned reserve; its most recent award or use explains why the balance changed.

Use one point to reserve a bounded favorable edge for the next generated response. You may swipe freely, and the point commits only when you reply to the selected response. Cancel before acceptance to restore it. Editing, deleting, or re-swiping the accepted source later also restores the point.

## Ship

The Ship page gives one operational assessment and any material active limitations. Small atmospheric details from prose do not become individual ship issues.

## Settings

Configure Utility and Reasoning model lanes, install or refresh the Directive preset, verify V1 storage, and export support diagnostics. Direct endpoint API keys last only for the browser session.

## Swipes and corrections

An assistant reply is provisional until you send the next player message while it is selected. Swipe freely before that point. Editing, deleting, hiding, or selecting a different accepted source causes Directive to rebuild dependent state. Do not manually edit Directive JSON files.

## When something is wrong

Confirm the correct campaign chat is open, refresh the Directive view, verify storage in Settings, check the preset status, and reload SillyTavern once. If the problem persists, export support diagnostics. Directive intentionally refuses unrecognized saves instead of guessing how to repair them.
