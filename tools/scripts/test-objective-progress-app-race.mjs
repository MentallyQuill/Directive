import assert from 'node:assert/strict';
import { createFakeDirectiveHost, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

let started;
let release;
let observedSignal;
let began = new Promise(resolve => { started = resolve; });
const generation = createFakeGenerationClient({ responses: { acceptedPairMissionEvidence: async ({ rawOptions }) => {
  observedSignal = rawOptions.signal;
  started();
  await new Promise(resolve => { release = resolve; });
  return { text: JSON.stringify({ kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted', claims: [], abstained: true, time: { decision: 'unchanged', elapsedSeconds: 0, reason: 'No time passed.', confidence: 1 } }), providerId: 'fake-utility' };
} } });
const host = createFakeDirectiveHost({ chatNative: true, generation });
let sequence = 0;
const app = createDirectiveRuntimeApp({ host, packageLoader: async () => loadAshesRuntimeAssets(), idFactory: prefix => `${prefix}.${++sequence}`, now: () => '2026-09-07T04:00:00.000Z' });
await app.initialize();
assert.equal(typeof app.adjustObjectiveProgress, 'function');
assert.equal((await app.adjustObjectiveProgress({})).ok, false);
await app.startCreatorDraft();
await app.saveCreatorDraft({ patch: { activeStep: 'review', input: {
  identity: { name: 'Progress Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
  service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
  personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
  dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' }
} } });
await app.acceptCreatorDraftAndStartCampaign();
const before = await app.getCurrentView({ tabId: 'mission' });
const mission = before.v1PlayerProjection.mission;
const objective = mission.objectives.find(o => o.progressControl?.allowedResolutions?.length);
assert.ok(objective, 'a visible authored objective offers adjustment');
const payload = { missionId: mission.missionId, objectiveId: objective.id, expectedRunId: mission.runId, expectedRevision: objective.progressControl.expectedRevision, action: 'resolve', disposition: objective.progressControl.allowedResolutions[0].disposition };

const prompting = host.chat.pushPlayerMessage({ text: 'What are the handover terms?', hostMessageId: 'race.prompt' });
host.chat.pushAssistantMessage({ text: 'Whitaker opens the handover packet and explains the assignments.', hostMessageId: 'race.assistant', metadata: { promptingPlayerHostMessageId: prompting.hostMessageId } });
const player = host.chat.pushPlayerMessage({ text: 'I read the handover packet.', hostMessageId: 'race.player' });
const settlement = app.observeHostPlayerMessage({ message: player });
await began;
assert.equal((await app.adjustObjectiveProgress({ ...payload, expectedRevision: -1 })).ok, false);
assert.equal(observedSignal.aborted, false, 'a stale control must not cancel current analysis');
const correction = app.adjustObjectiveProgress(payload);
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(observedSignal.aborted, true);
release();
assert.equal((await settlement).mission.reasonCode, 'provider-aborted');
assert.equal((await correction).ok, true);
const intercepted = await app.getChatTurnOrchestrator().interceptGeneration();
assert.equal(intercepted.abortDefaultGeneration, false, 'a correction-owned abort must not strand narration behind manual Retry');
assert.equal(generation.calls().filter(call => call.role === 'acceptedPairMissionEvidence').length, 1, 'recovery must not make another provider call');
began = new Promise(resolve => { started = resolve; });
host.chat.pushAssistantMessage({ text: 'Whitaker reviews the next assignment in the packet.', hostMessageId: 'race.assistant2', metadata: { promptingPlayerHostMessageId: player.hostMessageId } });
const nextPlayer = host.chat.pushPlayerMessage({ text: 'I acknowledge the assignment.', hostMessageId: 'race.player2' });
const nextSettlement = app.observeHostPlayerMessage({ message: nextPlayer });
await began;
await app.handleHostGenerationStopped();
release();
assert.equal((await nextSettlement).mission.reasonCode, 'provider-aborted');
const currentMission = (await app.getCurrentView({ tabId: 'mission' })).v1PlayerProjection.mission;
const currentObjective = currentMission.objectives.find(item => item.id === objective.id);
assert.equal((await app.adjustObjectiveProgress({ ...payload, expectedRevision: currentObjective.progressControl.expectedRevision, action: 'reopen' })).ok, true);
const stillBlocked = await app.getChatTurnOrchestrator().interceptGeneration();
assert.equal(stillBlocked.abortDefaultGeneration, true, 'a correction must preserve an unrelated user-stopped analysis recovery');
assert.equal(stillBlocked.settlementError.reasonCode, 'provider-aborted');
console.log('Objective progress app race passed with held fake provider.');
