import {
  CONTINUITY_VISIBILITY,
  asArray,
  compact,
  createContinuityFact,
  uniqueCompact
} from '../fact-schema.mjs';

const HIGH_PRIORITY_AREAS = new Set([
  'intrepid.bridge',
  'intrepid.sickbay',
  'intrepid.main-engineering',
  'intrepid.transporter-rooms',
  'intrepid.astrometrics',
  'intrepid.shuttlebay-complex'
]);

const CORE_SYSTEMS = new Set([
  'intrepid.bio-neural-gel-packs',
  'intrepid.variable-geometry-nacelles',
  'intrepid.transporters',
  'intrepid.emh'
]);

function safeId(value = '') {
  return compact(value)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'ship';
}

function deckLabel(decks = []) {
  const values = asArray(decks).map((deck) => Number(deck)).filter((deck) => Number.isInteger(deck) && deck > 0);
  if (!values.length) return '';
  if (values.length === 1) return `Deck ${values[0]}`;
  return `Decks ${values.join(', ')}`;
}

function shipIdFor(packageData = null, campaignState = null, shipDataset = null) {
  return compact(shipDataset?.manifest?.shipId || packageData?.ship?.id || campaignState?.ship?.id || 'ship');
}

function packageIdFor(packageData = null, campaignState = null, shipDataset = null) {
  return compact(shipDataset?.manifest?.packageId || packageData?.manifest?.id || campaignState?.campaign?.packageId || '');
}

function sourceFor(shipDataset = null, path = '') {
  return {
    type: 'shipDataset',
    packageId: packageIdFor(null, null, shipDataset) || null,
    datasetId: shipDataset?.manifest?.id || null,
    shipId: shipDataset?.manifest?.shipId || null,
    classId: shipDataset?.manifest?.classId || null,
    path
  };
}

function areaCriticality(area = {}) {
  if (asArray(area?.keywords).some((keyword) => /shuttle\s*bay|shuttlebay|flight\s+deck/i.test(keyword))) return 'hard';
  if (HIGH_PRIORITY_AREAS.has(area.id)) return 'high';
  const searchable = `${area.id || ''} ${area.name || ''} ${area.zone || ''} ${asArray(area.keywords).join(' ')}`;
  if (/\b(?:bridge|sickbay|medical|engineering|transporter|mission\s+ops)\b/i.test(searchable)) return 'high';
  return 'medium';
}

function systemCriticality(system = {}) {
  return CORE_SYSTEMS.has(system.id) ? 'high' : 'medium';
}

function areaKeywords(area = {}) {
  return uniqueCompact([
    area.id,
    area.name,
    area.zone,
    area.exteriorPlacement,
    deckLabel(area.decks),
    ...asArray(area.functions),
    ...asArray(area.sceneUses),
    ...asArray(area.keywords)
  ]);
}

function systemKeywords(system = {}) {
  return uniqueCompact([
    system.id,
    system.name,
    system.scope,
    ...asArray(system.keywords)
  ]);
}

function areaSummary(area = {}) {
  const deck = deckLabel(area.decks);
  const zone = compact(area.zone);
  const exterior = compact(area.exteriorPlacement);
  const hardFacts = asArray(area.hardFacts).map(compact).filter(Boolean).slice(0, 3);
  return [
    `${compact(area.name || area.id)} is ${[deck, zone].filter(Boolean).join(', ') || 'a defined ship area'}.`,
    exterior ? `Exterior placement: ${exterior}.` : null,
    ...hardFacts
  ].filter(Boolean).join(' ');
}

function areaDirectorRender(area = {}) {
  const uses = asArray(area.sceneUses).map(compact).filter(Boolean).slice(0, 4);
  const textures = asArray(area.textures).map(compact).filter(Boolean).slice(0, 5);
  const constraints = asArray(area.constraints).map(compact).filter(Boolean).slice(0, 3);
  return [
    areaSummary(area),
    uses.length ? `Scene uses: ${uses.join('; ')}.` : null,
    textures.length ? `Texture: ${textures.join('; ')}.` : null,
    constraints.length ? `Constraints: ${constraints.join('; ')}.` : null
  ].filter(Boolean).join(' ');
}

function materializeAreaFact({ area, shipId, shipDataset }) {
  const subject = `ship.${safeId(shipId)}.area.${safeId(area.id)}`;
  const keywords = areaKeywords(area);
  return createContinuityFact({
    id: `${subject}.layout`,
    kind: 'ship.location',
    subject,
    predicate: 'layout',
    value: {
      areaId: area.id,
      name: area.name || null,
      decks: asArray(area.decks),
      zone: area.zone || null,
      exteriorPlacement: area.exteriorPlacement || null,
      functions: asArray(area.functions),
      sceneUses: asArray(area.sceneUses),
      hardFacts: asArray(area.hardFacts),
      textures: asArray(area.textures),
      constraints: asArray(area.constraints)
    },
    summary: areaSummary(area),
    render: {
      narrator: areaSummary(area),
      director: areaDirectorRender(area)
    },
    source: sourceFor(shipDataset, `areas.${area.id}`),
    authority: 'package',
    visibility: CONTINUITY_VISIBILITY.narratorSafe,
    criticality: areaCriticality(area),
    tags: uniqueCompact([
      'ship',
      'location',
      'area',
      area.id,
      ...asArray(area.decks).map((deck) => `Deck ${deck}`),
      ...keywords
    ]),
    semantics: {
      shipDatasetId: shipDataset?.manifest?.id || null,
      shipId,
      classId: shipDataset?.manifest?.classId || null,
      areaId: area.id,
      decks: asArray(area.decks),
      keywords
    }
  });
}

function materializeSystemFact({ system, shipId, shipDataset }) {
  const subject = `ship.${safeId(shipId)}.system.${safeId(system.id)}`;
  const keywords = systemKeywords(system);
  const dependencies = asArray(system.dependencies).map(compact).filter(Boolean).slice(0, 4);
  const failureModes = asArray(system.failureModes).map(compact).filter(Boolean).slice(0, 4);
  const sceneUses = asArray(system.sceneUses).map(compact).filter(Boolean).slice(0, 4);
  const summary = [
    `${compact(system.name || system.id)}: ${compact(system.capability || system.scope)}.`,
    dependencies.length ? `Dependencies: ${dependencies.join('; ')}.` : null,
    failureModes.length ? `Failure modes: ${failureModes.join('; ')}.` : null
  ].filter(Boolean).join(' ');
  return createContinuityFact({
    id: `${subject}.capability`,
    kind: 'ship.system',
    subject,
    predicate: 'capability',
    value: {
      systemId: system.id,
      name: system.name || null,
      scope: system.scope || null,
      capability: system.capability || null,
      dependencies: asArray(system.dependencies),
      failureModes: asArray(system.failureModes),
      sceneUses: asArray(system.sceneUses)
    },
    summary,
    render: {
      narrator: summary,
      director: [
        summary,
        sceneUses.length ? `Scene uses: ${sceneUses.join('; ')}.` : null
      ].filter(Boolean).join(' ')
    },
    source: sourceFor(shipDataset, `systems.${system.id}`),
    authority: 'package',
    visibility: CONTINUITY_VISIBILITY.narratorSafe,
    criticality: systemCriticality(system),
    tags: uniqueCompact(['ship', 'system', system.id, ...keywords]),
    semantics: {
      shipDatasetId: shipDataset?.manifest?.id || null,
      shipId,
      classId: shipDataset?.manifest?.classId || null,
      systemId: system.id,
      keywords
    }
  });
}

function materializeShuttlebayGuardFact({ area, shipId, shipDataset }) {
  if (!area) return null;
  const subject = `ship.${safeId(shipId)}.area.${safeId(area.id)}`;
  const classLabel = compact(shipDataset?.manifest?.classId || 'ship')
    .replace(/-/g, ' ')
    .replace(/\bclass\b/i, 'class');
  const prohibitions = asArray(area.constraints)
    .map(compact)
    .filter((constraint) => /\b(?:do not|avoid|incorrect|not\s+depict|not\s+place|not\s+inside|never)\b/i.test(constraint));
  const required = areaSummary(area);
  const normalizedProhibitions = [...prohibitions];
  if (prohibitions.some((constraint) => /underside.*saucer|saucer.*underside|saucer-underbelly|saucer-underside/i.test(constraint))
    && !prohibitions.some((constraint) => /saucer-underside/i.test(constraint))) {
    normalizedProhibitions.unshift('Do not describe shuttle operations as using a saucer-underside shuttlebay.');
  }
  const summary = [
    `Do not describe routine ${classLabel} shuttle launch, recovery, docking, hangar, or shuttlebay action using a bay placement that contradicts the ship dataset.`,
    required,
    ...normalizedProhibitions.slice(0, 2)
  ].filter(Boolean).join(' ');
  return createContinuityFact({
    id: `${subject}.not-saucer-underside`,
    kind: 'ship.location.constraint',
    subject,
    predicate: 'invalidShuttlebayPlacement',
    value: {
      invalid: normalizedProhibitions.length ? normalizedProhibitions : ['generic or contradictory shuttlebay placement'],
      required
    },
    summary,
    render: {
      narrator: summary,
      director: `Contradiction guard: reject shuttle launch, recovery, docking, hangar, or shuttlebay prose that contradicts the source-backed area anchor. Required anchor: ${required}`
    },
    source: sourceFor(shipDataset, `areas.${area.id}.constraints`),
    authority: 'package',
    visibility: CONTINUITY_VISIBILITY.narratorSafe,
    criticality: 'hard',
    tags: [
      'ship',
      'location',
      'shuttlebay',
      'shuttle',
      'docking',
      'saucer',
      'underside',
      'ventral',
      'primary hull',
      ...asArray(area.decks).map((deck) => `Deck ${deck}`),
      ...areaKeywords(area),
      'contradiction-guard',
      'invariant'
    ],
    semantics: {
      shipDatasetId: shipDataset?.manifest?.id || null,
      shipId,
      classId: shipDataset?.manifest?.classId || null,
      areaId: area.id,
      keywords: areaKeywords(area)
    }
  });
}

export function materializeShipDatasetFacts({
  packageData = null,
  campaignState = null,
  shipDataset = null
} = {}) {
  if (!shipDataset || typeof shipDataset !== 'object') return [];
  const packageId = packageIdFor(packageData, campaignState, shipDataset);
  const manifestPackageId = compact(shipDataset?.manifest?.packageId);
  if (packageId && manifestPackageId && packageId !== manifestPackageId) return [];
  const shipId = shipIdFor(packageData, campaignState, shipDataset);
  const areaFacts = asArray(shipDataset.areas)
    .filter((area) => area?.id)
    .map((area) => materializeAreaFact({ area, shipId, shipDataset }));
  const systemFacts = asArray(shipDataset.systems)
    .filter((system) => system?.id)
    .map((system) => materializeSystemFact({ system, shipId, shipDataset }));
  const shuttlebayArea = asArray(shipDataset.areas).find((area) => area?.id === 'intrepid.shuttlebay-complex'
    || asArray(area?.keywords).some((keyword) => /shuttle\s*bay|shuttlebay/i.test(keyword)));
  return [
    ...areaFacts,
    ...systemFacts,
    materializeShuttlebayGuardFact({ area: shuttlebayArea, shipId, shipDataset })
  ].filter(Boolean);
}
