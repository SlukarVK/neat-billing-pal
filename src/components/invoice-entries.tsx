import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAccountNames, accountLabel, DIRECTION_LABELS } from "@/lib/accounting";
import { formatCurrency, formatDate } from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function InvoiceEntries({
  invoiceId,
  invoiceNumber,
  currency,
}: {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    entry_date: new Date().toISOString().slice(0, 10),
    description: "",
    account: "",
    direction: "MD",
    amount: "",
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["entries", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounting_entries")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("entry_date")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["entries"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error();
      const { error } = await supabase.from("accounting_entries").insert({
        user_id: user.id,
        invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        entry_date: form.entry_date,
        description: form.description.trim(),
        account: form.account.trim(),
        direction: form.direction,
        amount: Number(form.amount.replace(",", ".")) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setForm((f) => ({ ...f, description: "", account: "", amount: "" }));
      refresh();
      toast.success("Zápis přidán.");
    },
    onError: () => toast.error("Zápis se nepodařilo uložit."),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounting_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const md = entries.filter((e) => e.direction === "MD").reduce((s, e) => s + Number(e.amount), 0);
  const d = entries.filter((e) => e.direction === "D").reduce((s, e) => s + Number(e.amount), 0);
  const canAdd = form.description.trim() && form.account.trim() && form.amount;

  return (
    <Card className="mt-6 shadow-card print:hidden">
      <CardHeader>
        <CardTitle className="text-lg">Zápis do účtů</CardTitle>
        <p className="text-sm text-muted-foreground">
          Automatické zápisy vznikají při vystavení a zaplacení faktury. Další můžete přidat ručně.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">Výrok</th>
                <th className="py-2 pr-3">Účet</th>
                <th className="py-2 pr-3">Směr</th>
                <th className="py-2 pr-3">Faktura</th>
                <th className="py-2 pr-3 text-right">Částka</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                  <td className="py-2 pr-3">
                    {e.description}{" "}
                    {e.is_auto && <Badge variant="secondary" className="ml-1">auto</Badge>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{accountLabel(e.account)}</td>
                  <td className="py-2 pr-3">{DIRECTION_LABELS[e.direction]}</td>
                  <td className="py-2 pr-3">{e.invoice_number}</td>
                  <td className="py-2 pr-3 text-right whitespace-nowrap">
                    {formatCurrency(Number(e.amount), currency)}
                  </td>
                  <td className="py-2 text-right">
                    {!e.is_auto && (
                      <Button variant="ghost" size="icon" onClick={() => remove.mutate(e.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-muted-foreground">
                    Zatím žádné zápisy.
                  </td>
                </tr>
              )}
            </tbody>
            {entries.length > 0 && (
              <tfoot className="font-medium">
                <tr>
                  <td colSpan={5} className="pt-2">
                    Součet Má dáti / Dal
                  </td>
                  <td className="pt-2 text-right whitespace-nowrap" colSpan={2}>
                    {formatCurrency(md, currency)} / {formatCurrency(d, currency)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="grid gap-2 sm:grid-cols-[140px_1fr_120px_120px_120px_auto]">
          <Input
            type="date"
            value={form.entry_date}
            onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
          />
          <Input
            placeholder="Výrok"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <Input
            placeholder="Účet"
            list="account-list"
            value={form.account}
            onChange={(e) => setForm({ ...form, account: e.target.value })}
          />
          <datalist id="account-list">
            {Object.entries(accountNames).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </datalist>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value })}
          >
            <option value="MD">Má dáti</option>
            <option value="D">Dal</option>
          </select>
          <Input
            placeholder="Částka"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <Button onClick={() => add.mutate()} disabled={!canAdd || add.isPending}>
            <Plus className="mr-1 h-4 w-4" />
            Přidat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
