import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { DueAlerts } from "@/components/due-alerts";
import {
  CSV_COLUMNS,
  downloadFile,
  formatCurrency,
  formatDate,
  getDueInfo,
  parseCsv,
  sampleCsv,
  STATUS_LABELS,
  toCsv,
} from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
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
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Faktura byla smazána.");
    },
    onError: () => toast.error("Smazání se nezdařilo."),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "zaplacena", paid_date: new Date().toISOString().slice(0, 10) })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Faktura označena jako zaplacená.");
    },
    onError: () => toast.error("Změna se nezdařila."),
  });

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Nejste přihlášeni.");
      const rows = parseCsv(await file.text());
      if (!rows.length) throw new Error("Soubor neobsahuje žádné řádky.");

      const num = (v: string | undefined) => {
        const n = Number(String(v ?? "").replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : 0;
      };
      const date = (v: string | undefined, fallback: string) => {
        if (!v) return fallback;
        const iso = /^\d{4}-\d{2}-\d{2}$/.test(v)
          ? v
          : (() => {
              const m = v.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
              return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : "";
            })();
        return iso || fallback;
      };
      const today = new Date().toISOString().slice(0, 10);

      const payload = rows.map((r, i) => {
        const subtotal = num(r["subtotal"]);
        const vat = num(r["vat_amount"]);
        const total = num(r["total"]) || subtotal + vat;
        return {
          user_id: user.id,
          invoice_number: r["invoice_number"] || `IMPORT-${Date.now()}-${i + 1}`,
          status: r["status"] && STATUS_LABELS[r["status"]] ? r["status"] : "vystavena",
          client_name: r["client_name"] || "Neznámý klient",
          client_address: r["client_address"] || null,
          client_ico: r["client_ico"] || null,
          client_dic: r["client_dic"] || null,
          client_phone: r["client_phone"] || null,
          client_email: r["client_email"] || null,
          client_vat_payer: ["1", "true", "ano", "yes"].includes(
            (r["client_vat_payer"] ?? "").toLowerCase(),
          ),
          issue_date: date(r["issue_date"], today),
          due_date: date(r["due_date"], today),
          taxable_date: date(r["taxable_date"], today),
          paid_date: r["paid_date"] ? date(r["paid_date"], today) : null,
          payment_method: r["payment_method"] || "prevod",
          bank_account: r["bank_account"] || null,
          variable_symbol: r["variable_symbol"] || null,
          currency: (r["currency"] || "CZK").toUpperCase(),
          subtotal,
          vat_amount: vat,
          total,
          note: r["note"] || null,
        };
      });

      const { error } = await supabase.from("invoices").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setImportOpen(false);
      toast.success(`Importováno ${count} faktur.`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import se nezdařil."),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (invoices ?? []).filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
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
  }, [invoices, search, statusFilter]);

  const totalSum = filtered.reduce((s, i) => s + Number(i.total), 0);

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
              toCsv(
                filtered.map((inv) =>
                  Object.fromEntries(
                    CSV_COLUMNS.map((c) => [c, (inv as Record<string, unknown>)[c]]),
                  ),
                ),
              ),
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

      <div className="mb-4 flex flex-wrap gap-3">

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
      </div>

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
                {search || statusFilter !== "all"
                  ? "Žádná faktura neodpovídá hledání."
                  : "Zatím nemáte žádné faktury. Vytvořte první!"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Číslo</TableHead>
                  <TableHead>Klient</TableHead>
                  <TableHead>Vystaveno</TableHead>
                  <TableHead>Splatnost</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead className="text-right">Částka</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => (
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
                          onClick={() => markPaid.mutate(inv.id)}
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
                            <AlertDialogAction onClick={() => remove.mutate(inv.id)}>
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
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import faktur z CSV</DialogTitle>
            <DialogDescription>
              Nahrajte CSV soubor se stejnými sloupci, jaké vytvoří export (oddělovač „;“ nebo
              „,“). Vytvoří se nové faktury bez položek.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="file"
              accept=".csv,text/csv"
              disabled={importCsv.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
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
            <p className="text-xs text-muted-foreground">
              Sloupce: {CSV_COLUMNS.join(", ")}
            </p>
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
