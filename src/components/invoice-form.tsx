import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { calcItemTotals, formatCurrency } from "@/lib/invoice-utils";
import { useCompanyProfile } from "@/lib/company-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Invoice = Tables<"invoices">;
type InvoiceItem = Tables<"invoice_items">;

export interface ItemDraft {
  id?: string;
  description: string;
  item_type: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
}

const emptyItem = (): ItemDraft => ({
  description: "",
  item_type: "sluzba",
  quantity: 1,
  unit: "ks",
  unit_price: 0,
  vat_rate: 21,
});

export function InvoiceForm({
  invoice,
  items,
}: {
  invoice?: Invoice;
  items?: InvoiceItem[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useCompanyProfile();
  const [prefilled, setPrefilled] = useState(false);

  const [form, setForm] = useState({
    invoice_number: invoice?.invoice_number ?? "",
    status: invoice?.status ?? "vystavena",
    client_name: invoice?.client_name ?? "",
    client_address: invoice?.client_address ?? "",
    client_ico: invoice?.client_ico ?? "",
    client_dic: invoice?.client_dic ?? "",
    client_phone: invoice?.client_phone ?? "",
    client_email: invoice?.client_email ?? "",
    client_vat_payer: invoice?.client_vat_payer ?? false,
    issue_date: invoice?.issue_date ?? new Date().toISOString().slice(0, 10),
    due_date:
      invoice?.due_date ??
      new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    taxable_date: invoice?.taxable_date ?? new Date().toISOString().slice(0, 10),
    payment_method: invoice?.payment_method ?? "prevod",
    bank_account: invoice?.bank_account ?? "",
    variable_symbol: invoice?.variable_symbol ?? "",
    currency: invoice?.currency ?? "CZK",
    note: invoice?.note ?? "",
  });
  const [rows, setRows] = useState<ItemDraft[]>(
    items?.length
      ? items.map((it) => ({
          id: it.id,
          description: it.description,
          item_type: it.item_type,
          quantity: it.quantity,
          unit: it.unit,
          unit_price: it.unit_price,
          vat_rate: it.vat_rate,
        }))
      : [emptyItem()],
  );

  // Předvyplnění údajů z profilu firmy u nové faktury
  useEffect(() => {
    if (invoice || prefilled || !profile) return;
    setForm((f) => ({
      ...f,
      bank_account: f.bank_account || profile.bank_account || "",
      note: f.note || profile.default_note || "",
    }));
    setPrefilled(true);
  }, [invoice, prefilled, profile]);

  const totals = useMemo(() => calcItemTotals(rows), [rows]);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setRow = (i: number, key: keyof ItemDraft, value: string | number) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)));

  const save = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Nejste přihlášeni.");
      if (!form.client_name.trim()) throw new Error("Vyplňte jméno klienta.");
      if (!form.invoice_number.trim()) throw new Error("Vyplňte číslo faktury.");
      if (rows.some((r) => !r.description.trim()))
        throw new Error("Každá položka musí mít popis.");

      const payload = {
        ...form,
        user_id: user.id,
        vat_rate: rows[0]?.vat_rate ?? 21,
        subtotal: totals.subtotal,
        vat_amount: totals.vat,
        total: totals.total,
      };

      let invoiceId = invoice?.id;
      if (invoiceId) {
        const { error } = await supabase
          .from("invoices")
          .update(payload)
          .eq("id", invoiceId);
        if (error) throw error;
        await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
      } else {
        const { data, error } = await supabase
          .from("invoices")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        invoiceId = data.id;
      }

      const { error: itemError } = await supabase.from("invoice_items").insert(
        rows.map((r) => ({
          invoice_id: invoiceId!,
          user_id: user.id,
          description: r.description,
          item_type: r.item_type,
          quantity: r.quantity,
          unit: r.unit,
          unit_price: r.unit_price,
          vat_rate: r.vat_rate,
        })),
      );
      if (itemError) throw itemError;
      return invoiceId!;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      toast.success(invoice ? "Faktura byla upravena." : "Faktura byla vytvořena.");
      navigate({ to: "/faktury/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Uložení selhalo."),
  });

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Faktura</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Číslo faktury *</Label>
            <Input
              value={form.invoice_number}
              onChange={(e) => set("invoice_number", e.target.value)}
              placeholder="2026-001"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Stav</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vystavena">Vystavená</SelectItem>
                <SelectItem value="odeslana">Odeslaná</SelectItem>
                <SelectItem value="zaplacena">Zaplacená</SelectItem>
                <SelectItem value="po_splatnosti">Po splatnosti</SelectItem>
                <SelectItem value="stornovana">Stornovaná</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Měna</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CZK">CZK</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Datum vystavení</Label>
            <Input
              type="date"
              value={form.issue_date}
              onChange={(e) => set("issue_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Datum splatnosti</Label>
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => set("due_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>DUZP</Label>
            <Input
              type="date"
              value={form.taxable_date}
              onChange={(e) => set("taxable_date", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Způsob platby</Label>
            <Select
              value={form.payment_method}
              onValueChange={(v) => set("payment_method", v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prevod">Bankovní převod</SelectItem>
                <SelectItem value="hotovost">Hotovost</SelectItem>
                <SelectItem value="karta">Platební karta</SelectItem>
                <SelectItem value="dobirka">Dobírka</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bankovní účet</Label>
            <Input
              value={form.bank_account}
              onChange={(e) => set("bank_account", e.target.value)}
              placeholder="123456789/0800"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Variabilní symbol</Label>
            <Input
              value={form.variable_symbol}
              onChange={(e) => set("variable_symbol", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Odběratel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Jméno / název klienta *</Label>
            <Input
              value={form.client_name}
              onChange={(e) => set("client_name", e.target.value)}
              placeholder="Firma s.r.o."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Adresa</Label>
            <Input
              value={form.client_address}
              onChange={(e) => set("client_address", e.target.value)}
              placeholder="Ulice 1, 110 00 Praha"
            />
          </div>
          <div className="space-y-1.5">
            <Label>IČO</Label>
            <Input
              value={form.client_ico}
              onChange={(e) => set("client_ico", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>DIČ</Label>
            <Input
              value={form.client_dic}
              onChange={(e) => set("client_dic", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Telefon</Label>
            <Input
              value={form.client_phone}
              onChange={(e) => set("client_phone", e.target.value)}
              placeholder="+420 777 123 456"
            />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={form.client_email}
              onChange={(e) => set("client_email", e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="vat-payer"
              checked={form.client_vat_payer}
              onCheckedChange={(v) => set("client_vat_payer", v)}
            />
            <Label htmlFor="vat-payer">Klient je plátce DPH</Label>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Položky</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((r) => [...r, emptyItem()])}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Přidat položku
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.map((row, i) => (
            <div
              key={i}
              className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-[2fr_1fr_80px_70px_1fr_90px_40px] sm:items-end"
            >
              <div className="space-y-1.5">
                <Label>Popis *</Label>
                <Input
                  value={row.description}
                  onChange={(e) => setRow(i, "description", e.target.value)}
                  placeholder="Konzultace, produkt…"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Typ</Label>
                <Select
                  value={row.item_type}
                  onValueChange={(v) => setRow(i, "item_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sluzba">Služba</SelectItem>
                    <SelectItem value="vyrobek">Výrobek</SelectItem>
                    <SelectItem value="zbozi">Zboží</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Množství</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.quantity}
                  onChange={(e) => setRow(i, "quantity", Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Jedn.</Label>
                <Input
                  value={row.unit}
                  onChange={(e) => setRow(i, "unit", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cena/ks bez DPH</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.unit_price}
                  onChange={(e) => setRow(i, "unit_price", Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>DPH %</Label>
                <Select
                  value={String(row.vat_rate)}
                  onValueChange={(v) => setRow(i, "vat_rate", Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 %</SelectItem>
                    <SelectItem value="12">12 %</SelectItem>
                    <SelectItem value="21">21 %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length === 1}
                onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}

          <Separator />
          <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Základ bez DPH</span>
              <span className="font-medium">
                {formatCurrency(totals.subtotal, form.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">DPH</span>
              <span className="font-medium">
                {formatCurrency(totals.vat, form.currency)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1.5 text-base font-bold">
              <span>Celkem k úhradě</span>
              <span className="text-primary">
                {formatCurrency(totals.total, form.currency)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Poznámka</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={form.note}
            onChange={(e) => set("note", e.target.value)}
            placeholder="Doplňující informace na faktuře…"
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            invoice
              ? navigate({ to: "/faktury/$id", params: { id: invoice.id } })
              : navigate({ to: "/faktury" })
          }
        >
          Zrušit
        </Button>
        <Button type="submit" disabled={save.isPending} className="shadow-pop">
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {invoice ? "Uložit změny" : "Vytvořit fakturu"}
        </Button>
      </div>
    </form>
  );
}
