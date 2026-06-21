# Styles

Directive CSS entry files and runtime styles.

`directive.css` is the manifest-loaded stylesheet for the current pre-alpha runtime. The final command-spine cascade defines the SillyTavern desktop/tablet shell: a fixed left LCARS spine, one resizable drawer, compact drawer-density overrides, a temporary full-screen workspace, and a phone-width bottom-navigation fallback.

The stylesheet still contains the prior compact-shell rules because the Lumiverse frontend uses `directive-compact-shell.js` during the host migration. New SillyTavern shell rules should remain scoped under `.directive-command-spine-shell`; do not remove the legacy compact-shell selectors until Lumiverse moves to the command-spine contract.

Keep selectors under the `directive-` prefix. Shell geometry belongs in shell/layout modules and scoped CSS, not in route panel renderers.
