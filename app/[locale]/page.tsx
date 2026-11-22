import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/auth";

export default async function LocaleHomePage({
  params,
}: Readonly<{ params: Promise<{ locale: string }> }>) {
  const [{ locale }, user] = await Promise.all([params, getIdentity()]);

  if (!user) redirect(`/${locale}/login`);
  redirect(user.mustChangePassword ? `/${locale}/change-password` : `/${locale}/dashboard`);
}
