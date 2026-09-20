import assert from 'node:assert/strict';
import { makeAudienceFixture } from './character-audience-test-fixtures.mjs';
import { prepareCharacterAudienceInput } from '../../src/runtime/character-audience-preparation.mjs';
import { createCharacterAudienceReviewer } from '../../src/story/character-audience-reviewer.mjs';
import { getAdmittedCharacterPacket } from '../../src/story/character-audience-admission.mjs';
import { createTurnAttemptBudget } from '../../src/generation/turn-attempt-budget.mjs';
for (const mode of ['pass','reject','missing','stale','empty','stop','capacity','capacity-unavailable','token-capacity','stale-route']) {
 const prepared=prepareCharacterAudienceInput(makeAudienceFixture()), original=JSON.stringify(prepared.evidence);
 const controller=new AbortController(), budget=createTurnAttemptBudget({limit:10,signal:controller.signal});
 const reservation=budget.reserve('audience',1); let calls=0, route='test.route';
 const reviewer=createCharacterAudienceReviewer({generation:{getRequestCapacity:()=>mode==='capacity-unavailable'?null:{routeFingerprint:route,contextTokens:mode==='token-capacity'?100:131072,outputTokens:4096,unit:'tokens'},async generate(role,request,options){
  calls++; assert.equal(role,'characterAudienceReviewer'); assert.equal(options.maxAttempts,1); assert.equal(options.allowVisibleOutputRetry,false);
  options.attemptBudget.claim({reservation:options.attemptReservation});
  const payload=JSON.parse(request.messages[1].content);
  assert.deepEqual(payload.candidatePackets, [...prepared.preparedByPerson].map(([personId,packet])=>({personId,packet})), 'reviewer must inspect the exact frozen actor packets for omitted requests');
  assert.ok(JSON.stringify(payload.evidence).includes('do not relay it to Captain Whitaker yet'));
  const receipt={kind:'directive.characterAudienceReview.v1',manifestDigest:payload.manifestDigest,evidenceDigest:payload.evidenceDigest,identityDigest:payload.identityDigest,verdict:mode==='reject'?'reject':'pass',checkedEntryIds:payload.manifest.entries.map(e=>e.id),findings:mode==='reject'?[{entryId:payload.manifest.entries[0].id,reason:'Unsupported recipient.'}]:[]};
  if(mode==='missing') receipt.checkedEntryIds.pop(); if(mode==='stale') receipt.evidenceDigest='0'.repeat(64);
  if(mode==='stop') controller.abort(); if(mode==='stale-route') route='changed.route'; return {text:mode==='empty'?'':JSON.stringify(receipt)};
 }}});
 const run=()=>reviewer.review({prepared,budget,reservation,signal:controller.signal,isCurrent:()=>true,analysisLimits:{requestContextCharacters:mode==='capacity'?100:48000}});
 if(mode==='pass'){const {capability}=await run(); assert.ok(getAdmittedCharacterPacket(capability,'priya-nayar'));}
 else await assert.rejects(run);
 assert.equal(calls,['capacity','capacity-unavailable','token-capacity'].includes(mode)?0:1); assert.equal(JSON.stringify(prepared.evidence),original); budget.dispose();
}
console.log('character audience reviewer tests passed');
// Complete trusted host-span coverage needs no model, capacity metadata or attempt.
const trustedFixture=makeAudienceFixture();
const untrustedPrepared=prepareCharacterAudienceInput(trustedFixture);
const trustedSpans=untrustedPrepared.manifest.entries.map(e=>({entryId:e.id,personId:e.personId,recipientId:e.routeRecipientId??e.personId,acquisition:e.acquisition,channel:e.channel,sourceRefs:e.sourceRefs,visibilityOrder:e.visibilityOrder,allowed:true}));
const trustedPrepared=prepareCharacterAudienceInput({...trustedFixture,trustedSpans});
const trustedBudget=createTurnAttemptBudget();
const trusted=await createCharacterAudienceReviewer({generation:{generate(){throw new Error('trusted path must not send');}}}).review({prepared:trustedPrepared,budget:trustedBudget,isCurrent:()=>true});
assert.ok(trusted.capability);assert.equal(trustedBudget.used,0);trustedBudget.dispose();

// Size the complete schema-bearing envelope, not just canonical source evidence.
let envelope, initialCapacity={routeFingerprint:'route.sized',contextTokens:262144,outputTokens:4096,unit:'tokens'};
const sizingGeneration={getRequestCapacity:()=>initialCapacity,async generate(_role,request,options){
 envelope=JSON.stringify(request);options.attemptBudget.claim({reservation:options.attemptReservation});
 const p=JSON.parse(request.messages[1].content);
 return {text:JSON.stringify({kind:'directive.characterAudienceReview.v1',manifestDigest:p.manifestDigest,evidenceDigest:p.evidenceDigest,identityDigest:p.identityDigest,verdict:'pass',checkedEntryIds:p.manifest.entries.map(e=>e.id),findings:[]})};
}};
const sizingPrepared=prepareCharacterAudienceInput(makeAudienceFixture());
async function sized(limits={}){const b=createTurnAttemptBudget();try{return await createCharacterAudienceReviewer({generation:sizingGeneration}).review({prepared:sizingPrepared,budget:b,reservation:b.reserve('sizing',1),isCurrent:()=>true,analysisLimits:limits});}finally{b.dispose();}}
await sized();
const evidenceSize=JSON.stringify(sizingPrepared).length;
assert.ok(evidenceSize<envelope.length);
await assert.rejects(()=>sized({requestContextCharacters:evidenceSize}),{code:'DIRECTIVE_CHARACTER_AUDIENCE_CAPACITY'});
const utf8=new TextEncoder().encode(envelope).length;
assert.ok(utf8>envelope.length,'real Unicode evidence contributes UTF-8 bytes');
initialCapacity={...initialCapacity,contextTokens:envelope.length+4096+320};
await assert.rejects(()=>sized(),{code:'DIRECTIVE_CHARACTER_AUDIENCE_CAPACITY'});
console.log('PASS trusted zero-call path and complete schema/Unicode capacity accounting');
