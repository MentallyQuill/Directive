import { stableSha256Hex } from './v1-stable-hash.mjs';
import { v1AcceptedPairReceiptMatches } from './v1-accepted-pair-receipt.mjs';
import { captureV1StorySource } from './v1-accepted-pair-source.mjs';
import { materializeCharacterSceneEvidence } from '../story/character-scene-admission.mjs';
import { createCharacterKnowledgePacket, compileCharacterPacket } from '../story/character-knowledge.mjs';
import { characterAudienceDigest as digest, characterAudienceFailure as fail, validateCharacterAudienceTrustedSpans, sealCharacterAudiencePreparation } from '../story/character-audience-admission.mjs';
const slots=['previousAssistant','currentPlayer'];
const identityOf=s=>({messageId:s.messageId,selectedSwipeId:s.selectedSwipeId,textHash:s.textHash});
const same=(a,b)=>a&&b&&a.messageId===b.messageId&&a.selectedSwipeId===b.selectedSwipeId&&a.textHash===b.textHash;
/** Freeze the existing compiler's selection before any actor runs. Full sources stay in checker-only evidence. */
export function prepareCharacterAudienceInput({snapshot,messages,sourcePair,admission,identity,limits={},trustedSpans=[],provisionalExposures=[]}={}) {
 if(!Array.isArray(messages)||!snapshot||!identity) fail();
 snapshot=structuredClone(snapshot); sourcePair=structuredClone(sourcePair); admission=structuredClone(admission); identity=structuredClone(identity); provisionalExposures=structuredClone(provisionalExposures);
 const available=new Map();
 for(const message of messages) { const captured=captureV1StorySource(message); if(!captured.ok) continue; const s=captured.value; if(available.has(s.messageId)) fail('SOURCE_UNAVAILABLE'); available.set(s.messageId,s); }
 const used=new Map(),pairs=new Map();
 function resolve(anchor) {
  let s=available.get(anchor?.messageId);
  // Authored opening sources have explicit source authority and no host message yet.
  if(!s) {
   const slot=slots.find(slot=>same(sourcePair?.[slot],anchor));
   const authored=slot&&sourcePair[slot];
   if(authored && typeof authored.text==='string' && authored.selectedSwipeId===null && authored.textHash===stableSha256Hex(authored.text)
    && [slot, slot==='previousAssistant'?'scene':'player'].some(name=>authored.messageId===`authored.opening.${name}.${authored.textHash.slice(0,24)}`)) s=authored;
  }
  if(!same(s,anchor)||typeof s.text!=='string'||!s.text) fail('SOURCE_UNAVAILABLE');
  const value={...identityOf(s),text:s.text}; used.set(digest(identityOf(s)),value); return value;
 }
 for(const slot of slots) { const s=resolve(sourcePair?.[slot]); if(s.text!==sourcePair[slot].text) fail('SOURCE_UNAVAILABLE'); sourcePair[slot]=s; }
 const scene=materializeCharacterSceneEvidence({admission,sourcePair},new Set(snapshot.characters.keys()));
 const entries=[],preparedByPerson=new Map(),selectedArchiveIds=new Map(),selectedEvents=new Map();
 function refs(anchor) {
  const s=resolve(anchor),quote=anchor.evidenceQuote;
  if(typeof quote!=='string'||!quote) fail('SOURCE_UNAVAILABLE');
  const result=[]; for(let start=s.text.indexOf(quote);start!==-1;start=s.text.indexOf(quote,start+1)) result.push({...identityOf(s),start,end:start+quote.length});
  if(!result.length) fail('SOURCE_UNAVAILABLE'); return result;
 }
 function sceneRefs(evidence) { return evidence.flatMap(e=>refs({...sourcePair[e.sourceSlot],evidenceQuote:e.evidenceQuote})); }
 const personIds=[...new Set(scene.plan.map(n=>n.personId))];
 const allEvents=[...snapshot.state.storySettlement.continuityEvents,...provisionalExposures.map(e=>e.event)];
 const persistedIds = new Set(snapshot.state.storySettlement.continuityEvents.map(event => event.id));
 const provisionalIds = new Set(provisionalExposures.map(entry => entry.event.id));
 function historicalContext(event) {
  const anchors = [...event.sources, ...(event.payload.informationAccess?.audienceSources || [])];
  anchors.forEach(anchor => resolve(anchor));
  // The existing compiler validates provisional position, source anchors and order.
  // Only that uncommitted batch has current-pair authority without a receipt.
  if (!persistedIds.has(event.id) && provisionalIds.has(event.id)) {
   if (!anchors.every(anchor => slots.some(slot => same(sourcePair[slot], anchor)))) fail('SOURCE_UNAVAILABLE');
   return;
  }
  // Persisted grants retain their original complete pair, even when one anchor
  // overlaps this turn (for example a continuation replaced the other slot).
  const candidates = (snapshot.state.storySettlement.acceptedPairReceipts || []).filter(receipt =>
   v1AcceptedPairReceiptMatches(receipt, { branchId: snapshot.state.storySettlement.branchId,
    sourceRangeHash: receipt.sourceRangeHash, sourcePair: receipt })
   && event.sourceContributionIds.every(id => receipt.sourceContributionIds?.includes(id))
   && anchors.every(anchor => slots.some(slot => same(receipt[slot], anchor))));
  const unique = new Map(candidates.map(receipt => [digest(slots.map(slot => identityOf(receipt[slot]))), receipt]));
  if (unique.size !== 1) fail('SOURCE_UNAVAILABLE');
  const [key, receipt] = [...unique][0];
  pairs.set(key, { receipt: structuredClone(receipt),
   sourcePair: Object.fromEntries(slots.map(slot => [slot, resolve(receipt[slot])])) });
 }
  function includeEventContext(event, visiting=new Set()) {
  if(selectedEvents.has(event.id)) return;
  if(visiting.has(event.id)) fail('SOURCE_UNAVAILABLE');
  visiting.add(event.id);
  historicalContext(event);
  for(const dependencyId of [...event.dependsOnEventIds,event.payload.supersedesFactId].filter(Boolean)) {
   const dependency=allEvents.find(e=>e.id===dependencyId);
   if(!dependency) fail('SOURCE_UNAVAILABLE');
   includeEventContext(dependency,visiting);
  }
  visiting.delete(event.id); selectedEvents.set(event.id,event);
 }
 for(const personId of personIds) {
  const perceptions=scene.perceptions.get(personId)||[];
  const result=createCharacterKnowledgePacket({snapshot,personId,sourcePair,provisionalExposures,beforeOrder:Number.MAX_SAFE_INTEGER,limits,finalizePacket:base=>{
   const candidates=[...base.information,...perceptions].map(item=>({...item,recipientIds:[personId],sourceIds:['prepared'],learnedAt:-1}));
   return compileCharacterPacket({personId,identity:base.identity,publicSituation:perceptions.length?`Current source-admitted perceptions:\n${perceptions.map(p=>p.text).join('\n')}`:base.situation,authoredInformation:base.authoredInformation,candidates,validSourceIds:new Set(['prepared']),beforeOrder:0,maxCharacters:limits.maxCharacters??12000,maxEstimatedTokens:limits.maxEstimatedTokens??12000});
  }});
  if(!result.ok) fail(result.code==='DIRECTIVE_CHARACTER_KNOWLEDGE_BUDGET'?'CAPACITY':'INVALID');
  preparedByPerson.set(personId,result.packet); selectedArchiveIds.set(personId,result.selectedArchiveIds);
  for(const id of result.selectedArchiveIds) {
   const event=allEvents.find(e=>e.id===id); if(!event) fail(); includeEventContext(event);
   const statementRefs=refs(event.sources[0]);
   entries.push({id:`archive.${personId}.${id}`,origin:'archive',personId,acquisition:event.payload.informationAccess.acquisition,channel:event.payload.informationAccess.acquisition,visibilityOrder:0,eventId:id,statementRef:statementRefs[0],sourceRefs:[...statementRefs,...event.sources.slice(1).flatMap(refs),...event.payload.informationAccess.audienceSources.flatMap(refs)],claimType:event.payload.claimType});
  }
 }
 for(const person of admission.proposal.participants) {
  const prefix=digest({personId:person.personId,admission}).slice(0,24);
  entries.push({id:`presence.${prefix}`,origin:'presence',personId:person.personId,acquisition:person.presence,channel:person.presence,visibilityOrder:0,sourceRefs:sceneRefs(person.evidence)});
  person.perception.forEach((item,index)=>entries.push({id:scene.perceptions.get(person.personId)[index].id,origin:'perception',personId:person.personId,acquisition:item.acquisition,channel:item.acquisition,visibilityOrder:0,sourceRefs:sceneRefs([item.evidence]),claimType:scene.perceptions.get(person.personId)[index].claimType}));
  person.audience.forEach((route,index)=>entries.push({id:`route.${prefix}.${index}`,origin:'route',personId:person.personId,routeRecipientId:route.personId,acquisition:route.acquisition,channel:route.acquisition,visibilityOrder:0,sourceRefs:sceneRefs(route.evidence)}));
 }
 admission.proposal.playerContext.forEach((item,index)=>entries.push({id:`player-context.${index}`,origin:'player-context',personId:admission.playerId,acquisition:'player-context',channel:'player-context',visibilityOrder:0,sourceRefs:sceneRefs([item])}));
  for(const entry of entries) for(const slot of slots) {
  const allowed=admission.hostAudience[slot];
  if(allowed && entry.sourceRefs.some(ref=>same(ref,sourcePair[slot])) && !allowed.includes(entry.routeRecipientId??entry.personId)) fail('REJECTED');
 }
 const manifest={kind:'directive.characterAudienceManifest.v1',policyVersion:1,entries,planDigest:digest({plan:scene.plan,participants:scene.participants,admission,state:snapshot.state,sourceIdentities:[...snapshot.sourceIdentities],selectedArchiveIds:[...selectedArchiveIds]})};
 const evidence={sourcePair,sources:[...used.values()],pairs:[...pairs.values()],admission,selectedEvents:[...selectedEvents.values()]};
 const trustedCoverage=validateCharacterAudienceTrustedSpans(manifest,trustedSpans);
 const prepared={manifest,evidence,identity,manifestDigest:digest(manifest),evidenceDigest:digest(evidence),identityDigest:digest(identity),preparedByPerson,selectedArchiveIds,trustedCoverage};
 // Reviewer validates its actual serialized instructions/schema envelope as well.
 if(JSON.stringify(prepared).length> (limits.requestContextCharacters??48000)) fail('CAPACITY');
 return sealCharacterAudiencePreparation(prepared);
}
