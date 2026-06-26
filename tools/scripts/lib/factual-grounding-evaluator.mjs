import path from 'node:path';

import {
  ensureDirectory,
  sha256Text,
  writeJsonFile
} from './sillytavern-live-harness.mjs';

export const FACT_CHECK_ARTIFACT_KIND = 'directive.liveCampaignSoak.factualCheck';

const KNOWN_SPECIES = Object.freeze([
  'Human',
  'Tellarite',
  'Vulcan',
  'Bajoran',
  'Betazoid',
  'Trill',
  'Andorian',
  'Bolian',
  'Cardassian',
  'Romulan',
  'Klingon'
]);

const PROMPT_CATEGORY_BLOCK_ALIASES = Object.freeze({
  'active-campaign-package': ['directive-contract', 'immediate-scene', 'foreground-quest', 'relevant-facts'],
  'active-mission-frame': ['immediate-scene', 'foreground-quest', 'relevant-facts', 'active-directives'],
  'agency-boundary': ['directive-contract'],
  'campaign-frame': ['immediate-scene', 'foreground-quest', 'relevant-facts'],
  'command-structure': ['immediate-scene', 'relevant-crew', 'directive-contract'],
  'crew-public-identity': ['relevant-crew'],
  'current-location-time': ['reply-header', 'immediate-scene', 'location-context', 'relevant-facts'],
  'formal-objectives': ['foreground-quest', 'active-directives'],
  'mission-frame': ['immediate-scene', 'foreground-quest', 'relevant-facts', 'active-directives'],
  'opening-premise': ['immediate-scene', 'foreground-quest', 'relevant-facts', 'ship-status'],
  'player-role': ['immediate-scene', 'directive-contract'],
  'present-character': ['immediate-scene', 'relevant-crew'],
  'service-record': ['relevant-crew'],
  'ship-public-state': ['ship-status', 'relevant-facts'],
  'ship-readiness': ['ship-status', 'relevant-facts'],
  'starting-directives': ['foreground-quest', 'active-directives'],
  timekeeping: ['reply-header'],
  'world-state': ['location-context', 'immediate-scene', 'relevant-facts']
});

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/(?:\u2019|')/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value = '', maxLength = 260) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function includesNormalized(haystack, needle) {
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedNeedle) return false;
  return normalizeText(haystack).includes(normalizedNeedle);
}

function termMatches(text, terms = []) {
  const matches = [];
  for (const term of asArray(terms)) {
    const clean = String(term || '').trim();
    if (!clean) continue;
    if (includesNormalized(text, clean)) {
      matches.push({ term: clean, textPreview: compactText(clean, 140) });
    }
  }
  return matches;
}

function normalizedPromptBlocks(promptBlocks = []) {
  return asArray(promptBlocks).map((entry, index) => {
    if (typeof entry === 'string') {
      return {
        id: `prompt-block-${index + 1}`,
        title: null,
        label: null,
        sourceIds: [],
        text: entry,
        hash: sha256Text(entry),
        textPreview: compactText(entry)
      };
    }
    const text = String(entry?.text || entry?.content || entry?.value || '');
    return {
      id: entry?.id || entry?.blockId || `prompt-block-${index + 1}`,
      title: entry?.title || null,
      label: entry?.label || entry?.category || null,
      sourceIds: asArray(entry?.sourceIds),
      text,
      hash: entry?.hash || sha256Text(text),
      textPreview: compactText(text)
    };
  });
}

function promptCategoryAliases(categories = []) {
  return [...new Set(asArray(categories).flatMap((category) => {
    const normalized = String(category || '').trim();
    return [
      normalized,
      ...asArray(PROMPT_CATEGORY_BLOCK_ALIASES[normalized])
    ].filter(Boolean);
  }))];
}

function promptMetadataMatchesCanary(block, canary = {}) {
  const aliases = promptCategoryAliases([
    canary.category,
    ...asArray(canary.expectedPromptCategories)
  ]);
  const haystack = [
    block.id,
    block.title,
    block.label,
    ...asArray(block.sourceIds)
  ].filter(Boolean).join(' ');
  const matches = aliases.filter((alias) => includesNormalized(haystack, alias));
  return matches.map((alias) => ({
    term: alias,
    textPreview: `Prompt block metadata matched ${alias}.`,
    blockId: block.id,
    blockHash: block.hash,
    evidence: 'metadata'
  }));
}

export function promptBlocksFromInspection(promptInspection = {}) {
  return asArray(promptInspection?.blocks).map((block, index) => ({
    id: block?.id || block?.blockId || `prompt-block-${index + 1}`,
    title: block?.title || null,
    label: block?.label || block?.category || null,
    hash: block?.hash || null,
    sourceRevision: block?.sourceRevision ?? null,
    sourceIds: asArray(block?.sourceIds),
    text: block?.text || block?.content || ''
  }));
}

function canaryPromptTerms(canary = {}) {
  return [
    ...asArray(canary.positiveTerms),
    ...asArray(canary.assertions)
  ].filter(Boolean);
}

function promptAvailabilityForCanary(canary, promptBlocks) {
  if (!promptBlocks.length) {
    return {
      status: 'not-checked',
      matchedBlockIds: [],
      matchedTerms: []
    };
  }
  const terms = canaryPromptTerms(canary);
  const matchedBlockIds = new Set();
  const matchedTerms = [];
  const matchedMetadata = [];
  for (const block of promptBlocks) {
    const blockMatches = termMatches(block.text, terms);
    if (blockMatches.length > 0) {
      matchedBlockIds.add(block.id);
      matchedTerms.push(...blockMatches.map((entry) => ({
        ...entry,
        blockId: block.id,
        blockHash: block.hash
      })));
    }
    const metadataMatches = promptMetadataMatchesCanary(block, canary);
    if (metadataMatches.length > 0) {
      matchedBlockIds.add(block.id);
      matchedMetadata.push(...metadataMatches);
    }
  }
  const positiveTerms = asArray(canary.positiveTerms).filter(Boolean);
  const positiveMatches = matchedTerms.filter((entry) => positiveTerms.some((term) => normalizeText(term) === normalizeText(entry.term)));
  let status = 'missing';
  if (matchedTerms.length > 0) {
    status = positiveMatches.length >= Math.min(2, Math.max(1, positiveTerms.length)) || matchedTerms.length >= 2
      ? 'available'
      : 'partial';
  } else if (matchedMetadata.length > 0) {
    status = 'partial';
  }
  return {
    status,
    matchedBlockIds: [...matchedBlockIds],
    matchedTerms: matchedTerms.slice(0, 12),
    matchedMetadata: matchedMetadata.slice(0, 12)
  };
}

function seniorCrewIdentityParts(canary = {}) {
  const match = String(canary.id || '').match(/senior-crew\.([^.]+)\.identity/u);
  if (!match) return null;
  const idParts = match[1].split('-').filter(Boolean);
  const exactSpecies = KNOWN_SPECIES.find((species) => (
    asArray(canary.positiveTerms).some((term) => normalizeText(term) === normalizeText(species))
  )) || null;
  const expectedSpecies = exactSpecies || KNOWN_SPECIES.find((species) => includesNormalized(canary.summary, species)) || null;
  const expectedAge = asArray(canary.positiveTerms).find((term) => /fift|fort|thirt|sixt|sevent|eight|ninet|year/i.test(String(term))) || null;
  return {
    idParts,
    focusTerms: [
      idParts.join(' '),
      idParts.at(-1)
    ].filter(Boolean),
    expectedSpecies,
    expectedAge
  };
}

function generatedTextMentionsCanary(text, canary) {
  const senior = seniorCrewIdentityParts(canary);
  if (senior) return senior.focusTerms.some((term) => includesNormalized(text, term));
  return asArray(canary.positiveTerms).some((term) => includesNormalized(text, term))
    || asArray(canary.assertions).some((term) => includesNormalized(text, term));
}

function inferredContradictions(text, canary) {
  const matches = [];
  const senior = seniorCrewIdentityParts(canary);
  if (senior && senior.focusTerms.some((term) => includesNormalized(text, term))) {
    if (senior.expectedSpecies) {
      for (const species of KNOWN_SPECIES) {
        if (species !== senior.expectedSpecies && includesNormalized(text, species)) {
          matches.push({
            term: `${senior.focusTerms.at(-1)} as ${species}`,
            textPreview: `Expected ${senior.expectedSpecies}; generated text mentions ${species}.`
          });
        }
      }
    }
    if (/fift/i.test(senior.expectedAge || '') && /\b(?:40|forty)[ -]?year[ -]?old\b/i.test(text)) {
      matches.push({
        term: 'forty-year-old age contradiction',
        textPreview: `Expected ${senior.expectedAge}; generated text says forty-year-old.`
      });
    }
  }
  if (/opening\.transit-premise$/u.test(String(canary.id || ''))) {
    if (/\bat\s+impulse\s+for\s+(?:6|six)\s+days\b/i.test(text) || /\bimpulse\s+for\s+(?:6|six)\s+days\b/i.test(text)) {
      matches.push({
        term: 'impulse for six days',
        textPreview: 'Generated text says the ship has been at impulse for six days.'
      });
    }
  }
  return matches;
}

function generationVerdictForCanary({ canary, generatedText, promptAvailability, required }) {
  const assertionMatches = termMatches(generatedText, asArray(canary.assertions));
  const positiveMatches = termMatches(generatedText, asArray(canary.positiveTerms));
  const explicitContradictions = termMatches(generatedText, asArray(canary.contradictionWatchlist));
  const contradictionMatches = [
    ...explicitContradictions,
    ...inferredContradictions(generatedText, canary)
  ];
  const canaryMentioned = generatedTextMentionsCanary(generatedText, canary);
  let verdict = 'not-applicable';
  if (contradictionMatches.length > 0) {
    verdict = 'contradicted';
  } else if (assertionMatches.length > 0 || positiveMatches.length >= Math.min(2, Math.max(1, asArray(canary.positiveTerms).length))) {
    verdict = 'respected';
  } else if (required || canaryMentioned) {
    verdict = 'omitted';
  }

  let rootCauseLabel = verdict === 'not-applicable' || verdict === 'respected' ? null : 'unknown';
  if (verdict === 'contradicted' || verdict === 'omitted') {
    rootCauseLabel = promptAvailability.status === 'available' || promptAvailability.status === 'partial'
      ? 'model-ignored-available-fact'
      : promptAvailability.status === 'missing'
        ? 'prompt-missing'
        : 'unknown';
  }
  const severity = verdict === 'contradicted' && /^P1\b/i.test(canary.severity || '')
    ? 'P1 factual blocker'
    : verdict === 'omitted' && required && promptAvailability.status === 'missing'
      ? 'P1 prompt blocker'
      : canary.severity || 'P2 factual warning';
  const confidence = verdict === 'contradicted'
    ? 0.95
    : verdict === 'respected'
      ? 0.85
      : verdict === 'omitted'
        ? 0.7
        : 0.6;
  return {
    factId: canary.id,
    category: canary.category,
    promptAvailabilityStatus: promptAvailability.status,
    verdict,
    severity,
    rootCauseLabel,
    confidence,
    summary: canary.summary,
    matchedPromptBlockIds: promptAvailability.matchedBlockIds,
    matchedPromptTerms: promptAvailability.matchedTerms,
    matchedPromptMetadata: promptAvailability.matchedMetadata,
    assertionMatches,
    positiveMatches,
    contradictionMatches
  };
}

function summarizeResults(results) {
  const counts = {
    respected: 0,
    omitted: 0,
    unsupportedDetail: 0,
    contradicted: 0,
    notApplicable: 0,
    promptAvailable: 0,
    promptPartial: 0,
    promptMissing: 0,
    promptNotChecked: 0
  };
  for (const result of results) {
    if (result.verdict === 'unsupported-detail') counts.unsupportedDetail += 1;
    else if (result.verdict === 'not-applicable') counts.notApplicable += 1;
    else if (Object.hasOwn(counts, result.verdict)) counts[result.verdict] += 1;
    if (result.promptAvailabilityStatus === 'available') counts.promptAvailable += 1;
    if (result.promptAvailabilityStatus === 'partial') counts.promptPartial += 1;
    if (result.promptAvailabilityStatus === 'missing') counts.promptMissing += 1;
    if (result.promptAvailabilityStatus === 'not-checked') counts.promptNotChecked += 1;
  }
  return counts;
}

function statusFromResults(results) {
  if (results.some((entry) => (
    entry.verdict === 'contradicted'
    && /^P1\b/i.test(entry.severity || '')
  ))) return 'fail';
  if (results.some((entry) => (
    entry.verdict === 'omitted'
    && /^P1\b/i.test(entry.severity || '')
  ))) return 'fail';
  if (results.some((entry) => entry.verdict === 'contradicted' || entry.verdict === 'unsupported-detail' || entry.verdict === 'omitted')) {
    return 'warning';
  }
  return 'pass';
}

function safePathSegment(value = 'fact-check') {
  return String(value || 'fact-check')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'fact-check';
}

export function buildFactualGroundingCheck({
  pack,
  generatedText = '',
  generatedMessageId = null,
  generatedMessageIndex = null,
  transcriptPointer = null,
  promptBlocks = [],
  requiredFactIds = [],
  checkId = null,
  evaluatorMode = 'deterministic'
} = {}) {
  const normalizedBlocks = normalizedPromptBlocks(promptBlocks);
  const requiredSet = new Set(requiredFactIds);
  const selectedCanaries = requiredSet.size > 0
    ? asArray(pack?.canaries).filter((canary) => requiredSet.has(canary.id))
    : asArray(pack?.canaries);
  const promptAvailability = {};
  const results = selectedCanaries.map((canary) => {
    const availability = promptAvailabilityForCanary(canary, normalizedBlocks);
    promptAvailability[canary.id] = availability;
    return generationVerdictForCanary({
      canary,
      generatedText,
      promptAvailability: availability,
      required: requiredSet.has(canary.id)
    });
  });
  const counts = summarizeResults(results);
  const status = statusFromResults(results);
  const finalCheckId = checkId || [
    'fact-check',
    generatedMessageId || generatedMessageIndex || Date.now()
  ].filter(Boolean).join('-');
  return {
    kind: FACT_CHECK_ARTIFACT_KIND,
    schemaVersion: 1,
    checkId: finalCheckId,
    status,
    evaluatorMode,
    packageId: pack?.packageId || null,
    packageTitle: pack?.packageTitle || null,
    packId: pack?.packId || null,
    packHash: pack?.hash || null,
    generatedMessageId,
    generatedMessageIndex,
    generatedTextHash: sha256Text(generatedText),
    generatedTextPreview: compactText(generatedText, 400),
    transcriptPointer,
    promptAvailability: {
      checked: normalizedBlocks.length > 0,
      blockCount: normalizedBlocks.length,
      blocks: normalizedBlocks.map(({ text, ...entry }) => entry),
      byFactId: promptAvailability
    },
    requiredFactIds: [...requiredSet],
    counts,
    results
  };
}

export function factualGroundingLiveLogRecord({ check, artifactPath = null } = {}) {
  return {
    kind: 'fact-check',
    status: check?.status || 'not-run',
    checkId: check?.checkId || null,
    packageId: check?.packageId || null,
    packId: check?.packId || null,
    generatedMessageId: check?.generatedMessageId || null,
    generatedMessageIndex: check?.generatedMessageIndex ?? null,
    transcriptPointer: check?.transcriptPointer || null,
    verdictCounts: check?.counts || null,
    artifactPath
  };
}

export function factualGroundingCheckArtifactPath({ artifactPaths, check }) {
  const directory = path.join(
    artifactPaths.factChecks,
    safePathSegment(check?.generatedMessageId || check?.checkId || 'fact-check')
  );
  return path.join(directory, 'fact-check.json');
}

export function writeFactualGroundingCheckArtifact({ check, artifactPaths }) {
  const artifactPath = factualGroundingCheckArtifactPath({ artifactPaths, check });
  ensureDirectory(path.dirname(artifactPath));
  writeJsonFile(artifactPath, check);
  return artifactPath;
}
