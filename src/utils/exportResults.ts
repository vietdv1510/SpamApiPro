import type { HistoryItem, TestResult } from "../store";

// ─── Export to JSON ───

export function exportResultJson(entry: HistoryItem): void {
  const data = {
    exported_at: new Date().toISOString(),
    url: entry.url,
    method: entry.method,
    mode: entry.mode,
    virtual_users: entry.virtual_users,
    timestamp: entry.timestamp,
    config: entry.config,
    result: entry.result,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `spamapi-${slugify(entry.url)}-${entry.id}.json`);
}

// ─── Export to CSV ───

export function exportResultCsv(entry: HistoryItem): void {
  const r = entry.result;
  const successRate =
    r.total_requests > 0 ? (r.success_count / r.total_requests) * 100 : 0;

  const summaryRows = [
    ["# SpamAPI Pro — Test Result Export"],
    ["Exported At", new Date().toISOString()],
    ["URL", entry.url],
    ["Method", entry.method],
    ["Mode", entry.mode],
    ["Virtual Users", String(entry.virtual_users)],
    ["Timestamp", entry.timestamp],
    [],
    ["# Summary Metrics"],
    ["Total Requests", String(r.total_requests)],
    ["Success Count", String(r.success_count)],
    ["Error Count", String(r.error_count)],
    ["Success Rate (%)", successRate.toFixed(2)],
    ["RPS", r.requests_per_second.toFixed(2)],
    ["Total Duration (ms)", r.total_duration_ms.toFixed(2)],
    [],
    ["# Latency (ms)"],
    ["Min", r.latency_min_ms.toFixed(2)],
    ["Avg", r.latency_avg_ms.toFixed(2)],
    ["P50", r.latency_p50_ms.toFixed(2)],
    ["P90", r.latency_p90_ms.toFixed(2)],
    ["P95", r.latency_p95_ms.toFixed(2)],
    ["P99", r.latency_p99_ms.toFixed(2)],
    ["P99.9", r.latency_p999_ms.toFixed(2)],
    ["Max", r.latency_max_ms.toFixed(2)],
    [],
    ["# Timeline (individual requests)"],
    [
      "id",
      "success",
      "status_code",
      "latency_ms",
      "response_size_bytes",
      "timestamp_ms",
      "error",
    ],
    ...r.timeline.map((t) => [
      String(t.id),
      String(t.success),
      String(t.status_code ?? ""),
      String(t.latency_ms),
      String(t.response_size_bytes),
      String(t.timestamp_ms),
      t.error ?? "",
    ]),
  ];

  const csv = summaryRows
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `spamapi-${slugify(entry.url)}-${entry.id}.csv`);
}

// ─── Export multiple results to CSV (for Compare) ───

export function exportComparisonCsv(a: HistoryItem, b: HistoryItem): void {
  const rows = [
    ["# SpamAPI Pro — Comparison Export"],
    ["Exported At", new Date().toISOString()],
    [],
    ["Metric", "Run A", "Run B", "Delta", "Delta %"],
    ...comparisonRows(a.result, b.result),
  ];
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `spamapi-compare-${a.id}-vs-${b.id}.csv`);
}

/** Returns comparison rows for two results */
export function comparisonRows(a: TestResult, b: TestResult): string[][] {
  const metric = (
    label: string,
    getA: (r: TestResult) => number,
    getB: (r: TestResult) => number,
    fmt: (v: number) => string = (v) => v.toFixed(2),
  ) => {
    const va = getA(a);
    const vb = getB(b);
    const delta = vb - va;
    const pct = va !== 0 ? ((delta / va) * 100).toFixed(1) + "%" : "—";
    return [label, fmt(va), fmt(vb), fmt(delta), pct];
  };

  return [
    metric(
      "Total Requests",
      (r) => r.total_requests,
      (r) => r.total_requests,
      String,
    ),
    metric(
      "Success Count",
      (r) => r.success_count,
      (r) => r.success_count,
      String,
    ),
    metric(
      "Error Count",
      (r) => r.error_count,
      (r) => r.error_count,
      String,
    ),
    metric(
      "Success Rate (%)",
      (r) =>
        r.total_requests > 0 ? (r.success_count / r.total_requests) * 100 : 0,
      (r) =>
        r.total_requests > 0 ? (r.success_count / r.total_requests) * 100 : 0,
      (v) => v.toFixed(1) + "%",
    ),
    metric(
      "RPS",
      (r) => r.requests_per_second,
      (r) => r.requests_per_second,
      (v) => v.toFixed(0),
    ),
    metric(
      "Latency Min (ms)",
      (r) => r.latency_min_ms,
      (r) => r.latency_min_ms,
    ),
    metric(
      "Latency Avg (ms)",
      (r) => r.latency_avg_ms,
      (r) => r.latency_avg_ms,
    ),
    metric(
      "Latency P50 (ms)",
      (r) => r.latency_p50_ms,
      (r) => r.latency_p50_ms,
    ),
    metric(
      "Latency P95 (ms)",
      (r) => r.latency_p95_ms,
      (r) => r.latency_p95_ms,
    ),
    metric(
      "Latency P99 (ms)",
      (r) => r.latency_p99_ms,
      (r) => r.latency_p99_ms,
    ),
    metric(
      "Latency Max (ms)",
      (r) => r.latency_max_ms,
      (r) => r.latency_max_ms,
    ),
    metric(
      "Duration (ms)",
      (r) => r.total_duration_ms,
      (r) => r.total_duration_ms,
    ),
    metric(
      "Race Conditions",
      (r) => r.race_conditions_detected,
      (r) => r.race_conditions_detected,
      String,
    ),
  ];
}

// ─── Helpers ───

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function slugify(url: string): string {
  try {
    const u = new URL(url);
    return (u.hostname + u.pathname)
      .replace(/[^a-z0-9]/gi, "-")
      .replace(/-+/g, "-")
      .slice(0, 40);
  } catch {
    return url.replace(/[^a-z0-9]/gi, "-").slice(0, 40);
  }
}
