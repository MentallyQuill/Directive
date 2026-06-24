# Unseen Border Campaign

## Status

This is the implementation-facing campaign baseline for **Unseen Border**. It contains full spoilers and is intended for authors, implementers, Mission Director logic, schema work, and playtest preparation.

## Identity baseline

- Campaign title: `Unseen Border`
- Campaign package: U.S.S. Aster Vale
- Ship class: New Orleans-class
- Opening stardate: `48612.3`
- Opening year: 2371
- Primary theater: the Lacuna March
- Player role: newly promoted Commander/XO, initial Acting Captain, and principal mission commander
- Runtime architecture: `directive.openWorldCampaign.v2`
- Expected campaign length: 32–50 sessions

## Campaign promise

Starfleet charts say the Lacuna March is empty in places where families are raising children, convoys move by mutable markers, and old war orders still decide who exists on paper. Captain Idris Kellan is trapped ashore under inquiry. Former XO Senka Halden has vanished after touching records no one admits were altered. Then an official colony route ends in empty space, and the U.S.S. Aster Vale is the only ship close enough to prove the map is lying.

Into that silence comes a newly promoted executive officer, acting commander of a frontier frigate, and the person expected to keep lawful order with records that cannot be trusted. Every route you restore may save a settlement, expose a sanctuary, or reveal which Starfleet hands helped hide people from one danger while leaving them vulnerable to another.

The March is not a puzzle waiting for a clean chart. Hadran war factions, Black Ledger traffickers, frightened councils, and Starfleet reviewers all want custody of the evidence before the people inside it can speak. To draw the border honestly, you will need to command the Aster Vale, protect the witnesses, and decide whether visibility is rescue, betrayal, or both.

## Campaign thesis

**A border is not only a line on a chart; it is the set of people, institutions, and records allowed to witness who crosses it.**

The campaign is not a whodunit with one secret architect. It is a political and operational border sandbox in which protective redaction, coerced disappearance, neglected records, criminal falsification, and wartime expediency overlap. The player must create a durable practice from cases that cannot all be solved by publishing or concealing more information.

## Opening baseline and succession

The player arrives as the newly promoted Executive Officer after Commander Senka Halden disappeared during a route-validation flight. Captain Idris Kellan remains the legal commanding officer but is ashore at Meridian Beacon under inquiry into wartime chart practices. The player therefore begins in acting command of a ship whose routines are functional, whose senior staff has already adapted to two command gaps, and whose operations officer expected to inherit the XO billet.

The opening is not a disguised tutorial in which Kellan returns to reclaim every consequential decision. It establishes a lawful and visible command record for the player. Kellan may later advise, disagree, return to limited or full duty, be relieved, retire, or share a negotiated transition, but any change in command authority must follow committed medical, legal, and relational state.

## Starting directives

- Restore reliable Starfleet navigation and distress response in the Lacuna March.
- Protect civilian life, lawful asylum, family unity, and freedom of navigation.
- Investigate missing chart data, Commander Halden's disappearance, and irregular use of Starfleet credentials.
- Prevent Hadran civil-war violence and criminal exploitation from spreading through the March.
- Avoid exposing protected populations or prejudicing their status without lawful necessity and meaningful review.
- Establish an accountable regional practice for route custody, inspections, evidence, and emergency protection.

## Ship and mission fit

A compact New Orleans-class frontier frigate with strong sensors, modular mission pods, credible defensive capability, and enough small-team flexibility for a dispersed border mission. The Aster Vale is not large enough to impose order across the March without alliances, delegation, and careful use of local knowledge.

The New Orleans-class is large enough to sustain a dispersed patrol, carry specialized mission pods, perform boarding and rescue, and serve as a diplomatic venue. It is too small to map, guard, transport, and administer the entire March. That limitation makes local pilots, refugee councils, civic authorities, independent couriers, Starfleet logistics, and even reluctant Hadran cooperation operationally meaningful.

**Starting constraints**

- The ship cannot secure every route or settlement at once.
- Large refugee movements require civilian and local transport partners.
- One mission pod cannot perform every specialized role simultaneously.
- A sustained fight against multiple Hadran patrol craft would require withdrawal, allies, or a positional advantage.

## Fixed Director-only truths

- No single mastermind erased the Lacuna March. The present map is the accumulated result of protective Starfleet redactions, local non-recognition, Hadran coercion, Black Ledger falsification, lost infrastructure, and ordinary administrative neglect.
- The Lacuna Protocol began as an informal network of pilots, Starfleet personnel, local officials, and relief workers who separated route verification from public visibility to protect civilians during the Hadran conflict.
- Commander Senka Halden survived the shuttle incident. She distributed her audit so no one capture, confession, or archive could expose every witness or sanctuary.
- Captain Kellan approved and supported limited protective chart redactions. He did not know the complete Protocol, Black Ledger penetration, Halden’s full audit, or every sanctuary coordinate.
- Far Lantern is a compartmented archive and authentication facility assembled from Starfleet, local, and captured Hadran components. It contains both accountability evidence and routes to protected populations.
- Black Ledger did not create the Protocol. It learned to exploit scarcity, silence, separated custody, and inconsistent identity records for coercive passage, debt, disappearance, and targeted sale of coordinates.
- Hadran authorities are not monolithic. Some seek civilians and dissidents; others seek border order, dead, records, or political leverage. Their methods and access remain dangerous even where a claim is legitimate.
- No faction or character begins with the complete truth. Halden has the broadest audit, but even she does not know every present route state or actor motive.

## Campaign structure

The campaign contains one onboarding prelude, ten further main operations including finale and epilogue, eleven designed side assignments, two standing open-world activities, five orienting arcs, fourteen thread templates, six persistent fronts, eight clocks, eight hidden state tracks, thirteen end conditions, seven continuation frames, and three bespoke tactical mission graphs. Main work opens through facts, route state, public pressure, front conditions, and prior resolutions rather than a chapter cursor.

| Quest | Kind | Dramatic question | Baseline availability |
| --- | --- | --- | --- |
| The Blank Route | onboarding | What does the new Executive Officer treat as authoritative when the chart and the inhabited universe disagree? | Always available when the Director can causally frame it. |
| The Missing Colony | main | Can Starfleet restore a community to the map without turning recognition into exposure? | All of: quest prelude-the-blank-route is resolved |
| Halden's Shuttle | main | Who may be endangered in order to learn what happened to a missing Starfleet officer? | All of: quest chapter-1-the-missing-colony is resolved |
| The Halloway Ledger | main | Can accountability preserve the people whose protection depended on secrecy? | Any of: quest chapter-2-haldens-shuttle is resolved; factKnown (factId=fact.halden-alive) |
| Routes Without Records | main | Who should own a route when publishing it changes what the route is for? | All of: quest chapter-2-haldens-shuttle is resolved |
| The Price of Passage | main | How can Starfleet attack coercion without collapsing the transport system people use to survive? | Any of: quest chapter-3-the-halloway-ledger is resolved; criminal-exploitation gte 5 |
| The People Between Maps | main | What does a border owe people whose legal identities were defined by the conflict they escaped? | Any of: quest chapter-4-routes-without-records is resolved; refugee-pressure gte 6 |
| The Officer in the Veil | main | Can an officer be protected as a witness while being held accountable for the methods that made the evidence possible? | All of: halden-trail gte 4; quest chapter-3-the-halloway-ledger is resolved |
| Far Lantern | main | What should survive when one archive contains both the truth and the coordinates of everyone the truth could endanger? | Any of: quest chapter-7-the-officer-in-the-veil is resolved; chart-restoration gte 6 |
| A Border Without Witnesses | main | What does lawful command require when a lawful order would make accountability and protection mutually exclusive? | All of: quest chapter-8-far-lantern is resolved |
| Draw the Border | finale | Can the March become visible enough to protect people without becoming legible enough to control them? | All of: quest chapter-9-border-without-witnesses is resolved; at least 4 known fact(s) tagged protocol |
| The Lines We Keep | epilogue | What must be recorded, protected, repaired, or relinquished for the settlement to remain a peace rather than a pause? | All of: quest finale-draw-the-border is resolved |
| The Schoolship | side | Can schooling remain ordinary when every safe route is also a political statement? | All of: quest prelude-the-blank-route is resolved |
| Customs Without a Port | side | Can a mobile institution be accountable without becoming easy to seize? | Any of: quest chapter-1-the-missing-colony is resolved; locationKnown (locationId=sable-crossing) |
| Beacon for No One | side | What is a beacon for after the people it named have gone? | All of: quest prelude-the-blank-route is resolved |
| The Quiet Census | side | How can a community count what it must sustain without making every person legible to power? | Any of: quest chapter-4-routes-without-records is resolved; refugee-pressure gte 5 |
| The Long Way Home | side | What is a homeward route worth when each checkpoint recognizes a different family? | All of: quest chapter-1-the-missing-colony is resolved |
| Maps for Smugglers | side | Can a useful route remain lawful when the person who knows it is not? | Any of: quest chapter-4-routes-without-records is resolved; quest chapter-5-the-price-of-passage is resolved |
| The Hadran Funeral | side | Can enemies carry their dead across a border without claiming the living? | Any of: quest chapter-2-haldens-shuttle is resolved; civil-war-spillover gte 4 |
| The Missing Sensor Pod | side | How much should command risk to recover a machine that remembers where everyone went? | Any of: quest chapter-4-routes-without-records is resolved; flag opening-doctrine-transparent = True |
| A Name at Halloway | side | Does family connection create a right to be found? | All of: quest chapter-3-the-halloway-ledger is resolved |
| The Unclaimed Dead | side | Who may name the dead when every surviving record has a different answer? | Any of: quest chapter-3-the-halloway-ledger is resolved; locationKnown (locationId=sable-crossing) |
| Kestrel Homesteads | side | What does formal recognition owe communities that built survival from systems nobody acknowledged? | Any of: quest chapter-4-routes-without-records is resolved; locationKnown (locationId=kestrel-system) |
| March Patrol | emergent | What does useful Starfleet presence look like between major crises? | All of: quest prelude-the-blank-route is resolved |
| Route Review | emergent | When should a route be opened, closed, restricted, forgotten, or placed in another custodian's hands? | All of: quest prelude-the-blank-route is resolved |

## Story arcs

### The Blank Route

**Question:** What does the new Executive Officer treat as authoritative when the chart and the inhabited universe disagree?

Establish acting command, the ship's relationship to uncertain charts, and the first evidence that valid Starfleet records contradict lived reality.

**Milestones**

- Acting Command: The player has taken operational command and established an initial doctrine for disputed routes.
- Halloway Contact: Halloway's existence and chosen status have been confronted rather than treated as a navigational anomaly.

### No Such System

**Question:** Who was erased, who consented, and who gained power from absence?

Trace Halden, recover evidence, and separate protective redaction from coercive disappearance and institutional concealment.

**Milestones**

- Halden Survived: The campaign has a credible living trail for Halden and multiple evidence routes.
- Ledger Classified: The campaign distinguishes consented protection, coerced erasure, and criminal alteration.
- Halden Status: Halden has a defined status as witness, officer, fugitive, captive, or protected local actor.

### Routes Without Records

**Question:** Who owns a route when publishing it changes who can use it and why?

Survey, maintain, restrict, and govern the March's routes while chart confidence, physical safety, and political exposure change independently.

**Milestones**

- Route Families Surveyed: The campaign has enough route knowledge and custody practice to support a regional policy.
- Far Lantern Custody: The central archive has been preserved, transformed, lost, or exposed under a known custody choice.

### The People Between Maps

**Question:** What does border order owe people whose safety depends on remaining partly outside it?

Build or deny practical legitimacy for refugees, colonies, local councils, courts, and transport networks while confronting Hadran and criminal coercion.

**Milestones**

- Transport Alternative: A recognizable lawful, negotiated, or coercive passage regime exists.
- Protection Regime: The March has a durable or visibly failed practice for asylum, family passage, and capacity.

### Draw the Border

**Question:** Can the March become visible enough to protect people without becoming legible enough to control them?

Resolve command authority, evidence custody, route access, force posture, and the post-crisis settlement through state assembled from the whole campaign.

**Milestones**

- Authority Entering the Finale: Evidence and authority enter the finale in a known configuration.
- Border Drawn: The armed, humanitarian, and institutional convergence has produced a settlement or catastrophe.
- Lines Kept: The campaign has committed its public record, protected record, command consequences, and continuation state.

## Command Bearing moments

- The chart shows empty space where a colony answers a verified distress call.
- A protected settlement requests recognition while warning that recognition may expose its residents.
- Halden evidence can be secured quickly only by endangering civilian witnesses and rescuers.
- A route can be made physically safe only by giving Starfleet, Hadran, or Black Ledger a usable traffic picture.
- A lawful superior demands full chart upload while protected communities refuse consent.
- Kellan returns aboard while the player has a developed acting-command record and the inquiry remains unresolved.
- Halden requests protection as a witness but cannot be exempted from accountability for her own methods.
- Far Lantern can preserve truth, erase names, tier access, or be destroyed; no choice protects every value.
- The final border compact requires an enforceable answer to who may know, use, restrict, and audit each route.

Command Bearing applies only where routine competence cannot decide among incompatible values. A route restriction, custody order, disclosure tier, command succession, or rules-of-engagement decision may qualify. Routine scanning, chart comparison, rescue triage, secure transport, and evidence handling should normally be supplied by professional competence rather than converted into tests of player cleverness.

## Ending model

The finale and epilogue are assembled from six independent axes: refugee safety, navigation and access, border stability, criminal control, truth and accountability, and ship and command. The package recognizes strong success, constrained protection, centralized restoration, transactional passage, armed collapse, and broad disappearance as distinct outcomes. Ship loss or command removal can be a terminal candidate without automatically making the campaign objective a failure.

## Failure and recovery

No single failed check ends a mission. Failure creates delay, exposure, injury, degraded confidence, lost custody, witness flight, route closure, public resistance, tactical disadvantage, or transformed objectives. Evidence has multiple routes: logs, calibration residue, testimony, physical route changes, access records, traffic patterns, medical evidence, maintenance history, and the behavior of actors who believe something is hidden.

The campaign remains playable if Halden refuses cooperation, Kellan is relieved, Far Lantern is damaged, a sanctuary relocates, a route becomes unusable, Black Ledger retains leverage, the Aster Vale is badly damaged, or a faction withdraws. Severe states are recorded and may transform the operational frame rather than resetting the world.

## Mission direction rules

- Situation on rails, solution off rails.
- The Lacuna March is a persistent region; locations, routes, factions, witnesses, and obligations continue outside the foreground quest.
- Every dynamic event and front advance must have a causal parent in committed state, elapsed time, actor goals, or a physical process.
- Travel advances stardate and may advance only causally ready fronts and clocks.
- Model route physical status, confidence, visibility, access, and custodian as separable dimensions.
- Keep protective redaction, privacy, non-recognition, coerced disappearance, archival loss, and criminal falsification distinct.
- Calm side assignments and ordinary life may remain unrelated to Halden, the Protocol, Black Ledger, or Hadran operations.
- Crew disagreement should be focused and professionally grounded; not every senior officer speaks in every decision.
- No actor begins with complete campaign truth. Preserve knowledge boundaries and mistaken beliefs.
- If the player bypasses an expected scene, move information only through a plausible alternate source with an actual cost.
- Factions act between scenes according to goals, information, capacity, risk tolerance, and timing.
- Draw the Border must read actual route state, allies, assets, evidence custody, faction posture, ship condition, Kellan and Halden status, crew readiness, and unresolved obligations.

## Production decisions still open

- Registry number
- Construction yard
- Exact date of original commission
- Starship registry number
- Ship hero image
