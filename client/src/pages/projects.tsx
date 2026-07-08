import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/stores/useAuthStore";
import { useProjectStore, type Project } from "@/stores/useProjectStore";
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
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, LogOut, Settings, ChevronDown, Plus, FolderOpen, CalendarClock } from "lucide-react";

const STAGES = [
  { id: "estimated_price", label: "Estimated Price", color: "bg-blue-100 text-blue-700" },
  { id: "site_measurement", label: "Site Measurement", color: "bg-yellow-100 text-yellow-700" },
] as const;

function stageLabel(stage: string) {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}
function stageColor(stage: string) {
  return STAGES.find((s) => s.id === stage)?.color ?? "bg-gray-100 text-gray-600";
}

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
  const { projects, setProjects, upsertProject } = useProjectStore();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .finally(() => setIsLoading(false));
  }, [setProjects]);

  const visibleProjects = user?.role === "technician"
    ? projects.filter((p) => p.assignedTo === user.id)
    : projects;

  const filteredProjects = visibleProjects
    .filter((p) => {
      if (stageFilter && p.stage !== stageFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.clientName ?? "").toLowerCase().includes(q) ||
        (p.clientPhone ?? "").includes(q)
      );
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const handleLogout = async () => {
    await logout();
    navigate("/login");
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

          {user?.role === "admin" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open("/schedule-builder", "_blank", "noopener,noreferrer")}
            >
              <CalendarClock className="h-4 w-4 mr-1" />
              Schedule Builder
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

      {/* Toolbar: stage filter + new project */}
      <div className="px-6 py-3 flex items-center gap-2 border-b bg-white">
        <Button
          size="sm"
          variant={stageFilter === null ? "default" : "outline"}
          onClick={() => setStageFilter(null)}
        >
          All ({visibleProjects.length})
        </Button>
        {STAGES.map((s) => {
          const count = visibleProjects.filter((p) => p.stage === s.id).length;
          return (
            <Button
              key={s.id}
              size="sm"
              variant={stageFilter === s.id ? "default" : "outline"}
              onClick={() => setStageFilter(stageFilter === s.id ? null : s.id)}
            >
              {s.label} ({count})
            </Button>
          );
        })}
        <div className="flex-1" />
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Project
        </Button>
      </div>

      {/* Project list */}
      <div className="flex-1 px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FolderOpen className="h-10 w-10 mb-2 opacity-40" />
            <p className="text-sm">No projects found</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border divide-y">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{project.name}</p>
                  {project.clientName && (
                    <p className="text-xs text-muted-foreground truncate">{project.clientName}</p>
                  )}
                </div>
                {project.clientPhone && (
                  <span className="text-xs text-muted-foreground hidden sm:block">{project.clientPhone}</span>
                )}
                <Badge variant="secondary" className={`text-xs ${stageColor(project.stage)}`}>
                  {stageLabel(project.stage)}
                </Badge>
                <span className="text-xs text-muted-foreground w-20 text-right shrink-0">
                  {new Date(project.updatedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
