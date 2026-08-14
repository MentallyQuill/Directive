# Android Desktop-Site Shell Compatibility

## Problem

Chrome on Android requests desktop sites with a 980 CSS-pixel viewport. SillyTavern still applies its `max-width: 1000px` mobile host rules at that width, including a fixed `body`, while Directive switches from its mobile shell to its desktop shell above 640px. SillyTavern's transformed root can therefore have zero layout height while Directive's fixed desktop shell still depends on `height: auto`, collapsing the shell to zero height.

## Approaches

1. **Anchor the desktop shell to Directive's viewport-sized panel host (selected).** Change only the desktop shell from fixed to absolute positioning. Its 16px insets and auto height then resolve against the existing 100dvh positioned host instead of SillyTavern's transformed, zero-height root.
2. Give the fixed desktop shell an explicit viewport-derived height. This restores its size but negative auto margins against the zero-height containing block move it above the page.
3. Expand Directive's mobile breakpoint to 1000px. This avoids the collapse but shows the mobile interface when the user explicitly requested a desktop site.

## Design

The desktop `.directive-runtime-panel.directive-expanded-shell` will use `position: absolute` inside `.directive-runtime-panel-host`, which already has `position: relative` and a 100dvh minimum height. The existing 16px insets, auto height, 900px height cap, 940px width cap, centered margins, and scroll ownership remain unchanged. The dedicated `max-width: 640px` override continues to make the mobile shell fixed and full-screen.

A focused Chromium regression will load the production fixture at 980x720, reproduce SillyTavern's transformed root and fixed mobile body, and assert that the shell has positive height and stays within all viewport edges. It will also confirm the emulated host conditions are active, preventing the test from passing because its setup stopped reproducing the bug.

## Success Criteria

- At 980x720 under SillyTavern's mobile host conditions, the desktop shell is approximately 940x688 and remains fully inside the viewport.
- At 390x844, Directive retains its full-screen mobile shell.
- At widths above 1000px, the desktop shell keeps its current centered, capped geometry.
- Focused visual coverage and the complete repository gate pass.
