import { prepareCharacterAudienceInput } from './character-audience-preparation.mjs';
import { createCharacterAudienceReviewer } from '../story/character-audience-reviewer.mjs';
import { captureV1StorySource } from './v1-accepted-pair-source.mjs';
import { createCharacterSceneDiagnostics } from './character-scene-diagnostics.mjs';
import { createCharacterRuntimeSnapshot } from './character-runtime-snapshot.mjs';
import { createCharacterSceneCoordinator } from './character-scene-coordinator.mjs';
import { materializeCharacterSceneAdmission } from '../story/character-scene-admission.mjs';
import { createCharacterResponder } from '../story/character-responder.mjs';
import { createCharacterSceneNarrator, parseCharacterContinuation } from '../narration/character-scene-narrator.mjs';
import { createCharacterKnowledgeReviewer, createReviewedCharacterScene } from '../story/character-knowledge-reviewer.mjs';
import { createCharacterScenePublicationMetadata } from '../story/character-scene-publication.mjs';
import { createTurnAttemptBudget } from '../generation/turn-attempt-budget.mjs';
import { assertGenerationActive } from './generation-cancellation.mjs';

/** Prepare one private candidate. The caller retains transcript ownership and
 * supplies the existing serialized host publication operation to publish(). */
export async function prepareProtectedCharacterTurn({ generation, campaignState, crewDataset, messages,
  sourcePair, admission, sourceContributionIds = [], identity, guard, publicationId, expectedBinding,
  hostMessageId = null, requireEmpty = false, signal, settings, pacing = null, continuation = null, scenePolicy = null, limits = {}, analysisLimits = {}, onPhase, onAttempt, onDiagnostics } = {}) {
  assertGenerationActive(signal);
  sourcePair = Object.fromEntries(Object.entries(sourcePair).map(([slot, source]) => {
    const matches = messages.map(message => captureV1StorySource(message)).filter(result => result.ok && result.value.messageId === source.messageId);
    if (matches.length === 1 && matches[0].value.selectedSwipeId === source.selectedSwipeId && matches[0].value.textHash === source.textHash) {
      return [slot, { ...source, text: matches[0].value.text }];
    }
    return [slot, source];
  }));
  continuation = parseCharacterContinuation(continuation, sourcePair);
  if (!guard?.isCurrent?.()) throw Object.assign(new Error('Protected turn is stale.'), { code: 'DIRECTIVE_CHARACTER_SCENE_STALE' });
  const snapshot = createCharacterRuntimeSnapshot({ campaignState, crewDataset, messages, currentSourceIds: sourceContributionIds });
  const admitted = materializeCharacterSceneAdmission(admission, { sourcePair, knownPersonIds: new Set(snapshot.characters.keys()),
    explicitAudience: new Map(Object.entries(admission.hostAudience).map(([slot, ids]) => [slot, new Set(ids)])) });
  const scenePacket = { kind: 'directive.playerScenePacket.v1', player: { personId: admission.playerId, name: campaignState.player?.name || 'Player' },
    situation: scenePolicy?.situation || 'Respond within the supplied player-accessible scene. Leave the player free to act.', information: admitted.playerInformation,
    constraints: scenePolicy?.constraints || [], visiblePersonIds: [...new Set([admission.playerId, ...admitted.participants.flatMap(person => [person.personId, ...person.audience.map(route => route.personId)])])] };
  const trace = createCharacterSceneDiagnostics({ identity, publicationId, onUpdate: onDiagnostics });
  const phase = value => { trace.phase(value); try { onPhase?.(value); } catch {} };
  const measuredGeneration = { getRequestCapacity: roleId => generation.getRequestCapacity?.(roleId) ?? null, async generate(roleId, request, options) {
    const started = performance.now();
    try {
      const result = await generation.generate(roleId, request, options);
      trace.response({ roleId, durationMs: performance.now() - started, usage: result?.response?.usage ?? result?.usage ?? result?.diagnostics?.usage,
        errorCode: result?.ok === false ? result.error?.code || 'generation-failed' : null });
      return result;
    } catch (error) { trace.response({ roleId, durationMs: performance.now() - started, errorCode: error?.code || 'generation-failed' }); throw error; }
  } };
  const budget = createTurnAttemptBudget({ limit: Math.min(limits.maxAttempts ?? 10, 10), signal, onClaim: used => { trace.attempt(used); try { onAttempt?.(used); } catch {} } });
  let flight, audienceReservation, finalizationReservations;
  try {
    const audiencePreparation = prepareCharacterAudienceInput({ snapshot, messages, sourcePair, admission, identity, limits: { ...analysisLimits, ...limits } });
    if (budget.available < admitted.plan.length + (audiencePreparation.trustedCoverage.complete ? 2 : 3)) {
      throw Object.assign(new Error('Character turn attempt limit.'), { code: 'DIRECTIVE_TURN_ATTEMPT_LIMIT' });
    }
    if (!audiencePreparation.trustedCoverage.complete) audienceReservation = budget.reserve('character-audience', 1);
    finalizationReservations = { narration: budget.reserve('character-narration', 1), review: budget.reserve('character-review', 1) };
    phase('audience');
    const { capability: audienceAdmission } = await createCharacterAudienceReviewer({ generation: measuredGeneration }).review({
      prepared: audiencePreparation, budget, reservation: audienceReservation, signal, isCurrent: guard.isCurrent, analysisLimits,
    });
    budget.release(audienceReservation);
    flight = createCharacterSceneCoordinator({ responder: createCharacterResponder({ generation: measuredGeneration }), limits }).createFlight({
      snapshot, sourcePair, participants: admitted.participants, plan: admitted.plan, playerId: admission.playerId,
      sceneEvidence: { admission, sourcePair }, identity, budget, signal, isCurrent: guard.isCurrent, audienceAdmission, audiencePreparation, finalizationReservations,
    });
    const pipeline = createReviewedCharacterScene({ narrator: createCharacterSceneNarrator({ generation: measuredGeneration }), reviewer: createCharacterKnowledgeReviewer({ generation: measuredGeneration }) });
    const approved = await pipeline.generate({ flight, scenePacket, budget, signal, settings, pacing, continuation, onPhase: phase });
    let disposed = false;
    const dispose = () => { if (!disposed) { disposed = true; flight.dispose(); budget.dispose(); } };
    async function publish(publisher, publicationSignal, recovery) {
      try {
        assertGenerationActive(publicationSignal);
        if ((recovery ? !guard.hasPublished || !guard.reauthorizePublished() : disposed) || !guard.isCurrent()) {
          throw Object.assign(new Error('Protected turn is stale.'), { code: 'DIRECTIVE_CHARACTER_SCENE_STALE' });
        }
        phase('publication');
        const result = await publisher({ publicationId, text: approved.candidate.text, expectedBinding, hostMessageId, requireEmpty, signal: publicationSignal,
          assertCurrent: input => {
            if (!guard.assertPublication(input)) return false;
            // Recovery may save only the row already written by this approved
            // candidate. An aborted flight can never authorize another append.
            if (!recovery) flight.assertCurrent(approved.draft.flightDigest);
            return true;
          },
          createMetadata: source => createCharacterScenePublicationMetadata({ approved, scenePacket, pacing, continuation, publicationId, source }),
        });
        if (result?.persisted !== true) throw Object.assign(new Error('Protected publication is pending.'), { code: 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' });
        trace.finish('complete'); dispose(); return result;
      } catch (error) {
        trace.finish(error?.code === 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING' ? 'pending' : signal?.aborted ? 'canceled' : 'failed', error?.code);
        if (error?.code !== 'DIRECTIVE_CHARACTER_PUBLICATION_PENDING') dispose();
        throw error;
      }
    }
    return {
      publicationId, get diagnostics() { return trace.snapshot(); }, get attempts() { return budget.used; }, get hasPublished() { return guard.hasPublished; }, dispose,
      publish: publisher => publish(publisher, signal, false),
      recoverPublished: (publisher, { signal: recoverySignal } = {}) => publish(publisher, recoverySignal, true),
    };
  } catch (error) { trace.finish(signal?.aborted ? 'canceled' : 'failed', error?.code); flight?.dispose(); budget.dispose(); throw error; }
}
