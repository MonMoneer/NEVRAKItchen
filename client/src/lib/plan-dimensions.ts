// Architectural dimensions for the plan (phase 3) and the text sizes the PDF
// capture needs to know about. Pure geometry: DesignerCanvas draws from these
// numbers and captureCanvasImage sizes its crop from the same numbers, so the
// two can never disagree about where the outermost line sits.

import {
  type Cabinet,
  type Opening,
  type Point,
  type Wall,
  PIXELS_PER_CM,
  angleBetween,
  computeOutwardNormal,
  distanceBetween,
  formatLength,
  pixelsToCm,
} from "./kitchen-engine";

// ─── Text sizes on the plan (screen px at textScale 1) ──────────────────────

export const PLAN_TEXT_PX = {
  runLabel: 9,
  applianceLabel: 11,
  chain: 13,
  overall: 15,
  island: 15,
} as const;

export type PlanTextRole = keyof typeof PLAN_TEXT_PX;

/** Size multiplier per text role. All 1 on screen. */
export type PlanTextScales = Record<PlanTextRole, number>;

export const SCREEN_TEXT_SCALES: PlanTextScales = {
  runLabel: 1,
  applianceLabel: 1,
  chain: 1,
  overall: 1,
  island: 1,
};

// ─── PDF legibility ─────────────────────────────────────────────────────────

/** Width of the plan frame in the PDF (qt-plan in Space.svg, 1 unit = 1 pt). */
export const PDF_PLAN_FRAME_WIDTH_PT = 490.39;

/**
 * The smallest each role may come out in the PDF. Every role is kept at or
 * above about 6 pt; the overall figures get a little more so they still read
 * as the headline numbers when everything else has been lifted to the floor.
 */
const PDF_MIN_PT: PlanTextScales = {
  runLabel: 6.5,
  applianceLabel: 6.5,
  chain: 6.5,
  overall: 7.5,
  island: 7.5,
};

/** How big a role's text comes out in the PDF at a given text scale. */
export function pdfTextPt(role: PlanTextRole, factor: number, stageScale: number, captureWidthWorld: number): number {
  return ((PLAN_TEXT_PX[role] * factor) / stageScale) * (PDF_PLAN_FRAME_WIDTH_PT / captureWidthWorld);
}

/**
 * Per-role multipliers for the PDF snapshot: each role is enlarged only as far
 * as it needs to reach its floor, and never shrunk. Text is sized in screen
 * px, so without this the PDF lettering depends on the zoom at export time.
 */
export function pdfTextScales(stageScale: number, captureWidthWorld: number): PlanTextScales {
  const out = { ...SCREEN_TEXT_SCALES };
  for (const role of Object.keys(out) as PlanTextRole[]) {
    out[role] = Math.max(1, PDF_MIN_PT[role] / pdfTextPt(role, 1, stageScale, captureWidthWorld));
  }
  return out;
}

// ─── Dimension layout (screen px at textScale 1, measured outward) ──────────

/** Wall dimensions, measured outward from the wall's OUTER face. */
const CHAIN_LINE_PX = 22;
const TEXT_GAP_PX = 3;
const LINE_GAP_PX = 10;
export const DIM_TICK_PX = 8;

/** Island dimensions, measured outward from the island's edge. Far enough out
 *  to clear the labels of appliances that open towards that side. */
const ISLAND_LINE_PX = 30;

/** Segments shorter than this keep their tick but drop their number. */
export const SHORT_SEGMENT_CM = 25;

export interface DimensionLayout {
  chainLine: number;
  chainText: number; // centre of the chain numbers
  overallLine: number;
  overallText: number; // centre of the overall figure
  wallExtent: number; // outer edge of the overall figure
  islandLine: number;
  islandText: number;
  islandExtent: number;
}

/**
 * Screen-px offsets for the given text scales. Each gap grows with the text
 * beside it, so enlarged PDF lettering still fits between the lines.
 */
export function dimensionLayout(scales: PlanTextScales = SCREEN_TEXT_SCALES): DimensionLayout {
  const kc = scales.chain;
  const ko = scales.overall;
  const ki = scales.island;
  const chainLine = CHAIN_LINE_PX * kc;
  const chainText = chainLine + (TEXT_GAP_PX + PLAN_TEXT_PX.chain / 2) * kc;
  const overallLine = chainLine + (TEXT_GAP_PX + PLAN_TEXT_PX.chain) * kc + LINE_GAP_PX * ko;
  const overallText = overallLine + (TEXT_GAP_PX + PLAN_TEXT_PX.overall / 2) * ko;
  const wallExtent = overallLine + (TEXT_GAP_PX + PLAN_TEXT_PX.overall) * ko;
  // Island lines clear the appliance labels beside the island, so they move
  // out with those labels as well as with their own text.
  const islandLine = ISLAND_LINE_PX * Math.max(ki, scales.applianceLabel);
  const islandText = islandLine + (TEXT_GAP_PX + PLAN_TEXT_PX.island / 2) * ki;
  const islandExtent = islandLine + (TEXT_GAP_PX + PLAN_TEXT_PX.island) * ki;
  return { chainLine, chainText, overallLine, overallText, wallExtent, islandLine, islandText, islandExtent };
}

// ─── Wall chain ─────────────────────────────────────────────────────────────

/**
 * The overall length in whole cm, consistent with what formatLength() prints
 * for the same distance -- so the chain, built from it, adds up to the label.
 */
function overallCm(lengthPx: number, unit: "cm" | "m"): number {
  const cm = pixelsToCm(lengthPx);
  if (unit === "m") return Math.round(Number((cm / 100).toFixed(2)) * 100);
  return Math.round(cm);
}

/** A chain figure without the unit (the overall figure carries it). */
export function formatChainCm(cm: number, unit: "cm" | "m"): string {
  return unit === "m" ? (cm / 100).toFixed(2) : String(cm);
}

const PARALLEL_TOLERANCE_RAD = (3 * Math.PI) / 180;
const ON_WALL_TOLERANCE_PX = 30;

/**
 * Is this item (a cabinet's or opening's back edge) on `wall`? Its wallId
 * decides when it points at a wall that exists; otherwise the back edge must
 * be parallel to the inner face and within 30 px of it (the same 30 px
 * tolerance computeClearanceZone uses).
 */
function isOnWall(start: Point, end: Point, wallId: string | undefined, wall: Wall, walls: Wall[]): boolean {
  if (wallId && walls.some((w) => w.id === wallId)) return wallId === wall.id;
  let diff = Math.abs(angleBetween(start, end) - angleBetween(wall.start, wall.end)) % Math.PI;
  if (diff > Math.PI / 2) diff = Math.PI - diff;
  if (diff > PARALLEL_TOLERANCE_RAD) return false;
  const L = distanceBetween(wall.start, wall.end) || 1;
  const ux = (wall.end.x - wall.start.x) / L;
  const uy = (wall.end.y - wall.start.y) / L;
  const offLine = (p: Point) => Math.abs((p.x - wall.start.x) * -uy + (p.y - wall.start.y) * ux);
  return offLine(start) <= ON_WALL_TOLERANCE_PX && offLine(end) <= ON_WALL_TOLERANCE_PX;
}

export interface WallDimension {
  wall: Wall;
  lengthPx: number;
  /** Unit vector along the inner face, start → end. */
  u: Point;
  /** Unit vector pointing out of the room. */
  out: Point;
  /** Outer face of the wall, start side (the dimension baseline). */
  outerStart: Point;
  /** Exactly today's wall label. */
  overallText: string;
  /**
   * Breakpoints along the inner face, in px from wall.start, already rounded
   * so consecutive differences are whole cm and add up to the overall figure.
   * Empty when nothing on the wall splits it (overall line only).
   */
  chainPx: number[];
  /** Whole-cm length of each chain segment (chainPx.length - 1 of them). */
  segmentsCm: number[];
}

export function computeWallDimension(
  wall: Wall,
  walls: Wall[],
  cabinets: Cabinet[],
  openings: Opening[],
  unit: "cm" | "m",
): WallDimension | null {
  const lengthPx = distanceBetween(wall.start, wall.end);
  if (lengthPx < 10) return null;
  const u = { x: (wall.end.x - wall.start.x) / lengthPx, y: (wall.end.y - wall.start.y) / lengthPx };
  const o = computeOutwardNormal(wall.start, wall.end, walls);
  const out = { x: o.nx, y: o.ny };
  const outerStart = { x: wall.start.x + out.x * wall.thickness, y: wall.start.y + out.y * wall.thickness };

  // Every start/end of cabinets (base, wall, tall) and openings on this wall,
  // projected onto the inner face and clamped to it.
  const along = (p: Point) =>
    Math.max(0, Math.min(lengthPx, (p.x - wall.start.x) * u.x + (p.y - wall.start.y) * u.y));
  const raw: number[] = [];
  for (const c of cabinets) {
    if (c.type === "island") continue;
    if (isOnWall(c.start, c.end, c.wallId, wall, walls)) raw.push(along(c.start), along(c.end));
  }
  for (const op of openings) {
    if (isOnWall(op.start, op.end, op.wallId, wall, walls)) raw.push(along(op.start), along(op.end));
  }

  // Round the cumulative positions (not the segments), so the differences
  // always add up to the overall figure.
  const totalCm = overallCm(lengthPx, unit);
  const cmPositions = new Set<number>([0, totalCm]);
  for (const px of raw) {
    const cm = Math.round(pixelsToCm(px));
    if (cm > 0 && cm < totalCm) cmPositions.add(cm);
  }
  const sorted = Array.from(cmPositions).sort((a, b) => a - b);
  // Nothing splits the wall: the chain would just repeat the overall figure.
  if (sorted.length <= 2) {
    return { wall, lengthPx, u, out, outerStart, overallText: formatLength(lengthPx, unit), chainPx: [], segmentsCm: [] };
  }
  const chainPx = sorted.map((cm, i) => (i === sorted.length - 1 ? lengthPx : cm * PIXELS_PER_CM));
  const segmentsCm = sorted.slice(1).map((cm, i) => cm - sorted[i]);
  return { wall, lengthPx, u, out, outerStart, overallText: formatLength(lengthPx, unit), chainPx, segmentsCm };
}

// ─── Capture bounds ─────────────────────────────────────────────────────────

/**
 * World-space points the outermost dimension text can reach, for growing the
 * PDF crop. `scale` is the stage zoom (dimension offsets are screen px).
 */
export function dimensionExtentPoints(
  walls: Wall[],
  islandRects: Point[][],
  scale: number,
  scales: PlanTextScales = SCREEN_TEXT_SCALES,
): Point[] {
  const layout = dimensionLayout(scales);
  const pts: Point[] = [];
  for (const wall of walls) {
    const L = distanceBetween(wall.start, wall.end);
    if (L < 10) continue;
    const o = computeOutwardNormal(wall.start, wall.end, walls);
    const reach = wall.thickness + layout.wallExtent / scale;
    pts.push(
      { x: wall.start.x + o.nx * reach, y: wall.start.y + o.ny * reach },
      { x: wall.end.x + o.nx * reach, y: wall.end.y + o.ny * reach },
    );
  }
  const reach = layout.islandExtent / scale;
  for (const rect of islandRects) {
    for (const p of rect) {
      pts.push({ x: p.x + reach, y: p.y + reach }, { x: p.x - reach, y: p.y - reach });
    }
  }
  return pts;
}
