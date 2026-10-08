import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const ACCOUNT_NAMES: Record<string, string> = {
  "211": "Pokladna",
  "221": "Bankovní účty",
  "311": "Odběratelé",
  "321": "Dodavatelé",
  "343": "DPH",
  "501": "Spotřeba materiálu",
  "518": "Ostatní služby",
  "601": "Tržby za vlastní výrobky",
  "602": "Tržby z prodeje služeb",
  "604": "Tržby za zboží",
};

export const ACCOUNT_CATEGORIES: Record<string, string> = {
  penize: "Peníze (pokladna, banka)",
  pohledavky: "Pohledávky",
  zavazky: "Závazky",
  dane: "Daně (DPH)",
  naklady: "Náklady",
  vynosy: "Výnosy (tržby)",
  ostatni: "Ostatní",
};

export const DIRECTION_LABELS: Record<string, string> = { MD: "Má dáti", D: "Dal" };

/** Names of the user's own accounts, merged over the built-in defaults. */
let custom: Record<string, string> = {};

export async function fetchCompanyAccounts() {
  const { data, error } = await supabase.from("company_accounts").select("*").order("account");
  if (error) throw error;
  custom = Object.fromEntries((data ?? []).map((a) => [a.account, a.name]));
  return data ?? [];
}

export function useCompanyAccounts() {
  return useQuery({ queryKey: ["company-accounts"], queryFn: fetchCompanyAccounts });
}

export function useAccountNames(): Record<string, string> {
  const { data } = useCompanyAccounts();
  return { ...ACCOUNT_NAMES, ...Object.fromEntries((data ?? []).map((a) => [a.account, a.name])) };
}

export function accountLabel(acc: string) {
  const name = custom[acc] ?? ACCOUNT_NAMES[acc];
  return name ? `${acc} – ${name}` : acc;
}
