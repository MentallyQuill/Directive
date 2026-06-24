# Chapter 2: The Weight of Water

This is the authored tactical graph for `chapter-2-the-weight-of-water`. It fixes the situation and phase logic while preserving freeform player intent and non-menu solutions.

## Mission contract

- Package: `directive:campaign-package:eudora-vale-broken-accord`
- Campaign: `broken-accord`
- Entry phase: `phase.pelagic-warning`
- Completion event: `quest.chapter-2-the-weight-of-water.resolved`
- Single-check failure may not end the mission.
- Refusal and withdrawal remain valid consequential actions.
- The Director never writes the player character.

# Phases

## Pelagic Warning

- **Phase ID:** `phase.pelagic-warning`
- **Location:** `pelagos`
- **Freeform intent:** allowed

The Caldera Array reports rapid sea-level oscillation while Crown Station continues demanding exports under an obsolete population model.

### Objectives

- Establish current water and population data.
- Open channels with floating-city councils.
- Identify immediate storm-surge zones.

### Pressures

- Several communities are missing from the official census.
- Export schedules are already committed elsewhere.
- Storm season limits safe operating windows.

### Exits

- To `phase.storm-rescue` when `{"type": "eventOccurred", "eventType": "mission.pelagic-zone-mapped"}`
## The Rising Shelf

- **Phase ID:** `phase.storm-rescue`
- **Location:** `caldera-array`
- **Freeform intent:** allowed

Floating districts, transfer platforms, and deep-water systems enter different phases of the surge as the Eudora Vale coordinates rescue and ballast control.

### Objectives

- Protect omitted communities.
- Prevent platform collision or capsize.
- Preserve the Array as usable infrastructure.

### Pressures

- Atmospheric transporters are intermittent.
- Stopping exports abruptly affects Aurelia.
- Local pilots demand authority over approaches.

### Exits

- To `phase.census-discrepancy` when `{"type": "eventOccurred", "eventType": "mission.pelagic-life-safety-stabilized"}`
## The Missing Cities

- **Phase ID:** `phase.census-discrepancy`
- **Location:** `caldera-array`
- **Freeform intent:** allowed

The ship verifies that the export formula counts abandoned settlements and omits newer floating cities, making its precision politically obsolete.

### Objectives

- Authenticate current population and capacity data.
- Determine whether emergency correction is technically safe.
- Prepare options for export control and future census authority.

### Pressures

- The Secretariat warns against unilateral formula changes.
- Pelagic communities threaten platform occupation.
- Every hour of export changes downstream weather.

### Exits

- To `phase.water-export-control` when `{"type": "eventOccurred", "eventType": "mission.census-discrepancy-established"}`
## The Weight of Water

- **Phase ID:** `phase.water-export-control`
- **Location:** `pelagos`
- **Freeform intent:** allowed

The acting captain chooses whether to halt, reduce, reroute, or continue exports and determines who has standing to set provisional quotas.

### Objectives

- Commit the export plan.
- Set a census or quota review process.
- Protect communities and downstream recipients.

### Pressures

- A technically safe average may drown a specific city.
- A short-term halt can damage Aurelian crops.
- Enforcement may convert water infrastructure into a security front.

### Exits

- To `phase.pelagic-settlement` when `{"type": "eventOccurred", "eventType": "mission.water-export-decision-committed"}`
## A New Ledger

- **Phase ID:** `phase.pelagic-settlement`
- **Location:** `pelagos`
- **Freeform intent:** allowed

The mission records survivors, export status, platform condition, census legitimacy, and obligations that persist into later allocation negotiations.

### Objectives

- Commit the Pelagic outcome.
- Name remaining storm and export risks.
- Record whether Salt Debt becomes available or urgent.

### Pressures

- The storm continues according to established weather.
- Other worlds respond to reduced or continued exports.
- Local cooperation depends on how omitted communities were treated.

### Exits

- Terminal phase after a committed outcome.

# Command decision points

## Control the Export

- **Decision ID:** `decision.water-export-control`
- **Phase:** `phase.water-export-control`
- **Pause type:** `commandDecision`
- **Freeform solutions:** required

How will the Eudora Vale protect Pelagic communities while accounting for the worlds that depend on continued water vapor transfer?

**Stakes:** Floating-city survival, Aurelian crops, Quota legitimacy, Platform control, Long-term water rights

**Consequence domains:** distribution-equity, public-legitimacy, ecological-continuity, nacre-secession-pressure

# Failure and recovery

Failure should produce one or more of: damage, delay, exposure, lost leverage, injury, harder route, transformed objective. Senior-crew death requires established lethal conditions, meaningful command response, and narrative weight.
