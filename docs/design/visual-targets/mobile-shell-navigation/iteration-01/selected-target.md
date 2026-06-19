# Selected Target

Selected concept: Concept C, compact implementation target.

## Decision Record

Concept C is the standing navigation direction for Directive's runtime shell. The product no longer treats top menu navigation as a requirement. Primary route navigation should stay in the bottom command shelf across desktop, shelf, and phone-width surfaces unless a future brief explicitly changes the product shell model.

## Binding

- Bottom route navigation remains the primary shell navigation.
- No route navigation moves to the top shell.
- Phone Back becomes an auxiliary segment inside the bottom command shelf.
- The separate full-width Back strip above route tabs is removed.
- Back is visible only when route history exists.
- Route tabs keep readable labels and stable touch targets.
- Active route is visually dominant through amber LCARS treatment.
- The content body gains vertical space whenever Back is enabled.

## Not Binding

- Generated text or fictional data.
- Any extra top-shell status copy from concept art.
- Any layout that makes Back look like a normal route.
- Any treatment that clips route labels or overlaps content.

## Runtime Acceptance Notes

- Phone viewport should have one bottom command shelf, not two stacked shell bars.
- Route count remains six.
- Back still functions against route history.
- Close remains in the top global action cluster.
- Desktop keeps its current top-right global action model.
