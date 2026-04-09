import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useAuthStore } from "@/stores/useAuthStore";
import { useProjectStore, type Project, type ProjectStage } from "@/stores/useProjectStore";
import { KanbanColumn } from "@/components/crm/KanbanColumn";
import { KanbanCard } from "@/components/crm/KanbanCard";
import { SlideOutPanel } from "@/components/crm/SlideOutPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, LogOut, Settings, ChevronDown } from "lucide-react";

// ─── Pipeline config ──────────────────────────────────────────────────────────

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

// ─── New Project Dialog ───────────────────────────────────────────────────────

function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setName("");
    setClientName("");
    setClientPhone("");
    setClientEmail("");
    setAddress("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, clientName, clientPhone, clientEmail, address }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create project");
        return;
      }

      const project = await res.json();
      onCreated(project);
      onOpenChange(false);
      reset();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Project name *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Al Barsha Villa Kitchen"
              required
            />
          </div>
          <div className="space-y-1">
            <Label>Client name</Label>
            <Input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Full name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+971 50 …"
              />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="…@gmail.com"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Villa / flat address"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Projects() {
  const [, navigate] = useLocation();
  const { user, logout } = useAuthStore();
  const { projects, setProjects, upsertProject, removeProject } = useProjectStore();

  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [technicians, setTechnicians] = useState<{ id: number; username: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [activeDragProject, setActiveDragProject] = useState<Project | null>(null);

  // Load projects and technicians on mount
  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()).catch(() => []),
    ]).then(([projectData, userData]) => {
      setProjects(Array.isArray(projectData) ? projectData : []);
      const techList = Array.isArray(userData)
        ? userData.filter((u: { role: string }) => u.role === "technician")
        : [];
      setTechnicians(techList);
    }).finally(() => setIsLoading(false));
  }, [setProjects]);

  // Sensors: 8px activation distance to distinguish click from drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Filter projects for technician role
  const visibleProjects = user?.role === "technician"
    ? projects.filter((p) => p.assignedTo === user.id)
    : projects;

  // Apply search filter
  const filteredProjects = visibleProjects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.clientName ?? "").toLowerCase().includes(q) ||
      (p.clientPhone ?? "").includes(q)
    );
  });

  // Group projects by stage, sorted by updatedAt descending
  const projectsByStage = (stageId: ProjectStage) =>
    filteredProjects
      .filter((p) => p.stage === stageId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleDragStart = (event: DragStartEvent) => {
    // Technicians cannot drag
    if (user?.role === "technician") return;
    const project = projects.find((p) => p.id === event.active.id);
    if (project) setActiveDragProject(project);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragProject(null);

    if (user?.role === "technician") return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // `over.id` is the droppable column stageId
    const newStage = over.id as ProjectStage;
    const project = projects.find((p) => p.id === active.id);
    if (!project || project.stage === newStage) return;

    // Optimistic update
    const previousProjects = [...projects];
    upsertProject({ ...project, stage: newStage });

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) throw new Error("Failed to update stage");
      const updated = await res.json();
      upsertProject(updated);
      // Update selected project if it's the one being dragged
      if (selectedProject?.id === project.id) {
        setSelectedProject(updated);
      }
    } catch {
      // Rollback on failure
      setProjects(previousProjects);
    }
  };

  const handleUpdateProject = async (id: number, updates: Partial<Project>) => {
    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      upsertProject(updated);
      if (selectedProject?.id === id) {
        setSelectedProject(updated);
      }
    }
  };

  const handleDeleteProject = async (id: number) => {
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) {
      removeProject(id);
      setSelectedProject(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">NIVRA Kitchens</span>
          <span className="text-muted-foreground text-sm">/ Projects</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>

          {user?.role === "admin" && (
            <Button variant="ghost" size="sm" onClick={() => navigate("/admin")}>
              <Settings className="h-4 w-4 mr-1" />
              Admin
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                {user?.username}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Board */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-x-auto px-4 py-4">
            <div className="flex gap-3 h-full min-w-max">
              {PIPELINE.map((col) => (
                <KanbanColumn
                  key={col.id}
                  stageId={col.id}
                  label={col.label}
                  color={col.color}
                  projects={projectsByStage(col.id)}
                  onCardClick={(project) => setSelectedProject(project)}
                  onAddNew={col.id === "lead" ? () => setNewOpen(true) : undefined}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeDragProject ? (
              <div className="opacity-90 rotate-1">
                <KanbanCard
                  project={activeDragProject}
                  onClick={() => {}}
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

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

      {/* New project dialog */}
      <NewProjectDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(project) => {
          upsertProject(project);
          navigate(`/projects/${project.id}`);
        }}
      />
    </div>
  );
}
