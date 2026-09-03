import { parseCsv, STATUS_LABELS, PAYMENT_LABELS } from "@/lib/invoice-utils";

export interface ImportIssue {
  /** Číslo řádku v CSV včetně hlavičky (řádek 1 = hlavička). */
  line: number;
  invoiceNumber: string;
  field: string;
  message: string;
}

export interface ImportRowPayload {
  user_id: string;
  invoice_number: string;
  status: string;
  client_name: string;
  client_address: string | null;
  client_ico: string | null;
  client_dic: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_vat_payer: boolean;
  issue_date: string;
  due_date: string;
  taxable_date: string;
  paid_date: string | null;
  payment_method: string;
  bank_account: string | null;
  variable_symbol: string | null;
  currency: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  note: string | null;
}

export interface ImportValidation {
  valid: ImportRowPayload[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  totalRows: number;
}

const TRUE_VALUES = ["1", "true", "ano", "yes", "y", "a"];
const FALSE_VALUES = ["", "0", "false", "ne", "no", "n"];

/** Převede datum z ISO nebo českého formátu (1.2.2026) na ISO; jinak null. */
export function normalizeDate(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) {
    const [y, m, d] = v.split("-");
    const iso = `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    return Number.isNaN(new Date(`${iso}T00:00:00`).getTime()) ? null : iso;
  }
  const m = v.match(/^(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{4})$/);
  if (m) {
    const iso = `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    return Number.isNaN(new Date(`${iso}T00:00:00`).getTime()) ? null : iso;
  }
  return null;
}

/** Převede číslo s mezerami, čárkou nebo měnou na number; jinak null. */
export function normalizeNumber(value: string | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(/[\s\u00a0]/g, "").replace(/[^\d,.\-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Zvaliduje CSV s fakturami. Vrací řádky připravené k uložení
 * a seznam chyb/varování s číslem řádku a důvodem.
 */
export function validateInvoiceCsv(text: string, userId: string): ImportValidation {
  const rows = parseCsv(text);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const valid: ImportRowPayload[] = [];
  const seen = new Set<string>();
  const today = new Date().toISOString().slice(0, 10);

  rows.forEach((r, idx) => {
    const line = idx + 2;
    const number = (r["invoice_number"] ?? "").trim();
    const rowErrors: ImportIssue[] = [];
    const add = (field: string, message: string) =>
      rowErrors.push({ line, invoiceNumber: number || "—", field, message });
    const warn = (field: string, message: string) =>
      warnings.push({ line, invoiceNumber: number || "—", field, message });

    if (!number) add("invoice_number", "Chybí číslo faktury.");
    else if (seen.has(number.toLowerCase()))
      add("invoice_number", `Číslo faktury „${number}“ se v souboru opakuje.`);

    const clientName = (r["client_name"] ?? "").trim();
    if (!clientName) add("client_name", "Chybí jméno klienta.");

    const status = (r["status"] ?? "").trim() || "vystavena";
    if (!STATUS_LABELS[status])
      add("status", `Neznámý stav „${status}“. Povolené: ${Object.keys(STATUS_LABELS).join(", ")}.`);

    const payment = (r["payment_method"] ?? "").trim() || "prevod";
    if (!PAYMENT_LABELS[payment])
      add(
        "payment_method",
        `Neznámý způsob platby „${payment}“. Povolené: ${Object.keys(PAYMENT_LABELS).join(", ")}.`,
      );

    const issue = normalizeDate(r["issue_date"]);
    if (r["issue_date"]?.trim() && !issue)
      add("issue_date", `Neplatné datum vystavení „${r["issue_date"]}“ (použijte 2026-01-31 nebo 31.1.2026).`);
    const due = normalizeDate(r["due_date"]);
    if (r["due_date"]?.trim() && !due)
      add("due_date", `Neplatné datum splatnosti „${r["due_date"]}“.`);
    const taxable = normalizeDate(r["taxable_date"]);
    if (r["taxable_date"]?.trim() && !taxable)
      add("taxable_date", `Neplatné datum zdanitelného plnění „${r["taxable_date"]}“.`);
    const paid = normalizeDate(r["paid_date"]);
    if (r["paid_date"]?.trim() && !paid) add("paid_date", `Neplatné datum platby „${r["paid_date"]}“.`);

    const issueFinal = issue ?? today;
    const dueFinal = due ?? issueFinal;
    if (due && issue && due < issue)
      warn("due_date", "Splatnost je dříve než datum vystavení.");

    const email = (r["client_email"] ?? "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      add("client_email", `Neplatný e-mail „${email}“.`);

    const ico = (r["client_ico"] ?? "").trim();
    if (ico && !/^\d{6,10}$/.test(ico.replace(/\s/g, "")))
      warn("client_ico", `IČO „${ico}“ nemá obvyklý tvar (6–10 číslic).`);

    const vatPayerRaw = (r["client_vat_payer"] ?? "").trim().toLowerCase();
    if (vatPayerRaw && !TRUE_VALUES.includes(vatPayerRaw) && !FALSE_VALUES.includes(vatPayerRaw))
      add("client_vat_payer", `Hodnota „${vatPayerRaw}“ není ano/ne.`);

    const subtotal = normalizeNumber(r["subtotal"]);
    if (r["subtotal"]?.trim() && subtotal === null)
      add("subtotal", `Částka bez DPH „${r["subtotal"]}“ není číslo.`);
    const vat = normalizeNumber(r["vat_amount"]);
    if (r["vat_amount"]?.trim() && vat === null)
      add("vat_amount", `DPH „${r["vat_amount"]}“ není číslo.`);
    const total = normalizeNumber(r["total"]);
    if (r["total"]?.trim() && total === null)
      add("total", `Celková částka „${r["total"]}“ není číslo.`);

    const sub = subtotal ?? 0;
    const vatAmount = vat ?? 0;
    const totalFinal = total ?? sub + vatAmount;
    if (total !== null && Math.abs(totalFinal - (sub + vatAmount)) > 0.5)
      warn(
        "total",
        `Celkem (${totalFinal}) neodpovídá součtu bez DPH a DPH (${(sub + vatAmount).toFixed(2)}).`,
      );

    const currency = ((r["currency"] ?? "").trim() || "CZK").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) add("currency", `Neplatná měna „${currency}“ (očekáván kód, např. CZK).`);

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    seen.add(number.toLowerCase());
    valid.push({
      user_id: userId,
      invoice_number: number,
      status,
      client_name: clientName,
      client_address: (r["client_address"] ?? "").trim() || null,
      client_ico: ico || null,
      client_dic: (r["client_dic"] ?? "").trim() || null,
      client_phone: (r["client_phone"] ?? "").trim() || null,
      client_email: email || null,
      client_vat_payer: TRUE_VALUES.includes(vatPayerRaw),
      issue_date: issueFinal,
      due_date: dueFinal,
      taxable_date: taxable ?? issueFinal,
      paid_date: paid,
      payment_method: payment,
      bank_account: (r["bank_account"] ?? "").trim() || null,
      variable_symbol: (r["variable_symbol"] ?? "").trim() || null,
      currency,
      subtotal: sub,
      vat_amount: vatAmount,
      total: totalFinal,
      note: (r["note"] ?? "").trim() || null,
    });
  });

  return { valid, errors, warnings, totalRows: rows.length };
}
