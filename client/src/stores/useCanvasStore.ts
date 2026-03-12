import { create } from "zustand";
import type { Wall, Cabinet, Opening, DrawingState } from "@/lib/kitchen-engine";
import { createInitialDrawingState } from "@/lib/kitchen-engine";
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

interface DesignData {
  walls: Wall[];
  cabinets: Cabinet[];
  openings: Opening[];
  elements: CanvasElement[];
  wallPoints: WallPointItem[];
}

interface CanvasState {
  drawingState: DrawingState;
  elements: CanvasElement[];
  wallPoints: WallPointItem[];
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
  undo: () => void;
  redo: () => void;
  clear: () => void;
  moveComplete: () => void;
  setSelectedFinishing: (id: string) => void;
  toggleReferenceOverlay: () => void;
  loadFromCanvasData: (data: Partial<DesignData> & { selectedFinishing?: string }) => void;
  getCanvasData: () => DesignData & { selectedFinishing: string };
}

function pushDesignState(
  set: (fn: (state: CanvasState) => Partial<CanvasState>) => void,
  get: () => CanvasState,
  drawingState: DrawingState,
  elements?: CanvasElement[]
) {
  const currentElements = elements ?? get().elements;
  const currentWallPoints = get().wallPoints;
  set((state) => ({
    drawingState,
    history: pushState(state.history, {
      walls: drawingState.walls,
      cabinets: drawingState.cabinets,
      openings: drawingState.openings,
      elements: currentElements,
      wallPoints: currentWallPoints,
    }),
  }));
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  drawingState: createInitialDrawingState(),
  elements: [],
  wallPoints: [],
  history: createHistory({ walls: [], cabinets: [], openings: [], elements: [], wallPoints: [] }),
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

  addWall: (wall) => {
    const state = get();
    const newDrawingState = {
      ...state.drawingState,
      walls: [...state.drawingState.walls, wall],
      startPoint: null,
      previewPoint: null,
      isDrawing: false,
    };
    pushDesignState(set, get, newDrawingState);
  },

  addCabinet: (cabinet) => {
    const state = get();
    const newCabinets = [...state.drawingState.cabinets, cabinet];
    const newDrawingState = {
      ...state.drawingState,
      cabinets: newCabinets,
      startPoint: null,
      previewPoint: null,
      isDrawing: false,
    };
    pushDesignState(set, get, newDrawingState);
  },

  addOpening: (opening) => {
    const state = get();
    const newDrawingState = {
      ...state.drawingState,
      openings: [...state.drawingState.openings, opening],
      startPoint: null,
      previewPoint: null,
      isDrawing: false,
    };
    pushDesignState(set, get, newDrawingState);
  },

  updateWall: (id, updates) =>
    set((state) => ({
      drawingState: {
        ...state.drawingState,
        walls: state.drawingState.walls.map((w) =>
          w.id === id ? { ...w, ...updates } : w
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
    const state = get();
    const newDrawingState = {
      ...state.drawingState,
      walls: state.drawingState.walls.filter((w) => w.id !== id),
      cabinets: state.drawingState.cabinets.filter((c) => c.id !== id),
      openings: state.drawingState.openings.filter((o) => o.id !== id),
      selectedId: state.drawingState.selectedId === id ? null : state.drawingState.selectedId,
    };
    set((s) => ({
      history: pushState(s.history, {
        walls: newDrawingState.walls,
        cabinets: newDrawingState.cabinets,
        openings: newDrawingState.openings,
        elements: s.elements,
        wallPoints: s.wallPoints,
      }),
      drawingState: newDrawingState,
    }));
  },

  selectItem: (id) =>
    set((state) => ({
      drawingState: { ...state.drawingState, selectedId: id },
    })),

  addElement: (element) => {
    const state = get();
    const newElements = [...state.elements, element];
    set((s) => ({
      elements: newElements,
      history: pushState(s.history, {
        walls: s.drawingState.walls,
        cabinets: s.drawingState.cabinets,
        openings: s.drawingState.openings,
        elements: newElements,
        wallPoints: s.wallPoints,
      }),
    }));
  },

  updateElement: (id, updates) =>
    set((state) => ({
      elements: state.elements.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    })),

  deleteElement: (id) =>
    set((state) => ({
      elements: state.elements.filter((e) => e.id !== id),
    })),

  addWallPoint: (point) =>
    set((state) => ({
      wallPoints: [...state.wallPoints, { ...point, id: Date.now() }],
    })),

  updateWallPoint: (id, updates) =>
    set((state) => ({
      wallPoints: state.wallPoints.map((wp) =>
        wp.id === id ? { ...wp, ...updates } : wp
      ),
    })),

  deleteWallPoint: (id) =>
    set((state) => ({
      wallPoints: state.wallPoints.filter((wp) => wp.id !== id),
    })),

  undo: () =>
    set((state) => {
      const newHistory = historyUndo(state.history);
      return {
        history: newHistory,
        elements: newHistory.present.elements,
        wallPoints: newHistory.present.wallPoints ?? [],
        drawingState: {
          ...state.drawingState,
          walls: newHistory.present.walls,
          cabinets: newHistory.present.cabinets,
          openings: newHistory.present.openings,
          selectedId: null,
        },
      };
    }),

  redo: () =>
    set((state) => {
      const newHistory = historyRedo(state.history);
      return {
        history: newHistory,
        elements: newHistory.present.elements,
        wallPoints: newHistory.present.wallPoints ?? [],
        drawingState: {
          ...state.drawingState,
          walls: newHistory.present.walls,
          cabinets: newHistory.present.cabinets,
          openings: newHistory.present.openings,
          selectedId: null,
        },
      };
    }),

  clear: () => {
    const emptyData: DesignData = { walls: [], cabinets: [], openings: [], elements: [], wallPoints: [] };
    set((state) => ({
      elements: [],
      wallPoints: [],
      history: pushState(state.history, emptyData),
      drawingState: {
        ...state.drawingState,
        walls: [],
        cabinets: [],
        openings: [],
        selectedId: null,
        startPoint: null,
        previewPoint: null,
        isDrawing: false,
      },
    }));
  },

  moveComplete: () => {
    const state = get();
    set((s) => ({
      history: pushState(s.history, {
        walls: state.drawingState.walls,
        cabinets: state.drawingState.cabinets,
        openings: state.drawingState.openings,
        elements: state.elements,
        wallPoints: state.wallPoints,
      }),
    }));
  },

  setSelectedFinishing: (id) => set({ selectedFinishing: id }),

  toggleReferenceOverlay: () =>
    set((state) => ({ showReferenceOverlay: !state.showReferenceOverlay })),

  loadFromCanvasData: (data) => {
    const walls = data.walls ?? [];
    const cabinets = data.cabinets ?? [];
    const openings = data.openings ?? [];
    const elements = data.elements ?? [];
    const wallPoints = data.wallPoints ?? [];
    set((state) => ({
      elements,
      wallPoints,
      selectedFinishing: data.selectedFinishing ?? "1",
      history: createHistory({ walls, cabinets, openings, elements, wallPoints }),
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
      selectedFinishing: state.selectedFinishing,
    };
  },
}));
