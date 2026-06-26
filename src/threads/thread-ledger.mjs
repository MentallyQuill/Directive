export const THREAD_STATUSES = Object.freeze(['observed','latent','watchlisted','available','engaged','active','resolved','transformed','dormant','expired','echo']);
export const THREAD_SHAPES = Object.freeze(['vignette','recurring_detail','character_thread','side_assignment']);
export const THREAD_TYPES = Object.freeze(['crew_growth','interpersonal_relationship','mentorship','professional_dilemma','humanitarian_assistance','cultural_exchange','scientific_curiosity','shipboard_maintenance','recovery_and_aftermath','hobby_ritual_or_domestic_life','light_comedy','local_civilian_problem','promise_debt_or_favor','identity_and_belonging']);
export const THREAD_EPISODE_FUNCTIONS = Object.freeze(['mirror','counterpoint','relief','aftermath','setup']);

const TERMINAL = new Set(['resolved','transformed','expired']);
const HIDDEN = new Set(['observed','latent','watchlisted']);
const TRANSITIONS = Object.freeze({
  observed:['latent','watchlisted','available','expired'], latent:['watchlisted','available','dormant','expired','transformed'],
  watchlisted:['available','engaged','dormant','expired','transformed'], available:['engaged','active','dormant','expired','transformed'],
  engaged:['active','resolved','transformed','dormant','expired'], active:['resolved','transformed','dormant','expired'],
  resolved:['echo'], transformed:['echo'], dormant:['available','watchlisted','expired','echo'], expired:['echo'], echo:[]
});

export function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value.filter((item) => item !== undefined && item !== null) : []; }
function unique(values) { return [...new Set(asArray(values).map((value) => String(value).trim()).filter(Boolean))]; }
function text(value) { return String(value ?? '').trim().replace(/\s+/g,' '); }
function timestamp(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }
function required(value,label) { const result=text(value); if(!result) throw new Error(`${label} is required.`); return result; }
function enumValue(value,allowed,label,fallback=null) { const result=text(value || fallback); if(!allowed.includes(result)) throw new Error(`Unknown ${label} "${value}".`); return result; }

function normalizeSource(source, fallbackId = null) {
  if (typeof source === 'string') return { id: source, type: 'unknown', sceneId:null, turnId:null, outcomeId:null, messageIds:[], anchorRange:null };
  const value = source && typeof source === 'object' ? source : {};
  return {
    id: required(value.id || fallbackId, 'Thread source id'),
    type: text(value.type || 'scene'),
    sceneId:value.sceneId || null, turnId:value.turnId || null, outcomeId:value.outcomeId || null,
    messageIds:unique(value.messageIds || value.sourceMessageIds), anchorRange:cloneJson(value.anchorRange || null),
    textHash:value.textHash || null, rangeHash:value.rangeHash || value.anchorRange?.rangeHash || null
  };
}

function normalizeEvidence(evidence, index, record) {
  const source = normalizeSource(evidence?.source || record.source, `${record.id}.source`);
  return {
    id:text(evidence?.id) || `evidence.${record.id}.${index+1}`,
    type:text(evidence?.type || record.type),
    source,
    excerpt:text(evidence?.excerpt || evidence?.summary || evidence?.text).slice(0,800),
    summary:text(evidence?.summary || evidence?.excerpt || evidence?.text).slice(0,800),
    visibility:evidence?.visibility || 'player_safe', observable:evidence?.observable !== false,
    actorIds:unique(evidence?.actorIds || record.participantIds || record.participants),
    sourceMessageIds:unique(evidence?.sourceMessageIds || source.messageIds),
    sourceOutcomeId:evidence?.sourceOutcomeId || source.outcomeId || null,
    anchorRange:cloneJson(evidence?.anchorRange || source.anchorRange || null),
    tags:unique(evidence?.tags || record.tags),
    recordedAt:evidence?.recordedAt || record.lastReinforcedAt || null,
    invalidated:evidence?.invalidated === true
  };
}

export function threadSemanticFingerprint(input = {}) {
  const participants=unique(input.participantIds || input.participants).sort();
  const tokens=[input.type,input.title,input.summary,input.observableSeed,...asArray(input.tags)].join(' ').toLowerCase()
    .replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter((token)=>token.length>3&&!['with','from','that','this','their','about','having','problem'].includes(token));
  return `${input.type || 'thread'}::${participants.join('|') || 'world'}::${[...new Set(tokens)].sort().slice(0,20).join('-')}`;
}

export function normalizeThreadRecord(record = {}) {
  const id=required(record.id,'Thread record id');
  const status=enumValue(record.status,THREAD_STATUSES,'thread status','observed');
  const shape=enumValue(record.shape,THREAD_SHAPES,'thread shape','vignette');
  const type=enumValue(record.type,THREAD_TYPES,'thread type','professional_dilemma');
  const source=normalizeSource(record.source || asArray(record.supportingEvidence || record.evidence)[0]?.source, `source.${id}`);
  const participantIds=unique(record.participantIds || record.participants || record.linkedCrewIds);
  const base={
    id,status,shape,type,episodeFunction:enumValue(record.episodeFunction,THREAD_EPISODE_FUNCTIONS,'thread episode function','setup'),
    source,originSceneId:record.originSceneId || source.sceneId || source.id,
    participantIds,participants:participantIds,
    title:required(record.title || record.playerSummary || record.observableSeed || type,'Thread title'),
    playerSummary:text(record.playerSummary), summary:text(record.summary || record.playerSummary || record.observableSeed),
    observableSeed:required(record.observableSeed || record.summary || record.playerSummary || record.title,'Thread observable seed'),
    storyQuestion:required(record.storyQuestion || 'Will this unresolved concern receive attention, and what will that attention change?','Thread story question'),
    naturalTrigger:text(record.naturalTrigger || 'During suitable downtime or when the concern naturally returns.'),
    linkedPressureIds:unique(record.linkedPressureIds), linkedCrewIds:unique(record.linkedCrewIds || participantIds), linkedFactIds:unique(record.linkedFactIds), tags:unique(record.tags),
    supportingEvidence:[], evidence:[],
    reinforcementCount:Math.max(1,Number(record.reinforcementCount || asArray(record.supportingEvidence || record.evidence).length || 1)),
    playerInterest:Math.max(0,Number((record.playerInterest ?? (record.rawScores?.playerInterest === true ? 1 : 0)) || 0)),
    salience:Math.max(0,Math.min(1,Number(record.salience ?? record.rawScores?.confidence ?? 0.55))),
    firstObservedAt:record.firstObservedAt || record.createdAt || null,lastReinforcedAt:record.lastReinforcedAt || record.updatedAt || null,lastSurfacedAt:record.lastSurfacedAt || null,
    boundaryLastReinforced:Number(record.boundaryLastReinforced || 0),cooldownUntilBoundary:Number(record.cooldownUntilBoundary || 0),
    promotedQuestId:record.promotedQuestId || record.metadata?.promotedQuestId || null,
    closureSummary:text(record.closureSummary),bearingPotential:cloneJson(record.bearingPotential || {eligible:false}),rawScores:cloneJson(record.rawScores || {}),
    metadata:cloneJson(record.metadata || {}),history:asArray(record.history).map(cloneJson),lastUpdatedByOutcomeId:record.lastUpdatedByOutcomeId || null,
    semanticFingerprint:record.semanticFingerprint || ''
  };
  const rawEvidence=asArray(record.supportingEvidence || record.evidence);
  base.supportingEvidence=rawEvidence.map((item,index)=>normalizeEvidence(item,index,base));
  base.evidence=base.supportingEvidence;
  base.semanticFingerprint=record.semanticFingerprint || threadSemanticFingerprint(base);
  return base;
}

export function createThreadLedger({ records=[], activationReviews=[], closureReviews=[], promotionReviews=[], pacing={}, history=[] }={}) {
  return { schemaVersion:2, records:records.map(normalizeThreadRecord), activationReviews:asArray(activationReviews).map(cloneJson), closureReviews:asArray(closureReviews).map(cloneJson), promotionReviews:asArray(promotionReviews).map(cloneJson), pacing:{ boundaryIndex:Number(pacing.boundaryIndex||0), lastSurfacedThreadId:pacing.lastSurfacedThreadId||null, recentParticipantIds:unique(pacing.recentParticipantIds), lastBoundaryType:pacing.lastBoundaryType||null }, history:asArray(history).map(cloneJson) };
}

function mergeRecord(previous,incoming,now=null) {
  if(!previous) return normalizeThreadRecord(incoming);
  const a=normalizeThreadRecord(previous), b=normalizeThreadRecord(incoming);
  const evidenceById=new Map(a.supportingEvidence.map((item)=>[item.id,item]));
  for(const item of b.supportingEvidence) evidenceById.set(item.id,item);
  const newCount=[...evidenceById.keys()].filter((id)=>!a.supportingEvidence.some((item)=>item.id===id)).length;
  return normalizeThreadRecord({ ...a,...b,status:a.status==='active'||a.status==='engaged'?a.status:b.status,participantIds:unique([...a.participantIds,...b.participantIds]),tags:unique([...a.tags,...b.tags]),linkedFactIds:unique([...a.linkedFactIds,...b.linkedFactIds]),supportingEvidence:[...evidenceById.values()],reinforcementCount:Math.max(a.reinforcementCount,b.reinforcementCount,a.reinforcementCount+newCount),playerInterest:Math.max(a.playerInterest,b.playerInterest),salience:Math.max(a.salience,b.salience),firstObservedAt:a.firstObservedAt||b.firstObservedAt,lastReinforcedAt:b.lastReinforcedAt||timestamp(now),history:[...a.history,...b.history] });
}

export function transitionThread(ledger,threadId,toStatus,{now=null,reason='thread-transition',metadata={},sourceOutcomeId=null}={}) {
  const next=createThreadLedger(ledger); const index=next.records.findIndex((item)=>item.id===threadId); if(index<0) throw new Error(`Unknown thread "${threadId}".`);
  const record=next.records[index]; if(record.status!==toStatus&&!asArray(TRANSITIONS[record.status]).includes(toStatus)) throw new Error(`Invalid thread transition ${record.status} -> ${toStatus} for "${threadId}".`);
  next.records[index]=normalizeThreadRecord({...record,status:toStatus,lastUpdatedByOutcomeId:sourceOutcomeId||record.lastUpdatedByOutcomeId,metadata:{...record.metadata,...cloneJson(metadata)},history:[...record.history,{at:timestamp(now),from:record.status,to:toStatus,reason,metadata:cloneJson(metadata),sourceOutcomeId}]});
  next.history.push({at:timestamp(now),type:'thread-transition',threadId,from:record.status,to:toStatus,reason}); return next;
}

export function applyThreadLedgerDelta(ledger={},delta={}, {now=null}={}) {
  let next=createThreadLedger(ledger); const byId=new Map(next.records.map((item)=>[item.id,item]));
  for(const raw of asArray(delta.upsertRecords||delta.records)){ const normalized=normalizeThreadRecord(raw); byId.set(normalized.id,mergeRecord(byId.get(normalized.id),normalized,now)); }
  next.records=[...byId.values()];
  for(const transition of asArray(delta.transitions)){ next=transitionThread(next,transition.threadId||transition.id,transition.status||transition.toStatus,{now:transition.at||now,reason:transition.reason,metadata:transition.metadata,sourceOutcomeId:transition.sourceOutcomeId}); }
  next.activationReviews.push(...asArray(delta.activationReviewsAdd).map(cloneJson));
  next.closureReviews.push(...asArray(delta.closureReviewsAdd).map(cloneJson));
  next.promotionReviews.push(...asArray(delta.promotionReviewsAdd).map(cloneJson));
  if(delta.pacing) next.pacing={...next.pacing,...cloneJson(delta.pacing)};
  return next;
}

export function threadPlayerSummaries(ledger,{statuses=['available','engaged','active','resolved','echo'],limit=8}={}) {
  const allowed=new Set(statuses);
  return asArray(ledger?.records)
    .filter((record)=>{
      const status=text(record?.status || 'observed');
      return allowed.has(status)&&!HIDDEN.has(status)&&record?.metadata?.stale!==true;
    })
    .map((record)=>{
      try {
        return normalizeThreadRecord(record);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a,b)=>b.salience-a.salience||b.playerInterest-a.playerInterest)
    .slice(0,limit).map((record)=>({id:record.id,title:record.title,status:record.status,shape:record.shape,type:record.type,summary:record.playerSummary||record.observableSeed,participantIds:cloneJson(record.participantIds),promotedQuestId:record.promotedQuestId||null}));
}

export function invalidateThreadEvidenceByAnchorRange(ledger,rangeHash,{now=null}={}) {
  const next=createThreadLedger(ledger); const affected=[];
  for(const record of next.records){ let hit=false; record.supportingEvidence=record.supportingEvidence.map((evidence)=>{ if(evidence.anchorRange?.rangeHash===rangeHash||evidence.source?.rangeHash===rangeHash){hit=true;return {...evidence,invalidated:true,invalidatedAt:timestamp(now)};}return evidence;});record.evidence=record.supportingEvidence;if(hit){affected.push(record.id);record.metadata={...record.metadata,stale:true,staleReason:'source-anchor-changed'};}}
  return {ledger:next,affectedThreadIds:affected};
}

export const __threadLedgerTestHooks=Object.freeze({TRANSITIONS,TERMINAL,HIDDEN,mergeRecord,normalizeEvidence});
