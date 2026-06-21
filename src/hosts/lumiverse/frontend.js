import { createDirectiveCompactShell } from '../../ui/directive-compact-shell.js';
import { DIRECTIVE_PRIMARY_ROUTES, normalizeDirectiveRouteId } from '../../ui/directive-routes.mjs';

const STATUS_REQUEST_TYPE = 'directive.status.request';
const STATUS_RESPONSE_TYPE = 'directive.status';
const RUNTIME_REQUEST_TYPE = 'directive.runtime.request';
const RUNTIME_RESPONSE_TYPE = 'directive.runtime.response';

const DEFAULT_PLAYER_INPUT = [
  'Protect civilians first, keep the Breckenridge coordinated, preserve evidence,',
  'and accept a modest operational delay if safety requires it.'
].join(' ');

function createElement(tagName, {
  className = '',
  text = '',
  style = ''
} = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== '') element.textContent = String(text);
  if (style) element.style.cssText = style;
  return element;
}

function installShellStyles() {
  if (typeof document === 'undefined' || !document.head || document.getElementById?.('directive-lumiverse-shell-styles')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'directive-lumiverse-shell-styles';
  style.textContent = `
    .directive-lumiverse-shell {
      --directive-lumi-bg: #020407;
      --directive-lumi-panel: #080c12;
      --directive-lumi-panel-alt: #0d1119;
      --directive-lumi-line: rgba(243,154,27,.38);
      --directive-lumi-line-soft: rgba(151,129,188,.28);
      --directive-lumi-text: #dedbd4;
      --directive-lumi-muted: #858994;
      --directive-lumi-amber: #f39a1b;
      --directive-lumi-orange: #ec7c20;
      --directive-lumi-lavender: #a77bc5;
      --directive-lumi-blue: #6296dc;
      --directive-lumi-teal: #61c6ba;
      --directive-lumi-coral: #d0646b;
      --directive-lumi-green: #62c75b;
      position: relative;
      box-sizing: border-box;
      min-height: 100%;
      height: 100%;
      display: grid;
      grid-template-rows: auto minmax(0,1fr) auto;
      padding-left: 18px;
      background:
        radial-gradient(circle at 22% -12%, rgba(167,123,197,.12), transparent 34%),
        radial-gradient(circle at 92% 18%, rgba(243,154,27,.08), transparent 26%),
        var(--directive-lumi-bg);
      color: var(--directive-lumi-text);
      border: 1px solid rgba(174,180,194,.22);
      border-radius: 28px;
      box-shadow: inset 0 0 0 5px #05070a, 0 18px 55px rgba(0,0,0,.35);
      overflow: hidden;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    }
    .directive-lumiverse-shell *, .directive-lumiverse-shell *::before, .directive-lumiverse-shell *::after { box-sizing: border-box; }
    .directive-lumiverse-shell .directive-shell-rail {
      position: absolute;
      inset: 13px auto 13px 0;
      width: 18px;
      z-index: 3;
      display: grid;
      grid-template-rows: 42px minmax(0,1fr) 28px;
      gap: 5px;
      pointer-events: none;
    }
    .directive-lumiverse-shell .directive-shell-rail-cap,
    .directive-lumiverse-shell .directive-shell-rail-foot {
      display: block;
      background: var(--directive-lumi-lavender);
      border-radius: 0 14px 14px 0;
    }
    .directive-lumiverse-shell .directive-shell-rail-foot { background: var(--directive-lumi-orange); }
    .directive-lumiverse-shell .directive-shell-rail-stack { display: grid; gap: 4px; min-height: 0; }
    .directive-lumiverse-shell .directive-shell-rail-segment {
      min-height: 0;
      display: grid;
      place-content: center;
      gap: 1px;
      color: #07080a;
      background: var(--directive-lumi-lavender);
      border-radius: 0 12px 12px 0;
      text-align: center;
    }
    .directive-lumiverse-shell .directive-shell-rail-segment:nth-child(2) { background: var(--directive-lumi-coral); }
    .directive-lumiverse-shell .directive-shell-rail-segment:nth-child(4),
    .directive-lumiverse-shell .directive-shell-rail-segment:nth-child(6) { background: var(--directive-lumi-orange); }
    .directive-lumiverse-shell .directive-shell-rail-label { font-size: 6px; font-weight: 900; }
    .directive-lumiverse-shell .directive-shell-rail-index { font-size: 9px; line-height: 1; }
    .directive-lumiverse-shell .directive-shell-topbar {
      min-width: 0;
      min-height: 64px;
      display: grid;
      grid-template-columns: minmax(0,1fr) auto auto;
      gap: 14px;
      align-items: center;
      padding: 10px 14px 10px 18px;
      border-bottom: 1px solid var(--directive-lumi-line);
      background: rgba(1,3,6,.9);
    }
    .directive-lumiverse-shell .directive-shell-identity-cluster { min-width: 0; display: flex; align-items: center; gap: 11px; }
    .directive-lumiverse-shell .directive-shell-brand-stack { min-width: 0; display: flex; align-items: center; gap: 10px; }
    .directive-lumiverse-shell .directive-shell-product-label {
      color: var(--directive-lumi-amber);
      font-size: 17px;
      font-weight: 900;
      letter-spacing: .04em;
      padding-right: 10px;
      border-right: 1px solid rgba(222,219,212,.42);
    }
    .directive-lumiverse-shell .directive-runtime-title {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--directive-lumi-lavender);
      font-size: 14px;
      font-weight: 900;
      letter-spacing: .05em;
      text-transform: uppercase;
    }
    .directive-lumiverse-shell .directive-shell-version-label { color: var(--directive-lumi-muted); font-size: 8px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .directive-lumiverse-shell .directive-shell-telemetry { display: flex; align-items: center; gap: 16px; }
    .directive-lumiverse-shell .directive-shell-runtime-status,
    .directive-lumiverse-shell .directive-shell-route-context,
    .directive-lumiverse-shell .directive-shell-chronometer { display: inline-flex; align-items: center; gap: 6px; font-size: 8px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .directive-lumiverse-shell .directive-shell-status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--directive-lumi-green); box-shadow: 0 0 9px rgba(98,199,91,.75); }
    .directive-lumiverse-shell .directive-shell-context-label { color: var(--directive-lumi-amber); }
    .directive-lumiverse-shell .directive-shell-context-value,
    .directive-lumiverse-shell .directive-shell-chrono-value { color: var(--directive-lumi-lavender); }
    .directive-lumiverse-shell .directive-shell-actions { display: inline-flex; gap: 6px; justify-content: flex-end; }
    .directive-lumiverse-shell .directive-icon-button {
      width: 38px;
      min-height: 34px;
      border: 1px solid rgba(243,154,27,.66);
      border-radius: 18px 7px 18px 7px;
      background: linear-gradient(180deg, rgba(243,154,27,.1), rgba(7,9,13,.96));
      color: var(--directive-lumi-amber);
      cursor: pointer;
    }
    .directive-lumiverse-shell .directive-icon-button:disabled { opacity: .42; cursor: not-allowed; }
    .directive-lumiverse-shell .directive-runtime-body {
      min-height: 0;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      padding: 12px 14px 18px 18px;
    }
    .directive-lumi-route { display: grid; gap: 11px; min-width: 0; }
    .directive-lumi-route-heading {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      padding: 2px 2px 8px;
      border-bottom: 1px solid var(--directive-lumi-line);
    }
    .directive-lumi-kicker { color: var(--directive-lumi-muted); font-size: 8px; font-weight: 900; letter-spacing: .11em; text-transform: uppercase; }
    .directive-lumi-title { margin: 3px 0 0; color: var(--directive-lumi-amber); font-size: 19px; line-height: 1; font-weight: 900; text-transform: uppercase; }
    .directive-lumi-subtitle { margin: 5px 0 0; color: var(--directive-lumi-muted); font-size: 10px; line-height: 1.4; }
    .directive-lumi-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border: 1px solid rgba(98,199,91,.48); border-radius: 15px; color: var(--directive-lumi-green); font-size: 8px; font-weight: 900; text-transform: uppercase; white-space: nowrap; }
    .directive-lumi-pill-warning { border-color: rgba(243,154,27,.56); color: var(--directive-lumi-amber); }
    .directive-lumi-panel {
      position: relative;
      min-width: 0;
      padding: 12px;
      background: linear-gradient(145deg, rgba(14,18,25,.98), rgba(3,5,8,.98));
      border: 1px solid var(--directive-lumi-line);
      border-radius: 8px 17px 8px 17px;
      overflow: hidden;
    }
    .directive-lumi-panel::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--directive-lumi-lavender); }
    .directive-lumi-panel-command::before { background: var(--directive-lumi-coral); }
    .directive-lumi-panel-operations::before { background: var(--directive-lumi-amber); }
    .directive-lumi-panel-science::before { background: var(--directive-lumi-blue); }
    .directive-lumi-panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid rgba(243,154,27,.24); }
    .directive-lumi-panel-title { margin: 2px 0 0; color: var(--directive-lumi-amber); font-size: 14px; font-weight: 900; text-transform: uppercase; }
    .directive-lumi-metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 7px; }
    .directive-lumi-metric { min-width: 0; min-height: 66px; display: grid; align-content: center; gap: 3px; padding: 9px 10px; background: #070b11; border: 1px solid rgba(97,198,186,.44); border-radius: 8px 14px 8px 14px; }
    .directive-lumi-metric:nth-child(even) { border-color: rgba(167,123,197,.44); }
    .directive-lumi-metric-label { color: var(--directive-lumi-muted); font-size: 7px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .directive-lumi-metric-value { min-width: 0; color: var(--directive-lumi-teal); font-size: 13px; font-weight: 900; overflow-wrap: anywhere; }
    .directive-lumi-metric-detail { color: var(--directive-lumi-muted); font-size: 8px; line-height: 1.25; }
    .directive-lumi-grid-2 { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
    .directive-lumi-grid-main { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(250px,.7fr); gap: 10px; }
    .directive-lumi-context-banner {
      display: grid;
      grid-template-columns: minmax(0,1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 13px 15px;
      color: #08090b;
      background: linear-gradient(90deg, #f9ad34, #ea7d20);
      border-radius: 20px 7px 20px 7px;
    }
    .directive-lumi-context-banner strong { display: block; font-size: 18px; text-transform: uppercase; }
    .directive-lumi-context-banner span { display: block; margin-top: 2px; font-size: 9px; font-weight: 700; }
    .directive-lumi-context-state { font-size: 16px; font-weight: 900; text-transform: uppercase; }
    .directive-lumi-row-list { display: grid; gap: 6px; }
    .directive-lumi-row { min-width: 0; display: grid; grid-template-columns: minmax(110px,.34fr) minmax(0,1fr); gap: 10px; align-items: start; padding: 8px 9px; background: rgba(255,255,255,.025); border: 1px solid rgba(139,147,165,.18); border-radius: 7px; }
    .directive-lumi-row-label { color: var(--directive-lumi-amber); font-size: 8px; font-weight: 900; text-transform: uppercase; }
    .directive-lumi-row-value { color: var(--directive-lumi-text); font-size: 10px; line-height: 1.35; overflow-wrap: anywhere; }
    .directive-lumi-command-dock { display: grid; gap: 9px; }
    .directive-lumi-command-groups { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 8px; }
    .directive-lumi-command-group { display: grid; align-content: start; gap: 6px; padding: 9px; background: rgba(5,8,12,.84); border: 1px solid rgba(167,123,197,.24); border-radius: 8px 14px 8px 14px; }
    .directive-lumi-command-group-title { color: var(--directive-lumi-lavender); font-size: 8px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .directive-lumi-button-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; }
    .directive-lumi-button {
      min-width: 0;
      min-height: 36px;
      padding: 6px 8px;
      border: 1px solid rgba(167,123,197,.48);
      border-radius: 7px 13px 7px 13px;
      background: linear-gradient(145deg, rgba(21,25,34,.96), rgba(6,8,12,.96));
      color: var(--directive-lumi-text);
      font-size: 8px;
      font-weight: 900;
      letter-spacing: .025em;
      text-transform: uppercase;
      cursor: pointer;
    }
    .directive-lumi-button:hover:not(:disabled) { border-color: var(--directive-lumi-amber); color: var(--directive-lumi-amber); }
    .directive-lumi-button-primary { border-color: rgba(243,154,27,.8); background: linear-gradient(180deg,#f6a531,#dd741c); color: #090a0c; }
    .directive-lumi-button-danger { border-color: rgba(208,100,107,.7); color: #ef9b9f; }
    .directive-lumi-button:disabled { opacity: .38; cursor: not-allowed; }
    .directive-lumi-input { width: 100%; min-height: 88px; resize: vertical; padding: 10px; color: var(--directive-lumi-text); background: #04070b; border: 1px solid rgba(167,123,197,.5); border-radius: 8px 14px 8px 14px; font: inherit; font-size: 10px; line-height: 1.45; outline: none; }
    .directive-lumi-input:focus { border-color: var(--directive-lumi-amber); box-shadow: 0 0 0 2px rgba(243,154,27,.13); }
    .directive-lumi-crew-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 7px; }
    .directive-lumi-crew-card { min-width: 0; display: grid; grid-template-columns: 34px minmax(0,1fr); gap: 8px; align-items: center; padding: 9px; background: #070b11; border: 1px solid rgba(167,123,197,.28); border-radius: 8px 14px 8px 14px; }
    .directive-lumi-crew-mark { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 50%; color: #06080b; background: var(--directive-lumi-lavender); font-size: 11px; font-weight: 900; }
    .directive-lumi-crew-card strong { color: var(--directive-lumi-amber); font-size: 10px; text-transform: uppercase; }
    .directive-lumi-crew-card span { display: block; color: var(--directive-lumi-muted); font-size: 8px; line-height: 1.3; }
    .directive-lumi-timeline { display: grid; gap: 8px; }
    .directive-lumi-log-entry { position: relative; padding: 10px 10px 10px 28px; background: #070b11; border: 1px solid rgba(167,123,197,.24); border-radius: 7px 14px 7px 14px; }
    .directive-lumi-log-entry::before { content: ''; position: absolute; left: 12px; top: 15px; width: 7px; height: 7px; border-radius: 50%; background: var(--directive-lumi-amber); }
    .directive-lumi-log-entry strong { display: block; color: var(--directive-lumi-amber); font-size: 10px; text-transform: uppercase; }
    .directive-lumi-log-entry span { display: block; margin-top: 4px; color: var(--directive-lumi-muted); font-size: 9px; line-height: 1.4; }
    .directive-lumi-error { color: #ffacb0; border-color: rgba(208,100,107,.68); }
    .directive-lumiverse-shell .directive-mobile-bottom-bar {
      min-width: 0;
      display: grid;
      grid-template-columns: repeat(var(--directive-mobile-bottom-tab-count,6),minmax(0,1fr));
      gap: 4px;
      align-items: stretch;
      padding: 7px 8px calc(7px + env(safe-area-inset-bottom,0px));
      border-top: 1px solid var(--directive-lumi-line);
      background: linear-gradient(90deg, rgba(236,124,32,.9) 0 14px, rgba(3,5,8,.98) 14px calc(100% - 14px), rgba(167,123,197,.9) calc(100% - 14px));
    }
    .directive-lumiverse-shell .directive-mobile-shell-action-bar { display: none; }
    .directive-lumiverse-shell .directive-mobile-bottom-tab {
      min-width: 0;
      min-height: 52px;
      display: grid;
      place-items: center;
      gap: 3px;
      padding: 5px 2px;
      border: 1px solid rgba(36,31,48,.9);
      border-radius: 7px 13px 7px 13px;
      background: linear-gradient(145deg,#ab87c9,#7477bd);
      color: #090a0d;
      cursor: pointer;
    }
    .directive-lumiverse-shell .directive-mobile-bottom-tab-active { background: linear-gradient(180deg,#f9ad34,#e77d1f); border-color: #ffb53b; box-shadow: 0 0 0 2px #05070a inset; color: #08090b; }
    .directive-lumiverse-shell .directive-mobile-bottom-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 8px; font-weight: 900; text-transform: uppercase; }
    .directive-lumiverse-shell .directive-mobile-bottom-icon { min-height: 14px; font-size: 11px; line-height: 1; }
    @media (max-width: 860px) {
      .directive-lumiverse-shell .directive-shell-topbar { grid-template-columns: minmax(0,1fr) auto; }
      .directive-lumiverse-shell .directive-shell-telemetry { display: none; }
      .directive-lumi-grid-main { grid-template-columns: minmax(0,1fr); }
      .directive-lumi-command-groups { grid-template-columns: minmax(0,1fr); }
      .directive-lumi-metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }
    }
    @media (max-width: 560px) {
      .directive-lumiverse-shell { padding-left: 12px; border-radius: 20px; }
      .directive-lumiverse-shell .directive-shell-rail { width: 12px; }
      .directive-lumiverse-shell .directive-shell-rail-label,
      .directive-lumiverse-shell .directive-shell-rail-index { display: none; }
      .directive-lumiverse-shell .directive-shell-topbar { min-height: 58px; padding: 8px 9px 8px 12px; }
      .directive-lumiverse-shell .directive-shell-product-label,
      .directive-lumiverse-shell .directive-shell-version-label { display: none; }
      .directive-lumiverse-shell .directive-runtime-title { font-size: 12px; }
      .directive-lumiverse-shell .directive-runtime-body { padding: 10px 9px 14px 11px; }
      .directive-lumi-route-heading { padding-inline: 1px; }
      .directive-lumi-title { font-size: 17px; }
      .directive-lumi-grid-2,
      .directive-lumi-crew-grid { grid-template-columns: minmax(0,1fr); }
      .directive-lumi-context-banner { grid-template-columns: minmax(0,1fr); border-radius: 16px 6px 16px 6px; }
      .directive-lumi-context-state { font-size: 12px; }
      .directive-lumi-row { grid-template-columns: minmax(82px,.36fr) minmax(0,1fr); }
      .directive-lumiverse-shell .directive-mobile-bottom-bar { gap: 3px; padding-inline: 5px; }
      .directive-lumiverse-shell .directive-mobile-bottom-tab { min-height: 47px; }
      .directive-lumiverse-shell .directive-mobile-bottom-label { font-size: 7px; }
    }
  `;
  document.head.appendChild(style);
}

function findRuntimeBody(element) {
  if (!element) return null;
  if (element.dataset?.directiveRuntimeBody === 'true') return element;
  for (const child of element.children || []) {
    const match = findRuntimeBody(child);
    if (match) return match;
  }
  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function displayValue(value, fallback = 'None') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function initials(name) {
  return displayValue(name, '?').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function permissionText(status) {
  const permissions = asArray(status?.permissions);
  return permissions.length > 0 ? permissions.join(', ') : 'Pending';
}

function lastEventText(status) {
  const lastEvent = status?.events?.lastEvent;
  return lastEvent ? `${lastEvent.eventName || 'event'} at ${lastEvent.at || 'unknown time'}` : 'No events observed';
}

function capabilityText(status) {
  const generation = status?.host?.capabilities?.generation || {};
  if (generation.batchConcurrent) return 'Concurrent sidecars';
  if (generation.batch) return 'Batch sidecars';
  return 'Sequential sidecars';
}

function latestSaveIdFromRuntime(runtime) {
  const packages = asArray(runtime?.starships?.packages);
  return packages.find((entry) => entry?.loadLatestSave)?.loadLatestSave || runtime?.activeSaveId || null;
}

function routeHeading(kicker, title, subtitle, stateLabel = '', warning = false) {
  const header = createElement('header', { className: 'directive-lumi-route-heading' });
  const copy = createElement('div');
  copy.append(
    createElement('div', { className: 'directive-lumi-kicker', text: kicker }),
    createElement('h2', { className: 'directive-lumi-title', text: title }),
    createElement('p', { className: 'directive-lumi-subtitle', text: subtitle })
  );
  header.appendChild(copy);
  if (stateLabel) header.appendChild(createElement('span', { className: `directive-lumi-pill${warning ? ' directive-lumi-pill-warning' : ''}`, text: stateLabel }));
  return header;
}

function panel(title, kicker = '', tone = '') {
  const element = createElement('section', { className: `directive-lumi-panel${tone ? ` directive-lumi-panel-${tone}` : ''}` });
  const header = createElement('div', { className: 'directive-lumi-panel-header' });
  const copy = createElement('div');
  if (kicker) copy.appendChild(createElement('div', { className: 'directive-lumi-kicker', text: kicker }));
  copy.appendChild(createElement('h3', { className: 'directive-lumi-panel-title', text: title }));
  header.appendChild(copy);
  element.appendChild(header);
  return element;
}

function metric(label, value, detail = '') {
  const item = createElement('div', { className: 'directive-lumi-metric' });
  item.append(
    createElement('span', { className: 'directive-lumi-metric-label', text: label }),
    createElement('strong', { className: 'directive-lumi-metric-value', text: displayValue(value) })
  );
  if (detail) item.appendChild(createElement('span', { className: 'directive-lumi-metric-detail', text: detail }));
  return item;
}

function dataRow(label, value) {
  const item = createElement('div', { className: 'directive-lumi-row' });
  item.append(
    createElement('span', { className: 'directive-lumi-row-label', text: label }),
    createElement('span', { className: 'directive-lumi-row-value', text: displayValue(value) })
  );
  return item;
}

function actionButton(label, onClick, { primary = false, danger = false, disabled = false } = {}) {
  const classes = ['directive-lumi-button'];
  if (primary) classes.push('directive-lumi-button-primary');
  if (danger) classes.push('directive-lumi-button-danger');
  const control = createElement('button', { className: classes.join(' '), text: label });
  control.type = 'button';
  control.disabled = disabled;
  control.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  control.addEventListener('click', (event) => {
    if (control.disabled) {
      event?.preventDefault?.();
      return;
    }
    onClick?.(event);
  });
  return control;
}

function buttonGroup(title, buttons) {
  const group = createElement('section', { className: 'directive-lumi-command-group' });
  group.appendChild(createElement('div', { className: 'directive-lumi-command-group-title', text: title }));
  const grid = createElement('div', { className: 'directive-lumi-button-grid' });
  grid.append(...buttons);
  group.appendChild(grid);
  return group;
}

function runtimeContext(summary, status) {
  const campaign = summary?.campaign || {};
  const openOrders = campaign.openOrders || {};
  const activeAssignment = asArray(openOrders.availableAssignments)
    .find((assignment) => assignment.id === openOrders.activeAssignmentId)
    || asArray(openOrders.availableAssignments)[0]
    || null;
  return {
    summary,
    status,
    initialized: summary?.initialized === true,
    campaign,
    starships: summary?.starships || {},
    crew: summary?.crew || {},
    ship: summary?.ship || {},
    log: campaign.commandLog || {},
    openOrders,
    activeAssignment,
    reviewCandidate: asArray(summary?.openOrdersReview?.candidates)[0] || null,
    latestSaveId: latestSaveIdFromRuntime(summary),
    sidecars: summary?.lastSidecars || null
  };
}

function campaignContextBanner(context) {
  const banner = createElement('div', { className: 'directive-lumi-context-banner' });
  const copy = createElement('div');
  const player = context.campaign.playerName || 'Player Commander';
  const ship = context.campaign.shipName || context.ship.name || 'U.S.S. Breckenridge';
  copy.append(
    createElement('strong', { text: context.initialized ? `${player} aboard ${ship}` : 'Directive Runtime Awaiting Campaign' }),
    createElement('span', { text: context.initialized ? `${context.campaign.title || 'Active campaign'} / ${context.campaign.activeMissionId || 'Mission pending'}` : 'Initialize or quick-start a campaign to begin.' })
  );
  banner.append(copy, createElement('div', { className: 'directive-lumi-context-state', text: context.initialized ? 'Operational' : 'Standby' }));
  return banner;
}

function renderStarships(context, sendRuntimeAction) {
  const root = createElement('div', { className: 'directive-lumi-route directive-lumi-route-starships' });
  root.append(
    routeHeading('Starship Command', 'Package Operations', 'Start, resume, load, and inspect the active Directive campaign package.', context.initialized ? 'Runtime ready' : 'Package ready'),
    campaignContextBanner(context)
  );
  const metrics = createElement('div', { className: 'directive-lumi-metrics' });
  metrics.append(
    metric('Packages', context.starships.packageCount ?? asArray(context.starships.packages).length ?? 0, 'Installed and validated'),
    metric('Saves', context.starships.saveCount ?? 0, context.latestSaveId ? 'Latest save available' : 'No save mounted'),
    metric('Drafts', context.starships.draftCount ?? 0, 'Creator records'),
    metric('Host', context.status?.host?.displayName || 'Lumiverse', context.status ? 'Backend online' : 'Waiting')
  );
  root.appendChild(metrics);

  const grid = createElement('div', { className: 'directive-lumi-grid-main' });
  const packagePanel = panel('Campaign Package', 'Package Readiness', 'operations');
  const packageRows = createElement('div', { className: 'directive-lumi-row-list' });
  packageRows.append(
    dataRow('Package', context.campaign.title || 'Ashes of Peace'),
    dataRow('Ship', context.campaign.shipName || context.ship.name || 'U.S.S. Breckenridge'),
    dataRow('Active Save', context.summary?.activeSaveId || 'None'),
    dataRow('Simulation', context.campaign.simulationMode || 'Not started'),
    dataRow('Status', context.initialized ? 'Ready for command' : 'Ready to initialize')
  );
  packagePanel.appendChild(packageRows);

  const actionPanel = panel('Launch Controls', 'Quick Actions', 'science');
  const launchGrid = createElement('div', { className: 'directive-lumi-button-grid' });
  launchGrid.append(
    actionButton('Initialize', () => sendRuntimeAction('initialize')),
    actionButton('Quick Start', () => sendRuntimeAction('startQuickCampaign'), { primary: !context.initialized }),
    actionButton('Load Latest', () => sendRuntimeAction('loadGame', { saveId: context.latestSaveId }), { disabled: !context.latestSaveId }),
    actionButton('Save', () => sendRuntimeAction('saveCurrentGame', { summary: 'Lumiverse manual save.' }), { disabled: !context.initialized })
  );
  actionPanel.appendChild(launchGrid);
  grid.append(packagePanel, actionPanel);
  root.appendChild(grid);

  const continuityPanel = panel('Command Continuity', 'Mission Status', 'command');
  const continuityRows = createElement('div', { className: 'directive-lumi-row-list' });
  continuityRows.append(
    dataRow('Last Outcome', context.summary?.lastOutcome
      ? `${context.summary.lastOutcome.resultBand || 'Outcome'}: ${context.summary.lastOutcome.summary || ''}`.trim()
      : context.summary?.pendingOutcome
        ? `Pending: ${context.summary.pendingOutcome.summary || context.summary.pendingOutcome.resultBand || ''}`.trim()
        : 'None'),
    dataRow('Narration', context.summary?.lastNarration?.ok
      ? context.summary.lastNarration.text
      : context.summary?.lastNarration?.error || 'None'),
    dataRow('Open Orders Candidate', context.reviewCandidate?.sideAssignmentTitle || 'None'),
    dataRow('Active Assignment', context.activeAssignment?.title || 'None'),
    dataRow('Assignment Status', context.activeAssignment?.status || 'None'),
    dataRow('Assignment Scene', context.activeAssignment?.sceneBrief?.sceneQuestion || 'None'),
    dataRow('Latest Scene Beat', context.activeAssignment?.latestSceneBeat || 'None')
  );
  continuityPanel.appendChild(continuityRows);
  root.appendChild(continuityPanel);
  return root;
}

function renderMission(context) {
  const root = createElement('div', { className: 'directive-lumi-route directive-lumi-route-mission' });
  root.append(
    routeHeading('Mission Command', context.campaign.activeMissionId || 'Mission Control', 'Review the current phase, last committed outcome, and available Open Orders work.', context.initialized ? 'Active' : 'Standby', !context.initialized),
    campaignContextBanner(context)
  );
  const metrics = createElement('div', { className: 'directive-lumi-metrics' });
  metrics.append(
    metric('Phase', context.campaign.activePhaseId || 'Not started'),
    metric('Stardate', context.campaign.stardate ?? 'Pending'),
    metric('Outcome', context.summary?.lastOutcome?.resultBand || context.summary?.pendingOutcome?.resultBand || 'None'),
    metric('Open Orders', context.activeAssignment?.title || context.reviewCandidate?.sideAssignmentTitle || 'None')
  );
  root.appendChild(metrics);
  const grid = createElement('div', { className: 'directive-lumi-grid-2' });
  const outcome = panel('Last Outcome', 'Committed Record', 'command');
  const outcomeRows = createElement('div', { className: 'directive-lumi-row-list' });
  outcomeRows.append(
    dataRow('Result', context.summary?.lastOutcome?.resultBand || context.summary?.pendingOutcome?.resultBand || 'None'),
    dataRow('Summary', context.summary?.lastOutcome?.summary || context.summary?.pendingOutcome?.summary || 'No outcome recorded.'),
    dataRow('Narration', context.summary?.lastNarration?.ok ? context.summary.lastNarration.text : context.summary?.lastNarration?.error || 'None')
  );
  outcome.appendChild(outcomeRows);

  const orders = panel('Open Orders', 'Side Work', 'science');
  const ordersRows = createElement('div', { className: 'directive-lumi-row-list' });
  ordersRows.append(
    dataRow('Candidate', context.reviewCandidate?.sideAssignmentTitle || 'None'),
    dataRow('Active Assignment', context.activeAssignment?.title || 'None'),
    dataRow('Status', context.activeAssignment?.status || 'None'),
    dataRow('Scene', context.activeAssignment?.sceneBrief?.sceneQuestion || 'None'),
    dataRow('Latest Beat', context.activeAssignment?.latestSceneBeat || 'None')
  );
  orders.appendChild(ordersRows);
  grid.append(outcome, orders);
  root.appendChild(grid);
  return root;
}

function renderCrew(context) {
  const crew = asArray(context.crew.seniorCrew);
  const root = createElement('div', { className: 'directive-lumi-route directive-lumi-route-crew' });
  root.append(
    routeHeading('Personnel Command', 'Senior Staff Roster', 'Player-safe roles and continuity state for the active campaign.', crew.length ? 'Roster ready' : 'Awaiting campaign'),
    campaignContextBanner(context)
  );
  const metrics = createElement('div', { className: 'directive-lumi-metrics' });
  metrics.append(
    metric('Senior Crew', context.crew.seniorCount ?? crew.length),
    metric('Continuity', context.crew.rawValuesHidden === false ? 'Visible' : 'Protected'),
    metric('Casualties', asArray(context.crew.casualties).length),
    metric('Reassignments', asArray(context.crew.reassignments).length)
  );
  root.appendChild(metrics);
  const rosterPanel = panel('Duty Roster', 'Crew Records', 'command');
  const grid = createElement('div', { className: 'directive-lumi-crew-grid' });
  if (crew.length === 0) {
    grid.appendChild(dataRow('Status', 'No senior crew loaded.'));
  } else {
    for (const officer of crew) {
      const card = createElement('article', { className: 'directive-lumi-crew-card' });
      card.append(
        createElement('span', { className: 'directive-lumi-crew-mark', text: initials(officer.name) }),
        createElement('div')
      );
      const copy = card.children?.[1];
      copy?.append?.(
        createElement('strong', { text: officer.name || officer.id }),
        createElement('span', { text: `${officer.rank || 'Officer'} / ${officer.billet || 'Assignment pending'}` }),
        createElement('span', { text: officer.continuity || 'Initialized' })
      );
      grid.appendChild(card);
    }
  }
  rosterPanel.appendChild(grid);
  root.appendChild(rosterPanel);
  return root;
}

function renderShip(context) {
  const ship = context.ship;
  const root = createElement('div', { className: 'directive-lumi-route directive-lumi-route-ship' });
  root.append(
    routeHeading('Starfleet Vessel', ship.name || context.campaign.shipName || 'U.S.S. Breckenridge', 'Operational condition, restrictions, damage, and carried technical debt.', ship.damage?.length || ship.activeRestrictions?.length ? 'Advisories active' : 'All systems nominal'),
    campaignContextBanner(context)
  );
  const metrics = createElement('div', { className: 'directive-lumi-metrics' });
  metrics.append(
    metric('Class', ship.class || 'Class pending'),
    metric('Registry', ship.registry || 'Registry pending'),
    metric('Damage', asArray(ship.damage).length),
    metric('Technical Debt', asArray(ship.technicalDebt).length)
  );
  root.appendChild(metrics);
  const grid = createElement('div', { className: 'directive-lumi-grid-2' });
  const condition = panel('Operational Condition', 'Engineering Report', 'operations');
  const conditionRows = createElement('div', { className: 'directive-lumi-row-list' });
  conditionRows.append(
    dataRow('Condition', ship.condition || 'No condition report available.'),
    dataRow('Affiliation', ship.affiliation || 'Starfleet'),
    dataRow('Restrictions', asArray(ship.activeRestrictions).join(' / ') || 'None'),
    dataRow('Damage', asArray(ship.damage).join(' / ') || 'None')
  );
  condition.appendChild(conditionRows);
  const debt = panel('Technical Debt', 'Post-refit Validation', 'science');
  const debtRows = createElement('div', { className: 'directive-lumi-row-list' });
  const debtItems = asArray(ship.technicalDebt);
  if (debtItems.length) debtItems.forEach((item, index) => debtRows.appendChild(dataRow(`Item ${index + 1}`, item)));
  else debtRows.appendChild(dataRow('Status', 'No carried technical debt.'));
  debt.appendChild(debtRows);
  grid.append(condition, debt);
  root.appendChild(grid);
  return root;
}

function renderLog(context, sidecars) {
  const entries = asArray(context.log.entries);
  const root = createElement('div', { className: 'directive-lumi-route directive-lumi-route-log' });
  root.append(
    routeHeading('Memory Index & Recall', 'Command History', 'Committed player-facing outcomes and continuity summaries.', entries.length ? 'Index current' : 'No records'),
    campaignContextBanner(context)
  );
  const metrics = createElement('div', { className: 'directive-lumi-metrics' });
  metrics.append(
    metric('Entries', context.log.count ?? entries.length),
    metric('Latest', context.log.latest?.stardate ?? context.campaign.stardate ?? 'None'),
    metric('Assisted', entries.filter((entry) => entry.assistedSummary).length),
    metric('Sidecars', sidecars ? `${asArray(sidecars.results).filter((entry) => entry.status === 'complete').length}/${asArray(sidecars.results).length}` : 'None')
  );
  root.appendChild(metrics);
  const timelinePanel = panel('Chronological Records', 'Command Log', 'command');
  const timeline = createElement('div', { className: 'directive-lumi-timeline' });
  if (entries.length === 0) {
    timeline.appendChild(dataRow('Status', 'No command-log entries recorded.'));
  } else {
    for (const entry of [...entries].reverse()) {
      const record = createElement('article', { className: 'directive-lumi-log-entry' });
      record.append(
        createElement('strong', { text: entry.assistedSummary?.title || entry.type || 'Command Entry' }),
        createElement('span', { text: entry.assistedSummary?.summary || entry.summary || asArray(entry.visibleConsequences).join(' ') || 'Committed outcome.' }),
        createElement('span', { text: `Stardate ${entry.stardate ?? 'unknown'}` })
      );
      timeline.appendChild(record);
    }
  }
  timelinePanel.appendChild(timeline);
  root.appendChild(timelinePanel);
  return root;
}

function renderSettings(context) {
  const status = context.status;
  const root = createElement('div', { className: 'directive-lumi-route directive-lumi-route-settings' });
  root.append(
    routeHeading('Control Plane', 'Runtime & State Safety', 'Host capabilities, permissions, storage status, and event diagnostics.', status ? 'Backend online' : 'Waiting', !status),
    campaignContextBanner(context)
  );
  const metrics = createElement('div', { className: 'directive-lumi-metrics' });
  metrics.append(
    metric('Host', status?.host?.displayName || 'Waiting'),
    metric('Permissions', permissionText(status)),
    metric('Sidecars', capabilityText(status)),
    metric('Storage', context.summary?.storageDiagnostics?.status || (context.summary?.storageDiagnostics?.ok ? 'ok' : 'Pending'))
  );
  root.appendChild(metrics);
  const grid = createElement('div', { className: 'directive-lumi-grid-2' });
  const systems = panel('Host Systems', 'Lumiverse Integration', 'science');
  const systemRows = createElement('div', { className: 'directive-lumi-row-list' });
  systemRows.append(
    dataRow('Backend', status ? 'Loaded' : 'Waiting'),
    dataRow('Tools', status?.features?.toolsRegistered ? 'Registered' : 'Not registered'),
    dataRow('Interceptor', status?.features?.interceptorRegistered ? 'Registered' : 'Not registered'),
    dataRow('Sidecar Strategy', capabilityText(status)),
    dataRow('Last Event', lastEventText(status))
  );
  systems.appendChild(systemRows);
  const safety = panel('State Safety', 'Campaign Records', 'operations');
  const safetyRows = createElement('div', { className: 'directive-lumi-row-list' });
  safetyRows.append(
    dataRow('Runtime', context.initialized ? 'Ready' : 'Not started'),
    dataRow('Active Save', context.summary?.activeSaveId || 'None'),
    dataRow('Save Count', context.starships.saveCount ?? 0),
    dataRow('Last Error', context.summary?.lastError?.message || 'None')
  );
  safety.appendChild(safetyRows);
  grid.append(systems, safety);
  root.appendChild(grid);
  return root;
}

function renderCommandDock(state, context, requestStatus, sendRuntimeAction) {
  const busy = Boolean(state.pendingAction);
  const dock = panel('Runtime Command Dock', 'Host Actions', 'operations');
  dock.classList?.add?.('directive-lumi-command-dock');

  const input = createElement('textarea', { className: 'directive-lumi-input' });
  input.value = state.playerInput || DEFAULT_PLAYER_INPUT;
  input.setAttribute('aria-label', 'Directive player intent');
  input.addEventListener('input', () => {
    state.playerInput = input.value;
  });
  dock.appendChild(input);

  const groups = createElement('div', { className: 'directive-lumi-command-groups' });
  groups.append(
    buttonGroup('Campaign', [
      actionButton('Initialize', () => sendRuntimeAction('initialize'), { disabled: busy }),
      actionButton('Quick Start', () => sendRuntimeAction('startQuickCampaign'), { primary: !context.initialized, disabled: busy }),
      actionButton('Load Latest', () => sendRuntimeAction('loadGame', { saveId: context.latestSaveId }), { disabled: busy || !context.latestSaveId }),
      actionButton('Save', () => sendRuntimeAction('saveCurrentGame', { summary: 'Lumiverse manual save.' }), { disabled: busy || !context.initialized })
    ]),
    buttonGroup('Mission', [
      actionButton('Preview Turn', () => sendRuntimeAction('previewDirectorTurn', { playerInput: state.playerInput || DEFAULT_PLAYER_INPUT }), { disabled: busy || !context.initialized }),
      actionButton('Commit Turn', () => sendRuntimeAction('commitProvisionalDirectorTurn', { confirmWarnings: true, generateNarration: true }), { primary: context.initialized, disabled: busy || !context.initialized }),
      actionButton('Run Sidecars', () => sendRuntimeAction('runSidecars'), { disabled: busy || !context.initialized }),
      actionButton('Refresh', requestStatus, { disabled: busy })
    ]),
    buttonGroup('Open Orders', [
      actionButton('Start Candidate', () => sendRuntimeAction('commitOpenOrdersCandidateReview', { candidateId: context.reviewCandidate?.id, decision: 'start', maxCandidates: 3 }), { disabled: busy || !context.initialized || !context.reviewCandidate || Boolean(context.openOrders.activeAssignmentId) }),
      actionButton('Defer Candidate', () => sendRuntimeAction('commitOpenOrdersCandidateReview', { candidateId: context.reviewCandidate?.id, decision: 'defer', maxCandidates: 3, reason: 'Player deferred this Open Orders candidate from Lumiverse.' }), { disabled: busy || !context.initialized || !context.reviewCandidate || Boolean(context.openOrders.activeAssignmentId) }),
      actionButton('Open Assignment', () => sendRuntimeAction('startOpenOrdersAssignmentScene', { assignmentId: context.openOrders.activeAssignmentId }), { disabled: busy || !context.initialized || !context.openOrders.activeAssignmentId || context.activeAssignment?.status === 'active' }),
      actionButton('Advance Scene', () => sendRuntimeAction('commitOpenOrdersAssignmentSceneBeat', { assignmentId: context.openOrders.activeAssignmentId, playerIntent: state.playerInput || DEFAULT_PLAYER_INPUT, approach: 'coordination' }), { disabled: busy || !context.initialized || !context.openOrders.activeAssignmentId || context.activeAssignment?.status !== 'active' }),
      actionButton('Resolve Assignment', () => sendRuntimeAction('commitOpenOrdersAssignmentResolution', { assignmentId: context.openOrders.activeAssignmentId, assignmentMode: 'direct' }), { disabled: busy || !context.initialized || !context.openOrders.activeAssignmentId || context.activeAssignment?.status !== 'active' }),
      actionButton('Delegate Assignment', () => sendRuntimeAction('commitOpenOrdersAssignmentResolution', { assignmentId: context.openOrders.activeAssignmentId, assignmentMode: 'delegated', delegatedTo: 'accountable Open Orders support' }), { disabled: busy || !context.initialized || !context.openOrders.activeAssignmentId || context.activeAssignment?.status !== 'active' })
    ])
  );
  dock.appendChild(groups);
  return dock;
}

function render(root, state, requestStatus, sendRuntimeAction) {
  installShellStyles();
  const busy = Boolean(state.pendingAction);
  const shell = createDirectiveCompactShell({
    title: 'Directive',
    label: 'Directive Lumiverse shelf',
    routes: DIRECTIVE_PRIMARY_ROUTES,
    activeRouteId: state.activeRoute,
    actions: [{
      id: 'refresh',
      label: 'Refresh Directive',
      title: 'Refresh Directive',
      icon: 'fa-solid fa-rotate',
      disabled: busy,
      onClick: requestStatus
    }],
    onSelectRoute(routeId) {
      state.activeRoute = normalizeDirectiveRouteId(routeId, state.activeRoute);
      render(root, state, requestStatus, sendRuntimeAction);
    }
  });
  shell.classList?.add?.('directive-lumiverse-shell');
  const body = findRuntimeBody(shell);
  const summary = state.runtime || state.status?.runtime?.lastView || null;
  const context = runtimeContext(summary, state.status);
  const route = normalizeDirectiveRouteId(state.activeRoute, 'starships');

  let routeView;
  if (route === 'mission') routeView = renderMission(context);
  else if (route === 'crew') routeView = renderCrew(context);
  else if (route === 'ship') routeView = renderShip(context);
  else if (route === 'log') routeView = renderLog(context, state.lastRuntimeResult?.sidecars || state.status?.runtime?.lastResult?.sidecars || null);
  else if (route === 'settings') routeView = renderSettings(context);
  else routeView = renderStarships(context, sendRuntimeAction);

  body?.appendChild(routeView);
  if (state.error) {
    const errorPanel = panel('Runtime Error', 'Attention Required', 'command');
    errorPanel.classList?.add?.('directive-lumi-error');
    errorPanel.appendChild(dataRow('Error', state.error));
    body?.appendChild(errorPanel);
  }
  body?.appendChild(renderCommandDock(state, context, requestStatus, sendRuntimeAction));
  root.replaceChildren(shell);
}

export function setup(ctx) {
  const state = {
    status: null,
    runtime: null,
    lastRuntimeResult: null,
    error: '',
    playerInput: DEFAULT_PLAYER_INPUT,
    pendingAction: '',
    requestId: 0,
    activeRoute: 'starships'
  };
  const tab = ctx.ui.registerDrawerTab({
    id: 'directive',
    title: 'Directive',
    shortName: 'Directive',
    headerTitle: 'Directive',
    description: 'Open Directive command console',
    keywords: ['directive', 'mission', 'sidecar', 'starship', 'crew']
  });
  const disposers = [];

  function requestStatus() {
    try {
      ctx.sendToBackend({ type: STATUS_REQUEST_TYPE });
    } catch (error) {
      state.error = error?.message || String(error);
      render(tab.root, state, requestStatus, sendRuntimeAction);
    }
  }

  function sendRuntimeAction(action, params = {}) {
    try {
      state.requestId += 1;
      state.pendingAction = action;
      ctx.sendToBackend({
        type: RUNTIME_REQUEST_TYPE,
        requestId: `runtime-${state.requestId}`,
        action,
        params
      });
      render(tab.root, state, requestStatus, sendRuntimeAction);
    } catch (error) {
      state.pendingAction = '';
      state.error = error?.message || String(error);
      render(tab.root, state, requestStatus, sendRuntimeAction);
    }
  }

  const unsubscribeBackend = ctx.onBackendMessage((payload) => {
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === STATUS_RESPONSE_TYPE) {
      state.status = payload.payload || null;
      state.runtime = payload.payload?.runtime?.lastView || state.runtime;
      state.error = '';
      render(tab.root, state, requestStatus, sendRuntimeAction);
      return;
    }
    if (payload.type === RUNTIME_RESPONSE_TYPE) {
      state.pendingAction = '';
      state.runtime = payload.payload?.summary || state.runtime;
      state.lastRuntimeResult = payload.payload?.result || state.lastRuntimeResult;
      state.error = payload.payload?.ok === false
        ? payload.payload?.error?.message || 'Directive runtime action failed'
        : '';
      render(tab.root, state, requestStatus, sendRuntimeAction);
    }
  });
  if (typeof unsubscribeBackend === 'function') disposers.push(unsubscribeBackend);

  render(tab.root, state, requestStatus, sendRuntimeAction);
  requestStatus();

  return () => {
    for (const dispose of disposers.splice(0)) dispose();
    tab.destroy?.();
  };
}
