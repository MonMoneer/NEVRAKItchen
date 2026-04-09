# Island Cabinet 4-Phase CAD-Walk — Design Spec

**Date:** 2026-04-04
**Status:** Approved for implementation
**Area:** `client/src/components/kitchen/DesignerCanvas.tsx`

---

## 1. Problem

The current Island Cabinet tool is a 2-phase flow (click start → drag length axis → extrude depth with Q-flip). This lets users place islands anywhere in the room, but provides **no precise positioning** relative to the room geometry. Users who want the island a specific distance from a wall have to eyeball it.

## 2. Goal

Let users place an island cabinet **precisely offset from any wall anchor** (wall corner, door edge, window edge, cabinet edge) by "walking" from the anchor into the room: along the wall, then perpendicular into the room, then defining the cabinet's length and depth.

## 3. User flow (4 phases after anchor pick)

| Phase | Name | User action | Constraint | Numeric input |
|---|---|---|---|---|
| 0 | **Pick Anchor** | Hover wall → anchor dots show (corner/door edge/window edge/cabinet edge). Click one. | Must click a visible anchor marker. | — |
| 1 | **Wall Length (WL)** | Move mouse along wall OR type cm. | Auto-constrained to wall axis (1D). Direction along wall chosen by mouse side. Clamped to wall length (no overshoot past wall ends). | cm |
| 2 | **Deep Length (DL)** | Move mouse (any direction) OR type cm. Shift snaps to 0°/90°/180°/270° **relative to wall angle**. | Free 2D. | cm |
| 3 | **Cabinet Length (CL)** | Move mouse (any direction) OR type cm. Shift snaps to 0°/90°/180°/270° relative to wall angle. | Free 2D. | cm |
| 4 | **Cabinet Depth (CD)** | Move mouse perpendicular to CL. Mouse position picks side of CL. Q-key flips side. Type magnitude. | 1D along perpendicular of CL. Side chosen by mouse or Q. | cm |

**Enter** on phase 4 commits the island.

## 4. Geometry & storage

The committed island is stored as the existing `Cabinet` (shared/schema, kitchen-engine types):

```ts
{
  id: string,
  type: 'island',
  start: Point,          // the "entry corner" = end of Deep Length
  end: Point,            // start + CL_vector (opposite corner along CL direction)
  depth: number,         // CD in cm
  depthFlipped: boolean, // which side of CL axis the depth extrudes (computed from CD phase)
  length: number,        // CL in cm
  wallId: undefined,     // islands are NOT wall-anchored
}
```

Intermediate values (anchor, WL, DL, WL_angle) are **discarded on commit**. The rectangle alone captures everything needed for render, select, PDF, and clearance checks. No schema changes.

### Coordinate derivation from walk path

Given anchor point `A`, wall angle `θ_w`, WL, DL, DL_angle, CL, CL_angle, CD, CD_flipped:

```
turn1 = A + WL · WL_direction · (cos θ_w, sin θ_w)     // along wall (WL_direction ∈ {+1, -1})
turn2 = turn1 + DL · (cos DL_angle, sin DL_angle)      // into room → this is `cabinet.start`
turn3 = turn2 + CL · (cos CL_angle, sin CL_angle)      // → this is `cabinet.end`
```

`depthFlipped` is derived from CD_flipped boolean in the same frame `renderCabinetBody` uses (cabinet.start → cabinet.end angle), matching the Bug 1 fix we just applied to base/wall/tall cabinets.

## 5. State model

```ts
type IslandPhase =
  | 'pickingAnchor'
  | 'settingWL'
  | 'settingDL'
  | 'settingCL'
  | 'settingCD';

interface IslandPlacementV2 {
  phase: IslandPhase;

  // Phase 0 result
  anchorPoint: Point | null;
  anchorWall: Wall | null;
  wallAngle: number;   // radians — wall's angleBetween(start,end)

  // Phase 1 result
  WL_cm: number;       // 0 until set
  WL_direction: 1 | -1;  // +1 = along wall start→end, -1 = reversed

  // Phase 2 result
  DL_cm: number;
  DL_angle: number;    // radians, absolute world angle

  // Phase 3 result
  CL_cm: number;
  CL_angle: number;    // radians, absolute world angle

  // Phase 4 result
  CD_cm: number;
  CD_flipped: boolean; // which side of CL
}
```

Replaces existing `IslandPlacementState` interface.

## 6. Dimension panel (bottom of canvas)

Persistent 4-field form shown during any placement phase. Replaces existing `IslandDimensionPanel`.

```
┌─ Island Cabinet ──────────────────────────────────────┐
│  Wall len  [___] cm     Deep len  [___] cm            │
│  Cab len   [___] cm     Cab depth [___] cm  [Cancel]  │
└───────────────────────────────────────────────────────┘
```

### Field behavior
- Current phase's field is visually highlighted (amber border).
- **Tab / Enter** → commit current value, advance to next phase.
- **Shift+Tab** → previous phase (clears current value).
- **Click any field** → jump to that phase IF all prior fields are filled; if not, ignored with subtle shake animation.
- **Escape** in any field → step back one phase.
- Editing an already-filled field → live-updates the ghost (e.g. shorten WL → DL/CL/CD segments shift along with it).
- Placeholder text shows live mouse-derived value until user types.

## 7. Live ghost rendering

At every phase, ghost shows **all segments entered so far + the active one being drawn**:

| Element | Color | Style |
|---|---|---|
| Anchor dot | `#A855F7` (purple) | 5px filled circle |
| WL segment | `#6B7280` (gray) | dashed line `[6,4]` |
| DL segment | `#6B7280` (gray) | dashed line `[6,4]` |
| CL segment | `#F59E0B` (amber) | dashed line `[6,4]` |
| CD rectangle | fill `rgba(245,158,11,0.2)`, stroke `#A855F7` | dashed stroke `[6,3]` |
| "IC" label inside CD | `#7C3AED` (purple-700) | fontSize 12/scale |
| Turn-point dots | gray/amber matching segment | 4px open circles |
| Segment length labels | colored pill matching segment, white text | existing pill style |

Shift-hold indicator: when Shift is held during phase 2/3/4, draw a faint ortho cross-hair anchored at the current turn-point, aligned to wall angle (so user sees the 4 snap directions).

## 8. Shift-ortho snap behavior

**Phase 1 (WL)** — movement already 1D along wall axis. Shift is a no-op. Mouse position along wall determines direction (`WL_direction = sign of projected mouse distance`) and WL magnitude.

**Phases 2 (DL) and 3 (CL)** — when Shift is held, snap to wall-relative 0/90/180/270:

```ts
const candidates = [0, 90, 180, 270].map(d => θ_w + d * π/180);
// pick the candidate closest to mouse-derived angle
const snapped = candidates.reduce((best, c) =>
  angleDiff(c, rawMouseAngle) < angleDiff(best, rawMouseAngle) ? c : best
);
```

Segment length = magnitude of mouse distance projected onto the snapped axis.

**Phase 4 (CD)** — movement is already 1D along the axis perpendicular to CL (not wall). Shift is a no-op. Mouse perpendicular distance determines magnitude; the sign (mouse side relative to CL axis) determines `CD_flipped`. Q-key toggles `CD_flipped` explicitly.

## 9. Step-back & cancel

| Input | Action |
|---|---|
| Escape (phase ≥ 1) | Back one phase. Current phase's value cleared. |
| Escape on `pickingAnchor` | Cancel tool entirely. |
| Backspace in empty input | Same as Escape. |
| Click "Cancel" button | Full reset. |
| Switching active tool in sidebar | Full reset. |

## 10. Validation

### During placement (live ghost)
- **WL**: clamped to `[-|anchor-to-wallStart|, +|anchor-to-wallEnd|]`. User can't walk past wall ends.
- **DL, CL, CD**: must be > 0. If user types 0 or negative, reject with red field outline.
- **Overlap check** (phase 4 only): run `checkClearanceViolation(cabinet.start, cabinet.end, 'island', openings, walls)` + `findOverlappingCabinets(start, end, allCabinets, ['island','base','tall'])`. If any overlap, ghost turns red and Enter is disabled (same UX as existing ghost-validation for base/wall/tall).

### On commit
- Same overlap check repeated (defense against race conditions).
- If pass → `onAddCabinet(cabinet)`, reset placement state.

## 11. Replaces existing

| Before | After |
|---|---|
| `IslandPlacementState` (2-phase) | `IslandPlacementV2` (4-phase + anchor) |
| `IslandDimensionPanel` (single input) | 4-field persistent panel |
| `renderIslandPlacement` (2-phase ghost) | rewritten for 4-phase ghost |
| Q-key: flip extrusion side during `settingDepth` | Q-key: flip CD side during `settingCD` phase (same semantics, renamed phase) |
| `placeIsland(ip)` | updated to derive start/end/depthFlipped from full walk path |

Downstream code — `renderCabinetBody`, select/move handles, PDF export, clearance checks, cabinet overlap detection — **unchanged** because the committed `Cabinet` object shape is identical.

## 12. Files to change

| File | Change |
|---|---|
| `client/src/components/kitchen/DesignerCanvas.tsx` | State type, click handler for 4 phases, `renderIslandPlacement` rewrite, `IslandDimensionPanel` rewrite, Shift-ortho helper, step-back handler |
| `client/src/stores/useCanvasStore.ts` | No change (same `Cabinet` output shape) |
| `client/src/lib/kitchen-engine.ts` | **No change** — geometry engine untouched |
| `shared/schema.ts` | No change |

## 13. Testing checklist

- [ ] Click wall corner anchor → WL along wall in both directions
- [ ] Click door/window/cabinet edge anchor → same
- [ ] Shift in phase 2 snaps perpendicular to wall (not world axes)
- [ ] Diagonal wall (30° rotated) → island aligns to that wall
- [ ] Type WL=0, DL=0 → equivalent to "free center placement" (island at anchor)
- [ ] Escape on phase 3 returns to phase 2 with value cleared
- [ ] Click Cab Len field after filling WL+DL → jumps to phase 3
- [ ] Click Cab Len field with DL empty → ignored + shake
- [ ] Q-key in phase 4 flips extrusion side
- [ ] Overlap with base cabinet → red ghost, Enter disabled
- [ ] Enter on phase 4 with valid placement → island committed, tool resets
- [ ] Click Island tool in sidebar mid-flow on another canvas element → placement state resets
- [ ] Committed island renders identically to legacy 2-phase islands (pixel-compare)
- [ ] Committed island: select, move, delete all work
- [ ] Committed island exports correctly in PDF

## 14. Out of scope

- Editing committed islands via walk-path (currently edited via handles; unchanged).
- Migration of existing committed islands — same Cabinet shape, no migration needed.
- Multi-island placement (user re-invokes the tool for each).
- Rotation handles on committed island (existing select-mode behavior retained).

## 15. Risks

- **CL can point back THROUGH the wall the user started from.** Validated by the overlap check on phase 4. User sees red ghost.
- **WL=0 edge case**: when anchor is a wall corner and WL=0, turn1 equals anchor. Handled naturally — DL starts from anchor itself.
- **Dimension panel focus vs canvas keyboard events**: Q-key flip and Escape step-back must work both when a number field is focused AND when canvas has focus. Panel handlers + global key listener both respond.
