# Enemy's Garden Main Quests

These records implement onboarding, main, finale, and epilogue work. Quest order is state-driven; later quests inherit the current campaign rather than creating isolated mission bubbles.

## Prelude: The First Harvest

**ID:** `prelude-the-first-harvest`  
**Kind:** onboarding  
**Typical duration:** 2-3 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

A control-spore release at Arda II incapacitates Captain Dorel during an evacuation, forcing the newly assigned XO to assume command while the grain-processing complex and nearby harvest remain at risk.

### Director frame

Use the exposure to establish acting command, quarantine doctrine, scientific uncertainty, and regional confidence. Dorel is alive but medically unavailable; the player must receive expert advice without turning sickbay into a remote captaincy.

**Dramatic question:** What kind of acting captain takes command when hunger, contagion, privacy, and public authority become one problem?

### Anchors

- Locations: `arda-ii`, `uss-celandine`, `verdant-station`
- Actors: `maia-dorel`, `calen-varo`, `rinn-sorell`, `sovek`, `ilyan-kes`
- Factions: `starfleet-relief-command`, `arda-harvest-directorate`, `cyradon-food-council`

### Objectives

1. Evacuate the processing tower and stabilize the exposed workforce.
2. Establish lawful command and a workable shipwide quarantine posture.
3. Preserve enough of the Arda harvest and evidence to keep the regional mission viable.

### Active pressures

- Dormant spores evade standard transporter screening.
- Arda officials fear a quarantine announcement will collapse the harvest labor force.
- Dorel can communicate briefly but is neurologically unstable and may be a carrier.

### Revelations and resilient routes

- **Core:** The release involved a dormant control-spore family rather than an ordinary crop pathogen. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Arda field and worker survival currently depend on continuing some K-17 operations. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Dorel approved emergency K-17 distribution during the war and understands the political consequence of that decision. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Separate evacuation, medical isolation, and harvest continuity into delegated workstreams.
- Hold orbit and use shuttles, quarantine decks, and remote command.
- Withdraw to Verdant Station after stabilizing the site.
- Create a joint Arda-Starfleet incident cell with public reporting limits.

### Authored outcome families

#### `command-and-harvest-stabilized`

The evacuation, quarantine, and harvest are stabilized with credible local participation.

- Adjust `famine-pressure` by -1.
- Adjust `public-trust` by +1.
- Adjust `crew-command-confidence` by +1.
- Adjust `clock.dorel-recovery` by +1.
- Reveal `fact.k17-control-spores`: K-17 includes dormant control-spore pathways that standard biofilters do not reliably detect.
- Grant asset `asset.arda-incident-cell`: A joint incident team provides field access, worker contacts, and a trusted route for time-sensitive Arda decisions.
- Set flag `player-acting-captain` to `True`.

#### `lives-saved-harvest-delayed`

The evacuation succeeds, but conservative quarantine and shutdown measures cost part of the planting window.

- Adjust `public-trust` by +1.
- Adjust `famine-pressure` by +1.
- Adjust `clock.arda-planting-window` by +1.
- Adjust `crew-command-confidence` by +1.
- Reveal `fact.k17-control-spores`: K-17 includes dormant control-spore pathways that standard biofilters do not reliably detect.
- Set flag `player-acting-captain` to `True`.

#### `harvest-preserved-exposure-spreads`

The harvest is preserved through aggressive continuity measures, but exposure and later screening burdens increase.

- Adjust `famine-pressure` by -1.
- Adjust `biomarker-spread` by +2.
- Adjust `public-trust` by -1.
- Advance `front.biological-integration` by 1 stage(s).
- Reveal `fact.k17-control-spores`: K-17 includes dormant control-spore pathways that standard biofilters do not reliably detect.
- Set flag `player-acting-captain` to `True`.

#### `withdrawal-under-pressure`

The Celandine withdraws after immediate rescue, leaving Arda to improvise harvest continuity under political strain.

- Adjust `famine-pressure` by +2.
- Adjust `public-trust` by -2.
- Adjust `crew-command-confidence` by -1.
- Adjust `clock.arda-planting-window` by +2.
- Reveal `fact.k17-control-spores`: K-17 includes dormant control-spore pathways that standard biofilters do not reliably detect.
- Set flag `player-acting-captain` to `True`.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## Grain Under Glass

**ID:** `chapter-1-grain-under-glass`  
**Kind:** main  
**Typical duration:** 1-2 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Arda II must decide how much contaminated grain to process, quarantine, divert, or destroy before the planting window closes.

### Director frame

Make the crop benefit undeniable. This is not a reveal mission; it is a command allocation problem with medical, ecological, and political consequences.

**Dramatic question:** How much long-term biological risk may command accept to prevent immediate hunger?

### Anchors

- Locations: `arda-ii`, `verdant-station`
- Actors: `ilyan-kes`, `oris-talan`, `sovek`, `calen-varo`, `emet-raal`
- Factions: `arda-harvest-directorate`, `cyradon-food-council`

### Objectives

1. Establish a credible sampling and processing standard.
2. Allocate usable grain among food, seed, research, and quarantine needs.
3. Create an auditable plan for workers, waste, and downstream exposure.

### Active pressures

- Storage capacity is measured in days, not abstractions.
- Different K-17 lots carry different marker and spore burdens.
- Destroying grain also destroys seed and political trust.

### Revelations and resilient routes

- **Core:** Processing residues carry control-spore fragments even when food tests as nutritionally safe. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Arda can preserve both food and evidence only with additional clean storage and transport. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** The Harvest Directorate suppressed one anomalous field report to avoid a wartime shutdown. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Segment lots by risk and purpose.
- Process under controlled exposure with medical surveillance.
- Destroy high-risk lots and replace food from reserves.
- Retain field standing crops while redirecting labor to clean trial acreage.

### Authored outcome families

#### `segmented-harvest`

Risk-tiered processing preserves substantial food while creating an auditable exposure record.

- Adjust `famine-pressure` by -1.
- Adjust `biomarker-spread` by -1.
- Adjust `public-trust` by +1.
- Grant asset `asset.arda-lot-ledger`: A trusted lot-level record links field, processor, exposure, and destination data without forcing a universal identity registry.

#### `maximum-throughput`

Arda maximizes immediate food output and accepts broader exposure surveillance.

- Adjust `famine-pressure` by -2.
- Adjust `biomarker-spread` by +2.
- Adjust `public-trust` by -1.
- Adjust `clock.control-bloom` by +1.

#### `sterilized-loss`

High-risk lots are destroyed, sharply reducing spread while worsening regional stores.

- Adjust `biomarker-spread` by -2.
- Adjust `famine-pressure` by +2.
- Adjust `ecological-health` by -1.
- Adjust `clock.arda-planting-window` by +1.

#### `local-discretion`

Arda retains control under a published Starfleet standard, producing uneven but politically durable compliance.

- Adjust `seed-sovereignty` by +1.
- Adjust `public-trust` by +1.
- Adjust `biomarker-spread` by +1.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## The Old Seed

**ID:** `chapter-1-the-old-seed`  
**Kind:** main  
**Typical duration:** 2 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Khepri offers heritage crop lines that could reduce dependence, but the surviving seed is sparse, drought-stressed, politically contested, and vulnerable to seizure.

### Director frame

Treat genetic stock as living community property rather than a magic key. The player can protect, borrow, multiply, relocate, or regulate it, but every custody choice creates precedent.

**Dramatic question:** Who owns a seed line when regional survival depends on multiplying it?

### Anchors

- Locations: `khepri`, `uss-celandine`, `verdant-station`
- Actors: `sila-marr`, `toma-rey`, `sovek`, `emet-raal`
- Factions: `khepri-seed-cooperatives`, `free-seed-league`, `cyradon-food-council`

### Objectives

1. Verify the viability and diversity of Khepri heritage lines.
2. Protect the Last Clean Acre through the next water crisis.
3. Negotiate parent-stock custody and multiplication rights.

### Active pressures

- The reservoir cannot support every trial.
- Food Council emergency law permits requisition of strategic seed.
- Some Free Seed militants oppose any sealed or offworld custody.

### Revelations and resilient routes

- **Core:** Several heritage lines can cross with Grayleaf and local edited K-17 without preserving the marker pathway. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** The Last Clean Acre survived because farmers concealed it from wartime requisition. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** One unique parent line cannot survive transfer through the Celandine unreliable freezer without repair or local replication. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Create distributed mirrored seed lots.
- Leave all parent stock under cooperative custody with Starfleet verification.
- Carry one lot aboard after repairing cryogenic systems.
- Use open genomic records while keeping physical seed locally controlled.

### Authored outcome families

#### `distributed-custody`

Parent stock is mirrored across Khepri, Celandine, and an independent registry under shared access rules.

- Adjust `alternative-readiness` by +2.
- Adjust `seed-sovereignty` by +2.
- Adjust `public-trust` by +1.
- Grant asset `asset.heritage-seed-network`: Distributed parent stock and verified lineage records support future mixed-crop trials without one custodian controlling access.

#### `khepri-sovereignty`

Khepri retains physical custody while granting transparent testing and time-limited multiplication rights.

- Adjust `alternative-readiness` by +1.
- Adjust `seed-sovereignty` by +2.
- Adjust `public-trust` by +1.

#### `emergency-requisition`

Starfleet or the Food Council secures the seed quickly under emergency authority.

- Adjust `alternative-readiness` by +2.
- Adjust `seed-sovereignty` by -2.
- Adjust `public-trust` by -2.
- Advance `front.emergency-power` by 1 stage(s).

#### `acre-lost`

Water failure, violence, or failed custody destroys irreplaceable stock but leaves partial records and lessons.

- Adjust `alternative-readiness` by -2.
- Adjust `ecological-health` by -1.
- Adjust `sabotage-retaliation` by +1.
- Reveal `fact.heritage-line-records`: Partial genomic and cultivation records survive even though physical parent stock is lost.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## Allocation Day

**ID:** `chapter-1-allocation-day`  
**Kind:** main  
**Typical duration:** 1-2 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Sorell’s Allocation Authority must divide replicator feedstock, seed, and transport priority among districts whose identities and rights are entangled with ration records.

### Director frame

The Authority prevents chaos and enables patronage at the same time. Let the player audit, reform, bypass, or temporarily support it rather than presenting one pure choice.

**Dramatic question:** Can emergency allocation remain legitimate when the records that make it efficient also make people governable?

### Anchors

- Locations: `sorell`, `verdant-station`
- Actors: `nera-voss`, `rinn-sorell`, `emet-raal`, `calen-varo`
- Factions: `sorell-allocation-authority`, `cyradon-food-council`

### Objectives

1. Prevent an immediate ration disruption.
2. Audit who is excluded, duplicated, or politically favored.
3. Set a reviewable allocation and appeals process for the next planting cycle.

### Active pressures

- Children and migrants lack independent records.
- A protein-vine failure makes delay medically serious.
- Public release of detailed records could expose biomarker and political identity data.

### Revelations and resilient routes

- **Core:** The Authority uses Food Council numbers as de facto citizenship credentials. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Several reserve lots exist only on paper after years of politically protected spoilage. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Local neighborhood kitchens can distribute food reliably if they receive bulk supply and independent verification. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Reform the central registry with privacy and appeals.
- Delegate distribution to audited local kitchens.
- Use Starfleet direct distribution for a limited emergency.
- Preserve the system through planting while negotiating sunset rules.

### Authored outcome families

#### `audited-local-allocation`

Central forecasting and neighborhood distribution are joined through privacy-preserving audits and appeals.

- Adjust `famine-pressure` by -1.
- Adjust `public-trust` by +2.
- Adjust `seed-sovereignty` by +1.
- Grant asset `asset.sorell-kitchen-network`: Local kitchens provide trusted distribution, population knowledge, and emergency meal capacity without controlling citizenship.

#### `central-continuity`

The Authority preserves distribution efficiency and accepts limited external review.

- Adjust `famine-pressure` by -2.
- Adjust `public-trust` by -1.
- Adjust `seed-sovereignty` by -1.
- Advance `front.emergency-power` by 1 stage(s).

#### `starfleet-direct-relief`

The Celandine bypasses local structures to stop an immediate crisis.

- Adjust `famine-pressure` by -1.
- Adjust `starfleet-scrutiny` by +1.
- Adjust `public-trust` by -1.
- Adjust `clock.sorell-ration-unrest` by -1.

#### `allocation-collapse`

The ledger dispute interrupts distribution and provokes localized unrest.

- Adjust `famine-pressure` by +2.
- Adjust `public-trust` by -2.
- Adjust `sabotage-retaliation` by +1.
- Adjust `clock.sorell-ration-unrest` by +2.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## Roots in Salt

**ID:** `chapter-1-roots-in-salt`  
**Kind:** main  
**Typical duration:** 1-2 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Vela Nacre’s wetlands depend on a K-17 root system that neutralizes mining toxins but is beginning to displace native microbial life.

### Director frame

The ecological problem must resist simple sterilization. Vela has valid reasons to retain selected K-17 systems until a replacement ecology is operating.

**Dramatic question:** What does biological autonomy mean when removing the occupier’s organism destroys the habitat it now sustains?

### Anchors

- Locations: `vela-nacre`, `weather-crown`
- Actors: `omala-ren`, `sovek`, `toran-vel`
- Factions: `vela-wetland-stewardship`, `cardassian-reconstruction-mission`

### Objectives

1. Map the wetland dependency network and current failure points.
2. Protect fisheries and water intake through the next tidal cycle.
3. Authorize a locally credible retention, replacement, or controlled-removal plan.

### Active pressures

- The root mats suppress toxins only while metabolically active.
- Storm surge can move spores into uncontaminated estuaries.
- Vela residents distrust both Starfleet sterilization and Cardassian remediation.

### Revelations and resilient routes

- **Core:** The K-17 root line has mutated beyond its original control profile. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** A native microbe consortium can assume part of the detoxification role if given time and mineral support. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Weather Crown salinity management is accelerating one branch of root dominance. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Build a staged replacement wetland.
- Retain monitored root zones under local custody.
- Alter Weather Crown patterns to buy ecological time.
- Sterilize selected chokepoints while protecting refuge ecologies.

### Authored outcome families

#### `mosaic-transition`

Vela establishes monitored K-17 refuge zones while native replacement ecologies expand around them.

- Adjust `ecological-health` by +2.
- Adjust `alternative-readiness` by +1.
- Adjust `seed-sovereignty` by +1.
- Grant asset `asset.vela-microbiome-bank`: Native and adapted microbial communities provide remediation options and ecological diagnostics for other worlds.

#### `controlled-retention`

Vela lawfully retains the root system under transparent local monitoring.

- Adjust `ecological-health` by +1.
- Adjust `biomarker-spread` by +1.
- Adjust `seed-sovereignty` by +2.
- Adjust `public-trust` by +1.

#### `rapid-sterilization`

Orbital and ground sterilization sharply reduce K-17 spread but damage fisheries and toxin control.

- Adjust `biomarker-spread` by -2.
- Adjust `ecological-health` by -3.
- Adjust `famine-pressure` by +1.
- Adjust `clock.vela-wetland` by +2.

#### `wetland-failure`

The intervention stalls or arrives too late, forcing water rationing and habitat evacuation.

- Adjust `ecological-health` by -3.
- Adjust `famine-pressure` by +1.
- Adjust `public-trust` by -1.
- Advance `front.ecological-lockin` by 1 stage(s).

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## A Marker in the Blood

**ID:** `chapter-2-a-marker-in-the-blood`  
**Kind:** main  
**Typical duration:** 2-3 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Medical and orbital evidence confirms that K-17 exposure encodes persistent biological markers in people, fields, water, and livestock.

### Director frame

The broad result is discoverable through several routes and should not depend on one scan. The mission is about evidence scope, patient rights, immediate protection, and who receives the finding first.

**Dramatic question:** Who may know that an entire population has become identifiable, and how can disclosure avoid turning protection into another registry?

### Anchors

- Locations: `uss-celandine`, `verdant-station`, `arda-ii`, `sorell`
- Actors: `calen-varo`, `sovek`, `hara-sen`, `lysa-voren`, `lareen`
- Factions: `starfleet-relief-command`, `cyradon-food-council`

### Objectives

1. Validate the marker mechanism across independent samples.
2. Protect patient consent and prevent unauthorized use of screening data.
3. Brief enough authorities and communities to reduce immediate coercion risk.

### Active pressures

- A public rumor is already circulating.
- Starfleet Intelligence requests complete raw data.
- Medical screening is useful for treatment but dangerous as identity infrastructure.

### Revelations and resilient routes

- **Core:** The marker can be detected from orbit under favorable conditions but cannot uniquely identify every individual. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Dominion control chemistry can alter stress, dormancy, and fertility in some K-17 lines. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Several local ration and labor databases can be linked to marker geography even without names. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Use distributed independent validation before broad release.
- Issue a rapid public warning with limited technical detail.
- Create a protected medical registry with local oversight.
- Brief each world through locally trusted institutions before one regional statement.

### Authored outcome families

#### `verified-rights-first-disclosure`

Independent verification and a rights-first disclosure establish the risk without centralizing raw identity data.

- Adjust `public-trust` by +2.
- Adjust `biomarker-spread` by -1.
- Adjust `starfleet-scrutiny` by +1.
- Reveal `fact.k17-population-marker`: K-17 exposure leaves persistent biological and environmental markers detectable at range under favorable conditions.
- Grant asset `asset.independent-marker-labs`: Multiple local laboratories can verify marker and control findings without relying exclusively on Starfleet or Food Council custody.

#### `rapid-public-warning`

The public learns the essential risk quickly, enabling precautions but triggering uneven fear and hoarding.

- Adjust `public-trust` by +1.
- Adjust `famine-pressure` by +1.
- Adjust `sabotage-retaliation` by +1.
- Adjust `clock.public-disclosure` by +2.
- Reveal `fact.k17-population-marker`: K-17 exposure leaves persistent biological and environmental markers detectable at range under favorable conditions.

#### `restricted-briefing`

Starfleet and selected authorities receive the finding before the wider public.

- Adjust `biomarker-spread` by -1.
- Adjust `public-trust` by -2.
- Adjust `starfleet-scrutiny` by -1.
- Advance `front.emergency-power` by 1 stage(s).
- Reveal `fact.k17-population-marker`: K-17 exposure leaves persistent biological and environmental markers detectable at range under favorable conditions.

#### `data-compromised`

The evidence remains valid, but unauthorized copies and contradictory claims destroy control of the disclosure process.

- Adjust `public-trust` by -2.
- Adjust `sabotage-retaliation` by +2.
- Adjust `starfleet-scrutiny` by +1.
- Adjust `clock.public-disclosure` by +3.
- Reveal `fact.k17-population-marker`: K-17 exposure leaves persistent biological and environmental markers detectable at range under favorable conditions.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## The Price of Disclosure

**ID:** `chapter-2-the-price-of-disclosure`  
**Kind:** main  
**Typical duration:** 1-2 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

After the marker finding, markets, clinics, farms, and governments demand different levels of detail while hoarding and retaliatory attacks begin.

### Director frame

This quest operationalizes the chosen disclosure posture. Do not punish either transparency or staging automatically; test whether the process is credible, useful, and contestable.

**Dramatic question:** Can the truth be made actionable without becoming either panic or administrative control?

### Anchors

- Locations: `verdant-station`, `sorell`, `cinder-reach`
- Actors: `lysa-voren`, `rinn-sorell`, `sila-marr`, `nera-voss`, `jarek-noll`
- Factions: `cyradon-food-council`, `free-seed-league`, `cinder-transport-union`

### Objectives

1. Establish a common public fact baseline.
2. Protect clinics, laboratories, and transport workers from retaliation.
3. Define data access, correction, and privacy rules for the transition.

### Active pressures

- False clean-seed claims spread faster than testing.
- Some authorities use disclosure to justify movement controls.
- Families demand individual tests that cannot offer individual certainty.

### Revelations and resilient routes

- **Core:** The marker is probabilistic and environmental, not a perfect personal locator. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Several hoarding patterns were triggered by official ambiguity rather than the finding itself. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Cinder union manifests can expose diversion without exposing patient data. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Hold a regional public hearing.
- Issue local technical briefings with one shared evidence archive.
- Create an independent disclosure commission.
- Prioritize immediate protective guidance and defer complete archives until custody is secured.

### Authored outcome families

#### `common-fact-compact`

A plural public process produces a common fact record, privacy rules, and correction mechanism.

- Adjust `public-trust` by +2.
- Adjust `sabotage-retaliation` by -1.
- Adjust `seed-sovereignty` by +1.
- Grant asset `asset.public-evidence-commons`: A multi-custodian record makes scientific claims, corrections, and policy rationales auditable without publishing raw medical identities.

#### `staged-technical-briefings`

Locally trusted institutions distribute actionable guidance, but regional narratives remain uneven.

- Adjust `public-trust` by +1.
- Adjust `sabotage-retaliation` by +0.
- Adjust `starfleet-scrutiny` by +1.

#### `security-led-disclosure`

Authorities suppress panic and theft through controlled release and movement restrictions.

- Adjust `sabotage-retaliation` by -1.
- Adjust `public-trust` by -2.
- Adjust `seed-sovereignty` by -1.
- Advance `front.emergency-power` by 1 stage(s).

#### `disclosure-fractures`

Contradictory statements and leaked data deepen panic, retaliation, and market manipulation.

- Adjust `public-trust` by -3.
- Adjust `sabotage-retaliation` by +2.
- Adjust `famine-pressure` by +1.
- Adjust `clock.public-disclosure` by +2.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## The Briar Key

**ID:** `chapter-2-the-briar-key`  
**Kind:** main  
**Typical duration:** 2-3 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Multiple evidence routes point toward a sealed Dominion seed vault containing K-17 parent strains, control chemistry, field records, and transition-relevant knowledge.

### Director frame

Briar Vault is a tool and custody problem, not a compulsory dungeon. Access can come through Lareen, Cardassian records, recovered keys, negotiations, or hazardous breach.

**Dramatic question:** Who should be trusted with dangerous agricultural knowledge that may be necessary to make the region free of it?

### Anchors

- Locations: `verdant-station`, `cardassian-orchard`, `briar-vault`, `cinder-reach`
- Actors: `lareen`, `toran-vel`, `thena-zharis`, `eren-yaal`, `sila-marr`
- Factions: `dominion-biotech-holdouts`, `cardassian-reconstruction-mission`, `free-seed-league`, `starfleet-relief-command`

### Objectives

1. Locate and authenticate a viable access route to Briar Vault.
2. Set rules for Lareen, Cardassian, local, and Starfleet participation.
3. Prevent unilateral seizure or destruction before evidence custody is agreed.

### Active pressures

- Lareen requests protection and meaningful laboratory access.
- A black-market buyer is already seeking partial keys.
- Vault defenses distinguish occupation authority from present legitimacy.

### Revelations and resilient routes

- **Core:** No one expert possesses the complete access sequence. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** The vault contains both crop parent strains and control-compound families. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Some records document coercion; others document genuine famine-relief work by occupied specialists. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Negotiate a joint access team.
- Secure the perimeter and delay entry pending a custody charter.
- Use a hazardous physical breach to prevent imminent seizure.
- Trade limited protection and supervised access for Lareen expertise.

### Authored outcome families

#### `joint-custody-entry`

A multi-party team enters under recorded custody rules, preserving evidence and useful material.

- Adjust `seed-sovereignty` by +2.
- Adjust `public-trust` by +1.
- Adjust `alternative-readiness` by +1.
- Discover location `briar-vault`.
- Set route `route.briar-verdant` to `conditional` with confidence `verified`.
- Grant asset `asset.briar-joint-custody`: Starfleet, local, scientific, and survivor representatives share access logs, evidence controls, and emergency vetoes.
- Set flag `briar-vault-accessed` to `True`.

#### `starfleet-secure-entry`

Starfleet secures the vault rapidly and preserves the material under centralized custody.

- Adjust `alternative-readiness` by +2.
- Adjust `seed-sovereignty` by -1.
- Adjust `public-trust` by -1.
- Adjust `starfleet-scrutiny` by +1.
- Discover location `briar-vault`.
- Set flag `briar-starfleet-custody` to `True`.

#### `local-seed-custody`

Local seed institutions gain primary custody with technical support and limited Starfleet safeguards.

- Adjust `seed-sovereignty` by +3.
- Adjust `public-trust` by +1.
- Adjust `sabotage-retaliation` by +1.
- Discover location `briar-vault`.
- Set flag `briar-local-custody` to `True`.

#### `vault-damaged`

A contested or rushed entry destroys some parent stock and records but leaves enough for later work.

- Adjust `alternative-readiness` by -1.
- Adjust `sabotage-retaliation` by +2.
- Adjust `starfleet-scrutiny` by +1.
- Discover location `briar-vault`.
- Reveal `fact.briar-partial-record`: Partial Briar records survive, including control-compound classes and several parent-strain lineages.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## Parent Strains

**ID:** `chapter-2-parent-strains`  
**Kind:** main  
**Typical duration:** 1-2 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Briar material reveals that local K-17 lines differ in control sensitivity, ecological dependence, and crossbreeding potential, forcing a regional classification before the next planting.

### Director frame

The mission should produce several viable transition pathways rather than one correct crop. Dangerous knowledge can be restricted, distributed, destroyed, or transformed into public test standards.

**Dramatic question:** Can the region classify and use the occupier’s seed without recreating the authority that designed it?

### Anchors

- Locations: `briar-vault`, `uss-celandine`, `weather-crown`
- Actors: `sovek`, `lareen`, `toran-vel`, `hara-sen`
- Factions: `grayleaf-volunteers`, `cardassian-reconstruction-mission`, `starfleet-relief-command`

### Objectives

1. Map control sensitivity and ecological dependence across major local strains.
2. Separate useful parent material from coercive control architecture.
3. Establish a test standard that local laboratories can reproduce.

### Active pressures

- Some samples respond only under rare environmental conditions.
- Destruction advocates demand immediate sterilization of the vault.
- Lareen and Vel dispute whether one record describes a safeguard or a control protocol.

### Revelations and resilient routes

- **Core:** There is no universal K-17 switch. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Several low-control lines can be edited or crossed without retaining the marker pathway. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Weather Crown telemetry can accidentally approximate one class of dormancy signal. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Create an open hazard-classification standard.
- Hold high-risk material under sealed joint custody.
- Destroy control compounds while preserving sequence and cultivation evidence.
- Develop locally reproducible field assays before releasing parent stock.

### Authored outcome families

#### `open-hazard-standard`

Independent laboratories can classify strains while the most dangerous material remains under accountable custody.

- Adjust `alternative-readiness` by +2.
- Adjust `biomarker-spread` by -1.
- Adjust `seed-sovereignty` by +2.
- Grant asset `asset.k17-hazard-standard`: A reproducible local test distinguishes marker, control, ecological, and cultivation risks across strains.

#### `sealed-expert-custody`

A small expert team preserves maximum technical capability under tight access control.

- Adjust `alternative-readiness` by +2.
- Adjust `public-trust` by -1.
- Adjust `seed-sovereignty` by -1.
- Adjust `starfleet-scrutiny` by -1.

#### `control-material-destroyed`

Control compounds and viable high-risk stock are destroyed while partial records survive.

- Adjust `biomarker-spread` by -2.
- Adjust `alternative-readiness` by -1.
- Adjust `public-trust` by +1.
- Set flag `briar-control-material-destroyed` to `True`.

#### `classification-contested`

Conflicting expert claims leave the region without one accepted standard before planting.

- Adjust `alternative-readiness` by -1.
- Adjust `public-trust` by -1.
- Adjust `sabotage-retaliation` by +1.
- Adjust `clock.control-bloom` by +1.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## Grayleaf Season

**ID:** `chapter-3-grayleaf-season`  
**Kind:** main  
**Typical duration:** 2 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

The Grayleaf substitute crop enters expanded trials while adverse immune reactions, lower yield, soil limits, and political pressure threaten the program.

### Director frame

Grayleaf is a credible alternative, not a miracle. Protect informed consent and unfavorable data while allowing modification, pause, or continuation under real deadlines.

**Dramatic question:** How much uncertainty may a voluntary transition trial carry when delay also has a body count?

### Anchors

- Locations: `lysas-moon`, `arda-ii`, `khepri`, `uss-celandine`
- Actors: `aven-tesh`, `hara-sen`, `calen-varo`, `sovek`
- Factions: `grayleaf-volunteers`, `khepri-seed-cooperatives`, `arda-harvest-directorate`

### Objectives

1. Identify and treat the severe immune-response subgroup.
2. Protect volunteer consent and publish adverse findings.
3. Decide whether and where Grayleaf can scale for the next planting.

### Active pressures

- One world wants approval before the full analysis.
- Trial volunteers fear loss of ration priority if the trial pauses.
- Lower yields require more acreage, labor, and processing capacity.

### Revelations and resilient routes

- **Core:** The adverse response is serious but predictable through a separate test. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Grayleaf performs best in mixed systems with Khepri heritage lines. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Suppressed negative data would accelerate planting briefly and destroy long-term trust if exposed. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Pause and redesign the trial.
- Continue with screening and narrower indications.
- Scale only on worlds with compatible soil and processing.
- Authorize decentralized local trials under one adverse-event registry.

### Authored outcome families

#### `screened-mixed-crop-scale`

Grayleaf scales through screening, mixed-crop practice, and transparent adverse-event reporting.

- Adjust `alternative-readiness` by +3.
- Adjust `public-trust` by +2.
- Adjust `ecological-health` by +1.
- Grant asset `asset.grayleaf-capacity`: Validated seed, screening, farmer training, and processing plans make Grayleaf a real but limited regional alternative.

#### `cautious-limited-use`

Grayleaf remains a credible option for selected communities while additional work continues.

- Adjust `alternative-readiness` by +2.
- Adjust `public-trust` by +1.
- Adjust `clock.lysa-clean-seed` by +1.

#### `accelerated-approval`

Rapid approval increases acreage but carries preventable adverse events and institutional mistrust.

- Adjust `alternative-readiness` by +3.
- Adjust `public-trust` by -2.
- Adjust `starfleet-scrutiny` by +1.

#### `trial-collapse`

The program loses participants, viable acreage, or political support, preserving data but little immediate capacity.

- Adjust `alternative-readiness` by -2.
- Adjust `public-trust` by -1.
- Adjust `famine-pressure` by +1.
- Reveal `fact.grayleaf-adverse-profile`: Grayleaf adverse effects and soil limits remain documented even though the scaled trial failed.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## The Seed Compact

**ID:** `chapter-3-the-seed-compact`  
**Kind:** main  
**Typical duration:** 2-3 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Worlds, farmers, laboratories, Food Council officials, Starfleet, and reconstruction specialists negotiate who controls seed, testing, emergency reserves, and exit milestones.

### Director frame

This is a governance engine, not a required diplomatic scene. The compact can be regional, plural, temporary, centralized, or fail; actual assets and prior custody choices determine who can make commitments.

**Dramatic question:** What seed authority can coordinate survival without owning the region’s future?

### Anchors

- Locations: `verdant-station`, `khepri`, `sorell`, `vela-nacre`
- Actors: `lysa-voren`, `sila-marr`, `toma-rey`, `nera-voss`, `omala-ren`, `elias-brand`
- Factions: `cyradon-food-council`, `khepri-seed-cooperatives`, `free-seed-league`, `sorell-allocation-authority`, `starfleet-relief-command`

### Objectives

1. Define custody and access for parent stock and emergency reserves.
2. Create independent verification, appeals, and public reporting.
3. Set transition milestones that account for different worlds and ecological needs.

### Active pressures

- Arda wants guaranteed volume before accepting limits.
- Sorell wants enforceable central controls.
- Vela rejects one universal eradication schedule.
- Khepri demands farmer representation and anti-requisition rules.

### Revelations and resilient routes

- **Core:** No single authority has enough seed, transport, legitimacy, or expertise to implement a regional plan alone. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Different-world transition schedules can coexist if testing and control-risk standards are shared. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** The Food Council has emergency-law powers that will become permanent unless explicitly sunset. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Negotiate a plural compact with shared standards and local custody.
- Create a temporary centralized recovery authority with sunset and appeals.
- Recognize separate world systems joined by mutual inspection.
- Use Starfleet custody as a bridge while local institutions are constituted.

### Authored outcome families

#### `plural-seed-compact`

A representative compact shares standards, reserves, and audit while preserving local custody and distinct transition schedules.

- Adjust `seed-sovereignty` by +3.
- Adjust `public-trust` by +2.
- Adjust `alternative-readiness` by +1.
- Grant asset `asset.cyradon-seed-compact`: A lawful plural institution coordinates reserves, testing, appeals, access, and transition milestones without one custodian owning every seed line.
- Set flag `ending-free-harvest-eligible` to `True`.

#### `temporary-recovery-authority`

A centralized authority secures distribution and testing under written sunset and review rules.

- Adjust `famine-pressure` by -1.
- Adjust `seed-sovereignty` by -1.
- Adjust `public-trust` by +0.
- Grant asset `asset.recovery-authority`: A time-limited central body can coordinate high-volume planting and reserves but requires active review to avoid permanent dependency.

#### `federated-world-agreements`

Separate world systems accept mutual inspection and emergency assistance without one regional seed government.

- Adjust `seed-sovereignty` by +2.
- Adjust `public-trust` by +1.
- Adjust `alternative-readiness` by +1.
- Adjust `sabotage-retaliation` by +1.
- Set flag `ending-private-gardens-eligible` to `True`.

#### `compact-fails`

The negotiation ends without a common institution, leaving bilateral bargains and emergency powers to fill the gap.

- Adjust `seed-sovereignty` by -1.
- Adjust `public-trust` by -2.
- Adjust `sabotage-retaliation` by +1.
- Advance `front.emergency-power` by 1 stage(s).

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## The Control Bloom

**ID:** `chapter-3-the-control-bloom`  
**Kind:** main  
**Typical duration:** 2-3 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

Weather Crown telemetry, K-17 strain behavior, and control-compound evidence indicate that the next regional planting could trigger synchronized dormancy, sterility, or marker expression.

### Director frame

The cause should derive from campaign state: corrupted telemetry, deliberate activation, vault mishandling, environmental stress, or accumulated mutation. Do not force one villain or one universal signal.

**Dramatic question:** Can command prevent a regional control event without destroying the food system it is trying to free?

### Anchors

- Locations: `weather-crown`, `briar-vault`, `arda-ii`, `vela-nacre`
- Actors: `sovek`, `anika-bost`, `thena-zharis`, `lareen`, `toran-vel`
- Factions: `starfleet-relief-command`, `dominion-biotech-holdouts`, `cyradon-food-council`

### Objectives

1. Identify the interacting signal, chemistry, and strain conditions.
2. Protect Weather Crown and field teams from sabotage or panic.
3. Develop distributed countermeasures for multiple worlds and crop systems.

### Active pressures

- The Celandine cannot cover every field.
- Counter-signals may suppress one line and damage another.
- Authorities demand one clear culprit before technical certainty exists.

### Revelations and resilient routes

- **Core:** Weather Crown telemetry can complete part of a control pattern under current atmospheric scheduling. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Local mutations mean countermeasures must be strain-specific. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Briar records include dormancy inhibitors, but deployment requires trusted local mixing and verification. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Reconfigure Weather Crown and distribute local countermeasure packages.
- Physically isolate vulnerable regions from orbital signals.
- Destroy or harvest susceptible acreage before planting.
- Use edited low-control seed and staggered planting to reduce synchronized exposure.

### Authored outcome families

#### `distributed-countermeasure`

Local teams receive verified strain-specific countermeasures and Weather Crown is reconfigured under shared oversight.

- Adjust `biomarker-spread` by -2.
- Adjust `alternative-readiness` by +1.
- Adjust `public-trust` by +1.
- Adjust `clock.control-bloom` by -3.
- Grant asset `asset.control-bloom-countermeasures`: Distributed field assays, inhibitors, signal filters, and local operating teams can respond without waiting for the Celandine.
- Set flag `control-bloom-contained` to `True`.

#### `hard-isolation`

Orbital and communications isolation reduces control exposure but disrupts weather, trade, and coordination.

- Adjust `biomarker-spread` by -1.
- Adjust `famine-pressure` by +1.
- Adjust `ecological-health` by -1.
- Adjust `clock.control-bloom` by -2.

#### `susceptible-fields-destroyed`

Large vulnerable acreages are destroyed before synchronized failure, preserving control security at severe food cost.

- Adjust `biomarker-spread` by -3.
- Adjust `famine-pressure` by +3.
- Adjust `ecological-health` by -2.
- Set flag `clean-fields-risk` to `True`.

#### `control-pattern-unresolved`

The region enters planting with only partial countermeasures and contested causation.

- Adjust `biomarker-spread` by +2.
- Adjust `public-trust` by -1.
- Adjust `clock.control-bloom` by +2.
- Advance `front.biological-integration` by 1 stage(s).

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## Finale: Enemy’s Garden

**ID:** `finale-the-enemys-garden`  
**Kind:** finale  
**Typical duration:** 3-5 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

A coordinated planting window collides with the actual accumulated crop, political, ecological, transport, and command pressures across the cluster.

### Director frame

Assemble the finale from current state. Use only pressures causally present: Arda grain response, Sorell seizure, Vela wetland failure, Khepri water, Cinder attacks, Briar custody, Dorel return, or other committed consequences. The player cannot personally solve every front.

**Dramatic question:** What should the cluster plant, preserve, destroy, and entrust to others when every available choice carries dependency?

### Anchors

- Locations: `uss-celandine`, `verdant-station`, `arda-ii`, `khepri`, `sorell`, `vela-nacre`, `weather-crown`, `cinder-reach`, `briar-vault`
- Actors: `maia-dorel`, `rinn-sorell`, `sovek`, `calen-varo`, `lysa-voren`, `sila-marr`, `omala-ren`, `lareen`
- Factions: `starfleet-relief-command`, `cyradon-food-council`, `free-seed-league`, `grayleaf-volunteers`, `cinder-transport-union`

### Objectives

1. Approve and communicate a regional planting and reserve strategy.
2. Delegate simultaneous field, transport, medical, ecological, and security operations to earned partners.
3. Resolve dangerous seed and control-knowledge custody while maintaining lawful command continuity.

### Active pressures

- Planting and storage clocks converge.
- Every unused asset leaves one front weaker.
- Dorel may request return, remain unavailable, or require evacuation.
- Public legitimacy affects whether worlds follow technically sound orders.

### Revelations and resilient routes

- **Core:** The finale has no universal crop solution; credible plans combine different paths by world. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** Earned local capacity is more important than the Celandine direct throughput. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** The surviving record of why decisions were made is itself an ending resource. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Plant a mixed regional transition with monitored K-17 reserves.
- Authorize aggressive removal where alternatives are ready and controlled retention elsewhere.
- Centralize planting through a recovery authority.
- Recognize separate world plans joined by inspection and mutual aid.
- Evacuate threatened populations while preserving seed and evidence for later recovery.

### Authored outcome families

#### `free-harvest`

The cluster enters a plural, accountable transition with no mass famine, distributed alternatives, controlled K-17 risk, and credible seed sovereignty.

- Adjust `famine-pressure` by -2.
- Adjust `alternative-readiness` by +2.
- Adjust `seed-sovereignty` by +2.
- Adjust `public-trust` by +2.
- Adjust `ecological-health` by +1.
- Set flag `ending-free-harvest` to `True`.
- Set flag `finale-resolved` to `True`.

#### `two-harvests-more`

Controlled K-17 remains in use under monitored exit milestones while alternatives and reserves mature.

- Adjust `famine-pressure` by -1.
- Adjust `alternative-readiness` by +1.
- Adjust `public-trust` by +1.
- Set flag `ending-two-harvests-more` to `True`.
- Set flag `finale-resolved` to `True`.

#### `clean-fields-empty-stores`

Rapid prohibition or destruction secures biological autonomy but produces severe shortage, displacement, and preventable death.

- Adjust `biomarker-spread` by -3.
- Adjust `famine-pressure` by +4.
- Adjust `ecological-health` by -1.
- Set flag `ending-clean-fields-empty-stores` to `True`.
- Set flag `finale-resolved` to `True`.

#### `managed-garden`

Central authority prevents famine and suppresses disruption while retaining unaccountable seed and data power.

- Adjust `famine-pressure` by -2.
- Adjust `seed-sovereignty` by -3.
- Adjust `public-trust` by -2.
- Set flag `ending-managed-garden` to `True`.
- Set flag `finale-resolved` to `True`.

#### `thousand-private-gardens`

Worlds preserve local authority and innovation, but inconsistent testing and residual K-17 markets leave common security gaps.

- Adjust `seed-sovereignty` by +3.
- Adjust `public-trust` by +1.
- Adjust `biomarker-spread` by +1.
- Adjust `sabotage-retaliation` by +1.
- Set flag `ending-thousand-private-gardens` to `True`.
- Set flag `finale-resolved` to `True`.

#### `enemy-garden-catastrophe`

Control failure, blight, violence, or transport collapse destroys several harvests and turns the Celandine toward evacuation and ration enforcement.

- Adjust `famine-pressure` by +4.
- Adjust `public-trust` by -3.
- Adjust `ecological-health` by -2.
- Adjust `sabotage-retaliation` by +3.
- Set flag `ending-enemys-garden` to `True`.
- Set flag `finale-resolved` to `True`.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
## Epilogue: What We Plant Next

**ID:** `epilogue-what-we-plant-next`  
**Kind:** epilogue  
**Typical duration:** 1-2 sessions  
**Calm content:** No  
**Delegation:** Not normally allowed

### Player-facing premise

After the planting crisis, the Celandine returns to Verdant Station for food accounting, public record, seed-law settlement, medical review, and command disposition.

### Director frame

Resolve all six ending axes from committed state. Recovery remains ongoing even in the strongest ending, and accountability must distinguish coercion, secrecy, emergency judgment, and good-faith error.

**Dramatic question:** What record, institutions, and command relationships will carry the cluster into the next harvest?

### Anchors

- Locations: `verdant-station`, `uss-celandine`
- Actors: `maia-dorel`, `elias-brand`, `lysa-voren`, `calen-varo`, `rinn-sorell`
- Factions: `starfleet-relief-command`, `cyradon-food-council`

### Objectives

1. Record food, medical, ecological, and displacement outcomes honestly.
2. Settle Briar, seed-law, and disclosure accountability.
3. Resolve Dorel’s fitness, the player’s billet, and Celandine command continuity.

### Active pressures

- Institutions prefer one clean public story.
- Victims and specialists disagree about reparations and useful knowledge.
- The ship crew needs a durable command structure rather than indefinite emergency language.

### Revelations and resilient routes

- **Core:** Dorel’s wartime K-17 decision saved lives and entered a system that later suppressed emerging concerns. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** The strongest transition plans require future maintenance, not ceremonial closure. Alternate causal routes are permitted; do not require one scene or check.
- **Supporting:** The player’s command record is inseparable from how uncertainty and dissent were handled. Alternate causal routes are permitted; do not require one scene or check.

### Example approaches

These are examples, not a menu of valid solutions.

- Hold a public multi-party accounting.
- Separate technical settlement, legal review, and command review.
- Accept censure while preserving useful institutions.
- Preserve contested evidence for future recovery and appeal.

### Authored outcome families

#### `record-and-transition-settled`

The cluster and Starfleet accept a documented settlement, future review schedule, and lawful command outcome.

- Set flag `enemys-garden-complete` to `True`.
- Adjust `public-trust` by +1.
- Reveal `fact.cyradon-final-record`: The Cyradon final record preserves food, exposure, ecological, custody, and command decisions for later review.

#### `operational-closure-contested-record`

The immediate transition continues, but public and legal settlement remains divided.

- Set flag `enemys-garden-complete` to `True`.
- Adjust `public-trust` by -1.
- Adjust `starfleet-scrutiny` by +1.

#### `inquiry-dominates-epilogue`

Starfleet and regional inquiries control the closing record while practical recovery continues through existing assets.

- Set flag `enemys-garden-complete` to `True`.
- Adjust `starfleet-scrutiny` by +2.
- Adjust `crew-command-confidence` by -1.

### Direction and continuation

Resolve the player actual intent rather than steering toward an authored approach. Failed science, rescue, negotiation, transport, or security work creates cost, uncertainty, delay, injury, damaged trust, lost capacity, or a changed objective. It does not delete the only route to campaign-critical information. Refusal and postponement are recorded as command decisions; local actors continue according to their means and current food-system pressure.
