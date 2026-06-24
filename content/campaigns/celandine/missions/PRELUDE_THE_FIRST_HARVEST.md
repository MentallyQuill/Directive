# Prelude: The First Harvest

**Mission ID:** `prelude-the-first-harvest`  
**Opening stardate:** 53944.1  
**Baseline end:** 53945.0  
**Transition:** `chapter-1-the-old-seed`

## Dramatic question

What kind of acting captain takes command when hunger, contagion, privacy, and public authority become one problem?

## Mission function

Advance Enemy's Garden through an authored tactical case while preserving regional continuity.

## Failure-forward contract

- Forbidden: end Enemy's Garden from a single failed check
- Forbidden: remove player agency from command decisions
- Forbidden: solve regional famine with unlimited replicators
- Forbidden: reveal the complete K-17 architecture without earned evidence
- Allowed cost: damage
- Allowed cost: delay
- Allowed cost: hunger
- Allowed cost: exposure
- Allowed cost: lost leverage
- Allowed cost: injury
- Allowed cost: ecological harm
- Allowed cost: harder evidence route
- Allowed cost: transformed objective
- Allowed cost: changed custody

## Phases

### The Empty Chair

Dorel enters medical isolation and the new XO receives the conn while the Arda emergency is still unfolding.

**Player-facing objectives**

- Assume lawful command
- Confirm Dorel medical boundary
- Delegate immediate workstreams

Decision points: `decision.assume-the-chair`

### The First Harvest

Field teams evacuate exposed workers, stabilize the processing tower, and protect enough grain and evidence for later decisions.

**Player-facing objectives**

- Evacuate workers
- Control ventilation and fire
- Preserve food and samples

Decision points: `decision.processing-tower-response`

### The Quarantine Line

Medical, shuttle, transporter, and ship operations require an explicit quarantine posture under imperfect detection.

**Player-facing objectives**

- Screen and isolate exposed people
- Protect ship operations
- Define release criteria

Decision points: `decision.ship-quarantine-posture`

### A Region Listening

The player reports the emergency, acting command, known K-17 risk, and immediate harvest posture to Starfleet and the region.

**Player-facing objectives**

- Brief crew and region
- Commit immediate Arda support
- Record unresolved unknowns

Decision points: `decision.first-public-briefing`

## Facts

- `fact.prelude.dormant-spore-release` (known): The Arda processing tower released a dormant spore cloud during routine cycling.
- `fact.prelude.biofilter-gap` (discoverable): Standard transporter biofilters do not reliably identify the dormant control-spore signature.
- `fact.prelude.dorel-neurological-response` (known): Dorel has a neurological response that makes normal duty unsafe and requires isolation.
- `fact.prelude.harvest-dependence` (known): Shutting the complex for the full decontamination cycle will cost a material portion of the regional grain reserve.
- `fact.prelude.control-family` (directorOnly): The released spores belong to a family involved in K-17 dormancy and environmental command responses.

## Clocks

- **Tower Exposure** (3/8, playerFacing): unprotected entry, ventilation spread, delayed evacuation.
- **Harvest Loss** (1/8, playerFacing): processing shutdown, worker evacuation, storm delay.
- **Public Rumor** (1/6, hidden): visible ship withdrawal, contradictory briefing, leaked medical detail.

## Actor intentions

- `maia-dorel`: Protect workers and the mission without using her condition to dictate from sickbay.
- `calen-varo`: Establish medically credible isolation and prevent politics from overriding release criteria.
- `ilyan-kes`: Keep enough of the Arda complex operating to prevent a regional grain shock.
- `rinn-sorell`: Create a clear operations plan and test whether the new XO can make timely decisions.

## Pressures

- **Dorel is suddenly unavailable and the crew needs a lawful, functional command chain.** in `phase.command-succession`; cadence `Crisis`; clocks none.
- **Every hour of shutdown protects workers while increasing grain loss and downstream shortage.** in `phase.tower-evacuation`; cadence `Escalation`; clocks prelude.harvest-loss.
- **Imperfect biofilters and political pressure make ship and planetary quarantine criteria contested.** in `phase.quarantine-line`; cadence `Escalation`; clocks prelude.tower-exposure.
- **The region demands immediate reassurance before full scientific certainty exists.** in `phase.harvest-settlement`; cadence `Signal`; clocks prelude.public-rumor.

## Command decisions

### Assume the Chair

How will the new XO establish acting command, protect Dorel medical privacy, and delegate the Arda response?

**Stakes:** Crew confidence; Dorel dignity; Regional legitimacy; Operational clarity

Options are examples only; accept any causally grounded freeform command intent.

### Processing Tower Response

What evacuation, isolation, shutdown, and harvest-continuity posture will command authorize at the exposed tower?

**Stakes:** Lives; Exposure; Harvest; Evidence

Options are examples only; accept any causally grounded freeform command intent.

### Ship Quarantine Posture

Will the Celandine hold orbit, withdraw, compartmentalize, or continue shuttle operations under enhanced screening?

**Stakes:** Ship safety; Relief continuity; Crew fatigue; Public confidence

Options are examples only; accept any causally grounded freeform command intent.

### First Public Briefing

What will command state about Dorel, K-17 risk, Arda harvest continuity, and uncertainty?

**Stakes:** Public trust; Medical privacy; Hoarding risk; Starfleet record

Options are examples only; accept any causally grounded freeform command intent.

## End state

The mission ends through `end.prelude-the-first-harvest` and transitions to `chapter-1-the-old-seed`. This re-evaluates opportunities rather than enforcing a scene order.
