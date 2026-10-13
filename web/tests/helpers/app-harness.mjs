import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import * as core from "../../offline-core.js";

const appSource = (await readFile(new URL("../../app.js", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
const withoutImports = appSource.replace(/^import \{[\s\S]*?\} from "[^"\n]+";\n/, "");
const bootStart = withoutImports.indexOf("try {\n  boot();");
const bootEnd = withoutImports.indexOf("function markAppReady()", bootStart);
assert.ok(bootStart > 0 && bootEnd > bootStart, "app bootstrap must be isolated from function tests");
const testSource = withoutImports.slice(0, bootStart) + withoutImports.slice(bootEnd);

export function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

function memoryStorage() {
  const items = new Map();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

export function createAppHarness({ origin = "https://taskbridge.test/", stored = {}, session = {} } = {}) {
  const animationFrames = [];
  const elements = new Map();
  const listeners = new Map();
  const document = {
    activeElement: null,
    querySelector: () => null,
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    removeEventListener(type, callback) {
      listeners.set(type, (listeners.get(type) || []).filter((item) => item !== callback));
    },
  };
  class Element {
    constructor(tag = "div") {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.dataset = {};
      this.style = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.className = "";
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
      this.textContent = "";
      this._value = "";
      this.classList = {
        add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/), ...names])].filter(Boolean).join(" "); },
        remove: (...names) => { this.className = this.className.split(/\s+/).filter((name) => !names.includes(name)).join(" "); },
        contains: (name) => this.className.split(/\s+/).includes(name),
        toggle: (name, force) => {
          const enabled = force ?? !this.classList.contains(name);
          this.classList[enabled ? "add" : "remove"](name);
          return enabled;
        },
      };
    }
    get value() { return this._value; }
    set value(value) {
      const candidate = String(value);
      this._value = this.tagName === "SELECT" && !this.children.some((child) => child.value === candidate) ? "" : candidate;
    }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    append(...children) { children.forEach((child) => this.appendChild(child)); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    focus() { document.activeElement = this; }
    contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
    getClientRects() { return this.hidden ? [] : [{}]; }
    getBoundingClientRect() { return this.rect || { top: 0, bottom: 40, left: 0, right: 160, width: 160, height: 40 }; }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
      this.isConnected = false;
    }
    removeAttribute(name) { this.attributes.delete(name); }
    closest(selector) {
      if (selector.startsWith(".")) {
        for (let element = this; element; element = element.parentElement) {
          if (element.classList.contains(selector.slice(1))) return element;
        }
      }
      const buttonSelector = selector.match(/^button\[data-([a-z-]+)\]$/);
      if (buttonSelector) {
        const key = buttonSelector[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        for (let element = this; element; element = element.parentElement) {
          if (element.tagName === "BUTTON" && key in element.dataset) return element;
        }
      }
      if (selector === "details:not([open]) > :not(summary)") {
        for (let element = this; element?.parentElement; element = element.parentElement) {
          if (element.tagName !== "SUMMARY" && element.parentElement.tagName === "DETAILS" && !element.parentElement.open) return element;
        }
      }
      return null;
    }
    scrollIntoView() {}
    addEventListener(type, callback) {
      const callbacks = this.listeners.get(type) || [];
      callbacks.push(callback);
      this.listeners.set(type, callbacks);
    }
    querySelectorAll(selector) {
      if (selector === "input, textarea, select") {
        return descendants(this).filter((element) => ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName));
      }
      return descendants(this).filter((element) => (
        !element.disabled && (["BUTTON", "INPUT", "TEXTAREA", "SELECT", "SUMMARY"].includes(element.tagName)
          || (element.attributes.has("tabindex") && element.getAttribute("tabindex") !== "-1"))
      ));
    }
  }
  document.createElement = (tag) => new Element(tag);
  document.createTextNode = (text) => Object.assign(new Element("#text"), { textContent: text });
  document.createDocumentFragment = () => new Element("#fragment");
  document.getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, Object.assign(new Element(/Filter|Select$/.test(id) ? "select" : "div"), { id }));
    return elements.get(id);
  };
  document.body = new Element("body");
  document.documentElement = { clientWidth: 1280, clientHeight: 800 };
  document.contains = (element) => element?.isConnected;
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value);
  for (const [key, value] of Object.entries(session)) sessionStorage.setItem(key, value);
  const context = vm.createContext({
    ...core,
    console, URL, URLSearchParams, Date, Error, TypeError, Promise,
    crypto: { randomUUID },
    document,
    HTMLElement: Element,
    location: new URL(origin),
    navigator: { onLine: true, language: "en-US", languages: ["en-US"] },
    localStorage,
    sessionStorage,
    window: {
      innerWidth: 1280, innerHeight: 800,
      addEventListener() {},
      requestAnimationFrame: (callback) => animationFrames.push(callback),
      setTimeout: () => 0,
      clearTimeout() {},
    },
    fetch: async () => { throw new Error("Unexpected network request in test"); },
  });
  vm.runInContext(testSource, context, { filename: "web/app.js" });
  const run = (source) => vm.runInContext(source, context);
  run("cacheNodes()");
  return {
    context, document, run,
    state: run("state"),
    nodes: run("nodes"),
    flushAnimationFrames() { while (animationFrames.length) animationFrames.shift()(); },
    async dispatch(element, type, extra = {}) {
      const event = { target: element, preventDefault() { this.defaultPrevented = true; }, ...extra };
      const callbacks = element === document ? listeners.get(type) : element.listeners.get(type);
      await Promise.all((callbacks || []).map((callback) => callback(event)));
      return event;
    },
  };
}

export function descendants(element) {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}
