"use client";

import { memo, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { sourceKindLabel } from "@/lib/display-labels";

export type InsightCategory = "changes" | "attention" | "gaps" | "coverage";

export type InsightChartRecord = {
  id: string;
  siteId?: string | null;
  sourceKind: string;
  reviewStatus: string;
  concernCount: number;
  occurredAt?: string | null;
  updatedAt: string;
};

type Props = {
  category: InsightCategory;
  records: InsightChartRecord[];
  locations: Array<{ id: string; name: string }>;
  locale: "zh" | "en";
  selectedSource?: string;
  onSelectSource?: (source: string) => void;
};

const COLORS = {
  ink: "#18323f",
  grid: "#dfe8ec",
  blue: "#0878bd",
  blueSoft: "#8fd5e8",
  green: "#167353",
  greenSoft: "#9ed8c3",
  amber: "#d97706",
  amberSoft: "#f8cf85",
  violet: "#8062a7",
  violetSoft: "#d8c8e8",
  pink: "#c95f84",
  gray: "#bdcbd0",
};

const tooltipStyle = {
  border: "1px solid #cad7db",
  borderRadius: 10,
  boxShadow: "0 12px 28px rgba(20, 56, 72, 0.12)",
  color: COLORS.ink,
  fontSize: 13,
};

function chartDate(record: InsightChartRecord) {
  return new Date(record.occurredAt ?? record.updatedAt);
}

function weekKey(record: InsightChartRecord) {
  const date = chartDate(record);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function sourceRows(records: InsightChartRecord[], locale: "zh" | "en") {
  return [...new Set(records.map((record) => record.sourceKind))]
    .map((sourceKind) => {
      const rows = records.filter((record) => record.sourceKind === sourceKind);
      const approved = rows.filter((record) => record.reviewStatus === "approved").length;
      const submitted = rows.filter((record) => record.reviewStatus !== "not_submitted").length;
      return {
        sourceKind,
        source: sourceKindLabel(sourceKind, locale),
        total: rows.length,
        submitted,
        approved,
        pending: rows.filter((record) => record.reviewStatus === "pending").length,
        needsUpdate: rows.filter((record) => record.reviewStatus === "needs_completion").length,
        draft: rows.filter((record) => record.reviewStatus === "not_submitted").length,
        concerns: rows.reduce((sum, record) => sum + record.concernCount, 0),
        completion: rows.length ? Math.round((approved / rows.length) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function ChartCard({
  title,
  subtitle,
  ariaLabel,
  sourceNote,
  wide = false,
  children,
}: {
  title: string;
  subtitle: string;
  ariaLabel: string;
  sourceNote?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`card insight-viz-card${wide ? " insight-viz-wide" : ""}`}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div
        aria-label={ariaLabel}
        className="insight-viz-canvas"
        role="img"
        tabIndex={0}
      >
        {children}
      </div>
      {sourceNote ? <footer className="insight-viz-source">{sourceNote}</footer> : null}
    </section>
  );
}

type TrendRow = {
  period: string;
  total: number;
  submitted: number;
  approved: number;
};

const TREND_SERIES = [
  { key: "total", color: COLORS.blue },
  { key: "submitted", color: COLORS.amber },
  { key: "approved", color: COLORS.green },
] as const;

function HairlineTrend({
  data,
  labels,
  visible,
}: {
  data: TrendRow[];
  labels: Record<(typeof TREND_SERIES)[number]["key"], string>;
  visible: Record<(typeof TREND_SERIES)[number]["key"], boolean>;
}) {
  const width = 920;
  const height = 300;
  const left = 34;
  const right = 142;
  const top = 28;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const activeSeries = TREND_SERIES.filter((item) => visible[item.key]);
  const maxValue = Math.max(1, ...data.flatMap((row) => activeSeries.map((item) => row[item.key])));
  const x = (index: number) => left + (data.length <= 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth);
  const y = (value: number) => top + chartHeight - (value / maxValue) * chartHeight;
  const lastIndex = Math.max(0, data.length - 1);
  const endLabels = activeSeries
    .map((item) => ({ ...item, value: data[lastIndex]?.[item.key] ?? 0, y: y(data[lastIndex]?.[item.key] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let index = 1; index < endLabels.length; index += 1) {
    endLabels[index].y = Math.max(endLabels[index].y, endLabels[index - 1].y + 20);
  }
  const endY = new Map(endLabels.map((item) => [item.key, Math.min(height - bottom + 4, item.y)]));

  return (
    <svg className="insight-hairline-chart" viewBox={`0 0 ${width} ${height}`}>
      {[0.5, 1].map((ratio) => (
        <line className="insight-hairline-guide" key={ratio} x1={left} x2={left + chartWidth} y1={top + chartHeight * (1 - ratio)} y2={top + chartHeight * (1 - ratio)} />
      ))}
      <line className="insight-hairline-floor" x1={left} x2={left + chartWidth} y1={top + chartHeight} y2={top + chartHeight} />
      {data.map((row, index) => (
        <g key={`${row.period}-${index}`}>
          <line className="insight-hairline-tick" x1={x(index)} x2={x(index)} y1={top + chartHeight} y2={top + chartHeight + 9} />
          <text className="insight-hairline-period" textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"} x={x(index)} y={height - 14}>{row.period}</text>
        </g>
      ))}
      {activeSeries.map((item) => {
        const points = data.map((row, index) => `${x(index)},${y(row[item.key])}`).join(" ");
        const last = data[lastIndex];
        return (
          <g className="insight-hairline-series" key={item.key} style={{ "--series-color": item.color } as React.CSSProperties}>
            <polyline className="insight-hairline-path" fill="none" points={points} />
            {data.map((row, index) => (
              <circle className="insight-hairline-point" cx={x(index)} cy={y(row[item.key])} key={`${item.key}-${index}`} r={index === lastIndex ? 5 : 3.5} tabIndex={0}>
                <title>{`${row.period} · ${labels[item.key]} ${row[item.key]}`}</title>
              </circle>
            ))}
            {last ? (
              <g className="insight-hairline-end-label" transform={`translate(${x(lastIndex) + 15} ${endY.get(item.key) ?? y(last[item.key])})`}>
                <text>{labels[item.key]}</text>
                <text className="insight-hairline-value" x={74}>{last[item.key]}</text>
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function niceTickUnit(value: number) {
  const raw = Math.max(1, value / 36);
  return [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((unit) => unit >= raw) ?? 1000;
}

function TickChangeRows({ rows, locale }: { rows: Array<ReturnType<typeof sourceRows>[number] & { change: number }>; locale: "zh" | "en" }) {
  const maxValue = Math.max(1, ...rows.map((row) => Math.abs(row.change)));
  const unit = niceTickUnit(maxValue);
  return (
    <div className="insight-tick-chart">
      <div className="insight-tick-axis" aria-hidden="true"><span>{locale === "zh" ? "减少" : "Decrease"}</span><i /><span>{locale === "zh" ? "增加" : "Increase"}</span></div>
      {rows.map((row) => {
        const count = Math.ceil(Math.abs(row.change) / unit);
        const width = `${Math.max(row.change === 0 ? 0 : 6, (Math.abs(row.change) / maxValue) * 100)}%`;
        return (
          <div className="insight-tick-row" key={row.sourceKind} title={`${row.source}: ${row.change > 0 ? "+" : ""}${row.change}`}>
            <strong>{row.source}</strong>
            <div className="insight-tick-lane">
              <span className="negative">{row.change < 0 ? <i style={{ width }}>{Array.from({ length: count }, (_, index) => <b key={index} />)}</i> : null}</span>
              <em />
              <span className="positive">{row.change > 0 ? <i style={{ width }}>{Array.from({ length: count }, (_, index) => <b key={index} />)}</i> : row.change === 0 ? <small /> : null}</span>
            </div>
            <b>{row.change > 0 ? "+" : ""}{row.change}</b>
          </div>
        );
      })}
      <p>{locale === "zh" ? `每一短线代表 ${unit} 条批准记录` : `Each tick represents ${unit} approved record${unit === 1 ? "" : "s"}`}</p>
    </div>
  );
}

function SourceActions({
  rows,
  selectedSource,
  onSelectSource,
}: {
  rows: ReturnType<typeof sourceRows>;
  selectedSource?: string;
  onSelectSource?: (source: string) => void;
}) {
  if (!onSelectSource) return null;
  return (
    <div className="insight-chart-actions" aria-label="Chart source filter">
      {rows.map((row) => (
        <button
          aria-pressed={selectedSource === row.sourceKind}
          className={selectedSource === row.sourceKind ? "active" : ""}
          key={row.sourceKind}
          onClick={() => onSelectSource(row.sourceKind)}
          type="button"
        >
          {row.source}
        </button>
      ))}
    </div>
  );
}

function ChangesCharts(props: Props) {
  const [series, setSeries] = useState({ total: true, submitted: true, approved: true });
  const rows = useMemo(() => sourceRows(props.records, props.locale), [props.locale, props.records]);
  const trend = useMemo(() => {
    const buckets = new Map<string, InsightChartRecord[]>();
    for (const record of props.records) {
      const key = weekKey(record);
      buckets.set(key, [...(buckets.get(key) ?? []), record]);
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => ({
      period: new Date(`${key}T12:00:00Z`).toLocaleDateString(props.locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      total: bucket.length,
      submitted: bucket.filter((record) => record.reviewStatus !== "not_submitted").length,
      approved: bucket.filter((record) => record.reviewStatus === "approved").length,
    }));
  }, [props.locale, props.records]);
  const midpoint = useMemo(() => {
    const times = props.records.map((record) => chartDate(record).getTime());
    return times.length ? (Math.min(...times) + Math.max(...times)) / 2 : 0;
  }, [props.records]);
  const changeRows = rows.map((row) => {
    const sourceRecords = props.records.filter((record) => record.sourceKind === row.sourceKind && record.reviewStatus === "approved");
    const previous = sourceRecords.filter((record) => chartDate(record).getTime() <= midpoint).length;
    const current = sourceRecords.length - previous;
    return { ...row, change: current - previous };
  });
  const labels = {
    total: props.locale === "zh" ? "采集" : "Collected",
    submitted: props.locale === "zh" ? "提交" : "Submitted",
    approved: props.locale === "zh" ? "批准" : "Approved",
  };
  const latest = trend.at(-1);
  const toggleSeries = (key: keyof typeof series) => {
    setSeries((current) => {
      if (current[key] && Object.values(current).filter(Boolean).length === 1) return current;
      return { ...current, [key]: !current[key] };
    });
  };

  return (
    <div className="stack">
      <fieldset className="insight-series-controls">
        <legend>{props.locale === "zh" ? "显示趋势" : "Visible trends"}</legend>
        <div>
          {(Object.keys(series) as Array<keyof typeof series>).map((key) => (
            <label key={key}>
              <input checked={series[key]} onChange={() => toggleSeries(key)} type="checkbox" />
              <span>{labels[key]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="insight-viz-grid">
        <ChartCard ariaLabel={props.locale === "zh" ? "每周采集提交批准趋势" : "Weekly collection submission approval trend"} sourceNote={props.locale === "zh" ? "授权数据 · 每个节点代表一个自然周" : "AUTHORIZED DATA · ONE POINT PER CALENDAR WEEK"} subtitle={props.locale === "zh" ? "直接标注最新值；聚焦节点可查看准确周数据" : "Latest values are labeled directly; focus a point for exact weekly data"} title={latest ? (props.locale === "zh" ? `最近一周：采集 ${latest.total}，批准 ${latest.approved}` : `Latest week: ${latest.total} collected, ${latest.approved} approved`) : (props.locale === "zh" ? "证据流转节奏" : "Evidence flow pace")} wide>
          <HairlineTrend data={trend} labels={labels} visible={series} />
        </ChartCard>
        <ChartCard ariaLabel={props.locale === "zh" ? "各来源批准数量变化" : "Approval change by source"} sourceNote={props.locale === "zh" ? "授权数据 · 后半段减去前半段" : "AUTHORIZED DATA · SECOND HALF MINUS FIRST HALF"} subtitle={props.locale === "zh" ? "中心线左侧为减少，右侧为增加；短线保留真实单位" : "Decrease sits left of center and growth sits right; ticks preserve real units"} title={props.locale === "zh" ? "哪些来源推动了变化" : "Which sources drove the change"}>
          <TickChangeRows locale={props.locale} rows={changeRows} />
        </ChartCard>
      </div>
      <SourceActions {...props} rows={rows} />
    </div>
  );
}

function AttentionCharts(props: Props) {
  const rows = useMemo(() => sourceRows(props.records, props.locale).sort((a, b) => b.concerns - a.concerns), [props.locale, props.records]);
  const statuses = [
    { name: props.locale === "zh" ? "需补充" : "Needs update", value: props.records.filter((record) => record.reviewStatus === "needs_completion").length, color: COLORS.amber },
    { name: props.locale === "zh" ? "待审核" : "Pending", value: props.records.filter((record) => record.reviewStatus === "pending").length, color: COLORS.blue },
    { name: props.locale === "zh" ? "已批准" : "Approved", value: props.records.filter((record) => record.reviewStatus === "approved").length, color: COLORS.green },
    { name: props.locale === "zh" ? "草稿" : "Draft", value: props.records.filter((record) => record.reviewStatus === "not_submitted").length, color: COLORS.gray },
  ].filter((row) => row.value > 0);
  return (
    <div className="stack">
      <div className="insight-viz-grid">
        <ChartCard ariaLabel={props.locale === "zh" ? "各来源关注点排序" : "Concerns ranked by source"} subtitle={props.locale === "zh" ? "优先显示关注点最集中的来源，柱上保留准确值" : "Sources with the most recorded concerns appear first"} title={props.locale === "zh" ? "关注点集中在哪里" : "Where concerns concentrate"} wide>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 36, top: 8, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={COLORS.grid} strokeDasharray="3 5" />
              <XAxis allowDecimals={false} type="number" />
              <YAxis dataKey="source" tickLine={false} type="category" width={112} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="concerns" fill={COLORS.amberSoft} isAnimationActive={false} name={props.locale === "zh" ? "关注点" : "Concerns"} radius={[0, 6, 6, 0]}><LabelList dataKey="concerns" position="right" /></Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard ariaLabel={props.locale === "zh" ? "记录审核状态构成" : "Review state composition"} subtitle={props.locale === "zh" ? "快速区分需行动、待审核和已批准内容" : "Separate action-needed, pending, and approved work"} title={props.locale === "zh" ? "需要处理的状态" : "Action status mix"}>
          <div className="insight-donut-layout">
            <ResponsiveContainer height={260} width="62%">
              <PieChart><Tooltip contentStyle={tooltipStyle} /><Pie data={statuses} dataKey="value" innerRadius={54} isAnimationActive={false} nameKey="name" outerRadius={86} paddingAngle={3}>{statuses.map((row) => <Cell fill={row.color} key={row.name} />)}</Pie></PieChart>
            </ResponsiveContainer>
            <ul className="insight-donut-legend">{statuses.map((row) => <li key={row.name}><i style={{ background: row.color }} /><span>{row.name}</span><strong>{row.value}</strong></li>)}</ul>
          </div>
        </ChartCard>
      </div>
      <SourceActions {...props} rows={rows} />
    </div>
  );
}

function GapsCharts(props: Props) {
  const rows = useMemo(() => sourceRows(props.records, props.locale), [props.locale, props.records]);
  return (
    <div className="stack">
      <div className="insight-viz-grid">
        <ChartCard ariaLabel={props.locale === "zh" ? "各来源证据流程缺口" : "Evidence pipeline gaps by source"} subtitle={props.locale === "zh" ? "每个来源分解为批准、待审、需补充和草稿" : "Each source is split into approved, pending, needs-update, and draft work"} title={props.locale === "zh" ? "证据流程缺口" : "Evidence pipeline gaps"} wide>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={rows} layout="vertical" margin={{ left: 12, right: 24, top: 8, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={COLORS.grid} strokeDasharray="3 5" />
              <XAxis allowDecimals={false} type="number" />
              <YAxis dataKey="source" tickLine={false} type="category" width={112} />
              <Tooltip contentStyle={tooltipStyle} /><Legend />
              <Bar dataKey="approved" fill={COLORS.violet} isAnimationActive={false} name={props.locale === "zh" ? "已批准" : "Approved"} stackId="pipeline" />
              <Bar dataKey="pending" fill={COLORS.blueSoft} isAnimationActive={false} name={props.locale === "zh" ? "待审核" : "Pending"} stackId="pipeline" />
              <Bar dataKey="needsUpdate" fill={COLORS.amberSoft} isAnimationActive={false} name={props.locale === "zh" ? "需补充" : "Needs update"} stackId="pipeline" />
              <Bar dataKey="draft" fill={COLORS.gray} isAnimationActive={false} name={props.locale === "zh" ? "草稿" : "Draft"} radius={[0, 6, 6, 0]} stackId="pipeline" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard ariaLabel={props.locale === "zh" ? "各来源批准完成率" : "Approval completion by source"} subtitle={props.locale === "zh" ? "虚线为 80% 参考线，低于参考线的来源优先补证" : "The 80% reference line highlights sources that need more work"} title={props.locale === "zh" ? "批准完成率" : "Approval completion"}>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={rows} margin={{ left: -12, right: 14, top: 18, bottom: 30 }}>
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 5" vertical={false} />
              <XAxis angle={-18} dataKey="source" height={58} interval={0} textAnchor="end" tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
              <ReferenceLine stroke={COLORS.ink} strokeDasharray="4 4" y={80} />
              <Tooltip contentStyle={tooltipStyle} formatter={(value) => `${value}%`} />
              <Bar dataKey="completion" fill={COLORS.violetSoft} isAnimationActive={false} name={props.locale === "zh" ? "批准率" : "Approval rate"} radius={[6, 6, 0, 0]}><LabelList dataKey="completion" formatter={(value: unknown) => `${value}%`} position="top" /></Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <SourceActions {...props} rows={rows} />
    </div>
  );
}

function CoverageCharts(props: Props) {
  const locationNames = useMemo(() => new Map(props.locations.map((location) => [location.id, location.name])), [props.locations]);
  const locations = useMemo(() => {
    const grouped = new Map<string, InsightChartRecord[]>();
    for (const record of props.records) {
      const key = record.siteId ?? "unassigned";
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }
    const raw = [...grouped.entries()].map(([id, rows]) => ({
      id,
      location: id === "unassigned" ? (props.locale === "zh" ? "未指定地点" : "Unassigned") : (locationNames.get(id) ?? id.slice(0, 8)),
      volume: rows.length,
      approved: rows.filter((record) => record.reviewStatus === "approved").length,
      approvalRate: rows.length ? Math.round((rows.filter((record) => record.reviewStatus === "approved").length / rows.length) * 100) : 0,
      concernRate: rows.length ? Math.round((rows.filter((record) => record.concernCount > 0).length / rows.length) * 100) : 0,
      sources: new Set(rows.map((record) => record.sourceKind)).size,
    }));
    const sortedVolumes = raw.map((row) => row.volume).sort((a, b) => a - b);
    const target = Math.max(1, sortedVolumes[Math.floor(sortedVolumes.length / 2)] ?? 1);
    return raw.map((row) => ({ ...row, target, gap: Math.max(0, target - row.volume), priority: Math.max(0, target - row.volume) * 10 + (100 - row.approvalRate) + row.concernRate })).sort((a, b) => b.priority - a.priority);
  }, [locationNames, props.locale, props.records]);
  const rows = useMemo(() => sourceRows(props.records, props.locale), [props.locale, props.records]);
  return (
    <div className="stack">
      <div className="insight-viz-grid">
        <ChartCard ariaLabel={props.locale === "zh" ? "地点采集量、批准率与关注点率散点图" : "Location volume approval and concern scatter plot"} subtitle={props.locale === "zh" ? "气泡越大代表来源越多；左上方表示量少但关注率高" : "Larger bubbles cover more sources; upper-left means low volume with higher concern rate"} title={props.locale === "zh" ? "地点覆盖与风险" : "Location coverage and risk"} wide>
          <ResponsiveContainer height="100%" width="100%">
            <ScatterChart margin={{ left: 0, right: 28, top: 18, bottom: 8 }}>
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 5" />
              <XAxis allowDecimals={false} dataKey="volume" name={props.locale === "zh" ? "记录数" : "Records"} type="number" />
              <YAxis dataKey="concernRate" domain={[0, 100]} name={props.locale === "zh" ? "关注记录占比" : "Concern rate"} tickFormatter={(value) => `${value}%`} type="number" />
              <ZAxis dataKey="sources" range={[90, 320]} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={locations} fill={COLORS.greenSoft} isAnimationActive={false} name={props.locale === "zh" ? "地点" : "Location"} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard ariaLabel={props.locale === "zh" ? "下一步采集地点优先级" : "Next location collection priorities"} subtitle={props.locale === "zh" ? "综合相对数量缺口、未批准比例和关注率" : "Combines relative volume gap, unapproved share, and concern rate"} title={props.locale === "zh" ? "下一步采集优先级" : "Next collection priorities"}>
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={locations.slice(0, 8)} layout="vertical" margin={{ left: 24, right: 40, top: 8, bottom: 4 }}>
              <CartesianGrid horizontal={false} stroke={COLORS.grid} strokeDasharray="3 5" />
              <XAxis hide type="number" /><YAxis dataKey="location" interval={0} tickLine={false} type="category" width={130} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="priority" fill={COLORS.greenSoft} isAnimationActive={false} name={props.locale === "zh" ? "优先级" : "Priority"} radius={[0, 6, 6, 0]}><LabelList dataKey="gap" formatter={(value: unknown) => props.locale === "zh" ? `缺口 ${value}` : `Gap ${value}`} position="right" /></Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <SourceActions {...props} rows={rows} />
    </div>
  );
}

function InsightCharts(props: Props) {
  if (!props.records.length) return null;
  if (props.category === "changes") return <ChangesCharts {...props} />;
  if (props.category === "attention") return <AttentionCharts {...props} />;
  if (props.category === "gaps") return <GapsCharts {...props} />;
  return <CoverageCharts {...props} />;
}

export default memo(InsightCharts);
