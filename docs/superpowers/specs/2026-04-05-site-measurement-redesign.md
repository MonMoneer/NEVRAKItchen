# Site Measurement Redesign — Design Spec

**Date:** 2026-04-05
**Status:** Approved for implementation
**Areas:** `shared/schema.ts`, `client/src/pages/project-detail.tsx`, `client/src/stores/useCanvasStore.ts`, new `SiteMeasurementPanel.tsx` + `ReferenceModal.tsx`, Drizzle migration

---

## 1. Problem

Site Measurement mode currently:
- Shows a yellow "Site Measurement Mode — design is locked" banner on the canvas
- Shares the SAME canvas data as the estimated-budget stage (so technicians see estimated walls/cabinets mixed with their own measurements)
- Has no structured view of the wall_points (electrical/plumbing) a technician has captured
- Provides only an on-canvas reference overlay (Eye toggle) for context

Technicians need to capture **actual** on-site measurements as a ground truth separate from the estimate. They need easy access to review the estimated design photo AND review their own captured wall-point photos without digging through the canvas.

## 2. Goal

- Separate the site-measurement canvas from the estimated-budget canvas so they can diverge freely.
- Replace the yellow banner with a dedicated right sidebar that shows the estimated reference photo + a reviewable list of captured wall points.

## 3. Part A — Schema: add site_measurement_data column

### 3.1 Migration

```sql
ALTER TABLE spaces ADD COLUMN site_measurement_data jsonb;
```

Default is NULL. When a user first draws anything in site_measurement stage, the app writes a canvas object `{walls, openings, cabinets, elements, wallPoints, guidelines}` to this column.

### 3.2 Drizzle schema

In `shared/schema.ts`, add to the `spaces` table:

```ts
siteMeasurementData: jsonb("site_measurement_data"),
```

Type definition + Zod insert schema auto-updates.

### 3.3 Existing data

No migration of existing rows. All existing spaces get `siteMeasurementData = NULL` which renders as blank canvas. Existing `canvasData` remains untouched (it represents the estimate). Existing wall_points remain in the DB but become orphans (their `wall_id` references walls in `canvasData`, not `siteMeasurementData` which starts empty). Orphans don't render because the canvas filters wall_points to those whose `wall_id` exists in the currently-loaded walls array. Fresh start is acceptable — the app is in active dev.

## 4. Part B — Stage-aware canvas loading

### 4.1 In `project-detail.tsx`

Select the canvas data source by stage:

```ts
const canvasSourceField = stage === 'site_measurement'
  ? 'siteMeasurementData'
  : 'canvasData';
const activeCanvasData = activeSpace?.[canvasSourceField] ?? null;
```

Pass `activeCanvasData` to `useCanvasStore` for initialization and have the auto-save writer target the same field.

### 4.2 In `useCanvasStore.ts`

- Hydrate from `activeCanvasData`.
- Auto-save PUTs to `/api/spaces/:id` with body `{ [canvasSourceField]: { walls, openings, ... } }`. The API already accepts arbitrary fields on update.
- When `stage` changes during a session, re-hydrate from the new field.

### 4.3 Final stage

`final` stage displays `canvasData` read-only (unchanged from today).

## 5. Part C — UI changes in project-detail.tsx

### 5.1 Remove

- Yellow banner (`<div className="bg-amber-100 ...">Site Measurement Mode — design is locked</div>`, lines ~988-992).

### 5.2 Keep unchanged

- Top-bar "Mark as Final" button.
- Top-bar "Show ref / Hide ref" button (Eye icon) — overlays reference photo on canvas at 50% opacity for tracing.

### 5.3 Add: SiteMeasurementPanel (new right sidebar)

Mount when `stage === 'site_measurement'`, width `260px`, positioned where `PricingPanel` lives (Pricing is hidden in this stage anyway).

## 6. Part D — SiteMeasurementPanel component

### 6.1 Layout (top-to-bottom)

```
┌─────────────────────────────┐
│  REFERENCE                  │
│  ┌─────────────────────────┐│
│  │  [estimated design PNG] ││ ← click → ReferenceModal
│  │  aspect-ratio: canvas   ││
│  └─────────────────────────┘│
│                             │
│  WALL POINTS (N)            │
│  [scrollable list]          │
│  ┌─────────────────────────┐│
│  │ ⚡ 120cm · H90  [▼]     ││ ← collapsed
│  └─────────────────────────┘│
│  ┌─────────────────────────┐│
│  │ 💧 80cm · H45   [▲]     ││ ← expanded
│  │ ┌─────────┐             ││
│  │ │ [photo] │             ││
│  │ └─────────┘             ││
│  │ Distance [80]cm          ││
│  │ Height   [45]cm          ││
│  │ Note [___________]       ││
│  │ [Delete]       [Save]    ││
│  └─────────────────────────┘│
└─────────────────────────────┘
```

### 6.2 Reference thumbnail

- If `space.referenceImage` exists: show as `<img src={referenceImage} />` inside a bordered card, fit-contain.
- If `referenceImage` is null: show empty-state "No reference photo yet — advance from Estimated Budget to generate one".
- Click → opens `<ReferenceModal />`.

### 6.3 Wall points list

- Filter: only points whose `wallId` exists in `drawingState.walls` (hides orphans).
- Sort: by creation order (default wall_points table insertion order).
- Each entry:
  - Collapsed: icon (⚡ or 💧), `{distance_cm}cm · H{height_cm}`, expand button `▼`.
  - Expanded: icon, photo (full width), editable `distance_cm`, `height_cm`, `note` fields, **Delete** (destructive button, left) + **Save** (primary, right).
- Expand is local component state (one or many can be open; keep it simple — multiple simultaneously).
- Save button calls `onUpdateWallPoint(id, updates)` (existing handler in project-detail.tsx).
- Delete button calls `onDeleteWallPoint(id)` (existing handler), closes the entry.

### 6.4 Edit form behavior

- Inline inputs are pre-filled from the wall_point's current values.
- User can type or use keypad (existing keypad targets any focused input ✓).
- Changes stay local until Save is pressed.
- Photo is **read-only** in the expanded view (user re-takes by deleting and re-adding the point from the canvas — out of scope for this change).

## 7. Part E — ReferenceModal component

### 7.1 Behavior

- Full-viewport overlay (`fixed inset-0 z-50 bg-black/80`).
- Centered image `max-w-[90vw] max-h-[90vh] object-contain`.
- Close on:
  - Click outside image (on overlay background)
  - `Escape` key
  - X button in top-right corner

### 7.2 Props

```ts
interface ReferenceModalProps {
  imageSrc: string | null;
  open: boolean;
  onClose: () => void;
}
```

Returns `null` if `!open || !imageSrc`.

## 8. Files to change

| File | Change |
|---|---|
| `shared/schema.ts` | Add `siteMeasurementData: jsonb("site_measurement_data")` to spaces |
| Drizzle migration | `ALTER TABLE spaces ADD COLUMN site_measurement_data jsonb;` |
| `client/src/pages/project-detail.tsx` | Remove yellow banner; stage-based canvas data routing; mount `SiteMeasurementPanel` when `stage === 'site_measurement'` |
| `client/src/stores/useCanvasStore.ts` | Accept `canvasSourceField` param; hydrate + save to correct field |
| `client/src/components/kitchen/SiteMeasurementPanel.tsx` **(new)** | Right sidebar component |
| `client/src/components/kitchen/ReferenceModal.tsx` **(new)** | Full-screen modal |
| `server/storage.ts` / `server/routes.ts` | Verify `PUT /api/spaces/:id` accepts `siteMeasurementData` in body (generic update already handles this if using Drizzle column passthrough) |

## 9. Testing checklist

**Schema + canvas routing**
- [ ] Fresh space in estimated_budget: draws walls, saves to `canvasData` (unchanged behavior)
- [ ] Advance to site_measurement: canvas goes **blank** (new blank siteMeasurementData)
- [ ] In site_measurement: draw walls → auto-save hits `siteMeasurementData`
- [ ] Switch back to estimated_budget stage: original walls return (canvasData intact)
- [ ] Reload page: site_measurement walls still there (persisted correctly)

**Yellow banner removal**
- [ ] No banner visible in site_measurement stage

**Reference thumbnail**
- [ ] Thumbnail shows reference image in right sidebar
- [ ] Click thumbnail → modal opens
- [ ] Modal shows full-size image
- [ ] Click outside image → modal closes
- [ ] Escape → modal closes
- [ ] X button → modal closes
- [ ] Empty state shows when no referenceImage

**Wall points list**
- [ ] Lists all wall_points for current space whose wall_id exists in current walls
- [ ] Orphan wall_points (wrong wall_id) are hidden
- [ ] Count `N` in heading matches list length
- [ ] Click `▼` expands entry
- [ ] Click `▲` collapses entry
- [ ] Multiple entries can be expanded simultaneously
- [ ] Expanded photo renders full-width
- [ ] Edit distance/height/note → Save writes via `onUpdateWallPoint`
- [ ] Delete removes the point from canvas AND list
- [ ] Keypad types into any focused field

**Existing on-canvas overlay**
- [ ] "Show ref" toggle (Eye) still works as before
- [ ] Overlay renders reference photo at 50% opacity over the blank site-measurement canvas

**Visibility rules**
- [ ] SiteMeasurementPanel hidden in estimated_budget and final stages
- [ ] PricingPanel hidden in site_measurement (existing behavior)

## 10. Out of scope

- Comparing estimated vs measured (diff view, overlay side-by-side)
- Re-taking wall-point photos from the sidebar (delete + re-add from canvas)
- Bulk delete / bulk edit of wall points
- Export PDF showing both canvases
- Notifying designer when technician finishes measurement

## 11. Risks

- **Orphan wall_points** from existing data: user may wonder why their old points disappeared. Expected, acceptable in dev. If this is an issue in production later, we can add a "legacy points" toggle.
- **jsonb column addition** requires running Drizzle migration before deploy. Document in deployment notes.
- **Switching stages mid-edit**: user draws walls in site_measurement, changes stage dropdown back to estimated_budget. The in-memory canvas state needs to re-hydrate from the correct field. Handled by `useEffect` on `[stage, activeSpaceId]` that re-reads from the store.
