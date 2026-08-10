# V1 Storage and State Safety

Directive V1 uses an isolated logical namespace:

```text
v1/index.v1.json
v1/drafts/{draftId}.v1.json
v1/saves/{saveId}.v1.json
```

SillyTavern maps these keys to user-scoped files whose names begin with `directive-v1-`. Player portraits use a separate V1 portrait path.

Every save must be `directive.campaignSave.v1`, bind to the exact Ashes package ID/version, contain an exact architecture stamp, and pass the V1 state contract. Directive does not search for, import, upgrade, or infer any other data. An unrecognized file is ignored unless it occupies a required V1 key, in which case initialization fails closed with a clear error.

State commits use a revisioned gateway. The gateway rejects stale proposals and forbidden domains. Persistence writes the save before publishing a successful result. If persistence fails, in-memory rollback occurs only when no concurrent state change has intervened; otherwise Directive reports an indeterminate conflict requiring operator review.

Checkpoints are complete V1 saves with `slotType: checkpoint` and a parent save reference. Loading a checkpoint selects that exact V1 state. Deleting a checkpoint removes only its explicit save record and index entry.

For recovery, preserve the affected files, use Settings to verify storage, and export support diagnostics. Do not rename or hand-edit state files, and do not copy saves between package versions.
