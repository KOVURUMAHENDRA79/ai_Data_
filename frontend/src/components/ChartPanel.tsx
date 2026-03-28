import type { FC } from "react";
import Plot from "react-plotly.js";
import type { InsightsResult } from "../types";

type ChartPanelProps = {
  insights: InsightsResult;
};

const ChartPanel: FC<ChartPanelProps> = ({ insights }) => {
  const { chart_data: chartData } = insights;
  const firstHistogram = chartData.histograms[0];
  const firstScatter = chartData.scatter_pairs[0];
  const heatmap = chartData.correlation_heatmap;
  const missingCounts = chartData.missing_counts;
  const correlationSummary = insights.correlation_summary;

  const correlationBadgeClassName =
    correlationSummary?.label === "strong"
      ? "bg-emerald-100 text-emerald-700"
      : correlationSummary?.label === "moderate"
        ? "bg-yellow-100 text-yellow-700"
        : "bg-slate-200 text-slate-700";

  return (
    <section className="space-y-6">
      {correlationSummary ? (
        <div className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Correlation Strength</h3>
              <p className="mt-1 text-sm text-slate-500">
                {correlationSummary.pair[0]} vs {correlationSummary.pair[1]} with correlation {correlationSummary.correlation.toFixed(2)}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${correlationBadgeClassName}`}>
              {correlationSummary.label} correlation
            </span>
          </div>
        </div>
      ) : null}

      {firstHistogram ? (
        <div className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <h3 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900">Distribution</h3>
          <Plot
            data={[
              {
                type: "bar",
                x: firstHistogram.bin_edges.slice(0, -1),
                y: firstHistogram.counts,
                marker: { color: "#0f766e" },
              },
            ]}
            layout={{
              title: { text: `${firstHistogram.column} Distribution` },
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "rgba(0,0,0,0)",
              margin: { l: 40, r: 20, t: 48, b: 40 },
            }}
            style={{ width: "100%", height: "360px" }}
            config={{ displayModeBar: false, responsive: true }}
          />
        </div>
      ) : null}

      {heatmap.columns.length > 0 && heatmap.matrix.length > 0 ? (
        <div className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <h3 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900">Correlation Matrix</h3>
          <Plot
            data={[
              {
                type: "heatmap",
                z: heatmap.matrix,
                x: heatmap.columns,
                y: heatmap.columns,
                colorscale: "Blues",
              },
            ]}
            layout={{
              title: { text: "Feature Correlation" },
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "rgba(0,0,0,0)",
              margin: { l: 60, r: 20, t: 48, b: 60 },
            }}
            style={{ width: "100%", height: "420px" }}
            config={{ displayModeBar: false, responsive: true }}
          />
        </div>
      ) : null}

      {firstScatter ? (
        <div className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <h3 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900">Relationship View</h3>
          <Plot
            data={[
              {
                type: "scatter",
                mode: "markers",
                x: firstScatter.x,
                y: firstScatter.y,
                marker: { color: "#2563eb", size: 10, opacity: 0.75 },
              },
            ]}
            layout={{
              title: { text: `${firstScatter.x_column} vs ${firstScatter.y_column}` },
              xaxis: { title: { text: firstScatter.x_column } },
              yaxis: { title: { text: firstScatter.y_column } },
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "rgba(0,0,0,0)",
              margin: { l: 60, r: 20, t: 48, b: 60 },
            }}
            style={{ width: "100%", height: "380px" }}
            config={{ displayModeBar: false, responsive: true }}
          />
        </div>
      ) : null}

      {missingCounts.columns.length > 0 ? (
        <div className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <h3 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900">Missing Values Overview</h3>
          <Plot
            data={[
              {
                type: "bar",
                x: missingCounts.columns,
                y: missingCounts.values,
                marker: { color: "#f59e0b" },
              },
            ]}
            layout={{
              title: { text: "Missing Values by Column" },
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "rgba(0,0,0,0)",
              margin: { l: 40, r: 20, t: 48, b: 80 },
            }}
            style={{ width: "100%", height: "340px" }}
            config={{ displayModeBar: false, responsive: true }}
          />
        </div>
      ) : null}
    </section>
  );
};

export default ChartPanel;
