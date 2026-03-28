import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import Navbar from "./components/Navbar";
import DataTable from "./components/DataTable";
import ChartPanel from "./components/ChartPanel";
import ChatPanel from "./components/ChatPanel";
import type { ModelMetric, ProcessResponse, TableRow } from "./types";

type TaskId = "anomaly" | "missing_values" | "insights" | "prediction";
type SectionId = "upload" | "anomalies" | "missing" | "insights" | "predictions" | "chatbot";

const SECTION_IDS: SectionId[] = ["upload", "anomalies", "missing", "insights", "predictions", "chatbot"];

const taskOptions: Array<{ id: TaskId; label: string; description: string }> = [
  { id: "anomaly", label: "Detect Anomalies", description: "Run Isolation Forest on numeric features." },
  { id: "missing_values", label: "Fill Missing Values", description: "Predict and fill null cells using regression." },
  { id: "insights", label: "Generate Insights", description: "Build summary stats, correlations, and charts." },
  { id: "prediction", label: "Predict Next 5 Rows", description: "Forecast the next rows from detected trends." },
];

const defaultTaskState: Record<TaskId, boolean> = {
  anomaly: true,
  missing_values: false,
  insights: true,
  prediction: false,
};

const getErrorMessage = (payload: unknown) => {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof (payload as { error?: unknown }).error === "string") {
    return (payload as { error: string }).error;
  }

  return "Please upload a valid dataset or try again";
};

const formatMetric = (value?: number | null, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }

  return value.toFixed(digits);
};

const formatPercent = (value?: number | null) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "Unavailable";
  }

  return `${(value * 100).toFixed(0)}%`;
};

const badgeClassName = (level?: "low" | "medium" | "high", variant: "anomaly" | "default" = "default") => {
  if (variant === "anomaly") {
    if (level === "high") return "bg-red-100 text-red-700";
    if (level === "medium") return "bg-orange-100 text-orange-700";
    return "bg-yellow-100 text-yellow-700";
  }

  if (level === "high") return "bg-emerald-100 text-emerald-700";
  if (level === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-slate-200 text-slate-700";
};

const MetricCard = ({
  label,
  value,
  helper,
  level,
  variant = "default",
}: {
  label: string;
  value: string;
  helper?: string;
  level?: "low" | "medium" | "high";
  variant?: "anomaly" | "default";
}) => (
  <div className="rounded-[1.5rem] border border-white/65 bg-white/75 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      </div>
      {level ? <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${badgeClassName(level, variant)}`}>{level}</span> : null}
    </div>
    {helper ? <p className="mt-3 text-sm text-slate-500">{helper}</p> : null}
  </div>
);

const MetricList = ({ metrics }: { metrics: ModelMetric[] }) => (
  <div className="grid gap-3">
    {metrics.map((metric) => (
      <div key={metric.column} className="rounded-[1.5rem] border border-slate-200 bg-white/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{metric.column}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{metric.model.replace(/_/g, " ")}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${badgeClassName(metric.confidence_level)}`}>
            {metric.confidence_level || "low"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Prediction Accuracy (R²)</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatMetric(metric.r2_score)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Mean Squared Error</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatMetric(metric.mse, 4)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Confidence</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatPercent(metric.confidence)}</p>
          </div>
        </div>
        {metric.note ? <p className="mt-3 text-sm text-slate-500">{metric.note}</p> : null}
      </div>
    ))}
  </div>
);

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [taskState, setTaskState] = useState<Record<TaskId, boolean>>(defaultTaskState);
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("upload");

  useEffect(() => {
    document.title = "AI Dataset Analyzer";
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);

        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id as SectionId);
        }
      },
      {
        rootMargin: "-35% 0px -45% 0px",
        threshold: [0.2, 0.4, 0.6],
      },
    );

    SECTION_IDS.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, []);

  const selectedTasks = useMemo(
    () => Object.entries(taskState).filter(([, selected]) => selected).map(([task]) => task as TaskId),
    [taskState],
  );

  const displayDataset: TableRow[] = useMemo(() => {
    if (result?.missing_values?.updated_dataset) {
      return result.missing_values.updated_dataset;
    }

    if (result?.dataset_preview?.length) {
      return result.dataset_preview;
    }

    return [];
  }, [result]);

  const anomalyIndices = result?.anomalies?.anomaly_indices || [];
  const missingMetrics = result?.missing_values?.column_metrics || [];
  const predictionMetrics = result?.predictions?.column_metrics || [];
  const topMetrics = [
    result?.missing_values?.summary?.average_r2_score !== undefined
      ? {
          label: "Model Accuracy",
          value: formatMetric(result?.missing_values?.summary?.average_r2_score),
          helper: "Average R² across evaluated missing-value models.",
        }
      : null,
    result?.predictions?.confidence !== undefined
      ? {
          label: "Prediction Confidence",
          value: formatPercent(result?.predictions?.confidence),
          helper: "Computed from holdout error across predictive columns.",
          level: result?.predictions?.confidence_level,
          variant: "default" as const,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; value: string; helper?: string; level?: "low" | "medium" | "high"; variant?: "anomaly" | "default" }>;

  const handleNavigate = (sectionId: SectionId) => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(sectionId);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setErrorMessage(null);
  };

  const toggleTask = (taskId: TaskId) => {
    setTaskState((current) => ({
      ...current,
      [taskId]: !current[taskId],
    }));
  };

  const handleProcess = async () => {
    if (!file) {
      setErrorMessage("Please upload a valid dataset or try again");
      return;
    }

    if (selectedTasks.length === 0) {
      setErrorMessage("Select at least one task before processing");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("selected_tasks", JSON.stringify(selectedTasks));

      const response = await fetch("http://127.0.0.1:8000/process-dataset", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as ProcessResponse;

      if (!response.ok || payload.error) {
        throw new Error(getErrorMessage(payload));
      }

      setResult(payload);
      setAnalysisId(payload.analysis_id);
      requestAnimationFrame(() => handleNavigate("anomalies"));
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Please upload a valid dataset or try again";
      setErrorMessage(message || "Please upload a valid dataset or try again");
      setResult(null);
      setAnalysisId(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="pb-16 pt-28">
      <Navbar activeSection={activeSection} onNavigate={handleNavigate} />

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:px-8">
        <section id="upload" className="result-fade-in rounded-[2.25rem] border border-white/60 bg-white/80 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <span className="inline-flex rounded-full bg-sky-100 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
                AI Dataset Analyzer
              </span>
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Upload data, select tasks, and review intelligent results.</h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                  Analyze anomalies, fill missing values, generate insights, forecast the next rows, and ask questions about the real computed output.
                </p>
              </div>
            </div>

            <div className="grid w-full max-w-xl gap-3 rounded-[1.75rem] bg-slate-950 px-5 py-5 text-sm text-slate-100 shadow-xl">
              <p className="font-semibold uppercase tracking-[0.2em] text-slate-300">Workflow</p>
              <p>1. Upload a CSV dataset.</p>
              <p>2. Choose the ML tasks you want to run.</p>
              <p>3. Process and review charts, tables, and explanations.</p>
            </div>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4 rounded-[1.75rem] border border-slate-200 bg-slate-50/85 p-6">
              <div>
                <label htmlFor="dataset-upload" className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Upload CSV
                </label>
                <input
                  id="dataset-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="mt-3 block w-full rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 file:mr-4 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-700"
                />
                <p className="mt-3 text-sm text-slate-500">{file ? `Selected file: ${file.name}` : "Choose a CSV file to begin."}</p>
              </div>

              {errorMessage ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={isLoading}
                  className="inline-flex items-center gap-3 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {isLoading ? (
                    <>
                      <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Processing dataset...
                    </>
                  ) : (
                    "Process"
                  )}
                </button>
                {analysisId ? (
                  <span className="rounded-full bg-emerald-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Analysis Ready
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-3 rounded-[1.75rem] border border-slate-200 bg-white/85 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Select Tasks</p>
              {taskOptions.map((task) => (
                <label
                  key={task.id}
                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-white"
                >
                  <input
                    type="checkbox"
                    checked={taskState[task.id]}
                    onChange={() => toggleTask(task.id)}
                    className="mt-1 size-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{task.label}</span>
                    <span className="mt-1 block text-sm text-slate-500">{task.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {topMetrics.length > 0 ? (
          <section className="result-fade-in grid gap-4 md:grid-cols-2">
            {topMetrics.map((metric) => (
              <MetricCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} level={metric.level} variant={metric.variant} />
            ))}
          </section>
        ) : null}

        <section id="anomalies" className="result-fade-in space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Anomalies</h2>
              <p className="mt-1 text-sm text-slate-500">Isolation Forest results and flagged rows.</p>
            </div>
          </div>
          {result?.anomalies ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard
                  label="Average Anomaly Confidence"
                  value={formatPercent(result.anomalies.summary?.average_confidence)}
                  helper={`${result.anomalies.summary?.count || 0} flagged rows with normalized Isolation Forest confidence.`}
                  level={result.anomalies.summary?.confidence_level}
                  variant="anomaly"
                />
                <MetricCard
                  label="Maximum Anomaly Confidence"
                  value={formatPercent(result.anomalies.summary?.max_confidence)}
                  helper="Highest normalized anomaly score found in the dataset."
                  level={result.anomalies.summary?.confidence_level}
                  variant="anomaly"
                />
              </div>
              <DataTable
                title="Anomaly Summary"
                rows={result.anomalies.anomaly_rows.map((row) => ({
                  ...((row.row_data || {}) as TableRow),
                  row_index: row.row_index,
                  label: row.label,
                  anomaly_score: row.anomaly_score ?? null,
                  confidence: row.confidence ?? null,
                  confidence_level: row.confidence_level ?? "low",
                }))}
                anomalyRowIndices={result.anomalies.anomaly_indices}
                emptyMessage="No anomalies detected."
              />
            </>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center text-slate-500 backdrop-blur-xl">
              Run anomaly detection to populate this section.
            </div>
          )}
        </section>

        <section id="missing" className="result-fade-in space-y-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Missing Values</h2>
            <p className="mt-1 text-sm text-slate-500">Updated dataset after regression-based filling.</p>
          </div>
          <DataTable
            title="Updated Dataset"
            rows={displayDataset}
            anomalyRowIndices={anomalyIndices}
            emptyMessage="Process missing values or anomalies to inspect dataset rows."
          />
          {result?.missing_values ? (
            <div className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Missing Value Model Performance</h3>
                  <p className="mt-1 text-sm text-slate-500">Per-column evaluation metrics computed from known rows only.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                    Avg R²: {formatMetric(result.missing_values.summary?.average_r2_score)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                    Avg Confidence: {formatPercent(result.missing_values.summary?.average_confidence)}
                  </span>
                </div>
              </div>
              {missingMetrics.length > 0 ? <MetricList metrics={missingMetrics} /> : <p className="text-sm text-slate-500">No columns required missing-value prediction.</p>}
            </div>
          ) : null}
        </section>

        <section id="insights" className="result-fade-in space-y-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Insights</h2>
            <p className="mt-1 text-sm text-slate-500">Summary statistics and chart-ready views from the real dataset.</p>
          </div>
          {result?.insights ? (
            <ChartPanel insights={result.insights} />
          ) : (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center text-slate-500 backdrop-blur-xl">
              Run the insights task to view distributions and correlations.
            </div>
          )}
        </section>

        <section id="predictions" className="result-fade-in space-y-4">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900">Predictions</h2>
            <p className="mt-1 text-sm text-slate-500">Predicted Rows</p>
          </div>
          {result?.predictions ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <MetricCard
                  label="Prediction Confidence"
                  value={formatPercent(result.predictions.confidence)}
                  helper="Confidence derived from holdout prediction error."
                  level={result.predictions.confidence_level}
                />
                <MetricCard
                  label="Model Accuracy (R²)"
                  value={formatMetric(result.predictions.model_score)}
                  helper="Average R² across predictive numeric columns."
                  level={result.predictions.confidence_level}
                />
              </div>
              <DataTable title="Predicted Rows" rows={result.predictions.rows} emptyMessage="No predicted rows returned." />
              <div className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="mb-5">
                  <h3 className="text-2xl font-semibold tracking-tight text-slate-900">Prediction Model Performance</h3>
                  <p className="mt-1 text-sm text-slate-500">Column-level accuracy and confidence for the next-row forecasting model.</p>
                </div>
                {predictionMetrics.length > 0 ? <MetricList metrics={predictionMetrics} /> : <p className="text-sm text-slate-500">No numeric columns were available for prediction.</p>}
              </div>
            </>
          ) : (
            <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white/70 px-6 py-12 text-center text-slate-500 backdrop-blur-xl">
              Run the prediction task to generate the next 5 rows.
            </div>
          )}
        </section>

        <section id="chatbot" className="result-fade-in">
          <ChatPanel analysisId={analysisId} />
        </section>
      </main>
    </div>
  );
}

export default App;
