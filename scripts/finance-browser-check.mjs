import { createHash, randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
let browser;
let sessionId;
try {
  const [user] =
    await sql`select u.id from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where u.is_active=true and u.must_change_password=false and r.name='SUPER_ADMIN' limit 1`;
  if (!user) throw new Error("No configured super admin available for verification.");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const [session] =
    await sql`insert into sessions (user_id,token_hash,expires_at,user_agent) values (${user.id},${hash},now()+interval '10 minutes','finance-browser-check') returning id`;
  sessionId = session.id;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: "muscat_cars_session",
      value: token,
      url: "http://127.0.0.1:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [module, title] of [
    ["advance", "Advance"],
    ["payback", "Payback"],
    ["receipts", "Receipts"],
    ["fine", "Fine"],
    ["legal-fine", "Legal Fine"],
  ]) {
    const response = await page.goto(`http://127.0.0.1:3000/en/finance/${module}`, {
      waitUntil: "networkidle",
    });
    expect(response.status()).toBe(200);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await page.locator('input[name="q"]').fill("NO-SUCH-BOOKING-TEST");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByText("No records found.")).toBeVisible();
    console.log(`${title}: page and search passed`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3000/en/finance/legal-fine", { waitUntil: "networkidle" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  console.log("Mobile layout and client errors passed");
} finally {
  await browser?.close();
  if (sessionId) await sql`delete from sessions where id=${sessionId}`;
  await sql.end();
}
