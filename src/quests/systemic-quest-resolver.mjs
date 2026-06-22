import { questInstanceById, questTemplateById, updateQuestObjectives } from './quest-ledger.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function compact(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash >>> 0);
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }

function actorCapability(state, interpretation) {
  let score = 54;
  if (interpretation.confidence >= 0.75) score += 8;
  if (interpretation.approachTags.length) score += 8;
  if (interpretation.riskPosture === 'cautious') score += 4;
  if (interpretation.riskPosture === 'aggressive') score -= 3;
  const shipCondition = String(state?.ship?.overallCondition || state?.ship?.condition || '').toLowerCase();
  if (/critical|disabled/.test(shipCondition)) score -= 18;
  if (/damaged|strained/.test(shipCondition)) score -= 8;
  return clamp(score, 10, 90);
}

function pressureDifficulty(template, state) {
  const active = asArray(template?.pressures);
  const base = active.reduce((sum, item) => sum + clamp(item.severity || 2, 1, 5) * 3, 0);
  const relevantFronts = new Set(asArray(template?.contextHints?.frontIds));
  const frontPressure = asArray(state?.worldState?.fronts).filter((item) => relevantFronts.has(item.id)).reduce((sum, item) => sum + clamp(item.value ?? item.stageValue ?? 0, 0, 8), 0);
  return clamp(25 + base + frontPressure, 20, 82);
}

function resultBandFor({ turnId, playerInput, interpretation, template, state }) {
  if (interpretation.intentKind === 'clarify') return 'Partial Failure';
  if (['defer', 'refuse'].includes(interpretation.intentKind)) return 'Partial Failure';
  const capability = actorCapability(state, interpretation);
  const difficulty = pressureDifficulty(template, state);
  const jitter = stableHash(`${turnId}|${playerInput}|${interpretation.targetObjectiveIds.join(',')}`) % 17 - 8;
  const margin = capability - difficulty + jitter;
  if (margin >= 20) return 'Success';
  if (margin >= 0) return 'Partial Success';
  if (margin >= -18) return 'Partial Failure';
  return 'Failure';
}

function progressAmount(resultBand, interpretation, objective, template) {
  const model = objective?.progressModel || {};
  const noAttempt = ['clarify', 'defer', 'refuse'].includes(interpretation.intentKind);
  if (noAttempt) return 0;
  const base = resultBand === 'Success' ? Number(model.strongMatchProgress || 55)
    : resultBand === 'Partial Success' ? Number(model.defaultProgress || 35)
      : resultBand === 'Partial Failure' ? Number(model.setbackProgress || 15)
        : resultBand === 'Failure' ? Math.max(5, Number(model.setbackProgress || 15) - 5) : 0;
  const methodBonus = interpretation.approachTags.length ? 5 : 0;
  const riskAdjustment = interpretation.riskPosture === 'aggressive' && resultBand === 'Success' ? 5 : 0;
  return clamp(base + methodBonus + riskAdjustment, 0, Number(template?.systemicResolution?.maxObjectiveProgressPerTurn || 60));
}

function costsFor(resultBand, template, interpretation) {
  if (!['Partial Success', 'Partial Failure', 'Failure'].includes(resultBand)) return [];
  const pressure = asArray(template?.pressures)[0];
  const severity = resultBand === 'Failure' ? 'major' : resultBand === 'Partial Failure' ? 'moderate' : 'minor';
  return [{
    id: `cost.${pressure?.id || 'systemic'}.${resultBand.toLowerCase()}`,
    type: interpretation.riskPosture === 'aggressive' ? 'exposure' : 'time-or-strain',
    severity,
    summary: pressure?.summary || 'The attempt consumes time, attention, or goodwill and changes the next decision.'
  }];
}

function completionState(instance, updates) {
  const byId = new Map(instance.objectiveStates.map((item) => [item.id, { ...item }]));
  for (const update of updates) byId.set(update.id, { ...(byId.get(update.id) || {}), ...update });
  const required = [...byId.values()].filter((item) => item.optional !== true);
  return required.length > 0 && required.every((item) => item.status === 'complete' || Number(item.progress) >= 100);
}

function selectOutcome(template, resultBand, interpretation) {
  const outcomes = asArray(template?.outcomes);
  if (!outcomes.length) return { id: 'resolved', summary: 'The assignment is resolved.', effects: [] };
  const riskWords = interpretation.riskPosture === 'aggressive' ? /cost|hard|force|risk/i : /integrated|repair|cooper|success|trust|care/i;
  return outcomes.find((item) => riskWords.test(`${item.id} ${item.summary}`)) || outcomes[0];
}

export function resolveSystemicQuestAction({ state, packageData, turnId, playerInput, interpretation, questId = null, sourceAnchorRange = null } = {}) {
  const instance = questInstanceById(state?.questLedger, questId || state?.questLedger?.foregroundQuestId);
  const template = questTemplateById(packageData, instance?.templateId || instance?.id, state);
  if (!instance || !template) throw new Error('Systemic quest resolution requires an active quest template and instance.');
  const resultBand = resultBandFor({ turnId, playerInput, interpretation, template, state });
  const activeObjectives = instance.objectiveStates.filter((item) => !['complete', 'waived', 'failed'].includes(item.status));
  const targets = asArray(interpretation.targetObjectiveIds).length
    ? activeObjectives.filter((item) => interpretation.targetObjectiveIds.includes(item.id))
    : activeObjectives.slice(0, 1);
  const objectiveUpdates = targets.map((objectiveState) => {
    const objective = asArray(template.objectives).find((item) => item.id === objectiveState.id) || {};
    const increment = progressAmount(resultBand, interpretation, objective, template);
    const progress = clamp(Number(objectiveState.progress || 0) + increment, 0, 100);
    return { id: objectiveState.id, progress, status: progress >= 100 ? 'complete' : (increment > 0 ? 'in-progress' : objectiveState.status), evidenceIds: [`turn.${turnId}`] };
  });
  const completed = completionState(instance, objectiveUpdates);
  const outcome = completed ? selectOutcome(template, resultBand, interpretation) : null;
  const costs = costsFor(resultBand, template, interpretation);
  const locationLabel = asArray(packageData?.world?.locations).find((item) => item.id === state?.worldState?.currentLocationId)?.label || state?.worldState?.currentLocationId || 'the current location';
  const targetLabels = objectiveUpdates.map((update) => asArray(template.objectives).find((item) => item.id === update.id)?.playerText || update.id);
  const summary = interpretation.intentKind === 'clarify'
    ? `The command team identifies what must be clarified before ${template.title} can advance.`
    : ['defer', 'refuse'].includes(interpretation.intentKind)
      ? `${template.title} does not advance; the decision to ${interpretation.intentKind} remains a consequential command choice.`
      : `${template.title} advances at ${locationLabel}: ${targetLabels.join('; ') || compact(playerInput)}${costs.length ? `, with ${costs[0].summary.toLowerCase()}` : ''}.`;
  const outcomeId = `outcome.${String(turnId).replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
  const revealedFactIds = [];
  for (const revelation of asArray(template.revelations)) {
    const threshold = Number(revelation.progressThreshold || 100);
    if (!revealedFactIds.includes(revelation.id) && objectiveUpdates.some((item) => item.progress >= threshold)) revealedFactIds.push(revelation.id);
  }
  const stateDelta = {
    outcomeId,
    mission: { knownFactIdsAdd: revealedFactIds },
    openWorld: {
      questObjectiveUpdates: [{ questId: instance.id, updates: objectiveUpdates, reason: `systemic-${resultBand.toLowerCase()}` }],
      questResolution: completed ? { questId: instance.id, outcomeId, outcomeKey: outcome?.id || 'resolved' } : null,
      sourceAnchorRange: cloneJson(sourceAnchorRange)
    }
  };
  return {
    contractVersion: 2,
    turnId,
    intentParse: { summary: compact(playerInput), primaryIntent: interpretation.intentKind, targetIds: interpretation.targetObjectiveIds, declaredMethod: interpretation.declaredMethod, assumptions: interpretation.assumptions, signals: { systemicQuest: true } },
    actionClassification: { category: ['clarify'].includes(interpretation.intentKind) ? 'clarificationNeeded' : 'validWithinMissionBounds', reason: 'The action is interpreted against the active quest objectives; success is resolved deterministically.' },
    authorityCapabilityCheck: { authority: { result: 'availableWithinMissionFrame', basis: ['The player holds mission command authority.'] }, capability: { result: resultBand === 'Failure' ? 'strained' : 'feasible', basis: [`Capability was evaluated against ${asArray(template.pressures).length} active quest pressure(s).`] }, constraints: costs.map((item) => item.summary), result: 'authorizedAndEvaluated' },
    directorResponse: { usedDecisionPointIds: [], usedFactIds: [], usedClockIds: [], usedPressureIds: asArray(template.pressures).map((item) => item.id).slice(0, 2), primaryPressureIds: asArray(template.pressures).map((item) => item.id).slice(0, 1), secondaryPressureIds: asArray(template.pressures).map((item) => item.id).slice(1, 2), commandDecisionCandidates: [], focusBudget: { primaryPressureMax: 1, secondaryPressureMax: 1, relationshipBeatMax: 1 }, responseSummary: summary },
    outcomePacket: { id: outcomeId, resultBand, summary, costs, revealedFactIds, commandDecisionAwards: [], questCompleted: completed, questOutcomeKey: outcome?.id || null, simulationPolicy: { simulationMode: state?.settings?.simulationMode || 'Command', fatalityAllowedForPlayerOrSeniorStaff: false, severityCeilingApplied: true } },
    competencePacket: { sourceOutcomeId: outcomeId, assumedActions: [], proceduralWarnings: [], authorityNotes: [], counselRequests: [], noGotchaPolicyApplied: true },
    stateDelta,
    narratorPacket: { sourceOutcomeId: outcomeId, resultBand, summary, constraints: ['Narrate only the committed systemic result.', 'Do not invent additional objective completion, hidden facts, or quest consequences.'], allowedFacts: revealedFactIds, forbiddenFacts: [] },
    commandLogPacket: { sourceOutcomeId: outcomeId, summaryInputs: [compact(playerInput), summary], visibleConsequences: costs.map((item) => item.summary) },
    systemicResolution: { questId: instance.id, templateId: template.id, interpretation: cloneJson(interpretation), objectiveUpdates, completed, outcome: cloneJson(outcome), disposition: interpretation.intentKind === 'clarify' ? 'clarification' : ['defer', 'refuse'].includes(interpretation.intentKind) ? 'no-attempt' : resultBand === 'Partial Success' ? 'success-at-cost' : resultBand === 'Partial Failure' ? 'setback' : resultBand === 'Failure' ? 'failure-forward' : 'success' }
  };
}

export function applySystemicQuestProgress(state, packet, { now = null } = {}) {
  const details = packet?.systemicResolution;
  if (!details?.questId) return cloneJson(state);
  const next = cloneJson(state);
  next.questLedger = updateQuestObjectives(next.questLedger, details.questId, details.objectiveUpdates, { now, reason: `systemic-${packet.outcomePacket.resultBand}` });
  return next;
}

export const __systemicQuestResolverTestHooks = Object.freeze({ resultBandFor, progressAmount, costsFor, completionState });
