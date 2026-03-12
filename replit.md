# NIVRA Kitchen - Interactive Kitchen Layout Designer

## Overview
A professional web-based interactive kitchen layout designer with CAD-like precision. Users can draw walls and place cabinets (Base/Wall/Tall) with magnetic edge/corner snapping, get live pricing estimates, and export branded PDF reports.

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Shadcn UI
- **Backend**: Express.js + PostgreSQL + Drizzle ORM
- **Canvas**: Konva.js (v9) + react-konva (v18) for interactive CAD canvas
- **Export**: jsPDF + pdf-lib for branded PDF generation with NIVRA letterhead; layout captured via Konva canvas screenshot (3x pixel ratio)

## Startup Fix (Critical)
Replit's workflow manager monitors `waitForPort: 5000` and requires the TCP port to be open within ~30 seconds. Vite's dependency optimization (`esbuild`) takes 15–25 seconds on first run with a cold cache.

**Fix applied in `server/index.ts`:**
1. `httpServer.listen(5000)` is called **before** `setupVite()` — port opens immediately, satisfying Replit's health check before Vite finishes setting up.
2. `optimizeDeps.noDiscovery: true` + explicit `include` list prevents Vite from crawling source files and calling `server.restart()` after optimization, which would drop the HMR WebSocket.
3. A `replit-startup-guard` Vite plugin suppresses non-forced `server.restart()` calls as an additional safety net.

**DO NOT** move `httpServer.listen` back below `setupVite()` — this will cause the workflow to time out on cold-cache restarts.

## Key Features
1. **Drawing Tools**: Wall, Base Cabinet (60cm depth), Wall Cabinet (35cm depth), Tall Cabinet (60cm depth), Door, Window — All cabinets and openings use the Wall Placement Tool (click wall → set offset → set length). Base/Wall/Tall cabinet anchors snap only to wall corners, wall endpoints, and existing cabinet/opening edges (not arbitrary mid-wall positions).
2. **Magnetic Snapping**: Edge/corner-only snap with visual indicators. Cabinet start points are restricted to valid anchor points (corners and edges).
3. **Dimension Input**: Wall placement uses a fixed bottom panel (FixedDimensionPanel) with Start offset + Length fields; free-form drawing uses FloatingDimensionInput
4. **Auto-Split**: Base AND wall cabinets auto-split when tall cabinets are placed using 1D interval projection with parallelism and lateral distance checks; shows two cut-line preview during drawing and "REMOVE" indicator for fully consumed cabinets
5. **Live Pricing**: Per-meter pricing with 4 finishing options (Standard, Premium, High Gloss, Luxury Wood) — doors/windows excluded from pricing
6. **Admin Panel**: Configure pricing, finishing options, branding, snap settings
7. **PDF Export**: Branded quotation with NIVRA letterhead background, project/client info, quote number, top-view layout drawing (including openings), and pricing table
8. **Projects System**: Save/load projects with client name/phone, search by phone number
9. **Depth Flip**: Auto-detect room interior side; press F or click flip button to toggle cabinet depth direction
10. **Professional Rendering**: Soft-fill cabinets with hatch textures, rounded corners, centered type labels (BC/WC/TC)
11. **Corner Support**: Automatic corner joints for walls and L-shaped corner cabinets when segments meet at perpendicular wall corners
12. **Door & Window Openings**: Two-step wall-constrained placement (same as Tall Cabinet), with clearance zones that block cabinet placement (doors block all cabinets within 60cm, windows block wall cabinets within 40cm). Rendered as colored wall-line segments (not separate rectangles) with always-visible start/end point markers. Opening endpoints are snap targets so cabinets can align to door/window edges. Cabinets can terminate flush at door edges but cannot overlap the opening span or clearance zone (1.5px epsilon inset for edge tolerance).

## Data Models
- `adminSettings`: Company branding + snap configuration
- `pricingConfig`: Price per meter per cabinet type (AED)
- `finishingOptions`: 4 finishing options with multipliers
- `savedProjects`: JSON-stored project designs with clientName, clientPhone, selectedFinishing

## File Structure
```
client/src/
  pages/
    designer.tsx       - Main kitchen designer page
    admin.tsx          - Admin settings panel
  components/kitchen/
    DesignerCanvas.tsx - Konva canvas with drawing interactions
    Toolbar.tsx        - Left toolbar with tools/options/save/open
    PricingPanel.tsx   - Right panel with live pricing
    ProjectsDialog.tsx - Save/open/search projects dialog
    FloatingDimensionInput.tsx - Dimension input overlay
  lib/
    kitchen-engine.ts  - Core geometry, snapping, split logic, corner detection, CABINET_STYLES
    history.ts         - Undo/redo state management
    export.ts          - Branded PDF export with NIVRA letterhead (pdf-lib + jsPDF hybrid); layout section uses Konva canvas capture instead of manual jsPDF drawing
server/
  routes.ts           - API endpoints for admin/pricing/projects/search
  storage.ts          - DatabaseStorage with Drizzle ORM
  db.ts               - Database connection
shared/
  schema.ts           - Drizzle schema + Zod validation
```

## API Endpoints
- GET/PUT `/api/admin/settings` - Admin branding/snap settings
- GET/PUT `/api/pricing` - Pricing per cabinet type
- GET/PUT `/api/finishing-options` - Finishing option labels/multipliers
- GET/POST `/api/projects` - Saved project management
- GET/DELETE `/api/projects/:id` - Individual project management
- GET `/api/projects/search?phone=<phone>` - Search projects by phone number

## Wall-Constrained Placement (Two-Step CAD Workflow — Tall/Door/Window)
- **Step 1 — Select Wall & Offset**: Click near a wall to start. The wall highlights purple and a ruler with tick marks (10cm/50cm/100cm) appears along the wall. Move mouse along wall or type offset distance + Enter to set the element's start position. Magnetic snapping to wall endpoints, cabinet endpoints, and opening endpoints.
- **Step 2 — Set Length/Width**: Type or drag along the wall direction + Enter to place. Ghost preview shows: tall cabinet = depth rectangle, door/window = wall-thickness rectangle.
- **Escape**: Cancels at any step. Tool switch also cancels.
- Placement is wall-constrained (no free movement off the wall axis).
- Uses `WallPlacementState` state machine in `DesignerCanvas.tsx` with `tool` field (`"tall" | "door" | "window"`) and phases: idle → settingOffset → settingLength → idle
- Wall detection uses `findNearestWall()`, constraining uses `constrainToWall()`, offset calculation uses `pointAlongWall()`

## Opening Data Model
- `Opening` interface: `{ id, type: "door" | "window", start, end, length, wallId? }`
- Separate from `Cabinet` — no depth, no pricing, no depthFlipped
- `OPENING_STYLES`: door = warm orange (#FED7AA/#EA580C, label "DR"), window = cyan (#CFFAFE/#0891B2, label "WN")
- `CLEARANCE_DEPTHS`: door = 5cm, window = 5cm
- `computeClearanceZone()` returns 4-corner polygon extending perpendicular from wall
- `checkClearanceViolation()`: door zones block all cabinet types; window zones block only `wall_cabinet`
- Clearance zones render on canvas: red-tinted dashed for doors, yellow-tinted dashed for windows

## Canvas Interactions
- **Click**: Set start point for drawing (walls/base/wall cabinets use single-step, tall cabinets use two-step above)
- **Type number + Enter**: Confirm dimension
- **Escape**: Cancel drawing
- **Scroll wheel**: Zoom in/out
- **Middle-click drag**: Pan canvas
- **Ctrl+Z/Y**: Undo/Redo
- **Ctrl+S**: Save project
- **Ctrl+O**: Open project
- **F**: Flip cabinet depth direction (in select mode)
- **H**: Pan tool (grab cursor, click-drag to pan canvas)
- **V/W/B/U/T/R/N/D**: Tool shortcuts (select/wall/base/wall-cabinet/tall/door/window/delete)

## Color Coding / CABINET_STYLES & OPENING_STYLES
- Walls: Dark gray (#374151)
- Base Cabinets: Soft blue fill (#DBEAFE), blue border (#3B82F6), label "BC"
- Wall Cabinets: Light green fill (#D1FAE5), green border (#22C55E), label "WC"
- Tall Cabinets: Light purple fill (#EDE9FE), purple border (#A855F7), label "TC"
- Doors: Warm orange fill (#FED7AA), orange border (#EA580C), label "DR"
- Windows: Cyan fill (#CFFAFE), teal border (#0891B2), label "WN"

## Cabinet Interface
- `depthFlipped: boolean` - Controls which side of the centerline the depth extends to
- Auto-detected via `calculateDepthDirection()` which uses `computeInteriorNormal()` — first attempts point-in-polygon ray-casting test (`buildRoomPolygon()` + `pointInPolygon()`) with 5px offset test points from wall midpoint, falls back to nearest-wall heuristic for open layouts. Works correctly for concave (L-shaped, U-shaped) rooms unlike the previous centroid-based approach
- Toggleable via F key or flip button when selected

## Wall Selection & Direction Logic
- **Wall Hover Highlighting**: When a wall placement tool is active and no wall is locked, hovering near a wall highlights it with a purple glow (`hoveredWallId` state)
- **ActiveWall Locking**: On mouse down, the nearest wall is locked as ActiveWall in `WallPlacementState.wall` — no wall switching occurs during the placement session
- **Direction Detection**: In `settingLength` phase, cursor position is projected onto the ActiveWall vector. Signed projected distance from start point determines direction (positive/negative). Direction locks after >5px movement (`lockedDirection` field: 1 or -1). Once locked, drawing is clamped to that direction only
- **Mid-Wall Start**: Users can start placing cabinets from any position along a wall and draw in either direction. The `startPointOnWall` field tracks the origin point for bidirectional support
- **Interior Normal**: `computeInteriorNormal()` in kitchen-engine.ts detects room polygon winding to compute inward-facing normals, ensuring cabinets never render outside room boundaries

## Corner Support System
- **Wall Corners**: `getWallCornerJoints()` detects where two walls share an endpoint; `getWallCornerPolygon()` computes a filled polygon to create a seamless joint
- **Cabinet Corners**: `findCornerCabinetPairs()` detects perpendicular (~90°) same-type cabinet pairs using three methods: (1) wall corner joints, (2) centerline endpoint proximity, (3) rectangle corner proximity via `getCabinetRect()` — this last method catches cabinets whose depth rectangles touch even when centerline endpoints are offset by the cabinet depth
- Corner rendering is automatic — no user action needed beyond snapping cabinet endpoints to wall corners
- Both canvas rendering (`renderWallCornerJoints`, `renderCornerCabinets`) and PDF export include corner geometry
- **Tall Cabinet Splitting**: `splitCabinetAroundTall()` uses 1D interval clipping — projects tall cabinet start/end onto existing cabinet's parametric axis, computes the overlap interval, and produces 0-2 remaining segments (before/after). `findOverlappingCabinets()` uses parallelism check + lateral distance threshold (15px) + parametric interval overlap to avoid false positives across different walls. `computeSplitPoints()` provides preview data for the canvas. Split segments are regular Cabinet objects that flow through pricing/grouping unchanged
- **Corner Pricing Deduction**: `computeEffectiveLengths()` calculates billable lengths by subtracting one cabinet's depth per 90° internal corner. Only the shorter cabinet in each corner pair gets the deduction (to avoid double-counting the overlap). Deductions accumulate if a cabinet touches corners at both ends. Effective length is clamped to zero minimum. Works with or without walls present
- **Grouped Pricing**: `groupConnectedCabinets()` merges corner-connected cabinets of the same type into single pricing line items using union-find. The pricing panel shows the billable (corner-deducted) length and uses it for price calculation

## Critical Patterns
- All `setDrawingState` calls MUST use functional updaters `prev => ({...prev, changes})`
- `onDrawingStateChange` type is `React.Dispatch<React.SetStateAction<DrawingState>>`
- PIXELS_PER_CM=2, SNAP_RADIUS=12, WALL_THICKNESS=15
