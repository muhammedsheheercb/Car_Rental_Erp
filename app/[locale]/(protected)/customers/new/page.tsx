import { CustomerWizard } from "@/components/customer-wizard";
import { requirePermission } from "@/lib/auth";
import { sanitizeReturnTo } from "@/lib/validation";

export default async function NewCustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  await requirePermission("customers", "create");
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <CustomerWizard locale={locale} returnTo={sanitizeReturnTo(query.returnTo)} />;
}
