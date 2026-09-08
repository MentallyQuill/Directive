const MAX_LENGTH = 262144;
const MAX_DEPTH = 64;
const MAX_CANDIDATES = 4;

function lineEnd(source, start) {
  for (let i = start; i < source.length; i++) {
    if (source[i] === '\n' || source[i] === '\r') return i;
  }
  return -1;
}

export function jsonValuesEqual(left, right) {
  const pending = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop();
    if (Object.is(a, b)) continue;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) {
      if (!Object.hasOwn(b, key)) return false;
      pending.push([a[key], b[key]]);
    }
  }
  return true;
}

// Only called after JSON.parse succeeds. Iterative so valid deep JSON is not
// subject to the recovery depth budget or the JavaScript call-stack limit.
export function hasConflictingJsonKeys(source) {
  const stack = [];
  const finish = (frame, end) => {
    if (frame?.key === undefined || frame.start === undefined) return false;
    const previous = frame.keys.get(frame.key);
    const conflict = previous !== undefined && !jsonValuesEqual(
      JSON.parse(source.slice(previous[0], previous[1])), JSON.parse(source.slice(frame.start, end))
    );
    frame.keys.set(frame.key, [frame.start, end]);
    frame.key = undefined;
    frame.start = undefined;
    return conflict;
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const frame = stack.at(-1);
    if (/\s/.test(c)) continue;
    if ((c === ',' || c === '}') && finish(frame, i)) return true;
    if (c === '}' || c === ']') { stack.pop(); continue; }
    if (c === ',' || c === ':') continue;
    if (frame?.key !== undefined && frame.start === undefined) frame.start = i;
    if (c === '{' || c === '[') { stack.push({ keys: new Map(), object: c === '{' }); continue; }
    if (c === '"') {
      const start = i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++;
        i++;
      }
      if (frame?.object && frame.key === undefined) frame.key = JSON.parse(source.slice(start, i + 1));
    }
  }
  return false;
}

// Tokenize before editing: comment markers and punctuation inside strings are
// content. Unsupported escapes or delimiters are left invalid, never guessed.
export function repairJsonSyntax(source) {
  const tokens = [];
  const repairs = new Set();
  for (let i = 0; i < source.length;) {
    const c = source[i];
    if (/\s/.test(c)) { tokens.push(c); i++; continue; }
    if (source.startsWith('//', i) || source.startsWith('/*', i)) {
      const line = source[i + 1] === '/';
      let end = line ? lineEnd(source, i + 2) : source.indexOf('*/', i + 2);
      if (end < 0 && !line) return { text: source, repairs: [] };
      if (end < 0) end = source.length;
      i = line ? end : end + 2;
      tokens.push(' ');
      repairs.add('comment');
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let token = '"';
      let closed = false;
      i++;
      for (; i < source.length; i++) {
        const ch = source[i];
        if (ch === quote) { closed = true; i++; break; }
        if (ch === '\\') {
          const next = source[++i];
          if (next === undefined) break;
          token += quote === "'" && next === "'" ? "'" : `\\${next}`;
        } else if (ch === '\n' || ch === '\r') {
          token += ch === '\n' ? '\\n' : '\\r';
          repairs.add('literal-line-break');
        } else token += quote === "'" && ch === '"' ? '\\"' : ch;
      }
      if (!closed) return { text: source, repairs: [] };
      token += '"';
      if (quote === "'") repairs.add('single-quoted-string');
      tokens.push(token);
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i++;
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i++;
      const word = source.slice(start, i);
      let next = i;
      while (/\s/.test(source[next] || '')) next++;
      const previous = tokens.findLast((token) => token.trim());
      if ((previous === '{' || previous === ',') && source[next] === ':') {
        tokens.push(JSON.stringify(word));
        repairs.add('unquoted-key');
      } else tokens.push(word);
      continue;
    }
    tokens.push(c);
    i++;
  }
  // Tokens containing quoted strings are atomic; never touch their contents.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== ',') continue;
    let next = i + 1;
    while (next < tokens.length && !tokens[next].trim()) next++;
    if (tokens[next] === '}' || tokens[next] === ']') {
      tokens[i] = '';
      repairs.add('trailing-comma');
    }
  }
  return { text: tokens.join('').trim(), repairs: [...repairs] };
}

export function scanStructuredOutput(source) {
  const fail = (errorCode) => ({ ok: false, candidates: [], repairs: [], errorCode });
  if (source.length > MAX_LENGTH) return fail('json_recovery_limit');
  const candidates = new Set();
  let start = -1;
  let depth = 0;
  let quote = '';
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (start < 0) {
      const reasoning = c === '<' ? source.slice(i).match(/^<(think|reasoning)\b[^>]*>/i) : null;
      if (reasoning) {
        const tags = /<(\/?)(think|reasoning)\b[^>]*>/ig;
        tags.lastIndex = i;
        const open = [];
        let tag;
        while ((tag = tags.exec(source))) {
          if (!tag[1]) open.push(tag[2].toLowerCase());
          else if (open.pop() !== tag[2].toLowerCase()) return fail('json_invalid');
          if (!open.length) break;
          if (open.length > MAX_DEPTH) return fail('json_recovery_limit');
        }
        if (!tag || open.length) return fail('json_invalid');
        i = tags.lastIndex - 1;
        continue;
      }
      if (c !== '{' && c !== '[') continue;
      start = i;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (source.startsWith('//', i) || source.startsWith('/*', i)) {
      const line = source[i + 1] === '/';
      const end = line ? lineEnd(source, i + 2) : source.indexOf('*/', i + 2);
      if (end < 0) break;
      i = line ? end - 1 : end + 1;
      continue;
    }
    if (c === '{' || c === '[') {
      if (++depth > MAX_DEPTH) return fail('json_recovery_limit');
    } else if (c === '}' || c === ']') {
      if (--depth === 0) {
        candidates.add(source.slice(start, i + 1));
        if (candidates.size > MAX_CANDIDATES) return fail('json_recovery_limit');
        start = -1;
      }
    }
  }
  if (start >= 0) candidates.add(source.slice(start));
  if (candidates.size > MAX_CANDIDATES) return fail('json_recovery_limit');
  return { ok: true, candidates: [...candidates], repairs: [] };
}
