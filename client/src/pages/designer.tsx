import { useState, useCallback, useEffect, useRef } from "react";
import type Konva from "konva";
import { useLocation } from "wouter";
import { Toolbar } from "@/components/kitchen/Toolbar";
import { DesignerCanvas } from "@/components/kitchen/DesignerCanvas";
import { PricingPanel } from "@/components/kitchen/PricingPanel";
import { ProjectsDialog } from "@/components/kitchen/ProjectsDialog";
import {
  type DrawingState,
  type Wall,
  type Cabinet,
  type Opening,
  createInitialDrawingState,
  splitCabinetAroundTall,
  findOverlappingCabinets,
  checkClearanceViolation,
  distanceBetween,
  cmToPixels,
  WALL_THICKNESS,
} from "@/lib/kitchen-engine";
import {
  type HistoryState,
  createHistory,
  pushState,
  undo as historyUndo,
  redo as historyRedo,
  canUndo as checkCanUndo,
  canRedo as checkCanRedo,
} from "@/lib/history";
import { exportToPDF } from "@/lib/export";
import { useToast } from "@/hooks/use-toast";

interface DesignData {
  walls: Wall[];
  cabinets: Cabinet[];
  openings: Opening[];
}

export default function Designer() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [drawingState, setDrawingState] = useState<DrawingState>(createInitialDrawingState);
  const [history, setHistory] = useState<HistoryState<DesignData>>(() =>
    createHistory({ walls: [], cabinets: [], openings: [] })
  );
  const [selectedFinishing, setSelectedFinishing] = useState("1");
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projectsMode, setProjectsMode] = useState<"save" | "open">("save");
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);
  const [currentClientName, setCurrentClientName] = useState("");
  const [currentClientPhone, setCurrentClientPhone] = useState("");
  const konvaStageRef = useRef<Konva.Stage | null>(null);

  const handleAddWall = useCallback(
    (wall: Wall) => {
      setDrawingState((prev) => {
        const newWalls = [...prev.walls, wall];
        setHistory((h) => pushState(h, { walls: newWalls, cabinets: prev.cabinets, openings: prev.openings }));
        return {
          ...prev,
          walls: newWalls,
          startPoint: null,
          previewPoint: null,
          isDrawing: false,
        };
      });
    },
    []
  );

  const handleAddCabinet = useCallback(
    (cabinet: Cabinet) => {
      setDrawingState((prev) => {
        const violation = checkClearanceViolation(cabinet.start, cabinet.end, cabinet.type, prev.openings, prev.walls);
        if (violation) {
          toast({ title: violation.reason, variant: "destructive" });
          return prev;
        }

        let newCabinets = [...prev.cabinets];

        if (cabinet.type === "tall") {
          const overlapping = findOverlappingCabinets(
            cabinet.start,
            cabinet.end,
            newCabinets,
            ["base", "wall_cabinet"]
          );

          for (const existingCab of overlapping) {
            const result = splitCabinetAroundTall(existingCab, cabinet.start, cabinet.end);
            newCabinets = newCabinets.filter((c) => c.id !== existingCab.id);
            if (result.before) newCabinets.push(result.before);
            if (result.after) newCabinets.push(result.after);
          }
        }

        newCabinets.push(cabinet);
        setHistory((h) => pushState(h, { walls: prev.walls, cabinets: newCabinets, openings: prev.openings }));
        return {
          ...prev,
          cabinets: newCabinets,
          startPoint: null,
          previewPoint: null,
          isDrawing: false,
        };
      });
    },
    [toast]
  );

  const handleAddOpening = useCallback(
    (opening: Opening) => {
      setDrawingState((prev) => {
        const newOpenings = [...prev.openings, opening];
        setHistory((h) => pushState(h, { walls: prev.walls, cabinets: prev.cabinets, openings: newOpenings }));
        return {
          ...prev,
          openings: newOpenings,
          startPoint: null,
          previewPoint: null,
          isDrawing: false,
        };
      });
    },
    []
  );

  const handleUpdateWall = useCallback(
    (id: string, updates: Partial<Wall>) => {
      setDrawingState((prev) => {
        const newWalls = prev.walls.map((w) =>
          w.id === id ? { ...w, ...updates } : w
        );
        return { ...prev, walls: newWalls };
      });
    },
    []
  );

  const handleUpdateCabinet = useCallback(
    (id: string, updates: Partial<Cabinet>) => {
      setDrawingState((prev) => {
        const newCabinets = prev.cabinets.map((c) =>
          c.id === id
            ? {
              ...c,
              ...updates,
              length: distanceBetween(
                updates.start || c.start,
                updates.end || c.end
              ),
            }
            : c
        );
        return { ...prev, cabinets: newCabinets };
      });
    },
    []
  );

  const handleMoveComplete = useCallback(() => {
    setDrawingState((prev) => {
      setHistory((h) => pushState(h, { walls: prev.walls, cabinets: prev.cabinets, openings: prev.openings }));
      return prev;
    });
  }, []);

  const handleDeleteItem = useCallback(
    (id: string) => {
      setDrawingState((prev) => {
        const newWalls = prev.walls.filter((w) => w.id !== id);
        const newCabinets = prev.cabinets.filter((c) => c.id !== id);
        const newOpenings = prev.openings.filter((o) => o.id !== id);
        setHistory((h) => pushState(h, { walls: newWalls, cabinets: newCabinets, openings: newOpenings }));
        return {
          ...prev,
          walls: newWalls,
          cabinets: newCabinets,
          openings: newOpenings,
          selectedId: prev.selectedId === id ? null : prev.selectedId,
        };
      });
    },
    []
  );

  const handleSelectItem = useCallback((id: string | null) => {
    setDrawingState((prev) => ({ ...prev, selectedId: id }));
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((prev) => {
      const newHistory = historyUndo(prev);
      setDrawingState((ds) => ({
        ...ds,
        walls: newHistory.present.walls,
        cabinets: newHistory.present.cabinets,
        openings: newHistory.present.openings || [],
        selectedId: null,
      }));
      return newHistory;
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistory((prev) => {
      const newHistory = historyRedo(prev);
      setDrawingState((ds) => ({
        ...ds,
        walls: newHistory.present.walls,
        cabinets: newHistory.present.cabinets,
        openings: newHistory.present.openings || [],
        selectedId: null,
      }));
      return newHistory;
    });
  }, []);

  const handleClear = useCallback(() => {
    setDrawingState((prev) => ({
      ...prev,
      walls: [],
      cabinets: [],
      openings: [],
      selectedId: null,
      startPoint: null,
      previewPoint: null,
      isDrawing: false,
    }));
    setHistory((h) => pushState(h, { walls: [], cabinets: [], openings: [] }));
    toast({ title: "Canvas cleared" });
  }, [toast]);

  const captureCanvasImage = useCallback((): string | undefined => {
    const stage = konvaStageRef.current;
    if (!stage) return undefined;

    const allPoints: { x: number; y: number }[] = [];
    drawingState.walls.forEach((w) => { allPoints.push(w.start, w.end); });
    drawingState.cabinets.forEach((c) => { allPoints.push(c.start, c.end); });
    drawingState.openings.forEach((o) => { allPoints.push(o.start, o.end); });
    if (allPoints.length === 0) return undefined;

    const maxDepthPx = drawingState.cabinets.reduce((max, c) => Math.max(max, cmToPixels(c.depth)), 0);
    const extraMargin = Math.max(maxDepthPx, WALL_THICKNESS) + 40;
    const padding = 80 + extraMargin;
    const minX = Math.min(...allPoints.map((p) => p.x)) - padding;
    const minY = Math.min(...allPoints.map((p) => p.y)) - padding;
    const maxX = Math.max(...allPoints.map((p) => p.x)) + padding;
    const maxY = Math.max(...allPoints.map((p) => p.y)) + padding;
    const regionWidth = maxX - minX;
    const regionHeight = maxY - minY;

    const gridLayer = stage.findOne(".grid");
    const wasGridVisible = gridLayer?.visible();
    if (gridLayer) gridLayer.visible(false);
    stage.batchDraw();

    const scale = stage.scaleX() || 1;
    const stagePosX = stage.x();
    const stagePosY = stage.y();

    const stageMinX = minX * scale + stagePosX;
    const stageMinY = minY * scale + stagePosY;
    const stageWidth = regionWidth * scale;
    const stageHeight = regionHeight * scale;

    const dataUrl = stage.toDataURL({
      x: stageMinX,
      y: stageMinY,
      width: stageWidth,
      height: stageHeight,
      pixelRatio: 3 / scale,
      mimeType: "image/png",
    });

    if (gridLayer) gridLayer.visible(wasGridVisible ?? true);
    stage.batchDraw();

    return dataUrl;
  }, [drawingState.walls, drawingState.cabinets, drawingState.openings]);

  const handleExport = useCallback(async () => {
    try {
      const layoutImage = captureCanvasImage();
      await exportToPDF(drawingState.walls, drawingState.cabinets, selectedFinishing, currentProjectName || undefined, currentClientName || undefined, currentClientPhone || undefined, drawingState.openings, layoutImage);
      toast({ title: "PDF exported successfully" });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    }
  }, [drawingState.walls, drawingState.cabinets, drawingState.openings, selectedFinishing, currentProjectName, currentClientName, currentClientPhone, toast, captureCanvasImage]);

  const handleSaveProject = useCallback(() => {
    setProjectsMode("save");
    setProjectsOpen(true);
  }, []);

  const handleOpenProject = useCallback(() => {
    setProjectsMode("open");
    setProjectsOpen(true);
  }, []);

  const handleLoadProject = useCallback(
    (projectData: { walls: Wall[]; cabinets: Cabinet[]; openings?: Opening[] }, finishing: string, projectName: string, clientName: string, clientPhone: string) => {
      setDrawingState((prev) => ({
        ...prev,
        walls: projectData.walls || [],
        cabinets: projectData.cabinets || [],
        openings: projectData.openings || [],
        selectedId: null,
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      }));
      setSelectedFinishing(finishing || "1");
      setCurrentProjectName(projectName);
      setCurrentClientName(clientName);
      setCurrentClientPhone(clientPhone);
      setHistory(createHistory({ walls: projectData.walls || [], cabinets: projectData.cabinets || [], openings: projectData.openings || [] }));
      setProjectsOpen(false);
      toast({ title: `Loaded: ${projectName}` });
    },
    [toast]
  );

  const getProjectData = useCallback(() => ({
    walls: drawingState.walls,
    cabinets: drawingState.cabinets,
    openings: drawingState.openings,
    selectedFinishing,
  }), [drawingState.walls, drawingState.cabinets, drawingState.openings, selectedFinishing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          handleUndo();
        } else if (e.key === "y") {
          e.preventDefault();
          handleRedo();
        } else if (e.key === "s") {
          e.preventDefault();
          handleSaveProject();
        } else if (e.key === "o") {
          e.preventDefault();
          handleOpenProject();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case "v":
          setDrawingState((prev) => ({ ...prev, tool: "select" }));
          break;
        case "h":
          setDrawingState((prev) => ({ ...prev, tool: "pan" }));
          break;
        case "w":
          setDrawingState((prev) => ({ ...prev, tool: "wall" }));
          break;
        case "b":
          setDrawingState((prev) => ({ ...prev, tool: "base" }));
          break;
        case "u":
          setDrawingState((prev) => ({ ...prev, tool: "wall_cabinet" }));
          break;
        case "t":
          setDrawingState((prev) => ({ ...prev, tool: "tall" }));
          break;
        case "r":
          setDrawingState((prev) => ({ ...prev, tool: "door" }));
          break;
        case "n":
          setDrawingState((prev) => ({ ...prev, tool: "window" }));
          break;
        case "d":
          setDrawingState((prev) => ({ ...prev, tool: "delete" }));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo, handleSaveProject, handleOpenProject]);

  return (
    <div className="flex h-screen w-full" data-testid="designer-page">
      <div className="w-[220px] shrink-0">
        <Toolbar
          activeTool={drawingState.tool}
          onToolChange={(tool) =>
            setDrawingState((prev) => ({
              ...prev,
              tool,
              startPoint: null,
              previewPoint: null,
              isDrawing: false,
            }))
          }
          snapEnabled={drawingState.snapEnabled}
          onSnapToggle={() =>
            setDrawingState((prev) => ({ ...prev, snapEnabled: !prev.snapEnabled }))
          }
          gridEnabled={drawingState.gridEnabled}
          onGridToggle={() =>
            setDrawingState((prev) => ({ ...prev, gridEnabled: !prev.gridEnabled }))
          }
          unit={drawingState.unit}
          onUnitToggle={() =>
            setDrawingState((prev) => ({
              ...prev,
              unit: prev.unit === "cm" ? "m" : "cm",
            }))
          }
          canUndo={checkCanUndo(history)}
          canRedo={checkCanRedo(history)}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onClear={handleClear}
          onExport={handleExport}
          onSave={handleSaveProject}
          onOpen={handleOpenProject}
          onAdmin={() => navigate("/admin")}
          currentProject={currentProjectName}
        />
      </div>

      <DesignerCanvas
        drawingState={drawingState}
        onDrawingStateChange={setDrawingState}
        onAddWall={handleAddWall}
        onAddCabinet={handleAddCabinet}
        onAddOpening={handleAddOpening}
        onUpdateWall={handleUpdateWall}
        onUpdateCabinet={handleUpdateCabinet}
        onMoveComplete={handleMoveComplete}
        onDeleteItem={handleDeleteItem}
        onSelectItem={handleSelectItem}
        onStageRef={(stage) => { konvaStageRef.current = stage; }}
      />

      <div className="w-[260px] shrink-0">
        <PricingPanel
          cabinets={drawingState.cabinets}
          walls={drawingState.walls}
          selectedFinishing={selectedFinishing}
          onFinishingChange={setSelectedFinishing}
        />
      </div>

      <ProjectsDialog
        open={projectsOpen}
        onOpenChange={setProjectsOpen}
        mode={projectsMode}
        onModeChange={setProjectsMode}
        projectData={getProjectData()}
        onLoadProject={handleLoadProject}
      />
    </div>
  );
}
