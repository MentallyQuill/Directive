const HOLD_DELAY_MS = 240;
const HOLD_TOLERANCE_PX = 10;
const CLICK_SUPPRESSION_MS = 400;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));
const amplitude = (size, ratio, floor, ceiling) => clamp((Number(size) || 0) * ratio, floor, ceiling);
const scaled = (value, amount) => (value * amount) || 0;

export function computeHeroOrbitFrame({ x = 0, y = 0, width = 0, height = 0 } = {}) {
  const normalizedX = clamp(x, -1, 1);
  const normalizedY = clamp(y, -1, 1);
  return {
    background: {
      x: scaled(-normalizedX, amplitude(width, .006, 3, 7)),
      y: scaled(-normalizedY, amplitude(height, .012, 2, 5))
    },
    far: {
      x: scaled(-normalizedX, amplitude(width, .010, 6, 12)),
      y: scaled(-normalizedY, amplitude(height, .020, 4, 8))
    },
    near: {
      x: scaled(-normalizedX, amplitude(width, .018, 10, 20)),
      y: scaled(-normalizedY, amplitude(height, .030, 6, 12))
    },
    ship: {
      x: scaled(normalizedX, amplitude(width, .0065, 3, 8)),
      y: scaled(normalizedY, amplitude(height, .012, 2, 5)),
      roll: scaled(normalizedX, .22)
    }
  };
}

function cssNumber(value, unit) {
  const rounded = Math.round((Number(value) || 0) * 1000) / 1000;
  return `${Object.is(rounded, -0) ? 0 : rounded}${unit}`;
}

function writeFrame(scene, frame) {
  scene.style.setProperty('--directive-hero-orbit-background-x', cssNumber(frame.background.x, 'px'));
  scene.style.setProperty('--directive-hero-orbit-background-y', cssNumber(frame.background.y, 'px'));
  scene.style.setProperty('--directive-hero-orbit-far-x', cssNumber(frame.far.x, 'px'));
  scene.style.setProperty('--directive-hero-orbit-far-y', cssNumber(frame.far.y, 'px'));
  scene.style.setProperty('--directive-hero-orbit-near-x', cssNumber(frame.near.x, 'px'));
  scene.style.setProperty('--directive-hero-orbit-near-y', cssNumber(frame.near.y, 'px'));
  scene.style.setProperty('--directive-hero-orbit-ship-x', cssNumber(frame.ship.x, 'px'));
  scene.style.setProperty('--directive-hero-orbit-ship-y', cssNumber(frame.ship.y, 'px'));
  scene.style.setProperty('--directive-hero-orbit-ship-roll', cssNumber(frame.ship.roll, 'deg'));
}

function findTouch(touches, identifier) {
  return [...(touches || [])].find((candidate) => candidate.identifier === identifier) || null;
}

export function bindReactiveHeroOrbit(hero, environment = globalThis) {
  const scene = hero?.querySelector?.('.directive-hero-scene-has-cruise');
  if (!scene || hero.dataset?.heroOrbitBound === 'true' || typeof hero.addEventListener !== 'function') return false;

  hero.dataset.heroOrbitBound = 'true';
  const neutralFrame = computeHeroOrbitFrame();
  writeFrame(scene, neutralFrame);

  const setTimer = (callback, delay) => {
    const timer = environment?.setTimeout || globalThis.setTimeout;
    return timer.call(environment, callback, delay);
  };
  const clearTimer = (timerId) => {
    if (timerId == null) return;
    const clear = environment?.clearTimeout || globalThis.clearTimeout;
    clear.call(environment, timerId);
  };
  const requestFrame = environment?.requestAnimationFrame
    ? (callback) => environment.requestAnimationFrame(callback)
    : (callback) => callback();
  const reducedMotion = () => environment?.matchMedia?.(REDUCED_MOTION_QUERY)?.matches === true;

  let scheduled = false;
  let nextFrame = neutralFrame;
  let holdTimer = null;
  let touchState = null;
  let penState = null;
  let suppressClick = false;
  let suppressionTimer = null;

  const queueFrame = (frame) => {
    nextFrame = frame;
    if (scheduled) return;
    scheduled = true;
    requestFrame(() => {
      scheduled = false;
      writeFrame(scene, nextFrame);
    });
  };

  const setEngaged = (engaged) => {
    hero.classList.toggle?.('is-hero-orbit-engaged', engaged);
  };

  const clearHold = () => {
    clearTimer(holdTimer);
    holdTimer = null;
  };

  const armClickSuppression = () => {
    suppressClick = true;
    clearTimer(suppressionTimer);
    suppressionTimer = setTimer(() => {
      suppressClick = false;
      suppressionTimer = null;
    }, CLICK_SUPPRESSION_MS);
  };

  const resetVisual = () => {
    setEngaged(false);
    queueFrame(neutralFrame);
  };

  const resetTouch = ({ suppress = false } = {}) => {
    const wasEngaged = touchState?.engaged === true;
    clearHold();
    touchState = null;
    resetVisual();
    if (suppress && wasEngaged) armClickSuppression();
  };

  const resetPen = ({ suppress = false } = {}) => {
    const wasEngaged = penState?.engaged === true;
    clearHold();
    penState = null;
    resetVisual();
    if (suppress && wasEngaged) armClickSuppression();
  };

  const frameFromMouse = (event) => {
    const rect = hero.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return neutralFrame;
    return computeHeroOrbitFrame({
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
      width: rect.width,
      height: rect.height
    });
  };

  const frameFromDrag = (clientX, clientY, state) => {
    const rect = hero.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return neutralFrame;
    return computeHeroOrbitFrame({
      x: (clientX - state.originX) / (rect.width * .30),
      y: (clientY - state.originY) / (rect.height * .40),
      width: rect.width,
      height: rect.height
    });
  };

  hero.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'pen') {
      if (!penState || event.pointerId !== penState.pointerId) return;
      penState.currentX = event.clientX;
      penState.currentY = event.clientY;
      if (!penState.engaged) {
        if (Math.hypot(event.clientX - penState.startX, event.clientY - penState.startY) > HOLD_TOLERANCE_PX) {
          resetPen();
        }
        return;
      }
      event.preventDefault?.();
      queueFrame(frameFromDrag(event.clientX, event.clientY, penState));
      return;
    }
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (reducedMotion()) {
      resetVisual();
      return;
    }
    setEngaged(true);
    queueFrame(frameFromMouse(event));
  });

  hero.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'pen' || reducedMotion()) return;
    resetTouch();
    resetPen();
    penState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      engaged: false
    };
    holdTimer = setTimer(() => {
      holdTimer = null;
      if (!penState || reducedMotion()) return resetPen();
      penState.engaged = true;
      penState.originX = penState.currentX;
      penState.originY = penState.currentY;
      setEngaged(true);
      try { hero.setPointerCapture?.(penState.pointerId); } catch { /* Synthetic pen input may not expose an active pointer. */ }
    }, HOLD_DELAY_MS);
  });

  hero.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'pen' && penState?.pointerId === event.pointerId) resetPen({ suppress: true });
  });
  hero.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'pen' && penState?.pointerId === event.pointerId) resetPen();
    else if (!event.pointerType || event.pointerType === 'mouse') resetVisual();
  });
  hero.addEventListener('pointerleave', (event) => {
    if (!event.pointerType || event.pointerType === 'mouse') resetVisual();
  });

  hero.addEventListener('touchstart', (event) => {
    if (reducedMotion()) return resetTouch();
    if (event.touches?.length !== 1) return resetTouch();
    resetPen();
    resetTouch();
    const activeTouch = event.touches[0];
    touchState = {
      identifier: activeTouch.identifier,
      startX: activeTouch.clientX,
      startY: activeTouch.clientY,
      currentX: activeTouch.clientX,
      currentY: activeTouch.clientY,
      originX: activeTouch.clientX,
      originY: activeTouch.clientY,
      engaged: false
    };
    holdTimer = setTimer(() => {
      holdTimer = null;
      if (!touchState || reducedMotion()) return resetTouch();
      touchState.engaged = true;
      touchState.originX = touchState.currentX;
      touchState.originY = touchState.currentY;
      setEngaged(true);
    }, HOLD_DELAY_MS);
  });

  hero.addEventListener('touchmove', (event) => {
    if (!touchState) return;
    const activeTouch = findTouch(event.touches, touchState.identifier);
    if (!activeTouch) return resetTouch();
    touchState.currentX = activeTouch.clientX;
    touchState.currentY = activeTouch.clientY;
    if (!touchState.engaged) {
      if (Math.hypot(activeTouch.clientX - touchState.startX, activeTouch.clientY - touchState.startY) > HOLD_TOLERANCE_PX) {
        resetTouch();
      }
      return;
    }
    event.preventDefault?.();
    queueFrame(frameFromDrag(activeTouch.clientX, activeTouch.clientY, touchState));
  }, { passive: false });

  hero.addEventListener('touchend', (event) => {
    if (touchState && findTouch(event.changedTouches, touchState.identifier)) resetTouch({ suppress: true });
  });
  hero.addEventListener('touchcancel', () => resetTouch());

  hero.addEventListener('click', (event) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    clearTimer(suppressionTimer);
    suppressionTimer = null;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  }, true);

  hero.addEventListener('contextmenu', (event) => {
    if (touchState?.engaged || penState?.engaged) event.preventDefault?.();
  });

  return true;
}
