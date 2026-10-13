export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowLayoutState {
  bounds: WindowBounds;
  maximized: boolean;
}

export interface WindowSizeLimits {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export function normalizeWindowBounds(value: unknown): WindowBounds | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const keys = ["x", "y", "width", "height"] as const;
  if (keys.some((key) => typeof candidate[key] !== "number" || !Number.isFinite(candidate[key]))) return null;
  const bounds = Object.fromEntries(keys.map((key) => [key, Math.round(candidate[key] as number)])) as unknown as WindowBounds;
  if (keys.some((key) => Math.abs(bounds[key]) > 2_147_483_647) || bounds.width < 1 || bounds.height < 1) return null;
  return bounds;
}

export function clampWindowBounds(
  bounds: WindowBounds,
  workAreas: readonly WindowBounds[],
  limits: WindowSizeLimits = {},
): WindowBounds {
  const current = normalizeWindowBounds(bounds) ?? { x: 0, y: 0, width: 1120, height: 760 };
  const areas = workAreas.map(normalizeWindowBounds).filter((area): area is WindowBounds => area !== null);
  if (areas.length === 0) return current;
  const area = areas.reduce((best, candidate) => {
    const overlap = intersectionArea(current, candidate) - intersectionArea(current, best);
    if (overlap > 0 || (overlap === 0 && distanceToArea(current, candidate) < distanceToArea(current, best))) return candidate;
    return best;
  });
  const width = Math.min(area.width, limits.maxWidth ?? Infinity, Math.max(limits.minWidth ?? 1, current.width));
  const height = Math.min(area.height, limits.maxHeight ?? Infinity, Math.max(limits.minHeight ?? 1, current.height));
  return {
    x: Math.round(Math.min(Math.max(current.x, area.x), area.x + area.width - width)),
    y: Math.round(Math.min(Math.max(current.y, area.y), area.y + area.height - height)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function sameWindowBounds(left: WindowBounds, right: WindowBounds): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function intersectionArea(bounds: WindowBounds, area: WindowBounds): number {
  const width = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
  const height = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
  return width * height;
}

function distanceToArea(bounds: WindowBounds, area: WindowBounds): number {
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const dx = Math.max(area.x - x, 0, x - area.x - area.width);
  const dy = Math.max(area.y - y, 0, y - area.y - area.height);
  return dx * dx + dy * dy;
}
