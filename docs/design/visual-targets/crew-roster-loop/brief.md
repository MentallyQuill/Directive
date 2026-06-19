# Crew Roster Brief

Visual Target Unit: Crew route.

Parent Surface: Directive runtime shell.

Navigation direction: use the shared bottom route navigation as the primary route model. The top shell is only for Directive identity/status and global Back/Close actions.

Primary user task: Let the player scan the active senior crew, understand each officer's rank/billet/role, and confirm that continuity is tracked without exposing hidden relationship state.

Information hierarchy:

1. Crew readiness summary: number of senior crew, continuity status, casualty count, reassignment count.
2. Command chain: Captain, player XO, and principal senior officers.
3. Officer rows: name, rank, billet, species, package role, continuity state.
4. Continuity summary: relationship model, casualties, reassignments.

Required controls and states:

- Starships/Mission/Crew/Ship/Log/Settings bottom route navigation.
- Back and Close Directive shell actions.
- Read-only active roster state.
- Empty state when no campaign or no senior crew is loaded.
- Player-safe continuity status only; no hidden relationship values.

UX goal: A first-time player should understand who is aboard, who commands what, and whether crew continuity is active within a few seconds on phone and desktop.

UX failure risks:

- Tall raw metadata cards burying the roster.
- Repeated labels overpowering names and billets.
- Long role summaries creating cutoff or awkward wrapping.
- LCARS rails that look like unavailable buttons.
- Hidden relationship values leaking into the roster.
- Phone layout showing only one or two officers per viewport.

Saga reference qualities:

- Bottom route navigation.
- Compact mobile-first flow.
- Dense but readable rows.
- Clear active route state.
- Stable text sizing and touch-safe shell controls.

LCARS requirements:

- Original LCARS-inspired personnel manifest.
- Dark negative space, segmented rails, amber/orange/lavender/blue accents.
- Compact status blocks for crew count, continuity, casualties, and reassignments.
- Officer rows with clear hierarchy: name first, billet second, role third.
- Smaller modern font scale with stable line heights.
- Structural rails that group command information without pretending to be controls.

Desktop constraints:

- Compact SillyTavern extension panel anchored inside the host.
- Bottom route navigation remains visible.
- Top shell only contains title/status and Back/Close actions.
- Content must scroll without bottom navigation overlapping rows.

Phone constraints:

- Full-height shell.
- Bottom route navigation remains primary.
- At least three roster records should be scannable near the top when data allows.
- No clipped, squeezed, or awkwardly wrapped officer text.

Player-safety rules:

- Do not show hidden relationship values, approval scores, private conflict state, source IDs, hidden truth, or raw provider output.
- Continuity may be described as tracked, initialized, player character, casualty, or reassigned only when already player-safe.

What must not change:

- Runtime authority boundaries.
- Existing crew projection data.
- Bottom-navigation shell direction; do not promote route navigation to the top.
- Host compatibility with SillyTavern and Lumiverse.
