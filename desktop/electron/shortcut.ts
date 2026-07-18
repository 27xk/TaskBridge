import { globalShortcut } from "electron";

import { toggleFloatingWindow } from "./floating-window";
import { showTaskNotification } from "./notification";
import { getSettings, windows } from "./state";

export function registerGlobalShortcuts(): void {
  const failedShortcuts: string[] = [];
  registerShortcut("CommandOrControl+Alt+T", () => {
    toggleFloatingWindow();
  }, failedShortcuts);

  registerShortcut("CommandOrControl+Shift+Space", () => {
    windows.mainWindow?.show();
    windows.mainWindow?.webContents.send("taskbridge:quick-add");
    windows.floatingWindow?.webContents.send("taskbridge:quick-add");
    showTaskNotification("TaskBridge", getSettings().language === "en-US" ? "Quick add is ready." : "快速添加已就绪。");
  }, failedShortcuts);

  if (failedShortcuts.length > 0) {
    console.warn("[TaskBridge] shortcut registration failed", failedShortcuts);
    const english = getSettings().language === "en-US";
    showTaskNotification(
      "TaskBridge",
      english
        ? `Global shortcut registration failed: ${failedShortcuts.join(", ")}. Another app may already use it.`
        : `全局快捷键注册失败：${failedShortcuts.join("、")}。可能已被其他应用占用。`,
    );
  }
}

function registerShortcut(accelerator: string, callback: () => void, failures: string[]): void {
  const registered = globalShortcut.register(accelerator, callback);
  if (!registered) failures.push(accelerator);
}

export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
}
