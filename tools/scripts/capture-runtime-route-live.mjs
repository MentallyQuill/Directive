import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE_URL = process.env.SILLYTAVERN_BASE_URL || 'http://127.0.0.1:8000/';
const targetKey = process.argv[2] || 'starships-import';
const phase = process.argv[3] || 'after';

const TARGETS = {
  'starships-import': {
    routeId: 'starships',
    routeLabel: 'Starships',
    slug: 'starships-import',
    outputDir: 'docs/design/visual-targets/starships-import-loop/iteration-01',
    sectionSelector: '.directive-starships-console',
    focusSelector: '.directive-starship-import-console, .directive-starship-library-console, .directive-starship-library-card',
    metrics: {
      starshipsConsole: '.directive-starships-console',
      packageCards: '.directive-starship-command-card',
      libraryCards: '.directive-starship-library-card',
      importConsole: '.directive-starship-import-console',
      libraryStatusBlocks: '.directive-starship-library-status-block',
      importDiagnostics: '.directive-starship-import-result-card, .directive-starship-import-diagnostics-card',
      importIssueRows: '.directive-starship-import-issue-row',
      importButtons: '.directive-starship-import-button',
      recordsConsole: '.directive-starship-records-console'
    }
  }
};

const target = TARGETS[targetKey];
if (!target) {
  throw new Error(`Unknown route target "${targetKey}". Known targets: ${Object.keys(TARGETS).join(', ')}`);
}

const BROWSER_PATHS = [
  process.env.DIRECTIVE_SILLYTAVERN_BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForCdp(port, timeoutMs = 30000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for CDP endpoint: ${lastError?.message || 'no response'}`);
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket open timeout')), 10000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('CDP WebSocket error'));
      }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || 'CDP command failed'));
      } else {
        pending.resolve(message.result || {});
      }
    });
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('CDP socket is not open'));
    }
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.socket.send(payload);
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Best effort.
    }
  }
}

async function launchBrowser() {
  const executablePath = BROWSER_PATHS.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) {
    throw new Error('No installed Chrome or Edge executable was found.');
  }
  fs.mkdirSync('C:/tmp', { recursive: true });
  const userDataDir = fs.mkdtempSync('C:/tmp/directive-route-cdp-');
  const port = await reservePort();
  const browserProcess = spawn(executablePath, [
    '--headless=new',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-gpu',
    '--window-size=1280,900'
  ], {
    stdio: 'ignore',
    windowsHide: true
  });

  await waitForCdp(port);
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, {
    method: 'PUT'
  });
  if (!response.ok) throw new Error(`CDP new page failed: ${response.status}`);
  const browserTarget = await response.json();
  const connection = new CdpConnection(browserTarget.webSocketDebuggerUrl);
  await connection.connect();
  return { browserProcess, connection, userDataDir };
}

async function evaluate(connection, expression) {
  const result = await connection.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'Runtime evaluation failed');
  }
  return result.result?.value;
}

async function waitFor(connection, expression, timeoutMs = 30000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(connection, `Boolean(${expression})`)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${expression}: ${lastError?.message || 'condition false'}`);
}

async function setViewport(connection, viewport) {
  await connection.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false
  });
  await connection.send('Emulation.setVisibleSize', {
    width: viewport.width,
    height: viewport.height
  }).catch(() => {});
  await sleep(250);
}

async function openRuntime(connection) {
  await waitFor(connection, "document.readyState === 'complete'", 60000);
  await waitFor(connection, "typeof globalThis.Directive?.bridge?.showRuntime === 'function' || typeof globalThis.Directive?.bridge?.runAction === 'function' || typeof globalThis.Directive?.actions?.run === 'function' || document.getElementById('directive-extensions-menu-button')", 60000);
  await evaluate(connection, `(async () => {
    if (typeof globalThis.Directive?.bridge?.showRuntime === 'function') { await globalThis.Directive.bridge.showRuntime(); return true; }
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') { await globalThis.Directive.bridge.runAction('runtime.open'); return true; }
    if (typeof globalThis.Directive?.actions?.run === 'function') { await globalThis.Directive.actions.run('runtime.open'); return true; }
    document.getElementById('directive-extensions-menu-button')?.click();
    return true;
  })()`);
  await waitFor(connection, "document.querySelector('#directive-runtime-panel [data-directive-runtime-body=\"true\"], [data-directive-shell=\"bottom-navigation\"] [data-directive-runtime-body=\"true\"]')", 30000);
}

async function prepareRoute(connection, viewport) {
  await setViewport(connection, viewport);
  await connection.send('Page.navigate', { url: BASE_URL });
  await openRuntime(connection);
  await evaluate(connection, `(async () => {
    const routeId = ${JSON.stringify(target.routeId)};
    if (typeof globalThis.Directive?.bridge?.runAction === 'function') { await globalThis.Directive.bridge.runAction('runtime.setTab', { tabId: routeId }); return true; }
    if (typeof globalThis.Directive?.actions?.run === 'function') { await globalThis.Directive.actions.run('runtime.setTab', { tabId: routeId }); return true; }
    document.querySelector('[data-route-id="' + routeId + '"], [data-mobile-route-id="' + routeId + '"]')?.click();
    return true;
  })()`);
  await waitFor(connection, `document.querySelector(${JSON.stringify(target.sectionSelector)})`, 30000);
  await evaluate(connection, `(() => {
    const body = document.querySelector('#directive-runtime-panel [data-directive-runtime-body="true"], [data-directive-shell="bottom-navigation"] [data-directive-runtime-body="true"]');
    const focus = document.querySelector(${JSON.stringify(target.focusSelector)}) || document.querySelector(${JSON.stringify(target.sectionSelector)});
    focus?.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (body && focus) body.scrollTop = Math.max(0, focus.offsetTop - body.offsetTop - 16);
    return true;
  })()`);
  await evaluate(connection, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  await sleep(200);
}

function metricsExpression() {
  return `(() => {
    const target = ${JSON.stringify(target)};
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    };
    const visible = (element) => {
      if (!element) return false;
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const panel = document.querySelector('#directive-runtime-panel') || document.querySelector('[data-directive-shell="bottom-navigation"]');
    const body = panel?.querySelector('[data-directive-runtime-body="true"]');
    const section = document.querySelector(target.sectionSelector);
    const focus = document.querySelector(target.focusSelector) || section;
    const bottomBar = panel?.querySelector('.directive-mobile-bottom-bar, .directive-bottom-route-bar, .directive-runtime-tabs');
    const routeButtons = Array.from(panel?.querySelectorAll('[data-mobile-route-id], [data-route-id]') || []).filter(visible);
    const labels = Array.from(panel?.querySelectorAll('button, button span, .directive-mobile-bottom-label, .directive-card-title, .directive-subsection-title, .directive-meta-label, .directive-field-label, .directive-lcars-status-label, .directive-lcars-status-value, .directive-starship-import-result-status, .directive-starship-library-summary') || []).filter(visible);
    const clipped = labels
      .filter((element) => element.scrollWidth > element.clientWidth + 1 && getComputedStyle(element).overflow !== 'visible')
      .map((element) => normalize(element.textContent));
    const bodyRect = rect(body);
    const bottomRect = rect(bottomBar);
    const metricResults = {};
    for (const [key, selector] of Object.entries(target.metrics || {})) {
      metricResults[key] = section?.querySelectorAll(selector).length || 0;
    }
    const buttonLabels = Array.from(section?.querySelectorAll('button') || []).filter(visible).map((button) => normalize(button.textContent));
    return {
      ok: true,
      target: ${JSON.stringify(targetKey)},
      viewport: { width: window.innerWidth, height: window.innerHeight },
      hasSection: Boolean(section),
      visibleSection: visible(section),
      metricResults,
      buttonLabels,
      bottomTabs: routeButtons.length,
      topRouteTabs: bodyRect ? routeButtons.filter((button) => rect(button)?.bottom <= bodyRect.top + 8).length : 0,
      bodyOverlapsBottom: bodyRect && bottomRect ? bodyRect.bottom > bottomRect.top + 2 : false,
      sectionRect: rect(section),
      focusRect: rect(focus),
      bodyRect,
      bottomBar: bottomRect,
      clipped,
      text: normalize(focus?.textContent || section?.textContent || '')
    };
  })()`;
}

async function capture(connection, filePath) {
  await connection.send('Page.bringToFront').catch(() => {});
  await evaluate(connection, 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 350))))');
  const result = await connection.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true
  });
  fs.writeFileSync(filePath, Buffer.from(result.data, 'base64'));
  return fs.statSync(filePath).size;
}

async function main() {
  const outputDir = path.resolve(target.outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await launchBrowser();
  const layout = { ok: true, target: targetKey, phase };
  try {
    await browser.connection.send('Page.enable');
    await browser.connection.send('Runtime.enable');
    for (const viewport of [
      { id: 'desktop', width: 1280, height: 900 },
      { id: 'phone', width: 390, height: 844 }
    ]) {
      await prepareRoute(browser.connection, viewport);
      layout[viewport.id] = await evaluate(browser.connection, metricsExpression());
      const screenshot = path.join(outputDir, `${target.slug}-${phase}-${viewport.id}.png`);
      layout[viewport.id].screenshotBytes = await capture(browser.connection, screenshot);
      layout[viewport.id].screenshot = screenshot;
    }
    fs.writeFileSync(path.join(outputDir, `${target.slug}-${phase}-layout.json`), `${JSON.stringify(layout, null, 2)}\n`);
    console.log(JSON.stringify(layout, null, 2));
  } finally {
    browser.connection.close();
    try {
      browser.browserProcess.kill();
    } catch {
      // Best effort.
    }
    await sleep(500);
    try {
      fs.rmSync(browser.userDataDir, { recursive: true, force: true });
    } catch {
      // Best effort.
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
