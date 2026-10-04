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
  if (!user) throw new Error("No configured super admin.");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const [session] =
    await sql`insert into sessions(user_id,token_hash,expires_at,user_agent) values(${user.id},${hash},now()+interval '10 minutes','maintenance-browser-check') returning id`;
  sessionId = session.id;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    { name: "muscat_cars_session", value: token, url: base, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const locale of ["en", "ar"]) {
    for (const [route, title] of [
      ["service", "Service"],
      ["near-to-service", "Near To Service"],
      ["expiry", "Expiry"],
      ["settings", "Settings"],
    ]) {
      const response = await page.goto(`${base}/${locale}/${route}`, { waitUntil: "networkidle" });
      expect(response.status()).toBe(200);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      for (const width of [320, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
          `${route} overflow at ${width}`,
        );
      }
      assert.equal(await page.locator('input[type="number"]').count(), 0);
    }
    console.log(`${locale}: service, near-service, expiry and signature settings pages passed`);
  }
  const [rental] = await sql`select id,status from rentals order by created_at desc limit 1`;
  if (rental) {
    const response = await page.goto(`${base}/en/documents/agreement/${rental.id}`, {
      waitUntil: "networkidle",
    });
    expect(response.status()).toBe(200);
    await expect(page.locator(".print-document")).toBeVisible();
    assert.equal(
      await page.locator(".document-signature").count(),
      rental.status === "RETURNED" ? 3 : 2,
    );
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("header")).toBeHidden();
    await expect(page.locator("nav").first()).toBeHidden();
    await expect(page.getByRole("button", { name: "Print A4" })).toBeHidden();
    assert.equal(
      await page.locator("html").evaluate((el) => getComputedStyle(el).colorScheme),
      "light",
    );
    await page.pdf({
      path: "/tmp/real-agreement-a4.pdf",
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    });
    assert.equal(
      await page.locator(".document-brand").evaluate((el) => getComputedStyle(el).color),
      "rgb(24, 57, 83)",
    );
    console.log("Real agreement A4 layout, signature positions and hidden application UI passed.");
  }
  const unauth = await browser.newContext();
  const response = await unauth.request.get(
    `${base}/api/user-signatures/00000000-0000-4000-8000-000000000001`,
  );
  assert.equal(response.status(), 401);
  await unauth.close();
  assert.deepEqual(errors, []);
  console.log(
    "Maintenance pages and private signature access passed. No service, settings or signature records changed.",
  );
} finally {
  await browser?.close();
  if (sessionId) await sql`delete from sessions where id=${sessionId}`;
  await sql.end();
}
