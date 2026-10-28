export const DESKTOP_THEME_OPTIONS = [
  { value: "warm", zh: "暖沙", en: "Warm sand", swatches: ["#f4f2ed", "#18211f", "#2f6f62", "#ece1a6"] },
  { value: "mist", zh: "晨雾", en: "Morning mist", swatches: ["#eef4f6", "#10232a", "#2f7f92", "#d8edf2"] },
  { value: "forest", zh: "松林", en: "Pine grove", swatches: ["#eef2e8", "#1b231b", "#5c7f3b", "#e0eac7"] },
  { value: "harbor", zh: "海港", en: "Harbor", swatches: ["#f0f4f3", "#13252f", "#d9734f", "#d8e8ea"] },
  { value: "rose", zh: "玫瑰灰", en: "Rose gray", swatches: ["#f5f1f3", "#2a2027", "#a84f66", "#ead5dc"] },
] as const;

export type DesktopThemeOption = (typeof DESKTOP_THEME_OPTIONS)[number];

export type DesktopThemeId = DesktopThemeOption["value"];

export const DESKTOP_THEME_IDS = DESKTOP_THEME_OPTIONS.map((theme) => theme.value) as readonly DesktopThemeId[];

export const DEFAULT_DESKTOP_THEME: DesktopThemeId = "warm";

export function normalizeDesktopTheme(value: unknown): DesktopThemeId {
  return typeof value === "string" && DESKTOP_THEME_IDS.includes(value as DesktopThemeId)
    ? (value as DesktopThemeId)
    : DEFAULT_DESKTOP_THEME;
}
