export const STRUCTURED_OUTPUT_PARSE_ERROR_CODES = Object.freeze({
  JSON_INVALID: 'json_invalid',
  JSON_NOT_OBJECT: 'json_not_object',
  EMPTY_JSON: 'json_empty'
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

function escapeLiteralLineBreaksInStrings(text = '') {
  const source = String(text || '');
  let output = '';
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
    if (inString && char === '\n') {
      output += '\\n';
      continue;
    }
    if (inString && char === '\r') {
      output += '\\r';
      continue;
    }
    output += char;
  }
  return output;
}

export function repairCommonJson(text = '') {
  return escapeLiteralLineBreaksInStrings(String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\/\/[^\n\r]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,\s*([}\]])/g, '$1')
    .trim());
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
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') stack.pop();
      if (char === ',' && stack.at(-1) === '{' && stack.includes('[')) {
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

function uniqueCandidates(values = []) {
  const seen = new Set();
  return values.map((value) => String(value || '').trim()).filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

export function parseStructuredJsonText(text = '', options = {}) {
  const source = String(text || '').trim();
  if (!source) {
    return {
      ok: false,
      error: 'Provider returned empty structured output.',
      diagnostic: createDiagnostic(STRUCTURED_OUTPUT_PARSE_ERROR_CODES.EMPTY_JSON, 'Provider returned empty structured output.', {
        visibleContentLength: 0
      })
    };
  }
  const balanced = extractBalancedJsonObject(source);
  const candidates = uniqueCandidates([
    stripMarkdownFence(source),
    balanced,
    repairCommonJson(balanced),
    repairCommonJson(stripMarkdownFence(source)),
    repairMissingArrayElementObjectClosers(repairCommonJson(balanced)),
    repairMissingArrayElementObjectClosers(repairCommonJson(stripMarkdownFence(source)))
  ]);
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (options.requireObject !== false && !isObject(parsed)) {
        return {
          ok: false,
          error: 'Provider structured output must be an object.',
          diagnostic: createDiagnostic(STRUCTURED_OUTPUT_PARSE_ERROR_CODES.JSON_NOT_OBJECT, 'Provider structured output must be an object.', {
            visibleContentLength: source.length,
            sample: source.slice(0, 600)
          })
        };
      }
      return {
        ok: true,
        value: parsed,
        repaired: candidate !== candidates[0],
        candidate
      };
    } catch (error) {
      lastError = error;
    }
  }
  return {
    ok: false,
    error: lastError?.message || 'Provider response was not valid JSON.',
    diagnostic: createDiagnostic(STRUCTURED_OUTPUT_PARSE_ERROR_CODES.JSON_INVALID, lastError?.message || 'Provider response was not valid JSON.', {
      visibleContentLength: source.length,
      sample: source.slice(0, 600)
    })
  };
}
