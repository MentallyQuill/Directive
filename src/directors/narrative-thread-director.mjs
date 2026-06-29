import { extractSceneDeltaWithModel } from '../threads/scene-delta-extractor.mjs';
import { eligibleThreadsForPromotion, processCommittedConversation } from '../threads/thread-engine.mjs';
import { architectQuestFromThread, registerArchitectedQuest } from '../quests/quest-architect.mjs';
import { processWorldBoundary } from './director-coordinator.mjs';
import { commitCommandBearingReviewRecords } from '../campaign/transaction-state.mjs';
import { runCommandBearingClosureReviews } from '../command/command-bearing-review.mjs';

function cloneJson(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function asArray(value) { return Array.isArray(value) ? value : []; }
function nowValue(now) { return typeof now === 'function' ? now() : (now || new Date().toISOString()); }
function sourceStaleError(result = {}, phase = 'source-check') {
  const error = new Error(result.reason || `Narrative thread source became stale during ${phase}.`);
  error.code = 'DIRECTIVE_NARRATIVE_THREAD_SOURCE_STALE';
  error.phase = phase;
  error.details = cloneJson(result);
  return error;
}
function uniqueReviewQueue(...queues) {
  const byClosureId = new Map();
  for (const item of queues.flatMap((queue) => asArray(queue))) {
    const closureId = item?.closureId;
    if (!closureId || byClosureId.has(closureId)) continue;
    byClosureId.set(closureId, cloneJson(item));
  }
  return [...byClosureId.values()];
}

/**
 * Owns the post-commit conversation lifecycle. Models may extract observations
 * and propose a quest architecture; deterministic code merges evidence,
 * validates the proposal, registers it, and emits the world event.
 */
export function createNarrativeThreadDirector({
  getCampaignState,
  getPackageData,
  stateDeltaGateway,
  generationRouter = null,
  now = null
} = {}) {
  if (typeof getCampaignState !== 'function') throw new Error('getCampaignState is required');
  if (typeof getPackageData !== 'function') throw new Error('getPackageData is required');
  if (!stateDeltaGateway?.commit) throw new Error('stateDeltaGateway.commit is required');

  async function commitState(next, domains, reason, metadata = {}, assertSourceCurrent = null) {
    if (typeof assertSourceCurrent === 'function') await assertSourceCurrent(`before-commit:${reason}`);
    return stateDeltaGateway.commit(next, {
      source: 'narrativeThreadDirector', reason, summary: reason, domains,
      sourceAnchorRange: metadata.sourceAnchorRange || null,
      outcomeId: metadata.outcomeId || null,
      reconciliationRunId: metadata.reconciliationRunId || null,
      metadata
    });
  }

  async function processConversation(conversation = {}, options = {}) {
    async function assertSourceCurrent(phase = 'source-check') {
      if (typeof options.isSourceCurrent !== 'function') return;
      const result = await options.isSourceCurrent({ phase, conversation: cloneJson(conversation) });
      if (result === false || result?.ok === false) throw sourceStaleError(result || { ok: false }, phase);
    }

    const packageData = getPackageData();
    let state = getCampaignState();
    await assertSourceCurrent('before-extraction');
    const extracted = await extractSceneDeltaWithModel({
      generationRouter,
      scene: { ...cloneJson(conversation), committed: true },
      knownActorIds: [
        ...asArray(packageData?.world?.actors).map((item) => item.id),
        ...asArray(packageData?.crew?.senior || packageData?.crew?.members || packageData?.crew).map((item) => item.id),
        state?.player?.id
      ].filter(Boolean),
      currentThreads: asArray(state?.threadLedger?.records)
        .filter((thread) => ['watchlisted', 'available', 'engaged', 'active', 'dormant'].includes(thread?.status))
        .slice(0, 24)
    });
    await assertSourceCurrent('after-extraction');
    const processed = processCommittedConversation({
      state,
      packageData,
      conversation: extracted.sceneDelta,
      now,
      allowPrivacyReview: false
    });
    state = await commitState(processed.state, ['threadLedger'], 'Committed conversation updated narrative threads.', {
      sourceAnchorRange: extracted.sceneDelta?.anchorRange || conversation.anchorRange || null,
      outcomeId: conversation.outcomePacket?.id || conversation.outcomeId || null,
      reconciliationRunId: conversation.reconciliationRunId || null,
      sceneDeltaSourceId: extracted.sceneDelta?.source?.id || null
    }, assertSourceCurrent);

    await assertSourceCurrent('before-command-bearing-review');
    const commandBearingReview = await runCommandBearingClosureReviews({
      generationRouter,
      campaignState: state,
      reviewQueue: uniqueReviewQueue(
        conversation.commandBearingReviewPlan?.reviewQueue,
        processed.commandBearingReviewPlan?.reviewQueue
      ),
      maxReviews: 3
    });
    if (commandBearingReview.records.length > 0) {
      const reviewedState = commitCommandBearingReviewRecords(state, commandBearingReview.records);
      state = await commitState(reviewedState, ['commandBearing'], 'Command Bearing closure review updated character progression.', {
        sourceAnchorRange: extracted.sceneDelta?.anchorRange || conversation.anchorRange || null,
        outcomeId: conversation.outcomePacket?.id || conversation.outcomeId || null,
        reconciliationRunId: conversation.reconciliationRunId || null,
        reviewClosureIds: commandBearingReview.records.map((record) => record.closureId)
      }, assertSourceCurrent);
    }

    const eligible = eligibleThreadsForPromotion(state.threadLedger, packageData)
      .filter((thread) => !thread.metadata?.stale)
      .sort((a, b) => b.playerInterest - a.playerInterest || b.reinforcementCount - a.reinforcementCount || b.salience - a.salience);
    let promotion = null;
    if (eligible.length) {
      const thread = eligible[0];
      await assertSourceCurrent('before-quest-architecture');
      const architecture = await architectQuestFromThread({ thread, state, packageData, generationRouter, now });
      await assertSourceCurrent('after-quest-architecture');
      if (architecture.ok) {
        const registered = registerArchitectedQuest({ state, threadId: thread.id, architecture, now });
        state = await commitState(registered.state, ['dynamicQuestCatalog', 'questLedger', 'threadLedger'], 'Grounded narrative thread promoted to an optional quest.', {
          sourceAnchorRange: architecture.template?.provenance?.anchorRange || extracted.sceneDelta?.anchorRange || null,
          outcomeId: conversation.outcomePacket?.id || conversation.outcomeId || null,
          reconciliationRunId: conversation.reconciliationRunId || null,
          threadId: thread.id,
          questId: registered.instance.id
        }, assertSourceCurrent);
        const boundary = processWorldBoundary({
          state,
          packageData,
          event: {
            id: `event.quest-generated.${registered.instance.id}.${String(nowValue(now)).replace(/[^a-zA-Z0-9]+/g, '-')}`,
            type: 'quest.generated',
            sourceQuestId: registered.instance.id,
            sourceOutcomeId: conversation.outcomePacket?.id || conversation.outcomeId || null,
            sourceAnchorRange: architecture.template?.provenance?.anchorRange || extracted.sceneDelta?.anchorRange || null,
            actorIds: architecture.template?.anchors?.actorIds || [],
            locationIds: architecture.template?.anchors?.locationIds || [],
            payload: { questId: registered.instance.id, sourceThreadId: thread.id },
            playerFacingSummary: `${registered.template.title} became an available optional assignment.`
          },
          boundaryType: 'scene',
          now,
          processDelegation: false
        });
        state = await commitState(boundary.state, ['worldState', 'storyArcLedger', 'questLedger', 'eventLedger', 'attentionState', 'mission', 'runtimeTracking'], 'Open-world systems registered a generated quest.', {
          sourceAnchorRange: architecture.template?.provenance?.anchorRange || extracted.sceneDelta?.anchorRange || null,
          questId: registered.instance.id,
          threadId: thread.id
        }, assertSourceCurrent);
        promotion = {
          threadId: thread.id,
          questId: registered.instance.id,
          template: cloneJson(registered.template),
          architectureDiagnostics: cloneJson(architecture.diagnostics || [])
        };
      }
    }

    return {
      ok: true,
      campaignState: cloneJson(state),
      sceneDelta: cloneJson(extracted.sceneDelta),
      extractionFallback: extracted.fallback === true,
      createdThreadIds: processed.createdThreadIds,
      mergedThreads: processed.mergedThreads,
      surfacedThreadIds: processed.surfacedThreadIds,
      decayChanges: processed.decayChanges,
      commandBearingReview,
      promotion,
      eligibleThreadIds: eligible.map((item) => item.id)
    };
  }

  return { processConversation };
}
