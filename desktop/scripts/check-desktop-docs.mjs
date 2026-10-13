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
  /Windows 和 Android 发布包固定使用构建时写入的服务地址/,
  "README.md must explain packaged endpoint configuration",
);
assert.match(
  rootReadme,
  /普通使用不需要配置服务器地址/,
  "README.md must keep endpoint setup out of ordinary sign-in",
);
assert.match(
  deployReadme,
  /发布版桌面和 Android 客户端固定使用构建时注入的 API \/ WebSocket 地址/,
  "deployment docs must describe fixed release endpoints",
);
assert.match(
  troubleshootingReadme,
  /普通用户无法在发布包内修改服务地址/,
  "troubleshooting docs must direct endpoint changes to the publisher",
);
assert.match(
  androidReadme,
  /Release 包固定使用构建地址/,
  "Android docs must describe bundled endpoints",
);
for (const source of [rootReadme, deployReadme, troubleshootingReadme, androidReadme]) {
  assert.doesNotMatch(
    source,
    /修改 API 地址和 WebSocket 地址|修改这两个地址/,
    "user-facing docs must not describe normal connection setup as editing two technical endpoints",
  );
  assert.match(source, /服务(?:器)?地址/, "docs must explain how the service address is provided");
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
  /服务入口变更后应重新构建并发布客户端/,
  "deployment docs must require a new release when the endpoint changes",
);
assert.match(
  troubleshootingReadme,
  /如果发布包内置地址有误，更新仓库 Variables 并重新构建安装包/,
  "troubleshooting docs must require rebuilding an incorrectly configured release",
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
