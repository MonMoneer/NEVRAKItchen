/**
 * Appliances on the plan (sink, hob, oven, fridge, hood, cooking range…).
 *
 * VISUAL ONLY — appliances are never priced. Nothing in this file is read by
 * dream-home-pricing.ts, the pricing panel, layer pricing or
 * computeProjectGrandTotal. The only consumers outside the canvas are the PDF
 * capture (it is a Konva snapshot) and the pricing-tool handover, which lists
 * them in `appliancesDetected` for information.
 *
 * An appliance is stored relative to a HOST (one cabinet piece, an island or
 * a wall) and its position is recomputed from the host at render time, so
 * moving or resizing a run carries its appliances along. Geometry here only
 * READS the kitchen-engine model; it never changes walls/cabinets/islands.
 */
import type { Cabinet, Island, Opening, Point, Wall } from "./kitchen-engine";
import {
  CABINET_COLORS,
  angleBetween,
  cmToPixels,
  computeClearanceZone,
  computeInteriorNormal,
  distanceBetween,
  findCornerCabinetPairs,
  pixelsToCm,
} from "./kitchen-engine";

// ─── Catalogue ──────────────────────────────────────────────────────────────

export type ApplianceKind =
  | "sink"
  | "hob"
  | "oven"
  | "dishwasher"
  | "tall_oven"
  | "microwave"
  | "fridge"
  | "coffee"
  | "hood"
  | "range";

/** Which "layer" of the kitchen the appliance sits in. Same layer on the same host may not overlap. */
export type AppliancePlacement = "counter" | "inside" | "wall" | "floor";

/** Kind of host an appliance may be placed on. */
export type ApplianceHostKind = "base" | "tall" | "island" | "wall";

export interface ApplianceDef {
  kind: ApplianceKind;
  /** Display name (cards, messages). */
  name: string;
  /** Upper-case plan label, e.g. "OVEN" → "OVEN 60". */
  label: string;
  group: "On the counter" | "Inside a cabinet" | "On the wall" | "On the floor";
  placement: AppliancePlacement;
  sizes: number[];
  hosts: ApplianceHostKind[];
  /** Extra hint shown under the size chips. */
  note?: string;
  /** Height in cm — only used for stacking in a tall column. */
  stackHeightCm?: number;
}

export const APPLIANCE_CATALOGUE: ApplianceDef[] = [
  { kind: "sink", name: "Sink", label: "SINK", group: "On the counter", placement: "counter", sizes: [50, 80, 110], hosts: ["base", "island"], note: "110 = double bowl" },
  { kind: "hob", name: "Hob / cooktop", label: "HOB", group: "On the counter", placement: "counter", sizes: [60, 90, 120], hosts: ["base", "island"] },
  { kind: "oven", name: "Oven", label: "OVEN", group: "Inside a cabinet", placement: "inside", sizes: [60, 76, 90], hosts: ["base", "island"] },
  { kind: "dishwasher", name: "Dishwasher", label: "DISHWASHER", group: "Inside a cabinet", placement: "inside", sizes: [60], hosts: ["base", "island"] },
  { kind: "tall_oven", name: "Oven (tall)", label: "OVEN", group: "Inside a cabinet", placement: "inside", sizes: [60, 76, 90], hosts: ["tall"], stackHeightCm: 60 },
  { kind: "microwave", name: "Microwave", label: "MICROWAVE", group: "Inside a cabinet", placement: "inside", sizes: [60, 76], hosts: ["tall"], stackHeightCm: 45 },
  { kind: "fridge", name: "Fridge / freezer", label: "FRIDGE", group: "Inside a cabinet", placement: "inside", sizes: [60, 75, 90], hosts: ["tall"], stackHeightCm: 178 },
  { kind: "coffee", name: "Coffee machine", label: "COFFEE", group: "Inside a cabinet", placement: "inside", sizes: [60], hosts: ["tall"], stackHeightCm: 45 },
  { kind: "hood", name: "Hood", label: "HOOD", group: "On the wall", placement: "wall", sizes: [60, 90, 120, 150], hosts: ["wall"] },
  { kind: "range", name: "Cooking range", label: "RANGE", group: "On the floor", placement: "floor", sizes: [60, 90, 120, 150], hosts: ["wall"] },
];

export const APPLIANCE_GROUPS: ApplianceDef["group"][] = [
  "On the counter",
  "Inside a cabinet",
  "On the wall",
  "On the floor",
];

const DEF_BY_KIND = new Map(APPLIANCE_CATALOGUE.map((d) => [d.kind, d]));

export function getApplianceDef(kind: ApplianceKind): ApplianceDef {
  return DEF_BY_KIND.get(kind) as ApplianceDef;
}

/** Max combined height of items stacked in one tall-run column. */
export const TALL_COLUMN_MAX_HEIGHT_CM = 210;

/** Snap distance (cm) for host ends / other appliances' edges / centre lines. */
export const APPLIANCE_SNAP_CM = 4;

/** Dark grey used for every appliance so it never clashes with cabinet colours. */
export const APPLIANCE_COLOR = "#27303A";
export const APPLIANCE_INVALID_COLOR = "#D0362A";

// ─── Stored shape ───────────────────────────────────────────────────────────

export type ApplianceHost =
  | { type: "cabinet"; id: string }
  | { type: "island"; id: string }
  | { type: "wall"; id: string };

export interface PlacedAppliance {
  id: string; // generateId()
  kind: ApplianceKind;
  widthCm: number; // chosen size
  host: ApplianceHost;
  offsetCm: number; // from the host's start point along its length, to the appliance's start edge
  lastCenter: Point; // canvas px — fallback if the host disappears
  /**
   * Wall hosts only: the wall's start point when `offsetCm` was measured.
   * `reorientWalls` can swap a wall's start/end; when the start moves we
   * re-measure from `lastCenter` instead of trusting `offsetCm`.
   */
  hostStart?: Point;
  /**
   * Island hosts, inside-cabinet items only: which long side the appliance
   * opens to (+1 = the d = depth edge, −1 = the d = 0 edge). Set from the side
   * it was dropped nearer; when missing, the island's front side is used.
   */
  islandSide?: 1 | -1;
}

/** Display label, e.g. "OVEN 60". */
export function applianceLabel(a: { kind: ApplianceKind; widthCm: number }): string {
  return `${getApplianceDef(a.kind).label} ${a.widthCm}`;
}

/** Name used in messages, e.g. "Oven 90 cm". */
export function applianceTitle(a: { kind: ApplianceKind; widthCm: number }): string {
  return `${getApplianceDef(a.kind).name} ${a.widthCm} cm`;
}

/** Where an appliance may be dropped — used for the "dropped in the wrong place" toast. */
export function applianceWhereHint(kind: ApplianceKind): string {
  const def = getApplianceDef(kind);
  if (kind === "hood") return "A hood goes along a wall.";
  if (kind === "range") return "A cooking range goes on free floor along a wall.";
  if (def.hosts.includes("tall")) return `${def.name} goes inside a tall run.`;
  if (def.placement === "counter") return `${def.name} goes on a base run or an island.`;
  return `${def.name} goes inside a base run or an island.`;
}

// ─── Host frames ────────────────────────────────────────────────────────────

/**
 * Local frame of a host. A point at (along `a` px, depth `d` px) is
 * `origin + u·a + n·d`. For cabinets this is the same frame
 * renderCabinetBody builds (start point, run angle, depthFlipped).
 */
export interface HostFrame {
  host: ApplianceHost;
  hostKind: ApplianceHostKind | "wall_cabinet";
  origin: Point;
  ux: number;
  uy: number;
  nx: number;
  ny: number;
  lengthPx: number;
  /** Stored depth (not the drawn depth with CABINET_RENDER_DEPTH_BONUS). 0 for walls. */
  depthPx: number;
  /** Layer colour for the valid-drop preview. */
  color: string;
  /**
   * Islands only: which long side is the front (+1 = the d = depth edge,
   * −1 = the d = 0 edge). See islandLabelSide.
   */
  frontSide?: 1 | -1;
}

export function cabinetFrame(cab: Cabinet): HostFrame {
  const angle = angleBetween(cab.start, cab.end);
  const depthAngle = cab.depthFlipped ? angle - Math.PI / 2 : angle + Math.PI / 2;
  const hostKind: HostFrame["hostKind"] =
    cab.type === "base" ? "base" : cab.type === "tall" ? "tall" : cab.type === "island" ? "island" : "wall_cabinet";
  return {
    host: { type: "cabinet", id: cab.id },
    hostKind,
    origin: cab.start,
    ux: Math.cos(angle),
    uy: Math.sin(angle),
    nx: Math.cos(depthAngle),
    ny: Math.sin(depthAngle),
    lengthPx: distanceBetween(cab.start, cab.end),
    depthPx: cmToPixels(cab.depth),
    color: CABINET_COLORS[cab.type],
  };
}

export function islandFrame(island: Island, walls: Wall[] = []): HostFrame {
  // Same mapping as the island renderer: anchorPoint is the top-left corner,
  // the rect is rotated by rotationRad about it; "h" = length along local x,
  // "v" = length along local y.
  const r = island.rotationRad;
  const lx = { x: Math.cos(r), y: Math.sin(r) };
  const ly = { x: -Math.sin(r), y: Math.cos(r) };
  const vertical = island.axis === "v";
  const u = vertical ? ly : lx;
  const n = vertical ? lx : ly;
  const frame: HostFrame = {
    host: { type: "island", id: island.id },
    hostKind: "island",
    origin: island.anchorPoint,
    ux: u.x,
    uy: u.y,
    nx: n.x,
    ny: n.y,
    lengthPx: cmToPixels(island.lengthCm),
    depthPx: cmToPixels(island.depthCm),
    color: CABINET_COLORS.island,
  };
  frame.frontSide = islandLabelSide(frame, island, walls);
  return frame;
}

export function wallFrame(wall: Wall, walls: Wall[]): HostFrame {
  const len = distanceBetween(wall.start, wall.end);
  const ux = len > 0 ? (wall.end.x - wall.start.x) / len : 1;
  const uy = len > 0 ? (wall.end.y - wall.start.y) / len : 0;
  const n = computeInteriorNormal(wall.start, wall.end, walls);
  return {
    host: { type: "wall", id: wall.id },
    hostKind: "wall",
    origin: wall.start,
    ux,
    uy,
    nx: n.nx,
    ny: n.ny,
    lengthPx: len,
    depthPx: 0,
    color: APPLIANCE_COLOR,
  };
}

export function framePoint(f: HostFrame, a: number, d: number): Point {
  return { x: f.origin.x + f.ux * a + f.nx * d, y: f.origin.y + f.uy * a + f.ny * d };
}

export function toFrameLocal(f: HostFrame, p: Point): { a: number; d: number } {
  const dx = p.x - f.origin.x;
  const dy = p.y - f.origin.y;
  return { a: dx * f.ux + dy * f.uy, d: dx * f.nx + dy * f.ny };
}

/** Inside-cabinet appliances on an island are at most this deep, set against the island's front. */
export const ISLAND_INSIDE_MAX_DEPTH_CM = 55;

/** True when the appliance picks one long side of an island to open to. */
export function usesIslandSide(kind: ApplianceKind, frame: HostFrame): boolean {
  return frame.host.type === "island" && getApplianceDef(kind).placement === "inside";
}

/** The island long side nearer to a point (+1 = the d = depth edge, −1 = the d = 0 edge). */
export function islandSideAt(frame: HostFrame, p: Point): 1 | -1 {
  return toFrameLocal(frame, p).d < frame.depthPx / 2 ? -1 : 1;
}

function effectiveIslandSide(kind: ApplianceKind, frame: HostFrame, islandSide?: 1 | -1): 1 | -1 | undefined {
  if (!usesIslandSide(kind, frame)) return undefined;
  return islandSide ?? frame.frontSide ?? 1;
}

/** Depth band (px, from the host's back edge) an appliance occupies on a host. */
export function applianceDepthBand(
  kind: ApplianceKind,
  frame: HostFrame,
  islandSide?: 1 | -1,
): { d0: number; d1: number } {
  const D = frame.depthPx;
  const side = effectiveIslandSide(kind, frame, islandSide);
  if (side !== undefined) {
    const d = Math.min(D, cmToPixels(ISLAND_INSIDE_MAX_DEPTH_CM));
    return side === -1 ? { d0: 0, d1: d } : { d0: D - d, d1: D };
  }
  switch (kind) {
    case "sink": {
      const d = cmToPixels(46);
      return { d0: (D - d) / 2, d1: (D + d) / 2 };
    }
    case "hob": {
      const d = cmToPixels(52);
      return { d0: (D - d) / 2, d1: (D + d) / 2 };
    }
    case "hood":
      return { d0: 0, d1: cmToPixels(50) };
    case "range":
      return { d0: 0, d1: cmToPixels(60) };
    default:
      return { d0: 0, d1: D };
  }
}

/**
 * Corners of an appliance footprint on a host: back-start, back-end,
 * front-end, front-start — "front" being the side it opens to, so an island
 * appliance facing the d = 0 side has its corners listed the other way round.
 */
export function footprintCorners(
  kind: ApplianceKind,
  widthCm: number,
  offsetCm: number,
  frame: HostFrame,
  islandSide?: 1 | -1,
): Point[] {
  const a0 = cmToPixels(offsetCm);
  const a1 = cmToPixels(offsetCm + widthCm);
  const { d0, d1 } = applianceDepthBand(kind, frame, islandSide);
  const [back, front] = effectiveIslandSide(kind, frame, islandSide) === -1 ? [d1, d0] : [d0, d1];
  return [framePoint(frame, a0, back), framePoint(frame, a1, back), framePoint(frame, a1, front), framePoint(frame, a0, front)];
}

export function polygonCenter(pts: Point[]): Point {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

/** Rough default depth (cm) when an orphaned appliance has no host to measure from. */
function orphanDepthCm(kind: ApplianceKind): number {
  switch (kind) {
    case "sink":
      return 46;
    case "hob":
      return 52;
    case "hood":
      return 50;
    default:
      return 60;
  }
}

/** Axis-aligned box at lastCenter for appliances whose host has gone. */
export function orphanCorners(a: PlacedAppliance): Point[] {
  const hw = cmToPixels(a.widthCm) / 2;
  const hd = cmToPixels(orphanDepthCm(a.kind)) / 2;
  const c = a.lastCenter;
  return [
    { x: c.x - hw, y: c.y - hd },
    { x: c.x + hw, y: c.y - hd },
    { x: c.x + hw, y: c.y + hd },
    { x: c.x - hw, y: c.y + hd },
  ];
}

// ─── Scene + host lookup ────────────────────────────────────────────────────

export interface ApplianceScene {
  walls: Wall[];
  cabinets: Cabinet[];
  islands: Island[];
  openings: Opening[];
}

export function frameForHost(host: ApplianceHost, scene: ApplianceScene): HostFrame | null {
  if (host.type === "cabinet") {
    const cab = scene.cabinets.find((c) => c.id === host.id);
    return cab ? cabinetFrame(cab) : null;
  }
  if (host.type === "island") {
    const isl = scene.islands.find((i) => i.id === host.id);
    return isl ? islandFrame(isl, scene.walls) : null;
  }
  const wall = scene.walls.find((w) => w.id === host.id);
  return wall ? wallFrame(wall, scene.walls) : null;
}

/** Every frame an appliance of this kind could be placed on. */
export function candidateFrames(kind: ApplianceKind, scene: ApplianceScene): HostFrame[] {
  const def = getApplianceDef(kind);
  const out: HostFrame[] = [];
  for (const c of scene.cabinets) {
    if ((c.type === "base" && def.hosts.includes("base")) || (c.type === "tall" && def.hosts.includes("tall"))) {
      out.push(cabinetFrame(c));
    }
  }
  if (def.hosts.includes("island")) {
    for (const i of scene.islands) out.push(islandFrame(i, scene.walls));
  }
  if (def.hosts.includes("wall")) {
    for (const w of scene.walls) {
      if (distanceBetween(w.start, w.end) > 1) out.push(wallFrame(w, scene.walls));
    }
  }
  return out;
}

/** Distance (px) from a point to the rectangle [0,L]×[d0,d1] of a frame; 0 inside. */
function distanceToBand(f: HostFrame, p: Point, d0: number, d1: number): number {
  const { a, d } = toFrameLocal(f, p);
  const lo = Math.min(d0, d1);
  const hi = Math.max(d0, d1);
  const da = Math.max(0, -a, a - f.lengthPx);
  const dd = Math.max(0, lo - d, d - hi);
  return Math.hypot(da, dd);
}

/** Nearest allowed host to a point within `tolerancePx`. */
export function findHostNear(
  kind: ApplianceKind,
  p: Point,
  scene: ApplianceScene,
  tolerancePx: number,
): HostFrame | null {
  let best: HostFrame | null = null;
  let bestDist = tolerancePx;
  for (const f of candidateFrames(kind, scene)) {
    const band = f.host.type === "wall" ? applianceDepthBand(kind, f) : { d0: 0, d1: f.depthPx };
    const dist = distanceToBand(f, p, band.d0, band.d1);
    if (dist <= bestDist) {
      bestDist = dist;
      best = f;
    }
  }
  return best;
}

// ─── Geometry helpers ───────────────────────────────────────────────────────

/** Convex polygon overlap (SAT). Touching edges (overlap ≤ eps) do not count. */
export function polygonsOverlap(a: Point[], b: Point[], eps = 0.5): boolean {
  const polys = [a, b];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const ex = p2.x - p1.x;
      const ey = p2.y - p1.y;
      const len = Math.hypot(ex, ey);
      if (len < 1e-6) continue;
      const ax = -ey / len;
      const ay = ex / len;
      let minA = Infinity;
      let maxA = -Infinity;
      for (const p of a) {
        const v = p.x * ax + p.y * ay;
        if (v < minA) minA = v;
        if (v > maxA) maxA = v;
      }
      let minB = Infinity;
      let maxB = -Infinity;
      for (const p of b) {
        const v = p.x * ax + p.y * ay;
        if (v < minB) minB = v;
        if (v > maxB) maxB = v;
      }
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= eps) return false;
    }
  }
  return true;
}

export function pointInConvexPolygon(p: Point, poly: Point[], tolerancePx = 0): boolean {
  if (tolerancePx > 0) {
    // Expand the hit area by testing distance to the polygon edges.
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
      if (Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)) <= tolerancePx) return true;
    }
  }
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function cabinetRectStored(cab: Cabinet): Point[] {
  const f = cabinetFrame(cab);
  return [framePoint(f, 0, 0), framePoint(f, f.lengthPx, 0), framePoint(f, f.lengthPx, f.depthPx), framePoint(f, 0, f.depthPx)];
}

function islandRect(island: Island): Point[] {
  const f = islandFrame(island);
  return [framePoint(f, 0, 0), framePoint(f, f.lengthPx, 0), framePoint(f, f.lengthPx, f.depthPx), framePoint(f, 0, f.depthPx)];
}

/** World-space corners of an island (for capture bounds). */
export function islandCorners(island: Island): Point[] {
  return islandRect(island);
}

// ─── Resolution (host → position at render time) ────────────────────────────

export type ResolvedStatus = "ok" | "overflow" | "orphan";

export interface ResolvedAppliance {
  appliance: PlacedAppliance;
  frame: HostFrame | null;
  /** Offset actually drawn (clamped to the host length). */
  offsetCm: number;
  corners: Point[];
  center: Point;
  status: ResolvedStatus;
  /** Island side actually used (inside items on islands only). */
  islandSide?: 1 | -1;
  /** Silent, history-free patch to store (re-attach, wall re-measure, lastCenter). */
  patch: Partial<PlacedAppliance> | null;
}

function clampOffset(offsetCm: number, widthCm: number, frame: HostFrame): number {
  const maxOff = pixelsToCm(frame.lengthPx) - widthCm;
  if (maxOff <= 0) return 0;
  return Math.max(0, Math.min(maxOff, offsetCm));
}

function offsetFromCenter(frame: HostFrame, center: Point, widthCm: number): number {
  const { a } = toFrameLocal(frame, center);
  return Math.round(pixelsToCm(a) - widthCm / 2);
}

/** Find a host of an allowed type whose footprint contains `p` (used for silent re-attach). */
function findContainingHost(kind: ApplianceKind, p: Point, scene: ApplianceScene): HostFrame | null {
  for (const f of candidateFrames(kind, scene)) {
    const band = f.host.type === "wall" ? applianceDepthBand(kind, f) : { d0: 0, d1: f.depthPx };
    if (distanceToBand(f, p, band.d0, band.d1) <= 0.5) return f;
  }
  return null;
}

const samePoint = (a: Point | undefined, b: Point, tol = 0.5) =>
  !!a && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

export function resolveAppliance(app: PlacedAppliance, scene: ApplianceScene): ResolvedAppliance {
  let frame = frameForHost(app.host, scene);
  let offsetCm = app.offsetCm;
  const patch: Partial<PlacedAppliance> = {};
  const def = getApplianceDef(app.kind);

  // A host that still exists but is no longer an allowed type (e.g. a cabinet
  // id reused by a different type) is treated as missing.
  if (frame && frame.hostKind !== "wall" && !def.hosts.includes(frame.hostKind as ApplianceHostKind)) {
    frame = null;
  }

  if (frame && app.host.type === "wall") {
    const start = frame.origin;
    if (!app.hostStart) {
      patch.hostStart = { ...start };
    } else if (!samePoint(app.hostStart, start)) {
      // Wall start moved (or reorientWalls swapped start/end): re-measure.
      offsetCm = clampOffset(offsetFromCenter(frame, app.lastCenter, app.widthCm), app.widthCm, frame);
      patch.offsetCm = offsetCm;
      patch.hostStart = { ...start };
    }
  }

  if (!frame) {
    const found = findContainingHost(app.kind, app.lastCenter, scene);
    if (found) {
      frame = found;
      offsetCm = clampOffset(offsetFromCenter(found, app.lastCenter, app.widthCm), app.widthCm, found);
      patch.host = found.host;
      patch.offsetCm = offsetCm;
      if (found.host.type === "wall") patch.hostStart = { ...found.origin };
      if (usesIslandSide(app.kind, found)) patch.islandSide = islandSideAt(found, app.lastCenter);
    }
  }

  if (!frame) {
    const corners = orphanCorners(app);
    return {
      appliance: app,
      frame: null,
      offsetCm: app.offsetCm,
      corners,
      center: app.lastCenter,
      status: "orphan",
      patch: Object.keys(patch).length ? patch : null,
    };
  }

  const drawnOffset = clampOffset(offsetCm, app.widthCm, frame);
  const islandSide = effectiveIslandSide(app.kind, frame, patch.islandSide ?? app.islandSide);
  const corners = footprintCorners(app.kind, app.widthCm, drawnOffset, frame, islandSide);
  const center = polygonCenter(corners);
  if (!samePoint(app.lastCenter, center)) patch.lastCenter = center;
  const overflow = app.widthCm > pixelsToCm(frame.lengthPx) + 0.5;
  return {
    appliance: app,
    frame,
    offsetCm: drawnOffset,
    corners,
    center,
    status: overflow ? "overflow" : "ok",
    islandSide,
    patch: Object.keys(patch).length ? patch : null,
  };
}

// ─── Placement: snapping + validation ───────────────────────────────────────

export interface PlacementCandidate {
  kind: ApplianceKind;
  widthCm: number;
  frame: HostFrame | null;
  offsetCm: number;
  corners: Point[];
  center: Point;
  valid: boolean;
  /** Why it is invalid (red preview / toast). */
  reason?: string;
  /** Island side the appliance opens to (inside items on islands only). */
  islandSide?: 1 | -1;
  /** Allowed, but worth telling the user (e.g. hood over a wall cabinet). */
  warning?: string;
}

/**
 * Snap a raw start offset (cm) on a host to: host ends, other appliances'
 * edges on the same host, and centre-alignment with them. Otherwise round to
 * 1 cm. Result is clamped to the host length.
 */
export function snapOffset(
  rawOffsetCm: number,
  widthCm: number,
  frame: HostFrame,
  others: Array<{ offsetCm: number; widthCm: number }>,
  snapCm = APPLIANCE_SNAP_CM,
): number {
  const hostLen = pixelsToCm(frame.lengthPx);
  const targets: number[] = [0, hostLen - widthCm];
  for (const o of others) {
    const oEnd = o.offsetCm + o.widthCm;
    targets.push(oEnd, o.offsetCm - widthCm, o.offsetCm, oEnd - widthCm, o.offsetCm + o.widthCm / 2 - widthCm / 2);
  }
  let best = Math.round(rawOffsetCm);
  let bestDist = snapCm;
  for (const t of targets) {
    const d = Math.abs(t - rawOffsetCm);
    if (d <= bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return clampOffset(best, widthCm, frame);
}

const intervalOverlapCm = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0);

/**
 * Build a placement candidate for an appliance whose centre is at `centerWorld`,
 * snapping to the nearest allowed host, then validate it.
 * `existing` = resolved appliances already on the plan (minus the one being moved).
 */
export function computePlacement(
  kind: ApplianceKind,
  widthCm: number,
  centerWorld: Point,
  scene: ApplianceScene,
  existing: ResolvedAppliance[],
  hostTolerancePx: number,
): PlacementCandidate {
  const frame = findHostNear(kind, centerWorld, scene, hostTolerancePx);
  if (!frame) {
    const hw = cmToPixels(widthCm) / 2;
    const hd = cmToPixels(orphanDepthCm(kind)) / 2;
    const c = centerWorld;
    return {
      kind,
      widthCm,
      frame: null,
      offsetCm: 0,
      corners: [
        { x: c.x - hw, y: c.y - hd },
        { x: c.x + hw, y: c.y - hd },
        { x: c.x + hw, y: c.y + hd },
        { x: c.x - hw, y: c.y + hd },
      ],
      center: c,
      valid: false,
      reason: applianceWhereHint(kind),
    };
  }
  const sameHost = existing.filter(
    (r) => r.frame && r.frame.host.type === frame.host.type && r.frame.host.id === frame.host.id && r.status !== "orphan",
  );
  const raw = offsetFromCenterRaw(frame, centerWorld, widthCm);
  const offsetCm = snapOffset(
    raw,
    widthCm,
    frame,
    sameHost.map((r) => ({ offsetCm: r.offsetCm, widthCm: r.appliance.widthCm })),
  );
  const islandSide = usesIslandSide(kind, frame) ? islandSideAt(frame, centerWorld) : undefined;
  return validatePlacement(kind, widthCm, frame, offsetCm, scene, existing, islandSide);
}

function offsetFromCenterRaw(frame: HostFrame, center: Point, widthCm: number): number {
  const { a } = toFrameLocal(frame, center);
  return pixelsToCm(a) - widthCm / 2;
}

/** Validate an appliance at a given host + offset against the placement rules. */
export function validatePlacement(
  kind: ApplianceKind,
  widthCm: number,
  frame: HostFrame,
  offsetCm: number,
  scene: ApplianceScene,
  existing: ResolvedAppliance[],
  islandSide?: 1 | -1,
): PlacementCandidate {
  const def = getApplianceDef(kind);
  const side = effectiveIslandSide(kind, frame, islandSide);
  const corners = footprintCorners(kind, widthCm, offsetCm, frame, side);
  const center = polygonCenter(corners);
  const base: PlacementCandidate = { kind, widthCm, frame, offsetCm, corners, center, valid: true, islandSide: side };
  // On an island deep enough for two, inside items on opposite sides sit back to back.
  const backToBackFits =
    side !== undefined && 2 * Math.min(frame.depthPx, cmToPixels(ISLAND_INSIDE_MAX_DEPTH_CM)) <= frame.depthPx + 0.5;
  const fail = (reason: string): PlacementCandidate => ({ ...base, valid: false, reason });
  const title = `${def.name} ${widthCm} cm`;

  if (frame.hostKind === "wall_cabinet" || !def.hosts.includes(frame.hostKind as ApplianceHostKind)) {
    return fail(applianceWhereHint(kind));
  }
  const hostLenCm = pixelsToCm(frame.lengthPx);
  if (widthCm > hostLenCm + 0.5) {
    return fail(`${title} is wider than this ${frame.host.type === "wall" ? "wall" : "run"}`);
  }

  // Same placement layer on the same host may not overlap — tall-run items
  // stack in one column when they share position and width.
  const a0 = offsetCm;
  const a1 = offsetCm + widthCm;
  const sameHost = existing.filter(
    (r) => r.frame && r.status !== "orphan" && r.frame.host.type === frame.host.type && r.frame.host.id === frame.host.id,
  );
  const stack: ResolvedAppliance[] = [];
  for (const r of sameHost) {
    const rDef = getApplianceDef(r.appliance.kind);
    if (rDef.placement !== def.placement) continue;
    if (backToBackFits && r.islandSide !== undefined && r.islandSide !== side) continue;
    const overlap = intervalOverlapCm(a0, a1, r.offsetCm, r.offsetCm + r.appliance.widthCm);
    if (overlap <= 0.5) continue;
    const stackable =
      frame.hostKind === "tall" &&
      def.stackHeightCm !== undefined &&
      rDef.stackHeightCm !== undefined &&
      Math.abs(r.offsetCm - offsetCm) <= 0.5 &&
      r.appliance.widthCm === widthCm;
    if (!stackable) {
      return fail(`Overlaps the ${rDef.name.toLowerCase()} ${r.appliance.widthCm} cm`);
    }
    stack.push(r);
  }
  if (stack.length > 0) {
    const used = stack.reduce((s, r) => s + (getApplianceDef(r.appliance.kind).stackHeightCm ?? 0), 0);
    if (used + (def.stackHeightCm ?? 0) > TALL_COLUMN_MAX_HEIGHT_CM) {
      return fail("No height left in this tall column");
    }
  }

  // Never in the corner overlap square of a CornerCabinetPair.
  if (frame.host.type === "cabinet") {
    const hostId = frame.host.id;
    const pairs = findCornerCabinetPairs(scene.cabinets, scene.walls);
    for (const pair of pairs) {
      const other =
        pair.cabinet1.id === hostId ? pair.cabinet2 : pair.cabinet2.id === hostId ? pair.cabinet1 : null;
      if (!other) continue;
      if (polygonsOverlap(corners, cabinetRectStored(other))) {
        return fail(`${def.name} can't go in the corner`);
      }
    }
  }

  if (kind === "range" && frame.host.type === "wall") {
    for (const cab of scene.cabinets) {
      if (polygonsOverlap(corners, cabinetRectStored(cab))) {
        return fail("Cooking range needs free floor space");
      }
    }
    for (const isl of scene.islands) {
      if (polygonsOverlap(corners, islandRect(isl))) {
        return fail("Cooking range needs free floor space");
      }
    }
    for (const op of scene.openings) {
      if (op.type !== "door") continue;
      // Door opening on this wall: along-wall overlap with the range.
      const s = toFrameLocal(frame, op.start);
      const e = toFrameLocal(frame, op.end);
      const onThisWall =
        op.wallId === frame.host.id || (Math.abs(s.d) <= 30 && Math.abs(e.d) <= 30);
      if (onThisWall) {
        const o0 = pixelsToCm(Math.min(s.a, e.a));
        const o1 = pixelsToCm(Math.max(s.a, e.a));
        if (intervalOverlapCm(a0, a1, o0, o1) > 0.5) {
          return fail("Cooking range can't block a door");
        }
      }
      // Clearance zone in front of the door (uses the existing zone).
      const zone = computeClearanceZone(op, scene.walls);
      if (zone && polygonsOverlap(corners, zone.corners)) {
        return fail("Cooking range can't go in front of a door");
      }
    }
  }

  if (kind === "hood") {
    const overWallCab = scene.cabinets.some(
      (c) => c.type === "wall_cabinet" && polygonsOverlap(corners, cabinetRectStored(c)),
    );
    if (overWallCab) return { ...base, warning: "Hood is over a wall cabinet" };
  }

  return base;
}

/**
 * Islands have no front: inside-cabinet labels go below the long side that
 * faces away from the reference wall. Returns +1 if that side is the d = depth
 * edge, −1 if it is the d = 0 edge.
 */
export function islandLabelSide(frame: HostFrame, island: Island | undefined, walls: Wall[]): 1 | -1 {
  const mid0 = framePoint(frame, frame.lengthPx / 2, 0);
  const mid1 = framePoint(frame, frame.lengthPx / 2, frame.depthPx);
  const ref = island ? walls.find((w) => w.id === island.referenceWallId) : undefined;
  const candidates = ref ? [ref] : walls;
  if (candidates.length === 0) return 1;
  const distTo = (p: Point) =>
    Math.min(
      ...candidates.map((w) => {
        const dx = w.end.x - w.start.x;
        const dy = w.end.y - w.start.y;
        const lenSq = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p.x - w.start.x) * dx + (p.y - w.start.y) * dy) / lenSq));
        return Math.hypot(p.x - (w.start.x + dx * t), p.y - (w.start.y + dy * t));
      }),
    );
  return distTo(mid1) >= distTo(mid0) ? 1 : -1;
}
