import { createHash, randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import postgres from "postgres";

const baseURL = process.env.BOOKING_CHECK_BASE_URL ?? "http://127.0.0.1:3001";
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
let sessionId;
let browser;
try {
  const [user] =
    await sql`select u.id from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where u.is_active=true and u.must_change_password=false and r.name='SUPER_ADMIN' limit 1`;
  if (!user) throw new Error("No configured super admin is available for the browser check.");
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const [session] =
    await sql`insert into sessions (user_id, token_hash, expires_at, user_agent) values (${user.id}, ${hash}, now()+interval '10 minutes', 'lifecycle-browser-check') returning id`;
  sessionId = session.id;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([
    { name: "muscat_cars_session", value: token, url: baseURL, httpOnly: true, sameSite: "Lax" },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const agreements = await sql`select id, status from rentals order by created_at desc limit 5`;
  for (const agreement of agreements) {
    const response = await page.goto(`${baseURL}/en/rentals/${agreement.id}`, {
      waitUntil: "networkidle",
    });
    if (response.status() !== 200) throw new Error("Agreement details failed to load.");
    await expect(page.getByRole("heading", { name: "Extension history" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cancellation history" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Financial components" })).toBeVisible();
    if (agreement.status === "ACTIVE") {
      await expect(
        page.getByRole("heading", { name: "Current overdue charge estimate" }),
      ).toBeVisible();
      await page.locator('input[name="duration"]').fill("2");
      await expect(page.locator('input[readonly][type="datetime-local"]')).not.toHaveValue("");
    }
    if (["RESERVED", "RETURNED"].includes(agreement.status)) {
      const photo = page.locator('input[type="file"]');
      await photo.nth(1).setInputFiles({
        name: "check.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/ZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
      const transferred = await page
        .locator('input[name="photo"]')
        .evaluate((input) => input.files?.[0]?.size > 0);
      if (!transferred) throw new Error("Photo selection did not populate the evidence form.");
    }
    for (const width of [320, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
        throw new Error(`Agreement page overflow at ${width}px`);
    }
  }
  await page.goto(`${baseURL}/en/fleet/new`, { waitUntil: "networkidle" });
  for (let step = 0; step < 3; step++)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("#lateGraceMinutes")).toHaveValue("60");
  await expect(page.locator("#lateWindowHours")).toHaveValue("4");
  await expect(page.locator("#overdueFineBaisa")).toHaveValue("5000");
  if (await page.locator("input[type=number]").count())
    throw new Error("Unexpected numeric spinners in pricing fields.");
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  console.log(
    `Lifecycle browser check passed for ${agreements.length} existing agreement(s). No agreement or financial mutation submitted.`,
  );
} finally {
  await browser?.close();
  if (sessionId) await sql`delete from sessions where id=${sessionId}`;
  await sql.end();
}
