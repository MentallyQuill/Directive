import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = 55000 + (process.pid % 9000);
const baseUrl = `http://127.0.0.1:${port}`;
const artifactRoot = path.join(repoRoot, 'artifacts', 'cohesion-ship-visual');
const viewports = [
  { width: 1440, height: 900, label: 'desktop' },
  { width: 1024, height: 768, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
  { width: 360, height: 500, label: 'compact-mobile' },
];

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch(`${baseUrl}/production?route=ship`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Cohesion Ship preview server did not start.');
}

const server = spawn(process.execPath, ['tools/scripts/serve-expanded-interface-preview.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, DIRECTIVE_MOCKUP_PORT: String(port) },
  stdio: ['ignore', 'ignore', 'inherit'],
});
const browser = await chromium.launch({ headless: true });

try {
  await waitForServer();
  await mkdir(artifactRoot, { recursive: true });
  for (const icon of ['personnel', 'coordination', 'training', 'systems', 'life']) {
    const response = await fetch(`${baseUrl}/assets/icons/cohesion-task-categories/${icon}.svg`);
    assert.equal(response.ok, true, `${icon} task icon asset loads`);
    assert.match(await response.text(), /<svg\b/, `${icon} task icon asset is SVG`);
  }
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(`${baseUrl}/production?route=ship`);
    await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
    await page.waitForSelector('.ship-cohesion-workspace');
    assert.deepEqual(pageErrors, [], `${viewport.label} page errors`);
    assert.equal(await page.locator('.ship-hero, .ship-board, .ship-system-card, .ship-operational-status').count(), 0);
    assert.equal(await page.locator('.ship-cohesion-segment').count(), 20);
    assert.equal(
      await page.locator('.ship-cohesion-segment.is-filled').first().evaluate((segment) => (
        segment.getAnimations().some(({ animationName }) => animationName === 'ship-cohesion-blue-wave')
      )),
      true,
      `${viewport.label} filled segments carry the blue wave`,
    );
    const previewMotion = await page.locator('.ship-cohesion-segment.is-preview').evaluateAll((segments) => segments.map((segment) => {
      const animation = segment.getAnimations().find(({ animationName }) => animationName === 'ship-cohesion-preview-pulse');
      return animation ? { duration: animation.effect.getTiming().duration, delay: animation.effect.getTiming().delay } : null;
    }));
    assert.equal(previewMotion.every(Boolean), true, `${viewport.label} preview segments pulse`);
    assert.equal(previewMotion.every(({ duration, delay }) => duration === 2000 && delay === 0), true, `${viewport.label} preview pulse is synchronized at 0.5 Hz`);
    const motionProfile = await page.evaluate(() => {
      const resolveRgb = (value) => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.append(probe);
        const channels = getComputedStyle(probe).color.match(/[\d.]+/g)?.slice(0, 3).map(Number) || [];
        probe.remove();
        return channels;
      };
      const relativeLuminance = (channels) => channels
        .map((channel) => channel / 255)
        .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const dropShadowBlurRadii = (filter = '') => [...filter.matchAll(
        /drop-shadow\((?:rgba?\([^)]+\)|#[\da-f]{3,8}|[a-z]+)\s+-?[\d.]+px\s+-?[\d.]+px(?:\s+(-?[\d.]+)px)?/gi,
      )].map((match) => Number(match[1] || 0));
      const summarizeBacklight = (segment, animationName) => {
        const animation = segment?.getAnimations().find((candidate) => candidate.animationName === animationName);
        const baseColor = segment ? getComputedStyle(segment).color : '';
        const frames = animation?.effect.getKeyframes().map((frame) => {
          const channels = resolveRgb(frame.color || baseColor);
          return {
            channels,
            luminance: relativeLuminance(channels),
            blurRadii: dropShadowBlurRadii(frame.filter),
          };
        }) || [];
        return {
          trough: frames.reduce((minimum, frame) => (frame.luminance < minimum.luminance ? frame : minimum)),
          crest: frames.reduce((maximum, frame) => (frame.luminance > maximum.luminance ? frame : maximum)),
          maxBlur: Math.max(...frames.flatMap(({ blurRadii }) => blurRadii), 0),
        };
      };
      const filled = [...document.querySelectorAll('.ship-cohesion-segment.is-filled')].map((segment) => {
        const animation = segment.getAnimations().find(({ animationName }) => animationName === 'ship-cohesion-blue-wave');
        return {
          index: Number(segment.dataset.segmentIndex),
          duration: animation?.effect.getTiming().duration,
          delay: animation?.effect.getTiming().delay,
          offsets: animation?.effect.getKeyframes().map(({ offset }) => offset),
          transforms: animation?.effect.getKeyframes().map(({ transform }) => transform).filter(Boolean),
        };
      });
      const debtAnimations = [...document.querySelectorAll('.ship-cohesion-segment.is-debt:not(.is-preview)')]
        .flatMap((segment) => segment.getAnimations().map(({ animationName }) => animationName));
      const previewTransforms = document.querySelector('.ship-cohesion-segment.is-preview')
        ?.getAnimations().find(({ animationName }) => animationName === 'ship-cohesion-preview-pulse')
        ?.effect.getKeyframes().map(({ transform }) => transform).filter(Boolean) || [];
      const blueBacklight = summarizeBacklight(
        document.querySelector('.ship-cohesion-segment.is-filled:not(.is-preview)'),
        'ship-cohesion-blue-wave',
      );
      const amberBacklight = summarizeBacklight(
        document.querySelector('.ship-cohesion-segment.is-preview'),
        'ship-cohesion-preview-pulse',
      );
      return { filled, debtAnimations, previewTransforms, blueBacklight, amberBacklight };
    });
    assert.equal(motionProfile.debtAnimations.length, 0, `${viewport.label} debt remains static`);
    assert.equal(motionProfile.filled.every(({ duration }) => duration === 10000), true, `${viewport.label} wave completes in ten seconds`);
    assert.equal(
      motionProfile.filled.slice(1).every(({ delay }, index) => delay - motionProfile.filled[index].delay === -500),
      true,
      `${viewport.label} wave advances counterclockwise every half second`,
    );
    assert.deepEqual(motionProfile.filled[0].offsets, [0, 0.05, 0.1, 1], `${viewport.label} blue pulse spans two stagger intervals`);
    assert.equal(
      [...motionProfile.filled.flatMap(({ transforms }) => transforms), ...motionProfile.previewTransforms]
        .every((transform) => !/scale\((?!1(?:\.0{1,2})?\)|1\.0[12]\))/.test(transform)),
      true,
      `${viewport.label} segment scale stays at or below 1.02`,
    );
    assert.equal(
      motionProfile.blueBacklight.trough.luminance / motionProfile.blueBacklight.crest.luminance <= 0.55,
      true,
      `${viewport.label} blue face carries a wide backlight contrast range`,
    );
    assert.equal(
      motionProfile.blueBacklight.trough.channels.every((channel, index) => channel >= [139, 181, 244][index]),
      true,
      `${viewport.label} blue trough preserves its original full color`,
    );
    assert.equal(
      motionProfile.blueBacklight.crest.channels.every((channel) => channel >= 238),
      true,
      `${viewport.label} blue crest reaches icy near-white`,
    );
    assert.equal(motionProfile.blueBacklight.maxBlur <= 2, true, `${viewport.label} blue glow stays edge-tight`);
    assert.equal(
      motionProfile.amberBacklight.crest.channels[0] >= 248
        && motionProfile.amberBacklight.crest.channels[1] >= 225
        && motionProfile.amberBacklight.crest.channels[2] >= 200,
      true,
      `${viewport.label} amber crest reaches warm near-white`,
    );
    assert.equal(
      motionProfile.amberBacklight.trough.channels.every((channel, index) => channel >= [255, 162, 79][index]),
      true,
      `${viewport.label} amber trough preserves its original full color`,
    );
    assert.equal(motionProfile.amberBacklight.maxBlur <= 2, true, `${viewport.label} amber glow stays edge-tight`);
    assert.equal(await page.locator('.ship-cohesion-ring-layer.is-back .ship-cohesion-segment').count(), 10);
    assert.equal(await page.locator('.ship-cohesion-ring-layer.is-front .ship-cohesion-segment').count(), 10);
    assert.equal(await page.locator('.ship-cohesion-segment-shape').count(), 40);
    assert.equal(
      await page.locator('.ship-cohesion-segment').evaluateAll((segments) => segments.every((segment) => segment.tagName === 'g')),
      true,
      `${viewport.label} ring retains logical SVG segment groups`,
    );
    assert.equal(
      await page.locator('.ship-cohesion-segment-shape').evaluateAll((shapes) => shapes.every((shape) => {
        const path = shape.getAttribute('d') || '';
        return shape.tagName === 'path'
          && path.trim().endsWith('Z')
          && (path.match(/\bA\b/g) || []).length === 2
          && (path.match(/\bQ\b/g) || []).length === 4;
      })),
      true,
      `${viewport.label} ring uses closed rounded annular sectors`,
    );
    assert.equal(await page.locator('.ship-task-button').count(), 5);
    assert.equal(await page.locator('.ship-task-mobile-callout').count(), 5);
    assert.equal(await page.locator('.ship-task-mobile-panel').count(), 5);
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 0);
    assert.equal(await page.locator('.ship-task-button .ship-task-category-icon').count(), 5);
    assert.equal(await page.locator('.ship-task-detail .ship-task-category-icon').count(), 1);
    assert.deepEqual(
      await page.locator('.ship-task-button .ship-task-category-icon').evaluateAll((icons) => icons.map((icon) => icon.dataset.category)),
      ['systems', 'systems', 'personnel', 'coordination', 'shipboardLife'],
      `${viewport.label} task cards use primary-family icons`,
    );
    assert.equal(
      await page.locator('.ship-task-category-icon').evaluateAll((icons) => icons.every((icon) => icon.getAttribute('aria-hidden') === 'true')),
      true,
      `${viewport.label} decorative task icons stay out of the accessibility tree`,
    );
    const desktopCalloutContract = await page.locator('.ship-task-button').evaluateAll((buttons) => buttons.map((button) => {
      const style = getComputedStyle(button);
      const level = button.querySelector('.ship-task-desktop-level');
      return {
        width: button.getBoundingClientRect().width,
        maxWidth: style.maxWidth,
        clipPath: style.clipPath,
        levelText: level?.textContent || '',
        levelDisplay: level ? getComputedStyle(level).display : 'missing',
      };
    }));
    if (viewport.width > 820) {
      assert.equal(desktopCalloutContract.every(({ levelText }) => /^L\d+$/.test(levelText)), true);
      assert.equal(desktopCalloutContract.every(({ levelDisplay }) => levelDisplay !== 'none'), true);
      assert.equal(desktopCalloutContract.every(({ width }) => width >= 120 && width <= 205.5), true);
      assert.equal(desktopCalloutContract.every(({ maxWidth }) => maxWidth === '205px'), true);
      assert.equal(desktopCalloutContract.every(({ clipPath }) => clipPath !== 'none'), true);
      assert.ok(
        new Set(desktopCalloutContract.map(({ width }) => Math.round(width))).size > 1,
        `${viewport.label} title widths produce varied callouts`,
      );
    } else {
      assert.equal(desktopCalloutContract.every(({ levelDisplay }) => levelDisplay === 'none'), true);
      assert.equal(desktopCalloutContract.every(({ clipPath }) => clipPath === 'none'), true);
    }
    assert.equal(await page.locator('.ship-task-detail').count(), 1);
    assert.match(await page.locator('.ship-cohesion-backlog').textContent(), /3 additional assignments queued/);

    const geometry = await page.evaluate(() => {
      const workspace = document.querySelector('.ship-cohesion-workspace');
      const header = document.querySelector('.ship-cohesion-header');
      const orbit = document.querySelector('.ship-cohesion-orbit');
      const visual = document.querySelector('.ship-cohesion-visual');
      const image = visual.querySelector('img');
      const detail = document.querySelector('.ship-task-detail');
      const nav = document.querySelector('.ship-task-nav');
      const button = document.querySelector('.ship-task-button');
      const leader = document.querySelector('.ship-task-leaders');
      const backLayer = document.querySelector('.ship-cohesion-ring-layer.is-back');
      const frontLayer = document.querySelector('.ship-cohesion-ring-layer.is-front');
      const segments = [...document.querySelectorAll('.ship-cohesion-segment')];
      const shapes = [...document.querySelectorAll('.ship-cohesion-segment-shape')];
      const visibleShapes = shapes.filter((shape) => getComputedStyle(shape).display !== 'none');
      const firstShapeStyle = getComputedStyle(visibleShapes[0]);
      const screenPoint = (path, length) => {
        const point = path.getPointAtLength(length);
        const matrix = path.getScreenCTM();
        return { x: (point.x * matrix.a) + (point.y * matrix.c) + matrix.e, y: (point.x * matrix.b) + (point.y * matrix.d) + matrix.f };
      };
      const orbitBox = orbit.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const visualBox = visual.getBoundingClientRect();
      const detailBox = detail.getBoundingClientRect();
      const navBox = nav.getBoundingClientRect();
      const backBox = backLayer.getBoundingClientRect();
      const frontBox = frontLayer.getBoundingClientRect();
      const center = (box) => ({ x: box.left + (box.width / 2), y: box.top + (box.height / 2) });
      const ringCenter = center(backBox);
      const visualCenter = center(visualBox);
      const samplePath = visibleShapes[0];
      const sampleLength = samplePath.getTotalLength();
      const queuedShape = visibleShapes.find((shape) => shape.parentElement?.classList.contains('is-queued'));
      const radii = Array.from({ length: 401 }, (_, index) => {
        const sample = screenPoint(samplePath, sampleLength * (index / 400));
        return Math.hypot(sample.x - ringCenter.x, sample.y - ringCenter.y);
      });
      const normalizedRadii = Array.from({ length: 401 }, (_, index) => {
        const sample = samplePath.getPointAtLength(sampleLength * (index / 400));
        return Math.hypot(sample.x - 50, sample.y - 50);
      });
      const visibleVariants = new Set(visibleShapes.map((shape) => (shape.classList.contains('is-mobile') ? 'mobile' : 'desktop')));
      const zIndex = (node) => Number.parseInt(getComputedStyle(node).zIndex, 10) || 0;
      return {
        workspaceOverflowY: getComputedStyle(workspace).overflowY,
        workspaceHorizontalOverflow: workspace.scrollWidth > workspace.clientWidth + .5,
        documentHorizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + .5,
        visualRatio: visualBox.width / orbitBox.width,
        detailBelowOrbit: detailBox.top >= orbitBox.bottom - .5,
        imageNatural: [image?.naturalWidth || 0, image?.naturalHeight || 0],
        leaderDisplay: getComputedStyle(leader).display,
        sharedDetailDisplay: getComputedStyle(detail).display,
        navPosition: getComputedStyle(nav).position,
        buttonPosition: getComputedStyle(button).position,
        buttonHeight: button.getBoundingClientRect().height,
        visibleShapeCount: visibleShapes.length,
        variant: visibleVariants.size === 1 ? [...visibleVariants][0] : 'mixed',
        pathClosed: visibleShapes.every((shape) => (shape.getAttribute('d') || '').trim().endsWith('Z')),
        hasRoundLinecap: visibleShapes.some((shape) => getComputedStyle(shape).strokeLinecap === 'round'),
        shapeFill: firstShapeStyle.fill,
        queuedStrokeDasharray: queuedShape ? getComputedStyle(queuedShape).strokeDasharray : 'none',
        bandThickness: Math.max(...radii) - Math.min(...radii),
        normalizedBandThickness: Math.max(...normalizedRadii) - Math.min(...normalizedRadii),
        ringTopInsideOrbit: backBox.top >= orbitBox.top - .5,
        ringBelowHeader: backBox.top >= headerBox.bottom - .5,
        ringAboveTasks: backBox.bottom <= navBox.top + .5,
        ringLayerDelta: Math.hypot(backBox.left - frontBox.left, backBox.top - frontBox.top),
        ringShipCenterDelta: Math.hypot(ringCenter.x - visualCenter.x, ringCenter.y - visualCenter.y),
        stacking: {
          back: zIndex(backLayer), ship: zIndex(visual), front: zIndex(frontLayer),
          leaders: zIndex(leader), tasks: zIndex(nav),
        },
      };
    });
    assert.match(geometry.workspaceOverflowY, /auto|scroll/);
    assert.equal(geometry.workspaceHorizontalOverflow, false, `${viewport.label} workspace overflow-x`);
    assert.equal(geometry.documentHorizontalOverflow, false, `${viewport.label} document overflow-x`);
    assert.deepEqual(geometry.imageNatural, [1672, 941]);
    assert.equal(geometry.visibleShapeCount, 20, `${viewport.label} visible segment shapes`);
    assert.equal(geometry.variant, viewport.width <= 820 ? 'mobile' : 'desktop', `${viewport.label} responsive segment geometry`);
    assert.equal(geometry.pathClosed, true, `${viewport.label} uses closed annular sectors`);
    assert.equal(geometry.hasRoundLinecap, false, `${viewport.label} has no pill caps`);
    assert.notEqual(geometry.shapeFill, 'none', `${viewport.label} segment shape is filled`);
    assert.equal(geometry.queuedStrokeDasharray, 'none', `${viewport.label} queued segment edges remain solid`);
    assert.ok(
      geometry.normalizedBandThickness >= 3.1 && geometry.normalizedBandThickness <= 3.3,
      `${viewport.label} ring band keeps the shared desktop proportion (actual ${geometry.normalizedBandThickness.toFixed(2)} units)`,
    );
    const physicalBandRange = viewport.width <= 820 ? [6, 9] : [13, 17];
    assert.ok(
      geometry.bandThickness >= physicalBandRange[0] && geometry.bandThickness <= physicalBandRange[1],
      `${viewport.label} ring band scales with its circle (actual ${geometry.bandThickness.toFixed(2)}px)`,
    );
    assert.ok(geometry.ringLayerDelta <= .5, `${viewport.label} ring layers remain synchronized`);
    if (viewport.width > 820) {
      assert.equal(geometry.detailBelowOrbit, true, `${viewport.label} detail panel must remain below the ship`);
      assert.ok(geometry.visualRatio >= .89, `${viewport.label} ship graphic uses at least 89% of the orbit width`);
      assert.notEqual(geometry.leaderDisplay, 'none');
      assert.equal(await page.locator('.ship-task-leader').count(), 5);
      assert.equal(
        await page.locator('.ship-task-leader').evaluateAll((leaders) => leaders.every((leader) => {
          const points = (leader.getAttribute('points') || '').trim().split(/\s+/);
          return leader.dataset.slot && leader.dataset.corner && points.length === 3
            && points.every((point) => point.split(',').every((value) => Number.isFinite(Number(value))));
        })),
        true,
        `${viewport.label} measured leader geometry`,
      );
      assert.equal(
        await page.locator('.ship-task-button').evaluateAll((buttons) => buttons.every((button) => button.dataset.slot)),
        true,
        `${viewport.label} measured card slots`,
      );
      assert.equal(geometry.navPosition, 'absolute');
      assert.equal(geometry.buttonPosition, 'absolute');
      assert.ok(
        geometry.stacking.back < geometry.stacking.ship
          && geometry.stacking.ship < geometry.stacking.front
          && geometry.stacking.front < geometry.stacking.leaders
          && geometry.stacking.leaders < geometry.stacking.tasks,
        `${viewport.label} ring passes behind and in front of the ship`,
      );
    } else {
      assert.notEqual(geometry.leaderDisplay, 'none');
      assert.equal(await page.locator('.ship-task-leader').count(), 5);
      assert.equal(
        await page.locator('.ship-task-mobile-callout').evaluateAll((badges) => badges.every((badge) => {
          const style = getComputedStyle(badge);
          return style.display !== 'none' && badge.dataset.slot && badge.dataset.corner;
        })),
        true,
        `${viewport.label} measured mobile badges`,
      );
      assert.equal(geometry.navPosition, 'static');
      assert.equal(geometry.buttonPosition, 'static');
      assert.equal(geometry.sharedDetailDisplay, 'none');
      assert.ok(geometry.buttonHeight >= 44 && geometry.buttonHeight <= 72, `${viewport.label} compact task touch target`);
      assert.equal(geometry.ringTopInsideOrbit, true, `${viewport.label} ring stays inside its canvas`);
      assert.equal(geometry.ringBelowHeader, true, `${viewport.label} ring stays below the ship title`);
      assert.equal(geometry.ringAboveTasks, true, `${viewport.label} ring stays above the task accordion`);
      assert.ok(geometry.ringShipCenterDelta <= 2, `${viewport.label} ship and ring stay centered together`);
    }

    const endpointErrors = await page.evaluate(({ mobile }) => {
      const targetSelector = mobile ? '.ship-task-mobile-callout' : '.ship-task-button';
      return [...document.querySelectorAll('.ship-task-leader')].map((leader) => {
        const values = (leader.getAttribute('points') || '').trim().split(/\s+/).at(-1).split(',').map(Number);
        const matrix = leader.getScreenCTM();
        const endpoint = {
          x: (values[0] * matrix.a) + (values[1] * matrix.c) + matrix.e,
          y: (values[0] * matrix.b) + (values[1] * matrix.d) + matrix.f,
        };
        const control = [...document.querySelectorAll(targetSelector)].find(({ dataset }) => dataset.taskId === leader.dataset.taskId);
        const box = control.getBoundingClientRect();
        const corners = {
          'top-left': { x: box.left, y: box.top },
          'top-right': { x: box.right, y: box.top },
          'bottom-left': { x: box.left, y: box.bottom },
          'bottom-right': { x: box.right, y: box.bottom },
        };
        return Math.hypot(endpoint.x - corners[leader.dataset.corner].x, endpoint.y - corners[leader.dataset.corner].y);
      });
    }, { mobile: viewport.width <= 820 });
    assert.ok(Math.max(...endpointErrors) <= 1.5, `${viewport.label} leaders touch their declared control corners (max ${Math.max(...endpointErrors).toFixed(2)}px)`);
    const originErrors = await page.evaluate(() => {
      const anchors = {
        'forward-sensors': { x: .82, y: .5 },
        engineering: { x: .3, y: .24 },
        'crew-habitat': { x: .49, y: .56 },
        'central-saucer': { x: .62, y: .48 },
      };
      const image = document.querySelector('.ship-cohesion-visual img');
      const box = image.getBoundingClientRect();
      const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
      const content = {
        left: box.left + ((box.width - (image.naturalWidth * scale)) / 2),
        top: box.top + ((box.height - (image.naturalHeight * scale)) / 2),
        width: image.naturalWidth * scale,
        height: image.naturalHeight * scale,
      };
      return [...document.querySelectorAll('.ship-task-leader')].map((leader) => {
        const [x, y] = (leader.getAttribute('points') || '').trim().split(/\s+/)[0].split(',').map(Number);
        const matrix = leader.getScreenCTM();
        const origin = { x: (x * matrix.a) + (y * matrix.c) + matrix.e, y: (x * matrix.b) + (y * matrix.d) + matrix.f };
        const anchor = anchors[leader.dataset.anchor];
        const expected = { x: content.left + (content.width * anchor.x), y: content.top + (content.height * anchor.y) };
        return Math.hypot(origin.x - expected.x, origin.y - expected.y);
      });
    });
    assert.ok(Math.max(...originErrors) <= 1.5, `${viewport.label} leaders originate at authored ship regions (max ${Math.max(...originErrors).toFixed(2)}px)`);
    const layoutSafety = await page.evaluate(({ mobile }) => {
      const controls = [...document.querySelectorAll(mobile ? '.ship-task-mobile-callout' : '.ship-task-button')];
      const rectangles = controls.map((control) => control.getBoundingClientRect());
      const overlapCount = rectangles.reduce((count, box, index) => count + rectangles.slice(index + 1).filter((other) => (
        box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
      )).length, 0);
      const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < .5;
      const intersects = ([a, b], [c, d]) => {
        if ([a, b].some((point) => [c, d].some((candidate) => same(point, candidate)))) return false;
        const direction = (p, q, r) => ((r.x - p.x) * (q.y - p.y)) - ((q.x - p.x) * (r.y - p.y));
        const values = [direction(c, d, a), direction(c, d, b), direction(a, b, c), direction(a, b, d)];
        return values[0] * values[1] < 0 && values[2] * values[3] < 0;
      };
      const routes = [...document.querySelectorAll('.ship-task-leader')].map((leader) => {
        const matrix = leader.getScreenCTM();
        const points = (leader.getAttribute('points') || '').trim().split(/\s+/).map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          return { x: (x * matrix.a) + (y * matrix.c) + matrix.e, y: (x * matrix.b) + (y * matrix.d) + matrix.f };
        });
        return [[points[0], points[1]], [points[1], points[2]]];
      });
      const crossingCount = routes.reduce((count, route, index) => count + routes.slice(index + 1).filter((other) => (
        route.some((segment) => other.some((candidate) => intersects(segment, candidate)))
      )).length, 0);
      return { overlapCount, crossingCount };
    }, { mobile: viewport.width <= 820 });
    assert.deepEqual(layoutSafety, { overlapCount: 0, crossingCount: 0 }, `${viewport.label} callouts do not overlap or cross`);
    if (viewport.width <= 820) {
      const mobileClearance = await page.evaluate(() => {
        const ringBox = document.querySelector('.ship-cohesion-ring-layer.is-back').getBoundingClientRect();
        const center = { x: ringBox.left + (ringBox.width / 2), y: ringBox.top + (ringBox.height / 2) };
        const radius = ringBox.width / 2;
        const image = document.querySelector('.ship-cohesion-visual img');
        const imageBox = image.getBoundingClientRect();
        const scale = Math.min(imageBox.width / image.naturalWidth, imageBox.height / image.naturalHeight);
        const content = {
          left: imageBox.left + ((imageBox.width - (image.naturalWidth * scale)) / 2),
          top: imageBox.top + ((imageBox.height - (image.naturalHeight * scale)) / 2),
          width: image.naturalWidth * scale,
          height: image.naturalHeight * scale,
        };
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        return [...document.querySelectorAll('.ship-task-mobile-callout')].map((badge) => {
          const box = badge.getBoundingClientRect();
          const closest = {
            x: Math.max(box.left, Math.min(center.x, box.right)),
            y: Math.max(box.top, Math.min(center.y, box.bottom)),
          };
          let opaqueSamples = 0;
          for (let x = box.left + 2; x < box.right - 1; x += 3) {
            for (let y = box.top + 2; y < box.bottom - 1; y += 3) {
              const sourceX = Math.floor(((x - content.left) / content.width) * image.naturalWidth);
              const sourceY = Math.floor(((y - content.top) / content.height) * image.naturalHeight);
              if (sourceX < 0 || sourceY < 0 || sourceX >= image.naturalWidth || sourceY >= image.naturalHeight) continue;
              if (context.getImageData(sourceX, sourceY, 1, 1).data[3] > 24) opaqueSamples += 1;
            }
          }
          return {
            ringClearance: Math.hypot(closest.x - center.x, closest.y - center.y) - radius,
            opaqueSamples,
          };
        });
      });
      const minimumRingClearance = Math.min(...mobileClearance.map(({ ringClearance }) => ringClearance));
      assert.ok(minimumRingClearance >= -1, `${viewport.label} badges remain outside the ring (minimum ${minimumRingClearance.toFixed(2)}px)`);
      assert.equal(
        mobileClearance.every(({ opaqueSamples }) => opaqueSamples === 0),
        true,
        `${viewport.label} badges do not cover ship pixels (${mobileClearance.map(({ opaqueSamples }) => opaqueSamples).join(', ')})`,
      );
    }

    if (viewport.label === 'desktop' || viewport.label === 'mobile') {
      const targetSelector = viewport.width <= 820 ? '.ship-task-mobile-callout' : '.ship-task-button';
      const initialAssignment = await page.locator(targetSelector).evaluateAll((controls) => controls.map(({ dataset }) => `${dataset.taskId}:${dataset.slot}:${dataset.corner}`));
      const alternate = viewport.width <= 820 ? { width: 360, height: 700 } : { width: 1180, height: 800 };
      await page.setViewportSize(alternate);
      await page.waitForFunction(() => document.querySelector('.ship-cohesion-workspace')?.dataset.calloutLayoutReady === 'true');
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForFunction(() => document.querySelector('.ship-cohesion-workspace')?.dataset.calloutLayoutReady === 'true');
      await page.waitForTimeout(50);
      const restoredAssignment = await page.locator(targetSelector).evaluateAll((controls) => controls.map(({ dataset }) => `${dataset.taskId}:${dataset.slot}:${dataset.corner}`));
      assert.deepEqual(restoredAssignment, initialAssignment, `${viewport.label} deterministic assignment survives responsive reflow`);
    }

    await page.screenshot({ path: path.join(artifactRoot, `${viewport.label}-${viewport.width}x${viewport.height}-initial.png`) });

    const buttons = page.locator('.ship-task-button');
    assert.equal(await buttons.nth(0).getAttribute('aria-pressed'), 'true');
    const mobile = viewport.width <= 820;
    if (mobile) await page.locator('.ship-task-mobile-callout').nth(1).click();
    else await buttons.nth(1).click();
    assert.equal(await buttons.nth(1).getAttribute('aria-pressed'), 'true');
    const activeDetail = mobile
      ? page.locator('.ship-task-mobile-panel:not([hidden])')
      : page.locator('.ship-task-detail');
    if (mobile) {
      assert.equal(await page.locator('.ship-task-mobile-callout').nth(1).getAttribute('aria-pressed'), 'true');
      assert.equal(
        await page.locator('.ship-task-mobile-callout').nth(1).evaluate((badge) => getComputedStyle(badge).borderColor),
        'rgb(255, 162, 79)',
        `${viewport.label} selected badge becomes amber`,
      );
      assert.equal(await page.locator('.ship-task-leader.is-active').count(), 1);
      assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 1);
      assert.equal(await buttons.nth(1).getAttribute('aria-expanded'), 'true');
      assert.equal(await activeDetail.locator('h3').count(), 0, `${viewport.label} inline detail does not repeat the title`);
    } else {
      assert.match(await page.locator('.ship-task-detail h3').textContent(), /Systems Integration/);
      assert.equal(
        await buttons.nth(1).locator('.ship-task-desktop-level').evaluate((level) => getComputedStyle(level).color),
        'rgb(255, 162, 79)',
        `${viewport.label} selected desktop level becomes amber`,
      );
    }
    const activeDetailText = await activeDetail.textContent();
    for (const heading of [
      /Level \d+ Command Assignment/,
      /Situation/,
      /Objective/,
      /Command Impact/,
      /Course of Action/,
      /Operational Risk/,
      /Resolution Criteria/,
    ]) assert.match(activeDetailText, heading, `${viewport.label} active detail includes ${heading}`);
    assert.doesNotMatch(activeDetailText, /Why it matters to you|How to pursue it/);
    assert.match(activeDetailText, /always ask the ship's computer for help/i);

    await page.evaluate(() => document.activeElement?.blur());
    let thirdButtonHasKeyboardFocus = false;
    for (let attempt = 0; attempt < 30 && !thirdButtonHasKeyboardFocus; attempt += 1) {
      await page.keyboard.press('Tab');
      thirdButtonHasKeyboardFocus = await buttons.nth(2).evaluate((button) => document.activeElement === button);
    }
    assert.equal(thirdButtonHasKeyboardFocus, true, `${viewport.label} third task is keyboard reachable`);
    assert.equal(
      await buttons.nth(2).evaluate((button) => {
        const style = getComputedStyle(button);
        return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) >= 2;
      }),
      true,
      `${viewport.label} keyboard-focused task retains a visible outline`,
    );
    await page.keyboard.press('Enter');
    assert.equal(await buttons.nth(2).getAttribute('aria-pressed'), 'true', `${viewport.label} keyboard task selection`);
    if (mobile) {
      assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 1);
      assert.equal(await buttons.nth(1).getAttribute('aria-expanded'), 'false');
      assert.equal(await buttons.nth(2).getAttribute('aria-expanded'), 'true');
      assert.match(await page.locator('.ship-task-mobile-panel:not([hidden])').textContent(), /crewmember missed an important watch/i);
    } else {
      assert.match(await page.locator('.ship-task-detail h3').textContent(), /The Missed Watch/);
      assert.equal(await page.locator('.ship-task-detail .ship-task-category-icon').getAttribute('data-category'), 'personnel');
    }
    await buttons.nth(0).hover();
    assert.equal(await page.locator('.ship-cohesion-segment.is-preview').count(), 2, `${viewport.label} hover reward preview`);
    await page.mouse.move(1, 1);
    assert.equal(await page.locator('.ship-cohesion-segment.is-preview').count(), 1, `${viewport.label} selected reward remains highlighted`);
    if (mobile) {
      const highlightedHeaders = await buttons.evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).borderLeftColor === 'rgb(255, 162, 79)').length);
      assert.equal(highlightedHeaders, 1, `${viewport.label} only the expanded accordion header remains highlighted`);
    }
    const reliefButton = mobile
      ? page.locator('.ship-task-mobile-panel:not([hidden]) .ship-command-relief-button')
      : page.locator('.ship-task-detail .ship-command-relief-button');
    assert.equal(await reliefButton.isEnabled(), true);
    await reliefButton.click();
    assert.match(await reliefButton.textContent(), /reserved/i);
    assert.equal(await page.evaluate(() => globalThis.__directiveFixtureActions.some(({ action }) => action === 'reserveCohesionRelief')), true);

    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      document.querySelector('.ship-cohesion-workspace').scrollTop = 0;
    });
    await page.screenshot({ path: path.join(artifactRoot, `${viewport.label}-${viewport.width}x${viewport.height}.png`), fullPage: true });
    await page.close();
  }

  for (const viewport of viewports.filter(({ width }) => width <= 820)) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${baseUrl}/production?route=ship&taskCount=2`);
    await page.waitForFunction(() => globalThis.__directiveFixtureReady === true);
    const buttons = page.locator('.ship-task-button');
    assert.equal(await buttons.count(), 2);
    const collapsed = await buttons.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert.equal(collapsed.every((height) => height >= 44 && height <= 72), true, `${viewport.label} two-task headers stay compact`);
    assert.ok(Math.max(...collapsed) - Math.min(...collapsed) <= 1, `${viewport.label} two-task headers do not stretch`);
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 0);
    await buttons.nth(0).click();
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 1);
    await buttons.nth(1).click();
    assert.equal(await buttons.nth(0).getAttribute('aria-expanded'), 'false');
    assert.equal(await buttons.nth(1).getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 1);
    await buttons.nth(1).click();
    assert.equal(await page.locator('.ship-task-mobile-panel:not([hidden])').count(), 0);
    await page.screenshot({ path: path.join(artifactRoot, `${viewport.label}-${viewport.width}x${viewport.height}-two-tasks.png`), fullPage: true });
    await page.close();
  }

  const reduced = await browser.newPage({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  await reduced.goto(`${baseUrl}/production?route=ship`);
  await reduced.waitForFunction(() => globalThis.__directiveFixtureReady === true);
  const reducedMotion = await reduced.locator('.ship-cohesion-segment').first().evaluate((node) => ({
    transition: getComputedStyle(node).transitionDuration,
    animations: getComputedStyle(node).animationName,
  }));
  assert.ok(Number.parseFloat(reducedMotion.transition) <= .001);
  assert.equal(reducedMotion.animations, 'none');
  await reduced.close();
} finally {
  await browser.close();
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000))]);
  }
}

console.log('Cohesion Ship Playwright visual certification passed.');
