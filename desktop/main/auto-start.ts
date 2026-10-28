import { app } from "electron";

import { settingsStore } from "./state";

export function setAutoStart(enabled: boolean): void {
  settingsStore.set("autoStart", enabled);
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: ["--hidden"],
  });
}

export function getAutoStart(): boolean {
  return app.getLoginItemSettings().openAtLogin || settingsStore.get("autoStart");
}
