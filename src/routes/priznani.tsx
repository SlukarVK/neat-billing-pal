import { useEffect, useRef, useState } from "react";
import { downloadElementAsPdf } from "@/lib/invoice-pdf";
import { toast } from "sonner";
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
  const docRef = useRef<HTMLDivElement>(null);
  const [attach, setAttach] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);
  type Iss = { invoice_number: string; client_name: string; taxable_date: string; subtotal: number; vat_amount: number; total: number };
  type Rec = { invoice_number: string; supplier_name: string; taxable_date: string; subtotal: number; vat_amount: number; total: number };
  const [issued, setIssued] = useState<Iss[]>([]);
  const [received, setReceived] = useState<Rec[]>([]);
  const generate = async () => {
    const [a, b] = await Promise.all([
      supabase.from("invoices").select("invoice_number, client_name, taxable_date, subtotal, vat_amount, total").gte("taxable_date", from).lte("taxable_date", to).order("taxable_date"),
      supabase.from("received_invoices").select("invoice_number, supplier_name, taxable_date, subtotal, vat_amount, total").gte("taxable_date", from).lte("taxable_date", to).order("taxable_date"),
    ]);
    setIssued(a.data ?? []);
    setReceived(b.data ?? []);
    setGenerated(true);
  };
  const savePdf = async () => {
    if (!docRef.current) return;
    setPdfBusy(true);
    try {
      await downloadElementAsPdf(docRef.current, `priznani-dph-${from}-${to}.pdf`);
      toast.success("Přiznání bylo uloženo jako PDF.");
    } catch {
      toast.error("PDF se nepodařilo vytvořit.");
    } finally {
      setPdfBusy(false);
    }
  };

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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
            Přiložit seznam vydaných a přijatých faktur za období
          </label>
          <Button onClick={generate}>
            <FileDown className="mr-1.5 h-4 w-4" /> Vygenerovat přiznání
          </Button>
        </CardContent>
      </Card>

      {generated && (
        <Card className="print-area shadow-card">
          <CardContent className="p-0">
          <div ref={docRef} className="space-y-4 bg-card p-8">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold">Přiznání k dani z přidané hodnoty</h2>
                <p className="text-sm text-muted-foreground">
                  Zdaňovací období {formatDate(from)} – {formatDate(to)}
                </p>
              </div>
              <div className="flex gap-2 print:hidden" data-html2canvas-ignore>
                <Button size="sm" onClick={savePdf} disabled={pdfBusy}>
                  <FileDown className="mr-1.5 h-4 w-4" /> {pdfBusy ? "Ukládám…" : "Uložit PDF"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="mr-1.5 h-4 w-4" /> Tisk
                </Button>
              </div>
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
            {attach && (
              <>
                <AttachTable title="Příloha 1 – Vydané faktury" partner="Odběratel" rows={issued.map((i) => ({ ...i, partner: i.client_name }))} />
                <AttachTable title="Příloha 2 – Přijaté faktury" partner="Dodavatel" rows={received.map((i) => ({ ...i, partner: i.supplier_name }))} />
              </>
            )}
          </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function AttachTable({ title, partner, rows }: { title: string; partner: string; rows: { invoice_number: string; partner: string; taxable_date: string; subtotal: number; vat_amount: number; total: number }[] }) {
  const sum = (k: "subtotal" | "vat_amount" | "total") => rows.reduce((s, r) => s + Number(r[k]), 0);
  return (
    <div className="pt-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      <table className="w-full border text-sm">
        <thead className="bg-muted text-left">
          <tr>
            <th className="border px-2 py-1">Číslo</th>
            <th className="border px-2 py-1">{partner}</th>
            <th className="border px-2 py-1">DUZP</th>
            <th className="border px-2 py-1 text-right">Základ</th>
            <th className="border px-2 py-1 text-right">DPH</th>
            <th className="border px-2 py-1 text-right">Celkem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="border px-2 py-1">{r.invoice_number}</td>
              <td className="border px-2 py-1">{r.partner}</td>
              <td className="border px-2 py-1 whitespace-nowrap">{formatDate(r.taxable_date)}</td>
              <td className="border px-2 py-1 text-right whitespace-nowrap">{formatCurrency(Number(r.subtotal))}</td>
              <td className="border px-2 py-1 text-right whitespace-nowrap">{formatCurrency(Number(r.vat_amount))}</td>
              <td className="border px-2 py-1 text-right whitespace-nowrap">{formatCurrency(Number(r.total))}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr><td colSpan={6} className="border px-2 py-2 text-center text-muted-foreground">Žádné faktury v období.</td></tr>
          )}
          {rows.length > 0 && (
            <tr className="font-semibold">
              <td className="border px-2 py-1" colSpan={3}>Celkem</td>
              <td className="border px-2 py-1 text-right">{formatCurrency(sum("subtotal"))}</td>
              <td className="border px-2 py-1 text-right">{formatCurrency(sum("vat_amount"))}</td>
              <td className="border px-2 py-1 text-right">{formatCurrency(sum("total"))}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
