import { canonicalJson } from '../storage/v1-state-delta-codec.mjs';
import { stableSha256Hex } from '../runtime/v1-stable-hash.mjs';

export const isProtectedGenerationRole = roleId => ['characterResponder', 'sceneNarrator', 'characterKnowledgeReviewer'].includes(roleId);

export function isolationError() {
  const error = new Error('Isolated generation context is invalid.');
  error.code = 'DIRECTIVE_CONTEXT_ISOLATION';
  return error;
}

function contextDigest(request) {
  if (!Array.isArray(request.messages) || !request.messages.length
    || request.messages.some(message => !message || Object.keys(message).some(key => !['role', 'content'].includes(key))
      || !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')
    || request.prompt != null || request.systemPrompt != null) throw isolationError();
  return stableSha256Hex(canonicalJson({ messages: request.messages, jsonSchema: request.jsonSchema ?? null }));
}

/** Integrity seal only: packet admission remains the caller's responsibility. */
export function createIsolatedGenerationRequest({ messages, jsonSchema, parameters, signal } = {}) {
  const request = { messages: structuredClone(messages), ...(jsonSchema == null ? {} : { jsonSchema: structuredClone(jsonSchema) }),
    ...(parameters == null ? {} : { parameters: { ...parameters } }), ...(signal ? { signal } : {}) };
  request.isolatedContext = Object.freeze({ version: 1, digest: contextDigest(request) });
  return request;
}

export function assertIsolatedGenerationRequest(request) {
  if (request?.isolatedContext?.version !== 1 || request.isolatedContext.digest !== contextDigest(request)) throw isolationError();
}

export function assertIsolatedTransport(request, messages, policy, samplers) {
  if (!request.isolatedContext) return;
  assertIsolatedGenerationRequest(request);
  if (canonicalJson(messages) !== canonicalJson(request.messages) || policy.includePreset || policy.includeInstruct
    || Object.keys(samplers).some(key => !['temperature', 'top_p', 'json_schema'].includes(key))) throw isolationError();
}
