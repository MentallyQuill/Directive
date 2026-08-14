import { resolvePackageHeroScene } from '../packages/package-hero-scene-resolver.mjs';
import { createPackageImage, resolveDirectiveAssetUrl } from './directive-media.js';
import { createElement } from './runtime-ui-kit.js';

function createSceneLayer(name, path, loading) {
  const image = createElement('img', 'directive-hero-scene-layer');
  image.dataset.heroSceneLayer = name;
  image.src = resolveDirectiveAssetUrl(path);
  image.alt = '';
  image.loading = loading;
  image.decoding = 'async';
  image.draggable = false;
  image.setAttribute('draggable', 'false');
  image.setAttribute('aria-hidden', 'true');
  return image;
}

function createStarFieldLayer(name, path) {
  const layer = createElement('span', 'directive-hero-scene-layer directive-hero-cruise-stars');
  layer.dataset.heroSceneLayer = name;
  layer.style.setProperty('--directive-hero-star-texture', `url("${resolveDirectiveAssetUrl(path)}")`);
  layer.setAttribute('aria-hidden', 'true');
  return layer;
}

export function createPackageHeroVisual(packageData, query = {}, options = {}) {
  const scene = resolvePackageHeroScene(packageData, query);
  if (!scene) return createPackageImage(packageData, query, options);

  const wrapperClass = String(options.wrapperClass || '').trim();
  const frame = createElement('figure', `directive-media-frame directive-hero-scene${wrapperClass ? ` ${wrapperClass}` : ''}`);
  frame.dataset.mediaKind = query.kind || '';
  frame.dataset.mediaSubject = query.subjectId || '';
  frame.dataset.mediaVariant = 'hero-scene';
  frame.setAttribute('role', 'img');
  frame.setAttribute('aria-label', scene.alt || options.alt || options.label || 'Animated space scene');
  const loading = options.loading || 'lazy';
  frame.appendChild(createSceneLayer('background', scene.layers.background, loading));
  frame.appendChild(createSceneLayer('stars', scene.layers.stars, loading));
  if (scene.cruise) {
    frame.classList.add('directive-hero-scene-has-cruise');
    frame.appendChild(createStarFieldLayer('stars-far', scene.cruise.farStars));
    frame.appendChild(createStarFieldLayer('stars-near', scene.cruise.nearStars));
  } else {
    frame.appendChild(createSceneLayer('stars-glow', scene.layers.stars, loading));
  }
  frame.appendChild(createSceneLayer('foreground', scene.layers.foreground, loading));
  if (scene.cruise) frame.appendChild(createSceneLayer('sunlight', scene.cruise.sunlight, loading));
  return frame;
}
