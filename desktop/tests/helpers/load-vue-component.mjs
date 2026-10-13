import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { loadElectronModule } from "./mock-electron-windows.mjs";

const require = createRequire(import.meta.url);
const { parse, compileScript } = require("@vue/compiler-sfc");
const ts = require("typescript");
const desktopRoot = resolve(import.meta.dirname, "../..");

export function loadVueComponent(path, mocks = {}, globals = {}) {
  const filename = resolve(desktopRoot, path);
  const { descriptor } = parse(readFileSync(filename, "utf8"), { filename });
  const script = compileScript(descriptor, { id: path, inlineTemplate: true });
  const compiled = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const resolveImport = (specifier) => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith(".")) {
      const target = relative(desktopRoot, resolve(dirname(filename), specifier)).replaceAll("\\", "/");
      if (specifier.endsWith(".vue")) return loadVueComponent(target, mocks, globals);
      return loadElectronModule(`${target}.ts`, { vue: require("vue"), "@tanstack/vue-virtual": require("@tanstack/vue-virtual"), ...mocks }, globals);
    }
    return require(specifier);
  };
  new Function("module", "exports", "require", ...Object.keys(globals), compiled)(
    module, module.exports, resolveImport, ...Object.values(globals),
  );
  return module.exports.default;
}
