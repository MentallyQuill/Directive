import { normalizeAnalysisLimits } from '../generation/analysis-limits.mjs';
import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';
import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';

function invalid(reason = 'evidence_passage_invalid') {
  const error = new TypeError(reason);
  error.code = 'DIRECTIVE_EVIDENCE_PASSAGE_INVALID';
  throw error;
}
function passageId(entry) {
  const { id, ...identity } = entry;
  return `passage.${stableSha256Hex(canonicalJson(identity)).slice(0, 24)}`;
}

export function createEvidencePassageCatalog({ sourcePair = {}, limits = {}, requestId } = {}) {
  if (typeof requestId !== 'string' || !requestId.trim() || requestId.length > 300) invalid('evidence_request_invalid');
  const normalized = normalizeAnalysisLimits(limits);
  const windowSizes = [...new Set([normalized.continuityEvidenceQuoteCharacters, normalized.interpreterEvidenceQuoteCharacters,
    normalized.timeEvidenceQuoteCharacters, normalized.scenePacingQuoteCharacters])];
  const maximum = Math.max(...windowSizes);
  const catalog = new Map();
  let catalogCharacters = 2;
  for (const sourceSlot of ['previousAssistant', 'currentPlayer']) {
    const source = sourcePair[sourceSlot];
    if (!source?.text) continue;
    if (source.text.length > normalized.requestContextCharacters) invalid('evidence_catalog_budget');
    if (typeof source.text !== 'string' || typeof source.messageId !== 'string' || !source.messageId
        || typeof source.textHash !== 'string' || !source.textHash
        || (source.selectedSwipeId !== null && typeof source.selectedSwipeId !== 'string')) invalid('evidence_source_invalid');
    function add(start, end) {
      // Do not split UTF-16 surrogate pairs while preserving exact source offsets.
      if (start > 0 && /[\uDC00-\uDFFF]/u.test(source.text[start])) start++;
      if (end < source.text.length && /[\uD800-\uDBFF]/u.test(source.text[end - 1])) end--;
      const raw = source.text.slice(start, end);
      start += raw.length - raw.trimStart().length;
      const text = raw.trim();
      if (!text || text.length > maximum) return;
      const entry = { requestId, sourceSlot, messageId: source.messageId, selectedSwipeId: source.selectedSwipeId,
        textHash: source.textHash, start, end: start + text.length, text };
      entry.id = passageId(entry);
      if (!catalog.has(entry.id)) {
        catalogCharacters += JSON.stringify(entry).length + 1;
        if (catalogCharacters > normalized.requestContextCharacters) invalid('evidence_catalog_budget');
        catalog.set(entry.id, Object.freeze(entry));
      }
    }
    for (const match of source.text.matchAll(/[^.!?\n]+(?:[.!?]+|\n+|$)/gu)) {
      if (match[0].trim().length <= maximum) add(match.index, match.index + match[0].length);
    }
    // Include cross-sentence context as well as short natural excerpts.
    for (const windowSize of windowSizes) {
      const stride = Math.max(1, Math.floor(windowSize / 2));
      for (let start = 0; start < source.text.length; start += stride) {
        add(start, Math.min(source.text.length, start + windowSize));
        if (start + windowSize >= source.text.length) break;
      }
    }
  }
  return catalog;
}

export function hydrateEvidenceReferences({ value, catalog, sourcePair = {} } = {}) {
  if (!(catalog instanceof Map)) invalid('evidence_catalog_invalid');
  let nodes = 0;
  function visit(item, depth = 0, literal = false) {
    if (++nodes > 10000 || depth > 32) invalid('evidence_output_budget');
    if (item === null || typeof item !== 'object') return item;
    if (Array.isArray(item)) return item.map(child => visit(child, depth + 1, literal));
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) invalid();
    const result = Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child, depth + 1, literal || key === 'value')]));
    if (literal) return result;
    for (const [referenceField, slotField, quoteField, fixedSlot, emptyAllowed] of [
      ['evidencePassageId', 'sourceSlot', 'evidenceQuote'],
      ['durationEvidencePassageId', 'durationSourceSlot', 'durationEvidenceQuote'],
      ['intentPassageId', null, 'intentQuote', 'currentPlayer', true],
      ['missionDeparturePassageId', null, 'missionDepartureQuote', 'currentPlayer', true],
      ['playerPassageId', null, 'playerQuote', 'currentPlayer', false],
      ['assistantPassageId', null, 'assistantQuote', 'previousAssistant', false],
    ]) {
      if (!Object.hasOwn(result, referenceField)) continue;
      if ((slotField && Object.hasOwn(result, slotField)) || Object.hasOwn(result, quoteField)) invalid('evidence_reference_ambiguous');
      if (emptyAllowed && result[referenceField] === null) {
        delete result[referenceField]; result[quoteField] = ''; continue;
      }
      const entry = catalog.get(result[referenceField]);
      const source = entry && sourcePair[entry.sourceSlot];
      if (!entry || result[referenceField] !== passageId(entry) || !source || (fixedSlot && entry.sourceSlot !== fixedSlot)
          || source.messageId !== entry.messageId || source.selectedSwipeId !== entry.selectedSwipeId
          || source.textHash !== entry.textHash || !Number.isSafeInteger(entry.start) || !Number.isSafeInteger(entry.end)
          || entry.start < 0 || entry.end <= entry.start || source.text?.slice(entry.start, entry.end) !== entry.text) invalid();
      delete result[referenceField];
      if (slotField) result[slotField] = entry.sourceSlot;
      result[quoteField] = entry.text;
    }
    return result;
  }
  return visit(value);
}

const REFERENCE_FIELDS = Object.freeze({
  sourceSlot: 'evidencePassageId', evidenceQuote: 'evidencePassageId',
  durationSourceSlot: 'durationEvidencePassageId', durationEvidenceQuote: 'durationEvidencePassageId',
  intentQuote: 'intentPassageId', missionDepartureQuote: 'missionDeparturePassageId',
  playerQuote: 'playerPassageId', assistantQuote: 'assistantPassageId',
});

/** Wire-only conversion. Hydrated results still pass the original semantic schema. */
export function createEvidenceReferenceSchema(schema) {
  function convert(node) {
    if (Array.isArray(node)) return node.map(convert);
    if (!node || typeof node !== 'object') return node;
    const result = {};
    for (const [key, value] of Object.entries(node)) {
      if (['const', 'enum', 'default', 'examples'].includes(key)) {
        result[key] = structuredClone(value);
      } else if (key === 'required' && Array.isArray(value)) {
        result.required = [...new Set(value.map(field => REFERENCE_FIELDS[field] || field))];
      } else if (key === 'properties') {
        result.properties = {};
        for (const [field, definition] of Object.entries(value)) {
          const reference = REFERENCE_FIELDS[field];
          if (!reference) result.properties[field] = convert(definition);
          else if (!field.endsWith('SourceSlot') && field !== 'sourceSlot') {
            const idSchema = { type: 'string', pattern: '^passage\\.[a-f0-9]{24}$' };
            result.properties[reference] = ['intentQuote', 'missionDepartureQuote'].includes(field)
              ? { anyOf: [idSchema, { type: 'null' }] } : idSchema;
          }
        }
      } else result[key] = convert(value);
    }
    return result;
  }
  return convert(schema);
}

export const EVIDENCE_REFERENCE_INSTRUCTIONS = 'EVIDENCE REFERENCES: Return IDs from evidencePassages instead of copying quotations. Use evidencePassageId instead of sourceSlot/evidenceQuote, durationEvidencePassageId instead of durationSourceSlot/durationEvidenceQuote, and intentPassageId, missionDeparturePassageId, playerPassageId, assistantPassageId instead of their Quote fields. Use null only for empty intent or mission-departure evidence. Each ID selects one exact contiguous excerpt and its source. Never combine ID and literal fields. The passage must support the claim; source membership does not prove truth or completion. The runtime restores quotations before the unchanged evidence validators run. The output schema controls wire field names, including when examples describe legacy quote fields.';

export function evidencePassagePromptEntries(catalog) {
  return [...catalog.values()].map(({ id, sourceSlot, text }) => ({ id, sourceSlot, text }));
}
export function canUseEvidencePassages(sourcePair = {}) {
  return ['previousAssistant', 'currentPlayer'].every(slot => {
    const source = sourcePair[slot];
    return !source?.text || (typeof source.messageId === 'string' && Boolean(source.messageId)
      && typeof source.textHash === 'string' && Boolean(source.textHash)
      && (source.selectedSwipeId === null || typeof source.selectedSwipeId === 'string'));
  });
}
