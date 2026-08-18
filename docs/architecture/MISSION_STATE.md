# Mission State

A mission definition is an authored rule graph, not a linear quest script. It declares facts, evidence policies, events, outcomes, objectives, Duty Reports, entry capabilities, closure rules, terminal dispositions, and transitions.

Objectives may be required, optional, or conditional. Visibility, availability, activation, progress, and terminal disposition are separate predicates. The UI orders visible objectives for readability, but completion is determined by predicates and `closeWhen`; the player may satisfy independent objectives in any valid order.

Interpretation begins with a closed packet of active evidence candidates. A utility model may select candidate IDs based on the exact accepted assistant/player pair. It cannot supply state operations. Deterministic validation then checks the source hash and swipe, policy custody, source role, active predicates, target identity, branch, mission, and revision. Only accepted claims reach the reducer.

Conditional objectives do not reveal themselves before their authored knowledge gate. Optional objective omission is not mission failure unless the player knew of the choice and the definition explicitly records an informed disposition. Outcome dimensions preserve partial success and cost without collapsing a mission into pass/fail.

Mission definitions and mission state do not contain countdown clocks. Urgency, deadlines, and elapsed-time consequences must first exist in accepted narration and then be represented by ordinary authored facts, events, and outcomes when they matter to mission authority. The separate campaign time ledger continues to advance from accepted story evidence, not wall time, and supplies the player-facing ship time, date, and Stardate.

When `closeWhen` becomes true, the reducer selects one terminal disposition and writes a transition receipt. The next mission activates only from that receipt and an exact target definition. The narration packet carries player-known outcomes and prohibited reveals so the model can bridge chapters without becoming progression authority.
