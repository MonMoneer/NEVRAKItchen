import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { X, Upload, Trash2, FileText, ImageOff } from "lucide-react";
import type { Project, ProjectSpace } from "@/stores/useProjectStore";
import { Button } from "@/components/ui/button";

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
  name: string;
  url: string;
  mimeType: string;
  createdAt: string;
}

interface SlideOutPanelProps {
  project: Project;
  open: boolean;
  onClose: () => void;
  onUpdateProject: (id: number, updates: Partial<Project>) => Promise<void>;
  onDeleteProject: (id: number) => Promise<void>;
  technicians: { id: number; username: string }[];
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
  const [spaces, setSpaces] = useState<ProjectSpace[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [notes, setNotes] = useState(project.notes ?? "");
  const [assignedTo, setAssignedTo] = useState<number | null>(project.assignedTo);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync notes/assignedTo when project changes
  useEffect(() => {
    setNotes(project.notes ?? "");
    setAssignedTo(project.assignedTo);
  }, [project.id, project.notes, project.assignedTo]);

  // Load spaces and attachments when panel opens
  useEffect(() => {
    if (!open) return;

    fetch(`/api/projects/${project.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.spaces) setSpaces(data.spaces);
      })
      .catch(() => {});

    fetch(`/api/projects/${project.id}/attachments`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAttachments(data);
      })
      .catch(() => {});
  }, [open, project.id]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleNotesBlur = async () => {
    if (notes !== project.notes) {
      await onUpdateProject(project.id, { notes });
    }
  };

  const handleAssignedChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value ? Number(e.target.value) : null;
    setAssignedTo(val);
    await onUpdateProject(project.id, { assignedTo: val });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(",")[1];
        const res = await fetch(`/api/projects/${project.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: file.name,
            mimeType: file.type,
            data: base64,
          }),
        });
        if (res.ok) {
          const newAttachment = await res.json();
          setAttachments((prev) => [...prev, newAttachment]);
        }
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteAttachment = async (id: number) => {
    const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    }
  };

  const handleDeleteProject = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDeleteProject(project.id);
    onClose();
  };

  const stageBadgeClass =
    STAGE_COLORS[project.stage] ?? "bg-gray-100 text-gray-700";
  const stageLabel = STAGE_LABELS[project.stage] ?? project.stage;

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[400px] bg-background border-l border-border shadow-xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <h2 className="font-semibold text-base truncate">{project.name}</h2>
            <span
              className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${stageBadgeClass}`}
            >
              {stageLabel}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Contact info */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Contact
            </h3>
            <div className="space-y-1 text-sm">
              {project.clientName && (
                <div>
                  <span className="text-muted-foreground">Name: </span>
                  {project.clientName}
                </div>
              )}
              {project.clientPhone && (
                <div>
                  <span className="text-muted-foreground">Phone: </span>
                  {project.clientPhone}
                </div>
              )}
              {project.clientEmail && (
                <div>
                  <span className="text-muted-foreground">Email: </span>
                  {project.clientEmail}
                </div>
              )}
              {project.address && (
                <div>
                  <span className="text-muted-foreground">Address: </span>
                  {project.address}
                </div>
              )}
            </div>
          </section>

          {/* Technician assignment */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Assigned Technician
            </h3>
            <select
              value={assignedTo ?? ""}
              onChange={handleAssignedChange}
              className="w-full text-sm border border-input rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— Unassigned —</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.username}
                </option>
              ))}
            </select>
          </section>

          {/* Spaces */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Spaces ({spaces.length})
            </h3>
            {spaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">No spaces yet.</p>
            ) : (
              <div className="space-y-2">
                {spaces.map((space) => (
                  <button
                    key={space.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="w-full text-left flex items-center gap-3 border border-border rounded-lg p-2 hover:bg-accent transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="w-16 h-12 bg-muted rounded shrink-0 overflow-hidden flex items-center justify-center">
                      {space.referenceImage ? (
                        <img
                          src={space.referenceImage}
                          alt={space.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ImageOff className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{space.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {space.type}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Attachments */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Files ({attachments.length})
              </h3>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No files attached.</p>
            ) : (
              <div className="space-y-1">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted group"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate flex-1">{att.name}</span>
                    <button
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Notes */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Notes
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              rows={4}
              placeholder="Add notes…"
              className="w-full text-sm border border-input rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </section>

          {/* Danger zone */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Danger Zone
            </h3>
            <button
              onClick={handleDeleteProject}
              className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
                confirmDelete
                  ? "bg-destructive text-destructive-foreground border-destructive"
                  : "border-destructive text-destructive hover:bg-destructive/10"
              }`}
            >
              {confirmDelete ? "Click again to confirm delete" : "Delete project"}
            </button>
            {confirmDelete && (
              <button
                onClick={() => setConfirmDelete(false)}
                className="ml-2 text-xs text-muted-foreground hover:underline"
              >
                Cancel
              </button>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <Button
            className="w-full"
            onClick={() => navigate(`/projects/${project.id}`)}
          >
            Open Designer
          </Button>
        </div>
      </div>
    </>
  );
}
