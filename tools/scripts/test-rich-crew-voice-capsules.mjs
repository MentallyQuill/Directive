import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_DATASET = 'packages/bundled/breckenridge/breckenridge-senior-staff.crew-dataset.json';

const root = process.cwd();
const datasetPath = path.resolve(root, process.argv[2] || DEFAULT_DATASET);
const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

const requiredFields = [
  'coreEngine',
  'contradiction',
  'speechMechanics',
  'pressureShift',
  'warmthHumor',
  'physicalTells',
  'exampleLineShapes',
  'avoid'
];

const requiredAxes = [
  'role-pressure',
  'warmth',
  'humor',
  'flaw',
  'relationship-mode',
  'ordinary-life',
  'stress-shift',
  'moral-engine'
];

const forbiddenRuntimeStyleReferences = [
  /\bBecky\s+Chambers\b/i,
  /\bPicard\b/i,
  /\bSisko\b/i,
  /\bJaneway\b/i,
  /\bwrite\s+like\b/i,
  /\bin\s+the\s+style\s+of\b/i,
  /\bimitat(?:e|es|ing|ion)\b/i
];

const spokenDialogueMarkers = /\b(?:don't|doesn't|didn't|can't|couldn't|wouldn't|isn't|aren't|I'm|you're|we're|they're|I've|we've|I'll|we'll|that's|there's|it's|won't|shouldn't|because|but|and|if|when|now|well|please|so|then)\b/i;

const errors = [];

function fail(location, message) {
  errors.push(`${location}: ${message}`);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value, location) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(location, 'must be a non-empty string');
    return false;
  }
  return true;
}

function requireStringArray(value, location, min = 1) {
  if (!Array.isArray(value)) {
    fail(location, 'must be an array');
    return false;
  }
  if (value.length < min) {
    fail(location, `must include at least ${min} entries`);
  }
  value.forEach((entry, index) => requireString(entry, `${location}[${index}]`));
  return true;
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectStrings(entry, out));
    return out;
  }
  if (isObject(value)) {
    Object.values(value).forEach((entry) => collectStrings(entry, out));
  }
  return out;
}

function checkForbiddenRuntimeReferences(capsule, location) {
  const text = collectStrings(capsule).join('\n');
  for (const pattern of forbiddenRuntimeStyleReferences) {
    if (pattern.test(text)) {
      fail(location, `contains runtime style-reference text matching ${pattern}`);
    }
  }
}

function checkLineShapes(lineShapes, location) {
  if (!Array.isArray(lineShapes)) {
    fail(location, 'must be an array');
    return;
  }
  if (lineShapes.length < 8 || lineShapes.length > 12) {
    fail(location, 'must include 8 to 12 line shapes');
  }

  const ids = new Set();
  const axisCounts = new Map();
  let warmOrEaseCount = 0;
  let conversationalCount = 0;

  for (const [index, line] of lineShapes.entries()) {
    const lineLocation = `${location}[${index}]`;
    if (!isObject(line)) {
      fail(lineLocation, 'must be an object');
      continue;
    }

    if (requireString(line.id, `${lineLocation}.id`)) {
      if (ids.has(line.id)) {
        fail(`${lineLocation}.id`, `duplicate line-shape id "${line.id}"`);
      }
      ids.add(line.id);
    }
    requireString(line.situation, `${lineLocation}.situation`);
    if (requireString(line.shape, `${lineLocation}.shape`)) {
      const wordCount = line.shape.trim().split(/\s+/).length;
      if (wordCount < 5) {
        fail(`${lineLocation}.shape`, 'is too terse to teach dialogue shape');
      }
      if (wordCount > 45) {
        fail(`${lineLocation}.shape`, 'is too long for a compact line shape');
      }
      if (spokenDialogueMarkers.test(line.shape)) {
        conversationalCount += 1;
      }
    }

    if (!Array.isArray(line.bibleAxes) || line.bibleAxes.length === 0) {
      fail(`${lineLocation}.bibleAxes`, 'must be a non-empty array');
      continue;
    }
    for (const axis of line.bibleAxes) {
      if (!requiredAxes.includes(axis)) {
        fail(`${lineLocation}.bibleAxes`, `unknown bible axis "${axis}"`);
      }
      axisCounts.set(axis, (axisCounts.get(axis) || 0) + 1);
      if (axis === 'warmth') {
        warmOrEaseCount += 1;
      }
    }
  }

  for (const axis of requiredAxes) {
    if (!axisCounts.has(axis)) {
      fail(location, `must cover bible axis "${axis}"`);
    }
  }
  if (warmOrEaseCount < 2) {
    fail(location, 'must include at least two warmth/private-humanity examples');
  }
  if ((axisCounts.get('role-pressure') || 0) === lineShapes.length) {
    fail(location, 'must not make every line shape role-pressure oriented');
  }
  if (conversationalCount < Math.ceil(lineShapes.length / 2)) {
    fail(location, 'must include conversational connective tissue in at least half of line shapes');
  }
}

const voiceCards = (dataset.cards || []).filter((card) => card.type === 'crew.voice');
if (voiceCards.length === 0) {
  fail('$.cards', 'must contain crew.voice cards');
}

for (const card of voiceCards) {
  const location = `$.cards[id=${card.id}]`;
  if (!card.payload || !isObject(card.payload)) {
    fail(`${location}.payload`, 'must be an object');
    continue;
  }
  requireString(card.payload.summary, `${location}.payload.summary`);
  if (card.payload.narratorSafe !== true) {
    fail(`${location}.payload.narratorSafe`, 'must be true for active voice capsule hydration');
  }

  const capsule = card.payload.voiceCapsule;
  if (!isObject(capsule)) {
    fail(`${location}.payload.voiceCapsule`, 'must be an object');
    continue;
  }

  for (const field of requiredFields) {
    if (!(field in capsule)) {
      fail(`${location}.payload.voiceCapsule.${field}`, 'is required');
    }
  }

  requireString(capsule.coreEngine, `${location}.payload.voiceCapsule.coreEngine`);
  requireString(capsule.contradiction, `${location}.payload.voiceCapsule.contradiction`);
  requireStringArray(capsule.speechMechanics, `${location}.payload.voiceCapsule.speechMechanics`, 2);
  requireStringArray(capsule.pressureShift, `${location}.payload.voiceCapsule.pressureShift`, 2);
  requireStringArray(capsule.warmthHumor, `${location}.payload.voiceCapsule.warmthHumor`, 2);
  requireStringArray(capsule.physicalTells, `${location}.payload.voiceCapsule.physicalTells`, 2);
  requireStringArray(capsule.avoid, `${location}.payload.voiceCapsule.avoid`, 3);
  checkLineShapes(capsule.exampleLineShapes, `${location}.payload.voiceCapsule.exampleLineShapes`);
  checkForbiddenRuntimeReferences(capsule, `${location}.payload.voiceCapsule`);
}

if (errors.length > 0) {
  console.error(`Rich crew voice capsule validation failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Rich crew voice capsule validation passed for ${voiceCards.length} voice cards.`);
