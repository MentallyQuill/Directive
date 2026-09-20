import assert from 'node:assert/strict';
import { createFocusedStorySchema, parseContinuityAnalystOutput, createContinuityAnalyst } from '../../src/story/story-director.mjs';
import { createDirectorReceipt, validateDirectorReceipt } from '../../src/story/continuity-contracts.mjs';
import { createCharacterSceneAdmission } from '../../src/story/character-scene-admission.mjs';
import { makeDirectorRequest } from './director-contract-test-fixtures.mjs';
const request = makeDirectorRequest();
request.currentScene = { characterKnowledge: 'protected', playerId: 'person.player', explicitAudience: {} };
request.authoredContext.referenceIds = ['person.a', 'person.player'];
request.authoredContext.references = [{ id: 'person.a', name: 'A', kind: 'person' }, { id: 'person.player', name: 'Player', kind: 'person' }];
const scene = { participants: [], reactions: [], playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: request.pendingPair.currentPlayer.text }] };
const proposal = { kind: 'directive.continuityAnalystProposal.v1', envelope: request.envelope, coverage: 'complete', threadChanges: [], lookupRequests: [], characterScene: scene };
assert.ok(createFocusedStorySchema(request, 'continuityAnalyst').required.includes('characterScene'));
assert.equal(parseContinuityAnalystOutput(proposal, { request }).ok, true);
assert.equal(parseContinuityAnalystOutput({ ...proposal, characterScene: null }, { request }).ok, false);
assert.equal(parseContinuityAnalystOutput({ ...proposal, characterScene: { ...scene, playerContext: [{ sourceSlot: 'currentPlayer', evidenceQuote: 'invented' }] } }, { request }).ok, false);
assert.equal(parseContinuityAnalystOutput({ ...proposal, coverage: 'lookup-needed', lookupRequests: [{ threadIds: [], query: 'crew' }], characterScene: null }, { request }).ok, true);
assert.equal(parseContinuityAnalystOutput({ ...proposal, coverage: 'lookup-needed', lookupRequests: [{ threadIds: [], query: 'crew' }] }, { request }).ok, false);
const restricted = structuredClone(request); restricted.currentScene.explicitAudience = { currentPlayer: ['person.a'] };
assert.equal(parseContinuityAnalystOutput(proposal, { request: restricted }).ok, false);
let observed = false;
const analyze = createContinuityAnalyst({ generationRouter: { generate: async (_role, payload) => {
  observed = true; assert.match(payload.systemPrompt, /known people are not automatically present/);
  return { ok: true, response: { json: proposal } };
} } });
assert.equal((await analyze({ request })).ok, true); assert.equal(observed, true);
const input = { branchId: 'save.example', packageId: 'package.example', packageVersion: '1', missionId: 'mission.example', generationType: 'normal', generationTargetKey: 'target', requestKey: 'request', reuseKey: 'reuse', sourceRangeHash: 'range', sourceContributionIds: ['source.a'], instruction: 'Respond.', dependencyIds: [], settledAtRevision: 1 };
const admission = createCharacterSceneAdmission({ proposal: scene, sourcePair: request.pendingPair, playerId: 'person.player', knownPersonIds: new Set(['person.a']) });
const receipt = await createDirectorReceipt({ ...input, characterScene: admission });
assert.deepEqual(receipt.characterScene, admission);
assert.equal(validateDirectorReceipt(receipt).ok, true);
assert.notEqual(receipt.id, (await createDirectorReceipt(input)).id);
assert.equal(validateDirectorReceipt({ ...receipt, characterScene: { ...admission, extra: true } }).ok, false);
assert.equal(Object.hasOwn(await createDirectorReceipt(input), 'characterScene'), false);
console.log('PASS protected continuity scene contract and source-bound director receipt; legacy contract preserved');
// Exercise schema semantics and parser parity, including nullable lookup responses.
function accepts(schema, value) {
 if (schema.anyOf && !schema.anyOf.some(s => accepts(s,value))) return false;
 if (schema.const !== undefined && JSON.stringify(schema.const)!==JSON.stringify(value)) return false;
 if (schema.enum && !schema.enum.includes(value)) return false;
 if (schema.type && !(schema.type==='integer'?Number.isInteger(value):schema.type==='null'?value===null:schema.type==='array'?Array.isArray(value):schema.type==='object'?value!==null&&typeof value==='object'&&!Array.isArray(value):typeof value===schema.type)) return false;
 if(value && typeof value==='object'&&!Array.isArray(value)) {
  if(schema.required?.some(k=>!Object.hasOwn(value,k))) return false;
  if(schema.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(schema.properties||{},k))) return false;
  if(Object.entries(schema.properties||{}).some(([k,s])=>Object.hasOwn(value,k)&&!accepts(s,value[k]))) return false;
 }
 if(Array.isArray(value)&&schema.items&&value.some(v=>!accepts(schema.items,v)))return false;
 return true;
}
for(const sceneOnly of [false,true]) for(const [coverage, characterScene, valid] of [['complete',scene,true],['complete',null,false],['lookup-needed',null,true],['lookup-needed',scene,false],['overflow',scene,true],['overflow',null,false]]) {
 const input={...request,currentScene:{...request.currentScene,sceneOnly}};
 const output={...proposal,coverage,characterScene,lookupRequests:coverage==='lookup-needed'?[{threadIds:[],query:'crew'}]:[]};
 assert.equal(accepts(createFocusedStorySchema(input,'continuityAnalyst'),output),valid,`${coverage} scene=${characterScene===null?'null':'object'} sceneOnly=${sceneOnly}`);
 assert.equal(parseContinuityAnalystOutput(output,{request:input}).ok,valid && coverage!=='overflow');
}
