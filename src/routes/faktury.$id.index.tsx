import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Mail,
  Pencil,
  Printer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { AppShell } from "@/components/app-shell";
import { InvoiceDocument } from "@/components/invoice-document";
import { useCompanyProfile } from "@/lib/company-profile";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { formatCurrency, STATUS_LABELS } from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      {
        property: "og:description",
        content: "Detail faktury se všemi údaji klienta, položkami a DPH.",
      },
    ],
  }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const docRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState({ to: "", subject: "", body: "" });

  const { data: profile } = useCompanyProfile();
  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [inv, items] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
      ]);
      if (inv.error) throw inv.error;
      if (items.error) throw items.error;
      return { invoice: inv.data, items: items.data ?? [] };
    },
  });

  const invoice = data?.invoice;

  const update = useMutation({
    mutationFn: async (patch: TablesUpdate<"invoices">) => {
      const { error } = await supabase.from("invoices").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: () => toast.error("Změna se nezdařila."),
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

  const makePdf = async () => {
    if (!docRef.current || !invoice) return;
    setPdfBusy(true);
    try {
      await downloadInvoicePdf(docRef.current, invoice.invoice_number);
      toast.success("PDF bylo staženo.");
    } catch {
      toast.error("PDF se nepodařilo vytvořit.");
    } finally {
      setPdfBusy(false);
    }
  };

  const openEmail = () => {
    if (!invoice) return;
    setEmail({
      to: invoice.client_email ?? "",
      subject: `Faktura č. ${invoice.invoice_number}`,
      body: `Dobrý den,\n\nv příloze zasíláme fakturu č. ${invoice.invoice_number} na částku ${formatCurrency(
        Number(invoice.total),
        invoice.currency,
      )} se splatností ${new Intl.DateTimeFormat("cs-CZ").format(new Date(invoice.due_date))}.\n\nS pozdravem,\n${
        profile?.company_name ?? ""
      }`,
    });
    setEmailOpen(true);
  };

  const sendEmail = async () => {
    if (!invoice) return;
    await makePdf();
    const href = `mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(
      email.subject,
    )}&body=${encodeURIComponent(email.body)}`;
    window.location.href = href;
    update.mutate({
      sent_at: new Date().toISOString(),
      status: invoice.status === "navrh" || invoice.status === "vystavena" ? "odeslana" : invoice.status,
    });
    setEmailOpen(false);
    toast.success("PDF staženo a e-mail připraven k odeslání.");
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

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
        <Badge variant="secondary">{STATUS_LABELS[invoice.status] ?? invoice.status}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {invoice.status !== "zaplacena" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                update.mutate(
                  { status: "zaplacena", paid_date: new Date().toISOString().slice(0, 10) },
                  { onSuccess: () => toast.success("Faktura označena jako zaplacená.") },
                );
              }}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4 text-primary" />
              Označit jako zaplacenou
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={openEmail}>
            <Mail className="mr-1.5 h-4 w-4" />
            Odeslat e-mailem
          </Button>
          <Button variant="outline" size="sm" onClick={makePdf} disabled={pdfBusy}>
            {pdfBusy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Stáhnout PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Tisk
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

      <p className="mb-3 text-sm text-muted-foreground print:hidden">
        Náhled faktury přesně tak, jak se vytiskne a uloží do PDF. Vzhled upravíte v{" "}
        <Link to="/nastaveni" className="text-primary underline">
          nastavení firmy
        </Link>
        .
      </p>

      <Card className="print-area shadow-card">
        <CardContent className="p-0">
          <InvoiceDocument ref={docRef} invoice={invoice} items={items} profile={profile ?? null} />
        </CardContent>
      </Card>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Odeslat fakturu e-mailem</DialogTitle>
            <DialogDescription>
              PDF faktury se stáhne a otevře se váš e-mailový klient s předvyplněnou zprávou —
              stačí PDF přiložit a odeslat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Příjemce</Label>
              <Input
                type="email"
                value={email.to}
                onChange={(e) => setEmail((v) => ({ ...v, to: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Předmět</Label>
              <Input
                value={email.subject}
                onChange={(e) => setEmail((v) => ({ ...v, subject: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Zpráva</Label>
              <Textarea
                rows={6}
                value={email.body}
                onChange={(e) => setEmail((v) => ({ ...v, body: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={sendEmail} disabled={pdfBusy}>
              {pdfBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Stáhnout PDF a odeslat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
