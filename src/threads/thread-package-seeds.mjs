import { createThreadLedger, normalizeThreadRecord } from './thread-ledger.mjs';

function asArray(value) { return Array.isArray(value) ? value : []; }

export function createSeededThreadLedger(packageData) {
  const records = asArray(packageData?.threadTemplates?.templates)
    .filter((template) => template.authoredSeed)
    .map((template) => normalizeThreadRecord({
      id: template.authoredSeed.id || `thread.seed.${template.id}`,
      status: template.authoredSeed.status || 'latent',
      shape: template.authoredSeed.shape || template.defaultShape || 'character_thread',
      type: template.authoredSeed.type || template.threadType || 'crew_growth',
      episodeFunction: template.authoredSeed.episodeFunction || 'setup',
      source: { id: `package:${template.id}`, type: 'authored-seed' },
      participants: asArray(template.authoredSeed.participants),
      title: template.title,
      playerSummary: '',
      observableSeed: template.authoredSeed.observableSeed,
      storyQuestion: template.authoredSeed.storyQuestion || template.storyQuestionPattern,
      naturalTrigger: template.naturalTrigger,
      linkedCrewIds: asArray(template.authoredSeed.participants),
      tags: asArray(template.tags),
      supportingEvidence: [{ source: { id: `package:${template.id}`, type: 'authored-seed' }, summary: template.authoredSeed.observableSeed, visibility: 'hidden', tags: asArray(template.tags) }],
      bearingPotential: { eligible: false }
    }));
  return createThreadLedger({ records });
}
