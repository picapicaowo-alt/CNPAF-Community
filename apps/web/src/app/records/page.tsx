"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { DatasetBuilder } from "@/features/datasets/components/DatasetBuilder";
import { fetchDatasetBuilderOptions } from "@/features/datasets/api";
import {
  datasetFilterSearchParams,
  emptyDatasetFilterDraft,
  labelForOption,
  toDatasetFilters,
} from "@/features/datasets/model";
import type {
  DatasetBuilderOptions,
  DatasetFilterDraft,
  DatasetSummary,
} from "@/features/datasets/types";
import { fetchRecordFilterOptions } from "@/features/records/api";
import { RecordsFiltersPanel } from "@/features/records/components/RecordsFiltersPanel";
import { recordDisplayName, recordReference } from "@/features/records/display";
import { recordFilterStateFromParams } from "@/features/records/model";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { sourceKindLabel, workflowLabel } from "@/lib/display-labels";
import { taskDate } from "@/lib/task-ui";

type RecordRow = {
  id: string;
  clientRecordId: string;
  sourceKind: string;
  organizationId?: string | null;
  siteId?: string | null;
  programId?: string | null;
  createdById: string;
  recordStatus: string;
  reviewStatus: string;
  aiStatus: string;
  privacyStatus: string;
  researchUseStatus: string;
  occurredAt?: string | null;
  submittedAt?: string | null;
  templateVersionId?: string | null;
  approvedDatasetEligible: boolean;
  updatedAt: string;
  concernCount: number;
};

type BuilderSource =
  | { mode: "filters"; recordIds: string[]; organizationId?: string }
  | { mode: "records"; recordIds: string[]; organizationId: string };

type Location = {
  id: string;
  name: string;
  region?: string | null;
  city?: string | null;
};

function status(row: RecordRow, locale: "zh" | "en") {
  if (row.privacyStatus === "flagged")
    return { label: locale === "zh" ? "隐私已标记" : "Privacy flagged", tone: "red" as const };
  if (row.reviewStatus === "needs_completion")
    return { label: locale === "zh" ? "需要补充" : "Needs update", tone: "amber" as const };
  if (row.reviewStatus === "approved")
    return { label: workflowLabel("approved", locale), tone: "green" as const };
  if (["queued", "running"].includes(row.aiStatus))
    return { label: locale === "zh" ? "正在分析" : "Analyzing", tone: "blue" as const };
  return {
    label: workflowLabel(row.reviewStatus || row.recordStatus, locale),
    tone: "neutral" as const,
  };
}

export default function RecordsPage() {
  return (
    <Suspense fallback={<LoadingState rows={5} />}>
      <RecordsContent />
    </Suspense>
  );
}

function RecordsContent() {
  const { locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialFilterState = recordFilterStateFromParams({
    source: searchParams.get("source"),
    stage: searchParams.get("stage"),
    status: searchParams.get("status"),
  });
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [recordFilterOptions, setRecordFilterOptions] =
    useState<DatasetBuilderOptions | null>(null);
  const [datasetOptions, setDatasetOptions] =
    useState<DatasetBuilderOptions | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [datasetFilters, setDatasetFilters] = useState<DatasetFilterDraft>(
    initialFilterState.filters,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [builderSource, setBuilderSource] = useState<BuilderSource | null>(null);
  const [createdDataset, setCreatedDataset] = useState<DatasetSummary | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(initialFilterState.localStatus);
  const [loading, setLoading] = useState(true);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [error, setError] = useState("");
  const recordRequestId = useRef(0);
  const concernsOnly = searchParams.get("hasConcerns") === "1";
  const stage = searchParams.get("stage");
  const canonicalDatasetFilters = useMemo(
    () => toDatasetFilters(datasetFilters),
    [datasetFilters],
  );
  const datasetFilterQuery = useMemo(
    () => datasetFilterSearchParams(canonicalDatasetFilters).toString(),
    [canonicalDatasetFilters],
  );

  const load = useCallback(async () => {
    const requestId = ++recordRequestId.current;
    setLoading(true);
    setError("");
    try {
      const path = datasetFilterQuery
        ? `/api/v1/records?${datasetFilterQuery}`
        : "/api/v1/records";
      const recordResult = await apiFetch<{ records: RecordRow[] }>(path);
      if (requestId === recordRequestId.current) {
        setRows(recordResult.records ?? []);
      }
    } catch (caught) {
      if (requestId === recordRequestId.current) {
        setError(errorMessage(caught));
      }
    } finally {
      if (requestId === recordRequestId.current) {
        setLoading(false);
      }
    }
  }, [datasetFilterQuery]);

  const loadBootstrap = useCallback(async () => {
    setBootstrapLoading(true);
    setError("");
    try {
      const [me, filterOptions] = await Promise.all([
        apiFetch<{ permissions: string[] }>("/api/v1/auth/me"),
        fetchRecordFilterOptions(),
      ]);
      setPermissions(me.permissions ?? []);
      setRecordFilterOptions(filterOptions);
      const canCreateDataset = me.permissions.includes("datasets.create");
      const [options, locationResult] = await Promise.all([
        canCreateDataset
          ? fetchDatasetBuilderOptions()
          : Promise.resolve(null),
        me.permissions.includes("locations.view")
          ? apiFetch<{ locations: Location[] }>("/api/v1/locations")
          : Promise.resolve({ locations: [] }),
      ]);
      setDatasetOptions(options);
      setLocations(locationResult.locations ?? []);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);
  useEffect(() => {
    void load();
  }, [load]);

  const locationById = useMemo(
    () =>
      new Map([
        ...locations.map((location) => [location.id, location] as const),
        ...(recordFilterOptions?.locations ?? []).map(
          (location) => [
            location.value,
            {
              id: location.value,
              name: labelForOption(location, locale),
              region: location.description,
            },
          ] as const,
        ),
      ]),
    [locale, locations, recordFilterOptions?.locations],
  );
  const programById = useMemo(
    () =>
      new Map(
        (recordFilterOptions?.programs ?? []).map(
          (program) => [program.value, labelForOption(program, locale)] as const,
        ),
      ),
    [locale, recordFilterOptions?.programs],
  );
  const formById = useMemo(
    () =>
      new Map(
        (recordFilterOptions?.forms ?? []).map(
          (form) => [form.value, labelForOption(form, locale)] as const,
        ),
      ),
    [locale, recordFilterOptions?.forms],
  );
  const collectorById = useMemo(
    () =>
      new Map(
        (recordFilterOptions?.collectors ?? []).map(
          (collector) => [collector.value, labelForOption(collector, locale)] as const,
        ),
      ),
    [locale, recordFilterOptions?.collectors],
  );
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const matchesFilter =
          filter === "all" ||
          row.reviewStatus === filter ||
          row.recordStatus === filter ||
          row.privacyStatus === filter;
        const matchesConcerns = !concernsOnly || row.concernCount > 0;
        const value = query.trim().toLocaleLowerCase();
        const location = row.siteId ? locationById.get(row.siteId) : null;
        return (
          matchesFilter &&
          matchesConcerns &&
          (!value ||
            [
              row.id,
              row.clientRecordId,
              row.sourceKind,
              row.reviewStatus,
              location?.name,
              location?.city ?? location?.region,
              row.programId ? programById.get(row.programId) : null,
              row.templateVersionId
                ? formById.get(row.templateVersionId)
                : null,
              collectorById.get(row.createdById),
            ].some((part) => part?.toLocaleLowerCase().includes(value)))
        );
      }),
    [
      collectorById,
      concernsOnly,
      filter,
      formById,
      locationById,
      programById,
      query,
      rows,
    ],
  );
  const sourceParam = searchParams.get("source");
  const statusParam = searchParams.get("status");
  const hasDrilldownFilter =
    concernsOnly ||
    Boolean(stage) ||
    Boolean(sourceParam && sourceParam !== "all") ||
    Boolean(statusParam && statusParam !== "all");
  const eligibleVisibleIds = visible
    .filter((row) => row.approvedDatasetEligible)
    .map((row) => row.id);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allEligibleVisibleSelected =
    eligibleVisibleIds.length > 0 &&
    eligibleVisibleIds.every((id) => selected.has(id));
  const selectedOrganizationIds = [
    ...new Set(
      rows
        .filter((row) => selected.has(row.id))
        .flatMap((row) => (row.organizationId ? [row.organizationId] : [])),
    ),
  ];
  const visibleOrganizationIds = [
    ...new Set(
      visible.flatMap((row) =>
        row.approvedDatasetEligible && row.organizationId
          ? [row.organizationId]
          : [],
      ),
    ),
  ];
  const selectionHasOneOrganization = selectedOrganizationIds.length === 1;
  const visibleHasOneOrganization = visibleOrganizationIds.length === 1;
  const canCreateDataset =
    permissions.includes("datasets.create") && Boolean(datasetOptions);
  function toggleRecord(recordId: string) {
    setSelectedIds((current) =>
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId],
    );
  }

  function toggleEligibleVisible() {
    const visibleSet = new Set(eligibleVisibleIds);
    setSelectedIds((current) =>
      allEligibleVisibleSelected
        ? current.filter((id) => !visibleSet.has(id))
        : [...new Set([...current, ...eligibleVisibleIds])],
    );
  }

  function buildFromCurrentView() {
    if (!eligibleVisibleIds.length || !visibleHasOneOrganization) return;
    setBuilderSource({
      mode: "records",
      recordIds: eligibleVisibleIds,
      organizationId: visibleOrganizationIds[0],
    });
  }

  function resetRecordFilters() {
    setQuery("");
    setDatasetFilters(emptyDatasetFilterDraft());
    setFilter("all");
    setSelectedIds([]);
    router.replace("/records");
  }

  return (
    <div className="stack records-page">
      <PageHeader
        title={locale === "zh" ? "记录" : "Records"}
        description={
          locale === "zh"
            ? "搜索、筛选并将组织已采集的内容冻结为 Dataset。"
            : "Search, filter, and freeze collected evidence into datasets."
        }
        actions={
          <Link className="button button-secondary" href="/data">
            <AppIcon name="download" />
            {locale === "zh" ? "数据与下载" : "Data & downloads"}
          </Link>
        }
      />
      {createdDataset ? (
        <div className="feedback feedback-success" role="status">
          <div>
            <strong>
              {locale === "zh" ? "Dataset 已创建" : "Dataset created"}
            </strong>
            <p>
              {createdDataset.name}
              {createdDataset.headVersion?.recordCount != null
                ? locale === "zh"
                  ? ` · ${createdDataset.headVersion.recordCount} 条记录`
                  : ` · ${createdDataset.headVersion.recordCount} records`
                : ""}
            </p>
          </div>
          <Link
            className="button button-secondary button-small"
            href={`/data/${createdDataset.id}`}
          >
            {locale === "zh" ? "查看 Dataset" : "View dataset"}
          </Link>
        </div>
      ) : null}
      {builderSource && datasetOptions ? (
        <DatasetBuilder
          initialFilters={datasetFilters}
          initialMode={builderSource.mode}
          initialOrganizationId={builderSource.organizationId}
          initialRecordIds={builderSource.recordIds}
          locale={locale}
          onCancel={() => setBuilderSource(null)}
          onCreated={(dataset) => {
            setCreatedDataset(dataset);
            setBuilderSource(null);
            setSelectedIds([]);
            router.push(`/data/${dataset.id}`);
          }}
          options={datasetOptions}
        />
      ) : null}
      {hasDrilldownFilter ? (
        <div className="feedback feedback-info records-drilldown-banner">
          <span>
            <strong>
              {locale === "zh" ? "正在查看下钻结果" : "Viewing drill-down results"}
            </strong>
            <span className="caption">
              {locale === "zh"
                ? `共 ${visible.length} 条匹配记录，可点击记录编号查看详情。`
                : `${visible.length} matching records. Open a record ID for details.`}
            </span>
          </span>
          <Link className="button button-secondary button-small" href="/records">
            {locale === "zh" ? "清除筛选" : "Clear filters"}
          </Link>
        </div>
      ) : null}
      <RecordsFiltersPanel
        actions={
          canCreateDataset ? (
            <>
              <button
                className="button button-secondary"
                disabled={
                  bootstrapLoading ||
                  loading ||
                  !eligibleVisibleIds.length ||
                  !visibleHasOneOrganization
                }
                onClick={buildFromCurrentView}
                type="button"
              >
                <AppIcon name="data" />
                {locale === "zh"
                  ? `将当前 ${eligibleVisibleIds.length} 条组成数据集`
                  : `Group ${eligibleVisibleIds.length} results as dataset`}
              </button>
            </>
          ) : undefined
        }
        filters={datasetFilters}
        loading={loading || bootstrapLoading}
        locale={locale}
        matchedCount={visible.length}
        onFiltersChange={setDatasetFilters}
        onQueryChange={setQuery}
        onReset={resetRecordFilters}
        options={recordFilterOptions}
        query={query}
      />
      {selectedIds.length ? (
        <div className="selection-toolbar">
          <div>
            <strong>
              {locale === "zh"
                ? `已勾选 ${selectedIds.length} 条记录`
                : `${selectedIds.length} records selected`}
            </strong>
            <span className="caption">
              {locale === "zh"
                ? "只有已批准、已通过隐私检查且允许研究使用的记录可加入默认 Dataset。"
                : "Only approved, privacy-cleared, research-eligible records can enter the default dataset."}
            </span>
            {selectedIds.length && !selectionHasOneOrganization ? (
              <span className="caption text-danger">
                {locale === "zh"
                  ? "一个 Dataset 只能属于一个组织。"
                  : "A dataset can contain records from only one organization."}
              </span>
            ) : null}
          </div>
          <div className="row">
            <button
              className="button button-ghost button-small"
              onClick={() => setSelectedIds([])}
              type="button"
            >
              {locale === "zh" ? "取消选择" : "Clear selection"}
            </button>
            <button
              className="button"
              disabled={!selectionHasOneOrganization}
              onClick={() =>
                setBuilderSource({
                  mode: "records",
                  recordIds: selectedIds,
                  organizationId: selectedOrganizationIds[0],
                })
              }
              type="button"
            >
              <AppIcon name="data" />
              {locale === "zh" ? "组成数据集" : "Group as dataset"}
            </button>
          </div>
        </div>
      ) : null}
      {loading ? (
        <LoadingState rows={5} />
      ) : error ? (
        <ErrorState message={error} retry={load} />
      ) : visible.length ? (
        <div className="table-shell">
          <div className="table-scroll">
            <table className="data-table records-data-table">
              <thead>
                <tr>
                  {canCreateDataset ? (
                    <th className="selection-cell">
                      <input
                        aria-label={
                          locale === "zh"
                            ? "选择当前可用记录"
                            : "Select eligible visible records"
                        }
                        checked={allEligibleVisibleSelected}
                        disabled={!eligibleVisibleIds.length}
                        onChange={toggleEligibleVisible}
                        type="checkbox"
                      />
                    </th>
                  ) : null}
                  <th>{locale === "zh" ? "记录" : "Record"}</th>
                  <th>{locale === "zh" ? "地点 / 来源" : "Location / source"}</th>
                  <th>{locale === "zh" ? "项目 / 表单" : "Program / form"}</th>
                  <th>{locale === "zh" ? "状态" : "Status"}</th>
                  <th>{locale === "zh" ? "研究使用" : "Research use"}</th>
                  <th>{locale === "zh" ? "发生时间" : "Occurred"}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const itemStatus = status(row, locale);
                  const location = row.siteId
                    ? locationById.get(row.siteId)
                    : null;
                  return (
                    <tr
                      className={selected.has(row.id) ? "row-selected" : undefined}
                      key={row.id}
                    >
                      {canCreateDataset ? (
                        <td className="selection-cell">
                          <input
                            aria-label={`${locale === "zh" ? "选择记录" : "Select record"} ${recordReference(row)}`}
                            checked={selected.has(row.id)}
                            disabled={!row.approvedDatasetEligible}
                            onChange={() => toggleRecord(row.id)}
                            title={
                              row.approvedDatasetEligible
                                ? undefined
                                : locale === "zh"
                                  ? "该记录尚不符合已批准证据 Dataset 条件"
                                  : "This record is not eligible for an approved-evidence dataset"
                            }
                            type="checkbox"
                          />
                        </td>
                      ) : null}
                      <td>
                        <Link className="table-link" href={`/records/${row.id}`}>
                          {recordDisplayName(
                            row,
                            locale,
                            {
                              locationName: location?.name,
                              formName: row.templateVersionId ? formById.get(row.templateVersionId) : null,
                            },
                          )}
                        </Link>
                        <div className="caption">
                          <span className="record-reference">{recordReference(row)}</span>
                          <span>{collectorById.get(row.createdById) ?? (locale === "zh" ? "未知采集员" : "Unknown collector")}</span>
                        </div>
                      </td>
                      <td>
                        <strong>{location?.name ?? sourceKindLabel(row.sourceKind, locale)}</strong>
                        <div className="caption">
                          {location
                            ? sourceKindLabel(row.sourceKind, locale)
                            : locale === "zh"
                              ? "未关联地点"
                              : "No linked location"}
                        </div>
                      </td>
                      <td>
                        <strong>
                          {row.programId
                            ? (programById.get(row.programId) ??
                              row.programId.slice(0, 8))
                            : locale === "zh"
                              ? "未关联项目"
                              : "No program"}
                        </strong>
                        <div className="caption">
                          {row.templateVersionId
                            ? (formById.get(row.templateVersionId) ??
                              row.templateVersionId.slice(0, 8))
                            : locale === "zh"
                              ? "无表单版本"
                              : "No form version"}
                        </div>
                      </td>
                      <td>
                        <StatusPill tone={itemStatus.tone}>
                          {itemStatus.label}
                        </StatusPill>
                        {row.concernCount ? (
                          <div className="caption concern-count">
                            {locale === "zh"
                              ? `${row.concernCount} 个关注点`
                              : `${row.concernCount} concerns`}
                          </div>
                        ) : null}
                      </td>
                      <td>{workflowLabel(row.researchUseStatus, locale)}</td>
                      <td>{taskDate(row.occurredAt ?? row.updatedAt, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon="records"
          title={locale === "zh" ? "没有匹配记录" : "No matching records"}
          description={
            locale === "zh"
              ? "尝试调整搜索词或筛选条件。"
              : "Try a different search or filter."
          }
        />
      )}
    </div>
  );
}
