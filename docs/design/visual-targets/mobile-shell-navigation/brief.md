# Mobile Shell Navigation Brief

Visual Target Unit: Mobile shell/navigation states

Parent Surface: Directive runtime shell

Primary user task: move between Directive pages on phone width, use Back when route history exists, and keep the active page content easy to operate with one thumb.

Information hierarchy:

- Top shell remains a compact title/global-action rail.
- Page content owns the scrollable center.
- Bottom route navigation remains the primary route switcher.
- Back is an auxiliary command, visible only when history exists.

Required controls:

- Back
- Close Directive
- Starships
- Mission
- Crew
- Ship
- Log
- Settings

UX goal:

- Keep bottom route navigation as the standing shell direction.
- Remove the visual competition caused by a separate Back strip above the route tabs.
- Preserve touch-safe route targets and readable labels at phone width.
- Give content more vertical room after route navigation.

Failure risks:

- Reintroducing route navigation at the top.
- Making Back look like a seventh primary route.
- Clipping Settings or Starships labels when Back is visible.
- Allowing the body to overlap the bottom shelf.

Saga reference behavior:

- Bottom route navigation.
- Compact mobile-first flow.
- Clear active tab state.
- Minimal chrome around the content.

LCARS requirements:

- Original UX-first LCARS-inspired command shelf.
- Dark terminal canvas.
- Segmented lower rail with curved end caps.
- Amber/orange active route, coral Back segment, lavender/blue inactive routes.
- Real controls only; decorative blocks must not look interactive.

Desktop and phone constraints:

- Desktop keeps top-right global Back/Close and bottom route navigation.
- Phone integrates Back into the bottom shelf rather than a second bottom bar.
- Phone must maintain no horizontal overflow at 390px width.

What must not change:

- Route IDs and runtime navigation behavior.
- Back route-history behavior.
- Close Directive behavior.
- Bottom route navigation as primary shell navigation.
