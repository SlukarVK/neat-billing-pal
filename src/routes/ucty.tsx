import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { accountLabel, DIRECTION_LABELS } from "@/lib/accounting";
import { formatCurrency, formatDate } from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/ucty")({
  head: () => ({
    meta: [
      { title: "Účty a vyúčtování — Accountrix" },
      { name: "description", content: "Přehled účtů, zápisů Má dáti / Dal a zůstatků z faktur." },
      { property: "og:title", content: "Účty a vyúčtování — Accountrix" },
      { property: "og:description", content: "Přehled účtů, zápisů Má dáti / Dal a zůstatků z faktur." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["entries", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounting_entries")
        .select("*")
        .order("entry_date")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(
    () => entries.filter((e) => (!from || e.entry_date >= from) && (!to || e.entry_date <= to)),
    [entries, from, to],
  );

  const summary = useMemo(() => {
    const map = new Map<string, { md: number; d: number; count: number }>();
    for (const e of filtered) {
      const s = map.get(e.account) ?? { md: 0, d: 0, count: 0 };
      if (e.direction === "MD") s.md += Number(e.amount);
      else s.d += Number(e.amount);
      s.count++;
      map.set(e.account, s);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const totalMd = summary.reduce((s, [, v]) => s + v.md, 0);
  const totalD = summary.reduce((s, [, v]) => s + v.d, 0);
  const detail = selected ? filtered.filter((e) => e.account === selected) : filtered;

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        summary.map(([acc, v]) => ({
          Účet: accountLabel(acc),
          "Má dáti": v.md,
          Dal: v.d,
          Zůstatek: v.md - v.d,
          Zápisů: v.count,
        })),
      ),
      "Souhrn",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        filtered.map((e) => ({
          Datum: e.entry_date,
          Výrok: e.description,
          Účet: e.account,
          Směr: DIRECTION_LABELS[e.direction],
          Faktura: e.invoice_number ?? "",
          Částka: Number(e.amount),
        })),
      ),
      "Zápisy",
    );
    XLSX.writeFile(wb, "ucty-vyuctovani.xlsx");
  };

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-3xl font-bold">Účty</h1>
          <p className="text-muted-foreground">Vyúčtování faktur podle účtů (Má dáti / Dal).</p>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Od</p>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Do</p>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={exportXlsx} disabled={!filtered.length}>
            <Download className="mr-1.5 h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Celkem Má dáti" value={formatCurrency(totalMd)} />
            <Stat label="Celkem Dal" value={formatCurrency(totalD)} />
            <Stat
              label="Rozdíl (kontrola)"
              value={formatCurrency(totalMd - totalD)}
              hint={Math.abs(totalMd - totalD) < 0.01 ? "Podvojnost v pořádku" : "Strany nesedí"}
            />
          </div>

          <Card className="mb-6 shadow-card">
            <CardHeader>
              <CardTitle className="text-lg">Souhrn podle účtů</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Účet</th>
                    <th className="py-2 pr-3 text-right">Má dáti</th>
                    <th className="py-2 pr-3 text-right">Dal</th>
                    <th className="py-2 pr-3 text-right">Zůstatek</th>
                    <th className="py-2 text-right">Zápisů</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map(([acc, v]) => (
                    <tr
                      key={acc}
                      onClick={() => setSelected(selected === acc ? null : acc)}
                      className={`cursor-pointer border-b last:border-0 hover:bg-muted/50 ${
                        selected === acc ? "bg-accent" : ""
                      }`}
                    >
                      <td className="py-2 pr-3 font-medium">{accountLabel(acc)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(v.md)}</td>
                      <td className="py-2 pr-3 text-right">{formatCurrency(v.d)}</td>
                      <td className="py-2 pr-3 text-right font-semibold">
                        {formatCurrency(v.md - v.d)}
                      </td>
                      <td className="py-2 text-right">{v.count}</td>
                    </tr>
                  ))}
                  {!summary.length && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        Zatím žádné zápisy. Vznikají automaticky při vystavení faktury.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-lg">
                {selected ? `Zápisy na účtu ${accountLabel(selected)}` : "Všechny zápisy"}
              </CardTitle>
              {selected && (
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                  Zobrazit vše
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3">Datum</th>
                    <th className="py-2 pr-3">Výrok</th>
                    <th className="py-2 pr-3">Účet</th>
                    <th className="py-2 pr-3">Směr</th>
                    <th className="py-2 pr-3">Faktura</th>
                    <th className="py-2 text-right">Částka</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(e.entry_date)}</td>
                      <td className="py-2 pr-3">{e.description}</td>
                      <td className="py-2 pr-3">{e.account}</td>
                      <td className="py-2 pr-3">{DIRECTION_LABELS[e.direction]}</td>
                      <td className="py-2 pr-3">
                        {e.invoice_id ? (
                          <Link
                            to="/faktury/$id"
                            params={{ id: e.invoice_id }}
                            className="text-primary underline"
                          >
                            {e.invoice_number}
                          </Link>
                        ) : (
                          e.invoice_number
                        )}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {formatCurrency(Number(e.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
