export class FakeClassList {
  constructor(element) { this.element = element; }
  values() { return new Set(String(this.element.className || '').split(/\s+/).filter(Boolean)); }
  write(values) { this.element.className = [...values].join(' '); }
  add(...names) { const values = this.values(); names.forEach((name) => values.add(name)); this.write(values); }
  remove(...names) { const values = this.values(); names.forEach((name) => values.delete(name)); this.write(values); }
  contains(name) { return this.values().has(name); }
  toggle(name, force) {
    const values = this.values();
    const next = force === undefined ? !values.has(name) : force === true;
    if (next) values.add(name); else values.delete(name);
    this.write(values);
    return next;
  }
}

export class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || '').toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.style = {};
    this.value = '';
  }

  get id() { return this.attributes.get('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get isConnected() { return this === this.ownerDocument.body || Boolean(this.parentNode?.isConnected); }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  appendChild(node) { node.parentNode = this; this.children.push(node); return node; }
  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentNode = null; });
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'class') this.className = normalized;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = normalized;
    }
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== handler));
  }
  async dispatch(type, event = {}) {
    const payload = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...event };
    return Promise.all((this.listeners.get(type) || []).map((handler) => handler(payload)));
  }
  click() { return this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains?.(node));
  }
  matches(selector) {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    const dataMatch = selector.match(/^\[data-([a-z0-9-]+)(?:="([^"]+)")?\]$/i);
    if (dataMatch) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return dataMatch[2] === undefined ? this.dataset[key] !== undefined : this.dataset[key] === dataMatch[2];
    }
    return this.tagName === selector.toUpperCase();
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches?.(selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children || []) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

export class FakeDocument {
  constructor() {
    this.activeElement = null;
    this.listeners = new Map();
    this.documentElement = new FakeElement('html', this);
    this.body = new FakeElement('body', this);
    this.documentElement.appendChild(this.body);
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  createTextNode(text) { const node = new FakeElement('#text', this); node.textContent = text; return node; }
  getElementById(id) { return this.documentElement.querySelector(`#${id}`); }
  querySelector(selector) { return this.documentElement.querySelector(selector); }
  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }
  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== handler));
  }
}

export function installFakeDom() {
  const document = new FakeDocument();
  globalThis.document = document;
  return document;
}

