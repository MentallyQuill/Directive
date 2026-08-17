import { createElement } from './runtime-ui-kit.js';

const TIME_PROJECTION_KIND = 'directive.timePlayerProjection.v1';

export function createShipChronometer(time, { variant = 'campaign' } = {}) {
  if (time?.kind !== TIME_PROJECTION_KIND) return null;
  const root = createElement('section', `directive-ship-chronometer directive-ship-chronometer-${variant}`);
  root.setAttribute('aria-label', 'Current accepted ship time');
  const label = createElement('span', 'directive-ship-chronometer-label');
  label.textContent = 'Ship time';
  const clock = createElement('strong', 'directive-ship-chronometer-clock');
  clock.textContent = time.clockDisplay;
  const stardate = createElement('span', 'directive-ship-chronometer-stardate');
  stardate.textContent = `Stardate ${time.stardateDisplay}`;
  root.append(label, clock, stardate);
  return root;
}
