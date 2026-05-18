import { globalShortcut } from "electron";

import { toggleFloatingWindow } from "./floating-window";
import { showTaskNotification } from "./notification";
import { getSettings, windows } from "./state";

export function registerGlobalShortcuts(): void {
  globalShortcut.register("CommandOrControl+Alt+T", () => {
    toggleFloatingWindow();
  });

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    windows.mainWindow?.show();
    windows.mainWindow?.webContents.send("taskbridge:quick-add");
    windows.floatingWindow?.webContents.send("taskbridge:quick-add");
    showTaskNotification("TaskBridge", getSettings().language === "en-US" ? "Quick add is ready." : "快速添加已就绪。");
  });
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
}
