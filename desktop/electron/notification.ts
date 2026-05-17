import { Notification } from "electron";

export function showTaskNotification(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({
    title,
    body,
    silent: false,
  }).show();
}

