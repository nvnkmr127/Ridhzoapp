import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { SmartSegments } from "@/components/leads/SmartSegments";
import { Users, Plus, Upload, FilterX, Kanban, Flame, Trash2 } from "lucide-react";
import Link from "next/link";
import { LeadService } from "@/domains/leads/service";
import { SavedViewService } from "@/domains/savedViews/service";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { QuickAddLeadDrawer } from "@/components/leads/QuickAddLeadDrawer";
import { LeadImportWizard } from "@/components/leads/LeadImportWizard";
import { LeadsFilterBar } from "@/components/leads/LeadsFilterBar";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { LeadsAutoRefresh } from "@/components/leads/LeadsAutoRefresh";
import { listUsersAction } from "@/lib/actions/users";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { TagService } from "@/domains/tags/service";
import { CustomFieldService } from "@/domains/customFields/service";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const { userId, organizationId } = await requireOrg();
  const isAdmin = await hasPermission("settings.manage");

  const search = typeof params.search === "string" ? params.search : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const ownerId = typeof params.owner === "string" ? params.owner : undefined;
  const sortField = typeof params.sort === "string" ? params.sort : "createdAt";
  const sortOrder = (typeof params.order === "string" && (params.order === "asc" || params.order === "desc"))
    ? params.order
    : "desc";
  const page = typeof params.page === "string" ? parseInt(params.page, 10) || 1 : 1;
  const limit = typeof params.pageSize === "string" ? parseInt(params.pageSize, 10) || 20 : 20;

  let filters: any = undefined;
  if (typeof params.filters === "string") {
    try {
      filters = JSON.parse(params.filters);
    } catch {
      filters = undefined;
    }
  }

  const [views, usersList, sourcesList, tagsList, customFieldDefs, leadResult] = await Promise.all([
    SavedViewService.listViews(organizationId, userId),
    listUsersAction().catch(() => []),
    LeadSourceService.getSources(organizationId).catch(() => []),
    TagService.listAll(organizationId).catch(() => []),
    CustomFieldService.list(organizationId).catch(() => []),
    LeadService.listLeads({
      organizationId,
      search,
      status,
      ownerId,
      filters,
      sortField,
      sortOrder,
      page,
      limit,
      currentUserId: userId,
    }),
  ]);

  const { data: leads, total, totalPages } = leadResult;

  // Never send admin-only custom values to a non-admin's client (they'd otherwise sit in the RSC
  // payload even with the column hidden).
  const adminOnlyKeys = isAdmin ? [] : (customFieldDefs as any[]).filter((f) => f.adminOnly).map((f) => f.key);
  const visibleLeads = adminOnlyKeys.length === 0
    ? leads
    : leads.map((l: any) => {
        if (!l.customData || typeof l.customData !== "object") return l;
        const cd = { ...(l.customData as Record<string, unknown>) };
        for (const k of adminOnlyKeys) delete cd[k];
        return { ...l, customData: cd };
      });

  const hasActiveFilters = Boolean(search || status || ownerId || filters);

  return (
    <div className="flex-1 space-y-4 p-4 pt-4 sm:p-8 sm:pt-6">
      <LeadsAutoRefresh />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Leads</h2>
          <p className="text-sm text-muted-foreground">
            Search, filter, and manage your pipeline leads.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Link href="/leads/hot">
            <Button variant="outline">
              <Flame className="mr-2 h-4 w-4 text-orange-500" /> Hot Leads
            </Button>
          </Link>
          <Link href="/leads/kanban">
            <Button variant="outline">
              <Kanban className="mr-2 h-4 w-4" /> Pipeline Board
            </Button>
          </Link>
          <Link href="/leads/recycle-bin">
            <Button variant="outline">
              <Trash2 className="mr-2 h-4 w-4" /> Recycle Bin
            </Button>
          </Link>
          <LeadImportWizard>
            <Button variant="outline">
              <Upload className="mr-2 h-4 w-4" /> Import Leads
            </Button>
          </LeadImportWizard>
          <QuickAddLeadDrawer organizationId={organizationId}>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Add Lead
            </Button>
          </QuickAddLeadDrawer>
        </div>
      </div>

      <Suspense fallback={null}>
        <SmartSegments />
      </Suspense>

      <LeadsFilterBar
        views={views}
        metadata={{
          users: usersList,
          sources: sourcesList.map((s) => ({ id: s.id, name: s.name })),
          tags: tagsList.map((t) => ({ id: t.id, name: t.name })),
        }}
      />

      {leads.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            icon={<FilterX className="h-10 w-10 text-muted-foreground" />}
            title="No matching leads"
            description="No leads match the current search or filter criteria."
            action={
              <Link href="/leads">
                <Button variant="outline">Clear Filters</Button>
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<Users className="h-10 w-10 text-muted-foreground" />}
            title="No leads found"
            description="Get started by creating a new lead manually or importing from a CSV."
            action={
              <LeadImportWizard>
                <Button variant="outline">
                  <Upload className="mr-2 h-4 w-4" /> Import Leads
                </Button>
              </LeadImportWizard>
            }
          />
        )
      ) : (
        <LeadsTable
          leads={visibleLeads}
          page={page}
          pageSize={limit}
          total={total}
          totalPages={totalPages}
          customColumns={(customFieldDefs as any[])
            .filter((f) => f.showOnTable && !f.disabled && (isAdmin || !f.adminOnly))
            .map((f) => ({ key: f.key, label: f.label }))}
        />
      )}
    </div>
  );
}
