# Selected Target

Selected direction: Concept C. Use the compact mobile-first LCARS Side Work console as the implementation target, with Concept B's stronger operations-queue hierarchy available only where it improves scanability.

Binding:

- Bottom command shelf navigation is the route-menu model across desktop, shelf, and phone.
- There is no top route-menu requirement for this target.
- Side Work gets a structured LCARS console even when no work is active.
- Status tiles summarize Open Orders, Follow-Ups, active work, and progress.
- Candidate, scheduled, active, and progress records use compact LCARS cards or rows.
- Actions remain grouped with their record and keep existing runtime behavior.
- Mission-local section tabs remain content controls, not shell routes.
- Phone layout must avoid text clipping and bottom shelf overlap.

Not binding:

- Exact generated concept colors.
- Decorative labels from image concepts.
- Fictional data invented by the image model.
- Any fake controls that do not map to runtime actions.
- Any layout treatment that makes Side Work compete with the main mission action.
