import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';

export const SIDECAR_OUTPUT_SCHEMA_IDS = Object.freeze({
  stateDeltaProposal: 'directive.sidecar.stateDeltaProposal.v1',
  commandLogSummary: 'directive.sidecar.commandLogSummary.v1'
});

const ALLOWED_STATE_DELTA_OPS = Object.freeze(['set', 'append', 'merge', 'remove']);
const HIDDEN_STATE_PATTERNS = Object.freeze([
  /\bdirector[-\s]?only\b/i,
  /\bhidden\s+(?:truth|state|score|fact|note|value)\b/i,
  /\bunrevealed\s+(?:truth|fact|state|score|note)\b/i,
  /\bsecret\s+(?:score|truth|fact|value|note)\b/i
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactText(value = '', maxLength = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function uniqueStrings(values = [], maxItems = 8, maxLength = 240) {
  const seen = new Set();
  const output = [];
  for (const value of asArray(values)) {
    const text = compactText(value, maxLength);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    output.push(text);
    if (output.length >= maxItems) break;
  }
  return output;
}

function errorResult(schemaId, stage, code, message, details = {}) {
  return {
    ok: false,
    schemaId,
    stage,
    error: {
      code,
      message,
      details: cloneJson(details || null)
    },
    diagnostics: {
      schemaId,
      parse: {
        ok: stage !== 'parse'
      },
      schema: {
        ok: false,
        code,
        message
      }
    }
  };
}

function parseStructuredSidecarObject(value, { schemaId }) {
  if (isObject(value)) {
    return {
      ok: true,
      schemaId,
      value: cloneJson(value),
      diagnostics: {
        schemaId,
        parse: {
          ok: true,
          source: 'object'
        }
      }
    };
  }
  const parsed = parseStructuredJsonText(String(value ?? ''));
  if (!parsed.ok) {
    return {
      ok: false,
      schemaId,
      stage: 'parse',
      error: {
        code: 'DIRECTIVE_SIDECAR_JSON_INVALID',
        message: parsed.diagnostic?.message || parsed.error || 'Sidecar output was not valid JSON.',
        details: cloneJson(parsed.diagnostic || null)
      },
      diagnostics: {
        schemaId,
        parse: {
          ok: false,
          diagnostic: cloneJson(parsed.diagnostic || parsed.error)
        },
        schema: {
          ok: false,
          skipped: true
        }
      }
    };
  }
  return {
    ok: true,
    schemaId,
    value: parsed.value,
    diagnostics: {
      schemaId,
      parse: {
        ok: true,
        source: parsed.repaired ? 'repaired-json-text' : 'json-text',
        repaired: parsed.repaired === true
      }
    }
  };
}

function allowedRootForPath(path, allowedRoots = []) {
  const text = compactText(path);
  return allowedRoots.find((root) => text === root || text.startsWith(`${root}.`)) || null;
}

export function parseStateDeltaProposalOutput(value, {
  workerKey,
  allowedRoots = [],
  baseRevision = null
} = {}) {
  const schemaId = SIDECAR_OUTPUT_SCHEMA_IDS.stateDeltaProposal;
  const parsed = parseStructuredSidecarObject(value, { schemaId });
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  if (!Array.isArray(input.operations)) {
    return errorResult(schemaId, 'schema', 'DIRECTIVE_SIDECAR_SCHEMA_OPERATIONS_REQUIRED', 'Sidecar proposal must include an operations array.');
  }
  const operations = [];
  for (const [index, operation] of input.operations.entries()) {
    if (!isObject(operation)) {
      return errorResult(schemaId, 'schema', 'DIRECTIVE_SIDECAR_SCHEMA_OPERATION_INVALID', `Operation ${index} must be an object.`);
    }
    const op = compactText(operation.op);
    if (!ALLOWED_STATE_DELTA_OPS.includes(op)) {
      return errorResult(schemaId, 'schema', 'DIRECTIVE_SIDECAR_SCHEMA_OPERATION_FORBIDDEN', `Operation ${index} uses unsupported op "${op}".`);
    }
    const path = compactText(operation.path);
    if (!path) {
      return errorResult(schemaId, 'schema', 'DIRECTIVE_SIDECAR_SCHEMA_PATH_REQUIRED', `Operation ${index} must include a path.`);
    }
    const root = allowedRootForPath(path, allowedRoots);
    if (!root) {
      return errorResult(schemaId, 'schema', 'DIRECTIVE_SIDECAR_SCHEMA_PATH_FORBIDDEN', `Operation ${index} path "${path}" is outside authorized roots.`, {
        allowedRoots,
        path
      });
    }
    operations.push({
      op,
      path,
      value: cloneJson(operation.value)
    });
  }
  return {
    ok: true,
    schemaId,
    value: {
      id: compactText(input.id) || `sidecar:${workerKey || 'worker'}:${baseRevision ?? 'revision'}:${operations.length ? 'proposal' : 'no-change'}`,
      workerId: compactText(input.workerId || workerKey),
      baseRevision: Number.isFinite(Number(input.baseRevision)) ? Number(input.baseRevision) : baseRevision,
      operations,
      summary: compactText(input.summary || (operations.length ? `${operations.length} operation(s) proposed.` : 'No durable state change proposed.'))
    },
    diagnostics: {
      ...parsed.diagnostics,
      schema: {
        ok: true,
        operationCount: operations.length,
        allowedRoots: cloneJson(allowedRoots)
      }
    }
  };
}

function containsHiddenStateLeak(value) {
  const text = [
    value.title,
    value.summary,
    ...asArray(value.highlights || value.visibleConsequences)
  ].map((item) => compactText(item)).filter(Boolean).join(' ');
  return HIDDEN_STATE_PATTERNS.some((pattern) => pattern.test(text));
}

export function parseCommandLogSummaryOutput(value, {
  outcomeId
} = {}) {
  const schemaId = SIDECAR_OUTPUT_SCHEMA_IDS.commandLogSummary;
  const parsed = parseStructuredSidecarObject(value, { schemaId });
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  const sourceOutcomeId = compactText(input.sourceOutcomeId);
  if (!sourceOutcomeId) {
    return errorResult(schemaId, 'schema', 'DIRECTIVE_COMMAND_LOG_SUMMARY_SOURCE_REQUIRED', 'Command Log summary must include sourceOutcomeId.');
  }
  if (outcomeId && sourceOutcomeId !== outcomeId) {
    return errorResult(schemaId, 'schema', 'DIRECTIVE_COMMAND_LOG_SUMMARY_SOURCE_MISMATCH', `Generated summary source "${sourceOutcomeId}" does not match outcome "${outcomeId}".`);
  }
  const summary = compactText(input.summary || input.text || input.playerVisibleSummary);
  if (!summary) {
    return errorResult(schemaId, 'schema', 'DIRECTIVE_COMMAND_LOG_SUMMARY_EMPTY', 'Command Log summary sidecar returned no summary text.');
  }
  const normalized = {
    sourceOutcomeId,
    title: compactText(input.title || 'Command Log Summary', 80),
    summary,
    highlights: uniqueStrings(input.highlights || input.visibleConsequences, 4, 180)
  };
  if (containsHiddenStateLeak(normalized)) {
    return errorResult(schemaId, 'schema', 'DIRECTIVE_COMMAND_LOG_SUMMARY_HIDDEN_STATE', 'Command Log summary contains hidden-state language.');
  }
  return {
    ok: true,
    schemaId,
    value: normalized,
    diagnostics: {
      ...parsed.diagnostics,
      schema: {
        ok: true,
        sourceOutcomeId,
        highlightCount: normalized.highlights.length
      }
    }
  };
}

export const __sidecarOutputContractsTestHooks = Object.freeze({
  parseStructuredSidecarObject,
  allowedRootForPath,
  containsHiddenStateLeak
});
