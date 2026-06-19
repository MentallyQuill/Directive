# Character Creator Visual Target Loop

Target unit: Character Creator page.

Target scope: the pre-campaign player officer setup flow, including draft status, step progress, identity/service/personality/review input groups, simulation mode, Save Draft, Begin, and Back.

Navigation direction: use the shared bottom route navigation as the primary route model across desktop, shelf, and phone-width shells. The top shell is reserved for Directive identity/status and global actions. Page-local creator steps may live inside the content because they are workflow controls, not route navigation.

LCARS direction: original LCARS-inspired command-console structure with asymmetric rails, compact status blocks, amber/coral/plum/teal accents, and real controls that stay readable before they become decorative.

UX direction: do not show every creator section as one long stack. Keep progress visible, keep the active step focused, keep Save Draft/Begin/mode controls close to the active pane, and keep inactive inputs mounted so draft collection remains reliable.

Primary risks:

- LCARS chrome crowding form fields.
- Button labels clipping on phone width.
- Route navigation drifting back to the top shell.
- Hiding inactive sections in a way that breaks draft collection.
- Generated concept art inventing hidden state or impossible controls.

Acceptance:

- The first viewport shows a commissioning status area, step progress, step selector, command bar, and active creator pane.
- Bottom route navigation remains the only route navigation.
- Page-local step controls are visually distinct from shell route tabs.
- Save Draft, Begin, Back, and simulation mode remain visible and usable.
- All creator input paths remain mounted in the DOM for draft persistence.
- Phone screenshots show no clipped labels, squished controls, or route overlap.
