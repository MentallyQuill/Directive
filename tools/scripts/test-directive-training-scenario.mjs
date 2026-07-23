import assert from 'node:assert/strict';

import {
  buildDirectiveTrainingScenarioView,
  isDirectiveTrainingScenarioView
} from '../../src/guidance/directive-training-scenario.mjs';
import { DIRECTIVE_TUTORIALS } from '../../src/guidance/directive-guidance-content.mjs';

const view = buildDirectiveTrainingScenarioView({
  activeTab: 'mission',
  tutorialId: 'tutorial.basic',
  stepId: 'basic.pending-outcome'
});

assert.equal(view.kind, 'directive.runtimeView');
assert.equal(view.activeTab, 'mission');
assert.equal(view.tutorialMode.active, true);
assert.equal(view.tutorialMode.kind, 'trainingScenario');
assert.equal(view.tutorialMode.tutorialId, 'tutorial.basic');
assert.equal(view.tutorialMode.stepId, 'basic.pending-outcome');
assert.equal(view.trainingScenario.label, 'Training Scenario');
assert.equal(view.trainingScenario.inert, true);
assert.equal(view.trainingScenario.sideEffectsDisabled, true);
assert.equal(isDirectiveTrainingScenarioView(view), true);

assert.equal(view.activePackageId.startsWith('tutorial-training-'), true);
assert.equal(view.activeSaveId.startsWith('tutorial-training-'), true);
assert.equal(view.campaign.packages.length, 1);
assert.equal(view.campaign.saves.length, 1);
assert.equal(view.campaignIndex.campaigns.length, 1);
assert.equal(view.campaignState.campaign.id.startsWith('tutorial-training-'), true);
assert.equal(view.campaignState.commandLog.entries.length >= 4, true);
assert.equal(view.campaignState.threadLedger.records.length >= 2, true);
assert.equal(view.campaignState.pressureLedger.records.length >= 2, true);
assert.equal(view.openWorld.quests.length >= 2, true);
assert.equal(view.pendingDirectorTurn.provisionalOutcome.resultBand, 'Success with a cost');
assert.equal(view.playerCharacterView.guards.rawRelationshipValuesHidden, true);
assert.equal(view.playerCharacterView.currentStandingSummary.length >= 2, true);
assert.equal(view.activePackage.crew.senior.length >= 4, true);
assert.equal(view.campaignState.ship.damage.length >= 1, true);
assert.equal(view.campaignState.ship.activeRestrictions.length >= 1, true);
assert.equal(view.campaignState.ship.technicalDebt.length >= 1, true);

const serialized = JSON.stringify(view);
assert(!serialized.includes('"chatId"'), 'Training Scenario should not include a real or fake host chatId handle.');
assert(!serialized.includes('promptContextRevision'), 'Training Scenario should not include prompt context revisions.');
assert(!serialized.includes('"providerId"'), 'Training Scenario should not include provider request metadata.');
assert(!serialized.includes('"score"'), 'Training Scenario should not expose raw relationship scores.');

const tutorialIds = new Set(DIRECTIVE_TUTORIALS.map((tutorial) => tutorial.id));
for (const expected of [
  'tutorial.basic',
  'tutorial.advanced',
  'tutorial.assist',
  'tutorial.message-actions',
  'tutorial.campaign-records',
  'tutorial.mission-outcomes',
  'tutorial.crew-ship-log',
  'tutorial.settings-safety'
]) {
  assert(tutorialIds.has(expected), `${expected} should be registered.`);
}

for (const tutorial of DIRECTIVE_TUTORIALS) {
  assert(tutorial.steps.length > 0, `${tutorial.id} should have steps.`);
  for (const item of tutorial.steps) {
    assert(item.id && item.title && item.body, `${tutorial.id} steps should be fully described.`);
    assert(item.target || item.fallbackTarget, `${tutorial.id}/${item.id} should name a highlight target.`);
  }
}

const basic = DIRECTIVE_TUTORIALS.find((tutorial) => tutorial.id === 'tutorial.basic');
assert.equal(basic.trainingScenario, true);
assert(basic.steps.length >= 14, 'Basic walkthrough should be expanded beyond a placeholder tour.');
assert(basic.steps.some((item) => item.target === 'mission.outcome.accept'), 'Basic walkthrough should explain accepting a pending outcome.');
assert(basic.steps.some((item) => item.target === 'assist.launcher'), 'Basic walkthrough should include Directive Assist.');
assert(basic.steps.some((item) => item.target === 'message.launcher'), 'Basic walkthrough should include message actions.');

const assist = DIRECTIVE_TUTORIALS.find((tutorial) => tutorial.id === 'tutorial.assist');
assert.equal(assist.trainingScenario, false);
assert(assist.steps.some((item) => item.target === 'assist.preview.applyToChat'));
assert(assist.steps.some((item) => item.target === 'assist.preview.tryAgain'));

const messageActions = DIRECTIVE_TUTORIALS.find((tutorial) => tutorial.id === 'tutorial.message-actions');
assert.equal(messageActions.trainingScenario, false);
assert(messageActions.steps.some((item) => item.target === 'message.action.recalculateFromHere'));
assert(messageActions.steps.some((item) => item.target === 'message.marker.clear'));

console.log('Directive training scenario tests passed.');
