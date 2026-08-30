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
