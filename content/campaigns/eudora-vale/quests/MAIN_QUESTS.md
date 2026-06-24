# Broken Accord Main Quest Reference

This document contains full spoilers and state effects.

## The Captain's Chair

- **ID:** `prelude-the-captains-chair`
- **Kind:** onboarding
- **Initial status:** `active`
- **Typical duration:** 1-2 sessions
- **Locations:** U.S.S. Eudora Vale, Crown Station, Harmonic Spindle
- **Actors:** Nasrin Rhee, Asha Ren, Jaya Kel, Haro ch'Veth, Milo Fenn, Rear Admiral Celeste Osei, First Minister Elian Vorr
- **Factions:** Starfleet Ilyra Review Mission, Ilyra Accord Secretariat, Lattice Engineers' Union
- **Mission graph:** `mission-graphs/prelude-the-captains-chair.mission-graph.json`
- **Delegation:** Not allowed as a whole. The opening succession and first system-wide allocation cannot be delegated.
- **Calm content:** No

### Player-safe premise

A lattice surge tears open a Crown Station habitat during the Eudora Vale's approach. Captain Nasrin Rhee leads a shuttle evacuation while the XO coordinates the ship, and a secondary inversion kills Rhee after the evacuees transport clear, forcing the player to assume command and choose where the system will carry the emergency load.

### Director purpose

The prelude establishes ordinary XO competence, Rhee's death, lawful succession, damaged deflector capacity, the first persistent allocation consequence, and the campaign rule that every rescue shifts pressure somewhere else. The cause is genuinely uncertain at first; do not force sabotage as the opening answer.

### Dramatic question

> What kind of captain does the player become when their first command decision must make one population carry a cost?

### Availability

```json
{}
```

### Objectives

- Assume principal mission command during the Crown Station approach and review the ship's lattice-response limits.
- Rescue the maintenance-habitat population and prevent Crown Station from losing orbital control.
- Coordinate Rhee's shuttle evacuation and the Eudora Vale transport response.
- Commit an emergency load-shedding or ship-interposition plan with incomplete telemetry.
- Assume lawful command after Rhee's death, appoint or define an acting XO arrangement, and issue the first standing orders.

### Pressures

- Crown Station gravity and life support are failing in different sections.
- The Eudora Vale main deflector can synchronize only briefly before overload.
- Public telemetry does not agree with raw maintenance readings.
- Every safe load-shedding route creates weather, health, industrial, or ecological consequences elsewhere.
- The crew must process Rhee's death while the system's governments demand an explanation.

### Revelations and clue resilience

- **revelation.opening-linked-loads:** The surge is distributed through several nodes rather than confined to Crown Station. Required: True. Alternate routes allowed: True.
- **revelation.rhee-death:** Rhee's shuttle passengers transport clear before a secondary power inversion destroys the craft. Required: True. Alternate routes allowed: False.
- **revelation.telemetry-disagreement:** Raw node readings contain categories absent from Crown Station's public displays. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Use the Eudora Vale deflector and structural systems to absorb part of the surge.
- Concentrate the emergency load on one world or infrastructure node.
- Distribute smaller harms across several locations with local consent where time allows.
- Delegate portions of the rescue to local traffic control, union crews, and shuttles.
- Challenge the official allocation recommendation and improvise a different causal solution.

### Outcome families

#### opening-shared-burden

The player distributes the emergency load across several locations and accepts visible but limited harm on multiple worlds.

**Persistent effects:** adjust `distribution-equity` by +1; adjust `public-legitimacy` by +1; adjust `lattice-integrity` by -1; adjust `resource-reserves` by -1; set `opening-load-strategy` to `shared-burden`; reveal `fact.linked-lattice-loads`
#### opening-concentrated-load

The player saves Crown Station by concentrating the burden on one chosen world or node, creating a persistent local crisis.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `distribution-equity` by -2; adjust `public-legitimacy` by -1; adjust `nacre-secession-pressure` by +1; set `opening-load-strategy` to `concentrated-player-defined`; reveal `fact.linked-lattice-loads`
#### opening-ship-interposition

The Eudora Vale absorbs an unusually large share of the surge, reducing immediate planetary harm while damaging the ship and consuming reserves.

**Persistent effects:** adjust `distribution-equity` by +1; adjust `crew-command-confidence` by +1; adjust `resource-reserves` by -2; adjust `starfleet-scrutiny` by +1; set `opening-load-strategy` to `ship-interposition`; set `deflector-damage-severe` to `True`; reveal `fact.linked-lattice-loads`
#### opening-fractured-response

The rescue succeeds only partially; Crown Station survives, but uncoordinated local actions produce wider damage and an uncertain public account.

**Persistent effects:** adjust `lattice-integrity` by -2; adjust `public-legitimacy` by -1; adjust `crew-command-confidence` by -1; advance `front.lattice-cascade` by 1; adjust `clock.next-surge` by +1; set `opening-load-strategy` to `fractured`; reveal `fact.linked-lattice-loads`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Bread and Weather

- **ID:** `chapter-1-bread-and-weather`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Aurelia, Solis Terraces, Crown Station
- **Actors:** Minister Talia Iven, First Minister Elian Vorr, Haro ch'Veth, Milo Fenn, Ila Tovan
- **Factions:** Ilyra Accord Secretariat, Pelagic Council, Starfleet Ilyra Review Mission
- **Mission graph:** `mission-graphs/chapter-1-bread-and-weather.mission-graph.json`
- **Delegation:** Not allowed as a whole. The first Aurelian intervention sets a major allocation precedent and requires captain-level authority.
- **Calm content:** No

### Player-safe premise

Solis Terraces loses humidity control and begins shedding heat into an already unstable lattice. Aurelia asks the Eudora Vale to restore the crop climate before a harvest window closes, while Pelagos warns that the requested moisture draw will threaten floating settlements.

### Director purpose

This quest makes Aurelia sympathetic and privileged at the same time. It should reveal real food risk, the world's imported moisture dependence, and the political habit of treating Aurelian stability as system stability. The player can save crops without preserving every existing allocation.

### Dramatic question

> How much immediate food security may one world demand from a system whose old guarantees concealed their cost?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "prelude-the-captains-chair"
    }
  ]
}
```

### Objectives

- Stabilize the climate towers and protect workers, seed vaults, and food stores.
- Determine how much moisture and heat exchange the terraces actually require.
- Coordinate or contest Aurelia's request for priority lattice access.
- Account for consequences to Pelagos, Ferrum, and the ship's fabrication reserves.
- Establish whether local and public telemetry will record the full intervention.

### Pressures

- The crop window is measured in hours, not political cycles.
- A full moisture draw raises Pelagic sea-level risk.
- Aurelia's population treats food protection as an obvious system priority.
- Industrial replicator feedstock can fabricate climate components or be saved for later system repairs.

### Revelations and clue resilience

- **revelation.aurelia-moisture:** Aurelia imports substantially more Pelagic water vapor than civic summaries disclose. Required: True. Alternate routes allowed: True.
- **revelation.aurelia-heat:** Solis Terraces export waste heat that Ferrum and the Spindle use as a predictable baseline. Required: False. Alternate routes allowed: True.
- **revelation.public-priority:** The current control logic gives Aurelian crop stability priority during ambiguous states. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Restore full climate control through a large Pelagic moisture draw.
- Ration the terraces and preserve seed and staple crops rather than the full harvest.
- Use the Eudora Vale and local weather towers for a temporary closed atmospheric cycle.
- Negotiate a transparent emergency exchange with Pelagos and Ferrum.
- Accept crop losses while redirecting reserves toward a system-wide alternative.

### Outcome families

#### aurelia-full-restoration

The harvest is largely preserved through priority moisture and heat allocation, increasing stability while moving cost elsewhere.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `resource-reserves` by -1; adjust `distribution-equity` by -1; adjust `clock.pelagos-storm-season` by +1; grant asset `asset.aurelia-food-buffer` (Aurelia Food Buffer); reveal `fact.aurelia-imports-moisture`
#### aurelia-transparent-rationing

Aurelia accepts a smaller harvest under public rationing and a negotiated system-wide allocation.

**Persistent effects:** adjust `distribution-equity` by +1; adjust `public-legitimacy` by +1; adjust `lattice-integrity` by +0; adjust `clock.aurelia-crop-window` by -1; grant asset `asset.aurelia-seed-network` (Aurelia Seed Network); reveal `fact.aurelia-imports-moisture`
#### aurelia-experimental-cycle

The Eudora Vale and local engineers save key crops through a temporary closed cycle, damaging equipment and consuming fabrication capacity.

**Persistent effects:** adjust `resource-reserves` by -2; adjust `crew-command-confidence` by +1; adjust `starfleet-scrutiny` by +1; set `deflector-recalibration-delayed` to `True`; grant asset `asset.aurelia-climate-prototype` (Aurelia Climate Prototype); reveal `fact.aurelia-imports-moisture`
#### aurelia-harvest-loss

The immediate intervention cannot preserve the full harvest, but lives and long-term infrastructure are protected.

**Persistent effects:** adjust `public-legitimacy` by -1; adjust `resource-reserves` by +1; adjust `clock.aurelia-crop-window` by +2; add `food-shortfall` to `aurelia`; reveal `fact.aurelia-imports-moisture`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Weight of Water

- **ID:** `chapter-2-the-weight-of-water`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Pelagos, Caldera Array, Crown Station
- **Actors:** Councillor Rian Oso, Haro ch'Veth, Jaya Kel, Ila Tovan, Minister Talia Iven
- **Factions:** Pelagic Council, Ilyra Accord Secretariat, Starfleet Ilyra Review Mission
- **Mission graph:** `mission-graphs/chapter-2-the-weight-of-water.mission-graph.json`
- **Delegation:** Not allowed as a whole. The export precedent and population recognition require direct command responsibility.
- **Calm content:** No

### Player-safe premise

Pelagos suffers rapid sea-level oscillation around the Caldera Array as export demands continue to use an obsolete census. Floating communities omitted from the official model are now inside the projected storm-surge zone.

### Director purpose

This quest establishes Pelagos as both donor and vulnerable society. The census discrepancy is not a clerical twist; it reflects mobile communities repeatedly excluded from fixed-world representation. Water sovereignty can become an asset or a wedge.

### Dramatic question

> Who counts when a system calculates how much a world can safely give away?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "prelude-the-captains-chair"
    }
  ]
}
```

### Objectives

- Protect the Caldera Array and floating communities from rapid sea-level change.
- Verify the actual Pelagic population and water buffer.
- Determine whether and how to throttle water exports.
- Preserve enough transfer capacity to prevent immediate failure elsewhere.
- Set a precedent for mobile communities in the allocation model.

### Pressures

- Storm lanes narrow faster than evacuation traffic can clear.
- Aurelia and Ferrum are already drawing on Pelagic exports.
- Correcting the census immediately changes legal representation as well as engineering limits.
- The Caldera Array can be saved by measures that damage deep-water ecosystems.

### Revelations and clue resilience

- **revelation.pelagos-census:** The official population record omits large mobile and seasonal communities. Required: True. Alternate routes allowed: True.
- **revelation.water-buffer:** Pelagos has less safe export capacity than Crown Station reports. Required: True. Alternate routes allowed: True.
- **revelation.array-code:** Caldera control software still applies population assumptions from the original Accord era. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Suspend exports and prioritize Pelagic lives and infrastructure.
- Maintain reduced exports while evacuating omitted communities.
- Correct the census and renegotiate quotas in real time.
- Use the Eudora Vale to stabilize the Array while preserving its ecosystem.
- Delegate local traffic and rescue to Pelagic flotillas under clear command intent.

### Outcome families

#### pelagos-sovereign-pause

Pelagos suspends exports long enough to protect communities and rebuild its buffer, forcing shortages elsewhere.

**Persistent effects:** adjust `distribution-equity` by +1; adjust `public-legitimacy` by +1; adjust `lattice-integrity` by -1; adjust `clock.aurelia-crop-window` by +1; adjust `clock.ferrum-heat-reserve` by +1; grant asset `asset.pelagic-water-buffer` (Pelagic Water Buffer); reveal `fact.pelagos-census-understates-population`
#### pelagos-corrected-share

The census is corrected and a reduced export formula is accepted through a public emergency agreement.

**Persistent effects:** adjust `distribution-equity` by +2; adjust `public-legitimacy` by +2; adjust `lattice-integrity` by +0; grant asset `asset.pelagic-water-buffer` (Pelagic Water Buffer); reveal `fact.pelagos-census-understates-population`
#### pelagos-export-maintained

Exports continue while Starfleet and local flotillas evacuate communities, preserving system continuity at significant local cost.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `distribution-equity` by -1; adjust `resource-reserves` by -1; adjust `clock.pelagos-storm-season` by +1; add `displaced-flotillas` to `pelagos`; reveal `fact.pelagos-census-understates-population`
#### pelagos-array-damaged

The Caldera Array survives only partially; the immediate rescue succeeds, but export capacity and ecosystems remain damaged.

**Persistent effects:** adjust `lattice-integrity` by -1; adjust `ecological-continuity` by -1; adjust `resource-reserves` by -1; adjust `clock.pelagos-storm-season` by +2; add `array-damage` to `caldera-array`; reveal `fact.pelagos-census-understates-population`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Borrowed Breath

- **ID:** `chapter-3-borrowed-breath`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Ferrum, Khepri City, Harmonic Spindle
- **Actors:** Foreperson Dela Marr, Convenor Kesh Var, Milo Fenn, Asha Ren, Ila Tovan
- **Factions:** Ferrum Combine, Lattice Engineers' Union, Ilyra Accord Secretariat
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The allocation and labor-authority precedent require the captain.
- **Calm content:** No

### Player-safe premise

A heat-exchange failure at Khepri City forces Ferrum to choose between residential life support and fabrication lines needed across the system. Worker councils refuse to let Crown Station make the choice through an automated priority table.

### Director purpose

Ferrum should feel neither selfish nor reducible to a factory. The quest reveals its existential dependence, industrial leverage, and labor governance. The player can earn fabrication support only by treating workers as political partners.

### Dramatic question

> When survival and production share the same heat loop, who has authority to decide which one counts as essential?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "prelude-the-captains-chair"
    }
  ]
}
```

### Objectives

- Prevent fatal heat and oxygen loss in Khepri City.
- Preserve or consciously suspend critical fabrication lines.
- Negotiate with worker councils over emergency authority and production priorities.
- Determine how Ferrum's dependency is represented in the regional model.
- Secure a sustainable repair path rather than one more temporary heat draw.

### Pressures

- Residential and industrial sectors share thermal infrastructure.
- A production stoppage delays every large processor proposal.
- Secretariat emergency orders treat the Combine as a contractor rather than a government.
- Cold injuries and oxygen debt rise while negotiations continue.

### Revelations and clue resilience

- **revelation.ferrum-dependence:** Ferrum cannot remain broadly habitable without imported heat and oxygen. Required: True. Alternate routes allowed: True.
- **revelation.ferrum-leverage:** Ferrum can fabricate most large replacement components if workers control a credible schedule. Required: True. Alternate routes allowed: True.
- **revelation.original-threat:** Historical labor records reference an early threat to withdraw from the Accord during a proposed burden rotation. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Prioritize habitats and suspend fabrication.
- Preserve minimum residential life support while maintaining selected processor lines.
- Negotiate worker control of the emergency schedule.
- Import temporary heat through the Eudora Vale or another world at material cost.
- Use local microgrids and evacuate the most vulnerable sectors.

### Outcome families

#### ferrum-worker-partnership

The Combine receives real control over priorities, preserves life support, and commits protected fabrication capacity.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `crew-command-confidence` by +1; adjust `resource-reserves` by +1; grant asset `asset.ferrum-fabrication` (Ferrum Fabrication Teams); reveal `fact.ferrum-depends-on-imported-heat`
#### ferrum-habitat-priority

Residential life support is protected while fabrication shuts down, saving lives but delaying system alternatives.

**Persistent effects:** adjust `distribution-equity` by +1; adjust `resource-reserves` by -1; adjust `clock.union-strike` by -1; add `fabrication-backlog` to `ferrum`; reveal `fact.ferrum-depends-on-imported-heat`
#### ferrum-production-priority

Critical production continues, but residential sectors carry severe rationing and political anger.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `distribution-equity` by -1; adjust `public-legitimacy` by -1; adjust `clock.ferrum-heat-reserve` by +1; grant asset `asset.ferrum-fabrication` (Ferrum Fabrication Teams); reveal `fact.ferrum-depends-on-imported-heat`
#### ferrum-cold-sector

A city sector is evacuated after heat loss; the Combine remains operational but distrustful.

**Persistent effects:** adjust `resource-reserves` by -1; adjust `public-legitimacy` by -1; adjust `clock.ferrum-heat-reserve` by +2; add `cold-sector-evacuation` to `khepri-city`; reveal `fact.ferrum-depends-on-imported-heat`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Green Lung

- **ID:** `chapter-4-the-green-lung`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Viridia, Oros Valley Reserve, Harmonic Spindle
- **Actors:** Ecologist Sorel Thann, Haro ch'Veth, Ila Tovan, Milo Fenn
- **Factions:** Viridian Conservancy, Ilyra Accord Secretariat, Lattice Engineers' Union
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The ecological allocation decision cannot be reduced to a delegated technical task.
- **Calm content:** No

### Player-safe premise

A delayed chemical pulse reaches Viridia and begins altering the Oros Valley reserve. The Conservancy asks Starfleet to quarantine the valley from lattice processing, while Crown Station warns that the unprocessed compounds must be sent somewhere else.

### Director purpose

This quest establishes ecology as a full ending axis. It should make clear that equal mass does not produce equal harm, and that Viridian resistance can be principled without being consequence-free.

### Dramatic question

> Can a living world be treated as infrastructure without reducing it to a consumable machine?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "prelude-the-captains-chair"
    }
  ]
}
```

### Objectives

- Measure and contain the chemical pulse before it crosses ecological thresholds.
- Protect researchers, settlements, and critical species corridors.
- Decide whether to quarantine Oros Valley from lattice processing.
- Account for the destination of any displaced chemical load.
- Establish a credible ecological baseline for future allocations.

### Pressures

- Biological effects may become irreversible before political authorization arrives.
- Quarantining the reserve moves chemical load toward Nacre or orbital storage.
- Industrial bioprocessing can save capacity by simplifying the ecosystem.
- A radical minority may damage equipment it believes will industrialize Viridia.

### Revelations and clue resilience

- **revelation.viridia-scrubber:** Viridia's biosphere processes compounds exported by every other world. Required: True. Alternate routes allowed: True.
- **revelation.ecological-threshold:** Oros Valley is close to a non-linear ecological threshold that tonnage-based models do not represent. Required: True. Alternate routes allowed: True.
- **revelation.equal-load-not-equal-harm:** The same chemical mass produces radically different long-term harm across locations. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Quarantine Oros Valley and shift load to temporary orbital storage.
- Use controlled industrial bioprocessing outside the reserve.
- Reduce system demand enough to avoid sending the full pulse anywhere.
- Allow limited ecological damage to preserve immediate system stability.
- Combine Viridian catalysts with shipboard or Umbra processing.

### Outcome families

#### viridia-protected-reserve

Oros Valley is quarantined and its baseline preserved, while other locations absorb temporary pressure.

**Persistent effects:** adjust `ecological-continuity` by +2; adjust `distribution-equity` by +1; adjust `lattice-integrity` by -1; adjust `clock.next-surge` by +1; grant asset `asset.viridian-catalysts` (Viridian Catalysts); reveal `fact.viridia-is-biological-scrubber`
#### viridia-controlled-processing

A controlled industrial zone processes the pulse while preserving the core reserve, creating a workable but contested compromise.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `ecological-continuity` by +0; adjust `resource-reserves` by -1; grant asset `asset.viridian-catalysts` (Viridian Catalysts); reveal `fact.viridia-is-biological-scrubber`
#### viridia-sacrificed-capacity

Viridia absorbs the pulse through expanded processing, preventing immediate system instability while causing visible ecological loss.

**Persistent effects:** adjust `lattice-integrity` by +2; adjust `ecological-continuity` by -2; adjust `distribution-equity` by -1; advance `front.ecological-overshoot` by 1; add `biodiversity-loss` to `viridia`; reveal `fact.viridia-is-biological-scrubber`
#### viridia-pulse-escapes

The pulse is only partly contained; lives are protected, but the ecological baseline and processing capacity deteriorate.

**Persistent effects:** adjust `lattice-integrity` by -1; adjust `ecological-continuity` by -2; adjust `clock.viridia-chemical-pulse` by +2; add `chemical-contamination` to `oros-valley`; reveal `fact.viridia-is-biological-scrubber`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Public Model

- **ID:** `chapter-5-the-public-model`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Crown Station, U.S.S. Eudora Vale
- **Actors:** First Minister Elian Vorr, Rear Admiral Celeste Osei, Haro ch'Veth, Asha Ren, Convenor Kesh Var, Speaker Mara Senn
- **Factions:** Ilyra Accord Secretariat, Starfleet Ilyra Review Mission, Lattice Engineers' Union, Nacre Assembly
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The audit can use delegated technical teams, but evidence custody and disclosure authority require the captain.
- **Calm content:** No

### Player-safe premise

Comparative data from the five worlds no longer matches Crown Station's public allocation model. The Secretariat offers a confidential joint audit, while independent scientists and Nacre delegates demand raw telemetry now.

### Director purpose

Unlock after any three of the four world quests or equivalent evidence. The scene is not one terminal-room reveal; it is a conflict over access, verification, custody, and who may certify the system's truth. Critical evidence has routes through world data, Union records, Rhee, or Umbra.

### Dramatic question

> Who gets to verify a system whose official transparency has become part of the deception?

### Availability

```json
{
  "any": [
    {
      "type": "questCount",
      "statuses": [
        "resolved"
      ],
      "questIds": [
        "chapter-1-bread-and-weather",
        "chapter-2-the-weight-of-water",
        "chapter-3-borrowed-breath",
        "chapter-4-the-green-lung"
      ],
      "operator": "gte",
      "value": 3
    },
    {
      "type": "factCount",
      "tags": [
        "allocation"
      ],
      "operator": "gte",
      "value": 3
    }
  ]
}
```

### Objectives

- Reconcile raw telemetry from at least three independent sources.
- Determine which categories are omitted, merged, or recoded in the public model.
- Establish custody and public access rules for the audit.
- Protect technical personnel from retaliation or coercion.
- Decide whether the audit remains confidential while historical proof is sought.

### Pressures

- Publishing raw data can trigger unilateral allocations before alternatives exist.
- A confidential audit preserves cooperation but repeats the structure of secrecy.
- The Secretariat can restrict Crown systems but cannot erase every local copy.
- Starfleet authority to seize data is legally arguable and politically costly.

### Revelations and clue resilience

- **revelation.omitted-categories:** Public telemetry omits several categories of imported contaminant and delayed ecological burden. Required: True. Alternate routes allowed: True.
- **revelation.nacre-disparity:** The omitted categories are concentrated on Nacre across decades. Required: True. Alternate routes allowed: True.
- **revelation.audit-design:** The omissions reflect deliberate model design rather than one recent failure. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Conduct a joint audit with public observers and local scientists.
- Accept a confidential audit while securing independent copies and a disclosure timetable.
- Use Starfleet emergency authority to copy or seize raw telemetry.
- Allow Nacre or the Union to publish first while Starfleet verifies.
- Reconstruct the missing categories from local world data without Crown cooperation.

### Outcome families

#### public-audit

The comparative audit is public, independently reproducible, and politically destabilizing.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `nacre-secession-pressure` by -1; adjust `starfleet-scrutiny` by +1; advance `front.public-legitimacy` by 1; grant asset `asset.public-telemetry-access` (Public Telemetry Access); reveal `fact.public-model-omits-burden`
#### confidential-audit

The player secures the full discrepancy under a documented confidential process while preparing a transition and disclosure plan.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -1; adjust `starfleet-scrutiny` by -1; set `audit-confidential` to `True`; grant asset `asset.independent-audit-copy` (Independent Audit Copy); reveal `fact.public-model-omits-burden`
#### starfleet-data-seizure

Starfleet obtains the raw model through emergency authority, preserving evidence while damaging local legitimacy.

**Persistent effects:** adjust `public-legitimacy` by -2; adjust `starfleet-scrutiny` by +2; adjust `crew-command-confidence` by +0; advance `front.security-escalation` by 1; grant asset `asset.independent-audit-copy` (Independent Audit Copy); reveal `fact.public-model-omits-burden`
#### distributed-reconstruction

The model is reconstructed from local data without Crown cooperation, proving the disparity but leaving authentication contested.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `resource-reserves` by -1; adjust `nacre-secession-pressure` by +0; grant asset `asset.distributed-model` (Distributed Lattice Model); reveal `fact.public-model-omits-burden`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Twelve Years

- **ID:** `chapter-6-twelve-years`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Umbra Manifold, Nacre, Harmonic Spindle
- **Actors:** Ines Quill, Convenor Kesh Var, Speaker Mara Senn, Milo Fenn, Koris zh'Raal
- **Factions:** Lattice Engineers' Union, Nacre Assembly, Ilyra Accord Secretariat, Accord Security Service
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. Custody and disclosure of foundational evidence require direct command judgment.
- **Calm content:** No

### Player-safe premise

Evidence points to physical archives and obsolete control cores inside Umbra Manifold. Recovering them requires entering corrosive maintenance sections while local technicians, Secretariat security, and Union witnesses dispute custody.

### Director purpose

This quest reveals the original mandatory twelve-year rotation, the first deferral, and the redesign of public categories. It must not be the only evidence route: the Cold Library, Rhee's records, Fenn's certification, and Union testimony can establish portions if Umbra is lost.

### Dramatic question

> What does accountability require when the system's founding promise was not merely broken but edited out of public memory?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-5-the-public-model"
    },
    {
      "type": "factCount",
      "tags": [
        "historical-record"
      ],
      "operator": "gte",
      "value": 2
    },
    {
      "type": "questCount",
      "statuses": [
        "resolved"
      ],
      "questIds": [
        "side-the-cold-library",
        "side-the-engineers-oath",
        "side-rhees-quarters"
      ],
      "operator": "gte",
      "value": 2
    }
  ]
}
```

### Objectives

- Reach and stabilize the sealed Umbra archive sections.
- Recover or authenticate the original Accord allocation and rotation terms.
- Protect technicians, witnesses, and evidence custody.
- Determine what can be preserved if safety requires abandoning hardware or records.
- Establish who receives the archive and how it becomes admissible public evidence.

### Pressures

- Corrosion and toxic storage failures threaten the archive and away team.
- Security personnel carry lawful warrants based on current Accord authority.
- Broadcasting evidence immediately can trigger node seizure before the shutdown model is understood.
- Saving living technicians may require abandoning some physical evidence.

### Revelations and clue resilience

- **revelation.original-rotation:** The original Accord required the environmental sink to rotate after twelve years. Required: True. Alternate routes allowed: True.
- **revelation.rotation-deferred:** The first rotation was delayed after Aurelia crop losses and Ferrum threatened withdrawal. Required: True. Alternate routes allowed: True.
- **revelation.dashboard-redesign:** Public monitoring categories were redesigned so imported burden appeared as Nacre geology. Required: True. Alternate routes allowed: True.
- **revelation.quill-role:** Engineers and auditors signed altered certifications under political and survival pressure. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Recover the full archive with a joint Starfleet-Union-Nacre team.
- Prioritize living personnel and extract a smaller authenticated evidence set.
- Transmit records immediately before local seizure.
- Negotiate a sealed multi-party custody arrangement.
- Use forensic reconstruction if the physical archive is destroyed.

### Outcome families

#### rotation-records-preserved

The original Accord and audit history are preserved under multi-party custody with living witnesses.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `nacre-secession-pressure` by -1; adjust `starfleet-scrutiny` by +1; grant asset `asset.rotation-records` (Original Rotation Records); reveal `fact.original-rotation-was-mandatory`; reveal `fact.public-dashboard-was-redesigned`
#### rotation-records-broadcast

The records are broadcast before a full transition model exists, making the truth impossible to contain and accelerating political action.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `nacre-secession-pressure` by +1; advance `front.public-legitimacy` by 1; adjust `clock.nacre-node-seizure` by +2; grant asset `asset.rotation-records` (Original Rotation Records); reveal `fact.original-rotation-was-mandatory`; reveal `fact.public-dashboard-was-redesigned`
#### rotation-evidence-partial

The away team saves personnel and enough evidence to prove a rotation existed, but names and technical details remain incomplete.

**Persistent effects:** adjust `resource-reserves` by -1; adjust `public-legitimacy` by +0; grant asset `asset.partial-rotation-evidence` (Partial Rotation Evidence); reveal `fact.original-rotation-was-mandatory`
#### umbra-archive-lost

The archive is destroyed or rendered inaccessible, but testimony and copied fragments preserve alternate evidence routes.

**Persistent effects:** adjust `lattice-integrity` by -1; adjust `public-legitimacy` by -1; advance `front.security-escalation` by 1; reveal `fact.archive-loss-does-not-erase-truth`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Daylight Protocol

- **ID:** `chapter-7-the-daylight-protocol`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Crown Station, U.S.S. Eudora Vale, Nacre
- **Actors:** Rear Admiral Celeste Osei, First Minister Elian Vorr, Speaker Mara Senn, Convenor Kesh Var, Asha Ren, Venn Talar
- **Factions:** Starfleet Ilyra Review Mission, Ilyra Accord Secretariat, Nacre Assembly, Lattice Engineers' Union
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. Disclosure timing and Starfleet accountability are captain-level decisions.
- **Calm content:** No

### Player-safe premise

With enough evidence to establish the hidden burden, Starfleet asks the player to delay full disclosure until a transition plan exists. Nacre, the Union, and independent world governments are already preparing their own releases.

### Director purpose

This is a command and public-legitimacy quest, not a binary publish/suppress choice. The player can sequence disclosure, share custody, set a timetable, protect vulnerable infrastructure, or let local institutions lead. Every route should clearly state foreseeable risks.

### Dramatic question

> Can truth be staged without becoming another form of control?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-6-twelve-years"
    },
    {
      "type": "factCount",
      "tags": [
        "missing-rotation"
      ],
      "operator": "gte",
      "value": 3
    }
  ]
}
```

### Objectives

- Assess immediate infrastructure, health, and public-order risks of disclosure.
- Determine who controls the evidence and who speaks first.
- Set or reject a disclosure timetable and transition safeguards.
- Protect independent witnesses and technical access.
- Issue a defensible Starfleet command decision to Osei and the system.

### Pressures

- Nacre organizers believe delay proves Starfleet has joined the concealment.
- Immediate disclosure may trigger unilateral load changes and panic buying.
- Osei can impose reporting requirements or send a replacement captain if the player acts without documentation.
- Vorr offers access and cooperation in exchange for a short delay.

### Revelations and clue resilience

- **revelation.shutdown-danger:** Immediate lattice shutdown would cause severe harm on every world, including Nacre. Required: True. Alternate routes allowed: True.
- **revelation.rhee-delay:** Rhee previously accepted delayed review in exchange for Nacre medical access. Required: False. Alternate routes allowed: True.
- **revelation.no-clean-disclosure:** No disclosure sequence prevents all panic, coercion, or infrastructure risk. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Publish the complete evidence immediately with a Starfleet technical warning.
- Set a short public timetable tied to emergency safeguards and independent oversight.
- Share the evidence with all world governments and the Union before a joint release.
- Refuse Starfleet control and let Nacre or the Union publish under their own authority.
- Maintain temporary confidentiality while building redundancy, accepting the legitimacy cost.

### Outcome families

#### daylight-immediate

The evidence is released immediately and broadly, maximizing public knowledge while accelerating political and operational reaction.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `starfleet-scrutiny` by +2; adjust `nacre-secession-pressure` by -1; adjust `clock.nacre-node-seizure` by +1; advance `front.public-legitimacy` by 1; set `disclosure-regime` to `immediate-public`; reveal `fact.immediate-shutdown-is-lethal`
#### daylight-staged

A binding short timetable, independent custody, and public transition plan create a staged disclosure with visible safeguards.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `lattice-integrity` by +1; adjust `starfleet-scrutiny` by +0; adjust `clock.nacre-node-seizure` by -1; grant asset `asset.disclosure-compact` (Disclosure Compact); set `disclosure-regime` to `staged-public`; reveal `fact.immediate-shutdown-is-lethal`
#### daylight-local-led

Nacre, the Union, or a coalition of worlds controls the release while Starfleet provides technical verification and safety support.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `nacre-secession-pressure` by -2; adjust `starfleet-scrutiny` by +1; set `disclosure-regime` to `local-led`; grant asset `asset.local-truth-coalition` (Local Truth Coalition); reveal `fact.immediate-shutdown-is-lethal`
#### daylight-delayed

Disclosure is delayed while redundancy is built, preserving near-term control at a significant legitimacy and secession cost.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -2; adjust `nacre-secession-pressure` by +2; adjust `starfleet-scrutiny` by -1; adjust `clock.nacre-node-seizure` by +2; set `disclosure-regime` to `delayed`; reveal `fact.immediate-shutdown-is-lethal`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Rain Country

- **ID:** `chapter-8-rain-country`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Nacre, Umbra Manifold, U.S.S. Eudora Vale
- **Actors:** Speaker Mara Senn, Doctor Lyra Veen, Avar Jess, Ila Tovan, Milo Fenn, Asha Ren
- **Factions:** Nacre Assembly, Unburdened Network, Lattice Engineers' Union, Starfleet Ilyra Review Mission
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The first formal relationship with Nacre and emergency resource tradeoff require the captain.
- **Calm content:** No

### Player-safe premise

A corrosive storm exceeds the shield margins of a Nacre city while hospitals report a surge in chronic exposure cases. The Nacre Assembly will cooperate with Starfleet relief only if the mission treats local records and maintenance crews as authorities rather than evidence sources to be extracted.

### Director purpose

This quest turns Nacre into a full recurring hub and grounds the hidden burden in ordinary life. It should offer rescue, medicine, engineering, diplomacy, and crew interaction without making the world only a site of suffering.

### Dramatic question

> What does recognition look like before a treaty exists, when local competence is already keeping people alive?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-5-the-public-model"
    },
    {
      "type": "trackThreshold",
      "trackId": "nacre-secession-pressure",
      "operator": "gte",
      "value": 7
    },
    {
      "type": "questResolved",
      "questId": "chapter-7-the-daylight-protocol"
    }
  ]
}
```

### Objectives

- Protect the sealed city and maintain shield coverage through the corrosive storm.
- Expand medical care without seizing patient records or overriding consent.
- Establish direct working authority with Nacre maintenance crews and the Assembly.
- Identify which imported loads are driving the current storm chemistry.
- Create a sustainable return route for future Nacre assignments.

### Pressures

- Shield emitters and medical fabrication require the same limited feedstock.
- Patients fear their records will be used to justify evacuation or political claims without consent.
- Direct-action organizers distrust Starfleet security teams near local nodes.
- The storm is partly the delayed consequence of earlier allocations.

### Revelations and clue resilience

- **revelation.nacre-health-pattern:** Nacre's chronic illness patterns follow imported contaminant categories rather than local geology. Required: True. Alternate routes allowed: True.
- **revelation.nacre-maintenance:** Nacre nodekeepers have kept system-critical processes operating with incomplete support for decades. Required: True. Alternate routes allowed: True.
- **revelation.registry-gaps:** The official medical registry substantially understates long-term harm. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Fabricate shield components and defer other system repairs.
- Use ship systems to reinforce the city while local crews perform structural work.
- Prioritize hospital capacity and evacuate the most vulnerable blocks.
- Negotiate patient-controlled registry sharing and direct Assembly coordination.
- Redirect storm chemistry through Umbra or the Spindle with consequences elsewhere.

### Outcome families

#### nacre-partnership

Starfleet relief is conducted under a formal partnership with the Assembly, local nodekeepers, and patient-controlled data safeguards.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `nacre-secession-pressure` by -2; adjust `distribution-equity` by +1; grant asset `asset.nacre-maintenance-codes` (Nacre Maintenance Codes); grant asset `asset.nacre-medical-registry` (Nacre Medical Registry); reveal `fact.nacre-harm-follows-imported-load`
#### nacre-emergency-relief

The immediate city crisis is contained through Starfleet resources, but political and data arrangements remain unresolved.

**Persistent effects:** adjust `resource-reserves` by -2; adjust `nacre-secession-pressure` by +0; adjust `crew-command-confidence` by +1; grant asset `asset.nacre-shield-network` (Nacre Shield Network); reveal `fact.nacre-harm-follows-imported-load`
#### nacre-data-seized

Starfleet or the Secretariat gains access to medical and maintenance data without durable consent, improving the system model while deepening distrust.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -2; adjust `nacre-secession-pressure` by +2; advance `front.security-escalation` by 1; reveal `fact.nacre-harm-follows-imported-load`
#### nacre-city-evacuated

The city cannot be held; evacuation saves many lives but turns a temporary emergency into a visible displacement crisis.

**Persistent effects:** adjust `resource-reserves` by -2; adjust `nacre-secession-pressure` by +1; add `city-evacuation` to `nacre`; reveal `fact.nacre-harm-follows-imported-load`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Fifth Share

- **ID:** `chapter-9-the-fifth-share`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Nacre, Harmonic Spindle, Crown Station
- **Actors:** Speaker Mara Senn, Avar Jess, Director Cael Orin, Convenor Kesh Var, Koris zh'Raal, Rear Admiral Celeste Osei
- **Factions:** Nacre Assembly, Unburdened Network, Accord Security Service, Ilyra Accord Secretariat, Starfleet Ilyra Review Mission
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. Political recognition, rules of engagement, and use of Starfleet force require the captain.
- **Calm content:** No

### Player-safe premise

Nacre nodekeepers seize local control of a lattice junction but continue essential operations. The Secretariat calls it sabotage, the Assembly calls it emergency self-government, and the player must decide what authority Starfleet recognizes while the node remains indispensable.

### Director purpose

The seized node is not a hostage device. The occupiers are competent and preserve life support. The conflict is about lawful control, practical legitimacy, and whether Starfleet treats Nacre as a coequal government before a final charter exists.

### Dramatic question

> When existing law rests on concealed sacrifice, what makes emergency authority legitimate?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "chapter-8-rain-country"
    }
  ]
}
```

### Objectives

- Prevent interruption of essential lattice functions at the seized node.
- Establish the occupiers' command structure, intentions, and technical competence.
- Set Starfleet rules of engagement and access boundaries.
- Determine whether to recognize the Nacre Assembly as a coequal system authority.
- Create a route for appeal, oversight, and future shared control.

### Pressures

- Accord Security holds warrants and requests Starfleet tactical support.
- The nodekeepers can cut imports but cannot model every downstream effect.
- Nacre crowds gather around access routes, making forced entry dangerous.
- Recognition before a charter may be treated as unilateral Federation intervention.

### Revelations and clue resilience

- **revelation.nodekeepers-preserve-service:** The occupiers are maintaining essential service and preventing reckless shutdown. Required: True. Alternate routes allowed: True.
- **revelation.incomplete-shutdown-model:** The direct-action network does not possess the complete system shutdown model. Required: True. Alternate routes allowed: True.
- **revelation.security-warrant-scope:** The Security Service warrant authorizes restoration of control but not collective punishment or indefinite detention. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Recognize the Assembly as coequal for interim lattice decisions.
- Grant limited operational authority without political recognition.
- Negotiate a joint control room with Union and multiworld observers.
- Support restoration of Secretariat control under strict force limits.
- Secure the node as neutral infrastructure under temporary Starfleet protection.

### Outcome families

#### nacre-coequal-recognition

Starfleet recognizes the Assembly as a coequal interim authority and converts the occupation into supervised shared control.

**Persistent effects:** adjust `distribution-equity` by +2; adjust `public-legitimacy` by +2; adjust `nacre-secession-pressure` by -2; adjust `starfleet-scrutiny` by +2; grant asset `asset.nacre-coequal-authority` (Nacre Coequal Authority); set `nacre-authority-status` to `coequal`
#### nacre-operational-autonomy

The nodekeepers receive protected operational control and oversight without full political recognition.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `nacre-secession-pressure` by -1; adjust `public-legitimacy` by +0; grant asset `asset.nacre-maintenance-codes` (Nacre Maintenance Codes); set `nacre-authority-status` to `operational-autonomy`
#### joint-node-council

A joint Union-Nacre-Accord control group replaces unilateral control, creating a prototype for successor governance.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `lattice-integrity` by +1; adjust `nacre-secession-pressure` by -1; grant asset `asset.joint-node-council` (Joint Node Council); set `nacre-authority-status` to `joint-control`
#### secretariat-control-restored

The occupation ends and Secretariat control is restored, preserving formal continuity while deepening the legitimacy crisis.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -2; adjust `nacre-secession-pressure` by +2; advance `front.security-escalation` by 1; set `nacre-authority-status` to `denied`
#### node-violence

Violence or a forced shutdown damages the node and hardens political positions, but the campaign continues through repair and parallel authority.

**Persistent effects:** adjust `lattice-integrity` by -2; adjust `public-legitimacy` by -2; adjust `nacre-secession-pressure` by +2; advance `front.security-escalation` by 2; add `seizure-damage` to `harmonic-spindle`; set `nacre-authority-status` to `violent-rupture`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Many Hands

- **ID:** `chapter-10-many-hands`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Crown Station, Harmonic Spindle, Viridia, Nacre
- **Actors:** Director Cael Orin, Avar Jess, Ecologist Sorel Thann, Convenor Kesh Var, Koris zh'Raal, Asha Ren
- **Factions:** Accord Security Service, Unburdened Network, Viridian Conservancy, Lattice Engineers' Union
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The investigation may be distributed, but the public accountability policy and security boundaries require direct command.
- **Calm content:** No

### Player-safe premise

Several damaging incidents occur across the system: a Nacre relay is sabotaged, a Security convoy is attacked, a Viridian industrial test fails, and an old Spindle component ruptures. Each faction presents a single explanation that serves its immediate interests.

### Director purpose

This quest prevents the campaign from collapsing into a mastermind plot. At least four causal chains exist: a direct-action relay attack, a Security false flag, Viridian sabotage of an industrial proposal, and genuine material failure. The player may prove some but not all.

### Dramatic question

> Can justice remain specific when every institution benefits from calling all damage the work of one enemy?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-9-the-fifth-share"
    },
    {
      "type": "frontStage",
      "frontId": "front.security-escalation",
      "operator": "gte",
      "value": 2
    }
  ]
}
```

### Objectives

- Stabilize active damage before assigning blame.
- Preserve separate evidence chains for each incident.
- Distinguish deliberate sabotage, false attribution, reckless direct action, and ordinary failure.
- Protect witnesses and technical investigators from faction pressure.
- Set a public accountability policy that does not erase political context.

### Pressures

- Local governments demand immediate attribution before evidence is complete.
- Some perpetrators are also essential technicians or legitimate public officials.
- A broad security crackdown may prevent one attack while causing several others.
- The Security false flag is protected by compartmented records and lawful-seeming orders.

### Revelations and clue resilience

- **revelation.multiple-authors:** The incidents have multiple unrelated and partially related causes. Required: True. Alternate routes allowed: True.
- **revelation.security-false-flag:** A small Accord Security cell staged one attack to justify emergency node authority. Required: False. Alternate routes allowed: True.
- **revelation.viridian-sabotage:** Viridian radicals damaged an industrial test they believed would permanently simplify the biosphere. Required: False. Alternate routes allowed: True.
- **revelation.material-failure:** At least one major failure is ordinary aging infrastructure rather than sabotage. Required: True. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Publish differentiated findings and prosecute specific acts under appropriate law.
- Offer conditional amnesty in exchange for evidence, repair, and disarmament.
- Use one emergency security framework for all incidents.
- Expose the false flag while allowing local institutions to handle other cases.
- Prioritize repair and defer prosecution under preserved evidence.

### Outcome families

#### many-hands-specific-accountability

The investigation publishes differentiated causes and builds a credible, specific accountability record.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `starfleet-scrutiny` by +1; set `front.security-escalation` to stage 1; grant asset `asset.sabotage-evidence-ledger` (Sabotage Evidence Ledger); reveal `fact.sabotage-has-multiple-authors`; reveal `fact.security-staged-false-flag`
#### many-hands-restorative-amnesty

Repair, testimony, and disarmament are exchanged for limited amnesty, reducing immediate violence while leaving some demands for punishment unresolved.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `lattice-integrity` by +1; adjust `nacre-secession-pressure` by -1; grant asset `asset.cross-faction-repair-teams` (Cross-Faction Repair Teams); reveal `fact.sabotage-has-multiple-authors`
#### many-hands-security-framework

A broad emergency framework suppresses several threats but legitimizes collective security control.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -2; adjust `nacre-secession-pressure` by +1; advance `front.security-escalation` by 1; set `security-regime` to `broad-emergency`; reveal `fact.sabotage-has-multiple-authors`
#### many-hands-inconclusive

The active damage is repaired but attribution remains incomplete, allowing factions to preserve competing narratives.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by -1; adjust `clock.union-strike` by +1; reveal `fact.material-failure-is-real`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Terms of Survival

- **ID:** `chapter-11-terms-of-survival`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 2-3 sessions
- **Locations:** Crown Station, Harmonic Spindle, U.S.S. Eudora Vale
- **Actors:** Speaker Mara Senn, First Minister Elian Vorr, Convenor Kesh Var, Councillor Rian Oso, Foreperson Dela Marr, Ecologist Sorel Thann, Rear Admiral Celeste Osei
- **Factions:** Ilyra Accord Secretariat, Nacre Assembly, Lattice Engineers' Union, Pelagic Council, Ferrum Combine, Viridian Conservancy
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The interim decision rule defines captain-level authority and cannot be delegated as a technical recommendation.
- **Calm content:** No

### Player-safe premise

The system needs an interim allocation regime before permanent replacements can be built. Every credible plan requires visible sacrifices: rotating limited burdens, system-wide consumption cuts, controlled damage elsewhere, migration, or temporary technical control.

### Director purpose

This is a portfolio-design quest rather than a single summit. The player should visit or communicate with multiple worlds, combine assets, and state a clear decision rule for future emergencies. A technically good plan without consent remains fragile; a fair plan without capacity may fail.

### Dramatic question

> What temporary inequality can be justified when the alternative is immediate collapse, and who gets to define temporary?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "chapter-7-the-daylight-protocol"
    },
    {
      "type": "questResolved",
      "questId": "chapter-9-the-fifth-share"
    }
  ]
}
```

### Objectives

- Build at least two technically viable interim allocation models.
- Secure participation or document refusal from each world authority.
- Define caps, review intervals, exit mechanisms, and emergency override rules.
- Account for population health and ecological thresholds, not only system tonnage.
- Commit an interim regime that the Director can apply to later world reactions.

### Pressures

- Every world can identify a plausible reason it cannot carry more burden now.
- The next major surge may occur before full consent is reached.
- A rotation that is formally equal may be medically or ecologically unequal.
- Consumption cuts fall unevenly across food, housing, industry, and health.

### Revelations and clue resilience

- **revelation.no-instant-perfect-plan:** No available interim regime can eliminate all unequal burden before redundancy exists. Required: True. Alternate routes allowed: True.
- **revelation.caps-matter:** Time limits, health caps, public telemetry, and exit mechanisms materially change whether unequal terms remain legitimate. Required: True. Alternate routes allowed: True.
- **revelation.local-veto-risk:** Uncoordinated local vetoes can recreate collapse through cumulative refusal. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Adopt capped rotating burdens with public health and ecological limits.
- Impose system-wide austerity and reduce total lattice demand.
- Use technical optimization under local veto and public telemetry.
- Decentralize quotas and accept slower, less efficient cooperation.
- Combine migration, orbital processing, and temporary controlled harm.

### Outcome families

#### interim-capped-rotation

A capped, time-limited rotation distributes temporary burden under public health and ecological safeguards.

**Persistent effects:** adjust `distribution-equity` by +2; adjust `public-legitimacy` by +1; adjust `lattice-integrity` by +0; grant asset `asset.interim-allocation-regime` (Capped Rotation Regime); set `interim-allocation-regime` to `capped-rotation`
#### interim-system-austerity

All worlds reduce demand through rationing, production cuts, and climate concessions, preserving equity at economic and political cost.

**Persistent effects:** adjust `distribution-equity` by +2; adjust `lattice-integrity` by +1; adjust `resource-reserves` by -1; adjust `public-legitimacy` by +0; grant asset `asset.interim-allocation-regime` (System Austerity Regime); set `interim-allocation-regime` to `system-austerity`
#### interim-technical-control

A technically optimized allocation is placed under Crown or Starfleet control with limited local veto, improving stability but weakening legitimacy.

**Persistent effects:** adjust `lattice-integrity` by +2; adjust `distribution-equity` by +0; adjust `public-legitimacy` by -2; adjust `starfleet-scrutiny` by +1; grant asset `asset.interim-allocation-regime` (Technical Control Regime); set `interim-allocation-regime` to `technical-control`
#### interim-decentralized-quotas

Worlds accept local quotas and mutual notification without a strong center, increasing autonomy and coordination burden.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `distribution-equity` by +1; adjust `lattice-integrity` by -1; grant asset `asset.interim-allocation-regime` (Decentralized Quota Compact); set `interim-allocation-regime` to `decentralized-quotas`
#### interim-no-agreement

No binding interim regime exists; local arrangements and emergency orders continue while the next surge approaches.

**Persistent effects:** adjust `public-legitimacy` by -1; adjust `lattice-integrity` by -1; adjust `clock.next-surge` by +2; advance `front.nacre-secession` by 1; set `interim-allocation-regime` to `none`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Closed Cycle

- **ID:** `chapter-12-closed-cycle`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 2-3 sessions
- **Locations:** Umbra Manifold, Harmonic Spindle, Ferrum, Viridia, Pelagos
- **Actors:** Milo Fenn, Convenor Kesh Var, Alix Meral, Foreperson Dela Marr, Ecologist Sorel Thann, Councillor Rian Oso, Speaker Mara Senn
- **Factions:** Lattice Engineers' Union, Helioform Consortium, Ferrum Combine, Viridian Conservancy, Pelagic Council, Nacre Assembly
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. Subtasks can be delegated, but architecture, ownership, and ship-risk decisions require the captain.
- **Calm content:** No

### Player-safe premise

Umbra Manifold and the Harmonic Spindle can support a redundant orbital processing network, but only if enough fabrication, catalysts, water buffers, maintenance access, and command coordination have been earned. Helioform offers a faster proprietary alternative.

### Director purpose

This quest reads campaign assets rather than assuming them. Missing assets do not block play; they change scale, risk, cost, and who controls the resulting infrastructure. The player can build a public network, lease a private one, construct partial redundancy, or abandon the attempt.

### Dramatic question

> Can infrastructure become common property before the crisis forces someone else to own it?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "chapter-11-terms-of-survival"
    }
  ]
}
```

### Objectives

- Select a processor architecture and ownership model.
- Assemble fabrication, biological, water, and maintenance inputs.
- Stabilize Umbra and Spindle integration without creating a new uncontrolled load.
- Set telemetry, maintenance, and emergency-access rules.
- Test the network under a real or simulated surge.

### Pressures

- The Eudora Vale cannot fabricate the network alone.
- Helioform can shorten the timeline in exchange for proprietary control.
- An incomplete network may shift rather than eliminate burden.
- High-power synchronization risks the already damaged main deflector.

### Revelations and clue resilience

- **revelation.closed-cycle-possible:** A genuine closed-cycle reduction is technically possible at limited scale using Umbra and Spindle infrastructure. Required: True. Alternate routes allowed: True.
- **revelation.network-needs-local-assets:** No Starfleet-only build can reach useful scale before the next cascade. Required: True. Alternate routes allowed: True.
- **revelation.helioform-control:** Helioform's rapid system would create proprietary control over telemetry and maintenance. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Build a cooperative public network from earned local assets.
- Lease Helioform processors under negotiated safeguards.
- Construct partial redundancy targeted at the most dangerous loads.
- Use the Eudora Vale deflector as a temporary active processor despite damage risk.
- Abandon the network and invest remaining resources in evacuation and local systems.

### Outcome families

#### closed-cycle-public-network

A multiworld public processor network reaches operational status under shared maintenance and telemetry rules.

**Persistent effects:** adjust `lattice-integrity` by +3; adjust `distribution-equity` by +2; adjust `resource-reserves` by -2; adjust `ecological-continuity` by +1; grant asset `asset.redundant-orbital-processors` (Redundant Orbital Processors); set `closed-cycle-status` to `public-operational`
#### closed-cycle-helioform-lease

Helioform deploys a capable network under a negotiated but still proprietary contract.

**Persistent effects:** adjust `lattice-integrity` by +3; adjust `resource-reserves` by +0; adjust `public-legitimacy` by -1; grant asset `asset.redundant-orbital-processors` (Leased Orbital Processors); set `closed-cycle-status` to `private-lease`; set `helioform-concession` to `True`
#### closed-cycle-partial-network

A limited network protects one or two high-risk pathways but cannot eliminate the system's unequal burden.

**Persistent effects:** adjust `lattice-integrity` by +2; adjust `distribution-equity` by +1; adjust `resource-reserves` by -1; grant asset `asset.partial-orbital-processors` (Partial Orbital Processors); set `closed-cycle-status` to `partial`
#### closed-cycle-ship-bridge

The Eudora Vale becomes an active temporary processor, buying time at serious risk to the ship and captaincy.

**Persistent effects:** adjust `lattice-integrity` by +2; adjust `crew-command-confidence` by +1; adjust `starfleet-scrutiny` by +2; set `deflector-damage-severe` to `True`; set `closed-cycle-status` to `ship-dependent`; grant asset `asset.deflector-synchronization` (Deflector Synchronization)
#### closed-cycle-abandoned

The processor build is abandoned after losses or political refusal; remaining capacity is redirected toward evacuation and local resilience.

**Persistent effects:** adjust `resource-reserves` by +1; adjust `lattice-integrity` by -1; grant asset `asset.evacuation-reserve` (Evacuation Reserve); set `closed-cycle-status` to `abandoned`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## The Engineers' Line

- **ID:** `chapter-13-the-engineers-line`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 1-2 sessions
- **Locations:** Harmonic Spindle, Ferrum, Crown Station, U.S.S. Eudora Vale
- **Actors:** Convenor Kesh Var, Foreperson Dela Marr, First Minister Elian Vorr, Rear Admiral Celeste Osei, Asha Ren, Milo Fenn
- **Factions:** Lattice Engineers' Union, Ferrum Combine, Ilyra Accord Secretariat, Starfleet Ilyra Review Mission, Accord Security Service
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The labor-authority and emergency-law decision require the captain.
- **Calm content:** No

### Player-safe premise

The Lattice Engineers' Union votes to withhold nonessential work until technicians gain protected authority, honest telemetry, and relief from unsafe orders. Local governments call the action reckless while relying on the same workers to prevent collapse.

### Director purpose

The strike is not a sabotage plot. Minimum life-support work can continue, but coordination and new allocations slow sharply. The player can negotiate governance, requisition labor, support a protected strike, or build an alternate emergency workforce at real cost.

### Dramatic question

> Can essential workers exercise collective power without being told that survival cancels their rights?

### Availability

```json
{
  "any": [
    {
      "type": "questResolved",
      "questId": "chapter-11-terms-of-survival"
    },
    {
      "type": "clockThreshold",
      "clockId": "clock.union-strike",
      "operator": "gte",
      "value": 5
    }
  ]
}
```

### Objectives

- Maintain minimum life-support and surge response during the labor action.
- Establish Union demands, government positions, and legal authority.
- Protect workers from retaliation and populations from abandonment.
- Determine whether technicians receive a formal governance role.
- Restore or replace cross-world technical coordination.

### Pressures

- The next surge can occur during minimum staffing.
- Emergency requisition is legally possible and politically explosive.
- Some local governments plan replacement crews unfamiliar with system interactions.
- Fenn's prior certification becomes relevant to Union trust.

### Revelations and clue resilience

- **revelation.union-crossworld-capacity:** The Union is the only institution able to coordinate practical work across all five worlds without Crown Station. Required: True. Alternate routes allowed: True.
- **revelation.technicians-bore-hidden-decisions:** Technicians have long executed political allocations while being denied formal responsibility or protection. Required: True. Alternate routes allowed: True.
- **revelation.replacement-risk:** Rapid replacement crews would increase node-failure risk despite maintaining formal authority. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Recognize the Union as a formal partner in interim governance.
- Negotiate minimum-safety work while the strike continues.
- Use Starfleet emergency requisition with explicit limits and review.
- Support the strike and redirect the Eudora Vale toward emergency coverage.
- Train replacement teams and accept a slower, riskier system.

### Outcome families

#### union-governance-partner

The Union gains formal authority, protected certification rights, and a seat in successor negotiations.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `lattice-integrity` by +2; adjust `resource-reserves` by +1; grant asset `asset.union-coordination` (Union Coordination Network); set `union-status` to `governance-partner`
#### union-minimum-safety-compact

Minimum life-support work continues while the strike remains politically active and negotiations proceed.

**Persistent effects:** adjust `lattice-integrity` by +1; adjust `public-legitimacy` by +1; adjust `resource-reserves` by +0; grant asset `asset.union-safety-compact` (Minimum-Safety Compact); set `union-status` to `minimum-safety`
#### union-requisitioned

Starfleet or Accord authority compels work under emergency law, preserving short-term capacity while damaging legitimacy and crew confidence.

**Persistent effects:** adjust `lattice-integrity` by +2; adjust `public-legitimacy` by -2; adjust `crew-command-confidence` by -1; adjust `starfleet-scrutiny` by +1; advance `front.engineers-mobilization` by 1; set `union-status` to `requisitioned`
#### union-strike-uncontained

Coordination fragments during the strike; local teams preserve some systems but the network loses shared timing and trust.

**Persistent effects:** adjust `lattice-integrity` by -2; adjust `resource-reserves` by -1; set `front.engineers-mobilization` to stage 5; add `coordination-gap` to `harmonic-spindle`; set `union-status` to `fractured`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Broken Accord

- **ID:** `chapter-14-the-broken-accord`
- **Kind:** main
- **Initial status:** `latent`
- **Typical duration:** 2-3 sessions
- **Locations:** Crown Station, Harmonic Spindle, Ilyra Habitat Six, U.S.S. Eudora Vale
- **Actors:** Rear Admiral Celeste Osei, First Minister Elian Vorr, Speaker Mara Senn, Convenor Kesh Var, Councillor Rian Oso, Foreperson Dela Marr, Ecologist Sorel Thann, Coordinator Nia Tess, Director Cael Orin
- **Factions:** Starfleet Ilyra Review Mission, Ilyra Accord Secretariat, Nacre Assembly, Lattice Engineers' Union, Pelagic Council, Ferrum Combine, Viridian Conservancy, Accord Security Service
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The authority and Starfleet-role decision cannot be delegated.
- **Calm content:** No

### Player-safe premise

World governments threaten secession, the Harmonic Spindle is claimed by rival authorities, and no existing body can issue an allocation order every population accepts as lawful. The player must help create, recognize, impose, or decline a successor authority before the final cascade.

### Director purpose

This is the political convergence, assembled from Nacre standing, disclosure, Union status, world relationships, security posture, and side-quest assets. A summit is one approach, not the required scene. The player may recognize a provisional council, reform the Secretariat, establish temporary Starfleet trusteeship, or manage separation.

### Dramatic question

> What lawful authority can replace an agreement whose legitimacy depended on hiding its cost?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "chapter-11-terms-of-survival"
    },
    {
      "type": "questResolved",
      "questId": "chapter-9-the-fifth-share"
    },
    {
      "any": [
        {
          "type": "questResolved",
          "questId": "chapter-13-the-engineers-line"
        },
        {
          "type": "trackThreshold",
          "trackId": "public-legitimacy",
          "operator": "gte",
          "value": 6
        },
        {
          "type": "frontStage",
          "frontId": "front.lattice-cascade",
          "operator": "gte",
          "value": 4
        }
      ]
    }
  ]
}
```

### Objectives

- Prevent armed control of the Harmonic Spindle from determining political authority.
- Establish representation, voting, emergency powers, and review rules for a successor body or separation process.
- Secure recognition from enough worlds and technical institutions to operate during the finale.
- Define the role and limits of Starfleet power.
- Preserve a workable authority path if negotiations fail.

### Pressures

- Each world can survive the immediate crisis only through some continued cooperation.
- Security forces and direct-action groups are converging on the Spindle.
- Starfleet trusteeship can function quickly but may become occupation in all but name.
- Habitat Six and mobile communities remain outside the original five-world formula.

### Revelations and clue resilience

- **revelation.legitimacy-needs-operation:** A successor authority must control enough technical and logistical capacity to make its decisions real. Required: True. Alternate routes allowed: True.
- **revelation.separation-needs-coordination:** Even sovereign separation requires shared navigation, emergency warning, and decommissioning protocols. Required: True. Alternate routes allowed: True.
- **revelation.security-not-neutral:** Control of the Spindle by force would effectively choose the political outcome. Required: False. Alternate routes allowed: True.

### Example approaches, not a solution menu

- Convene or recognize a provisional multiworld council with Nacre and Union authority.
- Reform the Accord Secretariat under binding safeguards, rotation law, and independent telemetry.
- Establish temporary Starfleet trusteeship limited to infrastructure and navigation.
- Broker an orderly Five Separate Skies framework with shared emergency protocols.
- Prevent violence and allow local actors to negotiate without Starfleet choosing the institution.

### Outcome families

#### successor-provisional-council

A lawful interim council representing all five worlds, the Union, and recognized excluded communities enters the finale.

**Persistent effects:** adjust `public-legitimacy` by +3; adjust `distribution-equity` by +2; adjust `starfleet-scrutiny` by +0; grant asset `asset.lawful-interim-council` (Lawful Interim Council); set `successor-authority` to `provisional-council`
#### successor-reformed-accord

The Accord survives under binding safeguards, independent telemetry, Nacre authority, and enforceable burden limits.

**Persistent effects:** adjust `public-legitimacy` by +2; adjust `lattice-integrity` by +1; adjust `distribution-equity` by +1; grant asset `asset.reformed-accord-authority` (Reformed Accord Authority); set `successor-authority` to `reformed-accord`
#### successor-starfleet-trusteeship

Starfleet assumes time-limited infrastructure and navigation authority, preserving operational command without durable local consent.

**Persistent effects:** adjust `lattice-integrity` by +2; adjust `public-legitimacy` by -2; adjust `starfleet-scrutiny` by +2; grant asset `asset.starfleet-trusteeship` (Starfleet Emergency Trusteeship); set `successor-authority` to `starfleet-trusteeship`
#### successor-five-separate-skies

The worlds agree to dissolve shared political authority while retaining narrow emergency and decommissioning protocols.

**Persistent effects:** adjust `public-legitimacy` by +1; adjust `distribution-equity` by +1; adjust `lattice-integrity` by -1; grant asset `asset.separation-protocols` (Five Separate Skies Protocols); set `successor-authority` to `five-separate-skies`
#### successor-fractured-authority

No lawful successor is established; rival authorities enter the cascade with partial control and competing orders.

**Persistent effects:** adjust `public-legitimacy` by -2; adjust `lattice-integrity` by -1; advance `front.security-escalation` by 1; set `successor-authority` to `fractured`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## A Common Climate

- **ID:** `chapter-15-a-common-climate`
- **Kind:** finale
- **Initial status:** `latent`
- **Typical duration:** 2-4 sessions
- **Locations:** U.S.S. Eudora Vale, Crown Station, Harmonic Spindle, Nacre, Aurelia, Pelagos, Viridia, Ferrum, Umbra Manifold, Ilyra Habitat Six
- **Actors:** Rear Admiral Celeste Osei, First Minister Elian Vorr, Speaker Mara Senn, Convenor Kesh Var, Councillor Rian Oso, Foreperson Dela Marr, Ecologist Sorel Thann, Coordinator Nia Tess, Asha Ren, Haro ch'Veth, Milo Fenn, Ila Tovan, Koris zh'Raal, Jaya Kel
- **Factions:** Starfleet Ilyra Review Mission, Ilyra Accord Secretariat, Nacre Assembly, Lattice Engineers' Union, Pelagic Council, Ferrum Combine, Viridian Conservancy, Accord Security Service, Helioform Consortium
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The finale is distributed through delegation but remains the player captain's command.
- **Calm content:** No

### Player-safe premise

The lattice enters cascade across several locations at once. The Eudora Vale must distribute command, shuttles, technical teams, diplomatic authority, and earned regional assets while the player authorizes a final lattice configuration and decides which harms can still be prevented.

### Director purpose

The finale is assembled from actual state. Select pressures from Nacre toxic rain, Aurelia crop failure, Ferrum freeze, Pelagic storm surge, Viridian die-off, Spindle seizure, orbital collision, ship damage, Union status, and political authority. Do not present every possible crisis if prior play prevented it.

### Dramatic question

> Can the system survive without making one world invisible again?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "chapter-14-the-broken-accord"
    },
    {
      "type": "questResolved",
      "questId": "chapter-11-terms-of-survival"
    },
    {
      "any": [
        {
          "type": "questResolved",
          "questId": "chapter-12-closed-cycle"
        },
        {
          "type": "frontStage",
          "frontId": "front.lattice-cascade",
          "operator": "gte",
          "value": 5
        },
        {
          "type": "clockThreshold",
          "clockId": "clock.next-surge",
          "operator": "gte",
          "value": 8
        }
      ]
    }
  ]
}
```

### Objectives

- Identify the actual cascade fronts created by campaign state.
- Delegate the Eudora Vale, shuttles, crew, and regional assets across simultaneous emergencies.
- Prevent mass casualties and preserve evacuation corridors.
- Authorize a final lattice, processor, decommissioning, or separation configuration.
- Preserve enough lawful authority and technical cooperation to survive the decision.

### Pressures

- Multiple worlds need the same ship systems and specialists at the same time.
- The safest short-term configuration may create permanent ecological or political damage.
- Rival authorities may issue conflicting node orders.
- The Eudora Vale main deflector may be required beyond safe limits.
- Evacuation capacity and world assets reflect prior side work and alliances.

### Revelations and clue resilience

- **revelation.final-state-is-earned:** Available solutions and their costs derive from prior repairs, assets, legitimacy, and unresolved obligations. Required: True. Alternate routes allowed: False.
- **revelation.no-hidden-perfect-ending:** No undiscovered device erases the accumulated political and ecological consequences. Required: True. Alternate routes allowed: False.

### Example approaches, not a solution menu

- Use a public or private closed-cycle network to absorb the worst loads.
- Execute the interim allocation regime under successor authority.
- Decommission or separate portions of the lattice while evacuating vulnerable populations.
- Use the Eudora Vale as a temporary processing and command bridge.
- Delegate regional fronts to earned allies and focus the ship on the highest-leverage failure.
- Choose a controlled unequal stabilization with explicit limits and post-crisis accountability.

### Outcome families

#### ending-a-common-climate

The cascade is contained, Nacre's permanent burden ends, all populations retain viable futures, and a lawful cooperative authority controls redundant infrastructure.

**Persistent effects:** set `campaign-ending-family` to `a-common-climate`; adjust `lattice-integrity` by +3; adjust `distribution-equity` by +3; adjust `public-legitimacy` by +2; adjust `ecological-continuity` by +1
#### ending-reformed-accord

The system survives under a legitimate but unequal transition with real caps, oversight, and exit mechanisms.

**Persistent effects:** set `campaign-ending-family` to `reformed-accord`; adjust `lattice-integrity` by +2; adjust `public-legitimacy` by +1; adjust `distribution-equity` by +0
#### ending-five-separate-skies

Shared political authority ends and local systems preserve sovereignty, at the cost of shortages, migration, and reduced habitability.

**Persistent effects:** set `campaign-ending-family` to `five-separate-skies`; adjust `public-legitimacy` by +1; adjust `lattice-integrity` by -1; adjust `resource-reserves` by -2
#### ending-peace-by-allocation

A technically effective Starfleet or Secretariat plan limits casualties without durable consent.

**Persistent effects:** set `campaign-ending-family` to `peace-by-allocation`; adjust `lattice-integrity` by +2; adjust `public-legitimacy` by -2; adjust `distribution-equity` by -1
#### ending-fifth-world-falls

The other worlds survive while Nacre suffers mass evacuation or ecological collapse; the operation is recorded as a system failure.

**Persistent effects:** set `campaign-ending-family` to `fifth-world-falls`; adjust `lattice-integrity` by +1; adjust `distribution-equity` by -3; adjust `public-legitimacy` by -3; add `mass-displacement` to `nacre`
#### ending-broken-worlds

Multiple nodes collapse and at least two populations face catastrophic loss; the Eudora Vale becomes an evacuation command.

**Persistent effects:** set `campaign-ending-family` to `broken-worlds`; adjust `lattice-integrity` by -3; adjust `resource-reserves` by -3; adjust `public-legitimacy` by -2; set `front.lattice-cascade` to stage 6

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.

## Weather We Share

- **ID:** `epilogue-weather-we-share`
- **Kind:** epilogue
- **Initial status:** `latent`
- **Typical duration:** 1 session
- **Locations:** U.S.S. Eudora Vale, Crown Station, Nacre, Ilyra Habitat Six
- **Actors:** Rear Admiral Celeste Osei, Speaker Mara Senn, First Minister Elian Vorr, Convenor Kesh Var, Asha Ren, Venn Talar
- **Factions:** Starfleet Ilyra Review Mission, Ilyra Accord Secretariat, Nacre Assembly, Lattice Engineers' Union
- **Mission graph:** None; systemic open-world quest contract.
- **Delegation:** Not allowed as a whole. The command review is the player's epilogue decision.
- **Calm content:** No

### Player-safe premise

After the cascade, the player faces the final command review while the Ilyra System negotiates reparations, migration, infrastructure ownership, Rhee's legacy, and the status of whatever authority survived.

### Director purpose

The epilogue reads the ending family and campaign axes. It should name surviving institutions, ongoing costs, damaged relationships, and commitments rather than declaring abstract victory. Command confirmation follows judgment, candor, crew confidence, ship condition, and lawful process.

### Dramatic question

> What does accountability require after the emergency has passed and the consequences remain?

### Availability

```json
{
  "all": [
    {
      "type": "questResolved",
      "questId": "chapter-15-a-common-climate"
    }
  ]
}
```

### Objectives

- Record the operational, political, ecological, and human outcome of the cascade.
- Establish immediate reparations, migration, and reconstruction commitments.
- Resolve evidence custody, public inquiry, and responsibility for concealment and sabotage.
- Address Rhee's legacy and the Eudora Vale crew's losses.
- Resolve the player's command status through a transparent review.

### Pressures

- Every ending leaves long-term recovery work and contested narratives.
- Starfleet must distinguish effective improvisation from unlawful overreach.
- The crew may support the player even if the institution censors or delays confirmation.
- Rhee's choices require neither canonization nor repudiation.

### Revelations and clue resilience

- **revelation.command-outcome-derived:** The player's command disposition follows visible conduct and campaign state rather than a hidden approval score. Required: True. Alternate routes allowed: False.

### Example approaches, not a solution menu

- Accept permanent confirmation and define the next mission.
- Remain Acting Captain pending a formal inquiry.
- Accept relief while defending the campaign record.
- Challenge an adverse review through lawful channels.
- Request reassignment after completing the transition.

### Outcome families

#### command-confirmed

Starfleet confirms the player as captain of the Eudora Vale, with the crew and campaign record supporting the appointment.

**Persistent effects:** set `command-outcome` to `confirmed-captain`; adjust `crew-command-confidence` by +2
#### command-acting-pending-inquiry

The player remains Acting Captain while a formal inquiry reviews disclosure, intervention, or ship-risk decisions.

**Persistent effects:** set `command-outcome` to `acting-pending-inquiry`; adjust `starfleet-scrutiny` by +1
#### command-relieved-with-confidence

The player accepts or receives relief while retaining substantial crew confidence and a defensible campaign record.

**Persistent effects:** set `command-outcome` to `relieved-with-crew-confidence`; adjust `crew-command-confidence` by +1
#### command-censured-retained

Starfleet censures specific conduct but retains the player in command due to crew support, results, or lack of a credible alternative.

**Persistent effects:** set `command-outcome` to `censured-but-retained`; adjust `starfleet-scrutiny` by +2
#### command-voluntary-transition

The player completes the crisis and chooses a lawful transition out of command.

**Persistent effects:** set `command-outcome` to `voluntary-transition`

### Direction constraints

- No single failed check ends the assignment.
- Refusal, postponement, delegation, withdrawal, and abandonment remain consequential command choices.
- Information moves only through causally justified routes.
- Prewritten approaches are examples rather than a menu of valid solutions.
- The Director must never write the player character's thoughts, dialogue, feelings, or decisions.
- Technical solutions must propagate understandable consequences through the linked lattice rather than resolving one location in isolation.
