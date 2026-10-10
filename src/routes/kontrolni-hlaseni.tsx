import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileDown, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { useCompanyProfile } from "@/lib/company-profile";
import { downloadElementAsPdf } from "@/lib/invoice-pdf";
import { formatCurrency, formatDate } from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/kontrolni-hlaseni")({
  head: () => ({
    meta: [
      { title: "Kontrolní hlášení DPH — Accountrix" },
      { name: "description", content: "Vygenerujte kontrolní hlášení DPH (oddíly A.4, A.5, B.2, B.3) za zvolené období." },
      { property: "og:title", content: "Kontrolní hlášení DPH — Accountrix" },
      { property: "og:description", content: "Kontrolní hlášení DPH z vydaných a přijatých faktur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: KhPage,
});

const LIMIT = 10000;
type Row = { number: string; partner: string; dic: string | null; date: string; rate: number; base: number; vat: number; total: number };

function KhPage() {
  const now = new Date();
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString("sv-SE"));
  const [to, setTo] = useState(new Date(now.getFullYear(), now.getMonth(), 0).toLocaleDateString("sv-SE"));
  const [data, setData] = useState<{ a4: Row[]; a5: Row[]; b2: Row[]; b3: Row[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: profile } = useCompanyProfile();

  const generate = async () => {
    setBusy(true);
    const [inv, rec] = await Promise.all([
      supabase.from("invoices").select("invoice_number, client_name, client_dic, taxable_date, vat_rate, subtotal, vat_amount, total").gte("taxable_date", from).lte("taxable_date", to).order("taxable_date"),
      supabase.from("received_invoices").select("invoice_number, supplier_name, supplier_dic, taxable_date, vat_rate, subtotal, vat_amount, total").gte("taxable_date", from).lte("taxable_date", to).order("taxable_date"),
    ]);
    setBusy(false);
    if (inv.error || rec.error) { toast.error("Faktury se nepodařilo načíst."); return; }
    const iss: Row[] = (inv.data ?? []).filter((i) => Number(i.vat_amount) !== 0).map((i) => ({ number: i.invoice_number, partner: i.client_name, dic: i.client_dic, date: i.taxable_date, rate: Number(i.vat_rate), base: Number(i.subtotal), vat: Number(i.vat_amount), total: Number(i.total) }));
    const rc: Row[] = (rec.data ?? []).filter((i) => Number(i.vat_amount) !== 0).map((i) => ({ number: i.invoice_number, partner: i.supplier_name, dic: i.supplier_dic, date: i.taxable_date, rate: Number(i.vat_rate), base: Number(i.subtotal), vat: Number(i.vat_amount), total: Number(i.total) }));
    const big = (r: Row) => r.total > LIMIT && !!r.dic;
    setData({ a4: iss.filter(big), a5: iss.filter((r) => !big(r)), b2: rc.filter(big), b3: rc.filter((r) => !big(r)) });
  };

  const savePdf = async () => {
    if (!ref.current) return;
    try { await downloadElementAsPdf(ref.current, `kontrolni-hlaseni-${from}-${to}.pdf`); toast.success("Uloženo jako PDF."); }
    catch { toast.error("PDF se nepodařilo vytvořit."); }
  };

  return (
    <AppShell>
      <div className="mb-6 print:hidden">
        <h1 className="text-3xl font-bold">Kontrolní hlášení DPH</h1>
        <p className="mt-1 text-muted-foreground">Zvolte období — hlášení se sestaví z vydaných a přijatých faktur, stejně jako tabulka na stránce DPH.</p>
      </div>
      <Card className="mb-6 shadow-card print:hidden">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5"><Label>Od</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Do</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button onClick={generate} disabled={busy}>{busy ? "Načítám…" : "Vygenerovat hlášení"}</Button>
        </CardContent>
      </Card>

      {data && (
        <Card className="print-area shadow-card">
          <CardContent className="p-0">
            <div ref={ref} className="space-y-5 bg-card p-8">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold">Kontrolní hlášení DPH</h2>
                  <p className="text-sm text-muted-foreground">Období {formatDate(from)} – {formatDate(to)}</p>
                  <p className="mt-2 text-sm font-medium">{profile?.company_name}</p>
                  <p className="text-sm">DIČ: {profile?.dic || "—"} · IČO: {profile?.ico || "—"}</p>
                </div>
                <div className="flex gap-2 print:hidden" data-html2canvas-ignore>
                  <Button size="sm" onClick={savePdf}><FileDown className="mr-1.5 h-4 w-4" />Uložit PDF</Button>
                  <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />Tisk</Button>
                </div>
              </div>
              <Section title="A.4 – Vydané faktury nad 10 000 Kč (odběratel s DIČ)" rows={data.a4} partner="Odběratel" detail />
              <Section title="A.5 – Ostatní vydané faktury (souhrnně)" rows={data.a5} partner="Odběratel" />
              <Section title="B.2 – Přijaté faktury nad 10 000 Kč (dodavatel s DIČ)" rows={data.b2} partner="Dodavatel" detail />
              <Section title="B.3 – Ostatní přijaté faktury (souhrnně)" rows={data.b3} partner="Dodavatel" />
              <p className="text-xs text-muted-foreground">Orientační podklad. Oficiálně se kontrolní hlášení podává elektronicky přes portál finanční správy.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

function Section({ title, rows, partner, detail }: { title: string; rows: Row[]; partner: string; detail?: boolean }) {
  const sum = (k: "base" | "vat") => rows.reduce((s, r) => s + r[k], 0);
  const byRate = [21, 12].map((rate) => ({ rate, base: rows.filter((r) => r.rate === rate).reduce((s, r) => s + r.base, 0), vat: rows.filter((r) => r.rate === rate).reduce((s, r) => s + r.vat, 0) }));
  const th = "border px-2 py-1"; const num = "border px-2 py-1 text-right whitespace-nowrap";
  return (
    <div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      {detail ? (
        <table className="w-full border text-sm">
          <thead className="bg-muted text-left"><tr><th className={th}>Číslo</th><th className={th}>{partner}</th><th className={th}>DIČ</th><th className={th}>DUZP</th><th className={th}>Sazba</th><th className={`${th} text-right`}>Základ</th><th className={`${th} text-right`}>DPH</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td className={th}>{r.number}</td><td className={th}>{r.partner}</td><td className={th}>{r.dic}</td><td className={`${th} whitespace-nowrap`}>{formatDate(r.date)}</td><td className={th}>{r.rate} %</td><td className={num}>{formatCurrency(r.base)}</td><td className={num}>{formatCurrency(r.vat)}</td></tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className={`${th} text-center text-muted-foreground`}>Žádné doklady.</td></tr>}
            {rows.length > 0 && <tr className="font-semibold"><td className={th} colSpan={5}>Celkem</td><td className={num}>{formatCurrency(sum("base"))}</td><td className={num}>{formatCurrency(sum("vat"))}</td></tr>}
          </tbody>
        </table>
      ) : (
        <table className="w-full border text-sm">
          <thead className="bg-muted text-left"><tr><th className={th}>Sazba</th><th className={th}>Počet dokladů</th><th className={`${th} text-right`}>Základ</th><th className={`${th} text-right`}>DPH</th></tr></thead>
          <tbody>
            {byRate.map((b) => (
              <tr key={b.rate}><td className={th}>{b.rate} %</td><td className={th}>{rows.filter((r) => r.rate === b.rate).length}</td><td className={num}>{formatCurrency(b.base)}</td><td className={num}>{formatCurrency(b.vat)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
