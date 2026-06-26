import assert from 'node:assert/strict';

import {
  createCreatorRuntimeService,
  creatorInputReadyForReview,
  creatorReviewHasGaps,
  flatFieldsToPatch
} from '../../src/runtime/creator-runtime-service.mjs';

const readyInput = {
  identity: {
    name: 'Talia Renn',
    pronounsOrAddress: 'she/her',
    speciesId: 'human',
    ageBandId: 'adult',
    appearance: 'Short dark hair and command-red uniform.'
  },
  service: {
    careerBackgroundId: 'operations',
    formativeExperienceId: 'border-crisis',
    assignmentReasonId: 'field-command'
  },
  personality: {
    traits: {
      insight: 'Reads the room quickly.',
      connection: 'Builds trust with candor.',
      execution: 'Acts decisively.'
    },
    flawId: 'overextends'
  },
  dossier: {}
};

assert.equal(creatorInputReadyForReview(readyInput), true);
assert.equal(creatorReviewHasGaps(readyInput), true);
assert.equal(creatorInputReadyForReview({
  ...readyInput,
  identity: { ...readyInput.identity, name: '' }
}), false);
assert.equal(creatorReviewHasGaps({
  ...readyInput,
  dossier: { briefBiography: 'Known officer.', publicReputation: 'Trusted by the crew.' }
}), false);

assert.deepEqual(flatFieldsToPatch({
  'dossier.briefBiography': 'Known officer.',
  'dossier.publicReputation': 'Trusted by the crew.',
  'identity.name': 'Replacement'
}, {
  baseInput: readyInput,
  missingOnly: true
}), {
  dossier: {
    briefBiography: 'Known officer.',
    publicReputation: 'Trusted by the crew.'
  }
});

let lastResult = null;
const calls = [];
const service = createCreatorRuntimeService({
  getCreatorView: () => ({
    package: { id: 'pkg-a' },
    activeStep: 'review',
    input: readyInput
  }),
  activeCreatorRuntimeAssets: () => ({
    packageData: { manifest: { id: 'pkg-a' } }
  }),
  setLastSectionDraftResult: (result) => {
    lastResult = result;
  },
  sectionDraftRunner: async (request) => {
    calls.push(request);
    return {
      ok: true,
      sectionId: request.sectionId,
      fields: {
        'dossier.briefBiography': 'Known officer.',
        'dossier.publicReputation': 'Trusted by the crew.',
        'identity.name': 'Ignored because present'
      }
    };
  }
});

const fallbackPatch = await service.appendReviewFallbackIfNeeded({
  activeStep: 'review',
  input: {}
});
assert.equal(calls[0].sectionId, 'review');
assert.equal(calls[0].generationRouter, null);
assert.equal(calls[0].useProvider, false);
assert.deepEqual(fallbackPatch.input.dossier, {
  briefBiography: 'Known officer.',
  publicReputation: 'Trusted by the crew.'
});
assert.equal(fallbackPatch.input.identity, undefined, 'fallback should not overwrite present fields');
assert.equal(lastResult.autoApplied, true);

const generated = await service.generateSectionDraft({
  sectionId: 'service',
  input: { dossier: { publicReputation: 'Already known.' } },
  generationRouter: { providerForRole: () => null },
  useProvider: true,
  signal: 'signal'
});
assert.equal(generated.ok, true);
assert.equal(calls[1].sectionId, 'service');
assert.equal(calls[1].input.identity.name, 'Talia Renn');
assert.equal(calls[1].input.dossier.publicReputation, 'Already known.');
assert.equal(lastResult.sectionId, 'service');
