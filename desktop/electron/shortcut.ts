import { globalShortcut } from "electron";

import { toggleFloatingWindow } from "./floating-window";
import { showTaskNotification } from "./notification";
import { windows } from "./state";

export function registerGlobalShortcuts(): void {
  globalShortcut.register("CommandOrControl+Alt+T", () => {
    toggleFloatingWindow();
  });

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    windows.mainWindow?.show();
    windows.mainWindow?.webContents.send("taskbridge:quick-add");
    windows.floatingWindow?.webContents.send("taskbridge:quick-add");
    showTaskNotification("TaskBridge", "Quick add is ready.");
  });
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
}
