import { DIRECTIVE_USER_FILES_PREFIX } from '../storage/directive-storage-filenames.mjs';
import { resolvePackageImage } from '../packages/package-image-resolver.mjs';
import { createElement, createIcon } from './runtime-ui-kit.js';

export const DIRECTIVE_COMM_BADGE_ICON = 'assets/icons/comm-badge.svg';

function normalizePath(path) {
  return String(path || '').replace(/^\.?\//, '').replace(/\\/g, '/');
}

export function resolveDirectiveAssetUrl(path) {
  const raw = String(path || '').trim().replace(/\\/g, '/');
  if (raw.startsWith(DIRECTIVE_USER_FILES_PREFIX)) return raw;
  const normalized = normalizePath(raw);
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

function cssUrl(value) {
  return `url("${String(value || '').replace(/["\\]/g, '\\$&')}")`;
}

export function createDirectiveMaskIcon(path, className = '') {
  const icon = createElement('span', `directive-asset-mask-icon${className ? ` ${className}` : ''}`);
  icon.setAttribute('aria-hidden', 'true');
  icon.dataset.assetIcon = path || '';
  icon.style?.setProperty?.('--directive-asset-mask-url', cssUrl(resolveDirectiveAssetUrl(path)));
  return icon;
}

function createPlaceholderIcon(icon, iconAsset) {
  if (iconAsset) return createDirectiveMaskIcon(iconAsset);
  return createIcon(icon);
}

export function createPackageImage(packageData, query = {}, {
  className = '',
  wrapperClass = '',
  alt = '',
  label = '',
  icon = 'fa-solid fa-image',
  iconAsset = '',
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
  placeholderIcon.appendChild(createPlaceholderIcon(icon, iconAsset));
  const placeholderLabel = createElement('strong', 'directive-media-placeholder-label');
  placeholderLabel.textContent = resolved.label || initials(label || query.subjectId);
  placeholder.append(placeholderIcon, placeholderLabel);
  frame.classList.add('directive-media-frame-placeholder');
  frame.appendChild(placeholder);
  return frame;
}

export function createPlayerPortraitImage(portrait = null, {
  className = '',
  wrapperClass = '',
  label = 'Player character',
  icon = 'fa-solid fa-id-badge',
  iconAsset = DIRECTIVE_COMM_BADGE_ICON,
  loading = 'lazy'
} = {}) {
  const frame = createElement('figure', `directive-media-frame directive-player-portrait-frame${wrapperClass ? ` ${wrapperClass}` : ''}`);
  frame.dataset.mediaKind = 'player.portrait';
  frame.dataset.mediaSubject = 'player-commander';
  const path = portrait?.asset?.path || portrait?.path || '';
  if (path) {
    const image = createElement('img', `directive-media-image directive-player-portrait-image${className ? ` ${className}` : ''}`);
    image.src = resolveDirectiveAssetUrl(path);
    image.alt = portrait?.asset?.alt || label || 'Player character portrait';
    image.loading = loading;
    image.decoding = 'async';
    image.draggable = false;
    image.setAttribute('draggable', 'false');
    const focalPoint = portrait?.asset?.focalPoint;
    if (focalPoint && Number.isFinite(Number(focalPoint.x)) && Number.isFinite(Number(focalPoint.y))) {
      image.setAttribute('style', `object-position: ${Number(focalPoint.x) * 100}% ${Number(focalPoint.y) * 100}%`);
    }
    frame.appendChild(image);
    return frame;
  }

  const placeholder = createElement('div', 'directive-media-placeholder');
  const placeholderIcon = createElement('span', 'directive-media-placeholder-icon');
  placeholderIcon.appendChild(createPlaceholderIcon(icon, iconAsset));
  const placeholderLabel = createElement('strong', 'directive-media-placeholder-label');
  placeholderLabel.textContent = initials(label, 'PC');
  placeholder.append(placeholderIcon, placeholderLabel);
  frame.classList.add('directive-media-frame-placeholder');
  frame.appendChild(placeholder);
  return frame;
}

export function crewDivision(crew = {}) {
  const roleText = `${crew.billet || ''} ${crew.packageRole || ''}`.toLowerCase();
  if (/science|medical|doctor|research|counsel/.test(roleText)) return 'science';
  if (/commanding officer|executive officer|mission commander|principal mission commander|strategic authority|command authority|flight control|conn|helm|pilot/.test(roleText)) return 'command';
  if (/operations|ops|engineer|engineering|security|tactical|systems|technical/.test(roleText)) return 'operations';
  if (/captain/.test(String(crew.rank || '').toLowerCase())) return 'command';
  return 'operations';
}
