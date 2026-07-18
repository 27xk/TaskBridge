import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function workspaceRoot(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), "..");
}

export function workspacePaths(metaUrl) {
  const desktopRoot = workspaceRoot(metaUrl);
  return {
    desktopRoot,
    repoRoot: resolve(desktopRoot, ".."),
  };
}

export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractBalancedBlock(source, marker) {
  const markerIndex = findMarkerOutsideComments(source, marker);
  if (markerIndex < 0) throw new Error(`Missing block marker: ${marker}`);
  const openingBrace = source.indexOf("{", markerIndex + marker.length);
  if (openingBrace < 0) throw new Error(`Missing opening brace after: ${marker}`);

  let depth = 0;
  let quote = "";
  let inBlockComment = false;
  let inLineComment = false;
  let escaped = false;

  for (let index = openingBrace; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (inBlockComment) {
      if (character === "*" && nextCharacter === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inLineComment) {
      if (character === "\n" || character === "\r") inLineComment = false;
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && nextCharacter === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") {
      depth += 1;
      continue;
    }
    if (character !== "}") continue;
    depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  throw new Error(`Unclosed block after: ${marker}`);
}

export function extractOpeningTag(source, marker) {
  const start = findMarkerOutsideComments(source, marker);
  if (start < 0) throw new Error(`Missing opening tag marker: ${marker}`);

  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return source.slice(start, index + 1);
  }

  throw new Error(`Unclosed opening tag after: ${marker}`);
}

export function hasLiteralBooleanAttribute(tag, attribute) {
  return new RegExp(`(?:^|\\s)${escapeRegExp(attribute)}(?=\\s|=|/?>)`, "i").test(tag);
}

export function findUnexpectedRuntimeLogLines(chunks) {
  return chunks
    .flatMap((chunk) => String(chunk).split(/\r?\n/))
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /error|exception|unhandled|fatal|failed|failure|crash|\bERR_/i.test(line));
}

function findMarkerOutsideComments(source, marker) {
  let quote = "";
  let escaped = false;
  let inBlockComment = false;
  let inHtmlComment = false;
  let inLineComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (inBlockComment) {
      if (character === "*" && nextCharacter === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (inHtmlComment) {
      if (source.startsWith("-->", index)) {
        inHtmlComment = false;
        index += 2;
      }
      continue;
    }
    if (inLineComment) {
      if (character === "\n" || character === "\r") inLineComment = false;
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "/" && nextCharacter === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && nextCharacter === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }
    if (source.startsWith("<!--", index)) {
      inHtmlComment = true;
      index += 3;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (source.startsWith(marker, index)) return index;
  }

  return -1;
}
