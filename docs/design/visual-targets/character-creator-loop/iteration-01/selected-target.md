# Selected Target

Selected direction: Concept C is the target bias, with Concept A's conservative control clarity retained.

Binding:

- Bottom route navigation remains the shell rule across desktop, shelf, and phone.
- Creator steps are page-local workflow controls, not top route navigation.
- The first viewport should show commissioning status, progress, step controls, command controls, and the active form pane.
- Only one creator section should be visually active at a time.
- Save Draft, Begin, Back, and simulation mode stay near the active pane.
- Inactive sections remain mounted so draft persistence and tests can collect the full input model.
- LCARS styling must be structural: status tiles, rails, color-blocking, compact command rows, and asymmetric panels.

Not binding:

- Generated text.
- Exact colors.
- Any invented character facts.
- Decorative fake controls.
- Exact concept-art spacing.

Implementation notes:

- Use `directive-creator-console` as the creator wrapper.
- Use `directive-creator-status-grid` and `directive-creator-progress-grid` before the active pane.
- Use `directive-creator-step-row` for page-local creator steps.
- Use `directive-creator-command-bar` for mode, Save Draft, Begin, and Back.
- Use `directive-creator-section-active` for the visible section while keeping inactive inputs in the DOM.
