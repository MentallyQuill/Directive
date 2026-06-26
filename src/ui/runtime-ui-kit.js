import {
  DIRECTIVE_BUNDLED_ICON_PACKS,
  resolveDirectiveIconSlot
} from '../theme/directive-icon-packs.mjs';

let floatingTooltip = null;
let tooltipAnchor = null;
const DIRECTIVE_TOOLTIPS_DISABLED_STORAGE_KEY = 'directive.tooltipsDisabled.v1';
let directiveTooltipsDisabled = readStoredTooltipsDisabled();

export function createElement(tagName, className = '') {
  const element = document.createElement(tagName);
  if (!element.classList) {
    const readClasses = () => new Set(String(element.className || '').split(/\s+/).filter(Boolean));
    const writeClasses = (classes) => { element.className = [...classes].join(' '); };
    element.classList = {
      add(...tokens) {
        const classes = readClasses();
        for (const token of tokens.filter(Boolean)) classes.add(token);
        writeClasses(classes);
      },
      remove(...tokens) {
        const classes = readClasses();
        for (const token of tokens.filter(Boolean)) classes.delete(token);
        writeClasses(classes);
      },
      contains(token) {
        return readClasses().has(token);
      },
      toggle(token, force) {
        const classes = readClasses();
        const shouldAdd = force === undefined ? !classes.has(token) : Boolean(force);
        if (shouldAdd) classes.add(token);
        else classes.delete(token);
        writeClasses(classes);
        return shouldAdd;
      }
    };
  }
  if (className) {
    element.className = className;
  }
  return element;
}

export function createIcon(className) {
  const icon = createElement('i', className);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export function createIconFromDescriptor(icon = {}, {
  slot = '',
  fallbackClass = '',
  className = ''
} = {}) {
  if (icon.type === 'image' && icon.value) {
    const image = createElement('img', className);
    image.src = icon.value;
    image.alt = '';
    image.draggable = false;
    image.setAttribute('draggable', 'false');
    image.dataset.iconSlot = slot || icon.slot || '';
    return image;
  }

  if (icon.type === 'mask' && (icon.glyph || icon.value)) {
    const glyph = createElement('span', `directive-vector-glyph${className ? ` ${className}` : ''}`);
    glyph.setAttribute('aria-hidden', 'true');
    glyph.dataset.glyph = icon.glyph || icon.value;
    glyph.dataset.iconSlot = slot || icon.slot || '';
    if (icon.label) glyph.dataset.iconLabel = icon.label;
    return glyph;
  }

  return createIcon(`${icon.value || fallbackClass || 'fa-solid fa-circle'}${className ? ` ${className}` : ''}`);
}

export function clearElement(element) {
  if (typeof element.replaceChildren === 'function') {
    element.replaceChildren();
    return;
  }
  element.textContent = '';
  if (Array.isArray(element.children)) {
    element.children.length = 0;
  }
}

export function setDataset(element, key, value) {
  element.dataset[key] = String(value);
}

function readStoredTooltipsDisabled() {
  try {
    return globalThis.localStorage?.getItem(DIRECTIVE_TOOLTIPS_DISABLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeStoredTooltipsDisabled(disabled) {
  try {
    globalThis.localStorage?.setItem(DIRECTIVE_TOOLTIPS_DISABLED_STORAGE_KEY, disabled ? 'true' : 'false');
  } catch {
    // Local storage can be blocked by host privacy settings; the in-memory flag still applies.
  }
}

function syncTooltipPreferenceDataset() {
  if (typeof document === 'undefined') return;
  document.documentElement?.setAttribute?.('data-directive-tooltips', directiveTooltipsDisabled ? 'disabled' : 'enabled');
}

export function areDirectiveTooltipsDisabled() {
  return directiveTooltipsDisabled === true;
}

export function setDirectiveTooltipsDisabled(disabled = false) {
  directiveTooltipsDisabled = disabled === true;
  writeStoredTooltipsDisabled(directiveTooltipsDisabled);
  syncTooltipPreferenceDataset();
  if (directiveTooltipsDisabled) hideFloatingTooltip();
  return directiveTooltipsDisabled;
}

function isMobileRuntimeTooltipSurface(element) {
  if (!element?.closest) return false;
  return Boolean(element.closest('.directive-runtime-mobile-shell, [data-mobile-shell="true"], .directive-command-mobile-nav, .directive-mobile-bottom-bar'));
}

function shouldUseFloatingTooltip(element, options = {}) {
  if (options.floating === false) return false;
  if (isMobileRuntimeTooltipSurface(element)) return false;
  return String(element?.tagName || '').toUpperCase() !== 'SELECT';
}

function tooltipViewportSize() {
  return {
    width: Number(globalThis.innerWidth) || 1024,
    height: Number(globalThis.innerHeight) || 768
  };
}

function showFloatingTooltip(anchor) {
  if (areDirectiveTooltipsDisabled() || isMobileRuntimeTooltipSurface(anchor)) {
    hideFloatingTooltip();
    return;
  }
  const text = String(anchor?.dataset?.directiveTooltip || '').trim();
  if (!text || typeof document === 'undefined') return;
  tooltipAnchor = anchor;
  if (!floatingTooltip) {
    floatingTooltip = document.createElement('div');
    floatingTooltip.className = 'directive-floating-tooltip';
    document.body?.appendChild?.(floatingTooltip);
  }
  floatingTooltip.textContent = text;
  floatingTooltip.style.display = 'block';
  const schedule = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame
    : (callback) => callback();
  schedule(() => positionFloatingTooltip(anchor));
}

function positionFloatingTooltip(anchor) {
  if (!floatingTooltip || !anchor?.getBoundingClientRect) return;
  const rect = anchor.getBoundingClientRect();
  const tipRect = floatingTooltip.getBoundingClientRect?.() || { width: 0, height: 0 };
  const viewport = tooltipViewportSize();
  const margin = 8;

  let left = rect.left + (rect.width / 2) - (tipRect.width / 2);
  left = Math.max(margin, Math.min(left, viewport.width - tipRect.width - margin));

  let top = rect.top - tipRect.height - margin;
  if (top < margin) top = rect.bottom + margin;
  top = Math.max(margin, Math.min(top, viewport.height - tipRect.height - margin));

  floatingTooltip.style.left = `${left}px`;
  floatingTooltip.style.top = `${top}px`;
}

export function hideFloatingTooltip() {
  tooltipAnchor = null;
  if (floatingTooltip) floatingTooltip.style.display = 'none';
}

export function addTooltip(element, text, options = {}) {
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim();
  if (!element || !cleanText) return element;
  element.dataset.directiveTooltip = cleanText;
  element.setAttribute?.('aria-description', cleanText);
  if (options.nativeTitle === true) element.title = cleanText;
  else element.removeAttribute?.('title');

  if (shouldUseFloatingTooltip(element, options)) {
    if (options.showOnHover !== false && element.dataset.directiveTooltipHoverBound !== 'true') {
      for (const eventName of ['pointerenter', 'mouseenter', 'mouseover']) {
        element.addEventListener?.(eventName, () => showFloatingTooltip(element));
      }
      for (const eventName of ['pointerleave', 'mouseleave']) {
        element.addEventListener?.(eventName, hideFloatingTooltip);
      }
      element.dataset.directiveTooltipHoverBound = 'true';
    }
    if (options.showOnFocus !== false && element.dataset.directiveTooltipFocusBound !== 'true') {
      element.addEventListener?.('focus', () => showFloatingTooltip(element));
      element.addEventListener?.('blur', hideFloatingTooltip);
      element.dataset.directiveTooltipFocusBound = 'true';
    }
  }
  return element;
}

export function createButton({
  label,
  icon = '',
  iconSlot = '',
  className = 'directive-button',
  title = '',
  tooltip = '',
  disabled = false,
  onClick = null
}) {
  const button = createElement('button', className);
  button.type = 'button';
  button.disabled = disabled;
  addTooltip(button, tooltip || title);
  if (iconSlot) {
    button.append(createIconFromDescriptor(resolveDirectiveIconSlot(DIRECTIVE_BUNDLED_ICON_PACKS[0], iconSlot), {
      slot: iconSlot,
      fallbackClass: icon,
      className: 'directive-button-icon'
    }));
  } else if (icon) {
    button.append(createIcon(icon));
  }
  const text = createElement('span');
  text.textContent = label;
  button.append(text);
  if (typeof onClick === 'function') {
    button.addEventListener('click', async (event) => {
      event?.preventDefault?.();
      button.disabled = true;
      try {
        await onClick(event);
      } finally {
        button.disabled = disabled;
      }
    });
  }
  return button;
}

export function appendEmpty(container, message) {
  const empty = createElement('p', 'directive-runtime-empty');
  empty.textContent = message;
  container.appendChild(empty);
  return empty;
}

export function appendSectionTitle(container, label) {
  const heading = createElement('h2', 'directive-runtime-section-title');
  heading.textContent = label;
  container.appendChild(heading);
  return heading;
}

export function createMetaRow(label, value, tooltip = '') {
  const row = createElement('div', 'directive-meta-row');
  const key = createElement('span', 'directive-meta-label');
  key.textContent = label;
  const content = createElement('span', 'directive-meta-value');
  content.textContent = value === undefined || value === null || value === '' ? 'None' : String(value);
  row.append(key, content);
  if (tooltip) addTooltip(row, tooltip);
  return row;
}

export function appendMetaRows(container, rows) {
  for (const [label, value] of rows) {
    container.appendChild(createMetaRow(label, value));
  }
}

export function createOption(option, selectedValue = '') {
  const item = document.createElement('option');
  item.value = option?.id || '';
  item.textContent = option?.label || option?.title || option?.id || '';
  item.selected = String(item.value) === String(selectedValue || '');
  return item;
}

export function createInputField({ label, path, value = '', type = 'text', multiline = false, options = null, tooltip = '', maxLength = null }) {
  const wrapper = createElement('label', 'directive-field');
  const labelText = createElement('span', 'directive-field-label');
  labelText.textContent = label;

  let control;
  if (Array.isArray(options)) {
    control = document.createElement('select');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '';
    placeholder.selected = !value;
    control.appendChild(placeholder);
    for (const option of options) {
      control.appendChild(createOption(option, value));
    }
    control.value = value || '';
  } else if (multiline) {
    control = document.createElement('textarea');
    control.rows = 4;
    control.value = value || '';
  } else {
    control = document.createElement('input');
    control.type = type;
    control.value = value || '';
  }

  control.className = 'directive-field-control';
  control.dataset.inputPath = path;
  const normalizedMaxLength = Number(maxLength);
  if (!Array.isArray(options) && Number.isInteger(normalizedMaxLength) && normalizedMaxLength > 0) {
    control.maxLength = normalizedMaxLength;
    control.setAttribute('maxlength', String(normalizedMaxLength));
  }
  if (tooltip) {
    addTooltip(wrapper, tooltip);
    addTooltip(control, tooltip);
  }
  wrapper.append(labelText, control);
  return wrapper;
}

export function getNestedValue(source, path) {
  return String(path || '').split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

export function setNestedValue(target, path, value) {
  const keys = String(path || '').split('.').filter(Boolean);
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys.at(-1)] = value;
}

export function collectInputByPath(container, seed = {}) {
  const input = JSON.parse(JSON.stringify(seed));
  for (const control of container.querySelectorAll('[data-input-path]')) {
    setNestedValue(input, control.dataset.inputPath, control.value || '');
  }
  return input;
}

export function joinList(items, empty = 'None') {
  return Array.isArray(items) && items.length > 0 ? items.join(', ') : empty;
}

export function createCard(className = '') {
  return createElement('article', `directive-card${className ? ` ${className}` : ''}`);
}

export function createCardTitle(title) {
  const heading = createElement('h3', 'directive-card-title');
  heading.textContent = title;
  return heading;
}

export function appendBulletList(container, items, className = 'directive-runtime-list') {
  const list = createElement('ul', className);
  for (const item of items || []) {
    const row = createElement('li');
    row.textContent = item;
    list.appendChild(row);
  }
  container.appendChild(list);
  return list;
}
