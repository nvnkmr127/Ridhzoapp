"use client";
import { useToast } from "@/hooks/use-toast";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, SlidersHorizontal, X, Bookmark, ArrowUpDown } from "lucide-react";
import { FIELD_OPTIONS, STATUS_GROUP_LABELS, FilterBuilderModal, MetadataOptions } from "./FilterBuilderModal";
import { SaveViewDialog } from "./SaveViewDialog";
import { deleteSavedViewAction, updateSavedViewAction } from "@/lib/actions/savedViews";
import { SavedViewData } from "@/domains/savedViews/service";
import { FilterGroup, FilterRule } from "@/domains/savedViews/service";

export function LeadsFilterBar({
  views,
  metadata,
}: {
  views: SavedViewData[];
  metadata: MetadataOptions;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read current URL params
  const defaultViewId = views[0]?.id || "preset-all";
  const currentSearch = searchParams.get("search") || "";
  const currentSort = searchParams.get("sort") || "createdAt";
  const currentOrder = (searchParams.get("order") as "asc" | "desc") || "desc";
  const currentViewId = searchParams.get("viewId") || defaultViewId;
  const { toast } = useToast();
  const rawFiltersParam = searchParams.get("filters");

  const [term, setTerm] = React.useState(currentSearch);
  const [filterModalOpen, setFilterModalOpen] = React.useState(false);
  const [saveModalOpen, setSaveModalOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sync search term from props
  React.useEffect(() => {
    setTerm(currentSearch);
  }, [currentSearch]);

  // Parse active filter rules
  const activeFilterGroup: FilterGroup = React.useMemo(() => {
    if (rawFiltersParam) {
      try {
        const parsed = JSON.parse(rawFiltersParam);
        if (Array.isArray(parsed)) {
          return { logic: "AND", rules: parsed };
        }
        return parsed;
      } catch {
        // Fallback
      }
    }
    // Check shortcuts
    const rules: FilterRule[] = [];
    const status = searchParams.get("status");
    const owner = searchParams.get("owner");
    if (status) rules.push({ field: "status", operator: "equals", value: status });
    if (owner) rules.push({ field: "ownerId", operator: "equals", value: owner });
    return { logic: "AND", rules };
  }, [rawFiltersParam, searchParams]);

  function applyParams(next: Record<string, string | null | undefined>) {
    const p = new URLSearchParams(searchParams.toString());
    p.set("page", "1"); // Reset to page 1 on filter/search change

    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined || v === "") {
        p.delete(k);
      } else {
        p.set(k, v);
      }
    }
    router.replace(`/leads?${p.toString()}`);
  }

  function handleSearch(value: string) {
    setTerm(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      applyParams({ search: value || null });
    }, 300);
  }

  function handleSelectView(view: SavedViewData) {
    const p = new URLSearchParams();
    p.set("viewId", view.id);
    p.set("sort", view.sortField || "createdAt");
    p.set("order", view.sortOrder || "desc");

    if (view.filters) {
      p.set("filters", JSON.stringify(view.filters));
    }
    router.replace(`/leads?${p.toString()}`);
  }

  function handleApplyFilters(group: FilterGroup) {
    if (!group.rules || group.rules.length === 0) {
      applyParams({ filters: null, status: null, owner: null, viewId: null });
    } else {
      applyParams({ filters: JSON.stringify(group), status: null, owner: null, viewId: null });
    }
  }

  function removeSingleRule(index: number) {
    const newRules = activeFilterGroup.rules.filter((_, i) => i !== index);
    if (newRules.length === 0) {
      applyParams({ filters: null, status: null, owner: null, viewId: null });
    } else {
      const newGroup = { ...activeFilterGroup, rules: newRules };
      applyParams({ filters: JSON.stringify(newGroup), status: null, owner: null, viewId: null });
    }
  }

  function clearAllFilters() {
    setTerm("");
    applyParams({
      search: null,
      filters: null,
      status: null,
      owner: null,
      viewId: defaultViewId,
      page: "1",
    });
  }

  const activeCount = activeFilterGroup.rules.length;

  return (
    <div className="space-y-3">
      {/* Saved Views Pills / Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <span className="text-xs font-semibold uppercase text-muted-foreground shrink-0 mr-1 flex items-center gap-1">
          <Bookmark className="h-3.5 w-3.5" /> Views:
        </span>
        {views.map((v) => {
          const isActive = currentViewId === v.id;
          return (
            <div
              key={v.id}
              className={`flex items-center rounded-full shrink-0 ${isActive ? "bg-secondary" : "bg-card border"}`}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-7 text-xs rounded-full ${isActive ? "text-foreground" : "text-muted-foreground"} ${isActive ? "pr-1" : ""}`}
                onClick={() => handleSelectView(v)}
              >
                {v.name}
              </Button>
              {isActive && !isBuiltInView(v) && (
                <button
                  type="button"
                  aria-label={`Delete view ${v.name}`}
                  className="mr-1.5 rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    if (!confirm(`Delete saved view "${v.name}"?`)) return;
                    try {
                      const res = await deleteSavedViewAction(v.id);
                      if (res && "ok" in res && !res.ok) {
                        toast({ variant: "destructive", title: "View not deleted", description: res.message });
                        return;
                      }
                      applyParams({ viewId: null, filters: null });
                      router.refresh();
                    } catch {
                      toast({ variant: "destructive", title: "View not deleted", description: "We couldn't reach the server. Please try again." });
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Main Search and Filter Action Row */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-xl">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, phone, email, or company..."
              value={term}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-8 bg-card"
            />
          </div>

          <Button
            type="button"
            variant={activeCount > 0 ? "default" : "outline"}
            className="shrink-0 gap-2"
            onClick={() => setFilterModalOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filter</span>
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1 rounded-full px-1.5 py-0.2 text-xs">
                {activeCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={currentSort}
            onValueChange={(sort) => applyParams({ sort })}
          >
            <SelectTrigger className="w-40 bg-card text-xs">
              <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Created Date</SelectItem>
              <SelectItem value="updatedAt">Updated Date</SelectItem>
              <SelectItem value="name">Lead Name</SelectItem>
              <SelectItem value="status">Status</SelectItem>
              <SelectItem value="nextFollowUpAt">Follow-up Due</SelectItem>
              <SelectItem value="score">Lead Score</SelectItem>
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 bg-card"
            title={`Sort ${currentOrder === "asc" ? "Ascending" : "Descending"}`}
            onClick={() => applyParams({ order: currentOrder === "asc" ? "desc" : "asc" })}
          >
            {currentOrder === "asc" ? "↑" : "↓"}
          </Button>

          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSaveModalOpen(true)}
            >
              Save View
            </Button>
          )}
          {views.some((v) => v.id === currentViewId && !isBuiltInView(v)) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
              title="Save current filters & sort into this view"
              onClick={async () => {
                try {
                  const res = await updateSavedViewAction({ id: currentViewId, filters: activeFilterGroup, sortField: currentSort, sortOrder: currentOrder });
                  if (res && "ok" in res && !res.ok) {
                    toast({ variant: "destructive", title: "View not updated", description: res.message });
                    return;
                  }
                  toast({ title: "View updated" });
                  router.refresh();
                } catch {
                  toast({ variant: "destructive", title: "View not updated", description: "We couldn't reach the server. Please try again." });
                }
              }}
            >
              Update View
            </Button>
          )}
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      {(activeCount > 0 || currentSearch) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-muted-foreground font-medium">Active Filters:</span>

          {currentSearch && (
            <Badge variant="secondary" className="gap-1 bg-muted text-muted-foreground border-border">
              Search: &quot;{currentSearch}&quot;
              <X className="h-3 w-3 cursor-pointer hover:text-foreground" onClick={() => handleSearch("")} />
            </Badge>
          )}

          {activeFilterGroup.rules.map((rule, idx) => (
            <Badge key={idx} variant="secondary" className="gap-1 bg-muted text-foreground">
              {describeRule(rule, metadata)}
              <X
                className="h-3 w-3 cursor-pointer hover:text-foreground"
                onClick={() => removeSingleRule(idx)}
              />
            </Badge>
          ))}


          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground hover:text-foreground px-2"
            onClick={clearAllFilters}
          >
            Clear all
          </Button>
        </div>
      )}

      {/* Filter Builder Dialog / Drawer */}
      <FilterBuilderModal
        open={filterModalOpen}
        onOpenChange={setFilterModalOpen}
        initialFilters={activeFilterGroup}
        metadata={metadata}
        onApply={handleApplyFilters}
        onSaveViewTrigger={() => {
          setFilterModalOpen(false);
          setSaveModalOpen(true);
        }}
      />

      {/* Save View Modal */}
      <SaveViewDialog
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        filters={activeFilterGroup}
        sortField={currentSort}
        sortOrder={currentOrder}
      />
    </div>
  );
}

// Built-in presets ("All Leads", "My Leads"…) can't be edited or deleted — hide those controls.
function isBuiltInView(v: { id: string; isPreset?: boolean }) {
  return v.isPreset || v.id.startsWith("preset-");
}

const OPERATOR_WORDS: Record<string, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  does_not_contain: "doesn't contain",
  gt: ">",
  lt: "<",
  between: "between",
  is_empty: "is empty",
  is_not_empty: "is set",
  before: "before",
  after: "after",
};

// "Owner is Asha", "Status group is Won" — not raw keys and ids.
function describeRule(rule: { field: string; operator: string; value?: unknown }, metadata: MetadataOptions) {
  const label = FIELD_OPTIONS.find((f) => f.key === rule.field)?.label ?? rule.field;
  const raw = rule.value == null ? "" : String(rule.value);
  const value =
    rule.field === "ownerId" ? (raw === "me" ? "me" : metadata.users.find((u) => u.id === raw)?.name ?? raw)
    : rule.field === "sourceId" ? metadata.sources.find((s) => s.id === raw)?.name ?? raw
    : rule.field === "tag" || rule.field === "tagId" ? metadata.tags.find((t) => t.id === raw)?.name ?? raw
    : rule.field === "status" ? metadata.statuses?.find((st) => st.key === raw)?.label ?? raw
    : rule.field === "statusCategory" ? STATUS_GROUP_LABELS[raw] ?? raw
    : raw;
  return `${label} ${OPERATOR_WORDS[rule.operator] ?? rule.operator.replace(/_/g, " ")}${value ? ` “${value}”` : ""}`;
}
