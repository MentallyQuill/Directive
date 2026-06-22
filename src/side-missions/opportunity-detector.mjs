import { cloneJson } from '../pressures/pressure-ledger.mjs';
import { extractOpportunitySignals, hiddenTruthTerm } from './opportunity-signals.mjs';

export const POST_CHAPTER_1_OPPORTUNITY_INTERVAL = Object.freeze({
  id: 'mvp-post-chapter-1-reactive-side-work',
  title: 'Post-Chapter-1 Reactive Side Work',
  afterChapterId: 'chapter-1-the-empty-convoy',
  beforeOpenOrdersId: 'open-orders-1-work-worth-doing',
  scope: 'mvp-post-chapter-1'
});

const DEFAULT_THRESHOLD = 7;

const urgencyScore = Object.freeze({
  low: 0.5,
  medium: 1,
  high: 1.5,
  urgent: 2
});

const escalationScore = Object.freeze({
  latent: 0,
  signal: 0.5,
  escalation: 1.25,
  crisis: 1.75,
  consequence: 2
});

const OPPORTUNITY_TEMPLATES = Object.freeze([
  {
    id: 'chapter1-missing-hardware-audit',
    title: 'Missing Hardware Audit',
    consequence: 'recovered-hardware-custody',
    scope: 'medium',
    summary: 'Recovered emergency hardware and convoy evidence need inventory, custody, and command-system review.',
    reviewQuestion: 'Who owns the follow-up audit while Starfleet and Compact records remain aligned?',
    flagWeights: {
      'chapter-1.evidence-custody': {
        'preserved-initially': 2,
        volatile: 2.5
      },
      'chapter-1.convoy-evidence': {
        'clean-chain-started': 1.5,
        volatile: 2
      },
      'chapter-1.faraday-evidence-access': {
        'preserved-log-access': 1.5,
        'remote-only-fragments': 1
      },
      'chapter-1.cargo-recovery-route': {
        'joint-seal-preserved': 2,
        'hardware-recovered-under-seal': 2.5,
        'resolved-under-joint-record': 2
      },
      'chapter-1.recovered-hardware-status': {
        'recovered-under-joint-seal': 3,
        contested: 2,
        compromised: 1
      },
      'chapter-1.incident-record-status': {
        'joint-record-created': 1.5,
        'fragmented-record': 1
      }
    },
    factWeights: {
      'chapter-1.emergency-transponder-hardware-manifest': 1.5,
      'chapter-1.emergency-hardware-recovered-under-seal': 2,
      'chapter-1.joint-incident-record-created': 1
    },
    pressureMatches: [
      { id: 'pressure.obligation.convoy-evidence-custody', score: 3 },
      { id: 'pressure.forged-authority-uncertainty', score: 1.25 },
      { tags: ['evidence', 'custody'], score: 2 },
      { tags: ['chapter-1', 'evidence'], score: 1.5 }
    ],
    logPatterns: [
      { pattern: /joint incident record/i, score: 1 },
      { pattern: /evidence (chain|custody|seal)|custody chain/i, score: 1.5 },
      { pattern: /recovered (emergency )?hardware|hardware under.*seal/i, score: 1.5 }
    ]
  },
  {
    id: 'chapter1-quarantine-review',
    title: 'Quarantine Review',
    consequence: 'quarantine-procedure-follow-up',
    scope: 'small',
    summary: 'A quarantine exception or contested medical procedure needs a bounded after-action review.',
    reviewQuestion: 'How does the ship document the risk without punishing a justified rescue choice?',
    flagWeights: {
      'chapter-1.quarantine-posture': {
        active: 1,
        bypassed: 3,
        'medical-review-required': 3
      },
      'chapter-1.quarantine-confidence': {
        'exception-logged': 3,
        unresolved: 2,
        contested: 2,
        'procedure-active': 1
      },
      'chapter-1.rescue-urgency': {
        'accelerated-with-risk': 2,
        'delayed-by-verification': 1
      },
      'chapter-1.parnell-rescue': {
        'risk-accepted': 2,
        delayed: 1.25,
        stabilized: 0.5
      }
    },
    pressureMatches: [
      { id: 'pressure.obligation.quarantine-exception-review', score: 4 },
      { tags: ['quarantine', 'accepted-risk'], score: 3 },
      { tags: ['medical', 'quarantine'], score: 2 }
    ],
    logPatterns: [
      { pattern: /quarantine exception|medical review|accepted quarantine risk/i, score: 2 },
      { pattern: /after-action review|procedure review/i, score: 1 }
    ]
  },
  {
    id: 'chapter1-pell-terms-follow-up',
    title: 'Pell Terms Follow-Up',
    consequence: 'pell-legal-terms',
    scope: 'medium',
    summary: 'Pell contact terms and the joint record leave diplomatic and legal follow-up work.',
    reviewQuestion: 'How does the Breckenridge keep the cooperation lawful after the immediate crisis?',
    flagWeights: {
      'chapter-1.pell-contact': {
        'joint-inspection-open': 1,
        'joint-inspection-active': 1.5,
        'witness-cooperation-secured': 2
      },
      'chapter-1.pell-status': {
        'witness-recruited': 2,
        'released-under-record': 1.5
      },
      'chapter-1.compact-investigation-access': {
        'joint-access': 2,
        'restricted-access': 1
      },
      'chapter-1.incident-record-status': {
        'joint-record-created': 1.5
      }
    },
    factWeights: {
      'chapter-1.pell-custody-claim': 1,
      'chapter-1.pell-separate-warning': 1,
      'chapter-1.joint-incident-record-created': 1.5
    },
    pressureMatches: [
      { id: 'pressure.regional.convoy-first-impression', score: 1.5 },
      { tags: ['regional-trust', 'chapter-1'], score: 1.5 },
      { tags: ['compact', 'custody'], score: 1.5 }
    ],
    logPatterns: [
      { pattern: /Pell|Compact.*terms|joint.*record/i, score: 1.5 }
    ]
  }
]);

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function flagById(signals) {
  return new Map(signals.outcomeFlags.map((flag) => [flag.id, flag]));
}

function factById(signals) {
  return new Map(signals.knownFacts.map((fact) => [fact.id, fact]));
}

function completedChapters(signals) {
  return new Set(signals.completedChapters || []);
}

function activeText(entry) {
  return [
    entry.title,
    entry.summary,
    ...asArray(entry.summaryInputs),
    ...asArray(entry.visibleConsequences),
    ...asArray(entry.highlights)
  ].filter(Boolean).join(' ');
}

function pressureMatches(match, pressure) {
  if (match.id && match.id !== pressure.id) {
    return false;
  }
  if (Array.isArray(match.tags) && match.tags.length > 0) {
    const pressureTags = new Set(pressure.tags || []);
    if (!match.tags.every((tag) => pressureTags.has(tag))) {
      return false;
    }
  }
  return true;
}

function pressureScore(match, pressure) {
  const urgency = urgencyScore[pressure.urgencyBand] ?? urgencyScore.medium;
  const escalation = escalationScore[pressure.escalationBand] ?? escalationScore.signal;
  const ignored = Math.min(Number(pressure.cooldown?.ignoredBeatCount || 0), 2);
  return match.score + urgency + escalation + ignored;
}

function normalizeCandidate(candidate) {
  return {
    ...candidate,
    score: Number(candidate.score.toFixed(2)),
    sourceEventIds: unique(candidate.sourceEventIds),
    sourcePressureIds: unique(candidate.sourcePressureIds),
    sourceFlagIds: unique(candidate.sourceFlagIds),
    sourceFactIds: unique(candidate.sourceFactIds),
    sourceCommandLogIds: unique(candidate.sourceCommandLogIds),
    signalSummary: candidate.signalSummary.slice(0, 8)
  };
}

function playerSafeCandidate(candidate) {
  const { hiddenTerms, ...safeCandidate } = candidate;
  return safeCandidate;
}

function mainTemplateById(packageData, id) {
  return (packageData?.missionTemplates?.main || []).find((template) => template?.id === id) || null;
}

function openOrdersIntervalById(packageData, id) {
  return (packageData?.sideMissionRules?.openOrders || []).find((interval) => interval?.id === id) || null;
}

function packageScopeGuard({ campaignState, packageData, signals }) {
  const completed = completedChapters(signals);
  const interval = POST_CHAPTER_1_OPPORTUNITY_INTERVAL;
  const reasons = [];
  const packageId = packageData?.manifest?.id || packageData?.id || null;
  const chapterTemplate = mainTemplateById(packageData, interval.afterChapterId);
  const openOrders = openOrdersIntervalById(packageData, interval.beforeOpenOrdersId);
  const generationPolicy = packageData?.sideMissionRules?.generationPolicy || {};
  const chapter1Completed = completed.has(interval.afterChapterId)
    || signals.mission.completedMissionId === interval.afterChapterId
    || signals.mission.endState === 'chapter-1-transition-to-false-colors';
  const openOrdersAlreadyActive = completed.has(interval.beforeOpenOrdersId)
    || signals.availableChapters.includes(interval.beforeOpenOrdersId)
    || signals.chapterCursor === interval.beforeOpenOrdersId;

  if (packageData?.manifest?.kind !== 'directive.campaignPackage') {
    reasons.push('package is not a Directive campaign package');
  }
  if (!chapterTemplate || chapterTemplate.status !== 'playable' || chapterTemplate.mvpStatus !== 'mvp-complete') {
    reasons.push('Chapter 1 package template is not marked MVP-complete');
  }
  if (chapterTemplate?.mvpCheckpoint?.rawValuesHidden !== true) {
    reasons.push('Chapter 1 package checkpoint is not marked player-safe');
  }
  if (!openOrders || openOrders.afterChapter !== 'chapter-2-false-colors') {
    reasons.push('Open Orders I package interval is missing or no longer scoped after Chapter 2');
  }
  if (generationPolicy.stateInheritanceRequired !== true || generationPolicy.outcomePersistenceRequired !== true) {
    reasons.push('package side-mission generation policy does not require inherited committed state');
  }
  if (!chapter1Completed) {
    reasons.push(`Chapter 1 is not complete; ${interval.id} opens after ${interval.afterChapterId}`);
  }
  if (openOrdersAlreadyActive) {
    reasons.push('authored Open Orders I is already active; use the package-authored Open Orders selector');
  }

  return {
    eligible: reasons.length === 0,
    packageId,
    interval: cloneJson(interval),
    reasons
  };
}

function collectDuplicateKeys(campaignState, signals) {
  const completed = completedChapters(signals);
  const keys = new Set();
  const entries = [
    ...asArray(campaignState?.sideMissions?.opportunityReviews),
    ...asArray(campaignState?.sideMissions?.opportunityCandidates),
    ...asArray(campaignState?.sideMissions?.availableAssignments),
    ...asArray(campaignState?.sideMissions?.completedAssignments),
    ...asArray(campaignState?.sideMissions?.opportunityCooldowns),
    ...asArray(campaignState?.pressureLedger?.candidateReviews)
  ];

  for (const entry of entries) {
    const key = entry?.cooldownKey || entry?.opportunityKey || entry?.opportunityId || entry?.sourceOpportunityId || null;
    if (!key) {
      continue;
    }
    if (entry?.suppressedUntilChapterId && completed.has(entry.suppressedUntilChapterId)) {
      continue;
    }
    keys.add(key);
  }
  return keys;
}

function addSignal(candidate, signal) {
  candidate.score += signal.score;
  candidate.signalSummary.push({
    kind: signal.kind,
    id: signal.id,
    score: Number(signal.score.toFixed(2))
  });
  if (signal.sourceEventId) {
    candidate.sourceEventIds.push(signal.sourceEventId);
  }
  if (signal.kind === 'pressure') {
    candidate.sourcePressureIds.push(signal.id);
  } else if (signal.kind === 'outcomeFlag') {
    candidate.sourceFlagIds.push(signal.id);
  } else if (signal.kind === 'knownFact') {
    candidate.sourceFactIds.push(signal.id);
  } else if (signal.kind === 'commandLog') {
    candidate.sourceCommandLogIds.push(signal.id);
  }
  const hiddenTerm = hiddenTruthTerm(signal.hiddenProbe || signal);
  if (hiddenTerm) {
    candidate.hiddenTerms.push(hiddenTerm);
  }
}

function evaluateTemplate({ template, signals, scoreThreshold }) {
  const flags = flagById(signals);
  const facts = factById(signals);
  const candidate = {
    id: `candidate.${POST_CHAPTER_1_OPPORTUNITY_INTERVAL.id}.${template.id}`,
    opportunityId: template.id,
    cooldownKey: `${POST_CHAPTER_1_OPPORTUNITY_INTERVAL.id}:${template.id}`,
    title: template.title,
    consequence: template.consequence,
    scope: template.scope,
    intervalId: POST_CHAPTER_1_OPPORTUNITY_INTERVAL.id,
    intervalScope: POST_CHAPTER_1_OPPORTUNITY_INTERVAL.scope,
    score: signals.mission.endState === 'chapter-1-transition-to-false-colors' ? 1 : 0,
    threshold: scoreThreshold,
    playerSummary: template.summary,
    reviewQuestion: template.reviewQuestion,
    reason: `${template.title} is available because committed Chapter 1 state left ${template.consequence.replace(/-/g, ' ')} follow-up work.`,
    sourceEventIds: [],
    sourcePressureIds: [],
    sourceFlagIds: [],
    sourceFactIds: [],
    sourceCommandLogIds: [],
    signalSummary: [],
    hiddenTerms: [],
    rawValuesHidden: true
  };

  for (const [flagId, valueWeights] of Object.entries(template.flagWeights || {})) {
    const flag = flags.get(flagId);
    const score = valueWeights?.[flag?.value] || 0;
    if (score > 0) {
      addSignal(candidate, {
        kind: 'outcomeFlag',
        id: flagId,
        score,
        sourceEventId: flag.sourceEventId,
        hiddenProbe: `${flagId}:${flag.value}`
      });
    }
  }

  for (const [factId, score] of Object.entries(template.factWeights || {})) {
    const fact = facts.get(factId);
    if (fact && score > 0) {
      addSignal(candidate, {
        kind: 'knownFact',
        id: factId,
        score,
        sourceEventId: fact.sourceEventId,
        hiddenProbe: fact.summary || factId
      });
    }
  }

  for (const pressure of signals.pressureRecords) {
    if (!['active', 'cooling'].includes(pressure.status)) {
      continue;
    }
    const match = (template.pressureMatches || []).find((item) => pressureMatches(item, pressure));
    if (!match) {
      continue;
    }
    addSignal(candidate, {
      kind: 'pressure',
      id: pressure.id,
      score: pressureScore(match, pressure),
      sourceEventId: pressure.sourceOutcomeId || pressure.lastUpdatedByOutcomeId,
      hiddenProbe: [pressure.title, pressure.playerSummary, pressure.tags].join(' ')
    });
  }

  for (const entry of signals.commandLogEntries) {
    const text = activeText(entry);
    const pattern = (template.logPatterns || []).find((item) => item.pattern.test(text));
    if (!pattern) {
      continue;
    }
    addSignal(candidate, {
      kind: 'commandLog',
      id: entry.id || entry.sourceOutcomeId,
      score: pattern.score,
      sourceEventId: entry.sourceOutcomeId || entry.id,
      hiddenProbe: text
    });
  }

  return normalizeCandidate(candidate);
}

export function detectPostChapter1SideMissionOpportunities({
  campaignState,
  packageData,
  maxCandidates = 2,
  scoreThreshold = DEFAULT_THRESHOLD
} = {}) {
  const signals = extractOpportunitySignals(campaignState || {});
  const packageGuard = packageScopeGuard({ campaignState, packageData, signals });
  const duplicateKeys = collectDuplicateKeys(campaignState || {}, signals);
  const waiting = [];
  const suppressed = [];
  const rejected = [];
  const candidates = [];

  if (!packageGuard.eligible) {
    return {
      kind: 'directive.sideMissionOpportunityReview',
      generatedFrom: 'deterministic-post-chapter-1',
      modelCallsUsed: false,
      packageGuard,
      maxCandidates,
      threshold: scoreThreshold,
      candidates: [],
      waiting,
      suppressed,
      rejected,
      rawValuesHidden: true
    };
  }

  for (const template of OPPORTUNITY_TEMPLATES) {
    const candidate = evaluateTemplate({ template, signals, scoreThreshold });
    if (candidate.hiddenTerms.length > 0) {
      rejected.push({
        opportunityId: candidate.opportunityId,
        title: candidate.title,
        reason: 'Candidate source included Director-only or hidden-truth language.',
        hiddenSourceBlocked: true,
        rawValuesHidden: true
      });
      continue;
    }
    if (duplicateKeys.has(candidate.cooldownKey) || duplicateKeys.has(candidate.opportunityId)) {
      suppressed.push({
        opportunityId: candidate.opportunityId,
        title: candidate.title,
        cooldownKey: candidate.cooldownKey,
        reason: 'Duplicate opportunity already reviewed, selected, active, completed, or cooling down.'
      });
      continue;
    }
    if (candidate.score < scoreThreshold) {
      waiting.push({
        opportunityId: candidate.opportunityId,
        title: candidate.title,
        score: candidate.score,
        threshold: scoreThreshold,
        reason: 'Deterministic score is below the presentation threshold.'
      });
      continue;
    }
    candidates.push(playerSafeCandidate(candidate));
  }

  candidates.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title));

  return {
    kind: 'directive.sideMissionOpportunityReview',
    generatedFrom: 'deterministic-post-chapter-1',
    modelCallsUsed: false,
    packageGuard,
    maxCandidates,
    threshold: scoreThreshold,
    candidates: cloneJson(candidates.slice(0, maxCandidates)),
    waiting: cloneJson(waiting),
    suppressed: cloneJson(suppressed),
    rejected: cloneJson(rejected),
    rawValuesHidden: true
  };
}
