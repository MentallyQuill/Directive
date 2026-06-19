# Selected Target

Selected direction: Concept C. Use the compact mobile-first LCARS Recovery console as the implementation target, with Concept B's risk-grouping hierarchy where it improves clarity.

Binding:

- Bottom command shelf navigation is the route-menu model across desktop, shelf, and phone.
- Recovery receives a dedicated LCARS console, not a lone generic Save Controls card.
- Status tiles summarize Save, Branch, Narration, and Outcome state before controls.
- Save actions remain safe, primary recovery actions.
- Narration and last-outcome actions are available only when runtime state exposes them.
- Delete Outcome is visually separated as a risk action.
- Mission-local Recovery remains a content sub-tab, not shell route navigation.
- Phone layout must avoid text clipping and bottom shelf overlap.

Not binding:

- Exact generated concept colors.
- Decorative labels from image concepts.
- Fictional state invented by the image model.
- Any fake controls that do not map to runtime actions.
- Any layout treatment that makes recovery controls harder to trust quickly.
