# Styles

Directive CSS entry files and runtime styles.

`directive.css` is the manifest-loaded stylesheet for the current pre-alpha runtime. The expanded-interface cascade defines a viewport-bound SillyTavern shell with the approved Voyager-era LCARS rail, fixed top chrome, bounded route content, and five-route bottom navigation on desktop/console and phone layouts.

New shell rules should remain scoped under `.directive-expanded-shell` or the active runtime panel surfaces.

Keep selectors under the `directive-` prefix. Shell geometry belongs in shell/layout modules and scoped CSS, not in route panel renderers.
