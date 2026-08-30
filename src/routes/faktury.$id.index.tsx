import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import {
  formatCurrency,
  formatDate,
  ITEM_TYPE_LABELS,
  PAYMENT_LABELS,
  STATUS_LABELS,
} from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

export const Route = createFileRoute("/faktury/$id/")({
  head: () => ({
    meta: [
      { title: "Detail faktury — Accountrix" },
      { name: "description", content: "Detail faktury se všemi údaji klienta, položkami a DPH." },
      { property: "og:title", content: "Detail faktury — Accountrix" },
      { property: "og:description", content: "Detail faktury se všemi údaji klienta, položkami a DPH." },
    ],
  }),
  component: InvoiceDetailPage,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium">{value || "—"}</p>
    </div>
  );
}

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [inv, items] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("invoice_items")
          .select("*")
          .eq("invoice_id", id)
          .order("created_at"),
      ]);
      if (inv.error) throw inv.error;
      if (items.error) throw items.error;
      return { invoice: inv.data, items: items.data ?? [] };
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Faktura byla smazána.");
      navigate({ to: "/faktury" });
    },
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  const invoice = data?.invoice;
  if (!invoice) {
    return (
      <AppShell>
        <p className="py-24 text-center text-muted-foreground">Faktura nebyla nalezena.</p>
      </AppShell>
    );
  }
  const items = data!.items;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/faktury">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Zpět
          </Link>
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Tisk / PDF
          </Button>
          <Button size="sm" asChild>
            <Link to="/faktury/$id/upravit" params={{ id }}>
              <Pencil className="mr-1.5 h-4 w-4" />
              Upravit
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Trash2 className="mr-1.5 h-4 w-4 text-destructive" />
                Smazat
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Smazat fakturu?</AlertDialogTitle>
                <AlertDialogDescription>
                  Faktura {invoice.invoice_number} bude trvale odstraněna.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Zrušit</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>Smazat</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="space-y-8 p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
            <div>
              <p className="text-sm uppercase tracking-widest text-muted-foreground">
                Faktura – daňový doklad
              </p>
              <h1 className="mt-1 text-3xl font-bold">č. {invoice.invoice_number}</h1>
            </div>
            <Badge className="text-sm">{STATUS_LABELS[invoice.status] ?? invoice.status}</Badge>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                Odběratel
              </h2>
              <Field label="Jméno / název" value={invoice.client_name} />
              <Field label="Adresa" value={invoice.client_address} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="IČO" value={invoice.client_ico} />
                <Field label="DIČ" value={invoice.client_dic} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Telefon" value={invoice.client_phone} />
                <Field label="E-mail" value={invoice.client_email} />
              </div>
              <Field
                label="DPH"
                value={invoice.client_vat_payer ? "Plátce DPH" : "Neplátce DPH"}
              />
            </div>
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">
                Platební údaje
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Datum vystavení" value={formatDate(invoice.issue_date)} />
                <Field label="Datum splatnosti" value={formatDate(invoice.due_date)} />
              </div>
              <Field label="DUZP" value={formatDate(invoice.taxable_date)} />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Způsob platby"
                  value={PAYMENT_LABELS[invoice.payment_method] ?? invoice.payment_method}
                />
                <Field label="Měna" value={invoice.currency} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bankovní účet" value={invoice.bank_account} />
                <Field label="Variabilní symbol" value={invoice.variable_symbol} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
              Položky
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Popis</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead className="text-right">Množství</TableHead>
                  <TableHead className="text-right">Cena/j. bez DPH</TableHead>
                  <TableHead className="text-right">DPH</TableHead>
                  <TableHead className="text-right">Celkem s DPH</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => {
                  const base = Number(it.quantity) * Number(it.unit_price);
                  const vat = (base * Number(it.vat_rate)) / 100;
                  return (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.description}</TableCell>
                      <TableCell>{ITEM_TYPE_LABELS[it.item_type] ?? it.item_type}</TableCell>
                      <TableCell className="text-right">
                        {Number(it.quantity)} {it.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(Number(it.unit_price), invoice.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(it.vat_rate)} % ({formatCurrency(vat, invoice.currency)})
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(base + vat, invoice.currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Separator />

          <div className="ml-auto w-full max-w-sm space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cena bez DPH</span>
              <span className="font-medium">
                {formatCurrency(Number(invoice.subtotal), invoice.currency)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">DPH celkem</span>
              <span className="font-medium">
                {formatCurrency(Number(invoice.vat_amount), invoice.currency)}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-primary px-4 py-3 text-lg font-bold text-primary-foreground">
              <span>Celkem k úhradě</span>
              <span>{formatCurrency(Number(invoice.total), invoice.currency)}</span>
            </div>
          </div>

          {invoice.note && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Poznámka</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{invoice.note}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
