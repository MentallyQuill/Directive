# Chapter 1: The Old Seed

**Mission ID:** `chapter-1-the-old-seed`  
**Opening stardate:** 53946.0  
**Baseline end:** 53947.2  
**Transition:** `chapter-2-a-marker-in-the-blood`

## Dramatic question

Who owns a seed line when regional survival depends on multiplying it?

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

### The Last Clean Acre

The Celandine arrives during a reservoir dispute as heritage plots show drought stress and regional officials seek access.

**Player-facing objectives**

- Stabilize crop and water conditions
- Establish local authority and access
- Avoid contamination

Decision points: `decision.water-priority`

### Living Records

Scientists and farmers verify lineages, cultivation practice, and crossbreeding potential while deciding what documentation itself exposes.

**Player-facing objectives**

- Verify viable lines
- Record cultivation knowledge
- Protect custody and crop health

Decision points: `decision.seed-documentation`

### The Seed Is Not the File

Khepri, the Food Council, and the Celandine negotiate physical custody, mirrored samples, access, and multiplication.

**Player-facing objectives**

- Set parent-stock custody
- Define access and licenses
- Address freezer and transfer risk

Decision points: `decision.parent-stock-custody`

### What Survives Transfer

The first custody decision is implemented in water, freezer, field, and record systems.

**Player-facing objectives**

- Commit transfers or local multiplication
- Record outstanding obligations
- Update transition capacity

## Facts

- `fact.old-seed.heritage-lines` (known): Khepri preserved several pre-K-17 crop lines in small living plots and seed stores.
- `fact.old-seed.hidden-from-requisition` (discoverable): Farmers concealed the Last Clean Acre from wartime requisition and do not accept automatic Starfleet ownership.
- `fact.old-seed.crossbreeding-potential` (discoverable): Several lines can support Grayleaf or edited low-control mixed crops.
- `fact.old-seed.freezer-risk` (known): One unique line cannot safely be transferred through the Celandine unreliable seed freezer without repair or local multiplication.

## Clocks

- **Reservoir Fall** (2/8, playerFacing): elapsed time, high water draw, weather loss.
- **Requisition Pressure** (1/6, hidden): public location disclosure, Food Council emergency request, seed theft rumor.
- **Heritage Crop Stress** (1/6, playerFacing): insufficient water, soil disturbance, failed shade control.

## Actor intentions

- `sila-marr`: Protect the heritage lines from requisition while sharing enough knowledge to make them useful.
- `toma-rey`: Keep water allocation answerable to the communities carrying drought risk.
- `sovek`: Establish viability and crossbreeding potential without overclaiming limited stock.
- `lysa-voren`: Obtain enough verified seed or data to support a regional transition plan before the window closes.

## Pressures

- **Khepri cannot irrigate food acreage, heritage plots, and every trial at full level.** in `phase.clean-acre`; cadence `Escalation`; clocks chapter1.reservoir-fall, chapter1.crop-stress.
- **Handling, sampling, and documentation can damage or expose the small surviving stock.** in `phase.lineage-audit`; cadence `Signal`; clocks chapter1.crop-stress.
- **Food Council emergency law and regional need create a credible threat of unilateral requisition.** in `phase.custody-charter`; cadence `Crisis`; clocks chapter1.requisition-pressure.

## Command decisions

### Water Priority

How much scarce reservoir water will command and Khepri commit to the heritage plot, food acreage, and trials?

**Stakes:** Immediate food; Parent stock; Local legitimacy; Drought resilience

Options are examples only; accept any causally grounded freeform command intent.

### Seed Documentation

What genomic, cultivation, and location data will be copied, published, sealed, or kept under farmer custody?

**Stakes:** Requisition risk; Scientific utility; Farmer trust; Future access

Options are examples only; accept any causally grounded freeform command intent.

### Parent Stock Custody

Who will hold physical parent stock, mirrored samples, and multiplication rights?

**Stakes:** Seed sovereignty; Single-point failure; Alternative readiness; Emergency power

Options are examples only; accept any causally grounded freeform command intent.

## End state

The mission ends through `end.chapter-1-the-old-seed` and transitions to `chapter-2-a-marker-in-the-blood`. This re-evaluates opportunities rather than enforcing a scene order.
