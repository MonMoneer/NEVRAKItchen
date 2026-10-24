// Walls drawn on top of each other. A wall that is stacked under another looks
// like a single wall, so deleting "the wall" one click at a time never seems to
// do anything. The Delete tool uses this to take every wall under the click.

import { type Point, type Wall, angleBetween, pointNearLine } from "./kitchen-engine";

const PARALLEL_TOLERANCE_RAD = (3 * Math.PI) / 180;

/** Same body hit area findHitTarget uses for a wall: half its thickness plus 5 px. */
const bodyHitRadius = (w: Wall) => w.thickness / 2 + 5;

function isParallel(a: Wall, b: Wall): boolean {
  let diff = Math.abs(angleBetween(a.start, a.end) - angleBetween(b.start, b.end)) % Math.PI;
  if (diff > Math.PI / 2) diff = Math.PI - diff;
  return diff <= PARALLEL_TOLERANCE_RAD;
}

/**
 * The hit wall plus every other wall stacked with it under `pos`: parallel to
 * it (either direction) and with `pos` inside its own body hit area. Walls that
 * merely cross or meet it -- the other side of a corner, a T-junction -- are
 * not parallel and are never included.
 *
 * The hit wall is always first; the result has at least one wall.
 */
export function wallsStackedUnder(pos: Point, hitWallId: string, walls: Wall[]): Wall[] {
  const hit = walls.find((w) => w.id === hitWallId);
  if (!hit) return [];
  const stacked = walls.filter(
    (w) =>
      w.id !== hit.id &&
      isParallel(hit, w) &&
      pointNearLine(pos, w.start, w.end, bodyHitRadius(w)),
  );
  return [hit, ...stacked];
}
