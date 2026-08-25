"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, LoadingState, PageHeader, StatusPill } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type SharedDataset = {
  dataset: { id: string; name: string; description: string | null; dataClassification: string };
  version: { id: string; versionNumber: number; recordCount: number; contentHash: string; createdAt: string };
  rows: Array<{
    record: { id: string; sourceKind: string; reviewStatus: string; researchUseStatus: string };
    recordVersionId: string;
  }>;
};

export default function SharedDatasetPage() {
  const { locale } = useI18n();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedDataset | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<SharedDataset>(`/api/v1/shared-datasets/${encodeURIComponent(token)}`)
      .then(setData)
      .catch((caught) => setError(errorMessage(caught)))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <LoadingState rows={5} />;
  if (!data) return <ErrorState message={error || (locale === "zh" ? "分享不存在或已失效" : "Share does not exist or is no longer active")} />;

  return (
    <div className="stack data-page">
      <PageHeader
        eyebrow={locale === "zh" ? "受控 Dataset 分享" : "Controlled Dataset share"}
        title={data.dataset.name}
        description={data.dataset.description || (locale === "zh" ? "该链接固定到不可变 Dataset Version。" : "This link is pinned to an immutable Dataset Version.")}
        actions={<Link className="button button-secondary" href="/data"><AppIcon name="back" />{locale === "zh" ? "返回" : "Back"}</Link>}
      />
      <div className="dataset-overview-grid">
        <div className="card card-soft"><span className="caption">{locale === "zh" ? "版本" : "Version"}</span><strong>v{data.version.versionNumber}</strong></div>
        <div className="card card-soft"><span className="caption">{locale === "zh" ? "记录" : "Records"}</span><strong>{data.version.recordCount}</strong></div>
        <div className="card card-soft"><span className="caption">{locale === "zh" ? "分类" : "Classification"}</span><strong>{data.dataset.dataClassification}</strong></div>
      </div>
      <section className="card stack">
        <h2>{locale === "zh" ? "冻结的记录版本" : "Frozen Record Versions"}</h2>
        <div className="table-shell"><div className="table-scroll"><table className="data-table"><thead><tr><th>{locale === "zh" ? "记录" : "Record"}</th><th>{locale === "zh" ? "Record Version" : "Record Version"}</th><th>{locale === "zh" ? "来源" : "Source"}</th><th>{locale === "zh" ? "状态" : "Status"}</th><th>{locale === "zh" ? "研究使用" : "Research use"}</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.recordVersionId}><td><strong>{row.record.id.slice(0, 8).toUpperCase()}</strong></td><td className="mono-small">{row.recordVersionId}</td><td>{row.record.sourceKind}</td><td><StatusPill tone={row.record.reviewStatus === "approved" ? "green" : "neutral"}>{row.record.reviewStatus}</StatusPill></td><td>{row.record.researchUseStatus}</td></tr>)}</tbody></table></div></div>
      </section>
    </div>
  );
}
