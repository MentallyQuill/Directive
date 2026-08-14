function normalizeId(value) {
  return String(value || '').trim();
}

export function resolvePackageHeroScene(packageData, { kind = '', subjectId = '' } = {}) {
  const requestedKind = normalizeId(kind);
  const requestedSubjectId = normalizeId(subjectId);
  const images = Array.isArray(packageData?.assets?.images) ? packageData.assets.images : [];
  const image = images.find((candidate) => (
    candidate
    && typeof candidate === 'object'
    && normalizeId(candidate.kind) === requestedKind
    && normalizeId(candidate.subjectId) === requestedSubjectId
  ));
  const layers = image?.layers;
  const background = String(layers?.background || '').trim();
  const stars = String(layers?.stars || '').trim();
  const foreground = String(layers?.foreground || '').trim();
  if (!background || !stars || !foreground) return null;
  const farStars = String(layers?.cruise?.farStars || '').trim();
  const nearStars = String(layers?.cruise?.nearStars || '').trim();
  const sunlight = String(layers?.cruise?.sunlight || '').trim();
  const cruise = farStars && nearStars && sunlight
    ? Object.freeze({ farStars, nearStars, sunlight })
    : null;

  return Object.freeze({
    type: 'layered-scene',
    source: 'package',
    id: normalizeId(image.id),
    kind: requestedKind,
    subjectId: requestedSubjectId,
    alt: String(image.alt || ''),
    layers: Object.freeze({ background, stars, foreground }),
    ...(cruise ? { cruise } : {})
  });
}
