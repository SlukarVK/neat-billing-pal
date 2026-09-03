import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Mail,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { DueAlerts } from "@/components/due-alerts";
import { downloadElementAsPdf } from "@/lib/invoice-pdf";
import { validateInvoiceCsv, type ImportValidation } from "@/lib/invoice-import";
import {
  buildReminderMailto,
  CSV_COLUMNS,
  downloadFile,
  formatCurrency,
  formatDate,
  getDueInfo,
  sampleCsv,
  STATUS_LABELS,
  toCsv,
} from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/faktury/")({
  head: () => ({
    meta: [
      { title: "Faktury — Accountrix" },
      { name: "description", content: "Přehled, vyhledávání a správa vašich faktur v Accountrix." },
      { property: "og:title", content: "Faktury — Accountrix" },
      { property: "og:description", content: "Přehled, vyhledávání a správa vašich faktur." },
    ],
  }),
  component: InvoicesPage,
});

const statusVariant = (s: string) =>
  s === "zaplacena"
    ? "default"
    : s === "po_splatnosti" || s === "stornovana"
      ? "destructive"
      : "secondary";

type SortKey = "invoice_number" | "client_name" | "issue_date" | "due_date" | "status" | "total";
type SortDir = "asc" | "desc";

const DUE_FILTERS: Record<string, string> = {
  all: "Splatnost: vše",
  overdue: "Po splatnosti",
  soon: "Blíží se splatnost",
  ok: "V termínu",
};

function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [issueFrom, setIssueFrom] = useState("");
  const [issueTo, setIssueTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("issue_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportValidation | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const bulkPdfRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("invoices").delete().in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setSelected([]);
      toast.success(count === 1 ? "Faktura byla smazána." : `Smazáno ${count} faktur.`);
    },
    onError: () => toast.error("Smazání se nezdařilo."),
  });

  const markPaid = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "zaplacena", paid_date: new Date().toISOString().slice(0, 10) })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setSelected([]);
      toast.success(
        count === 1 ? "Faktura označena jako zaplacená." : `${count} faktur označeno jako zaplacené.`,
      );
    },
    onError: () => toast.error("Změna se nezdařila."),
  });

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Nejste přihlášeni.");
      const result = validateInvoiceCsv(await file.text(), user.id);
      if (!result.totalRows) throw new Error("Soubor neobsahuje žádné řádky.");
      if (result.valid.length) {
        const { error } = await supabase.from("invoices").insert(result.valid);
        if (error) throw error;
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setImportResult(result);
      if (result.valid.length && !result.errors.length)
        toast.success(`Importováno ${result.valid.length} faktur.`);
      else if (result.valid.length)
        toast.warning(
          `Importováno ${result.valid.length} z ${result.totalRows} řádků, ${result.errors.length} chyb.`,
        );
      else toast.error("Neuložil se žádný řádek — zkontrolujte chyby níže.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import se nezdařil."),
  });

  const clients = useMemo(
    () => Array.from(new Set((invoices ?? []).map((i) => i.client_name))).sort((a, b) => a.localeCompare(b, "cs")),
    [invoices],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = (invoices ?? []).filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (clientFilter !== "all" && inv.client_name !== clientFilter) return false;
      if (issueFrom && inv.issue_date < issueFrom) return false;
      if (issueTo && inv.issue_date > issueTo) return false;
      if (dueFilter !== "all") {
        const level = getDueInfo(inv).level;
        if (dueFilter === "overdue" && level !== "overdue") return false;
        if (dueFilter === "soon" && level !== "soon" && level !== "today") return false;
        if (dueFilter === "ok" && level !== "ok") return false;
      }
      if (!q) return true;
      return [
        inv.invoice_number,
        inv.client_name,
        inv.client_ico,
        inv.client_dic,
        inv.client_email,
        inv.client_phone,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === "total") return (Number(av) - Number(bv)) * dir;
      if (sortKey === "status")
        return (STATUS_LABELS[String(av)] ?? String(av)).localeCompare(
          STATUS_LABELS[String(bv)] ?? String(bv),
          "cs",
        ) * dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), "cs", { numeric: true }) * dir;
    });
  }, [invoices, search, statusFilter, clientFilter, dueFilter, issueFrom, issueTo, sortKey, sortDir]);

  const totalSum = filtered.reduce((s, i) => s + Number(i.total), 0);
  const selectedInvoices = filtered.filter((i) => selected.includes(i.id));
  const allSelected = filtered.length > 0 && selectedInvoices.length === filtered.length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "issue_date" || key === "due_date" || key === "total" ? "desc" : "asc");
    }
  };

  const SortHead = ({ label, sortBy, className }: { label: string; sortBy: SortKey; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className="inline-flex items-center gap-1 font-medium hover:text-primary"
      >
        {label}
        {sortKey === sortBy ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  const rowsToCsv = (rows: typeof filtered) =>
    toCsv(
      rows.map((inv) =>
        Object.fromEntries(CSV_COLUMNS.map((c) => [c, (inv as Record<string, unknown>)[c]])),
      ),
    );

  const exportXlsx = async (rows: typeof filtered) => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const sheet = rows.map((i) => ({
      Číslo: i.invoice_number,
      Klient: i.client_name,
      Stav: STATUS_LABELS[i.status] ?? i.status,
      Vystaveno: i.issue_date,
      Splatnost: i.due_date,
      Zaplaceno: i.paid_date ?? "",
      Měna: i.currency,
      "Bez DPH": Number(i.subtotal),
      DPH: Number(i.vat_amount),
      Celkem: Number(i.total),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Faktury");
    XLSX.writeFile(wb, `faktury-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel soubor byl stažen.");
  };

  const exportSelectedPdf = async () => {
    if (!bulkPdfRef.current) return;
    setExportingPdf(true);
    try {
      await downloadElementAsPdf(
        bulkPdfRef.current,
        `vybrane-faktury-${new Date().toISOString().slice(0, 10)}.pdf`,
      );
      toast.success("PDF bylo staženo.");
    } catch {
      toast.error("Export do PDF se nezdařil.");
    } finally {
      setExportingPdf(false);
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDueFilter("all");
    setClientFilter("all");
    setIssueFrom("");
    setIssueTo("");
  };

  const filtersActive =
    !!search || statusFilter !== "all" || dueFilter !== "all" || clientFilter !== "all" || !!issueFrom || !!issueTo;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Faktury</h1>
          <p className="mt-1 text-muted-foreground">
            {filtered.length} faktur · celkem {formatCurrency(totalSum)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() =>
              downloadFile(
                rowsToCsv(filtered),
                `faktury-${new Date().toISOString().slice(0, 10)}.csv`,
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1.5 h-4 w-4" />
            Import CSV
          </Button>
          <Button asChild className="shadow-pop">
            <Link to="/faktury/nova">
              <Plus className="mr-1.5 h-4 w-4" />
              Nová faktura
            </Link>
          </Button>
        </div>
      </div>

      <DueAlerts invoices={invoices ?? []} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat podle čísla, klienta, IČO, e-mailu…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Stav" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všechny stavy</SelectItem>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dueFilter} onValueChange={setDueFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Splatnost" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DUE_FILTERS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Klient" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Všichni klienti</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Vystaveno
          <Input
            type="date"
            value={issueFrom}
            onChange={(e) => setIssueFrom(e.target.value)}
            className="w-40"
          />
          –
          <Input type="date" value={issueTo} onChange={(e) => setIssueTo(e.target.value)} className="w-40" />
        </div>
        {filtersActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="mr-1 h-4 w-4" />
            Zrušit filtry
          </Button>
        )}
      </div>

      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <span className="mr-2 text-sm font-medium">Vybráno {selectedInvoices.length} faktur</span>
          <Button size="sm" variant="outline" onClick={() => markPaid.mutate(selected)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Označit jako zaplacené
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportXlsx(selectedInvoices)}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />
            Export Excel
          </Button>
          <Button size="sm" variant="outline" onClick={exportSelectedPdf} disabled={exportingPdf}>
            <Download className="mr-1.5 h-4 w-4" />
            {exportingPdf ? "Připravuji…" : "Export PDF"}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={buildReminderMailto(selectedInvoices)}>
              <Mail className="mr-1.5 h-4 w-4" />
              Poslat upomínku
            </a>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive">
                <Trash2 className="mr-1.5 h-4 w-4" />
                Smazat
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Smazat {selectedInvoices.length} faktur?</AlertDialogTitle>
                <AlertDialogDescription>
                  Vybrané faktury budou trvale odstraněny včetně všech položek.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Zrušit</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate(selected)}>Smazat</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Zrušit výběr
          </Button>
        </div>
      )}

      <Card className="shadow-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {filtersActive
                  ? "Žádná faktura neodpovídá hledání."
                  : "Zatím nemáte žádné faktury. Vytvořte první!"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => setSelected(v ? filtered.map((i) => i.id) : [])}
                      aria-label="Vybrat vše"
                    />
                  </TableHead>
                  <SortHead label="Číslo" sortBy="invoice_number" />
                  <SortHead label="Klient" sortBy="client_name" />
                  <SortHead label="Vystaveno" sortBy="issue_date" />
                  <SortHead label="Splatnost" sortBy="due_date" />
                  <SortHead label="Stav" sortBy="status" />
                  <SortHead label="Částka" sortBy="total" className="text-right" />
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
                  <TableRow key={inv.id} data-state={selected.includes(inv.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(inv.id)}
                        onCheckedChange={(v) =>
                          setSelected((s) => (v ? [...s, inv.id] : s.filter((id) => id !== inv.id)))
                        }
                        aria-label={`Vybrat fakturu ${inv.invoice_number}`}
                      />
                    </TableCell>
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
                    <TableCell>
                      {formatDate(inv.due_date)}
                      {(() => {
                        const d = getDueInfo(inv);
                        if (d.level === "overdue" || d.level === "soon" || d.level === "today")
                          return (
                            <span
                              className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
                                d.level === "overdue"
                                  ? "bg-destructive/10 text-destructive"
                                  : "bg-primary/10 text-primary"
                              }`}
                            >
                              {d.label}
                            </span>
                          );
                        return null;
                      })()}
                    </TableCell>

                    <TableCell>
                      <Badge variant={statusVariant(inv.status)}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(inv.total), inv.currency)}
                    </TableCell>
                    <TableCell className="flex justify-end gap-1">
                      {inv.status !== "zaplacena" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Označit jako zaplacenou"
                          onClick={() => markPaid.mutate([inv.id])}
                        >
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" title="Smazat">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Smazat fakturu?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Faktura {inv.invoice_number} pro {inv.client_name} bude
                              trvale odstraněna včetně všech položek.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Zrušit</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove.mutate([inv.id])}>
                              Smazat
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Skrytý podklad pro hromadný export do PDF */}
      <div className="pointer-events-none fixed -left-[10000px] top-0 w-[1000px]" aria-hidden>
        <div ref={bulkPdfRef} className="bg-background p-6 text-foreground">
          <h2 className="mb-1 text-xl font-bold">Vybrané faktury</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {selectedInvoices.length} faktur · celkem{" "}
            {formatCurrency(selectedInvoices.reduce((s, i) => s + Number(i.total), 0))} ·{" "}
            {formatDate(new Date().toISOString().slice(0, 10))}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-1">Číslo</th>
                <th>Klient</th>
                <th>Vystaveno</th>
                <th>Splatnost</th>
                <th>Stav</th>
                <th className="text-right">Celkem</th>
              </tr>
            </thead>
            <tbody>
              {selectedInvoices.map((i) => (
                <tr key={i.id} className="border-b">
                  <td className="py-1">{i.invoice_number}</td>
                  <td>{i.client_name}</td>
                  <td>{formatDate(i.issue_date)}</td>
                  <td>{formatDate(i.due_date)}</td>
                  <td>{STATUS_LABELS[i.status] ?? i.status}</td>
                  <td className="text-right">{formatCurrency(Number(i.total), i.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) setImportResult(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import faktur z CSV</DialogTitle>
            <DialogDescription>
              Nahrajte CSV soubor se stejnými sloupci, jaké vytvoří export (oddělovač „;“ nebo
              „,“). Každý řádek se ověří; chybné řádky se neuloží a vypíší se níže.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="file"
              accept=".csv,text/csv"
              disabled={importCsv.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                setImportResult(null);
                if (file) importCsv.mutate(file);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadFile(sampleCsv(), "vzor-faktury.csv", "text/csv;charset=utf-8")
              }
            >
              <Download className="mr-1.5 h-4 w-4" />
              Stáhnout vzorové CSV
            </Button>
            <p className="text-xs text-muted-foreground">Sloupce: {CSV_COLUMNS.join(", ")}</p>

            {importResult && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="default">Uloženo {importResult.valid.length}</Badge>
                  <Badge variant={importResult.errors.length ? "destructive" : "secondary"}>
                    Chyby {importResult.errors.length}
                  </Badge>
                  <Badge variant="secondary">Varování {importResult.warnings.length}</Badge>
                  <span className="text-muted-foreground">
                    Celkem řádků: {importResult.totalRows}
                  </span>
                </div>

                {(importResult.errors.length > 0 || importResult.warnings.length > 0) && (
                  <div className="max-h-72 overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Řádek</TableHead>
                          <TableHead className="w-32">Faktura</TableHead>
                          <TableHead className="w-36">Sloupec</TableHead>
                          <TableHead>Důvod</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importResult.errors.map((e, i) => (
                          <TableRow key={`e${i}`}>
                            <TableCell className="text-destructive">{e.line}</TableCell>
                            <TableCell>{e.invoiceNumber}</TableCell>
                            <TableCell className="font-mono text-xs">{e.field}</TableCell>
                            <TableCell className="text-destructive">{e.message}</TableCell>
                          </TableRow>
                        ))}
                        {importResult.warnings.map((w, i) => (
                          <TableRow key={`w${i}`}>
                            <TableCell>{w.line}</TableCell>
                            <TableCell>{w.invoiceNumber}</TableCell>
                            <TableCell className="font-mono text-xs">{w.field}</TableCell>
                            <TableCell className="text-muted-foreground">
                              Varování: {w.message}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
