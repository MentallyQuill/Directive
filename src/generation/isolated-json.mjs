import { createIsolatedGenerationRequest } from './isolated-request.mjs';
import { parseStructuredJsonText } from '../providers/structured-output-parser.mjs';
import { assertGenerationActive } from '../runtime/generation-cancellation.mjs';

/** Shared strict route for buffered protected roles; no additional model retry here. */
export async function generateIsolatedJson({ generation, roleId, instructions, payload, schema, budget, signal } = {}) {
  assertGenerationActive(signal);
  if (typeof generation?.generate !== 'function' || typeof budget?.claim !== 'function') throw new TypeError('isolated-generation-required');
  const request = createIsolatedGenerationRequest({ signal, jsonSchema: schema, messages: [
    { role: 'system', content: instructions }, { role: 'user', content: JSON.stringify({ ...payload, schema }) },
  ] });
  const result = await generation.generate(roleId, request, { signal, attemptBudget: budget });
  assertGenerationActive(signal);
  if (result?.ok === false) throw Object.assign(new Error('Protected generation failed.'), { code: result.error?.code || 'DIRECTIVE_PROVIDER_FAILED' });
  const response = result?.ok === true ? result.response : result;
  const parsed = parseStructuredJsonText(response?.text ?? '', { requireObject: true });
  if (!parsed.ok) throw Object.assign(new Error('Protected generation returned invalid JSON.'), { code: parsed.diagnostic.code });
  return parsed.value;
}
