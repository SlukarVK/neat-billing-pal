import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { InvoiceForm } from "@/components/invoice-form";

export const Route = createFileRoute("/faktury/nova")({
  head: () => ({
    meta: [
      { title: "Nová faktura — Accountrix" },
      { name: "description", content: "Vytvořte novou fakturu v Accountrix." },
      { property: "og:title", content: "Nová faktura — Accountrix" },
      { property: "og:description", content: "Vytvořte novou fakturu v Accountrix." },
    ],
  }),
  component: NewInvoicePage,
});

function NewInvoicePage() {
  return (
    <AppShell>
      <h1 className="mb-6 text-3xl font-bold">Nová faktura</h1>
      <InvoiceForm />
    </AppShell>
  );
}
