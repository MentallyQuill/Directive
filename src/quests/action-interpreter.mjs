import { questInstanceById, questTemplateById } from './quest-ledger.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function compact(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function words(value) { return new Set(compact(value).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((item) => item.length > 2)); }
function overlap(a, b) { let count = 0; for (const item of a) if (b.has(item)) count += 1; return count; }

const INTENTS = Object.freeze(['advance', 'investigate', 'negotiate', 'support', 'repair', 'protect', 'travel', 'delegate', 'defer', 'refuse', 'clarify']);
const RISK = Object.freeze(['cautious', 'balanced', 'aggressive']);

const OBJECTIVE_STAGE_ALIASES = Object.freeze({
  understand: 'investigate inspect scan analyze analyse diagnose review logs cause constraints establish identify question listen understand assess',
  listen: 'listen ask understand concern needs facts hear discuss',
  support: 'support help repair fix restore reallocate schedule resources implement response plan assist resolve',
  choice: 'support help offer choose plan consent boundaries assistance response',
  followup: 'follow up verify check confirm result outcome sustainable later monitor review',
  protect: 'protect rescue evacuate escort shield secure',
  negotiate: 'negotiate talk mediate persuade offer agreement',
  recover: 'recover retrieve locate salvage',
  investigate: 'investigate inspect analyze trace question evidence scan'
});

function objectiveAliasText(objective) {
  const id = compact(objective?.id).toLowerCase();
  const label = compact(objective?.text || objective?.label || objective?.summary);
  const aliases = Object.entries(OBJECTIVE_STAGE_ALIASES)
    .filter(([key]) => id.includes(`.${key}`) || id.endsWith(key) || label.toLowerCase().includes(key))
    .map(([, value]) => value);
  return `${label} ${aliases.join(' ')}`;
}

export function buildQuestActionInterpreterRequest({ playerInput, state, packageData, questId = null, sourceAnchorRange = null } = {}) {
  const instance = questInstanceById(state?.questLedger, questId || state?.questLedger?.foregroundQuestId);
  const template = questTemplateById(packageData, instance?.templateId || instance?.id, state);
  if (!instance || !template) return null;
  return {
    contract: 'directive.questActionInterpretation.v2',
    instruction: 'Map the player text to established quest objectives and authorized approach tags. Do not decide success, invent facts, advance state, or expose hidden information.',
    playerInput: compact(playerInput),
    quest: {
      id: instance.id,
      title: template.title,
      summary: template.playerSummary || template.summary,
      objectiveIds: asArray(instance.objectiveStates).filter((item) => !['complete', 'waived', 'failed'].includes(item.status)).map((item) => item.id),
      objectives: asArray(template.objectives).map((item) => ({ id: item.id, text: item.playerText || item.label || item.summary })),
      allowedApproaches: asArray(template.approaches),
      currentLocationId: state?.worldState?.currentLocationId || null
    },
    allowedIntentKinds: [...INTENTS],
    allowedRiskPostures: [...RISK],
    sourceAnchorRange: cloneJson(sourceAnchorRange)
  };
}

function inferredIntent(text) {
  const value = text.toLowerCase();
  if (/\b(delegate|assign|have .+ handle|send .+ to)\b/.test(value)) return 'delegate';
  if (/\b(refuse|decline|won't|will not|reject)\b/.test(value)) return 'refuse';
  if (/\b(later|defer|postpone|hold off|not now)\b/.test(value)) return 'defer';
  if (/\b(repair|fix|restore|maintain|diagnose)\b/.test(value)) return 'repair';
  if (/\b(investigate|scan|analy[sz]e|inspect|trace|question|research)\b/.test(value)) return 'investigate';
  if (/\b(negotiate|talk|persuade|mediate|offer|ask)\b/.test(value)) return 'negotiate';
  if (/\b(protect|rescue|evacuate|shield|escort)\b/.test(value)) return 'protect';
  if (/\b(assist|support|help|aid|care)\b/.test(value)) return 'support';
  if (/\b(travel|go to|set course|proceed to)\b/.test(value)) return 'travel';
  if (/\b(what|which|clarify|explain)\b/.test(value)) return 'clarify';
  return 'advance';
}

export function deterministicQuestActionInterpretation({ playerInput, state, packageData, questId = null, sourceAnchorRange = null } = {}) {
  const request = buildQuestActionInterpreterRequest({ playerInput, state, packageData, questId, sourceAnchorRange });
  if (!request) return { ok: false, reason: 'no-foreground-quest', interpretation: null };
  const inputWords = words(playerInput);
  const activeObjectiveIds = new Set(request.quest.objectiveIds);
  const scored = request.quest.objectives
    .filter((objective) => activeObjectiveIds.has(objective.id))
    .map((objective) => {
      const lexical = overlap(inputWords, words(objectiveAliasText(objective)));
      const idWords = overlap(inputWords, words(String(objective.id).replaceAll('.', ' ')));
      return { id: objective.id, score: lexical * 2 + idWords };
    }).sort((a, b) => b.score - a.score || request.quest.objectiveIds.indexOf(a.id) - request.quest.objectiveIds.indexOf(b.id));
  const best = scored[0];
  const targetObjectiveIds = best && best.score > 0
    ? scored.filter((item) => item.score === best.score && item.score >= 4).slice(0, 2).map((item) => item.id)
    : request.quest.objectiveIds.slice(0, 1);
  const approachScores = request.quest.allowedApproaches.map((approach) => ({ approach, score: overlap(inputWords, words(approach)) })).sort((a, b) => b.score - a.score);
  const riskPosture = /\b(maximum|all speed|immediately|force|override|ram|fire)\b/i.test(playerInput) ? 'aggressive'
    : /\b(careful|cautious|verify|double-check|slowly|minimi[sz]e)\b/i.test(playerInput) ? 'cautious' : 'balanced';
  return {
    ok: true,
    interpretation: {
      contractVersion: 2,
      intentKind: inferredIntent(compact(playerInput)),
      targetObjectiveIds,
      approachTags: approachScores.filter((item) => item.score > 0).slice(0, 2).map((item) => item.approach),
      riskPosture,
      declaredMethod: compact(playerInput),
      commitment: /\b(commit|we will|do it|proceed|make it so)\b/i.test(playerInput) ? 'committed' : 'provisional',
      confidence: best?.score ? Math.min(0.96, 0.56 + best.score * 0.08) : 0.48,
      assumptions: [],
      sourceAnchorRange: cloneJson(sourceAnchorRange),
      provenance: { method: 'deterministic', objectiveScores: scored.slice(0, 4) }
    }
  };
}

export function validateQuestActionInterpretation(proposal, { state, packageData, questId = null, playerInput = '', sourceAnchorRange = null } = {}) {
  const fallback = deterministicQuestActionInterpretation({ playerInput, state, packageData, questId, sourceAnchorRange });
  if (!proposal || typeof proposal !== 'object' || !fallback.ok) return fallback;
  const request = buildQuestActionInterpreterRequest({ playerInput, state, packageData, questId, sourceAnchorRange });
  const allowedObjectives = new Set(request.quest.objectiveIds);
  const targets = asArray(proposal.targetObjectiveIds).filter((id) => allowedObjectives.has(id)).slice(0, 2);
  const allowedApproaches = new Set(request.quest.allowedApproaches);
  const approaches = asArray(proposal.approachTags).filter((value) => allowedApproaches.has(value)).slice(0, 3);
  const intentKind = INTENTS.includes(proposal.intentKind) ? proposal.intentKind : fallback.interpretation.intentKind;
  const riskPosture = RISK.includes(proposal.riskPosture) ? proposal.riskPosture : fallback.interpretation.riskPosture;
  return {
    ok: true,
    interpretation: {
      ...fallback.interpretation,
      intentKind,
      targetObjectiveIds: targets.length ? targets : fallback.interpretation.targetObjectiveIds,
      approachTags: approaches.length ? approaches : fallback.interpretation.approachTags,
      riskPosture,
      declaredMethod: compact(proposal.declaredMethod || playerInput),
      commitment: proposal.commitment === 'committed' ? 'committed' : fallback.interpretation.commitment,
      confidence: Math.max(0, Math.min(1, Number(proposal.confidence ?? fallback.interpretation.confidence))),
      assumptions: asArray(proposal.assumptions).map(compact).filter(Boolean).slice(0, 4),
      sourceAnchorRange: cloneJson(sourceAnchorRange),
      provenance: { method: 'model-validated', fallback: fallback.interpretation.provenance }
    }
  };
}

export async function interpretQuestActionWithModel({ generationRouter, playerInput, state, packageData, questId = null, sourceAnchorRange = null } = {}) {
  const request = buildQuestActionInterpreterRequest({ playerInput, state, packageData, questId, sourceAnchorRange });
  if (!request || !generationRouter?.generate) return deterministicQuestActionInterpretation({ playerInput, state, packageData, questId, sourceAnchorRange });
  try {
    const result = await generationRouter.generate('questActionInterpreter', {
      prompt: JSON.stringify(request),
      structuredOutput: true,
      metadata: { questId: request.quest.id, sourceAnchorRange }
    });
    const response = result?.response ?? result;
    const payload = response?.data ?? response?.parsed ?? response?.output ?? response?.value ?? response?.content ?? response;
    return validateQuestActionInterpretation(payload, { state, packageData, questId, playerInput, sourceAnchorRange });
  } catch (error) {
    const fallback = deterministicQuestActionInterpretation({ playerInput, state, packageData, questId, sourceAnchorRange });
    return { ...fallback, fallbackReason: error?.message || String(error) };
  }
}
