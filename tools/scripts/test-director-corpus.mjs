import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ASHES_V1_BUNDLED_REF } from '../../src/packages/bundled-package-registry.mjs';
import { createMissionState } from '../../src/mission/v1/mission-state.mjs';
import { createDirectorAuthoredContext } from '../../src/story/director-context.mjs';
import {
  createStoryDirectorRequest,
  parseStoryDirectorOutput,
} from '../../src/story/story-director.mjs';

const corpus = JSON.parse(readFileSync(new URL(
  '../../tests/fixtures/story/v1/director-corpus.json', import.meta.url,
), 'utf8'));
assert.equal(corpus.length, 9);
assert.deepEqual(corpus.find(({ id }) => id === 'atmosphere-is-not-an-obligation'), {
  id: 'atmosphere-is-not-an-obligation',
  previousAssistant: 'The corridor smelled faintly of fresh paint. Whitaker waited beside the viewport.',
  currentPlayer: 'I greet the captain.',
  expectedChanges: [],
  availableOpportunities: [],
  allowedMove: 'respond-to-player',
});

for (const [index, fixture] of corpus.entries()) {
  const sourcePair = {
    previousAssistant: { messageId: `assistant.${index}`, selectedSwipeId: '0', textHash: `hash.assistant.${index}`, text: fixture.previousAssistant },
    currentPlayer: { messageId: `player.${index}`, selectedSwipeId: null, textHash: `hash.player.${index}`, text: fixture.currentPlayer },
  };
  const request = createStoryDirectorRequest({
    envelope: {
      campaignId: 'campaign.corpus', saveId: 'save.corpus', chatId: 'chat.corpus',
      packageId: 'package.corpus', packageVersion: '1', branchId: 'save.corpus',
      baseRevision: index, missionId: 'mission.corpus', sourceRangeHash: `pair.${index}`,
      generationType: 'normal',
    },
    sourcePair,
    authoredContext: {
      constraints: [],
      opportunities: fixture.availableOpportunities.map((item) => ({ kind: 'objective', ...item })),
      coverage: 'partial',
    },
    continuity: { index: [], records: [] },
    currentScene: null,
    episodeReview: null,
  });
  const targetRef = fixture.allowedMove === 'respond-to-player'
    ? null
    : fixture.availableOpportunities[0]?.id || null;
  const parsed = parseStoryDirectorOutput({
    kind: 'directive.storyDirectorProposal.v1',
    envelope: structuredClone(request.envelope),
    coverage: 'complete',
    threadChanges: fixture.expectedChanges,
    direction: { move: fixture.allowedMove, targetRef, newComplications: 'avoid', requires: [] },
    episodeReview: null,
  }, { request });
  assert.equal(parsed.ok, true, `${fixture.id}: ${parsed.errors?.join(', ')}`);
}

for (const ref of ASHES_V1_BUNDLED_REF.missionDefinitionRefs) {
  const definition = JSON.parse(readFileSync(ref.url, 'utf8'));
  const missionState = createMissionState({ definition, branchId: 'branch.corpus' });
  const context = createDirectorAuthoredContext({ definition, missionState, shipMechanics: {} });
  assert.equal(context.coverage, 'partial', definition.id);
  const serialized = JSON.stringify(context);
  for (const objective of definition.objectives || []) {
    if (missionState.objectives[objective.id].visibility !== 'hidden') continue;
    assert.equal(serialized.includes(objective.playerText?.title || '\u0000'), false, `${definition.id} leaked hidden objective title`);
    assert.equal(serialized.includes(objective.playerText?.summary || '\u0000'), false, `${definition.id} leaked hidden objective summary`);
  }
  assert.ok(context.opportunities);
}
assert.equal(ASHES_V1_BUNDLED_REF.missionDefinitionRefs.length, 13);

console.log('Story director corpus tests passed.');
