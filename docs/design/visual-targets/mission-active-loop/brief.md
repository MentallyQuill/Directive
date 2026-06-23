# Mission Active Loop Brief

Visual Target Unit: Mission active loop page.

Parent Surface: Directive runtime shell.

Navigation direction: use the shared bottom route navigation as the primary route model. The top shell is only for Directive identity/status and global Back/Close actions.

Primary user task: Let the player understand the current mission situation, return to the bound campaign chat for new orders, review pending outcomes, and manage immediate save/recovery work without reading raw runtime state.

Information hierarchy:

1. Current mission identity and readiness: mission title, phase, player/ship, simulation mode, narration/autosave status.
2. Primary command zone: open-chat routing, pending Accept/Discard controls, or recovery guidance.
3. Operational context: formal objectives, active directives, active pressures, and eligible follow-up/open-orders work.
4. Recovery/save controls: Save Game, Save As, narration retry, rerun/delete outcome.

Required controls and states:

- Campaign/Mission/Crew/Ship/Log/Settings bottom route navigation.
- Back and Close Directive shell actions.
- Save Game and Save As.
- Open Campaign Chat and pending outcome controls when available.
- Pending outcome controls: Accept Outcome, Command Bearing spend, Discard Preview, warning confirmation, Request Counsel.
- Last Outcome controls: Rewrite Narration, Rerun Outcome, Delete Outcome.
- Optional Follow-Up/Open Orders controls when active: Schedule, Defer, Open, Advance, Resolve, Delegate.

UX goal: A first-time player should know what the current mission is, what they can do next, and whether the system is waiting for chat play, pending review, recovery, or side work within a few seconds.

UX failure risks:

- Long IDs and timestamps overpowering useful state.
- Oversized generic card text.
- Phone layout burying Player Action below a tall metadata card.
- Weirdly wrapped or squished labels.
- LCARS decorative blocks that look clickable.
- Hidden campaign/source facts leaking into player-facing panels.
- Save controls competing with the next mission command.

Saga reference qualities:

- Bottom route navigation.
- Compact mobile-first flow.
- Dense but readable rows.
- Clear active state.
- Touch-safe primary actions.
- Route-local controls that do not require a desktop-only layout.

LCARS requirements:

- Original LCARS-inspired command-console structure.
- Dark negative space, asymmetrical rails, amber/orange/lavender/blue accents.
- Status blocks for mode, phase, narration, autosave, and outcome state.
- One dominant mission command zone.
- Smaller modern font scale with stable line heights.
- Structural rails that improve grouping and scanability.

Desktop constraints:

- Compact SillyTavern extension panel anchored inside the host.
- Bottom route navigation remains visible.
- Top shell only contains title/status and Back/Close actions.
- Content must scroll without bottom navigation overlapping active controls.

Phone constraints:

- Full-height shell.
- Bottom route navigation remains primary.
- Player Action or pending outcome controls must appear before low-priority raw metadata.
- No clipped, squeezed, or awkwardly wrapped button labels.

Player-safety rules:

- Do not show hidden factions, raw relationship values, detector scores, source IDs, hidden truth, or raw provider output.
- Outcome IDs may exist for technical recovery, but the page should emphasize player-safe summaries over IDs.

What must not change:

- Runtime authority boundaries.
- Existing action wiring and save/preview/commit behavior.
- Bottom-navigation shell direction; do not promote route navigation to the top.
- Host compatibility with SillyTavern and Lumiverse.
