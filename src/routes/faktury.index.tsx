import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import {
  formatCurrency,
  formatDate,
  STATUS_LABELS,
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
        <Button asChild className="shadow-pop">
          <Link to="/faktury/nova">
            <Plus className="mr-1.5 h-4 w-4" />
            Nová faktura
          </Link>
        </Button>
      </div>

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
                  <TableHead className="w-12" />
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
                    <TableCell>{formatDate(inv.due_date)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(inv.status)}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(inv.total), inv.currency)}
                    </TableCell>
                    <TableCell>
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
    </AppShell>
  );
}
