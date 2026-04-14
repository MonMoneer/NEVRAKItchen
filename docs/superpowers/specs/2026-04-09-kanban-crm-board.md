# Kanban CRM Board — Design Spec

**Date:** 2026-04-09
**Status:** Approved for implementation
**Areas:** `client/src/pages/projects.tsx` (full rewrite), `shared/schema.ts`, `server/routes.ts`, `client/src/stores/useProjectStore.ts`, `client/src/pages/project-detail.tsx`

---

## 1. Problem

The current CRM is a flat card grid with 3 tab-based stage filters (Estimated Budget, Site Measurement, Final). This doesn't reflect the real 8-stage kitchen project pipeline, doesn't support drag-and-drop stage transitions, and doesn't allow quick project review without navigating away from the list.

## 2. Goal

Replace the flat grid with a Kanban board: 8 columns (one per pipeline stage), draggable project cards, slide-out detail panel, technician assignment, and file attachments.

## 3. Stages (8 columns)

| # | Stage ID | Column Label | Has Canvas? | Notes |
|---|---|---|---|---|
| 1 | `lead` | Lead | No | Entry point. "+ New" button here creates a new project. |
| 2 | `estimated_budget` | Est. Budget | Yes (`canvasData`) | Designer draws the estimate. |
| 3 | `site_measurement` | Site Meas. | Yes (`siteMeasurementData`) | Admin assigns technician. Technician draws actual measurements. Reference photo from estimate shown on right sidebar. |
| 4 | `50_payment` | 50% Payment | No | Status milestone. |
| 5 | `3d_design` | 3D Design | No | Upload PDF from external 3D software. |
| 6 | `manufacturing` | Manufacturing | No | Status milestone. |
| 7 | `delivered` | Delivered | No | Status milestone. |
| 8 | `100_payment` | 100% Payment | No | Status milestone. |

Replaces old 3-value `stage` column (`estimated_budget | site_measurement | final`).

Existing projects with `stage = "final"` will be migrated to `"delivered"` (closest match).

## 4. Kanban Board Layout

### 4.1 Columns
- 4-5 columns visible at a time, each ~200px wide.
- Remaining columns accessible via horizontal scroll.
- Each column header: stage label + card count badge (e.g., "Est. Budget (3)").
- Columns are vertically scrollable when cards overflow.

### 4.2 Cards (compact)
Each card displays:
- **Project name** (bold, truncated)
- **Client name** (muted text)
- **Space count** badge (e.g., "2 spaces")
- In `site_measurement` column and beyond: **assigned technician name** (if set)

Card dimensions: full column width, ~80px tall. Click → opens slide-out panel.

### 4.3 Drag-and-drop
- **Free drag**: any card can move to any column in any direction (no sequential restriction).
- Drop updates `saved_projects.stage` via `PUT /api/projects/:id`.
- Visual feedback: dragged card lifts with shadow, target column highlights with accent border.
- Library: `@dnd-kit/core` + `@dnd-kit/sortable`.
- Within a column, cards are ordered by `updatedAt` (most recent on top).

### 4.4 Header bar
- Left: "NIVRA Kitchens / Projects" breadcrumb.
- Right: search input (filters cards by name/phone across all columns), Admin button, user dropdown.
- No stage filter tabs (columns ARE the filters now).

## 5. Slide-out Panel

Opens from the right when a card is clicked. Width: 400px. Stays on Kanban page (no navigation). Overlay dims the board behind.

### 5.1 Panel contents (top to bottom)

```
[X close button]                              [stage badge]
Project Name (editable on click)
────────────────────────────────
Client: name
Phone: number
Email: email
Address: address
────────────────────────────────
ASSIGNED TO
[dropdown: list of technician-role users]
────────────────────────────────
SPACES
┌─ Kitchen ─────────────────────────────┐
│ [Est. Budget thumbnail] [Site Meas. thumbnail] │
│ Click to open designer →              │
└───────────────────────────────────────┘
┌─ Bathroom ────────────────────────────┐
│ [Est. Budget thumbnail] [Site Meas. thumbnail] │
│ Click to open designer →              │
└───────────────────────────────────────┘
────────────────────────────────
ATTACHMENTS
[Upload button]
[file1.pdf]  [delete]
[file2.pdf]  [delete]
────────────────────────────────
NOTES
[editable textarea, saves on blur]
────────────────────────────────
[Delete project button (destructive)]
```

### 5.2 Space thumbnails

Each space shows two thumbnail slots:
- **Estimated Budget**: reference photo (`space.referenceImage`) or a capture of `canvasData` if no reference yet.
- **Site Measurement**: capture of `siteMeasurementData` (if exists), else "Not started" placeholder.

Click either thumbnail → navigate to `/projects/:id` with the designer open on that space and the correct stage view.

### 5.3 Technician assignment

- Dropdown populated from `GET /api/users?role=technician`.
- Selecting a user sets `saved_projects.assigned_to` via `PUT /api/projects/:id`.
- Technician's view of the Kanban board shows only projects assigned to them (filtered server-side or client-side).

### 5.4 Attachments

- Upload button opens file picker (accept: PDF, images).
- Files stored as base64 in `project_attachments` table.
- Each attachment shows filename + delete button.
- Click filename → opens in new tab (data URL or blob URL).

### 5.5 Notes

- Editable textarea pre-filled with `saved_projects.notes`.
- Saves on blur via `PUT /api/projects/:id`.

## 6. Schema Changes

### 6.1 `saved_projects` table

```ts
// Existing column, expanded values:
stage: text("stage").notNull().default("lead"),
// OLD: "estimated_budget" | "site_measurement" | "final"
// NEW: "lead" | "estimated_budget" | "site_measurement" | "50_payment" | "3d_design" | "manufacturing" | "delivered" | "100_payment"

// New column:
assignedTo: integer("assigned_to").references(() => users.id),
```

### 6.2 New table: `project_attachments`

```ts
export const projectAttachments = pgTable("project_attachments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => savedProjects.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileData: text("file_data").notNull(), // base64 encoded
  fileType: text("file_type").notNull(), // MIME type
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

### 6.3 Migration

- Add `assigned_to` column to `saved_projects`: `ALTER TABLE saved_projects ADD COLUMN IF NOT EXISTS assigned_to integer REFERENCES users(id);`
- Create `project_attachments` table.
- Migrate existing `stage = 'final'` to `stage = 'delivered'`.
- Add to `runMigrations()` in `server/index.ts` (safe startup SQL, no Drizzle prompts).

### 6.4 TypeScript types

```ts
export type ProjectStage =
  | "lead"
  | "estimated_budget"
  | "site_measurement"
  | "50_payment"
  | "3d_design"
  | "manufacturing"
  | "delivered"
  | "100_payment";
```

## 7. API Changes

### 7.1 Existing routes (updated)

- `POST /api/projects` — default stage changes from `"estimated_budget"` to `"lead"`.
- `PUT /api/projects/:id` — accepts `assignedTo` field + new stage values.
- `GET /api/projects` — returns `assignedTo` field + joined user name for display.

### 7.2 New routes

- `GET /api/projects/:id/attachments` — list attachments for a project.
- `POST /api/projects/:id/attachments` — upload attachment (body: `{ fileName, fileData, fileType }`).
- `DELETE /api/attachments/:id` — delete an attachment.

## 8. Frontend Files

| File | Change |
|---|---|
| `client/src/pages/projects.tsx` | **Full rewrite**: Kanban board component with columns, cards, drag-and-drop, slide-out panel |
| `client/src/stores/useProjectStore.ts` | Updated `ProjectStage` type (8 values), `Project` interface adds `assignedTo`, attachment methods |
| `client/src/pages/project-detail.tsx` | Update stage checks: old `"final"` references → `"delivered"` or handle all 8 stages. Remove "Send to Measurement" / "Mark as Final" buttons (stage transitions happen via Kanban drag now). |
| `shared/schema.ts` | New stages, `assignedTo` column, `projectAttachments` table |
| `server/routes.ts` | Attachment CRUD, updated stage validation, return assigned user info |
| `server/storage.ts` | Attachment storage methods |
| `server/index.ts` | Add migration SQL to `runMigrations()` |
| New dependency | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` |

## 9. What Stays the Same

- Project detail page (designer canvas) — unchanged.
- All canvas/drawing functionality — unchanged.
- Site measurement panel (right sidebar with reference + wall points) — unchanged.
- Keypad, toolbar accordion, shift-ortho — unchanged.
- Login/auth system — unchanged.
- Admin panel — unchanged.

## 10. project-detail.tsx Stage Transition Changes

Currently the project-detail page has "Send to Measurement" and "Mark as Final" buttons that change stage. With the Kanban board, stage transitions happen via drag-and-drop on the board.

**In project-detail.tsx:**
- Remove "Send to Measurement" button. The reference photo capture moves to: when a project is dragged FROM `estimated_budget` TO `site_measurement` on the board, the board triggers reference capture for all spaces.
- Remove "Mark as Final" button.
- Keep the stage display label in the header (read-only).

**Reference photo capture on stage transition**: When a card is dragged from `estimated_budget` to any later stage, the board calls `PUT /api/spaces/:id/reference` for each space that doesn't have a reference image yet. This requires opening the canvas briefly to capture — OR we pre-capture on every save (simpler). Decision: **pre-capture on every canvas save** by generating a thumbnail and storing it as `referenceImage`. This way the reference is always fresh and available when the card is dragged.

## 11. Technician View

When a user with role `technician` logs in:
- Kanban board shows only projects where `assignedTo = currentUser.id`.
- All 8 columns are visible but only assigned projects appear as cards.
- Technician can open slide-out panel, click spaces, and enter the site_measurement designer.
- Technician CANNOT drag cards between columns (read-only stage for technicians).

## 12. Testing Checklist

**Kanban board**
- [ ] 8 columns render with correct labels and card counts
- [ ] Horizontal scroll works to reach columns 5-8
- [ ] Cards show project name, client name, space count
- [ ] Cards are draggable between columns
- [ ] Drop updates stage in DB (verify via API)
- [ ] Drag from any column to any other column works (free drag)
- [ ] Card order within column: most recent first
- [ ] Search filters cards across all columns by name/phone

**Slide-out panel**
- [ ] Click card → panel opens from right
- [ ] Close button / click outside → panel closes
- [ ] Project info displays correctly
- [ ] Technician dropdown shows technician-role users
- [ ] Assigning technician saves to DB
- [ ] Space thumbnails show estimated + site measurement
- [ ] Click thumbnail → navigates to designer on correct space
- [ ] Upload attachment → file appears in list
- [ ] Delete attachment → removed
- [ ] Click attachment → opens in new tab
- [ ] Notes editable, saves on blur
- [ ] Delete project → removes card from board

**Schema migration**
- [ ] `assigned_to` column added to saved_projects
- [ ] `project_attachments` table created
- [ ] Existing `stage = 'final'` migrated to `'delivered'`
- [ ] New projects default to `stage = 'lead'`

**Technician view**
- [ ] Technician sees only assigned projects
- [ ] Technician cannot drag cards
- [ ] Technician can open panel and access designer

**Backward compatibility**
- [ ] Existing projects load correctly
- [ ] Project detail page works with all 8 stages
- [ ] Site measurement canvas separation still works

## 13. Out of Scope

- Notifications for technician assignment
- Activity log / audit trail on stage changes
- Kanban column reordering (columns are fixed pipeline order)
- Card priority / ordering within column (uses updatedAt only)
- Multiple technician assignment per project
- File storage on cloud/disk (base64 for now)
- Tablet touch drag-and-drop optimization (mouse drag first)

## 14. Risks

- **Large projects.tsx rewrite**: the existing 347-line file is fully replaced. If anything references the old component externally, it breaks. Mitigated: the page is self-contained, imported only via lazy() in App.tsx.
- **Stage migration for existing data**: projects with `stage = 'final'` become `'delivered'`. If any code still checks for `"final"`, it breaks. Mitigated: grep all references to `"final"` and update them.
- **Reference photo capture on save**: generating a canvas snapshot on every save adds CPU cost. Mitigated: debounced (already 1.5s), and `toDataURL` is fast for small canvases.
- **@dnd-kit bundle size**: adds ~15-20KB gzipped. Acceptable for the functionality gained.
