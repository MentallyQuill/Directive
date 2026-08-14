function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const LEGACY_ANCHOR_ALIASES = Object.freeze({
  forward: 'forward-sensors',
  central: 'central-saucer',
  crew: 'crew-habitat',
  department: 'central-saucer',
  system: 'engineering',
  engineering: 'engineering',
  aft: 'aft-hull',
  region: 'central-saucer',
  medical: 'sickbay',
});

const SLOT_TABLES = Object.freeze({
  desktop: Object.freeze([
    ['upper-left-outer', 0.13, 0.16],
    ['upper-left-inner', 0.16, 0.32],
    ['upper-right-outer', 0.87, 0.16],
    ['upper-right-inner', 0.84, 0.32],
    ['lower-left-outer', 0.14, 0.66],
    ['lower-left-inner', 0.18, 0.82],
    ['lower-right-outer', 0.86, 0.66],
    ['lower-right-inner', 0.82, 0.82],
  ].map(([id, x, y], index) => Object.freeze({ id, x, y, index }))),
  mobile: Object.freeze([
    ['top-left-outer', 0.10, 0.05],
    ['top-left-inner', 0.36, 0.05],
    ['top-right-inner', 0.64, 0.05],
    ['top-right-outer', 0.90, 0.05],
    ['bottom-right-outer', 0.90, 0.95],
    ['bottom-right-inner', 0.64, 0.95],
    ['bottom-left-inner', 0.36, 0.95],
    ['bottom-left-outer', 0.10, 0.95],
  ].map(([id, x, y], index) => Object.freeze({ id, x, y, index }))),
});

export function renderedContainRect(box = {}, naturalSize = {}) {
  const x = finite(box.x ?? box.left);
  const y = finite(box.y ?? box.top);
  const width = Math.max(0, finite(box.width));
  const height = Math.max(0, finite(box.height));
  const naturalWidth = Math.max(0, finite(naturalSize.width));
  const naturalHeight = Math.max(0, finite(naturalSize.height));
  if (!width || !height || !naturalWidth || !naturalHeight) return { x, y, width, height };
  const scale = Math.min(width / naturalWidth, height / naturalHeight);
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  return {
    x: x + ((width - renderedWidth) / 2),
    y: y + ((height - renderedHeight) / 2),
    width: renderedWidth,
    height: renderedHeight,
  };
}

export function resolveAnchorPoint({ anchor, anchors = {}, imageRect = {}, orbitRect = {} } = {}) {
  const requested = anchors[anchor] ? anchor : LEGACY_ANCHOR_ALIASES[anchor];
  const name = anchors[requested] ? requested : (anchors['central-saucer'] ? 'central-saucer' : 'center');
  const point = anchors[name] || { x: 0.5, y: 0.5 };
  return {
    x: finite(imageRect.x) - finite(orbitRect.x) + (finite(imageRect.width) * finite(point.x, 0.5)),
    y: finite(imageRect.y) - finite(orbitRect.y) + (finite(imageRect.height) * finite(point.y, 0.5)),
    anchor: name,
  };
}

export function controlCorners(rect = {}) {
  const x = finite(rect.x);
  const y = finite(rect.y);
  const right = x + Math.max(0, finite(rect.width));
  const bottom = y + Math.max(0, finite(rect.height));
  return [
    { id: 'top-left', x, y },
    { id: 'top-right', x: right, y },
    { id: 'bottom-left', x, y: bottom },
    { id: 'bottom-right', x: right, y: bottom },
  ];
}

function samePoint(a, b) {
  return Math.abs(finite(a?.x) - finite(b?.x)) < 0.001
    && Math.abs(finite(a?.y) - finite(b?.y)) < 0.001;
}

export function segmentsIntersect(first = [], second = []) {
  const [a, b] = first;
  const [c, d] = second;
  if (!a || !b || !c || !d) return false;
  if ([a, b].some((point) => [c, d].some((candidate) => samePoint(point, candidate)))) return false;
  const direction = (p, q, r) => ((finite(r.x) - finite(p.x)) * (finite(q.y) - finite(p.y)))
    - ((finite(q.x) - finite(p.x)) * (finite(r.y) - finite(p.y)));
  const d1 = direction(c, d, a);
  const d2 = direction(c, d, b);
  const d3 = direction(a, b, c);
  const d4 = direction(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function rectForSlot(slot, size, orbitRect) {
  const width = Math.max(1, finite(size?.width, 1));
  const height = Math.max(1, finite(size?.height, 1));
  return {
    x: (slot.x * orbitRect.width) - (width / 2),
    y: (slot.y * orbitRect.height) - (height / 2),
    width,
    height,
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function routeSegments(points) {
  return points.slice(1).map((point, index) => [points[index], point]);
}

function routesCross(a, b) {
  return routeSegments(a).some((first) => routeSegments(b).some((second) => segmentsIntersect(first, second)));
}

function distance(a, b) {
  return Math.hypot(finite(b.x) - finite(a.x), finite(b.y) - finite(a.y));
}

function createRoute(anchor, rect, imageCenter, exitDistance) {
  const outwardX = anchor.x - imageCenter.x;
  const outwardY = anchor.y - imageCenter.y;
  const outwardLength = Math.hypot(outwardX, outwardY) || 1;
  const elbow = {
    x: anchor.x + ((outwardX / outwardLength) * exitDistance),
    y: anchor.y + ((outwardY / outwardLength) * exitDistance),
  };
  return controlCorners(rect)
    .map((corner) => {
      const points = [anchor, elbow, { x: corner.x, y: corner.y }];
      return { corner: corner.id, points, length: distance(anchor, elbow) + distance(elbow, corner) };
    })
    .sort((a, b) => a.length - b.length || a.corner.localeCompare(b.corner))[0];
}

function scorePlacements(placements, orbitRect) {
  let outOfBoundsCount = 0;
  let overlapCount = 0;
  let crossingCount = 0;
  let totalLength = 0;
  let stablePreferencePenalty = 0;
  placements.forEach((placement, index) => {
    const rect = placement.controlRect;
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > orbitRect.width || rect.y + rect.height > orbitRect.height) {
      outOfBoundsCount += 1;
    }
    totalLength += placement.length;
    stablePreferencePenalty += placement.preferencePenalty;
    placements.slice(index + 1).forEach((other) => {
      if (rectsOverlap(rect, other.controlRect)) overlapCount += 1;
      if (routesCross(placement.points, other.points)) crossingCount += 1;
    });
  });
  const lexicalKey = placements.map(({ taskId, slotId, corner }) => `${taskId}:${slotId}:${corner}`).join('|');
  return {
    values: [outOfBoundsCount, overlapCount, crossingCount, totalLength, stablePreferencePenalty],
    outOfBoundsCount,
    overlapCount,
    crossingCount,
    lexicalKey,
  };
}

function betterScore(candidate, current) {
  if (!current) return true;
  for (let index = 0; index < candidate.values.length; index += 1) {
    if (Math.abs(candidate.values[index] - current.values[index]) < 0.001) continue;
    return candidate.values[index] < current.values[index];
  }
  return candidate.lexicalKey < current.lexicalKey;
}

export function createShipCalloutLayout({
  mode = 'desktop',
  orbitRect: inputOrbitRect = {},
  imageRect: inputImageRect = {},
  imageNaturalSize = {},
  anchors = {},
  shipId = '',
  tasks = [],
  controlSizes = {},
} = {}) {
  const orbitRect = {
    x: finite(inputOrbitRect.x ?? inputOrbitRect.left),
    y: finite(inputOrbitRect.y ?? inputOrbitRect.top),
    width: Math.max(0, finite(inputOrbitRect.width)),
    height: Math.max(0, finite(inputOrbitRect.height)),
  };
  const imageRect = renderedContainRect(inputImageRect, imageNaturalSize);
  const slots = SLOT_TABLES[mode] || SLOT_TABLES.desktop;
  const visibleTasks = tasks.slice(0, 5).filter((task) => task?.id);
  if (!orbitRect.width || !orbitRect.height || !visibleTasks.length) {
    return { placements: [], crossingCount: 0, overlapCount: 0, outOfBoundsCount: 0, valid: visibleTasks.length === 0 };
  }
  const imageCenter = {
    x: imageRect.x - orbitRect.x + (imageRect.width / 2),
    y: imageRect.y - orbitRect.y + (imageRect.height / 2),
  };
  const candidates = new Map();
  visibleTasks.forEach((task) => {
    const anchor = resolveAnchorPoint({ anchor: task.anchor, anchors, imageRect, orbitRect });
    const preferred = stableHash(`${shipId}:${task.id}`) % slots.length;
    candidates.set(task.id, slots.map((slot) => {
      const controlRect = rectForSlot(slot, controlSizes[task.id], orbitRect);
      const route = createRoute(anchor, controlRect, imageCenter, mode === 'mobile' ? 9 : 14);
      return {
        taskId: task.id,
        anchor: anchor.anchor,
        slotId: slot.id,
        slotIndex: slot.index,
        corner: route.corner,
        controlRect,
        points: route.points,
        length: route.length,
        preferencePenalty: (slot.index - preferred + slots.length) % slots.length,
      };
    }));
  });

  let best = null;
  const visit = (taskIndex, usedSlots, placements) => {
    if (taskIndex >= visibleTasks.length) {
      const score = scorePlacements(placements, orbitRect);
      if (betterScore(score, best?.score)) best = { placements: placements.map((placement) => ({ ...placement })), score };
      return;
    }
    const task = visibleTasks[taskIndex];
    for (const candidate of candidates.get(task.id)) {
      if (usedSlots.has(candidate.slotId)) continue;
      usedSlots.add(candidate.slotId);
      placements.push(candidate);
      visit(taskIndex + 1, usedSlots, placements);
      placements.pop();
      usedSlots.delete(candidate.slotId);
    }
  };
  visit(0, new Set(), []);
  if (!best) return { placements: [], crossingCount: 0, overlapCount: 0, outOfBoundsCount: 0, valid: false };
  return {
    placements: best.placements.map(({ length, preferencePenalty, slotIndex, ...placement }) => placement),
    crossingCount: best.score.crossingCount,
    overlapCount: best.score.overlapCount,
    outOfBoundsCount: best.score.outOfBoundsCount,
    valid: best.score.outOfBoundsCount === 0 && best.score.overlapCount === 0,
  };
}
