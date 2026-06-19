import { cloneJson } from './pressure-ledger.mjs';
import { scorePressureForTemplate } from './pressure-scoring.mjs';

function byId(items = []) {
  return new Map((items || []).filter((item) => item?.id).map((item) => [item.id, item]));
}

function completedChapters(campaignState) {
  return new Set(campaignState?.mainCampaign?.completedChapters || []);
}

function availableChapters(campaignState) {
  return new Set(campaignState?.mainCampaign?.availableChapters || []);
}

function intervalIsEligible(interval, campaignState) {
  const completed = completedChapters(campaignState);
  const available = availableChapters(campaignState);
  const cursor = campaignState?.mainCampaign?.chapterCursor;
  return completed.has(interval.afterChapter)
    || completed.has(interval.id)
    || available.has(interval.id)
    || cursor === interval.id;
}

function intervalWaitingReason(interval) {
  return `Open Orders interval "${interval.title}" opens after ${interval.afterChapter}.`;
}

function intervalForTemplate(intervals, templateId) {
  return intervals.find((interval) => (interval.sideAssignments || []).includes(templateId)) || null;
}

export function selectSideMissionCandidates({
  campaignState,
  packageData,
  maxCandidates = 2
} = {}) {
  const ledger = campaignState?.pressureLedger || {};
  const records = Array.isArray(ledger.records) ? ledger.records : [];
  const intervals = packageData?.sideMissionRules?.openOrders || [];
  const templates = byId(packageData?.missionTemplates?.side || []);
  const candidates = [];
  const waiting = [];
  const suppressed = [];

  for (const pressure of records) {
    if (pressure.status === 'resolved') {
      continue;
    }
    if (pressure.status === 'suppressed') {
      suppressed.push({
        pressureId: pressure.id,
        pressureTitle: pressure.title,
        reason: pressure.cooldown?.suppressedUntilChapterId
          ? `Deferred until after ${pressure.cooldown.suppressedUntilChapterId}.`
          : 'Deferred by player choice; pressure remains recorded.'
      });
      continue;
    }
    if (pressure.status === 'cooling') {
      waiting.push({
        pressureId: pressure.id,
        pressureTitle: pressure.title,
        reason: pressure.cooldown?.eligibleAfterChapterId
          ? `Cooling down until after ${pressure.cooldown.eligibleAfterChapterId}.`
          : 'Cooling down before it can become side work again.'
      });
      continue;
    }

    let matchedAnyTemplate = false;
    for (const template of templates.values()) {
      const score = scorePressureForTemplate(pressure, template);
      if (score === null) {
        continue;
      }
      matchedAnyTemplate = true;
      const interval = intervalForTemplate(intervals, template.id);
      if (!interval) {
        waiting.push({
          pressureId: pressure.id,
          pressureTitle: pressure.title,
          sideAssignmentId: template.id,
          reason: 'Template exists but is not assigned to an Open Orders interval.'
        });
        continue;
      }
      if (!intervalIsEligible(interval, campaignState)) {
        waiting.push({
          pressureId: pressure.id,
          pressureTitle: pressure.title,
          sideAssignmentId: template.id,
          intervalId: interval.id,
          reason: intervalWaitingReason(interval)
        });
        continue;
      }
      candidates.push({
        id: `candidate.${pressure.id}.${template.id}`,
        pressureId: pressure.id,
        pressureTitle: pressure.title,
        sideAssignmentId: template.id,
        sideAssignmentTitle: template.title,
        intervalId: interval.id,
        intervalTitle: interval.title,
        score,
        urgencyBand: pressure.urgencyBand,
        escalationBand: pressure.escalationBand,
        reason: `${template.title} is available because ${pressure.playerSummary}`
      });
    }

    if (!matchedAnyTemplate) {
      waiting.push({
        pressureId: pressure.id,
        pressureTitle: pressure.title,
        reason: 'No authored side assignment currently matches this pressure.'
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score || left.sideAssignmentTitle.localeCompare(right.sideAssignmentTitle));
  return {
    generatedFrom: 'package-authored-open-orders',
    maxCandidates,
    candidates: cloneJson(candidates.slice(0, maxCandidates)),
    waiting: cloneJson(waiting),
    suppressed: cloneJson(suppressed),
    rawValuesHidden: true
  };
}
