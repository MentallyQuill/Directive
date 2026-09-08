// Scene participation is derived from accepted pairs, never elapsed time or prose length.
import { collectMissionPredicateRefs, evaluateMissionPredicate } from '../mission/v1/predicate-evaluator.mjs';
import { missionStateContext } from '../mission/v1/mission-state.mjs';
const INTENTS = ['continue', 'resolve', 'leave', 'delegate', 'skip'];
const DEPARTURES = ['leave', 'delegate', 'skip'];
const text = value => typeof value === 'string' && value.length <= 240;
const quoteIn = (quote, source) => text(quote) && quote.trim().length >= 4 && String(source || '').includes(quote);

export function createScenePacingSchema(context) {
    const quote = {type:'string',maxLength:240};
    return {type:'object',additionalProperties:false,required:['objectiveId','intent','intentQuote','missionDepartureQuote','unresolved','participation'],properties:{
        objectiveId:{enum:[null,...context.objectives.map(item=>item.id)]},
        intent:{type:'string',enum:INTENTS},intentQuote:quote,missionDepartureQuote:quote,unresolved:quote,
        participation:{type:'array',maxItems:4,items:{type:'object',additionalProperties:false,required:['requirement','playerQuote','assistantQuote'],properties:{requirement:{type:'integer',minimum:0,maximum:3},playerQuote:quote,assistantQuote:quote}}},
    }};
}

export function pacingObservationErrors(observation, {objectives = [], sourcePair = {}} = {}) {
    if (!observation || typeof observation !== 'object' || Array.isArray(observation)) return ['pacing must be an object'];
    const errors = [];
    const keys = ['objectiveId', 'intent', 'intentQuote', 'unresolved', 'participation'];
    if (Object.keys(observation).some(key => ![...keys,'missionDepartureQuote'].includes(key)) || keys.some(key => !Object.hasOwn(observation,key))) errors.push('pacing fields must match the contract');
    if (observation.missionDepartureQuote !== undefined && (!text(observation.missionDepartureQuote) || observation.missionDepartureQuote && (!quoteIn(observation.missionDepartureQuote,sourcePair.currentPlayer?.text) || !['leave','skip'].includes(observation.intent)))) errors.push('mission departure quote must be an explicit player departure');
    const objective = objectives.find(item => item.id === observation.objectiveId);
    if (observation.objectiveId !== null && !objective) errors.push('pacing objective is not available');
    if (!INTENTS.includes(observation.intent)) errors.push('pacing intent is unknown');
    if (!text(observation.unresolved) || !text(observation.intentQuote)) errors.push('pacing text exceeds bounds');
    if (observation.intent !== 'continue' && !quoteIn(observation.intentQuote, sourcePair.currentPlayer?.text)) errors.push('pacing intent quote must come from the player');
    if (!Array.isArray(observation.participation) || observation.participation.length > 4) errors.push('pacing participation must be a bounded array');
    else for (const item of observation.participation) {
        if (!item || Object.keys(item).sort().join(',') !== 'assistantQuote,playerQuote,requirement'
            || !Number.isInteger(item.requirement) || !objective?.scenePacing?.requirements?.[item.requirement]) errors.push('pacing requirement is not authored');
        if (!quoteIn(item?.playerQuote, sourcePair.currentPlayer?.text) || !quoteIn(item?.assistantQuote, sourcePair.previousAssistant?.text)) errors.push('pacing participation quote must match both speakers');
    }
    return errors;
}

export function settleScenePacing({definition, state, receipts = [], observation, sourcePair, assistantAccepted = false} = {}) {
    if (observation) {
        const objectives = definition.objectives.filter(item => ['visible','resolved'].includes(state?.objectives?.[item.id]?.visibility));
        const errors = pacingObservationErrors(observation, {objectives, sourcePair});
        if (errors.length) throw new TypeError(errors.join('; '));
    }
    const last = receipts.at(-1)?.scenePacing;
    const previous = last?.missionId === definition.id ? last : null;
    const displaced = previous?.objectiveId && !DEPARTURES.includes(previous.intent)
        && observation?.objectiveId !== previous.objectiveId;
    if (displaced || !observation) observation = {objectiveId:previous?.objectiveId || createScenePacingContext({definition,state,receipts})?.currentScene.objectiveId || null,intent:'continue',intentQuote:'',unresolved:previous?.unresolved || '',participation:[]};
    const objective = definition.objectives.find(item => item.id === observation?.objectiveId);
    const correctionRevision = state?.objectiveDecisions?.[objective?.id]?.revision || 0;
    const participation = assistantAccepted ? observation?.participation || [] : [];
    const prior = receipts.filter(receipt => receipt.scenePacing?.missionId === definition.id
        && receipt.scenePacing.objectiveId === objective?.id && (receipt.scenePacing.correctionRevision || 0) === correctionRevision
        && receipt.assistantAcceptance === 'accepted');
    const requirements = new Set([...prior.flatMap(receipt => receipt.scenePacing.participation), ...participation].map(item => item.requirement));
    const players = new Set(prior.filter(receipt => receipt.scenePacing.participation.length).map(receipt => receipt.currentPlayer.messageId));
    if (participation.length) players.add(sourcePair.currentPlayer.messageId);
    const ready = Boolean(assistantAccepted && objective && observation.intent === 'resolve' && !observation.unresolved.trim()
        && players.size >= 2 && objective.scenePacing.requirements.every((_, index) => requirements.has(index)));
    return {
        missionId: definition.id,
        objectiveId: objective?.id || null,
        intent: observation?.intent || 'continue',
        unresolved: observation?.unresolved || '',
        participation,
        ready,
        departMission: Boolean(observation.missionDepartureQuote),
        correctionRevision,
    };
}

export function scenePacingPermissions(definition, receipts, state = {}) {
    const last = receipts.at(-1)?.scenePacing;
    const permissions = new Set();
    const current = pacing => (pacing?.correctionRevision || 0) === (state.objectiveDecisions?.[pacing?.objectiveId]?.revision || 0);
    if (last?.missionId === definition.id && current(last) && (last.ready || ['delegate','skip'].includes(last.intent))) permissions.add(last.objectiveId);
    const latestByObjective = new Map();
    for (const receipt of receipts) {
        const pacing = receipt.scenePacing;
        if (pacing?.missionId === definition.id) latestByObjective.set(pacing.objectiveId,pacing);
    }
    for (const pacing of latestByObjective.values()) if (pacing.intent === 'delegate' && current(pacing)) permissions.add(pacing.objectiveId);
    return permissions;
}

export function scenePacingDependencies(definition, receipts, objectiveIds, state = {}) {
    const selected = new Set();
    for (const id of objectiveIds) {
        const matching = receipts.filter(receipt=>receipt.scenePacing?.missionId === definition.id && receipt.scenePacing.objectiveId === id
            && (receipt.scenePacing.correctionRevision || 0) === (state.objectiveDecisions?.[id]?.revision || 0));
        const evidence = matching.filter(receipt=>receipt.scenePacing.participation.length);
        for (let requirement=0; requirement<4; requirement++) {
            const receipt = evidence.find(receipt=>receipt.scenePacing.participation.some(item=>item.requirement===requirement));
            if (receipt) selected.add(receipt);
        }
        for (const receipt of evidence.slice(0,2)) selected.add(receipt);
        if (matching.length) selected.add(matching.at(-1));
    }
    return [...new Set([...selected].flatMap(receipt=>receipt.sourceContributionIds || []))];
}

export function gateScenePacingClaims({definition, state = {}, receipts = [], claims = [], assistantMessageId = null} = {}) {
    const permissions = scenePacingPermissions(definition,receipts,state);
    // Aggregate objectives inherit the completion of their children; do not make a
    // parent block the evidence its own children need to finish.
    const guarded = definition.objectives.filter(objective => objective.scenePacing
        && state.objectives?.[objective.id]?.state !== 'terminal')
        .map(objective => ({id:objective.id,refs:collectMissionPredicateRefs({any:(objective.terminalWhen || []).map(item=>item.when)})}));
    const matches = (claim, refs) => (
        claim.claimType === 'eventOccurred' && refs.events.has(claim.targetId)
        || claim.claimType === 'outcomeObserved' && refs.outcomes.has(claim.targetId)
    );
    // Supported refusal and withdrawal consequences may settle without playing a
    // successful operation. Their evidence policies still have to authorize them.
    const departureConsequence = claim => claim.claimType === 'outcomeObserved' && definition.objectives.some(objective =>
        (objective.terminalWhen || []).some(terminal => ['handedOff','knowinglyDeclined'].includes(terminal.disposition)
            && positiveOutcomeValue(terminal.when,claim.targetId,claim.value)));
    const blocked = claim => (claim.sourceRef?.role === 'assistant' || assistantMessageId !== null && claim.sourceRef?.messageId === assistantMessageId)
        && !departureConsequence(claim) && guarded.some(item=>matches(claim,item.refs)) && !guarded.some(item=>permissions.has(item.id) && matches(claim,item.refs));
    return {acceptedClaims:claims.filter(claim => !blocked(claim)).map(claim => {
        const permitted = guarded.filter(item=>permissions.has(item.id) && matches(claim,item.refs)).map(item=>item.id);
        const dependencies = scenePacingDependencies(definition,receipts,permitted,state);
        return dependencies.length ? {...claim,pacingSourceContributionIds:dependencies} : claim;
    }),rejectedClaims:claims.filter(blocked).map(claim => ({...claim,reasonCode:'scene-participation-required'}))};
}

function positiveOutcomeValue(predicate, id, value) {
    if (!predicate || predicate.not) return false;
    if (predicate.outcomeIs?.id === id) return predicate.outcomeIs.equals === value || predicate.outcomeIs.in?.includes(value);
    return [...(predicate.all || []),...(predicate.any || [])].some(child=>positiveOutcomeValue(child,id,value));
}

export function createScenePacingContext({definition, state, receipts = []} = {}) {
    const objectives = (definition?.objectives || []).filter(objective => objective.scenePacing
        && ['visible','resolved'].includes(state?.objectives?.[objective.id]?.visibility))
        .map(objective => ({id:objective.id,title:objective.playerText.title,scenePacing:{requirements:objective.scenePacing.requirements},status:state.objectives[objective.id].state}));
    if (!(definition?.objectives || []).some(objective=>objective.scenePacing)) return null;
    const last = receipts.at(-1)?.scenePacing;
    let currentScene = last?.missionId === definition.id ? last : {
        missionId:definition.id,objectiveId:objectives.find(item=>item.status!=='terminal')?.id || null,
        intent:'continue',unresolved:'',participation:[],ready:false,departMission:false,
    };
    if ((currentScene.correctionRevision || 0) !== (state?.objectiveDecisions?.[currentScene.objectiveId]?.revision || 0)) {
        currentScene = {...currentScene,intent:'continue',participation:[],ready:false,departMission:false,unresolved:'The player reopened this objective.'};
    }
    return {objectives,currentScene,allowDeparture:['leave','skip'].includes(currentScene.intent),allowMissionDeparture:currentScene.departMission === true};
}

export function sceneAllowsReport({definition, state, receipts = [], route} = {}) {
    const context = createScenePacingContext({definition,state,receipts});
    if (!context || context.allowDeparture || context.currentScene.intent === 'delegate') return true;
    if (route.sceneInterruptWhen) {
        const interrupt = evaluateMissionPredicate(route.sceneInterruptWhen, missionStateContext(definition,state));
        if (interrupt.ok && interrupt.value) return true;
    }
    const objective = definition.objectives.find(item=>item.id === context.currentScene.objectiveId);
    if (!objective) return false;
    // Authored membership includes investigation findings needed for discussion.
    return route.sceneObjectiveIds?.includes(objective.id) === true;
}

export function scenePacingReceiptErrors(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return ['scenePacing receipt must be an object'];
    const errors = [];
    const keys = ['missionId','objectiveId','intent','unresolved','participation','ready','departMission'];
    if (Object.keys(value).some(key=>![...keys,'correctionRevision'].includes(key)) || keys.some(key=>!Object.hasOwn(value,key))) errors.push('scenePacing receipt fields do not match');
    if (value.correctionRevision !== undefined && (!Number.isInteger(value.correctionRevision) || value.correctionRevision < 0)) errors.push('scenePacing correction revision invalid');
    if (typeof value.missionId !== 'string' || value.missionId.length > 180 || !value.missionId) errors.push('scenePacing missionId invalid');
    if (value.objectiveId !== null && (typeof value.objectiveId !== 'string' || value.objectiveId.length > 180 || !value.objectiveId)) errors.push('scenePacing objectiveId invalid');
    if (!INTENTS.includes(value.intent) || typeof value.ready !== 'boolean' || !text(value.unresolved)) errors.push('scenePacing receipt intent invalid');
    if (value.ready && (value.intent !== 'resolve' || value.unresolved || !value.objectiveId)) errors.push('scenePacing readiness contradicts its scene');
    if (typeof value.departMission !== 'boolean' || value.departMission && !['leave','skip'].includes(value.intent)) errors.push('scenePacing mission departure invalid');
    if (!Array.isArray(value.participation) || value.participation.length > 4) errors.push('scenePacing receipt participation invalid');
    else for (const item of value.participation) {
        if (!item || Object.keys(item).sort().join(',') !== 'assistantQuote,playerQuote,requirement' || !Number.isInteger(item.requirement) || item.requirement < 0 || item.requirement > 3 || !text(item.playerQuote) || !text(item.assistantQuote)) errors.push('scenePacing receipt evidence invalid');
    }
    return errors;
}
