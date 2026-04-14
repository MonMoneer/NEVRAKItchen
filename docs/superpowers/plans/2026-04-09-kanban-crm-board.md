# Kanban CRM Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat CRM card grid with a Kanban pipeline board: 8 columns, draggable cards, slide-out detail panel, technician assignment, file attachments.

**Architecture:** Schema-first approach: add new stages + columns + tables, then build the Kanban UI from scratch (full rewrite of `projects.tsx`). The slide-out panel is a new component. Drag-and-drop uses `@dnd-kit`. All existing canvas/designer functionality is untouched.

**Tech Stack:** React + TypeScript, @dnd-kit/core + @dnd-kit/sortable, Zustand, Drizzle ORM, Express 5, PostgreSQL.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `shared/schema.ts` | Modify | Add `assignedTo` column, `projectAttachments` table, update stage comment |
| `server/index.ts` | Modify | Add migration SQL for new column + table + stage rename |
| `server/storage.ts` | Modify | Add attachment CRUD methods, update interface |
| `server/routes.ts` | Modify | Add attachment routes, update project create default stage |
| `client/src/stores/useProjectStore.ts` | Modify | Update `ProjectStage` type, `Project` interface |
| `client/src/pages/projects.tsx` | **Full rewrite** | Kanban board: columns, cards, drag-drop, search, header |
| `client/src/components/crm/SlideOutPanel.tsx` | **Create** | Project detail slide-out: spaces, assignment, attachments, notes |
| `client/src/components/crm/KanbanCard.tsx` | **Create** | Compact draggable project card |
| `client/src/components/crm/KanbanColumn.tsx` | **Create** | Single pipeline column with droppable area |
| `client/src/components/crm/NewProjectDialog.tsx` | **Create** | Extracted from current projects.tsx (exists inline, moved to own file) |
| `client/src/pages/project-detail.tsx` | Modify | Update stage references: `"final"` → `"delivered"`, remove stage-transition buttons |

---

### Task 1: Install @dnd-kit

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Verify installation**

```bash
ls node_modules/@dnd-kit/core/package.json && echo "OK"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @dnd-kit for Kanban drag-and-drop"
```

---

### Task 2: Schema + Migration — new stages, assignedTo, attachments table

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/index.ts`
- Modify: `server/storage.ts`
- Modify: `server/routes.ts`

- [ ] **Step 1: Update schema — add assignedTo + projectAttachments**

In `shared/schema.ts`, add `assignedTo` to `savedProjects` table and create the `projectAttachments` table.

```ts
// In savedProjects table definition, after the `updatedAt` field, add:
  assignedTo: integer("assigned_to").references(() => users.id),
```

```ts
// After the wallPoints table definition, add:

// ─── Project attachments (PDFs, images uploaded per project) ────────────────

export const projectAttachments = pgTable("project_attachments", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => savedProjects.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileData: text("file_data").notNull(),
  fileType: text("file_type").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Add insert schema + type exports at the bottom with the others:
export const insertProjectAttachmentSchema = createInsertSchema(projectAttachments).omit({ id: true, createdAt: true });
export type ProjectAttachment = typeof projectAttachments.$inferSelect;
export type InsertProjectAttachment = typeof projectAttachments.$inferInsert;
```

Update the stage comment on `savedProjects`:
```ts
  stage: text("stage").notNull().default("lead"),
  // lead | estimated_budget | site_measurement | 50_payment | 3d_design | manufacturing | delivered | 100_payment
```

- [ ] **Step 2: Update runMigrations in server/index.ts**

```ts
async function runMigrations() {
  try {
    await pool.query(`ALTER TABLE spaces ADD COLUMN IF NOT EXISTS site_measurement_data jsonb`);
    await pool.query(`ALTER TABLE saved_projects ADD COLUMN IF NOT EXISTS assigned_to integer REFERENCES users(id)`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_attachments (
        id serial PRIMARY KEY,
        project_id integer NOT NULL REFERENCES saved_projects(id) ON DELETE CASCADE,
        file_name text NOT NULL,
        file_data text NOT NULL,
        file_type text NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`UPDATE saved_projects SET stage = 'delivered' WHERE stage = 'final'`);
  } catch (err: any) {
    console.error("[migration] failed:", err.message);
  }
}
```

- [ ] **Step 3: Add attachment storage methods in server/storage.ts**

Add to the `IStorage` interface:
```ts
  // Attachments
  getAttachments(projectId: number): Promise<ProjectAttachment[]>;
  createAttachment(attachment: InsertProjectAttachment): Promise<ProjectAttachment>;
  deleteAttachment(id: number): Promise<boolean>;
```

Add imports at the top:
```ts
import {
  // ... existing imports ...
  type ProjectAttachment, type InsertProjectAttachment,
  projectAttachments,
} from "@shared/schema";
```

Add implementations in the `DatabaseStorage` class:
```ts
  async getAttachments(projectId: number): Promise<ProjectAttachment[]> {
    return db.select().from(projectAttachments).where(eq(projectAttachments.projectId, projectId)).orderBy(desc(projectAttachments.createdAt));
  }

  async createAttachment(attachment: InsertProjectAttachment): Promise<ProjectAttachment> {
    const [created] = await db.insert(projectAttachments).values(attachment).returning();
    return created;
  }

  async deleteAttachment(id: number): Promise<boolean> {
    const [deleted] = await db.delete(projectAttachments).where(eq(projectAttachments.id, id)).returning();
    return !!deleted;
  }
```

- [ ] **Step 4: Add attachment routes in server/routes.ts**

Add import for `insertProjectAttachmentSchema` at the top.

Add routes after the existing wall-points routes:
```ts
  // ── Attachments ──────────────────────────────────────────────────────────

  app.get("/api/projects/:projectId/attachments", async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });
    const attachments = await storage.getAttachments(projectId);
    res.json(attachments);
  });

  app.post("/api/projects/:projectId/attachments", async (req, res) => {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: "Invalid projectId" });
    const parsed = insertProjectAttachmentSchema.safeParse({ ...req.body, projectId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const attachment = await storage.createAttachment(parsed.data);
    res.status(201).json(attachment);
  });

  app.delete("/api/attachments/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const deleted = await storage.deleteAttachment(id);
    if (!deleted) return res.status(404).json({ error: "Attachment not found" });
    res.json({ success: true });
  });
```

Also update the default stage in `POST /api/projects`: change `stage: "estimated_budget"` default to `stage: "lead"` in the create handler (or let the schema default handle it — the schema default is now `"lead"`).

- [ ] **Step 5: Run migration locally**

```bash
npx tsx --env-file=.env -e "
const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  await pool.query('ALTER TABLE saved_projects ADD COLUMN IF NOT EXISTS assigned_to integer REFERENCES users(id)');
  await pool.query(\`CREATE TABLE IF NOT EXISTS project_attachments (
    id serial PRIMARY KEY, project_id integer NOT NULL REFERENCES saved_projects(id) ON DELETE CASCADE,
    file_name text NOT NULL, file_data text NOT NULL, file_type text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now())\`);
  await pool.query(\"UPDATE saved_projects SET stage = 'delivered' WHERE stage = 'final'\");
  console.log('Migration done');
  pool.end();
}
run();
"
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: exit 0

- [ ] **Step 7: Commit**

```bash
git add shared/schema.ts server/index.ts server/storage.ts server/routes.ts
git commit -m "feat: schema for Kanban CRM — 8 stages, assignedTo, attachments table"
```

---

### Task 3: Update ProjectStore types

**Files:**
- Modify: `client/src/stores/useProjectStore.ts`

- [ ] **Step 1: Update ProjectStage type and Project interface**

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

export interface Project {
  id: number;
  name: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  stage: ProjectStage;
  notes: string;
  selectedFinishing: string | null;
  assignedTo: number | null;
  createdAt: string;
  updatedAt: string;
  spaceCount?: number;
  spaces?: ProjectSpace[];
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: may show errors in `project-detail.tsx` referencing `"final"` — that's expected and fixed in Task 7.

- [ ] **Step 3: Commit**

```bash
git add client/src/stores/useProjectStore.ts
git commit -m "feat: update ProjectStage type to 8 pipeline stages"
```

---

### Task 4: Create KanbanCard component

**Files:**
- Create: `client/src/components/crm/KanbanCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Project } from "@/stores/useProjectStore";

interface KanbanCardProps {
  project: Project;
  onClick: (project: Project) => void;
}

export function KanbanCard({ project, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id, data: { project } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick(project)}
      className={`bg-card border border-border rounded-lg px-3 py-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md transition-shadow ${
        isDragging ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="font-medium text-sm truncate">{project.name}</div>
      {project.clientName && (
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          {project.clientName}
        </div>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
          {project.spaceCount ?? 0} spaces
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/crm/KanbanCard.tsx
git commit -m "feat: KanbanCard component — compact draggable project card"
```

---

### Task 5: Create KanbanColumn component

**Files:**
- Create: `client/src/components/crm/KanbanColumn.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Project } from "@/stores/useProjectStore";
import type { ProjectStage } from "@/stores/useProjectStore";
import { KanbanCard } from "./KanbanCard";
import { Plus } from "lucide-react";

interface KanbanColumnProps {
  stageId: ProjectStage;
  label: string;
  color: string;
  projects: Project[];
  onCardClick: (project: Project) => void;
  onAddNew?: () => void;
}

export function KanbanColumn({
  stageId,
  label,
  color,
  projects,
  onCardClick,
  onAddNew,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });

  return (
    <div
      className={`flex flex-col w-[220px] min-w-[220px] shrink-0 bg-muted/30 rounded-xl border transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-transparent"
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
            {label}
          </span>
        </div>
        <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
          {projects.length}
        </span>
      </div>

      {/* Add button (Lead column only) */}
      {onAddNew && (
        <div className="px-2 pb-1">
          <button
            onClick={onAddNew}
            className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New project
          </button>
        </div>
      )}

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[100px]"
      >
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {projects.map((project) => (
            <KanbanCard
              key={project.id}
              project={project}
              onClick={onCardClick}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/crm/KanbanColumn.tsx
git commit -m "feat: KanbanColumn component — droppable pipeline column"
```

---

### Task 6: Create SlideOutPanel component

**Files:**
- Create: `client/src/components/crm/SlideOutPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { X, Upload, Trash2, FileText, ImageOff } from "lucide-react";
import type { Project, ProjectSpace } from "@/stores/useProjectStore";
import { Button } from "@/components/ui/button";

interface SlideOutPanelProps {
  project: Project;
  open: boolean;
  onClose: () => void;
  onUpdateProject: (id: number, updates: Partial<Project>) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  technicians: { id: number; username: string }[];
}

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  estimated_budget: "Est. Budget",
  site_measurement: "Site Meas.",
  "50_payment": "50% Payment",
  "3d_design": "3D Design",
  manufacturing: "Manufacturing",
  delivered: "Delivered",
  "100_payment": "100% Payment",
};

const STAGE_COLORS: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700",
  estimated_budget: "bg-blue-100 text-blue-700",
  site_measurement: "bg-yellow-100 text-yellow-700",
  "50_payment": "bg-orange-100 text-orange-700",
  "3d_design": "bg-purple-100 text-purple-700",
  manufacturing: "bg-indigo-100 text-indigo-700",
  delivered: "bg-green-100 text-green-700",
  "100_payment": "bg-emerald-100 text-emerald-700",
};

interface Attachment {
  id: number;
  fileName: string;
  fileData: string;
  fileType: string;
}

export function SlideOutPanel({
  project,
  open,
  onClose,
  onUpdateProject,
  onDeleteProject,
  technicians,
}: SlideOutPanelProps) {
  const [, navigate] = useLocation();
  const [notes, setNotes] = useState(project.notes);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [spaces, setSpaces] = useState<ProjectSpace[]>([]);

  // Load spaces + attachments when panel opens
  useEffect(() => {
    if (!open) return;
    setNotes(project.notes);
    fetch(`/api/projects/${project.id}`)
      .then((r) => r.json())
      .then((data) => setSpaces(data.spaces ?? []));
    fetch(`/api/projects/${project.id}/attachments`)
      .then((r) => r.json())
      .then((data) => setAttachments(data))
      .catch(() => setAttachments([]));
  }, [open, project.id, project.notes]);

  const handleNotesBlur = useCallback(() => {
    if (notes !== project.notes) {
      onUpdateProject(project.id, { notes } as any);
    }
  }, [notes, project.id, project.notes, onUpdateProject]);

  const handleAssign = useCallback(
    (userId: number | null) => {
      onUpdateProject(project.id, { assignedTo: userId } as any);
    },
    [project.id, onUpdateProject]
  );

  const handleUpload = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result as string;
        const res = await fetch(`/api/projects/${project.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileData: base64,
            fileType: file.type,
          }),
        });
        if (res.ok) {
          const att = await res.json();
          setAttachments((prev) => [att, ...prev]);
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [project.id]);

  const handleDeleteAttachment = useCallback(async (attId: number) => {
    await fetch(`/api/attachments/${attId}`, { method: "DELETE" });
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
  }, []);

  const handleDeleteProject = useCallback(async () => {
    if (!confirm(`Delete project "${project.name}"? This cannot be undone.`)) return;
    await onDeleteProject(project.id);
    onClose();
  }, [project.id, project.name, onDeleteProject, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[400px] bg-background border-l border-border shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold truncate">{project.name}</h2>
          </div>
          <div className="flex items-center gap-2 ml-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                STAGE_COLORS[project.stage] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {STAGE_LABELS[project.stage] ?? project.stage}
            </span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-accent rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Contact info */}
          <div className="space-y-1 text-sm">
            {project.clientName && (
              <div>
                <span className="text-muted-foreground">Client:</span>{" "}
                {project.clientName}
              </div>
            )}
            {project.clientPhone && (
              <div>
                <span className="text-muted-foreground">Phone:</span>{" "}
                {project.clientPhone}
              </div>
            )}
            {project.clientEmail && (
              <div>
                <span className="text-muted-foreground">Email:</span>{" "}
                {project.clientEmail}
              </div>
            )}
            {project.address && (
              <div>
                <span className="text-muted-foreground">Address:</span>{" "}
                {project.address}
              </div>
            )}
          </div>

          {/* Assign technician */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Assigned To
            </label>
            <select
              className="w-full mt-1 h-8 px-2 text-sm border border-border rounded-md bg-background"
              value={project.assignedTo ?? ""}
              onChange={(e) =>
                handleAssign(e.target.value ? parseInt(e.target.value) : null)
              }
            >
              <option value="">Unassigned</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.username}
                </option>
              ))}
            </select>
          </div>

          {/* Spaces */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Spaces ({spaces.length})
            </label>
            <div className="mt-1 space-y-2">
              {spaces.map((space) => (
                <div
                  key={space.id}
                  className="border border-border rounded-md p-2"
                >
                  <div className="text-sm font-medium mb-1.5">{space.name}</div>
                  <div className="flex gap-2">
                    {/* Estimated Budget thumbnail */}
                    <button
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="flex-1 border border-border rounded overflow-hidden h-20 bg-muted/20 hover:border-primary transition-colors"
                      title="Open estimated budget"
                    >
                      {space.referenceImage ? (
                        <img
                          src={space.referenceImage}
                          alt="Estimated"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                          <ImageOff className="w-4 h-4" />
                          <span className="text-[9px] mt-0.5">Est. Budget</span>
                        </div>
                      )}
                    </button>

                    {/* Site Measurement thumbnail */}
                    <button
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="flex-1 border border-border rounded overflow-hidden h-20 bg-muted/20 hover:border-primary transition-colors"
                      title="Open site measurement"
                    >
                      <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        <ImageOff className="w-4 h-4" />
                        <span className="text-[9px] mt-0.5">Site Meas.</span>
                      </div>
                    </button>
                  </div>
                </div>
              ))}
              {spaces.length === 0 && (
                <p className="text-xs text-muted-foreground">No spaces yet</p>
              )}
            </div>
          </div>

          {/* Attachments */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Attachments
              </label>
              <button
                onClick={handleUpload}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
              >
                <Upload className="w-3 h-3" />
                Upload
              </button>
            </div>
            <div className="mt-1 space-y-1">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-2 py-1.5 border border-border rounded-md text-xs"
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={att.fileData}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 truncate hover:underline"
                  >
                    {att.fileName}
                  </a>
                  <button
                    onClick={() => handleDeleteAttachment(att.id)}
                    className="text-red-500 hover:text-red-700 p-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {attachments.length === 0 && (
                <p className="text-xs text-muted-foreground">No attachments</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              className="w-full mt-1 px-2 py-1.5 text-sm border border-border rounded-md bg-background resize-y min-h-[80px] outline-none focus:border-primary"
              placeholder="Add notes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0 flex items-center justify-between">
          <button
            onClick={handleDeleteProject}
            className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            Delete project
          </button>
          <Button
            size="sm"
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            Open Designer
          </Button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/crm/SlideOutPanel.tsx
git commit -m "feat: SlideOutPanel — project detail panel with spaces, attachments, notes"
```

---

### Task 7: Rewrite projects.tsx as Kanban board

**Files:**
- Modify: `client/src/pages/projects.tsx` (full rewrite)

- [ ] **Step 1: Full rewrite of projects.tsx**

```tsx
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/stores/useAuthStore";
import { useProjectStore, type Project, type ProjectStage } from "@/stores/useProjectStore";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, LogOut, Settings, ChevronDown } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { KanbanColumn } from "@/components/crm/KanbanColumn";
import { KanbanCard } from "@/components/crm/KanbanCard";
import { SlideOutPanel } from "@/components/crm/SlideOutPanel";

const PIPELINE: { id: ProjectStage; label: string; color: string }[] = [
  { id: "lead", label: "Lead", color: "bg-gray-400" },
  { id: "estimated_budget", label: "Est. Budget", color: "bg-blue-400" },
  { id: "site_measurement", label: "Site Meas.", color: "bg-yellow-400" },
  { id: "50_payment", label: "50% Payment", color: "bg-orange-400" },
  { id: "3d_design", label: "3D Design", color: "bg-purple-400" },
  { id: "manufacturing", label: "Manufacturing", color: "bg-indigo-400" },
  { id: "delivered", label: "Delivered", color: "bg-green-400" },
  { id: "100_payment", label: "100% Payment", color: "bg-emerald-400" },
];

export default function Projects() {
  const { user, logout } = useAuthStore();
  const { projects, setProjects, removeProject } = useProjectStore();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeCard, setActiveCard] = useState<Project | null>(null);
  const [technicians, setTechnicians] = useState<{ id: number; username: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // DnD sensors — require 8px drag distance to distinguish from clicks
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Load projects + technicians
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data))
      .finally(() => setIsLoading(false));
    fetch("/api/users")
      .then((r) => r.json())
      .then((data) =>
        setTechnicians(
          data.filter((u: any) => u.role === "technician").map((u: any) => ({ id: u.id, username: u.username }))
        )
      )
      .catch(() => {});
  }, [setProjects]);

  // Filter by search
  const filtered = search
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.clientName?.toLowerCase().includes(search.toLowerCase()) ||
          p.clientPhone?.includes(search)
      )
    : projects;

  // Filter by technician role — technicians see only their assigned projects
  const isTechnician = user?.role === "technician";
  const visible = isTechnician
    ? filtered.filter((p) => p.assignedTo === user?.id)
    : filtered;

  // Group by stage
  const byStage = (stageId: ProjectStage) =>
    visible
      .filter((p) => p.stage === stageId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Drag handlers
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (isTechnician) return; // technicians can't drag
      const project = event.active.data.current?.project as Project | undefined;
      if (project) setActiveCard(project);
    },
    [isTechnician]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCard(null);
      if (isTechnician) return;
      const { active, over } = event;
      if (!over) return;

      const project = active.data.current?.project as Project | undefined;
      const targetStage = over.id as ProjectStage;
      if (!project || project.stage === targetStage) return;

      // Optimistic update
      const oldStage = project.stage;
      const updated = { ...project, stage: targetStage };
      setProjects(
        projects.map((p) => (p.id === project.id ? updated : p))
      );

      // Persist
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!res.ok) {
        // Revert on failure
        setProjects(
          projects.map((p) => (p.id === project.id ? { ...project, stage: oldStage } : p))
        );
      }
    },
    [projects, setProjects, isTechnician]
  );

  // Create project
  const handleCreate = useCallback(
    async (data: {
      name: string;
      clientName: string;
      clientPhone: string;
      clientEmail: string;
      address: string;
    }) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const project = await res.json();
        setProjects([project, ...projects]);
        setNewOpen(false);
      }
    },
    [projects, setProjects]
  );

  const handleUpdateProject = useCallback(
    async (id: number, updates: Partial<Project>) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const updated = await res.json();
        setProjects(projects.map((p) => (p.id === id ? { ...p, ...updated } : p)));
        if (selectedProject?.id === id) {
          setSelectedProject({ ...selectedProject, ...updated });
        }
      }
    },
    [projects, setProjects, selectedProject]
  );

  const handleDeleteProject = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (res.ok) {
        removeProject(id);
      }
    },
    [removeProject]
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-card">
        <div className="text-sm font-semibold">NIVRA Kitchens / Projects</div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone..."
              className="pl-9 h-8 w-56 text-sm"
            />
          </div>
          {user?.role === "admin" && (
            <button
              onClick={() => navigate("/admin")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Settings className="w-4 h-4" />
              Admin
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {user?.username}
              <ChevronDown className="w-3 h-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={logout}>
                <LogOut className="w-3.5 h-3.5 mr-2" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 h-full">
            {PIPELINE.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stageId={stage.id}
                label={stage.label}
                color={stage.color}
                projects={byStage(stage.id)}
                onCardClick={(p) => setSelectedProject(p)}
                onAddNew={stage.id === "lead" ? () => setNewOpen(true) : undefined}
              />
            ))}
          </div>

          {/* Drag overlay — renders the card being dragged above everything */}
          <DragOverlay>
            {activeCard ? (
              <div className="opacity-90 rotate-2">
                <KanbanCard project={activeCard} onClick={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* New Project Dialog */}
      <NewProjectDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={handleCreate}
      />

      {/* Slide-out panel */}
      {selectedProject && (
        <SlideOutPanel
          project={selectedProject}
          open={!!selectedProject}
          onClose={() => setSelectedProject(null)}
          onUpdateProject={handleUpdateProject}
          onDeleteProject={handleDeleteProject}
          technicians={technicians}
        />
      )}
    </div>
  );
}

// ─── New Project Dialog ──────────────────────────────────────────────────────

function NewProjectDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    name: string;
    clientName: string;
    clientPhone: string;
    clientEmail: string;
    address: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [address, setAddress] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate({ name, clientName, clientPhone, clientEmail, address });
    setName("");
    setClientName("");
    setClientPhone("");
    setClientEmail("");
    setAddress("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Project name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Client name</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Build check**

```bash
npx vite build --mode development
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/projects.tsx
git commit -m "feat: Kanban CRM board — 8-column pipeline with drag-and-drop"
```

---

### Task 8: Update project-detail.tsx — remove stage buttons, fix "final" references

**Files:**
- Modify: `client/src/pages/project-detail.tsx`

- [ ] **Step 1: Update STAGE_LABELS**

Find the `STAGE_LABELS` object and replace with the 8-stage version:

```ts
const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead',
  estimated_budget: 'Estimated Budget',
  site_measurement: 'Site Measurement',
  '50_payment': '50% Payment',
  '3d_design': '3D Design',
  manufacturing: 'Manufacturing',
  delivered: 'Delivered',
  '100_payment': '100% Payment',
};
```

- [ ] **Step 2: Remove "Send to Measurement" and "Mark as Final" buttons**

Find and remove these two button blocks in the header (they reference `handleAdvanceToMeasurement` and `handleAdvanceToFinal`). Stage transitions now happen via Kanban drag.

Keep the `handleAdvanceToMeasurement` function itself — it captures the reference image. Move the reference-capture logic to a separate `useEffect` that triggers when `stage` transitions FROM `estimated_budget` to any later stage. Or simpler: remove these handlers entirely and let the reference image be captured on canvas save (already debounced).

- [ ] **Step 3: Replace `'final'` references**

Search for `'final'` and replace:
- `stage === 'final'` → `stage === 'delivered'` (for read-only display logic)
- `stage: 'final'` in JSON bodies → remove (no longer sent from this page)

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Build check**

```bash
npx vite build --mode development
```

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/project-detail.tsx
git commit -m "feat: update project-detail for 8-stage pipeline, remove stage-transition buttons"
```

---

### Task 9: Final integration test + deploy

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Full build**

```bash
npx vite build --mode development
```

- [ ] **Step 3: Manual smoke test**

1. Load `/projects` → 8-column Kanban board visible
2. Click "+ New project" in Lead column → dialog opens, create project → card appears in Lead
3. Drag card from Lead to Est. Budget → stage updates
4. Click a card → slide-out panel opens with project info, spaces, attachments
5. Upload a PDF → appears in attachments list
6. Click "Open Designer" → navigates to project-detail page
7. Draw walls → auto-save works
8. Go back to `/projects` → card still in correct column
9. Login as technician → only sees assigned projects, cannot drag cards

- [ ] **Step 4: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: Kanban CRM board — complete implementation"
```

- [ ] **Step 5: Push to deploy**

```bash
git push origin main
```

Railway auto-deploys. The `runMigrations()` function in `server/index.ts` handles the DB schema changes on startup.
