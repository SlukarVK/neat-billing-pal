import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Sparkles, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/ai-ucetni")({
  head: () => ({
    meta: [
      { title: "AI účetní asistent — Accountrix" },
      { name: "description", content: "AI navrhne účetní zápisy k faktuře a vysvětlí daňovou povinnost nebo nadměrný odpočet DPH." },
      { property: "og:title", content: "AI účetní asistent — Accountrix" },
      { property: "og:description", content: "AI navrhne účetní zápisy k faktuře a vysvětlí daňovou povinnost nebo nadměrný odpočet DPH." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiPage,
});

const today = new Date().toISOString().slice(0, 10);

function AiPage() {
  const [f, setF] = useState({
    direction: "vydana" as "vydana" | "prijata",
    description: "",
    partner: "",
    sellerVatPayer: true,
    partnerVatPayer: true,
    reverseCharge: false,
    foreign: "",
    base: "",
    vatRate: "21",
    issueDate: today,
    taxableDate: today,
    paid: false,
    otherOutputVat: "",
    otherInputVat: "",
  });
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const num = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;

  const run = async () => {
    setAnswer("");
    setError("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/ai-zauctovani", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          invoice: {
            direction: f.direction,
            description: f.description,
            partner: f.partner,
            sellerVatPayer: f.sellerVatPayer,
            partnerVatPayer: f.partnerVatPayer,
            reverseCharge: f.reverseCharge,
            foreign: f.foreign,
            base: num(f.base),
            vatRate: num(f.vatRate),
            issueDate: f.issueDate,
            taxableDate: f.taxableDate,
            paid: f.paid,
          },
          otherOutputVat: num(f.otherOutputVat),
          otherInputVat: num(f.otherInputVat),
        }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        setError(
          res.status === 402
            ? "Došel kredit pro AI. Doplňte jej v nastavení pracovního prostoru."
            : res.status === 429
              ? "Příliš mnoho požadavků, zkuste to za chvíli."
              : msg || "AI návrh se nepodařilo získat.",
        );
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setAnswer((a) => a + dec.decode(value, { stream: true }));
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("AI návrh se nepodařilo získat.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const vat = (num(f.base) * num(f.vatRate)) / 100;

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <Sparkles className="h-7 w-7 text-primary" /> AI účetní asistent
        </h1>
        <p className="text-muted-foreground">
          Zadejte údaje faktury a AI navrhne účetní zápisy a vysvětlí, zda vám vyjde DPH k zaplacení,
          nebo nadměrný odpočet.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Údaje faktury</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(["vydana", "prijata"] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={f.direction === d ? "default" : "outline"}
                  onClick={() => setF({ ...f, direction: d })}
                >
                  {d === "vydana" ? "Vydaná" : "Přijatá"}
                </Button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Předmět plnění</Label>
              <Textarea
                rows={3}
                placeholder="např. Tvorba webu, nákup notebooku, nájem kanceláře…"
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{f.direction === "vydana" ? "Odběratel" : "Dodavatel"}</Label>
              <Input value={f.partner} onChange={(e) => setF({ ...f, partner: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Základ (bez DPH)</Label>
                <Input inputMode="decimal" value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Sazba DPH %</Label>
                <Input inputMode="decimal" value={f.vatRate} onChange={(e) => setF({ ...f, vatRate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Datum vystavení</Label>
                <Input type="date" value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>DUZP</Label>
                <Input type="date" value={f.taxableDate} onChange={(e) => setF({ ...f, taxableDate: e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Orientační DPH: {vat.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} Kč
            </p>
            <Toggle label="Jsem plátce DPH" v={f.sellerVatPayer} on={(v) => setF({ ...f, sellerVatPayer: v })} />
            <Toggle label="Protistrana je plátce DPH" v={f.partnerVatPayer} on={(v) => setF({ ...f, partnerVatPayer: v })} />
            <Toggle label="Přenesená daňová povinnost" v={f.reverseCharge} on={(v) => setF({ ...f, reverseCharge: v })} />
            <Toggle label="Faktura je již uhrazena" v={f.paid} on={(v) => setF({ ...f, paid: v })} />
            <div className="space-y-1.5">
              <Label>Zahraniční plnění (stát, nepovinné)</Label>
              <Input value={f.foreign} onChange={(e) => setF({ ...f, foreign: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Další DPH na výstupu v období</Label>
                <Input inputMode="decimal" value={f.otherOutputVat} onChange={(e) => setF({ ...f, otherOutputVat: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Další DPH na vstupu v období</Label>
                <Input inputMode="decimal" value={f.otherInputVat} onChange={(e) => setF({ ...f, otherInputVat: e.target.value })} />
              </div>
            </div>
            {busy ? (
              <Button variant="outline" className="w-full" onClick={() => abortRef.current?.abort()}>
                <Square className="mr-2 h-4 w-4" /> Zastavit
              </Button>
            ) : (
              <Button className="w-full" onClick={run} disabled={!f.description.trim() || !f.base}>
                <Sparkles className="mr-2 h-4 w-4" /> Navrhnout zápisy
              </Button>
            )}
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-lg">Návrh AI</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {!answer && !error && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> AI připravuje návrh…
                  </>
                ) : (
                  "Vyplňte údaje vlevo a klikněte na „Navrhnout zápisy“."
                )}
              </p>
            )}
            {answer && (
              <div className="prose prose-sm max-w-none text-foreground [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_p]:my-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Toggle({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <Switch checked={v} onCheckedChange={on} />
    </label>
  );
}
