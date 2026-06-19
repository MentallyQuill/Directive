# Mission Recovery Visual Target Loop

Visual Target Unit: Mission Recovery, including Save Controls, Save Game, Save As, Narration Recovery, Last Outcome review, Rewrite Narration, Rerun Outcome, and Delete Outcome.

Parent Surface: Mission page.

Primary user task: protect the current campaign state, recover from narration or outcome problems, and manage branch/save actions without confusing recovery controls with normal mission command.

Navigation direction: use the shared bottom command shelf as the route-menu model across desktop, shelf, and phone-width shells. The top shell is reserved for Directive identity/status and global Back/Close actions. Mission-local Command / Context / Side Work / Recovery sub-tabs remain content controls.

LCARS direction: original LCARS-inspired recovery console with compact status tiles, clear save state, separated recovery/risk actions, and small modern typography. The recovery surface should feel calm, operational, and trustworthy rather than dramatic.

Required states:

- normal save controls only,
- last outcome available,
- narration recovery pending,
- delete/rerun/rewrite actions available,
- no active campaign fallback.

Failure risks:

- Save controls remain a generic form card after the rest of Mission has a console structure,
- destructive actions sit next to routine save actions without enough hierarchy,
- Save As text or long branch names clip at phone width,
- recovery status is unclear until the user reads the full card,
- bottom navigation overlaps action rows,
- route navigation drifts back into the top shell.

Acceptance focus:

- Concept C's compact mobile-first Recovery console is binding.
- Recovery has status tiles for save, branch, narration, and outcome state.
- Save, narration, last-outcome, and risk actions are grouped by user intent.
- Bottom route navigation remains six tabs with zero top route tabs.
- Phone screenshots show no clipped labels, awkward wrapping, or overlap with the bottom shelf.
