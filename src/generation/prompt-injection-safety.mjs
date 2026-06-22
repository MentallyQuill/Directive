const HOST_SAFE_AUDIENCES = Object.freeze([
  'playerSafe',
  'narratorSafe'
]);

const UNSAFE_CONTENT_KEYS = new Set([
  'directoronly',
  'directoronlydata',
  'hidden',
  'hiddendata',
  'hiddenfacts',
  'hiddenrawvalues',
  'rawhiddenvalues',
  'rawrelationshipvalues',
  'hiddenclockvalues',
  'secret',
  'secrets'
]);

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function createUnsafePromptBlockError(message, details = {}) {
  const error = new Error(message);
  error.code = 'DIRECTIVE_PROMPT_BLOCK_UNSAFE';
  error.details = cloneJson(details);
  return error;
}

function normalizedKey(key) {
  return String(key).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function findUnsafeContentKey(value, path = 'content') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findUnsafeContentKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isObject(value)) {
    return null;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (UNSAFE_CONTENT_KEYS.has(normalizedKey(key))) {
      return {
        path: `${path}.${key}`,
        key
      };
    }
    const found = findUnsafeContentKey(nested, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function normalizeSource(source = {}) {
  requireObject(source, 'prompt block source');
  return {
    kind: requireNonEmptyString(source.kind, 'prompt block source.kind'),
    id: requireNonEmptyString(source.id, 'prompt block source.id'),
    revision: source.revision ?? null
  };
}

function normalizeSafety(safety = {}) {
  return {
    rawHiddenValuesExposed: safety.rawHiddenValuesExposed === true,
    directorOnlyDataIncluded: safety.directorOnlyDataIncluded === true,
    playerVisible: safety.playerVisible !== false
  };
}

function contentToText(content) {
  if (typeof content === 'string') {
    return content.trim();
  }
  return JSON.stringify(content ?? null, null, 2);
}

export function normalizeHostPromptBlock(block = {}) {
  requireObject(block, 'prompt block');
  const content = cloneJson(block.content);
  const text = contentToText(content);
  if (!text) {
    throw new Error('prompt block content must not be empty');
  }
  return {
    kind: 'directive.hostPromptBlock',
    id: requireNonEmptyString(block.id, 'prompt block id'),
    title: requireNonEmptyString(block.title, 'prompt block title'),
    audience: requireNonEmptyString(block.audience || 'playerSafe', 'prompt block audience'),
    source: normalizeSource(block.source),
    priority: Number.isFinite(Number(block.priority)) ? Number(block.priority) : 100,
    placement: typeof block.placement === 'string' ? block.placement : 'inChat',
    depth: Number.isFinite(Number(block.depth)) ? Number(block.depth) : 4,
    role: typeof block.role === 'string' ? block.role : 'system',
    contentHash: typeof block.contentHash === 'string' ? block.contentHash : null,
    hash: typeof block.hash === 'string' ? block.hash : null,
    content,
    text,
    safety: normalizeSafety(block.safety || {})
  };
}

export function assertHostPromptBlockSafeForInjection(block) {
  const normalized = normalizeHostPromptBlock(block);
  if (!HOST_SAFE_AUDIENCES.includes(normalized.audience)) {
    throw createUnsafePromptBlockError(
      `Prompt block audience "${normalized.audience}" cannot be injected into host generation`,
      {
        blockId: normalized.id,
        audience: normalized.audience
      }
    );
  }
  if (normalized.safety.rawHiddenValuesExposed || normalized.safety.directorOnlyDataIncluded) {
    throw createUnsafePromptBlockError(
      'Prompt block safety flags prevent host injection',
      {
        blockId: normalized.id,
        safety: normalized.safety
      }
    );
  }
  const unsafeKey = findUnsafeContentKey(normalized.content);
  if (unsafeKey) {
    throw createUnsafePromptBlockError(
      `Prompt block contains unsafe content key "${unsafeKey.key}"`,
      {
        blockId: normalized.id,
        path: unsafeKey.path
      }
    );
  }
  return normalized;
}

export function createHostPromptInjectionPacket({
  blocks = [],
  attributionLabel = 'Directive',
  createdAt = null
} = {}) {
  const safeBlocks = blocks
    .map(assertHostPromptBlockSafeForInjection)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const label = requireNonEmptyString(attributionLabel, 'attributionLabel');
  return {
    kind: 'directive.hostPromptInjectionPacket',
    attribution: {
      label
    },
    createdAt,
    blocks: safeBlocks.map(cloneJson),
    text: safeBlocks.map((block) => [
      `[${label}: ${block.title}]`,
      block.text
    ].join('\n')).join('\n\n'),
    breakdown: safeBlocks.map((block) => ({
      label,
      title: block.title,
      sourceKind: block.source.kind,
      sourceId: block.source.id,
      sourceRevision: block.source.revision
    }))
  };
}
