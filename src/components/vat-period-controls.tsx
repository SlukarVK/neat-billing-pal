import { ChevronLeft, ChevronRight } from "lucide-react";
import { calendarPeriod, shiftVatPeriod, type VatPeriod, type VatPeriodMode } from "@/lib/vat-period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const VAT_MONTHS = ["Leden", "Únor", "Březen", "Duben", "Květen", "Červen", "Červenec", "Srpen", "Září", "Říjen", "Listopad", "Prosinec"];

export function VatPeriodControls({ period, onChange, disabled = false }: { period: VatPeriod; onChange: (period: VatPeriod) => void; disabled?: boolean }) {
  const setMode = (mode: VatPeriodMode) => {
    const start = period.from.match(/^(\d{4})-(\d{2})-\d{2}$/);
    const year = start ? Number(start[1]) : period.year;
    const month = start ? Number(start[2]) : period.month;
    onChange(mode === "custom" ? { ...period, mode } : calendarPeriod(year, month, mode));
  };
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4 print:hidden" aria-label="Výběr období DPH">
      <div className="space-y-1.5">
        <Label>Období</Label>
        <div className="flex gap-1 rounded-md border border-input bg-muted p-1" role="group" aria-label="Typ období">
          {([['month', 'Měsíc'], ['quarter', 'Čtvrtletí'], ['custom', 'Vlastní']] as const).map(([mode, label]) => (
            <Button key={mode} size="sm" variant={period.mode === mode ? "default" : "ghost"} aria-pressed={period.mode === mode} disabled={disabled} onClick={() => setMode(mode)}>{label}</Button>
          ))}
        </div>
      </div>
      {period.mode !== "custom" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="vat-year">Rok</Label>
            <Input id="vat-year" className="w-24" type="number" min={1900} max={9999} value={period.year} disabled={disabled} onChange={(event) => {
              const year = Number(event.target.value);
              if (Number.isInteger(year) && year >= 1900 && year <= 9999) onChange(calendarPeriod(year, period.month, period.mode === "quarter" ? "quarter" : "month"));
            }} />
          </div>
          {period.mode === "quarter" ? (
            <div className="space-y-1.5">
              <Label>Čtvrtletí</Label>
              <div className="flex gap-1" role="group" aria-label="Čtvrtletí">
                {[1, 2, 3, 4].map((quarter) => <Button key={quarter} className="w-12" variant={period.quarter === quarter ? "default" : "outline"} aria-pressed={period.quarter === quarter} aria-label={`${quarter}. čtvrtletí`} disabled={disabled} onClick={() => onChange(calendarPeriod(period.year, (quarter - 1) * 3 + 1, "quarter"))}>Q{quarter}</Button>)}
              </div>
            </div>
          ) : (
            <div className="w-36 space-y-1.5">
              <Label>Měsíc</Label>
              <Select value={String(period.month)} disabled={disabled} onValueChange={(month) => onChange(calendarPeriod(period.year, Number(month)))}>
                <SelectTrigger aria-label="Měsíc"><SelectValue /></SelectTrigger>
                <SelectContent>{VAT_MONTHS.map((name, index) => <SelectItem key={name} value={String(index + 1)}>{name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="flex gap-1">
            <Button variant="outline" size="icon" aria-label="Předchozí období" title="Předchozí období" disabled={disabled || period.year <= 1900} onClick={() => onChange(shiftVatPeriod(period, -1))}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" aria-label="Následující období" title="Následující období" disabled={disabled || period.year >= 9999} onClick={() => onChange(shiftVatPeriod(period, 1))}><ChevronRight /></Button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5"><Label htmlFor="vat-from">Od</Label><Input id="vat-from" type="date" value={period.from} disabled={disabled} onChange={(event) => onChange({ ...period, from: event.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="vat-to">Do</Label><Input id="vat-to" type="date" value={period.to} disabled={disabled} onChange={(event) => onChange({ ...period, to: event.target.value })} /></div>
        </>
      )}
    </div>
  );
}