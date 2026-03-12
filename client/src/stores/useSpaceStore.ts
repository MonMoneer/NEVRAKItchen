import { create } from "zustand";
import type { ProjectSpace } from "./useProjectStore";

interface SpaceState {
  spaces: ProjectSpace[];
  activeSpaceId: number | null;
  // Actions
  setSpaces: (spaces: ProjectSpace[]) => void;
  setActiveSpaceId: (id: number | null) => void;
  updateSpace: (id: number, updates: Partial<ProjectSpace>) => void;
  addSpace: (space: ProjectSpace) => void;
  removeSpace: (id: number) => void;
  reorderSpaces: (spaces: ProjectSpace[]) => void;
  getActiveSpace: () => ProjectSpace | undefined;
}

export const useSpaceStore = create<SpaceState>((set, get) => ({
  spaces: [],
  activeSpaceId: null,

  setSpaces: (spaces) =>
    set({
      spaces,
      activeSpaceId: spaces.length > 0 ? spaces[0].id : null,
    }),

  setActiveSpaceId: (id) => set({ activeSpaceId: id }),

  updateSpace: (id, updates) =>
    set((state) => ({
      spaces: state.spaces.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    })),

  addSpace: (space) =>
    set((state) => ({
      spaces: [...state.spaces, space],
      activeSpaceId: space.id,
    })),

  removeSpace: (id) =>
    set((state) => {
      const remaining = state.spaces.filter((s) => s.id !== id);
      const newActiveId =
        state.activeSpaceId === id
          ? remaining.length > 0
            ? remaining[0].id
            : null
          : state.activeSpaceId;
      return { spaces: remaining, activeSpaceId: newActiveId };
    }),

  reorderSpaces: (spaces) => set({ spaces }),

  getActiveSpace: () => {
    const { spaces, activeSpaceId } = get();
    return spaces.find((s) => s.id === activeSpaceId);
  },
}));
