import assert from "node:assert/strict";
import test from "node:test";

import { loadTsModule } from "./helpers/load-ts-module.mjs";

const {
  formatConnectionFailureMessage,
  getUserFacingConnectionErrorDetail,
} = await loadTsModule("shared/user-facing-errors.ts");

test("connection failures hide raw network exception details", () => {
  const raw = new Error("API request failed: http://127.0.0.1:8000/api/v1/sync/status (connect ECONNREFUSED 127.0.0.1:8000)");
  const detail = getUserFacingConnectionErrorDetail(raw, "zh-CN");

  assert.equal(detail, "无法连接服务器，请检查服务器地址、网络或服务是否已启动。");
  assert.doesNotMatch(detail, /ECONNREFUSED|127\.0\.0\.1|api\/v1/);
});

test("server failures are described without leaking raw HTTP details", () => {
  const detail = getUserFacingConnectionErrorDetail(new Error("API request failed: https://taskbridge.example/api/v1/sync/status (HTTP 503)"), "en-US");

  assert.equal(detail, "The server is temporarily unavailable. Try again later.");
  assert.doesNotMatch(detail, /HTTP 503|api\/v1/);
});

test("unknown connection failures fall back to a practical next step", () => {
  const message = formatConnectionFailureMessage(new Error("SSL routines:certificate verify failed"), "Connection failed: ", "en-US");

  assert.equal(message, "Connection failed: Connection check failed. Check the server address or contact the server administrator.");
  assert.doesNotMatch(message, /SSL routines|certificate verify failed/);
});
