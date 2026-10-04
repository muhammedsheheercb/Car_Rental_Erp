import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

const directory = await mkdtemp(path.join(tmpdir(), "transfer-invoice-controls-"));
let browser;
try {
  const bundle = path.join(directory, "controls.js");
  await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {TransferForm} from './components/transfer-form';import {InvoiceForm} from './components/invoice-form';
 createRoot(document.getElementById('root')).render(<>
 <section data-test="transfer"><TransferForm rental={{id:'00000000-0000-4000-8000-000000000001',startingKm:1000,maximumKm:200,freeKm:50,rate:100,openKm:false,balance:5000}} transferredAt="2026-10-03T10:00" options={[{id:'00000000-0000-4000-8000-000000000002',name:'Replacement · Toyota · 1234',startingKm:3000,details:{Vehicle:'Replacement','Expected Return (Oman)':'2026-10-05T10:00'}}]}/></section>
 <section data-test="invoice"><InvoiceForm initialBooking="00000000-0000-4000-8000-000000000001" bookings={[{id:'00000000-0000-4000-8000-000000000001',name:'B001 · Customer · 1234',subtotal:10000,deposit:0,advance:5000,received:0,paybacks:0,ledgerBalance:5000,transferBalance:5000,snapshot:{'Booking Number':'B001','Starting KM':1000},canFinalize:true}]}/></section>
 </>);`,
    },
    bundle: true,
    outfile: bundle,
    jsx: "automatic",
    platform: "browser",
    alias: { "@": process.cwd() },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "fixture-actions",
        setup(plugin) {
          plugin.onResolve({ filter: /(transfers|invoices)\/actions$/ }, () => ({
            path: "fixture",
            namespace: "test",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents:
              'export async function transferAction(_s,form){window.fixtureTransfer=Object.fromEntries(form);return {error:"",message:"Transferred fixture"};} export async function invoiceAction(_s,form){window.fixtureInvoice=Object.fromEntries(form);return {error:"",message:"Saved fixture"};}',
            loader: "js",
          }));
        },
      },
    ],
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const cssFiles = await readdir(".next/static/css");
  const css = (
    await Promise.all(
      cssFiles
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFile(`.next/static/css/${f}`, "utf8")),
    )
  ).join("\n");
  await page.route("http://localhost/fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><head><style>${css}</style></head><body><main id="root" class="mx-auto max-w-7xl space-y-6 p-4"></main></body></html>`,
    }),
  );
  await page.goto("http://localhost/fixture");
  await page.addScriptTag({ path: bundle });
  const transfer = page.locator('[data-test="transfer"]');
  const invoice = page.locator('[data-test="invoice"]');
  await transfer.getByRole("button", { name: "Select new transfer vehicle" }).click();
  await transfer.getByRole("button", { name: "Replacement · Toyota · 1234" }).click();
  await expect(transfer.locator('input[name="newStartingKm"]')).toHaveValue("3000");
  await transfer.locator('input[name="endingKm"]').fill("1220");
  await expect(transfer.getByText("Free KM Transfer: 30", { exact: true })).toBeVisible();
  await transfer.locator('input[name="washing"]').fill("1");
  await transfer.locator('input[name="received"]').fill("2");
  await expect(transfer.getByText("New Balance (OMR): 4.000", { exact: true })).toBeVisible();
  await transfer.locator('input[name="received"]').fill("6.001");
  await expect(
    transfer.getByRole("button", { name: "Transfer Vehicle", exact: true }),
  ).toBeDisabled();
  await expect(transfer.getByRole("alert")).toContainText("exceeds");
  await transfer.locator('input[name="received"]').fill("2");
  await transfer.locator('textarea[name="remarks"]').fill("Fixture swap");
  await expect(
    invoice.getByText("Remaining Collectible (OMR): 5.000", { exact: true }),
  ).toBeVisible();
  await invoice.locator('input[name="received"]').fill("5.001");
  await expect(invoice.getByRole("button", { name: "Save Invoice" })).toBeDisabled();
  await invoice.locator('input[name="received"]').fill("5");
  await invoice.locator('select[name="status"]').selectOption("FINALIZED");
  await expect(invoice.getByText("Balance (OMR): 0.000", { exact: true })).toBeVisible();
  assert.equal(await page.locator('input[type="number"]').count(), 0);
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `Fixture overflow at ${width}`,
    );
  }
  await transfer.getByRole("button", { name: "Transfer Vehicle", exact: true }).click();
  await expect(transfer.getByRole("status")).toContainText("Transferred fixture");
  assert.equal(
    (await page.evaluate(() => window.fixtureTransfer)).newVehicleId,
    "00000000-0000-4000-8000-000000000002",
  );
  await invoice.getByRole("button", { name: "Save Invoice" }).click();
  await expect(invoice.getByRole("status")).toContainText("Saved fixture");
  assert.equal((await page.evaluate(() => window.fixtureInvoice)).received, "5");
  assert.deepEqual(errors, []);
  console.log(
    "Transfer/invoice controls passed: autofill, free KM carry, exact payment limits, form submissions, direct typing and 320/768/1280 layouts. No database mutations.",
  );
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
