import assert from 'node:assert/strict';
import { createV1MissionRuntime, buildV1RuntimePlayerProjection } from '../../src/runtime/v1-mission-runtime.mjs';
import { createStateDeltaGateway } from '../../src/runtime/state-delta-gateway.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createInitialMissionJourney } from '../../src/mission/v1/mission-journey.mjs';
import { createDutyReportManifest } from '../../src/mission/v1/duty-report-delivery.mjs';
import { createScenePacingContext } from '../../src/narration/scene-pacing.mjs';
import { encodeV1StateDelta, applyV1StateDelta } from '../../src/storage/v1-state-delta-codec.mjs';
import { createAshesInitialState, loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const handover = 'objective.prelude.command-handover';
const distress = 'fact.hesperus.distress-established';
const completion = 'event.prelude.command-handover-completed';
const policyId = 'policy.hesperus.distress-established';
function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(16).padStart(8, '0');
}

function harness() {
  const assets = loadAshesRuntimeAssets();
  const definition = assets.missionDefinitions[0];
  let state = createAshesInitialState({ campaignId: 'campaign.corrections', saveId: 'save.corrections', chatId: 'chat.corrections' });
  const journey = createInitialMissionJourney({ definition, branchId: 'save.corrections' });
  state.mission = { activeMissionId: definition.packageBinding.sourceId,
    v1: createMissionState({ definition, branchId: 'save.corrections' }), v1Journey: journey.journey, v1History: journey.history };
  const initial = structuredClone(state);
  let output, sequence = 0, calls = 0;
  const gateway = createStateDeltaGateway({ getState: () => state, setState: next => { state = next; },
    persist: async () => {}, now: () => '2026-09-14T12:00:00.000Z' });
  const runtime = createV1MissionRuntime({ getState: () => state, stateDeltaGateway: gateway,
    generationRouter: { async generate(role) {
      assert.equal(role, 'acceptedPairMissionEvidence');
      calls++;
      return { ok: true, response: { text: JSON.stringify(output) } };
    } } });
  async function verify() {
    const delta = await encodeV1StateDelta({ saveId: 'save.corrections', before: initial, after: state,
      changedRoots: Object.keys(state), createdAt: '2026-09-14T12:00:00.000Z' });
    const decoded = await applyV1StateDelta({ saveId: 'save.corrections', state: initial, delta });
    assert.deepEqual(decoded, state);
    const reloaded = JSON.parse(JSON.stringify(decoded));
    const projection = buildV1RuntimePlayerProjection({ campaignState: reloaded, runtimeAssets: assets });
    assert.equal(projection.ok, true, JSON.stringify(projection));
    const effects = (reloaded.storySettlement?.episodes || []).flatMap(episode => episode.effects || []);
    for (const [type, effective] of [
      ['mission.worldFactEstablished', reloaded.mission.v1.worldFacts.includes(distress)],
      ['mission.factDisclosed', reloaded.mission.v1.knownFacts.includes(distress)],
    ]) {
      assert.equal(effects.filter(effect => effect.type === type && effect.targetId === distress && effect.status === 'active').length,
        effective ? 1 : 0, 'active story effects must agree with corrected mission truth and knowledge');
    }
    state = reloaded;
  }
  async function control(action, disposition, objectiveId = handover) {
    const result = await runtime.adjustObjectiveProgress({ runtimeAssets: assets, missionId: definition.id,
      objectiveId, action, ...(disposition ? { disposition } : {}), expectedRevision: state.mission.v1.revision,
      expectedRunId: state.mission.v1Journey.activeRunId });
    assert.equal(result.ok, true, JSON.stringify(result));
    await verify();
  }
  async function pair({ assistant = 'The officers wait for the next question.', player = 'Please continue explaining the remaining work.', observation = {}, claims = [], selectedVariant = {} } = {}) {
    sequence++;
    const context = createScenePacingContext({ definition, state: state.mission.v1,
      receipts: state.storySettlement?.acceptedPairReceipts || [] });
    output = { kind: 'directive.missionEvidenceInterpretation.v1', assistantAcceptance: 'accepted', claims,
      peopleEvents: [], abstained: !claims.length,
      time: { decision: 'unchanged', basis: 'noPassage', elapsedSeconds: 0, reason: 'Same instant.', confidence: 0.9 },
      scenePacing: { objectiveId: context.currentScene?.objectiveId || handover, intent: 'continue', intentQuote: '',
        unresolved: '', participation: [], ...observation } };
    const snapshot = { kind: 'directive.acceptedPairSnapshot.v1', envelope: {
      campaignId: 'campaign.corrections', saveId: 'save.corrections', chatId: 'chat.corrections',
      packageId: definition.packageBinding.packageId, packageVersion: definition.packageBinding.packageVersion,
      activeMissionId: definition.packageBinding.sourceId }, source: {
      sourceRangeHash: hash(`${sequence}|${assistant}|${player}`), previousAssistant: {
        hostMessageId: String(sequence * 2), text: assistant, textHash: hash(assistant), sourceIntegrity: 'clean',
        selectedVariant: { selectedTextHash: hash(assistant), sourceIntegrity: 'clean', ...selectedVariant } },
      currentPlayer: { hostMessageId: String(sequence * 2 + 1), text: player, textHash: hash(player), sourceIntegrity: 'clean' } } };
    const result = await runtime.settleAcceptedPair({ runtimeAssets: assets, snapshot });
    assert.equal(result.ok, true, JSON.stringify(result));
    await verify();
    return { result, snapshot };
  }
  return { assets, definition, runtime, pair, control, verify, get state() { return state; }, get calls() { return calls; } };
}
const worldEvidence = h => h.state.mission.v1.evidenceLog.filter(entry => entry.policyId === policyId);
const worldPresent = h => h.state.mission.v1.worldFacts.includes(distress);
function hidden(h) {
  assert.equal(h.state.mission.v1.knownFacts.includes(distress), false);
  assert.equal(h.state.mission.v1.objectives['objective.prelude.hesperus-rescue'].visibility, 'hidden');
}

const manual = harness();
await manual.pair();
assert.equal(worldPresent(manual), false);
await manual.control('resolve', 'completed');
assert.equal(manual.state.mission.v1.events.includes(completion), false);
await manual.pair();
assert.equal(worldPresent(manual), true, 'manual Completed must authorize deterministic distress without fabricating its handover event');
hidden(manual);
const first = structuredClone(worldEvidence(manual)[0]);
await manual.pair();
assert.deepEqual(worldEvidence(manual), [first], 'same control does not duplicate world evidence');
await manual.control('reopen');
assert.equal(worldPresent(manual), false);
assert.deepEqual(worldEvidence(manual), [first], 'reopen preserves world evidence custody');
assert.ok(manual.state.mission.v1.objectiveDecisions[handover].rejectedEvidenceKeys.includes(first.evidenceKey));
await manual.pair();
assert.equal(worldPresent(manual), false, 'reopen does not reauthorize distress');
await manual.control('resume');
await manual.pair();
assert.equal(worldPresent(manual), false, 'resume revision alone does not reauthorize distress');
await manual.control('resolve', 'completed');
await manual.pair();
assert.equal(worldPresent(manual), true, 'a new explicit completion must establish fresh runtime evidence after rejection');
assert.equal(worldEvidence(manual).length, 2);
assert.deepEqual(worldEvidence(manual)[0], first);
for (const key of ['claimId', 'evidenceKey', 'sourceContributionId']) assert.notEqual(worldEvidence(manual)[1][key], first[key], key);
hidden(manual);

async function completeAutomatically(h, fresh = false) {
  const assistant0 = fresh ? 'Whitaker reviews the new watch assignments and revised authority boundaries.' : 'Whitaker asks which authority and escalation boundaries you need.';
  const player0 = fresh ? 'I will coordinate the revised watch roster and escalate all tactical orders.' : 'I need watch assignments and personnel coordination; I will escalate tactical orders.';
  await h.pair({ assistant: assistant0, player: player0, observation: { objectiveId: handover,
    unresolved: 'Whitaker must respond to the requested authority.',
    participation: [{ requirement: 0, assistantQuote: assistant0, playerQuote: player0 }] } });
  const terms = fresh ? 'Whitaker settles the revised authority and escalation terms with the XO.' : 'Whitaker and the XO settle authority, escalation, and working-boundary terms.';
  const player1 = fresh ? 'I accept this revised roster. Please enact the new authority transfer.' : 'I accept these terms. Please complete the authority transfer.';
  await h.pair({ assistant: terms, player: player1, observation: { objectiveId: handover,
    intent: 'resolve', intentQuote: player1,
    participation: [{ requirement: 1, assistantQuote: terms, playerQuote: player1 }] },
    claims: h.state.mission.v1.events.includes('event.prelude.command-handover-terms-settled') ? [] : [{
      candidateId: 'policy.prelude.command-handover-terms-settled', sourceSlot: 'previousAssistant', evidenceQuote: terms }] });
  const enacted = fresh ? 'Whitaker enacts the revised XO authority transfer and assigns the new watch roster.' : 'Whitaker completes the practical XO authority and watch transfer.';
  await h.pair({ assistant: enacted, player: 'Before we leave, I have another question about the crew.',
    observation: { objectiveId: handover, unresolved: 'The player has another crew question.' },
    claims: [{ candidateId: 'policy.prelude.command-handover-completed', sourceSlot: 'previousAssistant',
      evidenceQuote: enacted, ...(fresh ? { materiallyNewEvidence: true } : {}) }] });
  assert.equal(h.state.mission.v1.objectives[handover].disposition, 'completed', 'fresh enacted automatic completion is accepted');
  await h.pair({ observation: { objectiveId: handover, unresolved: 'The player has another crew question.' } });
}

const automatic = harness();
await automatic.pair();
await completeAutomatically(automatic);
assert.equal(worldPresent(automatic), true);
const legacy = structuredClone(worldEvidence(automatic)[0]);
const source = automatic.state.storySettlement.episodes.flatMap(episode => episode.contributions)
  .find(contribution => contribution.id === legacy.sourceContributionId);
assert.equal(source.textHash, hash(['save.corrections', automatic.definition.id, policyId, distress, '', ''].join('|')),
  'no-control automatic materialization retains the exact legacy source hash');
assert.equal(legacy.claimId, `claim.runtime-policy.${hash(['save.corrections', automatic.definition.id, policyId].join('|'))}`);
const unrelated = harness();
await unrelated.pair();
await unrelated.control('resolve', 'completed', 'objective.prelude.staff-readiness');
await unrelated.pair();
await completeAutomatically(unrelated);
assert.equal(worldEvidence(unrelated)[0].evidenceKey, legacy.evidenceKey,
  'unrelated decisions and mission revision changes preserve the automatic world-fact identity');
assert.equal(worldEvidence(unrelated)[0].claimId, legacy.claimId);
await automatic.control('reopen');
assert.equal(worldPresent(automatic), false);
await automatic.control('resume');
await automatic.pair();
assert.equal(worldPresent(automatic), false, 'automatic mode alone does not restore the world fact');
await completeAutomatically(automatic, true);
assert.equal(worldPresent(automatic), true, 'fresh automatic completion after resume reestablishes distress');
assert.equal(worldEvidence(automatic).length, 2);
assert.deepEqual(worldEvidence(automatic)[0], legacy);
assert.notEqual(worldEvidence(automatic)[1].evidenceKey, legacy.evidenceKey);
assert.ok(automatic.state.mission.v1.objectiveDecisions[handover].rejectedEvidenceKeys.includes(legacy.evidenceKey));
hidden(automatic);

const prepareReport = (h, suffix) => h.runtime.preparePendingDutyReport({ runtimeAssets: h.assets,
  availableActors: [{ id: 'priya-nayar', capabilityRoles: ['operations'] }],
  responseId: `response.report.${suffix}`, sourceTransactionId: `transaction.report.${suffix}` });
async function leaveScene(h) {
  await h.pair({ player: 'Let us finish this meeting and return to duty.',
    observation: { intent: 'leave', intentQuote: 'Let us finish this meeting and return to duty.' } });
}
assert.equal(prepareReport(manual, 'held').status, 'no-pending-report', 'the world fact does not interrupt the active staff scene');
await leaveScene(manual);
const preparation = prepareReport(manual, 'first');
assert.equal(preparation.status, 'ready', JSON.stringify(preparation));
assert.equal(preparation.packet.reportId, 'report.hesperus.distress');
const assistant = `Nayar reports to the XO. ${preparation.segment.canonicalText} The bridge waits for a decision.`;
await manual.pair({ assistant, claims: [{ candidateId: 'policy.hesperus.distress-disclosed',
  sourceSlot: 'previousAssistant', evidenceQuote: preparation.segment.canonicalText.slice(0, 100), materiallyNewEvidence: true }] });
hidden(manual);
const manifest = createDutyReportManifest({ definition: manual.definition, packet: preparation.packet,
  ...preparation.manifestInput, responseText: assistant, segment: preparation.segment });
const delivered = await manual.pair({ assistant, selectedVariant: { selectedSwipeId: '0',
  responseId: preparation.manifestInput.responseId, directiveOwned: true,
  dutyReportCustodyOwned: true, dutyReportManifest: manifest } });
assert.equal(manual.state.mission.v1.knownFacts.includes(distress), true, 'accepted owned report discloses distress');
assert.equal(prepareReport(manual, 'already-known').status, 'no-pending-report', 'a valid known report is not duplicated');
assert.notEqual(manual.state.mission.v1.objectives['objective.prelude.hesperus-rescue'].visibility, 'hidden');
const deliveryEvidence = structuredClone(manual.state.mission.v1.evidenceLog.find(entry => entry.delivery?.reportId === 'report.hesperus.distress'));
assert.ok(deliveryEvidence.delivery);
const callsBeforeReplay = manual.calls;
assert.equal((await manual.runtime.settleAcceptedPair({ runtimeAssets: manual.assets, snapshot: delivered.snapshot })).status, 'already-settled');
assert.equal(manual.calls, callsBeforeReplay);
await manual.control('reopen');
assert.equal(worldPresent(manual), false);
hidden(manual);
assert.deepEqual(manual.state.mission.v1.evidenceLog.find(entry => entry.evidenceKey === deliveryEvidence.evidenceKey), deliveryEvidence,
  'correction preserves historical report delivery custody');
await manual.control('resolve', 'completed');
await manual.pair();
assert.equal(worldPresent(manual), true);
hidden(manual);
await leaveScene(manual);
const renewed = prepareReport(manual, 'after-correction');
assert.equal(renewed.status, 'ready',
  'rejected historical delivery cannot suppress the newly authorized report');
const renewedAssistant = `Nayar delivers a fresh confirmation. ${renewed.segment.canonicalText} The captain asks for the current assessment.`;
const renewedManifest = createDutyReportManifest({ definition: manual.definition, packet: renewed.packet,
  ...renewed.manifestInput, responseText: renewedAssistant, segment: renewed.segment });
const renewedVariant = { selectedSwipeId: '0', responseId: renewed.manifestInput.responseId,
  directiveOwned: true, dutyReportCustodyOwned: true, dutyReportManifest: renewedManifest };
await manual.pair({ assistant: `${renewedAssistant} An edit changes the selected response.`, selectedVariant: renewedVariant });
hidden(manual);
await manual.pair({ assistant: renewedAssistant, selectedVariant: renewedVariant });
assert.equal(manual.state.mission.v1.knownFacts.includes(distress), true, 'fresh accepted owned delivery restores knowledge');
assert.equal(prepareReport(manual, 'renewed-known').status, 'no-pending-report');
const reports = manual.state.mission.v1.evidenceLog.filter(entry => entry.delivery?.reportId === 'report.hesperus.distress');
assert.equal(reports.length, 2);
assert.deepEqual(reports[0], deliveryEvidence);
assert.ok(manual.state.mission.v1.objectiveDecisions[handover].rejectedEvidenceKeys.includes(deliveryEvidence.evidenceKey));
await manual.verify();

console.log('Canonical runtime objective world-fact corrections passed.');
