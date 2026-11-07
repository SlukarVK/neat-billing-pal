import { describe, expect, test } from "bun:test";
import { calendarPeriod, quarterRange, shiftVatPeriod, vatExportName, isValidVatRange } from "./vat-period";

describe("Whole calendar quarters for VAT", () => {
  test("Q1 includes January through March", () => {
    expect(quarterRange(2026, 1)).toEqual({ from: "2026-01-01", to: "2026-03-31" });
  });
  test("Q2 includes April through June", () => {
    expect(quarterRange(2026, 2)).toEqual({ from: "2026-04-01", to: "2026-06-30" });
  });
  test("Q3 includes July through September", () => {
    expect(quarterRange(2026, 3)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });
  test("Q4 includes October through December", () => {
    expect(quarterRange(2026, 4)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
  });
  test("switching August to quarterly includes the entire third quarter", () => {
    expect(calendarPeriod(2026, 8, "quarter")).toMatchObject({ from: "2026-07-01", to: "2026-09-30", quarter: 3 });
  });
  test("previous and next quarter cross the year boundary", () => {
    expect(shiftVatPeriod(calendarPeriod(2026, 1, "quarter"), -1)).toMatchObject({ year: 2025, quarter: 4, from: "2025-10-01", to: "2025-12-31" });
    expect(shiftVatPeriod(calendarPeriod(2026, 12, "quarter"), 1)).toMatchObject({ year: 2027, quarter: 1, from: "2027-01-01", to: "2027-03-31" });
  });
  test("exports identify the selected quarter, not the current month", () => {
    expect(vatExportName(calendarPeriod(2026, 8, "quarter"))).toBe("dph-2026-Q3");
  });
  test("monthly mode retains correct leap February boundaries", () => {
    expect(calendarPeriod(2024, 2)).toMatchObject({ from: "2024-02-01", to: "2024-02-29" });
    expect(calendarPeriod(2026, 2)).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
  });
  test("empty or reversed custom periods cannot be exported", () => {
    expect(isValidVatRange("", "2026-09-30")).toBe(false);
    expect(isValidVatRange("2026-10-01", "2026-09-30")).toBe(false);
    expect(isValidVatRange("2026-07-01", "2026-09-30")).toBe(true);
  });
});