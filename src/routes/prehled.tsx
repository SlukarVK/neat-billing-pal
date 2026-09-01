import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { formatCurrency, formatDate, STATUS_LABELS } from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/prehled")({
  head: () => ({
    meta: [
      { title: "Přehled faktur podle stavů — Accountrix" },
      {
        name: "description",
        content:
          "Souhrn faktur podle stavů — návrh, vystavená, zaplacená a po splatnosti — s exportem do PDF a Excelu.",
      },
      { property: "og:title", content: "Přehled faktur podle stavů — Accountrix" },
      {
        property: "og:description",
        content: "Souhrn faktur podle stavů s exportem do PDF a Excelu.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewPage,
});

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  client_name: string;
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  currency: string;
  subtotal: number;
  vat_amount: number;
  total: number;
};

const ORDER = ["navrh", "vystavena", "odeslana", "po_splatnosti", "zaplacena", "stornovana"];

/** Nezaplacená faktura po termínu splatnosti se zobrazuje jako „Po splatnosti“. */
function effectiveStatus(inv: Invoice) {
  if (inv.status === "zaplacena" || inv.status === "stornovana" || inv.status === "navrh")
    return inv.status;
  const today = new Date().toISOString().slice(0, 10);
  return inv.due_date < today ? "po_splatnosti" : inv.status;
}

const badgeVariant = (s: string) =>
  s === "zaplacena" ? "default" : s === "po_splatnosti" || s === "stornovana" ? "destructive" : "secondary";

function OverviewPage() {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data as unknown as Invoice[];
    },
  });

  const groups = useMemo(() => {
    const map = new Map<string, Invoice[]>();
    for (const inv of invoices ?? []) {
      const key = effectiveStatus(inv);
      map.set(key, [...(map.get(key) ?? []), inv]);
    }
    return ORDER.filter((s) => map.has(s)).map((s) => ({
      status: s,
      label: STATUS_LABELS[s] ?? s,
      items: map.get(s)!,
      total: map.get(s)!.reduce((a, i) => a + Number(i.total), 0),
    }));
  }, [invoices]);

  const grandTotal = groups.reduce((a, g) => a + g.total, 0);
  const count = invoices?.length ?? 0;

  const exportPdf = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      await downloadInvoicePdf(reportRef.current, `prehled-${new Date().toISOString().slice(0, 10)}`);
      toast.success("PDF přehledu bylo staženo.");
    } catch {
      toast.error("Export do PDF se nezdařil.");
    } finally {
      setExporting(false);
    }
  };

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    const summary = groups.map((g) => ({
      Stav: g.label,
      "Počet faktur": g.items.length,
      "Celkem s DPH": Number(g.total.toFixed(2)),
    }));
    summary.push({ Stav: "CELKEM", "Počet faktur": count, "Celkem s DPH": Number(grandTotal.toFixed(2)) });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Souhrn");

    for (const g of groups) {
      const rows = g.items.map((i) => ({
        Číslo: i.invoice_number,
        Klient: i.client_name,
        Vystaveno: i.issue_date,
        Splatnost: i.due_date,
        Zaplaceno: i.paid_date ?? "",
        Měna: i.currency,
        "Bez DPH": Number(i.subtotal),
        DPH: Number(i.vat_amount),
        Celkem: Number(i.total),
      }));
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(rows),
        g.label.slice(0, 31).replace(/[\\/*?:[\]]/g, ""),
      );
    }

    XLSX.writeFile(wb, `prehled-faktur-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel soubor byl staženo.");
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <BarChart3 className="h-7 w-7 text-primary" />
            Přehled podle stavů
          </h1>
          <p className="mt-1 text-muted-foreground">
            {count} faktur · celkem {formatCurrency(grandTotal)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPdf} disabled={exporting || isLoading}>
            <Download className="mr-1.5 h-4 w-4" />
            {exporting ? "Připravuji…" : "Export PDF"}
          </Button>
          <Button variant="outline" onClick={exportXlsx} disabled={isLoading || count === 0}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : count === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-16 text-center text-muted-foreground">
            Zatím nemáte žádné faktury.
          </CardContent>
        </Card>
      ) : (
        <div ref={reportRef} className="space-y-6 bg-background p-1">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <Card key={g.status} className="shadow-card">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{g.label}</span>
                    <Badge variant={badgeVariant(g.status)}>{g.items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(g.total)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {groups.map((g) => (
            <Card key={g.status} className="shadow-card">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">
                  {g.label} · {g.items.length} faktur · {formatCurrency(g.total)}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Číslo</TableHead>
                      <TableHead>Klient</TableHead>
                      <TableHead>Vystaveno</TableHead>
                      <TableHead>Splatnost</TableHead>
                      <TableHead className="text-right">Bez DPH</TableHead>
                      <TableHead className="text-right">DPH</TableHead>
                      <TableHead className="text-right">Celkem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.items.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link
                            to="/faktury/$id"
                            params={{ id: inv.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {inv.invoice_number}
                          </Link>
                        </TableCell>
                        <TableCell>{inv.client_name}</TableCell>
                        <TableCell>{formatDate(inv.issue_date)}</TableCell>
                        <TableCell>{formatDate(inv.due_date)}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(inv.subtotal), inv.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(Number(inv.vat_amount), inv.currency)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(Number(inv.total), inv.currency)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
