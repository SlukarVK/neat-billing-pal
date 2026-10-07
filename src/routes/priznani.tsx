import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, Printer, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useCompanyProfile } from "@/lib/company-profile";
import { formatCurrency, formatDate } from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/priznani")({
  head: () => ({
    meta: [
      { title: "Přiznání k DPH — Accountrix" },
      { name: "description", content: "Vygenerujte přiznání k DPH za zvolené období ze základů a daně." },
      { property: "og:title", content: "Přiznání k DPH — Accountrix" },
      { property: "og:description", content: "Vygenerujte přiznání k DPH za zvolené období ze základů a daně." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReturnPage,
});

type Vals = { b1: string; v1: string; b2: string; v2: string; b26: string; b40: string; v40: string; b41: string; v41: string };
const zero: Vals = { b1: "0", v1: "0", b2: "0", v2: "0", b26: "0", b40: "0", v40: "0", b41: "0", v41: "0" };
const r2 = (n: number) => String(Math.round(n * 100) / 100);

function ReturnPage() {
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString("sv-SE"));
  const [to, setTo] = useState(new Date(now.getFullYear(), now.getMonth(), 0).toLocaleDateString("sv-SE"));
  const [v, setV] = useState<Vals>(zero);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const { data: profile } = useCompanyProfile();

  const prefill = async () => {
    setLoading(true);
    const [inv, rec] = await Promise.all([
      supabase.from("invoices").select("invoice_items(quantity, unit_price, vat_rate)").gte("taxable_date", from).lte("taxable_date", to),
      supabase.from("received_invoices").select("subtotal, vat_rate, vat_amount").gte("taxable_date", from).lte("taxable_date", to),
    ]);
    const n = { b1: 0, v1: 0, b2: 0, v2: 0, b26: 0, b40: 0, v40: 0, b41: 0, v41: 0 };
    for (const i of inv.data ?? [])
      for (const it of i.invoice_items ?? []) {
        const b = Number(it.quantity) * Number(it.unit_price);
        const r = Number(it.vat_rate);
        if (r === 21) { n.b1 += b; n.v1 += (b * r) / 100; }
        else if (r === 12) { n.b2 += b; n.v2 += (b * r) / 100; }
        else n.b26 += b;
      }
    for (const x of rec.data ?? []) {
      if (Number(x.vat_rate) === 21) { n.b40 += Number(x.subtotal); n.v40 += Number(x.vat_amount); }
      else if (Number(x.vat_rate) === 12) { n.b41 += Number(x.subtotal); n.v41 += Number(x.vat_amount); }
    }
    setV(Object.fromEntries(Object.entries(n).map(([k, x]) => [k, r2(x)])) as Vals);
    setLoading(false);
    setGenerated(false);
  };

  useEffect(() => {
    prefill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const num = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;
  const out = num(v.v1) + num(v.v2);
  const inp = num(v.v40) + num(v.v41);
  const res = out - inp;

  const lines: { r: string; d: string; b?: keyof Vals; t?: keyof Vals }[] = [
    { r: "1", d: "Dodání zboží / poskytnutí služeb – základní sazba 21 %", b: "b1", t: "v1" },
    { r: "2", d: "Dodání zboží / poskytnutí služeb – snížená sazba 12 %", b: "b2", t: "v2" },
    { r: "26", d: "Plnění osvobozená / bez daně", b: "b26" },
    { r: "40", d: "Odpočet – přijatá plnění 21 %", b: "b40", t: "v40" },
    { r: "41", d: "Odpočet – přijatá plnění 12 %", b: "b41", t: "v41" },
  ];

  return (
    <AppShell>
      <div className="mb-6 print:hidden">
        <h1 className="text-3xl font-bold">Přiznání k DPH</h1>
        <p className="text-muted-foreground">
          Zvolte období, zkontrolujte nebo upravte základy a daň a vygenerujte přiznání.
        </p>
      </div>

      <Card className="mb-6 shadow-card print:hidden">
        <CardHeader>
          <CardTitle className="text-lg">Období a částky</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Od</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Do</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button variant="outline" onClick={prefill} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Načíst z faktur
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">Ř.</th>
                <th className="py-2 pr-3">Popis</th>
                <th className="py-2 pr-3">Základ</th>
                <th className="py-2">Daň</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.r} className="border-b">
                  <td className="py-2 pr-3 font-medium">{l.r}</td>
                  <td className="py-2 pr-3">{l.d}</td>
                  <td className="py-2 pr-3">
                    {l.b && <Input inputMode="decimal" value={v[l.b]} onChange={(e) => setV({ ...v, [l.b!]: e.target.value })} />}
                  </td>
                  <td className="py-2">
                    {l.t && <Input inputMode="decimal" value={v[l.t]} onChange={(e) => setV({ ...v, [l.t!]: e.target.value })} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button onClick={() => setGenerated(true)}>
            <FileDown className="mr-1.5 h-4 w-4" /> Vygenerovat přiznání
          </Button>
        </CardContent>
      </Card>

      {generated && (
        <Card className="print-area shadow-card">
          <CardContent className="space-y-4 p-8">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold">Přiznání k dani z přidané hodnoty</h2>
                <p className="text-sm text-muted-foreground">
                  Zdaňovací období {formatDate(from)} – {formatDate(to)}
                </p>
              </div>
              <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" /> Tisk / PDF
              </Button>
            </div>
            <div className="text-sm">
              <p className="font-semibold">{profile?.company_name || "—"}</p>
              <p>DIČ: {profile?.dic || "—"} · IČO: {profile?.ico || "—"}</p>
              <p>{profile?.address}</p>
            </div>
            <table className="w-full border text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="border px-2 py-1">Ř.</th>
                  <th className="border px-2 py-1">Popis</th>
                  <th className="border px-2 py-1 text-right">Základ daně</th>
                  <th className="border px-2 py-1 text-right">Daň</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.r}>
                    <td className="border px-2 py-1">{l.r}</td>
                    <td className="border px-2 py-1">{l.d}</td>
                    <td className="border px-2 py-1 text-right">{l.b ? formatCurrency(num(v[l.b])) : ""}</td>
                    <td className="border px-2 py-1 text-right">{l.t ? formatCurrency(num(v[l.t])) : ""}</td>
                  </tr>
                ))}
                <tr>
                  <td className="border px-2 py-1">46</td>
                  <td className="border px-2 py-1">Odpočet daně celkem</td>
                  <td className="border px-2 py-1" />
                  <td className="border px-2 py-1 text-right">{formatCurrency(inp)}</td>
                </tr>
                <tr>
                  <td className="border px-2 py-1">62</td>
                  <td className="border px-2 py-1">Daň na výstupu celkem</td>
                  <td className="border px-2 py-1" />
                  <td className="border px-2 py-1 text-right">{formatCurrency(out)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="border px-2 py-1">{res >= 0 ? "64" : "65"}</td>
                  <td className="border px-2 py-1">{res >= 0 ? "Vlastní daňová povinnost" : "Nadměrný odpočet"}</td>
                  <td className="border px-2 py-1" />
                  <td className="border px-2 py-1 text-right">{formatCurrency(Math.abs(res))}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              Orientační podklad pro přiznání k DPH. Oficiální podání proveďte přes portál finanční správy.
            </p>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
