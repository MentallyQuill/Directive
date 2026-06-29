import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createNarrativeThreadDirector } from '../../src/directors/narrative-thread-director.mjs';
import {
  createStateDeltaGateway,
  initializeCampaignRuntimeTracking
} from '../../src/runtime/state-delta-gateway.mjs';

const root = process.cwd();
const readJson = (filePath) => JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'));
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

const packageData = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-package.json');
const projection = readJson('packages/bundled/breckenridge/ashes-of-peace.campaign-projection.json');

function createHarness({ generationRouter = null } = {}) {
  let state = initializeCampaignRuntimeTracking(cloneJson(projection.initialState));
  state.campaign = {
    ...(state.campaign || {}),
    id: 'campaign-narrative-thread-director-test',
    status: 'active'
  };
  state.campaignChatBinding = {
    hostId: 'fake',
    chatId: 'campaign-chat',
    campaignId: state.campaign.id,
    saveId: 'save-narrative-thread-director-test'
  };
  const commits = [];
  const gateway = createStateDeltaGateway({
    getState: () => state,
    setState: (next) => { state = cloneJson(next); },
    persist: async (next, summary) => {
      state = cloneJson(next);
      commits.push({ summary, revision: next.runtimeTracking?.revision || 0 });
      return { ok: true };
    },
    now: () => '2026-06-28T22:00:00.000Z'
  });
  const director = createNarrativeThreadDirector({
    getCampaignState: () => state,
    getPackageData: () => packageData,
    stateDeltaGateway: gateway,
    generationRouter,
    now: () => '2026-06-28T22:00:01.000Z'
  });
  return {
    get state() { return cloneJson(state); },
    commits,
    director
  };
}

const conversation = {
  ingressId: 'ingress-thread-test',
  turnId: 'turn-thread-test',
  outcomeId: 'outcome-thread-test',
  committed: true,
  outcomePacket: {
    id: 'outcome-thread-test',
    summary: 'Sam promised to help Bronn trace a maintenance fault.'
  },
  messages: [
    {
      id: 'player-thread-test',
      role: 'user',
      text: 'Sam promises Bronn that he will help trace the recurring maintenance fault after watch.'
    },
    {
      id: 'assistant-thread-test',
      role: 'assistant',
      text: 'Bronn nods and logs the maintenance fault as a follow-up concern.'
    }
  ]
};

const staleBefore = createHarness({
  generationRouter: {
    async generate() {
      throw new Error('stale-before-provider should not call generation');
    }
  }
});
await assert.rejects(
  () => staleBefore.director.processConversation(conversation, {
    isSourceCurrent: () => ({ ok: false, reason: 'source-edited-before-provider' })
  }),
  (error) => error.code === 'DIRECTIVE_NARRATIVE_THREAD_SOURCE_STALE'
);
assert.equal(staleBefore.commits.length, 0, 'stale-before-provider must not commit narrative thread state.');

let providerCalls = 0;
const staleAfter = createHarness({
  generationRouter: {
    async generate(roleId) {
      providerCalls += 1;
      assert.equal(roleId, 'sceneDeltaExtractor');
      return {
        ok: true,
        response: {
          text: JSON.stringify({
            signals: []
          })
        },
        diagnostics: { providerId: 'fake-scene-delta-provider' }
      };
    }
  }
});
let sourceCheckCount = 0;
await assert.rejects(
  () => staleAfter.director.processConversation(conversation, {
    isSourceCurrent: () => {
      sourceCheckCount += 1;
      return sourceCheckCount >= 2
        ? { ok: false, reason: 'source-edited-after-provider' }
        : { ok: true };
    }
  }),
  (error) => error.code === 'DIRECTIVE_NARRATIVE_THREAD_SOURCE_STALE'
);
assert.equal(providerCalls, 1, 'stale-after-provider should allow the first provider call before discarding the result.');
assert.equal(staleAfter.commits.length, 0, 'stale-after-provider must not commit narrative thread state.');

console.log('Narrative Thread director tests passed: source stale guards before and after provider work.');
