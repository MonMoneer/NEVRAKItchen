import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Project, ProjectStage } from "@/stores/useProjectStore";
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
