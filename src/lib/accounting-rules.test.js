import { describe, expect, test } from "bun:test";
import { COMPANY_POSTING_ACCOUNTS, vatPostingAccounts, vatAccountSummary } from "./accounting-rules";

describe("User's company accounts", () => {
  test("receivables use account 311 on Má dáti", () => {
    expect(vatPostingAccounts("issued").counterparty).toBe("311");
    expect(vatPostingAccounts("issued").counterpartyDirection).toBe("MD");
  });
  test("issued invoice revenue uses account 602 on Dal", () => {
    expect(vatPostingAccounts("issued").base).toBe("602");
    expect(vatPostingAccounts("issued").direction).toBe("D");
  });
  test("VAT uses account 343 in both invoice directions", () => {
    expect(COMPANY_POSTING_ACCOUNTS.vat).toBe("343");
    expect(vatPostingAccounts("issued").vat).toBe("343");
    expect(vatPostingAccounts("received").vat).toBe("343");
  });
  test("received invoice expenses use account 518 on Má dáti", () => {
    expect(vatPostingAccounts("received").base).toBe("518");
    expect(vatPostingAccounts("received").direction).toBe("MD");
  });
  test("reports retain account selections from stored invoices", () => {
    expect(vatPostingAccounts("received", { expense_account: "501", vat_account: "343021" })).toMatchObject({ base: "501", vat: "343021" });
    expect(vatAccountSummary("received", [{ expense_account: "518" }, { expense_account: "501" }])).toBe("518 MD / 343 MD, 501 MD / 343 MD");
  });
});