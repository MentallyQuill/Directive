import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CHARACTER_CREATOR_SELF_FILL_CHARACTER_TARGET,
  CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT,
  CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS,
  CHARACTER_CREATOR_SECTION_DRAFT_TIMEOUT_RETRY_LIMIT,
  CHARACTER_CREATOR_SECTION_DRAFT_UTILITY_TIMEOUT_MS,
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
    async generate(roleId, request, options = {}) {
      calls.push({ roleId, request, options });
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

function longSelfFillText(seed, minimumLength = CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT + 160) {
  const sentence = `${seed} `;
  let text = sentence;
  while (text.length <= minimumLength) text += sentence;
  return text.trim();
}

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
assert.match(fallbackIdentity.fields['identity.appearance'], /steady presence expected of the Executive Officer/);
assert.doesNotMatch(fallbackIdentity.fields['identity.appearance'], /calm command presence/);
assert.equal(fallbackIdentity.requestSnapshot.allowedOptions['identity.speciesId'].some((option) => option.id === 'human'), true);

const fallbackService = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'service',
  input: {},
  useProvider: false
});
assert.equal(fallbackService.source, 'deterministic-fallback');
assert.equal(fallbackService.fields['service.careerBackgroundId'], 'operations-logistics');
assert.match(fallbackService.fields['dossier.serviceSummary'], /Service record centers on operations and logistics/);
assert.equal(fallbackService.requestSnapshot.textFields.includes('dossier.serviceSummary'), true);

const fallbackPersonality = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'personality',
  input: {},
  useProvider: false
});
assert.equal(fallbackPersonality.source, 'deterministic-fallback');
assert.equal(fallbackPersonality.fields['personality.traits.insight'], 'perceptive');
assert.match(fallbackPersonality.fields['dossier.traits'], /Command style reads as perceptive/);
assert.equal(fallbackPersonality.requestSnapshot.textFields.includes('dossier.traits'), true);

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
assert.equal(validRouter.calls()[0].options.providerKind, 'reasoning');
assert.equal(validRouter.calls()[0].options.timeoutMs, CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS);

const retryRouterCalls = [];
const retryRouter = {
  async generate(roleId, request, options = {}) {
    retryRouterCalls.push({ roleId, request, options });
    if (retryRouterCalls.length === 1) {
      return {
        ok: false,
        error: {
          code: 'DIRECTIVE_GENERATION_TIMEOUT',
          message: 'reasoner timed out',
          retryable: true
        },
        diagnostics: {}
      };
    }
    return {
      ok: true,
      response: {
        text: JSON.stringify({
          kind: 'directive.characterCreatorSectionDraftResult',
          sectionId: 'identity',
          mode: 'refine',
          fields: {
            'identity.name': 'Talia Renn',
            'identity.speciesId': 'trill',
            'identity.appearance': 'A composed Starfleet officer with a patient command presence.'
          },
          notes: [],
          warnings: []
        })
      },
      diagnostics: {
        providerId: 'fake-character-creator',
        model: 'fake-reasoner'
      }
    };
  }
};
const retryIdentity = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {
    identity: {
      name: 'Talia'
    }
  },
  generationRouter: retryRouter
});
assert.equal(CHARACTER_CREATOR_SECTION_DRAFT_TIMEOUT_RETRY_LIMIT, 1);
assert.equal(retryRouterCalls.length, 2, 'Character Creator section drafts should retry once after a timeout');
assert.deepEqual(retryRouterCalls.map((call) => call.options.providerKind), ['reasoning', 'reasoning']);
assert.deepEqual(retryRouterCalls.map((call) => call.options.timeoutMs), [
  CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS,
  CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS
]);
assert.equal(retryIdentity.source, 'provider');
assert.equal(retryIdentity.diagnostics.timeoutRetryCount, 1);
assert.equal(retryIdentity.diagnostics.finalProviderKind, 'reasoning');
assert.equal(retryIdentity.fields['identity.name'], 'Talia Renn');

const utilityFallbackRouterCalls = [];
const utilityFallbackProgress = [];
const utilityFallbackRouter = {
  async generate(roleId, request, options = {}) {
    utilityFallbackRouterCalls.push({ roleId, request, options });
    if (utilityFallbackRouterCalls.length <= 2) {
      return {
        ok: false,
        error: {
          code: 'DIRECTIVE_GENERATION_TIMEOUT',
          message: 'reasoner timed out',
          retryable: true
        },
        diagnostics: {}
      };
    }
    return {
      ok: true,
      response: {
        text: JSON.stringify({
          kind: 'directive.characterCreatorSectionDraftResult',
          sectionId: 'identity',
          mode: 'refine',
          fields: {
            'identity.name': 'Talia Renn',
            'identity.speciesId': 'trill',
            'identity.appearance': 'A composed Starfleet officer with a patient command presence.'
          },
          notes: [],
          warnings: []
        })
      },
      diagnostics: {
        providerId: 'fake-character-creator',
        model: 'fake-utility'
      }
    };
  }
};
const utilityFallbackIdentity = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {
    identity: {
      name: 'Talia'
    }
  },
  generationRouter: utilityFallbackRouter,
  onProgress: (progress) => utilityFallbackProgress.push(progress)
});
assert.equal(utilityFallbackIdentity.source, 'provider');
assert.equal(utilityFallbackIdentity.diagnostics.finalProviderKind, 'utility');
assert.equal(utilityFallbackIdentity.diagnostics.utilityFallbackAttempted, true);
assert.equal(utilityFallbackIdentity.diagnostics.providerAttempts.length, 3);
assert.deepEqual(utilityFallbackRouterCalls.map((call) => call.options.providerKind), ['reasoning', 'reasoning', 'utility']);
assert.deepEqual(utilityFallbackRouterCalls.map((call) => call.options.timeoutMs), [
  CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS,
  CHARACTER_CREATOR_SECTION_DRAFT_REASONING_TIMEOUT_MS,
  CHARACTER_CREATOR_SECTION_DRAFT_UTILITY_TIMEOUT_MS
]);
assert.deepEqual(utilityFallbackProgress.map((entry) => entry.message), [
  'Generating with Reasoning...',
  'Reasoning timed out. Retrying Reasoning...',
  'Reasoning timed out again. Trying Utility...'
]);

const localFallbackAfterUtilityCalls = [];
const localFallbackAfterUtilityProgress = [];
const localFallbackAfterUtilityRouter = {
  async generate(roleId, request, options = {}) {
    localFallbackAfterUtilityCalls.push({ roleId, request, options });
    return {
      ok: false,
      error: {
        code: 'DIRECTIVE_GENERATION_TIMEOUT',
        message: `${options.providerKind} timed out`,
        retryable: true
      },
      diagnostics: {}
    };
  }
};
const localFallbackAfterUtility = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {},
  generationRouter: localFallbackAfterUtilityRouter,
  onProgress: (progress) => localFallbackAfterUtilityProgress.push(progress)
});
assert.equal(localFallbackAfterUtility.source, 'deterministic-fallback');
assert.equal(localFallbackAfterUtility.diagnostics.providerUsed, true);
assert.equal(localFallbackAfterUtility.diagnostics.providerOutputRejected, true);
assert.equal(localFallbackAfterUtility.diagnostics.finalProviderKind, 'utility');
assert.equal(localFallbackAfterUtility.diagnostics.providerAttempts.length, 3);
assert.equal(localFallbackAfterUtilityCalls.length, 3);
assert.equal(localFallbackAfterUtilityProgress.at(-1).message, 'Utility timed out. Using local fallback...');

const canceledController = new AbortController();
const canceledRouterCalls = [];
const canceledRouter = {
  async generate(roleId, request, options = {}) {
    canceledRouterCalls.push({ roleId, request, options });
    return {
      ok: false,
      error: {
        code: 'DIRECTIVE_GENERATION_ABORTED',
        message: 'Draft canceled.',
        retryable: false
      },
      diagnostics: {}
    };
  }
};
canceledController.abort();
const canceledIdentity = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {},
  generationRouter: canceledRouter,
  signal: canceledController.signal
});
assert.equal(canceledRouterCalls.length, 1);
assert.equal(canceledRouterCalls[0].options.signal, canceledController.signal);
assert.equal(canceledIdentity.ok, false);
assert.equal(canceledIdentity.source, 'canceled');
assert.equal(canceledIdentity.diagnostics.canceled, true);
assert.deepEqual(canceledIdentity.fields, {});

const partialRouter = createGenerationRouter({
  text: JSON.stringify({
    kind: 'directive.characterCreatorSectionDraftResult',
    sectionId: 'identity',
    mode: 'refine',
    fields: {
      'identity.name': 'Sam Vickers',
      'identity.speciesId': 'human',
      'identity.ageBandId': 'mid-career'
    },
    notes: ['Retained supplied identity inputs.'],
    warnings: []
  })
});
const supplementedPartialIdentity = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'identity',
  input: {
    identity: {
      name: 'Sam Vickers',
      speciesId: 'human',
      ageBandId: 'mid-career'
    }
  },
  generationRouter: partialRouter
});
assert.equal(supplementedPartialIdentity.source, 'provider');
assert.equal(supplementedPartialIdentity.mode, 'refine');
assert.equal(supplementedPartialIdentity.fields['identity.name'], 'Sam Vickers');
assert.equal(supplementedPartialIdentity.fields['identity.pronounsOrAddress'], 'they/them');
assert.match(supplementedPartialIdentity.fields['identity.appearance'], /steady presence expected of the Executive Officer/);
assert.match(supplementedPartialIdentity.warnings.join(' '), /Filled 2 missing section fields/);

const serviceRouter = createGenerationRouter({
  text: JSON.stringify({
    kind: 'directive.characterCreatorSectionDraftResult',
    sectionId: 'service',
    mode: 'refine',
    fields: {
      'service.careerBackgroundId': 'tactical-security',
      'service.formativeExperienceId': 'dominion-war-fleet-service',
      'service.assignmentReasonId': 'experienced-outsider-transfer',
      'dossier.serviceSummary': 'Tactical and security service, Dominion War fleet experience, and outsider transfer status frame the officer as disciplined but still new to the Breckenridge.'
    },
    notes: ['Turned dropdown choices into an editable service note.'],
    warnings: []
  })
});
const providerService = await runCharacterCreatorSectionDraft({
  packageData,
  sectionId: 'service',
  input: {
    service: {
      careerBackgroundId: 'tactical-security',
      formativeExperienceId: 'dominion-war-fleet-service',
      assignmentReasonId: 'experienced-outsider-transfer'
    }
  },
  generationRouter: serviceRouter
});
assert.equal(providerService.source, 'provider');
assert.match(providerService.fields['dossier.serviceSummary'], /editable service note|outsider transfer/i);

const overLimitBiography = longSelfFillText('Talia Serrin remains a grounded Starfleet commander whose Dominion War fleet service, careful bridge bearing, and recent transfer give the Breckenridge a disciplined executive officer who still has room to earn trust through visible decisions.');
const overLimitReputation = longSelfFillText('Talia Serrin is known as a composed officer whose service record suggests steady judgment under pressure and practical concern for crews in difficult assignments.', CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT + 80);
const longReviewRouter = createGenerationRouter({
  text: JSON.stringify({
    kind: 'directive.characterCreatorSectionDraftResult',
    sectionId: 'review',
    mode: 'refine',
    fields: {
      'dossier.briefBiography': overLimitBiography,
      'dossier.publicReputation': overLimitReputation
    },
    notes: ['Returned complete over-limit self-fill text for operator review.'],
    warnings: []
  })
});
const providerReview = await runCharacterCreatorSectionDraft({
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
    }
  },
  generationRouter: longReviewRouter
});
assert.equal(providerReview.source, 'provider');
assert.equal(providerReview.fields['dossier.briefBiography'], overLimitBiography);
assert.equal(providerReview.fields['dossier.publicReputation'], overLimitReputation);
assert(providerReview.fields['dossier.briefBiography'].length > CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT);
assert.doesNotMatch(providerReview.fields['dossier.briefBiography'], /\.\.\.$/);

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

const { request, snapshot } = buildCharacterCreatorSectionDraftRequest({
  packageData,
  sectionId: 'service',
  input: {}
});
assert.equal(snapshot.fieldLimits['dossier.serviceSummary'], CHARACTER_CREATOR_SELF_FILL_CHAR_LIMIT);
assert.deepEqual(snapshot.selfFillCharacterTarget, CHARACTER_CREATOR_SELF_FILL_CHARACTER_TARGET);
assert.match(request.prompt, /600-800 characters/);
assert.match(request.prompt, /1500-character box limit/);
assert.doesNotMatch(request.prompt, /"relationships"\s*:/);
assert.doesNotMatch(request.prompt, /"hiddenFacts"\s*:/);
assert.equal(request.prompt.includes('Pale Lantern'), false);

console.log('Character Creator assist tests passed: provider contract, safety validation, local fallback, and review dossier generation');
