# Chapter 1: Aster Basin


## Aster Basin

**ID:** `chapter-1-aster-basin`  
**Kind:** main  
**Typical duration:** three to five sessions  
**Priority:** 94  
**Calm content:** No  
**Delegation:** Player-led

### Player-facing premise

Make first sustained contact with the Drift Concord while a failing habitat tether, undocumented refugee traffic, and the risk of exposing a hidden civilian capital compete for command attention.

### Dramatic question

Can Starfleet help a concealed community without turning recognition into surveillance?

### Anchors

- Locations: quiet-shelf, aster-basin, lantern-span
- Actors: lira-quell, senn-arv
- Factions: drift-concord, starfleet-survey-command

### Objectives

- Reach Aster Basin without disclosing its coordinates to unauthorized traffic.
- Stabilize or evacuate the failing habitat tether.
- Establish terms for medical access, route exchange, and Starfleet presence.
- Determine how refugee and asylum traffic will be documented, if at all.
- Leave Aster Basin with an explicit relationship and chart-custody posture.

### Active pressures

- The habitat tether will fail whether or not political talks are complete.
- Starfleet Survey Command expects usable positional data and a verified population estimate.
- The Drift Concord has reason to fear Kheled inspection, Crown predation, and Federation administrative exposure.
- The Glass Harbor cannot remain indefinitely without neglecting other Reef pressures.

### Required revelations

- Aster Basin’s secrecy is not merely criminal evasion; it protects refugees and politically unrecognized communities.
- Local pilots maintain route knowledge through distributed embodied practice that cannot be reduced to one static chart.
- Rhos sent a narrowband contact request to Aster shortly before the inversion but did not transmit the basin’s coordinates.
- The failing tether can be repaired, replaced, cut, or evacuated through several viable approaches with different exposure costs.

Each revelation permits alternate causal routes. No scene is mandatory merely because it was anticipated during authoring.

### Valid approaches

- Negotiate a protected survey compact with local custody of exact coordinates.
- Record full Starfleet charts under sealed or compartmented access.
- Use local pilots and temporary buoy keys without retaining a complete route.
- Prioritize engineering rescue and postpone political recognition.
- Treat Aster as an unregistered hazard zone and insist on formal inspection, accepting resistance or withdrawal.

### Outcome families

### recognized-sanctuary

Aster gains provisional recognition, retains route custody, and accepts defined Starfleet humanitarian access.

  - `adjustTrack`: trackId=chart-exposure, amount=-1
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `adjustTrack`: trackId=crew-succession-confidence, amount=1
  - `grantAsset`: assetId=drift-pilots, title=Drift Pilot Network, playerSummary=Trusted local pilots can guide missions and validate route changes.
  - `revealFact`: factId=fact.rhos-contacted-aster, summary=Rhos contacted Aster Basin shortly before disappearing but withheld its coordinates., tags=['rhos', 'aster']
### monitored-access

Aster accepts Starfleet support under a monitored-access agreement, improving rescue capacity while leaving deep mistrust.

  - `adjustTrack`: trackId=chart-exposure, amount=1
  - `adjustTrack`: trackId=civilian-strain, amount=-1
  - `grantAsset`: assetId=aster-medical-relay, title=Aster Medical Relay, playerSummary=Aster’s clinic network can coordinate civilian triage and evacuation.
  - `revealFact`: factId=fact.rhos-contacted-aster, summary=Rhos contacted Aster Basin shortly before disappearing but withheld its coordinates., tags=['rhos', 'aster']
### coordinates-recorded

Starfleet obtains a complete chart and population record; immediate rescue improves, but Aster becomes vulnerable to external reach.

  - `adjustTrack`: trackId=chart-exposure, amount=2
  - `adjustTrack`: trackId=civilian-strain, amount=-2
  - `adjustTrack`: trackId=kheled-intervention, amount=1
  - `setFlag`: flagId=aster-full-chart-starfleet, value=True
### confrontation

The emergency is only partly contained and first contact ends in withdrawal, coercion, or damaged trust.

  - `adjustTrack`: trackId=civilian-strain, amount=1
  - `adjustTrack`: trackId=crew-succession-confidence, amount=-1
  - `setFlag`: flagId=aster-contact-damaged, value=True

### Failure-forward handling

A failed action should change route confidence, ship condition, access, relationships, evidence quality, elapsed time, civilian risk, or faction leverage. It should never erase the only path to a required revelation. Withdrawal or refusal remains valid and changes offscreen world state.
