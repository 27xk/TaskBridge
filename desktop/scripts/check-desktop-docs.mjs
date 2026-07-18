import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { workspacePaths } from "./script-helpers.mjs";

const { desktopRoot, repoRoot } = workspacePaths(import.meta.url);

const [rootReadme, desktopReadme, deployReadme, troubleshootingReadme, androidReadme, developmentReadme] = await Promise.all([
  readFile(resolve(repoRoot, "README.md"), "utf8"),
  readFile(resolve(desktopRoot, "README.md"), "utf8"),
  readFile(resolve(repoRoot, "deploy/README.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/troubleshooting.md"), "utf8"),
  readFile(resolve(repoRoot, "android/README.md"), "utf8"),
  readFile(resolve(repoRoot, "docs/development.md"), "utf8"),
]);

assert.match(
  rootReadme,
  /桌面端安装后可以在「设置」里修改服务器地址/,
  "README.md must explain installed desktop users can edit the server address in Settings",
);
assert.match(
  rootReadme,
  /Android 端可以在登录 \/ 注册页的「连接设置」或设置页修改服务器地址/,
  "README.md must explain Android users can edit the server address before sign-in or in Settings",
);
assert.match(
  deployReadme,
  /桌面端可以在设置页修改服务器地址/,
  "deploy/README.md must explain installed desktop users can edit the server address in Settings",
);
assert.match(
  troubleshootingReadme,
  /桌面端可以在设置页直接修改服务器地址/,
  "docs/troubleshooting.md must explain installed desktop users can edit the server address in Settings",
);
assert.match(
  androidReadme,
  /安装后也可以在登录 \/ 注册页的「连接设置」或 App 设置页修改服务器地址/,
  "android/README.md must describe installed Android endpoint edits as server address edits",
);
for (const source of [rootReadme, deployReadme, troubleshootingReadme, androidReadme]) {
  assert.doesNotMatch(
    source,
    /修改 API 地址和 WebSocket 地址|修改这两个地址/,
    "user-facing docs must not describe normal connection setup as editing two technical endpoints",
  );
  assert.match(source, /服务器地址/, "user-facing docs must mention server address");
}
assert.match(
  developmentReadme,
  /http:\/\/192\.168\.1\.10:8080\s*```/,
  "development docs normal setup example must show a single server address",
);
assert.doesNotMatch(
  rootReadme,
  /electron-store/,
  "README.md must not document electron-store after desktop settings moved to lightweight JSON storage",
);

assert.doesNotMatch(
  rootReadme,
  /桌面端安装后不在「设置」里展示或修改 API 地址和 WebSocket 地址/,
  "README.md must not tell users installed desktop endpoints are locked after installation",
);
assert.match(
  developmentReadme,
  /轻量 JSON 配置/,
  "development docs technology stack must mention the current desktop settings storage",
);
assert.match(
  developmentReadme,
  /桌面端主题/,
  "development docs must document the desktop theme feature",
);
for (const script of [
  "check:auth-session-config",
  "check:package-size-config",
  "check:quick-add-parser",
  "check:task-order",
  "check:sync-push",
  "check:sync-diagnostics",
  "check:sync-recovery-center",
  "check:desktop-theme",
  "check:desktop-efficiency",
  "check:desktop-docs",
  "check:release-artifacts",
  "check:ci-workflows",
  "check:contract-drift",
]) {
  assert.match(developmentReadme, new RegExp(script), `development docs must list ${script} in desktop verification commands`);
}
assert.match(
  deployReadme,
  /构建时注入的地址会作为首次启动默认值/,
  "deploy/README.md must describe build-time desktop endpoints as editable defaults",
);
assert.match(
  troubleshootingReadme,
  /发布版会把构建时注入的地址作为默认值/,
  "docs/troubleshooting.md must describe build-time desktop endpoints as editable defaults",
);
assert.match(
  desktopReadme,
  /npm run check:auth-session-config/,
  "desktop/README.md must list the auth session guard check",
);
assert.match(
  desktopReadme,
  /npm run check:desktop-theme/,
  "desktop/README.md must list the desktop theme guard check",
);
assert.match(
  desktopReadme,
  /npm run check:desktop-efficiency/,
  "desktop/README.md must list the desktop efficiency guard check",
);
assert.match(
  desktopReadme,
  /npm run check:sync-recovery-center/,
  "desktop/README.md must list the sync recovery center guard check",
);
assert.match(
  desktopReadme,
  /npm run check:desktop-docs/,
  "desktop/README.md must list the desktop docs consistency check",
);
assert.match(
  desktopReadme,
  /npm run check:release-artifacts/,
  "desktop/README.md must list the release artifacts guard check",
);
assert.match(
  desktopReadme,
  /npm run check:contract-drift/,
  "desktop/README.md must list the cross-client contract drift check",
);
assert.match(
  desktopReadme,
  /桌面端主题/,
  "desktop/README.md must document desktop theme switching",
);

console.log("desktop docs consistency check passed");
