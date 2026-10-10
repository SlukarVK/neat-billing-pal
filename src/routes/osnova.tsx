import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { ACCOUNT_CATEGORIES, ACCOUNT_NAMES, useCompanyAccounts } from "@/lib/accounting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/osnova")({
  head: () => ({
    meta: [
      { title: "Účty firmy — Accountrix" },
      { name: "description", content: "Vlastní čísla, názvy a zařazení účtů firmy." },
      { property: "og:title", content: "Účty firmy — Accountrix" },
      { property: "og:description", content: "Vlastní čísla, názvy a zařazení účtů firmy." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChartPage,
});

const guessCat = (a: string) =>
  a.startsWith("21") || a.startsWith("22") ? "penize" : a.startsWith("31") ? "pohledavky" : a.startsWith("32") ? "zavazky" : a.startsWith("34") ? "dane" : a.startsWith("5") ? "naklady" : a.startsWith("6") ? "vynosy" : "ostatni";

function ChartPage() {
  const qc = useQueryClient();
  const { data: accounts = [] } = useCompanyAccounts();
  const [f, setF] = useState({ account: "", name: "", category: "ostatni" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["company-accounts"] });

  const save = useMutation({
    mutationFn: async (rows: { account: string; name: string; category: string }[]) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nejste přihlášeni.");
      const { error } = await supabase.from("company_accounts").upsert(rows.map((r) => ({ ...r, user_id: user.id })), { onConflict: "user_id,account" });
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Uloženo."); setF({ account: "", name: "", category: "ostatni" }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Uložení selhalo."),
  });

  const remove = async (id: string) => {
    const { error } = await supabase.from("company_accounts").delete().eq("id", id);
    if (error) toast.error(error.message); else refresh();
  };

  const loadDefaults = () =>
    save.mutate(Object.entries(ACCOUNT_NAMES).filter(([k]) => !accounts.some((a) => a.account === k)).map(([account, name]) => ({ account, name, category: guessCat(account) })));

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Účty firmy</h1>
          <p className="mt-1 text-muted-foreground">Zadejte čísla, názvy a zařazení svých účtů — zobrazí se všude v aplikaci.</p>
        </div>
        <Button variant="outline" onClick={loadDefaults} disabled={save.isPending}>Doplnit výchozí účty</Button>
      </div>

      <Card className="mb-6 shadow-card">
        <CardHeader>
          <CardTitle>Přidat nebo změnit účet</CardTitle>
          <CardDescription>Když zadáte číslo, které už existuje, jeho název a zařazení se přepíšou.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-[140px_1fr_220px_auto]" onSubmit={(e) => { e.preventDefault(); if (!f.account.trim() || !f.name.trim()) { toast.error("Vyplňte číslo i název účtu."); return; } save.mutate([{ ...f, account: f.account.trim(), name: f.name.trim() }]); }}>
            <Input placeholder="Číslo, např. 311100" value={f.account} onChange={(e) => setF({ ...f, account: e.target.value, category: f.category === "ostatni" ? guessCat(e.target.value) : f.category })} />
            <Input placeholder="Název účtu" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {Object.entries(ACCOUNT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Button type="submit" disabled={save.isPending}><Plus className="mr-1.5 h-4 w-4" />Uložit</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left text-muted-foreground">
              <tr><th className="px-4 py-3">Číslo</th><th className="px-4 py-3">Název</th><th className="px-4 py-3">Zařazení</th><th /></tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium">{a.account}</td>
                  <td className="px-4 py-2">{a.name}</td>
                  <td className="px-4 py-2">{ACCOUNT_CATEGORIES[a.category] ?? a.category}</td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setF({ account: a.account, name: a.name, category: a.category })}>Upravit</Button>
                    <Button variant="ghost" size="icon" aria-label="Smazat" onClick={() => remove(a.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {!accounts.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Zatím žádné vlastní účty. Klikněte na „Doplnit výchozí účty“ nebo přidejte svůj.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
