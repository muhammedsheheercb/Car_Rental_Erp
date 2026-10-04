import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

const directory = await mkdtemp(path.join(tmpdir(), "maintenance-controls-"));
let browser;
try {
  const bundle = path.join(directory, "controls.js");
  await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
 import React from 'react';import {createRoot} from 'react-dom/client';import {ServiceForm} from './components/service-form';import {SignatureForm,AlertSettingsForm} from './components/settings-forms';import {PrintDocument} from './components/print-document';
 const id='00000000-0000-4000-8000-000000000001';const receiver='00000000-0000-4000-8000-000000000002';
 const d={title:'Rental Agreement',number:'B001',status:'ACTIVE',branch:'Main Branch',location:'Muscat, Oman',issuedAt:'2026-10-01 10:00',fields:[['Booking Number','B001'],['Customer Name','Fixture Customer'],['Mobile','99999999'],['Address','Muscat'],['Vehicle / Brand','V1 / Toyota'],['Registration Number','1234'],['Booking Date / Time','2026-10-01 10:00'],['Expected Return','2026-10-03 10:00'],['Rental Type','DAILY'],['Starting KM','1000'],['Ending KM','—'],['KM Maximum / Free KM','200 / 50']],charges:[{id:'rent',label:'Rental Charge',amount:'20.000'}],totals:[['Grand Total','20.000'],['Advance','5.000'],['Balance','15.000']],remarks:'Fixture only. Confirm the vehicle details and reading.',preparedBy:'Fixture Staff',printedBy:'Fixture Staff',printedAt:'2026-10-03 09:00',returned:false,signatures:[{label:'Customer Signature',name:'Fixture Customer',src:null},{label:'Authorized Staff Signature',name:'Fixture Staff',src:null}]};
 createRoot(document.getElementById('root')).render(<>
 <div data-test="controls"><section data-test="service"><ServiceForm actorId={id} now="2026-10-03T10:00" vehicles={[{id,name:'V1',brand:'Toyota',registration:'1234',branch:'Main',km:1000,staff:[{id,name:'Staff'}],bookings:[{id:receiver,name:'B001 · Customer',customer:'Customer',out:'2026-10-01T10:00'}]}]}/></section>
 <section data-test="signature"><SignatureForm initialUser={id} users={[{id,name:'Staff'},{id:receiver,name:'Other Staff'}]} existing={[]}/></section><section data-test="alerts"><AlertSettingsForm nearServiceKm={1000} expirySoonDays={30}/></section></div>
 <section data-test="before"><PrintDocument document={d}/></section><section data-test="after"><PrintDocument document={{...d,status:'RETURNED',returned:true,signatures:[d.signatures[0],{label:'Return Received By',name:'Return Staff',src:null},d.signatures[1]]}}/></section>
 </>);`,
    },
    bundle: true,
    platform: "browser",
    outfile: bundle,
    jsx: "automatic",
    alias: { "@": process.cwd() },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "fixture-actions",
        setup(plugin) {
          plugin.onResolve({ filter: /(service|settings)\/actions$/ }, () => ({
            path: "fixture",
            namespace: "test",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            contents:
              'export async function serviceAction(_s,form){window.fixtureService=Object.fromEntries(form);return {error:"",message:"Saved service fixture"};}export async function settingsAction(_s,form){window.fixtureSettings=Object.fromEntries(form);return {error:"",message:"Saved settings fixture"};}',
            loader: "js",
          }));
        },
      },
    ],
  });
  const cssFiles = await readdir(".next/static/css");
  const css = (
    await Promise.all(
      cssFiles
        .filter((f) => f.endsWith(".css"))
        .map((f) => readFile(`.next/static/css/${f}`, "utf8")),
    )
  ).join("\n");
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("http://localhost/fixture", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html><head><style>${css}</style></head><body><div data-app-shell><header>APPLICATION NAVIGATION</header><nav>APP MENU</nav><main id="root" class="space-y-6 p-4"></main></div></body></html>`,
    }),
  );
  await page.goto("http://localhost/fixture");
  await page.addScriptTag({ path: bundle });
  const service = page.locator('[data-test="service"]');
  await service.getByRole("button", { name: "Select vehicle name / registration" }).click();
  await service.getByRole("button", { name: "V1", exact: true }).click();
  await expect(service.getByText("Customer Name: Customer", { exact: false })).toBeVisible();
  await expect(service.locator('input[name="kmReading"]')).toHaveValue("1000");
  await service.locator('select[name="serviceBy"]').selectOption("CUSTOMER");
  await expect(service.locator('select[name="status"] option')).toHaveCount(1);
  await service.locator('input[name="cost"]').fill("10.005");
  await service.locator('textarea[name="remarks"]').fill("Fixture customer service");
  await service.getByRole("button", { name: "Save Service" }).click();
  await expect(service.getByRole("status")).toContainText("Saved service");
  assert.equal(
    (await page.evaluate(() => window.fixtureService)).rentalId,
    "00000000-0000-4000-8000-000000000002",
  );
  const signature = page.locator('[data-test="signature"]');
  await expect(signature.locator('input[capture="environment"]')).toHaveCount(1);
  await expect(signature.getByRole("button", { name: "Save Signature" })).toBeDisabled();
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/ZkAAAAASUVORK5CYII=",
    "base64",
  );
  await signature
    .locator('input[type="file"]')
    .nth(1)
    .setInputFiles({ name: "signature.png", mimeType: "image/png", buffer: png });
  await expect(signature.getByRole("img", { name: "Signature preview" })).toBeVisible();
  await expect(signature.getByRole("button", { name: "Save Signature" })).toBeEnabled();
  assert.equal(
    await signature.evaluate((el) => new FormData(el.querySelector("form")).get("signature").name),
    "signature.png",
  );
  await signature.getByRole("button", { name: "Save Signature" }).click();
  await expect(signature.getByRole("status")).toContainText("Saved settings");
  await signature
    .locator('select[name="userId"]')
    .selectOption("00000000-0000-4000-8000-000000000002");
  await expect(signature.getByRole("button", { name: "Save Signature" })).toBeDisabled();
  const alerts = page.locator('[data-test="alerts"]');
  await alerts.locator('input[name="nearServiceKm"]').fill("500");
  await alerts.locator('input[name="expirySoonDays"]').fill("45");
  await alerts.getByRole("button", { name: "Save Thresholds" }).click();
  await expect(alerts.getByRole("status")).toContainText("Saved settings");
  assert.equal(await page.locator('input[type="number"]').count(), 0);
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      `Layout overflow at ${width}`,
    );
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header")).toBeHidden();
  await expect(page.locator("nav")).toBeHidden();
  await expect(page.locator(".document-controls").first()).toBeHidden();
  await page.addStyleTag({
    content: '[data-test="controls"] {display:none} #root > section {margin:0}',
  });
  for (const phase of ["before", "after"]) {
    await page.addStyleTag({
      content: `[data-test="${phase === "before" ? "after" : "before"}"] {display:none}`,
    });
    const doc = page.locator(`[data-test="${phase}"] .print-document`);
    assert.equal(await doc.locator(".document-signature").count(), phase === "before" ? 2 : 3);
    await page.pdf({
      path: `/tmp/agreement-${phase}-return-a4.pdf`,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    });
    await doc.screenshot({ path: `/tmp/agreement-${phase}-return-a4.png` });
    if (phase === "before")
      await page.addStyleTag({ content: '[data-test="after"] {display:block}' });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Service/signature/threshold controls and A4 fixtures passed: direct typing, captured/uploaded file submission, two/three signature positions, hidden application UI and mobile layouts. PDFs saved under /tmp.",
  );
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
