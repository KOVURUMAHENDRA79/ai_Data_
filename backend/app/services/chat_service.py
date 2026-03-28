from typing import Any, Dict, List


class ChatServiceError(Exception):
    pass


def ask_dataset_question(processed_results: Dict[str, Any], question: str) -> Dict[str, Any]:
    if not processed_results:
        raise ChatServiceError("No processed dataset results are available yet.")

    normalized_question = question.strip().lower()
    if not normalized_question:
        raise ChatServiceError("Please enter a question.")

    if any(keyword in normalized_question for keyword in ["anomaly", "anomalies", "outlier", "outliers"]):
        return _answer_anomalies(processed_results)
    if any(keyword in normalized_question for keyword in ["prediction", "predictions", "future", "forecast", "next"]):
        return _answer_predictions(processed_results)
    if any(keyword in normalized_question for keyword in ["missing", "null", "impute", "filled"]):
        return _answer_missing_values(processed_results)
    if any(keyword in normalized_question for keyword in ["insight", "summary", "correlation", "pattern", "statistics"]):
        return _answer_insights(processed_results)

    return _answer_overview(processed_results)


def _answer_anomalies(processed_results: Dict[str, Any]) -> Dict[str, Any]:
    anomalies = processed_results.get("anomalies") or {}
    anomaly_rows = anomalies.get("anomaly_rows") or []
    if not anomaly_rows:
        return {
            "answer": "No anomaly results are available, or no rows were flagged as anomalies in the processed dataset.",
            "details": [],
        }

    sorted_rows = sorted(anomaly_rows, key=lambda row: row.get("score", 0))
    strongest = sorted_rows[0]
    row_data = strongest.get("row_data") or {}
    row_summary = _format_key_values(row_data)

    answer = (
        f"{len(anomaly_rows)} anomaly rows were detected. "
        f"The strongest anomaly is row {strongest.get('row_index')} with score {strongest.get('score'):.4f}, "
        f"which means it is farther from the normal pattern than the rest of the dataset."
    )

    details = [
        f"Detected anomaly row indices: {', '.join(str(row.get('row_index')) for row in sorted_rows)}",
        f"Strongest anomaly row values: {row_summary}" if row_summary else "Strongest anomaly row values were not stored.",
    ]

    for row in sorted_rows[1:4]:
        row_values = _format_key_values(row.get("row_data") or {})
        details.append(
            f"Row {row.get('row_index')} also looks unusual with score {row.get('score'):.4f}."
            + (f" Values: {row_values}" if row_values else "")
        )

    return {"answer": answer, "details": details}


def _answer_predictions(processed_results: Dict[str, Any]) -> Dict[str, Any]:
    predictions = processed_results.get("predictions") or {}
    rows = predictions.get("rows") or []
    if not rows:
        return {
            "answer": "Prediction results are not available for this dataset.",
            "details": [],
        }

    numeric_columns = _extract_numeric_columns(rows)
    trend_details: List[str] = []
    summary_parts: List[str] = []

    for column in numeric_columns[:4]:
        values = [_unwrap_numeric(row.get(column)) for row in rows]
        values = [value for value in values if value is not None]
        if len(values) < 2:
            continue
        direction = "upward" if values[-1] > values[0] else "downward" if values[-1] < values[0] else "flat"
        summary_parts.append(f"{column} shows a {direction} trend")
        trend_details.append(f"{column}: {', '.join(f'{value:.2f}' for value in values)}")

    answer = (
        "Prediction results were generated from the processed dataset. "
        + ("; ".join(summary_parts) + "." if summary_parts else "The forecast contains the next computed rows.")
    )

    details = trend_details or [f"Predicted rows: {rows}"]
    return {"answer": answer, "details": details}


def _answer_missing_values(processed_results: Dict[str, Any]) -> Dict[str, Any]:
    missing_values = processed_results.get("missing_values") or {}
    filled_fields = missing_values.get("filled_fields") or []
    if not filled_fields:
        return {
            "answer": "No missing-value filling results are available, or the dataset did not contain missing values.",
            "details": [],
        }

    method_counts: Dict[str, int] = {}
    for field in filled_fields:
        method = str(field.get("method", "unknown"))
        method_counts[method] = method_counts.get(method, 0) + 1

    top_examples = filled_fields[:5]
    answer = (
        f"{len(filled_fields)} missing values were filled using the processed dataset context. "
        f"Methods used: {', '.join(f'{method} ({count})' for method, count in method_counts.items())}."
    )
    details = [
        f"Row {item.get('row_index')} column {item.get('column')} was filled with {item.get('value')} using {item.get('method')}"
        for item in top_examples
    ]
    remaining_missing = missing_values.get("remaining_missing")
    if remaining_missing is not None:
        details.append(f"Remaining missing cells after filling: {remaining_missing}")

    return {"answer": answer, "details": details}


def _answer_insights(processed_results: Dict[str, Any]) -> Dict[str, Any]:
    insights = processed_results.get("insights") or {}
    summary_statistics = insights.get("summary_statistics") or {}
    correlation_matrix = insights.get("correlation_matrix") or {}

    if not summary_statistics and not correlation_matrix:
        return {
            "answer": "Insight results are not available for this dataset.",
            "details": [],
        }

    stats_details = []
    for column, stats in list(summary_statistics.items())[:4]:
        stats_details.append(
            f"{column}: mean={_fmt(stats.get('mean'))}, std={_fmt(stats.get('std'))}, min={_fmt(stats.get('min'))}, max={_fmt(stats.get('max'))}"
        )

    correlation_details = _top_correlations(correlation_matrix)
    answer = "Summary statistics and correlation patterns were generated from the processed dataset."
    details = stats_details + correlation_details
    return {"answer": answer, "details": details}


def _answer_overview(processed_results: Dict[str, Any]) -> Dict[str, Any]:
    available_sections = [
        section
        for section in ["anomalies", "missing_values", "insights", "predictions"]
        if processed_results.get(section)
    ]
    if not available_sections:
        return {
            "answer": "No processed dataset results are available to answer the question yet.",
            "details": [],
        }

    details = []
    if processed_results.get("anomalies"):
        anomaly_count = len((processed_results.get("anomalies") or {}).get("anomaly_rows") or [])
        details.append(f"Anomaly detection found {anomaly_count} flagged rows.")
    if processed_results.get("missing_values"):
        filled_count = len((processed_results.get("missing_values") or {}).get("filled_fields") or [])
        details.append(f"Missing-value filling updated {filled_count} cells.")
    if processed_results.get("insights"):
        details.append("Insight statistics and correlations are available.")
    if processed_results.get("predictions"):
        prediction_count = len((processed_results.get("predictions") or {}).get("rows") or [])
        details.append(f"Prediction output contains {prediction_count} future rows.")

    return {
        "answer": "The chatbot can explain anomalies, predictions, missing values, and insights from the processed dataset.",
        "details": details,
    }


def _extract_numeric_columns(rows: List[Dict[str, Any]]) -> List[str]:
    if not rows:
        return []
    columns = []
    for key in rows[0].keys():
        if any(_unwrap_numeric(row.get(key)) is not None for row in rows):
            columns.append(key)
    return columns


def _unwrap_numeric(value: Any):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, dict) and value.get("is_predicted") and isinstance(value.get("value"), (int, float)):
        return float(value["value"])
    return None


def _top_correlations(correlation_matrix: Dict[str, Dict[str, Any]]) -> List[str]:
    pairs = []
    seen = set()
    for left, inner in correlation_matrix.items():
        for right, value in inner.items():
            if left == right:
                continue
            pair_key = tuple(sorted((left, right)))
            if pair_key in seen or not isinstance(value, (int, float)):
                continue
            seen.add(pair_key)
            pairs.append((abs(float(value)), left, right, float(value)))

    pairs.sort(reverse=True)
    return [
        f"Correlation between {left} and {right}: {value:.4f}"
        for _, left, right, value in pairs[:4]
    ]


def _format_key_values(row_data: Dict[str, Any]) -> str:
    if not row_data:
        return ""
    return ", ".join(f"{key}={value}" for key, value in row_data.items())


def _fmt(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"{float(value):.4f}"
    return str(value)