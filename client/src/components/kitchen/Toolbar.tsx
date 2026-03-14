import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import {
  Ruler,
  Square,
  RectangleHorizontal,
  Columns3,
  MousePointer2,
  Hand,
  Trash2,
  Undo2,
  Redo2,
  Grid3X3,
  Magnet,
  Download,
  Settings,
  RotateCcw,
  Save,
  FolderOpen,
  DoorOpen,
  AppWindow,
  Zap,
  Droplets,
  LayoutPanelTop,
  PencilRuler,
} from "lucide-react";
import type { DrawingState } from "@/lib/kitchen-engine";

export type CustomTool = "electrical" | "plumbing" | "island" | "measure_tape" | null;

export interface ElementDef {
  id: number;
  name: string;
  category: string;
  icon: string;
  defaultWidth: number;
  defaultDepth: number;
  isActive: boolean;
}

interface ToolbarProps {
  activeTool: DrawingState["tool"];
  onToolChange: (tool: DrawingState["tool"]) => void;
  activeCustomTool?: CustomTool;
  onCustomToolChange?: (tool: CustomTool) => void;
  stage?: "estimated_budget" | "site_measurement" | "final";
  snapEnabled: boolean;
  onSnapToggle: () => void;
  gridEnabled: boolean;
  onGridToggle: () => void;
  unit: "cm" | "m";
  onUnitToggle: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onExport: () => void;
  onSave: () => void;
  onOpen: () => void;
  onAdmin: () => void;
  currentProject: string | null;
  // Legacy element placement (kept for compatibility)
  elementDefs?: ElementDef[];
  activeElementDefId?: number | null;
  onElementSelect?: (id: number | null) => void;
}

export function Toolbar({
  activeTool,
  onToolChange,
  activeCustomTool = null,
  onCustomToolChange,
  stage = "estimated_budget",
  snapEnabled,
  onSnapToggle,
  gridEnabled,
  onGridToggle,
  unit,
  onUnitToggle,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onExport,
  onSave,
  onOpen,
  onAdmin,
  currentProject,
  activeElementDefId = null,
  onElementSelect,
}: ToolbarProps) {
  const isMeasurement = stage === "site_measurement";

  const handleToolChange = (tool: DrawingState["tool"]) => {
    onCustomToolChange?.(null);
    onElementSelect?.(null);
    onToolChange(tool);
  };

  const handleCustomTool = (tool: CustomTool) => {
    if (activeCustomTool === tool) {
      onCustomToolChange?.(null);
    } else {
      onCustomToolChange?.(tool);
      onToolChange("select");
      onElementSelect?.(null);
    }
  };

  const isToolActive = (tool: DrawingState["tool"]) =>
    activeTool === tool && activeCustomTool === null && activeElementDefId === null;

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border overflow-y-auto" data-testid="toolbar">
      <div className="p-3 border-b border-sidebar-border shrink-0">
        <h2 className="text-sm font-semibold text-sidebar-foreground tracking-tight">NIVRA Kitchen</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {isMeasurement ? "Site Measurement" : "Layout Designer"}
        </p>
        {currentProject && (
          <p className="text-[10px] text-primary font-medium mt-1 truncate" data-testid="text-current-project">
            {currentProject}
          </p>
        )}
      </div>

      {/* ── BASIC TOOLS (always visible) ── */}
      <div className="p-2 flex flex-col gap-1 shrink-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">Basic</p>

        {/* Select */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="tool-select"
              onClick={() => handleToolChange("select")}
              className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isToolActive("select")
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-accent"
              }`}
            >
              <MousePointer2 className="w-4 h-4 shrink-0" />
              <span>Select / Move</span>
              <span className={`ml-auto text-[10px] ${isToolActive("select") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>V</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Select / Move (V)</TooltipContent>
        </Tooltip>

        {/* Pan */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="tool-pan"
              onClick={() => handleToolChange("pan")}
              className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isToolActive("pan")
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-accent"
              }`}
            >
              <Hand className="w-4 h-4 shrink-0" />
              <span>Pan / Hand</span>
              <span className={`ml-auto text-[10px] ${isToolActive("pan") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>H</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Pan / Hand (H)</TooltipContent>
        </Tooltip>

        {/* Measure Tape */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="tool-measure_tape"
              onClick={() => handleCustomTool("measure_tape")}
              className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                activeCustomTool === "measure_tape"
                  ? "bg-purple-500 text-white"
                  : "text-sidebar-foreground/80 hover:bg-accent"
              }`}
            >
              <PencilRuler className={`w-4 h-4 shrink-0 ${activeCustomTool === "measure_tape" ? "text-white" : "text-purple-500"}`} />
              <span>Measure Tape</span>
              <span className={`ml-auto text-[10px] ${activeCustomTool === "measure_tape" ? "text-white/70" : "text-muted-foreground"}`}>M</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Click to place measurement nodes (M)</TooltipContent>
        </Tooltip>

        {/* Delete */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="tool-delete"
              onClick={() => handleToolChange("delete")}
              className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isToolActive("delete")
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-accent"
              }`}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Delete</span>
              <span className={`ml-auto text-[10px] ${isToolActive("delete") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>D</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Delete (D)</TooltipContent>
        </Tooltip>
      </div>

      <Separator className="mx-2" />

      {/* ── ARCHITECTURE (always visible) ── */}
      <div className="p-2 flex flex-col gap-1 shrink-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">Architecture</p>

        {/* Wall */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="tool-wall"
              onClick={() => handleToolChange("wall")}
              className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isToolActive("wall")
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-accent"
              }`}
            >
              <Ruler className="w-4 h-4 shrink-0" />
              <span>Draw Wall</span>
              <span className={`ml-auto text-[10px] ${isToolActive("wall") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>W</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Draw Wall (W)</TooltipContent>
        </Tooltip>

        {/* Door */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="tool-door"
              onClick={() => handleToolChange("door")}
              className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isToolActive("door")
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-accent"
              }`}
            >
              <DoorOpen className="w-4 h-4 shrink-0" />
              <span>Door</span>
              <span className={`ml-auto text-[10px] ${isToolActive("door") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>R</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Door (R)</TooltipContent>
        </Tooltip>

        {/* Window */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="tool-window"
              onClick={() => handleToolChange("window")}
              className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                isToolActive("window")
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-accent"
              }`}
            >
              <AppWindow className="w-4 h-4 shrink-0" />
              <span>Window</span>
              <span className={`ml-auto text-[10px] ${isToolActive("window") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>N</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Window (N)</TooltipContent>
        </Tooltip>
      </div>

      {/* ── KITCHEN ELEMENTS (estimated_budget + final only) ── */}
      {!isMeasurement && (
        <>
          <Separator className="mx-2" />
          <div className="p-2 flex flex-col gap-1 shrink-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">Kitchen</p>

            {/* Base Cabinet */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="tool-base"
                  onClick={() => handleToolChange("base")}
                  className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    isToolActive("base")
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground/80 hover:bg-accent"
                  }`}
                >
                  <RectangleHorizontal className="w-4 h-4 shrink-0" />
                  <span>Base Cabinet</span>
                  <span className={`ml-auto text-[10px] ${isToolActive("base") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>B</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Base Cabinet (B)</TooltipContent>
            </Tooltip>

            {/* Wall Cabinet */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="tool-wall_cabinet"
                  onClick={() => handleToolChange("wall_cabinet")}
                  className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    isToolActive("wall_cabinet")
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground/80 hover:bg-accent"
                  }`}
                >
                  <Square className="w-4 h-4 shrink-0" />
                  <span>Wall Cabinet</span>
                  <span className={`ml-auto text-[10px] ${isToolActive("wall_cabinet") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>U</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Wall Cabinet (U)</TooltipContent>
            </Tooltip>

            {/* Tall Cabinet */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="tool-tall"
                  onClick={() => handleToolChange("tall")}
                  className={`relative flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    isToolActive("tall")
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground/80 hover:bg-accent"
                  }`}
                >
                  <Columns3 className="w-4 h-4 shrink-0" />
                  <span>Tall Cabinet</span>
                  <span className={`ml-auto text-[10px] ${isToolActive("tall") ? "text-primary-foreground/70" : "text-muted-foreground"}`}>T</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Tall Cabinet (T)</TooltipContent>
            </Tooltip>

            {/* Island Cabinet */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="tool-island"
                  onClick={() => handleCustomTool("island")}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeCustomTool === "island"
                      ? "bg-amber-500 text-white"
                      : "text-sidebar-foreground/80 hover:bg-accent"
                  }`}
                >
                  <LayoutPanelTop className={`w-4 h-4 shrink-0 ${activeCustomTool === "island" ? "text-white" : "text-amber-500"}`} />
                  <span>Island Cabinet</span>
                  <span className={`ml-auto text-[10px] ${activeCustomTool === "island" ? "text-white/70" : "text-muted-foreground"}`}>I</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Click anywhere to drop island (I)</TooltipContent>
            </Tooltip>
          </div>
        </>
      )}

      {/* ── FIELD POINTS (site_measurement only) ── */}
      {isMeasurement && (
        <>
          <Separator className="mx-2" />
          <div className="p-2 flex flex-col gap-1 shrink-0">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">Field Points</p>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="tool-electrical"
                  onClick={() => handleCustomTool("electrical")}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeCustomTool === "electrical"
                      ? "bg-amber-500 text-white"
                      : "text-sidebar-foreground/80 hover:bg-accent"
                  }`}
                >
                  <Zap className="w-4 h-4 shrink-0 text-amber-500" />
                  <span>Electrical Point</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Click wall → enter distance → fill details
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  data-testid="tool-plumbing"
                  onClick={() => handleCustomTool("plumbing")}
                  className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                    activeCustomTool === "plumbing"
                      ? "bg-blue-500 text-white"
                      : "text-sidebar-foreground/80 hover:bg-accent"
                  }`}
                >
                  <Droplets className="w-4 h-4 shrink-0 text-blue-500" />
                  <span>Plumbing Point</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Click wall → enter distance → fill details
              </TooltipContent>
            </Tooltip>
          </div>
        </>
      )}

      <Separator className="mx-2" />

      {/* ── OPTIONS ── */}
      <div className="p-2 flex flex-col gap-1 shrink-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">Options</p>
        <button
          data-testid="toggle-snap"
          onClick={onSnapToggle}
          className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
            snapEnabled ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Magnet className="w-4 h-4" />
          <span>Snap</span>
          <Badge variant={snapEnabled ? "default" : "secondary"} className="ml-auto text-[10px] px-1.5 py-0">
            {snapEnabled ? "ON" : "OFF"}
          </Badge>
        </button>
        <button
          data-testid="toggle-grid"
          onClick={onGridToggle}
          className={`flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
            gridEnabled ? "text-primary" : "text-muted-foreground"
          }`}
        >
          <Grid3X3 className="w-4 h-4" />
          <span>Grid</span>
          <Badge variant={gridEnabled ? "default" : "secondary"} className="ml-auto text-[10px] px-1.5 py-0">
            {gridEnabled ? "ON" : "OFF"}
          </Badge>
        </button>
        <button
          data-testid="toggle-unit"
          onClick={onUnitToggle}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium text-sidebar-foreground/80"
        >
          <Ruler className="w-4 h-4" />
          <span>Unit</span>
          <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
            {unit.toUpperCase()}
          </Badge>
        </button>
      </div>

      <Separator className="mx-2" />

      {/* ── ACTIONS ── */}
      <div className="p-2 flex flex-col gap-1 shrink-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">Actions</p>
        <div className="flex gap-1 px-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" disabled={!canUndo} onClick={onUndo} data-testid="button-undo" className="h-8 w-8">
                <Undo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" disabled={!canRedo} onClick={onRedo} data-testid="button-redo" className="h-8 w-8">
                <Redo2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Redo (Ctrl+Y)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={onClear} data-testid="button-clear" className="h-8 w-8">
                <RotateCcw className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">Clear All</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* ── BOTTOM ACTIONS ── */}
      <div className="mt-auto p-2 flex flex-col gap-1 shrink-0">
        <Separator className="mb-2" />
        <button
          data-testid="button-save"
          onClick={onSave}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium text-sidebar-foreground/80 hover:bg-accent transition-colors"
        >
          <Save className="w-4 h-4" />
          <span>Save</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+S</span>
        </button>
        <button
          data-testid="button-open"
          onClick={onOpen}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium text-sidebar-foreground/80 hover:bg-accent transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          <span>Open Project</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Ctrl+O</span>
        </button>
        <button
          data-testid="button-export"
          onClick={onExport}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium text-sidebar-foreground/80 hover:bg-accent transition-colors"
        >
          <Download className="w-4 h-4" />
          <span>Export PDF</span>
        </button>
        <button
          data-testid="button-admin"
          onClick={onAdmin}
          className="flex items-center gap-2 w-full px-2.5 py-2 rounded-md text-xs font-medium text-sidebar-foreground/80 hover:bg-accent transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Admin Panel</span>
        </button>
      </div>

      <div className="p-2 border-t border-sidebar-border shrink-0">
        <div className="text-[10px] text-muted-foreground space-y-0.5 px-1">
          <p><span className="font-medium">Enter</span> Confirm</p>
          <p><span className="font-medium">Esc</span> Cancel</p>
          <p><span className="font-medium">F</span> Flip depth</p>
          <p><span className="font-medium">Scroll</span> Zoom</p>
        </div>
      </div>
    </div>
  );
}
