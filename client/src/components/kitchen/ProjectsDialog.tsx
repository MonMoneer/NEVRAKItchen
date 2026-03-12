import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Save, Trash2, FolderOpen, Phone, User, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SavedProject } from "@shared/schema";

interface ProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "save" | "open";
  onModeChange: (mode: "save" | "open") => void;
  projectData: { walls: unknown[]; cabinets: unknown[]; selectedFinishing: string };
  onLoadProject: (data: { walls: any[]; cabinets: any[] }, finishing: string, name: string, clientName: string, clientPhone: string) => void;
}

export function ProjectsDialog({
  open,
  onOpenChange,
  mode,
  onModeChange,
  projectData,
  onLoadProject,
}: ProjectsDialogProps) {
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResults, setSearchResults] = useState<SavedProject[] | null>(null);

  const { data: allProjects = [], isLoading: loadingProjects } = useQuery<SavedProject[]>({
    queryKey: ["/api/projects"],
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects", {
        name: projectName.trim() || `Kitchen ${new Date().toLocaleDateString()}`,
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        selectedFinishing: projectData.selectedFinishing,
        projectData: {
          walls: projectData.walls,
          cabinets: projectData.cabinets,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project saved" });
      setProjectName("");
      setClientName("");
      setClientPhone("");
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to save project", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted" });
    },
  });

  const handleSearch = async () => {
    if (!searchPhone.trim()) return;
    try {
      const res = await fetch(`/api/projects/search?phone=${encodeURIComponent(searchPhone.trim())}`);
      const data = await res.json();
      setSearchResults(data);
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    }
  };

  const handleLoad = (project: SavedProject) => {
    const data = project.projectData as { walls: any[]; cabinets: any[] };
    onLoadProject(data, project.selectedFinishing || "1", project.name, project.clientName || "", project.clientPhone || "");
  };

  const displayProjects = searchResults !== null ? searchResults : allProjects;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="projects-dialog">
        <DialogHeader>
          <DialogTitle>Projects</DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => { onModeChange(v as "save" | "open"); setSearchResults(null); }}>
          <TabsList className="w-full">
            <TabsTrigger value="save" className="flex-1" data-testid="tab-save">
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save
            </TabsTrigger>
            <TabsTrigger value="open" className="flex-1" data-testid="tab-open">
              <FolderOpen className="w-3.5 h-3.5 mr-1.5" /> Open
            </TabsTrigger>
          </TabsList>

          <TabsContent value="save" className="space-y-3 mt-3">
            <div>
              <Label htmlFor="project-name" className="text-xs">Project Name</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Kitchen Layout"
                data-testid="input-project-name"
              />
            </div>
            <div>
              <Label htmlFor="client-name" className="text-xs">Client Name</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client full name"
                  className="pl-8"
                  data-testid="input-client-name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="client-phone" className="text-xs">Client Phone</Label>
              <div className="relative">
                <Phone className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  id="client-phone"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+971 50 123 4567"
                  className="pl-8"
                  data-testid="input-client-phone"
                />
              </div>
            </div>
            <div className="pt-1">
              <p className="text-[11px] text-muted-foreground mb-2">
                {projectData.walls.length} walls, {projectData.cabinets.length} cabinets
              </p>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="w-full"
                data-testid="button-save-project"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Project
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="open" className="mt-3">
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Phone className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="Search by phone..."
                  className="pl-8"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  data-testid="input-search-phone"
                />
              </div>
              <Button size="icon" variant="outline" onClick={handleSearch} data-testid="button-search">
                <Search className="w-4 h-4" />
              </Button>
              {searchResults !== null && (
                <Button size="sm" variant="ghost" onClick={() => setSearchResults(null)} data-testid="button-clear-search">
                  Clear
                </Button>
              )}
            </div>

            <ScrollArea className="h-[300px]">
              {loadingProjects ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                </div>
              ) : displayProjects.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  {searchResults !== null ? "No projects found" : "No saved projects yet"}
                </div>
              ) : (
                <div className="space-y-2">
                  {displayProjects.map((project) => (
                    <div
                      key={project.id}
                      className="border border-border rounded-lg p-3 hover:bg-accent/50 transition-colors group"
                      data-testid={`project-item-${project.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div
                          className="flex-1 cursor-pointer min-w-0"
                          onClick={() => handleLoad(project)}
                          data-testid={`button-load-${project.id}`}
                        >
                          <p className="text-sm font-medium truncate">{project.name}</p>
                          {project.clientName && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <User className="w-3 h-3" /> {project.clientName}
                            </p>
                          )}
                          {project.clientPhone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {project.clientPhone}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {new Date(project.createdAt).toLocaleDateString()} {new Date(project.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={() => {
                            if (confirm("Delete this project?")) {
                              deleteMutation.mutate(project.id);
                            }
                          }}
                          data-testid={`button-delete-${project.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
