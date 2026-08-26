"use client";

import { memo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
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
import {
  INSIGHT_CONCERNS,
  INSIGHT_LOCATIONS,
  INSIGHT_SOURCES,
  INSIGHT_SOURCE_TARGETS,
  insightConcernLabel,
  insightLocationLabel,
  insightSourceLabel,
  type InsightDemoRecord,
} from "./demo-data";

export type InsightCategory = "changes" | "attention" | "gaps" | "coverage";

type Props = {
  category: InsightCategory;
  records: InsightDemoRecord[];
  locale: "zh" | "en";
  dateFrom: string;
  dateTo: string;
};

const PALETTE = {
  ink: "#18323f",
  grid: "#e7edf2",
  blue100: "#bfeaf5",
  blue200: "#8bd5e9",
  blue300: "#60b8de",
  blue400: "#3a9bcf",
  blue500: "#036eb7",
  pink100: "#fbf5f7",
  pink200: "#f5e2e8",
  pink300: "#efcdd8",
  pink400: "#e5b4c4",
  pink500: "#d58fa8",
  purple100: "#f7f4fa",
  purple200: "#ece4f4",
  purple300: "#ddcfeb",
  purple400: "#c5b0dc",
  purple500: "#a68bc7",
  yellow100: "#fffdf4",
  yellow200: "#fff6cb",
  yellow300: "#ffeaa1",
  yellow400: "#ffda65",
  yellow500: "#ffbf00",
};

type TrendSeriesKey = "started" | "submitted" | "approved";

const TREND_SERIES: Array<{
  key: TrendSeriesKey;
  softColor: string;
  activeColor: string;
  dash?: string;
}> = [
  { key: "started", softColor: PALETTE.yellow200, activeColor: PALETTE.yellow500, dash: "2 7" },
  { key: "submitted", softColor: PALETTE.blue200, activeColor: PALETTE.blue500, dash: "9 5" },
  { key: "approved", softColor: PALETTE.pink200, activeColor: PALETTE.pink500 },
];

const tooltipStyle = {
  border: "1px solid #cad7db",
  borderRadius: 8,
  boxShadow: "0 12px 28px rgba(20, 56, 72, 0.12)",
  color: PALETTE.ink,
  fontSize: 13,
};

function countStages(records: InsightDemoRecord[]) {
  return {
    started: records.length,
    submitted: records.filter((record) => record.stage !== "started").length,
    approved: records.filter((record) => record.stage === "approved").length,
  };
}

function dateLabel(value: string, locale: "zh" | "en") {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function weekKey(iso: string) {
  const date = new Date(iso);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function trendData(records: InsightDemoRecord[], locale: "zh" | "en") {
  const times = records.map((record) => new Date(record.occurredAt).getTime());
  const minTime = times.length ? Math.min(...times) : 0;
  const maxTime = times.length ? Math.max(...times) : 0;
  const spanDays = Math.max(1, Math.round((maxTime - minTime) / 86_400_000) + 1);
  const useThreeDayBuckets = spanDays <= 45;
  const periods = new Map<string, InsightDemoRecord[]>();
  for (const record of records) {
    const key = useThreeDayBuckets
      ? new Date(
          minTime + Math.floor((new Date(record.occurredAt).getTime() - minTime) / (3 * 86_400_000)) * 3 * 86_400_000,
        ).toISOString().slice(0, 10)
      : weekKey(record.occurredAt);
    periods.set(key, [...(periods.get(key) ?? []), record]);
  }
  const rows = [...periods.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({
      key,
      period: dateLabel(key, locale),
      ...countStages(rows),
    }));
  return { rows, grain: useThreeDayBuckets ? "three-day" : "week" } as const;
}

function sourceData(records: InsightDemoRecord[], locale: "zh" | "en") {
  return INSIGHT_SOURCES.map((source) => {
    const rows = records.filter((record) => record.sourceKind === source.key);
    const stages = countStages(rows);
    return {
      key: source.key,
      source: insightSourceLabel(source.key, locale),
      ...stages,
      pending: Math.max(0, stages.submitted - stages.approved),
      unsubmitted: Math.max(0, stages.started - stages.submitted),
      completion: stages.started ? Math.round((stages.submitted / stages.started) * 100) : 0,
    };
  }).filter((row) => row.started > 0);
}

function sourceChangeData(records: InsightDemoRecord[], locale: "zh" | "en") {
  const timestamps = records.map((record) => new Date(record.occurredAt).getTime());
  const midpoint = timestamps.length
    ? (Math.min(...timestamps) + Math.max(...timestamps)) / 2
    : 0;
  return INSIGHT_SOURCES.map((source) => {
    const rows = records.filter((record) => record.sourceKind === source.key);
    const previous = rows.filter(
      (record) => record.stage === "approved" && new Date(record.occurredAt).getTime() <= midpoint,
    ).length;
    const current = rows.filter(
      (record) => record.stage === "approved" && new Date(record.occurredAt).getTime() > midpoint,
    ).length;
    return {
      source: insightSourceLabel(source.key, locale),
      change: current - previous,
      previous,
      current,
    };
  }).filter((row) => row.previous + row.current > 0);
}

function concernData(records: InsightDemoRecord[], locale: "zh" | "en") {
  const total = records.filter((record) => record.concern).length;
  let running = 0;
  return INSIGHT_CONCERNS.map((concern) => ({
    key: concern.key,
    label: insightConcernLabel(concern.key, locale),
    count: records.filter((record) => record.concern === concern.key).length,
  }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((row) => {
      running += row.count;
      return { ...row, cumulative: total ? Math.round((running / total) * 100) : 0 };
    });
}

function severityData(records: InsightDemoRecord[], locale: "zh" | "en") {
  const labels = {
    high: locale === "zh" ? "高优先级" : "High priority",
    medium: locale === "zh" ? "中优先级" : "Medium priority",
    low: locale === "zh" ? "一般" : "Routine",
  };
  return (["high", "medium", "low"] as const).map((severity) => ({
    key: severity,
    name: labels[severity],
    value: records.filter((record) => record.severity === severity).length,
  }));
}

function concernMatrix(records: InsightDemoRecord[]) {
  return INSIGHT_LOCATIONS.map((location) => ({
    location: location.key,
    cells: INSIGHT_CONCERNS.map((concern) => ({
      concern: concern.key,
      count: records.filter(
        (record) => record.locationId === location.key && record.concern === concern.key,
      ).length,
    })),
  }));
}

function completenessData(records: InsightDemoRecord[], locale: "zh" | "en") {
  const bins = [
    { label: locale === "zh" ? "低于 50%" : "Below 50%", min: 0, max: 49 },
    { label: "50–69%", min: 50, max: 69 },
    { label: "70–84%", min: 70, max: 84 },
    { label: "85–100%", min: 85, max: 100 },
  ];
  return bins.map((bin) => ({
    range: bin.label,
    count: records.filter(
      (record) => record.completeness >= bin.min && record.completeness <= bin.max,
    ).length,
  }));
}

function coverageData(
  records: InsightDemoRecord[],
  locale: "zh" | "en",
  dateFrom: string,
  dateTo: string,
) {
  const daySpan = Math.max(
    1,
    Math.round(
      (new Date(`${dateTo}T12:00:00Z`).getTime() - new Date(`${dateFrom}T12:00:00Z`).getTime()) /
        86_400_000,
    ) + 1,
  );
  const periodScale = Math.max(0.25, Math.min(1, daySpan / 96));

  return INSIGHT_LOCATIONS.flatMap((location) =>
    INSIGHT_SOURCES.map((source) => {
      const rows = records.filter(
        (record) => record.locationId === location.key && record.sourceKind === source.key,
      );
      const submitted = rows.filter((record) => record.stage !== "started").length;
      const concerns = rows.filter((record) => record.concern).length;
      const target = Math.max(2, Math.ceil((INSIGHT_SOURCE_TARGETS[source.key] / 5) * periodScale));
      const coverage = Math.min(125, Math.round((rows.length / target) * 100));
      const concernRate = rows.length ? Math.round((concerns / rows.length) * 100) : 0;
      const completion = rows.length ? Math.round((submitted / rows.length) * 100) : 0;
      const gap = Math.max(0, target - rows.length);
      const priority = gap * 10 + concernRate + Math.max(0, 80 - completion);
      return {
        id: `${location.key}-${source.key}`,
        locationKey: location.key,
        sourceKey: source.key,
        location: insightLocationLabel(location.key, locale),
        source: insightSourceLabel(source.key, locale),
        shortLabel: `${insightLocationLabel(location.key, locale)} · ${insightSourceLabel(source.key, locale)}`,
        coverage,
        concernRate,
        completion,
        volume: rows.length,
        target,
        gap,
        priority,
      };
    }),
  ).filter((row) => row.volume > 0 || row.gap > 0);
}

function ChartCard({
  title,
  subtitle,
  children,
  controls,
  className = "",
  ariaLabel,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  controls?: React.ReactNode;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <section className={`card insight-viz-card ${className}`.trim()}>
      <header>
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {controls}
      </header>
      <div aria-label={ariaLabel} className="insight-viz-canvas" role="img">
        {children}
      </div>
    </section>
  );
}

function ChangesCharts({ records, locale }: Omit<Props, "category" | "dateFrom" | "dateTo">) {
  const trend = trendData(records, locale);
  const changes = sourceChangeData(records, locale);
  const [visibleSeries, setVisibleSeries] = useState<Record<TrendSeriesKey, boolean>>({
    started: true,
    submitted: true,
    approved: true,
  });
  const [activeSeries, setActiveSeries] = useState<TrendSeriesKey | null>(null);
  const labels: Record<TrendSeriesKey, string> = {
    started: locale === "zh" ? "采集" : "Started",
    submitted: locale === "zh" ? "提交" : "Submitted",
    approved: locale === "zh" ? "批准" : "Approved",
  };

  function toggleSeries(key: TrendSeriesKey) {
    const visibleCount = Object.values(visibleSeries).filter(Boolean).length;
    if (visibleSeries[key] && visibleCount === 1) return;
    setVisibleSeries((current) => ({ ...current, [key]: !current[key] }));
    if (activeSeries === key) setActiveSeries(null);
  }

  return (
    <div className="insight-viz-grid">
      <ChartCard
        ariaLabel={locale === "zh" ? "每周采集、提交与批准趋势" : "Weekly started, submitted, and approved trend"}
        className="insight-viz-wide"
        controls={
          <fieldset className="insight-series-controls">
            <legend>{locale === "zh" ? "显示序列" : "Visible series"}</legend>
            <div>
              {TREND_SERIES.map((series) => (
                <label
                  className={activeSeries === series.key ? "focused" : ""}
                  key={series.key}
                >
                  <input
                    checked={visibleSeries[series.key]}
                    onChange={() => toggleSeries(series.key)}
                    type="checkbox"
                  />
                  <i
                    aria-hidden="true"
                    className={series.dash ? "dashed" : "solid"}
                    style={{
                      borderTopColor:
                        activeSeries === series.key
                          ? series.activeColor
                          : series.softColor,
                    }}
                  />
                  <span>{labels[series.key]}</span>
                </label>
              ))}
              {activeSeries ? (
                <button onClick={() => setActiveSeries(null)} type="button">
                  {locale === "zh" ? "取消聚焦" : "Clear focus"}
                </button>
              ) : null}
            </div>
          </fieldset>
        }
        subtitle={locale === "zh" ? `${trend.rows.length} 个${trend.grain === "week" ? "自然周" : "三天周期"}；勾选显示或隐藏序列，点击折线可聚焦` : `${trend.rows.length} ${trend.grain === "week" ? "calendar weeks" : "three-day periods"}; toggle series or select a line to focus`}
        title={locale === "zh" ? "每周采集进展" : "Weekly collection progress"}
      >
        <ResponsiveContainer height="100%" width="100%">
          <LineChart data={trend.rows} margin={{ left: -10, right: 16, top: 14, bottom: 0 }}>
            <CartesianGrid stroke={PALETTE.grid} strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="period" minTickGap={24} tickLine={false} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            {TREND_SERIES.filter((series) => visibleSeries[series.key]).map((series) => {
              const focused = activeSeries === series.key;
              const muted = Boolean(activeSeries && !focused);
              const stroke = focused ? series.activeColor : series.softColor;
              return (
                <Line
                  activeDot={{ r: focused ? 7 : 5, strokeWidth: 2 }}
                  dataKey={series.key}
                  dot={{ fill: "white", r: focused ? 4 : 3, stroke, strokeWidth: focused ? 3 : 2 }}
                  isAnimationActive={false}
                  key={series.key}
                  name={labels[series.key]}
                  onClick={() => setActiveSeries((current) => current === series.key ? null : series.key)}
                  stroke={stroke}
                  strokeDasharray={series.dash}
                  strokeOpacity={muted ? 0.2 : 1}
                  strokeWidth={focused ? 4.2 : 2.5}
                  style={{ cursor: "pointer" }}
                  type="linear"
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        ariaLabel={locale === "zh" ? "前后半段批准量变化" : "Change in approved volume between period halves"}
        subtitle={locale === "zh" ? "后半段减去前半段；零线以上代表增长" : "Second half minus first half; above zero means growth"}
        title={locale === "zh" ? "各来源批准量变化" : "Approval change by source"}
      >
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={changes} layout="vertical" margin={{ left: 12, right: 34, top: 8, bottom: 4 }}>
            <CartesianGrid stroke={PALETTE.grid} strokeDasharray="3 5" horizontal={false} />
            <XAxis type="number" allowDecimals={false} />
            <YAxis dataKey="source" type="category" width={92} tickLine={false} />
            <ReferenceLine stroke={PALETTE.ink} x={0} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="change" fill={PALETTE.blue200} isAnimationActive={false} name={locale === "zh" ? "变化" : "Change"} radius={[0, 5, 5, 0]}>
              <LabelList dataKey="change" position="right" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function AttentionCharts({ records, locale }: Omit<Props, "category" | "dateFrom" | "dateTo">) {
  const concerns = concernData(records, locale);
  const severities = severityData(records, locale);
  const matrix = concernMatrix(records);
  const maxCell = Math.max(1, ...matrix.flatMap((row) => row.cells.map((cell) => cell.count)));
  const severityColors = [PALETTE.pink500, PALETTE.yellow400, PALETTE.blue100];
  const [cumulativeFocused, setCumulativeFocused] = useState(false);

  return (
    <div className="insight-viz-grid">
      <ChartCard
        ariaLabel={locale === "zh" ? "关注主题数量与累计占比" : "Concern counts and cumulative share"}
        className="insight-viz-wide"
        subtitle={locale === "zh" ? "按关注点数量排序；折线为累计占比" : "Sorted by concern count; line shows cumulative share"}
        title={locale === "zh" ? "关注点集中度" : "Concern concentration"}
      >
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart data={concerns} margin={{ left: -10, right: 8, top: 14, bottom: 22 }}>
            <CartesianGrid stroke={PALETTE.grid} strokeDasharray="3 5" vertical={false} />
            <XAxis angle={-18} dataKey="label" height={62} interval={0} textAnchor="end" tickLine={false} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} yAxisId="count" />
            <YAxis axisLine={false} domain={[0, 100]} orientation="right" tickFormatter={(value) => `${value}%`} tickLine={false} yAxisId="share" />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill={PALETTE.yellow200} isAnimationActive={false} name={locale === "zh" ? "关注点" : "Concerns"} radius={[5, 5, 0, 0]} yAxisId="count" />
            <Line
              activeDot={{ r: cumulativeFocused ? 7 : 5, strokeWidth: 2 }}
              dataKey="cumulative"
              dot={{ fill: "white", r: cumulativeFocused ? 4 : 3 }}
              isAnimationActive={false}
              name={locale === "zh" ? "累计占比" : "Cumulative share"}
              onClick={() => setCumulativeFocused((current) => !current)}
              stroke={cumulativeFocused ? PALETTE.purple500 : PALETTE.purple200}
              strokeWidth={cumulativeFocused ? 4.2 : 2.5}
              style={{ cursor: "pointer" }}
              yAxisId="share"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        ariaLabel={locale === "zh" ? "关注点优先级构成" : "Concern priority composition"}
        subtitle={locale === "zh" ? "仅统计带关注点的模拟记录" : "Simulated records with a concern only"}
        title={locale === "zh" ? "关注优先级" : "Concern priority"}
      >
        <div className="insight-donut-layout">
          <ResponsiveContainer height={260} width="62%">
            <PieChart>
              <Tooltip contentStyle={tooltipStyle} />
              <Pie cx="50%" cy="50%" data={severities} dataKey="value" endAngle={-270} innerRadius={54} isAnimationActive={false} nameKey="name" outerRadius={84} paddingAngle={3} startAngle={90} stroke="white" strokeWidth={2}>
                {severities.map((row, index) => <Cell fill={severityColors[index]} key={row.key} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <ul className="insight-donut-legend">
            {severities.map((row, index) => (
              <li key={row.key}><i style={{ background: severityColors[index] }} /><span>{row.name}</span><strong>{row.value}</strong></li>
            ))}
          </ul>
        </div>
      </ChartCard>

      <section className="card insight-viz-card insight-viz-span-all insight-heatmap-card">
        <header>
          <h2>{locale === "zh" ? "地点 × 关注主题" : "Location × concern theme"}</h2>
          <p>{locale === "zh" ? "颜色深浅表示关注点数量；单元格同时显示准确值" : "Tone shows concern count; cells retain exact values"}</p>
        </header>
        <div className="insight-heatmap" role="table" aria-label={locale === "zh" ? "地点与关注主题矩阵" : "Location and concern theme matrix"}>
          <span aria-hidden="true" />
          {INSIGHT_CONCERNS.map((concern) => <strong key={concern.key} role="columnheader">{insightConcernLabel(concern.key, locale)}</strong>)}
          {matrix.map((row) => (
            <div className="insight-heatmap-row" key={row.location} role="row">
              <strong role="rowheader">{insightLocationLabel(row.location, locale)}</strong>
              {row.cells.map((cell) => (
                <span
                  aria-label={`${insightLocationLabel(row.location, locale)} · ${insightConcernLabel(cell.concern, locale)}: ${cell.count}`}
                  key={cell.concern}
                  role="cell"
                  style={{ "--heat": String(cell.count / maxCell) } as React.CSSProperties}
                >{cell.count}</span>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function GapsCharts({ records, locale }: Omit<Props, "category" | "dateFrom" | "dateTo">) {
  const sources = sourceData(records, locale);
  const completeness = completenessData(records, locale);
  return (
    <div className="insight-viz-grid">
      <ChartCard
        ariaLabel={locale === "zh" ? "各来源批准、待批准和未提交记录" : "Approved, pending, and unsubmitted records by source"}
        className="insight-viz-wide"
        subtitle={locale === "zh" ? "每条横条以该来源的已采集记录为分母" : "Each bar uses collected records for that source as its denominator"}
        title={locale === "zh" ? "证据流程缺口" : "Evidence pipeline gaps"}
      >
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={sources} layout="vertical" margin={{ left: 8, right: 22, top: 8, bottom: 4 }}>
            <CartesianGrid stroke={PALETTE.grid} strokeDasharray="3 5" horizontal={false} />
            <XAxis allowDecimals={false} type="number" />
            <YAxis dataKey="source" tickLine={false} type="category" width={100} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend />
            <Bar dataKey="approved" fill={PALETTE.purple400} isAnimationActive={false} name={locale === "zh" ? "已批准" : "Approved"} stackId="pipeline" />
            <Bar dataKey="pending" fill={PALETTE.purple200} isAnimationActive={false} name={locale === "zh" ? "待批准" : "Pending"} stackId="pipeline" />
            <Bar dataKey="unsubmitted" fill={PALETTE.purple100} isAnimationActive={false} name={locale === "zh" ? "未提交" : "Not submitted"} radius={[0, 5, 5, 0]} stackId="pipeline" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        ariaLabel={locale === "zh" ? "记录完整度分布" : "Record completeness distribution"}
        subtitle={locale === "zh" ? "完整度越低，越需要补充字段或附件" : "Lower completeness indicates fields or attachments to add"}
        title={locale === "zh" ? "记录完整度分布" : "Record completeness distribution"}
      >
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={completeness} margin={{ left: -14, right: 16, top: 18, bottom: 4 }}>
            <CartesianGrid stroke={PALETTE.grid} strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="range" tickLine={false} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="count" fill={PALETTE.purple300} isAnimationActive={false} name={locale === "zh" ? "记录" : "Records"} radius={[5, 5, 0, 0]}>
              <LabelList dataKey="count" position="top" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function CoverageCharts({ records, locale, dateFrom, dateTo }: Omit<Props, "category">) {
  const coverage = coverageData(records, locale, dateFrom, dateTo);
  const priorities = [...coverage].sort((a, b) => b.priority - a.priority).slice(0, 7);
  return (
    <div className="insight-viz-grid">
      <ChartCard
        ariaLabel={locale === "zh" ? "来源地点组合的覆盖率与关注点率散点图" : "Coverage and concern-rate scatter by source-location cohort"}
        className="insight-viz-wide"
        subtitle={locale === "zh" ? `${coverage.length} 个来源 × 地点组合；左上方代表覆盖不足且关注较多` : `${coverage.length} source × location cohorts; upper-left means low coverage with more concerns`}
        title={locale === "zh" ? "覆盖率与关注点率" : "Coverage and concern rate"}
      >
        <ResponsiveContainer height="100%" width="100%">
          <ScatterChart margin={{ left: 0, right: 24, top: 16, bottom: 8 }}>
            <CartesianGrid stroke={PALETTE.grid} strokeDasharray="3 5" />
            <XAxis dataKey="coverage" domain={[0, 130]} name={locale === "zh" ? "覆盖率" : "Coverage"} tickFormatter={(value) => `${value}%`} type="number" />
            <YAxis dataKey="concernRate" domain={[0, 100]} name={locale === "zh" ? "关注点率" : "Concern rate"} tickFormatter={(value) => `${value}%`} type="number" />
            <ZAxis dataKey="volume" range={[70, 270]} />
            <ReferenceLine stroke={PALETTE.ink} strokeDasharray="4 4" x={100} />
            <ReferenceLine stroke={PALETTE.ink} strokeDasharray="4 4" y={35} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={coverage} fill={PALETTE.pink400} isAnimationActive={false} name={locale === "zh" ? "来源地点组合" : "Source-location cohort"} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        ariaLabel={locale === "zh" ? "下一步采集优先级排名" : "Next collection priority ranking"}
        subtitle={locale === "zh" ? "综合目标缺口、关注点率和提交完成率" : "Combines target gap, concern rate, and submission completion"}
        title={locale === "zh" ? "下一步采集优先级" : "Next collection priorities"}
      >
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={priorities} layout="vertical" margin={{ left: 36, right: 28, top: 8, bottom: 4 }}>
            <CartesianGrid stroke={PALETTE.grid} strokeDasharray="3 5" horizontal={false} />
            <XAxis hide type="number" />
            <YAxis dataKey="shortLabel" interval={0} tick={{ fontSize: 11 }} tickLine={false} type="category" width={146} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="priority" fill={PALETTE.blue300} isAnimationActive={false} name={locale === "zh" ? "优先级分数" : "Priority score"} radius={[0, 5, 5, 0]}>
              <LabelList dataKey="gap" formatter={(value: unknown) => locale === "zh" ? `缺 ${value}` : `Gap ${value}`} position="right" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function InsightCharts(props: Props) {
  if (!props.records.length) {
    return (
      <section className="card insight-viz-empty">
        <strong>{props.locale === "zh" ? "当前范围没有模拟记录" : "No simulated records in this scope"}</strong>
        <p>{props.locale === "zh" ? "展开上方范围筛选并调整日期、来源或地点。" : "Open the scope filters above and adjust dates, sources, or locations."}</p>
      </section>
    );
  }
  if (props.category === "changes") return <ChangesCharts locale={props.locale} records={props.records} />;
  if (props.category === "attention") return <AttentionCharts locale={props.locale} records={props.records} />;
  if (props.category === "gaps") return <GapsCharts locale={props.locale} records={props.records} />;
  return <CoverageCharts {...props} />;
}

export default memo(InsightCharts);
