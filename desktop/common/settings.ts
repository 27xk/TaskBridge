import type { AppLanguage } from "./language";
import type { DesktopThemeId } from "./desktop-theme";

export interface AppSettings {
  baseUrl: string;
  wsUrl: string;
  connectionLocked: boolean;
  currentUserId: number | null;
  language: AppLanguage;
  desktopTheme: DesktopThemeId;
  desktopDensity: "comfortable" | "compact";
  desktopGlassEnabled: boolean;
  displayTimeZone: string;
  deviceId: string;
  lastSyncTime: string;
  autoStart: boolean;
  floatingOpacity: number;
  floatingVisibleOnStart: boolean;
  floatingX: number | null;
  floatingY: number | null;
  floatingWidth: number;
  floatingHeight: number;
}
