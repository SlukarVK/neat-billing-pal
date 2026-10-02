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

export const DIRECTION_LABELS: Record<string, string> = { MD: "Má dáti", D: "Dal" };

export function accountLabel(acc: string) {
  return ACCOUNT_NAMES[acc] ? `${acc} – ${ACCOUNT_NAMES[acc]}` : acc;
}
