import {
  CONTINUITY_VISIBILITY,
  asArray,
  compact,
  createContinuityFact
} from '../fact-schema.mjs';
import { starfleetUniformFactForCrew } from '../../starfleet/uniforms.mjs';

function crewById(packageData, crewDataset) {
  const records = new Map();
  for (const record of asArray(crewDataset?.officers)) {
    if (record?.id) records.set(record.id, { ...record, sourceHint: 'crewDataset' });
  }
  for (const record of asArray(packageData?.crew?.senior)) {
    if (!record?.id) continue;
    records.set(record.id, {
      ...(records.get(record.id) || {}),
      ...record,
      sourceHint: 'package'
    });
  }
  return [...records.values()].filter((record) => record?.id);
}

function displayName(officer) {
  return compact([officer.rank, officer.name || officer.id].filter(Boolean).join(' '));
}

export function materializeCrewIdentityFacts({
  packageData = null,
  crewDataset = null,
  campaignState = null
} = {}) {
  const packageId = packageData?.manifest?.id || campaignState?.campaign?.packageId || null;
  const facts = [];
  for (const officer of crewById(packageData, crewDataset)) {
    const name = displayName(officer);
    const subject = `crew.${officer.id}`;
    const source = {
      type: 'campaignPackage',
      packageId,
      path: `crew.senior.${officer.id}`
    };
    if (compact(officer.species)) {
      facts.push(createContinuityFact({
        id: `${subject}.species`,
        kind: 'crew.identity',
        subject,
        predicate: 'species',
        value: officer.species,
        summary: `${name} is ${officer.species}.`,
        render: {
          narrator: `${name} is ${officer.species}, not a default human unless campaign state explicitly changes that identity.`,
          director: `${name} species is locked as ${officer.species}.`
        },
        source,
        authority: 'package',
        visibility: CONTINUITY_VISIBILITY.narratorSafe,
        criticality: 'hard',
        tags: ['crew', 'identity', 'species', officer.id]
      }));
    }
    if (compact(officer.billet)) {
      facts.push(createContinuityFact({
        id: `${subject}.billet`,
        kind: 'crew.identity',
        subject,
        predicate: 'billet',
        value: officer.billet,
        summary: `${name} serves as ${officer.billet}.`,
        render: {
          narrator: `${name} serves as ${officer.billet}.`,
          director: `${name} billet: ${officer.billet}.`
        },
        source,
        authority: 'package',
        visibility: CONTINUITY_VISIBILITY.narratorSafe,
        criticality: 'hard',
        tags: ['crew', 'identity', 'billet', officer.id]
      }));
    }
    if (compact(officer.ageDescription)) {
      facts.push(createContinuityFact({
        id: `${subject}.age-description`,
        kind: 'crew.identity',
        subject,
        predicate: 'ageDescription',
        value: officer.ageDescription,
        summary: `${name} age description: ${officer.ageDescription}`,
        render: {
          narrator: `${name} should be described with this age frame: ${officer.ageDescription}`,
          director: `${name} age frame: ${officer.ageDescription}`
        },
        source,
        authority: 'package',
        visibility: CONTINUITY_VISIBILITY.narratorSafe,
        criticality: 'high',
        tags: ['crew', 'identity', 'age', officer.id]
      }));
    }
    if (compact(officer.publicProfile)) {
      facts.push(createContinuityFact({
        id: `${subject}.public-profile`,
        kind: 'crew.profile',
        subject,
        predicate: 'publicProfile',
        value: officer.publicProfile,
        summary: officer.publicProfile,
        render: {
          narrator: officer.publicProfile,
          director: officer.publicProfile
        },
        source,
        authority: 'package',
        visibility: CONTINUITY_VISIBILITY.narratorSafe,
        criticality: 'medium',
        tags: ['crew', 'profile', officer.id]
      }));
    }
    const uniform = starfleetUniformFactForCrew(officer);
    if (uniform) {
      facts.push(createContinuityFact({
        id: `${subject}.uniform-division-color`,
        kind: 'crew.uniform',
        subject,
        predicate: 'uniformDivisionColor',
        value: {
          rule: uniform.rule,
          division: uniform.division,
          color: uniform.color
        },
        summary: uniform.summary,
        render: {
          narrator: uniform.summary,
          director: uniform.summary
        },
        source,
        authority: 'package',
        visibility: CONTINUITY_VISIBILITY.narratorSafe,
        criticality: 'hard',
        tags: ['crew', 'identity', 'uniform', 'contradiction-guard', officer.id]
      }));
    }
    for (const [index, factText] of asArray(officer.publicIdentityFacts).map(compact).filter(Boolean).entries()) {
      facts.push(createContinuityFact({
        id: `${subject}.public-identity-fact.${index + 1}`,
        kind: 'crew.identity',
        subject,
        predicate: 'publicIdentityFact',
        value: factText,
        summary: factText,
        render: {
          narrator: factText,
          director: factText
        },
        source,
        authority: 'package',
        visibility: CONTINUITY_VISIBILITY.narratorSafe,
        criticality: 'high',
        tags: ['crew', 'identity', officer.id]
      }));
    }
  }
  return facts;
}
