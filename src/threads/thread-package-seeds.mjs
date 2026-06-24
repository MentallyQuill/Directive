import { createThreadLedger, normalizeThreadRecord } from './thread-ledger.mjs';

function asArray(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }

function authoredSeedObject(template) {
  return isObject(template?.authoredSeed) ? template.authoredSeed : {};
}

function templateStoryQuestion(template, seed) {
  return seed.storyQuestion
    || template.storyQuestionPattern
    || template.surfacing?.storyQuestion
    || 'Will this unresolved concern receive attention, and what will that attention change?';
}

function templateNaturalTrigger(template, seed) {
  return seed.naturalTrigger
    || template.naturalTrigger
    || template.surfacing?.naturalTrigger
    || 'During suitable downtime or when the concern naturally returns.';
}

function templateObservableSeed(template, seed) {
  return text(
    seed.observableSeed
    || template.observableSeed
    || template.summary
    || template.playerSummary
    || template.description
    || templateNaturalTrigger(template, seed)
    || template.title
  );
}

export function createSeededThreadLedger(packageData) {
  const records = asArray(packageData?.threadTemplates?.templates)
    .filter((template) => template.authoredSeed)
    .map((template) => {
      const seed = authoredSeedObject(template);
      const participants = asArray(seed.participants || seed.actorIds || template.actorIds);
      const observableSeed = templateObservableSeed(template, seed);
      return normalizeThreadRecord({
        id: seed.id || template.id || `thread.seed.${template.title || 'template'}`,
        status: seed.status || 'latent',
        shape: seed.shape || template.defaultShape || 'character_thread',
        type: seed.type || template.threadType || 'crew_growth',
        episodeFunction: seed.episodeFunction || 'setup',
        source: { id: `package:${template.id}`, type: 'authored-seed' },
        participants,
        title: template.title,
        playerSummary: seed.playerSummary || '',
        observableSeed,
        storyQuestion: templateStoryQuestion(template, seed),
        naturalTrigger: templateNaturalTrigger(template, seed),
        linkedCrewIds: participants,
        tags: asArray(template.tags),
        supportingEvidence: [{
          source: { id: `package:${template.id}`, type: 'authored-seed' },
          summary: observableSeed,
          visibility: 'hidden',
          tags: asArray(template.tags)
        }],
        bearingPotential: { eligible: false }
      });
    });
  return createThreadLedger({ records });
}
