# NIVRA Kitchen CRM — Drawing Engine Fix Prompt

## PROJECT CONTEXT

This is a web-based kitchen layout CRM for NIVRA (a kitchen company in UAE). Built with React + TypeScript + Konva.js (2D canvas) + Express + PostgreSQL. Originally built on Replit.

The system lets salespeople draw 2D kitchen layouts: walls, base cabinets, wall cabinets, tall cabinets, doors, windows, and then generates pricing quotes.

**Key files you MUST read before making any changes:**
- `client/src/lib/kitchen-engine.ts` (1,505 lines) — all geometry math, snap logic, collision detection
- `client/src/components/kitchen/DesignerCanvas.tsx` (4,034 lines) — the main canvas component with all drawing tools
- `client/src/pages/project-detail.tsx` (1,066 lines) — project page that uses the canvas, handles cabinet add/split logic
- `client/src/stores/useCanvasStore.ts` (388 lines) — Zustand store for canvas state
- `client/src/components/kitchen/PricingPanel.tsx` (242 lines) — pricing calculations
- `shared/schema.ts` (155 lines) — database schema

---

## THE 3 CRITICAL FIXES NEEDED

### FIX 1 — Cabinets/Doors/Windows must snap to INNER WALL FACE (not center line)

**The problem:**
Walls are drawn as a `<Line>` with `strokeWidth={wall.thickness}` (15px). The line itself sits at the CENTER of the wall. When a cabinet is placed, its `start` and `end` points land on this center line. This causes:

1. **Cabinet overlaps into the wall** by half the wall thickness (7.5px = ~3.75cm)
2. **Door/window edges don't align with cabinet edges.** Example: a 500cm wall with a 120cm door should leave exactly 380cm for cabinets. But because the door sits on the center line and the cabinet sits on the center line, their edges don't touch perfectly — there's always a gap or overlap equal to half the wall thickness.

**The fix:**
All elements (cabinets, doors, windows) must be offset by `WALL_THICKNESS / 2` in the **interior normal direction** when placed.

The function `computeInteriorNormal()` in `kitchen-engine.ts` (around line 640) already calculates which side of a wall is "inside" the room using `buildRoomPolygon()` + `pointInPolygon()`. Use this to offset placement points.

**Where to change:**
- `DesignerCanvas.tsx` → `createElementAtPoints()` function (around line 860) — this is where cabinets/openings get their final coordinates. Offset `startPoint` and `endPoint` by `WALL_THICKNESS / 2` in the interior normal direction BEFORE creating the element.
- Also update the rendering: cabinets should visually sit against the inner face, not overlap into the wall.
- Door/window edges on the inner face become the anchor points for cabinets.

**Important:** The `constrainToWall()` function projects points onto the wall center line. After projection, add the inner-face offset. Keep the wall's center-line logic for the wall itself — only offset the ELEMENTS placed on the wall.

---

### FIX 2 — Remove direction lock (let mouse decide direction freely)

**The problem:**
In `DesignerCanvas.tsx`, when placing a cabinet/door/window in the "settingLength" phase, there's a `drawDirection` state variable. Once the mouse moves more than 5px in one direction, `drawDirection` locks to `1` (A→B) or `-1` (B→A) and NEVER resets. The user can't change direction after that.

**The exact buggy code (around line 1547 in handleMouseMove):**
```typescript
let currentLockedDir = wallPlacement.drawDirection;
if (currentLockedDir === null || currentLockedDir === undefined) {
    if (Math.abs(unclampedDist) > 5) {
        currentLockedDir = unclampedDist > 0 ? 1 : -1;
    }
}
```

