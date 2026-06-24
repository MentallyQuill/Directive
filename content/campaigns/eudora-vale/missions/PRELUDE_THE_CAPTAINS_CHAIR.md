# Prelude: The Captain's Chair

This is the authored tactical graph for `prelude-the-captains-chair`. It fixes the situation and phase logic while preserving freeform player intent and non-menu solutions.

## Mission contract

- Package: `directive:campaign-package:eudora-vale-broken-accord`
- Campaign: `broken-accord`
- Entry phase: `phase.approach-crown`
- Completion event: `quest.prelude-the-captains-chair.resolved`
- Single-check failure may not end the mission.
- Refusal and withdrawal remain valid consequential actions.
- The Director never writes the player character.

# Phases

## Approach to Crown Station

- **Phase ID:** `phase.approach-crown`
- **Location:** `eudora-vale`
- **Freeform intent:** allowed

The player runs the approach briefing as principal mission commander while Captain Rhee retains the chair and the ship reviews contradictory lattice telemetry.

### Objectives

- Establish the review mission posture.
- Identify deflector and shuttle limits.
- Separate official telemetry from raw anomalies.

### Pressures

- Crown Station requests a demonstration sync.
- Fenn reports coupler variance.
- Rhee expects the XO to lead the operational briefing.

### Exits

- To `phase.surge-and-rupture` when `{"type": "eventOccurred", "eventType": "mission.approach-briefing-complete"}`
## The Lattice Surges

- **Phase ID:** `phase.surge-and-rupture`
- **Location:** `crown-station`
- **Freeform intent:** allowed

A phase inversion ruptures a maintenance habitat, throws traffic off stable lanes, and begins transferring uncontrolled load toward multiple worlds.

### Objectives

- Protect the ruptured habitat.
- Clear civilian traffic.
- Establish which node loads can be shed or bridged.

### Pressures

- Gravity and life support fail in different sections.
- Public and raw telemetry disagree.
- The ship can synchronize only briefly.

### Exits

- To `phase.rhees-shuttle` when `{"type": "eventOccurred", "eventType": "mission.evacuation-plan-committed"}`
## Rhee Takes the Shuttle

- **Phase ID:** `phase.rhees-shuttle`
- **Location:** `crown-station`
- **Freeform intent:** allowed

Captain Rhee leads the final shuttle extraction while the player commands the Eudora Vale, transporters, traffic control, and load response.

### Objectives

- Coordinate the shuttle corridor.
- Transport the final evacuees.
- Prevent the station from becoming a debris cascade.

### Pressures

- The shuttle corridor narrows.
- Kel must commit a vector with incomplete data.
- The ship cannot both reinforce every shield and maintain full transport lock.

### Exits

- To `phase.secondary-inversion` when `{"type": "eventOccurred", "eventType": "mission.final-evacuees-clear"}`
## The Captain Falls

- **Phase ID:** `phase.secondary-inversion`
- **Location:** `eudora-vale`
- **Freeform intent:** allowed

A secondary inversion destroys Rhee's shuttle after the final evacuees transport clear. The player must keep the system response moving while the bridge confirms command succession.

### Objectives

- Confirm casualties and chain of command.
- Maintain active rescue and load control.
- Issue immediate standing orders.

### Pressures

- The crew has no time for a full memorial response.
- Regional authorities demand a public explanation.
- The next load transfer requires a captain's authorization.

### Exits

- To `phase.opening-load-shed` when `{"type": "eventOccurred", "eventType": "mission.succession-acknowledged"}`
## The First Allocation

- **Phase ID:** `phase.opening-load-shed`
- **Location:** `crown-station`
- **Freeform intent:** allowed

The acting captain must choose how to stabilize the linked system: shed load to a world, risk the ship as a bridge, accept station loss, or construct another defensible plan.

### Objectives

- Commit the first emergency allocation.
- Name who carries the cost.
- Preserve a record of the decision and uncertainty.

### Pressures

- Every option has planetary or ship consequences.
- The replacement captain clock begins politically, not mechanically.
- The crew watches how command handles uncertainty.

### Exits

- To `phase.acting-captain` when `{"type": "eventOccurred", "eventType": "mission.opening-allocation-committed"}`
## Acting Captain

- **Phase ID:** `phase.acting-captain`
- **Location:** `eudora-vale`
- **Freeform intent:** allowed

With immediate casualties stabilized or transformed into continuing emergencies, the player defines the Acting XO arrangement, reporting line, evidence posture, and first regional priorities.

### Objectives

- Appoint or define executive coverage.
- Report Rhee's death and acting command.
- Select immediate follow-up work without freezing the wider system.

### Pressures

- Crew grief and operational demand coexist.
- Osei needs a documented succession record.
- Several worlds already request priority.

### Exits

- Terminal phase after a committed outcome.

# Command decision points

## The First Sacrifice

- **Decision ID:** `decision.opening-load-shed`
- **Phase:** `phase.opening-load-shed`
- **Pause type:** `commandDecision`
- **Freeform solutions:** required

How will the Eudora Vale stop the opening surge, and which population, system, or ship capability will carry the immediate cost?

**Stakes:** Civilian survival, Planetary consequences, Ship deflector margin, Public legitimacy

**Consequence domains:** lattice-integrity, distribution-equity, resource-reserves, crew-command-confidence
## Executive Coverage

- **Decision ID:** `decision.acting-xo`
- **Phase:** `phase.acting-captain`
- **Pause type:** `commandDecision`
- **Freeform solutions:** required

Who will exercise Acting XO authority, and what decisions may they make without returning every issue to the new captain?

**Stakes:** Bridge continuity, Delegation, Senior-staff confidence, Independent dissent

**Consequence domains:** crew-command-confidence, command-culture, thread.ren-acting-xo

# Failure and recovery

Failure should produce one or more of: damage, delay, exposure, lost leverage, injury, harder route, transformed objective. Senior-crew death requires established lethal conditions, meaningful command response, and narrative weight.
