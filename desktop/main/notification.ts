import { Notification } from "electron";

import { windows } from "./state";

export function showTaskNotification(title: string, body: string, localId?: string): void {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title,
    body,
    silent: false,
  });
  if (localId) {
    notification.on("click", () => {
      const mainWindow = windows.mainWindow;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("taskbridge:open-task-detail", localId);
    });
  }
  notification.show();
}
