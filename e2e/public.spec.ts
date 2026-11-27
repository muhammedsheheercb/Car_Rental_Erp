import { expect, test } from "@playwright/test";

test.describe("Public routes, security headers, auth gates & responsive layout", () => {
  test("English and Arabic RTL login pages render cleanly without runtime errors", async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/en/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await page.goto("/ar/login");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator('input[name="username"]')).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("serves hardened security headers and suppresses X-Powered-By", async ({ request }) => {
    const res = await request.get("/en/login");
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  test("redirects unauthenticated protected routes to locale-matched login", async ({
    request,
  }) => {
    const enRes = await request.get("/en/dashboard", { maxRedirects: 0 });
    expect(enRes.status()).toBeGreaterThanOrEqual(300);
    expect(enRes.status()).toBeLessThan(400);
    expect(enRes.headers().location).toContain("/en/login");

    const arRes = await request.get("/ar/dashboard", { maxRedirects: 0 });
    expect(arRes.status()).toBeGreaterThanOrEqual(300);
    expect(arRes.status()).toBeLessThan(400);
    expect(arRes.headers().location).toContain("/ar/login");
  });

  test("blocks unauthenticated API endpoints with 401", async ({ request }) => {
    const fakeId = "00000000-0000-4000-8000-000000000001";
    for (const path of [
      "/api/reports/export?report=vehicle-list",
      `/api/vehicle-images/${fakeId}`,
      `/api/customer-documents/${fakeId}`,
      `/api/damage-evidence/${fakeId}`,
      `/api/user-signatures/${fakeId}`,
    ]) {
      const res = await request.get(path);
      expect(res.status(), `Expected 401 on ${path}`).toBe(401);
    }
  });

  test("rejects invalid login credentials safely with generic message", async ({ page }) => {
    await page.goto("/en/login");
    await page.fill('input[name="username"]', "nonexistent_qa_user");
    await page.fill('input[name="password"]', "WrongPassword123!");
    await page.click('button[type="submit"]');
    await expect(page.getByRole("alert")).toContainText("Invalid username or password.");
  });

  test("renders login page cleanly on mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/en/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
