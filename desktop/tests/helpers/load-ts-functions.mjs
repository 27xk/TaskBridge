import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

export async function loadTsFunctions(relativePath, names, globals = {}) {
  const desktopRoot = resolve(import.meta.dirname, "../..");
  let source = await readFile(resolve(desktopRoot, relativePath), "utf8");
  if (relativePath.endsWith(".vue")) {
    source = source.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? "";
  }
  const ast = ts.createSourceFile(relativePath + ".ts", source, ts.ScriptTarget.Latest, true);
  const functions = new Map();
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) {
      assert.equal(functions.has(node.name.text), false, `ambiguous function ${node.name.text}`);
      functions.set(node.name.text, node.getText(ast));
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const name of names) assert.ok(functions.has(name), `missing function ${name}`);
  const compiled = ts.transpileModule([...functions.values()].join("\n"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const context = vm.createContext({ ...globals, exports, module: { exports } });
  vm.runInContext(compiled, context, { filename: relativePath });
  return Object.fromEntries(names.map((name) => [name, context[name]]));
}
