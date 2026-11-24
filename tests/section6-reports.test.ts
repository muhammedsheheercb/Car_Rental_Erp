import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  escapeCsvCell,
  formatPaymentModeLabel,
  formatReportCsvFilename,
  normalizePaymentMode,
  normalizeReportSlug,
  normalizeReportStatus,
  paginateReportRows,
  REPORT_CATALOG,
  REPORT_LIST,
  REPORT_SLUGS,
  REPORTS_PAGE_SIZE,
  serializeReportCsv,
} from "@/features/reports/definitions";
import type { Identity } from "@/lib/auth";

const authFixture = vi.hoisted(() => ({
  identity: null as Identity | null,
}));

vi.mock("@/lib/auth", () => ({
  getIdentity: async () => authFixture.identity,
  can: (identity: Identity, module: string, action: string) =>
    identity.role === "SUPER_ADMIN" || identity.permissions.has(`${module}:${action}`),
}));

vi.mock("@/features/reports/service", () => ({
  loadReport: async () => ({
    definition: REPORT_CATALOG["invoice-list"],
    columns: [
      { key: "invoice", label: "Invoice #" },
      { key: "customer", label: "Customer" },
      { key: "total", label: "Grand Total" },
    ],
    rows: [
      {
        id: "inv-1",
        cells: {
          invoice: { text: "INV-2026-001" },
          customer: { text: "Khalid, Al-Harthy" },
          total: { text: "OMR 195.000" },
        },
      },
    ],
    summary: [],
    totalRows: 1,
    page: 1,
    totalPages: 1,
    pageSize: 15,
    truncated: false,
    branches: [],
    filters: {
      report: "invoice-list",
      q: "",
      branchId: "",
      status: "ALL",
      paymentMode: "ALL",
      from: "",
      to: "",
    },
  }),
}));

import { GET as exportReportGet } from "@/app/api/reports/export/route";

describe("Section 6 — Reports catalog, pagination, CSV export & RBAC", () => {
  beforeEach(() => {
    authFixture.identity = null;
  });

  it("registers all 12 required reports in order with 15-per-page pagination", () => {
    expect(REPORTS_PAGE_SIZE).toBe(15);
    expect(REPORT_SLUGS).toHaveLength(12);
    expect(REPORT_LIST.map((r) => r.title)).toEqual([
      "Vehicle List",
      "Invoice List",
      "Agreement List",
      "Vehicle Income Report",
      "Vehicle Expense Report",
      "Customer List",
      "Receipt List",
      "Payment List",
      "Daily Activity Report",
      "Service Report",
      "Advance Collection Report",
      "Blacklist Register",
    ]);
    for (let i = 0; i < REPORT_LIST.length; i++) {
      expect(REPORT_LIST[i].number).toBe(i + 1);
      expect(REPORT_LIST[i].supportsBranch).toBe(true);
      expect(REPORT_LIST[i].supportsDateRange).toBe(true);
    }
  });

  it("normalizes report slugs, per-report statuses, and payment modes safely", () => {
    expect(normalizeReportSlug("vehicle-income")).toBe("vehicle-income");
    expect(normalizeReportSlug("BLACKLIST-REGISTER")).toBe("blacklist-register");
    expect(normalizeReportSlug("nonexistent")).toBe("vehicle-list");
    expect(normalizeReportSlug(undefined)).toBe("vehicle-list");

    expect(normalizeReportStatus("invoice-list", "finalized")).toBe("FINALIZED");
    expect(normalizeReportStatus("invoice-list", "AVAILABLE")).toBe("ALL");
    expect(normalizeReportStatus("receipt-list", "ACTIVE")).toBe("ALL");
    expect(normalizeReportStatus("payment-list", "payback")).toBe("PAYBACK");
    expect(normalizeReportStatus("blacklist-register", "removed")).toBe("REMOVED");
    expect(normalizeReportStatus("daily-activity", "finance")).toBe("FINANCE");

    expect(normalizePaymentMode("bank_transfer")).toBe("BANK_TRANSFER");
    expect(normalizePaymentMode("crypto")).toBe("ALL");
    expect(formatPaymentModeLabel("BANK_TRANSFER")).toBe("Bank Transfer");
    expect(formatPaymentModeLabel(null)).toBe("—");
  });

  it("paginates report rows at 15 per page and clamps invalid pages", () => {
    const items = Array.from({ length: 34 }, (_, idx) => ({ id: idx + 1 }));
    const p1 = paginateReportRows(items, 1);
    expect(p1.totalRows).toBe(34);
    expect(p1.totalPages).toBe(3);
    expect(p1.page).toBe(1);
    expect(p1.pageRows).toHaveLength(15);
    expect(p1.pageRows[0].id).toBe(1);

    const p2 = paginateReportRows(items, 2);
    expect(p2.page).toBe(2);
    expect(p2.pageRows).toHaveLength(15);
    expect(p2.pageRows[0].id).toBe(16);

    const pLast = paginateReportRows(items, 99);
    expect(pLast.page).toBe(3);
    expect(pLast.pageRows).toHaveLength(4);
    expect(pLast.pageRows[0].id).toBe(31);

    const pZero = paginateReportRows(items, -2);
    expect(pZero.page).toBe(1);
  });

  it("serializes RFC 4180 CSV with UTF-8 BOM and neutralizes formula injection", () => {
    expect(escapeCsvCell("=CMD|' /C calc'!A0")).toBe("'=CMD|' /C calc'!A0");
    expect(escapeCsvCell("+1+1")).toBe("'+1+1");
    expect(escapeCsvCell("@SUM(A1:A5)")).toBe("'@SUM(A1:A5)");
    expect(escapeCsvCell("-cmd")).toBe("'-cmd");
    // Pure negative decimal numbers remain numeric-safe
    expect(escapeCsvCell("-10.500")).toBe("-10.500");
    expect(escapeCsvCell('Al-Harthy, "VIP"')).toBe('"Al-Harthy, ""VIP"""');

    const csv = serializeReportCsv(
      [
        { key: "name", label: "Customer" },
        { key: "note", label: "Remarks" },
      ],
      [
        {
          id: "1",
          cells: {
            name: { text: "Khalid", csvValue: "Khalid Al-Harthy (CU-001)" },
            note: { text: '=HYPERLINK("http://evil")' },
          },
        },
      ],
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Customer,Remarks\r\n");
    expect(csv).toContain('Khalid Al-Harthy (CU-001),"\'=HYPERLINK(""http://evil"")"\r\n');
  });

  it("formats Oman-dated CSV export filenames", () => {
    // 2026-11-24T21:30:00Z is 2026-11-25 01:30 in Oman (UTC+04:00)
    const utcLate = new Date("2026-11-24T21:30:00.000Z");
    expect(formatReportCsvFilename("vehicle-income", utcLate)).toBe(
      "muscat-cars-vehicle-income-2026-11-25.csv",
    );
  });

  it("enforces authentication and reports:read + reports:export permissions on CSV export API", async () => {
    const req = () => new Request("http://localhost:3000/api/reports/export?report=invoice-list");

    // 1. Unauthenticated -> 401
    const unauth = await exportReportGet(req());
    expect(unauth.status).toBe(401);

    // 2. reports:read only (no reports:export) -> 403
    authFixture.identity = {
      id: "u1",
      username: "viewer",
      displayName: "Viewer",
      role: "USER",
      branchIds: [],
      permissions: new Set(["reports:read"]),
      mustChangePassword: false,
    };
    expect((await exportReportGet(req())).status).toBe(403);

    // 3. reports:export only (no reports:read) -> 403
    authFixture.identity = {
      id: "u2",
      username: "exporter",
      displayName: "Exporter",
      role: "USER",
      branchIds: [],
      permissions: new Set(["reports:export"]),
      mustChangePassword: false,
    };
    expect((await exportReportGet(req())).status).toBe(403);

    // 4. Both reports:read and reports:export -> 200 with CSV attachment headers
    authFixture.identity = {
      id: "u3",
      username: "auditor",
      displayName: "Auditor",
      role: "USER",
      branchIds: [],
      permissions: new Set(["reports:read", "reports:export"]),
      mustChangePassword: false,
    };
    const ok = await exportReportGet(req());
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(ok.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="muscat-cars-invoice-list-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(ok.headers.get("Cache-Control")).toBe("private, no-store");
    const body = await ok.text();
    expect(body).toContain("INV-2026-001");
    expect(body).toContain('"Khalid, Al-Harthy"');
  });
});
