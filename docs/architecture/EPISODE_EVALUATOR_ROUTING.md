# Episode Evaluator Routing

Gameplay narration belongs to SillyTavern's active main model and its normal extension prompt pipeline. Directive does not issue a narration sidecar call.

The periodic `episodeEvaluator` is a Directive-owned Reasoning role because its bounded task is semantic synthesis rather than extraction: it compares new accepted evidence with the current working capsule, produces a replacement summary without repetition, distinguishes one continuing encounter from a durable episode boundary, cites only supplied source and effect IDs, and may abstain. The existing behavioral fixture covers routine detail, a continuing encounter, a resolved lasting encounter, repeated prior memory, and no-lasting-development cases.

Routing is exclusive. An evaluation uses the Reasoning lane once when a pending checkpoint exists; it never calls Utility and Reasoning for comparison in production. The role has a ten-second ceiling, a closed response schema, no visible-output retry, and no state authority. Timeout, cancellation, invalid output, or unavailable routing fails closed without mutating Story Settlement.

This preserves the per-turn budget:

- ordinary accepted pair: one Utility interpretation, then SillyTavern's normal narration;
- checkpoint accepted pair: the same Utility interpretation, one bounded Reasoning episode evaluation, then normal narration;
- character creation: Reasoning only when the player explicitly requests drafting assistance.
