import { useState } from "react";
import { ReferenceModal } from "./ReferenceModal";

const SPACE_ICONS: Record<string, string> = {
  kitchen: "\uD83C\uDF73",
  bathroom: "\uD83D\uDEBF",
  washroom: "\uD83E\uDEA5",
  tv_unit: "\uD83D\uDCFA",
};

interface SpaceItem {
  id: number;
  name: string;
  type: string;
  referenceImage: string | null;
}

interface SpacesPreviewPanelProps {
  spaces: SpaceItem[];
  activeSpaceId: number | null;
  onSelectSpace: (spaceId: number) => void;
}

export function SpacesPreviewPanel({
  spaces,
  activeSpaceId,
  onSelectSpace,
}: SpacesPreviewPanelProps) {
  const [modalImage, setModalImage] = useState<string | null>(null);

  return (
    <aside className="w-[260px] shrink-0 bg-sidebar border-l border-sidebar-border flex flex-col h-full">
      <div className="p-3 border-b border-sidebar-border">
        <h3 className="text-sm font-semibold text-sidebar-foreground">
          Spaces ({spaces.length})
        </h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Click to switch space. Tap thumbnail to preview estimation.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {spaces.map((space) => {
          const isActive = space.id === activeSpaceId;
          return (
            <div
              key={space.id}
              className={`rounded-md border p-2 cursor-pointer transition-colors ${
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border bg-card hover:border-primary/40"
              }`}
              onClick={() => onSelectSpace(space.id)}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm">{SPACE_ICONS[space.type] ?? "\uD83C\uDF73"}</span>
                <span className="text-xs font-medium text-card-foreground truncate flex-1">
                  {space.name}
                </span>
              </div>

              {space.referenceImage ? (
                <div
                  className="w-full h-24 rounded overflow-hidden bg-muted cursor-zoom-in"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalImage(space.referenceImage);
                  }}
                >
                  <img
                    src={space.referenceImage}
                    alt={`${space.name} reference`}
                    className="w-full h-full object-contain"
                  />
                </div>
              ) : (
                <div className="w-full h-16 rounded bg-muted flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">
                    No reference yet
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ReferenceModal
        imageSrc={modalImage}
        open={!!modalImage}
        onClose={() => setModalImage(null)}
      />
    </aside>
  );
}
