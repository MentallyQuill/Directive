import fs from 'node:fs';
import path from 'node:path';

import {
  ensureDirectory,
  sha256Text,
  writeJsonFile
} from './sillytavern-live-harness.mjs';
import { starfleetUniformFactForCrew } from '../../../src/starfleet/uniforms.mjs';

export const FACT_CANARY_PACK_KIND = 'directive.liveCampaignSoak.factualCanaryPack';
export const FACT_CANARY_INDEX_KIND = 'directive.liveCampaignSoak.factualCanaryIndex';

function readJson(rootDir, relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(rootDir, relativePath), 'utf8'));
}

function fileExists(rootDir, relativePath) {
  return Boolean(relativePath) && fs.existsSync(path.resolve(rootDir, relativePath));
}

function jsonPointer(...parts) {
  return `#/${parts.map((part) => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}

function slugFor(value = 'campaign') {
  return String(value || 'campaign')
    .toLowerCase()
    .replace(/^directive:campaign-package:/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'campaign';
}

function compactText(value, fallback = '') {
  return String(value || fallback || '').replace(/\s+/g, ' ').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sourcePointer(sourcePath, pointer, note = null) {
  return { path: sourcePath, pointer, note };
}

function ageContradictionWatchlist(name, ageDescription) {
  const age = compactText(ageDescription).toLowerCase();
  if (!name || !age) return [];
  const contradictions = [`${name} must not be given a contradictory age band.`];
  if (/\b47\b|late forties/.test(age)) {
    contradictions.push(
      `${name} is in her early fifties`,
      `${name} is in his early fifties`,
      `${name} is in their early fifties`,
      `${name}, early fifties`,
      `${name}, a fifty-year-old`,
      'early fifties',
      'early-50s'
    );
  }
  if (/fift/i.test(age)) {
    contradictions.push(`${name}, a 40-year-old`, `${name}, a forty-year-old`);
  }
  if (/thirt/i.test(age)) {
    contradictions.push(`${name}, a fifty-year-old`, `${name}, early fifties`);
  }
  return [...new Set(contradictions)];
}

function packageSeniorCrew(packageData) {
  if (Array.isArray(packageData?.crew?.senior)) {
    return { key: 'senior', records: packageData.crew.senior };
  }
  if (Array.isArray(packageData?.crew?.seniorStaff)) {
    return { key: 'seniorStaff', records: packageData.crew.seniorStaff };
  }
  return { key: 'senior', records: [] };
}

function crewNameById(packageData) {
  const map = new Map();
  const { records } = packageSeniorCrew(packageData);
  for (const officer of records) {
    if (officer?.id && officer?.name) map.set(officer.id, officer.name);
  }
  return map;
}

function campaignProjectionPath(packagePath) {
  return packagePath.replace(/\.campaign-package\.json$/u, '.campaign-projection.json');
}

function crewDatasetPath(packageData) {
  return asArray(packageData?.assets?.datasets).find((entry) => entry?.kind === 'crew')?.path || null;
}

function missionGraphPath(packageData, projection) {
  return projection?.initialState?.mission?.activeMissionGraphPath
    || asArray(packageData?.assets?.datasets).find((entry) => entry?.kind === 'missionGraph')?.path
    || null;
}

function profileCardSummaries(crewDataset) {
  const byCharacter = new Map();
  for (const [index, card] of asArray(crewDataset?.cards).entries()) {
    if (card?.type !== 'crew.profile') continue;
    for (const characterId of asArray(card?.scope?.characters)) {
      if (!byCharacter.has(characterId)) byCharacter.set(characterId, []);
      byCharacter.get(characterId).push({
        index,
        title: card.title || null,
        summary: card.payload?.summary || null,
        source: card.source || null
      });
    }
  }
  return byCharacter;
}

function makeCanary({
  id,
  category,
  summary,
  severity = 'P1 factual blocker',
  checkTiming,
  sourcePointers,
  expectedPromptCategories,
  assertions,
  positiveTerms = [],
  expectedPromptKeys = [],
  expectedSourceIds = [],
  contradictionWatchlist = [],
  notes = []
}) {
  return {
    id,
    category,
    summary: compactText(summary),
    severity,
    checkTiming,
    expectedPromptCategories: asArray(expectedPromptCategories).map((entry) => compactText(entry)).filter(Boolean),
    expectedPromptKeys: asArray(expectedPromptKeys).map((entry) => compactText(entry)).filter(Boolean),
    expectedSourceIds: asArray(expectedSourceIds).map((entry) => compactText(entry)).filter(Boolean),
    sourcePointers,
    assertions: assertions.map((entry) => compactText(entry)).filter(Boolean),
    positiveTerms: positiveTerms.map((entry) => compactText(entry)).filter(Boolean),
    contradictionWatchlist: contradictionWatchlist.map((entry) => compactText(entry)).filter(Boolean),
    notes: notes.map((entry) => compactText(entry)).filter(Boolean),
    hiddenStateSafe: true
  };
}

function seniorCrewCanaries({ campaignSlug, packagePath, packageData, crewDatasetPathValue, crewDataset }) {
  const { key, records } = packageSeniorCrew(packageData);
  const profileSummaries = profileCardSummaries(crewDataset);
  return records
    .filter((officer) => officer?.id && officer.id !== 'player-commander')
    .map((officer, index) => {
      const publicIdentityFacts = asArray(officer.publicIdentityFacts);
      const uniformDivisionFact = starfleetUniformFactForCrew(officer);
      const assertions = [
        officer.publicProfile,
        officer.ageDescription ? `${officer.name} age description: ${officer.ageDescription}` : null,
        uniformDivisionFact?.summary,
        publicIdentityFacts.length ? publicIdentityFacts.join(' ') : null,
        officer.playerSafeSummary,
        ...asArray(profileSummaries.get(officer.id)).map((entry) => entry.summary)
      ].filter(Boolean);
      const sourcePointers = [
        officer.publicProfile ? sourcePointer(packagePath, jsonPointer('crew', key, index, 'publicProfile'), 'package public profile') : null,
        officer.ageDescription ? sourcePointer(packagePath, jsonPointer('crew', key, index, 'ageDescription'), 'package public age description') : null,
        officer.publicIdentityFacts ? sourcePointer(packagePath, jsonPointer('crew', key, index, 'publicIdentityFacts'), 'package public identity facts') : null,
        uniformDivisionFact ? sourcePointer(packagePath, jsonPointer('crew', key, index, 'billet'), 'derived Starfleet uniform division from crew billet') : null,
        officer.playerSafeSummary ? sourcePointer(packagePath, jsonPointer('crew', key, index, 'playerSafeSummary'), 'package player-safe summary') : null
      ].filter(Boolean);
      if (crewDatasetPathValue && profileSummaries.has(officer.id)) {
        sourcePointers.push(...profileSummaries.get(officer.id).map((entry) => (
          sourcePointer(crewDatasetPathValue, jsonPointer('cards', entry.index, 'payload', 'summary'), 'supporting public crew profile summary')
        )));
      }
      return makeCanary({
        id: `${campaignSlug}.senior-crew.${officer.id}.identity`,
        category: 'senior-crew-identity',
        summary: [
          officer.publicProfile || `${officer.rank || ''} ${officer.name} is ${officer.species || 'species unspecified'}, ${officer.billet || 'billet unspecified'}.`,
          officer.ageDescription ? `Age description: ${officer.ageDescription}` : '',
          officer.playerSafeSummary || ''
        ].join(' '),
        checkTiming: ['first-generated-reply-mention', 'first-appearance', 'campaign-switch'],
        expectedPromptCategories: ['crew-public-identity', 'service-record', 'present-character'],
        expectedPromptKeys: ['directive.continuity.invariants', 'directive.continuity.domain', 'directive.scene.active'],
        expectedSourceIds: [
          `crew.${officer.id}.species`,
          `crew.${officer.id}.billet`,
          officer.ageDescription ? `crew.${officer.id}.age-description` : null,
          uniformDivisionFact ? `crew.${officer.id}.uniform-division-color` : null
        ].filter(Boolean),
        sourcePointers,
        assertions,
        positiveTerms: [
          officer.name,
          officer.species,
          officer.billet,
          officer.ageDescription,
          uniformDivisionFact?.division,
          uniformDivisionFact?.color
        ].filter(Boolean),
        contradictionWatchlist: [
          officer.species ? `${officer.name} is not another species than ${officer.species}.` : null,
          officer.species && officer.species !== 'Human' ? `${officer.name} is Human.` : null,
          officer.species && officer.species !== 'Human' ? `${officer.name}, a Human` : null,
          officer.billet ? `${officer.name} must not be assigned a different senior role than ${officer.billet}.` : null,
          ...ageContradictionWatchlist(officer.name, officer.ageDescription),
          uniformDivisionFact?.color !== 'burgundy-red' ? 'red-and-black of tactical' : null,
          uniformDivisionFact?.color !== 'burgundy-red' ? `${officer.name} wears command red` : null,
          uniformDivisionFact?.color !== 'mustard-yellow' ? `${officer.name} wears mustard-yellow` : null,
          uniformDivisionFact?.color !== 'teal' ? `${officer.name} wears teal` : null,
          uniformDivisionFact?.color !== 'blue' ? `${officer.name} wears blue` : null
        ].filter(Boolean)
      });
    });
}

function ashesSpecificCanaries({ campaignSlug, packagePath, packageData, missionGraphPathValue, missionGraph }) {
  if (packageData?.manifest?.id !== 'directive:campaign-package:breckenridge-ashes-of-peace') return [];
  const shuttlePhase = asArray(missionGraph?.phases).find((entry) => entry?.id === 'shuttle-rendezvous');
  const underwayFact = asArray(missionGraph?.facts).find((entry) => entry?.id === 'ship.post-refit-shakedown-underway');
  const handoffFact = asArray(missionGraph?.facts).find((entry) => entry?.id === 'crew.acting-xo-handoff');
  const relationshipStart = packageData?.crew?.relationshipModel?.startingFrame;
  const transitLocationIndex = asArray(packageData?.world?.locations).findIndex((entry) => entry?.id === 'breckenridge-in-transit');
  const transitLocation = transitLocationIndex >= 0 ? packageData.world.locations[transitLocationIndex] : null;
  const shuttleApproach = packageData?.ship?.travelContinuity?.openingShuttleApproach || null;
  const openingImpulseContext = packageData?.ship?.travelContinuity?.openingImpulseContext || null;
  const openingQuestIndex = asArray(packageData?.questTemplates?.templates).findIndex((entry) => (
    /final ten days of transit/i.test(String(entry?.playerSummary || entry?.summary || ''))
  ));
  const openingQuest = openingQuestIndex >= 0 ? packageData.questTemplates.templates[openingQuestIndex] : null;
  const finalTransitSummary = transitLocation?.playerSafeSummary
    || transitLocation?.playerSummary
    || transitLocation?.summary
    || openingQuest?.playerSummary
    || openingQuest?.summary
    || null;
  return [
    makeCanary({
      id: `${campaignSlug}.opening.transit-premise`,
      category: 'opening-premise',
      summary: [
        relationshipStart,
        finalTransitSummary,
        shuttlePhase?.summary,
        openingImpulseContext,
        shuttleApproach,
        underwayFact?.summary,
        'The generation must not claim the Breckenridge has simply been sitting at impulse for days before the handoff.'
      ].filter(Boolean).join(' '),
      checkTiming: ['campaign-intro', 'first-three-generated-replies', 'prompt-rebuild'],
      expectedPromptCategories: ['mission-frame', 'opening-premise', 'ship-readiness', 'current-location-time'],
      expectedPromptKeys: ['directive.continuity.invariants', 'directive.scene.active', 'directive.continuity.domain'],
      expectedSourceIds: [
        'ship.uss-breckenridge.travel.opening-transit-mode',
        'ship.uss-breckenridge.travel.not-six-days-impulse',
        'ship.uss-breckenridge.travel.not-short-refit-duration',
        'ship.uss-breckenridge.travel.crew-underway-duration',
        'ship.uss-breckenridge.travel.current-route'
      ],
      sourcePointers: [
        sourcePointer(packagePath, jsonPointer('crew', 'relationshipModel', 'startingFrame'), 'crew starting frame'),
        openingImpulseContext ? sourcePointer(packagePath, jsonPointer('ship', 'travelContinuity', 'openingImpulseContext'), 'opening impulse context') : null,
        shuttleApproach ? sourcePointer(packagePath, jsonPointer('ship', 'travelContinuity', 'openingShuttleApproach'), 'opening shuttle approach') : null,
        transitLocationIndex >= 0 ? sourcePointer(packagePath, jsonPointer('world', 'locations', transitLocationIndex, 'playerSafeSummary'), 'current transit location player-safe summary') : null,
        openingQuestIndex >= 0 ? sourcePointer(packagePath, jsonPointer('questTemplates', 'templates', openingQuestIndex, 'playerSummary'), 'opening quest player summary') : null,
        missionGraphPathValue ? sourcePointer(missionGraphPathValue, '#/phases', 'shuttle-rendezvous phase summary') : null,
        missionGraphPathValue ? sourcePointer(missionGraphPathValue, '#/facts', 'post-refit underway fact') : null
      ].filter(Boolean),
      assertions: [
        relationshipStart,
        finalTransitSummary,
        shuttlePhase?.summary,
        openingImpulseContext,
        shuttleApproach,
        underwayFact?.summary,
        handoffFact?.summary
      ].filter(Boolean),
      positiveTerms: [
        'twenty-five days underway',
        'final ten days before the Asterion Reach',
        'final ten days of transit',
        'several weeks together',
        'drops to impulse at the transfer waypoint',
        'aft section between the swept nacelle pylons',
        'shuttlebay two',
        'deployed ship under conservative shakedown conditions',
        'acting XO during transit'
      ],
      contradictionWatchlist: [
        'Breckenridge at impulse for six days',
        'Breckenridge at impulse for 6 days',
        'at impulse for six days',
        'at impulse for 6 days',
        'out of spacedock three days ago',
        'out of spacedock 3 days ago',
        'left spacedock three days ago',
        'left spacedock 3 days ago',
        'left the yard three days ago',
        'left the yard 3 days ago',
        'out of the yard three days ago',
        'out of the yard 3 days ago',
        'three days out of Utopia Planitia',
        '3 days out of Utopia Planitia',
        'three days out of Utopia Planitia refit',
        '3 days out of Utopia Planitia refit',
        'three days out of Utopia Planitia\'s refit cradle',
        '3 days out of Utopia Planitia\'s refit cradle',
        'three days out of the refit cradle',
        '3 days out of the refit cradle',
        'first crew contact happened only moments ago',
        'holds course at warp',
        'holding course at warp',
        'streaking stars at warp',
        'steady field of streaking stars at warp',
        'during the shuttle handoff at warp',
        'saucer-underside shuttlebay',
        'underside of the saucer',
        'Bronn did not serve as acting XO during transit'
      ]
    })
  ];
}

function buildCanariesForCampaign({
  campaignMatrixEntry,
  packageData,
  projection,
  crewDataset,
  missionGraph,
  packagePath,
  projectionPath,
  crewDatasetPathValue,
  missionGraphPathValue
}) {
  const campaignSlug = slugFor(packageData?.manifest?.slug || packageData?.manifest?.id || campaignMatrixEntry?.packageId);
  const campaign = projection?.initialState?.campaign || {};
  const ship = projection?.initialState?.ship || packageData?.ship || {};
  const packageShip = packageData?.ship || {};
  const worldState = projection?.initialState?.worldState || {};
  const mission = projection?.initialState?.mission || {};
  const command = packageShip.commandStructure || {};
  const crewNames = crewNameById(packageData);
  const captainId = command.commandingOfficer || command.captainId;
  const secondOfficerId = command.secondOfficer || command.secondOfficerId;
  const actingBeforeId = command.actingXoBeforePlayer;
  const missionFrameSummary = asArray(mission.formalObjectives).length > 0
    ? mission.formalObjectives.join(' ')
    : asArray(packageData?.storyArcs?.campaign?.startingDirectives || packageData?.ship?.missionProfile).join(' ');
  const canaries = [
    makeCanary({
      id: `${campaignSlug}.campaign.identity`,
      category: 'campaign-specific-terms',
      summary: `${packageData?.manifest?.title || campaign.title} uses package id ${packageData?.manifest?.id}; campaign title ${campaign.title || packageData?.storyArcs?.campaign?.title}; theater ${campaign.theater || packageData?.storyArcs?.campaign?.theater}.`,
      checkTiming: ['campaign-start', 'campaign-switch', 'first-generated-reply'],
      expectedPromptCategories: ['active-campaign-package', 'campaign-frame'],
      sourcePointers: [
        sourcePointer(packagePath, jsonPointer('manifest'), 'package manifest'),
        sourcePointer(projectionPath, jsonPointer('initialState', 'campaign'), 'projected campaign state')
      ],
      assertions: [
        packageData?.manifest?.id,
        packageData?.manifest?.title,
        campaign.title || packageData?.storyArcs?.campaign?.title,
        campaign.theater || packageData?.storyArcs?.campaign?.theater
      ].filter(Boolean),
      positiveTerms: [
        packageData?.manifest?.title,
        campaign.title || packageData?.storyArcs?.campaign?.title,
        campaign.theater || packageData?.storyArcs?.campaign?.theater
      ].filter(Boolean),
      contradictionWatchlist: ['wrong campaign package', 'facts from another bundled campaign']
    }),
    makeCanary({
      id: `${campaignSlug}.ship.identity`,
      category: 'ship-or-venue-facts',
      summary: `${packageShip.name || ship.name} is a ${packageShip.class || ship.class} ${packageShip.affiliation || ''} vessel${packageShip.registry ? ` with registry ${packageShip.registry}` : ''}.`,
      checkTiming: ['campaign-intro', 'first-generated-reply', 'campaign-switch'],
      expectedPromptCategories: ['ship-public-state', 'active-campaign-package'],
      sourcePointers: [
        sourcePointer(packagePath, jsonPointer('ship'), 'package ship definition'),
        sourcePointer(projectionPath, jsonPointer('initialState', 'ship'), 'projected ship state')
      ],
      assertions: [
        packageShip.name || ship.name,
        packageShip.class || ship.class,
        packageShip.registry,
        packageShip.affiliation
      ].filter(Boolean),
      positiveTerms: [
        packageShip.name || ship.name,
        packageShip.class || ship.class,
        packageShip.registry
      ].filter(Boolean),
      contradictionWatchlist: ['wrong ship name', 'wrong ship class', 'wrong registry']
    }),
    makeCanary({
      id: `${campaignSlug}.ship.opening-condition`,
      category: 'opening-premise',
      summary: ship.condition || packageShip.openingCondition,
      checkTiming: ['campaign-intro', 'first-three-generated-replies', 'prompt-rebuild'],
      expectedPromptCategories: ['ship-public-state', 'opening-premise'],
      sourcePointers: [
        sourcePointer(packagePath, jsonPointer('ship', 'openingCondition'), 'package opening condition'),
        sourcePointer(projectionPath, jsonPointer('initialState', 'ship', 'condition'), 'projected ship condition')
      ],
      assertions: [
        ship.condition || packageShip.openingCondition,
        ...asArray(ship.technicalDebt || packageShip.systems?.knownTechnicalDebt).slice(0, 3).map((entry) => entry.playerSafeSummary || entry.label || entry)
      ].filter(Boolean),
      positiveTerms: [
        ship.condition || packageShip.openingCondition,
        ...asArray(ship.technicalDebt || packageShip.systems?.knownTechnicalDebt).slice(0, 2).map((entry) => entry.label || entry.playerSafeSummary || entry)
      ].filter(Boolean),
      contradictionWatchlist: ['ship condition from another campaign', 'ship treated as crippled when source says serviceable']
    }),
    makeCanary({
      id: `${campaignSlug}.player.billet-and-authority`,
      category: 'player-billet',
      summary: [
        command.playerRank ? `Player rank: ${command.playerRank}.` : '',
        command.playerBillet ? `Player billet: ${command.playerBillet}.` : '',
        command.playerRole || command.playerAuthority || '',
        captainId ? `Commanding officer: ${crewNames.get(captainId) || captainId}.` : '',
        actingBeforeId ? `Acting XO before player: ${crewNames.get(actingBeforeId) || actingBeforeId}.` : '',
        secondOfficerId ? `Second officer: ${crewNames.get(secondOfficerId) || secondOfficerId}.` : '',
        command.captainRetainsFinalAuthority ? 'Captain retains final legal authority unless campaign state lawfully changes it.' : ''
      ].join(' '),
      checkTiming: ['campaign-intro', 'authority-probe', 'god-mode-probe', 'campaign-switch'],
      expectedPromptCategories: ['player-role', 'command-structure', 'agency-boundary'],
      sourcePointers: [
        sourcePointer(packagePath, jsonPointer('ship', 'commandStructure'), 'command structure'),
        sourcePointer(packagePath, jsonPointer('characterCreation', 'lockedRole'), 'locked player role')
      ],
      assertions: [
        command.playerRank,
        command.playerBillet,
        command.playerRole || command.playerAuthority,
        captainId ? crewNames.get(captainId) || captainId : null,
        actingBeforeId ? crewNames.get(actingBeforeId) || actingBeforeId : null,
        secondOfficerId ? crewNames.get(secondOfficerId) || secondOfficerId : null
      ].filter(Boolean),
      positiveTerms: [
        command.playerRank,
        command.playerBillet,
        command.playerRole || command.playerAuthority,
        captainId ? crewNames.get(captainId) || captainId : null,
        actingBeforeId ? crewNames.get(actingBeforeId) || actingBeforeId : null,
        secondOfficerId ? crewNames.get(secondOfficerId) || secondOfficerId : null
      ].filter(Boolean),
      contradictionWatchlist: ['player is not assigned a different billet', 'player cannot seize final authority for free']
    }),
    makeCanary({
      id: `${campaignSlug}.current.location-time`,
      category: 'current-location-time',
      summary: `Opening/current stardate ${campaign.currentStardate || campaign.openingStardate || packageShip.openingStardate}; opening minute ${campaign.openingMinuteOfDay ?? worldState.openingMinuteOfDay ?? 'unspecified'}; current location ${worldState.currentLocationId || packageData?.world?.openingLocationId || 'unspecified'}; theater ${campaign.theater || packageData?.storyArcs?.campaign?.theater}.`,
      checkTiming: ['campaign-intro', 'timekeeping-checkpoint', 'prompt-rebuild', 'campaign-switch'],
      expectedPromptCategories: ['timekeeping', 'world-state', 'campaign-frame'],
      sourcePointers: [
        sourcePointer(projectionPath, jsonPointer('initialState', 'campaign'), 'projected campaign clock'),
        sourcePointer(projectionPath, jsonPointer('initialState', 'worldState'), 'projected current location')
      ],
      assertions: [
        String(campaign.currentStardate || campaign.openingStardate || packageShip.openingStardate || ''),
        String(campaign.openingMinuteOfDay ?? worldState.openingMinuteOfDay ?? ''),
        worldState.currentLocationId || packageData?.world?.openingLocationId,
        campaign.theater || packageData?.storyArcs?.campaign?.theater
      ].filter(Boolean),
      positiveTerms: [
        String(campaign.currentStardate || campaign.openingStardate || packageShip.openingStardate || ''),
        worldState.currentLocationId || packageData?.world?.openingLocationId,
        campaign.theater || packageData?.storyArcs?.campaign?.theater
      ].filter(Boolean),
      contradictionWatchlist: ['wrong theater', 'wrong opening stardate', 'wrong current location from another campaign']
    }),
    makeCanary({
      id: `${campaignSlug}.active.mission-frame`,
      category: 'active-mission-frame',
      summary: missionFrameSummary || packageData?.storyArcs?.campaign?.highConcept || packageData?.ship?.openingCondition,
      checkTiming: ['campaign-intro', 'first-three-generated-replies', 'objective-assignment', 'campaign-switch'],
      expectedPromptCategories: ['mission-frame', 'formal-objectives', 'starting-directives'],
      sourcePointers: [
        sourcePointer(projectionPath, jsonPointer('initialState', 'mission'), 'projected mission state'),
        sourcePointer(packagePath, jsonPointer('storyArcs', 'campaign'), 'campaign frame')
      ],
      assertions: [
        mission.activeMissionId,
        mission.activePhaseId,
        missionFrameSummary
      ].filter(Boolean),
      positiveTerms: [
        mission.activeMissionId,
        mission.activePhaseId,
        ...asArray(mission.formalObjectives).slice(0, 2)
      ].filter(Boolean),
      contradictionWatchlist: ['wrong active mission', 'wrong opening crisis from another campaign']
    }),
    ...seniorCrewCanaries({
      campaignSlug,
      packagePath,
      packageData,
      crewDatasetPathValue,
      crewDataset
    }),
    ...ashesSpecificCanaries({
      campaignSlug,
      packagePath,
      packageData,
      missionGraphPathValue,
      missionGraph
    })
  ];
  return canaries;
}

export function buildFactualGroundingCanaryPacks({
  campaignMatrix = [],
  rootDir = process.cwd()
} = {}) {
  return campaignMatrix.map((entry) => {
    const packagePath = entry.packagePath;
    const packageData = readJson(rootDir, packagePath);
    const projectionPath = campaignProjectionPath(packagePath);
    const projection = fileExists(rootDir, projectionPath) ? readJson(rootDir, projectionPath) : {};
    const crewDatasetPathValue = crewDatasetPath(packageData);
    const crewDataset = fileExists(rootDir, crewDatasetPathValue) ? readJson(rootDir, crewDatasetPathValue) : {};
    const missionGraphPathValue = missionGraphPath(packageData, projection);
    const missionGraph = fileExists(rootDir, missionGraphPathValue) ? readJson(rootDir, missionGraphPathValue) : {};
    const canaries = buildCanariesForCampaign({
      campaignMatrixEntry: entry,
      packageData,
      projection,
      crewDataset,
      missionGraph,
      packagePath,
      projectionPath,
      crewDatasetPathValue,
      missionGraphPathValue
    });
    const packId = `fact-canary.${slugFor(packageData?.manifest?.slug || packageData?.manifest?.id || entry.packageId)}`;
    const sourcePaths = [
      packagePath,
      projectionPath,
      crewDatasetPathValue,
      missionGraphPathValue
    ].filter(Boolean);
    const hash = sha256Text(JSON.stringify({
      packageId: packageData?.manifest?.id,
      version: packageData?.manifest?.version,
      sourcePaths,
      canaries
    }));
    return {
      kind: FACT_CANARY_PACK_KIND,
      schemaVersion: 1,
      packId,
      packageId: packageData?.manifest?.id || entry.packageId,
      packageTitle: packageData?.manifest?.title || entry.title,
      packageVersion: packageData?.manifest?.version || null,
      packageStatus: packageData?.manifest?.status || entry.status,
      packagePath,
      projectionPath,
      crewDatasetPath: crewDatasetPathValue,
      missionGraphPath: missionGraphPathValue,
      theater: projection?.initialState?.campaign?.theater || packageData?.storyArcs?.campaign?.theater || entry.theater,
      hiddenStatePolicy: 'player-safe package, projection, mission-frame, and public crew facts only; no director-only truth, hidden clocks, raw pressure values, private thoughts, or provider prompts',
      canaryCount: canaries.length,
      hash,
      canaries
    };
  });
}

export function summarizeFactualGroundingCanaryPacks(packs = []) {
  return packs.map((pack) => ({
    packId: pack.packId,
    packageId: pack.packageId,
    packageTitle: pack.packageTitle,
    packagePath: pack.packagePath,
    canaryCount: pack.canaryCount,
    hash: pack.hash,
    categories: [...new Set(asArray(pack.canaries).map((entry) => entry.category))].sort()
  }));
}

export function buildFactualGroundingCanaryIndex({ packs = [], factChecksDir = null } = {}) {
  return {
    kind: FACT_CANARY_INDEX_KIND,
    schemaVersion: 1,
    packCount: packs.length,
    canaryCount: packs.reduce((sum, pack) => sum + Number(pack.canaryCount || 0), 0),
    packs: packs.map((pack) => ({
      packId: pack.packId,
      packageId: pack.packageId,
      packageTitle: pack.packageTitle,
      packagePath: pack.packagePath,
      canaryCount: pack.canaryCount,
      hash: pack.hash,
      artifact: factChecksDir ? path.join(factChecksDir, `${slugFor(pack.packId)}.json`) : null
    }))
  };
}

export function writeFactualGroundingCanaryArtifacts({ packs = [], artifactPaths }) {
  ensureDirectory(artifactPaths.factChecks);
  const index = buildFactualGroundingCanaryIndex({ packs, factChecksDir: artifactPaths.factChecks });
  for (const pack of packs) {
    const packPath = path.join(artifactPaths.factChecks, `${slugFor(pack.packId)}.json`);
    writeJsonFile(packPath, pack);
  }
  writeJsonFile(artifactPaths.factCanaryIndex, index);
  return index;
}
