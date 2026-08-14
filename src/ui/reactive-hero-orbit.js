const PEN_HOLD_DELAY_MS = 240;
const PEN_HOLD_TOLERANCE_PX = 10;
const TOUCH_DRAG_THRESHOLD_PX = 6;
const CLICK_SUPPRESSION_MS = 400;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number(value) || 0));
const amplitude = (size, ratio, floor, ceiling) => clamp((Number(size) || 0) * ratio, floor, ceiling);
const touchAmplitude = (size, ratio, floor, ceiling) => Math.round(amplitude(size, ratio, floor, ceiling) * 10000) / 10000;
const scaled = (value, amount) => (value * amount) || 0;

export function computeHeroOrbitFrame({ x = 0, y = 0, width = 0, height = 0, response = 'precise' } = {}) {
  const normalizedX = clamp(x, -1, 1);
  const normalizedY = clamp(y, -1, 1);
  const touchResponse = response === 'touch';
  const responseScale = touchResponse ? 1 : .5;
  const safeBackgroundY = Math.round(Math.min(
    amplitude(height, .012, 2, 5),
    Math.max(0, Number(height) || 0) * .009
  ) * responseScale * 10000) / 10000;
  return {
    background: {
      x: scaled(-normalizedX, amplitude(width, .006, 3, 7) * responseScale),
      y: scaled(-normalizedY, safeBackgroundY)
    },
    far: {
      x: scaled(-normalizedX, touchResponse
        ? touchAmplitude(width, .030, 12, 24)
        : amplitude(width, .010, 6, 12) * responseScale),
      y: scaled(-normalizedY, touchResponse
        ? touchAmplitude(height, .050, 10, 20)
        : amplitude(height, .020, 4, 8) * responseScale)
    },
    near: {
      x: scaled(-normalizedX, touchResponse
        ? touchAmplitude(width, .065, 22, 42)
        : amplitude(width, .018, 10, 20) * responseScale),
      y: scaled(-normalizedY, touchResponse
        ? touchAmplitude(height, .090, 18, 34)
        : amplitude(height, .030, 6, 12) * responseScale)
    },
    ship: {
      x: scaled(normalizedX, touchResponse
        ? touchAmplitude(width, .025, 8, 16)
        : amplitude(width, .0015, 1, 2) * responseScale),
      y: scaled(normalizedY, touchResponse
        ? touchAmplitude(height, .035, 7, 14)
        : amplitude(height, .002, .5, 1) * responseScale),
      roll: scaled(normalizedX, touchResponse ? .65 : 0)
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
  let touchMoveBound = false;

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

  const setMouseResponse = (enabled) => {
    hero.classList.toggle?.('is-hero-orbit-mouse', enabled);
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
    setMouseResponse(false);
    queueFrame(neutralFrame);
  };

  const removeTouchMove = () => {
    if (!touchMoveBound) return;
    hero.removeEventListener?.('touchmove', handleTouchMove);
    touchMoveBound = false;
  };

  const resetTouch = ({ suppress = false } = {}) => {
    const wasEngaged = touchState?.engaged === true;
    clearHold();
    removeTouchMove();
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

  const frameFromDrag = (clientX, clientY, state, response = 'precise') => {
    const rect = hero.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return neutralFrame;
    const touchResponse = response === 'touch';
    return computeHeroOrbitFrame({
      x: (clientX - state.originX) / (rect.width * (touchResponse ? .22 : .30)),
      y: (clientY - state.originY) / (rect.height * (touchResponse ? .28 : .40)),
      width: rect.width,
      height: rect.height,
      response
    });
  };

  hero.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'pen') {
      if (!penState || event.pointerId !== penState.pointerId) return;
      penState.currentX = event.clientX;
      penState.currentY = event.clientY;
      if (!penState.engaged) {
        if (Math.hypot(event.clientX - penState.startX, event.clientY - penState.startY) > PEN_HOLD_TOLERANCE_PX) {
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
    setMouseResponse(true);
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
      setMouseResponse(false);
      setEngaged(true);
      try { hero.setPointerCapture?.(penState.pointerId); } catch { /* Synthetic pen input may not expose an active pointer. */ }
    }, PEN_HOLD_DELAY_MS);
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
    hero.addEventListener('touchmove', handleTouchMove, { passive: false });
    touchMoveBound = true;
  });

  function handleTouchMove(event) {
    if (!touchState) return;
    const activeTouch = findTouch(event.touches, touchState.identifier);
    if (!activeTouch) return resetTouch();
    touchState.currentX = activeTouch.clientX;
    touchState.currentY = activeTouch.clientY;
    if (!touchState.engaged) {
      if (Math.hypot(activeTouch.clientX - touchState.startX, activeTouch.clientY - touchState.startY) < TOUCH_DRAG_THRESHOLD_PX) return;
      touchState.engaged = true;
      setMouseResponse(false);
      setEngaged(true);
    }
    event.preventDefault?.();
    queueFrame(frameFromDrag(activeTouch.clientX, activeTouch.clientY, touchState, 'touch'));
  }

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
