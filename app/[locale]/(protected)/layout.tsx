import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getIdentity } from "@/lib/auth";
export default async function ProtectedLayout({
  children,
  params,
}: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const [{ locale }, user] = await Promise.all([params, getIdentity()]);
  if (!user) redirect(`/${locale}/login`);
  if (user.mustChangePassword) redirect(`/${locale}/change-password`);
  return <AppShell locale={locale}>{children}</AppShell>;
}
