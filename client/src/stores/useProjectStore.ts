import { create } from "zustand";

export type ProjectStage = "estimated_budget" | "site_measurement" | "final";

export interface ProjectSpace {
  id: number;
  projectId: number;
  name: string;
  type: string;
  canvasData: unknown;
  siteMeasurementData: unknown;
  finishing: string | null;
  notes: string;
  sortOrder: number;
  referenceImage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: number;
  name: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  address: string;
  stage: ProjectStage;
  notes: string;
  selectedFinishing: string | null;
  createdAt: string;
  updatedAt: string;
  spaceCount?: number;
  spaces?: ProjectSpace[];
}

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  // Actions
  setProjects: (projects: Project[]) => void;
  setCurrentProject: (project: Project | null) => void;
  updateCurrentProject: (updates: Partial<Project>) => void;
  upsertProject: (project: Project) => void;
  removeProject: (id: number) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,

  setProjects: (projects) => set({ projects }),

  setCurrentProject: (project) => set({ currentProject: project }),

  updateCurrentProject: (updates) =>
    set((state) => ({
      currentProject: state.currentProject
        ? { ...state.currentProject, ...updates }
        : null,
    })),

  upsertProject: (project) =>
    set((state) => {
      const exists = state.projects.find((p) => p.id === project.id);
      return {
        projects: exists
          ? state.projects.map((p) => (p.id === project.id ? project : p))
          : [project, ...state.projects],
      };
    }),

  removeProject: (id) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      currentProject: state.currentProject?.id === id ? null : state.currentProject,
    })),
}));
