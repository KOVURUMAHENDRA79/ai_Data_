import json
import math
import uuid
from collections import Counter
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler


ALLOWED_TASKS = {"anomaly", "missing_values", "insights", "prediction"}


def _safe_metric(value: Any) -> Optional[float]:
    if value is None:
        return None

    numeric_value = float(value)
    if math.isnan(numeric_value) or math.isinf(numeric_value):
        return None

    return numeric_value


def _mean_or_none(values: List[Optional[float]]) -> Optional[float]:
    numeric_values = [float(value) for value in values if value is not None]
    if not numeric_values:
        return None
    return float(np.mean(numeric_values))


def _confidence_from_rmse(target_values: np.ndarray, rmse: Optional[float]) -> Optional[float]:
    if rmse is None:
        return None

    scale = float(np.std(target_values))
    if scale <= 0:
        scale = float(np.mean(np.abs(target_values))) if len(target_values) else 0.0

    if scale <= 0:
        return 1.0 if rmse == 0 else 0.0

    return float(scale / (scale + rmse))


def _dynamic_level(values: List[Optional[float]], target: Optional[float]) -> str:
    numeric_values = np.array([float(value) for value in values if value is not None], dtype=float)
    if target is None or numeric_values.size == 0:
        return "low"

    if numeric_values.size == 1:
        if target <= 0:
            return "low"
        return "high"

    lower = float(np.quantile(numeric_values, 1 / 3))
    upper = float(np.quantile(numeric_values, 2 / 3))

    if target <= lower:
        return "low"
    if target <= upper:
        return "medium"
    return "high"


def _evaluate_regression_split(
    features: pd.DataFrame,
    target: pd.Series,
    *,
    shuffle: bool,
) -> Dict[str, Optional[float] | str]:
    evaluation_frame = features.copy()
    evaluation_frame["target"] = target
    evaluation_frame = evaluation_frame.dropna()

    if len(evaluation_frame) < 4:
        return {
            "r2_score": None,
            "mse": None,
            "confidence": None,
            "note": "Not enough known rows for train/test evaluation.",
        }

    test_size = max(2, int(math.ceil(len(evaluation_frame) * 0.2)))
    if len(evaluation_frame) - test_size < 2:
        test_size = len(evaluation_frame) // 2

    if test_size < 2 or len(evaluation_frame) - test_size < 2:
        return {
            "r2_score": None,
            "mse": None,
            "confidence": None,
            "note": "Dataset is too small for a stable regression split.",
        }

    split_kwargs: Dict[str, Any] = {
        "test_size": test_size,
        "shuffle": shuffle,
    }
    if shuffle:
        split_kwargs["random_state"] = 42

    x_train, x_test, y_train, y_test = train_test_split(
        evaluation_frame.drop(columns=["target"]),
        evaluation_frame["target"],
        **split_kwargs,
    )

    if len(y_train) < 2 or len(y_test) < 2:
        return {
            "r2_score": None,
            "mse": None,
            "confidence": None,
            "note": "Train/test split did not leave enough rows for evaluation.",
        }

    model = LinearRegression()
    model.fit(x_train, y_train)
    predictions = model.predict(x_test)

    mse_value = _safe_metric(mean_squared_error(y_test, predictions))
    rmse_value = math.sqrt(mse_value) if mse_value is not None else None
    r2_value = _safe_metric(r2_score(y_test, predictions)) if float(np.var(y_test)) > 0 else None

    return {
        "r2_score": r2_value,
        "mse": mse_value,
        "confidence": _confidence_from_rmse(y_test.to_numpy(dtype=float), rmse_value),
        "note": "Computed from a holdout split of known values.",
    }


def parse_selected_tasks(raw_value: str) -> List[str]:
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise ValueError("selected_tasks must be a JSON array of task names.") from exc

    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
        raise ValueError("selected_tasks must be a JSON array of strings.")

    normalized = [item.strip() for item in parsed if item.strip()]
    invalid = [item for item in normalized if item not in ALLOWED_TASKS]
    if invalid:
        raise ValueError(f"Unsupported tasks: {', '.join(sorted(set(invalid)))}")

    if not normalized:
        raise ValueError("At least one task must be selected.")

    return list(dict.fromkeys(normalized))


def sanitize_for_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): sanitize_for_json(val) for key, val in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        if math.isnan(float(value)) or math.isinf(float(value)):
            return None
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if isinstance(value, pd.Timedelta):
        return str(value)
    if value is pd.NA or value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def dataframe_to_records(df: pd.DataFrame, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    target_df = df.head(limit) if limit else df
    records: List[Dict[str, Any]] = []
    for row_index, row in target_df.iterrows():
        row_record = {"row_index": int(row_index)}
        row_record.update(row.to_dict())
        records.append(row_record)
    return sanitize_for_json(records)


def load_dataframe_from_bytes(file_bytes: bytes) -> pd.DataFrame:
    if not file_bytes:
        raise ValueError("Uploaded file is empty.")

    try:
        df = pd.read_csv(pd.io.common.BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError("Unable to read CSV file. Please upload a valid CSV.") from exc

    if df.empty:
        raise ValueError("Dataset is empty.")

    cleaned_columns = [str(column).strip() or f"column_{index}" for index, column in enumerate(df.columns)]
    df.columns = cleaned_columns
    return df


def _estimate_contamination(numeric_df: pd.DataFrame) -> float:
    row_outlier_mask = pd.Series(False, index=numeric_df.index)

    for column in numeric_df.columns:
        series = numeric_df[column].dropna()
        if len(series) < 4:
            continue

        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        if iqr == 0:
            continue

        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        row_outlier_mask = row_outlier_mask | ((numeric_df[column] < lower_bound) | (numeric_df[column] > upper_bound)).fillna(False)

    estimated_ratio = float(row_outlier_mask.mean()) if len(row_outlier_mask) else 0.0
    if estimated_ratio <= 0:
        estimated_ratio = 1 / max(len(numeric_df), 10)

    return min(0.05, max(0.01, estimated_ratio))


def _clean_numeric_anomaly_features(numeric_df: pd.DataFrame) -> pd.DataFrame:
    cleaned_df = numeric_df.copy()
    zero_as_missing_columns = ["Glucose", "BloodPressure", "SkinThickness", "Insulin", "BMI"]

    for column in zero_as_missing_columns:
        if column in cleaned_df.columns:
            cleaned_df[column] = cleaned_df[column].replace(0, np.nan)

    return cleaned_df


def _fit_isolation_forest_with_safeguards(filled_df: pd.DataFrame) -> Tuple[IsolationForest, np.ndarray, np.ndarray, float]:
    if len(filled_df) < 20:
        contamination = min(0.1, _estimate_contamination(filled_df))
    else:
        contamination = _estimate_contamination(filled_df)

    contamination = min(contamination, 0.15)

    scaler = StandardScaler()
    scaled_data = scaler.fit_transform(filled_df)

    model = IsolationForest(random_state=42, contamination=contamination)
    model.fit(scaled_data)

    raw_labels = model.predict(scaled_data)
    scores = model.decision_function(scaled_data)

    max_allowed_anomalies = max(1, int(math.floor(len(filled_df) * 0.1)))
    detected_anomalies = int(np.sum(raw_labels == -1))

    if len(filled_df) >= 10 and detected_anomalies > max_allowed_anomalies:
        reduced_ratio = max(1 / len(filled_df), contamination / 2)
        reduced_contamination = min(0.15, reduced_ratio)

        if reduced_contamination < contamination:
            contamination = reduced_contamination
            model = IsolationForest(random_state=42, contamination=contamination)
            model.fit(scaled_data)
            raw_labels = model.predict(scaled_data)
            scores = model.decision_function(scaled_data)

    return model, raw_labels, scores, contamination


def run_anomaly_detection(df: pd.DataFrame) -> Dict[str, Any]:
    numeric_df = df.select_dtypes(include=[np.number]).copy()
    if numeric_df.empty:
        return {
            "message": "No numeric columns available for anomaly detection.",
            "anomaly_indices": [],
            "labels": [],
            "scores": [],
            "normalized_scores": [],
            "anomaly_rows": [],
            "summary": {
                "average_confidence": None,
                "max_confidence": None,
                "count": 0,
                "confidence_level": "low",
            },
        }

    cleaned_numeric_df = _clean_numeric_anomaly_features(numeric_df)
    filled_df = cleaned_numeric_df.fillna(cleaned_numeric_df.median(numeric_only=True))
    _, raw_labels, scores, contamination = _fit_isolation_forest_with_safeguards(filled_df)
    anomaly_strength = np.maximum(-scores, 0)
    max_strength = float(np.max(anomaly_strength)) if len(anomaly_strength) else 0.0
    normalized_scores = (anomaly_strength / max_strength).tolist() if max_strength > 0 else [0.0] * len(scores)
    anomaly_rows: List[Dict[str, Any]] = []

    for position, (row_index, label, score, normalized_score) in enumerate(
        zip(df.index.tolist(), raw_labels.tolist(), scores.tolist(), normalized_scores)
    ):
        if label == -1 and normalized_score > 0.7:
            anomaly_rows.append(
                {
                    "row_index": int(row_index),
                    "row_position": position,
                    "label": label,
                    "score": score,
                    "anomaly_score": normalized_score,
                    "confidence": abs(normalized_score),
                    "row_data": {"row_index": int(row_index), **df.iloc[position].to_dict()},
                }
            )

    anomaly_indices = [row["row_index"] for row in anomaly_rows]
    anomaly_confidences = [float(row["confidence"]) for row in anomaly_rows]
    average_confidence = _mean_or_none(anomaly_confidences)

    for row in anomaly_rows:
        row["confidence_level"] = _dynamic_level(anomaly_confidences, row.get("confidence"))

    return sanitize_for_json(
        {
            "numeric_columns": numeric_df.columns.tolist(),
            "contamination": contamination,
            "anomaly_indices": anomaly_indices,
            "labels": raw_labels.tolist(),
            "scores": scores.tolist(),
            "normalized_scores": normalized_scores,
            "anomaly_rows": anomaly_rows,
            "summary": {
                "average_confidence": average_confidence,
                "max_confidence": max(anomaly_confidences) if anomaly_confidences else None,
                "count": len(anomaly_rows),
                "confidence_level": _dynamic_level(anomaly_confidences, average_confidence),
            },
        }
    )


def _prepare_numeric_feature_frame(df: pd.DataFrame, excluded_column: str) -> Tuple[pd.DataFrame, List[str]]:
    numeric_columns = [column for column in df.select_dtypes(include=[np.number]).columns if column != excluded_column]
    if not numeric_columns:
        return pd.DataFrame(index=df.index), []

    feature_df = df[numeric_columns].copy()
    for column in numeric_columns:
        feature_df[column] = feature_df[column].fillna(feature_df[column].median())
    return feature_df, numeric_columns


def run_missing_value_prediction(df: pd.DataFrame) -> Dict[str, Any]:
    working_df = df.copy()
    filled_fields: List[Dict[str, Any]] = []
    column_metrics: List[Dict[str, Any]] = []

    for column in working_df.columns:
        missing_mask = working_df[column].isna()
        if not missing_mask.any():
            continue

        if pd.api.types.is_numeric_dtype(working_df[column]):
            feature_df, feature_columns = _prepare_numeric_feature_frame(working_df, column)
            available_mask = ~missing_mask
            metric_entry: Dict[str, Any] = {
                "column": column,
                "model": "linear_regression" if feature_columns else "median_fallback",
                "r2_score": None,
                "mse": None,
                "confidence": None,
                "missing_count": int(missing_mask.sum()),
            }

            if feature_columns and available_mask.sum() >= 2:
                metric_entry.update(
                    _evaluate_regression_split(feature_df.loc[available_mask, feature_columns], working_df.loc[available_mask, column], shuffle=True)
                )
                model = LinearRegression()
                model.fit(feature_df.loc[available_mask, feature_columns], working_df.loc[available_mask, column])
                predicted_values = model.predict(feature_df.loc[missing_mask, feature_columns])
                working_df.loc[missing_mask, column] = predicted_values
                method = "linear_regression"
            else:
                fallback_value = working_df[column].median()
                working_df.loc[missing_mask, column] = fallback_value
                method = "median_fallback"
                metric_entry["note"] = "Not enough related numeric data for regression; median fallback was used."
        else:
            non_null_values = working_df[column].dropna().astype(str).tolist()
            fallback_value = Counter(non_null_values).most_common(1)[0][0] if non_null_values else "Unknown"
            working_df.loc[missing_mask, column] = fallback_value
            method = "mode_fallback"
            metric_entry = {
                "column": column,
                "model": "mode_fallback",
                "r2_score": None,
                "mse": None,
                "confidence": None,
                "missing_count": int(missing_mask.sum()),
                "note": "Column is non-numeric, so categorical mode fallback was used instead of regression.",
            }

        column_metrics.append(metric_entry)

        for row_index in working_df.index[missing_mask].tolist():
            filled_fields.append(
                {
                    "row_index": int(row_index),
                    "column": column,
                    "value": working_df.at[row_index, column],
                    "method": method,
                }
            )

    metric_confidences = [metric.get("confidence") for metric in column_metrics]
    metric_r2_scores = [metric.get("r2_score") for metric in column_metrics]
    for metric in column_metrics:
        metric["confidence_level"] = _dynamic_level(metric_confidences, metric.get("confidence"))

    return sanitize_for_json(
        {
            "filled_fields": filled_fields,
            "updated_dataset": dataframe_to_records(working_df),
            "remaining_missing": int(working_df.isna().sum().sum()),
            "column_metrics": column_metrics,
            "summary": {
                "average_r2_score": _mean_or_none(metric_r2_scores),
                "average_confidence": _mean_or_none(metric_confidences),
                "evaluated_columns": len([metric for metric in column_metrics if metric.get("r2_score") is not None]),
            },
        }
    )


def _build_histograms(df: pd.DataFrame) -> List[Dict[str, Any]]:
    histograms: List[Dict[str, Any]] = []
    numeric_df = df.select_dtypes(include=[np.number])
    for column in numeric_df.columns:
        values = numeric_df[column].dropna().to_numpy()
        if values.size == 0:
            continue
        bin_count = min(12, max(5, int(np.sqrt(values.size))))
        counts, bin_edges = np.histogram(values, bins=bin_count)
        histograms.append(
            {
                "column": column,
                "counts": counts.tolist(),
                "bin_edges": bin_edges.tolist(),
            }
        )
    return histograms


def _build_scatter_pairs(df: pd.DataFrame) -> List[Dict[str, Any]]:
    numeric_columns = df.select_dtypes(include=[np.number]).columns.tolist()
    pairs: List[Dict[str, Any]] = []
    for first_index in range(len(numeric_columns)):
        for second_index in range(first_index + 1, len(numeric_columns)):
            x_column = numeric_columns[first_index]
            y_column = numeric_columns[second_index]
            pair_df = df[[x_column, y_column]].dropna().head(200)
            if pair_df.empty:
                continue
            pairs.append(
                {
                    "x_column": x_column,
                    "y_column": y_column,
                    "x": pair_df[x_column].tolist(),
                    "y": pair_df[y_column].tolist(),
                }
            )
            if len(pairs) >= 4:
                return pairs
    return pairs


def run_data_insights(df: pd.DataFrame) -> Dict[str, Any]:
    numeric_df = df.select_dtypes(include=[np.number])
    summary_stats = numeric_df.agg(["mean", "std", "min", "max"]).to_dict() if not numeric_df.empty else {}
    correlation_matrix = numeric_df.corr().fillna(0).to_dict() if len(numeric_df.columns) >= 2 else {}
    missing_counts = df.isna().sum().to_dict()
    correlation_pairs: List[Dict[str, Any]] = []

    if len(numeric_df.columns) >= 2:
        for first_index in range(len(numeric_df.columns)):
            for second_index in range(first_index + 1, len(numeric_df.columns)):
                left = numeric_df.columns[first_index]
                right = numeric_df.columns[second_index]
                correlation_value = _safe_metric(numeric_df[[left, right]].corr().iloc[0, 1])
                if correlation_value is None:
                    continue
                correlation_pairs.append(
                    {
                        "pair": [left, right],
                        "correlation": correlation_value,
                        "strength": abs(correlation_value),
                    }
                )

    strongest_correlation = max(correlation_pairs, key=lambda item: item["strength"], default=None)
    strength_values = [pair["strength"] for pair in correlation_pairs]
    if strongest_correlation is not None:
        strongest_correlation["label"] = _dynamic_level(strength_values, strongest_correlation["strength"]).replace("low", "weak").replace(
            "medium", "moderate"
        ).replace("high", "strong")

    chart_data = {
        "histograms": _build_histograms(df),
        "scatter_pairs": _build_scatter_pairs(df),
        "correlation_heatmap": {
            "columns": numeric_df.columns.tolist(),
            "matrix": numeric_df.corr().fillna(0).values.tolist() if len(numeric_df.columns) >= 2 else [],
        },
        "missing_counts": {
            "columns": list(missing_counts.keys()),
            "values": list(missing_counts.values()),
        },
    }

    return sanitize_for_json(
        {
            "summary_statistics": summary_stats,
            "correlation_matrix": correlation_matrix,
            "correlation_summary": strongest_correlation,
            "chart_data": chart_data,
        }
    )


def _find_timestamp_column(df: pd.DataFrame) -> Optional[str]:
    for column in df.columns:
        if df[column].dtype == "object" or pd.api.types.is_datetime64_any_dtype(df[column]):
            parsed = pd.to_datetime(df[column], errors="coerce")
            if parsed.notna().sum() >= max(3, len(df) // 2):
                return column
    return None


def _predict_numeric_columns(time_index: np.ndarray, df: pd.DataFrame, future_index: np.ndarray) -> Tuple[Dict[str, List[float]], List[Dict[str, Any]]]:
    predictions: Dict[str, List[float]] = {}
    column_metrics: List[Dict[str, Any]] = []
    numeric_df = df.select_dtypes(include=[np.number])

    for column in numeric_df.columns:
        column_df = pd.DataFrame({"time_index": time_index.flatten(), "target": numeric_df[column]})
        column_df = column_df.dropna()
        metric_entry: Dict[str, Any] = {
            "column": column,
            "model": "linear_regression",
            "r2_score": None,
            "mse": None,
            "confidence": None,
        }
        if len(column_df) < 2:
            metric_entry["note"] = "Not enough historical rows to fit a prediction model."
            column_metrics.append(metric_entry)
            continue

        metric_entry.update(_evaluate_regression_split(column_df[["time_index"]], column_df["target"], shuffle=False))
        model = LinearRegression()
        model.fit(column_df[["time_index"]], column_df["target"])
        future_frame = pd.DataFrame(future_index, columns=["time_index"])
        predictions[column] = model.predict(future_frame).tolist()
        column_metrics.append(metric_entry)

    metric_confidences = [metric.get("confidence") for metric in column_metrics]
    for metric in column_metrics:
        metric["confidence_level"] = _dynamic_level(metric_confidences, metric.get("confidence"))

    return predictions, column_metrics


def _predicted_value_cell(value: Any) -> Dict[str, Any]:
    return {
        "value": value,
        "is_predicted": True,
    }


def run_next_row_prediction(df: pd.DataFrame) -> Dict[str, Any]:
    timestamp_column = _find_timestamp_column(df)
    future_rows: List[Dict[str, Any]] = []
    start_row_index = int(df.index.max()) + 1 if len(df.index) else 0
    prediction_metrics: List[Dict[str, Any]] = []

    if timestamp_column:
        parsed_timestamps = pd.to_datetime(df[timestamp_column], errors="coerce")
        valid_mask = parsed_timestamps.notna()
        if valid_mask.sum() >= 2:
            reference_df = df.loc[valid_mask].copy().reset_index(drop=True)
            time_values = (parsed_timestamps.loc[valid_mask].astype("int64") // 10**9).to_numpy()
            unique_values = np.sort(np.unique(time_values))
            median_step = int(np.median(np.diff(unique_values))) if len(unique_values) >= 2 else 86400
            if median_step <= 0:
                median_step = 86400

            future_index = np.array([[time_values.max() + median_step * step] for step in range(1, 6)])
            numeric_predictions, prediction_metrics = _predict_numeric_columns(time_values.reshape(-1, 1), reference_df, future_index)
            future_timestamps = [
                pd.to_datetime(int(time_values.max() + median_step * step), unit="s").isoformat()
                for step in range(1, 6)
            ]

            for row_offset in range(5):
                row_data: Dict[str, Any] = {"row_index": start_row_index + row_offset, timestamp_column: future_timestamps[row_offset]}
                for column, values in numeric_predictions.items():
                    row_data[column] = _predicted_value_cell(values[row_offset])
                future_rows.append(row_data)

    if not future_rows:
        sequence_index = np.arange(len(df)).reshape(-1, 1)
        future_index = np.arange(len(df), len(df) + 5).reshape(-1, 1)
        numeric_predictions, prediction_metrics = _predict_numeric_columns(sequence_index, df.reset_index(drop=True), future_index)
        for row_offset in range(5):
            row_data: Dict[str, Any] = {
                "row_index": start_row_index + row_offset,
                "row_number": _predicted_value_cell(int(len(df) + row_offset)),
            }
            for column, values in numeric_predictions.items():
                row_data[column] = _predicted_value_cell(values[row_offset])
            future_rows.append(row_data)

    prediction_confidences = [metric.get("confidence") for metric in prediction_metrics]
    prediction_scores = [metric.get("r2_score") for metric in prediction_metrics]
    overall_confidence = _mean_or_none(prediction_confidences)

    return sanitize_for_json(
        {
            "timestamp_column": timestamp_column,
            "rows": future_rows,
            "predictions": future_rows,
            "confidence": overall_confidence,
            "confidence_level": _dynamic_level(prediction_confidences, overall_confidence),
            "model_score": _mean_or_none(prediction_scores),
            "column_metrics": prediction_metrics,
        }
    )


@dataclass
class AnalysisResult:
    analysis_id: str
    dataset_preview: List[Dict[str, Any]]
    row_count: int
    column_count: int
    results: Dict[str, Any]


def process_dataset(df: pd.DataFrame, selected_tasks: List[str]) -> AnalysisResult:
    results: Dict[str, Any] = {}
    current_df = df.copy()

    if "anomaly" in selected_tasks:
        results["anomalies"] = run_anomaly_detection(current_df)

    if "missing_values" in selected_tasks:
        missing_result = run_missing_value_prediction(current_df)
        results["missing_values"] = missing_result
        current_df = pd.DataFrame(missing_result["updated_dataset"]).set_index("row_index", drop=True)

    if "insights" in selected_tasks:
        results["insights"] = run_data_insights(current_df)

    if "prediction" in selected_tasks:
        results["predictions"] = run_next_row_prediction(current_df)

    return AnalysisResult(
        analysis_id=str(uuid.uuid4()),
        dataset_preview=dataframe_to_records(current_df, limit=10),
        row_count=int(len(current_df)),
        column_count=int(len(current_df.columns)),
        results=results,
    )
