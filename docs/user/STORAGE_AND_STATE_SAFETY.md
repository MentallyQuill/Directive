# V1 Storage and State Safety

Directive V1 uses an isolated logical namespace:

```text
v1/index.v1.json
v1/drafts/{draftId}.v1.json
v1/saves/{saveId}.v1.json
```

SillyTavern maps these keys to user-scoped files whose names begin with `directive-v1-`. Player portraits use a separate V1 portrait path.

An accepted portrait remains part of the campaign. Replacing or removing a draft portrait, or discarding its draft, removes the superseded user file after the draft change commits. If a draft save fails after a new upload, Directive compensates by removing that unreferenced upload; cleanup failures are reported without rolling back an already-valid draft change.

Campaign acceptance validates the complete first save before changing the draft. If first-save persistence fails, Directive removes the partial save and restores the resumable draft. If host chat binding fails after the first save exists, the campaign remains as an unbound, recoverable V1 save; Directive restores the prior host chat and removes the failed campaign chat before the player retries Continue.

Every save must be `directive.campaignSave.v1`, bind to the exact Ashes package ID/version, contain an exact architecture stamp, and pass the V1 state contract. Directive does not search for, import, upgrade, or infer any other data. An unrecognized file is ignored unless it occupies a required V1 key, in which case initialization fails closed with a clear error.

State commits use a revisioned gateway. The gateway rejects stale proposals and forbidden domains. Persistence writes the save before publishing a successful result. If persistence fails, in-memory rollback occurs only when no concurrent state change has intervened; otherwise Directive reports an indeterminate conflict requiring operator review.

Checkpoints are complete V1 snapshots with `slotType: checkpoint` and a parent active-save reference. The checkpoint storage ID does not replace the parent active-save ID used by branch-bound mission, story, and chat authority. Loading a checkpoint restores that exact state into its parent active timeline and creates a playable continuation from the checkpoint chat. Deleting a checkpoint removes its explicit save record and index entry and asks the host to remove the cloned checkpoint chat.

If the checkpoint chat is currently selected when it is deleted, Directive first reopens the authoritative active campaign chat, restores its prompt, and only then removes the checkpoint clone. It never asks the host to delete the currently active chat.

Checkpoint creation fails closed: if the host cannot create the exact chat clone, Directive removes the incomplete checkpoint record. Checkpoint loading is compensating: if the continuation cannot be bound and opened, Directive restores the pre-load active timeline and removes any incomplete continuation chat it can identify.

For recovery, preserve the affected files, use Settings to verify storage, and export support diagnostics. Do not rename or hand-edit state files, and do not copy saves between package versions.
