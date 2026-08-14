# Authoritative Gameplay Notifications Design

**Status:** Approved

**Date:** 2026-08-14

## Purpose

Directive will celebrate meaningful, authoritative gameplay changes with small notifications over the SillyTavern interface. Notifications cover Mission objective and mission completion, new People cards and significant relationship developments, and Ship-task progress or completion.

The notification appears in the same committed update cycle that changes Directive's corresponding page. It never announces a provisional outcome from the latest assistant response.

## Product Contract

- Notifications are compact, modern, and visually part of Directive's LCARS interface.
- They appear near the upper center of the SillyTavern viewport, including while the Directive panel is closed.
- A notification automatically fades after six seconds of active display time.
- Hovering the card or focusing its View control pauses the timer. Leaving or blurring resumes the remaining time.
- Clicking the notification body dismisses it immediately.
- A separate View action uses the user-supplied search icon. Activating View dismisses the notification and opens the corresponding Mission, People, or Ship route.
- View opens the relevant route generally. It does not scroll, expand, or focus a particular record.
- Related changes are grouped by their stable subject. Different subjects or routes remain separate queued notifications.
- Notifications make no sound and do not create a persistent inbox, unread badge, or settings surface in V1.

## Authority and Timing

Directive's player-facing Mission, People, and Ship projections contain only committed V1 state. An assistant response remains provisional until the next player message accepts that response through the accepted-pair settlement path.

The authoritative sequence is:

1. The assistant depicts an outcome. No projection or notification changes yet.
2. The player's next message accepts that assistant response.
3. Accepted-pair settlement commits the supported Story Settlement and mission state changes.
4. Directive derives the new player projection.
5. A pure comparison between the prior and new committed projections creates notification records.
6. The Directive panel refresh and notification publication are scheduled from that same successful commit result.

Notification failure must never block, roll back, or retry authoritative settlement. The UI is a consumer of committed state, not part of its transaction.

Initial extension startup, opening or switching chats, loading a save, branch reconstruction, swipe/edit/delete replay, and projection recovery establish a fresh baseline without replaying historical notifications. Removal or invalidation of prior progress does not create a celebratory notification. If progress is later earned again from a new accepted source, it may notify again.

## Considered Approaches

### 1. Committed player-projection deltas — selected

Compare the previous and next certified player projections after a successful accepted settlement. Stable IDs and explicit statuses provide deterministic change signals, while the same data drives the pages the notification references.

This approach guarantees that the popup and page agree, needs no additional model call, and avoids coupling the notification renderer to internal reducer details.

### 2. Direct notifications from individual reducers

Mission, People, and Ship reducers could each emit UI messages when they apply effects. This offers detailed internal context but couples domain authority to presentation, duplicates grouping rules, and risks announcing an intermediate change that does not survive the complete atomic commit.

### 3. Persisted notification inbox

Directive could store read/unread notification records in campaign state. This would support history and delayed delivery, but it adds a second mutable product surface and replay semantics that the requested lightweight celebration does not need.

V1 therefore uses ephemeral projection deltas with no persisted notification ledger.

## Notification Records

The pure delta layer produces bounded records with this conceptual shape:

```js
{
  id,
  route: 'mission' | 'people' | 'ship',
  subjectId,
  kind,
  title,
  summary,
  priority,
  sourceRevision
}
```

`id` is deterministic for the committed semantic change, not for its display text. The queue deduplicates identical IDs. Text is player-safe and drawn only from certified player projections; notification generation cannot expose hidden package definitions or private prompt material.

The notification layer does not interpret prose, judge story meaning, or call a model. It recognizes closed projection transitions.

## Mission Rules

A Mission notification is eligible when:

- a visible objective with a stable ID moves from a non-terminal status to a terminal disposition; or
- the active mission moves from non-terminal to terminal.

If the final objective and mission complete in the same commit, one `Mission complete` notification supersedes redundant objective notices for that mission. Multiple objective completions in one commit group into one Mission card. The title and summary use the mission and objective player text already visible on the Mission page.

Newly revealed facts, clock changes, capability changes, ordinary mission-state revisions, and newly visible but incomplete objectives do not notify in V1.

## People Rules

A People notification is eligible when:

- a new source-backed People card appears for a newly introduced stable person ID;
- Current posture changes meaningfully;
- an Open matter is created, materially changed, or resolved; or
- a new defining moment appears in the sealed relationship history.

Routine `relationshipEvidence`, conversation, cooperation, public-fact updates, and stylistic restatements do not notify. The existing episode-evaluation contract remains responsible for emitting posture, open-matter, and defining-moment authority only when accepted evidence warrants a genuine relationship update. The notification layer trusts that closed authoritative result and performs no second semantic judgment.

All qualifying changes for the same person in one commit group into one card. When a new People card and its initial relationship state arrive together, the card leads with `New contact` and summarizes that the relationship was established rather than creating multiple notifications.

## Ship Rules

A Ship notification is eligible when:

- a visible cohesion task phase moves from available to completed; or
- a visible cohesion task becomes a completed-history record.

If a phase completion also closes the task in the same commit, one `Ship task complete` notification supersedes the progress notice. Multiple phase changes for the same task group into one card. Separate tasks may produce separate queued cards.

The current Ship page's stable task and phase IDs are the authority boundary. Generic operational-summary changes, cohesion-band changes, queued-task reshuffling, and hidden work do not notify independently.

## Grouping, Priority, and Queue

Grouping occurs before display:

- Mission changes group by mission ID.
- People changes group by person ID.
- Ship changes group by task ID.

The queue shows at most three cards at once in a compact vertical stack and holds any overflow in memory. Completion outranks progress, and the stable priority order is:

1. Mission complete.
2. Ship task complete.
3. Objective complete.
4. New contact.
5. Significant relationship update.
6. Ship task progress.

Equal-priority records retain authoritative commit order. Dismissal or timeout admits the next queued card. A chat change, load, branch activation, or extension disable clears visible and queued notifications.

## Visual and Interaction Design

The notification host is fixed to the upper center of the viewport and appended to Directive's existing global overlay ownership, independent of whether the full Directive panel is open. The host itself ignores pointer events; each card accepts them.

Cards use Directive's expanded-interface colors and typography:

- dark raised surface and restrained border;
- narrow LCARS color rail;
- amber Mission accent, lilac People accent, and blue Ship accent;
- compact uppercase category label;
- one concise title and at most one short summary;
- an exact card width of `min(340px, calc(100vw - 24px))`, with a 280px minimum only when the viewport can accommodate it.

The card is split into two sibling controls so interactive elements are never nested:

- a broad dismiss button containing the category, title, and summary; and
- a 44-by-44 CSS-pixel View button containing the supplied search SVG and an accessible route-specific label such as `View Mission`.

The View control shows the word `View` beside the icon when the viewport is wider than 360px. At 360px and below it shows the icon alone while retaining its accessible name and tooltip.

Entry uses a short opacity and downward-settle animation. Dismissal and timeout use a short opacity and upward movement. `prefers-reduced-motion` removes transforms and keeps a brief opacity transition. Notifications do not move keyboard focus when they appear.

The live region uses polite status semantics so celebrations do not interrupt higher-priority SillyTavern output. Focus-visible treatment uses Directive's existing focus color.

## Supplied Search Icon

The user-supplied `search.svg` path and view box are copied into Directive's owned icon assets as the View glyph. Runtime styling controls its color through the established mask-based vector-glyph mechanism; hard-coded black fill is not used as the rendered color. The asset is local and requires no network fetch.

## Components and Boundaries

### Projection delta derivation

A pure V1 module accepts prior and next certified player projections and returns notification records. It owns closed transition recognition, player-safe copy selection, grouping, priority, and deterministic IDs. It has no DOM, timers, storage, or host dependencies.

### Notification center

A focused UI module owns the ephemeral queue, DOM host, timers, pause/resume behavior, dismissal, View actions, animation lifecycle, live-region behavior, deduplication, and cleanup. It accepts already-safe notification records and route actions; it does not inspect campaign state.

### Runtime settlement handoff

The accepted-pair success path captures the prior certified projection and derives the next projection only after persistence succeeds. It publishes the bounded notification records through the SillyTavern UI boundary and requests a Directive panel refresh. Replay/recovery paths explicitly seed or replace the comparison baseline without emission.

### Route action

View dismisses its card, opens the Directive runtime if needed, and selects the record's route through the existing shell actions. Navigation failure is reported through existing diagnostics and does not restore or duplicate the dismissed notification.

## Error Handling and Lifecycle

- Missing, invalid, or mismatched projection kinds produce no notifications and preserve the last valid baseline.
- A notification whose referenced subject is absent from the new projection is discarded.
- DOM or animation failure degrades to immediate removal.
- Timer cleanup occurs on card removal, host reset, chat change, extension disable, and test teardown.
- Duplicate host events cannot duplicate an already queued or visible deterministic notification ID.
- Notification publication never changes campaign state, prompt state, or accepted-pair settlement results.

## Testing and Verification

The feature requires:

- pure delta tests for every eligible and suppressed Mission, People, and Ship transition;
- grouping, priority, deterministic-ID, baseline, and replay-suppression tests;
- fake-timer tests for six-second dismissal and hover/focus pause with remaining-time resume;
- DOM tests for body dismissal, View routing, no nested interactive controls, live-region semantics, focus visibility, queue overflow, and cleanup;
- integration tests proving notification publication occurs only after successful accepted settlement and that the panel refresh uses the same committed projection;
- edit, swipe, delete, load, chat-switch, and branch-rebuild tests proving historical or invalidated changes do not notify;
- browser visual checks at phone and desktop sizes for upper-center placement, compact sizing, SillyTavern coexistence, route colors, supplied icon rendering, and reduced-motion behavior; and
- installed SillyTavern proof that an objective completion, new contact or significant relationship update, Ship phase, and Ship task completion each appear once and that View opens the correct route.

## Out of Scope

- provisional notifications at assistant-generation end;
- notification sounds;
- a persistent history or unread counter;
- notification settings or per-domain toggles;
- free-form model-authored notification text;
- notifications for every People fact or interaction;
- generic Ship percentages or operational chatter;
- deep-link scrolling, automatic record expansion, or flashing page highlights; and
- replacing or modifying SillyTavern's own notification system.
