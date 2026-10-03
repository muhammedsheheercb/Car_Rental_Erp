import { createHash, randomBytes } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import postgres from "postgres";

const baseURL = process.env.BOOKING_CHECK_BASE_URL ?? "http://127.0.0.1:3000";
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
let sessionId;
let browser;
try {
  const [user] =
    await sql`select u.id from users u join user_roles ur on ur.user_id=u.id join roles r on r.id=ur.role_id where u.is_active=true and u.must_change_password=false and r.name='SUPER_ADMIN' limit 1`;
  if (!user)
    throw new Error(
      "No super admin with completed password setup is available for browser verification.",
    );
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const [session] =
    await sql`insert into sessions (user_id, token_hash, expires_at, user_agent) values (${user.id}, ${hash}, now()+interval '10 minutes', 'booking-browser-check') returning id`;
  sessionId = session.id;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([
    {
      name: "muscat_cars_session",
      value: token,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${baseURL}/en/rentals`, {
    waitUntil: "networkidle",
  });
  if (response.status() !== 200 || !(await page.locator("form input[name=rentDuration]").count()))
    throw new Error("Booking form did not load.");
  if (await page.locator("form input[type=number]").count())
    throw new Error("Numeric spinner found in booking form.");
  if (errors.length) throw new Error(`Browser errors before interaction: ${errors.join("; ")}`);
  const pickup = page.locator("input[name=startsAt]");
  await pickup.fill("2030-08-22T14:30");
  await page.locator("input[name=rentDuration]").fill("2");
  const expected = page.locator("input[readonly][type=datetime-local]");
  for (const [period, value] of [
    ["DAILY", "2030-08-24T14:30"],
    ["WEEKLY", "2030-09-05T14:30"],
    ["MONTHLY", "2030-10-22T14:30"],
  ]) {
    await page.locator("select[name=pricingPeriod]").selectOption(period);
    await expected.waitFor();
    await expect(expected).toHaveValue(value);
  }
  await page.locator("input[name=freeKm]").fill("50");
  await page.locator("input[name=depositBaisa]").fill("10000");
  await page.locator("input[name=downPaymentBaisa]").fill("1000");
  if ((await page.locator("input[name=depositBaisa]").inputValue()) !== "10000")
    throw new Error("Deposit typing failed");
  await page.locator("input[name=openKm]").check();
  if (!(await page.getByText(/Included KM: Unlimited/).count()))
    throw new Error("Open KM summary failed");
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    if (overflow) {
      const elements = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .map((el) => ({
            tag: el.tagName,
            cls: el.className,
            left: el.getBoundingClientRect().left,
            right: el.getBoundingClientRect().right,
            width: el.getBoundingClientRect().width,
          }))
          .filter((el) => el.right > window.innerWidth + 1)
          .slice(0, 20),
      );
      throw new Error(`Booking page overflows at ${width}px: ${JSON.stringify(elements)}`);
    }
  }
  for (const route of [
    "en/fleet?filter=available",
    "en/fleet?filter=unavailable",
    "en/dashboard",
  ]) {
    const result = await page.goto(`${baseURL}/${route}`, { waitUntil: "networkidle" });
    if (result.status() !== 200) throw new Error(`Availability route failed: ${route}`);
  }
  for (const locale of ["en", "ar"]) {
    for (const [view, title] of [
      ["today-reserve", "Today Reserve"],
      ["today-arrival", "Today Arrival"],
      ["on-rent", "On Rent"],
      ["available", "Available Vehicles"],
      ["late-car", "Late Car"],
    ]) {
      const response = await page.goto(`${baseURL}/${locale}/operations/${view}`, {
        waitUntil: "networkidle",
      });
      if (response.status() !== 200) throw new Error(`Operations route failed: ${view}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      for (const width of [320, 768, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))
          throw new Error(`Operations overflow: ${locale}/${view} at ${width}px`);
      }
    }
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  console.log(
    "Booking browser check passed: Oman return dates for all periods, direct numeric typing, Open KM, and 4 viewport widths. All five operations views passed in both locales at 3 viewport widths. No booking submitted.",
  );
} finally {
  await browser?.close();
  if (sessionId) await sql`delete from sessions where id=${sessionId}`;
  await sql.end();
}
