# Island Tool Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the wall-anchored island drawing tool with a free-floating rotated-rectangle island drawn via a 4-click reference-wall + offset rail flow, stored as a new `Island` data type independent from `Cabinet`.

**Architecture:** New `Island` interface in `kitchen-engine.ts`. New `islands: Island[]` array in Zustand canvas store with its own CRUD actions. New drawing state machine with 5 phases (`idle → pickingWall → typingOffset → pickingCorner1 → draggingLength → draggingDepth`). New `<IslandLayer>` + `<IslandDrawingOverlay>` Konva groups in `DesignerCanvas.tsx`. New DOM overlay component for typed inputs. New `IslandLayerCard` in `LayerPanel.tsx` with 4 bidirectional editable fields (Length, Depth, Height, Offset). Old anchor-walk flow gated behind `USE_LEGACY_ISLAND_TOOL = false` feature flag.

**Tech Stack:** React 18, TypeScript, Zustand, Konva/react-konva, Tailwind, Vite. Deploys via Railway on push to `main`.

**Linked design doc:** `/Users/Admin/.claude/plans/nivra-dream-home-pricing.md` is the pricing baseline. Island redesign decisions live in-conversation; key points inlined in this plan.

---

## Prerequisites

- Working directory: `/Users/Admin/Documents/MONEER/NIVRA/REbilt`
- `main` branch, currently at commit `45bdfda` or later
- `npm run build` must succeed after every task before committing
- Each task is standalone — if a task breaks the build, fix before proceeding to the next task

## Pre-execution codebase findings

1. **`Cabinet` has `type: "island"`** already (kitchen-engine.ts:13). This stays — legacy saved projects need to keep rendering. New islands go into a separate `Island` interface and `islands: Island[]` array.
2. **`PIXELS_PER_CM = 2`** exported from kitchen-engine.ts:122. Use this for cm↔px conversions.
3. **Canvas store** uses Zustand with a `history` stack for undo/redo. Any new action that mutates `islands` must push to history.
4. **`loadFromCanvasData`** in useCanvasStore.ts hydrates from `spaces.canvas_data` JSONB. Islands need to be read from `data.islands ?? []` and saved via `getCanvasData()`.
5. **`DesignerCanvas.tsx`** is ~4500 lines. The legacy island state machine lives around lines 880, 1183, 1220, 1307, 2244, 2938, 4295. It uses `useState<IslandPlacementState | null>` — not Zustand.
6. **Drawing tool enum** in `DrawingState.tool` doesn't include `"island"`. Legacy island uses a separate `activeCustomTool` state in DesignerCanvas. New flow uses the new `islandDrawingState` in Zustand.
7. **Konva** supports `<Rect>` with `x`, `y`, `width`, `height`, `rotation`, `offsetX`, `offsetY`. Rotation is in **degrees** (not radians).

---

## Task 1: Data Model — `Island` interface + helpers in kitchen-engine.ts

**Files:**
- Modify: `client/src/lib/kitchen-engine.ts`

**Step 1: Add `Island` interface**

Add this after the existing `Cabinet` interface (around line 28):

```ts
// Free-floating island placed via reference wall + offset rail
// NOT a subtype of Cabinet — see 2026-04-15 island redesign.
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
}
```

**Step 2: Add geometry helpers**

Add at the end of `kitchen-engine.ts` (after the existing exports):

```ts
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
```

**Step 3: Build and verify**

Run: `cd /Users/Admin/Documents/MONEER/NIVRA/REbilt && npx tsc --noEmit 2>&1 | tail -20`

Expected: zero errors. `kitchen-engine.ts` should compile cleanly. No other files reference `Island` yet, so no cascading errors.

**Step 4: Commit**

```bash
git add client/src/lib/kitchen-engine.ts
git commit -m "feat(island): add Island type and geometry helpers

Define the Island interface (separate from Cabinet) plus pure helpers
for wall angle, perpendicular unit vector, point-on-line projection,
signed perpendicular distance, rail computation, and normalization.

No usages yet — wired up in later tasks.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Canvas Store — `islands` array + drawing state machine + actions

**Files:**
- Modify: `client/src/stores/useCanvasStore.ts`

**Step 1: Import `Island` type**

Extend the existing import at the top of `useCanvasStore.ts`:

```ts
import type { Wall, Cabinet, Opening, DrawingState, Guideline, Layer, Island, Point } from "@/lib/kitchen-engine";
import { createInitialDrawingState, normalizeLayer, normalizeIsland } from "@/lib/kitchen-engine";
```

**Step 2: Add `IslandDrawingState` union type**

Add after the existing `WallPointItem` interface (around line 35):

```ts
export type IslandDrawingState =
  | { phase: "idle" }
  | { phase: "pickingWall" }
  | { phase: "typingOffset"; referenceWallId: string }
  | { phase: "pickingCorner1"; referenceWallId: string; offsetFromWallCm: number; depthSide: "near" | "far" }
  | { phase: "draggingLength"; referenceWallId: string; offsetFromWallCm: number; depthSide: "near" | "far"; anchor: Point }
  | { phase: "draggingDepth"; referenceWallId: string; offsetFromWallCm: number; depthSide: "near" | "far"; anchor: Point; lengthCm: number };
```

**Step 3: Extend `DesignData` and `CanvasState`**

In `DesignData` interface, add `islands?: Island[]`:

```ts
interface DesignData {
  walls: Wall[];
  cabinets: Cabinet[];
  openings: Opening[];
  elements: CanvasElement[];
  wallPoints: WallPointItem[];
  guidelines: Guideline[];
  layers?: Layer[];
  islands?: Island[];
}
```

In `CanvasState`, add two fields and CRUD methods:

```ts
interface CanvasState {
  // ... existing fields
  islands: Island[];
  islandDrawingState: IslandDrawingState;

  // ... existing methods
  addIsland: (island: Island) => void;
  updateIsland: (id: string, updates: Partial<Island>) => void;
  removeIsland: (id: string) => void;
  startIslandDraw: () => void;
  cancelIslandDraw: () => void;
  setIslandPhase: (next: IslandDrawingState) => void;
}
```

**Step 4: Wire up the store's initial state**

Find the `create<CanvasState>((set, get) => ({` block and add to the initial state:

```ts
  islands: [],
  islandDrawingState: { phase: "idle" },
```

Place them near the `layers: []` and `activeLayerId: null` entries.

**Step 5: Implement the new actions**

Add these inside the store (I recommend placing them right after `setActiveLayer`):

```ts
  addIsland: (island) =>
    set((state) => {
      const newIslands = [...state.islands, island];
      return {
        islands: newIslands,
        history: pushState(state.history, {
          walls: state.drawingState.walls,
          cabinets: state.drawingState.cabinets,
          openings: state.drawingState.openings,
          elements: state.elements,
          wallPoints: state.wallPoints,
          guidelines: state.guidelines,
          layers: state.layers,
          islands: newIslands,
        }),
      };
    }),

  updateIsland: (id, updates) =>
    set((state) => {
      const newIslands = state.islands.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      );
      return {
        islands: newIslands,
        history: pushState(state.history, {
          walls: state.drawingState.walls,
          cabinets: state.drawingState.cabinets,
          openings: state.drawingState.openings,
          elements: state.elements,
          wallPoints: state.wallPoints,
          guidelines: state.guidelines,
          layers: state.layers,
          islands: newIslands,
        }),
      };
    }),

  removeIsland: (id) =>
    set((state) => {
      const newIslands = state.islands.filter((i) => i.id !== id);
      return {
        islands: newIslands,
        history: pushState(state.history, {
          walls: state.drawingState.walls,
          cabinets: state.drawingState.cabinets,
          openings: state.drawingState.openings,
          elements: state.elements,
          wallPoints: state.wallPoints,
          guidelines: state.guidelines,
          layers: state.layers,
          islands: newIslands,
        }),
      };
    }),

  startIslandDraw: () =>
    set({ islandDrawingState: { phase: "pickingWall" } }),

  cancelIslandDraw: () =>
    set({ islandDrawingState: { phase: "idle" } }),

  setIslandPhase: (next) =>
    set({ islandDrawingState: next }),
```

**Step 6: Extend `loadFromCanvasData` to read islands**

Find the `loadFromCanvasData: (data) => {` implementation. Add this line alongside the existing array extraction (near `const layers: Layer[] = Array.isArray(data.layers) ? data.layers.map(normalizeLayer) : [];`):

```ts
    const islands: Island[] = Array.isArray(data.islands) ? data.islands.map(normalizeIsland) : [];
```

Then include `islands` in the `set(...)` call and in the `createHistory({ ... })` call so history starts with the loaded islands. Also reset `islandDrawingState: { phase: "idle" }`.

**Step 7: Extend `getCanvasData` to include islands**

Find `getCanvasData: () => {`. Add `islands: get().islands` to the returned object.

**Step 8: Extend `clear` to reset islands**

Find `clear: () =>`. Add `islands: []` and `islandDrawingState: { phase: "idle" }` to its returned state.

**Step 9: Extend `removeLayer` to delete bound islands**

Find `removeLayer: (id) =>`. Inside its `set` callback, additionally filter out any islands with `layerId === id`:

```ts
      const newIslands = state.islands.filter((i) => i.layerId !== id);
      // ... include newIslands in the returned state and pushState call
```

**Step 10: Build and verify**

Run: `npx tsc --noEmit 2>&1 | tail -30`

Expected: zero errors. If TypeScript complains about `pushState` not accepting `islands`, that's because `DesignData` doesn't have `islands`. You already added it in Step 3 — double-check it's there.

**Step 11: Commit**

```bash
git add client/src/stores/useCanvasStore.ts
git commit -m "feat(island): add islands slice + drawing state machine to canvas store

- Add islands: Island[] and islandDrawingState to CanvasState
- Add addIsland/updateIsland/removeIsland CRUD with history push
- Add startIslandDraw/cancelIslandDraw/setIslandPhase
- Extend loadFromCanvasData, getCanvasData, clear, removeLayer to handle islands

No UI wiring yet.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Feature Flag + Legacy Island Gate in DesignerCanvas.tsx

**Files:**
- Modify: `client/src/components/kitchen/DesignerCanvas.tsx`

The legacy island state machine uses `IslandPlacementState`, `islandPlacement`, `setIslandPlacement`, `computeIslandWalk`, and an `activeCustomTool === "island"` check. This task gates all of that behind a flag so the new flow has a clean slate.

**Step 1: Add the feature flag constant**

At the top of `DesignerCanvas.tsx`, just after the imports, add:

```ts
const USE_LEGACY_ISLAND_TOOL = false;
```

**Step 2: Gate the legacy state setup**

Find `const [islandPlacement, setIslandPlacement] = useState<IslandPlacementState | null>(null);` (~line 880).

Replace with:

```ts
// Legacy island state — retained behind feature flag
const [islandPlacement, setIslandPlacement] = useState<IslandPlacementState | null>(null);
```

(No change to the line itself — keep the `useState` for now so legacy-flagged references still compile. The goal is to gate the *usage* of `islandPlacement`, not the declaration.)

**Step 3: Gate the activeCustomTool island branches**

Find every block that reads `activeCustomTool === "island"` (use grep). There should be ~6 occurrences. For each, wrap the existing logic in a feature-flag check. Example:

```ts
// Before:
if (activeCustomTool === "island") {
  if (!islandPlacement || islandPlacement.phase === "pickingAnchor") {
    // ...
  }
  // ...
}

// After:
if (USE_LEGACY_ISLAND_TOOL && activeCustomTool === "island") {
  if (!islandPlacement || islandPlacement.phase === "pickingAnchor") {
    // ...
  }
  // ...
}
```

Do this for every `activeCustomTool === "island"` check.

**Step 4: Gate the legacy renderers**

Find the `islandPlacement && islandPlacement.phase !== "pickingAnchor"` JSX block (~line 4295). Wrap it:

```tsx
{USE_LEGACY_ISLAND_TOOL && islandPlacement && islandPlacement.phase !== "pickingAnchor" && (() => {
  // existing rendering code
})()}
```

Also find the `islandPlacement` check around line 2938 (inside a `useMemo` or similar) and wrap with the flag.

**Step 5: Build and verify**

Run: `npx tsc --noEmit 2>&1 | tail -20`

Expected: zero errors. The legacy code still exists and still type-checks; it just never runs because `USE_LEGACY_ISLAND_TOOL = false`.

Also manually verify: `grep -c "USE_LEGACY_ISLAND_TOOL" client/src/components/kitchen/DesignerCanvas.tsx` should return at least 7.

**Step 6: Deploy smoke test (non-blocking)**

After pushing at the end of the task, verify in the live app that:
- Activating "Island" tool from the legacy toolbar (if still accessible) does nothing / shows no placement UI
- Existing saved islands still render unchanged

If either fails, the new flow was clobbered — step back and re-check the flag placement.

**Step 7: Commit**

```bash
git add client/src/components/kitchen/DesignerCanvas.tsx
git commit -m "feat(island): gate legacy anchor-walk flow behind USE_LEGACY_ISLAND_TOOL

All legacy islandPlacement reads, overlays, and tool branches wrapped in
if (USE_LEGACY_ISLAND_TOOL) blocks. Flag defaults to false; old code
remains in repo but is dead at runtime. Sets up space for the new
reference-wall rail flow.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Typed-Input DOM Overlay Component

**Files:**
- Create: `client/src/components/kitchen/IslandInputOverlay.tsx`

This is a small React component rendered absolutely positioned over the canvas. It handles the typed number input for the 3 phases that need one: `typingOffset`, `draggingLength` (on Tab/Enter), `draggingDepth` (on Tab/Enter).

**Step 1: Create the file with full content**

```tsx
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

interface Props {
  label: string;             // "Offset cm" / "Length cm" / "Depth cm"
  initialValue?: string;     // optional prefill
  cursorPx: { x: number; y: number };  // absolute position on canvas wrapper
  onCommit: (value: number) => void;
  onCancel: () => void;
}

export function IslandInputOverlay({
  label,
  initialValue = "",
  cursorPx,
  onCommit,
  onCancel,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const n = parseFloat(value);
      if (Number.isFinite(n) && n > 0) onCommit(n);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className="absolute bg-card border border-border rounded-md shadow-lg px-2 py-1 flex items-center gap-1 pointer-events-auto"
      style={{
        left: cursorPx.x + 14,
        top: cursorPx.y - 18,
        zIndex: 60,
      }}
      // Prevent clicks from falling through to the canvas
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <Input
        ref={inputRef}
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-20 h-7 text-xs"
        placeholder={label}
      />
      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{label}</span>
    </div>
  );
}
```

**Step 2: Build and verify**

Run: `npx tsc --noEmit 2>&1 | tail -10`

Expected: zero errors. If the `Input` import path is wrong, check `client/src/components/ui/input.tsx` exists (it does, used by admin.tsx).

**Step 3: Commit**

```bash
git add client/src/components/kitchen/IslandInputOverlay.tsx
git commit -m "feat(island): add IslandInputOverlay DOM component

Floating input box for typed cm values during the island drawing flow.
Auto-focus on mount, Enter commits, Escape cancels, positioned
absolutely relative to the canvas wrapper via cursorPx prop.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: New Island Drawing Flow — Click Handler + Konva Overlays in DesignerCanvas

**Files:**
- Modify: `client/src/components/kitchen/DesignerCanvas.tsx`

This is the biggest task. It's split into multiple steps.

**Step 1: Import the new pieces**

At the top of `DesignerCanvas.tsx`, extend the existing `kitchen-engine` imports:

```ts
import {
  // ... existing imports
  type Island,
  PIXELS_PER_CM,
  wallAngleRad,
  wallPerpendicular,
  projectPointOnLine,
  signedPerpendicularDistance,
  computeRail,
} from "@/lib/kitchen-engine";
```

And add new component imports:

```ts
import { IslandInputOverlay } from "./IslandInputOverlay";
```

**Step 2: Subscribe to the new store fields**

In the component body (near the existing Zustand selectors), add:

```ts
const islands = useCanvasStore((s) => s.islands);
const islandDrawingState = useCanvasStore((s) => s.islandDrawingState);
const setIslandPhase = useCanvasStore((s) => s.setIslandPhase);
const addIsland = useCanvasStore((s) => s.addIsland);
const cancelIslandDraw = useCanvasStore((s) => s.cancelIslandDraw);
const activeLayerId = useCanvasStore((s) => s.activeLayerId);
```

Also track the current cursor position in canvas-stage coordinates:

```ts
const [cursorWorld, setCursorWorld] = useState<{ x: number; y: number } | null>(null);
```

**Step 3: Wire cursor tracking to the Stage onMouseMove**

Find the existing `onMouseMove` handler on the top-level `<Stage>` (search for `onMouseMove={`). Add at the top of the handler:

```ts
const pos = stage.getPointerPosition();
if (pos) {
  // Transform from screen to world coordinates if canvas is panned/zoomed
  const transform = stage.getAbsoluteTransform().copy().invert();
  const world = transform.point(pos);
  setCursorWorld(world);
}
```

If `stage` is not already destructured from `e.target.getStage()`, add it.

**Step 4: Add the island click handler**

Add a new `handleIslandClick` function inside the component, before the existing `onStageClick` handler:

```ts
const handleIslandClick = useCallback((worldPoint: { x: number; y: number }) => {
  const state = useCanvasStore.getState();
  const phase = state.islandDrawingState;
  const walls = drawingState.walls;

  switch (phase.phase) {
    case "pickingWall": {
      // Find a wall within click tolerance of the cursor
      const tolerance = 10; // px
      const hitWall = walls.find((w) => {
        const projected = projectPointOnLine(worldPoint, w.start, w.end);
        const dx = projected.x - worldPoint.x;
        const dy = projected.y - worldPoint.y;
        return Math.sqrt(dx * dx + dy * dy) <= tolerance;
      });
      if (!hitWall) return;
      setIslandPhase({ phase: "typingOffset", referenceWallId: hitWall.id });
      return;
    }
    case "pickingCorner1": {
      const wall = walls.find((w) => w.id === phase.referenceWallId);
      if (!wall) return;
      const rail = computeRail(wall, phase.offsetFromWallCm, phase.depthSide);
      const projected = projectPointOnLine(worldPoint, rail.start, rail.end);
      setIslandPhase({
        phase: "draggingLength",
        referenceWallId: phase.referenceWallId,
        offsetFromWallCm: phase.offsetFromWallCm,
        depthSide: phase.depthSide,
        anchor: projected,
      });
      return;
    }
    case "draggingLength": {
      const wall = walls.find((w) => w.id === phase.referenceWallId);
      if (!wall) return;
      const rail = computeRail(wall, phase.offsetFromWallCm, phase.depthSide);
      const projected = projectPointOnLine(worldPoint, rail.start, rail.end);
      const dx = projected.x - phase.anchor.x;
      const dy = projected.y - phase.anchor.y;
      const lengthPx = Math.sqrt(dx * dx + dy * dy);
      const lengthCm = lengthPx / PIXELS_PER_CM;
      if (lengthCm < 1) return; // ignore tiny drags
      setIslandPhase({
        phase: "draggingDepth",
        referenceWallId: phase.referenceWallId,
        offsetFromWallCm: phase.offsetFromWallCm,
        depthSide: phase.depthSide,
        anchor: phase.anchor,
        lengthCm,
      });
      return;
    }
    case "draggingDepth": {
      const wall = walls.find((w) => w.id === phase.referenceWallId);
      if (!wall || !activeLayerId) return;
      // Depth = perpendicular distance from cursor to the rail line
      const rail = computeRail(wall, phase.offsetFromWallCm, phase.depthSide);
      const depthPx = Math.abs(signedPerpendicularDistance(worldPoint, rail.start, rail.end));
      const depthCm = depthPx / PIXELS_PER_CM;
      if (depthCm < 1) return;
      const rotationRad = wallAngleRad(wall);
      const island: Island = {
        id: `island_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        layerId: activeLayerId,
        referenceWallId: phase.referenceWallId,
        offsetFromWallCm: phase.offsetFromWallCm,
        depthSide: phase.depthSide,
        anchorPoint: phase.anchor,
        lengthCm: phase.lengthCm,
        depthCm,
        rotationRad,
        heightCm: 77, // default
      };
      addIsland(island);
      setIslandPhase({ phase: "idle" });
      return;
    }
    default:
      return;
  }
}, [drawingState.walls, setIslandPhase, addIsland, activeLayerId]);
```

**Step 5: Route Stage click through handleIslandClick**

Find the existing `onStageClick` handler (search for `onStageClick` or the Stage's `onClick={`). At the very top, add:

```ts
// Island drawing takes priority over other tools
const islandPhase = useCanvasStore.getState().islandDrawingState;
if (islandPhase.phase !== "idle") {
  const pos = e.target.getStage()?.getPointerPosition();
  if (!pos) return;
  const transform = e.target.getStage()!.getAbsoluteTransform().copy().invert();
  const world = transform.point(pos);
  handleIslandClick(world);
  return;
}
```

**Step 6: Add an Escape handler**

In the existing `useEffect` that binds `handleKeyDown` (around line 2257), add a new branch at the top of the handler:

```ts
// Island drawing Escape: step back one phase
const iPhase = useCanvasStore.getState().islandDrawingState;
if (e.key === "Escape" && iPhase.phase !== "idle") {
  switch (iPhase.phase) {
    case "pickingWall":
      cancelIslandDraw();
      break;
    case "typingOffset":
      setIslandPhase({ phase: "pickingWall" });
      break;
    case "pickingCorner1":
      setIslandPhase({ phase: "typingOffset", referenceWallId: iPhase.referenceWallId });
      break;
    case "draggingLength":
      setIslandPhase({
        phase: "pickingCorner1",
        referenceWallId: iPhase.referenceWallId,
        offsetFromWallCm: iPhase.offsetFromWallCm,
        depthSide: iPhase.depthSide,
      });
      break;
    case "draggingDepth":
      setIslandPhase({
        phase: "draggingLength",
        referenceWallId: iPhase.referenceWallId,
        offsetFromWallCm: iPhase.offsetFromWallCm,
        depthSide: iPhase.depthSide,
        anchor: iPhase.anchor,
      });
      break;
  }
  return;
}
```

**Step 7: Add the `<IslandLayer>` Konva group for committed islands**

Inside the main `<Layer>` of the canvas, add this JSX (place it near the other cabinet-rendering groups):

```tsx
{/* Committed islands */}
{islands.map((island) => {
  const wall = drawingState.walls.find((w) => w.id === island.referenceWallId);
  if (!wall) return null;

  const lengthPx = island.lengthCm * PIXELS_PER_CM;
  const depthPx = island.depthCm * PIXELS_PER_CM;
  const rotationDeg = (island.rotationRad * 180) / Math.PI;

  // Compute position: anchor is one corner of the rectangle;
  // rotate around that corner so the rectangle extends along the rail direction.
  // depthSide determines which side of the rail the rectangle sits on.
  const offsetY = island.depthSide === "near" ? depthPx : 0;

  return (
    <Group key={island.id}>
      <Rect
        x={island.anchorPoint.x}
        y={island.anchorPoint.y}
        width={lengthPx}
        height={depthPx}
        offsetY={offsetY}
        rotation={rotationDeg}
        fill="#F59E0B"
        opacity={0.4}
        stroke="#F59E0B"
        strokeWidth={2}
        listening={true}
        onClick={() => {
          // Select: no-op for now; selection handled by LayerPanel
        }}
      />
      <Text
        x={island.anchorPoint.x + (lengthPx / 2) * Math.cos(island.rotationRad)}
        y={island.anchorPoint.y + (lengthPx / 2) * Math.sin(island.rotationRad)}
        text={`Island\n${island.lengthCm.toFixed(0)} × ${island.depthCm.toFixed(0)} cm`}
        fontSize={10}
        fill="#78350F"
        listening={false}
      />
    </Group>
  );
})}
```

Import `Group`, `Rect`, `Text` from `react-konva` at the top if not already imported.

**Step 8: Add the `<IslandDrawingOverlay>` Konva group**

Just after the `<IslandLayer>` JSX, add the in-progress drawing overlay:

```tsx
{/* In-progress island drawing overlay */}
{islandDrawingState.phase !== "idle" && (() => {
  const phase = islandDrawingState;
  const refWallId =
    phase.phase === "pickingWall" ? null :
    phase.phase === "idle" ? null :
    (phase as any).referenceWallId as string;
  const refWall = refWallId ? drawingState.walls.find((w) => w.id === refWallId) : null;

  return (
    <Group listening={false}>
      {/* Highlight the reference wall */}
      {refWall && (
        <Line
          points={[refWall.start.x, refWall.start.y, refWall.end.x, refWall.end.y]}
          stroke="#F59E0B"
          strokeWidth={6}
          opacity={0.5}
        />
      )}

      {/* Rail line for pickingCorner1 / draggingLength / draggingDepth */}
      {refWall && phase.phase !== "pickingWall" && phase.phase !== "typingOffset" && (() => {
        const p = phase as { offsetFromWallCm: number; depthSide: "near" | "far" };
        const rail = computeRail(refWall, p.offsetFromWallCm, p.depthSide);
        return (
          <Line
            points={[rail.start.x, rail.start.y, rail.end.x, rail.end.y]}
            stroke="#F59E0B"
            strokeWidth={1.5}
            dash={[6, 4]}
            opacity={0.7}
          />
        );
      })()}

      {/* Rubber-band rectangle during draggingLength / draggingDepth */}
      {(phase.phase === "draggingLength" || phase.phase === "draggingDepth") && refWall && cursorWorld && (() => {
        const p = phase as any;
        const rail = computeRail(refWall, p.offsetFromWallCm, p.depthSide);
        const currentOnRail = projectPointOnLine(cursorWorld, rail.start, rail.end);
        const lengthPx = phase.phase === "draggingLength"
          ? Math.sqrt(
              Math.pow(currentOnRail.x - p.anchor.x, 2) +
              Math.pow(currentOnRail.y - p.anchor.y, 2)
            )
          : p.lengthCm * PIXELS_PER_CM;
        const depthPx = phase.phase === "draggingDepth"
          ? Math.abs(signedPerpendicularDistance(cursorWorld, rail.start, rail.end))
          : 0;

        const rotationDeg = (wallAngleRad(refWall) * 180) / Math.PI;

        return (
          <Rect
            x={p.anchor.x}
            y={p.anchor.y}
            width={lengthPx}
            height={depthPx}
            offsetY={p.depthSide === "near" ? depthPx : 0}
            rotation={rotationDeg}
            fill="#F59E0B"
            opacity={0.2}
            stroke="#F59E0B"
            strokeWidth={1.5}
            dash={[4, 4]}
          />
        );
      })()}
    </Group>
  );
})()}
```

Import `Line` from `react-konva` if not already.

**Step 9: Render the typed-input DOM overlay**

The overlay must be rendered in a DOM layer, not inside Konva. The easiest place is a sibling to the `<Stage>` wrapper. Find the JSX hierarchy where the Stage is rendered. Add a wrapper `<div className="relative">` if not already, then render the overlay as a sibling:

```tsx
{islandDrawingState.phase === "typingOffset" && cursorWorld && (
  <IslandInputOverlay
    label="Offset cm"
    cursorPx={worldToScreen(cursorWorld)}
    onCommit={(offset) => {
      // Determine depthSide from wall direction + last known cursor side
      // For now default to "far" (away from wall); rep can Escape to redo
      setIslandPhase({
        phase: "pickingCorner1",
        referenceWallId: (islandDrawingState as any).referenceWallId,
        offsetFromWallCm: offset,
        depthSide: "far",
      });
    }}
    onCancel={() => setIslandPhase({ phase: "pickingWall" })}
  />
)}
```

`worldToScreen` is the inverse of the world transform:

```ts
const worldToScreen = (p: { x: number; y: number }) => {
  const stage = stageRef.current;
  if (!stage) return p;
  const absTrans = stage.getAbsoluteTransform();
  return absTrans.point(p);
};
```

Assume `stageRef` exists; if not, add a `useRef<Konva.Stage>(null)` and pass to `<Stage ref={stageRef}>`.

**Step 10: Build and verify**

Run: `npx tsc --noEmit 2>&1 | tail -30`

Expected: zero errors. If TypeScript complains about `(phase as any)` casts, those are intentional shortcuts to access fields only present on specific phase variants — leave them or use proper discriminated unions.

**Step 11: Deploy and smoke test**

Commit, push, wait for Railway deploy. Then manually test:

1. Open a project with walls drawn
2. Click "New Layer → Island" — a new layer appears and `islandDrawingState.phase` becomes `pickingWall`
3. Hover over a wall — visual feedback? (The wall isn't highlighted yet because highlight only shows post-click. Still OK.)
4. Click on a wall → reference wall highlights, offset input appears at cursor
5. Type `80`, press Enter → rail appears 80 cm from the wall
6. Click somewhere on the rail → first corner committed
7. Move mouse along the rail → rubber band grows
8. Click → length committed
9. Move mouse perpendicular → rubber band grows in depth
10. Click → island committed, drawn as a filled rectangle on canvas

If any step misbehaves, note the phase and error, revert, and retry. This is the trickiest task in the plan — expect minor breakage and iterate.

**Step 12: Commit**

```bash
git add client/src/components/kitchen/DesignerCanvas.tsx
git commit -m "feat(island): new 4-click reference-wall drawing flow

- Click 1: pick wall → highlights and locks as reference
- Typed offset input → rail appears parallel to wall
- Click 2: first corner of island on rail
- Click 3: length committed
- Click 4: depth committed → addIsland() called
- Escape at any phase walks back one step
- Renders committed islands as rotated Konva Rects
- Renders active drawing overlays: wall highlight, rail, rubber band

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: IslandLayerCard — Bidirectional Editing in LayerPanel

**Files:**
- Modify: `client/src/components/kitchen/LayerPanel.tsx`

**Step 1: Subscribe to islands in LayerPanel**

Near the existing store subscriptions in the `LayerPanel` component:

```ts
const islands = useCanvasStore((s) => s.islands);
const updateIsland = useCanvasStore((s) => s.updateIsland);
const removeIsland = useCanvasStore((s) => s.removeIsland);
```

**Step 2: Specialize the LayerCard for island layers**

Find `LayerCard` component. At the top, detect island:

```ts
const boundIsland = layer.type === "island"
  ? islands.find((i) => i.layerId === layer.id) ?? null
  : null;
```

**Step 3: When island is bound, override the layer card body**

Inside the card's active (expanded) render, replace the depth/height inputs for island layers with a 4-field form. Pseudo-structure:

```tsx
{layer.type === "island" && boundIsland && (
  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
    <span className="text-muted-foreground self-center">Length (cm)</span>
    <Input
      type="number"
      value={boundIsland.lengthCm}
      className="h-6 text-xs text-right"
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > 0) updateIsland(boundIsland.id, { lengthCm: v });
      }}
      onClick={(e) => e.stopPropagation()}
    />

    <span className="text-muted-foreground self-center">Depth (cm)</span>
    <Input
      type="number"
      value={boundIsland.depthCm}
      className="h-6 text-xs text-right"
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > 0 && v <= 110) updateIsland(boundIsland.id, { depthCm: v });
      }}
      onClick={(e) => e.stopPropagation()}
    />

    <span className="text-muted-foreground self-center">Height (cm)</span>
    <Input
      type="number"
      value={boundIsland.heightCm}
      className="h-6 text-xs text-right"
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > 0) updateIsland(boundIsland.id, { heightCm: v });
      }}
      onClick={(e) => e.stopPropagation()}
    />

    <span className="text-muted-foreground self-center">Offset (cm)</span>
    <Input
      type="number"
      value={boundIsland.offsetFromWallCm}
      className="h-6 text-xs text-right"
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (Number.isFinite(v) && v > 0) updateIsland(boundIsland.id, { offsetFromWallCm: v });
      }}
      onClick={(e) => e.stopPropagation()}
    />

    <span className="text-muted-foreground self-center">Finish</span>
    <Select
      value={layer.finishId != null ? String(layer.finishId) : ""}
      onValueChange={(v) => onUpdate({ finishId: parseInt(v) })}
    >
      <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
        <SelectValue placeholder="Select finish" />
      </SelectTrigger>
      <SelectContent>
        {finishes.map((f) => (
          <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}

{layer.type === "island" && !boundIsland && (
  <p className="text-[10px] text-muted-foreground">
    Click a wall on the canvas to place this island.
  </p>
)}
```

This block should REPLACE the default grid only when `layer.type === "island"`. Other layer types (base, wall, tall, end_panel, filler, drawer) keep their existing rendering.

**Step 4: Pricing input for island**

Find where `calculateLayerPrice` is called. For island layers, feed it the bound island's dimensions:

```ts
const pricingLayerInput = (layer.type === "island" && boundIsland)
  ? { ...layer, depth: boundIsland.depthCm, height: boundIsland.heightCm }
  : layer;

const pricingLengthM = (layer.type === "island" && boundIsland)
  ? boundIsland.lengthCm / 100
  : lengthM;

const result = settings
  ? calculateLayerPrice({
      layer: pricingLayerInput as unknown as PricingLayer,
      lengthM: pricingLengthM,
      settings,
      dreamHomePrices: prices,
      tallHeights: tallRows,
    })
  : { subtotalAED: 0, breakdown: "Loading...", error: undefined as string | undefined };
```

**Step 5: Delete × removes bound island too**

Find the delete handler (the `<Trash2>` button's onClick). For island layers, also call `removeIsland(boundIsland.id)` before `onDelete()`:

```ts
onClick={(e) => {
  e.stopPropagation();
  if (layer.type === "island" && boundIsland) {
    removeIsland(boundIsland.id);
  }
  onDelete();
}}
```

Do this in both the expanded and collapsed card variants.

**Step 6: Build and verify**

Run: `npx tsc --noEmit 2>&1 | tail -20`

Expected: zero errors.

**Step 7: Commit**

```bash
git add client/src/components/kitchen/LayerPanel.tsx
git commit -m "feat(island): 4-field bidirectional LayerPanel card

Island layers get Length/Depth/Height/Offset editable inputs bound to
the Island record via layerId. Editing any field updates the Island
in Zustand, which triggers a re-render of the Konva rectangle. Delete
button removes both the layer and its bound island.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Page wiring — auto-start draw + no-walls guard

**Files:**
- Modify: `client/src/pages/project-detail.tsx` (or wherever layers are added)

**Step 1: Guard "New Island layer" against missing walls**

Find where `addLayer` is called for island type — this happens in `LayerPanel.tsx` inside `handleAddLayer`. Actually the guard belongs there, not project-detail. Modify `client/src/components/kitchen/LayerPanel.tsx`:

In `handleAddLayer`, at the top for island type:

```ts
const handleAddLayer = (type: LayerType) => {
  if (type === "island") {
    const state = useCanvasStore.getState();
    if (state.drawingState.walls.length === 0) {
      toast({
        title: "Select wall first",
        description: "Draw at least one wall before placing an island.",
        variant: "destructive",
      });
      return;
    }
  }
  // ... existing code
```

**Step 2: Auto-start the draw flow after adding an island layer**

Still in `handleAddLayer`, after `addLayer(newLayer)` call:

```ts
addLayer(newLayer);
if (type === "island") {
  useCanvasStore.getState().startIslandDraw();
}
```

**Step 3: Add `useToast` import if missing**

If `LayerPanel.tsx` doesn't already import `useToast`, add:

```ts
import { useToast } from "@/hooks/use-toast";
```

And inside the component:

```ts
const { toast } = useToast();
```

**Step 4: Build and verify**

Run: `npx tsc --noEmit 2>&1 | tail -10`
Run: `npm run build 2>&1 | tail -10`

Expected: both succeed.

**Step 5: Commit**

```bash
git add client/src/components/kitchen/LayerPanel.tsx
git commit -m "feat(island): guard against missing walls + auto-start draw

Adding a new Island layer checks walls.length and shows a toast if
there are no walls. On success, immediately transitions
islandDrawingState to pickingWall so the rep can click a wall without
extra activation steps.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Deploy + end-to-end smoke test

**Step 1: Push all commits**

```bash
git push origin main 2>&1
```

**Step 2: Wait ~2-3 minutes for Railway deploy**

Check the Railway dashboard for the NEVRAKitchen service. Latest deployment should show `Deployed`.

**Step 3: Smoke test checklist**

On the live URL:

- [ ] Login → open or create a project with walls
- [ ] LayerPanel → "New Layer → Island" while no walls → toast "Select wall first" (if walls exist, skip this)
- [ ] Add walls if needed
- [ ] LayerPanel → "New Layer → Island" → new layer card appears, `pickingWall` phase active
- [ ] Click a wall → wall highlights orange, offset input appears at cursor
- [ ] Type `80`, Enter → dashed rail appears 80 cm from the wall
- [ ] Click on rail → first corner dot or live rubber band starts
- [ ] Move mouse along rail → length preview grows along wall direction
- [ ] Click → length committed
- [ ] Move mouse away from rail → depth preview grows perpendicular
- [ ] Click → island saved as a filled rectangle
- [ ] LayerPanel card now shows Length/Depth/Height/Offset fields with the drawn values
- [ ] Edit Length in LayerPanel → rectangle resizes on canvas in real time
- [ ] Edit Depth → rectangle resizes perpendicular
- [ ] Edit Offset → rectangle slides away from or toward the wall
- [ ] Subtotal updates correctly per `calcIsland` rules (1 row if <75 cm depth, 2 rows otherwise)
- [ ] Delete × on the island layer → layer and rectangle both disappear
- [ ] Press Escape during drawing at any phase → walks back one step
- [ ] Save project → reload → islands still there

**Step 4: If any smoke test fails**

Don't patch on top of a broken state. Revert the failing task's commit, investigate, and redo.

---

## Follow-ups (NOT in this plan)

- **PDF export:** `client/src/lib/export.ts` currently reads only from `cabinets`. It does NOT read from `islands`. The PDF quote will be missing island line items until we add a follow-up pass. The rep's on-screen subtotal is correct. Flag as TODO-export.
- **Drag islands on canvas:** explicitly out of scope (non-goal). If needed later, add a drag handler on `<IslandLayer>`'s `<Rect>` that updates `anchorPoint`.
- **Global axis-lock:** separate plan (`2026-04-15-axis-lock.md`) to be written after this plan ships cleanly.
- **Legacy `type: "island"` cabinet records:** old saved projects still render these via the Cabinet path. They won't be editable via the new LayerPanel card. Rep must delete and redraw.
- **Rail `depthSide` auto-detection:** currently hardcoded to `"far"` in Task 5 Step 9. A future tweak would detect which side of the wall the cursor was on at Click 1 and use that side. Low priority.

---

## Risk register

- **R1 (Medium):** `DesignerCanvas.tsx` is ~4500 lines with a lot of intertwined state. Gating the legacy flow + adding the new one is the biggest risk area. **Mitigation:** incremental steps in Task 3 and Task 5, each with a build check. If something breaks, revert just that step.
- **R2 (Low-Medium):** Konva rotation + `offsetY` for `depthSide === "near"` — I'm reasonably confident but the visual result on diagonal walls might need pixel-tweaking. **Mitigation:** Task 8 smoke test includes a diagonal wall case.
- **R3 (Low):** Store history pushState — if I forget to include `islands` in a pushState call, undo/redo will drop islands. **Mitigation:** Task 2 audit of every pushState site.
- **R4 (Low):** `addLayer` guard is implemented in LayerPanel, but `project-detail.tsx` might add layers via a different path. **Mitigation:** grep for `addLayer(` usages before shipping Task 7.

---

## Exit criteria

- ✅ All 8 tasks committed and pushed
- ✅ `npm run build` succeeds on `main`
- ✅ Smoke test checklist passes end-to-end
- ✅ Legacy islands still render (backwards-compatible)
- ✅ No regression on walls, base, wall_cabinet, tall drawing
