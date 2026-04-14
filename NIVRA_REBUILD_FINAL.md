# NIVRA Kitchen CRM — Complete Rebuild Prompt (FINAL)

## WHAT IS THIS

A web-based CRM + 2D kitchen layout designer for NIVRA, a kitchen company in UAE. Salespeople draw kitchen layouts, technicians take site measurements, system generates price quotes. Users are NOT designers — they need a simple, guided tool.

**Must work on:** Desktop, Tablet (iPad/Android), Mobile phone.

**Previous version problems (DO NOT repeat):**
- 4,034-line monolith canvas → MAX 500 lines per file
- Center-line placement → INNER FACE only
- Direction lock after 5px → NO lock ever
- No mobile/tablet → Responsive from day 1
- base64 photos in DB → Supabase Storage only
- 5cm door clearance → ZERO clearance, exact width
- Same-type overlap allowed → BLOCK with error
- Site measurement editable → Locked reference photo only

---

## TECH STACK

- **Frontend:** React 18 + TypeScript + Vite
- **Canvas:** Konva.js + react-konva
- **UI:** Tailwind CSS + shadcn/ui + Lucide icons
- **State:** Zustand (canvas) + TanStack Query (Supabase)
- **Routing:** wouter
- **Backend:** Supabase (Auth + PostgreSQL + RLS + Storage)
- **PDF:** jsPDF + pdf-lib
- **Deploy:** Vercel
- **Offline:** localStorage backup + auto-sync

---

## DATABASE SCHEMA (Supabase PostgreSQL)

```sql
CREATE TABLE admin_settings (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT 'NIVRA Kitchen',
  logo_url TEXT DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#2563eb',
  footer_text TEXT NOT NULL DEFAULT 'NIVRA Kitchen - Professional Kitchen Design',
  grid_enabled BOOLEAN NOT NULL DEFAULT true,
  snap_radius INTEGER NOT NULL DEFAULT 12
);

CREATE TABLE pricing_config (
  id SERIAL PRIMARY KEY,
  unit_type TEXT NOT NULL, -- base | wall_cabinet | tall
  price_per_meter NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED'
);

CREATE TABLE finishing_options (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  multiplier NUMERIC(4,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

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

CREATE TABLE space_photos (
  id SERIAL PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL, -- Supabase Storage URL (NOT base64)
  caption TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'sales', -- admin | sales | technician
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## SUPABASE RLS POLICIES

```sql
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads" ON admin_settings FOR SELECT USING (true);
CREATE POLICY "Admin writes" ON admin_settings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE saved_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read" ON saved_projects FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth insert" ON saved_projects FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Auth update" ON saved_projects FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Auth delete" ON saved_projects FOR DELETE USING (auth.uid() IS NOT NULL);

ALTER TABLE spaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth CRUD" ON spaces FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE space_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth CRUD" ON space_photos FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE wall_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth CRUD" ON wall_points FOR ALL USING (auth.uid() IS NOT NULL);

ALTER TABLE pricing_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads" ON pricing_config FOR SELECT USING (true);
CREATE POLICY "Admin writes" ON pricing_config FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE finishing_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads" ON finishing_options FOR SELECT USING (true);
CREATE POLICY "Admin writes" ON finishing_options FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE element_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads" ON element_definitions FOR SELECT USING (true);
CREATE POLICY "Admin writes" ON element_definitions FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin reads all" ON user_profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admin manages" ON user_profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
);
```

## SUPABASE STORAGE BUCKETS

Create these 2 buckets in Phase 1:
- **"photos"** — site photos. Max 5MB. jpeg/png/webp. Public read, auth write.
- **"reference-images"** — canvas screenshots. Max 10MB. png only. Public read, auth write.

All images → Storage → URL in DB. NEVER base64 in database.

---

## SEED DATA (Phase 1)

```sql
-- Admin settings
INSERT INTO admin_settings (company_name, primary_color) VALUES ('NIVRA Kitchen', '#2563eb');

-- Default pricing
INSERT INTO pricing_config (unit_type, price_per_meter, currency) VALUES ('base', 2500, 'AED');
INSERT INTO pricing_config (unit_type, price_per_meter, currency) VALUES ('wall_cabinet', 2000, 'AED');
INSERT INTO pricing_config (unit_type, price_per_meter, currency) VALUES ('tall', 3000, 'AED');

-- Default finishing
INSERT INTO finishing_options (label, multiplier, sort_order) VALUES ('Standard', 1.0, 0);
INSERT INTO finishing_options (label, multiplier, sort_order) VALUES ('Premium', 1.5, 1);
INSERT INTO finishing_options (label, multiplier, sort_order) VALUES ('Luxury', 2.0, 2);

-- Default element definitions (for site measurement tools)
INSERT INTO element_definitions (name, category, icon, default_width, default_depth) VALUES
  ('Single Socket', 'electrical', 'Zap', 10, 10),
  ('Double Socket', 'electrical', 'Zap', 15, 10),
  ('Light Switch', 'electrical', 'Lightbulb', 8, 8),
  ('Water Inlet', 'plumbing', 'Droplets', 10, 10),
  ('Drain Point', 'plumbing', 'CircleDot', 10, 10),
  ('Gas Point', 'plumbing', 'Flame', 10, 10);
```

---

## 3-STAGE PROJECT FLOW

### Stage 1: Estimated Budget
- Draw walls, doors, windows, cabinets
- Auto pricing calculation
- PDF export with NIVRA letterhead
- Advancing to Stage 2: capture canvas screenshot using Konva `stage.toDataURL()` → convert to Blob → upload to Supabase Storage "reference-images" bucket → save returned URL as `reference_image_url` on the space. Do NOT store base64.

### Stage 2: Site Measurement
- Canvas shows ONLY the locked reference image at 80% opacity
- NO wall/cabinet/door drawing — design is LOCKED
- Technician can ONLY: place electrical/plumbing points, take photos, add notes
- Banner: "Site Measurement Mode — design is locked"
- Points bright and large on top of reference image

### Stage 3: Final
- Full editing returns
- Reference image toggleable overlay
- Final pricing + PDF export

---

## COMPLETE DRAWING RULES

### WALLS
- Any angle allowed. Shift = 0/90/180/270 only
- Fixed thickness 15px (7.5cm). Auto-snap corners within 12px
- Min draw distance = 10px
- ALL elements attach to INNER FACE (center + WALL_THICKNESS/2 toward interior)
- Use room polygon detection for interior side

### ANCHOR POINTS (replaces old snap)
When hovering wall with placement tool, show ALL anchor points:
- Wall corner = gray square marker
- Door start/end edge = orange diamond marker
- Window start/end edge = cyan diamond marker
- Cabinet start/end edge = blue circle marker
- User CLICKS anchor to select. Tooltip label on hover. Pulse on select.
- Priority: edge (8px) > corner > door/window > cabinet > grid (20px)

### DIRECTION
- Mouse decides in real time. NEVER locks.
- Do NOT implement any drawDirection lock variable.
- Ghost preview follows mouse freely along wall.

### CABINET PLACEMENT
1. Select tool (base/wall_cabinet/tall)
2. Hover wall → highlights + anchor points appear
3. Click anchor → reference point set
4. Phase 1 "settingOffset": drag or type → start position
5. Phase 2 "settingLength": move mouse freely (either dir) or type → length
6. Cabinet created on inner wall face

### OVERLAP RULES
| Placing | On top of | Result |
|---------|-----------|--------|
| Base on Base | BLOCKED — error toast |
| Wall cab on Wall cab | BLOCKED — error toast |
| Tall on Base | Auto-split base around tall |
| Tall on Wall cab | Auto-split wall cab around tall |
| Base under Wall cab | ALLOWED |
| Any cab in door zone | BLOCKED (exact door width) |
| Wall cab in window zone | BLOCKED (exact window width) |
| Base under window | ALLOWED |

### DEPTH
Base=60cm (blue #3B82F6), Wall cabinet=35cm (green #22C55E), Tall=60cm (purple #A855F7), Island=90cm adjustable (yellow #F59E0B). Auto-flip toward interior. F=manual flip. Min segment after split=5px.

### CORNER CABINETS
Same-type at 90deg = L-shape pair. Corner square filled auto. Shorter loses depth from billable length. Tall excluded.

### DOORS / WINDOWS
On wall. ZERO clearance. Exact width blocking only. Edges = anchor points. Zero gap allowed. Door blocks ALL types. Window blocks ONLY wall cabinets.

### ISLAND
Free placement. Phase 1: length (Shift=straight). Phase 2: depth perpendicular. F=flip. Default 90cm.

### ELECTRICAL / PLUMBING (site measurement only)
On reference image. Distance + height + photo (Storage) + note. Yellow=electrical, blue=plumbing. Draggable. Label visible.

### MEASURE TAPE
Chain mode. Shift=straight. Purple. Live dimensions. Clear all option.

---

## VISUAL FEEDBACK
Anchor markers (colored shapes+tooltip) | Ghost preview (green=valid, red=blocked) | Live dimensions | Wall ruler (purple, 10cm ticks) | Angle indicator | Remaining space counter | Error toast | Success flash | Cursor per tool | Shift lock icon | Edge glow when cabinet tool active

## KEYBOARD SHORTCUTS
Shift=angle lock | F=flip depth | Enter=confirm | Esc=cancel | Ctrl+Z=undo | Ctrl+Y=redo | Del=delete | Space=toggle select/last tool

## RENDERING ORDER (back to front)
1.Grid → 2.Reference image → 3.Walls+corners → 4.Doors/windows → 5.Base cab → 6.Tall cab → 7.Wall cab → 8.Island → 9.Elec/plumbing points → 10.Guidelines → 11.Ghost → 12.Anchors → 13.Dimensions

---

## RESPONSIVE (from day 1)

**Desktop 1024+:** Sidebar toolbar (left) + canvas (center) + pricing panel (right). All shortcuts.
**Tablet 768-1023:** Bottom toolbar (horizontal scroll) + full-width canvas + pricing drawer. Touch: tap, pinch-zoom, two-finger-pan. Targets >= 44px.
**Mobile <768:** Bottom icon bar + full-screen canvas + FAB for tools + pricing bottom sheet. Targets >= 44px.

## USER ROLES
| Feature | Admin | Sales | Technician |
|---------|-------|-------|------------|
| Draw walls/cabinets/doors | Yes | Yes | No |
| Electrical/plumbing/photos | Yes | Yes | Yes |
| View pricing / Export PDF | Yes | Yes | No |
| Admin settings / Users | Yes | No | No |

## PRICING
Formula: billable_meters x price_per_meter x finishing_multiplier. Corner deduction: shorter cab in L-pair loses depth from length. Connected cabs grouped. AED default. Hidden for technician + site measurement.

## OFFLINE HANDLING
localStorage backup every canvas change. "Offline — saved locally" banner. Auto-sync on reconnect. Photo upload queue when offline. Never lose work.

---

## FILE STRUCTURE (max 500 lines per file)

```
src/
  components/
    canvas/
      DesignerCanvas.tsx       (orchestrator ~450 lines)
      WallRenderer.tsx
      CabinetRenderer.tsx
      OpeningRenderer.tsx
      AnchorPoints.tsx          (anchor markers)
      GhostPreview.tsx          (green/red preview)
      WallRuler.tsx
      MeasureTape.tsx
      WallPointRenderer.tsx
      GridRenderer.tsx
      DimensionInput.tsx
    toolbar/
      Toolbar.tsx               (responsive: sidebar/bottom/icon)
      ToolButton.tsx
    pricing/
      PricingPanel.tsx
    layout/
      DesktopLayout.tsx
      TabletLayout.tsx
      MobileLayout.tsx
    ui/                         (shadcn components)
  lib/
    supabase.ts
    kitchen-engine.ts          (core geometry ~750 lines max)
    anchor-system.ts           (anchor collection + priority)
    overlap-checker.ts         (overlap validation + tall split)
    inner-face.ts              (wall inner face offset)
    export.ts                  (PDF + letterhead)
    history.ts                 (undo/redo)
    offline-sync.ts            (localStorage + sync)
    constants.ts
    types.ts
    utils.ts
  hooks/
    useCanvasEvents.ts         (master mouse+touch router)
    useWallPlacement.ts        (wall FSM)
    useCabinetPlacement.ts     (cabinet FSM — NO direction lock)
    useOpeningPlacement.ts     (door/window)
    useAutoSave.ts             (1.5s debounce + localStorage)
    useKeyboardShortcuts.ts
    useResponsive.ts           (breakpoints)
    useTouchGestures.ts        (pinch/pan/tap)
    useOfflineSync.ts          (network detect + sync)
  stores/
    useCanvasStore.ts
    useProjectStore.ts
    useSpaceStore.ts
    useAuthStore.ts
  queries/
    useProjects.ts
    useSpaces.ts
    usePricing.ts
    useFinishing.ts
    useSettings.ts
    useWallPoints.ts
    usePhotos.ts
    useUsers.ts
  pages/
    login.tsx
    projects.tsx
    project-detail.tsx
    admin.tsx
    not-found.tsx
supabase/
  migrations/
    001_initial_schema.sql
```

---

## IMPLEMENTATION PHASES

### Phase 1: Foundation
- Vite + React 18 + TS + Tailwind + shadcn/ui scaffold
- `lib/supabase.ts` (Supabase client)
- Auth: useAuthStore + Supabase Auth + login page + AuthGuard
- wouter routing: /login, /projects, /projects/:id, /admin
- Supabase migration: ALL schema SQL above + ALL RLS policies above
- Create Storage buckets: "photos" (5MB, jpeg/png/webp) + "reference-images" (10MB, png)
- Seed data: admin_settings + pricing + finishing + element_definitions + admin user
- `useResponsive` hook (desktop/tablet/mobile detection from day 1)

### Phase 2: Data Layer + Project Pages
- TanStack Query hooks: useProjects, useSpaces, usePricing, useFinishing, useSettings, useWallPoints, usePhotos, useUsers
- Zustand stores: useCanvasStore, useProjectStore, useSpaceStore
- Projects page: search by name/phone, filter by stage, create new
- Project detail page: space tabs, stage badge, advance stage button
- Auto-create default "Kitchen" space when new project is created

### Phase 3: Geometry + Canvas MVP (merged — build & test together)
- constants.ts + types.ts (all interfaces and constants)
- kitchen-engine.ts (~750 lines) — geometry, snap, hit detection, room polygon
- inner-face.ts (~150 lines) — wall inner face offset (FIX 1)
- history.ts (~65 lines) — undo/redo stack
- DesignerCanvas.tsx orchestrator (~450 lines)
- GridRenderer.tsx, WallRenderer.tsx
- useCanvasEvents.ts (master mouse + touch event router)
- useWallPlacement.ts (wall drawing FSM)
- useTouchGestures.ts — BASIC version: pinch-zoom + two-finger-pan (so tablet works immediately)
- Zoom/pan: mouse wheel + pinch + two-finger drag
- **TEST:** draw walls, verify inner face offset, verify any-angle, verify Shift lock, verify pinch-zoom on tablet

### Phase 4: Cabinet + Opening Placement
- anchor-system.ts (~200 lines) — anchor collection + priority (FIX 3)
- overlap-checker.ts (~250 lines) — overlap validation + tall split + same-type block
- useCabinetPlacement.ts (4-phase FSM — NO direction lock — FIX 2)
- useOpeningPlacement.ts (door/window placement)
- CabinetRenderer.tsx, OpeningRenderer.tsx
- AnchorPoints.tsx (visual markers per anchor type)
- GhostPreview.tsx (green = valid, red = blocked)
- DimensionInput.tsx (floating offset/length input)
- WallRuler.tsx (ruler with 10cm ticks)
- **TEST:** place cabinet from door edge = zero gap, base-on-base blocked, tall splits base, direction freedom works, anchor selection works

### Phase 5: Advanced Features
- MeasureTape.tsx (guideline chain tool)
- WallPointRenderer.tsx (electrical/plumbing big markers)
- Site measurement mode:
  1. When advancing stage: `stage.toDataURL()` → convert base64 to Blob → upload to Supabase Storage "reference-images" → save URL as reference_image_url
  2. In site_measurement stage: show ONLY reference image at 80% opacity, locked canvas, points only
  3. Banner: "Site Measurement Mode — design is locked"
- useAutoSave.ts (1.5s debounce to Supabase + localStorage backup)
- useKeyboardShortcuts.ts
- offline-sync.ts + useOfflineSync.ts (network detect, localStorage backup, auto-sync, photo queue)
- Photo upload: camera/file → upload to Supabase Storage "photos" → save URL in DB
- **TEST:** site measurement flow end-to-end, offline banner + sync, photo upload to Storage

### Phase 6: Responsive + Polish
- Upgrade useTouchGestures.ts (full: pinch-zoom, two-finger-pan, tap, long-press)
- DesktopLayout / TabletLayout / MobileLayout
- Responsive Toolbar (sidebar → bottom bar → icon bar)
- PricingPanel (desktop panel / tablet drawer / mobile bottom sheet)
- All touch targets >= 44px
- **TEST:** full flow on real iPad and real mobile phone

### Phase 7: Admin + PDF + Final
- Admin page: 5 tabs (Settings, Pricing, Finishing, Elements, Users)
- PDF export (jsPDF + pdf-lib + NIVRA letterhead)
- Performance test: 50+ walls + 100+ cabinets
- Run full 25-item testing checklist

---

## CONSTANTS

```typescript
export const WALL_THICKNESS = 15;
export const SNAP_RADIUS = 12;
export const GRID_SIZE = 20;
export const PIXELS_PER_CM = 2;
export const MIN_DRAW_DISTANCE = 10;
export const MIN_SEGMENT_AFTER_SPLIT = 5;
export const WALL_HOVER_THRESHOLD = 30;
export const HIT_DETECTION_RADIUS = 12;
export const CABINET_HIT_PADDING = 5;
export const TOUCH_TARGET_MIN = 44;
export const AUTOSAVE_DEBOUNCE_MS = 1500;

export const CABINET_DEPTHS = { base: 60, wall_cabinet: 35, tall: 60, island: 90 };
export const CLEARANCE_DEPTHS = { door: 0, window: 0 }; // ZERO
```

---

## ARCHITECTURE RULES

1. NO file over 500 lines — split by responsibility
2. ALL event handlers in custom hooks — not inline in components
3. Geometry separate from rendering — kitchen-engine = math only
4. Touch events from day 1 — every onClick also has onTap
5. Auto-save + localStorage backup — 1.5s debounce
6. No Replit code — no @replit/* packages
7. Photos to Supabase Storage — never base64 in DB
8. Offline-first for field work — localStorage always

---

## TESTING CHECKLIST (25 items — verify ALL)

1. [ ] Draw 4 walls rectangle — corners connect
2. [ ] Draw wall at 45deg — any angle works
3. [ ] Shift locks to 0/90/180/270
4. [ ] 120cm door blocks exactly 120cm
5. [ ] Cabinet from door edge = zero gap
6. [ ] Cabinet on inner face — no wall overlap
7. [ ] Base on base = error toast
8. [ ] Tall splits base auto
9. [ ] Free direction — no lock
10. [ ] F flips depth
11. [ ] Pricing correct
12. [ ] Corner L-shape works
13. [ ] Site measurement = locked reference photo
14. [ ] Electrical point on reference photo
15. [ ] PDF export correct measurements
16. [ ] Tablet: touch draw + pinch zoom + pan
17. [ ] Mobile: bottom toolbar + full screen
18. [ ] Undo/redo all actions
19. [ ] Search by phone works
20. [ ] Admin manages settings/pricing/users
21. [ ] Offline saves to localStorage
22. [ ] Online syncs back to Supabase
23. [ ] Photos in Storage, not base64
24. [ ] Technician can't see pricing
25. [ ] Non-admin can't access /admin
