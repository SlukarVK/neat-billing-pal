import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { ACCOUNT_NAMES } from "@/lib/accounting";
import { formatCurrency, formatDate } from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/prijate")({
  head: () => ({
    meta: [
      { title: "Přijaté faktury — Accountrix" },
      { name: "description", content: "Evidence přijatých faktur s automatickým odpočtem DPH na účtu 343." },
      { property: "og:title", content: "Přijaté faktury — Accountrix" },
      { property: "og:description", content: "Evidence přijatých faktur s automatickým odpočtem DPH na účtu 343." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReceivedPage,
});

const today = new Date().toISOString().slice(0, 10);
const empty = {
  invoice_number: "",
  supplier_name: "",
  supplier_ico: "",
  supplier_dic: "",
  description: "",
  issue_date: today,
  taxable_date: today,
  due_date: "",
  subtotal: "",
  vat_rate: "21",
  expense_account: "518",
  vat_account: "343",
};

function ReceivedPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState(empty);
  const num = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;
  const base = num(f.subtotal);
  const vat = Math.round(base * num(f.vat_rate)) / 100;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["received"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("received_invoices")
        .select("*")
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["received"] });
    qc.invalidateQueries({ queryKey: ["entries"] });
    qc.invalidateQueries({ queryKey: ["vat-report"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error();
      const { error } = await supabase.from("received_invoices").insert({
        user_id: user.id,
        invoice_number: f.invoice_number.trim(),
        supplier_name: f.supplier_name.trim(),
        supplier_ico: f.supplier_ico || null,
        supplier_dic: f.supplier_dic || null,
        description: f.description || null,
        issue_date: f.issue_date,
        taxable_date: f.taxable_date,
        due_date: f.due_date || null,
        subtotal: base,
        vat_rate: num(f.vat_rate),
        vat_amount: vat,
        total: base + vat,
        expense_account: f.expense_account.trim() || "518",
        vat_account: f.vat_account,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setF(empty);
      refresh();
      toast.success("Přijatá faktura uložena a zaúčtována (DPH na 343 Má dáti).");
    },
    onError: () => toast.error("Fakturu se nepodařilo uložit."),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("received_invoices")
        .update({ paid: true, paid_date: today })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("received_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const canSave = f.invoice_number.trim() && f.supplier_name.trim() && base > 0;
  const field = (k: keyof typeof empty, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
    </div>
  );
  const totalVat = rows.reduce((s, r) => s + Number(r.vat_amount), 0);

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Přijaté faktury</h1>
        <p className="text-muted-foreground">
          Faktury od dodavatelů. DPH se automaticky zapíše na účet 343 Má dáti a sníží DPH k zaplacení.
        </p>
      </div>

      <Card className="mb-6 shadow-card">
        <CardHeader>
          <CardTitle className="text-lg">Zapsat přijatou fakturu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {field("invoice_number", "Číslo faktury")}
            {field("supplier_name", "Dodavatel")}
            {field("supplier_ico", "IČO")}
            {field("supplier_dic", "DIČ")}
            {field("issue_date", "Datum vystavení", { type: "date" })}
            {field("taxable_date", "DUZP", { type: "date" })}
            {field("due_date", "Splatnost", { type: "date" })}
            <div className="space-y-1.5">
              <Label>Nákladový účet</Label>
              <Input
                list="exp-accounts"
                value={f.expense_account}
                onChange={(e) => setF({ ...f, expense_account: e.target.value })}
              />
              <datalist id="exp-accounts">
                {Object.entries(ACCOUNT_NAMES)
                  .filter(([k]) => k.startsWith("5"))
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </datalist>
            </div>
            {field("subtotal", "Základ bez DPH", { inputMode: "decimal" })}
            {field("vat_rate", "Sazba DPH %", { inputMode: "decimal" })}
            <div className="space-y-1.5">
              <Label>Účet DPH</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={f.vat_account}
                onChange={(e) => setF({ ...f, vat_account: e.target.value })}
              >
                <option value="343">343 – DPH</option>
                <option value="341">341 – Daň z příjmů</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Popis</Label>
              <Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm">
              DPH k odpočtu: <b>{formatCurrency(vat)}</b> · Celkem: <b>{formatCurrency(base + vat)}</b>
            </p>
            <Button className="ml-auto" onClick={() => add.mutate()} disabled={!canSave || add.isPending}>
              <Plus className="mr-1.5 h-4 w-4" /> Uložit a zaúčtovat
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-lg">Seznam přijatých faktur</CardTitle>
          <span className="text-sm text-muted-foreground">DPH na vstupu celkem: {formatCurrency(totalVat)}</span>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Číslo</th>
                  <th className="py-2 pr-3">Dodavatel</th>
                  <th className="py-2 pr-3">DUZP</th>
                  <th className="py-2 pr-3 text-right">Základ</th>
                  <th className="py-2 pr-3 text-right">DPH (343 MD)</th>
                  <th className="py-2 pr-3 text-right">Celkem</th>
                  <th className="py-2 pr-3">Stav</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.invoice_number}</td>
                    <td className="py-2 pr-3">{r.supplier_name}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDate(r.taxable_date)}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCurrency(Number(r.subtotal))}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCurrency(Number(r.vat_amount))}</td>
                    <td className="py-2 pr-3 text-right whitespace-nowrap">{formatCurrency(Number(r.total))}</td>
                    <td className="py-2 pr-3">
                      <Badge variant={r.paid ? "default" : "secondary"}>{r.paid ? "Zaplacena" : "Nezaplacena"}</Badge>
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {!r.paid && (
                        <Button variant="ghost" size="icon" title="Označit jako zaplacenou" onClick={() => markPaid.mutate(r.id)}>
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Smazat" onClick={() => remove.mutate(r.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      Zatím žádné přijaté faktury.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
