export function formatCurrency(value: number, currency = "CZK") {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatDate(date: string | null | undefined) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("cs-CZ").format(new Date(date));
}

export const STATUS_LABELS: Record<string, string> = {
  navrh: "Návrh",
  vystavena: "Vystavená",
  odeslana: "Odeslaná",
  zaplacena: "Zaplacená",
  po_splatnosti: "Po splatnosti",
  stornovana: "Stornovaná",
};

export const PAYMENT_LABELS: Record<string, string> = {
  prevod: "Bankovní převod",
  hotovost: "Hotovost",
  karta: "Platební karta",
  dobirka: "Dobírka",
};

export const ITEM_TYPE_LABELS: Record<string, string> = {
  sluzba: "Služba",
  vyrobek: "Výrobek",
  zbozi: "Zboží",
};

export interface ItemTotals {
  subtotal: number;
  vat: number;
  total: number;
}

export function calcItemTotals(
  items: { quantity: number; unit_price: number; vat_rate: number }[],
): ItemTotals {
  let subtotal = 0;
  let vat = 0;
  for (const it of items) {
    const base = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
    subtotal += base;
    vat += (base * (Number(it.vat_rate) || 0)) / 100;
  }
  return { subtotal, vat, total: subtotal + vat };
}

/* ---------- CSV ---------- */

export const CSV_COLUMNS = [
  "invoice_number",
  "status",
  "client_name",
  "client_address",
  "client_ico",
  "client_dic",
  "client_phone",
  "client_email",
  "client_vat_payer",
  "issue_date",
  "due_date",
  "taxable_date",
  "paid_date",
  "payment_method",
  "bank_account",
  "variable_symbol",
  "currency",
  "subtotal",
  "vat_amount",
  "total",
  "note",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

const escapeCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Excel-friendly CSV (semicolon separator + BOM). */
export function toCsv(rows: Record<string, unknown>[], columns: readonly string[] = CSV_COLUMNS) {
  const head = columns.join(";");
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c])).join(";"));
  return "\uFEFF" + [head, ...body].join("\r\n");
}

export function downloadFile(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Minimal CSV parser supporting quotes and `;` or `,` separators. */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const firstLine = clean.split("\n")[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/* ---------- Splatnost ---------- */

export const DUE_SOON_DAYS = 7;

/** Počet dní do splatnosti (záporné = po splatnosti). */
export function daysUntilDue(dueDate: string | null | undefined, today = new Date()): number {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  const d = new Date(`${dueDate}T00:00:00`);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export type DueLevel = "none" | "ok" | "soon" | "today" | "overdue";

export interface DueInfo {
  level: DueLevel;
  days: number;
  label: string;
}

/** Vyhodnotí splatnost faktury (zaplacené a stornované se nehlídají). */
export function getDueInfo(
  invoice: { due_date: string | null; status: string },
  today = new Date(),
): DueInfo {
  if (invoice.status === "zaplacena" || invoice.status === "stornovana" || invoice.status === "navrh")
    return { level: "none", days: 0, label: "" };
  const days = daysUntilDue(invoice.due_date, today);
  if (!Number.isFinite(days)) return { level: "none", days: 0, label: "" };
  if (days < 0)
    return { level: "overdue", days, label: `Po splatnosti ${Math.abs(days)} dní` };
  if (days === 0) return { level: "today", days, label: "Splatnost je dnes" };
  if (days <= DUE_SOON_DAYS)
    return { level: "soon", days, label: `Splatnost za ${days} ${days === 1 ? "den" : days < 5 ? "dny" : "dní"}` };
  return { level: "ok", days, label: `Splatnost za ${days} dní` };
}

/** Datum splatnosti = datum vystavení + počet dní. */
export function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Vzorové CSV pro import. */
export function sampleCsv() {
  const today = new Date().toISOString().slice(0, 10);
  return toCsv([
    {
      invoice_number: "2026-0001",
      status: "vystavena",
      client_name: "Ukázka s.r.o.",
      client_address: "Náměstí 1, 110 00 Praha",
      client_ico: "12345678",
      client_dic: "CZ12345678",
      client_phone: "+420 777 123 456",
      client_email: "faktury@ukazka.cz",
      client_vat_payer: "ano",
      issue_date: today,
      due_date: addDays(today, 14),
      taxable_date: today,
      paid_date: "",
      payment_method: "prevod",
      bank_account: "123456789/0100",
      variable_symbol: "20260001",
      currency: "CZK",
      subtotal: "10000",
      vat_amount: "2100",
      total: "12100",
      note: "Ukázkový řádek – smažte před importem vlastních dat.",
    },
  ]);
}
