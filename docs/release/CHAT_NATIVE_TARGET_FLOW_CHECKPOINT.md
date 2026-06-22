# Chat-Native Target Flow Checkpoint

Last updated: June 22, 2026.

This checkpoint implements the target transition from the shelf-first Mission bridge to ordinary-chat play in SillyTavern.

Implemented:

- independent Utility and Reasoning provider routes;
- current-host-model, Connection Profile, and OpenAI-compatible transports;
- automatic fresh campaign chat creation with recovery-only rebinding;
- idempotent intro posting and activation recovery;
- player-safe prompt install/update/clear/rebuild lifecycle;
- message sent/edit/delete and chat-change observation;
- low-cost turn classification and worker recommendations;
- per-campaign serialized turn orchestration and deduplication;
- routine Command Competence handling;
- mechanics-first consequential adjudication;
- exactly-one response arbitration for each processing phase;
- recoverable provider and host-post failures without mechanics reroll;
- revisioned state gateway, bounded snapshots, and audit journals;
- proposal-only sidecars with authorized root and revision checks;
- chat-primary Campaign/Mission UI;
- recoverable `concluding` state, final scene, completion, prompt teardown, and archive action.

Verification is provided by `node tools/scripts/run-alpha-gate.mjs`. The automated gate covers host contracts and simulated SillyTavern APIs; a live-host smoke remains necessary before treating pre-alpha host integration as release-stable.
