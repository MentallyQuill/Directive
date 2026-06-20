import { resolvePackageImage } from '../packages/package-image-resolver.mjs';
import { createElement, createIcon } from './runtime-ui-kit.js';

function normalizePath(path) {
  return String(path || '').replace(/^\.?\//, '').replace(/\\/g, '/');
}

export function resolveDirectiveAssetUrl(path) {
  const normalized = normalizePath(path);
  if (!normalized) return '';
  if (/^(?:https?:|data:|blob:)/i.test(normalized)) return normalized;
  try {
    return new URL(`../../${normalized}`, import.meta.url).href;
  } catch {
    return normalized;
  }
}

function initials(value, fallback = 'DI') {
  const label = String(value || '').trim();
  if (!label) return fallback;
  return label
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 3) || fallback;
}

export function createPackageImage(packageData, query = {}, {
  className = '',
  wrapperClass = '',
  alt = '',
  label = '',
  icon = 'fa-solid fa-image',
  loading = 'lazy'
} = {}) {
  const resolved = resolvePackageImage(packageData, query);
  const frame = createElement('figure', `directive-media-frame${wrapperClass ? ` ${wrapperClass}` : ''}`);
  frame.dataset.mediaKind = query.kind || '';
  frame.dataset.mediaSubject = query.subjectId || '';
  frame.dataset.mediaVariant = resolved.variant || query.variant || '';

  if (resolved.type === 'image' && resolved.path) {
    const image = createElement('img', `directive-media-image${className ? ` ${className}` : ''}`);
    image.src = resolveDirectiveAssetUrl(resolved.path);
    image.alt = resolved.alt || alt || label || '';
    image.loading = loading;
    image.decoding = 'async';
    image.draggable = false;
    image.setAttribute('draggable', 'false');
    if (resolved.focalPoint && Number.isFinite(Number(resolved.focalPoint.x)) && Number.isFinite(Number(resolved.focalPoint.y))) {
      image.setAttribute('style', `object-position: ${Number(resolved.focalPoint.x) * 100}% ${Number(resolved.focalPoint.y) * 100}%`);
    }
    frame.appendChild(image);
    return frame;
  }

  const placeholder = createElement('div', 'directive-media-placeholder');
  const placeholderIcon = createElement('span', 'directive-media-placeholder-icon');
  placeholderIcon.appendChild(createIcon(icon));
  const placeholderLabel = createElement('strong', 'directive-media-placeholder-label');
  placeholderLabel.textContent = resolved.label || initials(label || query.subjectId);
  placeholder.append(placeholderIcon, placeholderLabel);
  frame.classList.add('directive-media-frame-placeholder');
  frame.appendChild(placeholder);
  return frame;
}

export function crewDivision(crew = {}) {
  const text = `${crew.rank || ''} ${crew.billet || ''} ${crew.packageRole || ''}`.toLowerCase();
  if (/captain|commander|commanding officer|executive officer|strategic authority/.test(text)) return 'command';
  if (/science|medical|doctor|research|counsel/.test(text)) return 'science';
  return 'operations';
}

export function createDivisionMark(division = 'operations', label = '') {
  const mark = createElement('span', `directive-division-mark directive-division-${division}`);
  mark.setAttribute('aria-hidden', 'true');
  if (label) mark.title = label;
  return mark;
}
