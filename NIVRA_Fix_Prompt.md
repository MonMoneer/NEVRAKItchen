# NIVRA Kitchen CRM — Drawing Engine Fix Prompt

## Project Context

This is a **kitchen design CRM** web app for NIVRA company (Dubai, UAE). It allows salespeople and technicians to draw 2D kitchen layouts, place cabinets on walls, add doors/windows, mark electrical/plumbing points, and generate price quotations.

**Tech stack:** React 18 + TypeScript + Konva.js (canvas) + Express + PostgreSQL + Drizzle ORM + Zustand (state) + Tailwind CSS

**Key files you MUST read before making any changes:**
- `client/src/components/kitchen/DesignerCanvas.tsx` — 4,034 lines, the main canvas component
- `client/src/lib/kitchen-engine.ts` — 1,505 lines, all geometry/math functions
- `client/src/stores/useCanvasStore.ts` — 388 lines, Zustand state management
- `client/src/pages/project-detail.tsx` — 1,066 lines, page that hosts the canvas
- `client/src/components/kitchen/PricingPanel.tsx` — 242 lines, live pricing calculations
- `shared/schema.ts` — 155 lines, database schema

**The target users are NON-TECHNICAL salespeople.** They don't know AutoCAD or 2D drawing. The UX must be extremely simple and forgiving.

---

## PROBLEM 1: Direction Lock Bug (CRITICAL)

### What's broken:
When a user places a cabinet (base, wall, or tall) on a wall, the flow is:
1. Click wall → set start point (offset from corner)
2. Confirm offset → enter "settingLength" phase
3. Move mouse along wall to set cabinet length

**The bug:** In step 3, once the mouse moves more than 5 pixels in one direction, the `drawDirection` variable permanently locks to `1` or `-1`. The user can NEVER reverse direction after this. If they clicked at the middle of a wall and accidentally moved right first, they're stuck drawing right — they can't go left.

### Exact code location:
**File:** `client/src/components/kitchen/DesignerCanvas.tsx`
**Lines ~1562-1569** inside `handleMouseMove`, within the `wallPlacement.phase === 'settingLength'` block:

```typescript
let currentLockedDir = wallPlacement.drawDirection;
if (
    currentLockedDir === null ||
    currentLockedDir === undefined
) {
    if (Math.abs(unclampedDist) > 5) {
        currentLockedDir = unclampedDist > 0 ? 1 : -1;
    }
}
```

Then at **lines ~1572-1581**, the locked direction clamps the position:
```typescript
let snappedPos = projected;
if (
    currentLockedDir !== null &&
    currentLockedDir !== undefined
) {
    const clampedDist =
        currentLockedDir > 0
            ? Math.max(0, projectedDist)
            : Math.min(0, projectedDist);
    snappedPos = {
        x: startPt.x + wallUnitX * clampedDist,
        y: startPt.y + wallUnitY * clampedDist,
    };
}
```

The same direction lock also affects `handleDimensionConfirm` at **lines ~1893-1910** where `lockedDir` determines the draw direction when the user types a length value.

### Required fix:
**Remove the direction lock entirely.** The mouse projection onto the wall should determine direction in real-time, every frame.

Specifically:
1. Remove the `drawDirection` property from `WallPlacementState` interface (line ~280)
2. In `handleMouseMove` settingLength block: remove the `currentLockedDir` logic. Just use `projected` position directly.
3. In `handleDimensionConfirm` settingLength block: when user types a length and presses Enter, use the CURRENT mouse position relative to the offset point to determine direction (not a stored `drawDirection`).
4. Remove all references to `drawDirection` from `setWallPlacement` state updates.

**This same fix applies to door and window placement** — they use the same `wallPlacement` state machine.

---

## PROBLEM 2: Wall Center Line (CRITICAL)

### What's broken:
Walls are rendered as `<Line>` elements with a `strokeWidth` of `WALL_THICKNESS` (15px). The line itself sits at the **center** of the wall. When cabinets, doors, and windows are placed, they attach to this **center line**, not to the **inner face** of the wall.

**Problem A — Cabinet overlaps wall:** The cabinet's back edge sits on the center line, so half the wall thickness (7.5px = 3.75cm) overlaps INTO the wall.

**Problem B — Door/cabinet misalignment:** If a wall is 500cm and you place a 120cm door, the remaining space should be exactly 380cm for base cabinet. But center-line anchoring creates gaps. Door edge and cabinet edge don't touch perfectly.

### Required changes:
All element placement must snap to the **inner face** of the wall. Inner face = center line offset by `WALL_THICKNESS / 2` toward the room interior.

The code already has `computeInteriorNormal()` in `kitchen-engine.ts` (line ~640) that calculates which side is "interior".

**Implementation:**
1. Add a new function `getInnerFacePoint(point, wall, walls)` in `kitchen-engine.ts` that offsets any center-line point by `WALL_THICKNESS / 2` in the interior normal direction.
2. In `DesignerCanvas.tsx` → `createElementAtPoints()` (line ~860): offset both startPoint and endPoint to inner face before creating element.
3. In wall placement `settingOffset` phase: constrained position should project onto inner face, not center line.
4. All anchor points (wall corners, door edges, window edges, cabinet edges) must reference inner face positions.
5. Door/window rendering should align to inner face so edges match cabinet edges perfectly.

---

## PROBLEM 3: Anchor Point System (IMPORTANT)

### What's broken:
When user clicks a wall to place a cabinet, the system auto-picks the **nearest wall corner** as reference:

```typescript
// findNearestWall() — kitchen-engine.ts line ~900
const referenceEndpoint = distToStart <= distToEnd ? wall.start : wall.end;
```

User has NO choice of reference point.

### Required fix:
When hovering a wall with a placement tool active, show ALL available anchor points:
- Wall start/end corners
- Every door start/end edge on that wall
- Every window start/end edge on that wall
- Every cabinet start/end edge on that wall

Each anchor = visible colored marker. User clicks one → that becomes the reference point.

**Visual markers:**
- Wall corner = square (gray)
- Door edge = diamond (orange)
- Window edge = diamond (cyan)
- Cabinet edge = circle (blue)

Show tooltip on hover. Selected anchor = bigger with pulse animation.

---

## PROBLEM 4: Door/Window Clearance Zone (SIMPLE FIX)

### What's broken:
Doors/windows have 5cm clearance zone blocking cabinets beyond their width.

### Required fix:
Set clearance to 0:
```typescript
export const CLEARANCE_DEPTHS: Record<OpeningType, number> = {
  door: 0,
  window: 0,
};
```

Door/window blocks EXACTLY its own width — not 1mm more. Cabinet edge can touch door edge with zero gap. Door/window edges become valid anchor points.
