import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';
import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';
export const characterAudienceDigest = value => stableSha256Hex(canonicalJson(value));
export function characterAudienceFailure(suffix = 'INVALID') { throw Object.assign(new Error('Character access could not be verified.'), {code:`DIRECTIVE_CHARACTER_AUDIENCE_${suffix}`}); }
const receipts = new WeakMap(), capabilities = new WeakMap(), preparations = new WeakMap();
const fields = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value,k));
export function parseCharacterAudienceReview(value, {manifestDigest,evidenceDigest,identityDigest,entryIds} = {}) {
 if (typeof value === 'string') { try { value=JSON.parse(value); } catch { characterAudienceFailure(); } }
 if (!fields(value,['kind','manifestDigest','evidenceDigest','identityDigest','verdict','checkedEntryIds','findings']) || value.kind!=='directive.characterAudienceReview.v1'
  || ![manifestDigest,evidenceDigest,identityDigest].every(v=>typeof v==='string' && /^[a-f0-9]{64}$/.test(v))
  || value.manifestDigest!==manifestDigest || value.evidenceDigest!==evidenceDigest || value.identityDigest!==identityDigest
  || !['pass','reject'].includes(value.verdict) || !Array.isArray(entryIds) || entryIds.some(id=>typeof id!=='string'||!id||id.length>400) || new Set(entryIds).size!==entryIds.length
  || !Array.isArray(value.checkedEntryIds) || value.checkedEntryIds.length!==entryIds.length || new Set(value.checkedEntryIds).size!==entryIds.length
  || value.checkedEntryIds.some(id=>!entryIds.includes(id)) || !Array.isArray(value.findings) || value.findings.length>32
  || value.findings.some(f=>!fields(f,['entryId','reason']) || !entryIds.includes(f.entryId) || typeof f.reason!=='string' || !f.reason.trim() || f.reason.length>320)
  || (value.verdict==='pass' ? value.findings.length!==0 : value.findings.length===0)) characterAudienceFailure();
 const result=structuredClone(value); receipts.set(result,characterAudienceDigest(result)); return result;
}
export function characterAudiencePreparationDigest(prepared) {
 return characterAudienceDigest({manifest:prepared.manifest,evidence:prepared.evidence,identity:prepared.identity,manifestDigest:prepared.manifestDigest,evidenceDigest:prepared.evidenceDigest,identityDigest:prepared.identityDigest,preparedByPerson:[...prepared.preparedByPerson],selectedArchiveIds:[...prepared.selectedArchiveIds],trustedCoverage:prepared.trustedCoverage});
}
export function sealCharacterAudiencePreparation(prepared) {
 preparations.set(prepared,characterAudiencePreparationDigest(prepared)); return prepared;
}
export function createCharacterAudienceAdmission(prepared, review) {
 if(!preparations.has(prepared)) characterAudienceFailure();
 if(preparations.get(prepared)!==characterAudiencePreparationDigest(prepared)) throw Object.assign(new Error('Character audience admission is stale.'),{code:'DIRECTIVE_CHARACTER_SCENE_STALE'});
 if (!receipts.has(review) || receipts.get(review)!==characterAudienceDigest(review)) characterAudienceFailure();
 parseCharacterAudienceReview(review,{...prepared,entryIds:prepared.manifest.entries.map(e=>e.id)});
 if(review.verdict!=='pass') characterAudienceFailure('REJECTED');
 if(characterAudienceDigest(prepared.manifest)!==prepared.manifestDigest || characterAudienceDigest(prepared.evidence)!==prepared.evidenceDigest || characterAudienceDigest(prepared.identity)!==prepared.identityDigest) characterAudienceFailure();
 const capability=Object.freeze({}); capabilities.set(capability,{prepared,digest:characterAudiencePreparationDigest(prepared),identityDigest:prepared.identityDigest,packets:structuredClone(prepared.preparedByPerson)}); return capability;
}
export function assertCharacterAudienceAdmission(capability,{prepared,identity} = {}) {
 const custody=capabilities.get(capability); if(!custody) characterAudienceFailure();
 if(prepared!==custody.prepared || characterAudiencePreparationDigest(prepared)!==custody.digest || characterAudienceDigest(identity)!==custody.identityDigest) throw Object.assign(new Error('Character audience admission is stale.'),{code:'DIRECTIVE_CHARACTER_SCENE_STALE'});
 return true;
}
export function getAdmittedCharacterPacket(capability,personId) {
 const custody=capabilities.get(capability); if(!custody) characterAudienceFailure();
 assertCharacterAudienceAdmission(capability,{prepared:custody.prepared,identity:custody.prepared.identity});
 if(!custody.packets.has(personId)) characterAudienceFailure(); return structuredClone(custody.packets.get(personId));
}
/** Only the runtime's host metadata argument may supply these spans. No model output is accepted here. */
export function validateCharacterAudienceTrustedSpans(manifest, trustedSpans=[]) {
 if(!Array.isArray(trustedSpans)) characterAudienceFailure();
 const covered=new Set();
 for(const span of trustedSpans) {
  if(!fields(span,['entryId','personId','recipientId','acquisition','channel','sourceRefs','visibilityOrder','allowed']) || typeof span.allowed!=='boolean' || !Number.isSafeInteger(span.visibilityOrder) || span.visibilityOrder<0) characterAudienceFailure();
  const entry=manifest.entries.find(e=>e.id===span.entryId);
  if(!entry || entry.personId!==span.personId || (entry.routeRecipientId??entry.personId)!==span.recipientId || entry.acquisition!==span.acquisition || entry.channel!==span.channel || entry.visibilityOrder!==span.visibilityOrder || characterAudienceDigest(entry.sourceRefs)!==characterAudienceDigest(span.sourceRefs)) characterAudienceFailure();
  if(!span.allowed) characterAudienceFailure('REJECTED'); covered.add(entry.id);
 }
 return {checkedEntryIds:[...covered],complete:covered.size===manifest.entries.length};
}
