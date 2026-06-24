const FIRST_PERSON_NARRATION_PATTERN = /(^|[^A-Za-z])(?:i(?:'(?:m|ve|ll|d))?|me|my|mine|myself|we(?:'(?:re|ve|ll|d))?|us|our|ours|ourselves)(?=$|[^A-Za-z])/i;

export function stripDoubleQuotedSegments(text = '') {
  let inQuote = false;
  let result = '';
  for (const char of String(text || '')) {
    if (char === '"') {
      inQuote = !inQuote;
      result += ' ';
      continue;
    }
    result += inQuote ? ' ' : char;
  }
  return result;
}

export function normalizePlayerInputPerspective(raw = '') {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'first-person' || value === 'first person' || value === '1st-person' || value === '1st person') {
    return 'first-person';
  }
  return 'third-person';
}

export function playerInputPerspectiveEvidence(text = '', declaredPerspective = '') {
  const normalizedDeclared = normalizePlayerInputPerspective(declaredPerspective);
  const unquotedText = stripDoubleQuotedSegments(text);
  const firstPersonNarrationSuspected = FIRST_PERSON_NARRATION_PATTERN.test(unquotedText);
  const detectedPerspective = firstPersonNarrationSuspected || normalizedDeclared === 'first-person'
    ? 'first-person'
    : 'third-person';
  let perspectiveWarning = null;
  if (normalizedDeclared === 'first-person') {
    perspectiveWarning = 'declared-first-person-compatibility-only';
  } else if (firstPersonNarrationSuspected) {
    perspectiveWarning = 'declared-third-person-but-first-person-narration-suspected';
  }
  return {
    declaredPerspective: normalizedDeclared,
    detectedPerspective,
    firstPersonNarrationSuspected,
    preferredPlayEvidence: detectedPerspective === 'third-person' && normalizedDeclared === 'third-person',
    perspectiveWarning
  };
}

export function perspectiveLogFields(evidence = {}) {
  const declaredPerspective = evidence.declaredPerspective || evidence.perspective || 'third-person';
  return {
    playerInputPerspective: evidence.detectedPerspective || 'third-person',
    declaredPlayerInputPerspective: declaredPerspective,
    preferredPlayEvidence: evidence.preferredPlayEvidence !== false,
    firstPersonNarrationSuspected: evidence.firstPersonNarrationSuspected === true,
    perspectiveWarning: evidence.perspectiveWarning || null
  };
}
