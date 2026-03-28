import type { FC } from "react";
import type { TableRow, TableValue } from "../types";

type DataTableProps = {
  title: string;
  rows: TableRow[];
  anomalyRowIndices?: number[];
  emptyMessage?: string;
};

const isPredictedValue = (value: TableValue): value is { value: string | number | boolean | null; is_predicted?: boolean } => {
  return typeof value === "object" && value !== null && "value" in value;
};

const formatValue = (value: string | number | boolean | null) => {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toFixed(4).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1") : String(value);
  }

  return String(value);
};

const levelBadgeClassName = (level: string, variant: "anomaly" | "default" = "default") => {
  if (variant === "anomaly") {
    if (level === "high") return "bg-red-100 text-red-700";
    if (level === "medium") return "bg-orange-100 text-orange-700";
    return "bg-yellow-100 text-yellow-700";
  }

  if (level === "high") return "bg-emerald-100 text-emerald-700";
  if (level === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-slate-200 text-slate-700";
};

const DataTable: FC<DataTableProps> = ({ title, rows, anomalyRowIndices = [], emptyMessage = "No rows available." }) => {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const anomalySet = new Set(anomalyRowIndices);

  return (
    <section className="rounded-[2rem] border border-white/65 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{rows.length} rows</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[1.5rem] border border-slate-200/80">
          <div className="max-h-[28rem] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 bg-white">
              <thead className="sticky top-0 bg-slate-100/95 backdrop-blur">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.16em] text-slate-600"
                    >
                      {column}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.16em] text-slate-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const isAnomaly = anomalySet.has(row.row_index);

                  return (
                    <tr
                      key={`${title}-${row.row_index}`}
                      className={`transition duration-200 hover:bg-slate-50 ${
                        isAnomaly ? "bg-[#ffe6e6] text-red-900 hover:bg-[#ffd6d6]" : ""
                      }`}
                    >
                      {columns.map((column) => {
                        const rawValue = row[column];
                        const predicted = isPredictedValue(rawValue);
                        const value = predicted ? rawValue.value : rawValue;
                        const isConfidenceLevel = column === "confidence_level" && typeof value === "string";
                        const isStatusLevel = column === "status_level" && typeof value === "string";
                        const badgeVariant = column === "confidence_level" ? "anomaly" : "default";

                        return (
                          <td key={`${row.row_index}-${column}`} className="px-4 py-3 align-top text-sm text-slate-700">
                            <div className="flex flex-wrap items-center gap-2">
                              {isConfidenceLevel || isStatusLevel ? (
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${levelBadgeClassName(
                                    String(value),
                                    badgeVariant,
                                  )}`}
                                >
                                  {formatValue(value)}
                                </span>
                              ) : (
                                <span className={predicted ? "italic text-amber-600" : undefined}>{formatValue(value)}</span>
                              )}
                              {predicted ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                  Predicted
                                </span>
                              ) : null}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-sm">
                        {isAnomaly ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            Anomaly
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default DataTable;
