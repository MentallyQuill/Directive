# Android Desktop-Site Shell Compatibility

## Problem

Chrome on Android requests desktop sites with a 980 CSS-pixel viewport. SillyTavern still applies its `max-width: 1000px` mobile host rules at that width, including a fixed `body`, while Directive switches from its mobile shell to its desktop shell above 640px. SillyTavern's transformed root can therefore have zero layout height while Directive's fixed desktop shell still depends on `height: auto`, collapsing the shell to zero height.

## Approaches

1. **Give the desktop shell an explicit viewport-derived height (selected).** Keep the 940px desktop presentation and calculate its height from `100dvh`, retaining the existing 900px cap. This removes the dependency on the host root's containing-block height and preserves current mobile and desktop contracts.
2. Expand Directive's mobile breakpoint to 1000px. This would avoid the collapse but would show the mobile interface when the user explicitly requested a desktop site.
3. Add JavaScript that inspects `visualViewport` and SillyTavern host styles. This adds runtime state, resize synchronization, and browser-specific policy for a problem CSS can solve directly.

## Design

The desktop `.directive-runtime-panel.directive-expanded-shell` will use `height: calc(100dvh - 32px)` with the existing `max-height: 900px`, matching the current 16px top and bottom insets. The existing `max-width: 940px`, centered fixed positioning, scroll ownership, and the dedicated `max-width: 640px` full-screen mobile override remain unchanged.

A focused Chromium regression will load the production fixture at 980x720, reproduce SillyTavern's transformed root and fixed mobile body, and assert that the shell has positive height and stays within all viewport edges. It will also confirm the emulated host conditions are active, preventing the test from passing because its setup stopped reproducing the bug.

## Success Criteria

- At 980x720 under SillyTavern's mobile host conditions, the desktop shell is approximately 940x688 and remains fully inside the viewport.
- At 390x844, Directive retains its full-screen mobile shell.
- At widths above 1000px, the desktop shell keeps its current centered, capped geometry.
- Focused visual coverage and the complete repository gate pass.

