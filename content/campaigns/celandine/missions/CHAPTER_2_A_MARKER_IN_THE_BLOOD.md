# Chapter 2: A Marker in the Blood

**Mission ID:** `chapter-2-a-marker-in-the-blood`  
**Opening stardate:** 53952.0  
**Baseline end:** 53953.4  
**Transition:** `chapter-2-the-briar-key`

## Dramatic question

Who may know that an entire population has become identifiable, and how can disclosure avoid turning protection into another registry?

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

### The Sample Web

Medical and field teams build an independent evidence network across people, crops, water, and livestock.

**Player-facing objectives**

- Set consent and sample rules
- Collect independent samples
- Protect chain of custody

Decision points: `decision.sample-consent`

### Seen from Orbit

Celandine sensors correlate field and population signatures while the data itself becomes a strategic asset.

**Player-facing objectives**

- Validate orbital detectability
- Bound false positives
- Set raw-data custody

Decision points: `decision.raw-data-custody`

### The Marker Function

Independent evidence confirms the marker and selected control-chemistry effects with important limits.

**Player-facing objectives**

- State the finding and uncertainty
- Identify immediate protective action
- Prepare disclosure options

### Before a Transition Exists

The player commits the first disclosure sequence and immediate guidance while institutions mobilize around the finding.

**Player-facing objectives**

- Brief selected or public audiences
- Protect medical rights
- Commit immediate protective guidance

Decision points: `decision.first-disclosure`

## Facts

- `fact.marker.cross-domain` (discoverable): Related marker signatures appear in people, fields, water, and livestock exposed to K-17 systems.
- `fact.marker.orbital-detection` (discoverable): Under favorable conditions, orbital sensors can identify marked population and crop geography but not perfectly identify every individual.
- `fact.marker.control-chemistry` (discoverable): Several control-compound families alter dormancy, fertility, or stress behavior in selected K-17 lines.
- `fact.marker.ration-linkage` (directorOnly): Existing ration and labor databases can be correlated with marker geography even without explicit names.
- `fact.marker.probabilistic` (known): The marker is probabilistic and environmental, not a perfect personal locator or proof of intent.

## Clocks

- **Sample Degradation** (2/8, playerFacing): delay, poor storage, contamination.
- **Leak Pressure** (1/6, hidden): large data transfer, contradictory briefing, unauthorized access.
- **Panic and Hoarding** (1/8, hidden): uncontrolled rumor, abrupt movement restriction, false clean-stock claim.

## Actor intentions

- `calen-varo`: Build a medically useful finding without converting patients into a regional identity database.
- `sovek`: Require independent cross-domain evidence before making the strongest claim.
- `lysa-voren`: Receive enough warning to prevent distribution collapse and uncontrolled panic.
- `elias-brand`: Ensure Starfleet can assess strategic risk and preserve evidence before full public release.

## Pressures

- **Urgency encourages broad sampling even though medical and environmental data can become identity infrastructure.** in `phase.sample-web`; cadence `Escalation`; clocks chapter2.sample-degradation.
- **Starfleet, Food Council, and medical teams request linked raw data for different legitimate and dangerous reasons.** in `phase.orbital-correlation`; cadence `Crisis`; clocks chapter2.leak-pressure.
- **The strongest result is urgent but depends on cross-laboratory interpretation and explicit limits.** in `phase.finding-confirmed`; cadence `Signal`; clocks chapter2.sample-degradation.
- **Officials, clinics, farmers, and the public need guidance before one complete regional plan exists.** in `phase.first-briefings`; cadence `Escalation`; clocks chapter2.leak-pressure, chapter2.panic-and-hoarding.

## Command decisions

### Sample and Consent

Whose blood, food, soil, water, and livestock samples may be used, and under what consent and retention rules?

**Stakes:** Patient rights; Evidence quality; Public cooperation; Time

Options are examples only; accept any causally grounded freeform command intent.

### Raw Data Custody

Who may hold and correlate medical, orbital, ration, and field data before public release?

**Stakes:** Privacy; Detection; Institutional power; Security

Options are examples only; accept any causally grounded freeform command intent.

### First Disclosure

What will command disclose, to whom, and in what sequence before a full transition plan exists?

**Stakes:** Hoarding; Protective action; Public trust; Starfleet scrutiny

Options are examples only; accept any causally grounded freeform command intent.

## End state

The mission ends through `end.chapter-2-a-marker-in-the-blood` and transitions to `chapter-2-the-briar-key`. This re-evaluates opportunities rather than enforcing a scene order.
