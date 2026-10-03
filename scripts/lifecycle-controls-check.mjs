import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, expect } from "@playwright/test";
import { build } from "esbuild";

const directory = await mkdtemp(path.join(tmpdir(), "rental-controls-"));
const bundle = path.join(directory, "controls.js");
let browser;
try {
  await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: "tsx",
      contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { RentalLifecycleForms } from './components/rental-lifecycle-forms';
      const props = { id: '00000000-0000-4000-8000-000000000001', expectedReturnAt: '2026-08-23T06:00:00Z', period: 'DAILY', rate: 20000, startingKm: 1000, canUpdate: true, canApprove: true, canCancel: true, cancellationDetails: { 'Booking Number': 'Fixture agreement', 'Out Date': '22/08/2026', 'Out Time': '10:00', 'Vehicle Name': 'Fixture car', Model: 'Fixture model', 'Registration Number': 'Fixture registration', 'Customer Name': 'Fixture customer', Mobile: 'Fixture mobile', Address: 'Fixture address' }, initialNow: '2026-08-23T06:00:00Z' };
      createRoot(document.getElementById('root')).render(<>
        <div data-test="active"><RentalLifecycleForms {...props} status="ACTIVE" /></div>
        <div data-test="reserved"><RentalLifecycleForms {...props} status="RESERVED" canCancel={false} /></div>
        <div data-test="returned"><RentalLifecycleForms {...props} status="RETURNED" /></div>
      </>);
    `,
    },
    bundle: true,
    outfile: bundle,
    jsx: "automatic",
    platform: "browser",
    alias: { "@": process.cwd() },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "mock-lifecycle-actions",
        setup(plugin) {
          plugin.onResolve({ filter: /lifecycle-actions$/ }, () => ({
            path: "test-action",
            namespace: "fixture",
          }));
          plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents:
              'export async function rentalLifecycleAction() { return { error: "", message: "Fixture only: no server mutation" }; }',
            loader: "js",
          }));
        },
      },
    ],
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ path: bundle });
  const active = page.locator('[data-test="active"]');
  await active.locator('input[name="duration"]').fill("2");
  await expect(active.locator('input[readonly][type="datetime-local"]')).toHaveValue(
    "2026-08-25T10:00",
  );
  await expect(active.getByText("Additional rent: 40.000 OMR")).toBeVisible();
  await expect(
    page
      .locator('[data-test="reserved"]')
      .getByRole("button", { name: "Cancel agreement", exact: true }),
  ).toBeDisabled();
  assert.equal(await page.locator('input[type="number"]').count(), 0);
  const cancellation = active
    .locator("form")
    .filter({ has: page.locator('input[value="cancel"]') });
  for (const label of [
    "Booking Number",
    "Out Date",
    "Out Time",
    "Vehicle Name",
    "Model",
    "Registration Number",
    "Customer Name",
    "Mobile",
    "Address",
  ])
    await expect(cancellation.getByLabel(label, { exact: true })).toHaveAttribute("readonly", "");
  for (const [status, phase] of [
    ["reserved", "BEFORE_RENTAL"],
    ["returned", "AFTER_RETURN"],
  ]) {
    const scope = page.locator(`[data-test="${status}"]`);
    await expect(scope.locator('input[name="phase"]')).toHaveValue(phase);
    const save = scope.getByRole("button", { name: "Save scratch / damage evidence", exact: true });
    await expect(save).toBeDisabled();
    await scope
      .locator('input[type="file"]')
      .nth(1)
      .setInputFiles({
        name: "evidence.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/ZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await expect(save).toBeEnabled();
    const postedFile = await scope.locator('input[name="photo"]').evaluate((input) => {
      const photo = new FormData(input.form).get("photo");
      return { name: photo.name, size: photo.size, type: photo.type };
    });
    assert.equal(postedFile.name, "evidence.png");
    assert.ok(postedFile.size > 0);
    assert.equal(postedFile.type, "image/png");
    assert.equal(await scope.locator('input[capture="environment"]').count(), 1);
  }
  assert.deepEqual(errors, []);
  console.log(
    "Agreement controls passed with fixture data: extension deadline/rent, cancellation cutoff button, direct numeric typing, camera capture, and separate before/after photo submission. Server mutations were mocked.",
  );
} finally {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
}
