import assert from 'node:assert/strict';
import {
  bindReactiveHeroOrbit,
  computeHeroOrbitFrame
} from '../../src/ui/reactive-hero-orbit.js';

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach((name) => this.values.add(name)); }
  remove(...names) { names.forEach((name) => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const enabled = force === undefined ? !this.contains(name) : Boolean(force);
    if (enabled) this.add(name);
    else this.remove(name);
    return enabled;
  }
}

class FakeElement {
  constructor({ rect = { left: 0, top: 0, width: 1440, height: 500 }, scene = null } = {}) {
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = new Map();
    this.rect = rect;
    this.scene = scene;
    this.capturedPointerIds = [];
    this.styleProperties = new Map();
    this.style = {
      setProperty: (name, value) => this.styleProperties.set(String(name), String(value))
    };
  }

  addEventListener(type, handler, options = {}) {
    const listeners = this.listeners.get(type) || [];
    listeners.push({ handler, capture: options === true || options?.capture === true });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((listener) => listener.handler !== handler));
  }

  listenerCount(type) { return (this.listeners.get(type) || []).length; }

  dispatch(type, init = {}) {
    const event = {
      target: this,
      currentTarget: this,
      detail: 1,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.propagationStopped = true; },
      ...init
    };
    const listeners = [...(this.listeners.get(type) || [])]
      .sort((a, b) => Number(b.capture) - Number(a.capture));
    for (const { handler } of listeners) {
      handler(event);
      if (event.propagationStopped) break;
    }
    return event;
  }

  getBoundingClientRect() { return this.rect; }
  querySelector(selector) {
    return selector === '.directive-hero-scene-has-cruise' ? this.scene : null;
  }
  setPointerCapture(pointerId) { this.capturedPointerIds.push(pointerId); }
}

function createEnvironment({ reducedMotion = false } = {}) {
  let nextTimerId = 1;
  const animationFrames = [];
  const timers = new Map();
  return {
    matchMedia: () => ({ matches: reducedMotion }),
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    flushAnimationFrame() {
      const pending = animationFrames.splice(0);
      pending.forEach((callback) => callback());
    },
    advanceTimers(elapsed) {
      const ready = [...timers.entries()].filter(([, timer]) => timer.delay <= elapsed);
      ready.forEach(([id, timer]) => {
        timers.delete(id);
        timer.callback();
      });
    }
  };
}

function createCruiseHero(options = {}) {
  const scene = new FakeElement();
  scene.classList.add('directive-hero-scene-has-cruise');
  const hero = new FakeElement({ ...options, scene });
  return { hero, scene };
}

function touch(identifier, clientX, clientY) {
  return { identifier, clientX, clientY };
}

assert.deepEqual(computeHeroOrbitFrame({ x: 1, y: 1, width: 1440, height: 500 }), {
  background: { x: -3.5, y: -2.25 },
  far: { x: -6, y: -4 },
  near: { x: -10, y: -6 },
  ship: { x: 1, y: 0.5, roll: 0 },
  card: { yaw: 1.8, pitch: -0.6 }
}, 'full lower-right precise input must keep the ship anchored while the environment carries the orbit');

assert.deepEqual(computeHeroOrbitFrame({ x: -5, y: -3, width: 390, height: 112 }), {
  background: { x: 1.5, y: 0.504 },
  far: { x: 3, y: 2 },
  near: { x: 5, y: 3 },
  ship: { x: -0.5, y: -0.25, roll: 0 },
  card: { yaw: -1.8, pitch: 0.6 }
}, 'input and compact-hero amplitudes must clamp without collapsing the depth ordering');

assert.deepEqual(computeHeroOrbitFrame({
  x: 1, y: 1, width: 390, height: 220, response: 'touch'
}), {
  background: { x: -3, y: -1.98 },
  far: { x: -12, y: -11 },
  near: { x: -25.35, y: -19.8 },
  ship: { x: 0.5, y: 0.25, roll: 0 },
  card: { yaw: 1.8, pitch: -0.6 }
}, 'full touch input must keep strong environment parallax while sharing the anchored desktop ship response');

assert.deepEqual(computeHeroOrbitFrame({ x: 0, y: 0, width: 390, height: 112 }), {
  background: { x: 0, y: 0 },
  far: { x: 0, y: 0 },
  near: { x: 0, y: 0 },
  ship: { x: 0, y: 0, roll: 0 },
  card: { yaw: 0, pitch: 0 }
}, 'neutral input must produce a completely neutral orbit frame');

{
  const environment = createEnvironment();
  const { hero, scene } = createCruiseHero();
  assert.equal(bindReactiveHeroOrbit(hero, environment), true);
  assert.equal(hero.dataset.heroOrbitBound, 'true');
  assert.equal(hero.listenerCount('touchmove'), 0, 'idle heroes must not retain a non-passive touchmove listener');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '0px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-roll'), '0deg');

  hero.dispatch('pointermove', { pointerType: 'mouse', clientX: 1440, clientY: 500 });
  environment.flushAnimationFrame();
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-background-x'), '-3.5px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-far-x'), '-6px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '-10px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-x'), '1px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-y'), '0.5px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-roll'), '0deg');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-card-yaw'), '1.8deg');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-card-pitch'), '-0.6deg');
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), true);
  assert.equal(hero.classList.contains('is-hero-orbit-mouse'), true);

  hero.dispatch('pointerleave', { pointerType: 'mouse' });
  environment.flushAnimationFrame();
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '0px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-x'), '0px');
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), false);
  assert.equal(hero.classList.contains('is-hero-orbit-mouse'), false);
  assert.equal(bindReactiveHeroOrbit(hero, environment), false, 'duplicate binding must be rejected');
}

{
  const legacyHero = new FakeElement();
  assert.equal(bindReactiveHeroOrbit(legacyHero, createEnvironment()), false);
  assert.equal(legacyHero.dataset.heroOrbitBound, undefined);
}

{
  const environment = createEnvironment({ reducedMotion: true });
  const { hero, scene } = createCruiseHero();
  assert.equal(bindReactiveHeroOrbit(hero, environment), true);
  hero.dispatch('pointermove', { pointerType: 'mouse', clientX: 1440, clientY: 500 });
  environment.flushAnimationFrame();
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), false);
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '0px');
}

{
  const environment = createEnvironment();
  const { hero, scene } = createCruiseHero();
  bindReactiveHeroOrbit(hero, environment);
  const start = touch(11, 200, 100);
  hero.dispatch('touchstart', { touches: [start], changedTouches: [start] });
  assert.equal(hero.listenerCount('touchmove'), 1, 'single-touch custody must install one move listener');
  const dragMove = hero.dispatch('touchmove', {
    touches: [touch(11, 211, 100)],
    changedTouches: [touch(11, 211, 100)]
  });
  environment.flushAnimationFrame();
  assert.equal(dragMove.defaultPrevented, true, 'a qualifying mobile drag must immediately claim the camera gesture');
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), true);
  assert.equal(hero.listenerCount('touchmove'), 1, 'engaged custody must retain the move listener until release');
  assert.notEqual(scene.styleProperties.get('--directive-hero-orbit-near-x'), '0px');
  hero.dispatch('touchend', { touches: [], changedTouches: [touch(11, 211, 100)] });
  const syntheticClick = hero.dispatch('click', { detail: 1 });
  assert.equal(syntheticClick.defaultPrevented, true, 'an engaged drag must suppress its synthetic click');
}

{
  const environment = createEnvironment();
  const { hero } = createCruiseHero();
  bindReactiveHeroOrbit(hero, environment);
  const start = touch(12, 200, 100);
  hero.dispatch('touchstart', { touches: [start], changedTouches: [start] });
  const wobble = hero.dispatch('touchmove', {
    touches: [touch(12, 205, 100)],
    changedTouches: [touch(12, 205, 100)]
  });
  assert.equal(wobble.defaultPrevented, false, 'subthreshold movement must remain an ordinary tap gesture');
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), false);
  assert.equal(hero.listenerCount('touchmove'), 1, 'pending custody must remain available until release');
  hero.dispatch('touchend', { touches: [], changedTouches: [touch(12, 205, 100)] });
  assert.equal(hero.listenerCount('touchmove'), 0);
  const shortTapClick = hero.dispatch('click', { detail: 1 });
  assert.equal(shortTapClick.defaultPrevented, false, 'a short tap must not be suppressed');
}

{
  const environment = createEnvironment();
  const { hero, scene } = createCruiseHero();
  bindReactiveHeroOrbit(hero, environment);
  const start = touch(21, 500, 150);
  hero.dispatch('touchstart', { touches: [start], changedTouches: [start] });
  assert.equal(hero.listenerCount('touchmove'), 1);
  const moved = touch(21, 932, 350);
  const touchMove = hero.dispatch('touchmove', { touches: [moved], changedTouches: [moved] });
  environment.flushAnimationFrame();
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), true);
  const contextMenu = hero.dispatch('contextmenu');
  assert.equal(contextMenu.defaultPrevented, true, 'engaged drag must not open the context menu');
  assert.equal(touchMove.defaultPrevented, true, 'engaged movement must claim the camera gesture');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-background-x'), '-7px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-far-x'), '-24px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '-42px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-x'), '1px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-y'), '0.5px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-roll'), '0deg');

  hero.dispatch('touchend', { touches: [], changedTouches: [moved] });
  environment.flushAnimationFrame();
  assert.equal(hero.listenerCount('touchmove'), 0, 'completed custody must remove the move listener');
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), false);
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '0px');
  const syntheticClick = hero.dispatch('click', { detail: 1 });
  assert.equal(syntheticClick.defaultPrevented, true, 'an engaged hold must suppress its synthetic click');
  assert.equal(hero.dispatch('click', { detail: 1 }).defaultPrevented, false, 'click suppression must be single-use');
  environment.advanceTimers(400);
  assert.equal(hero.dispatch('contextmenu').defaultPrevented, false, 'neutral heroes must retain the normal context menu');
}

{
  const environment = createEnvironment();
  const { hero, scene } = createCruiseHero({
    rect: { left: 0, top: 0, width: 390, height: 220 }
  });
  bindReactiveHeroOrbit(hero, environment);
  const start = touch(61, 195, 110);
  hero.dispatch('touchstart', { touches: [start], changedTouches: [start] });
  const edgeward = touch(61, 280.8, 171.6);
  hero.dispatch('touchmove', { touches: [edgeward], changedTouches: [edgeward] });
  environment.flushAnimationFrame();
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-x'), '-25.35px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-near-y'), '-19.8px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-x'), '0.5px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-y'), '0.25px');
  assert.equal(scene.styleProperties.get('--directive-hero-orbit-ship-roll'), '0deg');
}

{
  const environment = createEnvironment();
  const { hero } = createCruiseHero();
  bindReactiveHeroOrbit(hero, environment);
  const first = touch(31, 100, 100);
  const second = touch(32, 120, 100);
  hero.dispatch('touchstart', { touches: [first], changedTouches: [first] });
  hero.dispatch('touchstart', { touches: [first, second], changedTouches: [second] });
  environment.advanceTimers(240);
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), false, 'multi-touch must cancel pending orbit custody');
}

{
  const environment = createEnvironment();
  const { hero } = createCruiseHero();
  bindReactiveHeroOrbit(hero, environment);
  const start = touch(41, 100, 100);
  hero.dispatch('touchstart', { touches: [start], changedTouches: [start] });
  const moved = touch(41, 111, 100);
  hero.dispatch('touchmove', { touches: [moved], changedTouches: [moved] });
  hero.dispatch('touchend', { touches: [], changedTouches: [moved] });
  assert.equal(hero.dispatch('click', { detail: 0 }).defaultPrevented, false, 'keyboard activation must never be suppressed');
  assert.equal(hero.dispatch('click', { detail: 1 }).defaultPrevented, true, 'keyboard activation must not consume pending pointer-click suppression');
}

{
  const environment = createEnvironment();
  const { hero } = createCruiseHero();
  bindReactiveHeroOrbit(hero, environment);
  hero.dispatch('pointerdown', { pointerType: 'pen', pointerId: 51, clientX: 200, clientY: 100 });
  environment.advanceTimers(240);
  assert.deepEqual(hero.capturedPointerIds, [51], 'engaged pen orbit must capture its pointer');
  hero.dispatch('pointercancel', { pointerType: 'pen', pointerId: 51 });
  environment.flushAnimationFrame();
  assert.equal(hero.classList.contains('is-hero-orbit-engaged'), false);
}

console.log('PASS reactive hero orbit controller');
