import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const desktopRoot = resolve(import.meta.dirname, "../..");

export function loadElectronModule(relativePath, mocks = {}, globals = {}) {
  const modules = new Map();
  function load(filePath) {
    if (modules.has(filePath)) return modules.get(filePath).exports;
    const module = { exports: {} };
    modules.set(filePath, module);
    const source = readFileSync(filePath, "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const resolveImport = (specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith(".")) return load(resolve(dirname(filePath), `${specifier}.ts`));
      assert.ok(specifier.startsWith("node:"), `unexpected dependency ${specifier}`);
      return require(specifier);
    };
    new Function("module", "exports", "require", "__dirname", ...Object.keys(globals), compiled)(
      module, module.exports, resolveImport, dirname(filePath), ...Object.values(globals),
    );
    return module.exports;
  }
  return load(resolve(desktopRoot, relativePath));
}

export function createTimers() {
  let sequence = 0;
  const pending = new Map();
  return {
    setTimeout(callback) { pending.set(++sequence, callback); return sequence; },
    clearTimeout(id) { pending.delete(id); },
    tick() {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
    },
    get size() { return pending.size; },
  };
}

let nextId = 1;
export class MockWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.bounds = { x: options.x ?? 100, y: options.y ?? 100, width: options.width ?? 1120, height: options.height ?? 760 };
    this.normalBounds = { ...this.bounds };
    this.visible = false;
    this.minimized = false;
    this.maximized = false;
    this.fullscreen = false;
    this.destroyed = false;
    this.calls = [];
    this.messages = [];
    this.webContents = Object.assign(new EventEmitter(), {
      id: nextId++,
      loading: true,
      isLoading() { return this.loading; },
      isDestroyed: () => this.destroyed,
      send: (...args) => this.messages.push(args),
      setWindowOpenHandler() {},
    });
  }
  isDestroyed() { return this.destroyed; }
  isMinimized() { return this.minimized; }
  isMaximized() { return this.maximized; }
  isFullScreen() { return this.fullscreen; }
  isVisible() { return this.visible; }
  getBounds() { return { ...this.bounds }; }
  getNormalBounds() { return { ...this.normalBounds }; }
  getPosition() { return [this.bounds.x, this.bounds.y]; }
  getSize() { return [this.bounds.width, this.bounds.height]; }
  setBounds(next) {
    const previous = this.bounds;
    this.bounds = { ...previous, ...next };
    if (!this.minimized && !this.maximized && !this.fullscreen) this.normalBounds = { ...this.bounds };
    this.calls.push(["setBounds", { ...this.bounds }]);
    if (previous.x !== this.bounds.x || previous.y !== this.bounds.y) this.emit("move");
    if (previous.width !== this.bounds.width || previous.height !== this.bounds.height) this.emit("resize");
  }
  setPosition(x, y) { this.setBounds({ x, y }); }
  setSize(width, height) { this.setBounds({ width, height }); }
  setMinimumSize(width, height) { this.minimumSize = [width, height]; }
  setMenuBarVisibility() {}
  setOpacity(value) { this.opacity = value; }
  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
  setSkipTaskbar() {}
  loadURL() { return Promise.resolve(); }
  loadFile() { return Promise.resolve(); }
  moveTop() { this.calls.push(["moveTop"]); }
  show() { this.calls.push(["show"]); this.visible = true; this.emit("show"); }
  hide() { this.calls.push(["hide"]); this.visible = false; this.emit("hide"); }
  focus() { this.calls.push(["focus"]); }
  restore() { this.calls.push(["restore"]); this.minimized = false; this.bounds = { ...this.normalBounds }; this.emit("restore"); }
  maximize() { this.calls.push(["maximize"]); this.maximized = true; this.emit("maximize"); }
  unmaximize() { this.maximized = false; this.bounds = { ...this.normalBounds }; this.emit("unmaximize"); }
  close() { this.emit("close", { preventDefault() {} }); }
  destroy() { this.destroyed = true; this.emit("closed"); }
  finishLoading() { this.webContents.loading = false; this.webContents.emit("did-finish-load"); this.emit("ready-to-show"); }
}

export function createScreen(areas = [
  { x: 0, y: 0, width: 1920, height: 1040 },
  { x: 1920, y: 0, width: 1920, height: 1040 },
]) {
  return Object.assign(new EventEmitter(), {
    areas,
    getAllDisplays() { return this.areas.map((workArea, id) => ({ id, workArea })); },
    getPrimaryDisplay() { return { workArea: this.areas[0] }; },
    getDisplayNearestPoint() { return { workArea: this.areas[0] }; },
    getCursorScreenPoint() { return { x: 20, y: 20 }; },
  });
}
