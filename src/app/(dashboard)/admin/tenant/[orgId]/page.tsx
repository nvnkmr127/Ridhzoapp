import { redirect, notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/rbac";
import { PlatformService } from "@/domains/platform/service";
import { Tenant360View } from "@/components/platform/Tenant360View";

interface TenantPageProps {
  params: Promise<{ orgId: string }>;
}

export const metadata = {
  title: "Tenant 360 Profile | Platform Operations",
  description: "Cross-domain tenant profile, churn diagnostics, and account governance.",
};

export default async function TenantDetailPage({ params }: TenantPageProps) {
  if (!(await isSuperAdmin())) redirect("/leads");

  const { orgId } = await params;
  if (!orgId) notFound();

  const data = await PlatformService.getTenant360(orgId);
  if (!data) notFound();

  return <Tenant360View initialData={data} />;
}
