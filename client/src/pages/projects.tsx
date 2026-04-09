import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuthStore } from "@/stores/useAuthStore";
import { useProjectStore, type Project, type ProjectStage } from "@/stores/useProjectStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Search, LogOut, Settings, ChevronDown } from "lucide-react";

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGES: { value: ProjectStage | "all"; label: string; color: string }[] = [
  { value: "all", label: "All Projects", color: "" },
  { value: "lead", label: "Lead", color: "bg-gray-100 text-gray-700" },
  { value: "estimated_budget", label: "Estimated Budget", color: "bg-blue-100 text-blue-700" },
  { value: "site_measurement", label: "Site Measurement", color: "bg-yellow-100 text-yellow-700" },
  { value: "50_payment", label: "50% Payment", color: "bg-orange-100 text-orange-700" },
  { value: "3d_design", label: "3D Design", color: "bg-purple-100 text-purple-700" },
  { value: "manufacturing", label: "Manufacturing", color: "bg-indigo-100 text-indigo-700" },
  { value: "delivered", label: "Delivered", color: "bg-green-100 text-green-700" },
  { value: "100_payment", label: "100% Payment", color: "bg-emerald-100 text-emerald-700" },
];

function stageBadge(stage: string) {
  const s = STAGES.find((x) => x.value === stage);
  return s ? (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">{stage}</span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ─── New project dialog ───────────────────────────────────────────────────────

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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Al Barsha Villa Kitchen" required />
          </div>
          <div className="space-y-1">
            <Label>Client name</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="+971 50 …" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="…@gmail.com" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Villa / flat address" />
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

  const [stageFilter, setStageFilter] = useState<ProjectStage | "all">("all");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load projects
  useEffect(() => {
    setIsLoading(true);
    const url =
      stageFilter === "all"
        ? "/api/projects"
        : `/api/projects?stage=${stageFilter}`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .finally(() => setIsLoading(false));
  }, [stageFilter, setProjects]);

  // Client-side search filter
  const filtered = projects.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.clientName.toLowerCase().includes(q) ||
      p.clientPhone.includes(q)
    );
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (res.ok) removeProject(id);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">NIVRA Kitchens</span>
          <span className="text-muted-foreground text-sm">/ Projects</span>
        </div>
        <div className="flex items-center gap-2">
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

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6">
          {/* Stage filters */}
          <div className="flex gap-1">
            {STAGES.map((s) => (
              <Button
                key={s.value}
                variant={stageFilter === s.value ? "default" : "outline"}
                size="sm"
                onClick={() => setStageFilter(s.value as typeof stageFilter)}
                className="text-xs"
              >
                {s.label}
              </Button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New project
          </Button>
        </div>

        {/* Project grid */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">Loading projects…</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            No projects found.{" "}
            <button className="underline" onClick={() => setNewOpen(true)}>
              Create one?
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="font-semibold text-sm leading-snug truncate">
                      {project.name}
                    </div>
                    {stageBadge(project.stage)}
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    {project.clientName && (
                      <div className="truncate">{project.clientName}</div>
                    )}
                    {project.clientPhone && (
                      <div>{project.clientPhone}</div>
                    )}
                    {project.address && (
                      <div className="truncate">{project.address}</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-3 border-t">
                    <span className="text-xs text-muted-foreground">
                      {(project.spaceCount ?? 0)} space{(project.spaceCount ?? 0) !== 1 ? "s" : ""}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(project.updatedAt)}
                      </span>
                      {(user?.role === "admin" || user?.role === "sales") && (
                        <button
                          className="text-xs text-red-500 hover:text-red-700 px-1"
                          onClick={(e) => handleDelete(project.id, e)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

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
