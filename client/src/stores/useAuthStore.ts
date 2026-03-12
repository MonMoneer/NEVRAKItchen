import { create } from "zustand";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "sales" | "technician";
  createdAt: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  // Actions
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),

  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null });
  },
}));
