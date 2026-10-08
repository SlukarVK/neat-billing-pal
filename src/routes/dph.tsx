import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useAccountNames, accountLabel } from "@/lib/accounting";
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
  const accountNames = useAccountNames();
  void accountNames;
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
        .select("id, status, total, invoice_items(quantity, unit_price, vat_rate)");
      let recQ = supabase.from("received_invoices").select("subtotal, vat_rate, vat_amount");
      let entQ = supabase.from("accounting_entries").select("account, direction, amount, entry_date");
      if (from) {
        invQ = invQ.gte("taxable_date", from);
        recQ = recQ.gte("taxable_date", from);
        entQ = entQ.gte("entry_date", from);
      }
      if (to) {
        invQ = invQ.lte("taxable_date", to);
        recQ = recQ.lte("taxable_date", to);
        entQ = entQ.lte("entry_date", to);
      }
      const [inv, rec, ent] = await Promise.all([invQ, recQ, entQ]);
      if (inv.error) throw inv.error;
      if (rec.error) throw rec.error;
      if (ent.error) throw ent.error;
      return { invoices: inv.data ?? [], received: rec.data ?? [], entries: ent.data ?? [] };
    },
  });

  const ret = useMemo(() => {
    const out = { b21: 0, v21: 0, b12: 0, v12: 0, b0: 0 };
    for (const inv of data?.invoices ?? []) {
      for (const it of inv.invoice_items ?? []) {
        const r = Number(it.vat_rate);
        const b = Number(it.quantity) * Number(it.unit_price);
        if (r === 21) { out.b21 += b; out.v21 += (b * r) / 100; }
        else if (r === 12) { out.b12 += b; out.v12 += (b * r) / 100; }
        else if (r === 0) out.b0 += b;
      }
    }
    const inp = { b21: 0, v21: 0, b12: 0, v12: 0 };
    for (const r of data?.received ?? []) {
      const rate = Number(r.vat_rate);
      if (rate === 21) { inp.b21 += Number(r.subtotal); inp.v21 += Number(r.vat_amount); }
      else if (rate === 12) { inp.b12 += Number(r.subtotal); inp.v12 += Number(r.vat_amount); }
    }
    const outVat = out.v21 + out.v12;
    const inVat = inp.v21 + inp.v12;
    return { out, inp, outVat, inVat, result: outVat - inVat };
  }, [data]);

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
  const vatToPay = -(bal("343") + bal("341"));
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
            <Stat label="DPH k zaplacení" value={formatCurrency(vatToPay)} hint="Zůstatek účtů 343 a 341" />
            <Stat label="Přijde od klientů" value={formatCurrency(toReceive)} hint="Nezaplacené faktury (311)" />
            <Stat label="Již přijato" value={formatCurrency(received)} hint="Úhrady na účet 221" />
          </div>

          <Card className="mb-6 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Podle přiznání k DPH</CardTitle>
              <p className="text-sm text-muted-foreground">
                Orientační řádky přiznání. Odpočet (ř. 40) vychází z přijatých faktur.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Řádek</th>
                    <th className="py-2 pr-3">Popis</th>
                    <th className="py-2 pr-3 text-right">Základ</th>
                    <th className="py-2 text-right">Daň</th>
                  </tr>
                </thead>
                <tbody>
                  <RetRow r="1" d="Uskutečněná plnění – základní sazba 21 %" b={ret.out.b21} v={ret.out.v21} />
                  <RetRow r="2" d="Uskutečněná plnění – snížená sazba 12 %" b={ret.out.b12} v={ret.out.v12} />
                  <RetRow r="26" d="Plnění osvobozená / bez daně (0 %)" b={ret.out.b0} />
                  <RetRow r="40" d="Odpočet – přijatá plnění 21 % (můžete odečíst)" b={ret.inp.b21} v={ret.inp.v21} highlight />
                  <RetRow r="41" d="Odpočet – přijatá plnění 12 % (můžete odečíst)" b={ret.inp.b12} v={ret.inp.v12} highlight />
                  <RetRow r="46" d="Odpočet daně celkem" v={ret.inVat} highlight />
                  <RetRow r="62" d="Daň na výstupu celkem" v={ret.outVat} />
                  <tr className="font-semibold">
                    <td className="pt-3 pr-3">{ret.result >= 0 ? "64" : "65"}</td>
                    <td className="pt-3 pr-3">
                      {ret.result >= 0 ? "Vlastní daňová povinnost (zaplatit)" : "Nadměrný odpočet (vrátí se)"}
                    </td>
                    <td />
                    <td className="pt-3 text-right">{formatCurrency(Math.abs(ret.result))}</td>
                  </tr>
                </tbody>
              </table>
            </CardContent>
          </Card>

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

function RetRow({ r, d, b, v, highlight }: { r: string; d: string; b?: number; v?: number; highlight?: boolean }) {
  return (
    <tr className={`border-b ${highlight ? "bg-accent/50" : ""}`}>
      <td className="py-2 pr-3 font-medium">{r}</td>
      <td className="py-2 pr-3">{d}</td>
      <td className="py-2 pr-3 text-right whitespace-nowrap">{b === undefined ? "" : formatCurrency(b)}</td>
      <td className="py-2 text-right whitespace-nowrap">{v === undefined ? "" : formatCurrency(v)}</td>
    </tr>
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
