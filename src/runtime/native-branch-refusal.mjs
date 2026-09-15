// This host-chat marker can refuse generation; it never grants campaign authority.
export const BRANCH_DECISION_HISTORY_UNAVAILABLE = 'DIRECTIVE_BRANCH_DECISION_HISTORY_UNAVAILABLE';
export const BRANCH_DECISION_HISTORY_MESSAGE = 'Directive cannot attach this earlier branch because this save does not record when its objective adjustments were made. Your original timeline is unchanged. Use Campaign Continue to return to it, or Campaign Load Game to choose an earlier checkpoint if one is available.';
const CHILD_FIELDS = ['hostId', 'chatId', 'entityType', 'entityId', 'entityName'];
const PARENT_FIELDS = [...CHILD_FIELDS, 'campaignId', 'saveId'];

function identity(binding, fields) {
  return Object.fromEntries(fields.map(field => [field, String(binding?.[field] ?? '').trim()]));
}

function exact(left, right, fields) {
  return fields.every(field => typeof left?.[field] === 'string' && left[field].length > 0
    && left[field] === String(right?.[field] ?? '').trim());
}

export function createNativeBranchRefusal({ parentBinding, childBinding }) {
  const marker = {
    kind: 'directive.nativeBranchRefusal.v1', version: 1,
    reasonCode: BRANCH_DECISION_HISTORY_UNAVAILABLE,
    parentBinding: identity(parentBinding, PARENT_FIELDS),
    childBinding: identity(childBinding, CHILD_FIELDS),
  };
  if (!nativeBranchRefusalMatches(marker, { parentBinding, childBinding })) {
    throw new Error('A branch refusal requires exact, distinct child and parent identities.');
  }
  return marker;
}

export function nativeBranchRefusalMatches(marker, { parentBinding, childBinding } = {}) {
  return marker?.kind === 'directive.nativeBranchRefusal.v1' && marker.version === 1
    && marker.reasonCode === BRANCH_DECISION_HISTORY_UNAVAILABLE
    && marker.parentBinding?.chatId !== marker.childBinding?.chatId
    && exact(marker.parentBinding, parentBinding, PARENT_FIELDS)
    && exact(marker.childBinding, childBinding, CHILD_FIELDS)
    && ['hostId', 'entityType', 'entityId', 'entityName'].every(field => marker.parentBinding[field] === marker.childBinding[field]);
}
