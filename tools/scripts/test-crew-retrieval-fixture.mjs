import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_FIXTURE_DIR = 'tests/fixtures/retrieval';

const root = process.cwd();
const fixturePaths = process.argv.length > 2
  ? process.argv.slice(2).map((fixture) => path.resolve(root, fixture))
  : fs.readdirSync(path.resolve(root, DEFAULT_FIXTURE_DIR))
    .filter((fileName) => fileName.endsWith('.fixture.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => path.resolve(root, DEFAULT_FIXTURE_DIR, fileName));

const knowledgeRank = Object.freeze({
  none: 0,
  serviceRecord: 1,
  professionalConversation: 2,
  highTrust: 3,
  crisisDisclosure: 3,
  revealed: 4
});

const errors = [];

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${path.relative(root, filePath)} is not valid JSON: ${error.message}`);
  }
}

function rel(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function at(location, message) {
  errors.push(`${location}: ${message}`);
}

function sorted(value) {
  return [...(Array.isArray(value) ? value : [])].sort((a, b) => String(a).localeCompare(String(b)));
}

function sameArray(actual, expected) {
  const a = sorted(actual);
  const e = sorted(expected);
  return a.length === e.length && a.every((value, index) => value === e[index]);
}

function primaryCharacter(card) {
  return (card.scope?.characters || []).find((id) => id !== 'player-commander') || '';
}

function scopeMatches(card, scene) {
  const present = new Set(scene.presentCharacters || []);
  const scopedCharacters = card.scope?.characters || [];
  if (scopedCharacters.length && !scopedCharacters.some((id) => present.has(id))) {
    return { ok: false, reason: 'characterScope' };
  }

  const scopedMissions = card.scope?.missions || [];
  if (scopedMissions.length && !scopedMissions.includes(scene.missionId)) {
    return { ok: false, reason: 'missionScope' };
  }

  const scopedCampaigns = card.scope?.campaigns || [];
  if (scopedCampaigns.length && !scopedCampaigns.includes(scene.campaignId)) {
    return { ok: false, reason: 'campaignScope' };
  }

  const stardate = Number(scene.stardate);
  if (Number.isFinite(Number(card.scope?.stardateFrom)) && stardate < Number(card.scope.stardateFrom)) {
    return { ok: false, reason: 'stardateScope' };
  }
  if (Number.isFinite(Number(card.scope?.stardateTo)) && stardate > Number(card.scope.stardateTo)) {
    return { ok: false, reason: 'stardateScope' };
  }

  return { ok: true, reason: '' };
}

function gateMatches(card, scene) {
  const gates = card.gates || {};
  const requiredKnowledge = gates.playerKnowledge || 'none';
  const characterId = primaryCharacter(card);
  const currentKnowledge = scene.playerKnowledgeByCharacter?.[characterId] || 'none';
  if ((knowledgeRank[currentKnowledge] ?? 0) < (knowledgeRank[requiredKnowledge] ?? 0)) {
    return { ok: false, reason: 'knowledgeGate' };
  }

  if (gates.relationshipMin && characterId) {
    const relationship = scene.relationships?.[characterId] || {};
    for (const [dimension, minimum] of Object.entries(gates.relationshipMin)) {
      if ((Number(relationship[dimension]) || 0) < Number(minimum)) {
        return { ok: false, reason: 'relationshipGate' };
      }
    }
  }

  if (gates.developmentMin && characterId) {
    const development = scene.development?.[characterId] || {};
    for (const [dimension, minimum] of Object.entries(gates.developmentMin)) {
      const actual = development[dimension];
      if (typeof minimum === 'number' && (Number(actual) || 0) < minimum) {
        return { ok: false, reason: 'developmentGate' };
      }
      if (typeof minimum === 'string' && actual !== minimum) {
        return { ok: false, reason: 'developmentGate' };
      }
    }
  }

  return { ok: true, reason: '' };
}

function audienceSafetyMatches(card, audience) {
  if (!card.audiences?.includes(audience)) {
    return { ok: false, reason: 'wrongAudience', selectedCandidate: false };
  }
  if (audience === 'narrator') {
    if (card.visibility === 'directorOnly' || card.visibility === 'lockedHidden') {
      return { ok: false, reason: 'hiddenVisibility', selectedCandidate: true };
    }
    if (card.payload?.narratorSafe !== true) {
      return { ok: false, reason: 'narratorUnsafe', selectedCandidate: true };
    }
  }
  if (audience === 'commandLog' && card.visibility === 'lockedHidden') {
    return { ok: false, reason: 'hiddenVisibility', selectedCandidate: true };
  }
  return { ok: true, reason: '', selectedCandidate: true };
}

function buildPackets(dataset, scene) {
  const selectedByAudience = {};
  const blockedByAudience = {};

  for (const audience of scene.audiences || []) {
    selectedByAudience[audience] = [];
    blockedByAudience[audience] = [];
  }

  for (const card of dataset.cards || []) {
    const scope = scopeMatches(card, scene);
    const gate = scope.ok ? gateMatches(card, scene) : scope;
    for (const audience of scene.audiences || []) {
      const safety = audienceSafetyMatches(card, audience);
      if (!safety.selectedCandidate) {
        continue;
      }
      if (!scope.ok) {
        blockedByAudience[audience].push({ id: card.id, reason: scope.reason });
        continue;
      }
      if (!gate.ok) {
        blockedByAudience[audience].push({ id: card.id, reason: gate.reason });
        continue;
      }
      if (!safety.ok) {
        blockedByAudience[audience].push({ id: card.id, reason: safety.reason });
        continue;
      }
      selectedByAudience[audience].push(card.id);
    }
  }

  return { selectedByAudience, blockedByAudience };
}

function assertSelection(actual, expected, location) {
  for (const [audience, expectedIds] of Object.entries(expected || {})) {
    const actualIds = actual[audience] || [];
    if (!sameArray(actualIds, expectedIds)) {
      at(location, `${audience} selected ${JSON.stringify(sorted(actualIds))}, expected ${JSON.stringify(sorted(expectedIds))}`);
    }
  }
}

function assertBlocked(actual, expected, location) {
  for (const [audience, expectedBlocks] of Object.entries(expected || {})) {
    const actualBlocks = actual[audience] || [];
    for (const expectedBlock of expectedBlocks) {
      const found = actualBlocks.some((block) => block.id === expectedBlock.id && block.reason === expectedBlock.reason);
      if (!found) {
        at(location, `${audience} missing blocked card ${expectedBlock.id} with reason ${expectedBlock.reason}`);
      }
    }
  }
}

function assertForbidden(actual, forbidden, location) {
  for (const [audience, ids] of Object.entries(forbidden || {})) {
    const selected = new Set(actual[audience] || []);
    for (const id of ids) {
      if (selected.has(id)) {
        at(location, `${audience} must not select forbidden card ${id}`);
      }
    }
  }
}

for (const fixturePath of fixturePaths) {
  const fixture = readJson(fixturePath);
  const dataset = readJson(path.resolve(root, fixture.datasetPath));
  const result = buildPackets(dataset, fixture.sceneSnapshot || {});

  assertSelection(result.selectedByAudience, fixture.expected?.selectedByAudience, `${rel(fixturePath)} $.expected.selectedByAudience`);
  assertBlocked(result.blockedByAudience, fixture.expected?.blockedByAudience, `${rel(fixturePath)} $.expected.blockedByAudience`);
  assertForbidden(result.selectedByAudience, fixture.expected?.forbiddenByAudience, `${rel(fixturePath)} $.expected.forbiddenByAudience`);
}

if (errors.length > 0) {
  console.error('Crew retrieval fixture validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Crew retrieval fixtures passed: ${fixturePaths.map((fixturePath) => rel(fixturePath)).join(', ')}`);
