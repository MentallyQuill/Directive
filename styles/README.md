# Styles

Directive CSS entry files and runtime styles.

`directive.css` is the manifest-loaded stylesheet for the current pre-alpha runtime. The final command-spine cascade defines the SillyTavern desktop/tablet shell: a fixed left LCARS spine, one resizable drawer, compact drawer-density overrides, a temporary full-screen workspace, and a phone-width bottom-navigation fallback.

The retired compact shell and Lumiverse migration selectors have been removed. New shell rules should remain scoped under `.directive-command-spine-shell` or the active runtime panel surfaces.

Keep selectors under the `directive-` prefix. Shell geometry belongs in shell/layout modules and scoped CSS, not in route panel renderers.
