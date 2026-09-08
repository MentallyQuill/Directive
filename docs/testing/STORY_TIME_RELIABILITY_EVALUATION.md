# Story-time reliability: disposable-host evaluation

Status: prepared, not executed. The automated regression suite proves runtime handling with scripted Utility responses; it does not establish live model estimation quality.

Use a disposable campaign and chat on a separately authorized test host. Record the source revision, installed revision, provider/model configuration, starting clock, and accepted-pair identity. Compare source and installed artifacts before testing. Do not replace an active installation or reuse player saves for this evaluation.

Run each sequence from a fresh known baseline, recording proposed seconds, committed seconds, basis, recovery outcome, and clock after each settlement and reload. Keep source text local; publish only synthetic examples and aggregate results.

| Sequence | Expected behavior |
|---|---|
| Short dialogue and physical actions | Contextual small passage, no fixed per-message increment |
| Explicit ten-minute wait; half hour; twenty-one minutes | Exact conversion to 600, 1800, and 1260 seconds |
| Approximate duration and 10–15 minute range | Plausible contextual estimate without false exact conversion |
| Work and wait concurrently | Count the encompassing interval once |
| Wait, then separate immediate action | Permit separately supported additional passage |
| Narrator recaps the player's already-settled wait | Do not charge that wait twice |
| Opening narration with old activity, followed by player action | Charge only the new player contribution |
| Player rejects narrated sleep; OOC correction | Exclude rejected sleep and distinguish surviving in-world speech |
| Future, hypothetical, refused, and historical durations | Do not treat the mentioned interval as enacted |
| Forward clock transition and midnight crossing | Forward arithmetic and correct day rollover |
| Unresolved or invalid Utility result, then manual retry | No partial commit; narration blocks; fresh interpretation can settle once |
| Storage failure, repeated delivery, and reload | Reuse valid interpretation when available; no duplicate advance |
| Edit, delete, swipe, and branch restoration | Reconstruct the selected timeline; intentional rollback is distinguishable from continuation |

For each model configuration, report missed passage, unsupported jumps, double counting, and recovery frequency as counts over attempted accepted pairs. Separate hard validation failures from debatable implicit estimates. Include unresolved examples and retry outcomes; do not score a blocked pair as successful zero passage. Any clock decrease during ordinary continuation or duplicate committed wait is a failure requiring investigation. Historical edits may legitimately lower time.

Review the results before tuning evidence rules or expanding numeric parsing. Do not infer model quality from the deterministic suite or change save history to improve scores.
