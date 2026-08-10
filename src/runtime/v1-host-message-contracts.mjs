function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}

export function stableJsonStringify(value) {
  return JSON.stringify(sorted(value));
}

function utf8(value) {
  const text = String(value ?? '');
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
  if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8');
  return Uint8Array.from(unescape(encodeURIComponent(text)), (character) => character.charCodeAt(0));
}

export function stableJsonByteLength(value) {
  return utf8(stableJsonStringify(value)).length;
}

export function hashStableJson(value) {
  let high = 0x811c9dc5;
  let low = 0x01000193;
  for (const byte of utf8(stableJsonStringify(value))) {
    high = Math.imul(high ^ byte, 0x01000193);
    low = Math.imul(low ^ byte, 0x85ebca6b);
  }
  return `${(high >>> 0).toString(16).padStart(8, '0')}${(low >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeV1HostMessageVisibility(message = {}) {
  const directive = message.extra?.directive || message.metadata?.directive || {};
  const hiddenByHost = message.is_hidden === true || message.hidden === true;
  const sourceMutation = message.deleted === true
    || message.is_deleted === true
    || directive.deleted === true;
  return {
    kind: 'directive.hostMessageVisibility.v1',
    sourceRowExists: true,
    hiddenByHost,
    sourceMutation,
    visibilityMutationOnly: hiddenByHost && !sourceMutation,
    hiddenReasons: hiddenByHost ? ['host-hidden'] : [],
    sourceMutationReasons: sourceMutation ? ['host-delete'] : []
  };
}
