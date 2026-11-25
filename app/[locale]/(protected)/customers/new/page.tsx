import { CustomerWizard } from "@/components/customer-wizard";
import { requirePagePermission } from "@/lib/auth";
import { sanitizeReturnTo } from "@/lib/validation";

export default async function NewCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  await requirePagePermission(locale, "customers", "create");
  return <CustomerWizard locale={locale} returnTo={sanitizeReturnTo(query.returnTo)} />;
}
