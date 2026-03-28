export type Primitive = string | number | boolean | null;

export type PredictedValue = {
  value: Primitive;
  is_predicted?: boolean;
};

export type TableValue = Primitive | PredictedValue;

export type TableRow = {
  row_index: number;
  [key: string]: TableValue;
};

export type AnomalyRow = {
  row_index: number;
  row_position: number;
  label: number;
  score: number;
  anomaly_score?: number;
  confidence?: number;
  confidence_level?: "low" | "medium" | "high";
  row_data?: TableRow;
};

export type AnomaliesResult = {
  numeric_columns?: string[];
  labels: number[];
  scores: number[];
  normalized_scores?: number[];
  anomaly_indices: number[];
  anomaly_rows: AnomalyRow[];
  summary?: {
    average_confidence?: number | null;
    max_confidence?: number | null;
    count: number;
    confidence_level?: "low" | "medium" | "high";
  };
};

export type ModelMetric = {
  column: string;
  model: string;
  r2_score?: number | null;
  mse?: number | null;
  confidence?: number | null;
  confidence_level?: "low" | "medium" | "high";
  missing_count?: number;
  note?: string;
};

export type MissingValuesResult = {
  updated_dataset: TableRow[];
  filled_fields: Array<{
    row_index: number;
    column: string;
    value: Primitive;
    method: string;
  }>;
  remaining_missing?: number;
  column_metrics?: ModelMetric[];
  summary?: {
    average_r2_score?: number | null;
    average_confidence?: number | null;
    evaluated_columns: number;
  };
};

export type SummaryStats = Record<
  string,
  {
    mean: number;
    std: number;
    min: number;
    max: number;
  }
>;

export type InsightsResult = {
  summary_statistics: SummaryStats;
  correlation_matrix: Record<string, Record<string, number>>;
  correlation_summary?: {
    pair: [string, string];
    correlation: number;
    strength: number;
    label: "weak" | "moderate" | "strong";
  } | null;
  chart_data: {
    histograms: Array<{
      column: string;
      counts: number[];
      bin_edges: number[];
    }>;
    scatter_pairs: Array<{
      x_column: string;
      y_column: string;
      x: number[];
      y: number[];
    }>;
    correlation_heatmap: {
      columns: string[];
      matrix: number[][];
    };
    missing_counts: {
      columns: string[];
      values: number[];
    };
  };
};

export type PredictionsResult = {
  timestamp_column?: string | null;
  rows: TableRow[];
  predictions?: TableRow[];
  confidence?: number | null;
  confidence_level?: "low" | "medium" | "high";
  model_score?: number | null;
  column_metrics?: ModelMetric[];
};

export type ProcessResponse = {
  analysis_id: string;
  dataset_preview: TableRow[];
  row_count: number;
  column_count: number;
  anomalies?: AnomaliesResult;
  missing_values?: MissingValuesResult;
  insights?: InsightsResult;
  predictions?: PredictionsResult;
  error?: string;
};

export type ChatResponse = {
  answer?: string;
  details?: string[];
  error?: string;
};
