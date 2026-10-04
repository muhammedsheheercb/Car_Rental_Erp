import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import postgres from "postgres";

const base = process.env.BOOKING_CHECK_BASE_URL ?? "http://127.0.0.1:3001";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
let browser;
let sessionId;
try {
  const [user] =
    await sql`select u.id from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where u.is_active=true and u.must_change_password=false and r.name='SUPER_ADMIN' limit 1`;
  if (!user) throw new Error("No configured admin.");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const [session] =
    await sql`insert into sessions(user_id,token_hash,expires_at,user_agent) values(${user.id},${hash},now()+interval '10 minutes','transfer-invoice-browser-check') returning id`;
  sessionId = session.id;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    { name: "muscat_cars_session", value: token, url: base, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const locale of ["en", "ar"])
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [route, title] of [
        ["transfers", "Vehicle Transfer"],
        ["invoices", "Invoices"],
        ["invoices?new=1", "Invoices"],
      ]) {
        const response = await page.goto(`${base}/${locale}/${route}`, {
          waitUntil: "networkidle",
        });
        expect(response.status()).toBe(200);
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
          `${route} overflow at ${width}`,
        );
      }
    }
  await page.goto(`${base}/en/invoices`);
  await page.locator('input[name="q"]').fill("NO-SUCH-INVOICE-TEST");
  await page.getByRole("button", { name: "Search / Filter" }).click();
  await expect(page.getByText("No invoices found.", { exact: true })).toBeVisible();
  const [active] = await sql`select id from rentals where status='ACTIVE' limit 1`;
  if (active) {
    for (const route of [`transfers?booking=${active.id}`, `invoices?booking=${active.id}`]) {
      const response = await page.goto(`${base}/en/${route}`, { waitUntil: "networkidle" });
      expect(response.status()).toBe(200);
      await expect(page.locator(`input[name="rentalId"]`)).toHaveValue(active.id);
      assert.equal(await page.locator('input[type="number"]').count(), 0);
    }
    console.log("Existing active booking autofill passed for transfer and invoice; no submission.");
  }
  const [count] = await sql`select count(*)::integer as n from rentals`;
  console.log(
    `Live pages, search, English/Arabic, 320/768/1280 layouts passed. Existing rentals: ${count.n}.`,
  );
  const columns =
    await sql`select table_name,column_name,data_type,numeric_scale from information_schema.columns where table_schema='public' and column_name like '%baisa'`;
  assert(columns.length > 0);
  assert(columns.every((c) => c.data_type === "numeric" && c.numeric_scale === 0));
  console.log(`Verified ${columns.length} monetary columns store exact NUMERIC baisa.`);
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  if (sessionId) await sql`delete from sessions where id=${sessionId}`;
  await sql.end();
}
