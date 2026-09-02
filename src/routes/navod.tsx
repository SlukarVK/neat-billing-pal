import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileDown, Mail, PenLine, Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/navod")({
  head: () => ({
    meta: [
      { title: "Návod: jak vystavit fakturu — Accountrix" },
      {
        name: "description",
        content:
          "Krok za krokem: jak v Accountrix vytvořit, upravit a odeslat fakturu, plus přehled všech povinných polí faktury.",
      },
      { property: "og:title", content: "Návod: jak vystavit fakturu — Accountrix" },
      {
        property: "og:description",
        content: "Vytvoření, úprava a odeslání faktury krok za krokem + seznam všech polí.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GuidePage,
});

const STEPS = [
  {
    icon: Plus,
    title: "1. Vytvoření faktury",
    body: [
      "V horní navigaci klikněte na „Nová faktura“.",
      "Údaje dodavatele se automaticky doplní z Nastavení (firma, IČO, DIČ, banka, logo).",
      "Vyplňte klienta – jméno, adresa, IČO/DIČ, telefon, e-mail a zda je plátcem DPH.",
      "Zvolte datum vystavení; splatnost lze nastavit jedním klikem (+7 / +14 / +30 dní) nebo ručně.",
      "Přidejte položky (služba / výrobek / zboží), množství, jednotku, cenu bez DPH a sazbu DPH. Základ, DPH i celková částka se počítají automaticky.",
      "Uložte – faktura se objeví v seznamu Faktury.",
    ],
  },
  {
    icon: PenLine,
    title: "2. Úprava a změna stavu",
    body: [
      "V seznamu Faktury klikněte na číslo faktury a poté na „Upravit“.",
      "Změnit lze cokoliv včetně položek; součty se přepočítají.",
      "Stav faktury: návrh → vystavená → odeslaná → zaplacená (nebo stornovaná).",
      "Rychlá akce ✓ v seznamu označí fakturu jako zaplacenou a uloží datum platby.",
      "Nezaplacené faktury po termínu se automaticky zobrazí jako „Po splatnosti“ v Přehledu i v upozorněních.",
    ],
  },
  {
    icon: Mail,
    title: "3. Odeslání a PDF",
    body: [
      "Na detailu faktury stáhnete PDF tlačítkem „Stáhnout PDF“ (A4, stránkování a číslování stran).",
      "Tlačítko „Odeslat e-mailem“ otevře váš e-mailový klient s předvyplněným textem – PDF přiložte ze složky Stažené.",
      "Vzhled PDF (logo, barva, rozložení, zápatí) změníte v Nastavení.",
      "Tisk přímo z prohlížeče respektuje tiskové styly A4.",
    ],
  },
  {
    icon: FileDown,
    title: "4. Hromadná správa (CSV / Excel)",
    body: [
      "Faktury → „Export CSV“ stáhne seznam ve formátu pro Excel (oddělovač „;“, kódování UTF-8 s BOM).",
      "Faktury → „Import CSV“ nahraje faktury hromadně; podporuje formáty datumů 2026-09-01 i 1. 9. 2026 a čísla s čárkou.",
      "Přehled → „Export Excel“ vytvoří sešit se souhrnem a listem pro každý stav; „Export PDF“ uloží celý přehled.",
    ],
  },
];

const FIELDS: { group: string; rows: [string, string, string][] }[] = [
  {
    group: "Identifikace dokladu",
    rows: [
      ["Číslo faktury", "Povinné", "Jedinečné označení dokladu, např. 2026-0001."],
      ["Variabilní symbol", "Doporučené", "Obvykle číslo faktury bez pomlček – pro spárování platby."],
      ["Stav", "Povinné", "Návrh, vystavená, odeslaná, zaplacená, po splatnosti, stornovaná."],
    ],
  },
  {
    group: "Dodavatel (z Nastavení)",
    rows: [
      ["Název firmy a adresa", "Povinné", "Sídlo dodavatele včetně PSČ a města."],
      ["IČO", "Povinné", "Identifikační číslo osoby."],
      ["DIČ", "U plátců DPH", "Daňové identifikační číslo, např. CZ12345678."],
      ["Bankovní účet / IBAN / SWIFT", "Povinné pro převod", "Kam má klient zaplatit."],
      ["Logo, barva, zápatí", "Volitelné", "Vzhled PDF faktury."],
    ],
  },
  {
    group: "Odběratel",
    rows: [
      ["Jméno / název", "Povinné", "Fyzická nebo právnická osoba."],
      ["Adresa", "Povinné", "Fakturační adresa odběratele."],
      ["IČO / DIČ", "U podnikatelů", "DIČ jen pokud je odběratel plátcem DPH."],
      ["Telefon, e-mail", "Volitelné", "Kontakt pro doručení a dotazy."],
      ["Plátce DPH", "Povinné pole", "Přepínač ovlivňuje vyčíslení DPH."],
    ],
  },
  {
    group: "Datumy",
    rows: [
      ["Datum vystavení", "Povinné", "Den, kdy byl doklad vystaven."],
      ["Datum splatnosti", "Povinné", "Vypočítá se z data vystavení (+7/+14/+30 dní)."],
      ["DUZP", "U plátců DPH", "Datum uskutečnění zdanitelného plnění."],
      ["Datum úhrady", "Po zaplacení", "Doplní se automaticky při označení „zaplaceno“."],
    ],
  },
  {
    group: "Položky a částky",
    rows: [
      ["Popis položky", "Povinné", "Konkrétní služba, výrobek nebo zboží."],
      ["Typ, množství, jednotka", "Povinné", "Např. služba, 10 hod."],
      ["Cena za jednotku bez DPH", "Povinné", "Jednotková cena bez daně."],
      ["Sazba DPH (0 / 12 / 21 %)", "U plátců DPH", "Určuje vyčíslené DPH."],
      ["Základ daně, DPH, celkem", "Automaticky", "Součty se počítají z položek."],
      ["Měna", "Povinné", "CZK nebo EUR."],
    ],
  },
  {
    group: "Ostatní",
    rows: [
      ["Způsob platby", "Povinné", "Převod, hotovost, karta, dobírka."],
      ["Poznámka", "Volitelné", "Např. „Nejsme plátci DPH“ nebo dodací podmínky."],
    ],
  },
];

function GuidePage() {
  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <BookOpen className="h-7 w-7 text-primary" />
            Návod k fakturaci
          </h1>
          <p className="mt-1 text-muted-foreground">
            Jak vytvořit, upravit a odeslat fakturu – a co všechno na ní musí být.
          </p>
        </div>
        <Button asChild className="shadow-pop">
          <Link to="/faktury/nova">
            <Plus className="mr-1.5 h-4 w-4" />
            Vystavit fakturu
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {STEPS.map((s) => (
          <Card key={s.title} className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <s.icon className="h-5 w-5 text-primary" />
                {s.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                {s.body.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="mb-4 mt-10 text-2xl font-bold">Všechna pole faktury</h2>
      <div className="space-y-6">
        {FIELDS.map((g) => (
          <Card key={g.group} className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{g.group}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-64">Pole</TableHead>
                    <TableHead className="w-40">Povinnost</TableHead>
                    <TableHead>Popis</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.rows.map(([name, req, desc]) => (
                    <TableRow key={name}>
                      <TableCell className="font-medium">{name}</TableCell>
                      <TableCell className="text-muted-foreground">{req}</TableCell>
                      <TableCell className="text-muted-foreground">{desc}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
