# Directive Mobile Campaign Focus Design

**Status:** Approved

**Date:** 2026-08-14

## Problem

SillyTavern deliberately focuses `#send_textarea` 200 milliseconds after a chat finishes loading when no visible text input is active. When Directive opens the exact bound campaign chat through Continue, Load Game, or campaign creation, that host autofocus summons the virtual keyboard on mobile. Directive does not directly focus the composer, but it owns the campaign-open transition that exposed the behavior.

The fix must not patch SillyTavern, change manual chat switching, alter desktop autofocus, or weaken Directive's exact campaign-chat binding and timeline custody.

## Approved Outcome

- Directive-initiated campaign chat opens do not summon the mobile virtual keyboard.
- Continue, Load Game, campaign creation, and internal Directive timeline opens share the same host-integration behavior.
- Manual SillyTavern chat switching remains unchanged.
- Desktop Directive chat opens retain SillyTavern's normal composer autofocus.
- The chat composer returns immediately to its original editable configuration after the transition.
- Continue refresh restores focus to the newly rendered Continue control, preserving keyboard and assistive-technology continuity.

## Authority Boundary

The behavior belongs in Directive's SillyTavern host adapter. The adapter is the only layer that knows both that Directive initiated the navigation and which host composer SillyTavern will focus. Campaign UI code must not patch global SillyTavern behavior, and SillyTavern source files remain untouched.

The guard applies only when:

1. `openCampaignChat` or its Directive-owned `open` alias will actually navigate to another chat;
2. the viewport matches Directive's mobile boundary of at most 640 CSS pixels; and
3. a supported SillyTavern chat composer is present.

Returning `true` for an already-current chat does not install a guard.

## Components

### Mobile composer focus guard

Add a focused SillyTavern integration module that owns the ephemeral DOM behavior. It locates the host composer using the same supported selectors as the Directive launcher integration, records the exact `inputmode` and `readonly` state, then temporarily applies `inputmode="none"` and read-only mode.

While active, a capture-phase `focusin` listener watches only that composer. If SillyTavern focuses it, the guard blurs the composer and restores focus to the connected, non-editable element that lost focus when available. This prevents the virtual keyboard while retaining focus continuity inside Directive.

The guard begins before host navigation because character selection can itself load a chat. Once the adapter's navigation attempt settles, the guard remains active for 400 milliseconds. That covers SillyTavern's current 200-millisecond delayed autofocus without imposing a persistent composer restriction. A ten-second watchdog restores state if a host navigation call stalls. Cleanup is idempotent and restores the original attributes and property values exactly.

If the document, viewport API, composer, event listener, or timer facilities are unavailable, the guard becomes a no-op and chat navigation proceeds normally.

### SillyTavern chat adapter

`createSillyTavernChatAdapter().openCampaignChat()` creates the guard only after it has established that a different bound chat must open. The existing character selection, host API fallback order, exact-current-chat polling, return values, and errors remain unchanged. A `finally` path schedules guard release whether navigation succeeds, fails, or falls through all host methods.

Because all Directive-owned campaign and timeline transitions use this adapter boundary, no independent UI setting or per-action exception is needed.

### Campaign Continue focus

After Continue's action and Campaign panel refresh finish, the panel focuses the newly rendered Continue control. This replaces the clicked button that the refresh removed. If SillyTavern's delayed autofocus subsequently targets the composer, the mobile guard restores focus to this new control.

## Failure Handling

- Missing composer: navigation proceeds without suppression.
- Desktop or wider viewport: navigation proceeds without DOM mutation.
- Host open failure: composer state is still restored after the bounded hold.
- Stalled host call: the watchdog restores composer state.
- Removed prior focus target: the composer is blurred without attempting focus on a disconnected node.
- Repeated cleanup: no duplicate listener removal or attribute corruption.

## Verification

Add a focused Node DOM contract that drives the real SillyTavern adapter and proves:

- mobile host autofocus is intercepted, the composer is blurred, and prior Directive focus is restored;
- temporary composer attributes are restored exactly after cleanup;
- desktop host autofocus remains active;
- opening an already-current chat performs no composer mutation;
- a failed host open still restores composer state.

Extend Campaign panel coverage to prove Continue refresh focuses the replacement Continue control. Register the new host test in the alpha gate, run the focused host and Campaign tests, then run the complete repository gate.

## Out of Scope

- Editing or installing a SillyTavern core patch.
- Suppressing autofocus for manual SillyTavern chat selection.
- Adding a user preference.
- Changing mobile layout, composer styling, campaign saves, prompts, timelines, or Story Settlement authority.
