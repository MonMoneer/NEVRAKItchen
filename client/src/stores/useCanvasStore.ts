import { create } from "zustand";
import type { Wall, Cabinet, Opening, DrawingState, Guideline, Layer, Island, Point } from "@/lib/kitchen-engine";
import { createInitialDrawingState, normalizeLayer, normalizeIsland, reorientWalls } from "@/lib/kitchen-engine";
import {
  type HistoryState,
  createHistory,
  pushState,
  undo as historyUndo,
  redo as historyRedo,
  canUndo as checkCanUndo,
  canRedo as checkCanRedo,
} from "@/lib/history";

export interface CanvasElement {
  id: string;
  definitionId: number;
  x: number;
  y: number;
  rotation: number;
  name: string;
  category: string;
  icon: string;
}

export interface WallPointItem {
  id: number;
  type: "electrical" | "plumbing";
  posX: number;
  posY: number;
  distanceCm: number;
  heightCm: number;
  photo?: string;
  note: string;
  wallId?: string;
}

export type IslandDrawingState =
  | { phase: "idle" }
  | { phase: "pickingCorner1" }
  | { phase: "draggingLength"; anchor: Point }
  | { phase: "draggingDepth"; anchor: Point; lengthCm: number; axis: "h" | "v"; lengthSign: number };

interface DesignData {
  walls: Wall[];
  cabinets: Cabinet[];
  openings: Opening[];
  elements: CanvasElement[];
  wallPoints: WallPointItem[];
  guidelines: Guideline[];
  layers?: Layer[];
  islands?: Island[];
}

interface CanvasState {
  drawingState: DrawingState;
  elements: CanvasElement[];
  wallPoints: WallPointItem[];
  guidelines: Guideline[];
  layers: Layer[];
  activeLayerId: string | null;
  islands: Island[];
  islandDrawingState: IslandDrawingState;
  history: HistoryState<DesignData>;
  selectedFinishing: string;
  showReferenceOverlay: boolean;

  // Computed
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Actions
  setDrawingState: (updater: DrawingState | ((prev: DrawingState) => DrawingState)) => void;
  setTool: (tool: DrawingState["tool"]) => void;
  addWall: (wall: Wall) => void;
  addCabinet: (cabinet: Cabinet) => void;
  addOpening: (opening: Opening) => void;
  updateWall: (id: string, updates: Partial<Wall>) => void;
  updateCabinet: (id: string, updates: Partial<Cabinet>) => void;
  deleteItem: (id: string) => void;
  selectItem: (id: string | null) => void;
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, updates: Partial<CanvasElement>) => void;
  deleteElement: (id: string) => void;
  addWallPoint: (point: Omit<WallPointItem, "id">) => void;
  updateWallPoint: (id: number, updates: Partial<Omit<WallPointItem, "id">>) => void;
  deleteWallPoint: (id: number) => void;
  addGuideline: (guideline: Guideline) => void;
  deleteGuideline: (id: string) => void;
  clearGuidelines: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  moveComplete: () => void;
  setSelectedFinishing: (id: string) => void;
  toggleReferenceOverlay: () => void;
  addLayer: (layer: Layer) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  /** Move layer from `fromIndex` to `toIndex` in the layers array. */
  reorderLayer: (fromIndex: number, toIndex: number) => void;
  setActiveLayer: (id: string | null) => void;
  addIsland: (island: Island) => void;
  updateIsland: (id: string, updates: Partial<Island>) => void;
  removeIsland: (id: string) => void;
  startIslandDraw: () => void;
  cancelIslandDraw: () => void;
  setIslandPhase: (next: IslandDrawingState) => void;
  loadFromCanvasData: (data: any) => void;
  getCanvasData: () => DesignData & { selectedFinishing: string; layers: Layer[]; islands: Island[] };
}

/**
 * Build a full snapshot of the store's history-tracked state. Every field
 * that should survive undo/redo must appear here. Keep in sync with
 * `undo()` / `redo()` restoration logic below.
 */
function buildSnapshot(state: CanvasState): DesignData {
  return {
    walls: state.drawingState.walls,
    cabinets: state.drawingState.cabinets,
    openings: state.drawingState.openings,
    elements: state.elements,
    wallPoints: state.wallPoints,
    guidelines: state.guidelines,
    layers: state.layers,
    islands: state.islands,
  };
}

/**
 * Push the current store state as a new history entry. Call this from any
 * mutation that the user should be able to undo with one Ctrl+Z. For
 * mutations that produce multiple field changes, call this AFTER applying
 * them in the same `set` so the snapshot reflects the post-mutation state.
 */
function pushHistoryFromState(
  state: CanvasState,
): HistoryState<DesignData> {
  return pushState(state.history, buildSnapshot(state));
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  drawingState: createInitialDrawingState(),
  elements: [],
  wallPoints: [],
  guidelines: [],
  layers: [],
  activeLayerId: null,
  islands: [],
  islandDrawingState: { phase: "idle" },
  history: createHistory({ walls: [], cabinets: [], openings: [], elements: [], wallPoints: [], guidelines: [], layers: [], islands: [] }),
  selectedFinishing: "1",
  showReferenceOverlay: false,

  canUndo: () => checkCanUndo(get().history),
  canRedo: () => checkCanRedo(get().history),

  setDrawingState: (updater) =>
    set((state) => ({
      drawingState:
        typeof updater === "function" ? updater(state.drawingState) : updater,
    })),

  setTool: (tool: DrawingState["tool"]) =>
    set((state) => ({
      drawingState: {
        ...state.drawingState,
        tool,
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      },
    })),

  addWall: (wall) =>
    set((state) => {
      const newWalls = reorientWalls([...state.drawingState.walls, wall]);
      const newDrawingState = {
        ...state.drawingState,
        walls: newWalls,
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      };
      const next: CanvasState = { ...state, drawingState: newDrawingState };
      return { drawingState: newDrawingState, history: pushHistoryFromState(next) };
    }),

  addCabinet: (cabinet) =>
    set((state) => {
      const cabinetWithLayer = state.activeLayerId
        ? { ...cabinet, layerId: state.activeLayerId }
        : cabinet;
      const newCabinets = [...state.drawingState.cabinets, cabinetWithLayer];
      const newDrawingState = {
        ...state.drawingState,
        cabinets: newCabinets,
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      };
      const newLayers = state.activeLayerId
        ? state.layers.map((l) =>
            l.id === state.activeLayerId
              ? { ...l, cabinetIds: [...l.cabinetIds, cabinetWithLayer.id] }
              : l
          )
        : state.layers;
      const next: CanvasState = {
        ...state,
        layers: newLayers,
        drawingState: newDrawingState,
      };
      return {
        layers: newLayers,
        drawingState: newDrawingState,
        history: pushHistoryFromState(next),
      };
    }),

  addOpening: (opening) =>
    set((state) => {
      const newDrawingState = {
        ...state.drawingState,
        openings: [...state.drawingState.openings, opening],
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      };
      const next: CanvasState = { ...state, drawingState: newDrawingState };
      return { drawingState: newDrawingState, history: pushHistoryFromState(next) };
    }),

  // updateWall / updateCabinet are intentionally NOT pushing history here:
  // they're called during live drags and would flood the stack. Callers do
  // one of two things after a discrete edit:
  //   1. Continuous drag → call `moveComplete()` on mouseup, which pushes
  //      a single snapshot of the final state.
  //   2. One-shot edit (flip button, dimension input) → call
  //      `moveComplete()` immediately after.
  updateWall: (id, updates) =>
    set((state) => ({
      drawingState: {
        ...state.drawingState,
        walls: reorientWalls(
          state.drawingState.walls.map((w) =>
            w.id === id ? { ...w, ...updates } : w
          )
        ),
      },
    })),

  updateCabinet: (id, updates) =>
    set((state) => ({
      drawingState: {
        ...state.drawingState,
        cabinets: state.drawingState.cabinets.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      },
    })),

  deleteItem: (id) => {
    set((state) => {
      const newDrawingState = {
        ...state.drawingState,
        walls: reorientWalls(state.drawingState.walls.filter((w) => w.id !== id)),
        cabinets: state.drawingState.cabinets.filter((c) => c.id !== id),
        openings: state.drawingState.openings.filter((o) => o.id !== id),
        selectedId: state.drawingState.selectedId === id ? null : state.drawingState.selectedId,
      };
      const newGuidelines = state.guidelines.filter((g) => g.id !== id);
      const next: CanvasState = {
        ...state,
        drawingState: newDrawingState,
        guidelines: newGuidelines,
      };
      return {
        drawingState: newDrawingState,
        guidelines: newGuidelines,
        history: pushHistoryFromState(next),
      };
    });
  },

  selectItem: (id) =>
    set((state) => ({
      drawingState: { ...state.drawingState, selectedId: id },
    })),

  addElement: (element) =>
    set((state) => {
      const newElements = [...state.elements, element];
      const next: CanvasState = { ...state, elements: newElements };
      return { elements: newElements, history: pushHistoryFromState(next) };
    }),

  updateElement: (id, updates) =>
    set((state) => {
      const newElements = state.elements.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      );
      const next: CanvasState = { ...state, elements: newElements };
      return { elements: newElements, history: pushHistoryFromState(next) };
    }),

  deleteElement: (id) =>
    set((state) => {
      const newElements = state.elements.filter((e) => e.id !== id);
      const next: CanvasState = { ...state, elements: newElements };
      return { elements: newElements, history: pushHistoryFromState(next) };
    }),

  addWallPoint: (point) =>
    set((state) => {
      const newWallPoints = [...state.wallPoints, { ...point, id: Date.now() }];
      const next: CanvasState = { ...state, wallPoints: newWallPoints };
      return { wallPoints: newWallPoints, history: pushHistoryFromState(next) };
    }),

  updateWallPoint: (id, updates) =>
    set((state) => {
      const newWallPoints = state.wallPoints.map((wp) =>
        wp.id === id ? { ...wp, ...updates } : wp
      );
      const next: CanvasState = { ...state, wallPoints: newWallPoints };
      return { wallPoints: newWallPoints, history: pushHistoryFromState(next) };
    }),

  deleteWallPoint: (id) =>
    set((state) => {
      const newWallPoints = state.wallPoints.filter((wp) => wp.id !== id);
      const next: CanvasState = { ...state, wallPoints: newWallPoints };
      return { wallPoints: newWallPoints, history: pushHistoryFromState(next) };
    }),

  addGuideline: (guideline) =>
    set((state) => {
      const newGuidelines = [...state.guidelines, guideline];
      const next: CanvasState = { ...state, guidelines: newGuidelines };
      return { guidelines: newGuidelines, history: pushHistoryFromState(next) };
    }),

  deleteGuideline: (id) =>
    set((state) => {
      const newGuidelines = state.guidelines.filter((g) => g.id !== id);
      const next: CanvasState = { ...state, guidelines: newGuidelines };
      return { guidelines: newGuidelines, history: pushHistoryFromState(next) };
    }),

  clearGuidelines: () =>
    set((state) => {
      const next: CanvasState = { ...state, guidelines: [] };
      return { guidelines: [], history: pushHistoryFromState(next) };
    }),

  undo: () =>
    set((state) => {
      const newHistory = historyUndo(state.history);
      const snap = newHistory.present;
      const nextLayers = snap.layers ?? [];
      const activeLayerStillExists = state.activeLayerId
        ? nextLayers.some((l) => l.id === state.activeLayerId)
        : false;
      return {
        history: newHistory,
        elements: snap.elements,
        wallPoints: snap.wallPoints ?? [],
        guidelines: snap.guidelines ?? [],
        layers: nextLayers,
        islands: snap.islands ?? [],
        activeLayerId: activeLayerStillExists
          ? state.activeLayerId
          : (nextLayers[0]?.id ?? null),
        drawingState: {
          ...state.drawingState,
          walls: snap.walls,
          cabinets: snap.cabinets,
          openings: snap.openings,
          selectedId: null,
        },
      };
    }),

  redo: () =>
    set((state) => {
      const newHistory = historyRedo(state.history);
      const snap = newHistory.present;
      const nextLayers = snap.layers ?? [];
      const activeLayerStillExists = state.activeLayerId
        ? nextLayers.some((l) => l.id === state.activeLayerId)
        : false;
      return {
        history: newHistory,
        elements: snap.elements,
        wallPoints: snap.wallPoints ?? [],
        guidelines: snap.guidelines ?? [],
        layers: nextLayers,
        islands: snap.islands ?? [],
        activeLayerId: activeLayerStillExists
          ? state.activeLayerId
          : (nextLayers[0]?.id ?? null),
        drawingState: {
          ...state.drawingState,
          walls: snap.walls,
          cabinets: snap.cabinets,
          openings: snap.openings,
          selectedId: null,
        },
      };
    }),

  clear: () => {
    set((state) => {
      const newDrawingState = {
        ...state.drawingState,
        walls: [],
        cabinets: [],
        openings: [],
        selectedId: null,
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      };
      const next: CanvasState = {
        ...state,
        elements: [],
        wallPoints: [],
        guidelines: [],
        layers: [],
        activeLayerId: null,
        islands: [],
        drawingState: newDrawingState,
      };
      return {
        elements: [],
        wallPoints: [],
        guidelines: [],
        layers: [],
        activeLayerId: null,
        islands: [],
        islandDrawingState: { phase: "idle" },
        drawingState: newDrawingState,
        history: pushHistoryFromState(next),
      };
    });
  },

  moveComplete: () => {
    set((state) => ({ history: pushHistoryFromState(state) }));
  },

  setSelectedFinishing: (id) => set({ selectedFinishing: id }),

  toggleReferenceOverlay: () =>
    set((state) => ({ showReferenceOverlay: !state.showReferenceOverlay })),

  addLayer: (layer) => {
    const state = get();
    const drawableCabinetTypes = ["base", "wall_cabinet", "tall"];
    const newLayers = [...state.layers, layer];
    const newDrawingState = drawableCabinetTypes.includes(layer.type)
      ? {
          ...state.drawingState,
          tool: layer.type as DrawingState["tool"],
          startPoint: null,
          previewPoint: null,
          isDrawing: false,
        }
      : state.drawingState;
    const next: CanvasState = {
      ...state,
      layers: newLayers,
      activeLayerId: layer.id,
      drawingState: newDrawingState,
    };
    set({
      layers: newLayers,
      activeLayerId: layer.id,
      drawingState: newDrawingState,
      history: pushHistoryFromState(next),
    });
  },

  removeLayer: (id) =>
    set((state) => {
      const newLayers = state.layers.filter((l) => l.id !== id);
      const removedLayer = state.layers.find((l) => l.id === id);
      const cabinetIdsToRemove = removedLayer?.cabinetIds ?? [];
      const newCabinets = state.drawingState.cabinets.filter(
        (c) => !cabinetIdsToRemove.includes(c.id)
      );
      const newDrawingState = { ...state.drawingState, cabinets: newCabinets, selectedId: null };
      const newIslands = state.islands.filter((i) => i.layerId !== id);
      const newActiveLayerId = state.activeLayerId === id
        ? (newLayers[0]?.id ?? null)
        : state.activeLayerId;
      const next: CanvasState = {
        ...state,
        layers: newLayers,
        activeLayerId: newActiveLayerId,
        drawingState: newDrawingState,
        islands: newIslands,
      };
      return {
        layers: newLayers,
        activeLayerId: newActiveLayerId,
        drawingState: newDrawingState,
        islands: newIslands,
        history: pushHistoryFromState(next),
      };
    }),

  updateLayer: (id, updates) =>
    set((state) => {
      const newLayers = state.layers.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      );

      // Keep cabinet geometry in sync with layer-level dimensions.
      // The sidebar's "Depth (cm)" input edits layer.depth, but the canvas
      // renders using cabinet.depth. Propagate the change to every cabinet
      // belonging to this layer so the drawn rectangle always matches the
      // value the user typed. Only runs when `depth` is actually in the patch.
      let newCabinets = state.drawingState.cabinets;
      if (
        Object.prototype.hasOwnProperty.call(updates, "depth") &&
        typeof updates.depth === "number"
      ) {
        const layer = newLayers.find((l) => l.id === id);
        const cabinetIdSet = new Set(layer?.cabinetIds ?? []);
        newCabinets = state.drawingState.cabinets.map((c) =>
          c.layerId === id || cabinetIdSet.has(c.id)
            ? { ...c, depth: updates.depth as number }
            : c
        );
      }

      const newDrawingState = { ...state.drawingState, cabinets: newCabinets };
      const next: CanvasState = {
        ...state,
        layers: newLayers,
        drawingState: newDrawingState,
      };
      return {
        layers: newLayers,
        drawingState: newDrawingState,
        history: pushHistoryFromState(next),
      };
    }),

  reorderLayer: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.layers.length ||
        toIndex >= state.layers.length
      ) {
        return {};
      }
      const nextLayers = state.layers.slice();
      const [moved] = nextLayers.splice(fromIndex, 1);
      nextLayers.splice(toIndex, 0, moved);
      const next: CanvasState = { ...state, layers: nextLayers };
      return {
        layers: nextLayers,
        history: pushHistoryFromState(next),
      };
    }),

  setActiveLayer: (id) => {
    const state = get();
    const layer = state.layers.find((l) => l.id === id);
    const drawableCabinetTypes = ["base", "wall_cabinet", "tall"];
    const update: Partial<CanvasState> = { activeLayerId: id };
    if (layer && drawableCabinetTypes.includes(layer.type)) {
      update.drawingState = {
        ...state.drawingState,
        tool: layer.type as DrawingState["tool"],
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      };
    }
    set(update);
  },

  addIsland: (island) =>
    set((state) => {
      const newIslands = [...state.islands, island];
      const next: CanvasState = { ...state, islands: newIslands };
      return { islands: newIslands, history: pushHistoryFromState(next) };
    }),

  updateIsland: (id, updates) =>
    set((state) => {
      const newIslands = state.islands.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      );
      const next: CanvasState = { ...state, islands: newIslands };
      return { islands: newIslands, history: pushHistoryFromState(next) };
    }),

  removeIsland: (id) =>
    set((state) => {
      const newIslands = state.islands.filter((i) => i.id !== id);
      const next: CanvasState = { ...state, islands: newIslands };
      return { islands: newIslands, history: pushHistoryFromState(next) };
    }),

  startIslandDraw: () =>
    set((state) => ({
      islandDrawingState: { phase: "pickingCorner1" },
      // Neutralize any in-progress tool drawing so wall/cabinet previews don't show up
      drawingState: {
        ...state.drawingState,
        tool: "select",
        isDrawing: false,
        startPoint: null,
        previewPoint: null,
      },
    })),

  cancelIslandDraw: () =>
    set({ islandDrawingState: { phase: "idle" } }),

  setIslandPhase: (next) =>
    set({ islandDrawingState: next }),

  loadFromCanvasData: (data) => {
    const walls = data.walls ?? [];
    const cabinets = data.cabinets ?? [];
    const openings = data.openings ?? [];
    const elements = data.elements ?? [];
    const wallPoints = data.wallPoints ?? [];
    const guidelines = data.guidelines ?? [];
    const layers: Layer[] = Array.isArray(data.layers) ? data.layers.map(normalizeLayer) : [];
    const islands: Island[] = Array.isArray(data.islands) ? data.islands.map(normalizeIsland) : [];
    set((state) => ({
      elements,
      wallPoints,
      guidelines,
      layers,
      islands,
      activeLayerId: layers[0]?.id ?? null,
      selectedFinishing: data.selectedFinishing ?? "1",
      islandDrawingState: { phase: "idle" },
      history: createHistory({ walls, cabinets, openings, elements, wallPoints, guidelines, layers, islands }),
      drawingState: {
        ...state.drawingState,
        walls,
        cabinets,
        openings,
        selectedId: null,
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      },
    }));
  },

  getCanvasData: () => {
    const state = get();
    return {
      walls: state.drawingState.walls,
      cabinets: state.drawingState.cabinets,
      openings: state.drawingState.openings,
      elements: state.elements,
      wallPoints: state.wallPoints,
      guidelines: state.guidelines,
      selectedFinishing: state.selectedFinishing,
      layers: state.layers,
      islands: state.islands,
    };
  },
}));
