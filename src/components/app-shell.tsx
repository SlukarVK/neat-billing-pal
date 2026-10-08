import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  ListOrdered,
  BookOpen,
  FileText,
  Inbox,
  Landmark,
  LayoutList,
  LogOut,
  Menu,
  Percent,
  Plus,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/faktury", label: "Faktury", icon: LayoutList },
  { to: "/prijate", label: "Přijaté faktury", icon: Inbox },
  { to: "/prehled", label: "Přehled", icon: BarChart3 },
  { to: "/ucty", label: "Účty", icon: Landmark },
  { to: "/dph", label: "DPH", icon: Percent },
  { to: "/priznani", label: "Přiznání DPH", icon: FileText },
  { to: "/kontrolni-hlaseni", label: "Kontrolní hlášení", icon: ClipboardList },
  { to: "/ai-ucetni", label: "AI asistent", icon: Sparkles },
  { to: "/navod", label: "Návod", icon: BookOpen },
  { to: "/osnova", label: "Účty firmy", icon: ListOrdered },
  { to: "/nastaveni", label: "Nastavení", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

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

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3">
      <Button size="sm" asChild className="mb-3 justify-start shadow-pop">
        <Link to="/faktury/nova" onClick={() => setOpen(false)}>
          <Plus className="mr-2 h-4 w-4" />
          Nová faktura
        </Link>
      </Button>
      {NAV.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          activeProps={{ className: "bg-accent text-primary" }}
        >
          <Icon className="h-4 w-4" />
          {label}
        </Link>
      ))}
      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-auto flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Odhlásit se
      </button>
    </nav>
  );

  const brand = (
    <Link to="/" className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-pop">
        <FileText className="h-5 w-5 text-primary-foreground" />
      </div>
      <span className="text-xl font-bold tracking-tight">Accountrix</span>
    </Link>
  );

  return (
    <div className="min-h-screen md:pl-60">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card md:flex print:hidden">
        <div className="flex h-16 items-center border-b px-4">{brand}</div>
        {nav}
      </aside>

      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card/80 px-4 backdrop-blur-md md:hidden print:hidden">
        {brand}
        <Button variant="ghost" size="icon" onClick={() => setOpen(!open)} aria-label="Nabídka">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>
      {open && (
        <div className="fixed inset-x-0 top-14 bottom-0 z-40 flex flex-col overflow-y-auto bg-card md:hidden print:hidden">
          {nav}
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 print:p-0">{children}</main>
    </div>
  );
}
