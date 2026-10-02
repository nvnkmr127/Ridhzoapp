import { redirect, notFound } from "next/navigation";
import { isSuperAdmin, isSuperAdminVerified } from "@/lib/rbac";
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
  if (!(await isSuperAdminVerified())) {
    const { adminMfaStatusAction } = await import("@/lib/actions/adminMfa");
    const { AdminMfaGate } = await import("@/components/platform/AdminMfaGate");
    return <AdminMfaGate enrolled={(await adminMfaStatusAction()).enrolled} />;
  }

  const { orgId } = await params;
  if (!orgId) notFound();

  const data = await PlatformService.getTenant360(orgId);
  if (!data) notFound();

  return <Tenant360View initialData={data} />;
}
