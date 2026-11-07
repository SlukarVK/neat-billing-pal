export type VatPeriodMode = "month" | "quarter" | "custom";
export type VatPeriod = { mode: VatPeriodMode; year: number; month: number; quarter: number; from: string; to: string };

export function quarterRange(year: number, quarter: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new Error("Neplatný rok nebo čtvrtletí.");
  }
  const from = `${String(year).padStart(4, "0")}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  const month = quarter * 3;
  const days = month === 3 || month === 12 ? 31 : 30;
  return { from, to: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${days}` };
}

export function calendarPeriod(year: number, month: number, mode: "month" | "quarter" = "month"): VatPeriod {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("Neplatný rok nebo měsíc.");
  }
  const quarter = Math.floor((month - 1) / 3) + 1;
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  const range = mode === "quarter" ? quarterRange(year, quarter) : {
    from: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`,
    to: date.toISOString().slice(0, 10),
  };
  return { mode, year, month, quarter, ...range };
}

export function shiftVatPeriod(period: VatPeriod, delta: -1 | 1): VatPeriod {
  const month = (period.mode === "quarter" ? (period.quarter - 1) * 3 + 1 : period.month) + delta * (period.mode === "quarter" ? 3 : 1);
  const year = period.year + (month < 1 ? -1 : month > 12 ? 1 : 0);
  return calendarPeriod(year, ((month - 1 + 12) % 12) + 1, period.mode === "quarter" ? "quarter" : "month");
}

export function isValidVatRange(from: string, to: string) {
  const validDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  return validDate(from) && validDate(to) && from <= to;
}

export function vatExportName(period: VatPeriod) {
  return period.mode === "quarter" ? `dph-${period.year}-Q${period.quarter}` : `dph-${period.from}-${period.to}`;
}