import { create } from "zustand";

export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "sales" | "technician";
  displayName: string;
  canSeeCosts: boolean;
  canAccessAdmin: boolean;
  canAccessScheduleBuilder: boolean;
  canDeleteProjects: boolean;
  isActive: boolean;
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

/** Read one permission flag. Defaults closed while the session is loading. */
export function usePermission(key: keyof Pick<
  AuthUser,
  "canSeeCosts" | "canAccessAdmin" | "canAccessScheduleBuilder" | "canDeleteProjects"
>): boolean {
  return useAuthStore((s) => !!s.user?.[key]);
}
