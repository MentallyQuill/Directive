# Directive Interface Design Bible

## Principle

Every visible element must help the player understand the story, make a command decision, or safely operate Directive. Internal system activity is not player content.

## Shell

The small ship icon beside SillyTavern's composer opens the expanded Directive interface. It stays visually subordinate to chat because chat is the primary play surface. The interface uses a dark LCARS-influenced visual system, strong route color, compact typography, touch-safe controls, and one bottom navigation bar on mobile.

## Routes

Campaign owns campaign selection, current saves, and V1 checkpoints. Ashes is playable; preview campaigns are greyed, locked, and non-interactive.

Mission owns the current mission title and summary, primary objectives, optional objectives, visible progress, known time-sensitive windows, known information, available support, and the terminal result. It never displays hidden objectives or a zero-value urgency block.

People owns Command Bearing reserve/use/cancel, senior staff profiles, visible relationship posture, and defining moments. It does not repeat the current mission title or expose numeric relationship meters.

Ship owns identity, capability, one operational overview, material limitations, and mission-linked readiness. Atmospheric color such as a flickering light or new-plating smell is prose unless a validated lasting effect changes the aggregate.

Settings owns model lanes, the Directive preset, storage verification, and support export. Story editing, reconciliation, anti-cheat controls, and semantic recovery tools are absent.

## Information rules

- One primary home per fact.
- Show outcome, not processing history.
- Prefer one aggregate over multiple low-value rows.
- Reveal information only through the player-safe projection.
- Optional work is labeled as outcome-shaping and non-required.
- A deadline is shown beside the objective it constrains, under Time-sensitive, only after it is known.
- Empty states explain what the player must do next without exposing internals.

## Responsive behavior

Desktop uses a centered expanded shell with generous reading width. Mobile keeps one-column content, bottom route navigation, resilient safe-area spacing, and no hover-only actions. Long mission and story text wraps; status labels remain scannable; dialogs never exceed the viewport.

The runtime shell, player-safe projections, and these five-route information rules are the visual and behavioral authority.
