import { hasConflictingJsonKeys, jsonValuesEqual, repairJsonSyntax, scanStructuredOutput } from './structured-output-scanner.mjs';

export const STRUCTURED_OUTPUT_PARSE_ERROR_CODES = Object.freeze({
  JSON_INVALID: 'json_invalid',
  JSON_NOT_OBJECT: 'json_not_object',
  EMPTY_JSON: 'json_empty',
  JSON_AMBIGUOUS: 'json_ambiguous',
  RECOVERY_LIMIT: 'json_recovery_limit'
});

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactText(value = '', maxLength = 1000) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function createDiagnostic(code, message, details = {}) {
  return {
    ...(isObject(details) ? details : {}),
    code,
    message: compactText(message || 'Provider response was not valid JSON.', 1000)
  };
}

export function stripReasoningBlocks(text = '') {
  return String(text || '')
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning\b[^>]*>[\s\S]*?<\/reasoning>/gi, '')
    .trim();
}

export function stripMarkdownFence(text = '') {
  const clean = stripReasoningBlocks(text).trim();
  const fenced = clean.match(/^```(?:json|text|markdown)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : clean).trim();
}

export function extractBalancedJsonObject(text = '') {
  const clean = stripMarkdownFence(text);
  const start = clean.indexOf('{');
  if (start < 0) return '';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < clean.length; index += 1) {
    const char = clean[index];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return clean.slice(start, index + 1);
    }
  }
  return clean.slice(start);
}

export function repairCommonJson(text = '') {
  return repairJsonSyntax(String(text || '')).text;
}

export function repairMissingArrayElementObjectClosers(text = '') {
  const source = String(text || '');
  let output = '';
  const stack = [];
  let inString = false;
  let escape = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escape) {
      output += char;
      escape = false;
      continue;
    }
    if (char === '\\' && inString) {
      output += char;
      escape = true;
      continue;
    }
    if (char === '"') {
      output += char;
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') stack.push({ char, index });
      else if (char === '}' || char === ']') stack.pop();
      if (char === ',' && stack.at(-1)?.char === '{' && stack.at(-2)?.char === '['
        && /^\{\s*"op"\s*:/.test(source.slice(stack.at(-1).index))
        && /"operations"\s*:\s*$/.test(source.slice(0, stack.at(-2).index))) {
        let next = index + 1;
        while (/\s/.test(source[next] || '')) next += 1;
        let afterOpen = source[next] === '{' ? next + 1 : next;
        while (/\s/.test(source[afterOpen] || '')) afterOpen += 1;
        const startsNextOperation = source.slice(afterOpen, afterOpen + 4) === '"op"';
        if (startsNextOperation) {
          output += '}';
          stack.pop();
        }
      }
    }
    output += char;
  }
  return output;
}

export function parseStructuredJsonText(text = '', options = {}) {
  const source = String(text || '').trim();
  const failure = (code, message) => ({
    ok: false,
    error: message,
    diagnostic: createDiagnostic(code, message, {
      visibleContentLength: source.length,
      sample: source.slice(0, 600)
    })
  });
  const accept = (candidate, value, stage, repairs = []) => {
    if (hasConflictingJsonKeys(candidate)) return failure('json_ambiguous', 'Provider output contains conflicting object keys.');
    if (options.requireObject !== false && !isObject(value)) return failure('json_not_object', 'Provider structured output must be an object.');
    return { ok: true, value, repaired: stage !== 'direct', candidate, recovery: { stage, repairs } };
  };
  if (!source) return failure('json_empty', 'Provider returned empty structured output.');
  let direct;
  try { direct = JSON.parse(source); } catch { /* Recovery only after direct parsing fails. */ }
  if (direct !== undefined) return accept(source, direct, 'direct');

  const scan = scanStructuredOutput(source);
  if (!scan.ok) return failure(scan.errorCode, 'Provider output is incomplete or exceeds recovery limits.');
  if (!scan.candidates.length) return failure('json_invalid', 'Provider response was not valid JSON.');
  const results = [];
  for (const original of scan.candidates) {
    let candidate = original;
    let repairs = [];
    let value;
    try { value = JSON.parse(candidate); } catch {
      const repaired = repairJsonSyntax(original);
      candidate = repaired.text;
      repairs = repaired.repairs;
      try { value = JSON.parse(candidate); } catch {
        const legacy = repairMissingArrayElementObjectClosers(candidate);
        if (legacy === candidate) return failure('json_invalid', 'Provider response was not valid JSON.');
        candidate = legacy;
        repairs = [...repairs, 'legacy-operation-closer'];
        try { value = JSON.parse(candidate); } catch { return failure('json_invalid', 'Provider response was not valid JSON.'); }
      }
    }
    const result = accept(candidate, value, repairs.length ? 'syntax-repaired' : 'extracted', repairs);
    if (!result.ok) return result;
    results.push(result);
  }
  if (results.some((result) => !jsonValuesEqual(result.value, results[0].value))) {
    return failure('json_ambiguous', 'Provider output contains competing JSON answers.');
  }
  return results[0];
}
