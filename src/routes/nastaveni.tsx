import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { fileToLogoDataUrl, useCompanyProfile } from "@/lib/company-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/nastaveni")({
  head: () => ({
    meta: [
      { title: "Nastavení firmy — Accountrix" },
      {
        name: "description",
        content:
          "Profil firmy, logo a vzhled PDF faktury — údaje se automaticky doplní na každou fakturu.",
      },
      { property: "og:title", content: "Nastavení firmy — Accountrix" },
      { property: "og:description", content: "Profil firmy, logo a vzhled PDF faktury." },
    ],
  }),
  component: SettingsPage,
});

const empty = {
  company_name: "",
  ico: "",
  dic: "",
  vat_payer: false,
  address: "",
  email: "",
  phone: "",
  website: "",
  bank_account: "",
  iban: "",
  swift: "",
  logo_url: "",
  invoice_header_note: "",
  invoice_footer: "",
  default_note: "",
  pdf_layout: "modern",
  pdf_accent: "#1d4ed8",
  pdf_show_logo: true,
};

function SettingsPage() {
  const { data: profile, isLoading } = useCompanyProfile();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (profile) {
      setForm({
        company_name: profile.company_name ?? "",
        ico: profile.ico ?? "",
        dic: profile.dic ?? "",
        vat_payer: profile.vat_payer,
        address: profile.address ?? "",
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        website: profile.website ?? "",
        bank_account: profile.bank_account ?? "",
        iban: profile.iban ?? "",
        swift: profile.swift ?? "",
        logo_url: profile.logo_url ?? "",
        invoice_header_note: profile.invoice_header_note ?? "",
        invoice_footer: profile.invoice_footer ?? "",
        default_note: profile.default_note ?? "",
        pdf_layout: profile.pdf_layout,
        pdf_accent: profile.pdf_accent,
        pdf_show_logo: profile.pdf_show_logo,
      });
    }
  }, [profile]);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Nejste přihlášeni.");
      const { error } = await supabase
        .from("company_profiles")
        .upsert({ ...form, user_id: user.id }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
      toast.success("Nastavení bylo uloženo.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Uložení selhalo."),
  });

  const onLogo = async (file?: File) => {
    if (!file) return;
    try {
      set("logo_url", await fileToLogoDataUrl(file));
      toast.success("Logo bylo načteno, nezapomeňte uložit.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Logo se nepodařilo načíst.");
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Nastavení firmy</h1>
        <p className="mt-1 text-muted-foreground">
          Tyto údaje se automaticky doplní na každou novou fakturu a do PDF.
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Dodavatel</CardTitle>
            <CardDescription>Identifikační a kontaktní údaje vaší firmy.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Název firmy</Label>
              <Input
                value={form.company_name}
                onChange={(e) => set("company_name", e.target.value)}
                placeholder="Accountrix s.r.o."
              />
            </div>
            <div className="space-y-1.5">
              <Label>IČO</Label>
              <Input value={form.ico} onChange={(e) => set("ico", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>DIČ</Label>
              <Input value={form.dic} onChange={(e) => set("dic", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Adresa</Label>
              <Textarea
                rows={2}
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="Ulice 1, 110 00 Praha"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Web</Label>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="vat"
                checked={form.vat_payer}
                onCheckedChange={(v) => set("vat_payer", v)}
              />
              <Label htmlFor="vat">Jsem plátce DPH</Label>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Bankovní spojení</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Bankovní účet</Label>
              <Input
                value={form.bank_account}
                onChange={(e) => set("bank_account", e.target.value)}
                placeholder="123456789/0800"
              />
            </div>
            <div className="space-y-1.5">
              <Label>IBAN</Label>
              <Input value={form.iban} onChange={(e) => set("iban", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>SWIFT / BIC</Label>
              <Input value={form.swift} onChange={(e) => set("swift", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Vzhled faktury (PDF / tisk)</CardTitle>
            <CardDescription>Logo, hlavička, rozložení a vlastní zápatí.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Logo</Label>
              <div className="flex flex-wrap items-center gap-4">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Logo firmy"
                    className="h-16 max-w-40 rounded-md border bg-card object-contain p-1"
                  />
                ) : (
                  <div className="flex h-16 w-40 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                    Bez loga
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" asChild>
                  <label className="cursor-pointer">
                    <Upload className="mr-1.5 h-4 w-4" />
                    Nahrát logo
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => onLogo(e.target.files?.[0])}
                    />
                  </label>
                </Button>
                {form.logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set("logo_url", "")}
                  >
                    <X className="mr-1.5 h-4 w-4" />
                    Odebrat
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Rozložení</Label>
              <Select value={form.pdf_layout} onValueChange={(v) => set("pdf_layout", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modern">Moderní</SelectItem>
                  <SelectItem value="compact">Kompaktní</SelectItem>
                  <SelectItem value="classic">Klasické</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Barva akcentu</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  className="h-10 w-16 p-1"
                  value={form.pdf_accent}
                  onChange={(e) => set("pdf_accent", e.target.value)}
                />
                <Input
                  value={form.pdf_accent}
                  onChange={(e) => set("pdf_accent", e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="showlogo"
                checked={form.pdf_show_logo}
                onCheckedChange={(v) => set("pdf_show_logo", v)}
              />
              <Label htmlFor="showlogo">Zobrazit logo v hlavičce</Label>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Text v hlavičce</Label>
              <Input
                value={form.invoice_header_note}
                onChange={(e) => set("invoice_header_note", e.target.value)}
                placeholder="Zapsáno v OR vedeném u Městského soudu v Praze…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Zápatí faktury</Label>
              <Textarea
                rows={2}
                value={form.invoice_footer}
                onChange={(e) => set("invoice_footer", e.target.value)}
                placeholder="Děkujeme za spolupráci."
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Výchozí poznámka na faktuře</Label>
              <Textarea
                rows={2}
                value={form.default_note}
                onChange={(e) => set("default_note", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending} className="shadow-pop">
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Uložit nastavení
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
