# Chapter 1: Bread and Weather

This is the authored tactical graph for `chapter-1-bread-and-weather`. It fixes the situation and phase logic while preserving freeform player intent and non-menu solutions.

## Mission contract

- Package: `directive:campaign-package:eudora-vale-broken-accord`
- Campaign: `broken-accord`
- Entry phase: `phase.solis-arrival`
- Completion event: `quest.chapter-1-bread-and-weather.resolved`
- Single-check failure may not end the mission.
- Refusal and withdrawal remain valid consequential actions.
- The Director never writes the player character.

# Phases

## Solis Terraces

- **Phase ID:** `phase.solis-arrival`
- **Location:** `solis-terraces`
- **Freeform intent:** allowed

The Eudora Vale reaches Aurelia's climate-controlled grain terraces as humidity collapses, towers shed waste heat, and farm traffic crowds emergency corridors.

### Objectives

- Establish local command relationships.
- Map immediate crop and worker risk.
- Compare Aurelian demand with system consequences.

### Pressures

- The harvest window is short.
- Public pressure favors maximum intervention.
- Pelagos warns against an unrestricted moisture draw.

### Exits

- To `phase.terrace-rescue` when `{"type": "eventOccurred", "eventType": "mission.solis-command-established"}`
## The Towers Fail

- **Phase ID:** `phase.terrace-rescue`
- **Location:** `solis-terraces`
- **Freeform intent:** allowed

Workers, seed vaults, and climate towers require simultaneous rescue while heat and moisture loads move into other parts of the lattice.

### Objectives

- Protect workers and seed vaults.
- Stabilize enough towers to preserve options.
- Prevent heat shed from becoming a Ferrum or Nacre emergency.

### Pressures

- Shuttles cannot cover every tower.
- Fabrication parts are finite.
- A rapid moisture draw creates a delayed Pelagic surge.

### Exits

- To `phase.load-audit` when `{"type": "eventOccurred", "eventType": "mission.terrace-life-safety-stabilized"}`
## The Cost of Rain

- **Phase ID:** `phase.load-audit`
- **Location:** `solis-terraces`
- **Freeform intent:** allowed

Science, engineering, and local records produce several technically viable rescue allocations with different external costs and confidence levels.

### Objectives

- Establish actual moisture and heat requirements.
- Identify who is omitted from the official request.
- Prepare a command recommendation with uncertainty.

### Pressures

- Minister Iven wants a decisive answer.
- The public model normalizes Aurelian priority.
- Every delay reduces crop recovery.

### Exits

- To `phase.crop-rescue-allocation` when `{"type": "eventOccurred", "eventType": "mission.load-audit-complete"}`
## Bread and Weather

- **Phase ID:** `phase.crop-rescue-allocation`
- **Location:** `solis-terraces`
- **Freeform intent:** allowed

The acting captain authorizes a crop rescue, partial stabilization, rationed moisture draw, evacuation, or another plan and determines how the intervention will be recorded.

### Objectives

- Commit the operational plan.
- Account for Pelagos, Ferrum, Nacre, and ship stores.
- Set public telemetry and review conditions.

### Pressures

- Food security is real.
- The visible beneficiary is politically powerful.
- The delayed cost may arrive elsewhere after the ship departs.

### Exits

- To `phase.aurelian-aftermath` when `{"type": "eventOccurred", "eventType": "mission.crop-allocation-committed"}`
## The Harvest Ledger

- **Phase ID:** `phase.aurelian-aftermath`
- **Location:** `aurelia`
- **Freeform intent:** allowed

The mission closes with saved or lost crops, named costs, changed stores, and a public record that shapes later cooperation.

### Objectives

- Record crop and casualty outcome.
- Commit resource and trust changes.
- Identify follow-up obligations.

### Pressures

- Aurelia will cite the decision later.
- Pelagos and Nacre respond to how costs were acknowledged.
- Crew judges whether command made uncertainty visible.

### Exits

- Terminal phase after a committed outcome.

# Command decision points

## Who Receives the Rain

- **Decision ID:** `decision.crop-rescue-allocation`
- **Phase:** `phase.crop-rescue-allocation`
- **Pause type:** `commandDecision`
- **Freeform solutions:** required

What mix of moisture, heat transfer, local repair, ship fabrication, rationing, and accepted crop loss will the Eudora Vale authorize?

**Stakes:** Food security, Pelagic sea level, Ferrum heat balance, Nacre burden, Ship stores

**Consequence domains:** lattice-integrity, distribution-equity, resource-reserves, public-legitimacy

# Failure and recovery

Failure should produce one or more of: damage, delay, exposure, lost leverage, injury, harder route, transformed objective. Senior-crew death requires established lethal conditions, meaningful command response, and narrative weight.
