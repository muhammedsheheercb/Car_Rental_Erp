import { CustomerWizard } from "@/components/customer-wizard";
import { requirePermission } from "@/lib/auth";
export default async function NewCustomerPage() {
  await requirePermission("customers", "create");
  return <CustomerWizard />;
}
