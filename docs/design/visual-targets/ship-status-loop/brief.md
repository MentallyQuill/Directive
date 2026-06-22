# Ship Status Brief

Visual Target Unit: Ship route.

Parent Surface: Directive runtime shell.

Navigation direction: use the shared bottom route navigation as the primary route model. The top shell is only for Directive identity/status and global Back/Close actions.

Primary user task: Let the player understand the active starship identity, command structure, current condition, restrictions, and known technical debt without reading raw package IDs.

Information hierarchy:

1. Ship identity: name, class, registry, affiliation.
2. Readiness status: current condition, damage, active restrictions, known technical debt count.
3. Command structure: commanding officer, player billet, acting XO before player, shown as player-facing labels instead of raw IDs where possible.
4. Technical debt and operational caveats.

Required controls and states:

- Campaign/Mission/Crew/Ship/Log/Settings bottom route navigation.
- Back and Close Directive shell actions.
- Read-only active ship state.
- Empty state when no campaign or ship state is loaded.

UX goal: A first-time player should understand what ship they are aboard, whether it is fit for duty, and what operational limitations matter within a few seconds on phone and desktop.

UX failure risks:

- Long condition prose burying the ship identity.
- Raw package IDs overpowering player-facing names.
- Technical debt becoming a wall of text.
- Oversized generic card text.
- LCARS decoration that looks clickable.
- Phone layout showing only metadata before useful operational status.

Saga reference qualities:

- Bottom route navigation.
- Compact mobile-first flow.
- Dense but readable rows.
- Clear active route state.
- Stable text sizing and touch-safe shell controls.

LCARS requirements:

- Original LCARS-inspired starship status console.
- Dark negative space, segmented rails, amber/orange/lavender/blue accents.
- Compact status blocks for class, registry, condition, and restrictions/damage.
- One prominent ship identity band.
- Technical debt grouped as operational caveats, not a generic bullet-card wall.
- Smaller modern font scale with stable line heights.

Desktop constraints:

- Compact SillyTavern extension panel anchored inside the host.
- Bottom route navigation remains visible.
- Top shell only contains title/status and Back/Close actions.
- Content must scroll without bottom navigation overlapping ship information.

Phone constraints:

- Full-height shell.
- Bottom route navigation remains primary.
- Ship identity and at least two readiness blocks must appear near the top.
- No clipped, squeezed, or awkwardly wrapped ship text.

Player-safety rules:

- Do not show hidden system failures, hidden faction facts, source IDs, raw provider output, or unrevealed technical truth.
- Package-local IDs should be replaced or de-emphasized when player-facing names are available.

What must not change:

- Runtime authority boundaries.
- Existing ship projection data.
- Bottom-navigation shell direction; do not promote route navigation to the top.
- Host compatibility with SillyTavern and Lumiverse.
