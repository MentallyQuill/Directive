export const DIRECTIVE_OVERLAY_ROOT_ID = 'directive-overlay-root';

let configuredDocument = null;
let configuredHostResolver = null;

function activeDocument(documentRef = null) {
  return documentRef || configuredDocument || (typeof document !== 'undefined' ? document : null);
}

function defaultHostForDocument(documentRef) {
  return documentRef?.getElementById?.('sheld')
    || documentRef?.querySelector?.('#chat')?.parentElement
    || documentRef?.body
    || documentRef?.documentElement
    || null;
}

function resolveOverlayHost(documentRef) {
  try {
    return configuredHostResolver?.(documentRef) || defaultHostForDocument(documentRef);
  } catch {
    return defaultHostForDocument(documentRef);
  }
}

export function configureDirectiveOverlayRoot({
  document: documentRef = null,
  resolveHost = null
} = {}) {
  configuredDocument = documentRef || configuredDocument;
  configuredHostResolver = typeof resolveHost === 'function' ? resolveHost : configuredHostResolver;
}

export function getDirectiveOverlayRoot({ document: documentRef = null } = {}) {
  const doc = activeDocument(documentRef);
  if (!doc?.createElement) return null;
  const existing = doc.getElementById?.(DIRECTIVE_OVERLAY_ROOT_ID);
  if (existing) return existing;
  const host = resolveOverlayHost(doc);
  if (!host?.appendChild) return null;
  const root = doc.createElement('div');
  root.id = DIRECTIVE_OVERLAY_ROOT_ID;
  root.className = 'directive-overlay-root';
  root.dataset.directiveOverlayRoot = 'true';
  host.appendChild(root);
  return root;
}

export function isDirectiveOverlayRoot(node) {
  return Boolean(node && node.id === DIRECTIVE_OVERLAY_ROOT_ID);
}

export function appendDirectiveOverlay(node, {
  document: documentRef = null,
  fallbackParent = null
} = {}) {
  if (!node) return null;
  const root = getDirectiveOverlayRoot({ document: documentRef });
  const parent = root || fallbackParent || activeDocument(documentRef)?.body || null;
  parent?.appendChild?.(node);
  return node;
}

export function removeDirectiveOverlay(node) {
  node?.remove?.();
}

export function closeAllDirectiveOverlays(reason = 'closed') {
  const doc = activeDocument();
  const root = doc?.getElementById?.(DIRECTIVE_OVERLAY_ROOT_ID);
  if (!root) return { closed: 0, reason };
  const children = [...(root.children || [])];
  for (const child of children) child.remove?.();
  return { closed: children.length, reason };
}
