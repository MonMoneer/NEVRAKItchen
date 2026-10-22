import { useRef, useState } from "react";
import { X } from "lucide-react";
import {
  APPLIANCE_CATALOGUE,
  APPLIANCE_GROUPS,
  type ApplianceKind,
} from "@/lib/appliances";

/** A drag started from the appliance pop-up, handed to DesignerCanvas. */
export interface ApplianceDragStart {
  kind: ApplianceKind;
  widthCm: number;
  pointerId: number;
  clientX: number;
  clientY: number;
}

interface AppliancePanelProps {
  onClose: () => void;
  /** True while a card is being dragged onto the plan — panel fades and ignores pointer events. */
  dragging: boolean;
  onStartDrag: (drag: ApplianceDragStart) => void;
}

// Movement (px) before a press on a card turns into a drag, so a plain tap
// doesn't flash the panel.
const DRAG_START_PX = 4;

/**
 * Appliance pop-up, docked over the Layers panel. Appliances are visual only —
 * they are never priced and never become layers.
 */
export function AppliancePanel({ onClose, dragging, onStartDrag }: AppliancePanelProps) {
  const [sizeByKind, setSizeByKind] = useState<Partial<Record<ApplianceKind, number>>>({});
  const pendingRef = useRef<(() => void) | null>(null);

  const sizeOf = (kind: ApplianceKind) =>
    sizeByKind[kind] ?? APPLIANCE_CATALOGUE.find((d) => d.kind === kind)!.sizes[0];

  const handleCardPointerDown = (e: React.PointerEvent, kind: ApplianceKind) => {
    // Size chips are buttons — pressing one picks the size, it doesn't drag.
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    pendingRef.current?.();
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const widthCm = sizeOf(kind);
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      pendingRef.current = null;
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START_PX) return;
      cleanup();
      onStartDrag({ kind, widthCm, pointerId, clientX: ev.clientX, clientY: ev.clientY });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    pendingRef.current = cleanup;
  };

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col bg-card border-l border-border transition-opacity duration-150"
      style={{ opacity: dragging ? 0.3 : 1, pointerEvents: dragging ? "none" : "auto" }}
      data-testid="appliance-panel"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div>
          <p className="text-sm font-semibold">Appliances</p>
          <p className="text-[10px] text-muted-foreground">Pick a size, then drag onto the plan. Layout only — not priced.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground touch:h-11 touch:w-11"
          title="Back to layers"
          aria-label="Close appliances"
          data-testid="button-close-appliances"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {APPLIANCE_GROUPS.map((group) => (
          <div key={group}>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-1 mb-1">{group}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {APPLIANCE_CATALOGUE.filter((d) => d.group === group).map((def) => {
                const selected = sizeOf(def.kind);
                return (
                  <div
                    key={def.kind}
                    onPointerDown={(e) => handleCardPointerDown(e, def.kind)}
                    className="rounded-md border border-border bg-background p-2 cursor-grab active:cursor-grabbing select-none hover:border-primary/50"
                    style={{ touchAction: "none" }}
                    data-testid={`appliance-card-${def.kind}`}
                  >
                    <p className="text-xs font-medium leading-tight">{def.name}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {def.sizes.map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setSizeByKind((prev) => ({ ...prev, [def.kind]: size }))}
                          className={`rounded px-1.5 py-0.5 text-[10px] font-mono border touch:min-h-[32px] touch:px-2 ${
                            selected === size
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:bg-accent"
                          }`}
                          data-testid={`appliance-size-${def.kind}-${size}`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                    {def.note && <p className="mt-1 text-[9px] text-muted-foreground">{def.note}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
