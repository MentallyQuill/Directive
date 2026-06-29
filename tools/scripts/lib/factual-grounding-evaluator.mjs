import path from 'node:path';

import {
  ensureDirectory,
  sha256Text,
  writeJsonFile
} from './sillytavern-live-harness.mjs';

export const FACT_CHECK_ARTIFACT_KIND = 'directive.liveCampaignSoak.factualCheck';
export const FACT_MODEL_REVIEW_REQUEST_KIND = 'directive.liveCampaignSoak.factualModelReviewRequest';
export const FACT_MODEL_REVIEW_RESULT_KIND = 'directive.liveCampaignSoak.factualModelReviewResult';

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
  'active-campaign-package': ['directive-contract', 'directive.contract', 'immediate-scene', 'foreground-quest', 'relevant-facts'],
  'active-mission-frame': ['directive.scene.active', 'directive.continuity.domain', 'immediate-scene', 'foreground-quest', 'relevant-facts', 'active-directives'],
  'agency-boundary': ['directive-contract', 'directive.contract'],
  'campaign-frame': ['directive.contract', 'directive.scene.active', 'immediate-scene', 'foreground-quest', 'relevant-facts'],
  'command-structure': ['directive.scene.active', 'directive.continuity.domain', 'immediate-scene', 'relevant-crew', 'directive-contract'],
  'crew-public-identity': ['directive.continuity.invariants', 'directive.continuity.domain', 'relevant-crew'],
  'current-location-time': ['directive.scene.active', 'directive.continuity.domain', 'reply-header', 'immediate-scene', 'location-context', 'relevant-facts'],
  'formal-objectives': ['directive.scene.active', 'foreground-quest', 'active-directives'],
  'mission-frame': ['directive.scene.active', 'directive.continuity.domain', 'immediate-scene', 'foreground-quest', 'relevant-facts', 'active-directives'],
  'opening-premise': ['directive.continuity.invariants', 'directive.scene.active', 'directive.continuity.domain', 'immediate-scene', 'foreground-quest', 'relevant-facts', 'ship-status'],
  'player-role': ['immediate-scene', 'directive-contract'],
  'present-character': ['directive.scene.active', 'directive.continuity.domain', 'immediate-scene', 'relevant-crew'],
  'service-record': ['directive.continuity.domain', 'relevant-crew'],
  'ship-public-state': ['directive.continuity.invariants', 'directive.continuity.domain', 'ship-status', 'relevant-facts'],
  'ship-readiness': ['directive.continuity.domain', 'ship-status', 'relevant-facts'],
  'starting-directives': ['foreground-quest', 'active-directives'],
  timekeeping: ['reply-header'],
  'world-state': ['directive.scene.active', 'directive.continuity.domain', 'location-context', 'immediate-scene', 'relevant-facts']
});

const AMBIGUOUS_STANDALONE_FOCUS_TERMS = new Set([
  'cross'
]);

const SENIOR_CREW_RANK_FOCUS_PREFIXES = Object.freeze([
  'captain',
  'commander',
  'lieutenant commander',
  'lieutenant',
  'doctor',
  'chief',
  'ensign'
]);

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

function escapeRegex(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roleForTranscriptMessage(message = {}) {
  if (message.isUser === true) return 'user';
  if (message.isSystem === true) return 'system';
  if (message.directiveOwned === true) return 'directive';
  return 'assistant';
}

function sourcePointerForReview(pointer = {}) {
  return {
    path: pointer?.path || null,
    pointer: pointer?.pointer || null,
    note: pointer?.note || null
  };
}

function canaryForModelReview(canary = {}) {
  return {
    id: canary.id,
    category: canary.category,
    severity: canary.severity,
    summary: canary.summary,
    assertions: asArray(canary.assertions).slice(0, 8),
    positiveTerms: asArray(canary.positiveTerms).slice(0, 8),
    expectedPromptKeys: asArray(canary.expectedPromptKeys).slice(0, 8),
    expectedSourceIds: asArray(canary.expectedSourceIds).slice(0, 12),
    contradictionWatchlist: asArray(canary.contradictionWatchlist).slice(0, 10),
    sourcePointers: asArray(canary.sourcePointers).map(sourcePointerForReview).slice(0, 8),
    hiddenStateSafe: canary.hiddenStateSafe === true
  };
}

function transcriptMessagesForModelReview(messages = []) {
  return asArray(messages)
    .filter((message) => roleForTranscriptMessage(message) !== 'system')
    .map((message) => ({
      index: message?.index ?? null,
      role: roleForTranscriptMessage(message),
      name: message?.name || null,
      directiveOwned: message?.directiveOwned === true,
      responseKind: message?.responseKind || null,
      text: compactText(message?.text || '', 1800)
    }))
    .filter((message) => message.text)
    .slice(-80);
}

function deterministicCheckForReview(check = {}) {
  return {
    checkId: check?.checkId || null,
    status: check?.status || null,
    evaluatorMode: check?.evaluatorMode || null,
    generatedMessageId: check?.generatedMessageId || null,
    generatedMessageIndex: check?.generatedMessageIndex ?? null,
    transcriptPointer: check?.transcriptPointer || null,
    packId: check?.packId || null,
    packHash: check?.packHash || null,
    counts: check?.counts || null,
    results: asArray(check?.results).map((result) => ({
      factId: result.factId,
      category: result.category,
      promptAvailabilityStatus: result.promptAvailabilityStatus,
      verdict: result.verdict,
      severity: result.severity,
      rootCauseLabel: result.rootCauseLabel,
      confidence: result.confidence,
      contradictionMatches: asArray(result.contradictionMatches).slice(0, 6),
      assertionMatches: asArray(result.assertionMatches).slice(0, 4),
      positiveMatches: asArray(result.positiveMatches).slice(0, 4)
    })).filter((result) => result.verdict !== 'not-applicable').slice(0, 80)
  };
}

function factualReviewResponseSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'findings', 'overallAssessment'],
    properties: {
      status: { type: 'string', enum: ['pass', 'warning', 'fail'] },
      overallAssessment: { type: 'string' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['factId', 'verdict', 'severity', 'summary', 'evidenceSpans', 'confidence'],
          properties: {
            factId: { type: 'string' },
            verdict: { type: 'string', enum: ['respected', 'omitted', 'unsupported-detail', 'contradicted', 'not-applicable'] },
            severity: { type: 'string', enum: ['P1 factual blocker', 'P1 prompt blocker', 'P2 factual warning', 'P3 quality note'] },
            rootCauseLabel: { type: 'string' },
            summary: { type: 'string' },
            evidenceSpans: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['messageIndex', 'quote'],
                properties: {
                  messageIndex: { type: ['integer', 'null'] },
                  quote: { type: 'string' }
                }
              }
            },
            confidence: { type: 'number' }
          }
        }
      }
    }
  };
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
      key: entry?.key || entry?.promptKey || null,
      promptKey: entry?.promptKey || entry?.key || null,
      title: entry?.title || null,
      label: entry?.label || entry?.category || null,
      ttl: entry?.ttl || null,
      sourceHash: entry?.sourceHash || null,
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
  const categoryAliases = promptCategoryAliases([
    canary.category,
    ...asArray(canary.expectedPromptCategories)
  ]);
  const promptKeyAliases = asArray(canary.expectedPromptKeys);
  const sourceIdAliases = asArray(canary.expectedSourceIds);
  const haystack = [
    block.key,
    block.promptKey,
    block.id,
    block.title,
    block.label,
    block.ttl,
    block.sourceHash,
    ...asArray(block.sourceIds)
  ].filter(Boolean).join(' ');
  const candidates = [
    ...categoryAliases.map((term) => ({ term, metadataKind: 'category' })),
    ...promptKeyAliases.map((term) => ({ term, metadataKind: 'expectedPromptKey' })),
    ...sourceIdAliases.map((term) => ({ term, metadataKind: 'expectedSourceId' }))
  ];
  const seen = new Set();
  return candidates
    .filter(({ term, metadataKind }) => {
      if (!term || !includesNormalized(haystack, term)) return false;
      const key = `${metadataKind}:${normalizeText(term)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ term, metadataKind }) => ({
      term,
      textPreview: `Prompt block metadata matched ${term}.`,
      blockId: block.id,
      blockHash: block.hash,
      evidence: 'metadata',
      metadataKind
    }));
}

export function promptBlocksFromInspection(promptInspection = {}) {
  return asArray(promptInspection?.blocks).map((block, index) => ({
    id: block?.id || block?.blockId || `prompt-block-${index + 1}`,
    key: block?.key || block?.promptKey || null,
    promptKey: block?.promptKey || block?.key || null,
    title: block?.title || null,
    label: block?.label || block?.category || null,
    hash: block?.hash || null,
    contentHash: block?.contentHash || null,
    ttl: block?.ttl || null,
    sourceHash: block?.sourceHash || null,
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
    const expectedMetadataProof = matchedMetadata.some((entry) => (
      entry.metadataKind === 'expectedPromptKey'
      || entry.metadataKind === 'expectedSourceId'
    ));
    status = expectedMetadataProof ? 'available' : 'partial';
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
  const fullName = idParts.join(' ');
  const lastName = idParts.at(-1) || '';
  const factText = [
    canary.summary,
    ...asArray(canary.assertions),
    ...asArray(canary.positiveTerms)
  ].join(' ');
  const exactSpecies = KNOWN_SPECIES.find((species) => (
    asArray(canary.positiveTerms).some((term) => normalizeText(term) === normalizeText(species))
  )) || null;
  const expectedSpecies = exactSpecies || KNOWN_SPECIES.find((species) => includesNormalized(canary.summary, species)) || null;
  const expectedAge = asArray(canary.positiveTerms).find((term) => /fift|fort|thirt|sixt|sevent|eight|ninet|year/i.test(String(term))) || null;
  const expectedUniformColor = ['burgundy-red', 'mustard-yellow', 'teal', 'blue'].find((color) => includesNormalized(factText, color)) || null;
  const rankFocusTerms = SENIOR_CREW_RANK_FOCUS_PREFIXES
    .filter((rank) => includesNormalized(factText, `${rank} ${fullName}`) || includesNormalized(factText, `${rank} ${lastName}`))
    .map((rank) => `${rank} ${lastName}`);
  const standaloneLastName = AMBIGUOUS_STANDALONE_FOCUS_TERMS.has(normalizeText(lastName)) ? null : lastName;
  return {
    idParts,
    focusTerms: [
      fullName,
      ...rankFocusTerms,
      standaloneLastName
    ].filter(Boolean),
    expectedSpecies,
    expectedAge,
    expectedUniformColor
  };
}

function sentenceSegments(text = '') {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])(["'\u2019\u201d)]*)\s+/gu, '$1$2\n')
    .split(/\n+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sentenceLocalCooccurrence(text = '', focusTerms = [], targetPattern) {
  const target = targetPattern instanceof RegExp ? targetPattern.source : String(targetPattern || '');
  if (!target) return false;
  const flags = targetPattern instanceof RegExp && targetPattern.flags.includes('i') ? 'i' : 'i';
  for (const sentence of sentenceSegments(text)) {
    const targetInSentence = new RegExp(target, flags).test(sentence);
    if (!targetInSentence) continue;
    for (const focusTerm of asArray(focusTerms)) {
      const focus = compactText(focusTerm);
      if (!focus) continue;
      const focusPattern = focus.split(/\s+/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
      if (new RegExp(`\\b${focusPattern}\\b`, flags).test(sentence)) return true;
    }
  }
  return false;
}

const UNIFORM_COLOR_PATTERNS = Object.freeze({
  'burgundy-red': /\b(?:burgundy[-\s]?red|command\s+red|red-and-black)\b/i,
  'mustard-yellow': /\b(?:mustard[-\s]?yellow|operations?\s+yellow|ops\s+yellow|engineering\s+yellow|tactical\s+yellow|security\s+yellow|gold|yellow)\b/i,
  teal: /\b(?:science\s+teal|teal)\b/i,
  blue: /\b(?:medical\s+blue|blue)\b/i
});

const UNIFORM_ASSIGNMENT_PATTERN = /\b(?:uniform|division\s+colou?rs?|department\s+colou?rs?|collar|wears?|wearing|wore|dressed|tunic|jacket|undershirt|yoke|sleeves?|shoulder\s+panels?|piping)\b/i;

function hasUniformColorContradiction(text, expectedColor, focusTerms = []) {
  const expected = normalizeText(expectedColor).replace(/\s+/g, '-');
  if (!UNIFORM_COLOR_PATTERNS[expected]) return false;
  const wrongPatterns = Object.entries(UNIFORM_COLOR_PATTERNS)
    .filter(([color]) => color !== expected)
    .map(([, pattern]) => pattern);
  return sentenceSegments(text).some((sentence) => {
    if (asArray(focusTerms).length > 0 && !asArray(focusTerms).some((focusTerm) => includesNormalized(sentence, focusTerm))) return false;
    if (/\bnot\s+(?:command\s+)?red\b/i.test(sentence) || /\bnot\s+red-and-black\b/i.test(sentence)) return false;
    if (!UNIFORM_ASSIGNMENT_PATTERN.test(sentence)) return false;
    return wrongPatterns.some((pattern) => pattern.test(sentence));
  });
}

function focusTermPatternSource(focusTerm) {
  const focus = compactText(focusTerm);
  if (!focus) return null;
  return focus.split(/\s+/).map((part) => escapeRegex(part)).join('\\s+');
}

function seniorSpeciesIdentityContradiction(text = '', focusTerms = [], species = '') {
  const speciesSource = escapeRegex(species);
  if (!speciesSource) return null;
  const descriptorWords = '(?:[a-z0-9][a-z0-9\'-]*\\s+){0,5}';
  const appositiveSeparator = '(?:\\s*,\\s*|\\s*\\(\\s*|\\s*[\\u2013\\u2014-]\\s*)';
  const identityLinker = [
    'is',
    'was',
    'becomes',
    'appears\\s+as',
    'introduced\\s+as',
    'is\\s+introduced\\s+as',
    'was\\s+introduced\\s+as',
    'described\\s+as',
    'is\\s+described\\s+as',
    'was\\s+described\\s+as',
    'identified\\s+as',
    'is\\s+identified\\s+as',
    'was\\s+identified\\s+as',
    'written\\s+as',
    'portrayed\\s+as',
    'framed\\s+as',
    'called'
  ].join('|');
  const article = '(?:an?\\s+)?';
  const identityNouns = '(?:officer|male|female|man|woman|commander|lieutenant|captain|ensign|chief|doctor|physician|pilot|helmsman|security|tactical|operations|engineer|engineering|science|medical)\\s+';
  for (const sentence of sentenceSegments(text)) {
    for (const focusTerm of asArray(focusTerms)) {
      const focusSource = focusTermPatternSource(focusTerm);
      if (!focusSource) continue;
      const focus = `\\b${focusSource}\\b`;
      const patterns = [
        new RegExp(`${focus}${appositiveSeparator}${article}${descriptorWords}\\b${speciesSource}\\b`, 'i'),
        new RegExp(`${focus}\\s+(?:${identityLinker})\\s+${article}${descriptorWords}\\b${speciesSource}\\b`, 'i'),
        new RegExp(`${focus}(?:\\u2019s|'s)\\s+\\b${speciesSource}\\b`, 'i'),
        new RegExp(`\\b${speciesSource}\\b\\s+(?:${identityNouns}){0,2}${focus}`, 'i')
      ];
      if (patterns.some((pattern) => pattern.test(sentence))) {
        return {
          focusTerm,
          sentence: compactText(sentence, 180)
        };
      }
    }
  }
  return null;
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
        const speciesMatch = seniorSpeciesIdentityContradiction(text, senior.focusTerms, species);
        if (
          species !== senior.expectedSpecies
          && speciesMatch
        ) {
          matches.push({
            term: `${speciesMatch.focusTerm} as ${species}`,
            textPreview: `Expected ${senior.expectedSpecies}; generated text identifies ${speciesMatch.focusTerm} as ${species}: ${speciesMatch.sentence}`
          });
        }
      }
    }
    if (
      /fift/i.test(senior.expectedAge || '')
      && sentenceLocalCooccurrence(text, senior.focusTerms, /\b(?:40|forty)[ -]?year[ -]?old\b/i)
    ) {
      matches.push({
        term: 'forty-year-old age contradiction',
        textPreview: `Expected ${senior.expectedAge}; generated text says forty-year-old.`
      });
    }
    if (senior.expectedUniformColor && hasUniformColorContradiction(text, senior.expectedUniformColor, senior.focusTerms)) {
      matches.push({
        term: 'tactical uniform color contradiction',
        textPreview: `Expected ${senior.expectedUniformColor} uniform color; generated text assigns a conflicting division color.`
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
    if (
      /\b(?:out\s+of|left|departed|taken\s+her\s+out\s+of)\s+(?:spacedock|space\s+dock|the\s+yard|drydock|dry\s+dock)\s+(?:only\s+)?(?:3|three)\s+days\s+ago\b/i.test(text)
      || /\b(?:only\s+)?(?:3|three)\s+days\s+(?:out\s+of|underway\s+from|since\s+(?:leaving|departing))\s+(?:spacedock|space\s+dock|the\s+yard|drydock|dry\s+dock)\b/i.test(text)
    ) {
      matches.push({
        term: 'only three days out of spacedock',
        textPreview: 'Generated text collapses the twenty-five-day transit into only three days out of the yard.'
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
  } else if (required) {
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

export function buildModelAssistedFactualReviewRequest({
  pack,
  transcriptMessages = [],
  deterministicChecks = [],
  runId = null,
  transcriptPointer = 'transcript/readable-chat.md',
  requestId = null
} = {}) {
  const finalRequestId = requestId || `fact-model-review-${pack?.packId || 'campaign'}`;
  const canaries = asArray(pack?.canaries).map(canaryForModelReview);
  const transcript = transcriptMessagesForModelReview(transcriptMessages);
  const deterministic = asArray(deterministicChecks).map(deterministicCheckForReview);
  return {
    kind: FACT_MODEL_REVIEW_REQUEST_KIND,
    schemaVersion: 1,
    requestId: finalRequestId,
    runId,
    packageId: pack?.packageId || null,
    packageTitle: pack?.packageTitle || null,
    packId: pack?.packId || null,
    packHash: pack?.hash || null,
    transcriptPointer,
    hiddenStatePolicy: 'Use only these player-safe canary facts, source pointers, deterministic summaries, and visible transcript excerpts. Do not infer from hidden truth, raw prompt bodies, provider reasoning, raw relationship values, raw pressure values, hidden clocks, cookies, CSRF tokens, or API keys.',
    evaluatorInstructions: [
      'Review the visible transcript for factual grounding against the supplied canaries.',
      'Do not penalize omission unless the fact is required for the visible scene or the transcript mentions the entity or premise incorrectly.',
      'Prefer deterministic check results when they identify a concrete contradiction, but add broader unsupported-detail or omission findings when visible transcript evidence supports them.',
      'Return strict JSON matching responseSchema.'
    ],
    responseSchema: factualReviewResponseSchema(),
    canaries,
    transcript,
    deterministicChecks: deterministic,
    inputHash: sha256Text(JSON.stringify({ canaries, transcript, deterministic }))
  };
}

function normalizeModelReviewFinding(finding = {}) {
  return {
    factId: String(finding.factId || '').trim(),
    verdict: String(finding.verdict || 'not-applicable').trim(),
    severity: String(finding.severity || 'P3 quality note').trim(),
    rootCauseLabel: finding.rootCauseLabel ? String(finding.rootCauseLabel).trim() : null,
    summary: compactText(finding.summary || '', 600),
    evidenceSpans: asArray(finding.evidenceSpans).map((span) => ({
      messageIndex: Number.isInteger(span?.messageIndex) ? span.messageIndex : null,
      quote: compactText(span?.quote || '', 240)
    })).filter((span) => span.quote).slice(0, 6),
    confidence: Number.isFinite(Number(finding.confidence)) ? Number(finding.confidence) : null
  };
}

function parseModelReviewOutput(modelOutput = null) {
  if (!modelOutput) return null;
  if (typeof modelOutput === 'object') return modelOutput;
  try {
    return JSON.parse(String(modelOutput));
  } catch {
    return null;
  }
}

function modelReviewCounts(findings = []) {
  const counts = {
    respected: 0,
    omitted: 0,
    unsupportedDetail: 0,
    contradicted: 0,
    notApplicable: 0,
    p1: 0,
    p2: 0,
    p3: 0
  };
  for (const finding of findings) {
    if (finding.verdict === 'unsupported-detail') counts.unsupportedDetail += 1;
    else if (finding.verdict === 'not-applicable') counts.notApplicable += 1;
    else if (Object.hasOwn(counts, finding.verdict)) counts[finding.verdict] += 1;
    if (/^P1\b/i.test(finding.severity || '')) counts.p1 += 1;
    else if (/^P2\b/i.test(finding.severity || '')) counts.p2 += 1;
    else if (/^P3\b/i.test(finding.severity || '')) counts.p3 += 1;
  }
  return counts;
}

export function buildModelAssistedFactualReviewResult({
  request,
  modelOutput = null,
  modelCall = null,
  status = null,
  reason = null
} = {}) {
  const parsed = parseModelReviewOutput(modelOutput);
  const findings = asArray(parsed?.findings).map(normalizeModelReviewFinding).filter((finding) => finding.factId);
  const attemptedReview = Boolean(modelCall) || modelOutput !== null && modelOutput !== undefined;
  const timedOut = Boolean(
    modelCall?.errorCode
    && /timeout|timed/i.test(String(modelCall.errorCode))
  ) || Boolean(
    reason
    && /timeout|timed out/i.test(String(reason))
  );
  const unparseableAttempt = attemptedReview && !parsed;
  const inferredStatus = timedOut || unparseableAttempt
    ? 'fail'
    : parsed?.status
      || (findings.some((finding) => /^P1\b/i.test(finding.severity || '') || finding.verdict === 'contradicted') ? 'fail'
        : findings.length ? 'warning' : 'not-run');
  const finalStatus = status === 'not-run' && (attemptedReview || timedOut)
    ? 'fail'
    : status || inferredStatus;
  return {
    kind: FACT_MODEL_REVIEW_RESULT_KIND,
    schemaVersion: 1,
    requestId: request?.requestId || null,
    status: finalStatus,
    reason: reason || (parsed
      ? null
      : timedOut
        ? 'model-assisted factual reviewer timed out'
        : attemptedReview
          ? 'model-assisted factual reviewer did not return parseable JSON'
          : 'model-assisted reviewer was not invoked in this run'),
    packageId: request?.packageId || null,
    packId: request?.packId || null,
    packHash: request?.packHash || null,
    inputHash: request?.inputHash || null,
    modelCall: modelCall ? {
      roleId: modelCall.roleId || null,
      providerKind: modelCall.providerKind || null,
      providerId: modelCall.providerId || null,
      model: modelCall.model || null,
      status: modelCall.status || null,
      ok: modelCall.ok === true,
      latencyMs: modelCall.latencyMs ?? null,
      errorCode: modelCall.errorCode || modelCall.error?.code || null
    } : null,
    overallAssessment: parsed?.overallAssessment ? compactText(parsed.overallAssessment, 1000) : null,
    counts: modelReviewCounts(findings),
    findings
  };
}

export function modelAssistedFactualReviewArtifactPaths({ artifactPaths }) {
  const directory = path.join(artifactPaths.factChecks, 'model-assisted-review');
  return {
    directory,
    request: path.join(directory, 'request.json'),
    result: path.join(directory, 'result.json')
  };
}

export function writeModelAssistedFactualReviewRequestArtifact({ request, artifactPaths }) {
  const paths = modelAssistedFactualReviewArtifactPaths({ artifactPaths });
  ensureDirectory(paths.directory);
  writeJsonFile(paths.request, request);
  return paths.request;
}

export function writeModelAssistedFactualReviewResultArtifact({ result, artifactPaths }) {
  const paths = modelAssistedFactualReviewArtifactPaths({ artifactPaths });
  ensureDirectory(paths.directory);
  writeJsonFile(paths.result, result);
  return paths.result;
}
