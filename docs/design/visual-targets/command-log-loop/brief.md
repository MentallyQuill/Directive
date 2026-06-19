# Command Log Brief

Visual Target Unit: Log route.

Parent Surface: Directive runtime shell.

Navigation direction: use the shared bottom route navigation as the primary route model. The top shell is only for Directive identity/status and global Back/Close actions.

Primary user task: Let the player review recent committed command outcomes, assisted summaries, committed inputs, and visible consequences without reading raw JSON or long source IDs.

Information hierarchy:

1. Log summary: entry count, latest stardate, assisted-summary status, consequence count.
2. Latest entries: title/type, stardate, source status, assisted summary.
3. Highlights and visible consequences.
4. Committed inputs as audit detail.

Required controls and states:

- Starships/Mission/Crew/Ship/Log/Settings bottom route navigation.
- Back and Close Directive shell actions.
- Read-only command history.
- Empty state when no campaign or no command-log entries are loaded.
- Assisted summary status: complete, failed, pending, or absent.

UX goal: A first-time player should understand what happened recently, what mattered, and whether the assisted summary is available within a few seconds on phone and desktop.

UX failure risks:

- Raw JSON displayed as player-facing text.
- Long source outcome IDs dominating the card.
- Generic metadata cards making every log entry look equally important.
- Bullets creating tall walls of text.
- Hidden state or raw provider output leaking into the log.
- Phone layout burying the latest summary below technical rows.

Saga reference qualities:

- Bottom route navigation.
- Compact mobile-first flow.
- Dense but readable rows.
- Clear active route state.
- Stable text sizing and touch-safe shell controls.

LCARS requirements:

- Original LCARS-inspired command-history timeline.
- Dark negative space, segmented rails, amber/orange/lavender/blue accents.
- Compact status blocks for entries, latest stardate, assisted summaries, and consequences.
- Timeline rows that show the latest player-facing summary before technical details.
- Smaller modern font scale with stable line heights.
- Structural rails that group log history without pretending to be controls.

Desktop constraints:

- Compact SillyTavern extension panel anchored inside the host.
- Bottom route navigation remains visible.
- Top shell only contains title/status and Back/Close actions.
- Content must scroll without bottom navigation overlapping log entries.

Phone constraints:

- Full-height shell.
- Bottom route navigation remains primary.
- Latest entry summary should be visible near the top.
- No clipped, squeezed, or awkwardly wrapped log text.

Player-safety rules:

- Do not show hidden facts, hidden relationship values, detector scores, source hidden truth, or raw provider output.
- Assisted summaries are presentation-only; committed inputs remain the audit trail.
- Raw source IDs may be summarized as recorded/pending rather than displayed in full.

What must not change:

- Runtime authority boundaries.
- Existing Command Log data contract.
- Bottom-navigation shell direction; do not promote route navigation to the top.
- Host compatibility with SillyTavern and Lumiverse.
