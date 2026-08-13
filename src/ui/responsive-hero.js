import { createElement } from './runtime-ui-kit.js';

const boundDocuments = new WeakSet();

function setExpanded(hero, expanded) {
  hero.classList.toggle('is-expanded', expanded);
  const control = hero.querySelector('.directive-responsive-hero-toggle');
  control?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  control?.setAttribute(
    'aria-label',
    `${expanded ? 'Collapse' : 'Expand'} ${hero.dataset.responsiveHeroLabel} image`
  );
}

function installOutsideTap(documentRoot) {
  if (!documentRoot?.addEventListener || !documentRoot?.querySelectorAll || boundDocuments.has(documentRoot)) return;
  documentRoot.addEventListener('pointerdown', (event) => {
    for (const hero of documentRoot.querySelectorAll('.directive-responsive-hero.is-expanded')) {
      if (!hero.contains(event.target)) setExpanded(hero, false);
    }
  });
  boundDocuments.add(documentRoot);
}

export function bindResponsiveHero(hero, { label, secondary = [] }) {
  hero.classList.add('directive-responsive-hero');
  hero.dataset.responsiveHeroLabel = label;
  secondary.filter(Boolean).forEach((node) => node.classList.add('directive-responsive-hero-secondary'));

  const control = createElement('button', 'directive-responsive-hero-toggle');
  control.type = 'button';
  control.setAttribute('aria-expanded', 'false');
  control.setAttribute('aria-label', `Expand ${label} image`);
  control.addEventListener('click', () => {
    setExpanded(hero, !hero.classList.contains('is-expanded'));
  });
  hero.appendChild(control);

  installOutsideTap(hero.ownerDocument || globalThis.document);
  return hero;
}
