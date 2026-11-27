import { redirect } from "next/navigation";
import { can, getIdentity } from "@/lib/auth";

export default async function LocaleHomePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const [{ locale }, user] = await Promise.all([params, getIdentity()]);
  const loc = locale === "ar" ? "ar" : "en";

  if (!user) redirect(`/${loc}/login`);
  if (user.mustChangePassword) redirect(`/${loc}/change-password`);

  const fallbacks: Array<[string, string]> = [
    ["dashboard", "/dashboard"],
    ["rentals", "/rentals"],
    ["fleet", "/fleet"],
    ["customers", "/customers"],
    ["finance", "/finance/advance"],
    ["reports", "/reports"],
    ["settings", "/settings"],
  ];
  const landing = fallbacks.find(([mod]) => can(user, mod, "read"))?.[1] ?? "/settings";
  redirect(`/${loc}${landing}`);
}
