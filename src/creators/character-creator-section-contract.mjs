const RESULT_KIND = 'directive.characterCreatorSectionDraftResult';
const MAX_DIAGNOSTICS = 12;

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeToken(value = '') {
  return String(value || '').trim().replace(/[^A-Za-z0-9._-]+/g, '').slice(0, 120);
}

function normalizeFieldRules(fieldRules = []) {
  const seen = new Set();
  return (Array.isArray(fieldRules) ? fieldRules : []).flatMap((rule) => {
    const path = safeToken(rule?.path);
    if (!path || seen.has(path)) return [];
    seen.add(path);
    const allowedValues = [...new Set((Array.isArray(rule?.allowedValues) ? rule.allowedValues : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
    return [{ path, allowedValues }];
  });
}

export function buildCharacterCreatorSectionDraftSchema({
  sectionId,
  mode,
  fieldRules = []
} = {}) {
  const rules = normalizeFieldRules(fieldRules);
  return {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'sectionId', 'mode', 'fields'],
    properties: {
      kind: { const: RESULT_KIND },
      sectionId: { const: String(sectionId || '') },
      mode: { const: String(mode || '') },
      fields: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: Object.fromEntries(rules.map(({ path, allowedValues }) => [
          path,
          allowedValues.length ? { type: 'string', enum: allowedValues } : { type: 'string' }
        ]))
      },
      notes: { type: 'array', items: { type: 'string' } },
      warnings: { type: 'array', items: { type: 'string' } }
    }
  };
}

export function validateCharacterCreatorSectionDraftPayload(payload, {
  sectionId,
  mode,
  fieldRules = []
} = {}) {
  const diagnostics = [];
  const add = (path, keyword, detail = '') => {
    if (diagnostics.length >= MAX_DIAGNOSTICS) return;
    diagnostics.push({
      path: String(path || '').slice(0, 240),
      keyword: safeToken(keyword) || 'schema',
      ...(safeToken(detail) ? { detail: safeToken(detail) } : {})
    });
  };
  if (!isObject(payload)) {
    add('', 'type', 'object');
    return { ok: false, diagnostics };
  }

  const allowedTopLevel = new Set(['kind', 'sectionId', 'mode', 'fields', 'notes', 'warnings']);
  for (const key of Object.keys(payload)) {
    if (!allowedTopLevel.has(key)) add('', 'additionalProperties', key);
  }
  for (const key of ['kind', 'sectionId', 'mode', 'fields']) {
    if (!Object.hasOwn(payload, key)) add('', 'required', key);
  }
  if (payload.kind !== RESULT_KIND) add('/kind', 'const', 'kind');
  if (payload.sectionId !== sectionId) add('/sectionId', 'const', 'sectionId');
  if (payload.mode !== mode) add('/mode', 'const', 'mode');

  const rules = normalizeFieldRules(fieldRules);
  const byPath = new Map(rules.map((rule) => [rule.path, rule]));
  if (!isObject(payload.fields)) {
    add('/fields', 'type', 'object');
  } else {
    const entries = Object.entries(payload.fields);
    if (!entries.length) add('/fields', 'minProperties', 'fields');
    for (const [path, value] of entries) {
      const rule = byPath.get(path);
      if (!rule) {
        add('/fields', 'additionalProperties', path);
        continue;
      }
      if (typeof value !== 'string') {
        add(`/fields/${path}`, 'type', path);
      } else if (rule.allowedValues.length && !rule.allowedValues.includes(value)) {
        add(`/fields/${path}`, 'enum', path);
      }
    }
  }

  for (const key of ['notes', 'warnings']) {
    if (!Object.hasOwn(payload, key)) continue;
    if (!Array.isArray(payload[key]) || payload[key].some((value) => typeof value !== 'string')) {
      add(`/${key}`, 'type', key);
    }
  }
  return { ok: diagnostics.length === 0, diagnostics };
}
