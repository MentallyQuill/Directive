import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CHARACTER_CREATOR_SECTION_DRAFT_ROLE_ID,
  buildCharacterCreatorSectionDraftRequest,
  runCharacterCreatorSectionDraft
} from '../../src/creators/character-creator-assist.mjs';

const root = process.cwd();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
}

function createGenerationRouter(response) {
  const calls = [];
  return {
    async generate(roleId, request) {
      calls.push({ roleId, request });
      return {
        ok: true,
        response,
        diagnostics: {
          providerId: 'fake-character-creator',
          model: 'fake-reasoner',
          usage: { total_tokens: 128 }
        }
      };
    },
    calls() {
      return calls;
    }
  };
}

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');

const fallbackIdentity = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {},
  useProvider: false
});
assert.equal(fallbackIdentity.ok, true);
assert.equal(fallbackIdentity.source, 'deterministic-fallback');
assert.equal(fallbackIdentity.sectionId, 'identity');
assert.equal(fallbackIdentity.mode, 'create');
assert.equal(fallbackIdentity.fields['identity.name'], 'Ari Venn');
assert.equal(fallbackIdentity.fields['identity.speciesId'], 'human');
assert.equal(fallbackIdentity.requestSnapshot.allowedOptions['identity.speciesId'].some((option) => option.id === 'human'), true);

const validRouter = createGenerationRouter({
  text: JSON.stringify({
    kind: 'directive.characterCreatorSectionDraftResult',
    sectionId: 'identity',
    mode: 'refine',
    fields: {
      'identity.name': 'Talia Renn',
      'identity.speciesId': 'trill',
      identity: {
        appearance: 'A composed Starfleet officer with close-cropped hair and a quiet, observant posture.'
      }
    },
    notes: ['Kept the existing command role grounded.'],
    warnings: []
  })
});
const providerIdentity = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {
    identity: {
      name: 'Talia'
    }
  },
  generationRouter: validRouter
});
assert.equal(providerIdentity.source, 'provider');
assert.equal(providerIdentity.mode, 'refine');
assert.equal(providerIdentity.fields['identity.name'], 'Talia Renn');
assert.equal(providerIdentity.fields['identity.speciesId'], 'trill');
assert.match(providerIdentity.fields['identity.appearance'], /observant posture/);
assert.equal(validRouter.calls()[0].roleId, CHARACTER_CREATOR_SECTION_DRAFT_ROLE_ID);
assert.equal(validRouter.calls()[0].request.kind, 'directive.characterCreatorSectionDraftRequest');
assert.equal(validRouter.calls()[0].request.modelPreferences.capability, 'reasoning-writing');

const invalidRouter = createGenerationRouter({
  text: JSON.stringify({
    sectionId: 'identity',
    fields: {
      'identity.speciesId': 'klingon',
      'service.careerBackgroundId': 'tactical-security'
    }
  })
});
const rejectedIdentity = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {},
  generationRouter: invalidRouter
});
assert.equal(rejectedIdentity.source, 'deterministic-fallback');
assert.equal(rejectedIdentity.diagnostics.providerUsed, true);
assert.equal(rejectedIdentity.diagnostics.providerOutputRejected, true);
assert.equal(rejectedIdentity.fields['identity.speciesId'], 'human');

const hiddenRouter = createGenerationRouter({
  text: JSON.stringify({
    sectionId: 'identity',
    fields: {
      'identity.name': 'Ari Venn',
      'identity.appearance': 'A commander privately tied to Pale Lantern.'
    }
  })
});
const hiddenBlocked = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {},
  generationRouter: hiddenRouter
});
assert.equal(hiddenBlocked.source, 'deterministic-fallback');
assert.equal(hiddenBlocked.diagnostics.hiddenLeakBlocked, true);
assert.equal(hiddenBlocked.diagnostics.hiddenLeakTerm, 'pale lantern');

const reviewFallback = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'review',
  input: {
    identity: {
      name: 'Talia Serrin',
      pronounsOrAddress: 'she/her',
      speciesId: 'human',
      ageBandId: 'mid-career',
      appearance: 'A composed officer with a quiet voice.'
    },
    service: {
      careerBackgroundId: 'tactical-security',
      formativeExperienceId: 'dominion-war-fleet-service',
      assignmentReasonId: 'experienced-outsider-transfer'
    },
    personality: {
      traits: {
        insight: 'perceptive',
        connection: 'candid',
        execution: 'decisive'
      },
      flawId: 'impatient'
    },
    dossier: {}
  },
  useProvider: false
});
assert.match(reviewFallback.fields['dossier.briefBiography'], /Talia Serrin/);
assert.match(reviewFallback.fields['dossier.briefBiography'], /Tactical and security|tactical/i);
assert.match(reviewFallback.fields['dossier.publicReputation'], /Talia Serrin/);

const { request } = buildCharacterCreatorSectionDraftRequest({
  packageData,
  sectionId: 'service',
  input: {}
});
assert.doesNotMatch(request.prompt, /"relationships"\s*:/);
assert.doesNotMatch(request.prompt, /"hiddenFacts"\s*:/);
assert.equal(request.prompt.includes('Pale Lantern'), false);

console.log('Character Creator assist tests passed: provider contract, safety validation, local fallback, and review dossier generation');
