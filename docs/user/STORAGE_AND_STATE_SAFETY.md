# V1 Storage and State Safety

Directive V1 uses an isolated logical namespace:

```text
v1/index.v1.json
v1/drafts/{draftId}.v1.json
v1/saves/{saveId}.v1.json
v1/operations/{campaignId}.timeline.v1.json
```

SillyTavern maps these keys to user-scoped files whose names begin with `directive-v1-`. Player portraits use a separate V1 portrait path.

An accepted portrait remains part of the campaign and can be replaced or removed from the player's Crew record. Directive removes a superseded user file only after the draft or campaign change commits. If persistence fails after a new upload, Directive compensates by removing that unreferenced upload; cleanup failures are reported without rolling back an already-valid state change.

Campaign acceptance validates the complete first save before changing the draft. If first-save persistence fails, Directive removes the partial save and restores the resumable draft. If host chat binding fails after the first save exists, the campaign remains as an unbound, recoverable V1 save; Directive restores the prior host chat and removes the failed campaign chat before the player retries Continue.

Every save must be `directive.campaignSave.v1`, bind to the exact Ashes package ID/version, contain an exact architecture stamp, and pass the V1 state contract. Directive does not search for, import, upgrade, or infer any other data. An unrecognized file is ignored unless it occupies a required V1 key, in which case initialization fails closed with a clear error.

State commits use a revisioned gateway. The gateway rejects stale proposals and forbidden domains. Persistence writes the save before publishing a successful result. If persistence fails, in-memory rollback occurs only when no concurrent state change has intervened; otherwise Directive reports an indeterminate conflict requiring operator review.

Saved games are complete immutable V1 snapshots with `slotType: checkpoint` and a source active-save reference. Their storage IDs do not replace the branch ID inside the saved state. **Save Game** clones the current chat without changing the active timeline. **Load Game** never overwrites or consumes the selected save: it preserves the timeline being left, clones the selected saved chat, assigns a new active save and chat identity, and opens that new continuation.

If the checkpoint chat is currently selected when it is deleted, Directive first reopens the authoritative active campaign chat, restores its prompt, and only then removes the checkpoint clone. It never asks the host to delete the currently active chat.

Creating a native SillyTavern branch from the exact active Directive campaign chat also creates a saved game automatically. Directive proves the parent backlink, character identity, exact retained message IDs, selected swipe, and text hashes before accepting the branch. Bookmarks, copied chats, unrelated chats, changed transcripts, and branches from non-campaign chats remain unbound. The optional naming dialog changes only the saved-game label.

Branching and Load Game use a per-campaign operation journal. The old timeline stays authoritative until a compare-and-swap changes `index.activeSaveId`. Before that commit point, failures leave the parent active and generation unbound in the incomplete child. After it, recovery moves forward to the child; it never overwrites the selected save or guesses a rollback across host and Directive storage.

Directive does not write a complete snapshot for every message. Native branch reconstruction scans the retained transcript once, invalidates discarded accepted sources in isolated memory, rebuilds derived state without model calls, assigns new custody identities, and validates the full V1 projection before persistence. Complete snapshots are written only for explicit Save Game, native branching, and Load Game operations.

Opening an immutable saved-game chat directly in SillyTavern does not activate it or install the campaign prompt. Use **Load Game** to create a playable continuation.

For recovery, preserve the affected files, use Settings to verify storage, and export support diagnostics. Do not rename or hand-edit state files, and do not copy saves between package versions.
