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
