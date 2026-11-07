export const COMPANY_POSTING_ACCOUNTS = {
  receivables: "311",
  revenue: "602",
  vat: "343",
  expenses: "518",
} as const;

type InvoiceAccounts = { vat_account?: string | null; expense_account?: string | null };

/** Account references for the stored invoice, not a calculation of tax liability. */
export function vatPostingAccounts(kind: "issued" | "received", invoice: InvoiceAccounts = {}) {
  return {
    base: kind === "issued" ? COMPANY_POSTING_ACCOUNTS.revenue : invoice.expense_account?.trim() || COMPANY_POSTING_ACCOUNTS.expenses,
    vat: invoice.vat_account?.trim() || COMPANY_POSTING_ACCOUNTS.vat,
    direction: kind === "issued" ? "D" : "MD",
    counterparty: kind === "issued" ? COMPANY_POSTING_ACCOUNTS.receivables : "321",
    counterpartyDirection: kind === "issued" ? "MD" : "D",
  } as const;
}

export function vatAccountSummary(kind: "issued" | "received", invoices: InvoiceAccounts[]) {
  const rows = invoices.length ? invoices : [{}];
  return [...new Set(rows.map((invoice) => {
    const accounts = vatPostingAccounts(kind, invoice);
    return `${accounts.base} ${accounts.direction} / ${accounts.vat} ${accounts.direction}`;
  }))].join(", ");
}