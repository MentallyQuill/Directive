# Player Turn Sequence

1. SillyTavern displays an assistant response. It is provisional and creates no Directive state.
2. The player may swipe among variants without committing any variant.
3. The player sends their next message. Directive captures the selected previous assistant variant and this player message as one exact accepted pair.
4. The pair is bound to package, save, campaign, chat, branch, mission, message IDs, selected swipe, content hashes, and source-range hash.
5. Time adjudication may propose elapsed story time.
6. Directive builds a closed set of currently eligible mission evidence candidates. A Utility call may select candidates from the accepted prose.
7. Deterministic validation rejects stale revisions, mismatched sources, invalid policies, failed predicates, unknown targets, and unsupported claims.
8. The mission reducer applies accepted claims. Story Settlement accepts the source contributions and typed effects into the current episode.
9. Eligible Duty Reports, episode review, mission closure, authored Command Bearing awards, and transition activation run through their exact contracts.
10. Bounded state-gateway commits persist only their declared changed domains. A stale revision or failed persistence cannot partially overwrite newer state.
11. Player projections and the chat-bound prompt packet rebuild from committed state.
12. SillyTavern generates the next provisional response.

If the player reserves a Command Bearing edge, step 12 first arms it to the exact player message prompting that generation. Swipes remain provisional. The edge commits at step 3 of the following turn only when that prompting-message anchor matches; replay of an older pair cannot consume it. Cancelling before acceptance refunds it, as does later invalidation of its prompting, beneficiary, or accepting source.

If the player later edits, deletes, hides, or changes a selected source, Directive invalidates that source and replays surviving accepted pairs. The rebuilt state may remove knowledge, reopen dependent progress, supersede story material, or roll back later mission custody when causal evidence no longer exists.
