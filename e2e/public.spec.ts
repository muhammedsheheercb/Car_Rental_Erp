import { expect, test } from "@playwright/test";

test("login page is available", async ({ page }) => {
  await page.goto("/en/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
