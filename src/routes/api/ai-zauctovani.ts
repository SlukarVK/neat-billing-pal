import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
} from "@/lib/aig-run-id.server";

const Input = z.object({
  invoice: z.object({
    direction: z.enum(["vydana", "prijata"]),
    description: z.string().max(2000),
    partner: z.string().max(300).optional().default(""),
    sellerVatPayer: z.boolean(),
    partnerVatPayer: z.boolean(),
    reverseCharge: z.boolean(),
    foreign: z.string().max(100).optional().default(""),
    base: z.number(),
    vatRate: z.number(),
    issueDate: z.string().max(20),
    taxableDate: z.string().max(20),
    paid: z.boolean(),
  }),
  otherOutputVat: z.number().optional().default(0),
  otherInputVat: z.number().optional().default(0),
});

const SYSTEM = `Jsi zkušený český účetní a daňový poradce. Uživatel zadá údaje faktury.
Odpověz česky v Markdownu se sekcemi:
## Navržené účetní zápisy
Tabulka | Datum | Výrok | MD | D | Částka | podle české účtové osnovy (např. 311, 321, 343, 221, 5xx, 6xx). Zohledni plátcovství DPH, přenesenou daňovou povinnost a úhradu.
## DPH
Vysvětli, jakou DPH na výstupu/vstupu faktura generuje, ve kterém řádku přiznání a kontrolního hlášení se uvádí (orientačně).
## Daňová povinnost / nadměrný odpočet
Spočítej výsledek za období (DPH na výstupu − odpočet, včetně zadaných dalších částek) a jasně napiš, zda jde o vlastní daňovou povinnost (k zaplacení) nebo nadměrný odpočet (vrátí se), s částkou a splatností (25. den po skončení období).
Na konci krátké upozornění, že jde o orientační návrh a je vhodné ho ověřit s účetním. Buď stručný.`;

export const Route = createFileRoute("/api/ai-zauctovani")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Nepřihlášen", { status: 401 });
        const sb = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
          auth: { persistSession: false },
        });
        const { data: u } = await sb.auth.getUser(token);
        if (!u.user) return new Response("Nepřihlášen", { status: 401 });

        const parsed = Input.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Neplatné údaje", { status: 400 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI není nastavena", { status: 500 });
        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });
        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          system: SYSTEM,
          prompt: `Údaje faktury (JSON):\n${JSON.stringify(parsed.data, null, 2)}`,
          abortSignal: request.signal,
          maxRetries: 0,
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });
        return result.toTextStreamResponse();
      },
    },
  },
});
