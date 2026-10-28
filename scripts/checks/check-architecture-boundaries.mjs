import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const domainRoot = "android/app/src/main/java/com/taskbridge/app/domain";
const nodeModules = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));

// These checks guard dependency direction; type-only imports count as dependencies too.
export async function checkArchitecture(repoRoot) {
  const failures = [];
  for (const layer of ["common", "main", "preload", "renderer"]) {
    const root = resolve(repoRoot, "desktop", layer);
    for (const file of await sourceFiles(root, failures, repoRoot)) {
      if (![".ts", ".vue"].includes(extname(file))) continue;
      const content = await readFile(file, "utf8");
      const source = extname(file) === ".vue"
        ? Array.from(content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g), (match) => match[1]).join("\n")
        : content;
      for (const specifier of moduleImports(source)) {
        const local = specifier.startsWith(".");
        const target = local ? resolve(dirname(file), specifier) : null;
        let invalid = false;
        if (layer === "common") {
          invalid = !local || !within(root, target);
        } else if (layer === "renderer") {
          invalid = local
            ? !within(root, target) && !within(resolve(repoRoot, "desktop/common"), target)
            : specifier.startsWith("node:") || nodeModules.has(specifier)
              || /^(?:electron|better-sqlite3)(?:\/|$)/.test(specifier);
        } else if (layer === "preload") {
          invalid = local
            ? !within(root, target) && !within(resolve(repoRoot, "desktop/common"), target)
            : specifier !== "electron";
        } else if (local) {
          invalid = !within(root, target) && !within(resolve(repoRoot, "desktop/common"), target);
        }
        if (invalid) failures.push(`${display(repoRoot, file)}: ${layer} cannot import ${specifier}`);
      }
    }
  }

  const servicesRoot = resolve(repoRoot, "backend/app/services");
  const taskModules = await sourceFiles(resolve(servicesRoot, "tasks"), failures, repoRoot);
  for (const [path, forbidden] of [
    [resolve(servicesRoot, "task_service.py"), ["sync_service"]],
    [resolve(servicesRoot, "sync_service.py"), ["task_service"]],
    [resolve(servicesRoot, "sync_log_service.py"), ["task_service", "sync_service"]],
    ...taskModules.filter((file) => extname(file) === ".py").map((file) => [file, ["task_service", "sync_service"]]),
  ]) {
    let source;
    try {
      source = (await readFile(path, "utf8")).replace(/^\s*#.*$/gm, "");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      failures.push(`${display(repoRoot, path)}: required service is missing`);
      continue;
    }
    for (const dependency of pythonServiceImports(source, path, servicesRoot)) {
      for (const name of forbidden) {
        if (dependency === `app.services.${name}` || dependency.startsWith(`app.services.${name}.`)) {
          failures.push(`${display(repoRoot, path)}: coordinating service dependency ${name}`);
        }
      }
    }
  }

  for (const file of await sourceFiles(resolve(repoRoot, domainRoot), failures, repoRoot)) {
    if (extname(file) !== ".kt") continue;
    const source = stripComments(await readFile(file, "utf8"));
    for (const match of source.matchAll(/^\s*import\s+(com\.taskbridge\.app\.(?:data|ui|sync|widget|notification)(?:\.[\w.*]+)?)/gm)) {
      failures.push(`${display(repoRoot, file)}: domain cannot import ${match[1]}`);
    }
  }
  return [...new Set(failures)];
}

async function sourceFiles(root, failures, repoRoot) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    failures.push(`${display(repoRoot, root)}: required architecture directory is missing`);
    return [];
  }
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path, failures, repoRoot));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function moduleImports(source) {
  const tokens = jsTokens(source);
  const imports = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "identifier" || !["import", "export", "require"].includes(token.value)) continue;
    if (tokens[index - 1]?.value === ".") continue;
    const next = tokens[index + 1];
    if (next?.value === "(" && tokens[index + 2]?.kind === "string") {
      imports.add(tokens[index + 2].value);
    } else if (token.value === "import" && next?.kind === "string") {
      imports.add(next.value);
    } else if (token.value !== "require") {
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const current = tokens[cursor];
        if ([";", "="].includes(current.value)) break;
        if (current.kind === "identifier" && ["import", "export"].includes(current.value)) break;
        if (current.value === "from" && tokens[cursor + 1]?.kind === "string") {
          imports.add(tokens[cursor + 1].value);
          break;
        }
      }
    }
  }
  return imports;
}

// Tokenize strings and comments before inspecting imports so examples in copy do
// not become dependencies. No application dependencies are required to run CI.
function jsTokens(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (/\s/.test(character)) { index += 1; continue; }
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }
    if (["'", '"', "`"].includes(character)) {
      const quote = character;
      let value = "";
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") {
          index += 1;
          if (index < source.length) value += source[index++];
        } else value += source[index++];
      }
      index += 1;
      tokens.push({ kind: quote === "`" ? "template" : "string", value });
      continue;
    }
    if (/[\w$]/.test(character)) {
      const start = index++;
      while (index < source.length && /[\w$]/.test(source[index])) index += 1;
      tokens.push({ kind: "identifier", value: source.slice(start, index) });
    } else {
      tokens.push({ kind: "punctuation", value: character });
      index += 1;
    }
  }
  return tokens;
}

function pythonServiceImports(source, file, servicesRoot) {
  const imports = [];
  const packageParts = ["app", "services", ...relative(servicesRoot, dirname(file)).split(/[\\/]/).filter(Boolean)];
  for (const match of source.matchAll(/^\s*from\s+([\w.]+)\s+import\s+(\([^)]*\)|[^\n]+)/gm)) {
    let module = match[1];
    if (module.startsWith(".")) {
      const dots = module.match(/^\.+/)[0].length;
      module = [...packageParts.slice(0, packageParts.length - dots + 1), module.slice(dots)].filter(Boolean).join(".");
    }
    imports.push(module);
    for (const item of match[2].replace(/[()]/g, "").split(",")) {
      const name = item.trim().split(/\s+/)[0];
      if (name) imports.push(`${module}.${name}`);
    }
  }
  for (const match of source.matchAll(/^\s*import\s+([^\n]+)/gm)) {
    imports.push(...match[1].split(",").map((item) => item.trim().split(/\s+/)[0]));
  }
  return new Set(imports);
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function within(root, target) {
  const path = relative(root, target);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith("../") && !path.startsWith("..\\"));
}

function display(root, file) {
  return relative(root, file).replaceAll("\\", "/");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = await checkArchitecture(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("architecture boundary check passed");
  }
}
