/// <reference types="vite/client" />

import type { TaskBridge } from "../common/bridge";

export {};

declare global {
  interface Window {
    taskBridge?: TaskBridge;
  }
}
