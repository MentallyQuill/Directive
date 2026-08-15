export const V1_CAMPAIGN_SAVE_MANIFEST_KIND = 'directive.campaignSaveManifest.v1';
export const V1_CAMPAIGN_SAVE_BASE_KIND = 'directive.campaignSaveBase.v1';
export const V1_CAMPAIGN_SAVE_SEGMENT_KIND = 'directive.campaignSaveSegment.v1';
export const V1_CAMPAIGN_SAVE_SEGMENT_MAX_DELTAS = 64;
export const V1_CAMPAIGN_SAVE_SEGMENT_MAX_BYTES = 512 * 1024;

const SAFE_ID = /^[a-zA-Z0-9_.-]+$/;
const HASH = /^[a-f0-9]{64}$/;
const SAVE_METADATA_FIELDS = new Set([
  'kind', 'version', 'id', 'name', 'slotType', 'campaignId', 'packageId', 'packageVersion',
  'parentSaveId', 'createdAt', 'updatedAt',
]);
const MANIFEST_FIELDS = new Set([
  'kind', 'version', 'saveId', 'saveMetadata', 'base', 'segments', 'currentRevision',
  'currentStateHash', 'updatedAt',
]);
const BASE_FIELDS = new Set(['kind', 'version', 'saveId', 'revision', 'stateHash', 'state']);
const SEGMENT_FIELDS = new Set(['kind', 'version', 'saveId', 'sequence', 'generation', 'slot', 'deltas']);
const BASE_REF_FIELDS = new Set(['path', 'revision', 'stateHash']);
const SEGMENT_REF_FIELDS = new Set([
  'path', 'sequence', 'generation', 'slot', 'beforeRevision', 'afterRevision', 'deltaCount',
  'byteLength', 'contentHash', 'sealed',
]);

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, fields) {
  return object(value) && Object.keys(value).every((key) => fields.has(key));
}

function safeId(value, label) {
  const id = String(value ?? '').trim();
  if (!id || !SAFE_ID.test(id)) throw contractError('DIRECTIVE_V1_SAVE_LAYOUT_REJECTED', `${label} is invalid.`);
  return id;
}

function revision(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw contractError('DIRECTIVE_V1_SAVE_LAYOUT_REJECTED', `${label} must be a nonnegative integer.`);
  }
  return value;
}

function hash(value, label) {
  if (typeof value !== 'string' || !HASH.test(value)) {
    throw contractError('DIRECTIVE_V1_SAVE_LAYOUT_REJECTED', `${label} must be a SHA-256 hash.`);
  }
  return value;
}

function path(value, label) {
  const text = String(value ?? '').trim();
  if (!text || text.includes('..') || text.includes('\\') || text.startsWith('/')) {
    throw contractError('DIRECTIVE_V1_SAVE_LAYOUT_REJECTED', `${label} is unsafe.`);
  }
  return text;
}

function contractError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = structuredClone(details);
  return error;
}

export const V1_SEGMENTED_SAVE_PATHS = Object.freeze({
  base: (saveId) => `v1/saves/${safeId(saveId, 'saveId')}.base.v1.json`,
  segment: (saveId, sequence, slot) => {
    const number = revision(sequence, 'segment sequence');
    if (number < 1 || !['a', 'b'].includes(slot)) {
      throw contractError('DIRECTIVE_V1_SAVE_LAYOUT_REJECTED', 'Segment path coordinates are invalid.');
    }
    return `v1/saves/${safeId(saveId, 'saveId')}.segment-${String(number).padStart(6, '0')}-${slot}.v1.json`;
  },
});

export function campaignSaveMetadata(save) {
  const metadata = Object.fromEntries(
    Object.entries(save || {}).filter(([key]) => SAVE_METADATA_FIELDS.has(key)),
  );
  if (!exactFields(metadata, SAVE_METADATA_FIELDS)
    || metadata.kind !== 'directive.campaignSave.v1'
    || metadata.version !== 1
    || safeId(metadata.id, 'save metadata id') !== metadata.id) {
    throw contractError('DIRECTIVE_V1_SAVE_LAYOUT_REJECTED', 'Campaign save metadata is invalid.');
  }
  return structuredClone(metadata);
}

export function createV1CampaignSaveBase({ saveId, state, stateHash }) {
  return {
    kind: V1_CAMPAIGN_SAVE_BASE_KIND,
    version: 1,
    saveId: safeId(saveId, 'saveId'),
    revision: revision(state?.stateCustody?.revision, 'base revision'),
    stateHash: hash(stateHash, 'base stateHash'),
    state: structuredClone(state),
  };
}

export function createV1CampaignSaveManifest({ save, stateHash }) {
  const metadata = campaignSaveMetadata(save);
  const currentRevision = revision(save?.state?.stateCustody?.revision, 'manifest revision');
  const currentStateHash = hash(stateHash, 'manifest currentStateHash');
  return {
    kind: V1_CAMPAIGN_SAVE_MANIFEST_KIND,
    version: 1,
    saveId: metadata.id,
    saveMetadata: metadata,
    base: {
      path: V1_SEGMENTED_SAVE_PATHS.base(metadata.id),
      revision: currentRevision,
      stateHash: currentStateHash,
    },
    segments: [],
    currentRevision,
    currentStateHash,
    updatedAt: metadata.updatedAt,
  };
}

export function assertV1CampaignSaveBase(base, { saveId = null } = {}) {
  if (!exactFields(base, BASE_FIELDS)
    || base.kind !== V1_CAMPAIGN_SAVE_BASE_KIND
    || base.version !== 1) {
    throw contractError('DIRECTIVE_V1_SAVE_BASE_REJECTED', 'Directive V1 campaign-save base is invalid.');
  }
  const id = safeId(base.saveId, 'base saveId');
  if (saveId && id !== saveId) throw contractError('DIRECTIVE_V1_SAVE_BASE_REJECTED', 'Campaign-save base belongs to another save.');
  revision(base.revision, 'base revision');
  hash(base.stateHash, 'base stateHash');
  if (!object(base.state)) throw contractError('DIRECTIVE_V1_SAVE_BASE_REJECTED', 'Campaign-save base state is invalid.');
  return base;
}

function assertBaseRef(reference, saveId) {
  if (!exactFields(reference, BASE_REF_FIELDS)) throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save base reference is invalid.');
  if (path(reference.path, 'base path') !== V1_SEGMENTED_SAVE_PATHS.base(saveId)) {
    throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save base path is not save-owned.');
  }
  revision(reference.revision, 'base revision');
  hash(reference.stateHash, 'base stateHash');
}

function assertSegmentRef(reference, saveId, expectedSequence, isCurrent) {
  if (!exactFields(reference, SEGMENT_REF_FIELDS)) throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save segment reference is invalid.');
  if (reference.sequence !== expectedSequence || !Number.isInteger(reference.generation) || reference.generation < 1
    || !['a', 'b'].includes(reference.slot)) {
    throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save segment coordinates are invalid.');
  }
  if (path(reference.path, 'segment path') !== V1_SEGMENTED_SAVE_PATHS.segment(saveId, reference.sequence, reference.slot)) {
    throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save segment path is not save-owned.');
  }
  revision(reference.beforeRevision, 'segment beforeRevision');
  revision(reference.afterRevision, 'segment afterRevision');
  if (reference.afterRevision <= reference.beforeRevision
    || !Number.isInteger(reference.deltaCount) || reference.deltaCount < 1
    || reference.deltaCount > V1_CAMPAIGN_SAVE_SEGMENT_MAX_DELTAS
    || !Number.isInteger(reference.byteLength) || reference.byteLength < 1
    || reference.byteLength > V1_CAMPAIGN_SAVE_SEGMENT_MAX_BYTES) {
    throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save segment bounds are invalid.');
  }
  hash(reference.contentHash, 'segment contentHash');
  if (typeof reference.sealed !== 'boolean' || reference.sealed === isCurrent) {
    throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save segment seal state is invalid.');
  }
}

export function assertV1CampaignSaveManifest(manifest, { saveId = null } = {}) {
  if (!exactFields(manifest, MANIFEST_FIELDS)
    || manifest.kind !== V1_CAMPAIGN_SAVE_MANIFEST_KIND
    || manifest.version !== 1
    || Object.hasOwn(manifest, 'state')) {
    throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Directive V1 campaign-save manifest is invalid.');
  }
  const id = safeId(manifest.saveId, 'manifest saveId');
  if (saveId && id !== saveId) throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save manifest belongs to another save.');
  const metadata = campaignSaveMetadata(manifest.saveMetadata);
  if (metadata.id !== id) throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save metadata ID does not match its manifest.');
  assertBaseRef(manifest.base, id);
  if (!Array.isArray(manifest.segments)) throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save segments must be an array.');
  manifest.segments.forEach((reference, index) => assertSegmentRef(reference, id, index + 1, index === manifest.segments.length - 1));
  let expectedBeforeRevision = manifest.base.revision;
  for (const reference of manifest.segments) {
    if (reference.beforeRevision !== expectedBeforeRevision) {
      throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save segment revisions are discontinuous.');
    }
    expectedBeforeRevision = reference.afterRevision;
  }
  const currentRevision = revision(manifest.currentRevision, 'manifest currentRevision');
  const expectedRevision = manifest.segments.at(-1)?.afterRevision ?? manifest.base.revision;
  if (currentRevision !== expectedRevision) throw contractError('DIRECTIVE_V1_SAVE_MANIFEST_REJECTED', 'Campaign-save manifest revision is discontinuous.');
  hash(manifest.currentStateHash, 'manifest currentStateHash');
  return manifest;
}

export function assertV1CampaignSaveSegment(segment, { saveId = null, reference = null } = {}) {
  if (!exactFields(segment, SEGMENT_FIELDS)
    || segment.kind !== V1_CAMPAIGN_SAVE_SEGMENT_KIND
    || segment.version !== 1) {
    throw contractError('DIRECTIVE_V1_SAVE_SEGMENT_REJECTED', 'Directive V1 campaign-save segment is invalid.');
  }
  const id = safeId(segment.saveId, 'segment saveId');
  if (saveId && id !== saveId) throw contractError('DIRECTIVE_V1_SAVE_SEGMENT_REJECTED', 'Campaign-save segment belongs to another save.');
  if (!Number.isInteger(segment.sequence) || segment.sequence < 1
    || !Number.isInteger(segment.generation) || segment.generation < 1
    || !['a', 'b'].includes(segment.slot)
    || !Array.isArray(segment.deltas)
    || segment.deltas.length < 1
    || segment.deltas.length > V1_CAMPAIGN_SAVE_SEGMENT_MAX_DELTAS) {
    throw contractError('DIRECTIVE_V1_SAVE_SEGMENT_REJECTED', 'Campaign-save segment coordinates or contents are invalid.');
  }
  if (reference && (segment.sequence !== reference.sequence
    || segment.generation !== reference.generation
    || segment.slot !== reference.slot
    || segment.deltas.length !== reference.deltaCount)) {
    throw contractError('DIRECTIVE_V1_SAVE_SEGMENT_REJECTED', 'Campaign-save segment does not match its manifest reference.');
  }
  return segment;
}
