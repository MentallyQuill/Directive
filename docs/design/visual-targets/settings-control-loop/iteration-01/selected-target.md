# Selected Target

Selected concept: Concept C, compact mobile-first LCARS.

## Binding

- Bottom route navigation remains the primary shell navigation.
- No route navigation is introduced at the top.
- Settings becomes one LCARS control console rather than a vertical list of generic cards.
- The top of the page shows compact status tiles: package, save, mode, storage, appearance, and assist.
- Page-local sub-tabs group the dense settings controls: Systems, Safety, Packs, and Assist.
- Only one settings pane is active at a time to reduce phone-width scroll pressure.
- Safety controls are grouped as operator commands with touch-safe buttons.
- Appearance pack previews remain visual but compact.
- Provider Assist stays in Settings as an operator diagnostics surface.

## Not Binding

- Generated text, exact labels, and decorative microcopy from the concepts.
- Exact colors or fictional data in the generated images.
- Any decorative LCARS block that appears clickable without being a real control.
- Any layout choice that clips text, hides required controls, or increases task friction.

## Runtime Acceptance Notes

- The implementation should read as LCARS at a glance without sacrificing Settings usability.
- The first phone viewport should reveal status and local navigation, not consume the entire screen with passive runtime rows.
- Every existing Settings action must remain available and retain its current behavior.
- Hidden-state and raw-value labels must remain absent.
