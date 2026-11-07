import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { VatPeriodControls, VAT_MONTHS } from "@/components/vat-period-controls";
import { useAccountNames, accountLabel } from "@/lib/accounting";
import { vatAccountSummary } from "@/lib/accounting-rules";
import { formatCurrency, formatDate } from "@/lib/invoice-utils";
import { calendarPeriod, isValidVatRange, vatExportName } from "@/lib/vat-period";
import { downloadElementAsPdf } from "@/lib/invoice-pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/dph")({
  head: () => ({
    meta: [
      { title: "Vyúčtování DPH — Accountrix" },
      { name: "description", content: "Měsíční a čtvrtletní DPH podle sazeb a účtů s exportem do PDF a Excelu." },
      { property: "og:title", content: "Vyúčtování DPH — Accountrix" },
      { property: "og:description", content: "Měsíční a čtvrtletní vyúčtování DPH s exportem do PDF a Excelu." },
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
  const [period, setPeriod] = useState(() => calendarPeriod(now.getFullYear(), now.getMonth() + 1));
  const { from, to } = period;
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);
  const validPeriod = isValidVatRange(from, to);
  const periodLabel = period.mode === "quarter" ? `${period.quarter}. čtvrtletí ${period.year}` : period.mode === "month" ? `${VAT_MONTHS[period.month - 1]} ${period.year}` : "Vlastní období";

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["vat-report", from, to],
    enabled: validPeriod,
    queryFn: async () => {
      let invQ = supabase
        .from("invoices")
        .select("id, status, total, vat_account, invoice_items(quantity, unit_price, vat_rate)");
      let recQ = supabase.from("received_invoices").select("subtotal, vat_rate, vat_amount, expense_account, vat_account");
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
  const issuedAccounts = (rate?: number) => vatAccountSummary("issued", (data?.invoices ?? []).filter((invoice) => rate === undefined || invoice.invoice_items.some((item) => Number(item.vat_rate) === rate)));
  const receivedAccounts = (rate?: number) => vatAccountSummary("received", (data?.received ?? []).filter((invoice) => rate === undefined || Number(invoice.vat_rate) === rate));
  const returnLines = [
    { r: "1", d: "Uskutečněná plnění – základní sazba 21 %", accounts: issuedAccounts(21), b: ret.out.b21, v: ret.out.v21 },
    { r: "2", d: "Uskutečněná plnění – snížená sazba 12 %", accounts: issuedAccounts(12), b: ret.out.b12, v: ret.out.v12 },
    { r: "26", d: "Plnění osvobozená / bez daně (0 %)", accounts: "602 D", b: ret.out.b0 },
    { r: "40", d: "Odpočet – přijatá plnění 21 % (můžete odečíst)", accounts: receivedAccounts(21), b: ret.inp.b21, v: ret.inp.v21, highlight: true },
    { r: "41", d: "Odpočet – přijatá plnění 12 % (můžete odečíst)", accounts: receivedAccounts(12), b: ret.inp.b12, v: ret.inp.v12, highlight: true },
    { r: "46", d: "Odpočet daně celkem", accounts: receivedAccounts(), v: ret.inVat, highlight: true },
    { r: "62", d: "Daň na výstupu celkem", accounts: issuedAccounts(), v: ret.outVat },
    { r: ret.result >= 0 ? "64" : "65", d: ret.result >= 0 ? "Vlastní daňová povinnost (zaplatit)" : "Nadměrný odpočet (vrátí se)", v: Math.abs(ret.result) },
  ];
  const exportDisabled = !validPeriod || !data || isFetching || Boolean(error) || exporting !== null;
  const exportPdf = async () => {
    if (!reportRef.current || exportDisabled) return;
    setExporting("pdf");
    try {
      await downloadElementAsPdf(reportRef.current, `${vatExportName(period)}.pdf`);
      toast.success("Přehled DPH byl uložen jako PDF.");
    } catch { toast.error("PDF se nepodařilo vytvořit."); }
    finally { setExporting(null); }
  };
  const exportXlsx = async () => {
    if (exportDisabled) return;
    setExporting("xlsx");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const metadata = [
        ["Accountrix — Vyúčtování DPH"], ["Období", periodLabel], ["Od", from], ["Do", to],
      ];
      const summary = XLSX.utils.aoa_to_sheet([...metadata, [], ["Ukazatel", "Částka (CZK)"],
        ["Daň na výstupu", ret.outVat], ["Odpočet daně", ret.inVat], ["Výsledek (výstup − odpočet)", ret.result],
        ["DPH k zaplacení — účty 343 a 341", vatToPay], ["Přijde od klientů — účet 311", toReceive], ["Již přijato — účet 221", received],
      ]);
      XLSX.utils.book_append_sheet(wb, summary, "Souhrn");
      const addSheet = (name: string, rows: (string | number)[][]) => {
        const sheet = XLSX.utils.aoa_to_sheet([...metadata, [], ...rows]);
        sheet["!cols"] = [{ wch: 12 }, { wch: 60 }, { wch: 30 }, { wch: 20 }, { wch: 20 }];
        XLSX.utils.book_append_sheet(wb, sheet, name);
      };
      addSheet("Přiznání DPH", [["Řádek", "Popis", "Účty základu / DPH", "Základ (CZK)", "Daň (CZK)"], ...returnLines.map((line) => [line.r, line.d, line.accounts ?? "", line.b ?? "", line.v ?? ""])]);
      addSheet("DPH podle sazeb", [["Sazba (%)", "Základ (CZK)", "DPH (CZK)", "Celkem (CZK)"], ...byRate.map(([rate, value]) => [rate, value.base, value.vat, value.base + value.vat]), ["Celkem", totalBase, totalVat, totalBase + totalVat]]);
      addSheet("Zůstatky účtů", [["Účet", "Název", "Má dáti (CZK)", "Dal (CZK)", "Zůstatek (CZK)"], ...accounts.map(([account, value]) => [account, accountNames[account] ?? account, value.md, value.d, value.md - value.d])]);
      XLSX.writeFile(wb, `${vatExportName(period)}.xlsx`);
      toast.success("Přehled DPH byl uložen do Excelu.");
    } catch { toast.error("Export do Excelu se nezdařil."); }
    finally { setExporting(null); }
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-3xl font-bold">Vyúčtování DPH</h1>
          <p className="text-muted-foreground">Kolik zaplatit na DPH a kolik vám přijde od klientů.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled={exportDisabled} onClick={exportPdf}><FileDown />{exporting === "pdf" ? "Ukládám…" : "Export PDF"}</Button>
          <Button variant="outline" disabled={exportDisabled} onClick={exportXlsx}><FileSpreadsheet />{exporting === "xlsx" ? "Ukládám…" : "Export Excel"}</Button>
        </div>
      </div>
      <VatPeriodControls period={period} onChange={setPeriod} disabled={exporting !== null} />

      {!validPeriod ? <p role="alert" className="text-destructive">Vyplňte platné období; datum Od nesmí být později než Do.</p> : error ? (
        <div role="alert" className="space-y-3"><p className="text-destructive">Přehled DPH se nepodařilo načíst.</p><Button variant="outline" onClick={() => refetch()}>Zkusit znovu</Button></div>
      ) : isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div ref={reportRef} className="vat-report print-area bg-background">
          <div className="mb-5">
            <h2 className="text-xl font-semibold">DPH — {periodLabel}</h2>
            <p className="text-sm text-muted-foreground">{formatDate(from)} – {formatDate(to)}</p>
          </div>
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
                    <th className="py-2 pr-3">Účty základu / DPH</th>
                    <th className="py-2 pr-3 text-right">Základ</th>
                    <th className="py-2 text-right">Daň</th>
                  </tr>
                </thead>
                <tbody>
                  {returnLines.map((line) => <RetRow key={line.r} {...line} />)}
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
          <p className="mt-4 text-xs text-muted-foreground">Orientační podklad pro DPH. Oficiální podání proveďte přes portál finanční správy.</p>
        </div>
      )}
    </AppShell>
  );
}

function RetRow({ r, d, accounts, b, v, highlight }: { r: string; d: string; accounts?: string; b?: number; v?: number; highlight?: boolean }) {
  return (
    <tr className={`border-b ${highlight ? "bg-accent/50" : ""}`}>
      <td className="py-2 pr-3 font-medium">{r}</td>
      <td className="py-2 pr-3">{d}</td>
      <td className="py-2 pr-3">{accounts}</td>
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
