# Enemy's Garden: Open-World Campaign Implementation

## Identity

- Campaign: Enemy's Garden.
- Ship: U.S.S. Celandine, Norway-class, NCC-64941.
- Opening stardate: 53944.1.
- Theater: The Cyradon Relief Cluster.
- Runtime architecture: `directive.openWorldCampaign.v2`.
- Authored scope: 26 quests, 12 locations, 21 routes, 11 factions, 8 fronts, 14 threads, 50 reactions, and 259 Director cards.

## Operating premise

The cluster does not wait for the Celandine. Crops mature, water reservoirs decline, councils issue ration rules, unions accept or refuse cargo, volunteers begin trials, smugglers move seed, damaged microbiomes spread, and institutions compete for Briar custody. Travel advances stardate and can advance any front with a causal basis.

The player should normally have more credible work than one ship can complete immediately. Present simultaneous obligations and let command choose where the ship, shuttles, delegated officers, local partners, and limited stores act. Revisit locations so the player sees fields, markets, clinics, kitchens, hearings, docks, and family decisions respond to prior policy.

## Regional locations

| Location | Kind | Known | Campaign function |
| --- | --- | --- | --- |
| U.S.S. Celandine | starship | Yes | The Norway-class regional relief vessel serving as the player operational base, mobile laboratory, quarantine platform, and limited convoy escort. |
| Verdant Station | orbital-station | Yes | The cluster coordination hub for Starfleet Relief Command, the Cyradon Food Council, clinics, seed laboratories, hearings, and interworld cargo transfer. |
| Arda II | agricultural-world | Yes | The cluster largest population and grain producer. Vast K-17 terraces feed neighboring worlds, and the opening processing-tower exposure occurs here. |
| Khepri | agricultural-world | Yes | A dry world of cooperative farms, subterranean reservoirs, and strong seed-saving traditions. It preserved fragments of pre-K-17 crop lines. |
| Sorell | agricultural-moon | Yes | A humid moon whose K-17 protein vines grow through reclaimed industrial zones. Harvest authorities tightly control seed and ration access. |
| Vela Nacre | coastal-world | Yes | A coastal world where K-17 root systems stabilized poisoned soils and now hold entire wetlands together. |
| Lysa's Moon | agricultural-moon | Yes | A small farming moon used for refugee cooperatives, clean-soil multiplication, and independent crop trials. |
| Cinder Reach | asteroid-belt | Yes | An industrial belt producing fertilizer, irrigation parts, storage housings, and replicator feedstock. It is also the main route for restricted seed and Dominion biotechnology. |
| Weather Crown Array | orbital-installation | Yes | A distributed orbital system that moderates rainfall, storm tracks, and temperature across the inner cluster. |
| Morrow Granary | orbital-depot | Yes | A rotating reserve cylinder where emergency grain, rations, seed lots, and fertilizer are pooled before interworld distribution. |
| The Cardassian Orchard | remediation-site | Yes | A joint Federation-Cardassian remediation site where damaged soil is rebuilt through fungi, mineral exchange, and mixed orchards rather than K-17 monoculture. |
| Briar Vault | dominion-seed-repository | No | A sealed Dominion seed repository believed to contain parent strains, control chemistry, growth records, and substitute organisms. |

## Travel and routes

Routes carry travel hours, hazards, confidence, and access conditions. The Celandine is fast enough to revisit worlds but not to be everywhere at once. Cargo preparation, landing clearance, shuttle sterilization, crop sampling, and quarantine add operational time beyond warp transit.

| Route | From | To | Hours | Status | Confidence | Visibility |
| --- | --- | --- | --- | --- | --- | --- |
| route.celandine-arda | uss-celandine | arda-ii | 0.25 | stable | verified | public |
| route.verdant-arda | verdant-station | arda-ii | 1.5 | stable | verified | public |
| route.arda-sorell | arda-ii | sorell | 2.0 | stable | verified | public |
| route.arda-weather | arda-ii | weather-crown | 0.6 | stable | verified | public |
| route.weather-verdant | weather-crown | verdant-station | 1.2 | stable | verified | public |
| route.weather-sorell | weather-crown | sorell | 0.8 | conditional | regional | restricted |
| route.verdant-khepri | verdant-station | khepri | 1.8 | stable | verified | public |
| route.verdant-morrow | verdant-station | morrow-granary | 0.7 | stable | verified | public |
| route.morrow-khepri | morrow-granary | khepri | 1.1 | stable | regional | public |
| route.khepri-vela | khepri | vela-nacre | 2.0 | stable | regional | public |
| route.sorell-vela | sorell | vela-nacre | 1.5 | stable | regional | public |
| route.sorell-briar | sorell | briar-vault | 1.5 | restricted | uncertain | directorOnly |
| route.vela-briar | vela-nacre | briar-vault | 1.5 | hazardous | uncertain | restricted |
| route.briar-lysa | briar-vault | lysas-moon | 2.0 | restricted | uncertain | directorOnly |
| route.briar-cinder | briar-vault | cinder-reach | 2.2 | hazardous | local | restricted |
| route.lysa-cinder | lysas-moon | cinder-reach | 1.8 | conditional | regional | restricted |
| route.vela-lysa | vela-nacre | lysas-moon | 1.9 | stable | regional | public |
| route.cinder-orchard | cinder-reach | cardassian-orchard | 0.5 | conditional | verified | restricted |
| route.vela-orchard | vela-nacre | cardassian-orchard | 1.2 | stable | regional | public |
| route.cinder-morrow | cinder-reach | morrow-granary | 2.0 | stable | verified | public |
| route.verdant-sorell | verdant-station | sorell | 1.3 | stable | verified | public |

A route change affects food, not merely travel. Consider reserve movement, transplant viability, cold-chain continuity, worker access, inspection, market price, emergency diversion, smuggling opportunity, and who can verify the manifest.

## Food as a regional system

Each world has current stores, planting windows, processing capacity, transport needs, field ecology, labor constraints, and dependence on particular K-17 functions. A tonne of grain, a clean seed lot, a parent strain, a soil inoculant, a replacement processor, and a medical countermeasure are not interchangeable resources.

Replicators can stabilize a clinic, city district, seed lab, or emergency shelter. They cannot feed the entire cluster indefinitely without prohibitive energy, maintenance, raw material, and transport requirements. The Director should model relief as bridge capacity that protects time for local systems to recover.

## Factions

### Starfleet Relief Command

Federation command coordinating postwar food security, public-health support, and transition away from Dominion dependency.

**Director direction:** Relief Command is internally divided between controlled phaseout, immediate security action, and institutional risk management. Commodore Brand wants a defensible record and may issue destruction orders if control risks become publicly undeniable.

**Goals:** Prevent mass famine; Reduce Dominion control risk; Preserve Starfleet credibility; Leave a reviewable public record.

**Methods:** Relief allocations; specialist teams; replicator support; orders; interfleet coordination.

### Cyradon Food Council

The interworld body coordinating rationing, reserves, cargo priorities, weather data, and planting targets.

**Director direction:** The Council saved lives through emergency centralization and now fears that rapid disclosure or decentralization will collapse distribution before alternatives exist.

**Goals:** Prevent panic and hoarding; Keep interworld distribution functioning; Preserve emergency coordination; Control the planting calendar.

**Methods:** Manifests; reserve depots; public hearings; ration standards; weather access.

### Arda Harvest Directorate

Arda government and agricultural authority responsible for the cluster largest grain terraces and processing network.

**Director direction:** Arda treats K-17 as the material basis of legitimacy. It will accept safeguards but resists policies that imply its wartime recovery was fraudulent or reckless.

**Goals:** Protect the grain harvest; Maintain export leadership; Avoid panic; Keep processing infrastructure operating.

**Methods:** Storage; processing towers; security services; bulk transports; public messaging.

### Khepri Seed Cooperatives

Dryland farming cooperatives preserving heritage seed, local water governance, and community seed-law traditions.

**Director direction:** The cooperatives are serious practitioners, not nostalgic anti-technology actors. They need water, equipment, and time to turn heritage stock into regional alternatives.

**Goals:** Preserve seed lineage; Retain local custody; Expand drought resilience; Avoid outside patent or requisition.

**Methods:** Seed libraries; farmer networks; reservoir councils; dryland expertise.

### Sorell Allocation Authority

The rationing and harvest bureaucracy that controls protein-vine seed, food access, employment records, and urban distribution.

**Director direction:** The Authority prevented starvation and turned emergency allocation into domestic political power. It will frame open seed access as an attack on order.

**Goals:** Prevent ration collapse; Retain administrative control; Suppress black markets; Avoid exposure of patronage records.

**Methods:** Ration registry; urban security; processing plants; employment access; broadcast media.

### Vela Wetland Stewardship

A federation of coastal communities, scientists, and fishery cooperatives managing K-17-rooted wetlands.

**Director direction:** Vela seeks ecological continuity and the right to retain dangerous biotechnology under transparent supervision if removal would cause greater harm.

**Goals:** Prevent wetland collapse; Protect fisheries and settlements; Retain local ecological authority; Build slow transition capacity.

**Methods:** Wetland crews; marine labs; local boats; toxin-monitoring network.

### Free Seed League

A loose network of farmers, geneticists, and cooperatives demanding open seed access, local planting authority, and public testing.

**Director direction:** The League contains careful reformers and militants. Its decentralized structure makes it hard to negotiate with and easy to misrepresent.

**Goals:** End monopoly seed control; Publish testing standards; Protect farmer custody; Accelerate alternatives.

**Methods:** Farmer networks; seed exchanges; public demonstrations; informal laboratories.

### Cardassian Reconstruction Mission

A small technical mission contributing soil science, occupation records, and remediation expertise.

**Director direction:** Its expertise is indispensable and politically toxic. Members must not be treated as a monolithic continuation of Cardassian state policy.

**Goals:** Repair damaged soils; Contribute records; Build accountable cooperation; Protect staff from retaliation.

**Methods:** Soil engineers; occupation archives; remediation cultures; liaison channels.

### Grayleaf Volunteers

Farmers, clinicians, and scientists testing a Federation-Cardassian substitute crop under public consent rules.

**Director direction:** Grayleaf is viable but lower yielding and causes a serious immune response in a small exposed population. The volunteers reject both propaganda and panic.

**Goals:** Complete credible trials; Protect volunteers; Publish adverse data; Scale only when capacity exists.

**Methods:** Trial fields; participant network; medical records; clean soil.

### Cinder Reach Transport Union

Dock crews, tug operators, processors, and freight cooperatives who move fertilizer, seed, rations, and machinery.

**Director direction:** The union is not inherently illicit. It resists security measures that make workers bear all delay and liability while officials retain discretion.

**Goals:** Keep cargo moving; Protect workers; Secure predictable inspection; Prevent insurance collapse.

**Methods:** Freighters; dock labor; repair yards; cargo intelligence; industrial feedstock.

### Dominion Biotech Holdouts

Former administrators, coerced technicians, opportunists, and stranded specialists retaining pieces of K-17 control knowledge.

**Director direction:** This is a category, not one conspiracy. Some seek survival or employment, some sell control compounds, and some still believe centralized management is rational.

**Goals:** Preserve access to K-17 systems; Avoid prosecution or irrelevance; Control valuable knowledge; Exploit instability where profitable.

**Methods:** Access codes; chemical recipes; hidden storage; black-market brokers.

## Autonomous fronts

### Harvest Deadline

Planting and storage windows continue while the ship investigates and negotiates.

- Stage 0: Planning remains flexible
- Stage 1: Commitments narrow options
- Stage 2: Emergency planting dominates policy
- Stage 3: Missed harvest creates regional scarcity

### Biological Integration

K-17 markers and control chemistry continue moving through diet, soil, water, animals, and medical systems.

- Stage 0: Markers are detectable but poorly understood
- Stage 1: Control-linked anomalies appear
- Stage 2: Multiple systems respond
- Stage 3: Regional control event becomes possible

### Transition Capacity

Clean seed, soil preparation, training, processing, and reserve capacity accumulate or stall.

- Stage 0: Pilot work is isolated
- Stage 1: First viable lots emerge
- Stage 2: Multiple worlds can transition
- Stage 3: Regional alternatives become durable

### Emergency Seed Power

The Food Council and planetary authorities convert crisis management into durable control over seed, rationing, data, and movement.

- Stage 0: Emergency authority is accepted
- Stage 1: Appeals weaken
- Stage 2: Seed and ration power centralizes
- Stage 3: Permanent managed dependency forms

### Sabotage and Retaliation

Militants, frightened officials, thieves, and opportunists escalate attacks on fields, labs, transports, workers, and records.

- Stage 0: Threats and theft remain isolated
- Stage 1: Targeted attacks disrupt work
- Stage 2: Retaliation becomes organized
- Stage 3: Regional transport and science fracture

### Ecological Lock-In

K-17 becomes harder to remove as altered microbiomes, wetlands, livestock, and processing systems depend on it.

- Stage 0: Dependencies are local
- Stage 1: Removal causes serious harm
- Stage 2: Multiple ecosystems cannot transition on one timetable
- Stage 3: Permanent lock-in or ecological collapse

### Briar Vault Custody

Factions seek the parent strains, control chemistry, and records needed to shape the transition.

- Stage 0: The vault is rumor
- Stage 1: Access routes become known
- Stage 2: Competing teams mobilize
- Stage 3: One actor gains unaccountable custody

### Celandine Command Succession

Dorel quarantine, player acting command, Sorell expectation, medical authority, and Starfleet review continue independently of the foreground quest.

- Stage 0: Acting command is provisional
- Stage 1: Player authority becomes operationally central
- Stage 2: Dorel limited return creates shared authority pressure
- Stage 3: A durable command outcome is required

## Quest availability

The opening quarantine is active. Two standing operational frames are available. Resolving the prelude opens the cluster and its designed side work. The four Arc I world cases may be pursued in different orders. Later work is unlocked by evidence, completed cases, assets, faction access, and regional conditions rather than a universal chapter number.

A quest may be completed, failed, abandoned, transformed, delegated where permitted, or rendered irrelevant by a later solution. The Director re-evaluates availability after every committed outcome, threshold, or material discovery.

## Delegation

Delegation requires a suitable officer, access, time, transport, local partner, and policy. Delegated work inherits current quarantine rules, scientific evidence threshold, distribution doctrine, security posture, public-disclosure policy, and seed-custody regime. A security-heavy team may secure stock while damaging cooperation; a civic partnership may improve legitimacy while accepting slower control or less centralized evidence.

## Calm content

Pollinator restoration, irrigation and weather repair, cultural food work, seed-library stewardship, and ordinary market disputes must be allowed to remain ordinary. They still matter: calm assignments create trust, biological redundancy, technical capacity, cultural continuity, and allies for the finale. Do not convert every problem into sabotage or hidden Dominion control.

## Thread engine

The package supplies 14 templates covering command succession, professional confidence, scientific guilt, medical boundaries, logistics candor, security posture, cultural continuity, seed ownership, quarantine fatigue, and ordinary harvest life. Threads require observable evidence. Most remain conversations, callbacks, vignettes, or compact complications; they become formal assignments only when persistent command action is required.

## Finale assembly

`Enemy's Garden` reads:

- every world food and crop condition;
- current planting and transport clocks;
- biomarker and control-bloom evidence;
- alternative crop and processing capacity;
- seed-custody and public-verification institutions;
- ecological health and remediation assets;
- faction posture, local legitimacy, and sabotage level;
- Celandine condition, clean stock, cargo, shuttles, and crew confidence;
- Dorel medical and legal status;
- unresolved obligations, delegated work, and refused requests.

The finale may contain simultaneous crop response, field failure, seizure, attack, ecological breakdown, transport disruption, and succession pressure, but it does not require one fixed final battle. The player assigns responsibility and commits a planting doctrine that existing institutions must be able to carry out.

## End-condition architecture

The package defines authored completion, player death, permanent command removal, ship loss with or without objective preservation, mass famine, control-bloom catastrophe, ecological collapse, transition collapse, public-legitimacy collapse, captured seed authority, resignation or transfer, and player-chosen conclusion. Completion bands distinguish food security, autonomy, ecology, sovereignty, public legitimacy, and command continuity rather than reducing the campaign to one morality score.
