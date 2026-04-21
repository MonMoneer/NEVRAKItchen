import type { CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Trash2, Layers, GripVertical, ChevronUp, ChevronDown } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useToast } from "@/hooks/use-toast";
import { useCanvasStore } from "@/stores/useCanvasStore";
import type {
  DreamHomeFinish,
  DreamHomePrice,
  TallHeight,
  PricingSettings,
} from "@shared/schema";
import type { Layer, LayerType, Cabinet, Wall, Island } from "@/lib/kitchen-engine";
import { pixelsToCm, computeEffectiveLengths } from "@/lib/kitchen-engine";
import { calculateLayerPrice, type PricingLayer } from "@/lib/dream-home-pricing";

const LAYER_LABELS: Record<LayerType, string> = {
  base: "Base Cabinet",
  wall_cabinet: "Wall Cabinet",
  tall: "Tall Cabinet",
  island: "Island",
  end_panel: "End Panel",
  filler: "Filler",
  drawer: "Drawer",
};

const LAYER_COLORS: Record<LayerType, string> = {
  base: "#3B82F6",
  wall_cabinet: "#22C55E",
  tall: "#A855F7",
  island: "#F59E0B",
  end_panel: "#6B7280",
  filler: "#9CA3AF",
  drawer: "#64748B",
};

const DRAWABLE_TYPES: LayerType[] = ["base", "wall_cabinet", "tall", "island"];
const COUNT_TYPES: LayerType[] = ["end_panel", "filler", "drawer"];
const ALL_TYPES: LayerType[] = ["base", "wall_cabinet", "tall", "island", "end_panel", "filler", "drawer"];

function generateId() {
  return `layer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface LayerPanelProps {
  cabinets: Cabinet[];
  walls: Wall[];
}

export function LayerPanel({ cabinets, walls }: LayerPanelProps) {
  const { toast } = useToast();
  const { layers, activeLayerId, addLayer, removeLayer, updateLayer, setActiveLayer, reorderLayer } = useCanvasStore();
  const islands = useCanvasStore((s) => s.islands);
  const updateIsland = useCanvasStore((s) => s.updateIsland);
  const removeIsland = useCanvasStore((s) => s.removeIsland);

  const { data: finishes = [] } = useQuery<DreamHomeFinish[]>({ queryKey: ["/api/dream-home/finishes"] });
  const { data: prices = [] } = useQuery<DreamHomePrice[]>({ queryKey: ["/api/dream-home/prices"] });
  const { data: tallRows = [] } = useQuery<TallHeight[]>({ queryKey: ["/api/dream-home/tall-heights"] });
  const { data: settings } = useQuery<PricingSettings>({ queryKey: ["/api/pricing-settings"] });

  // Drag-and-drop sensors. `activationConstraint` prevents a stray click on
  // the layer card (which selects it) from being interpreted as a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = layers.findIndex((l) => l.id === active.id);
    const toIndex = layers.findIndex((l) => l.id === over.id);
    if (fromIndex >= 0 && toIndex >= 0) reorderLayer(fromIndex, toIndex);
  };

  const handleAddLayer = (type: LayerType) => {
    // Default finish: "Solid Matte / Soft Touch" (fall back to first if not found)
    const defaultFinish =
      finishes.find((f) => f.name === "Solid Matte / Soft Touch")?.id ??
      finishes[0]?.id ??
      null;

    // Defaults per layer type (cm)
    const DEFAULTS: Record<string, { depth: number; height: number }> = {
      base:         { depth: 55, height: 77 },
      wall_cabinet: { depth: 33, height: 70 },
      tall:         { depth: 55, height: 220 },
      island:       { depth: 55, height: 77 },
    };
    const d = DEFAULTS[type];

    const newLayer: Layer = {
      id: generateId(),
      type,
      depth: COUNT_TYPES.includes(type) ? null : d?.depth ?? 60,
      height: COUNT_TYPES.includes(type) ? null : d?.height ?? 90,
      finishId: DRAWABLE_TYPES.includes(type) ? defaultFinish : null,
      cabinetIds: [],
    };
    if (type === "end_panel") {
      newLayer.endPanelVariant = "base";
      newLayer.qty = 1;
    }
    if (type === "filler" || type === "drawer") {
      newLayer.qty = 1;
    }
    addLayer(newLayer);

    // Auto-enter the new island drawing flow so the rep can click a wall immediately
    if (type === "island") {
      useCanvasStore.getState().startIslandDraw();
    }
  };

  const getLayerCabinets = (layer: Layer): Cabinet[] =>
    cabinets.filter((c) => c.layerId === layer.id || layer.cabinetIds.includes(c.id));

  const getLayerLength = (layer: Layer): number => {
    if (!DRAWABLE_TYPES.includes(layer.type)) return 0;
    const cabs = getLayerCabinets(layer);
    if (cabs.length === 0) return 0;
    const effectiveLengths = computeEffectiveLengths(cabs, walls, layer.depth ?? undefined);
    return cabs.reduce((sum, c) => sum + pixelsToCm(effectiveLengths.get(c.id) ?? 0) / 100, 0);
  };

  return (
    <div className="flex flex-col h-full bg-sidebar border-l border-sidebar-border" data-testid="layer-panel">
      <div className="p-3 border-b border-sidebar-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-sidebar-foreground flex items-center gap-1.5">
            <Layers className="w-4 h-4" />
            Layers
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">Click a layer to draw on it</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              New Layer
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ALL_TYPES.map((type) => (
              <DropdownMenuItem key={type} onClick={() => handleAddLayer(type)}>
                <div className="w-2.5 h-2.5 rounded-sm mr-2 shrink-0" style={{ backgroundColor: LAYER_COLORS[type] }} />
                {LAYER_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-2">
        {layers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-muted-foreground">No layers yet</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Click "New Layer" to add one
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={layers.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {layers.map((layer, idx) => (
                <LayerCard
                  key={layer.id}
                  layer={layer}
                  index={idx}
                  totalLayers={layers.length}
                  isActive={layer.id === activeLayerId}
                  lengthM={getLayerLength(layer)}
                  finishes={finishes}
                  prices={prices}
                  tallRows={tallRows}
                  settings={settings}
                  onSelect={() => setActiveLayer(layer.id)}
                  onUpdate={(updates) => updateLayer(layer.id, updates)}
                  onDelete={() => removeLayer(layer.id)}
                  onMoveUp={() => reorderLayer(idx, idx - 1)}
                  onMoveDown={() => reorderLayer(idx, idx + 1)}
                  islands={islands}
                  updateIsland={updateIsland}
                  removeIsland={removeIsland}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <TotalFooter
        layers={layers}
        cabinets={cabinets}
        walls={walls}
        islands={islands}
        prices={prices}
        tallRows={tallRows}
        settings={settings}
      />
    </div>
  );
}

interface LayerCardProps {
  layer: Layer;
  index: number;
  totalLayers: number;
  isActive: boolean;
  lengthM: number;
  finishes: DreamHomeFinish[];
  prices: DreamHomePrice[];
  tallRows: TallHeight[];
  settings?: PricingSettings;
  onSelect: () => void;
  onUpdate: (u: Partial<Layer>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  islands: Island[];
  updateIsland: (id: string, updates: Partial<Island>) => void;
  removeIsland: (id: string) => void;
}

function LayerCard({
  layer,
  index,
  totalLayers,
  isActive,
  lengthM,
  finishes,
  prices,
  tallRows,
  settings,
  onSelect,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  islands,
  updateIsland,
  removeIsland,
}: LayerCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: layer.id });
  // When cards of different heights swap (a compact collapsed card vs the
  // tall expanded/active card), dnd-kit's default transform applies a
  // scaleX/scaleY to match the sibling's bounding box — which visually
  // squashes/stretches the dragged card. Strip the scale component and
  // keep only the translate so the card moves cleanly without deforming.
  const dragStyle: CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  const canMoveUp = index > 0;
  const canMoveDown = index < totalLayers - 1;
  const isDrawable = DRAWABLE_TYPES.includes(layer.type);
  const isCount = COUNT_TYPES.includes(layer.type);

  const boundIsland =
    layer.type === "island"
      ? islands.find((i) => i.layerId === layer.id) ?? null
      : null;

  const pricingLayerInput =
    layer.type === "island" && boundIsland
      ? { ...layer, depth: boundIsland.depthCm, height: boundIsland.heightCm }
      : layer;

  const pricingLengthM =
    layer.type === "island" && boundIsland
      ? boundIsland.lengthCm / 100
      : lengthM;

  const result = settings
    ? calculateLayerPrice({
        layer: pricingLayerInput as unknown as PricingLayer,
        lengthM: pricingLengthM,
        settings,
        dreamHomePrices: prices,
        tallHeights: tallRows,
      })
    : { subtotalAED: 0, breakdown: "Loading...", error: undefined as string | undefined };

  const subtotalLabel = result.error ? "—" : `${result.subtotalAED.toFixed(0)} AED`;
  const qtyOrLength =
    layer.type === "island" && boundIsland
      ? `${(boundIsland.lengthCm / 100).toFixed(2)} m`
      : isDrawable
      ? `${lengthM.toFixed(2)} m`
      : `${layer.qty ?? 0} pcs`;

  // Collapsed (inactive) card — compact one-line summary
  if (!isActive) {
    return (
      <div
        ref={setNodeRef}
        style={dragStyle}
        className="rounded-md border border-border bg-card hover:border-primary/40 cursor-pointer transition-colors p-2 flex items-center gap-1.5"
        onClick={onSelect}
      >
        {/* Drag handle — only this element carries the dnd listeners, so the
            rest of the card still receives plain clicks (select / buttons). */}
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0 inline-flex items-center justify-center touch:w-11 touch:h-11 touch:-m-1.5"
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5 touch:w-5 touch:h-5" />
        </button>
        <div
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: LAYER_COLORS[layer.type] }}
        />
        <span className="text-xs font-medium text-card-foreground truncate flex-1">
          {LAYER_LABELS[layer.type]}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
          {qtyOrLength}
        </span>
        <span className="text-[11px] font-semibold font-mono text-primary shrink-0 min-w-[60px] text-right">
          {subtotalLabel}
        </span>
        <div className="flex flex-col -my-1 shrink-0 touch:flex-row touch:gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (canMoveUp) onMoveUp();
            }}
            disabled={!canMoveUp}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed h-3 leading-none inline-flex items-center justify-center touch:w-11 touch:h-11 touch:border touch:border-border touch:rounded-md"
            title="Move up"
          >
            <ChevronUp className="w-3 h-3 touch:w-5 touch:h-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (canMoveDown) onMoveDown();
            }}
            disabled={!canMoveDown}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed h-3 leading-none inline-flex items-center justify-center touch:w-11 touch:h-11 touch:border touch:border-border touch:rounded-md"
            title="Move down"
          >
            <ChevronDown className="w-3 h-3 touch:w-5 touch:h-5" />
          </button>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (layer.type === "island" && boundIsland) {
              removeIsland(boundIsland.id);
            }
            onDelete();
          }}
          className="text-muted-foreground hover:text-red-500 shrink-0 inline-flex items-center justify-center touch:w-11 touch:h-11"
          title="Delete layer"
        >
          <Trash2 className="w-3 h-3 touch:w-4 touch:h-4" />
        </button>
      </div>
    );
  }

  // Expanded (active) card — full details
  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className="rounded-md border p-2.5 cursor-pointer transition-colors border-primary bg-primary/5 ring-1 ring-primary/30"
      onClick={onSelect}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none shrink-0 inline-flex items-center justify-center touch:w-11 touch:h-11 touch:-m-1.5"
          onClick={(e) => e.stopPropagation()}
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3.5 h-3.5 touch:w-5 touch:h-5" />
        </button>
        <div
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: LAYER_COLORS[layer.type] }}
        />
        <span className="text-xs font-medium text-card-foreground">{LAYER_LABELS[layer.type]}</span>
        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">#{index + 1}</Badge>
        <div className="flex flex-col -my-1 shrink-0 touch:flex-row touch:gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (canMoveUp) onMoveUp();
            }}
            disabled={!canMoveUp}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed h-3 leading-none inline-flex items-center justify-center touch:w-11 touch:h-11 touch:border touch:border-border touch:rounded-md"
            title="Move up"
          >
            <ChevronUp className="w-3 h-3 touch:w-5 touch:h-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (canMoveDown) onMoveDown();
            }}
            disabled={!canMoveDown}
            className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed h-3 leading-none inline-flex items-center justify-center touch:w-11 touch:h-11 touch:border touch:border-border touch:rounded-md"
            title="Move down"
          >
            <ChevronDown className="w-3 h-3 touch:w-5 touch:h-5" />
          </button>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (layer.type === "island" && boundIsland) {
              removeIsland(boundIsland.id);
            }
            onDelete();
          }}
          className="text-muted-foreground hover:text-red-500 ml-1 inline-flex items-center justify-center touch:w-11 touch:h-11"
          title="Delete layer"
        >
          <Trash2 className="w-3 h-3 touch:w-4 touch:h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
        {isDrawable && layer.type !== "island" && (
          <>
            <span className="text-muted-foreground">Length</span>
            <span className="text-right font-mono text-card-foreground">{lengthM.toFixed(2)} m</span>

            <span className="text-muted-foreground self-center">Depth (cm)</span>
            <Input
              type="number"
              value={layer.depth ?? ""}
              className="h-6 text-xs text-right"
              onChange={(e) => onUpdate({ depth: e.target.value === "" ? null : parseInt(e.target.value) })}
              onClick={(e) => e.stopPropagation()}
            />

            <span className="text-muted-foreground self-center">Height (cm)</span>
            <Input
              type="number"
              value={layer.height ?? ""}
              className="h-6 text-xs text-right"
              onChange={(e) => onUpdate({ height: e.target.value === "" ? null : parseInt(e.target.value) })}
              onClick={(e) => e.stopPropagation()}
            />

            <span className="text-muted-foreground self-center">Finish</span>
            <Select
              value={layer.finishId != null ? String(layer.finishId) : ""}
              onValueChange={(v) => onUpdate({ finishId: parseInt(v) })}
            >
              <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
                <SelectValue placeholder="Select finish" />
              </SelectTrigger>
              <SelectContent>
                {finishes.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {layer.type === "island" && boundIsland && (
          <>
            <span className="text-muted-foreground self-center">Length (cm)</span>
            <Input
              type="number"
              value={boundIsland.lengthCm}
              min={1}
              className="h-6 text-xs text-right"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) updateIsland(boundIsland.id, { lengthCm: v });
              }}
              onClick={(e) => e.stopPropagation()}
            />

            <span className="text-muted-foreground self-center">Depth (cm)</span>
            <Input
              type="number"
              value={boundIsland.depthCm}
              min={1}
              max={110}
              className="h-6 text-xs text-right"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0 && v <= 110) updateIsland(boundIsland.id, { depthCm: v });
              }}
              onClick={(e) => e.stopPropagation()}
            />

            <span className="text-muted-foreground self-center">Height (cm)</span>
            <Input
              type="number"
              value={boundIsland.heightCm}
              min={1}
              className="h-6 text-xs text-right"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v) && v > 0) updateIsland(boundIsland.id, { heightCm: v });
              }}
              onClick={(e) => e.stopPropagation()}
            />

            <span className="text-muted-foreground self-center">Finish</span>
            <Select
              value={layer.finishId != null ? String(layer.finishId) : ""}
              onValueChange={(v) => onUpdate({ finishId: parseInt(v) })}
            >
              <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
                <SelectValue placeholder="Select finish" />
              </SelectTrigger>
              <SelectContent>
                {finishes.map((f) => (
                  <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {layer.type === "island" && !boundIsland && (
          <p className="text-[10px] text-muted-foreground col-span-2 italic">
            Click a wall on the canvas to place this island.
          </p>
        )}

        {layer.type === "end_panel" && (
          <>
            <span className="text-muted-foreground self-center">Variant</span>
            <Select
              value={layer.endPanelVariant ?? "base"}
              onValueChange={(v) =>
                onUpdate({ endPanelVariant: v as "base" | "wall" | "decorative" })
              }
            >
              <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="base">Base Cabinet (0.5 m²)</SelectItem>
                <SelectItem value="wall">Wall Cabinet</SelectItem>
                <SelectItem value="decorative">Decorative (60 cm × H)</SelectItem>
              </SelectContent>
            </Select>

            {layer.endPanelVariant === "wall" && (
              <>
                <span className="text-muted-foreground self-center">Area</span>
                <Select
                  value={String(layer.endPanelWallArea ?? 0.2)}
                  onValueChange={(v) => onUpdate({ endPanelWallArea: parseFloat(v) })}
                >
                  <SelectTrigger className="h-6 text-xs" onClick={(e) => e.stopPropagation()}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.2">0.2 m²</SelectItem>
                    <SelectItem value="0.3">0.3 m²</SelectItem>
                    <SelectItem value="0.4">0.4 m²</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

            {layer.endPanelVariant === "decorative" && (
              <>
                <span className="text-muted-foreground self-center">Height (cm)</span>
                <Input
                  type="number"
                  value={layer.endPanelDecorHeight ?? ""}
                  placeholder="260"
                  className="h-6 text-xs text-right"
                  onChange={(e) =>
                    onUpdate({
                      endPanelDecorHeight: e.target.value === "" ? undefined : parseInt(e.target.value),
                    })
                  }
                  onClick={(e) => e.stopPropagation()}
                />
              </>
            )}
          </>
        )}

        {isCount && (
          <>
            <span className="text-muted-foreground self-center">Qty</span>
            <Input
              type="number"
              value={layer.qty ?? 1}
              min={0}
              className="h-6 text-xs text-right"
              onChange={(e) => onUpdate({ qty: parseInt(e.target.value) || 0 })}
              onClick={(e) => e.stopPropagation()}
            />
          </>
        )}
      </div>

      <Separator className="my-1.5" />

      {!result.error && (() => {
        const unit = isCount ? "pc" : "m";
        // Use the same length that pricing actually used (pricingLengthM),
        // not the raw `lengthM` prop. For islands, `lengthM` from the parent
        // is 0 because they aren't counted as drawable walls — but pricing
        // uses the island's own length, so the rate must divide by that.
        const denom = isCount ? (layer.qty ?? 0) : pricingLengthM;
        const ratePerUnit = denom > 0 ? result.subtotalAED / denom : 0;
        return (
          <div className="flex justify-between text-[10px] mb-0.5">
            <span className="text-muted-foreground">Rate</span>
            <span className="font-mono text-muted-foreground">
              {ratePerUnit > 0 ? `${ratePerUnit.toFixed(0)} AED / ${unit}` : "—"}
            </span>
          </div>
        );
      })()}

      <div className="flex justify-between text-xs">
        <span className="font-medium text-card-foreground">Subtotal</span>
        <span className="font-semibold font-mono text-primary">
          {result.error ? "—" : `${result.subtotalAED.toFixed(0)} AED`}
        </span>
      </div>
      {result.error ? (
        <p className="text-[9px] text-red-500 mt-0.5">{result.error}</p>
      ) : (
        <p
          className="text-[9px] text-muted-foreground mt-0.5 break-words"
          title={result.breakdown}
        >
          {result.breakdown}
        </p>
      )}
    </div>
  );
}

interface TotalFooterProps {
  layers: Layer[];
  cabinets: Cabinet[];
  walls: Wall[];
  islands: Island[];
  prices: DreamHomePrice[];
  tallRows: TallHeight[];
  settings?: PricingSettings;
}

function TotalFooter({ layers, cabinets, walls, islands, prices, tallRows, settings }: TotalFooterProps) {
  if (!settings) {
    return (
      <div className="p-3 border-t border-sidebar-border bg-sidebar">
        <p className="text-[10px] text-muted-foreground">Loading pricing…</p>
      </div>
    );
  }

  const getLength = (layer: Layer): number => {
    // Island layers: get length from the bound Island record
    if (layer.type === "island") {
      const bound = islands.find((i) => i.layerId === layer.id);
      return bound ? bound.lengthCm / 100 : 0;
    }
    if (!DRAWABLE_TYPES.includes(layer.type)) return 0;
    const cabs = cabinets.filter((c) => c.layerId === layer.id || layer.cabinetIds.includes(c.id));
    if (cabs.length === 0) return 0;
    const eff = computeEffectiveLengths(cabs, walls, layer.depth ?? undefined);
    return cabs.reduce((sum, c) => sum + pixelsToCm(eff.get(c.id) ?? 0) / 100, 0);
  };

  const total = layers.reduce((sum, layer) => {
    const bound = layer.type === "island" ? islands.find((i) => i.layerId === layer.id) : null;
    const pricingLayerInput = bound
      ? { ...layer, depth: bound.depthCm, height: bound.heightCm }
      : layer;
    const result = calculateLayerPrice({
      layer: pricingLayerInput as unknown as PricingLayer,
      lengthM: getLength(layer),
      settings,
      dreamHomePrices: prices,
      tallHeights: tallRows,
    });
    return sum + (result.error ? 0 : result.subtotalAED);
  }, 0);

  return (
    <div className="p-3 border-t border-sidebar-border bg-sidebar">
      <div className="flex justify-between items-baseline">
        <span className="text-xs font-medium text-sidebar-foreground">
          Layers: {layers.length}
        </span>
        <span className="text-lg font-bold font-mono text-primary" data-testid="text-total-price">
          {total.toFixed(0)} AED
        </span>
      </div>
    </div>
  );
}
