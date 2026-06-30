import {
  CONTINUITY_VISIBILITY,
  asArray,
  compact,
  createContinuityFact
} from '../fact-schema.mjs';

function currentLocationId(campaignState, packageData) {
  return compact(
    campaignState?.worldState?.currentLocationId
    || campaignState?.mission?.locationId
    || campaignState?.attentionState?.scene?.locationId
    || packageData?.world?.openingLocationId
  );
}

function routeForLocation(packageData, locationId) {
  return asArray(packageData?.world?.routes).find((route) => route?.from === locationId || route?.to === locationId) || null;
}

function projectionStringIncludes(campaignProjection, needle) {
  const lowerNeedle = String(needle || '').toLowerCase();
  const seen = new Set();
  const stack = [campaignProjection];
  while (stack.length) {
    const value = stack.pop();
    if (!value || seen.has(value)) continue;
    if (typeof value === 'object') seen.add(value);
    if (typeof value === 'string' && value.toLowerCase().includes(lowerNeedle)) return compact(value);
    if (Array.isArray(value)) stack.push(...value);
    else if (value && typeof value === 'object') stack.push(...Object.values(value));
  }
  return '';
}

export function materializeShipTravelFacts({
  packageData = null,
  campaignState = null,
  campaignProjection = null
} = {}) {
  const packageId = packageData?.manifest?.id || campaignState?.campaign?.packageId || null;
  const shipId = packageData?.ship?.id || campaignState?.ship?.id || 'ship';
  const subject = `ship.${shipId}.travel`;
  const locationId = currentLocationId(campaignState, packageData);
  const route = routeForLocation(packageData, locationId);
  const travelContinuity = packageData?.ship?.travelContinuity || {};
  const startingFrame = compact(packageData?.crew?.relationshipModel?.startingFrame);
  const yardLocation = compact(packageData?.ship?.serviceHistory?.yardPeriod?.location);
  const openingCondition = compact(packageData?.ship?.openingCondition);
  const projectionTransit = projectionStringIncludes(campaignProjection, 'Utopia Planitia')
    || projectionStringIncludes(campaignProjection, 'several weeks');
  const facts = [];

  if (openingCondition || yardLocation) {
    facts.push(createContinuityFact({
      id: `${subject}.utopia-refit-origin`,
      kind: 'ship.travel',
      subject,
      predicate: 'originContext',
      value: { openingCondition, yardLocation },
      summary: `The Breckenridge returned to service after its Utopia Planitia refit before the opening transit.`,
      render: {
        narrator: `The Breckenridge returned to service after its Utopia Planitia refit before the opening transit.`,
        director: `Origin context: ${openingCondition || yardLocation}`
      },
      source: { type: 'campaignPackage', packageId, path: 'ship.openingCondition' },
      authority: 'package',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'hard',
      tags: ['ship', 'travel', 'utopia-planitia', 'origin']
    }));
  }

  if (startingFrame) {
    facts.push(createContinuityFact({
      id: `${subject}.crew-underway-duration`,
      kind: 'ship.travel',
      subject,
      predicate: 'crewUnderwayDuration',
      value: startingFrame,
      summary: startingFrame,
      render: {
        narrator: startingFrame,
        director: startingFrame
      },
      source: { type: 'campaignPackage', packageId, path: 'crew.relationshipModel.startingFrame' },
      authority: 'package',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'hard',
      tags: ['ship', 'travel', 'duration', 'crew']
    }));
  }

  if (route) {
    facts.push(createContinuityFact({
      id: `${subject}.current-route`,
      kind: 'ship.travel',
      subject,
      predicate: 'currentRoute',
      value: {
        locationId,
        routeId: route.id,
        from: route.from,
        to: route.to,
        travelHours: route.travelHours,
        playerSummary: route.playerSummary
      },
      summary: route.playerSummary || `Current route ${route.id}.`,
      render: {
        narrator: route.playerSummary || `Current route ${route.id}.`,
        director: `${route.id}: ${route.from} -> ${route.to}, ${route.travelHours} hours.`
      },
      source: { type: 'campaignPackage', packageId, path: `world.routes.${route.id}` },
      authority: 'package',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'hard',
      tags: ['ship', 'travel', 'route', route.id, locationId]
    }));
  }

  if (compact(travelContinuity.openingTransitMode) || compact(travelContinuity.openingImpulseContext)) {
    facts.push(createContinuityFact({
      id: `${subject}.opening-transit-mode`,
      kind: 'ship.travel',
      subject,
      predicate: 'openingTransitMode',
      value: {
        mode: travelContinuity.openingTransitMode || null,
        impulseContext: travelContinuity.openingImpulseContext || null,
        shuttleApproach: travelContinuity.openingShuttleApproach || null,
        baselineRemainingTravel: travelContinuity.baselineRemainingTravel || null,
        baselineRemainingDistance: travelContinuity.baselineRemainingDistance || null,
        speedPolicy: travelContinuity.speedPolicy || null
      },
      summary: travelContinuity.openingTransitMode || travelContinuity.openingImpulseContext,
      render: {
        narrator: [
          travelContinuity.openingTransitMode,
          travelContinuity.openingImpulseContext,
          travelContinuity.openingShuttleApproach,
          travelContinuity.baselineRemainingTravel,
          travelContinuity.baselineRemainingDistance,
          travelContinuity.speedPolicy
        ].map(compact).filter(Boolean).join(' '),
        director: [
          travelContinuity.openingTransitMode,
          travelContinuity.openingImpulseContext,
          travelContinuity.openingShuttleApproach,
          travelContinuity.baselineRemainingTravel,
          travelContinuity.baselineRemainingDistance,
          travelContinuity.speedPolicy
        ].map(compact).filter(Boolean).join(' ')
      },
      source: { type: 'campaignPackage', packageId, path: 'ship.travelContinuity' },
      authority: 'package',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'hard',
      tags: ['ship', 'travel', 'warp', 'impulse', 'rendezvous']
    }));
  }

  if (projectionTransit) {
    facts.push(createContinuityFact({
      id: `${subject}.projection-transit-context`,
      kind: 'ship.travel',
      subject,
      predicate: 'projectionTransitContext',
      value: projectionTransit,
      summary: projectionTransit,
      render: {
        narrator: projectionTransit,
        director: projectionTransit
      },
      source: { type: 'campaignProjection', packageId, path: 'projection.transitContext' },
      authority: 'projection',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'high',
      tags: ['ship', 'travel', 'projection', 'utopia-planitia']
    }));
  }

  if (facts.some((fact) => fact.id.endsWith('.opening-transit-mode') || fact.id.endsWith('.crew-underway-duration'))) {
    facts.push(createContinuityFact({
      id: `${subject}.not-six-days-impulse`,
      kind: 'ship.travel.constraint',
      subject,
      predicate: 'invalidSixDayImpulseClaim',
      value: 'not-six-days-impulse-from-utopia',
      summary: `Do not describe the opening Breckenridge transit as six days at impulse from Utopia Planitia.`,
      render: {
        narrator: `Do not describe the opening Breckenridge transit as six days at impulse from Utopia Planitia; use the structured underway, rendezvous, and final-approach facts instead.`,
        director: `Contradiction guard: reject claims that the Breckenridge has been at impulse for six days since leaving Utopia Planitia.`
      },
      source: { type: 'continuityMatrix', packageId, path: 'ship.travelContinuity + crew.relationshipModel.startingFrame' },
      authority: 'campaignState',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'hard',
      tags: ['ship', 'travel', 'contradiction-guard', 'impulse']
    }));
    facts.push(createContinuityFact({
      id: `${subject}.not-short-refit-duration`,
      kind: 'ship.travel.constraint',
      subject,
      predicate: 'invalidShortRefitDurationClaim',
      value: 'not-three-days-out-of-refit',
      summary: `Do not describe the opening Breckenridge transit as only three days out of Utopia Planitia, spacedock, drydock, the yard, or a refit cradle; the crew has been underway together for twenty-five days before the player joins.`,
      render: {
        narrator: `Do not describe the opening Breckenridge transit as only three days out of Utopia Planitia, spacedock, drydock, the yard, or a refit cradle; the crew has been underway together for twenty-five days before the player joins.`,
        director: `Contradiction guard: reject claims that the Breckenridge is only three days out of Utopia Planitia, spacedock, drydock, the yard, or a refit cradle at the opening.`
      },
      source: { type: 'continuityMatrix', packageId, path: 'ship.travelContinuity + crew.relationshipModel.startingFrame' },
      authority: 'campaignState',
      visibility: CONTINUITY_VISIBILITY.narratorSafe,
      criticality: 'hard',
      tags: ['ship', 'travel', 'contradiction-guard', 'refit-duration']
    }));
  }

  return facts;
}
