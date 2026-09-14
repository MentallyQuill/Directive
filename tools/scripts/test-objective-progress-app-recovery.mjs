import assert from 'node:assert/strict';

import {
  createFakeDirectiveHost,
  createFakeGenerationClient,
} from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import {
  V1_STORAGE_PATHS,
  loadV1CampaignSave,
} from '../../src/storage/v1-storage-repository.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const objectiveId = 'objective.prelude.command-handover';
const termsEvent = 'event.prelude.command-handover-terms-settled';
const completionEvent = 'event.prelude.command-handover-completed';
const unrelatedFact = 'fact.prelude.poker-invitation';

let releaseLateResponse;
let reportLateResponseStarted;
const lateResponseStarted = new Promise((resolve) => {
  reportLateResponseStarted = resolve;
});
let lateSignal;

function acceptedInterpretation(request) {
  const content = request.messages[1].content;
  const context = JSON.parse(content.slice(content.indexOf('{')));
  const assistantText = context.sourcePair.previousAssistant.text;
  const claims = [];
  let scenePacing = {
    objectiveId,
    intent: 'continue',
    intentQuote: '',
    missionDepartureQuote: '',
    unresolved: 'The command handover remains in progress.',
    participation: [],
  };

  if (assistantText.includes('authority and escalation boundaries')) {
    scenePacing = {
      ...scenePacing,
      unresolved: 'Whitaker must respond to the requested authority.',
      participation: [{
        requirement: 0,
        playerQuote: 'I need watch assignments and personnel coordination;',
        assistantQuote: 'Which authority and escalation boundaries do you need?',
      }],
    };
  }
  if (assistantText.includes('settle authority, escalation, and working-boundary terms')) {
    claims.push({
      candidateId: 'policy.prelude.command-handover-terms-settled',
      sourceSlot: 'previousAssistant',
      evidenceQuote: 'Whitaker and the XO settle authority, escalation, and working-boundary terms.',
    });
    scenePacing = {
      ...scenePacing,
      intent: 'resolve',
      intentQuote: 'Please complete the authority transfer.',
      unresolved: '',
      participation: [{
        requirement: 1,
        playerQuote: 'I accept these terms.',
        assistantQuote: 'The proposed watch assignments are yours.',
      }],
    };
  }
  if (assistantText.includes('mistakenly declares the practical command handover complete')) {
    claims.push(
      {
        candidateId: 'policy.prelude.command-handover-completed',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'Whitaker mistakenly declares the practical command handover complete.',
      },
      {
        candidateId: 'policy.prelude.poker-invitation-disclosed',
        sourceSlot: 'previousAssistant',
        evidenceQuote: 'Vale invites the XO to the established junior-officer poker game after first watch.',
      },
    );
  }
  if (assistantText.includes('late analyst repeats the mistaken completion')) {
    claims.push({
      candidateId: 'policy.prelude.command-handover-completed',
      sourceSlot: 'previousAssistant',
      evidenceQuote: 'The late analyst repeats the mistaken completion.',
    });
  }

  return {
    kind: 'directive.missionEvidenceInterpretation.v1',
    assistantAcceptance: 'accepted',
    claims,
    peopleEvents: [],
    abstained: claims.length === 0,
    time: {
      decision: 'unchanged',
      basis: 'noPassage',
      elapsedSeconds: 0,
      reason: 'No story time passes in this fixture.',
      confidence: 1,
    },
    scenePacing,
  };
}

const generation = createFakeGenerationClient({
  responses: {
    acceptedPairMissionEvidence: async ({ request, rawOptions }) => {
      const interpretation = acceptedInterpretation(request);
      const content = request.messages[1].content;
      const context = JSON.parse(content.slice(content.indexOf('{')));
      if (context.sourcePair.previousAssistant.text.includes('late analyst repeats')) {
        lateSignal = rawOptions.signal;
        reportLateResponseStarted();
        await new Promise((resolve) => {
          releaseLateResponse = resolve;
        });
      }
      return { text: JSON.stringify(interpretation), providerId: 'fake-objective-recovery' };
    },
  },
});
const host = createFakeDirectiveHost({ chatNative: true, generation });
let sequence = 0;
const createApp = (now) => createDirectiveRuntimeApp({
  host,
  packageLoader: async () => loadAshesRuntimeAssets(),
  idFactory: (prefix) => `${prefix}.objective-recovery.${++sequence}`,
  now: () => now,
});
const app = createApp('2026-09-14T16:00:00.000Z');
await app.initialize();
await app.startCreatorDraft();
await app.saveCreatorDraft({
  patch: {
    activeStep: 'review',
    input: {
      identity: {
        name: 'Objective Recovery Tester',
        pronounsOrAddress: 'they/them',
        speciesId: 'human',
        ageBandId: 'mid-career',
        appearance: 'Attentive.',
      },
      service: {
        careerBackgroundId: 'tactical-security',
        formativeExperienceId: 'dominion-war-fleet-service',
        assignmentReasonId: 'experienced-outsider-transfer',
      },
      personality: {
        traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' },
        flawId: 'impatient',
      },
      dossier: {
        briefBiography: 'A command officer committed to careful reconstruction.',
        publicReputation: 'An attentive command officer.',
      },
    },
  },
});
await app.acceptCreatorDraftAndStartCampaign();

async function settlePair(number, assistantText, playerText) {
  const promptingPlayer = host.chat.pushPlayerMessage({
    text: `Prompt for accepted pair ${number}.`,
    hostMessageId: `objective-recovery.prompt.${number}`,
  });
  host.chat.pushAssistantMessage({
    text: assistantText,
    hostMessageId: `objective-recovery.assistant.${number}`,
    metadata: { promptingPlayerHostMessageId: promptingPlayer.hostMessageId },
  });
  const player = host.chat.pushPlayerMessage({
    text: playerText,
    hostMessageId: `objective-recovery.player.${number}`,
  });
  const result = await app.observeHostPlayerMessage({ message: player });
  assert.equal(result.mission?.ok, true, JSON.stringify(result));
}

await settlePair(
  1,
  'Which authority and escalation boundaries do you need?',
  'I need watch assignments and personnel coordination; I will escalate tactical orders.',
);
await settlePair(
  2,
  'Whitaker and the XO settle authority, escalation, and working-boundary terms. The proposed watch assignments are yours.',
  'I accept these terms. Please complete the authority transfer.',
);
await settlePair(
  3,
  'Whitaker mistakenly declares the practical command handover complete. Vale invites the XO to the established junior-officer poker game after first watch.',
  'I accept the reply, but the practical authority transfer is not actually finished.',
);

let view = await app.getCurrentView({ tabId: 'mission' });
let objective = view.v1PlayerProjection.mission.objectives.find((item) => item.id === objectiveId);
assert.equal(objective.status, 'terminal');
assert.equal(view.campaignState.mission.v1.events.includes(termsEvent), true);
assert.equal(view.campaignState.mission.v1.knownFacts.includes(unrelatedFact), true);
const acceptedState = structuredClone(view.campaignState);
const acceptedRevision = view.campaignState.stateCustody.revision;
const activeSaveId = view.activeSaveId;

const latePromptingPlayer = host.chat.pushPlayerMessage({
  text: 'Review the current state once more.',
  hostMessageId: 'objective-recovery.prompt.4',
});
host.chat.pushAssistantMessage({
  text: 'The late analyst repeats the mistaken completion.',
  hostMessageId: 'objective-recovery.assistant.4',
  metadata: { promptingPlayerHostMessageId: latePromptingPlayer.hostMessageId },
});
const latePlayer = host.chat.pushPlayerMessage({
  text: 'No, the transfer still is not complete.',
  hostMessageId: 'objective-recovery.player.4',
});
const lateSettlement = app.observeHostPlayerMessage({ message: latePlayer });
await lateResponseStarted;

const originalWriteJson = host.storage.writeJson;
const activeManifestPath = V1_STORAGE_PATHS.save(activeSaveId);
let manifestFailureInjected = false;
host.storage.writeJson = async (path, value) => {
  if (path === activeManifestPath && !manifestFailureInjected) {
    manifestFailureInjected = true;
    throw new Error('forced objective correction manifest failure');
  }
  return originalWriteJson.call(host.storage, path, value);
};
const correction = {
  missionId: view.v1PlayerProjection.mission.missionId,
  objectiveId,
  expectedRunId: view.v1PlayerProjection.mission.runId,
  expectedRevision: objective.progressControl.expectedRevision,
  action: 'reopen',
};
const failedCorrectionPromise = app.adjustObjectiveProgress(correction);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(lateSignal.aborted, true);
releaseLateResponse();
const lateResult = await lateSettlement;
assert.equal(lateResult.mission.reasonCode, 'provider-aborted');
const failedCorrection = await failedCorrectionPromise;
assert.equal(failedCorrection.ok, false);
assert.equal(manifestFailureInjected, true);

view = await app.getCurrentView({ tabId: 'mission' });
assert.deepEqual(view.campaignState, acceptedState, 'failed save rolls the correction back without accepting the late result');
assert.deepEqual(
  (await loadV1CampaignSave(host.storage, activeSaveId)).state,
  acceptedState,
  'failed save leaves the prior durable authority intact',
);

host.storage.writeJson = originalWriteJson;
assert.equal((await app.adjustObjectiveProgress(correction)).ok, true);
view = await app.getCurrentView({ tabId: 'mission' });
objective = view.v1PlayerProjection.mission.objectives.find((item) => item.id === objectiveId);
assert.equal(view.campaignState.stateCustody.revision, acceptedRevision + 1);
assert.equal(objective.progressControl.mode, 'confirmation_required');
assert.equal(view.campaignState.mission.v1.events.includes(termsEvent), true);
assert.equal(view.campaignState.mission.v1.events.includes(completionEvent), false);
assert.equal(view.campaignState.mission.v1.knownFacts.includes(unrelatedFact), true);

const reloadedApp = createApp('2026-09-14T16:05:00.000Z');
await reloadedApp.initialize();
const reloaded = await reloadedApp.getCurrentView({ tabId: 'mission' });
const reloadedObjective = reloaded.v1PlayerProjection.mission.objectives.find((item) => item.id === objectiveId);
assert.equal(reloaded.activeSaveId, activeSaveId);
assert.equal(reloaded.campaignState.stateCustody.revision, acceptedRevision + 1);
assert.equal(reloadedObjective.progressControl.mode, 'confirmation_required');
assert.equal(reloaded.campaignState.mission.v1.events.includes(termsEvent), true);
assert.equal(reloaded.campaignState.mission.v1.events.includes(completionEvent), false);
assert.equal(reloaded.campaignState.mission.v1.knownFacts.includes(unrelatedFact), true);

console.log('Objective correction survives late analysis, failed save, retry, and reload.');
