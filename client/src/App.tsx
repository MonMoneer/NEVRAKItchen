import { Switch, Route, Redirect, useLocation } from "wouter";
import { lazy, Suspense, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/useAuthStore";
import type { AuthUser } from "@/stores/useAuthStore";

const Designer = lazy(() => import("@/pages/designer"));
const Admin = lazy(() => import("@/pages/admin"));
const Login = lazy(() => import("@/pages/login"));
const Projects = lazy(() => import("@/pages/projects"));
const ProjectDetail = lazy(() => import("@/pages/project-detail"));
const NotFound = lazy(() => import("@/pages/not-found"));

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const [, navigate] = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function Router() {
  const { setUser, setLoading } = useAuthStore();

  // Check session on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setUser(data?.user ?? null);
      })
      .catch(() => setUser(null));
  }, [setUser]);

  return (
    <Switch>
      <Route path="/login">
        <Suspense fallback={null}>
          <Login />
        </Suspense>
      </Route>

      <Route path="/projects">
        <AuthGuard>
          <Suspense fallback={null}>
            <Projects />
          </Suspense>
        </AuthGuard>
      </Route>

      <Route path="/projects/:id">
        {(params) => (
          <AuthGuard>
            <Suspense fallback={null}>
              <ProjectDetail id={parseInt(params.id)} />
            </Suspense>
          </AuthGuard>
        )}
      </Route>

      <Route path="/admin">
        <AuthGuard>
          <Suspense fallback={null}>
            <Admin />
          </Suspense>
        </AuthGuard>
      </Route>

      {/* Legacy designer route — keep for direct canvas access */}
      <Route path="/designer">
        <AuthGuard>
          <Suspense fallback={null}>
            <Designer />
          </Suspense>
        </AuthGuard>
      </Route>

      <Route path="/">
        <Redirect to="/projects" />
      </Route>

      <Route>
        <Suspense fallback={null}>
          <NotFound />
        </Suspense>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
