import { useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, LogOut, Plus, LayoutList, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth" });
    }
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-pop">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">Accountrix</span>
          </Link>
          <nav className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/faktury">
                <LayoutList className="mr-1.5 h-4 w-4" />
                Faktury
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/nastaveni">
                <Settings className="mr-1.5 h-4 w-4" />
                Nastavení
              </Link>
            </Button>
            <Button size="sm" asChild className="shadow-pop">
              <Link to="/faktury/nova">
                <Plus className="mr-1.5 h-4 w-4" />
                Nová faktura
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Odhlásit se"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
