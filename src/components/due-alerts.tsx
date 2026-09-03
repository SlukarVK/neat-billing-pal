import { Link } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, Mail } from "lucide-react";
import {
  buildReminderMailto,
  formatCurrency,
  formatDate,
  getDueInfo,
} from "@/lib/invoice-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export interface DueAlertInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email?: string | null;
  status: string;
  due_date: string | null;
  total: number | string;
  currency: string;
}

/** Upozornění na faktury po splatnosti a na ty, které se splatnosti blíží. */
export function DueAlerts({ invoices }: { invoices: DueAlertInvoice[] }) {
  const evaluated = invoices.map((inv) => ({ inv, due: getDueInfo(inv) }));
  const overdue = evaluated.filter((e) => e.due.level === "overdue");
  const soon = evaluated.filter((e) => e.due.level === "soon" || e.due.level === "today");
  if (!overdue.length && !soon.length) return null;

  const sum = (list: typeof evaluated) =>
    list.reduce((a, e) => a + Number(e.inv.total), 0);

  const Row = ({ inv, label }: { inv: DueAlertInvoice; label: string }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <Link
        to="/faktury/$id"
        params={{ id: inv.id }}
        className="font-medium underline-offset-2 hover:underline"
      >
        {inv.invoice_number} · {inv.client_name}
      </Link>
      <span className="flex items-center gap-1 text-xs opacity-80">
        {label} · splatnost {formatDate(inv.due_date)} ·{" "}
        {formatCurrency(Number(inv.total), inv.currency)}
        <a
          href={buildReminderMailto([inv], inv.client_email)}
          title="Poslat upomínku e-mailem"
          className="rounded p-1 hover:bg-foreground/10"
        >
          <Mail className="h-3.5 w-3.5" />
        </a>
      </span>
    </li>
  );

  const SendAll = ({ list }: { list: typeof evaluated }) => (
    <Button asChild variant="outline" size="sm" className="mt-1">
      <a href={buildReminderMailto(list.map((e) => e.inv))}>
        <Mail className="mr-1.5 h-4 w-4" />
        Poslat upomínku e-mailem
      </a>
    </Button>
  );

  return (
    <div className="mb-6 grid gap-4 md:grid-cols-2 print:hidden">
      {overdue.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5 shadow-card">
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-2 font-semibold text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Po splatnosti: {overdue.length} faktur · {formatCurrency(sum(overdue))}
            </p>
            <ul className="space-y-1">
              {overdue.slice(0, 5).map((e) => (
                <Row key={e.inv.id} inv={e.inv} label={e.due.label} />
              ))}
            </ul>
            <SendAll list={overdue} />
          </CardContent>
        </Card>
      )}
      {soon.length > 0 && (
        <Card className="border-primary/40 bg-primary/5 shadow-card">
          <CardContent className="space-y-2 p-4">
            <p className="flex items-center gap-2 font-semibold text-primary">
              <CalendarClock className="h-4 w-4" />
              Blíží se splatnost: {soon.length} faktur · {formatCurrency(sum(soon))}
            </p>
            <ul className="space-y-1">
              {soon.slice(0, 5).map((e) => (
                <Row key={e.inv.id} inv={e.inv} label={e.due.label} />
              ))}
            </ul>
            <SendAll list={soon} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
