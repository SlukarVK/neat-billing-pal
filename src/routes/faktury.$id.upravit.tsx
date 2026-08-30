import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { InvoiceForm } from "@/components/invoice-form";

export const Route = createFileRoute("/faktury/$id/upravit")({
  head: () => ({
    meta: [
      { title: "Úprava faktury — Accountrix" },
      { name: "description", content: "Upravte údaje, položky a DPH na faktuře." },
      { property: "og:title", content: "Úprava faktury — Accountrix" },
      { property: "og:description", content: "Upravte údaje, položky a DPH na faktuře." },
    ],
  }),
  component: EditInvoicePage,
});

function EditInvoicePage() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["invoice", id],
    queryFn: async () => {
      const [inv, items] = await Promise.all([
        supabase.from("invoices").select("*").eq("id", id).maybeSingle(),
        supabase.from("invoice_items").select("*").eq("invoice_id", id).order("created_at"),
      ]);
      if (inv.error) throw inv.error;
      if (items.error) throw items.error;
      return { invoice: inv.data, items: items.data ?? [] };
    },
  });

  return (
    <AppShell>
      <h1 className="mb-6 text-3xl font-bold">Úprava faktury</h1>
      {isLoading ? (
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : data?.invoice ? (
        <InvoiceForm invoice={data.invoice} items={data.items} />
      ) : (
        <p className="text-muted-foreground">Faktura nebyla nalezena.</p>
      )}
    </AppShell>
  );
}
