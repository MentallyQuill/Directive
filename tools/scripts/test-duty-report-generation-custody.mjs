import assert from 'node:assert/strict';
import { createFakeDirectiveHost, createFakeGenerationClient } from '../../src/hosts/fake/fake-host.mjs';
import { createDirectiveRuntimeApp } from '../../src/runtime/runtime-app.mjs';
import { createDutyReportVisibleSegment } from '../../src/mission/v1/duty-report-delivery.mjs';
import { loadV1CampaignSave } from '../../src/storage/v1-storage-repository.mjs';
import { loadAshesRuntimeAssets } from './v1-test-fixtures.mjs';

const playerInput = {
    identity: { name: 'Report Tester', pronounsOrAddress: 'they/them', speciesId: 'human', ageBandId: 'mid-career', appearance: 'Attentive.' },
    service: { careerBackgroundId: 'tactical-security', formativeExperienceId: 'dominion-war-fleet-service', assignmentReasonId: 'experienced-outsider-transfer' },
    personality: { traits: { insight: 'perceptive', connection: 'candid', execution: 'decisive' }, flawId: 'impatient' },
    dossier: { briefBiography: 'A command officer committed to reconstruction.', publicReputation: 'An attentive command officer.' },
};

for (const mode of ['unchanged', 'install-definition', 'prepared-definition', 'cleared', 'stop', 'stop-resume', 'changed-chat', 'selected-swipe']) {
    const assets = loadAshesRuntimeAssets();
    const definition = assets.missionDefinitions[0];
    definition.facts.find(fact => fact.id === 'fact.hesperus.distress-established').initiallyTrue = true;
    definition.reportRoutes.forEach(route => { route.sceneInterruptWhen = true; });
    const host = createFakeDirectiveHost({ chatNative: true, generation: createFakeGenerationClient(), logger: { warn() {}, info() {}, error() {} } });
    let sequence = 0;
    const app = createDirectiveRuntimeApp({ host, packageLoader: async () => assets,
        idFactory: prefix => `${prefix}.${mode}.${++sequence}`, now: () => '2026-09-15T10:00:00.000Z' });
    await app.initialize();
    await app.startCreatorDraft();
    await app.saveCreatorDraft({ patch: { activeStep: 'review', input: playerInput } });
    await app.acceptCreatorDraftAndStartCampaign();
    host.chat.pushPlayerMessage({ text: 'Please report.', hostMessageId: 'report.prompt' });
    app.handleHostGenerationStarted({ type: 'normal' });
    const originalDefinition = structuredClone(definition);
    if (mode === 'install-definition') {
        const rebuild = host.prompt.rebuild;
        host.prompt.rebuild = async options => {
            const installed = await rebuild(options);
            definition.facts.find(fact => fact.id === 'fact.hesperus.distress-established').playerText.summary = 'An authored edit during prompt installation.';
            return installed;
        };
    }
    await app.updateNarrationSettings({});
    const route = definition.reportRoutes.find(route => route.id === 'report.hesperus.distress');
    const packet = { kind: 'directive.dutyReportPacket.v1', reportId: route.id, reporterId: 'priya-nayar',
        factId: route.factId, urgency: route.urgency, confidence: route.confidence, deliveryRequirement: route.deliveryRequirement,
        playerText: route.playerText, authorizedClaim: { claimType: 'factDisclosed', targetId: route.factId, policyId: route.evidencePolicyId } };
    const segment = createDutyReportVisibleSegment(packet, { definition: originalDefinition, contractVersion: 2 });
    assert.ok(host.prompt.inspect().blocks.some(block => block.text.includes(segment.canonicalText)));
    const message = host.chat.pushAssistantMessage({ hostMessageId: 'report.response', text: segment.canonicalText,
        swipes: [segment.canonicalText, 'The officer has not delivered that report.'], swipeId: 0 });
    const before = (await app.getCurrentView({ tabId: 'mission' })).campaignState;
    const originalChatId = host.chat.getCurrentChatId();
    const originalStrip = host.chat.stripAssistantTimeFooter.bind(host.chat);
    let entered;
    let release;
    const waiting = new Promise(resolve => { entered = resolve; });
    host.chat.stripAssistantTimeFooter = async options => {
        entered();
        await new Promise(resolve => { release = resolve; });
        return originalStrip(options);
    };
    const pending = app.handleHostGenerationEnded({ message });
    await waiting;
    if (mode === 'prepared-definition') {
        // An in-flight completion must use its already installed version/text,
        // rather than rebuilding a different segment after an awaited host read.
        definition.facts.find(fact => fact.id === route.factId).playerText.summary = 'A later authored definition has different report wording.';
    }
    if (mode === 'cleared') await app.clearDirectivePrompt();
    if (mode === 'stop' || mode === 'stop-resume') await app.handleHostGenerationStopped();
    if (mode === 'stop-resume') app.handleHostGenerationStarted({ type: 'normal' });
    if (mode === 'changed-chat') host.chat.setCurrentChatId('unrelated-chat');
    if (mode === 'selected-swipe') host.chat.setMessagesForChat(originalChatId, host.chat.messages().map(row => row.hostMessageId === message.hostMessageId
        ? { ...row, text: row.swipes[1], mes: row.swipes[1], swipe_id: 1 } : row));
    release();
    let result;
    try { result = await pending; } catch (error) {
        assert.equal(mode, 'changed-chat', `${mode}: unexpected rejection`);
        assert.equal(error.code, 'DIRECTIVE_TRANSCRIPT_NOT_READY');
        assert.equal(error.reasonCode, 'transcript-owner-changed');
        result = { rejected: true, code: error.code, reasonCode: error.reasonCode };
    }
    host.chat.stripAssistantTimeFooter = originalStrip;
    host.chat.setCurrentChatId(originalChatId);
    const storedMessage = host.chat.getMessage(message.hostMessageId);
    const shouldAttach = ['unchanged', 'install-definition', 'prepared-definition'].includes(mode);
    assert.equal(Boolean(storedMessage.extra?.runtimeMetadata?.dutyReportManifest), shouldAttach, `${mode}: ${JSON.stringify(result)}`);
    if (['stop', 'stop-resume', 'changed-chat', 'selected-swipe'].includes(mode)) {
        assert.equal(storedMessage.extra?.runtimeMetadata, undefined, `${mode}: stale completion attaches no runtime metadata`);
    }
    if (shouldAttach) assert.equal(storedMessage.extra.runtimeMetadata.dutyReportManifest.contractVersion, 2);
    assert.deepEqual((await app.getCurrentView({ tabId: 'mission' })).campaignState, before, `${mode}: generation is provisional`);
    assert.deepEqual((await loadV1CampaignSave(host.storage, before.campaignChatBinding.saveId)).state, before);
}
console.log('PASS Duty Report generation preparation, Stop, chat and selected-swipe custody');
