# NIVRA Kitchen CRM — Complete Rebuild Prompt

## WHAT IS THIS

A web-based CRM + 2D kitchen layout designer for NIVRA, a kitchen company in UAE. Salespeople draw kitchen layouts, technicians take site measurements, system generates price quotes. Users are NOT designers — they need a simple, guided tool.

**Must work on:** Desktop, Tablet (iPad/Android), Mobile phone.

**Previous version problems (DO NOT repeat):**
- 4,034-line monolith canvas component → MAX 500 lines per file
- Cabinets placed on wall center-line → Must use INNER FACE
- Direction lock after 5px mouse movement → NO direction lock ever
- No mobile/tablet support → Responsive from day 1
- Photos as base64 blobs in DB → Use Supabase Storage
- 5cm clearance zone on doors → ZERO clearance, exact width only
- Same-type cabinet overlap allowed → BLOCK with error
- Site measurement = editable canvas → Locked reference photo only

---

## TECH STACK

- **Frontend:** React 18 + TypeScript + Vite
- **Canvas:** Konva.js + react-konva (2D drawing)
- **UI:** Tailwind CSS + shadcn/ui + Lucide icons (NO "Google Nano Banana API" — use Lucide icons only)
- **State:** Zustand (canvas) + TanStack Query (Supabase data)
- **Routing:** wouter
- **Backend:** Supabase (Auth + PostgreSQL + Storage + RLS)
- **PDF:** jsPDF + pdf-lib
- **Deploy:** Vercel

---

## DATABASE SCHEMA (Supabase PostgreSQL)

```sql
-- Admin settings
CREATE TABLE admin_settings (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'NIVRA Kitchen',
  logo_url TEXT DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#2563eb',
  footer_text TEXT NOT NULL DEFAULT 'NIVRA Kitchen - Professional Kitchen Design',
  grid_enabled BOOLEAN NOT NULL DEFAULT true,
  snap_radius INTEGER NOT NULL DEFAULT 12
);

-- Pricing per cabinet type
CREATE TABLE pricing_config (
  id SERIAL PRIMARY KEY,
  unit_type TEXT NOT NULL, -- base | wall_cabinet | tall
  price_per_meter NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED'
);

-- Finishing multipliers
CREATE TABLE finishing_options (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  multiplier NUMERIC(4,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Projects
CREATE TABLE saved_projects (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  client_email TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'estimated_budget', -- estimated_budget | site_measurement | final
  notes TEXT NOT NULL DEFAULT '',
  selected_finishing TEXT DEFAULT '1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spaces (rooms per project)
CREATE TABLE spaces (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES saved_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'kitchen', -- kitchen | bathroom | washroom | tv_unit
  canvas_data JSONB,
  finishing TEXT DEFAULT '1',
  notes TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  reference_image_url TEXT, -- Supabase Storage URL (NOT base64)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Site photos (stored in Supabase Storage, URL in DB)
CREATE TABLE space_photos (
  id SERIAL PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL, -- Supabase Storage URL (NOT base64)
  caption TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Element definitions (admin-configurable)
CREATE TABLE element_definitions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- electrical | plumbing | appliance
  icon TEXT NOT NULL DEFAULT '',
  default_width INTEGER NOT NULL DEFAULT 60,
  default_depth INTEGER NOT NULL DEFAULT 60,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wall points (electrical/plumbing in site measurement)
CREATE TABLE wall_points (
  id SERIAL PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- electrical | plumbing
  wall_id TEXT NOT NULL DEFAULT '',
  distance_cm INTEGER NOT NULL DEFAULT 0,
  height_cm INTEGER NOT NULL DEFAULT 0,
  photo_url TEXT DEFAULT '', -- Supabase Storage URL
  note TEXT NOT NULL DEFAULT '',
  pos_x INTEGER NOT NULL DEFAULT 0,
  pos_y INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users (managed via Supabase Auth + this profile table)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'sales', -- admin | sales | technician
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## SUPABASE RLS POLICIES (CRITICAL — do not skip)

```sql
-- Admin settings: anyone can read, only admin can write
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read settings" ON admin_settings FOR SELECT USING (true);
CREATE POLICY "Admin can update settings" ON admin_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Projects: all authenticated users can CRUD
ALTER TABLE saved_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can read projects" ON saved_projects FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can insert projects" ON saved_projects FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can update projects" ON saved_projects FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth users can delete projects" ON saved_projects FOR DELETE USING (auth.uid() IS NOT NULL);

-- Spaces: inherit from project (all auth users)
ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users CRUD spaces" ON spaces FOR ALL USING (auth.uid() IS NOT NULL);

-- Space photos: inherit from space
ALTER TABLE space_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users CRUD photos" ON space_photos FOR ALL USING (auth.uid() IS NOT NULL);

-- Wall points: inherit from space
ALTER TABLE wall_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users CRUD wall_points" ON wall_points FOR ALL USING (auth.uid() IS NOT NULL);

-- Pricing: anyone reads, admin writes
ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads pricing" ON pricing_config FOR SELECT USING (true);
CREATE POLICY "Admin writes pricing" ON pricing_config FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Same pattern for finishing_options, element_definitions
-- User profiles: admin can CRUD all, others read own
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin reads all profiles" ON user_profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin manages profiles" ON user_profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
```

## SUPABASE STORAGE BUCKETS

```
Bucket: "photos" — site photos uploaded by technicians
  - Max file size: 5MB
  - Allowed types: image/jpeg, image/png, image/webp
  - Public read, authenticated write

Bucket: "reference-images" — canvas screenshots for site measurement stage
  - Max file size: 10MB
  - Allowed types: image/png
  - Public read, authenticated write
```

All images go to Storage → URL saved in DB. NEVER store base64 in database.

---

## 3-STAGE PROJECT FLOW

### Stage 1: Estimated Budget
- Salesperson draws walls, places doors, windows, cabinets
- System calculates price automatically
- Can export PDF quotation with NIVRA letterhead
- When advancing to Stage 2: take a canvas SCREENSHOT → upload to Supabase Storage → save URL as `reference_image_url` on the space

### Stage 2: Site Measurement
- Canvas shows ONLY the locked reference image (screenshot from Stage 1) at 80% opacity
- NO wall/cabinet/door drawing — design is LOCKED
- Technician can ONLY: place electrical points, plumbing points, take site photos, add notes
- Show banner: "Site Measurement Mode — design is locked"
- Points appear bright and large on top of reference image

### Stage 3: Final
- Full editing returns (walls, cabinets, doors, windows)
- Reference image available as toggleable overlay
- Final pricing and PDF export

---

## COMPLETE DRAWING RULES

### WALL RULES
- Any angle allowed freely
- Shift key = locks to 0/90/180/270 degrees ONLY
- Wall thickness = FIXED 15px (7.5cm), not changeable
- Walls auto-snap at corners within 12px
- Minimum draw distance = 10px (shorter ignored)
- ALL elements attach to INNER FACE of wall, NOT center line
- Inner face = center line offset by WALL_THICKNESS/2 toward room interior
- Use room polygon detection to determine interior side

### ANCHOR POINT SYSTEM

When user hovers a wall with a placement tool, show ALL available anchor points:

| Anchor source | Marker | Color |
|---------------|--------|-------|
| Wall corner | Square | Gray |
| Door start edge | Diamond | Orange |
| Door end edge | Diamond | Orange |
| Window start edge | Diamond | Cyan |
| Window end edge | Diamond | Cyan |
| Cabinet start edge | Circle | Blue |
| Cabinet end edge | Circle | Blue |

- User CLICKS anchor to select as reference point
- Anchor is always on the EDGE, never middle
- Show tooltip: "Wall corner", "Door start edge", etc.
- Selected anchor = bigger + pulse animation

Snap priority: edge point (8px) > wall corner > door/window edge > cabinet edge > grid (20px)

### DIRECTION RULES
- Mouse movement decides direction in REAL TIME
- Direction NEVER locks — user can reverse anytime
- Do NOT implement any `drawDirection` lock variable
- Ghost preview follows mouse freely along wall

### CABINET PLACEMENT FLOW
1. Select tool (base, wall cabinet, or tall)
2. Hover wall → wall highlights, anchor points appear
3. Click anchor point → sets reference
4. Phase 1 "settingOffset": drag along wall OR type in input → sets start
5. Phase 2 "settingLength": move mouse freely (either direction) OR type → sets length
6. Cabinet created on inner wall face

### CABINET OVERLAP RULES
| Placing | On top of | Result |
|---------|-----------|--------|
| Base on Base | BLOCKED — error toast |
| Wall cab on Wall cab | BLOCKED — error toast |
| Tall on Base | Auto-split base around tall |
| Tall on Wall cab | Auto-split wall cab around tall |
| Base under Wall cab | ALLOWED |
| Any cabinet in door zone | BLOCKED (exact door width) |
| Wall cab in window zone | BLOCKED (exact window width) |
| Base under window | ALLOWED |

### CABINET DEPTH
| Type | Depth | Color |
|------|-------|-------|
| Base | 60cm | Blue #3B82F6 |
| Wall cabinet | 35cm | Green #22C55E |
| Tall | 60cm | Purple #A855F7 |
| Island | 90cm adjustable | Yellow #F59E0B |

- Depth auto-flips toward room interior
- F key = manual flip
- Min segment after tall-split = 5px

### CORNER CABINET RULES
- Two same-type cabinets at 90 degrees = L-shape corner pair
- System fills corner square automatically
- Shorter cabinet depth deducted from billable length
- Tall cabinets excluded from corner pairs

### DOOR / WINDOW RULES
- Must be on a wall
- Blocks EXACTLY its own width — ZERO clearance
- Door 120cm = blocks exactly 120cm
- Edges become anchor points for cabinets
- Cabinet can touch edge with zero gap
- Door blocks ALL cabinet types
- Window blocks ONLY wall cabinets (base can go under)

### ISLAND RULES
- Free placement, no wall needed
- Phase 1: click start, move for length (Shift = straight)
- Phase 2: move perpendicular for depth
- F = flip, default depth 90cm

### ELECTRICAL / PLUMBING (Site Measurement only)
- Placed on reference image
- Record: distance from corner, height from floor, photo (Supabase Storage), note
- Big bright markers: electrical = yellow, plumbing = blue
- Draggable to adjust
- Distance label always visible

### MEASURE TAPE
- Click to start (snaps to anchors), chain mode
- Shift = horizontal/vertical lock
- Purple color, live dimension label
- Clear all option

---

## VISUAL FEEDBACK RULES

| Feedback | When | How |
|----------|------|-----|
| Anchor markers | Hovering wall with tool | Colored shapes + tooltip |
| Ghost preview | Drawing any element | Semi-transparent follows mouse |
| Valid/invalid | Placing element | Green = ok, Red = blocked |
| Live dimensions | While drawing | Floating label near cursor |
| Wall ruler | Placing on wall | Purple ruler with 10cm ticks |
| Angle indicator | Drawing walls | Degree number near cursor |
| Remaining space | Placing on wall | Available cm counter |
| Error toast | Invalid action | Brief red message |
| Success flash | Element placed | Green checkmark animation |
| Cursor change | Per tool | Different icon per tool |
| Shift lock icon | Shift held | Lock icon near cursor |
| Edge glow | Cabinet tool active | Door/window edges glow |

---

## KEYBOARD SHORTCUTS

| Key | Action |
|-----|--------|
| Shift | Lock to 0/90/180/270 |
| F | Flip depth |
| Enter | Confirm input |
| Escape | Cancel |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Delete | Delete selected |
| Space | Toggle select and last tool |

---

## RENDERING ORDER (back to front)
1. Grid (20px)
2. Reference image (site measurement, 80% opacity)
3. Walls + corner joints
4. Doors / Windows
5. Base cabinets
6. Tall cabinets
7. Wall cabinets
8. Island cabinets
9. Electrical / Plumbing points
10. Guidelines (measure tape)
11. Ghost preview
12. Anchor indicators
13. Dimension labels

---

## RESPONSIVE DESIGN (build from day 1)

### Desktop (1024px+)
- Sidebar toolbar (left) + canvas (center) + pricing panel (right)
- All keyboard shortcuts
- Mouse hover for anchors

### Tablet (768-1023px)
- Bottom toolbar (horizontal, scrollable)
- Canvas full width
- Pricing = slide-out drawer from right
- Touch: tap to place, pinch to zoom, two-finger pan
- Anchor touch targets minimum 44px

### Mobile (< 768px)
- Bottom toolbar (icon only, compact)
- Canvas full screen
- Floating action button for tool switching
- Pricing = bottom sheet
- All touch targets minimum 44px

---

## USER ROLES

| Feature | Admin | Sales | Technician |
|---------|-------|-------|------------|
| Draw walls/cabinets | Yes | Yes | No |
| Place doors/windows | Yes | Yes | No |
| Electrical/plumbing | Yes | Yes | Yes |
| Site photos | Yes | Yes | Yes |
| View pricing | Yes | Yes | No |
| Export PDF | Yes | Yes | No |
| Manage users | Yes | No | No |
| Admin settings | Yes | No | No |

---

## PRICING RULES
- Formula: billable_length_meters x price_per_meter x finishing_multiplier
- Billable = effective length after corner deductions
- Corner: shorter cabinet in L-pair loses depth from length
- Connected cabinets grouped as 1 pricing line
- Currency: AED (admin configurable)
- Hidden during site measurement and for technician role

---

## OFFLINE / SLOW NETWORK HANDLING

Technicians go to client homes. Internet may be bad.

- Canvas auto-saves to localStorage as backup every change
- When Supabase is unreachable, show "Offline — changes saved locally" banner
- When connection returns, sync localStorage to Supabase automatically
- Photos queue for upload when offline, upload when back online
- Never lose work due to network issues

---

## FILE STRUCTURE (max 500 lines per file)

```
nivra-kitchen/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   │   ├── canvas/
│   │   │   ├── DesignerCanvas.tsx        (orchestrator, max 450 lines)
│   │   │   ├── WallRenderer.tsx
│   │   │   ├── CabinetRenderer.tsx
│   │   │   ├── OpeningRenderer.tsx
│   │   │   ├── AnchorPoints.tsx           (anchor point markers)
│   │   │   ├── GhostPreview.tsx           (green/red validity preview)
│   │   │   ├── WallRuler.tsx
│   │   │   ├── MeasureTape.tsx
│   │   │   ├── WallPointRenderer.tsx
│   │   │   ├── GridRenderer.tsx
│   │   │   └── DimensionInput.tsx
│   │   ├── toolbar/
│   │   │   ├── Toolbar.tsx                (responsive: sidebar/bottom)
│   │   │   └── ToolButton.tsx
│   │   ├── pricing/
│   │   │   └── PricingPanel.tsx
│   │   ├── layout/
│   │   │   ├── DesktopLayout.tsx
│   │   │   ├── TabletLayout.tsx
│   │   │   └── MobileLayout.tsx
│   │   └── ui/                            (shadcn components)
│   ├── lib/
│   │   ├── supabase.ts                    (Supabase client)
│   │   ├── kitchen-engine.ts              (core geometry, max 750 lines)
│   │   ├── anchor-system.ts               (anchor collection + priority)
│   │   ├── overlap-checker.ts             (overlap validation + tall split)
│   │   ├── inner-face.ts                  (wall inner face offset)
│   │   ├── export.ts                      (PDF with letterhead)
│   │   ├── history.ts                     (undo/redo)
│   │   ├── offline-sync.ts               (localStorage backup + sync)
│   │   ├── constants.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useCanvasEvents.ts             (master event router, mouse+touch)
│   │   ├── useWallPlacement.ts            (wall drawing state machine)
│   │   ├── useCabinetPlacement.ts         (cabinet FSM, NO direction lock)
│   │   ├── useOpeningPlacement.ts         (door/window placement)
│   │   ├── useAutoSave.ts                 (debounced 1.5s + localStorage)
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useResponsive.ts              (breakpoint detection)
│   │   ├── useTouchGestures.ts           (pinch-zoom, two-finger-pan)
│   │   └── useOfflineSync.ts             (network detection + sync)
│   ├── stores/
│   │   ├── useCanvasStore.ts
│   │   ├── useProjectStore.ts
│   │   ├── useSpaceStore.ts
│   │   └── useAuthStore.ts
│   ├── queries/
│   │   ├── useProjects.ts
│   │   ├── useSpaces.ts
│   │   ├── usePricing.ts
│   │   ├── useFinishing.ts
│   │   ├── useSettings.ts
│   │   ├── useWallPoints.ts
│   │   ├── usePhotos.ts
│   │   └── useUsers.ts
│   └── pages/
│       ├── login.tsx
│       ├── projects.tsx
│       ├── project-detail.tsx
│       ├── admin.tsx
│       └── not-found.tsx
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── public/
│   └── favicon.png
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
└── DRAWING_RULES.md
```

---

## IMPLEMENTATION PHASES (updated — merged geometry+canvas)

### Phase 1: Foundation
- Vite + React 18 + TypeScript + Tailwind + shadcn/ui setup
- Supabase client (lib/supabase.ts)
- Auth flow: useAuthStore + Supabase Auth + login page + AuthGuard
- wouter routing: /login, /projects, /projects/:id, /admin
- Supabase schema migration (SQL above + RLS policies + Storage buckets)
- Seed data (admin_settings, default pricing, default finishing, admin user)
- Responsive hook (useResponsive) — detect desktop/tablet/mobile from day 1

### Phase 2: Data Layer + Project Pages
- TanStack Query hooks: useProjects, useSpaces, usePricing, useFinishing, useSettings, useWallPoints, usePhotos, useUsers
- Zustand stores: useCanvasStore, useProjectStore, useSpaceStore, useAuthStore
- Projects list page (search by name/phone, filter by stage, create new)
- Project detail page (space tabs, stage display, advance stage button)

### Phase 3: Geometry + Canvas MVP (merged — build and test together)
- constants.ts + types.ts (all interfaces and constants)
- kitchen-engine.ts (~750 lines) — core geometry, snap, hit detection, room polygon
- inner-face.ts (~150 lines) — wall inner face offset calculations
- history.ts (~65 lines) — undo/redo stack
- DesignerCanvas.tsx orchestrator (~450 lines)
- GridRenderer.tsx, WallRenderer.tsx
- useCanvasEvents.ts (master mouse+touch event router)
- useWallPlacement.ts (wall drawing state machine)
- Basic zoom/pan (mouse wheel + pinch + two-finger drag)
- TEST: draw walls, verify inner face, verify angles, verify Shift lock

### Phase 4: Cabinet + Opening Placement
- anchor-system.ts (~200 lines) — anchor point collection + priority
- overlap-checker.ts (~250 lines) — overlap validation + tall split
- useCabinetPlacement.ts (4-phase FSM — NO direction lock)
- useOpeningPlacement.ts (door/window placement)
- CabinetRenderer.tsx, OpeningRenderer.tsx
- AnchorPoints.tsx (visual markers per type)
- GhostPreview.tsx (green = valid, red = blocked)
- DimensionInput.tsx (floating offset/length input)
- WallRuler.tsx (ruler with ticks)
- TEST: place cabinets from door edge, verify zero gap, verify overlap block, verify direction freedom

### Phase 5: Advanced Features
- MeasureTape.tsx (guideline chain tool)
- WallPointRenderer.tsx (electrical/plumbing markers)
- Site measurement mode (reference image capture, locked canvas, points only)
- useAutoSave.ts (debounced 1.5s to Supabase + localStorage backup)
- useKeyboardShortcuts.ts
- offline-sync.ts + useOfflineSync.ts (network detection, localStorage backup, auto-sync)
- Photo upload to Supabase Storage (not base64)
- TEST: site measurement flow, offline mode, photo upload

### Phase 6: Responsive + Polish
- useTouchGestures.ts (pinch-zoom, two-finger-pan, tap events)
- DesktopLayout / TabletLayout / MobileLayout components
- Responsive Toolbar (sidebar on desktop, bottom bar on tablet, icon bar on mobile)
- PricingPanel (desktop panel, tablet drawer, mobile bottom sheet)
- All touch targets minimum 44px
- TEST: full flow on real iPad and mobile phone

### Phase 7: Admin + PDF + Final
- Admin page: 5 tabs (Settings, Pricing, Finishing, Elements, Users)
- PDF export (jsPDF + pdf-lib + NIVRA letterhead)
- Full testing checklist (20 items below)
- Performance test with 50+ walls and 100+ cabinets

---

## CONSTANTS

```typescript
export const WALL_THICKNESS = 15;          // px
export const SNAP_RADIUS = 12;             // px
export const GRID_SIZE = 20;               // px
export const PIXELS_PER_CM = 2;
export const MIN_DRAW_DISTANCE = 10;       // px
export const MIN_SEGMENT_AFTER_SPLIT = 5;  // px
export const WALL_HOVER_THRESHOLD = 30;    // px
export const HIT_DETECTION_RADIUS = 12;    // px
export const CABINET_HIT_PADDING = 5;      // px
export const TOUCH_TARGET_MIN = 44;        // px (accessibility)
export const AUTOSAVE_DEBOUNCE_MS = 1500;

export const CABINET_DEPTHS = { base: 60, wall_cabinet: 35, tall: 60, island: 90 };
export const CLEARANCE_DEPTHS = { door: 0, window: 0 }; // ZERO — exact width only
```

---

## CRITICAL ARCHITECTURE RULES

1. NO file over 500 lines. Split by responsibility.
2. Extract hooks. All event handlers in custom hooks, not inline.
3. Separate geometry from rendering. kitchen-engine = math only. Components = rendering only.
4. Touch events from day 1. Every onClick also has onTap. Every drag handles touch.
5. Auto-save with debounce. 1.5s after last change. Plus localStorage backup.
6. No Replit code. No @replit/* packages.
7. Photos to Storage. Never base64 in database.
8. Offline-first for site measurement. localStorage backup always.

---

## TESTING CHECKLIST (verify ALL after build)

1. [ ] Draw 4 walls forming rectangle — walls connect at corners
2. [ ] Draw wall at 45 degrees — works freely
3. [ ] Hold Shift while drawing — locks to 0/90/180/270
4. [ ] Place 120cm door — blocks exactly 120cm
5. [ ] Place base cabinet from door edge — zero gap, perfect alignment
6. [ ] Base cabinet sits on inner wall face — no overlap into wall
7. [ ] Try base on existing base — error toast appears
8. [ ] Place tall over base — base auto-splits
9. [ ] Move mouse freely left/right setting length — no direction lock
10. [ ] Select cabinet, press F — depth flips
11. [ ] Pricing calculates correctly
12. [ ] Corner L-shape cabinets work at 90 degrees
13. [ ] Advance to site measurement — locked reference photo appears
14. [ ] Place electrical point on reference photo
15. [ ] Export PDF with correct measurements
16. [ ] Test on real tablet — touch draw, pinch zoom, pan
17. [ ] Test on mobile — bottom toolbar, full screen canvas
18. [ ] Undo/Redo works for all actions
19. [ ] Project search by phone number works
20. [ ] Admin manages pricing, finishing, users
21. [ ] Go offline — changes save to localStorage
22. [ ] Come back online — changes sync to Supabase
23. [ ] Photos upload to Storage, not base64 in DB
24. [ ] RLS: technician cannot see pricing
25. [ ] RLS: non-admin cannot access admin page
