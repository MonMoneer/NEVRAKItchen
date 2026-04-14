# REAL BUG DIAGNOSIS — Inner Face Offset Not Working

## What the User Sees
- Base cabinets placed OUTSIDE the kitchen (wrong side of wall)
- Cabinets show 396cm instead of 400cm
- Door/window still on center line
- The code HAS the fix (commit e29afaa) but the behavior hasn't changed

## Root Cause Analysis

I inspected the code. The fix IS in `createElementAtPoints()` (line ~895). The offset code is there. BUT the problem is deeper:

### Problem 1: `computeInteriorNormal` may return wrong direction

`computeInteriorNormal()` in kitchen-engine.ts (line 734) works like this:
1. Try `buildRoomPolygon(walls)` → if it returns a polygon, use `pointInPolygon` to find which side is interior
2. If polygon is null → FALL BACK to heuristic (find nearest wall on each side)

The FALLBACK HEURISTIC is unreliable. For some wall configurations it picks the wrong side. 

**Check:** Add `console.log('Room polygon:', buildRoomPolygon(drawingState.walls))` in `createElementAtPoints` before the offset code. If it logs `null`, the polygon detection is failing and the heuristic is guessing wrong.

### Problem 2: `calculateDepthDirection` and offset normal may disagree

The code calls:
- `calculateDepthDirection(startPoint, finalEnd, walls)` — for depth flip
- `computeInteriorNormal(parentWall.start, parentWall.end, walls)` — for offset

These use DIFFERENT input points. `calculateDepthDirection` passes the cabinet's start/end on the wall surface. `computeInteriorNormal` passes the wall's own endpoints. They might calculate different normals for the same wall.

**Fix:** Make both use the SAME call. Use the parentWall's start/end for both:

```typescript
const parentWall = walls.find(w => w.id === parentWallId);
if (parentWall) {
    const normal = computeInteriorNormal(parentWall.start, parentWall.end, walls);
    // Use this SAME normal for both offset AND depth direction
}
```

### Problem 3: Rendering uses `distanceBetween(cabinet.start, cabinet.end)` for visual length

In `renderCabinetBody` (line ~2883):
```typescript
const length = distanceBetween(cabinet.start, cabinet.end);
```

After inner-face offset, `cabinet.start` and `cabinet.end` are the OFFSET points. The distance between offset points might be slightly different from the wall-surface distance (because the perpendicular offset on angled walls changes the projected length). This explains 396cm vs 400cm.

**Fix:** The `length` field on the Cabinet object already stores `pixelsToCm(originalLength)`. Use `cmToPixels(cabinet.length)` for rendering instead of `distanceBetween(cabinet.start, cabinet.end)`.

## Debug Steps

1. Open browser console (F12)
2. Add these logs in `createElementAtPoints`:
   ```
   console.log('Room polygon:', buildRoomPolygon(walls));
   console.log('Interior normal:', normal);
   console.log('Original points:', startPoint, finalEnd);
   console.log('Offset points:', placedStart, placedEnd);
   console.log('Parent wall:', parentWall?.start, parentWall?.end);
   ```
3. Draw 4 walls forming a rectangle
4. Place a base cabinet
5. Check console — what does the room polygon and normal look like?

## Expected After Fix

- ALL cabinets render INSIDE the room
- ALL cabinets show correct length (400cm not 396cm)
- Depth direction is consistent on ALL walls
- Door/window edges align with cabinet edges (both on inner face)
- This must work for ANY wall configuration (rectangle, L-shape, U-shape)
