import assert from 'node:assert/strict';
import { createFakeDirectiveHost } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const host = createFakeDirectiveHost({ chatNative: true });
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
const result = await app.adjustObjectiveProgress(payload);
assert.equal(result.ok, true, result.message);
const after = await app.getCurrentView({ tabId: 'mission' });
assert.equal(after.v1PlayerProjection.mission.objectives.find(o => o.id === objective.id).progressControl.mode, 'player_set');
assert.equal((await app.adjustObjectiveProgress(payload)).ok, false, 'stale duplicate action is rejected');
assert.ok(host.ui.messages().some(m => m.payload?.type === 'directive.gameplayNotifications.publish.v1'), 'committed correction emits UI feedback');
const reloadedApp = createDirectiveRuntimeApp({ host, packageLoader: async () => loadAshesRuntimeAssets(), now: () => '2026-09-07T04:01:00.000Z' });
await reloadedApp.initialize();
const reloaded = await reloadedApp.getCurrentView({ tabId: 'mission' });
const retained = reloaded.v1PlayerProjection.mission.objectives.find(o => o.id === objective.id);
assert.equal(retained.progressControl.mode, 'player_set', 'actual storage hydration retains player authority');
const reopened = await reloadedApp.adjustObjectiveProgress({ ...payload, action: 'reopen', expectedRevision: retained.progressControl.expectedRevision });
assert.equal(reopened.ok, true, reopened.message);
const openView = await reloadedApp.getCurrentView({ tabId: 'mission' });
assert.equal(openView.v1PlayerProjection.mission.objectives.find(o => o.id === objective.id).progressControl.mode, 'confirmation_required');
assert.ok(host.ui.messages().some(m => m.payload?.type === 'directive.gameplayNotifications.retire.v1'), 'correction retires old completion notices');
assert.equal(host.generation.calls().length, 0, 'manual adjustments and reload require no model calls');
console.log('Objective progress app command integration passed with fake host and no provider calls.');
