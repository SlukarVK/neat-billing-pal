import { forwardRef } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { CompanyProfile } from "@/lib/company-profile";
import {
  formatCurrency,
  formatDate,
  ITEM_TYPE_LABELS,
  PAYMENT_LABELS,
  STATUS_LABELS,
} from "@/lib/invoice-utils";

type Invoice = Tables<"invoices">;
type InvoiceItem = Tables<"invoice_items">;

export const InvoiceDocument = forwardRef<
  HTMLDivElement,
  { invoice: Invoice; items: InvoiceItem[]; profile?: CompanyProfile | null | undefined }
>(function InvoiceDocument({ invoice, items, profile }, ref) {
  const accent = profile?.pdf_accent || "#1d4ed8";
  const compact = profile?.pdf_layout === "compact";
  const classic = profile?.pdf_layout === "classic";
  const showLogo = (profile?.pdf_show_logo ?? true) && !!profile?.logo_url;

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex min-w-0 justify-between gap-3 py-0.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-500 sm:text-[11px]">{label}</span>
      <span className="min-w-0 break-words text-right text-[12px] font-medium text-neutral-900 sm:text-[13px]">
        {value || "—"}
      </span>
    </div>
  );

  return (
    <div
      ref={ref}
      className="invoice-doc mx-auto w-full max-w-[820px] bg-white text-neutral-900"
      style={{ fontFamily: "Inter, system-ui, sans-serif" }}
      data-layout={compact ? "compact" : "standard"}
    >
      {/* Header */}
      <div
        className="invoice-header avoid-break flex flex-col items-start justify-between gap-4 pb-5 sm:flex-row sm:gap-6"
        style={{ borderBottom: `3px solid ${accent}` }}
      >
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {showLogo && (
            <img
              src={profile!.logo_url!}

              alt={profile?.company_name || "Logo"}
              style={{ maxHeight: compact ? 44 : 64, maxWidth: 180, objectFit: "contain" }}
            />
          )}
           <div className="min-w-0">
            <p className="text-lg font-bold">{profile?.company_name || "Dodavatel"}</p>
            {profile?.address && (
              <p className="whitespace-pre-wrap text-[13px] text-neutral-600">{profile.address}</p>
            )}
            <p className="break-words text-[13px] text-neutral-600">
              {[profile?.ico && `IČO: ${profile.ico}`, profile?.dic && `DIČ: ${profile.dic}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-[13px] text-neutral-600">
              {[profile?.email, profile?.phone, profile?.website].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className={classic ? "text-left" : "self-end text-right sm:self-auto"}>
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Faktura – daňový doklad
          </p>
          <p className="text-2xl font-bold" style={{ color: accent }}>
            č. {invoice.invoice_number}
          </p>
          <span
            className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            {STATUS_LABELS[invoice.status] ?? invoice.status}
          </span>
        </div>
      </div>

      {profile?.invoice_header_note && (
        <p className="pt-3 text-[13px] text-neutral-600">{profile.invoice_header_note}</p>
      )}

      {/* Parties + payment */}
      <div className="invoice-parties avoid-break grid gap-6 pt-6 sm:grid-cols-2">
        <div className="avoid-break">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
            Odběratel
          </p>
          <p className="text-[15px] font-semibold">{invoice.client_name}</p>
          {invoice.client_address && (
            <p className="text-[13px] text-neutral-600">{invoice.client_address}</p>
          )}
          <div className="mt-2 space-y-0.5">
            <Row label="IČO" value={invoice.client_ico} />
            <Row label="DIČ" value={invoice.client_dic} />
            <Row label="Telefon" value={invoice.client_phone} />
            <Row label="E-mail" value={invoice.client_email} />
            <Row label="DPH" value={invoice.client_vat_payer ? "Plátce DPH" : "Neplátce DPH"} />
          </div>
        </div>
        <div className="avoid-break">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>
            Platební údaje
          </p>
          <div className="space-y-0.5">
            <Row label="Datum vystavení" value={formatDate(invoice.issue_date)} />
            <Row label="Datum splatnosti" value={formatDate(invoice.due_date)} />
            <Row label="DUZP" value={formatDate(invoice.taxable_date)} />
            {invoice.paid_date && <Row label="Datum úhrady" value={formatDate(invoice.paid_date)} />}
            <Row
              label="Způsob platby"
              value={PAYMENT_LABELS[invoice.payment_method] ?? invoice.payment_method}
            />
            <Row
              label="Bankovní účet"
              value={invoice.bank_account || profile?.bank_account}
            />
            {(profile?.iban || profile?.swift) && (
              <Row label="IBAN / SWIFT" value={[profile?.iban, profile?.swift].filter(Boolean).join(" / ")} />
            )}
            <Row label="Variabilní symbol" value={invoice.variable_symbol || invoice.invoice_number} />
            <Row label="Měna" value={invoice.currency} />
          </div>
        </div>
      </div>

      {/* Items */}
      <table
        className="invoice-items mt-7 w-full border-collapse text-[10px] sm:text-[12.5px]"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          <col className="invoice-col-secondary" style={{ width: "5%" }} />
          <col className="invoice-col-description" style={{ width: "34%" }} />
          <col className="invoice-col-secondary" style={{ width: "11%" }} />
          <col className="invoice-col-quantity" style={{ width: "12%" }} />
          <col className="invoice-col-price" style={{ width: "14%" }} />
          <col className="invoice-col-vat" style={{ width: "12%" }} />
          <col className="invoice-col-total" style={{ width: "16%" }} />
        </colgroup>
        <thead>
          <tr style={{ backgroundColor: `${accent}12`, borderBottom: `1.5px solid ${accent}` }}>
            <th className="invoice-col-secondary px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">#</th>
            <th className="px-1 py-2 text-left text-[9px] font-semibold uppercase sm:px-2 sm:text-[11px]">Popis</th>
            <th className="invoice-col-secondary px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide">Typ</th>
            <th className="px-1 py-2 text-right text-[9px] font-semibold uppercase sm:px-2 sm:text-[11px]">Množství</th>
            <th className="px-1 py-2 text-right text-[9px] font-semibold uppercase sm:px-2 sm:text-[11px]">
              Cena/j. bez DPH
            </th>
            <th className="px-1 py-2 text-right text-[9px] font-semibold uppercase sm:px-2 sm:text-[11px]">DPH</th>
            <th className="px-1 py-2 text-right text-[9px] font-semibold uppercase sm:px-2 sm:text-[11px]">
              Celkem s DPH
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, index) => {
            const base = Number(it.quantity) * Number(it.unit_price);
            const vat = (base * Number(it.vat_rate)) / 100;
            return (
              <tr
                key={it.id}
                className="avoid-break align-top"
                style={{
                  borderBottom: "1px solid #ececec",
                  backgroundColor: index % 2 === 1 ? "#fafafa" : "transparent",
                }}
              >
                <td className="invoice-col-secondary px-2 py-2 text-neutral-400">{index + 1}</td>
                <td className="px-1 py-2 font-medium sm:px-2" style={{ wordBreak: "break-word" }}>
                  {it.description}
                </td>
                <td className="invoice-col-secondary px-2 py-2 text-neutral-600">
                  {ITEM_TYPE_LABELS[it.item_type] ?? it.item_type}
                </td>
                <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums sm:px-2">
                  {Number(it.quantity)} {it.unit}
                </td>
                <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums sm:px-2">
                  {formatCurrency(Number(it.unit_price), invoice.currency)}
                </td>
                <td className="px-1 py-2 text-right tabular-nums sm:px-2">
                  <span className="block">{Number(it.vat_rate)} %</span>
                  <span className="block text-[11px] text-neutral-500">
                    {formatCurrency(vat, invoice.currency)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-1 py-2 text-right font-semibold tabular-nums sm:px-2">
                  {formatCurrency(base + vat, invoice.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="avoid-break mt-6 flex justify-end">
        <div className="w-full max-w-[320px] space-y-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-neutral-500">Cena bez DPH</span>
            <span className="font-medium tabular-nums">
              {formatCurrency(Number(invoice.subtotal), invoice.currency)}
            </span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-neutral-500">DPH celkem</span>
            <span className="font-medium tabular-nums">
              {formatCurrency(Number(invoice.vat_amount), invoice.currency)}
            </span>
          </div>
          <div
            className="flex justify-between rounded-lg px-4 py-2.5 text-[15px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            <span>Celkem k úhradě</span>
            <span className="tabular-nums">
              {formatCurrency(Number(invoice.total), invoice.currency)}
            </span>
          </div>
        </div>
      </div>

      {invoice.note && (
        <div className="avoid-break mt-6 rounded-lg bg-neutral-50 p-3 text-[13px]">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Poznámka</p>
          <p className="mt-0.5 whitespace-pre-wrap">{invoice.note}</p>
        </div>
      )}


      <div className="avoid-break mt-8 border-t pt-3 text-center text-[11px] text-neutral-500">
        {profile?.invoice_footer || "Děkujeme za spolupráci."}
      </div>

    </div>
  );
});
