# Visible Turn Activity Design

## Problem

The activity indicator waits 350 ms before rendering. When Directive has no accepted pair to settle, the generation interceptor can finish sooner and cancel that timer, so a valid intercepted turn produces no visible “Directive is reading your post...” feedback. The slow-only browser regression does not cover this fast path.

## Decision

Create the status element immediately when activity begins. Record when each activity becomes visible. A successful narration handoff keeps the reading phase visible for at least 450 ms, then shows “SillyTavern is writing...” for 350 ms before clearing. These timers change presentation only; they never delay Directive settlement or SillyTavern generation.

Blocked, canceled, disabled, and failed turns still clear immediately. Token-specific timers preserve overlapping activity ownership so one completed path cannot clear another in-flight turn.

## Verification

The browser regression will use an immediately resolving generation interceptor. It must observe the reading label synchronously, verify that it remains visible before 450 ms, then observe the writing handoff and eventual cleanup. The existing slow-settlement and full alpha gates must remain green.
