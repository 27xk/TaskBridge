export const MUTABLE_APP_SETTING_KEYS = [
  "language",
  "desktopTheme",
  "displayTimeZone",
  "lastSyncTime",
  "autoStart",
  "floatingOpacity",
  "floatingVisibleOnStart",
] as const;

export type MutableAppSettingKey = (typeof MUTABLE_APP_SETTING_KEYS)[number];

const MUTABLE_APP_SETTING_KEY_SET = new Set<string>(MUTABLE_APP_SETTING_KEYS);

export function isMutableAppSettingKey(value: string): value is MutableAppSettingKey {
  return MUTABLE_APP_SETTING_KEY_SET.has(value);
}
