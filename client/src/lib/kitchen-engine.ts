export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
}

export type CabinetType = "base" | "wall_cabinet" | "tall" | "island";
export type LayerType = CabinetType | "end_panel" | "filler" | "drawer";
export type OpeningType = "door" | "window";

export interface Cabinet {
  id: string;
  type: CabinetType;
  start: Point;
  end: Point;
  depth: number;
  length: number;
  wallId?: string;
  depthFlipped?: boolean;
  rotation?: number;
  layerId?: string;
}

// Free-floating island placed via reference wall + offset rail.
// NOT a subtype of Cabinet — see 2026-04-15 island redesign plan.
export interface Island {
  id: string;
  layerId: string;              // FK to a Layer (type === "island")
  referenceWallId: string;      // FK to Wall
  offsetFromWallCm: number;     // perpendicular distance from reference wall
  depthSide: "near" | "far";    // which side of rail the depth grew toward
  anchorPoint: Point;           // first corner (click 2) in canvas pixels
  lengthCm: number;             // along-rail dimension
  depthCm: number;              // perpendicular-to-rail dimension
  rotationRad: number;          // wall angle at placement time
  heightCm: number;             // counter height (typed only, not drawn)
  /**
   * Which axis the `lengthCm` dimension runs along in world coords:
   *   - "h": length is horizontal, depth is vertical (default / legacy)
   *   - "v": length is vertical, depth is horizontal
   * Set during the free-draw flow based on the user's first drag direction.
   * Optional for backwards compatibility; renderer treats `undefined` as "h".
   */
  axis?: "h" | "v";
}

export interface Layer {
  id: string;
  type: LayerType;
  depth: number | null;
  height: number | null;
  finishId: number | null;
  endPanelVariant?: "base" | "wall" | "decorative";
  endPanelWallArea?: number;
  endPanelDecorHeight?: number;
  qty?: number;
  cabinetIds: string[];
}

export interface Guideline {
  id: string;
  start: Point;
  end: Point;
}

export interface Opening {
  id: string;
  type: OpeningType;
  start: Point;
  end: Point;
  length: number;
  wallId?: string;
}

export interface DrawingState {
  tool: "wall" | "base" | "wall_cabinet" | "tall" | "door" | "window" | "select" | "delete" | "pan";
  startPoint: Point | null;
  previewPoint: Point | null;
  isDrawing: boolean;
  walls: Wall[];
  cabinets: Cabinet[];
  openings: Opening[];
  selectedId: string | null;
  snapEnabled: boolean;
  gridEnabled: boolean;
  unit: "cm" | "m";
}

export interface SnapResult {
  point: Point;
  type: "corner" | "endpoint" | "midpoint" | "grid";
  targetId?: string;
}

export interface SnapTarget {
  point: Point;
  type: "corner" | "endpoint" | "midpoint" | "grid";
  targetId?: string;
  distance: number;
}

export const CABINET_DEPTHS: Record<CabinetType, number> = {
  base: 60,
  wall_cabinet: 35,
  tall: 60,
  island: 60,
};

/**
 * Extra depth in cm added to the RENDERED rectangle of every cabinet.
 * Purely visual — stored `cabinet.depth`, pricing, clearance checks, and
 * overlap tests all use the real depth. This bonus represents the countertop
 * / finishing overhang so the drawn shape reflects the real occupied footprint
 * (e.g. a 55 cm base cabinet visually occupies 57 cm).
 */
export const CABINET_RENDER_DEPTH_BONUS = 2;

/** Depth in cm to use when drawing a cabinet (data + visual overhang). */
export function getRenderDepthCm(cabinet: { depth: number }): number {
  return cabinet.depth + CABINET_RENDER_DEPTH_BONUS;
}

export const DEFAULT_HEIGHTS: Record<LayerType, number> = {
  base: 90,
  wall_cabinet: 60,
  tall: 210,
  island: 90,
  end_panel: 90,
  filler: 90,
  drawer: 90,
};

export function normalizeLayer(raw: any): Layer {
  const out = { ...raw };
  // Legacy: divider → end_panel (with base variant default)
  if (out.type === "divider") {
    out.type = "end_panel";
    out.endPanelVariant = out.endPanelVariant ?? "base";
    out.qty = out.qty ?? out.count ?? 1;
  }
  // Legacy: finishId stringified → number
  if (typeof out.finishId === "string") {
    const n = parseInt(out.finishId, 10);
    out.finishId = Number.isFinite(n) ? n : null;
  }
  // Ensure cabinetIds exists
  if (!Array.isArray(out.cabinetIds)) out.cabinetIds = [];
  return out as Layer;
}

export const PIXELS_PER_CM = 2;

/** Default wall thickness in cm. */
export const WALL_THICKNESS_CM = 10;
/** Default wall thickness in canvas pixels. 10 cm × 2 px/cm = 20 px. */
export const WALL_THICKNESS = WALL_THICKNESS_CM * PIXELS_PER_CM;

/**
 * Magnetic snap radius in canvas pixels. When the cursor comes within this
 * distance of a snap target (wall corner, endpoint, midpoint, cabinet edge,
 * opening edge), it is pulled onto the target. Raised from 12 to 18 to give
 * a clearly "magnetic" feel while still allowing free placement between
 * existing geometry.
 */
export const SNAP_RADIUS = 18;

export interface CabinetStyle {
  fill: string;
  stroke: string;
  fillOpacity: number;
  textColor: string;
  label: string;
}

export const CABINET_STYLES: Record<CabinetType, CabinetStyle> = {
  base: {
    fill: "#DBEAFE",
    stroke: "#3B82F6",
    fillOpacity: 0.7,
    textColor: "#2563EB",
    label: "BC",
  },
  wall_cabinet: {
    fill: "#D1FAE5",
    stroke: "#22C55E",
    fillOpacity: 0.55,
    textColor: "#16A34A",
    label: "WC",
  },
  tall: {
    fill: "#EDE9FE",
    stroke: "#A855F7",
    fillOpacity: 0.65,
    textColor: "#7C3AED",
    label: "TC",
  },
  island: {
    fill: "#FEF3C7",
    stroke: "#F59E0B",
    fillOpacity: 0.7,
    textColor: "#D97706",
    label: "IC",
  },
};

export const CABINET_COLORS: Record<CabinetType, string> = {
  base: "#3B82F6",
  wall_cabinet: "#22C55E",
  tall: "#A855F7",
  island: "#F59E0B",
};

export interface OpeningStyle {
  fill: string;
  stroke: string;
  fillOpacity: number;
  textColor: string;
  label: string;
}

export const OPENING_STYLES: Record<OpeningType, OpeningStyle> = {
  door: {
    fill: "#FED7AA",
    stroke: "#EA580C",
    fillOpacity: 0.7,
    textColor: "#C2410C",
    label: "DR",
  },
  window: {
    fill: "#CFFAFE",
    stroke: "#0891B2",
    fillOpacity: 0.6,
    textColor: "#0E7490",
    label: "WN",
  },
};

export const CLEARANCE_DEPTHS: Record<OpeningType, number> = {
  door: 0,
  window: 0,
};

export function distanceBetween(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function toLocalSpace(pt: Point, origin: Point, angleRad: number): Point {
  const dx = pt.x - origin.x;
  const dy = pt.y - origin.y;
  const cos = Math.cos(-angleRad);
  const sin = Math.sin(-angleRad);
  return {
    x: dx * cos - dy * sin,
    y: dx * sin + dy * cos
  };
}

export function pointOnSegment(
  p: Point,
  segStart: Point,
  segEnd: Point,
  tolerance: number = 2,
): boolean {
  const d1 = distanceBetween(p, segStart);
  const d2 = distanceBetween(p, segEnd);
  const segLen = distanceBetween(segStart, segEnd);
  return Math.abs(d1 + d2 - segLen) < tolerance;
}

export function nearestPointOnSegment(
  p: Point,
  segStart: Point,
  segEnd: Point,
): Point {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return { ...segStart };

  let t = ((p.x - segStart.x) * dx + (p.y - segStart.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy,
  };
}

export function angleBetween(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function getWallCorners(walls: Wall[]): SnapTarget[] {
  const corners: SnapTarget[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = walls[i];
      const w2 = walls[j];
      const endpoints1 = [w1.start, w1.end];
      const endpoints2 = [w2.start, w2.end];

      for (const p1 of endpoints1) {
        for (const p2 of endpoints2) {
          if (distanceBetween(p1, p2) < SNAP_RADIUS) {
            const key = `${Math.round(p1.x)},${Math.round(p1.y)}`;
            if (!seen.has(key)) {
              seen.add(key);
              corners.push({
                point: p1,
                type: "corner",
                targetId: `${w1.id}-${w2.id}`,
                distance: 0,
              });
            }
          }
        }
      }
    }
  }

  return corners;
}

function getWallEndpoints(walls: Wall[]): SnapTarget[] {
  // Only inner-face endpoints are snappable. The user explicitly said the
  // start point of the next wall must be an interior point/corner of the room
  // — so outer corners (start/end + outwardNormal × thickness) are NOT
  // included here. This also ensures `findAnchorWallByInnerFace` will detect
  // the anchor wall and apply the inner-face orientation rule.
  const endpoints: SnapTarget[] = [];
  for (const wall of walls) {
    endpoints.push({
      point: wall.start,
      type: "endpoint",
      targetId: wall.id,
      distance: 0,
    });
    endpoints.push({
      point: wall.end,
      type: "endpoint",
      targetId: wall.id,
      distance: 0,
    });
  }
  return endpoints;
}

function getWallMidpoints(walls: Wall[]): SnapTarget[] {
  return walls.map((wall) => ({
    point: midpoint(wall.start, wall.end),
    type: "midpoint" as const,
    targetId: wall.id,
    distance: 0,
  }));
}

export function findNearestSnapTarget(
  point: Point,
  walls: Wall[],
  cabinets: Cabinet[],
  snapRadius: number = SNAP_RADIUS,
  openings: Opening[] = [],
): SnapResult | null {
  const allTargets: SnapTarget[] = [];

  const corners = getWallCorners(walls);
  for (const c of corners) {
    c.distance = distanceBetween(point, c.point);
    if (c.distance <= snapRadius) allTargets.push(c);
  }

  const bestCorner = allTargets
    .filter((t) => t.type === "corner")
    .sort((a, b) => a.distance - b.distance)[0];
  if (bestCorner) {
    return {
      point: bestCorner.point,
      type: bestCorner.type,
      targetId: bestCorner.targetId,
    };
  }

  const endpoints = getWallEndpoints(walls);
  for (const ep of endpoints) {
    ep.distance = distanceBetween(point, ep.point);
    if (ep.distance <= snapRadius) allTargets.push(ep);
  }

  const cabinetEndpoints: SnapTarget[] = [];
  for (const cab of cabinets) {
    cabinetEndpoints.push({
      point: cab.start,
      type: "endpoint",
      targetId: cab.id,
      distance: distanceBetween(point, cab.start),
    });
    cabinetEndpoints.push({
      point: cab.end,
      type: "endpoint",
      targetId: cab.id,
      distance: distanceBetween(point, cab.end),
    });
  }
  for (const ep of cabinetEndpoints) {
    if (ep.distance <= snapRadius) allTargets.push(ep);
  }

  for (const op of openings) {
    const startDist = distanceBetween(point, op.start);
    if (startDist <= snapRadius) {
      allTargets.push({ point: op.start, type: "endpoint", targetId: op.id, distance: startDist });
    }
    const endDist = distanceBetween(point, op.end);
    if (endDist <= snapRadius) {
      allTargets.push({ point: op.end, type: "endpoint", targetId: op.id, distance: endDist });
    }
  }

  const bestEndpoint = allTargets
    .filter((t) => t.type === "endpoint")
    .sort((a, b) => a.distance - b.distance)[0];
  if (bestEndpoint) {
    return {
      point: bestEndpoint.point,
      type: bestEndpoint.type,
      targetId: bestEndpoint.targetId,
    };
  }

  const midpoints = getWallMidpoints(walls);
  for (const mp of midpoints) {
    mp.distance = distanceBetween(point, mp.point);
    if (mp.distance <= snapRadius) {
      return {
        point: mp.point,
        type: mp.type,
        targetId: mp.targetId,
      };
    }
  }

  return null;
}

export function connectWalls(
  newWallEnd: Point,
  existingWalls: Wall[],
  snapRadius: number = SNAP_RADIUS,
): { point: Point; connectedWallId: string | null } {
  for (const wall of existingWalls) {
    if (distanceBetween(newWallEnd, wall.start) <= snapRadius) {
      return { point: { ...wall.start }, connectedWallId: wall.id };
    }
    if (distanceBetween(newWallEnd, wall.end) <= snapRadius) {
      return { point: { ...wall.end }, connectedWallId: wall.id };
    }
  }

  for (const wall of existingWalls) {
    const nearest = nearestPointOnSegment(newWallEnd, wall.start, wall.end);
    if (distanceBetween(newWallEnd, nearest) <= snapRadius) {
      return { point: nearest, connectedWallId: wall.id };
    }
  }

  return { point: newWallEnd, connectedWallId: null };
}

export function normalizeAngle(angle: number): number {
  const deg = ((angle * 180) / Math.PI) % 360;
  const normalized = deg < 0 ? deg + 360 : deg;
  const snappedAngles = [0, 90, 180, 270, 360];
  for (const snap of snappedAngles) {
    if (Math.abs(normalized - snap) < 5) {
      return (snap * Math.PI) / 180;
    }
  }
  return angle;
}

export function splitCabinet(
  cabinet: Cabinet,
  splitOffset: number,
): [Cabinet, Cabinet] | null {
  const totalLen = distanceBetween(cabinet.start, cabinet.end);
  if (splitOffset <= 5 || splitOffset >= totalLen - 5) return null;

  const ratio = splitOffset / totalLen;
  const splitPoint: Point = {
    x: cabinet.start.x + (cabinet.end.x - cabinet.start.x) * ratio,
    y: cabinet.start.y + (cabinet.end.y - cabinet.start.y) * ratio,
  };

  const cab1: Cabinet = {
    id: `${cabinet.id}_split1`,
    type: cabinet.type,
    start: { ...cabinet.start },
    end: { ...splitPoint },
    depth: cabinet.depth,
    length: splitOffset,
    wallId: cabinet.wallId,
    depthFlipped: cabinet.depthFlipped,
  };

  const cab2: Cabinet = {
    id: `${cabinet.id}_split2`,
    type: cabinet.type,
    start: { ...splitPoint },
    end: { ...cabinet.end },
    depth: cabinet.depth,
    length: totalLen - splitOffset,
    wallId: cabinet.wallId,
    depthFlipped: cabinet.depthFlipped,
  };

  return [cab1, cab2];
}

export function splitBaseCabinet(
  baseCabinet: Cabinet,
  tallOffset: number,
): [Cabinet, Cabinet] | null {
  return splitCabinet(baseCabinet, tallOffset);
}

export function projectPointOnSegment(
  p: Point,
  segStart: Point,
  segEnd: Point,
): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return ((p.x - segStart.x) * dx + (p.y - segStart.y) * dy) / lenSq;
}

function areSegmentsParallel(
  a1: Point, a2: Point,
  b1: Point, b2: Point,
  angleTolerance: number = 0.15,
): boolean {
  const angleA = Math.atan2(a2.y - a1.y, a2.x - a1.x);
  const angleB = Math.atan2(b2.y - b1.y, b2.x - b1.x);
  let diff = Math.abs(angleA - angleB) % Math.PI;
  if (diff > Math.PI / 2) diff = Math.PI - diff;
  return diff < angleTolerance;
}

function lateralDistanceToLine(
  p: Point,
  lineStart: Point,
  lineEnd: Point,
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return distanceBetween(p, lineStart);
  return Math.abs((p.x - lineStart.x) * dy - (p.y - lineStart.y) * dx) / len;
}

/**
 * Returns true if two rotated rectangles (4 corner points each) overlap.
 * Uses Separating Axis Theorem with the 4 unique edge axes (2 per rect).
 * 0.5 px tolerance so cabinets that just touch corners aren't considered overlapping.
 */
function rectanglesOverlap(rectA: Point[], rectB: Point[]): boolean {
  const axes = [
    { x: rectA[1].x - rectA[0].x, y: rectA[1].y - rectA[0].y },
    { x: rectA[3].x - rectA[0].x, y: rectA[3].y - rectA[0].y },
    { x: rectB[1].x - rectB[0].x, y: rectB[1].y - rectB[0].y },
    { x: rectB[3].x - rectB[0].x, y: rectB[3].y - rectB[0].y },
  ];
  for (const a of axes) {
    const len = Math.hypot(a.x, a.y);
    if (len < 1e-6) continue;
    const nx = a.x / len;
    const ny = a.y / len;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const p of rectA) {
      const proj = p.x * nx + p.y * ny;
      if (proj < aMin) aMin = proj;
      if (proj > aMax) aMax = proj;
    }
    for (const p of rectB) {
      const proj = p.x * nx + p.y * ny;
      if (proj < bMin) bMin = proj;
      if (proj > bMax) bMax = proj;
    }
    if (aMax < bMin + 0.5 || bMax < aMin + 0.5) return false;
  }
  return true;
}

export function findOverlappingCabinets(
  tallStart: Point,
  tallEnd: Point,
  cabinets: Cabinet[],
  types: CabinetType[] = ["base", "wall_cabinet"],
  // Optional: when provided, also detects perpendicular 2D corner overlap
  // (e.g. corner TC's rectangle intersecting a BC on an adjacent wall).
  cutterCabinet?: Cabinet,
): Cabinet[] {
  return cabinets.filter((c) => {
    if (!types.includes(c.type)) return false;
    if (cutterCabinet && c.id === cutterCabinet.id) return false;

    const cabLen = distanceBetween(c.start, c.end);
    if (cabLen < 1) return false;

    // ── Existing: parallel same-wall overlap ────────────────────────────
    if (areSegmentsParallel(tallStart, tallEnd, c.start, c.end)) {
      const lateralDist = Math.min(
        lateralDistanceToLine(tallStart, c.start, c.end),
        lateralDistanceToLine(tallEnd, c.start, c.end),
      );
      if (lateralDist <= 15) {
        const tTallStart = projectPointOnSegment(tallStart, c.start, c.end);
        const tTallEnd = projectPointOnSegment(tallEnd, c.start, c.end);
        const tMin = Math.min(tTallStart, tTallEnd);
        const tMax = Math.max(tTallStart, tTallEnd);
        const overlapStart = Math.max(0, tMin);
        const overlapEnd = Math.min(1, tMax);
        if (overlapEnd - overlapStart > 0.001) return true;
      }
    }

    // ── New: 2D rectangle overlap (catches perpendicular corner case) ──
    if (cutterCabinet) {
      const cutterRect = getCabinetRect(cutterCabinet, getDepthAngle(cutterCabinet));
      const targetRect = getCabinetRect(c, getDepthAngle(c));
      if (rectanglesOverlap(cutterRect, targetRect)) return true;
    }

    return false;
  });
}

export interface SplitResult {
  before: Cabinet | null;
  after: Cabinet | null;
  consumed: boolean;
}

const MIN_SEGMENT_PX = 5;

export function splitCabinetAroundTall(
  cabinet: Cabinet,
  tallStart: Point,
  tallEnd: Point,
  // Optional: when provided, the cutter's full 2D rectangle is projected onto
  // the cabinet's axis — this enables PERPENDICULAR corner cuts (TC at corner
  // shortens a BC on the adjacent wall by the TC's depth).
  cutterCabinet?: Cabinet,
): SplitResult {
  const cabLen = distanceBetween(cabinet.start, cabinet.end);
  if (cabLen < 1) return { before: null, after: null, consumed: true };

  // Default: project the cutter's start/end (works for parallel same-wall case)
  let tMin: number;
  let tMax: number;

  if (cutterCabinet) {
    // Project ALL 4 corners of the cutter's rectangle onto the cabinet's axis.
    // For perpendicular corner cuts, this yields a clip range equal to the
    // cutter's depth, instead of a near-zero range from endpoint projection.
    const cutterRect = getCabinetRect(cutterCabinet, getDepthAngle(cutterCabinet));
    let lo = Infinity;
    let hi = -Infinity;
    for (const corner of cutterRect) {
      const t = projectPointOnSegment(corner, cabinet.start, cabinet.end);
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    tMin = lo;
    tMax = hi;
  } else {
    const tTallStart = projectPointOnSegment(tallStart, cabinet.start, cabinet.end);
    const tTallEnd = projectPointOnSegment(tallEnd, cabinet.start, cabinet.end);
    tMin = Math.min(tTallStart, tTallEnd);
    tMax = Math.max(tTallStart, tTallEnd);
  }

  const clipStart = Math.max(0, tMin);
  const clipEnd = Math.min(1, tMax);

  if (clipEnd - clipStart < 0.001) {
    return {
      before: { ...cabinet },
      after: null,
      consumed: false,
    };
  }

  let before: Cabinet | null = null;
  let after: Cabinet | null = null;

  const beforeLen = clipStart * cabLen;
  if (beforeLen > MIN_SEGMENT_PX) {
    const endPoint: Point = {
      x: cabinet.start.x + (cabinet.end.x - cabinet.start.x) * clipStart,
      y: cabinet.start.y + (cabinet.end.y - cabinet.start.y) * clipStart,
    };
    before = {
      id: `${cabinet.id}_before`,
      type: cabinet.type,
      start: { ...cabinet.start },
      end: endPoint,
      depth: cabinet.depth,
      length: beforeLen,
      wallId: cabinet.wallId,
      depthFlipped: cabinet.depthFlipped,
      layerId: cabinet.layerId,
    };
  }

  const afterLen = (1 - clipEnd) * cabLen;
  if (afterLen > MIN_SEGMENT_PX) {
    const startPoint: Point = {
      x: cabinet.start.x + (cabinet.end.x - cabinet.start.x) * clipEnd,
      y: cabinet.start.y + (cabinet.end.y - cabinet.start.y) * clipEnd,
    };
    after = {
      id: `${cabinet.id}_after`,
      type: cabinet.type,
      start: startPoint,
      end: { ...cabinet.end },
      depth: cabinet.depth,
      length: afterLen,
      wallId: cabinet.wallId,
      depthFlipped: cabinet.depthFlipped,
      layerId: cabinet.layerId,
    };
  }

  return {
    before,
    after,
    consumed: before === null && after === null,
  };
}

export function computeSplitPoints(
  cabinet: Cabinet,
  tallStart: Point,
  tallEnd: Point,
  cutterCabinet?: Cabinet,
): { splitStart: Point | null; splitEnd: Point | null; consumed: boolean } {
  const cabLen = distanceBetween(cabinet.start, cabinet.end);
  if (cabLen < 1) return { splitStart: null, splitEnd: null, consumed: true };

  let tMin: number;
  let tMax: number;

  if (cutterCabinet) {
    const cutterRect = getCabinetRect(cutterCabinet, getDepthAngle(cutterCabinet));
    let lo = Infinity;
    let hi = -Infinity;
    for (const corner of cutterRect) {
      const t = projectPointOnSegment(corner, cabinet.start, cabinet.end);
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
    tMin = lo;
    tMax = hi;
  } else {
    const tTallStart = projectPointOnSegment(tallStart, cabinet.start, cabinet.end);
    const tTallEnd = projectPointOnSegment(tallEnd, cabinet.start, cabinet.end);
    tMin = Math.min(tTallStart, tTallEnd);
    tMax = Math.max(tTallStart, tTallEnd);
  }

  const clipStart = Math.max(0, tMin);
  const clipEnd = Math.min(1, tMax);

  if (clipEnd - clipStart < 0.001) {
    return { splitStart: null, splitEnd: null, consumed: false };
  }

  const beforeLen = clipStart * cabLen;
  const afterLen = (1 - clipEnd) * cabLen;

  const splitStart = beforeLen > MIN_SEGMENT_PX ? {
    x: cabinet.start.x + (cabinet.end.x - cabinet.start.x) * clipStart,
    y: cabinet.start.y + (cabinet.end.y - cabinet.start.y) * clipStart,
  } : null;

  const splitEnd = afterLen > MIN_SEGMENT_PX ? {
    x: cabinet.start.x + (cabinet.end.x - cabinet.start.x) * clipEnd,
    y: cabinet.start.y + (cabinet.end.y - cabinet.start.y) * clipEnd,
  } : null;

  return {
    splitStart,
    splitEnd,
    consumed: beforeLen <= MIN_SEGMENT_PX && afterLen <= MIN_SEGMENT_PX,
  };
}

export function buildRoomPolygon(walls: Wall[]): Point[] | null {
  if (walls.length < 3) return null;

  const CONNECT_THRESH = SNAP_RADIUS;

  interface AdjEntry { wallId: string; endpoint: Point; otherEnd: Point }
  const adj = new Map<string, AdjEntry[]>();

  const pointKey = (p: Point) => `${Math.round(p.x)},${Math.round(p.y)}`;

  for (const w of walls) {
    const sk = pointKey(w.start);
    const ek = pointKey(w.end);
    if (!adj.has(sk)) adj.set(sk, []);
    if (!adj.has(ek)) adj.set(ek, []);
    adj.get(sk)!.push({ wallId: w.id, endpoint: w.start, otherEnd: w.end });
    adj.get(ek)!.push({ wallId: w.id, endpoint: w.end, otherEnd: w.start });
  }

  for (const w1 of walls) {
    for (const w2 of walls) {
      if (w1.id === w2.id) continue;
      const pairs: Array<[Point, Point]> = [
        [w1.start, w2.start], [w1.start, w2.end],
        [w1.end, w2.start], [w1.end, w2.end],
      ];
      for (const [p1, p2] of pairs) {
        const d = distanceBetween(p1, p2);
        if (d > 0.1 && d < CONNECT_THRESH) {
          const k1 = pointKey(p1);
          const k2 = pointKey(p2);
          const entries1 = adj.get(k1) || [];
          const entries2 = adj.get(k2) || [];
          for (const e of entries2) {
            if (!entries1.some(x => x.wallId === e.wallId)) {
              entries1.push(e);
            }
          }
          adj.set(k1, entries1);
        }
      }
    }
  }

  for (const [, entries] of adj) {
    if (entries.length !== 2) {
      return null;
    }
  }

  const startWall = walls[0];
  const visited = new Set<string>();
  const polygon: Point[] = [startWall.start];
  visited.add(startWall.id);
  let current = startWall.end;

  for (let step = 0; step < walls.length; step++) {
    const ck = pointKey(current);
    const neighbors = adj.get(ck) || [];
    let found = false;
    for (const n of neighbors) {
      if (!visited.has(n.wallId)) {
        visited.add(n.wallId);
        polygon.push(current);
        const ep = n.endpoint;
        const epDist = distanceBetween(current, ep);
        current = epDist < CONNECT_THRESH ? n.otherEnd : n.endpoint;
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  if (visited.size !== walls.length) return null;

  if (distanceBetween(current, polygon[0]) < CONNECT_THRESH && polygon.length >= 3) {
    return polygon;
  }
  return null;
}

function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  const EPS = 1e-4;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (
      ((yi > point.y + EPS) !== (yj > point.y + EPS)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi - EPS)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Raw right-hand perpendicular of `start → end` (rotated +90° clockwise in
 * screen coords, i.e. `{nx: dy/len, ny: -dx/len}`).
 *
 * This is an unanchored direction — it has no notion of "inside the room" vs
 * "outside the room". Use `computeOutwardNormal` / `computeInteriorNormal`
 * instead when you need a room-aware direction.
 */
function rawRightNormal(
  wallStart: Point,
  wallEnd: Point,
): { nx: number; ny: number } {
  const dx = wallEnd.x - wallStart.x;
  const dy = wallEnd.y - wallStart.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { nx: 0, ny: 0 };
  return { nx: dy / len, ny: -dx / len };
}

/**
 * Returns the room-aware "inside" direction for a wall segment:
 * the ±raw-perpendicular that points toward the centroid of the implied room.
 *
 * Works for closed polygons (uses the containing cycle's centroid) and for
 * open 2–3 wall layouts (uses centroid of all wall endpoints, matching the
 * system's implicit "room space").
 *
 * This is the SINGLE SOURCE OF TRUTH for which side of a wall is inside.
 * All higher-level helpers (`computeOutwardNormal`, `getWallInteriorNormal`,
 * `getWallPolygon`, etc.) derive from this.
 */
function centroidAnchoredInteriorNormal(
  wallStart: Point,
  wallEnd: Point,
  walls: Wall[],
): { nx: number; ny: number } {
  const raw = rawRightNormal(wallStart, wallEnd);
  if (raw.nx === 0 && raw.ny === 0) return raw;

  // Pick a reference centroid.
  const cycles = findAllClosedCycles(walls);
  const ownCycle = cycles.find((cycle) =>
    cycle.some(
      (w) =>
        (distanceBetween(w.start, wallStart) < 0.5 &&
          distanceBetween(w.end, wallEnd) < 0.5) ||
        (distanceBetween(w.start, wallEnd) < 0.5 &&
          distanceBetween(w.end, wallStart) < 0.5),
    ),
  );

  const referencePoints: Point[] = ownCycle
    ? ownCycle.map((w) => w.start)
    : walls.flatMap((w) => [w.start, w.end]);

  if (referencePoints.length === 0) return { nx: -raw.nx, ny: -raw.ny };

  const cx =
    referencePoints.reduce((s, p) => s + p.x, 0) / referencePoints.length;
  const cy =
    referencePoints.reduce((s, p) => s + p.y, 0) / referencePoints.length;
  const midX = (wallStart.x + wallEnd.x) / 2;
  const midY = (wallStart.y + wallEnd.y) / 2;
  const toCentroidX = cx - midX;
  const toCentroidY = cy - midY;

  const dot = raw.nx * toCentroidX + raw.ny * toCentroidY;
  return dot > 0 ? { nx: raw.nx, ny: raw.ny } : { nx: -raw.nx, ny: -raw.ny };
}

/**
 * Returns the unit vector pointing FROM the wall line OUTWARD (away from the
 * room interior). Anchored via centroid — independent of `reorientWalls`
 * convention.
 *
 * Contract: the user's drawn line `wall.start → wall.end` is the INNER face.
 * Wall bodies extrude in this `outward` direction, so the user's drawn
 * dimensions equal the interior room dimensions.
 */
export function computeOutwardNormal(
  wallStart: Point,
  wallEnd: Point,
  walls: Wall[],
): { nx: number; ny: number } {
  const inward = centroidAnchoredInteriorNormal(wallStart, wallEnd, walls);
  return { nx: -inward.nx, ny: -inward.ny };
}

/**
 * Returns the unit vector pointing FROM the wall line INTO the room interior.
 * Negation of `computeOutwardNormal`.
 */
export function computeInteriorNormal(
  wallStart: Point,
  wallEnd: Point,
  walls: Wall[],
): { nx: number; ny: number } {
  return centroidAnchoredInteriorNormal(wallStart, wallEnd, walls);
}

/**
 * Signed area of a polygon given its ordered vertices.
 * Positive = clockwise, Negative = counter-clockwise (in standard math coords).
 * In Konva/screen coords (y-down), the sign convention is inverted, but we
 * just need RELATIVE sign to decide whether to flip.
 */
function signedPolygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/**
 * Detects closed wall cycles and ensures each cycle is traversed COUNTER-CLOCKWISE
 * (signed area > 0 in screen coords, where y is inverted from math coords).
 * For any cycle that is currently clockwise, swap wall.start ↔ wall.end on every
 * wall in the cycle so `computeOutwardNormal` consistently points away from the
 * room interior.
 *
 * Walls not part of any cycle are returned unchanged.
 */
export function reorientWalls(walls: Wall[]): Wall[] {
  if (walls.length < 3) return walls.slice();

  const result = walls.map((w) => ({ ...w }));
  const near = (a: Point, b: Point) => distanceBetween(a, b) < SNAP_RADIUS;

  // Each cycle: ordered list of { idx, reversed } describing how to traverse the polygon.
  // `reversed = true` means we walk wall.end → wall.start instead of start → end.
  type CycleStep = { idx: number; reversed: boolean };
  const visited = new Set<number>();
  const cycles: CycleStep[][] = [];

  for (let startIdx = 0; startIdx < result.length; startIdx++) {
    if (visited.has(startIdx)) continue;

    const path: CycleStep[] = [{ idx: startIdx, reversed: false }];
    const inPath = new Set<number>([startIdx]);
    let currentIdx = startIdx;
    let currentEnd = result[startIdx].end; // tip of the path so far
    let closed = false;

    while (true) {
      let nextIdx = -1;
      let nextStartsAtCurrent = true;
      for (let j = 0; j < result.length; j++) {
        if (j === currentIdx) continue;
        if (inPath.has(j)) {
          // Closure check: did we wrap back to the very first wall's start?
          if (j === startIdx && near(currentEnd, result[startIdx].start)) {
            closed = true;
          }
          continue;
        }
        if (near(result[j].start, currentEnd)) { nextIdx = j; nextStartsAtCurrent = true; break; }
        if (near(result[j].end,   currentEnd)) { nextIdx = j; nextStartsAtCurrent = false; break; }
      }

      if (closed) break;
      if (nextIdx === -1) break;

      const reversed = !nextStartsAtCurrent;
      path.push({ idx: nextIdx, reversed });
      inPath.add(nextIdx);
      currentIdx = nextIdx;
      // Tip of the path = the "end" of the next wall in traversal direction
      currentEnd = reversed ? result[nextIdx].start : result[nextIdx].end;

      if (path.length > result.length) break;
    }

    if (closed && path.length >= 3) {
      cycles.push(path);
      path.forEach((step) => visited.add(step.idx));
    }
  }

  // Warn if the only walls present don't form any closed loop — useful in dev.
  if (cycles.length === 0 && walls.length >= 3) {
    console.warn('[reorientWalls] no closed cycle found among', walls.length, 'walls');
  }

  // For each cycle, compute the polygon (in traversal order) and decide whether to flip.
  // Traversal-direction polygon points: start of each wall in traversal order.
  for (const cycle of cycles) {
    const polygonPoints = cycle.map((step) =>
      step.reversed ? result[step.idx].end : result[step.idx].start,
    );
    const area = signedPolygonArea(polygonPoints);
    const cycleNeedsFlip = area > 0; // > 0 in screen coords (y-down) means we want to reverse

    // Apply swaps in ONE pass. A wall ends up swapped iff it was reversed during
    // traversal XOR the cycle as a whole needs flipping.
    for (const step of cycle) {
      const shouldSwap = step.reversed !== cycleNeedsFlip;
      if (shouldSwap) {
        const tmp = result[step.idx].start;
        result[step.idx].start = result[step.idx].end;
        result[step.idx].end = tmp;
      }
    }
  }

  return result;
}

/**
 * Returns the unit vector pointing FROM a wall INTO the room interior.
 *
 * This is the SINGLE SOURCE OF TRUTH for "which side is inside".
 * Callers: ghost preview, cabinet commit, opening commit, re-flip button.
 *
 * Works for BOTH closed rooms (via reorientWalls + computeOutwardNormal)
 * AND open walls (via partial-polygon centroid fallback — the system already
 * displays a "room space" for 2–3 unclosed walls; this picks the same side).
 *
 * IMPORTANT: Assumes `walls` has been passed through `reorientWalls()`.
 * The Zustand store guarantees this for all stored walls.
 */
export function getWallInteriorNormal(
  wall: Wall,
  walls: Wall[],
): { nx: number; ny: number } {
  return centroidAnchoredInteriorNormal(wall.start, wall.end, walls);
}

/**
 * Returns `depthFlipped` for a cabinet placed on `wall`.
 *
 * Contract with `renderCabinetBody`:
 * - Cabinet is drawn in a local frame rotated by `angleBetween(cabinet.start, cabinet.end)`.
 * - When `depthFlipped === false`, depth extends +y in that local frame.
 * - When `depthFlipped === true`, depth extends -y.
 *
 * Callers MUST ensure `cabinet.start → cabinet.end` is aligned with
 * `wall.start → wall.end` (same direction). Commit paths in DesignerCanvas.tsx
 * enforce this by reordering user drag endpoints before building the Cabinet.
 *
 * Under that contract, the correct `depthFlipped` is decided entirely by the
 * wall's interior normal — independent of cursor drag direction.
 */
export function calculateDepthDirection(
  wall: Wall,
  walls: Wall[],
): boolean {
  const interior = getWallInteriorNormal(wall, walls);
  const wallAngle = angleBetween(wall.start, wall.end);
  // Rotate world interior vector into the cabinet's local frame.
  // Local frame = world rotated by -wallAngle → local_y = -sin(a)*world_x + cos(a)*world_y.
  const localInteriorY =
    -Math.sin(wallAngle) * interior.nx + Math.cos(wallAngle) * interior.ny;
  // depthFlipped === true means depth extends -y locally.
  // We want depth to extend toward interior: localInteriorY > 0 → +y → flipped=false.
  return localInteriorY < 0;
}

export function pixelsToCm(pixels: number): number {
  return pixels / PIXELS_PER_CM;
}

export function cmToPixels(cm: number): number {
  return cm * PIXELS_PER_CM;
}

export function formatLength(pixels: number, unit: "cm" | "m"): string {
  const cm = pixelsToCm(pixels);
  if (unit === "m") {
    return `${(cm / 100).toFixed(2)} m`;
  }
  return `${Math.round(cm)} cm`;
}

export function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function createInitialDrawingState(): DrawingState {
  return {
    tool: "wall",
    startPoint: null,
    previewPoint: null,
    isDrawing: false,
    walls: [],
    cabinets: [],
    openings: [],
    selectedId: null,
    snapEnabled: true,
    gridEnabled: true,
    unit: "cm",
  };
}

export function getCabinetRect(cabinet: Cabinet, depthAngle: number) {
  const angle = angleBetween(cabinet.start, cabinet.end);
  const length = distanceBetween(cabinet.start, cabinet.end);
  const depth = cmToPixels(cabinet.depth);

  const corners: Point[] = [
    { ...cabinet.start },
    {
      x: cabinet.start.x + Math.cos(angle) * length,
      y: cabinet.start.y + Math.sin(angle) * length,
    },
    {
      x: cabinet.start.x + Math.cos(angle) * length + Math.cos(depthAngle) * depth,
      y: cabinet.start.y + Math.sin(angle) * length + Math.sin(depthAngle) * depth,
    },
    {
      x: cabinet.start.x + Math.cos(depthAngle) * depth,
      y: cabinet.start.y + Math.sin(depthAngle) * depth,
    },
  ];

  return corners;
}

export function pointInCabinet(p: Point, cabinet: Cabinet): boolean {
  const angle = angleBetween(cabinet.start, cabinet.end);
  const length = distanceBetween(cabinet.start, cabinet.end);
  const depthPx = cmToPixels(cabinet.depth);

  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const dx = p.x - cabinet.start.x;
  const dy = p.y - cabinet.start.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;

  const flipped = cabinet.depthFlipped;
  if (flipped) {
    return localX >= -5 && localX <= length + 5 && localY >= -depthPx - 5 && localY <= 5;
  }
  return localX >= -5 && localX <= length + 5 && localY >= -5 && localY <= depthPx + 5;
}

export function pointNearLine(p: Point, start: Point, end: Point, threshold: number = 8): boolean {
  const nearest = nearestPointOnSegment(p, start, end);
  return distanceBetween(p, nearest) <= threshold;
}

export interface NearestWallResult {
  wall: Wall;
  pointOnWall: Point;
  distance: number;
  referenceEndpoint: Point;
  wallAngle: number;
}

export function findNearestWall(
  point: Point,
  walls: Wall[],
  threshold: number = 20,
): NearestWallResult | null {
  let best: NearestWallResult | null = null;

  for (const wall of walls) {
    const nearest = nearestPointOnSegment(point, wall.start, wall.end);
    const dist = distanceBetween(point, nearest);
    if (dist <= threshold && (!best || dist < best.distance)) {
      const distToStart = distanceBetween(nearest, wall.start);
      const distToEnd = distanceBetween(nearest, wall.end);
      const referenceEndpoint = distToStart <= distToEnd ? wall.start : wall.end;
      best = {
        wall,
        pointOnWall: nearest,
        distance: dist,
        referenceEndpoint,
        wallAngle: angleBetween(wall.start, wall.end),
      };
    }
  }

  return best;
}

export function projectOntoWall(
  point: Point,
  wall: Wall,
): { position: Point; offset: number } {
  const nearest = nearestPointOnSegment(point, wall.start, wall.end);
  const offset = distanceBetween(wall.start, nearest);
  return { position: nearest, offset };
}

export interface AnchorPoint {
  point: Point;
  type: 'wall_corner' | 'door_edge' | 'window_edge' | 'cabinet_edge';
  sourceId?: string;
}

export function getWallAnchorPoints(
  wall: Wall,
  cabinets: Cabinet[],
  openings: Opening[],
): AnchorPoint[] {
  const anchors: AnchorPoint[] = [];

  // Wall endpoints
  anchors.push({ point: wall.start, type: 'wall_corner' });
  anchors.push({ point: wall.end, type: 'wall_corner' });

  // Cabinet edges projected onto wall
  for (const c of cabinets) {
    const projS = nearestPointOnSegment(c.start, wall.start, wall.end);
    if (distanceBetween(c.start, projS) < 15) {
      anchors.push({ point: projS, type: 'cabinet_edge', sourceId: c.id });
    }
    const projE = nearestPointOnSegment(c.end, wall.start, wall.end);
    if (distanceBetween(c.end, projE) < 15) {
      anchors.push({ point: projE, type: 'cabinet_edge', sourceId: c.id });
    }
  }

  // Opening edges projected onto wall
  for (const o of openings) {
    const projS = nearestPointOnSegment(o.start, wall.start, wall.end);
    if (distanceBetween(o.start, projS) < 15) {
      anchors.push({ point: projS, type: o.type === 'door' ? 'door_edge' : 'window_edge', sourceId: o.id });
    }
    const projE = nearestPointOnSegment(o.end, wall.start, wall.end);
    if (distanceBetween(o.end, projE) < 15) {
      anchors.push({ point: projE, type: o.type === 'door' ? 'door_edge' : 'window_edge', sourceId: o.id });
    }
  }

  return anchors;
}

export function calculateRemainingWallSpace(
  wall: Wall,
  cabinets: Cabinet[],
  openings: Opening[],
): number {
  const totalPx = distanceBetween(wall.start, wall.end);
  let usedPx = 0;
  for (const c of cabinets) {
    const projS = nearestPointOnSegment(c.start, wall.start, wall.end);
    const projE = nearestPointOnSegment(c.end, wall.start, wall.end);
    if (distanceBetween(c.start, projS) < 15 && distanceBetween(c.end, projE) < 15) {
      usedPx += distanceBetween(projS, projE);
    }
  }
  for (const o of openings) {
    const projS = nearestPointOnSegment(o.start, wall.start, wall.end);
    const projE = nearestPointOnSegment(o.end, wall.start, wall.end);
    if (distanceBetween(o.start, projS) < 15 && distanceBetween(o.end, projE) < 15) {
      usedPx += distanceBetween(projS, projE);
    }
  }
  return Math.max(0, pixelsToCm(totalPx) - pixelsToCm(usedPx));
}

export function constrainToWall(
  point: Point,
  wall: Wall,
  referenceEndpoint: Point,
): { position: Point; offset: number } {
  const projected = nearestPointOnSegment(point, wall.start, wall.end);
  const offset = distanceBetween(referenceEndpoint, projected);
  return { position: projected, offset };
}

export function pointAlongWall(
  referenceEndpoint: Point,
  wall: Wall,
  offsetPx: number,
): Point {
  const wallLen = distanceBetween(wall.start, wall.end);
  if (wallLen === 0) return { ...referenceEndpoint };

  const isStartRef = distanceBetween(referenceEndpoint, wall.start) < distanceBetween(referenceEndpoint, wall.end);
  const from = isStartRef ? wall.start : wall.end;
  const to = isStartRef ? wall.end : wall.start;
  const angle = angleBetween(from, to);
  const clampedOffset = Math.max(0, Math.min(offsetPx, wallLen));

  return {
    x: from.x + Math.cos(angle) * clampedOffset,
    y: from.y + Math.sin(angle) * clampedOffset,
  };
}

export function getWallDirectionFromRef(
  wall: Wall,
  referenceEndpoint: Point,
): { angle: number; dx: number; dy: number } {
  const isStartRef = distanceBetween(referenceEndpoint, wall.start) < distanceBetween(referenceEndpoint, wall.end);
  const from = isStartRef ? wall.start : wall.end;
  const to = isStartRef ? wall.end : wall.start;
  const angle = angleBetween(from, to);
  return { angle, dx: Math.cos(angle), dy: Math.sin(angle) };
}

export interface WallCornerJoint {
  cornerPoint: Point;
  wall1: Wall;
  wall2: Wall;
  wall1Angle: number;
  wall2Angle: number;
}

/**
 * Returns the 4 corners of a wall as a thick rectangle (inner face → outer face).
 * Order: [innerStart, innerEnd, outerEnd, outerStart] — inner edge is the first two.
 * Uses computeInteriorNormal so the inner face matches what cabinets snap to.
 */
/**
 * Returns the 4 corners of a wall as a thick rectangle.
 *
 * Order: [innerStart, innerEnd, outerEnd, outerStart].
 *
 * Inner face is `wall.start → wall.end` EXACTLY (no offset).
 * Outer face is offset OUTWARD by `wall.thickness` along `computeOutwardNormal`.
 */
export function getWallPolygon(wall: Wall, walls: Wall[]): Point[] {
  const out = computeOutwardNormal(wall.start, wall.end, walls);
  const ox = out.nx * wall.thickness;
  const oy = out.ny * wall.thickness;
  return [
    { x: wall.start.x,        y: wall.start.y        }, // innerStart
    { x: wall.end.x,          y: wall.end.y          }, // innerEnd
    { x: wall.end.x   + ox,   y: wall.end.y   + oy   }, // outerEnd
    { x: wall.start.x + ox,   y: wall.start.y + oy   }, // outerStart
  ];
}

/**
 * Returns the inner face line (start → end) of a wall.
 * In the new model these are exactly wall.start and wall.end.
 */
export function getWallInnerFace(
  wall: Wall,
  _walls: Wall[],
): { start: Point; end: Point } {
  return { start: wall.start, end: wall.end };
}

/**
 * Returns the outer face line (start → end) of a wall: inner + outwardNormal × thickness.
 */
export function getWallOuterFace(
  wall: Wall,
  walls: Wall[],
): { start: Point; end: Point } {
  const out = computeOutwardNormal(wall.start, wall.end, walls);
  const ox = out.nx * wall.thickness;
  const oy = out.ny * wall.thickness;
  return {
    start: { x: wall.start.x + ox, y: wall.start.y + oy },
    end:   { x: wall.end.x   + ox, y: wall.end.y   + oy },
  };
}

/**
 * Find the existing wall whose INNER face (line wall.start → wall.end)
 * the given point lies on (within snap radius). Returns the closest match,
 * or null if no wall's inner face contains the point.
 *
 * Used when starting to draw the next wall — the start point reveals which
 * existing wall's room interior the new wall must extend.
 */
export function findAnchorWallByInnerFace(
  point: Point,
  walls: Wall[],
  snapRadius: number = SNAP_RADIUS,
): Wall | null {
  let best: Wall | null = null;
  let bestDist = snapRadius;
  for (const w of walls) {
    // Check distance from point to the inner-face line (wall.start → wall.end).
    const lat = lateralDistanceToLine(point, w.start, w.end);
    // Also require the projection to fall within the segment (not past either end).
    const t = projectPointOnSegment(point, w.start, w.end);
    if (lat <= bestDist && t >= -0.05 && t <= 1.05) {
      bestDist = lat;
      best = w;
    }
  }
  return best;
}

/**
 * Given a new wall (newStart, newEnd) being created where newStart sits on
 * the inner face of `anchorWall`, decide whether to swap newStart ↔ newEnd
 * so the new wall's INNER face faces the same room interior as the anchor.
 *
 * Returns the (possibly swapped) {start, end} pair.
 *
 * Algorithm: build a probe point inside wall 1's room interior. Then check
 * which side of wall 2's line that probe lands on:
 *   - If probe is on wall 2's OUTWARD side → outward2 points INTO the room → swap
 *   - Otherwise → correct, no swap
 *
 * The probe is shifted slightly into wall 1's interior (away from outward1)
 * AND slightly along wall 1's length (so it's not collinear with wall 2 when
 * the two walls are perpendicular — the case where a naive dot-product check
 * returns zero and fails to detect the wrong orientation).
 */
export function orientNewWallFromAnchor(
  newStart: Point,
  newEnd: Point,
  anchorWall: Wall,
  walls: Wall[],
): { start: Point; end: Point } {
  const outAnchor = computeOutwardNormal(anchorWall.start, anchorWall.end, walls);

  // Unit vector along the anchor wall (start → end).
  const adx = anchorWall.end.x - anchorWall.start.x;
  const ady = anchorWall.end.y - anchorWall.start.y;
  const aLen = Math.hypot(adx, ady);
  const alongAnchor = aLen > 1e-6
    ? { x: adx / aLen, y: ady / aLen }
    : { x: 1, y: 0 };

  // Probe = newStart shifted (away from anchor outward) + (along anchor) by half thickness.
  // This lands clearly inside wall 1's interior AND off the new wall's line for any non-degenerate angle.
  const offset = (anchorWall.thickness || WALL_THICKNESS) * 0.5;
  const probe = {
    x: newStart.x - outAnchor.nx * offset + alongAnchor.x * offset,
    y: newStart.y - outAnchor.ny * offset + alongAnchor.y * offset,
  };

  // Check which side of the new wall's inner-face line the probe lands on.
  // Signed distance along outward2: positive = probe is on outward side (wrong).
  const outNew = computeOutwardNormal(newStart, newEnd, walls);
  const signedDist =
    (probe.x - newStart.x) * outNew.nx + (probe.y - newStart.y) * outNew.ny;

  if (signedDist > 0) {
    return { start: newEnd, end: newStart };
  }
  return { start: newStart, end: newEnd };
}

export function getWallCornerJoints(walls: Wall[]): WallCornerJoint[] {
  const joints: WallCornerJoint[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const w1 = walls[i];
      const w2 = walls[j];
      const endpoints1: Array<{ point: Point; isStart: boolean }> = [
        { point: w1.start, isStart: true },
        { point: w1.end, isStart: false },
      ];
      const endpoints2: Array<{ point: Point; isStart: boolean }> = [
        { point: w2.start, isStart: true },
        { point: w2.end, isStart: false },
      ];

      for (const ep1 of endpoints1) {
        for (const ep2 of endpoints2) {
          if (distanceBetween(ep1.point, ep2.point) < SNAP_RADIUS) {
            const key = `${w1.id}-${w2.id}-${Math.round(ep1.point.x)},${Math.round(ep1.point.y)}`;
            if (!seen.has(key)) {
              seen.add(key);
              const w1Away = ep1.isStart ? w1.end : w1.start;
              const w2Away = ep2.isStart ? w2.end : w2.start;
              joints.push({
                cornerPoint: ep1.point,
                wall1: w1,
                wall2: w2,
                wall1Angle: angleBetween(ep1.point, w1Away),
                wall2Angle: angleBetween(ep2.point, w2Away),
              });
            }
          }
        }
      }
    }
  }

  return joints;
}

export function getWallCornerPolygon(joint: WallCornerJoint): Point[] {
  const { cornerPoint, wall1Angle, wall2Angle } = joint;
  const halfThick = WALL_THICKNESS / 2;

  const perp1 = wall1Angle + Math.PI / 2;
  const perp2 = wall2Angle + Math.PI / 2;

  const p1 = {
    x: cornerPoint.x + Math.cos(perp1) * halfThick,
    y: cornerPoint.y + Math.sin(perp1) * halfThick,
  };
  const p2 = {
    x: cornerPoint.x - Math.cos(perp1) * halfThick,
    y: cornerPoint.y - Math.sin(perp1) * halfThick,
  };
  const p3 = {
    x: cornerPoint.x + Math.cos(perp2) * halfThick,
    y: cornerPoint.y + Math.sin(perp2) * halfThick,
  };
  const p4 = {
    x: cornerPoint.x - Math.cos(perp2) * halfThick,
    y: cornerPoint.y - Math.sin(perp2) * halfThick,
  };

  const all = [p1, p2, p3, p4];
  const cx = all.reduce((s, p) => s + p.x, 0) / all.length;
  const cy = all.reduce((s, p) => s + p.y, 0) / all.length;
  all.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

  return all;
}

export interface CornerCabinetPair {
  cornerPoint: Point;
  cabinet1: Cabinet;
  cabinet2: Cabinet;
  cab1Angle: number;
  cab2Angle: number;
  cab1DepthAngle: number;
  cab2DepthAngle: number;
  cab1Endpoint: "start" | "end";
  cab2Endpoint: "start" | "end";
}

export function findCornerCabinetPairs(
  cabinets: Cabinet[],
  walls: Wall[],
): CornerCabinetPair[] {
  const pairs: CornerCabinetPair[] = [];
  const seen = new Set<string>();

  function tryAddPair(
    c1: Cabinet,
    c1Endpoint: "start" | "end",
    c2: Cabinet,
    c2Endpoint: "start" | "end",
    cornerPt: Point,
  ) {
    if (c1.type !== c2.type) return;
    if (c1.type === "tall") return;

    const pairKey = [c1.id, c2.id].sort().join("|");
    if (seen.has(pairKey)) return;

    const cab1Angle = angleBetween(c1.start, c1.end);
    const cab2Angle = angleBetween(c2.start, c2.end);
    const angleDiff = Math.abs(cab1Angle - cab2Angle);
    const normalizedDiff = angleDiff > Math.PI ? 2 * Math.PI - angleDiff : angleDiff;
    if (Math.abs(normalizedDiff - Math.PI / 2) > 0.2 && Math.abs(normalizedDiff - 3 * Math.PI / 2) > 0.2) return;

    const c1Away = c1Endpoint === "start" ? c1.end : c1.start;
    const c2Away = c2Endpoint === "start" ? c2.end : c2.start;
    const cab1AngleFromCorner = angleBetween(cornerPt, c1Away);
    const cab2AngleFromCorner = angleBetween(cornerPt, c2Away);

    seen.add(pairKey);
    pairs.push({
      cornerPoint: cornerPt,
      cabinet1: c1,
      cabinet2: c2,
      cab1Angle: cab1AngleFromCorner,
      cab2Angle: cab2AngleFromCorner,
      cab1DepthAngle: getDepthAngle(c1),
      cab2DepthAngle: getDepthAngle(c2),
      cab1Endpoint: c1Endpoint,
      cab2Endpoint: c2Endpoint,
    });
  }

  const corners = getWallCornerJoints(walls);
  for (const corner of corners) {
    const cabsAtCorner: Array<{ cabinet: Cabinet; endpointType: "start" | "end" }> = [];
    for (const cab of cabinets) {
      if (distanceBetween(cab.start, corner.cornerPoint) < SNAP_RADIUS) {
        cabsAtCorner.push({ cabinet: cab, endpointType: "start" });
      } else if (distanceBetween(cab.end, corner.cornerPoint) < SNAP_RADIUS) {
        cabsAtCorner.push({ cabinet: cab, endpointType: "end" });
      }
    }
    for (let i = 0; i < cabsAtCorner.length; i++) {
      for (let j = i + 1; j < cabsAtCorner.length; j++) {
        tryAddPair(
          cabsAtCorner[i].cabinet, cabsAtCorner[i].endpointType,
          cabsAtCorner[j].cabinet, cabsAtCorner[j].endpointType,
          corner.cornerPoint,
        );
      }
    }
  }

  for (let i = 0; i < cabinets.length; i++) {
    for (let j = i + 1; j < cabinets.length; j++) {
      const c1 = cabinets[i];
      const c2 = cabinets[j];

      const endpointPairs: Array<{ ep1: "start" | "end"; ep2: "start" | "end" }> = [
        { ep1: "start", ep2: "start" },
        { ep1: "start", ep2: "end" },
        { ep1: "end", ep2: "start" },
        { ep1: "end", ep2: "end" },
      ];
      for (const { ep1, ep2 } of endpointPairs) {
        const p1 = ep1 === "start" ? c1.start : c1.end;
        const p2 = ep2 === "start" ? c2.start : c2.end;
        if (distanceBetween(p1, p2) < SNAP_RADIUS) {
          const cornerPt = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          tryAddPair(c1, ep1, c2, ep2, cornerPt);
        }
      }

      const rect1 = getCabinetRect(c1, getDepthAngle(c1));
      const rect2 = getCabinetRect(c2, getDepthAngle(c2));
      const rectEndpoints: Array<{ idx: number; ep: "start" | "end" }> = [
        { idx: 0, ep: "start" }, { idx: 1, ep: "end" },
        { idx: 2, ep: "end" }, { idx: 3, ep: "start" },
      ];
      for (const r1 of rectEndpoints) {
        for (const r2 of rectEndpoints) {
          if (distanceBetween(rect1[r1.idx], rect2[r2.idx]) < SNAP_RADIUS) {
            const cornerPt = {
              x: (rect1[r1.idx].x + rect2[r2.idx].x) / 2,
              y: (rect1[r1.idx].y + rect2[r2.idx].y) / 2,
            };
            tryAddPair(c1, r1.ep, c2, r2.ep, cornerPt);
          }
        }
      }
    }
  }

  return pairs;
}

function getDepthAngle(cabinet: Cabinet): number {
  const angle = angleBetween(cabinet.start, cabinet.end);
  const flipped = cabinet.depthFlipped;
  return flipped ? angle - Math.PI / 2 : angle + Math.PI / 2;
}

export function getCornerCabinetPolygon(pair: CornerCabinetPair): Point[] {
  const { cornerPoint, cabinet1, cabinet2 } = pair;
  const depthPx1 = cmToPixels(cabinet1.depth);
  const depthPx2 = cmToPixels(cabinet2.depth);

  const angle1 = angleBetween(cabinet1.start, cabinet1.end);
  const angle2 = angleBetween(cabinet2.start, cabinet2.end);

  const flip1 = cabinet1.depthFlipped ? -1 : 1;
  const flip2 = cabinet2.depthFlipped ? -1 : 1;

  const perp1x = -Math.sin(angle1) * flip1;
  const perp1y = Math.cos(angle1) * flip1;
  const perp2x = -Math.sin(angle2) * flip2;
  const perp2y = Math.cos(angle2) * flip2;

  const p0 = cornerPoint;
  const p1 = {
    x: cornerPoint.x + perp1x * depthPx1,
    y: cornerPoint.y + perp1y * depthPx1,
  };
  const p2 = {
    x: cornerPoint.x + perp1x * depthPx1 + perp2x * depthPx2,
    y: cornerPoint.y + perp1y * depthPx1 + perp2y * depthPx2,
  };
  const p3 = {
    x: cornerPoint.x + perp2x * depthPx2,
    y: cornerPoint.y + perp2y * depthPx2,
  };

  return [p0, p1, p2, p3];
}

export function getCabinetLocalPolygon(cabinet: Cabinet, pairs: CornerCabinetPair[]): Point[] {
  const depthPx = cmToPixels(cabinet.depth);
  const length = distanceBetween(cabinet.start, cabinet.end);
  const yOffset = cabinet.depthFlipped ? -depthPx : 0;
  const angle = angleBetween(cabinet.start, cabinet.end);

  let p1 = { x: 0, y: 0 };
  let p2 = { x: length, y: 0 };
  let p3 = { x: length, y: yOffset };
  let p4 = { x: 0, y: yOffset };

  for (const pair of pairs) {
    if (pair.cabinet1.id === cabinet.id || pair.cabinet2.id === cabinet.id) {
      const isCab1 = pair.cabinet1.id === cabinet.id;
      const endpoint = isCab1 ? pair.cab1Endpoint : pair.cab2Endpoint;
      const patch = getCornerCabinetPolygon(pair);

      const localOuter = toLocalSpace(patch[2], cabinet.start, angle);
      const localInner = toLocalSpace(patch[0], cabinet.start, angle);

      if (endpoint === "start") {
        p1 = localInner;
        if (cabinet.depthFlipped) {
          p4 = localOuter;
        } else {
          p4 = localOuter;
        }
        // Wait, p1, p2, p3, p4 are ordered differently based on depthFlipped
        // If flipped, yOffset is negative. So p3 and p4 have y = -depthPx.
        // Outer corners are p3 and p4. Inner corners are p1 and p2.
        p1 = localInner;
        p4 = localOuter;
      } else {
        p2 = localInner;
        p3 = localOuter;
      }
    }
  }
  return [p1, p2, p3, p4];
}

export function computeEffectiveLengths(
  cabinets: Cabinet[],
  walls: Wall[],
  overrideDepthCm?: number,
): Map<string, number> {
  const effectiveLengths = new Map<string, number>();

  for (const cab of cabinets) {
    effectiveLengths.set(cab.id, distanceBetween(cab.start, cab.end));
  }

  if (!cabinets || cabinets.length === 0) {
    return effectiveLengths;
  }

  const deductions = new Map<string, { start: number; end: number }>();
  for (const cab of cabinets) {
    deductions.set(cab.id, { start: 0, end: 0 });
  }

  const pairs = findCornerCabinetPairs(cabinets, walls);

  for (const pair of pairs) {
    const len1 = distanceBetween(pair.cabinet1.start, pair.cabinet1.end);
    const len2 = distanceBetween(pair.cabinet2.start, pair.cabinet2.end);

    const deductFrom = len1 <= len2 ? pair.cabinet1 : pair.cabinet2;
    const cutter = len1 <= len2 ? pair.cabinet2 : pair.cabinet1;
    const deductEndpoint = len1 <= len2 ? pair.cab1Endpoint : pair.cab2Endpoint;
    // Deduct the CUTTER's rendered depth (incl. the visual overhang bonus)
    // so the shortened length matches what the user sees. Using the raw
    // stored depth would under-deduct by CABINET_RENDER_DEPTH_BONUS (2 cm)
    // per junction and leave a visible overlap.
    const depthPx = cmToPixels(overrideDepthCm ?? getRenderDepthCm(cutter));

    const d = deductions.get(deductFrom.id)!;
    if (deductEndpoint === "start") {
      d.start = Math.max(d.start, depthPx);
    } else {
      d.end = Math.max(d.end, depthPx);
    }
  }

  for (const cab of cabinets) {
    const rawLen = effectiveLengths.get(cab.id) ?? 0;
    const d = deductions.get(cab.id)!;
    effectiveLengths.set(cab.id, Math.max(0, rawLen - d.start - d.end));
  }

  return effectiveLengths;
}

export interface CabinetGroup {
  ids: string[];
  type: string;
  rawLengthPx: number;
  effectiveLengthPx: number;
}

export function groupConnectedCabinets(
  cabinets: Cabinet[],
  walls: Wall[],
): CabinetGroup[] {
  const parent = new Map<string, string>();
  for (const cab of cabinets) parent.set(cab.id, cab.id);

  function find(id: string): string {
    while (parent.get(id) !== id) {
      parent.set(id, parent.get(parent.get(id)!)!);
      id = parent.get(id)!;
    }
    return id;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  const pairs = findCornerCabinetPairs(cabinets, walls);
  for (const pair of pairs) {
    union(pair.cabinet1.id, pair.cabinet2.id);
  }

  const effectiveLengths = computeEffectiveLengths(cabinets, walls);

  const groups = new Map<string, CabinetGroup>();
  for (const cab of cabinets) {
    const root = find(cab.id);
    const rawPx = distanceBetween(cab.start, cab.end);
    const effPx = effectiveLengths.get(cab.id) ?? rawPx;
    if (!groups.has(root)) {
      groups.set(root, { ids: [], type: cab.type, rawLengthPx: 0, effectiveLengthPx: 0 });
    }
    const g = groups.get(root)!;
    g.ids.push(cab.id);
    g.rawLengthPx += rawPx;
    g.effectiveLengthPx += effPx;
  }

  return Array.from(groups.values());
}

export type DragHandle = "body" | "start" | "end";

export function findHitTarget(
  pos: Point,
  walls: Wall[],
  cabinets: Cabinet[],
  handleRadius: number = 12,
  openings: Opening[] = [],
  guidelines: Guideline[] = [],
): { type: "wall" | "cabinet" | "opening" | "guideline"; id: string; handle: DragHandle } | null {
  for (const cab of cabinets) {
    if (distanceBetween(pos, cab.start) <= handleRadius) {
      return { type: "cabinet", id: cab.id, handle: "start" };
    }
    if (distanceBetween(pos, cab.end) <= handleRadius) {
      return { type: "cabinet", id: cab.id, handle: "end" };
    }
  }

  for (const op of openings) {
    if (distanceBetween(pos, op.start) <= handleRadius) {
      return { type: "opening", id: op.id, handle: "start" };
    }
    if (distanceBetween(pos, op.end) <= handleRadius) {
      return { type: "opening", id: op.id, handle: "end" };
    }
  }

  for (const wall of walls) {
    if (distanceBetween(pos, wall.start) <= handleRadius) {
      return { type: "wall", id: wall.id, handle: "start" };
    }
    if (distanceBetween(pos, wall.end) <= handleRadius) {
      return { type: "wall", id: wall.id, handle: "end" };
    }
  }

  for (const cab of cabinets) {
    if (pointInCabinet(pos, cab)) {
      return { type: "cabinet", id: cab.id, handle: "body" };
    }
  }

  for (const op of openings) {
    if (pointNearLine(pos, op.start, op.end, WALL_THICKNESS / 2 + 5)) {
      return { type: "opening", id: op.id, handle: "body" };
    }
  }

  for (const wall of walls) {
    if (pointNearLine(pos, wall.start, wall.end, wall.thickness / 2 + 5)) {
      return { type: "wall", id: wall.id, handle: "body" };
    }
  }

  // Measurements (guidelines): thin lines, so use a generous hit radius so
  // the Delete tool can catch them without pixel-perfect aim. Single-point
  // guidelines (start === end) — stray dots left behind when a measurement
  // chain was abandoned — are matched via a disc around their start so the
  // user can clean them up.
  for (const g of guidelines) {
    const isPoint = distanceBetween(g.start, g.end) < 0.5;
    const hit = isPoint
      ? distanceBetween(pos, g.start) <= 10
      : pointNearLine(pos, g.start, g.end, 8);
    if (hit) {
      return { type: "guideline", id: g.id, handle: "body" };
    }
  }

  return null;
}

export interface ClearanceZone {
  corners: Point[];
  openingId: string;
  openingType: OpeningType;
}

export function computeClearanceZone(opening: Opening, walls: Wall[]): ClearanceZone | null {
  const wall = walls.find((w) => w.id === opening.wallId);
  if (!wall) {
    let bestWall: Wall | null = null;
    let bestDist = Infinity;
    for (const w of walls) {
      const mid = { x: (opening.start.x + opening.end.x) / 2, y: (opening.start.y + opening.end.y) / 2 };
      const proj = nearestPointOnSegment(mid, w.start, w.end);
      const d = distanceBetween(mid, proj);
      if (d < bestDist) {
        bestDist = d;
        bestWall = w;
      }
    }
    if (!bestWall || bestDist > 30) return null;
    return computeClearanceForWall(opening, bestWall);
  }
  return computeClearanceForWall(opening, wall);
}

function computeClearanceForWall(opening: Opening, wall: Wall): ClearanceZone {
  const angle = angleBetween(wall.start, wall.end);
  const clearanceDepthPx = cmToPixels(CLEARANCE_DEPTHS[opening.type]);
  const perpAngle = angle + Math.PI / 2;
  const perpX = Math.cos(perpAngle) * clearanceDepthPx;
  const perpY = Math.sin(perpAngle) * clearanceDepthPx;

  const EPS = 1.5;
  const wallDx = Math.cos(angle) * EPS;
  const wallDy = Math.sin(angle) * EPS;

  const corners: Point[] = [
    { x: opening.start.x + wallDx, y: opening.start.y + wallDy },
    { x: opening.end.x - wallDx, y: opening.end.y - wallDy },
    { x: opening.end.x - wallDx + perpX, y: opening.end.y - wallDy + perpY },
    { x: opening.start.x + wallDx + perpX, y: opening.start.y + wallDy + perpY },
  ];

  return { corners, openingId: opening.id, openingType: opening.type };
}

export interface ClearanceViolation {
  blocked: boolean;
  reason: string;
  openingId: string;
  openingType: OpeningType;
}

export function checkClearanceViolation(
  cabinetStart: Point,
  cabinetEnd: Point,
  cabinetType: CabinetType,
  openings: Opening[],
  walls: Wall[],
): ClearanceViolation | null {
  for (const opening of openings) {
    const zone = computeClearanceZone(opening, walls);
    if (!zone) continue;

    if (opening.type === "window" && cabinetType !== "wall_cabinet") continue;

    if (segmentIntersectsPolygon(cabinetStart, cabinetEnd, zone.corners)) {
      const reason = opening.type === "door"
        ? "Cannot place cabinets in front of a door"
        : "Cannot place wall cabinets in front of a window";
      return { blocked: true, reason, openingId: opening.id, openingType: opening.type };
    }
  }
  return null;
}

function segmentIntersectsPolygon(segStart: Point, segEnd: Point, polygon: Point[]): boolean {
  if (pointInPolygon(segStart, polygon) || pointInPolygon(segEnd, polygon)) return true;
  if (pointInPolygon({ x: (segStart.x + segEnd.x) / 2, y: (segStart.y + segEnd.y) / 2 }, polygon)) return true;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (segmentsIntersect(segStart, segEnd, a, b)) return true;
  }
  return false;
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);

  const EPS = 1e-4;

  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
    ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) {
    return true;
  }

  return false;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

// ─── Island geometry helpers ──────────────────────────────────────────────

/** Angle of a wall in radians, using the standard math convention (CCW from +X axis). */
export function wallAngleRad(wall: Wall): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

/** Unit vector perpendicular to a wall direction. */
export function wallPerpendicular(wall: Wall): { nx: number; ny: number } {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { nx: -dy / len, ny: dx / len };
}

/** Foot of perpendicular from point p onto the infinite line through a-b. */
export function projectPointOnLine(p: Point, a: Point, b: Point): Point {
  const ax = b.x - a.x;
  const ay = b.y - a.y;
  const lenSq = ax * ax + ay * ay;
  if (lenSq === 0) return { ...a };
  const t = ((p.x - a.x) * ax + (p.y - a.y) * ay) / lenSq;
  return { x: a.x + ax * t, y: a.y + ay * t };
}

/** Signed perpendicular distance from p to the line through a-b.
 *  Positive on one side, negative on the other. Sign convention matches wallPerpendicular(). */
export function signedPerpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return ((p.x - a.x) * -dy + (p.y - a.y) * dx) / len;
}

/** Build the rail segment: parallel to the wall, offset on the given side. */
export function computeRail(
  wall: Wall,
  offsetCm: number,
  side: "near" | "far"
): { start: Point; end: Point } {
  const { nx, ny } = wallPerpendicular(wall);
  const offsetPx = offsetCm * PIXELS_PER_CM * (side === "near" ? -1 : 1);
  return {
    start: { x: wall.start.x + nx * offsetPx, y: wall.start.y + ny * offsetPx },
    end:   { x: wall.end.x   + nx * offsetPx, y: wall.end.y   + ny * offsetPx },
  };
}

/** Normalize an incoming raw island from saved JSON (future-proofing). */
export function normalizeIsland(raw: any): Island {
  return { ...raw } as Island;
}

/** Hit test: is point p inside island's rectangle (accounting for rotation)? */
export function isPointInIsland(p: Point, island: Island): boolean {
  const lengthPx = island.lengthCm * PIXELS_PER_CM;
  const depthPx = island.depthCm * PIXELS_PER_CM;
  // The rendered rectangle's width/height depend on whether the length
  // runs along x ("h") or y ("v"). Hit testing must use the same mapping.
  const isVertical = island.axis === "v";
  const rectWidth = isVertical ? depthPx : lengthPx;
  const rectHeight = isVertical ? lengthPx : depthPx;
  // Transform p into the island's local (unrotated) coordinate space
  const dx = p.x - island.anchorPoint.x;
  const dy = p.y - island.anchorPoint.y;
  const cos = Math.cos(-island.rotationRad);
  const sin = Math.sin(-island.rotationRad);
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  return localX >= 0 && localX <= rectWidth && localY >= 0 && localY <= rectHeight;
}

/** Find the topmost island under point p, if any. */
export function findIslandHit(p: Point, islands: Island[]): Island | null {
  // Search in reverse so topmost (last drawn) wins
  for (let i = islands.length - 1; i >= 0; i--) {
    if (isPointInIsland(p, islands[i])) return islands[i];
  }
  return null;
}

// ─── Wall chain drawing helpers (2026-04-21) ────────────────────────────────

/** Axis-lock helper for wall chain drawing.
 *  First segment: H or V based on dominant cursor delta from anchor.
 *  Subsequent: perpendicular to the previous segment.
 */
export function getConstrainedEnd(
  anchor: Point,
  cursor: Point,
  segments: Array<{ start: Point; end: Point }>,
): Point {
  if (segments.length === 0) {
    const dx = cursor.x - anchor.x;
    const dy = cursor.y - anchor.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: cursor.x, y: anchor.y }; // horizontal
    }
    return { x: anchor.x, y: cursor.y }; // vertical
  }
  const prev = segments[segments.length - 1];
  const prevIsHorizontal = Math.abs(prev.end.y - prev.start.y) < 0.01;
  if (prevIsHorizontal) {
    return { x: anchor.x, y: cursor.y }; // must be vertical
  }
  return { x: cursor.x, y: anchor.y }; // must be horizontal
}

/** Bounding-box midpoint of a set of walls. */
export function computeChainMidpoint(walls: Wall[]): Point {
  if (walls.length === 0) return { x: 0, y: 0 };
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const w of walls) {
    minX = Math.min(minX, w.start.x, w.end.x);
    maxX = Math.max(maxX, w.start.x, w.end.x);
    minY = Math.min(minY, w.start.y, w.end.y);
    maxY = Math.max(maxY, w.start.y, w.end.y);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** Graph traversal: returns all closed wall cycles.
 *  A cycle is a list of walls where each wall's endpoint meets the next wall's start
 *  and the last wall's end meets the first wall's start (within tolerance).
 */
export function findAllClosedCycles(walls: Wall[]): Wall[][] {
  const tol = 0.5;
  const used = new Set<string>();
  const cycles: Wall[][] = [];

  for (const startWall of walls) {
    if (used.has(startWall.id)) continue;

    // Try to grow a cycle starting from this wall
    const cycle: Wall[] = [startWall];
    let currentEnd = startWall.end;
    const cycleSet = new Set<string>([startWall.id]);

    while (true) {
      // Find a wall (not yet in this cycle) whose endpoint connects to currentEnd
      const next = walls.find(
        (w) =>
          !cycleSet.has(w.id) &&
          !used.has(w.id) &&
          (distanceBetween(w.start, currentEnd) < tol ||
            distanceBetween(w.end, currentEnd) < tol),
      );
      if (!next) break;

      // Normalize so next.start aligns with currentEnd
      const nextNormalized: Wall =
        distanceBetween(next.start, currentEnd) < tol
          ? next
          : { ...next, start: next.end, end: next.start };

      cycle.push(nextNormalized);
      cycleSet.add(next.id);
      currentEnd = nextNormalized.end;

      // Check closure
      if (distanceBetween(currentEnd, cycle[0].start) < tol && cycle.length >= 3) {
        // Closed cycle found
        for (const w of cycle) used.add(w.id);
        cycles.push(cycle);
        break;
      }
    }
  }

  return cycles;
}

/** Given a closed cycle of walls (already ordered head-to-tail), return the
 *  ordered vertex list (polygon path). Returns null if the walls don't close.
 */
export function getClosedPolygonPath(cycleWalls: Wall[]): Point[] | null {
  if (cycleWalls.length < 3) return null;
  const tol = 0.5;
  const vertices: Point[] = [];
  vertices.push(cycleWalls[0].start);
  for (const w of cycleWalls) {
    vertices.push(w.end);
  }
  // Verify closure
  if (distanceBetween(vertices[vertices.length - 1], vertices[0]) > tol) {
    return null;
  }
  // Drop the duplicate closing vertex
  vertices.pop();
  return vertices;
}
