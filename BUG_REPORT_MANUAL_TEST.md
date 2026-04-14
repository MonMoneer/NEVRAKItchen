# BUG REPORT FROM MANUAL TESTING — 2 Critical Issues Found

## BUG 1: Base Cabinet Placed OUTSIDE the Kitchen Room

**Screenshot:** See screenshot 1 — the blue "BC" hatch rectangle is on the WRONG side of the wall. It should be INSIDE the room.

**What happens:** When placing a base cabinet on a wall, the depth direction flips to the OUTSIDE of the room instead of inside. The `calculateDepthDirection()` or `computeInteriorNormal()` function is returning the wrong normal direction.

**Root cause:** The cabinet's `depthFlipped` value is being calculated incorrectly. The function tests which side of the wall is "inside" the room using `buildRoomPolygon()` + `pointInPolygon()`. Either:
1. The room polygon is not being detected (returns null, falls back to wrong heuristic)
2. The interior normal calculation is inverted

**How to debug:**
1. After drawing walls, add `console.log(buildRoomPolygon(walls))` — if it returns null, the room polygon detection is broken
2. Check `computeInteriorNormal()` — print the normal direction and verify it points INWARD
3. Check `calculateDepthDirection()` — the boolean it returns may need to be flipped

**Expected:** Cabinet depth should ALWAYS extend toward the INSIDE of the room. The blue "BC" rectangle should be between the walls, not outside them.

## BUG 2: Door and Window Snap to Wall Center Line (Not Inner Edge)

**Screenshot:** See screenshot 2 zoomed in — the door "DR" (orange) and window "WN" (cyan) sit at the CENTER of the wall thickness. The base cabinet also snaps to the center line.

**What happens:** All elements (cabinets, doors, windows) are placed on the wall's center line. They need to be offset by WALL_THICKNESS / 2 toward the room interior so they sit on the inner face.

**This is FIX 1 from the plan.** It has not been applied yet. The fix is in Step 4 of the plan:

In `createElementAtPoints()` (DesignerCanvas.tsx ~line 870), after getting the final coordinates, offset ALL non-wall elements by `WALL_THICKNESS / 2` in the interior normal direction:

```typescript
let adjustedStart = { ...startPoint };
let adjustedEnd = finalEnd;
if (tool !== 'wall' && parentWallId) {
  const parentWall = walls.find(w => w.id === parentWallId);
  if (parentWall) {
    const normal = computeInteriorNormal(parentWall.start, parentWall.end, walls);
    const offset = WALL_THICKNESS / 2;
    adjustedStart = { x: startPoint.x + normal.nx * offset, y: startPoint.y + normal.ny * offset };
    adjustedEnd = { x: finalEnd.x + normal.nx * offset, y: finalEnd.y + normal.ny * offset };
  }
}
```

Then use `adjustedStart` and `adjustedEnd` for creating cabinets, doors, and windows.

## Priority

FIX BUG 1 FIRST — cabinets on wrong side makes the app unusable.
Then FIX BUG 2 — inner face offset so door/window/cabinet edges align perfectly.

Both bugs are related to the same area of code: interior normal calculation and element placement offset.

## Test After Fix

1. Draw 4 walls forming a rectangle room
2. Place a base cabinet — it MUST appear INSIDE the room
3. Place a door — it should sit on the inner wall face
4. Place a cabinet next to the door — zero gap between door edge and cabinet edge
5. Zoom in to verify: cabinet does NOT overlap into the wall
