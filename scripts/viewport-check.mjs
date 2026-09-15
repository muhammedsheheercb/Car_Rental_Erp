import { createHash, randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import postgres from "postgres";

const baseURL = "http://127.0.0.1:3000";
const widths = [320, 360, 375, 390, 414, 768];
const protectedPaths = [
  "dashboard",
  "fleet",
  "fleet/master",
  "fleet/new",
  "admin/branches",
  "admin/users",
  "forbidden",
];
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
let sessionId;

try {
  const [user] =
    await sql`select id, must_change_password from users where is_active = true order by created_at limit 1`;
  if (!user) throw new Error("No active user exists for authenticated viewport checks.");
  if (user.must_change_password)
    throw new Error(
      "The available user must complete the initial password change before protected viewport checks can run.",
    );
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [session] =
    await sql`insert into sessions (user_id, token_hash, expires_at, user_agent) values (${user.id}, ${tokenHash}, now() + interval '15 minutes', 'mobile-viewport-audit') returning id`;
  sessionId = session.id;

  const browser = await chromium.launch({ headless: true });
  const failures = [];
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.addCookies([
      { name: "muscat_cars_session", value: token, url: baseURL, httpOnly: true, sameSite: "Lax" },
    ]);
    const page = await context.newPage();
    for (const locale of ["en", "ar"]) {
      for (const route of ["login", "change-password", ...protectedPaths]) {
        const response = await page.goto(`${baseURL}/${locale}/${route}`, {
          waitUntil: "networkidle",
        });
        const metrics = await page.evaluate(() => ({
          viewport: window.innerWidth,
          document: document.documentElement.scrollWidth,
          direction: document.querySelector("[dir]")?.getAttribute("dir"),
        }));
        if (
          !response ||
          response.status() >= 400 ||
          metrics.document > metrics.viewport + 1 ||
          metrics.direction !== (locale === "ar" ? "rtl" : "ltr")
        )
          failures.push({ width, locale, route, status: response?.status(), ...metrics });
      }
    }
    await context.close();
  }
  await browser.close();
  if (failures.length) throw new Error(`Viewport failures:\n${JSON.stringify(failures, null, 2)}`);
  console.log(
    `Viewport audit passed: ${widths.length} widths × 2 locales × ${protectedPaths.length + 2} routes.`,
  );
} finally {
  if (sessionId) await sql`delete from sessions where id = ${sessionId}`;
  await sql.end();
}
