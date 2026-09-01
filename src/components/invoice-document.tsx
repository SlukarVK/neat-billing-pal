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
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-right text-[13px] font-medium text-neutral-900">{value || "—"}</span>
    </div>
  );

  return (
    <div
      ref={ref}
      className="invoice-doc mx-auto w-full max-w-[820px] bg-white text-neutral-900"
      style={{ padding: compact ? "24px 28px" : "40px 44px", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Header */}
      <div
        className="invoice-header avoid-break flex flex-wrap items-start justify-between gap-6 pb-5"
        style={{ borderBottom: `3px solid ${accent}` }}
      >
        <div className="flex items-start gap-4">
          {showLogo && (
            <img
              src={profile!.logo_url!}

              alt={profile?.company_name || "Logo"}
              style={{ maxHeight: compact ? 44 : 64, maxWidth: 180, objectFit: "contain" }}
            />
          )}
          <div>
            <p className="text-lg font-bold">{profile?.company_name || "Dodavatel"}</p>
            {profile?.address && (
              <p className="whitespace-pre-wrap text-[13px] text-neutral-600">{profile.address}</p>
            )}
            <p className="text-[13px] text-neutral-600">
              {[profile?.ico && `IČO: ${profile.ico}`, profile?.dic && `DIČ: ${profile.dic}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="text-[13px] text-neutral-600">
              {[profile?.email, profile?.phone, profile?.website].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className={classic ? "text-left" : "text-right"}>
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
      <div className="grid gap-6 pt-6 sm:grid-cols-2">
        <div>
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
        <div>
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
      <table className="mt-7 w-full border-collapse text-[13px]">
        <thead>
          <tr style={{ backgroundColor: `${accent}12` }}>
            <th className="p-2 text-left font-semibold">Popis</th>
            <th className="p-2 text-left font-semibold">Typ</th>
            <th className="p-2 text-right font-semibold">Množství</th>
            <th className="p-2 text-right font-semibold">Cena/j. bez DPH</th>
            <th className="p-2 text-right font-semibold">DPH</th>
            <th className="p-2 text-right font-semibold">Celkem s DPH</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const base = Number(it.quantity) * Number(it.unit_price);
            const vat = (base * Number(it.vat_rate)) / 100;
            return (
              <tr key={it.id} style={{ borderBottom: "1px solid #e5e5e5" }}>
                <td className="p-2 font-medium">{it.description}</td>
                <td className="p-2">{ITEM_TYPE_LABELS[it.item_type] ?? it.item_type}</td>
                <td className="p-2 text-right">
                  {Number(it.quantity)} {it.unit}
                </td>
                <td className="p-2 text-right">
                  {formatCurrency(Number(it.unit_price), invoice.currency)}
                </td>
                <td className="p-2 text-right">
                  {Number(it.vat_rate)} % ({formatCurrency(vat, invoice.currency)})
                </td>
                <td className="p-2 text-right font-medium">
                  {formatCurrency(base + vat, invoice.currency)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-6 flex justify-end">
        <div className="w-full max-w-[320px] space-y-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-neutral-500">Cena bez DPH</span>
            <span className="font-medium">
              {formatCurrency(Number(invoice.subtotal), invoice.currency)}
            </span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-neutral-500">DPH celkem</span>
            <span className="font-medium">
              {formatCurrency(Number(invoice.vat_amount), invoice.currency)}
            </span>
          </div>
          <div
            className="flex justify-between rounded-lg px-4 py-2.5 text-[15px] font-bold text-white"
            style={{ backgroundColor: accent }}
          >
            <span>Celkem k úhradě</span>
            <span>{formatCurrency(Number(invoice.total), invoice.currency)}</span>
          </div>
        </div>
      </div>

      {invoice.note && (
        <div className="mt-6 rounded-lg bg-neutral-50 p-3 text-[13px]">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Poznámka</p>
          <p className="mt-0.5 whitespace-pre-wrap">{invoice.note}</p>
        </div>
      )}

      <div className="mt-8 border-t pt-3 text-center text-[11px] text-neutral-500">
        {profile?.invoice_footer || "Děkujeme za spolupráci."}
      </div>
    </div>
  );
});
