import fs from 'node:fs';
import path from 'node:path';
import { BUNDLED_CAMPAIGN_PACKAGE_REFS } from '../../src/packages/bundled-package-registry.mjs';
import { buildAudienceGateReport } from '../../src/retrieval/packet-builder.mjs';
import { indexDirectorDatasets } from '../../src/retrieval/dataset-index.mjs';
import { hydrateDirectorCards } from '../../src/retrieval/card-hydration.mjs';

const root = process.cwd();
const errors = [];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function fail(location, message) {
  errors.push(`${location}: ${message}`);
}

function cardsForOfficer(dataset, officerId) {
  return (dataset.cards || []).filter((card) => (card.scope?.characters || []).includes(officerId));
}

function cardOfType(cards, type) {
  return cards.find((card) => card.type === type) || null;
}

function firstHydratedCard(hydration) {
  return hydration?.cards?.[0] || null;
}

function sceneFor(ref, dataset, officer, card) {
  return {
    packageId: ref.id,
    datasetId: dataset.manifest.id,
    campaignId: card.scope?.campaigns?.[0] || null,
    missionId: card.scope?.missions?.[0] || null,
    phaseId: 'rich-character-runtime-coverage',
    stardate: card.scope?.stardateFrom || 53000,
    presentCharacters: ['player-commander', officer.id],
    playerKnowledgeByCharacter: {
      [officer.id]: 'professionalConversation'
    },
    relationships: {
      [officer.id]: {
        professionalConfidence: 55,
        integrityTrust: 55,
        personalRapport: 40
      }
    },
    development: {
      [officer.id]: {
        operationalExperience: 0,
        playerMentorship: 0,
        personalArcProgress: 'locked',
        commandConfidence: 0,
        professionalStrain: 0
      }
    },
    audiences: ['narrator', 'crewDirector', 'missionDirector', 'commandDirector']
  };
}

for (const ref of BUNDLED_CAMPAIGN_PACKAGE_REFS) {
  const dataset = readJson(ref.crewDatasetPath);
  const officer = (dataset.officers || []).find((entry) => entry.id !== 'player-commander');
  if (!officer) {
    fail(ref.crewDatasetPath, 'must include at least one non-player officer');
    continue;
  }

  for (const entry of dataset.officers || []) {
    if (!entry.ageDescription || typeof entry.ageDescription !== 'string') {
      fail(`${ref.crewDatasetPath} ${entry.id || 'unknown-officer'}`, 'must include ageDescription');
    }
  }

  const cards = cardsForOfficer(dataset, officer.id);
  const profileCard = cardOfType(cards, 'crew.profile');
  const voiceCard = cardOfType(cards, 'crew.voice');
  const revealCard = cardOfType(cards, 'crew.reveal');
  const styleCard = cardOfType(cards, 'command.styleReaction');
  const location = `${ref.crewDatasetPath} ${officer.id}`;

  if (!profileCard) fail(location, 'missing crew.profile card');
  if (!voiceCard) fail(location, 'missing crew.voice card');
  if (!revealCard) fail(location, 'missing crew.reveal card');
  if (!styleCard) fail(location, 'missing command.styleReaction card');
  if (!profileCard || !voiceCard || !revealCard || !styleCard) continue;

  const sceneSnapshot = sceneFor(ref, dataset, officer, voiceCard);
  const gateReport = buildAudienceGateReport({
    cards: dataset.cards || [],
    sceneSnapshot,
    audiences: sceneSnapshot.audiences
  });

  if (!gateReport.selectedByAudience.narrator.includes(profileCard.id)) {
    fail(location, `narrator should select profile card ${profileCard.id}`);
  }
  if (!gateReport.selectedByAudience.narrator.includes(voiceCard.id)) {
    fail(location, `narrator should select voice card ${voiceCard.id}`);
  }
  if (gateReport.selectedByAudience.narrator.includes(revealCard.id)) {
    fail(location, `narrator must not select reveal card ${revealCard.id}`);
  }
  if (!gateReport.selectedByAudience.crewDirector.includes(voiceCard.id)) {
    fail(location, `crewDirector should select voice card ${voiceCard.id}`);
  }
  if (!gateReport.selectedByAudience.commandDirector.includes(styleCard.id)) {
    fail(location, `commandDirector should select style card ${styleCard.id}`);
  }
  const blockedReveal = gateReport.blockedByAudience.crewDirector.find((entry) => entry.id === revealCard.id);
  if (!blockedReveal || blockedReveal.reason !== 'knowledgeGate') {
    fail(location, `crewDirector should block reveal card ${revealCard.id} on knowledgeGate before trust is earned`);
  }

  const index = indexDirectorDatasets({ crewDataset: dataset });
  const narratorHydration = firstHydratedCard(hydrateDirectorCards({
    index,
    cardIds: [voiceCard.id],
    audience: 'narrator'
  }));
  const crewHydration = firstHydratedCard(hydrateDirectorCards({
    index,
    cardIds: [voiceCard.id],
    audience: 'crewDirector'
  }));

  if (!narratorHydration?.guidance?.voiceCapsule) {
    fail(location, `narrator hydration should include compact voice capsule for ${voiceCard.id}`);
  }
  if (narratorHydration?.guidance?.voiceCapsule?.exampleLineShapes?.length !== 1) {
    fail(location, 'narrator hydration should include exactly one compact example line shape');
  }
  if (!crewHydration?.guidance?.voiceCapsule) {
    fail(location, `crewDirector hydration should include compact voice capsule for ${voiceCard.id}`);
  }
  if (crewHydration?.guidance?.voiceCapsule?.exampleLineShapes?.length !== 1) {
    fail(location, 'crewDirector hydration should include exactly one compact example line shape');
  }
}

if (errors.length > 0) {
  console.error('Rich crew runtime hydration validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Rich crew runtime hydration passed for ${BUNDLED_CAMPAIGN_PACKAGE_REFS.length} bundled campaign dataset(s).`);
