import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import {
  validateCommandBearingEvidenceProposal,
  validateCommandBearingRelationshipPerceptionProposal,
  validateCommandBearingReviewProposal,
  validateCommandBearingSpendCommit
} from '../command/command-bearing.mjs';

export const SIDECAR_OUTPUT_SCHEMA_IDS = Object.freeze({
  stateDeltaProposal: 'directive.sidecar.stateDeltaProposal.v1',
  commandLogSummary: 'directive.sidecar.commandLogSummary.v1',
  commandBearingEvidenceProposal: 'directive.commandBearing.evidenceProposal.v1',
  commandBearingRelationshipPerceptionProposal: 'directive.commandBearing.relationshipPerceptionProposal.v1',
  commandBearingReviewProposal: 'directive.commandBearing.reviewProposal.v1',
  commandBearingSpendCommit: 'directive.commandBearing.spendCommit.v1'
});

const ALLOWED_STATE_DELTA_OPS = Object.freeze(['set', 'append', 'merge', 'remove', 'upsert']);
const KNOWN_ARRAY_STATE_DELTA_PATHS = Object.freeze(new Set([
  'mission.knownFacts',
  'continuity.notes',
  'relationships.seniorCrew',
  'relationships.descriptiveLog',
  'relationships.perceptionLedger',
  'relationships.memoryLedger',
  'crew.casualties',
  'crew.reassignments',
  'crew.assignments',
  'crew.pressures',
  'crew.relationshipModel.dimensions',
  'ship.damage',
  'ship.technicalDebt',
  'ship.restrictions',
  'pressureLedger.records',
  'commandLog.entries',
  'commandBearing.evidenceLedger.records'
]));
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

function isArrayIndexObject(value) {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => /^(0|[1-9]\d*)$/.test(key));
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

function isKnownArrayPath(path) {
  return KNOWN_ARRAY_STATE_DELTA_PATHS.has(compactText(path));
}

export function parseStateDeltaProposalOutput(value, {
  workerKey,
  allowedRoots = [],
  baseRevision = null,
  forbiddenPathPolicy = 'reject'
} = {}) {
  const schemaId = SIDECAR_OUTPUT_SCHEMA_IDS.stateDeltaProposal;
  const parsed = parseStructuredSidecarObject(value, { schemaId });
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  if (!Array.isArray(input.operations)) {
    return errorResult(schemaId, 'schema', 'DIRECTIVE_SIDECAR_SCHEMA_OPERATIONS_REQUIRED', 'Sidecar proposal must include an operations array.');
  }
  const operations = [];
  const droppedForbiddenOperations = [];
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
    if (op === 'merge' && (isArrayIndexObject(operation.value) || isKnownArrayPath(path))) {
      return errorResult(schemaId, 'schema', 'DIRECTIVE_SIDECAR_SCHEMA_ARRAY_MERGE_FORBIDDEN', `Operation ${index} uses merge on an array/list field. Use append or upsert for "${path}".`, {
        path,
        operationIndex: index
      });
    }
    const root = allowedRootForPath(path, allowedRoots);
    if (!root) {
      if (forbiddenPathPolicy === 'drop') {
        droppedForbiddenOperations.push({
          index,
          op,
          path
        });
        continue;
      }
      return errorResult(schemaId, 'schema', 'DIRECTIVE_SIDECAR_SCHEMA_PATH_FORBIDDEN', `Operation ${index} path "${path}" is outside authorized roots.`, {
        allowedRoots,
        path
      });
    }
    const normalizedOperation = {
      op,
      path,
      value: cloneJson(operation.value)
    };
    if (operation.identityKey !== undefined) normalizedOperation.identityKey = compactText(operation.identityKey || 'id');
    if (operation.merge !== undefined) normalizedOperation.merge = operation.merge !== false;
    if (operation.sourceComponentIds !== undefined) normalizedOperation.sourceComponentIds = uniqueStrings(operation.sourceComponentIds, 24, 180);
    if (operation.derivedFromComponentIds !== undefined) normalizedOperation.derivedFromComponentIds = uniqueStrings(operation.derivedFromComponentIds, 24, 180);
    operations.push(normalizedOperation);
  }
  const sourceComponentIds = uniqueStrings(input.sourceComponentIds, 24, 180);
  const derivedFromComponentIds = uniqueStrings(input.derivedFromComponentIds, 24, 180);
  return {
    ok: true,
    schemaId,
    value: {
      id: compactText(input.id) || `sidecar:${workerKey || 'worker'}:${baseRevision ?? 'revision'}:${operations.length ? 'proposal' : 'no-change'}`,
      workerId: compactText(input.workerId || workerKey),
      baseRevision: Number.isFinite(Number(input.baseRevision)) ? Number(input.baseRevision) : baseRevision,
      operations,
      summary: compactText(input.summary || (operations.length ? `${operations.length} operation(s) proposed.` : 'No durable state change proposed.')),
      ...(sourceComponentIds.length ? { sourceComponentIds } : {}),
      ...(derivedFromComponentIds.length ? { derivedFromComponentIds } : {})
    },
    diagnostics: {
      ...parsed.diagnostics,
      schema: {
        ok: true,
        operationCount: operations.length,
        allowedRoots: cloneJson(allowedRoots),
        droppedForbiddenOperationCount: droppedForbiddenOperations.length,
        droppedForbiddenOperations: cloneJson(droppedForbiddenOperations)
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

function commandBearingValidationParse({ value, schemaId, validator, options }) {
  const parsed = parseStructuredSidecarObject(value, { schemaId });
  if (!parsed.ok) return parsed;
  const validation = validator(parsed.value, options);
  if (!validation.accepted) {
    return {
      ok: false,
      schemaId,
      stage: 'schema',
      error: {
        code: 'DIRECTIVE_COMMAND_BEARING_PROPOSAL_INVALID',
        message: 'Command Bearing proposal failed deterministic validation.',
        details: cloneJson(validation.rejections)
      },
      diagnostics: {
        ...parsed.diagnostics,
        schema: {
          ok: false,
          rejections: cloneJson(validation.rejections),
          sanitizedDiagnostics: cloneJson(validation.sanitizedDiagnostics)
        }
      }
    };
  }
  return {
    ok: true,
    schemaId,
    value: cloneJson(validation.records),
    diagnostics: {
      ...parsed.diagnostics,
      schema: {
        ok: true,
        sanitizedDiagnostics: cloneJson(validation.sanitizedDiagnostics),
        touchedPaths: cloneJson(validation.touchedPaths),
        idempotencyKeys: cloneJson(validation.idempotencyKeys)
      }
    }
  };
}

export function parseCommandBearingEvidenceProposalOutput(value, options = {}) {
  return commandBearingValidationParse({
    value,
    schemaId: SIDECAR_OUTPUT_SCHEMA_IDS.commandBearingEvidenceProposal,
    validator: validateCommandBearingEvidenceProposal,
    options
  });
}

export function parseCommandBearingRelationshipPerceptionProposalOutput(value, options = {}) {
  return commandBearingValidationParse({
    value,
    schemaId: SIDECAR_OUTPUT_SCHEMA_IDS.commandBearingRelationshipPerceptionProposal,
    validator: validateCommandBearingRelationshipPerceptionProposal,
    options
  });
}

export function parseCommandBearingReviewProposalOutput(value, options = {}) {
  return commandBearingValidationParse({
    value,
    schemaId: SIDECAR_OUTPUT_SCHEMA_IDS.commandBearingReviewProposal,
    validator: validateCommandBearingReviewProposal,
    options
  });
}

export function parseCommandBearingSpendCommitOutput(value, options = {}) {
  return commandBearingValidationParse({
    value,
    schemaId: SIDECAR_OUTPUT_SCHEMA_IDS.commandBearingSpendCommit,
    validator: validateCommandBearingSpendCommit,
    options
  });
}

export const __sidecarOutputContractsTestHooks = Object.freeze({
  parseStructuredSidecarObject,
  allowedRootForPath,
  containsHiddenStateLeak
});
