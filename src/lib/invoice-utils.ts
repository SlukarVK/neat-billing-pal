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
