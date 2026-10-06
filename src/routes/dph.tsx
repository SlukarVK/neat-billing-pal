import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { accountLabel } from "@/lib/accounting";
import { formatCurrency } from "@/lib/invoice-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/dph")({
  head: () => ({
    meta: [
      { title: "Vyúčtování DPH — Accountrix" },
      { name: "description", content: "DPH podle sazeb, zůstatky účtů, kolik zaplatit a kolik přijde." },
      { property: "og:title", content: "Vyúčtování DPH — Accountrix" },
      { property: "og:description", content: "DPH podle sazeb, zůstatky účtů, kolik zaplatit a kolik přijde." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VatPage,
});

function VatPage() {
  const now = new Date();
  const [from, setFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("sv-SE"),
  );
  const [to, setTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString("sv-SE"),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["vat-report", from, to],
    queryFn: async () => {
      let invQ = supabase
        .from("invoices")
        .select("id, status, total, invoice_items(quantity, unit_price, vat_rate)")
      let entQ = supabase.from("accounting_entries").select("account, direction, amount, entry_date");
      if (from) {
        invQ = invQ.gte("taxable_date", from);
        entQ = entQ.gte("entry_date", from);
      }
      if (to) {
        invQ = invQ.lte("taxable_date", to);
        entQ = entQ.lte("entry_date", to);
      }
      const [inv, ent] = await Promise.all([invQ, entQ]);
      if (inv.error) throw inv.error;
      if (ent.error) throw ent.error;
      return { invoices: inv.data ?? [], entries: ent.data ?? [] };
    },
  });

  const byRate = useMemo(() => {
    const m = new Map<number, { base: number; vat: number }>();
    for (const inv of data?.invoices ?? []) {
      for (const it of inv.invoice_items ?? []) {
        const r = Number(it.vat_rate);
        const base = Number(it.quantity) * Number(it.unit_price);
        const s = m.get(r) ?? { base: 0, vat: 0 };
        s.base += base;
        s.vat += (base * r) / 100;
        m.set(r, s);
      }
    }
    return [...m.entries()].sort(([a], [b]) => b - a);
  }, [data]);

  const accounts = useMemo(() => {
    const m = new Map<string, { md: number; d: number }>();
    for (const e of data?.entries ?? []) {
      const s = m.get(e.account) ?? { md: 0, d: 0 };
      if (e.direction === "MD") s.md += Number(e.amount);
      else s.d += Number(e.amount);
      m.set(e.account, s);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  const bal = (acc: string) => {
    const s = accounts.find(([a]) => a === acc)?.[1];
    return s ? s.md - s.d : 0;
  };
  const vatToPay = -bal("343");
  const toReceive = bal("311");
  const received = (data?.entries ?? [])
    .filter((e) => e.account === "221" && e.direction === "MD")
    .reduce((s, e) => s + Number(e.amount), 0);
  const totalVat = byRate.reduce((s, [, v]) => s + v.vat, 0);
  const totalBase = byRate.reduce((s, [, v]) => s + v.base, 0);

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-3xl font-bold">Vyúčtování DPH</h1>
          <p className="text-muted-foreground">Kolik zaplatit na DPH a kolik vám přijde od klientů.</p>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Od</p>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Do</p>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="DPH k zaplacení" value={formatCurrency(vatToPay)} hint="Zůstatek účtu 343" />
            <Stat label="Přijde od klientů" value={formatCurrency(toReceive)} hint="Nezaplacené faktury (311)" />
            <Stat label="Již přijato" value={formatCurrency(received)} hint="Úhrady na účet 221" />
          </div>

          <Card className="mb-6 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">DPH podle sazeb</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Sazba</th>
                    <th className="py-2 pr-3 text-right">Základ</th>
                    <th className="py-2 pr-3 text-right">DPH</th>
                    <th className="py-2 text-right">Celkem</th>
                  </tr>
                </thead>
                <tbody>
                  {byRate.map(([r, v]) => (
                    <tr key={r} className="border-b">
                      <td className="py-2 pr-3 font-medium">{r} %</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(v.base)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(v.vat)}</td>
                      <td className="py-2 text-right">{formatCurrency(v.base + v.vat)}</td>
                    </tr>
                  ))}
                  {!byRate.length && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        V tomto období nejsou žádné vystavené faktury.
                      </td>
                    </tr>
                  )}
                </tbody>
                {byRate.length > 0 && (
                  <tfoot className="font-semibold">
                    <tr>
                      <td className="pt-2">Celkem</td>
                      <td className="pt-2 text-right">{formatCurrency(totalBase)}</td>
                      <td className="pt-2 text-right">{formatCurrency(totalVat)}</td>
                      <td className="pt-2 text-right">{formatCurrency(totalBase + totalVat)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Zůstatky účtů za období</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Účet</th>
                    <th className="py-2 pr-3 text-right">Má dáti</th>
                    <th className="py-2 pr-3 text-right">Dal</th>
                    <th className="py-2 text-right">Zůstatek</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(([a, v]) => (
                    <tr key={a} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{accountLabel(a)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(v.md)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(v.d)}</td>
                      <td className="py-2 text-right font-semibold">{formatCurrency(v.md - v.d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">
                DPH na vstupu se zapisuje automaticky ze stránky Přijaté faktury (účet 343 Má dáti) —
                sníží částku k zaplacení.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
