export const DIRECTIVE_PACKAGE_IMAGE_VARIANTS = Object.freeze([
  'thumb',
  'card',
  'detail',
  'hero'
]);

export const DIRECTIVE_PACKAGE_IMAGE_PLACEHOLDER_TYPE = 'directive.package-image-placeholder';

const VARIANT_FALLBACKS = Object.freeze({
  thumb: Object.freeze(['thumb', 'card', 'detail', 'hero']),
  card: Object.freeze(['card', 'thumb', 'detail', 'hero']),
  detail: Object.freeze(['detail', 'card', 'hero', 'thumb']),
  hero: Object.freeze(['hero', 'card', 'detail', 'thumb'])
});

function normalizeId(value) {
  return String(value || '').trim();
}

function imageRecords(packageData) {
  const images = packageData?.assets?.images;
  return Array.isArray(images) ? images.filter((image) => image && typeof image === 'object') : [];
}

function sortedImages(images) {
  return [...images].sort((a, b) => normalizeId(a.id).localeCompare(normalizeId(b.id)));
}

function variantCandidates(variant) {
  const requested = normalizeId(variant) || 'card';
  const fallbacks = VARIANT_FALLBACKS[requested] || [requested, 'card', 'thumb', 'detail', 'hero'];
  return [...new Set(fallbacks)];
}

function directImagePath(image) {
  return image.path || image.url || image.src || '';
}

function selectImage(packageData, kind, subjectId) {
  const images = sortedImages(imageRecords(packageData));
  const exactMatches = images.filter((image) => normalizeId(image.kind) === kind && normalizeId(image.subjectId) === subjectId);
  if (exactMatches.length > 0) {
    return { image: exactMatches[0], fallbackReason: '' };
  }

  const subjectMatches = images.filter((image) => normalizeId(image.subjectId) === subjectId);
  if (subjectMatches.length > 0) {
    return { image: subjectMatches[0], fallbackReason: 'kind-fallback' };
  }

  return { image: null, fallbackReason: 'missing-image' };
}

function placeholderLabel(subjectId, kind) {
  const subject = normalizeId(subjectId);
  if (subject) {
    return subject
      .split(/[-_.\s]+/)
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() || '')
      .join('')
      .slice(0, 3) || 'DI';
  }
  const normalizedKind = normalizeId(kind);
  return normalizedKind ? normalizedKind.slice(0, 3).toUpperCase() : 'DI';
}

function createPlaceholder({ kind, subjectId, variant, reason }) {
  return Object.freeze({
    type: 'placeholder',
    placeholderType: DIRECTIVE_PACKAGE_IMAGE_PLACEHOLDER_TYPE,
    kind: normalizeId(kind),
    subjectId: normalizeId(subjectId),
    variant: normalizeId(variant) || 'card',
    label: placeholderLabel(subjectId, kind),
    reason: reason || 'missing-image'
  });
}

export function resolvePackageImage(packageData, { kind = '', subjectId = '', variant = 'card' } = {}) {
  const normalizedKind = normalizeId(kind);
  const normalizedSubjectId = normalizeId(subjectId);
  const requestedVariant = normalizeId(variant) || 'card';
  const { image, fallbackReason } = selectImage(packageData, normalizedKind, normalizedSubjectId);

  if (!image) {
    return createPlaceholder({
      kind: normalizedKind,
      subjectId: normalizedSubjectId,
      variant: requestedVariant,
      reason: fallbackReason
    });
  }

  const variants = image.variants && typeof image.variants === 'object' ? image.variants : {};
  for (const candidate of variantCandidates(requestedVariant)) {
    const path = variants[candidate] || '';
    if (path) {
      return Object.freeze({
        type: 'image',
        source: 'package',
        id: normalizeId(image.id),
        kind: normalizeId(image.kind),
        subjectId: normalizeId(image.subjectId),
        requestedKind: normalizedKind,
        requestedSubjectId: normalizedSubjectId,
        requestedVariant,
        variant: candidate,
        path,
        alt: image.alt || '',
        focalPoint: image.focalPoint || null,
        fallbackReason: candidate === requestedVariant ? fallbackReason : fallbackReason || 'variant-fallback'
      });
    }
  }

  const directPath = directImagePath(image);
  if (directPath) {
    return Object.freeze({
      type: 'image',
      source: 'package',
      id: normalizeId(image.id),
      kind: normalizeId(image.kind),
      subjectId: normalizeId(image.subjectId),
      requestedKind: normalizedKind,
      requestedSubjectId: normalizedSubjectId,
      requestedVariant,
      variant: 'source',
      path: directPath,
      alt: image.alt || '',
      focalPoint: image.focalPoint || null,
      fallbackReason: fallbackReason || 'source-path-fallback'
    });
  }

  return createPlaceholder({
    kind: normalizedKind,
    subjectId: normalizedSubjectId,
    variant: requestedVariant,
    reason: fallbackReason || 'missing-variant'
  });
}
