import assert from 'node:assert/strict';
import { createCharacterInformationProjection } from '../../src/story/character-information.mjs';

const open = { id: 'thread-open', threadId: 'resupply', operation: 'open', payload: { title: 'Resupply', category: 'information' }, sourceContributionIds: ['opening'], dependsOnEventIds: [] };
const fact = (id, text, recipients, revision, extra = {}) => ({
  id, threadId: 'resupply', operation: 'addFact', settledAtRevision: revision,
  sourceContributionIds: [id], dependsOnEventIds: ['thread-open'],
  payload: { text, claimType: 'character-claim', supersedesFactId: null,
    ...(recipients ? { informationAccess: { recipientIds: recipients, acquisition: 'heard', audienceSources: [] } } : {}), ...extra },
});
const events = [open,
  fact('private-request', 'Renwick requested more personnel.', ['sam'], 1),
  fact('private-deadline', 'Sam promised a fourteen-thirty callback.', ['renwick'], 2),
  fact('briefing', 'Two Type-9s are standing by as a cargo fallback.', ['nayar'], 3),
  fact('old-estimate', 'Restoration is expected at fifteen hundred.', ['nayar'], 4),
  fact('new-estimate', 'Restoration is now expected at sixteen hundred.', ['sam'], 5, { supersedesFactId: 'old-estimate' }),
  fact('legacy', 'An older record without an established audience.', null, 0),
  { id: 'resolved', threadId: 'resupply', operation: 'setStatus', payload: { status: 'resolved' }, sourceContributionIds: ['resolved'], dependsOnEventIds: ['thread-open'] },
];
const before = JSON.stringify(events);
const project = options => createCharacterInformationProjection({ events, personIds: ['nayar'], ...options });
const view = project();
assert.deepEqual(view.characters.map(c => c.personId), ['nayar']);
assert.deepEqual(view.characters[0].statements.map(s => s.id), ['old-estimate', 'briefing']);
assert.equal(view.coverage, 'partial');
assert.equal(view.characters[0].statements[0].claimType, 'character-claim');
assert.equal(JSON.stringify(view).includes('fourteen-thirty'), false);
assert.equal(JSON.stringify(view).includes('sixteen hundred'), false);
assert.equal(JSON.stringify(view).includes('older record'), false);
assert.equal(JSON.stringify(events), before, 'projection is read only');
const edited = project({ invalidSourceIds: new Set(['briefing']) });
assert.equal(edited.characters[0].statements.some(s => s.id === 'briefing'), false);
assert.equal(project({ invalidSourceIds: new Set(['opening']) }).characters.length, 0);
const oldSave = createCharacterInformationProjection({ events: [open, events[6]], personIds: ['nayar'] });
assert.deepEqual(oldSave.characters, []);
assert.equal(oldSave.coverage, 'partial');
const partial = project({ maxStatementsPerCharacter: 1 });
assert.equal(partial.omittedStatementCount, 1);
assert.equal(partial.characters[0].statements.length, 1);
const bounded = project({ maxCharacters: 600 });
assert.ok(JSON.stringify(bounded).length <= 600);
assert.ok(bounded.omittedStatementCount > 0);
assert.throws(() => project({ maxCharacters: 1 }), /information-projection-budget/);
assert.deepEqual(project(), JSON.parse(JSON.stringify(project())), 'reload is deterministic');
console.log('PASS character information isolation, historical access, legacy coverage, invalidation and budgets');
