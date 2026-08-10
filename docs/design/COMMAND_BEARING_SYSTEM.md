# Command Bearing

Command Bearing is one small, neutral reserve representing earned narrative authority. It is not morality, experience, inspiration, resolve, rank, or an anti-cheat system.

## State

`directive.commandBearing.v1` stores a balance, a capacity from one through five, idempotent award records, and idempotent spend records. Ashes starts with capacity three and balance zero.

## Earning

An award requires an authored, validated source ID and a player-facing reason. Campaign content decides eligibility; ordinary turns, objective completion, and model sentiment do not award points automatically. An award ID can be recorded once. If the reserve is full, the record remains uncredited so it cannot be collected later by replaying the same event.

Good award candidates are meaningful optional work, unusually responsible command under pressure, or an authored outcome the campaign explicitly wants to recognize. Awards should remain scarce enough to feel intentional.

## Spending

V1 supports one effect: `narrativeEdge`. The player reserves one point from the People page. Directive arms it only at a generation boundary and tells the narration model to create one credible favorable opening or soften one immediate cost. The edge cannot guarantee success, override established facts, decide the player's action, or erase a consequence.

The generated response remains provisional. Swipes keep the same edge armed, and the point commits only when the player sends a message accepting the selected response. The spend records the prompting player message, accepted assistant message and text hash, and accepting player message. Editing, deleting, or re-swiping any of those accepted sources refunds the point. The player can also cancel a reserved or armed edge before acceptance. Only one edge may be pending at a time, and every transition is idempotent.

## UI

The People page shows the current reserve, capacity, most recent credited reason, most recent committed use, and one Use or Cancel action. Pending copy explains whether the edge is reserved or armed. It does not show ranks, marks, hidden eligibility, review queues, or a second resource.
